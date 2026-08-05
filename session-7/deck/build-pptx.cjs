// Builds MOI_Builders_S7.pptx — 8 slides.
//
//   node build-pptx.cjs
//
// The deck deliberately does NOT carry the content. The live demo and the code walkthrough do that.
// These slides frame the session, cue the two live segments, and land the closing argument.
// Speaker notes on every slide are lifted from TRANSCRIPT.md.
//
// Palette, type and layout lifted from MOI_Builders_S5_2.pptx — read out of the file, not guessed:
//   fonts        Inter (headline/body) + JetBrains Mono (labels, code)
//   backgrounds  #0E1116 dark / #FFFFFF light, alternating
//   accent       #2D2BB6 on light · #8B8AF0 on dark
//   surfaces     #EEF0FB lavender · #F4F4F8 grey     borders #C9CBF0 · #E4E5EC
//   signals      #D6336C negative · #3CCB8E positive

const pptxgen = require("pptxgenjs");
const path = require("path");

/* ── palette ─────────────────────────────────────────────────────────────── */
const INK = "0E1116", WHITE = "FFFFFF";
const ACC_L = "2D2BB6", ACC_D = "8B8AF0";
const LAV = "EEF0FB", LAV_B = "C9CBF0";
const GREY = "F4F4F8", GREY_B = "E4E5EC";
const PINK = "D6336C", GREEN = "3CCB8E";
const T_MED = "5B6170", T_LOW = "9AA0AE";
const D_MED = "B9BECD", D_LOW = "6B7280", D_BORD = "2A2E37";

const SANS = "Inter", MONO = "JetBrains Mono";
const MARK = path.join(__dirname, "assets", "moi-mark.png");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";           // 13.3 x 7.5
pres.author = "Adithya · Sarva Labs";
pres.title = "MOI Builders Session 7 — Agentic Payments";

const L = 0.9, W = 11.53, TOTAL = 8;

/* ── chrome ──────────────────────────────────────────────────────────────── */
function chrome(s, n, label, dark) {
  s.addText(`MOI · BUILD ${String(n).padStart(2, "0")}`, {
    x: L, y: 0.62, w: 3, h: 0.26, fontFace: MONO, fontSize: 10.5, bold: true,
    charSpacing: 1.4, color: dark ? ACC_D : ACC_L, margin: 0,
  });
  if (label) s.addText(label.toUpperCase(), {
    x: L + 3.5, y: 0.62, w: 6, h: 0.26, fontFace: MONO, fontSize: 10.5,
    charSpacing: 1.4, color: dark ? D_MED : T_MED, margin: 0,
  });
  s.addText("moi builders · session 07", {
    x: L, y: 6.95, w: 4, h: 0.24, fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: dark ? D_LOW : T_LOW, margin: 0,
  });
  s.addText(`${String(n).padStart(2, "0")} / ${TOTAL}`, {
    x: L + W - 2, y: 6.95, w: 2, h: 0.24, align: "right", fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: dark ? D_LOW : T_LOW, margin: 0,
  });
}
function slide(dark) {
  const s = pres.addSlide();
  s.background = { color: dark ? INK : WHITE };
  return s;
}
function head(s, n, label, title, lede, dark) {
  chrome(s, n, label, dark);
  const two = title.length > 46;
  s.addText(title, {
    x: L, y: 1.02, w: W, h: two ? 1.28 : 0.8, fontFace: SANS, fontSize: 33, bold: true,
    color: dark ? WHITE : INK, margin: 0, lineSpacingMultiple: 1.08,
  });
  let y = 1.02 + (two ? 1.34 : 0.86);
  if (lede) {
    s.addText(lede, {
      x: L, y, w: 10.8, h: 0.74, fontFace: SANS, fontSize: 13.5,
      color: dark ? D_MED : T_MED, margin: 0, lineSpacingMultiple: 1.42,
    });
    y += lede.length > 120 ? 0.92 : 0.62;
  }
  return y + 0.24;
}
function card(s, o) {
  const tone = {
    lav: { fill: LAV, line: LAV_B },
    grey: { fill: GREY, line: GREY_B },
    pink: { fill: "1A1016", line: PINK },
    green: { fill: "0C1A15", line: GREEN },
    darkline: { fill: "14181F", line: D_BORD },
  }[o.tone || "grey"];
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.05,
    fill: { color: tone.fill }, line: { color: tone.line, width: 1 },
  });
  const onDark = ["pink", "green", "darkline"].includes(o.tone);
  let ty = o.y + 0.24;
  if (o.label) {
    s.addText(o.label.toUpperCase(), {
      x: o.x + 0.32, y: ty, w: o.w - 0.64, h: 0.24, fontFace: MONO, fontSize: 10,
      charSpacing: 1.3, margin: 0,
      color: o.tone === "pink" ? PINK : o.tone === "green" ? GREEN : onDark ? ACC_D : ACC_L,
    });
    ty += 0.34;
  }
  if (o.h2) {
    s.addText(o.h2, {
      x: o.x + 0.32, y: ty, w: o.w - 0.64, h: 0.34, fontFace: SANS, fontSize: 16,
      bold: true, color: onDark ? WHITE : INK, margin: 0,
    });
    ty += 0.46;
  }
  if (o.p) s.addText(o.p, {
    x: o.x + 0.32, y: ty, w: o.w - 0.64, h: o.h - (ty - o.y) - 0.2,
    fontFace: SANS, fontSize: 11.5, color: onDark ? D_MED : T_MED,
    margin: 0, lineSpacingMultiple: 1.34,
  });
  if (o.mono) s.addText(o.mono, {
    x: o.x + 0.32, y: o.y + o.h - 0.5, w: o.w - 0.64, h: 0.3,
    fontFace: MONO, fontSize: 9.5, color: onDark ? D_LOW : T_LOW, margin: 0,
  });
}

