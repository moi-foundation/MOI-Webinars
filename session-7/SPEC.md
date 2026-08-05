# Session 7 — Technical Specification

**Agentic Payments V1: identity + payment.**
Two autonomous agents transact over x402, settled in a native MAS0 asset on MOI Voyage devnet.

Status: implemented and typechecking. Devnet-only — there is no offline mode. Not yet executed against a funded devnet
wallet. Part 1 of 3 — see [session 8](../session-8) (authority) and [session 9](../session-9)
(commerce).

---

## 1. Scope

### 1.0 One sentence

**An agent finds another agent on MOI by what it sells, and pays it — with no prior relationship,
no account, and no human.**

Session 7 is part 1 of a 3-part arc. Each part adds exactly one idea, so a single talk carries a
single takeaway:

| | Session | Adds | The question it answers |
| --- | --- | --- | --- |
| **V1** | **7 — this one** | identity + payment | *Who am I paying?* |
| V2 | 8 | authority | *What is my agent allowed to spend?* |
| V3 | 9 | commerce + conditional settlement | *What if the goods never arrive?* |

### 1.1 In scope — requirements

| # | Requirement | Verified by |
| --- | --- | --- |
| R1 | A buyer agent discovers a seller **by skill tag** through the on-chain MOI agent registry, with no hardcoded URL. | `demo` step 1 |
| R2 | The seller charges per request using **x402** (`HTTP 402` + `X-Payment`), wire-compatible with the spec. | `demo` steps 4–5, 8 |
| R3 | Payment settles as a **native MAS0 transfer** on MOI Voyage devnet. | `demo` step 7 |
| R4 | The buyer checks the 402's `payTo` against the seller's on-chain `agent_wallet`, and **refuses on mismatch**. | `demo -- --tamper` |
| R5 | A facilitator independently verifies the payment **read-only** — signs nothing, moves nothing. | `demo` steps 10–11 |
| R6 | A signed authorization redeems **at most once**. | `attack-test` |
| R7 | Forged payments are rejected **for the correct reason**, and honest ones are accepted. | `attack-test` (11 + control) |
| R8 | The demo survives a missing API key. | brains fall back and self-label |

### 1.2 Acceptance criteria

Session 7 is "done" when all of these pass:

All of these run against **live devnet** — there is no offline mode:

```bash
npm run build                            # typecheck, strict
npm run verify-sdk                       # 63 assertions vs live devnet (no wallet needed)
npm run setup:asset && npm run setup:registry
npm run demo                             # book delivered, real interaction hash in the receipt
npm run demo -- --tamper                 # buyer refuses; no money moves; registry restored
npm run attack-test                      # 11 rejected for the right reason + control accepted
```

⚠️ Everything below `verify-sdk` is **not yet executed** against a funded wallet.

### 1.3 Explicit non-goals

Deferred deliberately. Building these into session 7 would give the audience three ideas and leave
them with none.

| Not in session 7 | Where it lands | Why not here |
| --- | --- | --- |
| Context inheritance, sub-accounts | 8 | authority is its own idea; agents here are plain wallets |
| `AgentBudget`, spend caps, `RecordSpend` | 8 | nothing in V1 constrains what an agent may spend |
| Escrow, pay-on-delivery, refunds | 9 | V1 is fire-and-forget: pay, then find out |
| Availability checks, quotes, delivery details | 9 | V1 has a fixed price and a fixed catalog |
| Multi-asset / multi-network selection | — | one asset, one network |
| Production facilitator (persistence, auth, scale) | — | replay state is in-memory and per-process |
| Real book content, licensing | — | the product is a generated summary |

### 1.4 Constraints

- **Do not fork x402.** The wire format stays byte-compatible; only the two EVM-hardcoded reference
  shims are reimplemented (§5.1).
- **No claim may outrun the code.** Specifically: don't call registry discovery "search", don't
  claim spend limits, don't imply the facilitator custodies funds, and label mock runs as mock.
- **One funded wallet maximum.** Anything needing two is a setup step that can fail live.

### 1.5 Assumptions

1. MOI Voyage devnet is reachable and the faucet works.
2. The `js-moi-agent-registry` contract is deployed on devnet and readable.
3. Buyer and seller run on the same host (ports 4011 / 4021 / 4001); no TLS, no auth.
4. One purchase at a time — the demo is sequential.
5. `GROQ_API_KEY` is optional; absence degrades quality, never correctness.

### 1.6 Deliverables

