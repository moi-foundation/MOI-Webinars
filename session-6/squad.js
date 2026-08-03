// Webinar demo: a squad of REAL AI agents, each with its own on-chain identity
// via MOI context inheritance, using the AgentBudget logic.
//
// Each agent is Claude (Opus 4.8) bound to its own inherited sub-account under
// the AgentBudget logic. Its budget and spend live in ITS actor state under
// that logic — so SetBudget / RecordSpend can only be called by an inherited
// account, and the spend cap is enforced ON CHAIN. `report` reads each agent's
// ledger straight from the logic. That's context inheritance doing real work:
// per-agent state that only inheritance can allocate, with an enforced budget.
//
// Setup: deploy the logic first (node deploy-budget.js), put the
// printed id in .env as LOGIC_ID.
//
// Commands:
//   node squad.js provision <name> <budget>       inherit a sub-account + SetBudget
//   node squad.js run <name> "<task>" [--dry-run]  a REAL Claude agent acts (needs ANTHROPIC_API_KEY)
//   node squad.js spend <name> <amount> [memo]     scripted RecordSpend, no API key
//   node squad.js report                           per-agent budget/spent/remaining (on-chain)
//   node squad.js roster                           list provisioned agents (offline)
//   node squad.js selftest                         offline checks (no chain, no API)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { AccountInherit, getLogicDriver, KMOI_ASSET_ID, VoyageProvider } from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import { LOGIC_ID, USER, FUEL_LIMIT, requireEnv } from "./lib/env.js";
import {
    makeWallet, getContextInfoOrNull, contextMatchesLogic,
    getSubAccountCountOrZero, cappedFuel,
} from "./lib/chain.js";
import { toBigInt, ZERO_HASH, fmtHash } from "./lib/util.js";

// Hosted MOI devnet — keyless. (For a local node, swap this for
// makeProvider() from lib/chain and set MOI_NODE_URL.) The devnet funded
// account lives at derivation path m/44'/6174'/7020'/0/0 — set
// USER_DERIVATION_PATH to that in .env.
const makeDevnetProvider = () => new VoyageProvider("devnet");

const INHERIT_FUEL_LIMIT = FUEL_LIMIT * 4;
const SEED_KMOI = BigInt(FUEL_LIMIT * 3);   // gas for the agent's future logic calls
const MAX_BUDGET = 1_000_000n;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// LOCAL name→index map, so you can type "trader" instead of "1". The CHAIN
// needs no registry — addresses are derived, links and budgets are read from
// the logic. This file is a UX convenience, not on-chain state.
const REGISTRY_PATH = path.join(__dirname, ".squad.json");

// ---------- address math (the whole point) ----------

// sub-account address = primary's first 28 bytes + 4-byte big-endian index.
export const subAccountAddress = (primary, index) =>
    primary.slice(0, 58) + Number(index).toString(16).padStart(8, "0");
export const subAccountIndex = (address) => parseInt(address.slice(-8), 16);

// ---------- local registry ----------

export const loadRegistry = (file = REGISTRY_PATH) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { agents: {} }; }
};
export const saveRegistry = (reg, file = REGISTRY_PATH) =>
    fs.writeFileSync(file, JSON.stringify(reg, null, 2) + "\n");

// First index not already used on chain or in the registry.
export const nextFreeIndex = (onChainCount, reg) => {
    const used = new Set(Object.values(reg.agents).map((a) => a.index));
    let idx = onChainCount + 1;
    while (used.has(idx)) idx += 1;
    return idx;
};

// ---------- chain helpers ----------

let ctxPromise;
const chainCtx = () => (ctxPromise ??= (async () => {
    const provider = makeDevnetProvider();
    const base = { mnemonic: USER.mnemonic, derivationPath: USER.derivationPath };
    const primaryWallet = await makeWallet(provider, { ...base, subAccount: null });
    const primaryAddress = String(await primaryWallet.getIdentifier()).toLowerCase();
    if (USER.id && USER.id.toLowerCase() !== primaryAddress) {
        throw new Error(`Primary resolves to ${primaryAddress} but USER_ID is ${USER.id}`);
    }
    return { provider, base, primaryWallet, primaryAddress };
})());

