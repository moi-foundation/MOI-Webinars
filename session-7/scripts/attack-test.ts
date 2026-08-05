// Adversarial tests against the seller's verifier.
//
//   npm run attack-test
//
// A passing happy path proves nothing about whether the checks do any work. This forges payments
// and asserts each is rejected for the RIGHT reason — plus an honest control, because a verifier
// that rejected everything would otherwise "pass".
//
// With the facilitator gone these call verifyProof() directly rather than posting over HTTP. Same
// checks, no server to stand up. The last case is different in kind: the registry check now lives
// with the BUYER, so it is tested against checkSellerIdentity instead.
//
// Runs against real devnet, so it needs a funded buyer and a completed setup. Eleven of the twelve
// cases make a real MAS0 transfer at the cheapest market's price, so the suite moves ~11 base
// a unit test — it is verifying real chain reads.

import {
  config, NETWORK,
  loadAccount, buyerAccount, sellerAccount,
  canonicalClaimBytes, randomNonce, nowSeconds,
  ConsumedTransfers,
  updateAgentWallet, registryClient,
  banner, detail, ok, fail, summary,
  type Account, type PaymentClaim, type PaymentProof, type Quote,
} from "@demo/shared";
import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";
import { verifyProof } from "@demo/agent-seller/src/verify-proof.js";
import { findMarket } from "@demo/agent-seller/src/catalog.js";
import { checkSellerIdentity } from "@demo/agent-buyer/src/identity-check.js";