/* ─────────────────────────── 01 · title ─────────────────────────── */
{
  const s = slide(true);
  s.addImage({ path: MARK, x: L, y: 1.55, w: 0.62, h: 0.62 });
  s.addText("MOI BUILDERS · SESSION 07", {
    x: L, y: 2.42, w: 8, h: 0.3, fontFace: MONO, fontSize: 12, bold: true,
    charSpacing: 2.2, color: ACC_D, margin: 0,
  });
  s.addText("Agentic\nPayments", {
    x: L, y: 2.92, w: 9, h: 1.9, fontFace: SANS, fontSize: 60, bold: true,
    color: WHITE, margin: 0, lineSpacingMultiple: 0.98,
  });
  s.addText("An agent finds another agent on MOI — and pays it.\nNo human, no account, no API key.", {
    x: L, y: 4.98, w: 8.6, h: 0.86, fontFace: SANS, fontSize: 15,
    color: D_MED, margin: 0, lineSpacingMultiple: 1.4,
  });
  s.addText("PART 1 OF 3 · IDENTITY", {
    x: L, y: 6.05, w: 6, h: 0.28, fontFace: MONO, fontSize: 10.5,
    charSpacing: 1.6, color: D_LOW, margin: 0,
  });
  s.addNotes(
`[ SCREEN — DECK ]

Open cold. Don't read the slide.

"Two programs. One sells probability estimates on bitcoin. The other needs one.
They have never met — no account, no API key, no contract. Watch them do business."

Then straight to slide 2 and talk over the diagram.`);
}

