// Inherit the buyer sub-account under AgentBudget and set its on-chain budget.
//
//   npm run setup:agents
//
// THE context-inheritance step, path proven live in session 6. One AccountInherit transaction:
// derives the sub-account, links its context to the logic (which is what gives it actor state),
// and seeds it with KMOI for fuel. Then SetBudget writes its allowance into that actor state.
//
// HONESTY: sub-accounts share the primary's key. This is not key isolation and not a sandbox.
// What it buys is on-chain actor state under the logic — so RecordSpend can enforce the budget
// inside the contract, where the agent's code cannot reach it.

import { AccountInherit, KMOI_ASSET_ID } from "js-moi-sdk";
import {
  config, primaryAccount, buyerAccount, subAccountAddress, existsOnChain,
  waitReceipt, receiptError, setBudget, getBudget, INHERIT_FUEL_LIMIT, SEED_KMOI,
  banner, detail, ok, say, summary, type Account,
} from "@demo/shared";

async function inherit(primary: Account, index: number, label: string): Promise<void> {
  const subAddr = subAccountAddress(primary.address, index);
  detail(`${label} sub-account`, `#${index}  ${subAddr}`);

  if (await existsOnChain(primary, subAddr)) {
    ok(`${label} sub-account already provisioned`);
    return;
  }

  const resp = await new AccountInherit(primary.wallet)
    .target(config.logicId as `0x${string}`)
    .index(index)
    .value(KMOI_ASSET_ID, subAddr, SEED_KMOI)
    // AccountInherit.send() takes no options — go through build() to set fuel explicitly.
    .build()
    .send({ fuel_limit: INHERIT_FUEL_LIMIT });
  detail("inherit ix", resp.hash);

  const failure = receiptError(await waitReceipt(primary, resp.hash));
  if (failure) throw new Error(`AccountInherit failed for ${label}: ${failure}`);
  ok(`${label} inherited under AgentBudget + seeded ${SEED_KMOI} KMOI`);
}

async function main(): Promise<void> {
  if (!config.logicIdOrNull) throw new Error("LOGIC_ID unset — run `npm run setup:budget` first");
  const primary = await primaryAccount();
  banner("SETUP", "02", "Inherit the buyer under AgentBudget, then set its budget");
  detail("primary (owner)", primary.address);
  detail("logic", config.logicId);

  await inherit(primary, config.buyerIndex, "buyer");

  const buyer = await buyerAccount();
  const before = await getBudget(buyer).catch(() => null);
  if (before && before.budget > 0n) {
    ok(`budget already set: ${before.budget} (spent ${before.spent}, remaining ${before.remaining})`);
  } else {
    const hash = await setBudget(buyer, config.buyerBudget);
    ok(`SetBudget(${config.buyerBudget}) — ix ${hash}`);
  }

  const state = await getBudget(buyer);
  say("SETUP", "the ledger is readable from chain — this is what the demo shows shrinking");
  summary("Buyer provisioned under AgentBudget", [
    ["budget", String(state.budget)],
    ["spent", String(state.spent)],
    ["remaining", String(state.remaining)],
    ["next", "npm run demo"],
  ]);
}

main().catch((e) => { console.error(`\n02-provision-agents failed: ${(e as Error).message}\n`); process.exit(1); });
