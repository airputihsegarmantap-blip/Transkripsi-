// SiLengkap — antarmuka utama (mengikuti desain SiLengkap.dc.html).
// Data diambil dan diolah oleh RheusInterface; ringkasan video oleh TranscriptBot.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ====================================================================== platform
// APK: window.Native (Kotlin). Web: server Flask (/api/...).
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

const Platform = {
  fetchText(url) {
    if (isApp) return Bridge.call("httpGet", url);
    return fetch("/api/fetch?url=" + encodeURIComponent(url)).then(async (r) => {
      if (!r.ok) throw new Error((await r.text()) || "HTTP " + r.status);
      return r.text();
    });
  },
  async getTranscript(url) {
    if (isApp) return JSON.parse(await Bridge.call("getTranscript", url));
    const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Transkripsi gagal.");
    return data;
  },
  open(url) { if (isApp) Native.openUrl(url); else window.open(url, "_blank", "noopener"); },
  copy(text) {
    if (isApp) { Native.copy(text); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast("Tersalin"), () => toast("Gagal menyalin"));
  },
  share(title, text) {
    if (isApp) { Native.share(title, text); return; }
    if (navigator.share) navigator.share({ title, text }).catch(() => {});
    else Platform.copy(text);
  },
};

RheusInterface.configure({ fetchText: Platform.fetchText, getTranscript: Platform.getTranscript });

// ====================================================================== menu
const MENU = [
  { id: "transcribe", label: "Transkripsi Video", desc: "Link YouTube → teks & ringkasan", icon: "ph-file-video" },
  { id: "crypto", label: "Berita Kripto Hari Ini", desc: "Headline & berita pasar kripto", icon: "ph-currency-btc" },
  { id: "btc", label: "Prediksi Arah Bitcoin", desc: "Harga, arah, dan probabilitas", icon: "ph-chart-line-up" },
  { id: "dino", label: "Gim Dino", desc: "Lompat, hindari kaktus", icon: "ph-game-controller" },
  { id: "world", label: "Berita Dunia", desc: "Peristiwa global terkini", icon: "ph-globe-hemisphere-east" },
  { id: "viral", label: "Berita Viral", desc: "Yang ramai di media sosial", icon: "ph-trend-up" },
];
const NEWS_PAGES = ["crypto", "world", "viral"];

const state = {
  page: "home",
  newsPage: 1,
  news: {},          // kanal -> {status, data, error}
  btc: { tf: "24j", status: "idle", data: null, error: null },
  t: { url: "", status: "idle", stage: "", pct: 0, data: null, error: null, ytError: false },
  dino: null,
  best: (() => { try { return +localStorage.getItem("silengkap-dino-best") || 0; } catch { return 0; } })(),
};

