/**
 * Signer shapes this mechanism needs.
 *
 * Kept narrow on purpose. A buyer needs to sign a claim and submit a transfer; a facilitator
 * needs neither, because it only reads.
 */

/** What the buyer half needs from a MOI wallet. */
export interface ClientMoiSigner {
  /** The paying account's participant identifier, 0x-prefixed. */
  address: string;
  /** Compressed public key, hex, no 0x prefix. */
  publicKey: string;
  /** Which of the account's keys signs. */
  keyId: number;
  /** A js-moi-sdk wallet, used to sign the claim and to submit the transfer. */
  wallet: {
    signingAlgorithms: { ecdsa_secp256k1: unknown };
    sign(bytes: Uint8Array, keyId: number, algorithm: unknown): Promise<string>;
  };
}

/**
 * Chain reads the facilitator performs.
 *
 * No key material appears here. Under the upfront flow the facilitator confirms a transfer that
 * already settled, so every check it makes is a read.
 */
export interface MoiChainReader {
  /**
   * Verify an ECDSA signature over bytes for a given public key.
   *
   * @param bytes - The signed message.
   * @param signature - The signature to check.
   * @param publicKey - Compressed public key, hex.
   * @returns True when the signature verifies.
   */
  verifySignature(bytes: Uint8Array, signature: string, publicKey: string): boolean;

  /**
   * Derive a participant identifier from a public key.
   *
   * @param publicKey - Compressed public key, hex.
   * @returns The participant identifier.
   */
  identifierFromPublicKey(publicKey: string): string;

  /**
   * Read a settled transfer back off the chain.
   *
   * Both objects are needed: the receipt carries the status but neither the beneficiary nor the
   * amount, and the interaction carries the operation but not whether it succeeded.
   *
   * @param txHash - Interaction hash of the transfer.
   * @returns What the chain says about it, or null when the interaction does not exist.
   */
  readTransfer(txHash: string): Promise<SettledTransferFacts | null>;
}

/** The facts a facilitator compares a claim against. */
export interface SettledTransferFacts {
  /** `interaction.sender.id`. */
  sender: string;
  /** Beneficiary decoded from the operation's POLO calldata. */
  beneficiary: string;
  /** Amount decoded from the operation's POLO calldata. */
  amount: bigint;
  /** `payload.asset_id` of the ASSET_INVOKE operation. */
  assetId: string;
  /** `payload.callsite`. A MAS0 transfer routes to `Transfer`. */
  callsite: string;
  /** True when the interaction-level receipt status is 0. */
  succeeded: boolean;
}
