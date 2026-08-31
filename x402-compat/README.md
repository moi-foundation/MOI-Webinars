# Making MOI x402-compatible

*Draft for discussion. Nothing here has been pushed, published or filed anywhere.*

---

## 1. What x402 is

x402 is a standard for paying over HTTP. It uses `402 Payment Required`, a status code that has
been reserved and unused in HTTP since 1997.

The whole thing is two requests:

1. A client asks for something. The server answers 402, and the body says what it costs:
   amount, asset, where to pay, and a deadline.
2. The client pays, then asks again with proof attached in a header. The server checks it and
   delivers.

The value is that the refusal is machine-readable. An agent can discover a price, decide, and pay
without a human, an account, or a prior integration.

It's governed by the x402 Foundation, under the Linux Foundation since July 2026. Members
include Visa, Mastercard, Stripe, Google, AWS, Cloudflare, Coinbase, Ripple and the Solana and
Stellar foundations.

Note that HTTP 402 and x402 are not the same thing. `402 Payment Required` is only a status
code. The HTTP spec reserved it in 1997 and never said what the body should contain, which is why
it went unused for thirty years. Any service can return a 402 today. x402 is the agreement about
what goes *inside* it, and that agreement is what the standard actually supplies.

### What it doesn't do

x402 moves money. It has no opinion on:

- who owns the address you're paying. It gives you *where*, never *whose*.
- what your agent is allowed to spend. Its own spend controls are client-side config, and
  the docs say *"pass `spendControls: false` to disable all spend controls"*.
- whether the seller will actually deliver.

Those need state that persists between strangers, which means a chain rather than a wire format.
It is also where MOI is differentiated rather than merely compatible.

---

## 2. What MOI already provides

### Agents can hold and move assets

MAS0 assets are protocol-native, created by an operation rather than deployed as contract
bytecode, and addressed by a 32-byte asset id. An agent that holds a key signs and submits the
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

### Payments are verifiable by the seller alone

An interaction is signed with ECDSA over secp256k1, covering the whole envelope: sender, sequence
number, fuel and operations together. Participant identifiers are derived from public keys, so a
signature proves control of the paying account.

A seller reads a settled transfer back with `moi.InteractionReceipt` and a POLO decode, recovering
sender, beneficiary, amount and callsite. Verification is therefore a handful of chain reads and
needs no third party, which is what x402 calls self-facilitation and accepts as a production
path.

### Two things are missing

**No CAIP-2 identifier.** 55 chains are registered with the Chain Agnostic Standards Alliance; MOI
is not among them, and no submission has ever been filed. x402 v2 identifies networks by CAIP-2, so
nothing can name a MOI network correctly today. It matters beyond x402, because wallets and
cross-chain tooling rely on the same standard.

**No way to ask a node which network it is.** MOI exposes 36 RPC methods across `moi.*`,
`ixpool.*` and `net.*`, and none of them answer the question. `net.Version` returns the node's
software version, `net.Info` returns its own peer id, and `moi.Tesseract` is keyed by account, so
there is no global genesis to read.

That is a gap beyond CAIP-2. Participant identifiers are derived from public keys, so the same
address exists on every MOI network. Point a client at the wrong endpoint and the interaction may
simply succeed, on the wrong chain.

---

## 3. What has to happen, in order

Everything below, start to finish. Each step lists what it needs and what "done" looks like.

### First, what CASA is and why it comes before x402

The first three steps have nothing to do with x402 directly. They are about MOI getting a name.

The Chain Agnostic Standards Alliance, or CASA, is an open standards body that publishes the
CAIP specifications. These are conventions for naming things across blockchains, so that wallets,
explorers and protocols do not each invent their own scheme for saying which chain, which account
or which asset they mean.

**CAIP-2 is the one that names chains.** Every registered chain has an identifier shaped
`namespace:reference`, such as `eip155:1` for Ethereum or `solana:5eykt4Us…` for Solana. There are
55 of them today.

