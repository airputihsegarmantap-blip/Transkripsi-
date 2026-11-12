"""Server API Rheus (FastAPI) — opsional. Aplikasi SiLengkap memakai Rheus Cloud (lihat cloud.py).

Jalankan:  uvicorn rheus.app:app --host 0.0.0.0 --port 8000

Endpoint utama (semua JSON):
  GET  /v1/health                     status server
  GET  /v1/news/utama                 Berita Utama (nasional & internasional + kategori)
  GET  /v1/news/finansial             Berita Finansial
  GET  /v1/news/viral?region=id|us    Berita Viral per platform & kategori
  GET  /v1/btc?tf=24j|7h|30h          Analisa & prediksi arah Bitcoin
  GET  /v1/radio?region=id|us         Stasiun radio gratis
  POST /v1/transcript                 {url} → ambil subtitle + TranscriptBot 3
  POST /v1/transcript/process         {segments,...} → TranscriptBot 3 (subtitle dari HP)
  GET  /v1/ask?q=...                  Tanya Rheus
  GET  /v1/learn                      statistik pembelajaran (akurasi model dari waktu ke waktu)
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from . import __version__, btc, config, fetch, learn, news, radio, transcriptbot, youtube
from .knowledge import Knowledge

log = logging.getLogger("rheus")
STATE: dict = {"started": time.time(), "cache": {}, "locks": {}, "refreshes": 0, "last_refresh": None}
BRAIN_RUNTIME = os.path.join(config.DATA_DIR, "brain.pkl")
BRAIN_BUNDLED = os.path.join(config.MODEL_DIR, "brain.pkl")


def brain() -> learn.Brain:
    return STATE["brain"]


def kb() -> Knowledge:
    return STATE["kb"]


async def cached(key: str, ttl: float, fn, force: bool = False):
    """Cache per kunci + single-flight: permintaan bersamaan hanya memicu satu kali komputasi."""
    hit = STATE["cache"].get(key)
    if hit and not force and time.time() - hit[0] < ttl:
        return hit[1]
    lock = STATE["locks"].setdefault(key, asyncio.Lock())
    async with lock:
        hit = STATE["cache"].get(key)
        if hit and not force and time.time() - hit[0] < ttl:
            return hit[1]
        try:
            val = await fn()
        except Exception as exc:  # noqa: BLE001
            if hit:
                return {**hit[1], "stale": True}
            raise HTTPException(502, f"Sumber data gagal: {exc}") from exc
        STATE["cache"][key] = (time.time(), val)
        return val


async def _hoax():
    hit = STATE.get("hoax")
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    idx = await news.load_hoaxes(STATE["memory"], time.time())
    STATE["hoax"] = (time.time(), idx)
    return idx


async def _utama():
    d = await news.build_utama(brain(), STATE["memory"], await _hoax())
    for sec in d["sections"].values():
        kb().add_stories(sec["hot"] + sec["list"], "berita")
    return d


async def _finansial():
    d = await news.build_finansial(brain(), STATE["memory"], await _hoax())
    kb().add_stories(d["hot"] + d["list"], "finansial")
    return d


async def _viral(region):
    d = await news.build_viral(brain(), STATE["memory"], await _hoax(), region)
    kb().add_stories(d["hot"] + d["list"], "viral")
    return d


async def _btc(tf):
    d = await btc.analyze(tf)
    kb().btc = d
    return d


async def refresher():
    """Penyegaran latar belakang: data selalu siap saat aplikasi membuka menu."""
    await asyncio.sleep(2)
    while True:
        t0 = time.time()
        for key, fn, ttl in (("utama", _utama, 0), ("finansial", _finansial, 0), ("viral:id", lambda: _viral("id"), 0),
                             ("viral:us", lambda: _viral("us"), 0), ("btc:24j", lambda: _btc("24j"), 0)):
            with contextlib.suppress(Exception):
                await cached(key, ttl, fn, force=True)
        with contextlib.suppress(Exception):
            await asyncio.to_thread(learn.save, brain(), BRAIN_RUNTIME)
        STATE["refreshes"] += 1
        STATE["last_refresh"] = {"at": time.time(), "seconds": round(time.time() - t0, 2)}
        await asyncio.sleep(config.REFRESH_SECONDS)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    STATE["brain"] = learn.load(BRAIN_RUNTIME, BRAIN_BUNDLED)
    STATE["kb"] = Knowledge()
    STATE["memory"] = {}
    task = None
    if os.environ.get("RHEUS_NO_REFRESH") != "1":
        task = asyncio.create_task(refresher())
    yield
    if task:
        task.cancel()
    with contextlib.suppress(Exception):
        learn.save(brain(), BRAIN_RUNTIME)
    await fetch.close()


app = FastAPI(title="RheusInterface", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.get("/")
def root():
    return {"name": "RheusInterface", "version": __version__, "docs": "/docs", "health": "/v1/health"}


@app.get("/v1/health")
def health():
    return {"status": "ok", "version": __version__, "transcriptbot": transcriptbot.VERSION,
            "uptime": round(time.time() - STATE["started"]), "lastRefresh": STATE["last_refresh"]}


@app.get("/v1/news/utama")
async def news_utama(refresh: bool = False):
    return await cached("utama", 600, _utama, force=refresh)


@app.get("/v1/news/finansial")
async def news_finansial(refresh: bool = False):
    return await cached("finansial", 600, _finansial, force=refresh)


@app.get("/v1/news/viral")
async def news_viral(region: str = Query("id", pattern="^(id|us)$"), refresh: bool = False):
    return await cached(f"viral:{region}", 600, lambda: _viral(region), force=refresh)


@app.get("/v1/btc")
async def bitcoin(tf: str = Query("24j", pattern="^(24j|7h|30h)$")):
    return await cached(f"btc:{tf}", 120, lambda: _btc(tf))


@app.get("/v1/radio")
async def radio_list(region: str = Query("id", pattern="^(id|us)$"), tag: str = Query("", max_length=40)):
    return await cached(f"radio:{region}:{tag}", 6 * 3600, lambda: radio.stations(region, 60, tag))


class Segment(BaseModel):
    start: float = 0
    duration: float = 0
    text: str = Field("", max_length=2000)


class ProcessReq(BaseModel):
    video_id: str = Field("", max_length=20)
    title: str | None = Field(None, max_length=300)
    language: str = Field("id", max_length=10)
    source: str = Field("", max_length=20)
    segments: list[Segment] = Field(..., max_length=20000)


class TranscriptReq(BaseModel):
    url: str = Field(..., max_length=300)


def _process(video_id, title, language, source, segs: list[dict]) -> dict:
    t0 = time.perf_counter()
    result = transcriptbot.process(segs, brain(), title or "")
    last = segs[-1] if segs else {"start": 0, "duration": 0}
    s = result["summary"]
    kb().add(title or video_id, s.get("short", ""), "Ringkasan video", f"https://www.youtube.com/watch?v={video_id}", time.time(), "video")
    return {"video_id": video_id, "title": title, "language": language, "source": source,
            "duration": float(last.get("start", 0)) + float(last.get("duration", 0)), "segments": segs,
            "transcriptbot": result, "processMs": round((time.perf_counter() - t0) * 1000, 1)}


@app.post("/v1/transcript/process")
async def transcript_process(req: ProcessReq):
    segs = [s.model_dump() for s in req.segments]
    if not segs:
        raise HTTPException(400, "Transkrip kosong.")
    return await asyncio.to_thread(_process, req.video_id, req.title, req.language, req.source, segs)


@app.post("/v1/transcript")
async def transcript(req: TranscriptReq):
    try:
        r = await asyncio.to_thread(youtube.get_transcript, req.url)
    except youtube.TranscriptError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Gagal mengambil subtitle: {exc}") from exc
    d = r.to_dict()
    return await asyncio.to_thread(_process, d["video_id"], d["title"], d["language"], d["source"], d["segments"])


@app.get("/v1/ask")
async def ask(q: str = Query("", max_length=300)):
    if kb().btc is None and ("btc:24j" not in STATE["cache"]):
        with contextlib.suppress(Exception):
            await cached("btc:24j", 120, lambda: _btc("24j"))
    return kb().ask(q)


@app.get("/v1/learn")
def learning():
    return {"brain": brain().stats(), "fetch": fetch.stats, "knowledge": len(kb().docs), "refreshes": STATE["refreshes"]}
