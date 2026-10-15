// SPIKE — does MOI's allowance path actually behave the way session 7's post claims?
//
//   npx tsx scripts/spike-allowance.ts
//
// Session 7 asserted, from reading the asset source only, that value moves either under the
// holder's own signature OR under "a capped, expiring allowance naming a specific spender".
// We never ran the second half — only one wallet was funded. Session 8's whole design rests on
// it, so this proves or kills it BEFORE any agent code gets written.
//
// ⚠️ MAS0 FAILS SILENTLY. In session 7 a rejected pull returned an interaction hash with
// `opError: none` — indistinguishable from success. The ONLY reliable oracle is a balance diff.
// Every assertion below diffs balances. Never trust the receipt alone.
//
// Roles: OWNER holds the float. AGENT is the approved spender and holds no float. SELLER is the
// third party being paid. The question is whether AGENT can move OWNER's funds to SELLER, only
// up to the cap, and not at all after a revoke.

import {
  config, loadAccount, buyerAccount, sellerAccount,
  banner, detail, ok, fail, summary, type Account,
} from "@demo/shared";
import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";

const FUEL = { fuel_limit: 200_000 };

async function balance(reader: Account, holder: string): Promise<bigint> {
  try {
    const driver: any = await getAssetDriver(config.assetId, reader.wallet);
    const { output, error } = await driver.routines.BalanceOf(holder);
    if (error) {
      const m = String(error.error ?? error.message ?? JSON.stringify(error));
      if (!/asset not found|token not found/i.test(m)) throw new Error(m);
    }
    return BigInt(output?.balance ?? 0);
  } catch { return 0n; }
}

interface Moved { ownerDelta: bigint; sellerDelta: bigint; hash: string | null; threw: string | null }

/** Run an operation and report what ACTUALLY moved, regardless of what the receipt says. */
async function observe(
  reader: Account, owner: string, seller: string, op: () => Promise<string>,
): Promise<Moved> {
  const o0 = await balance(reader, owner);
  const s0 = await balance(reader, seller);
  let hash: string | null = null;
  let threw: string | null = null;
  try { hash = await op(); } catch (e) { threw = (e as Error).message; }
  const o1 = await balance(reader, owner);
  const s1 = await balance(reader, seller);
  return { ownerDelta: o1 - o0, sellerDelta: s1 - s0, hash, threw };
}

async function send(ctx: any): Promise<string> {
  const ix = await ctx.send(FUEL);
  const r = (await ix.result()) as unknown as { error?: unknown };
  if (r?.error) throw new Error(JSON.stringify(r.error));
  return ix.hash;
}

async function main(): Promise<void> {
  const owner = await buyerAccount();                                   // holds the float
  const seller = await sellerAccount();                                 // the payee
  const agent = await loadAccount("agent", "m/44'/6174'/7020'/0/42");   // the spender

  banner("SETUP", "allowance", "Can an approved spender move someone else's MAS0?");
  detail("owner  (benefactor)", owner.address);
  detail("agent  (spender)", agent.address);
  detail("seller (payee)", seller.address);

  const held = await balance(owner, owner.address);
  detail("owner balance", `${held} ${config.assetSymbol}`);
  if (held < 10n) throw new Error(`owner holds ${held}; need >= 10. Run \`npm run setup:asset\`.`);

  const agentFuel = await balance(agent, agent.address);
  detail("agent balance", `${agentFuel} ${config.assetSymbol} (should be 0 — it spends the OWNER's)`);

  const CAP = 5n;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  let failures = 0;
  const check = (name: string, pass: boolean, detailText: string) => {
    if (pass) ok(`${name} — ${detailText}`);
    else { fail(`${name} — ${detailText}`); failures++; }
  };

  // ── 0. CONTROL: unapproved pull must move nothing ────────────────────────────────────────
  {
    const m = await observe(owner, owner.address, seller.address, () =>
      send(new MAS0AssetLogic(config.assetId, agent.wallet).transferFrom(owner.address, seller.address, 1)));
    check("unapproved pull moves nothing", m.sellerDelta === 0n && m.ownerDelta === 0n,
      `owner ${m.ownerDelta}, seller ${m.sellerDelta}, hash ${m.hash ?? "-"}, threw ${m.threw ? "yes" : "no"}`);
    if (m.hash && !m.threw) detail("NOTE", "returned a hash with no error and still moved nothing — the silent-failure mode");
  }

  // ── 1. approve ───────────────────────────────────────────────────────────────────────────
  let approveHash = "";
  try {
    approveHash = await send(new MAS0AssetLogic(config.assetId, owner.wallet)
      .approve(agent.address, Number(CAP), expiresAt));
    ok(`approve(${agent.address.slice(0, 12)}…, ${CAP}, +1h) — ix ${approveHash}`);
  } catch (e) {
    fail(`approve reverted: ${(e as Error).message}`); failures++;
  }

  // ── 2. pull WITHIN the cap must actually move money ───────────────────────────────────────
  {
    const m = await observe(owner, owner.address, seller.address, () =>
      send(new MAS0AssetLogic(config.assetId, agent.wallet).transferFrom(owner.address, seller.address, 3)));
    check("pull within cap moves 3", m.sellerDelta === 3n && m.ownerDelta === -3n,
      `owner ${m.ownerDelta}, seller ${m.sellerDelta}, threw ${m.threw ?? "no"}`);
    if (m.hash) detail("transferFrom ix", m.hash);
  }

  // ── 3. pull OVER the remaining cap must move nothing ──────────────────────────────────────
  {
    const m = await observe(owner, owner.address, seller.address, () =>
      send(new MAS0AssetLogic(config.assetId, agent.wallet).transferFrom(owner.address, seller.address, 99)));
    check("pull over remaining cap moves nothing", m.sellerDelta === 0n && m.ownerDelta === 0n,
      `owner ${m.ownerDelta}, seller ${m.sellerDelta}, threw ${m.threw ?? "no"}`);
  }

  // ── 4. revoke, then any pull must move nothing ────────────────────────────────────────────
  {
    try {
      const h = await send(new MAS0AssetLogic(config.assetId, owner.wallet).revoke(agent.address));
      ok(`revoke — ix ${h}`);
    } catch (e) { fail(`revoke reverted: ${(e as Error).message}`); failures++; }

    const m = await observe(owner, owner.address, seller.address, () =>
      send(new MAS0AssetLogic(config.assetId, agent.wallet).transferFrom(owner.address, seller.address, 1)));
    check("pull after revoke moves nothing", m.sellerDelta === 0n && m.ownerDelta === 0n,
      `owner ${m.ownerDelta}, seller ${m.sellerDelta}, threw ${m.threw ?? "no"}`);
  }

  summary(failures === 0 ? "Allowance path behaves as session 8 needs" : "SPIKE FAILED — design must change", [
    ["failures", String(failures)],
    ["network", "MOI Voyage devnet"],
    ["note", "no allowance READ routine exists in MAS0 — remaining cap is not queryable"],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nspike failed: ${(e as Error).message}\n`); process.exit(1); });
