// TranskripKu (Android) — logika antarmuka.
// Kerja berat dikerjakan Kotlin lewat window.Native; hasil kembali lewat window.Bridge.
"use strict";

const $ = (id) => document.getElementById(id);
const SOURCE_LABEL = {
  manual: "subtitle manual",
  otomatis: "subtitle otomatis YouTube",
  terjemahan: "subtitle diterjemahkan ke Indonesia",
};

// Batas kata transkrip yang dikirim ke AI (model kecil punya konteks terbatas).
const AI_MAX_WORDS = 600;
const AI_SYSTEM = `Kamu adalah asisten yang meringkas transkrip video YouTube berbahasa Indonesia.
Transkrip berasal dari subtitle otomatis, bisa berisi salah ketik dan tanpa tanda baca.
Tulis ringkasan dalam Bahasa Indonesia yang baik, format Markdown:

## Ringkasan Singkat
2-3 kalimat inti video.

## Poin-Poin Utama
- 3 sampai 6 poin penting.

## Kesimpulan
1-2 kalimat.

Hanya gunakan informasi dari transkrip. Jangan mengarang.`;

// ---------------------------------------------------------------- jembatan native
window.Bridge = {
  _id: 0,
  _pending: {},
  _handlers: {},
  call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = ++this._id;
      this._pending[id] = { resolve, reject };
      try { window.Native[method](id, ...args); }
      catch (e) { delete this._pending[id]; reject(new Error("Fitur ini hanya ada di aplikasi Android.")); }
    });
  },
  resolve(id, data) { const p = this._pending[id]; delete this._pending[id]; p && p.resolve(data); },
  reject(id, msg) { const p = this._pending[id]; delete this._pending[id]; p && p.reject(new Error(msg)); },
  on(ev, fn) { this._handlers[ev] = fn; },
  emit(ev, data) { const fn = this._handlers[ev]; fn && fn(JSON.parse(data)); },
};
const hasNative = () => typeof window.Native !== "undefined";

// ---------------------------------------------------------------- util tampilan
let current = null;
let summaryText = "";

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/\[(\d+(?::\d{2}){1,2})\]/g, (m, t) => {
      const sec = t.split(":").reduce((a, b) => a * 60 + Number(b), 0);
      return `<a href="#" class="ts" data-t="${sec}">${t}</a>`;
    });
}
function renderMarkdown(md) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join(" ")}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = Math.min(m[1].length + 1, 6);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      const type = /^\s*\d/.test(line) ? "ol" : "ul";
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList(); para.push(line);
    }
  }
  flushPara(); closeList();
  return out.join("");
}

function openAt(sec) {
  if (!current) return;
  if (hasNative()) Native.openVideo(current.video_id, Math.floor(sec));
  else window.open(`https://www.youtube.com/watch?v=${current.video_id}&t=${Math.floor(sec)}s`);
}

function renderTranscript(data) {
  const box = $("transcript");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const seg of data.segments) {
    const row = document.createElement("div");
    row.className = "seg";
    const a = document.createElement("a");
    a.href = "#";
    a.className = "ts";
    a.dataset.t = Math.floor(seg.start);
    a.textContent = LocalSummarizer.fmtTime(seg.start);
    const span = document.createElement("span");
    span.textContent = seg.text;
    row.append(a, span);
    frag.append(row);
  }
  box.append(frag);
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a.ts");
  if (!a) return;
  e.preventDefault();
  openAt(Number(a.dataset.t));
});

// ---------------------------------------------------------------- mesin ringkasan
const engine = () => document.querySelector('input[name="engine"]:checked').value;

async function summarizeAi(data) {
  const picked = LocalSummarizer.topSentences(data.segments, AI_MAX_WORDS);
  const condensed = picked.map((s) => s.text).join(" ");
  const wasCondensed = data.text.split(/\s+/).length > AI_MAX_WORDS;
  const user = `${data.title ? `Judul video: ${data.title}\n\n` : ""}Transkrip:\n${condensed}\n\nBuatkan ringkasannya.`;
  const result = await Bridge.call("generate", AI_SYSTEM, user);
  let md = result.trim();
  if (wasCondensed) md += "\n\n_Transkrip panjang dipadatkan dulu ke bagian terpenting sebelum diringkas AI._";
  return md + "\n\n_Dibuat oleh AI offline di HP-mu._";
}

async function runSummary(data) {
  $("summaryCard").classList.remove("hidden");
  const out = $("summary");
  if (engine() === "ai") {
    const st = modelStatus();
    if (!st.ready) {
      summaryText = "_Model AI belum diunduh — memakai peringkas cepat._\n\n" + LocalSummarizer.summarize(data.segments);
      out.innerHTML = renderMarkdown(summaryText);
      return;
    }
    out.innerHTML = '<p class="thinking">AI sedang membaca dan menulis ringkasan… (bisa 10–60 detik)</p>';
    try {
      summaryText = await summarizeAi(data);
    } catch (err) {
      summaryText = `_${err.message} — memakai peringkas cepat._\n\n` + LocalSummarizer.summarize(data.segments);
    }
  } else {
    summaryText = LocalSummarizer.summarize(data.segments);
  }
  out.innerHTML = renderMarkdown(summaryText);
}

