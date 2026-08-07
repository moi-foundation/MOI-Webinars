// "Risk Agent" — the BUYER agent. A pure agent loop: no human input, and no hardcoded seller URL.
//
//   1. DISCOVER  find an agent in the MOI registry whose skill is selling signals
//   2. BROWSE    read its free catalog of markets
//   3. CHOOSE    the brain picks the market that answers the question
//   4. REQUEST   GET the estimate, expect 402 + a quote
//   5. CHECK     is payTo really the seller's registered wallet? (MOI-only question)
//   6. PAY       submit our OWN MAS0 transfer, sign a claim naming it, retry
//   7. RECEIVE   the summary + a receipt

import type { AgentRegistry } from "js-moi-agent-registry";
import {
  config,
  buyerAccount,
  registryClient,
  discoverBySkill,
  getProfile,
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
  readInlineCard,
  cardSkills,
  StepEmitter,
  type Quote,
  type StepSink,
} from "@demo/shared";
import { payingFetch, PaymentRefused, type BuyerEvent } from "./pay.js";
import { checkSellerIdentity } from "./identity-check.js";
import { chooseMarket, type CatalogMarket } from "./brain.js";
import { worthIt, SOFT_LIMIT } from "./worth.js";

export interface BuyResult {
  data: unknown;
  txHash: string | null;
  receiptTx: string | null;
  price: string;
  marketId: string;
}

const DEFAULT_QUESTION = "How likely is a big bitcoin drawdown this quarter?";