| Artefact | Purpose |
| --- | --- |
| `packages/*` | four workspaces: shared, facilitator, agent-seller, agent-buyer |
| `scripts/00,01` | devnet setup: asset + registration |
| `scripts/demo.ts` | the on-stage run, with `--tamper` |
| `scripts/attack-test.ts` | adversarial suite |
| `scripts/verify-sdk.ts` | proves the SDK claims still hold |
| [`SPEC.md`](./SPEC.md) | this document |
| [`EXPLAINER.md`](./EXPLAINER.md) · [`REVIEW.md`](./REVIEW.md) · [`README.md`](./README.md) | plain-English / reviewer / operator docs |
| [`VIDEO.md`](./VIDEO.md) | launch video script |
| [`SDK_NOTES.md`](./SDK_NOTES.md) | verified API surface |

### 1.7 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Devnet down or slow during the talk | demo fails live | no fallback — keep a pre-recorded run as backup |
| Groq unavailable | no summaries | both brains fall back and say so |
| On-chain path never rehearsed | first real run fails | flagged in §12; run `setup:*` before the talk |
| Audience conflates V1 with authority | overclaiming | non-goals stated on stage and in §1.3 |

---

## 2. Architecture

### 2.1 Actors

| Actor | Process | Wallet | Signs on chain? |
| --- | --- | --- | --- |
| **Reader** (buyer) | `packages/agent-buyer` | funded, `USER_DERIVATION_PATH` | yes — its own transfer |
| **Bookseller** (seller) | `packages/agent-seller` | `SELLER_DERIVATION_PATH` | **no** — receive-only |
| **Facilitator** | `packages/facilitator` | reuses the buyer's wallet as a *reader* | **no** — read-only |
| **MOI devnet** | Voyage | — | — |
| **Agent registry** | on-chain logic | — | written at setup |

**One funded wallet is sufficient.** The seller never signs — registration is signed by the owner
and naming it as `agent_wallet` costs it nothing, and receiving an asset costs the receiver
nothing.

### 2.2 Trust boundaries

```
┌ buyer process ─────────┐   HTTP   ┌ seller process ──────┐
│ brain, identity-check, │ ───────▶ │ catalog, 402         │
│ pay-fetch, wallet      │ ◀─────── │ middleware, delivery │
└───────────┬────────────┘          └──────────┬───────────┘
            │ signs MAS0 transfer              │ POST /verify, /settle
            ▼                                  ▼
      ┌ MOI devnet ─────────────┐   reads  ┌ facilitator ─┐
      │ MAS0 asset, registry    │ ◀─────── │ 9 checks     │
      └─────────────────────────┘          └──────────────┘
```

The seller trusts the facilitator's verdict. The facilitator trusts **nothing** — it re-derives
every claim from chain state.

---

## 3. Protocol

### 3.1 Identifiers

```
scheme  = "moi-transfer"
network = "moi-voyage-devnet"
x402Version = 1
```

Both are opaque strings to x402's facilitator client, so only our own components must agree.

### 3.2 Message sequence

These numbers are the **same ones the demo prints on screen**, so a spec reading and a live run can
be followed against each other.

```
                                                                    actor      on chain?
 1. resolve seller in the agent registry by skill "sells-books"      BUYER      read
 2. GET  /catalog                                     -> 200         BUYER      no    (free)
 3. choose a book for the question                                   BUYER      no
 4. GET  /book/:id                                    -> 402         BUYER      no
 5.      402 { x402Version, accepts[] }                              SELLER     no
 6. payTo == seller's registry agent_wallet ?                        BUYER      read
 7. MAS0 transfer(seller, price) -> ixHash; sign authorization       BUYER      WRITE
 8. GET  /book/:id + X-Payment: base64(payload)                      BUYER      no
 9. receive X-Payment, hand it to the facilitator                    SELLER     no
10. POST /verify   -> { isValid, checks[] }                          FACILITATOR read
11. POST /settle   -> { success, transaction }                       FACILITATOR read
12. produce the summary                                              SELLER     no
13. 200 + X-Payment-Response: base64(receipt)                        SELLER     no
```

Exactly **one** on-chain write per purchase (step 7), signed by the buyer. Steps 1, 6, 10 and 11
are reads. Everything else is plain HTTP.

**Deviation from stock x402, stated plainly:** step 7 happens *before* the retry in step 8. On EVM,
EIP-3009 lets the token contract verify an off-chain signature, so a facilitator can pull funds
and the buyer never touches the chain. MAS0 has no such primitive, and on MOI only the owner may
move their own funds. Therefore the buyer settles itself and the facilitator *confirms*. `/settle`
does not settle.

The off-chain signature still does real work: it binds *this payer* to *this resource at this
price*, and the facilitator refuses without it.

