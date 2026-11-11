# SiLengkap

<img src="web/icon-192.png" alt="Logo SiLengkap" width="88">

**Transkripsi video, berita, analisa Bitcoin, dan hiburan dalam satu aplikasi.**

Aplikasi dibuka dengan logo SiLengkap. Tombol menu di kanan atas membuka enam menu:

| Menu | Isi |
|---|---|
| 🎬 **Transkripsi Video** | Tempel link YouTube → transkripsi lengkap (stempel waktu bisa diklik) + ringkasan oleh **TranscriptBot** |
| ₿ **Berita Kripto Hari Ini** | 3 headline hot + berita terbaru berhalaman, dari beberapa sumber + forum |
| 📈 **Prediksi Arah Bitcoin** | Harga BTC (USD & Rupiah), grafik 24j/7h/30h, arah, target, support/resistance, probabilitas, keadaan pasar |
| 🎮 **Gim Dino** | Lompat dan hindari kaktus, rekor tersimpan di perangkat |
| 🌏 **Berita Dunia** | Format sama dengan berita kripto |
| 🔥 **Berita Viral** | Yang ramai di media sosial dan forum |

Tampilan mengikuti desain `SiLengkap.dc.html` (tema gelap, aksen ungu). File CSS design system aslinya ("Nocturne") tidak tersedia, jadi gaya visualnya dibuat ulang di `web/silengkap.css` dari warna dan komponen yang dipakai di desain.

---

## 🧠 RheusInterface

`shared/rheus.js` adalah "otak" SiLengkap. Ia mengelola dan mengambil informasi dari internet dan forum untuk semua menu. Ukurannya ringan (JavaScript murni) dan berjalan langsung di HP/browser tanpa API key.

> **Catatan jujur:** RheusInterface **bukan model bahasa (LLM)**. Ia mesin aturan + statistik yang transparan. Setiap keputusannya (berita mana yang hot, angka probabilitas) bisa dijelaskan dan diuji.

**Berita**
1. Mengambil RSS dari beberapa sumber sekaligus:
   - Kripto: Google Berita Indonesia, CNBC Indonesia.
   - Dunia: Google Berita, BBC News Indonesia.
   - Viral: Google Berita.
   - Forum: Reddit r/CryptoCurrency, r/worldnews, r/indonesia.
2. Membuang spam (judul SEO dari situs yang diretas, judi online) dan berita di luar topik.
3. Menggabungkan cerita yang sama dari media berbeda (kemiripan judul).
4. Memberi **skor hot** = jumlah sumber + jumlah liputan terkait + ramai di forum, dikalikan kebaruan.
5. Menyimpan hasil di cache (10 menit), sehingga saat offline data terakhir tetap tampil.

**Bitcoin**
- Data: Kraken (harga harian & per jam), CoinGecko (harga Rupiah, volume, dominasi), alternative.me (Fear & Greed), OKX (funding rate).
- Sinyal teknikal: MA-20/50/200, RSI-14, momentum, volatilitas.
- **Probabilitas berasal dari sejarah:** RheusInterface mencari hari-hari dalam ±2 tahun terakhir dengan sinyal serupa (bearish / netral / bullish), lalu menghitung seberapa sering harga sesudahnya naik, sideways, atau turun.
- **Uji balik otomatis** di dalam aplikasi: setiap kali analisa dibuka, model diuji pada ±250 hari terakhir. Kalau tidak terbukti lebih baik dari tebakan dasar, keyakinan otomatis "rendah" dan hasilnya ditampilkan ke pengguna.

### Hasil uji balik model Bitcoin

Dijalankan dengan `node eval/btc_backtest.js` (walk-forward, data Kraken ±2 tahun, November 2026):

| Horizon | Akurasi arah | Brier model | Brier dasar |
|---|---|---|---|
| 1 hari | 44,9% | 0,667 | 0,664 |
| 7 hari | 37,5% | 0,689 | 0,667 |
| 30 hari | 37,7% | 0,732 | 0,713 |