const kmoiBalance = async (provider, address) => {
    try { return toBigInt(String(await provider.getBalance(address, KMOI_ASSET_ID))); }
    catch { return 0n; }
};

// Poll for a receipt; return an error string or null (same convention as the CLIs).
const waitReceipt = async (provider, hash, timeoutMs = 120000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const tx = await provider.getInteractionByHash(hash);
            if (tx?.ts_hash && tx.ts_hash !== ZERO_HASH) {
                const ops = (tx.receipt ?? tx)?.ix_operations ?? (tx.receipt ?? tx)?.op_results ?? [];
                const err = ops.map((o) => o?.error ?? o?.data?.error).find((e) => e && e !== "0x");
                return err ?? null;
            }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 2000));
    }
    return "receipt-timeout";
};

const driverFor = (wallet) => getLogicDriver(LOGIC_ID, wallet);
const logicParticipants = () => [{ id: LOGIC_ID, lock_type: LockType.NO_LOCK }];

// Call a state-changing endpoint (SetBudget / RecordSpend) from `address`.
// .result() waits for the tx and decodes any revert reason.
const invokeLogic = async (provider, driver, address, routineFn) => {
    const { fuelLimit } = await cappedFuel(provider, address, FUEL_LIMIT);
    const resp = await routineFn(driver.routines).send({
        fuel_limit: fuelLimit,
        participants: logicParticipants(),
    });
    const { error } = await resp.result();
    if (error) throw new Error(`on-chain call failed: ${error.error ?? JSON.stringify(error)}`);
    return resp.hash;
};

// Read the agent's own ledger via the static GetBudget endpoint. `driver` must
// be built with THAT agent's wallet (it reads Sender state). Returns BigInts.
const readLedger = async (driver) => {
    const resp = await driver.routines.GetBudget().call();
    const { output, error } = await resp.result();
    if (error) throw new Error(`GetBudget failed: ${error.error ?? JSON.stringify(error)}`);
    const o = output ?? {};
    return {
        budget: toBigInt(String(o.budget ?? 0)),
        spent: toBigInt(String(o.spent ?? 0)),
        remaining: toBigInt(String(o.remaining ?? 0)),
    };
};

// ---------- commands ----------

const provision = async (name, budgetRaw) => {
    if (!name) throw new Error("usage: provision <name> <budget>");
    if (!/^\d+$/.test(String(budgetRaw ?? ""))) throw new Error("budget must be a positive integer");
    const budget = BigInt(budgetRaw);
    if (budget < 1n) throw new Error("budget must be at least 1");
    if (budget > MAX_BUDGET) throw new Error(`budget capped at ${MAX_BUDGET} for this demo`);

    const reg = loadRegistry();
    if (reg.agents[name]) throw new Error(`agent "${name}" already provisioned at index ${reg.agents[name].index}`);

    const { provider, base, primaryWallet, primaryAddress } = await chainCtx();
    const count = await getSubAccountCountOrZero(provider, primaryAddress);
    const idx = nextFreeIndex(count, reg);
    const subAddr = subAccountAddress(primaryAddress, idx);

    console.log(`Provisioning agent "${name}"`);
    console.log(`  primary:   ${primaryAddress}`);
    console.log(`  sub-acct:  ${subAddr}  (index ${idx})`);
    console.log(`  budget:    ${budget}   (enforced by the logic)`);
    console.log(`  → AccountInherit: create + link to logic + seed ${SEED_KMOI} KMOI for gas…`);

    const inheritResp = await new AccountInherit(primaryWallet)
        .target(LOGIC_ID)
        .index(idx)
        .value(KMOI_ASSET_ID, subAddr, SEED_KMOI)
        .send({ fuel_limit: INHERIT_FUEL_LIMIT });
    let err = await waitReceipt(provider, inheritResp.hash);
    if (err) throw new Error(`AccountInherit failed on chain: ${err}`);

    const linkCtx = await getContextInfoOrNull(provider, subAddr);
    if (!contextMatchesLogic(linkCtx, LOGIC_ID)) {
        throw new Error(`inherit landed but context not linked to the logic — check tx ${inheritResp.hash}`);
    }
    console.log(`  ✓ inherited + linked. Now writing budget into its actor state (SetBudget)…`);

    const subWallet = await makeWallet(provider, { ...base, subAccount: idx });
    const driver = await driverFor(subWallet);
    const setHash = await invokeLogic(provider, driver, subAddr, (r) => r.SetBudget(budget));

    reg.agents[name] = { index: idx, address: subAddr, budget: budget.toString() };
    saveRegistry(reg);
    console.log(`✓ "${name}" ready — inherit tx ${inheritResp.hash}, SetBudget tx ${setHash}.`);
};

