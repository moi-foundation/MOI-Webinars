// The Signal Desk's markets. Free to browse — you only pay for the number.
//
// The paywall sits exactly on the seam that matters: the QUESTION is public, the ANSWER is not.
// A buyer has to be able to see what is on offer to decide whether it wants it, so listing the
// markets costs nothing. The probability is the product.

export interface Market {
  id: string;
  question: string;
  /** How far out the question resolves. */
  horizon: string;
  topics: string[];
}

export const MARKETS: Market[] = [
  { id: "btc-100k-2026", question: "Will BTC trade above $100,000 before 31 Dec 2026?",
    horizon: "long-term", topics: ["bitcoin", "price", "target"] },
  { id: "btc-up-7d", question: "Will BTC close higher 7 days from now?",
    horizon: "1 week", topics: ["bitcoin", "momentum", "short-term"] },
  { id: "btc-drawdown-20", question: "Will BTC draw down more than 20% this quarter?",
    horizon: "1 quarter", topics: ["bitcoin", "risk", "drawdown"] },
  { id: "btc-vol-spike", question: "Will 30-day realised volatility exceed 80% this month?",
    horizon: "1 month", topics: ["bitcoin", "volatility", "risk"] },
];

export const findMarket = (id: string): Market | undefined =>
  MARKETS.find((m) => m.id.toLowerCase() === id.toLowerCase());
