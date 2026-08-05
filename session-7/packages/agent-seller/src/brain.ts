// The Bookseller's brain. Groq writes the thing you actually paid for: a genuine summary of the
// book, not a blurb it could have given away for free.
//
// Falls back to a canned summary when GROQ_API_KEY is absent, and SAYS SO — a fallback must never
// be mistaken for a model call.

import Groq from "groq-sdk";
import { config } from "@demo/shared";
import type { Book } from "./catalog.js";

export interface Delivery {
  id: string;
  title: string;
  author: string;
  year: number;
  summary: string;
  keyIdeas: string[];
  writtenBy: string;
  deliveredAt: string;
}

const CANNED: Record<string, { summary: string; keyIdeas: string[] }> = {
  "moby-dick": {
    summary: "A whaling captain's pursuit of the white whale that maimed him destroys his ship and crew.",
    keyIdeas: ["Obsession as self-destruction", "Nature as indifferent, not hostile", "The limits of vengeance"],
  },
  "on-the-origin": {
    summary: "Species change over time through natural selection acting on inherited variation.",
    keyIdeas: ["Descent with modification", "Selection needs no designer", "Deep time makes small changes large"],
  },
  "the-prince": {
    summary: "A pragmatic manual on acquiring and holding political power, judged by results rather than virtue.",
    keyIdeas: ["Appearances govern politics", "Fortune favours decisiveness", "Feared beats loved, if you must choose"],
  },
  meditations: {
    summary: "Private notes of a Roman emperor practising Stoic self-discipline and acceptance.",
    keyIdeas: ["Control what is yours to control", "Judgement, not events, causes distress", "Death frames the day"],
  },
};

export async function deliverBook(book: Book): Promise<Delivery> {
  const base = {
    id: book.id, title: book.title, author: book.author, year: book.year,
    deliveredAt: new Date().toISOString(),
  };
  const fallback = CANNED[book.id] ?? {
    summary: `${book.title} by ${book.author}.`,
    keyIdeas: book.topics,
  };

  if (!config.groqKey) {
    return { ...base, ...fallback, writtenBy: "local-fallback (no GROQ_API_KEY)" };
  }

  try {
    const groq = new Groq({ apiKey: config.groqKey });
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          'Summarise a book for a reader who has not read it. Reply as JSON: ' +
          '{"summary": "<2 sentences>", "keyIdeas": ["<idea>", "<idea>", "<idea>"]}.' },
        { role: "user", content: `${book.title} by ${book.author} (${book.year}).` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      summary?: string; keyIdeas?: string[];
    };
    if (!parsed.summary) throw new Error("model returned no summary");
    return {
      ...base,
      summary: parsed.summary,
      keyIdeas: Array.isArray(parsed.keyIdeas) ? parsed.keyIdeas : fallback.keyIdeas,
      writtenBy: config.groqModel,
    };
  } catch {
    // Never fail a PAID request because the model is down — deliver something and label it.
    return { ...base, ...fallback, writtenBy: "local-fallback (groq unavailable)" };
  }
}
