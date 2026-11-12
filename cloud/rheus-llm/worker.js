/**
 * Rheus LLM — otak percakapan SiLengkap 2.0 di Cloudflare Workers AI.
 *
 * Model: Llama 3.2 3B Instruct (@cf/meta/llama-3.2-3b-instruct), dijalankan di cloud Cloudflare.
 * Akses internet (RAG): setiap pertanyaan dilengkapi konteks segar dari
 *   - Rheus Cloud: berita 48 jam terakhir yang sudah disaring hoaks (knowledge.json),
 *   - Wikipedia Indonesia/Inggris (pengetahuan umum),
 *   - harga Bitcoin live (CoinGecko) bila relevan.
 * Rheus diminta menjawab HANYA berdasarkan konteks + pengetahuan umum, dan menyebut sumber [n].
 *
 * Endpoint:
 *   GET  /health                 → status
 *   POST /chat      {messages}   → SSE: event "sources" lalu token-token jawaban
 *   POST /summarize {title,text} → SSE: ringkasan video (TranscriptBot 4, mode AI)
 *   GET  /transcript?v=ID        → subtitle YouTube (cadangan bila HP kena batas 429)
 */

export const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const UA = "SiLengkap-Rheus/2.0 (+https://github.com/airputihsegarmantap-blip/Transkripsi-)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const SSE = { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" };
const enc = new TextEncoder();

// ---------------------------------------------------------------- batas pemakaian (per isolate)
const hits = new Map();
function limited(ip, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

// ---------------------------------------------------------------- pencarian konteks
const STOP = new Set(("apa yang dan di ke dari untuk dengan ini itu ada berita terbaru hari kabar soal tentang info bagaimana " +
  "kenapa mengapa siapa kapan berapa adalah akan bisa saya aku kamu tolong jelaskan coba sih dong the of what is are how why who").split(" "));
export const tokens = (t) => (String(t).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

let kbCache = { at: 0, docs: [] };
async function knowledge(env) {
  if (Date.now() - kbCache.at < 5 * 60_000 && kbCache.docs.length) return kbCache.docs;
  try {
    const r = await fetch(env.KNOWLEDGE_URL, { cf: { cacheTtl: 300 } });
    if (r.ok) kbCache = { at: Date.now(), docs: (await r.json()).docs || [] };
  } catch (e) { /* tetap pakai cache lama */ }
  return kbCache.docs;
}

export function rank(docs, q, k = 6) {
  const qt = [...new Set(tokens(q))];
  if (!qt.length) return [];
  const N = docs.length || 1;
  const df = new Map();
  const toks = docs.map((d) => { const t = tokens(`${d.t} ${d.x} ${d.c || ""}`); new Set(t).forEach((w) => df.set(w, (df.get(w) || 0) + 1)); return t; });
  const avg = toks.reduce((a, t) => a + t.length, 0) / N || 1;
  const now = Date.now() / 1000;
  return docs.map((d, i) => {
    const tf = new Map();
    toks[i].forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    let s = 0;
    for (const w of qt) {
      const f = tf.get(w);
      if (!f) continue;
      const n = df.get(w) || 0;
      s += Math.log(1 + (N - n + 0.5) / (n + 0.5)) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * toks[i].length / avg));
    }
    if (s) s *= (1 + 0.3 * (now - d.ts < 86400)) * (1 + 0.2 * (d.v ? 1 : 0));
    return [s, d];
  }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, d]) => d);
}

async function wikipedia(q, lang = "id") {
  const u = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}` +
    "&gsrlimit=2&prop=extracts&exintro=1&explaintext=1&exsentences=6&format=json&formatversion=2&origin=*";
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, cf: { cacheTtl: 3600 } });
    const pages = ((await r.json()).query || {}).pages || [];
    return pages.sort((a, b) => a.index - b.index).filter((p) => p.extract && p.extract.length > 80)
      .map((p) => ({ t: p.title, x: p.extract.slice(0, 900), s: `Wikipedia (${lang})`, l: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` }));
  } catch (e) { return []; }
}

async function btcPrice() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,idr&include_24hr_change=true", { headers: { "User-Agent": UA } });
    const b = (await r.json()).bitcoin;
    return { t: "Harga Bitcoin saat ini", x: `BTC = US$${Math.round(b.usd).toLocaleString("en-US")} (≈ Rp${Math.round(b.idr).toLocaleString("id-ID")}), perubahan 24 jam ${b.usd_24h_change.toFixed(2)}%.`, s: "CoinGecko (live)", l: "https://www.coingecko.com/en/coins/bitcoin" };
  } catch (e) { return null; }
}

