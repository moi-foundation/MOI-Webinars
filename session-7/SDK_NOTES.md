# SDK_NOTES.md — session 7 (V1: identity + payment)

Every signature below was read from the **installed package in this repo** and, where marked
✅ **VERIFIED LIVE**, executed against MOI Voyage devnet this session.

Reproduce: `npm run verify-sdk` (no wallet, no `.env` required — 63 assertions, all passing).

There is no offline mode: `npm run demo` and `npm run attack-test` settle on live devnet and need a
funded wallet. `npm run verify-sdk` is the only command that runs without one.

| Package | Installed | Status |
| --- | --- | --- |
| `js-moi-sdk` | 0.7.1 | ✅ |
| `js-moi-utils` | 0.7.1 | ✅ |
| `js-moi-agent-registry` | 0.1.1 | ✅ spec §2.1 confirmed verbatim |
| `x402` | 1.2.0 | ⚠️ partially usable — §A |
| `x402-express` | 1.2.0 | ❌ **UNUSABLE** — §A |
| `x402-fetch` | 1.2.0 | ❌ **UNUSABLE** — §A |
| `groq-sdk` | 1.5.0 | ✅ importable |

> **BUG FOUND WHILE BUILDING (worth reviewing):** `AccountInherit.send()` takes **no arguments**.
> session-6 calls `.send({ fuel_limit: INHERIT_FUEL_LIMIT })` from plain JS, where the object is
> silently discarded — so that inherit has been running on default fuel, not the configured value.
> We route through `.build().send({ fuel_limit })` instead. Same class of issue found in
> `discoverBySkill`: `buildAgentCard` nests as `{ spec, agent_card }` with snake_case fields, so
> skills live at `agent_card.skills`, not the top level. Reading the wrong path returns zero
> matches silently rather than erroring.
>
> **All decisions are LOCKED** by the DECISIONS HANDOFF. Phase 1 = direct-transfer flow only;
> Phase 2 (lockup/escrow) is OUT of the build target. Scheme `"moi-transfer"`, network
> `"moi-voyage-devnet"`. See §DECISIONS for what each one resolved to.

---

## §2.1 — Agent registry ✅ CONFIRMED VERBATIM

All 10 exports and all 12 `AgentRegistry` methods listed in spec §2.1 exist on the installed
0.1.1. `AgentStatus` = `{ACTIVE, PAUSED, DEPRECATED}`. Use spec §2.1 as written; no corrections.

Not yet exercised against the live contract (needs a funded wallet): `init`, `createAgent`,
`getAgentProfile`, `updateAgentWallet`.

## §2.2 — Context inheritance ✅ CONFIRMED — *but NOT used in session 7*

> Session 7 deliberately uses plain accounts. Everything in this section is verified and correct,
> and is what **session 8** builds on. Kept here because the verification was done once.


Confirmed present: `AccountInherit` (with `.target` `.index` `.value` `.send`), `getLogicDriver`,
`LogicFactory`, `KMOI_ASSET_ID`, `LockType.NO_LOCK` (= `2`).

**Clarification on `makeWallet`.** Spec §2.2 flags this as VERIFY. It is *not* an SDK export — it
is a session-6 helper. What it wraps is public:

```ts
const w = await Wallet.fromMnemonic(mnemonic, derivationPath);
if (subAccount != null) w.setSubAccountId(subAccount);   // public, confirmed
w.connect(provider);
```

✅ **VERIFIED LIVE** — the spec's structural address math reproduces the SDK's own derivation
exactly, for indices 1, 2, 7 and 4096:

```ts
subAccountAddress(primary, i) === (await walletWithSubAccountId(i).getIdentifier()).toHex()
```

So `subAccountAddress` / `subAccountIndex` from spec §2.2 are safe to use for display and
pre-computation (e.g. the `AccountInherit .value()` beneficiary) without a round-trip.

Deploy path (from session-6 `deploy-budget.js`, to reuse in `01-deploy-budget.ts`):

```ts
const factory = new LogicFactory(manifest, primaryWallet);
const ix = await factory.deploy(null).send({ fuel_limit });   // no deploy endpoint
const { logic_id, error } = await ix.result();
```

`budget-logic/agentbudget.json` + `.coco` copied from session-6.

---

## (d) VERIFY FIRST — signer sign/verify ✅ RESOLVED

```ts
const sigAlgo = wallet.signingAlgorithms.ecdsa_secp256k1;   // sigName "ECDSA_S256", prefix 1
const signature = await wallet.sign(messageBytes, await wallet.getKeyId(), sigAlgo); // hex, 148 chars
const valid = wallet.verify(messageBytes, signature, publicKeyHexNo0x);             // boolean
```

