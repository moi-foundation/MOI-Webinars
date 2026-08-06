# MOI Builders #7 — Agentic Payments (identity + payment)

**An agent finds another agent on MOI, and pays it — with no human, no account, and no API key.**

A **Risk Agent** needs a probability. It scans the MOI agent registry for an agent that sells
signals, browses its catalog of markets, picks one, gets an `HTTP 402`, pays in native MAS0, and
receives the estimate. About a second, no prior relationship.

Plain-English walkthrough: [EXPLAINER.md](./EXPLAINER.md). Live talk script: speaker notes in
[`deck/MOI_Builders_S7-new.pptx`](./deck/MOI_Builders_S7-new.pptx).

## The aha

A payment protocol tells you an amount and a 32-byte address. It cannot tell you **whose address
that is**.

MOI can. The buyer reads the seller's `agent_wallet` from the on-chain registry and refuses to pay
if the quote disagrees. `npm run demo -- --tamper` repoints the registry entry at an attacker and
the buyer walks away — a check that needs an on-chain identity to be possible at all.

## The two agents

| | Who | What it does |
| --- | --- | --- |
| **Seller** | *Signal Desk* (`packages/agent-seller`) | An HTTP service that lists prediction markets. The questions and list prices are public; the probability estimates sit behind a paywall. It prices each request, quotes, and verifies its own payments by reading the chain. |
| **Buyer** | *Risk Agent* (`packages/agent-buyer`) | A pure agent loop with a question to answer and a funded wallet. It is never given the seller's URL or address — everything it knows about the seller comes off the chain. |

Each agent has its own wallet and its own on-chain identity in the MOI agent registry. One machine
and one mnemonic run both in the demo, but the chain doesn't care: two identities, two independent
decisions, one real transfer.

## Setup — what happens before any request

Two one-time scripts put the world in place. This is the part most demos skip; here it *is* the
point, because everything the buyer later trusts is written on chain in this step.

**Step 0 — create the money** (`npm run setup:asset`)
Creates the MAS0 settlement asset (USDM) and gives the buyer a float to spend from. The asset ID
lands in `.env` as `SETTLEMENT_ASSET_ID`.

**Step 1 — register both agents** (`npm run setup:registry`)
Writes each agent into the MOI agent registry: an **agent id**, its **wallet address**, its
**service URL**, and a **skill card** (the seller's says `sells-signals`). Their IDs land in `.env`
as `SELLER_AGENT_ID` / `BUYER_AGENT_ID`. This registry entry is what the buyer will later check the
quote against — it is the seller's identity, not just its listing.

Then the seller starts up and waits (`npm run seller`, or `npm run demo` runs both ends for you).

## The flow — from question to answer

What happens on `npm run demo`, in order:

1. **Discover.** The buyer scans the registry for an agent whose skill card advertises
   `sells-signals` — an O(n) client-side walk over every registered agent. It gets back the
   seller's agent id, **registered wallet**, and service URL. It was never handed a URL.
2. **Browse.** `GET /catalog` — free. The markets, their questions, and list prices are public;
   only the estimates cost money.
3. **Choose.** The buyer's brain (Groq, or a keyword fallback without an API key) picks the market
   that answers its question, and says why.
4. **Request.** `GET /signal/:id` with no payment. The seller answers **HTTP 402 Payment
   Required** plus a quote: the price for *that* market, the asset, and `payTo` — the address to
   send funds to.
5. **Judge the price.** Buyer policy, before anything is spent: is the quote within its ceiling,
   and is the seller's stated reason for the price acceptable? Refusing here costs nothing.
6. **Check the identity — the MOI step.** That `payTo` is 32 bytes; nothing in a payment protocol
   says *whose* address it is. The buyer asks the registry for the seller's registered wallet and
   refuses to pay if the quote disagrees (`--tamper` shows this refusal live). It also confirms the
   quoted asset is the one it holds.
7. **Pay.** The buyer submits its **own** MAS0 transfer of the quoted price to the seller. On MOI
   only the owner can move their own funds — no middleman, no escrow. The result is a real
   interaction hash on devnet.
8. **Prove.** The buyer signs a claim naming that transfer: from, to, asset, value, the tx hash,
   the resource being bought, a nonce, and an expiry. Then it retries the same GET with the claim
   attached as an `X-Payment-Proof` header.
9. **Verify.** The seller runs seven read-only checks in-process — proof is well-formed, the
   signature is valid, the signing key actually controls the paying account, the claim matches the
   quote, it hasn't expired, **the transfer really landed on chain** (it reads the interaction
   itself rather than trusting the buyer), and the transfer hash hasn't already been spent. Then it
   burns the hash so one payment buys exactly one thing.
