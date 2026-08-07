import { MAS0AssetLogic } from "js-moi-sdk";
import { config, buyerAccount, sellerAccount, registryClient, updateAgentWallet, getProfile, addr0x } from "@demo/shared";
const buyer = await buyerAccount();
const seller = await sellerAccount();
const id = (await buyer.wallet.getIdentifier()).toString();
const keyId = await buyer.wallet.getKeyId();
const asset = new MAS0AssetLogic(config.assetId!, buyer.wallet);

const counts = async () => [
  Number(await buyer.provider.getInteractionCount(id, keyId)),
  Number(await buyer.provider.getPendingInteractionCount(id, keyId)),
] as const;

let [confirmed, pending] = await counts();
console.log(`start: confirmed=${confirmed} pending=${pending}`);

let guard = 0;
while (pending > confirmed && guard++ < 15) {
  try {
    const ix = await asset.transfer(seller.address, 1).send({ sequence: confirmed });
    console.log(`filled seq ${confirmed}: ${ix.hash.slice(0, 18)}...`);
  } catch (e: any) {
    console.log(`seq ${confirmed} submit error: ${e?.message ?? e}`);
  }
  // wait for the confirmed count to advance
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const [c, p] = await counts();
    if (c > confirmed) { confirmed = c; pending = p; break; }
    if (i === 11) { console.log(`seq ${confirmed} did not confirm in 60s, retrying`); }
  }
  console.log(`now confirmed=${confirmed} pending=${pending}`);
}

if (pending > confirmed) { console.log("GAVE UP — queue still stuck"); process.exit(1); }
console.log("queue drained — restoring registry wallet");

const reg = await registryClient(buyer, false);
const before = await getProfile(reg, config.sellerAgentId!);
console.log("registry wallet before:", addr0x(before!.agent_wallet));
if (addr0x(before!.agent_wallet) !== seller.address) {
  await updateAgentWallet(reg, config.sellerAgentId!, seller.address);
}
const after = await getProfile(reg, config.sellerAgentId!);
console.log("registry wallet after: ", addr0x(after!.agent_wallet));
console.log(addr0x(after!.agent_wallet) === seller.address ? "RESTORED" : "STILL TAMPERED");
