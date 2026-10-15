// Env parsing + constants. Single source of truth.
// Required vars throw by name. No silent defaults for secrets.
//
// SESSION 8 = ACCESS POLICIES. Two plain accounts, no sub-accounts, no inheritance. The owner
// holds storage; the agent wants to write to it. Whether it may is decided by the protocol, from
// a policy the owner registered — not by a rule inside a logic the agent could route around.

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

export const VOYAGE_DEVNET_RPC = "https://dev.voyage-rpc.moi.technology/devnet/";
export const FAUCET_URL = "https://voyage.moi.technology";

/**
 * The node requires the sender's balance to cover fuel_limit UP FRONT, not just actual usage. So
 * a generous limit is not free on a lightly-funded devnet account — it fails as "insufficient
 * funds", which reads like an empty wallet and is not.
 *
 * Measured usage on this chain: ParticipantCreate 399, logic deploy 719, access op 100.
 */
export const FUEL_LIMIT = Number(opt("FUEL_LIMIT", "1500"));

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
