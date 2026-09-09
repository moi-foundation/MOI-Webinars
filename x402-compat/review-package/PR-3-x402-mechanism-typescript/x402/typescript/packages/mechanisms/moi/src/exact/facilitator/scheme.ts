import type {
  FacilitatorContext,
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  MAS0_TRANSFER_CALLSITE,
  MOI_SCHEME,
  MOI_WILDCARD_CAIP2,
} from "../../constants.js";
import { canonicalClaimBytes, nowSeconds } from "../../shared.js";
import type { MoiChainReader } from "../../signer.js";
import type { MoiPaymentClaim, MoiPaymentPayload } from "../../types.js";
import { sameId, toBigInt } from "../../utils.js";

/**
 * Records which transfers have already bought something.
 *
 * This is the replay boundary. `reserve` has to be atomic: under the upfront flow two concurrent
 * settlements can both read the same settled transfer off the chain before either records it, so
 * a separate has-then-add would let one payment buy twice.
 */
export interface SpentStore {
  /**
   * Claim a transfer hash, if nobody else has.
   *
   * @param txHash - The transfer to claim.
   * @returns True when this caller claimed it, false when it was already spent.
   */
  reserve(txHash: string): boolean | Promise<boolean>;
}

/** In-process spent store. Development only: it forgets everything on restart. */
export class InMemorySpentStore implements SpentStore {
  private readonly seen = new Set<string>();

