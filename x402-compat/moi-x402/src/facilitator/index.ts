// MOI facilitator — verify and settle.
//
// On most chains `settle()` submits the payment and pays the gas. Under the `upfront` flow there
// is nothing to submit: the buyer already moved the money. So settle() CONFIRMS rather than
// executes, and `areFeesSponsored` is false — the buyer paid its own fuel.
//
// That is also why MOI does not need anyone to operate a facilitator. This same code runs
// in-process inside a seller, which x402 documents as "self-facilitation" and accepts as a
// production path.
//
// ⚠️ MAS0 FAILS SILENTLY. A refused transfer still returns an interaction hash with no error. The
// only reliable oracle is reading the interaction back and comparing fields — which is what
// verify() does, and why it must never be skipped.

import type {
  SchemeNetworkFacilitator, PaymentPayload, PaymentRequirements,
  VerifyResponse, SettleResponse, Network, FacilitatorContext,
} from "@x402/core/types";
import { MOI_SCHEME, MOI_WILDCARD_CAIP2 } from "../shared/network.js";
import {
  canonicalClaimBytes, nowSeconds, normalizeAddress,
  type MoiPaymentClaim, type MoiPaymentPayload,
} from "../shared/claim.js";

/** What the facilitator needs to read the chain. No key material required — every check is a read. */
export interface MoiChainReader {
  /** Verify an ECDSA signature over bytes for a given public key. */
  verifySignature(bytes: Uint8Array, signature: string, publicKey: string): boolean;
  /** Derive a participant identifier from a public key. */
  identifierFromPublicKey(publicKey: string): string;
  /** Read a settled transfer back off the chain. Throws when it is not there. */
  readTransfer(txHash: string, assetId: string): Promise<{
    from: string; beneficiary: string; amount: bigint; callsite: string; txHash: string;
  }>;
}

/** One transfer buys one thing. In production this must outlive the process. */
export interface SpentStore {
  has(txHash: string): boolean | Promise<boolean>;
  add(txHash: string): void | Promise<void>;
}

export class InMemorySpentStore implements SpentStore {
  private readonly seen = new Set<string>();
  has(txHash: string): boolean { return this.seen.has(txHash.toLowerCase()); }
  add(txHash: string): void { this.seen.add(txHash.toLowerCase()); }
}

const fail = (reason: string, message: string): VerifyResponse =>
  ({ isValid: false, invalidReason: reason, invalidMessage: message });

export class MoiExactScheme implements SchemeNetworkFacilitator {
  readonly scheme = MOI_SCHEME;

  /** Which CAIP-2 family this settles. Provisional until CASA registers `moi`. */
  readonly caipFamily = MOI_WILDCARD_CAIP2;

  /** The buyer pays its own fuel. Nobody sponsors it — see the header note. */
  readonly areFeesSponsored = false;

  constructor(
    private readonly chain: MoiChainReader,
    private readonly spent: SpentStore = new InMemorySpentStore(),
  ) {}

  getExtra(_network: Network): Record<string, unknown> | undefined {
    return { flow: "upfront", feesSponsored: false };
  }

  /** No signing addresses: this facilitator never signs anything. */
  getSigners(_network: string): string[] { return []; }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const inner = payload?.payload as MoiPaymentPayload | undefined;
    const claim: MoiPaymentClaim | undefined = inner?.claim;

    // 1. shape
    if (!claim || !inner?.signature || !inner?.publicKey) {
      return fail("invalid_payload", "missing claim, signature or publicKey");
    }

    // 2. the signature is real
    let signatureOk = false;
    try {
      signatureOk = this.chain.verifySignature(
        canonicalClaimBytes(claim), inner.signature, inner.publicKey,
      );
    } catch { signatureOk = false; }
    if (!signatureOk) return fail("invalid_signature", "ECDSA over the canonical claim failed");

    // 3. the signing key controls the paying account.
    //    A valid signature alone could still merely CLAIM someone else's `from`, which is exactly
    //    how you would redeem a transfer hash lifted off the public chain.
    const derived = this.chain.identifierFromPublicKey(inner.publicKey);
    if (normalizeAddress(derived) !== normalizeAddress(claim.from)) {
      return fail("invalid_payload", `key derives to ${derived}, which cannot control ${claim.from}`);
    }

    // 4. the claim matches what was quoted
    const mismatches: string[] = [];
    if (normalizeAddress(claim.asset) !== normalizeAddress(requirements.asset)) mismatches.push("asset");
    if (normalizeAddress(claim.to) !== normalizeAddress(requirements.payTo)) mismatches.push("payTo");
    let value: bigint;
    try { value = BigInt(claim.value); } catch { return fail("invalid_payload", "unparseable value"); }
    if (value < BigInt(requirements.amount)) mismatches.push("amount");
    if (mismatches.length > 0) {
      return fail("requirements_mismatch", `mismatch: ${mismatches.join(", ")}`);
    }

    // 5. freshness
    const now = nowSeconds();
    if (now < Number(claim.validAfter)) return fail("payment_expired", "not valid yet");
    if (now > Number(claim.validBefore)) {
      return fail("payment_expired", `expired ${now - Number(claim.validBefore)}s ago`);
    }

    // 6. did the money actually move? read it back rather than believing the payload.
    let facts;
    try {
      facts = await this.chain.readTransfer(claim.txHash, requirements.asset);
    } catch (err) {
      return fail("transfer_not_found", (err as Error).message);
    }
    const problems: string[] = [];
    if (normalizeAddress(facts.from) !== normalizeAddress(claim.from)) problems.push(`sender ${facts.from}`);
    if (normalizeAddress(facts.beneficiary) !== normalizeAddress(claim.to)) problems.push(`beneficiary ${facts.beneficiary}`);
    if (facts.amount < value) problems.push(`amount ${facts.amount} < ${value}`);
    if (!/transfer/i.test(facts.callsite)) problems.push(`callsite ${facts.callsite}`);
    if (problems.length > 0) {
      return fail("transfer_mismatch", `on-chain transfer disagrees: ${problems.join(", ")}`);
    }

    // 7. replay
    if (await this.spent.has(claim.txHash)) {
      return fail("already_spent", "this transfer has already been redeemed");
    }

    return { isValid: true, payer: claim.from };
  }

  /**
   * Confirm, not execute.
   *
   * Re-runs verify — settle must never assume verify ran, let alone passed — then burns the
   * transfer hash so the same payment cannot buy twice.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const verified = await this.verify(payload, requirements, context);
    const claim = (payload?.payload as MoiPaymentPayload | undefined)?.claim;

    if (!verified.isValid || !claim) {
      return {
        success: false,
        errorReason: verified.invalidReason ?? "invalid_payload",
        errorMessage: verified.invalidMessage,
        transaction: claim?.txHash ?? "",
        network: requirements.network,
      };
    }

    await this.spent.add(claim.txHash);

    return {
      success: true,
      payer: claim.from,
      transaction: claim.txHash,   // the buyer's own transfer; we confirmed it, we did not make it
      network: requirements.network,
      amount: claim.value,
    };
  }
}

export default MoiExactScheme;
