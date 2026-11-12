/*
 * SiLengkap — Mode Baca untuk pembaca artikel di dalam aplikasi.
 * Disuntikkan ke halaman berita oleh ReaderActivity (Android) bersama Readability.js (Mozilla).
 * Menampilkan isi artikel yang bersih (tanpa iklan & menu) di atas halaman asli, tanpa merusaknya:
 * mematikan Mode Baca langsung mengembalikan halaman asli.
 */
(function () {
  "use strict";
  if (window.SLReader) return;
  const ID = "sl-reader-host";
  const host = () => document.getElementById(ID);
  const report = (ok, msg) => { try { window.SLHost && SLHost.onReader(!!ok, msg || ""); } catch (e) {} };

  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; z-index: 2147483647; overflow-y: auto; -webkit-overflow-scrolling: touch;
      background: #12131d; color: #e9e9ed; font: 18px/1.72 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: in .28s ease both; }
    @keyframes in { from { opacity: 0; transform: translateY(12px); } }
    article { max-width: 680px; margin: 0 auto; padding: 22px 20px 80px; }
    .site { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #b9b0ec; font-weight: 600; }
    h1 { font-size: 27px; line-height: 1.25; letter-spacing: -0.02em; margin: 10px 0 10px; font-weight: 600; }
    .meta { font-size: 13px; color: #9397ab; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid rgba(233,233,237,.1); }
    .content { color: #d9dae2; overflow-wrap: anywhere; }
    .content p { margin: 0 0 1.1em; }
    .content h2, .content h3, .content h4 { color: #e9e9ed; line-height: 1.3; margin: 1.4em 0 .5em; }
    .content a { color: #b9b0ec; }
    .content img, .content video, .content iframe, .content figure { max-width: 100% !important; height: auto !important; border-radius: 10px; }
    .content figure { margin: 1.2em 0; }
    .content figcaption { font-size: 13px; color: #9397ab; margin-top: 6px; }
    .content blockquote { margin: 1em 0; padding: .2em 0 .2em 16px; border-left: 3px solid #9184d9; color: #b2b6ca; }
    .content table { width: 100%; border-collapse: collapse; font-size: 15px; display: block; overflow-x: auto; }
    .content td, .content th { border: 1px solid rgba(233,233,237,.12); padding: 6px 8px; }
    .content pre { white-space: pre-wrap; background: #1b1d2b; padding: 12px; border-radius: 10px; font-size: 14px; }
    .wrap.light { background: #f7f6fb; color: #1d1b29; }
    .wrap.light h1 { color: #1d1b29; } .wrap.light .content { color: #2b2838; } .wrap.light .site, .wrap.light .content a { color: #5b4fb0; }
    .wrap.light .content h2, .wrap.light .content h3, .wrap.light .content h4 { color: #1d1b29; } .wrap.light .meta { border-color: rgba(0,0,0,.1); }
    .wrap.light .content pre { background: #ecebf3; }
    .end { margin-top: 30px; font-size: 12px; color: #6f7389; text-align: center; }
  `;

  function readingMinutes(text) { return Math.max(1, Math.round((text || "").split(/\s+/).length / 200)); }

  function open(quiet) {
    if (host()) return true;
    const fail = (m) => { if (!quiet) report(false, m); return false; };
    if (typeof Readability !== "function") return fail("Mode Baca tidak tersedia.");
    let a;
    try { a = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse(); } catch (e) { a = null; }
    if (!a || !a.content || (a.textContent || "").trim().length < 300) return fail("Halaman ini tidak berisi artikel yang bisa dibaca dalam Mode Baca.");
    const el = document.createElement("div");
    el.id = ID;
    const root = el.attachShadow({ mode: "open" });
    const siteName = a.siteName || location.hostname.replace(/^www\./, "");
    const meta = [a.byline, `${readingMinutes(a.textContent)} menit baca`].filter(Boolean).join(" · ");
    root.innerHTML = `<style>${CSS}</style><div class="wrap ${window.SL_READER_LIGHT ? "light" : ""}"><article>
      <div class="site"></div><h1></h1><div class="meta"></div><div class="content"></div>
      <div class="end">Mode Baca SiLengkap · isi dari ${location.hostname}</div></article></div>`;
    root.querySelector(".site").textContent = siteName;
    root.querySelector("h1").textContent = a.title || document.title;
    root.querySelector(".meta").textContent = meta;
    // Isi artikel sudah dibersihkan Readability (tanpa skrip); tetap buang skrip/atribut on* untuk berjaga-jaga.
    const content = root.querySelector(".content");
    content.innerHTML = a.content;
    content.querySelectorAll("script,style,link,noscript,form").forEach((n) => n.remove());
    content.querySelectorAll("*").forEach((n) => { for (const at of [...n.attributes]) if (/^on/i.test(at.name)) n.removeAttribute(at.name); });
    document.documentElement.appendChild(el);
    document.documentElement.dataset.slOverflow = document.documentElement.style.overflow || "";
    document.documentElement.style.overflow = "hidden";
    report(true);
    return true;
  }

  function close() {
    const el = host();
    if (!el) return false;
    el.remove();
    document.documentElement.style.overflow = document.documentElement.dataset.slOverflow || "";
    report(false, "");
    return true;
  }

  window.SLReader = {
    open, close,
    toggle() { return host() ? (close(), false) : open(false); },
    active: () => !!host(),
  };
})();