Getting one is a pull request to a public repository,
[`ChainAgnostic/namespaces`](https://github.com/ChainAgnostic/namespaces), containing a short
specification document. Once merged, the identifier is official and anything can use it.

x402 v2 identifies networks by CAIP-2 identifier, not by a list it maintains itself. That is
why v2 can support any chain without a code change, and why a chain with no CAIP-2 identifier
cannot be named correctly in an x402 payment. MOI has no identifier and has never applied for one,
so steps 1 to 3 are about fixing that. Only then does the x402 work start.

CAIP-2 is also worth having on its own terms. Wallets, block explorers and cross-chain tooling all
key off it, so this is infrastructure MOI is missing regardless of whether x402 ever happens.

### Step 1: Decide what identifies a MOI network

CAIP-2 names a chain as `namespace:reference`. The namespace is `moi`. We need the reference half.

**How other chains chose theirs:**

| Chain | Identifier | Reference is |
| --- | --- | --- |
| Ethereum | `eip155:1` | the numeric chain id |
| Base | `eip155:8453` | the numeric chain id |
| Solana | `solana:5eykt4Us…` | the genesis block hash |
| Aptos | `aptos:1` | the chain id assigned at genesis |
| Stellar | `stellar:pubnet` | the network's own name |

MOI has no chain id, and no single genesis block to hash either, so the first four rows are out.
That leaves Stellar's approach: a short, well-known name.

**Which gives something like:**

```
moi:devnet      # the current network
moi:mainnet
```

The Voyage explorer also carries names for other networks, including Indus and a retired one called
Babylon. That is useful in two ways: it shows MOI already names its networks rather than numbering
them, and a retired network is a good test that the format keeps working for a chain that no longer
runs.

**Needs:** a decision from the protocol team.
**Done when:** the format is agreed. Everything downstream depends on this string.

### Step 2: Add a way to ask a node which network it is

Every CAIP-2 profile has a required section called **Resolution Mechanics**. It answers one
question: given a node you are connected to, how do you confirm which network it is, so that the
identifier you are using is the right one?

The convention is to show a real request and the real response. Stellar's profile does it in four
lines. It says the reference can be read from the `network_passphrase` field that Horizon returns,
and shows the call:

```sh
curl https://horizon.stellar.org/
```
```json
{ "network_passphrase": "Public Global Stellar Network ; September 2015" }
```

Ethereum's is `eth_chainId`. Aptos returns `chain_id` from its REST API. Neo returns
`protocol.network` from `getversion`. Every registered chain has a one-call answer, because without
one a client cannot tell a testnet from a mainnet except by trusting the URL it was handed.

MOI has no such call, so this section cannot be written truthfully today. That is the part that
blocks the submission, not the naming.

**What it would take.** One read-only RPC method that returns the network's name. Something like:

```sh
curl -X POST https://dev.voyage-rpc.moi.technology/devnet/   -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":1,"method":"net.Network","params":[]}'
```
```json
{ "jsonrpc": "2.0", "id": 1, "result": { "network": "devnet" } }
```

No consensus change and no state involved. The node already knows which network it belongs to; it
just has no way to say so. The work is exposing a constant over the existing `net.*` namespace and
shipping it in a node release.

**Needs:** that method, and a node release carrying it.
**Done when:** a `curl` against a public endpoint returns the name chosen in step 1.

### Step 3: Register the namespace with CASA

A pull request to `ChainAgnostic/namespaces` adding one folder with two files. Both follow CASA's
own template, and both are short. Stellar's `caip2.md` is about 3 KB; Aptos's is 2.4 KB.

**`moi/README.md`** describes the ecosystem, not the identifier:

```
frontmatter    namespace-identifier, title, author, status, type, created
# Namespace for MOI Chains
               a plain-language paragraph on what `moi` covers
## Rationale   ~200 words on what makes MOI different from an EVM chain
## Governance  ~200 words on who maintains this and how changes are proposed
## References
## Copyright   CC0 waiver
```

**`moi/caip2.md`** is the identifier spec:

```
frontmatter          namespace-identifier, title, author, discussions-to,
                     status, type, created, requires: CAIP-2
# CAIP-2
## Introduction      what MOI is, in terms a non-MOI reader follows
## Specification
   ### Semantics     what the namespace and reference mean
   ### Syntax        the permitted format, with a regex
   ### Resolution
       Mechanics     how a client verifies it against a live node
## Rationale         why this reference and not a chain id or a hash
   ### Backwards
       Compatibility
## Test Cases        valid and invalid identifiers, each with a reason
## References
## Copyright
```

Both are drafted. Three things are still blank:

| Blank | Waiting on |
| --- | --- |
| `author` | a real name and GitHub handle |
| `discussions-to` | a URL where the namespace can be discussed |
| Resolution Mechanics | step 2. It is written against a proposed `net.Network` and marked as unconfirmed |

CASA's template calls **Test Cases** the most important section, and the accepted profiles bear
that out. Neo's lists five valid identifiers and ten invalid ones, each with the reason it fails.

**Needs:** steps 1 and 2; a named owner with a GitHub handle; a `discussions-to` URL.
**Expect:** median 24 days. 91 of the last 100 PRs merged. Nobody has been rejected on merit. The
one chain that failed did so because its author stopped replying for 587 days.
**Done when:** the `moi/` folder is merged and `moi:` is a real identifier.

### Step 4: Write the x402 scheme spec

Steps 4 and 5 both land in the same place: the x402 Foundation's monorepo,
[`x402-foundation/x402`](https://github.com/x402-foundation/x402). That repo holds the protocol
specs, the `@x402/core` package that every implementation builds on, and one mechanism package per
chain. Adding MOI means contributing to it, the same way Stellar, Aptos and NEAR did.

The foundation asks new chains to arrive in up to three PRs, in order: the specification first, the
TypeScript implementation second, other languages third. Reviewers read the spec before they will
look at any code.

This step is the first PR. One file, prose only:

```
specs/schemes/exact/scheme_exact_moi.md
```

It documents three things: what a MOI payment payload contains, how a seller or facilitator
verifies one, and how settlement works. For MOI that means writing down the claim format, the
seven verification checks, and the pay-first flow.

Seventeen of these already exist in the same directory, including seven for chains with no
implementation at all, so a spec can land and sit alone. `scheme_exact_stellar.md` is the closest
shape to copy.

**Needs:** step 3. A spec naming a made-up network won't be merged.
**Done when:** merged into `x402-foundation/x402`.

### Step 5: Build and test the mechanism package

The second PR: `typescript/packages/mechanisms/moi`, implementing `SchemeNetworkClient`,
`SchemeNetworkServer` and `SchemeNetworkFacilitator`.

The three scheme implementations are written and typecheck against `@x402/core@2.23.0`. What is
missing is everything around them.

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

### Step 6: Ship a reference example

x402 asks contributors to add their chain to `examples/`, and it is a fair test of the package. If
an integration cannot be written in a few lines against the published package, the interfaces
are wrong.

**Needs:** step 5; a funded wallet to run it end to end.
**Done when:** a seller and a buyer run against a live MOI network using only `@x402/moi`, with no
chain-specific code of their own.

### Step 7: Get listed

x402 publishes a network support page. Without being on it, we have a working package nobody can
find.

**Needs:** step 5.
**Done when:** MOI appears alongside the other chains.

---

### Optional, at any point after step 5

**Other SDKs.** A Python or Go mechanism. Worth knowing that Go ships only `evm` and `svm`, and
Python only `evm`, `svm` and `tvm`. Nine of the eleven TypeScript mechanisms have no counterpart
in either, so TypeScript alone is normal rather than a shortfall.

**A facilitator.** Not required. x402 documents self-facilitation as a valid production path, and
a MOI seller can verify its own payments. Running one is a service decision for Voyage, the same
shape as offering an RPC endpoint.

**Default assets.** A PR to the asset tables buys `"$0.10"`-style pricing. Atomic units work
without it, and MAS0 carries no decimals or symbol on chain, so this may not be possible at all.

---

## 4. What changes for a developer

This assumes all seven steps are done.

### Selling something

**Before.** A developer who wants to charge for an API in MAS0 has to invent the whole
conversation. What does the 402 body look like? What does a proof look like, and which header does
it travel in? How does the seller check it, and how does the buyer produce something that check
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

The route is now paid, with no format invented and no verification written.

### Buying something

**Before.** An agent that already pays for things over x402 meets a MOI seller and cannot
pay it, because there is no MOI code in its stack. Supporting one MOI seller means writing a client
for that seller's particular format. Supporting a second means writing another.

**After.**

```ts
client.register("moi:mainnet", new MoiExactClientScheme(wallet))
```

One line, once. The agent then buys from every MOI seller, and the rest of its logic is untouched.

### The difference in one table

|  | Before | After |
| --- | --- | --- |
| Seller writes | ~600 lines and a spec | one line |
| Buyer writes | a client per seller | one line, once |
| Who can pay a MOI seller | people who read its docs | anyone with an x402 agent |
| Security decisions | seven, made alone | none |

### What that actually unlocks

The gain is not saved effort. It is a transaction that cannot happen today.

For an agent to buy something right now, a human had to onboard it to that service in advance.
There is no path where an agent finds a seller it has never seen, reads the price, decides, and
pays for one call.

After, that path exists, and the money underneath is the same MAS0 transfer that already works.
MOI was never missing the settlement. It was missing an agreed way to ask for it and prove it.
