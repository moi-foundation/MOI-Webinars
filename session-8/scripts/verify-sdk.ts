// Phase 0 verification. Every claim in SDK_NOTES.md marked "VERIFIED LIVE" is produced here.
//
//   pnpm verify-sdk
//
// Needs NO funded wallet and NO .env — it generates throwaway mnemonics. Anything requiring
// funds is reported as UNVERIFIABLE-WITHOUT-FUNDS rather than silently assumed.

import {
  VoyageProvider,
  Wallet,
  generateMnemonic,
  MAS0AssetLogic,
  getAssetDriver,
  getLogicDriver,
  AccountInherit,
  LogicFactory,
  KMOI_ASSET_ID,
  createParticipantId,
  ParticipantTagV0,
  hexToBytes,
} from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import * as registryPkg from "js-moi-agent-registry";

const PATH = "m/44'/6174'/7020'/0/0";
const RPC = "https://dev.voyage-rpc.moi.technology/devnet/";

let fails = 0;
const ok = (label: string, note = "") => console.log(`  \x1b[32m✓\x1b[0m ${label}${note ? ` — ${note}` : ""}`);
const bad = (label: string, note = "") => { console.log(`  \x1b[31m✗\x1b[0m ${label}${note ? ` — ${note}` : ""}`); fails++; };
const check = (label: string, cond: boolean, note = "") => (cond ? ok(label, note) : bad(label, note));
const head = (s: string) => console.log(`\n\x1b[1m\x1b[34m── ${s} ${"─".repeat(Math.max(0, 74 - s.length))}\x1b[0m`);
const info = (k: string, v: unknown) => console.log(`     \x1b[2m${k.padEnd(22)}\x1b[0m ${String(v)}`);

// ═══ §2.1 registry surface ═══════════════════════════════════════════════════════════════
head("§2.1  js-moi-agent-registry@0.1.1");
for (const name of ["AgentRegistry", "buildAgentCard", "agentCardToJson", "AgentStatus",
  "ContractLoadError", "UploaderRequiredError", "UploaderError", "TransactionError",
  "QueryError", "AgentNotFoundError"]) {
  check(`export ${name}`, name in registryPkg);
}
const R = (registryPkg as Record<string, any>).AgentRegistry;
check("AgentRegistry.init is static", typeof R?.init === "function");
for (const m of ["createAgent", "registerAgent", "updateAgentWallet", "updateCard", "setAgentStatus",
  "setScore", "transferAgent", "getAgentProfile", "getAgentsByOwner", "getMyAgents",
  "getAllAgentIds", "getAgentCount"]) {
  check(`AgentRegistry#${m}`, typeof R?.prototype?.[m] === "function");
}
info("AgentStatus", JSON.stringify((registryPkg as Record<string, any>).AgentStatus));

// ═══ §2.2 context inheritance surface ════════════════════════════════════════════════════
head("§2.2  Context inheritance / AgentBudget");
check("AccountInherit exported", typeof AccountInherit === "function");
check("getLogicDriver exported", typeof getLogicDriver === "function");
check("LogicFactory exported", typeof LogicFactory === "function");
check("LockType.NO_LOCK exists", (LockType as Record<string, unknown>).NO_LOCK !== undefined,
  `NO_LOCK=${(LockType as Record<string, unknown>).NO_LOCK}`);
info("KMOI_ASSET_ID", KMOI_ASSET_ID);
for (const m of ["target", "index", "value", "send"]) {
  check(`AccountInherit#${m}`, typeof (AccountInherit.prototype as Record<string, any>)[m] === "function");
}

// ═══ §2.2 wallet derivation + sub-account math ═══════════════════════════════════════════
head("§2.2  Wallet derivation + sub-account address math");
const provider = new VoyageProvider("devnet");
info("VoyageProvider host", (provider as unknown as { host?: string }).host);
check("devnet host matches spec", (provider as unknown as { host?: string }).host === RPC);

const primary = await Wallet.fromMnemonic(generateMnemonic(), PATH);
primary.connect(provider);
const primaryAddr = (await primary.getIdentifier()).toHex().toLowerCase();
info("primary", primaryAddr);
check("primary is 0x + 32 bytes", /^0x[0-9a-f]{64}$/.test(primaryAddr));

// `makeWallet` is a session-6 helper, NOT an SDK export. What it actually does:
check("Wallet#setSubAccountId exists (what makeWallet wraps)",
  typeof (Wallet.prototype as Record<string, any>).setSubAccountId === "function");
check("Wallet#getSubAccountId exists",
  typeof (Wallet.prototype as Record<string, any>).getSubAccountId === "function");

const subAccountAddress = (p: string, i: number) =>
  p.slice(0, 58) + Number(i).toString(16).padStart(8, "0");
