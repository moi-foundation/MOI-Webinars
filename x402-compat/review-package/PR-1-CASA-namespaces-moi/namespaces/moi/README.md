---
namespace-identifier: moi
title: MOI Ecosystem
author: ["TODO Name (@TODO-github-handle)"]
status: Draft
type: Informational
created: 2026-08-08
requires: ["CAIP-2"]
---

# Namespace for MOI Chains

The namespace `moi` refers to the wider MOI ecosystem, including public networks such as the
Voyage devnet and any private deployment of the MOI protocol.

MOI differs from account-balance chains in one way that matters when reading the rest of these
profiles: it is **account-centric**. There is no single global chain of blocks. Each participant
account holds its own sequence of *tesseracts*, and an *interaction* is the signed unit that moves
state. Consequently there is no chain-wide genesis block whose hash could serve as a network
reference, which is why the CAIP-2 profile uses a named reference rather than a hash.

This namespace currently profiles CAIP-2 (chain identification). Profiles for other CAIPs, such
as CAIP-10 (accounts) and CAIP-19 (assets), may be added later.

## Rationale

Most namespaces in this registry describe chains that keep one global ledger: a single ordered
chain of blocks, a genesis hash, and often a numeric chain id. MOI has none of these, and the
identifiers in this namespace reflect that.

MOI is account-centric. Each participant account carries its own state and its own ordered
sequence of tesseracts — per-account state checkpoints — rather than a position in one shared
chain. State changes travel as interactions, envelopes signed whole by the submitting account
(ECDSA over secp256k1). Because tesseracts are per-account, no chain-wide genesis artefact exists
to hash, and the protocol assigns no numeric chain id, so neither of the two most common CAIP-2
reference conventions — `eip155`'s chain id or `solana`'s genesis hash — is available. The CAIP-2
profile therefore uses a short, well-known network name as the reference, in the manner of the
`stellar` namespace.

Identifiers are likewise not EVM-shaped. A participant identifier is 32 bytes, encoding a tag, a
fingerprint of the account's public key, and variant flags. Because it is derived from the key
rather than allocated by a network, the same identifier can exist on every MOI network — which
makes explicit network identification more important, not less, and is what this namespace
provides. Assets are also protocol-native: a MAS0 asset is created by a protocol operation rather
than deployed as contract bytecode, and is addressed by its own 32-byte identifier.

## Governance

The MOI protocol is designed and developed by [Sarva Labs](https://github.com/sarvalabs). The
node software and the reference client libraries, including
[js-moi-sdk](https://github.com/sarvalabs/js-moi-sdk), are maintained in public repositories
under that organization, and protocol changes are proposed and reviewed there as issues and pull
requests. The public Voyage networks, their RPC endpoints and the
[Voyage explorer](https://voyage.moi.technology) are operated under the same stewardship, with
the MOI Foundation supporting the wider ecosystem.

This namespace profile is maintained by its listed authors. Questions, corrections and proposed
changes should be raised at the `discussions-to` URL carried in each profile, and changes to the
profile itself are made by pull request to `ChainAgnostic/namespaces`, following CASA's own
process.

New network references do not require changes to this profile: any reference that follows the
syntax in `caip2.md` is valid, and a new public network becomes *well-known* by being added to
the table there. References for retired networks remain syntactically valid so that historical
data can still name the network it settled on — the reference format deliberately keeps working
for a chain that no longer runs.

## References

- [MOI Protocol](https://moi.technology) — protocol overview
- [MOI documentation](https://docs.moi.technology) — protocol fundamentals (assets, logics, interactions)
- [Voyage Explorer](https://voyage.moi.technology) — public network explorer
- [Sarva Labs on GitHub](https://github.com/sarvalabs) — protocol and SDK repositories
- [js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk) — reference client library

[CAIP-2]: https://chainagnostic.org/CAIPs/caip-2
[CAIP-10]: https://chainagnostic.org/CAIPs/caip-10
[CAIP-19]: https://chainagnostic.org/CAIPs/caip-19
[CAIP-104]: https://chainagnostic.org/CAIPs/caip-104

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
