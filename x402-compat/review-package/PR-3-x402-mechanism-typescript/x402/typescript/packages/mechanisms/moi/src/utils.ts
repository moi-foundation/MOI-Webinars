import { MOI_NAMESPACE } from "./constants.js";

/**
 * Is this CAIP-2 identifier a MOI network?
 *
 * @param network - The identifier to test.
 * @returns True when the namespace is `moi`.
 */
export const isMoiNetwork = (network: string): boolean =>
  network.startsWith(`${MOI_NAMESPACE}:`);

/**
 * Compare two MOI identifiers.
 *
 * Participant and asset identifiers arrive from several sources — a payload, an RPC response,
 * configuration — and differ only in case or 0x prefix. Comparing them raw produces false
 * mismatches, so every comparison in this package goes through here.
 *
 * @param a - First identifier.
 * @param b - Second identifier.
 * @returns True when they name the same thing.
 */
export const sameId = (a: string | undefined, b: string | undefined): boolean =>
  normalizeId(a) === normalizeId(b) && normalizeId(a) !== "";

/**
 * Lower-case an identifier and drop its 0x prefix.
 *
 * @param value - The identifier.
 * @returns The normalized form, or an empty string when absent.
 */
export const normalizeId = (value: string | undefined): string =>
  (value ?? "").trim().toLowerCase().replace(/^0x/, "");

/**
 * Parse a hex or decimal quantity into a bigint.
 *
 * RPC responses return quantities as hex strings while payloads carry decimal strings. Both
 * reach the same comparisons, and Number() would lose precision above 2^53, so both parse to
 * bigint here.
 *
 * @param value - Hex (0x-prefixed) or decimal string, or a number.
 * @returns The value as a bigint.
 */
export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const trimmed = value.trim();
  return trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? BigInt(trimmed)
    : BigInt(trimmed === "" ? "0" : trimmed);
}
