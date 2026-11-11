#!/data/data/com.termux/files/usr/bin/bash
# Pemasang TranskripKu untuk Android (Termux).
# Pakai:  bash install-android.sh          -> pasang aplikasi (peringkas lokal)
#         bash install-android.sh --ai     -> + pasang AI lokal (Ollama + model kecil)
set -e
cd "$(dirname "$0")"

echo "==> Memperbarui paket Termux"
pkg update -y
pkg install -y python termux-api curl

echo "==> Memasang library Python"
pip install -r requirements.txt

if [ "$1" = "--ai" ]; then
  echo "==> Memasang Ollama + model ${OLLAMA_MODEL:-qwen2.5:1.5b} (±1 GB, butuh internet sekali saja)"
  pkg install -y ollama
  (ollama serve >/dev/null 2>&1 &)
  sleep 5
  ollama pull "${OLLAMA_MODEL:-qwen2.5:1.5b}"
fi

# Pintasan: ketik `transkripku` dari mana saja di Termux
mkdir -p "$PREFIX/bin"
cat > "$PREFIX/bin/transkripku" <<SH
#!/data/data/com.termux/files/usr/bin/bash
exec bash "$(pwd)/jalankan.sh" "\$@"
SH
chmod +x "$PREFIX/bin/transkripku" jalankan.sh

echo
echo "Selesai! Jalankan aplikasi dengan perintah:  transkripku"
