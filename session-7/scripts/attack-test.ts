// Adversarial tests against a running facilitator.
//
//   pnpm attack-test
//
// A passing happy path proves nothing about whether the 9 checks do any work. This fires forged
// payments at a real facilitator over real HTTP and asserts each is rejected for the RIGHT reason
// — plus an honest control, because a facilitator that rejected everything would otherwise "pass".
//
// Runs against real devnet, so it needs a funded buyer and a completed setup. Each honest case
// costs one real MAS0 transfer of PRICE_PER_BOOK (1 base unit by default), so the whole suite
// moves a handful of base units. Slower than a unit test — it is verifying the real chain reads.

import {
  config, SCHEME, NETWORK, X402_VERSION,
  loadAccount, buyerAccount, sellerAccount,
  canonicalAuthorizationBytes, randomNonce, nowSeconds,
  createAgentEntry,
  banner, detail, ok, fail, summary,
  type Account, type PaymentAuthorization, type PaymentPayload,
  type PaymentRequirements, type VerifyResponse,
} from "@demo/shared";
import { updateAgentWallet, registryClient } from "@demo/shared";
import { MAS0AssetLogic, getAssetDriver } from "js-moi-sdk";
import { startFacilitator } from "@demo/facilitator";

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
  const ix = await new MAS0AssetLogic(config.assetId, from.wallet).transfer(to, amount).send();
  const r = (await ix.result()) as unknown as { error?: unknown };
  if (r?.error) throw new Error(`transfer reverted: ${JSON.stringify(r.error)}`);
  return ix.hash;
}

let failures = 0;

async function sign(signer: Account, auth: PaymentAuthorization): Promise<PaymentPayload> {
  const sigAlgo = signer.wallet.signingAlgorithms.ecdsa_secp256k1;
  return {
    x402Version: X402_VERSION,
    scheme: SCHEME,
    network: NETWORK,
    payload: {
      publicKey: signer.publicKey,
      keyId: signer.keyId,
      signature: await signer.wallet.sign(canonicalAuthorizationBytes(auth), signer.keyId, sigAlgo),
      authorization: auth,
    },
  };
}

async function post(
  url: string, payload: PaymentPayload, requirements: PaymentRequirements, path = "/verify",
): Promise<VerifyResponse> {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements }),
  });
  return (await res.json()) as VerifyResponse;
}

async function attack(
  name: string, expected: string, url: string,
  payload: PaymentPayload, requirements: PaymentRequirements,
): Promise<void> {
  const body = await post(url, payload, requirements);
  if (body.isValid) { fail(`${name} — ACCEPTED (should have been rejected!)`); failures++; return; }
  if (body.invalidReason !== expected) {
    fail(`${name} — rejected as "${body.invalidReason}", expected "${expected}"`);
    failures++;
    return;
  }
  ok(`${name} → ${body.invalidReason}`);
}

