---
title: "How AI Agents Pay Each Other — A Working Demo on MOI"
description: "Two AI agents transact on MOI with no human, no accounts, no payment processor. How agentic payments work: on-chain identity, HTTP 402, and a real settled transaction."
author: "Adithya Ganesh"
authorRole: "Ecosystem, Sarva Labs"
slug: "how-ai-agents-pay-each-other-moi"
tags: [agentic payments, AI agents, MOI, HTTP 402, on-chain identity, agent registry]
---

# How AI Agents Pay Each Other — A Working Demo on MOI

## What are agentic payments?

**Agentic payments** are transactions initiated, priced, verified and settled by AI agents, with no human in the loop. In the working demo below, a buyer agent finds a seller through [MOI](https://moi.technology)'s on-chain agent registry, verifies that the payment address really belongs to that agent, and pays from its own wallet in a native on-chain asset. The seller confirms the payment by reading the chain — no accounts, no API keys, and no payment processor anywhere. Every transaction in this post is real and publicly verifiable on [MOI's Voyage devnet explorer](https://voyage.moi.technology).

We ran this live at MOI Builders Session 7. Two AI agents, built on [Groq](https://groq.com) running [Llama 3.3 70B](https://console.groq.com/docs/models), doing business with each other on [MOI](https://moi.technology) — and the entire codebase is open in the [MOI-Webinars repo](https://github.com/moi-foundation/MOI-Webinars). This post is the write-up: what we built, how the payment actually works, and the one problem we deliberately left open.

## The problem: paying a stranger

Moving money is the easy part — blockchains have settled peer-to-peer value since [Bitcoin's genesis block in January 2009](https://en.bitcoin.it/wiki/Genesis_block). The hard part is everything a human does *without thinking* when they buy from someone they've never met. You glance at the shop and decide it looks real. You keep a rough number in your head that you won't go past. And you assume that if nothing turns up, there's some way to get your money back.

Take the human out, and all three instincts disappear. And you *have* to take the human out — an agent buying a fraction-of-a-cent answer can't wait for a person to click approve, because the approval costs more than the purchase. So each instinct has to become something a machine can check. This session answers the first one: **how does an agent know who it's paying?**

## The two agents

**The seller — a Probability Book Desk.** It sells bitcoin probability books: you ask a yes-or-no question about the future — *will bitcoin drop twenty percent this quarter?* — and it sells you back a number. It sets its own price per answer, watching how much demand each question is getting and marking prices up when one runs hot. The markup happens inside arithmetic bounds the model cannot break.

**The buyer — a Risk Agent.** It has a question it can't answer and a wallet of its own. It's been instructed not to guess at things it doesn't know, but to search the [MOI agent registry](https://www.npmjs.com/package/js-moi-agent-registry) for an agent capable of the task. It decides which listing answers its question, and it judges for itself whether the quoted price is worth paying.

Both brains run on [Groq](https://groq.com). The prices quoted and the choices made are model decisions happening during the run — not a script. And crucially: the two agents have never met. No shared URL, no API key, no account. The only thing they have in common is that both are registered on MOI, which means each has **an on-chain identity anyone can look up, with a wallet attached to it**.

## How the purchase works, end to end

1. **Discover.** The buyer scans the agent registry for the skill tag `sells-books` — not a Google search, but an on-chain listing of agents and their registered capabilities. Back comes an agent id, a registered wallet, and a service URL. Nobody handed it an address.
2. **Browse.** It fetches the seller's catalog over plain HTTP — free, deliberately. The questions and opening prices are public; only the answers cost money. A buyer can't decide what it wants if looking costs something.
3. **Choose.** The buyer's model reads the question and the catalog together and picks the market that actually answers it — we typed "crash," a word that appears nowhere in the catalog, and it reasoned its way to the drawdown market.
4. **Get billed.** The seller responds with [HTTP 402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402) — a status code reserved in the HTTP spec ([RFC 9110 §15.5.3](https://www.rfc-editor.org/rfc/rfc9110#status.402)) since 1997 and essentially unused, because until now nothing needed to charge a machine per request. The 402 body is a complete, machine-readable offer: price, asset, the wallet to pay, the seller's agent id, and an expiry.
5. **Judge the price.** The buyer weighs the quote against the list price, its own hard ceiling, and the seller's justification — which it treats as a sales pitch, skeptically.
6. **Check the identity — the step that matters.** More on this below.
7. **Pay.** The buyer signs and submits a real transfer of a native [MAS0 asset](https://moi.technology) from its own wallet. On MOI, only the owner of funds can move them — so there is no custodian anywhere in this system, because there *can't* be.
8. **Prove it.** It signs a claim binding that exact transaction to this exact purchase, and retries the same request with the proof in a header.
9. **The seller verifies everything itself.** Seven read-only checks — no payment processor in the middle.
10. **Delivery.** The answer comes back as the body of that same HTTP request. Money settled on chain; product delivered over the web.

Here's one of the real transactions from our runs — paid by the buyer agent, verified by the seller agent, and sitting permanently on [Voyage devnet](https://voyage.moi.technology):

```
0x13393fc7f6479d84b99263a7abcfcd0e9094a011beef99f628fd99dcd76c6ce6
```

## How does an agent know who it's paying?

This is the heart of the session, and it's forty-two lines of code.

A payment address is thirty-two bytes. It tells you **where** to send money. It tells you absolutely nothing about **whose** address it is. That gap between *where* and *whose* is where real-world payment fraud lives. Business email compromise — mostly swapped payment details on genuine invoices — cost victims $2.9 billion in 2023, according to the [FBI's Internet Crime Complaint Center](https://www.ic3.gov/AnnualReport/Reports). The invoice is real; the account number isn't.

So before paying, the buyer asks the chain a different question: *what wallet did this agent actually register?*

```ts
if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo)) {
  // refuse — report both values, spend nothing
}
```

One comparison, run **before** the transfer — not after. The ordering is the entire security property: there's no escrow in this demo and nobody to appeal to, so refusing has to happen while refusing is still free.

> **A payment protocol can tell you where. Only a registry can tell you whose.**

That's the MOI-specific piece. The check works because the seller's identity lives somewhere both parties can read *without asking each other*. The seller wrote its wallet on the chain when it registered; the buyer reads it at purchase time; no API or trust relationship exists between them.

## Payment without a processor

There are exactly two signatures in this system, both the buyer's.

The **first signature moves the money**: the buyer's wallet signs a MAS0 transfer via [js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk) (using [ECDSA over secp256k1](https://en.bitcoin.it/wiki/Secp256k1) — the same curve Bitcoin uses) and submits it to the chain itself. The **second signature proves the payment belongs to this purchase**. Transfers on a public chain are visible to everyone — so without a signed claim binding the transaction to the buyer and the resource, anyone could quote a stranger's transaction hash and collect the goods it paid for.

On the other side, the seller trusts none of it. It reads the transaction off the chain — receipt, then the raw operation, decoded with [js-polo](https://www.npmjs.com/package/js-polo) — and checks the sender, the recipient, the amount, the expiry, and that this transfer hasn't already bought something. Seven checks, all reads. We fired eleven kinds of forged payment at this verifier — tampered amounts, foreign keys, invented transactions, replays — and each was rejected for its own specific reason. The full attack suite ships in the [session repo](https://github.com/moi-foundation/MOI-Webinars), so the methodology is inspectable, not asserted.

**There is no payment processor in this system. The chain is the settlement record, and both sides simply read it.**

## The honest part: every guardrail here is self-imposed

The buyer has a spending limit — it refuses anything over six units. Here's what that limit is worth: it's an environment variable in the buyer's own source. Change it, and the ceiling is gone. There's a second opinion — the model judges whether a markup is reasonable — but that lives in the same process, in a prompt the operator wrote.

And even when the limit holds perfectly, notice what it caps: **one purchase, not the wallet**. Nothing tracks the total. An agent with a six-unit limit and a ninety-nine-thousand-unit balance can empty the wallet six units at a time, with every individual payment fully "compliant."

> **A limit the agent consults is a preference. A limit the chain applies is authority.** If the agent can choose to ignore it, it isn't authority — it's manners.

That gap is exactly what the next sessions close, using MOI itself. **Session 8 adds context inheritance**: the owner carves out a budget *on the chain* — spend this much and no more — and the agent inherits that authority instead of owning it. The limit stops being a variable in the agent's code and becomes a rule the chain enforces. **Session 9 opens the doors**: adopt an open payment standard so any compliant agent on the internet can transact with ours — with MOI underneath still answering the question a payment protocol can't.

## Under the hood: the full stack

The entire payment layer — discovery, wire format, paywall, payment, proof, and verification — is **698 lines of TypeScript across six files**, and the check the whole session is about is the smallest of them:

![Horizontal bar chart: the payment layer is 698 lines of TypeScript across six files — registry discovery 171, seller verification 135, payment 135, wire format 125, paywall 90, and the identity check just 42 lines.](./blog-assets/chart-payment-layer-loc.svg)

Everything is open source in the [session-7 folder of MOI-Webinars](https://github.com/moi-foundation/MOI-Webinars):

- **[MOI](https://moi.technology)** — the chain; identity, registry, and settlement. Devnet explorer & faucet: [voyage.moi.technology](https://voyage.moi.technology)
- **[js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk)** ([docs](https://js-moi-sdk.docs.moi.technology)) — wallets, MAS0 asset transfers, chain reads
- **[js-moi-agent-registry](https://www.npmjs.com/package/js-moi-agent-registry)** — registering agents and reading their cards, skills and wallets
- **[js-polo](https://www.npmjs.com/package/js-polo)** — POLO deserialization, used by the seller to decode transfer calldata straight off the chain
- **[Groq](https://groq.com)** ([console](https://console.groq.com)) running **[Llama 3.3 70B](https://console.groq.com/docs/models)** — both agents' brains: market choice, demand pricing, worth judgment
- **[Node.js](https://nodejs.org)** + **[TypeScript](https://www.typescriptlang.org)** + **[tsx](https://www.npmjs.com/package/tsx)**, in npm workspaces
- **[Express](https://expressjs.com)** — the seller's two routes: a free catalog and a paywalled answer
- **[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)** — the live console that streams the buyer's decisions as it makes them
- **[dotenv](https://www.npmjs.com/package/dotenv)** — one funded devnet mnemonic in `.env`; the seller never needs gas, because it only ever receives

One design rule runs through all of it: **models get judgment, code gets money.** What to buy, what to charge, whether it's worth it — model calls. Whether a payment is valid, who's being paid, whether a transfer already bought something — arithmetic, signatures, and chain reads. A model can be talked into things; that's a fine trait in a shopper and a fatal one in a cashier.

## FAQ

**What are agentic payments?**
Payments where software agents decide, execute and verify the transaction themselves — discovery of the counterparty, pricing, identity verification, settlement and delivery, with no human approval per transaction.

**Can an AI agent have its own crypto wallet?**
Yes — each agent here has its own on-chain account and key, derived and held by the software. Honest caveat: in this demo both keys derive from one operator's seed, so the agents have their own *addresses*, not yet their own *authority*. Authority the agent inherits — rather than a key it simply holds — is what MOI's context inheritance adds.

**What is HTTP 402 used for?**
[402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402) has been reserved in the HTTP spec since 1997 for exactly this: telling a client that the resource costs money. Machine-to-machine payments are the first use case that genuinely needs it.

**What stops the agent from overspending?**
Today: only its own code — which is precisely the point of the closing section above. A per-purchase ceiling it sets for itself, removable with one environment variable, and no cap on cumulative spend. On-chain, chain-enforced budgets are Session 8.

**What if the seller takes the money and doesn't deliver?**
You lose it — the same as handing over cash. Escrow-style pay-on-delivery is native to MOI (lockup and release) and on the roadmap beyond these sessions.

**Are the bitcoin probabilities real forecasts?**
No. The numbers are model-generated placeholders with no market data behind them, and every response says so in its payload. The demo is about the payment rails; swap in a real model and not a line of the payment machinery changes.

**Can I run this myself?**
Yes — one funded devnet wallet covers everything. Clone the [repo](https://github.com/moi-foundation/MOI-Webinars), fund a wallet at the [Voyage faucet](https://voyage.moi.technology), and `npm run ui` gives you the live console. There's a **bounty** for rebuilding it: both agents registered on MOI, a 402 quote, the identity check before payment, and a real transfer hash — [submit your wallet, email and repo link here](https://forms.gle/NToEMG47QHro9SiB8).

---

*Built at [Sarva Labs](https://www.sarva.ai) for the MOI Builders series. Earlier sessions cover the pieces this one stands on: [the agent registry](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-3), [native assets and swaps](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-4), and [on-chain agent budgets](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-6).*

<!-- ──────────────────────────────────────────────────────────────────────────
PUBLISHING CHECKLIST (delete before publish)

slug:        /blog/how-ai-agents-pay-each-other-moi
title tag:   How AI Agents Pay Each Other — A Working Demo on MOI (58 chars)
meta desc:   Two AI agents transact on MOI with no human, no accounts, no payment
             processor. How agentic payments work: on-chain identity, HTTP 402,
             and a real settled transaction. (159 chars)

- Canonical lives on moi.technology. Medium is syndication ONLY, with
  rel=canonical pointing home. Then Twitter/LinkedIn link the canonical.
- Add FAQPage schema (the 7 Qs above, answers verbatim) + TechArticle schema.
- Hero image: the slide-2 two-agents diagram. Alt text: "Two AI agents — a
  buyer and a seller — connected only through the MOI agent registry."
- Second image: the console screenshot of card 7 (the identity check).
- Keep the exact phrase "agentic payments" in H1, first paragraph, and one H2.
- Publish within 48h of the session; embed the session recording when live.
────────────────────────────────────────────────────────────────────────── -->
