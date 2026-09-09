# Scheme: `exact` on `MOI`

## Versions supported

- ❌ `v1` — not supported; v1's closed network enum cannot name a MOI network.
- ✅ `v2`

## Supported Networks

- `moi:devnet` — Voyage devnet, live.
- `moi:mainnet` — reserved; not yet launched.

> [!NOTE]
> **Scope:** The `moi` CAIP-2 namespace is under registration with the Chain Agnostic Standards
> Alliance and the reference format is pending a protocol decision on network identity. These
> identifiers are valid CAIP-2 *syntax*; treat them as provisional until the namespace merges.
> This spec covers MAS0 asset transfers only. Fee sponsorship is not supported by this scheme
> version.

## Summary

The buyer pays exactly the quoted amount in a MOI-native MAS0 asset.

MOI uses the `upfront` payment flow (x402 v2, section 6.1): the buyer settles the transfer on
chain first, then presents a signed claim naming that settled transfer as proof. The reason is
structural. A MOI interaction is signed as a whole by the account that submits it; no detached
authorization object exists, in the manner of EIP-3009, that a buyer could sign and hand to
someone else to submit. The buyer therefore submits its own transfer and proves it afterwards.

Consequences:

- Per the `upfront` ordering (settle → resource → respond), the facilitator's read-only
  `/verify` endpoint is not part of the flow. All validation defined below MUST be enforced
  within `/settle`, which confirms the already-submitted transfer rather than executing one.
- The buyer paid its own fuel when it submitted the transfer. The facilitator holds no keys and
  signs nothing (`getSigners()` returns an empty list), which makes in-process
  self-facilitation the natural deployment.

## Protocol Flow

1. **Client** requests a protected resource.
2. **Resource Server** responds with the payment required signal; the `PaymentRequired` object
   travels in the `PAYMENT-REQUIRED` header. `accepts[].extra` carries
   `"paymentFlow": "upfront"`, which core emits automatically because the resolved flow is not
   `authorization`, and `"resource"`, which the scheme's server half copies from the request's
   `ResourceInfo` so the buyer can sign over it.
3. **Client** submits a MAS0 transfer on the named MOI network: the quoted amount of the quoted
   asset to `payTo`, signed with its own key, paying its own fuel.
4. **Client** waits for the transfer's receipt, then constructs and signs a payment claim (below)
   binding that settled transfer to this request.
5. **Client** repeats the request with the claim in the `PAYMENT-SIGNATURE` header.
6. **Resource Server** passes the payload and requirements to the facilitator's `/settle`.
7. **Facilitator** enforces every rule in "Facilitator Settlement Rules" by reading the chain,
   marks the transfer hash spent, and returns the settlement result.
8. **Resource Server** executes the request and returns the resource, attaching the
   `PAYMENT-RESPONSE` header.

## `PaymentRequirements` for `exact`

```json
{
  "scheme": "exact",
  "network": "moi:devnet",
  "asset": "0x9a8b…",                    // 32-byte MAS0 asset identifier, hex
  "amount": "1000",                       // atomic units, decimal string
  "payTo": "0x00000000…",                 // seller's 32-byte participant identifier, hex
  "maxTimeoutSeconds": 60,
  "extra": {
    "paymentFlow": "upfront",             // reserved key, emitted by core for non-authorization flows
    "resource": "https://…"               // the resource URL, so the buyer can sign over it
  }
}
```

**Field definitions:**

- `network` — a `moi:*` CAIP-2 identifier from Supported Networks.
- `asset` — the 32-byte identifier of a MAS0 asset. MAS0 assets are protocol-native; they carry
  no on-chain decimals or symbol, so amounts are always atomic units.
- `amount` — atomic units, decimal string.
- `payTo` — the seller's participant identifier.
- `maxTimeoutSeconds` — bounds the claim's `validBefore`.
- `extra.paymentFlow` — always `"upfront"` for this mechanism. This is a protocol-reserved key
  and core writes it onto the wire itself once the scheme declares the flow; the scheme does not
  set it by hand.
- `extra.resource` — the URL of the resource being purchased, copied from the request's
  `ResourceInfo`. The buyer signs over it and the facilitator checks it (rule 5).
- `extra.assetTransferMethod` — absent. MOI offers one way to move a MAS0 asset, so the scheme
  declares the SDK's `"default"` asset transfer method, and core strips the key from the wire.

## `PAYMENT-SIGNATURE` Header Payload

The `payload` member of the standard `PaymentPayload` envelope carries:

```json
{
  "publicKey": "02a1…",           // buyer's compressed public key, hex, no 0x prefix
  "keyId": 0,                     // which of the account's keys signed; informational
  "signature": "0x…",             // ECDSA secp256k1 over the canonical claim bytes
  "claim": {
    "from":        "0x00000000…", // the paying account
    "to":          "0x00000000…", // MUST equal requirements.payTo
    "asset":       "0x9a8b…",     // MUST equal requirements.asset
    "value":       "1000",        // atomic units, decimal string
    "txHash":      "0x…",         // interaction hash of the ALREADY-SETTLED transfer
    "resource":    "https://…",   // what was bought; binds the payment to one request
    "validAfter":  "1757000000",  // unix seconds
    "validBefore": "1757000060",
    "nonce":       "0x…"          // 32 random bytes; see rule 8
  }
}
```

