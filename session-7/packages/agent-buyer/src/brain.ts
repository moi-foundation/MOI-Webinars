// The Reader agent's brain — what makes it an agent rather than a curl.
//
// Given a research question and a catalog it just discovered, it picks which book to buy.
// Falls back to keyword matching when GROQ_API_KEY is absent, and says which path decided.

import Groq from "groq-sdk";
import { config } from "@demo/shared";

export interface CatalogBook {
  id: string; title: string; author: string; year: number; topics: string[];
}

export interface Choice {
  bookId: string;
  reason: string;
  by: string;
}

/** Keyword overlap between the question and each book's topics/title. */
function localPick(question: string, catalog: CatalogBook[]): Choice {
  const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let best = catalog[0]!;
  let bestScore = -1;
  for (const book of catalog) {
    const hay = `${book.title} ${book.author} ${book.topics.join(" ")}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = book; }
  }
  return {
    bookId: best.id,
    reason: bestScore > 0
      ? `topic overlap with "${question}"`
      : `no strong match; defaulting to ${best.title}`,
    by: "local-fallback",
  };
}

export async function chooseBook(question: string, catalog: CatalogBook[]): Promise<Choice> {
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
          'Pick the single best book for the question from the catalog. Reply as JSON: ' +
          '{"bookId": "<id from the catalog>", "reason": "<one short line>"}.' },
        { role: "user", content:
          `Question: ${question}\nCatalog: ${JSON.stringify(catalog.map((b) => ({
            id: b.id, title: b.title, author: b.author, topics: b.topics,
          })))}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      bookId?: string; reason?: string;
    };
    const chosen = catalog.find((b) => b.id === parsed.bookId);
    if (!chosen) throw new Error(`model picked an unknown book: ${parsed.bookId}`);
    return { bookId: chosen.id, reason: parsed.reason ?? "(no reason given)", by: config.groqModel };
  } catch {
    const fallback = localPick(question, catalog);
    return { ...fallback, by: "local-fallback (groq unavailable)" };
  }
}
