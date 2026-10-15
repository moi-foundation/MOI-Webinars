// The paid-route middleware, speaking x402.
//
// Session 8's paywall answered 402 with a quote of our own invention. This one answers with a
// spec-shaped body: { x402Version, accepts: [...] }, and reads the standard X-PAYMENT header.
//
// What did NOT change is who verifies. There is still no facilitator. The seller reads the chain
// itself, exactly as in session 7, because on MOI a third party cannot settle on your behalf and a
// third party that only CHECKS is a dependency rather than a service.
//
// So: standard envelope, native settlement, self-verification.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  sellerAccount,
  ConsumedTransfers,
  decodePaymentHeader,
  encodePaymentResponseHeader,
  paymentRequiredBody,
  X402_NETWORK,
  type Account,
  type CheckResult,
  type PaymentPayload,
  type PaymentRequirements,
} from "@demo/shared";
import { buildRequirements, type Priced } from "./price.js";
import { verifyPayment } from "./verify-proof.js";

export type SellerEvent =
  | { type: "payment-required"; requirements: PaymentRequirements }
  | { type: "payment-received"; payload: PaymentPayload }
  | { type: "checked"; checks: CheckResult[]; ok: boolean; txHash?: string }
  | { type: "produced" }
  | { type: "rejected"; reason: string };

export function paywall(
  payTo: string,
  produce: (req: Request) => Promise<unknown>,
  resolve: (req: Request) => Promise<Priced>,
  onEvent?: (e: SellerEvent) => void,
): RequestHandler {
  // In-memory, which is honest for a demo: one process, one run. A real seller would persist this,
  // because forgetting a spent transfer is how you get paid once and deliver twice.
  const consumed = new ConsumedTransfers();
  const emit = (e: SellerEvent) => onEvent?.(e);
  let seller: Account | null = null;

  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;
      const requirements = buildRequirements(resource, payTo, await resolve(req));

      // ── nothing attached: answer 402 with what we accept ────────────────────────────────
      const header = req.header("X-PAYMENT");
      if (!header) {
        emit({ type: "payment-required", requirements });
        res.status(402).json(paymentRequiredBody([requirements]));
        return;
      }

      let payload: PaymentPayload;
      try {
        payload = decodePaymentHeader(header);
      } catch {
        emit({ type: "rejected", reason: "malformed X-PAYMENT header" });
        res.status(402).json(paymentRequiredBody([requirements], "invalid_payload"));
        return;
      }
      emit({ type: "payment-received", payload });

      // `verify` needs no private key, but Account owns the wallet that exposes it.
      seller ??= await sellerAccount();

      const outcome = await verifyPayment({ seller, consumed, payload, requirements, consume: true });
      emit({ type: "checked", checks: outcome.checks, ok: outcome.ok, txHash: outcome.txHash });

      if (!outcome.ok) {
        emit({ type: "rejected", reason: outcome.reason ?? "invalid" });
        res.status(402).json(paymentRequiredBody([requirements], outcome.reason));
        return;
      }

      const data = await produce(req);
      emit({ type: "produced" });

      res.setHeader("X-PAYMENT-RESPONSE", encodePaymentResponseHeader({
        success: true,
        transaction: outcome.txHash!,
        network: X402_NETWORK,
        payer: outcome.payer!,
      }));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };
}
