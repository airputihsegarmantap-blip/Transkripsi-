// Gim Ular Tangga SiLengkap — papan 10×10, lawan komputer atau 2–4 pemain di satu HP.
(function (root) {
  "use strict";

  const LADDERS = { 3: 22, 8: 30, 28: 54, 36: 57, 51: 72, 58: 77, 71: 92, 80: 99 };
  const SNAKES = { 17: 4, 32: 10, 48: 26, 62: 19, 75: 53, 88: 67, 95: 56, 97: 78 };
  const COLORS = ["#9184d9", "#7fd1a8", "#f0b86e", "#f08b8b"];
  const NAMES = ["Kamu", "Komputer", "Pemain 3", "Pemain 4"];

  function cellXY(n) {
    // Petak 1 di kiri bawah, berkelok (boustrophedon).
    const r = Math.floor((n - 1) / 10), c = (n - 1) % 10;
    const col = r % 2 === 0 ? c : 9 - c;
    return { x: col, y: 9 - r };
  }

  function mount(el, { esc }) {
    let players = [], turn = 0, dice = null, busy = false, winner = null, log = [];
    let mode = "cpu";

    function newGame(m = mode) {
      mode = m;
      const count = mode === "cpu" ? 2 : +mode;
      players = Array.from({ length: count }, (_, i) => ({ name: mode === "cpu" ? NAMES[i] : `Pemain ${i + 1}`, pos: 0, color: COLORS[i], cpu: mode === "cpu" && i === 1 }));
      turn = 0; dice = null; winner = null; log = ["Permainan dimulai. Lempar dadu!"];
      draw();
    }

    function boardSVG() {
      const S = 36;
      let cells = "";
      for (let n = 1; n <= 100; n++) {
        const { x, y } = cellXY(n);
        const dark = (x + y) % 2 === 0;
        cells += `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="${dark ? "#1b1d2b" : "#222536"}"/>` +
          `<text x="${x * S + 3}" y="${y * S + 10}" font-size="8" fill="#6f7390">${n}</text>`;
      }
      const ctr = (n) => { const p = cellXY(n); return [p.x * S + S / 2, p.y * S + S / 2]; };
      let lines = "";
      for (const [a, b] of Object.entries(LADDERS)) {
        const [x1, y1] = ctr(+a), [x2, y2] = ctr(b);
        const dx = (y2 - y1) * 0.12, dy = (x1 - x2) * 0.12;
        lines += `<g stroke="#7fd1a8" stroke-width="2.5" stroke-linecap="round" opacity=".9"><line x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 - dx}" y2="${y2 - dy}"/><line x1="${x1 + dx}" y1="${y1 + dy}" x2="${x2 + dx}" y2="${y2 + dy}"/></g>`;
        for (let t = 0.15; t < 1; t += 0.17) {
          const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
          lines += `<line x1="${px - dx}" y1="${py - dy}" x2="${px + dx}" y2="${py + dy}" stroke="#7fd1a8" stroke-width="2"/>`;
        }
      }
      for (const [a, b] of Object.entries(SNAKES)) {
        const [x1, y1] = ctr(+a), [x2, y2] = ctr(b);
        const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25, my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
        lines += `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="#f08b8b" stroke-width="5" stroke-linecap="round" opacity=".85"/>` +
          `<circle cx="${x1}" cy="${y1}" r="5" fill="#f08b8b"/><circle cx="${x1 - 1.5}" cy="${y1 - 1.5}" r="1.2" fill="#12131d"/>`;
      }
      let tokens = "";
      players.forEach((p, i) => {
        if (!p.pos) return;
        const [cx, cy] = ctr(p.pos);
        const off = [[-7, -7], [7, -7], [-7, 7], [7, 7]][i];
        tokens += `<circle cx="${cx + off[0]}" cy="${cy + off[1]}" r="7" fill="${p.color}" stroke="#12131d" stroke-width="2"/>`;
      });
      return `<svg viewBox="0 0 ${S * 10} ${S * 10}" style="width:100%;max-width:520px;display:block;border-radius:12px;margin:0 auto">${cells}${lines}${tokens}</svg>`;
    }

    function draw() {
      const p = players[turn];
      el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div class="seg">${[["cpu", "Lawan komputer"], ["2", "2 pemain"], ["3", "3 pemain"], ["4", "4 pemain"]].map(([k, l]) =>
            `<label class="seg-opt ${mode === k ? "on" : ""}"><input type="radio" name="slmode" value="${k}" ${mode === k ? "checked" : ""}>${l}</label>`).join("")}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;margin-top:12px;align-items:start">
          <div class="card elev-md" style="padding:10px">${boardSVG()}</div>
          <div class="card elev-sm" style="gap:12px">
            ${players.map((pl, i) => `<div style="display:flex;align-items:center;gap:10px;font-size:14px;${i === turn && !winner ? "font-weight:600" : ""}">
              <span style="width:14px;height:14px;border-radius:50%;background:${pl.color}"></span>${esc(pl.name)}
              <span class="card-meta" style="margin-left:auto">petak ${pl.pos || "start"}</span></div>`).join("")}
            <div style="display:flex;align-items:center;gap:14px">
              <div style="width:64px;height:64px;border-radius:14px;background:var(--color-neutral-900);display:grid;place-items:center;font-size:30px;font-weight:600;box-shadow:inset 0 0 0 1px var(--color-border)">${dice ?? "–"}</div>
              ${winner ? `<button class="btn btn-primary" data-sl="new"><i class="ph ph-arrow-counter-clockwise"></i>Main lagi</button>`
                : `<button class="btn btn-primary" data-sl="roll" ${busy || p.cpu ? "disabled" : ""}><i class="ph ph-dice-five"></i>${p.cpu ? "Komputer melempar…" : "Lempar dadu"}</button>`}
            </div>
            <p class="card-body" style="min-height:3em">${esc(winner ? `🎉 ${winner.name} menang!` : log[log.length - 1])}</p>
            <span class="card-meta"><span style="color:#7fd1a8">▮</span> tangga naik · <span style="color:#f08b8b">●</span> ular turun · butuh angka pas untuk mencapai 100</span>
          </div>
        </div>`;
    }

    function step(p, to) {
      return new Promise((res) => {
        const t = setInterval(() => {
          if (p.pos === to) { clearInterval(t); res(); return; }
          p.pos += p.pos < to ? 1 : -1;
          draw();
        }, 110);
      });
    }

    async function roll() {
      if (busy || winner) return;
      busy = true;
      const p = players[turn];
      dice = 1 + Math.floor(Math.random() * 6);
      draw();
      const target = p.pos + dice;
      if (target > 100) {
        log.push(`${p.name} dapat ${dice}, terlalu jauh — tetap di petak ${p.pos}.`);
      } else {
        await step(p, target);
        let msg = `${p.name} dapat ${dice} → petak ${target}.`;
        if (LADDERS[target]) { p.pos = LADDERS[target]; msg += ` Naik tangga ke ${p.pos}!`; }
        else if (SNAKES[target]) { p.pos = SNAKES[target]; msg += ` Digigit ular, turun ke ${p.pos}.`; }
        log.push(msg);
        if (p.pos === 100) winner = p;
      }
      if (!winner && dice !== 6) turn = (turn + 1) % players.length;
      else if (!winner) log.push(log.pop() + " Dapat 6, lempar lagi!");
      busy = false;
      draw();
      if (!winner && players[turn].cpu) setTimeout(roll, 700);
    }

    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sl]");
      if (!b) return;
      if (b.dataset.sl === "roll") roll();
      if (b.dataset.sl === "new") newGame();
    });
    el.addEventListener("change", (e) => { if (e.target.name === "slmode") newGame(e.target.value); });
    newGame("cpu");
    return { destroy() { el.innerHTML = ""; } };
  }

  root.SLGames = root.SLGames || {};
  root.SLGames.snakes = { title: "Ular Tangga", mount };
})(window);