/* ─────────────────────── 02 · the two agents (DIAGRAM) ─────────────────────── */
{
  const s = slide(false);
  const y0 = head(s, 2, "the setup", "Two agents that have never met",
    "One needs an answer. One sells them. Neither was told the other exists.", false);

  const CW = 4.55, CH = 2.42;
  const LX = L, RX = L + W - CW;
  const CY = y0 + 0.06;

  // ── buyer ──
  s.addShape(pres.ShapeType.roundRect, {
    x: LX, y: CY, w: CW, h: CH, rectRadius: 0.05,
    fill: { color: LAV }, line: { color: LAV_B, width: 1 },
  });
  s.addText("BUYER", {
    x: LX + 0.34, y: CY + 0.24, w: 2, h: 0.24, fontFace: MONO, fontSize: 10,
    charSpacing: 1.3, color: ACC_L, margin: 0,
  });
  s.addText("Risk Agent", {
    x: LX + 0.34, y: CY + 0.54, w: CW - 0.68, h: 0.4, fontFace: SANS, fontSize: 20,
    bold: true, color: INK, margin: 0,
  });
  s.addText([
    { text: "Has a question it cannot answer itself.", options: { breakLine: true } },
    { text: "Decides which market answers it", options: { bullet: true, breakLine: true } },
    { text: "Decides whether the price is worth paying", options: { bullet: true } },
  ], {
    x: LX + 0.34, y: CY + 1.00, w: CW - 0.68, h: 0.94, fontFace: SANS, fontSize: 11.5,
    color: T_MED, margin: 0, lineSpacingMultiple: 1.3, paraSpaceAfter: 3,
  });
  s.addText("0x…8ef2c197…   holds the funds", {
    x: LX + 0.34, y: CY + CH - 0.40, w: CW - 0.68, h: 0.28,
    fontFace: MONO, fontSize: 9.5, color: T_LOW, margin: 0,
  });

  // ── seller ──
  s.addShape(pres.ShapeType.roundRect, {
    x: RX, y: CY, w: CW, h: CH, rectRadius: 0.05,
    fill: { color: GREY }, line: { color: GREY_B, width: 1 },
  });
  s.addText("SELLER", {
    x: RX + 0.34, y: CY + 0.24, w: 2, h: 0.24, fontFace: MONO, fontSize: 10,
    charSpacing: 1.3, color: ACC_L, margin: 0,
  });
  s.addText("Signal Desk", {
    x: RX + 0.34, y: CY + 0.54, w: CW - 0.68, h: 0.4, fontFace: SANS, fontSize: 20,
    bold: true, color: INK, margin: 0,
  });
  s.addText([
    { text: "Sells probability estimates on bitcoin.", options: { breakLine: true } },
    { text: "Decides what to charge, per request", options: { bullet: true, breakLine: true } },
    { text: "Can decline the sale", options: { bullet: true } },
  ], {
    x: RX + 0.34, y: CY + 1.00, w: CW - 0.68, h: 0.94, fontFace: SANS, fontSize: 11.5,
    color: T_MED, margin: 0, lineSpacingMultiple: 1.3, paraSpaceAfter: 3,
  });
  s.addText("0x…1d2f8c28…   receive-only", {
    x: RX + 0.34, y: CY + CH - 0.40, w: CW - 0.68, h: 0.28,
    fontFace: MONO, fontSize: 9.5, color: T_LOW, margin: 0,
  });

  // ── the gap between them ──
  const GX = LX + CW, GW = RX - (LX + CW);
  s.addShape(pres.ShapeType.line, {
    x: GX + 0.18, y: CY + 0.96, w: GW - 0.36, h: 0,
    line: { color: LAV_B, width: 1.5, dashType: "dash" },
  });
  s.addText("✕", {
    x: GX, y: CY + 0.60, w: GW, h: 0.42, align: "center",
    fontFace: SANS, fontSize: 19, bold: true, color: PINK, margin: 0,
  });
  s.addText("no account\nno API key\nno prior contact", {
    x: GX - 0.1, y: CY + 1.18, w: GW + 0.2, h: 0.86, align: "center",
    fontFace: MONO, fontSize: 9.5, color: T_LOW, margin: 0, lineSpacingMultiple: 1.34,
  });

  // ── the shared ground ──
  const BY = CY + CH + 0.34;
  s.addShape(pres.ShapeType.roundRect, {
    x: L, y: BY, w: W, h: 1.06, rectRadius: 0.05,
    fill: { color: INK }, line: { color: INK, width: 1 },
  });
  s.addText("MOI VOYAGE DEVNET", {
    x: L + 0.36, y: BY + 0.22, w: 4, h: 0.26, fontFace: MONO, fontSize: 10,
    charSpacing: 1.3, color: ACC_D, margin: 0,
  });
  s.addText("Agent registry — both identities, and the wallet each one registered.   ·   Native MAS0 asset — what actually moves.", {
    x: L + 0.36, y: BY + 0.56, w: W - 0.72, h: 0.34, fontFace: SANS, fontSize: 12,
    color: D_MED, margin: 0,
  });
  // both agents stand on it
  for (const x of [LX + CW / 2, RX + CW / 2]) {
    s.addShape(pres.ShapeType.line, {
      x, y: CY + CH + 0.02, w: 0, h: 0.3,
      line: { color: LAV_B, width: 1.5, endArrowType: "triangle" },
    });
  }

  s.addNotes(
`[ SCREEN — DECK ]  Stay here. This is the whole setup — nothing to click.

"I've got two programs running. I'm going to call them agents, and I want to be precise,
because the word gets used loosely.

The first is a Signal Desk. It sells probability estimates on bitcoin — will BTC draw down
more than 20% this quarter, will it close higher next week. Two things make it an agent
rather than an API: it decides what to charge for each answer, and it can decline.

The second is a Risk Agent. It's the buyer. It has a question and it doesn't know the answer.
It decides which market answers its question, and whether the price is worth paying.

Here's the important part — they have never met. No account, no API key, no contract.
The buyer doesn't have the seller's address, doesn't have its URL, doesn't know it exists.

The one thing they share is the bottom of this slide: both are registered on MOI, and the
asset they settle in is native to it."

DON'T say "two AI agents transacting autonomously" beyond what's on the slide — the seller's
product is a stub and someone will ask.`);
}

