"""Mesin peringkas. Tersedia tiga pilihan:

- ``lokal``  : peringkas buatan sendiri (Python murni), offline, tanpa API key. Selalu tersedia.
- ``ollama`` : model AI kecil open-source (mis. Qwen2.5 1.5B) yang berjalan offline di
               perangkat sendiri lewat Ollama. Gratis, tanpa API key.
- ``claude`` : Claude API (opsional, butuh ANTHROPIC_API_KEY milik sendiri).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Iterator

import local_summarizer

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")

# Model kecil punya konteks terbatas; transkrip panjang dipadatkan dulu oleh
# peringkas lokal (pilih kalimat terpenting) sebelum dikirim ke model.
OLLAMA_MAX_WORDS = int(os.environ.get("OLLAMA_MAX_WORDS", "2500"))

SYSTEM_PROMPT = """Kamu adalah asisten yang meringkas transkrip video YouTube berbahasa Indonesia.

Transkrip berasal dari subtitle otomatis atau speech-to-text, jadi bisa berisi salah ketik,
kata yang salah dengar, dan tanpa tanda baca. Pahami maksud pembicara dan jangan ikut
menyalin kesalahan tersebut.

Tulis ringkasan dalam Bahasa Indonesia yang baik dan mudah dibaca, dalam format Markdown
dengan bagian berikut:

## Ringkasan Singkat
2–4 kalimat yang menjelaskan inti video.

## Poin-Poin Utama
Daftar poin penting secara berurutan sesuai alur video.

## Kesimpulan
Pesan utama atau kesimpulan dari pembicara.

Hanya gunakan informasi yang ada di transkrip. Jangan menambahkan fakta dari luar."""

ENGINE_LABELS = {
    "lokal": "Peringkas lokal (offline)",
    "ollama": f"AI lokal – {OLLAMA_MODEL}",
    "claude": "Claude API",
}


# ---------------------------------------------------------------- deteksi mesin

def _ollama_models() -> list[str]:
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=1.5) as resp:
            return [m["name"] for m in json.load(resp).get("models", [])]
    except Exception:  # noqa: BLE001
        return []


def _claude_ready() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def available_engines() -> list[str]:
    engines = ["lokal"]
    models = _ollama_models()
    if any(m == OLLAMA_MODEL or m.split(":")[0] == OLLAMA_MODEL.split(":")[0] for m in models):
        engines.append("ollama")
    if _claude_ready():
        engines.append("claude")
    return engines


def default_engine(engines: list[str]) -> str:
    preferred = os.environ.get("SUMMARY_ENGINE")
    if preferred in engines:
        return preferred
    # Utamakan yang gratis: AI lokal kalau ada, kalau tidak peringkas lokal.
    return "ollama" if "ollama" in engines else "lokal"


# ---------------------------------------------------------------- mesin-mesin

def _user_prompt(transcript: str, title: str | None) -> str:
    header = f"Judul video: {title}\n\n" if title else ""
    return (
        f"{header}<transkrip>\n{transcript}\n</transkrip>\n\n"
        "Buatkan ringkasan dari transkrip di atas."
    )


def _condense(segments: list[dict], transcript: str) -> tuple[str, bool]:
    """Padatkan transkrip panjang untuk model kecil. Kembalikan (teks, dipadatkan?)."""
    if len(transcript.split()) <= OLLAMA_MAX_WORDS:
        return transcript, False
    picked = local_summarizer.top_sentences(segments, OLLAMA_MAX_WORDS)
    return " ".join(picked), True


def _stream_ollama(transcript: str, segments: list[dict], title: str | None) -> Iterator[str]:
    text, condensed = _condense(segments, transcript)
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "stream": True,
        "options": {"num_ctx": 8192, "temperature": 0.3},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(text, title)},
        ],
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        for line in resp:
            if not line.strip():
                continue
            chunk = json.loads(line)
            piece = chunk.get("message", {}).get("content", "")
            if piece:
                yield piece
            if chunk.get("done"):
                break
    if condensed:
        yield ("\n\n_Transkrip panjang dipadatkan dulu ke kalimat-kalimat terpenting "
               "sebelum diringkas oleh model lokal._")


def _stream_claude(transcript: str, title: str | None) -> Iterator[str]:
    import anthropic

    client = anthropic.Anthropic()
    with client.beta.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": _user_prompt(transcript, title)}],
    ) as stream:
        for text in stream.text_stream:
            yield text
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield "\n\n_Maaf, ringkasan untuk video ini tidak dapat dibuat._"
    elif final.stop_reason == "max_tokens":
        yield "\n\n_(Ringkasan terpotong karena terlalu panjang.)_"


def stream_summary(
    transcript: str,
    segments: list[dict] | None = None,
    title: str | None = None,
    engine: str | None = None,
) -> Iterator[str]:
    """Hasilkan potongan teks ringkasan (Markdown) secara streaming."""
    segments = segments or [{"start": 0, "text": transcript}]
    engines = available_engines()
    if engine not in engines:
        engine = default_engine(engines)

    if engine == "claude":
        yield from _stream_claude(transcript, title)
        return
    if engine == "ollama":
        try:
            yield from _stream_ollama(transcript, segments, title)
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            yield f"_AI lokal tidak merespons ({exc}); memakai peringkas lokal._\n\n"
    yield local_summarizer.summarize(segments, title)
