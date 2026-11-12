// Dino Lari — gim lari tanpa akhir SiLengkap (versi 2.0, di atas mesin SLEngine).
// Ketuk untuk melompat (ketuk lagi di udara = lompat ganda). Hindari kaktus & burung, ambil koin.
// Kecepatan naik terus, langit berganti siang ↔ malam.
(function (root) {
  "use strict";
  const { rand, clamp } = root.SLEngine;
  const W = 480, H = 270, G = 220;

  function jump(E) {
    const d = E.data, p = d.p;
    if (d.dead) return;
    if (p.y >= 0 && p.jumps === 0) { p.vy = -560; p.jumps = 1; E.sfx("jump"); E.burst(80, G, { color: "rgba(200,200,220,.6)", n: 5, speed: 60, life: 0.3, gravity: 0 }); }
    else if (p.jumps === 1) { p.vy = -470; p.jumps = 2; E.sfx("flap"); E.burst(80, G + p.y, { color: "#b9b0ec", n: 8, speed: 90, life: 0.35 }); }
  }

  const def = {
    id: "dino", title: "Dino Lari", tagline: "Lompat, hindari, lari sejauh mungkin", music: "runner", w: W, h: H,
    hint: "Ketuk untuk melompat; ketuk lagi di udara untuk lompat ganda. Tahan = jatuh lebih lambat.",
    keys: { jump: ["Space", "ArrowUp", "KeyW"] },
    reset(E) {
      Object.assign(E.data, { p: { y: 0, vy: 0, jumps: 0 }, obs: [], coins: [], next: 1, dist: 0, speed: 260, dead: false, mile: 100,
        clouds: Array.from({ length: 4 }, (_, i) => ({ x: i * 140 + rand(0, 60), y: rand(30, 110), s: rand(0.6, 1.1) })),
        stars: Array.from({ length: 30 }, () => ({ x: rand(0, W), y: rand(0, 150) })) });
      E.extra("");
    },
    tap: jump,
    onKey(E, code) { if (def.keys.jump.includes(code)) jump(E); },
    update(E, dt) {
      const d = E.data, p = d.p;
      if (d.dead) return;
      d.speed = Math.min(620, 260 + d.dist / 45);
      d.dist += d.speed * dt;
      const score = Math.floor(d.dist / 25) + (d.bonus || 0);
      if (score !== E.score) E.setScore(score);
      if (score >= d.mile) { d.mile += 100; E.sfx("level"); E.text(120, 80, score + "!", "#ffe28a", 22); }
      const hold = E.pointer.down || E.down("jump");
      p.vy += (p.vy > 0 && hold ? 1100 : 1700) * dt; p.y += p.vy * dt;
      if (p.y >= 0) { if (p.jumps) E.burst(80, G, { color: "rgba(200,200,220,.5)", n: 3, speed: 40, life: 0.2, gravity: 0 }); p.y = 0; p.vy = 0; p.jumps = 0; }
      for (const c of d.clouds) { c.x -= d.speed * 0.08 * c.s * dt; if (c.x < -80) { c.x = W + 40; c.y = rand(30, 110); } }
      d.next -= dt;
      if (d.next <= 0) {
        const bird = score > 150 && Math.random() < 0.28;
        if (bird) d.obs.push({ x: W + 30, w: 30, h: 18, y: G - (Math.random() < 0.5 ? 34 : 66), bird: true });
        else { const n = score > 250 && Math.random() < 0.35 ? 2 : 1; for (let i = 0; i < n; i++) { const h = rand(28, 52); d.obs.push({ x: W + 30 + i * 24, w: 16, h, y: G - h }); } }
        if (Math.random() < 0.45) { const cy = G - rand(60, 120); for (let i = 0; i < 3; i++) d.coins.push({ x: W + 130 + i * 26, y: cy - Math.sin(i / 2 * Math.PI) * 14 }); }
        d.next = rand(0.75, 1.5) * Math.max(0.62, 320 / d.speed + 0.25);
      }
      const px = 64, pw = 30, ph = 38, py = G + p.y - ph;
      for (const o of d.obs) {
        o.x -= d.speed * (o.bird ? 1.15 : 1) * dt;
        if (o.x < px + pw - 7 && o.x + o.w > px + 7 && o.y < py + ph - 4 && o.y + o.h > py + 6) {
          d.dead = true; E.sfx("hit"); E.shake(12);
          E.burst(80, py + 20, { colors: ["#e9e9ed", "#9184d9", "#ffb347"], n: 30, speed: 240 });
          return E.over({ sub: `Jarak ${Math.floor(d.dist / 25)} m` });
        }
      }
      d.obs = d.obs.filter((o) => o.x > -60);
      for (const c of d.coins) {
        c.x -= d.speed * dt;
        if (!c.t && Math.abs(c.x - (px + 15)) < 20 && Math.abs(c.y - (py + 19)) < 24) { c.t = true; d.bonus = (d.bonus || 0) + 5; E.sfx("coin"); E.text(c.x, c.y - 10, "+5", "#ffe28a", 14); E.burst(c.x, c.y, { color: "#ffd166", n: 6, speed: 80, life: 0.3 }); }
      }
      d.coins = d.coins.filter((c) => c.x > -20 && !c.t);
    },
    draw(E, c) {
      const d = E.data, p = d.p;
      const night = (Math.sin(d.dist / 2600 - 1.2) + 1) / 2; // 0 siang … 1 malam
      const mix = (a, b) => Math.round(a + (b - a) * night);
      const g = c.createLinearGradient(0, 0, 0, G);
      g.addColorStop(0, `rgb(${mix(96, 14)},${mix(165, 16)},${mix(235, 42)})`); g.addColorStop(1, `rgb(${mix(210, 52)},${mix(232, 44)},${mix(255, 96)})`);
      c.fillStyle = g; c.fillRect(-20, -20, W + 40, H + 40);
      c.fillStyle = "#fff"; c.globalAlpha = night * 0.9; for (const s of d.stars) c.fillRect(s.x, s.y, 1.6, 1.6);
      c.globalAlpha = 1;
      c.fillStyle = night > 0.5 ? "#f4f1d0" : "#ffe28a"; c.beginPath(); c.arc(400, 56, 18, 0, 7); c.fill();
      c.fillStyle = `rgba(255,255,255,${0.75 - night * 0.5})`;
      for (const cl of d.clouds) { c.beginPath(); c.ellipse(cl.x, cl.y, 30 * cl.s, 10 * cl.s, 0, 0, 7); c.ellipse(cl.x + 14 * cl.s, cl.y - 7 * cl.s, 18 * cl.s, 10 * cl.s, 0, 0, 7); c.fill(); }
      c.fillStyle = `rgb(${mix(120, 40)},${mix(170, 46)},${mix(140, 90)})`;
      c.beginPath(); c.moveTo(-20, G);
      for (let x = -20; x <= W + 20; x += 20) c.lineTo(x, G - 30 - Math.sin((x + d.dist * 0.2) / 80) * 20 - Math.sin((x + d.dist * 0.2) / 33) * 7);
      c.lineTo(W + 20, G); c.fill();
      c.fillStyle = `rgb(${mix(214, 58)},${mix(190, 54)},${mix(140, 84)})`; c.fillRect(-20, G, W + 40, H - G + 20);
      c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(-20, G, W + 40, 3);
      for (let i = 0; i < 16; i++) { const x = (((i * 61 - d.dist) % (W + 40)) + W + 40) % (W + 40) - 20; c.fillRect(x, G + 12 + (i % 3) * 10, 6 + (i % 4) * 2, 2); }
      for (const k of d.coins) { const w = Math.abs(Math.cos(E.t * 6 + k.x / 30)) * 6 + 1.5; c.fillStyle = "#ffd166"; c.beginPath(); c.ellipse(k.x, k.y, w, 7, 0, 0, 7); c.fill(); }
      for (const o of d.obs) {
        if (o.bird) {
          const f = Math.sin(E.t * 14) > 0;
          c.fillStyle = "#f08b8b"; c.beginPath(); c.ellipse(o.x + 15, o.y + 9, 13, 6, 0, 0, 7); c.fill();
          c.beginPath(); c.moveTo(o.x + 8, o.y + 8); c.lineTo(o.x + 18, o.y + (f ? -8 : 24)); c.lineTo(o.x + 22, o.y + 8); c.fill();
          c.fillStyle = "#ffb347"; c.beginPath(); c.moveTo(o.x + 2, o.y + 8); c.lineTo(o.x - 7, o.y + 10); c.lineTo(o.x + 2, o.y + 12); c.fill();
          c.fillStyle = "#12131d"; c.fillRect(o.x + 5, o.y + 6, 2.5, 2.5);
        } else {
          c.fillStyle = "#3f9d6c"; c.beginPath(); c.roundRect(o.x + 4, o.y, 8, o.h, 4); c.fill();
          c.beginPath(); c.roundRect(o.x - 3, o.y + o.h * 0.3, 5, o.h * 0.3, 2.5); c.roundRect(o.x - 3, o.y + o.h * 0.52, 9, 5, 2.5); c.fill();
          c.beginPath(); c.roundRect(o.x + 14, o.y + o.h * 0.18, 5, o.h * 0.3, 2.5); c.roundRect(o.x + 10, o.y + o.h * 0.4, 9, 5, 2.5); c.fill();
        }
      }
      if (!d.dead) {
        const y = G + p.y - 38, leg = p.y === 0 && Math.floor(E.t * 12) % 2;
        c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.ellipse(80, G + 3, 16 * clamp(1 + p.y / 200, 0.4, 1), 4, 0, 0, 7); c.fill();
        c.fillStyle = "#9184d9";
        c.beginPath(); c.roundRect(82, y, 22, 16, 5); c.fill();               // kepala
        c.beginPath(); c.roundRect(68, y + 12, 24, 20, 6); c.fill();          // badan
        c.beginPath(); c.moveTo(70, y + 16); c.lineTo(54, y + 22 + (p.y < 0 ? -6 : 0)); c.lineTo(70, y + 28); c.fill(); // ekor
        c.fillStyle = "#b9b0ec"; c.fillRect(76, y + 18, 12, 10);
        c.fillStyle = "#6f62c9"; c.fillRect(leg ? 72 : 74, y + 32, 6, p.y < 0 ? 4 : leg ? 6 : 4); c.fillRect(leg ? 84 : 82, y + 32, 6, p.y < 0 ? 4 : leg ? 4 : 6);
        c.fillStyle = "#fff"; c.fillRect(95, y + 3, 5, 5); c.fillStyle = "#12131d"; c.fillRect(97, y + 4, 2.5, 3);
      }
    },
  };
  // Rekor dari versi lama ikut dibawa.
  try { const old = +localStorage.getItem("silengkap-dino-best") || 0; if (old > (+localStorage.getItem("sl-best-dino") || 0)) localStorage.setItem("sl-best-dino", String(old)); } catch (e) { /* abaikan */ }
  root.SLGames = root.SLGames || {};
  root.SLGames.dino = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
