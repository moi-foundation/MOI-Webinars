# Scheme: `exact` on MOI

## Summary

This document specifies the `exact` payment scheme on MOI networks (`moi:*`). The buyer pays
exactly the quoted amount in a MOI-native MAS0 asset.

MOI uses the **upfront flow**: the buyer settles the transfer on chain first, then presents a
signed claim naming that settled transfer as proof. This differs from the `authorization` flow
used by EVM chains, and the reason is structural: a MOI interaction is signed as a whole by the
account that submits it. There is no detached permission object, in the manner of EIP-3009, that
a buyer could sign and hand to someone else to submit. Nothing exists to hand over, so the buyer
submits its own transfer and proves it afterwards.

Two consequences follow, and both simplify operation:

- `settle()` **confirms rather than executes.** The money moved before the server ever saw the
  request. Settlement verifies the transfer on chain and marks it spent.
- **Fees are not sponsored** (`areFeesSponsored: false`). The buyer paid its own fuel when it
  submitted the transfer. A facilitator for this scheme holds no keys and signs nothing, which
  makes in-process self-facilitation the natural deployment.

## Network

| Field | Value |
| --- | --- |
| Namespace | `moi` |
| Networks | `moi:devnet`, `moi:mainnet` (CAIP-2 registration in progress with CASA) |
| Scheme | `exact` |
| Flow | `upfront` |

The MOI protocol team is adding a JSON-RPC method that reports a node's network identity
(a per-network chain id). The CAIP-2 reference format will be finalized against that method.

## `PaymentRequirements`

Standard fields, interpreted as follows:

| Field | Meaning on MOI |
| --- | --- |
| `network` | A `moi:*` CAIP-2 identifier |
| `asset` | The 32-byte identifier of a MAS0 asset, hex |
| `amount` | Atomic units of that asset, decimal string |
| `payTo` | The seller's participant identifier, 32 bytes, hex |
| `maxTimeoutSeconds` | Bounds `validBefore` in the claim |

## `X-PAYMENT` payload

The `payload` member of the standard `PaymentPayload` envelope carries:

```json
{
  "publicKey": "02a1…",         // compressed public key, hex, no 0x prefix
  "keyId": 0,
  "signature": "0x…",           // ECDSA over the canonical claim bytes
  "claim": {
    "from":        "0x00000000…",   // the paying account
    "to":          "0x00000000…",   // must equal requirements.payTo
    "asset":       "0x…",           // MAS0 asset id, must equal requirements.asset
    "value":       "1000",          // atomic units, decimal string
    "txHash":      "0x…",           // interaction hash of the ALREADY-SETTLED transfer
    "resource":    "https://…",     // what was bought; binds payment to one request
    "validAfter":  "1757000000",
    "validBefore": "1757000060",
    "nonce":       "0x…"            // 32 random bytes
  }
}
```

### Canonical claim bytes

Signer and verifier MUST produce identical bytes, so the claim is serialized positionally rather
than as an object, with a domain separator as the first element:

```json
["moi-x402-payment-claim-v1", from, to, asset, value, txHash, resource, validAfter, validBefore, nonce]
```

The UTF-8 encoding of that JSON array is what the buyer signs. The domain separator prevents a
signature produced here from being reinterpreted as a signature over any other message the same
key might sign.

### Why the claim exists at all

The transfer's hash is public the moment it is mined. Anyone watching the chain could copy it.
The claim is what stops a lifted hash being redeemed by someone other than the payer:

- the claim is **signed**, and verification derives a participant identifier from the signing
  public key and requires it to equal `claim.from` — so only the key that controls the paying
  account can produce a valid claim over that account's transfer;
- the claim names a **resource**, binding one payment to one purchase;
- the claim carries a **validity window** and a **nonce**, and the transfer hash is **burned on
  settlement**, so the same payment cannot be redeemed twice.

## Verification

`verify(payload, requirements)` performs, in order:

1. **Shape.** `claim`, `signature` and `publicKey` are present.
2. **Signature.** ECDSA over the canonical claim bytes verifies against `publicKey`.
3. **Key controls payer.** The participant identifier derived from `publicKey` equals
   `claim.from`. A valid signature alone could still merely *claim* someone else's transfer;
   this step is what defeats a lifted hash.
4. **Claim matches quote.** `claim.asset` equals `requirements.asset`, `claim.to` equals
   `requirements.payTo`, and `claim.value` is at least `requirements.amount`.
5. **Freshness.** Current time lies within `[validAfter, validBefore]`.
6. **The money actually moved.** The transfer at `claim.txHash` is read back from the chain and
   its on-chain facts — sender, beneficiary, amount, and that the invoked callsite is a
   transfer — must agree with the claim. The payload is never believed on its own. This read-back
   is mandatory on MOI: a refused MAS0 transfer still returns an interaction hash, so the hash's
   existence proves nothing by itself.
7. **Replay.** `claim.txHash` has not been redeemed before.

Failures map to the standard reasons: `invalid_payload`, `invalid_signature`,
`requirements_mismatch`, `payment_expired`, `transfer_not_found`, `transfer_mismatch`,
`already_spent`.

## Settlement

`settle()` re-runs verification in full — it must not assume `verify()` ran, or passed — then
records `claim.txHash` in a spent-store and reports success with:

| Field | Value |
| --- | --- |
| `transaction` | `claim.txHash` — the buyer's own transfer, confirmed rather than executed |
| `payer` | `claim.from` |
| `network` | from requirements |
| `amount` | `claim.value` |

The spent-store is the replay boundary. In production it MUST be durable across process
restarts; an in-memory store is acceptable only for development.

## Facilitator

The facilitator for this scheme holds no keys, signs nothing (`getSigners` returns an empty
list), and performs only chain reads. It can therefore run in-process inside the seller
("self-facilitation"), which is the recommended deployment on MOI. `getExtra` advertises
`{ "flow": "upfront", "feesSponsored": false }` so clients select the correct flow.

## Security considerations

- **Lifted transfer hashes** are defeated by step 3 (key must derive to `claim.from`), the
  resource binding, and the spent-store.
- **Silent MAS0 refusals**: a refused transfer still yields an interaction hash. Verification
  MUST read the transfer back (step 6) and MUST NOT treat possession of a hash as proof of
  payment.
- **Overpayment** is accepted (`value >= amount`); underpayment is rejected at step 4.
- **Clock skew** between buyer and seller shrinks the effective validity window; sellers should
  quote `maxTimeoutSeconds` accordingly.

## Appendix: MOI in one paragraph

MOI is an account-centric protocol. Each participant account holds its own state and its own
sequence of tesseracts; there is no single global block chain. Assets are protocol-native (MAS0)
rather than contract-deployed, transfers are protocol operations, and interactions are signed
whole by the submitting account. Those three facts are why this scheme settles first and proves
second.
