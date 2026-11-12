// Gim Minesweeper SiLengkap — ketukan pertama selalu aman, mode bendera untuk layar sentuh.
(function (root) {
  "use strict";

  const LEVELS = { mudah: [9, 9, 10], sedang: [12, 12, 24], sulit: [16, 16, 40] };
  const NUM_COLOR = ["", "#9fb4ff", "#7fd1a8", "#f08b8b", "#c7a6ff", "#f0b86e", "#6fd6d6", "#e9e9ed", "#9397ab"];

  const sfx = (n) => root.SLAudio && root.SLAudio.sfx(n);

  function mount(el) {
    let level = "mudah", W, H, M, mines, open, flag, started, over, won, flagMode = false, t0 = 0, timer;

    function newGame(l = level) {
      level = l;
      [W, H, M] = LEVELS[level];
      mines = new Array(W * H).fill(false);
      open = new Array(W * H).fill(false);
      flag = new Array(W * H).fill(false);
      started = over = won = false;
      t0 = 0;
      root.SLAudio && root.SLAudio.music("chill");
      draw();
    }
    const nb = (i) => {
      const x = i % W, y = Math.floor(i / W), out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx);
      }
      return out;
    };
    const count = (i) => nb(i).filter((j) => mines[j]).length;

    function place(safe) {
      const forbid = new Set([safe, ...nb(safe)]);
      let n = 0;
      while (n < M) {
        const i = Math.floor(Math.random() * W * H);
        if (!mines[i] && !forbid.has(i)) { mines[i] = true; n++; }
      }
      started = true;
      t0 = Date.now();
    }
    function reveal(i) {
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        if (open[j] || flag[j]) continue;
        open[j] = true;
        if (!mines[j] && count(j) === 0) stack.push(...nb(j).filter((k) => !open[k]));
      }
    }
    function act(i, asFlag) {
      if (over) return;
      if (asFlag) { if (!open[i]) { flag[i] = !flag[i]; sfx("flag"); } draw(); return; }
      if (flag[i]) return;
      if (!started) place(i);
      if (open[i]) {
        // Ketuk angka yang benderanya sudah lengkap → buka tetangga.
        const n = nb(i);
        if (n.filter((j) => flag[j]).length === count(i)) n.forEach((j) => { if (!flag[j]) { if (mines[j]) over = true; reveal(j); } });
      } else if (mines[i]) {
        over = true; open[i] = true;
      } else reveal(i);
      if (over) { mines.forEach((m, k) => { if (m) open[k] = true; }); sfx("explode"); root.SLAudio && root.SLAudio.stopMusic(); el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 450); }
      else sfx("click");
      if (!over && open.filter((o, k) => !o && !mines[k]).length === 0) { over = won = true; sfx("win"); root.SLAudio && root.SLAudio.stopMusic(); }
      draw();
    }

    function draw() {
      const left = M - flag.filter(Boolean).length;
      const cells = mines.map((m, i) => {
        const o = open[i], c = o && !m ? count(i) : 0;
        const bg = o ? (m ? "color-mix(in srgb, var(--color-down) 35%, var(--color-surface))" : "var(--color-neutral-900)") : "var(--color-surface-2)";
        const content = flag[i] && !o ? `<i class="ph-fill ph-flag" style="color:var(--color-accent)"></i>` : o && m ? `<i class="ph-fill ph-bomb"></i>` : c ? c : "";
        return `<button data-ms="${i}" style="aspect-ratio:1;border:0;border-radius:4px;background:${bg};color:${NUM_COLOR[c] || "var(--color-text)"};font-weight:600;font-size:clamp(11px,3.4vw,16px);padding:0;cursor:pointer;${o ? "" : "box-shadow:inset 0 -2px 0 rgba(0,0,0,.35)"}">${content}</button>`;
      }).join("");
      el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div class="seg">${Object.keys(LEVELS).map((k) => `<label class="seg-opt ${k === level ? "on" : ""}"><input type="radio" name="mslevel" value="${k}" ${k === level ? "checked" : ""}>${k[0].toUpperCase() + k.slice(1)}</label>`).join("")}</div>
          <button class="btn ${flagMode ? "btn-primary" : "btn-secondary"}" data-msflag><i class="ph-fill ph-flag"></i>Mode bendera</button>
          <span class="card-meta" style="margin-left:auto"><i class="ph ph-bomb"></i> ${left} · <span id="msTime">0</span> dtk</span>
        </div>
        <div style="max-width:${W * 34}px;margin:12px auto 0;display:grid;grid-template-columns:repeat(${W},1fr);gap:3px">${cells}</div>
        <p class="card-body" style="text-align:center;margin-top:12px">${over ? (won ? "🎉 Menang! Semua ranjau ditemukan." : "💥 Kena ranjau.") : "Ketuk untuk membuka. Tahan lama atau pakai mode bendera untuk menandai ranjau."}</p>
        <div style="text-align:center"><button class="btn btn-ghost" data-msnew><i class="ph ph-arrow-counter-clockwise"></i>Main lagi</button></div>`;
    }
    timer = setInterval(() => {
      const t = document.getElementById("msTime");
      if (t && started && !over) t.textContent = Math.floor((Date.now() - t0) / 1000);
    }, 500);

    let press = null, longFired = false;
    el.addEventListener("pointerdown", (e) => {
      const c = e.target.closest("[data-ms]");
      if (!c) return;
      longFired = false;
      press = setTimeout(() => { longFired = true; act(+c.dataset.ms, true); }, 450);
    });
    el.addEventListener("pointerup", () => clearTimeout(press));
    el.addEventListener("pointerleave", () => clearTimeout(press));
    el.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-ms]")) e.preventDefault(); });
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-ms]");
      if (c) { if (!longFired) act(+c.dataset.ms, flagMode); return; }
      if (e.target.closest("[data-msflag]")) { flagMode = !flagMode; draw(); return; }
      if (e.target.closest("[data-msnew]")) newGame();
    });
    el.addEventListener("change", (e) => { if (e.target.name === "mslevel") newGame(e.target.value); });
    newGame("mudah");
    return { destroy() { clearInterval(timer); root.SLAudio && root.SLAudio.stopMusic(); el.innerHTML = ""; } };
  }

  root.SLGames = root.SLGames || {};
  root.SLGames.minesweeper = { title: "Minesweeper", mount };
})(window);