// ---------------------------------------------------------------- proses utama
async function process(url) {
  $("go").disabled = true;
  $("summaryCard").classList.add("hidden");
  $("transcriptCard").classList.add("hidden");
  setStatus("Mengambil transkrip dari YouTube…");
  try {
    const raw = await Bridge.call("getTranscript", url);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    data.text = data.segments.map((s) => s.text).join(" ");
    current = data;

    $("video").classList.remove("hidden");
    $("thumb").src = `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`;
    $("title").textContent = data.title || "Video YouTube";
    const words = data.text.split(/\s+/).length;
    $("meta").textContent = `Sumber: ${SOURCE_LABEL[data.source] || data.source} · bahasa: ${data.language} · ${words.toLocaleString("id-ID")} kata`;

    renderTranscript(data);
    $("transcriptCard").classList.remove("hidden");

    setStatus("Membuat ringkasan…");
    await runSummary(data);
    setStatus("Selesai ✓");
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    $("go").disabled = false;
  }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $("url").value.trim();
  if (url) process(url);
});
$("openYt").addEventListener("click", () => openAt(0));
$("showTime").addEventListener("change", (e) => $("transcript").classList.toggle("no-time", !e.target.checked));

function copyText(text) {
  if (hasNative()) Native.copy(text);
  else navigator.clipboard && navigator.clipboard.writeText(text);
}
$("copySummary").addEventListener("click", () => copyText(summaryText));
$("copyTranscript").addEventListener("click", () => copyText(current ? current.text : ""));
$("shareAll").addEventListener("click", () => {
  if (!current) return;
  const lines = current.segments.map((s) => `[${LocalSummarizer.fmtTime(s.start)}] ${s.text}`);
  const text = `${current.title || current.video_id}\nhttps://www.youtube.com/watch?v=${current.video_id}\n\n` +
    (summaryText ? `RINGKASAN\n${summaryText}\n\nTRANSKRIP\n` : "") + lines.join("\n");
  if (hasNative()) Native.share(current.title || "Transkrip", text);
  else copyText(text);
});

// Link yang dibagikan dari aplikasi YouTube
Bridge.on("share", ({ text }) => {
  const m = (text || "").match(/https?:\/\/\S*(youtube\.com|youtu\.be)\S*/i);
  if (!m) { setStatus("Teks yang dibagikan tidak berisi link YouTube.", true); return; }
  $("url").value = m[0];
  process(m[0]);
});

// ---------------------------------------------------------------- panel model AI
function modelStatus() {
  try { return JSON.parse(Native.modelStatus()); }
  catch { return { ready: false, downloading: false, sizeBytes: 0, name: "AI" }; }
}
const mb = (b) => `${Math.round(b / 1e6).toLocaleString("id-ID")} MB`;

function refreshAiPanel() {
  const isAi = engine() === "ai";
  $("aiPanel").classList.toggle("hidden", !isAi);
  if (!isAi) return;
  const st = modelStatus();
  $("aiInfo").textContent = st.ready
    ? `✓ ${st.name} siap (${mb(st.sizeBytes)}). Berjalan offline di HP-mu.`
    : st.downloading
      ? "Mengunduh model AI…"
      : `${st.name}: model AI kecil yang berjalan offline di HP. Perlu diunduh sekali (±500 MB, sebaiknya pakai Wi-Fi). Disarankan RAM ≥ 4 GB.`;
  $("aiDownload").classList.toggle("hidden", st.ready || st.downloading);
  $("aiCancel").classList.toggle("hidden", !st.downloading);
  $("aiDelete").classList.toggle("hidden", !st.ready);
  $("progressWrap").classList.toggle("hidden", !st.downloading);
}

document.querySelectorAll('input[name="engine"]').forEach((r) =>
  r.addEventListener("change", () => {
    try { localStorage.setItem("engine", engine()); } catch {}
    refreshAiPanel();
  })
);

Bridge.on("download", ({ done, total }) => {
  $("progressWrap").classList.remove("hidden");
  const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
  $("progressBar").style.width = `${pct}%`;
  $("aiInfo").textContent = total > 0 ? `Mengunduh model AI… ${mb(done)} / ${mb(total)} (${pct}%)` : `Mengunduh… ${mb(done)}`;
});

$("aiDownload").addEventListener("click", async () => {
  $("aiDownload").classList.add("hidden");
  $("aiCancel").classList.remove("hidden");
  $("progressWrap").classList.remove("hidden");
  try {
    await Bridge.call("downloadModel");
    setStatus("Model AI siap dipakai ✓");
  } catch (err) {
    setStatus(err.message, true);
  }
  refreshAiPanel();
});
$("aiCancel").addEventListener("click", () => Native.cancelDownload());
$("aiDelete").addEventListener("click", () => {
  if (!confirm("Hapus model AI dari HP? Kamu bisa mengunduhnya lagi nanti.")) return;
  Native.deleteModel();
  setTimeout(refreshAiPanel, 300);
});

(function init() {
  let saved = null;
  try { saved = localStorage.getItem("engine"); } catch {}
  if (saved === "ai") document.querySelector('input[value="ai"]').checked = true;
  refreshAiPanel();
})();
