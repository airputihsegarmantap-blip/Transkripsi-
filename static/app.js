const $ = (id) => document.getElementById(id);
const SOURCE_LABEL = {
  manual: "subtitle manual",
  otomatis: "subtitle otomatis YouTube",
  terjemahan: "subtitle diterjemahkan ke Indonesia",
  whisper: "transkripsi audio (Whisper)",
};

let current = null; // hasil transkripsi terakhir
let summaryText = "";

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// Renderer Markdown kecil (judul, daftar, tebal, miring, paragraf). Teks di-escape dulu
// sehingga aman dari HTML injection dan tidak perlu library eksternal.
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function renderMarkdown(md) {
  const out = [];
  let list = null; // "ul" | "ol"
  let para = [];
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

function seek(t) {
  $("player").src = `https://www.youtube.com/embed/${current.video_id}?start=${Math.floor(t)}&autoplay=1`;
}

function renderTranscript(data) {
  const box = $("transcript");
  box.innerHTML = "";
  for (const seg of data.segments) {
    const row = document.createElement("div");
    row.className = "seg";
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = fmtTime(seg.start);
    a.onclick = (e) => { e.preventDefault(); seek(seg.start); };
    const span = document.createElement("span");
    span.textContent = seg.text;
    row.append(a, span);
    box.append(row);
  }
}

async function summarize(data) {
  $("summaryCard").classList.remove("hidden");
  const out = $("summary");
  out.innerHTML = "";
  out.classList.add("cursor");
  summaryText = "";

  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: data.text, title: data.title }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Gagal membuat ringkasan.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    summaryText += decoder.decode(value, { stream: true });
    out.innerHTML = renderMarkdown(summaryText);
  }
  out.classList.remove("cursor");
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("url").value.trim();
  if (!url) return;

  $("go").disabled = true;
  $("summaryCard").classList.add("hidden");
  $("transcriptCard").classList.add("hidden");
  setStatus("Mengambil transkrip…");

  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transkripsi gagal.");
    current = data;

    $("video").classList.remove("hidden");
    $("player").src = `https://www.youtube.com/embed/${data.video_id}`;
    $("title").textContent = data.title || "Video YouTube";
    const words = data.text.split(/\s+/).length;
    $("meta").textContent = `Sumber: ${SOURCE_LABEL[data.source] || data.source} · bahasa: ${data.language} · ${words.toLocaleString("id-ID")} kata`;

    renderTranscript(data);
    $("transcriptCard").classList.remove("hidden");

    setStatus("Membuat ringkasan…");
    await summarize(data);
    setStatus("Selesai ✓");
  } catch (err) {
    setStatus(err.message, true);
    $("summary").classList.remove("cursor");
  } finally {
    $("go").disabled = false;
  }
});

$("showTime").addEventListener("change", (e) => {
  $("transcript").classList.toggle("no-time", !e.target.checked);
});

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy === "summary" ? summaryText : current?.text || "";
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "Tersalin!";
    setTimeout(() => (btn.textContent = old), 1500);
  });
});

$("download").addEventListener("click", () => {
  if (!current) return;
  const lines = current.segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`);
  const header = `${current.title || current.video_id}\nhttps://www.youtube.com/watch?v=${current.video_id}\n\n`;
  const summary = summaryText ? `RINGKASAN\n${summaryText}\n\nTRANSKRIP\n` : "";
  const blob = new Blob([header + summary + lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transkrip-${current.video_id}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});