export async function runBuyer(
  opts: { fallbackUrl: string; question?: string; onStep?: StepSink },
): Promise<BuyResult> {
  const buyer = await buyerAccount();
  const question = opts.question ?? DEFAULT_QUESTION;
  const steps = new StepEmitter(opts.onStep);

  banner("BUYER", "boot", "Risk Agent waking up");
  detail("wallet", buyer.address);
  detail("agent id", config.buyerAgentId ?? "(unregistered)");
  detail("question", question);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "local fallback (no GROQ_API_KEY)");

  let registry: AgentRegistry | null = null;
  try {
    registry = await registryClient(buyer, false);
  } catch (err) {
    warn(`registry unavailable (${(err as Error).message}) — identity check will be skipped`);
  }

  // ── STEP 1: DISCOVER ────────────────────────────────────────────────────────────────────
  banner("BUYER", "step 1", "Find a probability-book desk in the MOI agent registry");
  steps.emit({
    actor: "buyer",
    title: "I don't know the answer to this",
    thought:
      `"${question}" is not something I can answer myself. I need to find an agent that sells ` +
      "bitcoin probability books. I'll scan the MOI agent registry for the skill tag `sells-books`.",
    status: "working",
  });
  let sellerUrl = opts.fallbackUrl;

  if (registry) {
    try {
      // O(n) client-side scan — the registry has no index and no search.
      const found = await discoverBySkill(registry, "sells-books", buyer.address);
      detail("scanned", `${found.scanned} (${found.scope})`);
      detail("agents selling books", String(found.matches.length));
      if (found.scanned === 0) warn("scanned nothing — the registry query failed, not an empty registry");
      const chosen =
        found.matches.find((p) => p.agent_id === config.sellerAgentId) ??
        found.matches[0] ??
        (config.sellerAgentId ? await getProfile(registry, config.sellerAgentId) : null);
      if (chosen) {
        detail("agent id", chosen.agent_id);
        detail("status", String(chosen.status));
        detail("agent wallet", addr0x(chosen.agent_wallet));
        detail("service url", chosen.url);
        if (chosen.url) sellerUrl = chosen.url;
        ok("seller resolved on chain — we were never handed a URL");

        const card = readInlineCard(chosen.card_uri);
        const skills = cardSkills(card) as { name?: string; description?: string; tags?: string[] }[];
        steps.emit({
          actor: "chain",
          title: `Found one: ${chosen.agent_id}`,
          thought:
            `I scanned ${found.scanned} agents and one of them advertises this skill. Everything ` +
            "below came off the chain — I was never handed an address.",
          detail: [
            ["agent id", chosen.agent_id],
            ["status", String(chosen.status)],
            ["registered wallet", addr0x(chosen.agent_wallet)],
            ["service url", chosen.url],
            ...skills.map((sk, i): [string, string] => [
              `skill ${i + 1}`,
              `${sk.name ?? "(unnamed)"} — ${sk.description ?? ""} [${(sk.tags ?? []).join(", ")}]`,
            ]),
          ],
          status: "ok",
        });
      } else {
        warn(`no registered book desk found — falling back to ${sellerUrl}`);
      }
    } catch (err) {
      warn(`discovery failed (${(err as Error).message}) — falling back to ${sellerUrl}`);
    }
  }

  const base = sellerUrl.replace(/\/$/, "");

  // ── STEP 2: BROWSE (free) ───────────────────────────────────────────────────────────────
  banner("BUYER", "step 2", "Read the catalog (free — the questions are public, the answers are not)");
  const catalogRes = await fetch(`${base}/catalog`);
  if (!catalogRes.ok) throw new Error(`GET /catalog failed: HTTP ${catalogRes.status}`);
  const catalog = (await catalogRes.json()) as { markets: CatalogMarket[]; symbol: string };
  for (const m of catalog.markets) {
    detail(m.id, `from ${m.listPrice} ${catalog.symbol}  ${m.question}  [${m.horizon}]`);
  }
  steps.emit({
    actor: "seller",
    title: "Here is what I sell",
    thought:
      "Browsing costs nothing. These are opening prices — the desk decides what to actually " +
      "charge when I ask. I either accept its number or walk away.",
    detail: catalog.markets.map((m): [string, string] => [
      `from ${m.listPrice} ${catalog.symbol}`, `${m.question}  [${m.horizon}]`,
    ]),
    status: "ok",
  });

  // ── STEP 3: CHOOSE ──────────────────────────────────────────────────────────────────────
  const choice = await chooseMarket(question, catalog.markets);
  const picked = catalog.markets.find((m) => m.id === choice.marketId);
  banner("BUYER", "step 3", `Chose: ${picked?.question ?? choice.marketId}`);
  detail("why", choice.reason);
  detail("decided by", choice.by);
  steps.emit({
    actor: "buyer",
    title: `This is the one I want: ${picked?.question ?? choice.marketId}`,
    thought: choice.reason,
    detail: [["market", choice.marketId], ["decided by", choice.by]],
    status: "ok",
  });

  // ── policy applied before any money moves ───────────────────────────────────────────────
  const approve = async (q: Quote): Promise<string | null> => {
    banner("BUYER", "step 6", "Is this price worth paying?");
    detail("asking price", `${q.price} ${q.symbol}`);
    detail("list price", `${q.listPrice ?? "?"} ${q.symbol}`);
    detail("asset", shortId(q.asset));

    steps.emit({
      actor: "seller",
      title: "402 Payment Required",
      thought: q.priceReason
        ? `You can have it, but not for free. "${q.priceReason}"`
        : "You can have it, but not for free. Here is my price and where to send it.",
      detail: [
        ["price", `${q.price} ${q.symbol}`],
        ["list price", `${q.listPrice ?? "?"} ${q.symbol}`],
        ["priced by", q.pricedBy ?? "(none)"],
        ["pay to", q.payTo],
        ["their agent id", q.payToAgentId ?? "(none)"],
      ],
      status: "ok",
    });

    // ── is this price worth paying? ───────────────────────────────────────────────────────
    const verdict = await worthIt({
      question,
      marketQuestion: picked?.question ?? choice.marketId,
      price: BigInt(q.price),
      listPrice: BigInt(q.listPrice ?? q.price),
      symbol: q.symbol,
      sellerReason: q.priceReason,
    });
    detail("seller's reason", q.priceReason ?? "(none)");
    detail("my ceiling", `${SOFT_LIMIT} ${q.symbol}`);
    if (!verdict.accept) {
      fail(`too expensive: ${verdict.reason}`);
      steps.emit({
        actor: "buyer",
        title: "Not paying that",
        thought: verdict.reason,
        detail: [
          ["quoted", `${q.price} ${q.symbol}`],
          ["list price", `${q.listPrice ?? "?"} ${q.symbol}`],
          ["seller's reason", q.priceReason ?? "(none)"],
          ["decided by", verdict.by],
        ],
        status: "fail",
      });
      return `refused the price: ${verdict.reason}`;
    }
    ok(`price accepted — ${verdict.reason}`);
    steps.emit({
      actor: "buyer",
      title: `${q.price} ${q.symbol} — I'll pay that`,
      thought: verdict.reason,
      detail: [
        ["quoted", `${q.price} ${q.symbol}`],
        ["list price", `${q.listPrice ?? "?"} ${q.symbol}`],
        ["seller argued", q.priceReason ?? "(none)"],
        ["decided by", verdict.by],
      ],
      status: "ok",
    });

    banner("BUYER", "step 7", "Is this seller who it claims to be?");
    detail("payTo", q.payTo);

    const identity = await checkSellerIdentity(registry, q);
    if (!identity.ok) {
      fail("payTo does NOT match the seller's on-chain registry wallet");
      detail("registry says", identity.registryWallet ?? "(unreadable)");
      detail("quote says", q.payTo);
      steps.emit({
        actor: "buyer",
        title: "That is NOT the wallet this agent registered",
        thought:
          "The address in the quote does not match what the chain says belongs to this agent. " +
          "I am not sending money to it. Nothing has been spent.",
        detail: [
          ["registry says", identity.registryWallet ?? "(unreadable)"],
          ["quote says", q.payTo],
        ],
        status: "fail",
      });
      return identity.reason ?? "identity check failed";
    }
    if (identity.registryWallet) ok(`payTo matches registry wallet ${shortId(identity.registryWallet)}`);
    else warn(identity.reason ?? "no registry entry — paying on trust");

    if (normalizeAddress(q.asset) !== normalizeAddress(config.assetId)) {
      fail(`seller wants a different asset (${shortId(q.asset)})`);
      return "unexpected asset";
    }
    ok("asset is the one we hold");
    steps.emit({
      actor: "buyer",
      title: "Checked who I am paying",
      thought:
        "That address was just 32 bytes handed to me by the seller. I asked the registry what " +
        "wallet this agent actually registered, and the two match. Safe to pay.",
      detail: [
        ["registry wallet", identity.registryWallet ?? "(no registry entry)"],
        ["quote pay to", q.payTo],
        ["asset", "matches the one I hold"],
      ],
      status: "ok",
    });
    return null;
  };

  const narrate = (e: BuyerEvent) => {
    switch (e.type) {
      case "request":
        if (e.attempt === 1) banner("BUYER", "step 4", `GET ${e.url} (no payment)`);
        else banner("BUYER", "step 9", "Retry with X-Payment-Proof header");
        break;
      case "quoted":
        ok("received HTTP 402 with a quote");
        break;
      case "transferred":
        banner("BUYER", "step 8", "Pay — the buyer moves its OWN funds");
        detail("amount", `${e.amount} ${config.assetSymbol}`);
        detail("ix hash", e.txHash);
        say("BUYER", "on MOI only the owner can move their own money — nobody holds it for us");
        steps.emit({
          actor: "chain",
          title: "Paid — on chain, from my own wallet",
          thought:
            "On MOI only the owner can move their own funds, so I signed and submitted this " +
            "myself. Nobody held the money for me.",
          detail: [
            ["amount", `${e.amount} ${config.assetSymbol}`],
            ["from", buyer.address],
            ["interaction", e.txHash],
          ],
          status: "ok",
        });
        break;
      case "signed":
        detail("signed value", e.claim.value);
        detail("names tx", e.claim.txHash);
        detail("resource", e.claim.resource);
        detail("nonce", short(e.claim.nonce));
        ok(`ECDSA_S256 signature ${short(e.signature, 14, 6)}`);
        break;
      case "paid":
        banner("BUYER", "step 12", "Receipt received");
        detail("confirmed ix", e.receipt.txHash);
        detail("network", e.receipt.network);
        break;
    }
  };

  const url = `${base}/signal/${encodeURIComponent(choice.marketId)}`;

  try {
    const result = await payingFetch(url, { buyer, approve, onEvent: narrate });
    banner("BUYER", "done", "Estimate delivered — agent loop complete");
    console.log(JSON.stringify(result.data, null, 2));
    steps.emit({
      actor: "seller",
      title: "Paid — here is what you bought",
      thought: "Payment confirmed on chain, so the answer is yours.",
      data: result.data,
      status: "ok",
    });
    return {
      data: result.data,
      txHash: result.txHash,
      receiptTx: result.receipt?.txHash ?? null,
      price: result.quote?.price ?? config.price.toString(),
      marketId: choice.marketId,
    };
  } catch (err) {
    if (err instanceof PaymentRefused) {
      // A refusal is a SUCCESSFUL outcome for the agent's policy — it declined to be defrauded.
      banner("BUYER", "refused", "Agent declined to pay");
      fail((err as Error).message);
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuyer({ fallbackUrl: config.sellerUrl })
    .then((r) => summary("Risk Agent finished", [
      ["market", r.marketId],
      ["our transfer", r.txHash ?? "(none)"],
      ["confirmed ix", r.receiptTx ?? "(none)"],
      ["price", r.price],
    ]))
    .catch((err) => { say("BUYER", `failed: ${(err as Error).message}`); process.exit(1); });
}
