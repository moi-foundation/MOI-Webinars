// Builds MOI_Builders_S7.pptx.
//
//   node build-pptx.cjs
//
// Palette, type and layout lifted from MOI_Builders_S5_2.pptx — read out of the file, not guessed:
//   fonts        Inter (headline/body) + JetBrains Mono (labels, code)
//   backgrounds  #0E1116 dark / #FFFFFF light, alternating
//   accent       #2D2BB6 on light · #8B8AF0 on dark
//   surfaces     #EEF0FB lavender · #F4F4F8 grey     borders #C9CBF0 · #E4E5EC
//   signals      #D6336C negative · #3CCB8E positive
//
// Dark slides carry the title, the key moment, and the close. Light slides carry the content.

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
pres.layout = "LAYOUT_WIDE";
pres.author = "Adithya · Sarva Labs";
pres.title = "MOI Builders Session 7 — Agentic Payments";

const L = 0.9, W = 11.53, TOTAL = 12;

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
  const two = title.includes("\n") || title.length > 46;
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
    y += lede.length > 130 ? 0.98 : 0.66;
  }
  return y + 0.26;
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
  let ty = o.y + 0.3;
  if (o.label) {
    s.addText(o.label.toUpperCase(), {
      x: o.x + 0.34, y: ty, w: o.w - 0.68, h: 0.26, fontFace: MONO, fontSize: 10,
      charSpacing: 1.3, margin: 0,
      color: o.tone === "pink" ? PINK : o.tone === "green" ? GREEN : onDark ? ACC_D : ACC_L,
    });
    ty += 0.42;
  }
  if (o.h2) {
    s.addText(o.h2, {
      x: o.x + 0.34, y: ty, w: o.w - 0.68, h: 0.36, fontFace: SANS, fontSize: 16,
      bold: true, color: onDark ? WHITE : INK, margin: 0,
    });
    ty += 0.62;
  }
  if (o.p) s.addText(o.p, {
    x: o.x + 0.34, y: ty, w: o.w - 0.68, h: o.h - (ty - o.y) - 0.24,
    fontFace: SANS, fontSize: 11.5, color: onDark ? D_MED : T_MED,
    margin: 0, lineSpacingMultiple: 1.36,
  });
}
function marks(s, o) {
  o.items.forEach((t, i) => {
    const y = o.y + i * o.step;
    s.addText(o.mark, { x: o.x, y, w: 0.3, h: 0.3, fontFace: MONO, fontSize: 12.5, color: o.color, margin: 0 });
    s.addText(t, { x: o.x + 0.36, y, w: o.w - 0.36, h: 0.3, fontFace: SANS, fontSize: 12.5,
      color: o.textColor || INK, margin: 0 });
  });
}
function code(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.05,
    fill: { color: o.bare ? "13171E" : "13171E" }, line: { color: D_BORD, width: 1 },
  });
  if (o.file) s.addText(o.file, {
    x: o.x + 0.36, y: o.y + 0.24, w: o.w - 0.7, h: 0.24,
    fontFace: MONO, fontSize: 9.5, charSpacing: 0.6, color: D_LOW, margin: 0,
  });
  const runs = [];
  o.lines.forEach((ln, i) => {
    if (!ln.length) { runs.push({ text: " ", options: { breakLine: true } }); return; }
    ln.forEach((r, j) => runs.push({
      text: r.t,
      options: { color: r.c || "E6E9F0", breakLine: j === ln.length - 1 && i < o.lines.length - 1 },
    }));
  });
  s.addText(runs, {
    x: o.x + 0.36, y: o.y + (o.file ? 0.58 : 0.3), w: o.w - 0.7,
    h: o.h - (o.file ? 0.82 : 0.54),
    fontFace: MONO, fontSize: o.fs || 11, margin: 0, lineSpacingMultiple: 1.4, valign: "top",
  });
}
function accentLine(s, text, dark) {
  s.addText(text, { x: L, y: 6.28, w: W, h: 0.34, fontFace: SANS, fontSize: 13,
    italic: true, color: dark ? D_MED : T_MED, margin: 0 });
}
const K = "C4A7F7", S = "9BE08A", FN = "7FA9FF", C = D_LOW, N = "F2C57C";
const hw = (W - 0.4) / 2, cw = (W - 0.7) / 3;

