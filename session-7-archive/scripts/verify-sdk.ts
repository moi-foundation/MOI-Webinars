// Reproducible evidence for every claim in SDK_NOTES.md that is marked "VERIFIED LIVE".
//
//   npm run verify-sdk
//
// Needs NO funded wallet and NO .env — it generates throwaway mnemonics. Run it if an SDK bump
// ever makes you doubt the notes.

import {
  VoyageProvider,
  Wallet,
  generateMnemonic,
  getAssetDriver,
  KMOI_ASSET_ID,
  MAS0AssetLogic,
} from "js-moi-sdk";
import { identifierFromPublicKey, canonicalAuthorizationBytes } from "@s7/shared";
import { DEFAULT_DERIVATION_PATH, VOYAGE_DEVNET_RPC } from "@s7/shared";
import { banner, detail, ok, fail, summary } from "@s7/shared";
import type { MoiPaymentAuthorization } from "@s7/shared";

let failures = 0;
const assert = (label: string, cond: boolean, note = "") => {
  if (cond) ok(`${label}${note ? ` — ${note}` : ""}`);
  else {
    fail(`${label}${note ? ` — ${note}` : ""}`);
    failures++;
  }
};

banner("SETUP", "§1", "Provider + wallet");
const provider = new VoyageProvider("devnet");
const host = (provider as unknown as { host?: string }).host ?? "(unknown)";
detail("VoyageProvider host", host);
assert("devnet host matches SDK_NOTES", host === VOYAGE_DEVNET_RPC);

const wallet = await Wallet.fromMnemonic(generateMnemonic(), DEFAULT_DERIVATION_PATH);
wallet.connect(provider);
const address = (await wallet.getIdentifier()).toHex();
const publicKey = wallet.getPublicKey();
const keyId = await wallet.getKeyId();
detail("identifier", address);
detail("publicKey", publicKey);
detail("keyId", keyId);
assert("publicKey has no 0x prefix", !publicKey.startsWith("0x"));
assert("identifier is 0x + 32 bytes", /^0x[0-9a-f]{64}$/i.test(address));

for (const m of ["execute", "processResponse", "getBalance", "getTDU", "getAccountMetaInfo", "getLogs", "getTesseract"]) {
  assert(`provider.${m} exists`, typeof (provider as never)[m as never] === "function");
}
detail("KMOI_ASSET_ID", KMOI_ASSET_ID);
assert("getAssetDriver exported", typeof getAssetDriver === "function");
assert("MAS0AssetLogic.create exported", typeof MAS0AssetLogic.create === "function");
for (const m of ["mint", "transfer", "transferFrom", "approve", "lockup", "release", "balanceOf"]) {
  assert(`MAS0AssetLogic#${m} exists`, typeof (MAS0AssetLogic.prototype as never)[m as never] === "function");
}

banner("SETUP", "§2", "Arbitrary-message sign + verify — the x402 payment authorization");
const sigAlgo = wallet.signingAlgorithms.ecdsa_secp256k1;
detail("sigName", String(sigAlgo.sigName));
detail("prefix", sigAlgo.prefix);

const auth: MoiPaymentAuthorization = {
  from: address,
  to: "0x" + "11".repeat(32),
  asset: "0x" + "22".repeat(32),
  value: "1000",
  validAfter: "0",
  validBefore: "9999999999",
  nonce: "0x" + "33".repeat(32),
  resource: "http://example.test/signal",
};
const message = canonicalAuthorizationBytes(auth);
const signature = await wallet.sign(message, keyId, sigAlgo);
detail("signature", `${signature.slice(0, 24)}… (${signature.length} chars)`);

assert("verify with own public key", wallet.verify(message, signature, publicKey) === true);

const other = await Wallet.fromMnemonic(generateMnemonic(), DEFAULT_DERIVATION_PATH);
assert(
  "verify FAILS with a different key",
  wallet.verify(message, signature, other.getPublicKey()) === false,
);

const tamperedBytes = canonicalAuthorizationBytes({ ...auth, value: "999999" });
assert(
  "verify FAILS on a tampered amount",
  wallet.verify(tamperedBytes, signature, publicKey) === false,
);

banner("SETUP", "§3", "Public key → participant identifier (the identity bind)");
for (let i = 0; i < 4; i++) {
  const w = await Wallet.fromMnemonic(generateMnemonic(), DEFAULT_DERIVATION_PATH);
  const expected = (await w.getIdentifier()).toHex().toLowerCase();
  const derived = identifierFromPublicKey(w.getPublicKey());
  assert(`wallet ${i}: derived === getIdentifier()`, derived === expected, derived);
}

banner("SETUP", "§7", "Devnet reachability");
try {
  const res = await fetch(VOYAGE_DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "moi.Lockups", params: [{ id: address, options: { tesseract_number: -1 } }] }),
  });
  const json = (await res.json()) as { error?: { message?: string }; result?: unknown };
  // An unfunded throwaway account legitimately answers "account not found" — that still proves the
  // endpoint is live and the method is routed.
  const routed = res.status === 200 && (json.result !== undefined || typeof json.error?.message === "string");
  detail("moi.Lockups", json.error?.message ?? JSON.stringify(json.result));
  assert("devnet RPC reachable and routing moi.Lockups", routed);
} catch (err) {
  assert("devnet RPC reachable", false, (err as Error).message);
}

summary(failures === 0 ? "SDK_NOTES.md verified" : "SDK_NOTES.md has DRIFTED", [
  ["failures", String(failures)],
  ["js-moi-sdk", "0.7.1"],
  ["network", "MOI Voyage devnet"],
]);

process.exit(failures === 0 ? 0 : 1);
