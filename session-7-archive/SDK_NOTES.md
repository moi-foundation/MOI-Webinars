# SDK_NOTES.md — verified API surface

Everything below was checked against **installed TypeScript types in `node_modules`** and, where
marked ✅ **VERIFIED LIVE**, executed against MOI Voyage devnet on a real wallet.

Reproduce with:

```bash
npm run verify-sdk
```

Versions pinned for this session:

| Package | Version | Role |
| --- | --- | --- |
| `js-moi-sdk` | `0.7.1` | provider, wallet, signing, MAS0 assets |
| `js-moi-agent-registry` | `0.1.1` | on-chain agent identity |
| `x402` | `1.2.0` | wire types + facilitator HTTP client |
| `x402-express` | `1.2.0` | ⚠️ **not usable** — see §5 |
| `x402-fetch` | `1.2.0` | ⚠️ **not usable** — see §5 |

---

## 1. Provider + signer

```ts
import { VoyageProvider, Wallet } from "js-moi-sdk";

const provider = new VoyageProvider("devnet");
const wallet = await Wallet.fromMnemonic(mnemonic, "m/44'/6174'/7020'/0/0");
wallet.connect(provider);

const identifier = (await wallet.getIdentifier()).toHex(); // 0x…32 bytes
const publicKey  = wallet.getPublicKey();                  // 33-byte compressed, NO 0x prefix
const keyId      = await wallet.getKeyId();                // 0
```

✅ **VERIFIED LIVE.** `VoyageProvider("devnet")` resolves to
`https://dev.voyage-rpc.moi.technology/devnet/` (read off `provider.host`), and a raw JSON-RPC POST
to that URL returns well-formed JSON-RPC responses.

`m/44'/6174'/7020'/0/0` is the **Voyage faucet derivation path** — the same one sessions 3–6 use.

Provider methods confirmed present (`typeof === "function"`): `execute`, `processResponse`,
`getBalance`, `getTDU`, `getAccountMetaInfo`, `getLogs`, `getTesseract`, `getContextInfo`,
`getSubAccountCount`.

`KMOI_ASSET_ID` (fuel asset) = `0x108000004cd973c4eb83cdb8870c0de209736270491b7acc99873da100000000`.

---

## 2. Arbitrary-message signing — the x402 payment authorization

This is the single most important primitive for this demo: x402 requires the buyer to **sign a
payment authorization off-chain**, and the facilitator to **verify that signature**.

`js-moi-signer`'s `Signer` abstract class (which `Wallet` extends) declares:

```ts
abstract sign(message: Uint8Array, keyId: number, sigAlgo: SigType): Promise<string>;
verify(message: Uint8Array, signature: string | Uint8Array, publicKey: string | Uint8Array): boolean;
```

Usage:

```ts
const sigAlgo = wallet.signingAlgorithms.ecdsa_secp256k1; // sigName "ECDSA_S256", prefix 1
const signature = await wallet.sign(messageBytes, await wallet.getKeyId(), sigAlgo);
const ok = wallet.verify(messageBytes, signature, publicKeyHexNo0x);
```

✅ **VERIFIED LIVE**, including the negative cases that make it meaningful:

| Case | Result |
| --- | --- |
| `verify` with the signer's own public key | `true` |
| `verify` with a *different* wallet's public key | `false` |
| `verify` with a tampered message | `false` |

Signature is a hex string, 148 chars, prefixed `01` (the `ECDSA_S256` prefix byte).

> Note: `verify` is an instance method on `Signer`, but it is **pure** — it does not use the
> instance's own key. The facilitator can therefore instantiate any wallet (or a throwaway one) and
> use it purely as a verifier. We wrap this behind `verifyMoiSignature()` in `packages/shared` so
> the intent is explicit.

---

## 3. Public key → participant identifier (the identity bind)

The facilitator must prove that "the key that signed this authorization" **is** "the MOI account
being debited". MOI participant identifiers are derived deterministically from the public key:

```ts
import { createParticipantId, ParticipantTagV0, hexToBytes } from "js-moi-sdk";

// publicKey is the 33-byte compressed key as hex WITHOUT a 0x prefix, e.g. "02febf37…".
// Drop the leading 02/03 parity byte (`.slice(2)` = 2 hex chars), then take the next 24 bytes.
const fingerprint = hexToBytes("0x" + publicKey.slice(2)).slice(0, 24);

// GenerateParticipantOption is { tag, fingerprint, variant, flags? }.
// There is deliberately NO `version` field — the version rides on the tag (ParticipantTagV0).
// Passing one is silently ignored at runtime but is a type error; tsc caught this.
const derived = createParticipantId({ tag: ParticipantTagV0, fingerprint, variant: 0 }).toHex();
```

