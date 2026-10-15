# MOI Builders 8 — speaking script

Friday 4 September, 4pm IST. About 30 minutes of talk including the demo.
Italics are stage directions, don't read them out.

---

==============================================================
##  OPENING SLIDE  ·  Title
==============================================================

Hey everyone, welcome back. This is MOI Builders, session eight, and today's topic is access policies: how you let a program write to your account, and how you take that back.

The centerpiece today is a live demo. An AI agent is going to try to write to my account three times, and it will be refused, then allowed, then refused again, without me changing any of its code. Everything runs on devnet, and the whole thing is in a public repo you can run yourself afterwards.

One sentence before we start, because every session comes back to it: agents are taking the human out of the loop, and MOI exists to make sure your preferences and your authority don't disappear along with you.

Let's get into it.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 2  ·  The use case
==============================================================

Let's start with a job you'd actually give an agent. Imagine you ask it to book your flights. You tell it you prefer aisle seats, you don't want overnight flights, and you give it a limit on what it can spend.

There are two very different kinds of information in that conversation, and I want to separate them.

The first kind is what the agent goes and does. It searches, it books, it pays. Those are actions, and every action becomes a transaction on the ledger. That part is fine, because recording actions is exactly what ledgers are built for.

The second kind is everything the agent needed to know about you before it could act. Your seat preference, your spending limit, and the fact that it's allowed to act for you at all. That information is a standing fact about you, and in a real sense it is you, written down as data.

So before we talk about controlling agents, there's a simpler question that comes first: where does that information live, so the agent can read it?

---

==============================================================
##  PRESS NEXT  -->  SLIDE 3  ·  How it works today
==============================================================

Today it lives in one of two places, and both of them have the same problem.

The first option is that the application holds it. On Ethereum a contract owns its own storage, so when you set a preference in a dapp, that preference sits inside their contract, keyed by your address. Off chain it works the same way: your preferences are a row in the service's database, keyed by your user id. As a result, ten services each hold a partial copy of you, and when you sign up for an eleventh, you teach it everything from scratch, because your data stays trapped inside each service that collected it.

The second option is that the agent holds it. You give the agent your preferences and it keeps them in its own memory, which is how most agent frameworks work today. That feels convenient until you try to switch agents. The new one starts from zero, because the old one kept everything you told it and has no reason to hand it over.

In both cases, if you want your authority back, you have to ask whoever holds the data to remove it. They own the storage and they run the process, so the most you can do is request.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 4  ·  So MOI moved the data
==============================================================

MOI's answer is to move the data. On MOI, your state lives on your own account, the one your key controls, instead of inside the program or the agent or a company's database.

I want to make that concrete, because it's a real difference in the storage model. On Ethereum, a user account holds a balance and a nonce, and that's the entire data structure. On MOI, a participant account carries state, and a program can declare that its data lives on each participant's own account. You'll see the syntax for that in a few minutes, and it's one keyword.

That's what "participant-centric" means in practice: you get a computational existence of your own. This matters now because agents are removing you from these systems. You stop clicking, the agent clicks for you, and your preferences and your authority need somewhere to live that survives you stepping away. The protocol gives you that place.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 5  ·  What that buys you
==============================================================

Moving the data pays off in three concrete ways.

First, there's one copy, and you own it. Your preferences and your grants sit on one account you control. When you update your spending limit, you update it once, and every program that reads you sees the new value.

Second, and this is the one that matters most for agents, they compose. Suppose agent A spent six months learning your travel preferences, and you replace it with agent B from a different vendor. Today that handover means an export API, a migration, and probably a data-sharing agreement between two companies. On MOI, agent B reads the same participant state agent A was writing, because both of them read you. Two vendors who have never heard of each other end up interoperating, and the reason is that you are the shared store.

Third, you can fire an agent without losing anything, because your state never lived inside it. You revoke its authority, which costs one interaction as you'll see, and the replacement you hire tomorrow starts with everything you told the old one.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 6  ·  The part nobody asks about
==============================================================

There's a consequence of this design that nobody asks about, and it's the reason this session exists.

If your data sits on your account, then any program that updates it has to write to an account it does not own. If you come from another chain, that sentence should sound strange, so let me explain why.

On Ethereum, the question can't even come up. Your account has no storage a contract could write into, because every write a contract makes goes into its own storage. The ethereum.org documentation states it directly: smart contracts cannot write data into a user's externally-owned account.

Solana gets closer, because Solana accounts do hold data. But a program owns each account, and only the owning program can modify it. The rule works per program, and no account of yours holds state that arbitrary programs might update.

