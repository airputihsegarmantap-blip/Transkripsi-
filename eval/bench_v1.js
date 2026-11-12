// Benchmark RheusInterface 1.0 (JavaScript di HP): ambil & olah semua data dari nol, seperti
// yang dilakukan aplikasi lama setiap kali menu dibuka. Butuh internet.  node eval/bench_v1.js
"use strict";
global.TranscriptBot = require("./baseline/transcriptbot_v2.js");
const R = require("./baseline/rheus_v1.js");
R.configure({ fetchText: (u) => fetch(u, { headers: { "User-Agent": "Mozilla/5.0 SiLengkap-bench" } }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }) });
(async () => {
  const out = {};
  for (const [name, fn] of [["news_crypto", () => R.news("crypto")], ["news_world", () => R.news("world")], ["news_viral", () => R.news("viral")], ["btc_24j", () => R.bitcoin("24j")]]) {
    const t0 = performance.now();
    try { await fn(); out[name] = Math.round(performance.now() - t0); } catch (e) { out[name] = "gagal: " + e.message; }
  }
  // Komputasi saja (tanpa jaringan): kalibrasi + uji balik model Bitcoin.
  const j = await (await fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440")).json();
  const closes = j.result[Object.keys(j.result).find((k) => k !== "last")].map((c) => +c[4]);
  const t0 = performance.now();
  const scores = R._allScores(closes, 1);
  R.model(closes, 1, {}, R._calibrate(closes, 1, scores));
  R.backtest(closes, 1, closes.length - 250, scores);
  out.btc_compute_only = Math.round(performance.now() - t0);
  console.log(JSON.stringify(out));
})();
