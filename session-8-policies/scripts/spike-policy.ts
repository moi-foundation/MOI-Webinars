// SPIKE — does the access-policy lifecycle actually work on this node?
//
//   npm run spike:policy
//
// Proves or kills the session before any demo is built on it. Tests the four operations the demo
// depends on: create a policy, read it back, update it, delete it.
//
// What it does NOT test is the enforcement itself — an agent write succeeding under a policy and
// failing without one. That needs a logic whose storage the policy governs, and is the one piece
// still open. See NOTES.md.
//
// Read-only where it can be. The create/update/delete calls are real interactions and cost fuel.

import { Access, access } from "js-moi-sdk";
import { AccessAction, ResourceType } from "js-moi-utils";
import {
  config, ownerAccount, agentAccount, existsOnChain, rawRpc,
  banner, detail, ok, fail, say, summary,
} from "@demo/shared";

let failures = 0;
const check = (name: string, pass: boolean, note: string): void => {
  if (pass) ok(`${name} — ${note}`);
  else { fail(`${name} — ${note}`); failures++; }
};

const ZERO = "0x" + "00".repeat(32);

/** Read the owner's storage policies straight off the node. */
async function policies(ownerId: string): Promise<any[]> {
  const out = await rawRpc<any>("moi.AccessPolicies", [{
    id: ownerId, resource_type: "storage", resource_id: ZERO,
    options: { tesseract_number: -1 },
  }]);
  return Array.isArray(out) ? out : (out?.policies ?? []);
}

async function main(): Promise<void> {
  const owner = await ownerAccount();
  const agent = await agentAccount();

  banner("SETUP", "spike", "Access policy lifecycle: create, read, update, delete");
  detail("owner (policy writer)", owner.address);
  detail("agent (the caller)", agent.address);

  if (!(await existsOnChain(owner))) {
    throw new Error("owner is not on chain — fund it, then run `npm run preflight`");
  }
  if (!config.logicIdOrNull) {
    throw new Error("LOGIC_ID unset — the policy needs a storage resource to govern");
  }
  const resourceId = config.logicId as `0x${string}`;
  detail("resource (storage of)", resourceId);

  const before = await policies(owner.address).catch(() => []);
  detail("policies before", String(before.length));

  // ── 1. create ────────────────────────────────────────────────────────────────────────────
  // The owner grants the agent one narrow right: mutate this storage, and only under one prefix.
  const PREFIX = "0x" + "a1".repeat(4);
  try {
    const ix = await new Access(owner.wallet)
      .storage(resourceId)
      .allow(AccessAction.STORAGE_MUTATE)
      .withinPrefix(PREFIX as `0x${string}`)
      .caller(access.callers(agent.address as `0x${string}`))
      .create()
      .send();
    detail("create ix", ix.hash);
    const r = (await ix.result()) as unknown as { error?: unknown };
    if (r?.error) throw new Error(JSON.stringify(r.error));
    check("ACCESS_CREATE accepted", true, `ix ${ix.hash}`);
  } catch (err) {
    check("ACCESS_CREATE accepted", false, (err as Error).message);
  }

  // ── 2. read it back ──────────────────────────────────────────────────────────────────────
  try {
    const after = await policies(owner.address);
    const found = after.length > before.length;
    check("policy is readable from chain", found,
      found ? `${after.length} polic${after.length === 1 ? "y" : "ies"}` : "no new policy appeared");
    if (found) {
      const p = after[after.length - 1];
      detail("resource_type", String(p?.resource_type));
      detail("action_type", JSON.stringify(p?.action_type));
      detail("caller_constraint", JSON.stringify(p?.caller_constraint));
    }
  } catch (err) {
    check("policy is readable from chain", false, (err as Error).message);
  }

  // ── 3. update — widen the caller set to anyone ───────────────────────────────────────────
  try {
    const ix = await new Access(owner.wallet)
      .storage(resourceId)
      .allow(AccessAction.STORAGE_MUTATE)
      .withinPrefix(PREFIX as `0x${string}`)
      .caller(access.anyCaller())
      .update()
      .send();
    const r = (await ix.result()) as unknown as { error?: unknown };
    if (r?.error) throw new Error(JSON.stringify(r.error));
    check("ACCESS_UPDATE accepted", true, `ix ${ix.hash}`);
  } catch (err) {
    check("ACCESS_UPDATE accepted", false, (err as Error).message);
  }

  // ── 4. delete — revocation, which is the demo's closing beat ─────────────────────────────
  try {
    const ix = await new Access(owner.wallet).storage(resourceId).delete().send();
    const r = (await ix.result()) as unknown as { error?: unknown };
    if (r?.error) throw new Error(JSON.stringify(r.error));
    const after = await policies(owner.address).catch(() => []);
    check("ACCESS_DELETE accepted", after.length <= before.length,
      `${after.length} polic${after.length === 1 ? "y" : "ies"} remain`);
  } catch (err) {
    check("ACCESS_DELETE accepted", false, (err as Error).message);
  }

  say("SETUP", "Enforcement itself is NOT covered here — see NOTES.md for the open piece.");
  summary(failures === 0 ? "Policy lifecycle works on this node" : "SPIKE FAILED — do not build on this yet", [
    ["failures", String(failures)],
    ["resource", resourceId],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nspike failed: ${(e as Error).message}\n`); process.exit(1); });
