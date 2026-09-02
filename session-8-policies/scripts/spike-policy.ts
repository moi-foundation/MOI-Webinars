// SPIKE — does the access-policy lifecycle actually work on this node?
//
//   npm run spike:policy
//
// Proves or kills the session before the demo is built on it. Four operations: create a policy,
// read it back, update it, delete it. Enforcement itself is the demo's job, not this script's.
//
// Two things worth knowing before reading the calls below.
//
// 1. The resource id is the LOGIC ID of the logic that performs the write — not a storage slot,
//    not the owner's address. A policy says "this logic may write my storage", so the logic is
//    what it has to name.
// 2. `withinPrefix` exists on the builder but the network does not enforce it yet, and the read
//    RPCs do not return it. Setting it would look like a narrower grant than the one you got, so
//    this spike leaves it off.
//
// The create/update/delete calls are real interactions and cost fuel.

import { Access, access } from "js-moi-sdk";
import { AccessAction } from "js-moi-utils";
import {
  config, ownerAccount, agentAccount, existsOnChain, rawRpc, waitReceipt, receiptError,
  banner, detail, ok, fail, say, summary,
} from "@demo/shared";

let failures = 0;
const check = (name: string, pass: boolean, note: string): void => {
  if (pass) ok(`${name} — ${note}`);
  else { fail(`${name} — ${note}`); failures++; }
};

/** Read back the owner's policy for one storage resource. Returns null when there is none. */
async function readPolicy(ownerId: string, resourceId: string): Promise<any | null> {
  try {
    return await rawRpc<any>("moi.AccessPolicy", [{
      id: ownerId, resource_type: "storage", resource_id: resourceId,
      options: { tesseract_number: -1 },
    }]);
  } catch {
    return null;
  }
}

/** Send an access op and report whether the RECEIPT says it landed. */
async function sendAccess(owner: Awaited<ReturnType<typeof ownerAccount>>, label: string,
                          build: () => { send: () => Promise<{ hash: string }> }): Promise<void> {
  try {
    const ix = await build().send();
    detail(`${label} ix`, ix.hash);
    const err = receiptError(await waitReceipt(owner, ix.hash));
    check(label, !err, err ?? `landed, ix ${ix.hash}`);
  } catch (err) {
    check(label, false, (err as Error).message);
  }
}

async function main(): Promise<void> {
  const owner = await ownerAccount();
  const agent = await agentAccount();

  banner("OWNER", "spike", "Access policy lifecycle: create, read, update, delete");
  detail("owner (policy writer)", owner.address);
  detail("agent (the caller)", agent.address);

  if (!(await existsOnChain(owner))) {
    throw new Error("owner is not on chain — fund it, then run `npm run preflight`");
  }
  if (!config.logicIdOrNull) {
    throw new Error("LOGIC_ID unset — run `npm run setup:logic` first");
  }
  const resourceId = config.logicId as `0x${string}`;
  detail("resource (the logic that writes)", resourceId);

  // ── 1. create ────────────────────────────────────────────────────────────────────────────
  // The owner grants exactly one right: this logic may mutate the owner's storage, but only when
  // the interaction was ORIGINATED by the agent. Anyone else calling the same logic is refused.
  await sendAccess(owner, "ACCESS_CREATE", () =>
    new Access(owner.wallet)
      .storage(resourceId)
      .allow(AccessAction.STORAGE_MUTATE)
      .caller(access.anyCaller())
      .origin(access.callers(agent.address as `0x${string}`))
      .create());

  // ── 2. read it back ──────────────────────────────────────────────────────────────────────
  const policy = await readPolicy(owner.address, resourceId);
  check("policy is readable from chain", policy != null,
    policy ? "moi.AccessPolicy returned it" : "moi.AccessPolicy returned nothing");
  if (policy) {
    detail("resource", JSON.stringify(policy?.resource ?? policy?.resource_type));
    detail("actions", JSON.stringify(policy?.policy?.actions ?? policy?.action_type));
    detail("caller", JSON.stringify(policy?.policy?.caller ?? policy?.caller_constraint));
    detail("origin", JSON.stringify(policy?.policy?.origin ?? policy?.origin_constraint));
  }

  // ── 3. update — widen the origin set to anyone ───────────────────────────────────────────
  // UPDATE replaces the whole policy body, it does not merge into it. Everything you still want
  // has to be restated.
  await sendAccess(owner, "ACCESS_UPDATE", () =>
    new Access(owner.wallet)
      .storage(resourceId)
      .allow(AccessAction.STORAGE_MUTATE)
      .caller(access.anyCaller())
      .origin(access.anyCaller())
      .update());

  // ── 4. delete — revocation, which is the demo's closing beat ─────────────────────────────
  await sendAccess(owner, "ACCESS_DELETE", () =>
    new Access(owner.wallet).storage(resourceId).delete());

  const gone = (await readPolicy(owner.address, resourceId)) == null;
  check("policy is gone after delete", gone, gone ? "moi.AccessPolicy returns nothing" : "still there");

  say("OWNER", "Enforcement is the demo's job — see `npm run demo`.");
  summary(failures === 0 ? "Policy lifecycle works on this node" : "SPIKE FAILED — do not build on this yet", [
    ["failures", String(failures)],
    ["resource", resourceId],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nspike failed: ${(e as Error).message}\n`); process.exit(1); });
