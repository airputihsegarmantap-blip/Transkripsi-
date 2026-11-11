"""Otak pembelajar RheusInterface — prototipe machine learning online (library River).

Semua model belajar SATU contoh demi SATU contoh (online learning), jadi makin banyak
informasi yang masuk, makin akurat. Akurasinya diukur "prequential": setiap contoh baru
ditebak dulu, baru kemudian dipelajari — sehingga angka akurasi selalu jujur (tidak
pernah menilai contoh yang sudah pernah dilihat).

Model:
  - PunctModel   : mengembalikan titik & koma ke transkrip tanpa tanda baca (dipakai
                   TranscriptBot). Dilatih self-supervised dari teks berita bertanda baca:
                   tanda baca dibuang, model menebak, lalu belajar dari jawaban asli.
  - CaseModel    : bentuk huruf besar yang benar (jakarta → Jakarta, whatsapp → WhatsApp).
  - TopicModel   : kategori berita (militer/ekonomi/…; makanan/selebriti/dance/…),
                   dilatih dari label lemah (asal feed & kata kunci) lalu menebak sisanya.
"""

from __future__ import annotations

import os
import pickle
import re
import threading
import time
import zlib
from collections import Counter, defaultdict

from river import feature_extraction, linear_model, metrics, naive_bayes, optim
from river.utils import Rolling

from .text import STOP, content_words

# ====================================================================== tanda baca
LABELS = ("", ",", ".")
_TOKEN = re.compile(r"[A-Za-zÀ-ÿ0-9]+(?:[-'][A-Za-zÀ-ÿ0-9]+)*|[.,!?;:]")
DISCOURSE = set("""jadi nah kemudian lalu terus selanjutnya berikutnya namun tetapi tapi sedangkan kesimpulannya
intinya pertama kedua ketiga keempat kelima terakhir makanya karena sehingga misalnya contohnya oke""".split())


def tokenize_punctuated(text: str) -> tuple[list[str], list[str]]:
    """Teks bertanda baca → (kata, label setelah kata)."""
    toks, labels = [], []
    for t in _TOKEN.findall(text):
        if t in ".!?;:":
            if labels:
                labels[-1] = "."
        elif t == ",":
            if labels and labels[-1] == "":
                labels[-1] = ","
        else:
            toks.append(t)
            labels.append("")
    return toks, labels


def _shape(w: str) -> str:
    if w.isdigit():
        return "num"
    if len(w) <= 2:
        return "short"
    return "w"


HASH_BITS = 18  # feature hashing: memori model tetap kecil (≤ 2^18 bobot per kelas) berapa pun data yang dipelajari
_MASK = (1 << HASH_BITS) - 1


def _stable_hash(s: str) -> int:
    return zlib.crc32(s.encode("utf-8"))


def gap_features(words: list[str], i: int, since: int) -> dict:
    """Fitur (di-hash) untuk celah setelah kata ke-i (huruf kecil semua — seperti subtitle)."""
    return {(_stable_hash(k) & _MASK): v for k, v in _raw_gap_features(words, i, since).items()}


def _raw_gap_features(words: list[str], i: int, since: int) -> dict:
    w0 = words[i]
    w1 = words[i + 1] if i + 1 < len(words) else "</s>"
    wm1 = words[i - 1] if i > 0 else "<s>"
    w2 = words[i + 2] if i + 2 < len(words) else "</s>"
    b = since if since < 8 else (8 if since < 12 else (12 if since < 18 else (18 if since < 26 else 26)))
    f = {
        "w0=" + w0: 1, "w1=" + w1: 1, "w-1=" + wm1: 1, "w2=" + w2: 1,
        "w0w1=" + w0 + "|" + w1: 1, "w-1w0=" + wm1 + "|" + w0: 1,
        "suf0=" + w0[-3:]: 1, "pre1=" + w1[:3]: 1,
        "shape0=" + _shape(w0): 1, "shape1=" + _shape(w1): 1,
        "since=" + str(b): 1, "bias": 1,
    }
    if w1 in DISCOURSE:
        f["w1_discourse"] = 1
    if w0 in STOP:
        f["w0_stop"] = 1
    if w1 in STOP:
        f["w1_stop"] = 1
    if w1 == "</s>":
        f["end"] = 1
    return f


