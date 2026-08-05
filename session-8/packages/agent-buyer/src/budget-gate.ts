// The budget gate — DECISION C. Spec §8.3.
//
// The buyer records every spend against its INHERITED SUB-ACCOUNT's on-chain cap. If the spend
// would exceed the cap, the AgentBudget logic REVERTS and we refuse to pay — before any money
// moves.
//
// Be precise about what this does and does not guarantee (spec §1.1):
//   * Sub-accounts SHARE the primary's key. This is not key isolation and not a sandbox.
//   * AgentBudget is a ledger, not a custodian — it never holds the asset.
//   * It is OPT-IN: it binds agents that use the inheritance flow. Ours does, so the cap really
//     bites here. Say "the chain enforces the parent's cap", never "the agent can't touch the
//     money."

import { recordSpend, getBudget, type Account, type BudgetState } from "@demo/shared";

export interface BudgetVerdict {
  ok: boolean;
  before: BudgetState | null;
  spendHash?: string;
  remaining?: bigint;
  reason?: string;
}

export async function spendWithinBudget(
  buyer: Account,
  amount: bigint,
  memo: string,
): Promise<BudgetVerdict> {
  let before: BudgetState | null = null;
  try {
    before = await getBudget(buyer);
  } catch {
    // No budget set (or no actor state) — surface it rather than silently proceeding.
    return { ok: false, before: null, reason: "no on-chain budget for this sub-account — run 02-provision-agents" };
  }

  try {
    const result = await recordSpend(buyer, amount, memo);
    return { ok: true, before, spendHash: result.hash, remaining: result.remaining };
  } catch (err) {
    // The chain refused. This is the --overspend beat: the cap is enforced, not advisory.
    return {
      ok: false,
      before,
      reason: `chain refused the spend: ${(err as Error).message}`,
    };
  }
}
