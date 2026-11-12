"""Utilitas teks bersama (Bahasa Indonesia & Inggris)."""

from __future__ import annotations

import html
import re

_WORD = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_TAG = re.compile(r"<[^>]*>")
_WS = re.compile(r"\s+")

STOP_ID = set("""
ada adalah adanya agak agar akan akhirnya aku amat anda antara apa apakah atau ataupun aja bagai bagaimana
bagi bahkan bahwa baik banyak beberapa begini begitu belum benar berapa berbagai bersama bisa boleh bukan
cuma cukup dalam dan dapat dari daripada dekat demi demikian dengan depan di dia diri dirinya dong dulu
enggak ga gak gimana gitu gini guys halo hai hal hanya harus hingga ia ialah ini itu iya ya jadi jika jangan
juga justru kah kalau kali kalian kami kamu kan karena kata ke kemudian kenapa kepada ketika kini kita kok
lagi lah lain lalu lama langsung lebih loh lho maka mana masih mau memang mereka meski mungkin nah namun
nanti nya oh oke ok pada padahal para pasti pernah pula pun punya saja sambil sampai sangat saat sama sebab
sebagai sebelum sebenarnya sebuah secara sedang sedikit segala sehingga sejak sekali sekarang sekitar selain
selalu seluruh semua sementara semuanya sendiri seperti sering serta sesuatu setelah setiap siapa sih sini
situ supaya tadi tak tapi tanpa tentang tentu terhadap terus tetapi tidak toh udah sudah untuk walau yaitu
yakni yang uh eh hmm em ehm nih tuh deh dah kayak kaya banget bener teman temen saya usai soal kini terbaru
berita hari ini jadi viral
""".split())

STOP_EN = set("""
a an and are as at be been but by for from has have he her his how i in into is it its of on or our she
that the their them they this to was we were what when where which who why will with you your after over
new says said just more than about up out not no can could would should may might do does did so if
viral video goes go trend trending
""".split())

STOP = STOP_ID | STOP_EN


def words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def content_words(text: str) -> list[str]:
    return [w for w in words(text) if len(w) > 2 and w not in STOP]


def strip_tags(s: str) -> str:
    s = html.unescape(html.unescape(s or ""))
    return _WS.sub(" ", _TAG.sub(" ", s)).strip()


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def ago(ts: float, now: float) -> str:
    m = max(0, round((now - ts) / 60))
    if m < 1:
        return "baru saja"
    if m < 60:
        return f"{m} mnt"
    h = round(m / 60)
    if h < 24:
        return f"{h} jam"
    return f"{round(h / 24)} hari"
