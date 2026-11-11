// Uji RheusInterface dengan data tiruan (format sama dengan sumber asli).
// Jalankan: node eval/rheus_test.js        (tiruan)
//           node eval/rheus_test.js --live (sumber internet sungguhan, butuh jaringan)
"use strict";
const assert = require("assert");
global.TranscriptBot = require("../shared/transcriptbot.js");
const R = require("../shared/rheus.js");
const live = process.argv.includes("--live");
const { mockFetch } = require("./fixtures.js");

const liveFetch = (u) => fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) SiLengkap" } })
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });

(async () => {
  R.configure({
    fetchText: live ? liveFetch : mockFetch,
    getTranscript: async () => {
      const d = require("./data.json")[0];
      const w = d.transcript.split(" ");
      return { video_id: "x", title: d.title, language: "id", source: "otomatis",
        segments: Array.from({ length: Math.ceil(w.length / 7) }, (_, i) => ({ start: i * 3, duration: 3, text: w.slice(i * 7, i * 7 + 7).join(" ") })) };
    },
  });

  for (const ch of R.channels) {
    try {
      const n = await R.news(ch);
      console.log(`\n[${ch}] ${n.stats.articles} artikel → ${n.stats.stories} cerita, forum ${n.stats.forumPosts}`);
      n.hot.forEach((h, i) => console.log(`  HOT#${i + 1} ${h.title} (${h.sources.length} sumber, ${h.time}) — ${h.excerpt.slice(0, 90)}`));
      n.list.slice(0, 4).forEach((a) => console.log(`  • ${a.title} · ${a.source} · ${a.time}`));
      if (!live && ch === "crypto") {
        assert.ok(n.hot[0].title.includes("ETF Bitcoin"), "cerita ETF harus jadi HOT #1");
        assert.ok(n.hot[0].sources.length >= 2, "cerita ETF digabung dari ≥2 sumber");
        assert.ok(!n.list.concat(n.hot).some((a) => a.title.includes("IHSG")), "berita non-kripto CNBC tersaring");
        assert.ok(!n.list.concat(n.hot).some((a) => a.title.includes("bundesliga")), "judul spam tersaring");
        console.log("  " + R.explain(n.hot[0]));
      }
    } catch (e) {
      if (live) console.log(`[${ch}] GAGAL: ${e.message}`);
      else if (ch === "crypto") throw e;
    }
  }
  for (const tf of Object.keys(R.TFS)) {
    const b = await R.bitcoin(tf);
    const p = b.model.probs;
    console.log(`\n[btc ${tf}] $${b.price.toFixed(0)} (${b.change.toFixed(2)}%) Rp${(b.priceIdr / 1e6).toFixed(0)} jt · arah ${b.model.direction} (${b.model.confidence}) target $${b.model.target.toFixed(0)}`);
    console.log(`  naik ${(p.up * 100).toFixed(0)}% / sideways ${(p.side * 100).toFixed(0)}% / turun ${(p.down * 100).toFixed(0)}% · S ${b.support.toFixed(0)} R ${b.resistance.toFixed(0)} · RSI ${b.market.rsi.toFixed(0)} · F&G ${b.market.fng && b.market.fng.value}`);
    console.log("  alasan: " + b.model.reasons.slice(0, 3).map((r) => r.text).join("; "));
    assert.ok(Math.abs(p.up + p.side + p.down - 1) < 1e-9);
    assert.ok(b.support <= b.price && b.resistance >= b.price, "support ≤ harga ≤ resistance");
    assert.ok(b.model.history && b.model.history.n > 0, "probabilitas berasal dari kalibrasi sejarah");
  }
  if (!live) {
    const t = await R.transcribe("https://youtu.be/x");
    console.log(`\n[transkripsi] ${t.digest.points.length} poin, kata kunci: ${t.digest.keywords.slice(0, 3).join(", ")}`);
  }
  console.log("\nOK");
})().catch((e) => { console.error(e); process.exit(1); });
