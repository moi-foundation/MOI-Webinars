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

1. `packages/shared/src/payment-proof.ts` — wire format + what gets signed
2. `packages/agent-seller/src/verify-proof.ts` — the 7 checks; this is the talk
3. `packages/agent-buyer/src/identity-check.ts` — the MOI aha (42 lines)
4. `packages/agent-buyer/src/pay.ts` — the client half
5. `packages/shared/src/payment-verify.ts` — how a transfer is confirmed read-only
6. `scripts/demo.ts` — the on-stage choreography

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
