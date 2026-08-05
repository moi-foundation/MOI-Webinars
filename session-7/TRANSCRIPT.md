# Session 7 — the talk

Slides → live demo → code → the gap. About 45 minutes.

Quote blocks are said out loud, roughly as written. **Bold is a stage direction.**

Mechanics live in [DEMO-PLAN.md](./DEMO-PLAN.md). Break-glass table is in [RUNBOOK.md](./RUNBOOK.md).

---

# Act 1 · Slides — 7 minutes

## Slide 1 — title

**Open cold. Don't read the slide.**

> Two programs. One of them sells probability estimates on bitcoin. The other one needs an answer
> and can't work it out for itself.
>
> They've never met. No account. No API key. Nobody introduced them.
>
> In about thirty seconds one of them is going to find the other, decide it's legitimate, and pay
> it — and I won't touch anything except the keyboard at the start.

## Slide 2 — the two agents

**Stay here. This is the whole setup. Nothing to click.**

> Let me introduce them properly, because I'm going to call these agents and that word gets thrown
> around.
>
> On the left, the **Risk Agent**. It's the buyer. It has a question, it can't answer it, and it has
> a wallet. Two things make it an agent and not a script: it works out which market actually answers
> its question, and it decides whether the price it gets quoted is worth paying.
>
> On the right, the **Signal Desk**. It sells probability estimates. Will bitcoin draw down more
> than twenty percent this quarter. Will it close higher next week. And here's the part I like — it
> sets its own price, per request. That number isn't in a config file. The desk decides it, every
> time you ask.

**Beat.**

> Now the important bit. Look at the gap in the middle.
>
> The buyer does not have the seller's address. Doesn't have its URL. Doesn't know it exists. There
> is no shared secret, no contract, no signup.
>
> The only thing they have in common is the strip along the bottom — they're both registered on MOI,
> and the money they'll settle in is native to it. That's it. That's the entire relationship.

> So: how does one of them pay the other?

## Slide 3 — paying a stranger

> Moving money is the easy part. Chains have been doing that for the better part of two decades.
>
> The hard part is what you do without thinking, every time you buy something from someone you've
> never met.
>
> You glance at the shop and decide it looks real. You have a rough number in your head you won't go
> past. And you assume that if nothing turns up, you've got some way to get your money back.
>
> Three instincts. You don't even notice them.

**Beat.**

> Take the human out and every one of them disappears. And you have to take the human out — you
> can't approve a fraction-of-a-cent purchase by hand. Clicking costs more than the thing you're
> buying.
>
> So each of those instincts has to become something a machine can actually check. Three questions.
> Three sessions. Today is the first one.
>
> **How do you know who you're paying?**

**Switch to the browser.**

---

# Act 2 · Live — 13 minutes

**http://localhost:4000 open. Terminal in a second window if you have the screen for it.**

Step numbers match the cards in the browser.

## The happy path

> I'm going to type what I want, in plain language. Watch what I don't do — I don't name a seller, I
> don't name a price, and I don't give it an address.

**Type:** `should i be worried about a crash`

**Let it run. Cards land about six seconds apart — that gap is yours, talk into it.**

**1 · "I don't know the answer to this"**

> First thing it does is admit it's stuck. That's the honest starting point for any agent: I can't
> answer this, so who can?
>
> And it doesn't go looking for a *company*. It goes looking for a *skill* — `sells-signals`.

**2 · "Found one: agent_134"**

> There. One agent came back, and look at everything that came with it: an id, the wallet it
> registered, the URL where it lives, the skills it advertises.
>
> All of that came off the chain. **I never gave it that address.** I gave it a question.

**3 · "Here is what I sell"**

> Now it's reading the catalog, and the catalog is free. The questions are public — you only pay for
> the answers.
>
> That's deliberate. If browsing cost money you couldn't work out what you wanted without paying to
> find out.

**4 · "This is the one I want"**

> It went for the drawdown market. And look at `decided by` — that's a model, reasoning.
>
> Worth noticing: I typed the word "crash". That word appears nowhere in the catalog. The market
> says "draw down". Keyword matching would have missed it.

**5 · "402 Payment Required"**

> Four-oh-two. Payment Required. It's been sitting in the HTTP spec since 1997, basically unused,
> because until recently nothing needed to charge a machine for a single request.
>
> And notice the desk tells me *why* it's charging this. That's its own pricing decision, not a
> lookup.

**6 · "3 USDM — I'll pay that"**

> And the buyer decides whether that's fair. Two agents, two decisions, one transaction. If the desk
> had marked this up hard, you'd be watching the buyer walk away instead.

**7 · "Checked who I am paying"**

**Slow down. This is the session.**