const loadAgent = async (name) => {
    const reg = loadRegistry();
    const entry = reg.agents[name];
    if (!entry) throw new Error(`agent "${name}" is not provisioned — run: node squad.js provision ${name} <budget>`);
    const { provider, base } = await chainCtx();
    const wallet = await makeWallet(provider, { ...base, subAccount: entry.index });
    const ctx = await getContextInfoOrNull(provider, entry.address);
    if (!contextMatchesLogic(ctx, LOGIC_ID)) {
        throw new Error(`agent "${name}" (${entry.address}) is not linked to the logic — re-provision it`);
    }
    const driver = await driverFor(wallet);
    return { provider, entry, wallet, driver };
};

// Scripted spend — the no-Anthropic version of `run`. Same on-chain effect
// (RecordSpend against the agent's enforced budget), but YOU pick the amount.
const spend = async (name, amountRaw, memo) => {
    if (!name || amountRaw === undefined) throw new Error('usage: spend <name> <amount> [memo]');
    if (!/^\d+$/.test(String(amountRaw))) throw new Error("amount must be a positive integer");
    const amount = BigInt(amountRaw);
    if (amount < 1n) throw new Error("amount must be >= 1");
    const { provider, entry, driver } = await loadAgent(name);
    console.log(`${name} (${entry.address}) RecordSpend ${amount} — "${memo ?? "work"}"`);
    const hash = await invokeLogic(provider, driver, entry.address, (r) => r.RecordSpend(amount, memo ?? "work"));
    const led = await readLedger(driver);
    console.log(`✓ tx ${hash} — spent ${led.spent}/${led.budget}, ${led.remaining} remaining`);
};

const buildAgentTools = (provider, self, dryRun) => {
    const checkBudget = betaTool({
        name: "check_budget",
        description: "Return your own on-chain budget, amount spent, and remaining allowance.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        run: async () => {
            const led = await readLedger(self.driver);
            return JSON.stringify({
                address: self.entry.address,
                budget: led.budget.toString(),
                spent: led.spent.toString(),
                remaining: led.remaining.toString(),
            });
        },
    });
    const recordSpend = betaTool({
        name: "record_spend",
        description:
            "Record a spend against YOUR OWN on-chain budget (RecordSpend on the logic). " +
            "The chain enforces the cap — a spend beyond your remaining budget will revert. " +
            "Use only when the task calls for it. Returns the tx hash and your new ledger.",
        inputSchema: {
            type: "object",
            properties: {
                amount: { type: "integer", description: "units to spend (>=1)" },
                memo: { type: "string", description: "short reason for the spend" },
            },
            required: ["amount"],
            additionalProperties: false,
        },
        run: async ({ amount, memo }) => {
            const amt = BigInt(amount);
            if (amt < 1n) return JSON.stringify({ error: "amount must be >= 1" });
            if (dryRun) return JSON.stringify({ dry_run: true, would_spend: amount, memo: memo ?? null });
            try {
                const hash = await invokeLogic(provider, self.driver, self.entry.address, (r) => r.RecordSpend(amt, memo ?? "work"));
                const led = await readLedger(self.driver);
                return JSON.stringify({ tx: hash, spent: led.spent.toString(), remaining: led.remaining.toString(), memo: memo ?? null });
            } catch (e) {
                return JSON.stringify({ error: e.message });
            }
        },
    });
    return [checkBudget, recordSpend];
};

