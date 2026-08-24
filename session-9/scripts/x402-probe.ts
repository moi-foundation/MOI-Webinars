// A stranger reads our invoice.
//
//   npm run x402:probe
//
// This file is deliberately ignorant. It imports NOTHING from @demo/shared, knows nothing about
// MOI, holds no wallet, and could not sign a MOI interaction if it wanted to. It is a plain HTTP
// client that speaks x402 and nothing else.
//
// It exists to test one claim honestly, in both directions:
//
//   ✅ Any x402 client can READ our invoice.  The envelope is the spec's, so a client that has
//      never heard of MOI extracts the price, the asset, the payee and the deadline correctly.
//
//   ❌ Only a client that implements our SCHEME can PAY it.  Settlement is chain-specific. A
//      generic client gets as far as "I understand what you want" and stops.
//
// Both halves are the point. The first is real interoperability at discovery and negotiation.
// The second is the part that "we support x402" claims usually blur, and we should not.

const SELLER = process.env.SELLER_URL ?? "http://localhost:4011";
const MARKET = process.argv[2] ?? "btc-drawdown-20";

// The spec's own enums, verbatim from x402@1.2.0. A real generic client validates against these.
const X402_SCHEMES = ["exact"] as const;
const X402_NETWORKS = [
  "abstract", "abstract-testnet", "base-sepolia", "base", "avalanche-fuji", "avalanche",
  "iotex", "solana-devnet", "solana", "sei", "sei-testnet", "polygon", "polygon-amoy",
  "peaq", "story", "educhain", "skale-base-sepolia",
] as const;

interface Requirements {
  scheme: string; network: string; maxAmountRequired: string; resource: string;
  description: string; mimeType: string; payTo: string; maxTimeoutSeconds: number;
  asset: string; extra?: Record<string, unknown>;
}

const line = (k: string, v: unknown) => console.log(`   ${k.padEnd(20)} ${String(v)}`);

async function main(): Promise<void> {
  const url = `${SELLER}/signal/${encodeURIComponent(MARKET)}`;
  console.log(`\n── x402 probe ─────────────────────────────────────────────────────────────────`);
  console.log(`   A generic x402 client. No MOI code, no wallet, no chain access.\n`);
  console.log(`   GET ${url}`);

  const res = await fetch(url);
  console.log(`   -> HTTP ${res.status}\n`);

  if (res.status !== 402) {
    console.error(`   Expected 402 Payment Required. Is the seller running? (npm run seller)\n`);
    process.exit(1);
  }

  const body = (await res.json()) as { x402Version?: number; accepts?: Requirements[] };

  // ── what a spec-compliant parser gets for free ───────────────────────────────────────────
  console.log(`── Parsed as x402 ─────────────────────────────────────────────────────────────`);
  line("x402Version", body.x402Version);
  line("accepts", `${body.accepts?.length ?? 0} option(s)`);

  const offers = body.accepts ?? [];
  if (offers.length === 0) {
    console.error(`\n   No payment options offered. Nothing to read.\n`);
    process.exit(1);
  }

  let readable = 0;
  for (const [i, r] of offers.entries()) {
    console.log(`\n   ── accepts[${i}] ──`);
    const required = ["scheme", "network", "maxAmountRequired", "resource", "description",
                      "mimeType", "payTo", "maxTimeoutSeconds", "asset"] as const;
    const missing = required.filter((k) => r[k] === undefined || r[k] === null);

    line("scheme", r.scheme);
    line("network", r.network);
    line("amount", `${r.maxAmountRequired} (atomic units)`);
    line("asset", r.asset);
    line("pay to", r.payTo);
    line("resource", r.resource);
    line("description", r.description);
    line("expires in", `${r.maxTimeoutSeconds}s`);
    if (r.extra) line("extra", JSON.stringify(r.extra));

    if (missing.length === 0) {
      readable++;
      console.log(`\n   ✅ Every spec field present. I know exactly what is being asked of me.`);
    } else {
      console.log(`\n   ❌ Missing spec fields: ${missing.join(", ")}`);
    }
  }

  // ── and now the wall ─────────────────────────────────────────────────────────────────────
  console.log(`\n── Can I pay it? ──────────────────────────────────────────────────────────────`);
  const payable = offers.filter(
    (r) => (X402_SCHEMES as readonly string[]).includes(r.scheme)
        && (X402_NETWORKS as readonly string[]).includes(r.network),
  );

  if (payable.length > 0) {
    console.log(`   ✅ ${payable.length} option(s) I can settle with a standard signer.`);
  } else {
    console.log(`   ❌ No. Not one of these is a scheme or network I implement.\n`);
    for (const r of offers) {
      const badScheme = !(X402_SCHEMES as readonly string[]).includes(r.scheme);
      const badNetwork = !(X402_NETWORKS as readonly string[]).includes(r.network);
      if (badScheme) line("unknown scheme", `${r.scheme}   (I ship: ${X402_SCHEMES.join(", ")})`);
      if (badNetwork) line("unknown network", `${r.network}   (not in the spec's 16)`);
    }
    console.log(`
   This is the honest boundary, and it is not a bug in either direction.

   I read the invoice perfectly — price, asset, payee, deadline, all of it — because
   the ENVELOPE is the x402 spec's. That is what makes discovery and negotiation open.

   I cannot settle it, because SETTLEMENT is chain-specific and I do not implement
   "${offers[0]?.scheme}". A MOI-aware client does, and pays it in one more round trip.`);
  }

  console.log(`\n── Verdict ────────────────────────────────────────────────────────────────────`);
  line("spec-readable", `${readable}/${offers.length} option(s)`);
  line("settleable by me", `${payable.length}/${offers.length}`);
  console.log(`
   Any x402 client can READ our invoice.
   Only a client implementing our scheme can PAY it.
`);
}

main().catch((e) => { console.error(`\nprobe failed: ${(e as Error).message}\n`); process.exit(1); });
