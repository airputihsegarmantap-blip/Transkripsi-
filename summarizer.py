"""Membuat ringkasan Bahasa Indonesia dari transkrip menggunakan Claude API."""

from __future__ import annotations

import os
from collections.abc import Iterator

import anthropic

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")

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


_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()  # membaca ANTHROPIC_API_KEY dari environment
    return _client


def stream_summary(transcript: str, title: str | None = None) -> Iterator[str]:
    """Hasilkan potongan teks ringkasan secara streaming."""
    header = f"Judul video: {title}\n\n" if title else ""
    user_content = (
        f"{header}<transkrip>\n{transcript}\n</transkrip>\n\n"
        "Buatkan ringkasan dari transkrip di atas."
    )

    with _get_client().beta.messages.stream(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        for text in stream.text_stream:
            yield text
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield "\n\n_Maaf, ringkasan untuk video ini tidak dapat dibuat._"
    elif final.stop_reason == "max_tokens":
        yield "\n\n_(Ringkasan terpotong karena terlalu panjang.)_"
