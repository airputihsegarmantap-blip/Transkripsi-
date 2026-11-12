"""Daftar stasiun radio gratis dari Radio Browser (github.com/segler-alex/radiobrowser-api-rust).

Hanya stasiun yang lolos pengecekan Radio Browser (lastcheckok) yang ditampilkan,
diurutkan berdasarkan popularitas. Aliran https diutamakan agar bisa diputar di web.
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
    out, seen = [], set()
    for s in data:
        url = s.get("url_resolved") or s.get("url") or ""
        name = (s.get("name") or "").strip()
        if not url or not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append({
            "id": s.get("stationuuid"), "name": name, "url": url, "https": url.startswith("https://"),
            "favicon": s.get("favicon") or "", "tags": [t for t in (s.get("tags") or "").split(",") if t][:4],
            "codec": s.get("codec"), "bitrate": s.get("bitrate"), "city": s.get("state") or "", "votes": s.get("votes", 0),
        })
        if len(out) >= limit:
            break
    return {"region": region, "stations": out}
