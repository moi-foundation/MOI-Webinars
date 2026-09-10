# Open decisions — PR 1

Four things are undecided. One blocks the PR, one can be closed today, two are judgement calls.
Each says who decides and exactly what changes.

---

## 1. The reference format — BLOCKING

**Decides:** protocol team / Rahul.

The reference half of `moi:<reference>` is currently a network name (`moi:devnet`). The client SDK
also carries `enum Chain { TEST_NET = 111, DEV_NET = 112, MAIN_NET = 113 }`, unused today, and the
planned network-identity RPC may surface exactly those numbers. If it does, a numeric reference
becomes available and every other registered chain that has a chain id uses one.

**Option A — keep names.** `moi:devnet`, `moi:mainnet`. Human-legible, matches `stellar:pubnet`.
Nothing in the document changes.

**Option B — use the chain id.** `moi:112` for devnet. Matches `eip155` and `neo`. Changes:

| Section | Change |
| --- | --- |
| Semantics | reference becomes the network's chain id, not its name |
| Syntax | regex becomes `^(0\|[1-9][0-9]{0,9})$`, plus a range bound — copy Neo's wording |
| Well-known networks | table keys on ids: devnet `112`, mainnet `113` |
| Resolution Mechanics | reads the id from the new RPC |
| Rationale | the "numeric chain id was rejected" paragraph inverts; the "short network name" paragraph becomes the rejected option |
| Test Cases | every example is rewritten; the hyphen and case cases stop being meaningful |

Roughly an hour of editing, mechanical once the choice is made.

**Knock-on outside this PR:** `moi:*` appears in the scheme spec (PR 2) and in
`src/constants.ts` of the mechanism package (PR 3). Both follow whatever is decided here.

---

## 2. Resolution Mechanics — BLOCKING, same dependency

**Decides:** protocol team ships it; nobody can write around it.

CAIP-2 requires a section showing how a client confirms which network a node is on. Every merged
namespace has one backed by a real call: Neo `getversion` → `protocol.network`, Stellar Horizon
`/` → `network_passphrase`, Klever `/node/status`, Tenzro `tenzro_getBlock` at genesis. There is
no precedent for filing without one.

MOI has nothing equivalent today. Re-probed 10 September: `net.Network`, `net.ChainId`,
`net.NetworkInfo`, `moi.Network`, `moi.ChainId`, `moi.NetworkInfo`, `net.Chain` and `moi.Chain`
all return method-not-found. Nothing existing substitutes: `net.Info` returns a per-node peer id,
`net.Version` the node's software version, and `KMOI_ASSET_ID` is a hardcoded SDK constant
identical on every network.

The section states what it requires and nothing more: a method reporting which network a node is
on, its request and response, and the rule for deriving the reference. Nothing is invented. When
the method lands, write it in.

One finding worth recording. `commit_info.cluster_id` is network-wide at the latest tesseract —
two unrelated accounts return the same value — but it differs at tesseract 0, so it tracks the
current validator cluster and rotates. A CAIP-2 reference has to be stable for the life of the
network, so it cannot be used.

---

## 3. `discussions-to` — can be closed today

**Decides:** Adithya.

Currently `TODO`. It does **not** have to be the CASA PR: Neo points at
`neo-project/proposals/issues/238`, and Stellar points at a CAIP pull request. Any monitored URL
works.

Suggested: open an issue on a public MOI repo titled "CAIP-2 namespace registration" and use its
URL. That removes this blank before the PR exists, and gives CASA somewhere to send questions that
is not a person's inbox.

Whoever owns that URL has to actually watch it. The only namespace PR that has ever failed on
merit failed because its author went quiet for 587 days.

---

## 4. Two judgement calls

**`type:` in the frontmatter.** Ours says `Informational`, following CASA's own `_template`.
Neo and Stellar both say `Standard` and merged anyway. Leave as is unless a reviewer objects; the
template is the better authority.

**Listing `mainnet` before it exists.** The well-known-networks table reserves `moi:mainnet` and
says it MUST NOT be treated as resolvable. The alternative is to list only `devnet` and add
mainnet when it launches. Reserving it is defensible and tells tooling authors what is coming;
dropping it removes a row a reviewer might question. Neo avoids the problem entirely by defining a
rule rather than a table — which is also what Option B in decision 1 would give us.

---

## Verified while checking these

`moi.Tesseract` refuses to answer without an account identifier, and `tesseract_number: 0`
returns a different tesseract per account. There is genuinely no global chain.

The rationale previously claimed no genesis artefact exists at all. That was too strong: a
genesis-era account's first tesseract carries `timestamp: 0x0` and an empty `cluster_id`, and its
hash is plausibly stable and network-unique. Using it would tie the identifier to an
implementation detail, which is a reason to prefer a name — but not the reason the document gave.
Corrected.

## What is not undecided

The author is set: Adithya Ganesh (@sarvalabs-adithya). The syntax regex is fixed (it previously
accepted a trailing hyphen that the prose and test cases forbade). The frontmatter `title` follows
the template's `<name> - Blockchain ID Specification` form. Test cases cover four valid and eight
invalid identifiers, each with a reason — stronger than the profile this was modelled on.