/* ═════ 01 · TITLE (dark) ═════ */
let s = slide(true);
chrome(s, 1, null, true);
s.addImage({ path: MARK, x: L, y: 1.55, w: 0.72, h: 0.72 });
s.addText("DEVELOPER WEBINAR  ·  SESSION 07", { x: L, y: 2.56, w: 8, h: 0.28,
  fontFace: MONO, fontSize: 11.5, charSpacing: 1.8, color: ACC_D, margin: 0 });
s.addText("Agentic payments on MOI", { x: L, y: 2.96, w: 11, h: 0.9,
  fontFace: SANS, fontSize: 44, bold: true, color: WHITE, margin: 0 });
s.addText("An agent that pays another agent.", { x: L, y: 3.96, w: 11, h: 0.6,
  fontFace: SANS, fontSize: 25, color: D_MED, margin: 0 });
s.addText("Your agent finds a seller it has never met, checks who it is on chain, and pays it mid-request. No signup. No API key. No human.",
  { x: L, y: 4.76, w: 9.6, h: 0.72, fontFace: SANS, fontSize: 13, color: D_LOW, margin: 0, lineSpacingMultiple: 1.44 });
s.addText("Adithya  ·  Ecosystem, Sarva Labs", { x: L, y: 5.76, w: 8, h: 0.3,
  fontFace: SANS, fontSize: 13, color: D_MED, margin: 0 });
s.addNotes(`[ SCREEN — DECK  ·  slide 1 of 12 ]

Welcome — session 7 of MOI Builders.

Quick recap of where we are. Session 3 gave an agent an on-chain identity. Sessions 2 and 4 gave us native assets and moving them between accounts. Today we put those together and let two agents actually do business.

The setup: my agent has a question. Somewhere out there is another agent that sells the answer. They have never met, there is no account between them, and no human is involved at any point.

By the end of this you will have run it yourself — and there's a version that needs no wallet at all, so you can follow along live.

One thing to say up front: this is part one of three. Today is identity and payment. Session 8 is authority — what an agent is allowed to spend. Session 9 is what happens when the goods don't arrive.

[ STAY ON DECK.  Deck in presenter view, terminal open in a second window, ready but not shown. ]`);

/* ═════ 02 · WHY (light) ═════ */
s = slide(false);
let y = head(s, 2, "why this matters", "Agents can find each other.\nThey still can't pay each other.",
  "Session 3 gave an agent an on-chain identity. But an identity that can't transact is a business card. The moment one agent wants something another agent has, three things break.", false);
[["01", "No way to charge", "Every paid API assumes a human: a signup, a card on file, an invoice. None of that survives contact with an agent acting alone."],
 ["02", "No way to know who", "A payment address is 32 bytes. It doesn't tell you whose it is, or whether the listing was swapped a minute ago."],
 ["03", "No sane unit", "You cannot put a human in the loop on a tenth of a cent. The approval costs more than the thing being bought."]]
.forEach(([lab, h2, p], i) => card(s, { x: L + i * (cw + 0.35), y, w: cw, h: 2.3,
  tone: i === 0 ? "lav" : "grey", label: lab, h2, p }));
