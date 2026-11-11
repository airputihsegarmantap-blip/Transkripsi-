# TranskripKu

<img src="static/icon-192.png" alt="Logo TranskripKu" width="96">

Aplikasi untuk **mentranskripsi video YouTube berbahasa Indonesia secara otomatis** dan langsung membuat **ringkasannya** dengan **TranscriptBot**, mesin peringkas buatan sendiri yang berjalan offline, gratis, dan tanpa API key.

Tersedia dalam dua bentuk:
- **Aplikasi Android (APK)**: tanpa server, subtitle diambil langsung dari HP.
- **Aplikasi web**: bisa dihosting gratis secara online (Render, Koyeb, Hugging Face Spaces) atau dijalankan di komputer/HP sendiri.

## Fitur

- Tempel link YouTube atau **bagikan langsung dari aplikasi YouTube** (Bagikan → TranskripKu).
- Urutan pengambilan transkrip:
  1. subtitle Indonesia buatan kreator,
  2. subtitle Indonesia otomatis dari YouTube,
  3. subtitle bahasa lain yang diterjemahkan ke Indonesia.
- Ringkasan berisi ringkasan singkat, poin-poin utama (dengan stempel waktu yang bisa diklik), kesimpulan, dan kata kunci.
- Transkrip lengkap dengan stempel waktu, plus tombol salin, bagikan, dan unduh.

---

## 🤖 TranscriptBot

Mesin peringkas di `shared/transcriptbot.js`. Satu file yang sama dipakai oleh APK dan versi web. Ukurannya ±28 KB, JavaScript murni, tanpa model AI.

Cara kerjanya:
1. **Membersihkan bahasa lisan**: membuang kata pengisi ("eh", "gitu", "ya kan", "guys"), kata yang terulang, dan mengubah kata tidak baku ("nggak" → "tidak", "aja" → "saja").
2. **Mengubah angka dalam kata menjadi digit**: "lima puluh tiga puluh dua puluh" → "50/30/20", "lima puluh persen" → "50%", "tiga sampai enam" → "3–6".
3. **Memotong kalimat** dari subtitle tanpa tanda baca memakai penanda wacana ("yang kedua", "jadi", "setelah itu") dan kata kerja langkah ("tambahkan", "masukkan").
4. **Menilai kalimat** dengan **TextRank** (PageRank di graf kemiripan TF-IDF), ditambah bobot frasa kunci, kata judul, dan informasi konkret (angka, takaran). Basa-basi pembuka dan penutup diberi nilai rendah.
5. **Memilih kalimat dengan MMR** supaya poin tidak saling mengulang dan tersebar di seluruh video.
6. **Mendeteksi struktur daftar** ("yang pertama… kedua… ketiga…") lalu menyajikannya sebagai daftar bernomor.
7. **Merapikan kalimat**: memendekkan di batas klausa, membuang penutup video, dan membuat kalimat pembuka "Video ini membahas …".

### Hasil uji

Uji ada di folder `eval/`, dijalankan dengan `node eval/run_eval.js`. Ringkasan dibandingkan dengan ringkasan acuan tulisan manusia memakai **ROUGE** (semakin tinggi semakin baik).

| Set uji | Mesin | ROUGE-1 | ROUGE-2 | ROUGE-L | Kata pengisi | Pengulangan |
|---|---|---|---|---|---|---|
| 4 video (dipakai untuk menyetel) | Peringkas lama | 45,7 | 24,2 | 33,8 | 3,8 | 25,8% |
| | **TranscriptBot** | **54,3** | **28,5** | **43,6** | **0** | **13,1%** |
| 2 video baru (tidak pernah dipakai menyetel) | Peringkas lama | 49,0 | 29,0 | 36,4 | 4,5 | 28,8% |
| | **TranscriptBot** | **55,5** | **37,3** | **49,5** | **0** | **21,2%** |

Batas atas teoretis (`node eval/oracle.js`) untuk peringkas yang memilih kalimat dari transkrip adalah ROUGE-2 ≈ 38. Artinya angka TranscriptBot sudah mendekati batas maksimal metode ini.

