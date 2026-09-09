# PR description — x402-foundation/x402 (spec only)

**Title:** specs: add `exact` scheme for MOI (`moi:*`), upfront flow

Adds `specs/schemes/exact/scheme_exact_moi.md`. Specification only, no code — per the repo's
process, the spec lands before any mechanism package is reviewed.

MOI uses the `upfront` flow: interactions are signed whole, so no detached authorization object
exists; the buyer settles first and proves with a signed claim binding the settled transfer to
one resource. `settle()` confirms rather than executes, fees are not sponsored, and the
facilitator holds no keys, making self-facilitation the natural deployment.

- [ ] CAIP-2 namespace PR to CASA opened first (spec names `moi:*` networks)
- [ ] Commits GPG-signed, conventional prefixes
- [ ] AI assistance disclosed (this PR was drafted with AI assistance and human-reviewed)
- [ ] Internal review (Rahul) complete
