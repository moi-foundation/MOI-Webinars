// The buyer's HTTP client, speaking x402.
//
//   GET  ->  402 { x402Version, accepts: [...] }  ->  pay  ->  GET again with X-PAYMENT  ->  200
//
// The HTTP semantics here are the spec's exactly: request, on 402 read `accepts[]`, pay, retry
// ONCE with a base64 X-PAYMENT header, read X-PAYMENT-RESPONSE off the reply.
//
// What our scheme changes is the meaning of "pay". x402's own scheme signs a detached transfer
// authorization for someone else to submit. MOI has no such thing — you sign a whole interaction
// or nothing — so instead the buyer SETTLES FIRST from the owner's allowance and then signs an
// authorization naming that settled transfer. The seller reads it off the chain.
//
// Session 8 carries through: the money is the OWNER's, pulled with transferFrom under a cap the
// buyer cannot raise. The buyer holds fuel and nothing else.

import { MAS0AssetLogic } from "js-moi-sdk";
import {
  config, FUEL_LIMIT,
  SCHEME, X402_NETWORK, X402_VERSION,
  encodePaymentHeader,
  decodePaymentResponseHeader,
  canonicalAuthorizationBytes,
  randomNonce,
  nowSeconds,
  type Account,
  type PaymentAuthorization,
  type PaymentPayload,
  type PaymentRequiredBody,
  type PaymentRequirements,
  type PaymentResponseHeader,
} from "@demo/shared";

export class PaymentRefused extends Error {}

export type BuyerEvent =
  | { type: "request"; url: string; attempt: number }
  | { type: "payment-required"; requirements: PaymentRequirements }
  | { type: "transferred"; txHash: string; amount: bigint }
  | { type: "signed"; authorization: PaymentAuthorization; signature: string }
  | { type: "paid"; receipt: PaymentResponseHeader };

export interface PayOptions {
  /** The agent's wallet. It signs; it does not fund. */
  buyer: Account;
  /** Whose balance the payment is pulled FROM. Session 8's owner. */
  benefactor: string;
  /** Buyer policy, run BEFORE any money moves. Return a string to refuse. */
  approve: (r: PaymentRequirements) => Promise<string | null>;
  onEvent?: (e: BuyerEvent) => void;
}

export interface PaidResult<T> {
  data: T;
  receipt: PaymentResponseHeader | null;
  requirements: PaymentRequirements | null;
  txHash: string | null;
}

export async function payingFetch<T = unknown>(
  url: string,
  opts: PayOptions,
  init?: RequestInit,
): Promise<PaidResult<T>> {
  const emit = (e: BuyerEvent) => opts.onEvent?.(e);

  emit({ type: "request", url, attempt: 1 });
  const first = await fetch(url, init);

  if (first.status !== 402) {
    if (!first.ok) throw new Error(`GET ${url} failed: HTTP ${first.status}`);
    const body = (await first.json()) as { data: T };
    return { data: body.data, receipt: null, requirements: null, txHash: null };
  }

  // ── read what the seller accepts ────────────────────────────────────────────────────────
  const required = (await first.json()) as PaymentRequiredBody;
  const offers = required.accepts ?? [];
  const requirements = offers.find((a) => a.scheme === SCHEME && a.network === X402_NETWORK);
  if (!requirements) {
    // Worth a specific error: this is exactly what a generic x402 client hits when it meets us,
    // and what we hit meeting an EVM seller. The envelope is shared; the scheme is not.
    throw new PaymentRefused(
      `no ${SCHEME}/${X402_NETWORK} option on offer (seller accepts: ${
        offers.map((a) => `${a.scheme}/${a.network}`).join(", ") || "nothing"
      })`,
    );
  }
  emit({ type: "payment-required", requirements });

  // ── policy, before anything is spent ────────────────────────────────────────────────────
  const refusal = await opts.approve(requirements);
  if (refusal) throw new PaymentRefused(refusal);

  const price = BigInt(requirements.maxAmountRequired);

  // ── settle first: pull the OWNER's funds, under the allowance ────────────────────────────
  // If this exceeds the cap the chain refuses and nothing moves. That refusal is session 8's
  // whole point, and it happens here rather than in any code we wrote.
  const asset = new MAS0AssetLogic(requirements.asset, opts.buyer.wallet);
  const ix = await asset
    .transferFrom(opts.benefactor, requirements.payTo, Number(price))
    .send({ fuel_limit: FUEL_LIMIT });
  const result = (await ix.result()) as unknown as { error?: unknown };
  if (result?.error) throw new Error(`transferFrom reverted: ${JSON.stringify(result.error)}`);
  const txHash = ix.hash;
  emit({ type: "transferred", txHash, amount: price });

  // ── then sign an authorization naming that settled transfer ─────────────────────────────
  const now = nowSeconds();
  const authorization: PaymentAuthorization = {
    from: opts.buyer.address,
    to: requirements.payTo,
    asset: requirements.asset,
    value: price.toString(),
    txHash,
    validAfter: String(now - 5),        // absorb clock skew between two agents
    validBefore: String(now + (requirements.maxTimeoutSeconds || config.authTtlSeconds)),
    nonce: randomNonce(),
    resource: requirements.resource,
  };
  const sigAlgo = opts.buyer.wallet.signingAlgorithms.ecdsa_secp256k1;
  const signature = await opts.buyer.wallet.sign(
    canonicalAuthorizationBytes(authorization), opts.buyer.keyId, sigAlgo,
  );
  emit({ type: "signed", authorization, signature });

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: SCHEME,
    network: X402_NETWORK,
    payload: {
      publicKey: opts.buyer.publicKey,
      keyId: opts.buyer.keyId,
      signature,
      authorization,
    },
  };

  // ── retry ONCE with payment attached ────────────────────────────────────────────────────
  emit({ type: "request", url, attempt: 2 });
  const second = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), "X-PAYMENT": encodePaymentHeader(payload) },
  });

  if (second.status === 402) {
    const body = (await second.json().catch(() => ({}))) as PaymentRequiredBody;
    throw new PaymentRefused(`payment rejected after transfer ${txHash}: ${body.error ?? "unknown"}`);
  }
  if (!second.ok) {
    throw new Error(`GET ${url} failed after payment: HTTP ${second.status}`);
  }

  const header = second.headers.get("X-PAYMENT-RESPONSE");
  const receipt = header ? decodePaymentResponseHeader(header) : null;
  if (receipt) emit({ type: "paid", receipt });

  const body = (await second.json()) as { data: T };
  return { data: body.data, receipt, requirements, txHash };
}
