---
namespace-identifier: moi-caip2
title: MOI - Blockchain ID Specification
author: ["TODO Name (@TODO-github-handle)"]
discussions-to: https://github.com/ChainAgnostic/namespaces/pull/TODO
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

A consequence of that design is that MOI has no chain-wide genesis block, and therefore no genesis
hash to identify a network by.
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

> **⚠️ OPEN ITEM — this section cannot be completed as written until MOI exposes a network
> identifier over JSON-RPC.**
>
> At the time of drafting, MOI's RPC surface comprises 42 methods across the `moi.*`, `ixpool.*`
> and `net.*` namespaces (as enumerated from js-moi-sdk 0.9.0-rc2), and **none of them report
> which network a node belongs to**:
>
> - `net.Version` returns the node's software version (e.g. `"0.12.0"`)
> - `net.Info` returns the node's own peer identifier (`krama_id`)
> - `moi.Tesseract` is keyed by account address, so there is no global genesis to read
>
> CAIP-2 profiles are expected to describe how a client verifies the reference against a live
> node. The text below is written against a proposed method and MUST be confirmed or replaced by
> the MOI protocol team before submission.
>
> **Update, 9 September 2026:** the protocol team has committed to a PR that returns network
> details — a chain id, distinct per network — on RPC calls. Once its shape is known, this
> section must be rewritten against the real method, and the reference format below
> (short names) should be re-decided against the alternative of using that chain id directly.
> Both the Syntax and Rationale sections change together if the chain id wins.

A client resolves the network of a node by calling the proposed `net.Network` JSON-RPC method:

```sh
curl -s -X POST https://dev.voyage-rpc.moi.technology/devnet/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"net.Network","params":[]}'
```

Returning:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "network": "devnet" } }
```

The `network` field is the CAIP-2 reference.
A client MUST treat a mismatch between the expected and reported reference as a fatal error and
MUST NOT submit interactions to a node it cannot identify.

## Rationale

Three candidate references were considered.

**A numeric chain id**, as `eip155` uses, was rejected because no MOI RPC method or interaction
field exposes one. The client SDK defines a `Chain` enum (111/112/113) that nothing reads or
emits; if the planned network-identity RPC surfaces these values, this choice must be revisited.

**A genesis hash**, as `solana` uses, was rejected because MOI is account-centric: tesseracts are
per-account, so no single genesis artefact exists to hash.

**A short network name** was chosen, following `stellar:testnet` / `stellar:pubnet`.
It is human-legible, stable across protocol upgrades, and does not require a client to fetch
anything in order to construct an identifier — only to verify one.

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
