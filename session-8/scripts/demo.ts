// The on-stage driver for SESSION 8 (V2: authority).
//
//   pnpm demo                  the happy path
//   pnpm demo -- --tamper      repoint the seller's registry wallet -> identity check fails
//   pnpm demo -- --overspend   exhaust the on-chain cap -> the CHAIN refuses the spend
//
// Both sabotage modes restore themselves afterwards.

import {
  config, primaryAccount, buyerAccount, sellerAccount, registryClient, getProfile,
  updateAgentWallet, createAgentEntry, mockChain, isMock, warnMockOnce,
  getBudget, setBudget, recordSpend,
  addr0x, banner, detail, ok, fail, warn, say, summary, type Account,
} from "@demo/shared";
import { startFacilitator } from "@demo/facilitator";
import { startSeller } from "@demo/agent-seller";
import { runBuyer } from "@demo/agent-buyer";
import { PaymentRefused } from "@demo/agent-buyer/src/pay-fetch.js";

const args = new Set(process.argv.slice(2));
const TAMPER = args.has("--tamper");
const OVERSPEND = args.has("--overspend");
const QUESTION = "How do people justify holding power?";

/** A wrong-but-well-formed address to point the registry at during --tamper. */
const ATTACKER = "0x" + "de".repeat(28) + "00000000";

/** In mock mode there is no .env and no chain — do the work of scripts 00-01 in memory. */
async function bootstrapMock(buyer: Account, seller: Account): Promise<void> {
  banner("SETUP", "mock", "Bootstrapping the in-memory chain (equivalent of scripts 00-01)");
  mockChain.credit(config.assetId, buyer.address, 100_000n);
  detail("minted to buyer", `100000 ${config.assetSymbol}`);
  mockChain.setBudget(buyer.address, config.buyerBudget);
  detail("buyer cap", `${config.buyerBudget} (AgentBudget)`);

  const sellerId = await createAgentEntry(null, buyer.address, seller.address, {
    agentId: "mock-bookseller",
    name: "Bookseller",
    description: "Sells book summaries over x402.",
    url: config.sellerUrl,
    skill: { id: "sells-books", name: "Sells Books",
      description: "Summary and key ideas for a book.", tags: ["sells-books", "x402", "books"] },
  });
  const buyerId = await createAgentEntry(null, buyer.address, buyer.address, {
    agentId: "mock-reader",
    name: "Reader",
    description: "Buys book summaries over x402.",
    url: `http://localhost:${config.buyerPort}`,
    skill: { id: "buys-books", name: "Buys Books", description: "Pays for summaries.", tags: ["buys-books"] },
  });
  process.env.SELLER_AGENT_ID = sellerId;
  process.env.BUYER_AGENT_ID = buyerId;
  detail("seller agent", sellerId);
  detail("buyer agent", buyerId);
}

async function main(): Promise<void> {
  warnMockOnce();
  banner("DEMO", "0", "MOI Builders #7 — an agent finds another agent, and pays it");
  detail("mode", TAMPER ? "--tamper (identity attack)"
    : OVERSPEND ? "--overspend (budget cap)" : "happy path");
  detail("asset", config.assetId);
  detail("price", `${config.price} ${config.assetSymbol}`);

  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  if (isMock()) await bootstrapMock(buyer, seller);

  banner("DEMO", "1", "The two agents, on chain");
  const reg = await registryClient(buyer, false).catch(() => null);
  for (const [label, id] of [["seller", config.sellerAgentId], ["buyer", config.buyerAgentId]] as const) {
    if (!id) { warn(`${label}: not registered — run pnpm setup:registry`); continue; }
    const p = await getProfile(reg, id);
    if (!p) { warn(`${label}: ${id} not found on chain`); continue; }
    detail(`${label} agent`, `${p.agent_id}  [${p.status}]`);
    detail(`${label} wallet`, addr0x(p.agent_wallet));
  }

  try {
    const b = await getBudget(buyer);
    detail("buyer budget", `${b.spent}/${b.budget} spent — ${b.remaining} remaining (chain-enforced)`);
  } catch { warn("buyer has no on-chain budget — run pnpm setup:agents"); }

  let restoreWallet = false;
  let restoreBudget: bigint | null = null;
  if (TAMPER) {
    if (!config.sellerAgentId) throw new Error("--tamper needs a registered seller");
    banner("DEMO", "1b", "TAMPER — repointing the seller's registry wallet at an attacker");
    await updateAgentWallet(reg, config.sellerAgentId, ATTACKER);
    restoreWallet = true;
    fail(`registry agent_wallet for ${config.sellerAgentId} is now ${ATTACKER}`);
    say("DEMO", "the seller still asks to be paid at its REAL address — watch the buyer notice");
  }

  if (OVERSPEND) {
    banner("DEMO", "1b", "OVERSPEND — exhaust the buyer's on-chain cap, then try to buy");
    const before = await getBudget(buyer);
    restoreBudget = before.budget;
    // A cap merely EQUAL to the price would still allow one buy, so spend the remainder for real
    // via RecordSpend rather than faking the state.
    await setBudget(buyer, before.spent + config.price);
    const room = await getBudget(buyer);
    if (room.remaining > 0n) {
      const used = await recordSpend(buyer, room.remaining, "demo: exhausting the cap");
      detail("pre-spent", `${room.remaining} (ix ${used.hash})`);
    }
    const now = await getBudget(buyer);
    fail(`cap is now ${now.budget}, ${now.spent} spent — ${now.remaining} remaining`);
    say("DEMO", "the next RecordSpend must REVERT on chain. The cap is enforced, not advisory.");
  }

  const facilitator = await startFacilitator();
  const sellerSvc = await startSeller();

  try {
    const result = await runBuyer({ fallbackUrl: sellerSvc.url, question: QUESTION });
    summary(isMock() ? "Payment complete (MOCK — no funds moved)" : "Payment complete", [
      ["book", result.bookId],
      ["buyer's transfer", result.txHash ?? "(none)"],
      ["facilitator confirmed", result.receiptTx ?? "(none)"],
      ["price", `${result.price} ${config.assetSymbol}`],
      ["buyer", buyer.address],
      ["seller", seller.address],
    ]);
    if (TAMPER || OVERSPEND) {
      fail("EXPECTED A REFUSAL BUT THE PURCHASE SUCCEEDED — the guard did not fire.");
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof PaymentRefused && (TAMPER || OVERSPEND)) {
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
    await facilitator.close();
    if (restoreWallet && config.sellerAgentId) {
      await updateAgentWallet(await registryClient(buyer, false), config.sellerAgentId, seller.address);
      ok(`restored the seller's registry wallet to ${seller.address}`);
    }
    if (restoreBudget !== null) {
      await setBudget(buyer, restoreBudget);
      ok(`restored the buyer's cap to ${restoreBudget}`);
    }
  }
}

main().catch((e) => { console.error(`\ndemo failed: ${(e as Error).message}\n`); process.exit(1); });