10. **Deliver.** `200` with the estimate, plus an `X-Payment-Receipt` header naming the confirmed
    interaction. The buyer reads its answer. About a second, end to end.

The same flow, as a wire diagram:

```
buyer  registry: who sells signals?        -> agent id, wallet, URL   (never handed a URL)
buyer  GET /catalog                        -> free. questions AND prices are public
buyer  brain picks the market for its question
buyer  GET /signal/:id                     -> 402 + a quote at THAT market's price
buyer  is the price worth paying?          -> policy, before any money moves
buyer  is payTo the seller's REGISTERED wallet?   <- the MOI question
buyer  MAS0 transfer(seller, price)        -> the buyer moves its OWN funds
buyer  sign a claim naming that interaction hash
buyer  GET again + X-Payment-Proof
seller 7 read-only checks, in-process      -> confirms the transfer by reading the chain
seller 200 + estimate + X-Payment-Receipt
```

## Run it

**No offline mode — every run settles on Voyage devnet.**

```bash
cd session-7
npm install
cp .env.example .env
```

In `.env`, fill in two things:

- **`USER_MNEMONIC`** — one funded devnet mnemonic. Fund it at <https://voyage.moi.technology>
  (path `m/44'/6174'/7020'/0/0`).
- **`GROQ_API_KEY`** — a free key from <https://console.groq.com>. This is the agents' brain;
  without it they fall back to dumb keyword matching.

That one mnemonic gives you **two separate accounts** — the buyer and the seller each derive their
own wallet from it at a different derivation path (`.../0/0` and `.../0/1`). Only the buyer's needs
funding: it signs the payment, while the seller only ever receives.

Then set up the world once, and run the console:

```bash
npm run setup:asset           # MAS0 asset + buyer float -> SETTLEMENT_ASSET_ID
npm run setup:registry        # register both agents -> SELLER_AGENT_ID / BUYER_AGENT_ID
npm run ui                    # agent console at http://localhost:4000
```

Open <http://localhost:4000> and ask a question — every one spends real devnet money.

If something fails, it is usually environment: unfunded wallet, stale `SETTLEMENT_ASSET_ID`, agents
not registered, or devnet down. Re-run `setup:asset` / `setup:registry` as needed.

## Honesty guardrails

- **Nobody holds your money.** On MOI only the owner can move their own funds. The buyer submits
  its own transfer; the seller confirms it by reading the chain. There is no escrow and no custody.
- **The seller verifies its own payments.** That is why there is no facilitator. A facilitator on
  MOI could never do more than referee, and a seller can referee for itself.
- **Registry discovery is an O(n) client-side scan** (`getAllAgentIds` → profile → card → filter).
  No index, no search, not semantic.
- **No spend caps or budgets here.** Nothing constrains what the agent may spend.
- **No pay-on-delivery.** If the seller takes the money and does not deliver, the buyer loses it.
- **The probabilities are placeholders.** Every response carries a disclaimer — the invented
  numbers are not the point; the payment machinery is.
- **Replay protection is in memory.** Restart the seller and spent transfer hashes are spendable
  again. Fine for a demo, wrong for production.

## What each claim is enforced by

| Claim | Where |
| --- | --- |
| The seller is who it says it is | buyer `identity-check.ts`, **before** any money moves |
| The payer is who it says it is | `verify-proof.ts` checks 2–3 — signature, then key→account |
| The money actually moved | `verify-proof.ts` check 6 — reads the chain, not the buyer's word |
| One payment buys one thing | `verify-proof.ts` check 7 — the transfer hash is burned |