### 3.3 `PaymentRequirements` (the 402 body's `accepts[]`)

Field names taken verbatim from the installed `x402@1.2.0` zod schema.

```ts
{
  scheme: "moi-transfer",
  network: "moi-voyage-devnet",
  maxAmountRequired: string,   // atomic units, decimal
  resource: string,            // canonical URL of the paid resource
  description: string,
  mimeType: "application/json",
  outputSchema?: object,
  payTo: string,               // seller MOI identifier, 0x + 32 bytes
  maxTimeoutSeconds: number,
  asset: string,               // MAS0 asset id
  extra: { symbol: string, payToAgentId?: string }
}
```

`extra.payToAgentId` is the MOI-specific addition: it lets both buyer and facilitator resolve the
payee against the registry.

### 3.4 `PaymentAuthorization` (what is signed)

```ts
{
  from: string,        // buyer MOI identifier
  to: string,          // MUST equal requirements.payTo
  asset: string,       // MUST equal requirements.asset
  value: string,       // atomic units; MUST be >= maxAmountRequired
  txHash: string,      // the buyer's OWN transfer — the facilitator reads this on chain
  validAfter: string,  // unix seconds
  validBefore: string, // unix seconds
  nonce: string,       // random 32 bytes, hex
  resource: string     // binds the payment to what was bought
}
```

### 3.5 Canonical signing

Signer and verifier must produce identical bytes, so field order is pinned explicitly rather than
relying on JSON key order:

```ts
JSON.stringify([
  "moi-x402-payment-authorization-v1",
  from, to, asset, value, txHash, validAfter, validBefore, nonce, resource,
])
```

Signature: `wallet.sign(bytes, keyId, signingAlgorithms.ecdsa_secp256k1)` → `ECDSA_S256`, hex,
148 chars. Verification: `wallet.verify(bytes, signature, publicKey)` — pure, so any wallet can
act as verifier.

### 3.6 `X-Payment` header

`base64(JSON.stringify(PaymentPayload))` where:

```ts
{
  x402Version: 1,
  scheme: "moi-transfer",
  network: "moi-voyage-devnet",
  payload: { publicKey, keyId, signature, authorization }
}
```

`publicKey` is the 33-byte compressed key as hex **without** `0x` (js-moi-sdk convention).

### 3.7 `X-Payment-Response` header

`base64({ success, transaction, network, payer })`. `transaction` is the **buyer's own** ix hash
that the facilitator confirmed.

---

## 4. Facilitator

Two endpoints plus a capability probe. All logic is read-only.

| Method | Path | Effect |
| --- | --- | --- |
| `GET` | `/supported` | `{ kinds: [{ x402Version, scheme, network }] }` |
| `POST` | `/verify` | runs the check chain; **no** state change |
| `POST` | `/settle` | re-runs the chain, then **consumes** the tx hash |

Request body is exactly what x402's own `useFacilitator` sends:
`{ x402Version, paymentPayload, paymentRequirements }`.

`/settle` never trusts that `/verify` ran, let alone passed — they are independent HTTP requests.

### 4.1 Verification chain

Evaluated in order; the first failure short-circuits.

| # | Check | Fails as | MOI-specific |
| --- | --- | --- | --- |
| 1 | `payload_well_formed` | `invalid_payload` | |
| 2 | `scheme_and_network` | `invalid_scheme` | |
| 3 | `signature_valid` | `invalid_signature` | |
| 4 | `key_binds_to_account` | `invalid_payload` | ✅ derivation |
| 5 | `matches_requirements` | `invalid_payment_requirements` | |
| 6 | `not_expired` | `payment_expired` | |
| 7 | `payee_is_registered_agent` | `payee_not_registered` / `payee_wallet_mismatch` | ✅ **registry** |
| 8 | `transfer_landed_on_chain` | `transfer_not_found` / `transfer_mismatch` | ✅ chain read |
| 9 | `transfer_not_already_spent` | `duplicate_settlement` | |

**Check 4** derives a participant identifier from the supplied public key and requires it to equal
`authorization.from`. Without it a *valid* signature could still merely **claim** to come from
someone else.

**Check 7** is the one no x402 facilitator on another chain can perform: it asks the on-chain
registry who `payToAgentId` is and compares its `agent_wallet` to the address being paid.

**Check 8** reads the transfer from chain and requires sender, beneficiary, amount and callsite to
agree with the signed authorization.

Every check emits `{ name, passed, detail }`, returned in the response and printed live.

### 4.2 Reading a transfer

