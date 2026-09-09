import { MAS0AssetLogic } from "js-moi-sdk";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { DEFAULT_CLAIM_TIMEOUT_SECONDS, MOI_SCHEME } from "../../constants.js";
import { canonicalClaimBytes, nowSeconds, randomNonce } from "../../shared.js";
import type { ClientMoiSigner } from "../../signer.js";
import type { MoiPaymentClaim, MoiPaymentPayload } from "../../types.js";
import { toBigInt } from "../../utils.js";

/** Options for the buyer half. */
export interface ExactMoiClientOptions {
  /** Fuel limit for the transfer the buyer submits. */
  fuelLimit?: number;
}

/**
 * The buyer half of `exact` on MOI.
 *
 * Under the upfront flow the buyer settles first and proves afterwards, so this class submits a
 * MAS0 transfer from its own account and then signs a claim naming it. There is no detached
 * authorization to hand over: a MOI interaction is signed whole by whoever submits it.
 */
export class ExactMoiScheme implements SchemeNetworkClient {
  readonly scheme = MOI_SCHEME;

  /**
   * @param signer - The paying account.
   * @param options - Transfer options.
   */
  constructor(
    private readonly signer: ClientMoiSigner,
    private readonly options: ExactMoiClientOptions = {},
  ) {}

  /**
   * Settle a MAS0 transfer, then sign a claim naming it.
   *
   * @param x402Version - Protocol version echoed back into the payload.
   * @param paymentRequirements - What the seller quoted.
   * @returns The payload for the PAYMENT-SIGNATURE header.
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    const resource = this.requireResource(paymentRequirements);
    const amount = toBigInt(paymentRequirements.amount);

    const asset = new MAS0AssetLogic(paymentRequirements.asset, this.signer.wallet as never);
    const interaction = await asset
      .transfer(paymentRequirements.payTo, amount as never)
      .send({ fuel_limit: this.options.fuelLimit ?? 20_000 } as never);

    const result = (await interaction.result()) as { error?: unknown } | undefined;
    if (result?.error) {
      throw new Error(`MOI transfer reverted: ${JSON.stringify(result.error)}`);
    }

    // The window has to fit inside what the seller quoted. A claim whose validBefore runs past
    // maxTimeoutSeconds is rejected by the facilitator, so it is clamped rather than sent.
    const timeout = paymentRequirements.maxTimeoutSeconds || DEFAULT_CLAIM_TIMEOUT_SECONDS;
    const validAfter = nowSeconds();

    const claim: MoiPaymentClaim = {
      from: this.signer.address,
      to: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      value: amount.toString(),
      txHash: interaction.hash,
      resource,
      validAfter: String(validAfter),
      validBefore: String(validAfter + timeout),
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

  /**
   * Read the resource URL the seller put in `extra`.
   *
   * The claim binds a payment to one resource, and the facilitator enforces that binding, so a
   * payload without it would settle nothing. `PaymentPayloadContext` does not carry the
   * ResourceInfo, so the seller's scheme copies the URL into `extra.resource` for the buyer to
   * sign over.
   *
   * @param paymentRequirements - What the seller quoted.
   * @returns The resource URL.
   */
  private requireResource(paymentRequirements: PaymentRequirements): string {
    const resource = (paymentRequirements.extra as Record<string, unknown> | undefined)?.resource;
    if (typeof resource !== "string" || resource === "") {
      throw new Error(
        "PaymentRequirements.extra.resource is missing. The MOI scheme binds each payment to " +
          "one resource, and the seller's scheme populates this field. Without it the " +
          "facilitator cannot check the binding and will reject the settlement.",
      );
    }
    return resource;
  }
}
