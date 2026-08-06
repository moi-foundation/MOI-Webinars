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

## The flow

```
buyer  registry: who sells signals?        -> agent id, wallet, URL   (never handed a URL)
buyer  GET /catalog                        -> free. questions AND prices are public
buyer  brain picks the market for its question
buyer  GET /signal/:id                     -> 402 + a quote at THAT market's price
buyer  is payTo the seller's REGISTERED wallet?   <- the MOI question
buyer  MAS0 transfer(seller, price)        -> the buyer moves its OWN funds
buyer  sign a claim naming that interaction hash
buyer  GET again + X-Payment-Proof
seller 7 read-only checks, in-process      -> confirms the transfer by reading the chain
seller 200 + estimate + X-Payment-Receipt
```

## Run it

**No offline mode — every run settles on Voyage devnet.** You need one funded wallet (the buyer
signs; the seller only receives).

```bash
cd session-7
npm install
cp .env.example .env          # paste ONE funded devnet mnemonic
                              # fund at https://voyage.moi.technology
                              # path m/44'/6174'/7020'/0/0

npm run verify-sdk            # 63 assertions vs live devnet — no wallet needed
npm run setup:asset           # MAS0 asset + buyer float -> SETTLEMENT_ASSET_ID
npm run setup:registry        # register both agents -> SELLER_AGENT_ID / BUYER_AGENT_ID
npm run demo                  # happy path — real interaction hash at the end
```

Useful variants:

```bash
DEMO_PAUSE_MS=1200 npm run demo   # ~25s, narratable (default run is ~1.2s)
npm run demo -- --tamper          # attacker wallet in registry → buyer refuses, no funds move
npm run attack-test               # 11 forgeries rejected + honest control (~12 base units)
npm run ui                        # browser console at http://localhost:4000
npm run ask                       # free-text questions in the terminal (needs GROQ_API_KEY)
```

If something fails, it is usually environment: unfunded wallet, stale `SETTLEMENT_ASSET_ID`, agents
not registered, or devnet down. Re-run `setup:asset` / `setup:registry` as needed. If you Ctrl-C a
`--tamper` run mid-flight, run it again and let it finish — it restores the registry on the way out.

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
  its own transfer; the seller confirms it by reading the chain. There is no escrow and no custody.
- **The seller verifies its own payments.** That is why there is no facilitator. A facilitator on
  MOI could never do more than referee, and a seller can referee for itself.
- **Registry discovery is an O(n) client-side scan** (`getAllAgentIds` → profile → card → filter).
  No index, no search, not semantic.
- **No spend caps or budgets here.** Nothing constrains what the agent may spend.
- **No pay-on-delivery.** If the seller takes the money and does not deliver, the buyer loses it.
- **The probabilities are placeholders.** Every response carries a disclaimer — invent numbers are
  not the point; the payment machinery is.
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