✅ **VERIFIED LIVE** — `derived === (await wallet.getIdentifier()).toHex()` for 4/4 randomly
generated wallets.

Layout: `0x` + `00000000` (4-byte tag/variant) + 24-byte fingerprint + `00000000`.

This is what makes the facilitator's verification non-trivially secure: a valid signature over the
authorization, plus a matching derived identifier, proves the holder of `authorization.from`
consented — without that account ever going online.

---

## 4. MAS0 native assets

From `js-moi-asset/lib.esm/mas0-asset.d.ts` (re-exported by `js-moi-sdk`):

```ts
class MAS0AssetLogic {
  constructor(assetId: string, signer: Signer);
  static create(signer, symbol, supply, manager, enableEvents): InteractionContext<ASSET_CREATE>;
  static newAsset(signer, symbol, supply, manager, enableEvents): Promise<MAS0AssetLogic>;
  mint(beneficiary, amount);
  transfer(beneficiary, amount);
  transferFrom(benefactor, beneficiary, amount);
  approve(beneficiary, amount, expiresAt);
  revoke(beneficiary);
  lockup(beneficiary, amount);
  release(benefactor, beneficiary, amount);
  balanceOf(id);
  burn(amount);
}
```

Send pattern (proven on devnet in `session-4/logic/`):

```ts
const ix = await MAS0AssetLogic.create(wallet, "USDM", supply, manager, true).send();
const [{ asset_id }] = await ix.result();
// ix.hash is the interaction hash — this is our x402 receipt
```

Balance reads go through the asset driver:

```ts
import { getAssetDriver } from "js-moi-sdk";
const driver = await getAssetDriver(assetId, signer);
const { output, error } = await driver.routines.BalanceOf(address);
// "asset not found" / "token not found" both mean zero
```

Status: **type-verified**; `create` / `mint` / `transfer` / `lockup` / `release` and balance reads
are additionally proven on devnet by session-4's working code — these are the ones we use.
`approve` / `transferFrom` are ⚠️ **type-verified only** and deliberately unused — see §7.1.

---

## 5. ⚠️ What we can and cannot reuse from the real x402 packages

The constraint was to use real x402 packages wherever they exist. Here is the honest boundary,
established by reading the **compiled runtime JS**, not just the types.

### Not usable: `x402-express`

`x402-express`'s `paymentMiddleware` ends its network dispatch with:

```js
} else {
  throw new Error(`Unsupported network: ${network}`);
}
```

after checking `SupportedEVMNetworks.includes(network)` and `SupportedSVMNetworks.includes(network)`.
It also calls `processPriceToAtomicAmount(price, network)` (maps `$0.01` → a hardcoded USDC address
per network) and `viem.getAddress(payTo)` — neither of which can express a MOI participant
identifier or a MAS0 asset id. **This is a hard runtime throw, not a type-level complaint.**

### Not usable: `x402-fetch`

`wrapFetchWithPayment(fetch, walletClient, …)` requires a viem `Signer` or a Solana
`MultiNetworkSigner` and dispatches internally to EVM/SVM payload builders. A `js-moi-sdk` `Wallet`
is neither.

### Also closed: the core zod schemas

```ts
const schemes = ["exact"] as const;
const NetworkSchema = z.enum(["abstract", …, "base-sepolia", "solana", …]); // no MOI entry
```

`PaymentRequirementsSchema` / `PaymentPayloadSchema` will **reject** `network: "moi-devnet"` or
`scheme: "exact-mas0"` if you call `.parse()` on them.

### ✅ Usable: `x402`'s `useFacilitator`

Verified by reading `x402/dist/cjs/verify/index.js` — `useFacilitator` performs **no zod validation
at runtime**. It is a plain HTTP client:

```js
const res = await fetch(`${url}/verify`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    x402Version: payload.x402Version,
    paymentPayload: toJsonSafe(payload),
    paymentRequirements: toJsonSafe(paymentRequirements),
  }),
});
```

The `network` string is entirely opaque to it. So the **facilitator protocol** (`POST /verify`,
`POST /settle`, the request/response envelopes) is genuinely reusable as-is, and that is precisely
the seam the thesis cares about.

Also usable: `x402/shared`'s `toJsonSafe`, and the `PaymentRequirements` / `PaymentPayload` /
`VerifyResponse` / `SettleResponse` **type shapes** (as TypeScript types, structurally widened for
our network/scheme).

### Conclusion

