// MOI wallet + signature helpers.
//
// Every API used here is confirmed against installed types AND executed live against Voyage
// devnet — see SDK_NOTES.md §1–3 and `npm run verify-sdk`.

import {
  VoyageProvider,
  Wallet,
  createParticipantId,
  ParticipantTagV0,
  hexToBytes,
} from "js-moi-sdk";
import type { WalletConfig } from "./config.js";
import type { MoiPaymentAuthorization } from "./types.js";

export interface MoiAccount {
  label: string;
  wallet: Wallet;
  provider: VoyageProvider;
  /** MOI participant identifier, 0x + 32 bytes, lowercase. */
  address: string;
  /** Compressed secp256k1 public key, hex, NO 0x prefix. */
  publicKey: string;
  keyId: number;
}

/** Connect a wallet from a mnemonic to Voyage devnet. */
export async function loadAccount(cfg: WalletConfig): Promise<MoiAccount> {
  const provider = new VoyageProvider("devnet");
  const wallet = await Wallet.fromMnemonic(cfg.mnemonic, cfg.derivationPath);
  wallet.connect(provider);
  return {
    label: cfg.label,
    wallet,
    provider,
    address: (await wallet.getIdentifier()).toHex().toLowerCase(),
    publicKey: wallet.getPublicKey(),
    keyId: await wallet.getKeyId(),
  };
}

/**
 * Derive a MOI participant identifier from a compressed public key.
 *
 * VERIFIED LIVE (4/4 random wallets): this reproduces `wallet.getIdentifier()` exactly.
 * This is what lets the facilitator prove that whoever signed the authorization really does
 * control the account being debited — see SDK_NOTES.md §3.
 *
 * @param publicKey 33-byte compressed key as hex, NO 0x prefix (js-moi-sdk convention).
 */
export function identifierFromPublicKey(publicKey: string): string {
  const key = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  // Drop the leading 02/03 parity byte, then take the next 24 bytes as the fingerprint.
  const fingerprint = hexToBytes("0x" + key.slice(2)).slice(0, 24);
  // GenerateParticipantOption is { tag, fingerprint, variant, flags? } — there is deliberately no
  // `version` field; the version is carried by the tag (ParticipantTagV0).
  return createParticipantId({ tag: ParticipantTagV0, fingerprint, variant: 0 })
    .toHex()
    .toLowerCase();
}

/**
 * Canonical byte encoding of a payment authorization.
 *
 * Both signer and verifier MUST produce identical bytes, so the field order is fixed explicitly
 * rather than relying on object key order. Deliberately human-readable: during the talk we print
 * this exact string, and the audience can see that the signature covers the amount, the payee,
 * AND the resource being bought.
 */
export function canonicalAuthorization(auth: MoiPaymentAuthorization): string {
  return JSON.stringify([
    "moi-x402-payment-authorization-v1",
    auth.from,
    auth.to,
    auth.asset,
    auth.value,
    auth.validAfter,
    auth.validBefore,
    auth.nonce,
    auth.resource,
  ]);
}

export function canonicalAuthorizationBytes(auth: MoiPaymentAuthorization): Uint8Array {
  return new TextEncoder().encode(canonicalAuthorization(auth));
}

/** Sign a payment authorization. Returns a hex signature. */
export async function signAuthorization(
  account: MoiAccount,
  auth: MoiPaymentAuthorization,
): Promise<string> {
  const sigAlgo = account.wallet.signingAlgorithms.ecdsa_secp256k1;
  return account.wallet.sign(canonicalAuthorizationBytes(auth), account.keyId, sigAlgo);
}

/**
 * Verify a payment authorization signature against a claimed public key.
 *
 * `Signer.verify` is an instance method but is pure — it does not consult the instance's own key.
 * We take a wallet purely as a verifier here; the explicit parameter name says so.
 *
 * VERIFIED LIVE: returns false for a wrong key and false for a tampered message.
 */
export function verifyAuthorization(
  verifier: Wallet,
  auth: MoiPaymentAuthorization,
  signature: string,
  publicKey: string,
): boolean {
  try {
    return verifier.verify(canonicalAuthorizationBytes(auth), signature, publicKey);
  } catch {
    return false;
  }
}

/** Random 32-byte hex nonce for replay protection. */
export function randomNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
