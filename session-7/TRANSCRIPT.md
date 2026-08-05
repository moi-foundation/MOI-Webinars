# Session 7 — what to say, start to finish

Four acts: **slides → live demo → code → what's missing**. ~45 minutes.

Everything in quote blocks is speakable as written. Stage directions are in **bold**.

Companion files: [DEMO-PLAN.md](./DEMO-PLAN.md) for the mechanics, [RUNBOOK.md](./RUNBOOK.md) for the
schedule and the break-glass table.

---

# Act 1 — Slides (0:00–7:00)

## Slide: the setup — who these two agents are

**Stay on this slide until you've said all of it. Nothing to click.**

> I've got two programs running on my machine. I'm going to call them agents, and I want to be
> precise about what that means, because the word gets used loosely.
>
> The first one is a **Signal Desk**. It sells probability estimates on bitcoin — will BTC draw down
> more than 20% this quarter, will it close higher next week, that kind of thing. It has a list of
> markets it's willing to price. Two things make it an agent rather than an API: it decides what to
> charge for each answer, and it can decline.
>
> The second is a **Risk Agent**. It's the buyer. It has a question, and it doesn't know the answer.
> It decides which market answers its question, and it decides whether the price it's quoted is
> worth paying.
>
> Here's the important part: **they have never met.** No account. No API key. No contract. The buyer
> doesn't have the seller's address, doesn't have its URL, doesn't know it exists.

**Beat.**

> So the question this session is about is: how does one of them pay the other?
>
> And the hard part isn't moving the money — chains have done that for fifteen years. The hard part
> is that when you pay a stranger, a human does three things without thinking. Glances at whether
> the shop is real. Knows roughly what they're willing to spend. Assumes there's some recourse if
> nothing arrives.
>
> Take the human out and none of those happen by default. Today is the first one: **how do you know
> who you're paying?**

## Slide: what you'll see

> Four things. The buyer finds the seller through the MOI agent registry — it's given a skill, not
> an address. It gets quoted a price. It checks, on chain, whether that address really belongs to
> that agent. Then it pays, and the seller verifies the payment itself by reading the chain.
>
> Then I'll break it, and you'll watch the agent refuse.

**Switch to the browser.**

---

# Act 2 — Live demo (7:00–20:00)

**Have http://localhost:4000 open. Terminal visible in a second window if you can.**

Step numbers below match both the browser cards and the terminal banners — they were aligned so
you can switch between them mid-sentence without the numbering changing under you.

## 2.1 — The happy path

> I'm going to type what I want in plain language. I'm not naming a seller, a price, or an address.

**Type:** `should i be worried about a crash`

**Let it run. Narrate as each step appears — they arrive about a second apart.**

**Step 1 — "I don't know the answer to this"**

> First thing it does is admit it can't answer. So it goes looking for someone who can, by skill
> tag — `sells-signals`.

**Step 2 — "Found one: agent_134"**

> There it is. And notice what came back: an agent id, the wallet it registered, its service URL,
> and the skills it advertises. All of that is on chain. **I never gave it that URL.**

**Step 3 — "Here is what I sell"**

> The catalog's free. The questions are public — you only pay for the answers. That's deliberate:
> if browsing cost money, the buyer couldn't work out what it wants.

**Step 4 — "This is the one I want"**

> It picked the drawdown market. Look at `decided by` — that's the model reasoning, not a keyword
> match. The word "crash" doesn't appear anywhere in that catalog; it says "draw down".

**Step 5 — "402 Payment Required"**

> HTTP 402. It's been reserved since 1997 and essentially unused, because until now nothing needed
> to charge a machine per request.
>
> And look — the seller tells me *why* it's charging this. That price isn't in a config file
> anywhere; the desk decided it.

**Step 6 — "3 USDM — I'll pay that"**

> And the buyer decides whether that's worth it. Two agents, two decisions. If the desk had marked
> this up hard, you'd see the buyer walk.

**Step 7 — "Checked who I am paying" ← SLOW DOWN HERE**

