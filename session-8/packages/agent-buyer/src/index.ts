// "Reader" — the BUYER agent. A pure agent loop: no human input, and no hardcoded seller URL.
//
//   1. DISCOVER  find an agent in the MOI registry whose skill is selling books
//   2. BROWSE    read its free catalog
//   3. CHOOSE    the brain picks the book that answers the question
//   4. REQUEST   GET the book, expect 402
//   5. CHECK     is payTo really the seller's registered wallet? (MOI-only question)
//   6. PAY       submit our OWN MAS0 transfer, sign an authorization naming it, retry
//   7. RECEIVE   the summary + a receipt
//
// SESSION 8 adds one step the buyer cannot skip: it must RECORD the spend against its on-chain
// cap before paying. Over the cap, the chain reverts and no money moves.

import type { AgentRegistry } from "js-moi-agent-registry";
import {
  config,
  buyerAccount,
  registryClient,
  discoverBySkill,
  getProfile,
  getBudget,
  normalizeAddress,
  addr0x,
  banner,
  detail,
  say,
  ok,
  fail,
  warn,
  short,
  shortId,
  summary,
  isMock,
  type PaymentRequirements,
} from "@demo/shared";
import { payingFetch, PaymentRefused, type BuyerEvent } from "./pay-fetch.js";
import { checkSellerIdentity } from "./identity-check.js";
import { chooseBook, type CatalogBook } from "./brain.js";
import { spendWithinBudget } from "./budget-gate.js";

export interface BuyResult {
  data: unknown;
  txHash: string | null;
  receiptTx: string | null;
  price: string;
  bookId: string;
}

const DEFAULT_QUESTION = "How do people justify holding power?";