**Kesimpulannya:** arah harga Bitcoin praktis **tidak bisa ditebak** dari indikator teknikal ini. Model tidak lebih baik dari tebakan dasar (Brier model tidak lebih kecil). Karena itu aplikasi menampilkan probabilitas sebagai gambaran statistik dan menandai keyakinannya "rendah". **Bukan saran keuangan.**

---

## 🤖 TranscriptBot

`shared/transcriptbot.js` adalah peringkas transkrip Bahasa Indonesia yang offline. Cara kerjanya:
- Membersihkan bahasa lisan dan mengubah angka dalam kata menjadi digit.
- Menilai kalimat dengan TextRank, lalu memilih kalimat dengan MMR supaya tidak berulang.
- Mendeteksi struktur daftar ("yang pertama… kedua…").

Dibanding peringkas lama (`node eval/run_eval.js`):

| Set uji | ROUGE-L lama | ROUGE-L TranscriptBot | Kata pengisi |
|---|---|---|---|
| 4 video (untuk menyetel) | 33,8 | **43,6** (+29%) | 3,8 → 0 |
| 2 video baru | 36,4 | **49,5** (+36%) | 4,5 → 0 |

---

## 📲 Aplikasi Android (APK)

1. Di HP, buka **https://github.com/airputihsegarmantap-blip/Transkripsi-/releases/tag/apk-terbaru** dan unduh **SiLengkap.apk**.
2. Buka file-nya. Kalau Android bertanya, izinkan **"Instal aplikasi tidak dikenal"**.
3. Dari aplikasi YouTube: **Bagikan → SiLengkap** untuk langsung mentranskripsi.

APK berjalan **tanpa server**. Subtitle YouTube, RSS berita, dan data pasar diambil langsung dari HP, hanya ke sumber yang ada di daftar izin (`android/.../Net.kt`).

Kalau sebelumnya sudah memasang TranskripKu, SiLengkap akan menggantikannya (paket aplikasinya sama).

## 🌐 Versi web & hosting gratis

```bash
pip install -r requirements.txt
python app.py            # buka http://localhost:5000
```

Server hanya bertugas:
- menyajikan file aplikasi,
- mengambil transkrip YouTube (`/api/transcribe`),
- meneruskan permintaan data dari sumber yang diizinkan (`/api/fetch`), karena aturan CORS melarang browser mengambilnya langsung.

Semua pengolahan dikerjakan RheusInterface di browser, sehingga server gratis tetap ringan.

**Hosting gratis:** repo ini berisi `Dockerfile` dan `render.yaml`.
- **Render:** New → Blueprint → pilih repo → Deploy.
- **Hugging Face Spaces:** SDK Docker, port 7860.
- **Koyeb:** builder Dockerfile, port 7860.

⚠️ YouTube sering memblokir IP server cloud, sehingga transkripsi di versi web hosting bisa gagal. Atasi dengan mengisi `YT_PROXY_URL` atau `WEBSHARE_PROXY_USERNAME`/`WEBSHARE_PROXY_PASSWORD`, atau pakai APK. Menu berita dan Bitcoin tidak terpengaruh.

## Struktur

```
web/                    # antarmuka SiLengkap (HTML/CSS/JS) — dipakai web & APK
  app.js, silengkap.css, dino.js, vendor/phosphor (ikon, MIT)
shared/
  rheus.js              # RheusInterface
  transcriptbot.js      # TranscriptBot
android/                # pembungkus Android (Kotlin WebView + akses jaringan)
app.py, transcriber.py  # server web
eval/                   # uji TranscriptBot, uji RheusInterface, uji balik Bitcoin
```

## Pengujian

```bash
node eval/run_eval.js            # TranscriptBot vs peringkas lama (ROUGE)
node eval/rheus_test.js          # RheusInterface dengan data tiruan
node eval/rheus_test.js --live   # RheusInterface dengan sumber internet sungguhan
node eval/btc_backtest.js        # uji balik model Bitcoin
```

GitHub Actions menjalankan semuanya otomatis:
- `rheus.yml`: setiap perubahan dan setiap Senin, untuk mendeteksi sumber data yang rusak.
- `server.yml`: membangun dan menguji image Docker.
- `android.yml`: membangun APK dan menerbitkannya di Releases.
