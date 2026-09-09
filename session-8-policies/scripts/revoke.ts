// The owner takes it back. One interaction. The agent is not notified.
import { Access } from "js-moi-sdk";
import { config, ownerAccount, waitReceipt, receiptError } from "@demo/shared";

const owner = await ownerAccount();

const ix = await new Access(owner.wallet)
  .storage(config.logicId as `0x${string}`)
  .delete()
  .send();

console.log(`sent:  ${ix.hash}`);
const err = receiptError(await waitReceipt(owner, ix.hash));
console.log(err ? `failed — ${err}` : "policy deleted");
