# TranskripKu

<img src="static/logo.jpg" alt="Logo TranskripKu" width="96">

Aplikasi web untuk **mentranskripsi video YouTube berbahasa Indonesia secara otomatis** dan langsung membuat **ringkasannya**.

## Fitur

- Tempel link YouTube (`youtube.com/watch`, `youtu.be`, `shorts`, `live`, atau ID video saja).
- Transkrip diambil otomatis dengan urutan prioritas:
  1. Subtitle Bahasa Indonesia buatan kreator
  2. Subtitle Bahasa Indonesia otomatis dari YouTube
  3. Subtitle bahasa lain yang diterjemahkan YouTube ke Bahasa Indonesia
  4. *(opsional)* Jika video tidak punya subtitle sama sekali, audio diunduh dan ditranskripsi dengan Whisper (`faster-whisper`)
- Ringkasan dalam Bahasa Indonesia dibuat oleh Claude dan muncul bertahap (streaming): ringkasan singkat, poin-poin utama, dan kesimpulan.
- Transkrip lengkap dengan stempel waktu. Klik waktunya untuk memutar video di detik tersebut.
- Tombol salin dan unduh `.txt` (berisi ringkasan + transkrip).

## Cara Menjalankan

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY="sk-ant-..."   # Windows: set ANTHROPIC_API_KEY=sk-ant-...
python app.py
```

Buka http://localhost:5000 di browser.

### Opsional: video tanpa subtitle

```bash
pip install faster-whisper
# juga butuh ffmpeg terpasang di sistem
```

Ukuran model bisa diatur dengan `WHISPER_MODEL` (`tiny`, `base`, `small` (bawaan), `medium`, `large-v3`).

## Konfigurasi

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | API key Claude (wajib untuk ringkasan) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model yang dipakai untuk meringkas |
| `WHISPER_MODEL` | `small` | Model Whisper untuk video tanpa subtitle |
| `PORT` | `5000` | Port server |

## Struktur

```
app.py            # server Flask + endpoint API
transcriber.py    # pengambilan transkrip (subtitle YouTube / Whisper)
summarizer.py     # ringkasan via Claude API (streaming)
templates/        # halaman web
static/           # logo, CSS, JavaScript
```

## Catatan

- YouTube kadang memblokir permintaan dari IP server/cloud. Jika muncul error `RequestBlocked`/`IpBlocked`, jalankan aplikasi dari komputer pribadi atau gunakan proxy.
- Untuk produksi, jalankan dengan server WSGI, misalnya `gunicorn -w 2 -b 0.0.0.0:5000 app:app`.
