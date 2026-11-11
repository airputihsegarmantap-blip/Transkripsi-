"""Pelatihan awal (bootstrap) otak RheusInterface.

    python -m rheus.train --wiki-pages 2000 --out rheus/models/brain.pkl

Sumber teks bertanda baca (self-supervised, tidak perlu pelabelan manual):
  - Wikipedia bahasa Indonesia (ringkasan artikel acak, lewat API resmi)
  - Deskripsi berita dari feed RSS SiLengkap
20% teks disisihkan sebagai data uji yang tidak pernah dipelajari (models/heldout.json).
Setelah server berjalan, otak terus belajar dari setiap berita baru (online learning).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import time

from . import config, fetch
from .feeds import parse_feed
from .learn import Brain, save

WIKI = ("https://id.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0"
        "&grnlimit=20&prop=extracts&exintro=1&explaintext=1&exlimit=20")


def _clean_wiki(t: str) -> str:
    t = re.sub(r"\([^)]{0,80}\)", "", t)          # buang keterangan dalam kurung (lafal, tahun)
    t = re.sub(r"\s+", " ", t).strip()
    return t


async def wiki_texts(pages: int) -> list[str]:
    out: list[str] = []
    sem = asyncio.Semaphore(3)

    async def batch():
        async with sem:
            r = await fetch.client().get(WIKI, headers={"User-Agent": "RheusInterface/2 (SiLengkap; pelatihan open-source)"})
            r.raise_for_status()
            for p in (r.json().get("query", {}).get("pages", {}) or {}).values():
                t = _clean_wiki(p.get("extract", ""))
                if len(t) > 200 and t.count(".") >= 2:
                    out.append(t)

    await asyncio.gather(*(batch() for _ in range(max(1, pages // 20))), return_exceptions=True)
    return out


async def news_texts() -> list[str]:
    feeds = [f for fs in config.UTAMA.values() for f in fs] + config.VIRAL["id"]
    res = await asyncio.gather(*(fetch.get_text(f["url"]) for f in feeds), return_exceptions=True)
    out = []
    for f, xml in zip(feeds, res):
        if isinstance(xml, Exception):
            continue
        out += [it["excerpt"] for it in parse_feed(xml, f["name"]) if it["excerpt"]]
    return out


async def main_async(args) -> dict:
    t0 = time.time()
    texts = await wiki_texts(args.wiki_pages)
    news = await news_texts()
    await fetch.close()
    random.Random(42).shuffle(texts)
    cut = int(len(texts) * 0.8)
    train, held = texts[:cut], texts[cut:]
    brain = Brain()
    for epoch in range(args.epochs):
        for t in train + news:
            brain.seen_texts.clear()
            brain.learn_text(t)
    from .learn import _stable_hash
    brain.seen_texts = {_stable_hash(t) for t in train + news}  # teks yang sama tidak dipelajari ulang saat server jalan
    save(brain, args.out)
    held_path = os.path.join(os.path.dirname(args.out), "heldout.json")
    with open(held_path, "w") as f:
        json.dump(held[:300], f, ensure_ascii=False)
    info = {"wiki_texts": len(texts), "news_texts": len(news), "train": len(train), "heldout": len(held),
            "tokens_learned": brain.punct.seen, "seconds": round(time.time() - t0, 1), "stats": brain.stats()["punctuation"]}
    print(json.dumps(info, ensure_ascii=False, indent=1))
    return info


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki-pages", type=int, default=2000)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--out", default=os.path.join(config.MODEL_DIR, "brain.pkl"))
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
