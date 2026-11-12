// Petualangan Rheu — gim platformer orisinal SiLengkap.
// Lari, lompat, injak lendir, kumpulkan koin, capai bendera. Level dibuat acak dan makin sulit.
(function (root) {
  "use strict";
  const { rand, clamp } = root.SLEngine;
  const T = 24, ROWS = 14, W = 400, H = ROWS * T;
  const THEMES = [
    { sky: ["#3b6fd9", "#9fd3ff"], hill: "#5fb58c", dirt: "#8a5a3c", grass: "#7fd16b" },
    { sky: ["#3a1c5c", "#ff9a6b"], hill: "#7a4a7a", dirt: "#6b3f4a", grass: "#e0a04a" },
    { sky: ["#070b22", "#27306b"], hill: "#1f2a55", dirt: "#3a3f66", grass: "#6fd8c8" },
  ];
  const ri = (a, b) => Math.floor(rand(a, b + 1));

  function build(E, level) {
    const d = E.data;
    const cols = 110 + level * 12;
    const map = Array.from({ length: ROWS }, () => new Uint8Array(cols));
    const coins = [], foes = [];
    let g = 11, c = 0;
    const fill = (col, top) => { for (let r = top; r < ROWS; r++) map[r][col] = 1; };
    const flat = (n, opts = {}) => {
      const start = c;
      for (let i = 0; i < n && c < cols; i++, c++) fill(c, g);
      if (opts.foe && n >= 5) foes.push({ x: (start + ri(2, n - 2)) * T, y: g * T - 16, vx: (Math.random() < 0.5 ? -1 : 1) * (34 + level * 5), alive: true, sq: 0 });
      if (opts.coins) for (let i = 1; i < n - 1; i += 1) if (Math.random() < 0.5) coins.push({ x: (start + i) * T + 12, y: g * T - 16 });
      if (opts.spike && n >= 6 && level >= 2) map[g - 1][start + ri(2, n - 3)] = 2;
    };
    flat(9);
    while (c < cols - 14) {
      const k = Math.random();
      if (k < 0.24) { // jurang
        const n = ri(2, Math.min(4, 2 + Math.floor(level / 2)));
        for (let i = 0; i < n; i++) coins.push({ x: (c + i) * T + 12, y: (g - 3) * T - Math.sin((i + 0.5) / n * Math.PI) * 20 });
        c += n; flat(ri(3, 5));
      } else if (k < 0.44) { g = clamp(g + (Math.random() < 0.5 ? -1 : 1) * ri(1, 2), 8, 11); flat(ri(3, 6), { coins: true }); } // undakan
      else if (k < 0.64) { // platform melayang
        const n = ri(3, 4), start = c + 1, row = g - 3;
        flat(n + 3, { foe: Math.random() < 0.5 + level * 0.08 });
        for (let i = 0; i < n; i++) { map[row][start + i] = 1; coins.push({ x: (start + i) * T + 12, y: row * T - 14 }); }
      } else flat(ri(5, 9), { foe: Math.random() < 0.6 + level * 0.08, coins: Math.random() < 0.5, spike: Math.random() < 0.35 });
    }
    g = 11;
    while (c < cols) fill(c++, g);
    Object.assign(d, { map, cols, coins, foes, level, flagX: (cols - 5) * T, cam: 0, theme: THEMES[(level - 1) % THEMES.length], won: 0 });
    d.p = { x: 60, y: 11 * T - 20, vx: 0, vy: 0, w: 14, h: 20, ground: false, coyote: 0, buf: 0, inv: 0, face: 1, run: 0 };
    d.safe = { x: 60, y: 11 * T - 20 };
  }
  const solid = (d, col, row) => row >= 0 && row < ROWS && col >= 0 && col < d.cols && d.map[row][col] === 1;
  const tileAt = (d, x, y) => { const c = Math.floor(x / T), r = Math.floor(y / T); return r >= 0 && r < ROWS && c >= 0 && c < d.cols ? d.map[r][c] : 0; };
  const hud = (E) => E.extra(`${"❤".repeat(Math.max(0, E.data.lives))} · L${E.data.level}`);

  function hurt(E) {
    const d = E.data, p = d.p;
    if (p.inv > 0 || d.dead) return;
    d.lives--; hud(E);
    E.sfx("hit"); E.shake(8);
    E.burst(p.x + 7, p.y + 10, { colors: ["#b9b0ec", "#fff"], n: 20 });
    if (d.lives <= 0) { d.dead = true; E.over({ sub: `Sampai level ${d.level}` }); return; }
    Object.assign(p, { x: d.safe.x, y: d.safe.y, vx: 0, vy: 0, inv: 1.6 });
  }

  const def = {
    id: "petualang", title: "Petualangan Rheu", tagline: "Lari, lompat, dan capai bendera", music: "adventure", w: W, h: H,
    hint: "Tombol ◀ ▶ untuk bergerak, tombol besar untuk lompat (tahan = lebih tinggi). Injak lendir dari atas.",
    pad: [{ id: "left", label: "Kiri", icon: "ph-caret-left" }, { id: "right", label: "Kanan", icon: "ph-caret-right" }, { id: "jump", label: "Lompat", icon: "ph-arrow-fat-up", wide: true }],
    keys: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], jump: ["Space", "ArrowUp", "KeyW"] },
    reset(E) { E.data.lives = 3; E.data.dead = false; build(E, 1); hud(E); },
    update(E, dt) {
      const d = E.data, p = d.p;
      if (d.dead) return;
      if (d.won > 0) { d.won -= dt; if (d.won <= 0) { build(E, d.level + 1); hud(E); E.banner("Level " + d.level); } return; }
      p.inv = Math.max(0, p.inv - dt);
      const ax = (E.down("right") ? 1 : 0) - (E.down("left") ? 1 : 0);
      if (ax) { p.vx += ax * 900 * dt; p.face = ax; } else p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), 1000 * dt);
      p.vx = clamp(p.vx, -155, 155);
      p.coyote -= dt; p.buf -= dt;
      if (E.hit("jump")) p.buf = 0.13;
      if (p.buf > 0 && p.coyote > 0) { p.vy = -410; p.buf = 0; p.coyote = 0; E.sfx("jump"); E.burst(p.x + 7, p.y + 20, { color: "rgba(255,255,255,.6)", n: 5, speed: 50, life: 0.3, gravity: 0 }); }
      if (!E.down("jump") && p.vy < -170) p.vy = -170;
      p.vy = Math.min(620, p.vy + 1150 * dt);
      // sumbu X
      p.x += p.vx * dt;
      p.x = Math.max(0, p.x);
      for (const yy of [p.y + 1, p.y + p.h / 2, p.y + p.h - 1]) {
        if (p.vx > 0 && solid(d, Math.floor((p.x + p.w) / T), Math.floor(yy / T))) { p.x = Math.floor((p.x + p.w) / T) * T - p.w - 0.01; p.vx = 0; }
        if (p.vx < 0 && solid(d, Math.floor(p.x / T), Math.floor(yy / T))) { p.x = (Math.floor(p.x / T) + 1) * T + 0.01; p.vx = 0; }
      }
      // sumbu Y
      p.y += p.vy * dt; p.ground = false;
      for (const xx of [p.x + 1, p.x + p.w - 1]) {
        if (p.vy >= 0 && solid(d, Math.floor(xx / T), Math.floor((p.y + p.h) / T))) { p.y = Math.floor((p.y + p.h) / T) * T - p.h; p.vy = 0; p.ground = true; }
        if (p.vy < 0 && solid(d, Math.floor(xx / T), Math.floor(p.y / T))) { p.y = (Math.floor(p.y / T) + 1) * T; p.vy = 0; }
      }
      if (p.ground) {
        p.coyote = 0.1; p.run += Math.abs(p.vx) * dt;
        const col = Math.floor((p.x + p.w / 2) / T), row = Math.floor((p.y + p.h) / T);
        if (solid(d, col, row) && solid(d, col - 1, row) && solid(d, col + 1, row) && d.map[row - 1][col] !== 2) d.safe = { x: col * T + 4, y: p.y };
      }
      if (tileAt(d, p.x + p.w / 2, p.y + p.h - 4) === 2) hurt(E);
      if (p.y > H + 60) { p.inv = 0; hurt(E); }
      // koin
      for (const c of d.coins) if (!c.taken && Math.abs(c.x - (p.x + 7)) < 15 && Math.abs(c.y - (p.y + 10)) < 18) { c.taken = true; E.add(10, c.x, c.y - 8); E.sfx("coin"); E.burst(c.x, c.y, { color: "#ffd166", n: 6, speed: 90, life: 0.4 }); }
      // lendir
      for (const f of d.foes) {
        if (!f.alive) { f.sq -= dt; continue; }
        if (Math.abs(f.x - p.x) > 500) continue;
        f.x += f.vx * dt;
        const ahead = f.vx > 0 ? f.x + 18 : f.x, row = Math.floor((f.y + 17) / T);
        if (!solid(d, Math.floor(ahead / T), row) || solid(d, Math.floor(ahead / T), row - 1) || d.map[row - 1][Math.floor(ahead / T)] === 2) f.vx *= -1;
        if (p.x < f.x + 18 && p.x + p.w > f.x && p.y < f.y + 16 && p.y + p.h > f.y) {
          if (p.vy > 60 && p.y + p.h - f.y < 14) { f.alive = false; f.sq = 0.4; p.vy = E.down("jump") ? -410 : -280; E.add(50, f.x + 9, f.y - 6); E.sfx("pop"); E.burst(f.x + 9, f.y + 8, { color: "#f08bb4", n: 12 }); }
          else hurt(E);
        }
      }
      // bendera
      if (p.x + p.w > d.flagX && !d.won) { d.won = 1.6; E.add(200 + d.lives * 50, p.x, p.y - 20); E.sfx("level"); E.burst(d.flagX + 6, p.y, { colors: ["#ffd166", "#7fd1a8", "#f08bb4", "#fff"], n: 50, speed: 260, life: 1 }); }
      d.cam += (clamp(p.x - 150 + p.face * 30, 0, d.cols * T - W) - d.cam) * Math.min(1, dt * 6);
    },
    draw(E, c) {
      const d = E.data, p = d.p, th = d.theme, cam = Math.round(d.cam);
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      c.fillStyle = g; c.fillRect(-20, -20, W + 40, H + 40);
      c.fillStyle = th.hill; c.globalAlpha = 0.45;
      c.beginPath(); c.moveTo(-20, H);
      for (let x = -20; x <= W + 20; x += 16) c.lineTo(x, 210 - Math.sin((x + cam * 0.3) / 70) * 34 - Math.sin((x + cam * 0.3) / 31) * 12);
      c.lineTo(W + 20, H); c.fill(); c.globalAlpha = 1;
      c.save(); c.translate(-cam, 0);
      const c0 = Math.max(0, Math.floor(cam / T) - 1), c1 = Math.min(d.cols - 1, c0 + 19);
      for (let col = c0; col <= c1; col++) for (let r = 0; r < ROWS; r++) {
        const t = d.map[r][col];
        if (t === 1) {
          c.fillStyle = th.dirt; c.fillRect(col * T, r * T, T + 0.6, T + 0.6);
          if (r === 0 || d.map[r - 1][col] !== 1) { c.fillStyle = th.grass; c.fillRect(col * T, r * T, T + 0.6, 6); c.fillRect(col * T + 3, r * T + 6, 4, 3); c.fillRect(col * T + 14, r * T + 6, 5, 2); }
          else { c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(col * T + 5, r * T + 8, 4, 4); c.fillRect(col * T + 15, r * T + 16, 3, 3); }
        } else if (t === 2) { c.fillStyle = "#d9dbe8"; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(col * T + i * 8, (r + 1) * T); c.lineTo(col * T + i * 8 + 4, r * T + 8); c.lineTo(col * T + i * 8 + 8, (r + 1) * T); c.fill(); } }
      }
      for (const k of d.coins) if (!k.taken && k.x > cam - 20 && k.x < cam + W + 20) { const w = Math.abs(Math.cos(E.t * 5 + k.x)) * 6 + 1.5; c.fillStyle = "#ffd166"; c.beginPath(); c.ellipse(k.x, k.y, w, 7, 0, 0, 7); c.fill(); }
      for (const f of d.foes) {
        if (!f.alive && f.sq <= 0) continue;
        const sq = f.alive ? 1 + Math.sin(E.t * 8 + f.x) * 0.08 : 0.3;
        c.fillStyle = "#f08bb4"; c.beginPath(); c.ellipse(f.x + 9, f.y + 16 - 8 * sq, 10, 8 * sq, 0, 0, 7); c.fill();
        if (f.alive) { c.fillStyle = "#fff"; c.fillRect(f.x + 4, f.y + 5, 4, 5); c.fillRect(f.x + 11, f.y + 5, 4, 5); c.fillStyle = "#12131d"; const e = f.vx > 0 ? 2 : 0; c.fillRect(f.x + 4 + e, f.y + 7, 2, 3); c.fillRect(f.x + 11 + e, f.y + 7, 2, 3); }
      }
      // bendera
      c.fillStyle = "#e9e9ed"; c.fillRect(d.flagX + 4, 11 * T - 96, 3, 96);
      c.fillStyle = "#ffd166"; c.beginPath(); c.moveTo(d.flagX + 7, 11 * T - 96); c.lineTo(d.flagX + 36 + Math.sin(E.t * 6) * 3, 11 * T - 86); c.lineTo(d.flagX + 7, 11 * T - 74); c.fill();
      // Rheu
      if (!d.dead && !(p.inv > 0 && Math.floor(E.t * 14) % 2)) {
        const x = Math.round(p.x) - 2, y = Math.round(p.y), step = p.ground ? Math.floor(p.run / 9) % 2 : 0;
        c.fillStyle = "#9184d9"; c.fillRect(x + 2, y, 14, 14);
        c.fillStyle = "#b9b0ec"; c.fillRect(x + 2, y, 14, 4);
        c.fillStyle = "#fff"; c.fillRect(x + (p.face > 0 ? 9 : 4), y + 5, 5, 5);
        c.fillStyle = "#12131d"; c.fillRect(x + (p.face > 0 ? 12 : 4), y + 6, 2, 3);
        c.fillStyle = "#5b4fb0";
        if (!p.ground) { c.fillRect(x + 3, y + 14, 4, 4); c.fillRect(x + 11, y + 14, 4, 4); }
        else { c.fillRect(x + 3, y + 14, 4, step ? 6 : 4); c.fillRect(x + 11, y + 14, 4, step ? 4 : 6); }
      }
      c.restore();
    },
  };
  root.SLGames = root.SLGames || {};
  root.SLGames.petualang = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
