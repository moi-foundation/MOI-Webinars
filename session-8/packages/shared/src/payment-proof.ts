// The wire format for simple agentic payments. Two messages, no third party.
//
//   1. QUOTE  the seller answers an unpaid request with HTTP 402 and what it wants
//   2. PROOF  the buyer pays on chain, then comes back with a signed claim naming that transfer
//
// This is deliberately NOT x402 — that version lives on the `claude/agent-payments-moi-x402`
// branch and is the one to reach for if you want any x402 client to be able to pay you. What we
// give up is interoperability. What we keep is the part that only MOI can do: before paying, the
// buyer asks the on-chain agent registry whether `payTo` really belongs to the seller.
//
// The seller verifies for itself. There is no facilitator, because on MOI a facilitator cannot
// move your funds anyway — only the owner can — so it could never be more than a referee.

import { NETWORK } from "./config.js";

export { NETWORK };

/** What the seller answers an unpaid request with, alongside HTTP 402. */
export interface Quote {
  /** Atomic units, decimal string. */
  price: string;
  symbol: string;
  /** MAS0 asset id. */
  asset: string;
  /** Seller's MOI participant identifier — where the money goes. */
  payTo: string;
  /**
   * Seller's on-chain agent id. This is the field that makes the demo work: `payTo` alone is 32
   * anonymous bytes, and this is what lets the buyer look the payee up in the registry.
   */
  payToAgentId?: string;
  /** Absolute URL of the thing being bought. Binds the payment to the purchase. */
  resource: string;
  description: string;
  network: string;
  /** How long the buyer has to pay and come back. */
  ttlSeconds: number;
  /** The seller's opening price for this item, so the buyer can see the markup. */
  listPrice?: string;
  /** Why the seller is charging this, in its own words. A sales pitch — treat it as such. */
  priceReason?: string;
  /** Which brain set the price: a model name, or a fallback label. */
  pricedBy?: string;
  /** Present only when a submitted payment was rejected, so the buyer learns why. */
  error?: string;
}

/**
 * What the buyer signs. The transfer has ALREADY happened when this is built — `txHash` names it,
 * and the seller reads that interaction off chain rather than believing this message.
 *
 * The signature is not decoration. Transfers are public, so without it anyone watching the chain
 * could quote a stranger's transfer hash and collect the goods it paid for.
 */
export interface PaymentClaim {
  /** Buyer's MOI identifier. Must be the sender of `txHash`. */
  from: string;
  /** Seller's MOI identifier. Must equal the quote's payTo. */
  to: string;
  asset: string;
  /** Atomic units, decimal string. */
  value: string;
  /** Interaction hash of the buyer's OWN transfer. */
  txHash: string;
  resource: string;
  nonce: string;
  /** Unix seconds. */
  expiresAt: number;
}

/** Base64'd into the `X-Payment-Proof` request header. */
export interface PaymentProof {
  claim: PaymentClaim;
  /** Compressed public key, hex, NO 0x prefix. Must derive to `claim.from`. */
  publicKey: string;
  keyId: number;
  signature: string;
}

/** Base64'd into the `X-Payment-Receipt` response header. */
export interface Receipt {
  paid: boolean;
  /** The buyer's own transfer, which the seller confirmed on chain. */
  txHash: string;
  network: string;
  payer: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ── codecs ─────────────────────────────────────────────────────────────────────────────────
// Base64 because HTTP headers cannot carry raw JSON safely.

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v), "utf8").toString("base64");
const unb64 = <T>(h: string): T => JSON.parse(Buffer.from(h, "base64").toString("utf8")) as T;

export const encodeProof = (p: PaymentProof): string => b64(p);
export const decodeProof = (h: string): PaymentProof => unb64<PaymentProof>(h);
export const encodeReceipt = (r: Receipt): string => b64(r);
export const decodeReceipt = (h: string): Receipt => unb64<Receipt>(h);

/**
 * Canonical bytes for signing. Signer and verifier must agree byte-for-byte, so field order is
 * pinned in an array rather than left to JSON key ordering.
 */
export const canonicalClaim = (c: PaymentClaim): string =>
  JSON.stringify([
    "moi-agent-payment-v1",
    c.from, c.to, c.asset, c.value, c.txHash, c.resource, c.nonce, String(c.expiresAt),
  ]);

export const canonicalClaimBytes = (c: PaymentClaim): Uint8Array =>
  new TextEncoder().encode(canonicalClaim(c));

export function randomNonce(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
