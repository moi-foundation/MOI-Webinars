# Session 8 (v2) — access policies

Pivot from context inheritance, after Ram's objection: the agent holds the key, so a rule it must
*choose* to call is not enforcement. Access policies are enforced by the node on every matching
operation, so there is nothing to opt out of.

## What is verified

**The node supports it.** `moi.AccessPolicy` and `moi.AccessPolicies` both answer on Voyage devnet
(node 0.12.0). Confirmed by param-shape probing: a missing method returns `-32601`, and these
return `-32602`/domain errors, then `account not found` once the shape is right. `moi.StoragePricing`
returns a real result.

**The SDK has the API, in 0.8.0.** We were on 0.7.1, which has none of it. `Access`, `access`,
`ResourceType`, `AccessAction` and `CallerKind` all import cleanly from `js-moi-sdk@0.8.0`.

**The write side is a builder:**

```ts
new Access(ownerSigner)
  .storage(resourceId)
  .allow(AccessAction.STORAGE_MUTATE)
  .withinPrefix(prefix)                    // omit for the whole resource
  .caller(access.callers(agentId))         // or access.anyCaller()
  .create().send()                         // ACCESS_CREATE / UPDATE / DELETE
```

- Actions are bitflags: `STORAGE_MUTATE = 1`, `ASSET_ACCESS = 2`, `LOGIC_ACCESS = 4`.
- `ResourceType` has `STORAGE / ASSET / LOGIC / KEY`, and the SDK source says plainly: *"Only
  STORAGE is implemented on the network today; ASSET/LOGIC/KEY are reserved values that validate
  but are rejected server-side."* That is exactly the "today storage, tomorrow anything" picture,
  visible in the type system.
- The target account is taken from the signer at send time, because *"the network requires the
  policy owner to equal the sender"*. An agent cannot write its own permissions.

## The open piece

**What does the governed write actually look like?**

A policy names a storage resource and permits `STORAGE_MUTATE`. What is not yet established is the
operation on the other side: an agent writing to storage that belongs to the owner's account, so
that we can show it failing without a policy and succeeding with one.

Clues gathered so far:

- `moi.StorageMetric` rejects a normal account with *"target account should be a logic account or
  asset account"*, so the storage being governed belongs to a logic or asset, not a plain account.
- Ram described the demo as *"an agent trying to write something to an ephemeral state of an
  actor"*, which points at actor state under a logic.
- Session 6's `AgentBudget` writes to `Sender`'s own actor state. A policy demo needs a **cross-actor
  write** — one account writing into another's slice — which is presumably the thing policies gate.

**Fastest way to close this:** Ram's access-policy doc. He said it exists and was unsure whether he
had merged it. Ask for the link before reverse-engineering Coco syntax.

## Blocked on

A funded owner account. Devnet was reset; nothing here has run end to end. `npm run preflight`
reports exactly this and names the faucet.

## Run order

```bash
npm install
cp .env.example .env          # one funded devnet mnemonic
npm run preflight             # node support + accounts + existing policies
npm run spike:policy          # create, read, update, delete — before building anything
```
