// "Signal Desk" — the SELLER agent. A free catalog of markets, and one paid route.
//
// Note how little payment code lives here: a price and a payTo. The seller verifies its own
// payments in-process, so there is no second service to run.

import express from "express";
import { config, sellerAccount, banner, detail, say, ok, check, shortId, short } from "@demo/shared";
import { paywall, type SellerEvent } from "./paywall.js";
import { produceEstimate } from "./data-route.js";
import { MARKETS, findMarket, catalogJson } from "./catalog.js";

export interface SellerHandle {
  url: string;
  address: string;
  close: () => Promise<void>;
}

export async function startSeller(opts?: { onEvent?: (e: SellerEvent) => void }): Promise<SellerHandle> {
  const seller = await sellerAccount();

  banner("SELLER", "boot", "Signal Desk online");
  detail("wallet", seller.address);
  detail("agent id", config.sellerAgentId ?? "(unregistered — run npm run setup:registry)");
  detail("catalog", `${MARKETS.length} markets`);
  detail("prices", MARKETS.map((m) => `${m.id} ${m.price}`).join("  ") + `  (${config.assetSymbol})`);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "canned estimates (no GROQ_API_KEY)");
  say("SELLER", "the probabilities are PLACEHOLDERS — no model, no market data");
  say("SELLER", "this wallet only ever RECEIVES — it never signs, so it needs no gas");
  say("SELLER", "it verifies its own payments by reading the chain — no facilitator");

  const narrate = (e: SellerEvent) => {
    // Anything watching from outside the terminal sees the same events, unfiltered.
    opts?.onEvent?.(e);
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
        banner("SELLER", "step 10", "Paid — delivering the estimate");
        break;
      case "rejected":
        say("SELLER", `refusing to deliver: ${e.reason}`);
        break;
    }
  };

  const app = express();

  // FREE. The QUESTIONS are public; only the answers cost money. A buyer that cannot see what is
  // on offer cannot decide whether it wants it.
  app.get("/catalog", (_req, res) => {
    res.json({
      seller: "Signal Desk",
      agentId: config.sellerAgentId,
      symbol: config.assetSymbol,
      markets: catalogJson(),
    });
  });

  // PAID. The probability is the product.
  app.get(
    "/signal/:id",
    paywall(
      seller.address,
      produceEstimate,
      (req) => {
        const m = findMarket(String(req.params.id));
        // No catalog entry: fall back to the configured default rather than giving it away.
        return { question: m?.question ?? String(req.params.id), price: m?.price ?? config.price };
      },
      narrate,
    ),
  );

  app.get("/about", (_req, res) => {
    res.json({
      name: "Signal Desk",
      agentId: config.sellerAgentId,
      address: seller.address,
      sells: "probability estimates",
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
