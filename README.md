# MOI-Webinars

Hands-on repos for the **MOI Builders** webinar series. Each session is a self-contained folder — clone, install deps, paste a funded devnet mnemonic, and run the demos.

## Sessions

| # | Topic | Folder |
| --- | --- | --- |
| 1 | CocoLab + SDK fundamentals (Flipper, deploy, flip, asset sneak peek) | [`session-1/`](./session-1) |
| 2 | Native Assets — MAS0 + fee-on-transfer TaxToken **(bounty)** | [`session-2/`](./session-2) |
| 3 | On-chain Agent Registry × OpenClaw **(bounty)** | [`session-3/`](./session-3) |

## Quick start

```bash
git clone https://github.com/moi-foundation/MOI-Webinars.git
cd MOI-Webinars/session-1   # or session-2, session-3

npm install                 # sessions 1–2
cp .env.example .env        # paste funded devnet MOI_MNEMONIC
# follow that session's README.md
```

Session 3 installs deps inside `session-3/moi-agent-dating/scripts/` and requires OpenClaw — see [`session-3/README.md`](./session-3/README.md) and the [Session 3 slides](./session-3/MOI_Webinar_S3.pdf).

## Prerequisites

- **Node.js 20+**
- **Funded MOI devnet wallet** — create one at <https://voyage.moi.technology> (12-word mnemonic)
- **Coco toolchain** ([cocolang](https://cocolang.dev/docs/install)) — Session 1 CocoLab demos only; compiled manifests are checked in so Sessions 1–2 SDK demos work without Coco
- **OpenClaw** ([docs](https://docs.openclaw.ai)) — required for the Session 3 bounty

## Bounties

Submission instructions live in each session README:

1. **Native Assets (Session 2)** — mint a MAS0 token and deploy a TaxToken; submit both asset IDs → [`session-2/README.md`](./session-2/README.md#bounty--moi-builders-ii-native-assets)
2. **Agent Registry — participation (Session 3)** — register via OpenClaw; submit on the [Google Form](https://forms.gle/h9bVYQKP22KcF6tA9) → [`session-3/README.md`](./session-3/README.md#bounty-1--participation-complete-the-demo)
3. **Agent Registry — open bounty (Session 3)** — build a genuinely useful on-chain agent; **500 MOI** to the best submission on [Discord](https://discord.gg/5gG6efFN4s) → [`session-3/README.md`](./session-3/README.md#bounty-2--open-bounty-best-useful-agent-500-moi)

## Security

- `.env` files are **gitignored everywhere** — never commit your mnemonic or API keys.
- All demos target MOI **devnet** via `VoyageProvider('devnet')`.
- Each session pins its own `js-moi-sdk` version in its `package.json`.
