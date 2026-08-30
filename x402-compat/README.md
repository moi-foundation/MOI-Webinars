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

**Note that HTTP 402 and x402 are not the same thing.** `402 Payment Required` is only a status
code — the HTTP spec reserved it in 1997 and never said what the body should contain, which is why
it went unused for thirty years. Any service can return a 402 today. x402 is the agreement about
what goes *inside* it, and that agreement is the entire value.

### What it doesn't do

x402 moves money. It has no opinion on:

- **who owns the address you're paying** — it gives you *where*, never *whose*
- **what your agent is allowed to spend** — its own spend controls are client-side config, and
  the docs say *"pass `spendControls: false` to disable all spend controls"*
- **whether the seller will actually deliver**

Those need state that persists between strangers. That's a chain, not a wire format — and it's
where MOI is differentiated rather than merely compatible.

---

## 2. What MOI already provides

### Agents can hold and move assets

MAS0 assets are protocol-native — created by an operation rather than deployed as contract
bytecode — and addressed by a 32-byte asset id. An agent that holds a key signs and submits the
transfer itself:

```ts
new MAS0AssetLogic(assetId, wallet).transfer(payTo, amount).send({ fuel_limit })
```

No contract to deploy, no token standard to implement. The full routine set on `MAS0AssetLogic`:

| Routine | Signature |
| --- | --- |
| `transfer` | `(beneficiary, amount)` |
| `transferFrom` | `(benefactor, beneficiary, amount)` |
| `approve` | `(beneficiary, amount, expiresAt)` |
| `revoke` | `(beneficiary)` |
| `lockup` | `(beneficiary, amount)` |
| `release` | `(benefactor, beneficiary, amount)` |
| `balanceOf` | `(id)` |

### An owner can cap what an agent spends, on chain

`approve` grants a capped, expiring allowance naming a specific spender. The agent then pays with
`transferFrom` against the owner's balance rather than holding funds itself. Over the cap, the
chain refuses.

That matters for x402 specifically, because x402's own `spendControls` are client-side
configuration — the docs say *"pass `spendControls: false` to disable all spend controls."* An
on-chain allowance is not disableable by the agent it constrains.

### Payments are verifiable by the seller alone

An interaction is signed with ECDSA over secp256k1, covering the whole envelope — sender, sequence
number, fuel and operations together. Participant identifiers are derived from public keys, so a
signature proves control of the paying account.

A seller reads a settled transfer back with `moi.InteractionReceipt` and a POLO decode, recovering
sender, beneficiary, amount and callsite. Verification is therefore a handful of chain reads and
needs no third party — which is what x402 calls **self-facilitation** and accepts as a production
path.

### Two things are missing

**No CAIP-2 identifier.** 55 chains are registered with the Chain Agnostic Standards Alliance; MOI
is not among them, and no submission has ever been filed. x402 v2 identifies networks by CAIP-2, so
nothing can name a MOI network correctly today. It matters beyond x402 — wallets and cross-chain
tooling key off the same standard.

**No way to ask a node which network it is.** All 36 RPC methods were checked across `moi.*`,
`ixpool.*` and `net.*`. `net.Version` returns the node's software version, `net.Info` returns its
own peer id, and `moi.Tesseract` is keyed by account so there is no global genesis to read.

---

## 3. What has to happen, in order

Everything below, start to finish. Each step lists what it needs and what "done" looks like.

### Step 1 — Decide what identifies a MOI network

CAIP-2 names a chain as `namespace:reference`. The namespace is `moi`. We need the reference half.

**How other chains chose theirs:**

| Chain | Identifier | Reference is |
| --- | --- | --- |
| Ethereum | `eip155:1` | the numeric chain id |
| Base | `eip155:8453` | the numeric chain id |
| Solana | `solana:5eykt4Us…` | the genesis block hash |
| Aptos | `aptos:1` | the chain id assigned at genesis |
| Stellar | `stellar:pubnet` | the network's own name |

**MOI has no chain id, and being account-centric it has no genesis hash either** — tesseracts are
per-account, so there is no single genesis artefact to hash. That rules out the first four rows and
leaves Stellar's approach: a short, well-known name.

**Which gives something like:**

```
moi:indus       # the current network
moi:babylon     # the retired one
moi:devnet
```

Those first two are the names the Voyage explorer already uses, so the naming scheme exists —
this is a matter of confirming it rather than inventing one. Babylon being retired is a useful
test: the format has to keep working for a network that no longer runs.

*(The draft in `caip2-submission/` currently uses `moi:devnet` / `moi:mainnet` as placeholders. If
the real names are the answer, three sections of that spec change together — syntax, rationale and
test cases.)*

