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

### 1. `packages/shared/src/registry.ts` — finds the seller

The discovery layer over the on-chain MOI agent registry, built on `js-moi-agent-registry`. Every
function here is a thin, honest wrapper with one job:

- **`registryClient(account)`** initialises the SDK's `AgentRegistry`. A subtlety documented in
  the file: `init()` works with an unfunded wallet, but every *read* builds a sender, so the
  calling account must already exist on chain — which is why the buyer (the funded wallet) is
  always the one making registry calls.
- **`dataUriUploader`** — agent cards are stored *inline* as `data:application/json;base64,…`
  URIs, written straight into the registry entry. No external host, no IPFS, nothing off-chain
  that could be down during a live demo. `readInlineCard` is the mirror image: it decodes that URI
  back into JSON.
- **`cardSkills(card)`** — pulls the skills array out of a decoded card. The SDK's
  `buildAgentCard` nests everything as `{ spec, agent_card }` and snake_cases the fields, so
  skills live at `agent_card.skills`, *not* at the top level. Getting this wrong doesn't error —
  it silently returns zero matches from discovery — which is why it's a named function.
- **`discoverBySkill(reg, tag, owner)`** — the discovery scan itself. It is an O(n) client-side
  walk: list agent ids → fetch each profile → decode each inline card → keep the ones whose skill
  tags include `sells-signals`. The registry has no index and no search. Two production scars are
  baked in: the scan lists ids **by owner** rather than calling `getAllAgentIds()`, because on a
  real registry (~135 agents on devnet) that routine reverts with `builtin.MeterExhausted` — and
  the SDK swallows the revert and returns `[]`, so discovery silently "finds nothing" instead of
  failing loudly. And profiles are fetched in **parallel batches of 6**, because fetching them one
  at a time meant 17 agents took ~22 seconds — most of the demo spent staring at nothing. The
  return value includes `scanned` so a caller can tell "the scan failed" apart from "nothing
  matched".
- **`readAgentWallet(reg, agentId)`** — reads one agent's registered `agent_wallet` and returns it
  normalised. This is the identity check's single source of truth.
- **`updateAgentWallet` / `createAgentEntry`** — owner-only writes. The first is how
  `demo --tamper` repoints the seller's listing at an attacker; the second is what
  `setup:registry` uses to register both agents, building the full A2A card (name, description,
  version, URL, transport, capabilities, skills) and inlining it.

### 2. `packages/agent-seller/src/index.ts` — the shopfront

The Signal Desk. `startSeller()` derives the seller account, prints its boot banner (wallet, agent
id, catalog, which brain is live), and stands up a plain Express server on `127.0.0.1:4011` with
three routes:

- **`GET /catalog` — free.** Returns the seller's name, agent id, asset symbol, and the four
  markets with their questions, horizons, list prices, and max prices. The questions are public on
  purpose: a buyer that cannot see what is on offer cannot decide whether it wants it. The paywall
  sits exactly on the seam that matters — the *question* is free, the *answer* is not.
- **`GET /signal/:id` — paid.** The product route, wrapped in the `paywall(...)` middleware. The
  interesting part is the `resolve` callback passed to the paywall: on every request it looks the
  market up in the catalog and asks `pricing.ts` what to charge *right now*, feeding in a `sold`
  counter of how many copies of that market this process has sold this run — which is why asking
  for the same market twice can cost more the second time. An id with no catalog entry is charged
  the configured default rate rather than given away.
- **`GET /about` — a business card.** Name, agent id, address, what it sells.

It also wires a `narrate` callback that turns the paywall's events (`quoted`, `proof-received`,
`checked`, `produced`, `rejected`) into the numbered terminal banners you see during the demo —
and forwards the same events unfiltered to anything else watching (the browser UI).

Notice how little payment code lives here: a price and a `payTo`. The seller's wallet only ever
receives; it never signs anything, so it needs no gas and no funding.

### 3. `packages/agent-seller/src/paywall.ts` — the tollgate

An Express middleware factory: `paywall(payTo, produce, resolve, onEvent)` returns a request
handler. Together with `verify-proof.ts` this is the *entire* seller-side payment integration —
no facilitator process, no facilitator URL to configure, nothing else to keep alive.

Per request, in order:

1. Build the `resource` URL from the request itself (protocol + host + path, query stripped) —
   this is the string the payment will be bound to.
2. Call `resolve(req)` to get what's being sold and today's price for it, then `buildQuote` to
   assemble the full quote (price, asset, `payTo`, `payToAgentId`, resource, TTL…).
