// DECISION B — the facilitator's read-only confirmation that the buyer's OWN transfer landed.
//
// On MOI only the wallet owner can move their own funds, so the facilitator cannot custody or
// relay. It is a REFEREE: it signs nothing, and proves the payment happened by reading chain
// state. Everything here is a read.
//
// Shapes below were probed against a real devnet interaction this session — see SDK_NOTES §B.
//
//   moi.InteractionReceipt -> { ix_hash, status, fuel_used, ix_operations[], from, ts_hash, … }
//   moi.Tesseract{id,options,with_interactions} -> ixns[].ix_operations[] -> { type, payload }
//   payload for an asset op: { asset_id, callsite, calldata }
//   OpType.ASSET_INVOKE = 5
//
// The calldata is POLO-encoded and js-moi-asset exports the schema, so beneficiary + amount are
// recoverable rather than taken on trust.

import { Depolorizer } from "js-polo";
import { TRANSFER_SCHEMA } from "js-moi-sdk";
import { rawRpc, normalizeAddress } from "./chain.js";
import { isMock, mockChain } from "./mock-chain.js";

const ASSET_INVOKE = 5;

export interface TransferFacts {
  txHash: string;
  from: string;
  beneficiary: string;
  amount: bigint;
  assetId: string;
  callsite: string;
  tsHash: string;
}

interface Receipt {
  ix_hash: string;
  status: number;
  from: string;
  ts_hash: string;
  ix_operations?: { tx_type?: string; status?: number; data?: { error?: string } }[];
}

interface RawOperation {
  type?: number;
  payload?: { asset_id?: string; callsite?: string; calldata?: string };
}

/**
 * Read the facts of a MAS0 transfer straight off the chain.
 * Throws with a specific reason when the interaction is missing, failed, or is not a transfer.
 */
export async function readTransfer(txHash: string, assetId: string): Promise<TransferFacts> {
  if (isMock()) {
    const facts = mockChain.readTransfer(txHash);
    if (normalizeAddress(facts.assetId) !== normalizeAddress(assetId)) {
      throw new Error(`${txHash} is not a transfer of asset ${assetId}`);
    }
    return facts;
  }
  const receipt = await rawRpc<Receipt>("moi.InteractionReceipt", [{ hash: txHash }]).catch(() => null);
  if (!receipt) throw new Error(`interaction ${txHash} not found on chain`);
  if (Number(receipt.status) !== 0) throw new Error(`interaction ${txHash} failed on chain`);
  const opErr = receipt.ix_operations?.map((o) => o?.data?.error).find((e) => e && e !== "0x");
  if (opErr) throw new Error(`interaction ${txHash} reverted: ${opErr}`);

  // Operation payloads live on the tesseract, not the receipt.
  const tess = await rawRpc<{ ixns?: { hash: string; ix_operations?: RawOperation[] }[] }>(
    "moi.Tesseract",
    [{ id: receipt.from, options: { tesseract_hash: receipt.ts_hash }, with_interactions: true, with_commit_info: false }],
  ).catch(() => null);

  const ixn = tess?.ixns?.find((i) => i.hash?.toLowerCase() === txHash.toLowerCase());
  if (!ixn) throw new Error(`could not read operations for ${txHash}`);

  const want = normalizeAddress(assetId);
  const op = ixn.ix_operations?.find(
    (o) => Number(o.type) === ASSET_INVOKE && normalizeAddress(String(o.payload?.asset_id ?? "")) === want,
  );
  if (!op) throw new Error(`${txHash} contains no MAS0 operation on asset ${assetId}`);

  const callsite = String(op.payload?.callsite ?? "");
  const calldata = String(op.payload?.calldata ?? "");
  if (!calldata || calldata === "0x") throw new Error(`${txHash} has empty calldata`);

  const decoded = decodeTransferCalldata(calldata);

  return {
    txHash,
    from: String(receipt.from).toLowerCase(),
    beneficiary: decoded.beneficiary,
    amount: decoded.amount,
    assetId: String(op.payload?.asset_id ?? assetId).toLowerCase(),
    callsite,
    tsHash: receipt.ts_hash,
  };
}

/** POLO-decode a MAS0 Transfer calldata using the SDK's own exported schema. */
export function decodeTransferCalldata(calldata: string): { beneficiary: string; amount: bigint } {
  const bytes = Uint8Array.from(
    (calldata.startsWith("0x") ? calldata.slice(2) : calldata).match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? [],
  );
  const depolorizer = new Depolorizer(bytes);
  const obj = depolorizer.depolorize(TRANSFER_SCHEMA as never) as {
    beneficiary?: unknown;
    amount?: unknown;
  };
  const beneficiary = toHexAddress(obj.beneficiary);
  if (!beneficiary) throw new Error("could not decode transfer beneficiary");
  return { beneficiary, amount: BigInt(String(obj.amount ?? 0)) };
}

function toHexAddress(v: unknown): string | null {
  if (typeof v === "string") return ("0x" + normalizeAddress(v)).toLowerCase();
  if (v instanceof Uint8Array) {
    return "0x" + Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return null;
}

/**
 * Replay guard. A signed authorization names ONE transfer; the same transfer must not buy twice.
 * In-memory is correct for a single-process demo facilitator — a real one needs shared storage,
 * and that limitation is stated rather than hidden.
 */
export class ConsumedTransfers {
  private seen = new Set<string>();
  /** Returns false when this hash was already spent. */
  consume(txHash: string): boolean {
    const k = txHash.toLowerCase();
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
  has(txHash: string): boolean {
    return this.seen.has(txHash.toLowerCase());
  }
}
