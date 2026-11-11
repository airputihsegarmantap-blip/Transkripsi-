/*
 * RheusInterface — "otak" SiLengkap.
 *
 * Mengelola dan mengambil informasi dari internet dan forum untuk semua menu:
 *   - Berita (kripto, dunia, viral): mengumpulkan RSS dari beberapa sumber + forum,
 *     membuang duplikat, menggabungkan cerita yang sama, lalu memberi skor "hot"
 *     (jumlah sumber yang meliput × kebaruan × ramai di forum).
 *   - Bitcoin: mengambil harga & data pasar, menghitung indikator teknikal
 *     (MA, RSI, momentum, volatilitas) + sentimen (Fear & Greed, funding rate)
 *     menjadi arah dan probabilitas.
 *   - Transkripsi: mengambil subtitle YouTube lalu meringkasnya dengan TranscriptBot.
 *
 * Catatan jujur: RheusInterface BUKAN model bahasa (LLM). Ia mesin aturan + statistik
 * yang ringan, berjalan langsung di HP/browser, tanpa API key.
 *
 * Lingkungan menyediakan adaptor lewat RheusInterface.configure():
 *   fetchText(url)   -> Promise<string>      (APK: lewat Kotlin, web: lewat /api/fetch)
 *   getTranscript(u) -> Promise<{video_id,title,language,source,segments}>
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RheusInterface = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const VERSION = "1.0";
  const env = {
    fetchText: null,
    getTranscript: null,
    now: () => Date.now(),
    storage: (() => { try { return root.localStorage; } catch { return null; } })(),
  };
  const log = [];
  function note(level, msg) {
    log.push({ t: env.now(), level, msg });
    if (log.length > 100) log.shift();
  }

  function configure(opts) { Object.assign(env, opts || {}); }

  // ------------------------------------------------------------------ cache
  const mem = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = mem.get(key);
    if (hit && env.now() - hit.t < ttlMs) return hit.v;
    try {
      const v = await fn();
      mem.set(key, { t: env.now(), v });
      try { env.storage && env.storage.setItem("rheus:" + key, JSON.stringify({ t: env.now(), v })); } catch {}
      return v;
    } catch (err) {
      // Offline / sumber gagal: pakai data terakhir yang tersimpan kalau ada.
      try {
        const raw = env.storage && env.storage.getItem("rheus:" + key);
        if (raw) { const old = JSON.parse(raw); note("warn", `${key}: memakai cache lama (${err.message})`); return { ...old.v, stale: true }; }
      } catch {}
      throw err;
    }
  }

  async function getText(url) {
    if (!env.fetchText) throw new Error("RheusInterface belum dikonfigurasi (fetchText).");
    return env.fetchText(url);
  }
  async function getJson(url) { return JSON.parse(await getText(url)); }

  // ------------------------------------------------------------------ util teks
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  function decode(s) {
    return String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
        if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return ENT[e.toLowerCase()] ?? m;
      });
  }
  const stripTags = (s) => decode(decode(s)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const STOP = new Set(("yang dan di ke dari untuk dengan ini itu pada akan dalam adalah atau juga tidak bisa ada " +
    "lebih karena oleh sebagai saat setelah hingga para kata the of to in a for on is and with as at by from " +
    "new hari ini kini jadi usai soal apa bagaimana kenapa terbaru berita").split(" "));
  const words = (t) => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

  function jaccard(a, b) {
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter || 1);
  }

  function ago(ts) {
    const m = Math.max(0, Math.round((env.now() - ts) / 60000));
    if (m < 1) return "baru saja";
    if (m < 60) return `${m} mnt`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} jam`;
    return `${Math.round(h / 24)} hari`;
  }

  // ------------------------------------------------------------------ RSS / Atom
  function tag(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    return m ? m[1] : "";
  }
  function attr(block, name, at) {
    const m = block.match(new RegExp(`<${name}\\s[^>]*${at}="([^"]*)"`, "i"));
    return m ? decode(m[1]) : "";
  }

  /** Judul spam SEO (mis. situs yang diretas): semua huruf kecil & pendek, atau pola judi. */
  function looksLikeSpam(title, source) {
    if (!/[A-Z]/.test(title) && title.split(/\s+/).length <= 8) return true;
    if (/slot|gacor|togel|judi|casino|maxwin|bandar/i.test(title)) return true;
    if (/^website (kabupaten|desa|kota)/i.test(source || "")) return true;
    return false;
  }

  /** Parser RSS 2.0 / Atom sederhana (tanpa DOMParser, jalan di mana saja). */
  function parseFeed(xml, fallbackSource) {
    const items = [];
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const b of blocks) {
      let title = stripTags(tag(b, "title"));
      let source = stripTags(tag(b, "source")) || fallbackSource;
      // Google News: "Judul berita - Nama Media"
      const dash = title.lastIndexOf(" - ");
      if (dash > 20 && (!tag(b, "source") || title.endsWith(stripTags(tag(b, "source"))))) {
        source = source || title.slice(dash + 3);
        title = title.slice(0, dash);
      }
      const link = stripTags(tag(b, "link")) || attr(b, "link", "href");
      const dateStr = stripTags(tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date"));
      const ts = Date.parse(dateStr) || env.now();
      const rawDesc = tag(b, "description") || tag(b, "summary") || tag(b, "content") || tag(b, "content:encoded");
      // Google News: deskripsi berisi daftar liputan terkait (<li>) — jumlahnya = tanda ramai,
      // isinya dipakai sebagai "liputan terkait"; teksnya sendiri bukan cuplikan berita.
      const lis = decode(rawDesc).match(/<li>[\s\S]*?<\/li>/gi) || [];
      const coverage = lis.length;
      const related = lis.map((li) => ({
        title: stripTags((li.match(/<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || ""),
        link: decode((li.match(/href="([^"]*)"/i) || [])[1] || ""),
        source: stripTags((li.match(/<font[^>]*>([\s\S]*?)<\/font>/i) || [])[1] || ""),
      })).filter((r) => r.title && jaccard(words(r.title), words(title)) < 0.8);
      let excerpt = coverage ? "" : stripTags(rawDesc);
      if (!excerpt || jaccard(words(excerpt), words(title)) > 0.6 || /^\s*submitted by/i.test(excerpt)) excerpt = "";
      if (excerpt.length > 260) excerpt = excerpt.slice(0, 257).replace(/\s+\S*$/, "") + "…";
      if (looksLikeSpam(title, source)) continue;
      if (title) items.push({ title, link, ts, source: source || "", excerpt, coverage, related });
    }
    return items;
  }

  // ------------------------------------------------------------------ berita
  const GN = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;
  const CHANNELS = {
    crypto: {
      title: "Berita Kripto Hari Ini", sub: "Rangkuman pasar aset digital dari berbagai sumber.", cat: "Kripto",
      feeds: [
        { url: GN("kripto OR bitcoin OR ethereum when:1d"), name: "Google Berita" },
        { url: "https://www.cnbcindonesia.com/market/rss", name: "CNBC Indonesia", filter: /kripto|crypto|bitcoin|btc|ethereum|eth\b|solana|token|blockchain|stablecoin|aset digital|bappebti|ojk/i },
      ],
      forum: [{ url: "https://www.reddit.com/r/CryptoCurrency/hot/.rss?limit=25", name: "Reddit r/CryptoCurrency" }],
    },
    world: {
      title: "Berita Dunia", sub: "Peristiwa penting dari seluruh dunia hari ini.", cat: "Dunia",
      feeds: [
        { url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=id&gl=ID&ceid=ID:id", name: "Google Berita" },
        { url: "https://feeds.bbci.co.uk/indonesia/rss.xml", name: "BBC News Indonesia" },
      ],
      forum: [{ url: "https://www.reddit.com/r/worldnews/hot/.rss?limit=25", name: "Reddit r/worldnews" }],
    },
    viral: {
      title: "Berita Viral", sub: "Yang sedang ramai dibicarakan di media sosial dan forum.", cat: "Viral",
      feeds: [
        { url: GN("viral when:1d"), name: "Google Berita" },
        { url: GN("trending media sosial OR warganet when:1d"), name: "Google Berita" },
      ],
      forum: [{ url: "https://www.reddit.com/r/indonesia/hot/.rss?limit=25", name: "Reddit r/indonesia", show: true }],
    },
  };

  async function news(channel, { force = false } = {}) {
    const ch = CHANNELS[channel];
    if (!ch) throw new Error("Kanal tidak dikenal: " + channel);
    if (force) mem.delete("news:" + channel);
    return cached("news:" + channel, 10 * 60 * 1000, async () => {
      const results = await Promise.allSettled([...ch.feeds, ...ch.forum].map(async (f) => {
        const items = parseFeed(await getText(f.url), f.name);
        return { f, items: f.filter ? items.filter((i) => f.filter.test(i.title + " " + i.excerpt)) : items };
      }));
      const articles = [], forum = [];
      let ok = 0;
      results.forEach((r, i) => {
        const f = [...ch.feeds, ...ch.forum][i];
        if (r.status !== "fulfilled") { note("warn", `${f.name}: ${r.reason && r.reason.message}`); return; }
        ok++;
        const isForum = ch.forum.includes(f);
        for (const it of r.value.items) {
          if (isForum) {
            forum.push(it);
            if (f.show) articles.push({ ...it, source: `Forum · ${f.name.replace("Reddit ", "")}`, forumPost: true });
          } else articles.push(it);
        }
      });
      if (!ok) throw new Error("Tidak bisa mengambil berita. Periksa koneksi internet.");
      return rank(articles, forum, ch);
    });
  }

  /** Gabungkan cerita yang sama, beri skor hot, pisahkan headline dan daftar. */
  function rank(articles, forum, ch) {
    const now = env.now();
    const fresh = articles.filter((a) => now - a.ts < 3 * 86400000).sort((a, b) => b.ts - a.ts);
    const clusters = [];
    for (const a of fresh) {
      const w = words(a.title);
      const c = clusters.find((c) => jaccard(c.words, w) >= 0.45);
      if (c) { c.members.push(a); c.sources.add(a.source); }
      else clusters.push({ words: w, members: [a], sources: new Set([a.source]) });
    }
    const forumWords = forum.map((f) => new Set(words(f.title)));
    for (const c of clusters) {
      const lead = c.members.find((m) => m.excerpt) || c.members[0];
      const best = c.members.reduce((x, y) => (y.coverage > x.coverage ? y : x), c.members[0]);
      const newest = Math.max(...c.members.map((m) => m.ts));
      const ageH = (now - newest) / 3600000;
      const forumHits = forumWords.filter((fw) => c.words.filter((x) => fw.has(x)).length >= 2).length;
      c.score = (1 + c.sources.size + 0.5 * best.coverage + 0.6 * forumHits) * Math.exp(-ageH / 10) * (lead.forumPost ? 0.8 : 1);
      c.item = {
        title: c.members[0].title,
        excerpt: lead.excerpt || summarizeCoverage(c),
        source: c.members[0].source,
        sources: [...c.sources],
        related: dedupeRelated([
          ...c.members.slice(1).map((m) => ({ title: m.title, source: m.source, link: m.link })),
          ...c.members.flatMap((m) => m.related || []),
        ]).slice(0, 5),
        link: c.members[0].link,
        ts: newest,
        time: ago(newest),
        forumHits,
        coverage: best.coverage,
      };
    }
    const byScore = [...clusters].sort((a, b) => b.score - a.score);
    const hot = byScore.slice(0, 3).map((c) => c.item);
    const hotSet = new Set(hot);
    const list = clusters.map((c) => c.item).filter((i) => !hotSet.has(i)).sort((a, b) => b.ts - a.ts).slice(0, 40);
    return {
      title: ch.title, sub: ch.sub, cat: ch.cat,
      updatedAt: now,
      hot, list,
      stats: { articles: fresh.length, stories: clusters.length, forumPosts: forum.length },
    };
  }

  function dedupeRelated(list) {
    const out = [];
    for (const r of list) if (!out.some((o) => jaccard(words(o.title), words(r.title)) > 0.7)) out.push(r);
    return out;
  }

  function summarizeCoverage(c) {
    const n = c.sources.size;
    const extra = c.members[0].coverage > 1 ? ` dan ${c.members[0].coverage - 1} liputan terkait` : "";
    if (n > 1) return `Diberitakan oleh ${[...c.sources].slice(0, 3).join(", ")}${n > 3 ? ` dan ${n - 3} sumber lain` : ""}${extra}.`;
    return `Dilaporkan oleh ${c.members[0].source || "sumber berita"}${extra}.`;
  }

  /** Teks rangkuman RheusInterface untuk dialog artikel. */
  function explain(item) {
    const parts = [];
    parts.push(`RheusInterface menemukan cerita ini di ${item.sources.length} sumber` +
      (item.coverage > 1 ? ` dengan ${item.coverage} liputan terkait` : "") + ".");
    if (item.forumHits) parts.push(`Topik ini juga sedang dibahas di ${item.forumHits} utas forum.`);
    parts.push(`Terakhir diperbarui ${item.time === "baru saja" ? "baru saja" : item.time + " yang lalu"}.`);
    return parts.join(" ");
  }

  // ------------------------------------------------------------------ bitcoin
  const sma = (a, n) => a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : NaN;
  function rsi(closes, n = 14) {
    if (closes.length <= n) return NaN;
    let g = 0, l = 0;
    for (let i = closes.length - n; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    if (l === 0) return 100;
    const rs = (g / n) / (l / n);
    return 100 - 100 / (1 + rs);
  }
  function stdev(a) {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /**
   * Sinyal teknikal pada satu titik waktu. Hanya memakai data sampai titik itu.
   * @param {number[]} closes  harga penutupan harian (paling lama → terbaru)
   * @param {number} h         horizon dalam hari (1, 7, 30)
   */
  function technical(closes, h) {
    const price = closes[closes.length - 1];
    const ma20 = sma(closes, 20), ma50 = sma(closes, 50), ma200 = sma(closes, 200);
    const rets = [];
    for (let i = Math.max(1, closes.length - 30); i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const vol = stdev(rets) || 0.02; // volatilitas harian
    const lb = Math.min(h === 1 ? 3 : h, closes.length - 1);
    const mom = Math.log(price / closes[closes.length - 1 - lb]) / (vol * Math.sqrt(lb));
    const r = rsi(closes);
    const f = [];
    const add = (w, v, why) => { if (Number.isFinite(v)) f.push({ w, v, why }); };
    add(h >= 7 ? 0.5 : 0.3, price > ma50 ? 1 : -1, price > ma50 ? "Harga di atas MA-50 harian" : "Harga di bawah MA-50 harian");
    add(0.35, ma20 > ma50 ? 1 : -1, ma20 > ma50 ? "MA-20 di atas MA-50 (tren naik)" : "MA-20 di bawah MA-50 (tren melemah)");
    if (Number.isFinite(ma200)) add(h >= 30 ? 0.5 : 0.2, price > ma200 ? 1 : -1, price > ma200 ? "Di atas MA-200 (tren besar naik)" : "Di bawah MA-200 (tren besar turun)");
    add(h === 1 ? 0.45 : 0.35, clamp(mom, -2, 2) / 2, mom > 0.3 ? "Momentum jangka pendek positif" : mom < -0.3 ? "Momentum jangka pendek negatif" : "Momentum datar");
    if (Number.isFinite(r)) {
      const rv = r > 75 ? -0.6 : r < 25 ? 0.6 : (r - 50) / 50; // RSI ekstrem → cenderung berbalik
      add(0.25, rv, r > 70 ? `RSI ${r.toFixed(0)} jenuh beli` : r < 30 ? `RSI ${r.toFixed(0)} jenuh jual` : `RSI ${r.toFixed(0)} netral`);
    }
    const wsum = f.reduce((x, y) => x + y.w, 0) || 1;
    const score = f.reduce((x, y) => x + y.w * y.v, 0) / wsum; // -1..1
    return { price, score, vol, rsi: r, ma20, ma50, ma200, factors: f };
  }

  /**
   * Kalibrasi dari sejarah: hitung skor teknikal untuk setiap hari di masa lalu, kelompokkan
   * menjadi 3 (bearish / netral / bullish), lalu catat apa yang benar-benar terjadi h hari
   * kemudian. Probabilitas = frekuensi historis (dihaluskan ke rata-rata keseluruhan).
   * @param {number} upto  hanya pakai hari < upto (untuk uji balik tanpa melihat masa depan)
   */
  function calibrate(closes, h, scores, upto = closes.length) {
    const start = 200;
    const rows = [];
    for (let t = start; t + h < upto; t++) {
      const sc = scores ? scores[t] : technical(closes.slice(0, t + 1), h);
      const ret = Math.log(closes[t + h] / closes[t]);
      const band = 0.25 * sc.vol * Math.sqrt(h);
      rows.push({ s: sc.score, ret, out: ret > band ? "up" : ret < -band ? "down" : "side" });
    }
    if (rows.length < 30) return null;
    const sorted = rows.map((r) => r.s).sort((x, y) => x - y);
    const edges = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
    const bucketOf = (x) => (x < edges[0] ? 0 : x < edges[1] ? 1 : 2);
    const count = () => ({ up: 0, side: 0, down: 0, n: 0, rets: [] });
    const all = count(), buckets = [count(), count(), count()];
    for (const r of rows) {
      for (const c of [all, buckets[bucketOf(r.s)]]) { c[r.out]++; c.n++; c.rets.push(r.ret); }
    }
    const K = 20; // penghalusan: bucket kecil ditarik ke rata-rata keseluruhan
    const base = { up: all.up / all.n, side: all.side / all.n, down: all.down / all.n };
    const probs = buckets.map((c) => {
      const p = {};
      for (const k of ["up", "side", "down"]) p[k] = (c[k] + K * base[k]) / (c.n + K);
      const med = c.rets.slice().sort((x, y) => x - y)[Math.floor(c.rets.length / 2)] || 0;
      return { ...p, n: c.n, medianRet: med };
    });
    return { edges, bucketOf, probs, base, n: all.n };
  }

  /** Skor teknikal untuk semua hari (dipakai kalibrasi & uji balik). */
  function allScores(closes, h) {
    const out = new Array(closes.length);
    for (let t = 200; t < closes.length; t++) out[t] = technical(closes.slice(0, t + 1), h);
    return out;
  }

  /**
   * Model arah harga RheusInterface.
   * Arah & probabilitas = frekuensi historis untuk sinyal teknikal yang mirip (lihat calibrate).
   * Sentimen (Fear & Greed, funding rate) ditampilkan sebagai konteks, tidak mengubah
   * probabilitas karena sejarahnya tidak tersedia untuk dikalibrasi.
   */
  function model(closes, h, sentiment = {}, cal = null) {
    const tech = technical(closes, h);
    cal = cal || calibrate(closes, h);
    let probs, bucket = 1, medianRet = 0, n = 0;
    if (cal) {
      bucket = cal.bucketOf(tech.score);
      const b = cal.probs[bucket];
      probs = { up: b.up, side: b.side, down: b.down };
      medianRet = b.medianRet;
      n = b.n;
    } else {
      probs = { up: 1 / 3, side: 1 / 3, down: 1 / 3 };
    }
    const diff = probs.up - probs.down;
    const direction = probs.side > Math.max(probs.up, probs.down) || Math.abs(diff) < 0.05 ? "side" : diff > 0 ? "up" : "down";
    const edge = cal ? Math.max(Math.abs(probs.up - cal.base.up), Math.abs(probs.down - cal.base.down)) : 0;
    const confidence = edge < 0.04 ? "rendah" : edge < 0.09 ? "sedang" : "tinggi";
    const target = tech.price * Math.exp(direction === "side" ? 0 : medianRet);

    const reasons = tech.factors.slice().sort((a, b) => b.w * Math.abs(b.v) - a.w * Math.abs(a.v)).map((x) => ({ text: x.why, bull: x.v > 0 }));
    if (Number.isFinite(sentiment.fng)) {
      reasons.push({ text: sentiment.fng < 30 ? `Fear & Greed ${sentiment.fng} (takut)` : sentiment.fng > 70 ? `Fear & Greed ${sentiment.fng} (serakah)` : `Fear & Greed ${sentiment.fng} (netral)`, bull: sentiment.fng < 50, context: true });
    }
    return {
      price: tech.price, score: tech.score, probs, direction, target, confidence,
      vol: tech.vol, rsi: tech.rsi, ma20: tech.ma20, ma50: tech.ma50, ma200: tech.ma200, reasons,
      history: cal ? { n, total: cal.n, signal: ["bearish", "netral", "bullish"][bucket], base: cal.base } : null,
    };
  }

  /**
   * Uji balik walk-forward: pada setiap hari t (sejak `from`), kalibrasi hanya dari data
   * sebelum t, lalu bandingkan dengan kenyataan h hari kemudian.
   */
  function backtest(closes, h, from = 330, scores = null) {
    scores = scores || allScores(closes, h);
    let n = 0, hit = 0, total = 0, brier = 0, brierBase = 0;
    for (let t = Math.max(330, from); t + h < closes.length; t++) {
      const cal = calibrate(closes, h, scores, t + 1);
      if (!cal) continue;
      const m = model(closes.slice(0, t + 1), h, {}, cal);
      const ret = Math.log(closes[t + h] / closes[t]);
      const band = 0.25 * scores[t].vol * Math.sqrt(h);
      const actual = ret > band ? "up" : ret < -band ? "down" : "side";
      const o = { up: +(actual === "up"), side: +(actual === "side"), down: +(actual === "down") };
      brier += (m.probs.up - o.up) ** 2 + (m.probs.side - o.side) ** 2 + (m.probs.down - o.down) ** 2;
      brierBase += (cal.base.up - o.up) ** 2 + (cal.base.side - o.side) ** 2 + (cal.base.down - o.down) ** 2;
      total++;
      if (m.direction !== "side") { n++; hit += (m.direction === "up") === (ret > 0); }
    }
    return { days: total, calls: n, accuracy: n ? hit / n : NaN, brier: brier / (total || 1), brierBase: brierBase / (total || 1),
      skilled: total > 30 && brier < brierBase * 0.99 };
  }

  const TFS = {
    "24j": { label: "24 jam", h: 1, interval: 60, bars: 24 },
    "7h": { label: "7 hari", h: 7, interval: 240, bars: 42 },
    "30h": { label: "30 hari", h: 30, interval: 1440, bars: 30 },
  };

  async function krakenOHLC(interval) {
    return cached("kraken:" + interval, 5 * 60 * 1000, async () => {
      const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval}`);
      if (j.error && j.error.length) throw new Error(j.error.join(", "));
      const key = Object.keys(j.result).find((k) => k !== "last");
      return j.result[key].map((c) => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[6] }));
    });
  }

  async function bitcoin(tfKey = "24j") {
    const tf = TFS[tfKey] || TFS["24j"];
    const [daily, bars, spot, fng, global, funding] = await Promise.allSettled([
      krakenOHLC(1440),
      tf.interval === 1440 ? krakenOHLC(1440) : krakenOHLC(tf.interval),
      cached("cg:spot", 60 * 1000, () => getJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,idr&include_24hr_change=true&include_24hr_vol=true")),
      cached("fng", 30 * 60 * 1000, () => getJson("https://api.alternative.me/fng/?limit=1")),
      cached("cg:global", 10 * 60 * 1000, () => getJson("https://api.coingecko.com/api/v3/global")),
      cached("okx:funding", 10 * 60 * 1000, () => getJson("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP")),
    ]);
    const val = (r) => (r.status === "fulfilled" ? r.value : null);
    if (!val(daily)) throw new Error("Tidak bisa mengambil data harga Bitcoin. Periksa koneksi internet.");

    const dailyBars = val(daily);
    const closes = dailyBars.map((b) => b.c);
    const s = val(spot) && val(spot).bitcoin;
    if (s && s.usd) closes[closes.length - 1] = s.usd; // harga terkini
    const fngVal = val(fng) && val(fng).data && +val(fng).data[0].value;
    const fngCls = val(fng) && val(fng).data && val(fng).data[0].value_classification;
    const fundRate = val(funding) && val(funding).data && val(funding).data[0] ? +val(funding).data[0].fundingRate : NaN;
    const dom = val(global) && val(global).data && val(global).data.market_cap_percentage && val(global).data.market_cap_percentage.btc;

    const scores = allScores(closes, tf.h);
    const m = model(closes, tf.h, { fng: fngVal, funding: fundRate }, calibrate(closes, tf.h, scores));
    // Uji balik otomatis ±250 hari terakhir: kalau model tidak terbukti lebih baik dari
    // tebakan dasar, keyakinan diturunkan ke "rendah" agar tidak menyesatkan.
    const skill = backtest(closes, tf.h, closes.length - 250, scores);
    if (!skill.skilled) m.confidence = "rendah";
    m.skill = skill;
    const series = (val(bars) || dailyBars).slice(-tf.bars);
    const hi = Math.max(...series.map((b) => b.h)), lo = Math.min(...series.map((b) => b.l));
    const first = series[0].o, last = m.price;
    const chg = s && tf.h === 1 && Number.isFinite(s.usd_24h_change) ? s.usd_24h_change : (last / first - 1) * 100;
    // Support/resistance: level terdekat di bawah/atas harga dari titik terendah/tertinggi
    // jendela, sepertiga terakhir jendela, dan MA-20/MA-50. Cadangan: ±1 deviasi harian.
    const recent = series.slice(-Math.max(6, Math.round(series.length / 3)));
    const levels = [lo, hi, Math.min(...recent.map((b) => b.l)), Math.max(...recent.map((b) => b.h)), m.ma20, m.ma50]
      .filter(Number.isFinite);
    const below = levels.filter((x) => x < last), above = levels.filter((x) => x > last);
    const sup = below.length ? Math.max(...below) : last * Math.exp(-m.vol);
    const res = above.length ? Math.min(...above) : last * Math.exp(m.vol);

    const usdIdr = s && s.usd && s.idr ? s.idr / s.usd : NaN;
    const vol24 = s && s.usd_24h_vol;
    return {
      tf: tfKey, tfLabel: tf.label, updatedAt: env.now(),
      price: last, priceIdr: last * usdIdr, change: chg, high: hi, low: lo,
      series: series.map((b) => b.c),
      model: m,
      support: sup, resistance: res,
      market: {
        fng: Number.isFinite(fngVal) ? { value: fngVal, label: translateFng(fngCls) } : null,
        volume24h: vol24 || null,
        dominance: dom || null,
        funding: Number.isFinite(fundRate) ? fundRate : null,
        rsi: m.rsi,
        vol30: m.vol * Math.sqrt(30) * 100,
      },
    };
  }

  function translateFng(c) {
    return { "Extreme Fear": "Sangat takut", Fear: "Takut", Neutral: "Netral", Greed: "Serakah", "Extreme Greed": "Sangat serakah" }[c] || c || "";
  }

  // ------------------------------------------------------------------ transkripsi
  async function transcribe(url, onStage = () => {}) {
    if (!env.getTranscript) throw new Error("RheusInterface belum dikonfigurasi (getTranscript).");
    onStage("Mengambil subtitle dari YouTube…", 25);
    const data = await env.getTranscript(url);
    onStage("Menyusun transkripsi…", 60);
    const segments = data.segments || [];
    const TB = root.TranscriptBot || (typeof require === "function" ? require("./transcriptbot.js") : null);
    onStage("TranscriptBot membuat ringkasan…", 85);
    const digest = TB.digest(segments, { title: data.title });
    const last = segments[segments.length - 1];
    const duration = last ? last.start + (last.duration || 0) : 0;
    return { ...data, digest, duration, markdown: TB.summarize(segments, { title: data.title }) };
  }

  return {
    VERSION, configure, news, explain, bitcoin, model, transcribe, parseFeed, rank,
    _calibrate: calibrate, _allScores: allScores, _technical: technical, backtest,
    channels: Object.keys(CHANNELS), TFS, log: () => log.slice(), _ago: ago,
  };
});