export async function gatherContext(env, q) {
  const wantsBtc = /\b(bitcoin|btc|kripto|crypto)\b/i.test(q);
  const [docs, wikiId, btc] = await Promise.all([knowledge(env), wikipedia(q, "id"), wantsBtc ? btcPrice() : null]);
  const news = rank(docs, q, 6).map((d) => ({ t: d.t, x: d.x, s: d.s + (d.v ? " (terverifikasi)" : ""), l: d.l, ts: d.ts }));
  let wiki = wikiId;
  if (!wiki.length) wiki = await wikipedia(q, "en");
  return [btc, ...news, ...wiki.slice(0, 2)].filter(Boolean);
}

function contextBlock(sources) {
  if (!sources.length) return "(Tidak ada konteks yang ditemukan.)";
  return sources.map((s, i) => `[${i + 1}] ${s.t} — ${s.s}${s.ts ? `, ${new Date(s.ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}\n${s.x}`).join("\n\n");
}

export function systemPrompt(sources) {
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  return `Kamu adalah Rheus, asisten AI di aplikasi SiLengkap. Hari ini ${today} (WIB).
Aturan:
- Jawab dalam Bahasa Indonesia yang santai tapi jelas, kecuali pengguna memakai bahasa lain.
- Untuk fakta terkini (berita, harga, peristiwa) gunakan HANYA KONTEKS di bawah, dan sebut sumbernya dengan nomor seperti [1].
- Jika konteks tidak memuat jawabannya, katakan terus terang bahwa kamu belum menemukan informasinya. Jangan mengarang fakta, angka, atau kutipan.
- Berita berlabel "terverifikasi" diliput ≥2 media kredibel; utamakan itu.
- Soal investasi/kripto: beri informasi, bukan saran keuangan.
- Jawaban ringkas: maksimal ±150 kata kecuali diminta lebih panjang. Pakai poin bila membantu.

KONTEKS (diambil dari internet barusan):
${contextBlock(sources)}`;
}

/** Gabungkan event "sources" + aliran token dari Workers AI menjadi satu respons SSE. */
function streamWith(ctx, aiStream, first) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  ctx.waitUntil((async () => {
    try {
      if (first) await w.write(enc.encode(first));
      const reader = aiStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await w.write(value);
      }
    } catch (e) {
      await w.write(enc.encode(`event: error\ndata: ${JSON.stringify({ message: "Rheus terputus. Coba lagi." })}\n\n`));
    } finally {
      try { await w.close(); } catch (e) { /* sudah ditutup */ }
    }
  })());
  return new Response(readable, { headers: SSE });
}

async function chat(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  const last = [...msgs].reverse().find((m) => m.role === "user");
  if (!last) return json({ error: "Pertanyaan kosong." }, 400);
  // Pertanyaan lanjutan pendek ("kenapa?") ikut memakai topik pertanyaan sebelumnya untuk pencarian.
  const prevUser = msgs.filter((m) => m.role === "user").slice(-2, -1)[0];
  const searchQ = tokens(last.content).length < 3 && prevUser ? `${prevUser.content} ${last.content}` : last.content;
  const sources = await gatherContext(env, searchQ);
  const ai = await env.AI.run(MODEL, {
    messages: [{ role: "system", content: systemPrompt(sources) }, ...msgs],
    stream: true, max_tokens: 700, temperature: 0.4,
  });
  const src = sources.map((s, i) => ({ n: i + 1, t: s.t, s: s.s, l: s.l }));
  return streamWith(ctx, ai, `event: sources\ndata: ${JSON.stringify(src)}\n\n`);
}

async function summarize(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").slice(0, 24_000);
  if (text.length < 200) return json({ error: "Transkrip terlalu pendek untuk diringkas." }, 400);
  const prompt = `Ringkas transkrip video YouTube berikut dalam Bahasa Indonesia.
Format (Markdown):
**Inti video:** 2–3 kalimat.
**Poin penting:**
- 4 sampai 7 poin, masing-masing satu kalimat padat (sertakan angka/nama penting).
**Kesimpulan:** 1–2 kalimat.
Hanya gunakan isi transkrip. Jangan menambah fakta dari luar.

Judul: ${String(body.title || "(tanpa judul)").slice(0, 200)}
Transkrip:
${text}`;
  const ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], stream: true, max_tokens: 800, temperature: 0.2 });
  return streamWith(ctx, ai, "");
}

// ---------------------------------------------------------------- subtitle YouTube (cadangan)
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

export function parseCaptions(xml) {
  const out = [];
  const add = (start, dur, raw) => {
    const text = decode(decode(raw)).replace(/<[^>]*>/g, "").replace(/\[(musik|music|tepuk tangan|applause)\]/gi, " ").replace(/\s+/g, " ").trim();
    if (text) out.push({ start, duration: dur, text });
  };
  for (const m of xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) add(+m[1], +(m[2] || 0), m[3]);
  if (!out.length) for (const m of xml.matchAll(/<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) add(+m[1] / 1000, +(m[2] || 0) / 1000, m[3]);
  return out;
}

/**
 * Pilih subtitle sesuai bahasa yang diminta (sama dengan aplikasi Android):
 * "orig" = bahasa asli video; "id"/"en"/… = subtitle di bahasa itu, bila tidak ada diterjemahkan YouTube.
 */
export function chooseTrack(tracks, target) {
  const list = tracks.map((t) => ({ url: String(t.baseUrl).replace("&fmt=srv3", ""), lang: t.languageCode || "", asr: t.kind === "asr", tr: !!t.isTranslatable }));
  const spoken = (list.find((t) => t.asr) || {}).lang;
  const original = list.find((t) => !t.asr && t.lang === spoken) || list.find((t) => t.asr) || list[0];
  const src = (t) => ({ url: t.url, language: t.lang, source: t.asr ? "otomatis" : "manual" });
  if (target === "orig") return src(original);
  const want = target === "id" ? ["id", "in"] : [target];
  const manual = list.find((t) => !t.asr && want.includes(t.lang));
  if (manual) return src(manual);
  const auto = list.find((t) => t.asr && want.includes(t.lang));
  if (auto) return src(auto);
  const base = original.tr ? original : list.find((t) => t.tr) || original;
  return base.tr ? { url: base.url + "&tlang=" + target, language: target, source: "terjemahan" } : src(base);
}

async function transcript(url) {
  const v = url.searchParams.get("v") || "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(v)) return json({ error: "ID video tidak valid." }, 400);
  const lang = (url.searchParams.get("lang") || "id").toLowerCase();
  const target = lang === "orig" || /^[a-z]{2,3}$/.test(lang) ? lang : "id";
  const clients = [
    { name: "ANDROID", id: "3", version: "20.10.38", ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip", extra: { androidSdkVersion: 34 } },
    { name: "IOS", id: "5", version: "20.10.4", ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)", extra: { deviceModel: "iPhone16,2" } },
  ];
  let last = "Subtitle tidak tersedia.";
  for (const c of clients) {
    try {
      const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": c.ua, "X-YouTube-Client-Name": c.id, "X-YouTube-Client-Version": c.version },
        body: JSON.stringify({ context: { client: { clientName: c.name, clientVersion: c.version, hl: "id", gl: "ID", ...c.extra } }, videoId: v, contentCheckOk: true, racyCheckOk: true }),
      });
      if (r.status === 429) { last = "YouTube juga membatasi server Rheus (429)."; continue; }
      const p = await r.json();
      const tracks = (((p.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
      if (!tracks.length) { last = (p.playabilityStatus || {}).reason || "Video ini tidak punya subtitle."; continue; }
      const pick = chooseTrack(tracks, target);
      const xr = await fetch(pick.url, { headers: { "User-Agent": c.ua } });
      if (xr.status === 429) { last = "YouTube juga membatasi server Rheus (429)."; continue; }
      const segments = parseCaptions(await xr.text());
      if (!segments.length) continue;
      return json({
        video_id: v, title: (p.videoDetails || {}).title || null, language: pick.language, source: pick.source,
        target, segments, via: "rheus-cloud",
      });
    } catch (e) { last = "Gagal menghubungi YouTube dari server Rheus."; }
  }
  return json({ error: last }, 502);
}

// ---------------------------------------------------------------- router
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    try {
      if (url.pathname === "/health") return json({ ok: true, name: "Rheus", model: MODEL });
      if (limited(ip)) return json({ error: "Terlalu banyak permintaan. Tunggu sebentar." }, 429);
      if (url.pathname === "/chat" && req.method === "POST") return await chat(req, env, ctx);
      if (url.pathname === "/summarize" && req.method === "POST") return await summarize(req, env, ctx);
      if (url.pathname === "/transcript") return await transcript(url);
      return json({ error: "Tidak ditemukan." }, 404);
    } catch (e) {
      return json({ error: "Rheus sedang sibuk. Coba lagi sebentar.", detail: String(e && e.message || e).slice(0, 200) }, 500);
    }
  },
};
