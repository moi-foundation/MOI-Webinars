// An in-memory stand-in for MOI devnet, used ONLY when CHAIN_MODE=mock.
//
// WHY THIS EXISTS
// The full flow needs a funded devnet wallet: minting MAS0, inheriting sub-accounts, deploying
// AgentBudget, registering agents. Without one, nothing downstream can be exercised at all. This
// lets the ENTIRE protocol run — real ECDSA signatures, real signature verification, the real
// public-key→identifier derivation, the real x402 HTTP handshake, all 9 facilitator checks — with
// only the chain writes simulated.
//
// WHAT IS REAL IN MOCK MODE          WHAT IS SIMULATED
//   x402 402/X-Payment wire format     MAS0 transfer + balances
//   ECDSA sign + verify                AgentBudget SetBudget/RecordSpend/GetBudget
//   publicKey -> identifier            agent registry profiles
//   sub-account address derivation     interaction receipts
//   all 9 facilitator checks
//
// SAFETY: every simulated interaction hash starts with `0xmock`, and every entry point prints a
// warning. A mock run must never be mistakable for a real settlement. `pnpm demo` in mock mode
// says so in its banner and in the closing summary.

import { config } from "./config.js";
import type { TransferFacts } from "./payment-verify.js";

export const isMock = (): boolean => config.chainMode === "mock";

export interface MockAgentProfile {
  agent_id: string;
  owner: string;
  agent_wallet: string;
  status: string;
  url: string;
  card_uri: string;
  score: bigint;
  created_at: bigint;
  updated_at: bigint;
}

interface BudgetRow { budget: bigint; spent: bigint }

class MockChain {
  private seq = 0;
  /** assetId -> holder -> balance */
  readonly balances = new Map<string, Map<string, bigint>>();
  /** txHash -> the facts the facilitator will read back */
  readonly transfers = new Map<string, TransferFacts>();
  /** address -> budget row (actor state under the AgentBudget logic) */
  readonly budgets = new Map<string, BudgetRow>();
  /** agentId -> profile */
  readonly agents = new Map<string, MockAgentProfile>();

  hash(kind: string): string {
    this.seq += 1;
    const tag = `${kind}${this.seq}`.slice(0, 8).padEnd(8, "0");
    return `0xmock${tag}${"0".repeat(64 - 4 - 8)}`.slice(0, 66);
  }

  private key(a: string): string { return a.toLowerCase(); }

  balanceOf(assetId: string, holder: string): bigint {
    return this.balances.get(this.key(assetId))?.get(this.key(holder)) ?? 0n;
  }

  credit(assetId: string, holder: string, amount: bigint): void {
    const a = this.key(assetId);
    if (!this.balances.has(a)) this.balances.set(a, new Map());
    const book = this.balances.get(a)!;
    book.set(this.key(holder), (book.get(this.key(holder)) ?? 0n) + amount);
  }

  /** Simulates MAS0 transfer, signed by the holder. Throws on insufficient balance, like chain. */
  transfer(assetId: string, from: string, to: string, amount: bigint): string {
    const have = this.balanceOf(assetId, from);
    if (have < amount) throw new Error(`insufficient balance: have ${have}, need ${amount}`);
    this.credit(assetId, from, -amount);
    this.credit(assetId, to, amount);
    const txHash = this.hash("tx");
    this.transfers.set(this.key(txHash), {
      txHash,
      from: this.key(from),
      beneficiary: this.key(to),
      amount,
      assetId: this.key(assetId),
      callsite: "Transfer",
      tsHash: this.hash("ts"),
    });
    return txHash;
  }

  readTransfer(txHash: string): TransferFacts {
    const facts = this.transfers.get(this.key(txHash));
    if (!facts) throw new Error(`interaction ${txHash} not found on chain`);
    return facts;
  }

  // ── AgentBudget ─────────────────────────────────────────────────────────────────────────
  setBudget(address: string, amount: bigint): string {
    if (amount <= 0n) throw new Error("budget must be positive");
    const row = this.budgets.get(this.key(address)) ?? { budget: 0n, spent: 0n };
    this.budgets.set(this.key(address), { ...row, budget: amount });
    return this.hash("bud");
  }

  /** Mirrors the Coco logic: REVERTS when the spend would exceed the cap. */
  recordSpend(address: string, amount: bigint): string {
    if (amount <= 0n) throw new Error("amount must be positive");
    const row = this.budgets.get(this.key(address));
    if (!row || row.budget === 0n) {
      throw new Error(`${address} has no budget set — call SetBudget first`);
    }
    const next = row.spent + amount;
    if (next > row.budget) {
      const remaining = row.budget > row.spent ? row.budget - row.spent : 0n;
      throw new Error(`spend ${amount} exceeds remaining budget ${remaining}`);
    }
    this.budgets.set(this.key(address), { ...row, spent: next });
    return this.hash("spend");
  }

  getBudget(address: string): { budget: bigint; spent: bigint; remaining: bigint } {
    const row = this.budgets.get(this.key(address));
    if (!row) throw new Error("actor not found — this account is not inherited under the logic");
    return {
      budget: row.budget,
      spent: row.spent,
      remaining: row.budget > row.spent ? row.budget - row.spent : 0n,
    };
  }

  // ── registry ────────────────────────────────────────────────────────────────────────────
  register(profile: Omit<MockAgentProfile, "score" | "created_at" | "updated_at">): MockAgentProfile {
    const full: MockAgentProfile = {
      ...profile,
      score: 0n,
      created_at: 0n,
      updated_at: 0n,
    };
    this.agents.set(profile.agent_id, full);
    return full;
  }

  profile(agentId: string): MockAgentProfile | null {
    return this.agents.get(agentId) ?? null;
  }

  updateAgentWallet(agentId: string, wallet: string): void {
    const p = this.agents.get(agentId);
    if (!p) throw new Error(`agent ${agentId} not found`);
    this.agents.set(agentId, { ...p, agent_wallet: wallet });
  }

  allProfiles(): MockAgentProfile[] {
    return [...this.agents.values()];
  }
}

/** Process-wide, because the buyer, seller and facilitator all run in one process in the demo. */
export const mockChain = new MockChain();

let warned = false;
export function warnMockOnce(): void {
  if (warned || !isMock()) return;
  warned = true;
  console.log(
    "\x1b[33m\x1b[1m" +
      "\n  ⚠  CHAIN_MODE=mock — NO REAL CHAIN. No funds move; hashes are fake (0xmock…).\n" +
      "     Signatures, verification and the x402 handshake are REAL. Settlement is not.\n" +
      "\x1b[0m",
  );
}
