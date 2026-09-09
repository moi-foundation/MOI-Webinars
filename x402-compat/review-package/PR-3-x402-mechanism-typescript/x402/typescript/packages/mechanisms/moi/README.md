# @x402/moi

x402 payment mechanism for MOI networks. Implements the `exact` scheme using the `upfront`
payment flow, per [`specs/schemes/exact/scheme_exact_moi.md`](../../../../specs/schemes/exact/scheme_exact_moi.md).

## Why upfront

A MOI interaction is signed as a whole by the account that submits it. There is no detached
authorization object, in the manner of EIP-3009, that a buyer could sign and hand to someone else
to submit. The buyer therefore settles a MAS0 transfer from its own account first, then presents a
signed claim naming that settled transfer.

Two consequences. Core does not call `/verify` under this flow, so every check lives in `settle`,
which confirms the transfer rather than executing one. And the buyer paid its own fuel, so the
facilitator holds no keys, signs nothing, and can run in-process inside the seller.

## Install

```bash
pnpm add @x402/moi
```

## Client

```ts
import { ExactMoiScheme } from "@x402/moi/exact/client";

client.register("moi:devnet", new ExactMoiScheme(signer));
```

The signer supplies the paying account's identifier, its compressed public key, the key index,
and a js-moi-sdk wallet.

## Server

```ts
import { ExactMoiScheme } from "@x402/moi/exact/server";

server.register("moi:devnet", new ExactMoiScheme());
```

Prices are quoted in atomic units as `{ asset, amount }`. A MAS0 asset carries no decimals or
symbol on chain, so money strings cannot be resolved without an out-of-band table; pass one
through `assetDecimals` if you need them.

The server half also copies the resource URL into `extra.resource`. The buyer signs over it and
the facilitator checks it, which is what binds a payment to one request.

## Facilitator

```ts
import { ExactMoiScheme } from "@x402/moi/exact/facilitator";

facilitator.register("moi:devnet", new ExactMoiScheme(chainReader, { spentStore }));
```

`chainReader` performs three reads: signature verification, deriving a participant identifier
from a public key, and reading a settled transfer back off the chain. No key material.

`spentStore` is the replay boundary and MUST be durable in production. Its `reserve` has to be
atomic — under this flow two concurrent settlements can both observe the same settled transfer
before either records it, so a separate has-then-add would let one payment buy twice. The bundled
`InMemorySpentStore` is for development only.

## Reading a transfer back

The receipt carries the status but neither the beneficiary nor the amount, so a full read takes
both `moi.InteractionByHash` and `moi.InteractionReceipt`. A MAS0 transfer is an `ASSET_INVOKE`
operation (type `5`) routed to the `Transfer` callsite; the beneficiary and amount come from
POLO-decoding its calldata. A refused transfer still returns an interaction hash and a mined
receipt, so the interaction-level `status` has to be checked rather than assumed.

## Testing

```bash
pnpm test              # unit
pnpm test:integration  # against a live network
```

Integration tests need `CLIENT_MOI_PRIVATE_KEY` and `SERVER_MOI_ADDRESS`, and a funded account on
Voyage devnet.
