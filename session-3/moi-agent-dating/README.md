# moi-agent-dating — OpenClaw skill

Wraps the `js-moi-agent-registry` SDK so an OpenClaw agent can take part in MOI's on-chain agent registry on devnet. Three operations:

1. **Register** — publish this OpenClaw agent's identity (name, URL, skills, owner wallet) on the registry.
2. **Discover** — list every agent on the registry, including their URL, owner and status.
3. **Say hi** — look up another agent by id, resolve its URL via the registry, and POST a greeting to its `/message` endpoint.

Three Node scripts under `scripts/` do the work; `SKILL.md` is the agent-facing instructions that route `exec` calls to them.

## Install

```bash
# 1. Drop the skill into your OpenClaw workspace
openclaw skills install ./session-3/moi-agent-dating --as moi-agent-dating
#    (or copy/symlink to ~/.openclaw/workspace/skills/moi-agent-dating)

# 2. Install node deps (pinned: js-moi-sdk@0.7.0-rc16, js-moi-agent-registry@0.1.0)
cd ~/.openclaw/workspace/skills/moi-agent-dating/scripts
npm install

# 3. Confirm OpenClaw sees it
openclaw skills list | grep moi-agent-dating
```

### Standalone smoke-test (no OpenClaw)

The three scripts are plain `node` programs and run fine outside OpenClaw. Use Node 20.6+'s native `--env-file` flag with the gitignored `.env` next to them:

```bash
cd session-3/moi-agent-dating/scripts
npm install
cp .env.example .env       # then paste your funded MOI devnet mnemonic into MOI_MNEMONIC

node --env-file=.env discover.mjs                                 # lowest-friction — no UPLOADER_URL needed
node --env-file=.env register.mjs                                 # needs UPLOADER_URL set in .env
node --env-file=.env say-hi.mjs agent_5 "hello from OpenClaw"     # ping another agent
```

OpenClaw itself doesn't read `.env` — when the skill is invoked through OpenClaw, the env vars come from `openclaw.json` (see below). The `.env` is purely for the developer-machine smoke test.

## Required env

| Var | Required by | Notes |
|---|---|---|
| `MOI_MNEMONIC` | all three | 12-word devnet mnemonic |
| `UPLOADER_URL` | `register` | hosted card uploader endpoint (see below) |
| `MOI_DERIVATION_PATH` | optional | defaults to `m/44'/6174'/7020'/0/0` |
| `AGENT_NAME` | optional | defaults to `OpenClaw Agent` |
| `AGENT_URL` | optional | defaults to `https://example.com/openclaw-agent` |

Wire them in `openclaw.json` (host-process only, never reaches sandbox):

```json5
{
  skills: {
    entries: {
      "moi-agent-dating": {
        enabled: true,
        env: {
          MOI_MNEMONIC:  "<12 word devnet mnemonic>",
          UPLOADER_URL:  "https://<your-card-uploader>.example.com/upload",
          AGENT_NAME:    "OpenClaw Agent A",
          AGENT_URL:     "https://<your-agent-server>.example.com",
        },
      },
    },
  },
}
```

## The hosted card uploader

`register.mjs` POSTs the agent card JSON to `UPLOADER_URL` and expects a JSON response `{ "uri": "ipfs://…" | "https://…" }`. The returned `uri` is what lands on chain as the agent's `card_uri`. Contract:

```
POST {UPLOADER_URL}
Content-Type: application/json

<agent card JSON>
->
HTTP 200
{ "uri": "ipfs://Qm…/card.json" }
```

> **Live infra check before the demo.** Run a smoke test against the uploader first:
> ```bash
> curl -fsSL -X POST "$UPLOADER_URL" \
>   -H 'Content-Type: application/json' \
>   -d '{"spec":{"protocol":"a2a","protocol_version":"1.0"},"agent_card":{"name":"probe"}}'
> ```
> A non-200 or a response without `{ "uri": "..." }` will fail the registration with a clear error.

## Two-agent demo runbook

This is the order you'd run during the webinar. Run **agent A** and **agent B** as two OpenClaw agents — separate OpenClaw workspaces, separate mnemonics, both with this skill installed.

```text
─── Agent A ────────────────────────────────────────────────────────
1.  user: register me on the MOI registry
    A: /skill moi-agent-dating
    A: exec node {baseDir}/scripts/register.mjs
       → [register] assigned agent_id: agent_N
       → on-chain profile printed
    (A now exists in the registry — copy its agent_id.)

─── Agent B ────────────────────────────────────────────────────────
2.  user: register me on the MOI registry too
    B: /skill moi-agent-dating
    B: exec node {baseDir}/scripts/register.mjs
       → [register] assigned agent_id: agent_M

─── Agent A ────────────────────────────────────────────────────────
3.  user: list every other agent on the MOI registry
    A: exec node {baseDir}/scripts/discover.mjs
       → table of agents incl. agent_M with its URL

4.  user: say hi to agent_M
    A: exec node {baseDir}/scripts/say-hi.mjs agent_M "hello from A"
       → POST {agent_M.url}/message { from, text }
       → reply printed
```

## What needs to be confirmed against the live repo before the webinar

The MOI registry SDK signatures used here are verified against the published
package (`js-moi-agent-registry@0.1.0`, peer `js-moi-sdk >=0.7.0-rc15`). The
two things still living *outside* the SDK and therefore worth a smoke test:

1. **Hosted uploader endpoint.** The `UPLOADER_URL` service does not ship with
   this skill. Deploy whichever uploader you intend to use (`data:` URI shim,
   IPFS gateway, etc.) and confirm it returns `{ uri: string }` for a card
   POST. If it returns a different shape, edit `buildHostedUploader` in
   `register.mjs` accordingly.

2. **`say-hi` /message endpoint shape.** This skill assumes the receiving
   agent's server accepts `POST {url}/message { from, text }`. That's a
   convention, not part of the on-chain card. Make sure the agent you're
   greeting actually implements this (the matching server is up to whoever
   owns that agent). If you control both sides, mirror this shape in your
   agent server.

3. **`createAgent` metadata field names.** This skill uses the types from
   `js-moi-agent-registry@0.1.0` (`AgentCardInput`, camelCase fields such as
   `agentWallet`, `preferredTransport`, `defaultInputModes`). If the SDK
   version published at demo time is newer, re-verify by reading
   `node_modules/js-moi-agent-registry/lib.cjs/card.d.ts`.
