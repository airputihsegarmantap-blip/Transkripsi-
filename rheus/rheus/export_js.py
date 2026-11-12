"""Hasilkan konstanta TranscriptBot 3 untuk versi JavaScript (berjalan di HP).

    python -m rheus.export_js ../web/tb3-const.js

Kamus & pola regex diambil langsung dari kode Python agar versi HP identik dengan versi server.
Uji `test_js_constants_up_to_date` memastikan file hasil selalu sesuai.
"""

from __future__ import annotations

import json
import sys

from . import learn, text, transcriptbot as tb


def _rx(p):
    flags = "i" if p.flags & 2 else ""  # re.I == 2
    return {"source": p.pattern, "flags": flags}


def build() -> dict:
    return {
        "VERSION": tb.VERSION,
        "STOPWORDS": sorted(tb.STOPWORDS),
        "FILLER_SEQ": tb.FILLER_SEQ,
        "NORMALIZE": tb.NORMALIZE,
        "ORDINALS": tb.ORDINALS,
        "UNITS": tb.UNITS,
        "MULT": sorted(tb.MULT),
        "PREFIXES": tb.PREFIXES,
        "SUFFIXES": tb.SUFFIXES,
        "BREAK_BEFORE": tb.BREAK_BEFORE,
        "SOFT_BREAK": sorted(tb.SOFT_BREAK),
        "RX": {k: _rx(getattr(tb, k)) for k in ("FLUFF", "CONCLUSION", "STRONG_CONCL", "TOPIC_INTRO", "UNIT_NOUNS", "STEP_VERB", "LEAD", "FLUFF_TAIL", "NUM_WORD")},
        "PUNCT": {
            "LABELS": list(learn.LABELS), "HASH_BITS": learn.HASH_BITS, "SINCE_BUCKETS": list(learn._SINCE_BUCKETS),
            "DISCOURSE": sorted(learn.DISCOURSE), "STOP": sorted(text.STOP),
        },
    }


def render() -> str:
    data = json.dumps(build(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return ("// DIBUAT OTOMATIS oleh `python -m rheus.export_js` — jangan diedit manual.\n"
            "(function (r) { const C = " + data + ";\n"
            "  if (typeof module === 'object' && module.exports) module.exports = C; else r.TB3_CONST = C; })"
            "(typeof window !== 'undefined' ? window : globalThis);\n")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "../web/tb3-const.js"
    with open(out, "w", encoding="utf-8") as f:
        f.write(render())
    print("ditulis:", out)
