// Agent-registry helpers — MOI as the AUTHORITY layer.
//
// This is half the thesis: x402 tells you *how much* to pay and *to which address*, but nothing
// about *who* that address is. The MOI agent registry turns a 32-byte identifier into a verifiable
// participant with an owner, a status, and a service URL.
//
// Design choice (SDK_NOTES.md §6): we use `registerAgent` with a `data:` URI card rather than
// `createAgent` + an external uploader service, so nothing off-chain has to be up during the demo.

import { AgentRegistry } from "js-moi-agent-registry";
import type { AgentProfile } from "js-moi-agent-registry";
import type { MoiAccount } from "./moi.js";

export type { AgentProfile };

/** Open a registry client. `init` fetches the contract manifest from chain — no logic id needed. */
export async function openRegistry(account: MoiAccount): Promise<AgentRegistry> {
  return AgentRegistry.init({ wallet: account.wallet });
}

/** Build an inline agent card as a `data:` URI — no hosting required. */
export function inlineCardUri(card: Record<string, unknown>): string {
  const json = JSON.stringify(card);
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}

/**
 * Look up an agent by id and return its profile, or null if unregistered.
 * `getAgentProfile` returns `{ found: false }` rather than throwing.
 */
export async function lookupAgent(
  registry: AgentRegistry,
  agentId: string,
): Promise<AgentProfile | null> {
  const { profile, found } = await registry.getAgentProfile(agentId);
  return found && profile ? profile : null;
}

/**
 * The authority check the facilitator performs: is `address` the operating wallet of a registered,
 * ACTIVE agent? Returns the profile when yes, null when no.
 *
 * This is what x402 alone cannot answer.
 */
export async function findAgentByWallet(
  registry: AgentRegistry,
  address: string,
): Promise<AgentProfile | null> {
  const want = normalizeAddress(address);
  for (const id of await registry.getAllAgentIds()) {
    const profile = await lookupAgent(registry, id);
    if (profile && normalizeAddress(profile.agent_wallet) === want) return profile;
  }
  return null;
}

/**
 * The registry returns addresses without a 0x prefix in some fields (session-3's discover.mjs
 * prints `0x${profile.owner}`), so compare on a normalized form.
 */
export function normalizeAddress(address: string): string {
  const s = address.toLowerCase();
  return s.startsWith("0x") ? s.slice(2) : s;
}
