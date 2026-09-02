// Give the agent enough fuel to sign its own calls.
//
//   npm run setup:fuel
//
// The agent is a real account with a real key, so it pays for its own interactions. But it does
// not need the faucet: fuel on MOI is KMOI, and KMOI is an ordinary MAS0 asset. So the owner —
// which IS funded — just sends it some.
//
// One funded address, two live accounts. Handy for a workshop: everyone funds one.
//
// The catch, learned the hard way: you cannot transfer to an address that does not exist yet. A
// plain MAS0 transfer to an unknown id fails with "account not found". The account has to be
// created first, by registering the agent's PUBLIC KEY as a participant. ParticipantCreate does
// both in one interaction — create the participant, and carry the opening balance with it.

import { MAS0AssetLogic, ParticipantCreate, KMOI_ASSET_ID, getAssetDriver } from "js-moi-sdk";
import {
  ownerAccount, agentAccount, existsOnChain, kmoiBalance, waitReceipt, receiptError, FAUCET_URL,
  banner, detail, ok, say, summary,
} from "@demo/shared";

/**
 * Enough for many runs of the demo, which needs three agent calls each time.
 *
 * Sized generously on purpose. An agent that runs dry mid-demo is refused at submission for
 * "insufficient funds", and on screen that is indistinguishable from the access refusal the
 * session is about — a green tick for entirely the wrong reason.
 */
const GRANT = Number(process.env.AGENT_FUEL_GRANT ?? "20000");

/** Top up whenever the agent falls below this, not only when it is empty. */
const LOW_WATER = Number(process.env.AGENT_FUEL_FLOOR ?? "6000");

/** The network's minimum weight for a participant key. Below this, ParticipantCreate refuses. */
const KEY_WEIGHT = 1000;

async function main(): Promise<void> {
  banner("SETUP", "00", "Owner tops the agent up with KMOI");

  const owner = await ownerAccount();
  const agent = await agentAccount();
  detail("owner", owner.address);
  detail("agent", agent.address);
  detail("KMOI", KMOI_ASSET_ID);

  if (!(await existsOnChain(owner))) {
    throw new Error(`owner is not on chain — fund it at ${FAUCET_URL}, then run this again`);
  }

  const ownerBefore = await kmoiBalance(owner, owner.address);
  detail("owner KMOI", ownerBefore === null ? "unreadable" : ownerBefore.toString());
  if (ownerBefore !== null && ownerBefore < BigInt(GRANT)) {
    throw new Error(`owner holds ${ownerBefore} KMOI, needs at least ${GRANT} — top up at ${FAUCET_URL}`);
  }

  if (await existsOnChain(agent)) {
    const have = await kmoiBalance(owner, agent.address);
    detail("agent KMOI", have === null ? "unreadable" : have.toString());
    if (have !== null && have >= BigInt(LOW_WATER)) {
      ok(`agent already holds ${have} KMOI — above the ${LOW_WATER} floor`);
      summary("Agent is fuelled", [["agent", agent.address], ["next", "npm run demo"]]);
      return;
    }
    say("SETUP", `agent is below the ${LOW_WATER} floor — topping it up`);
  }

  const agentExists = await existsOnChain(agent);
  let ix: { hash: string };

  if (agentExists) {
    say("SETUP", `sending ${GRANT} KMOI to the agent`);
    ix = await new MAS0AssetLogic(KMOI_ASSET_ID, owner.wallet).transfer(agent.address, GRANT).send();
  } else {
    // The agent has never touched this chain. Register its public key as a participant and carry
    // the opening balance in the same interaction — a transfer on its own would have nothing to
    // land on.
    say("SETUP", `creating the agent participant with ${GRANT} KMOI`);
    detail("agent public key", agent.publicKey);
    ix = await new ParticipantCreate(owner.wallet)
      .id(agent.address as `0x${string}`)
      // 1000 is the network's minimum key weight, not an arbitrary number — anything less is
      // rejected before the interaction is built.
      .addKey(("0x" + agent.publicKey.replace(/^0x/, "")) as `0x${string}`, KEY_WEIGHT)
      .value(KMOI_ASSET_ID as `0x${string}`, agent.address as `0x${string}`, GRANT)
      .send();
  }
  detail("ix", ix.hash);

  const err = receiptError(await waitReceipt(owner, ix.hash));
  if (err) throw new Error(`funding the agent failed: ${err}`);

  ok("agent funded");
  summary("Agent is fuelled", [
    ["agent", agent.address],
    ["granted", `${GRANT} KMOI`],
    ["next", "npm run setup:logic"],
  ]);
}

main().catch((e) => { console.error(`\n00-fund-agent failed: ${(e as Error).message}\n`); process.exit(1); });
