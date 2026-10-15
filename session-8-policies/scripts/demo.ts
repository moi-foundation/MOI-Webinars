// SESSION 8 — the demo.
//
//   npm run demo               three beats: refused, granted, revoked
//   DEMO_PAUSE_MS=1500 npm run demo    slow enough to narrate
//
// The setup is deliberately boring. There is a logic called Ticker with a counter in it. The
// counter is ACTOR state, which means the copy of it belonging to the owner physically lives on
// the owner's account. Alice the agent calls `TickAny(owner)` and the logic tries to increment
// a number stored on somebody else's account.
//
// Three times, same call, same code, same agent:
//
//   1. before  the write is refused. The counter does not move.
//   2. after   the owner registers an access policy — the same call goes through.
//   3. after   the owner deletes it — refused again.
//
// Nothing in ticker.coco changes between the three. There is no `if sender == owner` anywhere in
// it, and no version of the agent that skips such a check, because the check is not in the logic.
// The protocol reads the owner's policy before it lets the write land.
//
// That is the whole point, and it is the thing the previous design could not do. When the rule
// lives in a contract, obeying it is the agent's choice: hold the key, call something else. Here
// the agent holds the key and still cannot write, because the permission is not the agent's to
// grant.

import { Access, access, getLogicDriver } from "js-moi-sdk";
import { AccessAction, LockType } from "js-moi-utils";
import {
  config, FUEL_LIMIT, ownerAccount, agentAccount, existsOnChain, kmoiBalance, rawRpc, waitReceipt, receiptError,
  banner, detail, ok, fail, say, summary, type Account,
} from "@demo/shared";

/**
 * Read the owner's counter. A static call — free, and it never reverts.
 *
 * The counter lives on the OWNER's account, not the logic's, so the owner has to be named as a
 * participant even for a read. Actor state is like that: the logic knows the shape, the account
 * holds the bytes.
 */
async function counterOf(reader: Account, subject: string): Promise<bigint> {
  const logic = await getLogicDriver(config.logicId, reader.wallet);
  const routine = logic.routines.CounterOf!;
  const res = await routine(subject).call({
    participants: [{ id: subject as `0x${string}`, lock_type: LockType.READ_LOCK }],
  });
  const { output, error } = await res.result();
  // Before the first successful tick the owner has no actor state for this logic at all. Whether
  // that reads back as zero or as a revert depends on the node, and either one means the same
  // thing here, so both are reported as zero rather than crashing the demo on beat 1.
  if (error) return 0n;
  return BigInt(output?.counter ?? 0);
}

/**
 * The agent tries to bump the OWNER's counter.
 * Returns the receipt's verdict: null when the write landed, a reason when the protocol refused.
 *
 * Note what this is NOT. It is not a thrown error and not a rejected submission. The interaction
 * is accepted, signed, mined, and charged for. It simply reverts — status non-zero — because the
 * write it attempted was not permitted. Fuel is spent either way.
 */
async function agentTicks(agent: Account, ownerId: string): Promise<string | null> {
  const logic = await getLogicDriver(config.logicId, agent.wallet);
  const routine = logic.routines.TickAny!;
  try {
    const ix = await routine(ownerId).send({
      // The write lands on the owner's account, so the owner is a participant under a mutate lock.
      // Naming them here is not permission — it is only declaring what the interaction touches.
      participants: [{ id: ownerId as `0x${string}`, lock_type: LockType.MUTATE_LOCK }],
      // An EXPLICIT fuel limit, which matters more than it looks.
      //
      // send() normally estimates fuel first, and estimation is a simulated run — so a call the
      // protocol will refuse blows up during estimation and never reaches the chain at all. You
      // get an exception and no hash, which is the wrong story: it looks like the SDK stopped the
      // agent, when the whole point is that the NETWORK did.
      //
      // Naming the limit skips estimation. The interaction is submitted, mined, and charged for,
      // and the refusal comes back as a reverted receipt with a hash you can open in the explorer.
      fuel_limit: FUEL_LIMIT,
    });
    detail("ix", ix.hash);
    return receiptError(await waitReceipt(agent, ix.hash));
  } catch (err) {
    return `${(err as Error).message} (rejected before submission)`;
  }
}

/**
 * Is this refusal the one the demo is about?
 *
 * It matters, because a broke agent and a forbidden agent both stop — and on stage they look
 * identical. An out-of-fuel wallet reads as a successful policy denial, and the demo would be
 * showing a green tick for the wrong reason. Only a runtime AccessError proves the PROTOCOL
 * refused the write; anything else means the run is broken, not that enforcement worked.
 */
const isPolicyRefusal = (reason: string | null): boolean =>
  reason != null && /AccessError/i.test(reason);