accentLine(s, "Today: two agents transact end to end — and the chain answers who is being paid.", false);
s.addNotes(`[ SCREEN — DECK ]

Three things are broken today, and they compound.

First — there is no way to charge. Every paid API on the internet assumes a human somewhere: a signup form, a card on file, an invoice at the end of the month. None of that survives contact with an agent acting on its own at three in the morning.

Second — and this is the one we'll spend most of today on — there is no way to know who you're paying. A payment address is 32 bytes of hex. It doesn't tell you whose it is. It doesn't tell you whether someone swapped the listing a minute ago.

Third, the unit doesn't work. You cannot put a human in the loop on a tenth of a cent — the approval costs more than the thing.

So today: two agents transact end to end, and the chain answers the "who" question.

[ STAY ON DECK. ]`);

/* ═════ 03 · AGENDA (light) ═════ */
s = slide(false);
y = head(s, 3, "what we'll cover", "The session, end to end", null, false);
[["01", "What x402 is", "HTTP 402, reserved in 1997 and finally used. Four messages."],
 ["05", "The identity check", "Is that address really the seller's? The one question x402 can't ask."],
 ["02", "Where it stops", "It moves value. It says nothing about who you're paying."],
 ["06", "Pay and verify", "A native MAS0 transfer, then a facilitator that reads the chain."],
 ["03", "Discovery by skill", "Find a seller in the registry. No URL handed to you."],
 ["07", "Watch it refuse", "Swap the seller's address. The agent walks away."],
 ["04", "The 402 response", "Price, asset, and where to pay — machine readable."],
 ["08", "What comes next", "Authority in session 8. Conditional settlement in session 9."]]
.forEach(([n, h2, p], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = L + col * 5.95, yy = y + row * 1.1;
  s.addText(n, { x, y: yy, w: 0.5, h: 0.28, fontFace: MONO, fontSize: 12, bold: true, color: ACC_L, margin: 0 });
  s.addText(h2, { x: x + 0.6, y: yy - 0.02, w: 5, h: 0.3, fontFace: SANS, fontSize: 14, bold: true, color: INK, margin: 0 });
  s.addText(p, { x: x + 0.6, y: yy + 0.29, w: 5, h: 0.6, fontFace: SANS, fontSize: 11, color: T_LOW, margin: 0, lineSpacingMultiple: 1.3 });
});
s.addNotes(`[ SCREEN — DECK ]

Here's the shape of the next forty minutes.

We start with what x402 actually is — it's smaller than people expect, four HTTP messages — and then where it deliberately stops.

Then discovery: how one agent finds another without being handed a URL.

The middle of the session is the identity check. That's item five and it's the reason this is a MOI talk rather than a generic x402 talk.

Then we pay, and I'll show you how the facilitator confirms it — and then I'll attack it live and you'll watch the agent refuse.

We finish with where this goes: authority next session, conditional settlement after that.

Two live demos. Both run without a wallet, so you can follow along.

[ STAY ON DECK. ]`);

/* ═════ 04 · CORE IDEA (dark) ═════ */
s = slide(true);
y = head(s, 4, "the core idea", "x402 gives you an address.\nMOI tells you whose it is.",
  "x402 is a payment protocol, and a good one. It deliberately says nothing about identity. That gap is exactly the shape of what MOI already provides.", true);
card(s, { x: L, y, w: hw, h: 2.36, tone: "darkline", label: "x402 answers" });
marks(s, { x: L + 0.34, y: y + 0.84, w: hw - 0.7, step: 0.33, mark: "·", color: D_LOW, textColor: D_MED,
  items: ["how much  —  1 USDM", "which asset  —  a MAS0 asset id", "where to  —  0x0000…97c4", "by when  —  a timeout"] });
card(s, { x: L + hw + 0.4, y, w: hw, h: 2.36, tone: "green", label: "MOI answers" });
marks(s, { x: L + hw + 0.74, y: y + 0.84, w: hw - 0.7, step: 0.33, mark: "+", color: GREEN, textColor: WHITE,
  items: ["who owns that address", "are they still active", "what do they claim to sell", "did the payment really land"] });
