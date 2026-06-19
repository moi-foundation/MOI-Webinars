# Session 2 — Native Assets (MAS0 + TaxToken)

Live-demo repo for **MOI Builders Session 2**. Two demos:

1. **Vanilla MAS0 native asset** — create + mint in one script.
2. **Custom TaxToken** — fee-on-transfer asset built in [cocolang](https://docs.moi.technology/).

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Coco toolchain (cocolang)** — <https://cocolang.dev/docs/install>. Only needed to recompile `coco/taxtoken.coco`; `taxtoken.json` is already checked in.
3. **Dependencies** — run once inside `session-2/`:
   ```bash
   npm install
   ```
4. **Wallet**:
   ```bash
   cp .env.example .env
   # edit MOI_MNEMONIC
   ```

## Demos

Run from `session-2/` so `dotenv` picks up `.env`.

### Demo 1 — Native MAS0 asset

Creates a `WEBINAR` asset (1,000,000 supply) and mints 100,000 to the manager.

```bash
node sdk/asset.js
```

### Demo 2 — TaxToken (5% fee-on-transfer)

Deploys the cocolang `TaxToken` logic. Treasury collects 5% of every transfer.

If you've edited `coco/taxtoken.coco`, rebuild first (otherwise skip):

```bash
cd coco && coco compile && coco manifest convert taxtoken.yaml -f json -o taxtoken.json && cd ..
node sdk/tax-deploy.js
```

Save the printed Asset ID as `TAX_ASSET_ID` in `.env` for follow-up scripts.

## Bounty — MOI Builders II: Native Assets

Complete both demos on MOI **devnet**, then submit your on-chain asset IDs.

| Demo | Command | What to capture |
| --- | --- | --- |
| **Demo 1 — MAS0** | `node sdk/asset.js` | **MAS0 Asset ID** (printed at the end) |
| **Demo 2 — TaxToken** | `node sdk/tax-deploy.js` | **MASX Asset ID** (printed at the end) |

### Submit

Drop your results into the **MOI Builders II — Native Assets** form:

**<https://forms.gle/NNK58E3vAyF6EYw9A>**

| Form field | Where to get it |
| --- | --- |
| **Email** | Your contact email |
| **Wallet Address** | Printed when the script runs, or visible on <https://voyage.moi.technology> |
| **MAS0 Asset ID (Demo 1)** | Output of `node sdk/asset.js` |
| **MASX Asset ID (Demo 2)** | Output of `node sdk/tax-deploy.js` |

Paste each Asset ID exactly as printed (including the `0x` prefix if shown).

### Verify

Open <https://voyage.moi.technology>, search your wallet address, and confirm both asset-creation interactions landed before submitting.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MOI_MNEMONIC is not set` | Create `.env` from `.env.example` |
| `account not found` | Fund the wallet via the faucet; try `MOI_DERIVATION_PATH=m/44'/6174'/0'/0/0` in `.env` |
| TaxToken deploy fails after editing `.coco` | Recompile: `cd coco && coco compile && coco manifest convert taxtoken.yaml -f json -o taxtoken.json` |

## Repo layout

```
coco/                 cocolang source + compiled manifest
sdk/
  asset.js            Demo 1 — native MAS0 asset
  tax-deploy.js       Demo 2 — deploy TaxToken
```

## Notes

- `balanceOf` is read-only — call it with `.call()`, not `.send()` ([docs](https://js-moi-sdk.docs.moi.technology/interactions.html)).
- All demos use MOI **devnet** via `VoyageProvider('devnet')`.