export async function runBuyer(opts: { fallbackUrl: string; question?: string }): Promise<BuyResult> {
  const buyer = await buyerAccount();
  const question = opts.question ?? DEFAULT_QUESTION;

  banner("BUYER", "boot", "Reader agent waking up");
  detail("sub-account", `#${buyer.index}  ${buyer.address}`);
  detail("agent id", config.buyerAgentId ?? "(unregistered)");
  detail("question", question);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "local fallback (no GROQ_API_KEY)");

  // ── the on-chain cap this agent operates under ──────────────────────────────────────────
  try {
    const b = await getBudget(buyer);
    detail("budget", `${b.spent}/${b.budget} spent — ${b.remaining} remaining (enforced on chain)`);
  } catch {
    warn("no on-chain budget for this sub-account — run pnpm setup:agents");
  }

  let registry: AgentRegistry | null = null;
  try {
    registry = await registryClient(buyer, false);
  } catch (err) {
    warn(`registry unavailable (${(err as Error).message}) — identity check will be skipped`);
  }

  // ── STEP 1: DISCOVER ────────────────────────────────────────────────────────────────────
  banner("BUYER", "step 1", "Find a bookseller in the MOI agent registry");
  let sellerUrl = opts.fallbackUrl;

  if (registry || isMock()) {
    try {
      // O(n) client-side scan — the registry has no index and no search.
      const found = await discoverBySkill(registry, "sells-books");
      detail("agents selling books", String(found.length));
      const chosen =
        found.find((p) => p.agent_id === config.sellerAgentId) ??
        found[0] ??
        (config.sellerAgentId ? await getProfile(registry, config.sellerAgentId) : null);
      if (chosen) {
        detail("agent id", chosen.agent_id);
        detail("status", String(chosen.status));
        detail("agent wallet", addr0x(chosen.agent_wallet));
        detail("service url", chosen.url);
        if (chosen.url) sellerUrl = chosen.url;
        ok("seller resolved on chain — we were never handed a URL");
      } else {
        warn(`no registered bookseller found — falling back to ${sellerUrl}`);
      }
    } catch (err) {
      warn(`discovery failed (${(err as Error).message}) — falling back to ${sellerUrl}`);
    }
  }

  const base = sellerUrl.replace(/\/$/, "");

  // ── STEP 2: BROWSE (free) ───────────────────────────────────────────────────────────────
  banner("BUYER", "step 2", "Read the catalog (free — discovery should never cost money)");
  const catalogRes = await fetch(`${base}/catalog`);
  if (!catalogRes.ok) throw new Error(`GET /catalog failed: HTTP ${catalogRes.status}`);
  const catalog = (await catalogRes.json()) as {
    books: CatalogBook[]; price: { amount: string; symbol: string };
  };
  for (const b of catalog.books) detail(b.id, `${b.title} — ${b.author} (${b.year})`);

  // ── STEP 3: CHOOSE ──────────────────────────────────────────────────────────────────────
  const choice = await chooseBook(question, catalog.books);
  const picked = catalog.books.find((b) => b.id === choice.bookId);
  banner("BUYER", "step 3", `Chose: ${picked?.title ?? choice.bookId}`);
  detail("why", choice.reason);
  detail("decided by", choice.by);

  // ── policy applied before any money moves ───────────────────────────────────────────────
  const approve = async (r: PaymentRequirements): Promise<string | null> => {
    banner("BUYER", "step 5", "Is this seller who it claims to be?");
    detail("asking price", `${r.maxAmountRequired} ${r.extra.symbol}`);
    detail("payTo", r.payTo);
    detail("asset", shortId(r.asset));

    const identity = await checkSellerIdentity(registry, r);
    if (!identity.ok) {
      fail("payTo does NOT match the seller's on-chain registry wallet");
      detail("registry says", identity.registryWallet ?? "(unreadable)");
      detail("402 says", r.payTo);
      return identity.reason ?? "identity check failed";
    }
    if (identity.registryWallet) ok(`payTo matches registry wallet ${shortId(identity.registryWallet)}`);
    else warn(identity.reason ?? "no registry entry — paying on trust");

    if (normalizeAddress(r.asset) !== normalizeAddress(config.assetId)) {
      fail(`seller wants a different asset (${shortId(r.asset)})`);
      return "unexpected asset";
    }
    ok("asset is the one we hold");
    return null;
  };

  // ── the on-chain budget gate ────────────────────────────────────────────────────────────
  const gate = async (r: PaymentRequirements) => {
    banner("BUYER", "step 5b", "Budget gate — record the spend against the on-chain cap");
    const verdict = await spendWithinBudget(buyer, BigInt(r.maxAmountRequired), `book:${choice.bookId}`);
    if (!verdict.ok) {
      fail(verdict.reason ?? "budget gate refused");
      say("BUYER", "the chain refused to record this spend — refusing to pay. No money moved.");
      return { ok: false, reason: verdict.reason };
    }
    ok(`RecordSpend accepted — ix ${verdict.spendHash}`);
    detail("remaining", String(verdict.remaining));
    return { ok: true, spendHash: verdict.spendHash, remaining: verdict.remaining };
  };

  const narrate = (e: BuyerEvent) => {
    switch (e.type) {
      case "request":
        if (e.attempt === 1) banner("BUYER", "step 4", `GET ${e.url} (no payment)`);
        else banner("BUYER", "step 7", "Retry with X-Payment header");
        break;
      case "payment-required":
        ok("received HTTP 402 with an accepts[] offer");
        break;
      case "transferred":
        banner("BUYER", "step 6", "Pay — the buyer moves its OWN funds");
        detail("amount", `${e.amount} ${config.assetSymbol}`);
        detail("ix hash", e.txHash);
        say("BUYER", "on MOI only the owner can move their own money — no facilitator custody");
        break;
      case "signed":
        detail("signed value", e.authorization.value);
        detail("names tx", e.authorization.txHash);
        detail("resource", e.authorization.resource);
        detail("nonce", short(e.authorization.nonce));
        ok(`ECDSA_S256 signature ${short(e.signature, 14, 6)}`);
        break;
      case "paid":
        banner("BUYER", "step 9", "Receipt received");
        detail("confirmed ix", e.receipt.transaction ?? "(none)");
        detail("network", e.receipt.network);
        break;
    }
  };

  const url = `${base}/book/${encodeURIComponent(choice.bookId)}`;

  try {
    const result = await payingFetch(url, { buyer, approve, gate, onEvent: narrate });
    banner("BUYER", "done", "Book delivered — agent loop complete");
    console.log(JSON.stringify(result.data, null, 2));
    return {
      data: result.data,
      txHash: result.txHash,
      receiptTx: result.receipt?.transaction ?? null,
      price: result.requirements?.maxAmountRequired ?? config.price.toString(),
      bookId: choice.bookId,
    };
  } catch (err) {
    if (err instanceof PaymentRefused) {
      // A refusal is a SUCCESSFUL outcome — it declined to be defrauded, or to overspend.
      banner("BUYER", "refused", "Agent declined to pay");
      fail((err as Error).message);
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuyer({ fallbackUrl: config.sellerUrl })
    .then((r) => summary("Reader finished", [
      ["book", r.bookId],
      ["our transfer", r.txHash ?? "(none)"],
      ["confirmed ix", r.receiptTx ?? "(none)"],
      ["price", r.price],
    ]))
    .catch((err) => { say("BUYER", `failed: ${(err as Error).message}`); process.exit(1); });
}
