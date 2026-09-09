// Provider + wallets.
//
// Two plain accounts derived from one mnemonic:
//
//   OWNER  the funded wallet. It deploys the logic, owns the actor state, and registers policies.
//   AGENT  a second derivation path with its own key. It calls the logic. Needs fuel, nothing else.

import {
  VoyageProvider, Wallet, createParticipantId, ParticipantTagV0, hexToBytes,
  KMOI_ASSET_ID,
} from "js-moi-sdk";
import { config } from "./config.ts";

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

/** The OWNER — funded, owns the storage, writes the policies. */
export const ownerAccount = (): Promise<Account> => loadAccount("owner", config.derivationPath);

/** The AGENT — a separate account with its own key, wanting to write to the owner's storage. */
export const agentAccount = (): Promise<Account> => loadAccount("agent", config.agentDerivationPath);




/**
 * Derive a participant identifier from a compressed public key.
 * VERIFIED LIVE — reproduces wallet.getIdentifier().
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

/**
 * KMOI balance of any account. Returns null when it cannot be read at all — usually because the
 * account is not on this chain, which is worth distinguishing from a balance of zero.
 *
 * Fuel matters more here than it looks: a fuel_limit is checked against balance UP FRONT, so an
 * account below the limit is rejected at submission with "insufficient funds" — which is easy to
 * mistake for the access refusal this session is about.
 */
export async function kmoiBalance(_reader: Account, holder: string): Promise<bigint | null> {
  // Straight to moi.Balance rather than through an asset driver. A driver's BalanceOf is a logic
  // call, and calling it for an account other than the signer comes back empty — which reads as
  // "unreadable" for every account except your own. The RPC has no such problem.
  try {
    const hex = await rawRpc<string>("moi.Balance", [{
      id: holder, asset_id: KMOI_ASSET_ID, options: { tesseract_number: -1 },
    }]);
    return hex ? BigInt(hex) : 0n;
  } catch {
    return null;   // account genuinely not on this chain
  }
}

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
 * Pull the human-readable text out of an encoded runtime error.
 *
 * Errors come back POLO-encoded, which prints as a wall of hex — useless on a call, and the
 * message is the entire payoff of the refusal beat. The readable parts are plain ASCII runs
 * inside that blob, so lifting runs of printable characters recovers them without needing a
 * decoder for the surrounding envelope.
 *
 * Returns the input unchanged when there is nothing readable in it.
 */
export function decodeRuntimeError(raw: string): string {
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 8) return raw;
  const bytes = Buffer.from(hex, "hex");

  const runs: string[] = [];
  let cur = "";
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) cur += String.fromCharCode(b);
    else { if (cur.length >= 6) runs.push(cur); cur = ""; }
  }
  if (cur.length >= 6) runs.push(cur);
  if (!runs.length) return raw;

  let text = runs.join(" ");
  // Everything from runtime.root() on is the VM stack trace. Useful when debugging, noise on a
  // projector — and the message before it is the whole point of the refusal.
  text = text.split("runtime.root()")[0] ?? text;
  // The error class and its message sit flush against each other with no delimiter byte between
  // them, so split on the class name rather than trying to find a separator that is not there.
  const m = text.match(/(builtin\.[A-Za-z]*Error)\s*(.*)/);
  if (m) return `${m[1]}: ${(m[2] ?? "").replace(/[\s?|]+$/, "").trim()}`;
  return text.replace(/[\s?|]+$/, "").trim();
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
    return decodeRuntimeError(String(opErr ?? "interaction failed"));
  }
  return opErr ? decodeRuntimeError(String(opErr)) : null;
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