accentLine(s, "Without the second column, you are wiring money to a number.", true);
s.addNotes(`[ SCREEN — DECK ]

This is the whole talk on one slide.

On the left, everything x402 tells you: how much, which asset, where to send it, and by when. That's a complete invoice and it's genuinely useful.

On the right, everything it doesn't. Who owns that address? Are they still trading? What do they claim to sell? And afterwards — did the payment actually land, or am I taking someone's word for it?

x402 not answering those isn't a flaw. It's a payment protocol; identity is out of scope by design. But if you're an agent about to send money to a stranger, the right-hand column is the one that matters.

MOI already answers all four, because agents are registered on chain. So this isn't MOI bolting on a payment story — it's x402 having a hole that's exactly MOI-shaped.

[ STAY ON DECK.  This is the thesis — don't rush off it. ]`);

/* ═════ 05 · PROTOCOL (light) ═════ */
s = slide(false);
y = head(s, 5, "the protocol", "Four messages. That's the whole thing.",
  "HTTP 402 Payment Required was reserved in 1997 and left unimplemented for 28 years. x402 finally uses it — and the server never touches a chain.", false);
code(s, { x: L, y, w: W, h: 1.62, fs: 12, lines: [
  [{ t: "GET ", c: FN }, { t: "/book/the-prince                    " }, { t: "→ ask", c: C }],
  [{ t: "402 ", c: N }, { t: "Payment Required ", c: K }, { t: "{ accepts: [ … ] }   " }, { t: "→ pay me this, here", c: C }],
  [{ t: "GET ", c: FN }, { t: "/book/the-prince " }, { t: "+ X-Payment", c: K }, { t: "         " }, { t: "→ retry, with proof", c: C }],
  [{ t: "200 ", c: N }, { t: "OK ", c: K }, { t: "+ summary + X-Payment-Response   " }, { t: "→ goods + receipt", c: C }],
]});
card(s, { x: L, y: y + 1.82, w: hw, h: 1.36, tone: "grey", h2: "The server stays dumb",
  p: "It declares a price and points at a facilitator. It never signs, never holds keys, never learns what a chain is." });
card(s, { x: L + hw + 0.4, y: y + 1.82, w: hw, h: 1.36, tone: "lav", h2: "The facilitator is the seam",
  p: "The only chain-specific piece in x402. Adding MOI meant writing one service — not forking a protocol." });
s.addNotes(`[ SCREEN — DECK ]

x402 is smaller than people expect. Four messages.

You ask for something. The server says 402 Payment Required — a status code reserved in 1997 and left unimplemented for twenty-eight years — and the reply is machine-readable: pay this much, in this asset, to this address.

You pay, then ask again with proof attached in a header. You get the goods plus a receipt.

Two things worth noticing. The server stays dumb — it declares a price and points at a facilitator. It never signs anything, never holds a key, never learns what a chain is. That's why adopting x402 as a seller is nearly free.

And the facilitator is the only chain-specific piece in the whole protocol. That's the seam. Adding MOI meant writing one service — not forking a protocol, not changing a single byte of the wire format.

[ STAY ON DECK. ]`);

/* ═════ 06 · FLOW (light) ═════ */
s = slide(false);
y = head(s, 6, "the flow", "One purchase, thirteen steps, one second", null, false);
[["1", "Ask the registry — who sells books?", "on chain", false],
 ["2", "Read the catalog. Free — discovery shouldn't cost money.", null, false],
 ["3", "The agent picks the book that answers its question.", null, false],
 ["4", "Ask for it  →  402 Payment Required", null, false],
 ["6", "Is that address really the seller's registered wallet?", "the beat", true],
 ["7", "Pay — the buyer moves its own funds.", "only write", false],
 ["8", "Retry with the signed payment attached.", null, false],
 ["10", "Facilitator runs nine checks. All read-only.", null, false],
 ["13", "Book delivered. Receipt carries a real interaction hash.", null, false]]
