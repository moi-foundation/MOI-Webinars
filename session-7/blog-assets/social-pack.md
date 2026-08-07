# Launch social pack — replace CANONICAL_URL before posting

The social post is the hook; the crawler follows the link. Always link the
moi.technology canonical, never the Medium mirror.

---

## Twitter/X thread (9 tweets)

**1/**
Two AI agents just did business with each other on MOI.

No accounts. No API keys. No payment processor. Neither knew the other existed until the moment they transacted.

Here's how agentic payments actually work — with a real, on-chain receipt 🧵

**2/**
The cast: a seller that prices bitcoin probabilities on demand, and a buyer with a question it can't answer and a wallet of its own.

Both brains run live on Groq. The prices you see quoted are decisions the models make during the run — not a script.

**3/**
The buyer doesn't get a URL. It scans MOI's agent registry for a *skill* — "who sells this?" — and gets back an id, a wallet, and an address.

Discovery is a read of shared, neutral state. No app store in the middle. Nothing anyone can quietly edit.

**4/**
Then the fun part: the seller answers with HTTP 402 — Payment Required.

A status code that's been sitting unused in the spec since 1997, because until now nothing needed to charge a machine per request.

The 402 body IS the deal: price, asset, wallet, agent id, time-to-live.

**5/**
Before paying, the buyer asks the one question no payment protocol can answer:

that address is 32 bytes. It says WHERE to send money. It says nothing about WHOSE address it is.

So it checks the chain: is this the wallet this agent registered? That check is 42 lines.

**6/**
This isn't a toy threat. Swapped payment details on genuine invoices — business email compromise — cost victims $2.9B in 2023 (FBI IC3).

A payment protocol tells you where. Only a registry tells you whose.

**7/**
Then it pays — from its own wallet. On MOI value moves only under the holder's own signature, and our agents never grant an allowance to anyone. Nothing is holding or relaying the money.

And the seller trusts nothing: it reads the transaction off the chain itself. Seven checks. We fired 10 forged payments at it; all rejected.

**8/**
The honest part: every guardrail in this demo is self-imposed. The buyer's spending limit is an env var. It caps the purchase — not the wallet.

A limit the agent consults is a preference. A limit the chain applies is authority.

That's what we build next.

**9/**
Full write-up, the code, and a real settled transaction you can look up on devnet:

CANONICAL_URL

Rebuild it yourself — there's a bounty. One devnet wallet covers everything.

---

## LinkedIn

**Two AI agents just transacted with no human involved — and the interesting part isn't the payment.**

At MOI Builders Session 7 we ran a live demo: a buyer agent with a question it couldn't answer, and a seller agent pricing answers on demand. They'd never met. No shared account, no API keys, nobody introduced them. The buyer found the seller through MOI's on-chain agent registry, got quoted a price over plain HTTP 402, and paid from its own wallet in a native asset — a real transaction, publicly verifiable on devnet.

The step that matters happens *before* the money moves. A payment address is 32 bytes: it tells you where to send funds, and nothing about whose address it is. That gap is where invoice fraud lives — $2.9B lost to business email compromise in 2023, per the FBI. Our buyer closes it with one question asked of the chain: is this the wallet this agent actually registered? Mismatch → it refuses, and nothing is spent.

The honest part: every safety limit in this demo lives inside the agent that it's supposed to restrain. An environment variable. A prompt. Removable by whoever runs it. A limit an agent consults is a preference — a limit the chain applies is authority, and that's exactly what we're building next with context inheritance on MOI.

Full write-up, code, and the on-chain receipts: CANONICAL_URL

There's a bounty for rebuilding it — one devnet wallet covers the whole thing.

---

## Reddit (r/AI_Agents or similar — plain, no marketing voice)

**Title:** We built two AI agents that pay each other on-chain — buyer verifies the seller's identity against a registry before any money moves. Full code + write-up.

**Body:**

Demo from a builder session I ran this week. Two agents, both with Groq/Llama 3.3 brains: a seller that prices its product per request based on demand, and a buyer that discovers it by skill tag on MOI's agent registry, judges the quote, and pays from its own wallet.

The part I think is actually interesting for this sub: the identity check. The seller's 402 response says "pay this address" — and an address tells you nothing about who owns it. So before paying, the buyer reads what wallet that agent *registered* on-chain and refuses on mismatch. It's 42 lines, it runs before the transfer, and it's the difference between "agent that can pay" and "agent that's safe to let pay."

Also being upfront about the limits: the buyer's spending cap is an env var in its own code — it caps per-purchase, not total, so it could drain its own wallet without ever "breaking" the rule. That gap (self-imposed vs chain-enforced limits) is the thing we're working on next.

Everything's open source, one devnet wallet runs it end to end, real transaction hashes in the post: CANONICAL_URL

Happy to answer questions about the verification design — the seller-side checks (7 reads, no payment processor anywhere) took the most iteration.