The signature is not decoration: transfers are public, so without binding the proof to the
keyholder anyone watching the chain could quote a stranger's transfer and collect the goods.

In the older x402 build, a facilitator asked "is `payTo` a registered agent?" — which meant the
seller asking whether it was itself. That check only matters when the party at risk asks it, so it
now runs once in the buyer, before funds move.

## Read the code in this order

Seven files, in demo order. Everything that makes the payment safe lives in these — and nowhere
else.

**1. `packages/shared/src/registry.ts` — finds the seller.**
The discovery layer over the MOI agent registry. `discoverBySkill` does an O(n) client-side scan:
list agent ids, fetch each profile, decode each agent card, filter on the `sells-signals` skill
tag. The agent cards are stored *inline* as base64 `data:` URIs, so nothing off-chain has to be up
for discovery to work. Two hard-won details live here: the scan goes by *owner* rather than
`getAllAgentIds()` (which reverts with `MeterExhausted` on a real registry, and the SDK swallows
the error so it looks like an empty registry), and profiles are fetched in batches of 6 (one at a
time meant ~22 seconds of dead air in the demo). It also exposes `readAgentWallet` — the single
source of truth the identity check reads later — and `updateAgentWallet`, which is how `--tamper`
repoints the listing at an attacker.

**2. `packages/agent-seller/src/index.ts` — the shopfront.**
The Signal Desk: a plain Express server with three routes. `GET /catalog` is free — the markets,
their questions, and list prices are public, because a buyer that cannot see what is on offer
cannot decide whether it wants it. `GET /signal/:id` is the paid route, wrapped in the paywall
middleware; per request it asks `pricing.ts` what to charge, feeding in how many copies of that
market it has sold this run (which is why asking twice can cost more). `GET /about` is a business
card. Notice how little payment code lives here: a price and a `payTo`. The wallet only ever
receives — it never signs, so the seller needs no gas.

**3. `packages/agent-seller/src/paywall.ts` — the tollgate.**
An Express middleware factory — the whole seller-side payment integration is this file plus
`verify-proof.ts`. The logic is one fork: no `X-Payment-Proof` header on the request? Build a
quote and reply `402 Payment Required` with it as JSON. Header present? Decode it, hand it to
`verifyProof`, and either run the wrapped handler and deliver the answer with an
`X-Payment-Receipt` header, or refuse with another 402 naming the reason (`quote_mismatch`,
`already_spent`, …) so the buyer learns why. It also owns the `ConsumedTransfers` set — in memory,
which is honest for a one-process demo and stated as wrong for anything real. The product handler
itself (`data-route.ts`) contains zero payment code; adding the paywall to an existing endpoint
changes the endpoint by zero lines.

**4. `packages/agent-seller/src/pricing.ts` + `packages/agent-buyer/src/worth.ts` — the money brains.**
One commercial judgment on each side of the trade. The seller's `decidePrice` sets a number per
request based on demand so far; the buyer's `worthIt` decides whether that number is acceptable.
Both consult a model (Groq), and both keep it away from anything it must not control. On the
seller side the model picks a price *inside a band computed in code* — list price to a demand
ceiling, clamped after the model answers, so a confused model cannot quote 0 or 10,000. On the
buyer side the hard ceiling (`MAX_PRICE_PER_ANSWER`, default 6) is checked with arithmetic
*before* the model is even asked, so no seller sales pitch can talk the agent past its limit; the
model only deliberates in the gray zone between list price and the ceiling. Both fall back to
local logic without an API key and say which path decided.

