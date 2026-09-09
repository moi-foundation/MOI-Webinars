// The owner grants one access policy:
// Ticker may mutate my storage — but only when the agent is behind the call.
import { Access, access } from "js-moi-sdk";
import { AccessAction } from "js-moi-utils";
import { config, ownerAccount, agentAccount, waitReceipt, receiptError } from "@demo/shared";

const owner = await ownerAccount();
const agent = await agentAccount();

const ix = await new Access(owner.wallet)
  .storage(config.logicId as `0x${string}`)     // WHICH program may write
  .allow(AccessAction.STORAGE_MUTATE)           // WHAT it may do
  .caller(access.anyCaller())
  .origin(access.callers(agent.address as `0x${string}`)) // WHO must be behind it
  .create()
  .send();

console.log(`sent:  ${ix.hash}`);
const err = receiptError(await waitReceipt(owner, ix.hash));
console.log(err ? `failed — ${err}` : "policy is now state on the owner's account");
