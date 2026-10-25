// Jednoduché syntetizované zvuky (bez súborov).
G.Audio = (() => {
  let ctx = null, eng = null, engGain = null, engFilter = null;
  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 40;
    engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 260;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    eng.connect(engFilter); engFilter.connect(engGain); engGain.connect(ctx.destination); eng.start();
  }
  function tone(f, d, type = 'sine', v = 0.15, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.05);
  }
  return {
    init,
    vibrate() { for (let i = 0; i < 3; i++) tone(150, 0.11, 'square', 0.05, i * 0.17); },
    ding() { tone(880, 0.15, 'sine', 0.14); tone(1320, 0.25, 'sine', 0.1, 0.1); },
    done() { tone(660, 0.12, 'triangle', 0.14); tone(880, 0.12, 'triangle', 0.14, 0.1); tone(1175, 0.3, 'triangle', 0.14, 0.2); },
    fail() { tone(220, 0.25, 'sawtooth', 0.08); tone(150, 0.4, 'sawtooth', 0.08, 0.2); },
    click() { tone(620, 0.05, 'square', 0.04); },
    bump() { tone(70, 0.3, 'square', 0.18); },
    pour() { tone(300 + Math.random() * 80, 0.06, 'triangle', 0.03); },
    engine(on, speed) {
      if (!ctx) return;
      const t = ctx.currentTime, s = Math.abs(speed);
      engGain.gain.setTargetAtTime(on ? 0.04 : 0, t, 0.12);
      eng.frequency.setTargetAtTime(36 + s * 0.11, t, 0.08);
      engFilter.frequency.setTargetAtTime(220 + s * 0.9, t, 0.1);
    },
  };
})();
