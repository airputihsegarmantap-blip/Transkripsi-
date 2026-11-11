// TranskripKu (Android) — logika antarmuka.
// Kerja berat dikerjakan Kotlin lewat window.Native; hasil kembali lewat window.Bridge.
"use strict";

const $ = (id) => document.getElementById(id);
const SOURCE_LABEL = {
  manual: "subtitle manual",
  otomatis: "subtitle otomatis YouTube",
  terjemahan: "subtitle diterjemahkan ke Indonesia",
};

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
    a.textContent = TranscriptBot.fmtTime(seg.start);
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

// ---------------------------------------------------------------- ringkasan
function runSummary(data) {
  $("summaryCard").classList.remove("hidden");
  summaryText = TranscriptBot.summarize(data.segments, { title: data.title });
  $("summary").innerHTML = renderMarkdown(summaryText);
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

    setStatus("TranscriptBot sedang meringkas…");
    runSummary(data);
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
  const lines = current.segments.map((s) => `[${TranscriptBot.fmtTime(s.start)}] ${s.text}`);
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