**How the identifier actually gets added:** it does not exist until it is registered with the Chain
Agnostic Standards Alliance, which is step 3 — a pull request to
[`ChainAgnostic/namespaces`](https://github.com/ChainAgnostic/namespaces) adding a `moi/` folder
with a `README.md` and a `caip2.md`. Nothing publishes the identifier on our side; a CASA merge is
what makes it real, and until then any string we use is provisional.

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

**The file:**

```
specs/schemes/exact/scheme_exact_moi.md
```

That is the whole PR. Seventeen of these already exist — copy the shape from
`scheme_exact_stellar.md`.

**Needs:** step 3 — a spec naming a made-up network won't be merged.
**Done when:** merged into `x402-foundation/x402`.

### Step 5 — Build and test the mechanism package

The second PR: `typescript/packages/mechanisms/moi`, implementing `SchemeNetworkClient`,
`SchemeNetworkServer` and `SchemeNetworkFacilitator`.

The implementation is written and typechecks against `@x402/core@2.23.0` — see `moi-x402/`. What is
missing is everything around it.

**The files**, mirroring every other mechanism:

```
typescript/packages/mechanisms/moi/
├── package.json  tsconfig.json  tsup.config.ts
├── vitest.config.ts  vitest.integration.config.ts
├── eslint.config.js  .prettierrc  .prettierignore
├── README.md  CHANGELOG.md
├── src/
│   ├── constants.ts  types.ts  utils.ts  shared.ts
│   ├── signer.ts  defaultAssets.ts  index.ts
│   └── exact/  index.ts + client/ server/ facilitator/
└── test/  unit/  integrations/

e2e/config/mechanisms_moi.json        # plus registration in the shared e2e modules
.github/workflows/                    # a publish workflow
examples/typescript/*/advanced/all_networks   # add MOI, alphabetically
```

The three scheme implementations under `exact/` are written and typecheck. Everything else on that
list is not.

**Needs:** unit, integration and e2e tests; a funded devnet wallet to run them; GPG-signed commits;
AI assistance disclosed in the PR description; a changeset for the changelog.
**Done when:** merged and published as `@x402/moi`.
**Detail:** `UPSTREAM.md` has the file-by-file status.

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

**Other SDKs.** A Python or Go mechanism. Worth knowing that Go ships only `evm` and `svm`, and
Python only `evm`, `svm` and `tvm` — nine of the eleven TypeScript mechanisms have no counterpart
in either. TypeScript alone is the norm, not a shortfall.

**A facilitator.** Not required: x402 documents self-facilitation as a valid production path, and
a MOI seller can verify its own payments. Running one is a service decision for Voyage, the same
shape as offering an RPC endpoint.

**Default assets.** A PR to the asset tables buys `"$0.10"`-style pricing. Atomic units work
without it, and MAS0 carries no decimals or symbol on chain, so this may not be possible at all.

---

## 4. What changes for a developer

Once all seven steps are done.

### Selling something

**Before.** A developer who wants to charge for an API in MAS0 has to invent the whole
conversation. What does the 402 body look like? What does a proof look like, and which header does
it travel in? How does the seller check it — and how does the buyer produce something that check
will accept?

They write all of it, roughly 600 lines, and make seven security decisions alone along the way.
Then only buyers who read their documentation can pay them, because the format is theirs.

**After.**

```bash
npm i @x402/moi @x402/express
```

```ts
app.use(paymentMiddleware(wallet, {
  "/api/forecast": { asset: MAS0_ASSET, amount: "3" }
}))
```

The route is paid. No format invented, no verification written.

### Buying something

**Before.** An agent that already pays for things over x402 meets a MOI seller and simply cannot
pay it — there is no MOI code in its stack. Supporting one MOI seller means writing a client for
that seller's particular format. Supporting a second means writing another.

**After.**

```ts
client.register("moi:mainnet", new MoiExactClientScheme(wallet))
```

One line, once. The agent now buys from every MOI seller, and the rest of its logic is untouched.

### The difference in one table

|  | Before | After |
| --- | --- | --- |
| Seller writes | ~600 lines and a spec | one line |
| Buyer writes | a client per seller | one line, once |
| Who can pay a MOI seller | people who read its docs | anyone with an x402 agent |
| Security decisions | seven, made alone | none |

### What that actually unlocks

Not saved effort. **A transaction that cannot happen today.**

For an agent to buy something right now, a human had to onboard it to that service in advance.
There is no path where an agent finds a seller it has never seen, reads the price, decides, and
pays for one call.

After, that path exists — and the money underneath is the same MAS0 transfer that already works.
What was missing was never the settlement. It was the conversation around it.

---

## 5. What's in this folder

| | |
| --- | --- |
| `README.md` | this |
| `FINDINGS.md` | every claim above, with how it was verified |
| `UPSTREAM.md` | the three upstream PRs, file by file, with what's written and what isn't |
| `caip2-submission/` | the CASA spec, ready but for three TODOs |
| `moi-x402/` | the adapter package — 529 lines, typechecks against `@x402/core@2.23.0` |

**Nothing is published, pushed or filed.** The CAIP-2 identifiers in the code are provisional and
would break if CASA lands on a different shape — which is why step 1 comes first.

---

## 6. Honest status

- The adapter **typechecks** against the real `@x402/core`. It has **never run against a chain** —
  Voyage devnet was reset and nothing is funded.
- **No tests exist.** x402 requires unit, integration and e2e before accepting a mechanism.
- **Steps 1 and 2 have no owner.** They gate everything else and neither is engineering work in
  this repo — one is a decision, one is a protocol change.
- The prototype that proved the flow targets x402 **v1**, which is deprecated. The package in this
  folder targets **v2**. The logic carries over; the interfaces do not.
