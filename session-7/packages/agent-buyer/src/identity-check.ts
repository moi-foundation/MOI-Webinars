// The on-stage identity beat. Spec §8.2.
//
// The buyer does NOT trust the payTo it was handed in the 402. It reads the seller's operating
// wallet from the on-chain MOI agent registry and refuses if they disagree. This is the question
// x402 cannot ask — without it, payTo is 32 anonymous bytes.

import type { AgentRegistry } from "js-moi-agent-registry";
import { readAgentWallet, normalizeAddress, type PaymentRequirements } from "@demo/shared";

export interface IdentityVerdict {
  ok: boolean;
  registryWallet: string | null;
  reason?: string;
}

export async function checkSellerIdentity(
  registry: AgentRegistry | null,
  requirements: PaymentRequirements,
): Promise<IdentityVerdict> {
  const agentId = requirements.extra.payToAgentId;
  // Only skip when there is genuinely nothing to check against.
  if (!agentId || !registry) {
    return { ok: true, registryWallet: null, reason: "no registry or agent id — paying on trust" };
  }
  let registryWallet: string;
  try {
    registryWallet = await readAgentWallet(registry, agentId);
  } catch (err) {
    return { ok: false, registryWallet: null, reason: (err as Error).message };
  }
  if (normalizeAddress(registryWallet) !== normalizeAddress(requirements.payTo)) {
    return {
      ok: false,
      registryWallet,
      reason: `payTo ${requirements.payTo} does not match the registry wallet ${registryWallet}`,
    };
  }
  return { ok: true, registryWallet };
}