/* ─────────────────────── 03 · paying a stranger ─────────────────────── */
{
  const s = slide(false);
  const y0 = head(s, 3, "the problem", "Paying a stranger",
    "A human does three things without noticing. Take the human out and none of them happen by default.", false);

  const rows = [
    ["Does this shop look real?", "Is payTo really that agent's wallet?", "TODAY", GREEN],
    ["I'm not spending more than X.", "A cap the chain enforces.", "SESSION 8", T_LOW],
    ["I can get my money back.", "Pay only on delivery.", "SESSION 9", T_LOW],
  ];
  let y = y0 + 0.06;
  for (const [human, machine, tag, col] of rows) {
    s.addShape(pres.ShapeType.roundRect, {
      x: L, y, w: W, h: 1.06, rectRadius: 0.05,
      fill: { color: tag === "TODAY" ? LAV : GREY },
      line: { color: tag === "TODAY" ? LAV_B : GREY_B, width: 1 },
    });
    s.addText(`“${human}”`, {
      x: L + 0.36, y: y + 0.3, w: 4.4, h: 0.46, fontFace: SANS, fontSize: 14,
      italic: true, color: T_MED, margin: 0,
    });
    s.addText("→", {
      x: L + 4.9, y: y + 0.3, w: 0.4, h: 0.46, fontFace: SANS, fontSize: 14,
      color: T_LOW, margin: 0,
    });
    s.addText(machine, {
      x: L + 5.4, y: y + 0.28, w: 4.3, h: 0.5, fontFace: SANS, fontSize: 14,
      bold: true, color: INK, margin: 0,
    });
    s.addText(tag, {
      x: L + W - 2.1, y: y + 0.34, w: 1.74, h: 0.3, align: "right",
      fontFace: MONO, fontSize: 10, bold: tag === "TODAY", charSpacing: 1.3,
      color: col, margin: 0,
    });
    y += 1.24;
  }
  s.addNotes(
`[ SCREEN — DECK ]

"The hard part isn't moving money — chains have done that for fifteen years.

The hard part is that when you pay a stranger, a human does three things without thinking.
Glances at whether the shop is real. Knows roughly what they're willing to spend. Assumes
there's recourse if nothing arrives.

Take the human out and none of those happen by default. And you have to take the human out,
because you can't approve a fraction-of-a-cent purchase by hand — the approval costs more
than the thing.

So each of those instincts has to become something a machine can check. Today is the first
one: how do you know who you're paying?"

>>> SWITCH TO BROWSER after this slide.`);
}

