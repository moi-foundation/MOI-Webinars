// "Bookseller" — the SELLER agent. A free catalog, and one paid route.
//
// Note how little payment code lives here: a price, a payTo, and a facilitator URL. That is the
// entire seller-side x402 integration.

import express from "express";
import { config, sellerAccount, banner, detail, say, ok, shortId, short } from "@demo/shared";
import { moiPaymentMiddleware, type SellerEvent } from "./x402-middleware.js";
import { produceBook } from "./data-route.js";
import { CATALOG, findBook } from "./catalog.js";

export interface SellerHandle {
  url: string;
  address: string;
  close: () => Promise<void>;
}

export async function startSeller(): Promise<SellerHandle> {
  const seller = await sellerAccount();

  banner("SELLER", "boot", "Bookseller online");
  detail("wallet", seller.address);
  detail("agent id", config.sellerAgentId ?? "(unregistered — run pnpm setup:registry)");
  detail("catalog", `${CATALOG.length} books`);
  detail("price", `${config.price} ${config.assetSymbol} per book`);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "canned summaries (no GROQ_API_KEY)");
  say("SELLER", "this wallet only ever RECEIVES — it never signs, so it needs no gas");

  const narrate = (e: SellerEvent) => {
    switch (e.type) {
      case "payment-required":
        banner("SELLER", "step 3", "402 Payment Required");
        detail("price", `${e.requirements.maxAmountRequired} ${e.requirements.extra.symbol}`);
        detail("payTo", e.requirements.payTo);
        detail("asset", shortId(e.requirements.asset));
        detail("agent id", e.requirements.extra.payToAgentId ?? "(none)");
        break;
      case "payment-received":
        banner("SELLER", "step 6", "X-Payment received — asking the facilitator");
        detail("from", e.payload.payload.authorization.from);
        detail("their tx", e.payload.payload.authorization.txHash);
        detail("signature", short(e.payload.payload.signature, 14, 6));
        break;
      case "verified":
        if (e.response.isValid) ok("facilitator says VALID");
        break;
      case "confirmed":
        if (e.response.success) ok(`facilitator CONFIRMED on chain — ix ${e.response.transaction}`);
        break;
      case "produced":
        banner("SELLER", "step 8", "Paid — delivering the book");
        break;
      case "rejected":
        say("SELLER", `refusing to deliver: ${e.reason}`);
        break;
    }
  };

  const app = express();

  // FREE. Discovery must never cost money, or the buyer cannot decide what it wants.
  app.get("/catalog", (_req, res) => {
    res.json({
      seller: "Bookseller",
      agentId: config.sellerAgentId,
      price: { amount: config.price.toString(), symbol: config.assetSymbol },
      books: CATALOG,
    });
  });

  // PAID. The summary is the product.
  app.get(
    "/book/:id",
    moiPaymentMiddleware(
      seller.address,
      produceBook,
      (req) => findBook(String(req.params.id))?.title ?? String(req.params.id),
      narrate,
    ),
  );

  app.get("/about", (_req, res) => {
    res.json({
      name: "Bookseller",
      agentId: config.sellerAgentId,
      address: seller.address,
      sells: "book summaries",
      catalog: "/catalog",
    });
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(config.sellerPort, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${config.sellerPort}`;
  ok(`listening on ${url}`);

  return {
    url,
    address: seller.address,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startSeller().catch((err) => {
    console.error(`seller failed to start: ${(err as Error).message}`);
    process.exit(1);
  });
}
