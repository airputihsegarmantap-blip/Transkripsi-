"""Kredibilitas sumber & pengecekan hoaks untuk Rheus.

Prinsip "Accurate":
  1. Headline hot hanya dari media kredibel (daftar di bawah — media arus utama yang
     terverifikasi Dewan Pers di Indonesia dan kantor berita/media besar di AS).
  2. Cerita yang diliput ≥2 media kredibel berbeda diberi tanda "Terverifikasi".
  3. Judul yang cocok dengan klaim yang sudah dinyatakan HOAKS oleh situs cek fakta
     (TurnBackHoax/Mafindo, Cek Fakta Tempo, Kompas Cek Fakta) dibuang.
  4. Judul dengan pola clickbait/hoaks klasik ditandai & tidak masuk headline.
"""

from __future__ import annotations

import re

# Nama media seperti yang muncul di Google Berita/News (huruf kecil, dicocokkan sebagai awalan/kata).
CREDIBLE_ID = [
    "kompas", "detik", "tempo", "cnn indonesia", "cnbc indonesia", "antara", "kontan", "bisnis.com", "bisnis indonesia",
    "katadata", "liputan6", "kumparan", "tribunnews", "okezone", "sindonews", "republika", "media indonesia", "jawa pos",
    "jawapos", "suara.com", "viva", "idn times", "bbc", "voa indonesia", "metro tv", "metrotvnews", "inews", "rri",
    "tvri", "beritasatu", "investor daily", "bloomberg technoz", "the jakarta post", "jakarta globe", "merdeka.com",
    "tirto", "grid.id", "kapanlagi", "insertlive", "cnbc", "reuters", "bloomberg", "tvonenews", "kompas tv", "sctv",
    "idx channel", "investing.com", "fxstreet", "money.kompas", "infobanknews", "warta ekonomi", "mnc", "pikiran rakyat",
]
CREDIBLE_US = [
    "reuters", "associated press", "ap news", "nbc", "cbs", "abc news", "cnn", "the new york times", "new york times",
    "the washington post", "washington post", "npr", "usa today", "fox news", "los angeles times", "people", "variety",
    "rolling stone", "the guardian", "bbc", "yahoo", "bloomberg", "cnbc", "forbes", "business insider", "newsweek",
    "e! news", "entertainment weekly", "today", "billboard", "the hollywood reporter", "time", "axios", "politico",
    "the wall street journal", "wall street journal", "marketwatch", "the verge", "techcrunch", "wired", "espn",
    "deadline", "tmz", "page six", "vulture", "the independent", "nypost", "new york post", "insider", "huffpost",
]

# Feed situs cek fakta (judul = klaim yang dinyatakan hoaks/salah/menyesatkan).
FACTCHECK_FEEDS = [
    {"url": "https://turnbackhoax.id/feed/", "name": "TurnBackHoax (Mafindo)"},
    {"url": "https://cekfakta.tempo.co/rss", "name": "Cek Fakta Tempo"},
]
FACTCHECK_LABEL = re.compile(r"^\s*\[?\s*(salah|hoaks|hoax|disinformasi|misinformasi|menyesatkan|keliru|fitnah|penipuan|satire|konten[^\]]*)\s*\]?\s*", re.I)

CLICKBAIT = re.compile(
    r"\b(dijamin|100% ampuh|bikin melongo|bikin geger|terbongkar!|wajib tahu|sebarkan|jangan sampai tidak|"
    r"you won'?t believe|shocking truth|doctors hate|miracle cure)\b|!!!", re.I)


def is_credible(source: str, region: str = "id") -> bool:
    s = (source or "").lower().strip()
    if not s:
        return False
    lists = CREDIBLE_ID + CREDIBLE_US if region == "id" else CREDIBLE_US + CREDIBLE_ID
    return any(s == c or s.startswith(c) or f" {c}" in f" {s}" for c in lists)


def clean_factcheck_title(t: str) -> str:
    """'[SALAH] Video Banjir di Jakarta Hari Ini' → 'Video Banjir di Jakarta Hari Ini'."""
    return FACTCHECK_LABEL.sub("", t or "").strip()


def is_clickbait(title: str) -> bool:
    return bool(CLICKBAIT.search(title or ""))
