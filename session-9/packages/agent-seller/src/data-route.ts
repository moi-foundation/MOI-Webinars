// THE PRODUCT. GET /signal/:id -> the probability you paid for.
//
// Deliberately free of ANY payment logic — payment is middleware wrapped around this handler.
// Adding the paywall to an existing endpoint changes the endpoint by zero lines.

import type { Request } from "express";
import { findMarket } from "./catalog.js";
import { estimate, type Estimate } from "./brain.js";

export async function produceEstimate(req: Request): Promise<Estimate> {
  const id = String(req.params.id ?? "");
  const market = findMarket(id);
  if (!market) throw new Error(`no such market: ${id}`);
  return estimate(market);
}
