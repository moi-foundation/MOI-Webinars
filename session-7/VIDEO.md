# Launch video — script & shot list

Target: **~3:30**, screen recording + voiceover. One idea, one demo, one refusal.

Companion blog is mandatory (video without text doesn't get indexed). See §6.

---

## 1. Before you record

```bash
cd session-7
pnpm install
pnpm demo          # confirm it's green
```

**Terminal setup**

| Setting | Value | Why |
| --- | --- | --- |
| Font size | 18–20pt | readable on a phone |
| Window | ~100 cols × 45 rows | banners are 78 wide; no wrapping |
| Theme | dark, high contrast | the colour-coded actors must be distinguishable |
| Clear scrollback | before each take | no stale output on screen |

**Pacing.** The demo runs in 1.2s — unwatchable. Record with:

```bash
DEMO_PAUSE_MS=1200 pnpm demo
```

That stretches it to ~25s, enough to narrate live. Use `1500` if you speak slowly. `0` (default)
is the real speed — worth showing once at the end as a "and here it is at full speed" beat.

**Record against devnet.** There is no offline mode, so make sure setup has been run and the buyer is funded before you hit record. The receipt at the end carries a real interaction hash — worth showing.

---

## 2. Shot list

### Shot 1 — Cold open (0:00–0:20)

**Screen:** blank terminal, cursor blinking.

> "Two AI agents. One sells book summaries. The other needs one.
> No signup, no API key, no human. Watch them do business."

Type the command, don't run it yet:

```bash
pnpm demo
```

---

### Shot 2 — The two agents (0:20–0:45)

**Screen:** `DEMO · 1` and the two `boot` banners.

> "Both agents are registered on MOI. Each has an on-chain identity and a wallet.
> Note the facilitator — it says *referee, not custodian*, and *signs nothing*. Hold that thought."

**Point at:** `seller wallet`, `buyer wallet`, `signs anything? no — all checks are read-only`.

---

### Shot 3 — Discovery (0:45–1:05)

**Screen:** `BUYER · step 1` and `step 2`.

> "The buyer wasn't given a URL. It asked the MOI registry: *who sells books?* — got back an agent
> id, a wallet and an address. Then it reads the catalog, which is free. Discovery should never
> cost money."

**Point at:** `seller resolved on chain — we were never handed a URL`.

---

### Shot 4 — The decision (1:05–1:20)

**Screen:** `BUYER · step 3`.

> "It has a question — *how do people justify holding power?* — and picks The Prince. That choice
> is the agent's, not mine."

---

### Shot 5 — 402 (1:20–1:40)

**Screen:** `BUYER · step 4` → `SELLER · step 5`.

> "It asks for the book and gets HTTP 402 — Payment Required. A status code reserved in 1997 and
> essentially unused until now. The reply says what to pay, in what asset, and to which address."

**Point at:** the `402 Payment Required` banner, `price`, `payTo`.

---

### Shot 6 — THE BEAT (1:40–2:05) ← the one that matters

**Screen:** `BUYER · step 6`.

> "Here's the part x402 can't do on its own. That `payTo` is just 32 bytes — it doesn't tell you
> *whose* address it is. So the buyer goes back to the registry and checks: is this really the
> bookseller's registered wallet? It matches, so it pays."

**Point at:** `payTo matches registry wallet`.

Slow down here. This is the whole video.

---

### Shot 7 — Payment (2:05–2:30)

**Screen:** `step 7` → `step 8` → `FACILITATOR step 10/11`.

> "The buyer moves its own funds — on MOI only the owner can — then signs an authorization naming
> that transaction, and retries with the payment attached.
> The facilitator runs nine checks. All read-only. It confirms the transfer landed by reading the
> chain, not by trusting anybody."

**Point at:** the nine green ticks, then `CONFIRMED on chain`.

---

### Shot 8 — Delivered (2:30–2:45)

**Screen:** the summary JSON + the closing box.

> "Payment confirmed. Book delivered. About a second, start to finish, and no human touched it."

---

### Shot 9 — The refusal (2:45–3:15)

**Screen:** clear, then run:

```bash
pnpm demo -- --tamper
```

> "Now let's attack it. I've repointed the seller's registry entry at an attacker's address —
> as if someone compromised the listing."

**Screen:** the red `payTo does NOT match` and `Agent refused`.

> "The buyer noticed and walked away. No money moved. That check is only possible because the
> identity lives on chain."

---

### Shot 10 — Close (3:15–3:30)

> "x402 handles the payment. MOI answers *who am I paying* — and that's what makes it safe to pay
> a stranger.
> This is part one of three. Next: what an agent is *allowed* to spend.
> Code and full write-up in the description."

**Screen:** repo URL / blog link.

---

## 3. Optional inserts

Cut these if you're over time.

| Insert | When | Line |
| --- | --- | --- |
| `pnpm attack-test` | after Shot 9 | "Eleven forged payments, all rejected, each for the right reason." |
| Full-speed rerun | before Shot 10 | "That was slowed down. Here it is at real speed." (`DEMO_PAUSE_MS=0`) |
| `verify-sdk` | never in the launch cut | too dry — save it for the dev talk |

---

## 4. Recording checklist

- [ ] `pnpm demo` green before you hit record
- [ ] scrollback cleared
- [ ] font ≥18pt, dark theme
- [ ] `DEMO_PAUSE_MS=1200` exported
- [ ] no `.env`, no mnemonic, no API key visible on screen at any point
- [ ] window title / prompt doesn't leak a private path
- [ ] one clean take of `--tamper` (it self-restores, so you can rerun freely)

---

## 5. Say these out loud — non-negotiable

Accuracy beats polish. Each of these has been checked against the code:

- **"The facilitator signs nothing."** It's a referee, not a cashier — an honest divergence from
  x402 on other chains, and a more interesting point than glossing it.
- **Do not claim budgets, permissions or spend limits.** Nothing in session 7 constrains what the
  agent may spend. That's part two.
- **Don't call registry discovery "search".** It's an O(n) client-side scan over every registered
  agent. Fine at demo scale; say "scan", not "semantic search".
- **Don't say we forked x402.** The wire format is the spec's; we reuse x402's own facilitator
  client.

---

## 6. Companion blog

Video alone doesn't get indexed — the blog is what LLMs and search actually read.

**Structure:** aha first (*why* this matters, what it unlocks), then the how-to.

**Must include as backlinks:**
- `js-moi-sdk`
- the agent registry SDK
- native assets documentation
- session 3 (agent registry) and session 4 (native assets) in this repo

**Publish:** Markdown → moi.technology + Medium → then link from Twitter and LinkedIn. The social
post is only a hook; the crawler follows the link.

**Positioning line:** "part one of three — identity and payment. Part two gives agents on-chain
authority."
