// Preflight — what exists on chain right now, and does this node support access policies?
//
//   npm run preflight
//
// Reads only. Spends nothing. Safe to run with an empty wallet, which is the state it exists to
// diagnose: devnet gets reset, and when it does every account vanishes and the SDK reports it as
// "account not found", which reads like a bug in your code and is not.

import {
  config, VOYAGE_DEVNET_RPC, FAUCET_URL,
  ownerAccount, agentAccount, existsOnChain, rawRpc,
  banner, detail, ok, fail, warn, summary,
} from "@demo/shared";

const checks: { label: string; pass: boolean }[] = [];
const record = (label: string, pass: boolean, note: string): boolean => {
  checks.push({ label, pass });
  (pass ? ok : fail)(`${label} — ${note}`);
  return pass;
};

/** Distinguishes "method missing" (-32601) from "bad params" (-32602) and domain errors. */
async function probe(method: string, params: unknown): Promise<{ supported: boolean; note: string }> {
  try {
    await rawRpc(method, [params]);
    return { supported: true, note: "answered" };
  } catch (err) {
    const m = (err as Error).message ?? "";
    if (/-32601|does not exist|not available/i.test(m)) return { supported: false, note: "method not on this node" };
    // Anything else means the method exists and rejected our input or our data.
    return { supported: true, note: `present (${m.slice(0, 60)})` };
  }
}

async function main(): Promise<void> {
  banner("SETUP", "preflight", "Access policies: what exists, and does this node support them?");
  detail("rpc", VOYAGE_DEVNET_RPC);

  const owner = await ownerAccount();
  const agent = await agentAccount();
  detail("owner", owner.address);
  detail("agent", agent.address);

  // ── 1. does this node implement the policy RPC at all? ───────────────────────────────────
  const ZERO = "0x" + "00".repeat(32);
  const p = await probe("moi.AccessPolicies", {
    id: owner.address, resource_type: "storage", resource_id: ZERO,
    options: { tesseract_number: -1 },
  });
  if (!record("node supports access policies", p.supported, p.note)) {
    summary("This node is too old for access policies", [
      ["needed", "a node exposing moi.AccessPolicy / moi.AccessPolicies"],
    ]);
    process.exit(1);
  }

  // ── 2. accounts ──────────────────────────────────────────────────────────────────────────
  const ownerLives = await existsOnChain(owner);
  record("owner account exists", ownerLives, ownerLives ? "found" : "not on this chain — fund it");
  if (!ownerLives) {
    warn("");
    warn("This is the devnet-reset signature: the mnemonic is fine, the address is fine,");
    warn("but the chain holding that account was wiped. Nothing is corrupted.");
    warn(`Fund the owner address above at ${FAUCET_URL}, then run this again.`);
    summary("Not provisioned — fund the owner first", [["next", `faucet: ${FAUCET_URL}`]]);
    process.exit(1);
  }

  // The agent signs its own calls, so unlike session 7's receive-only seller it genuinely needs
  // fuel. Two faucet top-ups, not one.
  const agentLives = await existsOnChain(agent);
  record("agent account exists", agentLives,
    agentLives ? "found" : `not on this chain — fund it too at ${FAUCET_URL}`);

  // ── 3. the logic whose storage we govern ─────────────────────────────────────────────────
  record("LOGIC_ID set", !!config.logicIdOrNull,
    config.logicIdOrNull ?? "unset — run `npm run setup:logic`");

  // ── 4. existing policies on the owner ────────────────────────────────────────────────────
  try {
    const list = await rawRpc<unknown[]>("moi.AccessPolicies", [{
      id: owner.address, resource_type: "storage", resource_id: ZERO,
      options: { tesseract_number: -1 },
    }]);
    const n = Array.isArray(list) ? list.length : 0;
    ok(`owner has ${n} storage polic${n === 1 ? "y" : "ies"}`);
  } catch (err) {
    warn(`could not list policies: ${(err as Error).message}`);
  }

  const failed = checks.filter((c) => !c.pass);
  summary(failed.length === 0 ? "Ready" : "Setup incomplete", [
    ["passed", `${checks.length - failed.length}/${checks.length}`],
    ["next", failed.length === 0 ? "npm run spike:policy" : "see the failures above"],
  ]);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\npreflight failed: ${(e as Error).message}\n`); process.exit(1); });
