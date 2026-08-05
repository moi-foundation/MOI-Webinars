// Agent B — the SELLER. A "Signal Agent".
//
// Sells exactly one thing: a prediction-market probability. Its endpoint is wrapped in the
// MOI-aware x402 middleware, so the payment handshake is entirely declarative from here — this
// file contains no payment logic at all, which is the point. A seller integrates x402 by naming a
// price and a facilitator; everything chain-specific lives behind the facilitator.
//
// Tier 1 (default):  verify -> settle -> produce -> serve
// Tier 2 (ESCROW=1): verify -> produce -> settle -> serve, so a failure to deliver means the
//                    buyer's escrow is never released.

import express from "express";
import {
  config,
  walletConfig,
  loadAccount,
  moiPaymentMiddleware,
  banner,
  detail,
  say,
  ok,
  shortId,
  short,
  amount as fmtAmount,
  type MiddlewareEvent,
} from "@s7/shared";

export interface AgentBHandle {
  url: string;
  address: string;
  close: () => Promise<void>;
}

/** The product. Deterministic per market so the demo output is stable and explainable. */
function computeSignal(market: string) {
  // A real Signal Agent would run a model here. The demo is about the payment rail, so this is a
  // stable pseudo-random draw seeded by the market name — never presented as a real forecast.
  let h = 2166136261;
  for (const ch of market) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const probability = ((h >>> 0) % 6000) / 10000 + 0.2; // 0.20 – 0.80
  return {
    market,
    probability: Number(probability.toFixed(4)),
    confidence: Number((0.55 + ((h >>> 8) % 400) / 1000).toFixed(3)),
    horizonDays: 30,
    model: "signal-agent-demo-v1",
    note: "Synthetic value for demonstration — not a real forecast.",
    issuedAt: new Date().toISOString(),
  };
}

export async function startAgentB(facilitatorAddress: string): Promise<AgentBHandle> {
  const seller = await loadAccount(walletConfig("AGENT_B"));

  banner("AGENT-B", "boot", "Signal Agent online — selling one data point");
  detail("address", seller.address);
  detail("agent id", config.agentBId ?? "(not registered — run register-agents)");
  detail("price", fmtAmount(config.signalPrice, config.assetDecimals, config.assetSymbol));
  detail("mode", config.escrow ? "TIER 2 — escrowed pay-on-delivery" : "TIER 1 — settle then serve");

  const narrate = (event: MiddlewareEvent) => {
    switch (event.type) {
      case "payment-required":
        banner("AGENT-B", "step 2", "402 Payment Required");
        detail(
          "price",
          fmtAmount(
            event.requirements.maxAmountRequired,
            event.requirements.extra.decimals,
            event.requirements.extra.symbol,
          ),
        );
        detail("payTo", event.requirements.payTo);
        detail("asset", shortId(event.requirements.asset));
        detail("facilitator", shortId(event.requirements.extra.facilitator));
        break;
      case "payment-received":
        banner("AGENT-B", "step 6", "X-Payment received — asking the facilitator");
        detail("from", event.payload.payload.authorization.from);
        detail("signature", short(event.payload.payload.signature, 14, 6));
        break;
      case "verified":
        if (event.response.isValid) ok("facilitator says the authorization is VALID");
        break;
      case "settled":
        if (event.response.success) ok(`settled — ix ${event.response.transaction}`);
        break;
      case "produced":
        banner("AGENT-B", "step 9", "Payment good — producing and serving the signal");
        break;
      case "rejected":
        say("AGENT-B", `refusing to serve: ${event.reason}`);
        break;
    }
  };

  const app = express();

  app.get(
    "/signal",
    moiPaymentMiddleware(
      {
        payTo: seller.address,
        asset: config.assetId,
        assetSymbol: config.assetSymbol,
        assetDecimals: config.assetDecimals,
        price: config.signalPrice,
        facilitatorUrl: config.facilitatorUrl,
        facilitatorAddress,
        description: "One prediction-market probability estimate.",
        ...(config.agentBId ? { payToAgentId: config.agentBId } : {}),
        escrow: config.escrow,
        onEvent: narrate,
      },
      async (req) => computeSignal(String(req.query.market ?? "BTC-100K-2026")),
    ),
  );

  // Unpaid metadata endpoint — how a buyer learns what is on offer before paying.
  app.get("/about", (_req, res) => {
    res.json({
      name: "Signal Agent",
      agentId: config.agentBId ?? null,
      address: seller.address,
      sells: "prediction-market probability",
      price: {
        amount: config.signalPrice,
        symbol: config.assetSymbol,
        decimals: config.assetDecimals,
      },
    });
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(config.agentBPort, config.host, () => resolve(s));
  });

  const url = `http://${config.host}:${config.agentBPort}`;
  ok(`listening on ${url}`);

  return {
    url,
    address: seller.address,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const facilitatorAddress = process.env.FACILITATOR_ADDRESS;
  if (!facilitatorAddress) {
    console.error(
      "FACILITATOR_ADDRESS must be set when running agent-b standalone (the buyer locks funds naming it). Use `npm run demo` to wire it automatically.",
    );
    process.exit(1);
  }
  startAgentB(facilitatorAddress).catch((err) => {
    console.error(`agent-b failed to start: ${(err as Error).message}`);
    process.exit(1);
  });
}
