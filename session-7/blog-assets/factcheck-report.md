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