So MOI had to create this capability, because participant-owned data that no program can update would just sit there as read-only data. And once you create it, you owe an answer to a question nobody else has to ask: who is allowed to write to my account, and for what?

Access policies answer that question.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 7  ·  Why not just write a rule
==============================================================

If you come from smart contracts, the tempting answer is to write the rule into a program and route the agent through it.

The problem is that the agent holds its own key. A rule that lives in a program only applies if the agent chooses to call that program, and it can call a different function, or a different contract, or nothing at all, because signing and submitting is the one thing a key always allows. Any limit you put in code, the agent can decline to look up.

So a rule in a program amounts to a polite request, and the agent decides whether to honor it.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 8  ·  The answer
==============================================================

So instead, the rule lives on your account, and that rule is called an access policy.

A policy is one record, and it spells out three things.

It says which program is allowed to write to your account. You name the program by its logic id, so the permission covers that one program and nothing else.

It says what that program is allowed to do. Today that means changing your storage, and near the end I'll tell you honestly what else is planned.

And it says who has to be making the call. That part is called the origin. In our demo I'll set the origin to my agent's account, which means only calls signed by my agent will qualify. Anyone else running the same program against my account gets nothing.

Whenever a program tries to write to your account, the protocol checks this record first. The program itself never sees the policy and never touches it.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 9  ·  The setup
==============================================================

Before the code, let me introduce the two accounts you'll be watching.

The first is the owner, which is me. This account owns the counter we'll play with, and it signs the grant and the revoke. The policy becomes state on this account.

The second is the agent. It has its own key and its own fuel, and it signs every write attempt you're about to see. Nobody asks it for permission at any point, and nobody notifies it of anything.

One thing I'll be transparent about, because someone always asks: for this demo, both keys come from one wallet, using two derivation paths, so the whole thing runs off a single funded devnet wallet. The chain sees two unrelated accounts and treats them as such. You could swap in any agent, with any key, from any vendor, and everything would behave the same way.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 10  ·  The logic — ticker.coco
==============================================================

Let's look at the code. Three files matter today, and none of them is long, so I'll show you the real ones in the editor.

*(switch to Cursor, ticker.coco)*

This is the logic, which is what MOI calls a contract. It's named Ticker, and these thirty lines are the entire file.

At the top you can see `state actor`, with a single counter field. That keyword is the storage model I described earlier. Actor state means each participant's copy of this counter lives on their own account. Ticker defines the shape of the data, and your account holds the bytes.

Then two endpoints. TickMy increments the caller's own counter, which is ordinary. TickAny takes a participant as an argument and increments that participant's counter, and that's our foreign write: a program changing a number on an account it doesn't own.

If you scroll through this file looking for a permission check, you won't find one. There's no owner field, no allowlist, and no test on who the sender is. I left those out on purpose, because whether TickAny succeeds is not this program's decision, and the demo is built to prove that.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 11  ·  The attempt — tick.ts
==============================================================

*(Cursor, tick.ts)*

The second file is what the agent runs. It's about twenty-five lines, and I'll execute this exact file in a minute.

Reading top to bottom: it reads my counter first, so we have a before value. Then it gets a driver for the Ticker logic using the agent's wallet, which means the agent's key signs everything from that point on. Then it calls TickAny with my account id as the argument.

Two lines in the send options deserve an explanation.

The participants line names my account with a mutate lock. If you've used Solana, you'll recognize the pattern: the interaction declares up front which accounts it touches, so the network can schedule it. That declaration serves scheduling. It grants nothing, and we're about to prove that empirically.

The second is the explicit fuel limit, and I think it's the most honest line in the file. Normally the SDK estimates fuel before sending, and it estimates by simulating the call. A call the protocol will refuse fails during that simulation, on the client, and never reaches the chain, which tells the wrong story, because it looks like the SDK protected me when in fact the network does the refusing. Setting the limit explicitly skips estimation, so the interaction genuinely gets submitted, mined, and refused on chain, with a receipt anyone can look up.

The rest of the file prints the verdict from the receipt and reads the counter again.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 12  ·  The grant — grant.ts
==============================================================

*(Cursor, grant.ts)*

The third file is the grant, and the first thing to notice is whose wallet it uses. Mine. The owner signs this interaction.

The body is a single builder chain, and it maps onto the three questions from before. Storage of the Ticker logic id says which program may write. Allow storage-mutate says what it may do. The origin line pins who has to be behind the call to the agent's account.

