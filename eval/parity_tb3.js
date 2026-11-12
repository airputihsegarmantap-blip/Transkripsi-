// Bandingkan TranscriptBot 3 versi HP (JS) dengan versi Python.
// node eval/parity_tb3.js <dir-model> <expected.json>
"use strict";
const fs = require("fs");
const path = require("path");
const TB = require("../web/transcriptbot.js");
const [modelDir, expPath] = process.argv.slice(2);
const buf = fs.readFileSync(path.join(modelDir, "punct.bin"));
TB.load({ punct: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), caseMap: JSON.parse(fs.readFileSync(path.join(modelDir, "case.json"), "utf8")) });
const exp = JSON.parse(fs.readFileSync(expPath, "utf8"));
let labels = 0, labelSame = 0, docs = 0, tidySame = 0, sumSame = 0, ms = 0;
for (const d of exp.docs) {
  const t0 = performance.now();
  const r = TB.process(d.segments, d.title);
  ms += performance.now() - t0;
  docs++;
  if (r.clean.text === d.py.clean.text) tidySame++;
  if (r.markdown === d.py.markdown) sumSame++;
  else if (process.argv.includes("--diff")) console.log("BEDA ringkasan", d.id, "\nJS:\n" + r.markdown + "\nPY:\n" + d.py.markdown);
  const words = TB._cleanWords(TB._wordStream(d.segments)).map(([w]) => w);
  const jl = TB.predict(words);
  d.labels.forEach((l, i) => { labels++; labelSame += l === jl[i]; });
}
const out = { docs, labelAgreement: labelSame / labels, tidyIdentical: tidySame, summaryIdentical: sumSame, jsMsTotal: Math.round(ms) };
console.log(JSON.stringify(out));
