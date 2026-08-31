// Provider + wallets.
//
// SESSION 7 = V1. Two plain accounts, no sub-accounts, no inheritance:
//
//   BUYER   the funded wallet. It signs the MAS0 transfer, so it needs gas.
//   SELLER  a second derivation path. It only ever RECEIVES, so it needs no funding —
//           registration is signed by the owner, and receiving an asset costs the receiver nothing.
//
// That means the whole demo runs on ONE faucet top-up.

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
}

export async function loadAccount(label: string, derivationPath: string): Promise<Account> {
  const provider = makeProvider();
  const wallet = await Wallet.fromMnemonic(config.mnemonic, derivationPath);
  wallet.connect(provider);
  return {
    label,
    wallet,
    provider,
    address: (await wallet.getIdentifier()).toHex().toLowerCase(),
    publicKey: wallet.getPublicKey(),
    keyId: await wallet.getKeyId(),
  };
}

/** The funded wallet. This is the only account that needs gas. */
/** The BUYER — an inherited sub-account of the primary, signing with the shared key. */
export const buyerAccount = () => loadSubAccount("buyer", config.buyerIndex);
/** Receive-only. Never signs, never needs gas. */
/**
 * The AGENT's wallet — session 8. Holds no settlement asset; spends the owner's under an
 * allowance. Needs fuel to sign, nothing more.
 */
/**
 * The PRIMARY account — the wallet the faucet funded, index 0. It deploys the logic, inherits the
 * sub-accounts, and is what "the owner" means in session 8.
 */
export const primaryAccount = (): Promise<Account> => loadAccount("owner", config.derivationPath);

/**
 * Sign AS an inherited sub-account: same key, same derivation path, sub-account id set on the
 * wallet. This is what makes the buyer a sub-account rather than merely knowing about one.
 */
export async function loadSubAccount(label: string, index: number): Promise<Account> {
  const provider = makeProvider();
  const wallet = await Wallet.fromMnemonic(config.mnemonic, config.derivationPath);
  (wallet as any).setSubAccountId(index);
  wallet.connect(provider);
  return {
    label,
    wallet,
    provider,
    address: (await wallet.getIdentifier()).toHex().toLowerCase(),
    publicKey: wallet.getPublicKey(),
    keyId: await wallet.getKeyId(),
  };
}

/**
 * True when two identifiers share the same 28-byte prefix — same primary key, differing only by
 * sub-account index. Sub-accounts SHARE the primary's key, so a signature can only ever be bound
 * to the key FAMILY; the exact account comes from the address's last 4 bytes.
 */
export const sameKeyFamily = (a: string, b: string): boolean =>
  a.slice(0, 58).toLowerCase() === b.slice(0, 58).toLowerCase();

/**
 * Sub-account address derivation: primary's first 29 bytes + 4-byte index. Reproduces the SDK's
 * own arithmetic — verified against it for indices 1, 2, 7 and 4096 in the session-6 build.
 */
export const subAccountAddress = (primary: string, index: number): `0x${string}` =>
  (primary.slice(0, 58) + Number(index).toString(16).padStart(8, "0")) as `0x${string}`;

export const sellerAccount = () => loadAccount("seller", config.sellerDerivationPath);

/**
 * Derive a participant identifier from a compressed public key.
 * VERIFIED LIVE — reproduces wallet.getIdentifier().
 *
 * This is what lets the seller prove the signer actually controls the account being debited.
 * In V1 there are no sub-accounts, so the comparison is exact equality — see verify-payment.ts.
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
