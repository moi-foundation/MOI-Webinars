# Session 8 — build notes

## Why the design changed

The first version of session 8 used context inheritance: the owner creates a
sub-account with `AccountInherit`, links it to a budget logic, and the agent spends
through that logic which checks the cap before allowing a transfer.

Ram killed it on the 27th, and he was right. The sub-account shares the primary's
key, so the agent holds a key that can sign anything. The budget logic is only load-
bearing if the agent chooses to call it. Nothing stops it calling the asset directly
and skipping the check entirely. That was written down as "Hole 2" in the old
`session-8/PLAN.md` and shipped anyway with a line of narration covering it, which
was the actual mistake — a rule you can route around is not a rule.

Access policies put the same decision somewhere the agent cannot reach: on the
owner's account, read by the protocol before the write lands. The old build is left
intact in `session-8/` rather than deleted.

## Verified live

- `moi.AccessPolicies` is present on Voyage devnet. Proved without spending anything,
  by param-shape probing: a missing method returns `-32601`, a present one returns a
  domain error for our (nonexistent) account. `scripts/preflight.ts` does this.
- `ticker.coco` compiles with coco 0.8.0. `coco compile` — not `coco build`, which is
  not a subcommand — and it needs a `coco.nut` next to the source.
- The `Access` builder in SDK 0.8.0 exposes `.storage() .allow() .withinPrefix()
  .caller() .origin()` and `.create() .update() .delete()`, with `access.anyCaller()`
  and `access.callers(...)` for the constraints.

## Status: the demo runs end to end, 31 Aug

All three beats verified live on devnet. `npm run demo` exits 0.

| Beat | Result | Interaction |
|---|---|---|
| 1 — no policy | refused, `builtin.AccessError` | `0xa403d747…` |
| 2 — policy created, same call | write landed, counter +1 | `0xf8bec4b6…` / `0xbc02ddbf…` |
| 3 — policy deleted, same call | refused again | `0xd516061a…` / `0xd30e162a…` |

The refusal message, which is the payoff of beat 1 and worth putting on the screen:

```
builtin.AccessError: actor is not allowed to write into other actor's storage
```

Encoded errors come back POLO-encoded and print as a wall of hex, so
`decodeRuntimeError()` in `chain.ts` lifts the ASCII out and drops the VM stack
trail. Without it that line is unreadable on a projector.

Both doc-derived assumptions turned out correct: a refusal really does arrive as a
mined receipt with non-zero status rather than a thrown error, and the resource id
really is the logic id.

## Live findings, 31 Aug — devnet node 0.12.0

Owner is the wallet-extension account, path **`m/44'/6174'/1'/0/0`** (account index `1'`,
not `7020'` — that is why every earlier scan reported "account not found").

```
owner   0x00000000bfa45bc089945cf2befd0bd488e863562628cb47b14f3d1800000000
agent   0x00000000ea3f6fdc706bd6ce6f5725f22e2231715f5794c782a470b300000000
Ticker  0x200000003d714427e5ceb0ae6929c303b7fa5933cfecb48c6b81f4b000000000
```

**Confirmed working, with receipts:**

- `ParticipantCreate` — `0x79aa8dda…`, status 0, fuel 399. You CANNOT MAS0-transfer to an
  address that does not exist; it fails "account not found". Register the agent's public key
  as a participant and carry the opening balance in the same interaction. Minimum key weight
  is **1000** — anything lower is refused client-side.
- `LogicFactory.deploy` — `0x0f2fd66f…`, status 0, fuel 719. A logic account self-pays its
  creation storage, so the SDK bundles a KMOI transfer to it. That default is
  `DEFAULT_STORAGE_FUND = 1_000_000` (`logic-base.js:104`), far more than a devnet wallet
  holds, and the deploy reverts on affordability. Override with
  `new RoutineOption({ storageFund: N })`; 6000 was enough for a 2.4 KB manifest.
- Plain KMOI transfer — status 0, fuel 299. The owner transacts fine.

**Receipt semantics, measured not assumed:** success is interaction-level `status: 0`.
The failed policy attempt was `status: 1` with `ix_operations[0].status: 0` — the
interaction-level status is the one that matters, and `moi.AccessPolicy` confirmed no
policy existed. So `receiptError()` reading `status` is correct.

**`ACCESS_CREATE` needs a well-funded account, and says so misleadingly.**

