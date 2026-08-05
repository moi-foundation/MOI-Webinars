// The Signal Desk's brain. It produces the number you actually paid for.
//
// ⚠️ THESE PROBABILITIES ARE MADE UP. There is no model, no market data and no backtest behind
// them — this is a placeholder payload so the payment protocol has something to carry. Every
// estimate ships with a `disclaimer` field saying so, and that field is not decoration: a demo
// that emits plausible-looking financial numbers without one is how a toy gets mistaken for a
// signal. If this ever gets a real model, that is the moment to revisit the wording, not before.
//
// Falls back to a canned value when GROQ_API_KEY is absent, and SAYS SO — a fallback must never be
// mistaken for a model call.

import Groq from "groq-sdk";
import { config } from "@demo/shared";
import type { Market } from "./catalog.js";

export const DISCLAIMER =
  "Synthetic placeholder for a payment-protocol demo. Not a forecast, not investment advice.";

export interface Estimate {
  market: string;
  question: string;
  horizon: string;
  /** 0..1 */
  probability: number;
  confidence: "low" | "medium" | "high";
  basis: string;
  asOf: string;
  estimatedBy: string;
  disclaimer: string;
}

const CANNED: Record<string, { probability: number; confidence: Estimate["confidence"]; basis: string }> = {
  "btc-100k-2026": { probability: 0.62, confidence: "medium", basis: "placeholder value — long horizon, wide distribution" },
  "btc-up-7d": { probability: 0.53, confidence: "low", basis: "placeholder value — one week out is close to a coin flip" },
  "btc-drawdown-20": { probability: 0.28, confidence: "medium", basis: "placeholder value — quarterly drawdowns of this size are uncommon but not rare" },
  "btc-vol-spike": { probability: 0.41, confidence: "low", basis: "placeholder value — volatility clusters, so this is regime-dependent" },
};

export async function estimate(market: Market): Promise<Estimate> {
  const base = {
    market: market.id,
    question: market.question,
    horizon: market.horizon,
    asOf: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
  const fallback = CANNED[market.id] ?? {
    probability: 0.5,
    confidence: "low" as const,
    basis: "placeholder value — no canned estimate for this market",
  };

  if (!config.groqKey) {
    return { ...base, ...fallback, estimatedBy: "local-fallback (no GROQ_API_KEY)" };
  }

  try {
    const groq = new Groq({ apiKey: config.groqKey });
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          'You are a prediction desk. Give a calibrated probability for the question. This is a ' +
          'DEMO — do not claim access to live market data. Reply as JSON: ' +
          '{"probability": <0..1>, "confidence": "low"|"medium"|"high", "basis": "<one short line>"}.' },
        { role: "user", content: `${market.question} (horizon: ${market.horizon})` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      probability?: unknown; confidence?: unknown; basis?: unknown;
    };
    const p = Number(parsed.probability);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error("model returned no usable probability");
    const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : fallback.confidence;
    return {
      ...base,
      probability: Math.round(p * 100) / 100,
      confidence,
      basis: typeof parsed.basis === "string" ? parsed.basis : fallback.basis,
      estimatedBy: config.groqModel,
    };
  } catch {
    // Never fail a PAID request because the model is down — deliver something and label it.
    return { ...base, ...fallback, estimatedBy: "local-fallback (groq unavailable)" };
  }
}
