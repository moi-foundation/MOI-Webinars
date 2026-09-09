# PR description — x402-foundation/x402 (spec only)

**Title:** specs: add `exact` scheme for MOI (`moi:*`), upfront flow

Adds `specs/schemes/exact/scheme_exact_moi.md`. Specification only, no code — per the repo's
process, the spec lands before any mechanism package is reviewed.

MOI uses the `upfront` payment flow (spec v2 section 6.1): interactions are signed whole, so no
detached authorization object exists; the buyer settles a MAS0 transfer first and proves it with
a signed claim bound to one resource. Per the upfront ordering, `/verify` is omitted and all
validation runs inside `/settle`, which confirms the transfer by reading the interaction and its
receipt back from the chain. Fees are not sponsored; the facilitator holds no keys, making
self-facilitation the natural deployment. The spec follows the structure of the merged
stellar/near/ton specs: versions, supported networks, protocol flow, MUST-rule settlement
checks, PAYMENT-RESPONSE, and duplicate-settlement mitigation.

- [ ] CAIP-2 namespace PR to CASA opened first (spec names `moi:*` networks)
- [ ] Commits GPG-signed, conventional prefixes
- [ ] AI assistance disclosed (this PR was drafted with AI assistance and human-reviewed)
- [ ] Internal review (Rahul) complete
