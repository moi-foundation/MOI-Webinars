# PR 3 — TypeScript mechanism package (NOT in this review round)

The working implementation lives in `x402-compat/moi-x402/src/` — client, server, facilitator
and shared claim/network modules, typechecking against `@x402/core@2.23.0` (npm latest is now 2.25.0 — retest against it before opening the PR). Roughly a third of
the upstream package requirements are done.

Still missing before this can be a PR (full detail in `x402-compat/UPSTREAM.md`):
build and test scaffolding, the test suite, e2e registration, the publish workflow.

Sequencing: this PR only goes after the spec (PR 2) merges, which itself waits on the CASA
namespace (PR 1). Nothing here needs review yet; it is included so the package shows the whole
picture.

Two code changes the finished spec now requires of the implementation:
`getExtra()` must emit the reserved key `paymentFlow` (the current code emits `flow`, which is
not a protocol key), and the mechanism must declare `assetTransferMethod: "mas0-transfer"` as
its default per x402 v2 section 6.1.