async function main(): Promise<void> {
  const buyer = await buyerAccount();
  const seller = await sellerAccount();
  // A genuinely unrelated wallet — a different derivation path, so a different key.
  const attacker = await loadAccount("attacker", "m/44'/6174'/7020'/0/99");

  // Uses the agents `pnpm setup:registry` already put on chain.
  const sellerAgentId = config.sellerAgentId;
  if (!sellerAgentId) throw new Error("SELLER_AGENT_ID unset — run `pnpm setup:registry` first.");
  const held = await balanceOf(buyer, buyer.address);
  if (held < config.price * 6n) {
    throw new Error(
      `buyer holds ${held} ${config.assetSymbol}; this suite needs at least ${config.price * 6n}. ` +
      "Run `pnpm setup:asset`.",
    );
  }

  const reg = await registryClient(buyer, false);
  const facilitator = await startFacilitator();
  const resource = `${config.sellerUrl}/book/the-prince`;
  const price = config.price;

  const requirements: PaymentRequirements = {
    scheme: SCHEME, network: NETWORK,
    maxAmountRequired: price.toString(),
    resource, description: "test", mimeType: "application/json",
    payTo: seller.address, maxTimeoutSeconds: 60, asset: config.assetId,
    extra: { symbol: config.assetSymbol, payToAgentId: sellerAgentId },
  };

  /** A fresh, genuine on-chain transfer + a matching authorization. */
  const honest = async (): Promise<{ auth: PaymentAuthorization; txHash: string }> => {
    const txHash = await realTransfer(buyer, seller.address, price);
    const now = nowSeconds();
    return {
      txHash,
      auth: {
        from: buyer.address, to: seller.address, asset: config.assetId,
        value: price.toString(), txHash,
        validAfter: String(now - 5), validBefore: String(now + 120),
        nonce: randomNonce(), resource,
      },
    };
  };

  banner("DEMO", "attack", "Adversarial tests — every one of these must be REJECTED");
  detail("facilitator", facilitator.url);
  detail("buyer balance", `${held} ${config.assetSymbol}`);

  try {
    // 0. CONTROL. Without this, a facilitator that rejects everything would pass the suite.
    {
      const { auth } = await honest();
      const body = await post(facilitator.url, await sign(buyer, auth), requirements);
      if (body.isValid) ok("control: an honest payment IS accepted");
      else { fail(`control: honest payment rejected as ${body.invalidReason}`); failures++; }
    }

    // 1. Tampered amount — signed for the real price, then rewritten downward.
    {
      const { auth } = await honest();
      const p = await sign(buyer, auth);
      p.payload.authorization = { ...auth, value: "0" };
      await attack("tampered amount", "invalid_signature", facilitator.url, p, requirements);
    }

    // 2. Redirected payee — signed, then `to` rewritten to the attacker.
    {
      const { auth } = await honest();
      const p = await sign(buyer, auth);
      p.payload.authorization = { ...auth, to: attacker.address };
      await attack("redirected payee", "invalid_signature", facilitator.url, p, requirements);
    }

    // 3. Impersonation — a well-signed authorization CLAIMING to come from an account the signer
    //    does not control. Note this is rejected at the SIGNATURE check rather than the key-binding
    //    check, because rewriting `from` after signing also breaks the signature. The key-binding
    //    check (4) is the backstop for the case where an attacker signs `from` honestly with a key
    //    outside that account's family.
    {
      const { auth } = await honest();
      const p = await sign(buyer, auth);
      p.payload.authorization = { ...auth, from: "0x" + "11".repeat(28) + "00000000" };
      await attack("impersonated payer", "invalid_signature", facilitator.url, p, requirements);
    }

    // 3b. The key-binding check on its own: sign `from` honestly, but with a foreign key.
    {
      const { auth } = await honest();
      const foreign = { ...auth, from: "0x" + "11".repeat(28) + "00000000" };
      const p = await sign(buyer, foreign);   // signature is VALID over this exact authorization
      await attack("valid signature, foreign account", "invalid_payload", facilitator.url, p, requirements);
    }

    // 4. Expired authorization.
    {
      const { auth } = await honest();
      const now = nowSeconds();
      const p = await sign(buyer, { ...auth, validAfter: String(now - 600), validBefore: String(now - 300) });
      await attack("expired authorization", "payment_expired", facilitator.url, p, requirements);
    }

    // 5. Authorization signed for a DIFFERENT resource.
    {
      const { auth } = await honest();
      const p = await sign(buyer, { ...auth, resource: "http://evil.test/other" });
      await attack("authorization for another resource", "invalid_payment_requirements", facilitator.url, p, requirements);
    }

    // 6. Underpayment — honestly signed, but for less than asked.
    {
      const txHash = await realTransfer(buyer, seller.address, price);
      const now = nowSeconds();
      const p = await sign(buyer, {
        from: buyer.address, to: seller.address, asset: config.assetId,
        value: "0", txHash, validAfter: String(now - 5), validBefore: String(now + 120),
        nonce: randomNonce(), resource,
      });
      await attack("underpayment", "invalid_payment_requirements", facilitator.url, p, requirements);
    }

    // 7. Invented transfer — a well-signed authorization naming a tx that never happened.
    {
      const now = nowSeconds();
      const p = await sign(buyer, {
        from: buyer.address, to: seller.address, asset: config.assetId,
        value: price.toString(), txHash: "0x" + "ab".repeat(32),
        validAfter: String(now - 5), validBefore: String(now + 120),
        nonce: randomNonce(), resource,
      });
      await attack("invented transfer hash", "transfer_not_found", facilitator.url, p, requirements);
    }

    // 8. Someone else's transfer — reusing a payment the ATTACKER made to the seller.
    {
      // A transfer the BUYER made to itself — a real interaction that is not a payment to the seller.
      const txHash = await realTransfer(buyer, attacker.address, price);
      const now = nowSeconds();
      const p = await sign(buyer, {
        from: buyer.address, to: seller.address, asset: config.assetId,
        value: price.toString(), txHash,
        validAfter: String(now - 5), validBefore: String(now + 120),
        nonce: randomNonce(), resource,
      });
      await attack("someone else's transfer", "transfer_mismatch", facilitator.url, p, requirements);
    }

    // 9. Replay — settle a genuine payment twice. The second must be refused.
    {
      const { auth } = await honest();
      const p = await sign(buyer, auth);
      const first = await post(facilitator.url, p, requirements, "/settle");
      if (!(first as unknown as { success?: boolean }).success) {
        fail(`replay setup: first settle failed (${JSON.stringify(first)})`); failures++;
      } else {
        const second = await post(facilitator.url, p, requirements, "/settle");
        const reason = (second as unknown as { errorReason?: string }).errorReason;
        if ((second as unknown as { success?: boolean }).success) {
          fail("replay: the SAME transfer settled twice"); failures++;
        } else if (reason !== "duplicate_settlement") {
          fail(`replay: refused as "${reason}", expected "duplicate_settlement"`); failures++;
        } else ok("replayed settlement → duplicate_settlement");
      }
    }

    // 10. Registry tamper — the seller's on-chain wallet no longer matches payTo.
    {
      const { auth } = await honest();
      const p = await sign(buyer, auth);
      await updateAgentWallet(reg, sellerAgentId, "0x" + "de".repeat(28) + "00000000");
      await attack("registry says a different wallet", "payee_wallet_mismatch", facilitator.url, p, requirements);
      await updateAgentWallet(reg, sellerAgentId, seller.address);
    }
  } finally {
    await facilitator.close();
  }

  summary(failures === 0 ? "All attacks rejected" : "SECURITY TEST FAILED", [
    ["failures", String(failures)],
    ["network", "MOI Voyage devnet"],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nattack-test failed: ${(e as Error).message}\n`); process.exit(1); });
