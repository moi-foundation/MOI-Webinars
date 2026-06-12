# moi-webinar-s1

Live-demo repo for the MOI developer webinar (Session 1).
This is a runbook, not documentation. Keep `cheatsheet.md` open during the show.

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Coco toolchain (cocolang)** — see <https://cocolang.dev/docs/install>. Needed for the CocoLab demos and to recompile `.coco` sources. Verify with `coco version`.
3. **`js-moi-sdk` + deps** — pinned in `package.json`. Run once inside `session-1/`:
   ```bash
   npm install
   ```
   Installs `js-moi-sdk`, `dotenv`, and `yaml`. We only use `npm` to fetch dependencies — every demo below runs with plain `node`.
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

Run these in order. Each block is one segment of the webinar.

**Demo 1 — Flipper in CocoLab (shared state)**

```bash
cd flipper
coco lab init
# follow REPL commands from cheatsheet.md Block 1
```

**Demo 2 — ContextFlipper in CocoLab (actor context)**

```bash
cd context-flipper
coco lab init
# follow REPL commands from cheatsheet.md Block 2
```

**Demo 3 — Deploy + interact via SDK**

Run from the repo root (`session-1/`) so `dotenv` picks up `.env`:

```bash
node sdk/deploy.js          # prints Interaction hash + Logic ID; paste hash into voyage.moi.technology
# paste the Logic ID into .env as LOGIC_ID=0x..., then:
node sdk/flip.js            # invokes Flip() on the deployed logic
node sdk/mode.js            # observes Mode() → prints `value: true|false`
node sdk/asset.js           # sneak peek of next week: mints a native asset
```

You can also pass the logic id as an argv to skip `.env`: `node sdk/flip.js 0xLOGIC_ID`. If you must run from a different cwd, use Node's built-in: `node --env-file=.env sdk/flip.js`.
