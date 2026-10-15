# MOI Builders #9 — Agentic Payments V3: the open door

**Everything session 8 does, spoken in a wire format strangers already understand.**

Part 3 of 3. Start with [session 7](../session-7), then [session 8](../session-8).

---

## The idea

Sessions 7 and 8 work — for exactly two agents that already know each other's shape. They speak a
wire format we invented. That is fine for two agents in one repo and useless for an open market.

Session 9 adopts [x402](https://x402.org): HTTP `402 Payment Required` as a real protocol. The
server answers 402 with a machine-readable description of what it wants; the client pays and
retries with a payment header.

**The claim, stated precisely:**

> Any x402 client can **read** our invoice. Only a client that implements our scheme can **pay** it.

That is real interoperability at discovery and negotiation. It is **not** drop-in payment
compatibility, and the difference matters. `npm run x402:probe` demonstrates both halves.

---

## Why we implement the spec by hand

Two findings, both verified against the installed package rather than assumed.

**The npm packages cannot be used.** `x402-express` and `x402-fetch` zod-validate against **closed
enums**:

```ts
scheme:  z.ZodEnum<["exact"]>
network: z.ZodEnum<["abstract", "base-sepolia", "base", "solana", ...16 total]>
```

Neither can name a MOI network or a 32-byte MOI participant identifier. `x402-fetch` parses the
402 body *before* signing anything, so it throws on ours before our code runs. `x402-express`
ends its network dispatch in a literal `throw new Error("Unsupported network")`.

**MOI has no detached-authorization signing.** x402's own scheme signs a transfer *authorization*
that someone else submits. On MOI you sign a whole interaction or nothing — there is nothing to
hand over.

So we keep the envelope and declare our own scheme. **That is what a scheme identifier is for.**
We are not forking x402; we are using the extension point it ships with.

---

## What is ours vs the spec's

| Layer | Whose |
| --- | --- |
| `402` status, pay, retry | x402 |
| Body shape `{ x402Version, accepts[] }` | x402 |
| `X-PAYMENT` / `X-PAYMENT-RESPONSE` headers | x402 |
| Field names in `accepts[]` | x402, verbatim |
| `scheme: "moi-transfer"` | **ours** |
| `network: "moi-voyage-devnet"` | **ours** |
| Settlement: pay first, then prove | **ours** |
| Identity check against the registry | **ours** (session 7) |
| Spend cap via allowance | **ours** (session 8) |

Everything MOI-specific rides in `extra`, which the spec types as an open record. A compliant
parser reads what it knows and ignores the rest.

---

## Run it

```bash
npm install
cp .env.example .env          # paste ONE funded devnet mnemonic
npm run preflight
npm run setup:asset
npm run setup:registry
npm run setup:authority       # session 8's allowance
npm run seller                # in one terminal
npm run x402:probe            # in another — a stranger reads our invoice
npm run demo                  # the full purchase
npm run attack-test           # twelve forged payments, each rejected for its own reason
```

---

## The one field that matters most

```jsonc
"extra": {
  "symbol": "USDM",
  "payToAgentId": "agent_132"   // ← x402 has no place for this
}
```

x402 tells a client **where** to send money. It has no opinion on **whose** address that is —
the same gap session 7 was about, now visible inside a standard. So the seller's on-chain agent id
travels in `extra`, and the buyer checks it against the registry before paying.

A standard makes the invoice legible. It does not make the payee honest.

---

## Honesty guardrails

- **"Compatible with x402" means legible, not payable.** Say both halves or neither.
- **x402 v1.2.0 is deprecated upstream** (v2 is current). We target v1 because that is what the
  installed package implements and what the earlier build verified against.
- Sessions 7 and 8's guardrails still apply — see their READMEs. Nothing here relaxes them.
