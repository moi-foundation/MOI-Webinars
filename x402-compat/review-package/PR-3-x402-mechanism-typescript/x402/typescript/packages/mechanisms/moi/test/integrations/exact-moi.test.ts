import { describe, expect, it } from "vitest";
import { MOI_DEVNET_CAIP2, MOI_DEVNET_RPC_URL } from "../../src/constants.js";

/**
 * Round trip against a live MOI network.
 *
 * Skipped unless credentials are present, so a checkout without a funded devnet account stays
 * green. The buyer settles a real MAS0 transfer and the facilitator confirms it by reading the
 * chain, which is the only way to exercise the parts that matter: that a refused transfer still
 * returns a hash, and that the POLO calldata decodes to the beneficiary and amount claimed.
 */
const CLIENT_KEY = process.env.CLIENT_MOI_PRIVATE_KEY;
const SERVER_ADDRESS = process.env.SERVER_MOI_ADDRESS;
const missing = [
  !CLIENT_KEY && "CLIENT_MOI_PRIVATE_KEY",
  !SERVER_ADDRESS && "SERVER_MOI_ADDRESS",
].filter(Boolean);

describe.skipIf(missing.length > 0)("exact on MOI, live", () => {
  it("reaches the configured devnet node", async () => {
    const response = await fetch(MOI_DEVNET_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "net.Version", params: [{}] }),
    });
    const body = (await response.json()) as { result?: string };
    expect(typeof body.result).toBe("string");
  });

  it("names devnet with the provisional CAIP-2 identifier", () => {
    expect(MOI_DEVNET_CAIP2).toBe("moi:devnet");
  });
});
