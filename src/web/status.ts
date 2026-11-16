import { FAVICON_LINK } from "./favicon";
import { CSS } from "./page";

export function renderStatusPage(): string {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${FAVICON_LINK}
<title>Status · Marktplaats Radar</title>
<style>${CSS}${STATUS_CSS}</style></head>
<body>
<header>
  <h1>📊 Status</h1>
  <div class="actions"><a class="ghost btnlink" href="/">← Snipers</a></div>
</header>
<main>
  <section id="health" class="card health"><p class="muted">Laden…</p></section>

  <section class="tiles">
    <div class="card tile"><div class="tile-label">Runs laatste uur</div><div class="tile-value" id="t-runs">–</div><div class="tile-sub" id="t-runs-sub"></div></div>
    <div class="card tile"><div class="tile-label">Fouten (24 u)</div><div class="tile-value" id="t-errors">–</div><div class="tile-sub">bij Marktplaats</div></div>
    <div class="card tile"><div class="tile-label">Afgebroken (24 u)</div><div class="tile-value" id="t-missing">–</div><div class="tile-sub">gestart, niet afgerond</div></div>
    <div class="card tile"><div class="tile-label">Vondsten (24 u)</div><div class="tile-value" id="t-matched">–</div><div class="tile-sub" id="t-pushed"></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Runs per uur</h2><button id="table-btn" class="ghost small">Toon tabel</button></div>
    <div class="card">
      <div class="legend">
        <span><i class="sw ok"></i>✓ Gelukt</span>
        <span><i class="sw missing"></i>⚠ Afgebroken</span>
        <span><i class="sw err"></i>✕ Fout</span>
        <span class="muted">· beweeg over een uur voor details</span>
      </div>
      <div id="chart" class="chart" role="img" aria-label="Runs per uur, laatste 24 uur"></div>
      <div id="chart-x" class="chart-x"></div>
      <div id="tip" class="tip" hidden></div>
      <div id="hour-table" hidden></div>
    </div>
  </section>

  <section>
    <h2>Per zoekterm</h2>
    <div id="terms" class="list"></div>
  </section>

  <section>
    <h2>Laatste fouten</h2>
    <div id="errors" class="card small"></div>
  </section>

  <section>
    <h2>Verbruik vandaag (gratis plan)</h2>
    <div class="card">
      <div class="quota"><div class="quota-head"><span>Verzoeken</span><span id="q-req"></span></div><div class="bar"><div id="q-req-bar"></div></div></div>
      <div class="quota"><div class="quota-head"><span>Database-schrijfacties (schatting)</span><span id="q-wr"></span></div><div class="bar"><div id="q-wr-bar"></div></div></div>
      <p class="muted small">Limiet per dag: 100.000 elk. Rekentijd per run zie je in het Cloudflare-dashboard → Workers → marktplaats-radar → Metrics.</p>
    </div>
  </section>
  <p class="muted small" id="updated"></p>
</main>
<script>${STATUS_JS}</script>
</body></html>`;
}

const STATUS_CSS = `
:root{--good:#0ca30c;--serious:#ec835a;--critical:#d03b3b;--grid:#e1e0d9}
@media (prefers-color-scheme:dark){:root{--grid:#2c2c2a}}
.health{display:flex;gap:12px;align-items:flex-start}
.health .icon{font-size:28px;line-height:1}
.health h2{margin:0 0 2px}
.health ul{margin:6px 0 0;padding-left:18px}
.health.ok{border-color:var(--good)}.health.warning{border-color:var(--serious)}.health.down{border-color:var(--critical)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.tile-label{font-size:13px;color:var(--muted)}
.tile-value{font-size:28px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
.tile-sub{font-size:12px;color:var(--muted)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-bottom:10px}
.legend span{display:inline-flex;gap:6px;align-items:center}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px}
.sw.ok,.seg.ok{background:var(--good)}.sw.missing,.seg.missing{background:var(--serious)}.sw.err,.seg.err{background:var(--critical)}
.chart{position:relative;display:flex;align-items:flex-end;gap:3px;height:140px;border-bottom:1px solid var(--grid);
  background:linear-gradient(to top,transparent calc(50% - 1px),var(--grid) calc(50% - 1px),var(--grid) 50%,transparent 50%)}
.col{flex:1;display:flex;flex-direction:column-reverse;gap:2px;height:100%;justify-content:flex-start;cursor:default;min-width:0}
.col:hover{background:rgba(127,127,127,.08)}
.seg{width:100%}
.flag{align-self:center;font-size:10px;font-weight:700;line-height:14px;width:14px;height:14px;border-radius:50%;text-align:center;color:#fff;margin-bottom:2px;flex-shrink:0}
.flag.err{background:var(--critical)}.flag.missing{background:var(--serious);color:#0b0b0b}
.col .seg:last-child{border-radius:4px 4px 0 0}
.chart-x{display:flex;gap:3px;font-size:11px;color:var(--muted);margin-top:4px}
.chart-x span{flex:1;text-align:center;min-width:0;white-space:nowrap}
.tip{position:fixed;z-index:10;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:13px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.15)}
.tip b{display:block;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;font-variant-numeric:tabular-nums}
th,td{text-align:right;padding:4px 6px;border-bottom:1px solid var(--border)}th:first-child,td:first-child{text-align:left}
.term{display:grid;grid-template-columns:1fr auto;gap:4px 12px}
.term h3{margin:0;font-size:15px}
.term .stats{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted);grid-column:1/-1}
.term .stats b{color:var(--text);font-variant-numeric:tabular-nums}
.pill{font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap;align-self:start}
.pill.ok{color:var(--good)}.pill.baseline{color:var(--muted)}.pill.error{color:var(--critical)}.pill.stale{color:var(--serious)}
.err-row{padding:6px 0;border-bottom:1px solid var(--border)}.err-row:last-child{border-bottom:0}
.quota{margin-bottom:12px}.quota-head{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
.bar{height:8px;border-radius:4px;background:var(--border);overflow:hidden}.bar div{height:100%;background:var(--good);border-radius:4px}
@media (max-width:620px){.tiles{grid-template-columns:repeat(2,1fr)}.chart-x span:not(.major){visibility:hidden}}
`;

const STATUS_JS = `
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); for (const k of kids) if (k != null) e.append(k); return e; };
const nf = new Intl.NumberFormat("nl-NL");
const localHour = (key) => new Date(key + ":00:00Z").toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
function ago(iso) {
  if (!iso) return "nooit";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + " s geleden";
  if (s < 3600) return Math.round(s / 60) + " min geleden";
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

async function load() {
  const res = await fetch("/api/status");
  if (res.status === 401) { location.href = "/login"; return; }
  const st = await res.json();

  const H = { ok: ["✅", "Alles werkt"], warning: ["⚠️", "Let op"], down: ["❌", "De radar staat stil"] }[st.health.status];
  const health = $("#health"); health.className = "card health " + st.health.status;
  const body = el("div", {}, el("h2", { textContent: H[1] }),
    el("div", { className: "muted small", textContent: "Laatste cron-tik: " + ago(st.lastTickAt) }));
  if (st.health.reasons.length) body.append(el("ul", {}, ...st.health.reasons.map((r) => el("li", { textContent: r }))));
  health.replaceChildren(el("div", { className: "icon", textContent: H[0] }), body);

  const last = st.hours[st.hours.length - 1], prev = st.hours[st.hours.length - 2];
  const sum = (k) => st.hours.reduce((a, h) => a + h[k], 0);
  $("#t-runs").textContent = nf.format(last.runs);
  $("#t-runs-sub").textContent = "van " + nf.format(last.dispatched) + " gestart (vorig uur " + nf.format(prev.runs) + ")";
  $("#t-errors").textContent = nf.format(sum("errors"));
  $("#t-missing").textContent = nf.format(sum("missing"));
  $("#t-matched").textContent = nf.format(sum("matched"));
  $("#t-pushed").textContent = nf.format(sum("pushed")) + " als bericht verstuurd";

  // Stacked bars: gelukt + afgebroken + fout, schaal op het drukste uur.
  // Leave headroom for the problem flags above the bars.
  const max = Math.max(1, ...st.hours.map((h) => h.ok + h.baselines + h.missing + h.errors)) * 1.12;
  const chart = $("#chart"); chart.replaceChildren();
  const tip = $("#tip");
  for (const h of st.hours) {
    const col = el("div", { className: "col" });
    const parts = [["ok", h.ok + h.baselines], ["missing", h.missing], ["err", h.errors]];
    for (const [cls, v] of parts) if (v > 0) col.append(el("div", { className: "seg " + cls, style: "height:" + (v / max * 100) + "%" }));
    // Problems are small next to ~240 good runs per hour; flag the hour so it is visible.
    if (h.errors > 0 || h.missing > 0) col.append(el("div", { className: "flag " + (h.errors > 0 ? "err" : "missing"), textContent: h.errors > 0 ? "✕" : "!" }));
    const label = localHour(h.hour) + "–" + localHour(new Date(Date.parse(h.hour + ":00:00Z") + 3600000).toISOString().slice(0, 13));
    col.onmousemove = (ev) => {
      tip.replaceChildren(el("b", { textContent: label }),
        el("div", { textContent: "✓ Gelukt: " + nf.format(h.ok + h.baselines) }),
        el("div", { textContent: "⚠ Afgebroken: " + nf.format(h.missing) }),
        el("div", { textContent: "✕ Fout: " + nf.format(h.errors) }),
        el("div", { className: "muted", textContent: "Vondsten: " + nf.format(h.matched) + " · berichten: " + nf.format(h.pushed) }));
      tip.hidden = false;
      const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + "px"; tip.style.top = (ev.clientY + 12) + "px";
    };
    col.onmouseleave = () => (tip.hidden = true);
    chart.append(col);
  }
  $("#chart-x").replaceChildren(...st.hours.map((h, i) => el("span", {
    className: i % 6 === 0 ? "major" : "",
    textContent: i % 3 === 0 ? localHour(h.hour).slice(0, 2) : "",
  })));

  const rows = st.hours.slice().reverse().map((h) => el("tr", {},
    el("td", { textContent: localHour(h.hour) }), el("td", { textContent: h.dispatched }), el("td", { textContent: h.ok + h.baselines }),
    el("td", { textContent: h.missing }), el("td", { textContent: h.errors }), el("td", { textContent: h.matched }), el("td", { textContent: h.pushed })));
  $("#hour-table").replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ...["Uur", "Gestart", "Gelukt", "Afgebroken", "Fout", "Vondsten", "Berichten"].map((t) => el("th", { textContent: t })))), el("tbody", {}, ...rows)));

  const terms = $("#terms"); terms.replaceChildren();
  if (!st.terms.length) terms.append(el("p", { className: "muted", textContent: "Nog geen runs in de laatste 24 uur." }));
  for (const t of st.terms) {
    const stale = t.lastRunAt && Date.now() - new Date(t.lastRunAt).getTime() > 3 * 60000;
    const kind = !t.active ? "baseline" : stale ? "stale" : t.lastStatus;
    const text = !t.active ? "Uit" : stale ? "⚠ Geen recente run" : t.lastStatus === "ok" ? "✓ OK" : t.lastStatus === "baseline" ? "Nulmeting" : "✕ Fout";
    const stats = el("div", { className: "stats" });
    const add = (label, value) => stats.append(el("span", {}, label + " ", el("b", { textContent: value })));
    add("Laatste run", ago(t.lastRunAt));
    add("Marktplaats", t.lastMs != null ? nf.format(t.lastMs) + " ms" : "–");
    add("gem.", t.avgMs != null ? nf.format(t.avgMs) + " ms" : "–");
    add("Advertenties", t.avgListings != null ? nf.format(t.avgListings) : "–");
    add("Runs 24u", nf.format(t.runs));
    add("Fouten", nf.format(t.errors));
    add("Vondsten", nf.format(t.matched));
    const card = el("div", { className: "card term" },
      el("h3", { textContent: t.name + " · " + t.term }), el("span", { className: "pill " + kind, textContent: text }), stats);
    if (t.lastStatus === "error" && t.lastError) card.append(el("div", { className: "err small", style: "grid-column:1/-1;color:var(--critical)", textContent: t.lastError }));
    terms.append(card);
  }

  const errors = $("#errors"); errors.replaceChildren();
  if (!st.recentErrors.length) errors.append(el("p", { className: "muted", textContent: "Geen fouten in de laatste 24 uur. 👍" }));
  for (const e of st.recentErrors) errors.append(el("div", { className: "err-row" },
    el("b", { textContent: e.name + " · " + e.term }), " — " + ago(e.at) + (e.count > 1 ? " (" + e.count + "× dat uur)" : ""),
    el("div", { className: "muted", textContent: e.error || "" })));

  const LIMIT = 100000;
  const q = (id, v) => { $("#q-" + id).textContent = nf.format(v) + " / " + nf.format(LIMIT); $("#q-" + id + "-bar").style.width = Math.min(100, v / LIMIT * 100) + "%"; };
  q("req", st.today.requests); q("wr", st.today.d1Writes);
  $("#updated").textContent = "Bijgewerkt " + new Date().toLocaleTimeString("nl-NL") + " · ververst elke 30 s";
}

$("#table-btn").onclick = () => { const t = $("#hour-table"); t.hidden = !t.hidden; $("#table-btn").textContent = t.hidden ? "Toon tabel" : "Verberg tabel"; };
load().catch(() => {});
setInterval(() => load().catch(() => {}), 30000);
`;
