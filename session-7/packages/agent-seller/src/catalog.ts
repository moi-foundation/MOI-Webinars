// The Signal Desk's markets, and what it charges for each.
//
// The paywall sits exactly on the seam that matters: the QUESTION is public, the ANSWER is not.
// A buyer has to be able to see what is on offer — and what it costs — to decide whether it wants
// it, so listing the markets and their prices is free. The probability is the product.
//
// The seller sets these prices. Nothing in the protocol or the buyer's config decides them: the
// buyer is told the price at request time and can take it or leave it.

export interface Market {
  id: string;
  question: string;
  /** How far out the question resolves. */
  horizon: string;
  /** What this one answer costs, in base units of the settlement asset. */
  price: bigint;
  topics: string[];
}

export const MARKETS: Market[] = [
  // Cheapest: a long horizon and a round number, so the desk has little edge to sell.
  { id: "btc-100k-2026", question: "Will BTC trade above $100,000 before 31 Dec 2026?",
    horizon: "long-term", price: 1n, topics: ["bitcoin", "price", "target"] },
  { id: "btc-up-7d", question: "Will BTC close higher 7 days from now?",
    horizon: "1 week", price: 2n, topics: ["bitcoin", "momentum", "short-term"] },
  // Dearest: this is the one people actually hedge against.
  { id: "btc-drawdown-20", question: "Will BTC draw down more than 20% this quarter?",
    horizon: "1 quarter", price: 3n, topics: ["bitcoin", "risk", "drawdown"] },
  { id: "btc-vol-spike", question: "Will 30-day realised volatility exceed 80% this month?",
    horizon: "1 month", price: 2n, topics: ["bitcoin", "volatility", "risk"] },
];

export const findMarket = (id: string): Market | undefined =>
  MARKETS.find((m) => m.id.toLowerCase() === id.toLowerCase());

/** JSON has no bigint, so prices go over the wire as decimal strings. */
export const catalogJson = () =>
  MARKETS.map((m) => ({ ...m, price: m.price.toString() }));