3. **No `X-Payment-Proof` header?** Emit `quoted` and reply `402 Payment Required` with the quote
   as the JSON body. That's the whole "please pay" message.
4. **Header present?** Base64-decode it into a `PaymentProof`. A header that doesn't decode gets
   `402` with `error: "malformed_proof"` rather than a crash.
5. Hand the proof to `verifyProof(...)` with `consume: true`. The seller account is loaded lazily
   on first use — `verify` needs no private key material, just the wallet object that exposes the
   verify routine.
6. **Verification failed?** Reply `402` again, with the quote plus `error` set to the specific
   reason (`invalid_signature`, `quote_mismatch`, `payment_expired`, `transfer_not_found`,
   `already_spent`, …) so the buyer learns exactly why.
7. **Verification passed?** Only now run `produce(req)` — the actual product handler — and reply
   `200` with the data, plus an `X-Payment-Receipt` header (base64 JSON: `paid`, the confirmed
   transfer hash, the network name, the payer) as the buyer's proof of purchase.

It also owns the `ConsumedTransfers` instance — the set of spent transfer hashes. It is in-memory,
which the file itself calls out as honest for a one-process demo and wrong for anything real:
forgetting a spent transfer is how you get paid once and deliver twice.

### 4. `packages/agent-seller/src/pricing.ts` + `packages/agent-buyer/src/worth.ts` — the money brains

One commercial judgment on each side of the trade, and a matched pair of design decisions about
what a model may and may not control.

**`pricing.ts` — the seller's second brain: what to charge.** `decidePrice(market, soldToday)`
returns a price, a one-line reason in the desk's own words, and which brain decided. The mechanics:

- `ceilingFor` computes a demand band in *code*: the ceiling starts at the market's `listPrice`
  and rises by 1 for every 2 copies sold today, capped at the catalog's `maxPrice`. A first sale
  is always at list price — otherwise the buyer refuses and the demo dies at the quote.
- If there's no room to negotiate (ceiling == list), the model isn't even called — no point
  spending a model call to choose between one option.
- Otherwise Groq is asked to pick a number *inside the band*, given the question, horizon, list
  price, ceiling, and copies sold — and whatever it answers is **clamped** to `[listPrice,
  ceiling]` after the fact. The model proposes; the catalog decides what is allowed. A confused
  model cannot quote 0 or 10,000.
- No API key, or the model errors? A deterministic local fallback takes the top of the band and
  says `local-fallback` so nobody mistakes it for a model decision.

The file states the two things deliberately *not* the model's to decide: the bounds, and whether a
payment is valid — "a model that can be argued with must never sit on the security path."

**`worth.ts` — the buyer's second decision: is that price acceptable?** `worthIt(...)` returns an
accept/refuse verdict with a reason. The order of checks is the point:

- The hard ceiling — `SOFT_LIMIT`, from `MAX_PRICE_PER_ANSWER`, default 6 base units — is checked
  with plain arithmetic **before the model is asked anything**. The seller's `priceReason` is a
  sales pitch, and no amount of persuasion in it can talk the agent past this line.
- At or below list price there is nothing to deliberate: auto-accept. (A model that occasionally
  refuses the advertised price would make the demo look broken rather than discerning.)
- Only in the gray zone — above list, under the ceiling — does the model weigh in: is this answer
  relevant enough to my question to justify the markup? It is explicitly told the seller's
  justification is a pitch and to weigh it sceptically.
- Local fallback without a key: refuse over the limit, refuse over 3x list, otherwise accept.

### 5. `packages/agent-buyer/src/identity-check.ts` — the heart of it

43 lines, and the reason this session runs on MOI. `checkSellerIdentity(registry, quote)`:

- The quote carries two load-bearing fields: `payTo` — the address to send money to, which is 32
  anonymous bytes — and `payToAgentId`, the seller's on-chain agent id. The second field is what
  makes the first checkable.
- The buyer calls `readAgentWallet(registry, agentId)` — the same registry it discovered the
  seller in — and compares the wallet the agent *registered* against the `payTo` the quote is
  *asking for*, after normalising both.
- **Mismatch → refuse**, with both addresses in the verdict so the output can show "registry
  says" and "quote says" side by side. Nothing has been spent: this runs before the transfer.