```
moi.InteractionReceipt { hash }            -> { status, from, ts_hash, ix_operations[] }
moi.Tesseract { id: from, options:{tesseract_hash}, with_interactions: true }
                                           -> ixns[].ix_operations[] -> { type, payload }
```

Select the op with `type === 5` (`ASSET_INVOKE`) whose `payload.asset_id` matches, then POLO-decode
`payload.calldata` with `TRANSFER_SCHEMA` (`{ beneficiary: bytes, amount: integer }`, exported by
`js-moi-sdk`) to recover the true beneficiary and amount.

### 4.3 Replay protection

In-memory `Set` of consumed tx hashes, burned at `/settle`. **Limitation:** single-process only. A
production facilitator needs shared storage; stated rather than hidden.

---

## 5. Components

```
packages/shared/src/
  config.ts          env parsing; every var required-by-name, no silent secret defaults
  chain.ts           provider, wallet loading, identifier derivation, receipts, raw RPC
  x402-types.ts      wire types + codecs + canonical signing
  payment-verify.ts  read a MAS0 transfer off chain; replay guard
  registry.ts        AgentRegistry wrapper, data-URI card uploader, discoverBySkill
  log.ts             demo-legible banners

packages/facilitator/src/
  index.ts           Express app: /verify, /settle, /supported
  verify-payment.ts  the 9-check chain

packages/agent-seller/src/
  catalog.ts         4 books; free to browse
  brain.ts           Groq summary (the product), canned fallback
  data-route.ts      GET /book/:id handler — zero payment logic
  price.ts           price, payTo, facilitator URL
  x402-middleware.ts 402 emission + facilitator calls

packages/agent-buyer/src/
  brain.ts           picks a book for the question; keyword fallback
  identity-check.ts  registry payTo comparison
  pay-fetch.ts       402 -> approve -> transfer -> sign -> retry once
  index.ts           the agent loop

scripts/
  00-setup-asset.ts     create MAS0 asset, float the buyer
  01-register-agents.ts register both agents (data-URI cards)
  verify-sdk.ts         63 assertions vs live devnet, no wallet
  demo.ts               orchestrator; --tamper
  attack-test.ts        11 forgeries + honest control
```

### 5.1 Why two x402 shims are reimplemented

Established by reading the installed packages' compiled output:

- **`x402-express`** ends its network dispatch with `throw new Error("Unsupported network: " + network)`
  after two hardcoded EVM/SVM allow-lists, and calls `viem.getAddress(payTo)`.
- **`x402-fetch`** runs `accepts.map(x => PaymentRequirementsSchema.parse(x))` — a closed enum —
  **before signing**, so it throws on our 402 body; it also demands a viem/Solana signer.
- **`useFacilitator`** performs no runtime validation and treats `network` as opaque → **reused as-is**.

So the wire protocol and the facilitator client are genuinely x402's; only ~200 lines of
EVM-hardcoded glue are replaced.

---

## 6. Discovery and identity

Registration uses `AgentRegistry.createAgent` with an inline `data:application/json;base64,…`
card — no external host, nothing to be down during a demo. The on-chain profile stays lean:
`{ agent_id, owner, agent_wallet, status, url, card_uri, score, created_at, updated_at }`.

Discovery is `getAllAgentIds()` → `getAgentProfile` per id → decode `card_uri` → filter on
`agent_card.skills[].tags`. This is an **O(n) client-side scan**; the registry has no index and no
search. Demo-scale only, and must never be described as semantic search.

> Card shape gotcha: `buildAgentCard` nests as `{ spec, agent_card }` with snake_case fields, so
> skills live at `agent_card.skills`, not the top level. Reading the wrong path silently returns
> zero matches.

> Registry reads build a sender and therefore require the **caller's account to exist on chain**;
> an unfunded keypair fails with `account not found`.

---

## 7. Configuration

| Var | Default | Notes |
| --- | --- | --- |
| `USER_MNEMONIC` | — | **secret**; required in real mode |
| `USER_DERIVATION_PATH` | `m/44'/6174'/7020'/0/0` | Voyage faucet path; the buyer |
| `SELLER_DERIVATION_PATH` | `m/44'/6174'/7020'/0/1` | receive-only, unfunded |
| `SETTLEMENT_ASSET_ID` | — | written by `setup:asset` |
| `SELLER_AGENT_ID` / `BUYER_AGENT_ID` | — | written by `setup:registry` |
| `PRICE_PER_BOOK` | `1` | atomic units |
| `ASSET_SYMBOL` | `USDM` | |
| `FACILITATOR_URL` / `FACILITATOR_PORT` | `http://localhost:4021` / `4021` | |
| `SELLER_URL` | `http://localhost:4011` | port derived from the URL |
| `BUYER_PORT` | `4001` | |
| `AUTH_TTL_SECONDS` | `120` | authorization validity window |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / `llama-3.3-70b-versatile` | optional; both brains degrade |

