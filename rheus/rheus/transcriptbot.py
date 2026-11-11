"""TranscriptBot 3 — transkrip lengkap yang rapi + ringkasan, untuk video YouTube berbahasa Indonesia.

Baru di versi 3 (dibanding 2.0 yang berjalan di HP):
  * Transkrip LENGKAP yang sudah dirapikan: kata pengisi dibuang, kata tidak baku dibakukan,
    TITIK & KOMA dikembalikan oleh model machine learning (learn.PunctModel), huruf kapital
    awal kalimat & nama diri (learn.CaseModel), angka jadi digit, dan dibagi per paragraf
    dengan stempel waktu.
  * Ringkasan dihitung dari kalimat hasil tanda baca (bukan potongan subtitle acak),
    TextRank & MMR dihitung dengan NumPy.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np

from .learn import Brain

VERSION = "3.0"

# ------------------------------------------------------------------ kamus
STOPWORDS = set("""
ada adalah adanya agak agar akan akhirnya aku akulah amat anda antara apa apakah apalagi atau ataupun aja ah
bagai bagaimana bagi bahkan bahwa baik banyak barangkali bawah beberapa begini begitu belum benar berapa berbagai
bersama betul biasa biasanya bila bisa boleh bukan cuma cukup dahulu dalam dan dapat dari daripada dekat demi
demikian dengan depan di dia diri dirinya dong dulu enggak engga ga gak gimana gitu gini guys halo hai hal hanya
harus hingga ia ialah ini itu iya ya jadi jika jangan juga justru kah kalau kali kalian kami kamu kan karena kata
ke kemudian kenapa kepada ketika kini kita kok lagi lah lain lalu lama langsung lebih loh lho maka mana masih mau
memang mereka meski mungkin nah namun nanti nya oh oke ok pada padahal para pasti pernah pula pun punya saja
sambil sampai sangat saat sama sebab sebagai sebelum sebenarnya sebuah secara sedang sedikit segala sehingga sejak
sekali sekarang sekitar selain selalu seluruh semua sementara semuanya sendiri seperti sering serta sesuatu setelah
setiap siapa sih sini situ supaya tadi tak tapi tanpa tentang tentu terhadap terus tetapi tidak toh udah sudah
untuk walau yaitu yakni yang uh eh hmm em ehm nih tuh deh dah kayak kaya banget bener teman temen saya selamat
datang channel video subscribe like comment komentar kolom menonton nonton pertama kedua ketiga keempat kelima
keenam ketujuh kedelapan kesembilan kesepuluh terakhir buat bikin orang kayaknya pokoknya kemarin tahu tau lihat
liat kasih cara biar sekian kembali minggu hari waktu sebaiknya jam pagi malam siang sore menit detik turun naik
atas bawah kira-kira cuma lumayan pengalaman pengalamannya cerita membuat mudah tutorial langkah
""".split())

FILLERS = ["ya teman-teman", "teman-teman semua", "teman-teman", "ya kan", "kan ya", "gitu loh", "gitu ya",
           "kayak gitu", "ya guys", "guys", "gitu", "sih", "deh", "dong", "nih", "tuh", "loh", "lho",
           "eh", "em", "ehm", "hmm", "uh", "ya"]
FILLER_SEQ = sorted([f.split() for f in FILLERS], key=len, reverse=True)
NORMALIZE = {
    "nggak": "tidak", "ngga": "tidak", "gak": "tidak", "ga": "tidak", "enggak": "tidak", "engga": "tidak",
    "udah": "sudah", "dah": "sudah", "aja": "saja", "gimana": "bagaimana", "kayak": "seperti",
    "bikin": "membuat", "pake": "pakai", "banget": "sekali", "gede": "besar", "dikit": "sedikit",
    "abis": "habis", "biar": "agar", "tau": "tahu", "emang": "memang", "gampang": "mudah",
    "nyari": "mencari", "ngerti": "mengerti", "kalo": "kalau", "trus": "terus", "gitu": "begitu",
}
ORDINALS = ["pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh", "kedelapan", "kesembilan", "kesepuluh"]
ORD_LABEL = [o.capitalize() for o in ORDINALS]
FLUFF = re.compile(r"subscribe|like dan|lonceng|notifikasi|selamat datang|sampai jumpa|semoga bermanfaat|terima kasih sudah|"
                   r"assalamualaikum|wassalam|link di deskripsi|kolom komentar|selamat mencoba|sekian dulu|kembali lagi di|"
                   r"di video (?:kali )?ini|kali ini (?:aku|saya|kita|gue) (?:mau|akan|ingin)|hari ini (?:kita|aku|saya) (?:akan |mau )?"
                   r"(?:bahas|membahas|masak|cerita)", re.I)
CONCLUSION = re.compile(r"kesimpulan|intinya|pada akhirnya|singkatnya|ringkasnya|kuncinya|menurut (?:aku|saya)|^jadi\b", re.I)
STRONG_CONCL = re.compile(r"kesimpulan|intinya|kuncinya|singkatnya|ringkasnya|pada akhirnya", re.I)
TOPIC_INTRO = re.compile(r"(?:hari ini|di video (?:ini|kali ini)|video kali ini|kali ini)\s+(?:kita|aku|saya|gue)?\s*(?:akan|mau|ingin)?\s*"
                         r"(?:bahas|membahas|bicara(?:kan)?|mengulas|masak|memasak|cerita(?:kan)?|berbagi|share|jelaskan|menjelaskan|kasih)"
                         r"\s+(?:tentang|soal|mengenai)?\s*(.+)", re.I)

# ------------------------------------------------------------------ angka
UNITS = {"nol": 0, "satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6, "tujuh": 7, "delapan": 8,
         "sembilan": 9, "sepuluh": 10, "sebelas": 11, "seratus": 100, "seribu": 1000}
MULT = {"puluh", "belas", "ratus", "ribu", "juta", "miliar"}
UNIT_NOUNS = re.compile(r"^(persen|kali|jam|menit|detik|hari|minggu|bulan|tahun|sendok|siung|butir|piring|gelas|buah|orang|kg|gram|"
                        r"liter|derajat|meter|km|juta|ribu|rupiah|dolar|negara|langkah|tips|cara|poin|hal)$")


def _is_num(w: str) -> bool:
    return w in UNITS or w in MULT


def _parse_number(ws: list[str]) -> int:
    total = cur = 0
    for w in ws:
        if w in UNITS:
            v = UNITS[w]
            if v in (100, 1000):
                cur = (cur or 1) * v
                if v == 1000:
                    total += cur
                    cur = 0
            else:
                cur += v
        elif w == "puluh":
            cur = (cur or 1) * 10
        elif w == "belas":
            cur = (cur or 1) + 10
        elif w == "ratus":
            cur = (cur or 1) * 100
        elif w == "ribu":
            total += (cur or 1) * 1000
            cur = 0
        elif w == "juta":
            total += (cur or 1) * 1_000_000
            cur = 0
        elif w == "miliar":
            total += (cur or 1) * 1_000_000_000
            cur = 0
    return total + cur


def numbers_to_digits(text: str) -> str:
    ws = text.split(" ")
    out, i = [], 0
    while i < len(ws):
        lw = ws[i].lower().strip(",.")
        if _is_num(lw):
            j, group = i, []
            while j < len(ws) and _is_num(ws[j].lower().strip(",.")):
                w = ws[j].lower().strip(",.")
                nxt = ws[j + 1].lower().strip(",.") if j + 1 < len(ws) else ""
                if group and group[-1] in ("puluh", "belas") and nxt in ("puluh", "belas"):
                    break
                group.append(w)
                trailing = ws[j][len(ws[j].rstrip(",.")):]
                j += 1
                if trailing:
                    break
            nxt = ws[j].lower().strip(",.") if j < len(ws) else ""
            prev = ws[i - 1].lower() if i > 0 else ""
            keep = len(group) == 1 and group[0] in ("satu", "dua") and not UNIT_NOUNS.match(nxt) and prev not in ("pos", "nomor", "langkah", "tahap", "ke")
            if keep:
                out.append(ws[i])
                i += 1
                continue
            last = ws[j - 1]
            punct = last[len(last.rstrip(",.")):]
            out.append(str(_parse_number(group)) + punct)
            i = j
        else:
            out.append(ws[i])
            i += 1
    s = " ".join(out)
    s = re.sub(r"(\d+) persen", r"\1%", s, flags=re.I)
    s = re.sub(r"(\d+)%?\s+(\d+)%?\s+(\d+)%?(?=[\s,.]|$)",
               lambda m: f"{m[1]}/{m[2]}/{m[3]}" if int(m[1]) + int(m[2]) + int(m[3]) == 100 else m[0], s)
    s = re.sub(r"(\d+) derajat celcius", r"\1°C", s, flags=re.I)
    s = re.sub(r"(\d+) sampai (\d+)", r"\1–\2", s)
    return s


# ------------------------------------------------------------------ teks dasar
PREFIXES = ["meng", "meny", "mem", "men", "me", "peng", "peny", "pem", "pen", "pe", "ber", "be", "ter", "di", "ke", "se"]
SUFFIXES = ["kannya", "annya", "nya", "kan", "an", "i", "lah", "kah", "pun"]
_W = re.compile(r"[a-z]+(?:-[a-z]+)*")


def stem(w: str) -> str:
    for s in SUFFIXES:
        if w.endswith(s) and len(w) - len(s) >= 4:
            w = w[: -len(s)]
            break
    for p in PREFIXES:
        if w.startswith(p) and len(w) - len(p) >= 4:
            w = w[len(p):]
            break
    return w


def content(t: str) -> list[str]:
    return [w for w in _W.findall(t.lower()) if len(w) > 2 and w not in STOPWORDS]


def tokens(t: str) -> list[str]:
    return [stem(w) for w in content(t)]


def fmt_time(sec: float) -> str:
    sec = int(sec)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


# ------------------------------------------------------------------ transkrip rapi
def _word_stream(segments: list[dict]) -> list[tuple[str, float]]:
    out = []
    for seg in segments:
        st = float(seg.get("start") or 0)
        for w in str(seg.get("text") or "").split():
            w = re.sub(r"^[\"'(\[]+|[\"')\]]+$", "", w)
            if w:
                out.append((w, st))
    return out


def clean_words(stream: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """Buang kata pengisi & pengulangan, bakukan kata tidak baku (tanda baca bawaan dibuang)."""
    low = [re.sub(r"[.,!?;:]+$", "", w.lower()) for w, _ in stream]
    out, i = [], 0
    while i < len(stream):
        skip = 0
        for seq in FILLER_SEQ:
            if low[i:i + len(seq)] == seq:
                skip = len(seq)
                break
        if skip:
            i += skip
            continue
        w = NORMALIZE.get(low[i], low[i])
        if not w:
            i += 1
            continue
        if out and out[-1][0] == w and not w.isdigit():  # "yang yang" → "yang"
            i += 1
            continue
        out.append((w, stream[i][1]))
        i += 1
    return out


def tidy(segments: list[dict], brain: Brain) -> dict:
    """Transkrip lengkap rapi: kalimat bertanda baca + paragraf dengan stempel waktu."""
    stream = clean_words(_word_stream(segments))
    if not stream:
        return {"sentences": [], "paragraphs": [], "text": ""}
    words = [w for w, _ in stream]
    labels = brain.punct.predict(words)
    sentences, cur, cur_start = [], [], None
    for (w, t), lab in zip(stream, labels):
        if cur_start is None:
            cur_start = t
        cur.append(brain.case.apply(w) + ("," if lab == "," else ""))
        if lab == ".":
            sentences.append({"start": cur_start, "raw": " ".join(x.rstrip(",") for x in cur), "text": _finish(cur)})
            cur, cur_start = [], None
    if cur:
        sentences.append({"start": cur_start, "raw": " ".join(x.rstrip(",") for x in cur), "text": _finish(cur)})

    # Paragraf: 3–6 kalimat, dipotong saat topik bergeser (kemiripan kata turun) atau jeda waktu panjang.
    paragraphs, para = [], []
    prev_tokens: set[str] = set()
    for k, s in enumerate(sentences):
        tk = set(tokens(s["raw"]))
        shift = prev_tokens and tk and len(tk & prev_tokens) / max(1, min(len(tk), len(prev_tokens))) < 0.08
        gap = k > 0 and s["start"] - sentences[k - 1]["start"] > 25
        if para and (len(para) >= 6 or (len(para) >= 3 and (shift or gap))):
            paragraphs.append(para)
            para = []
        para.append(s)
        prev_tokens = tk
    if para:
        paragraphs.append(para)
    paras = [{"start": p[0]["start"], "text": " ".join(s["text"] for s in p)} for p in paragraphs]
    return {"sentences": sentences, "paragraphs": paras, "text": "\n\n".join(p["text"] for p in paras)}


def _finish(ws: list[str]) -> str:
    s = numbers_to_digits(" ".join(ws)).rstrip(",")
    s = re.sub(r"\s+,", ",", s)
    s = s[:1].upper() + s[1:]
    return s + "."


# ------------------------------------------------------------------ ringkasan
def _compress(t: str, max_words: int = 26) -> str:
    ws = t.rstrip(".").split(" ")
    if len(ws) <= max_words:
        return t
    for k in range(max_words, 9, -1):
        if ws[k - 1].endswith(","):
            return " ".join(ws[:k]).rstrip(",") + "."
    for k in range(max_words, 9, -1):
        if re.match(r"^(karena|sehingga|supaya|agar|kalau|misalnya|contohnya|sedangkan|yaitu|seperti|dengan|untuk|setelah|lalu|dan)$", ws[k], re.I):
            return " ".join(ws[:k]).rstrip(",") + "."
    return " ".join(ws[:max_words]).rstrip(",") + "."


LEAD = re.compile(r"^(?:(?:halo|hai|nah|oke|ok|jadi|terus|lalu|dan|tapi|nah jadi|oke jadi|setelah itu|langsung saja|sekarang|"
                  r"menurut (?:aku|saya)),?\s+)+", re.I)
FLUFF_TAIL = re.compile(r",?\s+(?:selamat mencoba|terima kasih|semoga bermanfaat|jangan lupa (?:like|subscribe|tulis|komen)|sampai jumpa|sekian dulu)\b.*$", re.I)


def polish(t: str, max_words: int = 26) -> str:
    t = FLUFF_TAIL.sub("", t.rstrip(".")).strip()
    t = LEAD.sub("", t)
    t = re.sub(r"^yang (pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir)\s+", lambda m: m[1] + ", ", t, flags=re.I)
    t = re.sub(r"^(pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|terakhir|kesimpulannya|intinya|kuncinya)\s+(?!,)",
               lambda m: m[1] + ", ", t, flags=re.I)
    t = _compress(t.strip() + ".", max_words)
    return (t[:1].upper() + t[1:]) if t and t != "." else ""


def _textrank(vecs: np.ndarray) -> np.ndarray:
    n = vecs.shape[0]
    sim = vecs @ vecs.T
    np.fill_diagonal(sim, 0)
    sim[sim < 0.05] = 0
    row = sim.sum(1, keepdims=True)
    row[row == 0] = 1
    m = sim / row
    pr = np.full(n, 1 / n)
    for _ in range(40):
        pr = 0.15 / n + 0.85 * (m.T @ pr)
    return pr / (pr.max() or 1)


def _keyphrases(texts: list[str], k: int = 8) -> list[str]:
    counts: Counter = Counter()
    for t in texts:
        ws = _W.findall(t.lower())
        for n in (1, 2, 3):
            for i in range(len(ws) - n + 1):
                g = ws[i:i + n]
                if any(w in STOPWORDS or len(w) < 3 for w in g):
                    continue
                counts[" ".join(g)] += 1
    scored = sorted(((p, c * (len(p.split()) ** 1.6)) for p, c in counts.items()
                     if c >= 2 and (" " in p or len(p) >= 5)), key=lambda x: -x[1])
    chosen: list[str] = []
    for p, _ in scored:
        if any(p in c for c in chosen):
            continue
        chosen = [c for c in chosen if c not in p]
        chosen.append(p)
        if len(chosen) >= k:
            break
    return chosen


def _detect_list(stream: list[tuple[str, float]]) -> list[dict] | None:
    low = [w for w, _ in stream]
    marks, expect = [], 0
    for i, w in enumerate(low):
        if expect < len(ORDINALS) and w == ORDINALS[expect] and (low[i + 1] if i + 1 < len(low) else "") not in ("kali", "orang", "tangan", "belah"):
            marks.append(i)
            expect += 1
    if len(marks) < 3:
        return None
    for i in range(marks[-1] + 3, len(low)):
        if low[i] == "terakhir":
            marks.append(i)
            break
    items = []
    for m, idx in enumerate(marks):
        start = idx + 1
        end = marks[m + 1] if m + 1 < len(marks) else min(len(low), start + 40)
        while end > start and low[end - 1] in ("yang", "langkah", "tips", "cara", "poin", "hal", "dan"):
            end -= 1
        cut = end
        for i in range(start + 6, end):
            if low[i] in ("nah", "kesimpulannya", "intinya", "semoga") or " ".join(low[i:i + 2]) in ("sampai jumpa", "terima kasih", "jangan lupa"):
                cut = i
                break
        text = numbers_to_digits(" ".join(low[start:min(cut, start + 30)]))
        ws = text.split()
        if len(ws) < 3:
            continue
        if len(ws) > 20:
            stop = next((k for k, w in enumerate(ws) if k >= 12 and w in ("karena", "kalau", "misalnya", "contohnya", "sedangkan", "banyak")), 0)
            text = " ".join(ws[:stop]) if stop else _compress(text, 24).rstrip(".")
        text = re.sub(r"\s+(?:dan|yang|karena|untuk|dengan|atau|di|ke|dari|itu|ini|jadi|nah|seperti|kalau|tapi|juga)$", "", text)
        label = "Terakhir" if low[idx] == "terakhir" else ORD_LABEL[m]
        items.append({"start": stream[idx][1], "label": label, "text": text[:1].upper() + text[1:] + "."})
    return items if len(items) >= 3 else None


def summarize(segments: list[dict], brain: Brain, title: str = "", tidy_result: dict | None = None) -> dict:
    td = tidy_result or tidy(segments, brain)
    sents = [s for s in td["sentences"] if len(s["raw"].split()) >= 4]
    n = len(sents)
    if not n:
        return {"overview": "", "short": "", "points": [], "details": [], "isList": False, "conclusion": "", "keywords": []}

    toks = [tokens(s["raw"]) for s in sents]
    vocab: dict[str, int] = {}
    for t in toks:
        for w in t:
            vocab.setdefault(w, len(vocab))
    mat = np.zeros((n, max(1, len(vocab))), dtype=np.float32)
    for i, t in enumerate(toks):
        for w, c in Counter(t).items():
            mat[i, vocab[w]] = 1 + math.log(c)
    df = (mat > 0).sum(0)
    mat *= np.log((n + 1) / (df + 1)) + 1
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vecs = mat / norms
    pr = _textrank(vecs)

    phrases = _keyphrases([s["raw"] for s in sents], 10)
    pstems = [tokens(p) for p in phrases]
    title_t = set(tokens(title))
    scores = np.zeros(n)
    for i, s in enumerate(sents):
        ts = set(toks[i])
        sc = pr[i]
        hits = sum(1 for ps in pstems if ps and all(w in ts for w in ps))
        sc += 0.25 * min(hits, 3) / 3
        if title_t:
            sc += 0.2 * len(title_t & ts) / len(title_t)
        if re.search(r"\d|persen|sendok|siung|menit|jam|derajat", s["text"]):
            sc += 0.08
        if len(toks[i]) < 4:
            sc *= 0.5
        if FLUFF.search(s["raw"]):
            sc *= 0.15
        scores[i] = sc

    def mmr(cands, k, lam=0.7, exclude=()):
        chosen, pool = [], [c for c in cands if c not in exclude]
        while len(chosen) < k and pool:
            best, bv = None, -1e9
            for i in pool:
                red = max((float(vecs[i] @ vecs[j]) + (0.25 if abs(i - j) <= 1 else 0) for j in chosen), default=0.0)
                v = lam * scores[i] - (1 - lam) * red
                if v > bv:
                    best, bv = i, v
            chosen.append(best)
            pool.remove(best)
        return chosen

    order = list(range(n))
    stream = clean_words(_word_stream(segments))
    list_items = _detect_list(stream)

    concl = None
    if n >= 5:
        tail = order[int(n * 0.6):]
        explicit = [k for k in tail if CONCLUSION.search(sents[k]["raw"]) and len(polish(sents[k]["text"]).split()) >= 5]
        strong = [k for k in explicit if STRONG_CONCL.search(sents[k]["raw"])]
        pool = strong or explicit
        if pool:
            concl = max(pool, key=lambda k: scores[k])
        else:
            cand = [k for k in tail if not FLUFF.search(sents[k]["raw"])]
            concl = max(cand, key=lambda k: scores[k]) if cand else None
    excl = {concl} if concl is not None else set()

    lead = _overview(sents, phrases, title)
    short_idx = mmr([i for i in order if not FLUFF.search(sents[i]["raw"])], 1, 0.65, excl)
    k_points = max(4, min(8, round(n * 0.3)))
    point_idx = sorted(i for i in mmr(order, min(k_points, n), 0.7, excl if list_items else excl | set(short_idx))
                       if not FLUFF.search(sents[i]["raw"]) or scores[i] > 0.5)

    conclusion = polish(sents[concl]["text"], 28) if concl is not None else ""
    if list_items:
        short = " ".join(x for x in [lead, f"Ada {len(list_items)} poin utama yang dijelaskan.", conclusion] if x)
        points = list_items
        covered = [set(tokens(it["text"])) for it in list_items]
        details = []
        for i in point_idx:
            t = set(toks[i])
            if FLUFF.search(sents[i]["raw"]) or i == concl:
                continue
            if any(len(t & c) / max(1, len(t)) > 0.4 for c in covered):
                continue
            details.append({"start": sents[i]["start"], "text": polish(sents[i]["text"])})
        details = details[:3]
    else:
        short = " ".join(x for x in [lead] + [polish(sents[i]["text"], 30) for i in short_idx] if x)
        points = [{"start": sents[i]["start"], "label": "", "text": polish(sents[i]["text"])} for i in point_idx]
        details = []
    return {"overview": lead, "short": short, "points": points, "details": details, "isList": bool(list_items),
            "conclusion": conclusion, "keywords": phrases[:8]}


def _overview(sents, phrases, title) -> str:
    intro = " ".join(s["raw"] for s in sents[: max(3, math.ceil(len(sents) * 0.15))])
    m = TOPIC_INTRO.search(intro)
    title_t = set(tokens(title))
    if m:
        ws = m[1].split()
        stop = next((k for k, w in enumerate(ws) if k >= 2 and re.match(r"^(jadi|nah|langsung|bahannya|kita|aku|saya|terus|oke|pertama|dan|yang|minggu|sekarang|secara|karena)$", w, re.I)), 0)
        topic = re.sub(r"[,.]$", "", " ".join(ws[: stop or 10]))
        tt = tokens(topic)
        if len(tt) >= 2 and (not title_t or title_t & set(tt)):
            return f"Video ini membahas {topic}."
    if title:
        t = re.sub(r"\s*[|\-–—]\s*[^|\-–—]*$", "", title.rstrip(".!?")).strip()
        return f"Video ini membahas {t[:1].lower() + t[1:]}."
    if len(phrases) >= 2:
        p = phrases[:3]
        return "Video ini membahas " + (f"{p[0]}, {p[1]}, dan {p[2]}" if len(p) == 3 else " dan ".join(p)) + "."
    return ""


def to_markdown(d: dict) -> str:
    lines = ["## Ringkasan Singkat", d["short"], ""]
    if d["isList"]:
        lines.append(f"## {len(d['points'])} Poin Utama")
        lines += [f"- **[{fmt_time(p['start'])}] {p['label']}:** {p['text']}" for p in d["points"]]
        if d["details"]:
            lines += ["", "## Detail Penting"] + [f"- **[{fmt_time(p['start'])}]** {p['text']}" for p in d["details"]]
    else:
        lines.append("## Poin-Poin Utama")
        lines += [f"- **[{fmt_time(p['start'])}]** {p['text']}" for p in d["points"]]
    if d["conclusion"]:
        lines += ["", "## Kesimpulan", d["conclusion"]]
    if d["keywords"]:
        lines += ["", "## Kata Kunci", ", ".join(d["keywords"])]
    lines += ["", f"_Diringkas oleh TranscriptBot {VERSION} (RheusInterface)._"]
    return "\n".join(lines)


def process(segments: list[dict], brain: Brain, title: str = "") -> dict:
    td = tidy(segments, brain)
    summary = summarize(segments, brain, title, td)
    return {"version": VERSION, "clean": {"paragraphs": td["paragraphs"], "text": td["text"]},
            "summary": summary, "markdown": to_markdown(summary)}
