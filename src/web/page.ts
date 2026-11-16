import { FAVICON_LINK } from "./favicon";
export function renderPage(): string {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${FAVICON_LINK}
<title>Marktplaats Radar</title>
<style>${CSS}</style></head>
<body>
<header>
  <h1>🎯 Marktplaats Radar</h1>
  <div class="actions">
    <a class="ghost btnlink" href="/status">📊 Status</a>
    <button id="test-tg" class="ghost">Test Telegram</button>
    <form method="post" action="/logout"><button class="ghost">Uitloggen</button></form>
  </div>
</header>
<main>
  <section id="form-section" hidden>
    <h2 id="form-title">Nieuwe sniper</h2>
    <form id="sniper-form" class="card">
      <label>Naam<input name="name" required placeholder="PS5 tot €300"></label>
      <label>Zoektermen <span class="muted">(max. 3, komma-gescheiden)</span>
        <input name="queries" required placeholder="rookkanaal, kachelpijp"></label>
      <div class="row">
        <label>Min. prijs (€)<input name="minPrice" type="number" min="0" step="1" inputmode="numeric"></label>
        <label>Max. prijs (€)<input name="maxPrice" type="number" min="0" step="1" inputmode="numeric"></label>
      </div>
      <label>Niet melden als het bevat <span class="muted">(komma-gescheiden)</span>
        <input name="excludeWords" placeholder="defect, onderdelen, kapot"></label>
      <div class="row">
        <label>Postcode<input name="postcode" placeholder="3511AA" maxlength="7"></label>
        <label>Afstand (km)<input name="distanceKm" type="number" min="1" step="1" inputmode="numeric"></label>
      </div>
      <label>Categorie
        <div class="row tight">
          <select name="category"><option value="">Alle categorieën</option></select>
          <button type="button" id="cat-btn" class="ghost">Categorieën ophalen</button>
        </div>
      </label>
      <label class="check"><input type="checkbox" name="titleOnly" checked> Zoekterm moet in de titel staan</label>
      <label class="check"><input type="checkbox" name="includeBids" checked> Ook advertenties zonder vaste prijs (Bieden)</label>
      <label class="check"><input type="checkbox" name="active" checked> Actief</label>
      <p id="form-error" class="error" hidden></p>
      <div class="row tight">
        <button type="submit">Opslaan</button>
        <button type="button" id="cancel-btn" class="ghost">Annuleren</button>
      </div>
    </form>
  </section>

  <section id="starred-section" hidden>
    <h2>⭐ Bewaard</h2>
    <div id="starred" class="card finds"></div>
  </section>

  <section>
    <div class="section-head">
      <div><h2>Snipers</h2><p id="summary" class="muted small"></p></div>
      <button id="new-btn">+ Nieuwe sniper</button>
    </div>
    <div id="snipers" class="list"><p class="muted">Laden…</p></div>
  </section>

  <section>
    <h2>Instellingen</h2>
    <div class="list">
      <form id="quiet-form" class="card">
        <h3 class="card-title">🌙 Stille uren</h3>
        <p class="muted small">Geen berichten in deze periode. Aan het eind krijg je één ochtendoverzicht van wat er gevonden is.</p>
        <label class="check"><input type="checkbox" name="quietEnabled"> Stille uren aan</label>
        <div class="row">
          <label>Van<input type="time" name="quietStart" required></label>
          <label>Tot<input type="time" name="quietEnd" required></label>
        </div>
        <button type="submit">Opslaan</button>
      </form>
      <div class="card">
        <h3 class="card-title">📱 Knoppen in Telegram</h3>
        <p class="muted small">Onder elk bericht: 🔕 pauze 1 uur, 👎 verkoper blokkeren en ⭐ bewaren.</p>
        <p id="webhook-status" class="small"></p>
        <button id="webhook-btn" class="ghost">Telegram-knoppen activeren</button>
      </div>
      <div class="card">
        <h3 class="card-title">👎 Geblokkeerde verkopers</h3>
        <div id="blocked" class="small"></div>
      </div>
    </div>
  </section>
</main>
<div id="toast" hidden></div>
<script>${JS}</script>
</body></html>`;
}

export const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--text:#1d1d1b;--muted:#6b6a66;--accent:#e8590c;--accent-soft:#fff0e6;--border:#e3e1dc;--good:#2b8a3e;--danger:#c92a2a}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1f1f1d;--text:#f1f0ec;--muted:#a3a29d;--accent-soft:#3a2416;--border:#33322f;--good:#51cf66;--danger:#ff6b6b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px;max-width:820px;margin:0 auto}
header h1{font-size:20px;margin:0}
.actions{display:flex;gap:8px}.actions form{margin:0}
main{max-width:820px;margin:0 auto;padding:0 16px 48px}
section{margin-top:20px}
h2{font-size:17px;margin:0 0 10px}
.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.section-head h2{margin:0}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.list{display:grid;gap:10px}
button{padding:9px 14px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--border);font-weight:500}
button.small{padding:5px 10px;font-size:13px}
button:disabled{opacity:.5;cursor:default}
form label{display:block;margin-bottom:12px;font-weight:500;min-width:0}
input:not([type=checkbox]),select{display:block;width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;min-width:0}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.row.tight{grid-template-columns:1fr auto;align-items:end}
.row.tight select{margin-top:0}
label.check{display:flex;gap:8px;align-items:center;font-weight:400}
.muted{color:var(--muted);font-weight:400}
.error{color:var(--danger);margin:0 0 12px}
.sniper{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.sniper .info{min-width:0}
.sniper h3{margin:0;font-size:16px}
.sniper .meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.sniper .err{color:var(--danger);font-size:13px}
.sniper .btns{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.switch{position:relative;width:44px;height:26px;flex-shrink:0;margin-top:2px}
.switch input{opacity:0;width:0;height:0}
.switch span{position:absolute;inset:0;border-radius:13px;background:var(--border);cursor:pointer;transition:.15s}
.switch span::after{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.15s}
.switch input:checked+span{background:var(--good)}
.switch input:checked+span::after{transform:translateX(18px)}
.find{display:flex;gap:12px;text-decoration:none;color:inherit;align-items:center}
.find img,.find .noimg{width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--border)}
.find .info{min-width:0}
.find h3{margin:0;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.find .price{font-weight:700}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--accent-soft);color:var(--accent);margin-left:6px}
.badge.good{background:transparent;color:var(--good);border:1px solid var(--good)}
.small{font-size:13px;margin:2px 0 0}
.sniper-card{padding:0;overflow:hidden}
.sniper-card.off{opacity:.6}
.sniper-head{display:flex;gap:12px;align-items:flex-start;padding:14px 16px}
.sniper-head .info{flex:1;min-width:0}
.sniper-head h3{margin:0;font-size:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.count{font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted);overflow-wrap:anywhere}
.chip.no{border-style:dashed}
.status{font-size:13px;color:var(--muted);margin-top:6px}
.status .err{color:var(--danger)}
.sniper-head .btns{display:flex;gap:6px;flex-shrink:0}
.finds{border-top:1px solid var(--border);padding:6px 16px 10px}
.finds .empty{color:var(--muted);font-size:13px;padding:8px 0}
.finds .find{padding:8px 0;border-bottom:1px solid var(--border)}
.finds .find:last-of-type{border-bottom:0}
.finds .find img,.finds .find .noimg{width:56px;height:56px}
.more{background:none;border:0;color:var(--accent);padding:6px 0 0;font-weight:600;font-size:13px}
.btnlink{display:inline-block;padding:9px 14px;border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-weight:500}
.card-title{margin:0 0 4px;font-size:15px}
.find{display:flex;gap:12px;align-items:center}
.find .link{display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;flex:1;min-width:0}
.star{background:none;border:0;padding:4px 6px;font-size:18px;line-height:1;color:var(--muted);flex-shrink:0}
.star.on{color:#f59f00}
.paused{color:var(--accent);font-weight:600}
.blocked-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
.blocked-row:last-child{border-bottom:0}
#starred{padding:6px 16px}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;max-width:calc(100% - 32px)}
@media (max-width:520px){.sniper-head{flex-wrap:wrap}.sniper-head .btns{width:100%;padding-left:56px;flex-wrap:wrap}.row{grid-template-columns:1fr}}
`;

const JS = `
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); for (const k of kids) if (k != null) e.append(k); return e; };
const euro = (c) => { const e = Math.floor(c / 100), r = c % 100; const w = e.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, "."); return r ? "€" + w + "," + String(r).padStart(2, "0") : "€" + w; };
let snipers = [], editingId = null, categories = [];

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); }

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json" } });
  if (res.status === 401) { location.href = "/login"; throw new Error("Niet ingelogd"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Er ging iets mis");
  return data;
}

function ago(iso) {
  if (!iso) return "nog niet gecontroleerd";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "zojuist gecontroleerd";
  if (s < 3600) return Math.round(s / 60) + " min geleden gecontroleerd";
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

function chips(s) {
  const c = [];
  const price = s.minPriceCents != null && s.maxPriceCents != null ? euro(s.minPriceCents) + "–" + euro(s.maxPriceCents)
    : s.maxPriceCents != null ? "tot " + euro(s.maxPriceCents) : s.minPriceCents != null ? "vanaf " + euro(s.minPriceCents) : null;
  for (const q of s.queries) c.push(el("span", { className: "chip", textContent: "🔍 " + q }));
  if (s.titleOnly) c.push(el("span", { className: "chip", textContent: "in titel" }));
  if (price) c.push(el("span", { className: "chip", textContent: "💶 " + price }));
  if (s.postcode) c.push(el("span", { className: "chip", textContent: "📍 " + s.postcode + (s.distanceKm ? " + " + s.distanceKm + " km" : "") }));
  if (s.categoryId) c.push(el("span", { className: "chip", textContent: "🗂 categorie " + s.categoryId }));
  if (!s.includeBids) c.push(el("span", { className: "chip", textContent: "alleen vaste prijs" }));
  for (const w of s.excludeWords) c.push(el("span", { className: "chip no", textContent: "✕ " + w }));
  return el("div", { className: "chips" }, ...c);
}

function findRow(f, showSniper) {
  const img = f.imageUrl ? el("img", { src: f.imageUrl, alt: "", loading: "lazy" }) : el("div", { className: "noimg" });
  const line = el("div", {}, el("span", { className: "price", textContent: f.hasPrice ? euro(f.priceCents) : "Bieden" }));
  if (f.previousPriceCents != null) line.append(el("span", { className: "badge", textContent: "was " + euro(f.previousPriceCents) }));
  if (f.dealPercent != null) line.append(el("span", { className: "badge good", textContent: "−" + f.dealPercent + "%" }));
  const when = new Date(f.foundAt).toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const meta = [f.city, showSniper ? f.sniperName : null, when, f.pushed === 0 ? "🌙 in ochtendoverzicht" : null].filter(Boolean).join(" · ");
  const star = el("button", { className: "star" + (f.starred ? " on" : ""), textContent: f.starred ? "★" : "☆",
    title: f.starred ? "Niet meer bewaren" : "Bewaren", onclick: async () => {
      try { await api("/api/finds/" + f.id + "/star", { method: "POST", body: JSON.stringify({ starred: !f.starred }) }); load(); } catch (e) { toast(e.message); } } });
  return el("div", { className: "find" },
    el("a", { className: "link", href: f.url, target: "_blank", rel: "noopener" }, img,
      el("div", { className: "info" }, el("h3", { textContent: f.title }), line, el("div", { className: "muted small", textContent: meta }))),
    star);
}

function hhmm(iso) { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); }

async function loadSettings() {
  const [settings, blocked] = await Promise.all([api("/api/settings"), api("/api/blocked")]);
  const qf = $("#quiet-form");
  qf.quietEnabled.checked = settings.quietEnabled; qf.quietStart.value = settings.quietStart; qf.quietEnd.value = settings.quietEnd;
  $("#webhook-status").textContent = settings.webhookActive ? "✅ Actief" : "Nog niet geactiveerd.";
  $("#webhook-btn").textContent = settings.webhookActive ? "Opnieuw activeren" : "Telegram-knoppen activeren";
  const box = $("#blocked"); box.replaceChildren();
  if (!blocked.length) box.append(el("p", { className: "muted", textContent: "Niemand geblokkeerd. Gebruik 👎 onder een Telegram-bericht." }));
  for (const b of blocked) {
    box.append(el("div", { className: "blocked-row" }, el("span", { textContent: b.sellerName || "Verkoper " + b.sellerId }),
      el("button", { className: "ghost small", textContent: "Deblokkeren", onclick: async () => {
        try { await api("/api/blocked/" + b.sellerId, { method: "DELETE" }); loadSettings(); } catch (e) { toast(e.message); } } })));
  }
}

const expanded = new Set();

async function load() {
  const [list, finds, starred] = await Promise.all([api("/api/snipers"), api("/api/finds"), api("/api/starred")]);
  snipers = list;
  $("#starred-section").hidden = !starred.length;
  $("#starred").replaceChildren(...starred.map((f) => findRow(f, true)));
  const bySniper = new Map();
  for (const f of finds) { if (!bySniper.has(f.sniperId)) bySniper.set(f.sniperId, []); bySniper.get(f.sniperId).push(f); }
  const active = snipers.filter((s) => s.active).length;
  $("#summary").textContent = snipers.length ? active + " van " + snipers.length + " actief · elke minuut gecontroleerd" : "";
  const box = $("#snipers"); box.replaceChildren();
  if (!snipers.length) { box.append(el("p", { className: "muted", textContent: "Nog geen snipers. Maak er een aan." })); return; }
  for (const s of snipers) {
    const own = bySniper.get(s.id) || [];
    const toggle = el("input", { type: "checkbox", checked: s.active });
    toggle.onchange = async () => { try { await api("/api/snipers/" + s.id + "/active", { method: "POST", body: JSON.stringify({ active: toggle.checked }) }); load(); } catch (e) { toast(e.message); toggle.checked = !toggle.checked; } };
    const edit = el("button", { className: "ghost small", textContent: "Bewerken", onclick: () => openForm(s) });
    const del = el("button", { className: "ghost small", textContent: "Verwijderen", onclick: async () => {
      if (!confirm("Sniper “" + s.name + "” verwijderen?")) return;
      try { await api("/api/snipers/" + s.id, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } } });
    const pausedNow = s.pausedUntil && new Date(s.pausedUntil).getTime() > Date.now();
    const pause = el("button", { className: "ghost small", textContent: pausedNow ? "Hervatten" : "Pauze 1 uur", onclick: async () => {
      try { await api("/api/snipers/" + s.id + "/pause", { method: "POST", body: JSON.stringify({ minutes: pausedNow ? null : 60 }) }); load(); } catch (e) { toast(e.message); } } });
    const status = el("div", { className: "status",
      textContent: !s.active ? "Uitgeschakeld" : s.baselinePending.length ? "Nulmeting bij volgende controle" : ago(s.lastCheckedAt) });
    if (pausedNow && s.active) status.prepend(el("span", { className: "paused", textContent: "🔕 Gepauzeerd tot " + hhmm(s.pausedUntil) + " · " }));
    if (s.lastError) status.append(" · ", el("span", { className: "err", textContent: "Fout: " + s.lastError }));
    const title = el("h3", {}, s.name);
    if (own.length) title.append(el("span", { className: "count", textContent: own.length + (own.length === 10 ? "+" : "") + " vondsten" }));

    const findsBox = el("div", { className: "finds" });
    if (!own.length) findsBox.append(el("div", { className: "empty", textContent: s.active ? "Nog geen vondsten — nieuwe advertenties verschijnen hier." : "Nog geen vondsten." }));
    const showAll = expanded.has(s.id);
    for (const f of own.slice(0, showAll ? own.length : 3)) findsBox.append(findRow(f, false));
    if (own.length > 3) findsBox.append(el("button", { className: "more", textContent: showAll ? "Toon minder" : "Toon alle " + own.length,
      onclick: () => { showAll ? expanded.delete(s.id) : expanded.add(s.id); load(); } }));

    box.append(el("div", { className: "card sniper-card" + (s.active ? "" : " off") },
      el("div", { className: "sniper-head" },
        el("label", { className: "switch", title: "Aan/uit" }, toggle, el("span")),
        el("div", { className: "info" }, title, chips(s), status),
        el("div", { className: "btns" }, pause, edit, del)),
      findsBox));
  }
}

function fillCategories(selectedL1, selected) {
  const sel = $("select[name=category]"); sel.replaceChildren(el("option", { value: "", textContent: "Alle categorieën" }));
  const mains = categories.filter((c) => c.parentId == null);
  for (const m of mains) {
    sel.append(el("option", { value: m.id + ":" + m.id, textContent: m.label }));
    for (const c of categories.filter((c) => c.parentId === m.id)) {
      sel.append(el("option", { value: m.id + ":" + c.id, textContent: "   " + c.label }));
    }
  }
  if (selected != null) {
    const v = (selectedL1 ?? selected) + ":" + selected;
    if (![...sel.options].some((o) => o.value === v)) sel.append(el("option", { value: v, textContent: "Categorie " + selected }));
    sel.value = v;
  }
}

function openForm(s) {
  editingId = s ? s.id : null;
  $("#form-title").textContent = s ? "Sniper bewerken" : "Nieuwe sniper";
  const f = $("#sniper-form"); f.reset(); $("#form-error").hidden = true;
  categories = [];
  if (s) {
    f.name.value = s.name; f.queries.value = s.queries.join(", ");
    f.minPrice.value = s.minPriceCents != null ? s.minPriceCents / 100 : "";
    f.maxPrice.value = s.maxPriceCents != null ? s.maxPriceCents / 100 : "";
    f.excludeWords.value = s.excludeWords.join(", ");
    f.postcode.value = s.postcode || ""; f.distanceKm.value = s.distanceKm || "";
    f.titleOnly.checked = s.titleOnly; f.includeBids.checked = s.includeBids; f.active.checked = s.active;
  }
  fillCategories(s?.l1CategoryId, s?.categoryId);
  $("#form-section").hidden = false;
  $("#form-section").scrollIntoView({ behavior: "smooth" });
  f.name.focus();
}

$("#new-btn").onclick = () => openForm(null);
$("#cancel-btn").onclick = () => ($("#form-section").hidden = true);

$("#cat-btn").onclick = async () => {
  const q = $("#sniper-form").queries.value.split(",")[0].trim();
  if (!q) { toast("Vul eerst een zoekterm in"); return; }
  const btn = $("#cat-btn"); btn.disabled = true; btn.textContent = "Bezig…";
  try {
    const keep = $("select[name=category]").value;
    categories = await api("/api/categories?q=" + encodeURIComponent(q));
    fillCategories();
    if ([...$("select[name=category]").options].some((o) => o.value === keep)) $("select[name=category]").value = keep;
    toast(categories.length + " categorieën gevonden");
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = "Categorieën ophalen";
};

$("#sniper-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const [l1, cat] = (f.category.value || ":").split(":");
  const body = {
    name: f.name.value, queries: f.queries.value, minPrice: f.minPrice.value, maxPrice: f.maxPrice.value,
    excludeWords: f.excludeWords.value, postcode: f.postcode.value, distanceKm: f.distanceKm.value,
    l1CategoryId: l1 || null, categoryId: cat || null,
    titleOnly: f.titleOnly.checked, includeBids: f.includeBids.checked, active: f.active.checked,
  };
  try {
    await api(editingId ? "/api/snipers/" + editingId : "/api/snipers", { method: editingId ? "PUT" : "POST", body: JSON.stringify(body) });
    $("#form-section").hidden = true;
    toast(editingId ? "Sniper bijgewerkt" : "Sniper aangemaakt");
    load();
  } catch (e) { const er = $("#form-error"); er.textContent = e.message; er.hidden = false; }
};

$("#test-tg").onclick = async () => {
  try { await api("/api/test-telegram", { method: "POST" }); toast("Testbericht verstuurd"); } catch (e) { toast("Telegram: " + e.message); }
};

$("#quiet-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ quietEnabled: f.quietEnabled.checked, quietStart: f.quietStart.value, quietEnd: f.quietEnd.value }) });
    toast("Stille uren opgeslagen");
  } catch (e) { toast(e.message); }
};

$("#webhook-btn").onclick = async () => {
  try { await api("/api/telegram/activate", { method: "POST" }); toast("Telegram-knoppen staan aan"); loadSettings(); } catch (e) { toast("Telegram: " + e.message); }
};

load().catch((e) => toast(e.message));
loadSettings().catch((e) => toast(e.message));
setInterval(() => { if ($("#form-section").hidden) load().catch(() => {}); }, 60000);
`;
