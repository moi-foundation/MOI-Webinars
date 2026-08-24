---
title: "Giving an AI Agent a Budget It Cannot Overspend"
description: "Session 7's agent obeyed its spending limit because it was written to. Session 8 moves the limit onto the chain, where the agent cannot reach it — using a capped, expiring allowance on MOI."
author: "Adithya Ganesh"
authorRole: "Ecosystem, Sarva Labs"
slug: "agent-budget-on-chain-moi"
tags: [agentic payments, AI agents, MOI, on-chain authority, spend limits, agent governance]
---

# Giving an AI Agent a Budget It Cannot Overspend

<<< EVIDENCE: hero image — owner, agent, allowance >>>

## What is an on-chain spending limit?

An **on-chain spending limit** is a cap on what an AI agent can spend that lives in the chain's state rather than in the agent's code. The owner grants it, the chain enforces it, and the agent cannot raise it — because the agent never holds the money in the first place. In the demo below, a buyer agent pays for something it wants, then tries to buy again past its cap, and the transfer moves nothing.

This is part two of three. [Session 7](/blog/how-ai-agents-pay-each-other-moi) built two agents that transact with no human, no accounts and no payment processor. It ended on a problem it could not solve, which is what this post is about.

## The problem: we shipped a limit the agent could edit

Session 7's buyer had a spending limit. It refused anything over six units, and on stage it behaved perfectly.

Here is what that limit actually was:

```ts
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");
```

Not a config file. Not a setting anyone reviewed. A default baked into the agent's own source, read by the agent and honoured by the agent. It was never even set in the environment — the six is the fallback. Change one line and the ceiling is gone.

It had a second problem, quieter and worse. Look at what it caps: **one purchase**. Nothing tracked the total. An agent with a six-unit limit and a ninety-nine-thousand-unit balance could empty the wallet six units at a time, with every single payment fully compliant.

So we ended the session on a line:

> **A limit the agent consults is a preference. A limit the chain applies is authority.**

That was a promise, not a result. This is the result.

## What actually changed

One thing: **the agent stopped holding the money.**

In session 7 the buyer had its own float. Its wallet, its balance, its call. The limit was advice it gave itself.

Now the **owner** holds the float and grants the agent an allowance — a capped, expiring permission to spend someone else's funds, recorded on chain. The agent pays by pulling from the owner's balance, up to the cap, until the grant expires.

Three consequences, and they all follow from that one change:

- The agent cannot exceed the cap, because the pull is checked by the chain, not by the agent.
- The agent cannot raise the cap, because granting is the owner's operation on the owner's funds.
- The cap and the blast radius are now the same number. In session 7 they were six and ninety-nine thousand.

Nothing about the agent's reasoning changed. It still discovers a seller, judges a price, and decides to buy. It simply can no longer act on a decision the owner did not authorise.

## The primitive

MOI's native asset standard has this built in. Three operations, and no contract to deploy:

```ts
approve(beneficiary, amount, expiresAt)   // owner: grant a capped, expiring allowance
transferFrom(benefactor, beneficiary, amount)  // agent: pull from the owner, to the seller
revoke(beneficiary)                       // owner: cancel it
```

Read that middle line carefully, because it is the whole design. The agent calls `transferFrom` naming **the owner as benefactor** and **the seller as beneficiary**. Money moves from an account the agent does not control, to a party the agent chose, under a limit the agent cannot change.

There is no custodian in that sentence. Nobody holds the funds on anyone's behalf, and no service sits in the middle. The allowance is a fact in chain state, and the chain checks it on every pull.

`expiresAt` matters more than it looks. A cap with no expiry is a standing grant that outlives the reason it was made. Every grant here dies on its own.

## How the purchase works now, end to end

Steps 1 through 6 are session 7, unchanged. The identity check is still there, still doing the job it did before. Only the payment changed.

