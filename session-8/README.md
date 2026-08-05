# MOI Builders #8 — Agentic Payments (V2: authority)

**Everything session 7 does — and now the chain decides what your agent is allowed to spend.**

Same Reader and Bookseller. But both agents are now **inherited sub-accounts** carrying an
on-chain spend cap, and every purchase must be recorded against that cap first. Over the cap, the
`AgentBudget` logic **reverts** and no money moves.

> Part 2 of 3. Start with [session 7](../session-7) — this assumes it.

## Try it right now (no wallet, no .env)

```bash
pnpm install
CHAIN_MODE=mock pnpm demo
CHAIN_MODE=mock pnpm demo -- --overspend   # the agent WANTS to buy; the chain says no
CHAIN_MODE=mock pnpm demo -- --tamper      # session 7's identity beat, still working
CHAIN_MODE=mock pnpm attack-test
```

## The aha

In session 7 the agent behaved because it was written to behave. Here it doesn't have to.

`--overspend` exhausts the cap and then lets the agent try to buy anyway. The brain says *buy*.
The chain says no. **The rule is not in the agent** — which is the only version of an agent budget
that survives the agent being buggy, compromised, or prompt-injected.

## Honesty guardrails

Read these before writing stage copy. They are load-bearing and were pushed back on directly:

- **Sub-accounts share the primary's key.** Context inheritance is **not** key isolation and
  **not** a permission sandbox. Technically a sub-account is just an account.
- What inheritance actually buys is **actor state under a logic** — which is what lets the logic
  specify the rules of trade and the chain enforce them.
- So the line is: **"the chain refuses the spend."** Never *"the agent can't touch the money."*
- The budget gate is **opt-in**: it binds agents that use the inheritance flow. Ours does, so the
  cap genuinely bites here.

## What's added over session 7

| | Session 7 | Session 8 |
| --- | --- | --- |
| Agent wallets | two plain accounts | inherited **sub-accounts** |
| Spend cap | none | `AgentBudget` logic, enforced on chain |
| Before paying | identity check | identity check **+ RecordSpend** |
| Setup steps | 2 | 4 (adds deploy-budget, provision-agents) |
| Failure beats | `--tamper` | `--tamper` **+ `--overspend`** |

## Run order (real devnet)

```bash
pnpm install
cp .env.example .env          # paste ONE funded devnet mnemonic
pnpm verify-sdk
pnpm setup:asset              # MAS0 asset + buyer float
pnpm setup:budget             # deploy AgentBudget -> LOGIC_ID
pnpm setup:agents             # AccountInherit x2 + SetBudget(buyer)
pnpm setup:registry           # register both agents
pnpm demo
```

## Known upstream bug

`AccountInherit.send()` takes **no arguments**. Session 6 calls `.send({ fuel_limit })` from plain
JS, where the object is silently discarded — so that inherit runs on default fuel. We route through
`.build().send({ fuel_limit })`. Worth fixing in session 6.

## Not yet proven

The devnet sequence has not been run with a funded wallet. Most likely to break first:
`02-provision-agents` (`AccountInherit` + the fuel change), then `03-register-agents`
(`createAgent` with an inline data-URI card).
