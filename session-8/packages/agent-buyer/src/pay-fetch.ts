// MOI-aware x402 client — DECISION A.
//
// `x402-fetch` cannot be used: before signing anything it runs
// `accepts.map(x => PaymentRequirementsSchema.parse(x))`, whose `network` is a closed enum and
// whose `scheme` is exactly ["exact"] — so it THROWS on our 402 body. It also requires a viem or
// Solana signer. (Verified in the installed package's compiled source — SDK_NOTES §A.)
//
// The HTTP semantics here are the spec's: request, on 402 read accepts[], pay, retry ONCE with a
// base64 X-Payment header.
//
// DECISION B changes what "pay" means. There is no facilitator to relay funds — on MOI only the
// owner can move their own money. So the buyer submits its OWN MAS0 transfer and puts that
// interaction hash in the signed authorization. The facilitator then reads the chain to confirm it.

import { MAS0AssetLogic } from "js-moi-sdk";
import {
  config,
  SCHEME,
  NETWORK,
  X402_VERSION,
  encodePaymentHeader,
  decodePaymentResponseHeader,
  canonicalAuthorizationBytes,
  randomNonce,
  nowSeconds,
  isMock,
  mockChain,
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
  | { type: "identity-ok"; registryWallet: string | null }
  | { type: "budget-ok"; spendHash: string; remaining: bigint }
  | { type: "transferred"; txHash: string; amount: bigint }
  | { type: "signed"; authorization: PaymentAuthorization; signature: string }
  | { type: "paid"; receipt: PaymentResponseHeader };

export interface PayFetchOptions {
  buyer: Account;
  /** Buyer policy, run BEFORE any money moves. Return a string to refuse. */
  approve: (r: PaymentRequirements) => Promise<string | null>;
  /** Budget gate, run BEFORE the transfer. Chain reverts on overspend => refuse. */
  gate: (r: PaymentRequirements) => Promise<{ ok: boolean; spendHash?: string; remaining?: bigint; reason?: string }>;
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
  opts: PayFetchOptions,
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
  const requirements = (required.accepts ?? []).find(
    (a) => a.scheme === SCHEME && a.network === NETWORK,
  );
  if (!requirements) {
    throw new PaymentRefused(
      `seller offers no ${SCHEME}/${NETWORK} option (got: ${
        (required.accepts ?? []).map((a) => `${a.scheme}/${a.network}`).join(", ") || "nothing"
      })`,
    );
  }
  emit({ type: "payment-required", requirements });

  // ── policy: identity + asset, BEFORE anything is spent ──────────────────────────────────
  const refusal = await opts.approve(requirements);
  if (refusal) throw new PaymentRefused(refusal);

  const price = BigInt(requirements.maxAmountRequired);

  // ── budget gate FIRST: if the chain refuses to record the spend, no money moves ──────────
  const gate = await opts.gate(requirements);
  if (!gate.ok) throw new PaymentRefused(gate.reason ?? "budget gate refused");
  if (gate.spendHash) {
    emit({ type: "budget-ok", spendHash: gate.spendHash, remaining: gate.remaining ?? 0n });
  }

  // ── the buyer moves its OWN funds. Nobody else can. ─────────────────────────────────────
  let txHash: string;
  if (isMock()) {
    txHash = mockChain.transfer(requirements.asset, opts.buyer.address, requirements.payTo, price);
  } else {
    const asset = new MAS0AssetLogic(requirements.asset, opts.buyer.wallet);
    const ix = await asset.transfer(requirements.payTo, price).send();
    const result = (await ix.result()) as unknown as { error?: unknown };
    if (result?.error) throw new Error(`transfer reverted: ${JSON.stringify(result.error)}`);
    txHash = ix.hash;
  }
  emit({ type: "transferred", txHash, amount: price });

  // ── sign the authorization that points at that transfer ─────────────────────────────────
  const now = nowSeconds();
  const authorization: PaymentAuthorization = {
    from: opts.buyer.address,
    to: requirements.payTo,
    asset: requirements.asset,
    value: price.toString(),
    txHash,
    ...(gate.spendHash ? { spendHash: gate.spendHash } : {}),
    validAfter: String(now - 5), // absorb clock skew between agents
    validBefore: String(now + config.authTtlSeconds),
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
    network: NETWORK,
    payload: { publicKey: opts.buyer.publicKey, keyId: opts.buyer.keyId, signature, authorization },
  };

  // ── retry ONCE with payment ─────────────────────────────────────────────────────────────
  emit({ type: "request", url, attempt: 2 });
  const second = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), "X-Payment": encodePaymentHeader(payload) },
  });

  if (second.status === 402) {
    const body = (await second.json().catch(() => ({}))) as PaymentRequiredBody;
    throw new PaymentRefused(
      `payment rejected after transfer ${txHash}: ${body.error ?? "unknown"}`,
    );
  }
  if (!second.ok) {
    throw new Error(`GET ${url} failed after payment: HTTP ${second.status} ${await second.text().catch(() => "")}`);
  }

  const header = second.headers.get("X-Payment-Response");
  const receipt = header ? decodePaymentResponseHeader(header) : null;
  if (receipt) emit({ type: "paid", receipt });

  const body = (await second.json()) as { data: T };
  return { data: body.data, receipt, requirements, txHash };
}
