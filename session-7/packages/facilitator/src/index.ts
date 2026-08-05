// The MOI facilitator — x402's only chain-specific component, and our entire integration seam.
//
//   POST /verify     is this payment good?      (9 read-only checks — verify-payment.ts)
//   POST /settle     confirm + mark redeemed    (signs NOTHING)
//   GET  /supported  which (scheme, network) pairs we handle
//
// DECISION B — the facilitator is a REFEREE, not a custodian. On MOI only the wallet owner can
// move their own funds, so a facilitator cannot custody or relay. The buyer submits its own
// transfer; we read the chain and confirm it. That is an honest divergence from stock x402:
// /settle does not settle, it CONFIRMS. Say so on stage.
//
// The request/response envelopes are exactly what x402's own useFacilitator sends and expects, so
// the wire protocol is genuine x402 (DECISION A).

import express from "express";
import type { AgentRegistry } from "js-moi-agent-registry";
import {
  config,
  SCHEME,
  NETWORK,
  X402_VERSION,
  buyerAccount,
  existsOnChain,
  registryClient,
  ConsumedTransfers,
  banner,
  detail,
  check,
  say,
  ok,
  fail,
  warn,
  shortId,
  type FacilitatorRequest,
  type SettleResponse,
  type VerifyResponse,
} from "@demo/shared";
import { runVerification } from "./verify-payment.js";

export interface FacilitatorHandle {
  url: string;
  address: string;
  close: () => Promise<void>;
}

export async function startFacilitator(): Promise<FacilitatorHandle> {
  // The facilitator only READS. It uses the buyer's (funded) wallet because registry reads build a
  // sender and therefore need an account that exists on chain — see SDK_NOTES.
  const facilitator = await buyerAccount();
  const consumed = new ConsumedTransfers();

  banner("FACILITATOR", "boot", "MOI facilitator online — referee, not custodian");
  detail("address", facilitator.address);
  detail("scheme/network", `${SCHEME} / ${NETWORK}`);
  detail("signs anything?", "no — all checks are read-only");

  let registry: AgentRegistry | null = null;
  if (config.sellerAgentId) {
    // Registry reads build a sender and need a nonce, so the caller must EXIST on chain.
    if (!(await existsOnChain(facilitator))) {
      warn("facilitator account is not on chain — registry reads will fail. Fund it.");
    }
    try {
      registry = await registryClient(facilitator, false);
      ok("agent registry connected — identity checks ACTIVE");
    } catch (err) {
      say("FACILITATOR", `⚠ registry unavailable (${(err as Error).message}) — identity check SKIPPED`);
    }
  } else {
    say("FACILITATOR", "⚠ SELLER_AGENT_ID unset — identity check will be SKIPPED. Run 03-register-agents.");
  }

  const app = express();
  app.use(express.json({ limit: "512kb" }));

  app.get("/supported", (_req, res) => {
    res.json({ kinds: [{ x402Version: X402_VERSION, scheme: SCHEME, network: NETWORK }] });
  });

  const handle = async (
    label: string,
    step: string,
    consume: boolean,
    body: FacilitatorRequest,
  ) => {
    banner("FACILITATOR", step, label);
    const outcome = await runVerification({
      facilitator,
      registry,
      consumed,
      payload: body.paymentPayload,
      requirements: body.paymentRequirements,
      consume,
    });
    for (const c of outcome.checks) check(c.name, c.passed, c.detail);
    return outcome;
  };

  app.post("/verify", async (req, res) => {
    try {
      const outcome = await handle("POST /verify — 9 read-only checks", "step 10", false, req.body);
      if (outcome.isValid) ok(`payment ACCEPTED from ${shortId(outcome.payer ?? "")}`);
      else fail(`payment REJECTED — ${outcome.invalidReason}`);
      res.status(200).json({
        isValid: outcome.isValid,
        ...(outcome.invalidReason ? { invalidReason: outcome.invalidReason } : {}),
        ...(outcome.payer ? { payer: outcome.payer } : {}),
        checks: outcome.checks,
      } satisfies VerifyResponse);
    } catch (err) {
      fail(`verify threw: ${(err as Error).message}`);
      res.status(200).json({ isValid: false, invalidReason: "unexpected_verify_error" } satisfies VerifyResponse);
    }
  });

  app.post("/settle", async (req, res) => {
    try {
      // Re-verify: /settle must never trust that /verify ran, let alone passed. This call also
      // CONSUMES the transfer hash, so the same payment cannot buy twice.
      const outcome = await handle(
        "POST /settle — confirming the buyer's own transfer", "step 11", true, req.body,
      );
      if (!outcome.isValid) {
        fail(`refusing to confirm — ${outcome.invalidReason}`);
        res.status(200).json({
          success: false, errorReason: outcome.invalidReason, network: NETWORK,
        } satisfies SettleResponse);
        return;
      }
      ok(`CONFIRMED on chain — ix ${outcome.transaction}`);
      detail("note", "the buyer moved these funds; the facilitator only verified it");
      res.status(200).json({
        success: true,
        transaction: outcome.transaction,
        network: NETWORK,
        payer: outcome.payer,
      } satisfies SettleResponse);
    } catch (err) {
      fail(`settle threw: ${(err as Error).message}`);
      res.status(200).json({
        success: false, errorReason: (err as Error).message, network: NETWORK,
      } satisfies SettleResponse);
    }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(config.facilitatorPort, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${config.facilitatorPort}`;
  ok(`listening on ${url}`);

  return {
    url,
    address: facilitator.address,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startFacilitator().catch((err) => {
    console.error(`facilitator failed to start: ${(err as Error).message}`);
    process.exit(1);
  });
}
