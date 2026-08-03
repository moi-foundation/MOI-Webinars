// Self-contained config for the agent-budget scripts. Reads .env from the
// repo root (or ENV_PATH override). Keep the variable set minimal:
//
//   Common (every script):
//     LOGIC_ID                 the deployed AgentBudget logic id
//     MOI_NODE_URL             JSON-RPC endpoint   (e.g. http://localhost:1600)
//     MOI_WEBSOCKET_URL        WS endpoint         (e.g. ws://localhost:1600/ws)
//
//   User (squad.js / agent.js / deploy-budget.js):
//     USER_ID                  the PRIMARY account id (verifies the mnemonic)
//     USER_MNEMONIC, USER_DERIVATION_PATH
//     USER_SUB_ACCOUNT         optional override of the inherited index;
//                              normally left empty (detected on chain).
//
//   Optional:
//     FUEL_LIMIT (20000), BOARD_PORT (3300), HOST (127.0.0.1)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = process.env.ENV_PATH ?? path.resolve(__dirname, "..", ".env");

const parseLine = (line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return null;
    const eq = t.indexOf("=");
    if (eq === -1) return null;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    return key ? [key, val] : null;
};

// Load .env into process.env without overwriting anything already set, so a
// real environment variable still wins over the file.
if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
        const entry = parseLine(line);
        if (entry && process.env[entry[0]] === undefined) process.env[entry[0]] = entry[1];
    }
}

const env = (name, fallback = "") => process.env[name] ?? fallback;

export const LOGIC_ID = env("LOGIC_ID");
export const MOI_NODE_URL = env("MOI_NODE_URL", "http://localhost:1600");
export const MOI_WEBSOCKET_URL = env("MOI_WEBSOCKET_URL", "ws://localhost:1600/ws");
export const FUEL_LIMIT = Number(env("FUEL_LIMIT", "20000"));
export const BOARD_PORT = Number(env("BOARD_PORT", "3300"));
export const HOST = env("HOST", "127.0.0.1");
export const WS_RECONNECT_DELAY_MS = Number(env("WS_RECONNECT_DELAY_MS", "3000"));

export const RESOLVER = {
    id: env("RESOLVER_ID"),
    mnemonic: env("RESOLVER_MNEMONIC"),
    derivationPath: env("RESOLVER_DERIVATION_PATH", "m/44'/6174'/0'/0/1"),
};

// USER_SUB_ACCOUNT is a plain sub-account INDEX (e.g. 1, 12) — not an address.
// Empty → unset (detect on chain). Reject anything that isn't a whole number
// so a pasted 0x address fails loudly instead of being coerced.
const parseSubAccountIndex = (raw) => {
    if (raw === "") return null;
    if (!/^\d+$/.test(raw)) {
        throw new Error(`USER_SUB_ACCOUNT must be a non-negative integer index (e.g. 1), not "${raw}"`);
    }
    return Number(raw);
};

export const USER = {
    id: env("USER_ID"),
    mnemonic: env("USER_MNEMONIC"),
    derivationPath: env("USER_DERIVATION_PATH", "m/44'/6174'/0'/0/1"),
    subAccount: parseSubAccountIndex(env("USER_SUB_ACCOUNT")),
};

// Throw a clear error if a required key is missing.
export const requireEnv = (pairs) => {
    const missing = pairs.filter(([, v]) => v === undefined || v === "").map(([k]) => k);
    if (missing.length) throw new Error(`Missing required config in ${ENV_PATH}: ${missing.join(", ")}`);
};
