// Preflight — what actually exists on chain right now?
//
//   npm run preflight
//
// Devnet gets reset. When it does, every account, asset, agent registration and transaction from
// a previous run stops existing, and the SDK reports that as "account not found" — which reads
// like a bug and isn't. This script tells you, in order, exactly how far the setup has survived
// and what to run next.
//
// Safe to run any time. Reads only, spends nothing, needs no balance.

import {
  config, VOYAGE_DEVNET_RPC, FAUCET_URL,
  buyerAccount, sellerAccount, existsOnChain, registryClient, getProfile,
  banner, detail, ok, fail, warn, say, summary, type Account,
} from "@demo/shared";
import { getAssetDriver, KMOI_ASSET_ID } from "js-moi-sdk";

type Check = { label: string; pass: boolean; note: string };
const checks: Check[] = [];
const record = (label: string, pass: boolean, note: string): boolean => {
  checks.push({ label, pass, note });
  (pass ? ok : fail)(`${label} — ${note}`);
  return pass;
};

/** Balance of any asset, distinguishing "zero" from "cannot read". */
async function balanceOf(reader: Account, assetId: string, holder: string): Promise<bigint | null> {
  try {
    const driver: any = await getAssetDriver(assetId, reader.wallet);
    const { output, error } = await driver.routines.BalanceOf(holder);
    if (error) return null;
    return BigInt(output?.balance ?? 0);
  } catch { return null; }   // null = could not read (usually: does not exist on this chain)
}

async function main(): Promise<void> {
  banner("SETUP", "preflight", "What exists on chain right now?");
  detail("rpc", VOYAGE_DEVNET_RPC);
  detail("asset in .env", config.assetIdOrNull ?? "(unset)");

  // ── 1. is the RPC even answering? ────────────────────────────────────────────────────────
  let rpcUp = false;
  try {
    const res = await fetch(VOYAGE_DEVNET_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "moi.Version", params: [{}] }),
    });
    rpcUp = res.ok || res.status === 200;
  } catch { rpcUp = false; }
  if (!record("rpc reachable", rpcUp, rpcUp ? "answering" : "no response — check the network or the RPC url")) {
    summary("Chain unreachable — nothing else can be checked", [["rpc", VOYAGE_DEVNET_RPC]]);
    process.exit(1);
  }

  // ── 2. do our accounts exist on THIS chain? ──────────────────────────────────────────────
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  detail("buyer address", buyer.address);
  detail("seller address", seller.address);

  const buyerLives = await existsOnChain(buyer);
  const sellerLives = await existsOnChain(seller);

  record("buyer account exists", buyerLives,
    buyerLives ? "found" : "not on this chain — fund it from the faucet to create it");
  record("seller account exists", sellerLives,
    sellerLives ? "found" : "not on this chain — created by the first transfer to it, or fund it");

  if (!buyerLives) {
    warn("");
    warn("This is the devnet-reset signature: the mnemonic is fine, the address is fine,");
    warn("but the chain holding that account was wiped. Nothing is corrupted.");
    warn(`Fund the buyer address above at ${FAUCET_URL}, then run this again.`);
    summary("Not provisioned — fund the buyer first", [
      ["next", `faucet: ${FAUCET_URL}`],
      ["then", "npm run preflight"],
    ]);
    process.exit(1);
  }

  // ── 3. fuel ──────────────────────────────────────────────────────────────────────────────
  const kmoi = await balanceOf(buyer, KMOI_ASSET_ID, buyer.address);
  record("buyer holds fuel (KMOI)", kmoi !== null && kmoi > 0n,
    kmoi === null ? "unreadable" : `${kmoi} KMOI`);

  // ── 4. the settlement asset ──────────────────────────────────────────────────────────────
  if (!config.assetIdOrNull) {
    record("settlement asset", false, "SETTLEMENT_ASSET_ID unset — run `npm run setup:asset`");
  } else {
    const bal = await balanceOf(buyer, config.assetId, buyer.address);
    if (bal === null) {
      record("settlement asset", false,
        "asset id in .env does not exist on this chain — stale after a reset. Run `npm run setup:asset`");
    } else {
      record("settlement asset", true, `buyer holds ${bal} ${config.assetSymbol}`);
      if (bal < 12n) warn(`  low float — the attack suite needs >= 12 ${config.assetSymbol}`);
    }
  }

  // ── 5. agent registrations ───────────────────────────────────────────────────────────────
  let reg: Awaited<ReturnType<typeof registryClient>> | null = null;
  try { reg = await registryClient(buyer, false); }
  catch (e) { record("registry client", false, (e as Error).message); }

  if (reg) {
    for (const [label, id] of [["seller", config.sellerAgentId], ["buyer", config.buyerAgentId]] as const) {
      if (!id) { record(`${label} agent registered`, false, "id unset in .env — run `npm run setup:registry`"); continue; }
      try {
        const p = await getProfile(reg, id);
        record(`${label} agent registered`, !!p, p ? `${id} -> ${p.agent_wallet}` : `${id} not found`);
      } catch (e) {
        record(`${label} agent registered`, false, `${id} unreadable — ${(e as Error).message}`);
      }
    }
  }

  // ── verdict ──────────────────────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.pass);
  if (failed.length === 0) {
    summary("Ready — everything session 7 needs is on chain", [
      ["checks", `${checks.length}/${checks.length} passed`],
      ["next", "npm run demo   ·   npx tsx scripts/spike-allowance.ts"],
    ]);
    process.exit(0);
  }

  say("SETUP", "What to run, in order:");
  if (failed.some((c) => c.label === "settlement asset")) detail("1", "npm run setup:asset      # mint USDM, fund the buyer");
  if (failed.some((c) => c.label.endsWith("agent registered"))) detail("2", "npm run setup:registry   # re-register both agents");
  detail("3", "npm run preflight        # confirm, then demo");

  summary("Setup incomplete", [
    ["passed", String(checks.length - failed.length)],
    ["failed", String(failed.length)],
  ]);
  process.exit(1);
}

main().catch((e) => { console.error(`\npreflight failed: ${(e as Error).message}\n`); process.exit(1); });