  /**
   * @param txHash - The transfer to claim.
   * @returns True when this caller claimed it.
   */
  reserve(txHash: string): boolean {
    const key = txHash.toLowerCase();
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

/** Options for the facilitator half. */
export interface ExactMoiFacilitatorOptions {
  /** Where spent transfer hashes are recorded. Must be durable in production. */
  spentStore?: SpentStore;
}

/**
 * The facilitator half of `exact` on MOI.
 *
 * Under the upfront flow core does not call `/verify` at all, so every rule lives in `settle`.
 * The money moved before the seller saw the request; settlement confirms it and marks it spent.
 */
export class ExactMoiScheme implements SchemeNetworkFacilitator {
  readonly scheme = MOI_SCHEME;

  /** Any MOI network. */
  readonly caipFamily = MOI_WILDCARD_CAIP2;

  /** The buyer paid its own fuel when it submitted the transfer. */
  readonly areFeesSponsored = false;

  private readonly spent: SpentStore;

  /**
   * @param chain - Chain reads. No key material: this facilitator only reads.
   * @param options - Facilitator options.
   */
  constructor(
    private readonly chain: MoiChainReader,
    options: ExactMoiFacilitatorOptions = {},
  ) {
    this.spent = options.spentStore ?? new InMemorySpentStore();
  }

  /**
   * Advertise that fees are not sponsored.
   *
   * `paymentFlow` is not set here. Core writes it onto the wire from the server scheme's
   * declaration whenever the resolved flow is not `authorization`.
   *
   * @param _network - Unused.
   * @returns Extra fields for the wire.
   */
  getExtra(_network: Network): Record<string, unknown> | undefined {
    return { feesSponsored: false };
  }

  /**
   * This facilitator signs nothing, so it has no signing addresses.
   *
   * @param _network - Unused.
   * @returns An empty list.
   */
  getSigners(_network: string): string[] {
    return [];
  }

  /**
   * Check a payment without recording it.
   *
   * Core does not call this under the upfront flow, where validity is established by settle. It
   * is implemented so the mechanism stays usable through the generic verify path and so tests
   * can exercise the rules without consuming a transfer.
   *
   * @param payload - The payment payload.
   * @param requirements - What the seller quoted.
   * @param _context - Unused.
   * @returns Whether the payment is valid.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    return this.check(payload, requirements);
  }

  /**
   * Confirm the transfer and mark it spent.
   *
   * Re-runs every rule rather than trusting an earlier verify, then reserves the transfer hash
   * atomically so one payment cannot buy twice.
   *
   * @param payload - The payment payload.
   * @param requirements - What the seller quoted.
   * @param _context - Unused.
   * @returns The settlement result.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const claim = (payload?.payload as MoiPaymentPayload | undefined)?.claim;
    const checked = await this.check(payload, requirements);

    if (!checked.isValid || !claim) {
      return {
        success: false,
        errorReason: checked.invalidReason ?? "moi_exact_invalid_payload",
        errorMessage: checked.invalidMessage,
        transaction: claim?.txHash ?? "",
        network: requirements.network,
      };
    }

    // Rule 8. Atomic: a has-then-add would leave a window for concurrent settlements.
    if (!(await this.spent.reserve(claim.txHash))) {
      return {
        success: false,
        errorReason: "moi_exact_already_spent",
        errorMessage: "this transfer has already been redeemed",
        transaction: claim.txHash,
        network: requirements.network,
      };
    }

    return {
      success: true,
      payer: claim.from,
      transaction: claim.txHash,
      network: requirements.network,
      amount: claim.value,
    };
  }

  /**
   * Rules 1 to 7 of the scheme specification.
   *
   * @param payload - The payment payload.
   * @param requirements - What the seller quoted.
   * @returns Whether the payment satisfies every rule.
   */
  private async check(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const inner = payload?.payload as MoiPaymentPayload | undefined;
    const claim = inner?.claim;

    // 1. Shape.
    if (!claim || !inner?.signature || !inner?.publicKey) {
      return fail("moi_exact_invalid_payload", "missing claim, signature or publicKey");
    }

    // 2. Signature over the canonical claim bytes.
    let signatureOk = false;
    try {
      signatureOk = this.chain.verifySignature(
        canonicalClaimBytes(claim),
        inner.signature,
        inner.publicKey,
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) {
      return fail("moi_exact_invalid_signature", "ECDSA over the canonical claim failed");
    }

    // 3. The signing key controls the paying account. Without this, a valid signature could
    //    still name someone else's transfer, which is how a lifted hash would be redeemed.
    const derived = this.chain.identifierFromPublicKey(inner.publicKey);
    if (!sameId(derived, claim.from)) {
      return fail(
        "moi_exact_invalid_payload",
        `key derives to ${derived}, which cannot control ${claim.from}`,
      );
    }

    // 4. The claim matches the quote.
    const mismatches = this.quoteMismatches(claim, requirements);
    if (mismatches.length > 0) {
      return fail("moi_exact_requirements_mismatch", `mismatch: ${mismatches.join(", ")}`);
    }

    // 5. Resource binding. Signed but unenforced, a claim for one resource would settle a
    //    request for another on the same seller.
    const resourceCheck = this.resourceMismatch(claim, payload);
    if (resourceCheck) return fail("moi_exact_requirements_mismatch", resourceCheck);

    // 6. Freshness, and a window no wider than the seller quoted.
    const freshness = this.freshnessProblem(claim, requirements);
    if (freshness) return fail("moi_exact_payment_expired", freshness);

    // 7. The transfer settled, read back off the chain rather than believed.
    const facts = await this.chain.readTransfer(claim.txHash);
    if (!facts) {
      return fail("moi_exact_transfer_not_found", `no interaction at ${claim.txHash}`);
    }
    const problems = this.transferProblems(claim, requirements, facts);
    if (problems.length > 0) {
      return fail("moi_exact_transfer_mismatch", `on-chain transfer disagrees: ${problems.join(", ")}`);
    }

    return { isValid: true, payer: claim.from };
  }

  /**
   * Rule 4: compare the claim against the quote.
   *
   * @param claim - The signed claim.
   * @param requirements - What the seller quoted.
   * @returns Field names that disagree.
   */
  private quoteMismatches(claim: MoiPaymentClaim, requirements: PaymentRequirements): string[] {
    const mismatches: string[] = [];
    if (!sameId(claim.asset, requirements.asset)) mismatches.push("asset");
    if (!sameId(claim.to, requirements.payTo)) mismatches.push("payTo");
    try {
      if (toBigInt(claim.value) < toBigInt(requirements.amount)) mismatches.push("amount");
    } catch {
      mismatches.push("amount");
    }
    return mismatches;
  }

  /**
   * Rule 5: the claim names the resource being bought.
   *
   * @param claim - The signed claim.
   * @param payload - The payment payload, carrying the authoritative ResourceInfo.
   * @returns A problem description, or null when the binding holds.
   */
  private resourceMismatch(claim: MoiPaymentClaim, payload: PaymentPayload): string | null {
    const url = payload?.resource?.url;
    if (typeof url !== "string" || url === "") {
      // Fail closed. Skipping the comparison would leave the binding unenforced.
      return "payload carries no resource to bind this payment to";
    }
    return claim.resource === url
      ? null
      : `claim names resource ${claim.resource}, request is for ${url}`;
  }

  /**
   * Rule 6: the claim is current, and its window is no wider than quoted.
   *
   * @param claim - The signed claim.
   * @param requirements - What the seller quoted.
   * @returns A problem description, or null when fresh.
   */
  private freshnessProblem(
    claim: MoiPaymentClaim,
    requirements: PaymentRequirements,
  ): string | null {
    const now = nowSeconds();
    const after = Number(claim.validAfter);
    const before = Number(claim.validBefore);
    if (!Number.isFinite(after) || !Number.isFinite(before)) return "unparseable validity window";
    if (now < after) return "not valid yet";
    if (now > before) return `expired ${now - before}s ago`;
    if (requirements.maxTimeoutSeconds && before - after > requirements.maxTimeoutSeconds) {
      return `validity window ${before - after}s exceeds the quoted ${requirements.maxTimeoutSeconds}s`;
    }
    return null;
  }

  /**
   * Rule 7: what the chain says has to match the claim.
   *
   * @param claim - The signed claim.
   * @param requirements - What the seller quoted.
   * @param facts - What the chain returned.
   * @returns Problem descriptions.
   */
  private transferProblems(
    claim: MoiPaymentClaim,
    requirements: PaymentRequirements,
    facts: { sender: string; beneficiary: string; amount: bigint; assetId: string; callsite: string; succeeded: boolean },
  ): string[] {
    const problems: string[] = [];
    if (!facts.succeeded) problems.push("interaction reverted");
    if (!sameId(facts.sender, claim.from)) problems.push(`sender ${facts.sender}`);
    if (!sameId(facts.beneficiary, claim.to)) problems.push(`beneficiary ${facts.beneficiary}`);
    if (!sameId(facts.assetId, requirements.asset)) problems.push(`asset ${facts.assetId}`);
    if (facts.callsite !== MAS0_TRANSFER_CALLSITE) problems.push(`callsite ${facts.callsite}`);
    if (facts.amount < toBigInt(claim.value)) {
      problems.push(`amount ${facts.amount} < ${claim.value}`);
    }
    return problems;
  }
}

/**
 * Build a rejection.
 *
 * @param reason - Machine-readable reason.
 * @param message - Human-readable detail.
 * @returns An invalid VerifyResponse.
 */
const fail = (reason: string, message: string): VerifyResponse => ({
  isValid: false,
  invalidReason: reason,
  invalidMessage: message,
});
