// The Risk Agent's brain — what makes it an agent rather than a curl.
//
// Given a question and a catalog it just discovered, it picks which market to buy an estimate for.
// Falls back to keyword matching when GROQ_API_KEY is absent, and says which path decided.
//
// Note what this does NOT do: it has no say in whether to pay. That decision is `approve()` in
// index.ts — identity and asset checks, deterministic. A model choosing what to buy is useful; a
// model deciding whether a payment is safe would make every security claim in this demo worthless.

import Groq from "groq-sdk";
import { config } from "@demo/shared";

export interface CatalogMarket {
  id: string;
  question: string;
  horizon: string;
  /** The seller's opening price, base units, decimal string. What it actually quotes may differ. */
  listPrice: string;
  maxPrice: string;
  topics: string[];
}

export interface Choice {
  marketId: string;
  reason: string;
  by: string;
}

/** Keyword overlap between the question and each market's id/question/topics. */
function localPick(question: string, catalog: CatalogMarket[]): Choice {
  const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let best = catalog[0]!;
  let bestScore = -1;
  for (const market of catalog) {
    const hay = `${market.id} ${market.question} ${market.topics.join(" ")}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = market; }
  }
  return {
    marketId: best.id,
    reason: bestScore > 0
      ? `keyword overlap with "${question}"`
      : `no strong match; defaulting to ${best.id}`,
    by: "local-fallback",
  };
}

export async function chooseMarket(question: string, catalog: CatalogMarket[]): Promise<Choice> {
  if (catalog.length === 0) throw new Error("empty catalog");
  if (!config.groqKey) return localPick(question, catalog);

  try {
    const groq = new Groq({ apiKey: config.groqKey });
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          'Pick the single market whose resolution best answers the question. Reply as JSON: ' +
          '{"marketId": "<id from the catalog>", "reason": "<one short line>"}.' },
        { role: "user", content:
          `Question: ${question}\nMarkets: ${JSON.stringify(catalog.map((m) => ({
            id: m.id, question: m.question, horizon: m.horizon, from: m.listPrice, topics: m.topics,
          })))}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      marketId?: string; reason?: string;
    };
    const chosen = catalog.find((m) => m.id === parsed.marketId);
    if (!chosen) throw new Error(`model picked an unknown market: ${parsed.marketId}`);
    return { marketId: chosen.id, reason: parsed.reason ?? "(no reason given)", by: config.groqModel };
  } catch {
    const fallback = localPick(question, catalog);
    return { ...fallback, by: "local-fallback (groq unavailable)" };
  }
}
