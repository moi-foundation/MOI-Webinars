// Agent registry wrapper. Spec §4.3, SDK_NOTES §2.1 (confirmed verbatim).
//
// DECISION D: the rich A2A card is stored INLINE as a data: URI. No external host, no IPFS, no
// live dependency during the demo. Only our own discoverBySkill ever dereferences it.

import { AgentRegistry, buildAgentCard, agentCardToJson } from "js-moi-agent-registry";
import type { AgentProfile, AgentCardInput, AgentProtocolSpec, CardUploader } from "js-moi-agent-registry";
import type { Account } from "./chain.js";
import { normalizeAddress } from "./chain.js";

export type { AgentProfile, AgentCardInput, AgentProtocolSpec };

/** An on-chain agent profile. */
export type Profile = AgentProfile;

/** DECISION D — inline the card, so nothing off-chain has to be up. */
export const dataUriUploader: CardUploader = async (cardJson: string) =>
  `data:application/json;base64,${Buffer.from(cardJson, "utf8").toString("base64")}`;

export const buildCardJson = (spec: AgentProtocolSpec, input: AgentCardInput): string =>
  agentCardToJson(buildAgentCard(spec, input));

/**
 * NOTE (SDK_NOTES): AgentRegistry.init() works with an unfunded wallet, but every READ builds a
 * sender and therefore needs the caller's account to EXIST on chain. Pass an account that does.
 */
/**
 * NOTE: AgentRegistry.init() works with an unfunded wallet, but every READ builds a sender and
 * therefore needs the caller's account to EXIST on chain. Pass an account that does.
 *
 * Returns null only when the registry is genuinely unreachable — callers degrade loudly.
 */
export async function registryClient(account: Account, withUploader = true): Promise<AgentRegistry | null> {
  return AgentRegistry.init({
    wallet: account.wallet,
    ...(withUploader ? { uploader: dataUriUploader } : {}),
  });
}

export async function getProfile(
  reg: AgentRegistry | null,
  agentId: string,
): Promise<Profile | null> {
  if (!reg) return null;
  const { profile, found } = await reg.getAgentProfile(agentId);
  return found && profile ? profile : null;
}

/** Repoint an agent's wallet — owner-only. Used by `demo --tamper`. */
export async function updateAgentWallet(
  reg: AgentRegistry | null,
  agentId: string,
  wallet: string,
): Promise<void> {
  if (!reg) throw new Error("registry unavailable");
  await reg.updateAgentWallet(agentId, wallet);
}

/** Register an agent on chain. Builds the A2A card, inlines it as a data: URI, and writes. */
export async function createAgentEntry(
  reg: AgentRegistry | null,
  owner: string,
  agentWallet: string,
  info: { name: string; description: string; url: string; skill: { id: string; name: string; description: string; tags: string[] } },
): Promise<string> {
  const cardInput: AgentCardInput = {
    name: info.name,
    description: info.description,
    version: "0.1.0",
    url: info.url,
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    skills: [info.skill],
  };
  if (!reg) throw new Error("registry unavailable");
  return reg.createAgent({ protocol: "a2a", protocolVersion: "1.0" }, { ...cardInput, agentWallet });
}

/** The identity check's source of truth: the seller's on-chain operating wallet. */
export async function readAgentWallet(reg: AgentRegistry | null, agentId: string): Promise<string> {
  const profile = await getProfile(reg, agentId);
  if (!profile) throw new Error(`agent ${agentId} is not registered`);
  return "0x" + normalizeAddress(profile.agent_wallet);
}

/**
 * Pull the skills out of a decoded card.
 *
 * `buildAgentCard` nests as `{ spec, agent_card }` and snake_cases its fields, so skills live at
 * `agent_card.skills` — NOT at the top level. Getting this wrong silently returns zero matches
 * from discovery rather than erroring, which is why it is a named function with a test.
 */
export function cardSkills(card: Record<string, unknown> | null): { tags?: string[] }[] {
  if (!card) return [];
  const nested = (card.agent_card ?? card) as Record<string, unknown>;
  const skills = nested.skills;
  return Array.isArray(skills) ? (skills as { tags?: string[] }[]) : [];
}

/** Decode a data: URI card back to JSON. Returns null for anything we cannot read. */
export function readInlineCard(cardUri: string): Record<string, unknown> | null {
  if (!cardUri?.startsWith("data:")) return null;
  const comma = cardUri.indexOf(",");
  if (comma === -1) return null;
  const payload = cardUri.slice(comma + 1);
  const isB64 = cardUri.slice(0, comma).includes(";base64");
  try {
    return JSON.parse(isB64 ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload));
  } catch {
    return null;
  }
}

/**
 * Discovery by skill tag.
 *
 * O(n) CLIENT-SIDE SCAN: getAllAgentIds() -> getAgentProfile per id -> read each card -> filter.
 * The registry has NO index and NO search. Fine at demo scale; never describe it as semantic or
 * indexed search (spec §1.1).
 */
const hasTag = (card: Record<string, unknown> | null, tag: string): boolean =>
  cardSkills(card).some((sk) => (sk.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()));

export async function discoverBySkill(
  reg: AgentRegistry | null,
  tag: string,
): Promise<Profile[]> {
  if (!reg) return [];
  const ids = await reg.getAllAgentIds();
  const out: Profile[] = [];
  for (const id of ids) {
    const profile = await getProfile(reg, id);
    if (!profile) continue;
    if (hasTag(readInlineCard(profile.card_uri), tag)) out.push(profile);
  }
  return out;
}
