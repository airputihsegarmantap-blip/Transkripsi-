"""Uji RheusInterface dengan data tiruan (tanpa internet).  Jalankan: pytest -q rheus/tests"""

import json
import math
import os
import sys
import time
from email.utils import format_datetime
from datetime import datetime, timezone

import pytest

os.environ["RHEUS_NO_REFRESH"] = "1"
os.environ["RHEUS_DATA_DIR"] = "/tmp/rheus-test-data"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

from rheus import app as appmod, fetch, learn, news  # noqa: E402

NOW = time.time()
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def rfc(mins):
    return format_datetime(datetime.fromtimestamp(NOW - mins * 60, timezone.utc))


def gn(title, src, mins, related=0):
    lis = "".join(f"<li><a href='x{i}'>{title} versi {i}</a>&nbsp;<font>Media {i}</font></li>" for i in range(related))
    desc = ("<ol>" + lis + "</ol>").replace("<", "&lt;").replace(">", "&gt;")
    return f"<item><title>{title} - {src}</title><link>https://news.google.com/a/{abs(hash(title))}</link><pubDate>{rfc(mins)}</pubDate><description>{desc}</description><source url='x'>{src}</source></item>"


def rss(*items):
    return "<rss><channel>" + "".join(items) + "</channel></rss>"


def plain(title, desc, mins):
    return f"<item><title><![CDATA[{title}]]></title><link>https://x/{abs(hash(title))}</link><pubDate>{rfc(mins)}</pubDate><description><![CDATA[<img src='x'> {desc}]]></description></item>"


def kraken():
    p, rows = 74000 / math.exp(720 * 0.0005), []
    for i in range(720):
        o = p
        p *= math.exp(0.0005 + 0.012 * math.sin(i / 9) * (1 if i % 3 == 0 else -0.6))
        rows.append([int(NOW) - (720 - i) * 86400, str(o), str(max(o, p) * 1.01), str(min(o, p) * 0.99), str(p), "0", "10", 5])
    return json.dumps({"error": [], "result": {"XXBTZUSD": rows, "last": 1}})


