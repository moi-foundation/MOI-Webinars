// Talk to the buyer agent in plain language.
//
//   npm run ask                        interactive — type questions, one purchase each
//   npm run ask -- "will btc crash?"   one-shot
//
// This is the demo beat that makes "agentic" concrete: you state a want, and the agent goes and
// finds who sells the answer, checks who they are, pays them, and comes back. You never name a
// seller, a price or an address.
//
// EVERY question spends real money. The seller decides what to charge each time, so the same
// question can cost more the second time you ask it. The balance line before and after is the
// honest part: watch it go down.

import { createInterface } from "node:readline/promises";
import { config, buyerAccount, banner, detail, say, ok, fail, warn, summary, type Account } from "@demo/shared";
import { getAssetDriver } from "js-moi-sdk";
import { startSeller } from "@demo/agent-seller";
import { runBuyer } from "@demo/agent-buyer";
import { PaymentRefused } from "@demo/agent-buyer/src/pay.js";

/** Own balance only — MAS0 rejects reads of another account ("invalid access to actor"). */
async function myBalance(account: Account): Promise<bigint> {
  try {
    const driver: any = await getAssetDriver(config.assetId, account.wallet);
    const { output, error } = await driver.routines.BalanceOf(account.address);
    return error ? -1n : BigInt(output?.balance ?? 0);
  } catch { return -1n; }
}

async function main(): Promise<void> {
  const oneShot = process.argv.slice(2).join(" ").trim();

  banner("DEMO", "ask", "Tell the agent what you want");
  if (!config.assetIdOrNull) throw new Error("SETTLEMENT_ASSET_ID is not set — run `npm run setup:asset` first.");
  if (!config.sellerAgentId) throw new Error("agents are not registered — run `npm run setup:registry` first.");

  const buyer = await buyerAccount();
  detail("your wallet", buyer.address);
  detail("balance", `${await myBalance(buyer)} ${config.assetSymbol}`);
  detail("prices", `set by the seller per request — see its catalog`);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "keyword fallback (no GROQ_API_KEY)");

  if (!config.groqKey) {
    warn("without GROQ_API_KEY the agent matches keywords, so free-text questions often");
    warn("land on the wrong market. Set the key before demoing this one.");
  }

  const seller = await startSeller();
  const rl = oneShot ? null : createInterface({ input: process.stdin, output: process.stdout });

  const askOnce = async (question: string): Promise<void> => {
    try {
      const result = await runBuyer({ fallbackUrl: seller.url, question });
      summary("Bought", [
        ["market", result.marketId],
        ["paid", `${result.price} ${config.assetSymbol}`],
        ["transfer", result.txHash ?? "(none)"],
        ["balance now", `${await myBalance(buyer)} ${config.assetSymbol}`],
      ]);
    } catch (err) {
      // A refusal is the agent working, not the demo breaking — keep the loop alive.
      if (err instanceof PaymentRefused) fail(`agent refused: ${(err as Error).message}`);
      else fail(`failed: ${(err as Error).message}`);
    }
  };

  try {
    if (oneShot) {
      await askOnce(oneShot);
    } else if (!process.stdin.isTTY) {
      throw new Error('no terminal to read from — pass the question: npm run ask -- "your question"');
    } else {
      say("DEMO", "ask for anything — blank line or 'exit' to stop. Each answer costs real money.");
      for (;;) {
        const question = (await rl!.question("\nwhat do you want? ")).trim();
        if (!question || question.toLowerCase() === "exit") break;
        await askOnce(question);
      }
      ok("done");
    }
  } finally {
    rl?.close();
    await seller.close();
  }
}

main().catch((e) => { console.error(`\nask failed: ${(e as Error).message}\n`); process.exit(1); });
