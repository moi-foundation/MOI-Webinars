# Session 7 — live demo plan

Show code → run it → read the output. Three loops of that, each one idea.

Schedule and talking points: [RUNBOOK.md](./RUNBOOK.md). This file is only the live choreography.

---

## Before you start

Two windows. **Editor** on the left, **terminal** on the right, both visible at once — you will be
pointing from one to the other constantly and alt-tabbing kills that.

```bash
cd session-7
npm install
npm run demo            # confirm green BEFORE anyone is watching
clear
```

- terminal 18–20pt, dark, ~100 columns (banners are 78 wide — narrower and they wrap)
- `export DEMO_PAUSE_MS=1200` — the demo runs in 1.2s otherwise, which is unnarratable
- no `.env` open in the editor, nothing with your mnemonic in the window title
- buyer balance ≥ ~30 base units if you plan to run `attack-test` (it spends ~12)

**Open these four tabs in the editor now**, in this order. You will move down them as the session
goes:

1. `packages/shared/src/payment-proof.ts`
2. `packages/agent-buyer/src/identity-check.ts` ← the one that matters
3. `packages/agent-seller/src/verify-proof.ts`
4. `packages/agent-buyer/src/pay.ts`

---

## Loop 1 — the whole thing works (≈8 min)

### Run first, explain after

Resist opening code here. Let them watch it work with no idea how, then earn the explanation.

```bash
npm run demo
```

~25 seconds at `DEMO_PAUSE_MS=1200`. Say almost nothing while it runs. Then scroll back to the top
and walk it.

### Read the output

| Point at | Say |
| --- | --- |
| `BUYER · step 1` → `scanned` / `agents selling signals` | "It was never given a URL. It scanned the registry and filtered on a skill tag." |
| `BUYER · step 2` | "The questions are free. The answers are not. That's the seam the paywall sits on." |
| `BUYER · step 3` → `decided by` | "It picked the drawdown market for the question. That choice is the agent's." — **only if `GROQ_API_KEY` is set.** If it says `local-fallback`, say "keyword match today; the LLM path is a key away" and move on. Don't claim a brain you're not running. |
| `SELLER · step 5` | "HTTP 402 — Payment Required. Reserved in 1997, basically unused until agents needed it." |
| `BUYER · step 7` → `ix hash` | "That's a real interaction on devnet. The buyer moved its own money — on MOI nobody can move it for you." |
| `SELLER · step 9`, the seven ticks | "The seller checked this itself. All seven are reads. Nobody was trusted." |
| the closing box | "About a second. No human, no account, no API key." |

### The line to land

> "Two strangers just transacted. Neither of them had ever heard of the other before this ran."

If anyone asks about the numbers: **they are placeholders.** There is no model. Every response
carries a `disclaimer` field saying so — point at it rather than letting someone assume otherwise.

---

## Optional opener — let the room drive it

If you want the "agentic" idea to land before any code, take a question from the audience:

```bash
npm run ask
```

Type what someone shouts out. The agent finds a seller it was never told about, checks who they
are, pays, and answers — and the balance line drops by 1 each time.

⚠️ **Only do this with `GROQ_API_KEY` set.** Without it the agent matches keywords, and a vague
question like *"get me the best btc prices"* falls through to `no strong match; defaulting to
btc-100k-2026` — it buys the first market on the list. On screen. From a question someone in the
room just gave you.

---

## Loop 2 — the part that only works on MOI (≈12 min) ← **the session**

Everything so far is setup for this. Slow down.

### Show the code

Open **`identity-check.ts`**. The whole file is 39 lines — put it on screen at once, don't scroll.

Point at exactly one line:

```ts
if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo)) {
```

> "The seller said *pay me at this address*. That address is 32 bytes. It tells you **where** to
> send money — it doesn't tell you **whose** address it is.
>
> So before paying, the agent goes back to the registry and asks: is this actually the Signal Desk's
> registered wallet? Nothing in a payment protocol can answer that. It needs an identity that lives
> somewhere both parties can check, and that's the chain."

