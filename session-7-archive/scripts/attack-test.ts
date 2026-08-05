// Adversarial tests against a running facilitator.
//
//   SETTLEMENT=mock npm run attack-test
//
// Proves the verification chain actually rejects forged payments over real HTTP — a passing happy
// path says nothing about whether the checks do any work. Doubles as a demo segment: "here is what
// happens when an agent lies."
//
// Runs against the mock backend by default so it needs no funded wallets; the checks under test
// (signature, key binding, requirements match, freshness) are chain-independent.

import {
  config,
  walletConfig,
  loadAccount,
  createSettlementBackend,
  signAuthorization,
  randomNonce,
  nowSeconds,
  encodePaymentHeader,
  banner,
  detail,
  ok,
  fail,
  summary,
  MOI_SCHEME,
  MOI_NETWORK,
  X402_VERSION,
  type MoiPaymentAuthorization,
  type MoiPaymentPayload,
  type MoiPaymentRequirements,
  type VerifyResponse,
} from "@s7/shared";
import { startFacilitator } from "@s7/facilitator";

let failures = 0;

async function attack(
  name: string,
  expectedReason: string,
  facilitatorUrl: string,
  payload: MoiPaymentPayload,
  requirements: MoiPaymentRequirements,
): Promise<void> {
  const res = await fetch(`${facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x402Version: X402_VERSION,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
  });
  const body = (await res.json()) as VerifyResponse;

  if (body.isValid) {
    fail(`${name} — ACCEPTED (should have been rejected!)`);
    failures++;
    return;
  }
  if (body.invalidReason !== expectedReason) {
    fail(`${name} — rejected, but as "${body.invalidReason}" not "${expectedReason}"`);
    failures++;
    return;
  }
  ok(`${name} → rejected: ${body.invalidReason}`);
}

async function main(): Promise<void> {
  const facilitator = await startFacilitator();
  const buyer = await loadAccount(walletConfig("AGENT_A"));
  const attacker = await loadAccount(walletConfig("AGENT_B"));
  const backend = createSettlementBackend(config.settlement);

  const resource = "http://127.0.0.1:4022/signal";
  const price = config.signalPrice;

  const requirements: MoiPaymentRequirements = {
    scheme: MOI_SCHEME,
    network: MOI_NETWORK,
    maxAmountRequired: price,
    resource,
    description: "test",
    mimeType: "application/json",
    payTo: attacker.address,
    maxTimeoutSeconds: 60,
    asset: config.assetId,
    extra: {
      symbol: config.assetSymbol,
      decimals: config.assetDecimals,
      facilitator: facilitator.address,
    },
  };

  const baseAuth = (): MoiPaymentAuthorization => ({
    from: buyer.address,
    to: attacker.address,
    asset: config.assetId,
    value: price,
    validAfter: String(nowSeconds() - 5),
    validBefore: String(nowSeconds() + 120),
    nonce: randomNonce(),
    resource,
  });

  const sign = async (auth: MoiPaymentAuthorization, signer = buyer): Promise<MoiPaymentPayload> => ({
    x402Version: X402_VERSION,
    scheme: MOI_SCHEME,
    network: MOI_NETWORK,
    payload: {
      publicKey: signer.publicKey,
      keyId: signer.keyId,
      signature: await signAuthorization(signer, auth),
      authorization: auth,
    },
  });

  // Escrow a legitimate amount so `funds_escrowed_on_chain` is not what fails first — we want the
  // EARLIER checks to be what rejects each attack.
  await backend.fund({
    payer: buyer,
    facilitator: facilitator.address,
    assetId: config.assetId,
    amount: BigInt(price) * 10n,
  });

  banner("DEMO", "attack", "Adversarial tests — every one of these must be REJECTED");
  detail("facilitator", facilitator.url);
  detail("settlement", backend.name);

  try {
    // 1. Sanity: an honest payment is accepted. Without this, a facilitator that rejects
    //    everything would "pass" every test below.
    const honest = await sign(baseAuth());
    const res = await fetch(`${facilitator.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload: honest,
        paymentRequirements: requirements,
      }),
    });
    const body = (await res.json()) as VerifyResponse;
    if (body.isValid) ok("control: an honest payment IS accepted");
    else {
      fail(`control: honest payment rejected as ${body.invalidReason}`);
      failures++;
    }

    // 2. Tampered amount: sign for the real price, then rewrite the value downward.
    const cheap = await sign(baseAuth());
    cheap.payload.authorization = { ...cheap.payload.authorization, value: "1" };
    await attack("tampered amount", "invalid_signature", facilitator.url, cheap, requirements);

    // 3. Redirected payee: sign, then rewrite `to` to the attacker's own account.
    const stolen = await sign(baseAuth());
    stolen.payload.authorization = { ...stolen.payload.authorization, to: buyer.address };
    await attack("redirected payee", "invalid_signature", facilitator.url, stolen, requirements);

    // 4. Impersonation: attacker signs an authorization that CLAIMS to be from the buyer.
    //    The signature is valid — but the key does not derive to the claimed account.
    const impersonated = await sign({ ...baseAuth(), from: buyer.address }, attacker);
    await attack("impersonated payer", "invalid_payload", facilitator.url, impersonated, requirements);

    // 5. Expired authorization.
    const expired = await sign({
      ...baseAuth(),
      validAfter: String(nowSeconds() - 600),
      validBefore: String(nowSeconds() - 300),
    });
    await attack("expired authorization", "payment_expired", facilitator.url, expired, requirements);

    // 6. Replay against a different resource than the one signed for.
    const wrongResource = await sign({ ...baseAuth(), resource: "http://evil.test/other" });
    await attack(
      "authorization for another resource",
      "invalid_payment_requirements",
      facilitator.url,
      wrongResource,
      requirements,
    );

    // 7. Underpayment: honestly signed, but for less than the seller asked.
    const underpaid = await sign({ ...baseAuth(), value: "1" });
    await attack(
      "underpayment",
      "invalid_payment_requirements",
      facilitator.url,
      underpaid,
      requirements,
    );
  } finally {
    await facilitator.close();
  }

  summary(failures === 0 ? "All attacks rejected" : "SECURITY TEST FAILED", [
    ["failures", String(failures)],
  ]);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nattack-test failed: ${(err as Error).message}\n`);
  process.exit(1);
});