.forEach(([n, t, tag, hot], i) => {
  const yy = y + i * 0.44;
  s.addText(n, { x: L, y: yy, w: 0.42, h: 0.3, align: "right", fontFace: MONO, fontSize: 11.5,
    bold: !!hot, color: hot ? ACC_L : T_LOW, margin: 0 });
  s.addText(t, { x: L + 0.62, y: yy, w: 7.6, h: 0.3, fontFace: SANS, fontSize: 12.5,
    bold: !!hot, color: hot ? INK : T_MED, margin: 0 });
  if (tag) s.addText(tag.toUpperCase(), { x: L + 8.5, y: yy + 0.02, w: 2, h: 0.26,
    fontFace: MONO, fontSize: 9, charSpacing: 1, color: hot ? ACC_L : T_LOW, margin: 0 });
});
accentLine(s, "Exactly one on-chain write per purchase. Everything else is HTTP, or a read.", false);
s.addNotes(`[ SCREEN — DECK ]

Here's the whole purchase. Thirteen steps, and it finishes in about a second — I'll slow it down when we run it.

Step one, the agent asks the registry who sells books. It has never been given a URL.

Two and three: it reads the catalog, which is free — discovery should never cost money, otherwise you can't decide what you want — and picks the book that answers its question.

Four: it asks, and gets the 402.

Step six is the one to watch. Before any money moves, the agent goes back to the chain and checks that the address in the invoice really belongs to that seller.

Seven: it pays — and note the buyer moves its own funds. That's the only on-chain write in the entire purchase.

Then the facilitator confirms, and the book comes back with a receipt.

[ >>> SWITCH TO TERMINAL — DEMO 1, the happy path.

    DEMO_PAUSE_MS=1200 npm run demo

  ~25 seconds. Narrate as the banners print — they are the 13 steps you just walked through.
  Call out step 1 (found on chain), step 6 (the identity check), step 7 (the buyer's own transfer).
  Land on the closing box: "Payment complete".

  Say: "that is a real interaction hash — you can look it up on Voyage right now."

<<< BACK TO DECK for slide 7. ]`);

/* ═════ 07 · DISCOVERY (light) ═════ */
s = slide(false);
y = head(s, 7, "step one — discover", "Nobody hands you a URL",
  "The buyer searches the registry by skill. It learns the seller's agent id, its operating wallet, and where it runs — all from the chain.", false);
code(s, { x: L, y, w: 6.7, h: 2.45, file: "discover.ts", lines: [
  [{ t: "const ", c: K }, { t: "found = " }, { t: "await ", c: K }, { t: "discoverBySkill", c: FN }, { t: "(registry, " }, { t: "'sells-books'", c: S }, { t: ")" }],
  [],
  [{ t: "// straight off the chain", c: C }],
  [{ t: "found[0].agent_id       " }, { t: "// \"agent_12\"", c: C }],
  [{ t: "found[0].agent_wallet   " }, { t: "// 0x0000…97c4", c: C }],
  [{ t: "found[0].url            " }, { t: "// where it runs", c: C }],
  [{ t: "found[0].status         " }, { t: "// ACTIVE", c: C }],
]});
card(s, { x: L + 7.1, y, w: W - 7.1, h: 2.45, tone: "lav", label: "be precise",
  h2: "It is not a search engine",
  p: "An O(n) client-side scan — every agent id, then every profile, then filter on the card's skill tags.\n\nThe registry has no index. Fine at demo scale. Don't call it semantic search." });
s.addNotes(`[ SCREEN — DECK  ·  back from demo 1 ]

Discovery. One line of code, and the important part is what isn't in it: a URL.

The agent asks the registry for anything with the skill "sells-books" and gets back the agent id, the wallet it operates from, where it runs, and whether it's still active. All of that comes off the chain.

Now — I want to be precise, because it would be easy to oversell this. It is not a search engine. Under the hood it fetches every agent id, then every profile, then filters client-side on the skill tags in each agent's card. That's an O(n) scan.

At demo scale that's completely fine. At ten thousand agents you'd want an indexer. I'd rather tell you that than have you find out later.

What matters is that the agent's knowledge of the seller comes from the chain, not from me hardcoding an endpoint.

[ STAY ON DECK. ]`);

