# MOI Builders #8 — Agentic Payments V2: authority

**Everything session 7 does, and now the agent cannot overspend even if you delete its spending limit.**

Part 2 of 3. Start with [session 7](../session-7) — this assumes it.

---

## The idea in one change

Session 7's buyer held its own money and obeyed a limit written in its own source:

```ts
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");
```

A default in a TypeScript file. Read by the agent, honoured by the agent. Delete it and the
ceiling is gone. It also capped **one purchase**, not the wallet — so an agent with a 6-unit limit
and a 99,000-unit balance could drain the wallet 6 units at a time, every payment compliant.

Session 8 changes one thing: **the agent stops holding the money.**

The owner keeps the float and grants a capped, expiring allowance. The agent pays by pulling from
the owner's balance with `transferFrom`. Three consequences:

- It cannot exceed the cap — the chain checks every pull.
- It cannot raise the cap — granting is the owner's operation on the owner's funds.
- The cap and the blast radius are finally the same number.

---

## Three accounts

| | holds | can |
| --- | --- | --- |
| **Owner** | the float | grant, revoke |
| **Agent** | fuel only | spend the owner's, up to the cap |
| **Seller** | — | receive |

**The agent has no money.** That is the session.

---

## Run it

```bash
npm install
cp .env.example .env         # paste ONE funded devnet mnemonic
npm run preflight            # what exists on chain right now?
npm run setup:asset          # mint the settlement asset, fund the OWNER
npm run setup:registry       # register both agents
npm run setup:authority      # ← the owner grants the allowance
npm run spike:allowance      # prove the mechanism before trusting it
npm run demo                 # the honest purchase
npm run demo -- --overspend  # the agent tries anyway. the chain says no.
npm run demo -- --revoke     # the owner ends it mid-flight
```

`npm run preflight` is safe to run at any time. It reads only and spends nothing.

---

## Devnet gets reset

When it does, every account, asset, agent registration and transaction from a previous run stops
existing, and the SDK reports all of it as `account not found` — which reads like a bug in your
code and is not.

`npm run preflight` checks the chain in dependency order and names the reset explicitly when it
sees it. Run that before debugging anything.

---

## Honesty guardrails

These are load-bearing. Read them before writing any stage copy or slide.

- **Sub-accounts share the primary's key.** Context inheritance is **not** key isolation and
  **not** a permission sandbox. Whoever holds the key can sign as either account.
- The guarantee is **"the chain refuses the spend."** Never *"the agent can't touch the money."*
  The second is a stronger claim and it is not true.
- **The allowance is authority; any ledger is only visibility.** MOI has no routine to read an
  allowance back, so a "remaining budget" figure is our own bookkeeping. The agent writes it, so
  the agent can lie to it — and still cannot spend a unit over the cap.
- **The cap is total, not per-period.** Five units is five units until spent or expired.
- **The owner's key is still a key on a laptop.** We moved the limit out of the agent's code. We
  did not solve key custody.

---

## What changed from session 7

| | Session 7 | Session 8 |
| --- | --- | --- |
| Who holds the float | the agent | the **owner** |
| Spend cap | env-var default in `worth.ts` | on-chain allowance |
| Cap applies to | one purchase | the total grant |
| Enforced by | the agent | the **chain** |
| Can the agent raise it | yes, edit one line | no |
| Revocable mid-run | — | yes, by the owner |
| Identity check | ✅ | ✅ unchanged |
| Seller's seven checks | ✅ | ✅ unchanged |

---

## A trap worth knowing

**MAS0 fails silently.** A refused pull still returns an interaction hash with no error — it is
indistinguishable from success unless you diff balances. Every assertion in `spike-allowance.ts`
is a balance diff for exactly this reason, and the demo shows balances rather than receipts.

This cost real time in session 7. Do not trust a receipt here.
