// Webinar demo: an AI agent with its own on-chain identity via MOI context
// inheritance. The agent's tools are deliberately minimal — discover who it
// is, inspect any account's context, and provision its inherited sub-account
// under the target logic. No trading, no arbitrary transfers.
//
// Run:  node agent.js
// Needs in .env (repo root): LOGIC_ID, MOI_NODE_URL,
//   USER_MNEMONIC (+ optional USER_ID), ANTHROPIC_API_KEY.

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { AccountInherit, KMOI_ASSET_ID } from "js-moi-sdk";
import { LOGIC_ID, USER, FUEL_LIMIT, requireEnv } from "./lib/env.js";
import {
    makeProvider, makeWallet, getContextInfoOrNull, contextMatchesLogic,
    getSubAccountCountOrZero, findInheritedAccounts, listHeldAssets,
} from "./lib/chain.js";

requireEnv([
    ["LOGIC_ID", LOGIC_ID],
    ["USER_MNEMONIC", USER.mnemonic],
]);
if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY (put it in .env or export it)");
}

const INHERIT_FUEL_LIMIT = FUEL_LIMIT * 4;
const MAX_SEED_KMOI = 100_000n;

// ---------- chain context (lazy, shared by all tools) ----------

let chainCtxPromise;
const chainCtx = () => (chainCtxPromise ??= (async () => {
    const provider = makeProvider();
    const base = { mnemonic: USER.mnemonic, derivationPath: USER.derivationPath };
    const primaryWallet = await makeWallet(provider, { ...base, subAccount: null });
    const primaryAddress = String(await primaryWallet.getIdentifier()).toLowerCase();
    if (USER.id && USER.id.toLowerCase() !== primaryAddress) {
        throw new Error(`Primary resolves to ${primaryAddress} but USER_ID is ${USER.id}`);
    }
    return { provider, base, primaryWallet, primaryAddress };
})());

// Sub-account address = primary's first 28 bytes + 4-byte big-endian index.
const subAccountAddress = (primary, index) =>
    primary.slice(0, 58) + Number(index).toString(16).padStart(8, "0");
const subAccountIndex = (address) => parseInt(address.slice(-8), 16);

const json = (value) =>
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);

// Same success convention as the CLIs: a receipt is not success — check
// status (0 = ok, 1 = failed) and per-op errors.
const receiptError = (receipt) => {
    if (!receipt) return "no receipt";
    const ops = receipt.ix_operations ?? receipt.op_results ?? [];
    const opErr = ops.map((o) => o?.error ?? o?.data?.error).find((e) => e && e !== "0x");
    if (receipt.status === 1 || ops.some((o) => o?.status === 1)) {
        return opErr ?? `receipt status=1 (fuel_used=${receipt.fuel_used})`;
    }
    return null;
};

// ---------- tools ----------

const whoami = betaTool({
    name: "whoami",
    description:
        "Discover the agent's on-chain identity from pure derivation: the primary " +
        "address, how many sub-accounts exist under it, and which of them are " +
        "inherited under the target logic (checked via getContextInfo). Call this " +
        "first, and again after provisioning to confirm the link.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
        const { provider, base, primaryAddress } = await chainCtx();
        const count = await getSubAccountCountOrZero(provider, primaryAddress);
        const inherited = await findInheritedAccounts(provider, base, primaryAddress);
        return json({
            logic_id: LOGIC_ID,
            primary_address: primaryAddress,
            sub_account_count: count,
            inherited_under_logic: inherited,
            derivation_rule:
                "sub-account address = primary's first 28 bytes + 4-byte big-endian index",
            provisioned: inherited.length > 0,
        });
    },
});

const inspectAccount = betaTool({
    name: "inspect_account",
    description:
        "Inspect any MOI account address: its raw context info (inherited_account, " +
        "storage_nodes), whether the context is linked to the target logic, the " +
        "sub-account index encoded in its last 4 bytes, and its asset balances.",
    inputSchema: {
        type: "object",
        properties: {
            address: {
                type: "string",
                description: "0x-prefixed 66-char account address",
            },
        },
        required: ["address"],
        additionalProperties: false,
    },
    run: async ({ address }) => {
        if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
            return json({ error: "address must be 0x + 64 hex chars (32 bytes)" });
        }
        const { provider, primaryAddress } = await chainCtx();
        const addr = address.toLowerCase();
        const ctx = await getContextInfoOrNull(provider, addr);
        const balances = await listHeldAssets(provider, addr);
        return json({
            address: addr,
            exists_on_chain: ctx !== null,
            context_info: ctx,
            linked_to_target_logic: contextMatchesLogic(ctx, LOGIC_ID),
            sub_account_index: subAccountIndex(addr),
            shares_prefix_with_my_primary: addr.slice(0, 58) === primaryAddress.slice(0, 58),
            balances,
        });
    },
});

