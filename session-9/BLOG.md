---
title: "What 'Supports x402' Actually Means"
description: "We adopted the x402 payment standard for our AI agents. A generic client can now read our invoices perfectly — and still cannot pay them. That gap is the honest part, and most integrations never mention it."
author: "Adithya Ganesh"
authorRole: "Ecosystem, Sarva Labs"
slug: "what-supports-x402-actually-means"
tags: [x402, agentic payments, AI agents, MOI, payment standards, interoperability]
---

# What "Supports x402" Actually Means

<<< EVIDENCE: hero image — a stranger reading an invoice it cannot pay >>>

## The short version

We adopted [x402](https://x402.org) for our agent payments. A client that has never heard of MOI can now fetch one of our resources, get a `402 Payment Required`, and understand every field of what it owes — the amount, the asset, the payee, the deadline.

It still cannot pay.

That is not a bug, and it is not a partial implementation. It is what adopting a payment standard actually buys you, and the gap between those two facts is the most useful thing we learned building this.

This is part three of three. [Session 7](/blog/how-ai-agents-pay-each-other-moi) built two agents that transact with no human. [Session 8](/blog/agent-budget-on-chain-moi) gave the buyer a spending cap the chain enforces. Both worked, and both had the same limitation: they only worked because we wrote both sides.

## The problem: a private language

Our agents spoke a wire format we invented. The seller answered with a JSON blob of our own design; the buyer knew how to read it because it was written by the same person, in the same repository, the same week.

That is fine for a demo and useless for a market. An agent economy where every pair of agents needs a bilateral integration is not an economy — it is a set of hardcoded partnerships.

So: adopt a standard.

## What x402 is

x402 revives a status code that has been sitting unused in HTTP since 1997. `402 Payment Required` was reserved and never specified. x402 specifies it.

The flow is the one we had already arrived at independently, which was a good sign:

1. Client requests a resource
2. Server answers `402` with a machine-readable description of what it wants
3. Client pays
4. Client retries with a payment header
5. Server delivers

The 402 body looks like this:

```jsonc
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "...",
    "network": "...",
    "maxAmountRequired": "3",
    "resource": "http://.../signal/btc-drawdown-20",
    "description": "Probability estimate for: will bitcoin draw down 20% this quarter?",
    "mimeType": "application/json",
    "payTo": "0x...",
    "maxTimeoutSeconds": 120,
    "asset": "0x..."
  }]
}
```

Every one of those field names is the spec's. That is the point — a client that knows the spec knows what it is looking at, regardless of who wrote the server.

## The part that stopped us

We went to install the packages. They do not work, and the reason is instructive.

```ts
scheme:  z.ZodEnum<["exact"]>
network: z.ZodEnum<["abstract", "base-sepolia", "base", "solana", ...16 total]>
```

Both are **closed enums**. `scheme` permits exactly one value. `network` permits sixteen, all of them EVM or Solana chains.

MOI is not among them, and a MOI participant identifier is thirty-two bytes rather than an EVM address. So `x402-fetch` — which parses the 402 body *before* signing anything — throws on ours before our code runs. `x402-express` ends its network dispatch in a literal `throw new Error("Unsupported network")`.

This is worth sitting with, because it is a design decision rather than an oversight. The spec's authors chose to enumerate rather than leave it open, which buys real safety: a client cannot be tricked into signing for a chain it does not understand, because it cannot even parse the request.

The cost is that the enum is a gate, and a new chain has to be let through it.

## So we implemented the shape by hand

Same envelope, same field names, same headers. Two fields widened from enum to string, and only two: `scheme` and `network`.

```
scheme:  "moi-transfer"
network: "moi-voyage-devnet"
```

**Declaring a scheme is what a scheme identifier is for.** x402 ships one — `exact`, whose settlement is a detached EVM transfer authorization. We could not use it, for a reason worth its own paragraph.

## Why we could not use x402's own scheme

x402's `exact` scheme works like this: the buyer signs a transfer *authorization* — a detached permission slip saying "let this party take 3 units" — and hands it to someone else to submit and pay gas for.

**MOI has no detached-authorization signing.** You sign a whole interaction, or you sign nothing. The transfer instruction is one field inside a signed envelope, not a portable object you can hand across.

So there is nothing to hand over, and no third party to hand it to. Our scheme inverts the order: **the buyer settles first, from its own authority, and then signs a statement naming that settled transfer.** The seller reads the transaction off the chain and confirms it independently.

Same envelope. Opposite settlement. That is exactly the kind of thing a `scheme` field exists to express.

## The probe: what a stranger actually sees

We wrote a client that imports nothing from our codebase. No wallet, no chain access, no MOI anything. A plain HTTP client that speaks x402 and only x402.

<<< EVIDENCE: x402-probe output — the full parse, then the refusal >>>

**It reads everything.** Amount, asset, payee, resource, deadline, description. It did not need to know what MOI is, because the envelope is the standard's.

**And then it stops.** It checks our `scheme` and `network` against the spec's real enums, finds neither, and refuses to go further.

Both halves are the result. Not the first one on its own.

> **Any x402 client can read our invoice. Only a client that implements our scheme can pay it.**

## Why this is the honest framing

"Supports x402" is going to appear in a great many announcements over the next year, and it will mostly mean what it means here: the envelope is standard, the settlement is not.

That is not dishonest by itself. It is genuinely useful — discovery, negotiation, price comparison and machine-readable terms all work across implementations that cannot settle for each other. A crawler can index what your agent charges without holding a wallet on your chain.

What would be dishonest is letting people assume the second half. **Settlement is chain-specific and cannot be otherwise**, because a chain's rules are the chain's. No wire format changes what it takes to move value on a particular ledger.

So the useful question to ask any "x402-compatible" claim is not *do you speak it* — it is *which schemes do you settle?*

## The field the standard has no place for

There is one line in our 402 body that x402 has no home for:

```jsonc
"extra": {
  "symbol": "USDM",
  "payToAgentId": "agent_132"
}
```

`extra` is an open record in the spec, which is where MOI-specific fields ride without breaking a compliant parser.

But look at what is in there. `payTo` is thirty-two bytes of hex — the standard tells a client **where** to send money and has no opinion whatsoever on **whose** address it is. That is [session 7's entire story](/blog/how-ai-agents-pay-each-other-moi), and adopting a standard did not solve it. It made it more visible, because now there is a spec in the room that still cannot answer it.

So the seller's on-chain agent id travels in `extra`, and the buyer checks it against the registry before paying — exactly as before.

**A standard makes the invoice legible. It does not make the payee honest.**

## What we did not give up

Adopting the envelope cost us nothing underneath it:

- **The identity check** still runs before any money moves. Session 7, unchanged.
- **The spend cap** is still an on-chain allowance the agent cannot raise. Session 8, unchanged.
- **The seller still verifies itself.** Seven checks, all chain reads, no facilitator. A standard wire format does not change what has to be true for a payment to be real.

<<< EVIDENCE: attack-test output — twelve forgeries, each rejected for its own reason >>>

## Under the hood

<<< EVIDENCE: line counts after the build settles >>>

Everything is open source in the [session-9 folder of MOI-Webinars](https://github.com/moi-foundation/MOI-Webinars).

Two things worth knowing before you run it. **Voyage devnet gets reset**, and when it does every account and transaction from a previous run stops existing — `npm run preflight` detects that and says so plainly. And **x402 v1.2.0 is deprecated upstream**; v2 is current. We target v1 because that is what the installed package implements and what we verified against.

## The arc, closed

Three sessions, three questions:

- **Who am I paying?** A registry answered it. No payment protocol can.
- **What is my agent allowed to spend?** A chain-enforced allowance answered it. No prompt can.
- **Can anyone else join?** A standard answered it — as far as a standard can.

The first two needed a chain underneath. The third needed a format on top. That layering is the whole argument: **standards make agents legible to each other, and chains make them accountable.** Neither substitutes for the other, and an agent economy needs both.

## FAQ

<<< EVIDENCE: FAQ — write after the session, matching the questions actually asked >>>
