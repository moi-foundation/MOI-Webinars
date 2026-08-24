// The x402 wire format, widened just enough to name MOI.
//
// Field names below are the spec's, verbatim from the installed x402@1.2.0 schemas: scheme,
// network, maxAmountRequired, resource, description, mimeType, outputSchema, payTo,
// maxTimeoutSeconds, asset, extra. A generic x402 client can parse our 402 body without knowing
// anything about MOI, which is the entire point of session 9.
//
// TWO fields are widened from enum to string, and only two:
//
//   scheme  — x402's is a closed enum containing exactly ["exact"]
//   network — x402's is a closed enum of 16 EVM and Solana chains
//
// Neither can name MOI, so the npm packages throw on our 402 before our code runs. That is why we
// implement the shape by hand instead of importing it. We are not changing the protocol; we are
// declaring a scheme it does not ship with, which is what a scheme identifier is for.
//
// Everything MOI-specific rides in `extra`, which the spec already types as an open record. So
// nothing here is a fork — a compliant parser reads every field it knows and ignores the rest.

import { SCHEME, X402_NETWORK, X402_VERSION } from "./config.js";
// NETWORK is already exported by payment-proof.ts with the identical value — don't shadow it.
export { SCHEME, X402_NETWORK, X402_VERSION };

/** One entry in the 402 body's `accepts[]`. Spec-shaped. */
export interface PaymentRequirements {
  /** Ours: "moi-transfer". x402 ships only "exact". */
  scheme: string;
  /** Ours: "moi-voyage-devnet". */
  network: string;
  /** Atomic units, decimal string. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  /** The seller's MOI participant identifier. */
  payTo: string;
  maxTimeoutSeconds: number;
  /** MAS0 asset id. */
  asset: string;
  /** Open record in the spec, so MOI-specific fields live here without breaking a parser. */
  extra: PaymentExtra;
}

export interface PaymentExtra {
  symbol: string;
  /**
   * The seller's on-chain agent id. This is session 7's whole story surviving into a standard
   * envelope: x402 tells you WHERE to send money and has no opinion on WHOSE address it is.
   */
  payToAgentId?: string;
  /** What the seller charges before demand pricing, for the buyer to judge the markup. */
  listPrice?: string;
}

/**
 * What the buyer signs.
 *
 * x402's canonical scheme signs a transfer AUTHORIZATION that someone else then submits. MOI has
 * no detached-authorization signing — you sign a whole interaction or nothing — so there is
 * nothing to hand over. Our scheme inverts it: the buyer pays first from its own account, and
 * `txHash` names that settled transfer. The signature proves the payment belongs to this request.
 */
export interface PaymentAuthorization {
  from: string;
  to: string;
  asset: string;
  /** Atomic units, decimal string. */
  value: string;
  /** The buyer's own settled transfer. The seller reads it off the chain. */
  txHash: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  /** Binds the payment to what was bought, so one payment cannot buy something else. */
  resource: string;
}

/** Decoded from the base64 `X-PAYMENT` header. */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    /** Compressed public key, hex, no 0x prefix. */
    publicKey: string;
    keyId: number;
    signature: string;
    authorization: PaymentAuthorization;
  };
}

/** The body of an HTTP 402 response. Spec-shaped. */
export interface PaymentRequiredBody {
  x402Version: number;
  accepts: PaymentRequirements[];
  error?: string;
}

/** Decoded from `X-PAYMENT-RESPONSE` on success. */
export interface PaymentResponseHeader {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
  errorReason?: string;
}

// ── wire codecs ────────────────────────────────────────────────────────────────────────────

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v), "utf8").toString("base64");
const unb64 = <T>(h: string): T => JSON.parse(Buffer.from(h, "base64").toString("utf8")) as T;

export const encodePaymentHeader = (p: PaymentPayload): string => b64(p);
export const decodePaymentHeader = (h: string): PaymentPayload => unb64<PaymentPayload>(h);
export const encodePaymentResponseHeader = (b: PaymentResponseHeader): string => b64(b);
export const decodePaymentResponseHeader = (h: string): PaymentResponseHeader =>
  unb64<PaymentResponseHeader>(h);

export const paymentRequiredBody = (
  accepts: PaymentRequirements[],
  error?: string,
): PaymentRequiredBody => ({ x402Version: X402_VERSION, accepts, ...(error ? { error } : {}) });

/**
 * Canonical bytes for signing. Signer and verifier must agree byte-for-byte, so field order is
 * pinned in an array rather than left to JSON key ordering, and the first element domain-separates
 * this signature from anything else the same key might sign.
 */
export const canonicalAuthorization = (a: PaymentAuthorization): string =>
  JSON.stringify([
    "moi-x402-payment-authorization-v1",
    a.from, a.to, a.asset, a.value, a.txHash,
    a.validAfter, a.validBefore, a.nonce, a.resource,
  ]);

export const canonicalAuthorizationBytes = (a: PaymentAuthorization): Uint8Array =>
  new TextEncoder().encode(canonicalAuthorization(a));