Then scroll up 8 lines to `approve()` in `pay.ts` and make the timing point:

> "This runs **before** the transfer. Not after. There's no escrow here and nothing to claw back —
> once it's sent, it's sent. So every question worth asking gets asked here."

### Run the attack

```bash
npm run demo -- --tamper
```

> "I've repointed the seller's registry entry at an attacker — as if someone compromised the
> listing. The seller still asks to be paid at its real address. Watch what the buyer does."

### Read the output

Three things, in order:

1. `DEMO · 1b` — the registry now says `0xdededede…`
2. `BUYER · step 6` — red ✗, `registry says` vs `quote says` side by side
3. **It stops at step 6.** There is no step 7.

> "It never reached the payment. **Money moved: none.** And notice it's the buyer that caught this
> — not the seller, not a middleman. The party with something to lose is the one that checks."

Let the silence sit before moving on. This is the beat people remember.

---

## Loop 3 — why you should believe any of it (≈8 min)

A green happy path proves nothing — a verifier that accepts everything also goes green.

### Show the code

Open **`verify-proof.ts`**. Don't read all seven. Show two:

**Check 3, `key_binds_to_payer`** — and explain why it isn't redundant:

> "Transfers are public. Anyone can watch the chain and see that transfer land. So what stops
> someone else quoting *my* transaction hash and collecting the estimate I paid for?
>
> The proof is signed, and this check derives the participant ID back out of the public key. You
> can't claim a payment you didn't make."

**Check 6, `transfer_landed_on_chain`** — and what it costs:

> "The seller doesn't take the buyer's word that it paid. It reads the interaction off the chain and
> decodes it: right sender, right recipient, right amount. That's the price of not having a
> middleman — the seller has to do this itself."

### Run the suite

```bash
npm run attack-test
```

⚠️ **This makes ~11 real transfers and is slow — budget a few minutes.** Start it, then keep
talking over it; don't stand in silence watching a spinner. If you're tight on time, skip it and
show a screenshot instead.

### Read the output

Don't read all twelve lines aloud. Pick three:

| Line | Say |
| --- | --- |
| `control: an honest payment IS accepted` | "This one has to pass, or the suite proves nothing." |
| `underpayment → quote_mismatch` | "Signed honestly, for less than asked." |
| `replayed payment → already_spent` | "One transfer buys one thing." |

> "Eleven forgeries, each rejected for the *right* reason — not just rejected."

---

## If it breaks

| Symptom | Do this |
| --- | --- |
| **Happy path refuses at step 6** | You Ctrl-C'd a `--tamper` run and the registry is still pointed at the attacker. Run `npm run demo -- --tamper` again and **let it finish** — it restores on the way out. |
| `SETTLEMENT_ASSET_ID is not set` | `npm run setup:asset` |
| `agents are not registered` | `npm run setup:registry` |
| Devnet unreachable | There is no offline mode. Go to the recording. |
| `attack-test` says balance too low | `npm run setup:asset` tops the buyer up |

**Record a clean run of all three before the session and have it one keystroke away.** There is no
mock mode — if devnet is down during your slot, the video is the whole contingency.

---

## Things to say precisely

- **"Nobody holds your money."** Not a design choice — on MOI only the owner can move their own
  funds, so escrow-style settlement isn't available. The buyer pays, the seller confirms by reading.
- **Don't call this x402.** It isn't. If asked: the x402 version is on a branch, does the same demo,
  buys interoperability, costs twice the code. Both have the identical identity check.
- **Don't say "search".** Registry discovery is an O(n) client-side scan.
- **Don't claim budgets or spend limits.** Nothing here constrains what the agent may spend. That's
  session 8 — and it's a good answer to the question, not a dodge.
- **Don't claim the LLM picked the market** unless `GROQ_API_KEY` is set. The terminal prints
  `local-fallback` and someone will read it.

## The three sentences

If you only land three things:

1. Two agents transacted with no human, no account and no prior relationship.
2. Before paying, the buyer asked the chain **who** it was paying — and refused when the answer was
   wrong.
3. Nobody held anybody's money at any point.
