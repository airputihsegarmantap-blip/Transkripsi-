// Uji Rheus LLM (Cloudflare Worker) tanpa akun Cloudflare: Workers AI & internet ditiru.
//   node eval/worker_test.mjs
import assert from "node:assert/strict";
import worker, { rank, parseCaptions, systemPrompt, chooseTrack } from "../cloud/rheus-llm/worker.js";

const now = Date.now() / 1000;
const KB = { docs: [
  { t: "Harga beras naik di Jakarta", x: "Harga beras medium naik 5 persen.", s: "Kompas", l: "https://k/1", ts: now - 3600, v: 1, c: "ekonomi" },
  { t: "Timnas menang 2-0 atas Vietnam", x: "Gol dicetak di babak kedua.", s: "Detik", l: "https://d/2", ts: now - 7200, v: 0, c: "olahraga" },
  { t: "Warung bakso viral di TikTok", x: "Kuah unik membuat antre panjang.", s: "Detik", l: "https://d/3", ts: now - 600, v: 0, c: "makanan" },
] };
let lastAI = null;
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("knowledge.json")) return new Response(JSON.stringify(KB));
  if (u.includes("wikipedia.org")) return new Response(JSON.stringify({ query: { pages: [{ index: 1, title: "Beras", extract: "Beras adalah bagian bulir padi yang telah dipisah dari sekam. ".repeat(3) }] } }));
  if (u.includes("coingecko")) return new Response(JSON.stringify({ bitcoin: { usd: 90000, idr: 1.4e9, usd_24h_change: 1.5 } }));
  if (u.includes("youtubei/v1/player")) return new Response(JSON.stringify({ videoDetails: { title: "Tes" }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://yt/timedtext?x=1", languageCode: "id", kind: "asr" }] } } }));
  if (u.includes("timedtext")) return new Response('<transcript><text start="0" dur="2">halo semua</text><text start="2" dur="2">apa kabar &amp;amp; selamat</text></transcript>');
  throw new Error("fetch tak terduga: " + u);
};
const env = {
  KNOWLEDGE_URL: "https://x/knowledge.json",
  AI: { run: async (model, opts) => {
    lastAI = { model, opts };
    return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"Harga beras naik [1]."}\n\ndata: [DONE]\n\n')); c.close(); } });
  } },
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const call = async (path, body) => {
  const res = await worker.fetch(new Request("https://w" + path, body ? { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}), env, ctx);
  const text = await res.text();
  await Promise.all(waits);
  return { res, text };
};

// pencarian konteks
assert.equal(rank(KB.docs, "berapa harga beras sekarang")[0].t, "Harga beras naik di Jakarta");
assert.equal(rank(KB.docs, "apa itu")[0], undefined);

// /health
let r = await call("/health");
assert.equal(JSON.parse(r.text).model, "@cf/meta/llama-3.2-3b-instruct");

// /chat: event sumber + token, konteks berita & wikipedia masuk ke system prompt
r = await call("/chat", { messages: [{ role: "user", content: "harga beras naik?" }] });
assert.match(r.res.headers.get("content-type"), /event-stream/);
assert.match(r.text, /^event: sources\ndata: \[/);
assert.match(r.text, /Harga beras naik \[1\]/);
const sys = lastAI.opts.messages[0].content;
assert.match(sys, /\[1\] Harga beras naik di Jakarta — Kompas \(terverifikasi\)/);
assert.match(sys, /Wikipedia/);
assert.equal(lastAI.opts.stream, true);

// pertanyaan bitcoin → harga live masuk konteks
await call("/chat", { messages: [{ role: "user", content: "harga bitcoin hari ini" }] });
assert.match(lastAI.opts.messages[0].content, /BTC = US\$90,000/);

// /chat kosong → 400
r = await call("/chat", { messages: [] });
assert.equal(r.res.status, 400);

// /summarize
r = await call("/summarize", { title: "Video", text: "kata ".repeat(100) });
assert.match(lastAI.opts.messages[0].content, /Ringkas transkrip video/);

// /transcript cadangan
r = await call("/transcript?v=abcdefghijk");
const t = JSON.parse(r.text);
assert.equal(t.segments.length, 2);
assert.equal(t.segments[1].text, "apa kabar & selamat");
assert.equal(t.via, "rheus-cloud");
assert.equal(parseCaptions('<p t="1500" d="500">hai</p>')[0].start, 1.5);
assert.ok(systemPrompt([]).includes("Tidak ada konteks"));

// pilihan bahasa transkripsi
const tk = [
  { baseUrl: "https://yt/en-asr&fmt=srv3", languageCode: "en", kind: "asr", isTranslatable: true },
  { baseUrl: "https://yt/id-manual", languageCode: "id", isTranslatable: true },
  { baseUrl: "https://yt/en-manual", languageCode: "en", isTranslatable: true },
];
assert.deepEqual(chooseTrack(tk, "id"), { url: "https://yt/id-manual", language: "id", source: "manual" });
assert.deepEqual(chooseTrack(tk, "orig"), { url: "https://yt/en-manual", language: "en", source: "manual" });  // video berbahasa Inggris: subtitle manual Inggris
const en = [{ baseUrl: "https://yt/en-asr", languageCode: "en", kind: "asr", isTranslatable: true }];
assert.deepEqual(chooseTrack(en, "id"), { url: "https://yt/en-asr&tlang=id", language: "id", source: "terjemahan" });
assert.deepEqual(chooseTrack(en, "orig"), { url: "https://yt/en-asr", language: "en", source: "otomatis" });
assert.equal(chooseTrack(en, "en").source, "otomatis");
assert.equal(chooseTrack(en, "ja").url, "https://yt/en-asr&tlang=ja");
r = await call("/transcript?v=abcdefghijk&lang=orig");
assert.equal(JSON.parse(r.text).target, "orig");
r = await call("/transcript?v=abcdefghijk&lang=%3Cscript%3E");
assert.equal(JSON.parse(r.text).target, "id");   // masukan aneh → default

console.log("Rheus LLM worker: semua uji lulus ✓");
