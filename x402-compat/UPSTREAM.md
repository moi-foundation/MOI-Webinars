# The three PRs — exactly what each needs, and where it stands

x402 asks for a new chain to land in up to three pull requests to
[`x402-foundation/x402`](https://github.com/x402-foundation/x402). They must go in order: the
specification is reviewed and merged before any implementation is looked at.

**Overall status: PR 1 not started · PR 2 roughly a third done · PR 3 optional and, judging by the
rest of the ecosystem, probably not needed.**

---

## Internal gate — review call, 9 September 2026

Before anything goes to an external repository, the whole content package gets reviewed
internally. That is the process now, not a suggestion.

**How it works:** put every document in a Google Drive folder and share the link with Rahul.
He reviews there. PRs to CASA or x402-foundation only go out after that review clears.

**What the package has to contain**, because the upstream specs ask for it and the review
covers it:

- The CAIP-2 namespace document, including the rationale section: what MOI is and how it
  differs from an EVM or API-based chain, written for a reader who has never seen MOI
  (~200 words), plus governance (~200 words).
- The scheme spec draft for `specs/schemes/exact/scheme_exact_moi.md`.
- The three working docs in this directory: `x402.md`, `FINDINGS.md`, this file.

**One dependency resolved:** the protocol team is creating a PR to return network details on
RPC calls — a chain id, distinct per network, so devnet answers differently from any other
network. That closes finding 9 ("MOI cannot currently answer *which network is this?*") and
unblocks Step 2 of `x402.md` without us building anything. The CAIP-2 reference format should
be written against whatever that PR exposes.

---

## PR 1 — Specification only

One file.

| File | Status |
| --- | --- |
| `specs/schemes/exact/scheme_exact_moi.md` | ❌ not written |

**What goes in it:** the payload structure, the verification logic and the settlement logic —
prose and examples, no code.

**What to copy:** there are seventeen of these already, at `specs/schemes/exact/`. The closest
match is `scheme_exact_stellar.md`; there are also templates at `specs/scheme_template.md` and
`specs/scheme_impl_template.md`.

That directory contains specs for algo, canton, cardano, casper, starknet, sui
and ton — chains with **no mechanism package yet**. Specs land first and can sit alone. PR 1 is
independent and the cheapest to start.

**Depends on:** the CAIP-2 namespace, since the spec names the network.

---

## PR 2 — Reference implementation, one SDK

A package at `typescript/packages/mechanisms/moi/`, mirroring the layout every other mechanism
uses.

### Package root

| File | Status |
| --- | --- |
| `package.json` | ⚠️ exists, but ours — needs their name, exports map and workspace deps |
| `tsconfig.json` | ⚠️ exists, needs to match theirs |
| `README.md` | ⚠️ exists, needs rewriting to their house format |
| `tsup.config.ts` | ❌ build config — not written |
| `vitest.config.ts` | ❌ not written |
| `vitest.integration.config.ts` | ❌ not written |
| `eslint.config.js` | ❌ not written |
| `.prettierrc` · `.prettierignore` | ❌ not written |
| `CHANGELOG.md` | ❌ not written |

### `src/`

| Their file | Ours | Status |
| --- | --- | --- |
| `constants.ts` | `src/shared/network.ts` | ⚠️ written, needs moving and renaming |
| `types.ts` | `src/shared/claim.ts` | ⚠️ written, needs splitting |
| `utils.ts` | `src/shared/claim.ts` | ⚠️ mixed in with types |
| `shared.ts` | — | ❌ not written |
| `signer.ts` | inlined in the client | ❌ needs extracting |
| `defaultAssets.ts` | — | ❌ **see note below** |
| `index.ts` | `src/index.ts` | ✅ written |
| `exact/index.ts` | — | ❌ scheme registration, not written |
| `exact/client/` | `src/client/` | ✅ written, typechecks |
| `exact/server/` | `src/server/` | ✅ written, typechecks |
| `exact/facilitator/` | `src/facilitator/` | ✅ written, typechecks |

> **`defaultAssets.ts` may not be possible.** It maps an asset to its decimals and symbol so that
> `"$0.10"` prices resolve. MAS0 assets carry neither on chain. Either MOI adds them, or the
> package ships without dollar pricing — which works, but is a difference reviewers will ask about.

### `test/`

| Directory | Status |
| --- | --- |
| `test/unit/` | ❌ nothing written |
| `test/integrations/` | ❌ nothing written |

**Integration tests need a funded wallet on a live network.** Currently blocked.

### Outside the package

| Item | Status |
| --- | --- |
| `e2e/config/mechanisms_moi.json` + registration in the shared e2e modules | ❌ |
| A publish workflow in `.github/workflows/` | ❌ |
| An entry in `examples/typescript/*/advanced/all_networks`, alphabetical | ❌ |
| A changeset — `pnpm -C typescript changeset` | ❌ |

**Depends on:** PR 1 merged, and a funded wallet for the integration and e2e tests.

---

## PR 3 — The other SDKs

**In practice this is optional, and most chains skip it.**

The contributing guide describes it as a follow-up. The repository shows the practice:

| SDK | Mechanisms present |
| --- | --- |
| TypeScript | aptos, avm, concordium, evm, hedera, keeta, near, stellar, svm, tvm, xrpl |
| Go | `go/mechanisms/` — **evm, svm only** |
| Python | `python/x402/mechanisms/` — **evm, svm, tvm only** |

Nine of the eleven TypeScript mechanisms have no Go or Python counterpart. Stellar, Aptos, NEAR and
XRPL are all TypeScript-only.

So a MOI mechanism in TypeScript alone puts it in the same position as most of the ecosystem.

| Item | Status |
| --- | --- |
| Go — `go/mechanisms/moi/` | ❌ not started, and likely unnecessary |
| Python — `python/x402/mechanisms/moi/` | ❌ not started, and likely unnecessary |

**If it is ever wanted, it needs a MOI SDK in that language.** `js-moi-sdk` has no obvious Go or
Python sibling, which would make this a far larger piece of work than PR 2 — writing a MOI client
library first, then the mechanism on top.

**Depends on:** PR 2 merged.

## Applies to every PR

| Requirement | Status |
| --- | --- |
| Commits **GPG-signed** — `git config --global commit.gpgsign true` | ⚠️ not configured |
| Conventional commit prefixes (`feat:`, `fix:`, `docs:`), subject ≤72 chars | — |
| **AI assistance disclosed** in the PR description | — |
| Payment and signature logic personally reviewed before submitting | — |

The last row matters: their contributing guide singles out payment and signature code for human
review because it moves real value.

---

## The shortest honest summary

**Written and working:** the three scheme implementations. They typecheck against the real
`@x402/core@2.23.0`, and they are the part that needed thinking about.

**Not written:** the specification, every piece of build and test scaffolding, all tests, the e2e
registration, the publish workflow, and both other SDKs.

**Blocked:** anything naming the network (needs CAIP-2) and anything touching a chain (needs a
funded wallet).

The scheme logic is done. The remaining work is scaffolding and process, and that is where the
time goes.
