// Register both agents in the on-chain MOI agent registry.
//
//   npm run setup:registry
//
// This is the step that makes the payment VERIFIABLE rather than merely valid: after this, the
// buyer can ask the chain "who owns this address?" before sending money.
//
// The rich A2A card is inlined as a `data:` URI — no external host, nothing to be down on stage.
// `agent_wallet` is what the identity check compares against.
//
// NOTE: the BUYER signs both registrations (it is the funded wallet, and the owner). The seller's
// wallet is only named as `agent_wallet` — it never has to sign or hold gas.

import {
  config, buyerAccount, sellerAccount, registryClient, getProfile, createAgentEntry,
  addr0x, banner, detail, ok, say, summary, type Account,
} from "@demo/shared";
import type { AgentRegistry } from "js-moi-agent-registry";
import { updateEnv } from "./env-file.js";

/**
 * `--fresh` registers new agents even when .env already names some. Needed whenever the skill tags
 * change: the registry has no card-update call, so an existing agent keeps its old tags forever and
 * `discoverBySkill` silently stops finding it.
 */
const FRESH = process.argv.slice(2).includes("--fresh");

async function register(
  reg: AgentRegistry | null,
  owner: Account,
  agentWallet: string,
  info: { name: string; description: string; url: string; skillId: string; skillName: string; skillDesc: string; tags: string[] },
  existing: string | null,
): Promise<string> {
  if (existing) {
    const profile = await getProfile(reg, existing);
    if (profile) { say("SETUP", `${info.name} already registered as ${existing}`); return existing; }
    say("SETUP", `${existing} not found — registering ${info.name} fresh`);
  }

  const agentId = await createAgentEntry(reg, owner.address, agentWallet, {
    name: info.name,
    description: info.description,
    url: info.url,
    skill: { id: info.skillId, name: info.skillName, description: info.skillDesc, tags: info.tags },
  });

  const profile = await getProfile(reg, agentId);
  if (!profile) throw new Error(`registered ${agentId} but read-back returned not-found`);
  ok(`${info.name} registered`);
  detail("agent id", agentId);
  detail("status", String(profile.status));
  detail("agent_wallet", addr0x(profile.agent_wallet));
  detail("card_uri", `${profile.card_uri.length} chars (inline data URI)`);
  return agentId;
}

async function main(): Promise<void> {
  banner("SETUP", "01", "Register both agents on chain");
  if (FRESH) say("SETUP", "--fresh: ignoring any existing agent ids, registering new ones");
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  const reg = await registryClient(buyer, true);
  detail("owner (signs)", buyer.address);

  const sellerId = await register(reg, buyer, seller.address, {
    name: "Probability Book Desk",
    description: "Sells bitcoin probability books (short paid estimates), settled in a native MAS0 asset.",
    url: config.sellerUrl,
    skillId: "sells-books",
    skillName: "Sells Books",
    skillDesc: "Returns a bitcoin probability book for a market in its catalog. Paid per call.",
    // `sells-books` is the tag the buyer scans the registry for (matches agent_132 on this wallet).
    tags: ["sells-books", "agent-payments", "bitcoin"],
  }, FRESH ? null : config.sellerAgentId);

  const buyerId = await register(reg, buyer, buyer.address, {
    name: "Risk Agent",
    description: "Autonomously finds probability-book desks on MOI and buys the book it needs.",
    url: `http://localhost:${config.buyerPort}`,
    skillId: "buys-books",
    skillName: "Buys Books",
    skillDesc: "Chooses and pays for probability books, checking the payee in this registry first.",
    tags: ["buys-books", "agent-payments"],
  }, FRESH ? null : config.buyerAgentId);

  const path = updateEnv({ SELLER_AGENT_ID: sellerId, BUYER_AGENT_ID: buyerId });
  summary("Agents registered", [
    ["SELLER_AGENT_ID", sellerId],
    ["BUYER_AGENT_ID", buyerId],
    ["written to", path],
    ["next", "npm run demo"],
  ]);
}

main().catch((e) => { console.error(`\n01-register-agents failed: ${(e as Error).message}\n`); process.exit(1); });
