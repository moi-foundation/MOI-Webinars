# Making MOI x402-compatible

*Draft for discussion. Nothing here has been pushed, published or filed anywhere.*

---

## 1. What x402 is

x402 is a standard for paying over HTTP. It uses `402 Payment Required` — a status code that has
been reserved and unused in HTTP since 1997.

The whole thing is two requests:

1. A client asks for something. The server answers **402**, and the body says what it costs:
   amount, asset, where to pay, and a deadline.
2. The client pays, then asks again with proof attached in a header. The server checks it and
   delivers.

That's it. The value is that the **refusal is machine-readable** — an agent can discover a price,
decide, and pay without a human, an account, or a prior integration.

It's governed by the **x402 Foundation**, under the Linux Foundation since July 2026. Members
include Visa, Mastercard, Stripe, Google, AWS, Cloudflare, Coinbase, Ripple and the Solana and
Stellar foundations.

### What it doesn't do

x402 moves money. It has no opinion on:

- **who owns the address you're paying** — it gives you *where*, never *whose*
- **what your agent is allowed to spend** — its own spend controls are client-side config, and
  the docs say *"pass `spendControls: false` to disable all spend controls"*
- **whether the seller will actually deliver**

Those need state that persists between strangers. That's a chain, not a wire format — and it's
where MOI is differentiated rather than merely compatible.

---

## 2. Where MOI stands today

**Better than expected.** Sessions 7–9 already implement x402's flow end to end: the seller answers
402, the buyer pays and proves, the seller verifies by reading the chain.

Three things we assumed were blockers turned out not to be:

| Assumption | Reality |
| --- | --- |
| We'd need a facilitator | No. x402 documents **self-facilitation** as a valid production path, and our seller already does it. |
| MOI's payment model doesn't fit | It does. **`upfront`** — pay first, then prove — is a first-class flow in x402 v2. |
| We'd need Coinbase to add us to a list | No. v2 uses open CAIP-2 identifiers, not a closed enum. |

**One real blocker did turn up: MOI has no CAIP-2 identifier.** That's the chain-naming standard
everything keys off — 55 chains are registered, MOI isn't, and no one has ever filed for it.

It matters well beyond x402. Wallets and cross-chain tooling use CAIP-2 too. x402 just happened to
surface it.

---

## 3. The steps

### Step 1 — Register `moi:` with CASA

A spec document submitted to `ChainAgnostic/namespaces`. Draft is written: `caip2-submission/`.

- Median **24 days** to merge. **91 of the last 100** PRs merged.
- Nobody has been rejected on merit. The one chain that failed did so because its author stopped
  replying for 587 days.
- **The risk is going quiet, not being refused. Name an owner before filing.**

### Step 2 — Publish the adapter

x402 v2 has a core that knows payments and a small adapter per chain. Ethereum, Solana, Stellar,
Aptos, NEAR, XRPL and five others have one. MOI needs one.

Draft is written and typechecks: `moi-x402/`. It answers three questions —

- how a buyer pays on MOI
- how a seller checks a payment arrived
- how a third party would settle one *(optional — nobody has to run it)*

All three already existed across sessions 7–9. This is repackaging, not new logic.

### Step 3 — Get listed

x402 publishes a network support page. Without being on it, we have a working package nobody can
find.

---

## 4. What's blocking, and who unblocks it

**One technical question, for the protocol team:**

> **How does a client find out which MOI network a node is on?**

There is no answer today. All 36 RPC methods were checked — `net.Version` returns the software
version, `net.Info` returns the node's own peer id, and `moi.Tesseract` is per-account so there is
no global genesis to read.

CAIP-2 requires a "resolution mechanics" section describing exactly this. Stellar answers it in one
line. We can't yet.

Likely a small addition — something like `net.Network` returning `"devnet"`. Useful far beyond
x402.

**Two decisions:**

- Who owns the CASA PR and will answer review comments for a month?
- Do we want Voyage to operate a facilitator? Not required — it's a service question, the same
  shape as the MCP server discussion.

---

## 5. What's in this folder

| | |
| --- | --- |
| `README.md` | this |
| `FINDINGS.md` | every claim above, with how it was verified |
| `caip2-submission/` | the CASA spec, ready but for three TODOs |
| `moi-x402/` | the adapter package — 529 lines, typechecks against `@x402/core@2.23.0` |

**Nothing is published, pushed or filed.** The CAIP-2 identifiers in the code are provisional and
would break if CASA lands on a different shape — which is why step 1 comes first.

---

## 6. Honest status

- The adapter **typechecks** against the real `@x402/core`. It has **never run against a chain** —
  Voyage devnet was reset and nothing is funded.
- x402 requires **unit, integration and e2e tests** before accepting a mechanism. Not written.
- Upstreaming needs **three separate PRs** (spec, then implementation, then other SDKs),
  GPG-signed commits, and AI assistance disclosed in the PR description.
- Sessions 7–9 target x402 **v1**, which is deprecated. The adapter targets **v2**. That gap is
  real work, though the logic carries over.