### Canonical claim bytes

Signer and verifier MUST produce identical bytes, so the claim is serialized positionally, with a
domain separator as the first element:

```json
["moi-x402-payment-claim-v1", from, to, asset, value, txHash, resource, validAfter, validBefore, nonce]
```

The UTF-8 encoding of that JSON array is the message signed. The domain separator prevents a
signature produced here from being valid as a signature over anything else the same key signs.

### Why a claim exists at all

The transfer hash is public the moment it is mined; anyone watching the chain can copy it. The
claim is what stops a lifted hash being redeemed by someone other than the payer: it is signed by
a key that must derive to the paying account, it names one `resource`, it carries a validity
window and a nonce, and the transfer hash is marked spent on settlement.

## Facilitator Settlement Rules (MUST)

Because the flow is `upfront`, these rules run inside `/settle`. A facilitator MUST reject the
settlement if any rule fails. `SettleResponse.errorReason` is a free-form string; this spec does
not define a vocabulary, and implementations SHOULD namespace their reasons as the Stellar scheme
does.

### 1. Shape

`claim`, `signature` and `publicKey` MUST be present.

### 2. Signature

The ECDSA secp256k1 signature over the canonical claim bytes MUST verify against `publicKey`.

### 3. Key controls payer

The participant identifier derived from `publicKey` MUST equal `claim.from`. A valid signature
alone could still merely claim someone else's transfer; this rule defeats a lifted hash.

### 4. Claim matches quote

`claim.asset` MUST equal `requirements.asset`; `claim.to` MUST equal `requirements.payTo`;
`claim.value` MUST be at least `requirements.amount`.

### 5. Resource binding

`claim.resource` MUST equal the resource being purchased. Without this check the `resource` field
is signed but unenforced, and a claim made for one resource would settle a request for another on
the same seller.

The resource reaches both halves by different routes, and the facilitator MUST compare them:
the seller's scheme copies it into `requirements.extra.resource` (its
`enrichPaymentRequiredResponse` hook receives the `ResourceInfo`), the buyer signs that value
into the claim, and core carries the authoritative `ResourceInfo` on `PaymentPayload.resource`.
The facilitator MUST compare `claim.resource` against `paymentPayload.resource.url`, and MUST
fail closed rather than skip the comparison if that field is absent.

### 6. Freshness

The current time MUST lie within `[validAfter, validBefore]`, and
`validBefore - validAfter` MUST NOT exceed `requirements.maxTimeoutSeconds`. A buyer that widens
its own validity window beyond the quoted timeout MUST be rejected.

### 7. The transfer settled on chain

The facilitator MUST read the transfer back from the chain and MUST NOT trust the payload. The
receipt carries neither the beneficiary nor the amount, so the read-back takes both objects:
`moi.InteractionByHash(claim.txHash)` for the submitted operation and
`moi.InteractionReceipt(claim.txHash)` for its result.

A settled MAS0 transfer on Voyage devnet returns:

```json
// moi.InteractionByHash
{
  "sender": {
    "id": "0x00000000bfa45bc0…",
    "sequence_id": "0x4f",
    "key_id": "0x0"
  },
  "ix_operations": [
    {
      "type": 5,                                   // ASSET_INVOKE
      "payload": {
        "asset_id": "0x108000004cd973c4…",
        "callsite": "Transfer",
        "calldata": "0x0d6f0665…"                  // POLO document
      }
    }
  ]
}

// moi.InteractionReceipt
{
  "status": 0,                                     // interaction-level: 0 is success
  "fuel_used": "0x12b",
  "from": "0x00000000bfa45bc0…",
  "ix_operations": [
    { "tx_type": "0x5", "status": 0, "data": { "outputs": "0x0d0f", "error": "0x" } }
  ]
}
```

The facilitator MUST reject the settlement unless all of the following hold:

- The interaction and its receipt both resolve for `claim.txHash`.
- `receipt.status` is `0`. A refused MAS0 transfer still yields an interaction hash and a mined
  receipt, so possession of a hash proves nothing by itself.
- `interaction.sender.id` equals `claim.from`.
- The interaction contains an operation of `type` `5` (`ASSET_INVOKE`) whose payload's `asset_id`
  equals `requirements.asset` and whose `callsite` is `"Transfer"`. MAS0 has no dedicated
  transfer opcode; a transfer is an asset call routed by callsite name.
- That operation's `calldata`, POLO-decoded, yields a document with a `beneficiary` equal to
  `claim.to` and an `amount` of at least `claim.value`.

### 8. Replay

`claim.txHash` MUST NOT have been redeemed before. On success the facilitator MUST record it in
a spent-store before returning. The spent-store is the replay boundary and MUST be durable
across process restarts in production.

