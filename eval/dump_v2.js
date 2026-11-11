// Jalankan TranscriptBot 2.0 (versi lama) pada data uji agar bisa dibandingkan dengan versi 3.
// node eval/dump_v2.js input.json  →  JSON ke stdout
"use strict";
const TB = require("./baseline/transcriptbot_v2.js");
const input = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
const out = {};
for (const d of input.docs) {
  const t0 = process.hrtime.bigint();
  const md = TB.summarize(d.segments, { title: d.title || "" });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // Batas kalimat versi 2 (jumlah kata per kalimat) untuk uji kerapian transkrip.
  const sents = TB._analyze(d.segments, d.title || "").sents.map((s) => s.text.split(/\s+/).length);
  out[d.id] = { markdown: md, ms, sentenceWordCounts: sents };
}
process.stdout.write(JSON.stringify(out));
