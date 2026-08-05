// Register agent-a and agent-b in the on-chain MOI agent registry.
//
//   npm run register-agents
//
// This is the AUTHORITY half of the thesis. After this runs, both agents have a verifiable
// on-chain identity, so the facilitator can answer "who is this payer?" and the buyer can answer
// "is this seller who it claims to be?" — questions x402 has no way to ask.
//
// We use `registerAgent` with a `data:` URI card rather than `createAgent` + a hosted uploader, so
// nothing off-chain has to be up during the demo. See SDK_NOTES.md §6.

import {
  config,
  walletConfig,
  loadAccount,
  openRegistry,
  lookupAgent,
  inlineCardUri,
  normalizeAddress,
  banner,
  detail,
  ok,
  say,
  summary,
  type MoiAccount,
} from "@s7/shared";
import { updateEnv } from "./env-file.js";

async function register(
  account: MoiAccount,
  spec: { name: string; description: string; url: string; skills: unknown[] },
  existingId: string | undefined,
): Promise<string> {
  const registry = await openRegistry(account);

  if (existingId) {
    const profile = await lookupAgent(registry, existingId);
    if (profile && normalizeAddress(profile.agent_wallet) === normalizeAddress(account.address)) {
      say("SETUP", `${spec.name} already registered as ${existingId}`);
      return existingId;
    }
    say("SETUP", `${existingId} is stale or not ours — registering ${spec.name} fresh`);
  }

  const cardUri = inlineCardUri({
    protocolVersion: "1.0",
    protocol: "a2a",
    name: spec.name,
    description: spec.description,
    version: "0.1.0",
    url: spec.url,
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    skills: spec.skills,
    // Declaring x402 support in the card is how another agent would discover that this one can
    // transact — the registry entry is the discovery surface, not just an identity record.
    payments: {
      protocol: "x402",
      scheme: "exact-mas0",
      network: "moi-devnet",
      asset: config.assetId,
    },
  });

  const agentId = await registry.registerAgent({
    url: spec.url,
    cardUri,
    agentWallet: account.address,
  });

  const profile = await lookupAgent(registry, agentId);
  if (!profile) throw new Error(`registered ${agentId} but the profile read back as not-found`);

  ok(`${spec.name} registered`);
  detail("agent id", agentId);
  detail("status", String(profile.status));
  detail("agent wallet", `0x${normalizeAddress(profile.agent_wallet)}`);
  detail("url", profile.url);
  return agentId;
}

async function main(): Promise<void> {
  banner("SETUP", "1/2", "Registering agent-b (the seller)");
  const agentB = await loadAccount(walletConfig("AGENT_B"));
  const agentBId = await register(
    agentB,
    {
      name: "Signal Agent",
      description: "Sells prediction-market probability estimates, priced in MAS0 and paid over x402.",
      url: config.agentBUrl,
      skills: [
        {
          id: "prediction-signal",
          name: "Prediction Signal",
          description: "Returns a probability estimate for a named prediction market.",
          tags: ["x402", "signal", "prediction-market"],
        },
      ],
    },
    config.agentBId,
  );

  banner("SETUP", "2/2", "Registering agent-a (the buyer)");
  const agentA = await loadAccount(walletConfig("AGENT_A"));
  const agentAId = await register(
    agentA,
    {
      name: "Research Agent",
      description: "Autonomously buys signals from other MOI agents over x402.",
      url: "https://example.invalid/research-agent",
      skills: [
        {
          id: "signal-consumer",
          name: "Signal Consumer",
          description: "Discovers and pays for prediction signals.",
          tags: ["x402", "buyer"],
        },
      ],
    },
    config.agentAId,
  );

  const path = updateEnv({ AGENT_A_ID: agentAId, AGENT_B_ID: agentBId });

  summary("Agents registered on MOI", [
    ["AGENT_A_ID", agentAId],
    ["AGENT_B_ID", agentBId],
    ["written to", path],
    ["next", "npm run demo"],
  ]);
}

main().catch((err) => {
  console.error(`\nregister-agents failed: ${(err as Error).message}\n`);
  process.exit(1);
});
