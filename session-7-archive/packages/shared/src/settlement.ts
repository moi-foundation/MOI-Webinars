// The settlement seam.
//
// This is the ONLY chain-specific part of the x402 flow. Everything else — the 402 body, the
// X-Payment header, the /verify + /settle API — is protocol, not chain.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY LOCKUP/RELEASE AND NOT approve/transferFrom
// ─────────────────────────────────────────────────────────────────────────────────────────────
// x402's EVM "exact" scheme leans on EIP-3009 `transferWithAuthorization`: the token contract
// itself verifies the buyer's off-chain signature, so the facilitator can pull funds with nothing
// on-chain from the buyer beforehand. MAS0 has no such primitive.
//
// MAS0's `approve` + `transferFrom` would be the closest analogue, but neither has ever been
// executed on devnet (SDK_NOTES.md §7.1). `lockup` / `release` / `moi.Lockups`, by contrast, are
// PROVEN on devnet with real funds by session-4. We use the proven path.
//
// Three facts from session-4 shape everything below:
//
//   1. `lockup(beneficiary, amount)` is IRREVOCABLE. The locker cannot reclaim it; only the
//      beneficiary can pull it.
//   2. `release(benefactor, beneficiary, amount)` must be signed by the BENEFICIARY.
//   3. `release` has NO on-chain guard — calling it with nothing locked "succeeds" and moves zero.
//      => Every settlement MUST assert a real balance delta. We never trust the ix to have reverted.
//
// Fact 2 is the load-bearing one: the facilitator can only move funds it is the beneficiary of.
// So the buyer locks up naming the FACILITATOR, and the facilitator settles in two hops:
//
//      agent-a --lockup(beneficiary=facilitator)--> [locked]
//      facilitator --release(benefactor=agent-a, beneficiary=facilitator)--> facilitator
//      facilitator --transfer(agent-b)--> agent-b
//
// This is exactly how a real payment facilitator routes funds, and every step is a primitive
// session-4 already proved on devnet.
//
// TRADE-OFF, stated plainly: the buyer performs one on-chain action (the lockup) between receiving
// the 402 and retrying with X-Payment. Pure x402 on EVM keeps the buyer entirely off-chain until
// settlement. That difference is forced by MAS0 lacking a contract-verified signature primitive —
// it is not a design preference. The off-chain signature still does real work: it authorizes THIS
// resource at THIS price, and the facilitator refuses to settle without it.

import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";
import type { MoiAccount } from "./moi.js";

export interface SettlementResult {
  /** MOI interaction hash of the transfer to the payee. This is the x402 receipt. */
  transaction: string;
  /** Interaction hash of the release step (facilitator claiming the lockup). */
  releaseTransaction: string;
  /** Payee balance before/after — proof the funds actually moved. */
  payeeBefore: bigint;
  payeeAfter: bigint;
}

export interface Lockup {
  beneficiary: string;
  assetId: string;
  amount: bigint;
}

/** How the facilitator moves funds from payer to payee. */
export interface MoiSettlementBackend {
  readonly name: string;

