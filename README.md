# SiLengkap

<img src="web/icon-192.png" alt="Logo SiLengkap" width="88">

**Transkripsi video, berita, analisa Bitcoin, radio, dan gim dalam satu aplikasi.**

SiLengkap terdiri dari dua bagian:

| Bagian | Isi | Hosting |
|---|---|---|
| **Aplikasi SiLengkap** (`web/`, `android/`) | Tampilan: menu, berita, radio, gim | APK Android atau situs statis |
| **RheusInterface** (`rheus/`) | "Otak": mengambil & mengolah semua data, machine learning, TranscriptBot | **Server terpisah** (Docker) |

Aplikasi **wajib online** karena semua data diolah RheusInterface. Satu-satunya pengecualian adalah menu **Gim**, yang berjalan sepenuhnya di perangkat.

## Menu

| Menu | Isi |
|---|---|
| 🎬 Transkripsi Video | Link YouTube → **transkrip lengkap yang sudah dirapikan** (titik, koma, huruf kapital, paragraf) + ringkasan. Bisa ditukar ke subtitle asli. |
| ₿ Berita Kripto Hari Ini | 3 headline hot + berita terbaru berhalaman |
| 📈 Prediksi Arah Bitcoin | Harga (USD & Rupiah), grafik 24j/7h/30h, arah, probabilitas, keadaan pasar, uji balik otomatis |
| 📰 Berita Utama | **Nasional** dan **Internasional**. Internasional dibagi ke kategori Militer, Ekonomi, Hubungan Antarnegara, Geopolitik. |
| 🔥 Berita Viral | Region **Indonesia / USA**, filter **media sosial** (TikTok, Instagram, X, YouTube, Facebook) dan **kategori** (makanan, selebriti & skandal, tren dance, hewan, olahraga, teknologi, sosial) |
| 📻 Radio | Ratusan stasiun gratis Indonesia & USA dari direktori terbuka Radio Browser |
| 🎮 Gim | Dino, Ular Tangga (lawan komputer / 2–4 pemain), Sudoku (3 tingkat, solusi tunggal), Minesweeper (3 tingkat) — **offline** |
| ✨ Tanya Rheus (beranda) | Tanya jawab berbasis pencarian atas semua berita & analisa yang dikumpulkan Rheus |

---

## 🧠 RheusInterface 2

Server Python (FastAPI) di folder `rheus/`. Ia dibangun dengan library open-source dari GitHub:

