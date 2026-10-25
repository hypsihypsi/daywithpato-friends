// Aktéri v2: hráč (Paťo), Fabia, Nelka, Bundáš, menovité NPC, zákazníci, chodci, premávka
// v3: čistá logika (pohyb, kolízie, pes, premávka, NPC) – kreslí ich G.R2 (2D canvas). Svet v metroch na rovine XZ.
// Uhol `a` je v rovine XZ (smer = (cos a, sin a)); 0 = východ (+x), +z = juh (dole na obrazovke).
window.G = window.G || {};
G.Act = (() => {
  const TAU = Math.PI * 2;
  const CFG = () => G.CFG || {};
  const M = () => G.Map || {};
  const S = () => G.S || {};

  // ---------- pomocné ----------
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  function srng(seed) {
    let s = (seed * 1000003) >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const isNight = () => {
    const t = S().time;
    return typeof t === 'number' && (t >= 19 * 60 + 30 || t < 6 * 60 + 45);
  };
  const lunch = () => { const t = S().time; return typeof t === 'number' && t >= 660 && t < 840; };
  const hs = (id) => (M().hs && M().hs[id]) || null;
  const loc = (id) => (M().locs && M().locs[id]) || null;
  const say = (t) => { if (G.UI && G.UI.say) G.UI.say(t); };
  const toast = (t, k) => { if (G.UI && G.UI.toast) G.UI.toast(t, k); };
  const bubble = (who, t) => { if (G.UI && typeof G.UI.bubble === 'function') { try { G.UI.bubble(who, t); } catch (e) { /* ignore */ } } };
  const fx = (o) => { const E = G.Ev || G.Q; if (E && E.fx) { try { E.fx(o); } catch (e) { /* ignore */ } } };
  const mapW = () => CFG().W || 1400, mapH = () => CFG().H || 1000;

  function resolveWalk(x, z, r) {
    const Mp = M();
    if (!Mp.resolve) return { x, z, hit: false };
    const res = Mp.resolve(x, z, r, Mp.solidsWalk || []);
    return res && typeof res.x === 'number' ? res : { x, z, hit: false };
  }
  function circleHitsCar(x, z, r) {
    const Mp = M();
    const rects = Mp.solidsCar || [];
    if (!rects.length) return false;
    if (Mp.circleHits) return !!Mp.circleHits(x, z, r, rects);
    if (Mp.resolve) { const res = Mp.resolve(x, z, r, rects); return !!(res && res.hit); }
    return false;
  }

  // ---------- vzhľady ----------
  const LOOK = {
    hero: { shirt: '#dccdb6', pants: '#2b3240', skin: '#e8bfa6', beard: '#a0602f', hair: '#a0602f', cap: '#1f2d52', brim: '#16213d', logo: '#e5b52a', chain: true },
    kid: { shirt: '#e86fa0', pants: '#5a6fb0', skin: '#f1c9b0', hair: '#7a4a2a', pig: true },
    // kuchyňa – biele kuchárske rondony + zástery
    agus: { shirt: '#f4f4f0', pants: '#2c2c30', skin: '#b07a52', hair: '#111111', chef: true, apron: '#e6e6e0' },
    ayo: { shirt: '#f4f4f0', pants: '#2c2c30', skin: '#5a3a28', hair: '#0e0c0a', chef: true, apron: '#e6e6e0' },
    fredy: { shirt: '#f4f4f0', pants: '#2c2c30', skin: '#c58d66', hair: '#2a1c14', beard: '#2a1c14', chef: true, apron: '#e6e6e0' },
    benji: { shirt: '#f4f4f0', pants: '#2c2c30', skin: '#f1cdb4', hair: '#d8b060', chef: true, apron: '#e6e6e0' },
    // bistro – čierne zástery
    tamara: { shirt: '#f0ece4', pants: '#1e1e24', skin: '#e9c0a4', hair: '#3a2416', bun: true, apron: '#1a1a1e' },
    lucia: { shirt: '#d9d4cc', pants: '#1e1e24', skin: '#f0cdb6', hair: '#c79a5a', apron: '#1a1a1e' },
    // šéfovia – smart casual
    joff: { shirt: '#3b5f9a', pants: '#c9b893', skin: '#e4b89a', hair: '#4a3a2e', beard: '#4a3a2e' },
    miska: { shirt: '#9a4a6a', pants: '#2a2a32', skin: '#eec5ae', hair: '#2e1a12', bun: true },
    simon: { shirt: '#5a7a9a', pants: '#3a3a44', skin: '#e2b496', hair: '#7a7a7e' },
    // šoféri
    lukas: { shirt: '#6a6f78', pants: '#2b3038', skin: '#e0b496', hair: '#2a2420', cap: '#c43c2c', brim: '#8e2a20' },
    matus: { shirt: '#4f5a66', pants: '#2b3038', skin: '#e6bca0', hair: '#5a3a24', cap: '#2a2a2a', brim: '#1a1a1a', beard: '#5a3a24' },
    ucitelka: { shirt: '#4f9a5a', pants: '#3b3f4a', skin: '#efc6ac', hair: '#5a3a24', bun: true },
    babka: { shirt: '#7b4f8e', pants: '#4a3a55', skin: '#e9c3ad', hair: '#b9b9bd', bun: true },
    ex: { shirt: '#c8373a', pants: '#1e1e24', skin: '#efc6ac', hair: '#1a1410' },
    nina: { shirt: '#e8c43a', pants: '#4a5a7a', skin: '#f1c9b0', hair: '#c79a5a' },
  };
  const SHIRTS = ['#4a78b8', '#b8584a', '#6a9a5a', '#d8a838', '#8a5aa8', '#3a8a8a', '#c8c0b0', '#5a5a66', '#d87a4a', '#7a8a3a'];
  const PANTS = ['#2b3240', '#3c3c44', '#4a5a7a', '#5a4a3a', '#22262e', '#6a6a72'];
  const SKINS = ['#e8bfa6', '#d9a888', '#f1c9b0', '#b98a6a', '#8a5a3a', '#efc6ac'];
  const HAIRS = ['#2e2018', '#5a3a24', '#c79a5a', '#1a1a1a', '#8a4a2a', '#9a9a9a'];
  function randLook(seed, kid) {
    const r = srng(seed * 7919 + 13);
    const pick = (a) => a[(r() * a.length) | 0];
    const l = { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS) };
    const v = r();
    if (kid) { if (v < 0.4) l.pig = true; else if (v < 0.55) l.bun = true; }
    else if (v < 0.15) l.bald = true;
    else if (v < 0.3) l.bun = true;
    else if (v < 0.42) { l.cap = pick(['#2a2a2a', '#8a2a2a', '#2a5a8a']); l.brim = '#1a1a1a'; }
    if (!kid && r() < 0.25) l.beard = l.hair;
    return l;
  }

  // ---------- stav ----------
  const Act = {
    player: { x: 700, z: 500, a: 0, inCar: false, route: null, autoUse: null, running: false, moving: false, phase: 0, amp: 0 },
    car: { x: 700, z: 520, a: 0, speed: 0, fuel: undefined, braking: false, flat: false, battery: 1, stuckT: 0, stuckHint: false, wheel: 0 },
    kid: { x: 700, z: 500, a: 0, state: 'home', moving: false, phase: 0, amp: 0, lostWarned: false, prev: null },
    dog: { x: 700, z: 500, a: 0, state: 'home', moving: false, phase: 0, amp: 0, lostWarned: false, distract: null, nextDistract: 12, barkT: 6 },
    npcs: {},
    peds: [],
    traffic: [],
    parked: [],
    van: null,
    LOOK,
  };

  const FABIA = '#3a6ea5';
  const P_R = 0.4;
  const CAR_R = 1.0, CAR_OFF = 1.6;
  let trail = [];
  let stuckT = 0, stuckX = 0, stuckZ = 0;
  let bumpT = 0, battSayT = 0, fuelSayT = 0;
  let clock = 0;
  const kidW = { tx: 0, tz: 0, wait: 1 };
  const dogW = { tx: 0, tz: 0, wait: 1 };
  const anchors = { kidHome: null, kidSkolka: null, dogHome: null, dogKuchyna: null, dogPark: null, dogVet: null };

  const carCircles = (x, z, a, off) => {
    const o = off == null ? CAR_OFF : off;
    const c = Math.cos(a), s = Math.sin(a);
    return [{ x: x - c * o, z: z - s * o }, { x, z }, { x: x + c * o, z: z + s * o }];
  };
  const vehCircles = (v) => carCircles(v.x, v.z, v.a, v.van ? 2.0 : CAR_OFF);

  // ---------- NPC ----------
  function mkNpc(o) {
    const n = Object.assign({
      a: 0, phase: Math.random() * 6, moving: false, amp: 0, scale: 1, sit: false, visible: true,
      seed: Math.random() * 100, wait: Math.random() * 3, cust: undefined,
    }, o);
    n.bx = n.x; n.bz = n.z; n.ba = n.a;
    return n;
  }
  const NAMED = ['tamara', 'lucia', 'agus', 'ayo', 'fredy', 'benji', 'joff', 'lukas', 'matus', 'ucitelka', 'babka', 'ex', 'nina', 'miska', 'simon'];
  function buildNpcs() {
    const n = {};
    for (const id of NAMED) {
      const h = hs(id);
      const hidden = id === 'ex' || id === 'nina' || ((id === 'miska' || id === 'simon') && !h);
      let x = 0, z = 0, a = 0;
      if (h) {
        x = h.x; z = h.z;
        const L = h.loc && loc(h.loc);
        if (L) a = Math.atan2(L.z - h.z, L.x - h.x); // otočený do budovy
      } else if (id === 'ex' || id === 'nina') {
        const d = hs(id + '_dvere'); if (d) { x = d.x; z = d.z; }
      }
      n[id] = mkNpc({ id, x, z, a, look: LOOK[id] || randLook(id.length * 17, false), visible: !hidden, sit: id === 'babka' });
    }
    // zákazníci v bistre (cez obed)
    const B = loc('bistro');
    const r = srng(515);
    if (B) {
      for (let i = 0; i < 6; i++) {
        const lx = (r() - 0.5) * Math.max(2, (B.w || 12) - 3), lz = (r() - 0.5) * Math.max(2, (B.d || 10) - 3);
        const c = Math.cos(B.rotY || 0), s = Math.sin(B.rotY || 0);
        const x = B.x + lx * c - lz * s, z = B.z + lx * s + lz * c;
        const res = resolveWalk(x, z, 0.3);
        n['zakaznik' + i] = mkNpc({ id: 'zakaznik' + i, x: res.x, z: res.z, a: r() * TAU, look: randLook(200 + i, false), sit: r() < 0.7, cust: i, visible: false });
      }
    }
    // zákazníci pri výdajniach (cez obed)
    for (let i = 0; i < 12; i++) {
      const h = hs('vydaj_' + i);
      if (!h) continue;
      const cnt = 1 + ((r() * 2) | 0);
      for (let j = 0; j < cnt; j++) {
        const an = r() * TAU, d = 1.3 + j * 0.9;
        const x = h.x + Math.cos(an) * d, z = h.z + Math.sin(an) * d;
        n['host_' + i + '_' + j] = mkNpc({ id: 'host_' + i + '_' + j, x, z, a: an + Math.PI, look: randLook(400 + i * 3 + j, r() < 0.15), scale: 1, cust: 100 + i, visible: false });
      }
    }
    Act.npcs = n;
  }
  Act.setNpc = function (id, o) {
    o = o || {};
    let n = Act.npcs[id];
    if (!n) { n = Act.npcs[id] = mkNpc({ id, x: 0, z: 0, look: LOOK[id] || randLook(id.length * 31, false), visible: false }); }
    if (typeof o.x === 'number') { n.x = n.bx = o.x; }
    if (typeof o.z === 'number') { n.z = n.bz = o.z; }
    if (typeof o.a === 'number') { n.a = n.ba = o.a; }
    if (typeof o.visible === 'boolean') n.visible = o.visible;
    if (typeof o.sit === 'boolean') n.sit = o.sit;
    if (o.look) n.look = o.look;
    return n;
  };

  // ---------- chodci ----------
  function roadNodes() {
    const Mp = M();
    if (Array.isArray(Mp.nodes) && Mp.nodes.length) return Mp.nodes;
    const out = [];
    if (Array.isArray(Mp.roads)) for (const r of Mp.roads) for (const p of (r.pts || [])) out.push(p);
    if (!out.length && Array.isArray(Mp.trafficLanes)) for (const l of Mp.trafficLanes) for (const p of (l.pts || [])) out.push(p);
    return out;
  }
  function roadHalfWidth(x, z) {
    const Mp = M();
    if (!Array.isArray(Mp.roads)) return 1.5;
    let best = 1e9, w = 3;
    for (const r of Mp.roads) {
      const pts = r.pts || [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
        const d = dist(x, z, ax + dx * t, az + dz * t);
        if (d < best) { best = d; w = (r.w || 7) / 2; }
      }
    }
    return w;
  }
  function pedRoute(pd, fromX, fromZ) {
    const Mp = M();
    const nodes = roadNodes();
    if (!nodes.length) return null;
    const B = nodes[(Math.random() * nodes.length) | 0];
    let pts = null;
    if (Mp.route) { try { pts = Mp.route(fromX, fromZ, B.x, B.z); } catch (e) { pts = null; } }
    if (!pts || pts.length < 2) pts = [{ x: fromX, z: fromZ }, { x: B.x, z: B.z }];
    const side = pd.side;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let tx = p1.x - p0.x, tz = p1.z - p0.z;
      const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const off = roadHalfWidth(pts[i].x, pts[i].z) + 1.5;
      out.push({ x: pts[i].x - tz * off * side, z: pts[i].z + tx * off * side });
    }
    return out;
  }
  function buildPeds() {
    const nodes = roadNodes();
    const r = srng(777);
    if (!Act.peds.length) {
      for (let i = 0; i < 20; i++) Act.peds.push({ id: 'ped' + i, x: 0, z: 0, a: 0, phase: r() * 6, amp: 0, moving: false, look: randLook(600 + i, false), speed: 1.2 + r() * 0.5, route: null, wait: r() * 2, side: r() < 0.5 ? -1 : 1, fails: 0, visible: true });
    }
    for (const pd of Act.peds) {
      if (nodes.length) {
        const A = nodes[(r() * nodes.length) | 0];
        const hw = roadHalfWidth(A.x, A.z) + 1.5;
        const an = r() * TAU;
        pd.x = A.x + Math.cos(an) * hw; pd.z = A.z + Math.sin(an) * hw;
        pd.visible = true;
      } else { pd.visible = false; }
      pd.route = null; pd.wait = r() * 3; pd.fails = 0;
    }
  }
  function updatePeds(dt) {
    for (const pd of Act.peds) {
      if (!pd.visible) continue;
      pd.moving = false;
      if (pd.wait > 0) { pd.wait -= dt; pd.amp += (0 - pd.amp) * Math.min(1, dt * 8); continue; }
      if (!pd.route || !pd.route.length) {
        pd.route = pedRoute(pd, pd.x, pd.z);
        if (!pd.route) { pd.wait = 5; continue; }
      }
      while (pd.route.length && dist(pd.x, pd.z, pd.route[0].x, pd.route[0].z) < 0.6) pd.route.shift();
      if (!pd.route.length) { pd.route = null; pd.wait = 1 + Math.random() * 4; continue; }
      const t = pd.route[0];
      const d = dist(pd.x, pd.z, t.x, t.z);
      const step = Math.min(d, pd.speed * dt);
      const ux = (t.x - pd.x) / d, uz = (t.z - pd.z) / d;
      const res = resolveWalk(pd.x + ux * step, pd.z + uz * step, 0.3);
      const moved = dist(pd.x, pd.z, res.x, res.z);
      if (moved < step * 0.3) {
        pd.fails++;
        if (pd.fails > 3) { pd.route = null; pd.fails = 0; pd.wait = 1; }
        else { pd.route.shift(); pd.wait = 0.3; }
        continue;
      }
      pd.fails = 0;
      pd.x = clamp(res.x, 1, mapW() - 1); pd.z = clamp(res.z, 1, mapH() - 1);
      pd.a += angDiff(pd.a, Math.atan2(uz, ux)) * Math.min(1, dt * 8);
      pd.phase += moved * 4.5;
      pd.moving = true;
      pd.amp += (0.8 - pd.amp) * Math.min(1, dt * 8);
    }
  }

  // ---------- premávka ----------
  function laneSegs(l) {
    const pts = l.pts || [];
    const segs = [];
    const n = l.loop ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = dist(a.x, a.z, b.x, b.z);
      if (L < 0.01) continue;
      segs.push({ ax: a.x, az: a.z, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, L });
    }
    return segs;
  }
  function buildTraffic() {
    const Mp = M();
    const lanes = (Mp.trafficLanes || []).map(laneSegs).filter((s) => s.length);
    const colors = ['#c23b30', '#e8e8e4', '#2a2a2e', '#8a8f96', '#2f6b3a', '#d9a02a', '#5a3f8a', '#b0b4ba', '#6a8ab8', '#8a3a3a'];
    const r = srng(4242);
    const total = lanes.reduce((s, l) => s + l.reduce((q, g) => q + g.L, 0), 0);
    if (!Act.traffic.length) {
      for (let i = 0; i < 14; i++) Act.traffic.push({ id: i, x: -100, z: -100, a: 0, speed: 0, vmax: 8 + r() * 5, color: colors[i % colors.length], brake: false, lane: -1, seg: 0, s: 0, wheel: 0, active: false });
    }
    Act.lanes = lanes;
    if (!lanes.length || total <= 0) { for (const t of Act.traffic) t.active = false; return; }
    let acc = 0;
    for (let i = 0; i < Act.traffic.length; i++) {
      const t = Act.traffic[i];
      let pos = ((i + 0.5) / Act.traffic.length) * total + (r() - 0.5) * 12;
      pos = ((pos % total) + total) % total;
      let li = 0;
      while (li < lanes.length) {
        const L = lanes[li].reduce((q, g) => q + g.L, 0);
        if (pos < L) break;
        pos -= L; li++;
      }
      if (li >= lanes.length) li = lanes.length - 1;
      let si = 0;
      while (si < lanes[li].length - 1 && pos > lanes[li][si].L) { pos -= lanes[li][si].L; si++; }
      t.lane = li; t.seg = si; t.s = Math.min(pos, lanes[li][si].L); t.active = true; t.speed = t.vmax * 0.6; t.brake = false;
      const sg = lanes[li][si];
      t.x = sg.ax + sg.dx * t.s; t.z = sg.az + sg.dz * t.s; t.a = Math.atan2(sg.dz, sg.dx);
      acc++;
    }
    void acc;
  }
  function buildParked() {
    const pc = ['#9a9ea6', '#6b1f24', '#e2e2dc', '#30343c', '#3f5f3f', '#c9b48a'];
    const Mp = M();
    const out = [];
    const lots = Array.isArray(Mp.lots) ? Mp.lots : null;
    if (lots && lots.length) {
      // lots: [{x,z,w,d,rot}] alebo [{x,z,a}] – pozície pri metre/bistre
      const r = srng(99);
      let k = 0;
      for (const lt of lots) {
        if (out.length >= 6) break;
        const slots = Array.isArray(lt.slots) ? lt.slots : null;
        if (slots) { for (const s of slots) { if (out.length >= 6) break; out.push({ x: s.x, z: s.z, a: s.a || 0, color: pc[k++ % 6] }); } continue; }
        const cnt = Math.min(2, 6 - out.length);
        const w = lt.w || 12, d = lt.d || 6, rot = lt.rot || 0;
        for (let i = 0; i < cnt; i++) {
          const lx = (r() - 0.5) * Math.max(0, w - 5), lz = (r() - 0.5) * Math.max(0, d - 2.5);
          out.push({ x: lt.x + lx * Math.cos(rot) - lz * Math.sin(rot), z: lt.z + lx * Math.sin(rot) + lz * Math.cos(rot), a: rot + Math.PI / 2, color: pc[k++ % 6] });
        }
      }
    }
    if (out.length < 6) {
      for (const id of ['metro', 'bistro']) {
        const L = loc(id); if (!L) continue;
        const d0 = (L.d || 10) / 2 + 6;
        for (let i = -1; i <= 1; i++) {
          if (out.length >= 6) break;
          out.push({ x: L.x + i * 3.2, z: L.z + d0, a: Math.PI / 2, color: pc[out.length % 6] });
        }
      }
    }
    for (const p of out) p.wheel = 0;
    Act.parked = out;
    // dodávka Petra/Tomáša pri rampe kuchyne
    const rp = hs('rampa'), K = loc('kuchyna');
    if (rp) {
      let ux = 0, uz = 1;
      if (K) { ux = rp.x - K.x; uz = rp.z - K.z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L; }
      Act.van = { x: rp.x + ux * 5.5, z: rp.z + uz * 5.5, a: Math.atan2(ux, -uz), color: '#ecebe6', van: true, wheel: 0 };
    } else Act.van = null;
  }
  function updateTraffic(dt) {
    const lanes = Act.lanes || [];
    if (!lanes.length) return;
    const c = Act.car, p = Act.player, k = Act.kid, d = Act.dog;
    const obst = [];
    for (const cc of carCircles(c.x, c.z, c.a)) obst.push({ x: cc.x, z: cc.z, e: 1.0 });
    if (!p.inCar) obst.push({ x: p.x, z: p.z, e: 0.4 });
    if (k.state !== 'car') obst.push({ x: k.x, z: k.z, e: 0.4 });
    if (d.state !== 'car') obst.push({ x: d.x, z: d.z, e: 0.4 });
    for (const pk of Act.parked) for (const cc of vehCircles(pk)) obst.push({ x: cc.x, z: cc.z, e: 1.0 });
    if (Act.van) for (const cc of vehCircles(Act.van)) obst.push({ x: cc.x, z: cc.z, e: 1.1 });
    const LOOK_D = 10;
    for (const t of Act.traffic) {
      if (!t.active) continue;
      const fx0 = Math.cos(t.a), fz0 = Math.sin(t.a);
      let target = t.vmax;
      const check = (ox, oz, e) => {
        const rx = ox - t.x, rz = oz - t.z;
        const along = rx * fx0 + rz * fz0;
        if (along <= 0 || along > LOOK_D + 2 + e) return;
        const lat = Math.abs(rx * fz0 - rz * fx0);
        if (lat >= 1.6 + e) return;
        const gap = along - 2.0 - e - 0.8;
        const v = gap <= 0 ? 0 : t.vmax * Math.min(1, gap / 8);
        if (v < target) target = v;
      };
      for (const o of obst) check(o.x, o.z, o.e);
      for (const o of Act.traffic) {
        if (o === t || !o.active) continue;
        if (Math.abs(o.x - t.x) > 16 || Math.abs(o.z - t.z) > 16) continue;
        // vzájomné blokovanie (križovatka): nižšie id ide, vyššie brzdí
        const ofx = Math.cos(o.a), ofz = Math.sin(o.a);
        const mx = t.x - o.x, mz = t.z - o.z;
        const mutual = (mx * ofx + mz * ofz) > 0 && Math.abs(mx * ofz - mz * ofx) < 2.6;
        if (mutual && t.id < o.id) continue;
        check(o.x, o.z, 1.0);
      }
      if (target < t.speed) t.speed = Math.max(target, t.speed - 9 * dt);
      else t.speed = Math.min(target, t.speed + 3 * dt);
      t.brake = target < t.speed + 0.3 && t.speed < t.vmax - 0.5;
      const lane = lanes[t.lane];
      t.s += t.speed * dt;
      let sg = lane[t.seg];
      while (t.s > sg.L) {
        t.s -= sg.L; t.seg++;
        if (t.seg >= lane.length) { t.seg = 0; }
        sg = lane[t.seg];
      }
      t.x = sg.ax + sg.dx * t.s; t.z = sg.az + sg.dz * t.s;
      const ta = Math.atan2(sg.dz, sg.dx);
      t.a += angDiff(t.a, ta) * Math.min(1, dt * 6);
      t.wheel += t.speed * dt / 0.32;
    }
  }

  // ---------- reset ----------
  function setAnchors() {
    const g = (id, fx0, fz0) => { const h = hs(id); return h ? { x: h.x, z: h.z } : { x: fx0, z: fz0 }; };
    const B = loc('byt') || { x: 700, z: 500 };
    anchors.kidHome = g('postielka', B.x + 2, B.z);
    anchors.dogHome = g('pelech', B.x - 2, B.z + 1);
    const sk = loc('skolka');
    anchors.kidSkolka = g('ucitelka', sk ? sk.x : B.x + 40, sk ? sk.z : B.z);
    anchors.dogKuchyna = g('rampa', B.x, B.z);
    anchors.dogPark = g('vybeh', B.x, B.z);
    anchors.dogVet = g('vet', B.x, B.z);
  }
  function fabiaHome() {
    const B = loc('byt');
    if (B && B.parking && typeof B.parking.x === 'number') return { x: B.parking.x, z: B.parking.z, a: B.parking.a || 0 };
    const Mp = M();
    if (B && Mp.doorPts) {
      let ds = null; try { ds = Mp.doorPts(B); } catch (e) { ds = null; }
      if (ds && ds.length) {
        const d = ds[0];
        const ox = d.outX != null ? d.outX : d.x, oz = d.outZ != null ? d.outZ : d.z;
        const ix = d.inX != null ? d.inX : B.x, iz = d.inZ != null ? d.inZ : B.z;
        let ux = ox - ix, uz = oz - iz; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
        return { x: ox + ux * 6, z: oz + uz * 6, a: Math.atan2(ux, -uz) };
      }
    }
    if (B) return { x: B.x, z: B.z + (B.d || 10) / 2 + 8, a: 0 };
    return { x: 700, z: 520, a: 0 };
  }
  Act.reset = function (day) {
    void day;
    setAnchors();
    const p = Act.player;
    const bed = hs('postel') || { x: anchors.kidHome.x - 3, z: anchors.kidHome.z };
    Object.assign(p, { x: bed.x + 0.9, z: bed.z + 0.4, a: Math.PI / 2, moving: false, running: false, phase: 0, amp: 0, inCar: false, route: null, autoUse: null });
    const c = Act.car, fh = fabiaHome();
    Object.assign(c, { x: fh.x, z: fh.z, a: fh.a, speed: 0, braking: false, flat: false, battery: 1, stuckT: 0, stuckHint: false, wheel: 0 });
    if (c.fuel === undefined || c.fuel === null) c.fuel = (CFG().tankL || 45) * 0.6; // Ev si to prepíše
    Object.assign(Act.kid, { x: anchors.kidHome.x, z: anchors.kidHome.z, a: 0, state: 'home', moving: false, phase: 0, amp: 0, lostWarned: false, prev: null });
    kidW.tx = Act.kid.x; kidW.tz = Act.kid.z; kidW.wait = 1;
    Object.assign(Act.dog, { x: anchors.dogHome.x, z: anchors.dogHome.z, a: 0, state: 'home', moving: false, phase: 0, amp: 0, lostWarned: false, distract: null, nextDistract: rnd(8, 20), barkT: rnd(4, 12) });
    dogW.tx = Act.dog.x; dogW.tz = Act.dog.z; dogW.wait = 1;
    trail = [];
    stuckT = 0; bumpT = 0;
    buildTraffic();
    buildParked();
    buildNpcs();
    buildPeds();
    if (carHitsAny(c.x, c.z, c.a)) Act.unstuckCar();
    // Fabia stojí otočená k najbližšej ceste, nie do zaparkovaných áut
    const Wm = G.Map || {};
    if (Wm.nearestRoad) {
      const nr = Wm.nearestRoad(c.x, c.z, 80);
      if (nr) {
        const dir = Math.atan2(nr.z - c.z, nr.x - c.x);
        if (!carHitsAny(c.x, c.z, dir)) c.a = dir;
      }
    }
    if (G.Audio) G.Audio.engine(false, 0);
  };

  Act.focusPos = function () {
    return Act.player.inCar ? { x: Act.car.x, z: Act.car.z } : { x: Act.player.x, z: Act.player.z };
  };

  // ---------- hráč ----------
  function pushOutCircles(x, z, r, circles, cr) {
    for (const c of circles) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), m = r + cr;
      if (d < m) {
        if (d < 0.001) { x += m; continue; }
        x = c.x + (dx / d) * m;
        z = c.z + (dz / d) * m;
      }
    }
    return { x, z };
  }
  function walkBlockers(px, pz) {
    const list = [carCircles(Act.car.x, Act.car.z, Act.car.a)];
    for (const pc of Act.parked) if (Math.abs(pc.x - px) < 8 && Math.abs(pc.z - pz) < 8) list.push(vehCircles(pc));
    if (Act.van && Math.abs(Act.van.x - px) < 9 && Math.abs(Act.van.z - pz) < 9) list.push(vehCircles(Act.van));
    for (const t of Act.traffic) if (t.active && Math.abs(t.x - px) < 8 && Math.abs(t.z - pz) < 8) list.push(vehCircles(t));
    return list;
  }

  Act.updatePlayer = function (dt, inp) {
    const p = Act.player, C = CFG(), s = S();
    inp = inp || { x: 0, y: 0, run: false };
    if (G.Audio) G.Audio.engine(false, 0);
    if (p.inCar) return;
    const ks = Act.kid.state;
    let spd = inp.run ? (C.run || 7) : (C.walk || 4.2);
    if (s.energy !== undefined && s.energy < 15) spd *= 0.7;
    if (ks === 'follow') spd = Math.min(spd, 8.0);
    if (ks === 'sick') spd = Math.min(spd, 6.5);
    if (s.hyper > 0) spd *= 1.5;

    let dx = 0, dz = 0, remain = Infinity;
    const km = Math.hypot(inp.x || 0, inp.y || 0);
    if (km > 0.1) {
      if (p.route) { p.route = null; p.autoUse = null; }
      const m = Math.min(1, km);
      dx = (inp.x / km) * m; dz = (inp.y / km) * m;
    } else if (p.route) {
      while (p.route.length && dist(p.x, p.z, p.route[0].x, p.route[0].z) < 0.5) p.route.shift();
      if (!p.route.length) {
        p.route = null; // autoUse ostáva – spracuje main.js
      } else {
        const t = p.route[0];
        const d = dist(p.x, p.z, t.x, t.z);
        dx = (t.x - p.x) / d; dz = (t.z - p.z) / d;
        remain = d;
      }
    }
    const mag = Math.hypot(dx, dz);
    const ox = p.x, oz = p.z;
    if (mag > 0.01) {
      let step = spd * mag * dt;
      if (step > remain) step = remain;
      const ux = dx / mag, uz = dz / mag;
      // podkroky: pri vysokej rýchlosti by jeden krok preskočil tenkú stenu (0,3 m) a hráč by uviazol v nej
      const SUB = 0.12, nSub = Math.max(1, Math.ceil(step / SUB)), ss = step / nSub;
      let nx = p.x, nz = p.z;
      for (let i = 0; i < nSub; i++) {
        let r = resolveWalk(nx + ux * ss, nz, P_R);
        nx = r.x; nz = r.z;
        r = resolveWalk(nx, nz + uz * ss, P_R);
        nx = r.x; nz = r.z;
      }
      for (const cs of walkBlockers(nx, nz)) {
        const o = pushOutCircles(nx, nz, P_R, cs, CAR_R);
        nx = o.x; nz = o.z;
      }
      p.x = clamp(nx, 1, mapW() - 1);
      p.z = clamp(nz, 1, mapH() - 1);
      p.a += angDiff(p.a, Math.atan2(uz, ux)) * Math.min(1, dt * 14);
    }
    const moved = dist(ox, oz, p.x, p.z);
    p.moving = moved > 0.002 && mag > 0.01;
    p.running = !!inp.run && p.moving;
    p.phase += moved * (p.running ? 3.6 : 4.6);
    p.amp += ((p.moving ? (p.running ? 1 : 0.75) : 0) - p.amp) * Math.min(1, dt * 10);

    // zaseknutie na trase
    if (p.route) {
      stuckT += dt;
      if (stuckT >= 0.8) {
        if (dist(p.x, p.z, stuckX, stuckZ) < 0.25) {
          p.route = null; p.autoUse = null;
          say('Hm, tadiaľto nie.');
        }
        stuckT = 0; stuckX = p.x; stuckZ = p.z;
      }
    } else { stuckT = 0; stuckX = p.x; stuckZ = p.z; }

    // stopa pre Nelku a Bundáša
    const last = trail[trail.length - 1];
    if (!last || dist(last.x, last.z, p.x, p.z) >= 0.5) {
      trail.push({ x: p.x, z: p.z });
      if (trail.length > 60) trail.shift();
    }
  };

  function bestDoor(L, fromX, fromZ, toX, toZ, leaving) {
    const Mp = M();
    let ds = null;
    try { ds = Mp.doorPts ? Mp.doorPts(L) : null; } catch (e) { ds = null; }
    if (!ds || !ds.length) return null;
    let best = null, bd = Infinity;
    for (const d of ds) {
      const ix = d.inX != null ? d.inX : d.x, iz = d.inZ != null ? d.inZ : d.z;
      const ox = d.outX != null ? d.outX : d.x, oz = d.outZ != null ? d.outZ : d.z;
      const v = leaving ? dist(fromX, fromZ, ix, iz) + dist(ox, oz, toX, toZ) : dist(fromX, fromZ, ox, oz) + dist(ix, iz, toX, toZ);
      if (v < bd) { bd = v; best = { ix, iz, ox, oz }; }
    }
    return best;
  }
  function graphRoute(ax, az, bx, bz) {
    const Mp = M();
    if (!Mp.route || dist(ax, az, bx, bz) < 30) return [];
    let pts = null;
    try { pts = Mp.route(ax, az, bx, bz); } catch (e) { pts = null; }
    if (!pts || !pts.length) return [];
    pts = pts.map((q) => ({ x: q.x, z: q.z }));
    // odstráň úvodné uzly, ktoré by nás vracali späť, a koncové, ktoré sú za cieľom
    while (pts.length > 1 && dist(ax, az, pts[1].x, pts[1].z) + 0.5 < dist(ax, az, pts[0].x, pts[0].z) + dist(pts[0].x, pts[0].z, pts[1].x, pts[1].z) - 2) pts.shift();
    while (pts.length > 1 && dist(pts[pts.length - 2].x, pts[pts.length - 2].z, bx, bz) + 0.5 < dist(pts[pts.length - 1].x, pts[pts.length - 1].z, bx, bz) + dist(pts[pts.length - 2].x, pts[pts.length - 2].z, pts[pts.length - 1].x, pts[pts.length - 1].z) - 2) pts.pop();
    const direct = dist(ax, az, bx, bz);
    let L = 0, px = ax, pz = az;
    for (const q of pts) { L += dist(px, pz, q.x, q.z); px = q.x; pz = q.z; }
    L += dist(px, pz, bx, bz);
    if (L > direct * 2.2 + 40) return []; // obchádzka nestojí za to
    return pts;
  }
  Act.routeTo = function (x, z, hsId) {
    const p = Act.player, Mp = M();
    if (p.inCar) return;
    const pts = [];
    let A = null, B = null;
    try { A = Mp.locAt ? Mp.locAt(p.x, p.z) : null; B = Mp.locAt ? Mp.locAt(x, z) : null; } catch (e) { A = B = null; }
    let cx = p.x, cz = p.z;
    if (A && A !== B) {
      const d = bestDoor(A, cx, cz, x, z, true);
      if (d) { pts.push({ x: d.ix, z: d.iz }, { x: d.ox, z: d.oz }); cx = d.ox; cz = d.oz; }
    }
    if (B && B !== A) {
      const d = bestDoor(B, cx, cz, x, z, false);
      if (d) {
        for (const q of graphRoute(cx, cz, d.ox, d.oz)) pts.push(q);
        pts.push({ x: d.ox, z: d.oz }, { x: d.ix, z: d.iz });
      } else for (const q of graphRoute(cx, cz, x, z)) pts.push(q);
    } else if (!A || A !== B) {
      for (const q of graphRoute(cx, cz, x, z)) pts.push(q);
    }
    pts.push({ x, z });
    p.route = pts;
    p.autoUse = hsId || null;
    stuckT = 0; stuckX = p.x; stuckZ = p.z;
  };

  // ---------- auto ----------
  function carHitsAny(x, z, a) {
    const cs = carCircles(x, z, a);
    for (const c of cs) if (circleHitsCar(c.x, c.z, CAR_R)) return true;
    const others = Act.traffic.concat(Act.parked);
    if (Act.van) others.push(Act.van);
    for (const o of others) {
      if (o.active === false) continue;
      if (Math.abs(o.x - x) > 9 || Math.abs(o.z - z) > 9) continue;
      const oc = vehCircles(o);
      const rr = CAR_R + (o.van ? 1.1 : CAR_R);
      for (const c of cs) for (const d of oc) if (dist(c.x, c.z, d.x, d.z) < rr) return true;
    }
    return false;
  }

  Act.updateCar = function (dt, inp) {
    const c = Act.car, C = CFG(), Mp = M(), s = S();
    inp = inp || { x: 0, y: 0, brake: false };
    const iy = inp.y || 0, ix = inp.x || 0;
    bumpT = Math.max(0, bumpT - dt); battSayT -= dt; fuelSayT -= dt;
    const rain = s.weather === 'rain';
    const paved = Mp.isPaved ? !!Mp.isPaved(c.x, c.z) : true;
    const carMax = C.carMax || 30, carAccel = C.carAccel || 9, carBrake = C.carBrake || 18, carRev = C.carReverse || 6;
    let max = paved ? carMax : (C.carOffroad || 11);
    if (c.flat) max = Math.min(max, 14);
    const noFuel = c.fuel <= 0;
    if (noFuel) { max = Math.min(max, 2); if (Math.abs(iy) > 0.05 && fuelSayT <= 0) { fuelSayT = 4; say('Prázdna nádrž. Fabia ide už len z kopca.'); } }
    const dead = c.battery <= 0;
    c.braking = false;
    const fric = rain ? 0.55 : 1;
    if (dead) {
      if (Math.abs(iy) > 0.05 && battSayT <= 0) { battSayT = 3; say('Fabia len klikne. Baterka.'); }
      const f = 6 * dt;
      c.speed = Math.abs(c.speed) <= f ? 0 : c.speed - Math.sign(c.speed) * f;
    } else if (iy < -0.05) {
      if (c.speed < -0.3) { c.speed = Math.min(0, c.speed + carBrake * dt); c.braking = true; }
      else c.speed += carAccel * -iy * dt * (1 - Math.max(0, c.speed) / (max * 1.15));
    } else if (iy > 0.05) {
      if (c.speed > 0.3) { c.speed = Math.max(0, c.speed - carBrake * iy * dt); c.braking = true; }
      else c.speed = Math.max(-carRev, c.speed - carAccel * 0.6 * iy * dt);
    } else {
      const f = (2.2 + Math.abs(c.speed) * 0.12) * fric * dt;
      c.speed = Math.abs(c.speed) <= f ? 0 : c.speed - Math.sign(c.speed) * f;
    }
    if (inp.brake) {
      const f = carBrake * 1.1 * (rain ? 0.6 : 1) * dt;
      c.speed = Math.abs(c.speed) <= f ? 0 : c.speed - Math.sign(c.speed) * f;
      c.braking = true;
    }
    if (c.speed > max) c.speed = Math.max(max, c.speed - (c.speed - max) * Math.min(1, dt * 2.5) - 8 * dt);
    if (c.speed < -carRev) c.speed = -carRev;

    const sp = Math.abs(c.speed);
    const steerK = Math.min(1, sp / 5) * (1 - 0.4 * Math.min(1, sp / carMax));
    let turn = ix * 2.2 * steerK * Math.sign(c.speed) * (inp.brake ? 1.4 : 1) * (rain ? 1.3 : 1);
    if (c.flat && sp > 0.3) turn -= 0.22 * Math.min(1, sp / 4) * Math.sign(c.speed); // ťahá doľava
    const ox = c.x, oz = c.z, oa = c.a;
    const na = c.a + turn * dt;
    // drift: smer pohybu (moveA) zaostáva za natočením – na tráve, v daždi a pri ručnej brzde viac
    if (c.moveA == null) c.moveA = c.a;
    const grip = !paved ? 2.6 : (inp.brake && sp > 6 ? 3.0 : (rain ? 7 : 14));
    c.moveA += angDiff(c.moveA, na) * Math.min(1, dt * grip);
    if (sp < 2) c.moveA = na;
    c.drift = Math.abs(angDiff(c.moveA, na));
    const nx = c.x + Math.cos(c.moveA) * c.speed * dt;
    const nz = c.z + Math.sin(c.moveA) * c.speed * dt;
    // už zaseknuté v kolízii -> dovoľ pohyb, aby sa dalo vyjsť von
    const stuckNow = carHitsAny(ox, oz, oa);
    let moved = false;
    if (stuckNow || !carHitsAny(nx, nz, na)) { c.a = na; c.x = nx; c.z = nz; moved = true; }
    else if (!carHitsAny(nx, oz, na)) { c.a = na; c.x = nx; moved = true; c.speed *= 0.85; }
    else if (!carHitsAny(ox, nz, na)) { c.a = na; c.z = nz; moved = true; c.speed *= 0.85; }
    else if (!carHitsAny(ox, oz, na)) { c.a = na; }
    c.stuckT = stuckNow && sp < 1.3 ? (c.stuckT || 0) + dt : 0;
    if (c.stuckT > 2 && !c.stuckHint) { c.stuckHint = true; toast('🚗 Zaseknutý? Stlač R – Fabia sa postaví na cestu.', 'info'); }
    if (!stuckNow) c.stuckHint = false;
    if (moved) {
      c.x = clamp(c.x, 3, mapW() - 3);
      c.z = clamp(c.z, 3, mapH() - 3);
      const d = dist(ox, oz, c.x, c.z);
      c.fuel = Math.max(0, (c.fuel || 0) - d * (C.fuelPerM || 0.0003));
      c.wheel += (c.speed >= 0 ? d : -d) / 0.32;
    } else {
      const hard = sp > 1.8;
      c.speed *= -0.25;
      if (hard && bumpT <= 0) {
        bumpT = 2;
        if (G.Audio) G.Audio.bump();
        if (G.S) G.S.nervy = Math.min(100, (G.S.nervy || 0) + 5);
        say(['Bum! Kurnik…', 'Do riti, plech!', 'To bude Fabia pamätať.'][(Math.random() * 3) | 0]);
      }
    }
    const p = Act.player;
    p.x = c.x; p.z = c.z; p.a = c.a; p.moving = false; p.running = false;
    if (G.Audio) G.Audio.engine(!dead, c.speed * 23);
  };

  // Záchrana: postav Fabiu na najbližšie voľné spevnené miesto (klávesa R).
  Act.unstuckCar = function () {
    const c = Act.car, Mp = M();
    const angs = [c.a, 0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (let r = 0; r <= 60; r += 2) {
      const n = Math.max(1, Math.round((r * TAU) / 2.5));
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r;
        if (x < 4 || z < 4 || x > mapW() - 4 || z > mapH() - 4) continue;
        if (Mp.isPaved && !Mp.isPaved(x, z)) continue;
        for (const a of angs) {
          if (!carHitsAny(x, z, a)) {
            c.x = x; c.z = z; c.a = a; c.speed = 0; c.stuckT = 0; c.stuckHint = false;
            if (Act.player.inCar) { Act.player.x = x; Act.player.z = z; Act.player.a = a; }
            return true;
          }
        }
      }
    }
    return false;
  };

  Act.enterCar = function () {
    const p = Act.player, k = Act.kid, d = Act.dog, c = Act.car;
    p.inCar = true;
    p.route = null; p.autoUse = null;
    p.moving = false; p.running = false;
    const near = (o) => dist(o.x, o.z, c.x, c.z) < 6 || dist(o.x, o.z, p.x, p.z) < 6;
    if (k.state === 'follow' || k.state === 'sick') {
      if (near(k)) { k.prev = k.state; k.state = 'car'; }
      else { k.prev = k.state; k.state = 'lost'; k.lostWarned = false; }
    }
    if (d.state === 'follow') {
      if (near(d)) d.state = 'car';
      else { d.state = 'lost'; d.lostWarned = false; d.distract = null; }
    }
    p.x = c.x; p.z = c.z; p.a = c.a;
    return true;
  };

  Act.exitCar = function () {
    const p = Act.player, c = Act.car, k = Act.kid, d = Act.dog;
    if (!p.inCar) return false;
    if (Math.abs(c.speed) >= 3) { say('Najprv zastav.'); return false; }
    c.speed = 0; c.braking = false;
    const lx = Math.sin(c.a), lz = -Math.cos(c.a); // vľavo od smeru jazdy
    let r = resolveWalk(c.x + lx * 1.8, c.z + lz * 1.8, P_R);
    p.x = clamp(r.x, 1, mapW() - 1); p.z = clamp(r.z, 1, mapH() - 1);
    p.a = c.a; p.inCar = false; p.route = null; p.autoUse = null;
    trail = [];
    if (k.state === 'car') {
      r = resolveWalk(c.x - lx * 1.8, c.z - lz * 1.8, 0.3);
      k.x = r.x; k.z = r.z; k.a = c.a;
      k.state = k.prev === 'sick' ? 'sick' : 'follow';
      k.lostWarned = false;
    }
    if (d.state === 'car') {
      r = resolveWalk(c.x - lx * 1.8 - Math.cos(c.a) * 1.2, c.z - lz * 1.8 - Math.sin(c.a) * 1.2, 0.3);
      d.x = r.x; d.z = r.z; d.a = c.a;
      d.state = 'follow'; d.lostWarned = false; d.nextDistract = rnd(8, 20);
    }
    if (G.Audio) G.Audio.engine(false, 0);
    return true;
  };

  // ---------- dieťa ----------
  function teleBehind(o, dmax, back) {
    const p = Act.player;
    if (dist(o.x, o.z, p.x, p.z) > dmax) {
      o.x = p.x - Math.cos(p.a) * back; o.z = p.z - Math.sin(p.a) * back;
    }
  }
  Act.kidFollow = function () {
    const k = Act.kid;
    k.state = 'follow';
    k.lostWarned = false;
    trail = [];
    teleBehind(k, 25, 1.3);
  };
  Act.kidSet = function (state) {
    const k = Act.kid;
    k.lostWarned = false;
    if (state === 'skolka') { const a = anchors.kidSkolka; k.x = a.x + 1.5; k.z = a.z + 1; kidW.tx = k.x; kidW.tz = k.z; kidW.wait = 1; k.state = state; }
    else if (state === 'home') { const a = anchors.kidHome; k.x = a.x; k.z = a.z; kidW.tx = k.x; kidW.tz = k.z; kidW.wait = 1; k.state = state; }
    else if (state === 'car') { k.x = Act.car.x; k.z = Act.car.z; k.state = state; }
    else if (state === 'follow') Act.kidFollow();
    else if (state === 'sick') { Act.kidFollow(); k.state = 'sick'; k.prev = 'sick'; k.whineT = rnd(8, 18); }
    else if (state === 'away') { k.x = -50; k.z = -50; k.state = 'away'; k.moving = false; }
    else k.state = state;
  };

  function wanderStep(o, box, sp, dt, w, r) {
    if (w.wait > 0) {
      w.wait -= dt;
      o.moving = false;
      if (w.wait <= 0) {
        w.tx = box.x0 + Math.random() * (box.x1 - box.x0);
        w.tz = box.z0 + Math.random() * (box.z1 - box.z0);
      }
      return;
    }
    const d = dist(o.x, o.z, w.tx, w.tz);
    if (d < 0.2) { w.wait = 1 + Math.random() * 3; o.moving = false; return; }
    const step = Math.min(d, sp * dt);
    const ux = (w.tx - o.x) / d, uz = (w.tz - o.z) / d;
    const res = resolveWalk(o.x + ux * step, o.z + uz * step, r);
    const moved = dist(o.x, o.z, res.x, res.z);
    if (moved < step * 0.3) { w.wait = 0.5 + Math.random(); o.moving = false; return; }
    o.x = res.x; o.z = res.z;
    o.a += angDiff(o.a, Math.atan2(uz, ux)) * Math.min(1, dt * 8);
    o.phase += moved * 5;
    o.moving = true;
  }
  const boxAround = (a, r) => ({ x0: a.x - r, x1: a.x + r, z0: a.z - r, z1: a.z + r });

  function followStep(o, dt, speed, back, stopD, nearD) {
    const p = Act.player;
    let tx, tz, sd;
    if (trail.length > back) { const t = trail[trail.length - 1 - back]; tx = t.x; tz = t.z; sd = 0.15; }
    else { tx = p.x; tz = p.z; sd = stopD; }
    if (dist(o.x, o.z, p.x, p.z) > 40) { o.x = p.x - Math.cos(p.a) * stopD; o.z = p.z - Math.sin(p.a) * stopD; }
    const d = dist(o.x, o.z, tx, tz);
    const pd = dist(o.x, o.z, p.x, p.z);
    if (d > sd && pd > nearD) {
      const step = Math.min(d - sd + 0.01, speed * dt);
      const ux = (tx - o.x) / d, uz = (tz - o.z) / d;
      o.x += ux * step; o.z += uz * step;
      o.a += angDiff(o.a, Math.atan2(uz, ux)) * Math.min(1, dt * 10);
      o.phase += step * 5.2;
      o.moving = step > 0.01;
      return true;
    }
    o.a += angDiff(o.a, Math.atan2(p.z - o.z, p.x - o.x)) * Math.min(1, dt * 3);
    return false;
  }

  const WHINES = ['Tatiii, bolí ma bruško…', 'Nechcem ísť… 🤒', 'Chcem domov k Bundášovi.', 'Tati, je mi zima.', 'Tatiii, nesieš ma?'];
  function updateKid(dt) {
    const k = Act.kid, p = Act.player, c = Act.car;
    k.moving = false;
    if (k.state === 'away') return; // Nelka je u Simony
    if (k.state === 'home') {
      wanderStep(k, boxAround(anchors.kidHome, 2.5), 1.6, dt, kidW, 0.3);
    } else if (k.state === 'skolka') {
      wanderStep(k, boxAround(anchors.kidSkolka, 4), 1.8, dt, kidW, 0.3);
    } else if (k.state === 'car') {
      k.x = c.x; k.z = c.z; k.a = c.a;
    } else if (k.state === 'follow' || k.state === 'sick') {
      if (p.inCar) { k.prev = k.state; k.state = 'car'; return; }
      const sick = k.state === 'sick';
      followStep(k, dt, sick ? 7.0 : 11.0, 5, 1.4, 1.1);
      if (sick) {
        k.whineT = (k.whineT == null ? rnd(8, 18) : k.whineT) - dt;
        if (k.whineT <= 0) { k.whineT = rnd(12, 25); bubble('kid', WHINES[(Math.random() * WHINES.length) | 0]); }
      }
    } else if (k.state === 'lost') {
      k.a += angDiff(k.a, Math.atan2(p.z - k.z, p.x - k.x)) * Math.min(1, dt * 2);
      if (p.inCar && !k.lostWarned && dist(c.x, c.z, k.x, k.z) > 25) {
        k.lostWarned = true;
        toast('😱 Zabudol si ' + (CFG().kidAcc || 'Nelku') + '!', 'bad');
        fx({ nervy: 12, dad: -2 });
      }
    }
    k.amp += ((k.moving ? 0.85 : 0) - k.amp) * Math.min(1, dt * 10);
  }

  // ---------- pes ----------
  Act.dogSet = function (state) {
    const d = Act.dog;
    d.lostWarned = false; d.distract = null;
    const put = (a, r) => { d.x = a.x + (Math.random() - 0.5) * r; d.z = a.z + (Math.random() - 0.5) * r; dogW.tx = d.x; dogW.tz = d.z; dogW.wait = 1; };
    if (state === 'home') put(anchors.dogHome, 0.6);
    else if (state === 'kuchyna') put(anchors.dogKuchyna, 3);
    else if (state === 'park') put(anchors.dogPark, 6);
    else if (state === 'vet') put(anchors.dogVet, 1.5);
    else if (state === 'car') { d.x = Act.car.x; d.z = Act.car.z; }
    else if (state === 'follow') { teleBehind(d, 40, 1.2); d.nextDistract = rnd(8, 20); d.barkT = rnd(3, 10); }
    d.state = state;
  };
  function nearestDistraction(d) {
    const Mp = M();
    let best = null, bd = 12;
    const consider = (x, z, kind) => { const v = dist(d.x, d.z, x, z); if (v < bd && v > 1.5) { bd = v; best = { x, z, kind }; } };
    const trees = Array.isArray(Mp.trees) ? Mp.trees : null;
    if (trees) for (const t of trees) { if (Math.abs(t.x - d.x) < 12 && Math.abs(t.z - d.z) < 12) consider(t.x, t.z, 'tree'); }
    for (const id in Act.npcs) { const n = Act.npcs[id]; if (npcVisible(n)) consider(n.x, n.z, 'npc'); }
    for (const pd of Act.peds) if (pd.visible) consider(pd.x, pd.z, 'npc');
    return best;
  }
  function updateDog(dt) {
    const d = Act.dog, p = Act.player, c = Act.car;
    d.moving = false;
    const st = d.state;
    if (st === 'home') wanderStep(d, boxAround(anchors.dogHome, 1.2), 1.5, dt, dogW, 0.25);
    else if (st === 'kuchyna') wanderStep(d, boxAround(anchors.dogKuchyna, 3), 2.5, dt, dogW, 0.25);
    else if (st === 'park') wanderStep(d, boxAround(anchors.dogPark, 9), 4, dt, dogW, 0.25);
    else if (st === 'vet') wanderStep(d, boxAround(anchors.dogVet, 1), 1.2, dt, dogW, 0.25);
    else if (st === 'car') { d.x = c.x; d.z = c.z; d.a = c.a; }
    else if (st === 'follow') {
      if (p.inCar) { d.state = 'car'; return; }
      d.barkT -= dt;
      if (d.barkT <= 0) { d.barkT = rnd(10, 25); bubble('dog', Math.random() < 0.8 ? 'HAF!' : 'HAF HAF!'); }
      if (d.distract) {
        const t = d.distract;
        t.t -= dt;
        const dd = dist(d.x, d.z, t.x, t.z);
        if (dd > 0.9) {
          const step = Math.min(dd - 0.9, 5.5 * dt);
          const ux = (t.x - d.x) / dd, uz = (t.z - d.z) / dd;
          const res = resolveWalk(d.x + ux * step, d.z + uz * step, 0.25);
          d.x = res.x; d.z = res.z;
          d.a += angDiff(d.a, Math.atan2(uz, ux)) * Math.min(1, dt * 10);
          d.phase += step * 6; d.moving = true;
        } else {
          d.a += angDiff(d.a, Math.atan2(t.z - d.z, t.x - d.x)) * Math.min(1, dt * 6);
          if (!t.barked) { t.barked = true; if (t.kind === 'npc') bubble('dog', 'HAF!'); }
        }
        if (t.t <= 0 || dist(d.x, d.z, p.x, p.z) > 30) { d.distract = null; d.nextDistract = rnd(8, 20); }
      } else {
        d.nextDistract -= dt;
        if (d.nextDistract <= 0) {
          const t = nearestDistraction(d);
          if (t) { t.t = rnd(2, 6); d.distract = t; }
          else d.nextDistract = rnd(4, 10);
        }
        followStep(d, dt, 12.0, 3, 1.2, 0.9);
        // bokom, nie priamo za pätami
        if (!d.moving) d.a += angDiff(d.a, p.a) * Math.min(1, dt * 2);
      }
    } else if (st === 'lost') {
      d.a += angDiff(d.a, Math.atan2(p.z - d.z, p.x - d.x)) * Math.min(1, dt * 2);
      if (p.inCar && !d.lostWarned && dist(c.x, c.z, d.x, d.z) > 25) {
        d.lostWarned = true;
        toast('🐕 ' + (CFG().dog || 'Bundáš') + ' ostal vonku!', 'bad');
        fx({ nervy: 8 });
      }
    }
    d.amp += ((d.moving ? 0.9 : 0) - d.amp) * Math.min(1, dt * 10);
  }

  // ---------- NPC update ----------
  function npcVisible(n) {
    if (!n.visible) return false;
    if (n.cust !== undefined) return lunch() || (n.cust < 2);
    return true;
  }
  function updateNpcs(dt) {
    void dt;
    for (const id in Act.npcs) {
      const n = Act.npcs[id];
      const t = clock * 0.6 + n.seed;
      n.a = n.ba + Math.sin(t) * 0.22 + Math.sin(t * 0.37) * 0.15;
      n.x = n.bx + (n.sit ? 0 : Math.sin(t * 0.8) * 0.04);
      n.z = n.bz;
      n.amp = 0;
    }
  }

  Act.update = function (dt) {
    clock += dt;
    updateKid(dt);
    updateDog(dt);
    updateNpcs(dt);
    updatePeds(dt);
    updateTraffic(dt);
  };

  // ---------- 2D renderer (G.R2) kreslí stav priamo; 3D meshe už nie sú ----------
  Act.init = function () { return true; };
  Act.sync = function () { /* no-op: G.R2.drawActors číta stav priamo */ };
  Act.npcVisible = npcVisible;
  Act.lunch = lunch;
  Act.FABIA = FABIA;

  // pre UI / debug
  Act.trail = () => trail;
  Act.isNight = isNight;
  Act.randLook = randLook;
  return Act;
})();
