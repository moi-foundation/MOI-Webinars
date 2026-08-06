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
  /** The BUYER's wallet — the funded one. It signs the payment, so it needs gas. */
  derivationPath: opt("USER_DERIVATION_PATH", DEFAULT_DERIVATION_PATH),
  /** The SELLER's wallet. Receive-only, so it needs no funding at all. */
  sellerDerivationPath: opt("SELLER_DERIVATION_PATH", DEFAULT_SELLER_PATH),

  get assetId(): string { return req("SETTLEMENT_ASSET_ID"); },
  get assetIdOrNull(): string | null { return process.env.SETTLEMENT_ASSET_ID?.trim() || null; },
  assetSymbol: opt("ASSET_SYMBOL", "USDM"),

  get sellerAgentId(): string | null { return process.env.SELLER_AGENT_ID?.trim() || null; },
  get buyerAgentId(): string | null { return process.env.BUYER_AGENT_ID?.trim() || null; },

  /** What the buyer will pay for one estimate, in base units. */
  price: BigInt(opt("PRICE_PER_ESTIMATE", "1")),

  sellerUrl: opt("SELLER_URL", "http://localhost:4011"),
  sellerPort: Number(new URL(opt("SELLER_URL", "http://localhost:4011")).port || "4011"),
  buyerPort: Number(opt("BUYER_PORT", "4001")),

  groqKey: process.env.GROQ_API_KEY?.trim() || null,
  groqModel: opt("GROQ_MODEL", "llama-3.3-70b-versatile"),

  /** How long a quote, and the signed claim that answers it, stay valid. */
  authTtlSeconds: Number(opt("AUTH_TTL_SECONDS", "120")),
} as const;