const provisionSubAccount = betaTool({
    name: "provision_sub_account",
    description:
        "Create the agent's inherited sub-account under the target logic via a " +
        "single AccountInherit transaction signed by the primary: derives the " +
        "sub-account address, links its context to the logic, and seeds it with " +
        "KMOI in one atomic operation. Verifies the context link on chain before " +
        "reporting success. If a sub-account is already inherited and no explicit " +
        "index is given, reports the existing one instead of creating another.",
    inputSchema: {
        type: "object",
        properties: {
            index: {
                type: "integer",
                description: "Sub-account index to use. Omit to pick the next free index.",
            },
            seed_kmoi: {
                type: "integer",
                description: "KMOI to seed the new account with (default 1000, min 1).",
            },
        },
        additionalProperties: false,
    },
    run: async ({ index, seed_kmoi }) => {
        const { provider, base, primaryWallet, primaryAddress } = await chainCtx();
        const seed = BigInt(seed_kmoi ?? 1000);
        if (seed < 1n) return json({ error: "seed_kmoi must be at least 1 (the chain rejects zero-amount transfers)" });
        if (seed > MAX_SEED_KMOI) return json({ error: `seed_kmoi capped at ${MAX_SEED_KMOI} for this demo` });

        const existing = await findInheritedAccounts(provider, base, primaryAddress);
        if (existing.length > 0 && index === undefined) {
            return json({
                already_provisioned: existing,
                note: "Pass an explicit index to inherit an additional sub-account.",
            });
        }

        const count = await getSubAccountCountOrZero(provider, primaryAddress);
        const idx = index ?? count + 1;
        if (idx < 1) return json({ error: "index must be >= 1" });
        const subAddr = subAccountAddress(primaryAddress, idx);

        const response = await new AccountInherit(primaryWallet)
            .target(LOGIC_ID)
            .index(idx)
            .value(KMOI_ASSET_ID, subAddr, seed)
            .send({ fuel_limit: INHERIT_FUEL_LIMIT });
        const receipt = await response.wait(120);
        const failure = receiptError(receipt);
        if (failure) return json({ error: `AccountInherit failed on chain: ${failure}`, tx: response.hash });

        const ctx = await getContextInfoOrNull(provider, subAddr);
        return json({
            tx: response.hash,
            sub_account: { index: idx, address: subAddr },
            seeded_kmoi: seed,
            context_info: ctx,
            link_verified: contextMatchesLogic(ctx, LOGIC_ID),
        });
    },
});

// ---------- the agent ----------

const SYSTEM_PROMPT = `You are Pip, a demo agent for a live webinar about context inheritance on the MOI blockchain. You have your own on-chain identity, derived from a primary account, and your job is to demonstrate — live, with real chain calls — how that works.

The concepts you are demonstrating:
- A primary account is derived from a mnemonic. It funds and manages, but has no state under any logic (app).
- Per-account app state ("actor state") lives on the account, not in the app. An account gets a state slice under a logic only by being INHERITED under it: a sub-account created by one AccountInherit transaction signed by the primary, which links the sub-account's context to that logic and seeds it with KMOI for fuel.
- Sub-account addresses are structural: the primary's first 28 bytes + a 4-byte big-endian index. So identity is discoverable by pure math plus one getContextInfo call — no registry.
- Context inheritance is a state-allocation and identity mechanism, NOT a permission sandbox. Be honest about this if asked.

How to behave:
- Narrate what you are doing and what each tool result MEANS for the audience, briefly. Point out the shared 28-byte prefix and the 4-byte index when addresses come up.
- Start conversations by discovering your own identity (whoami) when relevant.
- If you are not provisioned yet, explain what that means (no context link, no actor state, the logic cannot store anything for you), then offer to provision yourself.
- Before sending any on-chain transaction, state in one sentence what you are about to do. Use small seed amounts (default 1000 KMOI) unless told otherwise.
- Keep responses tight — this is live on a projector. Short paragraphs, no walls of text.`;

const client = new Anthropic();
const tools = [whoami, inspectAccount, provisionSubAccount];

const main = async () => {
    const { primaryAddress } = await chainCtx();
    console.log(`Pip (webinar demo agent) — logic ${LOGIC_ID}`);
    console.log(`Primary account: ${primaryAddress}`);
    console.log(`Try: "who are you?", "are you provisioned?", "provision yourself", "inspect <address>"\n`);

    const rl = readline.createInterface({ input: stdin, output: stdout });
    const history = [];
    for (;;) {
        const line = (await rl.question("you> ")).trim();
        if (!line) continue;
        if (["exit", "quit"].includes(line.toLowerCase())) break;

        history.push({ role: "user", content: line });
        const finalMessage = await client.beta.messages.toolRunner({
            model: "claude-opus-4-8",
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            tools,
            messages: history,
        });
        const text = finalMessage.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n");
        // Keep only user + final assistant text in history; intermediate
        // tool exchanges live inside the runner. Good enough for a demo.
        history.push({ role: "assistant", content: text || "(no text)" });
        console.log(`\npip> ${text}\n`);
    }
    rl.close();
};

main().catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
});
