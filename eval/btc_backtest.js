// Uji balik (walk-forward) model arah Bitcoin RheusInterface dengan data harian Kraken (±2 tahun).
// Jalankan: node eval/btc_backtest.js   (butuh internet)
//
// Pada setiap hari t, model hanya belajar dari hari-hari sebelum t (kalibrasi sejarah), lalu
// tebakannya dibandingkan dengan pergerakan harga sebenarnya h hari kemudian.
// Pembanding: "dasar" = frekuensi historis naik/sideways/turun tanpa melihat sinyal apa pun.
"use strict";
const R = require("./baseline/rheus_v1.js");

(async () => {
  const res = await fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440");
  const j = await res.json();
  const key = Object.keys(j.result).find((k) => k !== "last");
  const closes = j.result[key].map((c) => +c[4]);
  console.log(`Data: ${closes.length} hari harga penutupan BTC/USD (Kraken)\n`);
  console.log("Horizon  Sampel  Akurasi arah*  Selalu-naik  Brier model  Brier dasar  Akurasi saat keyakinan tinggi");

  for (const h of [1, 7, 30]) {
    const scores = R._allScores(closes, h);
    let n = 0, hit = 0, upAlways = 0, brier = 0, brierBase = 0, total = 0, hiN = 0, hiHit = 0;
    for (let t = 330; t + h < closes.length; t++) {
      const cal = R._calibrate(closes, h, scores, t + 1);
      if (!cal) continue;
      const m = R.model(closes.slice(0, t + 1), h, {}, cal);
      const ret = Math.log(closes[t + h] / closes[t]);
      const band = 0.25 * scores[t].vol * Math.sqrt(h);
      const actual = ret > band ? "up" : ret < -band ? "down" : "side";
      const o = { up: +(actual === "up"), side: +(actual === "side"), down: +(actual === "down") };
      brier += (m.probs.up - o.up) ** 2 + (m.probs.side - o.side) ** 2 + (m.probs.down - o.down) ** 2;
      brierBase += (cal.base.up - o.up) ** 2 + (cal.base.side - o.side) ** 2 + (cal.base.down - o.down) ** 2;
      total++;
      if (m.direction !== "side") {
        n++;
        const ok = (m.direction === "up") === (ret > 0);
        hit += ok;
        upAlways += ret > 0;
        if (m.confidence === "tinggi") { hiN++; hiHit += ok; }
      }
    }
    const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "—");
    console.log(
      `${String(h).padStart(3)} hari  ${String(n).padStart(6)}  ${pct(hit, n).padStart(13)}  ${pct(upAlways, n).padStart(11)}  ` +
      `${(brier / total).toFixed(3).padStart(11)}  ${(brierBase / total).toFixed(3).padStart(11)}  ${pct(hiHit, hiN).padStart(10)} (n=${hiN})`
    );
  }
  console.log("\n* Akurasi arah: seberapa sering tebakan naik/turun (bukan sideways) cocok dengan arah harga sebenarnya.");
  console.log("  Brier: makin kecil makin baik. Model hanya berguna jika Brier model < Brier dasar.");
})().catch((e) => { console.error(e); process.exit(1); });
