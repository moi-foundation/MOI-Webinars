// The agent calls TickAny(owner) — a write to an account it does not own.
// Whether it lands is not decided here, or anywhere else the agent can reach.
import { getLogicDriver } from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import { config, FUEL_LIMIT, ownerAccount, agentAccount, waitReceipt, receiptError } from "@demo/shared";
import { counterOf } from "./counter-lib.ts";

const owner = await ownerAccount();
const agent = await agentAccount();

const before = await counterOf(owner, owner.address);
console.log(`owner's counter: ${before}`);

const ticker = await getLogicDriver(config.logicId, agent.wallet);
const ix = await ticker.routines.TickAny!(owner.address).send({
  // declares what the call touches — a heads-up, not a permission
  participants: [{ id: owner.address as `0x${string}`, lock_type: LockType.MUTATE_LOCK }],
  fuel_limit: FUEL_LIMIT,
});
console.log(`sent:  ${ix.hash}`);

const refusal = receiptError(await waitReceipt(agent, ix.hash));
const after = await counterOf(owner, owner.address);

if (refusal) console.log(`\nREFUSED — ${refusal}`);
else console.log(`\nWROTE`);
console.log(`owner's counter: ${before} -> ${after}`);
