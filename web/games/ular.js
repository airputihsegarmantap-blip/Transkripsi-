// Ular Neon — gim ular klasik versi SiLengkap. Geser layar (atau tombol panah) untuk berbelok.
// Makan buah agar memanjang; bintang bonus muncul sebentar dan bernilai besar.
(function (root) {
  "use strict";
  const N = 20, C = 20, W = N * C, H = N * C;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function free(d) {
    for (let i = 0; i < 500; i++) {
      const x = (Math.random() * N) | 0, y = (Math.random() * N) | 0;
      if (!d.snake.some((s) => s.x === x && s.y === y) && !(d.food && d.food.x === x && d.food.y === y)) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  function turn(E, name) {
    const d = E.data, nd = DIRS[name];
    if (!nd || d.queue.length >= 2) return;
    const last = d.queue.length ? d.queue[d.queue.length - 1] : d.dir;
    if (last[0] === -nd[0] && last[1] === -nd[1]) return;
    if (last[0] === nd[0] && last[1] === nd[1]) return;
    d.queue.push(nd);
  }

  const def = {
    id: "ular", title: "Ular Neon", tagline: "Makan, memanjang, jangan tabrak", music: "runner", w: W, h: H,
    hint: "Geser layar ke arah yang diinginkan, atau pakai tombol panah.",
    pad: [{ id: "left", label: "Kiri", icon: "ph-caret-left" }, { id: "up", label: "Atas", icon: "ph-caret-up" }, { id: "down", label: "Bawah", icon: "ph-caret-down" }, { id: "right", label: "Kanan", icon: "ph-caret-right" }],
    keys: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"] },
    reset(E) {
      const d = E.data;
      Object.assign(d, { snake: [{ x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }], dir: [1, 0], queue: [], acc: 0, eaten: 0, bonus: null, food: null, dead: false });
      d.food = free(d); E.extra("");
    },
    swipe: turn,
    onPad: turn,
    onKey(E, code) { for (const k in def.keys) if (def.keys[k].includes(code)) turn(E, k); },
    update(E, dt) {
      const d = E.data;
      if (d.dead) return;
      const interval = Math.max(0.07, 0.15 - d.eaten * 0.0025);
      if (d.bonus) { d.bonus.t -= dt; if (d.bonus.t <= 0) d.bonus = null; }
      d.acc += dt;
      while (d.acc >= interval) {
        d.acc -= interval;
        if (d.queue.length) d.dir = d.queue.shift();
        const h = { x: d.snake[0].x + d.dir[0], y: d.snake[0].y + d.dir[1] };
        if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || d.snake.slice(0, -1).some((s) => s.x === h.x && s.y === h.y)) {
          d.dead = true; E.sfx("hit"); E.shake(10);
          d.snake.forEach((s, i) => E.burst(s.x * C + 10, s.y * C + 10, { color: `hsl(${150 + i * 4} 70% 60%)`, n: 4, speed: 120 }));
          return E.over({ sub: `Panjang ular ${d.snake.length}` });
        }
        d.snake.unshift(h);
        let grow = false;
        if (h.x === d.food.x && h.y === d.food.y) {
          grow = true; d.eaten++; E.add(1, h.x * C + 10, h.y * C); E.sfx("eat");
          E.burst(h.x * C + 10, h.y * C + 10, { color: "#ff6b81", n: 8, speed: 100, life: 0.4 });
          d.food = free(d);
          if (d.eaten % 5 === 0) d.bonus = { ...free(d), t: 6 };
        } else if (d.bonus && h.x === d.bonus.x && h.y === d.bonus.y) {
          grow = true; E.add(5, h.x * C + 10, h.y * C, "#ffe28a"); E.sfx("power");
          E.burst(h.x * C + 10, h.y * C + 10, { color: "#ffe28a", n: 16, speed: 160 }); d.bonus = null;
        }
        if (!grow) d.snake.pop();
      }
    },
    draw(E, c) {
      const d = E.data;
      c.fillStyle = "#0d0f1f"; c.fillRect(-20, -20, W + 40, H + 40);
      c.fillStyle = "rgba(145,132,217,.07)";
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0) c.fillRect(x * C, y * C, C, C);
      c.strokeStyle = "rgba(145,132,217,.6)"; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
      const f = d.food, pulse = 1 + Math.sin(E.t * 8) * 0.12;
      c.fillStyle = "#ff6b81"; c.shadowColor = "#ff6b81"; c.shadowBlur = 12; c.beginPath(); c.arc(f.x * C + 10, f.y * C + 11, 7 * pulse, 0, 7); c.fill();
      c.shadowBlur = 0; c.fillStyle = "#7fd16b"; c.fillRect(f.x * C + 9, f.y * C + 1, 3, 5);
      if (d.bonus) {
        const b = d.bonus; c.save(); c.translate(b.x * C + 10, b.y * C + 10); c.rotate(E.t * 3); c.globalAlpha = b.t < 2 ? 0.4 + Math.abs(Math.sin(E.t * 12)) * 0.6 : 1;
        c.fillStyle = "#ffe28a"; c.shadowColor = "#ffe28a"; c.shadowBlur = 14; c.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, a = i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.fill(); c.restore(); c.shadowBlur = 0; c.globalAlpha = 1;
      }
      if (d.dead) return;
      for (let i = d.snake.length - 1; i >= 0; i--) {
        const s = d.snake[i];
        c.fillStyle = i === 0 ? "#a8f0c6" : `hsl(${150 + i * 4} 65% ${Math.max(38, 58 - i * 0.6)}%)`;
        c.beginPath(); c.roundRect(s.x * C + 1.5, s.y * C + 1.5, C - 3, C - 3, i === 0 ? 7 : 5); c.fill();
      }
      const h = d.snake[0], [dx, dy] = d.dir;
      c.fillStyle = "#12131d";
      c.beginPath(); c.arc(h.x * C + 10 + dx * 3 - dy * 4, h.y * C + 10 + dy * 3 - dx * 4, 2.2, 0, 7); c.arc(h.x * C + 10 + dx * 3 + dy * 4, h.y * C + 10 + dy * 3 + dx * 4, 2.2, 0, 7); c.fill();
    },
  };
  root.SLGames = root.SLGames || {};
  root.SLGames.ular = { title: def.title, mount: (el) => root.SLEngine.create(el, def), _def: def };
})(window);
