# REVIEW.md — start here

One page to orient before reading code. Full detail: [README.md](./README.md).

## What this is

**V1 of 3.** A **Reader** agent finds a **Bookseller** in the MOI registry and buys a book summary
mid-HTTP-request, settled in native **MAS0**. Two plain wallets — no sub-accounts, no budget logic.
Authority is session 8; full commerce is session 9.

An earlier build of this did the same thing over **x402**, with a separate facilitator service. It
is preserved on the `claude/agent-payments-moi-x402` branch. This one drops both for a two-message
protocol of its own — see [README](./README.md#why-there-is-no-x402-here) for what that costs.

## Run it (needs one funded devnet wallet)

```bash
cd session-7 && npm install
cp .env.example .env      # funded devnet mnemonic
npm run setup:asset && npm run setup:registry
npm run demo
```

Then the three that matter:

| Command | What it should show |
| --- | --- |
| `npm run demo -- --tamper` | registry wallet repointed → buyer **refuses**, no money moves |
| `npm run attack-test` | 11 forgeries rejected + 1 honest control accepted (~12 base units) |
| `npm run verify-sdk` | 63 assertions against live devnet (no wallet needed) |

All four have been run against devnet and pass.

## Read in this order

1. `packages/shared/src/payment-proof.ts` — the wire format + what gets signed
2. `packages/agent-seller/src/verify-proof.ts` — the 7 checks; **this is the talk**
3. `packages/agent-buyer/src/pay.ts` — the client half
4. `packages/shared/src/payment-verify.ts` — how a transfer is confirmed read-only
5. `scripts/demo.ts` — the on-stage choreography

## The claims, and where each is enforced

| Claim | Enforced in |
| --- | --- |
| The seller is who it says it is | buyer `identity-check.ts`, **before** any money moves |
| The payer is who it says it is | `verify-proof.ts` checks 2–3 — signature, then key→account |
| The money actually moved | `verify-proof.ts` check 6 — reads the chain, not the buyer's word |
| One payment buys one thing | `verify-proof.ts` check 7 — the transfer hash is burned |

## Three things to look at critically

1. **The signature is not decoration.** Transfers are public. Without check 3 binding the proof to
   the keyholder, anyone watching the chain could quote a stranger's transfer hash and collect the
   goods it paid for. If you think it is redundant with the on-chain read, work that attack
   through first.
2. **Replay state is in memory.** `ConsumedTransfers` lives in the seller process. Correct for a
   one-run demo, wrong for anything real — restart the seller and every spent transfer is spendable
   again. Called out in the source, but worth seeing.
3. **Nothing about budgets should appear anywhere.** Grep for `budget`, `inherit`, `sub-account`,
   `RecordSpend` — session 7 should have zero hits outside comments that say "that's session 8".

## Where the registry check moved, and why it matters

In the x402 build, the facilitator asked "is `payTo` a registered agent?" as check 7. That is gone,
and its absence is the interesting part: the seller **is** the payee, so it was asking itself
whether it was itself.

The question only means anything asked by the party at risk. It now runs once, in the buyer, before
any funds move — which is also the only place it can prevent a loss rather than report one.

## Language that must stay precise

- Registry discovery is an **O(n) client-side scan**. No index, no search, not semantic.
- **Nobody custodies funds.** Not a design preference — on MOI only the owner can move their own
  money, so escrow-style settlement is not available in V1.
- Don't say this "replaces" or "forks" x402. It is a different, smaller thing that solves the same
  problem for one pair of agents.
