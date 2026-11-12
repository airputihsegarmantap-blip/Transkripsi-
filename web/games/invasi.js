// Invasi Galaksi — tembak-tembakan luar angkasa orisinal SiLengkap.
// Geser jari untuk menggerakkan pesawat (menembak otomatis). Gelombang makin sulit, ada penyerbu
// yang menukik, UFO bonus, dan power-up (tembakan ganda, perisai).
(function (root) {
  "use strict";
  const { sprite, clamp, rand } = root.SLEngine;
  const SHAPES = [
    ["..#...#..", ".#######.", "##o###o##", "#########", ".#.###.#.", "#.#...#.#", ".#.....#."],
    ["...###...", ".#######.", "#o##.##o#", "#########", "..#.#.#..", ".#.#.#.#.", "#.......#"],
    ["#...#...#", ".#######.", "##.o#o.##", ".#######.", "..##.##..", ".#.....#.", "..#...#.."],
  ];
  const COLORS = ["#7fd1a8", "#9184d9", "#f08bb4"];
  const SPR = SHAPES.map((s, i) => sprite(s, 3, { "#": COLORS[i], o: "#12131d" }));
  const AW = 27, AH = 21;

  function spawnWave(E) {
    const d = E.data;
    d.wave++;
    const rows = Math.min(3 + Math.floor(d.wave / 2), 6), cols = 7;
    d.al = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const type = r === 0 ? 2 : r < 3 ? 1 : 0;
      d.al.push({ gx: 46 + c * 44, gy: 70 + r * 34, x: 46 + c * 44 + rand(-80, 80), y: -40 - r * 40 - rand(0, 80), type, hp: type === 2 && d.wave >= 3 ? 2 : 1, dive: false, ph: rand(0, 6) });
    }
    d.fx = 0; d.fy = 0; d.dir = 1;
    E.banner("Gelombang " + d.wave, d.wave % 3 === 0 ? "Awas, mereka makin ganas!" : "");
    if (d.wave > 1) E.sfx("level");
  }

  function hurt(E) {
    const d = E.data, p = d.p;
    if (p.inv > 0) return;
    if (d.shield > 0) { d.shield = 0; p.inv = 1; E.sfx("hit"); E.burst(p.x, p.y, { color: "#7fd8ff", n: 20 }); return; }
    d.lives--; p.inv = 2.2;
    E.sfx("explode"); E.shake(12);
    E.burst(p.x, p.y, { colors: ["#fff", "#ffb347", "#ff5e5e"], n: 40, speed: 260, life: 0.9 });
    hud(E);
    if (d.lives <= 0) { p.dead = true; E.over({ sub: `Sampai gelombang ${d.wave}` }); }
  }
  const hud = (E) => E.extra(`${"❤".repeat(Math.max(0, E.data.lives))} · G${E.data.wave}`);

  const def = {
    id: "invasi", title: "Invasi Galaksi", tagline: "Pertahankan bumi dari gelombang penyerbu", music: "space", w: 400, h: 600,
    hint: "Geser jari di layar untuk bergerak — pesawat menembak otomatis. Ambil ⚡ dan 🛡.",
    keys: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    reset(E) {
      const d = E.data;
      Object.assign(d, { p: { x: 200, y: 548, cool: 0, inv: 0 }, lives: 3, wave: 0, bul: [], eb: [], pw: [], dbl: 0, shield: 0, ufo: null, ufoT: 12,
        stars: Array.from({ length: 70 }, () => ({ x: rand(0, 400), y: rand(0, 600), z: rand(0.3, 1) })) });
      spawnWave(E); hud(E);
    },
    update(E, dt) {
      const d = E.data, p = d.p;
      for (const s of d.stars) { s.y += 40 * s.z * dt; if (s.y > 600) { s.y = 0; s.x = rand(0, 400); } }
      // pemain
      if (!p.dead) {
        if (E.pointer.down) p.x += clamp(E.pointer.x - p.x, -520 * dt, 520 * dt);
        p.x += ((E.down("right") ? 1 : 0) - (E.down("left") ? 1 : 0)) * 300 * dt;
        p.x = clamp(p.x, 18, 382);
        p.inv = Math.max(0, p.inv - dt); d.dbl = Math.max(0, d.dbl - dt);
        p.cool -= dt;
        if (p.cool <= 0) {
          p.cool = 0.27;
          if (d.dbl > 0) { d.bul.push({ x: p.x - 9, y: p.y - 14 }, { x: p.x + 9, y: p.y - 14 }); } else d.bul.push({ x: p.x, y: p.y - 18 });
          E.sfx("shoot");
        }
      }
      for (const b of d.bul) b.y -= 560 * dt;
      d.bul = d.bul.filter((b) => b.y > -10 && !b.dead);
      // formasi
      const alive = d.al.length, total = 7 * Math.min(3 + Math.floor(d.wave / 2), 6);
      const sp = (18 + d.wave * 3) * (1 + 1.6 * (1 - alive / total));
      d.fx += d.dir * sp * dt;
      let minX = 1e9, maxX = -1e9, maxY = 0;
      for (const a of d.al) if (!a.dive) { minX = Math.min(minX, a.gx + d.fx); maxX = Math.max(maxX, a.gx + d.fx); maxY = Math.max(maxY, a.gy + d.fy); }
      if ((maxX > 380 && d.dir > 0) || (minX < 20 && d.dir < 0)) { d.dir *= -1; d.fy += 10; }
      for (const a of d.al) {
        a.ph += dt * 4;
        if (a.dive) {
          a.y += (150 + d.wave * 8) * dt; a.x += Math.sin(a.ph) * 120 * dt + clamp(p.x - a.x, -50, 50) * dt;
          if (a.y > 620) { a.y = -30; a.dive = false; }
        } else {
          const k = Math.min(1, dt * 5);
          a.x += (a.gx + d.fx - a.x) * k; a.y += (a.gy + d.fy - a.y) * k;
        }
        if (!p.dead && Math.abs(a.x - p.x) < 22 && Math.abs(a.y - p.y) < 20) { a.hp = 0; E.burst(a.x, a.y, { color: COLORS[a.type] }); hurt(E); }
      }
      if (maxY > 500 && !p.dead) { d.lives = 1; p.inv = 0; d.shield = 0; hurt(E); }
      // tembakan & tukikan musuh
      if (alive && !p.dead) {
        if (Math.random() < dt * (0.5 + d.wave * 0.14)) { const a = d.al[(Math.random() * alive) | 0]; if (a.y > 0) { d.eb.push({ x: a.x, y: a.y + 10, vy: 190 + d.wave * 10 }); E.sfx("laser"); } }
        if (d.wave >= 2 && Math.random() < dt * (0.12 + d.wave * 0.03)) { const a = d.al[(Math.random() * alive) | 0]; if (!a.dive && a.y > 40) a.dive = true; }
      }
      for (const b of d.eb) { b.y += b.vy * dt; if (!p.dead && Math.abs(b.x - p.x) < 13 && Math.abs(b.y - p.y) < 14) { b.dead = true; hurt(E); } }
      d.eb = d.eb.filter((b) => b.y < 610 && !b.dead);
      // peluru pemain vs musuh
      for (const b of d.bul) {
        for (const a of d.al) {
          if (a.hp > 0 && Math.abs(b.x - a.x) < AW / 2 + 2 && Math.abs(b.y - a.y) < AH / 2 + 4) {
            b.dead = true; a.hp--;
            if (a.hp <= 0) {
              E.add((a.type + 1) * 10 * (a.dive ? 2 : 1), a.x, a.y);
              E.burst(a.x, a.y, { color: COLORS[a.type], n: 16 }); E.sfx("pop"); E.shake(3);
              if (Math.random() < 0.09) d.pw.push({ x: a.x, y: a.y, kind: Math.random() < 0.55 ? "dbl" : "shield" });
            } else { E.sfx("brick"); E.burst(b.x, b.y, { color: "#fff", n: 4, speed: 80 }); }
            break;
          }
        }
        const u = d.ufo;
        if (u && !b.dead && Math.abs(b.x - u.x) < 22 && Math.abs(b.y - u.y) < 12) { b.dead = true; E.add(100, u.x, u.y, "#ff8ad8"); E.burst(u.x, u.y, { colors: ["#ff8ad8", "#fff"], n: 30, speed: 220 }); E.sfx("explode"); d.ufo = null; }
      }
      d.al = d.al.filter((a) => a.hp > 0);
      // UFO bonus
      d.ufoT -= dt;
      if (!d.ufo && d.ufoT <= 0) { const dir = Math.random() < 0.5 ? 1 : -1; d.ufo = { x: dir > 0 ? -30 : 430, y: 36, vx: dir * 110 }; d.ufoT = rand(14, 22); }
      if (d.ufo) { d.ufo.x += d.ufo.vx * dt; if (d.ufo.x < -40 || d.ufo.x > 440) d.ufo = null; }
      // power-up
      for (const w of d.pw) {
        w.y += 110 * dt;
        if (!p.dead && Math.abs(w.x - p.x) < 24 && Math.abs(w.y - p.y) < 22) {
          w.dead = true; E.sfx("power");
          if (w.kind === "dbl") { d.dbl = 9; E.text(p.x, p.y - 30, "TEMBAKAN GANDA", "#ffe28a", 13); } else { d.shield = 1; E.text(p.x, p.y - 30, "PERISAI", "#7fd8ff", 13); }
        }
      }
      d.pw = d.pw.filter((w) => w.y < 620 && !w.dead);
      if (!d.al.length && !p.dead) { E.add(50 * d.wave); spawnWave(E); hud(E); }
    },
    draw(E, c) {
      const d = E.data, p = d.p;
      const g = c.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, "#080a1c"); g.addColorStop(1, "#1a1338");
      c.fillStyle = g; c.fillRect(-20, -20, 440, 640);
      for (const s of d.stars) { c.globalAlpha = s.z; c.fillStyle = "#cfd3ff"; c.fillRect(s.x, s.y, s.z * 2, s.z * 2); }
      c.globalAlpha = 1;
      for (const a of d.al) { const bob = Math.sin(a.ph) * 2; c.globalAlpha = a.hp > 1 ? 1 : a.type === 2 && d.wave >= 3 ? 0.75 : 1; c.drawImage(SPR[a.type], a.x - AW / 2, a.y - AH / 2 + bob); }
      c.globalAlpha = 1;
      if (d.ufo) { const u = d.ufo; c.fillStyle = "#ff8ad8"; c.beginPath(); c.ellipse(u.x, u.y, 22, 8, 0, 0, 7); c.fill(); c.fillStyle = "#ffd6f1"; c.beginPath(); c.ellipse(u.x, u.y - 6, 10, 7, 0, Math.PI, 0); c.fill();
        c.fillStyle = "#fff"; for (let i = -1; i <= 1; i++) c.fillRect(u.x + i * 10 - 1.5, u.y - 1, 3, 3); }
      c.fillStyle = "#fff3a8"; c.shadowColor = "#ffe28a"; c.shadowBlur = 8;
      for (const b of d.bul) c.fillRect(b.x - 1.5, b.y - 7, 3, 12);
      c.fillStyle = "#ff6b6b"; c.shadowColor = "#ff6b6b";
      for (const b of d.eb) c.fillRect(b.x - 2, b.y - 5, 4, 10);
      c.shadowBlur = 0;
      for (const w of d.pw) { c.fillStyle = w.kind === "dbl" ? "#ffe28a" : "#7fd8ff"; c.beginPath(); c.arc(w.x, w.y, 11, 0, 7); c.fill(); c.fillStyle = "#12131d"; c.font = "800 13px Inter, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(w.kind === "dbl" ? "⚡" : "S", w.x, w.y + 1); }
      if (!p.dead && !(p.inv > 0 && Math.floor(E.t * 14) % 2)) {
        c.fillStyle = "#ffb347"; c.beginPath(); c.moveTo(p.x - 5, p.y + 12); c.lineTo(p.x, p.y + 20 + Math.random() * 8); c.lineTo(p.x + 5, p.y + 12); c.fill();
        c.fillStyle = "#e9e9ed"; c.beginPath(); c.moveTo(p.x, p.y - 18); c.lineTo(p.x + 7, p.y + 2); c.lineTo(p.x + 17, p.y + 12); c.lineTo(p.x - 17, p.y + 12); c.lineTo(p.x - 7, p.y + 2); c.closePath(); c.fill();
        c.fillStyle = "#9184d9"; c.beginPath(); c.ellipse(p.x, p.y - 3, 3.5, 7, 0, 0, 7); c.fill();
        if (d.shield > 0) { c.strokeStyle = "rgba(127,216,255,.8)"; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 26 + Math.sin(E.t * 6) * 1.5, 0, 7); c.stroke(); }
      }
      if (d.dbl > 0) { c.fillStyle = "#ffe28a"; c.fillRect(10, 590, 380 * d.dbl / 9, 3); }
    },
  };
  root.SLGames = root.SLGames || {};
  root.SLGames.invasi = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