The API distinguishes caller from origin, and the difference is worth knowing. The caller is the immediate invoker, which in a chain of logic-to-logic calls could be another logic. The origin is the account whose key signed the interaction at the very start. I've left the caller open and pinned the origin, so however the call gets routed, the key behind it has to belong to my agent.

When this lands, it becomes an access-create operation on chain, and the policy becomes state on my account, stored alongside everything else about me.

There's a fourth file, revoke.ts, which I'll show you when we get there. It's four lines.

Notice that the agent appears nowhere in this file as a signer. There's no approval flow and no counter-signature, because this is a fact about my account rather than an agreement between me and the agent. The agent finds out the way anyone finds out anything on a chain: it tries.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 13  ·  Where the check happens
==============================================================

Before we run it, I want to answer the question every engineer asks afterwards: where exactly does the check happen?

Walk the pipeline with me. The agent signs the interaction and submits it. The network validates the signature, checks the nonce, and checks that the account can afford the declared fuel limit. Those are the ordinary up-front checks, and permission is not among them. The network accepts and mines the interaction without consulting any policy.

Then Ticker starts executing, line by line, still without a check.

The check happens when execution reaches the store instruction, the point where TickAny tries to write into my account's storage. At that instruction, the runtime pauses, reads the policies stored on my account, and looks for one that covers this logic, this action, and this origin. If it finds no match, it refuses the write and the whole interaction reverts. If it finds a match, the write goes through.

I want to emphasize the word runtime. The check doesn't live in the SDK, which the agent could fork. It doesn't live in Ticker, which you just read. It doesn't live in any library the agent imports, because the agent picks its own imports. It lives in the virtual machine that executes every instruction of every logic on the network, so no version of the agent skips it. The agent's program never contained this step. The world the program runs in contains it.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 14  ·  Live demo
==============================================================

Let's run it. I'm using plain node, since node runs TypeScript directly these days, and I'll run the same file three times. Keep an eye on the counter.

*(terminal)*

**Beat one.**

`node scripts/tick.ts`

No policy exists yet. The agent signs and submits, and we wait for the receipt.

*(wait for the refusal)*

Refused. Look at the error text: builtin.AccessError, actor is not allowed to write into other actor's storage. The word "builtin" tells you the runtime's own enforcement produced this refusal, rather than anything Ticker did. Notice also that the interaction has a hash and got mined, and the agent paid eighty-six fuel to hear no. The counter hasn't moved.

**Beat two.**

`node scripts/grant.ts`

This runs the builder you just read, signed from my account.

*(wait)*

The policy now exists as state on my account. Nobody consulted the agent, and nobody told it.

*(optional: `node scripts/policy.ts` — "if you'd rather not take my word for it, we can ask the chain directly. There's the policy on my account: resource type storage, the Ticker logic id, the storage-mutate action, and the agent's id in the origin constraint. Anyone can run this query.")*

**Beat three.** I'll press the up arrow and run the identical command again.

`node scripts/tick.ts`

*(wait)*

This time it goes through, and the counter went up by exactly one. Nothing about the agent changed between these two runs. Same file, same key, same argument. The one difference in the entire system is the record on my account.

The fuel shows it too: the successful call cost about a hundred and thirty-four against the refusal's eighty-six, because execution ran all the way through the write this time instead of stopping at it.

**Beat four.**

`node scripts/revoke.ts`

*(flip to Cursor briefly)* Here's the fourth file I promised. My wallet, storage of Ticker, delete, send. Four lines, and that's the entire revocation.

*(back to terminal, wait)*

The policy is gone.

**Beat five.** Up arrow one more time.

`node scripts/tick.ts`

Nobody told the agent anything changed, so it calls in exactly as before.

*(wait)*

Refused again, with the same error as the first attempt, and the counter stays where it was.

So that's three identical runs of one file: refused, allowed, refused. The agent's code, key, and arguments stayed constant across all three, and the one variable in the whole experiment was the policy on my account. Ticker contributed nothing to these decisions, because we read all thirty lines and there's no decision in there. The protocol decided.

*(back to slides)*

---

==============================================================
##  PRESS NEXT  -->  SLIDE 15  ·  What the chain says
==============================================================

Let's look at the refusal more closely, because the receipt is where this stops being my claim and becomes a public record.

The interaction status is one, which in MOI's receipt semantics means the network mined it, charged for it, and reverted the state change inside it. The error reads builtin.AccessError, actor is not allowed to write into other actor's storage.

Consider what that receipt is. The agent's attempt to write to my account now exists as a permanent, signed, timestamped artifact on a public ledger, and the agent paid real fuel to create it. Anyone can look up, at any point in the future, the fact that this key tried to write to this account and the protocol refused it.

