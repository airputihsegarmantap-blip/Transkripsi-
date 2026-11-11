"""Peringkas lokal super ringan untuk transkrip Bahasa Indonesia.

Tanpa internet, tanpa API key, tanpa library tambahan (Python murni).

Metode: extractive summarization (gaya TextRank).
1. Transkrip dipotong menjadi "kalimat semu" ±25 kata, karena subtitle otomatis
   YouTube biasanya tanpa tanda baca.
2. Setiap kalimat diubah jadi vektor TF-IDF (stopword Indonesia dibuang,
   imbuhan umum dipangkas).
3. Kalimat dinilai dari seberapa mirip ia dengan kalimat-kalimat lain
   (sentralitas) ditambah bobot kata kunci; kalimat terpenting dipilih.
"""

from __future__ import annotations

import math
import re
from collections import Counter

STOPWORDS = set("""
ada adalah adanya agak agar akan akhirnya aku akulah amat anda andalah antara apa apaan apabila
apakah apalagi atau ataukah ataupun aja aj ah bagai bagaimana bagi bahkan bahwa bahwasanya baik
banyak barangkali bawah beberapa begini begitu belum benar berapa berbagai bersama betul biasa
biasanya bila bisa boleh bukan bukankah cuma cukup dahulu dalam dan dapat dari daripada dekat
demi demikian dengan depan di dia dialah diri dirinya dong dulu enggak engga ga gak gimana gitu
gini guys halo hai hal hanya harus hingga ia ialah ini inilah itu itulah iya ya jadi jika jangan
juga justru kah kalau kali kalian kami kamu kan karena kata ke kebetulan kecil kemudian kenapa
kepada ketika kini kita kok lagi lah lain lalu lama langsung lebih loh lho maka mana masih mau
memang mereka meski mungkin nah namun nanti nya oh oke ok pada padahal para pasti pernah pula
pun punya sajalah saja sambil sampai sangat saat sama sambil sebab sebagai sebelum sebenarnya
sebuah secara sedang sedikit segala sehingga sejak sekali sekarang sekitar selain selalu seluruh
semua sementara semuanya sendiri seperti sering serta sesuatu setelah setiap siapa sih sini situ
supaya tadi tak tapi tanpa tentang tentu terhadap terus tetapi tidak toh udah sudah untuk walau
yaitu yakni yang uh eh hmm em ehm nih tuh deh dah kayak kaya banget bener benar-benar teman
temen teman-teman semuanya selamat datang channel video subscribe like comment kalian
satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas puluh belas ratus ribu juta
pertama kedua ketiga keempat kelima keenam ketujuh kedelapan kesembilan kesepuluh terakhir
buat bikin orang kayaknya pokoknya terus kemarin tahu tau lihat liat
""".split())

# Penanda wacana: titik potong alami dalam ucapan tanpa tanda baca.
_BREAK_BEFORE = [
    "yang pertama", "yang kedua", "yang ketiga", "yang keempat", "yang kelima", "yang keenam",
    "yang ketujuh", "yang terakhir", "pertama", "kedua", "ketiga", "keempat", "kelima",
    "selanjutnya", "berikutnya", "kemudian", "setelah itu", "selain itu", "nah", "jadi",
    "kesimpulannya", "intinya", "oleh karena itu", "makanya", "tapi", "tetapi", "namun",
    "sedangkan", "misalnya", "contohnya", "kalau", "karena itu", "terakhir",
    "semoga", "jangan lupa", "sampai jumpa", "terima kasih", "oke",
]
_BREAK_BEFORE = sorted({tuple(p.split()) for p in _BREAK_BEFORE}, key=len, reverse=True)

# Kalimat basa-basi pembuka/penutup video — dijauhkan dari ringkasan.
_FLUFF = re.compile(
    r"subscribe|like dan|lonceng|notifikasi|selamat datang|sampai jumpa|semoga bermanfaat|"
    r"terima kasih sudah menonton|assalamualaikum|wassalam|link di deskripsi|komen", re.I)