async function main(): Promise<void> {
  const owner = await ownerAccount();
  const agent = await agentAccount();
  const resourceId = config.logicId as `0x${string}`;

  banner("DEMO", "00", "Two accounts, one counter, and a permission that is not the agent's to grant");
  detail("owner  (owns the counter)", owner.address);
  detail("agent  (wants to bump it)", agent.address);
  detail("Ticker (the logic that writes)", resourceId);

  for (const a of [owner, agent]) {
    if (!(await existsOnChain(a))) {
      throw new Error(`${a.label} is not on chain — fund it at https://voyage.moi.technology`);
    }
  }

  // Check the agent can afford all three calls BEFORE starting, not halfway through.
  //
  // A fuel limit is checked against balance up front, so an agent below FUEL_LIMIT is rejected
  // at submission — and that rejection is indistinguishable, on screen, from the policy refusal
  // this demo exists to show. Better to refuse to start than to run and mislead.
  const fuel = await kmoiBalance(owner, agent.address);
  detail("agent KMOI", fuel === null ? "unreadable" : fuel.toString());
  const needed = BigInt(FUEL_LIMIT) * 3n;
  if (fuel !== null && fuel < needed) {
    throw new Error(
      `agent holds ${fuel} KMOI but needs ~${needed} for three calls. ` +
      `Run \`npm run setup:fuel\` — otherwise beats 1 and 3 would "pass" because the agent is ` +
      `broke rather than because the protocol refused it.`,
    );
  }

  // Self-heal: beat 1 requires NO policy to exist. If a previous run died between grant and
  // revoke, a leftover policy would make the opening beat "fail" live on stage — the single
  // worst place to discover it. So check, and quietly clean up before starting.
  const leftover = await rawRpc<unknown>("moi.AccessPolicy", [{
    id: owner.address, resource_type: "storage", resource_id: resourceId,
    options: { tesseract_number: -1 },
  }]).catch(() => null);
  if (leftover) {
    say("DEMO", "a policy is left over from an interrupted run — deleting it before we start");
    const clean = await new Access(owner.wallet).storage(resourceId).delete().send();
    const cleanErr = receiptError(await waitReceipt(owner, clean.hash));
    if (cleanErr) throw new Error(`could not clear the leftover policy: ${cleanErr}`);
    ok("clean slate");
  }

  const start = await counterOf(owner, owner.address);
  detail("owner's counter now", start.toString());

  // ── BEAT 1 — no policy ───────────────────────────────────────────────────────────────────
  banner("AGENT", "01", "The agent calls TickAny(owner) with no policy in place");
  say("AGENT", "Same key it will use in beat 2. Nothing about the agent changes between them.");
  const beat1 = await agentTicks(agent, owner.address);
  const after1 = await counterOf(owner, owner.address);

  if (isPolicyRefusal(beat1) && after1 === start) {
    ok(`refused — ${beat1}`);
    say("CHAIN", "The interaction was mined and charged for. The write inside it did not land.");
  } else if (beat1) {
    fail(`stopped, but NOT by a policy: ${beat1}`);
  } else {
    fail(`expected a refusal; the write landed, counter ${start} → ${after1}`);
  }
  detail("owner's counter", `${start} → ${after1}`);

  // ── BEAT 2 — the owner grants ────────────────────────────────────────────────────────────
  banner("OWNER", "02", "The owner registers one access policy");
  say("OWNER", "Ticker may mutate my storage — but only when the agent originated the call.");
  const grant = await new Access(owner.wallet)
    .storage(resourceId)
    .allow(AccessAction.STORAGE_MUTATE)
    .caller(access.anyCaller())
    .origin(access.callers(agent.address as `0x${string}`))
    .create()
    .send();
  detail("policy ix", grant.hash);
  const grantErr = receiptError(await waitReceipt(owner, grant.hash));
  if (grantErr) throw new Error(`policy create failed: ${grantErr}`);
  ok("policy registered on the owner's account");
  say("CHAIN", "The agent was not asked and cannot decline. The right is the owner's to give.");

  banner("AGENT", "03", "The identical call, now that the policy exists");
  const beat2 = await agentTicks(agent, owner.address);
  const after2 = await counterOf(owner, owner.address);

  if (!beat2 && after2 === after1 + 1n) {
    ok("the write landed");
  } else {
    fail(`expected success; got ${beat2 ?? "no error"}, counter ${after1} → ${after2}`);
  }
  detail("owner's counter", `${after1} → ${after2}`);

  // ── BEAT 3 — the owner revokes ───────────────────────────────────────────────────────────
  banner("OWNER", "04", "The owner deletes the policy");
  const revoke = await new Access(owner.wallet).storage(resourceId).delete().send();
  detail("revoke ix", revoke.hash);
  const revokeErr = receiptError(await waitReceipt(owner, revoke.hash));
  if (revokeErr) throw new Error(`policy delete failed: ${revokeErr}`);
  ok("policy deleted");

  banner("AGENT", "05", "Third time, same call");
  const beat3 = await agentTicks(agent, owner.address);
  const after3 = await counterOf(owner, owner.address);

  if (isPolicyRefusal(beat3) && after3 === after2) {
    ok(`refused again — ${beat3}`);
  } else if (beat3) {
    fail(`stopped, but NOT by a policy: ${beat3}`);
  } else {
    fail(`expected a refusal; the write landed, counter ${after2} → ${after3}`);
  }
  detail("owner's counter", `${after2} → ${after3}`);

  // Every condition, spelled out. A refusal only counts when it is an AccessError — a broke
  // agent must never be able to turn this summary green.
  const passed =
    isPolicyRefusal(beat1) && !beat2 && isPolicyRefusal(beat3) && after3 === start + 1n;

  const verdict = (r: string | null, expectRefusal: boolean): string => {
    if (expectRefusal) {
      if (isPolicyRefusal(r)) return "refused by policy";
      return r ? `WRONG REASON — ${r}` : "WROTE — unexpected";
    }
    return r ? `REFUSED — ${r}` : "wrote";
  };

  summary(passed ? "Enforcement is the protocol's, not the logic's" : "DEMO DID NOT BEHAVE AS EXPECTED", [
    ["beat 1 (no policy)", verdict(beat1, true)],
    ["beat 2 (policy)", verdict(beat2, false)],
    ["beat 3 (revoked)", verdict(beat3, true)],
    ["counter", `${start} → ${after3}`],
    ["what changed between them", "one policy on the owner's account. Not one line of logic."],
  ]);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => { console.error(`\ndemo failed: ${(e as Error).message}\n`); process.exit(1); });