/* ═════ 08 · THE 402 (light) ═════ */
s = slide(false);
y = head(s, 8, "step two — the invoice", "A machine-readable bill",
  "The seller answers 402 with everything an agent needs to pay, and nothing it doesn't. Field names are the x402 spec's, verbatim.", false);
code(s, { x: L, y, w: W, h: 2.95, fs: 12, file: "402 response body", lines: [
  [{ t: "{ " }, { t: "\"x402Version\"", c: S }, { t: ": " }, { t: "1", c: N }, { t: ", " }, { t: "\"accepts\"", c: S }, { t: ": [{" }],
  [{ t: "  " }, { t: "\"scheme\"", c: S }, { t: ":  " }, { t: "\"moi-transfer\"", c: S }, { t: "," }],
  [{ t: "  " }, { t: "\"network\"", c: S }, { t: ": " }, { t: "\"moi-voyage-devnet\"", c: S }, { t: "," }],
  [{ t: "  " }, { t: "\"maxAmountRequired\"", c: S }, { t: ": " }, { t: "\"1\"", c: S }, { t: "," }],
  [{ t: "  " }, { t: "\"asset\"", c: S }, { t: ": " }, { t: "\"0x…\"", c: S }, { t: ",          " }, { t: "// a MAS0 asset", c: C }],
  [{ t: "  " }, { t: "\"payTo\"", c: S }, { t: ": " }, { t: "\"0x0000…97c4\"", c: S }, { t: ",  " }, { t: "// ← 32 anonymous bytes", c: C }],
  [{ t: "  " }, { t: "\"extra\"", c: S }, { t: ": { " }, { t: "\"payToAgentId\"", c: S }, { t: ": " }, { t: "\"agent_12\"", c: S }, { t: " }   " }, { t: "// ← our addition", c: C }],
  [{ t: "}] }" }],
]});
accentLine(s, "payToAgentId is the hook. It's what lets the buyer go and check.", false);
s.addNotes(`[ SCREEN — DECK ]

This is what comes back with the 402. It's a bill an agent can read.

Scheme and network say how and where to pay. On EVM chains you'd see "exact" and "base" here; ours say "moi-transfer" and "moi-voyage-devnet". Then the amount, the asset — a native MAS0 asset — and payTo.

Every field name there is from the x402 spec, verbatim. I pulled them out of the installed package's schema rather than from memory, because being wire-compatible only counts if it's actually wire-compatible.

Look at payTo. Thirty-two bytes. That is the entire identity claim x402 makes, and it makes none.

The one thing we add is in extra: payToAgentId. That's the hook. It's what lets the buyer take this invoice back to the chain and ask "is this actually you?" — which is the next slide.

[ STAY ON DECK. ]`);

/* ═════ 09 · THE BEAT (dark) ═════ */
s = slide(true);
y = head(s, 9, "step three — the check", "The question x402 cannot ask",
  "Before a single unit moves, the buyer goes back to the chain and asks whether that payment address really belongs to the agent it thinks it's buying from.", true);
code(s, { x: L, y, w: 6.7, h: 2.62, file: "identity-check.ts", lines: [
  [{ t: "const ", c: K }, { t: "onChain = " }, { t: "await ", c: K }, { t: "readAgentWallet", c: FN }, { t: "(" }],
  [{ t: "  registry, requirements.extra.payToAgentId" }],
  [{ t: ")" }],
  [],
  [{ t: "if ", c: K }, { t: "(onChain !== requirements.payTo) {" }],
  [{ t: "  return ", c: K }, { t: "'refuse — payTo is not their wallet'", c: S }],
  [{ t: "}" }],
]});
card(s, { x: L + 7.1, y, w: W - 7.1, h: 2.62, tone: "pink", label: "live, on stage",
  h2: "We swap the address",
  p: "Repoint the seller's registry entry at an attacker, then run the demo again.\n\nThe seller still asks for its real address. The numbers disagree — the agent walks away." });