  /**
   * BUYER-side. Puts funds under the facilitator's control before the X-Payment retry.
   * Returns the interaction hash of the on-chain commitment.
   */
  fund(args: {
    payer: MoiAccount;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<{ transaction: string }>;

  /**
   * FACILITATOR-side, during /verify. Is the money actually there? Reads chain state directly
   * rather than trusting the buyer's claim.
   */
  checkFunded(args: {
    reader: MoiAccount;
    payer: string;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<boolean>;

  /** FACILITATOR-side, during /settle. Moves the funds to the payee. */
  settle(args: {
    facilitator: MoiAccount;
    payer: string;
    payee: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult>;

  /**
   * FACILITATOR-side. Tier 2 refund path: agent-b failed to deliver, so return the locked funds
   * to the payer instead of paying the seller. Because the lockup named the facilitator, the
   * facilitator can always claim and hand back — the buyer is never stranded.
   */
  refund(args: {
    facilitator: MoiAccount;
    payer: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult>;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Chain reads
// ─────────────────────────────────────────────────────────────────────────────────────────────

// getAssetDriver refetches the asset manifest over RPC on every call — cache per signer.
const driverCache = new WeakMap<object, Map<string, Promise<unknown>>>();

async function cachedAssetDriver(assetId: string, account: MoiAccount) {
  let bySigner = driverCache.get(account.wallet as unknown as object);
  if (!bySigner) {
    bySigner = new Map();
    driverCache.set(account.wallet as unknown as object, bySigner);
  }
  let driver = bySigner.get(assetId);
  if (!driver) {
    driver = getAssetDriver(assetId, account.wallet);
    bySigner.set(assetId, driver);
  }
  return (await driver) as { routines: { BalanceOf: (id: string) => Promise<{ output?: { balance?: unknown }; error?: unknown }> } };
}

/** Reads a MAS0 balance in atomic units. Accounts that never held the asset report 0n. */
export async function assetBalance(
  account: MoiAccount,
  assetId: string,
  holder: string,
): Promise<bigint> {
  const driver = await cachedAssetDriver(assetId, account);
  const { output, error } = await driver.routines.BalanceOf(holder);
  if (error) {
    const err = error as { error?: string; message?: string };
    const message = err.error ?? err.message ?? JSON.stringify(error);
    // "asset not found" / "token not found" both mean a zero balance — session-4/logic/swap.js.
    if (!/asset not found|token not found/i.test(String(message))) {
      throw new Error(`BalanceOf failed: ${message}`);
    }
  }
  return BigInt((output?.balance as string | number | bigint | undefined) ?? 0);
}

/**
 * Lists the lockups an account has created, including each one's beneficiary.
 *
 * `moi.Lockups` is a raw JSON-RPC method not wrapped by the typed provider. Unlike BalanceOf it
 * has no "query only your own state" restriction — any provider can read any account's lockups.
 * Verified on devnet by session-4; confirmed routed by `npm run verify-sdk`.
 */
export async function getLockups(account: MoiAccount, holder: string): Promise<Lockup[]> {
  // `execute` / `processResponse` are `protected` on BaseProvider — the SDK exposes no public
  // escape hatch for un-wrapped RPC methods, and `moi.Lockups` is one. Session-4 reaches them from
  // plain JS where nothing checks; from TypeScript we have to say so out loud. Narrowed to just
  // the two members we need rather than casting the whole provider to `any`.
  const rpc = account.provider as unknown as {
    execute: (method: string, params: unknown) => Promise<unknown>;
    processResponse: (response: unknown) => unknown;
  };

  try {
    const response = await rpc.execute("moi.Lockups", {
      id: holder,
      options: { tesseract_number: -1 },
    });
    const result = rpc.processResponse(response) as
      | { id: string; asset_id: string; amount: string }[]
      | null;
    return (result ?? []).map((e) => ({
      beneficiary: e.id.toLowerCase(),
      assetId: e.asset_id.toLowerCase(),
      amount: BigInt(e.amount),
    }));
  } catch (err) {
    // An account that has never transacted answers "account not found" — that is zero lockups,
    // not an error.
    if (/account not found/i.test((err as Error).message ?? "")) return [];
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The proven backend
// ─────────────────────────────────────────────────────────────────────────────────────────────

async function send(ctx: { send: () => Promise<{ hash: string; result: () => Promise<unknown> }> }) {
  const ix = await ctx.send();
  await ix.result();
  return ix.hash;
}

/**
 * Lockup → Release → Transfer. Every primitive here is proven on MOI devnet by session-4.
 *
 * NOTE ON CONCURRENCY: lockups are tracked per (benefactor, beneficiary, asset) and amounts
 * accumulate, so two in-flight payments from the same buyer to the same facilitator are
 * indistinguishable on chain. The demo is strictly one payment at a time. A production facilitator
 * would need a per-payment escrow logic rather than raw MAS0 lockups.
 */
export class LockupSettlement implements MoiSettlementBackend {
  readonly name = "lockup-release";

  async fund(args: {
    payer: MoiAccount;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<{ transaction: string }> {
    const asset = new MAS0AssetLogic(args.assetId, args.payer.wallet);
    const transaction = await send(asset.lockup(args.facilitator, args.amount));
    return { transaction };
  }

  async checkFunded(args: {
    reader: MoiAccount;
    payer: string;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<boolean> {
    const lockups = await getLockups(args.reader, args.payer);
    return lockups.some(
      (l) =>
        l.beneficiary === args.facilitator.toLowerCase() &&
        l.assetId === args.assetId.toLowerCase() &&
        l.amount >= args.amount,
    );
  }

  async settle(args: {
    facilitator: MoiAccount;
    payer: string;
    payee: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult> {
    const { facilitator, payer, payee, assetId, amount } = args;

    // Hop 1: claim the lockup into the facilitator's own account.
    // `release` moves zero and still "succeeds" when nothing is locked, so assert the delta.
    const facBefore = await assetBalance(facilitator, assetId, facilitator.address);
    const releaseTransaction = await send(
      new MAS0AssetLogic(assetId, facilitator.wallet).release(payer, facilitator.address, amount),
    );
    const facAfter = await assetBalance(facilitator, assetId, facilitator.address);
    if (facAfter - facBefore < amount) {
      throw new Error(
        `release moved ${facAfter - facBefore} but needed ${amount} — the payer's lockup is missing or too small.`,
      );
    }

    // Hop 2: forward to the seller.
    const payeeBefore = await assetBalance(facilitator, assetId, payee);
    const transaction = await send(
      new MAS0AssetLogic(assetId, facilitator.wallet).transfer(payee, amount),
    );
    const payeeAfter = await assetBalance(facilitator, assetId, payee);
    if (payeeAfter - payeeBefore < amount) {
      throw new Error(`transfer to payee moved ${payeeAfter - payeeBefore}, expected ${amount}.`);
    }

    return { transaction, releaseTransaction, payeeBefore, payeeAfter };
  }

  async refund(args: {
    facilitator: MoiAccount;
    payer: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult> {
    // Same two hops, but the second one sends the funds back where they came from.
    return this.settle({ ...args, payee: args.payer });
  }
}

/**
 * In-memory settlement for running the protocol without funded wallets.
 *
 * Everything above the settlement seam — the 402 handshake, real MOI signing, signature
 * verification, the key→identifier bind, registry lookups — is exercised unchanged. Only the
 * chain writes are simulated. Enable with SETTLEMENT=mock.
 *
 * Transaction hashes are clearly marked `0xmock…` so a mock run can never be mistaken for a real
 * settlement in the demo output.
 */
export class MockSettlement implements MoiSettlementBackend {
  readonly name = "mock";
  // Module-level, NOT per-instance. The buyer and the facilitator each construct their own
  // backend, and in the real backend they share state through the chain. The mock has to share
  // state too, or the facilitator can never see the lockup the buyer just created.
  // (This only works because `npm run demo` runs both in one process — which is exactly the
  // scenario the mock exists for.)
  private static locked = new Map<string, bigint>();
  private static seq = 0;

  private key(payer: string, facilitator: string, assetId: string) {
    return `${payer.toLowerCase()}|${facilitator.toLowerCase()}|${assetId.toLowerCase()}`;
  }

  private hash(): string {
    MockSettlement.seq++;
    return `0xmock${MockSettlement.seq.toString(16).padStart(4, "0")}${"0".repeat(54)}`;
  }

  async fund(args: {
    payer: MoiAccount;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<{ transaction: string }> {
    const k = this.key(args.payer.address, args.facilitator, args.assetId);
    MockSettlement.locked.set(k, (MockSettlement.locked.get(k) ?? 0n) + args.amount);
    return { transaction: this.hash() };
  }

  async checkFunded(args: {
    reader: MoiAccount;
    payer: string;
    facilitator: string;
    assetId: string;
    amount: bigint;
  }): Promise<boolean> {
    return (MockSettlement.locked.get(this.key(args.payer, args.facilitator, args.assetId)) ?? 0n) >= args.amount;
  }

  async settle(args: {
    facilitator: MoiAccount;
    payer: string;
    payee: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult> {
    const k = this.key(args.payer, args.facilitator.address, args.assetId);
    const available = MockSettlement.locked.get(k) ?? 0n;
    if (available < args.amount) {
      throw new Error(`mock: nothing locked (have ${available}, need ${args.amount})`);
    }
    MockSettlement.locked.set(k, available - args.amount);
    return {
      transaction: this.hash(),
      releaseTransaction: this.hash(),
      payeeBefore: 0n,
      payeeAfter: args.amount,
    };
  }

  async refund(args: {
    facilitator: MoiAccount;
    payer: string;
    assetId: string;
    amount: bigint;
  }): Promise<SettlementResult> {
    return this.settle({ ...args, payee: args.payer });
  }
}

/** Picks the backend from SETTLEMENT (`lockup` default, `mock` for unfunded runs). */
export function createSettlementBackend(mode: string): MoiSettlementBackend {
  return mode.toLowerCase() === "mock" ? new MockSettlement() : new LockupSettlement();
}