1. **Discover.** The buyer walks the MOI agent registry for a skill tag and finds a seller. No URL was configured anywhere.
2. **Browse.** It reads the seller's catalog over plain HTTP. Browsing is free.
3. **Choose.** Its model picks the market that answers its question.
4. **Get billed.** The seller replies `402 Payment Required` with a price, an asset, a wallet, its agent id, and a TTL.
5. **Judge the price.** The buyer weighs the quote against the list price and the seller's justification.
6. **Check the identity.** It asks the chain what wallet that agent registered, and refuses if it disagrees with the invoice. [Session 7's whole story](/blog/how-ai-agents-pay-each-other-moi), and it runs before anything is spent.
7. **Pay from the allowance.** Here is the change. Instead of transferring its own funds, the buyer calls `transferFrom` against the owner's balance. If the amount is within the grant, money moves. If it is not, the chain refuses and nothing happens.
8. **Prove it.** It signs a claim binding that exact transaction to this exact purchase.
9. **The seller verifies.** Seven checks, all reads, no payment processor. Unchanged from session 7.
10. **Delivery.** The answer comes back in the body of the same request.

<<< EVIDENCE: real transaction hash from a live run >>>

## Where the limit actually lives

This is the heart of the session, and the clearest way to see it is to try to break it.

Take the agent's code and delete the limit. Every check, every guard, the whole `worth.ts` file. Then point it at something expensive and let it run.

<<< EVIDENCE: terminal output — the overspend beat. Agent decides to buy, transferFrom moves nothing. >>>

The agent wants to buy. The model says buy. Nothing in the process objects, because we removed everything that would have.

And no money moves.

That is the entire difference between this session and the last one. Not that the agent behaves better — it behaves *worse*, deliberately — but that its behaviour stopped being what protects the wallet.

**And the owner can end it mid-flight.** One `revoke` and the grant is gone; the next pull dies instantly, with no cooperation from the agent and no way for it to object.

<<< EVIDENCE: terminal output — revoke, then a failed pull >>>

## The cap and the ledger are two different things

Here is something we found while building, and it changed the design.

**MOI has no way to read an allowance.** You can grant one, spend against it, and revoke it. There is no `Allowance()` routine, no `GetApproval()`, nothing in the asset's endpoint list that answers *how much is left?*

Which is a strange thing to discover halfway through building a demo about spending limits.

You can see why it works that way. The allowance exists to gate a transfer, and the gate does not need to be readable to function — the chain checks it whether or not anyone can query it. But it means the agent has no way to know its own remaining budget, and neither does anyone watching.

So we added a second thing, and it is worth being precise about why.

The agent's account is **inherited under a small piece of logic** deployed on MOI — which gives that account its own state under that logic, a per-agent ledger. Every purchase records against it, and it can be read back: budget, spent, remaining.

<<< EVIDENCE: the AgentBudget logic, and a GetBudget read showing the remaining figure >>>

Now the honest part, because these two mechanisms are not equal and it would be easy to imply they are:

- **The allowance is authority.** The agent cannot exceed it or change it.
- **The ledger is visibility.** The agent writes to it, so the agent can lie to it.

An agent that skipped its ledger entirely would still be unable to spend a unit over the allowance. That is the test of which one is load-bearing. We show both because a cap you cannot read is useless on stage and unhelpful in production — but only one of them is the reason the money is safe.

## The honest part: what this still does not do

Session 7's honest section was about a limit that lived in the wrong place. This one has a shorter list, but it is not empty.

**Sub-accounts share the primary's key.** Context inheritance gives an account its own state under a logic. It is not key isolation and it is not a sandbox. Whoever holds the key can sign as either account. What the chain guarantees is that a spend over the cap cannot happen — not that the agent is locked out of anything.

Say *"the chain refuses the spend."* Never *"the agent can't touch the money."* The second one is a stronger claim and it is not true.

**The cap is total, not per-period.** A grant of five units is five units until it is spent or expires. There is no daily allowance and no refill. Renewing means the owner granting again.

**The owner is still a key on a laptop.** We moved the limit out of the agent's code and into chain state. We did not solve who holds the owner's key, and that is now the whole of the trust model.

**And the agent still chooses what to buy.** The chain caps the amount. It has no opinion on whether the purchase was sensible, whether the seller was worth paying, or whether the agent was manipulated into wanting it. A budget is a blast radius, not a judgement.

## Under the hood

<<< EVIDENCE: line counts and the components chart, after the build settles >>>

Everything is open source in the [session-8 folder of MOI-Webinars](https://github.com/moi-foundation/MOI-Webinars). One funded devnet wallet runs the whole thing.

Worth knowing before you run it: **Voyage devnet gets reset.** When it does, every account, asset, agent registration and transaction from a previous run stops existing, and the SDK reports that as `account not found` — which reads like a bug in your code and is not. There is a `preflight` script that checks the chain in dependency order and tells you when that has happened, so you do not spend an afternoon debugging a wiped chain.

## What is next

**Session 9 opens the doors.** Right now our two agents speak a wire format we invented. That is fine for two agents that know each other's shape, and useless for an open market. Next session we adopt an open payment standard so any compliant agent on the internet can transact with ours — with MOI underneath still answering the two questions a payment protocol cannot: *whose address is this*, and *what is this agent allowed to spend?*

## FAQ

<<< EVIDENCE: FAQ — write after the session, matching the questions actually asked >>>