/* ─────────────────────── 04 · live demo cue ─────────────────────── */
{
  const s = slide(true);
  chrome(s, 4, "live", null, true);
  s.addText("LIVE", {
    x: L, y: 2.2, w: 6, h: 0.4, fontFace: MONO, fontSize: 13, bold: true,
    charSpacing: 2.6, color: ACC_D, margin: 0,
  });
  s.addText("Watch it happen", {
    x: L, y: 2.72, w: 10, h: 1.0, fontFace: SANS, fontSize: 46, bold: true,
    color: WHITE, margin: 0,
  });
  const beats = [
    ["01", "It admits it can't answer, and scans the registry"],
    ["02", "It reads the seller's skills, wallet and URL off the chain"],
    ["03", "It is quoted a price — and checks who it is about to pay"],
    ["04", "It pays, and the seller verifies that itself"],
  ];
  let y = 4.02;
  for (const [n, t] of beats) {
    s.addText(n, {
      x: L, y, w: 0.5, h: 0.32, fontFace: MONO, fontSize: 11, bold: true, color: ACC_D, margin: 0,
    });
    s.addText(t, {
      x: L + 0.66, y: y - 0.02, w: 9.6, h: 0.36, fontFace: SANS, fontSize: 13.5,
      color: D_MED, margin: 0,
    });
    y += 0.52;
  }
  s.addText("then I break it, and the agent refuses", {
    x: L, y: y + 0.16, w: 8, h: 0.32, fontFace: MONO, fontSize: 11,
    charSpacing: 1.2, color: PINK, margin: 0,
  });
  s.addNotes(
`>>> SWITCH TO TERMINAL / BROWSER — http://localhost:4000

Leave this slide up while you switch.

HAPPY PATH — type: should i be worried about a crash
  step 1  "admits it can't answer" — scans for the skill tag sells-signals
  step 2  agent id, registered wallet, service URL, advertised skills — ALL off chain.
          "I never gave it that URL."
  step 3  catalog is free — questions public, answers paid
  step 4  check "decided by" shows the model. "crash" isn't in the catalog; it says "draw down"
  step 5  HTTP 402 — reserved since 1997. Seller says WHY it charges this.
  step 6  ** SLOW DOWN ** the identity check. payTo is 32 bytes: it says WHERE, not WHOSE.
  step 7  real interaction hash — CLICK IT to copy, paste into voyage.moi.technology
  step 8  seven checks, all read-only, seller reads the chain itself
  step 9  answer appears, balance drops

SAY OUT LOUD: the probabilities are made up. No model, no market data.

REFUSAL — tick "Simulate a compromised listing", ask again.
  Stops at step 6. "Money moved: none" is literal — no transaction was ever built.
  The party with something to lose is the one that checked.

If the happy path refuses: you Ctrl-C'd a tamper run. Rerun --tamper and let it finish.`);
}

/* ─────────────────────── 05 · code cue ─────────────────────── */
{
  const s = slide(true);
  chrome(s, 5, "the code", null, true);
  s.addText("CODE", {
    x: L, y: 1.66, w: 6, h: 0.4, fontFace: MONO, fontSize: 13, bold: true,
    charSpacing: 2.6, color: ACC_D, margin: 0,
  });
  s.addText("Four files", {
    x: L, y: 2.18, w: 10, h: 0.92, fontFace: SANS, fontSize: 46, bold: true,
    color: WHITE, margin: 0,
  });
  const files = [
    ["payment-proof.ts", "the whole wire format — a quote, and a signed claim"],
    ["identity-check.ts", "39 lines. this is the session.", true],
    ["verify-proof.ts", "the seller's seven checks, all read-only"],
    ["pricing.ts + worth.ts", "what each agent decides — and what it is not allowed to"],
  ];
  let y = 3.42;
  for (const [f, d, hot] of files) {
    s.addText(f, {
      x: L, y, w: 3.5, h: 0.34, fontFace: MONO, fontSize: 12.5, bold: true,
      color: hot ? GREEN : WHITE, margin: 0,
    });
    s.addText(d, {
      x: L + 3.7, y, w: 7.4, h: 0.34, fontFace: SANS, fontSize: 12.5,
      color: hot ? WHITE : D_MED, margin: 0,
    });
    y += 0.66;
  }
  s.addNotes(
`>>> SWITCH TO EDITOR

payment-proof.ts — "Two messages. The seller sends a Quote: price, asset, where to pay, and its
agent id. The buyer sends back a Claim: I sent this much, to you, in this transaction, for this
thing, signed." Point at payToAgentId — without it, payTo is anonymous bytes.

identity-check.ts — WHOLE FILE ON SCREEN, 39 lines, don't scroll. Point at ONE line:
  if (normalizeAddress(registryWallet) !== normalizeAddress(quote.payTo))
"Read the registered wallet off the chain. Compare it to the invoice. Refuse if they disagree.
No payment protocol can answer that on its own — it needs an identity both parties can check."
Then: it runs BEFORE the transfer. No escrow, nothing to claw back.

verify-proof.ts — show two of seven.
  check 3 key_binds_to_payer: "transfers are public. what stops someone quoting MY hash and
  collecting the answer I paid for? this."
  check 6 transfer_landed_on_chain: "the seller reads the interaction itself and decodes it."
  Optional: npm run attack-test — 11 forgeries, each rejected for the RIGHT reason.

pricing.ts + worth.ts — "the seller decides what to charge, the buyer decides if it's worth it.
Both are model calls. But the price bounds are arithmetic, the buyer's hard ceiling is checked
BEFORE the model is asked — the seller's pitch is untrusted text — and nothing about whether a
payment is VALID touches a model at all."`);
}

