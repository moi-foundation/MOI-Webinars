# Session 6 — One Wallet, Many Agents: Context Inheritance

Live-demo repo for **MOI Builders Session 6**. One wallet, many AI agents — each with its **own inherited on-chain identity** and an **on-chain-enforced budget**.

On MOI, app-specific data lives on the account, not in the logic. A plain account has no storage slice under a logic, so state-changing calls revert. **Context inheritance** fixes that: one `AccountInherit` transaction creates a sub-account, links it to a logic, and seeds it with gas. After that, the account has actor state and can participate.

This session makes that concrete: deploy `AgentBudget`, provision agents under it, watch them spend from their own budgets, and hit a spend cap that the **contract** enforces — not the app.

## What you build

1. **Coco logic** — `AgentBudget`: per-account `budget` and `spent` in actor state; `RecordSpend` reverts if a spend would exceed the budget.
2. **Squad manager** — `squad.js`: derive sub-account addresses, inherit them under the logic, set budgets, record spends, and report per-agent ledgers from chain.
3. **Pip** — `agent.js`: a chat agent that discovers its on-chain identity, inspects accounts, and provisions itself via `AccountInherit`.

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Dependencies** — run once inside `session-6/`:
   ```bash
   npm install
   ```
3. **Wallet**:
   ```bash
   cp .env.example .env
   # edit USER_MNEMONIC — fund at https://voyage.moi.technology
   ```
   The default derivation path (`m/44'/6174'/7020'/0/0`) is the Voyage faucet index. MOI devnet is keyless via `VoyageProvider('devnet')` — no local node required.
4. **Coco toolchain 0.8.0+** — <https://cocolang.dev/docs/install>. Only needed to recompile `budget-logic/agentbudget.coco`; `agentbudget.json` is checked in.
5. **Anthropic API key** (optional) — add `ANTHROPIC_API_KEY` to `.env` for the real-agent `run` command and `agent.js`. Scripted `spend` works without it.

## Demo flow

Run from `session-6/` so `.env` is picked up.

### 1. Deploy the logic

```bash
npm run deploy
# prints logic id — paste into .env as LOGIC_ID
```

### 2. Provision agents

```bash
node squad.js provision trader 500
node squad.js provision scraper 200
```

Each `provision`:

1. Derives the sub-account address (primary's first 28 bytes + 4-byte index).
2. Sends one `AccountInherit` tx — create, link to logic, seed KMOI for gas.
3. Calls `SetBudget` to write the allowance into that account's actor state.

### 3. Agents act — and can't overspend

```bash
node squad.js run trader "look up who won the last F1 race, then record a spend for the lookup"
node squad.js spend trader 500 "bust the cap"   # reverts on chain
node squad.js report
```

`spend` is the no-API-key version of `run` — same on-chain `RecordSpend`, but you pick the amount. The overspend revert is the payoff: nothing in the app enforces the budget; the contract does.

### 4. Pip — context inheritance chat demo (optional)

```bash
node agent.js
```

Try: `who are you?` → `provision yourself` → `who are you now?` → `inspect <address>`

### Offline checks

```bash
npm run selftest
```

## What each on-chain call does

| Step | Who | Call | Effect |
| --- | --- | --- | --- |
| Deploy | Primary | `LogicFactory.deploy` | Deploys `AgentBudget`, returns logic id |
| Provision | Primary | `AccountInherit` | Creates sub-account, links context to logic, seeds KMOI |
| Set budget | Sub-account | `SetBudget(amount)` | Writes allowance into the agent's actor state |
| Spend | Sub-account | `RecordSpend(amount, memo)` | Adds to spent total; reverts if over budget |
| Report | Any wallet | `GetBudget()` (as each agent) | Reads that agent's budget / spent / remaining |

Sub-account addresses are structural — no registry:

```
primary:      0x5f3a…e0d9 00000000
sub-account:  0x5f3a…e0d9 00000001   ← same 56 chars, only the tail differs
```

## Bounty — MOI Builders VI: Context Inheritance

Provision your own agent under `AgentBudget` and make it appear in `report`.

### What to capture

| Item | Where to get it |
| --- | --- |
| **Logic id** | Printed by `npm run deploy` (also in `.env` as `LOGIC_ID`) |
| **Agent address** | Printed by `node squad.js provision <name> <budget>` |
| **Provision tx hash** | The `AccountInherit` hash from the provision output |
| **Report output** | `node squad.js report` showing your agent with budget / spent / remaining |

### Submit

Share your repo link with the logic id, agent address, and a tx hash we can verify on [Voyage](https://voyage.moi.technology).

**Bonus ($15 cash):** best build or extension on the day — e.g. a real agent task, a second logic, or a useful squad workflow.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing LOGIC_ID` | Run `npm run deploy`, paste id into `.env` |
| `Missing USER_MNEMONIC` | Create `.env` from `.env.example` |
| `has no KMOI for fuel` | Fund wallet at <https://voyage.moi.technology> |
| `Missing ANTHROPIC_API_KEY` | Add key to `.env`, or use `spend` instead of `run` |
| `agent not provisioned` | Run `node squad.js provision <name> <budget>` first |
| `exceeds remaining budget` | Expected — the contract enforces the cap |
| Provision fails after editing `.coco` | Recompile: `cd budget-logic && coco compile` |
| Stale squad between rehearsals | `node squad.js reset` clears the local name→index map (on-chain accounts remain) |

## Repo layout

```
budget-logic/
  agentbudget.coco    per-agent budget ledger (actor state)
  agentbudget.json    compiled manifest (checked in)
  coco.nut            compile config
squad.js              provision / run / spend / report / roster / reset
agent.js              Pip — chat demo for context inheritance
deploy-budget.js      one-time deploy → logic id
lib/                  MOI chain/env/util helpers
```

## Notes

- `.env` is gitignored — never commit your mnemonic or API keys.
- `.env` values must be comment-free (the parser does not strip inline `#`).
- Actor-state reads use a `Sender`-based static `GetBudget` endpoint — call it *as* the agent, not via `Actor(owner)`.
- Context inheritance allocates identity + per-logic state; it is **not** a permission sandbox. Sub-accounts share the primary's key. The enforced budget is the *logic's* doing, not inheritance's.
- `.squad.json` (local name→index map) is gitignored. The chain needs no registry — addresses are derived, budgets are read from the logic.
