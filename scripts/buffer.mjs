#!/usr/bin/env node
//
// Schedule MOI Builders posts through Buffer.
//
//   node scripts/buffer.mjs channels                     list your connected channels
//   node scripts/buffer.mjs post --file post.txt --channel <id> --at "2026-09-03T09:00:00Z"
//   node scripts/buffer.mjs post ... --confirm           actually schedule it
//
// Buffer's API is GraphQL over a single endpoint, authenticated with a bearer token.
// Get a key at https://publish.buffer.com/settings/api and put it in .env at the repo root:
//
//   BUFFER_API_KEY=...
//
// .env is gitignored here. Never commit the key, and never paste it into a chat window.
//
// NOTHING IS SCHEDULED WITHOUT --confirm. Every run without it prints exactly what it would
// send and stops. Posting is public and one way, so the default is to do nothing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.buffer.com";

// ── config ──────────────────────────────────────────────────────────────────────────────────

/**
 * Minimal .env reader. Avoids a dependency for one variable.
 *
 * LAST occurrence wins. Rotating a key means appending the new one, which leaves the dead key
 * above it in the file — and first-wins would silently keep authenticating with the revoked one.
 * The error you get for that ("access token is not valid") gives no hint that a stale duplicate
 * is the cause. An existing process env var still beats the file.
 */
function loadEnv() {
  const f = path.join(ROOT, ".env");
  if (!fs.existsSync(f)) return;
  const fromFile = {};
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) fromFile[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  for (const [k, v] of Object.entries(fromFile)) if (!process.env[k]) process.env[k] = v;
}
loadEnv();

const KEY = process.env.BUFFER_API_KEY;
if (!KEY) {
  console.error(
    "\nBUFFER_API_KEY is not set.\n\n" +
    "  1. Get a key at https://publish.buffer.com/settings/api\n" +
    `  2. Add it to ${path.join(ROOT, ".env")} as:  BUFFER_API_KEY=...\n\n` +
    "That file is gitignored. Do not paste the key into a chat or a commit.\n",
  );
  process.exit(1);
}

// ── api ─────────────────────────────────────────────────────────────────────────────────────

