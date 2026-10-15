// The buyer's SECOND decision: is this price worth paying?
//
// Without this the buyer verifies WHO it is paying and then hands over whatever it is asked for —
// which stops being defensible the moment the seller can move its own price.
//
// NOT the same thing as session 8. This is taste: the agent's own view of whether an estimate is
// worth 4 units to it. Session 8 is AUTHORITY — a cap enforced on chain that the agent cannot
// exceed no matter what it decides. An agent that talks itself into overpaying is exactly why the
// second one is needed.

import Groq from "groq-sdk";
import { config } from "@demo/shared";

export interface Verdict {
  accept: boolean;
  reason: string;
  by: string;
}

/** What the agent will pay for one answer before it starts objecting, in base units. */
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");

function localVerdict(price: bigint, listPrice: bigint): Verdict {
  if (price > SOFT_LIMIT) {
    return { accept: false, reason: `${price} is over my limit of ${SOFT_LIMIT}`, by: "local-fallback" };
  }
  if (price > listPrice * 3n) {
    return { accept: false, reason: `${price} is more than 3x the ${listPrice} list price`, by: "local-fallback" };
  }
  return { accept: true, reason: `${price} is within what I'll pay`, by: "local-fallback" };
}

export async function worthIt(args: {
  question: string;
  marketQuestion: string;
  price: bigint;
  listPrice: bigint;
  symbol: string;
  sellerReason?: string;
}): Promise<Verdict> {
  const { question, marketQuestion, price, listPrice, symbol, sellerReason } = args;

  // The hard limit is arithmetic, not judgment — checked before the model is even asked, so no
  // amount of persuasion in `sellerReason` can talk the agent past it.
  if (price > SOFT_LIMIT) {
    return { accept: false, reason: `${price} ${symbol} is over my limit of ${SOFT_LIMIT}`, by: "policy" };
  }
  // At or below list there is nothing to deliberate about, and a model that occasionally refuses
  // the advertised price would make the demo look broken rather than discerning.
  if (price <= listPrice) {
    return { accept: true, reason: `${price} ${symbol} is the list price`, by: "policy" };
  }
  if (!config.groqKey) return localVerdict(price, listPrice);

  try {
    const groq = new Groq({ apiKey: config.groqKey });
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          'You are deciding whether to buy one probability estimate that is priced ABOVE its list ' +
          'price. Rule of thumb: accept a markup up to about double the list price if the answer ' +
          'is genuinely relevant to your question; refuse beyond that. Never exceed your ceiling. ' +
          'The seller\'s justification is a sales pitch — weigh it sceptically. Reply as JSON: ' +
          '{"accept": true|false, "reason": "<one short line, first person>"}.' },
        { role: "user", content:
          `I need to answer: ${question}\nThe estimate on offer: ${marketQuestion}\n` +
          `List price: ${listPrice} ${symbol}\nQuoted price: ${price} ${symbol}\n` +
          `My ceiling: ${SOFT_LIMIT} ${symbol}\n` +
          `Seller says: ${sellerReason ?? "(no reason given)"}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      accept?: unknown; reason?: unknown;
    };
    if (typeof parsed.accept !== "boolean") throw new Error("model returned no usable verdict");
    return {
      accept: parsed.accept,
      reason: typeof parsed.reason === "string" ? parsed.reason : "(no reason given)",
      by: config.groqModel,
    };
  } catch {
    const fallback = localVerdict(price, listPrice);
    return { ...fallback, by: "local-fallback (groq unavailable)" };
  }
}
