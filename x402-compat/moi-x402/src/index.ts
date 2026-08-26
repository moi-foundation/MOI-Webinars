// moi-x402 — the MOI payment mechanism for x402 v2.
//
// Three implementations against @x402/core's interfaces:
//
//   client       the buyer settles on MOI, then signs a claim naming that transfer
//   server       declares the `upfront` flow
//   facilitator  verifies by reading the chain; settle() confirms rather than executes
//
// Draft. Intended for upstream contribution as typescript/packages/mechanisms/moi.

export {
  MOI_NAMESPACE, MOI_SCHEME,
  MOI_DEVNET_CAIP2, MOI_MAINNET_CAIP2, MOI_WILDCARD_CAIP2,
  isMoiNetwork,
} from "./shared/network.js";

export {
  canonicalClaim, canonicalClaimBytes, nowSeconds, randomNonce, normalizeAddress,
  type MoiPaymentClaim, type MoiPaymentPayload,
} from "./shared/claim.js";

export {
  MoiExactScheme as MoiExactClientScheme,
  type MoiClientSigner, type MoiClientOptions,
} from "./client/index.js";

export {
  MoiExactScheme as MoiExactServerScheme,
  type MoiServerOptions,
} from "./server/index.js";

export {
  MoiExactScheme as MoiExactFacilitatorScheme,
  InMemorySpentStore,
  type MoiChainReader, type SpentStore,
} from "./facilitator/index.js";
