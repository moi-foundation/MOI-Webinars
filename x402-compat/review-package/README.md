# x402 review package

Everything that goes to an external repository, one folder per PR, in submission order.
Inside each PR folder, the directory tree mirrors the target repository exactly — the file at
`PR-2-x402-scheme-spec/x402/specs/schemes/exact/scheme_exact_moi.md` lands at
`specs/schemes/exact/scheme_exact_moi.md` in `x402-foundation/x402`, and so on.

**Process (agreed 9 Sep): nothing is submitted upstream until Rahul reviews this package.**
Share this folder via Google Drive; review happens there; PRs go out only after it clears.

| Order | Folder | Target repo | State |
| --- | --- | --- | --- |
| 1 | `PR-1-CASA-namespaces-moi/` | `ChainAgnostic/namespaces` | Drafted. Blocked on: author + discussions-to, and the reference-format decision once the protocol chain-id PR lands |
| 2 | `PR-2-x402-scheme-spec/` | `x402-foundation/x402` | Drafted from the working implementation |
| 3 | `PR-3-x402-mechanism-typescript/` | `x402-foundation/x402` | ~1/3 built, not in this round |
| 4 | `PR-4-x402-other-sdks/` | `x402-foundation/x402` | Recommended skip |

Background documents (context for the reviewer, not for submission):
`../x402.md` (the plan), `../FINDINGS.md` (verified facts), `../UPSTREAM.md` (per-PR requirements).

Dependencies flow 1 → 2 → 3: the spec names the namespace, the mechanism implements the spec.

## Live-state check — 9 September 2026

Verified against devnet and both upstream repos on the day this package was assembled:

- **Chain-id RPC: not live yet.** `net.Version` answers `0.12.0`; `net.Network`,
  `net.NetworkInfo`, `net.ChainId`, `moi.Network`, `moi.ChainId`, `moi.NetworkInfo` all return
  method-not-found. The protocol PR from the 9 Sep call has not landed. PR 1 stays blocked on it.
- **`x402-foundation/x402`**: `specs/schemes/exact/` holds 17 specs, none for MOI. PR 2 is still novel.
- **`ChainAgnostic/namespaces`**: 50 namespaces, no `moi/`. PR 1 is still open ground.
- **js-moi-sdk**: latest on npm is now `0.9.0-rc2` (this repo's work was built on 0.8.0).
  Check the 0.9 changelog for network-identity additions before finalizing the CAIP-2 reference.
- **@x402/core**: latest is `2.25.0`; the mechanism typechecks against `2.23.0` — retest before PR 3.