> Here's the thing I actually want you to leave with.
>
> That address in the quote is thirty-two bytes. It tells you **where** to send money. It tells you
> absolutely nothing about **whose** address it is.
>
> No payment protocol can help you here. That's not what they're for. They move value; they don't
> vouch for people.

**Beat.**

> So before it spends anything, the agent goes back to the chain and asks a different question: is
> this actually the wallet that this agent registered?
>
> It matches. Now it'll pay.
>
> That check takes about a second, and it happens **before** the money moves — not after. That
> ordering is the whole security property. There's no escrow here and nothing to claw back, so a
> check that runs late may as well not run.

**8 · "Paid — on chain, from my own wallet"**

> Money's moved. Real transfer, real interaction hash.

**Point at the green value next to `interaction`. It's the only green thing on the page. Click it — it copies.**

> That's not a receipt I printed for myself. That interaction is on devnet whether or not you
> believe a single thing on this screen. Paste it into an explorer and it's there.
>
> And read the wording — *from my own wallet*. On MOI, only the owner can move their own funds.
> Nobody is holding this money on anyone's behalf, because nobody can.

**9 · "I checked your payment myself"**

> Seven checks. And the seller isn't taking the buyer's word for any of it — it goes and reads that
> interaction off the chain and decodes it. Right sender, right recipient, right amount, not already
> spent.
>
> Same hash at the bottom. The seller independently arrived at the transaction the buyer claimed.

**10 · the answer**

> Paid. Delivered. Balance at the top dropped by three.
>
> One thing I want to say plainly, because it's a number about bitcoin and those get screenshotted:
> **that probability is made up.** There's no model behind it and no market data. Every response
> says so. Today is about the payment, not the forecast.

## The refusal

**Tick "Simulate a compromised listing". Ask the same thing again.**

> Now let's break it. I've repointed the seller's registry entry at an attacker — as if someone got
> into the listing and swapped the payout address.
>
> The seller itself hasn't changed. It's still going to ask to be paid at its real address. Watch.

**Let it reach step 7.**

> Stopped. Registry says one thing, the quote says another, and it walked.
>
> **Money moved: none** — and that's literal, not a friendly message. It never built a transaction.
> There's nothing to reverse because nothing happened.

**Beat. Let it sit.**

> And notice *who* caught it. Not the seller. Not a middleman. The one with something to lose.

---

# Act 3 · The code — 14 minutes

**Switch to the editor.**

> Four files. Everything that makes this safe is in them, and nowhere else.

## `payment-proof.ts`

**Show `Quote` and `PaymentClaim`.**

> The entire wire format is two messages.
>
> The seller sends a **Quote** — here's my price, here's the asset, here's where to pay, and here's
> my agent id. The buyer sends back a **Claim** — I sent this much, to you, in this transaction, for
> this thing, and here's my signature over all of it.
>
> That's the protocol. No third service, nothing to negotiate.

**Point at `payToAgentId`.**

> And that field is why any of this works. Take it away and `payTo` is thirty-two anonymous bytes
> again.

## `identity-check.ts`

**Whole file on screen. 42 lines. Don't scroll.**

> This is the idea the whole session is built on, and it's forty-two lines.

**Point at one line:**

```ts
if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo)) {
```

> Read the wallet this agent registered. Compare it to the one on the invoice. Refuse if they
> disagree.
>
> That's it. That's the check no payment protocol can do for you, because it needs an identity that
> lives somewhere both parties can go and look — independently, without asking each other.

**Then show where `approve()` is called in `pay.ts`.**

> And this is where it runs. Before the transfer. Not after, not alongside — before. The payment
> client is physically incapable of spending until this returns a yes.

## `verify-proof.ts`

**Two of the seven. Don't read them all.**

**Check 3, `key_binds_to_payer`:**

> Transfers are public. Anyone watching the chain can see that payment land.
>
> So what stops someone else grabbing *my* transaction hash, claiming it, and walking off with the
> answer I paid for?
>
> This. The claim is signed, and this check derives the account id back out of the public key. You
> cannot claim a payment you didn't make.

**Check 6, `transfer_landed_on_chain`:**

> And this is the seller doing the work itself — pulling the interaction, decoding the calldata,
> checking sender and recipient and amount.
>
> That's the cost of having no middleman. There's nobody to ask, so you look it up yourself.

**Optional — run it:**

```bash
npm run attack-test
```

> Eleven forged payments. Every one rejected, and rejected for the *right* reason — plus one honest
> payment that has to be accepted, because a verifier that refuses everything would otherwise look
> perfect.

## `pricing.ts` + `worth.ts`

**Both files.**

> These two are why I'm comfortable calling both of these agents. The desk decides what to charge.
> The buyer decides whether to pay it. Both of those are model calls.
>
> But look very carefully at what the model is **not** allowed to touch.

