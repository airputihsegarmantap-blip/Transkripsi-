// Data tiruan untuk menguji RheusInterface & antarmuka SiLengkap tanpa internet.
"use strict";
const NOW = Date.now();

function gnItem(title, src, minsAgo, related = 0) {
  const lis = Array.from({ length: related }, (_, i) => `<li><a href="x">${title} ${i}</a>&nbsp;&nbsp;<font>Media ${i}</font></li>`).join("");
  const esc = ("<ol>" + lis + "</ol>").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<item><title>${title} - ${src}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(title)}</link>` +
    `<pubDate>${new Date(NOW - minsAgo * 60000).toUTCString()}</pubDate><description>${esc}</description><source url="https://x">${src}</source></item>`;
}
const FIX = {
  "news.google.com/rss/search?q=kripto": `<rss><channel>${[
    gnItem("ETF Bitcoin catat arus masuk US$1,2 miliar dalam sepekan", "CNBC Indonesia", 30, 5),
    gnItem("Arus masuk ETF Bitcoin capai US$1,2 miliar sepekan", "Kontan", 50, 2),
    gnItem("Ethereum siapkan upgrade jaringan bulan depan", "Bisnis.com", 90, 1),
    gnItem("OJK terbitkan aturan baru pedagang aset kripto", "Kompas", 120, 3),
    gnItem("Harga Solana naik 8 persen hari ini", "Detik", 200, 0),
    gnItem("bundesliga viral rekomendasi", "Website Kabupaten Contoh", 10, 0),
  ].join("")}</channel></rss>`,
  "cnbcindonesia.com/market/rss": `<rss><channel><item><title><![CDATA[Bitcoin Tembus Level Baru, Investor Ritel Kembali]]></title><link>https://cnbc/1</link><pubDate>${new Date(NOW - 40 * 60000).toUTCString()}</pubDate><description><![CDATA[<img src="x"> Harga bitcoin kembali menguat seiring meningkatnya minat investor ritel di bursa lokal.]]></description></item><item><title>IHSG ditutup menguat</title><link>https://cnbc/2</link><pubDate>${new Date(NOW).toUTCString()}</pubDate><description>Saham bank naik.</description></item></channel></rss>`,
  "reddit.com/r/CryptoCurrency": `<feed><entry><title>Bitcoin ETF inflows hit 1.2 billion this week</title><link href="https://reddit/1"/><updated>${new Date(NOW).toISOString()}</updated><content>submitted by user</content></entry></feed>`,
};

function mockFetch(url) {
  for (const [k, v] of Object.entries(FIX)) if (url.includes(k)) return Promise.resolve(v);
  if (url.includes("kraken")) {
    const interval = +url.match(/interval=(\d+)/)[1];
    // Deret harga sintetis yang berakhir di sekitar 74.000 (sama dengan harga spot tiruan).
    let p = 74007 / Math.exp(720 * 0.0005);
    const rows = [];
    for (let i = 0; i < 720; i++) {
      const o = p;
      p *= Math.exp(0.0005 + 0.012 * Math.sin(i / 9) * (i % 3 === 0 ? 1 : -0.6));
      rows.push([Math.floor((NOW - (720 - i) * interval * 60000) / 1000), "" + o, "" + Math.max(o, p) * 1.01, "" + Math.min(o, p) * 0.99, "" + p, "0", "10", 5]);
    }
    return Promise.resolve(JSON.stringify({ error: [], result: { XXBTZUSD: rows, last: 1 } }));
  }
  if (url.includes("simple/price")) return Promise.resolve('{"bitcoin":{"usd":74007,"usd_24h_vol":28283954460.9,"usd_24h_change":1.13,"idr":1346530208}}');
  if (url.includes("alternative.me")) return Promise.resolve('{"data":[{"value":"29","value_classification":"Fear"}]}');
  if (url.includes("coingecko.com/api/v3/global")) return Promise.resolve('{"data":{"market_cap_percentage":{"btc":57.4}}}');
  if (url.includes("okx.com")) return Promise.resolve('{"code":"0","data":[{"fundingRate":"0.0000452"}]}');
  return Promise.reject(new Error("tidak ada fixture: " + url));
}

module.exports = { mockFetch, NOW };
