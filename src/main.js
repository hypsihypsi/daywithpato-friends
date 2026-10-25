// v3: herná slučka, vstup, interakcie, prepojenie Map/R2/Act/Ev/UI (2D canvas).
(() => {
  const C = G.CFG;
  const M = G.Main = {};
  const cv = document.getElementById('game');
  let running = false, last = 0, clock = 0;
  const keys = {};
  const pressed = new Set();
  let hold = { key: null, t: 0, lock: false };
  let autoT = 0, curAction = null;
  let fpsAcc = 0, fpsN = 0;
  M.fps = 0; M.autoplay = false;
  G.paused = false;

  const Mp = () => G.Map, Sc = () => G.R2, A = () => G.Act, Ev = () => G.Ev || G.Q;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // ---------- vstup ----------
  const GAME_KEYS = ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  addEventListener('keydown', e => {
    if (G.UI && G.UI.modal) return;
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed.add(e.code);
    keys[e.code] = true;
  });
  // keyup v capture fáze: modálne okná (UI) zastavujú šírenie udalostí, inak by kláves ostal „stlačený“
  addEventListener('keyup', e => { keys[e.code] = false; }, true);
  const clearKeys = () => { for (const k in keys) keys[k] = false; pressed.clear(); };
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  let wasModal = false;
  addEventListener('resize', () => Sc().resize && Sc().resize());

  // klik → svetové súradnice (2D)
  function screenToWorld(sx, sy) { return Sc().unproject(sx, sy); }
  cv.addEventListener('mousedown', e => {
    if (!running || G.paused || G.UI.modal || !G.S || G.S.ended) return;
    if (A().player.inCar) return;
    const w = screenToWorld(e.clientX, e.clientY);
    if (!w) return;
    let best = null, bd = 3.5;
    for (const h of hotspotList()) {
      const d = d2(h.x, h.z, w.x, w.z);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) A().routeTo(best.x, best.z, best.id);
    else A().routeTo(w.x, w.z, null);
    autoT = 0;
  });

  // ---------- hotspoty ----------
  function hotspotList() {
    const S = G.S, out = [];
    const hs = Mp().hs;
    for (const id in hs) {
      const h = hs[id];
      if (h.flag && !(S && S.flags && S.flags[h.flag])) continue;
      out.push({ id, x: h.x, z: h.z, r: h.r || 2.5 });
    }
    const k = A().kid;
    if (k && k.state !== 'car' && k.state !== 'away') out.push({ id: 'kid', x: k.x, z: k.z, r: 2.2 });
    const dg = A().dog;
    if (dg && dg.state !== 'car') out.push({ id: 'dog', x: dg.x, z: dg.z, r: 2.2 });
    const c = A().car;
    if (c && !A().player.inCar) out.push({ id: 'car', x: c.x, z: c.z, r: 3.6 });
    // dynamické hotspoty riaditeľa dňa (hasiak pri Fabii, stromy pri výbehu…)
    const ev = Ev();
    if (ev && ev.dynHs) for (const h of ev.dynHs()) out.push({ id: h.id, x: h.x, z: h.z, r: h.r || 2.5 });
    return out;
  }
  M.hotspotList = hotspotList;

  function findAction() {
    const p = A().player;
    if (p.inCar) {
      if (Math.abs(A().car.speed) < 3) {
        // krok questu typu drive má prednosť (napr. policajná kontrola)
        const a = Ev().actionFor('car_inside');
        if (a) { a.hs = 'car_inside'; return a; }
        return { label: 'Vystúpiť z Fabie', type: 'press', run: () => A().exitCar(), hs: 'car' };
      }
      return null;
    }
    const near = hotspotList()
      .map(h => ({ h, d: d2(h.x, h.z, p.x, p.z) }))
      .filter(o => o.d <= o.h.r)
      .sort((a, b) => a.d - b.d);
    if (p.autoUse) {
      const o = near.find(n => n.h.id === p.autoUse);
      if (o) { const a = Ev().actionFor(o.h.id); if (a) { a.hs = o.h.id; return a; } }
    }
    let fallback = null, petAct = null;
    for (const o of near) {
      const a = Ev().actionFor(o.h.id);
      if (!a) continue;
      a.hs = o.h.id;
      if (a.quest) return a;
      const pet = (o.h.id === 'kid' && A().kid.state === 'follow') || (o.h.id === 'dog' && A().dog.state === 'follow');
      if (pet) { petAct = petAct || a; continue; }
      fallback = fallback || a;
    }
    return fallback || petAct;
  }

  function handleInteraction(dt) {
    const a = findAction();
    curAction = a;
    const p = A().player;
    const eDown = !!keys.KeyE || (M.autoplay && !!a);
    if (!eDown) hold.lock = false;

    let auto = false;
    if (p.autoUse && !p.route) {
      autoT += dt;
      if (a && a.hs === p.autoUse && autoT < 8) auto = true;
      else if (autoT > 0.3) { p.autoUse = null; autoT = 0; }
    }
    if (!a) { hold.key = null; hold.t = 0; G.UI.setPrompt(null, null); return; }
    const key = a.hs + '|' + a.label;
    if (hold.key !== key) { hold.key = key; hold.t = 0; }

    if (a.type === 'hold') {
      const active = (eDown && !hold.lock) || auto;
      if (active) hold.t += dt; else hold.t = Math.max(0, hold.t - dt * 2);
      const prog = clamp(hold.t / (a.time || 1), 0, 1);
      G.UI.setPrompt(a.label, prog);
      if (prog >= 1) {
        hold.t = 0; hold.lock = true; hold.key = null;
        if (auto) { p.autoUse = null; autoT = 0; }
        a.run();
      }
    } else {
      G.UI.setPrompt(a.label, null);
      if ((pressed.has('KeyE') && !hold.lock) || auto || (M.autoplay && !hold.lock)) {
        hold.lock = true;
        if (auto) { p.autoUse = null; autoT = 0; }
        a.run();
      }
    }
  }

  // ---------- autoplay (pre overovač) ----------
  let apT = 0;
  function autoplayStep(dt) {
    const S = G.S, p = A().player, ev = Ev();
    apT -= dt;
    if (apT > 0) return;
    apT = 0.6;
    const act = ev.active();
    if (!act) {
      // nič na práci: choď domov / postoj
      return;
    }
    const ids = ev.targets(act).filter(id => id !== 'phone');
    if (ev.targets(act).includes('phone')) { ev.usePhone(); return; }
    if (!ids.length) return;
    let best = null, bd = Infinity;
    for (const id of ids) {
      const pos = ev.hsPos(id);
      if (!pos) continue;
      const d = d2(pos.x, pos.z, p.x, p.z);
      if (d < bd) { bd = d; best = { id, pos }; }
    }
    if (!best) return;
    if (bd < 2) return; // interakcia prebehne cez handleInteraction (eDown v autoplay)
    // ďaleko → teleport autom (overovač nemeria jazdu), blízko → route pešo
    if (bd > 60 && !p.inCar) {
      const c = A().car;
      c.x = best.pos.x + 6; c.z = best.pos.z + 6; c.speed = 0;
      c.fuel = Math.max(0, c.fuel - bd * C.fuelPerM);
      if (A().kid.state === 'follow') { A().kid.x = c.x; A().kid.z = c.z; }
      if (A().dog.state === 'follow') { A().dog.x = c.x; A().dog.z = c.z; }
      p.x = best.pos.x + 1.2; p.z = best.pos.z + 1.2; p.route = null; p.autoUse = best.id;
      S.time += Math.min(25, bd / 400); // ~ čas jazdy
      if (Sc().snap) { const fp = A().focusPos(); Sc().snap(fp.x, fp.z, false); }
    } else if (!p.route) {
      if (bd > 60) { A().exitCar(); }
      A().routeTo(best.pos.x, best.pos.z, best.id);
    }
  }

  // ---------- update ----------
  function update(dt) {
    const S = G.S;
    Ev().update(dt);
    if (S.ended || G.UI.modal) return;
    const p = A().player;
    const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (M.autoplay) autoplayStep(dt);
    // fyzické vyrušenie (grab) = hráč sa nehýbe; telefonovanie za volantom = volant nereaguje
    const frozen = (S.freeze || 0) > 0;
    if (S.callDriving > 0) S.callDriving -= dt;
    const steerOk = !(S.callDriving > 0);
    if (p.inCar) A().updateCar(dt, frozen ? { x: 0, y: 0, brake: true } : { x: steerOk ? ix : 0, y: iy, brake: !!keys.Space });
    else if (!frozen) A().updatePlayer(dt, { x: ix, y: iy, run: !!(keys.ShiftLeft || keys.ShiftRight) });
    A().update(dt);
    if (S.bubble) { S.bubble.t -= dt; if (S.bubble.t <= 0) S.bubble = null; }

    handleInteraction(dt);
    if (G.UI.modal) return;
    if (pressed.has('KeyF')) Ev().usePhone();
    else if (pressed.has('Tab')) Ev().cycle();
    else if (pressed.has('KeyN')) Ev().pin();
    else if (pressed.has('KeyM')) G.UI.bigmap && G.UI.bigmap();
    else if (pressed.has('KeyH')) {
      const dg = A().dog, f = A().focusPos();
      if (dg.state !== 'car' && d2(dg.x, dg.z, f.x, f.z) < 40) { A().dogSet('follow'); G.UI.say('Bundáš! Poď sem!'); if (G.UI.bubble) G.UI.bubble('dog', 'HAF!', 1.5); }
      else G.UI.say('Bundáš? …Bundáš?!');
    }
    else if (pressed.has('KeyB')) { G.debugSolids = !G.debugSolids; G.UI.toast(G.debugSolids ? '🟥 Ladenie: prekážky zapnuté (B vypne)' : 'Ladenie vypnuté', 'info'); }
    else if (pressed.has('KeyR') && p.inCar) {
      if (A().unstuckCar()) G.UI.say('Fabia je späť na ceste. Nikto nič nevidel.');
    }

  }

  // ciele questov → značky na zemi
  const markers = new Set();
  function updateMarkers() {
    const S = G.S, ev = Ev(), act = ev.active();
    const want = new Map();
    if (act && S.hideArrow <= 0) {
      for (const id of ev.targets(act)) {
        if (id === 'phone') continue;
        const pos = ev.hsPos(id); if (pos) want.set('a:' + id, { pos, color: 0xffc440 });
      }
    }
    for (const q of S.stack) {
      if (q === act) continue;
      for (const id of ev.targets(q)) {
        if (id === 'phone') continue;
        const pos = ev.hsPos(id); if (pos) want.set('o:' + id, { pos, color: 0xffffff });
      }
    }
    for (const id of [...markers]) if (!want.has(id)) { Sc().removeMarker(id); markers.delete(id); }
    for (const [id, m] of want) {
      if (!markers.has(id)) { Sc().addMarker(id, m.pos.x, m.pos.z, m.color); markers.add(id); }
      else Sc().updateMarker(id, m.pos.x, m.pos.z);
    }
  }

  // ---------- slučka ----------
  function frame(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts; clock += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) { M.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    try {
      if (running && G.S) {
        if (pressed.has('Escape') && !G.UI.modal && !G.S.ended) { G.paused = !G.paused; G.UI.pause(G.paused); }
        const modalNow = !!(G.UI.modal || G.paused);
        if (modalNow !== wasModal) { clearKeys(); wasModal = modalNow; }
        const live = !G.paused && !G.UI.modal && !G.S.ended;
        if (live) update(dt);
        const f = A().focusPos();
        const c = A().car, p = A().player;
        const ld = p.inCar ? { dx: Math.cos(c.a) * c.speed * 0.5, dz: Math.sin(c.a) * c.speed * 0.5 } : { dx: 0, dz: 0 };
        Sc().follow(f.x, f.z, p.inCar, dt, ld.dx, ld.dz);
        if (G.S.weather) Sc().setWeather(G.S.weather);
        updateMarkers();
        if (G.S.dayTypeRevealed && G.S.dayTypeName && M.shownDayType !== G.S.dayTypeName) { M.shownDayType = G.S.dayTypeName; if (G.UI.setDayType) G.UI.setDayType(G.S.dayTypeName); }
        Sc().render(live ? dt : 0);
        G.UI.update(dt);
      }
    } catch (err) {
      console.error(err);
      M.lastError = String(err && err.stack || err);
    }
    pressed.clear();
    requestAnimationFrame(frame);
  }

  M.start = () => { running = true; };
  M.action = () => curAction;
  M.keys = keys;
  M.setAutoplay = v => { M.autoplay = !!v; };

  function boot() {
    try {
      G.UI.init();
      G.Map.build();
      G.R2.init(cv);
      G.Act.init();
    } catch (err) { console.error(err); M.lastError = String(err && err.stack || err); }
    G.UI.showStart((mode) => {
      G.CFG.sessionMode = mode || 'random';
      if (G.CFG.sessionMode === 'full') G.CFG.timeScale = G.CFG.timeScaleFull || 0.9; else G.CFG.timeScale = G.CFG.timeScaleSeg || 0.65;
      Ev().newDay();
      running = true;
    });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
