// The paid-route middleware. Quote, verify, deliver.
//
// The whole seller-side payment integration is this file plus verify-proof.ts. There is no
// facilitator to run, no facilitator URL to configure, and no second process to keep alive.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  sellerAccount,
  ConsumedTransfers,
  decodeProof,
  encodeReceipt,
  NETWORK,
  type Account,
  type CheckResult,
  type PaymentProof,
  type Quote,
} from "@demo/shared";
import { buildQuote, type Priced } from "./price.js";
import { verifyProof } from "./verify-proof.js";

export type SellerEvent =
  | { type: "quoted"; quote: Quote }
  | { type: "proof-received"; proof: PaymentProof }
  | { type: "checked"; checks: CheckResult[]; ok: boolean; txHash?: string }
  | { type: "produced" }
  | { type: "rejected"; reason: string };

export function paywall(
  payTo: string,
  produce: (req: Request) => Promise<unknown>,
  /** What is being sold on this request, and what the seller charges for it. */
  resolve: (req: Request) => Priced,
  onEvent?: (e: SellerEvent) => void,
): RequestHandler {
  // In-memory, which is honest for a demo: one process, one run. A real seller would persist this,
  // because forgetting a spent transfer is how you get charged once and deliver twice.
  const consumed = new ConsumedTransfers();
  const emit = (e: SellerEvent) => onEvent?.(e);
  let seller: Account | null = null;

  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;
      const quote = buildQuote(resource, payTo, resolve(req));

      // ── nothing attached: quote them ────────────────────────────────────────────────────
      const header = req.header("X-Payment-Proof");
      if (!header) {
        emit({ type: "quoted", quote });
        res.status(402).json(quote);
        return;
      }

      let proof: PaymentProof;
      try {
        proof = decodeProof(header);
      } catch {
        emit({ type: "rejected", reason: "malformed X-Payment-Proof header" });
        res.status(402).json({ ...quote, error: "malformed_proof" });
        return;
      }
      emit({ type: "proof-received", proof });

      // `verify` needs no private key, but Account owns the wallet that exposes it.
      seller ??= await sellerAccount();

      const outcome = await verifyProof({ seller, consumed, proof, quote, consume: true });
      emit({ type: "checked", checks: outcome.checks, ok: outcome.ok, txHash: outcome.txHash });

      if (!outcome.ok) {
        emit({ type: "rejected", reason: outcome.reason ?? "invalid" });
        res.status(402).json({ ...quote, error: outcome.reason });
        return;
      }

      const data = await produce(req);
      emit({ type: "produced" });

      res.setHeader("X-Payment-Receipt", encodeReceipt({
        paid: true,
        txHash: outcome.txHash!,
        network: NETWORK,
        payer: outcome.payer!,
      }));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };
}
