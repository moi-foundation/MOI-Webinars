// The owner grants the agent an allowance. This is the whole of session 8's setup.
//
//   npm run setup:authority
//
// Session 7 funded the agent directly: its wallet, its float, its call. The limit was an env var
// the agent read and honoured.
//
// Here the OWNER keeps the float and grants a capped, expiring permission to spend it. The agent
// pays with transferFrom against the owner's balance. It cannot exceed the cap, because the chain
// checks every pull. It cannot raise the cap, because approve is the owner's operation on the
// owner's funds.
//
// The agent still needs FUEL to sign its own interactions — so this also seeds it with KMOI. That
// is the one thing it holds.

import { MAS0AssetLogic, getAssetDriver, KMOI_ASSET_ID } from "js-moi-sdk";
import {
  config, FUEL_LIMIT,
  buyerAccount, agentAccount, sellerAccount, existsOnChain,
  banner, detail, ok, fail, warn, say, summary, type Account,
} from "@demo/shared";

/** Balance that distinguishes "zero" from "cannot read". null = unreadable. */
async function balanceOf(reader: Account, assetId: string, holder: string): Promise<bigint | null> {
  try {
    const driver: any = await getAssetDriver(assetId, reader.wallet);
    const { output, error } = await driver.routines.BalanceOf(holder);
    if (error) return null;
    return BigInt(output?.balance ?? 0);
  } catch { return null; }
}

async function main(): Promise<void> {
  const owner = await buyerAccount();     // holds the float
  const agent = await agentAccount();     // spends it, holds none
  const seller = await sellerAccount();

  banner("SETUP", "authority", "Grant the agent a capped, expiring allowance");
  detail("owner (benefactor)", owner.address);
  detail("agent (spender)", agent.address);
  detail("seller (payee)", seller.address);
  detail("allowance", `${config.agentAllowance} ${config.assetSymbol}`);
  detail("expires in", `${config.allowanceTtlSeconds}s`);

  if (!(await existsOnChain(owner))) {
    throw new Error("owner account is not on chain — run `npm run preflight`, then fund it");
  }

  const float = await balanceOf(owner, config.assetId, owner.address);
  if (float === null) {
    throw new Error("cannot read the owner's balance — SETTLEMENT_ASSET_ID is stale. Run `npm run setup:asset`");
  }
  detail("owner float", `${float} ${config.assetSymbol}`);
  if (float < config.agentAllowance) {
    throw new Error(`owner holds ${float}; cannot grant ${config.agentAllowance}. Run \`npm run setup:asset\`.`);
  }

  // ── the agent needs fuel of its own, and nothing else ────────────────────────────────────
  const agentFuel = await balanceOf(agent, KMOI_ASSET_ID, agent.address);
  if (agentFuel === null || agentFuel === 0n) {
    say("SETUP", "Agent has no fuel — seeding it so it can sign its own interactions.");
    const seed = BigInt(FUEL_LIMIT * 3);
    const ix = await new MAS0AssetLogic(KMOI_ASSET_ID, owner.wallet)
      .transfer(agent.address, Number(seed))
      .send({ fuel_limit: FUEL_LIMIT });
    const r = (await ix.result()) as unknown as { error?: unknown };
    if (r?.error) throw new Error(`fuel seed failed: ${JSON.stringify(r.error)}`);
    ok(`seeded ${seed} KMOI — ix ${ix.hash}`);
  } else {
    ok(`agent already holds ${agentFuel} KMOI for fuel`);
  }

  // The agent must NOT hold the settlement asset. If it does, it can spend outside the allowance
  // and the whole claim of this session is void.
  const agentFloat = await balanceOf(agent, config.assetId, agent.address);
  if (agentFloat !== null && agentFloat > 0n) {
    warn(`agent holds ${agentFloat} ${config.assetSymbol} of its own.`);
    warn("It can spend that WITHOUT the allowance. Session 8's claim only holds at zero.");
  } else {
    ok(`agent holds no ${config.assetSymbol} — it can only spend the owner's, under the grant`);
  }

  // ── the grant ────────────────────────────────────────────────────────────────────────────
  const expiresAt = Math.floor(Date.now() / 1000) + config.allowanceTtlSeconds;
  const ix = await new MAS0AssetLogic(config.assetId, owner.wallet)
    .approve(agent.address, Number(config.agentAllowance), expiresAt)
    .send({ fuel_limit: FUEL_LIMIT });
  const r = (await ix.result()) as unknown as { error?: unknown };
  if (r?.error) { fail(`approve reverted: ${JSON.stringify(r.error)}`); process.exit(1); }
  ok(`approve(agent, ${config.agentAllowance}, +${config.allowanceTtlSeconds}s) — ix ${ix.hash}`);

  say("SETUP", "MOI has no routine to READ an allowance — you cannot ask the chain what is left.");
  say("SETUP", "That is why the demo also keeps a ledger. The ledger shows; the allowance decides.");

  summary("Authority granted", [
    ["grant ix", ix.hash],
    ["allowance", `${config.agentAllowance} ${config.assetSymbol}`],
    ["expires", new Date(expiresAt * 1000).toISOString()],
    ["next", "npm run demo"],
  ]);
}

main().catch((e) => { console.error(`\ngrant-authority failed: ${(e as Error).message}\n`); process.exit(1); });
