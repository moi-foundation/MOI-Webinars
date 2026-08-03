// Deploy the AgentBudget logic to MOI devnet and print its logic id.
// Put that id into .env as LOGIC_ID.
//
//   node deploy-budget.js
//
// Needs in .env: USER_MNEMONIC (a devnet account with KMOI at path
// m/44'/6174'/7020'/0/0 — set USER_DERIVATION_PATH to that).
// Compile the logic first if agentbudget.json is stale:
//   cd budget-logic && coco compile

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VoyageProvider, LogicFactory } from "js-moi-sdk";
import { USER, FUEL_LIMIT, requireEnv } from "./lib/env.js";
import { makeWallet, cappedFuel } from "./lib/chain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, "budget-logic", "agentbudget.json");

const main = async () => {
    requireEnv([["USER_MNEMONIC", USER.mnemonic]]);
    if (!fs.existsSync(MANIFEST_PATH)) {
        throw new Error(`Manifest missing: ${MANIFEST_PATH}\n  Compile it: cd budget-logic && coco compile`);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

    const provider = new VoyageProvider("devnet");
    const wallet = await makeWallet(provider, { mnemonic: USER.mnemonic, derivationPath: USER.derivationPath, subAccount: null });
    const address = String(await wallet.getIdentifier()).toLowerCase();
    console.log(`Deploying AgentBudget from ${address} to MOI devnet (path ${USER.derivationPath})`);

    // Cap deploy fuel to the primary's KMOI balance (throws clearly if unfunded).
    const { fuelLimit, kmoi, capped } = await cappedFuel(provider, address, FUEL_LIMIT * 20);
    if (capped) console.log(`  fuel: capped to KMOI balance ${kmoi}`);

    const factory = new LogicFactory(manifest, wallet);
    const ix = await factory.deploy(null).send({ fuel_limit: fuelLimit });   // no deploy endpoint → default deploy
    console.log(`Submitted tx ${ix.hash}; waiting for result…`);
    const { logic_id, error } = await ix.result();
    if (error) throw new Error(`deploy reverted: ${error}`);
    if (!logic_id) throw new Error("deploy returned no logic_id — check the receipt");

    console.log(`\n✓ AgentBudget deployed.`);
    console.log(`  logic id: ${logic_id}`);
    console.log(`\nAdd this line to .env (replace any existing LOGIC_ID):`);
    console.log(`  LOGIC_ID=${logic_id}`);
};

main().catch((err) => { console.error(err?.message ?? err); process.exit(1); });
