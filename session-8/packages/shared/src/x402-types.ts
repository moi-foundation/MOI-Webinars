// x402 wire shapes, widened for MOI. DECISION A: keep the wire format byte-for-byte.
//
// Field names below are taken verbatim from the INSTALLED x402@1.2.0 zod schemas
// (x402/dist/cjs/index.js:1098) — scheme, network, maxAmountRequired, resource, description,
// mimeType, outputSchema, payTo, maxTimeoutSeconds, asset, extra. We widen only `scheme` and
// `network` to strings, because x402's own enums are closed and cannot name MOI.

import { SCHEME, NETWORK, X402_VERSION } from "./config.js";

export { SCHEME, NETWORK, X402_VERSION };

/** The 402 body's `accepts[]` entries. */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  /** Atomic units, decimal string. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  /** Seller's MOI participant identifier (its inherited sub-account). */
  payTo: string;
  maxTimeoutSeconds: number;
  /** MAS0 asset id. */
  asset: string;
  extra: PaymentExtra;
}

export interface PaymentExtra {
  symbol: string;
  /** Seller's on-chain agent id, so the buyer can check the registry before paying. */
  payToAgentId?: string;
}

/**
 * What the buyer signs. DECISION B: the buyer has ALREADY submitted its own MAS0 transfer, so
 * `txHash` is the heart of this — the facilitator independently reads that interaction off chain.
 * The signature binds the claim to this buyer, this resource and this price.
 */
export interface PaymentAuthorization {
  /** Buyer's MOI identifier (its inherited sub-account). */
  from: string;
  /** Seller's MOI identifier. Must equal requirements.payTo. */
  to: string;
  asset: string;
  /** Atomic units, decimal string. */
  value: string;
  /** Interaction hash of the buyer's OWN transfer. The facilitator verifies this on chain. */
  txHash: string;
  /** Interaction hash of the buyer's RecordSpend against its on-chain cap. */
  spendHash?: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  /** Binds the payment to what was bought. */
  resource: string;
}

/** Decoded from the base64 `X-Payment` header. */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    /** Compressed public key, hex, NO 0x prefix. */
    publicKey: string;
    keyId: number;
    signature: string;
    authorization: PaymentAuthorization;
  };
}

/** Facilitator POST /verify + /settle request body — exactly what useFacilitator sends. */
export interface FacilitatorRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
  checks?: VerificationCheck[];
}

/**
 * The facilitator SIGNS NOTHING (DECISION B). `transaction` echoes the buyer's own transfer hash
 * that the facilitator confirmed on chain — it is a confirmation, not a settlement it performed.
 */
export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  transaction?: string;
  network: string;
  payer?: string;
}

/** Body of the HTTP 402 response. */
export interface PaymentRequiredBody {
  x402Version: number;
  accepts: PaymentRequirements[];
  error?: string;
}

/** Decoded from `X-Payment-Response` on success. */
export interface PaymentResponseHeader {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
}

// ── wire codecs ────────────────────────────────────────────────────────────────────────────

export const encodePaymentHeader = (p: PaymentPayload): string =>
  Buffer.from(JSON.stringify(p), "utf8").toString("base64");

export const decodePaymentHeader = (h: string): PaymentPayload =>
  JSON.parse(Buffer.from(h, "base64").toString("utf8")) as PaymentPayload;

export const encodePaymentResponseHeader = (b: PaymentResponseHeader): string =>
  Buffer.from(JSON.stringify(b), "utf8").toString("base64");

export const decodePaymentResponseHeader = (h: string): PaymentResponseHeader =>
  JSON.parse(Buffer.from(h, "base64").toString("utf8")) as PaymentResponseHeader;

export const paymentRequiredBody = (
  accepts: PaymentRequirements[],
  error?: string,
): PaymentRequiredBody => ({ x402Version: X402_VERSION, accepts, ...(error ? { error } : {}) });

/**
 * Canonical bytes for signing. Signer and verifier MUST agree byte-for-byte, so field order is
 * pinned explicitly rather than relying on JSON key order.
 */
export const canonicalAuthorization = (a: PaymentAuthorization): string =>
  JSON.stringify([
    "moi-x402-payment-authorization-v1",
    a.from, a.to, a.asset, a.value, a.txHash,
    a.spendHash ?? "", a.validAfter, a.validBefore, a.nonce, a.resource,
  ]);

export const canonicalAuthorizationBytes = (a: PaymentAuthorization): Uint8Array =>
  new TextEncoder().encode(canonicalAuthorization(a));

export function randomNonce(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
