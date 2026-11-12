// Gim Sudoku SiLengkap — teka-teki baru setiap main, solusi dijamin tunggal.
(function (root) {
  "use strict";

  const LEVELS = { mudah: 38, sedang: 31, sulit: 26 }; // jumlah angka yang ditampilkan

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const ok = (g, i, v) => {
    const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3);
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
      if (g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === v) return false;
    }
    return true;
  };
  function solve(g, limit = 2) {
    // Backtracking dengan pilihan sel paling sedikit kemungkinan; mengembalikan jumlah solusi (maks limit).
    let best = -1, bestOpts = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const opts = [];
      for (let v = 1; v <= 9; v++) if (ok(g, i, v)) opts.push(v);
      if (!opts.length) return 0;
      if (!bestOpts || opts.length < bestOpts.length) { best = i; bestOpts = opts; if (opts.length === 1) break; }
    }
    if (best < 0) return 1;
    let count = 0;
    for (const v of bestOpts) {
      g[best] = v;
      count += solve(g, limit - count);
      g[best] = 0;
      if (count >= limit) break;
    }
    return count;
  }
  function fill(g) {
    const i = g.indexOf(0);
    if (i < 0) return true;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (ok(g, i, v)) { g[i] = v; if (fill(g)) return true; g[i] = 0; }
    }
    return false;
  }
  function generate(clues) {
    const sol = new Array(81).fill(0);
    fill(sol);
    const puz = sol.slice();
    let shown = 81;
    for (const i of shuffle([...Array(81).keys()])) {
      if (shown <= clues) break;
      const keep = puz[i];
      puz[i] = 0;
      if (solve(puz.slice()) !== 1) puz[i] = keep; else shown--;
    }
    return { sol, puz };
  }

  const sfx = (n) => root.SLAudio && root.SLAudio.sfx(n);

  function mount(el) {
    let level = "mudah", sol, given, cur, sel = -1, mistakes = 0, start = Date.now(), done = false, timer;

    function newGame(l = level) {
      level = l;
      const g = generate(LEVELS[level]);
      sol = g.sol; given = g.puz.map((v) => v !== 0); cur = g.puz.slice();
      sel = -1; mistakes = 0; start = Date.now(); done = false;
      root.SLAudio && root.SLAudio.music("chill");
      draw();
    }

    function draw() {
      const selV = sel >= 0 ? cur[sel] : 0;
      const cells = cur.map((v, i) => {
        const r = Math.floor(i / 9), c = i % 9;
        const same = sel >= 0 && (Math.floor(sel / 9) === r || sel % 9 === c || (Math.floor(Math.floor(sel / 9) / 3) === Math.floor(r / 3) && Math.floor((sel % 9) / 3) === Math.floor(c / 3)));
        const wrong = v && !given[i] && v !== sol[i];
        const bg = i === sel ? "var(--color-accent-700)" : selV && v === selV ? "var(--color-accent-900)" : same ? "var(--color-neutral-900)" : "var(--color-surface)";
        const bt = r % 3 === 0 ? 2 : 0.5, bl = c % 3 === 0 ? 2 : 0.5;
        return `<button data-cell="${i}" style="aspect-ratio:1;border:0;border-top:${bt}px solid var(--color-neutral-700);border-left:${bl}px solid var(--color-neutral-700);${r === 8 ? "border-bottom:2px solid var(--color-neutral-700);" : ""}${c === 8 ? "border-right:2px solid var(--color-neutral-700);" : ""}background:${bg};color:${wrong ? "var(--color-down)" : given[i] ? "var(--color-text)" : "var(--color-accent-300)"};font-size:clamp(15px,4.5vw,22px);font-weight:${given[i] ? 600 : 500};cursor:pointer;padding:0">${v || ""}</button>`;
      }).join("");
      el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div class="seg">${Object.keys(LEVELS).map((k) => `<label class="seg-opt ${k === level ? "on" : ""}"><input type="radio" name="sdlevel" value="${k}" ${k === level ? "checked" : ""}>${k[0].toUpperCase() + k.slice(1)}</label>`).join("")}</div>
          <span class="card-meta" style="margin-left:auto">Salah: ${mistakes} · <span id="sdTime">0:00</span></span>
        </div>
        <div style="max-width:440px;margin:12px auto 0">
          <div style="display:grid;grid-template-columns:repeat(9,1fr);border-radius:10px;overflow:hidden">${cells}</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="btn btn-secondary" data-num="${n}" style="height:46px;font-size:18px">${n}</button>`).join("")}
            <button class="btn btn-secondary" data-num="0" aria-label="Hapus" style="height:46px"><i class="ph ph-eraser"></i></button>
          </div>
          <p class="card-body" style="text-align:center;margin-top:12px">${done ? "🎉 Selesai! Teka-teki terpecahkan." : "Pilih kotak, lalu ketuk angka."}</p>
          <div style="text-align:center"><button class="btn btn-ghost" data-sd="new"><i class="ph ph-arrow-counter-clockwise"></i>Teka-teki baru</button></div>
        </div>`;
      tick();
    }
    function tick() {
      const t = document.getElementById("sdTime");
      if (!t) return;
      const s = Math.floor((Date.now() - start) / 1000);
      t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    timer = setInterval(() => { if (!done) tick(); }, 1000);

    function put(n) {
      if (sel < 0 || given[sel] || done) return;
      cur[sel] = n;
      if (n && n !== sol[sel]) { mistakes++; sfx("error"); } else sfx(n ? "place" : "click");
      if (cur.every((v, i) => v === sol[i])) { done = true; sfx("win"); root.SLAudio && root.SLAudio.stopMusic(); }
      draw();
    }

    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-cell]");
      if (c) { sel = +c.dataset.cell; sfx("click"); draw(); return; }
      const n = e.target.closest("[data-num]");
      if (n) { put(+n.dataset.num); return; }
      if (e.target.closest("[data-sd=new]")) newGame();
    });
    el.addEventListener("change", (e) => { if (e.target.name === "sdlevel") newGame(e.target.value); });
    const onKey = (e) => {
      if (/^[1-9]$/.test(e.key)) put(+e.key);
      else if (e.key === "Backspace" || e.key === "Delete") put(0);
    };
    document.addEventListener("keydown", onKey);
    newGame("mudah");
    return { destroy() { clearInterval(timer); root.SLAudio && root.SLAudio.stopMusic(); document.removeEventListener("keydown", onKey); el.innerHTML = ""; } };
  }

  root.SLGames = root.SLGames || {};
  root.SLGames.sudoku = { title: "Sudoku", mount, _generate: generate, _solve: solve };
})(window);
