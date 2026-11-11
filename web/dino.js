// Gim Dino SiLengkap — dipindahkan dari kode di desain SiLengkap.dc.html.
(function (root) {
  "use strict";

  function createDino(canvas, { onBest, getBest }) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, G = H - 40;
    const g = { y: 0, vy: 0, obs: [], speed: 6, t: 0, score: 0, state: "ready", next: 60 };
    let raf = null;

    const step = () => {
      if (g.state === "run") {
        g.t++; g.score += 0.15; g.speed = 6 + g.score / 120;
        g.vy -= 0.9; g.y = Math.max(0, g.y + g.vy); if (g.y === 0) g.vy = 0;
        if (--g.next <= 0) { const h = 26 + Math.random() * 30; g.obs.push({ x: W, w: 14 + Math.random() * 14, h }); g.next = 45 + Math.random() * 60; }
        g.obs.forEach((o) => (o.x -= g.speed)); g.obs = g.obs.filter((o) => o.x + o.w > 0);
        const dx = 70, dw = 34, dh = 40, dy = G - g.y - dh;
        if (g.obs.some((o) => o.x < dx + dw - 6 && o.x + o.w > dx + 6 && dy + dh > G - o.h + 4)) {
          g.state = "over";
          const s = Math.floor(g.score);
          if (s > getBest()) onBest(s);
        }
      }
      ctx.clearRect(0, 0, W, H);
      const gr = ctx.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, "rgba(233,233,237,0)"); gr.addColorStop(0.06, "rgba(233,233,237,.25)"); gr.addColorStop(0.94, "rgba(233,233,237,.25)"); gr.addColorStop(1, "rgba(233,233,237,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, G, W, 1);
      ctx.fillStyle = "rgba(147,151,171,.35)";
      for (let i = 0; i < 18; i++) { const x = (((i * 97 - g.t * g.speed * 0.6) % W) + W) % W; ctx.fillRect(x, G + 10 + (i % 3) * 7, 3 + (i % 4), 1); }
      ctx.fillStyle = "#9184d9"; ctx.shadowColor = "rgba(145,132,217,.6)"; ctx.shadowBlur = 12;
      g.obs.forEach((o) => { ctx.fillRect(o.x, G - o.h, o.w, o.h); ctx.fillRect(o.x - 6, G - o.h * 0.6, 6, 4); ctx.fillRect(o.x - 6, G - o.h * 0.6 - 10, 4, 12); });
      ctx.shadowBlur = 0;
      const dy = G - g.y - 40, leg = g.state === "run" && g.y === 0 && Math.floor(g.t / 5) % 2;
      ctx.fillStyle = "#e9e9ed";
      ctx.fillRect(86, dy, 22, 16); ctx.fillRect(74, dy + 12, 22, 20); ctx.fillRect(64, dy + 16, 12, 6); ctx.fillRect(96, dy + 20, 6, 3);
      ctx.fillRect(leg ? 78 : 80, dy + 32, 5, 8); ctx.fillRect(leg ? 90 : 88, dy + 32, 5, leg ? 5 : 8);
      ctx.fillStyle = "#161826"; ctx.fillRect(100, dy + 4, 3, 3);
      ctx.fillStyle = "#e9e9ed"; ctx.font = "500 16px Inter, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(String(Math.floor(g.score)).padStart(5, "0"), W - 20, 30);
      ctx.textAlign = "center";
      if (g.state !== "run") {
        ctx.font = "500 20px Inter, sans-serif"; ctx.fillText(g.state === "over" ? "Permainan selesai" : "Siap?", W / 2, H / 2 - 20);
        ctx.fillStyle = "#b2b6ca"; ctx.font = "400 14px Inter, sans-serif";
        ctx.fillText(g.state === "over" ? "Tekan Spasi atau ketuk untuk main lagi" : "Tekan Spasi atau ketuk untuk mulai", W / 2, H / 2 + 6);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return {
      jump() {
        if (g.state === "ready") { g.state = "run"; return; }
        if (g.state === "over") { Object.assign(g, { y: 0, vy: 0, obs: [], speed: 6, score: 0, state: "run", next: 60 }); return; }
        if (g.y === 0) g.vy = 15;
      },
      stop() { cancelAnimationFrame(raf); raf = null; },
    };
  }

  root.SiLengkapDino = { createDino };
})(window);
