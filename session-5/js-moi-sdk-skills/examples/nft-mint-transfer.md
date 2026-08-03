# Example — NFT mint → transfer on Voyage devnet

End-to-end walkthrough for a **simple NFT demo** (not a marketplace): write a
MAS1-style Coco asset, deploy it with js-moi-sdk, mint one token, transfer it to
a user-provided address. JavaScript only. Pair with `coco-0.8.2-skills` for the
contract side (`reference/08-native-assets.md`, `standards/mas1/mas1.coco`).

**Scope:** mint → transfer → optional minimal UI. No list/buy/marketplace.

---

## Project layout

```
nft-marketplace/
├── contracts/          # Coco — NFTCollection or MAS1 asset logic
│   └── nft/
│       ├── nft_collection.coco
│       └── coco.nut
├── deployment/           # js-moi-sdk scripts
│   ├── .env
│   ├── mint.js
│   ├── transfer.js
│   └── deployment.json   # written on mint — source of truth for asset_id
├── ui/                   # optional Express + static page
└── .skills/              # symlink js-moi-sdk + coco skills
```

Read `references/assets.md` and `references/patterns.md` before writing scripts.

---

## Build order

### 1 — Coco contract

Write `coco asset NFTCollection` (or use `standards/mas1/mas1.coco`):

| Endpoint | Purpose |
|----------|---------|
| `Init()` | Seed token counter after `create` (invoke, not deploy) |
| `Mint(beneficiary, name, image_uri)` | Manager-gated mint with per-token metadata |
| `Transfer(token_id, beneficiary)` | On-chain transfer rules (SDK path below is preferred for live demo) |
| `IsOwner`, `GetTokenName`, `GetImageUri`, `TokenCount` | Reads |

```bash
cd contracts/nft
coco compile    # → nft_collection.yaml or nft_collection.json
```

**coco.nut must include** `license = []` under `[module]` (Coco 0.8.2).

Copy the compiled manifest into `deployment/` (JSON is fine; quote unquoted `0x`
literals if you parse YAML with js-yaml).

### 2 — Mint script (JS)

```js
import "dotenv/config";
import { readFileSync } from "node:fs";
import {
    AssetFactory,
    VoyageProvider,
    Wallet,
    getAssetDriver,
} from "js-moi-sdk";

const provider = new VoyageProvider("devnet");
const wallet = await Wallet.fromMnemonic(
    process.env.MOI_MNEMONIC,
    process.env.MOI_KEY_PATH ?? "m/44'/6174'/7020'/0/0",
);
wallet.connect(provider);

const owner = (await wallet.getIdentifier()).toHex();
const manifest = JSON.parse(readFileSync("./nft_collection.json", "utf8"));

// Create asset + run Init in one create call
const createResp = await AssetFactory.create(
    wallet,
    process.env.NFT_SYMBOL ?? "MNFT",
    Number(process.env.NFT_MAX_SUPPLY ?? 10000),  // Number — NOT bigint
    owner,
    true,
    manifest,
    "Init",
).send({ fuel_limit: 500_000 });

const receipt = await createResp.wait(120);
if (receipt.status !== 0) throw new Error(`create failed: ${receipt.status}`);

const createResult = await createResp.result();
const assetId = createResult[0].asset_id;
console.log("Hash:", createResp.hash);
console.log("Asset ID:", assetId);

// Mint — dynamic routines auto-send; do NOT chain .send()
const driver = await getAssetDriver(assetId, wallet);
const mintResp = await driver.routines.Mint(
    owner,
    process.env.NFT_NAME ?? "Genesis #0",
    process.env.NFT_URI ?? "ipfs://nft-marketplace/genesis-0",
);
const mintReceipt = await mintResp.wait(120);
if (mintReceipt.status !== 0) throw new Error(`mint failed: ${mintReceipt.status}`);

const { output } = await mintResp.result();
console.log("Mint hash:", mintResp.hash);
console.log("Token ID:", output?.token_id);

// Persist for transfer script
import { writeFileSync } from "node:fs";
writeFileSync(
    "./deployment.json",
    JSON.stringify({ asset_id: assetId, token_id: output?.token_id ?? 0 }, null, 2),
);
```

### 3 — Transfer script (JS)

**Recipient is always required** — CLI arg, `RECIPIENT_ADDRESS` in `.env`, or UI
input. Never default to a hardcoded "Bob" address.

