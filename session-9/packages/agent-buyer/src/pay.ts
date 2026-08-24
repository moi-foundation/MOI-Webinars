// The buyer's paying HTTP client.
//
//   GET -> 402 + quote -> approve() -> transfer on chain -> sign -> GET again with the proof
//
// The `approve` callback is the safety catch, and it runs BEFORE the transfer. Once funds move on
// MOI they are gone; there is no escrow and nothing to claw back in V1. So every question worth
// asking — is this really the seller, is this the asset I hold — has to be asked here.

import { MAS0AssetLogic } from "js-moi-sdk";
import {
  config,
  encodeProof,
  decodeReceipt,
  canonicalClaimBytes,
  randomNonce,
  nowSeconds,
  type Account,
  type PaymentClaim,
  type PaymentProof,
  type Quote,
  type Receipt,
} from "@demo/shared";

export class PaymentRefused extends Error {}

export type BuyerEvent =
  | { type: "request"; url: string; attempt: number }
  | { type: "quoted"; quote: Quote }
  | { type: "transferred"; txHash: string; amount: bigint }
  | { type: "signed"; claim: PaymentClaim; signature: string }
  | { type: "paid"; receipt: Receipt };

export interface PayOptions {
  buyer: Account;
  /** Buyer policy, run BEFORE any money moves. Return a string to refuse. */
  approve: (q: Quote) => Promise<string | null>;
  onEvent?: (e: BuyerEvent) => void;
}

export interface PaidResult<T> {
  data: T;
  receipt: Receipt | null;
  quote: Quote | null;
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
    return { data: body.data, receipt: null, quote: null, txHash: null };
  }

  const quote = (await first.json()) as Quote;
  if (!quote?.payTo || !quote?.asset || !quote?.price) {
    throw new PaymentRefused("seller returned 402 without a usable quote");
  }
  emit({ type: "quoted", quote });

  // ── policy, before anything is spent ────────────────────────────────────────────────────
  const refusal = await opts.approve(quote);
  if (refusal) throw new PaymentRefused(refusal);

  const price = BigInt(quote.price);
  // MAS0 transfer amounts must be numbers at the wire layer — a bigint breaks signing.
  const transferAmount = Number(price);

  // ── the buyer moves its OWN funds. On MOI nobody else can. ──────────────────────────────
  const asset = new MAS0AssetLogic(quote.asset, opts.buyer.wallet);
  const ix = await asset.transfer(quote.payTo, transferAmount).send();
  const result = (await ix.result()) as unknown as { error?: unknown };
  if (result?.error) throw new Error(`transfer reverted: ${JSON.stringify(result.error)}`);
  const txHash = ix.hash;
  emit({ type: "transferred", txHash, amount: price });

  // ── sign a claim naming that transfer ───────────────────────────────────────────────────
  const claim: PaymentClaim = {
    from: opts.buyer.address,
    to: quote.payTo,
    asset: quote.asset,
    value: price.toString(),
    txHash,
    resource: quote.resource,
    nonce: randomNonce(),
    expiresAt: nowSeconds() + (quote.ttlSeconds || config.authTtlSeconds),
  };
  const sigAlgo = opts.buyer.wallet.signingAlgorithms.ecdsa_secp256k1;
  const signature = await opts.buyer.wallet.sign(
    canonicalClaimBytes(claim), opts.buyer.keyId, sigAlgo,
  );
  emit({ type: "signed", claim, signature });

  const proof: PaymentProof = {
    claim,
    publicKey: opts.buyer.publicKey,
    keyId: opts.buyer.keyId,
    signature,
  };

  // ── retry ONCE with the proof attached ──────────────────────────────────────────────────
  emit({ type: "request", url, attempt: 2 });
  const second = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), "X-Payment-Proof": encodeProof(proof) },
  });

  if (second.status === 402) {
    const body = (await second.json().catch(() => ({}))) as Quote;
    // Worth being loud about: the money is already gone at this point.
    throw new PaymentRefused(
      `payment rejected after transfer ${txHash}: ${body.error ?? "unknown"}`,
    );
  }
  if (!second.ok) {
    throw new Error(
      `GET ${url} failed after payment: HTTP ${second.status} ${await second.text().catch(() => "")}`,
    );
  }

  const header = second.headers.get("X-Payment-Receipt");
  const receipt = header ? decodeReceipt(header) : null;
  if (receipt) emit({ type: "paid", receipt });

  const body = (await second.json()) as { data: T };
  return { data: body.data, receipt, quote, txHash };
}
