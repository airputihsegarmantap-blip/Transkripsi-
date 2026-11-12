// Pecah Bata — gim pantul bola & pecah bata orisinal SiLengkap.
// Geser papan, pantulkan bola, hancurkan semua bata. Ada power-up dan pola level yang berganti.
(function (root) {
  "use strict";
  const { rand, clamp } = root.SLEngine;
  const W = 400, H = 560, BW = 44, BH = 18, COLS = 8, OX = 8, OY = 64;
  const HUES = [350, 25, 48, 150, 195, 255, 300];
  const PATTERNS = [
    (r, c) => r < 5,
    (r, c) => r < 6 && (r + c) % 2 === 0,
    (r, c) => r < 6 && c >= r / 2 - 0.5 && c <= 7 - r / 2 + 0.5,
    (r, c) => r < 7 && r % 2 === 0,
    (r, c) => r < 6 && (c === 0 || c === 7 || r === 0 || r === 5 || (c > 2 && c < 5 && r > 1 && r < 4)),
  ];
  const hud = (E) => E.extra(`${"❤".repeat(Math.max(0, E.data.lives))} · L${E.data.level}`);

  function loadLevel(E, n) {
    const d = E.data;
    d.level = n; d.bricks = [];
    const pat = PATTERNS[(n - 1) % PATTERNS.length];
    for (let r = 0; r < 7; r++) for (let c = 0; c < COLS; c++) if (pat(r, c)) d.bricks.push({ x: OX + c * (BW + 4), y: OY + r * (BH + 4), hp: n >= 2 && r < Math.min(3, n - 1) ? 2 : 1, hue: HUES[r % HUES.length] });
    d.balls = [{ x: d.pad.x, y: 500, vx: 0, vy: 0, stuck: 0.9 }];
    d.pw = []; d.wide = 0; d.slow = 0;
    hud(E);
    if (n > 1) { E.banner("Level " + n); E.sfx("level"); }
  }
  const speedOf = (d) => (290 + d.level * 22) * (d.slow > 0 ? 0.7 : 1);
  function launch(d, b) { const a = rand(-0.5, 0.5); const s = speedOf(d); b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.stuck = 0; }

  const def = {
    id: "bata", title: "Pecah Bata", tagline: "Pantulkan bola, hancurkan semua bata", music: "arcade", w: W, h: H,
    hint: "Geser jari untuk menggerakkan papan. L = papan lebar, M = bola ganda, P = pelan, ❤ = nyawa.",
    keys: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    reset(E) { Object.assign(E.data, { pad: { x: 200 }, lives: 3 }); loadLevel(E, 1); },
    tap(E) { for (const b of E.data.balls) if (b.stuck) launch(E.data, b); },
    update(E, dt) {
      const d = E.data, pad = d.pad;
      d.wide = Math.max(0, d.wide - dt); d.slow = Math.max(0, d.slow - dt);
      const pw = d.wide > 0 ? 112 : 76;
      if (E.pointer.down) pad.x += (E.pointer.x - pad.x) * Math.min(1, dt * 22);
      pad.x += ((E.down("right") ? 1 : 0) - (E.down("left") ? 1 : 0)) * 420 * dt;
      pad.x = clamp(pad.x, pw / 2 + 4, W - pw / 2 - 4);
      const s = speedOf(d);
      for (const b of d.balls) {
        if (b.stuck) { b.x = pad.x; b.y = 500; b.stuck -= dt; if (b.stuck <= 0) launch(d, b); continue; }
        const v = Math.hypot(b.vx, b.vy) || 1; b.vx = b.vx / v * s; b.vy = b.vy / v * s;
        if (Math.abs(b.vy) < 70) b.vy = 70 * (b.vy < 0 ? -1 : 1);
        const steps = 2;
        for (let i = 0; i < steps && !b.dead; i++) {
          const px = b.x, py = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          if (b.x < 7) { b.x = 7; b.vx = Math.abs(b.vx); E.sfx("bounce"); }
          if (b.x > W - 7) { b.x = W - 7; b.vx = -Math.abs(b.vx); E.sfx("bounce"); }
          if (b.y < 44) { b.y = 44; b.vy = Math.abs(b.vy); E.sfx("bounce"); }
          if (b.vy > 0 && b.y + 6 >= 510 && py + 6 <= 514 && Math.abs(b.x - pad.x) < pw / 2 + 6) {
            const a = clamp((b.x - pad.x) / (pw / 2), -1, 1) * 1.05 + rand(-0.09, 0.09); // sedikit acak agar bola tidak terjebak lurus
            b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.y = 503;
            E.sfx("bounce"); E.burst(b.x, 510, { color: "#b9b0ec", n: 4, speed: 60, life: 0.25 });
          }
          for (const k of d.bricks) {
            if (k.hp <= 0 || b.x + 6 < k.x || b.x - 6 > k.x + BW || b.y + 6 < k.y || b.y - 6 > k.y + BH) continue;
            if (px + 6 <= k.x || px - 6 >= k.x + BW) b.vx = -b.vx; else b.vy = -b.vy;
            b.x = px; b.y = py;
            k.hp--; E.sfx("brick");
            if (k.hp <= 0) {
              E.add(10 * d.level, k.x + BW / 2, k.y); E.shake(2);
              E.burst(k.x + BW / 2, k.y + BH / 2, { color: `hsl(${k.hue} 80% 65%)`, n: 10, speed: 130 });
              if (Math.random() < 0.14) d.pw.push({ x: k.x + BW / 2, y: k.y, kind: "LMPH"[Math.random() < 0.08 ? 3 : (Math.random() * 3) | 0] });
            }
            break;
          }
          if (b.y > H + 12) b.dead = true;
        }
      }
      d.balls = d.balls.filter((b) => !b.dead);
      d.bricks = d.bricks.filter((k) => k.hp > 0);
      for (const w of d.pw) {
        w.y += 130 * dt;
        if (w.y > 500 && w.y < 524 && Math.abs(w.x - pad.x) < pw / 2 + 10) {
          w.dead = true; E.sfx("power");
          if (w.kind === "L") { d.wide = 12; E.text(pad.x, 480, "PAPAN LEBAR", "#7fd1a8", 13); }
          if (w.kind === "P") { d.slow = 8; E.text(pad.x, 480, "PELAN", "#7fd8ff", 13); }
          if (w.kind === "H") { d.lives = Math.min(5, d.lives + 1); hud(E); E.text(pad.x, 480, "+1 NYAWA", "#ff8a9a", 13); }
          if (w.kind === "M") { const src = d.balls.find((b) => !b.stuck) || d.balls[0]; if (src) for (const a of [-0.5, 0.5]) d.balls.push({ x: src.x, y: src.y, vx: Math.sin(a) * s, vy: -Math.cos(a) * s, stuck: 0 }); E.text(pad.x, 480, "BOLA GANDA", "#ffe28a", 13); }
        }
      }
      d.pw = d.pw.filter((w) => !w.dead && w.y < H + 20);
      if (!d.balls.length) {
        d.lives--; hud(E); E.sfx("hit"); E.shake(8);
        if (d.lives <= 0) return E.over({ sub: `Sampai level ${d.level}` });
        d.balls = [{ x: pad.x, y: 500, vx: 0, vy: 0, stuck: 0.9 }];
      }
      if (!d.bricks.length) { E.add(100 * d.level); loadLevel(E, d.level + 1); }
    },
    draw(E, c) {
      const d = E.data, pw = d.wide > 0 ? 112 : 76;
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#141530"); g.addColorStop(1, "#0b0c1a");
      c.fillStyle = g; c.fillRect(-20, -20, W + 40, H + 40);
      c.strokeStyle = "rgba(145,132,217,.08)"; c.lineWidth = 1;
      for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, H); c.stroke(); }
      c.fillStyle = "rgba(145,132,217,.35)"; c.fillRect(0, 38, W, 2);
      for (const k of d.bricks) {
        c.fillStyle = `hsl(${k.hue} 75% ${k.hp > 1 ? 42 : 60}%)`; c.beginPath(); c.roundRect(k.x, k.y, BW, BH, 4); c.fill();
        c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(k.x + 3, k.y + 2, BW - 6, 3);
        if (k.hp > 1) { c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.5; c.strokeRect(k.x + 3, k.y + 3, BW - 6, BH - 6); }
      }
      for (const w of d.pw) { c.fillStyle = { L: "#7fd1a8", M: "#ffe28a", P: "#7fd8ff", H: "#ff8a9a" }[w.kind]; c.beginPath(); c.roundRect(w.x - 13, w.y - 9, 26, 18, 9); c.fill(); c.fillStyle = "#12131d"; c.font = "800 12px Inter, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(w.kind === "H" ? "❤" : w.kind, w.x, w.y + 1); }
      const pg = c.createLinearGradient(0, 510, 0, 522); pg.addColorStop(0, "#b9b0ec"); pg.addColorStop(1, "#6f62c9");
      c.fillStyle = pg; c.shadowColor = "#9184d9"; c.shadowBlur = 14; c.beginPath(); c.roundRect(d.pad.x - pw / 2, 510, pw, 12, 6); c.fill();
      c.fillStyle = "#fff";
      for (const b of d.balls) { c.shadowColor = d.slow > 0 ? "#7fd8ff" : "#fff"; c.beginPath(); c.arc(b.x, b.y, 6, 0, 7); c.fill(); }
      c.shadowBlur = 0;
    },
  };
  root.SLGames = root.SLGames || {};
  root.SLGames.bata = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
