# `examples/typescript/*/advanced/all_networks.*`

These three files already exist upstream, so they are edits rather than new files. Each keeps its
networks in alphabetical order; `moi` goes after `hedera` and before `near`.

## clients

```ts
import { createMoiSigner } from "@x402/moi";
import { ExactMoiScheme } from "@x402/moi/exact/client";

const moiMnemonic = process.env.MOI_MNEMONIC;
```

```ts
if (moiMnemonic) {
  const moiSigner = await createMoiSigner(moiMnemonic);
  client.register("moi:*", new ExactMoiScheme(moiSigner));
  console.log("Registered MOI client scheme");
}
```

## servers

```ts
import { ExactMoiScheme } from "@x402/moi/exact/server";

const MOI_NETWORK = "moi:devnet" as const;
const moiAddress = process.env.MOI_ADDRESS;
```

```ts
if (moiAddress) {
  server.register(MOI_NETWORK, new ExactMoiScheme());
}
```

The payment-requirements entry keys on `network: MOI_NETWORK, payTo: moiAddress`. Prices are
`{ asset, amount }` in atomic units: a MAS0 asset carries no decimals or symbol on chain, so a
money string cannot be resolved.

## facilitator

```ts
import { ExactMoiScheme } from "@x402/moi/exact/facilitator";

const MOI_NETWORK = "moi:devnet";
```

```ts
facilitator.register(MOI_NETWORK, new ExactMoiScheme(moiChainReader));
```

The constructor takes a `MoiChainReader`, not a signer array — this facilitator only reads. A
reader backed by `js-moi-sdk` has to supply three things: signature verification, deriving a
participant identifier from a public key, and reading a settled transfer back via
`moi.InteractionByHash` plus `moi.InteractionReceipt`, POLO-decoding the operation's calldata for
the beneficiary and amount.
