// The budget gate — context inheritance doing session 8's job.
//
// Before any money moves, the buyer records the spend against its INHERITED sub-account's
// on-chain budget. If the spend would exceed it, the AgentBudget contract REVERTS and the buyer
// refuses to pay. The rule lives in the contract's actor state, where the agent's code cannot
// reach it — delete every guard in this repo and the revert still happens.
//
// Honesty, said once here and again on stage: sub-accounts share the primary's key, so this is
// "the chain refuses the spend", never "the agent can't touch the money".

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
    return {
      ok: false, before: null,
      reason: "no on-chain budget for this sub-account — run `npm run setup:agents`",
    };
  }

  try {
    const result = await recordSpend(buyer, amount, memo);
    return { ok: true, before, spendHash: result.hash, remaining: result.remaining };
  } catch (err) {
    // The contract refused. This is the --overspend beat: the cap is enforced, not advisory.
    return { ok: false, before, reason: `chain refused the spend: ${(err as Error).message}` };
  }
}