- If the registry entry can't be read at all, that's a refusal too (fail closed, with the error as
  the reason). The only case that passes without a check is when there is genuinely nothing to
  check against — no registry or no agent id in the quote — and that is labelled "paying on
  trust" rather than silently treated as verified.

The file's own header says why this survived the x402 rewrite unchanged: any payment protocol
tells you *where* to send money; none of them tell you *whose* address that is. That answer has to
come from somewhere, and here it comes from the chain.

### 6. `packages/agent-buyer/src/pay.ts` — the payment

The buyer's paying HTTP client, `payingFetch(url, { buyer, approve, onEvent })`. One function, the
whole client half of the protocol:

1. **GET the resource with no payment.** If the response is not a 402 (a free route), just return
   the data — done.
2. **Parse the 402 body as a quote** and sanity-check it has a `payTo`, an `asset`, and a `price`.
3. **Run the `approve` callback — the safety catch.** This is where the buyer's whole policy lives
   (in `index.ts`: the price judgment, then the identity check, then "is the quoted asset the one
   I actually hold"). It runs **before** the transfer on purpose: on MOI there is no escrow and
   nothing to claw back — once funds move they are gone — so every question worth asking has to be
   asked here. If `approve` returns a refusal string, `payingFetch` throws `PaymentRefused` and no
   money ever moves.
4. **Submit the transfer, from the buyer's own wallet:** `new MAS0AssetLogic(quote.asset,
   buyer.wallet).transfer(quote.payTo, amount).send()`, then wait for the result and fail loudly
   if the interaction reverted. On MOI nobody else *can* move the buyer's funds — there is no
   permission-slip mechanism for a third party to relay this. (One wire-level wart is documented
   inline: the transfer amount must be a `number`, because a `bigint` breaks signing in the SDK.)
5. **Sign a claim naming that transfer.** The claim is `{ from, to, asset, value, txHash,
   resource, nonce, expiresAt }` — the buyer's identity, the seller's, what was paid, *which
   on-chain interaction paid it*, what it buys, a 32-byte random nonce, and an expiry (now + the
   quote's TTL, default 120s). It is signed over `canonicalClaimBytes` with ECDSA secp256k1.
6. **Retry the same GET once**, with `{ claim, publicKey, keyId, signature }` base64-encoded into
   the `X-Payment-Proof` header.
7. **Read the outcome.** A second 402 at this point is the worst case — the money is already gone
   — so it throws a deliberately loud `PaymentRefused` naming the transfer hash and the seller's
   stated reason. On success, the `X-Payment-Receipt` header is decoded and returned along with
   the data.

### 7. `packages/agent-seller/src/verify-proof.ts` — the seller's seven checks

`verifyProof({ seller, consumed, proof, quote, consume })` — the seller checking its own payment.
Every check is read-only and in-process, each gets a named result the demo prints as a tick or a
cross, and the first failure bails with a specific reason:

1. **`proof_well_formed`** — claim, signature, and public key are all present. Bail:
   `invalid_proof`.
2. **`signature_valid`** — the ECDSA signature verifies over the *canonical* claim bytes (the
   pinned-order array from `payment-proof.ts`, so signer and verifier can never disagree about
   JSON key ordering). Bail: `invalid_signature`.
3. **`key_binds_to_payer`** — the public key in the proof is run through
   `identifierFromPublicKey` and must derive to exactly `claim.from`, the account that was
   debited. This is the anti-theft check: transfers are public, so a valid signature alone could
   still *claim* someone else's transfer — this proves the signer controls the paying account.
   Bail: `invalid_proof`.
4. **`matches_quote`** — the claim's asset, `payTo`, and resource equal the quote's, and the value
   covers the quoted price. Underpayment fails here. Bail: `quote_mismatch`.
5. **`not_expired`** — the claim's `expiresAt` hasn't passed. Bail: `payment_expired`.
6. **`transfer_landed_on_chain`** — the big one. The seller calls `readTransfer` (in
   `shared/payment-verify.ts`) to fetch the interaction the claim names and confirm it
   *independently*: the interaction exists and succeeded, the sender is `claim.from`, the
   decoded beneficiary is `claim.to`, the decoded amount covers the value, and the callsite is
   actually a transfer. Nothing is taken on the buyer's word. Bail: `transfer_not_found` /
   `transfer_mismatch`.
7. **`transfer_not_already_spent`** — the transfer hash isn't in the `ConsumedTransfers` set.
   Bail: `already_spent`. On success (and when `consume` is true) the hash is burned — one payment
   buys exactly one thing.

The file's header records what was *dropped* from the x402 version and why: `scheme_and_network`
was protocol bookkeeping with nothing left to negotiate, and `payee_is_registered_agent` was the
seller asking whether it was itself — that question only means something asked by the party at
risk, so it moved to the buyer as `identity-check.ts`, before any money moves.

## The supporting files

The plumbing the seven sit on.

**`shared/payment-proof.ts` — the wire format.** The whole protocol's vocabulary in one file:

- `Quote` — what a 402 carries: `price` (atomic units, as a decimal string, because JSON has no
  bigint), `asset`, `payTo`, **`payToAgentId`** (the field the identity check depends on),
  `resource` (the absolute URL being bought, binding the payment to the purchase), `ttlSeconds`,
  plus the price-transparency fields (`listPrice`, `priceReason`, `pricedBy`) and an `error` slot
  used when a submitted payment is rejected.
- `PaymentClaim` / `PaymentProof` — what the buyer signs and how it travels: the claim plus the
  compressed public key (hex, no `0x`), key id, and signature.
- `Receipt` — what the seller returns: `paid`, the confirmed transfer hash, network, payer.
- The base64 codecs (`encodeProof`/`decodeProof`, `encodeReceipt`/`decodeReceipt`) — HTTP headers
  can't carry raw JSON safely.
- **`canonicalClaim`** — the byte-exact signing format: a JSON *array* with a version prefix
  (`"moi-agent-payment-v1"`) and the fields in pinned order, so the signature can never break on
  key-order differences between signer and verifier.

**`shared/payment-verify.ts` — reading a transfer off the chain.** `readTransfer(txHash, assetId)`
reconstructs the facts of a MAS0 transfer from raw chain state: fetch `moi.InteractionReceipt`
(exists? status 0? no per-operation errors?), then fetch the containing tesseract with
`with_interactions: true` — because operation *payloads* live on the tesseract, not the receipt —
find the `ASSET_INVOKE` operation on the right asset, and POLO-decode its calldata with the SDK's
own `TRANSFER_SCHEMA` to recover the beneficiary and amount. Returns
`{ from, beneficiary, amount, callsite, … }` for check 6 to compare against the claim. Also home
to `ConsumedTransfers`, the replay guard: a `Set` of lowercased spent hashes with
`consume`/`has`.

**`shared/chain.ts` — accounts and chain access.** `loadAccount` derives a wallet from the one
mnemonic at a given path and connects it to a `VoyageProvider("devnet")`;
`buyerAccount`/`sellerAccount` are the two fixed derivations. `identifierFromPublicKey` rebuilds a
MOI participant id from a compressed public key (verified live against `wallet.getIdentifier()`) —
the primitive behind verify-proof's check 3. Also: `existsOnChain` (registry reads require the
caller's account to exist), `waitReceipt` (poll for an interaction receipt),
`receiptError` (a receipt is not success on its own — status and per-op errors both checked), and
`rawRpc` for JSON-RPC methods the typed provider doesn't wrap.

**`shared/config.ts` — env parsing, single source of truth.** Required vars throw *by name*
(`USER_MNEMONIC`, `SETTLEMENT_ASSET_ID`); optional ones have explicit defaults — derivation paths
(`…/0/0` buyer, `…/0/1` seller), seller URL/port, the `NETWORK` constant that names the chain in
quotes and receipts, `authTtlSeconds` (120), and the Groq key/model.

**`shared/steps.ts` — the UI's event stream.** The structured twin of the terminal banners: an
`AgentStep` is `{ n, actor, title, thought, detail, checks, data, status }` — which stage, who is
acting, first-person reasoning, ordered facts, and whether it went well. `StepEmitter` numbers
them. Terminal banners and UI steps are emitted from the *same call sites*, so the two narrations
can never drift apart. (`shared/log.ts` is the terminal half: banners, details, ticks, crosses,
summaries.)

**`agent-buyer/brain.ts` — what to buy.** `chooseMarket(question, catalog)` picks the market whose
resolution best answers the question — Groq with a JSON response format, validated against the
catalog (a model that picks an unknown id is treated as an error), with keyword-overlap fallback
that says `local-fallback` so a vague match is never passed off as reasoning. The header states
the boundary: this brain has *no say in whether to pay*. That is `approve()` — deterministic
identity and asset checks — because "a model deciding whether a payment is safe would make every
security claim in this demo worthless."

**`agent-buyer/index.ts` — the buyer's whole loop.** The best single file to read top to bottom:
boot → discover (registry scan, with the found agent's card skills printed) → browse the catalog →
choose a market → and then the `approve` callback wiring price judgment (`worth.ts`) + identity
check (`identity-check.ts`) + asset check in front of `payingFetch` — plus the narration of every
step to both terminal and UI. A refusal is treated as a *successful* outcome of the agent's policy
(it declined to be defrauded), not an error.

**`agent-seller/catalog.ts` — the four markets.** Each with `id`, `question`, `horizon`,
`listPrice`, `maxPrice`, and topic tags. The bounds the pricing model must live inside are data
here, not model output. The price ladder is deliberate: the long-horizon round-number market is
cheapest (little edge to sell), the drawdown market people actually hedge is dearest.

**`agent-seller/brain.ts` — the product.** `estimate(market)` produces the probability you paid
for. The probabilities are **made up** — no model data, no backtest — and the file is loud about
it: every response carries a `disclaimer` field, the Groq prompt forbids implying data analysis,
and the `basis` string gets a "— model guess, no market data" suffix appended *in code*, not
requested from the model (models cheerfully claim "historical volatility analysis" they never
did). A paid request never fails because the model is down — it falls back to canned values and
labels them `local-fallback`.

**`agent-seller/data-route.ts` + `price.ts` — the seam.** `data-route.ts` is the product handler:
look up the market, return the estimate — *zero* payment code, which is the point: adding the
paywall to an existing endpoint changes the endpoint by zero lines. `price.ts` is `buildQuote`,
which assembles the wire-format quote and attaches `payToAgentId` — the one field that turns 32
anonymous bytes into something the buyer can verify.

## The scripts

- **`scripts/00-setup-asset.ts`** (`npm run setup:asset`) — creates the native MAS0 asset (symbol
  `USDM`, supply 1B) with the buyer as owner, mints the buyer a 100,000-unit float, and writes
  `SETTLEMENT_ASSET_ID` into `.env`. Idempotent: reuses an existing asset id and skips the mint if
  the buyer already holds the float. Fails with a faucet link if the buyer's account doesn't exist
  on devnet. The seller is left unfunded on purpose — receiving costs the receiver nothing.
- **`scripts/01-register-agents.ts`** (`npm run setup:registry`) — registers both agents in the
  on-chain registry and writes `SELLER_AGENT_ID` / `BUYER_AGENT_ID` into `.env`. The **buyer signs
  both registrations** (it is the funded wallet and the owner); the seller's wallet is only ever
  *named* as `agent_wallet`. The Signal Desk's card carries the `sells-signals` tag — the exact
  string discovery scans for. `--fresh` re-registers even when `.env` has ids, needed whenever
  skill tags change: the registry has no card-update call, so an old agent keeps its old tags
  forever.
- **`scripts/demo.ts`** (`npm run demo`) — the on-stage driver: prints the two agents' on-chain
  entries, starts the seller, runs the buyer, and prints a settlement summary with both transfer
  hashes. `--tamper` first repoints the seller's registry `agent_wallet` at a well-formed attacker
  address, runs the same buyer, and treats `PaymentRefused` as the *success* condition ("money
  moved: none") — and restores the registry entry in a `finally`, so a Ctrl-C mid-run is the one
  way to leave it dirty (re-run and let it finish to fix).
- **`scripts/ui.ts`** (`npm run ui`) — the agent console at `http://localhost:4000`: a browser
  page that narrates the buyer's step events live (from `steps.ts`), one card at a time, with the
  balance ticking down. `?gap=<ms>` sets the reveal pacing.
- **`scripts/ask.ts`** (`npm run ask`) — free-text mode: type any question, the agent picks a
  market, checks, pays, and answers. Reliable market selection needs `GROQ_API_KEY`.
- **`scripts/attack-test.ts`** (`npm run attack-test`) — 11 forged payments (wrong signer, wrong
  amount, replayed transfer, expired claim, …), each expected to be rejected for its *specific*
  reason, plus one honest control that must pass. Makes real transfers; costs ~12 base units.
- **`scripts/verify-sdk.ts`** (`npm run verify-sdk`) — 63 assertions probing the SDK against live
  devnet (receipt shapes, identifier derivation, registry behaviour), so the demo's claims about
  the SDK stay checked rather than remembered.
- **`scripts/env-file.ts`** — the tiny helper the setup scripts use to write values back into
  `.env` without clobbering the rest of it.

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
