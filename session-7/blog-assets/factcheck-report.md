# Factcheck report — BLOG.md (2026-08-07, pre-publish)

| Claim / link | Verdict | Evidence |
|---|---|---|
| BEC losses $2.9B in 2023 (FBI IC3) | VERIFIED 1.0 | 2023 IC3 Report PDF: "21,489 complaints amounting to $2.9 billion in reported losses" |
| HTTP 402 reserved since 1997, unused | SUPPORTED | MDN: "reserved for future use… no standard use convention exists"; RFC 9110 §15.5.3 linked |
| EIP-3009 = transfer via signed authorization | VERIFIED | eips.ethereum.org/EIPS/eip-3009 |
| ~~x402 comparison~~ | SECTION CUT | the "Is this x402?" section was removed pre-publish; EIP-3009 and x402.org had verified before the cut |
| Bitcoin genesis January 2009 | FIXED | bitcoin.pdf (Oct 2008) couldn't support the date → relinked to en.bitcoin.it/wiki/Genesis_block ("The Times 03/Jan/2009") |
| llama-3.3-70b-versatile on Groq | VERIFIED | console.groq.com/docs/models, Production Models |
| js-moi-sdk / js-moi-agent-registry / js-polo | VERIFIED | npm registry: 0.7.1 / 0.1.1 / 0.1.4 (npm view; npmjs.com blocks anonymous fetch with 403) |
| moi.technology, voyage, sdk docs, repo, groq, express | VERIFIED | all HTTP 200 |
| sarvalabs.com | FIXED | domain does not resolve → relinked to www.sarva.ai (official site) |
| tx hash 0x13393fc7… | INTERNAL | our own devnet transaction; verifiable on Voyage |
| 42 lines / 698 lines / seven checks / eleven forgeries | INTERNAL VERIFIED | counted from repo at time of writing; attack suite linked |

Unfetched utility links (nodejs.org, typescriptlang.org, MDN SSE, tsx, dotenv, aistudio, forms.gle): low-risk, spot-check at publish.

## Protocol-source verification (2026-08-07, three parallel readers)

Claims checked against `js-moi-asset`, `js-moi-agent-registry`, `js-moi-sdk`,
`js-moi-signer`, `js-moi-wallet`, `js-moi-identifiers` sources + our own code.

| Claim | Verdict | Action |
|---|---|---|
| "only the owner can move funds — there *can't* be a custodian" | **FALSE** | MAS0 has `Approve`/`TransferFrom` (capped, `expires_at`, revocable) and `Lockup`/`Release` — real delegated-spend primitives. Also contradicted our own "escrow is native to MOI" line. Rewritten to "value moves only under the holder's own signature… our agents never grant one." |
| "registry is an on-chain listing of agents and their capabilities" | **FALSE** | Profile holds `agent_id, owner, agent_wallet, status, url, card_uri, score, timestamps`. Skills live in the CARD at `card_uri`, normally off-chain (IPFS/HTTPS); our `data:` URI is a choice. No index, no search; `getAllAgentIds()` reverts `MeterExhausted` at scale. Rewritten. |
| "the seller wrote its wallet on the chain" | **OVERSTATED** | The OWNER registers and names `agent_wallet`; the named wallet never signs or consents. Rewritten, plus a new paragraph stating exactly what the check does and doesn't prove. |
| "an on-chain identity anyone can look up" | **OVERSTATED** | Reads take no signature and no fuel, but the SDK builds a sender for every call, so the caller's account must exist on chain. Softened. |
| "402 body … and an expiry" | **OVERSTATED** | Quote carries `ttlSeconds` (relative); absolute `expiresAt` is on the buyer's claim. → "a time-to-live". |
| "eleven kinds of forged payment at this verifier" | **OVERSTATED** | 10 forgeries hit `verifyProof`; the 11th case targets the buyer's identity check. → "ten forged payments". |
| "Seven checks, all reads" | **ARGUABLE** | Checks are reads, but `consumed.consume()` mutates the replay set after check 7. → "every one a read — the only write is burning that transfer hash." |
| "exactly two signatures in this system" | **SCOPED** | True per purchase; setup/attack scripts sign more (all the buyer's key). → "two signatures in a purchase". |
| "escrow-style pay-on-delivery is native to MOI" | **UNVERIFIABLE** | `Lockup`/`Release` callsites exist; their semantics (who is debited, who may release) are node-side and absent from the SDK. → "exposes lockup and release primitives that a pay-on-delivery flow could be built on". |
| "a payment address is thirty-two bytes" | **TRUE** | 4-byte tag/flags + 24-byte pubkey fingerprint + 4-byte variant; enforced at `identifier.ts:29-31`. Confirmed live: 64 hex chars. |
| "ECDSA over secp256k1" | **TRUE** | `ecdsa.ts:24-31`. Enriched: the WHOLE interaction is POLO-serialized and signed (BLAKE2b-256 digest), not the payload alone. |
| "native MAS0 asset" | **TRUE** | `ASSET_CREATE`/`ASSET_INVOKE` are first-class OpTypes; no manifest, no bytecode (contrast MASX). Clarified so it isn't read as the fuel token. |
| cited tx `0x13393fc7…` | **TRUE** | Read back off-chain: `Transfer`, buyer → seller, amount 3. |
| identity-check.ts is 42 lines; snippet verbatim; runs before transfer | **TRUE** | pay.ts:70 approve → :71 throw → :78/79 transfer built. Nothing on-chain constructed before line 78. |

Known, left alone (code churn before publish): `verify-proof.ts:1` repeats the
"all read-only" wording, and `attack-test.ts:13-14` has a stale transfer count.