const run = async (name, task, dryRun) => {
    if (!name || !task) throw new Error('usage: run <name> "<task>"');
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY (put it in .env or export it)");
    const { provider, entry, wallet, driver } = await loadAgent(name);
    const self = { name, entry, wallet, driver };

    const system = `You are "${name}", an autonomous AI agent in a live webinar demo about MOI context inheritance.

You have your OWN on-chain identity: an inherited sub-account at ${entry.address}, derived from a primary account and linked to the AgentBudget logic. Your budget and spend live in YOUR actor state under that logic — nowhere else could hold them, which is why your account had to be inherited.

Tools:
- web_search: actually search the web to do the task (real results).
- check_budget: see your own budget, spent, and remaining (read from chain).
- record_spend: record a spend against your budget. The logic enforces the cap — spending past your remaining budget reverts, so check first if unsure.

Do the real work first (search the web if the task calls for it), then record a sensible spend for the work you did (its memo should describe the work). Only spend when the task calls for it, and stay within budget.${dryRun ? "\n\nDRY RUN: spends are simulated, not sent." : ""}

Be concise — this is on a projector. One sentence on what you're doing, then do it.`;

    const client = new Anthropic();
    console.log(`▶ ${name} (${entry.address})${dryRun ? "  [dry-run]" : ""}`);
    console.log(`  task: ${task}\n`);
    const tools = [
        // Basic web search (no code-execution container — plays nicely with
        // client tools in the runner; the _20260209 dynamic-filter variant
        // needs a container_id we'd have to thread through).
        { type: "web_search_20250305", name: "web_search", max_uses: 3 },
        ...buildAgentTools(provider, self, dryRun),
    ];
    const finalMessage = await client.beta.messages.toolRunner({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        system,
        tools,
        messages: [{ role: "user", content: task }],
    });
    if (finalMessage.stop_reason === "pause_turn") {
        console.log(`${name}> (paused mid-search — re-run the command to continue)\n`);
        return;
    }
    const text = finalMessage.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    console.log(`${name}> ${text}\n`);
};

const report = async () => {
    const reg = loadRegistry();
    const names = Object.keys(reg.agents);
    if (names.length === 0) { console.log("No agents provisioned yet. Try: node squad.js provision trader 500"); return; }
    const { provider, base, primaryAddress } = await chainCtx();
    console.log(`Squad report — primary ${primaryAddress}\n`);
    console.log(`  ${"agent".padEnd(12)} ${"idx".padEnd(4)} ${"budget".padEnd(10)} ${"spent".padEnd(10)} ${"remaining".padEnd(10)} linked`);
    for (const name of names) {
        const a = reg.agents[name];
        const ctx = await getContextInfoOrNull(provider, a.address);
        const linked = contextMatchesLogic(ctx, LOGIC_ID) ? "yes" : "NO";
        let led = { budget: 0n, spent: 0n, remaining: 0n };
        // GetBudget reads Sender state — build each agent's own driver.
        try {
            const w = await makeWallet(provider, { ...base, subAccount: a.index });
            led = await readLedger(await driverFor(w));
        } catch { /* leave zeros */ }
        console.log(`  ${name.padEnd(12)} ${String(a.index).padEnd(4)} ${String(led.budget).padEnd(10)} ${String(led.spent).padEnd(10)} ${String(led.remaining).padEnd(10)} ${linked}`);
    }
    console.log(`\n  (budget/spent/remaining read live from the AgentBudget logic)`);
};

