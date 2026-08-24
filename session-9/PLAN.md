# Session 9 — Plan

**Working title:** Speaking a standard so strangers can pay you.

Sessions 7 and 8 built something that works — for exactly two agents that already know each
other's shape. Session 9 opens the door.

> Our two agents speak a wire format we invented. That is fine for two agents that know each
> other. It is useless for an open market.

---

## 1. What x402 is, and what it is for here

[x402](https://x402.org) revives HTTP `402 Payment Required` as a real protocol: a server answers
402 with a machine-readable description of what it wants, the client pays, retries with a payment
header, and gets the resource. It is the same shape session 7 arrived at independently.

The value is **legibility**. A client that has never heard of MOI can parse our 402 and understand
what is being asked, because the envelope is standard.

---

## 2. The constraint that shapes everything

Two findings from the earlier build, both load-bearing.

### The npm packages cannot be used

`x402-express` and `x402-fetch` zod-validate the 402 body against **closed enums** for `network`
and `scheme`. Neither can express a MOI network id or a MOI participant identifier — a 32-byte
value that is not an EVM address. They throw before any of our code runs.

Only `useFacilitator` from the core `x402` package survives, because it performs no runtime
validation and is a plain HTTP client.

**So session 9 implements the x402 shape by hand.** That is a build decision, not a footnote.

### MOI has no detached-authorization signing

x402's canonical flow is: sign a payment *authorization*, hand it over, someone else submits it.
MOI signs whole interactions or nothing. There is no detached authorization to hand anyone.

**So our settlement stays session 7's:** pay first from your own account, then prove it. We
declare that as our own `scheme` inside the standard envelope.

---

## 3. The design: standard envelope, native settlement

| Layer | Whose | Session 9 |
| --- | --- | --- |
| Status code + flow | x402 | unchanged — 402, pay, retry with header |
| 402 body shape | x402 | adopt field-for-field |
| Payment header | x402 | adopt the header name and encoding |
| `scheme` | **ours** | a MOI-native scheme: pay-then-prove |
| Settlement | **ours** | MAS0 `transferFrom` under session 8's allowance |
| Identity | **ours** | session 7's registry check, unchanged |

**The honest claim, and the exact words to use:**

> Any x402 client can **read** our invoice. Only a client that implements our scheme can **pay**
> it.

That is real interoperability at the discovery and negotiation layer, and it is not drop-in
payment compatibility. Do not let the copy blur the two. The blur is the standard failure mode of
"we support X" claims, and it is what this session should be honest about.

---

## 4. What carries forward untouched

- **Session 7's identity check.** x402 tells you *where* to pay. It still has no opinion on
  *whose* address that is. Sharper here than in session 7, because now there is a standard in the
  room that still cannot answer it.
- **Session 8's allowance.** The agent pays with `transferFrom` under the owner's cap.
- **The seller's seven checks.** Unchanged.

Session 9 adds an envelope. It removes nothing.

---

## 5. Build sequence

1. Scaffold from session 8. ✅
2. Read the real x402 types from the installed package — never from memory. ✅ (agents)
3. `x402-types.ts` — our types matching the spec field-for-field, no npm dependency.
4. Seller: emit a spec-shaped 402. Same paywall, standard envelope.
5. Buyer: parse a spec-shaped 402, pay, retry with the standard header.
6. `x402-probe.ts` — prove the claim: parse our 402 with a *generic* client that knows nothing
   about MOI, and show it extracts price, asset, payTo and scheme correctly.
7. Attack suite carried forward.
8. README, demo plan, blog.

---

## 6. The demo beat

Session 7's beat was the identity check. Session 8's was the chain refusing a spend.

**Session 9's beat is a stranger reading our invoice.** A client with no MOI code parses the 402
and prints what is owed and to whom — then fails at settlement, on purpose, because it does not
implement our scheme. Both halves are the point:

- The envelope is genuinely standard, so discovery and negotiation are open.
- Settlement is chain-specific, and pretending otherwise would be the lie.

---

## 7. Open questions

1. Does `useFacilitator` earn its place, or is it dead weight now the seller verifies itself?
   Leaning **drop it** — session 7 removed the facilitator for good reasons.
2. Register the scheme name anywhere, or keep it local?
3. Does the agent card in the registry advertise x402 support? Obvious hook, probably out of scope.