`wallet.getPublicKey()` returns a 33-byte compressed key as hex **without** a `0x` prefix.

✅ **VERIFIED LIVE**, including the negatives that make it meaningful: `verify` returns `false`
for a different key, and `false` for a tampered message.

`Signer.verify` is an instance method but is **pure** — it does not consult the instance's own
key. The facilitator can hold any wallet and use it purely as a verifier.

### Bonus primitive the spec doesn't mention — use it in `/verify`

Participant identifiers are derived from public keys, so the facilitator can prove the signer
actually controls the account being debited:

```ts
createParticipantId({ tag: ParticipantTagV0, fingerprint: hexToBytes("0x"+pub.slice(2)).slice(0,24), variant: 0 })
```

✅ **VERIFIED LIVE** — reproduces `wallet.getIdentifier()` on 3/3 random wallets. Without this,
an attacker can sign a *valid* authorization that merely **claims** `from: <victim>`. Recommend
adding it as a mandatory check in facilitator `/verify` (spec §6.1 step 1).

---

## (b)(c) VERIFY FIRST — native asset create + transfer ✅ SURFACE RESOLVED, ⚠️ MODEL CONFLICT

Surface confirmed on `MAS0AssetLogic` (exported from `js-moi-sdk` via `js-moi-asset`):

```ts
static create(signer, symbol, supply, manager, enableEvents)  // -> ix.result() -> [{ asset_id }]
mint(beneficiary, amount)          transfer(beneficiary, amount)
transferFrom(benefactor, beneficiary, amount)                 approve(beneficiary, amount, expiresAt)
lockup(beneficiary, amount)        release(benefactor, beneficiary, amount)
balanceOf(id)                      burn(amount)
```

Send pattern (proven on devnet by session-4):

```ts
const ix = await MAS0AssetLogic.create(wallet, symbol, supply, manager, true).send();
const [{ asset_id }] = await ix.result();     // ix.hash is the receipt
```

Balance reads via `getAssetDriver(assetId, signer).routines.BalanceOf(addr)`; `"asset not found"` /
`"token not found"` both mean zero.

`moi.Lockups` (raw JSON-RPC, not wrapped by the typed provider) ✅ **VERIFIED ROUTED** on devnet —
lists an account's outstanding lockups and their beneficiaries. Reachable via the `protected`
`provider.execute` / `processResponse` (requires a narrow cast from TypeScript).

### §B — RESOLVED: the facilitator is a REFEREE, not a custodian

**A MAS0 transfer must be signed by the holder**, and on MOI only the owner can move their own
funds. So the facilitator cannot custody or relay. Phase 1 therefore does NOT use `approve`/
`transferFrom` and does NOT use `lockup`/`release`. Instead:

```
buyer  --transfer(seller, price)-->  chain          (buyer signs its OWN transfer)
buyer  --retry with X-Payment{ixHash}-->  seller
seller --POST /verify-->  facilitator
facilitator --reads chain-->  confirms the transfer landed   (signs NOTHING)
```

This is an honest divergence from stock x402 — say it on stage. The facilitator's checks are
**entirely read-only**.

#### ✅ VERIFIED LIVE — how the facilitator confirms a transfer

Probed against a real devnet interaction this session
(`0x1317efb9…283dbd` on the live AgentRegistry logic):

```jsonc
// moi.InteractionReceipt  ->
{ "ix_hash": "0x…", "status": 0, "fuel_used": "0x5bf",
  "ix_operations": [ { "tx_type": "0xc", "status": 0, "data": { "outputs": "0x…", "error": "0x" } } ],
  "from": "0x000000000b9afa…",          // <-- the SENDER. confirms who paid.
  "ts_hash": "0x…", "participants": [ … ] }
```

Operation payloads (with `asset_id` / `callsite` / `calldata`) come from the tesseract:

```jsonc
// moi.Tesseract { id, options:{tesseract_number:-1}, with_interactions:true } -> ixns[].ix_operations[]
{ "type": 12, "payload": { "logic_id": "0x…", "callsite": "RegisterAgent", "calldata": "0x0dff…" } }
```

`OpType.ASSET_INVOKE = 5`, `OpType.LOGIC_INVOKE = 12` (from `js-moi-utils` enums).

And the calldata is decodable — `js-moi-asset` exports POLO schemas:

```ts
export const TRANSFER_SCHEMA = { kind: "struct", fields: { beneficiary: {...}, amount: {...} } };
```

So `/verify` can prove, read-only: **status 0**, **`from` === the claimed buyer**, an
**ASSET_INVOKE on our `asset_id`** with callsite `Transfer`, and a decoded
**beneficiary === seller's registry wallet** and **amount >= price**. Plus a replay check that the
ix hash has not already been consumed.

