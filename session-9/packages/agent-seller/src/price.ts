// What the seller charges — now expressed as an x402 PaymentRequirements.
//
// Same numbers as session 8, different envelope. The price still comes from the CATALOG, not from
// config, because each market carries its own.
//
// `extra.payToAgentId` is the field that matters most and the one x402 has no place for. The spec
// tells a client WHERE to send money. It has no opinion on WHOSE address that is. So the seller's
// agent id rides in `extra`, which the spec types as an open record — a compliant parser reads
// what it knows and ignores the rest, and a MOI-aware buyer gets what it needs to check the
// registry before paying.

import { config, SCHEME, X402_NETWORK, type PaymentRequirements } from "@demo/shared";

export interface Priced {
  question: string;
  price: bigint;
  listPrice: bigint;
  priceReason: string;
  pricedBy: string;
}

export function buildRequirements(
  resource: string,
  payTo: string,
  item: Priced,
): PaymentRequirements {
  return {
    scheme: SCHEME,
    network: X402_NETWORK,
    maxAmountRequired: item.price.toString(),
    resource,
    description: `Probability estimate for: ${item.question}`,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: config.authTtlSeconds,
    asset: config.assetId,
    extra: {
      symbol: config.assetSymbol,
      ...(config.sellerAgentId ? { payToAgentId: config.sellerAgentId } : {}),
      listPrice: item.listPrice.toString(),
    },
  };
}

/** Kept for the console narration — the seller still explains its markup out loud. */
export const priceNarration = (item: Priced): { reason: string; by: string } => ({
  reason: item.priceReason,
  by: item.pricedBy,
});
