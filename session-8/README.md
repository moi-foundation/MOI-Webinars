# MOI Builders #8 — Agentic Payments V2: context inheritance

**Everything session 7 does, and now the agent spends under a budget a contract enforces — even
if you delete every guard in its code.**

Part 2 of 3. Start with [session 7](../session-7) — this assumes it. The mechanism comes from
[session 6](../session-6), which introduced context inheritance and the `AgentBudget` logic.

---

## The idea in one change

Session 7's buyer was a plain account, and its spending limit was a default in its own source:

```ts
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");
```

Delete that line and the ceiling is gone.

Session 8 makes the buyer an **inherited sub-account** under the `AgentBudget` logic. Context
inheritance (one `AccountInherit` transaction) gives the account its own storage under that logic
— actor state — holding its `budget` and `spent`. Before any money moves, the buyer must
`RecordSpend` against that ledger, **and the contract reverts if the spend would exceed the
budget**. That rule lives on chain, where the agent's code cannot reach it.

Delete `worth.ts` entirely and the revert still happens.

## Three parties

| | is | can |
| --- | --- | --- |
| **Owner** (primary) | the faucet-funded wallet, index 0 | deploy the logic, inherit sub-accounts, reset budgets |
| **Buyer** (sub-account #1) | inherited under `AgentBudget` | spend, up to its on-chain budget |
| **Seller** | a plain account | receive |

## Run it

```bash
npm install
cp .env.example .env         # paste ONE funded devnet mnemonic
npm run preflight            # what exists on chain right now?
npm run setup:budget         # deploy AgentBudget → LOGIC_ID
npm run setup:agents         # AccountInherit the buyer + SetBudget
npm run setup:asset          # mint the settlement asset (buyer must exist first)
npm run setup:registry       # register both agents
npm run demo                 # the honest purchase — gated by RecordSpend
npm run demo -- --overspend  # the brain says buy. the contract says no.
npm run demo -- --kill       # the owner zeroes the budget mid-session
npm run demo -- --tamper     # session 7's identity beat, still working
```

Order matters: the buyer sub-account only exists after `setup:agents`, so the asset step comes
after it.

## Honesty guardrails

Load-bearing. Read before writing stage copy.

- **Sub-accounts share the primary's key.** Context inheritance is **not** key isolation and
  **not** a sandbox. Whoever holds the key can sign as either account.
- What inheritance buys is **actor state under a logic** — which is what lets the contract
  enforce the budget.
- The line is **"the chain refuses the spend."** Never *"the agent can't touch the money."*
- The budget gate binds agents that use the inheritance flow. Ours does, so the cap genuinely
  bites here.
- **MAS0 fails silently** — a refused transfer still returns a hash with no error. On stage the
  proof is the balance diff, never the receipt.

## What changed from session 7

| | Session 7 | Session 8 |
| --- | --- | --- |
| Buyer account | plain | inherited **sub-account** |
| Spend limit | env-var default in `worth.ts` | `budget` in actor state, on chain |
| Enforced by | the agent's own code | the **AgentBudget contract** |
| Before paying | identity check | identity check **+ RecordSpend** |
| Readable remaining budget | no | yes — `GetBudget`, from chain |
| Failure beats | `--tamper` | `--tamper` + `--overspend` + `--kill` |

## Devnet gets reset

When it does, everything here stops existing and the SDK says `account not found`, which reads
like a bug and is not. `npm run preflight` names it. The LOGIC_ID in `.env` also dies with the
chain — redeploy with `setup:budget`.
