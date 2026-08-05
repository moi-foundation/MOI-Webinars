// Env loading + config. Single source of truth for every package.
//
// Secrets NEVER get a default and NEVER get committed. See .env.example.

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root for this session (…/session-7). */
export const SESSION_ROOT = resolve(here, "..", "..", "..");

loadDotenv({ path: resolve(SESSION_ROOT, ".env") });

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in — see README.md.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v ? v : fallback;
}

/** The Voyage faucet derivation path — same one sessions 3–6 use. */
export const DEFAULT_DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

/** Verified live: VoyageProvider("devnet").host resolves to exactly this. */
export const VOYAGE_DEVNET_RPC = "https://dev.voyage-rpc.moi.technology/devnet/";

export const FAUCET_URL = "https://voyage.moi.technology";

export interface WalletConfig {
  label: string;
  mnemonic: string;
  derivationPath: string;
}

/** Reads a wallet's secret config. Throws with a pointed message if unset. */
export function walletConfig(prefix: "AGENT_A" | "AGENT_B" | "FACILITATOR"): WalletConfig {
  return {
    label: prefix,
    mnemonic: required(`${prefix}_MNEMONIC`),
    derivationPath: optional(`${prefix}_DERIVATION_PATH`, DEFAULT_DERIVATION_PATH),
  };
}

export const config = {
  /** MAS0 asset used for payment. Written to .env by `npm run setup-asset`. */
  get assetId(): string {
    return required("ASSET_ID");
  },
  assetSymbol: optional("ASSET_SYMBOL", "USDM"),
  assetDecimals: Number(optional("ASSET_DECIMALS", "6")),

  /** Agent registry ids. Written to .env by `npm run register-agents`. */
  get agentAId(): string | undefined {
    return process.env.AGENT_A_ID?.trim() || undefined;
  },
  get agentBId(): string | undefined {
    return process.env.AGENT_B_ID?.trim() || undefined;
  },

  facilitatorPort: Number(optional("FACILITATOR_PORT", "4021")),
  agentBPort: Number(optional("AGENT_B_PORT", "4022")),
  host: optional("HOST", "127.0.0.1"),

  get facilitatorUrl(): string {
    return optional("FACILITATOR_URL", `http://${this.host}:${this.facilitatorPort}`);
  },
  get agentBUrl(): string {
    return optional("AGENT_B_URL", `http://${this.host}:${this.agentBPort}`);
  },

  /** Price of one signal, in atomic units of the MAS0 asset. */
  signalPrice: optional("SIGNAL_PRICE", "1000"),

  /** Tier 2 feature flag. Tier 1 must never depend on this being true. */
  escrow: optional("ESCROW", "false").toLowerCase() === "true",

  /**
   * Settlement backend: "lockup" (real MAS0 Lockup->Release->Transfer on devnet) or "mock"
   * (in-memory, for exercising the full protocol without funded wallets).
   */
  settlement: optional("SETTLEMENT", "lockup").toLowerCase(),

  /** How long a signed payment authorization stays valid. */
  authorizationTtlSeconds: Number(optional("AUTH_TTL_SECONDS", "120")),

  fuelLimit: Number(optional("FUEL_LIMIT", "50000")),
} as const;