class PunctModel:
    def __init__(self):
        self.model = linear_model.SoftmaxRegression(optimizer=optim.AdaGrad(0.1), l2=1e-6)
        self.seen = 0
        self.acc = Rolling(metrics.MacroF1, window_size=5000)
        self.f1_period = Rolling(metrics.F1, window_size=5000)
        self.history: list[tuple[int, float]] = []  # (jumlah token dipelajari, F1 titik)

    def learn_text(self, text: str, evaluate: bool = True) -> int:
        toks, labels = tokenize_punctuated(text)
        words = [t.lower() for t in toks]
        since = 0
        for i, y in enumerate(labels):
            x = gap_features(words, i, since)
            if evaluate and self.seen > 2000:
                p = self.model.predict_one(x) or ""
                self.acc.update(y, p)
                self.f1_period.update(y == ".", p == ".")
            self.model.learn_one(x, y)
            self.seen += 1
            since = 0 if y == "." else since + 1
            if self.seen % 20000 == 0:
                self.history.append((self.seen, round(self.f1_period.get(), 4)))
        return len(labels)

    def predict(self, words: list[str], p_period: float = 0.42, p_comma: float = 0.45, min_len: int = 4) -> list[str]:
        """Tebak label setiap celah. Decoding rakus dengan batas panjang kalimat."""
        out = []
        since = 0
        for i in range(len(words)):
            proba = self.model.predict_proba_one(gap_features(words, i, since)) or {}
            pp, pc = proba.get(".", 0.0), proba.get(",", 0.0)
            if since + 1 >= min_len and pp >= p_period:
                lab = "."
            elif since >= 34 and pp >= 0.15:  # kalimat terlalu panjang: potong di kandidat terbaik
                lab = "."
            elif pc >= p_comma and since >= 2:
                lab = ","
            else:
                lab = ""
            out.append(lab)
            since = 0 if lab == "." else since + 1
        if out:
            out[-1] = "."
        return out

    def stats(self) -> dict:
        return {"tokens_learned": self.seen, "macro_f1_recent": round(self.acc.get(), 4),
                "period_f1_recent": round(self.f1_period.get(), 4), "history": self.history[-20:]}


class CaseModel:
    """Belajar bentuk huruf yang benar untuk setiap kata dari teks yang ditulis rapi."""

    def __init__(self):
        self.forms: dict[str, Counter] = defaultdict(Counter)
        self.seen = 0

    def learn_text(self, text: str) -> None:
        toks, labels = tokenize_punctuated(text)
        prev = "."
        for t, lab in zip(toks, labels):
            if prev != "." and t[:1].isalpha():  # abaikan kata awal kalimat
                self.forms[t.lower()][t] += 1
                self.seen += 1
            prev = lab

    def apply(self, w: str) -> str:
        c = self.forms.get(w)
        if not c:
            return w
        form, n = c.most_common(1)[0]
        total = sum(c.values())
        return form if n >= 2 and n / total >= 0.6 else w


# ====================================================================== kategori
SEEDS = {
    "militer": "militer tentara pasukan rudal perang serangan drone senjata pertahanan tank jet tempur armada angkatan bersenjata invasi gencatan",
    "ekonomi": "ekonomi tarif inflasi bank sentral suku bunga harga minyak ekspor impor resesi pdb investasi saham pasar dagang perdagangan",
    "diplomasi": "bilateral kunjungan kenegaraan diplomatik duta besar menteri luar negeri ktt perjanjian kerja sama hubungan kedua negara presiden bertemu",
    "geopolitik": "geopolitik nato laut china selatan sanksi dewan keamanan pbb aliansi pengaruh kawasan perbatasan sengketa taiwan ukraina rusia",
    "makanan": "makanan kuliner resep restoran warung masakan minuman jajanan kopi food recipe restaurant chef menu snack dessert",
    "selebriti": "artis selebriti seleb skandal aktor aktris penyanyi cerai pacaran gosip celebrity actor actress singer scandal divorce dating rapper",
    "dance": "dance joget tarian goyang challenge tren lagu koreografi dancing choreography song",
    "hewan": "kucing anjing hewan monyet harimau burung ular binatang cat dog animal pet puppy kitten bear",
    "olahraga": "sepak bola timnas pemain gol pertandingan liga atlet football soccer nba nfl player match game coach",
    "teknologi": "teknologi aplikasi ai gadget smartphone iphone android robot internet app tech chatgpt",
    "sosial": "warga polisi kecelakaan ojol sekolah guru siswa banjir kebakaran viral pengendara warganet netizen police crash school",
}
SEED_SETS = {k: set(v.split()) for k, v in SEEDS.items()}


def seed_label(text: str, allowed: list[str]) -> str | None:
    ws = set(content_words(text)) | set(text.lower().split())
    scores = {k: len(ws & SEED_SETS[k]) for k in allowed if k in SEED_SETS}
    if not scores:
        return None
    best = max(scores, key=scores.get)
    ranked = sorted(scores.values(), reverse=True)
    if ranked[0] >= 2 and (len(ranked) == 1 or ranked[0] > ranked[1]):
        return best
    return None


