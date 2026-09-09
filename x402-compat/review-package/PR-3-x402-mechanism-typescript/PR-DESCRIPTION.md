# PR description — x402-foundation/x402 (TypeScript mechanism)

**Title:** feat(moi): add `@x402/moi` mechanism package for the `exact` scheme

Implements `specs/schemes/exact/scheme_exact_moi.md` as `typescript/packages/mechanisms/moi`,
mirroring the layout of `@x402/stellar`.

MOI uses the `upfront` payment flow. A MOI interaction is signed whole by the account that
submits it, so no detached authorization exists for a facilitator to submit later. The buyer
settles a MAS0 transfer from its own account and proves it with a signed claim bound to one
resource. Core does not call `/verify` under this flow, so every rule in the spec is enforced in
`settle`, which confirms the transfer by reading `moi.InteractionByHash` and
`moi.InteractionReceipt` and POLO-decoding the operation's calldata.

The facilitator holds no keys and signs nothing, so `getSigners()` returns an empty list and
in-process self-facilitation is the intended deployment.

Also included: `e2e/config/mechanisms_moi.json` and a publish workflow. The e2e catalog modules
resolve mechanisms by filename, so no shared file needs editing.

- [ ] Scheme spec merged first (PR 2)
- [ ] CAIP-2 namespace merged with CASA, and the `moi:*` references confirmed
- [ ] Commits GPG-signed, conventional prefixes
- [ ] AI assistance disclosed: this package was drafted with AI assistance and human-reviewed
- [ ] Payment and signature logic personally reviewed
- [ ] `examples/typescript/*/advanced/all_networks.*` entries added, alphabetically before `near`
- [ ] Changeset added
- [ ] Internal review (Rahul) complete
