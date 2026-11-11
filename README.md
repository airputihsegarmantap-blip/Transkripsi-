# TranskripKu

<img src="static/icon-192.png" alt="Logo TranskripKu" width="96">

Aplikasi untuk **mentranskripsi video YouTube berbahasa Indonesia secara otomatis** dan langsung membuat **ringkasannya**. Aplikasi ini berjalan di **server lokal** (bisa langsung di HP Android) dan **gratis tanpa API key**.

## Fitur

- Tempel link YouTube atau **bagikan langsung dari aplikasi YouTube** (Bagikan → TranskripKu).
- Urutan pengambilan transkrip:
  1. subtitle Indonesia buatan kreator,
  2. subtitle Indonesia otomatis dari YouTube,
  3. subtitle bahasa lain yang diterjemahkan ke Indonesia.
- Tiga pilihan **mesin ringkasan**:

  | Mesin | Biaya | Internet | Keterangan |
  |---|---|---|---|
  | **Peringkas lokal** (bawaan) | Gratis | Tidak perlu | Buatan sendiri, Python murni, ±0,3 detik untuk 14.000 kata. Mengambil kalimat terpenting dari transkrip. |
  | **AI lokal (Ollama)** | Gratis | Hanya saat unduh model | Model open-source kecil (bawaan `qwen2.5:1.5b`, ±1 GB) berjalan offline di perangkatmu dan menulis ringkasan dengan kalimatnya sendiri. |
  | **Claude API** | Berbayar | Perlu | Opsional, pakai `ANTHROPIC_API_KEY` milikmu sendiri. Kualitas terbaik. |

- Ringkasan berisi: ringkasan singkat, poin-poin utama (dengan stempel waktu yang bisa diklik), kesimpulan, dan kata kunci.
- Transkrip lengkap dengan stempel waktu, plus tombol salin dan unduh `.txt`.
- **Bisa dipasang sebagai aplikasi (PWA)**: muncul di layar utama dengan logo sendiri dan terbuka layar penuh.

---

## 📱 Pasang di Android (Termux)

1. Install **Termux** dari F-Droid: https://f-droid.org/packages/com.termux/
   (versi di Play Store sudah usang). Agar browser bisa dibuka otomatis, install juga **Termux:API** dari F-Droid.
2. Buka Termux, lalu jalankan:
   ```bash
   pkg install -y git
   git clone https://github.com/airputihsegarmantap-blip/Transkripsi-.git
   cd Transkripsi-
   bash install-android.sh
   ```
   Kalau ingin juga memasang AI lokal (HP dengan RAM ≥ 4 GB, butuh ±1 GB ruang), pakai `bash install-android.sh --ai`.
3. Jalankan aplikasinya:
   ```bash
   transkripku
   ```
   Browser akan terbuka otomatis di **http://localhost:5000**.
4. Di Chrome, ketuk **⋮ → Instal aplikasi** (atau **Tambahkan ke layar utama**). Mulai sekarang TranskripKu ada di layar utama dengan logonya sendiri.

> Server harus tetap berjalan di Termux saat aplikasi dipakai. Cukup buka Termux, ketik `transkripku`, lalu buka aplikasinya dari layar utama.

**Model AI lain** (atur sebelum `--ai` atau sebelum menjalankan `transkripku`):
```bash
export OLLAMA_MODEL=qwen2.5:0.5b   # paling ringan (±400 MB), untuk HP RAM kecil
export OLLAMA_MODEL=qwen2.5:3b     # lebih pintar, butuh RAM ≥ 6 GB
ollama pull $OLLAMA_MODEL
```

## 💻 Pasang di Komputer (Windows / Mac / Linux)

```bash
pip install -r requirements.txt
python app.py            # buka http://localhost:5000
```
Opsional: install [Ollama](https://ollama.com), lalu `ollama pull qwen2.5:1.5b` untuk AI lokal. Untuk Claude, jalankan `pip install anthropic` lalu atur `ANTHROPIC_API_KEY`.

---

## Konfigurasi

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `SUMMARY_ENGINE` | otomatis | `lokal`, `ollama`, atau `claude`. Otomatis berarti AI lokal kalau tersedia, kalau tidak peringkas lokal. |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Model AI lokal |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Alamat Ollama |
| `OLLAMA_MAX_WORDS` | `2500` | Transkrip yang lebih panjang dari ini dipadatkan dulu oleh peringkas lokal sebelum dikirim ke model kecil |
| `ANTHROPIC_API_KEY` | – | Mengaktifkan mesin Claude |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model Claude |
| `WHISPER_MODEL` | `small` | Untuk video tanpa subtitle (butuh `requirements-opsional.txt` + `faster-whisper` + ffmpeg; tidak disarankan di HP) |
| `PORT` | `5000` | Port server |
| `HOST` | `127.0.0.1` | Ganti ke `0.0.0.0` agar bisa dibuka dari perangkat lain di Wi-Fi yang sama |

## Struktur

```
app.py               # server Flask + endpoint API + PWA
transcriber.py       # pengambilan transkrip (subtitle YouTube / Whisper)
summarizer.py        # pemilih mesin ringkasan (lokal / Ollama / Claude)
local_summarizer.py  # peringkas lokal buatan sendiri (TF-IDF + sentralitas)
install-android.sh   # pemasang untuk Termux
jalankan.sh          # menyalakan server + membuka browser
templates/, static/  # tampilan, logo, ikon, manifest, service worker
```

## Catatan

- Pengambilan subtitle tetap butuh internet (untuk mengakses YouTube). Yang offline adalah proses meringkasnya.
- Peringkas lokal bersifat *extractive*: kalimat ringkasan diambil langsung dari transkrip, jadi gaya bahasanya mengikuti pembicara. Untuk ringkasan dengan kalimat baru yang lebih rapi, pakai AI lokal atau Claude.
- YouTube kadang memblokir IP server cloud. Menjalankan aplikasi di HP atau komputer pribadi biasanya aman.
