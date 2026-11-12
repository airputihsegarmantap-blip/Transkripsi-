// SiLengkap — aplikasi Android. Prinsip: Fast · Accurate · Cool.
// Data: Rheus Cloud (JSON siap pakai via CDN, diperbarui ±30 menit). Transkripsi: TranscriptBot 3 di HP.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowSec = () => Date.now() / 1000;

// ====================================================================== platform
const Bridge = (window.Bridge = {
  _id: 0, _pending: {}, _handlers: {},
  call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = ++this._id;
      this._pending[id] = { resolve, reject };
      try { window.Native[method](id, ...args); } catch (e) { delete this._pending[id]; reject(e); }
    });
  },
  resolve(id, data) { const p = this._pending[id]; delete this._pending[id]; p && p.resolve(data); },
  reject(id, msg) { const p = this._pending[id]; delete this._pending[id]; p && p.reject(new Error(msg)); },
  on(ev, fn) { this._handlers[ev] = fn; },
  emit(ev, data) { const fn = this._handlers[ev]; fn && fn(JSON.parse(data)); },
});
const isApp = typeof window.Native !== "undefined";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
// ---------------------------------------------------------------------- pengaturan
const Settings = (window.SLSettings = {
  theme: store.get("set-theme", "auto"), // auto | dark | light
  sfx: store.get("set-sfx", "1") === "1",
  music: store.get("set-music", "1") === "1",
  haptic: store.get("set-haptic", "1") === "1",
  set(k, v) { this[k] = v; store.set("set-" + k, typeof v === "boolean" ? (v ? "1" : "0") : v); if (k === "theme") applyTheme(); },
});
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme() {
  const light = Settings.theme === "light" || (Settings.theme === "auto" && darkMQ && !darkMQ.matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? "#f6f5fb" : "#12131d";
  if (isApp && typeof window.Native.setTheme === "function") try { Native.setTheme(light); } catch {}
  const b = document.getElementById("themeBtn");
  if (b) b.innerHTML = `<i class="ph ${light ? "ph-moon" : "ph-sun"}" style="font-size:18px"></i>`;
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", () => Settings.theme === "auto" && applyTheme());
applyTheme();

let lastHaptic = 0;
function haptic() { const t = Date.now(); if (isApp && Settings.haptic && t - lastHaptic > 60) { lastHaptic = t; try { Native.haptic(); } catch {} } }
const Platform = {
  open(url) { if (!url) return; if (isApp) Native.openUrl(url); else window.open(url, "_blank", "noopener"); },
  /** Buka artikel di dalam aplikasi (Mode Baca otomatis). */
  read(url, title) {
    if (!url) return;
    if (isApp && typeof Native.openArticle === "function") Native.openArticle(url, title || "");
    else window.open(url, "_blank", "noopener");
  },
  copy(text) { if (isApp) Native.copy(text); else navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast("Tersalin")); },
  share(title, text) { if (isApp) Native.share(title, text); else Platform.copy(text); },
};
function withTimeout(p, ms, msg) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
}

// ====================================================================== Rheus Cloud
const CLOUD = (window.SILENGKAP_CONFIG && window.SILENGKAP_CONFIG.cloud) || [];
const Cloud = {
  mem: new Map(),
  /** Ambil file JSON: tampilkan salinan tersimpan seketika, lalu segarkan dari CDN tercepat. */
  async get(name, { fresh = false } = {}) {
    const ver = this.manifest ? Math.floor(this.manifest.updatedAt) : Math.floor(nowSec() / 600);
    const fetchOne = (base) => fetch(`${base}${name}.json?v=${ver}`, { cache: fresh ? "reload" : "default" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    // Mulai dari CDN pertama; bila belum menjawab dalam 1,5 detik, coba CDN kedua juga.
    const attempts = CLOUD.map((base, i) => new Promise((res, rej) => setTimeout(() => fetchOne(base).then(res, rej), i * 1500)));
    const data = await withTimeout(Promise.any(attempts), 15000, "Rheus Cloud lambat merespons. Periksa koneksi internet.")
      .catch((e) => { throw new Error(e instanceof AggregateError ? "Tidak bisa terhubung ke Rheus Cloud. Periksa koneksi internet." : e.message); });
    this.mem.set(name, data);
    try { localStorage.setItem("rc:" + name, JSON.stringify(data)); } catch {}
    return data;
  },
  cached(name) {
    if (this.mem.has(name)) return this.mem.get(name);
    try { const raw = localStorage.getItem("rc:" + name); if (raw) { const d = JSON.parse(raw); this.mem.set(name, d); return d; } } catch {}
    return null;
  },
};

// ====================================================================== menu & state
const MENU = [
  { id: "transcribe", label: "Transkripsi Video", desc: "YouTube → transkrip rapi & ringkasan", icon: "ph-waveform", hue: 255 },
  { id: "finansial", label: "Berita Finansial", desc: "Saham, rupiah, kripto, ekonomi", icon: "ph-chart-bar", hue: 160 },
  { id: "teknologi", label: "Berita Teknologi", desc: "AI, gadget, aplikasi, siber", icon: "ph-cpu", hue: 190 },
  { id: "btc", label: "Prediksi Arah Bitcoin", desc: "Harga live, arah, probabilitas", icon: "ph-currency-btc", hue: 35 },
  { id: "utama", label: "Berita Utama", desc: "Nasional & internasional", icon: "ph-newspaper", hue: 210 },
  { id: "viral", label: "Berita Viral", desc: "Per media sosial & kategori", icon: "ph-fire", hue: 345 },
  { id: "radio", label: "Radio", desc: "Stasiun radio gratis", icon: "ph-radio", hue: 290 },
  { id: "musik", label: "Musik Online", desc: "YouTube Music di dalam aplikasi", icon: "ph-music-notes", hue: 320 },
  { id: "games", label: "Gim", desc: "Dino, Ular Tangga, Sudoku, Minesweeper", icon: "ph-game-controller", hue: 100, offline: true },
];
const GAMES = [
  { id: "dino", label: "Gim Dino", desc: "Lompat, hindari kaktus", icon: "ph-person-simple-run" },
  { id: "snakes", label: "Ular Tangga", desc: "Lawan komputer atau 2–4 pemain", icon: "ph-dice-five" },
  { id: "sudoku", label: "Sudoku", desc: "Mudah, sedang, sulit", icon: "ph-grid-nine" },
  { id: "minesweeper", label: "Minesweeper", desc: "Temukan semua ranjau", icon: "ph-bomb" },
];
const state = {
  page: "home", game: null, gameInst: null, newsPage: 1,
  data: {},
  t: { url: "", status: "idle", stage: 0, data: null, error: null, ytError: false, view: "rapi", started: 0, ms: 0 },
  btcTf: "24j", live: null,
  utama: { tab: "nasional", cat: "all" },
  fin: { tag: "all" },
  tek: { tag: "all" },
  viral: { region: store.get("viral-region", "id"), platform: "all", cat: "all" },
  radio: { region: store.get("radio-region", "id"), q: "", playing: null, status: "idle" },
  ask: { q: "", status: "idle", msgs: [] },
  best: +store.get("silengkap-dino-best", 0) || 0,
};

function go(page, sub) { haptic(); location.hash = page === "home" ? "" : "#/" + page + (sub ? "/" + sub : ""); }
function parseHash() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/) || [];
  return { page: MENU.some((x) => x.id === m[1]) ? m[1] : "home", sub: m[2] || null };
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2000);
}
function setMenu(open) { $("drawer").classList.toggle("open", open); $("scrim").classList.toggle("open", open); if (open) haptic(); }

/** Muat file Rheus Cloud untuk sebuah tampilan: salinan tersimpan dulu, lalu versi terbaru. */
function load(name, force = false) {
  const d = state.data[name] || (state.data[name] = { status: "idle", data: Cloud.cached(name) });
  if (!force && (d.status === "loading" || d.status === "done")) return d;
  d.status = "loading";
  Cloud.get(name, { fresh: force }).then(
    (data) => { Object.assign(d, { status: "done", data, error: null }); if (force) toast("Data terbaru dimuat ✓"); softRender(); },
    (e) => { Object.assign(d, { status: d.data ? "done" : "error", error: e.message }); if (d.data && force) toast("Offline — menampilkan data tersimpan"); softRender(); },
  );
  return d;
}

// ====================================================================== render
function renderChrome() {
  const cur = MENU.find((m) => m.id === state.page);
  const tag = $("curTag");
  tag.classList.toggle("hidden", !cur);
  if (cur) tag.innerHTML = `<i class="ph ${cur.icon}"></i>${esc(cur.label)}`;
  $("drawerItems").innerHTML = MENU.map((m, i) => `
    <button class="drawer-item ${m.id === state.page ? "active" : ""}" data-go="${m.id}" style="--i:${i}">
      <span class="tile" style="--h:${m.hue}"><i class="ph ${m.icon}"></i></span>
      <span style="display:flex;flex-direction:column"><span style="font-size:14px;font-weight:500">${esc(m.label)}</span><span class="text-muted" style="font-size:12px">${esc(m.desc)}</span></span>
      ${m.offline ? `<span class="tag tag-neutral" style="margin-left:auto;font-size:10px">offline</span>` : ""}
    </button>`).join("");
}
let lastPage = null;
function render() {
  renderChrome();
  const v = $("view");
  if (state.page !== "games" || !state.game) { if (state.gameInst) { state.gameInst.destroy(); state.gameInst = null; } }
  const html = {
    transcribe: viewTranscribe, finansial: viewFinansial, teknologi: viewTeknologi, musik: viewMusik, btc: viewBtc, utama: viewUtama,
    viral: viewViral, radio: viewRadio,
  }[state.page];
  if (state.page === "games") { if (!state.gameInst) { v.innerHTML = viewGames(); mountGame(); } }
  else v.innerHTML = html ? html() : viewHome();
  const changed = lastPage !== state.page + (state.game || "");
  v.classList.toggle("enter", changed);
  if (changed) { void v.offsetWidth; lastPage = state.page + (state.game || ""); }
  renderPlayer();
}
/** Render ulang tanpa animasi masuk (untuk pembaruan data). */
function softRender() { lastPage = state.page + (state.game || ""); const v = $("view"); v.classList.remove("enter"); render(); }

