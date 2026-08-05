// The facilitator's check chain. DECISION B: every check here is READ-ONLY. The facilitator
// signs nothing and moves nothing — it is a referee confirming that the buyer's own transfer
// landed, and that the parties are who they claim to be.
//
// Checks 1–6 are what any x402 facilitator does. Check 7 is MOI-only: it asks the on-chain agent
// registry WHO the payee is. Checks 8–9 read the chain to confirm the money actually moved and
// that this transfer has not already been redeemed.

import type { AgentRegistry } from "js-moi-agent-registry";
import {
  SCHEME,
  NETWORK,
  canonicalAuthorizationBytes,
  nowSeconds,
  normalizeAddress,
  identifierFromPublicKey,
  sameKeyFamily,
  readTransfer,
  readAgentWallet,
  isMock,
  type Account,
  type ConsumedTransfers,
  type PaymentPayload,
  type PaymentRequirements,
  type VerificationCheck,
} from "@demo/shared";

export interface VerifyOutcome {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
  /** The buyer's own transfer hash, once confirmed on chain. */
  transaction?: string;
  checks: VerificationCheck[];
}

export async function runVerification(args: {
  facilitator: Account;
  registry: AgentRegistry | null;
  consumed: ConsumedTransfers;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  /** /verify only inspects; /settle consumes the transfer so it cannot be replayed. */
  consume: boolean;
}): Promise<VerifyOutcome> {
  const { facilitator, registry, consumed, payload, requirements } = args;
  const checks: VerificationCheck[] = [];
  const add = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail });
    return passed;
  };
  const bail = (reason: string): VerifyOutcome => ({ isValid: false, invalidReason: reason, checks });

  // ── 1. shape ────────────────────────────────────────────────────────────────────────────
  const inner = payload?.payload;
  const auth = inner?.authorization;
  if (!auth || !inner?.signature || !inner?.publicKey) {
    add("payload_well_formed", false, "missing authorization, signature or publicKey");
    return bail("invalid_payload");
  }
  add("payload_well_formed", true, "authorization + signature + publicKey present");

  // ── 2. scheme / network ─────────────────────────────────────────────────────────────────
  if (!add("scheme_and_network", payload.scheme === SCHEME && payload.network === NETWORK,
    `${payload.scheme} on ${payload.network}`)) return bail("invalid_scheme");

  // ── 3. signature ────────────────────────────────────────────────────────────────────────
  let signatureOk = false;
  try {
    signatureOk = facilitator.wallet.verify(
      canonicalAuthorizationBytes(auth), inner.signature, inner.publicKey,
    );
  } catch { signatureOk = false; }
  if (!add("signature_valid", signatureOk, "ECDSA_S256 over the canonical authorization")) {
    return bail("invalid_signature");
  }

  // ── 4. the signing key controls the paying account ──────────────────────────────────────
  // Sub-accounts SHARE the primary's key (inheritance is not key isolation), so the derived
  // identifier is the PRIMARY's. Match the 28-byte key family, not the whole identifier.
  const derived = identifierFromPublicKey(inner.publicKey);
  const keyOk = sameKeyFamily(derived, auth.from);
  if (!add("key_binds_to_account", keyOk,
    keyOk ? `key family matches ${auth.from} (sub-account #${parseInt(auth.from.slice(-8), 16)})`
          : `key derives to ${derived}, which cannot control ${auth.from}`)) {
    return bail("invalid_payload");
  }

  // ── 5. the authorization matches what the seller asked for ──────────────────────────────
  const mismatches: string[] = [];
  if (normalizeAddress(auth.asset) !== normalizeAddress(requirements.asset)) mismatches.push("asset");
  if (normalizeAddress(auth.to) !== normalizeAddress(requirements.payTo)) mismatches.push("payTo");
  if (auth.resource !== requirements.resource) mismatches.push("resource");
  let value: bigint;
  try { value = BigInt(auth.value); } catch { return bail("invalid_payload"); }
  if (value < BigInt(requirements.maxAmountRequired)) mismatches.push("value");
  if (!add("matches_requirements", mismatches.length === 0,
    mismatches.length === 0
      ? `${auth.value} ${requirements.extra.symbol} for ${requirements.resource}`
      : `mismatch: ${mismatches.join(", ")}`)) return bail("invalid_payment_requirements");

  // ── 6. freshness ────────────────────────────────────────────────────────────────────────
  const now = nowSeconds();
  const before = Number(auth.validBefore);
  if (!add("not_expired", now >= Number(auth.validAfter) && now <= before,
    now > before ? `expired ${now - before}s ago` : `valid for another ${before - now}s`)) {
    return bail("payment_expired");
  }

  // ── 7. MOI AUTHORITY — is the payee who it claims to be? ────────────────────────────────
  // The question x402 cannot ask. Without it, payTo is 32 anonymous bytes.
  if ((registry || isMock()) && requirements.extra.payToAgentId) {
    let registryWallet: string;
    try { registryWallet = await readAgentWallet(registry, requirements.extra.payToAgentId); }
    catch (err) {
      add("payee_is_registered_agent", false, (err as Error).message);
      return bail("payee_not_registered");
    }
    const walletOk = normalizeAddress(registryWallet) === normalizeAddress(auth.to);
    if (!add("payee_is_registered_agent", walletOk,
      walletOk
        ? `${requirements.extra.payToAgentId} -> ${registryWallet}`
        : `registry says ${registryWallet}, payment says ${auth.to}`)) {
      return bail("payee_wallet_mismatch");
    }
  } else {
    add("payee_is_registered_agent", true,
      "SKIPPED — no payToAgentId or registry unavailable. Run 03-register-agents.");
  }

  // ── 8. did the money actually move? read the chain ──────────────────────────────────────
  // The buyer submitted its OWN transfer; we confirm it independently rather than trusting it.
  let facts;
  try { facts = await readTransfer(auth.txHash, requirements.asset); }
  catch (err) {
    add("transfer_landed_on_chain", false, (err as Error).message);
    return bail("transfer_not_found");
  }

  const problems: string[] = [];
  if (normalizeAddress(facts.from) !== normalizeAddress(auth.from)) problems.push(`sender ${facts.from}`);
  if (normalizeAddress(facts.beneficiary) !== normalizeAddress(auth.to)) problems.push(`beneficiary ${facts.beneficiary}`);
  if (facts.amount < value) problems.push(`amount ${facts.amount} < ${value}`);
  if (!/transfer/i.test(facts.callsite)) problems.push(`callsite ${facts.callsite}`);
  if (!add("transfer_landed_on_chain", problems.length === 0,
    problems.length === 0
      ? `${facts.amount} -> ${facts.beneficiary} (ix ${facts.txHash})`
      : `on-chain transfer disagrees: ${problems.join(", ")}`)) {
    return bail("transfer_mismatch");
  }

  // ── 9. replay ───────────────────────────────────────────────────────────────────────────
  // One transfer buys one thing. /verify only looks; /settle consumes.
  if (!add("transfer_not_already_spent", !consumed.has(auth.txHash),
    consumed.has(auth.txHash) ? "this transfer has already been redeemed" : "unspent")) {
    return bail("duplicate_settlement");
  }
  if (args.consume) consumed.consume(auth.txHash);

  return { isValid: true, payer: auth.from, transaction: auth.txHash, checks };
}
