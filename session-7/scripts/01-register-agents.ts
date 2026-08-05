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
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  const reg = await registryClient(buyer, true);
  detail("owner (signs)", buyer.address);

  const sellerId = await register(reg, buyer, seller.address, {
    name: "Bookseller",
    description: "Sells book summaries, priced per call and settled in a native MAS0 asset.",
    url: config.sellerUrl,
    skillId: "sells-books",
    skillName: "Sells Books",
    skillDesc: "Returns a summary and key ideas for a book in its catalog. Paid per call.",
    // `sells-books` is the tag the buyer searches the registry for.
    tags: ["sells-books", "agent-payments", "books"],
  }, config.sellerAgentId);

  const buyerId = await register(reg, buyer, buyer.address, {
    name: "Reader",
    description: "Autonomously finds booksellers on MOI and buys the summary it needs.",
    url: `http://localhost:${config.buyerPort}`,
    skillId: "buys-books",
    skillName: "Buys Books",
    skillDesc: "Chooses and pays for book summaries, checking the payee in this registry first.",
    tags: ["buys-books", "agent-payments"],
  }, config.buyerAgentId);

  const path = updateEnv({ SELLER_AGENT_ID: sellerId, BUYER_AGENT_ID: buyerId });
  summary("Agents registered", [
    ["SELLER_AGENT_ID", sellerId],
    ["BUYER_AGENT_ID", buyerId],
    ["written to", path],
    ["next", "npm run demo"],
  ]);
}

main().catch((e) => { console.error(`\n01-register-agents failed: ${(e as Error).message}\n`); process.exit(1); });
