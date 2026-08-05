// What the seller charges, and which facilitator it trusts.
//
// Pointing `facilitator` at our MOI service is the ONLY MOI-specific line in the seller's config.
// Everything else is stock x402 vocabulary — which is the whole point.

import { config, SCHEME, NETWORK, type PaymentRequirements } from "@demo/shared";

export function buildRequirements(resource: string, payTo: string, title: string): PaymentRequirements {
  return {
    scheme: SCHEME,
    network: NETWORK,
    maxAmountRequired: config.price.toString(),
    resource,
    description: `Full summary and key ideas of "${title}".`,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: config.assetId,
    extra: {
      symbol: config.assetSymbol,
      ...(config.sellerAgentId ? { payToAgentId: config.sellerAgentId } : {}),
    },
  };
}
