---
namespace-identifier: moi-caip2
title: MOI - Blockchain ID Specification
author: ["Adithya Ganesh (@sarvalabs-adithya)"]
discussions-to: TODO
status: Draft
type: Informational
created: 2026-08-08
requires: ["CAIP-2"]
---

# CAIP-2

*For context, see the [CAIP-2][] specification.*

## Introduction

MOI is an account-centric protocol.
Unlike chains that append blocks to one global ledger, each participant account on MOI holds its
own sequence of *tesseracts*, and state changes are carried by signed *interactions*.

A consequence of that design is that MOI has no chain-wide genesis block, and so no genesis hash
of the kind other namespaces use as a reference.
Networks are instead distinguished by name, in the manner of the [`stellar`][stellar-caip2]
namespace.

## Specification

### Semantics

The `namespace` is `moi`.
The `reference` is the short, lowercase name of a MOI network.

### Syntax

The reference is a lowercase alphanumeric string, optionally containing hyphens, between 1 and 32
characters:

```
^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$
```

The reference MUST NOT begin or end with a hyphen and MUST NOT contain uppercase characters,
whitespace, or separators other than `-`.

#### Well-known networks

| Network | Reference | CAIP-2 identifier | Status |
| --- | --- | --- | --- |
| Voyage devnet | `devnet` | `moi:devnet` | live |
| MOI mainnet | `mainnet` | `moi:mainnet` | reserved; not yet launched |

At the time of writing, the Voyage devnet is the only live public MOI network. The `mainnet`
reference is reserved here so that tooling can prepare for it, and MUST NOT be treated as
resolvable until that network launches.

Private deployments SHOULD choose a reference that is unlikely to collide with the names above.

### Resolution Mechanics

*To be completed.* This section requires a JSON-RPC method that reports which network a node
belongs to, shown as a request and its response, and the rule for turning that value into the
reference.

MOI exposes no such method today. Its RPC surface is 42 methods across `moi.*`, `ixpool.*` and
`net.*`; `net.Version` returns the node's software version, `net.Info` its own peer identifier,
and `moi.Tesseract` requires an account identifier. A network-identity method is planned, and
this section will be written against it.

## Rationale

MOI has no stable, RPC-readable network identifier today, so the reference is a short network
name pending one.

A numeric chain id, as `eip155` uses, is not available on the wire: the client SDK carries an
unused `Chain` enum, but no RPC method or interaction field reads or emits it. A genesis hash, as
`solana` uses, has no clean equivalent: tesseracts are per-account, so the nearest artefact is the
first tesseract of a genesis-era account, which would tie the identifier to an implementation
detail.

A name is human-legible, stable across protocol upgrades, and lets a client construct an
identifier without fetching anything — only verify one. If the planned network-identity method
exposes a stable numeric id, a numeric reference becomes available and this choice should be
reconsidered before the profile leaves Draft.

### Backwards Compatibility

Not applicable. No prior CAIP-2 profile exists for MOI.

## Test Cases

### Valid

```
# Voyage devnet
moi:devnet

# The reserved mainnet reference
moi:mainnet

# A private deployment
moi:acme-internal

# Minimum-length reference
moi:x
```

### Invalid

```
moi:                 # empty reference
moi:DevNet           # uppercase characters
moi:dev net          # whitespace
moi:-devnet          # leading hyphen
moi:devnet-          # trailing hyphen
moi:dev_net          # underscore is not permitted
MOI:devnet           # uppercase namespace
moi:this-reference-is-far-too-long-to-be-valid   # exceeds 32 characters
```

## Security Considerations

A network reference is only as trustworthy as the endpoint reporting it.
Clients SHOULD authenticate their RPC endpoint and SHOULD NOT infer a network from an unverified
URL. Because MOI participant identifiers are derived from public keys rather than allocated per
network, the same identifier may exist on more than one MOI network — so a client that submits an
interaction to the wrong network may find it succeeds.

## References

- [CAIP-2][] — Blockchain ID Specification
- [CAIP-104][] — Chain Agnostic Namespaces
- [MOI Protocol](https://moi.technology)
- [Voyage Explorer](https://voyage.moi.technology)
- [js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk)

[CAIP-2]: https://chainagnostic.org/CAIPs/caip-2
[CAIP-104]: https://chainagnostic.org/CAIPs/caip-104
[stellar-caip2]: https://namespaces.chainagnostic.org/stellar/caip2

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
