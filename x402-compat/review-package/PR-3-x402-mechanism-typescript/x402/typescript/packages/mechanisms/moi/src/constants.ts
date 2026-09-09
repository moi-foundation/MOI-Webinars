import type { Network } from "@x402/core/types";

/**
 * CAIP-2 identifiers for MOI networks.
 *
 * The `moi` namespace is pending registration with the Chain Agnostic Standards Alliance, and
 * the reference format is pending a protocol decision on network identity. These values follow
 * CAIP-2 syntax and are provisional until that namespace merges.
 */
export const MOI_NAMESPACE = "moi";

/** Voyage devnet. The only live public MOI network. */
export const MOI_DEVNET_CAIP2 = "moi:devnet" as Network;

/** Reserved. MOI mainnet has not launched; clients MUST NOT treat it as resolvable. */
export const MOI_MAINNET_CAIP2 = "moi:mainnet" as Network;

/** Matches any MOI network. The facilitator declares this as its CAIP family. */
export const MOI_WILDCARD_CAIP2 = "moi:*";

/** The scheme this package implements. */
export const MOI_SCHEME = "exact";

/**
 * The callsite a MAS0 transfer invokes.
 *
 * MOI has no dedicated transfer opcode. A transfer is an ASSET_INVOKE operation routed to the
 * asset's `Transfer` routine by name, so the callsite is what identifies it.
 */
export const MAS0_TRANSFER_CALLSITE = "Transfer";

/** Operation type for ASSET_INVOKE, per js-moi-sdk's OpType enum. */
export const OP_ASSET_INVOKE = 5;

/** Interaction-level receipt status meaning the interaction succeeded. */
export const RECEIPT_STATUS_OK = 0;

/** Default JSON-RPC endpoint for Voyage devnet. */
export const MOI_DEVNET_RPC_URL = "https://dev.voyage-rpc.moi.technology/devnet/";

/** Seconds a claim stays valid when the requirements do not say. */
export const DEFAULT_CLAIM_TIMEOUT_SECONDS = 60;
