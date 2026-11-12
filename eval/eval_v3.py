"""Evaluasi TranscriptBot 3 vs TranscriptBot 2.0.

    python eval/eval_v3.py [--brain rheus/rheus/models/brain.pkl]

Mengukur tiga hal dengan data yang sama untuk kedua versi:
  A. Kerapian transkrip lengkap (fitur baru): tanda baca titik & koma, huruf kapital nama diri.
     Data: teks bertanda baca yang TIDAK pernah dipelajari (Wikipedia held-out + ringkasan acuan),
     tanda bacanya dibuang & dijadikan huruf kecil seperti subtitle, lalu dibandingkan.
  B. Kualitas ringkasan: ROUGE terhadap ringkasan acuan buatan manusia.
  C. Kecepatan pada transkrip panjang (±14.000 kata).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "rheus"))

from rheus import learn, transcriptbot as tb  # noqa: E402
from rheus.learn import tokenize_punctuated  # noqa: E402


def segs_of(text: str) -> list[dict]:
    w = text.split()
    return [{"start": i / 7 * 3, "duration": 3, "text": " ".join(w[i:i + 7])} for i in range(0, len(w), 7)]


def run_v2(docs: list[dict]) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"docs": docs}, f)
        path = f.name
    out = subprocess.run(["node", os.path.join(ROOT, "eval", "dump_v2.js"), path], capture_output=True, text=True, check=True)
    os.unlink(path)
    return json.loads(out.stdout)


# ------------------------------------------------------------------ ROUGE (sama dengan run_eval.js)
def body(md: str) -> str:
    out, skip = [], False
    for line in md.split("\n"):
        if re.match(r"^##\s*Kata Kunci", line, re.I):
            skip = True
            continue
        if line.startswith("##"):
            skip = False
            continue
        if skip or line.startswith("_") or not line.strip():
            continue
        line = re.sub(r"\*\*\[[\d:]+\][^*]*\*\*", "", line)
        out.append(re.sub(r"[*_]", "", re.sub(r"^[-*]\s*", "", line)))
    return " ".join(out)


def tok(t: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", t.lower())


def rouge_n(c, r, n):
    a = Counter(tuple(c[i:i + n]) for i in range(len(c) - n + 1))
    b = Counter(tuple(r[i:i + n]) for i in range(len(r) - n + 1))
    ov = sum(min(v, b[k]) for k, v in a.items())
    p, rc = ov / max(1, sum(a.values())), ov / max(1, sum(b.values()))
    return 2 * p * rc / (p + rc) if p + rc else 0.0


def rouge_l(c, r):
    prev = [0] * (len(r) + 1)
    for x in c:
        cur = [0]
        for j, y in enumerate(r, 1):
            cur.append(prev[j - 1] + 1 if x == y else max(prev[j], cur[-1]))
        prev = cur
    l = prev[-1]
    p, rc = l / max(1, len(c)), l / max(1, len(r))
    return 2 * p * rc / (p + rc) if p + rc else 0.0


# ------------------------------------------------------------------ kerapian
def tidy_scores(texts: list[str], brain) -> dict:
    v2_docs = []
    gold_all = []
    for i, t in enumerate(texts):
        toks, labels = tokenize_punctuated(t)
        gold_all.append((toks, labels))
        v2_docs.append({"id": str(i), "title": "", "segments": segs_of(" ".join(x.lower() for x in toks))})
    v2 = run_v2(v2_docs)

    def prf(pairs, lab):
        tp = sum(1 for g, p in pairs if g == lab and p == lab)
        fp = sum(1 for g, p in pairs if g != lab and p == lab)
        fn = sum(1 for g, p in pairs if g == lab and p != lab)
        return 2 * tp / max(1, 2 * tp + fp + fn)

    res = {}
    for name in ("v2", "v3"):
        pairs, cap_hit, cap_n = [], 0, 0
        for i, (toks, gold) in enumerate(gold_all):
            low = [x.lower() for x in toks]
            if name == "v3":
                pred = brain.punct.predict(low)
                forms = [brain.case.apply(w) for w in low]
            else:
                pred = [""] * len(low)
                k = 0
                for c in v2[str(i)]["sentenceWordCounts"]:
                    k += c
                    if 0 < k <= len(pred):
                        pred[k - 1] = "."
                forms = low  # versi 2 tidak punya transkrip rapi: huruf kecil semua
            pairs += list(zip(gold, pred))
            prev = "."
            for t, f, g in zip(toks, forms, gold):
                if prev != "." and t[:1].isupper():
                    cap_n += 1
                    cap_hit += f == t
                prev = g
        p_f1, c_f1 = prf(pairs, "."), prf(pairs, ",")
        cap = cap_hit / max(1, cap_n)
        res[name] = {"period_f1": round(p_f1, 3), "comma_f1": round(c_f1, 3), "proper_noun_case": round(cap, 3),
                     "tidiness": round((p_f1 + c_f1 + cap) / 3, 3)}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brain", default=os.path.join(ROOT, "rheus", "rheus", "models", "brain.pkl"))
    args = ap.parse_args()
    brain = learn.load(args.brain)
    print(f"Otak: {args.brain} — {brain.punct.seen:,} token dipelajari\n".replace(",", "."))

    # A. kerapian
    held_path = os.path.join(os.path.dirname(args.brain), "heldout.json")
    held = json.load(open(held_path)) if os.path.exists(held_path) else []
    refs = [d["reference"] for d in json.load(open(os.path.join(ROOT, "eval", "data.json"))) + json.load(open(os.path.join(ROOT, "eval", "heldout.json")))]
    A = tidy_scores(held[:200] + refs, brain)
    print("A. Kerapian transkrip lengkap (data yang tidak pernah dipelajari)")
    print("   Versi  Titik F1  Koma F1  Kapital nama diri  Skor kerapian")
    for k in ("v2", "v3"):
        r = A[k]
        print(f"   {k}     {r['period_f1']:7.3f}  {r['comma_f1']:7.3f}  {r['proper_noun_case']:17.3f}  {r['tidiness']:13.3f}")
    ratio = A["v3"]["tidiness"] / max(1e-9, A["v2"]["tidiness"])
    print(f"   → skor kerapian v3 = {ratio:.1f}x v2\n")

    # B. ringkasan
    docs = []
    for fname in ("data.json", "heldout.json"):
        for d in json.load(open(os.path.join(ROOT, "eval", fname))):
            docs.append({"id": d["id"], "title": d["title"], "segments": segs_of(d["transcript"]), "reference": d["reference"], "set": fname})
    v2 = run_v2([{k: d[k] for k in ("id", "title", "segments")} for d in docs])
    B = {"v2": [], "v3": []}
    for d in docs:
        ref = tok(d["reference"])
        v3md = tb.process(d["segments"], brain, d["title"])["markdown"]
        for name, md in (("v2", v2[d["id"]]["markdown"]), ("v3", v3md)):
            c = tok(body(md))
            B[name].append((rouge_n(c, ref, 1), rouge_n(c, ref, 2), rouge_l(c, ref)))
    print("B. Ringkasan vs acuan manusia (6 video)")
    print("   Versi  ROUGE-1  ROUGE-2  ROUGE-L")
    avg = {}
    for k in ("v2", "v3"):
        r1, r2, rl = (sum(x[i] for x in B[k]) / len(B[k]) for i in range(3))
        avg[k] = (r1, r2, rl)
        print(f"   {k}     {r1 * 100:6.1f}   {r2 * 100:6.1f}   {rl * 100:6.1f}")
    print()

    # C. kecepatan
    long_text = " ".join(json.load(open(os.path.join(ROOT, "eval", "data.json")))[0]["transcript"] for _ in range(60))
    segs = segs_of(long_text)
    v2l = run_v2([{"id": "long", "title": "", "segments": segs}])["long"]["ms"]
    t0 = time.perf_counter()
    tb.process(segs, brain, "")
    v3l = (time.perf_counter() - t0) * 1000
    print(f"C. Kecepatan transkrip {len(long_text.split()):,} kata".replace(",", "."))
    print(f"   v2 (ringkasan saja): {v2l:.0f} ms   v3 (transkrip rapi + ringkasan): {v3l:.0f} ms\n")

    out = {"tidiness": A, "rouge": {k: dict(zip(("r1", "r2", "rl"), v)) for k, v in avg.items()},
           "speed_ms": {"v2_summary_only": v2l, "v3_full": v3l}, "tokens_learned": brain.punct.seen}
    with open(os.path.join(ROOT, "eval", "results_v3.json"), "w") as f:
        json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
