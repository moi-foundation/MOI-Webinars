/**
 * Default asset table.
 *
 * Deliberately empty. Other mechanisms map an asset to its decimals and symbol so that prices
 * like `"$0.10"` resolve, but a MAS0 asset carries neither on chain, so there is nothing to look
 * up and nothing honest to hard-code. Prices on MOI are quoted in atomic units.
 *
 * A caller that wants dollar pricing supplies its own decimals through the server scheme's
 * `assetDecimals` option, which makes the assumption explicit and local rather than implied by
 * this package.
 */
export const DEFAULT_ASSETS: Record<string, never[]> = {};
