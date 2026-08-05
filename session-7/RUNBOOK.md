# Session 7 — how to run it, and how to run the session

Two parts: getting the demo working on your machine, and the 45 minutes on the day.

---

## Part 1 — Get it running

### One funded wallet

**There is no offline mode — every run settles on devnet.** Do this at least once before the
session; it has never been run end to end with real funds.

```bash
cp .env.example .env
# put a funded devnet mnemonic in USER_MNEMONIC
# fund it at https://voyage.moi.technology  (path m/44'/6174'/7020'/0/0)

npm run verify-sdk        # 63 checks against live devnet. Do this first.
npm run setup:asset       # creates the MAS0 asset, gives the buyer a float
npm run setup:registry    # registers both agents on chain
npm run demo              # the real thing — a real interaction hash at the end
npm run demo -- --tamper  # the attack; restores the registry entry afterwards
npm run attack-test       # 11 forged payments (costs ~6 base units of real transfers)
```

Only the buyer needs funding. The seller only ever receives, so it never needs gas.

**If something fails**, it'll almost certainly be one of these, in this order of likelihood:
`setup:registry` (inline data-URI card — untested against the live contract), then the
facilitator's transfer check (decoding a real transfer for the first time), then `setup:asset`.
There is no fallback, so leave time to fix it.

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
- [ ] `--tamper` run once so you know what it looks like

### Shape of the session

| | Minutes | What |
| --- | --- | --- |
| 1 | 0–5 | **Why** — agents can find each other but can't pay each other (slides 2–3) |
| 2 | 5–12 | **What x402 is** — four messages, the facilitator is the seam (slides 4–6) |
| 3 | 12–20 | **Live demo** — happy path, narrated |
| 4 | 20–28 | **The code** — discovery, the 402, the identity check (slides 7–9) |
| 5 | 28–34 | **Live demo** — `--tamper`. The agent refuses. |
| 6 | 34–40 | **How it settles** — referee not cashier (slide 10) |
| 7 | 40–45 | **What's next + go run it** (slides 11–12), Q&A |

### The one moment that matters

Everything else is setup for **step 6 of the demo** — the identity check. Slow down there.

> "That `payTo` is 32 bytes. It doesn't tell you *whose* address it is. So the agent goes back to
> the registry and asks. That's the question x402 can't ask, and it's the reason this runs on MOI."

Then run `--tamper` and let them watch it refuse. That lands harder than any green tick.

### Things to say precisely

Each of these is checked against the code. Getting them wrong is the only way to lose a technical
audience.

- **"The facilitator signs nothing."** It's a referee, not a cashier. On MOI only the owner can
  move their own funds, so the buyer pays itself and the facilitator confirms by reading the chain.
  That's an honest divergence from x402 elsewhere — and a more interesting point than hiding it.
- **Don't claim budgets or spend limits.** Nothing in session 7 constrains what an agent may
  spend. That's session 8. If asked: "that's exactly next session."
- **Don't call discovery "search".** It's an O(n) client-side scan over every registered agent.
  Say "scan".
- **Don't say we forked x402.** The wire format is the spec's, and we use x402's own facilitator
  client.

### Likely questions

**"Is this really x402 if your facilitator doesn't hold funds?"**
Yes — we implement the standard facilitator API and the seller talks to it with x402's own client
library, unmodified. What differs is that MAS0 has no EIP-3009 equivalent, so nobody can move your
funds but you. Full answer in `FACILITATOR-NOTE.md`.

**"What stops the agent spending everything?"**
Nothing, in this session. That's session 8 — a cap the chain enforces.

**"What if the seller takes the money and doesn't deliver?"**
Nothing, in this session — it's fire-and-forget, same as x402's `exact` scheme. Session 9 makes it
pay-on-delivery using MOI's native lockup/release.

**"Why not just use the x402 npm packages?"**
Two of the three hard-fail on any chain outside their EVM/SVM allow-list — `x402-express` throws,
`x402-fetch` rejects the 402 body before it signs. We reuse the facilitator client and
reimplemented ~200 lines. Details in `SDK_NOTES.md`.

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
npm run attack-test                   # 11 forgeries
npm run verify-sdk                    # SDK claims still true?
```

Docs: [EXPLAINER](./EXPLAINER.md) plain English · [SPEC](./SPEC.md) how it works ·
[VIDEO](./VIDEO.md) recording script · deck in [`deck/`](./deck)