const roster = () => {
    const reg = loadRegistry();
    const names = Object.keys(reg.agents);
    if (names.length === 0) { console.log("No agents yet."); return; }
    console.log("Provisioned agents (local name→index map):");
    for (const name of names) console.log(`  ${name}  → index ${reg.agents[name].index}  ${reg.agents[name].address}`);
};

// Wipe the LOCAL name→index map so the next provision starts a fresh squad.
// On-chain sub-accounts remain (they can't be un-inherited); new agents just
// get higher indices. Handy between rehearsals — no redeploy needed.
const reset = () => {
    try { fs.unlinkSync(REGISTRY_PATH); console.log("Squad reset — local registry cleared."); }
    catch { console.log("Nothing to reset (no registry)."); }
    console.log("On-chain accounts from before still exist; new agents get fresh indices.");
};

// ---------- offline self-test (no chain, no API) ----------

const selftest = () => {
    let pass = 0, fail = 0;
    const check = (label, cond) => { if (cond) { pass += 1; } else { fail += 1; console.log(`  ✗ ${label}`); } };

    const primary = "0x" + "ab".repeat(28) + "00000000"; // 66 chars
    check("primary is 66 chars", primary.length === 66);
    for (const idx of [1, 2, 15, 255, 4096]) {
        const addr = subAccountAddress(primary, idx);
        check(`addr ${idx} is 66 chars`, addr.length === 66);
        check(`addr ${idx} shares 28-byte prefix`, addr.slice(0, 58) === primary.slice(0, 58));
        check(`index round-trips for ${idx}`, subAccountIndex(addr) === idx);
    }

    const reg = { agents: { trader: { index: 1 }, scraper: { index: 3 } } };
    check("nextFreeIndex skips used (count 0)", nextFreeIndex(0, reg) === 2);
    check("nextFreeIndex respects on-chain count", nextFreeIndex(3, reg) === 4);
    check("nextFreeIndex on empty registry", nextFreeIndex(0, { agents: {} }) === 1);

    const tmp = path.join(__dirname, ".squad.selftest.json");
    try {
        saveRegistry({ agents: { x: { index: 7 } } }, tmp);
        check("registry round-trips", loadRegistry(tmp).agents.x.index === 7);
    } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
    check("loadRegistry on missing file returns empty", loadRegistry(path.join(__dirname, ".nope.json")).agents && true);

    console.log(`\nselftest: ${pass} passed, ${fail} failed`);
    if (fail) process.exit(1);
};

// ---------- dispatch ----------

const main = async () => {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes("--dry-run");
    const args = argv.filter((a) => a !== "--dry-run");
    const cmd = args[0];

    if (cmd !== "selftest" && cmd !== "roster" && cmd !== "reset") {
        requireEnv([["LOGIC_ID", LOGIC_ID], ["USER_MNEMONIC", USER.mnemonic]]);
    }
    switch (cmd) {
        case "provision": return provision(args[1], args[2]);
        case "run": return run(args[1], args[2], dryRun);
        case "spend": return spend(args[1], args[2], args.slice(3).join(" ") || undefined);
        case "report": return report();
        case "roster": return roster();
        case "reset": return reset();
        case "selftest": return selftest();
        default:
            console.log("commands:");
            console.log("  provision <name> <budget>           inherit a sub-account + SetBudget");
            console.log("  run <name> \"<task>\" [--dry-run]      REAL Claude agent: web_search + spend (needs ANTHROPIC_API_KEY)");
            console.log("  spend <name> <amount> [memo]        scripted RecordSpend, no API key");
            console.log("  report                              per-agent budget/spent/remaining (on-chain)");
            console.log("  roster                              list provisioned agents (offline)");
            console.log("  reset                               wipe local registry, fresh squad (offline)");
            console.log("  selftest                            offline checks (no chain, no API)");
    }
};

main().catch((err) => { console.error(err?.message ?? err); process.exit(1); });
