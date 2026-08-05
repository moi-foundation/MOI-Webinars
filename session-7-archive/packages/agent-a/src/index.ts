// Agent A — the BUYER. A pure agent loop: no human input, no hardcoded seller URL.
//
//   1. DISCOVER  resolve agent-b through the on-chain MOI agent registry
//   2. REQUEST   GET the resource, expect 402
//   3. DECIDE    check price against budget AND check payTo against the registry
//   4. SIGN      escrow the funds, then sign the payment authorization
//   5. RETRY     re-issue with the base64 X-Payment header
//   6. RECEIVE   the data + an X-Payment-Response receipt carrying a real MOI ix hash
//
// The two steps that matter for the thesis are DISCOVER and the registry check inside DECIDE.
// Agent A is not handed a URL to trust — it resolves a verifiable on-chain identity, then refuses
// to pay a counterparty that identity does not vouch for. That is the question x402 has no way to
// ask, and MOI's agent registry answers it.

import {
  config,
  walletConfig,
  loadAccount,
  openRegistry,
  lookupAgent,
  normalizeAddress,
  createSettlementBackend,
  fetchWithMoiPayment,
  PaymentRefused,
  banner,
  detail,
  say,
  ok,
  fail,
  warn,
  shortId,
  short,
  summary,
  amount as fmtAmount,
  type ClientEvent,
  type MoiPaymentRequirements,
} from "@s7/shared";

export interface SignalResult {
  data: unknown;
  transaction: string | null;
  price: string;
}

export async function runAgentA(opts: {
  /** Fallback when the registry has no entry (or is unavailable). */
  fallbackUrl: string;
  market?: string;
}): Promise<SignalResult> {
  const buyer = await loadAccount(walletConfig("AGENT_A"));
  const backend = createSettlementBackend(config.settlement);
  const market = opts.market ?? "BTC-100K-2026";

  banner("AGENT-A", "boot", "Buyer agent waking up");
  detail("address", buyer.address);
  detail("agent id", config.agentAId ?? "(not registered)");
  detail("budget", fmtAmount(config.signalPrice, config.assetDecimals, config.assetSymbol));
  detail("settlement", backend.name);

  // ── STEP 1: DISCOVER ────────────────────────────────────────────────────────────────────
  banner("AGENT-A", "step 1", "Discover the seller in the MOI agent registry");
  let sellerUrl = opts.fallbackUrl;
  let sellerWallet: string | null = null;

  if (config.agentBId) {
    try {
      const registry = await openRegistry(buyer);
      const profile = await lookupAgent(registry, config.agentBId);
      if (profile) {
        sellerWallet = profile.agent_wallet;
        detail("agent id", profile.agent_id);
        detail("status", String(profile.status));
        detail("agent wallet", `0x${normalizeAddress(profile.agent_wallet)}`);
        detail("service url", profile.url);
        if (profile.url) sellerUrl = profile.url;
        ok("seller resolved from on-chain registry — not from a URL we were handed");
      } else {
        warn(`agent ${config.agentBId} has no registry entry — falling back to ${sellerUrl}`);
      }
    } catch (err) {
      warn(`registry lookup failed (${(err as Error).message}) — falling back to ${sellerUrl}`);
    }
  } else {
    warn(`AGENT_B_ID not set — falling back to ${sellerUrl}. Run \`npm run register-agents\`.`);
  }

  // ── The buyer's own policy, applied before it will part with money. ─────────────────────
  const approve = async (requirements: MoiPaymentRequirements): Promise<string | null> => {
    banner("AGENT-A", "step 3", "Decide — is this seller who it claims to be?");
    detail(
      "asking price",
      fmtAmount(
        requirements.maxAmountRequired,
        requirements.extra.decimals,
        requirements.extra.symbol,
      ),
    );
    detail("payTo", requirements.payTo);
    detail("asset", shortId(requirements.asset));

    if (sellerWallet && normalizeAddress(requirements.payTo) !== normalizeAddress(sellerWallet)) {
      fail("payTo does NOT match the wallet the registry published for this agent");
      return `payTo ${requirements.payTo} does not match registry wallet ${sellerWallet}`;
    }
    if (sellerWallet) ok("payTo matches the seller's on-chain registered wallet");
    else warn("no registry entry to check payTo against — paying on trust");

    if (requirements.asset.toLowerCase() !== config.assetId.toLowerCase()) {
      fail(`seller wants a different asset (${shortId(requirements.asset)})`);
      return "unexpected asset";
    }
    ok("asset is the one we hold");
    return null;
  };

  const narrate = (event: ClientEvent) => {
    switch (event.type) {
      case "request":
        if (event.attempt === 1) banner("AGENT-A", "step 2", `GET ${event.url} (no payment)`);
        else banner("AGENT-A", "step 5", "Retry with X-Payment header");
        break;
      case "payment-required":
        ok("received HTTP 402 with an accepts[] offer");
        break;
      case "budget-rejected":
        fail(`price ${event.price} exceeds budget ${event.budget}`);
        break;
      case "funding":
        banner("AGENT-A", "step 4a", "Escrow funds on MOI (MAS0 Lockup)");
        detail("locked", fmtAmount(event.amount, config.assetDecimals, config.assetSymbol));
        detail("beneficiary", "the facilitator");
        ok(`lockup ix ${event.transaction}`);
        break;
      case "signed":
        banner("AGENT-A", "step 4b", "Sign the payment authorization");
        detail("value", event.authorization.value);
        detail("to", event.authorization.to);
        detail("resource", event.authorization.resource);
        detail("nonce", short(event.authorization.nonce));
        detail("expires", `${event.authorization.validBefore} (unix)`);
        ok(`ECDSA_S256 signature ${short(event.signature, 14, 6)}`);
        break;
      case "paid":
        banner("AGENT-A", "step 10", "Receipt received");
        detail("settled ix", event.receipt.transaction ?? "(none)");
        detail("network", event.receipt.network);
        break;
    }
  };

  const url = `${sellerUrl.replace(/\/$/, "")}/signal?market=${encodeURIComponent(market)}`;

  try {
    const result = await fetchWithMoiPayment(url, {
      buyer,
      backend,
      maxAmount: BigInt(config.signalPrice),
      authorizationTtlSeconds: config.authorizationTtlSeconds,
      approve,
      onEvent: narrate,
    });

    banner("AGENT-A", "done", "Signal acquired — agent loop complete");
    console.log(JSON.stringify(result.data, null, 2));

    return {
      data: result.data,
      transaction: result.receipt?.transaction ?? null,
      price: result.requirements?.maxAmountRequired ?? config.signalPrice,
    };
  } catch (err) {
    if (err instanceof PaymentRefused) {
      // A refusal is a SUCCESSFUL outcome for the agent's policy — it declined to be defrauded.
      banner("AGENT-A", "refused", "Agent declined to pay");
      fail((err as Error).message);
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentA({ fallbackUrl: config.agentBUrl })
    .then((r) =>
      summary("Agent A finished", [
        ["settled ix", r.transaction ?? "(none)"],
        ["price", r.price],
      ]),
    )
    .catch((err) => {
      say("AGENT-A", `failed: ${(err as Error).message}`);
      process.exit(1);
    });
}
