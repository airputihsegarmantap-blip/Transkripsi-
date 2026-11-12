// Rheus Cloud: data siap pakai yang dikumpulkan GitHub Actions setiap 30 menit (branch `rheus-data`)
// dan disajikan lewat dua CDN. Aplikasi memakai yang paling cepat merespons.
window.SILENGKAP_CONFIG = {
  cloud: [
    "https://raw.githubusercontent.com/airputihsegarmantap-blip/Transkripsi-/rheus-data/v2/",
    "https://cdn.jsdelivr.net/gh/airputihsegarmantap-blip/Transkripsi-@rheus-data/v2/",
  ],
};