def fake_get(url):
    if "kraken" in url:
        return kraken()
    if "simple/price" in url:
        return '{"bitcoin":{"usd":74007,"usd_24h_vol":28283954460.9,"usd_24h_change":1.13,"idr":1346530208}}'
    if "alternative.me" in url:
        return '{"data":[{"value":"29","value_classification":"Fear"}]}'
    if "api/v3/global" in url:
        return '{"data":{"market_cap_percentage":{"btc":57.4}}}'
    if "okx.com" in url:
        return '{"code":"0","data":[{"fundingRate":"0.0000452"}]}'
    if "radio-browser" in url:
        return json.dumps([{"stationuuid": "1", "name": "Radio Satu", "url_resolved": "https://s/1", "tags": "pop,news", "favicon": "", "codec": "MP3", "bitrate": 128},
                           {"stationuuid": "2", "name": "Radio Dua", "url_resolved": "http://s/2", "tags": "", "codec": "AAC", "bitrate": 64}])
    if "topic/NATION" in url:
        return rss(gn("DPR sahkan RUU baru tentang pendidikan nasional", "Kompas", 30, 4),
                   gn("DPR resmi sahkan RUU pendidikan nasional hari ini", "Tempo", 45, 1),
                   gn("bundesliga viral rekomendasi", "Website Kabupaten Contoh", 5))
    if "topic/WORLD" in url:
        return rss(gn("Presiden Prabowo bertemu PM Jepang bahas kerja sama bilateral", "Antara", 20, 3),
                   gn("NATO gelar latihan militer besar di Eropa Timur", "CNN Indonesia", 50, 2))
    if "militer" in url:
        return rss(gn("Pasukan dan tank dikerahkan ke perbatasan setelah serangan drone", "Detik", 60, 2))
    if "ekonomi" in url:
        return rss(gn("Bank sentral AS tahan suku bunga, harga minyak dunia naik", "CNBC", 70, 1))
    if "turnbackhoax" in url or "cekfakta" in url:
        return rss(plain("[SALAH] Video Banjir Besar Rendam Monas Jakarta Hari Ini", "Video lama dari 2020.", 60))
    if "en-US" in url and "topic/BUSINESS" in url:
        return rss(gn("Wall Street rallies as Nasdaq hits record high on earnings", "CNBC", 20, 3),
                   gn("Stocks rally: Nasdaq closes at record on strong earnings", "Reuters", 30, 1))
    if "en-US" in url and "topic/TECHNOLOGY" in url:
        return rss(gn("Nvidia unveils new AI chip as OpenAI demand surges", "The Verge", 25, 2),
                   gn("Nvidia unveils new AI chip as OpenAI demand surges for training", "TechCrunch", 35, 2),
                   gn("Cybersecurity firm reports ransomware breach at hospital chain", "Random Blog", 10, 0))
    if "en-US" in url and "Federal" in url:
        return rss(gn("Fed holds interest rates steady as inflation cools", "Bloomberg", 45, 2))
    if "topic/TECHNOLOGY" in url:
        return rss(gn("OpenAI rilis model AI baru, kecerdasan buatan makin canggih", "Kompas", 25, 3),
                   gn("OpenAI rilis model AI baru, kecerdasan buatan makin canggih sekali", "Detik", 40, 2))
    if "inet.detik.com" in url:
        return rss(plain("Samsung umumkan smartphone lipat terbaru", "HP lipat dengan chip baru.", 30))
    if "topic/BUSINESS" in url:
        return rss(gn("Rupiah menguat ke level 15.800 per dolar AS", "Kontan", 20, 2))
    if "IHSG" in url:
        return rss(gn("IHSG ditutup naik 1 persen didorong saham perbankan", "CNBC Indonesia", 15, 3),
                   gn("Video banjir besar rendam Monas Jakarta hari ini beredar", "Situs Abal", 5, 0),
                   gn("Saham bank kecil melonjak, investor ritel ramai membeli", "BlogSahamKu", 8, 0))
    if "kripto" in url and "news.google.com" in url:
        return rss(gn("ETF Bitcoin catat arus masuk US$1,2 miliar dalam sepekan", "CNBC Indonesia", 30, 5),
                   gn("Arus masuk ETF Bitcoin capai US$1,2 miliar sepekan", "Kontan", 50, 2))
    if "cnbcindonesia.com/market" in url:
        return rss(plain("IHSG ditutup menguat", "Saham bank naik.", 10))
    if "bbci" in url or "cnbcindonesia.com/news" in url:
        return rss(plain("Banjir rendam ratusan rumah di Semarang", "Hujan deras sejak pagi membuat sungai meluap. Warga mengungsi ke balai desa, dan petugas menyalurkan bantuan makanan.", 80))
    if "news.google.com" in url and "viral" in url.lower():
        if "en-US" in url:
            return rss(gn("Restaurant goes viral on TikTok for giant burger recipe", "NBC", 40, 2),
                       gn("Celebrity scandal: actor and singer divorce drama on Instagram", "People", 90, 1))
        return rss(gn("Warung bakso viral di TikTok karena resep kuah unik dan murah", "Detik", 15, 3),
                   gn("Artis viral setelah skandal cerai diumumkan di Instagram", "Kompas", 25, 2),
                   gn("Joget lagu baru jadi tren dance viral di TikTok", "Liputan6", 35, 1),
                   gn("Kucing lucu viral bantu kasir minimarket", "Kumparan", 55, 0))
    if "reddit" in url:
        return "<feed><entry><title>Bakso viral TikTok kuah unik</title><link href='https://r/1'/><updated>2026-01-01T00:00:00Z</updated></entry></feed>"
    return rss()


@pytest.fixture(scope="module")
def client():
    async def get_text(url, ttl=300):
        return fake_get(url)

    fetch.get_text = get_text
    appmod.fetch.get_text = get_text
    with TestClient(appmod.app) as c:
        yield c


def test_health(client):
    r = client.get("/v1/health").json()
    assert r["status"] == "ok" and r["transcriptbot"] == "4.0"


def test_utama(client):
    d = client.get("/v1/news/utama").json()
    nas, intl = d["sections"]["nasional"], d["sections"]["internasional"]
    titles = [s["title"] for s in nas["hot"] + nas["list"]]
    assert any("RUU" in t for t in titles)
    assert not any("bundesliga" in t for t in titles), "spam harus tersaring"
    ruu = next(s for s in nas["hot"] if "RUU" in s["title"])
    assert len(ruu["sources"]) >= 2, "dua artikel RUU digabung jadi satu cerita"
    cats = {s["category"] for s in intl["hot"] + intl["list"]}
    assert {"militer", "ekonomi"} <= cats
    assert all(s["categoryLabel"] for s in intl["hot"] + intl["list"])