**Point at the clamp in `pricing.ts`, then `SOFT_LIMIT` in `worth.ts`.**

> The price bounds are arithmetic. The buyer's hard ceiling is checked *before* the model is even
> asked — and that matters, because the seller's justification for its price goes straight into the
> buyer's prompt. That's untrusted text written by the counterparty.
>
> A model can be talked into things. That's a wonderful property when you're choosing what to buy
> and a disqualifying one when you're guarding a wallet.
>
> And nothing about whether a payment is *valid* goes near a model at all. That's all arithmetic and
> signatures.

---

# Act 4 · What's missing — 8 minutes

## The demo that argues for session 8

> So the buyer has a spending limit. Refuses anything over six.
>
> Let me show you exactly what that's worth.

**Terminal:**

```bash
MAX_PRICE_PER_ANSWER=999999 npm run ask -- "should i be worried about a crash"
```

**Then open `worth.ts` and point at the top line.**

```ts
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");
```

> I didn't touch the code. I set an environment variable, and the limit is gone.
>
> Now — it still won't pay something ridiculous, because there's a second opinion: the model's own
> read on whether a markup is reasonable. But look where *that* lives. Same process. It's a prompt I
> wrote, in a file I control.

**Beat.**

> That's the point. Every guardrail in this demo is self-imposed. A number the agent set for itself,
> and a model it asks for a second opinion. Both of them are code that whoever runs the agent can
> change, delete, or reword.

**Point at the right-hand card.**

> And it's worse than that, in a way people don't expect.
>
> That limit is *per purchase*. Nothing anywhere tracks the total. An agent with a six-unit limit
> and a ninety-nine-thousand balance can spend every last unit of it — six at a time — without
> violating its limit once. Every individual purchase is compliant. The wallet still empties.

**Beat.**

> Nothing on the chain caps this wallet. It spent three today because it decided to.
>
> An agent promising not to overspend is not the same thing as an agent that **cannot**.

## Slide 7 — three questions

> Which brings us back to the three questions, and the honest scorecard.
>
> **Who am I paying?** Answered. The registry, checked before any money moves.
>
> **What am I allowed to spend?** Not answered. That's session eight — a cap the chain enforces,
> that the agent can't lift by editing a variable, because it doesn't own that authority. It
> inherits it.
>
> **What happens if they don't deliver?** Also not answered. Right now it's pay and hope. Session
> nine makes it pay-on-delivery, using MOI's native lockup and release.

## Slide 8 — close

> Everything you just watched settled on MOI devnet. Those interaction hashes are real; go and look
> them up. The repo's linked, and one funded wallet runs the whole thing.
>
> And the thing I want you to walk away with isn't the payment. Moving money is the easy part.
>
> It's the check that happens in the second before the money moves — and the fact that an agent can
> only make that check because there's a chain it can go and ask.
>
> Next time: what happens when it isn't allowed to spend it in the first place.

---

## Say these precisely

Every one is checked against the code. These are where a technical room catches you.

- **"Nobody holds your money."** On MOI only the owner can move their own funds, so escrow-style
  settlement isn't on the table in V1. It's a property of the chain, not a choice we made.
- **The seller sets its price. It does not decline.** Refusing a sale isn't implemented — don't
  claim it. What it does is price per request, within bounds it enforces itself.
- **The check takes about a second, not half a second.** Measured. If you want the number, use
  "about a second"; if you don't, say "before the money moves" and leave it.
- **Don't call this x402.** It isn't. The x402 build is on a branch and does the same demo.
- **Say "scan", not "search".** Discovery is an O(n) client-side scan over the agents this wallet
  registered.
- **The probabilities are invented.** Say it before anyone asks.
- **Don't claim the model chose** unless `decided by` shows a model name. Keyless it prints
  `local-fallback` and someone will read it off the screen.

## Questions you'll get

**"What if the seller takes the money and delivers nothing?"**
You lose it. Same as cash across a counter. Session 9 makes the payment conditional on delivery
using lockup and release. Don't dress it up.

**"Are these really two separate agents?"**
Two wallets, two on-chain identities, two independent decisions. But one machine and one mnemonic
today — same operator, two accounts. The chain doesn't know or care, and the transfer between them
is real either way.

**"Why not x402?"**
Built that first; it's on a branch. It buys interoperability — any x402 client could pay this
seller. It costs about twice the code and a second service to run. The identity check, which is the
actual point, is identical in both.

**"What stops someone replaying a payment?"**
The transfer hash is burned once it's bought something. Honest caveat: that set is in memory, so
restarting the seller resets it. A real seller persists it.

**"Is the seller's product real?"**
No. It's a stub — invented numbers with a disclaimer on every response. The payment machinery
around it is real, and that's the part that doesn't change when you put a genuine model behind it.
