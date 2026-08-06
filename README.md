# MOI-Webinars

Hands-on repos for the **MOI Builders** webinar series. Each session is a self-contained folder — clone, install deps, paste a funded devnet mnemonic, and run the demos.

## Sessions

| # | Topic | Folder |
| --- | --- | --- |
| 1 | CocoLab + SDK fundamentals (Flipper, deploy, flip, asset sneak peek) | [`session-1/`](./session-1) |
| 2 | Native Assets — MAS0 + fee-on-transfer TaxToken **(bounty)** | [`session-2/`](./session-2) |
| 3 | On-chain Agent Registry × OpenClaw **(bounty)** | [`session-3/`](./session-3) |
| 4 | Account-to-account native swap — MAS0 Lockup + Release (CLI + UI) **(bounty)** | [`session-4/`](./session-4) |
| 5 | NFT Marketplace — MAS1 mint + transfer (CLI + UI) | [`session-5/`](./session-5) |
| 6 | Context inheritance — one wallet, many agents with on-chain budgets | [`session-6/`](./session-6) |
| 7 | Agentic Payments **V1** — an agent finds another agent on MOI and pays it (registry identity + native settlement) | [`session-7/`](./session-7) |

## Quick start

```bash
git clone https://github.com/moi-foundation/MOI-Webinars.git
cd MOI-Webinars/session-1   # or session-2, session-3, session-4, session-5, session-6

npm install                 # sessions 1–2, 4–5
cp .env.example .env        # paste funded devnet MOI_MNEMONIC
# follow that session's README.md
```

Session 3 installs deps inside `session-3/moi-agent-dating/scripts/` and requires OpenClaw — see [`session-3/README.md`](./session-3/README.md) and the [Session 3 slides](./session-3/MOI_Webinar_S3.pdf).

Session 4 needs **two** funded devnet wallets (`VITE_ALICE_MNEMONIC` / `VITE_BOB_MNEMONIC`) and a one-time `npm run setup` — see [`session-4/README.md`](./session-4/README.md).

Session 5 needs a funded devnet wallet and `cd ui && npm install` before `npm run dev` — see [`session-5/README.md`](./session-5/README.md).

Session 6 needs a funded devnet wallet and an `ANTHROPIC_API_KEY` for the real-agent `run` command (scripted `spend` works without it) — see [`session-6/README.md`](./session-6/README.md).

Session 7 is part one of a three-part arc — **find and pay an agent** now; constraining what an
agent may spend, and full pay-on-delivery commerce, follow in later sessions. It's an
npm-workspaces TypeScript monorepo with no offline mode — every run settles on devnet, so it needs
a funded wallet (`npm run setup:asset && npm run setup:registry && npm run demo`). Start at
[`session-7/EXPLAINER.md`](./session-7/EXPLAINER.md) for the plain-English version, or
[`session-7/REVIEW.md`](./session-7/REVIEW.md) to read the code.

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
4. **Swaps (Session 4)** — deploy TKA/TKB and complete the Lockup + Release swap; submit asset IDs + a swap tx hash on the [Google Form](https://forms.gle/mM9Rf6dqxZQd1fuz6) → [`session-4/README.md`](./session-4/README.md#bounty--moi-builders-iv-swaps)

## Security

- `.env` files are **gitignored everywhere** — never commit your mnemonic or API keys.
- All demos target MOI **devnet** via `VoyageProvider('devnet')`.
- Each session pins its own `js-moi-sdk` version in its `package.json`.
