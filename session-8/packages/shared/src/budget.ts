// AgentBudget — the on-chain spend ledger delivered via context inheritance. Session 6's logic,
// doing session 8's job.
//
// Each inherited sub-account carries its own `budget` and `spent` in ACTOR STATE — storage that
// lives on the account, under the logic. Only an inherited account has that storage; a bare
// account's calls revert, which is exactly why inheritance is required to participate.
//
// What the chain guarantees: a spend that would exceed the budget CANNOT be recorded —
// RecordSpend reverts inside the contract. Phrase it as "the chain refuses the spend", never
// "the agent can't touch the money": sub-accounts share the primary's key, so this is a budget
// the contract enforces, not key isolation.

import { getLogicDriver } from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import type { Account } from "./chain.js";
import { config, FUEL_LIMIT } from "./config.js";

const participants = () => [{ id: config.logicId, lock_type: LockType.NO_LOCK }];

async function driverFor(account: Account): Promise<any> {
  // Built with THAT agent's wallet: budget state is per-account, and GetBudget reads Sender.
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

/** Assign the account's total allowance. Called once at provisioning, and by the demo's kill beat. */
export const setBudget = (account: Account, amount: bigint): Promise<string> =>
  invoke(account, (r) => r.SetBudget(amount));

export interface SpendResult { hash: string; spent: bigint; remaining: bigint }

/**
 * Record a spend against the account's on-chain cap, BEFORE any money moves.
 * THROWS when the contract reverts (over budget) — the caller treats that as "refuse to pay".
 */
export async function recordSpend(account: Account, amount: bigint, memo: string): Promise<SpendResult> {
  const hash = await invoke(account, (r) => r.RecordSpend(amount, memo));
  const after = await getBudget(account);
  return { hash, spent: after.spent, remaining: after.remaining };
}

export interface BudgetState { budget: bigint; spent: bigint; remaining: bigint }

/** Read the CALLER's own ledger. Sender-based — cross-account reads revert by design. */
export async function getBudget(account: Account): Promise<BudgetState> {
  const driver = await driverFor(account);
  const resp = await (driver.routines as any).GetBudget().call();
  const out = resp?.output ?? resp?.result ?? resp;
  return {
    budget: BigInt(out?.budget ?? 0),
    spent: BigInt(out?.spent ?? 0),
    remaining: BigInt(out?.remaining ?? 0),
  };
}
