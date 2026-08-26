// MOI client — the buyer half.
//
// x402's `authorization` flow signs a detached permission slip for someone else to submit. MOI
// cannot do that: an interaction is signed whole, so there is nothing detachable to hand over.
//
// MOI therefore uses the `upfront` flow. The buyer SETTLES FIRST from its own account, then signs
// a claim naming that settled transfer. By the time the seller sees anything, the money has moved.

import { MAS0AssetLogic } from "js-moi-sdk";
import type {
  SchemeNetworkClient, PaymentRequirements, PaymentPayloadResult, PaymentPayloadContext,
} from "@x402/core/types";
import { MOI_SCHEME } from "../shared/network.js";
import {
  canonicalClaimBytes, nowSeconds, randomNonce,
  type MoiPaymentClaim, type MoiPaymentPayload,
} from "../shared/claim.js";

/** The minimum a MOI wallet must provide for this mechanism. Kept narrow deliberately. */
export interface MoiClientSigner {
  /** The paying account's participant identifier, 0x-prefixed. */
  address: string;
  publicKey: string;
  keyId: number;
  wallet: {
    signingAlgorithms: { ecdsa_secp256k1: unknown };
    sign(bytes: Uint8Array, keyId: number, algo: unknown): Promise<string>;
  };
}

export interface MoiClientOptions {
  /**
   * Whose balance the payment comes out of.
   *
   * Omit and the buyer spends its own funds. Set it and the buyer pays with `transferFrom`
   * against an allowance the benefactor granted — so the cap is enforced by the chain rather than
   * by client config. x402's own `spendControls` are a client-side setting the agent can disable;
   * this is not.
   */
  benefactor?: string;
  fuelLimit?: number;
}

export class MoiExactScheme implements SchemeNetworkClient {
  readonly scheme = MOI_SCHEME;

  constructor(
    private readonly signer: MoiClientSigner,
    private readonly options: MoiClientOptions = {},
  ) {}

  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const amount = BigInt(requirements.amount);
    const asset = new MAS0AssetLogic(requirements.asset, this.signer.wallet as never);
    const send = { fuel_limit: this.options.fuelLimit ?? 20_000 };

    // ── settle first ─────────────────────────────────────────────────────────────────────
    // If a benefactor is set this is a pull against their on-chain allowance. Over the cap, the
    // chain refuses and nothing moves — which is the point of doing it this way.
    const ix = this.options.benefactor
      ? await asset
          .transferFrom(this.options.benefactor, requirements.payTo, Number(amount))
          .send(send)
      : await asset.transfer(requirements.payTo, Number(amount)).send(send);

    const result = (await ix.result()) as unknown as { error?: unknown };
    if (result?.error) {
      throw new Error(`MOI transfer reverted: ${JSON.stringify(result.error)}`);
    }

    // ── then prove it ────────────────────────────────────────────────────────────────────
    const now = nowSeconds();
    const claim: MoiPaymentClaim = {
      from: this.signer.address,
      to: requirements.payTo,
      asset: requirements.asset,
      value: amount.toString(),
      txHash: ix.hash,
      resource: String((requirements.extra as Record<string, unknown>)?.resource ?? ""),
      validAfter: String(now - 5),   // absorb clock skew between two agents
      validBefore: String(now + (requirements.maxTimeoutSeconds || 120)),
      nonce: randomNonce(),
    };

    const signature = await this.signer.wallet.sign(
      canonicalClaimBytes(claim),
      this.signer.keyId,
      this.signer.wallet.signingAlgorithms.ecdsa_secp256k1,
    );

    const payload: MoiPaymentPayload = {
      publicKey: this.signer.publicKey,
      keyId: this.signer.keyId,
      signature,
      claim,
    };

    return { x402Version, payload };
  }
}

export default MoiExactScheme;
