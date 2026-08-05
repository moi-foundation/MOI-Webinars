// x402 wire-format helpers.
//
// These implement the parts of the x402 spec that `x402-express` / `x402-fetch` hardcode to
// EVM/SVM (SDK_NOTES.md §5). The HTTP traffic produced here is spec-shaped x402 — only the
// `scheme` and `network` string values are MOI's.
//
// We DO reuse x402's real facilitator client (`useFacilitator`), which is chain-agnostic at
// runtime — verified by reading its compiled source.

import type {
  MoiPaymentPayload,
  MoiPaymentRequirements,
  PaymentRequiredResponse,
  PaymentResponseHeader,
} from "./types.js";
import { X402_VERSION } from "./types.js";

/** The `X-Payment` header value: base64 of the JSON payment payload. Per x402 spec. */
export function encodePaymentHeader(payload: MoiPaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePaymentHeader(header: string): MoiPaymentPayload {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as MoiPaymentPayload;
}

/** The `X-Payment-Response` header the seller returns on success. Per x402 spec. */
export function encodePaymentResponseHeader(body: PaymentResponseHeader): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

export function decodePaymentResponseHeader(header: string): PaymentResponseHeader {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentResponseHeader;
}

/** Build the HTTP 402 body. */
export function paymentRequiredBody(
  accepts: MoiPaymentRequirements[],
  error?: string,
): PaymentRequiredResponse {
  return { x402Version: X402_VERSION, accepts, ...(error ? { error } : {}) };
}

/**
 * Pick which of the seller's offered payment requirements to satisfy.
 *
 * The x402 spec allows a server to offer several. We take the first MOI one — the buyer agent has
 * exactly one asset and one chain, so there is nothing to negotiate.
 */
export function selectRequirements(
  accepts: MoiPaymentRequirements[],
  opts: { scheme: string; network: string },
): MoiPaymentRequirements | undefined {
  return accepts.find((a) => a.scheme === opts.scheme && a.network === opts.network);
}
