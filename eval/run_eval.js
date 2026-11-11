// Evaluasi TranscriptBot vs peringkas lama (baseline).
// Jalankan: node eval/run_eval.js
// Metrik: ROUGE-1/2/L F1 terhadap ringkasan acuan buatan manusia, jumlah kata pengisi,
// tingkat pengulangan antar-kalimat, dan panjang ringkasan.
"use strict";
const fs = require("fs");
const path = require("path");

global.window = {};
require("./baseline_summarizer.js");
const baseline = (segs) => window.LocalSummarizer.summarize(segs);
const TranscriptBot = require("../shared/transcriptbot.js");
const bot = (segs, title) => TranscriptBot.summarize(segs, { title });

const file = process.argv.find((a) => a.endsWith(".json")) || path.join(__dirname, "data.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

function toSegments(text) {
  const w = text.split(/\s+/);
  const segs = [];
  for (let i = 0; i < w.length; i += 7) segs.push({ start: (i / 7) * 3, text: w.slice(i, i + 7).join(" ") });
  return segs;
}

/** Ambil isi ringkasan saja (tanpa judul bagian, kata kunci, catatan kaki, stempel waktu). */
function body(md) {
  const out = [];
  let skip = false;
  for (const line of md.split("\n")) {
    if (/^##\s*Kata Kunci/i.test(line)) { skip = true; continue; }
    if (/^##/.test(line)) { skip = false; continue; }
    if (skip || /^_/.test(line) || !line.trim()) continue;
    out.push(line.replace(/\*\*\[[\d:]+\][^*]*\*\*/g, "").replace(/^[-*]\s*/, "").replace(/[*_]/g, ""));
  }
  return out.join(" ");
}

const tok = (t) => t.toLowerCase().match(/[a-z0-9]+/g) || [];
function ngrams(t, n) {
  const m = new Map();
  for (let i = 0; i + n <= t.length; i++) { const k = t.slice(i, i + n).join(" "); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function rougeN(c, r, n) {
  const a = ngrams(c, n), b = ngrams(r, n);
  let ov = 0; for (const [k, v] of a) ov += Math.min(v, b.get(k) || 0);
  const p = ov / Math.max(1, [...a.values()].reduce((x, y) => x + y, 0));
  const rc = ov / Math.max(1, [...b.values()].reduce((x, y) => x + y, 0));
  return p + rc ? (2 * p * rc) / (p + rc) : 0;
}
function rougeL(c, r) {
  const dp = Array.from({ length: c.length + 1 }, () => new Array(r.length + 1).fill(0));
  for (let i = 1; i <= c.length; i++) for (let j = 1; j <= r.length; j++)
    dp[i][j] = c[i - 1] === r[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const l = dp[c.length][r.length], p = l / Math.max(1, c.length), rc = l / Math.max(1, r.length);
  return p + rc ? (2 * p * rc) / (p + rc) : 0;
}
const FILLERS = new Set(["eh", "gitu", "sih", "deh", "dong", "nih", "tuh", "guys", "banget", "aja", "nah", "oke", "ya", "kan", "loh", "nggak", "gak", "udah"]);
function fillerCount(t) { return tok(t).filter((w) => FILLERS.has(w)).length; }
function redundancy(md) {
  const sents = body(md).split(/(?<=[.!?])\s+/).map((s) => new Set(tok(s).filter((w) => w.length > 3))).filter((s) => s.size >= 3);
  let tot = 0, cnt = 0;
  for (let i = 0; i < sents.length; i++) for (let j = i + 1; j < sents.length; j++) {
    const inter = [...sents[i]].filter((w) => sents[j].has(w)).length;
    tot += inter / Math.min(sents[i].size, sents[j].size); cnt++;
  }
  return cnt ? tot / cnt : 0;
}

function evaluate(name, fn) {
  const rows = data.map((d) => {
    const md = fn(toSegments(d.transcript), d.title);
    const c = tok(body(md)), r = tok(d.reference);
    return { id: d.id, r1: rougeN(c, r, 1), r2: rougeN(c, r, 2), rl: rougeL(c, r),
      filler: fillerCount(body(md)), red: redundancy(md), len: c.length, md };
  });
  const avg = (k) => rows.reduce((a, x) => a + x[k], 0) / rows.length;
  return { name, rows, avg: { r1: avg("r1"), r2: avg("r2"), rl: avg("rl"), filler: avg("filler"), red: avg("red"), len: avg("len") } };
}

const results = [evaluate("Peringkas lama", baseline), evaluate("TranscriptBot", bot)];
const f = (x) => (x * 100).toFixed(1);
console.log("\nPer video (ROUGE-2 F1):");
for (const d of data) console.log(`  ${d.id.padEnd(10)} lama ${f(results[0].rows.find((r) => r.id === d.id).r2).padStart(5)}  →  TranscriptBot ${f(results[1].rows.find((r) => r.id === d.id).r2).padStart(5)}`);
console.log("\nRata-rata             ROUGE-1  ROUGE-2  ROUGE-L  Kata pengisi  Pengulangan  Panjang(kata)");
for (const r of results) {
  const a = r.avg;
  console.log(`  ${r.name.padEnd(18)} ${f(a.r1).padStart(7)}  ${f(a.r2).padStart(7)}  ${f(a.rl).padStart(7)}  ${a.filler.toFixed(1).padStart(12)}  ${f(a.red).padStart(10)}%  ${a.len.toFixed(0).padStart(12)}`);
}
const [o, nw] = results.map((r) => r.avg);
console.log(`\nPeningkatan relatif: ROUGE-1 ${(100 * (nw.r1 / o.r1 - 1)).toFixed(0)}%, ROUGE-2 ${(100 * (nw.r2 / o.r2 - 1)).toFixed(0)}%, ROUGE-L ${(100 * (nw.rl / o.rl - 1)).toFixed(0)}%`);
if (process.argv.includes("--show")) for (const r of results[1].rows) console.log(`\n===== ${r.id}\n${r.md}`);
