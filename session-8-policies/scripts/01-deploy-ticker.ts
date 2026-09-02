// Deploy the Ticker logic.
//
//   npm run setup:logic
//
// Ticker keeps a counter in ACTOR STATE, so the counter it holds for an account physically lives
// on that account. That is the whole reason access control exists here: a logic routinely writes
// to storage it does not own.

import fs from "node:fs";
import { resolve } from "node:path";
import { LogicFactory, RoutineOption } from "js-moi-sdk";
import { ROOT, config, ownerAccount, banner, detail, ok, say, summary } from "@demo/shared";
import { updateEnv } from "./env-file.js";

const MANIFEST = resolve(ROOT, "ticker-logic", "ticker.json");

/** KMOI handed to the logic account so it can pay for its own creation-time storage. */
const STORAGE_FUND = Number(process.env.STORAGE_FUND ?? "6000");

async function main(): Promise<void> {
  banner("SETUP", "01", "Deploy Ticker (a counter that lives on YOUR account)");

  if (config.logicIdOrNull) {
    say("SETUP", `reusing existing LOGIC_ID ${config.logicIdOrNull}`);
    summary("Ticker ready", [["LOGIC_ID", config.logicIdOrNull], ["next", "npm run demo"]]);
    return;
  }
  if (!fs.existsSync(MANIFEST)) throw new Error(`manifest missing: ${MANIFEST} — run \`coco compile\` in ticker-logic/`);

  const owner = await ownerAccount();
  detail("deployer", owner.address);

  const factory = new LogicFactory(JSON.parse(fs.readFileSync(MANIFEST, "utf8")), owner.wallet);
  // A logic account pays for its OWN storage at creation, so the deploy bundles a KMOI transfer
  // to fund the not-yet-existing account. The SDK default for that is 1,000,000 — far more than a
  // devnet wallet holds, and the whole interaction reverts on affordability rather than on
  // anything being wrong with the logic. Ticker's manifest is ~2.4 KB and storage bills at 1 anu
  // per byte, so a few thousand is ample.
  //
  // No fuel_limit either: send() estimates it, and a hard-coded limit must be affordable up front.
  const ix = await factory
    .deploy(undefined, new RoutineOption({ storageFund: STORAGE_FUND }))
    .send();
  detail("ix hash", ix.hash);

  const { logic_id, error } = (await ix.result()) as unknown as { logic_id?: string; error?: unknown };
  if (error) throw new Error(`deploy reverted: ${JSON.stringify(error)}`);
  if (!logic_id) throw new Error("deploy returned no logic_id");

  ok("Ticker deployed");
  updateEnv({ LOGIC_ID: logic_id });
  summary("Ticker ready", [["LOGIC_ID", logic_id], ["next", "npm run demo"]]);
}

main().catch((e) => { console.error(`\n01-deploy-ticker failed: ${(e as Error).message}\n`); process.exit(1); });