def _tok(s: str) -> list[str]:
    return content_words(s)


class TopicModel:
    def __init__(self, labels: list[str]):
        self.labels = labels
        self.model = feature_extraction.BagOfWords(tokenizer=_tok, ngram_range=(1, 2)) | naive_bayes.ComplementNB(alpha=0.5)
        self.acc = metrics.Accuracy()
        self.recent = Rolling(metrics.Accuracy, window_size=300)
        self.seen = 0
        self.history: list[tuple[int, float]] = []

    def learn(self, text: str, y: str) -> None:
        if self.seen >= 20:
            p = self.model.predict_one(text)
            if p is not None:
                self.acc.update(y, p)
                self.recent.update(y, p)
        self.model.learn_one(text, y)
        self.seen += 1
        if self.seen % 100 == 0:
            self.history.append((self.seen, round(self.recent.get(), 4)))

    def predict(self, text: str) -> tuple[str | None, float]:
        if self.seen < 20:
            return None, 0.0
        proba = self.model.predict_proba_one(text) or {}
        if not proba:
            return None, 0.0
        y = max(proba, key=proba.get)
        return y, proba[y]

    def stats(self) -> dict:
        return {"examples_learned": self.seen, "accuracy_all": round(self.acc.get(), 4),
                "accuracy_recent": round(self.recent.get(), 4), "history": self.history[-20:]}


# ====================================================================== otak
class Brain:
    VERSION = 2

    def __init__(self):
        self.punct = PunctModel()
        self.case = CaseModel()
        self.topics = {
            "internasional": TopicModel(["militer", "ekonomi", "diplomasi", "geopolitik"]),
            "viral": TopicModel(["makanan", "selebriti", "dance", "hewan", "olahraga", "teknologi", "sosial"]),
        }
        self.seen_texts: set[int] = set()
        self.created = time.time()
        self.updated = time.time()
        self.lock = threading.Lock()

    def __getstate__(self):
        d = self.__dict__.copy()
        d.pop("lock", None)
        return d

    def __setstate__(self, d):
        self.__dict__.update(d)
        self.lock = threading.Lock()

    def learn_text(self, text: str) -> bool:
        """Pelajari teks bertanda baca (deskripsi berita, artikel). Teks yang sama hanya sekali."""
        if not text or len(text) < 60 or text.count(".") < 1:
            return False
        h = _stable_hash(text)
        if h in self.seen_texts:
            return False
        with self.lock:
            self.seen_texts.add(h)
            if len(self.seen_texts) > 200_000:
                self.seen_texts.clear()
            self.punct.learn_text(text)
            self.case.learn_text(text)
            self.updated = time.time()
        return True

    def classify(self, task: str, text: str, weak_label: str | None) -> tuple[str, float, str]:
        """Kembalikan (kategori, keyakinan, asal). Contoh berlabel sekaligus dipelajari."""
        tm = self.topics[task]
        label = None
        if weak_label in tm.labels:
            # Label dari asal feed hanya dipercaya bila isi berita mendukungnya — hasil pencarian
            # Google kadang menyertakan berita yang tidak sesuai topik.
            ws = set(content_words(text)) | set(text.lower().split())
            if ws & SEED_SETS.get(weak_label, set()):
                label = weak_label
        label = label or seed_label(text, tm.labels)
        with self.lock:
            if label:
                tm.learn(text, label)
                self.updated = time.time()
                return label, 1.0, "label"
            y, p = tm.predict(text)
        if y and p >= 0.55:
            return y, p, "model"
        return "lainnya", p, "model"

    def stats(self) -> dict:
        return {
            "punctuation": self.punct.stats(),
            "capitalization": {"words_learned": len(self.case.forms), "observations": self.case.seen},
            "topics": {k: v.stats() for k, v in self.topics.items()},
            "texts_learned": len(self.seen_texts),
            "updated": self.updated,
        }


def save(brain: Brain, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with brain.lock, open(tmp, "wb") as f:
        pickle.dump(brain, f, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)


def load(*paths: str) -> Brain:
    """Muat otak dari file pertama yang ada (data runtime → model bawaan), atau buat baru."""
    for p in paths:
        if p and os.path.exists(p):
            try:
                with open(p, "rb") as f:
                    b = pickle.load(f)
                if isinstance(b, Brain):
                    return b
            except Exception:  # noqa: BLE001
                continue
    return Brain()
