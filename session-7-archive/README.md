# Session 7 — Agentic Payments: x402 × MOI

Two autonomous agents that pay each other for data over the **x402** protocol, settled **natively
on MOI**.

- **Agent A** — the buyer. A pure agent loop, no human in it.
- **Agent B** — the seller. A "Signal Agent" selling one prediction-market probability.
- **Facilitator** — the only chain-specific piece. Verifies the payment authorization and settles a
  MAS0 transfer on MOI Voyage devnet.

> **Status: Phase 1 + 2 implemented.** The full flow runs end to end, and `npm run attack-test`
> proves the facilitator rejects forged payments. Settlement uses only MAS0 primitives already
> proven on devnet by [session 4](../session-4). See [Build phases](#build-phases) for what is
> confirmed against a funded devnet wallet and what is not.

---

## How this maps x402 → MOI

x402 solves the agent-to-agent **payment handshake**: a client hits a paid endpoint, gets back
`HTTP 402` describing what to pay, signs a payment authorization, retries with an `X-Payment`
header, and a **facilitator** verifies and settles it. What x402 deliberately does *not* solve is
**identity** — it tells you an amount and a 32-byte address, but nothing about *who* that address
is or whether they should be trusted — and it does not solve **conditional settlement**: the
"exact" scheme is fire-and-forget, so a buyer pays before knowing whether the goods arrive. MOI
supplies exactly those two missing halves. The **agent registry** gives each agent a verifiable
on-chain participant identity, so the facilitator can refuse a payment from an unregistered payer
or to an unregistered seller — a check no x402 facilitator on any other chain can perform. And
**lockup/release** gives real escrow, turning the same handshake into pay-on-delivery. Because the
facilitator is x402's only chain-specific component, **that one service is our entire integration
seam**: everything above it is unmodified x402 protocol, and everything below it is MOI. MOI is not
"another chain x402 settles on" — it is the **authority and settlement layer** underneath it.

### Where each piece of the protocol lives

| x402 concept | This repo | Chain-specific? |
| --- | --- | --- |
| `HTTP 402` + `accepts[]` body | `packages/shared/src/x402.ts` | no |
| `X-Payment` header (base64 JSON) | `packages/shared/src/x402.ts` | no |
| Payment authorization + signature | `packages/shared/src/moi.ts` | **yes** — `wallet.sign()` |
| `POST /verify`, `POST /settle` | `packages/facilitator` | **yes** |
| Settlement | `packages/shared/src/settlement.ts` | **yes** — MAS0 Lockup → Release → Transfer |
| Identity / authority | `packages/shared/src/registry.ts` | **yes** — MOI-only |

⚠️ We keep the x402 **wire protocol** exactly, and reuse the real `x402` package's facilitator
client, but `x402-express` and `x402-fetch` **cannot be used** — they hard-throw on any network
outside their EVM/SVM allow-lists. The reasoning, with source citations, is in
[SDK_NOTES.md §5](./SDK_NOTES.md).

---

## Prerequisites

- **Node.js 20+**
- **Two funded MOI devnet wallets** — create and fund at <https://voyage.moi.technology>.
  The faucet funds derivation path `m/44'/6174'/7020'/0/0`.
  Agent A needs the payment asset **and** KMOI for fuel; Agent B and the facilitator need KMOI.

No Coco toolchain is needed — MAS0 is a native asset, not a deployed logic.

---

## Runbook

```bash
cd session-7
npm install
cp .env.example .env       # paste your funded devnet mnemonics
```

Then, in order:

```bash
npm run verify-sdk
```

Confirms every API this repo depends on, against the live devnet. Needs no wallet and no `.env`.
Run it first — if it fails, the SDK moved and [SDK_NOTES.md](./SDK_NOTES.md) is stale.

```bash
npm run setup-asset
```

Mints the MAS0 payment asset (`USDM`) on devnet and gives Agent A a float to spend. Writes
`ASSET_ID` back into `.env`. There is no standing approval to grant — the buyer escrows funds per
request, so nothing is pre-authorized.

```bash
npm run register-agents
```

Registers Agent A and Agent B in the on-chain MOI agent registry and writes `AGENT_A_ID` /
`AGENT_B_ID` into `.env`. **This is the step that makes the payment verifiable rather than merely
valid.**

```bash
npm run demo
```

Runs the whole Tier 1 flow: starts the facilitator and Agent B, then turns Agent A loose. Prints a
labeled banner for every step of the handshake and ends with a real MOI interaction hash plus the
delivered data.

```bash
npm run attack-test
```

Fires seven forged payments at the facilitator — tampered amount, redirected payee, impersonated
payer, expired authorization, wrong resource, underpayment — plus one honest control payment. All
seven must be rejected and the control accepted. Runs on the mock backend, so no funds are needed.

### The trace you should see

```
AGENT-A  · 1   Discover agent-b in the MOI registry
AGENT-A  · 2   GET /signal            -> 402 Payment Required
AGENT-A  · 3   Check price vs budget AND payTo vs the registry
AGENT-A  · 4a  Lockup funds on MOI, naming the facilitator
AGENT-A  · 4b  Sign the payment authorization
AGENT-A  · 5   GET /signal + X-Payment
AGENT-B  · 6   Received X-Payment -> facilitator POST /verify
FACIL.   · 7   8 checks: signature, key-binds-to-account, registry, escrowed funds
FACIL.   · 8   POST /settle -> Release -> Transfer -> interaction hash
AGENT-B  · 9   200 OK + signal + X-Payment-Response
AGENT-A  · 10  Receipt verified
```

Under `ESCROW=true`, steps 8 and 9 swap: agent-b produces the signal first, and the facilitator
only releases the escrow once it has. If agent-b fails, the facilitator refunds the buyer.

### How settlement works, and one honest caveat

MAS0 has no EIP-3009 equivalent, so the facilitator cannot pull funds from a signature alone. It
can only move funds it is the **beneficiary** of. So the buyer locks up naming the facilitator, and
settlement is two hops:

```
agent-a     --lockup(beneficiary=facilitator)-->  [locked]
facilitator --release(benefactor=agent-a)------>  facilitator
facilitator --transfer(agent-b)---------------->  agent-b
```

**The caveat:** this means the buyer makes one on-chain action between the 402 and the retry, where
pure x402 on EVM stays entirely off-chain until settlement. That is forced by the asset standard,
not chosen — and the off-chain signature still does real work, binding the payment to *this
resource at this price*. `npm run attack-test` is the proof.

### Running without funded wallets

```bash
SETTLEMENT=mock npm run demo
```

Runs the entire protocol — real MOI signatures, real verification, real registry checks — with an
in-memory ledger. Receipts come back as obviously-fake `0xmock…` hashes so a rehearsal can never be
mistaken for a real settlement. Useful for practising the talk, or if conference wifi dies.

---

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| **0** | SDK verification, workspace scaffold, `.env.example`, README | ✅ done |
| **1** (Tier 1) | Fire-and-forget flow end to end | ✅ implemented |
| **2** (Tier 2) | Escrowed pay-on-delivery, behind `ESCROW=true` | ✅ implemented |

**What is proven, and what is not.** The protocol layer is verified end to end: `npm run
verify-sdk` passes 24 live assertions against devnet, `npm run attack-test` rejects all seven
forgeries, and `SETTLEMENT=mock npm run demo` completes both tiers. The MAS0 primitives underneath
(`create`, `mint`, `lockup`, `release`, `transfer`) are proven on devnet by
[session 4](../session-4).

⚠️ What has **not** yet been run is this repo's specific `setup-asset` → `register-agents` →
`demo` sequence against a **funded** devnet wallet, end to end, in one go. That needs two funded
mnemonics. Everything is written against verified APIs, but until someone runs it with real funds,
treat the on-chain path as "assembled from proven parts", not "observed working".

---

## Layout

```
session-7/
├── SDK_NOTES.md              verified API surface — read this first
├── packages/
│   ├── shared/               types, config, MOI helpers, registry, x402 wire format
│   ├── facilitator/          Express service: verify + settle on MOI
│   ├── agent-b/              resource server — the Signal Agent (seller)
│   └── agent-a/              the buyer's agent loop
└── scripts/
    ├── verify-sdk.ts         proves SDK_NOTES.md is still true
    ├── setup-asset.ts        mint MAS0 "USDM"
    ├── register-agents.ts    register A + B on-chain
    ├── demo.ts               the whole flow, one command
    └── attack-test.ts        seven forged payments; all must be rejected
```

Inside `packages/shared/src/`, the split that matters is `x402.ts` + `x402-moi/` (protocol, chain
agnostic) versus `moi.ts` + `settlement.ts` + `registry.ts` (MOI). That boundary is the talk.

## Security

- `.env` is gitignored repo-wide. **Never commit a mnemonic.**
- Devnet only. These wallets should hold nothing you would miss.
