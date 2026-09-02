# Session 8 — Access policies

Three times an agent makes the same call. It is refused, then allowed, then refused
again. Nothing about the agent changes between them, and not one line of the logic
changes either. What changes is a policy sitting on somebody else's account.

```bash
npm install
cp .env.example .env      # add your mnemonic
npm run preflight         # does this node support access policies?
npm run setup:fuel        # owner sends the agent some KMOI
npm run setup:logic       # deploy Ticker, writes LOGIC_ID back to .env
npm run demo
```

**One funded account, and fund it properly.** Only the owner needs the faucet
(https://voyage.moi.technology) — the agent is created and topped up by `setup:fuel`,
since KMOI is just a MAS0 asset the owner can send. But **give the owner around 100k
KMOI**. Registering a policy needs far more headroom than an ordinary interaction, and
below roughly 10k it fails with `insufficient funds`, which reads like a fuel problem
and is not one. See NOTES.md.

Slow it down for narration:

```bash
DEMO_PAUSE_MS=1500 npm run demo
```

What beat 1 prints, and the line worth having on the screen:

```
refused — builtin.AccessError: actor is not allowed to write into other actor's storage
```

That comes off the chain, not out of the script.

## Why this session exists

Session 7 gave the agent a wallet and let it pay for things. The obvious next
question is how you stop it from spending everything, and the obvious answer is to
put a budget in a contract and have the agent call through it.

That answer does not hold. The agent holds its own key. A rule written in a contract
is a rule the agent has agreed to follow, and an agent that has changed its mind can
call something else. Ram's phrasing on the 27th: the contract-based version is
voluntary, and calling that a caveat undersells it.

So the rule has to live somewhere the agent cannot reach. On MOI that place is the
account itself. An **access policy** is a record on your account saying which logic
may touch your storage and who is allowed to be behind the call. The protocol reads
it before the write lands. There is no code path around it, because it is not code.

## What the demo actually shows

`Ticker` is a logic with one counter in it. The counter is **actor state**, which
means each participant's copy lives on that participant's own account rather than on
the logic. So when Alice calls `TickAny(bob)`, a logic Alice invoked tries to
increment a number that is physically stored on Bob's account.

| Beat | What happens | Counter |
|---|---|---|
| 1 | Agent calls `TickAny(owner)`. No policy exists. | unchanged |
| 2 | Owner registers a policy. Agent makes the identical call. | +1 |
| 3 | Owner deletes the policy. Agent makes the identical call. | unchanged |

Read the refusal carefully, because it is not the shape people expect. The
interaction is accepted, signed, mined, and charged for. It just **reverts** — the
receipt comes back with a non-zero status. There is no rejected submission and no
thrown error. Fuel is spent whether or not the write was permitted.

## The policy

```ts
await new Access(owner.wallet)
  .storage(TICKER_LOGIC_ID)              // WHICH logic may write
  .allow(AccessAction.STORAGE_MUTATE)    // WHAT it may do
  .caller(access.anyCaller())            // who may call in
  .origin(access.callers(AGENT_ID))      // WHO may be behind it
  .create()
  .send();
```

Four things worth knowing:

- **The resource id is a logic id.** Not a storage slot, not an account. A policy
  answers "which logic may write my storage", so a logic is what it names.
- **`caller` and `origin` are different questions.** `caller` is whoever made the
  immediate call; `origin` is whoever started the interaction. Constraining `origin`
  to the agent is what makes this grant specific to that agent.
- **The target account is always the sender.** You cannot write a policy onto someone
  else's account — the network rejects it at submission. Authority flows one way.
- **`UPDATE` replaces the body wholesale.** It does not merge. Anything you still want
  has to be restated.

## What is not here

`ResourceType` has `ASSET`, `LOGIC` and `KEY` alongside `STORAGE`, and
`AccessAction` has `ASSET_ACCESS` and `LOGIC_ACCESS` alongside `STORAGE_MUTATE`.
Only storage is live on the network today; the rest are reserved. So "the agent may
spend up to 500 of this asset" is not something you can write yet — it is the shape
of the thing, declared in the type system, not a feature to demo.

`withinPrefix()` is on the builder and would narrow a policy to particular storage
keys. The network does not enforce it yet and the read RPCs do not return it, so
setting it would show a narrower grant than the one you actually got. This session
leaves it off.

## Files

```
ticker-logic/ticker.coco     the logic. Three routines, one counter, no permission checks
scripts/preflight.ts         does this node have access policies at all?
scripts/00-fund-agent.ts     owner sends the agent KMOI so it can sign
scripts/01-deploy-ticker.ts  deploy, write LOGIC_ID to .env
scripts/spike-policy.ts      create / read / update / delete, on its own
scripts/demo.ts              the three beats
```

`ticker.coco` is worth opening during the session precisely because there is nothing
in it. No sender check, no owner field, no guard. All of that is on the account.
