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

### HTTP 402 is not x402

Worth separating, because it is the whole of what x402 contributes.

**`402 Payment Required` is only a status code.** It means "you must pay" and nothing else. The
HTTP spec reserved it in 1997 and never defined what the response body should contain — which is
why it went unused for nearly thirty years. `404` works because everyone agrees what follows it.
`402` did not, because nobody agreed.

**x402 defines what follows.** The exact shape of the terms, the header the proof travels in, and
the retry.

So any service can return an HTTP 402 today, with a body of its own design:

```jsonc
{ "price": "3", "symbol": "USDM", "asset": "0x…", "payTo": "0x…", "ttlSeconds": 120 }
```

x402 carries the same information under agreed names:

```jsonc
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "moi:mainnet",
    "amount": "3",
    "asset": "0x…",
    "payTo": "0x…",
    "maxTimeoutSeconds": 120
  }]
}
```

Identical content. The difference is that a buyer's agent which has never seen the seller's code
can read the second one, because it already expects that shape — and cannot read the first,
because `price` and `ttlSeconds` are words one developer chose.

The same applies to the proof: a bespoke implementation puts it in a header of its own naming, in
a format of its own design. x402 puts it in `X-PAYMENT`, in a format every implementation shares.

**Returning a 402 is easy and MOI can already do it. Speaking x402 is the part that makes a
stranger able to pay.**

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

**Better than expected.** Nothing in MOI's design conflicts with x402, and a working prototype of
the full flow already exists — a seller answering 402, a buyer paying and proving, and the seller
verifying by reading the chain.

Three things we assumed were blockers turned out not to be:

| Assumption | Reality |
| --- | --- |
| We'd need a facilitator | No. x402 documents **self-facilitation** as a valid production path, and a MOI seller can verify its own payments with a few chain reads. |
| MOI's payment model doesn't fit | It does. **`upfront`** — pay first, then prove — is a first-class flow in x402 v2. |
| We'd need Coinbase to add us to a list | No. v2 uses open CAIP-2 identifiers, not a closed enum. |

**One real blocker did turn up: MOI has no CAIP-2 identifier.** That's the chain-naming standard
everything keys off — 55 chains are registered, MOI isn't, and no one has ever filed for it.

It matters well beyond x402. Wallets and cross-chain tooling use CAIP-2 too. x402 just happened to
surface it.

---

## 3. What has to happen, in order

Everything below, start to finish. Each step lists what it needs and what "done" looks like.

### Step 1 — Decide what identifies a MOI network

CAIP-2 names a chain as `namespace:reference`. We need the reference half.

MOI has no chain id, and being account-centric it has no genesis hash either, so the two usual
answers are both unavailable. The draft proposes short names — `moi:devnet`, `moi:mainnet` —
following Stellar.

**Needs:** a decision from the protocol team.
**Done when:** the format is agreed. Everything downstream depends on this string.

### Step 2 — Add a way to ask a node which network it is

CAIP-2 requires a section showing how a client *verifies* the reference against a live node.
Ethereum has `eth_chainId`. Stellar returns `network_passphrase`. Aptos returns `chain_id`.

MOI has nothing — all 36 RPC methods were checked. `net.Version` gives the software version,
`net.Info` gives the node's own peer id.

This matters more on MOI than elsewhere: participant identifiers are derived from public keys, so
the same address exists on every MOI network. Point a client at the wrong endpoint and the
interaction may simply succeed, on the wrong chain.

**Needs:** a small protocol change — something like `net.Network` returning `{"network":"devnet"}`,
and a node release carrying it.
**Done when:** a `curl` against a public endpoint returns the reference from step 1.

### Step 3 — Register the namespace with CASA

A spec document submitted to `ChainAgnostic/namespaces`. Draft is written: `caip2-submission/`.

**Needs:** steps 1 and 2; a named owner with a GitHub handle; a `discussions-to` URL.
**Expect:** median 24 days. 91 of the last 100 PRs merged. Nobody has been rejected on merit — the
one chain that failed did so because its author stopped replying for 587 days.
**Done when:** the `moi/` folder is merged and `moi:` is a real identifier.

### Step 4 — Write the x402 scheme spec

x402 requires new chains to land in **three separate PRs**, and this is the first: a specification
only, at `specs/schemes/exact/scheme_exact_moi.md`. It documents the payload, the verification
logic and the settlement logic.

**Needs:** step 3 — a spec naming a made-up network won't be merged.
**Done when:** merged into `x402-foundation/x402`.

### Step 5 — Build and test the mechanism package

The second PR: `typescript/packages/mechanisms/moi`, implementing `SchemeNetworkClient`,
`SchemeNetworkServer` and `SchemeNetworkFacilitator`.

The implementation is written and typechecks against `@x402/core@2.23.0` — see `moi-x402/`. What is
missing is everything around it.

**Needs:** unit, integration and e2e tests; a funded devnet wallet to run them; GPG-signed commits;
AI assistance disclosed in the PR description; a changeset for the changelog.
**Done when:** merged and published as `@x402/moi`.

### Step 6 — Ship a reference example

x402 asks contributors to add their chain to `examples/`, and it is the honest test of the package:
if an integration cannot be written in a few lines against the published package, the interfaces
are wrong.

**Needs:** step 5; a funded wallet to run it end to end.
**Done when:** a seller and a buyer run against a live MOI network using only `@x402/moi`, with no
chain-specific code of their own.

### Step 7 — Get listed

x402 publishes a network support page. Without being on it, we have a working package nobody can
find.

**Needs:** step 5.
**Done when:** MOI appears alongside the other chains.

---

### Optional, at any point after step 5

**Other SDKs.** The third PR — Python and Go implementations.

**A facilitator.** Not required: x402 documents self-facilitation as a valid production path, and
a MOI seller can verify its own payments. Running one is a service decision for Voyage, the same
shape as offering an RPC endpoint.

**Default assets.** A PR to the asset tables buys `"$0.10"`-style pricing. Atomic units work
without it, and MAS0 carries no decimals or symbol on chain, so this may not be possible at all.

---

## 4. What's in this folder

| | |
| --- | --- |
| `README.md` | this |
| `FINDINGS.md` | every claim above, with how it was verified |
| `caip2-submission/` | the CASA spec, ready but for three TODOs |
| `moi-x402/` | the adapter package — 529 lines, typechecks against `@x402/core@2.23.0` |

**Nothing is published, pushed or filed.** The CAIP-2 identifiers in the code are provisional and
would break if CASA lands on a different shape — which is why step 1 comes first.

---

## 5. Honest status

- The adapter **typechecks** against the real `@x402/core`. It has **never run against a chain** —
  Voyage devnet was reset and nothing is funded.
- **No tests exist.** x402 requires unit, integration and e2e before accepting a mechanism.
- **Steps 1 and 2 have no owner.** They gate everything else and neither is engineering work in
  this repo — one is a decision, one is a protocol change.
- The prototype that proved the flow targets x402 **v1**, which is deprecated. The package in this
  folder targets **v2**. The logic carries over; the interfaces do not.
