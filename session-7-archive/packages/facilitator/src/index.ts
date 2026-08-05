// The MOI facilitator.
//
// x402's ONLY chain-specific component — and therefore this project's entire integration seam.
// It speaks the standard x402 facilitator API and settles natively on MOI:
//
//   POST /verify     is this payment authorization good?   (8 checks — see verify.ts)
//   POST /settle     move the funds, return the receipt    (MAS0 Lockup -> Release -> Transfer)
//   GET  /supported  which (scheme, network) pairs we handle
//
// The request/response envelopes are exactly what x402's own `useFacilitator` client sends and
// expects — verified by reading its compiled source (SDK_NOTES.md §5). A stock x402 server could
// point at this service unmodified; only the scheme and network strings are MOI's.

import express from "express";
import type { AgentRegistry } from "js-moi-agent-registry";
import {
  config,
  walletConfig,
  loadAccount,
  openRegistry,
  createSettlementBackend,
  banner,
  detail,
  check,
  say,
  ok,
  fail,
  shortId,
  amount as fmtAmount,
  MOI_SCHEME,
  MOI_NETWORK,
  X402_VERSION,
  type MoiAccount,
  type MoiSettlementBackend,
  type SettleRequest,
  type SettleResponse,
  type VerifyRequest,
  type VerifyResponse,
} from "@s7/shared";
import { runVerification } from "./verify.js";

export interface FacilitatorHandle {
  url: string;
  address: string;
  close: () => Promise<void>;
}

export async function startFacilitator(): Promise<FacilitatorHandle> {
  const facilitator = await loadAccount(walletConfig("FACILITATOR"));
  const backend: MoiSettlementBackend = createSettlementBackend(config.settlement);

  // Identity checks need registered identities to check against. If `register-agents` has not
  // been run there is nothing to verify, so checks 6–7 degrade to SKIPPED — and say so loudly in
  // the trace, so a skipped authority check can never be mistaken for a passing one.
  let registry: AgentRegistry | null = null;
  if (config.agentAId && config.agentBId) {
    try {
      registry = await openRegistry(facilitator);
    } catch (err) {
      say(
        "FACILITATOR",
        `⚠ registry unavailable (${(err as Error).message}) — identity checks will be SKIPPED`,
      );
    }
  } else {
    say("FACILITATOR", "⚠ agents not registered — identity checks will be SKIPPED. Run `npm run register-agents`.");
  }

  banner("FACILITATOR", "boot", "MOI facilitator online");
  detail("address", facilitator.address);
  detail("settlement", backend.name);
  detail("registry", registry ? "connected" : "UNAVAILABLE");
  detail("scheme/network", `${MOI_SCHEME} / ${MOI_NETWORK}`);

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/supported", (_req, res) => {
    res.json({ kinds: [{ x402Version: X402_VERSION, scheme: MOI_SCHEME, network: MOI_NETWORK }] });
  });

  app.post("/verify", async (req, res) => {
    const { paymentPayload, paymentRequirements } = req.body as VerifyRequest;
    banner("FACILITATOR", "step 7", "POST /verify — 8 checks");

    try {
      const outcome = await runVerification({
        facilitator,
        registry,
        backend,
        payload: paymentPayload,
        requirements: paymentRequirements,
      });
      for (const c of outcome.checks) check(c.name, c.passed, c.detail);

      if (outcome.isValid) ok(`payment authorization ACCEPTED from ${shortId(outcome.payer ?? "")}`);
      else fail(`payment authorization REJECTED — ${outcome.invalidReason}`);

      const body: VerifyResponse = {
        isValid: outcome.isValid,
        ...(outcome.invalidReason ? { invalidReason: outcome.invalidReason } : {}),
        ...(outcome.payer ? { payer: outcome.payer } : {}),
        checks: outcome.checks,
      };
      res.status(200).json(body);
    } catch (err) {
      fail(`verify threw: ${(err as Error).message}`);
      res.status(200).json({ isValid: false, invalidReason: "unexpected_verify_error" } satisfies VerifyResponse);
    }
  });

  app.post("/settle", async (req, res) => {
    const { paymentPayload, paymentRequirements } = req.body as SettleRequest;
    const auth = paymentPayload.payload.authorization;
    banner("FACILITATOR", "step 8", "POST /settle — moving funds on MOI");

    try {
      // Re-verify before settling. /settle must never trust that /verify was called, let alone
      // that it passed — they are independent HTTP requests.
      const outcome = await runVerification({
        facilitator,
        registry,
        backend,
        payload: paymentPayload,
        requirements: paymentRequirements,
      });
      if (!outcome.isValid) {
        fail(`refusing to settle — ${outcome.invalidReason}`);
        res.status(200).json({
          success: false,
          errorReason: outcome.invalidReason,
          network: MOI_NETWORK,
        } satisfies SettleResponse);
        return;
      }

      const value = BigInt(auth.value);
      detail("payer", auth.from);
      detail("payee", auth.to);
      detail("amount", fmtAmount(value, paymentRequirements.extra.decimals, paymentRequirements.extra.symbol));

      const result = await backend.settle({
        facilitator,
        payer: auth.from,
        payee: auth.to,
        assetId: auth.asset,
        amount: value,
      });

      ok(`release  ${result.releaseTransaction}`);
      ok(`transfer ${result.transaction}`);
      detail("payee balance", `${result.payeeBefore} → ${result.payeeAfter}`);

      res.status(200).json({
        success: true,
        transaction: result.transaction,
        network: MOI_NETWORK,
        payer: auth.from,
      } satisfies SettleResponse);
    } catch (err) {
      fail(`settlement failed: ${(err as Error).message}`);
      res.status(200).json({
        success: false,
        errorReason: (err as Error).message,
        network: MOI_NETWORK,
      } satisfies SettleResponse);
    }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(config.facilitatorPort, config.host, () => resolve(s));
  });

  const url = `http://${config.host}:${config.facilitatorPort}`;
  ok(`listening on ${url}`);

  return {
    url,
    address: facilitator.address,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Also runnable standalone: `npm run facilitator`. */
if (import.meta.url === `file://${process.argv[1]}`) {
  startFacilitator().catch((err) => {
    console.error(`facilitator failed to start: ${(err as Error).message}`);
    process.exit(1);
  });
}