s.addNotes(`[ SCREEN — DECK ]

This is the slide. If you remember one thing from today, make it this one.

Before a single unit moves, the buyer takes the payTo address from the invoice, goes back to the chain, and asks: does this actually belong to agent_12? If the answer is no, it refuses. That's seven lines of code.

Now think about what that's worth. On any other chain the buyer has no way to ask this question — there's no registry to ask. The address is just a number, and you either trust the endpoint that gave it to you or you don't transact.

In a minute I'm going to attack this live. I'll repoint the seller's registry entry at an attacker's address, as if someone compromised the listing. The seller will still ask to be paid at its real address. The two won't match — and you'll watch the agent notice and walk away with no money moving.

That is the session in one demo.

[ >>> SWITCH TO TERMINAL — DEMO 2, the attack. This is the one they remember.

    npm run demo -- --tamper

  Before you run it, say what you're doing: "I've repointed the seller's registry entry at an
  attacker's address."
  Let the red lines land — "payTo does NOT match" — then the summary: "Agent refused. Money
  moved: none."

  It restores the registry itself, so you can run it again if someone asks.

<<< BACK TO DECK for slide 10. ]`);

/* ═════ 10 · FACILITATOR (light) ═════ */
s = slide(false);
y = head(s, 10, "settlement", "A referee, not a cashier",
  "On other chains the facilitator pulls the buyer's funds. On MOI only you can move your own money — so the buyer pays itself, and the facilitator proves it happened.", false);
card(s, { x: L, y, w: hw, h: 1.5, tone: "grey", label: "elsewhere",
  p: "The token contract verifies an off-chain signature, so a third party can move your funds for you. The facilitator holds the money." });
card(s, { x: L + hw + 0.4, y, w: hw, h: 1.5, tone: "lav", label: "here",
  p: "The buyer submits its own transfer and signs a statement naming it. The facilitator reads the chain and confirms. It signs nothing." });
s.addText("Nine checks, all read-only — signature, key ownership, amount, freshness, is the payee a registered agent, did the transfer land, has it been spent before.",
  { x: L, y: y + 1.74, w: W, h: 0.58, fontFace: SANS, fontSize: 13, color: T_MED, margin: 0, lineSpacingMultiple: 1.4 });
marks(s, { x: L, y: y + 2.4, w: 10.5, step: 0.36, mark: "+", color: GREEN, textColor: INK,
  items: ["Eleven forged payments rejected — each for the right reason",
          "One honest payment accepted — the control that makes the rest mean anything"] });
s.addNotes(`[ SCREEN — DECK  ·  back from demo 2 ]

A word on settlement, because we diverge from x402 here and I'd rather say it than have someone find it.

On EVM chains the facilitator pulls your funds. That works because of EIP-3009 — the token contract itself verifies an off-chain signature, so a third party can move your money on your behalf.

MAS0 has no equivalent, and on MOI only the owner can move their own funds. That's a property of the chain, not something I can engineer around.

So the flow inverts. The buyer submits its own transfer, then signs a statement naming that transaction. The facilitator reads the chain, decodes the transfer, and confirms sender, recipient, asset and amount all match what was signed. It signs nothing. It is a referee, not a cashier.

Nine checks in total, all read-only. And the suite fires eleven forged payments at it — tampered amounts, redirected payees, replays — plus one honest one, because a facilitator that rejects everything would pass a badly written test.

[ OPTIONAL, if you have time —

    npm run attack-test

  Eleven forgeries rejected, one honest control accepted. Skip it if you're over 30 minutes. ]`);

