// Watch the agent think, in a browser.
//
//   npm run ui        -> http://localhost:4000
//
// Same run as `npm run demo`, but every stage is streamed to a page as it happens: the agent
// realising it can't answer, scanning the registry, reading the seller's advertised skills, being
// quoted, checking who it is about to pay, paying on chain, and finally unlocking the answer.
//
// Server-Sent Events rather than websockets — one direction, no library, no build step. The page is
// inlined below so there is nothing to serve from disk and nothing to go stale.

import express from "express";
import {
  config, buyerAccount, sellerAccount, registryClient, updateAgentWallet,
  banner, detail, ok, warn, say, type AgentStep, type Account,
} from "@demo/shared";
import { getAssetDriver } from "js-moi-sdk";
import { startSeller } from "@demo/agent-seller";
import { runBuyer } from "@demo/agent-buyer";
import { PaymentRefused } from "@demo/agent-buyer/src/pay.js";

const PORT = Number(process.env.UI_PORT ?? "4000");

/** A wrong-but-well-formed address, for the "compromised listing" toggle. */
const ATTACKER = "0x" + "de".repeat(28) + "00000000";

/** Own balance only — MAS0 rejects reads of another account ("invalid access to actor"). */
async function myBalance(account: Account): Promise<string> {
  try {
    const driver: any = await getAssetDriver(config.assetId, account.wallet);
    const { output, error } = await driver.routines.BalanceOf(account.address);
    return error ? "?" : String(output?.balance ?? 0);
  } catch { return "?"; }
}

async function main(): Promise<void> {
  banner("DEMO", "ui", "Agent console");
  if (!config.assetIdOrNull) throw new Error("SETTLEMENT_ASSET_ID is not set — run `npm run setup:asset` first.");
  if (!config.sellerAgentId) throw new Error("agents are not registered — run `npm run setup:registry` first.");

  const buyer = await buyerAccount();

  // ONE seller for the process. Its verification events are routed to whichever request is live —
  // a demo asks one question at a time, and starting a second seller would collide on the port.
  let live: ((event: string, data: unknown) => void) | null = null;
  const seller = await startSeller({
    onEvent: (e) => {
      if (!live || e.type !== "checked") return;
      live("step", {
        n: 0,
        actor: "seller",
        title: e.ok ? "I checked your payment myself" : "Your payment did not check out",
        thought:
          "I don't take your word that you paid. I read the interaction off the chain and " +
          "decoded it: right sender, right recipient, right amount, not already spent.",
        checks: e.checks,
        ...(e.txHash ? { detail: [["confirmed interaction", e.txHash]] as [string, string][] } : {}),
        status: e.ok ? "ok" : "fail",
      } satisfies AgentStep);
    },
  });

  const app = express();
  app.get("/", (_req, res) => res.type("html").send(PAGE));

  app.get("/ask", async (req, res) => {
    const question = String(req.query.q ?? "").trim();
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    if (!question) { send("error", { message: "ask me something" }); return res.end(); }

    // Repoint the seller's registry entry at an attacker, so the buyer's identity check fails for
    // real rather than being faked in the UI. Always restored below.
    const tamper = req.query.tamper === "1";
    let tampered = false;
    if (tamper) {
      await updateAgentWallet(await registryClient(buyer, false), config.sellerAgentId!, ATTACKER);
      tampered = true;
      send("step", {
        n: 0,
        actor: "chain",
        title: "Someone has edited the seller's registry entry",
        thought:
          "Its listing now points at an attacker's address. The seller itself is unchanged and " +
          "will still ask to be paid at its real address. Watch what the buyer does.",
        detail: [["registry now says", ATTACKER]],
        status: "fail",
      } satisfies AgentStep);
    }

    live = send;
    let outcome: { ok: boolean; refused?: boolean; message?: string };
    try {
      send("balance", { before: await myBalance(buyer) });
      await runBuyer({
        fallbackUrl: seller.url,
        question,
        onStep: (step) => send("step", step),
      });
      send("balance", { after: await myBalance(buyer) });
      outcome = { ok: true };
    } catch (err) {
      outcome = { ok: false, refused: err instanceof PaymentRefused, message: (err as Error).message };
    }
    live = null;

    // Undo the tamper BEFORE "done" — the page closes the stream on that event, so anything sent
    // afterwards is written into a socket nobody is reading.
    if (tampered) {
      try {
        const real = await sellerAccount();
        await updateAgentWallet(await registryClient(buyer, false), config.sellerAgentId!, real.address);
        send("step", {
          n: 0, actor: "chain", title: "Registry entry restored",
          thought: "Putting the listing back so the next run starts clean.",
          detail: [["back to", real.address]], status: "ok",
        } satisfies AgentStep);
      } catch (e) {
        warn(`FAILED to restore the registry entry: ${(e as Error).message}`);
        warn("run `npm run demo -- --tamper` and let it finish to put it back");
        send("step", {
          n: 0, actor: "chain", title: "Could not restore the registry entry",
          thought: "The next run will refuse until this is put back. Run `npm run demo -- --tamper` and let it finish.",
          status: "fail",
        } satisfies AgentStep);
      }
    }

    send("done", outcome);
    res.end();
  });

  await new Promise<void>((resolve) => { app.listen(PORT, "127.0.0.1", () => resolve()); });
  ok(`agent console on http://localhost:${PORT}`);
  detail("wallet", buyer.address);
  detail("balance", `${await myBalance(buyer)} ${config.assetSymbol}`);
  detail("brain", config.groqKey ? `groq:${config.groqModel}` : "keyword fallback (no GROQ_API_KEY)");
  say("DEMO", "every question spends real money — open the page and ask for something");
}

