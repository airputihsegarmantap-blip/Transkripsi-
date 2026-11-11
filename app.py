"""SiLengkap — server web.

Tugas server:
  - menyajikan antarmuka SiLengkap (folder web/ dan shared/),
  - /api/transcribe : mengambil transkrip YouTube,
  - /api/fetch      : proxy baca-saja untuk RheusInterface (browser tidak boleh mengambil
                      RSS/API lain langsung karena aturan CORS). Hanya host di ALLOWED_HOSTS.

Pengolahan data (berita, analisa Bitcoin, ringkasan) dikerjakan RheusInterface dan
TranscriptBot di browser pengguna, jadi server gratis tetap ringan.
"""

from __future__ import annotations

import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from flask import Flask, Response, abort, jsonify, request, send_from_directory

from transcriber import TranscriptError, get_transcript

app = Flask(__name__, static_folder=None)
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
SHARED_DIR = os.path.join(ROOT, "shared")

# Sumber data yang dipakai RheusInterface (lihat shared/rheus.js).
ALLOWED_HOSTS = {
    "news.google.com",
    "www.cnbcindonesia.com",
    "feeds.bbci.co.uk",
    "www.reddit.com",
    "api.kraken.com",
    "api.coingecko.com",
    "api.alternative.me",
    "www.okx.com",
}
MAX_BYTES = 3_000_000
CACHE_TTL = 120  # detik
_cache: dict[str, tuple[float, int, str, bytes]] = {}
_lock = threading.Lock()


class _AllowlistRedirect(urllib.request.HTTPRedirectHandler):
    """Ikuti redirect hanya ke host yang diizinkan (mencegah proxy disalahgunakan)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlparse(newurl)
        if target.scheme != "https" or target.hostname not in ALLOWED_HOSTS:
            raise urllib.error.HTTPError(newurl, 403, "Redirect ke host yang tidak diizinkan", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_AllowlistRedirect)
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"


@app.get("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/healthz")
def healthz():
    return "ok"


@app.get("/<path:filename>")
def files(filename: str):
    for folder in (WEB_DIR, SHARED_DIR):
        if os.path.isfile(os.path.join(folder, filename)):
            resp = send_from_directory(folder, filename)
            if filename in ("sw.js", "index.html"):
                resp.headers["Cache-Control"] = "no-cache"
            if filename.endswith(".webmanifest"):
                resp.mimetype = "application/manifest+json"
            return resp
    abort(404)


@app.get("/api/fetch")
def proxy_fetch():
    url = request.args.get("url", "")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        return Response("Sumber tidak diizinkan.", status=403, mimetype="text/plain")

    now = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and now - hit[0] < CACHE_TTL:
        _, status, ctype, body = hit
        return Response(body, status=status, content_type=ctype)

    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"})
    try:
        with _opener.open(req, timeout=15) as resp:
            body = resp.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                return Response("Respons terlalu besar.", status=502, mimetype="text/plain")
            ctype = resp.headers.get("Content-Type", "text/plain; charset=utf-8")
            status = resp.status
    except urllib.error.HTTPError as exc:
        return Response(f"Sumber membalas HTTP {exc.code}.", status=502, mimetype="text/plain")
    except Exception as exc:  # noqa: BLE001
        return Response(f"Gagal menghubungi sumber: {exc}", status=502, mimetype="text/plain")

    with _lock:
        if len(_cache) > 200:
            _cache.clear()
        _cache[url] = (now, status, ctype, body)
    return Response(body, status=status, content_type=ctype)


@app.post("/api/transcribe")
def transcribe():
    data = request.get_json(silent=True) or {}
    try:
        result = get_transcript(data.get("url", ""))
    except TranscriptError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:  # noqa: BLE001
        app.logger.exception("Transkripsi gagal")
        return jsonify(error=f"Terjadi kesalahan saat transkripsi: {exc}"), 500
    return jsonify(result.to_dict())


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"\n  SiLengkap berjalan di  http://localhost:{port}\n")
    app.run(host=host, port=port, debug=os.environ.get("FLASK_DEBUG") == "1", threaded=True)
