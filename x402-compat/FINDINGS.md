# Verified findings

Everything here was read from a primary source — installed package, live RPC, or the
upstream repo — not from memory. Each claim names how it was checked.

---

## 1. x402 is now a Linux Foundation project

- Operational launch **14 July 2026**. Coinbase completed the protocol contribution.
- Repo is **`x402-foundation/x402`**, not `coinbase/x402`.
- 17 premier members incl. Visa, Mastercard, AWS, Google, Stripe, Shopify, Circle,
  Cloudflare, Coinbase, Ripple, Solana Foundation, Stellar Development Foundation.

*Checked: Linux Foundation press release; npm package metadata.*

## 2. There are two live versions and they differ fundamentally

| | v1 | v2 |
| --- | --- | --- |
| npm | `x402@1.2.0` | `@x402/core@2.23.0` |
| Networks | closed enum, 17 EVM/SVM networks | **CAIP-2 identifiers** |
| Schemes | closed enum, `["exact"]` only | pluggable per-chain mechanisms |
| Status | deprecated | current |

**Existing MOI prototype work targets v1**, which is why it had to widen those enums by hand.

*Checked: `npm pack` of both, read the `.d.ts` files directly.*

## 3. Chain support is pluggable, and non-EVM chains are already in

`typescript/packages/mechanisms/` currently contains:

```
aptos, avm, cardano, concordium, evm, hedera, keeta, near, stellar, svm, tvm, xrpl
(12 as of 9 Sep 2026; cardano landed after the first survey)
```

Stellar, Aptos, NEAR, XRPL, TVM and Cardano are all non-EVM. `@x402/stellar` depends on exactly
two things: `@stellar/stellar-sdk` and `@x402/core`.

**MOI is not structurally excluded from anything.**

*Checked: GitHub contents API on the monorepo; package.json of `@x402/stellar`.*

## 4. MOI's payment model is a first-class flow in v2

```ts
type PaymentFlowName = "authorization" | "upfront" | "escrow";
type SettlePhase     = "before-handler" | "after-handler" | "cancel";
```

- `authorization` — sign a permission slip, someone else submits it. Needs ERC-3009-style
  detached signing, which MOI does not have.
- **`upfront` — pay first, then prove. This is exactly what MOI's signing model allows.**
- `escrow` — hold funds until delivery.

So MOI does **not** need a custom scheme. It declares `upfront`.

*Checked: `@x402/core@2.23.0` dist `.d.ts`, line 1640.*

## 5. x402's own spend controls are client-side and disableable

```ts
interface SpendControls {
  /** Per-payment USD cap. @default "$1" */
  maxAmountPerPayment?: Money | false;
  allowedAssets?: true | SpendControlAsset[];
}
```

> *"Pass `spendControls: false` to disable all spend controls (any asset, no caps)."*

Config in the buyer, one flag to disable, and **per payment rather than cumulative**.

A chain-enforced allowance closes this gap; client-side config cannot. Worth noting the evidence
here is the standard's own documentation, not an outside opinion.

*Checked: `@x402/core@2.23.0` dist `.d.ts`, `interface SpendControls`.*

## 6. A facilitator is optional; self-facilitation is a documented production path

The spec's own words: the facilitator *"does not hold funds or act as a custodian"* and is
*"an optional but recommended service."* Production support requires *"a production
facilitator provider, a self-hosted facilitator, or self-facilitation"*
(docs.x402.org/core-concepts/network-and-token-support, quoted verbatim).

**A MOI seller that verifies its own payments by reading the chain is self-facilitation.**

*Checked: docs.x402.org/core-concepts/facilitator and /network-and-token-support.*

## 7. MOI has NO CAIP-2 namespace — this is the real blocker

- 49 namespace directories in `ChainAgnostic/namespaces` (re-counted 9 Sep 2026). **No `moi`.**
- No PR mentioning moi / sarva / voyage in the last 100, open or closed.

*Checked: GitHub contents + pulls API.*

## 8. CASA acceptance is high; the only failure mode is going quiet

- **91 of the last 100 closed PRs were merged.**
- **Median 24 days** open-to-merge. Hive 6d, Neo 30d, BSV 33d, Aptos 40d, Flow 48d.
- Of 9 unmerged, 8 were duplicates, drafts or stray files.
- **Exactly one real chain failed** — Armonia Meta Chain. Not rejected: the maintainer
  chased the author for **587 days** before closing it as stale.

Registered namespaces include Acki Nacki, Tenzro, haneul, xync, Klever. **Prominence is
not the bar.**

*Checked: GitHub pulls API with computed merge latencies; read PR #64's comments.*

## 9. MOI cannot currently answer "which network is this?" — needs resolving

**Update, 9 Sep 2026:** the protocol team is adding this — a PR to return network
details (chain id, per network) on RPC calls. Devnet gets its own id. Once it lands, this
finding is closed and the CAIP-2 reference should point at that RPC.

Every RPC method MOI exposes, across all three namespaces:

```
moi.*     AccessPolicies, AccessPolicy, AccountKeys, AccountMetaInfo, AccountState,
          AssetInfoByAssetID, Balance, Call, ContextInfo, Deeds, FuelEstimate,
          GetFilterChanges, GetLogs, InteractionByHash, InteractionByTesseract,
          InteractionCount, InteractionReceipt, LogicIDs, LogicManifest,
          LogicStorage, NewLogFilter, NewTesseractFilter,
          NewTesseractsByAccountFilter, PendingInteractionCount, PendingIxnsFilter,
          RemoveFilter, SendInteractions, StorageMetric, StoragePricing,
          SubAccountCount, Subscribe, Syncing, TDU, Tesseract
          (42 total with ixpool.* and net.*, per js-moi-sdk 0.9.0-rc2)
ixpool.*  Content, ContentFrom, Inspect, Status, WaitTime
net.*     Info, Peers, Version
```

Tested live against Voyage devnet:

- `net.Version` → `"0.12.0"` — **node software version**, not a network id
- `net.Info` → `{"krama_id":"1116Uiu2HAm…"}` — **this node's own peer id**
- `net.Peers` → a list of peer ids

**Nothing identifies the network** over the wire. One adjacent fact: `js-moi-utils` exports an
unused `enum Chain { TEST_NET = 111, DEV_NET = 112, MAIN_NET = 113 }` — no code path reads it and
no RPC emits it, but these are plausibly the ids the planned network RPC will surface.

Worse for the usual workaround: `getTesseract` is keyed by **account address**. MOI is
account-centric, so there is no single global genesis block whose hash could serve as a
reference the way Solana's does.

**This matters because the CAIP-2 template requires a "Resolution Mechanics" section.**
Stellar answers it in one line — read `network_passphrase` from Horizon. MOI has no
equivalent answer today.

*Checked: enumerated RPC strings from the installed provider; live curl against
`https://dev.voyage-rpc.moi.technology/devnet/`.*

## 10. Voyage devnet was reset

Previously created accounts, a MAS0 asset, agent registrations and settled transactions no longer
resolve. The RPC is alive; the state is gone. Relevant because step 5 and step 6 both need a
funded wallet on a live network.

*Checked: live `existsOnChain` and receipt lookup.*
