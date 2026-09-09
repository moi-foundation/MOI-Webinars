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

The namespace `moi` refers to the wider MOI ecosystem, including public networks such as Voyage
and any private deployment of the MOI protocol.

MOI differs from account-balance chains in one way that matters when reading the rest of these
profiles: it is **account-centric**. There is no single global chain of blocks. Each participant
account holds its own sequence of *tesseracts*, and an *interaction* is the signed unit that moves
state. Consequently there is no chain-wide genesis block whose hash could serve as a network
reference, which is why the CAIP-2 profile uses a named reference rather than a hash.

## Rationale

Identifiers on MOI are 32 bytes and are called *participant identifiers*. They encode a tag, a
fingerprint of the account's public key, and a variant — they are not hashes of a contract address
and they are not EVM-shaped. Assets are likewise native: a MAS0 asset is created by a protocol
operation rather than deployed as contract bytecode, and is addressed by its own 32-byte id.

Because there is no global block height and no genesis hash, the network reference is a
short, well-known name in the manner of the `stellar` namespace, rather than a numeric chain id
(`eip155`) or a genesis hash (`solana`).

## Governance

The MOI protocol is developed by Sarva Labs. Changes to this namespace profile should be raised
against the discussions URL in `caip2.md`.

## References

- [MOI Protocol](https://moi.technology) — protocol overview
- [Voyage Explorer](https://voyage.moi.technology) — public network explorer
- [js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk) — reference client library

[CAIP-2]: https://chainagnostic.org/CAIPs/caip-2
[CAIP-104]: https://chainagnostic.org/CAIPs/caip-104

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
