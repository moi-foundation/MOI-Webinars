# `sdk/asset.js` — what this script does

A one-shot Node script that mints a brand-new MAS0 fungible asset on MOI's public devnet via `js-moi-sdk`. It exists as the closing beat of Session 1 of the MOI developer webinar: a sneak peek for next week's "native assets" deep-dive.

## Webinar role

- **Position in the show:** Demo 3, final step. Comes after `node sdk/deploy.js` (which deploys the `Flipper` Coco logic to devnet).
- **Narrative point:** "On most chains, launching a token means deploying an ERC-20 and wiring approvals. On MOI, assets are a primitive — one SDK call." Then run the script.
- **Invocation:** `node sdk/asset.js` from the repo root.

## What it does, step by step

1. Loads `MOI_MNEMONIC` from `.env` (via `dotenv/config`). Exits with a clear error if missing or empty.
2. Reads optional `MOI_DERIVATION_PATH`, defaulting to `m/44'/6174'/7020'/0/0` (the path Voyage faucet wallets use).
3. Constructs a `VoyageProvider('devnet')` and a `Wallet.fromMnemonic(mnemonic, derivationPath)`, then connects the wallet to the provider.
4. Prints the derivation path and the sender's identifier so the operator can sanity-check against Voyage before the on-chain call.
5. Calls `MAS0AssetLogic.newAsset(wallet, symbol, supply, manager, enableEvents)` with:
   - `symbol = 'WEBINAR'`
   - `supply = 1_000_000n` (bigint)
   - `manager = <sender address>` (the wallet itself manages the asset)
   - `enableEvents = true`
6. Logs the symbol, initial supply, and the resulting Asset ID, plus a prompt to paste the ID into <https://voyage.moi.technology>.

## SDK surface used

- `VoyageProvider` — devnet RPC provider.
- `Wallet.fromMnemonic(mnemonic, derivationPath)` — derives a signing wallet.
- `MAS0AssetLogic.newAsset(signer, symbol, supply, manager, enableEvents)` — static factory that creates a MAS0 fungible asset on-chain and returns a `MAS0AssetLogic` instance bound to the new asset's ID. (Other instance methods — `mint`, `burn`, `transfer`, `transferFrom`, `approve` — are intentionally not exercised here; they're next week's material.)

## Environment

- `MOI_MNEMONIC` (required) — 12-word mnemonic for a **funded** devnet wallet.
- `MOI_DERIVATION_PATH` (optional) — defaults to `m/44'/6174'/7020'/0/0`. Override only if the funded address sits on a different path (the SDK default `m/44'/6174'/0'/0/0` is the common alternative).

## Non-goals

- No CLI arguments. The script does exactly one thing.
- No retries, no try/catch wrapping. It fails loudly — that's desirable on a live demo so the operator sees the real error.
- No interaction with the `Flipper` logic. This script is independent of the deploy step.
- No transfer/mint/burn demonstrations — those are deliberately saved for Session 2.

## Failure modes the operator may hit

- `MOI_MNEMONIC is not set` — `.env` missing or still the placeholder.
- `account not found` from devnet — the derived address isn't funded. Most often a derivation-path mismatch; see the cheatsheet's "if something breaks" section for the path-sweep one-liner.
- Network timeout — devnet flaky. Fallback is the pre-recorded clip referenced in the cheatsheet.

## Source of truth for the API

`https://js-moi-sdk.docs.moi.technology/interactions#mas0assetlogic`

Signature confirmed against those docs:

```js
MAS0AssetLogic.newAsset(signer, symbol, supply, manager, enableEvents)
```
