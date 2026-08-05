// MOI-aware x402 middleware — DECISION A.
//
// `x402-express` cannot be used: its network dispatch ends in a literal
// `throw new Error("Unsupported network: " + network)` after two hardcoded EVM/SVM allow-lists,
// and it runs `viem.getAddress(payTo)` on the payee. Neither can express a MOI identifier.
// (Verified in the installed package's compiled source — SDK_NOTES §A.)
//
// So we emit the 402 ourselves. The WIRE FORMAT is byte-for-byte the x402 spec's, and we drive the
// facilitator with x402's REAL `useFacilitator` client, which does no validation and treats
// `network` as an opaque string. We are not forking x402 and not changing the protocol.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { useFacilitator } from "x402/verify";
import {
  config,
  paymentRequiredBody,
  decodePaymentHeader,
  encodePaymentResponseHeader,
  X402_VERSION,
  NETWORK,
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from "@demo/shared";
import { buildRequirements } from "./price.js";

export type SellerEvent =
  | { type: "payment-required"; requirements: PaymentRequirements }
  | { type: "payment-received"; payload: PaymentPayload }
  | { type: "verified"; response: VerifyResponse }
  | { type: "confirmed"; response: SettleResponse }
  | { type: "produced" }
  | { type: "rejected"; reason: string };

export function moiPaymentMiddleware(
  payTo: string,
  produce: (req: Request) => Promise<unknown>,
  describe: (req: Request) => string,
  onEvent?: (e: SellerEvent) => void,
): RequestHandler {
  // The real x402 facilitator client — chain-agnostic at runtime, reused as-is.
  const facilitator = useFacilitator({ url: config.facilitatorUrl as `${string}://${string}` });
  const emit = (e: SellerEvent) => onEvent?.(e);

  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;
      const requirements = buildRequirements(resource, payTo, describe(req));

      // ── no payment yet: answer 402 with what we accept ──────────────────────────────────
      const header = req.header("X-Payment");
      if (!header) {
        emit({ type: "payment-required", requirements });
        res.status(402).json(paymentRequiredBody([requirements]));
        return;
      }

      let payload: PaymentPayload;
      try {
        payload = decodePaymentHeader(header);
      } catch {
        emit({ type: "rejected", reason: "malformed X-Payment header" });
        res.status(402).json(paymentRequiredBody([requirements], "invalid_payload"));
        return;
      }
      emit({ type: "payment-received", payload });

      // ── ask the facilitator. Casts: x402's types are narrowed to its own closed enums; the
      // wire format is identical, only scheme/network differ (SDK_NOTES §A). ────────────────
      const verified = (await facilitator.verify(
        payload as never, requirements as never,
      )) as unknown as VerifyResponse;
      emit({ type: "verified", response: verified });

      if (!verified.isValid) {
        emit({ type: "rejected", reason: verified.invalidReason ?? "invalid" });
        res.status(402).json(paymentRequiredBody([requirements], verified.invalidReason));
        return;
      }

      // /settle CONFIRMS the buyer's own transfer and burns the replay nonce. The facilitator
      // moves nothing (DECISION B).
      const confirmed = (await facilitator.settle(
        payload as never, requirements as never,
      )) as unknown as SettleResponse;
      emit({ type: "confirmed", response: confirmed });

      if (!confirmed.success) {
        emit({ type: "rejected", reason: confirmed.errorReason ?? "confirmation failed" });
        res.status(402).json(paymentRequiredBody([requirements], confirmed.errorReason));
        return;
      }

      const data = await produce(req);
      emit({ type: "produced" });

      res.setHeader(
        "X-Payment-Response",
        encodePaymentResponseHeader({
          success: true,
          transaction: confirmed.transaction,
          network: NETWORK,
          payer: confirmed.payer,
        }),
      );
      res.status(200).json({ x402Version: X402_VERSION, data });
    } catch (err) {
      next(err);
    }
  };
}