---

## 8. Operations

```bash
npm install
cp .env.example .env      # one funded devnet mnemonic
npm run verify-sdk           # 63 assertions vs live devnet; no wallet required
npm run setup:asset          # -> SETTLEMENT_ASSET_ID
npm run setup:registry       # -> SELLER_AGENT_ID / BUYER_AGENT_ID
npm run demo
```

On-chain writes: 1 asset create + 1 mint (setup), 2 registrations (setup), **1 transfer per
purchase**. Everything else is reads or HTTP.

---


## 10. Security model

### 10.1 Guarantees

1. **Authenticity** — only the holder of the key deriving to `authorization.from` can produce a
   valid authorization (checks 3+4).
2. **Integrity** — amount, payee, asset and resource are covered by the signature.
3. **Payee authenticity** — `payTo` must equal the seller's on-chain `agent_wallet` (check 7,
   plus an independent buyer-side check before any money moves).
4. **Settlement truth** — the facilitator re-derives the transfer from chain state (check 8).
5. **Single use** — one tx hash redeems once per facilitator process (check 9).

### 10.2 Not guaranteed

- **Delivery.** Fire-and-forget: pay, then find out. Session 9.
- **Spend limits.** Nothing constrains what the buyer agent may spend. Session 8.
- **Cross-process replay.** The nonce set is in-memory.
- **Privacy.** The catalog request and the resource URL are plaintext HTTP; on a LAN demo this is
  intentional.

### 10.3 Threat coverage (`npm run attack-test`)

| Attack | Rejected by |
| --- | --- |
| honest control (must be **accepted**) | — |
| tampered amount | `invalid_signature` |
| redirected payee | `invalid_signature` |
| impersonated payer | `invalid_signature` |
| valid signature, foreign account | `invalid_payload` (check 4) |
| expired authorization | `payment_expired` |
| authorization for another resource | `invalid_payment_requirements` |
| underpayment | `invalid_payment_requirements` |
| invented transfer hash | `transfer_not_found` |
| someone else's transfer | `transfer_mismatch` |
| replayed settlement | `duplicate_settlement` |
| registry says a different wallet | `payee_wallet_mismatch` |

The control matters: a facilitator that rejected everything would otherwise "pass".

---

## 11. Testing

| Command | Asserts |
| --- | --- |
| `npm run build` | typecheck, strict mode |
| `npm run verify-sdk` | 63 assertions vs live devnet; no wallet |
| `npm run demo` | full flow completes, book delivered, real interaction hash |
| `npm run demo -- --tamper` | buyer refuses; no money moves; registry restored |
| `npm run attack-test` | 11 forgeries rejected **for the right reason**, control accepted |

All currently pass.

---

## 12. Known limitations

1. **Never run against a funded wallet.** Every API is verified and it typechecks, but the on-chain
   path is assembled from proven parts, not observed working. Highest-risk steps, in order:
   `01-register-agents` (inline data-URI card — no prior art in this repo), `/verify` check 8 (the
   POLO decode meets a real transfer), `00-setup-asset`.
2. **Replay state is per-process.**
3. **Discovery is O(n).**
4. **The buyer touches the chain before retrying** — forced by MAS0, not chosen (§3.2).
5. **Groq output is unvalidated** beyond shape; a wrong summary is a product problem, not a
   protocol one.

---

## 13. Dependencies

| Package | Version | Role |
| --- | --- | --- |
| `js-moi-sdk` | 0.7.1 | provider, wallet, signing, MAS0, POLO schemas |
| `js-moi-agent-registry` | 0.1.1 | on-chain agent identity |
| `x402` | 1.2.0 | wire types + `useFacilitator` (reused) |
| `x402-express` / `x402-fetch` | 1.2.0 | ⚠️ installed for reference; **not usable** (§5.1) |
| `js-polo` | latest | calldata decoding |
| `groq-sdk` | 1.5.0 | agent brains, optional |
| `express` | 4.x | seller + facilitator |

Node ≥ 20, npm workspaces, TypeScript strict, ESM.

---

## Appendix — verified API surface

Full detail in [SDK_NOTES.md](./SDK_NOTES.md). Verified live this session: the registry surface,
sign/verify including negative cases, public-key→identifier derivation, MAS0 method surface, the
Voyage devnet endpoint, and the receipt/tesseract/calldata shapes check 8 depends on.