def test_viral_regions(client):
    d = client.get("/v1/news/viral?region=id").json()
    allst = d["hot"] + d["list"]
    bakso = next(s for s in allst if "bakso" in s["title"].lower())
    assert "tiktok" in bakso["platforms"] and bakso["category"] == "makanan"
    artis = next(s for s in allst if "Artis" in s["title"])
    assert artis["category"] == "selebriti" and "instagram" in artis["platforms"]
    assert any(c["id"] == "dance" and c["count"] >= 1 for c in d["categories"])
    us = client.get("/v1/news/viral?region=us").json()
    assert us["region"] == "us" and any("burger" in s["title"].lower() for s in us["hot"] + us["list"])


def test_btc(client):
    for tf in ("24j", "7h", "30h"):
        b = client.get(f"/v1/btc?tf={tf}").json()
        p = b["model"]["probs"]
        assert abs(p["up"] + p["side"] + p["down"] - 1) < 1e-6
        assert b["support"] <= b["price"] <= b["resistance"]
        assert b["model"]["skill"]["days"] > 100
        if not b["model"]["skill"]["skilled"]:
            assert b["model"]["confidence"] == "rendah"


def test_finansial_accuracy(client):
    d = client.get("/v1/news/finansial").json()
    allst = d["hot"] + d["list"]
    titles = [s["title"] for s in allst]
    assert not any("Monas" in t for t in titles), "klaim yang sudah dinyatakan HOAKS harus dibuang"
    assert d["stats"]["hoaxFiltered"] >= 1
    etf = next(s for s in allst if s["title"].startswith("ETF Bitcoin"))
    assert etf["verified"] and "kripto" in etf["tags"]
    assert all(h["credible"] for h in d["hot"]), "headline hot hanya dari media kredibel"
    blog = next(s for s in allst if "BlogSahamKu" in s["source"])
    assert not blog["credible"] and blog not in d["hot"]
    assert any(t["id"] == "saham" and t["count"] >= 1 for t in d["tags"])


def test_radio(client):
    r = client.get("/v1/radio?region=id").json()
    assert [s["name"] for s in r["stations"]] == ["Radio Satu", "Radio Dua"]
    assert r["stations"][0]["https"] is True


def test_transcript_process(client):
    d = json.load(open(os.path.join(ROOT, "eval", "data.json")))[0]
    w = d["transcript"].split()
    segs = [{"start": i / 7 * 3, "duration": 3, "text": " ".join(w[i:i + 7])} for i in range(0, len(w), 7)]
    r = client.post("/v1/transcript/process", json={"video_id": "abc", "title": d["title"], "segments": segs}).json()
    tb = r["transcriptbot"]
    assert tb["version"] == "4.0"
    assert tb["clean"]["paragraphs"] and tb["clean"]["text"][0].isupper()
    for f in ("guys", " eh ", " gitu"):
        assert f not in tb["clean"]["text"].lower()
    assert "50/30/20" in tb["clean"]["text"]
    assert tb["summary"]["isList"] and len(tb["summary"]["points"]) == 5


def test_ask(client):
    client.get("/v1/news/viral?region=id")
    a = client.get("/v1/ask", params={"q": "bakso viral"}).json()
    assert a["sources"] and "bakso" in a["sources"][0]["title"].lower()
    b = client.get("/v1/ask", params={"q": "berapa harga bitcoin"}).json()
    assert "Bitcoin" in b["answer"]


def test_learning_improves():
    """Model tanda baca makin akurat seiring bertambahnya teks yang dipelajari."""
    from rheus.learn import Brain, tokenize_punctuated

    refs = [d["reference"] for d in json.load(open(os.path.join(ROOT, "eval", "data.json"))) + json.load(open(os.path.join(ROOT, "eval", "heldout.json")))]
    test, train = refs[:2], refs[2:]

    def f1(b):
        tp = fp = fn = 0
        for t in test:
            toks, gold = tokenize_punctuated(t)
            pred = b.punct.predict([x.lower() for x in toks])
            for g, p in zip(gold, pred):
                tp += g == "." and p == "."
                fp += g != "." and p == "."
                fn += g == "." and p != "."
        return 2 * tp / max(1, 2 * tp + fp + fn)

    b = Brain()
    before = f1(b)
    for t in train * 3:
        b.seen_texts.clear()
        b.learn_text(t)
    assert f1(b) > before


