import type { MoiPaymentClaim } from "./types.js";

/**
 * Canonical bytes for signing a claim.
 *
 * Signer and verifier have to produce identical bytes or the signature check fails, so the
 * fields are pinned positionally rather than left to JSON key ordering. The first element is a
 * domain separator: it stops a signature made here being reinterpreted as a signature over
 * anything else the same key might sign.
 *
 * @param claim - The claim to serialize.
 * @returns The canonical JSON string.
 */
export const canonicalClaim = (claim: MoiPaymentClaim): string =>
  JSON.stringify([
    "moi-x402-payment-claim-v1",
    claim.from,
    claim.to,
    claim.asset,
    claim.value,
    claim.txHash,
    claim.resource,
    claim.validAfter,
    claim.validBefore,
    claim.nonce,
  ]);

/**
 * UTF-8 encoding of the canonical claim, which is what actually gets signed.
 *
 * @param claim - The claim to serialize.
 * @returns The bytes to sign.
 */
export const canonicalClaimBytes = (claim: MoiPaymentClaim): Uint8Array =>
  new TextEncoder().encode(canonicalClaim(claim));

/**
 * Current time in whole seconds.
 *
 * @returns Unix seconds.
 */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * A fresh 32-byte nonce.
 *
 * @returns Hex string, 0x-prefixed.
 */
export function randomNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
