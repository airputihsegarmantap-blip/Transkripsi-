"""Analisa & prediksi arah Bitcoin — versi NumPy (vektor) dari model RheusInterface.

Sinyal teknikal (MA-20/50/200, RSI-14, momentum, volatilitas) dihitung untuk SEMUA hari sekaligus
dengan operasi vektor. Probabilitas = frekuensi historis untuk sinyal serupa (kalibrasi
walk-forward), dan model menguji dirinya sendiri (uji balik) setiap kali analisa dibuat.
"""

from __future__ import annotations

import asyncio
import time

import numpy as np

from . import fetch

TFS = {
    "24j": {"label": "24 jam", "h": 1, "interval": 60, "bars": 24},
    "7h": {"label": "7 hari", "h": 7, "interval": 240, "bars": 42},
    "30h": {"label": "30 hari", "h": 30, "interval": 1440, "bars": 30},
}
START = 200


def _sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) >= n:
        c = np.cumsum(np.insert(x, 0, 0.0))
        out[n - 1:] = (c[n:] - c[:-n]) / n
    return out


def _rsi(x: np.ndarray, n: int = 14) -> np.ndarray:
    d = np.diff(x, prepend=x[0])
    g, l = np.clip(d, 0, None), np.clip(-d, 0, None)
    sg, sl = _sma(g, n), _sma(l, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = sg / sl
        r = 100 - 100 / (1 + rs)
    r[sl == 0] = 100
    return r


def _rolling_std(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) > n:
        w = np.lib.stride_tricks.sliding_window_view(x, n)
        out[n - 1:] = w.std(axis=1, ddof=1)
    return out


def technical_all(closes: np.ndarray, h: int) -> dict:
    """Skor teknikal untuk setiap hari (hanya memakai data sampai hari itu)."""
    n = len(closes)
    ma20, ma50, ma200 = _sma(closes, 20), _sma(closes, 50), _sma(closes, 200)
    logr = np.diff(np.log(closes), prepend=np.nan)
    vol = _rolling_std(np.nan_to_num(logr), 29)
    vol = np.where(np.isfinite(vol) & (vol > 0), vol, 0.02)
    lb = 3 if h == 1 else h
    mom = np.full(n, np.nan)
    mom[lb:] = np.log(closes[lb:] / closes[:-lb]) / (vol[lb:] * np.sqrt(lb))
    rsi = _rsi(closes)

    def sgn(cond):
        return np.where(cond, 1.0, -1.0)

    feats = [
        (0.5 if h >= 7 else 0.3, sgn(closes > ma50)),
        (0.35, sgn(ma20 > ma50)),
        (0.5 if h >= 30 else 0.2, np.where(np.isfinite(ma200), sgn(closes > ma200), np.nan)),
        (0.45 if h == 1 else 0.35, np.clip(mom, -2, 2) / 2),
        (0.25, np.where(rsi > 75, -0.6, np.where(rsi < 25, 0.6, (rsi - 50) / 50))),
    ]
    num = np.zeros(n)
    den = np.zeros(n)
    for w, v in feats:
        ok = np.isfinite(v)
        num += np.where(ok, w * np.nan_to_num(v), 0)
        den += np.where(ok, w, 0)
    score = np.where(den > 0, num / np.maximum(den, 1e-9), 0)
    fut = np.full(n, np.nan)
    fut[: n - h] = np.log(closes[h:] / closes[: n - h])
    band = 0.25 * vol * np.sqrt(h)
    outcome = np.where(fut > band, 0, np.where(fut < -band, 2, 1))  # 0 naik, 1 sideways, 2 turun
    return {"score": score, "vol": vol, "rsi": rsi, "ma20": ma20, "ma50": ma50, "ma200": ma200, "mom": mom,
            "fut": fut, "outcome": outcome}


def calibrate(t: dict, h: int, upto: int, k: float = 20.0) -> dict | None:
    """Frekuensi historis naik/sideways/turun per kelompok sinyal, hanya dari hari < upto."""
    idx = np.arange(START, max(START, upto - h))
    if len(idx) < 30:
        return None
    s, o, f = t["score"][idx], t["outcome"][idx], t["fut"][idx]
    e1, e2 = np.quantile(s, [1 / 3, 2 / 3])
    b = np.digitize(s, [e1, e2])
    base = np.bincount(o, minlength=3) / len(o)
    probs, med, cnt = [], [], []
    for k_ in range(3):
        m = b == k_
        c = np.bincount(o[m], minlength=3)
        probs.append((c + k * base) / (m.sum() + k))
        med.append(float(np.median(f[m])) if m.any() else 0.0)
        cnt.append(int(m.sum()))
    return {"edges": (e1, e2), "probs": np.array(probs), "median": med, "count": cnt, "base": base, "n": len(idx)}


def predict(t: dict, h: int, day: int, cal: dict | None) -> dict:
    if cal is None:
        p = np.array([1 / 3] * 3)
        bucket, med, n = 1, 0.0, 0
        base = p
    else:
        bucket = int(np.digitize([t["score"][day]], cal["edges"])[0])
        p, med, n, base = cal["probs"][bucket], cal["median"][bucket], cal["count"][bucket], cal["base"]
    up, side, down = float(p[0]), float(p[1]), float(p[2])
    diff = up - down
    direction = "side" if side > max(up, down) or abs(diff) < 0.05 else ("up" if diff > 0 else "down")
    edge = max(abs(up - base[0]), abs(down - base[2]))
    confidence = "rendah" if edge < 0.04 else ("sedang" if edge < 0.09 else "tinggi")
    return {"probs": {"up": up, "side": side, "down": down}, "direction": direction, "confidence": confidence,
            "medianRet": med, "bucket": bucket, "n": n}


def _quantile_sorted(a: np.ndarray, q: float) -> float:
    """Sama dengan np.quantile (interpolasi linear) tetapi untuk array yang sudah terurut."""
    pos = (len(a) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(a) - 1)
    return float(a[lo] + (a[hi] - a[lo]) * (pos - lo))


def backtest(closes: np.ndarray, h: int, start: int, t: dict | None = None, k: float = 20.0) -> dict:
    """Uji balik walk-forward INKREMENTAL.

    Setiap hari, kalibrasi hanya memakai hari-hari sebelumnya. Alih-alih menghitung ulang
    kalibrasi dari nol (O(n log n) per hari), skor masa lalu disimpan terurut dan jumlah
    hasil per kelompok dihitung dengan prefix-sum + searchsorted. Hasilnya identik dengan
    memanggil calibrate() + predict() setiap hari.
    """
    t = t or technical_all(closes, h)
    n = len(closes)
    score, outcome, fut = t["score"], t["outcome"], t["fut"]
    first = max(330, start)
    known = list(range(START, max(START, first + 1 - h)))
    order = sorted(known, key=lambda i: score[i])
    ss = [float(score[i]) for i in order]
    oo = [int(outcome[i]) for i in order]
    import bisect

    calls = hit = total = 0
    brier = brier_base = 0.0
    for day in range(first, n - h):
        m = len(ss)
        if m >= 30:
            sa = np.asarray(ss)
            onehot = np.zeros((m, 3))
            onehot[np.arange(m), oo] = 1
            cum = np.vstack([np.zeros(3), np.cumsum(onehot, axis=0)])
            e1, e2 = _quantile_sorted(sa, 1 / 3), _quantile_sorted(sa, 2 / 3)
            i1, i2 = int(np.searchsorted(sa, e1, "left")), int(np.searchsorted(sa, e2, "left"))
            base = cum[m] / m
            x = score[day]
            lo, hi = (0, i1) if x < e1 else ((i1, i2) if x < e2 else (i2, m))
            c = cum[hi] - cum[lo]
            p = (c + k * base) / ((hi - lo) + k)
            up, side, down = p
            diff = up - down
            direction = "side" if side > max(up, down) or abs(diff) < 0.05 else ("up" if diff > 0 else "down")
            o = np.zeros(3)
            o[outcome[day]] = 1
            brier += float(((p - o) ** 2).sum())
            brier_base += float(((base - o) ** 2).sum())
            total += 1
            if direction != "side":
                calls += 1
                hit += (direction == "up") == (fut[day] > 0)
        # hari (day + 1 - h) kini hasilnya sudah diketahui → masukkan ke data kalibrasi
        nxt = day + 1 - h
        if nxt >= START:
            pos = bisect.bisect_left(ss, float(score[nxt]))
            ss.insert(pos, float(score[nxt]))
            oo.insert(pos, int(outcome[nxt]))
    total = total or 1
    return {"days": total, "calls": calls, "accuracy": hit / calls if calls else None,
            "brier": brier / total, "brierBase": brier_base / total, "skilled": total > 30 and brier < brier_base * 0.99}


def backtest_reference(closes: np.ndarray, h: int, start: int, t: dict | None = None) -> dict:
    """Versi lambat & sederhana (kalibrasi ulang setiap hari) — dipakai uji untuk memastikan
    backtest() inkremental memberi hasil yang sama."""
    t = t or technical_all(closes, h)
    calls = hit = total = 0
    brier = brier_base = 0.0
    for day in range(max(330, start), len(closes) - h):
        cal = calibrate(t, h, day + 1)
        if cal is None:
            continue
        pr = predict(t, h, day, cal)
        o = np.zeros(3)
        o[t["outcome"][day]] = 1
        pv = np.array([pr["probs"]["up"], pr["probs"]["side"], pr["probs"]["down"]])
        brier += float(((pv - o) ** 2).sum())
        brier_base += float(((cal["base"] - o) ** 2).sum())
        total += 1
        if pr["direction"] != "side":
            calls += 1
            hit += (pr["direction"] == "up") == (t["fut"][day] > 0)
    total = total or 1
    return {"days": total, "calls": calls, "accuracy": hit / calls if calls else None,
            "brier": brier / total, "brierBase": brier_base / total, "skilled": total > 30 and brier < brier_base * 0.99}


REASONS = {
    "ma50": ("Harga di atas MA-50 harian", "Harga di bawah MA-50 harian"),
    "cross": ("MA-20 di atas MA-50 (tren naik)", "MA-20 di bawah MA-50 (tren melemah)"),
    "ma200": ("Di atas MA-200 (tren besar naik)", "Di bawah MA-200 (tren besar turun)"),
}


def _reasons(t: dict, day: int, closes: np.ndarray) -> list[str]:
    r = []
    r.append(REASONS["ma50"][0 if closes[day] > t["ma50"][day] else 1])
    r.append(REASONS["cross"][0 if t["ma20"][day] > t["ma50"][day] else 1])
    if np.isfinite(t["ma200"][day]):
        r.append(REASONS["ma200"][0 if closes[day] > t["ma200"][day] else 1])
    m = t["mom"][day]
    r.append("Momentum jangka pendek positif" if m > 0.3 else "Momentum jangka pendek negatif" if m < -0.3 else "Momentum datar")
    rs = t["rsi"][day]
    r.append(f"RSI {rs:.0f} jenuh beli" if rs > 70 else f"RSI {rs:.0f} jenuh jual" if rs < 30 else f"RSI {rs:.0f} netral")
    return r


async def _kraken(interval: int) -> list[dict]:
    j = await fetch.get_json(f"https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval={interval}", ttl=300)
    if j.get("error"):
        raise RuntimeError(", ".join(j["error"]))
    key = next(k for k in j["result"] if k != "last")
    return [{"t": c[0] * 1000, "o": float(c[1]), "h": float(c[2]), "l": float(c[3]), "c": float(c[4])} for c in j["result"][key]]


async def analyze(tf_key: str = "24j") -> dict:
    tf = TFS.get(tf_key, TFS["24j"])
    res = await asyncio.gather(
        _kraken(1440),
        _kraken(tf["interval"]) if tf["interval"] != 1440 else asyncio.sleep(0, result=None),
        fetch.get_json("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,idr&include_24hr_change=true&include_24hr_vol=true", ttl=60),
        fetch.get_json("https://api.alternative.me/fng/?limit=1", ttl=1800),
        fetch.get_json("https://api.coingecko.com/api/v3/global", ttl=600),
        fetch.get_json("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP", ttl=600),
        return_exceptions=True,
    )
    daily, bars, spot, fng, glob, funding = [None if isinstance(x, Exception) else x for x in res]
    if not daily:
        raise RuntimeError("Tidak bisa mengambil data harga Bitcoin.")
    closes = np.array([b["c"] for b in daily], dtype=float)
    s = (spot or {}).get("bitcoin") or {}
    if s.get("usd"):
        closes[-1] = s["usd"]
    t0 = time.perf_counter()
    t = technical_all(closes, tf["h"])
    day = len(closes) - 1
    cal = calibrate(t, tf["h"], len(closes))
    pr = predict(t, tf["h"], day, cal)
    skill = backtest(closes, tf["h"], len(closes) - 250, t)
    if not skill["skilled"]:
        pr["confidence"] = "rendah"
    compute_ms = (time.perf_counter() - t0) * 1000

    series = (bars or daily)[-tf["bars"]:]
    price = float(closes[-1])
    hi, lo = max(b["h"] for b in series), min(b["l"] for b in series)
    recent = series[-max(6, round(len(series) / 3)):]
    levels = [lo, hi, min(b["l"] for b in recent), max(b["h"] for b in recent), t["ma20"][day], t["ma50"][day]]
    levels = [float(x) for x in levels if np.isfinite(x)]
    below, above = [x for x in levels if x < price], [x for x in levels if x > price]
    vol = float(t["vol"][day])
    support = max(below) if below else price * np.exp(-vol)
    resistance = min(above) if above else price * np.exp(vol)
    chg = s.get("usd_24h_change") if tf["h"] == 1 and s.get("usd_24h_change") is not None else (price / series[0]["o"] - 1) * 100
    target = price * float(np.exp(0 if pr["direction"] == "side" else pr["medianRet"]))
    fng_v = int(fng["data"][0]["value"]) if fng and fng.get("data") else None
    fng_c = fng["data"][0]["value_classification"] if fng and fng.get("data") else ""
    fund = float(funding["data"][0]["fundingRate"]) if funding and funding.get("data") else None
    dom = (glob or {}).get("data", {}).get("market_cap_percentage", {}).get("btc")
    usd_idr = s["idr"] / s["usd"] if s.get("idr") and s.get("usd") else None
    reasons = _reasons(t, day, closes)
    ctx = []
    if fng_v is not None:
        ctx.append(f"Fear & Greed {fng_v} ({'takut' if fng_v < 30 else 'serakah' if fng_v > 70 else 'netral'})")
    return {
        "tf": tf_key, "tfLabel": tf["label"], "updatedAt": time.time(), "computeMs": round(compute_ms, 1),
        "price": price, "priceIdr": price * usd_idr if usd_idr else None, "change": chg, "high": hi, "low": lo,
        "series": [b["c"] for b in series],
        "model": {**pr, "target": target, "reasons": reasons, "context": ctx, "skill": skill,
                  "signal": ["bearish", "netral", "bullish"][pr["bucket"]], "historyDays": pr["n"]},
        "support": support, "resistance": resistance,
        "market": {
            "fng": {"value": fng_v, "label": {"Extreme Fear": "Sangat takut", "Fear": "Takut", "Neutral": "Netral", "Greed": "Serakah", "Extreme Greed": "Sangat serakah"}.get(fng_c, fng_c)} if fng_v is not None else None,
            "volume24h": s.get("usd_24h_vol"), "dominance": dom, "funding": fund,
            "rsi": float(t["rsi"][day]), "vol30": vol * np.sqrt(30) * 100,
        },
    }
