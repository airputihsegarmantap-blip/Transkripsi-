"""Tanya Rheus — tanya-jawab berbasis pencarian (retrieval) atas pengetahuan yang dikumpulkan Rheus.

Ini langkah pertama menuju LLM: Rheus belum MENGARANG kalimat sendiri, tetapi mencari
potongan informasi paling relevan (BM25, github.com/dorianbrown/rank_bm25) dari berita,
analisa Bitcoin, dan ringkasan video yang sudah ia olah, lalu menyusunnya menjadi jawaban
beserta sumbernya. Pengetahuan bertambah setiap kali data baru masuk.
"""

from __future__ import annotations

import re
import threading
import time

from rank_bm25 import BM25Okapi

from .text import ago, content_words

BTC_Q = re.compile(r"\b(bitcoin|btc|kripto|crypto)\b", re.I)
PRICE_Q = re.compile(r"\b(harga|price|berapa|naik|turun|prediksi|arah)\b", re.I)


class Knowledge:
    def __init__(self, max_docs: int = 4000):
        self.docs: list[dict] = []
        self.keys: set[str] = set()
        self.max_docs = max_docs
        self.bm25 = None
        self.dirty = False
        self.btc: dict | None = None
        self.lock = threading.Lock()

    def add(self, title: str, text: str, source: str, link: str, ts: float, kind: str) -> None:
        key = (title or text)[:120].lower()
        if not key or key in self.keys:
            return
        with self.lock:
            self.keys.add(key)
            self.docs.append({"title": title, "text": text, "source": source, "link": link, "ts": ts, "kind": kind,
                              "tokens": content_words(title + " " + text)})
            if len(self.docs) > self.max_docs:
                old = self.docs[: len(self.docs) - self.max_docs]
                self.docs = self.docs[-self.max_docs:]
                for d in old:
                    self.keys.discard((d["title"] or d["text"])[:120].lower())
            self.dirty = True

    def add_stories(self, stories: list[dict], kind: str) -> None:
        for s in stories:
            self.add(s["title"], s.get("excerpt", ""), s.get("source", ""), s.get("link", ""), s.get("ts", time.time()), kind)

    def _index(self):
        if self.dirty or self.bm25 is None:
            with self.lock:
                corpus = [d["tokens"] or ["_"] for d in self.docs] or [["_"]]
                self.bm25 = BM25Okapi(corpus)
                self.dirty = False

    def ask(self, q: str, k: int = 4) -> dict:
        now = time.time()
        q = (q or "").strip()
        if not q:
            return {"answer": "Tulis pertanyaan dulu, misalnya: \"Apa berita kripto terbaru?\"", "sources": []}
        parts = []
        if BTC_Q.search(q) and PRICE_Q.search(q) and self.btc:
            b = self.btc
            dir_txt = {"up": "cenderung naik", "down": "cenderung turun", "side": "cenderung sideways"}[b["model"]["direction"]]
            parts.append(f"Harga Bitcoin saat ini sekitar US${b['price']:,.0f}".replace(",", ".") +
                         f". Untuk {b['tfLabel']} ke depan, model Rheus melihatnya {dir_txt} dengan keyakinan {b['model']['confidence']}"
                         f" (naik {b['model']['probs']['up']:.0%}, turun {b['model']['probs']['down']:.0%}). Ini bukan saran keuangan.")
        self._index()
        qt = content_words(q)
        sources = []
        if qt and self.docs:
            scores = self.bm25.get_scores(qt)
            # Sedikit prioritas untuk informasi yang lebih baru.
            ranked = sorted(range(len(self.docs)), key=lambda i: -(scores[i] * (1 + 0.3 * (now - self.docs[i]["ts"] < 86400))))
            for i in ranked[:k]:
                if scores[i] <= 0:
                    break
                d = self.docs[i]
                sources.append({"title": d["title"], "source": d["source"], "link": d["link"], "time": ago(d["ts"], now), "kind": d["kind"]})
        if sources:
            top = sources[0]
            parts.append(f"Informasi paling relevan yang Rheus temukan: \"{top['title']}\" ({top['source']}, {top['time']} lalu).")
            if len(sources) > 1:
                parts.append("Terkait: " + "; ".join(f"\"{s['title']}\" ({s['source']})" for s in sources[1:3]) + ".")
        if not parts:
            parts.append("Rheus belum menemukan informasi yang cocok. Coba kata kunci lain — pengetahuan Rheus bertambah setiap kali berita baru dikumpulkan.")
        return {"answer": " ".join(parts), "sources": sources, "knowledgeSize": len(self.docs)}
