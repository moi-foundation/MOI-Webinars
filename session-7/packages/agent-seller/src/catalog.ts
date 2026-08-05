// The Signal Desk's markets, and the bounds it prices within.
//
// The paywall sits exactly on the seam that matters: the QUESTION is public, the ANSWER is not.
//
// Note there is no single "price" here. `listPrice` is where the desk starts and `maxPrice` is how
// far it will push — the actual number quoted is a decision its brain makes per request, in
// pricing.ts. Bounds live in code so a model can never quote zero or something absurd.

export interface Market {
  id: string;
  question: string;
  /** How far out the question resolves. */
  horizon: string;
  /** The desk's opening price, in base units of the settlement asset. */
  listPrice: bigint;
  /** The most it will ever quote, however hot demand gets. */
  maxPrice: bigint;
  topics: string[];
}

export const MARKETS: Market[] = [
  // Cheapest: a long horizon and a round number, so the desk has little edge to sell.
  { id: "btc-100k-2026", question: "Will BTC trade above $100,000 before 31 Dec 2026?",
    horizon: "long-term", listPrice: 1n, maxPrice: 3n, topics: ["bitcoin", "price", "target"] },
  { id: "btc-up-7d", question: "Will BTC close higher 7 days from now?",
    horizon: "1 week", listPrice: 2n, maxPrice: 5n, topics: ["bitcoin", "momentum", "short-term"] },
  // Dearest: the one people actually hedge against, so demand moves the price most.
  { id: "btc-drawdown-20", question: "Will BTC draw down more than 20% this quarter?",
    horizon: "1 quarter", listPrice: 3n, maxPrice: 9n, topics: ["bitcoin", "risk", "drawdown"] },
  { id: "btc-vol-spike", question: "Will 30-day realised volatility exceed 80% this month?",
    horizon: "1 month", listPrice: 2n, maxPrice: 6n, topics: ["bitcoin", "volatility", "risk"] },
];

export const findMarket = (id: string): Market | undefined =>
  MARKETS.find((m) => m.id.toLowerCase() === id.toLowerCase());

/** JSON has no bigint, so prices go over the wire as decimal strings. */
export const catalogJson = () =>
  MARKETS.map((m) => ({
    ...m,
    listPrice: m.listPrice.toString(),
    maxPrice: m.maxPrice.toString(),
  }));
