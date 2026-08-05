// Deploy the AgentBudget logic. Path proven by session-6/deploy-budget.js.
//
//   pnpm setup:budget

import fs from "node:fs";
import { resolve } from "node:path";
import { LogicFactory } from "js-moi-sdk";
import { ROOT, config, primaryAccount, FUEL_LIMIT, banner, detail, ok, say, summary } from "@demo/shared";
import { updateEnv } from "./env-file.js";

const MANIFEST = resolve(ROOT, "budget-logic", "agentbudget.json");

async function main(): Promise<void> {
  banner("SETUP", "01", "Deploy AgentBudget (the on-chain spend cap)");
  if (config.logicIdOrNull) {
    say("SETUP", `reusing existing LOGIC_ID ${config.logicIdOrNull}`);
    summary("Budget logic ready", [["LOGIC_ID", config.logicIdOrNull], ["next", "pnpm setup:agents"]]);
    return;
  }
  if (!fs.existsSync(MANIFEST)) throw new Error(`manifest missing: ${MANIFEST}`);

  const primary = await primaryAccount();
  detail("deployer", primary.address);

  const factory = new LogicFactory(JSON.parse(fs.readFileSync(MANIFEST, "utf8")), primary.wallet);
  const ix = await factory.deploy().send({ fuel_limit: FUEL_LIMIT * 20 });
  detail("ix hash", ix.hash);
  const { logic_id, error } = (await ix.result()) as unknown as { logic_id?: string; error?: unknown };
  if (error) throw new Error(`deploy reverted: ${JSON.stringify(error)}`);
  if (!logic_id) throw new Error("deploy returned no logic_id");

  ok(`AgentBudget deployed`);
  updateEnv({ LOGIC_ID: logic_id });
  summary("Budget logic ready", [["LOGIC_ID", logic_id], ["next", "pnpm setup:agents"]]);
}

main().catch((e) => { console.error(`\n01-deploy-budget failed: ${(e as Error).message}\n`); process.exit(1); });
