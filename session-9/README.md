# MOI Builders #9 — Agentic Commerce (V3)

**Part 3 of 3. Not built yet — this is the plan.**

Sessions [7](../session-7) and [8](../session-8) get an agent to *find* another agent and *pay* it,
under a cap the chain enforces. What they don't have is a real transaction: no negotiation, no
availability, no delivery, no recourse.

V3 is the full purchase.

## The story

> "You find a guy who sells the book, and then you say what book you want to buy. It will go check
> with that agent whether the book is available. The book is available. Then you say, okay, I want
> to buy this book. Then — real flow — address, delivery address, and all. It will ask for payment.
> Then you make a payment to the agent."

Sessions 7 and 8 collapse that into one 402. V3 unfolds it into an actual conversation between two
agents:

```
1. DISCOVER    registry: who sells books?                    (session 7)
2. ENQUIRE     "do you have The Prince? in stock?"           <- NEW
3. QUOTE       price + availability + terms                  <- NEW
4. DETAILS     delivery address, format, deadline            <- NEW
5. AGREE       both sides commit to the same terms           <- NEW
6. PAY         x402 402 -> transfer -> confirm               (session 7)
7. DELIVER     goods against the agreed terms                <- NEW
```

## What each new step needs

| Step | The hard part | Likely answer |
| --- | --- | --- |
| Enquire / quote | a request-response protocol richer than a 402 | A2A messaging over the agent card's declared transport |
| Delivery details | the buyer hands over data it would rather not leak | scope it: only what the order needs |
| Agree | both sides must have signed the *same* terms | sign a canonical order object, exchange signatures |
| Deliver | proving the goods actually arrived | delivery receipt signed by the buyer |
| Recourse | what if payment lands and delivery doesn't | **escrow** — MOI `lockup` → `release`, proven on devnet in [session 4](../session-4) |

## Why escrow lands here and not earlier

Sessions 7 and 8 are fire-and-forget: you pay, then you find out. That is honest for a
sub-cent summary and dishonest for a real order. Once there is a delivery step, pay-on-delivery
stops being a nice-to-have.

The point worth making on stage: **the payment protocol never changes.** Same x402 handshake,
same facilitator API. Only the settlement primitive underneath gets better — from a transfer, to a
lockup released on proof of delivery.

## Open questions

1. Does the agent card's `preferredTransport` give us a usable A2A channel, or do we define the
   enquire/quote messages ourselves?
2. Who signs the delivery receipt, and what stops a buyer from withholding it?
3. `release` must be signed by the beneficiary and has **no on-chain guard** — with nothing locked
   it "succeeds" and moves zero. Any escrow here must assert balance deltas, not trust the
   interaction. (Learned in session 4; documented in session 7's SDK_NOTES.)

## Status

Plan only. Nothing here is implemented. Scope it properly once session 8 has run on devnet.