/** MAS0 balance in base units. Accounts that never held the asset report 0n. */
async function balanceOf(reader: Account, holder: string): Promise<bigint> {
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

/** A real MAS0 transfer, signed by the holder. Returns the interaction hash. */
async function realTransfer(from: Account, to: string, amount: bigint): Promise<string> {
  const ix = await new MAS0AssetLogic(config.assetId, from.wallet).transfer(to, Number(amount)).send();
  const r = (await ix.result()) as unknown as { error?: unknown };
  if (r?.error) throw new Error(`transfer reverted: ${JSON.stringify(r.error)}`);
  return ix.hash;
}

let failures = 0;

async function sign(signer: Account, claim: PaymentClaim): Promise<PaymentProof> {
  const sigAlgo = signer.wallet.signingAlgorithms.ecdsa_secp256k1;
  return {
    claim,
    publicKey: signer.publicKey,
    keyId: signer.keyId,
    signature: await signer.wallet.sign(canonicalClaimBytes(claim), signer.keyId, sigAlgo),
  };
}

async function main(): Promise<void> {
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  // A genuinely unrelated wallet — a different derivation path, so a different key.
  const attacker = await loadAccount("attacker", "m/44'/6174'/7020'/0/99");

  const sellerAgentId = config.sellerAgentId;
  if (!sellerAgentId) throw new Error("SELLER_AGENT_ID unset — run `npm run setup:registry` first.");

  const reg = await registryClient(buyer, false);
  // The cheapest market on purpose — the suite makes ~11 real transfers and this is not the thing
  // being tested. Price comes from the catalog, same as it would for a real buyer.
  const market = findMarket("btc-100k-2026")!;
  const resource = `${config.sellerUrl}/signal/${market.id}`;
  const price = market.price;

  const needed = price * 12n;
  const held = await balanceOf(buyer, buyer.address);
  if (held < needed) {
    throw new Error(
      `buyer holds ${held} ${config.assetSymbol}; this suite needs at least ${needed}. ` +
      "Run `npm run setup:asset`.",
    );
  }

  const quote: Quote = {
    price: price.toString(),
    symbol: config.assetSymbol,
    asset: config.assetId,
    payTo: seller.address,
    payToAgentId: sellerAgentId,
    resource,
    description: "test",
    network: NETWORK,
    ttlSeconds: 120,
  };

  // Shared across cases so the replay test sees the same spent-set the others populated.
  const consumed = new ConsumedTransfers();

  const attack = async (name: string, expected: string, proof: PaymentProof): Promise<void> => {
    const out = await verifyProof({ seller, consumed, proof, quote, consume: false });
    if (out.ok) { fail(`${name} — ACCEPTED (should have been rejected!)`); failures++; return; }
    if (out.reason !== expected) {
      fail(`${name} — rejected as "${out.reason}", expected "${expected}"`);
      failures++;
      return;
    }
    ok(`${name} → ${out.reason}`);
  };

  /** A fresh, genuine on-chain transfer + a matching claim. */
  const honest = async (): Promise<PaymentClaim> => {
    const txHash = await realTransfer(buyer, seller.address, price);
    return {
      from: buyer.address, to: seller.address, asset: config.assetId,
      value: price.toString(), txHash, resource,
      nonce: randomNonce(), expiresAt: nowSeconds() + 120,
    };
  };

  banner("DEMO", "attack", "Adversarial tests — every one of these must be REJECTED");
  detail("buyer balance", `${held} ${config.assetSymbol}`);
  detail("suite cost", `~${needed} ${config.assetSymbol} in real transfers`);

  // 0. CONTROL. Without this, a verifier that rejects everything would pass the suite.
  {
    const out = await verifyProof({
      seller, consumed, proof: await sign(buyer, await honest()), quote, consume: false,
    });
    if (out.ok) ok("control: an honest payment IS accepted");
    else { fail(`control: honest payment rejected as ${out.reason}`); failures++; }
  }

  // 1. Tampered amount — signed for the real price, then rewritten downward.
  {
    const claim = await honest();
    const p = await sign(buyer, claim);
    p.claim = { ...claim, value: "0" };
    await attack("tampered amount", "invalid_signature", p);
  }

  // 2. Redirected payee — signed, then `to` rewritten to the attacker.
  {
    const claim = await honest();
    const p = await sign(buyer, claim);
    p.claim = { ...claim, to: attacker.address };
    await attack("redirected payee", "invalid_signature", p);
  }

  // 3. Impersonation — rewriting `from` after signing. Caught at the SIGNATURE check, because
  //    editing the claim breaks the signature over it. Case 3b is what the key-binding check is
  //    actually for.
  {
    const claim = await honest();
    const p = await sign(buyer, claim);
    p.claim = { ...claim, from: "0x" + "11".repeat(28) + "00000000" };
    await attack("impersonated payer", "invalid_signature", p);
  }

  // 3b. The key-binding check on its own: sign `from` honestly, but with a foreign key.
  {
    const claim = await honest();
    const p = await sign(buyer, { ...claim, from: "0x" + "11".repeat(28) + "00000000" });
    await attack("valid signature, foreign account", "invalid_proof", p);
  }

  // 4. Expired claim.
  {
    const claim = await honest();
    await attack("expired claim", "payment_expired",
      await sign(buyer, { ...claim, expiresAt: nowSeconds() - 300 }));
  }

  // 5. Claim signed for a DIFFERENT resource.
  {
    const claim = await honest();
    await attack("claim for another resource", "quote_mismatch",
      await sign(buyer, { ...claim, resource: "http://evil.test/other" }));
  }

  // 6. Underpayment — honestly signed, but for less than asked.
  {
    const txHash = await realTransfer(buyer, seller.address, price);
    await attack("underpayment", "quote_mismatch", await sign(buyer, {
      from: buyer.address, to: seller.address, asset: config.assetId,
      value: "0", txHash, resource, nonce: randomNonce(), expiresAt: nowSeconds() + 120,
    }));
  }

  // 7. Invented transfer — a well-signed claim naming a tx that never happened.
  {
    await attack("invented transfer hash", "transfer_not_found", await sign(buyer, {
      from: buyer.address, to: seller.address, asset: config.assetId,
      value: price.toString(), txHash: "0x" + "ab".repeat(32),
      resource, nonce: randomNonce(), expiresAt: nowSeconds() + 120,
    }));
  }

  // 8. A real transfer that is not a payment to the seller. Buyer to itself, because a transfer
  //    to the attacker's wallet fails with "account not found" — it has never been funded, so it
  //    does not exist on chain. A self-transfer is a genuine interaction with the wrong payee,
  //    which is exactly what this case needs.
  {
    const txHash = await realTransfer(buyer, buyer.address, price);
    await attack("someone else's transfer", "transfer_mismatch", await sign(buyer, {
      from: buyer.address, to: seller.address, asset: config.assetId,
      value: price.toString(), txHash, resource,
      nonce: randomNonce(), expiresAt: nowSeconds() + 120,
    }));
  }

  // 9. Replay — redeem a genuine payment twice. The second must be refused.
  {
    const p = await sign(buyer, await honest());
    const first = await verifyProof({ seller, consumed, proof: p, quote, consume: true });
    if (!first.ok) {
      fail(`replay setup: first redemption failed (${first.reason})`); failures++;
    } else {
      await attack("replayed payment", "already_spent", p);
    }
  }

  // 10. Registry tamper. This one is NOT the seller's check any more — the buyer is the party at
  //     risk, so it refuses before paying. Tested where it now lives.
  {
    await updateAgentWallet(reg, sellerAgentId, "0x" + "de".repeat(28) + "00000000");
    try {
      const verdict = await checkSellerIdentity(reg, quote);
      if (verdict.ok) { fail("registry tamper — buyer would have PAID an attacker!"); failures++; }
      else ok("registry says a different wallet → buyer refuses before paying");
    } finally {
      await updateAgentWallet(reg, sellerAgentId, seller.address);
    }
  }

  summary(failures === 0 ? "All attacks rejected" : "SECURITY TEST FAILED", [
    ["failures", String(failures)],
    ["network", "MOI Voyage devnet"],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nattack-test failed: ${(e as Error).message}\n`); process.exit(1); });
