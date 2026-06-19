# Session 1 — CocoLab + SDK Fundamentals

Live-demo repo for **MOI Builders Session 1**. Learn Coco basics in CocoLab, then deploy and interact with the same logic from JavaScript via `js-moi-sdk`.

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Coco toolchain (cocolang)** — <https://cocolang.dev/docs/install>. Needed for CocoLab demos and recompiling `.coco` sources. Verify with `coco version`.
3. **Dependencies** — run once inside `session-1/`:
   ```bash
   npm install
   ```
4. **Wallet** — copy the env template and paste your funded devnet mnemonic:
   ```bash
   cp .env.example .env
   # edit MOI_MNEMONIC
   ```

## Compile the Coco modules

Pre-compiled `*.json` manifests are checked in, so you only need this after editing a `.coco` source:

```bash
cd flipper         && coco compile && coco manifest convert flipper.yaml         -f json -o flipper.json         && cd ..
cd context-flipper && coco compile && coco manifest convert context_flipper.yaml -f json -o context_flipper.json && cd ..
```

## Demo flow

Run these in order from `session-1/`.

**Demo 1 — Flipper in CocoLab (shared state)**

```bash
cd flipper
coco lab init
# in the REPL: deploy, then invoke Flip and Mode to toggle/observe the bool
```

**Demo 2 — ContextFlipper in CocoLab (actor context)**

```bash
cd context-flipper
coco lab init
# in the REPL: deploy, flip as different participants — each actor gets its own bool
```

**Demo 3 — Deploy + interact via SDK**

```bash
node sdk/deploy.js          # prints Interaction hash + Logic ID
# paste hash into https://voyage.moi.technology
# paste Logic ID into .env as LOGIC_ID=0x..., then:
node sdk/flip.js            # invokes Flip() on the deployed logic
node sdk/mode.js            # read-only Mode() → prints value: true|false
node sdk/asset.js           # sneak peek of Session 2: mints a native MAS0 asset
```

Pass the logic id as argv to skip `.env`: `node sdk/flip.js 0xLOGIC_ID`.

## Repo layout

```
flipper/              shared-state Flipper (.coco + compiled manifest)
context-flipper/      per-actor ContextFlipper
sdk/
  deploy.js           deploy Flipper to devnet
  flip.js             invoke Flip()
  mode.js             read Mode()
  asset.js            Session 2 preview — MAS0 asset mint
```

## Next up

Session 2 goes deeper on native assets. Complete both demos and submit for the bounty → [`../session-2/README.md`](../session-2/README.md#bounty--moi-builders-ii-native-assets).
