# Session 8 — Plan

**Working title:** How do you give an agent money without giving it your wallet?

Session 7 shipped and ended on a promise:

> **A limit the agent consults is a preference. A limit the chain applies is authority.**
> If the agent can choose to ignore it, it isn't authority — it's manners.

Session 8 has to actually deliver the second half. Everything below is in service of one
demo beat: **the agent tries to spend, and the chain says no.**

---

## 1. What already exists

A full session-8 build exists on `claude/agent-payments-moi-x402-d56397`. It predates the
session-7 rewrite, so it is x402-shaped (facilitator package, `x402-types.ts`, mock-chain).
The plumbing is stale. **The design work in it is not**, and two pieces are worth keeping:

| Asset | Verdict |
| --- | --- |
| `budget-logic/agentbudget.coco` | Keep the shape. Needs one access-control fix — see §2. |
| Context-inheritance provisioning (`AccountInherit`) | Keep. Real, and SDK surface confirmed. |
| The honesty guardrails in its README | **Keep verbatim.** Already litigated. |
| `facilitator/`, `x402-types.ts` | Drop. Session 7 removed the facilitator. |
| `mock-chain.ts` | Drop unless we want the no-wallet path again. |

The honesty guardrails, restated because they constrain every line of stage copy:

- Sub-accounts **share the primary's key**. Inheritance is not key isolation and not a sandbox.
- What inheritance buys is **actor state under a logic**.
- The line is **"the chain refuses the spend"** — never *"the agent can't touch the money."*

---

## 2. Two holes in the existing design

Both undercut the session's thesis. Found by reading the branch, not assumed.

### Hole 1 — the agent can raise its own cap

`SetBudget` has no access control:

```
endpoint dynamic SetBudget(amount U256):
    mutate b <- AgentBudget.Sender.budget:
        b = amount
```

`Sender` writes `Sender`'s own budget. And the caller *is* the agent sub-account
(`budget.ts:36`, `02-provision-agents.ts:57`). So the agent can lift its own ceiling in one
call. `demo.ts:101` does exactly that at runtime to stage the overspend beat.

That is session 7's env-var problem with extra steps.

### Hole 2 — recording the spend is voluntary

`spendWithinBudget` is called by the buyer's own code before paying
(`agent-buyer/src/index.ts:150`). The logic is, in its own words, *"a ledger, not a custodian
— it never holds the asset"* (`budget.ts:4`).

An agent that simply skips the call and transfers still moves the money. The cap binds a
well-behaved agent, which is the population that never needed a cap.

**Neither hole is fatal. Both need fixing before this session can make its claim.**

---

## 3. The design decision

Two ways to get real enforcement. This is the one thing to settle before building.

### Option A — MAS0 allowance (`approve` / `transferFrom`)

The owner **keeps the funds** and grants the agent a capped, expiring allowance naming it as
spender. The agent pays with `transferFrom`. Over the allowance, the chain refuses.

- Hard enforcement: no voluntary call to skip, no cap the agent can rewrite.
- The agent never holds the money — so "spend cap" and "blast radius" are the same number.
- **Perfect continuity.** Session 7's post already describes this mechanism and says *"our
  agents never grant one."* Session 8 grants one.
- Session 7 flagged `transferFrom` as reasoned-but-untested (only one funded wallet).
  Session 8 has to prove it live — which retires an outstanding debt.
- Cost: expiry and amount are the only policy. No per-purchase memo, no richer rules.

### Option B — fixed AgentBudget over context inheritance

Keep the logic, add owner binding (only the recorded parent may `SetBudget`), and route the
payment *through* the logic so recording isn't optional.

- Richer policy: memos, per-agent ledgers, arbitrary rules in Coco.
- Uses MOI's actual differentiator, which is the stated arc for this session.
- Cost: more moving parts, and it stays a ledger unless the logic also custodies the asset.

### Recommendation

**A as the spine, B as the layer on top.** A gives a cap that is true regardless of the
agent's code — the thing session 7 promised. B gives the story its MOI-specific shape and the
richer rules. Build A first and prove it; add B only if A lands early.

If we have to pick one: **A**. A demo where the agent genuinely cannot overspend beats a
richer one where it merely declines to.

---

## 4. Demo beats

Same rhythm as session 7 — happy path, then one refusal that isn't ours.

1. **Inherit.** Owner provisions the agent's account and grants it authority. Show the grant
   landing on chain.
2. **Buy.** Session 7's full flow, unchanged — discover, browse, 402, identity check, pay.
   Now the money comes from the allowance, not the agent's own float.
3. **Show the ledger shrink.** Remaining allowance, read off the chain, after the purchase.
4. **Overspend.** The agent *wants* to buy. The brain says buy. The chain refuses. No money
   moves.
5. **Revoke.** Owner pulls the authority mid-session; the next purchase dies instantly.

Beat 4 is the session. Beat 5 is the one that makes people sit up, and it's cheap.

---

## 5. What must be proven live

Session 7's credibility came from real hashes. Same bar. Nothing ships as "reasoned."

- [ ] `approve(spender, amount, expiresAt)` lands and is readable
- [ ] `transferFrom` **succeeds** within the allowance
- [ ] `transferFrom` **reverts** over the allowance — captured, with the error
- [ ] `revoke` kills a live allowance
- [ ] Allowance expiry actually bites (needs a short TTL run)
- [ ] `AccountInherit` executes on devnet (never yet run funded — flagged in old README)
- [ ] Two funded wallets exist this time. This blocked session 7.

---

## 6. Build sequence

1. Branch off `claude/agent-payments-simple`. Session 8 = session 7 + authority.
2. Copy session-7 packages forward; keep the identity check exactly as-is.
3. Spike `approve` / `transferFrom` on devnet **before** writing any agent code.
   If it doesn't behave, the whole plan changes — find out on day one.
4. Wire the buyer to pay from the allowance.
5. Add the overspend and revoke beats.
6. Attack test, in session 7's style: every refusal for its own specific reason.
7. Deck, then blog.

---

## 7. Open questions

1. **A, B, or both?** §3. Everything downstream depends on it.
2. **Two funded devnet wallets** — can we get them? Blocks §5.
3. **Does the seller change at all?** Cleanest answer: no. Session 8 is a buyer-side story.
4. **Keep the no-wallet mock path?** It made the old build demoable anywhere. Costs upkeep.
5. **Does the registry entry say anything about authority?** Probably out of scope, but it is
   the obvious session-9 hook.
