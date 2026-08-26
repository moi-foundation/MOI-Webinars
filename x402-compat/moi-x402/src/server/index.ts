// MOI server — the seller half.
//
// Its one structural job is to declare the flow. `upfront` tells core that money moves BEFORE the
// conversation, so it should not expect a detached authorization to submit.

import type {
  SchemeNetworkServer, PaymentFlowConfig, PaymentRequirements,
  Price, AssetAmount, Network, SupportedKind,
} from "@x402/core/types";
import { MOI_SCHEME, isMoiNetwork } from "../shared/network.js";

export interface MoiServerOptions {
  /**
   * Decimals per MAS0 asset id, for "$0.10"-style prices.
   *
   * MOI exposes no decimals field on an asset, so there is nothing to look up — a caller who wants
   * dollar pricing must supply this. Leave it empty and prices must be given in atomic units,
   * which is the honest default.
   */
  assetDecimals?: Record<string, number>;
}

export class MoiExactScheme implements SchemeNetworkServer {
  readonly scheme = MOI_SCHEME;

  /** MOI has no on-wire asset transfer method, so this is SDK plumbing only. */
  readonly defaultAssetTransferMethod = "default";

  /**
   * The declaration that makes MOI work without a custom scheme.
   *
   * `upfront` = the buyer settles first and then proves it. Exactly what MOI's signing model
   * allows and x402's `authorization` flow does not.
   */
  readonly paymentFlows: Readonly<Record<string, PaymentFlowConfig>> = {
    default: { supported: ["upfront"] as const, default: "upfront" },
  };

  constructor(private readonly options: MoiServerOptions = {}) {}

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "asset" in price) {
      return price as AssetAmount;
    }
    // A bare number or numeric string is already atomic units — MAS0 amounts are integers.
    const raw = String(price).trim();
    if (/^\d+$/.test(raw)) {
      throw new Error(
        `MOI prices must name their asset. Pass { asset, amount } rather than "${raw}" — ` +
        `MOI has no default stablecoin table, so there is nothing to resolve "${raw}" against.`,
      );
    }
    throw new Error(
      `Dollar-denominated prices are not supported on ${network}. ` +
      `MAS0 assets carry no decimals or symbol on chain, so "$x" cannot be converted without ` +
      `an out-of-band table. Pass { asset, amount } in atomic units instead.`,
    );
  }

  getAssetDecimals(asset: string, _network: Network): number | undefined {
    return this.options.assetDecimals?.[asset];
  }

  async enhancePaymentRequirements(
    requirements: PaymentRequirements,
    _supportedKind: SupportedKind,
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    if (!isMoiNetwork(requirements.network)) {
      throw new Error(`${requirements.network} is not a MOI network`);
    }
    return requirements;
  }
}

export default MoiExactScheme;
