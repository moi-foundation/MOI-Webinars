// Provider + wallets.
//
// SESSION 8 = V2. Both agents are INHERITED SUB-ACCOUNTS of one funded primary.
//
// HONESTY: sub-accounts share the primary's key. This is not key isolation and not a permission
// sandbox. What inheritance buys is actor state under the AgentBudget logic — which is what lets
// the chain enforce the parent's cap. See budget.ts.

import { VoyageProvider, Wallet, createParticipantId, ParticipantTagV0, hexToBytes } from "js-moi-sdk";
import { config } from "./config.js";

export const makeProvider = (): VoyageProvider => new VoyageProvider("devnet");

export interface Account {
  label: string;
  wallet: Wallet;
  provider: VoyageProvider;
  /** MOI participant identifier, lowercase 0x + 32 bytes. */
  address: string;
  /** Compressed secp256k1 public key, hex, NO 0x prefix. */
  publicKey: string;
  keyId: number;
  /** null for the primary; the sub-account index otherwise. */
  index: number | null;
}

export async function loadAccount(label: string, index: number | null): Promise<Account> {
  const provider = makeProvider();
  const wallet = await Wallet.fromMnemonic(config.mnemonic, config.derivationPath);
  if (index !== null && Number.isFinite(index)) wallet.setSubAccountId(index);
  wallet.connect(provider);
  return {
    label,
    wallet,
    provider,
    address: (await wallet.getIdentifier()).toHex().toLowerCase(),
    publicKey: wallet.getPublicKey(),
    keyId: await wallet.getKeyId(),
    index,
  };
}

export const primaryAccount = () => loadAccount("primary", null);
export const buyerAccount = () => loadAccount("buyer", config.buyerIndex);
export const sellerAccount = () => loadAccount("seller", config.sellerIndex);

/**
 * Sub-account address = primary's first 28 bytes + 4-byte big-endian index.
 * VERIFIED LIVE to reproduce the SDK's own derivation for indices 1, 2, 7, 4096.
 */
export const subAccountAddress = (primary: string, index: number): `0x${string}` =>
  (primary.slice(0, 58) + Number(index).toString(16).padStart(8, "0")) as `0x${string}`;

export const subAccountIndex = (address: string): number => parseInt(address.slice(-8), 16);

/**
 * True when two identifiers share the same 28-byte key prefix — same primary key, differing only
 * by sub-account index. Sub-accounts SHARE the primary's key, so the facilitator matches the key
 * FAMILY and reads the index from the address.
 */
export const sameKeyFamily = (a: string, b: string): boolean =>
  a.slice(0, 58).toLowerCase() === b.slice(0, 58).toLowerCase();

/**
 * Derive a participant identifier from a compressed public key.
 * VERIFIED LIVE — reproduces wallet.getIdentifier().
 *
 * NOTE: this yields the PRIMARY identifier for a key. Sub-accounts share it, differing only in the
 * last 4 bytes — so compare with `sameKeyFamily`, not for equality.
 */
export function identifierFromPublicKey(publicKey: string): string {
  const key = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return createParticipantId({
    tag: ParticipantTagV0,
    fingerprint: hexToBytes("0x" + key.slice(2)).slice(0, 24),
    variant: 0,
  }).toHex().toLowerCase();
}

export const normalizeAddress = (a: string): string => {
  const s = String(a).toLowerCase();
  return s.startsWith("0x") ? s.slice(2) : s;
};

export const addr0x = (a: string): string => "0x" + normalizeAddress(a);

/** Does this account exist on chain? Registry reads REQUIRE it — see SDK_NOTES. */
export async function existsOnChain(account: Account, id = account.address): Promise<boolean> {
  try {
    await account.provider.getAccountMetaInfo(id);
    return true;
  } catch {
    return false;
  }
}

/** Poll for an interaction receipt. Returns null on timeout. */
export async function waitReceipt(
  account: Account,
  hash: string,
  timeoutMs = 120_000,
): Promise<Record<string, unknown> | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = (await account.provider.getInteractionReceipt(hash)) as unknown as Record<string, unknown>;
      if (r) return r;
    } catch {
      /* not mined yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * A receipt is not success on its own — check status (0 = ok) and per-op errors.
 * Returns a failure reason, or null when the interaction genuinely succeeded.
 */
export function receiptError(receipt: Record<string, unknown> | null): string | null {
  if (!receipt) return "no receipt";
  const ops = (receipt.ix_operations ?? receipt.op_results ?? []) as Record<string, any>[];
  const opErr = ops.map((o) => o?.error ?? o?.data?.error).find((e) => e && e !== "0x");
  if (Number(receipt.status) === 1 || ops.some((o) => Number(o?.status) === 1)) {
    return String(opErr ?? "interaction failed");
  }
  return opErr ? String(opErr) : null;
}

/** Raw JSON-RPC for methods the typed provider does not wrap (moi.Tesseract with options, …). */
export async function rawRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const host = (makeProvider() as unknown as { host: string }).host;
  const res = await fetch(host, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { error?: { message?: string }; result?: T };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}
