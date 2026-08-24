// The seller checks its own payments. Seven checks, all in-process — every check is a read; the
// only write is recording the transfer hash afterwards so it cannot buy twice.
//
// SESSION 9: the envelope is now x402's, so this takes a PaymentPayload and PaymentRequirements
// instead of our own Proof and Quote. The CHECKS are unchanged — a standard wire format does not
// change what has to be true for a payment to be real.
//
// In the x402 version this lived in a separate facilitator service and there were nine checks.
// Two are gone, and their absence is the point:
//
//   - `scheme_and_network` was protocol bookkeeping. With one wire format there is nothing to
//     negotiate.
//   - `payee_is_registered_agent` asked whether payTo belongs to a registered agent. The seller
//     IS the payee, so asking itself is theatre. That check now lives with the party actually at
//     risk — the buyer, in identity-check.ts, before any money moves.
//
// What could not be dropped: the seller still reads the chain itself. Believing the buyer's word
// that a transfer happened would make the whole thing decorative.

import {
  canonicalAuthorizationBytes,
  nowSeconds,
  normalizeAddress,
  identifierFromPublicKey,
  readTransfer,
  type Account,
  type ConsumedTransfers,
  type CheckResult,
  type PaymentPayload,
  type PaymentRequirements,
} from "@demo/shared";

export interface VerifyOutcome {
  ok: boolean;
  reason?: string;
  payer?: string;
  /** The buyer's own transfer hash, once confirmed on chain. */
  txHash?: string;
  checks: CheckResult[];
}

export async function verifyPayment(args: {
  /** Any account — used only for its `verify`, which needs no key material. */
  seller: Account;
  consumed: ConsumedTransfers;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  /** Burn the transfer so it cannot buy twice. False when only inspecting. */
  consume: boolean;
}): Promise<VerifyOutcome> {
  const { seller, consumed, payload, requirements } = args;
  const inner = payload?.payload;
  const checks: CheckResult[] = [];
  const add = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail });
    return passed;
  };
  const bail = (reason: string): VerifyOutcome => ({ ok: false, reason, checks });

  // ── 1. shape ────────────────────────────────────────────────────────────────────────────
  const claim = inner?.authorization;
  if (!claim || !inner?.signature || !inner?.publicKey) {
    add("payload_well_formed", false, "missing authorization, signature or publicKey");
    return bail("invalid_proof");
  }
  add("payload_well_formed", true, "authorization + signature + publicKey present");

  // ── 2. signature ────────────────────────────────────────────────────────────────────────
  let signatureOk = false;
  try {
    signatureOk = seller.wallet.verify(
      canonicalAuthorizationBytes(claim), inner.signature, inner.publicKey,
    );
  } catch { signatureOk = false; }
  if (!add("signature_valid", signatureOk, "ECDSA_S256 over the canonical claim")) {
    return bail("invalid_signature");
  }

  // ── 3. the signing key controls the paying account ──────────────────────────────────────
  // Participant identifiers are derived from public keys, so this proves the signer really owns
  // the account being debited. A valid signature alone could still merely CLAIM someone else's
  // `from` — which is exactly how you would steal a stranger's transfer.
  const derived = identifierFromPublicKey(inner.publicKey);
  const keyOk = derived === claim.from.toLowerCase();
  if (!add("key_binds_to_payer", keyOk,
    keyOk ? `publicKey derives to ${claim.from}`
          : `key derives to ${derived}, which cannot control ${claim.from}`)) {
    return bail("invalid_proof");
  }

  // ── 4. the claim matches what we quoted ─────────────────────────────────────────────────
  const mismatches: string[] = [];
  if (normalizeAddress(claim.asset) !== normalizeAddress(requirements.asset)) mismatches.push("asset");
  if (normalizeAddress(claim.to) !== normalizeAddress(requirements.payTo)) mismatches.push("payTo");
  if (claim.resource !== requirements.resource) mismatches.push("resource");
  let value: bigint;
  try { value = BigInt(claim.value); } catch { return bail("invalid_proof"); }
  if (value < BigInt(requirements.maxAmountRequired)) mismatches.push("value");
  if (!add("matches_requirements", mismatches.length === 0,
    mismatches.length === 0
      ? `${claim.value} ${requirements.extra.symbol} for ${requirements.resource}`
      : `mismatch: ${mismatches.join(", ")}`)) return bail("requirements_mismatch");

  // ── 5. freshness ────────────────────────────────────────────────────────────────────────
  const now = nowSeconds();
  const after = Number(claim.validAfter);
  const before = Number(claim.validBefore);
  const fresh = now >= after && now <= before;
  if (!add("not_expired", fresh,
    now > before ? `expired ${now - before}s ago`
      : now < after ? `not valid for another ${after - now}s`
      : `valid for another ${before - now}s`)) {
    return bail("payment_expired");
  }

  // ── 6. did the money actually move? read the chain ──────────────────────────────────────
  // The buyer submitted its own transfer. We confirm it independently rather than trusting it.
  let facts;
  try { facts = await readTransfer(claim.txHash, requirements.asset); }
  catch (err) {
    add("transfer_landed_on_chain", false, (err as Error).message);
    return bail("transfer_not_found");
  }

  const problems: string[] = [];
  if (normalizeAddress(facts.from) !== normalizeAddress(claim.from)) problems.push(`sender ${facts.from}`);
  if (normalizeAddress(facts.beneficiary) !== normalizeAddress(claim.to)) problems.push(`beneficiary ${facts.beneficiary}`);
  if (facts.amount < value) problems.push(`amount ${facts.amount} < ${value}`);
  if (!/transfer/i.test(facts.callsite)) problems.push(`callsite ${facts.callsite}`);
  if (!add("transfer_landed_on_chain", problems.length === 0,
    problems.length === 0
      ? `${facts.amount} -> ${facts.beneficiary} (ix ${facts.txHash})`
      : `on-chain transfer disagrees: ${problems.join(", ")}`)) {
    return bail("transfer_mismatch");
  }

  // ── 7. replay ───────────────────────────────────────────────────────────────────────────
  // One transfer buys one thing.
  if (!add("transfer_not_already_spent", !consumed.has(claim.txHash),
    consumed.has(claim.txHash) ? "this transfer has already been redeemed" : "unspent")) {
    return bail("already_spent");
  }
  if (args.consume) consumed.consume(claim.txHash);

  return { ok: true, payer: claim.from, txHash: claim.txHash, checks };
}