---

## ⚠️ NEW FINDING — registry reads require an on-chain caller

`AgentRegistry.init()` succeeds with an unfunded wallet (the manifest is fetched from chain), but
**every read call — including `getAgentCount()` — fails for an account that does not exist on
chain**:

```
QueryError: Failed to get agent count
  cause: failed to fetch state object: failed to fetch acc meta info: account not found
    at Wallet.getNonce -> getPendingInteractionCount
```

The SDK builds a sender (and therefore needs a nonce) even for a static call. **Consequence:** the
facilitator and the buyer both need accounts that EXIST on chain in order to do registry lookups.
Budget for this in `02-provision-agents.ts` — the facilitator cannot be a bare unfunded keypair.

Live devnet AgentRegistry logic id (useful for debugging):
`0x20000000b97ce717ae04c8b6169ea3b83c0e0edd3e8a36637ce8703c00000000`

---

## §A — x402 packages ⚠️ CONFLICT: two of three are unusable

Read from the **compiled runtime JS** of the installed packages, not the docs.

### ❌ `x402-express` — hard runtime throw (blocks spec §7.3)

`node_modules/x402-express/dist/cjs/index.js`:

```js
if (SupportedEVMNetworks.includes(network))      { … getAddress(payTo) … }
else if (SupportedSVMNetworks.includes(network)) { … }
else { throw new Error(`Unsupported network: ${network}`); }   // line 120
```

It also calls `viem.getAddress(payTo)` and `processPriceToAtomicAmount(price, network)` (a
hardcoded per-network USDC table). None of these can express a MOI participant identifier or a
MAS0 asset id. **This is a runtime throw, not a type complaint.**

### ❌ `x402-fetch` — zod-parses the 402 body before signing (blocks spec §8.4)

`node_modules/x402-fetch/dist/cjs/index.js` line 40:

```js
const parsedPaymentRequirements = accepts.map(x => PaymentRequirementsSchema.parse(x));
```

That schema's `network` is a closed enum and `scheme` is exactly `["exact"]`, so it **throws on
our 402 body before any signing happens.** Line 41 additionally requires a viem or Solana signer
to select the network. `x402/client` line 694 then throws `"Unsupported scheme"`.

### ❌ Core schemas are closed enums

```js
var schemes = ["exact"];
var NetworkSchema = z.enum(["abstract","abstract-testnet","base-sepolia","base", …]); // no MOI
```

### ✅ `x402`'s `useFacilitator` IS usable — and it is the important one

`x402/dist/cjs/verify/index.js` line 350 — **no zod validation at runtime**, a plain HTTP client:

```js
await fetch(`${url}/verify`, { method:"POST", headers,
  body: JSON.stringify({ x402Version, paymentPayload: toJsonSafe(payload),
                         paymentRequirements: toJsonSafe(paymentRequirements) }) });
```

`network` is entirely opaque to it. So the **facilitator protocol** — `POST /verify`,
`POST /settle`, and both envelopes — is genuinely reusable as-is. Also usable: `x402/shared`'s
`toJsonSafe`, and the `PaymentRequirements` / `PaymentPayload` / `VerifyResponse` /
`SettleResponse` **type shapes**.

### What this means, and why it does not weaken the story

We keep the x402 **wire protocol** byte-for-byte (402 + `accepts[]`, base64 `X-Payment`,
`X-Payment-Response`, the facilitator API) and reuse x402's real facilitator client. We
reimplement only the two files upstream hardcoded to EVM/SVM: the Express middleware
(`agent-seller/x402-middleware.ts`) and the paying fetch (`agent-buyer/pay-fetch.ts`) — roughly 80
and 120 lines.

This is **not** forking x402 and **not** modifying the protocol. Spec §1.1's guardrail still holds
exactly as written. It is, if anything, the sharpest evidence *for* the thesis: the protocol is
chain-agnostic, the reference implementations are not — which is precisely why the facilitator is
the seam. Recommend saying this on stage rather than glossing it.

**DECISION NEEDED:** confirm reimplementing those two files is acceptable (spec §7.3/§8.4 say to
use the packages). No alternative exists short of patching the packages' allow-lists.

---

## §5 / §x402-types — network + scheme ids

Not externally defined; we choose them. Proposed, pending sign-off:

```
scheme  = "exact-mas0"     // "exact" semantics, one MAS0 asset
network = "moi-voyage-devnet"
```

Spec §7.3 suggests `"moi-voyage-devnet"` — adopted. Both are opaque strings to `useFacilitator`,
so only our own middleware and facilitator need to agree.

---

