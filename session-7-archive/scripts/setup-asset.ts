// Mint the MAS0 payment asset ("USDM") on MOI Voyage devnet.
//
//   npm run setup-asset
//
// Idempotent: if ASSET_ID is already set in .env, this only tops up balances.
//
// Note there is no `approve` step. Settlement uses Lockup -> Release -> Transfer, and the buyer
// creates the lockup per request, so nothing standing needs authorizing. See settlement.ts.

import { MAS0AssetLogic } from "js-moi-sdk";
import {
  config,
  walletConfig,
  loadAccount,
  assetBalance,
  banner,
  detail,
  ok,
  warn,
  say,
  summary,
  amount as fmtAmount,
  FAUCET_URL,
  type MoiAccount,
} from "@s7/shared";
import { updateEnv } from "./env-file.js";

// Enough for a long demo session: ~1000 signals at the default price.
const SUPPLY = 1_000_000_000n;
const AGENT_A_FLOAT = 1_000_000n;

async function requireOnChain(account: MoiAccount): Promise<void> {
  try {
    await account.provider.getAccountMetaInfo(account.address);
    ok(`${account.label} is funded on devnet`);
  } catch {
    throw new Error(
      `${account.label} (${account.address}) is not on devnet yet. Fund it at ${FAUCET_URL} using derivation path m/44'/6174'/7020'/0/0, then re-run.`,
    );
  }
}

async function main(): Promise<void> {
  banner("SETUP", "1/3", "Loading wallets");
  const agentA = await loadAccount(walletConfig("AGENT_A"));
  const agentB = await loadAccount(walletConfig("AGENT_B"));
  const facilitator = await loadAccount(walletConfig("FACILITATOR"));
  detail("agent-a (buyer)", agentA.address);
  detail("agent-b (seller)", agentB.address);
  detail("facilitator", facilitator.address);

  if (facilitator.address === agentB.address) {
    warn("facilitator and agent-b share a wallet — the demo works, but the roles are collapsed");
  }
  if (agentA.address === agentB.address) {
    throw new Error("agent-a and agent-b must be different wallets — an agent cannot pay itself.");
  }

  banner("SETUP", "2/3", "Checking devnet funding");
  await requireOnChain(agentA);
  await requireOnChain(facilitator);
  try {
    await requireOnChain(agentB);
  } catch (err) {
    // agent-b only needs to RECEIVE for Tier 1, so it can be unfunded here — but it cannot
    // register itself later without fuel. Warn rather than block.
    warn((err as Error).message);
    warn("agent-b can still receive payment, but `npm run register-agents` will fail for it.");
  }

  banner("SETUP", "3/3", `MAS0 asset — ${config.assetSymbol}`);
  let assetId = process.env.ASSET_ID?.trim();

  if (assetId) {
    say("SETUP", `reusing existing asset ${assetId}`);
  } else {
    // agent-a creates and manages the asset, so it holds the whole supply to start with.
    const ix = await MAS0AssetLogic.create(
      agentA.wallet,
      config.assetSymbol,
      SUPPLY,
      agentA.address,
      true,
    ).send();
    const result = (await ix.result()) as [{ asset_id: string }];
    const created = result[0]?.asset_id;
    if (!created) throw new Error("asset creation returned no asset_id");
    assetId = created;
    ok(`created ${config.assetSymbol}  asset_id=${assetId}`);
    detail("ix hash", ix.hash);
  }

  updateEnv({ ASSET_ID: assetId });

  // Make sure agent-a has a working float to spend.
  const balance = await assetBalance(agentA, assetId, agentA.address);
  if (balance < AGENT_A_FLOAT) {
    const mint = await new MAS0AssetLogic(assetId, agentA.wallet)
      .mint(agentA.address, AGENT_A_FLOAT)
      .send();
    await mint.result();
    ok(`minted ${fmtAmount(AGENT_A_FLOAT, config.assetDecimals, config.assetSymbol)} to agent-a`);
    detail("ix hash", mint.hash);
  }

  const [aBal, bBal, fBal] = await Promise.all([
    assetBalance(agentA, assetId, agentA.address),
    assetBalance(agentA, assetId, agentB.address),
    assetBalance(agentA, assetId, facilitator.address),
  ]);

  summary("Asset ready", [
    ["ASSET_ID", assetId],
    ["symbol", config.assetSymbol],
    ["agent-a balance", fmtAmount(aBal, config.assetDecimals, config.assetSymbol)],
    ["agent-b balance", fmtAmount(bBal, config.assetDecimals, config.assetSymbol)],
    ["facilitator balance", fmtAmount(fBal, config.assetDecimals, config.assetSymbol)],
    ["next", "npm run register-agents"],
  ]);
}

main().catch((err) => {
  console.error(`\nsetup-asset failed: ${(err as Error).message}\n`);
  process.exit(1);
});
