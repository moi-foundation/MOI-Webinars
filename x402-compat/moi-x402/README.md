# moi-x402

The MOI payment mechanism for [x402](https://x402.org) v2. **Draft — not published.**

Intended for upstream contribution as `typescript/packages/mechanisms/moi`.

---

## Status

| | |
| --- | --- |
| Implements | `SchemeNetworkClient`, `SchemeNetworkServer`, `SchemeNetworkFacilitator` |
| Built against | `@x402/core@2.23.0` |
| Typechecks | ✅ |
| Tested against a live chain | ❌ — Voyage devnet was reset; nothing has run |
| CAIP-2 namespace | ❌ **not registered** — `moi:` is provisional |

**Do not publish this.** The network identifiers are proposals until CASA registers the `moi`
namespace, and anything published against them breaks if CASA lands on a different shape.

---

## What it does

**Client.** The buyer submits a MAS0 transfer itself, then signs a claim naming that transfer.
Optionally pays via `transferFrom` against a benefactor's on-chain allowance, so the spend cap is
enforced by the chain rather than by client config.

**Server.** Declares the flow:

```ts
paymentFlows = { default: { supported: ["upfront"], default: "upfront" } }
```

**Facilitator.** Seven read-only checks, then `settle()` confirms the transfer and burns the hash.
It never submits anything — the buyer already paid — so `areFeesSponsored = false`.

---

## Why `upfront` and not `authorization`

x402's `authorization` flow signs a detached permission slip that a third party submits. **MOI has
no such primitive.** An interaction is signed whole — sender, sequence, fuel and operation together
— so there is nothing detachable to hand over, and whoever broadcasts it still spends the signer's
fuel.

`upfront` is a first-class flow in `@x402/core`:

```ts
type PaymentFlowName = "authorization" | "upfront" | "escrow";
```

So MOI needs no custom scheme. It declares `upfront` and is done.

---

## Two things a reviewer should know

**MAS0 fails silently.** A refused transfer still returns an interaction hash with no error. The
only reliable oracle is reading the interaction back and comparing fields, which is what `verify()`
does — and why it must never be skipped.

**There is no default-asset table.** MAS0 assets carry no decimals or symbol on chain, so
`"$0.10"`-style pricing cannot be resolved. `parsePrice` rejects dollar strings with an
explanation rather than guessing. Prices are atomic units and an asset id.

---

## Open before this can ship

1. **CAIP-2 namespace** — see `../caip2-submission/`.
2. **A way to identify the network.** CAIP-2 expects a client to ask a node which chain it is on.
   MOI exposes no such method — see `../FINDINGS.md` §9.
3. **Live testing.** Needs a funded devnet wallet.
4. **Tests.** x402 requires unit, integration and e2e before a mechanism is accepted.