> This is the whole session.
>
> That address in the quote is 32 bytes. It tells you **where** to send money. It does not tell you
> **whose** address it is. Any payment protocol has this problem — that's not what they're for.
>
> So before paying, the agent goes back to the registry and asks: is this actually the wallet this
> agent registered? It matches. Now it'll pay.

**Step 8 — "Paid — on chain, from my own wallet"**

> Real transfer, real interaction hash. **That's clickable — I can copy it and look it up.**

**Click the hash. Optionally paste into voyage.moi.technology.**

> And note the wording: *from my own wallet*. On MOI only the owner can move their own funds. There
> is no middleman holding money here, because there can't be.

**Step 9 — "I checked your payment myself"**

> Seven checks. The seller doesn't take the buyer's word that it paid — it reads that interaction
> off the chain and decodes it. Right sender, right recipient, right amount, not already spent.

**Step 10 — the answer appears**

> Paid, delivered. And the balance at the top just went down by three.
>
> One thing I want to say plainly: **those probabilities are made up.** There's no model behind
> them, no market data. Every response says so. This session is about the payment, not the forecast.

## 2.2 — The refusal

**Tick "Simulate a compromised listing". Ask the same question.**

> Now I've repointed the seller's registry entry at an attacker — as if someone got into the
> listing. The seller itself is unchanged; it still asks to be paid at its real address.

**Let it reach step 7.**

> It stopped. `registry says` one thing, `quote says` another, and it walked away. **Money moved:
> none** — and that's literal. It never even built a transaction.
>
> And notice *who* caught it. Not the seller, not a middleman. The party with something to lose.

**Beat. Let it sit.**

---

# Act 3 — The code (20:00–34:00)

**Switch to the editor. Four files, in this order.**

## 3.1 — `packages/shared/src/payment-proof.ts`

**Show the `Quote` and `PaymentClaim` interfaces.**

> The whole wire format is two messages. The seller sends a **Quote** — price, asset, where to pay,
> and its agent id. The buyer sends back a **Claim** — I sent this much, to you, in this
> transaction, for this thing, and here's my signature.
>
> That's it. There's no third service and no protocol negotiation.

**Point at `payToAgentId`.**

> This field is the one that matters. Without it, `payTo` is anonymous bytes.

## 3.2 — `packages/agent-buyer/src/identity-check.ts` ← the one that matters

**Whole file on screen. 42 lines. Don't scroll.**

> This is the entire idea, and it's 42 lines.

**Point at one line:**

```ts
if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo)) {
```

> Read the registered wallet off the chain. Compare it to what the invoice says. Refuse if they
> disagree.
>
> That's a question no payment protocol can answer on its own. It needs an identity that lives
> somewhere both parties can check independently — and that's what the chain is for here.

**Then point at where `approve()` is called in `pay.ts`:**

> And it runs **before** the transfer. Not after. There's no escrow in this session and nothing to
> claw back — once it's sent, it's sent. So every question worth asking gets asked here.

## 3.3 — `packages/agent-seller/src/verify-proof.ts`

**Don't read all seven. Show two.**

**Check 3, `key_binds_to_payer`:**

> Transfers are public. Anyone watching the chain can see that payment land. So what stops someone
> else quoting *my* transaction hash and collecting the answer I paid for?
>
> This. The claim is signed, and this check derives the participant id back out of the public key.
> You can't claim a payment you didn't make.

**Check 6, `transfer_landed_on_chain`:**

> And this is the seller doing the work itself — pulling the interaction off the chain, decoding the
> calldata, checking sender, recipient and amount. That's the price of having no middleman.

**Optional, if time — run it:**

```bash
npm run attack-test
```

> Eleven forged payments. Every one rejected, and rejected for the *right* reason — plus an honest
> payment that has to be accepted, otherwise a verifier that refuses everything would pass.

## 3.4 — `packages/agent-seller/src/pricing.ts` and `packages/agent-buyer/src/worth.ts`

**Both files, briefly, side by side if you can.**

> These two are why I'm comfortable calling both of these agents. The seller decides what to charge.
> The buyer decides whether that's worth paying. Both are model calls, and either can walk away.
>
> But look at what is **not** the model's to decide.

**Point at the clamp in `pricing.ts` and the `SOFT_LIMIT` check in `worth.ts`:**

