// v3: 2D renderer (G.R2) – pohľad zhora v štýle v1 (world.js + entities.js), ale v metroch.
// Kamera: R2.cam = {x, z, zoom} (zoom = px na meter, CSS px). Obrazovka: sx = (x - cam.x) * zoom + W/2, sy = (z - cam.z) * zoom + H/2.
// Uhol `a` v rovine XZ: 0 = východ (+x), +z = juh (dole na obrazovke) ⇒ ctx.rotate(a) priamo.
// Poradie snímku: zem (Map.groundCanvas) → bodky hotspotov → značky cieľov → aktéri → koruny stromov → strechy → prístrešok →
// noc (light-mapa) → dážď → šípka k cieľu → bublina hráča (len ak UI nemá HTML bubliny).
window.G = window.G || {};
G.R2 = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const R2 = {};
  const CFG = () => G.CFG || {};
  const Mp = () => G.Map || null;
  const Ac = () => G.Act || null;
  const Ev = () => G.Ev || G.Q || null;
  const S = () => G.S || null;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerpExp = (dt, k) => 1 - Math.exp(-dt * k);

  // ---------- stav ----------
  let cv = null, ctx = null, dpr = 1, W = 1, H = 1;   // W,H v CSS px
  let lc = null, lctx = null, LS = 0.5;               // light-mapa (nižšie rozlíšenie)
  let camInit = false, clock = 0, timeMin = 12 * 60;
  const markers = new Map();
  R2.cam = { x: 320, z: 220, zoom: 12 };
  R2.zoomScale = 1;                                   // voliteľný násobok zoomu (ladenie)
  R2.weatherState = 'clear';
  R2.view = { x: 0, z: 0, w: 1, h: 1 };
  R2.clock = () => clock;

  // ---------- RNG (deterministické predrenderovanie) ----------
  let seed = 1337;
  function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (a, b) => a + rnd() * (b - a);

  // ---------- farby ----------
  function hexRgb(h) {
    h = String(h || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (!isFinite(n)) return [136, 136, 136];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (r, g, b) => '#' + ((1 << 24) | (cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).slice(1);
  function shade(h, a) {
    const c = hexRgb(h);
    if (a >= 0) return toHex(c[0] + (255 - c[0]) * a, c[1] + (255 - c[1]) * a, c[2] + (255 - c[2]) * a);
    return toHex(c[0] * (1 + a), c[1] * (1 + a), c[2] * (1 + a));
  }
  function mix(h1, h2, t) { const a = hexRgb(h1), b = hexRgb(h2); return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
  function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function colStr(c) {
    if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
    return c || '#ffc440';
  }
  R2.shade = shade; R2.mix = mix;

  // ---------- kreslenie – pomôcky ----------
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function circ(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (col) { c.fillStyle = col; c.fill(); } }
  function line(c, x1, y1, x2, y2, col, lw) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw || 1; c.stroke(); }
  function box(c, x, y, w, h, col, o) {
    o = o || {}; const r = o.r != null ? o.r : 3;
    if (o.sh !== 0) {
      c.save(); c.shadowColor = `rgba(0,0,0,${o.sa || 0.42})`; c.shadowBlur = o.sb || 8;
      c.shadowOffsetX = o.sx != null ? o.sx : 4; c.shadowOffsetY = o.sy != null ? o.sy : 5;
      rrect(c, x, y, w, h, r); c.fillStyle = col; c.fill(); c.restore();
    }
    const g = c.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, shade(col, 0.16)); g.addColorStop(1, shade(col, -0.2));
    rrect(c, x, y, w, h, r); c.fillStyle = g; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = shade(col, -0.5); c.stroke();
    c.beginPath();
    c.moveTo(x + r + 1, y + 1.5); c.lineTo(x + w - r - 1, y + 1.5);
    c.moveTo(x + 1.5, y + r + 1); c.lineTo(x + 1.5, y + h - r - 1);
    c.strokeStyle = 'rgba(255,255,255,0.32)'; c.stroke();
  }
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
  const FONT = '"Trebuchet MS","Segoe UI",Arial,sans-serif';
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // ---------- transformácie ----------
  const zoom = () => R2.cam.zoom * (R2.zoomScale || 1);
  R2.project = function (x, z) {
    const zm = zoom();
    return { sx: (x - R2.cam.x) * zm + W / 2, sy: (z - R2.cam.z) * zm + H / 2, visible: true };
  };
  R2.unproject = function (sx, sy) {
    const zm = zoom();
    return { x: (sx - W / 2) / zm + R2.cam.x, z: (sy - H / 2) / zm + R2.cam.z };
  };
  function setWorld() { // transformácia: svet (m) → device px
    const z = zoom() * dpr;
    ctx.setTransform(z, 0, 0, z, (W / 2 - R2.cam.x * zoom()) * dpr, (H / 2 - R2.cam.z * zoom()) * dpr);
  }
  function setScreen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } // CSS px
  function computeView() {
    const zm = zoom();
    const v = R2.view;
    v.w = W / zm; v.h = H / zm; v.x = R2.cam.x - v.w / 2; v.z = R2.cam.z - v.h / 2;
    return v;
  }
  const inView = (v, x, z, m) => x > v.x - m && x < v.x + v.w + m && z > v.z - m && z < v.z + v.h + m;

  // ---------- init / resize ----------
  R2.init = function (canvas) {
    cv = canvas || (typeof document !== 'undefined' && document.getElementById ? document.getElementById('game') : null);
    if (!cv) return false;
    ctx = cv.getContext('2d');
    lc = mk(2, 2); lctx = lc.getContext('2d');
    R2.resize();
    if (!treeSprites.length) makeTreeSprites();
    return true;
  };
  R2.resize = function () {
    if (!cv) return;
    const w = (typeof innerWidth === 'number' && innerWidth) || cv.clientWidth || 800;
    const h = (typeof innerHeight === 'number' && innerHeight) || cv.clientHeight || 600;
    dpr = clamp((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1, 1, 2);
    W = Math.max(1, w); H = Math.max(1, h);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (lc) { lc.width = Math.max(2, Math.round(cv.width * LS)); lc.height = Math.max(2, Math.round(cv.height * LS)); }
    rainDrops.length = 0;
  };
  R2.size = () => ({ w: W, h: H, dpr });

  // ---------- kamera ----------
  const targetZoom = (inCar) => (inCar ? (CFG().zoomCar || 7) : (CFG().zoomFoot || 12));
  R2.follow = function (x, z, inCar, dt, lookDX, lookDZ) {
    dt = dt || 0;
    let lx = lookDX || 0, lz = lookDZ || 0;
    const ll = Math.hypot(lx, lz);
    if (ll > 28) { lx *= 28 / ll; lz *= 28 / ll; }
    if (!inCar) { lx = 0; lz = 0; }
    const tx = x + lx, tz = z + lz, tzoom = targetZoom(inCar);
    if (!camInit) { R2.cam.x = tx; R2.cam.z = tz; R2.cam.zoom = tzoom; camInit = true; return; }
    const k = lerpExp(dt, 6), kz = lerpExp(dt, 2.5);
    R2.cam.x += (tx - R2.cam.x) * k;
    R2.cam.z += (tz - R2.cam.z) * k;
    R2.cam.zoom += (tzoom - R2.cam.zoom) * kz;
  };
  R2.snap = function (x, z, inCar) { R2.cam.x = x; R2.cam.z = z; R2.cam.zoom = targetZoom(inCar); camInit = true; };
  R2.snapCamera = R2.snap;
  R2.setTime = function (min) { if (typeof min === 'number') timeMin = ((min % 1440) + 1440) % 1440; };
  R2.setInside = function () { /* strechy sa riešia cez Map.locAt vo render() */ };
  R2.update = function () { /* kompatibilita so starým Scene.update */ };

  // ---------- značky cieľov ----------
  R2.addMarker = function (id, x, z, color) { markers.set(id, { x, z, color: colStr(color), t0: clock }); };
  R2.updateMarker = function (id, x, z) { const m = markers.get(id); if (m) { m.x = x; m.z = z; } };
  R2.removeMarker = function (id) { markers.delete(id); };
  R2.clearMarkers = function () { markers.clear(); };
  function drawMarkers(v) {
    if (!markers.size) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
    for (const m of markers.values()) {
      if (!inView(v, m.x, m.z, 5)) continue;
      const faint = m.color.toLowerCase() === '#ffffff';
      if (faint) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.18;
        ctx.beginPath(); ctx.arc(m.x, m.z, 1.5, 0, TAU); ctx.stroke();
        continue;
      }
      const r = 2.2 + pulse * 0.9;
      ctx.strokeStyle = rgba(m.color, 0.55 + pulse * 0.4); ctx.lineWidth = 0.32;
      ctx.beginPath(); ctx.arc(m.x, m.z, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(m.color, 0.12);
      ctx.beginPath(); ctx.arc(m.x, m.z, r, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(m.color, 0.8);
      ctx.beginPath(); ctx.arc(m.x, m.z, 0.3, 0, TAU); ctx.fill();
    }
  }
  function drawHotspotDots(v) {
    const A = Ac(), Mn = G.Main;
    if (!A || !A.player || A.player.inCar || !Mn || typeof Mn.hotspotList !== 'function') return;
    let list = null; try { list = Mn.hotspotList(); } catch (e) { list = null; }
    if (!list) return;
    const p = A.player;
    for (const h of list) {
      if (h.id === 'car' || h.id === 'kid' || h.id === 'dog') continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d > 26 || !inView(v, h.x, h.z, 1)) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - d / 26)})`;
      ctx.beginPath(); ctx.arc(h.x, h.z, 0.32, 0, TAU); ctx.fill();
    }
  }

  // ---------- počasie ----------
  const rainDrops = [];
  R2.setWeather = function (w) { R2.weatherState = w === 'rain' ? 'rain' : 'clear'; };
  R2.weather = R2.setWeather;
  R2.weatherNow = () => R2.weatherState;
  function drawRain(dt) {
    if (R2.weatherState !== 'rain') { rainDrops.length = 0; return; }
    const N = Math.round(clamp((W * H) / 6000, 60, 260));
    while (rainDrops.length < N) rainDrops.push({ x: Math.random() * (W + 80) - 40, y: Math.random() * H, l: 10 + Math.random() * 10, s: 0.8 + Math.random() * 0.5 });
    setScreen();
    ctx.fillStyle = 'rgba(30,40,60,0.16)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(205,220,240,0.42)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of rainDrops) {
      d.y += 880 * d.s * dt; d.x += 180 * d.s * dt;
      if (d.y > H + 20) { d.y = -20 - Math.random() * 40; d.x = Math.random() * (W + 80) - 40; }
      if (d.x > W + 40) d.x -= W + 80;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.2, d.y - d.l);
    }
    ctx.stroke();
  }

  // ---------- osoba (port v1 drawPerson; 1 jednotka = 0,02 m ⇒ šírka ramien dospelého 0,5 m) ----------
  const PU = 0.02;
  R2.drawPerson = function (c, x, z, a, phase, amp, look, scale, sit) {
    scale = (scale || 1) * ((G.CFG && G.CFG.actorScale) || 1); look = look || {}; amp = amp || 0; phase = phase || 0;
    const shirt = look.shirt || '#888888', pants = look.pants || '#333333', skin = look.skin || '#e0b090';
    c.save();
    c.translate(x, z);
    c.scale(PU * scale, PU * scale);
    // mäkký tieň (svetlo zhora zľava, nezávislý od rotácie)
    const sg = c.createRadialGradient(3, 4, 1, 3, 4, 18);
    sg.addColorStop(0, 'rgba(0,0,0,0.34)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.beginPath(); c.ellipse(3, 4, 18, 16, 0, 0, TAU); c.fill();
    c.rotate(a || 0);
    const sw = Math.sin(phase) * amp;
    c.lineCap = 'round';
    // nohy
    if (!sit) {
      for (const s of [-1, 1]) {
        const off = sw * 9 * s;
        c.strokeStyle = shade(pants, -0.08); c.lineWidth = 6.2;
        c.beginPath(); c.moveTo(-0.5, s * 4.6); c.lineTo(off, s * 5); c.stroke();
        c.fillStyle = '#1c1c22';
        c.beginPath(); c.ellipse(off + 2.6, s * 5, 4.2, 2.9, 0, 0, TAU); c.fill();
      }
    }
    // ruky (rukávy + predlaktie)
    for (const s of [-1, 1]) {
      const sx = sit ? 0 : -sw * 7 * s;
      const shX = 0.5, shY = s * 10.2;
      const elX = shX + sx * 0.55 + (sit ? 4 : 0), elY = s * 12.6;
      const hX = shX + sx + (sit ? 10 : 1.5), hY = s * (sit ? 10.5 : 12.8);
      c.strokeStyle = skin; c.lineWidth = 3.8;
      c.beginPath(); c.moveTo(elX, elY); c.lineTo(hX, hY); c.stroke();
      c.fillStyle = shade(skin, -0.05);
      c.beginPath(); c.arc(hX, hY, 2.3, 0, TAU); c.fill();
      c.strokeStyle = shade(shirt, -0.12); c.lineWidth = 5.6;
      c.beginPath(); c.moveTo(shX, shY); c.lineTo((shX + elX) / 2 + (elX - shX) * 0.2, (shY + elY) / 2); c.stroke();
    }
    // trup
    const tg = c.createRadialGradient(1.5, -3.5, 1, 0, 0, 14);
    tg.addColorStop(0, shade(shirt, 0.2)); tg.addColorStop(0.55, shirt); tg.addColorStop(1, shade(shirt, -0.3));
    c.fillStyle = tg;
    c.beginPath(); c.ellipse(-0.5, 0, 7.6, 12.4, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.8; c.stroke();
    if (look.apron || look.chef) { // zástera – predná polovica trupu
      const ap = typeof look.apron === 'string' ? look.apron : '#e6e6e0';
      c.fillStyle = rgba(ap, 0.78);
      c.beginPath(); c.ellipse(3.2, 0, 3.8, 9.5, 0, -Math.PI / 2, Math.PI / 2); c.fill();
      c.strokeStyle = rgba(shade(ap, -0.5), 0.5); c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(3.2, -9.5); c.lineTo(3.2, 9.5); c.stroke();
    }
    if (look.chain) {
      c.strokeStyle = '#d9dbe2'; c.lineWidth = 0.9;
      c.beginPath(); c.arc(1.5, 0, 6.6, -1.15, 1.15); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.6;
      c.beginPath(); c.arc(1.5, 0, 7.6, -0.9, 0.9); c.stroke();
    }
    // hlava
    const hx = 1, hr = 7;
    const hg = c.createRadialGradient(hx + 1.5, -2, 0.5, hx, 0, hr + 1);
    hg.addColorStop(0, shade(skin, 0.15)); hg.addColorStop(1, shade(skin, -0.18));
    c.fillStyle = hg;
    c.beginPath(); c.arc(hx, 0, hr, 0, TAU); c.fill();
    if (look.beard) { // brada – predná polovica hlavy
      c.fillStyle = look.beard === true ? (look.hair || '#4a3020') : look.beard;
      c.beginPath();
      c.arc(hx, 0, hr + 0.6, -1.75, 1.75);
      c.arc(hx - 1.6, 0, hr - 1.2, 1.6, -1.6, true);
      c.closePath(); c.fill();
    }
    if (look.chef) { // kuchárska čiapka
      const cg = c.createRadialGradient(-1, -2, 1, -0.5, 0, 10);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, '#cfcfcc');
      c.fillStyle = cg;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * TAU;
        c.moveTo(-0.5 + Math.cos(an) * 5 + 4, Math.sin(an) * 5);
        c.arc(-0.5 + Math.cos(an) * 5, Math.sin(an) * 5, 4, 0, TAU);
      }
      c.fill();
      c.beginPath(); c.arc(-0.5, 0, 6, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.7;
      c.beginPath(); c.arc(-0.5, 0, 6, 0, TAU); c.stroke();
    } else if (look.cap) {
      c.fillStyle = look.brim || shade(look.cap, -0.3);
      c.beginPath(); c.moveTo(hx + 2, -6); c.quadraticCurveTo(hx + 13, 0, hx + 2, 6); c.closePath(); c.fill();
      const cg = c.createRadialGradient(-1, -2.5, 0.5, -0.3, 0, 8);
      cg.addColorStop(0, shade(look.cap, 0.25)); cg.addColorStop(1, shade(look.cap, -0.25));
      c.fillStyle = cg;
      c.beginPath(); c.arc(-0.3, 0, 6.8, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-7, 0); c.lineTo(6.4, 0); c.stroke();
      if (look.logo) { c.fillStyle = look.logo; c.beginPath(); c.arc(3.2, 0, 1.6, 0, TAU); c.fill(); }
    } else if (!look.bald && look.hair) {
      const hg2 = c.createRadialGradient(-1.5, -2, 0.5, -0.6, 0, 8);
      hg2.addColorStop(0, shade(look.hair, 0.2)); hg2.addColorStop(1, shade(look.hair, -0.2));
      c.fillStyle = hg2;
      c.beginPath(); c.arc(-0.7, 0, hr - 0.3, 0, TAU); c.fill();
      if (look.bun) { c.beginPath(); c.arc(-6.6, 0, 3.3, 0, TAU); c.fill(); }
      if (look.pig || look.pigtails) {
        for (const s of [-1, 1]) {
          c.fillStyle = look.hair;
          c.beginPath(); c.arc(-3.5, s * 8.4, 2.9, 0, TAU); c.fill();
          c.fillStyle = '#ffd1e3';
          c.beginPath(); c.arc(-3, s * 6.6, 1.1, 0, TAU); c.fill();
        }
      }
    } else if (look.bald) {
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.ellipse(-0.5, -2, 3, 2, 0.4, 0, TAU); c.fill();
    }
    c.restore();
  };

  // ---------- pes (Bundáš) – zhora, v metroch ----------
  R2.drawDog = function (c, x, z, a, phase, look, amp) {
    look = look || {}; phase = phase || 0;
    const br = look.body || '#7a4b22', dk = look.dark || '#4a2c12';
    const moving = amp == null ? true : amp > 0.05;
    const wag = moving ? Math.sin(clock * 14) * 0.7 : Math.sin(clock * 3) * 0.25;
    const sw = Math.sin(phase) * (amp == null ? 0.6 : amp);
    c.save();
    c.translate(x, z);
    { const AS = 1 + (((G.CFG && G.CFG.actorScale) || 1) - 1) * 0.5; c.scale(AS, AS); }
    // tieň
    const sg = c.createRadialGradient(0.05, 0.07, 0.02, 0.05, 0.07, 0.42);
    sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(0.05, 0.07, 0.42, 0.3, 0, 0, TAU); c.fill();
    c.rotate(a || 0);
    c.lineCap = 'round';
    // nohy
    c.strokeStyle = dk; c.lineWidth = 0.07;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const off = sw * 0.08 * sx * sz;
      c.beginPath(); c.moveTo(sx * 0.17, sz * 0.1); c.lineTo(sx * 0.17 + off, sz * 0.19); c.stroke();
    }
    // chvost
    c.strokeStyle = br; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(-0.26, 0);
    c.quadraticCurveTo(-0.38, wag * 0.12, -0.46, wag * 0.2); c.stroke();
    // telo
    const bg = c.createRadialGradient(-0.05, -0.06, 0.02, 0, 0, 0.3);
    bg.addColorStop(0, shade(br, 0.22)); bg.addColorStop(0.6, br); bg.addColorStop(1, shade(br, -0.32));
    c.fillStyle = bg;
    c.beginPath(); c.ellipse(0, 0, 0.275, 0.15, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.015; c.stroke();
    // svetlá škvrna na chrbte
    c.fillStyle = rgba(shade(br, 0.35), 0.5);
    c.beginPath(); c.ellipse(-0.04, -0.03, 0.12, 0.05, 0.2, 0, TAU); c.fill();
    // uši
    c.fillStyle = dk;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(0.27, s * 0.12, 0.08, 0.05, s * 0.4, 0, TAU); c.fill(); }
    // hlava
    const hg = c.createRadialGradient(0.33, -0.03, 0.01, 0.33, 0, 0.14);
    hg.addColorStop(0, shade(br, 0.2)); hg.addColorStop(1, shade(br, -0.25));
    c.fillStyle = hg; c.beginPath(); c.arc(0.33, 0, 0.12, 0, TAU); c.fill();
    // čumák + nos
    c.fillStyle = dk; c.beginPath(); c.ellipse(0.45, 0, 0.07, 0.055, 0, 0, TAU); c.fill();
    c.fillStyle = '#111111'; c.beginPath(); c.arc(0.51, 0, 0.025, 0, TAU); c.fill();
    c.restore();
  };

  // ---------- auto (port v1 drawCar; jednotky v1 preškálované na dĺžku v metroch) ----------
  const KID_LOOK = () => (Ac() && Ac().LOOK && Ac().LOOK.kid) || { hair: '#7a4a2a', skin: '#f1c9b0' };
  R2.drawCar = function (c, x, z, a, color, opt) {
    opt = opt || {};
    color = color || '#9a9ea6';
    const lenM = opt.len || (opt.van ? 5.2 : 4.2), widM = opt.wid || (opt.van ? 2.0 : 1.8);
    const k = lenM / 92;                 // m na v1 jednotku
    const L = 92, Wd = widM / k;
    const hl = L / 2, hw = Wd / 2;
    c.save();
    c.translate(x, z);
    c.scale(k, k);
    // tieň
    c.save();
    c.translate(5, 6); c.rotate(a);
    c.fillStyle = 'rgba(0,0,0,0.18)'; rrect(c, -hl - 4, -hw - 4, L + 8, Wd + 8, 14); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; rrect(c, -hl, -hw, L, Wd, 11); c.fill();
    c.restore();
    c.rotate(a);
    if (opt.lights) {
      const lg = c.createRadialGradient(hl, 0, 4, hl + 110, 0, 150);
      lg.addColorStop(0, 'rgba(255,240,190,0.3)'); lg.addColorStop(1, 'rgba(255,240,190,0)');
      c.fillStyle = lg;
      c.beginPath(); c.moveTo(hl - 2, -hw + 4); c.lineTo(hl + 230, -hw - 70); c.lineTo(hl + 230, hw + 70); c.lineTo(hl - 2, hw - 4); c.closePath(); c.fill();
    }
    // kolesá
    c.fillStyle = '#141416';
    const wx = L * 0.31;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { rrect(c, sx * wx - 8, sy * (hw - 1) - 3.5, 16, 7, 2.5); c.fill(); }
    // karoséria
    const bg = c.createLinearGradient(0, -hw, 0, hw);
    bg.addColorStop(0, shade(color, -0.45)); bg.addColorStop(0.18, shade(color, -0.05)); bg.addColorStop(0.45, shade(color, 0.22));
    bg.addColorStop(0.7, color); bg.addColorStop(1, shade(color, -0.5));
    c.fillStyle = bg;
    rrect(c, -hl, -hw, L, Wd, opt.van ? 6 : 11); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
    if (opt.van) {
      const fx = hl - L * 0.2;
      const wg = c.createLinearGradient(fx, 0, fx + 12, 0);
      wg.addColorStop(0, '#1a2430'); wg.addColorStop(1, '#4a6074');
      c.fillStyle = wg;
      c.beginPath(); c.moveTo(fx, -hw + 5); c.lineTo(fx + 11, -hw + 8); c.lineTo(fx + 11, hw - 8); c.lineTo(fx, hw - 5); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.beginPath(); c.moveTo(fx + 3, -hw + 9); c.lineTo(fx + 7, -hw + 9); c.lineTo(fx + 4, -2); c.lineTo(fx + 1, -2); c.fill();
      const rg = c.createLinearGradient(0, -hw, 0, hw);
      rg.addColorStop(0, shade(color, -0.12)); rg.addColorStop(0.5, shade(color, 0.12)); rg.addColorStop(1, shade(color, -0.18));
      c.fillStyle = rg;
      rrect(c, -hl + 3, -hw + 3, L * 0.74, Wd - 6, 4); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
      for (let i = 1; i < 6; i++) { const lx = -hl + 3 + (L * 0.74 * i) / 6; c.beginPath(); c.moveTo(lx, -hw + 5); c.lineTo(lx, hw - 5); c.stroke(); }
    } else {
      // kapota – rysy
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(L * 0.3, -hw * 0.45); c.quadraticCurveTo(hl - 4, -hw * 0.35, hl - 2, -hw * 0.3);
      c.moveTo(L * 0.3, hw * 0.45); c.quadraticCurveTo(hl - 4, hw * 0.35, hl - 2, hw * 0.3);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.15)';
      c.beginPath(); c.moveTo(L * 0.3, -1); c.lineTo(hl - 3, -1); c.stroke();
      // čelné sklo
      const f0 = L * 0.1, f1 = L * 0.27;
      const wg = c.createLinearGradient(f0, 0, f1, 0);
      wg.addColorStop(0, '#0e141c'); wg.addColorStop(1, '#3b4e62');
      c.fillStyle = wg;
      c.beginPath(); c.moveTo(f0, -hw + 6); c.lineTo(f1, -hw + 3.5); c.lineTo(f1, hw - 3.5); c.lineTo(f0, hw - 6); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.beginPath(); c.moveTo(f0 + 3, -hw + 7); c.lineTo(f0 + 8, -hw + 6.5); c.lineTo(f1 - 4, 2); c.lineTo(f1 - 9, 2.5); c.closePath(); c.fill();
      // strecha
      const r0 = -L * 0.24;
      const rg = c.createLinearGradient(0, -hw, 0, hw);
      rg.addColorStop(0, shade(color, -0.15)); rg.addColorStop(0.45, shade(color, 0.28)); rg.addColorStop(1, shade(color, -0.2));
      c.fillStyle = rg;
      rrect(c, r0, -hw + 6, f0 - r0, Wd - 12, 5); c.fill();
      // bočné okná
      c.fillStyle = 'rgba(20,28,38,0.85)';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(r0 + 2, s * (hw - 3)); c.lineTo(f0 - 1, s * (hw - 3)); c.lineTo(f0 - 1, s * (hw - 5.5)); c.lineTo(r0 + 2, s * (hw - 5.5));
        c.closePath(); c.fill();
      }
      // zadné sklo
      const b0 = -L * 0.36;
      const bwg = c.createLinearGradient(b0, 0, r0, 0);
      bwg.addColorStop(0, '#2a3a4a'); bwg.addColorStop(1, '#0f151d');
      c.fillStyle = bwg;
      c.beginPath(); c.moveTo(b0, -hw + 6); c.lineTo(r0, -hw + 5); c.lineTo(r0, hw - 5); c.lineTo(b0, hw - 6); c.closePath(); c.fill();
      if (opt.kid) { // hlavička Nelky vzadu vpravo (presvitá cez strechu)
        const KL = KID_LOOK(), kx = -L * 0.15, ky = hw * 0.4;
        c.globalAlpha = 0.9;
        c.fillStyle = KL.hair;
        c.beginPath(); c.arc(kx - 4, ky - 6, 2.4, 0, TAU); c.arc(kx - 4, ky + 6, 2.4, 0, TAU); c.fill();
        c.fillStyle = KL.skin; c.beginPath(); c.arc(kx + 1, ky, 5.2, 0, TAU); c.fill();
        c.fillStyle = KL.hair; c.beginPath(); c.arc(kx, ky, 4.6, 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
      if (opt.dog) { // hlava Bundáša vzadu vľavo
        const kx = -L * 0.15, ky = -hw * 0.4;
        c.globalAlpha = 0.9;
        c.fillStyle = '#4a2c12';
        c.beginPath(); c.ellipse(kx - 1, ky - 6, 3.2, 2, 0, 0, TAU); c.ellipse(kx - 1, ky + 6, 3.2, 2, 0, 0, TAU); c.fill();
        c.fillStyle = '#7a4b22'; c.beginPath(); c.arc(kx, ky, 5, 0, TAU); c.fill();
        c.fillStyle = '#4a2c12'; c.beginPath(); c.ellipse(kx + 4.5, ky, 2.8, 2.2, 0, 0, TAU); c.fill();
        c.fillStyle = '#111'; c.beginPath(); c.arc(kx + 6.8, ky, 1, 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
      // zrkadlá
      c.fillStyle = shade(color, -0.3);
      for (const s of [-1, 1]) { rrect(c, f0 + 1, s * (hw + 1.5) - 2, 5, 4, 1.5); c.fill(); }
    }
    // svetlá
    for (const s of [-1, 1]) {
      c.fillStyle = opt.lights ? '#fffbe0' : '#e8e6d4';
      c.beginPath(); c.ellipse(hl - 3, s * (hw - 7), 2.4, 5, 0, 0, TAU); c.fill();
      c.fillStyle = opt.brake ? '#ff2a1a' : (opt.lights ? '#c8281e' : '#8a1a16');
      rrect(c, -hl + 0.5, s * (hw - 7) - 4, 3, 8, 1); c.fill();
    }
    if (opt.brake) {
      for (const s of [-1, 1]) {
        const gg = c.createRadialGradient(-hl, s * (hw - 7), 1, -hl, s * (hw - 7), 22);
        gg.addColorStop(0, 'rgba(255,40,20,0.55)'); gg.addColorStop(1, 'rgba(255,40,20,0)');
        c.fillStyle = gg; c.beginPath(); c.arc(-hl, s * (hw - 7), 22, 0, TAU); c.fill();
      }
    }
    c.restore();
  };

  // ---------- aktéri ----------
  function darkness(t) {
    if (typeof t !== 'number') return 0;
    const morning = clamp((450 - t) / 60, 0, 1) * 0.5;
    const evening = clamp((t - 1080) / 150, 0, 1) * 0.8;
    return Math.max(morning, evening);
  }
  R2.darkness = darkness;
  const curTime = () => { const s = S(); return s && typeof s.time === 'number' ? s.time : timeMin; };
  const isNight = () => darkness(curTime()) > 0.3;
  const objValues = (o) => (Array.isArray(o) ? o : (o && typeof o === 'object' ? Object.values(o) : []));

  R2.drawActors = function (c, view) {
    const A = Ac();
    if (!A) return;
    const v = view || { x: -1e9, z: -1e9, w: 2e9, h: 2e9 };
    const night = isNight();
    const LOOK = A.LOOK || {};
    const p = A.player || {}, k = A.kid, d = A.dog, car = A.car;
    const npcVis = typeof A.npcVisible === 'function' ? A.npcVisible : (n) => n.visible !== false;
    // dodávka
    const van = A.van;
    if (van && inView(v, van.x, van.z, 6)) R2.drawCar(c, van.x, van.z, van.a || 0, van.color || '#ecebe6', { van: true });
    // zaparkované autá (pod chodcami)
    for (const pk of (A.parked || [])) {
      if (!inView(v, pk.x, pk.z, 5)) continue;
      R2.drawCar(c, pk.x, pk.z, pk.a || 0, pk.color, {});
    }
    // NPC
    for (const n of objValues(A.npcs)) {
      if (!n || !npcVis(n) || !inView(v, n.x, n.z, 2)) continue;
      R2.drawPerson(c, n.x, n.z, n.a, n.phase, n.amp, n.look, n.scale || 1, !!n.sit);
    }
    // chodci
    for (const pd of (A.peds || [])) {
      if (!pd || pd.visible === false || !inView(v, pd.x, pd.z, 2)) continue;
      R2.drawPerson(c, pd.x, pd.z, pd.a, pd.phase, pd.amp, pd.look, pd.scale || 1, false);
    }
    // Nelka
    if (k && k.state !== 'car' && k.state !== 'away' && inView(v, k.x, k.z, 2)) {
      R2.drawPerson(c, k.x, k.z, k.a, k.phase, k.amp, k.look || LOOK.kid, k.scale || 0.68, false);
      if (k.state === 'lost' && Math.hypot(p.x - k.x, p.z - k.z) > 20) {
        screenText('😭', k.x, k.z - 1.3 + Math.sin(clock * 5) * 0.12, `22px ${EMOJI}`, '#fff');
      }
    }
    // Bundáš
    if (d && d.state !== 'car' && inView(v, d.x, d.z, 2)) {
      R2.drawDog(c, d.x, d.z, d.a, d.phase, d.look || LOOK.dog, d.amp);
      if (d.state === 'lost' && Math.hypot(p.x - d.x, p.z - d.z) > 20) screenText('🐕❓', d.x, d.z - 0.9, `18px ${EMOJI}`, '#fff');
    }
    // hráč
    if (!p.inCar && inView(v, p.x, p.z, 2)) R2.drawPerson(c, p.x, p.z, p.a, p.phase, p.amp, p.look || LOOK.hero, 1, !!p.sit);
    // premávka
    for (const t of (A.traffic || [])) {
      if (!t || t.active === false || !inView(v, t.x, t.z, 5)) continue;
      R2.drawCar(c, t.x, t.z, t.a, t.color, { brake: !!t.brake, lights: night });
    }
    // Fabia
    if (car && inView(v, car.x, car.z, 5)) {
      R2.drawCar(c, car.x, car.z, car.a, A.FABIA || '#3a6ea5', {
        kid: !!(k && k.state === 'car'), dog: !!(d && d.state === 'car'),
        brake: !!car.braking, lights: night && (p.inCar || Math.abs(car.speed || 0) > 0.5),
      });
    }
  };

  // text v CSS px na svetovej pozícii (nezávislý od zoomu)
  function screenText(text, x, z, font, color, bg) {
    if (!ctx) return;
    const pr = R2.project(x, z);
    ctx.save();
    setScreen();
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg) {
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = bg; rrect(ctx, pr.sx - w / 2, pr.sy - 11, w, 22, 11); ctx.fill();
    } else { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3; }
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, pr.sx, pr.sy);
    ctx.restore();
    setWorld();
  }

  // ---------- menovky s rolou nad postavami (len keď G.CFG.showRoles) ----------
  function roleColor(role) {
    if (/ŠÉF|MAJITEĽ$/.test(role) && !/KRČMY/.test(role)) return '#ff6b5e';
    if (/KUCHÁR/.test(role)) return '#5fd47a';
    if (/ČAŠNÍČ/.test(role)) return '#5aa9ff';
    if (/DCÉRA|BABKA|PES/.test(role)) return '#ff8fc4';
    if (/EX|PRIATEĽ/.test(role)) return '#c58bff';
    return '#c4cad2';
  }
  const TAG_RANGE = 35;
  R2.drawTags = function () {
    const cfg = CFG();
    if (!cfg.showRoles || !ctx) return;
    const A = Ac(), M = Mp();
    if (!A) return;
    const zm = zoom();
    const f = typeof A.focusPos === 'function' ? A.focusPos() : { x: R2.cam.x, z: R2.cam.z };
    let here = null;
    try { here = M && M.locAt ? M.locAt(f.x, f.z) : null; } catch (e) { here = null; }
    const items = [];
    const npcVis = typeof A.npcVisible === 'function' ? A.npcVisible : (n) => n.visible !== false;
    const names = G.NPC_NAME || {};
    const add = (name, x, z, scale) => {
      if (!name) return;
      const role = G.roleOf ? G.roleOf(name) : '';
      if (!role) return;
      if (Math.hypot(x - R2.cam.x, z - R2.cam.z) > TAG_RANGE) return;
      let loc = null;
      try { loc = M && M.locAt ? M.locAt(x, z) : null; } catch (e) { loc = null; }
      if (loc && !(here && (here === loc || here.id === loc.id))) return; // zavretá budova: nevidno
      const pr = R2.project(x, z);
      if (pr.sx < -80 || pr.sx > W + 80 || pr.sy < -60 || pr.sy > H + 60) return;
      items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), role, x: pr.sx, y: pr.sy - zm * 0.8 * (scale || 1) * (cfg.actorScale || 1) / 2.8 - 6, col: roleColor(role) });
    };
    for (const id in (A.npcs || {})) {
      const n = A.npcs[id];
      if (!n || !names[id] || !npcVis(n)) continue;
      add(names[id], n.x, n.z, n.scale || 1);
    }
    const k = A.kid, d = A.dog;
    if (k && k.state !== 'car' && k.state !== 'away') add(cfg.kid, k.x, k.z, k.scale || 0.68);
    if (d && d.state !== 'car') add(cfg.dog, d.x, d.z, 0.5);
    if (!items.length) return;
    const fs = clamp(zm * 0.55, 10, 15), rs = Math.max(9, Math.round(fs * 0.75));
    ctx.save();
    setScreen();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const boxes = [];
    items.sort((a, b) => b.y - a.y);
    for (const it of items) {
      ctx.font = `700 ${fs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
      const w1 = ctx.measureText(it.name).width;
      ctx.font = `700 ${rs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
      const w2 = ctx.measureText(it.role).width;
      const bw = Math.max(w1, w2) + 14, bh = fs + rs + 9;
      let bx = it.x - bw / 2, by = it.y - bh;
      for (let iter = 0; iter < 8; iter++) { // jednoduché odsunutie prekrývajúcich sa menoviek nahor
        const hit = boxes.find((b) => bx < b.x + b.w && bx + bw > b.x && by < b.y + b.h && by + bh > b.y);
        if (!hit) break;
        by = hit.y - bh - 2;
      }
      boxes.push({ x: bx, y: by, w: bw, h: bh });
      ctx.fillStyle = 'rgba(12,15,20,0.78)';
      rrect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.fillStyle = it.col; rrect(ctx, bx, by + 4, 3, bh - 8, 1.5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
      ctx.fillText(it.name, bx + bw / 2 + 1, by + 4 + fs / 2);
      ctx.fillStyle = it.col; ctx.font = `700 ${rs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
      ctx.fillText(it.role, bx + bw / 2 + 1, by + 6 + fs + rs / 2);
    }
    ctx.restore();
    setWorld();
  };

  // ---------- stromy (4 predrenderované koruny) ----------
  const TS = 192, TR0 = 86;
  const treeSprites = [];
  function makeTreeSprites() {
    const pals = [
      { d: '#163d17', m: '#3a7a2c', l: '#86bb4e' },
      { d: '#24461a', m: '#5a8f2e', l: '#b0d260' },
      { d: '#12331f', m: '#2c6a3e', l: '#6fae6c' },
      { d: '#38451a', m: '#748c2c', l: '#cfcf62' },
    ];
    treeSprites.length = 0;
    seed = 20240917;
    for (let v = 0; v < 4; v++) {
      const cvs = mk(TS, TS), c = cvs.getContext('2d'), p = pals[v], cx = TS / 2, cy = TS / 2;
      const nb = v === 2 ? 16 : 11;
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * TAU + rr(-0.2, 0.2), dd = TR0 * rr(0.48, 0.6), br = TR0 * rr(0.32, 0.42);
        circ(c, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, br, p.d);
      }
      circ(c, cx, cy, TR0 * 0.62, p.d);
      for (let layer = 0; layer < 3; layer++) {
        const cnt = [12, 9, 6][layer], spread = TR0 * [0.52, 0.36, 0.2][layer], br0 = TR0 * [0.3, 0.26, 0.22][layer];
        for (let i = 0; i < cnt; i++) {
          const a = rr(0, TAU), dd = spread * Math.sqrt(rnd()), bx = cx + Math.cos(a) * dd - layer * 3, by = cy + Math.sin(a) * dd - layer * 3, br = br0 * rr(0.8, 1.15);
          const g = c.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br);
          g.addColorStop(0, p.l); g.addColorStop(0.5, p.m); g.addColorStop(1, p.d);
          circ(c, bx, by, br, null); c.fillStyle = g; c.fill();
        }
      }
      c.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 500; i++) {
        const a = rr(0, TAU), dd = TR0 * Math.sqrt(rnd()), px = cx + Math.cos(a) * dd, py = cy + Math.sin(a) * dd;
        c.fillStyle = rnd() < 0.5 ? rgba(p.l, 0.5) : rgba(p.d, 0.5); c.fillRect(px, py, rr(1.5, 3.5), rr(1.5, 3));
      }
      const lg = c.createLinearGradient(cx - TR0, cy - TR0, cx + TR0, cy + TR0);
      lg.addColorStop(0, 'rgba(255,255,220,0.22)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = lg; c.fillRect(0, 0, TS, TS);
      c.globalCompositeOperation = 'source-over';
      treeSprites.push(cvs);
    }
  }
  R2.treeSprites = treeSprites;
  const thash = (t) => (Math.abs(((t.x * 73856093) ^ (t.z * 19349663)) | 0));
  R2.drawTrees = function (c, v, fx, fz) {
    const M = Mp();
    if (!treeSprites.length || !M || !Array.isArray(M.trees)) return;
    for (const t of M.trees) {
      const r = t.r || 2.5, ext = r * 1.15;
      if (t.x + ext < v.x || t.x - ext > v.x + v.w || t.z + ext < v.z || t.z - ext > v.z + v.h) continue;
      const dx = (fx == null ? 1e9 : fx) - t.x, dz = (fz == null ? 1e9 : fz) - t.z, rr2 = r * 0.85;
      c.globalAlpha = dx * dx + dz * dz < rr2 * rr2 ? 0.5 : 1;
      const s = (TS * r) / TR0, h = thash(t);
      c.save(); c.translate(t.x, t.z); c.rotate(t.rot != null ? t.rot : (h % 628) / 100);
      c.drawImage(treeSprites[(t.v != null ? t.v : (h >> 4)) & 3], -s / 2, -s / 2, s, s);
      c.restore();
    }
    c.globalAlpha = 1;
  };

  // ---------- strechy (predrenderované na RS px/m, presah OVER m) ----------
  const RS = 8, OVER = 1;
  const roofCache = new Map();
  let gravelPat = null;
  function gravelTile() {
    const n = 64, cvs = mk(n, n), c = cvs.getContext('2d');
    const img = c.createImageData ? c.createImageData(n, n) : null;
    if (img && img.data) {
      for (let i = 0; i < n * n; i++) {
        const v = 150 + (rnd() * 105) | 0, j = i * 4;
        img.data[j] = v; img.data[j + 1] = v; img.data[j + 2] = v; img.data[j + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    } else { c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, n, n); }
    return cvs;
  }
  const PITCHED = { byt: 1, babka: 1, ex: 1, nina: 1 };
  const ROOF_COL = { byt: '#9a4f3c', babka: '#7d5a3c', ex: '#6f7278', nina: '#a65a44' };
  function isPitched(loc) {
    if (loc.roof === 'pitched') return true;
    if (loc.roof === 'flat' || loc.flat) return false;
    return !!PITCHED[loc.id];
  }
  function fitFont(c, text, maxW, maxH) {
    let fs = Math.max(6, Math.min(maxH, 64));
    c.font = `bold ${fs}px ${FONT}`;
    const w = c.measureText(text).width || 1;
    if (w > maxW) fs = Math.max(6, Math.floor(fs * maxW / w));
    c.font = `bold ${fs}px ${FONT}`;
    return fs;
  }
  function roofLabel(c, w, h, text) {
    if (!text) return;
    fitFont(c, text, w * 0.84, h * 0.3);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 6; c.shadowOffsetX = 2; c.shadowOffsetY = 3;
    c.fillStyle = '#ffffff'; c.fillText(text, w / 2, h / 2); c.restore();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.strokeText(text, w / 2, h / 2);
  }
  function pitchedRoof(c, w, h, col) {
    const hor = w >= h, r1 = hor ? [h / 2, h / 2] : [w / 2, w / 2], r2 = hor ? [w - h / 2, h / 2] : [w / 2, h - w / 2];
    const faces = hor ? [
      { p: [[0, 0], [w, 0], r2, r1], l: 0.12, dir: 'h', e: [0, 0, 0, h / 2] },
      { p: [[0, h], r1, r2, [w, h]], l: -0.22, dir: 'h', e: [0, h, 0, h / 2] },
      { p: [[0, 0], r1, [0, h]], l: 0.04, dir: 'v', e: [0, 0, h / 2, 0] },
      { p: [[w, 0], [w, h], r2], l: -0.1, dir: 'v', e: [w, 0, w - h / 2, 0] },
    ] : [
      { p: [[0, 0], [w, 0], r1], l: 0.12, dir: 'h', e: [0, 0, 0, w / 2] },
      { p: [[0, h], [w, h], r2], l: -0.22, dir: 'h', e: [0, h, 0, h - w / 2] },
      { p: [[0, 0], r1, r2, [0, h]], l: 0.04, dir: 'v', e: [0, 0, w / 2, 0] },
      { p: [[w, 0], [w, h], r2, r1], l: -0.1, dir: 'v', e: [w, 0, w / 2, 0] },
    ];
    const rowH = 8, tw = 14;
    for (const f of faces) {
      c.save(); poly(c, f.p); c.clip();
      const base = shade(col, f.l);
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      if (f.dir === 'h') {
        for (let y = 0, row = 0; y < h; y += rowH, row++) {
          for (let x = -(row % 2) * tw / 2; x < w; x += tw) { c.fillStyle = shade(base, rr(-0.12, 0.09)); c.fillRect(x + 0.5, y + 0.5, tw - 1.2, rowH - 1.2); }
          c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, y + rowH - 1.5, w, 1.5);
        }
      } else {
        for (let x = 0, row = 0; x < w; x += rowH, row++) {
          for (let y = -(row % 2) * tw / 2; y < h; y += tw) { c.fillStyle = shade(base, rr(-0.12, 0.09)); c.fillRect(x + 0.5, y + 0.5, rowH - 1.2, tw - 1.2); }
          c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + rowH - 1.5, 0, 1.5, h);
        }
      }
      const g = c.createLinearGradient(f.e[0], f.e[1], f.e[2] || f.e[0], f.e[3] || f.e[1]);
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.restore();
    }
    // hrebeň a nárožia
    const hip = (a, b) => { line(c, a[0], a[1], b[0], b[1], 'rgba(0,0,0,0.4)', 5); line(c, a[0], a[1], b[0], b[1], shade(col, 0.2), 3); line(c, a[0] - 1, a[1] - 1, b[0] - 1, b[1] - 1, 'rgba(255,255,255,0.25)', 1); };
    hip([0, 0], r1); hip([0, h], hor ? r1 : r2); hip([w, 0], hor ? r2 : r1); hip([w, h], r2);
    line(c, r1[0], r1[1], r2[0], r2[1], 'rgba(0,0,0,0.45)', 7); line(c, r1[0], r1[1], r2[0], r2[1], shade(col, 0.25), 4);
    line(c, r1[0], r1[1] - 1, r2[0], r2[1] - 1, 'rgba(255,255,255,0.3)', 1);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
    // komín
    const cs = Math.max(10, Math.min(20, Math.round(Math.min(w, h) * 0.16)));
    const chx = Math.round(w * 0.68), chy = Math.round(h * 0.2);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetX = cs * 0.3; c.shadowOffsetY = cs * 0.35;
    c.fillStyle = '#8a3c2a'; c.fillRect(chx, chy, cs, cs); c.restore();
    const bh = Math.max(3, cs / 5);
    for (let yy = 0; yy < cs; yy += bh) for (let xx = (Math.round(yy / bh) % 2) ? -bh : 0; xx < cs; xx += bh * 2) {
      c.fillStyle = shade('#9a4a32', rr(-0.15, 0.12)); c.fillRect(chx + Math.max(0, xx) + 0.5, chy + yy + 0.5, Math.min(bh * 2 - 1, cs - Math.max(0, xx)) - 1, bh - 1);
    }
    c.fillStyle = '#b8b0a6'; c.fillRect(chx - 1.5, chy - 1.5, cs + 3, 3);
    c.fillStyle = '#1a1a1a'; c.fillRect(chx + cs * 0.25, chy + cs * 0.25, cs * 0.5, cs * 0.5);
  }
  function acUnit(c, x, y, s) {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    box(c, 0, 0, 54, 42, '#d4d7da', { r: 3, sb: 6, sx: 6, sy: 8 });
    circ(c, 20, 21, 15, '#5a6066'); circ(c, 20, 21, 13, '#2f3438');
    c.strokeStyle = '#7d848a'; c.lineWidth = 1; for (let r = 4; r < 14; r += 3) { c.beginPath(); c.arc(20, 21, r, 0, TAU); c.stroke(); }
    c.fillStyle = '#9aa1a8'; for (let i = 0; i < 5; i++) c.fillRect(40, 6 + i * 7, 10, 3);
    c.restore();
  }
  function flatRoof(c, w, h, col, loc) {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    if (!gravelPat) { try { gravelPat = c.createPattern(gravelTile(), 'repeat'); } catch (e) { gravelPat = null; } }
    if (gravelPat) { c.save(); c.globalAlpha = 0.55; c.globalCompositeOperation = 'multiply'; c.fillStyle = gravelPat; c.fillRect(0, 0, w, h); c.restore(); }
    const nPud = Math.round(clamp((w * h) / 9000, 1, 8));
    for (let i = 0; i < nPud; i++) {
      const x = rr(16, Math.max(17, w - 16)), y = rr(16, Math.max(17, h - 16)), r = rr(12, Math.max(13, Math.min(w, h) * 0.35));
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const big = w >= 180 && h >= 120, small = w < 80 || h < 64;
    // svetlíky (haly)
    if (big && (loc.kind === 'hall' || loc.id === 'metro' || loc.id === 'kuchyna')) {
      const n = Math.max(2, Math.min(5, Math.floor(w / 70)));
      for (let i = 0; i < n; i++) {
        const sx = 30 + i * (w - 60) / (n - 1) - 14, sy = h * 0.7;
        box(c, sx, sy, 28, 18, '#9cc6dc', { r: 2, sb: 4, sx: 3, sy: 4 });
        line(c, sx + 14, sy, sx + 14, sy + 18, 'rgba(255,255,255,0.6)', 1);
      }
    }
    // klimatizácie
    const as = small ? 0.3 : 0.5;
    acUnit(c, 12, 12, as);
    if (!small) acUnit(c, w - 54 * as - 12, h - 42 * as - 12, as);
    if (big) acUnit(c, w - 54 * as - 12, 12, as);
    if (!small) { circ(c, 24, h - 20, 4, '#6a6d70'); circ(c, 24, h - 20, 2.5, '#2a2a2a'); }
    // atika
    const pw = small ? 4 : 7;
    c.strokeStyle = shade(col, 0.3); c.lineWidth = pw; c.strokeRect(pw / 2 + 1, pw / 2 + 1, w - pw - 2, h - pw - 2);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.strokeRect(1, 1, w - 2, h - 2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.strokeRect(pw + 2, pw + 2, w - 2 * pw - 4, h - 2 * pw - 4);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, w - 1, h - 1);
  }
  function roofColor(loc, pitched) {
    if (loc.roofColor) return loc.roofColor;
    if (ROOF_COL[loc.id]) return ROOF_COL[loc.id];
    const base = loc.color || '#9a9a9a';
    return pitched ? mix(base, '#8a4a3a', 0.55) : mix(shade(base, -0.3), '#6a6d70', 0.45);
  }
  function hasRoof(loc) {
    if (!loc) return false;
    if (loc.noRoof || loc.kind === 'park' || loc.floors === 0) return false;
    return typeof loc.w === 'number' && typeof loc.d === 'number';
  }
  R2.roofFor = function (loc) {
    if (!hasRoof(loc)) return null;
    const key = loc.id || loc;
    let r = roofCache.get(key);
    if (r && r.w === loc.w && r.d === loc.d) return r;
    const w = Math.max(2, Math.round((loc.w + 2 * OVER) * RS)), h = Math.max(2, Math.round((loc.d + 2 * OVER) * RS));
    const cvs = mk(w, h), c = cvs.getContext('2d');
    seed = 7 + (String(key).length * 131) + Math.round(loc.x * 3 + loc.z * 7);
    const pitched = isPitched(loc);
    if (pitched) pitchedRoof(c, w, h, roofColor(loc, true)); else flatRoof(c, w, h, roofColor(loc, false), loc);
    roofLabel(c, w, h, loc.label || loc.name || '');
    r = { cv: cvs, w: loc.w, d: loc.d, alpha: r ? r.alpha : 1, pitched };
    roofCache.set(key, r);
    return r;
  };
  R2.rebuildRoofs = function () { roofCache.clear(); canopyCache = null; };
  function locList(M) { return M.locList || objValues(M.locs); }
  R2.drawRoofs = function (c, v, dt, fx, fz) {
    const M = Mp();
    if (!M) return;
    const k = lerpExp(dt || 0, 6);
    let inside = null;
    try { inside = typeof M.locAt === 'function' ? M.locAt(fx, fz) : null; } catch (e) { inside = null; }
    for (const loc of locList(M)) {
      const r = R2.roofFor(loc);
      if (!r) continue;
      const tgt = (inside && (inside === loc || inside.id === loc.id)) ? 0 : 1;
      r.alpha += (tgt - r.alpha) * k; if (Math.abs(tgt - r.alpha) < 0.004) r.alpha = tgt;
      if (r.alpha < 0.01) continue;
      const ext = Math.hypot(loc.w, loc.d) / 2 + OVER;
      if (!inView(v, loc.x, loc.z, ext)) continue;
      c.save();
      c.globalAlpha = r.alpha;
      c.translate(loc.x, loc.z); c.rotate(loc.rotY || 0);
      c.drawImage(r.cv, -(loc.w / 2 + OVER), -(loc.d / 2 + OVER), loc.w + 2 * OVER, loc.d + 2 * OVER);
      // značka vchodu na okraji strechy (aby bolo zvonka vidieť, kde sú dvere)
      const doors = loc.doorList || [];
      for (const d of doors) {
        if (typeof d.lx !== 'number') continue;
        c.save();
        c.translate(d.lx, d.lz);
        // otočiť tak, aby dvere ležali pozdĺž steny
        if (d.side === 'E' || d.side === 'W') c.rotate(Math.PI / 2);
        const DW = 1.6, DT = 0.9;
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(-DW / 2 - 0.15, -DT / 2 - 0.15, DW + 0.3, DT + 0.3);
        c.fillStyle = '#f1e2b6';
        c.fillRect(-DW / 2, -DT / 2, DW, DT);
        c.strokeStyle = '#5a4a2a'; c.lineWidth = 0.12;
        c.strokeRect(-DW / 2, -DT / 2, DW, DT);
        c.beginPath(); c.moveTo(0, -DT / 2); c.lineTo(0, DT / 2); c.stroke();
        // malá šípka smerom dnu
        const dirZ = (d.side === 'N' || d.side === 'W') ? 1 : -1;
        c.fillStyle = '#5a4a2a';
        c.beginPath(); c.moveTo(-0.3, -dirZ * 0.1); c.lineTo(0.3, -dirZ * 0.1); c.lineTo(0, dirZ * 0.32); c.closePath(); c.fill();
        c.restore();
      }
      c.restore();
    }
    c.globalAlpha = 1;
  };

  // ---------- prístrešok benzínky (loc.canopy) ----------
  let canopyCache = null; // {key, cv, w, d, alpha}
  function canopyRect(loc) {
    const cp = loc.canopy;
    if (!cp) return null;
    const w = cp.w || 14, d = cp.d || 26;
    let x, z;
    if (typeof cp.x === 'number' && typeof cp.z === 'number') { x = cp.x; z = cp.z; }
    else {
      const lx = cp.lx || 0, lz = cp.lz || 0, cs = Math.cos(loc.rotY || 0), sn = Math.sin(loc.rotY || 0);
      x = loc.x + lx * cs - lz * sn; z = loc.z + lx * sn + lz * cs;
    }
    return { x, z, w, d, rot: cp.rot != null ? cp.rot : (loc.rotY || 0) };
  }
  function makeCanopy(loc, rc) {
    const w = Math.round(rc.w * RS), h = Math.round(rc.d * RS);
    const cvs = mk(w, h), c = cvs.getContext('2d');
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f4f6f8'); g.addColorStop(1, '#c9d0d6');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const step = Math.max(12, Math.round(w / 5));
    for (let x = step; x < w; x += step) line(c, x, 0, x, h - 14, 'rgba(0,0,0,0.12)', 1);
    for (let x = 10; x < w - 10; x += Math.max(24, Math.round(w / 3))) for (let y = 14; y < h - 24; y += Math.max(20, Math.round(h / 5))) {
      c.fillStyle = '#fffbe0'; c.fillRect(x, y, 10, 3); c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.6; c.strokeRect(x, y, 10, 3);
    }
    c.fillStyle = '#d42f2f'; c.fillRect(0, h - 14, w, 14);
    c.fillStyle = '#1f9d55'; c.fillRect(0, h - 16, w, 2);
    c.fillStyle = '#fff'; fitFont(c, 'BENZÍNKA', w * 0.7, 11); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(loc.canopyLabel || 'BENZÍNKA', w / 2, h - 7);
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.strokeRect(1, 1, w - 2, h - 2);
    return cvs;
  }
  R2.drawCanopy = function (c, v, dt, fx, fz) {
    const M = Mp();
    if (!M) return;
    const k = lerpExp(dt || 0, 6);
    for (const loc of locList(M)) {
      if (!loc.canopy) continue;
      const rc = canopyRect(loc);
      if (!rc) continue;
      if (!canopyCache || canopyCache.key !== loc.id || canopyCache.w !== rc.w || canopyCache.d !== rc.d) {
        canopyCache = { key: loc.id, cv: makeCanopy(loc, rc), w: rc.w, d: rc.d, alpha: 0.9 };
      }
      const cc = canopyCache;
      // je fokus pod prístreškom? (v lokálnych súradniciach)
      const cs = Math.cos(rc.rot), sn = Math.sin(rc.rot), dx = fx - rc.x, dz = fz - rc.z;
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const under = Math.abs(lx) <= rc.w / 2 && Math.abs(lz) <= rc.d / 2;
      const tgt = under ? 0.25 : 0.9;
      cc.alpha += (tgt - cc.alpha) * k; if (Math.abs(tgt - cc.alpha) < 0.004) cc.alpha = tgt;
      if (!inView(v, rc.x, rc.z, Math.hypot(rc.w, rc.d) / 2)) continue;
      c.save();
      c.globalAlpha = cc.alpha;
      c.translate(rc.x, rc.z); c.rotate(rc.rot);
      c.drawImage(cc.cv, -rc.w / 2, -rc.d / 2, rc.w, rc.d);
      c.restore();
      c.globalAlpha = 1;
      break; // jeden prístrešok (benzínka)
    }
  };

  // ---------- noc ----------
  function drawNight(v) {
    const t = curTime();
    let d = darkness(t);
    if (R2.weatherState === 'rain') d = Math.max(d, 0.12);
    if (d <= 0.01 || !lctx) return;
    const zl = zoom() * dpr * LS;          // px light-mapy na meter
    const ox = (W / 2 - R2.cam.x * zoom()) * dpr * LS, oz = (H / 2 - R2.cam.z * zoom()) * dpr * LS;
    const sx = (x) => x * zl + ox, sz = (z) => z * zl + oz;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.fillStyle = `rgba(8,12,38,${d})`;
    lctx.fillRect(0, 0, lc.width, lc.height);
    lctx.globalCompositeOperation = 'destination-out';
    const hole = (x, z, r, a) => {
      const g = lctx.createRadialGradient(sx(x), sz(z), 0, sx(x), sz(z), r * zl);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath(); lctx.arc(sx(x), sz(z), r * zl, 0, TAU); lctx.fill();
    };
    const M = Mp(), A = Ac();
    const night = darkness(t) > 0.3;
    // osvetlené interiéry
    if (M && night) {
      for (const loc of locList(M)) {
        if (!hasRoof(loc) || loc.dark || !inView(v, loc.x, loc.z, Math.hypot(loc.w, loc.d) / 2)) continue;
        lctx.save();
        lctx.translate(sx(loc.x), sz(loc.z)); lctx.rotate(loc.rotY || 0);
        lctx.fillStyle = 'rgba(0,0,0,0.55)';
        lctx.fillRect(-loc.w / 2 * zl, -loc.d / 2 * zl, loc.w * zl, loc.d * zl);
        lctx.restore();
      }
    }
    // lampy
    if (M && Array.isArray(M.lamps) && night) {
      for (const l of M.lamps) { if (inView(v, l.x, l.z, 14)) hole(l.x, l.z, 12, 0.85); }
    }
    if (A) {
      const p = A.player || {}, c = A.car;
      if (!p.inCar && typeof p.x === 'number') hole(p.x, p.z, 17, 0.9);
      // reflektory Fabie a premávky
      const beams = [];
      if (c) beams.push(c);
      for (const tr of (A.traffic || [])) if (tr && tr.active !== false) beams.push(tr);
      for (const car of beams) {
        if (!inView(v, car.x, car.z, 40)) continue;
        if (car === c && !p.inCar && Math.abs(c.speed || 0) < 1) continue;
        const len = car === c ? 38 : 26;
        const hx = car.x + Math.cos(car.a) * 2.2, hz = car.z + Math.sin(car.a) * 2.2;
        const g = lctx.createRadialGradient(sx(hx), sz(hz), 0, sx(hx), sz(hz), len * zl);
        g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.moveTo(sx(hx), sz(hz));
        lctx.arc(sx(hx), sz(hz), len * zl, car.a - 0.42, car.a + 0.42);
        lctx.closePath(); lctx.fill();
        hole(car.x, car.z, 6, 0.5);
      }
    }
    lctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lc, 0, 0, lc.width, lc.height, 0, 0, cv.width, cv.height);
    // teplý nádych lámp
    if (M && Array.isArray(M.lamps) && night) {
      setWorld();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of M.lamps) {
        if (!inView(v, l.x, l.z, 10)) continue;
        const g = ctx.createRadialGradient(l.x, l.z, 0, l.x, l.z, 9);
        g.addColorStop(0, `rgba(255,170,70,${0.22 * d})`); g.addColorStop(1, 'rgba(255,170,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(l.x, l.z, 9, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- šípka k cieľu ----------
  function questTargets(ev, q) {
    if (!ev || !q || typeof ev.targets !== 'function' || typeof ev.hsPos !== 'function') return [];
    let ids = []; try { ids = ev.targets(q) || []; } catch (e) { ids = []; }
    const out = [];
    for (const id of ids) {
      if (id === 'phone') continue;
      let pos = null; try { pos = ev.hsPos(id); } catch (e) { pos = null; }
      if (pos && typeof pos.x === 'number') out.push(pos);
    }
    return out;
  }
  function drawArrow() {
    const s = S(), ev = Ev(), A = Ac();
    if (!s || !ev || !A || typeof ev.active !== 'function') return;
    if (s.hideArrow > 0) return;
    let act = null; try { act = ev.active(); } catch (e) { act = null; }
    if (!act) return;
    const f = typeof A.focusPos === 'function' ? A.focusPos() : { x: R2.cam.x, z: R2.cam.z };
    const ts = questTargets(ev, act);
    if (!ts.length) return;
    let best = ts[0], bd = Infinity;
    for (const t of ts) { const dd = Math.hypot(t.x - f.x, t.z - f.z); if (dd < bd) { bd = dd; best = t; } }
    if (bd < 13) return;
    const ang = Math.atan2(best.z - f.z, best.x - f.x);
    const inCar = !!(A.player && A.player.inCar);
    const R = inCar ? 8.6 : 5.8, sc = inCar ? 1.5 : 1;
    const ax = f.x + Math.cos(ang) * R, az = f.z + Math.sin(ang) * R;
    ctx.save();
    ctx.translate(ax, az); ctx.rotate(ang); ctx.scale(0.1 * sc, 0.1 * sc);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffc440';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
    const lx = f.x + Math.cos(ang) * (R + 3 * sc), lz = f.z + Math.sin(ang) * (R + 3 * sc);
    const icon = (act.def && act.def.icon) || (act.icon) || '';
    screenText(`${icon} ${Math.round(bd)} m`.trim(), lx, lz, 'bold 13px system-ui, sans-serif', '#ffe2a0', 'rgba(15,18,20,0.75)');
  }

  // ---------- bublina hráča (len ak UI nemá HTML bubliny) ----------
  function wrapText(c, text, maxW) {
    const words = String(text).split(' '), lines = [];
    let ln = '';
    for (const w of words) {
      const t = ln ? ln + ' ' + w : w;
      if (c.measureText(t).width > maxW && ln) { lines.push(ln); ln = w; } else ln = t;
    }
    if (ln) lines.push(ln);
    return lines;
  }
  function drawBubble() {
    const s = S(), A = Ac();
    if (!s || !s.bubble || !s.bubble.text) return;
    if (G.UI && typeof G.UI.bubble === 'function') return; // HTML bubliny rieši UI
    const f = A && typeof A.focusPos === 'function' ? A.focusPos() : { x: R2.cam.x, z: R2.cam.z };
    const pr = R2.project(f.x, f.z);
    ctx.save(); setScreen();
    ctx.font = '600 14px system-ui, sans-serif';
    const lines = wrapText(ctx, s.bubble.text, 230);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const h = lines.length * 18 + 14;
    const x = pr.sx - w / 2, y = pr.sy - 1.2 * zoom() - 14 - h;
    ctx.globalAlpha = clamp((s.bubble.t || 0) * 3, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
    rrect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(pr.sx - 7, y + h); ctx.lineTo(pr.sx + 7, y + h); ctx.lineTo(pr.sx, y + h + 9); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1b1d20'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, pr.sx, y + 8 + i * 18));
    ctx.restore();
    setWorld();
  }

  // ---------- celý snímok ----------
  R2.render = function (dt) {
    dt = typeof dt === 'number' ? dt : 0;
    if (!ctx) return;
    clock += dt;
    const M = Mp(), A = Ac();
    const v = computeView();
    const f = A && typeof A.focusPos === 'function' ? A.focusPos() : { x: R2.cam.x, z: R2.cam.z };
    const mapW = CFG().W || (M && M.W) || 640, mapH = CFG().H || (M && M.H) || 440;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2b4424';
    ctx.fillRect(0, 0, cv.width, cv.height);
    setWorld();
    // zem
    const gc = M && M.groundCanvas;
    if (gc && gc.width) {
      const GS = M.GS || gc.width / mapW;
      const x0 = Math.max(0, v.x), z0 = Math.max(0, v.z);
      const x1 = Math.min(mapW, v.x + v.w), z1 = Math.min(mapH, v.z + v.h);
      if (x1 > x0 && z1 > z0) {
        ctx.imageSmoothingEnabled = true;
        try { ctx.imageSmoothingQuality = zoom() >= GS ? 'medium' : 'high'; } catch (e) { /* noop */ }
        ctx.drawImage(gc, x0 * GS, z0 * GS, (x1 - x0) * GS, (z1 - z0) * GS, x0, z0, x1 - x0, z1 - z0);
      }
    }
    drawHotspotDots(v);
    drawMarkers(v);
    R2.drawActors(ctx, v);
    R2.drawTrees(ctx, v, f.x, f.z);
    R2.drawRoofs(ctx, v, dt, f.x, f.z);
    R2.drawCanopy(ctx, v, dt, f.x, f.z);
    drawNight(v);
    drawRain(dt);
    setWorld();
    R2.drawTags();
    if (G.debugSolids) {
      // ladenie: prekážky pre chôdzu (červené) + kruh hráča
      const Mx = Mp(); ctx.save(); ctx.lineWidth = 0.08; ctx.strokeStyle = 'rgba(255,40,40,0.9)'; ctx.fillStyle = 'rgba(255,40,40,0.18)';
      for (const r of (Mx && Mx.solidsWalk) || []) {
        if (!inView(v, r.x, r.z, Math.hypot(r.w, r.d))) continue;
        ctx.save(); ctx.translate(r.x, r.z); ctx.rotate(r.rot || 0); ctx.fillRect(-r.w / 2, -r.d / 2, r.w, r.d); ctx.strokeRect(-r.w / 2, -r.d / 2, r.w, r.d); ctx.restore();
      }
      const pl = G.Act && G.Act.player; if (pl) { ctx.strokeStyle = 'rgba(80,200,255,0.95)'; ctx.beginPath(); ctx.arc(pl.x, pl.z, 0.4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    drawArrow();
    drawBubble();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  return R2;
})();