def test_category_model_learns():
    b = learn.Brain()
    for i in range(30):
        b.classify("viral", f"resep makanan kuliner enak restoran {i}", "makanan")
        b.classify("viral", f"kucing anjing hewan lucu {i}", "hewan")
    y, p, src = b.classify("viral", "restoran kuliner baru", None)
    assert y == "makanan"


def test_backtest_incremental_equals_reference():
    import numpy as np
    from rheus import btc

    rng = np.random.default_rng(7)
    closes = 30000 * np.exp(np.cumsum(rng.normal(0, 0.025, 600)))
    for h in (1, 7, 30):
        t = btc.technical_all(closes, h)
        a, b = btc.backtest(closes, h, 350, t), btc.backtest_reference(closes, h, 350, t)
        assert a["calls"] == b["calls"] and abs(a["brier"] - b["brier"]) < 1e-9


def test_punct_fast_equals_reference():
    from rheus.learn import Brain

    refs = [d["reference"] for d in json.load(open(os.path.join(ROOT, "eval", "data.json")))]
    b = Brain()
    for t in refs * 2:
        b.seen_texts.clear()
        b.learn_text(t)
    words = " ".join(json.load(open(os.path.join(ROOT, "eval", "heldout.json")))[0]["transcript"].split()).split()
    assert b.punct.predict(words) == b.punct.predict_slow(words)


def test_model_does_not_force_unrelated_category():
    b = learn.Brain()
    for i in range(40):
        b.classify("viral", f"aplikasi smartphone android baru teknologi {i}", "teknologi")
    y, p, src = b.classify("viral", "Anggota polres diperiksa setelah video pesta beredar", None)
    assert y != "teknologi"


def test_cloud_snapshot_and_retention(tmp_path):
    import asyncio
    import gzip

    import orjson

    from rheus import cloud

    async def get_text(url, ttl=300):
        return fake_get(url)

    fetch.get_text = get_text
    out = str(tmp_path / "v2")
    os.makedirs(out)
    # Memori lama: satu artikel berumur 3 hari harus terhapus, satu berumur 1 jam harus tetap.
    old = {"title": "Berita lama sekali tentang pemilu daerah", "link": "https://x/old", "source": "Kompas", "ts": NOW - 3 * 86400, "excerpt": "", "coverage": 0, "related": []}
    recent = {"title": "Gubernur resmikan jembatan baru di Kalimantan", "link": "https://x/new", "source": "Antara", "ts": NOW - 3600, "excerpt": "", "coverage": 0, "related": []}
    with gzip.open(os.path.join(out, "memory.json.gz"), "wb") as f:
        f.write(orjson.dumps({"utama:nasional": [old, recent]}))
    m = asyncio.run(cloud.run(out))
    for name in ("manifest", "utama", "finansial", "teknologi", "finansial-us", "teknologi-us", "viral-id", "viral-us", "btc-24j", "btc-7h", "btc-30h", "radio-id", "radio-us", "knowledge"):
        assert os.path.exists(os.path.join(out, name + ".json")), name
    assert os.path.getsize(os.path.join(out, "model", "punct.bin")) == 3 * (1 << 18) * 4
    u = json.load(open(os.path.join(out, "utama.json")))
    titles = [s["title"] for s in u["sections"]["nasional"]["hot"] + u["sections"]["nasional"]["list"]]
    assert "Gubernur resmikan jembatan baru di Kalimantan" in titles
    assert "Berita lama sekali tentang pemilu daerah" not in titles
    assert m["stories"]["finansial"] >= 3 and m["hoaxClaims"] >= 1
    k = json.load(open(os.path.join(out, "knowledge.json")))
    assert len(k["docs"]) > 5


def test_js_constants_up_to_date():
    """web/tb3-const.js harus sama dengan hasil `python -m rheus.export_js` (versi HP = versi Python)."""
    from pathlib import Path

    from rheus import export_js

    path = Path(__file__).resolve().parents[2] / "web" / "tb3-const.js"
    assert path.read_text(encoding="utf-8") == export_js.render(), "Jalankan: python -m rheus.export_js ../web/tb3-const.js"


