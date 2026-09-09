/**
 * The statement a buyer signs after paying.
 *
 * MOI settles before it proves, so this claim names a transfer that already happened and binds
 * it to one request. Without the binding, a transfer hash lifted off the public chain could be
 * redeemed by anyone watching.
 */
export interface MoiPaymentClaim {
  /** The paying account's participant identifier. */
  from: string;
  /** The payee. Must equal `requirements.payTo`. */
  to: string;
  /** MAS0 asset identifier. */
  asset: string;
  /** Atomic units, decimal string. */
  value: string;
  /** Interaction hash of the transfer the buyer already submitted. */
  txHash: string;
  /** URL of the resource being bought. Binds this payment to one request. */
  resource: string;
  /** Unix seconds. */
  validAfter: string;
  /** Unix seconds. */
  validBefore: string;
  /** 32 random bytes. Distinguishes two claims over the same transfer. */
  nonce: string;
}

/** What travels in `PaymentPayload.payload` for this mechanism. */
export interface MoiPaymentPayload extends Record<string, unknown> {
  /** Compressed public key, hex, no 0x prefix. */
  publicKey: string;
  /** Which of the account's keys signed. Informational. */
  keyId: number;
  /** ECDSA secp256k1 over the canonical claim bytes. */
  signature: string;
  claim: MoiPaymentClaim;
}

/** What a facilitator reads back off the chain for one settled transfer. */
export interface SettledTransfer {
  sender: string;
  beneficiary: string;
  amount: bigint;
  assetId: string;
  callsite: string;
  succeeded: boolean;
}