Today, the equivalent evidence would be an error message in a log file that you control. For autonomous agents, where accountability carries most of the weight, a public receipt and a private log entry are different categories of evidence.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 16  ·  Revocation
==============================================================

Taking the authority back also cost one interaction. You watched it in beat four, where it took about a hundred fuel and a few seconds.

Let me spell out what that revocation skipped, because the list matters. I didn't redeploy anything, since Ticker never changed. I didn't rotate any keys. I didn't call the agent's vendor, open a support ticket, or need anyone's cooperation. I changed a fact on my own account, and the agent's next write failed.

If you run agents in production, the question you care about is what happens when the thing misbehaves at three in the morning: how fast can you stop it, and whose cooperation do you need? Here the answer is one interaction, and nobody's.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 17  ·  How others enforce
==============================================================

I want to be fair to the other chains, because every serious chain stops arbitrary writes, and I'm not arguing that other chains are insecure.

Ethereum enforces through the contract's own code. An ERC-20 allowance genuinely binds, and it binds because the contract owns the balances, so the contract's code stands as the gatekeeper. The contract author decides the unit of protection.

Solana enforces in the runtime, like MOI, but per program. A program owns each account, and the runtime guarantees only that program writes to it. That's a real guarantee, enforced below user code, and its granularity is the program.

MOI enforces in the runtime, per account, with the account's owner setting the rule. The enforcement sits at the same altitude as Solana's, below anything the agent can touch, and the rule itself is mine: which program, which action, which origin, on my account.

So the honest comparison concerns where the rule lives and how fine it gets. It goes from contract code, to per-program, to per-account, and MOI sits at the per-account end with you holding the pen.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 18  ·  Honest scope
==============================================================

Now the honest part, because there should always be an honest part.

What you saw today is storage policies, and storage is what the network enforces right now. Everything I demoed is reproducible today.

The type system declares more. Resource types for assets, logics, and keys sit next to storage in the enum, declared but reserved, meaning not yet enforced. The sentence everybody in this space wants to write, "this agent may spend at most five hundred," is one you can't write yet, and I won't pretend otherwise.

Today's mechanism still matters because every one of those future policies shares its shape: a resource, an action, and an origin, stored on your account and checked by the runtime at the instruction. When asset policies go live, you'll already know how they work, because you watched the same mechanism today on the one resource where it's real.

---

==============================================================
##  PRESS NEXT  -->  SLIDE 19  ·  Close
==============================================================

Everything from today is in the repo under session-8-policies: the Ticker logic, the four scripts I ran, and a runbook. One funded devnet wallet runs the whole thing end to end, and if this interested you, the best next step is to run it and try to break it.

I'll leave you with the sentence we started with. Agents automate your actions, and MOI gives you, the participant, a computational existence of your own, so your preferences and your authority stay yours. Access policies make that existence writable on your terms, and revocable on your terms.

That's the session. Happy to take questions.

---

## If the demo dies

Don't debug live. Say this, play `recording/demo.mp4`, and pick up at slide 15:

> "Devnet's having a moment, so let me show you the recorded run. Every hash in it is on chain, and you can verify all of it yourself afterwards."

## Likely questions

**Can the agent work around the policy?**
No. The check runs in the virtual machine at the store instruction, against state on the target account. The agent controls its own code, imports, and client, and the check lives in none of them. Getting past it would require the network's validators to run a different VM.

**What if the agent has more fuel than me?**
Fuel makes no difference, because fuel buys computation rather than permission. In beat one the agent had plenty of fuel and spent eighty-six of it getting refused.

**Can I grant to anyone instead of one agent?**
Yes. The origin constraint accepts an "any" form as well as a set. I used a set with one account because that's the tightest version, and it's the sensible default for an agent.

**What's the difference between caller and origin?**
The origin is the account that signed and started the interaction. The caller is the immediate invoker, which in a logic-to-logic chain might be another logic. I constrained the origin, so the key that started the whole thing has to belong to my agent.

**Does the agent know it's been revoked?**
Only when it tries. Revocation changes state on my account and notifies nobody. Beat five showed exactly this.

**Can I cap what it spends?**
Not yet. Asset policies are declared in the type system but reserved, and the network enforces storage today. The shape of a spend cap already exists in the enum, and it uses the same mechanism.

**Why not use allowances, like Ethereum?**
Allowances work because the contract owns the asset, so the gatekeeper and the storage are the same code. On MOI your data lives on your account instead of in the contract, so the gate has to sit where the data sits: with you, enforced by the runtime.