// ── the page ───────────────────────────────────────────────────────────────────────────────
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MOI · Agent console</title>
<style>
  :root{
    --ink:#0A0026; --main:#4B17E5; --dark:#320F99; --lav:#F5F2FF; --pastel:#D9CCFF;
    --accent:#BCA6FF; --ok:#3CCB8E; --bad:#D6336C; --mut:rgba(255,255,255,.55);
    --hi:rgba(255,255,255,.92); --line:rgba(255,255,255,.10);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ink);color:var(--hi);
    font-family:Poppins,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:820px;margin:0 auto;padding:40px 20px 100px}
  h1{font-size:26px;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
  .sub{color:var(--mut);margin:0 0 28px;font-size:14px}
  form{display:flex;gap:10px;margin-bottom:12px}
  input{flex:1;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:12px;
    padding:15px 18px;color:var(--hi);font:inherit;outline:none}
  input:focus{border-color:var(--main);background:rgba(75,23,229,.10)}
  button{background:var(--main);border:0;border-radius:12px;color:#fff;font:inherit;font-weight:600;
    padding:15px 26px;cursor:pointer}
  button:disabled{opacity:.45;cursor:default}
  .tamper{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--mut);
    margin:0 0 18px;cursor:pointer}
  .tamper input{accent-color:var(--bad);width:15px;height:15px;cursor:pointer}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:32px}
  .chip{background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:999px;
    padding:7px 14px;font-size:12.5px;color:var(--mut);cursor:pointer}
  .chip:hover{border-color:var(--main);color:var(--hi)}
  .bal{font-size:12px;color:var(--mut);margin-bottom:24px;letter-spacing:.06em;text-transform:uppercase}
  .bal b{color:var(--accent);font-weight:600}
  .step{border-left:2px solid var(--line);padding:0 0 26px 22px;position:relative;
    opacity:0;transform:translateY(8px);animation:in .4s ease forwards}
  @keyframes in{to{opacity:1;transform:none}}
  .step::before{content:"";position:absolute;left:-6px;top:5px;width:10px;height:10px;border-radius:50%;
    background:var(--main);box-shadow:0 0 0 4px var(--ink)}
  .step.ok::before{background:var(--ok)} .step.fail::before{background:var(--bad)}
  .step.working::before{background:var(--accent);animation:pulse 1.1s infinite}
  @keyframes pulse{50%{opacity:.35}}
  .who{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
  .who.buyer{color:var(--accent)} .who.seller{color:#F5A0C4} .who.chain{color:#7FE3C0}
  .ttl{font-weight:600;margin-bottom:6px}
  .say{color:var(--mut);font-size:14px;margin-bottom:10px}
  .kv{display:grid;grid-template-columns:150px 1fr;gap:3px 14px;font-size:12.5px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .kv dt{color:var(--mut)} .kv dd{margin:0;word-break:break-all;color:var(--hi)}
  .kv dd.hash{color:var(--accent);cursor:pointer;border-bottom:1px dashed rgba(188,166,255,.4)}
  .kv dd.hash:hover{color:#fff}
  .kv dd.hash::after{content:" ⧉";opacity:.5;font-size:11px}
  .kv dd.proof{color:var(--ok);border-bottom-color:rgba(60,203,142,.45);font-weight:600}
  .kv dd.proof:hover{color:#fff}
  .copied{color:var(--ok) !important}
  .chk{display:flex;gap:9px;align-items:baseline;font-size:12.5px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 0}
  .chk i{font-style:normal} .chk .p{color:var(--ok)} .chk .f{color:var(--bad)}
  .chk span{color:var(--mut)}
  pre{background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:12px;
    padding:16px;overflow-x:auto;font-size:12.5px;margin:4px 0 0;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .pendttl{color:var(--mut);font-weight:400}
  .pendttl::after{content:"";animation:dots 1.4s steps(4,end) infinite}
  @keyframes dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
  .end{border-radius:12px;padding:14px 18px;margin-top:8px;font-size:14px}
  .end.ok{background:rgba(60,203,142,.12);border:1px solid rgba(60,203,142,.35)}
  .end.no{background:rgba(214,51,108,.12);border:1px solid rgba(214,51,108,.35)}
  @media(max-width:600px){.kv{grid-template-columns:1fr;gap:0 0}.kv dt{margin-top:6px}}
</style></head><body><div class="wrap">
  <h1>Ask an agent for something</h1>
  <p class="sub">It doesn't know the answer. It'll find someone who does, check who they are, and pay them.</p>
  <form id="f"><input id="q" placeholder="how likely is a big bitcoin drawdown this quarter?" autocomplete="off"/><button id="go">Ask</button></form>
  <label class="tamper"><input type="checkbox" id="tamper"/> Simulate a compromised listing — repoint the seller's registry entry at an attacker</label>
  <div class="chips">
    <div class="chip">How likely is a big bitcoin drawdown this quarter?</div>
    <div class="chip">Will bitcoin close higher a week from now?</div>
    <div class="chip">Is bitcoin volatility going to spike this month?</div>
  </div>
  <div class="bal" id="bal"></div>
  <div id="feed"></div>
</div><script>
const $=s=>document.querySelector(s), feed=$("#feed"), bal=$("#bal");
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
let before=null;
document.querySelectorAll(".chip").forEach(c=>c.onclick=()=>{$("#q").value=c.textContent;$("#f").requestSubmit()});
// Interaction hashes are the proof this really happened — make them one click to copy so you can
// paste straight into an explorer while the room is watching.
feed.addEventListener("click",e=>{
  const d=e.target.closest(".hash"); if(!d) return;
  navigator.clipboard.writeText(d.textContent.trim()).then(()=>{
    d.classList.add("copied"); setTimeout(()=>d.classList.remove("copied"),900);
  });
});
function render(s){
  const d=document.createElement("div");
  d.className="step "+(s.status||"");
  let h='<div class="who '+s.actor+'">'+esc(s.actor)+'</div><div class="ttl">'+esc(s.title)+'</div>';
  if(s.thought) h+='<div class="say">'+esc(s.thought)+'</div>';
  if(s.detail&&s.detail.length) h+='<dl class="kv">'+s.detail.map(([k,v])=>{
    const isHex=/^0x[0-9a-f]{64}$/i.test(String(v));
    // Wallets and interaction hashes are both 64 hex chars. Only one of them is proof that a
    // payment happened, so it gets its own colour — otherwise it disappears into the addresses.
    const isProof=isHex&&/interaction|\btx\b/i.test(k);
    const cls=isProof?"hash proof":isHex?"hash":"";
    const tip=isProof?"the on-chain proof — click to copy, paste into voyage.moi.technology"
                     :isHex?"click to copy":"";
    return '<dt>'+esc(k)+'</dt><dd'+(cls?' class="'+cls+'" title="'+tip+'"':'')+'>'+esc(v)+'</dd>';
  }).join("")+'</dl>';
  if(s.checks) h+=s.checks.map(c=>'<div class="chk"><i class="'+(c.passed?"p":"f")+'">'+(c.passed?"✓":"✗")+'</i><b>'+esc(c.name)+'</b><span>'+esc(c.detail)+'</span></div>').join("");
  if(s.data!==undefined) h+='<pre>'+esc(JSON.stringify(s.data,null,2))+'</pre>';
  d.innerHTML=h; feed.appendChild(d); d.scrollIntoView({behavior:"smooth",block:"end"});
}
// The work is bursty — the registry scan takes ~10s and emits one step, then the catalog and the
// choice land milliseconds apart. Rendering as fast as events arrive makes half the run appear at
// once, which is unreadable from the back of a room. So the stream fills a queue and the page
// drains it at a steady beat.
//
// Default is 6s per card. That is far slower than the work actually takes, and that is the point:
// this is narrated live, and a card you cannot finish a sentence over may as well not be on screen.
// Override with ?gap=1500 to move quickly, or ?gap=0 to watch it run flat out.
const GAP=Math.max(0,Number(new URLSearchParams(location.search).get("gap")||6000));
let queue=[], finished=null, timer=null, pend=null;

function showPending(){
  if(!pend){
    pend=document.createElement("div");
    pend.className="step working";
    pend.innerHTML='<div class="who">···</div><div class="ttl pendttl">working</div>';
  }
  feed.appendChild(pend);           // always last
}
function hidePending(){ if(pend&&pend.parentNode) pend.remove(); }

function finish(r){
  const d=document.createElement("div");
  d.className="end "+(r.ok?"ok":"no");
  d.textContent=r.ok?"Done — the agent found a seller, verified it, paid it, and got the answer."
    :(r.refused?"Agent refused to pay. No money moved.":"Failed: "+r.message);
  feed.appendChild(d); d.scrollIntoView({behavior:"smooth",block:"end"});
  $("#go").disabled=false;
}

function tick(){
  if(queue.length){ hidePending(); render(queue.shift()); return; }
  if(finished){ clearInterval(timer); timer=null; hidePending(); const r=finished; finished=null; finish(r); return; }
  showPending();
}

$("#f").onsubmit=e=>{
  e.preventDefault();
  const q=$("#q").value.trim(); if(!q) return;
  feed.innerHTML=""; bal.textContent=""; $("#go").disabled=true;
  queue=[]; finished=null; pend=null;
  if(timer) clearInterval(timer);
  timer=setInterval(tick,GAP||16);
  const es=new EventSource("/ask?q="+encodeURIComponent(q)+($("#tamper").checked?"&tamper=1":""));
  es.addEventListener("step",m=>queue.push(JSON.parse(m.data)));
  es.addEventListener("balance",m=>{
    const b=JSON.parse(m.data);
    if(b.before!==undefined){before=b.before;bal.innerHTML="balance <b>"+esc(b.before)+"</b>";}
    else bal.innerHTML="balance <b>"+esc(before)+"</b> → <b>"+esc(b.after)+"</b>";
  });
  // Don't end the run the moment the server does — let the queue drain first.
  es.addEventListener("done",m=>{ finished=JSON.parse(m.data); es.close(); });
  es.onerror=()=>{ es.close(); if(!finished&&!queue.length){ if(timer)clearInterval(timer); timer=null; hidePending(); $("#go").disabled=false; } };
};
</script></body></html>`;

main().catch((e) => { console.error(`\nui failed: ${(e as Error).message}\n`); process.exit(1); });
