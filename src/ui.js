// UI vrstva v3: HUD, GTA minimapa, veľká mapa, HTML bubliny (nad 2D canvasom), telefón, zvonenie, SMS, grab, minihry, súhrn dňa, štart.
(() => {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const eur = (n) => (n < 0 ? '-' : '') + Math.abs(n).toFixed(2).replace('.', ',') + ' €';
  const num2 = (n) => n.toFixed(2).replace('.', ',');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const click = () => { try { G.Audio && G.Audio.click(); } catch (e) {} };
  const snd = (n) => { try { G.Audio && G.Audio[n] && G.Audio[n](); } catch (e) {} };
  const hm = (m) => {
    if (G.Q && G.Q.hm) return G.Q.hm(m);
    m = Math.max(0, Math.floor(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  // aktéri: v2 G.Act (x,z); fallback v1 G.Ent (x,y)
  const A = () => G.Act || G.Ent || null;
  const pz = (o) => (o.z != null ? o.z : o.y);

  // ---------------------------------------------------------------- portrét
  function portraitSVG(uid) {
    const u = 'p' + uid;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(G.CFG.hero)}">
<defs>
  <filter id="${u}bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <radialGradient id="${u}bg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#8fae7a"/><stop offset=".55" stop-color="#4f7048"/><stop offset="1" stop-color="#26392a"/></radialGradient>
  <linearGradient id="${u}sk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1c4a0"/><stop offset="1" stop-color="#d79e78"/></linearGradient>
  <linearGradient id="${u}cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3f6e"/><stop offset="1" stop-color="#16213f"/></linearGradient>
  <linearGradient id="${u}br" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8653a"/><stop offset="1" stop-color="#7a4424"/></linearGradient>
  <linearGradient id="${u}tee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6d6b4"/><stop offset="1" stop-color="#bfa982"/></linearGradient>
  <pattern id="${u}mesh" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#1a2747"/><circle cx="1.5" cy="1.5" r=".8" fill="#43557f"/></pattern>
  <clipPath id="${u}back"><rect x="60" y="0" width="40" height="40"/></clipPath>
</defs>
<rect width="100" height="100" fill="url(#${u}bg)"/>
<g filter="url(#${u}bl)" opacity=".85">
  <circle cx="12" cy="18" r="14" fill="#b9d39a"/><circle cx="88" cy="22" r="16" fill="#3d5e3a"/>
  <circle cx="84" cy="70" r="14" fill="#6f9460"/><circle cx="8" cy="70" r="12" fill="#2f4a33"/>
</g>
<!-- tričko -->
<path d="M0 100 L0 93 C10 87 28 84 42 86 L66 86 C80 86 94 90 100 95 L100 100 Z" fill="url(#${u}tee)"/>
<path d="M41 86 C46 92 60 92 67 86" fill="none" stroke="#a8946e" stroke-width="1.6"/>
<!-- krk a hlava -->
<path d="M34 30 L72 30 C78 42 77 60 69 68 L67 88 C58 90 50 90 42 89 L42 76 L33 68 L30 61 L27.5 59.5 L29 57.5 L23.5 55.5 C21 54.5 21.5 51.5 24 50.5 L30 44 C31 41 31 38 32 36 Z" fill="url(#${u}sk)"/>
<path d="M66 68 L64 86" stroke="#c48a66" stroke-width="2" opacity=".5"/>
<!-- tetovania na krku -->
<g fill="none" stroke="#28303c" stroke-width="1" stroke-linecap="round" opacity=".8">
  <path d="M48 77 c2 -3 4 3 6 0 s3 -3 5 0"/>
  <path d="M46 81 c1.5 -2 3 2 4.5 0 c1.5 -2 3 2 4.5 0 c1 -1.5 2 1.5 4 -0.5"/>
  <path d="M58 72 q3 2 2 5 q-1 2 2 4"/>
  <path d="M51 84.5 l3 -1.5 l2 1.5 l3 -1.5"/>
</g>
<!-- ucho -->
<ellipse cx="64.5" cy="51" rx="4.2" ry="6.4" fill="#dca07a"/>
<path d="M65.5 47 q-2.5 3 -0.5 7" fill="none" stroke="#b77a58" stroke-width="1"/>
<circle cx="64" cy="57.6" r="1.5" fill="#111"/><circle cx="63.6" cy="57.2" r=".4" fill="#777"/>
<!-- svetlé vlasy pri spánku -->
<path d="M58 37 L70 37 C70 41 69 44 67 46 C65 43 61 41 58 41 Z" fill="#c8a376"/>
<path d="M60 38 l1 3 M63 38 l1 3.5 M66 38 l.8 4" stroke="#a9845a" stroke-width=".6"/>
<!-- oko a obočie -->
<path d="M34.5 41.5 q4 -2.2 8 -.5" fill="none" stroke="#6e3f22" stroke-width="2" stroke-linecap="round"/>
<path d="M35 46 q2.5 -1.6 5 0" fill="none" stroke="#2a1a12" stroke-width="1.4" stroke-linecap="round"/>
<circle cx="36.4" cy="46" r=".9" fill="#2a1a12"/>
<!-- brada -->
<path d="M63 44 L63 57 C64.5 67 59 78 49 82 C40 85 32 80 29.2 72.5 C28.2 68.5 29 64.5 30.5 62.5 L34.5 62.3 C36 60.8 34.8 58.8 30.5 58.6 L30.8 56.8 C36 56.6 40 58 44 56 C51 53 56 50 58 44 Z" fill="url(#${u}br)"/>
<g stroke="#5e3218" stroke-width=".7" opacity=".7" fill="none">
  <path d="M36 66 l1 4 M40 64 l1 5 M45 62 l1 6 M50 60 l.5 7 M55 58 l0 7 M59 54 l-1 7 M33 72 l2 3 M42 74 l1 4 M50 74 l0 4"/>
</g>
<path d="M31 60.4 L35 60.6" stroke="#8d4a3a" stroke-width="1.3" stroke-linecap="round"/>
<!-- nos a krúžok -->
<path d="M24 50.5 C22 52 22.3 54.6 24.5 55.4" fill="none" stroke="#c58a66" stroke-width=".8"/>
<circle cx="25.4" cy="56.3" r="1.7" fill="none" stroke="#111" stroke-width=".9"/>
<!-- šiltovka -->
<path d="M29 37.5 C29 19 48 10 64 13 C76 15.5 81 25 79 38.5 L29 38.5 Z" fill="url(#${u}cap)"/>
<path d="M29 37.5 C29 19 48 10 64 13 C76 15.5 81 25 79 38.5 L29 38.5 Z" fill="url(#${u}mesh)" clip-path="url(#${u}back)"/>
<path d="M60 14 C61 22 61 30 60 38.5" fill="none" stroke="#0f1830" stroke-width="1"/>
<path d="M29 38.5 L79 38.5" stroke="#0f1830" stroke-width="1.6"/>
<path d="M77 34 L82 37" stroke="#0f1830" stroke-width="2" stroke-linecap="round"/>
<circle cx="56" cy="13.6" r="1.6" fill="#22325b"/>
<!-- logo -->
<g transform="translate(41 26)">
  <path d="M-6 -4 L6 -4 L4 4 L-4 4 Z" fill="#ffc440" stroke="#b9860f" stroke-width=".6"/>
  <path d="M-2.5 -1.8 L2.5 -1.8 L0 2.4 Z" fill="#1c2a4c"/>
</g>
<path d="M33 20 C37 16 44 14 50 14" fill="none" stroke="#5b73a8" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
<!-- šilt -->
<path d="M34 36.5 C25 35.5 14 37.5 6.5 42.5 C7 44.5 9 45 11 44.6 C18 42 27 40.6 36 40.8 Z" fill="#1a2748"/>
<path d="M7 43 C15 39.5 25 38 35 38.6" fill="none" stroke="#3a4f80" stroke-width=".8"/>
<path d="M11 44.6 C18 42.2 27 41 36 41" fill="none" stroke="#0a1126" stroke-width="1.2" opacity=".7"/>
<!-- retiazky -->
<path d="M42 86.5 C46 95 61 95 67 86.5" fill="none" stroke="#d9dde3" stroke-width="1.3" stroke-dasharray="1.6 .8"/>
<path d="M41.5 87.5 C46 99 62 99 67.5 87.5" fill="none" stroke="#aeb4bd" stroke-width="1.1" stroke-dasharray="1.2 .9"/>
<circle cx="54.5" cy="97" r="1.6" fill="#e5e8ec"/>
</svg>`;
  }

  // ---------------------------------------------------------------- stav UI
  const UI = { modal: false };
  let els = {}, qTimer = 0, qItems = [], lastPrompt = '', inited = false;
  let modalKeys = null, startKeys = null, bigKeys = null;
  let clock = 0, dayLabel = null, streetT = 0;

  UI.portraitSVG = portraitSVG;

  function ensure(id, parent, tag, cls) {
    let e = $(id);
    if (!e) { e = document.createElement(tag || 'div'); e.id = id; if (cls) e.className = cls; (parent || document.body).appendChild(e); }
    return e;
  }

  UI.init = function () {
    if (inited) return; inited = true;
    const hud = ensure('hud', document.body);
    els = {
      hud, portrait: ensure('portrait', hud), stats: ensure('stats', hud), day: ensure('day', hud), time: ensure('time', hud),
      quests: ensure('quests', hud), prompt: ensure('prompt', hud), cardash: ensure('cardash', hud), toasts: ensure('toasts', hud),
      fxpops: ensure('fxpops', hud), hyper: ensure('hyper', hud), modal: ensure('modal', document.body), start: ensure('start', document.body),
      minimap: $('minimap'), street: $('street'), daytype: $('daytype'), weather: $('weather'), pets: $('pets'),
      bigmap: $('bigmap'), bigc: $('bigmapCanvas'), bubbles: ensure('bubbles', document.body),
      ring: ensure('ring', document.body), sms: ensure('smsbar', document.body), game: $('game'),
    };
    els.ring.classList.add('hidden');
    els.box = ensure('modalBox', els.modal);
    if (!els.minimap) {
      const w = ensure('mmwrap', hud); els.minimap = document.createElement('canvas'); els.minimap.id = 'minimap'; w.appendChild(els.minimap);
      els.street = ensure('street', w);
    }
    els.portrait.innerHTML = portraitSVG('hud');
    els.stats.innerHTML = `
      <div class="name"><span>${esc(G.CFG.hero)}</span><small>otec • šéfkuchár • šofér</small></div>
      <div class="bar en"><span>Energia</span><div class="track"><div class="fill"></div></div><span class="v">0</span></div>
      <div class="bar ne"><span>Nervy</span><div class="track"><div class="fill"></div></div><span class="v">0</span></div>
      <div class="bar fo"><span>Fokus</span><div class="track"><div class="fill"></div></div><span class="v">0</span></div>
      <div class="vals"><span class="mo">💰 0,00 €</span><span class="re">⭐ 0</span><span class="da">👧 0</span><span class="no">📝 0</span></div>`;
    const bars = els.stats.querySelectorAll('.bar');
    els.bars = [...bars].map((b) => ({ el: b, fill: b.querySelector('.fill'), v: b.querySelector('.v'), last: -1 }));
    els.mo = els.stats.querySelector('.mo'); els.re = els.stats.querySelector('.re');
    els.da = els.stats.querySelector('.da'); els.no = els.stats.querySelector('.no');

    els.quests.innerHTML = `<div class="qh"><span>ZOZNAM V HLAVE</span><span class="cnt">0</span></div>
      <div class="qlist"></div><div class="qf">Tab prepni • N papierik • F mobil • M mapa</div>`;
    els.qcnt = els.quests.querySelector('.cnt'); els.qlist = els.quests.querySelector('.qlist');
    els.qlist.addEventListener('click', (e) => {
      const it = e.target.closest('.qi'); if (!it) return;
      const q = qItems[+it.dataset.i];
      if (q && G.Q && G.Q.bringTop) { click(); G.Q.bringTop(q); qTimer = 0; }
    });
    els.cardash.innerHTML = `<span class="model">ŠKODA FABIA</span><div class="spd"><span class="kmh">0</span><small>km/h</small></div>
      <div class="fuel"><span class="lamp">⛽</span><div class="ftrack"><div class="ffill"></div></div><span class="fl">0,0 L</span></div>
      <div class="warn hidden"></div><div class="calld hidden">📵 telefonuješ za volantom</div>`;
    els.calld = els.cardash.querySelector('.calld');
    els.kmh = els.cardash.querySelector('.kmh'); els.ffill = els.cardash.querySelector('.ffill');
    els.fl = els.cardash.querySelector('.fl'); els.lamp = els.cardash.querySelector('.lamp'); els.cwarn = els.cardash.querySelector('.warn');
    if (els.pets) {
      els.petDog = els.pets.querySelector('.chip.dog'); els.petKid = els.pets.querySelector('.chip.kid');
      if (els.petDog) { els.petDog.querySelector('b').textContent = G.CFG.dog; els.petDogSt = els.petDog.querySelector('.st'); }
      if (els.petKid) { els.petKid.querySelector('b').textContent = G.CFG.kid; els.petKidSt = els.petKid.querySelector('.st'); }
    }
    if (els.daytype && dayLabel) UI.setDayType(dayLabel);
    initMinimap();
    window.addEventListener('resize', () => { initMinimap(); if (bigOpen) sizeBig(); });
  };

  // ---------------------------------------------------------------- toasty / notifikácie
  function addToast(node, life) {
    els.toasts.appendChild(node);
    while (els.toasts.children.length > 5) els.toasts.removeChild(els.toasts.firstChild);
    setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 450); }, life);
  }
  UI.toast = function (text, kind) {
    if (!inited) UI.init();
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || 'info');
    d.textContent = text;
    addToast(d, 3400);
  };
  UI.notify = function (icon, title, text) {
    if (!inited) UI.init();
    const d = document.createElement('div');
    d.className = 'notif';
    const t = G.S ? hm(G.S.time) : 'teraz';
    d.innerHTML = `<div class="ic">${esc(icon || '📱')}</div><div class="bd"><div class="hd"><span>Správy</span><span>${esc(t)}</span></div>
      <div class="tt">${esc(title)}</div><div class="tx">${esc(text)}</div></div>`;
    addToast(d, 5000);
    snd('vibrate');
  };

  // ---------------------------------------------------------------- bubliny (HTML nad scénou)
  const bubbles = []; // {key, who, text, t, el}
  // h = výška pre starý 3D projektor (fallback), lift = násobok zoomu (px/m) o koľko ide bublina nad hlavu v 2D
  function whoPos(who) {
    if (!who) return null;
    if (typeof who === 'object') {
      const Ac0 = A();
      const isDog = who.kind === 'dog' || who.type === 'dog' || (Ac0 && who === Ac0.dog);
      return { x: who.x, z: pz(who), h: who.h != null ? who.h : 2.1, lift: who.lift != null ? who.lift : isDog ? 0.8 : 1.3 };
    }
    const Ac = A(); if (!Ac) return null;
    if (who === 'player') {
      let p = Ac.player; if (!p) return null;
      if (p.inCar && Ac.car) return { x: Ac.car.x, z: pz(Ac.car), h: 2.0, lift: 1.3 };
      return { x: p.x, z: pz(p), h: 2.1, lift: 1.3 };
    }
    if (who === 'kid') { const k = Ac.kid; return k ? { x: k.x, z: pz(k), h: 1.5, lift: 1.3 } : null; }
    if (who === 'dog') { const d = Ac.dog; return d ? { x: d.x, z: pz(d), h: 1.0, lift: 0.8 } : null; }
    if (who === 'car') { const c = Ac.car; return c ? { x: c.x, z: pz(c), h: 2.0, lift: 1.3 } : null; }
    const n = Ac.npcs; let o = null;
    if (Array.isArray(n)) o = n.find((e) => e && (e.id === who || e.name === who));
    else if (n && typeof n === 'object') o = n[who];
    if (o && o.x != null) return { x: o.x, z: pz(o), h: 2.1, lift: 1.3 };
    const h = G.Map && G.Map.hs && G.Map.hs[who];
    if (h) return { x: h.x, z: pz(h), h: 2.1, lift: 1.3 };
    return null;
  }
  UI.bubble = function (who, text, dur, cls) {
    if (!inited) UI.init();
    if (!text) return;
    const key = typeof who === 'object' ? 'pt:' + Math.round(who.x) + ':' + Math.round(pz(who)) : String(who || 'player');
    let b = bubbles.find((x) => x.key === key);
    if (!b) {
      b = { key, who, el: document.createElement('div') };
      b.el.style.display = 'none';
      els.bubbles.appendChild(b.el);
      bubbles.push(b);
    } else { b.who = who; b.el.style.animation = 'none'; void b.el.offsetWidth; b.el.style.animation = ''; }
    b.el.className = 'bubble ' + (who === 'kid' ? 'kid' : who === 'dog' ? 'dog' : who === 'player' ? 'me' : 'npc') + (cls ? ' ' + cls : '');
    b.text = String(text); b.el.textContent = b.text;
    b.t = dur == null ? (who === 'dog' ? 1.6 : 3.2 + Math.min(3, b.text.length / 40)) : dur;
    placeBubble(b);
  };
  // 2D: G.R2.project(x,z) -> {sx,sy}; bublina ide nad hlavu o lift·zoom px. Fallback: starý G.Scene.project(x,h,z).
  function placeBubble(b) {
    const p = whoPos(b.who);
    const R2 = G.R2, Sc = G.Scene;
    if (!p || !((R2 && R2.project) || (Sc && Sc.project))) { b.el.style.display = 'none'; return; }
    let pr = null, lift = 10;
    try {
      if (R2 && R2.project) { pr = R2.project(p.x, p.z); lift = (p.lift || 1.3) * ((R2.cam && R2.cam.zoom) || 12); }
      else pr = Sc.project(p.x, p.h, p.z);
    } catch (e) { pr = null; }
    if (!pr || pr.visible === false || !isFinite(pr.sx) || !isFinite(pr.sy)) { b.el.style.display = 'none'; return; }
    b.el.style.display = '';
    b.el.style.left = pr.sx.toFixed(1) + 'px';
    b.el.style.top = (pr.sy - lift).toFixed(1) + 'px';
    b.el.style.opacity = clamp(b.t * 3, 0, 1).toFixed(2);
  }
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t -= dt;
      if (b.t <= 0) { b.el.remove(); bubbles.splice(i, 1); continue; }
      placeBubble(b);
    }
    // kompatibilita: ak niekto nastavil G.S.bubble priamo, zobraz ju ako HTML bublinu hráča
    const S = G.S;
    if (S && S.bubble && !S.bubble.ui) { S.bubble.ui = true; UI.bubble('player', S.bubble.text, S.bubble.t); }
  }
  UI.say = function (text, dur) {
    const d = dur == null ? 3.2 : dur;
    if (G.S) G.S.bubble = { text, t: d, ui: true };
    UI.bubble('player', text, d);
  };

  // ---------------------------------------------------------------- fx čipy
  const FX = {
    money: { ic: '€', good: 1 }, rep: { ic: '⭐', good: 1 }, dad: { ic: '👧', good: 1 },
    focus: { ic: '🧠', good: 1 }, energy: { ic: '⚡', good: 1 }, nervy: { ic: '😤', good: -1 }, time: { ic: 'min ⏱️', good: -1 },
  };
  let fxN = 0;
  UI.fx = function (obj) {
    if (!obj || !inited) return;
    let i = 0;
    for (const k in FX) {
      const v = obj[k];
      if (typeof v !== 'number' || !v) continue;
      const f = FX[k];
      const val = k === 'money' ? (Math.round(v) === v ? String(Math.abs(v)) : num2(Math.abs(v))) : String(Math.round(Math.abs(v)));
      const d = document.createElement('div');
      d.className = 'fxp ' + (v * f.good > 0 ? 'pos' : 'neg');
      d.textContent = (v > 0 ? '+' : '-') + val + ' ' + f.ic;
      d.style.left = (((fxN++ % 4) * 58) + i * 6) + 'px';
      d.style.animationDelay = (i * 0.12) + 's';
      d.style.opacity = '0';
      els.fxpops.appendChild(d);
      setTimeout(() => d.remove(), 2200 + i * 120);
      i++;
    }
  };

  // ---------------------------------------------------------------- prompt
  UI.setPrompt = function (label, progress) {
    if (!inited) return;
    if (label == null) {
      if (lastPrompt !== null) { els.prompt.classList.add('hidden'); lastPrompt = null; }
      return;
    }
    const key = label + '|' + (progress == null ? '' : 1);
    if (key !== lastPrompt) {
      els.prompt.innerHTML = `<kbd>E</kbd> ${esc(label)}` + (progress != null ? '<div class="pb"><div></div></div>' : '');
      els.prompt.classList.remove('hidden');
      lastPrompt = key;
    }
    if (progress != null) {
      const b = els.prompt.querySelector('.pb div');
      if (b) b.style.width = (clamp(progress, 0, 1) * 100).toFixed(1) + '%';
    }
  };

  // ---------------------------------------------------------------- typ dňa / počasie / zvieratká
  UI.setDayType = function (label) {
    dayLabel = label || null;
    if (!els.daytype) return;
    els.daytype.textContent = 'Dnes: ' + (label || '???');
    els.daytype.classList.toggle('known', !!label);
  };
  const DOG_ST = { home: 'doma', follow: 'za tebou', car: 'v aute', kuchyna: 'v kuchyni', park: 'v parku', lost: 'stratený!', vet: 'u veterinára', skolka: 'pri škôlke' };
  const KID_ST = { home: 'doma', follow: 'za tebou', car: 'v aute', skolka: 'v škôlke', lost: 'stratená!', sick: 'chorá, s tebou', babka: 'u babky', ex: 'u mamy', away: 'u Simony' };
  function setChip(chip, stEl, st, map) {
    if (!chip) return;
    const label = map[st] || st || '?';
    if (stEl.textContent !== label) stEl.textContent = label;
    const cls = chip.className.replace(/\b(home|follow|car|kuchyna|park|lost|vet|skolka|sick|babka|ex)\b/g, '').replace(/\s+/g, ' ').trim();
    const nc = cls + ' ' + (st || '');
    if (chip.className !== nc) chip.className = nc;
  }
  function updatePets() {
    const Ac = A(); if (!Ac) return;
    if (Ac.dog) setChip(els.petDog, els.petDogSt, Ac.dog.state, DOG_ST);
    if (Ac.kid) setChip(els.petKid, els.petKidSt, Ac.kid.state, KID_ST);
    if (els.weather && G.S) {
      const w = G.S.weather;
      const t = w === 'rain' ? '🌧️' : w === 'storm' ? '⛈️' : w === 'fog' ? '🌫️' : (G.S.time || 0) > 19 * 60 || (G.S.time || 0) < 6 * 60 ? '🌙' : '☀️';
      if (els.weather.textContent !== t) els.weather.textContent = t;
      els.weather.title = w === 'rain' ? 'Prší – šmýka sa' : 'Jasno';
    }
  }

  // ---------------------------------------------------------------- update HUD
  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

  function stepText(st) {
    if (!st) return '';
    return st.label || st.text || st.t || st.desc || st.title || '';
  }
  function isPhone(st) {
    if (!st) return false;
    const a = st.at;
    return a === 'phone' || (Array.isArray(a) && a.indexOf('phone') >= 0);
  }

  function buildQuests() {
    const S = G.S;
    if (!S || !S.stack) { els.qlist.innerHTML = ''; setText(els.qcnt, '0'); return; }
    let list = S.stack.slice();
    const act = G.Q && G.Q.active ? G.Q.active() : null;
    // G.S.stack[0] = aktívny; poradie poľa sa zachová
    if (act) { list = list.filter((q) => q !== act); list.unshift(act); }
    qItems = list;
    setText(els.qcnt, String(list.length));
    if (!list.length) { els.qlist.innerHTML = '<div class="qempty">Hlava je prázdna. Podozrivé.</div>'; return; }
    const fade0 = G.CFG.forgetFade, now = S.time;
    let html = '';
    list.forEach((q, i) => {
      const def = q.def || {};
      const steps = def.steps || [];
      let st = null;
      try { st = G.Q.stepOf ? G.Q.stepOf(q) : steps[q.step]; } catch (e) { st = steps[q.step]; }
      const title = (def.icon ? def.icon + ' ' : '') + (q.title || def.title || def.name || def.t || q.id);
      const top = i === 0;
      let op = 1, fading = false;
      if (!top && q.idle != null) {
        const f1 = def.forget || G.CFG.forgetTime;
        if (q.idle > fade0) { fading = true; op = 1 - 0.75 * clamp((q.idle - fade0) / Math.max(1, f1 - fade0), 0, 1); }
      }
      const meta = [];
      if (q.deadline != null) {
        const left = q.deadline - now;
        if (q.late || left < 0) meta.push('<span class="dl late">⏰ MEŠKÁŠ</span>');
        else meta.push(`<span class="dl${left < 20 ? ' warn' : ''}">⏰ do ${esc(hm(q.deadline))}</span>`);
      }
      if (isPhone(st)) meta.push('<span class="ph">📱 F</span>');
      if (fading) meta.push('<span class="fade">bledne…</span>');
      const stepN = steps.length > 1 ? `<span class="stepn">krok ${Math.min((q.step || 0) + 1, steps.length)}/${steps.length}</span>` : '';
      html += `<div class="qi${top ? ' top' : ''}" data-i="${i}" style="opacity:${op.toFixed(2)}">
        <div class="qt">${q.pinned ? '📌' : ''}<span class="ttl">${esc(title)}</span>${top ? stepN : ''}</div>
        ${(top || i < 3) && stepText(st) ? `<div class="qs">${esc(stepText(st))}</div>` : ''}
        ${meta.length ? `<div class="qm">${meta.join('')}</div>` : ''}</div>`;
    });
    els.qlist.innerHTML = html;
  }

  UI.update = function (dt) {
    if (!inited) UI.init();
    dt = dt || 0;
    clock += dt;
    const S = G.S;
    if (S) {
      const vals = [S.energy, S.nervy, S.focus];
      els.bars.forEach((b, i) => {
        const v = Math.round(clamp(vals[i] || 0, 0, 100));
        if (v !== b.last) { b.last = v; b.fill.style.width = v + '%'; b.v.textContent = v; }
      });
      els.bars[1].el.classList.toggle('hot', (S.nervy || 0) > 75);
      setText(els.mo, '💰 ' + eur(S.money || 0));
      setText(els.re, '⭐ ' + Math.round(S.rep || 0));
      setText(els.da, '👧 ' + Math.round(S.dad || 0));
      setText(els.no, '📝 ' + (S.notes == null ? 0 : S.notes));
      setText(els.day, G.DAYS[((S.day || 1) - 1) % 7] + ' • deň ' + (S.day || 1));
      setText(els.time, hm(S.time || 0));
      const hy = S.hyper > 0;
      els.hyper.classList.toggle('hidden', !hy);
      els.hud.classList.toggle('hyp', hy);
      if (hy) setText(els.hyper, '⚡ HYPERFOKUS ' + Math.ceil(S.hyper) + 's');
    }
    const Ac = A();
    const inCar = !!(Ac && Ac.player && Ac.player.inCar);
    els.cardash.classList.toggle('hidden', !inCar);
    if (inCar && Ac.car) {
      setText(els.kmh, String(Math.round(Math.abs(Ac.car.speed || 0) * (G.Act ? 3.6 : 0.12))));
      const fuel = Ac.car.fuel || 0, pct = clamp(fuel / G.CFG.tankL, 0, 1);
      els.ffill.style.width = (pct * 100).toFixed(1) + '%';
      els.ffill.classList.toggle('low', pct < 0.2);
      els.lamp.classList.toggle('on', pct < 0.2);
      setText(els.fl, fuel.toFixed(1).replace('.', ',') + ' L • ' + Math.round(pct * 100) + ' %');
      const w = [];
      if (Ac.car.flat) w.push('🛞 DEFEKT');
      if (Ac.car.battery != null && Ac.car.battery <= 0) w.push('🔋 BATÉRIA');
      if (Ac.car.engineLamp || Ac.car.lamp) w.push('⚠️ MOTOR');
      const wh = w.map((x) => `<span>${x}</span>`).join('');
      if (els.cwarn.innerHTML !== wh) els.cwarn.innerHTML = wh;
      els.cwarn.classList.toggle('hidden', !w.length);
      if (els.calld) els.calld.classList.toggle('hidden', !(S && S.callDriving > 0));
    }
    pumpRing();
    qTimer -= dt;
    if (qTimer <= 0) { qTimer = 0.2; buildQuests(); updatePets(); }
    try { drawMinimap(dt); } catch (e) { if (!UI._mmErr) { UI._mmErr = true; console.warn('minimap', e); } }
    try { updateBubbles(dt); } catch (e) {}
    if (bigOpen) { try { drawBig(); } catch (e) {} }
  };

  // ---------------------------------------------------------------- GTA minimapa
  const MM = 220, MM_FOOT = 1.6, MM_CAR = 1.0; // px/m pri 220px minimape
  let mmCtx = null, mmDpr = 1, mmScale = MM_FOOT, mmCss = MM;
  function initMinimap() {
    const c = els.minimap; if (!c) return;
    mmDpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    mmCss = r.width > 20 ? r.width : MM;
    c.width = c.height = Math.round(mmCss * mmDpr);
    mmCtx = c.getContext('2d');
  }
  function questTargets(q) {
    if (!q || !G.Q || !G.Q.targets) return [];
    try {
      return (G.Q.targets(q) || []).filter((id) => id !== 'phone').map((id) => (G.Q.hsPos ? G.Q.hsPos(id) : null))
        .filter((p) => p && p.x != null).map((p) => ({ x: p.x, z: pz(p) }));
    } catch (e) { return []; }
  }
  function focusInfo() {
    const Ac = A();
    let f = null, inCar = false, ang = 0;
    if (Ac) {
      inCar = !!(Ac.player && Ac.player.inCar);
      try { f = Ac.focusPos ? Ac.focusPos() : null; } catch (e) { f = null; }
      if (!f) f = inCar && Ac.car ? Ac.car : Ac.player;
      const src = inCar && Ac.car ? Ac.car : Ac.player;
      ang = src && typeof src.a === 'number' ? src.a : 0;
    }
    if (!f || f.x == null) f = { x: G.CFG.W / 2, z: G.CFG.H / 2 };
    return { x: f.x, z: pz(f), inCar, ang };
  }
  function arrow(ctx, x, y, ang, size, fill, stroke) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.75, -size * 0.7); ctx.lineTo(-size * 0.4, 0); ctx.lineTo(-size * 0.75, size * 0.7); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
  }
  function dot(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function drawMinimap(dt) {
    const ctx = mmCtx; if (!ctx) return;
    const Ac = A(), Mp = G.Map, S = G.S;
    const size = mmCss, R = size / 2;
    const fi = focusInfo();
    const target = fi.inCar ? MM_CAR : MM_FOOT;
    mmScale += (target - mmScale) * Math.min(1, dt * 3);
    const s = mmScale * (size / MM); // px obrazovky na meter
    ctx.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 0.5, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#17241a'; ctx.fillRect(0, 0, size, size);
    const mc = Mp && Mp.miniCanvas;
    if (mc && mc.width) {
      // miniCanvas má k px na meter (podľa G.CFG.W, nie natvrdo); ps = px obrazovky na px minimapy
      const k = mc.width / (G.CFG.W || mc.width), ps = s / k;
      const half = R / s;
      let sx = (fi.x - half) * k, sz = (fi.z - half) * k, sw = 2 * half * k, sh = 2 * half * k, dx = 0, dy = 0, dw = size, dh = size;
      if (sx < 0) { dx += -sx * ps; dw -= -sx * ps; sw += sx; sx = 0; }
      if (sz < 0) { dy += -sz * ps; dh -= -sz * ps; sh += sz; sz = 0; }
      if (sx + sw > mc.width) { const o = sx + sw - mc.width; sw -= o; dw -= o * ps; }
      if (sz + sh > mc.height) { const o = sz + sh - mc.height; sh -= o; dh -= o * ps; }
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mc, sx, sz, sw, sh, dx, dy, dw, dh);
      }
    }
    const toS = (x, z) => ({ x: R + (x - fi.x) * s, y: R + (z - fi.z) * s });
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
    // ostatné questy – sivé bodky
    let act = null;
    if (S && S.stack && G.Q) {
      try { act = G.Q.active ? G.Q.active() : null; } catch (e) { act = null; }
      for (const q of S.stack) {
        if (q === act) continue;
        for (const p of questTargets(q)) { const o = toS(p.x, p.z); if (Math.hypot(o.x - R, o.y - R) < R - 4) dot(ctx, o.x, o.y, 3.5, 'rgba(190,196,210,.85)', 'rgba(0,0,0,.6)'); }
      }
    }
    // aktívny cieľ – žltý pulz + šípka na okraji
    let rimArrow = null;
    if (act && !(S && S.hideArrow > 0)) {
      let best = null, bd = Infinity;
      for (const p of questTargets(act)) {
        const o = toS(p.x, p.z), d = Math.hypot(o.x - R, o.y - R);
        if (d < R - 6) {
          dot(ctx, o.x, o.y, 7 + pulse * 5, `rgba(255,196,64,${0.18 + pulse * 0.15})`);
          dot(ctx, o.x, o.y, 5, '#ffc440', 'rgba(60,40,0,.8)');
        }
        const dm = Math.hypot(p.x - fi.x, p.z - fi.z);
        if (dm < bd) { bd = dm; best = { p, d }; }
      }
      if (best && best.d >= R - 6) rimArrow = { ang: Math.atan2(best.p.z - fi.z, best.p.x - fi.x), dist: bd };
    }
    if (Ac) {
      // Fabia
      if (Ac.car && !fi.inCar) { const o = toS(Ac.car.x, pz(Ac.car)); arrow(ctx, o.x, o.y, Ac.car.a || 0, 6, '#4a9bff', 'rgba(0,20,60,.8)'); }
      // Nelka
      if (Ac.kid && Ac.kid.state !== 'away' && !(Ac.kid.state === 'car' && fi.inCar)) { const o = toS(Ac.kid.x, pz(Ac.kid)); dot(ctx, o.x, o.y, 4.5, '#ff7ab8', 'rgba(80,0,40,.8)'); }
      // Bundáš
      if (Ac.dog && !(Ac.dog.state === 'car' && fi.inCar)) {
        const o = toS(Ac.dog.x, pz(Ac.dog));
        if (Ac.dog.state === 'lost') { dot(ctx, o.x, o.y, 6 + pulse * 4, `rgba(184,112,58,${0.25 + pulse * 0.2})`); }
        dot(ctx, o.x, o.y, 4, '#b8703a', 'rgba(50,20,0,.8)');
      }
    }
    // hráč = biela šípka v strede
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
    arrow(ctx, R, R, fi.ang, fi.inCar ? 10 : 8, '#fff', 'rgba(0,0,0,.7)');
    ctx.shadowBlur = 0;
    ctx.restore();
    // vinetácia
    const g = ctx.createRadialGradient(R, R, R * 0.7, R, R, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fill();
    if (rimArrow) {
      const ax = R + Math.cos(rimArrow.ang) * (R - 13), ay = R + Math.sin(rimArrow.ang) * (R - 13);
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 5;
      arrow(ctx, ax, ay, rimArrow.ang, 9 + pulse * 2, '#ffc440', 'rgba(60,40,0,.9)');
      ctx.shadowBlur = 0;
      const txt = Math.round(rimArrow.dist) + ' m';
      ctx.font = '700 10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lx = R + Math.cos(rimArrow.ang) * (R - 32), ly = R + Math.sin(rimArrow.ang) * (R - 32);
      const w = ctx.measureText(txt).width + 8;
      ctx.fillStyle = 'rgba(10,12,16,.8)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx - w / 2, ly - 8, w, 16, 8) : ctx.rect(lx - w / 2, ly - 8, w, 16); ctx.fill();
      ctx.fillStyle = '#ffe2a0'; ctx.fillText(txt, lx, ly);
    }
    // sever
    ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('N', R, 9);
    // názov ulice
    streetT -= dt;
    if (streetT <= 0 && els.street) {
      streetT = 0.3;
      let name = '';
      try { if (Mp && Mp.streetNameAt) name = Mp.streetNameAt(fi.x, fi.z) || ''; } catch (e) { name = ''; }
      setText(els.street, name);
    }
  }

  // ---------------------------------------------------------------- veľká mapa (M)
  let bigOpen = false, bigCtx = null, bigS = 0.5, bigDpr = 1;
  function sizeBig() {
    const c = els.bigc; if (!c) return;
    const W = G.CFG.W, H = G.CFG.H;
    const aw = Math.min(innerWidth - 70, 1260), ah = innerHeight - 150;
    bigS = Math.max(0.2, Math.min(aw / W, ah / H));
    bigDpr = Math.min(window.devicePixelRatio || 1, 2);
    c.style.width = Math.round(W * bigS) + 'px'; c.style.height = Math.round(H * bigS) + 'px';
    c.width = Math.round(W * bigS * bigDpr); c.height = Math.round(H * bigS * bigDpr);
    bigCtx = c.getContext('2d');
  }
  function drawBig() {
    const ctx = bigCtx; if (!ctx) return;
    const Mp = G.Map, Ac = A(), S = G.S, s = bigS;
    const W = G.CFG.W, H = G.CFG.H;
    ctx.setTransform(bigDpr, 0, 0, bigDpr, 0, 0);
    ctx.fillStyle = '#17241a'; ctx.fillRect(0, 0, W * s, H * s);
    const mc = Mp && Mp.miniCanvas;
    if (mc && mc.width) ctx.drawImage(mc, 0, 0, mc.width, mc.height, 0, 0, W * s, H * s);
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const toS = (x, z) => ({ x: x * s, y: z * s });
    // názvy lokácií
    if (Mp && Mp.locs) {
      ctx.font = '700 ' + Math.max(9, Math.round(10 * Math.min(1.3, s * 1.6))) + 'px ' + font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const list = Array.isArray(Mp.locs) ? Mp.locs : Object.keys(Mp.locs).map((k) => Mp.locs[k]);
      for (const l of list) {
        if (!l || l.x == null || !l.name) continue;
        const o = toS(l.x, pz(l));
        ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(l.name, o.x, o.y);
        ctx.fillStyle = l.kind === 'outlet' || /^outlet_/.test(l.id || '') ? '#ffe2a0' : '#f4f6fa'; ctx.fillText(l.name, o.x, o.y);
      }
    }
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
    let act = null;
    if (S && S.stack && G.Q) {
      try { act = G.Q.active ? G.Q.active() : null; } catch (e) { act = null; }
      for (const q of S.stack) {
        if (q === act) continue;
        for (const p of questTargets(q)) { const o = toS(p.x, p.z); dot(ctx, o.x, o.y, 5, 'rgba(190,196,210,.9)', 'rgba(0,0,0,.6)'); }
      }
      if (act && !(S.hideArrow > 0)) {
        const def = act.def || {};
        for (const p of questTargets(act)) {
          const o = toS(p.x, p.z);
          ctx.strokeStyle = `rgba(255,196,64,${0.5 + pulse * 0.5})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(o.x, o.y, 12 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
          dot(ctx, o.x, o.y, 6, '#ffc440', 'rgba(60,40,0,.8)');
          const txt = (def.icon ? def.icon + ' ' : '') + (act.title || def.title || '');
          if (txt) {
            ctx.font = '800 12px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            const w = ctx.measureText(txt).width + 12;
            ctx.fillStyle = 'rgba(10,12,16,.85)';
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(o.x - w / 2, o.y - 40, w, 20, 8) : ctx.rect(o.x - w / 2, o.y - 40, w, 20); ctx.fill();
            ctx.fillStyle = '#ffe2a0'; ctx.fillText(txt, o.x, o.y - 24);
          }
        }
      }
    }
    if (Ac) {
      const fi = focusInfo();
      if (Ac.car && !fi.inCar) { const o = toS(Ac.car.x, pz(Ac.car)); arrow(ctx, o.x, o.y, Ac.car.a || 0, 8, '#4a9bff', 'rgba(0,20,60,.8)'); }
      if (Ac.kid && Ac.kid.state !== 'away' && !(Ac.kid.state === 'car' && fi.inCar)) { const o = toS(Ac.kid.x, pz(Ac.kid)); dot(ctx, o.x, o.y, 6, '#ff7ab8', 'rgba(80,0,40,.8)'); }
      if (Ac.dog && !(Ac.dog.state === 'car' && fi.inCar)) { const o = toS(Ac.dog.x, pz(Ac.dog)); dot(ctx, o.x, o.y, 5.5, '#b8703a', 'rgba(50,20,0,.8)'); }
      const o = toS(fi.x, fi.z);
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 5;
      arrow(ctx, o.x, o.y, fi.ang, 11, '#fff', 'rgba(0,0,0,.7)');
      ctx.shadowBlur = 0;
    }
  }
  UI.bigmap = function (on) {
    if (!inited) UI.init();
    if (!els.bigmap) return false;
    const want = on == null ? !bigOpen : !!on;
    if (want === bigOpen) return bigOpen;
    bigOpen = want;
    if (bigOpen) {
      click();
      els.bigmap.classList.remove('hidden');
      sizeBig(); drawBig();
      UI.modal = true;
      bigKeys = (e) => {
        if (e.code === 'KeyM' || e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) UI.bigmap(false); }
      };
      window.addEventListener('keydown', bigKeys, true);
      els.bigmap.onclick = (e) => { if (e.target === els.bigmap) UI.bigmap(false); };
    } else {
      els.bigmap.classList.add('hidden');
      if (bigKeys) { window.removeEventListener('keydown', bigKeys, true); bigKeys = null; }
      if (!els.modal || els.modal.classList.contains('hidden')) UI.modal = false;
    }
    return bigOpen;
  };
  UI.toggleBigmap = () => UI.bigmap();
  UI.isBigmap = () => bigOpen;

  // ---------------------------------------------------------------- modálny rámec
  function openModal(html, cls) {
    if (!inited) UI.init();
    if (bigOpen) UI.bigmap(false);
    closeKeys();
    els.box.className = cls || '';
    els.box.innerHTML = html;
    els.modal.classList.remove('hidden');
    UI.modal = true;
    return els.box;
  }
  function closeKeys() {
    if (modalKeys) { window.removeEventListener('keydown', modalKeys.down, true); window.removeEventListener('keyup', modalKeys.up, true); modalKeys = null; }
  }
  function setKeys(down, up) {
    closeKeys();
    const d = (e) => { const r = down && down(e); if (r !== false) { e.preventDefault(); e.stopPropagation(); } };
    const u = (e) => { if (up) up(e); e.preventDefault(); e.stopPropagation(); };
    modalKeys = { down: d, up: u };
    window.addEventListener('keydown', d, true);
    window.addEventListener('keyup', u, true);
  }
  function closeModal() {
    closeKeys();
    els.modal.classList.add('hidden');
    els.box.innerHTML = '';
    els.box.className = '';
    UI.modal = bigOpen;
  }
  UI.closeModal = closeModal;
  UI.openModal = openModal;
  function digit(e) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    if (m) return +m[1];
    return /^\d$/.test(e.key) ? +e.key : -1;
  }
  // jednoduchý výsledkový krok (Enter / tlačidlo)
  function resultScreen(html, cb, btn) {
    els.box.innerHTML = html + `<div class="row"><button class="btn pri">${btn || 'Pokračovať'} <kbd>Enter</kbd></button></div>`;
    let fired = false;
    const go = () => { if (fired) return; fired = true; click(); closeModal(); cb && cb(); };
    els.box.querySelector('.row .btn').addEventListener('click', go);
    setKeys((e) => { if ((e.key === 'Enter' || e.code === 'Space') && !e.repeat) go(); });
  }

  // ---------------------------------------------------------------- choice
  UI.choice = function (ch, cb) {
    const opts = (ch.opts || []).slice(0, 4);
    const box = openModal(`<h3>${esc(ch.title || 'Rozhodni sa')}</h3><h2>${esc(ch.q)}</h2><div class="opts">${opts.map((o, i) =>
      `<button class="btn" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o.t)}</button>`).join('')}</div>`, 'choice');
    let done = false;
    const choose = (i) => {
      if (done || !opts[i]) return; done = true; click(); closeModal(); cb && cb(opts[i]);
    };
    box.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i)));
    setKeys((e) => { const d = digit(e); if (d >= 1 && d <= 4) choose(d - 1); });
  };

  // ---------------------------------------------------------------- telefónny hovor
  UI.phoneCall = function (ch, cb) {
    const opts = (ch.opts || []).slice(0, 4);
    const name = ch.caller || 'Neznáme číslo';
    const ini = (ch.avatar || name.trim().charAt(0) || '?').toUpperCase();
    const hue = Math.abs([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 360;
    const box = openModal(`<div class="notch"></div>
      <div class="top"><div class="av" style="background:linear-gradient(145deg,hsl(${hue} 55% 55%),hsl(${hue} 60% 30%))">${esc(ini)}</div>
        <div class="nm">${esc(name)}</div><div class="rel">${esc(ch.sub || 'prichádzajúci hovor')}</div><div class="dur">📞 00:00</div></div>
      <div class="q">${esc(ch.q)}</div>
      <div class="opts">${opts.map((o, i) => `<button class="btn" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o.t)}</button>`).join('')}</div>
      <div class="sp"></div>
      <button class="btn hang" aria-label="Zložiť">📵</button><div class="hangl">Zložiť <kbd>Esc</kbd>${ch.hangNote ? ' • ' + esc(ch.hangNote) : ''}</div>`, 'call');
    snd('vibrate');
    const dur = box.querySelector('.dur'); let sec = 0;
    const iv = setInterval(() => { sec++; dur.textContent = '📞 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }, 1000);
    let done = false;
    const fin = (res) => { if (done) return; done = true; clearInterval(iv); click(); closeModal(); cb && cb(res); };
    box.querySelectorAll('.opts .btn').forEach((b) => b.addEventListener('click', () => fin(opts[+b.dataset.i])));
    box.querySelector('.hang').addEventListener('click', () => fin({ hangup: true, t: 'Zložiť' }));
    setKeys((e) => {
      const d = digit(e);
      if (d >= 1 && d <= opts.length) fin(opts[d - 1]);
      else if (e.key === 'Escape' || d === 0) fin({ hangup: true, t: 'Zložiť' });
    });
  };

  // ---------------------------------------------------------------- tankovanie
  UI.tank = function (q, cb) {
    const price = G.CFG.fuelPrice;
    const car = A() && A().car;
    const free = Math.max(0, G.CFG.tankL - (car ? car.fuel : 0));
    let fits = [30, 40, 50].filter((t) => t / price <= free);
    let target = fits.length ? pick(fits) : Math.max(5, Math.floor(free * price / 5) * 5);
    if (target / price > free) target = Math.floor(free * price);
    let liters = 0, holdT = 0, holding = false, finished = false, tick = 0, raf = 0, last = performance.now();
    const box = openModal(`<h3>Benzínka • stojan</h3><h2>Natankuj presne</h2>
      <div class="target">Cieľ: <b>${num2(target)} €</b> <span style="color:var(--muted)">(voľné v nádrži ${num2(free)} L)</span></div>
      <div class="pump">
        <div class="lcd"><span>SUMA €</span><b class="pe">0,00</b></div>
        <div class="lcd"><span>LITRE</span><b class="pl">0,00</b></div>
        <div class="lcd price"><span>Natural 95 • cena za liter</span><b>${price.toFixed(3).replace('.', ',')} €</b></div>
      </div>
      <div class="tankbar"><div class="f0"></div><div class="f1"></div></div>
      <button class="btn holdbtn">⛽ Drž a tankuj <kbd>Space</kbd></button>
      <div class="msg"></div>
      <div class="row"><button class="btn pri ok">Hotovo <kbd>Enter</kbd></button></div>`, 'tank');
    const pe = box.querySelector('.pe'), pl = box.querySelector('.pl'), hb = box.querySelector('.holdbtn');
    const msg = box.querySelector('.msg'), ok = box.querySelector('.ok');
    const f0 = box.querySelector('.f0'), f1 = box.querySelector('.f1');
    const base = car ? car.fuel : 0;
    f0.style.width = (base / G.CFG.tankL * 100) + '%';
    f1.style.left = (base / G.CFG.tankL * 100) + '%';
    const draw = () => {
      pe.textContent = num2(liters * price); pl.textContent = num2(liters);
      f1.style.width = (liters / G.CFG.tankL * 100) + '%';
    };
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (holding && !finished) {
        holdT += dt;
        const rate = holdT < 0.25 ? 0.5 : Math.min(2.6, 0.5 + (holdT - 0.25) * 2.4);
        liters = Math.min(free, liters + rate * dt);
        tick -= dt;
        if (tick <= 0) { tick = 0.09; snd('pour'); }
        if (liters >= free) { holding = false; hb.classList.remove('on'); msg.className = 'msg info'; msg.textContent = 'Plná nádrž! Pištoľ cvakla.'; }
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const start = () => { if (finished || liters >= free) return; holding = true; holdT = 0; hb.classList.add('on'); };
    const stop = () => { holding = false; hb.classList.remove('on'); };
    hb.addEventListener('mousedown', (e) => { e.preventDefault(); start(); });
    hb.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
    const winUp = () => stop();
    window.addEventListener('mouseup', winUp); window.addEventListener('touchend', winUp);
    let stage = 0, result = null;
    const finish = () => {
      click();
      if (stage === 0) {
        stage = 1; finished = true; stop();
        const cost = Math.round(liters * price * 100) / 100;
        const diff = cost - target;
        result = { liters, cost };
        if (liters <= 0) { msg.className = 'msg bad'; msg.textContent = 'Nenatankoval si ani kvapku.'; }
        else if (Math.abs(diff) <= 0.05) {
          msg.className = 'msg good'; msg.textContent = 'Presne! Majster tankovania.';
          try { G.Q.fx({ nervy: -5, focus: 5 }); } catch (e) {}
        } else if (diff > 0) { msg.className = 'msg bad'; msg.textContent = `Prešvihol si o ${num2(diff)} €.`; }
        else if (-diff <= 1) { msg.className = 'msg info'; msg.textContent = `Tesne! Chýbalo ${num2(-diff)} €.`; }
        else { msg.className = 'msg info'; msg.textContent = `Natankované za ${num2(cost)} €. Cieľ bol ${num2(target)} €, ale dobre.`; }
        hb.disabled = true; hb.style.opacity = '.4';
        ok.innerHTML = 'Pokračovať <kbd>Enter</kbd>';
      } else {
        cancelAnimationFrame(raf);
        window.removeEventListener('mouseup', winUp); window.removeEventListener('touchend', winUp);
        closeModal(); cb && cb(result);
      }
    };
    ok.addEventListener('click', finish);
    setKeys((e) => {
      if (e.code === 'Space') { if (!e.repeat) start(); }
      else if (e.key === 'Enter') { if (!e.repeat) finish(); }
    }, (e) => { if (e.code === 'Space') stop(); });
    draw();
  };

  // ---------------------------------------------------------------- varenie (+ prerušenia riaditeľa dňa)
  const INGR = [
    ['🧀', 'syr'], ['🥚', 'vajce'], ['🍞', 'strúhanka'], ['🍟', 'fritéza'], ['🍗', 'kura'], ['🔥', 'panvica'], ['🍚', 'ryža'],
    ['🥬', 'kapusta'], ['🥓', 'klobása'], ['🍲', 'hrniec'], ['🥩', 'mäso'], ['🥔', 'zemiaky'], ['🥗', 'šalát'], ['🍅', 'paradajka'],
  ];
  const DISHES = [
    ['Vyprážaný syr', ['🧀', '🥚', '🍞', '🍟']], ['Kuracie s ryžou', ['🍗', '🔥', '🍚']], ['Kapustnica', ['🥬', '🥓', '🍲']],
    ['Burger', ['🍞', '🥩', '🔥', '🧀']], ['Hranolky', ['🥔', '🍟']], ['Šalát', ['🥗', '🍅', '🧀']], ['Segedín', ['🥩', '🥬', '🍲']],
  ];
  UI.cook = function (q, cb, opts) {
    opts = opts || {};
    const fl = (G.S && G.S.flags) || {};
    const total = opts.total || (fl.helper ? 8 : fl.alone ? 10 : 9);
    const baseT = opts.baseT || (fl.helper ? 16 : fl.alone ? 11 : 13);
    const orders = [];
    for (let i = 0; i < total; i++) {
      let d = pick(DISHES);
      if (i > 0 && d === orders[i - 1].d && Math.random() < 0.6) d = pick(DISHES);
      orders.push({ d, table: 1 + Math.floor(Math.random() * 8) });
    }
    const intr = (opts.interrupts || []).filter(Boolean);
    // rozložené po objednávkach: i-te prerušenie pri objednávke ~ (i+0.25..0.75)/n * total, + náhodné oneskorenie
    const sched = intr.map((it, i) => ({
      it, fired: false,
      at: clamp(Math.floor((i + 0.25 + Math.random() * 0.5) / intr.length * total), 1, Math.max(1, total - 1)),
      delay: 0.6 + Math.random() * 3,
    }));
    const pending = []; let cur = null, handled = 0, ignored = 0;
    let idx = 0, prog = 0, tLeft = 0, tMax = 1, served = 0, lost = 0, warm = 1.3, distT = 4 + Math.random() * 5, distOn = 0;
    let raf = 0, last = performance.now(), over = false;
    const box = openModal(`<div class="top"><div><h3>Obedová špička • ${esc(opts.place || G.CFG.bistro)}</h3><h2>Kuchyňa horí! 🔥</h2></div>
      <div class="score">✅ <span class="sv">0</span> &nbsp; ❌ <span class="ls">0</span> &nbsp; 🧾 <span class="rm">${total}</span></div></div>
      <div class="order"><div class="on"></div><button class="btn distract hidden">📱 Volá dodávateľ!</button></div>
      <div class="queue"></div>
      <div class="ingr">${INGR.map((g, i) => `<button class="btn" data-i="${i}">${g[0]}<small>${esc(g[1])}</small>${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`).join('')}</div>
      <button class="intr hidden" type="button"><span class="il"></span><span class="ih">Klikni = vyriešiš (−<b class="tc">4</b> s) • ignoruj = prúser</span><span class="ic">5</span><div class="cd"><div></div></div></button>`, 'cook');
    const ordEl = box.querySelector('.order'), onEl = box.querySelector('.on'), qEl = box.querySelector('.queue');
    const sv = box.querySelector('.sv'), ls = box.querySelector('.ls'), rm = box.querySelector('.rm'), dis = box.querySelector('.distract');
    const card = box.querySelector('.intr'), cardL = card.querySelector('.il'), cardC = card.querySelector('.ic'), cardB = card.querySelector('.cd div'), cardT = card.querySelector('.tc');
    const setup = () => {
      if (idx >= total) return end();
      prog = 0; tMax = tLeft = baseT + orders[idx].d[1].length;
      for (const s of sched) if (!s.fired && s.at <= idx) { s.fired = true; pending.push({ s, wait: s.delay }); }
      render();
    };
    const render = () => {
      sv.textContent = served; ls.textContent = lost; rm.textContent = Math.max(0, total - idx);
      if (idx >= total) return;
      const o = orders[idx];
      onEl.innerHTML = `<div style="color:var(--muted);font-size:12px">Objednávka ${idx + 1}/${total} • stôl ${o.table}</div>
        <div class="nm">${esc(o.d[0])}</div>
        <div class="seq">${o.d[1].map((s, i) => `<span class="${i < prog ? 'ok' : i === prog ? 'nx' : ''}">${s}</span>`).join('')}</div>
        <div class="tb"><div style="width:${(clamp(tLeft / tMax, 0, 1) * 100).toFixed(1)}%"></div></div>`;
      const nx = orders.slice(idx + 1, idx + 3);
      qEl.innerHTML = nx.length ? nx.map((n) => `<div>Ďalej: <b>${esc(n.d[0])}</b> ${n.d[1].join('')}</div>`).join('') : '<div>Posledná objednávka! 💪</div>';
    };
    const bar = () => { const b = onEl.querySelector('.tb div'); if (b) b.style.width = (clamp(tLeft / tMax, 0, 1) * 100).toFixed(1) + '%'; };
    const shake = () => { ordEl.classList.remove('shake'); void ordEl.offsetWidth; ordEl.classList.add('shake'); };
    let autoT = 0;
    const cardBtnAuto = () => { const cb = box.querySelector('.intr button, .intr'); if (cb && cb.click) cb.click(); };
    const press = (i) => {
      if (over || warm > 0 || idx >= total) return;
      click();
      const o = orders[idx];
      if (INGR[i][0] === o.d[1][prog]) {
        prog++;
        if (prog >= o.d[1].length) { served++; snd('ding'); idx++; setup(); }
        else render();
      } else { tLeft -= 2; shake(); snd('bump'); bar(); }
    };
    box.querySelectorAll('.ingr .btn').forEach((b) => b.addEventListener('click', () => press(+b.dataset.i)));
    dis.addEventListener('click', () => { click(); tLeft -= 3; distOn = 0; dis.classList.add('hidden'); bar(); UI.toast('📞 „Dodávka príde neskôr.“ Super, ďakujem.', 'info'); });
    // karta prerušenia
    const showCard = (p) => {
      cur = { s: p.s, left: p.s.it.time || 5, max: p.s.it.time || 5 };
      cardL.textContent = (p.s.it.icon ? p.s.it.icon + ' ' : '') + (p.s.it.label || p.s.it.title || 'Niečo horí!');
      cardT.textContent = String(p.s.it.timeCost != null ? p.s.it.timeCost : 4);
      cardC.textContent = Math.ceil(cur.left); cardB.style.width = '100%';
      card.classList.remove('hidden'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      snd('vibrate');
    };
    const hideCard = () => { card.classList.add('hidden'); cur = null; };
    card.addEventListener('click', () => {
      if (!cur || over) return;
      const it = cur.s.it; click();
      tLeft -= (it.timeCost != null ? it.timeCost : 4); bar();
      handled++;
      it.handled = true;
      try { if (typeof it.onHandle === 'function') it.onHandle(); } catch (e) {}
      UI.toast('✅ ' + (it.doneText || ('Vyriešené: ' + (it.label || ''))), 'good');
      hideCard();
      if (tLeft <= 0) { lost++; snd('fail'); idx++; setup(); }
    });
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!over) {
        if (warm > 0) { warm -= dt; if (warm <= 0) setup(); else onEl.innerHTML = '<div class="nm">Pripraviť sa… 👨‍🍳</div>'; }
        else {
          tLeft -= dt; bar();
          if (tLeft <= 0) { lost++; snd('fail'); idx++; setup(); }
          // autoplay (overovač): sám stlačí správnu surovinu
          if (!over && G.Main && G.Main.autoplay && idx < total) {
            autoT = (autoT || 0) + dt;
            if (autoT > 0.3) { autoT = 0; const want = orders[idx].d[1][prog]; const i = INGR.findIndex((g) => g[0] === want); if (i >= 0) press(i); if (cur) cardBtnAuto(); }
          }
          if (!over) {
            if (cur) {
              cur.left -= dt;
              cardC.textContent = Math.ceil(Math.max(0, cur.left));
              cardB.style.width = (clamp(cur.left / cur.max, 0, 1) * 100).toFixed(1) + '%';
              if (cur.left <= 0) {
                const it = cur.s.it; ignored++;
                hideCard(); snd('fail');
                UI.toast('💥 ' + (it.ignoreText || ('Ignoroval si: ' + (it.label || '') + '. To bude mať následky.')), 'bad');
                try { if (typeof it.onIgnore === 'function') it.onIgnore(); } catch (e) { console.warn(e); }
              }
            } else if (pending.length) {
              pending[0].wait -= dt;
              if (pending[0].wait <= 0) showCard(pending.shift());
            }
            if (!intr.length) {
              if (distOn > 0) { distOn -= dt; if (distOn <= 0) dis.classList.add('hidden'); }
              else { distT -= dt; if (distT <= 0) { distT = 7 + Math.random() * 8; distOn = 3; dis.classList.remove('hidden'); snd('vibrate'); } }
            }
          }
        }
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    function end() {
      if (over) return; over = true; cancelAnimationFrame(raf); hideCard();
      const pct = served / total;
      const v = pct >= 0.9 ? 'Kuchyňa ako hodinky. Dana ti podala ruku a Boris nič nepovedal. To je pochvala. 🤝' : pct >= 0.7 ? 'Zvládnuté. Trochu chaos, ale ľudia sú najedení.' :
        pct >= 0.4 ? 'Pár ľudí odišlo hladných a nahnevaných. Google recenzie čakajú.' : 'Katastrofa. Niekto si objednal pizzu na rohu. 🍕';
      const ih = intr.length ? `<div class="res"><span>🚨 Prerušenia: <b>${handled}</b> vyriešené</span><span style="color:${ignored ? 'var(--bad)' : 'var(--muted)'}">💥 <b>${ignored}</b> ignorované</span></div>` : '';
      resultScreen(`<h3>Obedová špička – koniec</h3><h2>Vydané ${served} z ${total}</h2>
        <div class="res"><span>✅ Vydané: <b>${served}</b></span><span>❌ Stratené: <b>${lost}</b></span></div>${ih}
        <p style="color:var(--amber)">${esc(v)}</p>`, () => cb && cb({ served, lost, total, handled, ignored }), 'Hotovo');
    }
    setKeys((e) => {
      const d = digit(e);
      if (d >= 0 && !e.repeat) press(d === 0 ? 9 : d - 1);
      else if (e.code === 'Space' && cur && !e.repeat) card.click();
    });
  };

  // ---------------------------------------------------------------- výdaj (rozvoz boxov)
  const BOXES = [['🍲', 'polievka'], ['🍛', 'hlavné'], ['🥗', 'šalát'], ['🍰', 'dezert'], ['🥖', 'pečivo'], ['🧃', 'nápoj']];
  function outletName(o) {
    if (o == null) return 'výdajňa';
    if (typeof o === 'object') return o.name || o.id || 'výdajňa';
    if (typeof o === 'number') return G.NAMES.outlets[o] || ('výdajňa ' + o);
    let m = /^(?:outlet|vydaj)_(\d+)$/.exec(o);
    if (m) return G.NAMES.outlets[+m[1]] || o;
    const l = G.Map && G.Map.locs && G.Map.locs[o];
    if (l && l.name) return l.name;
    if (G.NAMES.outlets.indexOf(o) >= 0) return o;
    return o;
  }
  UI.deliver = function (outlet, cb) {
    const name = outletName(outlet);
    const nT = 3 + Math.floor(Math.random() * 3);
    const types = shuffle([0, 1, 2, 3, 4, 5]).slice(0, nT);
    const need = {}, got = {};
    types.forEach((t) => { need[t] = 1 + Math.floor(Math.random() * 4); got[t] = 0; });
    // mriežka: najprv presne potrebné boxy, potom náhodné navyše (max 24 spolu)
    const must = [], extra = [];
    for (let t = 0; t < 6; t++) {
      for (let i = 0; i < (need[t] || 0); i++) must.push(t);
      const n = need[t] ? 1 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) extra.push(t);
    }
    const grid = shuffle(must.concat(shuffle(extra).slice(0, Math.max(0, 24 - must.length))));
    const LIMIT = 14;
    let tLeft = LIMIT, extras = 0, over = false, raf = 0, last = performance.now();
    const box = openModal(`<div class="hd"><div><h3>Výdaj • ${esc(name)}</h3><h2>Nalož správne boxy 📦</h2></div><div class="tm">8,0</div></div>
      <div class="ord">${types.map((t, i) => `<div data-t="${t}"><span class="e">${BOXES[t][0]}</span>${esc(BOXES[t][1])} <span class="c"><b class="g">0</b>/${need[t]}</span><kbd>${i + 1}</kbd></div>`).join('')}</div>
      <div class="tbar"><div style="width:100%"></div></div>
      <div class="grid">${grid.map((t, i) => `<button class="btn bx" data-i="${i}" data-t="${t}">${BOXES[t][0]}<small>${esc(BOXES[t][1])}</small></button>`).join('')}</div>
      <div class="van"><span>🚐 Fabia: <b class="cnt">0</b> boxov</span><span class="ex"></span><span>Enter = odovzdať</span></div>`, 'deliv');
    const tm = box.querySelector('.tm'), tb = box.querySelector('.tbar div'), cnt = box.querySelector('.cnt'), exEl = box.querySelector('.ex');
    const ordEls = {}; box.querySelectorAll('.ord div').forEach((d) => { ordEls[+d.dataset.t] = d; });
    const total = () => types.reduce((a, t) => a + got[t], 0);
    const needed = types.reduce((a, t) => a + need[t], 0);
    let autoT = 0;
    const take = (btn) => {
      if (over || !btn || btn.classList.contains('done')) return;
      const t = +btn.dataset.t;
      if (need[t] && got[t] < need[t]) {
        got[t]++; btn.classList.add('done'); snd('ding');
        const o = ordEls[t]; o.querySelector('.g').textContent = got[t]; o.classList.toggle('ok', got[t] === need[t]);
        cnt.textContent = total();
        if (total() === needed) end(true);
      } else {
        extras++; btn.classList.remove('bad'); void btn.offsetWidth; btn.classList.add('bad'); snd('bump');
        tLeft -= 0.7;
        if (ordEls[t]) ordEls[t].classList.add('over');
        exEl.textContent = '❌ zle naložené: ' + extras;
        setTimeout(() => btn.classList.remove('bad'), 400);
      }
    };
    box.querySelectorAll('.bx').forEach((b) => b.addEventListener('click', () => take(b)));
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!over) {
        tLeft -= dt;
        if (G.Main && G.Main.autoplay) { autoT += dt; if (autoT > 0.25) { autoT = 0; const t = types.find((t) => got[t] < need[t]); const b = t != null ? box.querySelector('.bx:not(.done)[data-t="' + t + '"]') : null; if (b) take(b); } }
        tm.textContent = Math.max(0, tLeft).toFixed(1).replace('.', ',');
        tm.classList.toggle('low', tLeft < 2.5);
        tb.style.width = (clamp(tLeft / LIMIT, 0, 1) * 100).toFixed(1) + '%';
        if (tLeft <= 0) end(false);
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    function end(early) {
      if (over) return; over = true; cancelAnimationFrame(raf);
      const matched = total();
      const score = clamp((matched - extras * 0.5) / needed, 0, 1);
      const ok = matched === needed && extras === 0 ? true : score >= 0.75;
      const missing = types.filter((t) => got[t] < need[t]).map((t) => `${BOXES[t][0]} ${need[t] - got[t]}×`);
      const v = score >= 1 ? 'Všetko sedí. Výdajňa ťa chce adoptovať.' : ok ? 'Takmer všetko. Niekto dnes nebude mať dezert, prežije.' :
        score >= 0.4 ? 'Polovica obedov chýba. Telefón začne zvoniť o 12:05.' : 'Do riti. Doviezol si nápoje a prázdne krabice.';
      if (ok) snd('done'); else snd('fail');
      resultScreen(`<h3>Výdaj • ${esc(name)}</h3><h2>${ok ? 'Odovzdané ✅' : 'Zbabrané ❌'}</h2>
        <p>Naložené <b>${matched}/${needed}</b> boxov${extras ? `, navyše <b style="color:var(--bad)">${extras}</b> zlých` : ''}.${missing.length ? ' Chýba: ' + missing.join(', ') : ''}</p>
        <p style="color:var(--amber)">${esc(v)}</p>`, () => cb && cb({ ok, score: Math.round(score * 100) / 100, matched, needed, extras }));
    }
    setKeys((e) => {
      const d = digit(e);
      if (d >= 1 && d <= types.length && !e.repeat) {
        const t = types[d - 1];
        const b = [...box.querySelectorAll('.bx')].find((x) => +x.dataset.t === t && !x.classList.contains('done'));
        if (b) take(b); else { extras++; tLeft -= 0.7; exEl.textContent = '❌ zle naložené: ' + extras; snd('bump'); }
      } else if (e.key === 'Enter' && !e.repeat) end(true);
    });
  };

  // ---------------------------------------------------------------- venčenie Bundáša
  const SMELLS = ['lampu (klasika)', 'kríky pri kontajneroch', 'koleso susedovej Octavie', 'miesto, kde bol včera iný pes', 'odhodený kebab',
    'strom, ktorý už označilo 40 psov', 'nohavicu okoloidúceho', 'kočík (nie, Bundáš, NIE)', 'kaluž podozrivej farby', 'mačku, ktorá sa nebojí'];
  const DOGLINES = ['Bundáš ťahá ako lokomotíva. Rameno hlási výpoveď.', 'Okoloidúca: „Kto koho venčí?“ Vtipné. Veľmi.', 'Bundáš sa pozrel na teba, potom na holuba. Vybral si holuba.',
    'Spomenul si si, že sporák… nie, ten je vypnutý. Asi.', 'Mobil zavibroval. Nedvíhaš. Hrdina.', 'Bundáš značkuje stĺp, ktorý už značkoval pred 5 minútami. Dôslednosť.'];
  UI.dogWalk = function (cb) {
    const DOG = G.CFG.dog;
    let meter = 0.15, holding = false, wasRed = false, stops = 0, poops = 0, slips = 0, phase = 'walk', sniffT = 0, over = false, lineT = 5 + Math.random() * 4, t = 0;
    let pull = 0.3, pullT = 0, raf = 0, last = performance.now();
    const box = openModal(`<h3>Park • vodítko</h3><h2>Vyvenči ${esc(G.CFG.dogGen || DOG)} 🐕</h2>
      <p style="color:var(--muted);font-size:13px;margin:2px 0 0">Keď ukazovateľ zbehne do červenej, <b>drž Space / E</b> a pritiahni ho späť. 3 zastávky a máte hotovo. Hromady si rátaj.</p>
      <div class="scene"><div class="trees">🌳🌲🌳🌲🌳🌲🌳🌲🌳</div><div class="pato">🧔</div><div class="leash"></div><div class="dog">🐕</div></div>
      <div class="meter"><div class="lbl"><span>pohoda</span><span>ŤAHÁ!</span></div><div class="ptr"></div></div>
      <div class="stops"><span>🐾 zastávka 1</span><span>🐾 zastávka 2</span><span>🐾 zastávka 3</span></div>
      <button class="btn holdbtn">🫷 Drž vodítko <kbd>Space</kbd></button>
      <div class="log"></div>`, 'dogw');
    const dogEl = box.querySelector('.dog'), leash = box.querySelector('.leash'), ptr = box.querySelector('.ptr'), log = box.querySelector('.log');
    const stopEls = box.querySelectorAll('.stops span'), hb = box.querySelector('.holdbtn'), scene = box.querySelector('.scene');
    const say = (txt, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = txt; log.prepend(d); while (log.children.length > 6) log.lastChild.remove(); };
    say(`${DOG} vybehol z brány ako z katapultu.`);
    const layout = () => {
      const W = scene.clientWidth || 460;
      const dx = 70 + meter * (W - 150);
      dogEl.style.left = dx + 'px';
      leash.style.left = '52px'; leash.style.width = (dx - 40) + 'px';
      leash.style.transform = `rotate(${-6 + meter * 10}deg)`;
      leash.classList.toggle('tight', meter > 0.7);
      ptr.style.left = (meter * 100).toFixed(1) + '%';
    };
    const start = () => { if (over) return; holding = true; hb.classList.add('on'); };
    const stop = () => { holding = false; hb.classList.remove('on'); };
    hb.addEventListener('mousedown', (e) => { e.preventDefault(); start(); });
    hb.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
    const winUp = () => stop();
    window.addEventListener('mouseup', winUp); window.addEventListener('touchend', winUp);
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (!over) {
        if (phase === 'walk') {
          pullT -= dt;
          if (pullT <= 0) { pullT = 0.6 + Math.random() * 1.2; pull = 0.12 + Math.random() * 0.45 + stops * 0.05; }
          meter += pull * dt * (holding ? 0.35 : 1);
          if (holding) meter -= 0.9 * dt;
          meter = clamp(meter, 0, 1);
          if (meter > 0.72 && !wasRed) { wasRed = true; say(`${DOG} zavetril niečo a ŤAHÁ. Drž!`, 'warn'); snd('bump'); }
          if (wasRed && holding && meter < 0.3) {
            wasRed = false; stops++; phase = 'sniff'; sniffT = 1.8;
            dogEl.classList.add('sniff');
            const sm = pick(SMELLS);
            say(`Zastávka ${stops}: ${DOG} dôkladne skúma ${sm}.`, 'good');
            snd('ding');
            if (Math.random() < 0.6) {
              poops++;
              const p = document.createElement('div'); p.className = 'poop'; p.textContent = '💩'; p.style.left = (parseFloat(dogEl.style.left) + 10) + 'px'; scene.appendChild(p);
              setTimeout(() => say(pick([`…a hromada. Vrecúško? Doma. Samozrejme.`, `${DOG} urobil hromadu presne pred vchodom suseda. Očný kontakt so susedom.`, `Hromada č. ${poops}. Čo ten pes žerie?!`, `${DOG} sa vyprázdnil s výrazom filozofa.`]), 'warn'), 500);
            }
            stopEls[stops - 1].classList.add('ok');
          }
          if (meter >= 1) {
            slips++; meter = 0.3; wasRed = false; snd('fail');
            say(slips === 1 ? `Vodítko ti vyšmyklo! ${DOG} urobil kolečko okolo parku a vrátil sa. Milosť.` : `Znova ušiel. Dôchodkyňa na lavičke krúti hlavou.`, 'warn');
          }
          lineT -= dt; if (lineT <= 0) { lineT = 6 + Math.random() * 5; say(pick(DOGLINES)); }
        } else if (phase === 'sniff') {
          sniffT -= dt; meter = Math.max(0.1, meter - dt * 0.2);
          if (sniffT <= 0) { phase = 'walk'; dogEl.classList.remove('sniff'); if (stops >= 3) end(); }
        }
        layout();
        // strop: po 50 s sa prechádzka skončí sama (Bundáš rozhodol)
        if (t > 50 && !over) { say(`${DOG} ťa odvliekol domov. Prechádzka skončila, keď on povedal.`, 'warn'); end(); }
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    layout();
    function end() {
      if (over) return; over = true; cancelAnimationFrame(raf); stop();
      window.removeEventListener('mouseup', winUp); window.removeEventListener('touchend', winUp);
      const ok = slips < 2;
      const v = ok && poops === 0 ? `${DOG} nič neurobil. To znamená, že to urobí doma. Na koberec.` : ok ? `Vyvenčené. ${poops}× hromada, ${slips}× útek. Priemer v okrese.` : `${DOG} ťa venčil, nie ty jeho. Polovica parku to natáčala.`;
      if (ok) snd('done'); else snd('fail');
      resultScreen(`<h3>Park • hotovo</h3><h2>${ok ? 'Vyvenčený 🐕' : 'Chaos v parku 🐕💨'}</h2>
        <div class="res"><span>🐾 zastávky: <b>${stops}</b></span><span>💩 hromady: <b>${poops}</b></span><span>🏃 úteky: <b>${slips}</b></span></div>
        <p style="color:var(--amber)">${esc(v)}</p>`, () => cb && cb({ ok, poops, slips, time: Math.round(t) }));
    }
    setKeys((e) => {
      if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) start();
    }, (e) => { if (e.code === 'Space' || e.code === 'KeyE') stop(); });
  };

  // ---------------------------------------------------------------- instagram
  const REELS = [
    ['🍝', 'chef_marco_official', 'Talian reaguje na smotanu v carbonare 😱🇮🇹', '#7a2d1e', '#e0a14a'],
    ['🐕', 'psiedobrodruzstva', 'Zlatý retriever vidí sneh prvýkrát ❄️ (zvuk zapnúť!)', '#2c5d86', '#a8d4f0'],
    ['🚗', 'tuning_slovakia', 'Fabia 1.2 HTP vs. BMW M3 – nebudeš veriť koncu 🏁', '#1a1a1a', '#4b6ea5'],
    ['🥩', 'grill_kral', 'Steak 48 hodín sous-vide, potom ho hodím do ohňa 🔥', '#401310', '#c35a2f'],
    ['🐶', 'mops_bobo', 'Bobo počul slovo „prechádzka“ 🫨', '#6a4b2f', '#e9c79a'],
    ['🏎️', 'drift_kosice', 'Keď mama povie, že máš doma ešte 3 minúty 💨', '#202838', '#d24646'],
    ['🍳', 'rychle_recepty', 'Vajíčko za 15 sekúnd? Áno, je to legálne.', '#5b4a12', '#f4d35e'],
    ['🐕‍🦺', 'pes_vs_vysavac', 'Odveký nepriateľ sa vrátil. Časť 47.', '#2f4f3a', '#9ccf9a'],
    ['🚙', 'auta_z_bazosu', '„Jazdená babkou len do kostola“ – 480 000 km', '#3c3c3c', '#a0a0a0'],
    ['🍔', 'bistro_fails', 'Keď šéfkuchár zabudne kľúče tretíkrát za týždeň 🔑', '#3a2a10', '#d9a441'],
  ];
  UI.insta = function (cb) {
    const box = openModal(`<div class="reel"></div><div class="prog"><div></div></div><div class="hdr">Reels</div>
      <div class="side"><div>❤️<small class="lk">12k</small></div><div>💬<small>843</small></div><div>📤</div></div>
      <div class="cap"><div class="user"></div><div class="tx"></div></div>
      <button class="btn close">✕ Zavrieť</button>`, 'insta');
    const reel = box.querySelector('.reel'), user = box.querySelector('.user'), tx = box.querySelector('.tx');
    const lk = box.querySelector('.lk'), prog = box.querySelector('.prog div'), cl = box.querySelector('.close');
    cl.style.left = '50%'; cl.style.top = '50%'; cl.style.transform = 'translate(-50%,-50%)';
    let ri = Math.floor(Math.random() * REELS.length), t = 0, raf = 0, last = performance.now(), clicks = 0, closed = false;
    const show = () => {
      const r = REELS[ri % REELS.length];
      reel.textContent = r[0];
      reel.style.background = `linear-gradient(160deg, ${r[3]}, ${r[4]})`;
      user.textContent = '@' + r[1]; tx.textContent = r[2];
      lk.textContent = (Math.floor(Math.random() * 90) + 3) + 'k';
    };
    show();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      t += dt;
      if (t > 2.8) { t = 0; ri++; show(); }
      prog.style.width = (t / 2.8 * 100) + '%';
      if (!closed) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    cl.addEventListener('click', () => {
      click();
      clicks++;
      if (clicks <= 2) {
        cl.style.transform = 'none';
        cl.style.left = (10 + Math.random() * (box.clientWidth - cl.offsetWidth - 20)) + 'px';
        cl.style.top = (40 + Math.random() * (box.clientHeight - cl.offsetHeight - 80)) + 'px';
        if (clicks === 1) tx.textContent = 'Ešte jedno video… 👀';
        return;
      }
      closed = true; cancelAnimationFrame(raf); closeModal(); cb && cb();
    });
    setKeys(() => {});
  };

  UI.phoneIdle = function () {
    UI.toast(pick(['📱 Nič nové. Len 47 správ v skupine „Rodina 👨‍👩‍👧“.', '📱 Nič. Boris videl tvoju správu, neodpísal.', '📱 Baterka 23 %. Nabíjačka je v aute. Alebo v kuchyni. Alebo…']), 'info');
    try { G.Q.fx({ focus: -2 }); } catch (e) {}
  };

  // ---------------------------------------------------------------- súhrn dňa
  UI.summary = function (S, cb) {
    const st = S.start || { money: S.money, rep: S.rep, dad: S.dad };
    const dm = (S.money || 0) - (st.money || 0), dr = (S.rep || 0) - (st.rep || 0), dd = (S.dad || 0) - (st.dad || 0);
    const done = S.done || [], forg = S.forgotten || [], fail = S.failed || [];
    const sg = (v, f) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f(Math.abs(v));
    const score = done.length * 2 - forg.length * 2 - fail.length * 3 + dd + Math.round(dr / 2);
    const verdict = score >= 14 ? 'Dnes si bol superhrdina. Kľúče si našiel na prvý pokus. Skoro.' :
      score >= 8 ? 'Slušný deň. Nelka je spokojná, bistro stojí, Bundáš je doma. Ledva.' :
      score >= 2 ? 'Prežil si. Niečo sa podarilo, niečo zmizlo v hmle hlavy.' :
      score >= -4 ? 'Chaos level: tanier špagiet. Zajtra papieriky, sľúbiš?' :
      'Deň, o ktorom sa radšej nebude rozprávať. Ani babke.';
    const li = (arr, ic) => arr.length ? arr.map((t) => `<li>${ic} ${esc(typeof t === 'string' ? t : (t.title || t.text || t.id || ''))}</li>`).join('') : '<li style="color:var(--muted)">—</li>';
    const tl = Array.isArray(S.timeline) ? S.timeline.slice().sort((a, b) => (a.t || 0) - (b.t || 0)) : [];
    const dLabel = S.dayTypeLabel || dayLabel || (S.dayType && S.dayType !== 'normal' ? S.dayType : null) || 'úplne normálny deň (vraj)';
    const box = openModal(`<h3>${esc(G.DAYS[((S.day || 1) - 1) % 7])} • koniec dňa</h3><h2>${S.segment && S.segment.name ? esc(S.segment.name) + ' je za tebou' : 'Deň ' + (S.day || 1) + ' je za tebou'}</h2>${S.leftover && S.leftover.length ? '<div class="left">🧠 Ostalo v hlave: ' + S.leftover.map((t) => esc(typeof t === 'string' ? t : (t.title || ''))).join(' • ') + '</div>' : ''}
      <div class="dtype">📅 Dnes bol: <b>${esc(dLabel)}</b>${S.weather === 'rain' ? ' <span>🌧️</span>' : ''}</div>
      <div class="grid">
        <div><b style="color:${dm >= 0 ? 'var(--good)' : 'var(--bad)'}">${sg(dm, (v) => num2(v))} €</b><small>peniaze (spolu ${eur(S.money || 0)})</small></div>
        <div><b>⭐ ${Math.round(S.rep || 0)}</b><small>reputácia (${sg(Math.round(dr), String)})</small></div>
        <div><b>👧 ${Math.round(S.dad || 0)}</b><small>otcovské body (${sg(Math.round(dd), String)})</small></div>
      </div>
      <div class="cols"><div>
      <h3>Hotovo</h3><ul>${li(done, '✅')}</ul>
      <h3>Zabudnuté</h3><ul>${li(forg, '🫥')}</ul>
      <h3>Pokazené</h3><ul>${li(fail, '❌')}</ul>
      </div><div>
      <h3>Čo všetko sa dnes stalo</h3>
      ${tl.length ? `<ul class="tl">${tl.map((e) => `<li><b>${esc(hm(e.t || 0))}</b>${esc(e.text || e.title || '')}</li>`).join('')}</ul>` : '<ul><li style="color:var(--muted)">Nič si nezapamätal. Typické.</li></ul>'}
      </div></div>
      <div class="verdict">„${esc(verdict)}“</div>
      <div class="row"><button class="btn pri">Ďalší deň ▶ <kbd>Enter</kbd></button></div>`, 'sum');
    let fired = false;
    const go = () => { if (fired) return; fired = true; click(); closeModal(); cb && cb(); };
    box.querySelector('.row .btn').addEventListener('click', go);
    setKeys((e) => { if (e.key === 'Enter' && !e.repeat) go(); });
  };

  // ---------------------------------------------------------------- štart
  UI.showStart = function (cb) {
    if (!inited) UI.init();
    let save = null;
    try { save = JSON.parse(localStorage.getItem(G.CFG.saveKey) || 'null'); } catch (e) { save = null; }
    const saveHtml = save && save.day ? `<div class="save">💾 Uložená hra: ${esc(G.DAYS[(save.day - 1) % 7])}, deň ${save.day}` +
      (save.money != null ? ` • 💰 ${eur(+save.money)}` : '') + (save.rep != null ? ` • ⭐ ${Math.round(save.rep)}` : '') +
      (save.dad != null ? ` • 👧 ${Math.round(save.dad)}` : '') + '</div>' : '';
    const C = [
      [['W', 'A', 'S', 'D'], 'chôdza a jazda (aj šípky)'], [['Shift'], 'beh'], [['Klik'], 'choď tam (myšou)'],
      [['E'], 'interakcia / podrž'], [['F'], 'mobil'], [['Tab'], 'prepni úlohu'], [['N'], 'papierik (pripni úlohu)'],
      [['M'], 'veľká mapa'], [['H'], `zapískať na ${esc(G.CFG.dogGen)}`], [['Space'], 'ručná brzda'],
      [['R'], 'auto späť na cestu'], [['Esc'], 'pauza / odmietni hovor'],
      [['F', 'Enter'], 'zdvihni zvoniaci telefón'], [['Enter', 'Klik'], 'odklikni SMS'],
    ];
    els.start.innerHTML = `<div class="panel box">
      <div class="logo"><div class="pt">${portraitSVG('start')}</div><div>
        <h1>KDE MÁM KĽÚČE?! <span class="v2">kamošská verzia</span></h1>
        <div class="sub">Jeden deň v hlave ${esc(G.CFG.hero === 'Paťo' ? 'Paťa' : G.CFG.hero)} – šéfkuchára centrálnej kuchyne, majiteľa bistra, otca ${esc(G.CFG.kidGen)} a pána ${esc(G.CFG.dogGen)}.
        Rozvoz do 12 výdajní, škôlka, obedová špička, ex volá, Katka píše… a kľúče sú zase niekde inde.
        <b class="v3note">Novinka v3: späť v 2D, mesto do vrecka (${G.CFG.W}×${G.CFG.H} m) – všetko je bližšie, ale vyrušenia ti lezú rovno do tváre: zvoní telefón, padajú SMS, ${esc(G.CFG.dog)} ti sadá na nohu.</b></div>
      </div></div>
      <div class="teaser">📅 Dnes: <b>???</b><span style="color:var(--muted);font-size:13px">Každý deň je iný. Čo ťa dnes zloží, zistíš až keď sa to stane.</span></div>
      <div class="ctr">${C.map((c) => `<div><span class="k">${c[0].map((k) => `<kbd>${k}</kbd>`).join('')}</span>${c[1]}</div>`).join('')}</div>
      ${saveHtml}
      <div class="segs"><div class="segt">Čo zahráš? (jedna časť dňa ≈ 5 minút)</div>
        <button class="btn pri go" data-mode="random">🎲 Náhodná časť dňa ▶ <kbd>Enter</kbd></button>
        <div class="segrow">
          <button class="btn seg" data-mode="rano">🌅 Ráno</button><button class="btn seg" data-mode="dopoludnie">☕ Dopoludnie</button><button class="btn seg" data-mode="obed">🍳 Obed</button>
          <button class="btn seg" data-mode="popoludnie">🧸 Popoludnie</button><button class="btn seg" data-mode="vecer">🌙 Večer</button><button class="btn seg" data-mode="noc">🛏️ Noc</button>
          <button class="btn seg" data-mode="full">📅 Celý deň (~17 min)</button>
        </div></div></div>`;
    els.start.classList.remove('hidden');
    UI.modal = true;
    let fired = false;
    const go = (mode) => {
      if (fired) return; fired = true;
      try { G.Audio.init(); } catch (e) {}
      click();
      if (startKeys) { window.removeEventListener('keydown', startKeys, true); startKeys = null; }
      els.start.classList.add('hidden');
      els.start.innerHTML = '';
      UI.modal = false;
      cb && cb(mode || 'random');
    };
    els.start.querySelectorAll('button[data-mode]').forEach((b) => b.addEventListener('click', () => go(b.dataset.mode)));
    startKeys = (e) => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); go('random'); } };
    window.addEventListener('keydown', startKeys, true);
  };


  // ---------------------------------------------------------------- zvoniaci telefón (neblokujúci overlay; svet beží ďalej)
  // UI.ring(ch, cb): ch = {caller, sub, avatar, q, opts, hangNote}; cb({answered:true, opt}) | cb({answered:false})
  // Naraz zvoní len jeden – ďalšie hovory čakajú v rade (max 2), prebytok sa hneď odmietne.
  const RING_T = 8, RING_MAX_Q = 2;
  let ringCur = null, ringQueue = [], ringKeys = null;
  function pumpRing() {
    if (ringCur || !ringQueue.length || UI.modal || G.paused) return;
    showRing(ringQueue.shift());
  }
  UI.ring = function (ch, cb) {
    if (!inited) UI.init();
    ch = ch || {};
    const job = { ch, cb };
    if (ringCur || UI.modal || G.paused) {
      if (ringQueue.length >= RING_MAX_Q) { try { cb && cb({ answered: false, missed: true }); } catch (e) { console.warn(e); } return false; }
      ringQueue.push(job);
      return true;
    }
    showRing(job);
    return true;
  };
  UI.isRinging = () => !!ringCur;
  function showRing(job) {
    const ch = job.ch, name = ch.caller || 'Neznáme číslo';
    const ini = (ch.avatar || name.trim().charAt(0) || '?').toUpperCase();
    const hue = Math.abs([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 360;
    const el = els.ring;
    const C = 2 * Math.PI * 54;
    el.innerHTML = `<div class="rbox">
      <div class="notch"></div>
      <div class="rtop"><div class="cd"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:0"/></svg>
        <div class="av" style="background:linear-gradient(145deg,hsl(${hue} 55% 55%),hsl(${hue} 60% 30%))">${esc(ini)}</div></div>
        <div class="nm">${esc(name)}</div><div class="rel">${esc((G.CFG.showRoles && G.roleOf && G.roleOf(name)) || ch.sub || 'mobil')}</div>
        <div class="st">volá… <b class="sec">${RING_T}</b></div></div>
      <div class="sp"></div>
      <div class="rbtns">
        <div><button type="button" class="btn dec" aria-label="Odmietnuť">📵</button><span>Odmietnuť <kbd>Esc</kbd></span></div>
        <div><button type="button" class="btn acc" aria-label="Zdvihnúť">📞</button><span>Zdvihnúť <kbd>F</kbd><kbd>Enter</kbd></span></div>
      </div></div>`;
    el.classList.remove('hidden', 'out');
    const fg = el.querySelector('.fg'), sec = el.querySelector('.sec');
    const vib = () => snd('vibrate');
    vib();
    const vibIv = setInterval(() => { if (!G.paused) vib(); }, 1200);
    let left = RING_T, raf = 0, last = performance.now(), done = false;
    ringCur = { job };
    const finish = (res) => {
      if (done) return; done = true;
      clearInterval(vibIv); cancelAnimationFrame(raf);
      if (ringKeys) { window.removeEventListener('keydown', ringKeys, true); ringKeys = null; }
      el.classList.add('out');
      setTimeout(() => { if (el.classList.contains('out')) { el.classList.add('hidden'); el.innerHTML = ''; } }, 260); // nový zvonček medzitým 'out' zhodí
      const end = (r) => { ringCur = null; try { job.cb && job.cb(r); } catch (e) { console.warn(e); } pumpRing(); };
      if (res.answered) {
        click();
        // zdvihnuté → blokujúci hovor; ďalší zvonček až po dohovorení
        try { UI.phoneCall(ch, (opt) => end({ answered: true, opt })); }
        catch (e) { console.warn(e); end({ answered: true, opt: { hangup: true, t: 'Zložiť' } }); }
      } else {
        snd('click');
        end({ answered: false, timeout: !!res.timeout });
      }
    };
    el.querySelector('.acc').addEventListener('click', () => finish({ answered: true }));
    el.querySelector('.dec').addEventListener('click', () => finish({ answered: false }));
    ringKeys = (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyF' || e.key === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); finish({ answered: true }); }
      else if (e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish({ answered: false }); }
    };
    window.addEventListener('keydown', ringKeys, true);
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (done) return;
      if (!G.paused) {
        left -= dt;
        fg.style.strokeDashoffset = (C * (1 - clamp(left / RING_T, 0, 1))).toFixed(1);
        setText(sec, String(Math.max(0, Math.ceil(left))));
        if (left <= 0) { finish({ answered: false, timeout: true }); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- SMS (banner zhora; neblokujúci)
  // UI.sms(from, text, cb): odkliknutie do 6 s → cb({dismissed:true}); inak cb({dismissed:false}) raz, červená bliká ešte 10 s.
  const SMS_T = 6, SMS_LATE = 10;
  let smsCur = null, smsQueue = [], smsKeys = null;
  function pumpSms() { if (smsCur || !smsQueue.length) return; showSms(smsQueue.shift()); }
  UI.sms = function (from, text, cb) {
    if (!inited) UI.init();
    smsQueue.push({ from: from || 'Neznáme číslo', text: String(text == null ? '' : text), cb });
    pumpSms();
  };
  UI.hasSms = () => !!smsCur;
  function showSms(job) {
    const el = els.sms;
    const t = G.S ? hm(G.S.time) : 'teraz';
    const ini = (job.from.trim().charAt(0) || '?').toUpperCase();
    el.innerHTML = `<div class="smsb" role="button" tabindex="0">
      <div class="ic">${esc(ini)}</div>
      <div class="bd"><div class="hd"><span>SMS • ${esc(job.from)}</span><span>${esc(t)}</span></div><div class="tx">${esc(job.text)}</div></div>
      <div class="ok"><kbd>Enter</kbd><small>odklikni</small></div>
      <div class="bar"><div></div></div></div>`;
    el.classList.remove('out');
    const box = el.querySelector('.smsb'), bar = el.querySelector('.bar div');
    snd('ding');
    let left = SMS_T, late = false, lateLeft = SMS_LATE, raf = 0, last = performance.now(), done = false;
    smsCur = job;
    const close = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      if (smsKeys) { window.removeEventListener('keydown', smsKeys, true); smsKeys = null; }
      el.classList.add('out');
      setTimeout(() => { if (done && smsCur === job) { el.innerHTML = ''; el.classList.remove('out'); smsCur = null; pumpSms(); } }, 320);
    };
    const dismiss = () => {
      if (done) return;
      click();
      if (!late) { close(); try { job.cb && job.cb({ dismissed: true }); } catch (e) { console.warn(e); } }
      else close(); // neskoro – cb už bol zavolaný
    };
    box.addEventListener('click', dismiss);
    smsKeys = (e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); dismiss(); }
    };
    window.addEventListener('keydown', smsKeys, true);
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (done) return;
      if (!G.paused) {
        if (!late) {
          left -= dt;
          bar.style.width = (clamp(left / SMS_T, 0, 1) * 100).toFixed(1) + '%';
          if (left <= 0) {
            late = true; box.classList.add('late'); bar.style.width = '100%';
            snd('fail');
            try { job.cb && job.cb({ dismissed: false }); } catch (e) { console.warn(e); }
          }
        } else {
          lateLeft -= dt;
          bar.style.width = (clamp(lateLeft / SMS_LATE, 0, 1) * 100).toFixed(1) + '%';
          if (lateLeft <= 0) { close(); return; }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- grab (fyzické vyrušenie: hráč stojí `dur` s)
  // UI.grab(who, text, dur, cb): G.S.freeze = dur, veľká bublina nad `who`, otras obrazovky, zvuk; po dur → cb()
  let grabCur = null;
  UI.grab = function (who, text, dur, cb) {
    if (!inited) UI.init();
    dur = Math.max(0.3, +dur || 2);
    if (G.S) G.S.freeze = Math.max(G.S.freeze || 0, dur);
    const isDog = who === 'dog' || (who && typeof who === 'object' && (who.kind === 'dog' || (A() && who === A().dog)));
    const isKid = who === 'kid';
    if (text) UI.bubble(who || 'player', text, dur + 0.6, 'big');
    snd(isDog ? 'bump' : isKid ? 'ding' : 'bump');
    const g = els.game || $('game');
    if (g) { g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); setTimeout(() => g.classList.remove('shake'), 420); }
    if (grabCur) { grabCur.cancel = true; }
    const me = { cancel: false };
    grabCur = me;
    let left = dur, raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (me.cancel) return;
      if (!G.paused) {
        left -= dt;
        if (G.S) G.S.freeze = Math.max(0, left);
        if (left <= 0) {
          grabCur = null;
          if (G.S) G.S.freeze = 0;
          try { cb && cb(); } catch (e) { console.warn(e); }
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return dur;
  };
  UI.isGrabbed = () => !!grabCur;

  // ---------------------------------------------------------------- pauza
  UI.pause = function (on) {
    let p = $('pause');
    if (on) {
      if (!p) {
        const K = (keys, what) => `<li>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' ')}<span>${what}</span></li>`;
        const dog = esc(G.CFG.dogGen || 'Bundáša');
        const rows = [
          K(['W A S D', '← ↑ → ↓'], 'chôdza / jazda'), K(['Shift'], 'beh'), K(['klik'], 'choď tam (aj cez dvere)'),
          K(['E'], 'interakcia / podrž pri dlhších úkonoch'), K(['F'], 'mobil • zdvihnúť hovor'), K(['Enter'], 'zdvihnúť hovor • odkliknúť SMS'),
          K(['Esc'], 'odmietnuť hovor • pauza'), K(['Tab'], 'prepnúť úlohu v hlave'), K(['N'], 'papierik (úloha sa nezabudne)'),
          K(['M'], 'veľká mapa'), K(['H'], `zapískať na ${dog}`), K(['Space'], 'ručná brzda'), K(['R'], 'Fabia zaseknutá → späť na cestu'),
          K(['B'], 'ladenie: ukázať prekážky'),
        ].join('');
        let who = '';
        if (G.CFG.showRoles && Array.isArray(G.WHO)) {
          who = '<div class="pwho"><h4>Kto je kto</h4><ul>' + G.WHO.map(([n, d]) =>
            `<li><b>${esc(n)}</b><i>${esc((G.roleOf && G.roleOf(n)) || '')}</i><span>${esc(d)}</span></li>`).join('') + '</ul></div>';
        }
        p = document.createElement('div'); p.id = 'pause';
        p.innerHTML = `<div class="pbox${who ? ' roles' : ''}"><b>PAUZA</b><span class="sub">aj mozog potrebuje chvíľku</span>
          <div class="pcols"><ul class="pkeys">${rows}</ul>
          <div class="pinfo"><h4>Ako to funguje</h4>
            <p>Úlohy sa vŕšia v „zozname v hlave“ – najnovšia je navrchu. Staršie blednú a zabúdajú sa; 📌 papierik (N) to zastaví.</p>
            <p>Hovory, SMS a ľudia, čo ťa chytia za ruku, ťa vyrušia naozaj. Fokus klesá, káva ho dvíha. 3 dokončené úlohy za sebou = hyperfokus.</p>
            <p>Nelka je u teba striedavo (cca každý druhý deň). Bundáša treba pred obedom nechať doma alebo v kuchyni.</p>
          </div></div>${who}
          <div class="pbtns"><button type="button" class="btn pri" data-a="go">Pokračovať</button><button type="button" class="btn" data-a="map">Mapa (M)</button><button type="button" class="btn" data-a="end">Ukončiť deň</button></div>
        </div>`;
        p.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return; click();
          const a = b.dataset.a;
          G.paused = false; UI.pause(false);
          if (a === 'map' && UI.bigmap) UI.bigmap(true);
          if (a === 'end' && G.Ev && G.Ev.endDay) G.Ev.endDay(false);
        });
        document.body.appendChild(p);
      }
    } else if (p) p.remove();
  };

  G.UI = UI;
})();
