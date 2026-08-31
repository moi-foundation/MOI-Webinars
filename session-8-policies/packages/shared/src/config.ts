// Env parsing + constants. Single source of truth.
// Required vars throw by name. No silent defaults for secrets.
//
// SESSION 7 = V1: identity + payment. NO context inheritance, NO budget logic, NO sub-accounts.
// Each agent is simply an account with a wallet — per the 4 Aug call: "why can't I just create an
// agent wallet and just assign some money to that wallet?" Authority arrives in session 8.

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..", "..");
loadDotenv({ path: resolve(ROOT, ".env") });

function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name}. Copy .env.example to .env — see README.`);
  return v;
}
const opt = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

/** The Voyage faucet derivation path. */
export const DEFAULT_DERIVATION_PATH = "m/44'/6174'/7020'/0/0";
/** The seller only ever RECEIVES, so it never needs gas and never needs funding. */
export const DEFAULT_SELLER_PATH = "m/44'/6174'/7020'/0/1";

export const VOYAGE_DEVNET_RPC = "https://dev.voyage-rpc.moi.technology/devnet/";
export const FAUCET_URL = "https://voyage.moi.technology";

/** Names the chain a payment settled on. Only appears in quotes and receipts. */
export const NETWORK = "moi-voyage-devnet";

export const FUEL_LIMIT = Number(opt("FUEL_LIMIT", "20000"));

export const config = {
  get mnemonic(): string { return req("USER_MNEMONIC"); },

  /** The OWNER — the faucet-funded wallet. It owns the storage and writes the policies. */
  derivationPath: opt("USER_DERIVATION_PATH", DEFAULT_DERIVATION_PATH),
  /** The AGENT — a separate account that wants to write to the owner's storage. */
  agentDerivationPath: opt("AGENT_DERIVATION_PATH", "m/44'/6174'/7020'/0/7"),

  /** The logic whose storage the policy governs. Set by `npm run setup:logic`. */
  get logicId(): string { return req("LOGIC_ID"); },
  get logicIdOrNull(): string | null { return process.env.LOGIC_ID?.trim() || null; },
} as const;