/* ─────────────────────── 06 · the gap ─────────────────────── */
{
  const s = slide(false);
  const y0 = head(s, 6, "what's missing", "Every guardrail here is self-imposed",
    "The buyer refuses anything over 6. That limit is a constant in its own source.", false);

  s.addShape(pres.ShapeType.roundRect, {
    x: L, y: y0, w: W, h: 0.92, rectRadius: 0.05,
    fill: { color: INK }, line: { color: INK, width: 1 },
  });
  s.addText("export const SOFT_LIMIT = BigInt(process.env.MAX_PRICE_PER_ANSWER ?? \"6\");", {
    x: L + 0.36, y: y0 + 0.3, w: W - 0.72, h: 0.36, fontFace: MONO, fontSize: 13,
    color: ACC_D, margin: 0,
  });

  const y1 = y0 + 1.18;
  card(s, {
    x: L, y: y1, w: 5.6, h: 1.95, tone: "grey", label: "removable",
    h2: "One environment variable",
    p: "Set MAX_PRICE_PER_ANSWER and the ceiling is gone — no code change. The model's second opinion is also just a prompt, in a file the operator controls.",
  });
  card(s, {
    x: L + 5.93, y: y1, w: 5.6, h: 1.95, tone: "lav", label: "worse",
    h2: "It caps per purchase, not in total",
    p: "Nothing tracks cumulative spend. An agent with a 6-unit limit can still drain 99,000 — six at a time — without breaking its limit once.",
  });

  s.addText("A limit the agent consults is a preference. A limit the chain applies is authority.", {
    x: L, y: y1 + 2.17, w: W, h: 0.4, fontFace: SANS, fontSize: 15, bold: true,
    color: ACC_L, margin: 0,
  });

  s.addNotes(
`[ SCREEN — DECK ]  — but run the command in the terminal first.

>>> TERMINAL:  MAX_PRICE_PER_ANSWER=999999 npm run ask -- "should i be worried about a crash"

"The buyer has a spending limit. It refuses anything over six. Let me show you what that's worth.

I didn't touch the code — I set an environment variable and the hard limit is gone.

Now, it still won't pay something absurd, because there's a second check: the model's own
judgment about whether a markup is reasonable. But look where that lives. It's ALSO inside the
agent. A prompt I wrote, in a file I control, in a process I'm running.

That's the point. Every guardrail here is self-imposed."

Then the right-hand card — this is the one that surprises people:

"And it's worse than that. That limit is per purchase. Nothing tracks the total. An agent with
a six-unit limit and a ninety-nine-thousand balance can spend all of it, six at a time, without
ever violating its limit once.

Nothing on the chain caps this wallet. It spent three because it decided to."

DON'T claim the env var makes it pay anything — tested, the model still refuses. Say the honest
version: both guardrails are inside the agent.`);
}