const subAccountIndex = (a: string) => parseInt(a.slice(-8), 16);

for (const idx of [1, 2, 7, 4096]) {
  const sub = await Wallet.fromMnemonic(primary.mnemonic, PATH);
  sub.connect(provider);
  (sub as Record<string, any>).setSubAccountId(idx);
  const derivedBySdk = (await sub.getIdentifier()).toHex().toLowerCase();
  const derivedByMath = subAccountAddress(primaryAddr, idx);
  check(`sub-account idx=${idx}: spec math === SDK getIdentifier()`,
    derivedByMath === derivedBySdk, derivedBySdk);
  check(`  round-trip index`, subAccountIndex(derivedBySdk) === idx);
}

// ═══ (d) VERIFY FIRST — signer sign/verify ═══════════════════════════════════════════════
head("(d)  js-moi-signer sign / verify  — the payment authorization");
const sigAlgo = primary.signingAlgorithms.ecdsa_secp256k1;
info("sigName / prefix", `${sigAlgo.sigName} / ${sigAlgo.prefix}`);
const keyId = await primary.getKeyId();
const msg = new TextEncoder().encode(JSON.stringify(["x402-auth", primaryAddr, "1000"]));
const sig = await primary.sign(msg, keyId, sigAlgo);
info("signature", `${sig.slice(0, 26)}… (${sig.length} chars)`);
check("verify with own public key", primary.verify(msg, sig, primary.getPublicKey()));

const other = await Wallet.fromMnemonic(generateMnemonic(), PATH);
check("verify FAILS with a different key", primary.verify(msg, sig, other.getPublicKey()) === false);
const tampered = new TextEncoder().encode(JSON.stringify(["x402-auth", primaryAddr, "999999"]));
check("verify FAILS on tampered message", primary.verify(tampered, sig, primary.getPublicKey()) === false);

// publicKey -> identifier: lets the facilitator prove the signer controls `from`
const idFromPub = (pub: string) =>
  createParticipantId({
    tag: ParticipantTagV0,
    fingerprint: hexToBytes("0x" + pub.slice(2)).slice(0, 24),
    variant: 0,
  }).toHex().toLowerCase();
for (let i = 0; i < 3; i++) {
  const w = await Wallet.fromMnemonic(generateMnemonic(), PATH);
  check(`publicKey -> identifier reproduces getIdentifier() [${i}]`,
    idFromPub(w.getPublicKey()) === (await w.getIdentifier()).toHex().toLowerCase());
}

// ═══ (b)(c) VERIFY FIRST — native asset create / transfer ════════════════════════════════
head("(b)(c)  MAS0 native asset — create / transfer / lockup / release");
check("MAS0AssetLogic.create (static)", typeof MAS0AssetLogic.create === "function");
check("MAS0AssetLogic.newAsset (static)", typeof MAS0AssetLogic.newAsset === "function");
for (const m of ["mint", "transfer", "transferFrom", "approve", "revoke", "lockup", "release", "balanceOf", "burn"]) {
  check(`MAS0AssetLogic#${m}`, typeof (MAS0AssetLogic.prototype as Record<string, any>)[m] === "function");
}
check("getAssetDriver exported", typeof getAssetDriver === "function");

// ═══ devnet reachability + raw RPC used by settlement ════════════════════════════════════
head("Devnet reachability");
for (const [method, params] of [
  ["moi.Lockups", [{ id: primaryAddr, options: { tesseract_number: -1 } }]],
] as const) {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as { error?: { message?: string }; result?: unknown };
    // An unfunded throwaway account answers "account not found" — still proves the route exists.
    check(`${method} routed`, res.status === 200 && (json.result !== undefined || !!json.error?.message),
      json.error?.message ?? JSON.stringify(json.result));
  } catch (err) {
    bad(`${method} routed`, (err as Error).message);
  }
}

// ═══ Groq ════════════════════════════════════════════════════════════════════════════════
head("Groq (agent brains)");
try {
  const groq = await import("groq-sdk");
  check("groq-sdk default export is a constructor", typeof groq.default === "function");
} catch (err) {
  bad("groq-sdk importable", (err as Error).message);
}

// ═══ Summary ═════════════════════════════════════════════════════════════════════════════
head(fails === 0 ? "ALL VERIFIED" : `${fails} FAILURE(S)`);
console.log(`
  Requires funded wallets (NOT verified here):
    · MAS0 create/mint/transfer/lockup/release actually executing
    · AccountInherit executing + SetBudget/RecordSpend/GetBudget round-trip
    · AgentRegistry.createAgent / getAgentProfile against the live contract
`);
process.exit(fails === 0 ? 0 : 1);