_CONCLUSION = re.compile(r"kesimpulan|intinya|jadi\s|pada akhirnya|singkatnya|ringkasnya", re.I)

_PREFIXES = ("meng", "meny", "mem", "men", "me", "peng", "peny", "pem", "pen", "pe",
             "ber", "be", "ter", "di", "ke", "se")
_SUFFIXES = ("kannya", "annya", "nya", "kan", "an", "i", "lah", "kah", "pun")


def _stem(word: str) -> str:
    """Pemangkas imbuhan sederhana — cukup untuk mengelompokkan kata serumpun."""
    w = word
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    for pre in _PREFIXES:
        if w.startswith(pre) and len(w) - len(pre) >= 4:
            w = w[len(pre):]
            break
    return w


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]+", text.lower())
    return [_stem(w) for w in words if len(w) > 2 and w not in STOPWORDS]


def _fmt_time(sec: float) -> str:
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _make_sentences(segments: list[dict], min_words: int = 6, max_words: int = 35) -> list[dict]:
    """Gabungkan segmen subtitle menjadi kalimat semu.

    Kalimat dipotong di tanda baca, di depan penanda wacana ("yang kedua", "jadi",
    "selanjutnya", ...), atau paksa setelah ``max_words`` kata.
    """
    words: list[tuple[str, float]] = []
    for seg in segments:
        start = float(seg.get("start", 0) or 0)
        for w in (seg.get("text") or "").split():
            words.append((w, start))

    sentences: list[dict] = []
    buf: list[tuple[str, float]] = []

    def flush():
        if buf:
            sentences.append({"start": buf[0][1], "text": " ".join(w for w, _ in buf)})
            buf.clear()

    i = 0
    while i < len(words):
        if len(buf) >= min_words:
            lower = [w.lower().strip(",.!?") for w, _ in words[i:i + 3]]
            if any(tuple(lower[: len(m)]) == m for m in _BREAK_BEFORE):
                flush()
        buf.append(words[i])
        if re.search(r"[.!?]$", words[i][0]) and len(buf) >= 4:
            flush()
        elif len(buf) >= max_words:
            flush()
        i += 1
    flush()

    # Gabungkan potongan yang terlalu pendek ke kalimat sebelumnya.
    merged: list[dict] = []
    for s in sentences:
        if merged and len(s["text"].split()) < 5:
            merged[-1]["text"] += " " + s["text"]
        else:
            merged.append(s)
    return merged


