// The on-stage driver for SESSION 7 (V1: identity + payment).
//
//   npm run demo                the happy path
//   npm run demo -- --tamper    repoint the seller's registry wallet at an attacker, so the identity
//                            check FAILS live and the buyer refuses. Restored afterwards.
//
// There is deliberately NO budget beat here — authority is session 8.

import {
  config, buyerAccount, sellerAccount, registryClient, getProfile, updateAgentWallet,
  addr0x, banner, detail, ok, fail, warn, say, summary,
} from "@demo/shared";
import { startSeller } from "@demo/agent-seller";
import { runBuyer } from "@demo/agent-buyer";
import { PaymentRefused } from "@demo/agent-buyer/src/pay.js";

const args = new Set(process.argv.slice(2));
const TAMPER = args.has("--tamper");
const QUESTION = "How do people justify holding power?";

/** A wrong-but-well-formed address to point the registry at during --tamper. */
const ATTACKER = "0x" + "de".repeat(28) + "00000000";

async function main(): Promise<void> {
  banner("DEMO", "0", "MOI Builders #7 — an agent finds another agent, and pays it");
  detail("mode", TAMPER ? "--tamper (identity attack)" : "happy path");
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

  let restoreWallet = false;
  if (TAMPER) {
    if (!config.sellerAgentId) throw new Error("--tamper needs a registered seller");
    banner("DEMO", "1b", "TAMPER — repointing the seller's registry wallet at an attacker");
    await updateAgentWallet(reg, config.sellerAgentId, ATTACKER);
    restoreWallet = true;
    fail(`registry agent_wallet for ${config.sellerAgentId} is now ${ATTACKER}`);
    say("DEMO", "the seller still asks to be paid at its REAL address — watch the buyer notice");
  }

  const sellerSvc = await startSeller();

  try {
    const result = await runBuyer({ fallbackUrl: sellerSvc.url, question: QUESTION });
    summary("Payment complete", [
      ["book", result.bookId],
      ["buyer's transfer", result.txHash ?? "(none)"],
      ["seller confirmed", result.receiptTx ?? "(none)"],
      ["price", `${result.price} ${config.assetSymbol}`],
      ["buyer", buyer.address],
      ["seller", seller.address],
    ]);
    if (TAMPER) {
      fail("EXPECTED A REFUSAL BUT THE PURCHASE SUCCEEDED — the guard did not fire.");
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof PaymentRefused && TAMPER) {
      // Refusing IS the success condition here.
      summary("Agent refused — exactly as intended", [
        ["reason", (err as Error).message],
        ["money moved", "none"],
      ]);
    } else {
      throw err;
    }
  } finally {
    await sellerSvc.close();
    if (restoreWallet && config.sellerAgentId) {
      await updateAgentWallet(await registryClient(buyer, false), config.sellerAgentId, seller.address);
      ok(`restored the seller's registry wallet to ${seller.address}`);
    }
  }
}

main().catch((e) => { console.error(`\ndemo failed: ${(e as Error).message}\n`); process.exit(1); });
