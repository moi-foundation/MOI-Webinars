// What the seller charges.
//
// `payToAgentId` is the load-bearing field. Without it `payTo` is 32 anonymous bytes and the buyer
// has no way to tell the real Signal Desk from someone who edited the listing.

import { config, NETWORK, type Quote } from "@demo/shared";

export function buildQuote(resource: string, payTo: string, question: string): Quote {
  return {
    price: config.price.toString(),
    symbol: config.assetSymbol,
    asset: config.assetId,
    payTo,
    ...(config.sellerAgentId ? { payToAgentId: config.sellerAgentId } : {}),
    resource,
    description: `Probability estimate for: ${question}`,
    network: NETWORK,
    ttlSeconds: config.authTtlSeconds,
  };
}
