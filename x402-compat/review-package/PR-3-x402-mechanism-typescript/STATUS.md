# PR 3 — TypeScript mechanism package (NOT in this review round)

The working implementation lives in `x402-compat/moi-x402/src/` — client, server, facilitator
and shared claim/network modules, typechecking against `@x402/core@2.23.0` (npm latest is now 2.25.0 — retest against it before opening the PR). Roughly a third of
the upstream package requirements are done.

Still missing before this can be a PR (full detail in `x402-compat/UPSTREAM.md`):
build and test scaffolding, the test suite, e2e registration, the publish workflow.

Sequencing: this PR only goes after the spec (PR 2) merges, which itself waits on the CASA
namespace (PR 1). Nothing here needs review yet; it is included so the package shows the whole
picture.

Divergences between the current implementation and the finished spec, found by reading both
against `@x402/core`:

- `getExtra()` emits `flow`; the protocol-reserved key is `paymentFlow`. Core also writes
  `extra.paymentFlow` onto the wire itself, so the facilitator should not duplicate it.
- `areFeesSponsored` is a property the implementation invented. `SchemeNetworkFacilitator` has
  no such member.
- The client reads the resource from `requirements.extra.resource`, which nothing populates, so
  the signed `resource` is always `""` and the binding is dead. The server half must copy it in
  via `enrichPaymentRequiredResponse`, whose context carries the `ResourceInfo`.
- The client sets `validAfter = now - 5` and `validBefore = now + maxTimeoutSeconds`, a window
  wider than the seller quoted. Spec rule 6 now forbids this.
- The facilitator matches the callsite with `/transfer/i`. The spec requires exactly `"Transfer"`.
- Amounts pass through `Number()`, which loses precision above 2^53.
- All three classes are named `MoiExactScheme`, colliding across modules.
- `js-moi-sdk` is pinned at `^0.7.1`; current is `0.9.0-rc2`.
- No tests exist.

Confirmed correct and left alone: `defaultAssetTransferMethod = "default"` is right for MOI. The
interface documents `"default"` as the value for a scheme with no on-wire choice of transfer
method, and core strips the key from the wire when it is used.
