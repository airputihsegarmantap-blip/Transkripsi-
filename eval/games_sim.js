// Uji gim: tiap gim dijalankan ribuan langkah dengan autopilot (butuh Playwright): node eval/games_sim.js
// Simulasi cepat (tanpa menunggu waktu nyata): jalankan update() ribuan langkah dengan autopilot.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "..", "web");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 860 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.route("**/*", async (r) => { const u = new URL(r.request().url()); const f = path.join(WEB, u.pathname); if (u.host !== "app.local" || !fs.existsSync(f)) return r.fulfill({ status: 404 }); r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html" }); });
  await p.goto("http://app.local/index.html#/games/bata"); await p.waitForTimeout(800);
  const out = await p.evaluate(() => {
    SLSettings.set("sfx", false); SLSettings.set("music", false);
    const res = {};
    const run = (id, steps, pilot) => {
      const def = SLGames[id]._def;
      const E = { W: def.w, H: def.h, t: 0, dt: 1 / 60, state: "play", score: 0, best: 0, keys: {}, pad: {}, edge: {}, pointer: { down: false, x: 0, y: 0 }, parts: [], texts: [], data: {},
        clamp: SLEngine.clamp, rand: SLEngine.rand, sfx() {}, add(n) { this.score += n; }, setScore(n) { this.score = n; }, extra() {}, shake() {}, burst() {}, text() {}, banner() {},
        down(k) { return !!this.pad[k]; }, hit(k) { return !!this.edge[k]; }, over(i) { this.state = "over"; this.info = i; } };
      def.reset(E);
      let n = 0;
      for (; n < steps && E.state === "play"; n++) { E.t += E.dt; E.edge = {}; pilot(E, def, n); def.update(E, E.dt); }
      return { steps: n, secs: Math.round(n / 60), score: E.score, state: E.state, lives: E.data.lives, level: E.data.level || E.data.wave };
    };
    // Pecah Bata: papan mengikuti bola → tidak boleh kehilangan nyawa, level harus naik.
    res.bata = run("bata", 60 * 240, (E) => { const d = E.data, bl = d.balls.reduce((a, c) => (c.y > a.y ? c : a), d.balls[0]); E.pointer.down = true; E.pointer.x = bl ? bl.x : 200; });
    // Invasi: bergerak ke kolom musuh terdekat sambil menghindari peluru.
    res.invasi = run("invasi", 60 * 180, (E) => { const d = E.data, p = d.p; const threat = d.eb.find((b) => Math.abs(b.x - p.x) < 26 && b.y > p.y - 200 && b.y < p.y); const tgt = d.al.length ? d.al.reduce((a, c) => (Math.abs(c.x - p.x) < Math.abs(a.x - p.x) ? c : a)) : null; E.pointer.down = true; E.pointer.x = threat ? p.x + (threat.x > p.x ? -70 : 70) : tgt ? tgt.x : 200; });
    // Kepak: jaga ketinggian di tengah celah berikutnya.
    res.kepak = run("kepak", 60 * 120, (E, def) => { const d = E.data, g = d.gates.find((g) => g.x > 70); const target = g ? g.gy + 14 : 250; if (!d.started || (d.b.y > target && d.b.vy > -100)) def.tap(E); });
    // Dino: lompat saat rintangan dekat.
    res.dino = run("dino", 60 * 120, (E, def) => { const d = E.data; const o = d.obs.find((o) => o.x > 60 && o.x < 64 + 30 + d.speed * 0.2); if (o && d.p.y === 0 && !(o.bird && o.y < 220 - 60)) def.tap(E); });
    // Ular: belok serong sederhana mengejar buah tanpa menabrak.
    res.ular = run("ular", 60 * 180, (E, def) => { const d = E.data, h = d.snake[0], f = d.food; const opts = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]].filter(([, dx, dy]) => { const x = h.x + dx, y = h.y + dy; return x >= 0 && y >= 0 && x < 20 && y < 20 && !d.snake.some((s) => s.x === x && s.y === y) && !(dx === -d.dir[0] && dy === -d.dir[1]); }); opts.sort((a, b) => (Math.abs(h.x + a[1] - f.x) + Math.abs(h.y + a[2] - f.y)) - (Math.abs(h.x + b[1] - f.x) + Math.abs(h.y + b[2] - f.y))); if (opts[0] && d.queue.length === 0) { const [n, dx, dy] = opts[0]; if (dx !== d.dir[0] || dy !== d.dir[1]) def.onPad(E, n); } });
    // Petualangan: lari kanan, lompat di tepi jurang / depan tembok / dekat musuh & paku.
    res.petualang = run("petualang", 60 * 240, (E) => { const d = E.data, p = d.p, T = 24; if (!p) return; const col = Math.floor((p.x + 14) / T), row = Math.floor((p.y + 21) / T); const s = (c, r) => r >= 0 && r < 14 && c < d.cols && d.map[r][c] === 1;
      const gapAhead = !s(col + 1, row) && !s(col + 1, row + 1) && !s(col + 1, row + 2), wall = s(col + 1, row - 1), spike = d.map[Math.min(13, Math.max(0, row - 1))][col + 1] === 2 || d.map[Math.min(13, Math.max(0, row - 1))][col + 2] === 2, foe = d.foes.some((f) => f.alive && f.x - p.x > 0 && f.x - p.x < 46 && Math.abs(f.y - p.y) < 30);
      E.pad.right = true; const want = p.ground && (gapAhead || wall || spike || foe); if (want && !E.pad.jump) E.edge.jump = true; E.pad.jump = want || (!p.ground && p.vy < 0); });
    // Level platformer harus bisa diselesaikan: jurang ≤ 4 petak, undakan ≤ 2 petak.
    const def = SLGames.petualang._def; let worstGap = 0, worstStep = 0;
    for (let lv = 1; lv <= 8; lv++) for (let k = 0; k < 40; k++) { const E = { data: {}, extra() {}, banner() {} }; def.reset(E); E.data.level = lv; const d = E.data;
      const top = (c) => { for (let r = 0; r < 14; r++) if (d.map[r][c] === 1 && r >= 8) return r; return -1; };
      let gap = 0, last = top(0); for (let c = 1; c < d.cols; c++) { const t = top(c); if (t < 0) { gap++; worstGap = Math.max(worstGap, gap); } else { if (last >= 0 && gap === 0) worstStep = Math.max(worstStep, last - t); gap = 0; last = t; } } }
    res.levels = { worstGap, worstStep };
    return res;
  });
  console.log(JSON.stringify(out, null, 1)); console.log("errors:", JSON.stringify(errs));
  await b.close();
})();
