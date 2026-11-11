// Peringkas lokal TranskripKu (port JavaScript dari local_summarizer.py).
// Extractive: memilih kalimat terpenting dari transkrip (TF-IDF + sentralitas).
// Berjalan offline, tanpa model, tanpa API key.
(function (global) {
  "use strict";

  const STOPWORDS = new Set(`
ada adalah adanya agak agar akan akhirnya aku akulah amat anda andalah antara apa apaan apabila
apakah apalagi atau ataukah ataupun aja aj ah bagai bagaimana bagi bahkan bahwa bahwasanya baik
banyak barangkali bawah beberapa begini begitu belum benar berapa berbagai bersama betul biasa
biasanya bila bisa boleh bukan bukankah cuma cukup dahulu dalam dan dapat dari daripada dekat
demi demikian dengan depan di dia dialah diri dirinya dong dulu enggak engga ga gak gimana gitu
gini guys halo hai hal hanya harus hingga ia ialah ini inilah itu itulah iya ya jadi jika jangan
juga justru kah kalau kali kalian kami kamu kan karena kata ke kebetulan kecil kemudian kenapa
kepada ketika kini kita kok lagi lah lain lalu lama langsung lebih loh lho maka mana masih mau
memang mereka meski mungkin nah namun nanti nya oh oke ok pada padahal para pasti pernah pula
pun punya sajalah saja sambil sampai sangat saat sama sebab sebagai sebelum sebenarnya
sebuah secara sedang sedikit segala sehingga sejak sekali sekarang sekitar selain selalu seluruh
semua sementara semuanya sendiri seperti sering serta sesuatu setelah setiap siapa sih sini situ
supaya tadi tak tapi tanpa tentang tentu terhadap terus tetapi tidak toh udah sudah untuk walau
yaitu yakni yang uh eh hmm em ehm nih tuh deh dah kayak kaya banget bener benar-benar teman
temen teman-teman selamat datang channel video subscribe like comment
satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas puluh belas ratus ribu juta
pertama kedua ketiga keempat kelima keenam ketujuh kedelapan kesembilan kesepuluh terakhir
buat bikin orang kayaknya pokoknya kemarin tahu tau lihat liat`.split(/\s+/).filter(Boolean));

  const BREAK_BEFORE = [
    "yang pertama", "yang kedua", "yang ketiga", "yang keempat", "yang kelima", "yang keenam",
    "yang ketujuh", "yang terakhir", "pertama", "kedua", "ketiga", "keempat", "kelima",
    "selanjutnya", "berikutnya", "kemudian", "setelah itu", "selain itu", "nah", "jadi",
    "kesimpulannya", "intinya", "oleh karena itu", "makanya", "tapi", "tetapi", "namun",
    "sedangkan", "misalnya", "contohnya", "kalau", "karena itu", "terakhir",
    "semoga", "jangan lupa", "sampai jumpa", "terima kasih", "oke",
  ].map((p) => p.split(" ")).sort((a, b) => b.length - a.length);

  const FLUFF = /subscribe|like dan|lonceng|notifikasi|selamat datang|sampai jumpa|semoga bermanfaat|terima kasih sudah menonton|assalamualaikum|wassalam|link di deskripsi|komen/i;
  const CONCLUSION = /kesimpulan|intinya|jadi\s|pada akhirnya|singkatnya|ringkasnya/i;

  const PREFIXES = ["meng", "meny", "mem", "men", "me", "peng", "peny", "pem", "pen", "pe", "ber", "be", "ter", "di", "ke", "se"];
  const SUFFIXES = ["kannya", "annya", "nya", "kan", "an", "i", "lah", "kah", "pun"];

  function stem(word) {
    let w = word;
    for (const s of SUFFIXES) {
      if (w.endsWith(s) && w.length - s.length >= 4) { w = w.slice(0, -s.length); break; }
    }
    for (const p of PREFIXES) {
      if (w.startsWith(p) && w.length - p.length >= 4) { w = w.slice(p.length); break; }
    }
    return w;
  }

  function tokens(text) {
    return (text.toLowerCase().match(/[a-z]+/g) || [])
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem);
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  function makeSentences(segments, minWords = 6, maxWords = 35) {
    const words = [];
    for (const seg of segments) {
      for (const w of (seg.text || "").split(/\s+/)) if (w) words.push([w, Number(seg.start) || 0]);
    }
    const out = [];
    let buf = [];
    const flush = () => {
      if (buf.length) out.push({ start: buf[0][1], text: buf.map((x) => x[0]).join(" ") });
      buf = [];
    };
    for (let i = 0; i < words.length; i++) {
      if (buf.length >= minWords) {
        const lower = words.slice(i, i + 3).map((x) => x[0].toLowerCase().replace(/[,.!?]/g, ""));
        if (BREAK_BEFORE.some((m) => m.every((t, k) => lower[k] === t))) flush();
      }
      buf.push(words[i]);
      if (/[.!?]$/.test(words[i][0]) && buf.length >= 4) flush();
      else if (buf.length >= maxWords) flush();
    }
    flush();
    const merged = [];
    for (const s of out) {
      if (merged.length && s.text.split(" ").length < 5) merged[merged.length - 1].text += " " + s.text;
      else merged.push(s);
    }
    return merged;
  }

  function tidy(text) {
    text = text.replace(/\s+/g, " ").trim().replace(/^(?:nah|oke|ok|jadi|ya|terus)\s+/i, "");
    if (text) text = text[0].toUpperCase() + text.slice(1);
    if (text && !/[.!?]$/.test(text)) text += ".";
    return text;
  }

  function score(segments) {
    const sents = makeSentences(segments);
    const toks = sents.map((s) => tokens(s.text));
    const n = sents.length;
    if (!n) return { sents, toks, scores: [], keywords: [] };

    const df = new Map();
    for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
    const idf = new Map();
    for (const [w, c] of df) idf.set(w, Math.log((n + 1) / (c + 1)) + 1);

    const vecs = toks.map((t) => {
      const tf = new Map();
      for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
      const v = new Map();
      let norm = 0;
      for (const [w, c] of tf) { const x = (c / t.length) * idf.get(w); v.set(w, x); norm += x * x; }
      norm = Math.sqrt(norm) || 1;
      for (const [w, x] of v) v.set(w, x / norm);
      return v;
    });

    const total = new Map();
    for (const t of toks) for (const w of t) total.set(w, (total.get(w) || 0) + 1);
    const keywords = [...total.entries()].filter(([, c]) => c >= 2)
      .map(([w, c]) => [w, c * idf.get(w)]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
    const kw = new Set(keywords);

    const step = Math.max(1, Math.floor(n / 300));
    const sample = [];
    for (let j = 0; j < n; j += step) sample.push(j);
    const scores = vecs.map((vi, i) => {
      let sim = 0;
      for (const j of sample) {
        if (i === j) continue;
        const vj = vecs[j];
        const [small, big] = vi.size < vj.size ? [vi, vj] : [vj, vi];
        for (const [w, x] of small) sim += x * (big.get(w) || 0);
      }
      const kwBonus = toks[i].filter((w) => kw.has(w)).length / (kw.size || 1);
      const lengthPen = toks[i].length >= 4 ? 1 : 0.5;
      const fluffPen = FLUFF.test(sents[i].text) ? 0.2 : 1;
      return (sim / Math.max(1, sample.length) + 0.3 * kwBonus) * lengthPen * fluffPen;
    });
    return { sents, toks, scores, keywords };
  }

  /** Kalimat terpenting (urut sesuai video) dengan total kata <= maxWords. */
  function topSentences(segments, maxWords) {
    const { sents, scores } = score(segments);
    const order = sents.map((_, k) => k).sort((a, b) => scores[b] - scores[a]);
    const chosen = [];
    let words = 0;
    for (const k of order) {
      const w = sents[k].text.split(" ").length;
      if (words + w > maxWords) continue;
      chosen.push(k);
      words += w;
    }
    return chosen.sort((a, b) => a - b).map((k) => sents[k]);
  }

  function summarize(segments) {
    const { sents, scores, keywords } = score(segments);
    const n = sents.length;
    if (!n) return "_Transkrip terlalu pendek untuk diringkas._";

    const bestIn = (lo, hi, exclude) => {
      let best = null;
      for (let k = lo; k < hi; k++) if (!exclude.has(k) && (best === null || scores[k] > scores[best])) best = k;
      return best;
    };

    const shortIdx = sents.map((_, k) => k).sort((a, b) => scores[b] - scores[a]).slice(0, Math.min(3, n)).sort((a, b) => a - b);

    let concl = null;
    if (n >= 5) {
      const explicit = [];
      for (let k = Math.floor(n * 0.6); k < n; k++) {
        if (CONCLUSION.test(sents[k].text) && !FLUFF.test(sents[k].text)) explicit.push(k);
      }
      if (explicit.length) concl = explicit.reduce((a, b) => (scores[b] > scores[a] ? b : a));
      else {
        concl = bestIn(Math.floor(n * 0.8), n, new Set());
        if (concl !== null && FLUFF.test(sents[concl].text)) concl = null;
      }
    }

    const kPoints = n >= 3 ? Math.min(8, Math.max(3, Math.floor(n / 3))) : n;
    const points = [];
    for (let b = 0; b < kPoints; b++) {
      const k = bestIn(Math.floor((b * n) / kPoints), Math.floor(((b + 1) * n) / kPoints), new Set(concl === null ? [] : [concl]));
      if (k !== null) points.push(k);
    }

    const lines = ["## Ringkasan Singkat", shortIdx.map((k) => tidy(sents[k].text)).join(" "), "", "## Poin-Poin Utama"];
    for (const k of points) lines.push(`- **[${fmtTime(sents[k].start)}]** ${tidy(sents[k].text)}`);
    lines.push("");
    if (concl !== null) lines.push("## Kesimpulan", tidy(sents[concl].text), "");
    if (keywords.length) {
      const surface = new Map();
      for (const w of sents.map((s) => s.text).join(" ").toLowerCase().match(/[a-z]+/g) || []) {
        if (w.length > 2 && !STOPWORDS.has(w)) {
          const key = stem(w) + "|" + w;
          surface.set(key, (surface.get(key) || 0) + 1);
        }
      }
      const bestForm = new Map();
      for (const [key] of [...surface.entries()].sort((a, b) => b[1] - a[1])) {
        const [st, w] = key.split("|");
        if (!bestForm.has(st)) bestForm.set(st, w);
      }
      lines.push("## Kata Kunci", keywords.slice(0, 8).map((k) => bestForm.get(k) || k).join(", "), "");
    }
    lines.push("_Dibuat oleh peringkas cepat (offline) — kalimat diambil langsung dari transkrip._");
    return lines.join("\n");
  }

  global.LocalSummarizer = { summarize, topSentences, fmtTime };
})(window);
