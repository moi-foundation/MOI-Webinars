# Session 7 — how to run it, and how to run the session

Two parts: getting the demo working on your machine, and the 45 minutes on the day.

For the live choreography — which file to open when, what to point at in the output, and what to do
when it breaks — see [DEMO-PLAN.md](./DEMO-PLAN.md).

---

## Part 1 — Get it running

### One funded wallet

**There is no offline mode — every run settles on devnet.** Do this at least once before the
session, on the machine you will present from.

```bash
cp .env.example .env
# put a funded devnet mnemonic in USER_MNEMONIC
# fund it at https://voyage.moi.technology  (path m/44'/6174'/7020'/0/0)

npm run verify-sdk        # 63 checks against live devnet. Do this first.
npm run setup:asset       # creates the MAS0 asset, gives the buyer a float
npm run setup:registry    # registers both agents on chain
npm run demo              # the real thing — a real interaction hash at the end
npm run demo -- --tamper  # the attack; restores the registry entry afterwards
npm run attack-test       # 11 forged payments (costs ~12 base units of real transfers)
```

Only the buyer needs funding. The seller only ever receives, so it never needs gas.

All four have been run green against devnet, so a failure here is more likely an environment
problem than a code one — an unfunded wallet, a stale `SETTLEMENT_ASSET_ID`, or devnet being down.
There is no offline fallback, so leave time.

### Pacing for a live audience

The demo finishes in 1.2 seconds, which is unwatchable. Slow it down:

```bash
DEMO_PAUSE_MS=1200 npm run demo
```

~25 seconds, enough to narrate. Set `0` for the "and here it is at full speed" beat.

---

## Part 2 — Running the session

### Before you start

- [ ] `npm run demo` green **against devnet** on the machine you'll present from
- [ ] buyer wallet funded, and holding enough USDM for several runs
- [ ] terminal at 18–20pt, dark theme, ~100 columns
- [ ] scrollback cleared
- [ ] no `.env`, mnemonic or API key visible on screen — check your prompt and window title
- [ ] deck open (`deck/MOI_Builders_S7.pptx`, presenter view), demo in a second window
- [ ] `--tamper` run once so you know what it looks like (it self-restores, so rerun freely)

### Shape of the session

| | Minutes | What |
| --- | --- | --- |
| 1 | 0–5 | **Why** — agents can find each other but can't pay each other (slides 2–3) |
| 2 | 5–12 | **How the payment works** — 402, quote, pay, prove (slides 4–6) |
| 3 | 12–20 | **Live demo** — happy path, narrated |
| 4 | 20–28 | **The code** — discovery, the 402, the identity check (slides 7–9) |
| 5 | 28–34 | **Live demo** — `--tamper`. The agent refuses. |
| 6 | 34–40 | **How it settles** — nobody holds your money (slide 10) |
| 7 | 40–45 | **What's next + go run it** (slides 11–12), Q&A |

### The one moment that matters

Everything else is setup for **step 7 of the demo** — the identity check. Slow down there.

> "That `payTo` is 32 bytes. It doesn't tell you *whose* address it is. So the agent goes back to
> the registry and asks. No payment protocol can answer that, and it's the reason this runs on MOI."

Then run `--tamper` and let them watch it refuse. That lands harder than any green tick.

### Things to say precisely

Each of these is checked against the code. Getting them wrong is the only way to lose a technical
audience.

- **"Nobody holds your money."** On MOI only the owner can move their own funds, so the buyer pays
  directly and the seller confirms it by reading the chain. No escrow, no custody, no middleman.
  That's a real constraint of the chain, not a shortcut — say it plainly.
- **Don't claim budgets or spend limits.** Nothing in session 7 constrains what an agent may
  spend. That's session 8. If asked: "that's exactly next session."
- **Don't call discovery "search".** It's an O(n) client-side scan over every registered agent.
  Say "scan".
- **Don't call this x402.** It isn't. The x402 version is on a branch and does the same demo; this
  is the small one. Don't claim a standard you're not speaking.

### Likely questions

**"Why not x402?"**
We built that first — it's on the `claude/agent-payments-moi-x402` branch and it works. It buys
interoperability: any x402 client could pay this seller. It costs about twice the code and a second
service to run. For teaching one idea, this is the version you can read in a sitting. The identity
check, which is the actual point, is identical in both.

**"Could a facilitator work on MOI?"**
Only as a referee. MAS0 has no EIP-3009 equivalent, so nobody can move your funds but you — a
facilitator could confirm a payment but never relay one. Since the seller can confirm for itself,
there was nothing left for it to do.

**"What stops the agent spending everything?"**
Nothing, in this session. That's session 8 — a cap the chain enforces.

**"What if the seller takes the money and doesn't deliver?"**
Nothing, in this session — it's fire-and-forget. Session 9 makes it pay-on-delivery using MOI's
native lockup/release.

**"What stops someone reusing a payment?"**
Two things. The transfer hash is burned once it has bought something, so it can't buy twice. And the
proof is signed — transfers are public, so without that signature anyone watching the chain could
claim a stranger's transfer and collect the goods it paid for.

### Afterwards

- Publish the blog the same day — aha first, then the how-to, with backlinks to `js-moi-sdk`, the
  agent registry SDK, and the native assets docs.
- Point people at the repo. Note they'll need a funded devnet wallet — the faucet is at
  voyage.moi.technology and one wallet covers it.

---

## Cheat sheet

```bash
npm run demo                          # happy path
DEMO_PAUSE_MS=1200 npm run demo       # slowed for presenting
npm run demo -- --tamper              # it refuses
npm run attack-test                   # 11 forgeries (~12 base units)
npm run verify-sdk                    # SDK claims still true?
```

Docs: [EXPLAINER](./EXPLAINER.md) plain English · [SPEC](./SPEC.md) how it works ·
[VIDEO](./VIDEO.md) recording script · deck in [`deck/`](./deck)
