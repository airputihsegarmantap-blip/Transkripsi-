"""TranskripKu — transkripsi & ringkasan otomatis video YouTube berbahasa Indonesia."""

from __future__ import annotations

import os

import anthropic
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

from summarizer import stream_summary
from transcriber import TranscriptError, get_transcript

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


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
            yield from stream_summary(transcript, data.get("title"))
        except anthropic.AuthenticationError:
            yield "\n\n**Error:** ANTHROPIC_API_KEY belum diatur atau tidak valid."
        except anthropic.RateLimitError:
            yield "\n\n**Error:** Batas penggunaan API tercapai. Coba lagi sebentar lagi."
        except anthropic.APIStatusError as exc:
            yield f"\n\n**Error API ({exc.status_code}):** {exc.message}"
        except anthropic.APIConnectionError:
            yield "\n\n**Error:** Tidak dapat terhubung ke Claude API."
        except TypeError as exc:
            # anthropic.Anthropic() tanpa kredensial apa pun
            yield f"\n\n**Error:** {exc}"

    return Response(
        stream_with_context(generate()),
        mimetype="text/plain; charset=utf-8",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
