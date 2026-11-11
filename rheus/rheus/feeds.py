"""Parser RSS/Atom cepat berbasis lxml + penyaring spam."""

from __future__ import annotations

import re
import time
from email.utils import parsedate_to_datetime
from datetime import datetime

from lxml import etree
from lxml import html as lhtml

from .text import content_words, jaccard, strip_tags

_PARSER = etree.XMLParser(recover=True, resolve_entities=False, no_network=True, huge_tree=False)
_SPAM = re.compile(r"slot|gacor|togel|judi|casino|maxwin|bandar|zeus|olympus|rtp live", re.I)


def _ts(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return time.time()
    try:
        return parsedate_to_datetime(s).timestamp()
    except Exception:  # noqa: BLE001
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:  # noqa: BLE001
        return time.time()


def looks_like_spam(title: str, source: str) -> bool:
    if not re.search(r"[A-Z]", title) and len(title.split()) <= 8:
        return True
    if _SPAM.search(title):
        return True
    if re.match(r"^website (kabupaten|desa|kota)", source or "", re.I):
        return True
    return False


def _local(tag) -> str:
    return tag.split("}", 1)[-1] if isinstance(tag, str) else ""


def parse_feed(xml: str, fallback_source: str = "") -> list[dict]:
    try:
        root = etree.fromstring(xml.encode("utf-8", "replace"), _PARSER)
    except etree.XMLSyntaxError:
        return []
    if root is None:
        return []
    items = []
    for node in root.iter():
        name = _local(node.tag)
        if name not in ("item", "entry"):
            continue
        f = {}
        for ch in node:
            n = _local(ch.tag)
            if n == "link":
                f["link"] = (ch.text or "").strip() or ch.get("href", "")
            elif n == "source":
                f["source"] = strip_tags(ch.text or "")
            elif n in ("title", "pubDate", "updated", "published", "description", "summary", "content", "encoded"):
                f.setdefault(n, ch.text or "")
        title = strip_tags(f.get("title", ""))
        source = f.get("source") or ""
        dash = title.rfind(" - ")
        if dash > 20 and (not source or title.endswith(source)):
            source = source or title[dash + 3:]
            title = title[:dash]
        source = source or fallback_source
        raw = f.get("description") or f.get("summary") or f.get("content") or f.get("encoded") or ""
        related, coverage = [], 0
        if "<li" in raw or "&lt;li" in raw:
            # Google News: daftar liputan terkait.
            frag = lhtml.fragment_fromstring(strip_html_entities(raw), create_parent="div")
            for li in frag.iter("li"):
                coverage += 1
                a = li.find(".//a")
                font = li.find(".//font")
                rt = (a.text_content() if a is not None else "").strip()
                if rt and jaccard(content_words(rt), content_words(title)) < 0.8:
                    related.append({"title": rt, "link": a.get("href", "") if a is not None else "",
                                    "source": font.text_content().strip() if font is not None else ""})
            excerpt = ""
        else:
            excerpt = strip_tags(raw)
            if not excerpt or jaccard(content_words(excerpt), content_words(title)) > 0.6 or excerpt.lower().startswith("submitted by"):
                excerpt = ""
            if len(excerpt) > 280:
                excerpt = excerpt[:277].rsplit(" ", 1)[0] + "…"
        if not title or looks_like_spam(title, source):
            continue
        items.append({
            "title": title, "link": f.get("link", ""), "source": source,
            "ts": _ts(f.get("pubDate") or f.get("updated") or f.get("published") or ""),
            "excerpt": excerpt, "coverage": coverage, "related": related,
        })
    return items


def strip_html_entities(s: str) -> str:
    import html

    s = html.unescape(s)
    return s if s.strip().startswith("<") else f"<div>{s}</div>"
