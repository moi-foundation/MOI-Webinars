// MOI's CAIP-2 identifiers.
//
// ⚠️ PROVISIONAL. The `moi` namespace is NOT yet registered with the Chain Agnostic Standards
// Alliance — see ../../caip2-submission/. Until that PR merges these strings are a proposal, and
// anything published against them would break if CASA lands on a different shape.
//
// The reference half is also unresolved. CAIP-2 expects a client to be able to ASK a node which
// network it is on. MOI exposes no such method today — see FINDINGS.md §9 — so the values below
// assume a well-known name, the way Stellar uses `testnet` / `pubnet`.

import type { Network } from "@x402/core/types";

export const MOI_NAMESPACE = "moi";

/** MOI Voyage devnet. */
export const MOI_DEVNET_CAIP2 = "moi:devnet" as Network;
/** MOI mainnet. Named for completeness; not yet live. */
export const MOI_MAINNET_CAIP2 = "moi:mainnet" as Network;
/** Matches any MOI network. Used by the facilitator to declare its family. */
export const MOI_WILDCARD_CAIP2 = "moi:*";

/** True when a CAIP-2 id belongs to the MOI namespace. */
export const isMoiNetwork = (network: string): boolean =>
  network.startsWith(`${MOI_NAMESPACE}:`);

/**
 * The scheme name. "exact" means the buyer pays exactly the quoted amount — the same scheme
 * every other mechanism implements. What differs on MOI is the FLOW, not the scheme.
 */
export const MOI_SCHEME = "exact";
