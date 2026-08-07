// STAGE SHOWCASE ONLY — open this file when you talk about registry discovery.
//
// This is the API shape you want the room to see: list every agent id, load each profile,
// filter client-side on a skill tag. The live demo does NOT call this path.
//
// Why: on a real registry `getAllAgentIds()` reverts with MeterExhausted (~135 agents on
// devnet). The SDK returns [] instead of surfacing the error, so discovery looks empty.
// Production code in packages/shared/src/registry.ts uses getAgentsByOwner(owner) instead —
// same O(n) scan + tag filter, bounded to agents this wallet registered.
//
//   Do not wire this into demo / ui / buyer. Show it, then open registry.ts for the real call.

import {
  buyerAccount,
  registryClient,
  getProfile,
  readInlineCard,
  cardSkills,
  addr0x,
} from "@demo/shared";

const TAG = "sells-books";

async function main(): Promise<void> {
  const buyer = await buyerAccount();
  const reg = await registryClient(buyer, false);
  if (!reg) throw new Error("registry unavailable");

  // ── the method for the slide ────────────────────────────────────────────────────────────
  const ids = await reg.getAllAgentIds();
  console.log(`getAllAgentIds() → ${ids.length} agents`);

  // Same loop the real discoverBySkill runs after it has an id list: profile → card → tag.
  const matches = [];
  for (const id of ids) {
    const profile = await getProfile(reg, id);
    if (!profile) continue;
    const tags = cardSkills(readInlineCard(profile.card_uri)).flatMap((s) => s.tags ?? []);
    if (tags.some((t) => t.toLowerCase() === TAG)) {
      matches.push({
        agentId: profile.agent_id,
        wallet: addr0x(profile.agent_wallet),
        url: profile.url,
        tags,
      });
    }
  }

  console.log(`tag "${TAG}" → ${matches.length} match(es)`);
  console.log(JSON.stringify(matches, null, 2));
}

main().catch((e) => {
  console.error(`\nshowcase-discover-all failed: ${(e as Error).message}\n`);
  console.error("Expected on a full registry — live demo uses getAgentsByOwner instead.\n");
  process.exit(1);
});
