// SiLengkap — antarmuka utama. Semua data diolah oleh server RheusInterface (wajib online),
// kecuali menu Gim yang berjalan offline di perangkat.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

const Platform = {
  open(url) { if (isApp) Native.openUrl(url); else window.open(url, "_blank", "noopener"); },
  copy(text) {
    if (isApp) { Native.copy(text); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast("Tersalin"), () => toast("Gagal menyalin"));
  },
  share(title, text) {
    if (isApp) { Native.share(title, text); return; }
    if (navigator.share) navigator.share({ title, text }).catch(() => {}); else Platform.copy(text);
  },
};

// ====================================================================== RheusInterface API
const DEFAULT_RHEUS = (window.SILENGKAP_CONFIG && window.SILENGKAP_CONFIG.rheusUrl) || "https://silengkap-rheus.onrender.com";
const Rheus = {
  base() { return store.get("rheus-url", DEFAULT_RHEUS).replace(/\/+$/, ""); },
  async req(path, opts = {}) {
    if (navigator.onLine === false) throw new Error("Tidak ada koneksi internet. SiLengkap butuh internet untuk menu ini (kecuali Gim).");
    let r;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), opts.timeout || 90000);
    try {
      r = await fetch(this.base() + path, { ...opts, signal: ctrl.signal, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    } catch (e) {
      throw new Error(e.name === "AbortError"
        ? "RheusInterface terlalu lama merespons (server gratis mungkin sedang bangun dari tidur — coba lagi sebentar)."
        : "Tidak bisa terhubung ke server RheusInterface. Periksa internet atau alamat server di Pengaturan.");
    } finally { clearTimeout(to); }
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error((data && data.detail) || `RheusInterface membalas HTTP ${r.status}.`);
    return data;
  },
  get(path) { return this.req(path); },
  post(path, body) { return this.req(path, { method: "POST", body: JSON.stringify(body) }); },
};

// ====================================================================== menu & state
const MENU = [
  { id: "transcribe", label: "Transkripsi Video", desc: "Link YouTube → transkrip rapi & ringkasan", icon: "ph-file-video" },
  { id: "crypto", label: "Berita Kripto Hari Ini", desc: "Headline & berita pasar kripto", icon: "ph-currency-btc" },
  { id: "btc", label: "Prediksi Arah Bitcoin", desc: "Harga, arah, dan probabilitas", icon: "ph-chart-line-up" },
  { id: "utama", label: "Berita Utama", desc: "Nasional & internasional", icon: "ph-newspaper" },
  { id: "viral", label: "Berita Viral", desc: "Per media sosial & kategori", icon: "ph-trend-up" },
  { id: "radio", label: "Radio", desc: "Stasiun radio gratis", icon: "ph-radio" },
  { id: "games", label: "Gim", desc: "Dino, Ular Tangga, Sudoku, Minesweeper", icon: "ph-game-controller" },
];
const GAMES = [
  { id: "dino", label: "Gim Dino", desc: "Lompat, hindari kaktus", icon: "ph-person-simple-run" },
  { id: "snakes", label: "Ular Tangga", desc: "Lawan komputer atau 2–4 pemain", icon: "ph-dice-five" },
  { id: "sudoku", label: "Sudoku", desc: "Mudah, sedang, sulit", icon: "ph-grid-nine" },
  { id: "minesweeper", label: "Minesweeper", desc: "Temukan semua ranjau", icon: "ph-bomb" },
];

const state = {
  page: "home", game: null, gameInst: null, newsPage: 1,
  data: {},       // kunci → {status, data, error}
  t: { url: "", status: "idle", stage: "", pct: 0, data: null, error: null, ytError: false, view: "rapi" },
  btcTf: "24j",
  utama: { tab: "nasional", cat: "all" },
  viral: { region: store.get("viral-region", "id"), platform: "all", cat: "all" },
  radio: { region: store.get("radio-region", "id"), q: "", playing: null, status: "idle" },
  ask: { q: "", status: "idle", data: null, error: null },
  best: +store.get("silengkap-dino-best", 0) || 0,
};

function go(page, sub) { location.hash = page === "home" ? "" : "#/" + page + (sub ? "/" + sub : ""); }
function parseHash() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/) || [];
  const page = MENU.some((x) => x.id === m[1]) ? m[1] : "home";
  return { page, sub: m[2] || null };
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function setMenu(open) { $("drawer").classList.toggle("open", open); $("scrim").classList.toggle("open", open); }

/** Ambil data dari Rheus satu kali per kunci; render ulang saat selesai. */
function load(key, path, force = false) {
  const d = state.data[key] || (state.data[key] = { status: "idle" });
  if (!force && (d.status === "loading" || d.status === "done")) return d;
  d.status = "loading";
  Rheus.get(path + (force ? (path.includes("?") ? "&" : "?") + "refresh=1" : "")).then(
    (data) => { Object.assign(d, { status: "done", data, error: null }); render(); },
    (e) => { Object.assign(d, { status: d.data ? "done" : "error", error: e.message }); if (d.data) toast(e.message); render(); },
  );
  return d;
}

// ====================================================================== render
function renderChrome() {
  const cur = MENU.find((m) => m.id === state.page);
  const tag = $("curTag");
  tag.classList.toggle("hidden", !cur);
  if (cur) tag.innerHTML = `<i class="ph ${cur.icon}"></i>${esc(cur.label)}`;
  $("drawerItems").innerHTML = MENU.map((m) => `
    <button class="drawer-item ${m.id === state.page ? "active" : ""}" data-go="${m.id}">
      <i class="ph ${m.icon}"></i>
      <span style="display:flex;flex-direction:column"><span style="font-size:14px;font-weight:500">${esc(m.label)}</span><span class="text-muted" style="font-size:12px">${esc(m.desc)}</span></span>
    </button>`).join("");
}

function render() {
  renderChrome();
  const v = $("view");
  if (state.page !== "games" || !state.game) { if (state.gameInst) { state.gameInst.destroy(); state.gameInst = null; } }
  switch (state.page) {
    case "transcribe": v.innerHTML = viewTranscribe(); break;
    case "crypto": v.innerHTML = viewKripto(); break;
    case "btc": v.innerHTML = viewBtc(); break;
    case "utama": v.innerHTML = viewUtama(); break;
    case "viral": v.innerHTML = viewViral(); break;
    case "radio": v.innerHTML = viewRadio(); break;
    case "games": if (!state.gameInst) { v.innerHTML = viewGames(); mountGame(); } break;
    default: v.innerHTML = viewHome();
  }
  renderPlayer();
}