def _tidy(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^(?:nah|oke|ok|jadi|ya|terus)\s+", "", text, flags=re.I)
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    if text and text[-1] not in ".!?":
        text += "."
    return text


def _score(segments: list[dict]):
    """Pecah transkrip jadi kalimat semu lalu beri skor kepentingan tiap kalimat."""
    sents = _make_sentences(segments)
    toks = [_tokens(s["text"]) for s in sents]
    n = len(sents)
    if not n:
        return sents, toks, [], []

    # TF-IDF
    df = Counter()
    for t in toks:
        df.update(set(t))
    idf = {w: math.log((n + 1) / (c + 1)) + 1 for w, c in df.items()}
    vecs = []
    for t in toks:
        tf = Counter(t)
        v = {w: (c / len(t)) * idf[w] for w, c in tf.items()} if t else {}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({w: x / norm for w, x in v.items()})

    # Kata kunci global: sering muncul tapi tidak di semua bagian.
    total = Counter(w for t in toks for w in t)
    keyword_score = {w: c * idf[w] for w, c in total.items() if c >= 2}
    top_keywords = [w for w, _ in sorted(keyword_score.items(), key=lambda x: -x[1])[:10]]
    kw_set = set(top_keywords)

    # Sentralitas: rata-rata kemiripan cosine dengan kalimat lain.
    # Untuk transkrip panjang, bandingkan dengan sampel agar tetap cepat di HP.
    step = max(1, n // 300)
    sample = range(0, n, step)
    scores = []
    for i, vi in enumerate(vecs):
        sim = 0.0
        for j in sample:
            if i == j:
                continue
            vj = vecs[j]
            small, big = (vi, vj) if len(vi) < len(vj) else (vj, vi)
            sim += sum(x * big.get(w, 0.0) for w, x in small.items())
        kw_bonus = len(kw_set.intersection(toks[i])) / (len(kw_set) or 1)
        length_pen = 1.0 if len(toks[i]) >= 4 else 0.5
        fluff_pen = 0.2 if _FLUFF.search(sents[i]["text"]) else 1.0
        scores.append((sim / max(1, len(sample)) + 0.3 * kw_bonus) * length_pen * fluff_pen)
    return sents, toks, scores, top_keywords


def top_sentences(segments: list[dict], max_words: int) -> list[str]:
    """Kalimat terpenting (urut sesuai video) dengan total kata <= max_words."""
    sents, _toks, scores, _kw = _score(segments)
    chosen, words = [], 0
    for k in sorted(range(len(sents)), key=lambda k: -scores[k]):
        w = len(sents[k]["text"].split())
        if words + w > max_words:
            continue
        chosen.append(k)
        words += w
    return [sents[k]["text"] for k in sorted(chosen)]


def summarize(segments: list[dict], title: str | None = None) -> str:
    """Kembalikan ringkasan dalam format Markdown."""
    sents, toks, scores, top_keywords = _score(segments)
    n = len(sents)
    if not n:
        return "_Transkrip terlalu pendek untuk diringkas._"

    def best_in(lo: int, hi: int, exclude: set[int]) -> int | None:
        cands = [k for k in range(lo, hi) if k not in exclude]
        return max(cands, key=lambda k: scores[k]) if cands else None

    # Ringkasan singkat: 3 kalimat terbaik secara global, urut sesuai video.
    k_short = min(3, n)
    short_idx = sorted(sorted(range(n), key=lambda k: -scores[k])[:k_short])
    used = set(short_idx)

    # Poin utama: bagi video jadi beberapa bagian, ambil kalimat terbaik per bagian.
    k_points = min(8, max(3, n // 3)) if n >= 3 else n
    point_idx = []
    for b in range(k_points):
        lo, hi = b * n // k_points, (b + 1) * n // k_points
        k = best_in(lo, hi, set())
        if k is not None:
            point_idx.append(k)

    # Kesimpulan: kalimat terbaik di 20% terakhir video.
    concl = None
    if n >= 5:
        tail = range(int(n * 0.6), n)
        explicit = [k for k in tail if _CONCLUSION.search(sents[k]["text"]) and not _FLUFF.search(sents[k]["text"])]
        if explicit:
            concl = max(explicit, key=lambda k: scores[k])
        else:
            concl = best_in(int(n * 0.8), n, set())
            if concl is not None and _FLUFF.search(sents[concl]["text"]):
                concl = None

    lines = ["## Ringkasan Singkat", " ".join(_tidy(sents[k]["text"]) for k in short_idx), ""]
    lines.append("## Poin-Poin Utama")
    for k in point_idx:
        lines.append(f"- **[{_fmt_time(sents[k]['start'])}]** {_tidy(sents[k]['text'])}")
    lines.append("")
    if concl is not None:
        lines += ["## Kesimpulan", _tidy(sents[concl]["text"]), ""]
    if top_keywords:
        # Tampilkan bentuk kata asli yang paling sering untuk tiap stem.
        surface = Counter()
        for w in re.findall(r"[a-zA-Z]+", " ".join(s["text"] for s in sents).lower()):
            if len(w) > 2 and w not in STOPWORDS:
                surface[(_stem(w), w)] += 1
        best_form = {}
        for (stem, w), c in surface.most_common():
            best_form.setdefault(stem, w)
        kws = ", ".join(best_form.get(k, k) for k in top_keywords[:8])
        lines += ["## Kata Kunci", kws, ""]
    lines.append("_Ringkasan dibuat oleh peringkas lokal (offline) — kalimat diambil langsung dari transkrip._")
    return "\n".join(lines)
