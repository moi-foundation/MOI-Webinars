import { MAS0AssetLogic } from "js-moi-sdk";
import { config, buyerAccount, sellerAccount } from "@demo/shared";
const buyer = await buyerAccount();
const seller = await sellerAccount();
const asset = new MAS0AssetLogic(config.assetId!, buyer.wallet);
const id = (await buyer.wallet.getIdentifier()).toString();
const keyId = await buyer.wallet.getKeyId();
const c = Number(await buyer.provider.getInteractionCount(id, keyId));
const p = Number(await buyer.provider.getPendingInteractionCount(id, keyId));
console.log(`confirmed=${c} pending=${p}`);

for (const opt of [
  { sequence: c, fuel_price: 1, fuel_limit: 10000 },
  { sequence: c, fuel_price: 1, fuel_limit: 1233 },
  { sequence: c },
  { sequence: c, fuel_price: 1n as any, fuel_limit: 10000n as any },
]) {
  try {
    const ix = await asset.transfer(seller.address, 1).send(opt as any);
    console.log("OK", opt, ix.hash);
  } catch (e: any) {
    console.log("FAIL", JSON.stringify(opt), e?.message ?? e);
  }
}
