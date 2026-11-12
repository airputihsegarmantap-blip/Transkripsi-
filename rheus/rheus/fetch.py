"""Pengambil data async: banyak sumber diambil paralel, hasil di-cache, permintaan ganda digabung."""

from __future__ import annotations

import asyncio
import time

import httpx

from .config import USER_AGENT

_client: httpx.AsyncClient | None = None
_cache: dict[str, tuple[float, str]] = {}
_inflight: dict[str, asyncio.Future] = {}
stats = {"requests": 0, "cache_hits": 0, "errors": 0}


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=8.0),
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"},
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
            http2=False,
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def get_text(url: str, ttl: float = 300) -> str:
    """GET dengan cache TTL. Beberapa pemanggil yang meminta URL sama sekaligus berbagi satu request."""
    now = time.time()
    hit = _cache.get(url)
    if hit and now - hit[0] < ttl:
        stats["cache_hits"] += 1
        return hit[1]
    if url in _inflight:
        return await _inflight[url]
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _inflight[url] = fut
    try:
        stats["requests"] += 1
        r = await client().get(url)
        r.raise_for_status()
        text = r.text
        _cache[url] = (time.time(), text)
        if len(_cache) > 500:
            for k, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:100]:
                _cache.pop(k, None)
        fut.set_result(text)
        return text
    except Exception as exc:  # noqa: BLE001
        stats["errors"] += 1
        if hit:  # sumber gagal: pakai data lama
            fut.set_result(hit[1])
            return hit[1]
        fut.set_exception(exc)
        fut.exception()  # tandai sudah diambil agar tidak ada peringatan
        raise
    finally:
        _inflight.pop(url, None)


async def get_json(url: str, ttl: float = 300):
    import orjson

    return orjson.loads(await get_text(url, ttl))