Writing a policy fails with `insufficient funds` on a thin account. That error is easy to
misdiagnose as a fuel problem — it is not. `fuel_limit=100` failed exactly like `1500`, fuel
price is 1, and a plain KMOI transfer at `fuel_limit=500` succeeded from the same account in
the same second. Fuel was never the constraint; the raw balance was.

| owner balance | ACCESS_CREATE |
|---|---|
| ~10,000 | rejected before submission, "insufficient funds" |
| ~109,000 | works |

So a policy write needs materially more headroom than an ordinary interaction. The exact
threshold was never measured — only that 10k is not enough and 109k is comfortable. Budget
for it when provisioning a workshop account; do not hand people 10k and expect policies.

Dead end, recorded so nobody retries it: `StorageDeposit` does not help. It throws the same
error, and `moi.StorageMetric` rejects a participant id with "target account should be a logic
account or asset account" — storage deposits are a logic/asset facility, not a participant one.

**Fuel limits are checked against balance up front.** `FUEL_LIMIT` is therefore not free to
set high: a limit above the sender's balance is rejected as "insufficient funds" even when
actual usage would be a fraction of it. Default here is 1500. Measured usage: ParticipantCreate
399, deploy 719, access op 100, transfer 299.

**The trap this session can fail into, and the guard against it.**

A broke agent and a forbidden agent both stop, and on screen they look identical. An early run
had beat 3 print `refused again — insufficient funds` and the summary counted it as a PASS: the
agent had simply run out of KMOI after two calls. A green demo for entirely the wrong reason,
and the kind of thing nobody notices live.

Two defences, both in `demo.ts`:

1. `isPolicyRefusal()` — a refusal only counts when the reason contains `AccessError`. Anything
   else reports `stopped, but NOT by a policy` and exits non-zero.
2. A balance check before beat 1. If the agent cannot cover `FUEL_LIMIT * 3`, the demo refuses to
   start rather than running and misleading.

Verified by forcing it: `FUEL_LIMIT=50000 npm run demo` stops immediately, spends nothing, and
explains itself. Worth re-running that occasionally — a guard nobody has seen fire is not a
guard.

**Reading another account's balance needs the RPC, not a driver.** `getAssetDriver(...).routines
.BalanceOf(x)` returns empty for any account other than the signer, so a third party's balance
reads as "unreadable" rather than as a number. `kmoiBalance()` calls `moi.Balance` directly.

## Claim audit, 1 Sept — two live tests added

- **Foreign reads need no policy.** The agent read the owner's counter via a static
  `CounterOf` call with a READ_LOCK participant, no policy in place. Access policies
  gate STORAGE_MUTATE only; there is no read action in `AccessAction`.
- **Origin pinning excludes everyone else.** With a policy whose origin names only the
  agent, a freshly created third account (`m/44'/6174'/1'/0/2`, id `0x…f0d6fddd…`) was
  refused with the same `builtin.AccessError`, while the agent wrote successfully under
  the identical policy. "Pin the grant to one agent, nobody else qualifies" is now
  receipt-proven, not doc-derived.
- **Source caveat:** the PR 120 docs repo (`sarvalabs/moidocs`) is no longer reachable
  with this token and the pages are not on docs.moi.technology yet. Doc-derived facts
  recorded in this file were captured while the PR was readable; the load-bearing ones
  have all since been verified live.

## Decisions worth remembering

- **Resource id is the logic id**, not a storage slot and not an account. A policy
  names the logic permitted to write.
- **`withinPrefix()` is left off.** It exists on the builder, the network does not
  enforce it, and the read RPCs do not return it. Setting it would display a narrower
  grant than the one actually in force.
- **`UPDATE` replaces the policy body wholesale**, no merge.
- **A policy's target account is always the sender.** Writing one onto another
  account is rejected at submission.
- **Only `STORAGE` is live.** `ASSET`, `LOGIC` and `KEY` are in `ResourceType` and
  `ASSET_ACCESS` / `LOGIC_ACCESS` are in `AccessAction`, but reserved. So the
  spend-cap story — "this agent may move up to 500 of this asset" — is the shape of
  the thing, not something demoable today. Say that plainly on the call rather than
  implying it works.

Source: `sarvalabs/moidocs` PR 120 (`access-control.md`,
`access-policy-tutorial.md`), which is where the Ticker example comes from.
