// AgentBudget — the on-chain spend cap delivered via context inheritance. Spec §4.4.
//
// DECISION C: this is OPT-IN. It binds agents that use the inheritance flow — ours does, so the
// cap genuinely bites in the demo. It is NOT a custody mechanism: AgentBudget is a ledger, and
// sub-accounts share the primary's key. What the chain guarantees is that a spend OVER THE CAP
// cannot be recorded — RecordSpend reverts. Phrase it as "the chain enforces the parent's cap",
// never "the agent can't touch the money".

import { getLogicDriver } from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import type { Account } from "./chain.js";
import { config, FUEL_LIMIT } from "./config.js";
import { isMock, mockChain } from "./mock-chain.js";

const participants = () => [{ id: config.logicId, lock_type: LockType.NO_LOCK }];

async function driverFor(account: Account): Promise<any> {
  // Must be built with THAT agent's wallet: only an inherited sub-account has actor state under
  // the logic, and GetBudget reads Sender state.
  return getLogicDriver(config.logicId, account.wallet);
}

async function invoke(account: Account, build: (r: any) => any): Promise<string> {
  const driver = await driverFor(account);
  const resp = await build(driver.routines).send({
    fuel_limit: FUEL_LIMIT,
    participants: participants(),
  });
  const { error } = await resp.result();
  if (error) throw new Error(String(error.error ?? JSON.stringify(error)));
  return resp.hash;
}

export const setBudget = async (account: Account, amount: bigint): Promise<string> =>
  isMock()
    ? mockChain.setBudget(account.address, amount)
    : invoke(account, (r) => r.SetBudget(amount));

export interface SpendResult { hash: string; spent: bigint; remaining: bigint }

/**
 * Record a spend against the account's on-chain cap.
 * THROWS when the chain reverts (over budget) — the caller treats that as "refuse to pay".
 */
export async function recordSpend(account: Account, amount: bigint, memo: string): Promise<SpendResult> {
  // Mock mirrors the Coco logic exactly, INCLUDING the revert on overspend — that is the beat.
  const hash = isMock()
    ? mockChain.recordSpend(account.address, amount)
    : await invoke(account, (r) => r.RecordSpend(amount, memo));
  const after = await getBudget(account);
  return { hash, spent: after.spent, remaining: after.remaining };
}

export interface BudgetState { budget: bigint; spent: bigint; remaining: bigint }

/** GetBudget is Sender-based — it reads the CALLER's own ledger. Cross-reads throw. */
export async function getBudget(account: Account): Promise<BudgetState> {
  if (isMock()) return mockChain.getBudget(account.address);
  const driver = await driverFor(account);
  const resp = await (driver.routines as any).GetBudget().call();
  const { output, error } = await resp.result();
  if (error) throw new Error(`GetBudget failed: ${error.error ?? JSON.stringify(error)}`);
  return {
    budget: BigInt(output?.budget ?? 0),
    spent: BigInt(output?.spent ?? 0),
    remaining: BigInt(output?.remaining ?? 0),
  };
}
