"""Ambil subtitle video YouTube untuk versi web (APK mengambil subtitle langsung dari HP).

Prioritas: subtitle Indonesia manual → Indonesia otomatis → bahasa lain diterjemahkan ke Indonesia.
YouTube sering memblokir IP server cloud; atur YT_PROXY_URL / WEBSHARE_PROXY_* bila perlu.
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)
from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig

ID_LANGS = ["id", "in"]  # "in" adalah kode lama untuk Bahasa Indonesia

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


class TranscriptError(Exception):
    """Kesalahan yang pesannya aman ditampilkan ke pengguna."""


@dataclass
class Segment:
    start: float
    duration: float
    text: str


@dataclass
class TranscriptResult:
    video_id: str
    language: str
    source: str  # "manual", "otomatis", "terjemahan", atau "whisper"
    title: str | None = None
    segments: list[Segment] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments if s.text)

    def to_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "language": self.language,
            "source": self.source,
            "title": self.title,
            "text": self.text,
            "segments": [
                {"start": s.start, "duration": s.duration, "text": s.text}
                for s in self.segments
            ],
        }


def extract_video_id(url_or_id: str) -> str:
    """Terima URL YouTube dalam berbagai bentuk atau ID 11 karakter."""
    s = (url_or_id or "").strip()
    if _ID_RE.match(s):
        return s
    patterns = [
        r"(?:v=|vi=)([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"/(?:embed|shorts|live|v)/([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            return m.group(1)
    raise TranscriptError("Link YouTube tidak valid. Contoh: https://www.youtube.com/watch?v=XXXXXXXXXXX")


def _clean(text: str) -> str:
    text = re.sub(r"\[(?:musik|music|tepuk tangan|applause)\]", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def _proxy_config():
    """Proxy opsional — berguna di hosting cloud karena YouTube sering memblokir IP server.

    - YT_PROXY_URL="http://user:pass@host:port"  (proxy HTTP apa pun)
    - WEBSHARE_PROXY_USERNAME / WEBSHARE_PROXY_PASSWORD  (proxy residensial Webshare)
    """
    ws_user = os.environ.get("WEBSHARE_PROXY_USERNAME")
    ws_pass = os.environ.get("WEBSHARE_PROXY_PASSWORD")
    if ws_user and ws_pass:
        return WebshareProxyConfig(proxy_username=ws_user, proxy_password=ws_pass)
    url = os.environ.get("YT_PROXY_URL")
    if url:
        return GenericProxyConfig(http_url=url, https_url=url)
    return None


def _from_youtube(video_id: str) -> TranscriptResult:
    api = YouTubeTranscriptApi(proxy_config=_proxy_config())
    transcripts = api.list(video_id)

    chosen = None
    source = ""
    try:
        chosen = transcripts.find_manually_created_transcript(ID_LANGS)
        source = "manual"
    except NoTranscriptFound:
        try:
            chosen = transcripts.find_generated_transcript(ID_LANGS)
            source = "otomatis"
        except NoTranscriptFound:
            pass

    if chosen is None:
        # Tidak ada subtitle Indonesia: pakai subtitle apa pun, terjemahkan ke Indonesia.
        available = list(transcripts)
        if not available:
            raise NoTranscriptFound(video_id, ID_LANGS, transcripts)
        base = next((t for t in available if not t.is_generated), available[0])
        if base.is_translatable:
            chosen = base.translate("id")
            source = "terjemahan"
        else:
            chosen = base
            source = "otomatis" if base.is_generated else "manual"

    fetched = chosen.fetch()
    segments = [
        Segment(start=s.start, duration=s.duration, text=_clean(s.text))
        for s in fetched
    ]
    return TranscriptResult(
        video_id=video_id,
        language=chosen.language_code,
        source=source,
        segments=[s for s in segments if s.text],
    )



def fetch_title(video_id: str) -> str | None:
    """Ambil judul video lewat endpoint oEmbed publik YouTube (tanpa API key)."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
        f"https://www.youtube.com/watch?v={video_id}", safe=""
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.load(resp).get("title")
    except Exception:  # noqa: BLE001 - judul hanya pelengkap
        return None


def get_transcript(url_or_id: str) -> TranscriptResult:
    video_id = extract_video_id(url_or_id)
    try:
        result = _from_youtube(video_id)
    except (TranscriptsDisabled, NoTranscriptFound) as exc:
        raise TranscriptError("Video ini tidak punya subtitle, jadi belum bisa ditranskripsi.") from exc
    except (RequestBlocked, IpBlocked) as exc:
        raise TranscriptError(
            "YouTube memblokir permintaan dari server ini (umum terjadi di hosting cloud). "
            "Atur proxy lewat YT_PROXY_URL / WEBSHARE_PROXY_* atau pakai aplikasi Android "
            "yang mengambil subtitle langsung dari HP."
        ) from exc
    except CouldNotRetrieveTranscript as exc:
        raise TranscriptError(
            "Gagal mengambil transkrip dari YouTube. Pastikan video publik dan coba lagi. "
            f"({type(exc).__name__})"
        ) from exc

    if not result.text:
        raise TranscriptError("Transkrip kosong — video mungkin tidak berisi ucapan.")
    result.title = fetch_title(video_id)
    return result
