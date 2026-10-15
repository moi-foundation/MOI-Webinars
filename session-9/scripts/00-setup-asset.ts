// Create the native MAS0 asset the agents pay with, and give the buyer a float.
//
//   npm run setup:asset
//
// SESSION 7 = V1: no logic to deploy, no sub-accounts to inherit. Just an asset and a balance.
// The BUYER is the funded wallet (it signs the transfer, so it needs gas). The SELLER only ever
// receives, so it needs no funding — one faucet top-up runs the whole demo.
//
// Idempotent: reuses SETTLEMENT_ASSET_ID when already set.

import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";
import {
  config, buyerAccount, sellerAccount, existsOnChain,
  banner, detail, ok, warn, say, summary, FAUCET_URL, type Account,
} from "@demo/shared";
import { updateEnv } from "./env-file.js";

// js-moi-providers validates max_supply as typeof === "number"; bigint throws
// "Failed to sign interaction" / "max_supply must be a non-negative number".
const SUPPLY = 1_000_000_000;
const BUYER_FLOAT = 100_000;

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
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  detail("buyer  (funded)", buyer.address);
  detail("seller (receives)", seller.address);

  if (buyer.address === seller.address) {
    throw new Error("buyer and seller resolve to the same address — set SELLER_DERIVATION_PATH.");
  }
  if (!(await existsOnChain(buyer))) {
    throw new Error(
      `buyer ${buyer.address} is not on devnet. Fund it at ${FAUCET_URL} (path ${config.derivationPath}).`,
    );
  }
  ok("buyer is funded on devnet");
  say("SETUP", "the seller never signs anything, so it needs no funding at all");

  let assetId = config.assetIdOrNull;
  if (assetId) {
    say("SETUP", `reusing existing asset ${assetId}`);
  } else {
    const ix = await MAS0AssetLogic.create(
      buyer.wallet, config.assetSymbol, SUPPLY, buyer.address, true,
    ).send();
    const created = (await ix.result()) as unknown as [{ asset_id: string }];
    assetId = created?.[0]?.asset_id;
    if (!assetId) throw new Error("asset creation returned no asset_id");
    ok(`created ${config.assetSymbol}  asset_id=${assetId}`);
    detail("ix hash", ix.hash);
  }
  updateEnv({ SETTLEMENT_ASSET_ID: assetId });

  const held = await balance(buyer, assetId, buyer.address);
  if (held < BigInt(BUYER_FLOAT)) {
    const mint = await new MAS0AssetLogic(assetId, buyer.wallet).mint(buyer.address, BUYER_FLOAT).send();
    await mint.result();
    ok(`minted ${BUYER_FLOAT} ${config.assetSymbol} to the buyer`);
    detail("ix hash", mint.hash);
  } else {
    ok(`buyer already holds ${held} ${config.assetSymbol}`);
  }

  if (!(await existsOnChain(buyer, seller.address))) {
    warn("seller is not on chain yet — that is fine; it will appear when it first receives funds");
  }

  summary("Asset ready", [
    ["SETTLEMENT_ASSET_ID", assetId],
    ["buyer balance", String(await balance(buyer, assetId, buyer.address))],
    ["seller balance", String(await balance(buyer, assetId, seller.address))],
    ["next", "npm run setup:registry"],
  ]);
}

main().catch((e) => { console.error(`\n00-setup-asset failed: ${(e as Error).message}\n`); process.exit(1); });
