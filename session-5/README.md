# Session 5 — NFT Marketplace (MAS1 mint + transfer)

Live-demo repo for **MOI Builders Session 5**. Vibecoded end-to-end: a **MAS1 NFT collection** in Coco, SDK scripts that deploy + mint + transfer on Voyage devnet, and a small web UI that drives the same scripts.

## Bounty — Build an NFT Marketplace on MOI

Vibe-code your own NFT marketplace on MOI — mint an NFT and transfer it to another wallet. Two tiers:

**Baseline — 500 KMOI.** Deploy your own MAS1 NFT on MOI devnet and transfer it to a second wallet. That's it.

**Bonus — extra KMOI for standouts.** Go further: add image handling (upload / IPFS metadata), a sell-for-price flow, or a minimal UI to mint and transfer.

### How to submit

1. Submit your repo link via the form: **<https://forms.gle/PaUqk13GrbULYS928>**
2. Put your **token id** or **interaction hash** in your repo's README so we can verify it on-chain (via [Voyage](https://voyage.moi.technology), MOI's explorer).
3. **Deadline:** before the next session.

### What you'll need

The **js-moi-sdk** and **Coco** skills (for correct MAS1 code), MOI devnet, and a funded wallet. The full walkthrough is in this repo — follow the session build to see mint and transfer done end to end.

### How we judge

We verify each submission's token id on-chain before rewards go out. **Baseline** is pass/fail — mint + transfer works, you get 500 KMOI. **Bonus** is judged on what you added on top.

## What you build

1. **Coco contract** — manager-gated `Mint` with per-token `name` + `image_uri` metadata, `Transfer` by token ID.
2. **SDK scripts** — `AssetFactory.create` (runs `Init`), mint token #0, transfer to a recipient.
3. **Web UI** — mint button + transfer form; Express server shells out to the SDK scripts.

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Agent skills** — included in this folder for vibecoding:
   - `coco-skills/` — Coco 0.8.2 language + MAS1 standard reference
   - `js-moi-sdk-skills/` — SDK deploy, assets, wallet, patterns

   Point your agent at `coco-skills/SKILLS.md` and `js-moi-sdk-skills/SKILL.md` before prompting. Optional smoke test:

   ```bash
   node js-moi-sdk-skills/scripts/verify-sdk.cjs ./node_modules/js-moi-sdk
   ```

3. **Coco toolchain 0.8.2+** — <https://cocolang.dev/docs/install>. Only needed to recompile `coco/mas1.coco`; `coco/mas1.json` is checked in.
4. **Dependencies** — from `session-5/`:
   ```bash
   npm install
   cd ui && npm install && cd ..
   ```
5. **Wallet**:
   ```bash
   cp .env.example .env
   # edit MOI_MNEMONIC — fund at https://voyage.moi.technology
   ```

## Compile (optional)

Only if you edit `coco/mas1.coco`:

```bash
cd coco
coco compile
# manifest lands at mas1.json (JSON per coco.nut)
cd ..
```

## Demo flow

### CLI — mint then transfer

```bash
npm run mint
# prints Asset ID, Token ID; writes sdk/deployment.json

npm run transfer -- 0xRECIPIENT_ADDRESS
# recipient must already exist on devnet
```

### Web UI

```bash
npm run dev
# open http://localhost:3000
```

1. Click **Mint NFT** — creates the MAS1 asset and mints token #0.
2. Paste a funded devnet address, click **Transfer NFT**.

Verify on <https://voyage.moi.technology>.

## Vibecode prompts (skills-only)

From the included `coco-skills/` + `js-moi-sdk-skills/`:

1. > Read coco-skills. Write a MAS1 NFT collection: manager-gated Mint with name + image_uri metadata, Transfer by token_id, Init that zeroes a token counter. Compile it.
2. > With js-moi-sdk, deploy the manifest via AssetFactory (Init at create), mint one NFT to my wallet, print asset_id and token_id. Cap fuel to KMOI balance.
3. > Add a transfer script: read deployment.json, transfer token #0 to a recipient address, verify ownership moved via getTDU.
4. > Add a minimal Express UI with Mint and Transfer buttons that call those scripts.

**One point to land:** "Sessions 1–4 taught logic, fungible assets, agents, and swaps. Session 5 is a product-shaped NFT flow — Coco asset + SDK + UI — all from prompts."

## Repo layout

```
coco-skills/          Coco 0.8.2 agent skill (MAS1 standard, patterns)
js-moi-sdk-skills/    js-moi-sdk agent skill (AssetFactory, MAS1, fuel)
coco/
  mas1.coco           MAS1 NFT collection source
  coco.nut            compile config (Coco 0.8.2)
  mas1.json           compiled manifest (checked in)
sdk/
  mint.js             AssetFactory.create + Mint
  transfer.js         MAS1 transfer + ownership check
  env.js              .env loader
  deployment.json     written by mint (gitignored)
ui/
  server.js           Express API → sdk scripts
  public/             browser UI
```

## Notes

- Deploy path is **MASX** (`AssetFactory` + custom Coco manifest), not protocol-native `MAS1AssetLogic.create`.
- Static reads on `getAssetDriver` resolve directly — `await driver.routines.GetTokenName(id)`, no `.call()`.
- Mutable routines on `getAssetDriver` send automatically — `await driver.routines.Mint(...)`.
- Transfer uses `MAS1AssetLogic.transfer` on the deployed asset ID after mint.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MOI_MNEMONIC` not set | Create `.env` from `.env.example` |
| `has no KMOI for fuel` | Fund wallet at voyage.moi.technology |
| Transfer: recipient invalid | Address must be `0x` + 64 hex chars and exist on devnet |
| `Sender does not own token` | Run `npm run mint` first |
| Mint fails after editing `.coco` | Recompile: `cd coco && coco compile` |
