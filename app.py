"""TranskripKu — transkripsi & ringkasan otomatis video YouTube berbahasa Indonesia.

Server hanya bertugas mengambil transkrip dari YouTube. Peringkasan dikerjakan
TranscriptBot (shared/transcriptbot.js) langsung di browser pengguna.
"""

from __future__ import annotations

import os

from flask import Flask, jsonify, render_template, request, send_from_directory

from transcriber import TranscriptError, get_transcript

app = Flask(__name__)
STATIC_DIR = os.path.join(app.root_path, "static")
SHARED_DIR = os.path.join(app.root_path, "shared")


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/healthz")
def healthz():
    return "ok"


@app.get("/shared/<path:filename>")
def shared(filename):
    return send_from_directory(SHARED_DIR, filename)


# Service worker harus disajikan dari root agar bisa mengontrol seluruh halaman (PWA).
@app.get("/sw.js")
def service_worker():
    resp = send_from_directory(STATIC_DIR, "sw.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(STATIC_DIR, "manifest.webmanifest",
                               mimetype="application/manifest+json")


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
    print(f"\n  TranskripKu berjalan di  http://localhost:{port}\n")
    app.run(host=host, port=port, debug=os.environ.get("FLASK_DEBUG") == "1", threaded=True)
