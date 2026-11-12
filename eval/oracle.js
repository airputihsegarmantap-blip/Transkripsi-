// Batas atas teoretis peringkas ekstraktif: pilih kalimat (versi yang sudah dirapikan)
// secara greedy untuk memaksimalkan ROUGE-2 terhadap acuan. Tidak ada peringkas
// berbasis pemilihan kalimat yang bisa melebihi angka ini secara konsisten.
global.window = {};
const TB = require("./baseline/transcriptbot_v2.js");
const data = require("./data.json");
const tok = (t) => t.toLowerCase().match(/[a-z0-9]+/g) || [];
const ng = (t, n) => { const m = new Map(); for (let i = 0; i + n <= t.length; i++) { const k = t.slice(i, i + n).join(" "); m.set(k, (m.get(k) || 0) + 1); } return m; };
function r(c, ref, n) { const a = ng(c, n), b = ng(ref, n); let o = 0; for (const [k, v] of a) o += Math.min(v, b.get(k) || 0);
  const p = o / Math.max(1, [...a.values()].reduce((x, y) => x + y, 0)), rc = o / Math.max(1, [...b.values()].reduce((x, y) => x + y, 0)); return p + rc ? 2 * p * rc / (p + rc) : 0; }
let s1 = 0, s2 = 0;
for (const d of data) {
  const w = d.transcript.split(" "), segs = [];
  for (let i = 0; i < w.length; i += 7) segs.push({ start: i, text: w.slice(i, i + 7).join(" ") });
  const sents = TB._analyze(segs, d.title).sents.map((s) => TB.polish(s.text, { maxWords: 40 }));
  const ref = tok(d.reference); let chosen = [], best = 0;
  while (true) { let bi = -1, bv = best;
    sents.forEach((s, i) => { if (chosen.includes(i)) return; const v = r(tok([...chosen.map((j) => sents[j]), s].join(" ")), ref, 2); if (v > bv) { bv = v; bi = i; } });
    if (bi < 0) break; chosen.push(bi); best = bv; }
  const c = tok(chosen.map((j) => sents[j]).join(" "));
  console.log(d.id.padEnd(10), "oracle ROUGE-1", (r(c, ref, 1) * 100).toFixed(1), "ROUGE-2", (best * 100).toFixed(1));
  s1 += r(c, ref, 1); s2 += best;
}
console.log("rata-rata  oracle ROUGE-1", (s1 / data.length * 100).toFixed(1), "ROUGE-2", (s2 / data.length * 100).toFixed(1));
