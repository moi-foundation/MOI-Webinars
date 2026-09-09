import type {
  AssetAmount,
  Network,
  PaymentFlowConfig,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  SchemePaymentRequiredContext,
  SupportedKind,
} from "@x402/core/types";
import { MOI_SCHEME } from "../../constants.js";
import { isMoiNetwork } from "../../utils.js";

/** Options for the seller half. */
export interface ExactMoiServerOptions {
  /**
   * Decimals per MAS0 asset id, for prices written as money.
   *
   * MOI exposes no decimals on an asset, so there is nothing to look up. A caller who wants
   * dollar pricing supplies the mapping here; leaving it empty means prices are quoted in atomic
   * units, which is the honest default.
   */
  assetDecimals?: Record<string, number>;
}

/**
 * The seller half of `exact` on MOI.
 *
 * Two jobs. It declares the payment flow, which is what lets core drive an upfront mechanism
 * without scheme-specific knowledge. And it copies the resource URL into `extra` so the buyer
 * can sign over it, because the buyer's half never sees the ResourceInfo.
 */
export class ExactMoiScheme implements SchemeNetworkServer {
  readonly scheme = MOI_SCHEME;

  /**
   * MOI offers one way to move a MAS0 asset, so there is no on-wire choice of transfer method.
   * The interface documents `"default"` for exactly this case, and core strips the key from the
   * wire when it is used.
   */
  readonly defaultAssetTransferMethod = "default";

  /**
   * Upfront only.
   *
   * A MOI interaction is signed whole by the account submitting it, so there is no detached
   * authorization for a facilitator to submit later. Core reads this and writes
   * `extra.paymentFlow` onto the wire itself, since the flow is not `authorization`.
   */
  readonly paymentFlows = {
    default: { supported: ["upfront"], default: "upfront" },
  } as const satisfies Record<string, PaymentFlowConfig>;

  /** Fields this scheme adds to `extra` after the requirements are first built. */
  readonly dynamicExtraFields = ["resource"];

  /**
   * @param options - Server options.
   */
  constructor(private readonly options: ExactMoiServerOptions = {}) {}

  /**
   * Decimals for an asset, when the caller supplied them.
   *
   * @param asset - MAS0 asset identifier.
   * @param _network - Unused; decimals are per asset, not per network.
   * @returns The decimals, or undefined when unknown.
   */
  getAssetDecimals(asset: string, _network: Network): number | undefined {
    return this.options.assetDecimals?.[asset];
  }

  /**
   * Turn a price into an asset amount.
   *
   * @param price - The configured price.
   * @param network - The network being quoted.
   * @returns The asset and atomic amount.
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "asset" in price) {
      return price as AssetAmount;
    }
    throw new Error(
      `Prices on ${network} must name their asset: pass { asset, amount } in atomic units. ` +
        "MAS0 assets carry no decimals or symbol on chain, so a money string cannot be " +
        "converted without an out-of-band table.",
    );
  }

  /**
   * Reject requirements that do not name a MOI network.
   *
   * @param paymentRequirements - The requirements being built.
   * @param _supportedKind - Unused.
   * @param _facilitatorExtensions - Unused.
   * @returns The requirements, unchanged.
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: SupportedKind,
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    if (!isMoiNetwork(paymentRequirements.network)) {
      throw new Error(`${paymentRequirements.network} is not a MOI network`);
    }
    return paymentRequirements;
  }

  /**
   * Copy the resource URL into `extra` so the buyer can sign over it.
   *
   * This hook is the only place a scheme sees the ResourceInfo. The buyer needs the URL to build
   * its claim and the facilitator compares that claim against the authoritative
   * `PaymentPayload.resource`, so without this step the binding cannot be checked.
   *
   * @param context - The payment-required context, carrying the ResourceInfo.
   * @returns Requirements with `extra.resource` populated.
   */
  async enrichPaymentRequiredResponse(
    context: SchemePaymentRequiredContext,
  ): Promise<PaymentRequirements[]> {
    const resource = context.resourceInfo?.url;
    return context.requirements.map(requirement =>
      requirement.scheme === this.scheme && isMoiNetwork(requirement.network) && resource
        ? { ...requirement, extra: { ...requirement.extra, resource } }
        : requirement,
    );
  }
}
