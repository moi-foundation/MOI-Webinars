# PR 3 — TypeScript mechanism package

Built. The package mirrors `@x402/stellar`'s layout and implements the scheme spec.

```
x402/typescript/packages/mechanisms/moi/
├── package.json  tsconfig.json  tsup.config.ts
├── vitest.config.ts  vitest.integration.config.ts
├── eslint.config.js  .prettierrc  .prettierignore
├── README.md  CHANGELOG.md
├── src/
│   ├── constants.ts  types.ts  utils.ts  shared.ts
│   ├── signer.ts  defaultAssets.ts  index.ts
│   └── exact/  index.ts + client/ server/ facilitator/
└── test/  unit/  integrations/
x402/e2e/config/mechanisms_moi.json
x402/.github/workflows/publish_npm_scoped_x402_moi.yml
```

Source typechecks against the real `@x402/core`; 13 unit tests pass; the integration test skips
without devnet credentials.

## What the rebuild fixed

The earlier draft in `../../moi-x402/` diverged from the spec in nine ways. All are corrected
here.

- The resource binding was dead. The client read `requirements.extra.resource`, which nothing
  populated, so every claim signed `resource: ""` and the facilitator never checked it. The
  server half now copies the URL in through `enrichPaymentRequiredResponse`, the only hook that
  receives the `ResourceInfo`; the client refuses to build a payload without it; the facilitator
  compares against `paymentPayload.resource.url` and fails closed when it is absent.
- The validity window was always wider than quoted: `validAfter = now - 5` with
  `validBefore = now + maxTimeoutSeconds`. The client now clamps the window and the facilitator
  rejects any window exceeding the quote.
- `getExtra()` emitted `flow`. The reserved key is `paymentFlow`, and core writes it onto the
  wire itself, so the facilitator no longer sets it at all.
- The callsite was matched with `/transfer/i`, which would accept `TransferFrom`. It is now
  compared exactly against `Transfer`.
- Amounts passed through `Number()`, losing precision above 2^53. All quantities are bigint, and
  `toBigInt` accepts both the hex the RPC returns and the decimal strings payloads carry.
- Replay used a separate has-then-add. Under this flow two concurrent settlements can both read
  the same settled transfer before either records it, so the store now exposes one atomic
  `reserve`.
- All three classes were named `MoiExactScheme`. They follow the upstream convention as
  `ExactMoiScheme`, one per role module.
- `js-moi-sdk` was pinned at `^0.7.1`; the package depends on `^0.9.0-rc2`.
- There were no tests.

Left as it was, having checked it: `defaultAssetTransferMethod = "default"` is correct. The
interface documents that value for a scheme with no on-wire choice of transfer method, and core
strips the key from the wire when it is used. `areFeesSponsored` also stays — it is not a
`SchemeNetworkFacilitator` member, but `@x402/stellar` declares it as a class property, so it is
the house convention rather than an invention.

## Sequencing

This PR goes after the scheme spec merges, which itself waits on the CASA namespace. The
`examples/` entries and a changeset are the remaining pieces, both trivial once the package name
is fixed upstream.
