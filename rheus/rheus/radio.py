"""Daftar stasiun radio gratis dari Radio Browser (github.com/segler-alex/radiobrowser-api-rust).

Hanya stasiun yang lolos pengecekan terakhir Radio Browser (lastcheckok) yang ditampilkan,
diurutkan berdasarkan popularitas + keandalan. Aplikasi memutar lewat ExoPlayer di HP, jadi
aliran http://, AAC+ dan HLS juga didukung. Setiap stasiun membawa alamat cadangan (`urls`).
"""

from __future__ import annotations

from urllib.parse import urlencode

from . import config, fetch


async def stations(region: str = "id", limit: int = 60, tag: str = "") -> dict:
    cc = config.RADIO_COUNTRIES.get(region, "ID")
    q = {"countrycode": cc, "hidebroken": "true", "order": "clickcount", "reverse": "true", "limit": str(limit * 2)}
    if tag:
        q["tag"] = tag
    last_err = None
    for mirror in config.RADIO_MIRRORS:
        try:
            data = await fetch.get_json(f"{mirror}/json/stations/search?{urlencode(q)}", ttl=6 * 3600)
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    else:
        raise RuntimeError(f"Direktori radio tidak bisa dihubungi: {last_err}")
    return {"region": region, "stations": pick(data, limit)}


PLAYABLE = {"MP3", "AAC", "AAC+", "OGG", "OPUS", "FLAC", "UNKNOWN", ""}


def pick(data: list[dict], limit: int) -> list[dict]:
    """Pilih stasiun yang paling mungkin bisa diputar: lolos cek terakhir, codec didukung, ada alamat."""
    cand, seen = [], set()
    for s in data:
        url = (s.get("url_resolved") or s.get("url") or "").strip()
        name = " ".join((s.get("name") or "").split())
        key = name.lower()
        if not url.startswith(("http://", "https://")) or not name or key in seen:
            continue
        if str(s.get("lastcheckok", 1)) != "1":
            continue
        codec = (s.get("codec") or "").upper()
        if codec not in PLAYABLE:
            continue
        seen.add(key)
        urls = list(dict.fromkeys(u for u in (url, (s.get("url") or "").strip()) if u.startswith(("http://", "https://"))))
        cand.append({
            "id": s.get("stationuuid"), "name": name, "url": url, "urls": urls, "https": url.startswith("https://"),
            "hls": bool(s.get("hls")) or ".m3u8" in url.lower(),
            "favicon": s.get("favicon") or "", "tags": [t for t in (s.get("tags") or "").split(",") if t][:4],
            "codec": codec or "?", "bitrate": s.get("bitrate"), "city": s.get("state") or "", "votes": s.get("votes", 0),
            "_score": (s.get("clickcount") or 0) + 0.5 * (s.get("votes") or 0),
        })
    cand.sort(key=lambda x: -x["_score"])
    for c in cand:
        c.pop("_score")
    return cand[:limit]
