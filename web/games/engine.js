// SiLengkap Gim — mesin kecil untuk gim arkade: loop 60 fps tetap, kanvas tajam (DPR), input
// sentuh/geser/tombol layar/keyboard, partikel, guncangan layar, teks melayang, layar judul/jeda/
// selesai, rekor per gim, serta suara & musik (SLAudio) dengan tombol bisu.
(function (root) {
  "use strict";
  const AU = () => root.SLAudio || { sfx() {}, music() {}, stopMusic() {}, refresh() {} };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  /** Ubah gambar teks ("#"=warna utama, huruf lain dari palet) menjadi kanvas sprite. */
  function sprite(rows, scale, palette) {
    const c = document.createElement("canvas");
    c.width = rows[0].length * scale; c.height = rows.length * scale;
    const x = c.getContext("2d");
    rows.forEach((r, y) => [...r].forEach((ch, i) => {
      const col = palette[ch];
      if (col) { x.fillStyle = col; x.fillRect(i * scale, y * scale, scale, scale); }
    }));
    return c;
  }

  function create(el, def) {
    const W = def.w || 400, H = def.h || 600;
    const bestKey = "sl-best-" + def.id;
    el.innerHTML = `
      <div class="gx">
        <div class="gx-hud">
          <span class="gx-score">0</span>
          <span class="gx-best">Rekor ${+store.get(bestKey, 0)}</span>
          <span class="gx-extra"></span>
          <button class="gx-icon" data-gx="mute" aria-label="Suara"></button>
          <button class="gx-icon" data-gx="pause" aria-label="Jeda"><i class="ph-fill ph-pause"></i></button>
        </div>
        <div class="gx-stage"><canvas></canvas><div class="gx-overlay"></div></div>
        ${def.pad ? `<div class="gx-pad">${def.pad.map((p) => `<button class="gx-key ${p.wide ? "wide" : ""}" data-key="${p.id}" aria-label="${p.label}"><i class="ph-fill ${p.icon}"></i></button>`).join("")}</div>` : ""}
        <p class="gx-hint">${def.hint || ""}</p>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const canvas = $("canvas"), stage = $(".gx-stage"), overlay = $(".gx-overlay");
    const ctx = canvas.getContext("2d");

    const E = {
      W, H, ctx, t: 0, dt: 1 / 60, state: "title", score: 0, best: +store.get(bestKey, 0),
      keys: {}, pad: {}, edge: {}, pointer: { down: false, x: 0, y: 0, sx: 0, sy: 0 },
      parts: [], texts: [], shakeMag: 0, data: {},
      clamp, rand, sprite,
      sfx: (n) => AU().sfx(n),
      add(n, x, y, color) {
        this.score += n; scoreEl.textContent = this.score;
        scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump");
        if (x !== undefined) this.text(x, y, "+" + n, color || "#ffe28a");
      },
      setScore(n) { this.score = n; scoreEl.textContent = n; },
      extra(html) { $(".gx-extra").innerHTML = html; },
      shake(m) { this.shakeMag = Math.max(this.shakeMag, m); },
      burst(x, y, { color = "#fff", n = 14, speed = 160, life = 0.6, size = 3, gravity = 300, colors } = {}) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
          this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life, max: life, size: size * (0.6 + Math.random() * 0.8), color: colors ? colors[i % colors.length] : color, g: gravity });
        }
        if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
      },
      text(x, y, str, color = "#fff", size = 16) { this.texts.push({ x, y, str, color, size, life: 0.9 }); },
      banner(str, sub) { this.data._banner = { str, sub, life: 1.6 }; },
      down: (id) => !!(E.pad[id] || (def.keys && (def.keys[id] || []).some((k) => E.keys[k]))),
      hit: (id) => !!E.edge[id],
      over(info = {}) {
        if (this.state !== "play") return;
        this.state = "over";
        const isBest = this.score > this.best;
        if (isBest) { this.best = this.score; store.set(bestKey, String(this.best)); bestEl.textContent = "Rekor " + this.best; }
        AU().stopMusic();
        AU().sfx(info.win ? "win" : "lose");
        setTimeout(() => showOverlay("over", { ...info, isBest }), info.delay ?? 650);
      },
    };
    const scoreEl = $(".gx-score"), bestEl = $(".gx-best");

    // ---------------------------------------------------------------- ukuran kanvas
    function fit() {
      const dpr = Math.min(2.5, root.devicePixelRatio || 1);
      const maxH = Math.max(260, root.innerHeight * (def.pad ? 0.56 : 0.66));
      let cw = el.clientWidth || W;
      let ch = cw * H / W;
      if (ch > maxH) { ch = maxH; cw = ch * W / H; }
      canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
      stage.style.width = cw + "px";
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      E.scale = canvas.width / W;
    }
    fit();
    const ro = root.ResizeObserver ? new ResizeObserver(fit) : null;
    ro && ro.observe(el);

    // ---------------------------------------------------------------- layar judul/jeda/selesai
    function showOverlay(kind, info = {}) {
      overlay.className = "gx-overlay show " + kind;
      const medal = info.medal ? `<div class="gx-medal ${info.medal}"><i class="ph-fill ph-medal"></i>${{ bronze: "Perunggu", silver: "Perak", gold: "Emas" }[info.medal]}</div>` : "";
      overlay.innerHTML = kind === "title"
        ? `<div class="gx-title">${def.title}</div><div class="gx-sub">${def.tagline || ""}</div>
           <button class="gx-play" data-gx="start"><i class="ph-fill ph-play"></i>Main</button>
           ${E.best ? `<div class="gx-sub">Rekor: ${E.best}</div>` : ""}`
        : kind === "pause"
        ? `<div class="gx-title">Jeda</div><button class="gx-play" data-gx="resume"><i class="ph-fill ph-play"></i>Lanjut</button>
           <button class="gx-link" data-gx="restart">Ulang dari awal</button>`
        : `<div class="gx-title">${info.win ? info.title || "Menang!" : info.title || "Permainan selesai"}</div>
           ${info.isBest && E.score ? `<div class="gx-new">★ Rekor baru! ★</div>` : ""}${medal}
           <div class="gx-final">${E.score}</div><div class="gx-sub">${info.sub || `Rekor ${E.best}`}</div>
           <button class="gx-play" data-gx="restart"><i class="ph-bold ph-arrow-counter-clockwise"></i>Main lagi</button>`;
    }
    function hideOverlay() { overlay.className = "gx-overlay"; overlay.innerHTML = ""; }

    function start() {
      E.state = "play"; E.t = 0; E.parts = []; E.texts = []; E.data = {}; E.setScore(0); E.shakeMag = 0;
      def.reset(E);
      hideOverlay();
      AU().sfx("start");
      AU().music(def.music || "arcade");
    }
    function pause() {
      if (E.state !== "play") return;
      E.state = "pause"; AU().stopMusic(); showOverlay("pause");
    }
    function resume() { if (E.state !== "pause") return; E.state = "play"; hideOverlay(); AU().music(def.music || "arcade"); last = performance.now(); }

    // ---------------------------------------------------------------- input
    const toLogical = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
    const onDown = (e) => {
      e.preventDefault();
      const p = toLogical(e);
      Object.assign(E.pointer, { down: true, x: p.x, y: p.y, sx: p.x, sy: p.y, id: e.pointerId });
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      if (E.state === "title" || E.state === "over") return;
      if (E.state === "play" && def.tap) def.tap(E, p.x, p.y);
    };
    const onMove = (e) => {
      if (!E.pointer.down) return;
      const p = toLogical(e); E.pointer.x = p.x; E.pointer.y = p.y;
      if (def.swipe && E.state === "play") {
        const dx = p.x - E.pointer.sx, dy = p.y - E.pointer.sy;
        if (Math.hypot(dx, dy) > 22) { def.swipe(E, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); E.pointer.sx = p.x; E.pointer.sy = p.y; }
      }
    };
    const onUp = () => { E.pointer.down = false; if (def.release && E.state === "play") def.release(E); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const keyIds = (code) => Object.entries(def.keys || {}).filter(([, ks]) => ks.includes(code)).map(([id]) => id);
    const onKey = (e) => {
      const down = e.type === "keydown";
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (down && !E.keys[e.code]) {
        keyIds(e.code).forEach((id) => (E.edge[id] = true));
        if ((e.code === "Space" || e.code === "Enter") && (E.state === "title" || E.state === "over")) { start(); return; }
        if (e.code === "Escape" || e.code === "KeyP") { E.state === "play" ? pause() : resume(); return; }
        if (E.state === "play" && def.onKey) def.onKey(E, e.code);
      }
      E.keys[e.code] = down;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);

    el.querySelectorAll(".gx-key").forEach((b) => {
      const id = b.dataset.key;
      const on = (e) => { e.preventDefault(); if (!E.pad[id]) E.edge[id] = true; E.pad[id] = true; b.classList.add("on"); if (E.state === "title" || E.state === "over") start(); else if (def.onPad && E.state === "play") def.onPad(E, id); };
      const off = (e) => { e.preventDefault(); E.pad[id] = false; b.classList.remove("on"); if (def.release && E.state === "play") def.release(E, id); };
      b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    const muteBtn = $('[data-gx="mute"]');
    const renderMute = () => { const S = root.SLSettings || {}; muteBtn.innerHTML = `<i class="ph-fill ${S.sfx === false && S.music === false ? "ph-speaker-slash" : "ph-speaker-high"}"></i>`; };
    renderMute();
    const onClick = (e) => {
      const b = e.target.closest("[data-gx]");
      if (!b) { if (e.target.closest(".gx-overlay") && (E.state === "title" || E.state === "over")) start(); return; }
      const a = b.dataset.gx;
      if (a === "start" || a === "restart") start();
      else if (a === "resume") resume();
      else if (a === "pause") (E.state === "play" ? pause() : resume());
      else if (a === "mute") {
        const S = root.SLSettings;
        if (S) { const muted = S.sfx === false && S.music === false; S.set("sfx", muted); S.set("music", muted); }
        AU().refresh();
        if (S && S.music && E.state === "play") AU().music(def.music || "arcade");
        renderMute();
      }
    };
    el.addEventListener("click", onClick);
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVis);

    // ---------------------------------------------------------------- loop
    let raf = 0, last = performance.now(), acc = 0;
    function updateFx(dt) {
      for (const p of E.parts) { p.life -= dt; p.vx *= 0.985; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      E.parts = E.parts.filter((p) => p.life > 0);
      for (const t of E.texts) { t.life -= dt; t.y -= 40 * dt; }
      E.texts = E.texts.filter((t) => t.life > 0);
      E.shakeMag = Math.max(0, E.shakeMag - dt * 30);
      const b = E.data._banner; if (b) { b.life -= dt; if (b.life <= 0) E.data._banner = null; }
    }
    function drawFx() {
      for (const p of E.parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const t of E.texts) {
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.font = `800 ${t.size}px Inter, system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
      }
      const b = E.data._banner;
      if (b) {
        const a = Math.min(1, b.life * 2, (1.6 - b.life) * 4);
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(10,10,25,.55)"; ctx.fillRect(0, H * 0.4 - 34, W, b.sub ? 80 : 64);
        ctx.font = "900 30px Inter, system-ui, sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText(b.str, W / 2, H * 0.4);
        if (b.sub) { ctx.font = "600 14px Inter, system-ui, sans-serif"; ctx.fillStyle = "#c9c2ff"; ctx.fillText(b.sub, W / 2, H * 0.4 + 30); }
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      let el2 = Math.min(0.1, (now - last) / 1000); last = now;
      if (E.state === "play") {
        acc += el2;
        while (acc >= E.dt) {
          E.t += E.dt;
          def.update(E, E.dt);
          updateFx(E.dt);
          E.edge = {};
          acc -= E.dt;
          if (E.state !== "play") break;
        }
      } else { acc = 0; if (E.state === "over") updateFx(el2); }
      ctx.setTransform(E.scale, 0, 0, E.scale, 0, 0);
      if (E.shakeMag > 0) ctx.translate(rand(-1, 1) * E.shakeMag, rand(-1, 1) * E.shakeMag);
      def.draw(E, ctx);
      drawFx();
    }
    if (def.reset) def.reset(E);
    showOverlay("title");
    raf = requestAnimationFrame(frame);

    return {
      E,
      destroy() {
        cancelAnimationFrame(raf);
        ro && ro.disconnect();
        AU().stopMusic();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("keyup", onKey);
        document.removeEventListener("visibilitychange", onVis);
        el.removeEventListener("click", onClick);
        el.innerHTML = "";
      },
    };
  }

  root.SLEngine = { create, sprite, clamp, rand };
})(window);