---

## 📲 Aplikasi Android (APK) — tanpa server

1. Di HP, buka **https://github.com/airputihsegarmantap-blip/Transkripsi-/releases/tag/apk-terbaru** dan unduh **TranskripKu.apk**.
2. Buka file APK-nya. Kalau Android bertanya, izinkan **"Instal aplikasi tidak dikenal"**.
3. Buka TranskripKu, tempel link YouTube, lalu ketuk **Proses**. Bisa juga dari aplikasi YouTube: **Bagikan → TranskripKu**.

Kode sumbernya ada di folder `android/`. APK dibangun otomatis oleh GitHub Actions setiap ada perubahan di `android/` atau `shared/`.

---

## 🌐 Hosting gratis secara online

Repo ini sudah berisi **`Dockerfile`** dan **`render.yaml`**, jadi bisa langsung dihosting.

### Pilihan A: Render (paling mudah)
1. Daftar di https://render.com memakai akun GitHub.
2. Klik **New → Blueprint**, pilih repo **Transkripsi-**. Render membaca `render.yaml` otomatis.
   (Atau **New → Web Service**, pilih repo, Runtime **Docker**, Instance type **Free**.)
3. Klik **Deploy**. Beberapa menit kemudian kamu mendapat alamat seperti `https://transkripku.onrender.com`.

Catatan paket gratis Render: server tidur setelah 15 menit tidak dipakai, dan bangun lagi dalam ±1 menit saat dibuka.

### Pilihan B: Hugging Face Spaces
1. Daftar di https://huggingface.co, lalu klik **New Space**, pilih SDK **Docker** dan hardware **CPU basic (free)**.
2. Upload isi repo ini, atau hubungkan lewat git. Port 7860 sudah diatur di `Dockerfile`.
3. Space akan dibangun otomatis dan bisa dibuka di `https://huggingface.co/spaces/<nama>/<space>`.

### Pilihan C: Koyeb
1. Daftar di https://www.koyeb.com, lalu klik **Create Web Service → GitHub**, pilih repo.
2. Builder **Dockerfile**, instance **Free**, port **7860**, lalu klik **Deploy**.

### ⚠️ Penting: YouTube sering memblokir IP server cloud
Di hosting, permintaan subtitle bisa ditolak YouTube ("YouTube memblokir permintaan dari server ini"). Solusinya:
- Atur proxy lewat environment variable di dashboard hosting:
  - `YT_PROXY_URL=http://user:pass@host:port` (proxy HTTP apa pun), atau
  - `WEBSHARE_PROXY_USERNAME` dan `WEBSHARE_PROXY_PASSWORD` (proxy residensial Webshare, berbayar murah).
- Atau pakai **APK Android**. APK mengambil subtitle langsung dari HP, jadi tidak kena blokir ini.

TranscriptBot sendiri berjalan di browser pengunjung, sehingga server gratis tidak terbebani proses peringkasan.

---

## 💻 Jalankan sendiri (komputer atau Termux)

```bash
pip install -r requirements.txt
python app.py            # buka http://localhost:5000
```

Di Android lewat Termux (alternatif dari APK):
```bash
pkg install -y git
git clone https://github.com/airputihsegarmantap-blip/Transkripsi-.git
cd Transkripsi-
bash install-android.sh
transkripku
```

## Konfigurasi

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `PORT` | `5000` (lokal) / `7860` (Docker) | Port server |
| `HOST` | `127.0.0.1` | Ganti ke `0.0.0.0` agar bisa dibuka dari perangkat lain |
| `YT_PROXY_URL` | – | Proxy untuk mengambil subtitle (berguna di hosting) |
| `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD` | – | Proxy residensial Webshare |

## Struktur

```
shared/transcriptbot.js  # TranscriptBot — dipakai APK & web
app.py, transcriber.py   # server web (ambil transkrip YouTube)
templates/, static/      # tampilan web, PWA
android/                 # aplikasi Android (Kotlin + WebView)
eval/                    # data uji & skrip evaluasi TranscriptBot
Dockerfile, render.yaml  # hosting gratis
```
