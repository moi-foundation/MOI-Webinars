// What the seller charges for the thing being requested.
//
// The price comes from the CATALOG, not from config — each market carries its own. `config.price`
// is only the fallback for a route with no catalog entry behind it.
//
// `payToAgentId` is the other load-bearing field. Without it `payTo` is 32 anonymous bytes and the
// buyer has no way to tell the real Signal Desk from someone who edited the listing.

import { config, NETWORK, type Quote } from "@demo/shared";

export interface Priced {
  question: string;
  price: bigint;
}

export function buildQuote(resource: string, payTo: string, item: Priced): Quote {
  return {
    price: item.price.toString(),
    symbol: config.assetSymbol,
    asset: config.assetId,
    payTo,
    ...(config.sellerAgentId ? { payToAgentId: config.sellerAgentId } : {}),
    resource,
    description: `Probability estimate for: ${item.question}`,
    network: NETWORK,
    ttlSeconds: config.authTtlSeconds,
  };
}