const loadingCard = (msg) => `<p class="text-muted" style="margin:0;font-size:13px"><i class="ph ph-circle-notch" style="animation:slspin 1s linear infinite"></i> ${esc(msg)}</p>`;
function errorCard(msg, action, arg = "") {
  return `<div class="card elev-sm" style="padding:16px;gap:10px;max-width:760px">
    <div style="display:flex;gap:10px;align-items:flex-start"><i class="ph ph-wifi-slash" style="color:var(--color-accent-300);font-size:20px"></i><span style="font-size:14px;text-wrap:pretty">${esc(msg)}</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-action="${action}" data-arg="${esc(arg)}"><i class="ph ph-arrows-clockwise"></i>Coba lagi</button>
    <button class="btn btn-ghost" data-action="openSettings"><i class="ph ph-gear"></i>Pengaturan server</button></div>
  </div>`;
}
const skeletonNews = () => `
  <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
    ${[0, 1, 2].map(() => `<div class="card elev-md" style="min-height:170px;gap:12px"><div class="skeleton" style="height:20px;width:30%"></div><div class="skeleton" style="height:18px"></div><div class="skeleton" style="height:18px;width:80%"></div><div class="skeleton" style="height:12px;width:40%;margin-top:auto"></div></div>`).join("")}
  </div>`;
function agoText(ts) {
  const m = Math.round((Date.now() / 1000 - ts) / 60);
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : `${Math.round(m / 60)} jam lalu`;
}
function chips(name, items, active) {
  return `<div class="chips" role="radiogroup">${items.map((it) => `<button class="chip ${it.id === active ? "on" : ""}" data-chip="${name}" data-val="${esc(it.id)}">${it.icon ? `<i class="ph ${it.icon}"></i>` : ""}${esc(it.label)}${it.count !== undefined ? `<span class="chip-n">${it.count}</span>` : ""}</button>`).join("")}</div>`;
}

// ---------------------------------------------------------------------- beranda + Tanya Rheus
function viewHome() {
  const a = state.ask;
  return `
  <section style="display:flex;flex-direction:column;gap:28px;padding-top:5vh">
    <div style="display:flex;flex-direction:column;gap:18px;max-width:620px">
      <span class="logo-lg">SL</span>
      <h1 style="font-size:clamp(34px,6vw,52px);margin:0">SiLengkap</h1>
      <p class="text-muted" style="font-size:16px;margin:0;text-wrap:pretty">Transkripsi video, berita, analisa Bitcoin, radio, dan gim dalam satu aplikasi. Buka menu di kanan atas untuk mulai.</p>
      <div><button class="btn btn-primary" data-action="openMenu"><i class="ph ph-list"></i>Buka menu</button></div>
    </div>
    <div class="card elev-md" style="max-width:760px;gap:12px;background:linear-gradient(160deg, var(--color-accent-900), var(--color-surface) 70%)">
      <div style="display:flex;align-items:center;gap:8px"><i class="ph ph-sparkle" style="color:var(--color-accent);font-size:18px"></i><span class="card-kicker">Tanya Rheus</span><span class="card-meta" style="margin-left:auto">prototipe · berbasis pencarian</span></div>
      <form id="askForm" style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="askQ" class="input" style="flex:1;min-width:200px" placeholder="Contoh: berapa harga bitcoin? / berita viral makanan" value="${esc(a.q)}" autocomplete="off">
        <button class="btn btn-primary" type="submit" ${a.status === "loading" ? "disabled" : ""}><i class="ph ph-paper-plane-tilt"></i>Tanya</button>
      </form>
      ${a.status === "loading" ? loadingCard("Rheus sedang mencari…") : ""}
      ${a.status === "error" ? `<p class="card-body">${esc(a.error)}</p>` : ""}
      ${a.data ? `<p class="card-body" style="color:var(--color-text);font-size:15px">${esc(a.data.answer)}</p>
        ${a.data.sources.length ? `<div style="display:flex;flex-direction:column;gap:6px">${a.data.sources.map((s) => `<a href="#" data-open="${esc(s.link)}" class="card-meta" style="color:var(--color-accent-300)"><i class="ph ph-link"></i>${esc(s.title)} · ${esc(s.source)}</a>`).join("")}</div>` : ""}` : ""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-width:900px">
      ${MENU.map((m) => `<button class="card elev-sm menu-card hoverable" data-go="${m.id}"><i class="ph ${m.icon}"></i><span style="font-size:14px">${esc(m.label)}</span></button>`).join("")}
    </div>
  </section>`;
}
async function ask(q) {
  const a = state.ask;
  a.q = q;
  if (!q.trim()) return;
  Object.assign(a, { status: "loading", error: null });
  render();
  try { a.data = await Rheus.get("/v1/ask?q=" + encodeURIComponent(q)); a.status = "done"; }
  catch (e) { Object.assign(a, { status: "error", error: e.message }); }
  render();
}

