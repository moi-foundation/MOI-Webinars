# Session 8 — Demo Plan

**The one line:** session 7's agent obeyed its limit. This one *cannot disobey* it — the limit
lives in a contract, delivered by context inheritance (the thing session 6 introduced).

Everything below assumes a funded devnet wallet. `npm run preflight` tells you what exists.

---

## Pre-flight (before going live)

```bash
cd session-8
npm install
npm run preflight
npm run setup:budget       # deploy AgentBudget → LOGIC_ID
npm run setup:agents       # AccountInherit the buyer + SetBudget(5)
npm run setup:asset        # mint USDM (buyer must exist first — order matters)
npm run setup:registry
npm run demo               # one full rehearsal
```

Two terminals: seller left, buyer right. `worth.ts` open in the editor.

---

## The setup, in one breath (2 min)

> "Session 6 introduced context inheritance: one transaction derives a sub-account under a logic,
> and that account gets its own storage inside the contract — its actor state. Session 7 built
> two agents that pay each other. Tonight we put them together."

Three parties, say it out loud:

| | | |
| --- | --- | --- |
| **Owner** | the primary wallet | deploys, inherits, sets budgets |
| **Buyer** | sub-account #1, inherited under `AgentBudget` | spends, up to its on-chain budget |
| **Seller** | plain account | receives |

The buyer's budget — 5 units — is **in the contract's storage**, not in its code.

---

## Beat 1 — the honest purchase (3 min)

```bash
npm run demo
```

Session 7's full flow, plus one new step to point at — **step 7.5**:

```
── BUYER · step 7.5 ─────────────────────────────
   Record the spend against my on-chain budget
   budget     5
   spent so far   0
   remaining      5
   ✓ RecordSpend accepted — remaining 2
```

**Say:** "Before any money moved, the agent wrote this spend into its ledger inside the contract.
That's the new step. Everything else — discovery, the 402, the identity check, the seven
verification checks — is last session, unchanged. And notice: the remaining budget is READ FROM
CHAIN. Not our bookkeeping — the contract's."

---

## Beat 2 — THE BEAT: break the agent, on purpose (4 min)

**First, sabotage it in front of them.** Open `worth.ts`, delete the `SOFT_LIMIT` guard, save.

> "Session 7's protection was this file. It's gone. This agent now has no spending limit anywhere
> in its code."

**Then:**

```bash
npm run demo -- --overspend
```

What it does on chain, visibly: shrinks the budget so the next purchase exceeds it, then lets the
agent run. Watch the sequence:

1. The brain decides to buy — nothing in the agent objects
2. Step 7.5 fires: `RecordSpend` → **the contract REVERTS**
3. The buyer refuses to pay. **No transfer was ever submitted.**

**Say:** "The agent wanted to. It decided to. I deleted everything that would have stopped it —
you watched me. And the chain said no, because the rule isn't in the agent. It's in the
contract's storage, and the agent has no way to edit it."

**⚠️ If anyone asks "but couldn't the agent just skip the RecordSpend call?"** — answer honestly:
yes, an agent that bypasses the gate can still move its float. Sub-accounts share the primary's
key; this is a budget the contract enforces for agents that use the inheritance flow, not key
isolation. That's the difference between "the chain refuses the spend" (true) and "the agent
can't touch the money" (not true). Session 9's standard rides on exactly this same honesty.

---

## Beat 3 — the owner pulls the plug (1 min)

```bash
npm run demo -- --kill
```

The owner zeroes the remaining budget mid-session. The agent's next purchase dies at the gate.

**Say:** "The agent was not consulted. The owner edited the contract's state, not the agent's
code. That's the relationship inheritance builds: the agent decides *what* to buy, the ledger
decides *whether it still may*."

---

## Beat 4 — session 7 still holds (1 min, optional)

```bash
npm run demo -- --tamper
```

The identity check still refuses a tampered registry. Nothing was given up.

---

## Close (1 min)

- Session 6: context inheritance — accounts get state under a logic.
- Session 7: two agents transact — who am I paying?
- **Session 8: put them together — what may I spend?**
- Session 9: open the doors — a standard, so strangers can join.

---

## Timing

| Beat | min |
| --- | --- |
| setup framing | 2 |
| 1 — honest purchase | 3 |
| 2 — **break the agent** | 4 |
| 3 — kill switch | 1 |
| 4 — tamper (optional) | 1 |
| close | 1 |

Cut beat 4 if short. Never beat 2.

## If it breaks on stage

| Symptom | Say / do |
| --- | --- |
| `account not found` everywhere | devnet reset. "Testnets get wiped." Run preflight. |
| RecordSpend fails on the HAPPY path | budget not set — `npm run setup:agents` |
| refused spend still shows a hash | expected — MAS0 fails silently. Show balances. |
| `LOGIC_ID unset` | `npm run setup:budget` |
