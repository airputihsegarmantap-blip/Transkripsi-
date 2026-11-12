"""Rheus Cloud — pembuat "snapshot" data siap pakai untuk aplikasi SiLengkap.

    python -m rheus.cloud --out ../data/v2

Dijalankan terjadwal oleh GitHub Actions (.github/workflows/rheus-cloud.yml) lalu hasilnya
dipublikasikan ke branch `rheus-data` dan disajikan lewat CDN (raw.githubusercontent.com &
jsDelivr). Aplikasi cukup mengunduh file JSON kecil — tanpa server yang harus "bangun tidur".

Memori sementara: artikel disimpan 48 jam (config.RETENTION_SECONDS) lalu dihapus otomatis;
otak (model ML) disimpan di samping data sehingga terus belajar dari putaran ke putaran.
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import os
import time

import orjson

from . import __version__, btc, config, fetch, learn, news, radio, transcriptbot

FILES_VERSION = 2


def _dump(path: str, obj) -> int:
    data = orjson.dumps(obj, option=orjson.OPT_SERIALIZE_NUMPY)
    with open(path + ".tmp", "wb") as f:
        f.write(data)
    os.replace(path + ".tmp", path)
    return len(data)


def _load_json(path: str, default):
    try:
        with open(path, "rb") as f:
            return orjson.loads(f.read())
    except Exception:  # noqa: BLE001
        return default


def export_model(brain: learn.Brain, out_dir: str) -> dict:
    """Ekspor model tanda baca & huruf kapital untuk dijalankan di HP (TranscriptBot di aplikasi)."""
    os.makedirs(out_dir, exist_ok=True)
    W = brain.punct._matrix()[:, : 1 << learn.HASH_BITS].astype("<f4")
    W.tofile(os.path.join(out_dir, "punct.bin"))
    case = {}
    for w, c in brain.case.forms.items():
        form, n = c.most_common(1)[0]
        if n >= 2 and n / sum(c.values()) >= 0.6 and form != w:
            case[w] = form
    _dump(os.path.join(out_dir, "case.json"), case)
    meta = {"labels": list(learn.LABELS), "hashBits": learn.HASH_BITS, "tokensLearned": brain.punct.seen,
            "periodF1": round(brain.punct.f1_period.get(), 4), "caseWords": len(case), "brainVersion": learn.Brain.VERSION,
            "updatedAt": time.time()}
    _dump(os.path.join(out_dir, "meta.json"), meta)
    return meta


def knowledge_docs(snap: dict) -> list[dict]:
    """Dokumen ringkas untuk "Tanya Rheus" yang berjalan di HP (pencarian BM25 lokal)."""
    docs = []

    def add(stories, kind):
        for s in stories:
            docs.append({"t": s["title"], "x": (s.get("excerpt") or "")[:220], "s": s.get("source", ""), "l": s.get("link", ""),
                         "ts": int(s["ts"]), "k": kind, "c": s.get("categoryLabel") or ", ".join(s.get("tagLabels") or []),
                         "v": int(bool(s.get("verified")))})

    u = snap.get("utama") or {}
    for sec in (u.get("sections") or {}).values():
        add(sec["hot"] + sec["list"], "berita")
    f = snap.get("finansial") or {}
    add(f.get("hot", []) + f.get("list", []), "finansial")
    for r in ("id", "us"):
        v = snap.get("viral-" + r) or {}
        add(v.get("hot", []) + v.get("list", []), "viral")
    return docs


async def run(out: str, skip_radio_hours: float = 24) -> dict:
    t0 = time.time()
    now = time.time()
    os.makedirs(out, exist_ok=True)
    mem_path = os.path.join(out, "memory.json.gz")
    brain_path = os.path.join(out, "brain.pkl")
    try:
        with gzip.open(mem_path, "rb") as f:
            memory = orjson.loads(f.read())
    except Exception:  # noqa: BLE001
        memory = {}
    brain = learn.load(brain_path, os.path.join(config.MODEL_DIR, "brain.pkl"))
    tokens_before = brain.punct.seen

    hoax = await news.load_hoaxes(memory, now)
    timings = {}

    async def timed(name, coro):
        s = time.time()
        try:
            return name, await coro
        except Exception as exc:  # noqa: BLE001
            print(f"[{name}] gagal: {exc}")
            return name, None
        finally:
            timings[name] = round(time.time() - s, 2)

    results = await asyncio.gather(
        timed("utama", news.build_utama(brain, memory, hoax, now)),
        timed("finansial", news.build_finansial(brain, memory, hoax, now)),
        timed("viral-id", news.build_viral(brain, memory, hoax, "id", now)),
        timed("viral-us", news.build_viral(brain, memory, hoax, "us", now)),
        *(timed(f"btc-{tf}", btc.analyze(tf)) for tf in btc.TFS),
    )
    snap = {k: v for k, v in results if v is not None}

    # Radio jarang berubah: perbarui sekali sehari.
    for r in ("id", "us"):
        p = os.path.join(out, f"radio-{r}.json")
        if not os.path.exists(p) or time.time() - os.path.getmtime(p) > skip_radio_hours * 3600:
            name, val = await timed(f"radio-{r}", radio.stations(r, 80))
            if val:
                snap[name] = val

    sizes = {}
    for k, v in snap.items():
        sizes[k] = _dump(os.path.join(out, f"{k}.json"), v)
    sizes["knowledge"] = _dump(os.path.join(out, "knowledge.json"), {"updatedAt": now, "docs": knowledge_docs(snap)})
    model_meta = export_model(brain, os.path.join(out, "model"))

    learn.save(brain, brain_path)
    with gzip.open(mem_path + ".tmp", "wb") as f:
        f.write(orjson.dumps(memory))
    os.replace(mem_path + ".tmp", mem_path)

    def count(k):
        d = snap.get(k) or _load_json(os.path.join(out, f"{k}.json"), {})
        if "sections" in d:
            return sum(s["stats"]["stories"] for s in d["sections"].values())
        return (d.get("stats") or {}).get("stories")

    manifest = {
        "version": FILES_VERSION, "rheus": __version__, "transcriptbot": transcriptbot.VERSION,
        "updatedAt": now, "buildSeconds": round(time.time() - t0, 1), "retentionHours": config.RETENTION_SECONDS / 3600,
        "files": {k: {"bytes": b} for k, b in sizes.items()}, "timings": timings,
        "stories": {k: count(k) for k in ("utama", "finansial", "viral-id", "viral-us")},
        "hoaxClaims": len(memory.get("_hoax", [])),
        "learning": {"tokensLearnedThisRun": brain.punct.seen - tokens_before, **brain.stats()},
        "model": model_meta,
    }
    _dump(os.path.join(out, "manifest.json"), manifest)
    await fetch.close()
    print(json.dumps({k: manifest[k] for k in ("buildSeconds", "timings", "stories", "hoaxClaims", "files")}, indent=1, ensure_ascii=False))
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(config.DATA_DIR, "v2"))
    args = ap.parse_args()
    asyncio.run(run(args.out))


if __name__ == "__main__":
    main()
