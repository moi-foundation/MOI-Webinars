// The seller's SECOND brain: what to charge, decided per request.
//
// This is what makes the Signal Desk an agent rather than a price list. It looks at what is being
// asked for and how much of it it has already sold today, and sets a number. Nobody configured
// that number; it is a commercial judgment the desk makes and the buyer can refuse.
//
// TWO THINGS ARE DELIBERATELY NOT THE MODEL'S TO DECIDE:
//   - the bounds. listPrice/maxPrice come from the catalog and are clamped in code, so a confused
//     model cannot quote 0 or 10,000.
//   - whether a payment is valid. That is verify-proof.ts, and it is arithmetic. A model that can
//     be argued with must never sit on the security path.

import Groq from "groq-sdk";
import { config } from "@demo/shared";
import type { Market } from "./catalog.js";

export interface PriceDecision {
  price: bigint;
  reason: string;
  by: string;
}

/**
 * How high the desk is willing to go given today's demand. The MODEL picks a number inside this
 * band; the band itself is arithmetic.
 *
 * Two reasons it is not the model's to choose. A first sale must be at list price or the buyer
 * refuses and the demo never gets past the quote. And a price that jumps around instead of rising
 * with demand looks broken rather than clever.
 */
function ceilingFor(market: Market, soldToday: number): bigint {
  const band = market.listPrice + BigInt(Math.floor(soldToday / 2));
  return band > market.maxPrice ? market.maxPrice : band;
}

/** Used when there is no model: take the top of the band. */
function localPrice(market: Market, soldToday: number): PriceDecision {
  const price = ceilingFor(market, soldToday);
  return {
    price,
    reason: soldToday === 0
      ? "list price — I don't mark up a first sale"
      : `${soldToday} sold already, so I'm asking ${price}`,
    by: "local-fallback",
  };
}

export async function decidePrice(market: Market, soldToday: number): Promise<PriceDecision> {
  if (!config.groqKey) return localPrice(market, soldToday);

  const ceiling = ceilingFor(market, soldToday);
  // No room to negotiate: don't spend a model call deciding between one option.
  if (ceiling === market.listPrice) return localPrice(market, soldToday);

  try {
    const groq = new Groq({ apiKey: config.groqKey });
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          'You run a prediction desk and are setting the price for one answer. Charge more when ' +
          'the question is harder to call, shorter-dated, or in demand today. Charge less to win ' +
          'a first sale. You must stay within the given bounds. Reply as JSON: ' +
          '{"price": <integer within bounds>, "reason": "<one short line, first person>"}.' },
        { role: "user", content:
          `Market: ${market.question}\nHorizon: ${market.horizon}\n` +
          `Your list price: ${market.listPrice}\nMost you may charge right now: ${ceiling}\n` +
          `Copies sold today: ${soldToday}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      price?: unknown; reason?: unknown;
    };
    const n = Number(parsed.price);
    if (!Number.isFinite(n)) throw new Error("model returned no usable price");

    // Clamp, always. The model proposes; the catalog decides what is allowed.
    let price = BigInt(Math.round(n));
    if (price < market.listPrice) price = market.listPrice;
    if (price > ceiling) price = ceiling;

    return {
      price,
      reason: typeof parsed.reason === "string" ? parsed.reason : "priced on demand",
      by: config.groqModel,
    };
  } catch {
    const fallback = localPrice(market, soldToday);
    return { ...fallback, by: "local-fallback (groq unavailable)" };
  }
}
