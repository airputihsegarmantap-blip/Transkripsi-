// Kepak Sayap — gim "ketuk untuk terbang" orisinal SiLengkap.
// Ketuk untuk mengepak, lewati celah di antara pilar kristal, kumpulkan koin. Makin jauh makin cepat.
(function (root) {
  "use strict";
  const { rand, clamp } = root.SLEngine;
  const GROUND = 500;

  function flap(E) {
    const d = E.data;
    if (d.dead) return;
    d.started = true;
    d.b.vy = -400; d.wing = 1;
    E.sfx("flap");
    E.burst(92, d.b.y + 10, { color: "rgba(255,255,255,.7)", n: 3, speed: 60, life: 0.3, gravity: 0 });
  }
  function die(E) {
    const d = E.data;
    if (d.dead) return;
    d.dead = true;
    E.sfx("hit"); E.shake(10);
    E.burst(100, d.b.y, { colors: ["#b9b0ec", "#fff", "#ffd166"], n: 26, speed: 220 });
    const s = E.score;
    E.over({ medal: s >= 40 ? "gold" : s >= 20 ? "silver" : s >= 10 ? "bronze" : null, sub: s >= 10 ? `Rekor ${Math.max(E.best, s)}` : "Capai 10 untuk medali perunggu" });
  }

  const def = {
    id: "kepak", title: "Kepak Sayap", tagline: "Ketuk untuk terbang, jangan tabrak pilar", music: "chill", w: 360, h: 560,
    hint: "Ketuk layar (atau Spasi) untuk mengepak. Koin emas bernilai +3.",
    keys: { flap: ["Space", "ArrowUp", "KeyW"] },
    reset(E) {
      Object.assign(E.data, { b: { y: 250, vy: 0 }, gates: [], next: 1.2, started: false, dead: false, wing: 0, scroll: 0,
        clouds: Array.from({ length: 5 }, (_, i) => ({ x: i * 90 + rand(0, 40), y: rand(40, 220), s: rand(0.6, 1.2) })) });
      E.extra("");
    },
    tap: flap,
    onKey(E, code) { if (def.keys.flap.includes(code)) flap(E); },
    update(E, dt) {
      const d = E.data, b = d.b;
      const speed = Math.min(250, 150 + E.score * 2.2);
      d.wing = Math.max(0, d.wing - dt * 5);
      for (const c of d.clouds) { c.x -= speed * 0.15 * c.s * dt; if (c.x < -70) { c.x = 380; c.y = rand(40, 220); } }
      if (!d.started) { b.y = 250 + Math.sin(E.t * 4) * 8; d.scroll += speed * dt; return; }
      b.vy += 1350 * dt; b.y += b.vy * dt;
      if (d.dead) { if (b.y > GROUND - 14) { b.y = GROUND - 14; b.vy = 0; } return; }
      d.scroll += speed * dt;
      d.next -= dt;
      if (d.next <= 0) {
        const gap = Math.max(118, 160 - E.score * 0.9);
        const gy = clamp((d.gates.length ? d.gates[d.gates.length - 1].gy : 250) + rand(-150, 150), 110, GROUND - 110 - gap / 2);
        d.gates.push({ x: 400, gy, gap, coin: Math.random() < 0.35, passed: false });
        d.next = 215 / speed;
      }
      for (const g of d.gates) {
        g.x -= speed * dt;
        if (!g.passed && g.x + 28 < 100) { g.passed = true; E.add(1); E.sfx("coin"); }
        if (g.coin && Math.abs(g.x - 100) < 20 && Math.abs(g.gy - b.y) < 24) { g.coin = false; E.add(3, g.x, g.gy - 20); E.sfx("power"); E.burst(g.x, g.gy, { color: "#ffd166", n: 12 }); }
        if (100 + 12 > g.x - 28 && 100 - 12 < g.x + 28 && (b.y - 12 < g.gy - g.gap / 2 || b.y + 12 > g.gy + g.gap / 2)) die(E);
      }
      d.gates = d.gates.filter((g) => g.x > -40);
      if (b.y > GROUND - 14 || b.y < -30) die(E);
    },
    draw(E, c) {
      const d = E.data, b = d.b;
      const hue = (205 + E.score * 4) % 360;
      const g = c.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, `hsl(${hue} 55% 22%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 48%)`);
      c.fillStyle = g; c.fillRect(-20, -20, 400, 600);
      c.fillStyle = "rgba(255,255,255,.14)";
      for (const cl of d.clouds) { c.beginPath(); c.ellipse(cl.x, cl.y, 34 * cl.s, 12 * cl.s, 0, 0, 7); c.ellipse(cl.x + 16 * cl.s, cl.y - 8 * cl.s, 20 * cl.s, 12 * cl.s, 0, 0, 7); c.fill(); }
      c.fillStyle = `hsl(${(hue + 60) % 360} 35% 20% / .6)`;
      c.beginPath(); c.moveTo(-20, GROUND);
      for (let x = -20; x <= 380; x += 20) c.lineTo(x, GROUND - 60 - Math.sin((x + d.scroll * 0.25) / 55) * 26 - Math.sin((x + d.scroll * 0.25) / 23) * 10);
      c.lineTo(380, GROUND); c.fill();
      for (const p of d.gates) {
        const top = p.gy - p.gap / 2, bot = p.gy + p.gap / 2;
        const pg = c.createLinearGradient(p.x - 28, 0, p.x + 28, 0); pg.addColorStop(0, "#5b4fb0"); pg.addColorStop(0.45, "#b9b0ec"); pg.addColorStop(1, "#4a3f96");
        c.fillStyle = pg;
        c.fillRect(p.x - 24, -20, 48, top + 8); c.fillRect(p.x - 24, bot + 12, 48, GROUND - bot);
        c.beginPath(); c.moveTo(p.x - 30, top - 12); c.lineTo(p.x + 30, top - 12); c.lineTo(p.x + 22, top); c.lineTo(p.x - 22, top); c.fill();
        c.beginPath(); c.moveTo(p.x - 30, bot + 12); c.lineTo(p.x + 30, bot + 12); c.lineTo(p.x + 22, bot); c.lineTo(p.x - 22, bot); c.fill();
        c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(p.x - 16, -20, 5, top + 8); c.fillRect(p.x - 16, bot + 12, 5, GROUND - bot);
        if (p.coin) { const w = Math.abs(Math.cos(E.t * 5)) * 9 + 2; c.fillStyle = "#ffd166"; c.beginPath(); c.ellipse(p.x, p.gy, w, 11, 0, 0, 7); c.fill(); c.fillStyle = "#fff3c4"; c.fillRect(p.x - 1, p.gy - 6, 2, 12); }
      }
      c.fillStyle = "#2b2550"; c.fillRect(-20, GROUND, 400, 80);
      c.fillStyle = "#7fd1a8"; c.fillRect(-20, GROUND, 400, 8);
      c.fillStyle = "#5fb58c"; for (let x = -(d.scroll % 24) - 24; x < 380; x += 24) c.fillRect(x, GROUND, 12, 8);
      // burung
      c.save(); c.translate(100, b.y); c.rotate(clamp(b.vy / 600, -0.5, 1.2));
      c.fillStyle = "#b9b0ec"; c.beginPath(); c.ellipse(0, 0, 16, 13, 0, 0, 7); c.fill();
      c.fillStyle = "#e9e5ff"; c.beginPath(); c.ellipse(2, 4, 9, 7, 0, 0, 7); c.fill();
      c.fillStyle = "#7b6dd0"; c.beginPath(); c.ellipse(-5, 1 - d.wing * 7, 9, 5 + d.wing * 3, -0.4 + d.wing, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(8, -5, 5, 0, 7); c.fill();
      c.fillStyle = "#12131d"; c.beginPath(); c.arc(9.5, -5, 2.2, 0, 7); c.fill();
      c.fillStyle = "#ffb347"; c.beginPath(); c.moveTo(14, -1); c.lineTo(24, 2); c.lineTo(14, 6); c.fill();
      c.restore();
      if (!d.started && E.state === "play") { c.fillStyle = "#fff"; c.font = "700 16px Inter, sans-serif"; c.textAlign = "center"; c.globalAlpha = 0.6 + Math.sin(E.t * 5) * 0.4; c.fillText("Ketuk untuk terbang", 180, 330); c.globalAlpha = 1; }
    },
  };
  root.SLGames = root.SLGames || {};
  root.SLGames.kepak = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
