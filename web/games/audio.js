// SiLengkap Gim — audio chiptune buatan sendiri (WebAudio): efek suara & musik latar.
// Semua bunyi disintesis langsung (tanpa file audio) → APK tetap kecil & tanpa masalah hak cipta.
// Hormati pengaturan: SLSettings.sfx (efek) & SLSettings.music (musik).
(function (root) {
  "use strict";

  let ac = null, master, sfxBus, musBus, noiseBuf = null;
  const S = () => root.SLSettings || { sfx: true, music: true };

  function ctx() {
    if (!ac) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musBus = ac.createGain(); musBus.gain.value = 0.32; musBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function tone({ type = "square", f0, f1, dur = 0.1, vol = 0.25, attack = 0.004, delay = 0, bus }) {
    const a = ac, t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise({ dur = 0.1, vol = 0.2, f = 2000, f1, type = "lowpass", delay = 0, bus }) {
    const a = ac, t = a.currentTime + delay;
    const s = a.createBufferSource(), flt = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf;
    flt.type = type; flt.frequency.setValueAtTime(f, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt).connect(g).connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  const arp = (notes, step, opts) => notes.forEach((f, i) => tone({ f0: f, dur: step * 1.4, delay: i * step, ...opts }));

  const SFX = {
    jump: () => tone({ f0: 280, f1: 680, dur: 0.14, vol: 0.18 }),
    flap: () => { tone({ type: "triangle", f0: 520, f1: 880, dur: 0.09, vol: 0.22 }); noise({ dur: 0.05, vol: 0.06, f: 3000 }); },
    shoot: () => tone({ f0: 1100, f1: 240, dur: 0.07, vol: 0.07 }),
    laser: () => tone({ type: "sawtooth", f0: 420, f1: 140, dur: 0.14, vol: 0.06 }),
    explode: () => { noise({ dur: 0.45, vol: 0.35, f: 1600, f1: 90 }); tone({ type: "sine", f0: 140, f1: 35, dur: 0.35, vol: 0.3 }); },
    pop: () => { noise({ dur: 0.12, vol: 0.18, f: 2500, f1: 300 }); tone({ f0: 300, f1: 90, dur: 0.1, vol: 0.1 }); },
    hit: () => { noise({ dur: 0.18, vol: 0.25, f: 1200, f1: 200 }); tone({ f0: 220, f1: 70, dur: 0.18, vol: 0.18 }); },
    coin: () => { tone({ f0: 988, dur: 0.06, vol: 0.13 }); tone({ f0: 1319, dur: 0.2, vol: 0.13, delay: 0.06 }); },
    power: () => arp([523, 659, 784, 1047, 1319], 0.05, { vol: 0.12 }),
    bounce: () => tone({ type: "sine", f0: 420, f1: 520, dur: 0.06, vol: 0.2 }),
    brick: () => { tone({ f0: 700 + Math.random() * 300, dur: 0.05, vol: 0.1 }); noise({ dur: 0.05, vol: 0.08, f: 5000 }); },
    eat: () => tone({ f0: 560, f1: 1000, dur: 0.08, vol: 0.15 }),
    click: () => tone({ type: "triangle", f0: 900, dur: 0.03, vol: 0.12 }),
    place: () => tone({ type: "triangle", f0: 660, f1: 700, dur: 0.06, vol: 0.18 }),
    flag: () => tone({ type: "triangle", f0: 1200, f1: 1500, dur: 0.07, vol: 0.15 }),
    error: () => { tone({ f0: 180, dur: 0.12, vol: 0.12 }); tone({ f0: 150, dur: 0.16, vol: 0.12, delay: 0.1 }); },
    step: () => tone({ type: "triangle", f0: 500 + Math.random() * 200, dur: 0.03, vol: 0.08 }),
    dice: () => { for (let i = 0; i < 4; i++) noise({ dur: 0.04, vol: 0.12, f: 3500, type: "bandpass", delay: i * 0.06 }); },
    ladder: () => arp([392, 494, 587, 784, 988], 0.06, { type: "triangle", vol: 0.16 }),
    snake: () => tone({ type: "sawtooth", f0: 700, f1: 120, dur: 0.5, vol: 0.1 }),
    level: () => arp([523, 784, 659, 1047, 1319, 1568], 0.07, { vol: 0.12 }),
    win: () => { arp([523, 659, 784, 1047], 0.1, { vol: 0.13 }); tone({ f0: 1047, dur: 0.6, vol: 0.1, delay: 0.42 }); tone({ type: "triangle", f0: 523, dur: 0.6, vol: 0.12, delay: 0.42 }); },
    lose: () => { tone({ type: "sawtooth", f0: 440, f1: 110, dur: 0.7, vol: 0.12 }); tone({ f0: 330, f1: 82, dur: 0.7, vol: 0.06, delay: 0.05 }); },
    start: () => arp([392, 523, 659, 784], 0.06, { vol: 0.12 }),
  };

  // ------------------------------------------------------------------ musik
  // Lagu orisinal SiLengkap. Satu token = 1/8 ketuk; "-" = tahan nada sebelumnya; "." = diam.
  const TRACKS = {
    arcade: { bpm: 140, drum: "k h s h k k s h",
      lead: "E5 G5 C6 G5 E5 G5 C6 E6 D6 C6 B5 G5 A5 B5 C6 - E5 G5 C6 G5 E5 G5 C6 E6 F6 E6 D6 B5 C6 - - - A5 C6 F6 C6 A5 C6 F6 A6 G6 F6 E6 C6 D6 E6 F6 - E6 D6 C6 G5 A5 B5 C6 D6 E6 D6 B5 G5 C6 - - -",
      bass: "C3 . C4 . C3 . C4 . G2 . G3 . G2 . G3 . C3 . C4 . C3 . C4 . G2 . G3 . C3 . C4 . F2 . F3 . F2 . F3 . C3 . C4 . G2 . G3 . A2 . A3 . E2 . E3 . G2 . G3 . C3 . C3 ." },
    space: { bpm: 126, drum: "k h h s k h k s",
      lead: "A4 - C5 E5 A5 - G5 E5 F5 - E5 D5 E5 - - - A4 - C5 E5 A5 - B5 C6 B5 - G5 E5 G5 - - - F5 - A5 C6 F6 - E6 C6 D6 - C6 B5 C6 - A5 - G5 - B5 D6 G6 - F6 D6 E6 - - - E5 - - -",
      bass: "A2 A2 A3 A2 A2 A2 A3 A2 F2 F2 F3 F2 G2 G2 G3 G2 A2 A2 A3 A2 A2 A2 A3 A2 E2 E2 E3 E2 E2 E2 E3 E2 F2 F2 F3 F2 F2 F2 F3 F2 D2 D2 D3 D2 A2 A2 A3 A2 G2 G2 G3 G2 G2 G2 G3 G2 E2 E2 E3 E2 E2 E2 E3 E2" },
    chill: { bpm: 92, drum: "k . h . s . h .", soft: true,
      lead: "A5 - - C6 - - A5 - G5 - - F5 - - - - A5 - - C6 - - D6 - C6 - - - - - - - Bb5 - - D6 - - Bb5 - A5 - - G5 - - F5 - G5 - - A5 - - E5 - F5 - - - - - - -",
      bass: "F3 . C4 . F3 . C4 . C3 . G3 . C3 . G3 . D3 . A3 . D3 . A3 . A2 . E3 . A2 . E3 . Bb2 . F3 . Bb2 . F3 . F3 . C4 . F3 . C4 . C3 . G3 . C3 . G3 . F3 . C4 . F3 . . ." },
    adventure: { bpm: 124, drum: "k h s h k h s k",
      lead: "G5 - B5 D6 G6 - D6 B5 C6 - E6 - D6 - B5 - A5 - C6 E6 A6 - G6 E6 D6 - F#6 - G6 - - - E6 - D6 B5 C6 - A5 - B5 - G5 D5 G5 - B5 - A5 - B5 C6 D6 - E6 F#6 G6 - D6 - G5 - - -",
      bass: "G2 . G3 . G2 . G3 . C3 . C4 . C3 . C4 . A2 . A3 . A2 . A3 . D3 . D4 . D3 . D4 . C3 . C4 . A2 . A3 . G2 . G3 . G2 . G3 . D3 . D4 . D3 . D4 . G2 . G3 . G2 . . ." },
    runner: { bpm: 150, drum: "k h s h k k s h",
      lead: "D5 F5 A5 D6 C6 A5 F5 A5 Bb5 A5 G5 F5 E5 F5 G5 - D5 F5 A5 D6 C6 A5 F5 A5 G5 F5 E5 C5 D5 - - - F5 A5 C6 F6 E6 C6 A5 C6 G5 Bb5 D6 G6 F6 D6 Bb5 D6 E6 D6 C#6 A5 Bb5 A5 G5 E5 D5 - A5 - D6 - - -",
      bass: "D3 D3 D4 D3 D3 D3 D4 D3 Bb2 Bb2 Bb3 Bb2 C3 C3 C4 C3 D3 D3 D4 D3 D3 D3 D4 D3 A2 A2 A3 A2 D3 D3 D4 D3 F2 F2 F3 F2 F2 F2 F3 F2 G2 G2 G3 G2 G2 G2 G3 G2 A2 A2 A3 A2 A2 A2 A3 A2 D3 D3 D4 D3 D3 . . ." },
  };
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(tok) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(tok);
    if (!m) return null;
    return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  }
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  /** Ubah teks lagu jadi daftar [nada|null, panjang] per langkah. */
  function parse(str) {
    const toks = str.trim().split(/\s+/);
    return toks.map((t, i) => {
      if (t === "-" || t === ".") return null;
      let len = 1;
      while (toks[i + len] === "-") len++;
      return [midi(t), len];
    });
  }
  for (const k in TRACKS) { const tr = TRACKS[k]; tr._lead = parse(tr.lead); tr._bass = parse(tr.bass); tr._drum = tr.drum.split(" "); }

  let seq = null, wanted = null;
  function schedule() {
    if (!seq || !ac) return;
    const tr = seq.tr, step = 60 / tr.bpm / 2;
    while (seq.next < ac.currentTime + 0.15) {
      const i = seq.i, t0 = seq.next - ac.currentTime;
      const L = tr._lead[i % tr._lead.length], B = tr._bass[i % tr._bass.length], D = tr._drum[i % tr._drum.length];
      if (L && L[0] !== null) tone({ type: tr.soft ? "triangle" : "square", f0: hz(L[0]), dur: step * L[1] * 0.92, vol: tr.soft ? 0.16 : 0.07, attack: 0.01, delay: t0, bus: musBus });
      if (B && B[0] !== null) tone({ type: "triangle", f0: hz(B[0]), dur: step * B[1] * 0.85, vol: 0.2, delay: t0, bus: musBus });
      if (D === "k") tone({ type: "sine", f0: 150, f1: 40, dur: 0.12, vol: tr.soft ? 0.25 : 0.4, delay: t0, bus: musBus });
      if (D === "s") noise({ dur: 0.1, vol: tr.soft ? 0.06 : 0.14, f: 1800, type: "highpass", delay: t0, bus: musBus });
      if (D === "h") noise({ dur: 0.03, vol: 0.05, f: 8000, type: "highpass", delay: t0, bus: musBus });
      seq.next += step; seq.i++;
    }
  }

  const SLAudio = {
    sfx(name) {
      if (!S().sfx || !SFX[name]) return;
      if (!ctx()) return;
      try { SFX[name](); } catch (e) { /* abaikan */ }
    },
    music(name) {
      wanted = name;
      this.stopMusic(true);
      if (!S().music || !TRACKS[name] || !ctx()) return;
      seq = { tr: TRACKS[name], i: 0, next: ac.currentTime + 0.08, timer: setInterval(schedule, 30) };
      musBus.gain.cancelScheduledValues(ac.currentTime);
      musBus.gain.setValueAtTime(0.0001, ac.currentTime);
      musBus.gain.exponentialRampToValueAtTime(0.32, ac.currentTime + 0.6);
      schedule();
    },
    stopMusic(keepWanted) {
      if (!keepWanted) wanted = null;
      if (seq) { clearInterval(seq.timer); seq = null; }
    },
    /** Pengaturan berubah: hentikan/mulai musik sesuai pilihan. */
    refresh() {
      if (!S().music) { const w = wanted; this.stopMusic(); wanted = w; }
      else if (wanted && !seq) this.music(wanted);
    },
    pause() { if (ac && ac.state === "running") ac.suspend(); },
    resume() { if (ac && ac.state === "suspended") ac.resume(); },
    get playing() { return !!seq; },
    _parse: parse, _midi: midi,
  };
  document.addEventListener("visibilitychange", () => (document.hidden ? SLAudio.pause() : SLAudio.resume()));
  root.SLAudio = SLAudio;
})(window);