const loadingLine = (msg) => `<p class="text-muted loading-line"><i class="ph ph-circle-notch spin"></i> ${esc(msg)}</p>`;
function errorCard(msg, action) {
  return `<div class="card elev-sm reveal" style="gap:10px;max-width:760px">
    <div style="display:flex;gap:10px;align-items:flex-start"><i class="ph ph-wifi-slash" style="color:var(--color-accent-300);font-size:22px"></i><span style="font-size:14px;text-wrap:pretty">${esc(msg)}</span></div>
    <div><button class="btn btn-secondary" data-action="${action}"><i class="ph ph-arrows-clockwise"></i>Coba lagi</button></div></div>`;
}
const skeletonNews = () => `<div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">${[0, 1, 2].map(() =>
  `<div class="card elev-md" style="min-height:170px;gap:12px"><div class="skeleton" style="height:20px;width:30%"></div><div class="skeleton" style="height:18px"></div><div class="skeleton" style="height:18px;width:80%"></div><div class="skeleton" style="height:12px;width:40%;margin-top:auto"></div></div>`).join("")}</div>`;
function agoText(ts) {
  const m = Math.round((nowSec() - ts) / 60);
  return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
}
function liveChip(d) {
  if (!d || !d.data) return "";
  const age = nowSec() - d.data.updatedAt;
  const fresh = age < 3 * 3600;
  return `<span class="live ${fresh ? "" : "stale"}"><span class="dot"></span>${fresh ? "LIVE" : "TERSIMPAN"} · ${esc(agoText(d.data.updatedAt))}${d.status === "loading" ? ' <i class="ph ph-circle-notch spin"></i>' : ""}</span>`;
}
function chips(name, items, active) {
  return `<div class="chips" role="radiogroup">${items.map((it) => `<button class="chip ${it.id === active ? "on" : ""}" data-chip="${name}" data-val="${esc(it.id)}">${it.icon ? `<i class="ph ${it.icon}"></i>` : ""}${esc(it.label)}${it.count !== undefined ? `<span class="chip-n">${it.count}</span>` : ""}</button>`).join("")}</div>`;
}