> The price bounds are arithmetic. The buyer's hard ceiling is checked *before* the model is even
> asked — because the seller's justification goes straight into the buyer's prompt, and that's
> untrusted text. A model can be argued with. That's fine for choosing what to buy and
> disqualifying for guarding a wallet.
>
> And nothing about whether a payment is *valid* touches a model at all. That's all arithmetic.

---

# Act 4 — What's missing, and why that's the next session (34:00–45:00)

## 4.1 — The demo that sets up session 8

> So the buyer has a spending limit. It refuses anything over six.
>
> Let me show you what that limit is actually worth.

**In the terminal:**

```bash
MAX_PRICE_PER_ANSWER=999999 npm run ask -- "should i be worried about a crash"
```

**Then open `worth.ts` and point at the top line.**

```ts
export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? "6");
```

> I didn't touch the code. I set an environment variable and the hard limit is gone.
>
> Now — the agent still won't pay something absurd, because there's a second check: the model's own
> judgment about whether a markup is reasonable. But look at where that lives. **It's also inside
> the agent.** It's a prompt I wrote, in a file I control, in a process I'm running.

**Beat.**

> That's the whole point. Every guardrail in this demo is self-imposed. A limit the agent sets for
> itself, and a model the agent asks for a second opinion. Both of them are code that whoever runs
> the agent can change, delete, or reword.
>
> Nothing on the chain caps this wallet. That balance at the top is about ninety-nine thousand
> units, and there is no technical reason the agent couldn't send all of it in one transaction. It
> spent three because it decided to.
>
> An agent promising not to overspend is not the same as an agent that **cannot**.

## 4.2 — The three questions

> Which is really three separate questions, and today only answered the first.
>
> **Who am I paying?** Answered — the registry, checked before any money moves.
>
> **What am I allowed to spend?** Not answered. That's session eight: a cap the chain itself
> enforces, that the agent can't raise by editing a variable — because it doesn't own the authority,
> it inherits it.
>
> **What if they don't deliver?** Also not answered. Today it's fire-and-forget — pay, and hope.
> Session nine makes it pay-on-delivery using MOI's native lockup and release.

## 4.3 — Close

> Everything you saw settled on MOI devnet. The interaction hashes are real; you can look them up.
> The repo's linked, one funded wallet runs the whole thing.
>
> The payment was the easy half. What makes it safe to pay a stranger is knowing who they are — and
> next time, bounding what your agent can do on your behalf.

---

## Things to say precisely

Checked against the code. Getting these wrong is the only way to lose a technical room.

- **"Nobody holds your money."** On MOI only the owner can move their own funds, so escrow-style
  settlement isn't available in V1. Not a design preference — a property of the chain.
- **Don't call this x402.** It isn't. The x402 build is on a branch and does the same demo; this is
  the smaller one. If asked: x402 buys interoperability at about twice the code.
- **Don't say "search".** Registry discovery is an O(n) client-side scan over the agents this wallet
  registered. Say "scan".
- **The probabilities are invented.** Say it before anyone asks.
- **Don't claim the model decided** unless `decided by` shows the model name. With no key it prints
  `local-fallback` and someone will read it.
- **The seller's product is a stub, the payment machinery isn't.** If pushed: swap the invented
  number for a real model and nothing in `paywall.ts` or `verify-proof.ts` changes.

## Likely questions

**"What if the seller takes the money and doesn't deliver?"**
You lose it. Same as cash across a counter, same as x402's `exact` scheme. Session 9 makes the
payment conditional on delivery using lockup/release.

**"Are these really two separate agents?"**
Two processes' worth of code, two wallets, two on-chain identities — but one machine and one
mnemonic today. The chain doesn't know or care; the transfer between them is real either way.

**"Why not just use x402?"**
We did first — it's on a branch. It buys interoperability: any x402 client could pay this seller.
It costs about twice the code and a second service. The identity check, which is the actual point,
is identical in both.

**"What stops a replayed payment?"**
The transfer hash is burned once it's bought something. Honest caveat: that set is in memory today,
so restarting the seller resets it. A real seller persists it.
