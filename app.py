"""TranskripKu — transkripsi & ringkasan otomatis video YouTube berbahasa Indonesia."""

from __future__ import annotations

import os

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_from_directory,
    stream_with_context,
)

from summarizer import ENGINE_LABELS, available_engines, default_engine, stream_summary
from transcriber import TranscriptError, get_transcript

app = Flask(__name__)
STATIC_DIR = os.path.join(app.root_path, "static")


@app.get("/")
def index():
    return render_template("index.html")


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


@app.get("/api/engines")
def engines():
    avail = available_engines()
    return jsonify(
        engines=[{"id": e, "label": ENGINE_LABELS[e]} for e in avail],
        default=default_engine(avail),
    )


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


@app.post("/api/summarize")
def summarize():
    data = request.get_json(silent=True) or {}
    transcript = (data.get("transcript") or "").strip()
    if not transcript:
        return jsonify(error="Transkrip kosong."), 400

    def generate():
        try:
            yield from stream_summary(
                transcript,
                segments=data.get("segments"),
                title=data.get("title"),
                engine=data.get("engine"),
            )
        except Exception as exc:  # noqa: BLE001
            app.logger.exception("Ringkasan gagal")
            yield f"\n\n**Error:** {type(exc).__name__}: {exc}"

    return Response(
        stream_with_context(generate()),
        mimetype="text/plain; charset=utf-8",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"\n  TranskripKu berjalan di  http://localhost:{port}\n")
    app.run(host=host, port=port, debug=os.environ.get("FLASK_DEBUG") == "1", threaded=True)