The transfer hash, not the `nonce`, is what makes a payment single-use: one settled transfer can
be redeemed once. The `nonce` exists so that two claims over the same transfer are distinguishable
as messages, and facilitators MAY ignore it.

## `PAYMENT-RESPONSE` Header Payload

```json
{
  "success": true,
  "transaction": "0x…",       // claim.txHash — the buyer's own transfer, confirmed not executed
  "network": "moi:devnet",
  "payer": "0x00000000…",
  "amount": "1000"
}
```

On failure, `success` is `false`, `errorReason` names the rule that failed, and `transaction`
carries the submitted hash when one was supplied.

## Duplicate Settlement Mitigation (RECOMMENDED)

### Vulnerability

If the same payload reaches `/settle` concurrently, both executions can pass rule 7 (the
transfer is genuinely on chain) before either records the hash, and one payment buys twice.
This is the same race the SVM and NEAR schemes document; on MOI the window is the gap between
the chain read and the spent-store write.

### Recommended Mitigation

The spent-store write MUST be atomic check-and-set (insert-if-absent) rather than separate
has/add steps, and SHOULD be shared across facilitator replicas. Sellers SHOULD treat the
`resource` binding as a second key: one `(txHash)` marks the payment spent, and the claim's
`resource` confines what it could ever have bought.

## Security Considerations

**Overpayment is accepted.** Rules 4 and 7 compare with `>=`, so a buyer that sends more than the
quoted amount still settles. Underpayment is rejected. Sellers wanting exact-amount semantics
MUST compare for equality instead.

**Clock skew narrows the window.** `validAfter` and `validBefore` are the buyer's own timestamps.
Skew between buyer and facilitator shortens the usable window and can reject an otherwise valid
claim; sellers SHOULD quote `maxTimeoutSeconds` with that margin in mind.

**Identifiers are derived, not allocated.** A participant identifier contains a 24-byte slice of
the account's compressed public key. Rule 3 relies on that derivation: producing a key that
derives to a chosen account means grinding keypairs against 24 fixed bytes, which is
computationally infeasible. It also means the same identifier exists on every MOI network, so a
facilitator MUST confirm it is reading the network named in `requirements.network` and MUST NOT
infer the network from an endpoint URL.

**The buyer's fuel is not the seller's concern.** A buyer with insufficient fuel fails before
settlement and never produces a claim; the seller sees no request.

## Appendix

### MOI in brief

MOI is an account-centric protocol. Each participant account holds its own state and its own
ordered sequence of tesseracts; there is no single global chain of blocks. Assets are
protocol-native (MAS0) rather than contract-deployed, and interactions — the signed unit of
state change — are signed whole by the submitting account with ECDSA over secp256k1. Those
three facts are why this scheme settles first and proves second.

### Interaction and receipt anatomy

As observable through the JSON-RPC surface and the reference client (js-moi-sdk). The node and
VM implementations are not public, so this spec describes only wire-visible behavior.

An interaction envelope contains: `sender { id, sequence, key_id }`, an optional `payer`,
`fuel_price` and `fuel_limit`, a `funds` list, `ix_operations` (each `{ type, payload }`),
a `participants` list (account id + lock type — a scheduling declaration, not a permission),
and consensus preferences. The whole envelope is POLO-encoded and signed with ECDSA over
secp256k1; `sender.key_id` selects which of the account's keys signed.

A participant identifier is 32 bytes: a tag byte, a flags byte, a 24-byte fingerprint sliced
directly from the account's compressed public key, and a variant field carrying the sub-account
index. It derives from the key, not from a network, so the same identifier can exist on every
MOI network — one reason explicit network identification matters for this scheme.

A receipt contains `ix_hash`, an interaction-level `status`, `fuel_used`, `from`, and
per-operation results (`{ tx_type, status, data { outputs, error } }`). Interaction-level status
`0` is success; `tx_type` comes back as a hex string rather than a number.

Two names differ between the signing schema and the RPC response for the same field: the envelope
is signed with `sender.sequence`, and `moi.InteractionByHash` returns it as `sender.sequence_id`.
Implementations reading settled interactions MUST use the RPC spelling.

MAS0 assets carry no on-chain decimals or symbol; all amounts in this scheme are atomic units,
and no `"$0.10"`-style pricing is defined for MOI.

### POLO

POLO (Prefix Ordered Lookup Offsets) is MOI's deterministic serialization format, specified at
github.com/sarvalabs/polo with public Go and JavaScript implementations. Both the interaction
envelope and MAS0 calldata are POLO-encoded.

### References

- MOI protocol: https://moi.technology · docs: https://docs.moi.technology
- js-moi-sdk (reference client): https://www.npmjs.com/package/js-moi-sdk
- POLO serialization: https://github.com/sarvalabs/polo (js-polo, go-polo)
- MOI CAIP-2 namespace (in progress): ChainAgnostic/namespaces `moi/`
- x402 v2 specification, section 6.1 (payment flow models)
