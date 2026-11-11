"""Benchmark RheusInterface 2 (server). Server harus sudah berjalan di RHEUS_URL.

Mengukur waktu respons API sebagaimana dirasakan aplikasi:
  dingin  = permintaan pertama (server mengambil & mengolah data dari internet)
  hangat  = permintaan berikutnya (data sudah disiapkan & di-cache server)
"""

import json
import os
import sys
import time
import urllib.request

URL = os.environ.get("RHEUS_URL", "http://127.0.0.1:8000")


def get(path):
    t0 = time.perf_counter()
    with urllib.request.urlopen(URL + path, timeout=120) as r:
        body = json.loads(r.read())
    return (time.perf_counter() - t0) * 1000, body


out = {}
for name, path in [("news_utama", "/v1/news/utama"), ("news_viral_id", "/v1/news/viral?region=id"),
                   ("news_viral_us", "/v1/news/viral?region=us"), ("btc_24j", "/v1/btc?tf=24j"), ("radio_id", "/v1/radio?region=id")]:
    try:
        cold, body = get(path)
        warm = min(get(path)[0] for _ in range(5))
        out[name] = {"cold_ms": round(cold), "warm_ms": round(warm, 1)}
        if name == "btc_24j":
            out["btc_compute_only"] = body.get("computeMs")
    except Exception as exc:  # noqa: BLE001
        out[name] = f"gagal: {exc}"
print(json.dumps(out, indent=1))
if len(sys.argv) > 1:
    v1 = json.loads(open(sys.argv[1]).read())
    print("\nPerbandingan (v1 = olah di HP setiap kali menu dibuka; v2 = server, data sudah disiapkan):")
    for a, b in [("news_crypto", "news_utama"), ("news_world", "news_utama"), ("news_viral", "news_viral_id"), ("btc_24j", "btc_24j")]:
        if isinstance(v1.get(a), (int, float)) and isinstance(out.get(b), dict):
            print(f"  {a:12s} v1 {v1[a]:>6} ms  →  v2 hangat {out[b]['warm_ms']:>7} ms  ({v1[a] / max(out[b]['warm_ms'], 0.1):.0f}x lebih cepat)  | v2 dingin {out[b]['cold_ms']} ms")
    if isinstance(v1.get("btc_compute_only"), (int, float)) and out.get("btc_compute_only"):
        print(f"  komputasi Bitcoin (kalibrasi + uji balik): v1 JS {v1['btc_compute_only']} ms → v2 NumPy {out['btc_compute_only']} ms "
              f"({v1['btc_compute_only'] / max(out['btc_compute_only'], 0.1):.1f}x)")