/* ═════ 11 · NEXT (light) ═════ */
s = slide(false);
y = head(s, 11, "where this goes", "Identity today. Authority next.",
  "One idea per session, so each one lands. Today's demo deliberately says nothing about what an agent is allowed to spend — that's a different idea, and it gets its own session.", false);
[["session 07", "Identity + payment", "Who am I paying?  The registry answers it, and the agent refuses when the answer is wrong. You are here.", "lav"],
 ["session 08", "Authority", "What may my agent spend?  A cap the chain itself enforces. The agent doesn't get to be well behaved — it simply can't.", "grey"],
 ["session 09", "Conditional settlement", "What if it never arrives?  Funds release on delivery. Escrow as a chain primitive, not a trusted middleman.", "grey"]]
.forEach(([lab, h2, p, tone], i) => card(s, { x: L + i * (cw + 0.35), y, w: cw, h: 2.3, tone, label: lab, h2, p }));
accentLine(s, "You can't give authority to an agent that has no identity. Today we spent that identity.", false);
s.addNotes(`[ SCREEN — DECK ]

Where this goes, and why today stops where it does.

Today answers "who am I paying". The registry answers it, and the agent refuses when the answer is wrong.

Session 8 answers a different question: what is my agent allowed to spend? That's a cap the chain enforces. And the interesting part is the agent doesn't get to choose to be well behaved — it tries to overspend and the chain refuses to record it.

Session 9 answers the third: what if the goods never arrive? Funds commit up front and only release on delivery. Escrow as a chain primitive rather than a trusted middleman — and MOI has that natively, we proved it in session 4.

I deliberately did not build 8 and 9 into today. Three ideas in one talk means you leave with none.

The throughline: you can't give authority to an agent that has no identity. Session 3 built the identity. Today we spent it.

[ STAY ON DECK. ]`);

/* ═════ 12 · RUN IT (dark) ═════ */
s = slide(true);
y = head(s, 12, "your turn", "Run it in sixty seconds",
  "Fund one devnet wallet, run two setup scripts, and the same demo settles for real on Voyage — with an interaction hash you can look up.", true);
code(s, { x: L, y, w: W, h: 2.18, fs: 11, file: "terminal", lines: [
  [{ t: "git clone …/MOI-Webinars && " }, { t: "cd", c: K }, { t: " MOI-Webinars/session-7" }],
  [{ t: "npm install" }],
  [],
  [{ t: "npm run setup:asset && npm run setup:registry   " }, { t: "# one-time", c: C }],
  [{ t: "npm run demo                                 " }, { t: "# the happy path", c: C }],
  [{ t: "npm run demo -- --tamper                     " }, { t: "# watch it refuse", c: C }],
]});
card(s, { x: L, y: y + 2.4, w: hw, h: 1.05, tone: "darkline", label: "one wallet is enough",
  p: "Only the buyer needs funding — the seller receives, so it never signs and never needs gas." });
card(s, { x: L + hw + 0.4, y: y + 2.4, w: hw, h: 1.05, tone: "green", label: "read the code",
  p: "Start at verify-payment.ts — the nine checks are the session in one file." });
s.addNotes(`[ SCREEN — DECK  ·  final slide ]

Your turn — and you can do this on the train home.

Clone the repo, npm install, and fund one devnet wallet at voyage.moi.technology. Just one — the seller only ever receives, so it never signs and never needs gas.

Two setup scripts: one mints the MAS0 asset and gives the buyer a float, the other registers both agents on chain. Then npm run demo, and everything you just watched happens against real devnet, with an interaction hash you can look up.

Add --tamper to see it refuse, and npm run attack-test to fire eleven forged payments at the facilitator.

If you read one file, make it verify-payment.ts. The nine checks are the whole session in about a hundred and fifty lines.

Questions.

[ Leave this slide up for Q&A — the commands stay on screen while people type them.
  Terminal ready in case someone asks to see something again. ]`);

const out = path.join(__dirname, "MOI_Builders_S7.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("wrote " + out));
