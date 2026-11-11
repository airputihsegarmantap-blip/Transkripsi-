// Service worker SiLengkap: menyimpan tampilan aplikasi agar cepat dibuka.
// Data (/api/...) selalu diambil langsung; RheusInterface punya cache sendiri.
const CACHE = "silengkap-v1";
const SHELL = ["./", "index.html", "silengkap.css", "vendor/phosphor/regular/style.css", "vendor/phosphor/fill/style.css", "app.js", "dino.js", "rheus.js", "transcriptbot.js", "icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
