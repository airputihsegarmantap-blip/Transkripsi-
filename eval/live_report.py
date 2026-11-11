"""Cetak contoh hasil RheusInterface dari sumber sungguhan (server harus berjalan di RHEUS_URL)."""

import json
import os
import urllib.parse
import urllib.request

URL = os.environ.get("RHEUS_URL", "http://127.0.0.1:8000")


def get(path):
    with urllib.request.urlopen(URL + path, timeout=120) as r:
        return json.loads(r.read())


def show(title, stories, n=4, extra=lambda s: ""):
    print(f"\n== {title}")
    for s in stories[:n]:
        print(f"  • {s['title'][:90]} [{s['source']}, {s['time']}] {extra(s)}")


u = get("/v1/news/utama")
for sec, d in u["sections"].items():
    print(f"\n[{sec}] {d['stats']}")
    show(f"{sec} — hot", d["hot"], 3, lambda s: s.get("categoryLabel", ""))
    if sec == "internasional":
        from collections import Counter
        print("  kategori:", dict(Counter(s["category"] for s in d["hot"] + d["list"])))
k = get("/v1/news/kripto")
show("Kripto — hot", k["hot"], 3)
for region in ("id", "us"):
    v = get(f"/v1/news/viral?region={region}")
    print(f"\n[viral {region}] {v['stats']}")
    print("  platform:", {p["id"]: p["count"] for p in v["platforms"]})
    print("  kategori:", {c["id"]: c["count"] for c in v["categories"]})
    show(f"viral {region} — hot", v["hot"], 3, lambda s: f"{s['categoryLabel']} {s['platformLabels']}")
for tf in ("24j", "7h", "30h"):
    b = get(f"/v1/btc?tf={tf}")
    m = b["model"]
    print(f"\n[btc {tf}] ${b['price']:,.0f} {m['direction']} ({m['confidence']}) naik {m['probs']['up']:.0%} side {m['probs']['side']:.0%} turun {m['probs']['down']:.0%} | uji balik: {m['skill']} | {b['computeMs']} ms")
for region in ("id", "us"):
    r = get(f"/v1/radio?region={region}")
    print(f"\n[radio {region}] {len(r['stations'])} stasiun, https: {sum(s['https'] for s in r['stations'])} — contoh: {[s['name'] for s in r['stations'][:5]]}")
for q in ("berapa harga bitcoin", "berita viral makanan", "konflik militer"):
    a = get("/v1/ask?q=" + urllib.parse.quote(q))
    print(f"\n[tanya] {q} → {a['answer'][:220]}")
print("\n[pembelajaran]", json.dumps(get("/v1/learn")["brain"], ensure_ascii=False)[:1200])
