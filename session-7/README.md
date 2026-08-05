# MOI Builders #7 — Agentic Payments (V1: identity + payment)

**An agent finds another agent on MOI, and pays it — with no human, no account, and no API key.**

A **Reader** agent needs a book summary. It scans the MOI agent registry for an agent that sells
books, browses its catalog, picks one, gets an `HTTP 402`, pays in native MAS0, and receives the
summary. About a second, no prior relationship.

> Part 1 of 3. **V2 (session 8)** adds authority — an on-chain spend cap the chain enforces.
> **V3 (session 9)** adds the full commerce flow. Nothing from later phases appears here.

> New here? [EXPLAINER.md](./EXPLAINER.md) is the plain-English version.
> Reviewing the code? [REVIEW.md](./REVIEW.md). Building against it? [SPEC.md](./SPEC.md).

## The aha

A payment protocol tells you an amount and a 32-byte address. It cannot tell you **whose address
that is**.

MOI can. The buyer reads the seller's `agent_wallet` from the on-chain registry and refuses to pay
if the quote disagrees. `npm run demo -- --tamper` repoints the registry entry at an attacker and
the buyer walks away — a check that needs an on-chain identity to be possible at all.

## The flow

```
buyer  registry: who sells books?          -> agent id, wallet, URL   (never handed a URL)
buyer  GET /catalog                        -> free. discovery must not cost money
buyer  brain picks the book for its question
buyer  GET /book/:id                       -> 402 + a quote
buyer  is payTo the seller's REGISTERED wallet?   <- the MOI question
buyer  MAS0 transfer(seller, price)        -> the buyer moves its OWN funds
buyer  sign a claim naming that interaction hash
buyer  GET again + X-Payment-Proof
seller 7 read-only checks, in-process      -> confirms the transfer by reading the chain
seller 200 + summary + X-Payment-Receipt
```

## Run order

```bash
npm install
cp .env.example .env          # paste ONE funded devnet mnemonic
npm run verify-sdk               # 63 assertions vs live devnet — no wallet needed
npm run setup:asset              # MAS0 asset + buyer float -> SETTLEMENT_ASSET_ID
npm run setup:registry           # register both agents -> SELLER_AGENT_ID / BUYER_AGENT_ID
npm run demo
```

Only **one** funded wallet is needed: the buyer signs, the seller only receives.

## Why there is no x402 here

There was. It lives on the **`claude/agent-payments-moi-x402`** branch and it works — same demo,
same identity check, roughly twice the code and a separate facilitator service to run.

What that branch buys is interoperability: because it speaks the x402 wire format, any x402 client
can pay that seller and that buyer can pay any x402 server. Reach for it if that matters to you.

This branch trades that away for a protocol you can read in one sitting. Two messages: the seller
quotes, the buyer pays and proves it. The part worth keeping — the registry identity check — was
never x402's to begin with, so it survived the move unchanged.

## Honesty guardrails

- **Nobody holds your money.** On MOI only the owner can move their own funds. The buyer submits
  its own transfer; the seller confirms it by reading the chain. There is no escrow and no custody
  anywhere in V1.
- **The seller verifies its own payments.** That is why there is no facilitator. A facilitator on
  MOI could never do more than referee, and a seller can referee for itself.
- **Registry discovery is an O(n) client-side scan** (`getAllAgentIds` → profile → card → filter).
  No index, no search, not semantic.
- **No claims about budgets or permissions here.** That is session 8, deliberately.

## What is and isn't proven

**Run against Voyage devnet and observed working:**

| Command | Result |
| --- | --- |
| `npm run demo` | green — real interaction hash, 1 USDM moved |
| `npm run demo -- --tamper` | buyer refuses, no funds move, registry restored |
| `npm run attack-test` | 11 forgeries rejected, honest control accepted |
| `npm run verify-sdk` | 63 assertions against live devnet |

**Still to do:** [SPEC.md](./SPEC.md), [SDK_NOTES.md](./SDK_NOTES.md), [VIDEO.md](./VIDEO.md) and
the deck still describe the x402 architecture from the other branch. The code here is current; those
four are not.

## Layout

```
packages/shared        config, chain, wire types (payment-proof), payment-verify, registry
packages/agent-seller  Bookseller: catalog, Groq summaries, paywall + its own 7 checks
packages/agent-buyer   Reader: brain, identity-check, pay
scripts/               00 setup-asset, 01 register-agents, verify-sdk, demo, attack-test
```
