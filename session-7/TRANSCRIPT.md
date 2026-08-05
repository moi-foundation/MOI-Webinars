# Session 7 — script

**The speaker notes in [deck/MOI_Builders_S7-new.pptx](./deck/MOI_Builders_S7-new.pptx) are the
canonical script.** Read them in presenter view; this file only keeps what doesn't fit in notes.

Flow (7 slides): title → the two agents + the flow in one breath → live demo (cards ~6s apart,
1–2 sentences each) → code at full depth (registry + identity check, payment + delivery) →
self-imposed guardrails → tease sessions 8 and 9 → close.

## Say these precisely

- **Nobody holds your money.** On MOI only the owner can move their own funds — a property of the
  chain, not a choice.
- **The seller prices per request. It does not decline** — refusing isn't implemented.
- **The identity check takes about a second** (measured ~1.1s), and it runs **before** the money
  moves. The ordering is the point.
- **The probabilities are invented.** Say it before anyone asks.
- Say **"scan"**, not "search" — discovery is an O(n) client-side scan.
- Don't call this x402 — that build lives on `claude/agent-payments-moi-x402`.

## Likely questions

**Seller doesn't deliver?** You lose it. Session 9 makes payment conditional on delivery.

**Really two agents?** Two wallets, two on-chain identities, two independent decisions — one
machine and one mnemonic today. The chain doesn't care; the transfer is real either way.

**Why not x402?** Built first, on a branch. Buys interoperability, costs ~2x the code and a second
service. The identity check is identical in both.

**Replay?** The transfer hash is burned after one use — in memory, so a seller restart resets it.

**Is the product real?** No — invented numbers, disclaimed on every response. The payment
machinery is the real part.
