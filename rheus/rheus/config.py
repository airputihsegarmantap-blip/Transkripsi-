"""Konfigurasi & daftar sumber data RheusInterface."""

from __future__ import annotations

import os
from urllib.parse import quote

DATA_DIR = os.environ.get("RHEUS_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")  # model hasil pelatihan awal (dibundel)
REFRESH_SECONDS = int(os.environ.get("RHEUS_REFRESH_SECONDS", "900"))  # penyegaran berita di latar belakang
ALLOWED_ORIGINS = os.environ.get("RHEUS_ALLOWED_ORIGINS", "*").split(",")
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Mobile Safari/537.36 RheusInterface/2"
)


def gn_search(q: str, region: str = "id") -> str:
    if region == "us":
        return f"https://news.google.com/rss/search?q={quote(q)}&hl=en-US&gl=US&ceid=US:en"
    return f"https://news.google.com/rss/search?q={quote(q)}&hl=id&gl=ID&ceid=ID:id"


def gn_topic(topic: str, region: str = "id") -> str:
    if region == "us":
        return f"https://news.google.com/rss/headlines/section/topic/{topic}?hl=en-US&gl=US&ceid=US:en"
    return f"https://news.google.com/rss/headlines/section/topic/{topic}?hl=id&gl=ID&ceid=ID:id"


# ---------------------------------------------------------------- Berita Utama
# Setiap feed membawa "label lemah" (weak label) untuk melatih pengklasifikasi kategori.
UTAMA = {
    "nasional": [
        {"url": gn_topic("NATION"), "name": "Google Berita"},
        {"url": "https://feeds.bbci.co.uk/indonesia/rss.xml", "name": "BBC News Indonesia", "filter": "nasional"},
        {"url": "https://www.cnbcindonesia.com/news/rss", "name": "CNBC Indonesia"},
    ],
    "internasional": [
        {"url": gn_topic("WORLD"), "name": "Google Berita"},
        {"url": gn_search("militer OR pasukan OR rudal OR perang OR serangan udara when:1d"), "name": "Google Berita", "label": "militer"},
        {"url": gn_search("ekonomi global OR tarif impor OR bank sentral OR harga minyak dunia when:1d"), "name": "Google Berita", "label": "ekonomi"},
        {"url": gn_search("hubungan bilateral OR kunjungan kenegaraan OR diplomatik OR KTT OR duta besar when:1d"), "name": "Google Berita", "label": "diplomasi"},
        {"url": gn_search("geopolitik OR NATO OR Laut China Selatan OR sanksi internasional OR Dewan Keamanan PBB when:1d"), "name": "Google Berita", "label": "geopolitik"},
    ],
}
UTAMA_CATEGORIES = {
    "internasional": ["militer", "ekonomi", "diplomasi", "geopolitik", "lainnya"],
}

# ---------------------------------------------------------------- Berita Finansial
FINANSIAL = [
    {"url": gn_topic("BUSINESS"), "name": "Google Berita"},
    {"url": gn_search("IHSG OR saham OR rupiah OR \"Bank Indonesia\" OR inflasi when:1d"), "name": "Google Berita"},
    {"url": gn_search("kripto OR bitcoin OR emas antam OR reksa dana when:1d"), "name": "Google Berita"},
    {"url": "https://www.cnbcindonesia.com/market/rss", "name": "CNBC Indonesia"},
]
FINANSIAL_TAGS = {
    "saham": "ihsg saham emiten bursa bei idx lq45 dividen ipo",
    "rupiah": "rupiah dolar valas kurs nilai tukar",
    "kripto": "kripto bitcoin btc ethereum crypto blockchain stablecoin token",
    "perbankan": "bank perbankan kredit bunga ojk bi suku",
    "emas": "emas antam komoditas minyak batu bara cpo nikel",
    "makro": "inflasi ekonomi pdb pertumbuhan apbn pajak defisit ekspor impor tarif",
}
FINANSIAL_TAG_LABEL = {"saham": "Saham", "rupiah": "Rupiah & Valas", "kripto": "Kripto", "perbankan": "Perbankan",
                       "emas": "Emas & Komoditas", "makro": "Ekonomi Makro"}

RETENTION_SECONDS = int(os.environ.get("RHEUS_RETENTION_SECONDS", str(48 * 3600)))  # memori sementara: 2 hari

# ---------------------------------------------------------------- Berita Viral
PLATFORMS = ["tiktok", "instagram", "x", "youtube", "facebook"]
VIRAL_CATEGORIES = ["makanan", "selebriti", "dance", "hewan", "olahraga", "teknologi", "sosial", "lainnya"]

VIRAL = {
    "id": [
        {"url": gn_search("viral when:1d"), "name": "Google Berita"},
        {"url": gn_search("viral tiktok when:1d"), "name": "Google Berita", "platform": "tiktok"},
        {"url": gn_search("viral instagram when:1d"), "name": "Google Berita", "platform": "instagram"},
        {"url": gn_search("viral \"media sosial X\" OR twitter when:2d"), "name": "Google Berita", "platform": "x"},
        {"url": gn_search("viral youtube when:2d"), "name": "Google Berita", "platform": "youtube"},
        {"url": gn_search("viral facebook when:2d"), "name": "Google Berita", "platform": "facebook"},
        {"url": gn_search("kuliner viral OR makanan viral when:3d"), "name": "Google Berita", "label": "makanan"},
        {"url": gn_search("artis viral OR skandal selebriti OR seleb viral when:2d"), "name": "Google Berita", "label": "selebriti"},
        {"url": gn_search("joget viral OR dance viral OR tren tiktok lagu when:3d"), "name": "Google Berita", "label": "dance"},
        {"url": gn_search("kucing viral OR hewan viral when:3d"), "name": "Google Berita", "label": "hewan"},
        {"url": "https://www.reddit.com/r/indonesia/hot/.rss?limit=25", "name": "Reddit r/indonesia", "forum": True},
    ],
    "us": [
        {"url": gn_search("viral when:1d", "us"), "name": "Google News"},
        {"url": gn_search("viral TikTok when:1d", "us"), "name": "Google News", "platform": "tiktok"},
        {"url": gn_search("viral Instagram when:2d", "us"), "name": "Google News", "platform": "instagram"},
        {"url": gn_search("viral on X OR twitter when:2d", "us"), "name": "Google News", "platform": "x"},
        {"url": gn_search("viral YouTube video when:2d", "us"), "name": "Google News", "platform": "youtube"},
        {"url": gn_search("viral Facebook post when:3d", "us"), "name": "Google News", "platform": "facebook"},
        {"url": gn_search("viral food OR viral recipe OR restaurant goes viral when:3d", "us"), "name": "Google News", "label": "makanan"},
        {"url": gn_search("celebrity scandal OR celebrity drama when:2d", "us"), "name": "Google News", "label": "selebriti"},
        {"url": gn_search("dance trend TikTok OR viral dance when:3d", "us"), "name": "Google News", "label": "dance"},
        {"url": gn_search("viral animal video OR viral dog OR viral cat when:3d", "us"), "name": "Google News", "label": "hewan"},
        {"url": "https://www.reddit.com/r/popular/.rss?limit=25", "name": "Reddit r/popular", "forum": True},
    ],
}

# ---------------------------------------------------------------- Radio
RADIO_MIRRORS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
]
RADIO_COUNTRIES = {"id": "ID", "us": "US"}
