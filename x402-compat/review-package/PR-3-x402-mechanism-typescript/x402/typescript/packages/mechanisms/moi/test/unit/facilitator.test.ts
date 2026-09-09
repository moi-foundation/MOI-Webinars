import { describe, expect, it, vi } from "vitest";
import { MAS0_TRANSFER_CALLSITE } from "../../src/constants.js";
import { ExactMoiScheme, InMemorySpentStore } from "../../src/exact/facilitator/scheme.js";
import { canonicalClaimBytes } from "../../src/shared.js";
import type { MoiChainReader } from "../../src/signer.js";
import type { MoiPaymentClaim } from "../../src/types.js";

const PAYER = "0x00000000aaaa000000000000000000000000000000000000000000000000cccc";
const PAYEE = "0x00000000bbbb000000000000000000000000000000000000000000000000dddd";
const ASSET = "0x10800000eeee00000000000000000000000000000000000000000000000000ff";
const RESOURCE = "https://api.example.com/forecast";

const claim = (over: Partial<MoiPaymentClaim> = {}): MoiPaymentClaim => {
  const now = Math.floor(Date.now() / 1000);
  return {
    from: PAYER, to: PAYEE, asset: ASSET, value: "1000",
    txHash: "0x" + "ab".repeat(32), resource: RESOURCE,
    validAfter: String(now - 1), validBefore: String(now + 59),
    nonce: "0x" + "11".repeat(32),
    ...over,
  };
};

// `null` means the payload carries no ResourceInfo at all. An explicit `undefined` would hit
// the default parameter instead, which is how the fail-closed case first slipped through.
const payload = (c: MoiPaymentClaim, resourceUrl: string | null = RESOURCE) =>
  ({
    x402Version: 2,
    resource: resourceUrl === null ? undefined : { url: resourceUrl },
    accepted: {} as never,
    payload: { publicKey: "02aa", keyId: 0, signature: "0xsig", claim: c },
  }) as never;

const requirements = (over: Record<string, unknown> = {}) =>
  ({
    scheme: "exact", network: "moi:devnet", asset: ASSET, amount: "1000",
    payTo: PAYEE, maxTimeoutSeconds: 60, extra: { resource: RESOURCE },
    ...over,
  }) as never;

const chain = (over: Partial<MoiChainReader> = {}): MoiChainReader => ({
  verifySignature: () => true,
  identifierFromPublicKey: () => PAYER,
  readTransfer: async () => ({
    sender: PAYER, beneficiary: PAYEE, amount: 1000n,
    assetId: ASSET, callsite: MAS0_TRANSFER_CALLSITE, succeeded: true,
  }),
  ...over,
});

describe("ExactMoiScheme facilitator", () => {
  it("settles a well-formed payment", async () => {
    const scheme = new ExactMoiScheme(chain());
    const result = await scheme.settle(payload(claim()), requirements());
    expect(result.success).toBe(true);
    expect(result.payer).toBe(PAYER);
  });

  it("rejects a claim whose resource is not the resource being bought", async () => {
    // The binding exists to stop a claim for a cheap resource settling a request for another.
    const scheme = new ExactMoiScheme(chain());
    const result = await scheme.settle(
      payload(claim({ resource: "https://api.example.com/cheap" })),
      requirements(),
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/resource/i);
  });

  it("fails closed when the payload carries no resource", async () => {
    const scheme = new ExactMoiScheme(chain());
    const result = await scheme.settle(payload(claim(), null), requirements());
    expect(result.success).toBe(false);
  });

  it("rejects a validity window wider than the seller quoted", async () => {
    const now = Math.floor(Date.now() / 1000);
    const scheme = new ExactMoiScheme(chain());
    const result = await scheme.settle(
      payload(claim({ validAfter: String(now - 1), validBefore: String(now + 600) })),
      requirements({ maxTimeoutSeconds: 60 }),
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/exceeds the quoted/);
  });

  it("rejects a signing key that does not control the paying account", async () => {
    // A valid signature alone could still name someone else's transfer.
    const scheme = new ExactMoiScheme(chain({ identifierFromPublicKey: () => PAYEE }));
    const result = await scheme.settle(payload(claim()), requirements());
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/cannot control/);
  });

  it("rejects a transfer that was mined but reverted", async () => {
    // A refused MAS0 transfer still returns an interaction hash.
    const scheme = new ExactMoiScheme(
      chain({
        readTransfer: async () => ({
          sender: PAYER, beneficiary: PAYEE, amount: 1000n,
          assetId: ASSET, callsite: MAS0_TRANSFER_CALLSITE, succeeded: false,
        }),
      }),
    );
    const result = await scheme.settle(payload(claim()), requirements());
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/reverted/);
  });

  it("rejects an operation that is not a MAS0 Transfer", async () => {
    const scheme = new ExactMoiScheme(
      chain({
        readTransfer: async () => ({
          sender: PAYER, beneficiary: PAYEE, amount: 1000n,
          assetId: ASSET, callsite: "TransferFrom", succeeded: true,
        }),
      }),
    );
    const result = await scheme.settle(payload(claim()), requirements());
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/callsite/);
  });

  it("rejects an underpaying transfer and accepts an overpaying one", async () => {
    const under = new ExactMoiScheme(
      chain({
        readTransfer: async () => ({
          sender: PAYER, beneficiary: PAYEE, amount: 999n,
          assetId: ASSET, callsite: MAS0_TRANSFER_CALLSITE, succeeded: true,
        }),
      }),
    );
    expect((await under.settle(payload(claim()), requirements())).success).toBe(false);

    const over = new ExactMoiScheme(
      chain({
        readTransfer: async () => ({
          sender: PAYER, beneficiary: PAYEE, amount: 5000n,
          assetId: ASSET, callsite: MAS0_TRANSFER_CALLSITE, succeeded: true,
        }),
      }),
    );
    expect((await over.settle(payload(claim()), requirements())).success).toBe(true);
  });

  it("spends a transfer once", async () => {
    const scheme = new ExactMoiScheme(chain());
    const first = await scheme.settle(payload(claim()), requirements());
    const second = await scheme.settle(payload(claim()), requirements());
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.errorReason).toBe("moi_exact_already_spent");
  });

  it("reserves atomically, so concurrent settlements cannot both win", async () => {
    const scheme = new ExactMoiScheme(chain());
    const results = await Promise.all([
      scheme.settle(payload(claim()), requirements()),
      scheme.settle(payload(claim()), requirements()),
    ]);
    expect(results.filter(r => r.success)).toHaveLength(1);
  });

  it("signs nothing and sponsors nothing", () => {
    const scheme = new ExactMoiScheme(chain());
    expect(scheme.getSigners("moi:devnet")).toEqual([]);
    expect(scheme.areFeesSponsored).toBe(false);
    // paymentFlow is core's to write, not the facilitator's.
    expect(scheme.getExtra("moi:devnet" as never)).not.toHaveProperty("paymentFlow");
  });

  it("checks the signature over the canonical claim bytes", async () => {
    const verify = vi.fn().mockReturnValue(true);
    const scheme = new ExactMoiScheme(chain({ verifySignature: verify }));
    const c = claim();
    await scheme.settle(payload(c), requirements());
    expect(verify).toHaveBeenCalledWith(canonicalClaimBytes(c), "0xsig", "02aa");
  });
});

describe("InMemorySpentStore", () => {
  it("lets one caller claim a hash", () => {
    const store = new InMemorySpentStore();
    expect(store.reserve("0xAB")).toBe(true);
    expect(store.reserve("0xab")).toBe(false);
  });
});