// ---------------------------------------------------------------------- transkripsi
const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;
const fmtTime = (sec) => { sec = Math.floor(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };

function viewTranscribe() {
  const t = state.t, d = t.data;
  const tb = d && d.transcriptbot, sum = tb && tb.summary;
  const paragraphs = !d ? [] : t.view === "rapi" ? tb.clean.paragraphs : groupSegments(d.segments);
  return `
  <section class="section">
    <div><h2 style="margin:0 0 6px">Transkripsi Video</h2><p class="text-muted" style="margin:0">Tempel link YouTube, lalu SiLengkap membuat transkripsi lengkap yang rapi dan ringkasannya.</p></div>
    <div class="card elev-sm" style="padding:16px;gap:10px;max-width:760px">
      <div class="field"><label for="yt">Link YouTube</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div style="position:relative;flex:1;min-width:220px">
            <i class="ph ph-youtube-logo" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--color-neutral-500);font-size:17px"></i>
            <input id="yt" class="input" style="padding-left:34px" type="url" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=..." value="${esc(t.url)}">
          </div>
          <button id="ytGo" class="btn btn-primary" data-action="startTranscribe" ${!t.url.trim() || t.status === "loading" ? "disabled" : ""}><i class="ph ph-waveform"></i>Proses</button>
        </div>
      </div>
      ${t.ytError ? `<span style="font-size:12px;color:var(--color-accent-300)">Masukkan link YouTube yang valid (youtube.com atau youtu.be).</span>` : ""}
      <div style="display:flex;gap:8px;align-items:center;font-size:12px" class="text-muted"><span>Contoh:</span><button class="btn btn-ghost" style="font-size:12px" data-action="useSample">youtu.be/dQw4w9WgXcQ</button></div>
    </div>
    ${t.status === "loading" ? `
    <div class="card elev-sm" style="padding:16px;max-width:760px;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;font-size:14px"><i class="ph ph-circle-notch" style="animation:slspin 1s linear infinite;color:var(--color-accent)"></i>${esc(t.stage)}<span class="text-muted" style="margin-left:auto">${t.pct}%</span></div>
      <div style="height:4px;border-radius:4px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;background:var(--color-accent);width:${t.pct}%;transition:width .3s"></div></div>
    </div>` : ""}
    ${t.status === "error" ? errorCard(t.error, "startTranscribe") : ""}
    ${d ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;align-items:start">
      <div class="card elev-sm" style="padding:16px;gap:12px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="card-kicker">Transkripsi lengkap</span>
          <div class="seg" style="margin-left:auto"><label class="seg-opt ${t.view === "rapi" ? "on" : ""}"><input type="radio" name="tview" value="rapi">Rapi</label><label class="seg-opt ${t.view === "asli" ? "on" : ""}"><input type="radio" name="tview" value="asli">Asli</label></div>
          <button class="btn btn-ghost btn-icon" data-action="copyTranscript" aria-label="Salin transkrip"><i class="ph ph-copy"></i></button></div>
        <span class="card-meta">${esc(fmtTime(d.duration))} · ${esc(langLabel(d))} · ${t.view === "rapi" ? `dirapikan TranscriptBot ${esc(tb.version)}` : "subtitle asli YouTube"}</span>
        <div style="display:flex;flex-direction:column;gap:14px;max-height:520px;overflow:auto;padding-right:4px">
          ${paragraphs.map((g) => `<div style="display:grid;grid-template-columns:48px 1fr;gap:10px;font-size:14px;line-height:1.65">
              <button class="ts-link" data-seek="${Math.floor(g.start)}">${fmtTime(g.start)}</button><span style="text-wrap:pretty">${esc(g.text)}</span></div>`).join("")}
        </div>
      </div>
      <div class="card elev-md" style="padding:16px;gap:12px">
        <div style="display:flex;align-items:center;gap:8px"><span class="card-kicker">Ringkasan</span>
          <button class="btn btn-ghost" data-action="copySummary" style="font-size:12px;margin-left:auto"><i class="ph ph-copy"></i>Salin</button>
          <button class="btn btn-ghost btn-icon" data-action="shareSummary" aria-label="Bagikan"><i class="ph ph-share-network"></i></button></div>
        <div class="card-title">${esc(d.title || "Video YouTube")}</div>
        <p class="card-body" style="font-size:14px;text-wrap:pretty">${esc(sum.short)}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${sum.points.concat(sum.details).map((p) => `<div style="display:flex;gap:10px;font-size:14px"><i class="ph ph-check" style="color:var(--color-accent);padding-top:3px"></i>
            <span>${p.label ? `<b style="font-weight:500">${esc(p.label)}:</b> ` : ""}${esc(p.text)} <button class="ts-link" style="display:inline;padding:0 0 0 4px" data-seek="${Math.floor(p.start)}">${fmtTime(p.start)}</button></span></div>`).join("")}
        </div>
        ${sum.conclusion && !sum.isList ? `<p class="card-body" style="font-size:14px"><b style="color:var(--color-text);font-weight:500">Kesimpulan:</b> ${esc(sum.conclusion)}</p>` : ""}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${sum.keywords.slice(0, 5).map((k, i) => `<span class="tag ${i === 0 ? "tag-accent" : "tag-neutral"}">${esc(k)}</span>`).join("")}</div>
        <span class="card-meta"><i class="ph ph-cpu"></i>TranscriptBot ${esc(tb.version)} di RheusInterface · ${esc(d.processMs)} ms</span>
      </div>
    </div>` : ""}
  </section>`;
}
function groupSegments(segs) {
  const out = [];
  let cur = null;
  for (const s of segs || []) {
    if (!cur || s.start - cur.start > 25) { cur = { start: s.start, text: s.text }; out.push(cur); } else cur.text += " " + s.text;
  }
  return out;
}
const langLabel = (d) => d.source === "terjemahan" ? "Terjemahan ke Indonesia" : (d.language === "id" || d.language === "in") ? "Bahasa Indonesia" : `Bahasa ${String(d.language || "").toUpperCase()}`;

async function startTranscribe() {
  const t = state.t, url = t.url.trim();
  if (!YT_RE.test(url)) { t.ytError = true; render(); return; }
  Object.assign(t, { ytError: false, status: "loading", stage: "Menghubungi RheusInterface…", pct: 8, error: null, data: null });
  render();
  const stage = (s, p) => { t.stage = s; t.pct = p; if (state.page === "transcribe") render(); };
  try {
    let data;
    if (isApp) {
      // Di HP, subtitle diambil langsung dari YouTube (tidak diblokir), lalu dirapikan Rheus.
      stage("Mengambil subtitle dari YouTube…", 25);
      const raw = JSON.parse(await Bridge.call("getTranscript", url));
      stage("TranscriptBot merapikan transkrip & meringkas…", 65);
      data = await Rheus.post("/v1/transcript/process", raw);
    } else {
      stage("RheusInterface mengambil subtitle & TranscriptBot merapikan…", 45);
      data = await Rheus.post("/v1/transcript", { url });
    }
    Object.assign(t, { status: "done", data, pct: 100 });
  } catch (e) {
    Object.assign(t, { status: "error", error: e.message });
  }
  if (state.page === "transcribe") render();
}
function summaryText(d) { return [d.title || "Video YouTube", `https://www.youtube.com/watch?v=${d.video_id}`, "", d.transcriptbot.markdown].join("\n"); }

// ---------------------------------------------------------------------- berita (umum)
const PER_PAGE = 6;
function newsHead(title, sub, d, refreshAction) {
  return `<div class="head-row">
    <div style="margin-right:auto"><h2>${esc(title)}</h2><p class="text-muted">${esc(sub)}</p></div>
    ${d && d.data ? `<span class="card-meta"><i class="ph ph-clock"></i>Diperbarui ${esc(agoText(d.data.updatedAt))}${d.data.stale ? " · data lama" : ""}</span>` : ""}
    <button class="btn btn-ghost btn-icon" data-action="${refreshAction}" aria-label="Perbarui"><i class="ph ph-arrows-clockwise" style="${d && d.status === "loading" ? "animation:slspin 1s linear infinite" : ""}"></i></button>
  </div>`;
}
function storyTags(s) {
  const t = [];
  if (s.categoryLabel && s.category !== "lainnya") t.push(`<span class="tag tag-neutral">${esc(s.categoryLabel)}</span>`);
  (s.platformLabels || []).forEach((p) => t.push(`<span class="tag tag-outline">${esc(p)}</span>`));
  return t.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${t.join("")}</div>` : "";
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
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ph-fill ph-fire" style="color:var(--color-accent)"></i><h6 style="margin:0">Headline hot</h6></div>
      ${hot.length ? `<div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
        ${hot.map((h, i) => `<button class="card elev-md hot-card hoverable" data-article="hot:${i}">
            <div style="display:flex;gap:6px;align-items:center"><span class="tag tag-outline">HOT #${i + 1}</span><span class="card-meta" style="margin-left:auto">${esc(h.time)}</span></div>
            <div class="card-title" style="font-size:18px;text-wrap:pretty">${esc(h.title)}</div>
            <p class="card-body" style="text-wrap:pretty">${esc(h.excerpt)}</p>
            ${storyTags(h)}
            <span class="card-meta" style="margin-top:auto">${esc(h.source)}${h.sources.length > 1 ? ` +${h.sources.length - 1} sumber` : ""}</span>
          </button>`).join("")}</div>` : `<p class="text-muted">Belum ada berita untuk pilihan ini.</p>`}
    </div>
    <div>
      <h6 style="margin:0 0 6px">Berita terbaru</h6>
      <div style="display:flex;flex-direction:column">
        ${items.map((a, i) => `<button class="news-row" data-article="list:${(state.newsPage - 1) * PER_PAGE + i}">
            <span style="font-size:16px;font-weight:500;text-wrap:pretty">${esc(a.title)}</span>
            <span class="card-meta" style="white-space:nowrap">${esc(a.time)}</span>
            ${a.excerpt ? `<span class="text-muted" style="font-size:13px;text-wrap:pretty">${esc(a.excerpt)}</span>` : "<span></span>"}
            <span class="card-meta" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${esc(a.source)}${a.categoryLabel && a.category !== "lainnya" ? ` · ${esc(a.categoryLabel)}` : ""}${(a.platformLabels || []).length ? ` · ${esc(a.platformLabels.join(", "))}` : ""}</span>
          </button>`).join("") || `<p class="text-muted">Belum ada berita lain.</p>`}
      </div>
      ${pageCount > 1 ? `<div style="display:flex;align-items:center;gap:6px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage - 1}" ${state.newsPage === 1 ? "disabled" : ""} aria-label="Sebelumnya"><i class="ph ph-caret-left"></i></button>
        ${pages.map((p) => `<button class="btn ${p === state.newsPage ? "btn-primary" : "btn-secondary"} btn-icon" data-page="${p}">${p}</button>`).join("")}
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage + 1}" ${state.newsPage === pageCount ? "disabled" : ""} aria-label="Berikutnya"><i class="ph ph-caret-right"></i></button>
        <span class="card-meta" style="margin-left:8px">Halaman ${state.newsPage} dari ${pageCount}</span></div>` : ""}
    </div>`;
}
function openArticle(ref, catLabel) {
  const [kind, idx] = ref.split(":");
  const a = (state.articles || {})[kind] && state.articles[kind][+idx];
  if (!a) return;
  state.article = a;
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle">
      <div class="dialog" role="dialog" aria-modal="true" style="width:min(600px,100%);max-height:85vh;overflow:auto" data-stop>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag tag-accent">${esc(a.categoryLabel && a.category !== "lainnya" ? a.categoryLabel : catLabel)}</span><span class="card-meta">${esc(a.source)} · ${esc(a.time)}</span>
          <button class="btn btn-ghost btn-icon" style="margin-left:auto" data-action="closeArticle" aria-label="Tutup"><i class="ph ph-x" style="color:var(--color-text)"></i></button></div>
        <div class="dialog-title" style="font-size:24px;line-height:1.2;text-wrap:pretty">${esc(a.title)}</div>
        <div class="dialog-body" style="font-size:15px;text-wrap:pretty">
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
          ${storyTags(a)}
          <p style="margin-top:10px"><i class="ph ph-cpu" style="color:var(--color-accent)"></i> ${esc(a.explain || "")}</p>
          ${a.sources.length > 1 ? `<p><b style="color:var(--color-text);font-weight:500">Sumber:</b> ${a.sources.map(esc).join(", ")}</p>` : ""}
          ${a.related.length ? `<p style="margin-bottom:4px"><b style="color:var(--color-text);font-weight:500">Liputan terkait</b></p>
            <ul style="margin:0;padding-left:18px">${a.related.map((r) => `<li><a href="#" data-open="${esc(r.link)}">${esc(r.title)}</a> <span class="card-meta">${esc(r.source)}</span></li>`).join("")}</ul>` : ""}
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" data-action="closeArticle">Tutup</button>
          <button class="btn btn-secondary" data-open="${esc(a.link)}"><i class="ph ph-arrow-square-out"></i>Baca di sumber</button>
          <button class="btn btn-primary" data-action="shareArticle"><i class="ph ph-share-network"></i>Bagikan</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------- berita kripto
function viewKripto() {
  const d = load("kripto", "/v1/news/kripto");
  const head = newsHead("Berita Kripto Hari Ini", "Rangkuman pasar aset digital dari berbagai sumber & forum.", d, "refreshKripto");
  if (d.status === "error") return `<section class="section">${head}${errorCard(d.error, "refreshKripto")}</section>`;
  if (!d.data) return `<section class="section">${head}${skeletonNews()}${loadingCard("RheusInterface mengumpulkan berita kripto…")}</section>`;
  return `<section class="section">${head}${newsBlocks(d.data.hot, d.data.list)}</section>`;
}

// ---------------------------------------------------------------------- berita utama
function viewUtama() {
  const d = load("utama", "/v1/news/utama");
  const u = state.utama;
  const head = newsHead("Berita Utama", u.tab === "nasional" ? "Peristiwa penting di Indonesia hari ini." : "Militer, ekonomi, hubungan antarnegara, dan geopolitik dunia.", d, "refreshUtama");
  const tabs = `<div class="seg" role="tablist">${[["nasional", "Nasional", "ph-flag"], ["internasional", "Internasional", "ph-globe-hemisphere-east"]].map(([k, l, ic]) =>
    `<label class="seg-opt ${u.tab === k ? "on" : ""}"><input type="radio" name="utab" value="${k}"><i class="ph ${ic}"></i> ${l}</label>`).join("")}</div>`;
  if (d.status === "error") return `<section class="section">${head}${tabs}${errorCard(d.error, "refreshUtama")}</section>`;
  if (!d.data) return `<section class="section">${head}${tabs}${skeletonNews()}${loadingCard("RheusInterface mengumpulkan & mengelompokkan berita…")}</section>`;
  const sec = d.data.sections[u.tab];
  let hot = sec.hot, list = sec.list;
  let filter = "";
  if (u.tab === "internasional") {
    const all = hot.concat(list);
    const counts = {};
    all.forEach((s) => (counts[s.category] = (counts[s.category] || 0) + 1));
    const icons = { militer: "ph-shield-star", ekonomi: "ph-chart-bar", diplomasi: "ph-handshake", geopolitik: "ph-globe-stand", lainnya: "ph-dots-three" };
    filter = chips("ucat", [{ id: "all", label: "Semua", count: all.length }, ...d.data.categories.map((c) => ({ id: c.id, label: c.label, icon: icons[c.id], count: counts[c.id] || 0 }))], u.cat);
    if (u.cat !== "all") {
      const f = all.filter((s) => s.category === u.cat).sort((a, b) => b.score - a.score);
      hot = f.slice(0, 3);
      list = f.slice(3).sort((a, b) => b.ts - a.ts);
    }
  }
  return `<section class="section">${head}<div style="display:flex;flex-direction:column;gap:12px">${tabs}${filter}</div>${newsBlocks(hot, list)}</section>`;
}

// ---------------------------------------------------------------------- berita viral
const PLATFORM_ICON = { tiktok: "ph-tiktok-logo", instagram: "ph-instagram-logo", x: "ph-x-logo", youtube: "ph-youtube-logo", facebook: "ph-facebook-logo" };
const CAT_ICON = { makanan: "ph-hamburger", selebriti: "ph-star", dance: "ph-music-notes", hewan: "ph-paw-print", olahraga: "ph-soccer-ball", teknologi: "ph-device-mobile", sosial: "ph-users-three", lainnya: "ph-dots-three" };
function viewViral() {
  const v = state.viral;
  const key = "viral:" + v.region;
  const d = load(key, "/v1/news/viral?region=" + v.region);
  const head = newsHead("Berita Viral", "Yang sedang ramai di media sosial — per platform & kategori.", d, "refreshViral");
  const region = `<div class="seg" role="radiogroup" aria-label="Region">${[["id", "🇮🇩 Indonesia"], ["us", "🇺🇸 USA"]].map(([k, l]) =>
    `<label class="seg-opt ${v.region === k ? "on" : ""}"><input type="radio" name="vregion" value="${k}">${l}</label>`).join("")}</div>`;
  if (d.status === "error") return `<section class="section">${head}${region}${errorCard(d.error, "refreshViral")}</section>`;
  if (!d.data) return `<section class="section">${head}${region}${skeletonNews()}${loadingCard("RheusInterface menelusuri media sosial & forum…")}</section>`;
  const all = d.data.hot.concat(d.data.list);
  const f = all.filter((s) => (v.platform === "all" || s.platforms.includes(v.platform)) && (v.cat === "all" || s.category === v.cat));
  const filtered = v.platform !== "all" || v.cat !== "all";
  const hot = filtered ? f.slice().sort((a, b) => b.score - a.score).slice(0, 3) : d.data.hot;
  const hotSet = new Set(hot);
  const list = (filtered ? f : d.data.list).filter((s) => !hotSet.has(s)).sort((a, b) => b.ts - a.ts);
  const pcount = (id) => all.filter((s) => s.platforms.includes(id)).length;
  const ccount = (id) => all.filter((s) => s.category === id && (v.platform === "all" || s.platforms.includes(v.platform))).length;
  return `<section class="section">${head}
    <div style="display:flex;flex-direction:column;gap:10px">${region}
      <span class="card-meta">Media sosial</span>
      ${chips("vplat", [{ id: "all", label: "Semua", count: all.length }, ...d.data.platforms.map((p) => ({ id: p.id, label: p.label, icon: PLATFORM_ICON[p.id], count: pcount(p.id) }))], v.platform)}
      <span class="card-meta">Kategori</span>
      ${chips("vcat", [{ id: "all", label: "Semua" }, ...d.data.categories.filter((c) => c.id !== "lainnya" || ccount(c.id)).map((c) => ({ id: c.id, label: c.label, icon: CAT_ICON[c.id], count: ccount(c.id) }))], v.cat)}
    </div>
    ${newsBlocks(hot, list)}</section>`;
}

// ---------------------------------------------------------------------- bitcoin
const fmtUsd = (x) => Number.isFinite(x) ? "US$" + Math.round(x).toLocaleString("id-ID") : "—";
function fmtIdr(x) {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e12) return "Rp" + (x / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " T";
  if (x >= 1e9) return "Rp" + (x / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  return "Rp" + Math.round(x).toLocaleString("id-ID");
}
function fmtBig(x) {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e9) return "US$" + (x / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
  return "US$" + (x / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
}
const pct = (x) => Math.round(x * 100) + "%";
const signed = (x) => (x >= 0 ? "+" : "") + x.toLocaleString("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
function chartPaths(series) {
  const n = series.length, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
  const line = series.map((v, i) => `${((i * 600) / Math.max(1, n - 1)).toFixed(1)},${(150 - ((v - min) / span) * 135).toFixed(1)}`).join(" ");
  return { line, area: "M0,160 L" + line.replace(/ /g, " L") + " L600,160 Z" };
}
function viewBtc() {
  const tf = state.btcTf;
  const d = load("btc:" + tf, "/v1/btc?tf=" + tf);
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const head = `<div class="head-row">
      <div style="margin-right:auto"><h2>Prediksi Arah Bitcoin</h2><p class="text-muted">Analisa hari ini, ${esc(today)}${d.data ? ` · diperbarui ${esc(agoText(d.data.updatedAt))}` : ""}</p></div>
      <div class="seg" role="radiogroup" aria-label="Rentang waktu">${["24j", "7h", "30h"].map((k) => `<label class="seg-opt ${k === tf ? "on" : ""}"><input type="radio" name="tf" value="${k}">${k}</label>`).join("")}</div>
    </div>`;
  if (d.status === "error") return `<section class="section" style="gap:18px">${head}${errorCard(d.error, "reloadBtc")}</section>`;
  if (!d.data) return `<section class="section" style="gap:18px">${head}<div class="card elev-md" style="padding:18px;gap:14px"><div class="skeleton" style="height:14px;width:90px"></div><div class="skeleton" style="height:40px;width:240px"></div><div class="skeleton" style="height:160px"></div></div>${loadingCard("RheusInterface menghitung indikator & uji balik…")}</section>`;
  const b = d.data, m = b.model, mk = b.market;
  const dir = { up: ["ph-arrow-up-right", "Cenderung naik"], down: ["ph-arrow-down-right", "Cenderung turun"], side: ["ph-arrows-left-right", "Cenderung sideways"] }[m.direction];
  const invalid = m.direction === "up" ? `Penutupan di bawah support ${fmtUsd(b.support)} akan membatalkan skenario ini.` : m.direction === "down" ? `Penutupan di atas resistance ${fmtUsd(b.resistance)} akan membatalkan skenario ini.` : "Tembusnya support atau resistance akan menentukan arah berikutnya.";
  const ch = chartPaths(b.series), up = b.change >= 0, sk = m.skill;
  const market = [
    ["Fear & Greed", mk.fng ? mk.fng.value : "—", mk.fng ? mk.fng.label : "Tidak tersedia"],
    ["Volume 24j", fmtBig(mk.volume24h), "CoinGecko"],
    ["Dominasi BTC", mk.dominance ? mk.dominance.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%" : "—", mk.dominance ? (mk.dominance > 55 ? "Tinggi" : "Sedang") : "Tidak tersedia"],
    ["Funding rate", mk.funding !== null ? (mk.funding >= 0 ? "+" : "") + (mk.funding * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 }) + "%" : "—", mk.funding === null ? "Tidak tersedia" : mk.funding > 0.0002 ? "Long ramai" : mk.funding < 0 ? "Short ramai" : "Netral"],
    ["RSI (14)", Number.isFinite(mk.rsi) ? mk.rsi.toFixed(0) : "—", mk.rsi > 70 ? "Jenuh beli" : mk.rsi < 30 ? "Jenuh jual" : "Netral"],
    ["Volatilitas 30h", mk.vol30.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%", mk.vol30 > 15 ? "Tinggi" : mk.vol30 > 8 ? "Sedang" : "Rendah"],
  ];
  return `<section class="section" style="gap:18px">${head}
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px">
      <div class="card elev-md" style="padding:18px;gap:10px;grid-column:1/-1">
        <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end">
          <div style="display:flex;flex-direction:column;gap:4px"><span class="card-kicker">BTC / USD</span>
            <span class="num" style="font-size:clamp(32px,5vw,44px);font-weight:500;letter-spacing:-0.02em">${fmtUsd(b.price)}</span>
            <span style="font-size:14px" class="${up ? "up" : "down"}"><i class="ph ${up ? "ph-trend-up" : "ph-trend-down"}"></i> ${signed(b.change)} (${esc(tf)}) · ≈ ${fmtIdr(b.priceIdr)}</span></div>
          <div style="display:flex;gap:22px;margin-left:auto;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column"><span class="card-meta">Tertinggi ${esc(b.tfLabel)}</span><span class="num">${fmtUsd(b.high)}</span></div>
            <div style="display:flex;flex-direction:column"><span class="card-meta">Terendah ${esc(b.tfLabel)}</span><span class="num">${fmtUsd(b.low)}</span></div></div>
        </div>
        <svg viewBox="0 0 600 160" preserveAspectRatio="none" style="width:100%;height:160px;display:block" role="img" aria-label="Grafik harga ${esc(b.tfLabel)}">
          <defs><linearGradient id="btcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9184d9" stop-opacity="0.35"></stop><stop offset="1" stop-color="#9184d9" stop-opacity="0"></stop></linearGradient></defs>
          <path d="${ch.area}" fill="url(#btcg)"></path><polyline points="${ch.line}" fill="none" stroke="#9184d9" stroke-width="2" vector-effect="non-scaling-stroke"></polyline></svg>
      </div>
      <div class="card elev-sm" style="padding:18px;gap:12px"><span class="card-kicker">Arah pergerakan · ${esc(b.tfLabel)}</span>
        <div style="display:flex;align-items:center;gap:14px">
          <span style="width:56px;height:56px;border-radius:50%;border:1px solid var(--color-accent);display:grid;place-items:center;box-shadow:0 0 28px color-mix(in srgb, var(--color-accent) 35%, transparent)"><i class="ph ${dir[0]}" style="font-size:26px;color:var(--color-accent)"></i></span>
          <div><div style="font-size:24px;font-weight:500">${dir[1]}</div><div class="text-muted" style="font-size:13px">Target ${fmtUsd(m.target)} · keyakinan ${esc(m.confidence)}</div></div></div>
        <p class="card-body" style="text-wrap:pretty">Sinyal: ${esc(m.reasons.slice(0, 3).join(", "))}. ${m.context.length ? `Sentimen: ${esc(m.context.join(", "))}. ` : ""}${esc(invalid)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="stat"><span class="card-meta">Support</span><span class="num">${fmtUsd(b.support)}</span></div>
          <div class="stat"><span class="card-meta">Resistance</span><span class="num">${fmtUsd(b.resistance)}</span></div></div>
      </div>
      <div class="card elev-sm" style="padding:18px;gap:14px"><span class="card-kicker">Probabilitas</span>
        ${[["Naik", "ph-arrow-up-right", m.probs.up, "var(--color-accent)"], ["Sideways", "ph-arrows-left-right", m.probs.side, "var(--color-neutral-500)"], ["Turun", "ph-arrow-down-right", m.probs.down, "var(--color-neutral-700)"]].map(([l, ic, p, c]) => `
          <div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:8px;font-size:14px"><i class="ph ${ic}" style="color:var(--color-accent)"></i>${l}<span class="num" style="margin-left:auto;font-weight:500">${pct(p)}</span></div>
          <div style="height:6px;border-radius:6px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;border-radius:6px;background:${c};width:${(p * 100).toFixed(1)}%"></div></div></div>`).join("")}
        <span class="card-meta" style="line-height:1.5">Dari ${m.historyDays} hari dengan sinyal ${esc(m.signal)} serupa dalam ±2 tahun terakhir. Probabilitas adalah frekuensi historis, bukan jaminan.</span>
        <span class="card-meta" style="line-height:1.5"><i class="ph ph-flask"></i>Uji balik otomatis ${sk.days} hari: tebakan arah benar ${sk.accuracy === null ? "—" : pct(sk.accuracy)} dari ${sk.calls} kali. ${sk.skilled ? "Sedikit lebih baik dari tebakan dasar." : "Belum terbukti lebih baik dari tebakan dasar."}</span>
      </div>
      <div class="card elev-sm" style="padding:18px;gap:10px;grid-column:1/-1"><span class="card-kicker">Keadaan pasar</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">${market.map(([l, v, n]) => `<div class="stat"><span class="card-meta">${esc(l)}</span><span class="num" style="font-size:20px;font-weight:500">${esc(v)}</span><span style="font-size:12px;color:var(--color-accent-300)">${esc(n)}</span></div>`).join("")}</div>
        <span class="card-meta"><i class="ph ph-info"></i>Bukan saran keuangan. Uji balik menunjukkan arah harga Bitcoin hampir tidak bisa ditebak dari indikator teknikal — anggap ini gambaran statistik, bukan ramalan. Dihitung ${esc(b.computeMs)} ms di RheusInterface.</span>
      </div>
    </div></section>`;
}

// ---------------------------------------------------------------------- radio
const audio = new Audio();
audio.preload = "none";
audio.addEventListener("playing", () => { state.radio.status = "playing"; renderPlayer(); });
audio.addEventListener("waiting", () => { state.radio.status = "loading"; renderPlayer(); });
audio.addEventListener("pause", () => { if (state.radio.status !== "error") state.radio.status = "paused"; renderPlayer(); });
audio.addEventListener("error", () => { if (state.radio.playing) { state.radio.status = "error"; renderPlayer(); toast("Stasiun tidak bisa diputar. Coba stasiun lain."); } });

function playableHere(s) { return isApp || s.https || location.protocol === "http:"; }
function viewRadio() {
  const r = state.radio;
  const d = load("radio:" + r.region, "/v1/radio?region=" + r.region);
  const region = `<div class="seg" role="radiogroup">${[["id", "🇮🇩 Indonesia"], ["us", "🇺🇸 USA"]].map(([k, l]) => `<label class="seg-opt ${r.region === k ? "on" : ""}"><input type="radio" name="rregion" value="${k}">${l}</label>`).join("")}</div>`;
  const head = `<div class="head-row"><div style="margin-right:auto"><h2>Radio</h2><p class="text-muted">Stasiun radio gratis dari direktori terbuka Radio Browser.</p></div></div>`;
  if (d.status === "error") return `<section class="section">${head}${region}${errorCard(d.error, "reloadRadio")}</section>`;
  if (!d.data) return `<section class="section">${head}${region}${loadingCard("Memuat daftar stasiun…")}</section>`;
  const q = r.q.toLowerCase();
  const list = d.data.stations.filter((s) => !q || s.name.toLowerCase().includes(q) || s.tags.join(" ").includes(q) || (s.city || "").toLowerCase().includes(q));
  return `<section class="section" style="gap:16px">${head}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${region}
      <div style="position:relative;flex:1;min-width:200px"><i class="ph ph-magnifying-glass" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--color-neutral-500)"></i>
      <input id="radioQ" class="input" style="padding-left:32px" placeholder="Cari stasiun, kota, atau genre…" value="${esc(r.q)}"></div></div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:10px">
      ${list.map((s) => {
        const on = r.playing && r.playing.id === s.id;
        const can = playableHere(s);
        return `<button class="card elev-sm station ${on ? "on" : ""}" data-station="${esc(s.id)}" ${can ? "" : "disabled title=\"Hanya bisa diputar di aplikasi Android\""}>
          <span class="station-logo">${s.favicon ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="ph ph-radio"></i></span>
          <span style="display:flex;flex-direction:column;min-width:0;text-align:left"><span style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
          <span class="card-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc([s.city, ...s.tags.slice(0, 2)].filter(Boolean).join(" · ") || "Radio")}${s.bitrate ? ` · ${s.bitrate} kbps` : ""}</span></span>
          <i class="ph ${on && r.status === "playing" ? "ph-pause-circle" : "ph-play-circle"}" style="font-size:28px;color:var(--color-accent);margin-left:auto"></i>
        </button>`;
      }).join("") || `<p class="text-muted">Stasiun tidak ditemukan.</p>`}
    </div>
    ${!isApp ? `<span class="card-meta"><i class="ph ph-info"></i>Di versi web hanya stasiun dengan alamat aman (https) yang bisa diputar. Aplikasi Android bisa memutar semuanya.</span>` : ""}
  </section>`;
}
function playStation(id) {
  const d = state.data["radio:" + state.radio.region];
  const s = d && d.data && d.data.stations.find((x) => x.id === id);
  if (!s) return;
  const r = state.radio;
  if (r.playing && r.playing.id === id && r.status === "playing") { audio.pause(); return; }
  r.playing = s; r.status = "loading";
  audio.src = s.url;
  audio.play().catch(() => { r.status = "error"; renderPlayer(); });
  if ("mediaSession" in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: s.name, artist: "SiLengkap Radio" });
  render();
}
function renderPlayer() {
  const r = state.radio, el = $("player");
  if (!r.playing) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const st = { playing: "Sedang diputar", loading: "Menyambungkan…", paused: "Dijeda", error: "Gagal memutar" }[r.status] || "";
  el.innerHTML = `<i class="ph ph-radio" style="font-size:22px;color:var(--color-accent)"></i>
    <div style="min-width:0;flex:1"><div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.playing.name)}</div><div class="card-meta">${st}</div></div>
    <button class="btn btn-primary btn-icon" data-action="togglePlay" aria-label="${r.status === "playing" ? "Jeda" : "Putar"}"><i class="ph ${r.status === "playing" ? "ph-pause" : r.status === "loading" ? "ph-circle-notch" : "ph-play"}" ${r.status === "loading" ? 'style="animation:slspin 1s linear infinite"' : ""}></i></button>
    <button class="btn btn-ghost btn-icon" data-action="stopRadio" aria-label="Berhenti"><i class="ph ph-x"></i></button>`;
}

// ---------------------------------------------------------------------- gim
function viewGames() {
  const g = GAMES.find((x) => x.id === state.game);
  if (!g) {
    return `<section class="section"><div><h2 style="margin:0 0 6px">Gim</h2><p class="text-muted" style="margin:0">Semua gim bisa dimainkan tanpa internet.</p></div>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">
        ${GAMES.map((x) => `<button class="card elev-md hoverable game-card" data-game="${x.id}"><i class="ph ${x.icon}"></i><span class="card-title">${esc(x.label)}</span><span class="card-meta">${esc(x.desc)}</span></button>`).join("")}
      </div></section>`;
  }
  return `<section class="section" style="gap:14px"><div class="head-row"><button class="btn btn-secondary btn-icon" data-go="games" aria-label="Kembali"><i class="ph ph-caret-left"></i></button>
    <div style="margin-right:auto"><h2 style="margin:0">${esc(g.label)}</h2></div></div><div id="gameRoot"></div></section>`;
}
function mountGame() {
  const root = $("gameRoot");
  if (!root || !state.game) return;
  state.gameInst = window.SLGames[state.game].mount(root, {
    esc,
    getBest: () => state.best,
    setBest: (s) => { state.best = s; store.set("silengkap-dino-best", s); },
  });
}

// ---------------------------------------------------------------------- pengaturan
function openSettings() {
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle">
      <div class="dialog" role="dialog" aria-modal="true" style="width:min(520px,100%)" data-stop>
        <div class="dialog-title" style="font-size:20px">Pengaturan server</div>
        <div class="dialog-body" style="font-size:14px">
          <p>SiLengkap memakai server <b>RheusInterface</b> untuk semua menu kecuali Gim. Isi alamat server yang sudah kamu hosting (lihat README).</p>
          <div class="field"><label for="rheusUrl">Alamat RheusInterface</label><input id="rheusUrl" class="input" value="${esc(Rheus.base())}" placeholder="https://…" inputmode="url"></div>
          <p id="rheusTest" class="card-meta" style="margin-top:8px"></p>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-ghost" data-action="resetServer">Bawaan</button>
          <button class="btn btn-secondary" data-action="testServer"><i class="ph ph-plugs-connected"></i>Tes</button>
          <button class="btn btn-primary" data-action="saveServer">Simpan</button>
        </div>
      </div>
    </div>`;
}
async function testServer() {
  const out = $("rheusTest");
  const url = $("rheusUrl").value.trim().replace(/\/+$/, "");
  out.textContent = "Menghubungi…";
  try {
    const r = await fetch(url + "/v1/health");
    const j = await r.json();
    out.textContent = `✓ Terhubung — RheusInterface ${j.version}, TranscriptBot ${j.transcriptbot}.`;
  } catch { out.textContent = "✗ Tidak bisa terhubung ke alamat ini."; }
}

// ====================================================================== event
const ACTIONS = {
  openMenu: () => setMenu(true),
  closeMenu: () => setMenu(false),
  startTranscribe,
  useSample: () => { state.t.url = "https://youtu.be/dQw4w9WgXcQ"; state.t.ytError = false; render(); },
  copyTranscript: () => { const d = state.t.data; if (!d) return; Platform.copy(state.t.view === "rapi" ? d.transcriptbot.clean.paragraphs.map((p) => `[${fmtTime(p.start)}] ${p.text}`).join("\n\n") : d.segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`).join("\n")); },
  copySummary: () => state.t.data && Platform.copy(summaryText(state.t.data)),
  shareSummary: () => state.t.data && Platform.share(state.t.data.title || "Ringkasan video", summaryText(state.t.data)),
  refreshKripto: () => { load("kripto", "/v1/news/kripto", true); render(); },
  refreshUtama: () => { load("utama", "/v1/news/utama", true); render(); },
  refreshViral: () => { load("viral:" + state.viral.region, "/v1/news/viral?region=" + state.viral.region, true); render(); },
  reloadBtc: () => { delete state.data["btc:" + state.btcTf]; render(); },
  reloadRadio: () => { delete state.data["radio:" + state.radio.region]; render(); },
  closeArticle: () => { $("dialog").innerHTML = ""; state.article = null; },
  shareArticle: () => { const a = state.article; if (a) Platform.share(a.title, `${a.title}\n${a.link}`); },
  openSettings: () => { setMenu(false); openSettings(); },
  testServer,
  saveServer: () => { store.set("rheus-url", $("rheusUrl").value.trim()); state.data = {}; ACTIONS.closeArticle(); toast("Alamat server disimpan"); render(); },
  resetServer: () => { $("rheusUrl").value = DEFAULT_RHEUS; },
  togglePlay: () => { if (state.radio.status === "playing") audio.pause(); else { state.radio.status = "loading"; audio.play().catch(() => {}); renderPlayer(); } },
  stopRadio: () => { audio.pause(); audio.removeAttribute("src"); audio.load(); state.radio.playing = null; render(); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-action],[data-article],[data-page],[data-seek],[data-open],[data-stop],[data-chip],[data-station],[data-game]");
  if (!el) return;
  if (el.hasAttribute("data-stop") && !e.target.closest("[data-action],[data-open]")) return;
  if (el.dataset.go) { setMenu(false); go(el.dataset.go); return; }
  if (el.dataset.open !== undefined) { e.preventDefault(); if (el.dataset.open) Platform.open(el.dataset.open); return; }
  if (el.dataset.action && ACTIONS[el.dataset.action]) {
    if (el.classList.contains("dialog-backdrop") && e.target !== el) return;
    ACTIONS[el.dataset.action](); return;
  }
  if (el.dataset.article) {
    const cat = { crypto: "Kripto", utama: state.utama.tab === "nasional" ? "Nasional" : "Internasional", viral: "Viral" }[state.page] || "";
    openArticle(el.dataset.article, cat); return;
  }
  if (el.dataset.page) { state.newsPage = +el.dataset.page; render(); window.scrollTo(0, 0); return; }
  if (el.dataset.chip) {
    const v = el.dataset.val;
    if (el.dataset.chip === "ucat") state.utama.cat = v;
    if (el.dataset.chip === "vplat") state.viral.platform = v;
    if (el.dataset.chip === "vcat") state.viral.cat = v;
    state.newsPage = 1; render(); return;
  }
  if (el.dataset.station) { playStation(el.dataset.station); return; }
  if (el.dataset.game) { go("games", el.dataset.game); return; }
  if (el.dataset.seek && state.t.data) Platform.open(`https://www.youtube.com/watch?v=${state.t.data.video_id}&t=${el.dataset.seek}s`);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "yt") {
    state.t.url = e.target.value; state.t.ytError = false;
    const b = $("ytGo"); if (b) b.disabled = !state.t.url.trim() || state.t.status === "loading";
  }
  if (e.target.id === "radioQ") {
    state.radio.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const i = $("radioQ"); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
  }
  if (e.target.id === "askQ") state.ask.q = e.target.value;
});
document.addEventListener("change", (e) => {
  const n = e.target.name, v = e.target.value;
  if (n === "tf") { state.btcTf = v; render(); }
  if (n === "tview") { state.t.view = v; render(); }
  if (n === "utab") { state.utama.tab = v; state.utama.cat = "all"; state.newsPage = 1; render(); }
  if (n === "vregion") { state.viral = { region: v, platform: "all", cat: "all" }; store.set("viral-region", v); state.newsPage = 1; render(); }
  if (n === "rregion") { state.radio.region = v; store.set("radio-region", v); render(); }
});
document.addEventListener("submit", (e) => { if (e.target.id === "askForm") { e.preventDefault(); ask($("askQ").value); } });
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
window.addEventListener("online", () => { if (state.page !== "games") render(); });

Bridge.on("share", ({ text }) => {
  const m = (text || "").match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (!m) { toast("Teks yang dibagikan tidak berisi link YouTube."); return; }
  state.t.url = m[0];
  if (state.page !== "transcribe") go("transcribe");
  setTimeout(startTranscribe, 50);
});
(function handleWebShare() {
  const p = new URLSearchParams(location.search);
  const m = [p.get("url"), p.get("text")].filter(Boolean).join(" ").match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (m) { history.replaceState(null, "", location.pathname + "#/transcribe"); state.t.url = m[0]; setTimeout(startTranscribe, 50); }
})();
if (!isApp && "serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

{
  const h = parseHash();
  state.page = h.page;
  state.game = h.page === "games" ? h.sub : null;
}
render();