def test_story_headline_prefers_credible_source():
    from rheus import news

    now = NOW
    g = [{"title": "Saudi serang fasilitas rudal Houthi", "link": "https://blog/x", "source": "CentralBatam", "ts": now - 600, "excerpt": "", "coverage": 0, "related": []},
         {"title": "Saudi serang fasilitas rudal Houthi di Yaman", "link": "https://antaranews.com/x", "source": "Antara", "ts": now - 900, "excerpt": "", "coverage": 0, "related": []}]
    s = news._story(g, now, "id", [], {})
    assert s["source"] == "Antara" and s["link"] == "https://antaranews.com/x" and s["credible"]


def test_radio_pick_filters_broken_and_keeps_backup_urls():
    from rheus import radio

    data = [
        {"stationuuid": "a", "name": "Prambors", "url": "http://x/pls.pls", "url_resolved": "https://s/a.mp3", "lastcheckok": 1, "codec": "MP3", "clickcount": 50},
        {"stationuuid": "b", "name": "Mati FM", "url": "http://dead", "url_resolved": "http://dead", "lastcheckok": 0, "codec": "MP3", "clickcount": 99},
        {"stationuuid": "c", "name": "Video TV", "url": "http://v", "url_resolved": "http://v", "lastcheckok": 1, "codec": "H.264", "clickcount": 90},
        {"stationuuid": "d", "name": "HLS Radio", "url": "https://h/live.m3u8", "url_resolved": "https://h/live.m3u8", "lastcheckok": 1, "codec": "AAC", "hls": 1, "clickcount": 10},
        {"stationuuid": "e", "name": "prambors ", "url": "http://dup", "lastcheckok": 1, "codec": "MP3", "clickcount": 1},
    ]
    out = radio.pick(data, 10)
    assert [s["id"] for s in out] == ["a", "d"]
    assert out[0]["urls"] == ["https://s/a.mp3", "http://x/pls.pls"]
    assert out[1]["hls"] is True


def test_teknologi_tags_and_verified(tmp_path):
    import asyncio

    from rheus import learn, news

    async def get_text(url, ttl=300):
        return fake_get(url)

    fetch.get_text = get_text
    hoax = news.HoaxIndex([])
    d = asyncio.run(news.build_teknologi(learn.Brain(), {}, hoax, NOW))
    allst = d["hot"] + d["list"]
    ai = next(s for s in allst if "OpenAI" in s["title"])
    assert "ai" in ai["tags"] and ai["verified"]
    hp = next(s for s in allst if "Samsung" in s["title"])
    assert "gadget" in hp["tags"]
    assert {t["id"] for t in d["tags"]} >= {"ai", "gadget", "siber"}


def test_us_finansial_and_teknologi():
    import asyncio

    from rheus import learn, news

    async def get_text(url, ttl=300):
        return fake_get(url)

    fetch.get_text = get_text
    hoax = news.HoaxIndex([])
    f = asyncio.run(news.build_finansial(learn.Brain(), {}, hoax, NOW, "us"))
    assert f["region"] == "us"
    allf = f["hot"] + f["list"]
    rally = next(s for s in allf if "Nasdaq" in s["title"])
    assert rally["verified"] and "saham" in rally["tags"]          # CNBC + Reuters = 2 media kredibel AS
    fed = next(s for s in allf if "Fed holds" in s["title"])
    assert "perbankan" in fed["tags"] and "makro" in fed["tags"]
    assert {t["id"] for t in f["tags"]} >= {"saham", "valas", "kripto", "perbankan", "emas", "makro"}
    t = asyncio.run(news.build_teknologi(learn.Brain(), {}, hoax, NOW, "us"))
    allt = t["hot"] + t["list"]
    nv = next(s for s in allt if "Nvidia" in s["title"])
    assert nv["verified"] and "ai" in nv["tags"]
    blog = next(s for s in allt if "ransomware" in s["title"])
    assert not blog["credible"] and "siber" in blog["tags"]
    assert all(s["credible"] and not s["clickbait"] for s in t["hot"])  # headline hot hanya media kredibel
