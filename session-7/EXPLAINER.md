# What this is, in plain words

## The idea

One AI agent sells something. Another AI agent buys it. No human, no signup, no API key, no
invoice — and the whole thing takes about a second.

The seller is a **Bookseller**: it has a catalog, and for a fraction of a cent it will give you a
real summary of any book in it.

The buyer is a **Reader**: it has a question, works out which book answers it, pays, and reads.

## How the payment works

There's an old, almost-never-used HTTP status code: **402 Payment Required**. A protocol called
**x402** finally uses it. The conversation is four messages:

1. Buyer asks for the data.
2. Seller replies **402** — *"pay me this much, at this address."*
3. Buyer pays, then asks again with proof of payment attached.
4. Seller returns the data plus a receipt.

That's it. No accounts, no relationship. Two strangers transact once and move on.

## Where MOI comes in

x402 tells you *how much* to pay and *what address* to send it to. It does not tell you **who that
address belongs to**, and it has no opinion on whether an agent should be spending at all.

MOI answers both.

**Who is this?** Every agent is registered on MOI with a wallet address. Before paying, the buyer
looks the seller up on-chain and checks: *is the address in this invoice actually the seller's
registered address?* If not, it refuses. An attacker who swaps the address gets caught.

**Should this agent be spending?** That one is session 8 — agents get a spending cap the chain
itself enforces. This session deliberately stops at identity, so there's one idea to take away
rather than three.

## The one honest wrinkle

On most chains, a middleman ("facilitator") can move the buyer's money for them. On MOI, only you
can move your own funds. So here the buyer pays **itself**, directly, and the facilitator's job is
to *check the chain* and confirm the payment really happened.

It's a referee, not a cashier. It signs nothing.

## Try it

Fund one devnet wallet at <https://voyage.moi.technology>, then:

```bash
cd session-7 && pnpm install
cp .env.example .env          # paste the mnemonic
pnpm setup:asset              # mint the payment asset
pnpm setup:registry           # register both agents on chain
pnpm demo
```

Then watch it refuse to be defrauded:

```bash
pnpm demo -- --tamper         # someone swaps the seller's address
```

Everything settles on MOI devnet for real — the receipt carries an interaction hash you can look
up. Only the buyer needs funding; the seller just receives.

## Why it matters

You cannot put a human in the loop on a $0.001 purchase — the approval costs more than the thing.
If software is going to buy from software, it needs a way to pay that's fast, cheap, and doesn't
require the two parties to have ever met.

x402 is the paying part. MOI is the part that makes it safe to pay a stranger.

---

More depth: [REVIEW.md](./REVIEW.md) (what to check) · [README.md](./README.md) (how to run it) ·
[SDK_NOTES.md](./SDK_NOTES.md) (what was verified)