| Library | Dipakai untuk |
|---|---|
| [FastAPI](https://github.com/fastapi/fastapi) + [Uvicorn](https://github.com/encode/uvicorn) (uvloop) | API async yang cepat |
| [httpx](https://github.com/encode/httpx) | Mengambil puluhan sumber sekaligus, paralel |
| [lxml](https://github.com/lxml/lxml) | Parser RSS berbasis C |
| [River](https://github.com/online-ml/river) | **Machine learning online**: model belajar terus dari setiap informasi baru |
| [NumPy](https://github.com/numpy/numpy) | Analisa Bitcoin, TextRank, prediksi tanda baca |
| [datasketch](https://github.com/ekzhu/datasketch) | MinHash LSH untuk menggabungkan berita yang sama dengan cepat |
| [rank_bm25](https://github.com/dorianbrown/rank_bm25) | Pencarian untuk "Tanya Rheus" |
| [orjson](https://github.com/ijl/orjson) | JSON cepat |
| [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) | Subtitle YouTube (versi web) |

### Prototipe machine learning: makin akurat setiap mendapat informasi

`rheus/rheus/learn.py` berisi tiga model online. Setiap model belajar satu contoh demi satu contoh.

- **Model tanda baca:** mengembalikan titik dan koma ke subtitle yang tidak bertanda baca. Model ini dilatih **self-supervised**: dari setiap teks berita bertanda baca yang masuk, tanda bacanya dibuang, model menebak, lalu belajar dari jawaban aslinya. Tidak ada pelabelan manual.
- **Model huruf kapital:** mempelajari bentuk penulisan yang benar dari teks yang rapi (jakarta → Jakarta, whatsapp → WhatsApp).
- **Model kategori berita:** dilatih dari "label lemah" (asal feed + kata kunci yang dicek isinya), lalu menebak kategori berita lain yang tidak berlabel.

Akurasi diukur **prequential**: setiap contoh baru ditebak dulu, baru dipelajari. Jadi angka akurasinya jujur, dan riwayatnya bisa dilihat di `GET /v1/learn`. Otak disimpan berkala ke disk.

> **Catatan jujur:** RheusInterface bukan LLM generatif seperti ChatGPT. Ia **prototipe** machine learning kecil yang berjalan di server gratis. "Tanya Rheus" adalah langkah pertama ke arah LLM: Rheus mencari potongan informasi paling relevan (BM25) dan menyusunnya menjadi jawaban beserta sumbernya. Ia belum mengarang kalimat sendiri.

### API

| Endpoint | Isi |
|---|---|
| `GET /v1/health` | Status |
| `GET /v1/news/utama` | Berita Utama (nasional, internasional + kategori) |
| `GET /v1/news/kripto` | Berita Kripto |
| `GET /v1/news/viral?region=id\|us` | Berita Viral (platform & kategori) |
| `GET /v1/btc?tf=24j\|7h\|30h` | Analisa Bitcoin + uji balik |
| `GET /v1/radio?region=id\|us` | Stasiun radio |
| `POST /v1/transcript` | `{url}` → subtitle + TranscriptBot 3 |
| `POST /v1/transcript/process` | Subtitle dari HP → TranscriptBot 3 |
| `GET /v1/ask?q=…` | Tanya Rheus |
| `GET /v1/learn` | Statistik pembelajaran |

Server memperbarui berita dan analisa **di latar belakang setiap 15 menit**, sehingga aplikasi langsung menerima data siap pakai.

---

## 🤖 TranscriptBot 3

Fitur baru di versi 3: **transkrip lengkap yang dirapikan**. Prosesnya:
1. Kata pengisi dibuang dan kata tidak baku dibakukan.
2. Model ML mengembalikan titik dan koma.
3. Huruf kapital diterapkan di awal kalimat dan pada nama diri.
4. Angka diubah menjadi digit.
5. Teks dibagi ke paragraf dengan stempel waktu.

Ringkasannya memakai pemotongan kalimat ucapan dari v2, teks yang dirapikan model ML, TextRank versi NumPy, dan MMR.

---

## 📊 Hasil verifikasi

Semua angka di bawah berasal dari GitHub Actions (`.github/workflows/rheus.yml`) dengan data sungguhan. Jalankan ulang dengan `python eval/eval_v3.py`, `python eval/bench_v2.py`, dan `node eval/btc_backtest.js`.

Hasil terbaru ada di log workflow **RheusInterface** dan di artefak `rheus-model-dan-hasil`. Ringkasan hasil verifikasi juga ada di deskripsi Pull Request.

## 📲 APK Android

Unduh **SiLengkap.apk** dari https://github.com/airputihsegarmantap-blip/Transkripsi-/releases/tag/apk-terbaru.

Di APK, subtitle YouTube diambil langsung dari HP, karena YouTube sering memblokir IP server cloud. Subtitle itu lalu dikirim ke RheusInterface untuk dirapikan dan diringkas.

## 🌐 Hosting (gratis)

`render.yaml` mendefinisikan **dua layanan terpisah**:
- `silengkap-rheus`: server RheusInterface (Docker).
- `silengkap`: situs statis SiLengkap.

Langkah-langkahnya:
1. Daftar di https://render.com memakai akun GitHub.
2. Klik **New → Blueprint**, pilih repo ini, lalu klik **Deploy**. Render membangun image RheusInterface, termasuk pelatihan awal dari Wikipedia Indonesia (±1–3 menit).
3. Salin alamat server RheusInterface (mis. `https://silengkap-rheus.onrender.com`). Masukkan ke **web/config.js**, atau lewat aplikasi: **Menu → Pengaturan server → Tes → Simpan**.

Alternatif lain:
- **Hugging Face Spaces:** pilih SDK Docker, upload isi folder `rheus/`, port 8000.
- **Koyeb:** pilih builder Dockerfile, root `rheus/`.

Catatan paket gratis:
- **Server tidur:** server tertidur setelah ±15 menit tanpa pengunjung. Permintaan pertama butuh ±1 menit untuk membangunkannya.
- **Disk tidak permanen:** disk server gratis tidak menyimpan data selamanya, jadi setelah deploy ulang otak kembali ke hasil pelatihan awal, lalu belajar lagi.
- **Transkripsi di versi web:** bisa diblokir YouTube. Atasi dengan `YT_PROXY_URL`, atau pakai APK.

## Pengembangan

```bash
pip install -r rheus/requirements.txt pytest
python -m pytest rheus/tests                     # uji otomatis
cd rheus && python -m rheus.train --wiki-pages 2000   # pelatihan awal
uvicorn rheus.app:app --reload                   # jalankan server (port 8000)
python -m http.server -d web 8080                # jalankan tampilan web
```

## Struktur

```
rheus/                 # RheusInterface (server terpisah)
  rheus/app.py         #   API
  rheus/learn.py       #   machine learning online (River)
  rheus/transcriptbot.py
  rheus/news.py, btc.py, radio.py, knowledge.py, youtube.py, train.py
  tests/               #   uji otomatis
  Dockerfile
web/                   # aplikasi SiLengkap (dipakai web & APK)
  app.js, silengkap.css, config.js, games/
android/               # pembungkus Android
eval/                  # evaluasi & benchmark (+ versi lama di eval/baseline untuk pembanding)
```
