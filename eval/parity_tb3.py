"""Uji paritas TranscriptBot 3: versi HP (JavaScript) harus memberi hasil sama dengan versi Python.

    python eval/parity_tb3.py [--brain rheus/rheus/models/brain.pkl]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "rheus"))

from rheus import cloud, learn, transcriptbot as tb  # noqa: E402


def segs_of(text):
    w = text.split()
    return [{"start": i / 7 * 3, "duration": 3, "text": " ".join(w[i:i + 7])} for i in range(0, len(w), 7)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brain", default=os.path.join(ROOT, "rheus", "rheus", "models", "brain.pkl"))
    ap.add_argument("--min-label-agreement", type=float, default=0.995)
    args = ap.parse_args()
    brain = learn.load(args.brain)
    tmp = tempfile.mkdtemp()
    cloud.export_model(brain, tmp)
    docs = []
    for fname in ("data.json", "heldout.json"):
        for d in json.load(open(os.path.join(ROOT, "eval", fname))):
            docs.append({"id": d["id"], "title": d["title"], "text": d["transcript"]})
    long_text = " ".join(json.load(open(os.path.join(ROOT, "eval", "data.json")))[0]["transcript"] for _ in range(20))
    docs.append({"id": "panjang", "title": "", "text": long_text})
    for d in docs:
        d["segments"] = segs_of(d["text"])
        d["py"] = tb.process(d["segments"], brain, d["title"])
        stream = tb.clean_words(tb._word_stream(d["segments"]))
        d["labels"] = brain.punct.predict([w for w, _ in stream])
    exp = os.path.join(tmp, "expected.json")
    json.dump({"docs": docs}, open(exp, "w"))
    out = subprocess.run(["node", os.path.join(ROOT, "eval", "parity_tb3.js"), tmp, exp], capture_output=True, text=True)
    print(out.stdout, out.stderr)
    r = json.loads(out.stdout.strip().splitlines()[-1])
    print(f"Paritas: label tanda baca sama {r['labelAgreement']:.2%}, transkrip rapi identik {r['tidyIdentical']}/{r['docs']}, "
          f"ringkasan identik {r['summaryIdentical']}/{r['docs']}, waktu JS total {r['jsMsTotal']} ms")
    assert r["labelAgreement"] >= args.min_label_agreement, "versi JS menyimpang dari Python"


if __name__ == "__main__":
    main()