```js
import "dotenv/config";
import { readFileSync } from "node:fs";
import { VoyageProvider, Wallet, MAS1AssetLogic } from "js-moi-sdk";

const recipient = process.argv[2] ?? process.env.RECIPIENT_ADDRESS;
if (!recipient || !/^0x[0-9a-fA-F]{64}$/.test(recipient)) {
    throw new Error("Provide recipient: RECIPIENT_ADDRESS or node transfer.js 0x…");
}

const { asset_id, token_id } = JSON.parse(readFileSync("./deployment.json", "utf8"));

const provider = new VoyageProvider("devnet");
const wallet = await Wallet.fromMnemonic(
    process.env.MOI_MNEMONIC,
    process.env.MOI_KEY_PATH ?? "m/44'/6174'/7020'/0/0",
);
wallet.connect(provider);

// Use MAS1AssetLogic.transfer — NOT custom Coco Transfer via AssetDriver
const resp = await new MAS1AssetLogic(asset_id, wallet)
    .transfer(Number(token_id), recipient)
    .send({ fuel_limit: 100_000 });

const receipt = await resp.wait(120);
if (receipt.status !== 0) throw new Error(`transfer failed: ${receipt.status}`);

console.log("Hash:", resp.hash);
console.log("Transferred token", token_id, "→", recipient);

// Verify holdings
const owner = (await wallet.getIdentifier()).toHex();
const holdings = await provider.getTDU(recipient);
console.log("Recipient TDU:", holdings);
```

### 4 — UI (optional)

Express server loads `deployment/.env`, exposes Mint / Transfer buttons, and a
**required** recipient address field. Spawn `mint.js` / `transfer.js` as child
processes; show interaction hash in the response. Do not echo mnemonics.

---

## Environment

```bash
# deployment/.env
MOI_MNEMONIC=          # 12 words — never commit, never print on stream
MOI_KEY_PATH=m/44'/6174'/7020'/0/0

NFT_SYMBOL=MNFT
NFT_MAX_SUPPLY=10000
NFT_NAME="Genesis #0"
NFT_URI=ipfs://nft-marketplace/genesis-0
NFT_TOKEN_ID=0

# Set per transfer — recipient must already exist on devnet
RECIPIENT_ADDRESS=
```

---

## Voyage devnet gotchas (read every time)

These are **not** in the generic SDK docs. Bake them into every script.

| Issue | Correct pattern |
|-------|-----------------|
| Wallet has no KMOI | Derivation path **`m/44'/6174'/7020'/0/0`** — NOT SDK default `m/44'/6174'/0'/0/0` |
| Address format | `(await wallet.getIdentifier()).toHex()` |
| Provider | `new VoyageProvider('devnet')` — not `localhost:1600` unless you run a local node |
| `max_supply` on create | **`Number(...)`** — `bigint` causes `Failed to sign interaction` |
| Mint via AssetDriver | Dynamic routines **auto-send** — call `driver.routines.Mint(...)` with **no** `.send()` |
| Transfer on stage | **`MAS1AssetLogic.transfer(tokenId, to).send()`** — Coco `Transfer` via driver often fails (`asset not found` / `pure`) |
| Ownership check | Prefer **`provider.getTDU(holder)`**; Coco `IsOwner` can be unreliable on custom assets |
| Recipient | **Always user-provided** full MOI address (`0x` + 64 hex). Must already be on-chain |
| YAML manifest | Quote bare `0x…` literals before js-yaml parse |
| Asset ID | **`deployment.json`** from mint is source of truth; sync `.env` if you duplicate |
| Receipt | `receipt.status === 0` required; one send per signer at a time |
| Re-demo transfer | Remint for a fresh token if already transferred |

---

## Live recovery

If something breaks on stage:

1. **Wrong wallet / no fuel** → check `MOI_KEY_PATH` is `7020`, not default `0'`.
2. **Sign interaction failed** → `max_supply` is probably `bigint`.
3. **Transfer failed** → switch to `MAS1AssetLogic.transfer`, not AssetDriver.
4. **Recipient error** → ask user for a funded on-chain address; don't invent one.
5. **Stale asset** → remint, update `deployment.json`, retry transfer.

---

## Do NOT

- Use TypeScript for demo scripts (stick to `.js` for speed)
- Pass `bigint` to `AssetFactory.create` supply
- Call `.send()` on AssetDriver dynamic routines (Mint)
- Use custom Coco `Transfer` as the live transfer path
- Default or invent a recipient address
- Fire concurrent `.send()` from one signer
- Print or commit mnemonics

---

## Cross-references

| Topic | File |
|-------|------|
| MAS1 / AssetFactory / drivers | `references/assets.md` |
| Fuel cap, nonce, receipts | `references/patterns.md` |
| Wallets & derivation | `references/wallet-signer.md` |
| Manifest encode/decode | `references/manifest.md` |
| Coco MAS1 standard | `coco-0.8.2-skills/standards/mas1/mas1.coco` |