// ---------------------------------------------------------------------- beranda + Tanya Rheus
function viewHome() {
  const a = state.ask;
  const man = Cloud.cached("manifest");
  return `
  <section class="home">
    <div class="hero">
      <span class="logo-lg">SL</span>
      <div><h1>SiLengkap</h1>
      <p class="text-muted">Transkripsi video, berita terverifikasi, analisa Bitcoin, radio, dan gim — ditenagai <b class="grad-text">Rheus</b>.</p></div>
    </div>
    ${man ? `<button class="card elev-sm status-strip reveal" data-action="openStatus" style="--i:1">
      <span class="live"><span class="dot"></span>Rheus Cloud</span>
      <span class="card-meta">Diperbarui ${esc(agoText(man.updatedAt))} · ${Object.values(man.stories || {}).reduce((a, b) => a + (b || 0), 0)} cerita · ${man.hoaxClaims || 0} klaim hoaks dipantau</span>
      <i class="ph ph-caret-right" style="margin-left:auto;color:var(--color-neutral-500)"></i></button>` : ""}
    <div class="card elev-md ask-card reveal" style="--i:2">
      <div style="display:flex;align-items:center;gap:8px"><i class="ph-fill ph-sparkle" style="color:var(--color-accent);font-size:18px"></i><span class="card-kicker">Tanya Rheus</span>
        <span class="card-meta" style="margin-left:auto">${llmUrl() ? "AI · Llama 3.2 3B + internet" : `dari ${(Cloud.cached("knowledge") || { docs: [] }).docs.length || "—"} info 48 jam`}</span>
        ${a.msgs.length ? `<button class="btn btn-ghost btn-icon" data-action="newChat" aria-label="Percakapan baru"><i class="ph ph-plus-circle"></i></button>` : ""}</div>
      ${a.msgs.length ? `<div class="chat" id="chatBox">${a.msgs.map((m, i) => m.role === "user"
        ? `<div class="bubble me">${esc(m.content)}</div>`
        : `<div class="bubble ai"><div class="ai-text" ${i === a.msgs.length - 1 ? 'id="chatLive"' : ""}>${m.content ? miniMd(m.content) : '<span class="dots"><i></i><i></i><i></i></span>'}${m.streaming && m.content ? '<span class="caret"></span>' : ""}</div>
            ${(m.sources || []).length ? `<div class="srcs">${m.sources.slice(0, 5).map((x) => `<a href="#" data-read="${esc(x.l)}" data-title="${esc(x.t)}" class="src-chip"><b>${x.n}</b>${esc(x.s)}</a>`).join("")}</div>` : ""}</div>`).join("")}</div>`
      : `<div class="chips">${["Berita terpenting hari ini?", "Harga bitcoin sekarang?", "Apa yang lagi viral?", "Kabar terbaru soal AI?"].map((q) => `<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>`}
      <form id="askForm" style="display:flex;gap:8px">
        <input id="askQ" class="input" style="flex:1;min-width:0" placeholder="Tanya apa saja…" value="${esc(a.q)}" autocomplete="off" ${a.status === "loading" ? "disabled" : ""}>
        <button class="btn btn-primary btn-icon" type="submit" aria-label="Tanya" ${a.status === "loading" ? "disabled" : ""}><i class="ph ph-paper-plane-tilt"></i></button>
      </form>
    </div>
    <div class="menu-grid">
      ${MENU.map((m, i) => `<button class="menu-tile reveal" data-go="${m.id}" style="--i:${i + 3};--h:${m.hue}">
        <span class="tile"><i class="ph ${m.icon}"></i></span><span class="mt-label">${esc(m.label)}</span><span class="mt-desc">${esc(m.desc)}</span></button>`).join("")}
    </div>
  </section>`;
}

// Tanya Rheus di HP: pencarian BM25 atas knowledge.json (berita 48 jam terakhir).
const SYN = { makanan: ["kuliner", "resep", "food"], kuliner: ["makanan", "food"], artis: ["selebriti", "seleb", "celebrity"], perang: ["militer", "serangan"],
  militer: ["tentara", "pasukan"], ekonomi: ["inflasi", "tarif"], kripto: ["bitcoin", "crypto"], bitcoin: ["btc", "kripto"], saham: ["ihsg", "emiten"], bola: ["timnas", "sepak"] };
const ASK_STOP = new Set("apa yang dan di ke dari untuk dengan ini itu ada berita terbaru hari kabar soal tentang info bagaimana kenapa siapa kapan berapa adalah the of what viral".split(" "));
const tok = (t) => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !ASK_STOP.has(w));
let bm25 = null;
function buildBM25(docs) {
  const N = docs.length, tf = [], df = new Map(), len = [];
  for (const d of docs) {
    const t = tok(d.t + " " + d.x + " " + d.c), m = new Map();
    for (const w of t) m.set(w, (m.get(w) || 0) + 1);
    for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
    tf.push(m); len.push(t.length);
  }
  const avg = len.reduce((a, b) => a + b, 0) / Math.max(1, N);
  return { docs, tf, len, avg, idf: (w) => Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5)) };
}
async function ask(q) {
  const a = state.ask;
  q = (q || "").trim();
  if (!q || a.status === "loading") return;
  haptic();
  a.q = "";
  a.msgs.push({ role: "user", content: q });
  const msg = { role: "assistant", content: "", sources: [], streaming: true };
  a.msgs.push(msg);
  a.status = "loading";
  softRender(); scrollChat();
  if (llmUrl()) {
    let pending = false;
    try {
      const history = a.msgs.filter((m) => m !== msg).slice(-7).map((m) => ({ role: m.role, content: m.content }));
      await streamLLM("/chat", { messages: history }, {
        onSources: (src) => { msg.sources = src; },
        onToken: (tok) => {
          msg.content += tok;
          if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; const el = $("chatLive"); if (el) { el.innerHTML = miniMd(msg.content) + '<span class="caret"></span>'; scrollChat(); } }); }
        },
      });
      if (!msg.content.trim()) throw new Error("kosong");
    } catch (e) {
      // Rheus AI tidak bisa dihubungi: pakai pencarian lokal.
      const local = await askLocal(q);
      msg.content = (msg.content ? msg.content + "\n\n" : "") + local.answer;
      if (!msg.sources.length) msg.sources = local.sources;
    }
  } else {
    const local = await askLocal(q);
    msg.content = local.answer; msg.sources = local.sources;
  }
  msg.streaming = false;
  a.status = "done";
  softRender(); scrollChat(); haptic();
}
function scrollChat() { const b = $("chatBox"); if (b) b.scrollTop = b.scrollHeight; }
async function askLocal(q) {
  const parts = [];
  let sources = [];
  try {
    const kb = await Cloud.get("knowledge").catch(() => Cloud.cached("knowledge"));
    if (/\b(bitcoin|btc|kripto|crypto)\b/i.test(q) && /\b(harga|berapa|naik|turun|prediksi|arah|price)\b/i.test(q)) {
      const b = Cloud.cached("btc-24j") || (await Cloud.get("btc-24j").catch(() => null));
      const price = state.live ? state.live.usd : b && b.price;
      if (b) parts.push(`Harga Bitcoin sekarang sekitar ${fmtUsd(price)}. Untuk 24 jam ke depan model Rheus melihatnya ${{ up: "cenderung naik", down: "cenderung turun", side: "cenderung sideways" }[b.model.direction]} dengan keyakinan ${b.model.confidence} (naik ${pct(b.model.probs.up)}, turun ${pct(b.model.probs.down)}). Bukan saran keuangan.`);
    }
    if (kb && kb.docs.length) {
      if (!bm25 || bm25.docs !== kb.docs) bm25 = buildBM25(kb.docs);
      let qt = tok(q);
      qt = qt.concat(...qt.map((w) => SYN[w] || []));
      const scored = bm25.docs.map((d, i) => {
        let s = 0;
        for (const w of qt) { const f = bm25.tf[i].get(w); if (f) s += bm25.idf(w) * (f * 2.5) / (f + 1.5 * (0.25 + 0.75 * bm25.len[i] / bm25.avg)); }
        if (s) s *= (1 + 0.3 * (nowSec() - d.ts < 86400)) * (1 + 0.15 * d.v);
        return [s, d];
      }).filter(([s]) => s > 0).sort((x, y) => y[0] - x[0]).slice(0, 4).map(([, d]) => d);
      sources = scored;
      if (scored.length) {
        const top = scored[0];
        parts.push(`Yang paling relevan: "${top.t}" (${top.s}, ${agoText(top.ts)})${top.v ? " — terverifikasi beberapa media kredibel" : ""}.`);
        if (scored.length > 1) parts.push("Terkait: " + scored.slice(1, 3).map((d) => `"${d.t}"`).join("; ") + ".");
      }
    }
    if (!parts.length) parts.push("Rheus belum menemukan informasi yang cocok dari berita 48 jam terakhir. Coba kata kunci lain.");
  } catch (e) { parts.push(e.message); }
  return { answer: parts.join(" "), sources: sources.map((d, i) => ({ n: i + 1, t: d.t, s: d.s, l: d.l })) };
}

// ---------------------------------------------------------------------- transkripsi (di HP)
const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;
const fmtTime = (s) => (window.TranscriptBot ? TranscriptBot.fmtTime(s) : String(Math.floor(s)));
const STAGES = ["Menghubungi YouTube", "Mengambil subtitle", "TranscriptBot merapikan", "Selesai"];
let modelReady = null;
function loadModel() {
  if (modelReady) return modelReady;
  modelReady = Promise.all([
    fetch("model/punct.bin").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    fetch("model/case.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([bin, caseMap]) => { if (bin) TranscriptBot.load({ punct: new Float32Array(bin), caseMap: caseMap || {} }); return !!bin; });
  return modelReady;
}
function viewTranscribe() {
  const t = state.t, d = t.data;
  const tb = d && d.transcriptbot, sum = tb && tb.summary;
  const paragraphs = !d ? [] : t.view === "rapi" ? tb.clean.paragraphs : groupSegments(d.segments);
  const recent = JSON.parse(store.get("tr-recent", "[]"));
  return `
  <section class="section">
    <div class="page-head"><h2>Transkripsi Video</h2><p class="text-muted">Subtitle diambil langsung dari HP, lalu dirapikan & diringkas TranscriptBot ${esc(window.TranscriptBot ? TranscriptBot.VERSION : "")} — di perangkatmu, tanpa server.</p></div>
    <div class="card elev-sm" style="gap:10px;max-width:760px">
      <div style="display:flex;gap:8px">
        <div class="input-wrap"><i class="ph ph-youtube-logo"></i><input id="yt" class="input" type="url" inputmode="url" autocomplete="off" placeholder="Tempel link YouTube…" value="${esc(t.url)}"></div>
        <button id="ytGo" class="btn btn-primary" data-action="startTranscribe" ${!t.url.trim() || t.status === "loading" ? "disabled" : ""}><i class="ph-fill ph-lightning"></i>Proses</button>
      </div>
      ${t.ytError ? `<span style="font-size:12px;color:var(--color-accent-300)">Masukkan link YouTube yang valid (youtube.com atau youtu.be).</span>` : ""}
      ${recent.length && t.status !== "loading" ? `<div class="chips">${recent.map((r) => `<button class="chip" data-recent="${esc(r.id)}"><i class="ph ph-clock-counter-clockwise"></i>${esc((r.title || r.id).slice(0, 34))}</button>`).join("")}</div>` : ""}
    </div>
    ${t.status === "loading" ? `
    <div class="card elev-sm stages" style="max-width:760px">
      ${STAGES.slice(0, 3).map((s, i) => `<div class="stage ${i < t.stage ? "done" : i === t.stage ? "now" : ""}"><span class="sdot">${i < t.stage ? '<i class="ph-bold ph-check"></i>' : i + 1}</span>${s}${i === t.stage ? '<i class="ph ph-circle-notch spin" style="margin-left:auto"></i>' : ""}</div>`).join("")}
      ${t.stageNote ? `<span class="card-meta" style="color:var(--color-accent-300)"><i class="ph ph-cloud-arrow-down"></i>${esc(t.stageNote)}</span>` : ""}
      <span class="card-meta" id="trTimer">0,0 dtk</span>
    </div>` : ""}
    ${t.status === "error" ? errorCard(t.error, "startTranscribe") : ""}
    ${d ? `
    <div class="done-banner reveal"><i class="ph-fill ph-lightning"></i>Selesai dalam ${(t.ms / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} detik · ${esc(fmtTime(d.duration))} video · ${d.cached ? "dari simpanan HP" : d.via === "rheus-cloud" ? "via Rheus Cloud" : tb.model ? "model ML aktif" : "mode cadangan"}</div>
    ${llmUrl() ? `<div class="card elev-md ai-card reveal">
      <div style="display:flex;align-items:center;gap:8px"><i class="ph-fill ph-sparkle" style="color:var(--color-accent);font-size:18px"></i><span class="card-kicker">Ringkasan AI · Rheus</span>
        ${t.ai && t.ai.status === "done" ? `<button class="btn btn-ghost btn-icon" style="margin-left:auto" data-action="copyAi" aria-label="Salin"><i class="ph ph-copy"></i></button>` : ""}</div>
      ${!t.ai ? `<p class="card-body">Ringkasan yang ditulis ulang oleh Rheus (Llama 3.2 3B) — lebih luwes dari ringkasan cepat di bawah.</p>
        <div><button class="btn btn-primary" data-action="aiSummary"><i class="ph-fill ph-sparkle"></i>Buat ringkasan AI</button></div>`
      : t.ai.status === "error" ? `<p class="card-body">${esc(t.ai.text)}</p><div><button class="btn btn-secondary" data-action="aiSummary"><i class="ph ph-arrows-clockwise"></i>Coba lagi</button></div>`
      : `<div id="aiSum" class="ai-text">${t.ai.text ? miniMd(t.ai.text) : ""}${t.ai.status === "loading" ? '<span class="caret"></span>' : ""}</div>`}
    </div>` : ""}
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;align-items:start">
      <div class="card elev-md reveal" style="gap:12px;--i:1">
        <div style="display:flex;align-items:center;gap:8px"><span class="card-kicker">Ringkasan</span>
          <button class="btn btn-ghost btn-icon" style="margin-left:auto" data-action="copySummary" aria-label="Salin"><i class="ph ph-copy"></i></button>
          <button class="btn btn-ghost btn-icon" data-action="shareSummary" aria-label="Bagikan"><i class="ph ph-share-network"></i></button></div>
        <div class="card-title">${esc(d.title || "Video YouTube")}</div>
        <p class="card-body" style="font-size:14px">${esc(sum.short)}</p>
        <div style="display:flex;flex-direction:column;gap:8px">${sum.points.concat(sum.details).map((p) => `<div class="point"><i class="ph-bold ph-check"></i>
          <span>${p.label ? `<b>${esc(p.label)}:</b> ` : ""}${esc(p.text)} <button class="ts-link inline" data-seek="${Math.floor(p.start)}">${fmtTime(p.start)}</button></span></div>`).join("")}</div>
        ${sum.conclusion && !sum.isList ? `<p class="card-body"><b style="color:var(--color-text);font-weight:500">Kesimpulan:</b> ${esc(sum.conclusion)}</p>` : ""}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${sum.keywords.slice(0, 5).map((k, i) => `<span class="tag ${i === 0 ? "tag-accent" : "tag-neutral"}">${esc(k)}</span>`).join("")}</div>
      </div>
      <div class="card elev-sm reveal" style="gap:12px;--i:2">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="card-kicker">Transkripsi lengkap</span>
          <div class="seg" style="margin-left:auto"><label class="seg-opt ${t.view === "rapi" ? "on" : ""}"><input type="radio" name="tview" value="rapi">Rapi</label><label class="seg-opt ${t.view === "asli" ? "on" : ""}"><input type="radio" name="tview" value="asli">Asli</label></div>
          <button class="btn btn-ghost btn-icon" data-action="copyTranscript" aria-label="Salin transkrip"><i class="ph ph-copy"></i></button></div>
        <span class="card-meta">${esc(langLabel(d))} · ${t.view === "rapi" ? "titik, koma & huruf kapital oleh model ML Rheus" : "subtitle asli YouTube"}</span>
        <div class="transcript">${paragraphs.map((g) => `<div class="para"><button class="ts-link" data-seek="${Math.floor(g.start)}">${fmtTime(g.start)}</button><span>${esc(g.text)}</span></div>`).join("")}</div>
      </div>
    </div>` : ""}
  </section>`;
}
function groupSegments(segs) {
  const out = [];
  let cur = null;
  for (const s of segs || []) { if (!cur || s.start - cur.start > 25) { cur = { start: s.start, text: s.text }; out.push(cur); } else cur.text += " " + s.text; }
  return out;
}
const langLabel = (d) => (d.source === "terjemahan" ? "Terjemahan ke Indonesia" : d.language === "id" || d.language === "in" ? "Bahasa Indonesia" : `Bahasa ${String(d.language || "").toUpperCase()}`);
let trTimer = null;
async function startTranscribe(urlArg) {
  const t = state.t;
  const url = (urlArg || t.url).trim();
  t.url = url;
  if (!YT_RE.test(url) && !/^[A-Za-z0-9_-]{11}$/.test(url)) { t.ytError = true; softRender(); return; }
  haptic();
  Object.assign(t, { ytError: false, status: "loading", stage: 0, error: null, data: null, ai: null, stageNote: "", started: performance.now() });
  softRender();
  clearInterval(trTimer);
  trTimer = setInterval(() => { const el = $("trTimer"); if (el) el.textContent = ((performance.now() - t.started) / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " dtk"; }, 100);
  const stage = (i) => { t.stage = i; if (state.page === "transcribe") softRender(); };
  try {
    const modelP = loadModel();
    stage(1);
    let raw;
    try {
      raw = isApp
        ? JSON.parse(await withTimeout(Bridge.call("getTranscript", url), 35000, "YouTube tidak merespons dalam 35 detik. Periksa koneksi lalu coba lagi."))
        : await withTimeout(window.__mockTranscript(url), 30000, "Waktu habis.");
    } catch (e) {
      // HP kena batas YouTube (429): ambil lewat Rheus Cloud (alamat IP berbeda).
      if (!String(e.message).startsWith("RATE_LIMIT|")) throw e;
      const llm = llmUrl();
      const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/) || [])[1] || (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : "");
      if (!llm || !id) throw new Error(RATE_LIMIT_HELP);
      t.stageNote = "YouTube membatasi jaringanmu — mengambil lewat Rheus Cloud…";
      softRender();
      const r = await withTimeout(fetch(`${llm}/transcript?v=${id}`), 25000, RATE_LIMIT_HELP).catch(() => null);
      const j = r && (await r.json().catch(() => null));
      if (!j || !j.segments) throw new Error(RATE_LIMIT_HELP);
      raw = j;
    }
    t.stageNote = "";
    stage(2);
    await modelP;
    await new Promise((r) => setTimeout(r, 16)); // beri kesempatan UI menggambar tahap ini
    const tb = TranscriptBot.process(raw.segments, raw.title || "");
    const last = raw.segments[raw.segments.length - 1] || { start: 0, duration: 0 };
    const data = { ...raw, duration: (last.start || 0) + (last.duration || 0), transcriptbot: tb };
    t.ms = performance.now() - t.started;
    Object.assign(t, { status: "done", data, stage: 3 });
    const recent = JSON.parse(store.get("tr-recent", "[]")).filter((r) => r.id !== raw.video_id);
    recent.unshift({ id: raw.video_id, title: raw.title });
    store.set("tr-recent", JSON.stringify(recent.slice(0, 4)));
    haptic();
  } catch (e) {
    Object.assign(t, { status: "error", error: e.message || String(e) });
  }
  clearInterval(trTimer);
  if (state.page === "transcribe") softRender();
}
const RATE_LIMIT_HELP = "YouTube sedang membatasi permintaan dari jaringanmu (kode 429). Ini biasanya terjadi di data seluler karena banyak pengguna berbagi satu alamat IP. Coba: (1) tunggu 1–2 menit, (2) pindah ke Wi-Fi atau sebaliknya, atau (3) nyalakan-matikan mode pesawat agar IP berganti. Video yang sudah pernah ditranskripsi tetap bisa dibuka tanpa internet.";
function llmUrl() { const m = Cloud.cached("manifest"); return m && m.llm && m.llm.url ? m.llm.url : ""; }

/** Baca aliran SSE dari Rheus LLM (Workers AI): onSources(list), onToken(teks). */
async function streamLLM(path, body, { onSources, onToken, signal } = {}) {
  const res = await fetch(llmUrl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Rheus AI sedang sibuk."); }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "message";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (ev === "sources") onSources && onSources(j);
          else if (ev === "error") throw new Error(j.message);
          else if (j.response) onToken && onToken(j.response);
        } catch (err) { if (ev === "error") throw err; }
      } else if (!line) ev = "message";
    }
  }
}

/** Markdown sederhana (tebal, poin, paragraf) → HTML aman. */
function miniMd(md) {
  const lines = esc(md).split(/\n/);
  let html = "", inList = false;
  for (const raw of lines) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[(\d+)\]/g, '<sup class="cite">$1</sup>');
    if (/^\s*[-*•]\s+/.test(raw)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (raw.trim()) html += `<p>${l}</p>`;
  }
  return html + (inList ? "</ul>" : "");
}

async function aiSummary() {
  const t = state.t, d = t.data;
  if (!d || !llmUrl() || (t.ai && t.ai.status === "loading")) return;
  haptic();
  t.ai = { status: "loading", text: "" };
  softRender();
  let pending = false;
  try {
    await streamLLM("/summarize", { title: d.title || "", text: d.transcriptbot.clean.text }, {
      onToken: (tok) => {
        t.ai.text += tok;
        if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; const el = $("aiSum"); if (el) el.innerHTML = miniMd(t.ai.text) + '<span class="caret"></span>'; }); }
      },
    });
    t.ai.status = "done";
  } catch (e) { t.ai = { status: "error", text: e.message }; }
  if (state.page === "transcribe") softRender();
}

const summaryText = (d) => [d.title || "Video YouTube", `https://www.youtube.com/watch?v=${d.video_id}`, "", d.transcriptbot.markdown].join("\n");

// ---------------------------------------------------------------------- berita (umum)
const PER_PAGE = 6;
function newsHead(title, sub, d, refreshAction) {
  return `<div class="head-row page-head">
    <div style="margin-right:auto;min-width:0"><h2>${esc(title)}</h2><p class="text-muted">${esc(sub)}</p></div>
    <div style="display:flex;align-items:center;gap:6px">${liveChip(d)}
    <button class="btn btn-ghost btn-icon" data-action="${refreshAction}" aria-label="Perbarui"><i class="ph ph-arrows-clockwise ${d && d.status === "loading" ? "spin" : ""}"></i></button></div>
  </div>`;
}
function trustBadge(s) {
  if (s.verified) return `<span class="badge ok"><i class="ph-fill ph-seal-check"></i>Terverifikasi ${s.credibleSources.length} media</span>`;
  if (s.credible) return `<span class="badge"><i class="ph ph-shield-check"></i>Sumber kredibel</span>`;
  return `<span class="badge warn"><i class="ph ph-warning"></i>Belum terverifikasi</span>`;
}
function storyTags(s) {
  const t = [];
  if (s.categoryLabel && s.category !== "lainnya") t.push(`<span class="tag tag-neutral">${esc(s.categoryLabel)}</span>`);
  (s.tagLabels || []).slice(0, 2).forEach((x) => t.push(`<span class="tag tag-neutral">${esc(x)}</span>`));
  (s.platformLabels || []).forEach((p) => t.push(`<span class="tag tag-outline">${esc(p)}</span>`));
  return t.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${t.join("")}</div>` : "";
}
function trustSummary(stats) {
  if (!stats) return "";
  return `<div class="trust-row reveal"><span><i class="ph-fill ph-seal-check" style="color:var(--color-up)"></i>${stats.verified} terverifikasi</span>
    <span><i class="ph ph-shield-check"></i>${stats.credible} dari media kredibel</span>
    <span><i class="ph ph-prohibit"></i>${stats.hoaxFiltered || 0} hoaks disaring</span></div>`;
}
function newsBlocks(hot, list) {
  state.articles = { hot, list };
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  state.newsPage = Math.min(state.newsPage, pageCount);
  const items = list.slice((state.newsPage - 1) * PER_PAGE, state.newsPage * PER_PAGE);
  const start = Math.max(1, Math.min(state.newsPage - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i);
  return `
    <div>
      <div class="sub-head"><i class="ph-fill ph-fire" style="color:#ff8a65"></i><h6>Headline hot</h6></div>
      ${hot.length ? `<div class="hot-grid">${hot.map((h, i) => `<button class="card hot-card reveal ${i === 0 ? "top" : ""}" data-article="hot:${i}" style="--i:${i}">
          <div style="display:flex;gap:6px;align-items:center"><span class="tag tag-outline">HOT #${i + 1}</span><span class="card-meta" style="margin-left:auto">${esc(h.time)}</span></div>
          <div class="card-title" style="font-size:18px">${esc(h.title)}</div>
          <p class="card-body clamp3">${esc(h.excerpt)}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto">${trustBadge(h)}${storyTags(h).replace(/^<div[^>]*>|<\/div>$/g, "")}</div>
          <span class="card-meta">${esc(h.source)}${h.sources.length > 1 ? ` +${h.sources.length - 1} sumber` : ""}</span>
        </button>`).join("")}</div>` : `<p class="text-muted">Belum ada berita untuk pilihan ini.</p>`}
    </div>
    <div>
      <div class="sub-head"><i class="ph ph-clock" style="color:var(--color-accent)"></i><h6>Berita terbaru</h6></div>
      <div style="display:flex;flex-direction:column">${items.map((a, i) => `<button class="news-row reveal" data-article="list:${(state.newsPage - 1) * PER_PAGE + i}" style="--i:${i}">
          <span style="font-size:15px;font-weight:500">${esc(a.title)}</span><span class="card-meta" style="white-space:nowrap">${esc(a.time)}</span>
          ${a.excerpt ? `<span class="text-muted clamp2" style="font-size:13px">${esc(a.excerpt)}</span>` : "<span></span>"}
          <span class="card-meta row-meta">${a.verified ? '<i class="ph-fill ph-seal-check" style="color:var(--color-up)"></i>' : a.credible ? "" : '<i class="ph ph-warning" style="color:#f0b86e"></i>'}${esc(a.source)}${a.categoryLabel && a.category !== "lainnya" ? ` · ${esc(a.categoryLabel)}` : ""}${(a.tagLabels || []).length ? ` · ${esc(a.tagLabels[0])}` : ""}${(a.platformLabels || []).length ? ` · ${esc(a.platformLabels.join(", "))}` : ""}</span>
        </button>`).join("") || `<p class="text-muted">Belum ada berita lain.</p>`}</div>
      ${pageCount > 1 ? `<div class="pager">
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage - 1}" ${state.newsPage === 1 ? "disabled" : ""} aria-label="Sebelumnya"><i class="ph ph-caret-left"></i></button>
        ${pages.map((p) => `<button class="btn ${p === state.newsPage ? "btn-primary" : "btn-secondary"} btn-icon" data-page="${p}">${p}</button>`).join("")}
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage + 1}" ${state.newsPage === pageCount ? "disabled" : ""} aria-label="Berikutnya"><i class="ph ph-caret-right"></i></button>
        <span class="card-meta" style="margin-left:6px">${state.newsPage}/${pageCount}</span></div>` : ""}
    </div>`;
}
function openArticle(ref, catLabel) {
  const [kind, idx] = ref.split(":");
  const a = (state.articles || {})[kind] && state.articles[kind][+idx];
  if (!a) return;
  haptic();
  state.article = a;
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle">
      <div class="dialog sheet" role="dialog" aria-modal="true" data-stop>
        <div class="grab"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag tag-accent">${esc(a.categoryLabel && a.category !== "lainnya" ? a.categoryLabel : catLabel)}</span><span class="card-meta">${esc(a.source)} · ${esc(a.time)}</span>
          <button class="btn btn-ghost btn-icon" style="margin-left:auto" data-action="closeArticle" aria-label="Tutup"><i class="ph ph-x" style="color:var(--color-text)"></i></button></div>
        <div class="dialog-title" style="font-size:22px;line-height:1.25">${esc(a.title)}</div>
        <div>${trustBadge(a)}</div>
        <div class="dialog-body" style="font-size:15px">
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
          <p class="explain"><i class="ph-fill ph-sparkle" style="color:var(--color-accent)"></i> ${esc(a.explain || "")}</p>
          ${a.related.length ? `<p style="margin-bottom:4px"><b style="color:var(--color-text);font-weight:500">Liputan terkait</b></p>
            <ul style="margin:0;padding-left:18px">${a.related.map((r) => `<li><a href="#" data-read="${esc(r.link)}" data-title="${esc(r.title)}">${esc(r.title)}</a> <span class="card-meta">${esc(r.source)}</span></li>`).join("")}</ul>` : ""}
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" data-action="shareArticle"><i class="ph ph-share-network"></i>Bagikan</button>
          <button class="btn btn-primary" data-read="${esc(a.link)}" data-title="${esc(a.title)}"><i class="ph ph-book-open-text"></i>Baca artikel</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------- Berita Finansial
const FIN_ICON = { saham: "ph-chart-line-up", rupiah: "ph-currency-circle-dollar", kripto: "ph-currency-btc", perbankan: "ph-bank", emas: "ph-coins", makro: "ph-globe" };
const TEK_ICON = { ai: "ph-brain", gadget: "ph-device-mobile", aplikasi: "ph-app-window", siber: "ph-shield-warning", startup: "ph-rocket-launch", game: "ph-game-controller", sains: "ph-planet" };
function viewTagged(name, title, sub, icons, st, chipName) {
  const d = load(name);
  const head = newsHead(title, sub, d, "refresh:" + name);
  if (!d.data) return `<section class="section">${head}${d.status === "error" ? errorCard(d.error, "refresh:" + name) : skeletonNews() + loadingLine("Mengunduh dari Rheus Cloud…")}</section>`;
  const all = d.data.hot.concat(d.data.list);
  let hot = d.data.hot, list = d.data.list;
  if (st.tag !== "all") { const x = all.filter((s) => s.tags.includes(st.tag)); hot = x.filter((s) => s.credible).sort((a, b) => b.score - a.score).slice(0, 3); const hs = new Set(hot); list = x.filter((s) => !hs.has(s)).sort((a, b) => b.ts - a.ts); }
  return `<section class="section">${head}${trustSummary(d.data.stats)}
    ${chips(chipName, [{ id: "all", label: "Semua", count: all.length }, ...d.data.tags.filter((t) => t.count).map((t) => ({ id: t.id, label: t.label, icon: icons[t.id], count: t.count }))], st.tag)}
    ${newsBlocks(hot, list)}</section>`;
}
const viewFinansial = () => viewTagged("finansial", "Berita Finansial", "Saham, rupiah, kripto, perbankan, dan ekonomi — dari media kredibel.", FIN_ICON, state.fin, "fin");
const viewTeknologi = () => viewTagged("teknologi", "Berita Teknologi", "AI, gadget, aplikasi, keamanan siber, startup — ketuk berita untuk Mode Baca bersih.", TEK_ICON, state.tek, "tek");

// ---------------------------------------------------------------------- Musik Online (YouTube Music)
const MUSIC_LINKS = [
  { label: "Beranda", desc: "Rekomendasi & mix", icon: "ph-house", url: "https://music.youtube.com/" },
  { label: "Tangga Lagu", desc: "Top lagu Indonesia & global", icon: "ph-ranking", url: "https://music.youtube.com/charts" },
  { label: "Jelajahi", desc: "Rilis baru, mood & genre", icon: "ph-compass", url: "https://music.youtube.com/explore" },
  { label: "Cari lagu", desc: "Judul, artis, lirik", icon: "ph-magnifying-glass", url: "https://music.youtube.com/search" },
];
function openMusic(url) {
  haptic();
  if (isApp && typeof Native.openMusic === "function") Native.openMusic(url || "https://music.youtube.com/");
  else window.open(url || "https://music.youtube.com/", "_blank", "noopener");
}
function viewMusik() {
  return `<section class="section">
    <div class="page-head"><h2>Musik Online</h2><p class="text-muted">YouTube Music langsung di dalam SiLengkap.</p></div>
    <button class="card music-hero reveal" data-music="https://music.youtube.com/">
      <span class="music-disc"><i class="ph-fill ph-play"></i></span>
      <span style="display:flex;flex-direction:column;gap:4px;text-align:left"><span style="font-size:20px;font-weight:600">Buka YouTube Music</span>
      <span class="text-muted" style="font-size:13px">Cari & putar lagu apa saja</span></span>
      <i class="ph ph-caret-right" style="margin-left:auto;font-size:20px"></i>
    </button>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr))">
      ${MUSIC_LINKS.slice(1).map((m, i) => `<button class="card game-card reveal" data-music="${esc(m.url)}" style="--i:${i + 1};min-height:110px"><i class="ph ${m.icon}"></i><span class="card-title" style="font-size:15px">${esc(m.label)}</span><span class="card-meta">${esc(m.desc)}</span></button>`).join("")}
    </div>
    <div class="card elev-sm reveal" style="gap:8px;--i:4">
      <span class="card-kicker">Perlu diketahui</span>
      <p class="card-body"><b>Masuk akun:</b> ketuk "Masuk akun" di atas halaman YouTube Music (dibuka lewat Chrome, karena Google tidak mengizinkan login di dalam aplikasi lain).</p>
      <p class="card-body"><b>Putar di latar belakang</b> (layar mati) adalah fitur YouTube Premium — untuk akun gratis musik berhenti saat aplikasi ditutup. Mau musik gratis yang tetap jalan saat layar mati? Pakai menu <a href="#/radio">Radio</a>.</p>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------- Berita Utama
function viewUtama() {
  const d = load("utama");
  const u = state.utama;
  const head = newsHead("Berita Utama", u.tab === "nasional" ? "Peristiwa penting di Indonesia." : "Militer, ekonomi, hubungan antarnegara & geopolitik.", d, "refresh:utama");
  const tabs = `<div class="seg big" role="tablist">${[["nasional", "Nasional", "ph-flag"], ["internasional", "Internasional", "ph-globe-hemisphere-east"]].map(([k, l, ic]) =>
    `<label class="seg-opt ${u.tab === k ? "on" : ""}"><input type="radio" name="utab" value="${k}"><i class="ph ${ic}"></i> ${l}</label>`).join("")}</div>`;
  if (!d.data) return `<section class="section">${head}${tabs}${d.status === "error" ? errorCard(d.error, "refresh:utama") : skeletonNews() + loadingLine("Mengunduh dari Rheus Cloud…")}</section>`;
  const sec = d.data.sections[u.tab];
  let hot = sec.hot, list = sec.list, filter = "";
  if (u.tab === "internasional") {
    const all = hot.concat(list), counts = {};
    all.forEach((s) => (counts[s.category] = (counts[s.category] || 0) + 1));
    const icons = { militer: "ph-shield-star", ekonomi: "ph-chart-bar", diplomasi: "ph-handshake", geopolitik: "ph-globe-stand", lainnya: "ph-dots-three" };
    filter = chips("ucat", [{ id: "all", label: "Semua", count: all.length }, ...d.data.categories.map((c) => ({ id: c.id, label: c.label, icon: icons[c.id], count: counts[c.id] || 0 }))], u.cat);
    if (u.cat !== "all") { const f = all.filter((s) => s.category === u.cat); hot = f.filter((s) => s.credible).sort((a, b) => b.score - a.score).slice(0, 3); const hs = new Set(hot); list = f.filter((s) => !hs.has(s)).sort((a, b) => b.ts - a.ts); }
  }
  return `<section class="section">${head}<div style="display:flex;flex-direction:column;gap:12px">${tabs}${trustSummary(sec.stats)}${filter}</div>${newsBlocks(hot, list)}</section>`;
}

// ---------------------------------------------------------------------- Berita Viral
const PLATFORM_ICON = { tiktok: "ph-tiktok-logo", instagram: "ph-instagram-logo", x: "ph-x-logo", youtube: "ph-youtube-logo", facebook: "ph-facebook-logo" };
const CAT_ICON = { makanan: "ph-hamburger", selebriti: "ph-star", dance: "ph-music-notes", hewan: "ph-paw-print", olahraga: "ph-soccer-ball", teknologi: "ph-device-mobile", sosial: "ph-users-three", lainnya: "ph-dots-three" };
function viewViral() {
  const v = state.viral;
  const name = "viral-" + v.region;
  const d = load(name);
  const head = newsHead("Berita Viral", "Yang sedang ramai di media sosial — per platform & kategori.", d, "refresh:" + name);
  const region = `<div class="seg big" role="radiogroup">${[["id", "🇮🇩 Indonesia"], ["us", "🇺🇸 USA"]].map(([k, l]) => `<label class="seg-opt ${v.region === k ? "on" : ""}"><input type="radio" name="vregion" value="${k}">${l}</label>`).join("")}</div>`;
  if (!d.data) return `<section class="section">${head}${region}${d.status === "error" ? errorCard(d.error, "refresh:" + name) : skeletonNews() + loadingLine("Mengunduh dari Rheus Cloud…")}</section>`;
  const all = d.data.hot.concat(d.data.list);
  const f = all.filter((s) => (v.platform === "all" || s.platforms.includes(v.platform)) && (v.cat === "all" || s.category === v.cat));
  const filtered = v.platform !== "all" || v.cat !== "all";
  const hot = filtered ? f.filter((s) => s.credible || f.length < 6).sort((a, b) => b.score - a.score).slice(0, 3) : d.data.hot;
  const hs = new Set(hot);
  const list = (filtered ? f : d.data.list).filter((s) => !hs.has(s)).sort((a, b) => b.ts - a.ts);
  const pcount = (id) => all.filter((s) => s.platforms.includes(id)).length;
  const ccount = (id) => all.filter((s) => s.category === id && (v.platform === "all" || s.platforms.includes(v.platform))).length;
  return `<section class="section">${head}
    <div style="display:flex;flex-direction:column;gap:10px">${region}${trustSummary(d.data.stats)}
      ${chips("vplat", [{ id: "all", label: "Semua", count: all.length }, ...d.data.platforms.map((p) => ({ id: p.id, label: p.label, icon: PLATFORM_ICON[p.id], count: pcount(p.id) }))], v.platform)}
      ${chips("vcat", [{ id: "all", label: "Semua kategori" }, ...d.data.categories.filter((c) => ccount(c.id)).map((c) => ({ id: c.id, label: c.label, icon: CAT_ICON[c.id], count: ccount(c.id) }))], v.cat)}
    </div>${newsBlocks(hot, list)}</section>`;
}

// ---------------------------------------------------------------------- Bitcoin
const fmtUsd = (x) => (Number.isFinite(x) ? "US$" + Math.round(x).toLocaleString("id-ID") : "—");
function fmtIdr(x) {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e12) return "Rp" + (x / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " T";
  if (x >= 1e9) return "Rp" + (x / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  return "Rp" + Math.round(x).toLocaleString("id-ID");
}
const fmtBig = (x) => (!Number.isFinite(x) ? "—" : x >= 1e9 ? "US$" + (x / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M" : "US$" + (x / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt");
const pct = (x) => Math.round(x * 100) + "%";
const signed = (x) => (x >= 0 ? "+" : "") + x.toLocaleString("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "%";
function chartPaths(series) {
  const n = series.length, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
  const line = series.map((v, i) => `${((i * 600) / Math.max(1, n - 1)).toFixed(1)},${(150 - ((v - min) / span) * 135).toFixed(1)}`).join(" ");
  return { line, area: "M0,160 L" + line.replace(/ /g, " L") + " L600,160 Z" };
}
let liveTimer = null;
async function pollLive() {
  try {
    const r = await withTimeout(fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,idr&include_24hr_change=true"), 8000, "timeout");
    const j = (await r.json()).bitcoin;
    const prev = state.live && state.live.usd;
    state.live = { usd: j.usd, idr: j.idr, change: j.usd_24h_change, at: Date.now(), dir: prev ? Math.sign(j.usd - prev) : 0 };
    const el = $("livePrice");
    if (el && state.page === "btc") {
      el.textContent = fmtUsd(j.usd);
      el.classList.remove("tick-up", "tick-down"); void el.offsetWidth;
      if (state.live.dir) el.classList.add(state.live.dir > 0 ? "tick-up" : "tick-down");
      const c = $("liveChange");
      if (c && state.btcTf === "24j") { c.className = j.usd_24h_change >= 0 ? "up" : "down"; c.innerHTML = `<i class="ph ${j.usd_24h_change >= 0 ? "ph-trend-up" : "ph-trend-down"}"></i> ${signed(j.usd_24h_change)} (24j) · ≈ ${fmtIdr(j.idr)}`; }
    }
  } catch {}
}
function viewBtc() {
  const tf = state.btcTf;
  const d = load("btc-" + tf);
  if (!liveTimer) { pollLive(); liveTimer = setInterval(() => { if (state.page === "btc") pollLive(); }, 20000); }
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  const head = `<div class="head-row page-head"><div style="margin-right:auto"><h2>Prediksi Arah Bitcoin</h2><p class="text-muted">${esc(today)} · analisa Rheus ${d.data ? esc(agoText(d.data.updatedAt)) : ""}</p></div>
    <div class="seg" role="radiogroup">${["24j", "7h", "30h"].map((k) => `<label class="seg-opt ${k === tf ? "on" : ""}"><input type="radio" name="tf" value="${k}">${k}</label>`).join("")}</div></div>`;
  if (!d.data) return `<section class="section">${head}${d.status === "error" ? errorCard(d.error, "refresh:btc-" + tf) : `<div class="card elev-md" style="gap:14px"><div class="skeleton" style="height:40px;width:240px"></div><div class="skeleton" style="height:160px"></div></div>`}</section>`;
  const b = d.data, m = b.model, mk = b.market, sk = m.skill;
  const live = state.live;
  const price = live ? live.usd : b.price;
  const change = live && tf === "24j" ? live.change : b.change;
  const dir = { up: ["ph-arrow-up-right", "Cenderung naik"], down: ["ph-arrow-down-right", "Cenderung turun"], side: ["ph-arrows-left-right", "Cenderung sideways"] }[m.direction];
  const invalid = m.direction === "up" ? `Penutupan di bawah support ${fmtUsd(b.support)} membatalkan skenario ini.` : m.direction === "down" ? `Penutupan di atas resistance ${fmtUsd(b.resistance)} membatalkan skenario ini.` : "Tembusnya support atau resistance menentukan arah berikutnya.";
  const lastS = b.series[b.series.length - 1];
  const ch = chartPaths(b.series.concat(live && Math.abs(live.usd / lastS - 1) < 0.1 ? [live.usd] : [])), up = change >= 0;
  const market = [
    ["Fear & Greed", mk.fng ? mk.fng.value : "—", mk.fng ? mk.fng.label : "—"], ["Volume 24j", fmtBig(mk.volume24h), "CoinGecko"],
    ["Dominasi BTC", mk.dominance ? mk.dominance.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%" : "—", mk.dominance > 55 ? "Tinggi" : "Sedang"],
    ["Funding rate", mk.funding !== null ? (mk.funding >= 0 ? "+" : "") + (mk.funding * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 }) + "%" : "—", mk.funding > 0.0002 ? "Long ramai" : mk.funding < 0 ? "Short ramai" : "Netral"],
    ["RSI (14)", Number.isFinite(mk.rsi) ? mk.rsi.toFixed(0) : "—", mk.rsi > 70 ? "Jenuh beli" : mk.rsi < 30 ? "Jenuh jual" : "Netral"],
    ["Volatilitas 30h", mk.vol30.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%", mk.vol30 > 15 ? "Tinggi" : mk.vol30 > 8 ? "Sedang" : "Rendah"],
  ];
  return `<section class="section">${head}
    <div class="card elev-md price-card reveal">
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:4px"><span class="card-kicker">BTC / USD ${live ? '<span class="live mini"><span class="dot"></span>LIVE</span>' : ""}</span>
          <span id="livePrice" class="num price">${fmtUsd(price)}</span>
          <span id="liveChange" class="${up ? "up" : "down"}"><i class="ph ${up ? "ph-trend-up" : "ph-trend-down"}"></i> ${signed(change)} (${esc(tf)}) · ≈ ${fmtIdr(live && tf === "24j" ? live.idr : b.priceIdr)}</span></div>
        <div style="display:flex;gap:22px;margin-left:auto;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column"><span class="card-meta">Tertinggi ${esc(b.tfLabel)}</span><span class="num">${fmtUsd(b.high)}</span></div>
          <div style="display:flex;flex-direction:column"><span class="card-meta">Terendah ${esc(b.tfLabel)}</span><span class="num">${fmtUsd(b.low)}</span></div></div>
      </div>
      <svg viewBox="0 0 600 160" preserveAspectRatio="none" class="chart" role="img" aria-label="Grafik harga">
        <defs><linearGradient id="btcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9184d9" stop-opacity="0.4"></stop><stop offset="1" stop-color="#9184d9" stop-opacity="0"></stop></linearGradient></defs>
        <path d="${ch.area}" fill="url(#btcg)" class="area"></path><polyline points="${ch.line}" fill="none" stroke="#b9b0ec" stroke-width="2" vector-effect="non-scaling-stroke" class="draw"></polyline></svg>
    </div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px">
      <div class="card elev-sm reveal" style="gap:12px;--i:1"><span class="card-kicker">Arah · ${esc(b.tfLabel)}</span>
        <div style="display:flex;align-items:center;gap:14px"><span class="dir-orb ${m.direction}"><i class="ph ${dir[0]}"></i></span>
          <div><div style="font-size:22px;font-weight:600">${dir[1]}</div><div class="text-muted" style="font-size:13px">Target ${fmtUsd(m.target)} · keyakinan ${esc(m.confidence)}</div></div></div>
        <p class="card-body">Sinyal: ${esc(m.reasons.slice(0, 3).join(", "))}. ${m.context.length ? `Sentimen: ${esc(m.context.join(", "))}. ` : ""}${esc(invalid)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="stat"><span class="card-meta">Support</span><span class="num">${fmtUsd(b.support)}</span></div><div class="stat"><span class="card-meta">Resistance</span><span class="num">${fmtUsd(b.resistance)}</span></div></div>
      </div>
      <div class="card elev-sm reveal" style="gap:14px;--i:2"><span class="card-kicker">Probabilitas</span>
        ${[["Naik", "ph-arrow-up-right", m.probs.up, "var(--color-up)"], ["Sideways", "ph-arrows-left-right", m.probs.side, "var(--color-neutral-500)"], ["Turun", "ph-arrow-down-right", m.probs.down, "var(--color-down)"]].map(([l, ic, p, c]) => `
          <div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:8px;font-size:14px"><i class="ph ${ic}" style="color:${c}"></i>${l}<span class="num" style="margin-left:auto;font-weight:600">${pct(p)}</span></div>
          <div class="bar"><div style="--w:${(p * 100).toFixed(1)}%;background:${c}"></div></div></div>`).join("")}
        <span class="card-meta" style="line-height:1.5">Dari ${m.historyDays} hari bersinyal ${esc(m.signal)} serupa (±2 tahun). Frekuensi historis, bukan jaminan.</span>
        <span class="card-meta" style="line-height:1.5"><i class="ph ph-flask"></i>Uji balik ${sk.days} hari: arah benar ${sk.accuracy === null ? "—" : pct(sk.accuracy)}. ${sk.skilled ? "Sedikit lebih baik dari tebakan dasar." : "Belum terbukti lebih baik dari tebakan dasar."}</span>
      </div>
    </div>
    <div class="card elev-sm reveal" style="gap:10px;--i:3"><span class="card-kicker">Keadaan pasar</span>
      <div class="stats-grid">${market.map(([l, v, n]) => `<div class="stat"><span class="card-meta">${esc(l)}</span><span class="num" style="font-size:20px;font-weight:600">${esc(v)}</span><span style="font-size:12px;color:var(--color-accent-300)">${esc(n)}</span></div>`).join("")}</div>
      <span class="card-meta"><i class="ph ph-info"></i>Bukan saran keuangan. Arah harga Bitcoin hampir tidak bisa ditebak dari indikator teknikal — ini gambaran statistik, bukan ramalan.</span>
    </div></section>`;
}

// ---------------------------------------------------------------------- radio
// Di APK radio diputar oleh RadioService (ExoPlayer, latar belakang, sambung ulang otomatis).
// Pemutar <audio> hanya cadangan untuk pengembangan di browser.
const NATIVE_RADIO = isApp && typeof window.Native.radioPlay === "function";
const audio = new Audio();
audio.preload = "none";
if (!NATIVE_RADIO) {
  audio.addEventListener("playing", () => radioEvent({ state: "playing" }));
  audio.addEventListener("waiting", () => radioEvent({ state: "loading" }));
  audio.addEventListener("pause", () => { if (state.radio.status !== "error") radioEvent({ state: "paused" }); });
  audio.addEventListener("error", () => { if (state.radio.playing && audio.getAttribute("src")) radioEvent({ state: "error", message: "Stasiun tidak bisa diputar. Coba stasiun lain." }); });
}
function radioEvent(e) {
  const r = state.radio;
  const wasPlaying = r.status === "playing";
  if (e.state === "idle") { if (r.playing && r.status !== "loading") { r.playing = null; r.status = "idle"; softRender(); } return; }
  if (!r.playing && e.id) {
    // Aplikasi dibuka lagi saat radio masih berbunyi: pulihkan stasiun dari data tersimpan.
    const all = ["id", "us"].flatMap((g) => ((Cloud.cached("radio-" + g) || {}).stations || []));
    r.playing = all.find((x) => x.id === e.id) || JSON.parse(store.get("radio-last", "null"));
  }
  if (!r.playing) return;
  if (e.state === "error" && r.status !== "error" && e.message) toast(e.message);
  if (e.state === "reconnecting" && r.status !== "reconnecting") haptic();
  Object.assign(r, { status: e.state, nowPlaying: e.nowPlaying || "", attempt: e.attempt || 0, message: e.message || "" });
  if ((r.status === "playing") !== wasPlaying && state.page === "radio") softRender(); else renderPlayer();
}
Bridge.on("radio", radioEvent);
function viewRadio() {
  const r = state.radio;
  const d = load("radio-" + r.region);
  const head = `<div class="head-row page-head"><div style="margin-right:auto"><h2>Radio</h2><p class="text-muted">Stasiun gratis dari direktori terbuka Radio Browser.</p></div></div>`;
  const region = `<div class="seg big" role="radiogroup">${[["id", "🇮🇩 Indonesia"], ["us", "🇺🇸 USA"]].map(([k, l]) => `<label class="seg-opt ${r.region === k ? "on" : ""}"><input type="radio" name="rregion" value="${k}">${l}</label>`).join("")}</div>`;
  if (!d.data) return `<section class="section">${head}${region}${d.status === "error" ? errorCard(d.error, "refresh:radio-" + r.region) : loadingLine("Memuat stasiun…")}</section>`;
  const q = r.q.toLowerCase();
  const list = d.data.stations.filter((s) => !q || s.name.toLowerCase().includes(q) || s.tags.join(" ").includes(q) || (s.city || "").toLowerCase().includes(q));
  return `<section class="section">${head}<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${region}
    <div class="input-wrap" style="flex:1;min-width:200px"><i class="ph ph-magnifying-glass"></i><input id="radioQ" class="input" placeholder="Cari stasiun, kota, genre…" value="${esc(r.q)}"></div></div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:10px">
      ${list.map((s, i) => {
        const on = r.playing && r.playing.id === s.id;
        return `<button class="card elev-sm station ${on ? "on" : ""} reveal" data-station="${esc(s.id)}" style="--i:${Math.min(i, 12)}">
          <span class="station-logo">${s.favicon ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="ph ph-radio"></i></span>
          <span style="display:flex;flex-direction:column;min-width:0;text-align:left"><span class="ellipsis" style="font-size:14px;font-weight:500">${esc(s.name)}</span>
          <span class="card-meta ellipsis">${esc([s.city, ...s.tags.slice(0, 2)].filter(Boolean).join(" · ") || "Radio")}${s.bitrate ? ` · ${s.bitrate} kbps` : ""}</span></span>
          ${on && r.status === "playing" ? '<span class="eq"><i></i><i></i><i></i></span>' : '<i class="ph-fill ph-play-circle" style="font-size:30px;color:var(--color-accent);margin-left:auto"></i>'}
        </button>`;
      }).join("") || `<p class="text-muted">Stasiun tidak ditemukan.</p>`}
    </div></section>`;
}
function playStation(id) {
  const d = state.data["radio-" + state.radio.region];
  const s = d && d.data && d.data.stations.find((x) => x.id === id);
  if (!s) return;
  haptic();
  const r = state.radio;
  if (r.playing && r.playing.id === id && (r.status === "playing" || r.status === "loading" || r.status === "reconnecting")) { ACTIONS.togglePlay(); return; }
  Object.assign(r, { playing: s, status: "loading", nowPlaying: "", attempt: 0, message: "" });
  store.set("radio-last", JSON.stringify(s));
  if (NATIVE_RADIO) {
    Native.radioPlay(JSON.stringify({ id: s.id, name: s.name, urls: s.urls && s.urls.length ? s.urls : [s.url], favicon: s.favicon, hls: !!s.hls }));
  } else {
    audio.src = s.url;
    audio.play().catch(() => radioEvent({ state: "error", message: "Stasiun tidak bisa diputar. Coba stasiun lain." }));
  }
  softRender();
}
function renderPlayer() {
  const r = state.radio, el = $("player");
  if (!r.playing) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const busy = r.status === "loading" || r.status === "reconnecting";
  const st = {
    playing: r.nowPlaying ? `♪ ${r.nowPlaying}` : "Sedang diputar",
    loading: "Menyambungkan…",
    reconnecting: `Sinyal putus — menyambung ulang${r.attempt > 1 ? ` (percobaan ${r.attempt})` : ""}…`,
    paused: "Dijeda",
    error: r.message || "Gagal memutar",
  }[r.status] || "";
  el.innerHTML = `${r.status === "playing" ? '<span class="eq"><i></i><i></i><i></i></span>' : `<i class="ph ${r.status === "reconnecting" ? "ph-wifi-low" : r.status === "error" ? "ph-warning" : "ph-radio"}" style="font-size:22px;color:var(--color-accent)"></i>`}
    <div style="min-width:0;flex:1"><div class="ellipsis" style="font-size:14px;font-weight:500">${esc(r.playing.name)}</div><div class="card-meta ellipsis" style="display:block">${esc(st)}</div></div>
    <button class="btn btn-primary btn-icon" data-action="togglePlay" aria-label="Putar/jeda"><i class="ph-fill ${r.status === "playing" ? "ph-pause" : busy ? "ph-circle-notch spin" : "ph-play"}"></i></button>
    <button class="btn btn-ghost btn-icon" data-action="stopRadio" aria-label="Berhenti"><i class="ph ph-x"></i></button>`;
}

// ---------------------------------------------------------------------- gim (offline)
function viewGames() {
  const g = GAMES.find((x) => x.id === state.game);
  if (!g) {
    return `<section class="section"><div class="page-head"><h2>Gim</h2><p class="text-muted">Semua gim bisa dimainkan tanpa internet.</p></div>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">
        ${GAMES.map((x, i) => `<button class="card game-card reveal" data-game="${x.id}" style="--i:${i}"><i class="ph ${x.icon}"></i><span class="card-title">${esc(x.label)}</span><span class="card-meta">${esc(x.desc)}</span></button>`).join("")}
      </div></section>`;
  }
  return `<section class="section" style="gap:14px"><div class="head-row"><button class="btn btn-secondary btn-icon" data-go="games" aria-label="Kembali"><i class="ph ph-caret-left"></i></button>
    <h2 style="margin:0;margin-right:auto">${esc(g.label)}</h2></div><div id="gameRoot"></div></section>`;
}
function mountGame() {
  const root = $("gameRoot");
  if (!root || !state.game) return;
  state.gameInst = window.SLGames[state.game].mount(root, { esc, getBest: () => state.best, setBest: (s) => { state.best = s; store.set("silengkap-dino-best", s); } });
}

// ---------------------------------------------------------------------- status Rheus Cloud
async function openStatus() {
  const man = Cloud.cached("manifest") || (await Cloud.get("manifest").catch(() => null));
  if (!man) { toast("Rheus Cloud belum bisa dihubungi."); return; }
  const L = man.learning || {}, P = (L.punctuation || {}), T = (L.topics || {});
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle"><div class="dialog sheet" data-stop>
      <div class="grab"></div>
      <div class="dialog-title" style="font-size:20px"><span class="live"><span class="dot"></span>Rheus Cloud</span></div>
      <div class="stats-grid">
        <div class="stat"><span class="card-meta">Diperbarui</span><span class="num">${esc(agoText(man.updatedAt))}</span><span class="card-meta">setiap ±30 menit</span></div>
        <div class="stat"><span class="card-meta">Memori</span><span class="num">${man.retentionHours} jam</span><span class="card-meta">data lama dihapus</span></div>
        <div class="stat"><span class="card-meta">Klaim hoaks dipantau</span><span class="num">${man.hoaxClaims}</span><span class="card-meta">dari situs cek fakta</span></div>
        <div class="stat"><span class="card-meta">Kata dipelajari</span><span class="num">${(P.tokens_learned || 0).toLocaleString("id-ID")}</span><span class="card-meta">F1 titik ${P.period_f1_recent ?? "—"}</span></div>
        <div class="stat"><span class="card-meta">Akurasi kategori viral</span><span class="num">${T.viral ? pct(T.viral.accuracy_all) : "—"}</span><span class="card-meta">${T.viral ? T.viral.examples_learned : 0} contoh</span></div>
        <div class="stat"><span class="card-meta">Waktu olah</span><span class="num">${man.buildSeconds} dtk</span><span class="card-meta">per putaran</span></div>
      </div>
      <p class="card-meta" style="line-height:1.5">Rheus mengumpulkan berita dari media kredibel & forum, membuang hoaks yang sudah dibantah situs cek fakta, menggabungkan berita yang sama, lalu belajar dari setiap artikel baru (machine learning online).</p>
      <div class="dialog-actions"><button class="btn btn-primary" data-action="closeArticle">Tutup</button></div>
    </div></div>`;
}

function openSettings() {
  haptic();
  const row = (k, title, sub) => `<label class="set-row"><span class="lbl"><span style="font-size:15px;font-weight:500">${title}</span><span class="card-meta">${sub}</span></span>
    <span class="switch"><input type="checkbox" data-setting="${k}" ${Settings[k] ? "checked" : ""}><span></span></span></label>`;
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle"><div class="dialog sheet" data-stop>
      <div class="grab"></div>
      <div class="dialog-title" style="font-size:20px">Pengaturan</div>
      <div style="display:flex;flex-direction:column;gap:8px"><span class="card-kicker">Tema</span>
        <div class="seg big" role="radiogroup">${[["auto", "Otomatis", "ph-circle-half"], ["dark", "Gelap", "ph-moon"], ["light", "Terang", "ph-sun"]].map(([k, l, ic]) =>
          `<label class="seg-opt ${Settings.theme === k ? "on" : ""}"><input type="radio" name="theme" value="${k}"><i class="ph ${ic}"></i> ${l}</label>`).join("")}</div></div>
      <div>${row("sfx", "Efek suara gim", "Suara lompat, tembak, koin, dll.")}${row("music", "Musik latar gim", "Musik chiptune saat bermain")}${row("haptic", "Getaran", "Getar halus saat menekan tombol")}</div>
      <div class="dialog-actions"><button class="btn btn-primary" data-action="closeArticle">Selesai</button></div>
    </div></div>`;
}

// ====================================================================== event
const ACTIONS = {
  openMenu: () => setMenu(true), closeMenu: () => setMenu(false),
  startTranscribe: () => startTranscribe(),
  copyTranscript: () => { const d = state.t.data; if (d) Platform.copy(state.t.view === "rapi" ? d.transcriptbot.clean.paragraphs.map((p) => `[${fmtTime(p.start)}] ${p.text}`).join("\n\n") : d.segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`).join("\n")); },
  aiSummary: () => aiSummary(),
  newChat: () => { if (state.ask.status !== "loading") { state.ask.msgs = []; softRender(); } },
  copyAi: () => state.t.ai && Platform.copy(state.t.ai.text),
  copySummary: () => state.t.data && Platform.copy(summaryText(state.t.data)),
  shareSummary: () => state.t.data && Platform.share(state.t.data.title || "Ringkasan video", summaryText(state.t.data)),
  closeArticle: () => { $("dialog").innerHTML = ""; state.article = null; },
  shareArticle: () => { const a = state.article; if (a) Platform.share(a.title, `${a.title}\n${a.link}`); },
  openStatus,
  openSettings,
  toggleTheme: () => { const light = document.documentElement.dataset.theme === "light"; Settings.set("theme", light ? "dark" : "light"); haptic(); },
  togglePlay: () => {
    haptic();
    const r = state.radio;
    const on = r.status === "playing" || r.status === "loading" || r.status === "reconnecting";
    if (NATIVE_RADIO) { if (on) Native.radioPause(); else { r.status = "loading"; Native.radioResume(); } }
    else if (on) audio.pause(); else { r.status = "loading"; audio.play().catch(() => {}); }
    renderPlayer();
  },
  stopRadio: () => {
    if (NATIVE_RADIO) Native.radioStop(); else { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    Object.assign(state.radio, { playing: null, status: "idle" }); softRender();
  },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-action],[data-article],[data-page],[data-seek],[data-open],[data-read],[data-music],[data-stop],[data-chip],[data-station],[data-game],[data-recent]");
  if (!el) return;
  if (el.hasAttribute("data-stop") && !e.target.closest("[data-action],[data-open],[data-read]")) return;
  if (el.dataset.read !== undefined) { e.preventDefault(); haptic(); Platform.read(el.dataset.read, el.dataset.title); return; }
  if (el.dataset.music !== undefined) { e.preventDefault(); openMusic(el.dataset.music); return; }
  if (el.dataset.go) { setMenu(false); go(el.dataset.go); return; }
  if (el.dataset.open !== undefined) { e.preventDefault(); Platform.open(el.dataset.open); return; }
  const act = el.dataset.action;
  if (act) {
    if (el.classList.contains("dialog-backdrop") && e.target !== el) return;
    if (act.startsWith("refresh:")) { haptic(); load(act.slice(8), true); softRender(); return; }
    if (ACTIONS[act]) ACTIONS[act]();
    return;
  }
  if (el.dataset.article) { openArticle(el.dataset.article, { finansial: "Finansial", teknologi: "Teknologi", utama: state.utama.tab === "nasional" ? "Nasional" : "Internasional", viral: "Viral" }[state.page] || ""); return; }
  if (el.dataset.page) { haptic(); state.newsPage = +el.dataset.page; softRender(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (el.dataset.chip) {
    haptic();
    const v = el.dataset.val;
    ({ ucat: () => (state.utama.cat = v), fin: () => (state.fin.tag = v), tek: () => (state.tek.tag = v), vplat: () => (state.viral.platform = v), vcat: () => (state.viral.cat = v) })[el.dataset.chip]();
    state.newsPage = 1; softRender(); return;
  }
  if (el.dataset.station) { playStation(el.dataset.station); return; }
  if (el.dataset.game) { go("games", el.dataset.game); return; }
  if (el.dataset.recent) { startTranscribe("https://youtu.be/" + el.dataset.recent); return; }
  if (el.dataset.seek && state.t.data) Platform.open(`https://www.youtube.com/watch?v=${state.t.data.video_id}&t=${el.dataset.seek}s`);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "yt") { state.t.url = e.target.value; state.t.ytError = false; const b = $("ytGo"); if (b) b.disabled = !state.t.url.trim() || state.t.status === "loading"; }
  if (e.target.id === "radioQ") { state.radio.q = e.target.value; const pos = e.target.selectionStart; softRender(); const i = $("radioQ"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
  if (e.target.id === "askQ") state.ask.q = e.target.value;
});
document.addEventListener("change", (e) => {
  const n = e.target.name, v = e.target.value;
  haptic();
  if (n === "theme") { Settings.set("theme", v); document.querySelectorAll('input[name="theme"]').forEach((i) => i.parentElement.classList.toggle("on", i.value === v)); }
  if (e.target.dataset.setting) { Settings.set(e.target.dataset.setting, e.target.checked); if (window.SLAudio) SLAudio.refresh(); }
  if (n === "tf") { state.btcTf = v; softRender(); }
  if (n === "tview") { state.t.view = v; softRender(); }
  if (n === "utab") { state.utama.tab = v; state.utama.cat = "all"; state.newsPage = 1; softRender(); }
  if (n === "vregion") { state.viral = { region: v, platform: "all", cat: "all" }; store.set("viral-region", v); state.newsPage = 1; softRender(); }
  if (n === "rregion") { state.radio.region = v; store.set("radio-region", v); softRender(); }
});
document.addEventListener("submit", (e) => { if (e.target.id === "askForm") { e.preventDefault(); ask($("askQ").value); } });
document.addEventListener("click", (e) => { const c = e.target.closest("[data-ask]"); if (c) ask(c.dataset.ask); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setMenu(false); ACTIONS.closeArticle(); }
  if (e.key === "Enter" && e.target.id === "yt") startTranscribe();
});
window.addEventListener("hashchange", () => {
  const { page, sub } = parseHash();
  if ((page !== state.page || sub !== state.game) && state.gameInst) { state.gameInst.destroy(); state.gameInst = null; }
  state.page = page; state.game = page === "games" ? sub : null; state.newsPage = 1;
  setMenu(false); ACTIONS.closeArticle(); render(); window.scrollTo(0, 0);
});
Bridge.on("share", ({ text }) => {
  const m = (text || "").match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (!m) { toast("Teks yang dibagikan tidak berisi link YouTube."); return; }
  if (state.page !== "transcribe") go("transcribe");
  setTimeout(() => startTranscribe(m[0]), 60);
});

// ====================================================================== mulai
(function boot() {
  const h = parseHash();
  state.page = h.page; state.game = h.page === "games" ? h.sub : null;
  render();
  if (NATIVE_RADIO && typeof Native.radioSync === "function") Native.radioSync();
  // Siapkan data di latar belakang: manifest + berita utama, agar menu terasa instan.
  Cloud.get("manifest").then((m) => { Cloud.manifest = m; if (state.page === "home") softRender(); }).catch(() => {});
  setTimeout(() => { ["knowledge", "utama"].forEach((n) => Cloud.get(n).then(() => { if (state.page === "home" && n === "knowledge") softRender(); }).catch(() => {})); loadModel(); }, 400);
  const splash = $("splash");
  setTimeout(() => splash && splash.classList.add("out"), 650);
  setTimeout(() => splash && splash.remove(), 1200);
})();
