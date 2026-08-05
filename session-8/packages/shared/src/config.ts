// Env parsing + constants. Single source of truth.
// Required vars throw by name. No silent defaults for secrets.
//
// SESSION 8 = V2: AUTHORITY. Everything session 7 does, plus context inheritance — each agent is
// an inherited sub-account carrying an on-chain spend cap that the chain itself enforces.

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

/** Our x402 scheme + network ids. Opaque to useFacilitator; only we must agree. */
export const SCHEME = "moi-transfer";
export const NETWORK = "moi-voyage-devnet";
export const X402_VERSION = 1;

/** Stable, obviously-fake id so mock runs are reproducible. */
export const MOCK_ASSET_ID = "0x" + "a5".repeat(28) + "00000000";
export const MOCK_LOGIC_ID = "0x20000000" + "b0".repeat(24) + "00000000";

export const FUEL_LIMIT = Number(opt("FUEL_LIMIT", "20000"));
export const INHERIT_FUEL_LIMIT = FUEL_LIMIT * 4;
export const SEED_KMOI = BigInt(FUEL_LIMIT * 3);

/**
 * "real" (default) hits MOI Voyage devnet and needs a funded wallet.
 * "mock" runs the ENTIRE protocol in-process with an in-memory ledger — real signatures, real
 * verification, simulated settlement. See mock-chain.ts.
 */
export const CHAIN_MODE = opt("CHAIN_MODE", "real").toLowerCase();

/**
 * Fixed throwaway mnemonic so `CHAIN_MODE=mock pnpm demo` runs with no .env at all.
 * PUBLIC AND WORTHLESS BY DESIGN — committed to this repo, holds nothing. Never fund it.
 */
const MOCK_MNEMONIC =
  "tag provide neither find ankle risk square length crumble category mule despair";

export const config = {
  chainMode: CHAIN_MODE,
  get mnemonic(): string {
    if (CHAIN_MODE === "mock") return process.env.USER_MNEMONIC?.trim() || MOCK_MNEMONIC;
    return req("USER_MNEMONIC");
  },
  /** The PRIMARY wallet. Both agents are inherited sub-accounts of it. */
  derivationPath: opt("USER_DERIVATION_PATH", DEFAULT_DERIVATION_PATH),

  /** Sub-account indices — context inheritance. */
  buyerIndex: Number(opt("BUYER_SUBACCOUNT_INDEX", "1")),
  sellerIndex: Number(opt("SELLER_SUBACCOUNT_INDEX", "2")),

  /** The buyer's on-chain spend cap, enforced by the AgentBudget logic. */
  buyerBudget: BigInt(opt("BUYER_BUDGET", "500")),

  get logicId(): string {
    if (CHAIN_MODE === "mock") return process.env.LOGIC_ID?.trim() || MOCK_LOGIC_ID;
    return req("LOGIC_ID");
  },
  get logicIdOrNull(): string | null { return process.env.LOGIC_ID?.trim() || null; },

  get assetId(): string {
    if (CHAIN_MODE === "mock") return process.env.SETTLEMENT_ASSET_ID?.trim() || MOCK_ASSET_ID;
    return req("SETTLEMENT_ASSET_ID");
  },
  get assetIdOrNull(): string | null { return process.env.SETTLEMENT_ASSET_ID?.trim() || null; },
  assetSymbol: opt("ASSET_SYMBOL", "USDM"),

  get sellerAgentId(): string | null { return process.env.SELLER_AGENT_ID?.trim() || null; },
  get buyerAgentId(): string | null { return process.env.BUYER_AGENT_ID?.trim() || null; },

  /** What the buyer will pay for one book, in base units. */
  price: BigInt(opt("PRICE_PER_BOOK", "1")),

  facilitatorUrl: opt("FACILITATOR_URL", "http://localhost:4021"),
  sellerUrl: opt("SELLER_URL", "http://localhost:4011"),
  facilitatorPort: Number(opt("FACILITATOR_PORT", "4021")),
  sellerPort: Number(new URL(opt("SELLER_URL", "http://localhost:4011")).port || "4011"),
  buyerPort: Number(opt("BUYER_PORT", "4001")),

  groqKey: process.env.GROQ_API_KEY?.trim() || null,
  groqModel: opt("GROQ_MODEL", "llama-3.3-70b-versatile"),

  /** How long a signed payment authorization stays valid. */
  authTtlSeconds: Number(opt("AUTH_TTL_SECONDS", "120")),
} as const;
