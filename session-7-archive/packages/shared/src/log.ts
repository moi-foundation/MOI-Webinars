// Demo-legible logging.
//
// This is a live vibe-coding talk: an audience has to follow the payment flow from the back of a
// room. Every step of the x402 handshake prints a labeled, colour-coded banner naming the actor
// and the step number. Nothing here is decoration — it IS the demo.

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY !== false;

const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const bold = (s: string) => paint("1", s);
export const dim = (s: string) => paint("2", s);
export const red = (s: string) => paint("31", s);
export const green = (s: string) => paint("32", s);
export const yellow = (s: string) => paint("33", s);
export const blue = (s: string) => paint("34", s);
export const magenta = (s: string) => paint("35", s);
export const cyan = (s: string) => paint("36", s);

/** Each actor gets a stable colour so the audience can track who is speaking. */
export const ACTORS = {
  "AGENT-A": { color: cyan, role: "buyer" },
  "AGENT-B": { color: magenta, role: "seller" },
  FACILITATOR: { color: yellow, role: "settlement" },
  SETUP: { color: blue, role: "setup" },
  DEMO: { color: green, role: "orchestrator" },
} as const;

export type ActorName = keyof typeof ACTORS;

const WIDTH = 78;

/** A full-width labeled banner. Use for each numbered step of the payment flow. */
export function banner(actor: ActorName, step: string, title: string): void {
  const color = ACTORS[actor].color;
  const label = `${actor} · ${step}`;
  const line = `── ${label} ${"─".repeat(Math.max(0, WIDTH - label.length - 4))}`;
  console.log("");
  console.log(color(bold(line)));
  console.log(color(bold(`   ${title}`)));
}

/** A key/value detail line under a banner. */
export function detail(key: string, value: string | number | bigint): void {
  console.log(`   ${dim(key.padEnd(20))} ${value}`);
}

/** A plain narrative line attributed to an actor. */
export function say(actor: ActorName, message: string): void {
  console.log(`${ACTORS[actor].color(bold(`[${actor}]`))} ${message}`);
}

export function ok(message: string): void {
  console.log(`   ${green("✓")} ${message}`);
}

export function fail(message: string): void {
  console.log(`   ${red("✗")} ${message}`);
}

export function warn(message: string): void {
  console.log(`   ${yellow("!")} ${message}`);
}

/** Renders a facilitator verification check as a pass/fail line. */
export function check(name: string, passed: boolean, detailText: string): void {
  const mark = passed ? green("✓") : red("✗");
  console.log(`   ${mark} ${name.padEnd(28)} ${dim(detailText)}`);
}

/** Truncate a long hex string for display without losing its identity. */
export function short(hex: string, head = 10, tail = 6): string {
  if (!hex) return "(none)";
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/**
 * Truncate a MOI identifier or asset id.
 *
 * MOI identifiers are `0x` + a 4-byte tag + a 24-byte fingerprint + 4 zero bytes, so a naive
 * head/tail truncation renders EVERY account as `0x00000000…000000` — visually identical, which
 * is worse than useless on a projector. Show the fingerprint instead: that is the part that
 * actually distinguishes one agent from another.
 */
export function shortId(hex: string, keep = 8): string {
  if (!hex) return "(none)";
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length !== 64) return short(hex);
  const fingerprint = body.slice(8, 56); // skip the 4-byte tag, drop the 4-byte trailer
  return `0x…${fingerprint.slice(0, keep)}…${fingerprint.slice(-keep)}…`;
}

/** Render atomic units as a decimal amount with a symbol. */
export function amount(atomic: string | bigint, decimals: number, symbol: string): string {
  const v = BigInt(atomic);
  if (decimals === 0) return `${v} ${symbol}`;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} ${symbol}`;
}

/** A closing summary box for the end of the demo. */
export function summary(title: string, rows: [string, string][]): void {
  console.log("");
  console.log(green(bold(`╔═ ${title} ${"═".repeat(Math.max(0, WIDTH - title.length - 4))}`)));
  for (const [k, v] of rows) {
    console.log(`${green(bold("║"))} ${dim(k.padEnd(22))} ${v}`);
  }
  console.log(green(bold(`╚${"═".repeat(WIDTH)}`)));
  console.log("");
}
