// The statement a buyer signs after paying.
//
// x402's `authorization` flow signs a detached permission slip that someone else submits. MOI has
// no such primitive — an interaction is signed whole, so there is nothing to hand over. MOI
// therefore uses the `upfront` flow: settle first, then prove.
//
// This claim is that proof. It names the transfer that already happened and binds it to one
// request, so a transaction hash lifted off the public chain cannot be redeemed by anyone else.

export interface MoiPaymentClaim {
  /** The paying account. */
  from: string;
  /** The payee, which must equal requirements.payTo. */
  to: string;
  /** MAS0 asset id. */
  asset: string;
  /** Atomic units, decimal string. */
  value: string;
  /** The interaction hash of the transfer the buyer already submitted. */
  txHash: string;
  /** Binds the payment to what was bought, so one payment cannot buy something else. */
  resource: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/** What travels in PaymentPayload.payload for this mechanism. */
export interface MoiPaymentPayload extends Record<string, unknown> {
  /** Compressed public key, hex, no 0x prefix. */
  publicKey: string;
  keyId: number;
  signature: string;
  claim: MoiPaymentClaim;
}

/**
 * Canonical bytes for signing.
 *
 * Signer and verifier must produce identical bytes or the signature check fails, so field order is
 * pinned positionally rather than left to JSON key ordering. The first element is a domain
 * separator: it stops a signature made here being reinterpreted as a signature over anything else
 * the same key might sign.
 */
export const canonicalClaim = (c: MoiPaymentClaim): string =>
  JSON.stringify([
    "moi-x402-payment-claim-v1",
    c.from, c.to, c.asset, c.value, c.txHash,
    c.resource, c.validAfter, c.validBefore, c.nonce,
  ]);

export const canonicalClaimBytes = (c: MoiPaymentClaim): Uint8Array =>
  new TextEncoder().encode(canonicalClaim(c));

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function randomNonce(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const normalizeAddress = (a: string): string =>
  (a ?? "").toLowerCase().replace(/^0x/, "");
