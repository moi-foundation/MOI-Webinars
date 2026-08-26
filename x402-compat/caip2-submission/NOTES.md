# CAIP-2 submission — what's ready and what isn't

## Ready

`moi/README.md` and `moi/caip2.md`, following CASA's `_template` and modelled on the accepted
`stellar`, `aptos` and `neo` profiles. Structure, frontmatter, section headings and the
valid/invalid test-case split all match what has been merged recently.

## Blocked — three things only the MOI team can answer

**1. Resolution Mechanics.** The draft is written against a *proposed* `net.Network` RPC method
that does not exist. Every one of MOI's 36 RPC methods was checked; none reports which network a
node is on. Either add such a method, or agree different wording with CASA. **This is the one real
blocker.**

**2. The reference format.** The draft proposes short names — `moi:devnet`, `moi:mainnet` —
because MOI has no chain id and, being account-centric, no genesis hash. If the protocol team
prefers something else, the Syntax, Rationale and Test Cases sections all change together.

**3. Author and discussions-to.** Both are `TODO`. CASA requires a real GitHub handle and a
discussion URL, and the maintainer will chase whoever is named.

## Process, from CASA's CONTRIBUTING.md

1. Fork `ChainAgnostic/namespaces`
2. Copy `_template/`, rename the folder to `moi`
3. Fill `README.md` first, per CAIP-104, then `caip2.md` per CAIP-2
4. Open a PR — an editor reviews the first PR for a new namespace manually
5. `discussions-to` must be present and monitored

Style: one sentence per line; references defined at the bottom as `[Name]: URL`; link to
`chainagnostic.org`, not GitHub raw.

## What the evidence says about the odds

91 of the last 100 closed PRs merged. Median 24 days. Of the 9 that did not, 8 were duplicates,
drafts or stray files — **exactly one real chain failed, and only because its author stopped
replying for 587 days.**

**The risk is not rejection. It is going quiet.** Name an owner before filing.
