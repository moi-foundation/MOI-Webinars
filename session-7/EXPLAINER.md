# What this is, in plain words

## The idea

One AI agent sells something. Another AI agent buys it. No human, no signup, no API key, no
invoice — and the whole thing takes about a second.

The seller is a **Signal Desk**: it lists a set of questions about bitcoin, and for a fraction of a
cent it will sell you its probability for any of them.

The buyer is a **Risk Agent**: it has a question, works out which market answers it, pays, and reads
the number.

(The probabilities are placeholders — there is no model behind them. Every response says so.)

## How the payment works

There's an old, almost-never-used HTTP status code: **402 Payment Required**. We finally use it.
The conversation is four messages:

1. Buyer asks for the data.
2. Seller replies **402** — *"pay me this much, at this address."*
3. Buyer pays, then asks again with proof of payment attached.
4. Seller returns the data plus a receipt.

That's it. No accounts, no relationship. Two strangers transact once and move on.

## Where MOI comes in

That exchange tells you *how much* to pay and *what address* to send it to. It does not tell you
**who that address belongs to**, and it has no opinion on whether an agent should be spending at
all. No payment protocol does — that is not what they are for.

MOI answers both.

**Who is this?** Every agent is registered on MOI with a wallet address. Before paying, the buyer
looks the seller up on-chain and checks: *is the address in this quote actually the seller's
registered address?* If not, it refuses. An attacker who swaps the address gets caught.

**Should this agent be spending?** That one is session 8 — agents get a spending cap the chain
itself enforces. This session deliberately stops at identity, so there's one idea to take away
rather than three.

## The one honest wrinkle

On most chains, a middleman can move the buyer's money for them — you sign a permission slip and
someone else submits the transaction and pays the gas. On MOI, only you can move your own funds.

So there is no middleman here. The buyer pays directly, then hands the seller the transaction's ID.
The seller looks that transaction up on the chain and confirms it: right amount, right recipient,
really sent by whoever is claiming it, and not already spent on something else.

Nobody holds anybody's money at any point. There is also nothing protecting the buyer if the seller
takes the payment and delivers nothing — that's session 9.

## Try it

Fund one devnet wallet at <https://voyage.moi.technology>, then:

```bash
cd session-7 && npm install
cp .env.example .env          # paste the mnemonic
npm run setup:asset              # mint the payment asset
npm run setup:registry           # register both agents on chain
npm run demo
```

Then watch it refuse to be defrauded:

```bash
npm run demo -- --tamper         # someone swaps the seller's address
```

Everything settles on MOI devnet for real — the receipt carries an interaction hash you can look
up. Only the buyer needs funding; the seller just receives.

## Why it matters

You cannot put a human in the loop on a $0.001 purchase — the approval costs more than the thing.
If software is going to buy from software, it needs a way to pay that's fast, cheap, and doesn't
require the two parties to have ever met.

The payment is the easy half. MOI is the part that makes it safe to pay a *stranger*.

---

More depth: [REVIEW.md](./REVIEW.md) (what to check) · [README.md](./README.md) (how to run it)

There is also an **x402** version of this same demo on the `claude/agent-payments-moi-x402` branch.
It speaks a public standard, so anyone's agent could pay this seller — at the cost of about twice
the code and a second service to run. This one is the small version.
