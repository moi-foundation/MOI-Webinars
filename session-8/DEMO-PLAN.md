# Session 8 — Demo Plan

**The one line:** session 7's agent obeyed its limit. This one *cannot disobey* it.

Everything below assumes a funded devnet wallet. Run `npm run preflight` first — it tells you
what exists and what to run next.

---

## Pre-flight (do this before you go live)

```bash
cd session-8
npm install
npm run preflight          # what exists on chain right now?
npm run setup:asset        # mint USDM, fund the OWNER
npm run setup:registry     # register both agents
npm run setup:authority    # ← session 8: the owner grants the allowance
npm run preflight          # confirm
npm run spike:allowance    # prove the mechanism before trusting it on stage
```

If `spike:allowance` fails, **do not run the demo.** Its five assertions are the demo.

---

## The setup, in one breath

Three accounts. Say this out loud early, because everything depends on it:

| | holds | can |
| --- | --- | --- |
| **Owner** | the float | grant and revoke |
| **Agent** | fuel only, no float | spend the owner's, up to the cap |
| **Seller** | — | receive |

**The agent has no money.** That is the whole session. It spends someone else's, under a limit
recorded on chain.

---

## Beat 1 — the honest purchase (2 min)

```bash
npm run demo
```

Runs session 7's flow end to end. Discovery, catalog, 402, identity check, payment, proof,
delivery.

**What to say:** "This is last session, unchanged. Same discovery, same identity check, same
seven verification checks. One thing is different and you cannot see it from here — the money
that just moved was never the agent's."

**Point at the transfer.** It names the owner as benefactor. The agent signed it; the owner
funded it.

---

## Beat 2 — the cap, shown not asserted (1 min)

The cap is 5. The purchase was 3. So 2 remain.

**Say the awkward part out loud** — it is more interesting than hiding it:

> "I cannot ask the chain how much is left. MOI lets you grant an allowance, spend it, and
> revoke it. There is no routine that reads one back. So the number I am about to show you is
> our own bookkeeping, not the chain's."

That distinction sets up beat 3, and it is the honest version of a slide everyone else fakes.

---

## Beat 3 — THE BEAT. Break the agent on purpose (3 min)

This is the session. Do it slowly.

**First, sabotage the agent in front of them.** Open `worth.ts` and delete the limit — the whole
guard. Say what you are doing:

> "Session 7's protection was this file. I am deleting it. The agent now has no spending limit
> of any kind, and its brain is about to tell it to buy."

**Then buy something that costs more than what is left.**

```bash
npm run demo -- --overspend
```

**What happens:** the agent discovers, judges, decides to buy, and submits the transfer. The
model says yes. Nothing in the agent objects, because you removed the thing that would have.

**And no money moves.**

> "The agent wanted to. It tried. The chain said no."

**Then show the balances.** Owner unchanged, seller unchanged. Nothing moved. That is the proof
— not the error message, the balances.

⚠️ **Rehearse this.** MAS0 fails *silently*: a refused pull still returns an interaction hash
with no error. If you read the receipt you will think it worked. Show the **balance diff**, never
the receipt.

---

## Beat 4 — revoke, live (1 min)

> "And I can end it from here, mid-run, without the agent's cooperation."

```bash
npm run demo -- --revoke
```

Owner revokes. The next pull dies instantly.

**The line:** "The agent did not agree to that. It was not asked."

---

## Beat 5 — the honest close (1 min)

Do not skip this. It is why people trust the rest.

- **Sub-accounts share the primary's key.** This is not key isolation and not a sandbox. The
  guarantee is *the chain refuses the spend* — never *the agent can't touch the money*.
- **The cap is total, not per-period.** Five units is five units until spent or expired.
- **The owner's key is still a key on a laptop.** We moved the limit out of the agent's code. We
  did not solve key custody.
- **A budget is a blast radius, not a judgement.** The chain caps the amount. It has no opinion
  on whether buying was wise.

**Close on session 9:** our two agents speak a format we invented. Fine for two agents that know
each other. Useless for an open market. Next time we adopt an open standard — with MOI underneath
still answering the two questions a payment protocol cannot: *whose address is this*, and *what
is this agent allowed to spend?*

---

## Timing

| Beat | Minutes |
| --- | --- |
| Setup framing (three accounts) | 2 |
| 1 — honest purchase | 2 |
| 2 — the cap | 1 |
| 3 — **break the agent** | 3 |
| 4 — revoke | 1 |
| 5 — honest close | 1 |
| Questions | rest |

Beat 3 is the session. If you are short on time, cut beat 2, never beat 3.

---

## If it breaks on stage

| Symptom | Cause | Say |
| --- | --- | --- |
| `account not found` everywhere | devnet was reset | "Testnet got wiped — that's what testnets do." Run `preflight`. |
| transfer works when it should fail | allowance not granted, or agent holds its own float | Check `setup:authority` ran and reported the agent at zero. |
| refused pull shows no error | **expected** — MAS0 fails silently | Show balances instead. |
| registry read fails | caller not on chain | The reading account needs to exist on chain first. |
