# Session 4 — Account-to-Account Native Swap (Lockup + Release)

Live-demo repo for **MOI Builders Session 4**. Alice and Bob swap **TKA ↔ TKB** directly — no pool, no deposit, no custom contracts. Everything uses MAS0-native operations:

1. Each side **Locks** its leg *for the counterparty* (`Lockup`) — an irrevocable on-chain offer only the beneficiary can pull.
2. Each side **Claims** what was locked for them (`Release`, signed by the beneficiary).

Two ways to run it: a **CLI** that walks the four steps, and a **swap-card UI** (Vite) where the Claim button is gated by a real on-chain check (`moi.Lockups`).

> This is a **trust-based** swap, not a chain-enforced atomic swap. Locking is irrevocable and beneficiary-only, but nothing on-chain forces the counterparty to lock their side in return. True atomicity needs an escrow contract — out of scope for this session.

## Install

1. **Node.js 20+** — <https://nodejs.org>
2. **Dependencies** — run once inside `session-4/`:
   ```bash
   npm install
   ```
   `postinstall` runs `patch-package` to fix the SDK's ESM build (see `patches/`) — don't skip it.
3. **Wallets** — two separate faucet-funded devnet wallets (Alice and Bob):
   ```bash
   cp .env.example .env
   # edit VITE_ALICE_MNEMONIC and VITE_BOB_MNEMONIC
   ```
   Fund both at <https://voyage.moi.technology>. Any faucet-created wallet works as-is (default derivation path).
4. **Test assets** — deploys TKA + TKB and mints 500,000 of each (TKA → Alice, TKB → Bob):
   ```bash
   npm run setup
   ```
   Setup writes `VITE_TKA_ASSET_ID` and `VITE_TKB_ASSET_ID` into `.env`. If Bob wasn't funded yet, fund him and run `npm run mint-tkb`.

## Demos

Run from `session-4/` so `dotenv` picks up `.env`. Fixed rate (display only): **1 TKA = 0.9 TKB** → Alice sends **100 TKA**, receives **90 TKB**.

### Demo 1 — CLI swap

Step by step:

```bash
node extras/swap-cli.js balances       # 0. starting balances
node extras/swap-cli.js lock-alice     # 1. Alice locks 100 TKA for Bob
node extras/swap-cli.js lock-bob       # 2. Bob locks 90 TKB for Alice
node extras/swap-cli.js claim-alice    # 3. Alice claims her 90 TKB
node extras/swap-cli.js claim-bob      # 4. Bob claims his 100 TKA
```

Or the full sequence in one go:

```bash
npm run swap
```

After each step the CLI prints all four balances (Alice/Bob × TKA/TKB).

### Demo 2 — Swap card UI

```bash
npm run dev
# opens http://localhost:5174
```

1. **Connect as Alice** (paste her mnemonic) — amount `100` TKA, paste Bob's address, click **Lock**. Claim is disabled: "Waiting for counterparty to lock 90 TKB…"
2. **Disconnect → connect as Bob** — **⇅ Flip** so the send side is TKB, amount `90`, paste Alice's address. **Claim is already enabled** — the app read `moi.Lockups(Alice)` on-chain and found her lock for Bob. Click **Claim**, then **Lock**.
3. **Disconnect → connect as Alice** — Claim is now enabled (polled every ~4s). Click **Claim** → swap complete. Verify the interaction hashes on [Voyage](https://voyage.moi.technology).

## What each on-chain call does

| Step | Who | Call | Effect |
| --- | --- | --- | --- |
| 1 | Alice | `Lockup(beneficiary=Bob, 100 TKA)` | Irrevocable offer — only Bob can pull it |
| 2 | Bob | `Lockup(beneficiary=Alice, 90 TKB)` | Bob's counter-offer — only Alice can pull it |
| 3 | Alice | `Release(benefactor=Bob, beneficiary=Alice, 90 TKB)` | Alice claims her TKB (signed by her, the beneficiary) |
| 4 | Bob | `Release(benefactor=Alice, beneficiary=Bob, 100 TKA)` | Bob claims his TKA — swap complete |

Two details worth knowing:

- **`moi.Lockups` is a raw JSON-RPC method** (not wrapped by the SDK). Unlike `BalanceOf`, it lets any wallet look up any account's outstanding lockups — that's what powers the Claim gate in the UI. See `logic/swap.js`.
- **MAS0's `release()` has no on-chain guard** — calling it when nothing is locked "succeeds" but moves zero funds. `claim()` in `logic/swap.js` checks the balance delta itself and reports "nothing to claim yet" unless funds actually moved.

## Bounty — MOI Builders IV: Swaps

Complete the swap on MOI **devnet**, then submit your on-chain results.

### What to capture

| Item | Where to get it |
| --- | --- |
| **Deployed Asset IDs** (TKA + TKB) | Printed by `npm run setup` (also saved to `.env` as `VITE_TKA_ASSET_ID` / `VITE_TKB_ASSET_ID`) |
| **Swap transaction hash** | Any Lockup/Release hash printed by the CLI or shown in the UI status line |

### Submit

Drop your results into the **MOI Builders IV — Swaps** form:

**<https://forms.gle/mM9Rf6dqxZQd1fuz6>**

| Form field | Where to get it |
| --- | --- |
| **Email** | Your contact email |
| **Wallet Id** | Alice's address — printed by `npm run setup`, or visible on <https://voyage.moi.technology> |
| **Deployed Asset IDs** | Both IDs (TKA and TKB) from setup output / `.env` |
| **Swap Transaction Hash** | An interaction hash from the swap (Lockup or Release) |

### Verify

Open <https://voyage.moi.technology>, search your wallet address, and confirm the Lockup and Release interactions landed before submitting.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `VITE_ALICE_MNEMONIC is not set` | Create `.env` from `.env.example` |
| `account not found` (Bob) | Fund Bob at <https://voyage.moi.technology>, then `npm run mint-tkb` |
| `Failed to sign interaction` on deploy | Use plain numbers for amounts, not bigint |
| Claim says "nothing to claim yet" | Counterparty hasn't locked their side — wait, then retry |
| `insufficient funds` | Wallet is low on devnet gas — fund it at the faucet |
| Balances messy after a rehearsal | Don't redeploy — `node extras/rebalance.js` restores the 500000/0 baseline via plain transfers |
| UI broken after fresh `npm install` | `patch-package` must run (postinstall) — it fixes the SDK's ESM build |

## Repo layout

```
logic/                shared by CLI + UI (browser-safe)
  swap.js             lockup / release / claim + moi.Lockups reads
  tokens.js           MAS0 deploy + mint helpers
  wallets.js          load Alice + Bob from .env
extras/
  setup.js            deploy TKA/TKB, mint, write asset IDs to .env
  swap-cli.js         Demo 1 — step-by-step or full swap
  mint-tkb-to-bob.js  mint TKB to Bob after he's funded
  fund-wallet.js      mint TKA+TKB to any extra wallet
  rebalance.js        reset balances to the 500000/0 baseline
frontend/             Demo 2 — Vite swap-card UI
patches/              js-moi-providers ESM fix (applied via patch-package)
```

## Notes

- All demos use MOI **devnet** via `VoyageProvider('devnet')`.
- Use **numbers** (not bigint) for amounts in `.send()` payloads — bigint broke signing in devnet tests.
- `.env` is gitignored — never commit mnemonics.
