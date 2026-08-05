# REVIEW.md — start here

One page to orient before reading code. Full detail: [README.md](./README.md),
[SDK_NOTES.md](./SDK_NOTES.md).

## What this is

**V1 of 3.** A **Reader** agent finds a **Bookseller** in the MOI registry and buys a book summary
mid-HTTP-request over **x402**, settled in native **MAS0**. Two plain wallets — no sub-accounts, no
budget logic. Authority is session 8; full commerce is session 9.

## Run it (needs one funded devnet wallet)

```bash
cd session-7 && pnpm install
cp .env.example .env      # funded devnet mnemonic
pnpm setup:asset && pnpm setup:registry
pnpm demo
```

Then the three that matter:

| Command | What it should show |
| --- | --- |
| `pnpm demo -- --tamper` | registry wallet repointed → buyer **refuses**, no money moves |
| `pnpm attack-test` | 11 forgeries rejected + 1 honest control accepted |
| `pnpm verify-sdk` | 63 assertions against live devnet (no wallet needed) |

## Read in this order

1. `packages/shared/src/x402-types.ts` — the wire format + what gets signed
2. `packages/facilitator/src/verify-payment.ts` — the 9 checks; **this is the talk**
3. `packages/agent-buyer/src/pay-fetch.ts` — the client half of the handshake
4. `packages/shared/src/payment-verify.ts` — how a transfer is confirmed read-only
5. `scripts/demo.ts` — the on-stage choreography

## The four claims, and where each is enforced

| Claim | Enforced in |
| --- | --- |
| The seller is who it says it is | buyer `identity-check.ts` **and** facilitator check 7 |
| The money actually moved | facilitator check 8 — reads the chain, not the buyer's word |
| One payment buys one thing | facilitator check 9 — replay nonce burned at `/settle` |

## Decisions as implemented

- **A** — reimplemented the two EVM-hardcoded x402 shims (`x402-express`, `x402-fetch`); reused the
  real `useFacilitator`. Wire format unchanged. Scheme `moi-transfer`, network `moi-voyage-devnet`.
- **B** — facilitator is a **referee**: signs nothing, moves nothing. The buyer submits its own
  transfer; the facilitator reads the chain to confirm. `/settle` *confirms* rather than settles.
- **C** — budget gate deferred to session 8 entirely.
- **D** — agent card inlined as a `data:` URI. No external host.
- **E** — old build preserved at `../session-7-archive/`. Nothing deleted.

## Three things to look at critically

1. **Nothing about budgets should appear anywhere.** Grep for `budget`, `inherit`, `sub-account`,
   `RecordSpend` — session 7 should have zero hits outside comments that say "that's session 8".
2. **One funded wallet.** The buyer signs and needs gas; the seller only receives. Confirm
   `00-setup-asset` never asks the seller to sign.
3. **No offline mode.** Mock was removed on request — every path hits devnet. Confirm nothing
   still assumes a simulated ledger, and that failures surface as clear errors rather than
   stack traces.

## Not yet proven

The real devnet sequence (`setup:asset → setup:registry → demo`) has **never been run with a
funded wallet**. Everything typechecks and every API is verified live, but
treat the on-chain path as *assembled from proven parts*, not *observed working*.

Most likely to break first, in order:

1. `01-register-agents` — `createAgent` with an inline data-URI card (no prior art in this repo)
2. `/verify` check 8 — the POLO decode of transfer calldata meets a real transfer
3. `00-setup-asset` — MAS0 create + mint (proven in session 4, but not from this code)

## Language that must stay precise

- Registry discovery is an **O(n) client-side scan**. No index, no search, not semantic.
- The facilitator is a **referee, not a custodian** — an honest divergence from stock x402.
- We do **not** fork x402.
