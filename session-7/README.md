# MOI Builders #7 — Agentic Payments (V1: identity + payment)

**An agent finds another agent on MOI, and pays it — with no human, no account, and no API key.**

A **Reader** agent needs a book summary. It searches the MOI agent registry for an agent that sells
books, browses its catalog, picks one, gets an `HTTP 402`, pays in native MAS0, and receives the
summary. About a second, no prior relationship.

> Part 1 of 3. **V2 (session 8)** adds authority — an on-chain spend cap the chain enforces.
> **V3 (session 9)** adds the full commerce flow. Nothing from later phases appears here.

> New here? [EXPLAINER.md](./EXPLAINER.md) is the plain-English version.
> Reviewing the code? [REVIEW.md](./REVIEW.md). Building against it? [SPEC.md](./SPEC.md).

## The aha

x402 tells you an amount and a 32-byte address. It cannot tell you **whose address that is**.

MOI can. The buyer reads the seller's `agent_wallet` from the on-chain registry and refuses to pay
if the invoice disagrees. `npm run demo -- --tamper` repoints the registry entry at an attacker and
the buyer walks away — a check no x402 facilitator on any other chain can perform.

## The flow

```
buyer  registry: who sells books?          -> agent id, wallet, URL   (never handed a URL)
buyer  GET /catalog                        -> free. discovery must not cost money
buyer  brain picks the book for its question
buyer  GET /book/:id                       -> 402 + accepts[]
buyer  is payTo the seller's REGISTERED wallet?   <- the MOI question
buyer  MAS0 transfer(seller, price)        -> the buyer moves its OWN funds
buyer  sign an authorization naming that tx hash
buyer  GET again + X-Payment
seller POST /verify + /settle -> facilitator: 9 read-only checks
seller 200 + summary + X-Payment-Response
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

## Honesty guardrails

- **The facilitator is a referee, not a custodian.** On MOI only the owner can move their own
  funds, so it cannot custody or relay. It **signs nothing** — the buyer submits its own transfer
  and the facilitator reads the chain to confirm. `/settle` *confirms* rather than settles. An
  honest divergence from stock x402; say it out loud.
- **Registry discovery is an O(n) client-side scan** (`getAllAgentIds` → profile → card → filter).
  No index, no search, not semantic.
- **We do not fork x402.** The wire format is byte-for-byte the spec's and we reuse x402's real
  `useFacilitator`. Only two EVM-hardcoded shims are reimplemented — [SDK_NOTES §A](./SDK_NOTES.md).
- **No claims about budgets or permissions here.** That is session 8, deliberately.

## What is and isn't proven

**Verified:** `npm run verify-sdk` passes 63 assertions against live devnet — the registry surface,
sign/verify including negative cases, the public-key→identifier derivation, the MAS0 method
surface, and the receipt/tesseract/calldata shapes the facilitator depends on. Everything
typechecks.

⚠️ **Not yet run:** `setup:asset → setup:registry → demo` against a funded wallet. There is no
offline fallback, so this has to be rehearsed before it is presented. Most likely to break first,
in order: `setup:registry` (inline data-URI card, no prior art in this repo), then `/verify`
check 8 (the POLO decode meeting a real transfer), then `setup:asset`.

## Layout

```
packages/shared        config, chain, x402 wire types, payment-verify, registry
packages/facilitator   POST /verify + /settle — 9 read-only checks, signs nothing
packages/agent-seller  Bookseller: catalog, Groq summaries, MOI-aware 402 middleware
packages/agent-buyer   Reader: brain, identity-check, pay-fetch
scripts/               00 setup-asset, 01 register-agents, verify-sdk, demo, attack-test
```