async function gql(query, label) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${label}: non-JSON reply (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (json.errors?.length) throw new Error(`${label}: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return json.data;
}

const orgId = async () => {
  const d = await gql(`query { account { organizations { id } } }`, "organizations");
  const id = d?.account?.organizations?.[0]?.id;
  if (!id) throw new Error("no organization on this account");
  return id;
};

const channels = async () => {
  const org = await orgId();
  const d = await gql(`query { channels(input: { organizationId: "${org}" }) { id name service } }`, "channels");
  return d?.channels ?? [];
};

// ── commands ────────────────────────────────────────────────────────────────────────────────

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

async function cmdChannels() {
  const list = await channels();
  if (!list.length) return console.log("  no channels connected to this Buffer account");
  console.log("");
  for (const c of list) console.log(`  ${String(c.service).padEnd(12)} ${c.name.padEnd(28)} ${c.id}`);
  console.log("\n  Pass one of those ids as --channel.\n");
}

async function cmdPost() {
  const file = arg("file");
  const channel = arg("channel");
  const at = arg("at");
  const text = file ? fs.readFileSync(path.resolve(file), "utf8").trim() : arg("text");
  const followFile = arg("follow");
  const follow = followFile ? fs.readFileSync(path.resolve(followFile), "utf8").trim() : null;

  if (!text) throw new Error("need --file <path> or --text \"...\"");
  if (!channel) throw new Error("need --channel <id> — run `channels` to list them");
  if (at && Number.isNaN(Date.parse(at))) throw new Error(`--at is not a valid date: ${at}`);

  const named = (await channels()).find((c) => c.id === channel);

  // --follow attaches the link-carrying piece the way each platform wants it:
  // on X as the second post of a thread, on LinkedIn as the first comment. Both exist because
  // links in the post body suppress reach, so the main post stays clean and the link rides along.
  const service = named?.service ?? "";
  const followKind = follow
    ? service === "twitter" ? "thread reply" : service === "linkedin" ? "first comment" : null
    : null;
  if (follow && !followKind) {
    throw new Error(`--follow is only supported for twitter (thread) and linkedin (first comment), not "${service}"`);
  }

  // A draft sits in Buffer for a human to look at and publish. A scheduled post goes out on its
  // own at dueAt with nobody in the loop. Very different things, so say which out loud.
  const draft = has("draft");
  const fate = draft
    ? "DRAFT — sits in Buffer until you publish it yourself"
    : at
      ? `PUBLISHES AUTOMATICALLY at ${new Date(at).toUTCString()}, nobody reviews it`
      : "PUBLISHES AUTOMATICALLY in the next queue slot, nobody reviews it";

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(`  channel   ${named ? `${named.service} · ${named.name}` : channel}`);
  console.log(`  fate      ${fate}`);
  console.log(`  ${text.length} characters${follow ? ` + ${followKind} (${follow.length})` : ""}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log(text.split("\n").map((l) => `  ${l}`).join("\n"));
  if (follow) {
    console.log(`  ── ${followKind} ──`);
    console.log(follow.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  console.log("──────────────────────────────────────────────────────────────\n");

  if (!has("confirm")) {
    console.log("  Dry run. Nothing was sent to Buffer at all.");
    console.log("  Add --confirm to send it, and --draft to send it as a draft instead of scheduling it.\n");
    return;
  }

  // GraphQL string literals: escape backslashes, quotes and newlines.
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  // Drafts are not scheduled, so they take addToQueue and no dueAt.
  const mode = draft ? "addToQueue" : at ? "customScheduled" : "addToQueue";
  const due = !draft && at ? `, dueAt: "${new Date(at).toISOString()}"` : "";
  const asDraft = draft ? `, saveToDraft: true` : "";

  // Twitter threads want EVERY post listed, including the root, which must match the top-level
  // text. LinkedIn takes the comment as a plain string.
  let meta = "";
  if (follow && followKind === "thread reply") {
    meta = `, metadata: { twitter: { thread: [` +
      `{ text: "${esc(text)}", assets: [] }, { text: "${esc(follow)}", assets: [] }` +
      `] } }`;
  } else if (follow && followKind === "first comment") {
    meta = `, metadata: { linkedin: { firstComment: "${esc(follow)}" } }`;
  }

  const d = await gql(`
    mutation {
      createPost(input: {
        text: "${esc(text)}",
        channelId: "${channel}",
        schedulingType: automatic,
        mode: ${mode}${due}${asDraft}${meta}
      }) {
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`, "createPost");

  const r = d?.createPost;
  if (r?.message) throw new Error(`Buffer refused it: ${r.message}`);
  if (draft) console.log(`  Saved as a draft. id ${r?.post?.id}. Publish it from Buffer when you are ready.\n`);
  else console.log(`  Scheduled to publish. id ${r?.post?.id}  at ${r?.post?.dueAt ?? "the next queue slot"}\n`);
}

const cmd = process.argv[2];
const run = { channels: cmdChannels, post: cmdPost }[cmd];

if (!run) {
  console.log(`
  node scripts/buffer.mjs channels
  node scripts/buffer.mjs post --file <path> --channel <id> [--at <iso8601>] [--draft] [--confirm]
  node scripts/buffer.mjs post --text "..." --channel <id> [--at <iso8601>] [--draft] [--confirm]

  --confirm   actually send it. Without this, nothing reaches Buffer at all.
  --draft     save it as a draft for you to publish by hand, instead of
              scheduling it to go out on its own. Ignores --at.
  --follow    a second text file attached the way the platform wants it:
              on X as the thread's second post, on LinkedIn as the first comment.
`);
  process.exit(1);
}

run().catch((e) => { console.error(`\n${e.message}\n`); process.exit(1); });
