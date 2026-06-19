# moi-agent-dating

OpenClaw skill wrapping [`js-moi-agent-registry`](https://www.npmjs.com/package/js-moi-agent-registry) on MOI devnet.

| Operation | Script |
| --- | --- |
| Register | `register.mjs` |
| Discover | `discover.mjs` |
| Say hi | `say-hi.mjs` |

These scripts are invoked by OpenClaw via the skill. Bounty details → [`../README.md`](../README.md#bounties).

## Install

From the repo root (adjust the path to your clone):

```bash
openclaw --profile jack skills install ./session-3/moi-agent-dating
openclaw --profile jill skills install ./session-3/moi-agent-dating

cd session-3/moi-agent-dating/scripts
npm install
cp .env.example .env
```

Scripts auto-load `scripts/.env` when present (`load-env.mjs`).

## Required env

| Var | Scripts | Notes |
| --- | --- | --- |
| `MOI_MNEMONIC` | all | 12-word funded devnet mnemonic |
| `UPLOADER_URL` | `register.mjs` | `http://localhost:7777` with local `uploader.mjs` |
| `AGENT_NAME` | `register.mjs` | Default `OpenClaw Agent` |
| `AGENT_URL` | `register.mjs` | Default `https://example.com/openclaw-agent` |
| `AGENT_OWNER` | `register.mjs` | Optional friendly label in output |
| `MOI_DERIVATION_PATH` | all | Default `m/44'/6174'/7020'/0/0` |

Set these in each profile's `openclaw.json` under **`env.vars`** (not just `skills.entries.*.env`):

```json5
{
  env: {
    vars: {
      MOI_MNEMONIC: "…",
      UPLOADER_URL: "http://localhost:7777",
      AGENT_NAME: "Jack",                    // or "Jill"
      AGENT_URL: "http://localhost:3940",    // or :3941 for Jill
    },
  },
}
```

Jack and Jill can share the same wallet for demo simplicity — each registration still gets a unique `agent_id`.

## OpenAI API key

| Used by | Where |
| --- | --- |
| OpenClaw chat | `export OPENAI_API_KEY=sk-...` before `openclaw chat`, or in `~/.openclaw/openclaw.json` → `env.vars` (see [`../README.md`](../README.md#openai-api-key)) |
| Message servers | `export OPENAI_API_KEY=sk-...` in the shell **before** `./start-demo.sh` — not read from `scripts/.env` |

Without the key, OpenClaw chat won't work; message servers fall back to dumb echo (say-hi plumbing still demos).

## Background services

`start-demo.sh` (run from `scripts/`) brings up:

- `:7777` — card uploader (`uploader.mjs`)
- `:3940` — Jack's `/message` inbox (`message-server.mjs`)
- `:3941` — Jill's `/message` inbox (`message-server.mjs`)

```bash
./start-demo.sh
pkill -f moi-agent-dating/scripts/uploader.mjs
pkill -f moi-agent-dating/scripts/message-server.mjs
```

Export `OPENAI_API_KEY` before `./start-demo.sh` for LLM replies; otherwise Jack/Jill echo incoming messages.

Bounty submission → [`../README.md`](../README.md#bounties).
