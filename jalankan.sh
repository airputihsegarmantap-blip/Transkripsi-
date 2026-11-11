#!/usr/bin/env bash
# Menjalankan server lokal TranskripKu lalu membuka aplikasinya di browser.
cd "$(dirname "$0")"
PORT="${PORT:-5000}"
URL="http://localhost:$PORT"

# Cegah Android mematikan server saat layar mati.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# Buka browser setelah server siap.
(
  for _ in $(seq 1 30); do
    curl -s -m 1 "$URL" >/dev/null 2>&1 && break
    sleep 0.5
  done
  if command -v termux-open-url >/dev/null 2>&1; then termux-open-url "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then open "$URL"
  fi
) &

echo "Tekan Ctrl+C untuk menghentikan server."
PORT="$PORT" python app.py
