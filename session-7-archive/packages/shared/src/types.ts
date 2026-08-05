// The x402 wire types, widened for MOI.
//
// x402@1.2.0 ships these as zod schemas whose `network` is a CLOSED enum and whose `scheme` is
// exactly ["exact"] — neither can express MOI. See SDK_NOTES.md §5. We keep the *shapes*
// byte-identical to the spec so the HTTP traffic is real x402, and only widen the two string
// fields. Anything reading these off the wire (including a stock x402 client) sees a
// spec-shaped envelope.

/** Our MOI scheme id. "exact" semantics — an exact amount of one MAS0 asset. */
export const MOI_SCHEME = "exact-mas0" as const;

/** Network id for MOI Voyage devnet. */
export const MOI_NETWORK = "moi-devnet" as const;

export const X402_VERSION = 1 as const;

/**
 * Returned in the HTTP 402 body under `accepts[]`. Field names and semantics are the x402 spec's
 * `PaymentRequirements`; `scheme`/`network` carry our MOI values.
 */
export interface MoiPaymentRequirements {
  scheme: typeof MOI_SCHEME;
  network: typeof MOI_NETWORK;
  /** Atomic units of `asset`, as a decimal string. */
  maxAmountRequired: string;
  /** Canonical URL of the paid resource. */
  resource: string;
  description: string;
  mimeType: string;
  /** MOI participant identifier of the SELLER. 0x + 32 bytes. */
  payTo: string;
  maxTimeoutSeconds: number;
  /** MAS0 asset id. 0x + 32 bytes. */
  asset: string;
  /** MOI-specific hints the buyer needs in order to sign. */
  extra: MoiPaymentExtra;
}

export interface MoiPaymentExtra {
  /** Symbol of the MAS0 asset, for human-readable logs. e.g. "USDM" */
  symbol: string;
  decimals: number;
  /**
   * The facilitator's own MOI identifier. The buyer must have `approve`d this account to spend
   * `asset` on its behalf — it is the account that executes the settlement transfer.
   */
  facilitator: string;
  /** Seller's on-chain agent-registry id, so the buyer can verify who it is paying. */
  payToAgentId?: string;
  /** True when the seller wants escrowed pay-on-delivery (Tier 2). */
  escrow?: boolean;
}

/**
 * What the buyer signs. Serialized canonically (see canonicalAuthorizationBytes) and signed with
 * `wallet.sign()`. This is the MOI analogue of x402's EIP-3009 authorization.
 */
export interface MoiPaymentAuthorization {
  /** Payer's MOI participant identifier. MUST derive from `publicKey`. */
  from: string;
  /** Payee's MOI participant identifier. MUST equal requirements.payTo. */
  to: string;
  /** MAS0 asset id. MUST equal requirements.asset. */
  asset: string;
  /** Atomic units, decimal string. MUST be <= requirements.maxAmountRequired. */
  value: string;
  /** Unix seconds. Authorization is invalid before this. */
  validAfter: string;
  /** Unix seconds. Authorization is invalid after this. */
  validBefore: string;
  /** Random 32-byte hex, replay protection. */
  nonce: string;
  /** Canonical URL of the resource being paid for — binds the payment to what was bought. */
  resource: string;
}

/** The MOI payload carried inside the base64 `X-Payment` header. */
export interface MoiPaymentPayload {
  x402Version: typeof X402_VERSION;
  scheme: typeof MOI_SCHEME;
  network: typeof MOI_NETWORK;
  payload: {
    /** Compressed secp256k1 public key, hex, NO 0x prefix (js-moi-sdk convention). */
    publicKey: string;
    keyId: number;
    /** Hex signature from `wallet.sign()`. */
    signature: string;
    authorization: MoiPaymentAuthorization;
  };
}

/** Facilitator `POST /verify` request body — same envelope x402's useFacilitator sends. */
export interface VerifyRequest {
  x402Version: number;
  paymentPayload: MoiPaymentPayload;
  paymentRequirements: MoiPaymentRequirements;
}

/** Facilitator `POST /verify` response — x402 spec shape. */
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  /** The payer, echoed back once proven. */
  payer?: string;
  /** MOI-specific detail, surfaced for demo logging. */
  checks?: VerificationCheck[];
}

/** One named check in the facilitator's verification chain — printed live during the demo. */
export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export type SettleRequest = VerifyRequest;

/** Facilitator `POST /settle` response — x402 spec shape. `transaction` is our MOI ix hash. */
export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  /** MOI interaction hash — the receipt. */
  transaction?: string;
  network: typeof MOI_NETWORK;
  payer?: string;
}

/** Body of the HTTP 402 response. x402 spec shape. */
export interface PaymentRequiredResponse {
  x402Version: number;
  accepts: MoiPaymentRequirements[];
  error?: string;
}

/** Decoded from the `X-Payment-Response` header the seller returns on success. */
export interface PaymentResponseHeader {
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
}
