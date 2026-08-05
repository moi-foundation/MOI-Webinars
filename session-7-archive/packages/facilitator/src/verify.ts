// The verification chain.
//
// This is the heart of the talk. Eight checks run in order; each one prints a live pass/fail line
// so the audience can watch what a MOI facilitator can prove that no other x402 facilitator can.
//
// Checks 1–5 are what ANY x402 facilitator does: the payment is well-formed, signed, unexpired,
// and matches what was asked for.
//
// Checks 6–7 are MOI-only. They ask "WHO are these two parties?" and answer it from the on-chain
// agent registry. An x402 facilitator on any other chain sees two opaque addresses and has no way
// to tell a registered counterparty from a random key. This is the AUTHORITY layer.
//
// Check 8 confirms the money is actually escrowed on chain before anyone is told the payment is
// good — read directly from chain state, never taken on the buyer's word.

import type { AgentRegistry } from "js-moi-agent-registry";
import {
  MOI_SCHEME,
  MOI_NETWORK,
  identifierFromPublicKey,
  verifyAuthorization,
  nowSeconds,
  findAgentByWallet,
  normalizeAddress,
  type MoiAccount,
  type MoiPaymentPayload,
  type MoiPaymentRequirements,
  type MoiSettlementBackend,
  type VerificationCheck,
} from "@s7/shared";

export interface VerifyOutcome {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
  checks: VerificationCheck[];
}

export async function runVerification(args: {
  facilitator: MoiAccount;
  registry: AgentRegistry | null;
  backend: MoiSettlementBackend;
  payload: MoiPaymentPayload;
  requirements: MoiPaymentRequirements;
}): Promise<VerifyOutcome> {
  const { facilitator, registry, backend, payload, requirements } = args;
  const checks: VerificationCheck[] = [];
  const add = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail });
    return passed;
  };
  const bail = (reason: string): VerifyOutcome => ({ isValid: false, invalidReason: reason, checks });

  const auth = payload.payload?.authorization;
  if (!auth || !payload.payload?.signature || !payload.payload?.publicKey) {
    add("payload_well_formed", false, "missing authorization, signature or publicKey");
    return bail("invalid_payload");
  }
  add("payload_well_formed", true, "authorization + signature + publicKey present");

  // ── 1. scheme / network ──────────────────────────────────────────────────────────────────
  if (!add(
    "scheme_and_network",
    payload.scheme === MOI_SCHEME && payload.network === MOI_NETWORK,
    `${payload.scheme} on ${payload.network}`,
  )) {
    return bail("invalid_scheme");
  }

  // ── 2. signature ─────────────────────────────────────────────────────────────────────────
  // Verified live: false for a wrong key, false for a tampered message. SDK_NOTES.md §2.
  if (!add(
    "signature_valid",
    verifyAuthorization(facilitator.wallet, auth, payload.payload.signature, payload.payload.publicKey),
    "ECDSA_S256 over the canonical authorization",
  )) {
    return bail("invalid_signature");
  }

  // ── 3. the signing key really controls the account being debited ─────────────────────────
  // Derivation verified live against getIdentifier(), 4/4 wallets. SDK_NOTES.md §3.
  const derived = identifierFromPublicKey(payload.payload.publicKey);
  if (!add(
    "key_binds_to_account",
    derived === auth.from.toLowerCase(),
    `${derived === auth.from.toLowerCase() ? "publicKey derives to" : `publicKey derives to ${derived}, NOT`} ${auth.from}`,
  )) {
    return bail("invalid_payload");
  }

  // ── 4. the authorization matches what the seller asked for ───────────────────────────────
  const mismatches: string[] = [];
  if (auth.asset.toLowerCase() !== requirements.asset.toLowerCase()) mismatches.push("asset");
  if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) mismatches.push("payTo");
  if (auth.resource !== requirements.resource) mismatches.push("resource");
  let value: bigint;
  try {
    value = BigInt(auth.value);
  } catch {
    return bail("invalid_payload");
  }
  const required = BigInt(requirements.maxAmountRequired);
  if (value < required) mismatches.push("value");
  if (!add(
    "matches_requirements",
    mismatches.length === 0,
    mismatches.length === 0
      ? `${auth.value} of ${requirements.extra.symbol} for ${requirements.resource}`
      : `mismatch: ${mismatches.join(", ")}`,
  )) {
    return bail("invalid_payment_requirements");
  }

  // ── 5. freshness ─────────────────────────────────────────────────────────────────────────
  const now = nowSeconds();
  const after = Number(auth.validAfter);
  const before = Number(auth.validBefore);
  if (!add(
    "not_expired",
    now >= after && now <= before,
    now > before ? `expired ${now - before}s ago` : `valid for another ${before - now}s`,
  )) {
    return bail("payment_expired");
  }

  // ── 6 & 7. MOI AUTHORITY — who ARE these two parties? ────────────────────────────────────
  // This is the half of the problem x402 does not address. Without it, "payTo" is just 32 bytes.
  if (registry) {
    const payerAgent = await findAgentByWallet(registry, auth.from);
    if (!add(
      "payer_is_registered_agent",
      payerAgent !== null,
      payerAgent ? `${payerAgent.agent_id} (${payerAgent.status})` : "no registry entry for payer",
    )) {
      return bail("payer_not_registered");
    }

    const payeeAgent = await findAgentByWallet(registry, auth.to);
    const payeeOk =
      payeeAgent !== null &&
      (!requirements.extra.payToAgentId ||
        normalizeAddress(payeeAgent.agent_id) === normalizeAddress(requirements.extra.payToAgentId));
    if (!add(
      "payee_is_registered_agent",
      payeeOk,
      payeeAgent
        ? `${payeeAgent.agent_id} (${payeeAgent.status})`
        : "no registry entry for payee",
    )) {
      return bail("payee_not_registered");
    }
  } else {
    add("payer_is_registered_agent", true, "SKIPPED — registry not configured");
    add("payee_is_registered_agent", true, "SKIPPED — registry not configured");
  }

  // ── 8. the money is really escrowed ──────────────────────────────────────────────────────
  // Read from chain state (moi.Lockups), never from the buyer's claim.
  const funded = await backend.checkFunded({
    reader: facilitator,
    payer: auth.from,
    facilitator: facilitator.address,
    assetId: auth.asset,
    amount: value,
  });
  if (!add(
    "funds_escrowed_on_chain",
    funded,
    funded
      ? `${auth.value} locked with the facilitator as beneficiary`
      : "no matching lockup found on chain",
  )) {
    return bail("insufficient_funds");
  }

  return { isValid: true, payer: auth.from, checks };
}
