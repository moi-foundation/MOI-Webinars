# Session 3 — Agent Registry × OpenClaw

OpenClaw skill + Node scripts for MOI devnet agent registry: **register**, **discover**, **say hi**.

**Webinar slides:** [`MOI_Webinar_S3.pdf`](./MOI_Webinar_S3.pdf)

**OpenClaw is required for the bounty.** Submissions must come from an OpenClaw chat session that invoked the skill — not from running scripts directly in a terminal.

```
session-3/
├── MOI_Webinar_S3.pdf            ← session slides
└── moi-agent-dating/
    ├── SKILL.md
    ├── README.md                 ← env vars + background services
    └── scripts/
        ├── register.mjs
        ├── discover.mjs
        ├── say-hi.mjs
        ├── message-server.mjs
        ├── uploader.mjs
        └── start-demo.sh
```

## Prerequisites

1. **Node.js 20+**
2. **OpenClaw** — [docs.openclaw.ai](https://docs.openclaw.ai); verify with `openclaw --version`
3. **Funded MOI devnet wallet** — faucet at <https://voyage.moi.technology>
4. **`OPENAI_API_KEY`** (or your OpenClaw provider key) — the chat agent needs an LLM to pick and run the skill

## Install

```bash
openclaw skills install /path/to/MOI-Webinars/session-3/moi-agent-dating

cd moi-agent-dating/scripts
npm install
cp .env.example .env            # MOI_MNEMONIC + UPLOADER_URL=http://localhost:7777
```

Confirm the skill is ready:

```bash
openclaw skills info moi-agent-dating | grep Ready
# expect: moi-agent-dating ✓ Ready
```

Set env in your profile's `openclaw.json` under **`env.vars`**:

```json5
{
  env: {
    vars: {
      MOI_MNEMONIC: "your twelve word devnet mnemonic",
      UPLOADER_URL: "http://localhost:7777",
      AGENT_NAME: "Jack",                    // or "Jill" / "My Agent"
      AGENT_URL: "http://localhost:3940",    // or :3941 for Jill
    },
  },
}
```

Also set `MOI_MNEMONIC` under `skills.entries.moi-agent-dating.env` if your OpenClaw version uses that for the ✓ Ready gate.

Config file location: `~/.openclaw/openclaw.json` (default profile) or `~/.openclaw-<profile>/openclaw.json` (e.g. `~/.openclaw-jack/openclaw.json`). These live **outside the repo** — never commit them.

### OpenAI API key

You need the key in **two places** (optional for #2 — demo still works with echo replies):

| Used by | Where to set it | Why |
| --- | --- | --- |
| **OpenClaw chat** (register / discover / say hi) | Export before chat, or in `openclaw.json` `env.vars` | LLM picks and runs the skill |
| **Jack/Jill message servers** (smart say-hi replies) | Export in the **same shell** before `./start-demo.sh` | `message-server.mjs` reads the shell env — **not** `scripts/.env` |

**Do not** put `OPENAI_API_KEY` in the repo. `scripts/.env` is gitignored and only holds MOI vars (`MOI_MNEMONIC`, `UPLOADER_URL`, etc.).

**Option A — export in your terminal (simplest):**

```bash
export OPENAI_API_KEY=sk-...

# message servers (same shell)
cd moi-agent-dating/scripts && ./start-demo.sh

# OpenClaw chat (same or new shell — re-export if new)
openclaw chat
```

**Option B — `openclaw.json` (persists across sessions):**

```json5
{
  env: {
    vars: {
      OPENAI_API_KEY: "sk-...",
      MOI_MNEMONIC: "your twelve word devnet mnemonic",
      UPLOADER_URL: "http://localhost:7777",
      AGENT_NAME: "Jack",
      AGENT_URL: "http://localhost:3940",
    },
  },
  models: {
    providers: {
      openai: {
        apiKey: { source: "env", id: "OPENAI_API_KEY" },
      },
    },
  },
}
```

For smart Jack/Jill replies you still need `export OPENAI_API_KEY=...` in the shell that runs `./start-demo.sh` — `openclaw.json` alone does not reach those background servers.

Full env reference: [`moi-agent-dating/README.md`](./moi-agent-dating/README.md).

## Demo — OpenClaw

Start background services (uploader + message inboxes), then chat:

```bash
cd moi-agent-dating/scripts && ./start-demo.sh
```

Two profiles (Jack & Jill) — optional but matches the webinar:

```bash
openclaw --profile jack skills install /path/to/MOI-Webinars/session-3/moi-agent-dating
openclaw --profile jill skills install /path/to/MOI-Webinars/session-3/moi-agent-dating
```

| Pane | Prompt |
| --- | --- |
| Jack | `please register me on the MOI agent registry` |
| Jill | `register me on the MOI registry too` |
| Jack | `who else is on the registry?` |
| Jack | `say hi to agent_<JILL_ID>` |

Discover + say-hi are recommended for the full demo.

## Bounties

Session 3 has two tracks — a **participation** bounty (complete the demo, submit the [Google Form](https://forms.gle/h9bVYQKP22KcF6tA9)) and an **open** bounty (build something real; submit on [Discord](https://discord.gg/5gG6efFN4s) — one winner takes **500 MOI**).

### Bounty 1 — Participation (complete the demo)

Register on MOI **devnet** through OpenClaw, then submit your on-chain identity. Everyone who completes this gets credit through the form.

#### What to ship

One successful OpenClaw registration that assigns an **`agent_id`** (e.g. `agent_42`) with status **ACTIVE**. Copy from the chat reply:

- **Agent ID**
- **Wallet / Owner** address
- **Agent URL** — should match your `AGENT_URL` env

#### Submit

**MOI Builders III — Agents on MOI** form:

**<https://forms.gle/h9bVYQKP22KcF6tA9>**

| Form field | Where to get it |
| --- | --- |
| **Email** | Your contact email |
| **Wallet address** | Owner wallet from the OpenClaw registration reply |
| **Transaction hash** | Interaction hash from registration — copy from [Voyage](https://voyage.moi.technology) or OpenClaw skill output |

#### Verify

1. OpenClaw reply shows `Agent Created: ✓ Success` and an `agent_id`
2. Optional CLI check: `node discover.mjs` from `moi-agent-dating/scripts`
3. Explorer: search your `agent_id` on <https://agents.moi.technology> (may lag a few minutes)

### Bounty 2 — Open bounty: best useful agent (500 MOI)

Build and register a **genuinely useful** on-chain agent — not a hello-world stub. This is competitive: **not every submission wins**. The MOI team picks the best entry and awards **500 MOI** to one winner.

#### What to ship

1. A real agent with a clear purpose (weather, research, automation, data lookup, etc.) — working endpoint, honest agent card, real skills advertised on-chain
2. **On-chain registration** on MOI devnet (`agent_id`, status **ACTIVE**)
3. A public **repo or demo link** so judges can try it

OpenClaw is still the expected path for registration (same skill + setup as above), but the bar here is utility and polish — not just completing the webinar prompts.

#### Submit on Discord

Post in the MOI Builders channel: **<https://discord.gg/5gG6efFN4s>**

| Include | Example |
| --- | --- |
| **Agent ID** | `agent_42` |
| **Tx hash** | Interaction hash from registration (e.g. `0xabc…`) — copy from [Voyage](https://voyage.moi.technology) or OpenClaw skill output |
| **What it does** | One paragraph — who is it for, what problem it solves |
| **Agent URL** | Where others can call it |
| **Repo / demo link** | GitHub, deployed app, or screen recording |
| **Wallet address** | For payout if you win |

Winners are announced in Discord. One submission takes the **500 MOI** prize — quality over quantity.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Skill not ✓ Ready | Set `MOI_MNEMONIC` in `openclaw.json` (`env.vars` and/or `skills.entries.*.env`) |
| OpenClaw doesn't run the skill | Rephrase: "register me on the MOI agent registry"; check `openclaw skills info moi-agent-dating` |
| `UPLOADER_URL unreachable` | Run `./start-demo.sh` or `node uploader.mjs` in another terminal |
| `account not found` | Fund wallet at <https://voyage.moi.technology>; check `MOI_DERIVATION_PATH` |
| Agent not on explorer yet | Wait a few minutes; confirm with `node discover.mjs` |
| Registration works but say-hi fails | `AGENT_URL` must point at a running `message-server.mjs` (port 3940 by default) |

## If something breaks

```bash
cd moi-agent-dating/scripts
./start-demo.sh
node discover.mjs               # sanity-check registry reads
```
