// "Bookseller" — the SELLER agent. A free catalog, and one paid route.
//
// Note how little payment code lives here: a price and a payTo. The seller verifies its own
// payments in-process, so there is no second service to run.

import express from "express";
import { config, sellerAccount, banner, detail, say, ok, check, shortId, short } from "@demo/shared";
import { paywall, type SellerEvent } from "./paywall.js";
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
  detail("agent id", config.sellerAgentId ?? "(unregistered — run npm run setup:registry)");
  detail("catalog", `${CATALOG.length} books`);
  detail("price", `${config.price} ${config.assetSymbol} per book`);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "canned summaries (no GROQ_API_KEY)");
  say("SELLER", "this wallet only ever RECEIVES — it never signs, so it needs no gas");
  say("SELLER", "it verifies its own payments by reading the chain — no facilitator");

  const narrate = (e: SellerEvent) => {
    switch (e.type) {
      case "quoted":
        banner("SELLER", "step 5", "402 Payment Required — here is my quote");
        detail("price", `${e.quote.price} ${e.quote.symbol}`);
        detail("payTo", e.quote.payTo);
        detail("asset", shortId(e.quote.asset));
        detail("agent id", e.quote.payToAgentId ?? "(none)");
        break;
      case "proof-received":
        banner("SELLER", "step 9", "Payment proof received — checking it myself");
        detail("from", e.proof.claim.from);
        detail("their tx", e.proof.claim.txHash);
        detail("signature", short(e.proof.signature, 14, 6));
        break;
      case "checked":
        for (const c of e.checks) check(c.name, c.passed, c.detail);
        if (e.ok) ok(`payment CONFIRMED on chain — ix ${e.txHash}`);
        break;
      case "produced":
        banner("SELLER", "step 10", "Paid — delivering the book");
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
    paywall(
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
