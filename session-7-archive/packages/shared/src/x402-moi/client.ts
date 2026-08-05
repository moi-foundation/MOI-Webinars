// MOI-aware x402 payment client.
//
// Replacement for `x402-fetch`, which cannot be used here: `wrapFetchWithPayment` requires a viem
// `Signer` or a Solana `MultiNetworkSigner` and dispatches internally to EVM/SVM payload builders.
// A js-moi-sdk `Wallet` is neither. See SDK_NOTES.md §5.
//
// The HTTP behaviour is the x402 spec's: issue the request, and on 402 read `accepts[]`, sign an
// authorization, and retry once with a base64 `X-Payment` header.

import {
  MOI_SCHEME,
  MOI_NETWORK,
  X402_VERSION,
  type MoiPaymentAuthorization,
  type MoiPaymentPayload,
  type MoiPaymentRequirements,
  type PaymentRequiredResponse,
  type PaymentResponseHeader,
} from "../types.js";
import {
  signAuthorization,
  randomNonce,
  nowSeconds,
  type MoiAccount,
} from "../moi.js";
import {
  encodePaymentHeader,
  decodePaymentResponseHeader,
  selectRequirements,
} from "../x402.js";
import type { MoiSettlementBackend } from "../settlement.js";

export type ClientEvent =
  | { type: "request"; url: string; attempt: number }
  | { type: "payment-required"; requirements: MoiPaymentRequirements }
  | { type: "budget-rejected"; price: bigint; budget: bigint }
  | { type: "funding"; amount: bigint; transaction: string }
  | { type: "signed"; authorization: MoiPaymentAuthorization; signature: string }
  | { type: "paid"; receipt: PaymentResponseHeader };

export interface PayingFetchOptions {
  buyer: MoiAccount;
  backend: MoiSettlementBackend;
  /** Maximum the agent will pay for one call, in atomic units. Refuse anything above it. */
  maxAmount: bigint;
  authorizationTtlSeconds: number;
  onEvent?: (event: ClientEvent) => void;
  /**
   * Called with the seller's requirements before paying, so the buyer can apply its own policy
   * (e.g. "is this seller registered on chain?"). Returning a string rejects the payment.
   */
  approve?: (requirements: MoiPaymentRequirements) => Promise<string | null>;
}

export class PaymentRefused extends Error {}

export interface PaidResponse<T> {
  data: T;
  receipt: PaymentResponseHeader | null;
  requirements: MoiPaymentRequirements;
}

/**
 * Fetch a resource, paying for it if the server asks.
 *
 * Retries exactly once with payment — matching x402's client semantics, and ensuring a
 * misbehaving server can never make the agent pay twice for one call.
 */
export async function fetchWithMoiPayment<T = unknown>(
  url: string,
  options: PayingFetchOptions,
  init?: RequestInit,
): Promise<PaidResponse<T>> {
  const emit = (e: ClientEvent) => options.onEvent?.(e);

  emit({ type: "request", url, attempt: 1 });
  const first = await fetch(url, init);

  if (first.status !== 402) {
    if (!first.ok) throw new Error(`GET ${url} failed: HTTP ${first.status}`);
    const body = (await first.json()) as { data: T };
    return { data: body.data, receipt: null, requirements: undefined as never };
  }

  // ── 402: read what the seller accepts. ──────────────────────────────────────────────────
  const required = (await first.json()) as PaymentRequiredResponse;
  const requirements = selectRequirements(required.accepts ?? [], {
    scheme: MOI_SCHEME,
    network: MOI_NETWORK,
  });
  if (!requirements) {
    throw new PaymentRefused(
      `seller offers no ${MOI_SCHEME}/${MOI_NETWORK} option (got: ${(required.accepts ?? [])
        .map((a) => `${a.scheme}/${a.network}`)
        .join(", ") || "nothing"})`,
    );
  }
  emit({ type: "payment-required", requirements });

  // ── Policy: is this within budget, and do we trust the seller? ──────────────────────────
  const price = BigInt(requirements.maxAmountRequired);
  if (price > options.maxAmount) {
    emit({ type: "budget-rejected", price, budget: options.maxAmount });
    throw new PaymentRefused(`price ${price} exceeds budget ${options.maxAmount}`);
  }
  if (options.approve) {
    const rejection = await options.approve(requirements);
    if (rejection) throw new PaymentRefused(rejection);
  }

  // ── Escrow the funds so the facilitator can settle. ─────────────────────────────────────
  // MAS0 has no EIP-3009 equivalent, so the buyer must commit funds on chain before the retry.
  // See the long note at the top of settlement.ts.
  const funding = await options.backend.fund({
    payer: options.buyer,
    facilitator: requirements.extra.facilitator,
    assetId: requirements.asset,
    amount: price,
  });
  emit({ type: "funding", amount: price, transaction: funding.transaction });

  // ── Sign the authorization. ─────────────────────────────────────────────────────────────
  const now = nowSeconds();
  const authorization: MoiPaymentAuthorization = {
    from: options.buyer.address,
    to: requirements.payTo,
    asset: requirements.asset,
    value: price.toString(),
    validAfter: String(now - 5), // small backdate absorbs clock skew between agents
    validBefore: String(now + options.authorizationTtlSeconds),
    nonce: randomNonce(),
    resource: requirements.resource,
  };
  const signature = await signAuthorization(options.buyer, authorization);
  emit({ type: "signed", authorization, signature });

  const payload: MoiPaymentPayload = {
    x402Version: X402_VERSION,
    scheme: MOI_SCHEME,
    network: MOI_NETWORK,
    payload: {
      publicKey: options.buyer.publicKey,
      keyId: options.buyer.keyId,
      signature,
      authorization,
    },
  };

  // ── Retry once, with payment. ───────────────────────────────────────────────────────────
  emit({ type: "request", url, attempt: 2 });
  const second = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), "X-Payment": encodePaymentHeader(payload) },
  });

  if (second.status === 402) {
    const body = (await second.json().catch(() => ({}))) as PaymentRequiredResponse;
    throw new PaymentRefused(`payment rejected by seller/facilitator: ${body.error ?? "unknown"}`);
  }
  if (!second.ok) {
    const text = await second.text().catch(() => "");
    throw new Error(`GET ${url} failed after payment: HTTP ${second.status} ${text}`);
  }

  const receiptHeader = second.headers.get("X-Payment-Response");
  const receipt = receiptHeader ? decodePaymentResponseHeader(receiptHeader) : null;
  if (receipt) emit({ type: "paid", receipt });

  const body = (await second.json()) as { data: T };
  return { data: body.data, receipt, requirements };
}