## §C — CONFLICT: the budget gate is advisory unless the facilitator enforces it

Spec §8.3 puts `RecordSpend` in the **buyer**. It is real and on-chain — the logic reverts on
overspend, exactly as §2.2 says. But note what it does *not* constrain:

- `AgentBudget` is a **ledger, not a custodian.** It never holds or authorizes a MAS0 token.
- A buyer that simply **skips** `RecordSpend` and goes straight to paying is not stopped by
  anything. The asset operation and the budget logic are unrelated subsystems.
- The facilitator **cannot** check the buyer's budget itself: `GetBudget` is `Sender`-based, and
  spec §2.2 already records that `Actor(owner)` cross-reads throw `"actor not found"` from a
  static call.

So as specified, the cap binds an *honest* agent, and the on-chain guarantee is **tamper-evidence**
(the spend ledger cannot be forged or backdated), not **prevention**.

That is a meaningfully weaker claim than "the chain enforces the parent's cap" as applied to the
*payment*, and spec §1.1 asks for precision here. Two ways to close it:

- **C1 (accept + phrase carefully).** Keep §8.3 as is. Say: *"the chain refuses to record the
  spend, and the agent honours that."* Zero extra work. The `--tamper`-style overspend demo still
  works, because our buyer does call `RecordSpend`.
- **C2 (make it binding).** Buyer calls `RecordSpend` first and puts the resulting interaction hash
  in the signed authorization; facilitator confirms a matching `SpendRecorded` log for that account
  before settling. Enforcement then lives in the facilitator declining to settle. Uses session-6's
  proven `scanAccountOcsLogs` pattern. Costs one extra check and an on-chain read.

**DECISION NEEDED.** Recommend **C2** if time allows — it makes the budget genuinely binding and
lands the facilitator-as-authority theme twice. **C1** is acceptable for Phase 1 provided the
wording is corrected everywhere.

---

## §6.4 — `card_uri` ⚠️ UNRESOLVED

`createAgent` requires a `CardUploader` (`(cardJson: string) => Promise<string>`) or throws
`UploaderRequiredError`. What the returned `card_uri` must *resolve to* is **not** specified by the
registry package — `card_uri` is stored as an opaque string on the profile and the contract never
dereferences it. So the constraint is on **our** consumers, not the chain.

Two candidates:

| Option | Pro | Con |
| --- | --- | --- |
| `data:application/json;base64,…` | zero infrastructure; nothing to be down on stage | long on-chain string; not fetchable by third parties |
| `GET {FACILITATOR_URL}/cards/:id` | realistic; readable by others | one more thing that must be running |

Only `discoverBySkill` (spec §4.3) actually dereferences it, and it is ours.

**DECISION NEEDED.** Recommend the **data URI** for demo robustness, with the static-file route
implemented behind it if time allows. Pinned as `cardUri()` in `shared/registry.ts` either way.

---

## §4.3 — discovery is an O(n) client-side scan

`getAllAgentIds()` → loop `getAgentProfile` → fetch each `card_uri` → filter on `skills[].tags`.
There is **no index and no search** on the registry. Fine at demo scale (a handful of agents);
comment it as such and never describe it as semantic or indexed search (spec §1.1).

---

## §F — Decisions needed before Phase 1

| # | Question | Recommendation |
| --- | --- | --- |
| **A** | `x402-express` + `x402-fetch` are unusable. OK to reimplement those two files while reusing `useFacilitator` + x402 types? | Yes — no alternative exists |
| **B** | Settlement model: `approve`/`transferFrom` (unverified) vs `lockup`/`release` (proven) | **B2** lockup/release |
| **C** | Budget gate is advisory. Accept + reword, or make the facilitator enforce it? | **C2** if time, else **C1** |
| **D** | `card_uri`: data URI vs served file | data URI |
| **E** | Repo path: this is at `moi-builders-7/`; `session-7/` already holds a prior iteration of the same talk | caller's choice — see below |

**On E:** the existing `session-7/` contains a working npm-workspaces implementation of the Tier-1
x402 flow (no Groq, no context inheritance). This spec supersedes it. It has been left untouched
rather than overwritten. Say whether to delete it, keep it as reference, or move this build into
`session-7/` to match the repo's session-N convention.

---

## Honesty guardrails in force (spec §1.1)

- Sub-accounts **share the primary's key**. Context inheritance is not key isolation and not a
  permission sandbox. Write *"the chain enforces the parent's cap"* — never *"the agent can't touch
  the money."* See §C for the further precision this needs.
- Registry discovery is an O(n) client-side scan. Not indexed, not semantic.
- The facilitator is the only chain-specific seam. We are not forking or modifying x402.
