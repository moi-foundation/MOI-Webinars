# MOI-Webinars

Live-demo repos for the MOI Builders webinar series. Each session is a self-contained subdirectory — install deps inside it, and follow that session's `README.md`.

## Sessions

| # | Topic | Folder |
|---|---|---|
| 1 | CocoLab + SDK fundamentals (Flipper, ContextFlipper, deploy, flip, mode, asset sneak peek) | [`session-1/`](./session-1) |
| 2 | Native Assets — MAS0 + custom fee-on-transfer TaxToken | [`session-2/`](./session-2) |
| 3 | On-chain Agent Registry × OpenClaw — `moi-agent-dating` skill (register / discover / say-hi) via `js-moi-agent-registry` | [`session-3/`](./session-3) |

## Quick start

Each session is independent. `cd` into one and follow its README — every demo there runs with plain `node`, and `npm` is only used to pull `js-moi-sdk` and a couple of helper deps.

```bash
cd session-1   # or session-2, session-3
npm install              # installs js-moi-sdk + deps pinned in package.json
cp .env.example .env     # paste your funded MOI devnet mnemonic into MOI_MNEMONIC
# then follow that session's README for the demo commands
```

Session 3 is an OpenClaw skill rather than a plain `node` demo — install deps from `session-3/moi-agent-dating/scripts/` and follow that skill's README.

## Prerequisites

- Node.js 20+
- A funded MOI **devnet** mnemonic (faucet at <https://voyage.moi.technology>)
- The [Coco toolchain (cocolang)](https://cocolang.dev/docs/install) — required for Session 1 CocoLab demos, and for recompiling `.coco` sources in sessions 1 or 2. Session 3 needs no Coco toolchain (the `AgentRegistryLogic` is already deployed on devnet).

## Notes

- `.env` files are gitignored across the repo — never commit your mnemonic.
- All demos target the public MOI **devnet** via `VoyageProvider('devnet')`.
- Each session uses a different `js-moi-sdk` version pinned in its own `package.json`.
