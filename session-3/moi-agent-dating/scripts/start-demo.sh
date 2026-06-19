#!/usr/bin/env bash
# Brings up the three background processes the Jack+Jill OpenClaw demo needs:
#   - shared card uploader on :7777
#   - Jack's inbound /message endpoint on :3940  (LLM-backed, persona: Jack)
#   - Jill's inbound /message endpoint on :3941  (LLM-backed, persona: Jill)
#
# Works from the repo checkout — no OpenClaw install required for these servers.
# OpenClaw profiles still need the skill installed separately for the chat demo.
#
# Logs land in /tmp/{uploader,jack,jill}-msgserver.log

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/uploader.mjs" ]; then
  echo "[start-demo] cannot find scripts in $SCRIPT_DIR"
  exit 1
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "[start-demo] OPENAI_API_KEY is not set — message-servers will echo instead of using an LLM."
  echo "             export OPENAI_API_KEY=sk-... for smarter Jack/Jill replies."
  echo
fi

echo "[start-demo] killing any prior dev servers"
pkill -f 'moi-agent-dating/scripts/uploader.mjs' 2>/dev/null || true
pkill -f 'moi-agent-dating/scripts/message-server.mjs' 2>/dev/null || true
for p in 7777 3940 3941; do
  pid=$(lsof -nP -tiTCP:$p -sTCP:LISTEN 2>/dev/null || true)
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
done
sleep 1

echo "[start-demo] starting card uploader on :7777"
cd "$SCRIPT_DIR" && nohup node uploader.mjs > /tmp/uploader.log 2>&1 &
disown

JACK_PERSONA="You are Jack, an upbeat and helpful AI agent registered on the MOI on-chain agent registry. You like brevity and warmth. Another agent has just messaged you — reply naturally in 1–2 sentences. Stay in character as Jack."
JILL_PERSONA="You are Jill, a thoughtful and slightly sardonic AI agent registered on the MOI on-chain agent registry. You enjoy a clever one-liner. Another agent has just messaged you — reply naturally in 1–2 sentences. Stay in character as Jill."

echo "[start-demo] starting Jack's message-server on :3940"
cd "$SCRIPT_DIR" && \
  AGENT_NAME=Jack \
  AGENT_PERSONA="$JACK_PERSONA" \
  PORT=3940 \
  nohup node message-server.mjs > /tmp/jack-msgserver.log 2>&1 &
disown

echo "[start-demo] starting Jill's message-server on :3941"
cd "$SCRIPT_DIR" && \
  AGENT_NAME=Jill \
  AGENT_PERSONA="$JILL_PERSONA" \
  PORT=3941 \
  nohup node message-server.mjs > /tmp/jill-msgserver.log 2>&1 &
disown

sleep 2

echo
echo "[start-demo] listeners:"
lsof -nP -iTCP:3940 -iTCP:3941 -iTCP:7777 2>/dev/null | grep LISTEN || {
  echo "[start-demo] ERROR: one or more servers failed to start — see /tmp/*.log"
  exit 1
}

cat <<EOF

[start-demo] All three servers up. Logs:
  uploader   : tail -F /tmp/uploader.log
  jack inbox : tail -F /tmp/jack-msgserver.log
  jill inbox : tail -F /tmp/jill-msgserver.log

Set in scripts/.env (or OpenClaw env.vars):
  UPLOADER_URL=http://localhost:7777
  AGENT_URL=http://localhost:3940   # Jack — use :3941 for Jill

OpenClaw chat panes (after installing the skill):
  openclaw --profile jack chat --local --session demo-\$(date +%H%M)
  openclaw --profile jill chat --local --session demo-\$(date +%H%M)

To stop:
  pkill -f moi-agent-dating/scripts/uploader.mjs
  pkill -f moi-agent-dating/scripts/message-server.mjs
EOF
