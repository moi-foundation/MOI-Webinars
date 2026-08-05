// THE PRODUCT. GET /book/:id -> the summary you paid for.
//
// Deliberately free of ANY payment logic — payment is middleware wrapped around this handler.
// Adding the paywall to an existing endpoint changes the endpoint by zero lines.

import type { Request } from "express";
import { findBook } from "./catalog.js";
import { deliverBook, type Delivery } from "./brain.js";

export async function produceBook(req: Request): Promise<Delivery> {
  const id = String(req.params.id ?? "");
  const book = findBook(id);
  if (!book) throw new Error(`no such book: ${id}`);
  return deliverBook(book);
}
