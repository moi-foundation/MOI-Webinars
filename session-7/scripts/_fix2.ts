import { config, buyerAccount, sellerAccount, registryClient, updateAgentWallet, readAgentWallet } from "@demo/shared";
const buyer = await buyerAccount();
const seller = await sellerAccount();
const reg = await registryClient(buyer, false);
for (let i = 1; i <= 4; i++) {
  try {
    await updateAgentWallet(reg, config.sellerAgentId!, seller.address);
  } catch (e) {
    console.log(`attempt ${i}: write error (${(e as Error).message.slice(0, 60)}) — checking anyway`);
  }
  const now = await readAgentWallet(reg, config.sellerAgentId!);
  if (now.toLowerCase() === seller.address.toLowerCase()) {
    console.log(`RESTORED on attempt ${i}: ${now}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("STILL TAMPERED after 4 attempts");
process.exit(1);
