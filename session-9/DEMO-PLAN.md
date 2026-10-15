# Session 9 — Demo Plan

**The one line:** our agents stop speaking a private language.

Sessions 7 and 8 assume both sides were written by us. This one is about the moment a stranger
shows up.

---

## Pre-flight

```bash
cd session-9
npm install
npm run preflight
npm run setup:asset
npm run setup:registry
npm run setup:authority
```

Then **two terminals**: `npm run seller` in one, everything else in the other.

---

## Beat 1 — the same purchase, a standard envelope (2 min)

```bash
npm run demo
```

Identical outcome to session 8. What changed is the shape of the conversation.

**Show the 402 body.** Point at the field names — `maxAmountRequired`, `payTo`, `asset`,
`maxTimeoutSeconds`.

> "None of these names are mine. That is the x402 spec, field for field. Last session this was a
> blob I invented."

---

## Beat 2 — THE BEAT. A stranger reads our invoice (4 min)

```bash
npm run x402:probe
```

**Say what the probe is before you run it:**

> "This script imports nothing from our code. No wallet, no chain access, no MOI anything. It is a
> generic x402 client that has never heard of us."

**First half — it reads everything.** Price, asset, payee, deadline, description. Walk the output.

> "It got all of it. Not because it knows MOI, but because the envelope is the standard's."

**Second half — it cannot pay.** The probe checks our scheme and network against x402's real
enums and finds neither.

> "And here it stops. It understands the invoice completely and cannot settle it, because
> settlement is chain-specific and it does not implement our scheme."

**The line to land:**

> **Any x402 client can read our invoice. Only a client implementing our scheme can pay it.**

Then say the uncomfortable half out loud:

> "That is what 'we support x402' usually means and rarely says. Discovery and negotiation are
> open. Settlement is not, and cannot be — a chain's rules are the chain's."

---

## Beat 3 — the field the standard has no place for (2 min)

Point at `extra.payToAgentId` in the 402 body.

> "x402 tells you where to send money. It has no opinion on whose address that is. Same gap as
> session 7 — now visible inside a standard."

Show the buyer checking it against the registry before paying.

> "A standard makes the invoice legible. It does not make the payee honest."

---

## Beat 4 — nothing was given up (1 min)

```bash
npm run attack-test
```

Twelve forged payments, each rejected for its own specific reason. Same seven checks as session 7,
same allowance from session 8.

> "New envelope. Same guarantees. Adopting a standard did not cost us the identity check or the
> spend cap — those live underneath it."

---

## Beat 5 — close the arc (1 min)

- **Session 7:** two agents transact, and the buyer checks who it is paying.
- **Session 8:** the owner sets a cap the chain enforces and the agent cannot raise.
- **Session 9:** all of it, in a format strangers can read.

> "Three sessions, three questions. Who am I paying? What is my agent allowed to spend? And can
> anyone else join? The last one needed a standard. The first two needed a chain — and no standard
> answers them, which is why MOI is underneath rather than beside."

---

## Timing

| Beat | Minutes |
| --- | --- |
| 1 — same purchase, standard envelope | 2 |
| 2 — **the probe** | 4 |
| 3 — the field x402 lacks | 2 |
| 4 — nothing given up | 1 |
| 5 — close the arc | 1 |

Beat 2 is the session. If short on time, cut 4, never 2.

---

## If it breaks on stage

| Symptom | Cause | Say |
| --- | --- | --- |
| probe: "Is the seller running?" | seller not started | `npm run seller` in the other terminal |
| `account not found` | devnet reset | "Testnet got wiped." Run `preflight`. |
| transferFrom reverts | allowance not granted or exhausted | That is beat 3 of session 8 — own it |
| refused pull shows no error | **expected**, MAS0 fails silently | Show balances, never receipts |
