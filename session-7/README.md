# MOI Builders #7 — Agentic Payments (identity + payment)

**One AI agent buys data from another AI agent, paying on the MOI blockchain — with no human, no
account, and no API key.**

The product being traded is deliberately simple. The seller offers **probability estimates** for
four yes/no questions about bitcoin (for example: *"Will BTC trade above $100,000 before 31 Dec
2026?"*). Each estimate costs a few units of a token. The buyer is an agent that has a question,
finds the seller on chain, pays, and gets the number back. The estimates themselves are
placeholders — the point of the demo is the payment and identity machinery, not the data.

Plain-English walkthrough: [EXPLAINER.md](./EXPLAINER.md). Live talk script: speaker notes in
[`deck/MOI_Builders_S7-new.pptx`](./deck/MOI_Builders_S7-new.pptx).

## The core idea

A payment protocol tells you an amount and a 32-byte address to pay. It cannot tell you **whose
address that is** — an attacker who swaps the address in a quote is invisible to the payment
layer.

MOI fixes this because every agent is registered on chain with its wallet address. Before paying,
the buyer looks the seller up in the on-chain registry and compares the registered wallet against
the address in the quote. If they disagree, it refuses to pay. `npm run demo -- --tamper`
demonstrates this live: it changes the seller's registry entry to an attacker's address, and the
buyer detects the mismatch and refuses before any money moves.

## The two agents

| | Name | What it does |
| --- | --- | --- |
| **Seller** | *Signal Desk* (`packages/agent-seller`) | An HTTP server. Its list of questions and prices can be fetched by anyone for free; the probability estimates require payment. It decides its own price per request, and verifies incoming payments itself by reading the blockchain. |
| **Buyer** | *Risk Agent* (`packages/agent-buyer`) | A program that runs one purchase end to end, with no human input. It starts with only a question and a funded wallet — it is never given the seller's URL or payment address. Everything it learns about the seller comes from the on-chain registry. |

Each agent has its own wallet and its own entry in the MOI agent registry. In the demo both run on
one machine from one mnemonic (at two different derivation paths), but on chain they are two
separate identities making one real transfer between them.

## Setup — what happens before any request

Two one-time scripts create everything the demo depends on. This matters because the registry
entry written here is exactly what the buyer will later verify the payment against.

**Step 0 — create the payment token** (`npm run setup:asset`)
Creates a MAS0 asset (a native MOI token, symbol `USDM`) that the agents will pay each other with,
and gives the buyer a starting balance of 100,000 units. The asset ID is written to `.env` as
`SETTLEMENT_ASSET_ID`.

**Step 1 — register both agents** (`npm run setup:registry`)
Writes each agent into the MOI agent registry: an **agent id**, its **wallet address**, its
**service URL**, and a **skill card** — a small JSON document describing what the agent offers.
The seller's card is tagged `sells-signals`, which is the exact string the buyer will search for.
The generated ids are written to `.env` as `SELLER_AGENT_ID` / `BUYER_AGENT_ID`. This registry
entry is the seller's on-chain identity: the wallet address recorded here is what the buyer will
later compare payment requests against.

After setup, the seller runs as a web server and waits for requests (`npm run demo` starts both
agents for you).

## The flow — from question to answer

What happens on `npm run demo`, in order:

1. **Discover.** The buyer searches the registry for an agent whose skill card is tagged
   `sells-signals`, by fetching every registered agent's profile and filtering client-side. It
   gets back the seller's agent id, **registered wallet address**, and service URL. Nobody told
   it where the seller is — it found the URL on chain.
2. **Browse.** The buyer fetches `GET /catalog` from the seller. This route requires no payment
   and returns the list of four questions with their prices. The paid part is the probability
   estimate for a question, not the list itself.
3. **Choose.** The buyer's language model (Groq; a keyword matcher if no API key is set) picks
   which of the four questions best answers the buyer's own question, and states its reasoning.
4. **Request.** The buyer fetches `GET /signal/:id` for the chosen question, without paying yet.
   The seller responds with **HTTP 402 Payment Required** and a quote in the response body: the
   price for that question, the token to pay in, and `payTo` — the wallet address to send the
   payment to.
5. **Judge the price.** Before spending anything, the buyer checks the quoted price against its
   own spending limit and decides whether the price is acceptable. Refusing at this point costs
   nothing.
6. **Verify the seller's identity — the step that needs MOI.** The `payTo` address in the quote
   is just 32 bytes; nothing about it says who owns it. The buyer reads the seller's registered
   wallet from the on-chain registry and compares it to `payTo`. If they differ, it refuses to
   pay (`--tamper` demonstrates exactly this). It also confirms the quote asks for the token it
   actually holds.
7. **Pay.** The buyer submits a MAS0 token transfer of the quoted price to the seller, signed
   with its own wallet. On MOI only the owner of funds can move them — there is no intermediary
   that pays on your behalf, and no escrow. The transfer produces a real transaction hash
   (called an interaction hash on MOI) on devnet.
8. **Prove the payment.** The buyer signs a statement listing what it paid: sender, recipient,
   token, amount, the transaction hash from step 7, the URL being bought, a random nonce, and an
   expiry time. It repeats the `GET /signal/:id` request with this signed statement attached as
   an `X-Payment-Proof` HTTP header.
9. **Verify the payment.** The seller runs seven checks, all reads, all inside its own process:
   the proof is complete; the signature is valid; the signing key actually belongs to the account
   that paid; the claimed payment matches what was quoted; it hasn't expired; **the transfer
   really exists on chain** (the seller looks the transaction up itself rather than trusting the
   buyer's word); and this transaction hash hasn't been used to buy something already. It then
   records the hash as spent, so the same payment cannot be reused.
10. **Deliver.** The seller responds `200` with the probability estimate, plus an
    `X-Payment-Receipt` header naming the confirmed transaction. The whole exchange takes about a
    second.

The same flow, message by message:

```
buyer  searches registry for "sells-signals"  -> gets agent id, wallet address, URL
buyer  GET /catalog                           -> no payment needed; the list of questions + prices
buyer  model picks the question to buy
buyer  GET /signal/:id                        -> 402 + quote (price, token, payTo address)
buyer  is the price within my limit?          -> checked before any money moves
buyer  does payTo match the seller's registered wallet?   <- the check only MOI enables
buyer  MAS0 transfer(seller, price)           -> buyer pays from its own wallet
buyer  signs a statement naming that transaction hash
buyer  GET /signal/:id again + X-Payment-Proof header
seller runs 7 read-only checks               -> confirms the transfer by reading the chain
seller 200 + estimate + X-Payment-Receipt header
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
- **`GROQ_API_KEY`** — a free key from <https://console.groq.com>. This is the language model
  both agents use to make decisions; without it they fall back to simple keyword matching.

That one mnemonic gives you **two separate accounts** — the buyer and the seller each derive their
own wallet from it at a different derivation path (`.../0/0` and `.../0/1`). Only the buyer's needs
funding: it signs the payment, while the seller only ever receives.

Then run the two setup scripts once, and start the demo:

```bash
npm run setup:asset           # create the payment token + buyer balance -> SETTLEMENT_ASSET_ID
npm run setup:registry        # register both agents on chain -> SELLER_AGENT_ID / BUYER_AGENT_ID
npm run ui                    # agent console at http://localhost:4000
```

Open <http://localhost:4000> and ask a question — every one spends real devnet money.

If something fails, it is usually environment: unfunded wallet, stale `SETTLEMENT_ASSET_ID`, agents
not registered, or devnet down. Re-run `setup:asset` / `setup:registry` as needed.

## Limitations, stated plainly

- **Nobody holds your money.** On MOI only the owner of funds can move them. The buyer submits its
  own transfer; the seller confirms it by reading the chain. There is no escrow and no third party
  holding funds anywhere in this demo.
- **The seller verifies its own payments.** There is no separate verification service, because on
  MOI such a service could only ever double-check what the seller can already read from the chain
  itself.
- **Registry discovery fetches and filters every agent client-side.** The registry has no search
  or index — the buyer downloads each agent's profile and checks its tags one by one.
- **No spend caps or budgets.** Nothing on chain constrains how much the agent may spend; its
  limit is a number in its own code.
- **No refunds and no delivery guarantee.** If the seller takes the payment and returns nothing,
  the buyer has no recourse.
- **The probability estimates are placeholders.** There is no real model or market data behind
  them; every response carries a disclaimer saying so. The payment machinery is the real part.
- **Replay protection is in memory only.** The seller tracks used payment hashes in a variable.
  Restart the seller and previously used payments would be accepted again — acceptable for a demo,
  not for production.

## Where each security claim is enforced

| Claim | Where |
| --- | --- |
| The seller is who it says it is | buyer's `identity-check.ts`, **before** any money moves |
| The payer is who it says it is | `verify-proof.ts` checks 2–3 — signature, then key→account |
| The money actually moved | `verify-proof.ts` check 6 — reads the chain, not the buyer's word |
| One payment buys one thing | `verify-proof.ts` check 7 — the transaction hash is recorded as spent |

Why the proof must be signed: transfers on a blockchain are public, so anyone can see the buyer's
transaction hash. Without a signature tying the proof to the account that paid, a bystander could
submit someone else's transaction hash and collect the data it paid for.

## Read the code in this order

Seven files, in demo order. Everything that makes the payment safe lives in these — and nowhere
else. Each entry starts with what the file does for the program, then only the details that
matter.

### 1. `packages/shared/src/registry.ts`

**What it does: lets the buyer find the seller on chain, and read the seller's registered wallet —
the fact the identity check depends on.**

- `discoverBySkill` scans the registry for agents whose card carries the `sells-signals` tag and
  returns the seller's agent id, registered wallet, and service URL. It is an O(n) client-side
  scan — the registry has no search.
- `readAgentWallet` reads one agent's registered wallet. This is the identity check's source of
  truth.
- `updateAgentWallet` repoints a listing (owner-only) — it's how `demo --tamper` stages the
  attack. `createAgentEntry` is what setup uses to register the agents.

### 2. `packages/agent-seller/src/index.ts`

**What it does: runs the seller — an HTTP server with one free route (the list of questions and
prices) and one paid route (the probability estimate itself).**

- `GET /catalog` requires no payment and returns the four questions with their prices, so a buyer
  can see what is on offer before deciding.
- `GET /signal/:id` returns the estimate and requires payment — it is wrapped in the paywall
  middleware. On every request it asks `pricing.ts` what to charge, factoring in how many copies
  of that estimate it has already sold — so buying the same estimate twice can cost more the
  second time.
- The seller's wallet only ever receives funds. It never signs a transaction, so it needs no gas.

### 3. `packages/agent-seller/src/paywall.ts`

**What it does: guards the paid route — quotes when there's no payment, verifies when there is,
and only delivers after verification passes.**

- No `X-Payment-Proof` header → reply `402 Payment Required` with the quote as JSON.
- Header present → decode it, run `verifyProof`, and either deliver the answer with an
  `X-Payment-Receipt` header, or reply 402 again with the specific rejection reason
  (`quote_mismatch`, `already_spent`, …).
- Owns the in-memory set of spent transfer hashes (fine for a demo, wrong for production).

### 4. `packages/agent-seller/src/pricing.ts` + `packages/agent-buyer/src/worth.ts`

**What they do: the two pricing decisions — the seller decides what to charge for each request,
and the buyer decides whether that price is acceptable. Both consult a language model, but only
within limits enforced by ordinary code.**

- Seller (`decidePrice`): the model chooses a price between the question's list price and a
  ceiling that rises with demand — both bounds computed in code — and whatever the model answers
  is clamped back into that range. A malfunctioning model cannot quote 0 or 10,000.
- Buyer (`worthIt`): the buyer's maximum price per answer (`MAX_PRICE_PER_ANSWER`, default 6
  units) is checked with a plain numeric comparison *before* the model is consulted, so nothing
  the seller says can push the agent past its limit. The model only weighs in on prices between
  the list price and that maximum.

### 5. `packages/agent-buyer/src/identity-check.ts`

**What it does: before paying, verifies that the payment address in the quote is really the
wallet this seller registered on chain. This is the check that requires MOI.**

- The quote carries two fields: `payTo` (the address to pay, 32 bytes that identify nobody by
  themselves) and `payToAgentId` (the seller's registry id, which makes the address verifiable).
  The buyer looks the agent id up in the registry and compares the registered wallet to `payTo`.
- If they differ, the buyer refuses and reports both values ("registry says" vs "quote says").
  This runs *before* the transfer, so nothing has been spent yet.
- If the registry entry cannot be read at all, the buyer also refuses. 43 lines total.

### 6. `packages/agent-buyer/src/pay.ts`

**What it does: the buyer's HTTP client that handles the whole payment sequence — request, receive
the 402 quote, pay on chain, prove it, and retry.**

- On a 402 response, it first runs an `approve` callback containing the buyer's checks (the price
  judgment and the identity check). This happens deliberately *before* the transfer, because there
  is no escrow — once funds move, they cannot be recovered.
- If approved, it submits a MAS0 token transfer **signed by the buyer's own wallet** — on MOI no
  other party is able to move the buyer's funds.
- It then signs a statement naming that transfer (sender, recipient, amount, transaction hash,
  URL, nonce, expiry) and repeats the request with the statement in the `X-Payment-Proof` header.
  On success it returns the purchased data plus the seller's receipt.

### 7. `packages/agent-seller/src/verify-proof.ts`

**What it does: how the seller verifies a payment on its own, with seven checks that only read
data — no third-party verification service involved.**

1. `proof_well_formed` — the claim, signature, and public key are all present
2. `signature_valid` — the signature verifies against the claim's canonical byte form
3. `key_binds_to_payer` — the public key mathematically derives to the account that paid; this
   stops someone submitting another person's (publicly visible) transaction as their own payment
4. `matches_quote` — the token, recipient, and URL match the quote, and the amount covers the price
5. `not_expired` — the claim's expiry time hasn't passed
6. `transfer_landed_on_chain` — the seller looks the transaction up on the blockchain itself and
   confirms the sender, recipient, and amount — it does not take the buyer's word for any of it
7. `transfer_not_already_spent` — this transaction hash hasn't been used for a previous purchase;
   it is then recorded as spent, so one payment buys exactly one thing

## The supporting files

- **`shared/payment-proof.ts`** — the wire format: the `Quote`, `PaymentClaim`, `PaymentProof`,
  and `Receipt` types, the base64 header codecs, and the canonical byte format the signature is
  computed over.
- **`shared/payment-verify.ts`** — `readTransfer`: confirms a transfer by reading raw chain state
  (receipt → tesseract → decode the calldata) to recover sender, beneficiary, and amount. Also the
  replay-guard set.
- **`shared/chain.ts`** — accounts (buyer and seller derived from the one mnemonic at different
  paths), the devnet connection, and `identifierFromPublicKey` — the function that derives an
  account id from a public key, which is what verification check 3 uses.
- **`shared/config.ts`** — env parsing; required vars throw by name.
- **`shared/steps.ts` / `log.ts`** — the same narration twice: structured step events for the
  browser UI, banners for the terminal, emitted from the same call sites so they can't drift.
- **`agent-buyer/brain.ts`** — picks which of the seller's questions best matches the buyer's own
  question (Groq, keyword fallback without a key). Has no say in whether to pay — that decision is
  ordinary deterministic code.
- **`agent-buyer/index.ts`** — the buyer's whole loop, top to bottom: discover → browse → choose →
  judge price → check identity → pay → receive.
- **`agent-seller/catalog.ts`** — the four questions on offer, each with its price bounds
  (`listPrice` / `maxPrice`). Plain data; no model involved.
- **`agent-seller/brain.ts`** — produces the probability estimate that gets sold. The numbers are
  placeholders; every response carries a `disclaimer` field saying so.
- **`agent-seller/data-route.ts` / `price.ts`** — the route handler that returns the estimate
  (it contains no payment code — payment is entirely the middleware's job) and the function that
  builds the quote, including the `payToAgentId` field the identity check needs.

## The scripts

- **`00-setup-asset.ts`** (`npm run setup:asset`) — creates the MAS0 payment token and mints the
  buyer a starting balance of 100,000 units; writes `SETTLEMENT_ASSET_ID` to `.env`. Safe to
  re-run: it reuses an existing asset and skips minting if the balance is already there.
- **`01-register-agents.ts`** (`npm run setup:registry`) — registers both agents on chain and
  writes their ids to `.env`. The buyer's wallet signs both registrations (it owns them); the
  seller's wallet is only recorded as the payment address and never has to sign anything.
- **`demo.ts`** (`npm run demo`) — the terminal demo. With `--tamper`, it first changes the
  seller's registry wallet to an attacker's address, expects the buyer to detect this and refuse,
  and restores the correct entry afterwards.
- **`ui.ts`** (`npm run ui`) — the agent console at `http://localhost:4000`; narrates the run as
  live cards with the balance ticking down.
- **`ask.ts`** (`npm run ask`) — free-text questions in the terminal.
- **`attack-test.ts`** (`npm run attack-test`) — 11 forged payments, each rejected for its
  specific reason, plus one honest control that must pass.
- **`verify-sdk.ts`** (`npm run verify-sdk`) — 63 assertions against live devnet, so the demo's
  SDK claims stay checked rather than remembered.

## What has been tested

**Run against Voyage devnet and observed working:**

| Command | Result |
| --- | --- |
| `npm run demo` | passes — a real on-chain transaction, real USDM moved |
| `npm run ui` / `npm run ask` | browser console and free-text demo work, with the model live |
| `npm run demo -- --tamper` | buyer refuses, no funds move, registry entry restored |
| `npm run attack-test` | all 11 forged payments rejected, the honest control accepted |
| `npm run verify-sdk` | 63 assertions against live devnet pass |

## Layout

```
packages/shared        config, chain access, payment wire format, transfer verification, registry
packages/agent-seller  the seller: question catalog, estimates, paywall, payment verification
packages/agent-buyer   the buyer: question matching, identity check, payment client
scripts/               setup (asset, registration), demo, ui, ask, attack-test, verify-sdk
deck/                  the 7-slide talk; speaker notes are the script
```
