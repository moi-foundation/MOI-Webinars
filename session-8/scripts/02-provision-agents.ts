// Inherit the two agent sub-accounts under AgentBudget, and set the buyer's cap.
//
//   pnpm setup:agents
//
// This is the context-inheritance step. ONE AccountInherit tx per agent: it derives the
// sub-account, links its context to the logic (which is what gives it actor state), and seeds it
// with KMOI for fuel.
//
// HONESTY: sub-accounts SHARE the primary's key. This is not key isolation and not a permission
// sandbox. What it buys us is on-chain actor state under the logic — so RecordSpend can enforce
// the parent's cap.

import { AccountInherit, KMOI_ASSET_ID } from "js-moi-sdk";
import {
  config, primaryAccount, buyerAccount, sellerAccount, subAccountAddress, existsOnChain,
  waitReceipt, receiptError, setBudget, getBudget, INHERIT_FUEL_LIMIT, SEED_KMOI,
  banner, detail, ok, say, warn, summary, type Account,
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
    // (session-6 passed options to send() from JS, where they were silently ignored.)
    .build()
    .send({ fuel_limit: INHERIT_FUEL_LIMIT });
  detail("inherit ix", resp.hash);

  const failure = receiptError(await waitReceipt(primary, resp.hash));
  if (failure) throw new Error(`AccountInherit failed for ${label}: ${failure}`);
  ok(`${label} inherited under AgentBudget + seeded ${SEED_KMOI} KMOI`);
}

async function main(): Promise<void> {
  banner("SETUP", "02", "Context inheritance — provision the agent sub-accounts");
  const primary = await primaryAccount();
  detail("primary", primary.address);
  detail("logic", config.logicId);

  await inherit(primary, config.buyerIndex, "buyer");
  await inherit(primary, config.sellerIndex, "seller");

  // Only the buyer spends, so only the buyer needs a cap. The seller is inherited anyway, so it
  // has an on-chain identity and actor state of its own.
  banner("SETUP", "02b", "Set the buyer's on-chain spend cap");
  const buyer = await buyerAccount();
  const hash = await setBudget(buyer, config.buyerBudget);
  ok(`SetBudget(${config.buyerBudget}) — ix ${hash}`);

  const state = await getBudget(buyer);
  detail("budget", String(state.budget));
  detail("spent", String(state.spent));
  detail("remaining", String(state.remaining));

  const seller = await sellerAccount();
  say("SETUP", "sub-accounts share the primary's key — the guarantee is the chain enforcing the cap, not key isolation");

  summary("Agents provisioned", [
    ["buyer sub-account", buyer.address],
    ["seller sub-account", seller.address],
    ["buyer cap", `${state.budget} (enforced by AgentBudget)`],
    ["next", "pnpm setup:registry"],
  ]);
}

main().catch((e) => { console.error(`\n02-provision-agents failed: ${(e as Error).message}\n`); process.exit(1); });