function go(page) { location.hash = page === "home" ? "" : "#/" + page; }
function routeFromHash() {
  const p = (location.hash.match(/^#\/(\w+)/) || [])[1];
  return MENU.some((m) => m.id === p) ? p : "home";
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1600);
}

function setMenu(open) {
  $("drawer").classList.toggle("open", open);
  $("scrim").classList.toggle("open", open);
}

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

// ====================================================================== render
function render() {
  renderChrome();
  if (state.page !== "dino" && state.dino) { state.dino.stop(); state.dino = null; }
  const v = $("view");
  switch (state.page) {
    case "transcribe": v.innerHTML = viewTranscribe(); break;
    case "btc": v.innerHTML = viewBtc(); break;
    case "dino": if (!state.dino) { v.innerHTML = viewDino(); startDino(); } break;
    case "crypto": case "world": case "viral": v.innerHTML = viewNews(state.page); break;
    default: v.innerHTML = viewHome();
  }
}

// ---------------------------------------------------------------------- beranda
function viewHome() {
  return `
  <section style="display:flex;flex-direction:column;gap:28px;padding-top:6vh">
    <div style="display:flex;flex-direction:column;gap:18px;max-width:620px">
      <span class="logo-lg">SL</span>
      <h1 style="font-size:clamp(34px,6vw,52px);margin:0">SiLengkap</h1>
      <p class="text-muted" style="font-size:16px;margin:0;text-wrap:pretty">Transkripsi video, berita, analisa Bitcoin, dan hiburan dalam satu aplikasi. Buka menu di kanan atas untuk mulai.</p>
      <div><button class="btn btn-primary" data-action="openMenu"><i class="ph ph-list"></i>Buka menu</button></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-width:900px">
      ${MENU.map((m) => `
        <button class="card elev-sm menu-card hoverable" data-go="${m.id}">
          <i class="ph ${m.icon}"></i><span style="font-size:14px">${esc(m.label)}</span>
        </button>`).join("")}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------- transkripsi
const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

function viewTranscribe() {
  const t = state.t;
  const d = t.data;
  return `
  <section class="section">
    <div>
      <h2 style="margin:0 0 6px">Transkripsi Video</h2>
      <p class="text-muted" style="margin:0">Tempel link YouTube, lalu SiLengkap membuat transkripsi dan ringkasannya.</p>
    </div>
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

    ${t.status === "done" && d ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;align-items:start">
      <div class="card elev-sm" style="padding:16px;gap:12px">
        <div style="display:flex;align-items:center;gap:8px"><span class="card-kicker">Transkripsi</span>
          <span class="card-meta" style="margin-left:auto">${esc(fmtDur(d.duration))} · ${esc(langLabel(d))}</span>
          <button class="btn btn-ghost" data-action="copyTranscript" style="font-size:12px"><i class="ph ph-copy"></i>Salin</button></div>
        <div style="display:flex;flex-direction:column;gap:12px;max-height:440px;overflow:auto;padding-right:4px">
          ${groupSegments(d.segments).map((g) => `
            <div style="display:grid;grid-template-columns:48px 1fr;gap:10px;font-size:14px">
              <button class="ts-link" data-seek="${Math.floor(g.start)}">${TranscriptBot.fmtTime(g.start)}</button>
              <span style="text-wrap:pretty">${esc(g.text)}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="card elev-md" style="padding:16px;gap:12px">
        <div style="display:flex;align-items:center;gap:8px"><span class="card-kicker">Ringkasan</span>
          <button class="btn btn-ghost" data-action="copySummary" style="font-size:12px;margin-left:auto"><i class="ph ph-copy"></i>Salin</button>
          <button class="btn btn-ghost btn-icon" data-action="shareSummary" aria-label="Bagikan"><i class="ph ph-share-network"></i></button></div>
        <div class="card-title">${esc(d.title || "Video YouTube")}</div>
        <p class="card-body" style="font-size:14px;text-wrap:pretty">${esc(d.digest ? d.digest.short : "")}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${(d.digest ? d.digest.points.concat(d.digest.details) : []).map((p) => `
            <div style="display:flex;gap:10px;font-size:14px"><i class="ph ph-check" style="color:var(--color-accent);padding-top:3px"></i>
              <span>${p.label ? `<b style="font-weight:500">${esc(p.label)}:</b> ` : ""}${esc(p.text)}
              <button class="ts-link" style="display:inline;padding:0 0 0 4px" data-seek="${Math.floor(p.start)}">${TranscriptBot.fmtTime(p.start)}</button></span></div>`).join("")}
        </div>
        ${d.digest && d.digest.conclusion && !d.digest.isList ? `<p class="card-body" style="font-size:14px"><b style="color:var(--color-text);font-weight:500">Kesimpulan:</b> ${esc(d.digest.conclusion)}</p>` : ""}
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${(d.digest ? d.digest.keywords.slice(0, 5) : []).map((k, i) => `<span class="tag ${i === 0 ? "tag-accent" : "tag-neutral"}">${esc(k)}</span>`).join("")}
        </div>
        <span class="card-meta"><i class="ph ph-cpu"></i>Diringkas TranscriptBot ${esc(TranscriptBot.VERSION)} · offline</span>
      </div>
    </div>` : ""}
  </section>`;
}

/** Gabungkan potongan subtitle pendek menjadi paragraf ±25 detik agar enak dibaca. */
function groupSegments(segs) {
  const out = [];
  let cur = null;
  for (const s of segs || []) {
    if (!cur || s.start - cur.start > 25) { cur = { start: s.start, text: s.text }; out.push(cur); }
    else cur.text += " " + s.text;
  }
  return out;
}
const fmtDur = (sec) => TranscriptBot.fmtTime(sec || 0);
const langLabel = (d) => d.source === "terjemahan" ? "Terjemahan ke Indonesia" : d.language === "id" || d.language === "in" ? "Bahasa Indonesia" : `Bahasa ${String(d.language || "").toUpperCase()}`;

async function startTranscribe() {
  const t = state.t;
  const url = t.url.trim();
  if (!YT_RE.test(url)) { t.ytError = true; render(); return; }
  Object.assign(t, { ytError: false, status: "loading", stage: "Menghubungkan ke YouTube…", pct: 8, error: null, data: null });
  render();
  try {
    const data = await RheusInterface.transcribe(url, (stage, pct) => { t.stage = stage; t.pct = pct; if (state.page === "transcribe") render(); });
    t.pct = 100;
    Object.assign(t, { status: "done", data });
  } catch (e) {
    Object.assign(t, { status: "error", error: e.message || String(e) });
  }
  if (state.page === "transcribe") render();
}

// ---------------------------------------------------------------------- berita
const PER_PAGE = 6;

function viewNews(ch) {
  const n = state.news[ch] || { status: "idle" };
  if (n.status === "idle") { loadNews(ch); n.status = "loading"; }
  const head = (title, sub, meta) => `
    <div class="head-row">
      <div style="margin-right:auto"><h2>${esc(title)}</h2><p class="text-muted">${esc(sub)}</p></div>
      <span class="card-meta">${meta}</span>
      <button class="btn btn-ghost btn-icon" data-action="refreshNews" aria-label="Perbarui"><i class="ph ph-arrows-clockwise" style="${n.status === "loading" ? "animation:slspin 1s linear infinite" : ""}"></i></button>
    </div>`;
  const fallback = { crypto: "Berita Kripto Hari Ini", world: "Berita Dunia", viral: "Berita Viral" }[ch];

  if (n.status === "error") return `<section class="section">${head(fallback, "", "")}${errorCard(n.error, "refreshNews")}</section>`;
  if (!n.data) {
    return `<section class="section">${head(fallback, "RheusInterface sedang mengumpulkan berita dari beberapa sumber…", "")}
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
        ${[0, 1, 2].map(() => `<div class="card elev-md" style="min-height:170px;gap:12px"><div class="skeleton" style="height:20px;width:30%"></div><div class="skeleton" style="height:18px"></div><div class="skeleton" style="height:18px;width:80%"></div><div class="skeleton" style="height:12px;width:40%;margin-top:auto"></div></div>`).join("")}
      </div>
      <div>${[0, 1, 2, 3].map(() => `<div style="padding:14px 8px;display:flex;flex-direction:column;gap:8px"><div class="skeleton" style="height:16px;width:85%"></div><div class="skeleton" style="height:12px;width:55%"></div></div>`).join("")}</div>
    </section>`;
  }
  const d = n.data;
  const pageCount = Math.max(1, Math.ceil(d.list.length / PER_PAGE));
  state.newsPage = Math.min(state.newsPage, pageCount);
  const items = d.list.slice((state.newsPage - 1) * PER_PAGE, state.newsPage * PER_PAGE);
  const pages = pageWindow(state.newsPage, pageCount);
  return `
  <section class="section">
    ${head(d.title, d.sub, `<i class="ph ph-clock"></i>Diperbarui ${esc(agoText(d.updatedAt))}${d.stale ? " · offline" : ""}`)}
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ph-fill ph-fire" style="color:var(--color-accent)"></i><h6 style="margin:0">Headline hot</h6>
        <span class="card-meta" style="margin-left:auto">${d.stats.stories} cerita dari ${d.stats.articles} artikel${d.stats.forumPosts ? ` · ${d.stats.forumPosts} utas forum` : ""}</span></div>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
        ${d.hot.map((h, i) => `
          <button class="card elev-md hot-card hoverable" data-article="hot:${i}">
            <div style="display:flex;gap:6px;align-items:center"><span class="tag tag-outline">HOT #${i + 1}</span><span class="card-meta" style="margin-left:auto">${esc(h.time)}</span></div>
            <div class="card-title" style="font-size:18px;text-wrap:pretty">${esc(h.title)}</div>
            <p class="card-body" style="text-wrap:pretty">${esc(h.excerpt)}</p>
            <span class="card-meta" style="margin-top:auto">${esc(h.source)}${h.sources.length > 1 ? ` +${h.sources.length - 1} sumber` : ""}</span>
          </button>`).join("")}
      </div>
    </div>
    <div>
      <h6 style="margin:0 0 6px">Berita terbaru</h6>
      <div style="display:flex;flex-direction:column">
        ${items.map((a, i) => `
          <button class="news-row" data-article="list:${(state.newsPage - 1) * PER_PAGE + i}">
            <span style="font-size:16px;font-weight:500;text-wrap:pretty">${esc(a.title)}</span>
            <span class="card-meta" style="white-space:nowrap">${esc(a.time)}</span>
            ${a.excerpt ? `<span class="text-muted" style="font-size:13px;text-wrap:pretty">${esc(a.excerpt)}</span>` : "<span></span>"}
            <span class="card-meta">${esc(a.source)}</span>
          </button>`).join("") || `<p class="text-muted">Belum ada berita lain.</p>`}
      </div>
      ${pageCount > 1 ? `
      <div style="display:flex;align-items:center;gap:6px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage - 1}" ${state.newsPage === 1 ? "disabled" : ""} aria-label="Sebelumnya"><i class="ph ph-caret-left"></i></button>
        ${pages.map((p) => `<button class="btn ${p === state.newsPage ? "btn-primary" : "btn-secondary"} btn-icon" data-page="${p}">${p}</button>`).join("")}
        <button class="btn btn-secondary btn-icon" data-page="${state.newsPage + 1}" ${state.newsPage === pageCount ? "disabled" : ""} aria-label="Berikutnya"><i class="ph ph-caret-right"></i></button>
        <span class="card-meta" style="margin-left:8px">Halaman ${state.newsPage} dari ${pageCount}</span>
      </div>` : ""}
    </div>
  </section>`;
}

function pageWindow(cur, count) {
  const start = Math.max(1, Math.min(cur - 2, count - 4));
  return Array.from({ length: Math.min(5, count) }, (_, i) => start + i);
}

async function loadNews(ch, force = false) {
  const n = (state.news[ch] = { ...(state.news[ch] || {}), status: "loading" });
  try {
    n.data = await RheusInterface.news(ch, { force });
    n.status = "done";
  } catch (e) {
    n.status = n.data ? "done" : "error";
    n.error = e.message;
    if (n.data) toast(e.message);
  }
  if (state.page === ch) render();
}

function agoText(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : `${Math.round(m / 60)} jam lalu`;
}

function openArticle(ch, ref) {
  const d = state.news[ch] && state.news[ch].data;
  if (!d) return;
  const [kind, idx] = ref.split(":");
  const a = (kind === "hot" ? d.hot : d.list)[+idx];
  if (!a) return;
  state.article = a;
  $("dialog").innerHTML = `
    <div class="dialog-backdrop" style="z-index:50" data-action="closeArticle">
      <div class="dialog" role="dialog" aria-modal="true" style="width:min(600px,100%);max-height:85vh;overflow:auto" data-stop>
        <div style="display:flex;gap:8px;align-items:center"><span class="tag tag-accent">${esc(d.cat)}</span><span class="card-meta">${esc(a.source)} · ${esc(a.time)}</span>
          <button class="btn btn-ghost btn-icon" style="margin-left:auto" data-action="closeArticle" aria-label="Tutup"><i class="ph ph-x" style="color:var(--color-text)"></i></button></div>
        <div class="dialog-title" style="font-size:24px;line-height:1.2;text-wrap:pretty">${esc(a.title)}</div>
        <div class="dialog-body" style="font-size:15px;text-wrap:pretty">
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
          <p><i class="ph ph-cpu" style="color:var(--color-accent)"></i> ${esc(RheusInterface.explain(a))}</p>
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
  if (x >= 1e6) return "US$" + (x / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  return fmtUsd(x);
}
const pct = (x, d = 0) => (x * 100).toLocaleString("id-ID", { maximumFractionDigits: d }) + "%";
const signed = (x, d = 1) => (x >= 0 ? "+" : "") + x.toLocaleString("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }) + "%";

function viewBtc() {
  const b = state.btc;
  if (b.status === "idle") { loadBtc(); b.status = "loading"; }
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const head = `
    <div class="head-row">
      <div style="margin-right:auto"><h2>Prediksi Arah Bitcoin</h2><p class="text-muted">Analisa hari ini, ${esc(today)}${b.data ? ` · diperbarui ${esc(agoText(b.data.updatedAt))}` : ""}</p></div>
      <div class="seg" role="radiogroup" aria-label="Rentang waktu">
        ${Object.keys(RheusInterface.TFS).map((k) => `<label class="seg-opt ${k === b.tf ? "on" : ""}"><input type="radio" name="tf" value="${k}" ${k === b.tf ? "checked" : ""}>${k}</label>`).join("")}
      </div>
    </div>`;
  if (b.status === "error" && !b.data) return `<section class="section" style="gap:18px">${head}${errorCard(b.error, "reloadBtc")}</section>`;
  if (!b.data) {
    return `<section class="section" style="gap:18px">${head}
      <div class="card elev-md" style="padding:18px;gap:14px"><div class="skeleton" style="height:14px;width:90px"></div><div class="skeleton" style="height:40px;width:240px"></div><div class="skeleton" style="height:160px"></div></div>
      <p class="text-muted" style="margin:0;font-size:13px"><i class="ph ph-cpu"></i> RheusInterface mengambil harga, data pasar, dan menghitung indikator…</p></section>`;
  }
  const d = b.data, m = d.model;
  const dirInfo = {
    up: { icon: "ph-arrow-up-right", label: "Cenderung naik" },
    down: { icon: "ph-arrow-down-right", label: "Cenderung turun" },
    side: { icon: "ph-arrows-left-right", label: "Cenderung sideways" },
  }[m.direction];
  const reasons = m.reasons.filter((r) => !r.context).slice(0, 3).map((r) => r.text).join(", ") + ".";
  const ctx = m.reasons.filter((r) => r.context).map((r) => r.text).join(", ");
  const hist = m.history
    ? `Dalam ±2 tahun terakhir ada ${m.history.n} hari dengan sinyal ${m.history.signal} seperti hari ini; ${d.tfLabel} kemudian harga naik ${pct(m.probs.up)}, sideways ${pct(m.probs.side)}, turun ${pct(m.probs.down)} dari waktu.`
    : "";
  const invalid = m.direction === "up" ? `Penutupan di bawah support ${fmtUsd(d.support)} akan membatalkan skenario ini.`
    : m.direction === "down" ? `Penutupan di atas resistance ${fmtUsd(d.resistance)} akan membatalkan skenario ini.`
    : `Tembusnya support atau resistance akan menentukan arah berikutnya.`;
  const chart = chartPaths(d.series);
  const up = d.change >= 0;
  const mk = d.market;
  const market = [
    { label: "Fear & Greed", value: mk.fng ? mk.fng.value : "—", note: mk.fng ? mk.fng.label : "Tidak tersedia" },
    { label: "Volume 24j", value: fmtBig(mk.volume24h), note: "CoinGecko" },
    { label: "Dominasi BTC", value: mk.dominance ? mk.dominance.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%" : "—", note: mk.dominance ? (mk.dominance > 55 ? "Tinggi" : "Sedang") : "Tidak tersedia" },
    { label: "Funding rate", value: mk.funding !== null ? (mk.funding >= 0 ? "+" : "") + (mk.funding * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 }) + "%" : "—", note: mk.funding === null ? "Tidak tersedia" : mk.funding > 0.0002 ? "Long ramai" : mk.funding < 0 ? "Short ramai" : "Netral" },
    { label: "RSI (14)", value: Number.isFinite(mk.rsi) ? mk.rsi.toFixed(0) : "—", note: mk.rsi > 70 ? "Jenuh beli" : mk.rsi < 30 ? "Jenuh jual" : "Netral" },
    { label: "Volatilitas 30h", value: mk.vol30.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%", note: mk.vol30 > 15 ? "Tinggi" : mk.vol30 > 8 ? "Sedang" : "Rendah" },
  ];
  return `
  <section class="section" style="gap:18px">
    ${head}
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px">
      <div class="card elev-md" style="padding:18px;gap:10px;grid-column:1/-1">
        <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end">
          <div style="display:flex;flex-direction:column;gap:4px">
            <span class="card-kicker">BTC / USD</span>
            <span class="num" style="font-size:clamp(32px,5vw,44px);font-weight:500;letter-spacing:-0.02em">${fmtUsd(d.price)}</span>
            <span style="font-size:14px" class="${up ? "up" : "down"}"><i class="ph ${up ? "ph-trend-up" : "ph-trend-down"}"></i> ${signed(d.change)} (${esc(b.tf)}) · ≈ ${fmtIdr(d.priceIdr)}</span>
          </div>
          <div style="display:flex;gap:22px;margin-left:auto;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column"><span class="card-meta">Tertinggi ${esc(d.tfLabel)}</span><span class="num">${fmtUsd(d.high)}</span></div>
            <div style="display:flex;flex-direction:column"><span class="card-meta">Terendah ${esc(d.tfLabel)}</span><span class="num">${fmtUsd(d.low)}</span></div>
          </div>
        </div>
        <svg viewBox="0 0 600 160" preserveAspectRatio="none" style="width:100%;height:160px;display:block" role="img" aria-label="Grafik harga ${esc(d.tfLabel)}">
          <defs><linearGradient id="btcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9184d9" stop-opacity="0.35"></stop><stop offset="1" stop-color="#9184d9" stop-opacity="0"></stop></linearGradient></defs>
          <path d="${chart.area}" fill="url(#btcg)"></path>
          <polyline points="${chart.line}" fill="none" stroke="#9184d9" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
        </svg>
      </div>

      <div class="card elev-sm" style="padding:18px;gap:12px">
        <span class="card-kicker">Arah pergerakan · ${esc(d.tfLabel)}</span>
        <div style="display:flex;align-items:center;gap:14px">
          <span style="width:56px;height:56px;border-radius:50%;border:1px solid var(--color-accent);display:grid;place-items:center;box-shadow:0 0 28px color-mix(in srgb, var(--color-accent) 35%, transparent)"><i class="ph ${dirInfo.icon}" style="font-size:26px;color:var(--color-accent)"></i></span>
          <div><div style="font-size:24px;font-weight:500">${dirInfo.label}</div><div class="text-muted" style="font-size:13px">Target ${fmtUsd(m.target)} · keyakinan ${esc(m.confidence)}</div></div>
        </div>
        <p class="card-body" style="text-wrap:pretty">Sinyal: ${esc(reasons)} ${ctx ? `Sentimen: ${esc(ctx)}. ` : ""}${esc(invalid)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="padding:10px;border-radius:var(--radius-md);background:var(--color-neutral-900)"><div class="card-meta">Support</div><div class="num">${fmtUsd(d.support)}</div></div>
          <div style="padding:10px;border-radius:var(--radius-md);background:var(--color-neutral-900)"><div class="card-meta">Resistance</div><div class="num">${fmtUsd(d.resistance)}</div></div>
        </div>
      </div>

      <div class="card elev-sm" style="padding:18px;gap:14px">
        <span class="card-kicker">Probabilitas</span>
        ${[
          { label: "Naik", icon: "ph-arrow-up-right", p: m.probs.up, color: "var(--color-accent)" },
          { label: "Sideways", icon: "ph-arrows-left-right", p: m.probs.side, color: "var(--color-neutral-500)" },
          { label: "Turun", icon: "ph-arrow-down-right", p: m.probs.down, color: "var(--color-neutral-700)" },
        ].map((p) => `
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;font-size:14px"><i class="ph ${p.icon}" style="color:var(--color-accent)"></i>${p.label}<span class="num" style="margin-left:auto;font-weight:500">${pct(p.p)}</span></div>
            <div style="height:6px;border-radius:6px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;border-radius:6px;background:${p.color};width:${(p.p * 100).toFixed(1)}%"></div></div>
          </div>`).join("")}
        <span class="card-meta" style="line-height:1.5">${esc(hist)} Probabilitas adalah frekuensi historis, bukan jaminan.</span>
        ${m.skill ? `<span class="card-meta" style="line-height:1.5"><i class="ph ph-flask"></i>Uji balik otomatis ${m.skill.days} hari terakhir: tebakan arah benar ${Number.isFinite(m.skill.accuracy) ? pct(m.skill.accuracy) : "—"} dari ${m.skill.calls} kali. ${m.skill.skilled ? "Model sedikit lebih baik dari tebakan dasar." : "Model belum terbukti lebih baik dari tebakan dasar untuk rentang ini."}</span>` : ""}
      </div>

      <div class="card elev-sm" style="padding:18px;gap:10px;grid-column:1/-1">
        <span class="card-kicker">Keadaan pasar</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
          ${market.map((k) => `<div class="stat"><span class="card-meta">${esc(k.label)}</span><span class="num" style="font-size:20px;font-weight:500">${esc(k.value)}</span><span style="font-size:12px;color:var(--color-accent-300)">${esc(k.note)}</span></div>`).join("")}
        </div>
        <span class="card-meta"><i class="ph ph-info"></i>Bukan saran keuangan. Uji balik 2 tahun menunjukkan arah harga Bitcoin hampir tidak bisa ditebak dari indikator teknikal — anggap ini gambaran statistik, bukan ramalan. Lakukan riset sendiri sebelum bertransaksi.</span>
      </div>
    </div>
  </section>`;
}

function chartPaths(series) {
  const n = series.length;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => [(i * 600) / Math.max(1, n - 1), 150 - ((v - min) / span) * 135]);
  const line = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  return { line, area: "M0,160 L" + line.replace(/ /g, " L") + " L600,160 Z" };
}

async function loadBtc() {
  const b = state.btc;
  const tf = b.tf;
  b.status = "loading";
  try {
    const data = await RheusInterface.bitcoin(tf);
    if (b.tf !== tf) return;
    Object.assign(b, { status: "done", data, error: null });
  } catch (e) {
    Object.assign(b, { status: "error", error: e.message });
  }
  if (state.page === "btc") render();
}

// ---------------------------------------------------------------------- dino
function viewDino() {
  return `
  <section style="display:flex;flex-direction:column;gap:18px">
    <div class="head-row">
      <div style="margin-right:auto"><h2>Gim Dino</h2><p class="text-muted">Tekan Spasi, ↑, atau ketuk area permainan untuk melompat.</p></div>
      <span id="dinoBest" class="tag tag-accent">Rekor ${state.best}</span>
    </div>
    <div class="card elev-md" style="padding:0;overflow:hidden;background:linear-gradient(180deg, var(--color-surface), var(--color-bg))">
      <canvas id="dinoCanvas" width="900" height="260" style="width:100%;height:auto;display:block;cursor:pointer;touch-action:manipulation"></canvas>
    </div>
  </section>`;
}
function startDino() {
  const c = $("dinoCanvas");
  // Di layar sempit kanvas dibuat lebih "pendek" lebarnya supaya gim tidak terlihat kecil.
  c.width = Math.round(Math.min(900, Math.max(480, c.clientWidth * 1.5)));
  state.dino = SiLengkapDino.createDino(c, {
    getBest: () => state.best,
    onBest: (s) => {
      state.best = s;
      try { localStorage.setItem("silengkap-dino-best", s); } catch {}
      const el = $("dinoBest"); if (el) el.textContent = "Rekor " + s;
    },
  });
  c.addEventListener("pointerdown", (e) => { e.preventDefault(); state.dino && state.dino.jump(); });
}

// ---------------------------------------------------------------------- umum
function errorCard(msg, retryAction) {
  return `<div class="card elev-sm" style="padding:16px;gap:10px;max-width:760px">
    <div style="display:flex;gap:10px;align-items:flex-start"><i class="ph ph-warning-circle" style="color:var(--color-accent-300);font-size:20px"></i><span style="font-size:14px;text-wrap:pretty">${esc(msg)}</span></div>
    <div><button class="btn btn-secondary" data-action="${retryAction}"><i class="ph ph-arrows-clockwise"></i>Coba lagi</button></div>
  </div>`;
}

function summaryText(d) {
  const lines = [d.title || "Video YouTube", `https://www.youtube.com/watch?v=${d.video_id}`, "", d.markdown];
  return lines.join("\n");
}

// ====================================================================== event
const ACTIONS = {
  openMenu: () => setMenu(true),
  closeMenu: () => setMenu(false),
  startTranscribe,
  useSample: () => { state.t.url = "https://youtu.be/dQw4w9WgXcQ"; state.t.ytError = false; render(); },
  copyTranscript: () => state.t.data && Platform.copy(state.t.data.segments.map((s) => `[${TranscriptBot.fmtTime(s.start)}] ${s.text}`).join("\n")),
  copySummary: () => state.t.data && Platform.copy(summaryText(state.t.data)),
  shareSummary: () => state.t.data && Platform.share(state.t.data.title || "Ringkasan video", summaryText(state.t.data)),
  refreshNews: () => { loadNews(state.page, true); render(); },
  reloadBtc: () => { state.btc.status = "idle"; render(); },
  closeArticle: () => { $("dialog").innerHTML = ""; state.article = null; },
  shareArticle: () => { const a = state.article; if (a) Platform.share(a.title, `${a.title}\n${a.link}`); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-action],[data-article],[data-page],[data-seek],[data-open],[data-stop]");
  if (!el) return;
  if (el.hasAttribute("data-stop") && !e.target.closest("[data-action],[data-open]")) { return; }
  if (el.dataset.go) { setMenu(false); go(el.dataset.go); return; }
  if (el.dataset.open) { e.preventDefault(); Platform.open(el.dataset.open); return; }
  if (el.dataset.action && ACTIONS[el.dataset.action]) {
    if (el.classList.contains("dialog-backdrop") && e.target !== el) return;
    ACTIONS[el.dataset.action]();
    return;
  }
  if (el.dataset.article) { openArticle(state.page, el.dataset.article); return; }
  if (el.dataset.page) { state.newsPage = +el.dataset.page; render(); window.scrollTo(0, 0); return; }
  if (el.dataset.seek && state.t.data) {
    Platform.open(`https://www.youtube.com/watch?v=${state.t.data.video_id}&t=${el.dataset.seek}s`);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "yt") {
    state.t.url = e.target.value;
    state.t.ytError = false;
    const btn = $("ytGo");
    if (btn) btn.disabled = !state.t.url.trim() || state.t.status === "loading";
  }
});
document.addEventListener("change", (e) => {
  if (e.target.name === "tf") { state.btc.tf = e.target.value; state.btc.status = "idle"; render(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setMenu(false); ACTIONS.closeArticle(); }
  if (e.key === "Enter" && e.target.id === "yt") startTranscribe();
  if (state.page === "dino" && (e.code === "Space" || e.code === "ArrowUp")) { e.preventDefault(); state.dino && state.dino.jump(); }
});

window.addEventListener("hashchange", () => {
  state.page = routeFromHash();
  state.newsPage = 1;
  ACTIONS.closeArticle();
  render();
  window.scrollTo(0, 0);
});

// Link dibagikan dari aplikasi YouTube (APK: Bagikan → SiLengkap).
Bridge.on("share", ({ text }) => {
  const m = (text || "").match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (!m) { toast("Teks yang dibagikan tidak berisi link YouTube."); return; }
  state.t.url = m[0];
  if (state.page !== "transcribe") go("transcribe");
  setTimeout(startTranscribe, 50);
});
// Web: share target PWA (?url=… / ?text=…)
(function handleWebShare() {
  const p = new URLSearchParams(location.search);
  const shared = [p.get("url"), p.get("text")].filter(Boolean).join(" ");
  const m = shared.match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (m) { history.replaceState(null, "", "/#/transcribe"); state.t.url = m[0]; setTimeout(startTranscribe, 50); }
})();

if (!isApp && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

state.page = routeFromHash();
render();
