/*
 * TranscriptBot 3 — versi HP (JavaScript). Port 1:1 dari rheus/rheus/transcriptbot.py.
 *
 * Berjalan langsung di HP, tanpa server: transkrip lengkap yang dirapikan (titik & koma dari
 * model machine learning Rheus, huruf kapital, angka digit, paragraf) + ringkasan.
 * Model (bobot tanda baca & kamus huruf kapital) dilatih Rheus Cloud dan dibundel di APK.
 * Konstanta diambil dari tb3-const.js yang dibuat otomatis dari kode Python.
 * Uji paritas (eval/parity_tb3.js) memastikan hasilnya sama dengan versi Python.
 */
(function (root, factory) {
  const C = root.TB3_CONST || (typeof require === "function" ? require("./tb3-const.js") : null);
  const api = factory(C);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TranscriptBot = api;
})(typeof window !== "undefined" ? window : globalThis, function (C) {
  "use strict";

  const VERSION = C.VERSION;
  const rx = (k, extra = "") => new RegExp(C.RX[k].source, C.RX[k].flags + extra);
  const FLUFF = rx("FLUFF"), CONCLUSION = rx("CONCLUSION"), STRONG_CONCL = rx("STRONG_CONCL"), TOPIC_INTRO = rx("TOPIC_INTRO");
  const UNIT_NOUNS = rx("UNIT_NOUNS"), STEP_VERB = rx("STEP_VERB"), LEAD = rx("LEAD"), FLUFF_TAIL = rx("FLUFF_TAIL"), NUM_WORD = rx("NUM_WORD");
  const STOPWORDS = new Set(C.STOPWORDS), SOFT_BREAK = new Set(C.SOFT_BREAK), MULT = new Set(C.MULT);
  const P = C.PUNCT, PSTOP = new Set(P.STOP), DISCOURSE = new Set(P.DISCOURSE);
  const HB = 1 << P.HASH_BITS, MASK = HB - 1;
  const ORD_LABEL = C.ORDINALS.map((o) => o[0].toUpperCase() + o.slice(1));
  const BREAK_BY_FIRST = new Map();
  for (const m of C.BREAK_BEFORE) { if (!BREAK_BY_FIRST.has(m[0])) BREAK_BY_FIRST.set(m[0], []); BREAK_BY_FIRST.get(m[0]).push(m); }

  // ------------------------------------------------------------------ model
  let W = null;      // Float32Array panjang 3 × 2^HASH_BITS
  let CASE = {};     // kata huruf kecil → bentuk yang benar
  function load({ punct, caseMap }) {
    if (punct && punct.length === 3 * HB) W = punct;
    if (caseMap) CASE = caseMap;
  }
  const hasModel = () => !!W;

  // CRC32 (sama dengan zlib.crc32 Python) atas UTF-8.
  const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const HCACHE = new Map();
  function hidx(s) {
    let v = HCACHE.get(s);
    if (v !== undefined) return v;
    const b = enc.encode(s);
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    v = ((c ^ -1) >>> 0) & MASK;
    if (HCACHE.size > 300000) HCACHE.clear();
    HCACHE.set(s, v);
    return v;
  }
  const shape = (w) => (/^\d+$/.test(w) ? "num" : w.length <= 2 ? "short" : "w");
  const bucket = (s) => (s < 8 ? s : s < 12 ? 8 : s < 18 ? 12 : s < 26 ? 18 : 26);

  /** Tebak label tiap celah ("", ",", "."). Sama dengan PunctModel.predict di Python. */
  function predict(words, pPeriod = 0.42, pComma = 0.45, minLen = 4) {
    const n = words.length;
    if (!n) return [];
    if (!W) { const o = new Array(n).fill(""); o[n - 1] = "."; return o; }
    const static3 = new Float64Array(n * 3);
    const add = (i, idx) => { static3[i * 3] += W[idx]; static3[i * 3 + 1] += W[HB + idx]; static3[i * 3 + 2] += W[2 * HB + idx]; };
    for (let i = 0; i < n; i++) {
      const w0 = words[i], w1 = i + 1 < n ? words[i + 1] : "</s>", wm1 = i > 0 ? words[i - 1] : "<s>", w2 = i + 2 < n ? words[i + 2] : "</s>";
      add(i, hidx("w0=" + w0)); add(i, hidx("w1=" + w1)); add(i, hidx("w-1=" + wm1)); add(i, hidx("w2=" + w2));
      add(i, hidx("w0w1=" + w0 + "|" + w1)); add(i, hidx("w-1w0=" + wm1 + "|" + w0));
      add(i, hidx("suf0=" + w0.slice(-3))); add(i, hidx("pre1=" + w1.slice(0, 3)));
      add(i, hidx("shape0=" + shape(w0))); add(i, hidx("shape1=" + shape(w1))); add(i, hidx("bias"));
      if (DISCOURSE.has(w1)) add(i, hidx("w1_discourse"));
      if (PSTOP.has(w0)) add(i, hidx("w0_stop"));
      if (PSTOP.has(w1)) add(i, hidx("w1_stop"));
      if (w1 === "</s>") add(i, hidx("end"));
    }
    const sinceCol = {};
    for (const b of P.SINCE_BUCKETS) { const k = hidx("since=" + b); sinceCol[b] = [W[k], W[HB + k], W[2 * HB + k]]; }
    const out = [];
    let since = 0;
    for (let i = 0; i < n; i++) {
      const sc = sinceCol[bucket(since)];
      const z0 = static3[i * 3] + sc[0], z1 = static3[i * 3 + 1] + sc[1], z2 = static3[i * 3 + 2] + sc[2];
      const m = Math.max(z0, z1, z2);
      const e0 = Math.exp(z0 - m), e1 = Math.exp(z1 - m), e2 = Math.exp(z2 - m), sum = e0 + e1 + e2;
      const pc = e1 / sum, pp = e2 / sum;
      let lab = "";
      if (since + 1 >= minLen && pp >= pPeriod) lab = ".";
      else if (since >= 34 && pp >= 0.15) lab = ".";
      else if (pc >= pComma && since >= 2) lab = ",";
      out.push(lab);
      since = lab === "." ? 0 : since + 1;
    }
    out[n - 1] = ".";
    return out;
  }
  const caseOf = (w) => CASE[w] || w;

  // ------------------------------------------------------------------ angka
  const isNum = (w) => w in C.UNITS || MULT.has(w);
  const stripP = (w) => w.replace(/^[,.]+|[,.]+$/g, "");
  function parseNumber(ws) {
    let total = 0, cur = 0;
    for (const w of ws) {
      if (w in C.UNITS) {
        const v = C.UNITS[w];
        if (v === 100 || v === 1000) { cur = (cur || 1) * v; if (v === 1000) { total += cur; cur = 0; } } else cur += v;
      } else if (w === "puluh") cur = (cur || 1) * 10;
      else if (w === "belas") cur = (cur || 1) + 10;
      else if (w === "ratus") cur = (cur || 1) * 100;
      else if (w === "ribu") { total += (cur || 1) * 1000; cur = 0; }
      else if (w === "juta") { total += (cur || 1) * 1e6; cur = 0; }
      else if (w === "miliar") { total += (cur || 1) * 1e9; cur = 0; }
    }
    return total + cur;
  }
  function numbersToDigits(text) {
    const ws = text.split(" ");
    const out = [];
    let i = 0;
    while (i < ws.length) {
      const lw = stripP(ws[i].toLowerCase());
      if (isNum(lw)) {
        let j = i;
        const group = [];
        while (j < ws.length && isNum(stripP(ws[j].toLowerCase()))) {
          const w = stripP(ws[j].toLowerCase());
          const nxt = j + 1 < ws.length ? stripP(ws[j + 1].toLowerCase()) : "";
          if (group.length && (group[group.length - 1] === "puluh" || group[group.length - 1] === "belas") && (nxt === "puluh" || nxt === "belas")) break;
          group.push(w);
          const trailing = ws[j].slice(ws[j].replace(/[,.]+$/, "").length);
          j++;
          if (trailing) break;
        }
        const nxt = j < ws.length ? stripP(ws[j].toLowerCase()) : "";
        const prev = i > 0 ? ws[i - 1].toLowerCase() : "";
        const keep = group.length === 1 && (group[0] === "satu" || group[0] === "dua") && !UNIT_NOUNS.test(nxt) && !["pos", "nomor", "langkah", "tahap", "ke"].includes(prev);
        if (keep) { out.push(ws[i]); i++; continue; }
        const last = ws[j - 1];
        out.push(String(parseNumber(group)) + last.slice(last.replace(/[,.]+$/, "").length));
        i = j;
      } else { out.push(ws[i]); i++; }
    }
    return out.join(" ")
      .replace(/(\d+) persen/gi, "$1%")
      .replace(/(\d+)%?\s+(\d+)%?\s+(\d+)%?(?=[\s,.]|$)/g, (m, a, b, c) => (+a + +b + +c === 100 ? `${a}/${b}/${c}` : m))
      .replace(/(\d+) derajat celcius/gi, "$1°C")
      .replace(/(\d+) sampai (\d+)/g, "$1–$2");
  }

  // ------------------------------------------------------------------ teks dasar
  function stem(w) {
    for (const s of C.SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) { w = w.slice(0, -s.length); break; }
    for (const p of C.PREFIXES) if (w.startsWith(p) && w.length - p.length >= 4) { w = w.slice(p.length); break; }
    return w;
  }
  const allWords = (t) => t.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) || [];
  const content = (t) => allWords(t).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const tokens = (t) => content(t).map(stem);
  function fmtTime(sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }
  const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };

  // ------------------------------------------------------------------ transkrip rapi
  function wordStream(segments) {
    const out = [];
    for (const seg of segments) {
      const st = Number(seg.start) || 0;
      for (let w of String(seg.text || "").split(/\s+/)) {
        w = w.replace(/^["'(\[]+|["')\]]+$/g, "");
        if (w) out.push([w, st]);
      }
    }
    return out;
  }
  function cleanWords(stream) {
    const low = stream.map(([w]) => w.toLowerCase().replace(/[.,!?;:]+$/, ""));
    const out = [];
    let i = 0;
    outer: while (i < stream.length) {
      for (const seq of C.FILLER_SEQ) {
        let ok = true;
        for (let k = 0; k < seq.length; k++) if (low[i + k] !== seq[k]) { ok = false; break; }
        if (ok) { i += seq.length; continue outer; }
      }
      const w = low[i] in C.NORMALIZE ? C.NORMALIZE[low[i]] : low[i];
      if (!w) { i++; continue; }
      if (out.length && out[out.length - 1][0] === w && !/^\d+$/.test(w)) { i++; continue; }
      out.push([w, stream[i][1]]);
      i++;
    }
    return out;
  }
  function finish(ws) {
    let s = numbersToDigits(ws.join(" ")).replace(/,+$/, "");
    s = s.replace(/\s+,/g, ",");
    s = s.slice(0, 1).toUpperCase() + s.slice(1);
    return s + ".";
  }
  function tidy(stream) {
    if (!stream.length) return { sentences: [], paragraphs: [], text: "" };
    const words = stream.map(([w]) => w);
    const labels = W ? predict(words) : spokenLabels(stream);
    const sentences = [];
    let cur = [], curStart = null;
    for (let i = 0; i < stream.length; i++) {
      const [w, t] = stream[i], lab = labels[i];
      if (curStart === null) curStart = t;
      cur.push(caseOf(w) + (lab === "," ? "," : ""));
      if (lab === ".") { sentences.push({ start: curStart, raw: cur.map((x) => x.replace(/,+$/, "")).join(" "), text: finish(cur) }); cur = []; curStart = null; }
    }
    if (cur.length) sentences.push({ start: curStart, raw: cur.map((x) => x.replace(/,+$/, "")).join(" "), text: finish(cur) });
    const paragraphs = [];
    let para = [], prev = new Set();
    sentences.forEach((s, k) => {
      const tk = new Set(tokens(s.raw));
      let inter = 0;
      for (const x of tk) if (prev.has(x)) inter++;
      const shift = prev.size && tk.size && inter / Math.max(1, Math.min(tk.size, prev.size)) < 0.08;
      const gap = k > 0 && s.start - sentences[k - 1].start > 25;
      if (para.length && (para.length >= 6 || (para.length >= 3 && (shift || gap)))) { paragraphs.push(para); para = []; }
      para.push(s);
      prev = tk;
    });
    if (para.length) paragraphs.push(para);
    const paras = paragraphs.map((p) => ({ start: p[0].start, text: p.map((s) => s.text).join(" ") }));
    return { sentences, paragraphs: paras, text: paras.map((p) => p.text).join("\n\n") };
  }
  /** Tanpa model: titik di batas kalimat ucapan (cadangan bila model belum tersedia). */
  function spokenLabels(stream) {
    const labels = new Array(stream.length).fill("");
    let k = 0;
    for (const u of spokenSentences(stream)) { k += u.words.length; labels[k - 1] = "."; }
    return labels;
  }

  // ------------------------------------------------------------------ unit kalimat ringkasan
  function spokenSentences(stream, minWords = 4, maxWords = 28) {
    const out = [];
    let buf = [];
    const flush = () => { if (buf.length) out.push({ start: buf[0][1], words: buf.map(([w]) => w) }); buf = []; };
    const low = stream.map(([w]) => w);
    for (let i = 0; i < stream.length; i++) {
      const cands = BREAK_BY_FIRST.get(low[i]);
      if (cands && buf.length >= minWords && cands.some((m) => m.every((t, k) => low[i + k] === t))) flush();
      if (buf.length >= minWords + 2 && STEP_VERB.test(low[i])) flush();
      buf.push(stream[i]);
      if (buf.length >= maxWords) {
        let cut = -1;
        for (let k = buf.length - 1; k >= minWords; k--) if (SOFT_BREAK.has(buf[k][0])) { cut = k; break; }
        if (cut > 0) { const rest = buf.slice(cut); buf = buf.slice(0, cut); flush(); buf = rest; } else flush();
      }
    }
    flush();
    const merged = [];
    for (const s of out) { if (merged.length && s.words.length < 4) merged[merged.length - 1].words.push(...s.words); else merged.push(s); }
    return merged;
  }
  function renderSentence(words) {
    const labels = predict(words, 1.1);
    return finish(words.map((w, i) => caseOf(w) + (labels[i] === "," && i < words.length - 1 ? "," : "")));
  }

  // ------------------------------------------------------------------ ringkasan
  const CUT_RE = /^(karena|sehingga|supaya|agar|kalau|misalnya|contohnya|sedangkan|yaitu|seperti|dengan|untuk|setelah|lalu|dan)$/i;
  function compress(t, maxWords = 26) {
    const ws = t.replace(/\.+$/, "").split(" ");
    if (ws.length <= maxWords) return t;
    for (let k = maxWords; k > 9; k--) if (ws[k - 1].endsWith(",")) return ws.slice(0, k).join(" ").replace(/,+$/, "") + ".";
    for (let k = maxWords; k > 9; k--) if (CUT_RE.test(ws[k])) return ws.slice(0, k).join(" ").replace(/,+$/, "") + ".";
    return ws.slice(0, maxWords).join(" ").replace(/,+$/, "") + ".";
  }
  function polish(t, maxWords = 26) {
    t = t.replace(/\.+$/, "").replace(FLUFF_TAIL, "").trim();
    t = t.replace(LEAD, "");
    t = t.replace(/^yang (pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir)\s+/i, (m, a) => a + ", ");
    t = t.replace(/^(pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir|kesimpulannya|intinya|kuncinya)\s+(?!,)/i, (m, a) => a + ", ");
    t = compress(t.trim() + ".", maxWords);
    return t && t !== "." ? t.slice(0, 1).toUpperCase() + t.slice(1) : "";
  }
  function textrank(vecs) {
    const n = vecs.length;
    const sim = vecs.map((a, i) => vecs.map((b, j) => { if (i === j) return 0; let s = 0; for (const [k, x] of a) { const y = b.get(k); if (y) s += x * y; } return s < 0.05 ? 0 : s; }));
    const rows = sim.map((r) => r.reduce((x, y) => x + y, 0) || 1);
    let pr = new Array(n).fill(1 / n);
    for (let it = 0; it < 40; it++) {
      const nx = new Array(n).fill(0.15 / n);
      for (let i = 0; i < n; i++) { const p = pr[i] / rows[i]; if (!p) continue; const r = sim[i]; for (let j = 0; j < n; j++) if (r[j]) nx[j] += 0.85 * r[j] * p; }
      pr = nx;
    }
    const mx = Math.max(...pr) || 1;
    return pr.map((x) => x / mx);
  }
  function keyphrases(texts, k = 8) {
    const counts = new Map();
    for (const t of texts) {
      const ws = allWords(t);
      for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= ws.length; i++) {
        const g = ws.slice(i, i + n);
        if (g.some((w) => STOPWORDS.has(w) || w.length < 3)) continue;
        const key = g.join(" ");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const scored = [...counts].filter(([p, c]) => c >= 2 && (p.includes(" ") || p.length >= 5))
      .map(([p, c]) => [p, c * Math.pow(p.split(" ").length, 1.6)]).sort((a, b) => b[1] - a[1]);
    let chosen = [];
    for (const [p] of scored) {
      if (chosen.some((c) => c.includes(p))) continue;
      chosen = chosen.filter((c) => !p.includes(c));
      chosen.push(p);
      if (chosen.length >= k) break;
    }
    return chosen;
  }
  function detectList(stream) {
    const low = stream.map(([w]) => w);
    const marks = [];
    let expect = 0;
    for (let i = 0; i < low.length; i++) {
      if (expect < C.ORDINALS.length && low[i] === C.ORDINALS[expect] && !["kali", "orang", "tangan", "belah"].includes(low[i + 1] || "")) { marks.push(i); expect++; }
    }
    if (marks.length < 3) return null;
    for (let i = marks[marks.length - 1] + 3; i < low.length; i++) if (low[i] === "terakhir") { marks.push(i); break; }
    const items = [];
    marks.forEach((idx, m) => {
      const start = idx + 1;
      let end = m + 1 < marks.length ? marks[m + 1] : Math.min(low.length, start + 40);
      while (end > start && ["yang", "langkah", "tips", "cara", "poin", "hal", "dan"].includes(low[end - 1])) end--;
      let cut = end;
      for (let i = start + 6; i < end; i++) {
        if (["nah", "kesimpulannya", "intinya", "semoga"].includes(low[i]) || ["sampai jumpa", "terima kasih", "jangan lupa"].includes(low.slice(i, i + 2).join(" "))) { cut = i; break; }
      }
      let text = numbersToDigits(low.slice(start, Math.min(cut, start + 30)).join(" "));
      const ws = text.split(/\s+/).filter(Boolean);
      if (ws.length < 3) return;
      if (ws.length > 20) {
        const stop = ws.findIndex((w, k) => k >= 12 && ["karena", "kalau", "misalnya", "contohnya", "sedangkan", "banyak"].includes(w));
        text = stop > 0 ? ws.slice(0, stop).join(" ") : compress(text, 24).replace(/\.+$/, "");
      }
      text = text.replace(/\s+(?:dan|yang|karena|untuk|dengan|atau|di|ke|dari|itu|ini|jadi|nah|seperti|kalau|tapi|juga)$/, "");
      const label = low[idx] === "terakhir" ? "Terakhir" : ORD_LABEL[m];
      items.push({ start: stream[idx][1], label, text: text.slice(0, 1).toUpperCase() + text.slice(1) + "." });
    });
    return items.length >= 3 ? items : null;
  }
  function overview(sents, phrases, title) {
    const intro = sents.slice(0, Math.max(3, Math.ceil(sents.length * 0.15))).map((s) => s.raw).join(" ");
    const m = TOPIC_INTRO.exec(intro);
    const titleT = new Set(tokens(title));
    if (m) {
      const ws = m[1].split(/\s+/).filter(Boolean);
      const stop = ws.findIndex((w, k) => k >= 2 && /^(jadi|nah|langsung|bahannya|kita|aku|saya|terus|oke|pertama|dan|yang|minggu|sekarang|secara|karena)$/i.test(w));
      const topic = ws.slice(0, stop > 0 ? stop : 10).join(" ").replace(/[,.]$/, "");
      const tt = tokens(topic);
      if (tt.length >= 2 && (!titleT.size || tt.some((w) => titleT.has(w)))) return `Video ini membahas ${topic}.`;
    }
    if (title) {
      const t = title.replace(/[.!?]+$/, "").replace(/\s*[|\-–—]\s*[^|\-–—]*$/, "").trim();
      return `Video ini membahas ${t.slice(0, 1).toLowerCase() + t.slice(1)}.`;
    }
    if (phrases.length >= 2) { const p = phrases.slice(0, 3); return "Video ini membahas " + (p.length === 3 ? `${p[0]}, ${p[1]}, dan ${p[2]}` : p.join(" dan ")) + "."; }
    return "";
  }

  function summarize(stream, title = "") {
    const units = spokenSentences(stream);
    const rendered = new Map();
    const text = (i) => { if (!rendered.has(i)) rendered.set(i, renderSentence(units[i].words)); return rendered.get(i); };
    const sents = units.map((u, i) => ({ i, start: u.start, raw: u.words.join(" ") }));
    const n = sents.length;
    if (!n) return { overview: "", short: "", points: [], details: [], isList: false, conclusion: "", keywords: [] };

    const toks = sents.map((s) => tokens(s.raw));
    const df = new Map();
    for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
    const vecs = toks.map((t) => {
      const tf = new Map();
      for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
      const v = new Map();
      let norm = 0;
      for (const [w, c] of tf) { const x = (1 + Math.log(c)) * (Math.log((n + 1) / (df.get(w) + 1)) + 1); v.set(w, x); norm += x * x; }
      norm = Math.sqrt(norm) || 1;
      for (const [w, x] of v) v.set(w, x / norm);
      return v;
    });
    const dot = (a, b) => { let s = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const [k, v] of x) { const u = y.get(k); if (u) s += v * u; } return s; };
    const pr = textrank(vecs);
    const phrases = keyphrases(sents.map((s) => s.raw), 10);
    const pstems = phrases.map(tokens);
    const titleT = new Set(tokens(title));
    const scores = sents.map((s, i) => {
      const ts = new Set(toks[i]);
      let sc = pr[i];
      const hits = pstems.filter((ps) => ps.length && ps.every((w) => ts.has(w))).length;
      sc += (0.25 * Math.min(hits, 3)) / 3;
      if (titleT.size) sc += (0.2 * [...titleT].filter((w) => ts.has(w)).length) / titleT.size;
      if (NUM_WORD.test(s.raw)) sc += 0.08;
      if (toks[i].length < 4) sc *= 0.5;
      if (FLUFF.test(s.raw)) sc *= 0.15;
      return sc;
    });
    const mmr = (cands, k, lam = 0.7, exclude = new Set()) => {
      const chosen = [], pool = cands.filter((c) => !exclude.has(c));
      while (chosen.length < k && pool.length) {
        let best = null, bv = -1e9;
        for (const i of pool) {
          let red = 0;
          if (chosen.length) red = Math.max(...chosen.map((j) => dot(vecs[i], vecs[j]) + (Math.abs(i - j) <= 1 ? 0.25 : 0)));
          const v = lam * scores[i] - (1 - lam) * red;
          if (v > bv) { best = i; bv = v; }
        }
        chosen.push(best);
        pool.splice(pool.indexOf(best), 1);
      }
      return chosen;
    };
    const order = sents.map((_, i) => i);
    const listItems = detectList(stream);
    let concl = null;
    if (n >= 5) {
      const tail = order.slice(Math.floor(n * 0.6));
      const explicit = tail.filter((k) => CONCLUSION.test(sents[k].raw) && polish(text(k)).split(" ").length >= 5);
      const strong = explicit.filter((k) => STRONG_CONCL.test(sents[k].raw));
      const pool = strong.length ? strong : explicit;
      const argmax = (arr) => arr.reduce((a, b) => (scores[b] > scores[a] ? b : a));
      if (pool.length) concl = argmax(pool);
      else { const cand = tail.filter((k) => !FLUFF.test(sents[k].raw)); concl = cand.length ? argmax(cand) : null; }
    }
    const excl = new Set(concl === null ? [] : [concl]);
    const lead = overview(sents, phrases, title);
    const shortIdx = mmr(order.filter((i) => !FLUFF.test(sents[i].raw)), 1, 0.65, excl);
    const kPoints = Math.max(4, Math.min(8, pyRound(n * 0.3)));
    const pointIdx = mmr(order, Math.min(kPoints, n), 0.7, listItems ? excl : new Set([...excl, ...shortIdx]))
      .filter((i) => !FLUFF.test(sents[i].raw) || scores[i] > 0.5).sort((a, b) => a - b);
    const conclusion = concl !== null ? polish(text(concl), 28) : "";
    let short, points, details = [];
    if (listItems) {
      short = [lead, `Ada ${listItems.length} poin utama yang dijelaskan.`, conclusion].filter(Boolean).join(" ");
      points = listItems;
      const covered = listItems.map((it) => new Set(tokens(it.text)));
      for (const i of pointIdx) {
        const t = new Set(toks[i]);
        if (FLUFF.test(sents[i].raw) || i === concl) continue;
        if (covered.some((c) => [...t].filter((w) => c.has(w)).length / Math.max(1, t.size) > 0.4)) continue;
        details.push({ start: sents[i].start, text: polish(text(i)) });
      }
      details = details.slice(0, 3);
    } else {
      short = [lead, ...shortIdx.map((i) => polish(text(i), 30))].filter(Boolean).join(" ");
      points = pointIdx.map((i) => ({ start: sents[i].start, label: "", text: polish(text(i)) }));
    }
    return { overview: lead, short, points, details, isList: !!listItems, conclusion, keywords: phrases.slice(0, 8) };
  }

  function toMarkdown(d) {
    const L = ["## Ringkasan Singkat", d.short, ""];
    if (d.isList) {
      L.push(`## ${d.points.length} Poin Utama`, ...d.points.map((p) => `- **[${fmtTime(p.start)}] ${p.label}:** ${p.text}`));
      if (d.details.length) L.push("", "## Detail Penting", ...d.details.map((p) => `- **[${fmtTime(p.start)}]** ${p.text}`));
    } else L.push("## Poin-Poin Utama", ...d.points.map((p) => `- **[${fmtTime(p.start)}]** ${p.text}`));
    if (d.conclusion) L.push("", "## Kesimpulan", d.conclusion);
    if (d.keywords.length) L.push("", "## Kata Kunci", d.keywords.join(", "));
    L.push("", `_Diringkas oleh TranscriptBot ${VERSION} (Rheus)._`);
    return L.join("\n");
  }

  /** Proses lengkap: segmen subtitle → transkrip rapi + ringkasan. */
  function process(segments, title = "") {
    const stream = cleanWords(wordStream(segments));
    const td = tidy(stream);
    const summary = summarize(stream, title || "");
    return { version: VERSION, clean: { paragraphs: td.paragraphs, text: td.text }, summary, markdown: toMarkdown(summary), model: hasModel() };
  }

  return { VERSION, load, hasModel, process, predict, numbersToDigits, fmtTime, _hidx: hidx, _spokenSentences: spokenSentences, _cleanWords: cleanWords, _wordStream: wordStream };
});