> We keep the x402 **wire protocol** byte-for-byte (HTTP 402 + `accepts[]` body, base64 `X-Payment`
> header, `X-Payment-Response` receipt, `POST /verify` + `POST /settle` facilitator API) and reuse
> `x402`'s facilitator client. We reimplement only the ~80 lines of Express middleware and fetch
> wrapper that the upstream packages hardcode to EVM/SVM. Those live in
> `packages/shared/src/x402-moi/` and are commented to point at exactly this section.

This is not us avoiding the real packages — it is the actual extension point, and it *is* the talk's
point: **x402 is chain-agnostic at the protocol layer and chain-specific only at the facilitator.**

---

## 6. Agent registry

From `js-moi-agent-registry@0.1.1` types:

```ts
const registry = await AgentRegistry.init({ wallet, uploader? });

await registry.registerAgent({ url, cardUri, agentWallet }): Promise<string>; // returns agent_id
await registry.createAgent(spec, info): Promise<string>;   // build+upload+register; needs uploader
await registry.getAgentProfile(agentId): Promise<{ profile: AgentProfile | null; found: boolean }>;
await registry.getAllAgentIds(): Promise<string[]>;
await registry.getAgentsByOwner(owner): Promise<string[]>;
await registry.getAgentCount(): Promise<bigint>;
```

`AgentProfile` = `{ agent_id, owner, agent_wallet, status, url, card_uri, score, created_at, updated_at }`.

**Design choice:** session-3 used `createAgent`, which requires an external `uploader` HTTP service
to host the agent card. We use **`registerAgent`** directly with a `data:` URI card instead, so this
demo has **no external service dependency** — one less thing to fail live on stage.

`AgentRegistry.init` fetches the contract manifest from chain; no logic id needed from us.

Status: **type-verified**. `init` / `getAgentCount` / `getAllAgentIds` / `getAgentProfile` are
additionally proven on devnet by session-3's working `discover.mjs`.

---

## 7. ⚠️ Open items — flagged, not invented

### 7.1 `approve` + `transferFrom` — unverified, and deliberately UNUSED

The obvious MOI analogue of x402's EIP-3009 flow would be `approve` once at setup, then
`transferFrom` per request. Both methods exist on `MAS0AssetLogic`, but **neither has been executed
on devnet** and both have known unknowns: the units/semantics of `expiresAt`, and whether
`transferFrom` enforces the allowance or silently no-ops the way `release` does.

**We do not use them.** Settlement is built on `lockup` / `release` / `transfer` instead — see
§7.2. This section stays as a record of the road not taken; if someone later confirms
`approve`/`transferFrom` on devnet, it becomes a second `MoiSettlementBackend` implementation and
nothing above the settlement seam has to change.

### 7.2 What settlement actually does (all primitives proven on devnet)

`lockup` / `release` / `transfer` and the raw `moi.Lockups` RPC are **proven on devnet with real
funds** by session-4. Three of its findings drive the design:

1. `lockup(beneficiary, amount)` is **irrevocable** — only the beneficiary can pull it.
2. `release(benefactor, beneficiary, amount)` must be **signed by the beneficiary**.
3. `release` has **no on-chain guard** — with nothing locked it "succeeds" and moves zero.

Fact 2 is load-bearing: a facilitator can only move funds it is the beneficiary of. So the buyer
locks up naming the **facilitator**, and settlement is two hops:

```
agent-a  --lockup(beneficiary=facilitator)-->  [locked]
facilitator --release(benefactor=agent-a, beneficiary=facilitator)--> facilitator
facilitator --transfer(agent-b)--> agent-b
```

Fact 3 means every hop asserts a real balance delta rather than trusting the interaction to have
reverted. Tier 2 reuses the identical lockup and simply settles *after* delivery, with a refund
path back to the buyer on failure.

**Trade-off, stated plainly:** the buyer performs one on-chain action (the lockup) between
receiving the 402 and retrying with `X-Payment`. Pure x402 on EVM keeps the buyer entirely
off-chain until settlement. This is forced by MAS0 having no contract-verified signature primitive,
not chosen. The off-chain signature still does real work — it binds the payment to *this resource
at this price*, and the facilitator refuses to settle without it (proven by
`npm run attack-test`).

### 7.3 Requires a funded devnet wallet

Nothing beyond signature verification can be end-to-end confirmed without a funded account. Fund at
<https://voyage.moi.technology> using derivation path `m/44'/6174'/7020'/0/0`.

The demo needs **two** funded wallets (agent-a and agent-b) plus optionally a third for the
facilitator; `.env.example` documents all three.

---

## 8. Known packaging quirk

`js-moi-providers@0.7.0`'s ESM build is stale and breaks bundlers (session-4 ships a
`patch-package` fix). This session is **Node-only, no bundler**, and we import through `js-moi-sdk`,
so the patch is not needed here. Do not copy session-4's `patches/` directory in.
