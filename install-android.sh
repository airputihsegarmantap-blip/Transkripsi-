#!/data/data/com.termux/files/usr/bin/bash
# Pemasang TranskripKu untuk Android (Termux).
# Pakai:  bash install-android.sh
set -e
cd "$(dirname "$0")"

echo "==> Memperbarui paket Termux"
pkg update -y
pkg install -y python termux-api curl

echo "==> Memasang library Python"
pip install -r requirements.txt


# Pintasan: ketik `transkripku` dari mana saja di Termux
mkdir -p "$PREFIX/bin"
cat > "$PREFIX/bin/transkripku" <<SH
#!/data/data/com.termux/files/usr/bin/bash
exec bash "$(pwd)/jalankan.sh" "\$@"
SH
chmod +x "$PREFIX/bin/transkripku" jalankan.sh

echo
echo "Selesai! Jalankan aplikasi dengan perintah:  transkripku"
