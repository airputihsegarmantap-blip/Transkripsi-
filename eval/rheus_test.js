// Uji RheusInterface dengan data tiruan (format sama dengan sumber asli).
// Jalankan: node eval/rheus_test.js        (tiruan)
//           node eval/rheus_test.js --live (sumber internet sungguhan, butuh jaringan)
"use strict";
const assert = require("assert");
global.TranscriptBot = require("../shared/transcriptbot.js");
const R = require("../shared/rheus.js");
const live = process.argv.includes("--live");
const NOW = Date.now();

function gnItem(title, src, minsAgo, related = 0) {
  const lis = Array.from({ length: related }, (_, i) => `<li><a href="x">${title} ${i}</a>&nbsp;&nbsp;<font>Media ${i}</font></li>`).join("");
  const esc = ("<ol>" + lis + "</ol>").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<item><title>${title} - ${src}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(title)}</link>` +
    `<pubDate>${new Date(NOW - minsAgo * 60000).toUTCString()}</pubDate><description>${esc}</description><source url="https://x">${src}</source></item>`;
}
const FIX = {
  "news.google.com/rss/search?q=kripto": `<rss><channel>${[
    gnItem("ETF Bitcoin catat arus masuk US$1,2 miliar dalam sepekan", "CNBC Indonesia", 30, 5),
    gnItem("Arus masuk ETF Bitcoin capai US$1,2 miliar sepekan", "Kontan", 50, 2),
    gnItem("Ethereum siapkan upgrade jaringan bulan depan", "Bisnis.com", 90, 1),
    gnItem("OJK terbitkan aturan baru pedagang aset kripto", "Kompas", 120, 3),
    gnItem("Harga Solana naik 8 persen hari ini", "Detik", 200, 0),
  ].join("")}</channel></rss>`,
  "cnbcindonesia.com/market/rss": `<rss><channel><item><title><![CDATA[Bitcoin Tembus Level Baru, Investor Ritel Kembali]]></title><link>https://cnbc/1</link><pubDate>${new Date(NOW - 40 * 60000).toUTCString()}</pubDate><description><![CDATA[<img src="x"> Harga bitcoin kembali menguat seiring meningkatnya minat investor ritel di bursa lokal.]]></description></item><item><title>IHSG ditutup menguat</title><link>https://cnbc/2</link><pubDate>${new Date(NOW).toUTCString()}</pubDate><description>Saham bank naik.</description></item></channel></rss>`,
  "reddit.com/r/CryptoCurrency": `<feed><entry><title>Bitcoin ETF inflows hit 1.2 billion this week</title><link href="https://reddit/1"/><updated>${new Date(NOW).toISOString()}</updated><content>submitted by user</content></entry></feed>`,
};

function mockFetch(url) {
  for (const [k, v] of Object.entries(FIX)) if (url.includes(k)) return Promise.resolve(v);
  if (url.includes("kraken")) {
    const interval = +url.match(/interval=(\d+)/)[1];
    // Deret harga sintetis yang berakhir di sekitar 74.000 (sama dengan harga spot tiruan).
    let p = 74007 / Math.exp(720 * 0.0005);
    const rows = [];
    for (let i = 0; i < 720; i++) {
      const o = p;
      p *= Math.exp(0.0005 + 0.012 * Math.sin(i / 9) * (i % 3 === 0 ? 1 : -0.6));
      rows.push([Math.floor((NOW - (720 - i) * interval * 60000) / 1000), "" + o, "" + Math.max(o, p) * 1.01, "" + Math.min(o, p) * 0.99, "" + p, "0", "10", 5]);
    }
    return Promise.resolve(JSON.stringify({ error: [], result: { XXBTZUSD: rows, last: 1 } }));
  }
  if (url.includes("simple/price")) return Promise.resolve('{"bitcoin":{"usd":74007,"usd_24h_vol":28283954460.9,"usd_24h_change":1.13,"idr":1346530208}}');
  if (url.includes("alternative.me")) return Promise.resolve('{"data":[{"value":"29","value_classification":"Fear"}]}');
  if (url.includes("coingecko.com/api/v3/global")) return Promise.resolve('{"data":{"market_cap_percentage":{"btc":57.4}}}');
  if (url.includes("okx.com")) return Promise.resolve('{"code":"0","data":[{"fundingRate":"0.0000452"}]}');
  return Promise.reject(new Error("tidak ada fixture: " + url));
}

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
  }
  if (!live) {
    const t = await R.transcribe("https://youtu.be/x");
    console.log(`\n[transkripsi] ${t.digest.points.length} poin, kata kunci: ${t.digest.keywords.slice(0, 3).join(", ")}`);
  }
  console.log("\nOK");
})().catch((e) => { console.error(e); process.exit(1); });