**5. `packages/agent-buyer/src/identity-check.ts` — the heart of it.**
43 lines, and the reason this runs on MOI. The quote carries two load-bearing fields: `payTo` (32
anonymous bytes) and `payToAgentId` (the seller's on-chain agent id). Before paying, the buyer
looks that agent id up in the registry, reads the wallet the agent actually registered, and
compares it to the quote's `payTo`. Mismatch → refuse, with both addresses in the verdict — and
nothing has been spent, because this runs before the transfer. No payment protocol can answer
"whose address is this?"; an on-chain identity registry can.

**6. `packages/agent-buyer/src/pay.ts` — the payment.**
The buyer's paying HTTP client, `payingFetch`. The sequence: GET the resource → receive `402` +
quote → run the `approve` callback (price judgment + identity check — the safety catch, placed
*before* the transfer because on MOI there is no escrow and nothing to claw back) → submit a MAS0
transfer **from the agent's own wallet** (only the owner can move its funds; nobody relays) → sign
a claim naming that transfer's interaction hash, the resource, a nonce, and an expiry → retry the
same GET with the claim base64'd into an `X-Payment-Proof` header → decode the
`X-Payment-Receipt` from the response.

**7. `packages/agent-seller/src/verify-proof.ts` — the seller's seven checks.**
All read-only, all in-process, in order: (1) the proof is well-formed; (2) the ECDSA signature
over the canonical claim bytes is valid; (3) the public key *derives to* the paying account — the
check that stops anyone claiming a stranger's public transfer as their own payment; (4) the claim
matches the quote (asset, payTo, resource, value); (5) it hasn't expired; (6) the transfer really
landed on chain — the seller fetches the interaction receipt and POLO-decodes the transfer
calldata itself, confirming sender, beneficiary, and amount rather than taking the buyer's word;
(7) the transfer hash hasn't already been spent. Pass all seven and the hash is burned: one
payment buys exactly one thing.

### The supporting files

The plumbing the seven sit on:

- **`shared/payment-proof.ts`** — the wire format: the `Quote`, `PaymentClaim`, `PaymentProof`,
  and `Receipt` types, the base64 header codecs, and `canonicalClaim` — the byte-exact signing
  format (field order pinned in an array, so signer and verifier can never disagree about JSON key
  order).
- **`shared/payment-verify.ts`** — `readTransfer`: how a MAS0 transfer is confirmed read-only.
  Fetches the interaction receipt, checks it succeeded, pulls the operation payload off the
  tesseract, and POLO-decodes the calldata with the SDK's own transfer schema to recover
  beneficiary and amount. Also home to `ConsumedTransfers`, the replay guard.
- **`shared/chain.ts` / `shared/config.ts`** — accounts (buyer and seller derived from the one
  mnemonic at different paths), provider, raw RPC, and all env parsing.
- **`agent-buyer/brain.ts`** — picks which market answers the question (Groq, or keyword overlap
  without a key). Deliberately has *no say* in whether to pay — that is deterministic code.
- **`agent-buyer/index.ts`** — the whole buyer loop in order: discover → browse → choose → request
  → judge price → check identity → pay → receive. The best single file to read top to bottom.
- **`agent-seller/catalog.ts`** — the four markets, each with a `listPrice` and a `maxPrice`: the
  bounds the pricing model must live inside.
- **`agent-seller/brain.ts`** — produces the estimate you paid for. The probabilities are
  placeholders and every response says so in a `disclaimer` field; the "model guess, no market
  data" suffix is appended in code, not requested from the model.
- **`agent-seller/data-route.ts` / `price.ts`** — the product handler (zero payment code) and the
  quote builder that attaches `payToAgentId`, the field that makes the identity check possible.
- **`scripts/`** — `00-setup-asset` and `01-register-agents` build the world; `demo`, `ui`, `ask`,
  `attack-test`, and `verify-sdk` run it.

## What is and isn't proven

**Run against Voyage devnet and observed working:**

| Command | Result |
| --- | --- |
| `npm run demo` | green — real interaction hash, real USDM moved |
| `npm run ui` / `npm run ask` | browser console and free-text demo, model brains live |
| `npm run demo -- --tamper` | buyer refuses, no funds move, registry restored |
| `npm run attack-test` | 11 forgeries rejected, honest control accepted |
| `npm run verify-sdk` | 63 assertions against live devnet |

## Layout

```
packages/shared        config, chain, wire types (payment-proof), payment-verify, registry
packages/agent-seller  Signal Desk: markets, Groq estimates, paywall + its own 7 checks
packages/agent-buyer   Risk Agent: brain, identity-check, pay
scripts/               00 setup-asset, 01 register-agents, verify-sdk, demo, attack-test
deck/                  7-slide talk; speaker notes are the script
```
