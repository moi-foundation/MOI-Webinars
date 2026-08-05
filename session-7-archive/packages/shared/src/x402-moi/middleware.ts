// MOI-aware x402 payment middleware for Express.
//
// This is the replacement for `x402-express`, which cannot be used here: its `paymentMiddleware`
// ends its network dispatch with a literal `throw new Error("Unsupported network: " + network)`
// after checking two hardcoded EVM/SVM allow-lists, and builds requirements with
// `viem.getAddress(payTo)` and a per-network USDC address table. None of that can express a MOI
// participant identifier or a MAS0 asset. See SDK_NOTES.md §5 for the source citations.
//
// What we DO reuse is the real `x402` package's facilitator client (`useFacilitator`), which is
// genuinely chain-agnostic at runtime — it performs no zod validation and treats `network` as an
// opaque string. So the HTTP conversation with the facilitator here is byte-for-byte the x402
// spec's, not an imitation of it.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { useFacilitator } from "x402/verify";
import {
  MOI_SCHEME,
  MOI_NETWORK,
  X402_VERSION,
  type MoiPaymentPayload,
  type MoiPaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from "../types.js";
import { decodePaymentHeader, encodePaymentResponseHeader, paymentRequiredBody } from "../x402.js";

export interface MoiPaymentMiddlewareOptions {
  /** MOI participant identifier of the seller. */
  payTo: string;
  /** MAS0 asset id. */
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  /** Price in atomic units, as a decimal string. */
  price: string;
  /** Base URL of the MOI facilitator. */
  facilitatorUrl: string;
  /** The facilitator's own MOI identifier — the buyer locks funds naming this account. */
  facilitatorAddress: string;
  description: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  /** Seller's on-chain agent id, so the buyer can verify who it is paying. */
  payToAgentId?: string;
  /**
   * Tier 2. When true, the resource is produced BEFORE settlement and the payment only settles if
   * production succeeded — escrowed pay-on-delivery. When false (Tier 1), settle first.
   */
  escrow?: boolean;
  /** Hooks so the demo can narrate what the seller is doing. */
  onEvent?: (event: MiddlewareEvent) => void;
}

export type MiddlewareEvent =
  | { type: "payment-required"; requirements: MoiPaymentRequirements }
  | { type: "payment-received"; payload: MoiPaymentPayload }
  | { type: "verified"; response: VerifyResponse }
  | { type: "settled"; response: SettleResponse }
  | { type: "produced" }
  | { type: "rejected"; reason: string };

/**
 * Wraps a resource handler in the x402 payment flow.
 *
 * `produce` is only ever called once payment is assured — settled (Tier 1) or escrowed and
 * verified (Tier 2).
 */
export function moiPaymentMiddleware(
  options: MoiPaymentMiddlewareOptions,
  produce: (req: Request) => Promise<unknown>,
): RequestHandler {
  // The real x402 facilitator client. Chain-agnostic at runtime.
  const facilitator = useFacilitator({ url: options.facilitatorUrl as `${string}://${string}` });
  const emit = (e: MiddlewareEvent) => options.onEvent?.(e);

  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;

      const requirements: MoiPaymentRequirements = {
        scheme: MOI_SCHEME,
        network: MOI_NETWORK,
        maxAmountRequired: options.price,
        resource,
        description: options.description,
        mimeType: options.mimeType ?? "application/json",
        payTo: options.payTo,
        maxTimeoutSeconds: options.maxTimeoutSeconds ?? 60,
        asset: options.asset,
        extra: {
          symbol: options.assetSymbol,
          decimals: options.assetDecimals,
          facilitator: options.facilitatorAddress,
          ...(options.payToAgentId ? { payToAgentId: options.payToAgentId } : {}),
          ...(options.escrow ? { escrow: true } : {}),
        },
      };

      // ── No payment yet: answer 402 with what we accept. ───────────────────────────────────
      const header = req.header("X-Payment");
      if (!header) {
        emit({ type: "payment-required", requirements });
        res.status(402).json(paymentRequiredBody([requirements]));
        return;
      }

      // ── Payment presented: decode it. ────────────────────────────────────────────────────
      let payload: MoiPaymentPayload;
      try {
        payload = decodePaymentHeader(header);
      } catch {
        emit({ type: "rejected", reason: "malformed X-Payment header" });
        res.status(402).json(paymentRequiredBody([requirements], "invalid_payload"));
        return;
      }
      emit({ type: "payment-received", payload });

      // ── Ask the facilitator whether it is good. ──────────────────────────────────────────
      // Cast: x402's types are narrowed to its own closed scheme/network enums (SDK_NOTES §5).
      // The wire format is identical; only those two string values differ.
      const verifyResponse = (await facilitator.verify(
        payload as never,
        requirements as never,
      )) as unknown as VerifyResponse;
      emit({ type: "verified", response: verifyResponse });

      if (!verifyResponse.isValid) {
        emit({ type: "rejected", reason: verifyResponse.invalidReason ?? "invalid" });
        res.status(402).json(paymentRequiredBody([requirements], verifyResponse.invalidReason));
        return;
      }

      const settle = async (): Promise<SettleResponse> => {
        const settleResponse = (await facilitator.settle(
          payload as never,
          requirements as never,
        )) as unknown as SettleResponse;
        emit({ type: "settled", response: settleResponse });
        return settleResponse;
      };

      let result: unknown;
      let settleResponse: SettleResponse;

      if (options.escrow) {
        // ── TIER 2: produce first, settle only on success. ─────────────────────────────────
        // The buyer's funds are already locked with the facilitator, so nothing can be spent
        // unless we deliver. If `produce` throws, we never settle and the facilitator refunds.
        try {
          result = await produce(req);
          emit({ type: "produced" });
        } catch (err) {
          emit({ type: "rejected", reason: `production failed: ${(err as Error).message}` });
          res.status(502).json({ error: "resource_unavailable", detail: (err as Error).message });
          return;
        }
        settleResponse = await settle();
        if (!settleResponse.success) {
          res.status(402).json(paymentRequiredBody([requirements], settleResponse.errorReason));
          return;
        }
      } else {
        // ── TIER 1: settle first, then produce. Fire-and-forget, as x402's "exact" scheme is.
        settleResponse = await settle();
        if (!settleResponse.success) {
          emit({ type: "rejected", reason: settleResponse.errorReason ?? "settlement failed" });
          res.status(402).json(paymentRequiredBody([requirements], settleResponse.errorReason));
          return;
        }
        result = await produce(req);
        emit({ type: "produced" });
      }

      res.setHeader(
        "X-Payment-Response",
        encodePaymentResponseHeader({
          success: true,
          transaction: settleResponse.transaction,
          network: MOI_NETWORK,
          payer: settleResponse.payer,
        }),
      );
      res.status(200).json({ x402Version: X402_VERSION, data: result });
    } catch (err) {
      next(err);
    }
  };
}
