/*
 * TranscriptBot — mesin peringkas transkrip YouTube berbahasa Indonesia.
 *
 * Berjalan offline, tanpa model AI, tanpa API key (JavaScript murni).
 * File ini dipakai bersama oleh aplikasi Android dan versi web.
 *
 * Tahapan:
 *   1. Pembersihan bahasa lisan: buang kata pengisi ("eh", "gitu", "ya kan"),
 *      kata berulang, ubah kata tidak baku ("nggak" → "tidak"), dan
 *      angka dalam kata → digit ("lima puluh persen" → "50%").
 *   2. Segmentasi kalimat dari subtitle tanpa tanda baca memakai penanda wacana.
 *   3. Penilaian kalimat: TextRank (PageRank di graf kemiripan TF-IDF) + frasa kunci
 *      + kata judul + posisi, dikurangi untuk basa-basi pembuka/penutup.
 *   4. Pemilihan dengan MMR (Maximal Marginal Relevance) agar poin tidak berulang.
 *   5. Deteksi struktur daftar ("yang pertama… kedua… ketiga…") → daftar bernomor.
 *   6. Kompresi kalimat + kalimat pembuka "Video ini membahas …".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TranscriptBot = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "2.0";

  // ------------------------------------------------------------------ kamus
  const STOPWORDS = new Set(`
ada adalah adanya agak agar akan akhirnya aku akulah amat anda antara apa apakah apalagi atau
ataupun aja ah bagai bagaimana bagi bahkan bahwa baik banyak barangkali bawah beberapa begini
begitu belum benar berapa berbagai bersama betul biasa biasanya bila bisa boleh bukan cuma cukup
dahulu dalam dan dapat dari daripada dekat demi demikian dengan depan di dia diri dirinya dong
dulu enggak engga ga gak gimana gitu gini guys halo hai hal hanya harus hingga ia ialah ini
itu iya ya jadi jika jangan juga justru kah kalau kali kalian kami kamu kan karena kata ke
kemudian kenapa kepada ketika kini kita kok lagi lah lain lalu lama langsung lebih loh lho maka
mana masih mau memang mereka meski mungkin nah namun nanti nya oh oke ok pada padahal para pasti
pernah pula pun punya saja sambil sampai sangat saat sama sebab sebagai sebelum sebenarnya sebuah
secara sedang sedikit segala sehingga sejak sekali sekarang sekitar selain selalu seluruh semua
sementara semuanya sendiri seperti sering serta sesuatu setelah setiap siapa sih sini situ supaya
tadi tak tapi tanpa tentang tentu terhadap terus tetapi tidak toh udah sudah untuk walau yaitu
yakni yang uh eh hmm em ehm nih tuh deh dah kayak kaya banget bener teman temen saya
selamat datang channel video subscribe like comment komentar kolom menonton nonton
pertama kedua ketiga keempat kelima keenam ketujuh kedelapan kesembilan kesepuluh terakhir
buat bikin orang kayaknya pokoknya kemarin tahu tau lihat liat mau kasih cara biar bener
sekian kembali minggu hari waktu sebaiknya jam pagi malam siang sore menit detik turun naik atas
bawah sekitar kira-kira cuma lumayan akhirnya pengalaman pengalamannya cerita membuat mudah
kalian tutorial langkah`.split(/\s+/).filter(Boolean));

  // Kata pengisi yang dibuang dari kalimat hasil ringkasan.
  const FILLER_PHRASES = [
    "ya teman-teman", "teman-teman semua", "teman-teman", "ya kan", "kan ya", "gitu loh", "gitu ya",
    "kayak gitu", "seperti itu ya", "ya guys", "guys", "gitu", "sih", "deh", "dong", "nih", "tuh",
    "loh", "lho", "eh", "em", "ehm", "hmm", "uh", "ya",
  ].sort((a, b) => b.length - a.length);

  // Kata tidak baku → baku.
  const NORMALIZE = {
    nggak: "tidak", ngga: "tidak", gak: "tidak", ga: "tidak", enggak: "tidak", engga: "tidak",
    udah: "sudah", dah: "sudah", aja: "saja", gimana: "bagaimana", kayak: "seperti",
    bikin: "membuat", pake: "pakai", banget: "sekali", gede: "besar", dikit: "sedikit",
    abis: "habis", biar: "agar", tau: "tahu", emang: "memang", gampang: "mudah",
    nyari: "mencari", ngumpulin: "mengumpulkan", ngerti: "mengerti",
  };

  // Penanda wacana: titik potong alami dalam ucapan tanpa tanda baca.
  const BREAK_BEFORE = [
    "yang pertama", "yang kedua", "yang ketiga", "yang keempat", "yang kelima", "yang keenam",
    "yang ketujuh", "yang kedelapan", "yang terakhir", "pertama", "kedua", "ketiga", "keempat",
    "kelima", "keenam", "ketujuh", "selanjutnya", "berikutnya", "kemudian", "setelah itu",
    "selain itu", "nah", "jadi", "kesimpulannya", "intinya", "oleh karena itu", "makanya",
    "tapi", "tetapi", "namun", "sedangkan", "misalnya", "contohnya", "karena itu", "terakhir",
    "semoga", "jangan lupa", "sampai jumpa", "terima kasih", "oke", "lalu", "terus", "tips dari",
    "menurut aku", "menurut saya", "di sisi lain", "besok paginya", "setelah sarapan",
  ].map((p) => p.split(" ")).sort((a, b) => b.length - a.length);

  const ORDINALS = ["pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh",
    "kedelapan", "kesembilan", "kesepuluh"];
  const ORDINAL_LABEL = ["Pertama", "Kedua", "Ketiga", "Keempat", "Kelima", "Keenam", "Ketujuh",
    "Kedelapan", "Kesembilan", "Kesepuluh"];

  const FLUFF = /subscribe|like dan|lonceng|notifikasi|selamat datang|sampai jumpa|semoga bermanfaat|terima kasih sudah|assalamualaikum|wassalam|link di deskripsi|kolom komentar|selamat mencoba|sekian dulu|kembali lagi di|di video kali ini|di video ini|kali ini (?:aku|saya|kita|gue) (?:mau|akan|ingin)|hari ini (?:kita|aku|saya) (?:akan |mau )?(?:bahas|membahas|masak|cerita)/i;
  const CONCLUSION = /kesimpulan|intinya|pada akhirnya|singkatnya|ringkasnya|kuncinya|menurut (?:aku|saya)|jadi\s/i;
  const TOPIC_INTRO = /(?:hari ini|di video (?:ini|kali ini)|video kali ini|kali ini)\s+(?:kita|aku|saya|gue)?\s*(?:akan|mau|ingin)?\s*(?:bahas|membahas|bicara(?:kan)?|mengulas|masak|memasak|cerita(?:kan)?|berbagi|share|jelaskan|menjelaskan)\s+(?:tentang|soal|mengenai)?\s*(.+)/i;
  const TOPIC_INTRO2 = /(?:aku|saya|kita)\s+(?:mau|ingin|akan)\s+(?:cerita(?:kan)?|berbagi|bahas|membahas|masak|memasak)\s+(?:tentang|soal)?\s*(.+)/i;

  // ------------------------------------------------------------------ angka
  const UNITS = { nol: 0, satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7,
    delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000 };
  const isNumWord = (w) => w in UNITS || w === "puluh" || w === "belas" || w === "ratus" ||
    w === "ribu" || w === "juta" || w === "miliar";

  /** "lima puluh" → 50, "dua ribu lima ratus" → 2500. */
  function parseNumber(words) {
    let total = 0, current = 0;
    for (const w of words) {
      if (w in UNITS) {
        const v = UNITS[w];
        if (v === 100 || v === 1000) { current = (current || 1) * v; if (v === 1000) { total += current; current = 0; } }
        else current += v;
      } else if (w === "puluh") current = (current || 1) * 10;
      else if (w === "belas") current = (current || 1) + 10;
      else if (w === "ratus") current = (current || 1) * 100;
      else if (w === "ribu") { total += (current || 1) * 1000; current = 0; }
      else if (w === "juta") { total += (current || 1) * 1e6; current = 0; }
      else if (w === "miliar") { total += (current || 1) * 1e9; current = 0; }
    }
    return total + current;
  }

  /** Ubah angka berbentuk kata menjadi digit. "satu" tunggal dibiarkan (sering bukan angka). */
  function numbersToDigits(text) {
    const words = text.split(" ");
    const out = [];
    let i = 0;
    while (i < words.length) {
      const lw = words[i].toLowerCase();
      if (isNumWord(lw) && lw !== "se") {
        // Kumpulkan rangkaian kata angka. Satu "angka" berakhir ketika muncul satuan
        // yang lebih kecil diikuti angka baru (mis. "lima puluh tiga puluh").
        let j = i;
        const group = [];
        while (j < words.length && isNumWord(words[j].toLowerCase()) && words[j].toLowerCase() !== "se") {
          const w = words[j].toLowerCase();
          // "lima puluh tiga puluh": setelah "puluh", jika ada "<unit> puluh" lagi → angka baru.
          if (group.length && (group[group.length - 1] === "puluh" || group[group.length - 1] === "belas") &&
              words[j + 1] && ["puluh", "belas"].includes(words[j + 1].toLowerCase())) break;
          group.push(w);
          j++;
        }
        const single = group.length === 1;
        const prev = (words[i - 1] || "").toLowerCase();
        const keepWord = single && ["satu", "dua"].includes(group[0]) &&
          !/^(pos|nomor|no|langkah|tahap|bab|level|jam|ke|lantai|babak)$/.test(prev) &&
          !/^(persen|kali|jam|menit|detik|hari|minggu|bulan|tahun|sendok|siung|butir|piring|gelas|buah|orang|kg|gram|liter|derajat|meter|km|juta|ribu)$/i.test(words[j] || "");
        if (keepWord) { out.push(words[i]); i++; continue; }
        out.push(String(parseNumber(group)));
        i = j;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    return out.join(" ")
      .replace(/(\d+) persen/gi, "$1%")
      .replace(/(\d+)%?\s+(\d+)%?\s+(\d+)%?(?=\s|$)/g, (m, a, b, c) =>
        Number(a) + Number(b) + Number(c) === 100 ? `${a}/${b}/${c}` : m)
      .replace(/(\d+) derajat celcius/gi, "$1°C")
      .replace(/(\d+) sampai (\d+)/g, "$1–$2");
  }

  // ------------------------------------------------------------------ teks
  const PREFIXES = ["meng", "meny", "mem", "men", "me", "peng", "peny", "pem", "pen", "pe", "ber", "be", "ter", "di", "ke", "se"];
  const SUFFIXES = ["kannya", "annya", "nya", "kan", "an", "i", "lah", "kah", "pun"];

  function stem(word) {
    let w = word;
    for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) { w = w.slice(0, -s.length); break; }
    for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 4) { w = w.slice(p.length); break; }
    return w;
  }

  const words = (t) => t.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) || [];
  const content = (t) => words(t).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const tokens = (t) => content(t).map(stem);

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  /** Bersihkan bahasa lisan menjadi kalimat yang enak dibaca. */
  function clean(text) {
    let t = " " + text.replace(/\s+/g, " ").trim() + " ";
    for (const f of FILLER_PHRASES) {
      t = t.replace(new RegExp(`\\s${f.replace("-", "\\-")}(?=[\\s,.!?])`, "gi"), " ");
    }
    t = t.replace(/\b([a-z]+)\b/gi, (w) => {
      const n = NORMALIZE[w.toLowerCase()];
      return n ? n : w;
    });
    // Kata berulang: "yang yang" → "yang" (tetapi biarkan kata ulang ber-tanda hubung).
    t = t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
    t = numbersToDigits(t.trim());
    // "penting sekali" (dari "banget") sudah wajar; "sekali banget" dsb. dirapikan.
    t = t.replace(/\bsekali sekali\b/gi, "sekali");
    return t.replace(/\s+/g, " ").trim();
  }

  const LEAD_TRIM = /^(?:(?:halo|hai|nah|oke|ok|jadi|terus|lalu|ya|dan|tapi|eh|nah jadi|oke jadi|setelah itu|kemudian|selanjutnya|langsung saja|langsung aja|sekarang|menurut (?:aku|saya))\s+)+/i;
  const TAIL_TRIM = /\s+(?:dan|yang|karena|untuk|dengan|atau|di|ke|dari|itu|ini|jadi|nah|terus|lalu|seperti|kalau|tapi|juga|sama|pada|agar|supaya|sehingga|bisa)$/i;

  /** Rapikan satu kalimat untuk ditampilkan. */
  const FLUFF_TAIL = /\s+(?:selamat mencoba|terima kasih|semoga bermanfaat|jangan lupa (?:like|subscribe|tulis|komen)|sampai jumpa|oke sekian|sekian dulu)\b.*$/i;
  const CLAUSE_CUT = /^(karena|sehingga|supaya|agar|kalau|misalnya|contohnya|sedangkan|yaitu|seperti|dengan|untuk|di mana|setelah|lalu|terus|dan)$/i;

  /** Pendekkan kalimat panjang di batas klausa (maks ±maxWords kata). */
  function compress(t, maxWords = 22) {
    const ws = t.split(" ");
    if (ws.length <= maxWords) return t;
    for (let k = maxWords; k >= 10; k--) if (CLAUSE_CUT.test(ws[k])) return ws.slice(0, k).join(" ");
    return ws.slice(0, maxWords).join(" ");
  }

  function polish(text, { keepOrdinal = false, maxWords = 22 } = {}) {
    let t = clean(text).replace(FLUFF_TAIL, "");
    for (let k = 0; k < 3; k++) t = t.replace(LEAD_TRIM, "");
    if (!keepOrdinal) t = t.replace(/^yang (pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir)\s+/i, (m, o) => o + ", ");
    t = t.replace(/^(pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir)\s+(?!,)/i, (m, o) => o + ", ");
    t = compress(t, maxWords);
    for (let k = 0; k < 3; k++) t = t.replace(TAIL_TRIM, "");
    t = t.replace(/^kesimpulannya\s+/i, "Kesimpulannya, ").replace(/^intinya\s+/i, "Intinya, ")
      .replace(/^kuncinya\s+/i, "Kuncinya, ").replace(/^misalnya\s+/i, "Misalnya, ")
      .replace(/^contohnya\s+/i, "Contohnya, ");
    t = t.trim();
    if (!t) return "";
    t = t[0].toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) t += ".";
    return t;
  }

  // ------------------------------------------------------------------ segmentasi
  // Kata sambung tempat kalimat panjang boleh dipotong (dipakai saat kalimat kepanjangan).
  const SOFT_BREAK = new Set(["dan", "karena", "terus", "lalu", "kemudian", "sehingga", "supaya", "agar",
    "jadi", "tapi", "setelah", "sampai", "dengan", "untuk", "kalau", "di", "seperti", "yaitu", "lagi"]);
  // Kata kerja perintah/aksi yang biasanya memulai langkah baru (resep, tutorial).
  const STEP_VERB = /^(siapkan|panaskan|masukkan|tambahkan|aduk|tumis|sajikan|potong|campur|rebus|goreng|kocok|tuang|diamkan|simpan|hindari|lunasi|buatlah|pilih|klik|pastikan|gunakan|install|registrasi)$/i;

  function makeSentences(segments, minWords = 4, maxWords = 28) {
    const ws = [];
    for (const seg of segments) {
      for (const w of String(seg.text || "").split(/\s+/)) if (w) ws.push([w, Number(seg.start) || 0]);
    }
    const out = [];
    let buf = [];
    const flush = () => {
      if (buf.length) out.push({ start: buf[0][1], text: buf.map((x) => x[0]).join(" ") });
      buf = [];
    };
    for (let i = 0; i < ws.length; i++) {
      if (buf.length >= minWords) {
        const lower = ws.slice(i, i + 3).map((x) => x[0].toLowerCase().replace(/[,.!?]/g, ""));
        if (BREAK_BEFORE.some((m) => m.every((t, k) => lower[k] === t))) flush();
      }
      if (buf.length >= minWords + 2 && STEP_VERB.test(ws[i][0])) flush();
      buf.push(ws[i]);
      if (/[.!?]$/.test(ws[i][0]) && buf.length >= 4) flush();
      else if (buf.length >= maxWords) {
        // Potong di kata sambung terakhir supaya kalimat tidak putus di tengah klausa.
        let cut = -1;
        for (let k = buf.length - 1; k >= minWords; k--) {
          if (SOFT_BREAK.has(buf[k][0].toLowerCase())) { cut = k; break; }
        }
        if (cut > 0) {
          const rest = buf.slice(cut);
          buf = buf.slice(0, cut);
          flush();
          buf = rest;
        } else flush();
      }
    }
    flush();
    const merged = [];
    for (const s of out) {
      if (merged.length && s.text.split(" ").length < 4) merged[merged.length - 1].text += " " + s.text;
      else merged.push(s);
    }
    return merged;
  }

  // ------------------------------------------------------------------ penilaian
  function cosine(a, b) {
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    let s = 0;
    for (const [w, x] of small) s += x * (big.get(w) || 0);
    return s;
  }

  function keyphrases(sents, max = 8) {
    const counts = new Map();
    for (const s of sents) {
      const ws = words(clean(s.text));
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i + n <= ws.length; i++) {
          const g = ws.slice(i, i + n);
          if (g.some((w) => STOPWORDS.has(w) || w.length < 3)) continue;
          const key = g.join(" ");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    const scored = [...counts.entries()]
      .filter(([k, c]) => c >= 2 && (k.includes(" ") || k.length >= 5))
      .map(([k, c]) => [k, c * Math.pow(k.split(" ").length, 1.6)])
      .sort((a, b) => b[1] - a[1]);
    const chosen = [];
    for (const [k] of scored) {
      if (chosen.some((c) => c.includes(k))) continue; // sudah tercakup frasa lebih panjang
      const idx = chosen.findIndex((c) => k.includes(c));
      if (idx >= 0) chosen.splice(idx, 1);
      chosen.push(k);
      if (chosen.length >= max) break;
    }
    return chosen;
  }

  function analyze(segments, title) {
    const sents = makeSentences(segments);
    const n = sents.length;
    const toks = sents.map((s) => tokens(s.text));
    if (!n) return { sents, toks, scores: [], vecs: [], phrases: [] };

    const df = new Map();
    for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
    const idf = (w) => Math.log((n + 1) / ((df.get(w) || 0) + 1)) + 1;
    const vecs = toks.map((t) => {
      const tf = new Map();
      for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
      const v = new Map();
      let norm = 0;
      for (const [w, c] of tf) { const x = (1 + Math.log(c)) * idf(w); v.set(w, x); norm += x * x; }
      norm = Math.sqrt(norm) || 1;
      for (const [w, x] of v) v.set(w, x / norm);
      return v;
    });

    // TextRank: PageRank di graf kemiripan. Untuk transkrip sangat panjang,
    // tetangga dibatasi agar tetap cepat di HP.
    const window = n > 600 ? 150 : n;
    const nbrs = sents.map(() => []);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - window), hi = Math.min(n, i + window + 1);
      for (let j = lo; j < hi; j++) {
        if (j <= i) continue;
        const s = cosine(vecs[i], vecs[j]);
        if (s > 0.05) { nbrs[i].push([j, s]); nbrs[j].push([i, s]); }
      }
    }
    const outSum = nbrs.map((l) => l.reduce((a, [, s]) => a + s, 0) || 1);
    let pr = new Array(n).fill(1 / n);
    for (let it = 0; it < 30; it++) {
      const next = new Array(n).fill(0.15 / n);
      for (let i = 0; i < n; i++) for (const [j, s] of nbrs[i]) next[j] += 0.85 * pr[i] * (s / outSum[i]);
      pr = next;
    }
    const maxPr = Math.max(...pr) || 1;

    const phrases = keyphrases(sents, 10);
    const phraseStems = phrases.map((p) => tokens(p));
    const titleToks = new Set(tokens(title || ""));

    const scores = sents.map((s, i) => {
      const t = toks[i];
      const tset = new Set(t);
      let sc = pr[i] / maxPr; // 0..1
      const phraseHits = phraseStems.filter((ps) => ps.length && ps.every((w) => tset.has(w))).length;
      sc += 0.25 * Math.min(phraseHits, 3) / 3;
      if (titleToks.size) sc += 0.2 * [...titleToks].filter((w) => tset.has(w)).length / titleToks.size;
      if (/\d|persen|sendok|siung|menit|jam|derajat/.test(s.text)) sc += 0.08; // informasi konkret
      if (t.length < 4) sc *= 0.5;
      if (FLUFF.test(s.text)) sc *= 0.15;
      return sc;
    });
    return { sents, toks, vecs, scores, phrases };
  }

  /** MMR: pilih kalimat penting yang tidak saling mengulang. */
  function mmr(cands, scores, vecs, k, lambda = 0.7, exclude = new Set()) {
    const chosen = [];
    const pool = cands.filter((i) => !exclude.has(i));
    while (chosen.length < k && pool.length) {
      let best = -1, bestVal = -Infinity;
      for (const i of pool) {
        // Pengulangan isi + kedekatan posisi (agar poin tersebar di seluruh video).
        const red = chosen.length
          ? Math.max(...chosen.map((j) => cosine(vecs[i], vecs[j]) + (Math.abs(i - j) <= 1 ? 0.25 : 0)))
          : 0;
        const val = lambda * scores[i] - (1 - lambda) * red;
        if (val > bestVal) { bestVal = val; best = i; }
      }
      chosen.push(best);
      pool.splice(pool.indexOf(best), 1);
    }
    return chosen;
  }

  // ------------------------------------------------------------------ struktur daftar
  /** Deteksi "yang pertama … yang kedua … yang ketiga …" → item daftar. */
  function detectList(segments) {
    const ws = [];
    for (const seg of segments) for (const w of String(seg.text || "").split(/\s+/)) if (w) ws.push([w, Number(seg.start) || 0]);
    const lower = ws.map(([w]) => w.toLowerCase().replace(/[,.!?:]/g, ""));
    const marks = [];
    let expect = 0;
    for (let i = 0; i < lower.length && expect < ORDINALS.length; i++) {
      if (lower[i] === ORDINALS[expect]) {
        // hindari "pertama kali", "kedua orang tua" dsb.
        const nxt = lower[i + 1] || "";
        if (["kali", "orang", "tangan", "belah", "nya"].includes(nxt)) continue;
        marks.push(i);
        expect++;
      }
    }
    if (marks.length < 3) return null;
    // "terakhir" setelah ordinal terakhir juga dihitung sebagai item.
    for (let i = marks[marks.length - 1] + 3; i < lower.length; i++) {
      if (lower[i] === "terakhir" && (lower[i - 1] === "yang" || i === 0 || true)) { marks.push(i); break; }
    }
    const items = [];
    for (let m = 0; m < marks.length; m++) {
      const startIdx = marks[m] + 1;
      let endIdx = m + 1 < marks.length ? marks[m + 1] : Math.min(lower.length, startIdx + 40);
      // "… yang | kedua", "… langkah | ketiga", "… tips | keempat"
      while (endIdx > startIdx && ["yang", "langkah", "tips", "cara", "poin", "hal", "dan"].includes(lower[endIdx - 1])) endIdx--;
      // Item cukup sampai penanda kalimat berikutnya (maks ±24 kata).
      let cut = endIdx;
      for (let i = startIdx + 6; i < endIdx; i++) {
        const two = lower[i] + " " + (lower[i + 1] || "");
        if (["nah", "kesimpulannya", "intinya", "semoga", "terima"].includes(lower[i]) ||
            ["sampai jumpa", "terima kasih", "jangan lupa"].includes(two)) { cut = i; break; }
      }
      const slice = ws.slice(startIdx, Math.min(cut, startIdx + 34)).map(([w]) => w).join(" ");
      let text = clean(slice).replace(TAIL_TRIM, "").replace(TAIL_TRIM, "");
      if (text.split(" ").length < 3) continue;
      // Potong di klausa penjelas agar ringkas.
      const words_ = text.split(" ");
      if (words_.length > 20) {
        const stopAt = words_.findIndex((w, k) => k >= 12 && /^(karena|kalau|misalnya|contohnya|sedangkan|kebutuhan|banyak)$/i.test(w));
        text = stopAt > 0 ? words_.slice(0, stopAt).join(" ") : compress(text, 24);
      }
      const label = lower[marks[m]] === "terakhir" ? "Terakhir" : ORDINAL_LABEL[m];
      items.push({ start: ws[marks[m]][1], label, text: text[0].toUpperCase() + text.slice(1).replace(TAIL_TRIM, "") });
    }
    return items.length >= 3 ? items : null;
  }

  // ------------------------------------------------------------------ pembuka
  function overview(sents, phrases, title) {
    const intro = sents.slice(0, Math.max(3, Math.ceil(sents.length * 0.15))).map((s) => s.text).join(" ");
    const m = intro.match(TOPIC_INTRO) || intro.match(TOPIC_INTRO2);
    const titleToks = new Set(tokens(title || ""));
    if (m) {
      let topic = clean(m[1]).split(" ");
      // Ambil frasa topik sampai penanda kalimat berikutnya.
      const stop = topic.findIndex((w, k) => k >= 2 && /^(jadi|nah|langsung|bahannya|kita|aku|saya|terus|oke|pertama|dan|yang|minggu|sekarang|secara)$/i.test(w));
      topic = topic.slice(0, stop > 0 ? stop : 10).join(" ").replace(TAIL_TRIM, "");
      const tt = tokens(topic);
      const relevant = !titleToks.size || tt.some((w) => titleToks.has(w));
      if (tt.length >= 2 && relevant) return `Video ini membahas ${topic}.`;
    }
    if (title) {
      const clean_ = title.replace(/[.!?]+$/, "").replace(/\s*[|\-–—]\s*[^|\-–—]*$/, "").trim();
      return `Video ini membahas ${clean_.charAt(0).toLowerCase() + clean_.slice(1)}.`;
    }
    if (phrases.length >= 2) {
      const p = phrases.slice(0, 3);
      return `Video ini membahas ${p.length === 3 ? `${p[0]}, ${p[1]}, dan ${p[2]}` : p.join(" dan ")}.`;
    }
    return "";
  }

  // ------------------------------------------------------------------ utama
  /**
   * @param {{start:number,text:string}[]} segments  segmen subtitle
   * @param {{title?:string}} [opts]
   * @returns {string} ringkasan Markdown
   */
  function summarize(segments, opts = {}) {
    const title = opts.title || "";
    const { sents, vecs, scores, phrases } = analyze(segments, title);
    const n = sents.length;
    if (!n) return "_Transkrip terlalu pendek untuk diringkas._";

    const order = sents.map((_, i) => i);
    const listItems = detectList(segments);

    // Kesimpulan: kalimat penutup yang eksplisit, kalau tidak, kalimat terbaik di akhir.
    let concl = null;
    if (n >= 5) {
      const tail = order.slice(Math.floor(n * 0.6));
      const strong = /kesimpulan|intinya|kuncinya|singkatnya|ringkasnya|pada akhirnya/i;
      const explicit = tail.filter((k) => CONCLUSION.test(sents[k].text) && polish(sents[k].text).split(" ").length >= 5);
      const strongOnes = explicit.filter((k) => strong.test(sents[k].text));
      const pool = strongOnes.length ? strongOnes : explicit;
      if (pool.length) concl = pool.reduce((a, b) => (scores[b] > scores[a] ? b : a));
      else {
        const k = tail.filter((k) => !FLUFF.test(sents[k].text)).sort((a, b) => scores[b] - scores[a])[0];
        if (k !== undefined) concl = k;
      }
    }
    const excl = new Set(concl === null ? [] : [concl]);

    // Ringkasan singkat: kalimat pembuka + 2 kalimat terpenting (tanpa mengulang).
    const lead = overview(sents, phrases, title);
    const shortIdx = mmr(order.filter((i) => !FLUFF.test(sents[i].text)), scores, vecs, 1, 0.65, excl);
    const exclPoints = new Set([...excl, ...shortIdx]);

    // Poin utama: ±30% kalimat, 4–8 poin, dipilih dengan MMR lalu diurutkan sesuai video.
    const kPoints = Math.max(4, Math.min(8, Math.round(n * 0.3)));
    const pointIdx = mmr(order, scores, vecs, Math.min(kPoints, n), 0.7, listItems ? excl : exclPoints)
      .filter((i) => !FLUFF.test(sents[i].text) || scores[i] > 0.5)
      .sort((a, b) => a - b);

    const lines = [];
    lines.push("## Ringkasan Singkat");
    const conclText = concl !== null ? polish(sents[concl].text, { maxWords: 26 }) : "";
    const shortBody = listItems
      ? [lead, `Ada ${listItems.length} poin utama yang dijelaskan.`, conclText]
      : [lead, ...shortIdx.map((k) => polish(sents[k].text, { maxWords: 28 }))];
    lines.push(shortBody.filter(Boolean).join(" "));
    lines.push("");

    if (listItems) {
      lines.push(`## ${listItems.length} Poin Utama`);
      for (const it of listItems) lines.push(`- **[${fmtTime(it.start)}] ${it.label}:** ${it.text}.`);
      lines.push("");
      // Detail tambahan yang tidak tercakup daftar.
      const covered = listItems.map((it) => new Set(tokens(it.text)));
      const extra = pointIdx.filter((i) => {
        const t = new Set(tokens(sents[i].text));
        if (FLUFF.test(sents[i].text) || i === concl) return false;
        return !covered.some((c) => [...t].filter((w) => c.has(w)).length / (t.size || 1) > 0.4);
      }).slice(0, 3);
      if (extra.length) {
        lines.push("## Detail Penting");
        for (const k of extra) lines.push(`- **[${fmtTime(sents[k].start)}]** ${polish(sents[k].text)}`);
        lines.push("");
      }
    } else {
      lines.push("## Poin-Poin Utama");
      for (const k of pointIdx) lines.push(`- **[${fmtTime(sents[k].start)}]** ${polish(sents[k].text)}`);
      lines.push("");
    }

    if (concl !== null) {
      lines.push("## Kesimpulan", conclText, "");
    }
    if (phrases.length) {
      lines.push("## Kata Kunci", phrases.slice(0, 8).join(", "), "");
    }
    lines.push(`_Diringkas oleh TranscriptBot ${VERSION} (offline) — kalimat diambil dari transkrip lalu dirapikan._`);
    return lines.join("\n");
  }

  return { summarize, clean, polish, numbersToDigits, fmtTime, VERSION, _analyze: analyze, _detectList: detectList };
});
