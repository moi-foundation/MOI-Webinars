// The on-stage driver for SESSION 8 (V2: identity + payment + context inheritance).
//
//   npm run demo                  the happy path — session 7's flow, now gated by the on-chain budget
//   npm run demo -- --overspend   exhaust the budget on chain, then let the agent try to buy anyway.
//                                 The brain says buy; the AgentBudget contract reverts; no money moves.
//   npm run demo -- --kill        the owner zeroes the remaining budget mid-session; the next
//                                 purchase dies instantly. The agent is not consulted.
//   npm run demo -- --tamper      session 7's identity beat, still working.
//
// ⚠️ The proof on stage is always the BALANCE DIFF, never a receipt — MAS0 fails silently.

import {
  config, buyerAccount, sellerAccount, registryClient, getProfile, updateAgentWallet,
  setBudget, getBudget,
  addr0x, banner, detail, ok, fail, warn, say, summary,
} from "@demo/shared";
import { startSeller } from "@demo/agent-seller";
import { runBuyer } from "@demo/agent-buyer";
import { PaymentRefused } from "@demo/agent-buyer/src/pay.js";

const args = new Set(process.argv.slice(2));
const TAMPER = args.has("--tamper");
const OVERSPEND = args.has("--overspend");
const KILL = args.has("--kill");
const QUESTION = "How likely is a big bitcoin drawdown this quarter?";

async function main(): Promise<void> {
  banner("DEMO", "0", "MOI Builders #8 — the agent spends under a budget the CHAIN enforces");
  detail("mode", OVERSPEND ? "--overspend (the chain says no)"
    : KILL ? "--kill (the owner pulls the plug)"
    : TAMPER ? "--tamper (identity attack)" : "happy path");
  detail("asset", config.assetId);
  detail("price", `${config.price} ${config.assetSymbol}`);

  const buyer = await buyerAccount();
  const seller = await sellerAccount();

  if (!config.assetIdOrNull) {
    throw new Error("SETTLEMENT_ASSET_ID is not set — run `npm run setup:asset` first.");
  }
  if (!config.sellerAgentId || !config.buyerAgentId) {
    throw new Error("agents are not registered — run `npm run setup:registry` first.");
  }

  banner("DEMO", "1", "The two agents, on chain");
  const reg = await registryClient(buyer, false).catch(() => null);
  for (const [label, id] of [["seller", config.sellerAgentId], ["buyer", config.buyerAgentId]] as const) {
    if (!id) { warn(`${label}: not registered — run npm run setup:registry`); continue; }
    const p = await getProfile(reg, id);
    if (!p) { warn(`${label}: ${id} not found on chain`); continue; }
    detail(`${label} agent`, `${p.agent_id}  [${p.status}]`);
    detail(`${label} wallet`, addr0x(p.agent_wallet));
  }

  // The "attacker" is the buyer's own address: any wallet that is not the seller's works, but it
  // MUST be a valid, existing identifier — a made-up hex string (e.g. 0xdede…) is rejected by the
  // node as an invalid identifier, which makes the restore below permanently unmineable and bricks
  // the agent's registry entry.
  const ATTACKER = buyer.address;

  let restoreWallet = false;
  if (TAMPER) {
    if (!config.sellerAgentId) throw new Error("--tamper needs a registered seller");
    banner("DEMO", "1b", "TAMPER — repointing the seller's registry wallet at an attacker");
    await updateAgentWallet(reg, config.sellerAgentId, ATTACKER);
    restoreWallet = true;
    fail(`registry agent_wallet for ${config.sellerAgentId} is now ${ATTACKER}`);
    say("DEMO", "the seller still asks to be paid at its REAL address — watch the buyer notice");
  }

  // ── session 8's sabotage beats — staged ON CHAIN, not in our code ─────────────────────────
  let restoreBudget: bigint | null = null;
  if (OVERSPEND || KILL) {
    const before = await getBudget(buyer);
    detail("budget", String(before.budget));
    detail("spent", String(before.spent));
    detail("remaining", String(before.remaining));
    restoreBudget = before.budget;
    if (OVERSPEND) {
      banner("DEMO", "1b", "OVERSPEND — shrink the budget so the next purchase exceeds it");
      // Leave less than one purchase's worth of headroom. SetBudget must stay > spent.
      await setBudget(buyer, before.spent + (config.price > 1n ? config.price - 1n : 1n));
      say("DEMO", "the agent still WANTS to buy. Watch the contract refuse to record the spend.");
    } else {
      banner("DEMO", "1b", "KILL — the owner zeroes the remaining budget, mid-session");
      await setBudget(buyer, before.spent > 0n ? before.spent : 1n);
      say("DEMO", "the agent was not consulted. Its next purchase dies at the gate.");
    }
    const now = await getBudget(buyer);
    detail("remaining now", String(now.remaining));
  }

  const sellerSvc = await startSeller();

  try {
    const result = await runBuyer({ fallbackUrl: sellerSvc.url, question: QUESTION });
    summary("Payment complete", [
      ["market", result.marketId],
      ["buyer's transfer", result.txHash ?? "(none)"],
      ["seller confirmed", result.receiptTx ?? "(none)"],
      ["price", `${result.price} ${config.assetSymbol}`],
      ["buyer", buyer.address],
      ["seller", seller.address],
    ]);
    if (TAMPER || OVERSPEND || KILL) {
      fail("EXPECTED A REFUSAL BUT THE PURCHASE SUCCEEDED — the guard did not fire.");
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof PaymentRefused && (TAMPER || OVERSPEND || KILL)) {
      // Refusing IS the success condition here.
      summary(OVERSPEND || KILL ? "The CHAIN refused — exactly as intended" : "Agent refused — exactly as intended", [
        ["reason", (err as Error).message],
        ["money moved", "none"],
        ...(OVERSPEND || KILL ? [["enforced by", "AgentBudget contract, on chain"] as [string, string]] : []),
      ]);
    } else {
      throw err;
    }
  } finally {
    await sellerSvc.close();
    if (restoreBudget !== null) {
      await setBudget(buyer, restoreBudget);
      ok(`restored the buyer's budget to ${restoreBudget}`);
    }
    if (restoreWallet && config.sellerAgentId) {
      await updateAgentWallet(await registryClient(buyer, false), config.sellerAgentId, seller.address);
      ok(`restored the seller's registry wallet to ${seller.address}`);
    }
  }
}

main().catch((e) => { console.error(`\ndemo failed: ${(e as Error).message}\n`); process.exit(1); });
