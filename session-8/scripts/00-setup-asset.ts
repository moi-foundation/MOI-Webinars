// Create the native MAS0 asset the agents pay with, and give the buyer a float.
//
//   pnpm setup:asset
//
// SESSION 8 = V2. The PRIMARY is the funded wallet; both agents are inherited sub-accounts of it
// (provisioned in 02-provision-agents). Here we just create the asset and float the buyer.
//
// Idempotent: reuses SETTLEMENT_ASSET_ID when already set.

import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";
import {
  config, primaryAccount, buyerAccount, sellerAccount, existsOnChain,
  banner, detail, ok, warn, say, summary, FAUCET_URL, type Account,
} from "@demo/shared";
import { updateEnv } from "./env-file.js";

const SUPPLY = 1_000_000_000n;
const BUYER_FLOAT = 100_000n;

async function balance(reader: Account, assetId: string, holder: string): Promise<bigint> {
  try {
    const driver: any = await getAssetDriver(assetId, reader.wallet);
    const { output, error } = await driver.routines.BalanceOf(holder);
    if (error) {
      const m = String(error.error ?? error.message ?? JSON.stringify(error));
      if (!/asset not found|token not found/i.test(m)) throw new Error(m);
    }
    return BigInt(output?.balance ?? 0);
  } catch { return 0n; }
}

async function main(): Promise<void> {
  banner("SETUP", "00", "Native MAS0 asset + buyer float");
  const primary = await primaryAccount();
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  detail("primary (funded)", primary.address);
  detail("buyer  sub-account", `#${buyer.index}  ${buyer.address}`);
  detail("seller sub-account", `#${seller.index}  ${seller.address}`);

  if (!(await existsOnChain(primary))) {
    throw new Error(
      `primary ${primary.address} is not on devnet. Fund it at ${FAUCET_URL} (path ${config.derivationPath}).`,
    );
  }
  ok("primary is funded on devnet");
  say("SETUP", "sub-accounts are provisioned in 02-provision-agents; this step only creates the asset");

  let assetId = config.assetIdOrNull;
  if (assetId) {
    say("SETUP", `reusing existing asset ${assetId}`);
  } else {
    const ix = await MAS0AssetLogic.create(
      primary.wallet, config.assetSymbol, SUPPLY, primary.address, true,
    ).send();
    const created = (await ix.result()) as unknown as [{ asset_id: string }];
    assetId = created?.[0]?.asset_id;
    if (!assetId) throw new Error("asset creation returned no asset_id");
    ok(`created ${config.assetSymbol}  asset_id=${assetId}`);
    detail("ix hash", ix.hash);
  }
  updateEnv({ SETTLEMENT_ASSET_ID: assetId });

  const held = await balance(primary, assetId, buyer.address);
  if (held < BUYER_FLOAT) {
    const mint = await new MAS0AssetLogic(assetId, primary.wallet).mint(buyer.address, BUYER_FLOAT).send();
    await mint.result();
    ok(`minted ${BUYER_FLOAT} ${config.assetSymbol} to the buyer sub-account`);
    detail("ix hash", mint.hash);
  } else {
    ok(`buyer already holds ${held} ${config.assetSymbol}`);
  }

  if (!(await existsOnChain(primary, seller.address))) {
    warn("seller sub-account is not on chain yet — 02-provision-agents will inherit it");
  }

  summary("Asset ready", [
    ["SETTLEMENT_ASSET_ID", assetId],
    ["buyer balance", String(await balance(primary, assetId, buyer.address))],
    ["seller balance", String(await balance(primary, assetId, seller.address))],
    ["next", "pnpm setup:budget"],
  ]);
}

main().catch((e) => { console.error(`\n00-setup-asset failed: ${(e as Error).message}\n`); process.exit(1); });
