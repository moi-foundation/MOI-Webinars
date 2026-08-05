// The whole flow, one command.
//
//   npm run demo                 Tier 1 — settle then serve
//   ESCROW=true npm run demo     Tier 2 — escrowed pay-on-delivery
//   SETTLEMENT=mock npm run demo protocol only, no funded wallets needed
//
// Starts the facilitator and agent-b in-process, then turns agent-a loose and prints a labeled,
// step-by-step trace ending in a real MOI interaction hash and the delivered signal.

import {
  config,
  banner,
  detail,
  ok,
  warn,
  summary,
  assetBalance,
  loadAccount,
  walletConfig,
  amount as fmtAmount,
} from "@s7/shared";
import { startFacilitator } from "@s7/facilitator";
import { startAgentB } from "@s7/agent-b";
import { runAgentA } from "@s7/agent-a";

async function main(): Promise<void> {
  const mock = config.settlement === "mock";

  banner("DEMO", "0", "Agentic Payments — x402 handshake, MOI authority + settlement");
  detail("tier", config.escrow ? "2 — escrowed pay-on-delivery" : "1 — fire and forget");
  detail("settlement", config.settlement);
  detail("asset", config.assetId);
  detail("price", fmtAmount(config.signalPrice, config.assetDecimals, config.assetSymbol));
  if (mock) {
    warn("SETTLEMENT=mock — the protocol runs in full but NO funds move and hashes are fake.");
  }

  const facilitator = await startFacilitator();
  const agentB = await startAgentB(facilitator.address);

  // Balances before, so the closing summary can prove money actually moved.
  let before: { a: bigint; b: bigint } | null = null;
  if (!mock) {
    const reader = await loadAccount(walletConfig("AGENT_A"));
    before = {
      a: await assetBalance(reader, config.assetId, reader.address),
      b: await assetBalance(reader, config.assetId, agentB.address),
    };
  }

  try {
    const result = await runAgentA({ fallbackUrl: agentB.url });

    const rows: [string, string][] = [
      ["settled ix", result.transaction ?? "(none)"],
      ["price", fmtAmount(result.price, config.assetDecimals, config.assetSymbol)],
      ["tier", config.escrow ? "2 (escrow)" : "1"],
    ];

    if (!mock && before) {
      const reader = await loadAccount(walletConfig("AGENT_A"));
      const afterA = await assetBalance(reader, config.assetId, reader.address);
      const afterB = await assetBalance(reader, config.assetId, agentB.address);
      rows.push(
        ["agent-a balance", `${before.a} → ${afterA}`],
        ["agent-b balance", `${before.b} → ${afterB}`],
      );
      if (afterB - before.b !== BigInt(result.price)) {
        warn(`agent-b balance moved ${afterB - before.b}, expected ${result.price}`);
      } else {
        ok("on-chain balances confirm the payment landed");
      }
    }

    summary("Payment complete", rows);
  } finally {
    await agentB.close();
    await facilitator.close();
  }
}

main().catch((err) => {
  console.error(`\ndemo failed: ${(err as Error).message}\n`);
  process.exit(1);
});
