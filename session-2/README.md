# MOI Webinar — Session 2: Native Assets (MAS0)

Live-demo repo for the MOI Builders **Session 2** webinar. Two demos:

1. **Vanilla MAS0 native asset** — create + mint in one script.
2. **Custom TaxToken** — fee-on-transfer asset built in [cocolang](https://docs.moi.technology/).

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Coco toolchain (cocolang)** — see <https://cocolang.dev/docs/install>. Only needed if you want to recompile `coco/taxtoken.coco`; the compiled `taxtoken.json` is already checked in. Verify with `coco version`.
3. **`js-moi-sdk` + deps** — pinned in `package.json`. Run once inside `session-2/`:
   ```bash
   npm install
   ```
   Installs `js-moi-sdk` and `dotenv`. We only use `npm` to fetch dependencies — every demo below runs with plain `node`.
4. **Wallet** — copy the env template and paste your funded devnet mnemonic:
   ```bash
   cp .env.example .env
   # edit MOI_MNEMONIC
   ```

## Demos

Run from the repo root (`session-2/`) so `dotenv` picks up `.env`.

### Demo 1 — Native MAS0 asset

Creates a `WEBINAR` asset (1,000,000 supply) and mints 100,000 to the manager.

```bash
node sdk/asset.js
```

### Demo 2 — TaxToken (5% fee-on-transfer)

Deploys the cocolang `TaxToken` logic. Treasury collects 5% of every transfer.

If you've edited `coco/taxtoken.coco`, rebuild the manifest first (otherwise skip — `taxtoken.json` is committed):

```bash
cd coco && coco compile && coco manifest convert taxtoken.yaml -f json -o taxtoken.json && cd ..
```

Then deploy:

```bash
node sdk/tax-deploy.js
```

Save the printed `Asset ID` as `TAX_ASSET_ID` in your `.env` if you want to interact with it from follow-up scripts.

## Submit your assets (token bounty)

Once both demos have landed on devnet, drop your asset IDs into the **MOI Builders II — Native Assets** form:

**<https://forms.gle/NNK58E3vAyF6EYw9A>**

The form takes four fields:

1. **Email**
2. **Wallet Address** — the address you deployed from
3. **MAS0 Asset ID (Demo 1)** — printed by `node sdk/asset.js`
4. **MASX Asset ID (Demo 2)** — printed by `node sdk/tax-deploy.js`

## Repo layout

```
coco/                 cocolang source + compiled manifest
  coco.nut            module manifest
  taxtoken.coco       TaxToken logic source
  taxtoken.json       compiled manifest (consumed by sdk/tax-deploy.js)
sdk/                  js-moi-sdk demo scripts
  asset.js            Demo 1 — native MAS0 asset
  tax-deploy.js       Demo 2 — deploy TaxToken
```

## Notes

- `balanceOf` is read-only — call it with `.call()`, not `.send()` ([docs](https://js-moi-sdk.docs.moi.technology/interactions.html)).
- The webinar uses the MOI **devnet** via `VoyageProvider('devnet')`.
