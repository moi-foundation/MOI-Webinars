---
title: "Access Policies on MOI — Fine-Grained Control Over Your Own Account"
description: "An access policy is a permission record on your own account: which programs may change your data, and who has to be behind the request. The protocol enforces it, so an AI agent holding its own key still cannot route around it."
author: "Adithya Ganesh"
authorRole: "Ecosystem, Sarva Labs"
slug: "moi-access-policies-fine-grained-control"
tags: [access control, on-chain permissions, AI agents, agent authority, MOI, agentic AI]
---

# Access Policies on MOI — Fine-Grained Control Over Your Own Account

## What is an access policy?

An **access policy** is a permission record that sits on your own account. It says which programs are allowed to change your data, and who has to be behind the request.

On [MOI](https://moi.technology), the protocol checks that record before any write goes through. The program doesn't get a say.

Today those policies cover **storage**. The same mechanism is built to extend to everything else an account holds. This post is about learning it while it is small enough to see all of at once.

We look at it through an AI agent, because that is where it bites hardest. An agent holds its own key, so it can sign anything it likes. A rule it has to *look up* is a rule it can decide not to look up.

We built this live at MOI Builders Session 8. Every interaction in this post is real and sitting on [MOI's Voyage devnet](https://voyage.moi.technology), and the code is open in the [MOI-Webinars repo](https://github.com/moi-foundation/MOI-Webinars).

## Why a program cannot hold the rule

Say you want to limit what an agent can spend. The obvious move is to write the limit into a program and have the agent spend through it.

That gives you a gate with no fence. The gate works perfectly. Everyone who walks through it gets checked. The problem is the field it stands in, which has no fence at all, and the agent has legs.

Why the field is open is specific to MOI. Assets here are native to the protocol, so whoever holds one can transfer it directly. A program wrapping that asset is a route the agent may take, not the only route. On Ethereum the same trick does not work, because the token contract holds the balances and there is no way around it.

There is a stricter version, and it fails in a more instructive way. Rather than hoping the agent calls your program, lock the asset up against that program so only it can move them. Now the rule really does bite.

Except the agent holds the key to the account holding the asset. It created the lockup, and it can release the lockup. The constraint and the power to remove the constraint sit behind the same signature.

That is the whole problem in one line. The rule was not written badly. It was put somewhere its subject could reach.

So this particular hole is one MOI opens and MOI has to close. Access policies are how it closes.

Here is the part that makes MOI different. On most chains, a program owns its own data. On MOI, **you own your data and programs come to you**.

Your counter, your balance, your records live on your account. A program that wants to change any of it is reaching into somebody else's house.

That sounds like extra work. It is the opposite. Because the data is yours, the permission can be yours too. It hangs off your account, the protocol checks it, and the code doing the asking never touches it.

## How other chains handle this

MOI is not the first chain to try to limit what a program can spend on your behalf. It is worth seeing what the alternatives actually do, because the differences are smaller than the marketing usually suggests, and they sit in one specific place.

**Ethereum: the allowance.** You call `approve(spender, amount)` on a token contract. That spender can then pull up to that amount using `transferFrom`. The token contract checks the number every time.

This genuinely works. It is not a suggestion, and it is not enforced on the honour system. It works because on Ethereum the token contract owns the balances. There is no way to move the token except through the contract, so the contract's rules are unavoidable.

**Solana: the delegate.** Almost the same idea, different shape. You call `Approve` and your token account records a delegate and a delegated amount. That delegate can transfer or burn up to that amount, and `Revoke` cancels it. The [SPL Token program](https://www.solana-program.com/docs/token) enforces the limit, and it can do that because token account data is owned by the SPL Token program. Only that program may write to it.

**Ethereum's newer answer for agents.** [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715) lets an app ask a wallet for scoped, expiring permissions, and [ERC-7710](https://docs.metamask.io/delegation-toolkit/0.12.0/experimental/erc-7710-redeem-delegations/) defines how those get redeemed and checked on chain. MetaMask ships an implementation. This is close in spirit to what we are describing, and it is a real answer to a real problem.

So what is different here?

| | Where your balance lives | Who enforces the limit | What one rule covers | What you need first |
|---|---|---|---|---|
| **Ethereum allowance** | Inside the token contract | That token contract | That one token | Nothing extra |
| **Solana delegate** | In a token account owned by the SPL Token program | That program | That one token | Nothing extra |
| **ERC-7715 / 7710** | Inside your smart account | A delegation manager contract | What the permission names | A smart account |
| **MOI access policy** | On your own account | The protocol runtime | Any program that touches your storage | Nothing extra |

Two differences matter.

**The rule is attached to you, not to an asset or a contract.** An allowance protects one token. A policy protects your account, against any program that comes near it, including programs written after you set the rule and programs you have never heard of.

**There is no special kind of account.** ERC-7715 permissions need a smart account and a delegation contract to check them. That gap has narrowed a lot: since the Pectra upgrade in May 2025, [EIP-7702](https://ethereum.org/roadmap/pectra/7702/) lets an ordinary Ethereum account take on smart-account behavior without moving any funds, and a 7715 account can be created as part of the permission flow rather than up front.

On MOI a policy is one interaction from a plain account. Nothing to upgrade, nothing to deploy, no second wallet.

And one difference that is honestly smaller than it looks. People often say allowances are weaker because a contract enforces them rather than the chain. That is not really true. An ERC-20 allowance binds because nothing can move that token except the contract holding it.

### So can a program change your balance on other chains?

No, and it is worth being exact about why, because the answer is different on each chain and the differences are the whole point.

**On Ethereum, your balance is protected by code.** It is a row in the token contract's own storage. That contract can change any row it likes, and the only thing stopping it is the checks its authors wrote. The protocol has no view on the matter. This is why a token with an admin function, or simply a bug, can empty balances, and why "is this contract safe" is a question you have to ask about every contract separately.

**On Solana, your balance is protected by the protocol, at the level of programs.** The runtime enforces that only an account's owning program may write to it. That is a real rule, not a convention. But the unit is the program: the SPL Token program may write to every token account it owns, and protection inside that boundary is once again down to the program's code.

**On MOI, the rule is enforced by the protocol at the level of accounts.** The runtime checks a policy attached to the specific account being written to.

| | Enforced by | Unit of protection |
|---|---|---|
| **Ethereum** | The contract's own code | Whatever that code says |
| **Solana** | The protocol | Per program |
| **MOI** | The protocol | Per account |

All three stop a program from arbitrarily rewriting your balance. The ladder is where the rule lives and how fine-grained it gets. MOI's contribution is not that permission exists. It is that the individual account holder sets it, and the runtime rather than the program applies it.

## What we built

The demo is boring on purpose. There is a program called **Ticker** and it holds one counter.

The interesting bit is where that counter lives. It is declared as **actor state**, which on MOI means the counter Ticker keeps for you sits on *your* account, not inside Ticker.

So when somebody calls `TickAny(you)`, a program they started tries to change a number stored on your account. That is a foreign write, and it is exactly what access policies govern.

Here is the entire logic, in [Coco](https://docs.moi.technology), MOI's language:

```coco
coco Ticker

state actor:
    counter U64

// Bumps the SENDER's own counter. Always allowed: you are writing to yourself.
endpoint dynamic TickMy() -> (counter U64):
    mutate c <- Ticker.Sender.counter:
        c += 1
        counter = c

// Bumps ANOTHER participant's counter. A foreign access.
endpoint dynamic TickAny(participant Identifier) -> (counter U64):
    mutate c <- Ticker.Actor(participant).counter:
        c += 1
        counter = c

// Read a participant's counter without writing anything.
endpoint static CounterOf(participant Identifier) -> (counter U64):
    observe c <- Ticker.Actor(participant).counter:
        counter = c
```

Read it twice and notice what isn't there. No `if sender == owner`. No owner field. No allowlist, no modifier, no guard of any kind. Thirty lines and not one of them is about permission.

Two accounts, both with their own keys:

- **The owner** — holds the counter, and is the only account that can publish policies about it.
- **The agent** — a separate account entirely, not a sub-account. Different key, different identity. It wants to increment the owner's counter.

We made the agent as stupid as possible on purpose. It is a bare key calling a function, with no model behind it and no decisions of its own.

That is the argument, not a shortcut. It should not matter how clever or well behaved the agent is. Give it a real key and the worst intentions you can imagine, and the answer comes out the same.

## The three beats

Same call, three times, from the same key.

First, what "calls" means here. The agent sends a signed request to the chain saying: run Ticker's `TickAny` function, with the owner's address as the input. It builds that request itself, signs it with its own key, and pays the fuel.

Nobody approves this. Any account can call any public function on any program, on MOI and on every other chain. Calling is open to everyone.

The restriction is not on who may call. It is on what the call is allowed to change once the code is running. The agent gets to ask. It does not get to decide the answer.

**One. The agent calls `TickAny(owner)` with no policy in place.** It's refused:

```
builtin.AccessError: actor is not allowed to write into other actor's storage
```

"Actor" is MOI's word for a participant, which is to say an account. The first actor in that sentence is the agent, running the call. The other actor is the owner, whose counter it tried to change. Read plainly, the chain is saying: this account may not write to that account's data.

That message came off the chain, not out of our script. The interaction was accepted, signed, mined, and charged 86 fuel — and it simply didn't do anything. The counter didn't move.

```
0x9fc1eff18074530385f3ea11d9b1dee5df29805255fde318ffc8322dc9d4cbe1
```

That distinction is worth a second. The network did not reject the request as malformed, and the SDK did not refuse to send it.

The interaction happened. It is public and permanent. The write inside it was turned down at the last moment, and the error even names the `STORE` instruction it stopped.

**Two. The owner publishes one policy.**

```typescript
await new Access(owner.wallet)
  .storage(TICKER_LOGIC_ID)              // WHICH program may write
  .allow(AccessAction.STORAGE_MUTATE)    // WHAT it may do
  .caller(access.anyCaller())            // who may call in
  .origin(access.callers(AGENT_ID))      // WHO must be behind it
  .create()
  .send();
```

One interaction, 100 fuel. The agent isn't consulted. It can't decline, can't negotiate, and doesn't find out until it tries again.

```
0x7e1cd37bcb2f3f46b502151124f53f7854c13e29a5c4db36572b644f55c648a0
```

**The agent makes the identical call.** It works, at 134 fuel, and the counter goes up by one.

```
0x3a13edc1e0955d796b9d65961b2d1791b8bc73e50b53d4333c2ee83e149afd05
```

**Three. The owner deletes the policy, and the agent calls a third time.** Refused again, same error, same 86 fuel, counter unchanged.

```
0xc16f5627471393cb6e8dd7c75e827670e7a3b78f75991b140071992addee0357   delete
0x8a36a411aa668b5eec4a140da53d2200fe123741b0768c30d652af04de9080b2   refused
```

All five are on [Voyage devnet](https://voyage.moi.technology) and readable by anyone.

Between the first refusal and the last one, nothing about the agent changed. Not its key, not its code, not its intentions, and not one line of Ticker. The only thing that moved was a record on somebody else's account.

## What the policy actually says

Four things in that call are worth knowing. Three of them surprised us.

**You name a program, not a person.** `.storage(TICKER_LOGIC_ID)` takes the ID of the program doing the writing. A policy answers the question "which program may write to my storage", so a program is what it names. We had expected it to name a storage slot or an account.

**Caller and origin are different questions.** The caller is whoever made the immediate call. The origin is whoever started the whole thing. Pinning the origin to one agent is what makes this grant belong to that agent, rather than to anyone who can reach the program.

**You can only write a policy onto your own account.** Try it on someone else's and the network rejects it before it is even processed. Authority only flows outward from whoever holds it.

**Update replaces, it does not merge.** An update swaps the whole policy. Anything you still want has to be written again, or you have quietly dropped it.

## Who actually holds what

There is a detail in the setup that looks like plumbing and turns out to be the shape of the whole idea.

The owner is a wallet. The kind a person opens, unlocks and clicks in.

The agent is a separate key running on its own somewhere, and it never touched a faucet. The owner created it and paid for it, in one interaction that registers the agent's key and hands it an opening balance at the same time. One funded wallet, two live accounts.

Now remember that a policy can only be written by the account it sits on. So the grant can only ever be signed by the person whose data it protects.

That splits the roles the way you would actually want them split. The human sits in a wallet and approves a permission. The agent runs somewhere else, with its own key, and never touches that wallet.

The thing being restricted has no access to the thing doing the restricting.

We ran both sides from scripts, because a demo needs to be repeatable. But the honest version of the setup is a human clicking approve in a browser extension while an agent runs unattended on a server, and nothing about the protocol side would change. What's missing is a smaller piece than it sounds: MOI's SDK ships a browser provider that talks to an injected wallet, but no signer that hands an unsigned interaction to an extension for signing. Until that exists, the owner side of this stays scripted.

## How the check actually happens

"The protocol enforces it" is easy to nod along to without really taking in. So here is the sequence, step by step.

1. The agent builds a call to `TickAny(owner)` and declares that it is going to touch the owner's account. That declaration is not permission and not a request. It is a heads-up about what the call will reach, and an agent that lies about it just fails in a different way.

2. The agent signs with its own key. Nobody can stop this and nobody tries. Signing is free.

3. The network accepts the interaction and mines it. Still no permission check anywhere. The agent has now spent fuel.

4. Ticker runs. It reaches the line that changes the counter, works out that the counter belongs to a different account than the one that sent the call, and asks to write to it.

5. **This is where it stops.** The runtime looks on the target account for a policy allowing this program to write, with this agent behind the call. There isn't one. The write fails, the whole interaction reverts, and the receipt records the error.

The word that matters is *runtime*. Not the SDK, not Ticker, not some library the agent chose to import.

There is no version of the agent that skips step 5, because step 5 is not part of the agent's program.

## This isn't only our problem

This gap is not ours alone. The industry is running into the same one at scale, described in less specific language.

Gartner expects more than forty percent of agentic AI projects to be canceled by the end of 2027, and names inadequate risk controls alongside cost and unclear value among the causes ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). It also expects a large share of enterprises to demote or decommission autonomous agents over governance gaps — the kind usually discovered after something has already gone wrong in production.

[Forbes, covering that research](https://www.forbes.com/sites/robertszczerba/2026/07/07/why-40-of-agentic-ai-projects-may-be-canceled-by-2027/), put it as agents crossing from suggestion into action faster than organizations are building the controls to govern that action.

Our version is smaller and more concrete. The control usually exists. It's in the wrong place — inside the thing it's supposed to be controlling. Moving it out is not a new feature so much as a correction, and on MOI the place to move it to is the account itself.

## The honest part: most of this isn't finished

One thing to hear before you build anything on this.

**Only storage works today.** MOI's type system already lists `ASSET`, `LOGIC` and `KEY` next to `STORAGE`, and lists actions for each. On the live network, storage is the only one that does anything.

So the sentence everyone actually wants, *this agent may spend up to five hundred of this asset and no more*, is not one you can write yet. You can see its shape sitting in the type system, waiting for the network to catch up.

We are showing the mechanism on the one resource where it works. The mechanism is the part that carries over.

So be precise about what this is. Access policies are the right answer to "a limit the agent consults is only a preference". They are not yet a shippable answer to "cap my agent's spending".

**A narrower scope exists on paper but isn't enforced.** The SDK's policy builder has a `withinPrefix()` method for restricting a grant to particular storage keys. The network doesn't enforce it yet and the read APIs don't return it, so setting it would show you a tighter permission than the one you actually have. We left it off, which is the safer error.

**And one trap worth naming**, because it nearly fooled us. A broke agent and a forbidden agent both stop, and on a screen they look identical. An early run of ours showed the third beat "passing" — refused, counter unchanged, green tick — when the agent had simply run out of fuel two calls earlier. The demo now insists the refusal is a genuine `AccessError` and refuses to start at all if the agent can't afford every call. If you build a permissions demo, build that check first. A green result for the wrong reason is worse than a red one.

> **Authority you can grant, revoke, and never be argued out of.** The agent holds its key the entire time. It still can't write.

## What this changes, once the rest lands

Here is what the finished version buys you. Treat it as the destination, not where we are standing.

Today, giving an AI agent spending power means trusting its code. You read its source, set limits in its config, and hope nobody changes either. That includes the agent itself, if it is the kind that writes code. Every control you have depends on the agent behaving as written.

Once asset policies work the way storage policies do now, that flips. You would grant an agent the right to move one asset up to a ceiling, and take it back in a single interaction the agent cannot see coming or refuse.

Checking what an agent is allowed to do would mean reading your own account instead of its repository. Two questions that are hard today, *what can this thing actually do* and *how fast can I stop it*, become a read and a write.

None of that works yet, and the storage demo is not secretly that. But it is the same mechanism, and the mechanism was the uncertain part. Extending it to assets is protocol work with a known shape rather than an open research question.

## Under the hood

The whole session is a thirty-line logic and four scripts. There's no server, no API key, and no model anywhere.

- **[MOI](https://moi.technology)** — the chain. Participant-owned state, access policies, and settlement. Devnet explorer and faucet: [voyage.moi.technology](https://voyage.moi.technology)
- **[Coco](https://docs.moi.technology)** — MOI's language. `coco compile` builds the manifest; the `state actor:` block is what puts the counter on your account instead of the logic's
- **[js-moi-sdk](https://www.npmjs.com/package/js-moi-sdk) 0.8.0** ([docs](https://js-moi-sdk.docs.moi.technology)) — the `Access` builder that assembles the policy operations. Reading policies back is a direct RPC call to `moi.AccessPolicy` or `moi.AccessPolicies`
- **[Node.js](https://nodejs.org)**, **[TypeScript](https://www.typescriptlang.org)** and **[tsx](https://www.npmjs.com/package/tsx)** in npm workspaces
- **[dotenv](https://www.npmjs.com/package/dotenv)** — one funded devnet wallet; the owner creates and fuels the agent from it

Some numbers from the live run on devnet node 0.12.0, in case you're sizing something similar. Publishing a policy cost 100 fuel and deleting one cost the same. Deploying Ticker cost 719, creating the agent account cost 399, the permitted write cost 134, and the refused write cost 86 — refusal is cheaper than success, but it is not free.

Fuel is not the interesting constraint, though. Account balance is a separate question, and a nastier one: a policy write needs considerably more headroom than an ordinary interaction, and on a thin account it fails with `insufficient funds`. That error reads like a fuel problem and isn't one — we lost an afternoon to it, tuning fuel limits that were never the issue. Fund the owner generously.

One rule runs under all of it: **code gets execution, the protocol gets permission.** Anything a program can decide, a program can be persuaded to decide differently.

## FAQ

**What is an access policy on MOI?**
A permission record published on your own account that names which logic may write to your storage and which participant must have originated the call. The protocol checks it before the write lands, so it holds regardless of what the calling program does.

**Why can't I just put the rule in a smart contract?**
Because an AI agent holds its own signing key, so calling your contract is optional for it. The contract's rules only bind the transactions that go through the contract. A policy on your account binds every write to your storage, including ones from programs you've never heard of.

**How is this different from a token allowance?**
An allowance is a standing right to pull funds, granted inside an asset contract and enforced by that contract. An access policy sits on your account and is enforced by the protocol. The practical difference is what happens when the program is bypassed — an allowance can't help you, a policy still applies.

**Can I cap how much an agent spends?**
Not yet. Only storage resources are enforced today. `ASSET` and `LOGIC` are declared in the type system and reserved, so spend caps are the visible next step rather than something you can ship.

**What does the refusal look like?**
The interaction is mined and charged for, and its receipt comes back with a non-zero status and a `builtin.AccessError`. There's no thrown exception and no rejected submission — you get a permanent, public record that the write was attempted and declined.

**Is the agent a sub-account of the owner?**
No. It's a separate account with its own key and its own identity. That matters, because a sub-account shares its parent's key, and a key the agent already holds cannot be the thing that limits the agent.

**Does the agent have to cooperate?**
No, and that's the entire point. It isn't asked before a policy is created, can't refuse one, and can't remove one. It finds out by being refused.

**Can I run this myself?**
Yes. Clone the [repo](https://github.com/moi-foundation/MOI-Webinars), fund one devnet wallet at the [Voyage faucet](https://voyage.moi.technology), and `npm run demo` runs all three beats. Fund it generously — a thin account fails at the policy step for reasons that look like something else.

---

*Built at [Sarva Labs](https://www.sarva.ai) for the MOI Builders series. Earlier sessions cover what this one stands on: [the agent registry](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-3), [native assets and swaps](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-4), and [two agents paying each other](https://github.com/moi-foundation/MOI-Webinars/tree/main/session-7).*