/* ─────────────────────── 07 · three sessions ─────────────────────── */
{
  const s = slide(true);
  const y0 = head(s, 7, "where this goes", "Three questions, three sessions",
    "Today answered one of them.", true);

  const items = [
    ["07", "Who am I paying?", "The registry, checked before any money moves.", GREEN, "DONE"],
    ["08", "What may I spend?", "A cap the chain enforces — authority the agent inherits, not one it grants itself.", ACC_D, "NEXT"],
    ["09", "What if you don't deliver?", "Pay on delivery, using MOI's native lockup and release.", D_LOW, "AFTER"],
  ];
  let y = y0 + 0.1;
  for (const [n, q, a, col, tag] of items) {
    s.addShape(pres.ShapeType.roundRect, {
      x: L, y, w: W, h: 1.14, rectRadius: 0.05,
      fill: { color: "14181F" }, line: { color: tag === "DONE" ? GREEN : D_BORD, width: 1 },
    });
    s.addText(n, {
      x: L + 0.36, y: y + 0.32, w: 0.8, h: 0.5, fontFace: MONO, fontSize: 20, bold: true,
      color: col, margin: 0,
    });
    s.addText(q, {
      x: L + 1.4, y: y + 0.22, w: 4.3, h: 0.4, fontFace: SANS, fontSize: 16, bold: true,
      color: WHITE, margin: 0,
    });
    s.addText(a, {
      x: L + 1.4, y: y + 0.63, w: 8.2, h: 0.4, fontFace: SANS, fontSize: 11.5,
      color: D_MED, margin: 0,
    });
    s.addText(tag, {
      x: L + W - 1.5, y: y + 0.4, w: 1.14, h: 0.3, align: "right", fontFace: MONO,
      fontSize: 10, bold: true, charSpacing: 1.3, color: col, margin: 0,
    });
    y += 1.32;
  }
  s.addNotes(
`[ SCREEN — DECK ]

"Really three separate questions, and today only answered the first.

Who am I paying? Answered — the registry, checked before any money moves.

What am I allowed to spend? Not answered. That's session eight: a cap the chain itself
enforces, that the agent can't raise by editing a variable, because it doesn't own the
authority — it inherits it.

What if they don't deliver? Also not answered. Today it's fire-and-forget: pay, and hope.
Session nine makes it pay-on-delivery with MOI's native lockup and release."

If asked what happens today when a seller takes the money and vanishes: you lose it. Same as
cash across a counter. Don't dress it up.`);
}

/* ─────────────────────── 08 · run it ─────────────────────── */
{
  const s = slide(false);
  const y0 = head(s, 8, "go build", "Run it yourself",
    "One funded devnet wallet covers the whole thing. The seller never needs gas — it only receives.", false);

  s.addShape(pres.ShapeType.roundRect, {
    x: L, y: y0, w: 6.9, h: 2.5, rectRadius: 0.05,
    fill: { color: INK }, line: { color: INK, width: 1 },
  });
  const cmds = [
    ["npm install", ""],
    ["cp .env.example .env", "paste a funded mnemonic"],
    ["npm run setup:asset", "mint the settlement asset"],
    ["npm run setup:registry", "put both agents on chain"],
    ["npm run ui", "the agent console"],
  ];
  let cy = y0 + 0.28;
  for (const [c, note] of cmds) {
    s.addText(c, {
      x: L + 0.36, y: cy, w: 4.1, h: 0.3, fontFace: MONO, fontSize: 11.5,
      color: ACC_D, margin: 0,
    });
    if (note) s.addText(note, {
      x: L + 4.5, y: cy, w: 2.2, h: 0.3, fontFace: MONO, fontSize: 9.5,
      color: D_LOW, margin: 0,
    });
    cy += 0.44;
  }

  card(s, {
    x: L + 7.2, y: y0, w: 4.33, h: 1.18, tone: "lav", label: "faucet · one wallet",
    h2: "voyage.moi.technology",
  });
  card(s, {
    x: L + 7.2, y: y0 + 1.32, w: 4.33, h: 1.18, tone: "grey", label: "next",
    h2: "Session 8 — authority",
  });

  s.addText("The payment was the easy half. Knowing who you're paying is what makes it safe.", {
    x: L, y: y0 + 2.78, w: W, h: 0.4, fontFace: SANS, fontSize: 15, bold: true,
    color: ACC_L, margin: 0,
  });

  s.addNotes(
`[ SCREEN — DECK ]  Close here, then Q&A.

"Everything you saw settled on MOI devnet. The interaction hashes are real — you can look them
up. The repo's linked; one funded wallet runs the whole thing.

The payment was the easy half. What makes it safe to pay a stranger is knowing who they are —
and next time, bounding what your agent can do on your behalf."

LIKELY QUESTIONS
 · "seller takes the money and doesn't deliver?" — you lose it. Session 9.
 · "are these really two separate agents?" — two wallets, two on-chain identities, but one
   machine and one mnemonic today. The chain doesn't care; the transfer is real either way.
 · "why not x402?" — we built that first, it's on a branch. Buys interoperability, costs about
   twice the code and a second service. The identity check is identical in both.
 · "what stops a replayed payment?" — the transfer hash is burned. Honest caveat: that set is
   in memory, so restarting the seller resets it.`);
}

const out = path.join(__dirname, "MOI_Builders_S7.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("wrote " + out));
