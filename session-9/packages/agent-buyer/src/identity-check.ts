// The on-stage beat.
//
// The buyer does NOT trust the payTo it was just handed. It reads the seller's operating wallet
// from the on-chain MOI agent registry and refuses if the two disagree.
//
// This is the one piece that survived dropping x402 unchanged, because it never had anything to do
// with x402. Any payment protocol tells you WHERE to send money. None of them tell you WHOSE
// address that is. That answer has to come from somewhere, and here it comes from the chain.

import type { AgentRegistry } from "js-moi-agent-registry";
import { readAgentWallet, normalizeAddress, type Quote } from "@demo/shared";

export interface IdentityVerdict {
  ok: boolean;
  registryWallet: string | null;
  reason?: string;
}

export async function checkSellerIdentity(
  registry: AgentRegistry | null,
  quote: Quote,
  /** The agent id discovery actually settled on, when there was one. */
  expectedAgentId?: string | null,
): Promise<IdentityVerdict> {
  const agentId = quote.payToAgentId;
  // Only skip when there is genuinely nothing to check against.
  if (!agentId || !registry) {
    return { ok: true, registryWallet: null, reason: "no registry or agent id — paying on trust" };
  }

  // Is this even the agent we came here for? Without this the quote could name any OTHER
  // registered agent, and the wallet check below would happily pass against THAT agent's entry.
  // The money would reach a real registered wallet — just not the one we chose to buy from.
  // Only enforced when discovery resolved an agent; the fallback-URL path has nothing to compare.
  if (expectedAgentId && agentId !== expectedAgentId) {
    return {
      ok: false,
      registryWallet: null,
      reason: `quote claims to be ${agentId}, but we came here for ${expectedAgentId}`,
    };
  }
  let registryWallet: string;
  try {
    registryWallet = await readAgentWallet(registry, agentId);
  } catch (err) {
    return { ok: false, registryWallet: null, reason: (err as Error).message };
  }
  if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo)) {
    return {
      ok: false,
      registryWallet,
      reason: `payTo ${quote.payTo} does not match the registry wallet ${registryWallet}`,
    };
  }
  return { ok: true, registryWallet };
}
