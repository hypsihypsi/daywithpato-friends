// Riaditeľ dňa (G.Ev, alias G.Q): typ dňa, náhodný plán udalostí, varianty, reťazenie,
// stav G.S, zásobník questov, zabúdanie, deadliny, akcie hotspotov.
// Zmeny: CFG.sessionMode ('random' | rano | dopoludnie | obed | popoludnie | vecer | noc | 'full') → jedna hra = jedna časť dňa (Ev.SEGMENTS).
// Zásobník: S.stack[0] je najnovší = aktívny (hore). Pozície v metroch (x, z).
(() => {
  const G = window.G = window.G || {};
  const CFG = G.CFG;
  const KID = CFG.kid, KIDACC = CFG.kidAcc, KIDDAT = CFG.kidDat, KIDGEN = CFG.kidGen, KIDINS = CFG.kidIns;
  const DOG = CFG.dog, DOGACC = CFG.dogGen, DOGDAT = CFG.dogDat, DOGINS = CFG.dogIns;
  const OUTLETS = (G.NAMES && G.NAMES.outlets) || [];

  // ---------- seedovaný generátor ----------
  function mulberry(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let RNG = mulberry(1);
  const rand = () => RNG();
  const rr = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => (a && b) ? Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)) : 1e9;
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const val = (v, q) => (typeof v === 'function' ? v(q, G.S) : v);

  function ui(name, ...args) {
    try { if (G.UI && typeof G.UI[name] === 'function') return G.UI[name](...args); } catch (e) { console.warn('UI.' + name, e); }
  }
  function snd(name, ...args) { try { if (G.Audio && typeof G.Audio[name] === 'function') G.Audio[name](...args); } catch (e) { /* nič */ } }
  const say = (t, d) => { if (t) ui('say', t, d); };
  const toast = (t, k) => ui('toast', t, k || 'info');
  const A = () => G.Act || null;
  const M = () => G.Map || null;
  const player = () => { const a = A(); return a && a.player; };
  const car = () => { const a = A(); return a && a.car; };
  const kid = () => { const a = A(); return a && a.kid; };
  const dog = () => { const a = A(); return a && a.dog; };
  const kidSet = (st) => { const a = A(); try { if (a && a.kidSet) a.kidSet(st); } catch (e) { /* nič */ } };
  const dogSet = (st) => { const a = A(); try { if (a && a.dogSet) a.dogSet(st); } catch (e) { /* nič */ } };
  const kidFollow = () => { const a = A(); try { if (a && a.kidFollow) a.kidFollow(); else kidSet('follow'); } catch (e) { /* nič */ } };
  const setNpc = (id, o) => { const a = A(); try { if (a && a.setNpc) a.setNpc(id, o); } catch (e) { /* nič */ } };
  const kidWithMe = () => { const k = kid(), p = player(); return !!(k && (k.state === 'car' || (k.state === 'follow' && dist(k, p) < 30) || k.state === 'sick')); };
  const dogWithMe = () => { const d = dog(), p = player(); return !!(d && (d.state === 'car' || (d.state === 'follow' && dist(d, p) < 40))); };
  const inCar = () => { const p = player(); return !!(p && p.inCar); };
  // striedavá starostlivosť: položky, ktoré potrebujú Nelku fyzicky (rodina timea/vylet bez awayOk) – na dni u Simony sa neplánujú
  const needsKid = (def) => !!(def && (def.fam === 'timea' || def.fam === 'vylet') && !def.awayOk);
  const kidToday = () => !!(G.S && G.S.kidWithMe);
  const outletName = (i) => OUTLETS[i] || ('Výdajňa ' + i);

  const ITEM = {
    kluce: 'kľúče', zajacik: 'zajačik', faktura: 'faktúra', zelenina: 'zelenina', jedlo: 'boxy s jedlom',
    hasiak: 'hasiaci prístroj', technicak: 'techničák', rezerva: 'rezerva', kabel: 'štartovacie káble',
    kostym: 'kostým', oblecenie: 'náhradné oblečenie', flasa: 'fľaša', papuce: 'papuče', kresba: 'kresba',
    desiata: 'desiata', prsiplast: 'pršiplášť', podpis: 'podpísaný papier', obojok: 'obojok',
    klucenove: 'nové kľúče', liek: 'liek', blocky: 'bločky', obaly: 'obaly', nahrada: 'náhradné jedlo',
    sirup: 'sirup', kluce_timea: `kľúč ${KIDGEN}`, mlieko: 'mlieko', pivo: 'pivo pre Honzu', veci_timey: `veci ${KIDGEN}`,
  };

  function hm(min) {
    let m = Math.floor(min);
    m = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  const eur = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €';

  function log(text) {
    const S = G.S;
    if (!S || !text) return;
    S.timeline.push({ t: S.time, text });
  }

  // ---------- efekty ----------
  function fx(o) {
    const S = G.S;
    if (!S || !o) return;
    const shown = {};
    for (const k of ['money', 'rep', 'dad', 'nervy', 'focus', 'energy', 'time']) {
      const v = o[k];
      if (!v) continue;
      shown[k] = v;
      if (k === 'time') S.time += v;
      else S[k] += v;
    }
    S.money = Math.round(S.money * 100) / 100;
    S.rep = clamp(S.rep, 0, 100);
    S.energy = clamp(S.energy, 0, 100);
    S.nervy = clamp(S.nervy, 0, 100);
    S.focus = clamp(S.focus, 0, 100);
    S.dad = Math.max(0, S.dad);
    if (Object.keys(shown).length) ui('fx', shown);
  }

  // ---------- stav ----------
  function load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(CFG.saveKey)) || {}; } catch (e) { d = {}; }
    return {
      day: d.day || 1,
      money: typeof d.money === 'number' ? d.money : 420,
      rep: typeof d.rep === 'number' ? d.rep : 50,
      dad: typeof d.dad === 'number' ? d.dad : 10,
      fuel: typeof d.fuel === 'number' ? d.fuel : CFG.tankL * 0.6,
      kidWithMe: typeof d.kidWithMe === 'boolean' ? d.kidWithMe : null, // včerajšok (striedavá starostlivosť)
      lastSegment: typeof d.lastSegment === 'string' ? d.lastSegment : null, // posledná odohraná zmena (random ju nezopakuje)
    };
  }
  function save(o) { try { localStorage.setItem(CFG.saveKey, JSON.stringify(o)); } catch (e) { /* nič */ } }

  function fresh(sv) {
    return {
      day: sv.day, time: CFG.dayStart, money: sv.money, rep: sv.rep, dad: sv.dad,
      energy: 85, nervy: 15, focus: 70,
      items: new Set(), stack: [], done: [], forgotten: [], failed: [],
      doneIds: new Set(), triggered: new Set(), flags: {},
      notes: CFG.notes, coffees: 0, cool: {}, hyper: 0, compl: [],
      intT: rr(60, 120), disT: rr(25, 60), hideArrow: 0, hideCarArrow: 0, bubble: null, pending: [], dayPlan: [], famFired: {},
      ended: false, start: { money: sv.money, rep: sv.rep, dad: sv.dad }, rt: 0,
      dayType: 'normal', dayTypeName: '?', dayTypeRevealed: false, weather: 'clear',
      deliveries: [], delivered: new Set(), dogWith: false, cardBlocked: false, powerOut: false, gasOut: false,
      bistroClosed: false, roadBlock: null, chain: {}, timeline: [], fired: 0, famCount: {}, tankCount: 0,
      lunchInterrupts: 0, lunchInterruptIds: [], lunchAt: 12 * 60, keyAt: null, hourPushed: {}, hourTry: {}, extraFired: 0, fillers: 0,
      // v3: vyrušenia + tempo + metriky
      freeze: 0, callDriving: 0, intrude: {}, intrudeCount: { call: 0, popup: 0, grab: 0, sms: 0, none: 0 },
      stackInt: 0, stackT: 0, tdSum: 0, tdN: 0,
      // striedavá starostlivosť
      kidWithMe: true, kidWhere: 'paťo', prevKidWithMe: null,
      // zmeny (segmenty dňa): null = celý deň
      segment: null, segmentName: null, dayStart: CFG.dayStart, dayEnd: CFG.dayEnd, leftover: [],
    };
  }

  // ---------- zmeny (segmenty dňa) ----------
  // celý deň (~19 reálnych minút) je pridlhý – jedna hra = jedna zmena ≈ 3¼ hodiny; 'full' = celý deň ako doteraz
  const SEGMENTS = {
    rano: [6 * 60 + 30, 9 * 60 + 45, 'Ráno'], dopoludnie: [9 * 60 + 30, 12 * 60 + 15, 'Dopoludnie'], obed: [11 * 60 + 30, 14 * 60 + 15, 'Obed'],
    popoludnie: [14 * 60, 17 * 60 + 15, 'Popoludnie'], vecer: [17 * 60 + 30, 20 * 60 + 45, 'Večer'], noc: [20 * 60 + 30, 23 * 60 + 45, 'Noc'],
  };
  const SEG_IDS = Object.keys(SEGMENTS);
  const segOf = (id) => (id && SEGMENTS[id] ? { id, start: SEGMENTS[id][0], end: SEGMENTS[id][1], name: SEGMENTS[id][2] } : null);
  // 'random' = rovnomerne, ale nikdy tá istá zmena ako naposledy; 'full' = null
  function pickSegment(mode, lastSegment, rng) {
    if (mode === 'full') return null;
    if (SEGMENTS[mode]) return segOf(mode);
    const ids = SEG_IDS.filter(id => id !== lastSegment);
    return segOf(ids[Math.floor((rng || Math.random)() * ids.length)]);
  }
  // typy dňa, ktoré majú zmysel len v niektorých zmenách (null = všade)
  const DAYTYPE_SEGS = {
    normal: null, timea_chora: null, dazd: null,
    vyplata: ['rano', 'dopoludnie', 'obed', 'popoludnie'], kontrola: ['dopoludnie', 'obed', 'popoludnie'],
    babka_navsteva: ['rano'], zaspal: ['rano'], futbal: ['vecer'], vylet: ['rano'], nove_zamky: ['rano', 'dopoludnie'],
  };
  const SEG_RANDOM = [5, 7];   // náhodných položiek na zmenu
  const SEG_PLAN_CAP = 10;     // základ + vynútené + náhodné v pláne jednej zmeny
  const SEG_BUDGET = 11;       // rozpočet pushov na zmenu (výplne + hodinová garancia), reťazenie môže pridať 1–2
  const segIntersects = (def, seg) => !seg || !def || !def.win || (def.win[0] * 60 < seg.end - 10 && def.win[1] * 60 > seg.start + 5);

  // ---------- zásobník ----------
  const DEF = {};   // všetky definície podľa id (základ + POOL)
  const POOL = [];  // náhodné udalosti
  const active = () => (G.S && G.S.stack[0]) || null;
  const stepOf = (q) => (q && q.def.steps[q.step]) || null;

  function mkDef(id, vi) {
    const base = DEF[id];
    if (!base) return null;
    let v = null;
    if (base.variants && base.variants.length) {
      if (vi == null || vi < 0 || vi >= base.variants.length) vi = Math.floor(rand() * base.variants.length);
      v = base.variants[vi];
    }
    const d = Object.assign({ id }, base, v || {});
    delete d.variants;
    d.variant = v ? vi : 0;
    d.steps = d.steps || [];
    return d;
  }

  function remove(q) {
    const S = G.S, i = S.stack.indexOf(q);
    if (i >= 0) S.stack.splice(i, 1);
  }
  function end(q) {
    const S = G.S;
    try { if (q.def.onEnd) q.def.onEnd(q, S); } catch (e) { console.warn('onEnd', q.id, e); }
    if (q.def.fam && S.famCount[q.def.fam] > 0) S.famCount[q.def.fam]--;
  }

  function push(id, opts) {
    const S = G.S;
    opts = opts || {};
    if (!S || !DEF[id]) return null;
    const ex = S.stack.find(q => q.id === id);
    if (ex) return ex;
    const def = mkDef(id, opts.variant);
    if (S.doneIds.has(id) && !def.repeatable && !opts.force) return null;
    if (def.cond && !opts.force) { try { if (!def.cond(S)) return null; } catch (e) { return null; } }
    const q = { id, def, step: 0, idle: 0, pinned: false, late: false, deadline: null, data: {}, fam: def.fam || 'base' };
    if (def.deadline != null) q.deadline = val(def.deadline, q);
    else if (def.deadlineRel != null) q.deadline = S.time + val(def.deadlineRel, q);
    // v3: veľkorysejšie deadliny – kde ostáva < 60 min, +15 min
    if (q.deadline != null && q.deadline - S.time < 60) q.deadline += 15;
    if (S.stack.length) fx({ focus: -8 });
    S.stack.unshift(q);
    S.famCount[q.fam] = (S.famCount[q.fam] || 0) + 1;
    S.fired++;
    S.hourPushed[Math.floor(S.time / 60)] = true;
    if (opts.tag) q.tag = opts.tag;
    try { if (def.onStart) def.onStart(q, S); } catch (e) { console.warn('onStart', id, e); }
    const st = stepOf(q);
    const title = val(def.title, q);
    const ntf = val(def.notify, q) || (st && st.label) || '';
    log(`${def.icon || '•'} ${title}${ntf ? ' – ' + ntf : ''}`);
    snd('vibrate');
    reveal(id);
    if (!def.steps.length) { ui('notify', def.icon, title, ntf); finish(q); return q; }
    if (st && st.auto) { ui('notify', def.icon, title, ntf); q.intrude = 'none'; runStep(q, st, arr(val(st.at, q))[0] || 'auto'); return q; }
    intrude(q, st, title, ntf);
    return q;
  }

  // ---------- vyrušenia (CONTRACT3 §3) ----------
  // kvóty pre náhodné priradenie; jadro dňa má grab pevne (raňajky, venčenie, uspávanie), preto je tu grab nižší – výsledný mix ≈ 30/20/10/20/20
  const INTRUDE_MIX = [['call', 0.30], ['popup', 0.30], ['grab', 0.0], ['sms', 0.20], ['none', 0.20]];
  const NPC_ID = { Boris: 'joff', Hanka: 'miska', Ondro: 'simon', Dana: 'tamara', Lenka: 'lucia', Wayan: 'agus', Tunde: 'ayo', Santi: 'fredy', Honza: 'benji', Peter: 'lukas', Tomáš: 'matus', Babka: 'babka', Katka: 'nina' };
  const KNOWN_CALLERS = ['Boris', 'Hanka', 'Ondro', 'Dana', 'Lenka', 'Wayan', 'Tunde', 'Santi', 'Honza', 'Peter', 'Tomáš', 'Babka', 'Katka', 'Simona', 'Gabika', 'Dodo', 'Učiteľka', 'Škôlka', 'Ex', 'Majiteľ', 'Sused', 'Zámočník', 'Zubárka', 'Holič', 'Šofér', 'Dodávateľ', 'Banka', 'Mama'];
  const FAM_CALLER = { bistro: 'Dana', timea: () => G.NAMES.teacher || 'pani učiteľka', kokes: 'Peter', ex: () => G.NAMES.exName || 'Ex', nina: 'Katka', papiere: 'Gabika', vylet: () => G.NAMES.teacher || 'pani učiteľka', auto: 'Fero (servis)', base: 'Wayan', adhd: 'Dodo' };
  const SUB_OF = { Boris: 'šéf', Hanka: 'šéfka', Ondro: 'majiteľ', Dana: 'bistro', Lenka: 'bistro', Wayan: 'kuchyňa', Tunde: 'kuchyňa', Santi: 'kuchyňa', Honza: 'kuchyňa', Peter: 'rozvoz', Tomáš: 'rozvoz', Babka: 'mama', Katka: '…kamarátka', Gabika: 'účtovníčka', Dodo: 'kamoš', Majiteľ: 'prenajímateľ', Sused: 'sused', Zámočník: 'zámočník', Zubárka: 'zubárka', Holič: 'holič', Šofér: 'dodávka', Dodávateľ: 'dodávateľ', Banka: 'banka', 'Fero (servis)': 'servis', Výdajňa: 'výdajňa' };
  const isEx = (name) => name === (G.NAMES.exName || 'Ex') || name === 'Ex';
  const isBoss = (name) => ['Boris', 'Hanka', 'Ondro'].includes(name);
  const subOf = (name) => isEx(name) ? 'ex' : name === (G.NAMES.teacher || 'pani učiteľka') ? 'škôlka' : (SUB_OF[name] || '');

  // kto volá / píše: def.caller → `who` z telefónneho kroku → meno na začiatku notify („Wayan: …“) → podľa rodiny
  function callerFor(q, chBase) {
    const def = q.def;
    if (def.caller) return val(def.caller, q);
    if (chBase && chBase.who) return val(chBase.who, q);
    const ntf = String(val(def.notify, q) || '');
    const m = ntf.match(/^([A-ZÁ-Ž][^\s:„(]{1,14})(?:\s+[a-zá-ž]+)?(?:\s*\([^)]*\))?\s*(?:\(\d+:\d+\))?\s*:/);
    if (m && KNOWN_CALLERS.includes(m[1])) {
      const n = m[1];
      if (n === 'Ex') return G.NAMES.exName || 'Ex';
      if (n === 'Učiteľka' || n === 'Škôlka') return G.NAMES.teacher || 'pani učiteľka';
      if (n === 'Mama') return 'Babka';
      return n;
    }
    if (/^Výdaj|^[^:]{0,24}:\s*„Jedlo|^Nám\. |^Jégého|^Trenč|^Tobruck|^MILLHAUS|^Herlian|^Lenard|^Digital|^Poľná|^Továren/.test(ntf)) return 'Výdajňa';
    const f = FAM_CALLER[def.fam] || FAM_CALLER.base;
    return typeof f === 'function' ? f() : f;
  }
  function phoneStepOf(q, st) {
    if (!st || st.type !== 'choice' || st.auto) return null;
    const ats = arr(val(st.at, q));
    return ats.includes('phone') ? st : null;
  }
  // režim vyrušenia: explicitne v definícii (aj variant), inak denné náhodné priradenie
  function intrudeMode(q, st) {
    const S = G.S, def = q.def;
    let m = def.intrude != null ? val(def.intrude, q) : S.intrude[def.id];
    if (!m) m = 'none';
    if (m === 'call' && !(G.UI && G.UI.ring)) m = 'none';
    if (m === 'popup' && !(G.UI && (G.UI.choice || G.UI.phoneCall))) m = 'none';
    if (m === 'grab' && !(G.UI && G.UI.grab)) m = 'none';
    if (m === 'sms' && !(G.UI && G.UI.sms)) m = 'none';
    return m;
  }
  // denné deterministické priradenie režimu položkám bez explicitného `intrude` (mix 30/20/10/20/20)
  function assignIntrudes(rng) {
    const saved = RNG; RNG = rng;
    try {
      const ids = shuffle(Object.keys(DEF).filter(id => DEF[id].intrude == null));
      const out = {};
      let k = 0;
      const n = ids.length;
      let acc = 0;
      for (const [mode, p] of INTRUDE_MIX) {
        acc += p;
        const upto = mode === 'none' ? n : Math.round(acc * n);
        for (; k < upto && k < n; k++) out[ids[k]] = mode;
      }
      return out;
    } finally { RNG = saved; }
  }
  const GRAB_TEXT = {
    dog: () => pick([`${DOG} ti sadol na nohu. Nepustí.`, `${DOG} sa ti oprel o kolená. Celou váhou.`]),
    kid: () => pick([`${KID} ťa ťahá za ruku: „Tatiii! Poď!“`, `${KID} sa ti zavesila na nohu. „Tati. TATI.“`]),
    agus: () => 'Wayan ťa chytil za rameno: „Šéfe. Teraz.“',
    tamara: () => 'Dana stojí pred tebou. Ruky v bok.',
    lucia: () => 'Lenka ťa chytila za rukáv: „Šéfe, počkaj!“',
    joff: () => 'Boris ti položil ruku na plece. Ťažko.',
    benji: () => 'Honza: „Hele šéfe, moment.“ Drží ťa za lakeť.',
    ayo: () => 'Tunde ti zastúpil cestu: „Boss. One minute.“',
    fredy: () => 'Santi: „Jefe, momentito!“ Nepustí ťa.',
    lukas: () => 'Peter ťa chytil za rameno pri rampe.',
    babka: () => 'Babka ťa drží za ruku: „Paťko, počkaj.“',
    ex: () => 'Simona ti stojí v ceste. Ruky prekrížené.',
    nina: () => 'Katka ťa objala zozadu: „Hej.“',
  };
  function grabWho(q, caller) {
    const def = q.def;
    if (def.grabWho) return val(def.grabWho, q);
    if (def.fam === 'kokes') return 'dog';
    if (def.fam === 'timea') return 'kid';
    if (isEx(caller)) return 'ex';
    if (NPC_ID[caller]) return NPC_ID[caller];
    if (kidWithMe()) return 'kid';
    if (dogWithMe()) return 'dog';
    return 'tamara';
  }
  function intrude(q, st, title, ntf) {
    const S = G.S, def = q.def;
    const mode = intrudeMode(q, st);
    q.intrude = mode;
    S.intrudeCount[mode] = (S.intrudeCount[mode] || 0) + 1;
    const phoneStep = phoneStepOf(q, st);
    const chBase = phoneStep ? (typeof phoneStep.choice === 'string' ? CH[phoneStep.choice] : phoneStep.choice) : null;
    const caller = callerFor(q, chBase);
    if (mode === 'call') {
      ui('notify', def.icon, title, `📞 Volá ${caller}.`);
      intrudeCall(q, st, phoneStep, chBase, caller, ntf);
    } else if (mode === 'popup') {
      ui('notify', def.icon, title, ntf);
      intrudePopup(q, st, caller, ntf);
    } else if (mode === 'grab') {
      const who = grabWho(q, caller);
      const text = def.grabText ? val(def.grabText, q) : (GRAB_TEXT[who] ? GRAB_TEXT[who]() : `${caller} ťa chytil za rameno.`);
      const dur = rr(1.5, 2.5);
      S.freeze = Math.max(S.freeze || 0, dur);
      ui('grab', who, text, dur, () => { /* notify už beží */ });
      ui('notify', def.icon, title, ntf);
    } else if (mode === 'sms') {
      ui('sms', caller, ntf, (res) => { if (!(res && res.dismissed)) fx({ focus: -5 }); });
    } else {
      ui('notify', def.icon, title, ntf);
    }
  }
  function declineFxFor(caller) {
    const f = { nervy: 6 };
    if (isEx(caller)) f.dad = -1;
    else if (isBoss(caller)) f.rep = -2;
    return f;
  }
  function declineSayFor(caller) {
    if (isEx(caller)) return 'Odmietol si ex. O tri minúty píše 14 správ.';
    if (isBoss(caller)) return `Odmietol si ${caller}a. „Nedvíhaš? Zaujímavé.“`;
    return `Odmietol si. ${caller} zavolá znova. Určite.`;
  }
  function intrudeCall(q, st, phoneStep, chBase, caller, ntf) {
    const S = G.S, def = q.def;
    const generic = !chBase;
    const ch = generic
      ? { q: ntf || `${caller} volá.`, opts: [
          { t: 'Jasné, idem na to', say: '„Jasné, idem na to.“ Čo iné by si povedal.' },
          { t: 'Teraz nemôžem', fx: { nervy: 4 }, say: `„Teraz nemôžem.“ ${caller}: „Tak kedy?“ Dobrá otázka.` },
          { t: 'Zložiť', hang: true },
        ] }
      : Object.assign({}, chBase, { q: val(chBase.q, q), opts: chBase.opts.map(o => Object.assign({}, o, { t: val(o.t, q) })) });
    ch.caller = caller; ch.sub = subOf(caller); ch.icon = ch.icon || def.icon;
    ch.declineFx = ch.declineFx || declineFxFor(caller);
    ch.declineSay = ch.declineSay || declineSayFor(caller);
    if (!ch.hangFx) ch.hangFx = ch.declineFx;
    if (!ch.hangSay) ch.hangSay = ch.declineSay;
    const stepCb = phoneStep ? choiceCb(q, phoneStep, ch) : null;
    const decline = () => { fx(ch.declineFx); say(ch.declineSay); log(`📵 Odmietnutý hovor: ${caller}`); };
    const pickedUp = () => {
      if (q.data.pickedUp) return;
      q.data.pickedUp = true;
      const p = player(), c = car();
      if (p && p.inCar && c && Math.abs(c.speed || 0) > 3) {
        S.callDriving = 2;
        fx({ focus: -8 });
        say('Telefón za volantom. Fabia ide dve sekundy sama.');
        log('📞🚗 Telefonovanie za volantom');
      }
    };
    ui('ring', ch, (res) => {
      if (!S.stack.includes(q)) return;
      if (!res || !res.answered) { if (!res || !res.hangup) decline(); else if (stepCb) stepCb(null); else decline(); return; }
      pickedUp();
      if (res.hangup || (res.opt && res.opt.hangup)) { if (stepCb) stepCb(null); else decline(); return; }
      if (!res.opt) return; // zdvihnuté – UI otvára phoneCall a zavolá znova s opt
      if (stepCb) { bringTop(q); stepCb(res.opt); return; }
      if (res.opt.hang) { decline(); return; }
      const r = applyOpt(q, res.opt);
      if (r.say) say(val(r.say, q));
    });
  }
  function intrudePopup(q, st, caller, ntf) {
    const S = G.S;
    if (st && st.type === 'choice') { runStep(q, st, arr(val(st.at, q))[0] || 'popup'); return; }
    const chq = { q: ntf, who: caller, icon: q.def.icon, opts: [
      { t: 'Jasné, idem na to' },
      { t: 'Hneď… len dokončím toto', fx: { nervy: 3, focus: -3 }, say: 'Nedokončíš. Nikdy nedokončíš.' },
    ] };
    ui('choice', chq, (opt) => {
      if (!S.stack.includes(q) || !opt) return;
      const r = applyOpt(q, opt);
      if (r.say) say(val(r.say, q));
    });
  }

  function bringTop(q) {
    const S = G.S;
    if (!S) return;
    const i = S.stack.indexOf(q);
    if (i < 0) return;
    q.idle = 0;
    if (i === 0) return;
    S.stack.splice(i, 1);
    S.stack.unshift(q);
    fx({ focus: -3 });
    snd('click');
  }

  function cycle() {
    const S = G.S;
    if (!S || S.stack.length < 2) return;
    const q = S.stack.shift();
    S.stack.push(q);
    S.stack[0].idle = 0;
    fx({ focus: -2 });
    snd('click');
  }

  function pin() {
    const S = G.S, q = active();
    if (!S) return;
    if (!q) return say('Nie je čo zapísať. Podozrivé.');
    if (q.pinned) return say('To už visí na papieriku.');
    if (S.notes <= 0) return toast('📝 Došli papieriky. Zapamätaj si to. (nezapamätáš)', 'bad');
    q.pinned = true; S.notes--;
    toast(`📌 Papierik: ${val(q.def.title, q)}`, 'info');
    snd('click');
  }

  function chainAfter(q, why) {
    const S = G.S, ch = q.def.chain;
    if (!ch) return;
    for (const c of arr(ch)) {
      if (c.on && c.on !== why) continue;
      if (budgetLeft() < 0) return; // denný rozpočet pushov vyčerpaný – reťazenie dnes už nie
      if (rand() < (c.p == null ? 0.5 : c.p)) {
        S.pending.push({ t: c.delay || 15, id: c.id, from: q.id });
        S.chain[c.id] = q.id;
      }
    }
  }

  function finish(q) {
    const S = G.S, def = q.def;
    q.finished = true;
    const r = Object.assign({}, val(def.reward, q) || {});
    r.focus = (r.focus || 0) + 6;
    fx(r);
    remove(q);
    // metrika: vzdialenosť od hráča (pri dokončení) k cieľu ďalšieho aktívneho questu
    try {
      const nq = active(), p = player();
      if (nq && p) {
        const ds = targets(nq).map(hsPos).filter(Boolean).map(t => dist(p, t)).filter(d => d < 1e8);
        if (ds.length) { S.tdSum += Math.min(...ds); S.tdN++; }
      }
    } catch (e) { /* nič */ }
    const title = val(def.title, q);
    S.done.push(title);
    S.doneIds.add(q.id);
    snd('done');
    toast('✅ ' + title + (q.late ? ' (neskoro, ale predsa)' : ''), 'good');
    log('✅ ' + title);
    end(q);
    chainAfter(q, 'done');
    S.compl.push(S.rt);
    S.compl = S.compl.filter(t => S.rt - t <= 120);
    if (S.compl.length >= 3 && S.hyper <= 0) {
      S.hyper = 20; S.compl = [];
      toast('⚡ HYPERFOKUS! Všetko ide samo.', 'good');
      log('⚡ Hyperfokus');
    }
  }

  function completeStep(q) {
    const S = G.S;
    if (!S || !S.stack.includes(q)) return;
    const st = stepOf(q);
    if (!st) return;
    if (st.fx) fx(val(st.fx, q));
    if (st.give) for (const it of arr(st.give)) S.items.add(it);
    if (st.take) for (const it of arr(st.take)) S.items.delete(it);
    const s = val(st.say, q);
    if (s) say(s);
    try { if (st.onDone) st.onDone(q, S); } catch (e) { console.warn('onDone', q.id, e); }
    q.step++; q.idle = 0;
    if (q.step >= q.def.steps.length) finish(q);
    else {
      snd('ding');
      const nx = stepOf(q);
      if (nx && nx.auto) runStep(q, nx, arr(val(nx.at, q))[0] || 'auto');
    }
  }

  function forget(q) {
    const S = G.S, def = q.def;
    remove(q);
    const title = val(def.title, q);
    S.forgotten.push(title);
    fx(val(def.forgetFx, q));
    const fs = val(def.forgetSay, q);
    toast('🫥 Zabudol si: ' + title + (fs ? ' ' + fs : ''), 'bad');
    log('🫥 Zabudnuté: ' + title + (fs ? ' – ' + fs : ''));
    snd('fail');
    end(q);
    chainAfter(q, 'forget');
  }

  function failDeadline(q) {
    const S = G.S, def = q.def;
    q.late = true;
    fx(val(def.failFx, q));
    const fs = val(def.failSay, q);
    toast('⏰ ' + (fs || ('Nestihol si: ' + val(def.title, q))), 'bad');
    S.failed.push(val(def.title, q));
    log('⏰ Nestihnuté: ' + val(def.title, q) + (fs ? ' – ' + fs : ''));
    snd('fail');
    try { if (def.onFail) def.onFail(q, S); } catch (e) { console.warn('onFail', q.id, e); }
    if (def.removeOnFail) { remove(q); end(q); chainAfter(q, 'fail'); }
  }

  // ---------- pozície, ciele ----------
  const ALIAS = { ninka: 'kid', timea: 'kid', kokes: 'dog', pes: 'dog', auto: 'car', fabia: 'car' };
  const canon = (id) => ALIAS[id] || id;
  const DYN_OFF = { strom_a: [26, -14], strom_b: [-30, 12], strom_c: [9, 34], vo_hracky: [14, -10] };

  function locCenter(id) {
    const m = M(), l = m && m.locs && m.locs[id];
    return l ? { x: l.x, z: l.z, r: Math.max(12, Math.hypot(l.w || 20, l.d || 20) / 2 + 10), loc: l } : null;
  }
  function bytDoorOut() {
    const m = M(), l = m && m.locs && m.locs.byt;
    if (!l) return null;
    try {
      const d = m.doorPts && m.doorPts(l);
      if (d && d[0]) return { x: (d[0].outX != null ? d[0].outX : d[0].x) + 5, z: (d[0].outZ != null ? d[0].outZ : d[0].z) + 4 };
    } catch (e) { /* nič */ }
    return { x: l.x + (l.w || 20) / 2 + 6, z: l.z + (l.d || 20) / 2 + 6 };
  }
  function hsPos(id) {
    id = canon(id);
    const a = A(), m = M();
    if (id === 'phone' || id === 'auto') return null;
    if (id === 'kid') return a && a.kid ? { x: a.kid.x, z: a.kid.z } : null;
    if (id === 'dog') return a && a.dog ? { x: a.dog.x, z: a.dog.z } : null;
    if (id === 'car' || id === 'hasiak') return a && a.car ? { x: a.car.x, z: a.car.z } : null;
    if (id.startsWith('loc:')) { const c = locCenter(id.slice(4)); return c ? { x: c.x, z: c.z } : null; }
    if (id === 'strom_byt') return bytDoorOut();
    if (DYN_OFF[id]) {
      const base = m && m.hs && m.hs[id === 'vo_hracky' ? 'vo_zelenina' : 'vybeh'];
      return base ? { x: base.x + DYN_OFF[id][0], z: base.z + DYN_OFF[id][1] } : null;
    }
    const h = m && m.hs && m.hs[id];
    return h ? { x: h.x, z: h.z } : null;
  }
  // dynamické hotspoty pre main.js (zlúčiť s Map.hs pri hľadaní akcií)
  function dynHs() {
    const out = [];
    const add = (id, name, r) => { const p = hsPos(id); if (p) out.push({ id, name, x: p.x, z: p.z, r: r || 3 }); };
    add('hasiak', 'Hasiak v kufri Fabie', 4);
    add('strom_byt', 'Strom pred bytom', 3);
    add('strom_a', 'Strom v parku', 3); add('strom_b', 'Vŕba pri jazierku', 3); add('strom_c', 'Krík za výbehom', 3);
    add('vo_hracky', 'Regál s hračkami', 3);
    return out;
  }

  function stepHs(q, st) {
    if (!st) return [];
    if (st.type === 'search') return arr(val(st.spots, q)).filter(s => !(q.data.searched || []).includes(s));
    if (st.type === 'deliver') return (q.data.outlets || []).filter(i => !(q.data.delivered || []).includes(i)).map(i => 'vydaj_' + i);
    if (st.type === 'drive') return ['loc:' + val(st.loc, q)];
    return arr(val(st.at, q)).map(canon);
  }
  const targets = (q) => stepHs(q, stepOf(q));

  function needMissing(st, hsId, q) {
    const n = st.need;
    if (!n) return null;
    const S = G.S;
    if (n.kid && !kidWithMe()) return { name: KID, msg: `${KID} nie je so mnou! Kde som ju nechal?!` };
    if (n.dog && !dogWithMe()) return { name: DOG, msg: `${DOG} nie je pri mne. Kde zas lieta?` };
    for (const it of arr(n.item)) if (!S.items.has(it)) return { name: ITEM[it] || it, msg: `Chýba mi ${ITEM[it] || it}. Mal som to… niekde.` };
    if (n.carNear) {
      const p = hsPos(hsId), c = car();
      if (!p || !c || dist(c, p) > n.carNear) return { name: 'Fabia pri stojane', msg: 'Najprv k stojanu priveď Fabiu. Do vrecka sa benzín nezmestí.' };
    }
    if (n.flag && !S.flags[n.flag]) return { name: n.flagName || n.flag, msg: n.flagMsg || 'Ešte nie.' };
    return null;
  }

  // ---------- vykonanie kroku ----------
  function applyOpt(q, opt) {
    const S = G.S;
    let r = opt && opt.run ? opt.run(q, S) : opt;
    r = r || {};
    if (r.fx) fx(val(r.fx, q));
    if (r.flag) S.flags[r.flag] = true;
    if (r.unflag) S.flags[r.unflag] = false;
    if (r.give) for (const it of arr(r.give)) S.items.add(it);
    if (r.take) for (const it of arr(r.take)) S.items.delete(it);
    if (r.kid) kidSet(r.kid);
    if (r.dog) dogSet(r.dog);
    if (r.pushId) S.pending.push({ t: r.pushDelay || 1, id: r.pushId });
    if (r.run2) { q.data.helper = r.run2[0]; q.data.arriveAt = S.time + rr(r.run2[1], r.run2[2]); }
    return r;
  }

  function cookResult(q, res, total) {
    const S = G.S;
    total = Math.max(1, (res && res.total) || total || 1);
    const served = (res && res.served) || 0, lost = (res && res.lost) || 0;
    const ratio = served / total;
    fx({ money: Math.round(served * 12.5 * 100) / 100, rep: ratio >= 0.8 ? 6 : ratio >= 0.5 ? 2 : -6, nervy: lost * 3 });
    if (res && Array.isArray(res.ignored)) {
      for (const id of res.ignored) {
        const li = LUNCH_INTERRUPTS.find(x => x.id === id);
        if (li) { fx(li.ignoreFx); toast('😬 ' + li.ignoreSay, 'bad'); log('😬 Ignoroval si: ' + li.label); }
      }
    }
    S.flags.lunchDone = true;
    say(ratio >= 0.8 ? `Vydal si ${served}/${total} porcií. Kuchársky boh!`
      : ratio >= 0.5 ? `Vydal si ${served}/${total} porcií. Prežili sme.`
      : `Vydal si ${served}/${total} porcií. Niekto čakal na polievku hodinu.`);
  }

  // callback voľby (UI.choice / UI.phoneCall / UI.ring): null = zložil / zavrel
  function choiceCb(q, st, ch) {
    const S = G.S;
    return (opt) => {
      if (!S.stack.includes(q)) return;
      if (!opt) { // zložil / zavrel
        if (ch.hangFx) fx(ch.hangFx);
        if (ch.hangSay) say(ch.hangSay);
        if (!st.call) return;
        completeStep(q);
        return;
      }
      const r = applyOpt(q, opt);
      completeStep(q);
      if (r.say) say(val(r.say, q));
    };
  }

  function runStep(q, st, hsId) {
    const S = G.S;
    bringTop(q);
    switch (st.type) {
      case 'choice': {
        const ch = typeof st.choice === 'string' ? CH[st.choice] : typeof st.choice === 'function' ? st.choice(q, S) : st.choice;
        if (!ch) { completeStep(q); break; }
        const cb = choiceCb(q, st, ch);
        const chq = Object.assign({}, ch, { q: val(ch.q, q), opts: ch.opts.map(o => Object.assign({}, o, { t: val(o.t, q) })) });
        if (st.call && G.UI && G.UI.phoneCall) ui('phoneCall', chq, cb);
        else if (G.UI && G.UI.choice) ui('choice', chq, cb);
        else cb(chq.opts[0]);
        break;
      }
      case 'mini':
        if (st.mini === 'tank') {
          ui('tank', q, (res) => {
            if (!res || !(res.liters > 0)) return say('Nenatankoval si nič. Fabia sa smutne pozerá.');
            const c = car();
            if (c) c.fuel = Math.min(CFG.tankL, (c.fuel || 0) + res.liters);
            q.data.liters = res.liters;
            q.data.cost = Math.round((res.cost != null ? res.cost : res.liters * CFG.fuelPrice) * 100) / 100;
            completeStep(q);
          });
        } else if (st.mini === 'cook') {
          const total = val(st.total, q) || 9;
          const opts = { total, interrupts: q.data.interrupts || [], variant: q.def.variant, title: val(q.def.title, q) };
          ui('cook', q, (res) => {
            if (!S.stack.includes(q)) return;
            cookResult(q, res, total);
            completeStep(q);
          }, opts);
        } else if (st.mini === 'dogWalk') {
          ui('dogWalk', (res) => {
            if (!S.stack.includes(q)) return;
            if (res && res.ok === false) fx({ nervy: 4 });
            completeStep(q);
          });
        } else if (st.mini === 'insta') {
          ui('insta', () => completeStep(q));
        } else completeStep(q);
        break;
      case 'deliver': {
        const i = parseInt(String(hsId).replace('vydaj_', ''), 10);
        q.data.delivered = q.data.delivered || [];
        const done = (res) => {
          if (!S.stack.includes(q) || q.data.delivered.includes(i)) return;
          const ok = !res || res.ok !== false;
          q.data.delivered.push(i);
          S.delivered.add(G.outletId ? G.outletId(i) : 'outlet_' + i);
          fx(ok ? { money: 24, rep: 1 } : { money: 12, rep: -2, nervy: 3 });
          say(ok ? pick([`${outletName(i)}: „Konečne! Ľudia už hryzú stoly.“`, `${outletName(i)} zásobená. Jedna menej.`, `Dievčina vo výdajni: „Paťo, ty si zlatý.“ Dnes to stačí.`])
            : `${outletName(i)}: „Toto sme neobjednali. Ale zjeme.“`);
          log(`📦 Rozvoz: ${outletName(i)}`);
          if (q.data.outlets.every(o => q.data.delivered.includes(o))) completeStep(q);
          else snd('ding');
        };
        if (G.UI && G.UI.deliver) ui('deliver', outletName(i), done); else done({ ok: true });
        break;
      }
      case 'drive':
        completeStep(q);
        break;
      case 'pay': {
        const c = st.cost != null ? val(st.cost, q) : (q.data.cost || 0);
        fx({ money: -c });
        say(val(st.paySay, q) || (c > 0 ? `Zaplatené: ${eur(c)}. Au.` : 'Pokladníčka: „Za nič? Tak dovidenia.“'));
        completeStep(q);
        break;
      }
      case 'search': {
        q.data.searched = q.data.searched || [];
        const found = val(st.found, q), fails = val(st.fails, q) || {};
        const target = q.data.searchAt || (st.target && val(st.target, q));
        if (hsId === target) {
          toast(found && found[hsId] ? found[hsId] : (st.foundAny || 'Našiel si to!'), 'good');
          completeStep(q);
        } else {
          q.data.searched.push(hsId);
          fx({ nervy: 3, focus: -2 });
          say(fails[hsId] || pick(['Nič.', 'Tu nie.', 'Prach a sklamanie.']));
          const spots = arr(val(st.spots, q));
          if (!spots.some(s => !q.data.searched.includes(s))) { completeStep(q); toast(st.foundLast || 'Bolo to v ruke. Celý čas.', 'good'); }
        }
        break;
      }
      default:
        completeStep(q);
    }
  }

  function stepAction(q, hsId) {
    const st = stepOf(q);
    if (!st || !stepHs(q, st).includes(hsId)) return null;
    let label = val(st.label, q) || val(q.def.title, q);
    if (st.type === 'search') {
      const m = M(), h = m && m.hs && m.hs[hsId];
      const dn = dynHs().find(d => d.id === hsId);
      label = `${st.verb || 'Prehľadať'}: ${h ? h.name : dn ? dn.name : hsId === 'car' ? 'Fabia' : hsId === 'pelech' ? 'pelech' : hsId}`;
    }
    if (st.type === 'deliver') label = `Odovzdať jedlo: ${outletName(parseInt(hsId.replace('vydaj_', ''), 10))}`;
    if (st.type === 'pay') { const c = st.cost != null ? val(st.cost, q) : (q.data.cost || 0); label = `${val(st.label, q) || 'Zaplatiť'} ${eur(c)}`; }
    const miss = needMissing(st, hsId, q);
    if (miss) return { label: `${label} (chýba: ${miss.name})`, type: 'press', time: 0, run: () => say(miss.msg), quest: q };
    // krok s časovou podmienkou (st.ready → bool): kým neplatí, akcia len povie/ukáže, prečo ešte nie
    if (st.ready) {
      let ok = false; try { ok = !!val(st.ready, q); } catch (e) { ok = false; }
      if (!ok) { const msg = val(st.readyMsg, q) || 'Ešte nie.'; return { label: `${label} (${msg})`, type: 'press', time: 0, run: () => { say(msg); ui('bubble', 'player', msg, 3); }, quest: q }; }
    }
    const hold = st.type === 'hold' || st.type === 'search' || st.hold > 0;
    return { label, type: hold ? 'hold' : 'press', time: hold ? (st.hold || 1) : 0, run: () => runStep(q, st, hsId), quest: q };
  }

  function questAction(hsId) {
    const S = G.S;
    if (!S) return null;
    for (const q of S.stack) {
      const a = stepAction(q, hsId);
      if (a) return a;
    }
    return null;
  }

  // ---------- skratky pre kroky ----------
  const go = (at, label, x) => Object.assign({ type: 'go', at, label }, x || {});
  const hold = (at, s, label, x) => Object.assign({ type: 'hold', at, hold: s, label }, x || {});
  const ch = (choice, at, label, x) => Object.assign({ type: 'choice', choice, at, label }, x || {});
  const ph = (choice, label, call, x) => Object.assign({ type: 'choice', choice, at: 'phone', label: label + ' (F)', call: !!call }, x || {});
  const auto = (choice, x) => Object.assign({ type: 'choice', choice, at: 'auto', auto: true, label: '…' }, x || {});
  const drive = (loc, label, x) => Object.assign({ type: 'drive', loc, label }, x || {});
  const pay = (at, cost, label, x) => Object.assign({ type: 'pay', at, cost, label }, x || {});
  const mini = (m, at, label, x) => Object.assign({ type: 'mini', mini: m, at, label }, x || {});
  const coin = (p, a, b) => () => (rand() < p ? a : b);

  // ---------- voľby ----------
  const CH = {
    topanky: { q: `${KID} odmieta topánky. „Tieto nie! Chcem tie s trblietkami!“`, opts: [
      { t: 'Ponúknuť keksík', fx: { dad: -1, nervy: -3 }, say: 'Úplatok funguje. Pedagogicky sporné, prakticky geniálne.' },
      { t: 'Zaspievať pesničku o topánkach', run: coin(0.6, { fx: { dad: 2 }, say: `${KID} sa smeje a obúva. Si legenda.` }, { fx: { nervy: 8, time: 10 }, say: `${KID} chce ešte šesť slôh. A potom znova od začiatku.` }) },
      { t: '„Kto bude skôr obutý?“', fx: { dad: 1, energy: -3 }, say: 'Prehral si. Zámerne. Asi.' },
    ] },
    mlieko: { q: `Mlieko skyslo. ${KID} chce cereálie. Teraz.`, opts: [
      { t: 'Cereálie s vodou', fx: { dad: -2, nervy: 4 }, say: `${KID}: „Fuuuj!“ Oprávnene.` },
      { t: 'Suché cereálie do misky „ako chipsy“', fx: { dad: 1 }, say: 'Marketing zabral. Chrúme a je šťastná.' },
      { t: 'Zbehnúť k susedke po mlieko', fx: { time: 8, nervy: -2, dad: 2 }, say: 'Susedka dala mlieko aj prednášku o tvojom živote.' },
    ] },
    rozpravka: { q: `${KID}: „Tati, ktorú rozprávku?“`, opts: [
      { t: 'O Červenej čiapočke (po 47. raz)', fx: { dad: 1 }, say: `${KID} opravuje každú tvoju vetu. Vie to lepšie.` },
      { t: `Vymyslená: O ${DOGINS}, čo varil halušky`, fx: { dad: 2, energy: -5 }, say: `${DOG} v rozprávke otvoril bistro. ${KID} chce pokračovanie zajtra.` },
      { t: 'Krátka verzia: „Bol raz jeden… a dobrú noc.“', run: coin(0.5, { fx: { energy: 3 }, say: 'Prekvapivo to prešlo. Zíva.' }, { fx: { nervy: 5 }, say: `${KID}: „To nebola rozprávka!“` }) },
    ] },
    menu: { q: 'Hanka: „Nové menu do zajtra. Nejaký nápad, šéfkuchár?“', opts: [
      { t: 'Wayanov nasi goreng (Bali v Bratislave)', fx: { rep: 3 }, say: 'Wayan: „Finally! Sambal robím sám, šéfe.“ Kuchyňa vonia ako dovolenka.' },
      { t: 'Tundeho jollof rice', fx: { rep: 3, nervy: 2 }, say: 'Tunde: „Nigérijský jollof, nie ghanský. To je dôležité!“ Nevieš prečo, ale prikyvuješ.' },
      { t: 'Santiho arepas', fx: { rep: 2, money: -15 }, say: 'Santi: „Como en Colombia!“ Kukuričná múka za 15 € – investícia.' },
    ] },
    reklamacia: { q: 'Objednal si prsia, priviezli 20 kíl krídel. Čo s tým?', opts: [
      { t: 'Žiadať dobropis', run: coin(0.5, { fx: { money: 40 }, say: 'Dobropis 40 €! Zázraky sa dejú.' }, { fx: { nervy: 5 }, say: 'Dispečerka: „To musí schváliť Zdeno. Zdeno je na dovolenke.“' }) },
      { t: 'Krídelká dnes ako špecialita!', fx: { rep: 2 }, say: 'Pikantné krídelká 3+1. Marketing z núdze.' },
      { t: 'Napíšem mail… niekedy', fx: { focus: -5 }, say: 'Mail ostane v konceptoch. Navždy.' },
    ] },
    elektrikar: { q: 'Prúd nejde. Box sa ohrieva, mäso sa potí. Koho voláš?', who: 'Elektrikár Ľubo', icon: '⚡', opts: [
      { t: 'Elektrikár Ľubo – hneď (−120 €)', fx: { money: -120 }, say: 'Ľubo: „Istič, šéfe. Stodvadsať. Hotovosť.“ Lúpež za bieleho dňa.' },
      { t: 'Skúsiť to sám v rozvádzači', run: coin(0.5, { fx: { nervy: -3 }, say: 'Cvak. Svieti! Si elektrikár. (nie si)' }, { fx: { nervy: 10, time: 10 }, say: 'Iskra, tma, nadávka. Aj tak voláš Ľuba.', pushId: null }) },
      { t: 'Zavolať Borisa, nech to rieši', fx: { rep: -3, nervy: 4 }, say: 'Boris: „Ja som čísla, nie elektrina. Vyrieš to.“' },
    ], hangFx: { nervy: 5 }, hangSay: 'Zložil si. Box sa ďalej potí.' },
    instalater: { q: 'Odtok je upchatý ako diaľnica v piatok. Čo s tým?', opts: [
      { t: 'Zvon + hnev', fx: { nervy: 6, energy: -8 }, say: 'Po desiatich minútach to glgne. Vyliezla aj lyžička.' },
      { t: 'Inštalatér (−70 €)', fx: { money: -70 }, say: 'Inštalatér: „Kto vám sem lial olej?“ Všetci. Všetci sem liali olej.' },
      { t: 'Honza má trik so sódou', run: coin(0.6, { fx: { rep: 1 }, say: 'Honza: „Hele šéfe, soda a ocet, to je v pohodě.“ A je.' }, { fx: { nervy: 5, money: -70 }, say: 'Honza: „No, to se nepovedlo.“ Inštalatér 70 €.' }) },
    ] },
    hostneplati: { q: 'Stôl 6 zjedol, dopil a… odišiel. Dvere sa ešte kývu.', opts: [
      { t: 'Bežať za ním!', run: coin(0.5, { fx: { money: 24, energy: -10 }, say: 'Dobehol si ho pri Fabii. „Zabudol som.“ Jasné.' }, { fx: { energy: -12, nervy: 6 }, say: 'Behá rýchlejšie ako ty. Všetci behajú rýchlejšie ako ty.' }) },
      { t: 'Nechať tak, karma si ho nájde', fx: { money: -24, nervy: 2 }, say: 'Karma nemá pokladňu. Mínus 24 €.' },
      { t: 'Kamera + Facebook skupina', fx: { money: -24, rep: 2 }, say: 'Fotka je rozmazaná, ale komentáre sú zlaté.' },
    ] },
    recenzent: { q: 'Dana šepká: „Stôl 4. Fotí si tanier zo štyroch strán. RECENZENT.“', opts: [
      { t: 'Dezert na účet podniku', fx: { money: -6, rep: 5 }, say: '„Milá obsluha, pozorný šéf.“ Štyri a pol hviezdy. Pol ti chýba navždy.' },
      { t: 'Ignorovať. Varíme pre všetkých rovnako', run: coin(0.5, { fx: { rep: 4 }, say: 'Recenzia: „Autentické, bez pozérstva.“ Fuuu.' }, { fx: { rep: -6 }, say: 'Recenzia: „Šéf sa ani nepozrel.“ Tri hviezdy. Do riti.' }) },
      { t: 'Ondrovo víno z kancelárie', fx: { rep: 4, nervy: 4 }, say: 'Recenzent spokojný. Ondro si to zajtra všimne.' },
    ] },
    zastup: { q: 'Santi neprišiel. Kto dnes varí s tebou?', who: 'Santi', icon: '🇨🇴', opts: [
      { t: 'Honza zaskočí', fx: { rep: -1 }, say: 'Honza: „Hele šéfe, já to zvládnu, ale ne nadšeně.“' },
      { t: 'Brigádnik Vlado (−60 €)', fx: { money: -60 }, flag: 'helper', say: 'Vlado: „Jasné, šéfe, len sa dooblečiem… a dojem… a prídem.“' },
      { t: 'Zvládnem to sám', fx: { nervy: 6 }, flag: 'alone', say: 'Kuchár, čašník, šéf. Trojjediný Paťo.' },
    ], hangFx: { nervy: 3 }, hangSay: 'Zložil si. Santi je rád, že sa to vyriešilo.' },
    plynari: { q: 'Plyn nejde. Sporák ticho. Hostia nie.', opts: [
      { t: 'Zavolať plynárov', fx: { time: 15 }, say: 'Plynári: „Do dvoch hodín.“ Prišli za 15 minút. Zázrak.' },
      { t: 'Všetko na indukciu a do rúry', fx: { nervy: 8, rep: -1 }, say: 'Wayan žongluje panvicami. Tunde spieva. Funguje to.' },
      { t: 'Skontrolovať, či nie je zavretý ventil', run: coin(0.5, { fx: { nervy: -4 }, say: 'Zavretý ventil. Honza: „To jsem byl já, sorry.“' }, { fx: { nervy: 4, time: 15 }, say: 'Ventil v poriadku. Voláš plynárov.' }) },
    ] },
    hadka: { q: 'Tunde a Honza sa hádajú, kto zjedol poslednú arepu. Santi sa smeje.', opts: [
      { t: '„Santi, urob ďalšie arepas. Pre všetkých.“', fx: { rep: 1, nervy: -3 }, say: 'Santi: „Con gusto!“ Mier v kuchyni. Na hodinu.' },
      { t: 'Zakričať', fx: { nervy: 6, rep: -1 }, say: 'Ticho. Honza: „Šéf má špatnej den.“ Má.' },
      { t: '„Kto zjedol arepu, umýva riad.“', fx: { dad: 1 }, say: 'Tunde aj Honza ukazujú na Wayana. Wayan ani nebol v práci.' },
    ] },
    zmeny: { q: 'Dana: „Lenka má zase víkend voľný?!“ Lenka: „Ty si mala minulý!“', opts: [
      { t: 'Hodiť mincou', run: coin(0.5, { fx: { rep: 1 }, say: 'Minca rozhodla. Obe nadávajú na mincu. Tebe to vyhovuje.' }, { fx: { nervy: 5 }, say: 'Minca spadla do polievky. Hádka pokračuje.' }) },
      { t: 'Obe majú voľno, zavolám brigádnika (−60 €)', fx: { money: -60, rep: 2 }, say: 'Dana aj Lenka ťa milujú. Tvoj účet nie.' },
      { t: '„Ja budem obsluhovať.“', fx: { nervy: 8, energy: -5 }, say: 'Smiali sa 3 minúty. Potom si uvedomili, že to myslíš vážne.' },
    ] },
    joff: { q: 'Boris: „Paťo, čo tie čísla za minulý týždeň? Marža?“', who: 'Boris', icon: '📊', opts: [
      { t: 'Vysvetliť úprimne (krídla, mrazák, Tomáš)', fx: { rep: 2, nervy: 3 }, say: 'Boris: „Hm. Pošli mi to v Exceli.“ Nepošleš.' },
      { t: '„Čísla idú hore, Boris.“', run: coin(0.5, { fx: { nervy: -3 }, say: 'Boris: „Super.“ Nekontroloval to. Zatiaľ.' }, { fx: { rep: -4, nervy: 6 }, say: 'Boris: „Mám ten Excel pred sebou, Paťo.“ Kurnik.' }) },
      { t: 'Hodiť to na Tomáša', fx: { rep: -1 }, say: 'Boris: „Tomáš vraví, že si šéf ty.“ Má pravdu.' },
    ], hangFx: { rep: -3, nervy: 4 }, hangSay: 'Zložil si Borisovi. Odvážne. Hlúpe, ale odvážne.' },
    simon: { q: 'Ondro ochutnáva. Dlho žuje. Mlčí.', opts: [
      { t: '„Je to Wayanov sambal, Ondro.“', fx: { rep: 3 }, say: 'Ondro: „Štípe to. Dobre to štípe.“ Prežil si.' },
      { t: 'Doliať mu víno', fx: { rep: 2, money: -8 }, say: 'Ondro po druhom pohári: „Výborné, výborné.“ Čokoľvek.' },
      { t: 'Mlčať tiež', run: coin(0.5, { fx: { rep: 4 }, say: 'Ondro: „Toto dáme do všetkých prevádzok.“ Víťazstvo.' }, { fx: { rep: -3, nervy: 5 }, say: 'Ondro: „Soľ.“ Odišiel. Jedno slovo.' }) },
    ] },
    vydajna: { q: (q) => `${outletName(q.data.o || 0)}: „Jedlo prišlo studené! Zákazníci reptajú!“`, who: 'Výdajňa', icon: '🥶', opts: [
      { t: 'Prepáčte, vezieme náhradu', fx: { rep: 1 }, say: 'Výdajňa: „Rýchlo, prosím. Jeden pán už búcha príborom.“' },
      { t: '„Ohrejte si to v mikrovlnke.“', fx: { rep: -5, nervy: -2 }, say: 'Ticho na linke. Potom: „Poviem to Borisovi.“ Povie.' },
      { t: 'Hodiť to na Tomáša', fx: { rep: -2 }, say: 'Výdajňa: „Tomáš vraví, že boxy balíte vy.“ Tomáš má dnes pravdu stále.' },
    ] },
    lukas: { q: 'Peter: „Šéfe… trochu som zavadil o stĺp. Dodávkou. Trochu veľa.“', who: 'Peter', icon: '🚐', opts: [
      { t: '„Si v poriadku? Jedlo je v poriadku?“', fx: { rep: 2, dad: 1 }, say: 'Peter: „Ja hej. Polievka… polievka je všade.“' },
      { t: '„Koľko to bude stáť?!“', fx: { nervy: 8, money: -150 }, say: 'Peter: „Spoluúčasť 150.“ Ticho. „Prepáč, šéfe.“' },
      { t: 'Poslať Tomáša po neho', fx: { nervy: 3 }, say: 'Tomáš nedvíha. Samozrejme, že Tomáš nedvíha.' },
    ], hangFx: { rep: -2 }, hangSay: 'Zložil si. Peter stojí pri stĺpe sám.' },
    matus: { q: 'Tomáš nedvíha. 7× zvonenie, potom schránka. Rozvoz čaká.', opts: [
      { t: 'Napísať SMS s výkričníkmi', fx: { nervy: 4 }, say: 'Seen. Žiadna odpoveď. Tri bodky… a nič.' },
      { t: 'Zavolať Petrovi, nech to vezme', fx: { rep: -1 }, say: 'Peter: „Jasné, ale potom mi dlhuješ pivo.“ Dlhuješ mu už osem.' },
      { t: 'Zavolať jeho mame', fx: { nervy: -2, rep: 1 }, say: 'Mama Tomáša: „ON EŠTE SPÍ?!“ Tomáš o 4 minúty volá sám.' },
    ] },
    special: { q: (q) => ['Wayan: „Šéfe, dnes nasi goreng ako špeciál? Mám sambal z domu.“', 'Tunde: „Boss, jollof rice special today. Trust me.“', 'Santi: „Jefe, arepas con queso ako denné menu? Prosím.“'][q.def.variant || 0], opts: [
      { t: 'Jasné, ide to na tabuľu', run: (q) => ({ fx: { rep: 4, money: 30 }, say: ['Nasi goreng vypredaný o 12:40. Wayan žiari.', 'Jollof vypredaný. Tunde tancuje pri sporáku.', 'Arepas idú ako šialené. Santi: „Te lo dije!“'][q.def.variant || 0] }) },
      { t: 'Len ako skúška pre personál', fx: { rep: 1, energy: 15 }, say: 'Najedol sa personál. Hostia dostali rezeň. Ako vždy.' },
      { t: '„Dnes nie, dnes je chaos.“', fx: { rep: -1, nervy: 2 }, say: 'Sklamaný pohľad. Honza: „Šéf je nudnej.“' },
    ] },
    benjipivo: { q: 'Honza: „Hele šéfe, v lednici není ani jedno pivo. To se v Česku nestává.“', opts: [
      { t: 'Kúpiť basu po šichte (−14 €)', fx: { money: -14, rep: 2 }, say: 'Honza: „Ty jsi král, šéfe.“ Tunde: „A čo my?“' },
      { t: '„Honza, je desať ráno.“', fx: { nervy: 1 }, say: 'Honza: „No a? V Plzni je už poledne.“ Nie je.' },
      { t: 'Nealko pivo ako kompromis', fx: { rep: -1 }, say: 'Honza sa pozrel na fľašu ako na zradu. „To není pivo. To je čaj.“' },
    ] },
    servisbox: { q: 'Mrazák v sklade kašle a kvapká. −18 °C sú dnes −6 °C.', opts: [
      { t: 'Servis hneď (−90 €)', fx: { money: -90 }, say: 'Servisák: „Kompresor. Starý.“ Všetko tu je staré.' },
      { t: 'Preložiť všetko do kuchyne', fx: { energy: -12, time: 15 }, say: 'Dvadsať kíl mäsa v náručí. Chrbát píše sťažnosť.' },
      { t: 'Kopnúť do neho', run: coin(0.4, { fx: { nervy: -3 }, say: 'Zavrčal a ide. Technika 21. storočia.' }, { fx: { money: -90, nervy: 5 }, say: 'Zavrčal a zomrel. Servis 90 €.' }) },
    ] },
    policia: { q: 'Policajt: „Dobrý deň, doklady prosím. A techničák.“', opts: [
      { t: 'Podať doklady', run: (q, S) => (S.items.has('technicak') ? { fx: { nervy: 2 }, say: 'Policajt: „V poriadku. Zadné svetlo máte prasknuté. Nabudúce.“' } : { fx: { money: -50, nervy: 6 }, say: 'Policajt: „Techničák doma? To je 50 €.“ Je v šanóne. V kuchyni. Kurnik.' }) },
      { t: 'Zahovoriť ho obedom v bistre', run: coin(0.4, { fx: { rep: 1 }, say: 'Policajt: „Vy ste ten z Bistra? Rezeň bol dobrý.“ Mávol rukou.' }, { fx: { money: -50, nervy: 8 }, say: 'Policajt: „Toto nebola úplatkárska ponuka, však?“ Nebola. 50 €.' }) },
      { t: '„Ponáhľam sa, dcéra je chorá.“', run: (q, S) => (S.dayType === 'timea_chora' ? { fx: { nervy: -2 }, say: 'Pozrel sa na zadné sedadlo. „Choďte.“ Pravda sa vypláca.' } : { fx: { money: -50, nervy: 5 }, say: '„Dcéra v škôlke, pane. Vidím batoh.“ Všimol si. 50 €.' }) },
    ] },
    parkovisko: { q: 'Niekto zaparkoval priečne za Fabiou. Nemáš kam cúvnuť.', opts: [
      { t: 'Odťahovka (−40 €)', fx: { money: -40, nervy: 2 }, say: 'Odťahovka prišla za 20 minút. Majiteľ za 21.' },
      { t: 'Čakať na majiteľa', fx: { time: 15, nervy: 6 }, say: 'Prišiel, zjedol kebab, oprel sa o auto, až potom odišiel.' },
      { t: 'Vyjsť po chodníku', run: coin(0.6, { fx: { nervy: -3 }, say: 'Trošku cez obrubník. Fabia zvládne všetko.' }, { fx: { money: -30, nervy: 5 }, say: 'Obrubník 1 : 0 kryt motora. Do riti.' }) },
    ] },
    pokuta: { q: 'Za stieračom lístok. Papuča nie je, zatiaľ. 30 €.', opts: [
      { t: 'Zaplatiť cez appku', fx: { money: -30 }, say: 'Zaplatené. Appka chce hodnotenie. Dáš jednu hviezdu.' },
      { t: 'Odvolať sa (vraj bola zlá značka)', run: coin(0.3, { fx: { nervy: -2 }, say: 'Odvolanie prešlo! Značka naozaj visela hore nohami.' }, { fx: { money: -45, nervy: 4 }, say: 'Zamietnuté + poplatok. 45 €. Systém vyhráva.' }) },
      { t: 'Hodiť lístok do priehradky k ostatným', fx: { focus: -3 }, say: 'Priehradka má už vlastné PSČ. Príde to doporučene.' },
    ] },
    baterka_koho: { q: 'Fabia len klikne. Koho zavoláš?', icon: '🔋', opts: [
      { t: 'Peter (zadarmo, je blízko)', run: (q, S) => (rand() < 0.2
        ? { say: 'Peter: „Šéfe, som na rozvoze. Pošlem Tomáša.“ Tomáš. Hm.', fx: { nervy: 2 }, run2: ['matus', 11, 15] }
        : { say: 'Peter: „Jasné, šéfe. Desať minút.“ Povedal desať. Myslel desať. Zázrak.', run2: ['lukas', 6, 10] }) },
      { t: 'Tomáš (zadarmo, ak dvíha)', run: (q, S) => (rand() < 0.3
        ? { say: 'Tomáš nedvíha. Trikrát. Po troch minútach voláš suseda Ľuba. Dvadsať eur.', fx: { money: -20, nervy: 3 }, run2: ['sused', 7, 7] }
        : { say: 'Tomáš: „Šéfe, som tu za chvíľu. Len dojem… a prídem.“', run2: ['matus', 6, 10] }) },
      { t: 'Sused Ľubo (−20 € „na pivo“)', fx: { money: -20 }, say: 'Ľubo: „Štyri minúty. A pivo.“ Pivo je dvadsať. Ľubo má kurz.', run2: ['sused', 4, 4] },
      { t: 'Asistenčná služba (−60 €)', fx: { money: -60 }, say: 'Operátorka: „Vozidlo je na ceste.“ Vozidlo. Nie človek. Vozidlo.', run2: ['asist', 3, 3] },
    ] },
    servis_rezerva: { q: 'Fero: „Dojazdová rezerva, max 80. Zastav sa do zajtra, vymením ti to.“', who: 'Fero (servis)', icon: '🛞', opts: [
      { t: '„Zajtra ráno, Fero.“', fx: { nervy: -2 }, say: 'Fero: „Jasné.“ Obaja viete, že to bude o týždeň.' },
      { t: '„Vydrží to aj mesiac.“', fx: { focus: -2 }, say: 'Fero: „Tvoje auto.“ Je to tvoje auto. Bohužiaľ.' },
    ] },
    kontrolka: { q: 'Kontrolka motora svieti. Oranžová. Fabia: „Nič mi nie je.“', opts: [
      { t: 'Prelepiť čiernou páskou', fx: { nervy: -2 }, say: 'Nevidíš ju. Neexistuje. Klasická diagnostika.' },
      { t: 'Zavolať Ferovi zo servisu', fx: { money: -25 }, say: 'Fero: „Lambda sonda. Príď, keď budeš mať čas.“ Nikdy.' },
      { t: 'Vypnúť a zapnúť motor', run: coin(0.5, { fx: { nervy: -4 }, say: 'Zhasla! IT riešenie funguje aj na autá.' }, { fx: { nervy: 3 }, say: 'Svieti ďalej. Teraz aj bliká. Hnevá sa.' }) },
    ] },
    zapcha: { q: 'Cesta uzavretá. Kopú. Čo iné. Zápcha na kilometer.', opts: [
      { t: 'Čakať v rade', fx: { time: 15, nervy: 5 }, say: 'Pätnásť minút. Dvaja chlapi kopú, šiesti sa pozerajú.' },
      { t: 'Obchádzka poľnou cestou', fx: { nervy: 2 }, say: 'Fabia sa trasie, ale ide. Blato až na strechu.' },
      { t: 'Trúbiť', fx: { nervy: 8, rep: -1 }, say: 'Kopáč ti zamával. Nie celou rukou.' },
    ] },
    zamknute: { q: 'Kľúče. Vo Fabii. Na sedadle. Dvere zamknuté. Vidíš ich.', opts: [
      { t: 'Zámočník (−60 €, 15 min)', fx: { money: -60, time: 15 }, give: 'kluce', say: 'Zámočník to otvoril za 4 sekundy. To je znepokojivé.' },
      { t: 'Rozbiť okienko (−120 €, hneď)', fx: { money: -120, nervy: -5 }, give: 'kluce', say: 'Krach. Sklo všade. Kľúče v ruke. Zima v aute do zimy.' },
      { t: 'Drôt z vešiaka', run: coin(0.4, { give: 'kluce', fx: { nervy: -3, time: 5 }, say: 'Otvorené! Okoloidúci volá políciu.' }, { fx: { nervy: 8, time: 10, money: -60 }, give: 'kluce', say: 'Drôt sa zasekol v tesnení. Zámočník 60 €, smiech zadarmo.' }) },
    ] },
    stk: { q: 'SMS: „STK vozidla BA-xxx končí o 3 dni.“', opts: [
      { t: 'Objednať na zajtra (−45 €)', fx: { money: -45, focus: 2 }, say: 'Zajtra o 7:00. Zapíšeš si to. Na ruku.' },
      { t: 'Ešte je čas', fx: { focus: -3 }, say: 'Tri dni sú tri dni. Potom sú to tri mesiace.' },
      { t: 'Poslať s autom Tomáša', fx: { rep: -1 }, say: 'Tomáš: „Jasné.“ Tomášove „jasné“ nikdy nič neznamená.' },
    ] },
    ucitelka_zem: { q: `Učiteľka: „${KID} zjedla niečo zo zeme na dvore. Asi žaluď. Alebo nie.“`, who: 'pani učiteľka', icon: '🏫', opts: [
      { t: '„Je jej zle?“', fx: { nervy: 4, dad: 1 }, say: 'Učiteľka: „Nie, pýta si ešte.“ Génius alebo koza.' },
      { t: 'Zavolať detskej lekárke', fx: { time: 10, nervy: -3 }, say: 'Lekárka: „Žaluď je v pohode. Hlavne nie lego.“' },
      { t: '„Ona to zvládne, má železný žalúdok po mne.“', run: coin(0.7, { fx: { dad: 1 }, say: 'Zvládla. Večer ti ukáže, čo ešte našla.' }, { fx: { dad: -2, nervy: 8 }, say: 'Večer bolí bruško. Spíš na dlážke pri postieľke.' }) },
    ], hangFx: { dad: -2 }, hangSay: 'Zložil si učiteľke. Odvaha, ktorú budeš ľutovať.' },
    babka_nechce: { q: `${KID} od babky nechce domov. „Babka má buchty! Ty nemáš nič!“`, opts: [
      { t: 'Podplatiť rozprávkou v aute', fx: { dad: 1 }, say: 'Zabralo. Babka ti nenápadne vtisla tri buchty.' },
      { t: 'Nechať ju u babky na noc', fx: { nervy: -12, dad: -2 }, say: 'Večer voľný. Pocit viny plný.' },
      { t: 'Zobrať ju aj s buchtami', fx: { dad: 2, energy: 10 }, say: `${KID} je spokojná. Babka tiež. Omrvinky vo Fabii navždy.` },
    ] },
    mama: { q: `${KID}: „Tati… a prečo mama nebýva s nami?“`, opts: [
      { t: 'Pravdivo a jemne', fx: { dad: 3, nervy: 5 }, say: `${KID}: „Aha. A môžem mať zajtra palacinky?“ Áno. Môžeš.` },
      { t: `„Mama má veľký byt a my máme ${DOGACC}.“`, fx: { dad: 1 }, say: `${KID}: „${DOG} je lepší.“ Správna odpoveď.` },
      { t: 'Zmeniť tému na zajačika', fx: { dad: -1, focus: -2 }, say: 'Tému si zmenil. Otázka sa vráti. Vždy sa vráti.' },
    ] },
    kdejepes: { q: `${KID}: „Tati, kde je ${DOG}?“ Dobrá otázka.`, opts: [
      { t: (q) => dogWithMe() ? `„Tu je, pozri!“` : `„V kuchyni. Stráži rezne.“`, run: (q) => dogWithMe() ? { fx: { dad: 2 }, say: `${KID} objíma ${DOGACC}. ${DOG} toleruje.` } : { fx: { dad: 0, focus: -2 }, say: `${KID}: „A kto stráži teba?“ Nikto, ${KID}. Nikto.` } },
      { t: '„Je v parku s kamarátmi.“', fx: { dad: -1 }, say: `${KID}: „Psy nemajú kamarátov, majú svorku.“ Kde sa to učí?` },
      { t: 'Zavolať mu (aj keď nie je blízko)', fx: { nervy: -2, dad: 1 }, say: `${KID} píska tiež. Nikto nepríde. Smejete sa.` },
    ] },
    kokes_auto: { q: `${DOG} si sadol pri Fabii a nejde dnu. Pohľad: „Zase veterinár?“`, opts: [
      { t: 'Piškóta', fx: { dad: 1 }, say: 'Piškóta. Skočil. Princípy predané za 3 centy.' },
      { t: 'Zdvihnúť ho (25 kíl)', fx: { energy: -10, nervy: 2 }, say: 'Zdvihnutý, naložený, urazený. Chrbát si to pamätá.' },
      { t: '„Tak ostaneš tu.“ a naštartovať', run: coin(0.6, { fx: { nervy: -2 }, say: 'Skočil dnu, kým si zaradil jednotku. Vydieranie funguje obojstranne.' }, { fx: { nervy: 6, dad: -1 }, say: 'Nepohol sa. Vyhral. Vraciaš sa po neho.' }) },
    ] },
    ex_pes: { q: `Simona: „Ten pes nesmie k ${KIDDAT}. Má alergiu. Čítala som o tom.“`, who: G.NAMES.exName || 'Ex', icon: '📵', opts: [
      { t: '„Nemá alergiu, má Bundáša. Dva roky.“', fx: { nervy: 4 }, say: 'Simona: „Píšem to právničke.“ Píše to právničke vždy.' },
      { t: '„Dobre, budem si dávať pozor.“', fx: { nervy: 2, dad: -1 }, say: `Kľud za cenu malej lži. ${DOG} si to nevšimne.` },
      { t: 'Poslať fotku, ako Nelka spí na Bundášovi', fx: { dad: 2, nervy: 6 }, say: 'Simona: „TO NIE JE VTIPNÉ.“ Trošku je.' },
    ], hangFx: { nervy: 6 }, hangSay: 'Zložil si. O tri minúty píše 14 správ.' },
    ex_vola: { q: (q) => ['Simona: „Potrebujem 200 € na krúžky. Do piatku.“', 'Simona: „Tento víkend ju chcem ja. Nie, nepýtam sa.“', 'Simona: „Kto je Katka? Nelka spomínala Katku. KTO JE NINA?“'][q.def.variant || 0], who: G.NAMES.exName || 'Ex', icon: '📵', opts: [
      { t: (q) => ['Poslať 200 €', 'Dobre, vezmi si ju v sobotu', '„Kolegyňa.“'][q.def.variant || 0], run: (q) => [{ fx: { money: -200, nervy: 2 }, say: 'Odoslané. Krúžky: balet, ktorý Nelka neznáša.' }, { fx: { dad: -1, nervy: -3 }, say: 'Simona: „Konečne rozumná veta.“' }, { fx: { nervy: 8 }, say: 'Simona: „Kolegyňa, ktorá spí u vás?“ Nelka hovorí priveľa.' }][q.def.variant || 0] },
      { t: (q) => ['„Pošlem polovicu. Druhú ty.“', '„Máme dohodu. Párny víkend je môj.“', '„To je pes zo škôlky.“'][q.def.variant || 0], run: (q) => [{ fx: { money: -100, nervy: 5 }, say: 'Simona: „TY si ten, čo má bistro.“ Bistro, ktoré jej dlhuje.' }, { fx: { nervy: 6, dad: 1 }, say: 'Simona: „Uvidíme.“ Uvidíte. S právničkou.' }, { fx: { nervy: 4, dad: -1 }, say: 'Simona: „Pes, čo nosí podprsenku? Nelka ju opísala.“ Kurnik.' }][q.def.variant || 0] },
      { t: 'Zmeniť tému na Nelkine kresby', fx: { nervy: 3 }, say: 'Simona: „Neodbiehaj.“ Odbiehaš. Vždy odbiehaš.' },
    ], hangFx: { nervy: 7, dad: -1 }, hangSay: 'Zložil si. Prichádza správa: „Toto si budem pamätať.“' },
    ex_pise: { q: 'Simona (23:04): „Spíš? Musíme sa porozprávať o Vianociach.“ Je október.', opts: [
      { t: 'Odpísať „Zajtra.“', fx: { nervy: 2 }, say: 'Simona: „Vždy zajtra.“ Tri bodky. Nič. Spíš zle.' },
      { t: 'Neodpísať', fx: { nervy: 4, energy: -3 }, say: 'Nepíšeš. Ale čítaš. Štyrikrát.' },
      { t: 'Odpísať esej', fx: { energy: -12, nervy: -4 }, say: 'Napísal si 14 riadkov. Odpoveď: „Ok.“' },
    ] },
    ex_bistro: { q: 'Simona stojí pri pulte. V tvojom bistre. „Idem len na kávu.“ Nikdy nejde len na kávu.', opts: [
      { t: 'Káva na účet podniku a úsmev', fx: { money: -3, nervy: 5 }, say: 'Simona: „Hm, lepšia ako minule.“ Dana prevracia oči.' },
      { t: 'Poslať Danu, ty si „v sklade“', fx: { nervy: 3, rep: -1 }, say: 'Dana: „Šéf tu nie je.“ Simona: „Vidím jeho Fabiu.“' },
      { t: '„Čo potrebuješ?“ priamo', fx: { nervy: 8, dad: 1 }, say: 'Potrebovala papiere pre škôlku. A pozrieť sa, ako ti to ide. Ide to.' },
    ] },
    ex_fabia: { q: 'Simona: „Potrebujem Fabiu na víkend. Idem na chatu.“', who: G.NAMES.exName || 'Ex', icon: '📵', opts: [
      { t: '„Nie.“', fx: { nervy: 3 }, say: 'Simona: „Som matka tvojho dieťaťa.“ Fabia je matka tvojho rozvozu.' },
      { t: 'Dať jej ju, mať pokoj', fx: { nervy: -5, money: -40 }, say: 'Vráti sa s prázdnou nádržou a novým škrabancom. Vždy.' },
      { t: '„Požičiam, ak vezmeš aj Bundáša.“', fx: { dad: 1, nervy: -2 }, say: 'Simona zložila. Bundáš je lepšia ochrana ako alarm.' },
    ], hangFx: { nervy: 5 }, hangSay: 'Zložil si. Píše: „Tak taxík. Zaplatíš ty.“' },
    nina_vola: { q: 'Katka: „Hej, kedy sa uvidíme? Minule si zaspal pri filme.“', who: 'Katka', icon: '💅', opts: [
      { t: '„Dnes večer? Po uspávaní.“', fx: { nervy: -4, energy: -5 }, say: 'Katka: „Takže o jedenástej. Romantika.“ Príde. Zaspíš.' },
      { t: '„Cez víkend, sľubujem.“', fx: { nervy: 2 }, say: 'Katka: „To si hovoril minulý víkend.“ Hovoril.' },
      { t: '„Príď do bistra na obed.“', fx: { nervy: 3, rep: 1 }, flag: 'ninaLunch', say: 'Katka: „Super, dám si ten tvoj rezeň.“ Hlavne nech nepríde ex.' },
    ], hangFx: { nervy: 4 }, hangSay: 'Zložil si Katke. Posiela emoji. Nie pekné.' },
    nina_ex: { q: 'Katka pri okne, ex pri pulte. Obe sa pozerajú na teba. Dana sa pozerá na obe. Nikto nedýcha.', opts: [
      { t: 'Predstaviť ich: „Katka, toto je… účtovníčka.“', fx: { nervy: 12, dad: -1 }, say: 'Simona: „Účtovníčka? S tými nechtami?“ Katka: „ÚČTOVNÍČKA?“ Prehral si dvakrát.' },
      { t: 'Zmiznúť do skladu a volať Wayanovi, nech ich obslúži', fx: { nervy: 10, rep: -2 }, say: 'Wayan im priniesol nasi goreng. Obom. Zadarmo. Zbohatol na prepitnom.' },
      { t: 'Požiarny poplach', fx: { nervy: 8, rep: -4, money: -30 }, say: 'Všetci vonku. Katka aj ex vedľa seba na chodníku. Teraz sa rozprávajú. O tebe.' },
    ] },
    nina_pise: { q: `Katka píše počas uspávania. Mobil svieti. ${KID}: „Tati, kto ti píše?“`, opts: [
      { t: 'Otočiť mobil a pokračovať', fx: { dad: 2, nervy: 2 }, say: 'Katka počká. Dieťa nepočká. Správne poradie.' },
      { t: 'Rýchlo odpísať srdiečko', run: coin(0.5, { fx: { nervy: -2 }, say: 'Nevšimla si to. Zaspala. Srdiečko odoslané.' }, { fx: { dad: -2, nervy: 6 }, say: `${KID}: „Prečo posielaš srdiečka? Mne pošli!“ Teraz je hore. Úplne.` }) },
      { t: 'Vypnúť mobil', fx: { dad: 1, focus: 3 }, say: 'Tma. Ticho. Katka ráno: „Ignoruješ ma?“ Spal si.' },
    ] },
    // ===== deň u Simony (striedavá starostlivosť) =====
    vanda_fotky: { q: `Simona (MMS): ${KID} objíma ${DOG}ov plyšák. Podpis: „Chýba jej pes. Nie ty.“`, who: 'Simona', icon: '📸', opts: [
      { t: '❤️ a „Daj jej pusu od tata“', fx: { dad: 1, nervy: -3 }, say: 'Simona: „Dám.“ Jedno slovo. Dnes to stačí.' },
      { t: '„Ten plyšák je Bundášov. Chcem ho späť.“', fx: { nervy: 3 }, say: `Simona: „Plyšák ostáva. Pes nech si ho príde vziať.“ ${DOG} by išiel.` },
      { t: 'Pozerať fotku 40× a neodpísať', fx: { focus: -6, dad: 1 }, say: 'Štyridsaťkrát. Potom screenshot. Potom tapeta. Neodpísal si.' },
    ] },
    videohovor: { q: `Simona: „${KID} chce vidieť tata. Máš dve minúty, potom kúpanie.“ Na displeji ružové čelo s fixkou.`, who: 'Simona', icon: '📹', opts: [
      { t: `Zdvihnúť. Grimasy, pesnička, ${DOG} do kamery.`, fx: { dad: 2, nervy: -5, time: 8 }, say: `${KID}: „Tati, ty máš smiešny nos!“ Dve minúty boli osem. Simona vzdychá mimo záber.` },
      { t: 'Zdvihnúť na minútu – „Tati pracuje.“', fx: { dad: 1, nervy: 1 }, say: `${KID}: „Tati, pápá.“ Mávala ešte, keď si už zložil.` },
      { t: '„Teraz fakt nemôžem.“', fx: { dad: -2, nervy: 6 }, say: `Simona: „Jasné.“ V pozadí: „Tati nechce?“ Chcel. Nestihol.` },
    ], hangFx: { dad: -2, nervy: 5 }, hangSay: `Zložil si videohovor. ${KID} videla sekundu tvojho ucha.` },
    vyzivne: { q: 'Simona: „Výživné?“ Jedno slovo. Otáznik. Je dvadsiateho druhého.', who: 'Simona', icon: '💶', opts: [
      { t: 'Poslať 250 € hneď', fx: { money: -250, nervy: -4, dad: 1 }, say: 'Odoslané. Simona: „Ďakujem.“ Bez otáznika. Zázrak.' },
      { t: '„Po výplate. Fakt.“', fx: { nervy: 8 }, pushId: 'vanda_vola_nahnevana', pushDelay: 40, say: 'Simona: „…“ Tri bodky. Tri bodky nikdy nie sú koniec.' },
      { t: '„Veď jej kupujem veci stále.“', fx: { nervy: 6, dad: -1 }, pushId: 'vanda_vola_nahnevana', pushDelay: 15, say: 'Simona: „Plyšák nie je výživné.“ Volá. Hneď.' },
    ] },
    vanda_nahnevana: { q: `Simona: „‚Po výplate‘?! ${KID} potrebuje topánky TERAZ. Nie po výplate. Nie ‚fakt‘.“`, who: 'Simona', icon: '📵', opts: [
      { t: 'Poslať 250 € (kapitulácia)', fx: { money: -250, nervy: -2 }, say: 'Odoslané. Simona: „Ďakujem.“ Stále to bolí rovnako.' },
      { t: 'Poslať 100 € a sľúbiť zvyšok', fx: { money: -100, nervy: 4 }, say: 'Simona: „Sľuby máš krajšie ako prevody.“ Zapísala si to. Niekam.' },
      { t: '„Topánky jej kúpim sám. Dnes.“', fx: { money: -45, nervy: 5, dad: 1 }, say: `Kúpil si tenisky so svetielkami. ${KID} nadšená. Simona: „Zlá veľkosť.“` },
    ], hangFx: { nervy: 8, dad: -1 }, hangSay: 'Zložil si Simone. Prichádza SMS s právničkou v kópii.' },
    timea_chce_domov: { q: `Simona: „${KID} plače už hodinu. Chce k tatovi. Nie, nerobím to naschvál.“ V pozadí: „TATIIII!“`, who: 'Simona', icon: '😭', opts: [
      { t: '„Idem po ňu. Desať minút.“', fx: { dad: 3, nervy: 5 }, pushId: 'timea_domov_cesta', pushDelay: 1, say: `Simona: „Dobre. Pyžamo má.“ ${KID} v pozadí prestala plakať. Zatiaľ.` },
      { t: `Upokojiť cez telefón: pesnička o ${DOGINS}`, fx: { dad: 1, nervy: 2, time: 6 }, say: `Tri slohy. ${KID} zaspala pri tretej. Simona: „Vďaka.“ Ticho. Nezvyk.` },
      { t: `„Zajtra, ${KID}. Dnes spinkaj u mamy.“`, fx: { dad: -2, nervy: 4 }, say: `${KID}: „Ale ja chceeeem…“ Simona zložila. Ty si ostal s tým ‚chceeeem‘.` },
    ], hangFx: { dad: -2, nervy: 6 }, hangSay: `Zložil si. ${KID} plače ďalej. Simona to napíše. Dlho.` },
    sam_doma_vecer: { q: `Večer bez ${KIDGEN}. Byt je ticho. Mozog nie. Čo teraz?`, icon: '🛋️', opts: [
      { t: 'Napísať Katke: „Si hore?“', run: coin(0.6, { fx: { nervy: -8, energy: -12 }, say: 'Katka prišla o desiatej. Odišla o jednej. Spal si štyri hodiny. Oplatilo sa.' }, { fx: { nervy: 4 }, say: 'Katka: „Spím.“ Nespí. Vidíš ju online.' }) },
      { t: 'Pivo s Dodom', fx: { money: -12, nervy: -6, energy: -8, focus: -5 }, say: 'Dodo: „Jedno.“ Štyri. Dodo vždy hovorí jedno.' },
      { t: 'Spať o 21:00 ako dôchodca', fx: { energy: 15, nervy: -5 }, say: 'Zaspal si o 21:10. Zobudil o 3:00. Mozog: „A čo tak premýšľať o roku 2014?“' },
      { t: 'Upratať. Všetko. Teraz.', fx: { focus: 10, energy: -8, nervy: -4 }, say: 'Byt sa leskne. Našiel si tri cumlíky, kľúč od niečoho a 7 €.' },
    ] },
    nina_vylet: { q: 'Katka: „Cez víkend výlet? Len my dvaja. Bez psa, bez dieťaťa, bez bistra.“', who: 'Katka', icon: '💅', opts: [
      { t: '„Tri podmienky, tri problémy.“', fx: { nervy: 3 }, say: 'Katka: „Takže nie.“ Nie, Katka. Nie.' },
      { t: '„Dobre, babka postráži.“', fx: { nervy: -6, dad: -2, money: -80 }, say: 'Babka súhlasila. Za 80 € na „výdavky“. Babka je podnikateľka.' },
      { t: '„Poď radšej s nami do zoo.“', fx: { dad: 1 }, say: `Katka: „So psom a dieťaťom?“ Ticho. „…dobre.“ Hm. Zaujímavé.` },
    ], hangFx: { nervy: 3 }, hangSay: 'Zložil si. „Zasa niečo horí?“ Áno. Vždy.' },
    nina_kokes: { q: `Katka: „${DOG} ma má radšej ako teba. Včera spal pri mne.“`, opts: [
      { t: '„Mal si pelech pri radiátore. Nie teba.“', fx: { nervy: 2 }, say: 'Katka: „Žiarliš na psa.“ Trochu.' },
      { t: '„Má dobrý vkus.“', fx: { nervy: -4 }, say: 'Katka posiela srdiečko. Bundáš posiela nič. Je to pes.' },
      { t: 'Poslať fotku Bundáša s tebou na gauči', fx: { dad: 0, focus: -3 }, say: 'Hľadal si fotku 6 minút. Katka už nepíše.' },
    ] },
    zamocnik_termin: { q: 'Zámočník: „Termín? Tak… štvrtok o dva týždne. Alebo dnes za príplatok.“', opts: [
      { t: 'Dnes za príplatok (−90 €)', fx: { money: -90 }, say: 'Prišiel za hodinu. Zámok mení 10 minút, kávu pije 40.' },
      { t: 'O dva týždne', fx: { nervy: 5 }, say: 'Dva týždne bez vecí Nelky. Dva týždne kúpených ponožiek.' },
      { t: 'Zavolať Katkinho brata (vraj to vie)', run: coin(0.5, { fx: { money: -20, nervy: -2 }, say: 'Katkin brat: 20 € a pivo. Zámok sedí. Trochu krivo.' }, { fx: { money: -110, nervy: 8 }, say: 'Katkin brat zlomil kľúč v zámku. Zámočník 110 €. Aj tak.' }) },
    ] },
    uctovnicka: { q: 'Účtovníčka Gabika: „Paťo, bločky za september. DNES. Daňové priznanie nie je pocit.“', who: 'Gabika', icon: '🧾', opts: [
      { t: '„Mám ich… v šanóne. Asi.“', fx: { nervy: 3 }, say: 'Gabika: „Asi. Vždy asi.“ Nájdi ich.' },
      { t: '„Pošlem fotky z mobilu.“', fx: { focus: -4, nervy: 2 }, say: 'Gabika: „Fotky bločkov z Fabie, kde vidno aj hranolku? Zase?“' },
      { t: 'Poprosiť Borisa o odklad', fx: { rep: -2 }, say: 'Boris: „Odklad? Čísla nečakajú, Paťo.“' },
    ], hangFx: { money: -40 }, hangSay: 'Zložil si účtovníčke. Faktúra za „nadštandardné urgovanie“: 40 €.' },
    dodavatel_ceny: { q: 'Dodávateľ: „Od pondelka olej +18 %, múka +12 %, kuracie +9 %.“', opts: [
      { t: 'Vyjednávať', run: coin(0.5, { fx: { money: 30, rep: 1 }, say: 'Zľava 5 % za vernosť. A za to, že si kričal.' }, { fx: { nervy: 5 }, say: '„Inflácia, pán Paťo.“ Inflácia je zrejme osoba.' }) },
      { t: 'Zdražiť menu o 50 centov', fx: { rep: -2, money: 40 }, say: 'Štamgast Ďuro: „Päťdesiat centov?! Za to som kedysi mal pivo.“ Nemal.' },
      { t: 'Hľadať nového dodávateľa', fx: { focus: -5, time: 10 }, say: 'Tri hovory, dva katalógy, nula rozhodnutí.' },
    ] },
    banka: { q: 'Banka: „Vaša karta bola z bezpečnostných dôvodov zablokovaná.“ Bezpečnosť pred čím? Pred nákupom cibule?', opts: [
      { t: 'Zavolať na linku (čakanie)', fx: { time: 12, nervy: 6 }, say: '„Ste 11. v poradí.“ Hudba. „Ste 9. v poradí.“ Odblokované.' },
      { t: 'Ísť do banky osobne', fx: { time: 20, nervy: 3 }, say: 'Lístok, čakanie, podpis, hotovo. Úradníčka: „Nabudúce cez appku.“' },
      { t: 'Platiť hotovosťou z pokladne bistra', fx: { rep: -2, focus: -3 }, say: 'Pokladňa plače. Gabika to zistí. Gabika zistí všetko.' },
    ] },
    najom: { q: 'Majiteľ priestorov: „Od januára nájom hore o 15 %. Trh, viete.“', who: 'Majiteľ', icon: '🏢', opts: [
      { t: 'Vyjednať 8 %', run: coin(0.5, { fx: { nervy: 3, rep: 1 }, say: '„Dobre, 10 %.“ Vyjednávanie po slovensky.' }, { fx: { nervy: 6 }, say: '„15 alebo hľadajte inde.“ Inde je drahšie.' }) },
      { t: 'Hodiť to na Borisa', fx: { rep: -1, nervy: -2 }, say: 'Boris: „Čísla, Paťo. Ukáž mi čísla.“ Nemáš čísla.' },
      { t: '„Dobre.“', fx: { nervy: 2, money: -50 }, say: 'Podpísané. Nečítal si to. Nikdy nečítaš.' },
    ], hangFx: { rep: -2, nervy: 4 }, hangSay: 'Zložil si majiteľovi. Mail príde do hodiny. S právnikom v kópii.' },
    mamaciapka: { q: `Babka: „Paťko, má ${KID} čiapku? Je 14 stupňov!“`, opts: [
      { t: '„Má, mami.“ (nemá)', fx: { dad: -1 }, say: 'Nemá. Babka to vie. Babka vie všetko.' },
      { t: 'Vrátiť sa po čiapku', fx: { time: 8, dad: 2 }, say: 'Čiapka s jednorožcom. Nelka ju okamžite zloží.' },
      { t: '„Mami, je október, nie Sibír.“', fx: { nervy: 2 }, say: 'Babka: „V októbri 1987 snežilo.“ Pravdepodobne.' },
    ] },
    nezname: { q: (q) => ['Neznáme číslo. Tretíkrát dnes. Zdvihneš?', 'Neznáme číslo, tentoraz zo zahraničia. Hm.', 'Neznáme číslo. Rovnaké ako včera. Trikrát.'][q.def.variant || 0], opts: [
      { t: 'Zdvihnúť', run: () => pick([{ fx: { nervy: 5 }, say: '„Dobrý deň, máme pre vás výhodnú ponuku elektriny…“ Zložil si.' }, { fx: { money: 60, nervy: -3 }, say: 'Objednávka cateringu na sobotu! Záloha 60 €. Hurá.' }, { fx: { nervy: 8 }, say: 'Exekútor. Omyl. Hľadali iného Paťa. Srdce stále buší.' }]) },
      { t: 'Nezdvihnúť', fx: { focus: 1 }, say: 'Nezdvihol si. Zavolá zajtra. Vždy zavolá zajtra.' },
      { t: 'Zablokovať', fx: { nervy: -2 }, say: 'Zablokované. Bola to škôlka z nového čísla. Zistíš to o týždeň.' },
    ] },
    kamos_fabia: { q: 'Dodo: „Požičaj Fabiu na sobotu. Sťahujem gauč.“', opts: [
      { t: '„Jasné, len s plnou.“', fx: { nervy: -2 }, say: 'Dodo vráti s rezervou a vôňou pizze. Ako vždy.' },
      { t: '„Mám rozvoz, Dodo.“', fx: { nervy: 1 }, say: 'Dodo: „V sobotu?!“ Áno, Dodo. Ľudia jedia aj v sobotu.' },
      { t: '„Pomôžem ti s gaučom, ale šoférujem ja.“', fx: { energy: -10, nervy: -5, dad: -1 }, say: 'Gauč sa nezmestil. Pivo áno.' },
    ] },
    kamos: { q: 'Dodo: „Pivko o 6? Len jedno!“', opts: [
      { t: 'Jasné, len jedno', fx: { nervy: -15, energy: -10, dad: -1 }, say: 'Len jedno. Hovorí každý. Vždy.' },
      { t: `Nemôžem, mám ${KIDACC}`, fx: { dad: 1, nervy: 2 }, say: 'Dodo: „Chápem, otecko.“ Posiela smutný smajlík.' },
      { t: 'Príď ty k nám', fx: { nervy: -8, dad: 1 }, say: `Dodo príde. ${KID} ho naučí kresliť jednorožce.` },
    ] },
    holic: { q: 'Holič Juro má voľný termín.', opts: [
      { t: 'Áno, objednaj ma (−15 €)', fx: { money: -15, rep: 1, nervy: -5 }, say: 'Aspoň brada bude mať v živote poriadok.' },
      { t: 'Nemám čas, brada počká', fx: { focus: -3 }, say: 'Brada čaká. A rastie. Má vlastné plány.' },
      { t: 'Ostrihám sa sám', run: coin(0.5, { fx: { nervy: -3 }, say: 'Vyzerá to… odvážne. Ako umenie.' }, { fx: { rep: -1, nervy: 4 }, say: 'Jedna strana kratšia. Šiltovka to zachráni.' }) },
    ] },
    zubar: { q: 'Zubárka: „Pán Paťo, preventívka. Dva roky ste neboli.“', opts: [
      { t: 'Objednať sa na budúci týždeň', fx: { focus: 2, nervy: 2 }, say: 'Objednaný. Už teraz ťa bolí zub, ktorý nebolel.' },
      { t: '„Zavolám ja.“', fx: { focus: -2 }, say: 'Nezavoláš. Zubárka to vie. Zapísala si „nezavolá“.' },
      { t: '„Mám bistro, nemám čas na zuby.“', fx: { nervy: -1 }, say: 'Zubárka: „Tak príďte, keď bude bolieť.“ Príde to.' },
    ] },
    babka_vola: { q: 'Babka: „Paťko, zjedol si niečo?“', opts: [
      { t: 'Trpezlivo počúvať', fx: { time: 10, nervy: -5, dad: 1 }, say: 'Dozvedel si sa všetko o susedkinom žlčníku.' },
      { t: 'Mami, zavolám ti neskôr', fx: { focus: -2 }, say: 'Nezavoláš. Obaja to viete.' },
      { t: `Postrážiš ${KIDACC} večer?`, run: coin(0.5, { fx: { nervy: -10 }, say: 'Babka: „Jasné! Aj buchty budú.“' }, { fx: { nervy: 3 }, say: 'Babka ide na zumbu. Má lepší spoločenský život ako ty.' }) },
    ] },
    mobil: { q: 'Hľadáš mobil. Všade. Prehľadal si vrecká. Dvakrát. Voláš naň z… mobilu. Ktorý držíš.', opts: [
      { t: 'Zasmiať sa', fx: { nervy: -3, focus: -2 }, say: 'Dana to videla. Bude to v skupinovom chate.' },
      { t: 'Tváriť sa, že si kontroloval, či funguje', fx: { focus: -3 }, say: 'Nikto neuveril. Ani ty.' },
      { t: 'Dať si kávu', fx: { focus: 8, nervy: 2 }, say: 'Káva nepomôže ADHD. Ale pomôže Paťovi.' },
    ] },
    kupil_ine: { q: 'Vo veľkoobchode. Zoznam: cibuľa, olej, obrúsky. V košíku: ananás, LED pásik, 3 kg mandarínok.', opts: [
      { t: 'Zaplatiť, čo je v košíku (−18 €)', fx: { money: -18, dad: 1 }, say: `${KID} bude milovať LED pásik. Cibuľu nie.` },
      { t: 'Vrátiť všetko a ísť podľa zoznamu', fx: { time: 10, focus: 3 }, say: 'Vrátené. Zoznam splnený. Mandarínky ti chýbajú.' },
      { t: 'Kúpiť aj to aj to (−42 €)', fx: { money: -42, nervy: -3 }, say: 'Kompromis po Paťovsky: všetko.' },
    ] },
    tiktok: { q: 'Otvoril si TikTok „len pozrieť recept“. Prešlo 10 minút. Vieš, ako sa strihá melón 14 spôsobmi.', opts: [
      { t: 'Ešte jedno video', fx: { time: 10, focus: -5, nervy: -2 }, say: 'Ešte jedno = ďalších 10 minút. Melón 15. spôsobom.' },
      { t: 'Odložiť mobil lícom dole', fx: { focus: 2 }, say: 'Mobil leží. Ty stojíš. Čo si to robil? Aha. Áno.' },
      { t: 'Poslať video Katke', fx: { focus: -3 }, say: 'Katka: „Toto je tvoj spôsob flirtu? Melón?“' },
    ] },
    zabudol_park: { q: 'Vyšiel si z budovy. Kde je Fabia? Vľavo? Vpravo? Parkoval si vôbec?', opts: [
      { t: 'Chodiť a stláčať kľúč', fx: { energy: -5, focus: -3 }, say: 'Píp-píp niekde za rohom. Alebo to bolo iné auto.' },
      { t: 'Logicky premýšľať', run: coin(0.5, { fx: { focus: 3 }, say: 'Aha. Pri pošte. Lebo si išiel na poštu. Génius.' }, { fx: { focus: -4, nervy: 4 }, say: 'Logika zlyhala. Choď naslepo.' }) },
      { t: 'Opýtať sa Bundáša', fx: { nervy: -2 }, say: 'Bundáš sa pozrel. Bez odpovede. Ale povzbudivo.' },
    ] },
    vylet_zoznam: { q: `Učiteľka: „Zoznam na výlet: desiata, pršiplášť, podpísaný súhlas. Do 8:30, prosím.“`, opts: [
      { t: '„Jasné, mám všetko.“ (nemáš)', fx: { nervy: 3 }, say: 'Nemáš. Máš 40 minút.' },
      { t: '„Môže ísť bez pršiplášťa?“', fx: { dad: -1 }, say: 'Učiteľka: „Prší.“ Pozrieš von. Prší.' },
      { t: 'Poprosiť babku, nech prinesie', run: coin(0.5, { fx: { nervy: -4, dad: 1 }, say: 'Babka prinesie. Aj buchty pre celú triedu.' }, { fx: { nervy: 5 }, say: 'Babka: „Som u kaderníčky, Paťko.“ Si na to sám.' }) },
    ] },
    kluc_batoh: { q: `${KID} má kľúč od nových zámkov v batohu. V škôlke. Batoh má 14 vreciek.`, opts: [
      { t: 'Prehľadať všetkých 14 vreciek', fx: { time: 6, nervy: 3 }, give: 'kluce_timea', say: 'Vrecko 13. Spolu s kameňom, perom a jednou pastelkou.' },
      { t: `Spýtať sa ${KIDGEN}`, run: coin(0.6, { give: 'kluce_timea', fx: { dad: 1 }, say: `${KID}: „Predsa v tom tajnom vrecku, tati!“ Samozrejme.` }, { fx: { time: 8, nervy: 4 }, give: 'kluce_timea', say: `${KID}: „Neviem.“ Vrecko 13.` }) },
      { t: 'Vysypať batoh na zem', fx: { dad: -1 }, give: 'kluce_timea', say: 'Kľúč nájdený. Učiteľka ťa sleduje. Prísne.' },
    ] },
    skolka_vola: { q: `Škôlka volá počas obeda. ${KID} plače, vraj ju bolí uško.`, opts: [
      { t: '„Idem hneď po obede.“', fx: { dad: 1, nervy: 4 }, say: 'Učiteľka: „Dobre, dáme jej čajík.“' },
      { t: 'Poslať babku', run: coin(0.6, { fx: { nervy: -3 }, say: 'Babka letí. S čiapkou.' }, { fx: { dad: -2, nervy: 6 }, say: 'Babka nedvíha. Zumba.' }) },
      { t: '„Dajte jej zajačika.“', fx: { dad: -1 }, say: 'Zajačik je doma. Ako vždy.' },
    ] },
  };

  // ---------- hľadanie kľúčov ----------
  const KEY_SPOTS = ['botnik', 'bunda', 'gauc', 'chladnicka', 'postel', 'linka', 'pelech', 'car'];
  const KEY_FAIL = {
    botnik: 'V botníku len jedna osamelá ponožka.',
    bunda: 'Vo vrecku: 3 bločky, žuvačka a piesok zo škôlky.',
    gauc: 'Pod gaučom: lego, chrumka, 20 centov.',
    chladnicka: 'Medzi jogurtmi nič… len plesnivý syr.',
    postel: 'Pod vankúšom nič. Len omrvinky.',
    linka: 'Na linke len včerajší hrnček.',
    pelech: `V pelechu len chlpy a polovica papuče. ${DOG} sa tvári nevinne.`,
    car: 'V aute nie. Logicky – ako by si ho odomkol.',
  };
  const KEY_FOUND = {
    chladnicka: '🔑 V CHLADNIČKE. Pri masle. Bez komentára.',
    botnik: `🔑 V topánke. ${KID} ich tam „uložila spinkať“.`,
    bunda: '🔑 V bunde. V tej, ktorú si už dvakrát prehľadal.',
    gauc: '🔑 Pod gaučom, medzi legom a chrumkou. Klasika.',
    postel: '🔑 Pod vankúšom. Spal si s nimi. Prečo?!',
    linka: '🔑 Na linke, v miske s cibuľou. Logické.',
    pelech: `🔑 V ${DOG === 'Bundáš' ? 'Bundášovom' : DOG + 'ovom'} pelechu. Oslintané.`,
    car: '🔑 V zapaľovaní. Celú noc. Dvere odomknuté. Bratislava je milá.',
  };
  const KEY_FOUND_BABKA = {
    chladnicka: '🔑 V chladničke. Babka: „Aby boli v chlade, Paťko.“',
    linka: '🔑 V dóze s múkou. Babka „upratala“. Múka všade.',
  };

  // ---------- prerušenia počas obeda ----------
  const LUNCH_INTERRUPTS = [
    { id: 'friteza', label: '🔥 Horí fritéza!', timeCost: 4, ignoreFx: { rep: -5, money: -60 }, ignoreSay: 'Fritéza dohorela sama. Aj so stropom.' },
    { id: 'skolka_vola', label: '📞 Volá škôlka!', timeCost: 4, ignoreFx: { dad: -3, nervy: 6 }, ignoreSay: `Škôlka volala 3×. ${KID} plakala. Učiteľka si to pamätá.` },
    { id: 'host_neplati', label: '🏃 Hosť uteká bez platenia!', timeCost: 4, ignoreFx: { money: -24 }, ignoreSay: 'Stôl 6 odišiel. S dezertom v ruke.' },
    { id: 'prud', label: '💡 Vypadol prúd!', timeCost: 5, ignoreFx: { rep: -4, money: -30 }, ignoreSay: 'Pol hodiny potme. Mrazák plače.' },
    { id: 'kokes_kuchyna', label: `🐕 ${DOG} v kuchyni!`, timeCost: 4, ignoreFx: { rep: -6 }, ignoreSay: `${DOG} zjedol dve porcie priamo z passu. Hosť to videl.` },
    { id: 'recenzent', label: '🧐 Recenzent pri stole 4!', timeCost: 4, ignoreFx: { rep: -8 }, ignoreSay: 'Recenzia: „Šéf nás ignoroval.“ Dve hviezdy.' },
    { id: 'ex_vola', label: '📵 Volá ex!', timeCost: 3, ignoreFx: { nervy: 6 }, ignoreSay: 'Simona: 9 zmeškaných. 1 hlasová správa. 4 minúty.' },
    { id: 'nina_pise', label: '💅 Katka píše „???“', timeCost: 3, ignoreFx: { nervy: 3 }, ignoreSay: 'Katka: „Takže ignoruješ.“' },
    { id: 'benji_rezal', label: '🩹 Honza sa porezal!', timeCost: 4, ignoreFx: { rep: -3, nervy: 4 }, ignoreSay: 'Honza: „Hele, to je v pohodě, jen krvácím.“ Nebolo to v pohode.' },
  ];

  // ---------- základ dňa ----------
  const BASE = {
    ranajky: {
      icon: '🥣', fam: 'base', title: `Raňajky pre ${KIDACC}`, forget: 150, reward: { dad: 2 },
      intrude: 'grab', grabWho: 'kid', grabText: `${KID} ťa ťahá za ruku: „Tati! Hladnááá!“`,
      forgetFx: { dad: -3, nervy: 10 }, forgetSay: `${KID} raňajkovala piškóty spod gauča.`,
      variants: [
        { notify: `${KID}: „Tatiii, kašu! Hladnááá!“`, steps: [hold('linka', 2.5, 'Uvariť kašu (drž E)'), go('kid', `Dať ${KIDDAT} kašu`, { say: `${KID} zjedla polovicu, zvyšok má vo vlasoch.` })] },
        { notify: `${KID}: „Palacinky! Dnes je palacinkový deň!“ (nie je)`, steps: [go('chladnicka', 'Vajcia a mlieko'), hold('linka', 4, 'Palacinky (drž E)', { say: 'Prvá palacinka na strop. Tradícia.' }), go('kid', `Dať ${KIDDAT} palacinky`, { say: `${KID}: „Nutelly málo!“ Nutelly je vždy málo.` })] },
        { notify: `${KID}: „Cereálie! S mliekom! Ružovou lyžičkou!“`, steps: [go('chladnicka', 'Mlieko', { say: 'Mlieko skyslo. Včera. Alebo minulý týždeň.' }), ch('mlieko', 'kid', 'Vyriešiť cereálie')] },
      ],
    },
    kluce: {
      icon: '🔑', fam: 'base', title: 'Kde sú kľúče?!', notify: 'Kľúče od Fabie nie sú vo vrecku…', noForget: true, reward: { nervy: -5 }, repeatable: true, intrude: 'none',
      onStart: (q, S) => {
        q.data.searchAt = S.keyAt || pick(KEY_SPOTS);
        q.data.searched = [];
      },
      steps: [{ type: 'search', spots: KEY_SPOTS, hold: 0.9, label: 'Prehľadať', give: 'kluce',
        found: (q, S) => (S.dayType === 'babka_navsteva' ? Object.assign({}, KEY_FOUND, KEY_FOUND_BABKA) : KEY_FOUND), fails: KEY_FAIL, foundLast: '🔑 Boli v ruke. Celý čas.' }],
    },
    kokes_vencenie: {
      icon: '🐕', fam: 'base', title: `Vyvenčiť ${DOGACC}`, forget: 90,
      intrude: 'grab', grabWho: 'dog', grabText: `${DOG} ti sadol na nohu. Pohľad: „VON. Hneď.“`,
      forgetFx: { nervy: 8, energy: -5 }, forgetSay: `${DOG} to vyriešil sám. Na koberci. Veľkoryso.`,
      onStart: (q) => { if (q.def.variant !== 2) dogSet('follow'); },
      variants: [
        { notify: `${DOG} tancuje pri dverách. Signál jasný.`, steps: [hold(['strom_byt', 'vybeh'], 2, `Rýchle cikanie pri strome (drž E)`, { need: { dog: true }, say: `${DOG} ocikal strom, kolesá Fabie a takmer teba.` })], reward: { dad: 1, nervy: -3 } },
        { notify: `${DOG} prináša vodítko. Chce poriadnu prechádzku.`, steps: [go('vybeh', 'Ísť do parku', { need: { dog: true } }), mini('dogWalk', 'vybeh', `Prechádzka s ${DOGINS}`, { need: { dog: true } })], reward: { nervy: -8, energy: -5, dad: 1 } },
        { notify: `Mláka pri dverách. ${DOG} sa tvári, že to bola ${KID}.`, steps: [hold('linka', 3, 'Utrieť mláku (drž E)', { say: 'Handra, dezinfekcia, nadávka. Ranná rutina.' })], reward: { nervy: -2 } },
      ],
    },
    rozvoz: {
      icon: '📦', fam: 'base', title: 'Rozvoz do výdajní', deadline: 11 * 60 + 30, noForget: true, reward: { rep: 4 }, intrude: 'sms', caller: 'Wayan',
      failFx: { rep: -8, nervy: 10 }, failSay: 'Výdajne otvorili bez jedla. Telefón nestíha zvoniť.',
      onStart: (q, S) => {
        q.data.outlets = S.deliveries.map(o => parseInt(String(o).replace('outlet_', ''), 10));
        q.data.delivered = [];
      },
      variants: [
        { notify: (q) => `Wayan: „Boxy sú na rampe, šéfe. Tvoje sú: ${q.data.outlets.map(outletName).join(', ')}.“`,
          steps: [hold('rampa', 3, 'Naložiť boxy do Fabie (drž E)', { give: 'jedlo', say: 'Štyridsať boxov. Fabia sedí na zadku.' }), { type: 'deliver', label: 'Rozviezť jedlo', need: { item: 'jedlo' }, take: 'jedlo' }] },
        { title: 'Rozvoz (Tomáš neprišiel)', caller: 'Peter', notify: 'Peter: „Tomáš zase nedvíha. Jeho prevádzky sú tvoje. Sorry, šéfe.“',
          steps: [hold('rampa', 3, 'Naložiť boxy – aj Tomášove (drž E)', { give: 'jedlo', say: 'Sedemdesiat boxov. Fabia prosí o milosť.' }), { type: 'deliver', label: 'Rozviezť jedlo', need: { item: 'jedlo' }, take: 'jedlo' }] },
      ],
    },
    skolka: {
      icon: '🏫', fam: 'base', title: `Odviesť ${KIDACC} do škôlky`, notify: 'Škôlka začína o 09:00. Teoreticky.', noForget: true, intrude: 'none',
      deadline: (q, S) => (S.dayType === 'zaspal' ? 10 * 60 : 9 * 60),
      steps: [
        ch('topanky', 'kid', `Obuť ${KIDACC}`, { onDone: () => kidFollow() }),
        go('satna', `Odovzdať ${KIDACC} v šatni`, { need: { kid: true }, say: 'Pusa, pápa, mávanie cez okno. Trikrát.',
          onDone: (q, S) => { kidSet('skolka'); S.flags.kidAtSkolka = true; if (rand() < 0.4) S.pending.push({ t: 6, id: 'zajacik' }); } }),
      ],
      reward: { dad: 3 },
      failFx: { nervy: 15, dad: -2 }, failSay: 'Pani učiteľka sa mračí. Meškáš.',
    },
    timea_s_tebou: {
      icon: '👧', fam: 'base', title: `${KID} ide dnes všade s tebou`, noForget: true, reward: { dad: 3 }, intrude: 'grab', grabWho: 'kid',
      notify: (q, S) => (S.dayType === 'timea_chora' ? `${KID} má 37,9. Škôlka odpadá. Ide s tebou. Všade.` : `Víkend. Škôlka zavretá. ${KID}: „Idem do bistra!“`),
      steps: [go('kid', `Obliecť ${KIDACC}`, { onDone: () => kidFollow(), say: `${KID} si vybrala kostým jednorožca. Diskusia skončila.` })],
    },
    timea_k_babke: {
      icon: '👵', fam: 'base', title: `Odviezť ${KIDACC} k babke`, notify: 'Babka: „Doveď mi ju, upečiem buchty.“ Víkendová klasika.', noForget: true, deadline: 10 * 60, intrude: 'call', caller: 'Babka',
      steps: [
        go('kid', `Obliecť ${KIDACC}`, { onDone: () => kidFollow() }),
        go('babka', `Odovzdať ${KIDACC} babke`, { need: { kid: true }, say: 'Babka: „Čiapku nemá?!“ Nemá.',
          onDone: (q, S) => { kidSet('skolka'); S.flags.kidAtBabka = true; const k = kid(), p = hsPos('babka'); if (k && p) { k.x = p.x; k.z = p.z; } } }),
      ],
      reward: { dad: 2, nervy: -4 }, failFx: { nervy: 8 }, failSay: 'Babka volá: „Buchty vychladli.“',
    },
    kokes_logistika: {
      icon: '🐕', fam: 'kokes', title: `${DOG} nemôže byť v bistre cez obed`, notify: `Hygiena, zdravý rozum a Dana: ${DOG} musí pred obedom domov alebo do kuchyne k Petrovi.`, intrude: 'sms', caller: 'Dana',
      cond: () => dogWithMe(), deadline: (q, S) => S.lunchAt - 5, removeOnFail: true,
      steps: [go(['pelech', 'rampa'], `Nechať ${DOGACC} doma / v kuchyni`, { need: { dog: true }, onDone: (q, S) => { S.flags.dogParked = true; } })],
      reward: { nervy: -3 }, failFx: { rep: -5, nervy: 6 }, failSay: `${DOG} bol v bistre cez obed. Hosť so psou alergiou kýchal do polievky.`,
      onFail: (q, S) => { S.flags.dogInLunch = true; },
    },
    spicka: {
      icon: '🔥', fam: 'base', title: 'OBEDOVÁ ŠPIČKA!', deadlineRel: 100, removeOnFail: true, noForget: true, intrude: 'popup', caller: 'Dana',
      failFx: { rep: -12, nervy: 15 }, failSay: 'Zákazníci odišli hladní. Google recenzie horia.',
      onStart: (q, S) => {
        const pool = LUNCH_INTERRUPTS.filter(li => !(li.id === 'skolka_vola' && !S.flags.kidAtSkolka) && !(li.id === 'kokes_kuchyna' && !(S.flags.dogInLunch || (dog() && dog().state === 'kuchyna'))));
        const n = ri(2, 4);
        q.data.interrupts = shuffle(pool).slice(0, n);
        if (S.flags.dogInLunch && !q.data.interrupts.some(i => i.id === 'kokes_kuchyna')) q.data.interrupts[0] = LUNCH_INTERRUPTS.find(i => i.id === 'kokes_kuchyna');
        S.lunchInterruptIds = q.data.interrupts.map(i => i.id);
        S.lunchInterrupts = q.data.interrupts.length;
      },
      variants: [
        { notify: 'Bistro je plné. Všetci chcú jesť. Hneď.', steps: [mini('cook', 'sporak', 'Variť! (sporák)', { total: (q, S) => (S.flags.helper ? 8 : S.flags.alone ? 10 : 9) - (S.dayType === 'dazd' ? 2 : 0) + (S.dayType === 'futbal' ? 1 : 0) })] },
        { title: 'OBED + CATERING NARAZ', notify: 'Obed je plný a Hanka: „Tých 40 obedov pre firmu je dnes, nie zajtra!“', steps: [mini('cook', 'sporak', 'Variť všetko! (sporák)', { total: 14 })], reward: { money: 120, rep: 3 } },
        { title: 'OBED: Dana sama', notify: 'Lenka nedvíha. Dana: „Som tu sama a je tu 30 ľudí. PAŤO!“', onStart: (q, S) => { S.flags.alone = true; BASE.spicka.onStart(q, S); }, steps: [mini('cook', 'sporak', 'Variť a roznášať! (sporák)', { total: 10 })], reward: { nervy: 5 } },
        { id: 'spicka_kuchyna', title: 'Obed z kuchyne – výdajne čakajú', caller: 'Wayan', notify: 'Bistro je zatvorené, ale 12 výdajní má otvorené. Wayan: „Šéfe, pass. Teraz.“', steps: [mini('cook', 'pass', 'Variť pre výdajne! (pass)', { total: 9 })], failSay: 'Výdajne dostali jedlo o tretej. Studené. Boris má nový Excel: sťažnosti.' },
        { id: 'spicka_studena', title: 'Obed zo studenej kuchyne', caller: 'Tunde', notify: 'Plyn nejde. Tunde: „Boss, cold kitchen. Salads. Sandwiches. Tears.“ Sedem objednávok, bez plameňa.', steps: [mini('cook', 'pass', 'Studená kuchyňa! (pass)', { total: 7 })], reward: { nervy: 3 }, failSay: 'Ani šaláty. Hostia odišli do kebabu oproti. Kebab ďakuje.' },
      ],
    },
    vyzdvihnut: {
      icon: '🧸', fam: 'base', title: `Vyzdvihnúť ${KIDACC}`, noForget: true, reward: { dad: 4 },
      intrude: 'call', caller: (q, S) => (S.flags.kidAtBabka ? 'Babka' : (G.NAMES.teacher || 'pani učiteľka')),
      deadline: (q, S) => (S.flags.kidAtBabka ? 18 * 60 + 30 : 16 * 60 + 30),
      failFx: { dad: -5, nervy: 20 }, failSay: (q, S) => (S.flags.kidAtBabka ? 'Babka: „Už aj zaspala. Ty si otec, alebo turista?“' : `Pani učiteľka čaká s ${KIDINS} na lavičke. A s pohľadom.`),
      notify: (q, S) => (S.flags.kidAtBabka ? 'Babka: „Kedy po ňu prídeš? Mám o siedmej seriál.“' : 'Škôlka zatvára o 16:30.'),
      steps: [
        { type: 'go', at: (q, S) => (S.flags.kidAtBabka ? 'babka' : 'satna'), label: `Vyzdvihnúť ${KIDACC}`, onDone: () => kidFollow(), say: `${KID}: „Tatiii! Nakreslila som ťa!“ Máš tri ruky a Fabiu na hlave.` },
        go('postielka', `Doviesť ${KIDACC} domov`, { need: { kid: true }, onDone: () => kidSet('home') }),
      ],
    },
    uspavanie: {
      icon: '🌙', fam: 'base', title: 'Uspávanie', notify: `${KID}: „Tati, rozprávku!“`, noForget: true,
      intrude: 'grab', grabWho: 'kid', grabText: `${KID} ťa ťahá za ruku k postieľke: „Rozprávku! Teraz!“`,
      steps: [ch('rozpravka', 'kid', 'Vybrať rozprávku'), hold('kid', 4, 'Uspávať (drž E)', { say: 'Zaspala. Ty takmer tiež.' })],
      reward: { dad: 5, nervy: -15 },
    },
    tankovanie: {
      icon: '⛽', fam: 'base', title: 'Svieti rezerva', notify: 'Fabia: *píp* – rezerva!', repeatable: true, forget: 200, intrude: 'none',
      steps: [
        mini('tank', ['stojan1', 'stojan2'], 'Natankovať', { need: { carNear: 14 } }),
        { type: 'pay', at: 'pokladna', label: 'Zaplatiť za benzín' },
      ],
      forgetFx: (q) => (q.step >= 1 ? { money: -120 } : { focus: -2 }),
      forgetSay: (q) => (q.step >= 1 ? 'Odišiel si bez zaplatenia. Kamery. Pokuta.' : 'Rezerva svieti ďalej. Fabia to nesie statočne.'),
      onEnd: (q, S) => { if (!q.finished) S.cool.fuelTrig = S.rt + 90; },
    },
    zajacik: {
      icon: '🐰', fam: 'timea', title: 'Zajačik ostal doma!', notify: `Učiteľka: „${KID} plače, chce zajačika.“`, forget: 150, intrude: 'call',
      steps: [
        go('postielka', 'Vziať zajačika z postieľky', { give: 'zajacik', say: 'Zajačik. Trochu ucintaný, ale milovaný.' }),
        go('satna', `Dať zajačika ${KIDDAT}`, { need: { item: 'zajacik' }, take: 'zajacik', say: 'Slzy prestali. Si hrdina dňa.' }),
      ],
      reward: { dad: 4, nervy: -5 },
      forgetFx: { dad: -4 }, forgetSay: `${KID} bola celý deň smutná. Zajačik doma tiež.`,
    },
    timea_u_vandy: {
      // ranná info položka na deň u Simony: bez krokov → dokončí sa hneď; finish() pridáva +6 focus, preto tu focus −1 (netto +5)
      icon: '👧', fam: 'base', title: `${KID} je dnes u Simony`, notify: `Dnes je ${KID} u Simony. V byte je ticho. Podozrivé ticho.`, intrude: 'none', noForget: true,
      steps: [], reward: { focus: -1, nervy: -3 },
    },
    hyperfokus_sklad: {
      icon: '🧹', fam: 'adhd', title: 'Upratať sklad. TERAZ.', notify: 'Vošiel si do skladu po cibuľu. Regál je krivý. Musíš. Všetko. Zoradiť.', intrude: 'none',
      forget: 60, steps: [hold('regal', 8, 'Upratať sklad (drž E – podľa farieb!)', { say: 'Sklad je dokonalý. Obed je za 20 minút. Oplatilo sa? Nie. Bolo to krásne? Áno.' })],
      reward: { focus: 25, nervy: -10, time: 10 }, forgetFx: { focus: 2 }, forgetSay: 'Sklad ostal krivý. Prežije to.',
    },
  };

  // ---------- POOL: náhodné udalosti ----------
  const W = (a, b) => [a, b];
  const P = (o) => { POOL.push(o); };

  // ===== Bistro / kuchyňa =====
  P({ id: 'prud', fam: 'bistro', icon: '💡', title: 'Vypadol prúd!', win: W(9, 16), w: 3, dayW: { dazd: 1.6, kontrola: 0.6 },
    deadlineRel: 25, removeOnFail: true, failFx: { rep: -10, money: -90 }, failSay: 'Box sa ohrial na 14 °C. Mäso do koša. 90 € preč a Dana servíruje šaláty.',
    onStart: (q, S) => { S.powerOut = true; }, onEnd: (q, S) => { S.powerOut = false; },
    steps: [hold('box', 3, 'Preložiť mäso do mrazáku v kuchyni (drž E)', { say: 'Dvadsať kíl mäsa v náručí cez dvor. Kardio.' }), ph('elektrikar', 'Zavolať elektrikára', true)],
    reward: { rep: 2, nervy: -4 },
    variants: [{ notify: 'Cvak. Tma. Chladiaci box pípa. Dana: „Šéfe, nefunguje kasa!“' }, { notify: 'Pred bistrom kopú. Prekopli kábel. Kopáč: „Hups.“' }],
    chain: [{ id: 'joff_cisla', p: 0.3, delay: 90, on: 'fail' }] });
  P({ id: 'friteza_hori', intrude: 'popup', caller: (q) => (q.def.variant === 1 ? 'Honza' : 'Lenka'), fam: 'bistro', icon: '🔥', title: 'HORÍ FRITÉZA!', win: W(10.5, 14.5), w: 2.5, dayW: { futbal: 1.5 },
    deadlineRel: 12, removeOnFail: true, failFx: { rep: -20, nervy: 20 }, failSay: 'Hasiči, dym, zatvorené do zajtra. Rep −20. Kurnik.',
    onFail: (q, S) => { S.bistroClosed = true; setNpc('tamara', { visible: false }); },
    steps: [hold('hasiak', 1.5, 'Hasiak! Je v kufri Fabie! (drž E)', { give: 'hasiak', say: 'Hasiak pod rezervou, pod dekou, pod zajačikom. Samozrejme.' }), hold('friteza', 2, 'HASIŤ! (drž E)', { need: { item: 'hasiak' }, take: 'hasiak', say: 'Pena všade. Hranolky dnes nebudú. Strop prežil.' })],
    reward: { rep: 3, nervy: -5 },
    variants: [{ notify: 'Lenka kričí: „HORÍ! FRITÉZA! PAŤO!“ Hasiak je… v aute. Prečo je v aute?!' }, { notify: 'Honza: „Šéfe, hele, ta fritéza nějak hoří.“ NĚJAK?!' }] });
  P({ id: 'odtok', fam: 'bistro', icon: '🚰', title: 'Upchatý odtok', win: W(8, 17), w: 2, dayW: { kontrola: 1.5 }, forget: 120,
    steps: [hold('sporak', 3, 'Pozrieť, čo je v odtoku (drž E)', { say: 'Olej, ryža, jedna lyžička a niečo, čo bolo kedysi mrkva.' }), ch('instalater', ['sporak', 'pult'], 'Vyriešiť odtok')],
    reward: { rep: 1 }, forgetFx: { rep: -4, money: -70 }, forgetSay: 'Voda v kuchyni po členky. Inštalatér v noci: 70 € + príplatok.',
    variants: [{ notify: 'Tunde: „Boss, umývadlo nejde dole. Vôbec.“' }, { notify: 'Wayan: „Šéfe, z odtoku bublá. A smrdí. Veľmi.“' }] });
  P({ id: 'agus_prst', fam: 'bistro', icon: '🩸', title: 'Porezaný prst', win: W(9, 15), w: 2, dayW: { kontrola: 0.7 }, noForget: true, deadlineRel: 60,
    onStart: (q, S) => { S.flags.alone = true; },
    steps: [hold((q) => q.data.who, 2, 'Obviazať ranu (drž E)', { say: 'Utierka, páska, odvaha. Krv tečie ďalej.' }), drive('pohotovost', 'Odviezť ho na pohotovosť'), hold('lekaren', 2, 'Odovzdať na pohotovosti (drž E)', { say: 'Sestrička: „Kuchár? Zase?“ Štyri stehy.' })],
    reward: { rep: 3, dad: 1 }, failFx: { rep: -6, nervy: 10 }, failSay: 'Odviezol ho Peter. Dodávkou. S polievkou. Hanba.',
    variants: [{ notify: 'Wayan: „Šéfe… prst. Veľa krvi. Nasi goreng dnes nebude.“', onStart: (q, S) => { q.data.who = 'agus'; S.flags.alone = true; } },
      { notify: 'Santi: „Jefe! El dedo! Mucha sangre!“ Veľa krvi, rozumieš aj po španielsky.', onStart: (q, S) => { q.data.who = 'fredy'; S.flags.alone = true; } }] });
  P({ id: 'alergik', intrude: 'popup', fam: 'bistro', icon: '🥜', title: 'Alergik pri stole 3', win: W(11.5, 14.5), w: 2, dayW: {}, deadlineRel: 35, removeOnFail: true,
    steps: [go('lekaren', 'Kúpiť antihistaminikum', { fx: { money: -12 }, give: 'liek', say: 'Lekárnička: „Pre koho?“ „Pre hosťa.“ Pozrela sa zvláštne.' }), go('pult', 'Dať hosťovi liek', { need: { item: 'liek' }, take: 'liek', say: 'Hosť: „Ďakujem. Mimochodom, ten sambal bol výborný.“ Sambal ho skoro zabil.' })],
    reward: { rep: 4, nervy: -3 }, failFx: { rep: -12, money: -200 }, failSay: 'Sanitka pred bistrom. Hosť prežil. Tvoja povesť nie. 200 € odškodné.',
    variants: [{ notify: 'Dana: „Hosť opuchá! Vraj arašidy v omáčke!“ V omáčke sú arašidy. Je to satay.' }, { notify: 'Honza: „Šéfe, ten pán říkal, že arašídy jsou v pohodě.“ Nie sú v pohodě!' }] });
  P({ id: 'host_neplati', intrude: 'popup', fam: 'bistro', icon: '🏃', title: 'Hosť bez platenia', win: W(11.5, 15), w: 2, dayW: { futbal: 1.5, vyplata: 1.5 }, forget: 30,
    steps: [ch('hostneplati', 'pult', 'Čo s tým?')], forgetFx: { money: -24 }, forgetSay: 'Preč. S účtom 24 €.',
    variants: [{ notify: 'Lenka: „Šestka odišla! Bez platenia! Mal dva rezne!“' }, { notify: 'Dana: „Pán z dvojky išiel ‚na cigaretu‘. Pred dvadsiatimi minútami.“' }] });
  P({ id: 'recenzent', intrude: 'popup', fam: 'bistro', icon: '🧐', title: 'Tajný recenzent', win: W(11, 14), w: 2, dayW: { kontrola: 1.5 }, forget: 40,
    steps: [ch('recenzent', 'pult', 'Pozrieť sa na stôl 4')], forgetFx: { rep: -5 }, forgetSay: 'Recenzia: „Dlho sme čakali, šéfa sme nevideli.“ Tri hviezdy.',
    chain: [{ id: 'joff_cisla', p: 0.4, delay: 90 }],
    variants: [{ notify: 'Dana šepká: „Stôl 4. Fotí tanier zo štyroch strán. RECENZENT.“' }, { notify: 'Lenka: „Ten pán má zápisník. ZÁPISNÍK, Paťo.“' }] });
  P({ id: 'catering', fam: 'bistro', icon: '🍱', title: 'Catering 40 obedov – DNES', win: W(8, 10.5), w: 1.6, dayW: { zaspal: 1.5, vyplata: 1.3 }, deadline: 13 * 60, noForget: true, removeOnFail: true,
    steps: [hold('box', 2, 'Vybrať suroviny na 40 porcií (drž E)'), mini('cook', 'sporak', 'Navariť catering (sporák)', { total: 14 }), hold('rampa', 2, 'Naložiť catering (drž E)', { say: 'Štyridsať krabičiek. Peter odváža. Zvládli ste to. Ako?!' })],
    reward: { money: 380, rep: 5 }, failFx: { rep: -15, money: -150 }, failSay: 'Firma zrušila. Zmluvná pokuta 150 €. Hanka mlčí. To je horšie ako krik.',
    variants: [{ notify: 'Hanka: „Paťo, catering pre IT firmu. 40 obedov. DNES do 13:00. Bolo to v maili.“ Nebolo. Bolo.' }, { notify: 'Boris: „Catering na 40 ľudí, dnes obed. Potvrdil som to. Včera. Tebe.“ Nepotvrdil.' }] });
  P({ id: 'fredy_neprisiel', intrude: 'sms', fam: 'bistro', icon: '🇨🇴', title: 'Santi neprišiel', win: W(7, 10), w: 2, dayW: { zaspal: 1.5 }, forget: 120,
    steps: [ph('zastup', 'Vyriešiť zástup', true)], forgetFx: { rep: -6, nervy: 6 }, forgetSay: 'Obed varili traja namiesto štyroch. Wayan ťa preklial po balijsky.',
    variants: [{ notify: 'Santi (SMS): „Jefe, zomrela mi babka. Nemôžem prísť.“ Tretia babka tento rok.' }, { notify: 'Santi (SMS): „Dnes je kolumbijský sviatok, jefe. Dôležitý.“ Google: nie je.' }] });
  P({ id: 'plyn', fam: 'bistro', icon: '🔥', title: 'Plyn nejde', win: W(9, 13), w: 1.6, dayW: {}, deadlineRel: 40, removeOnFail: true,
    onStart: (q, S) => { S.gasOut = true; }, onEnd: (q, S) => { S.gasOut = false; },
    steps: [hold('sporak', 2, 'Skúsiť zapáliť sporák (drž E)', { say: 'Cvak. Cvak. Cvak. Nič. Ani plamienok.' }), ph('plynari', 'Vyriešiť plyn')],
    reward: { rep: 2 }, failFx: { rep: -8, nervy: 8 }, failSay: 'Obed zo studenej kuchyne. „Šalát ako hlavné jedlo?“ Áno. Dnes áno.', onFail: (q, S) => { S.flags.coldKitchen = true; },
    variants: [{ notify: 'Tunde: „Boss, no fire. No gas. No jollof.“' }, { notify: 'Santi: „Jefe, sporák je mŕtvy. Muerto.“' }] });
  P({ id: 'macka', fam: 'bistro', icon: '🐈', title: 'Mačka v kuchyni', win: W(8, 17), w: 1.5, dayW: { kontrola: 2 }, forget: 50,
    steps: [hold('pass', 2, 'Vyhnať mačku (drž E)', { say: 'Mačka odišla. Dôstojne. S kúskom kuraťa.' })],
    reward: { nervy: -2 }, forgetFx: { rep: -3 }, forgetSay: 'Mačka spala na passe hodinu. Hosť to odfotil.',
    chain: [{ id: 'hygiena', p: 0.2, delay: 60 }],
    variants: [{ notify: 'Honza: „Šéfe, v kuchyni je kočka. Sedí na passu. Kouká na mě.“' }, { notify: `Wayan: „Šéfe, mačka! A ${DOG} ju naháňa po kuchyni!“ Kombo.` }] });
  P({ id: 'ayo_benji_hadka', fam: 'bistro', icon: '🥊', title: 'Tunde vs. Honza', win: W(9, 16), w: 1.6, dayW: { vyplata: 1.5 }, forget: 60,
    steps: [ch('hadka', ['ayo', 'benji'], 'Urovnať hádku')], forgetFx: { rep: -3, nervy: 4 }, forgetSay: 'Hádka prerástla do ticha. Ticho v kuchyni je horšie ako krik.',
    variants: [{ notify: 'Z kuchyne krik. Tunde: „Who ate my arepa?!“ Honza: „Já to nebyl!“' }, { notify: 'Honza: „Šéfe, Tunde mi vzal nůž.“ Tunde: „It is MY knife!“ Je to tvoj nôž.' }] });
  P({ id: 'tamara_lucia', fam: 'bistro', icon: '📅', title: 'Dana vs. Lenka: zmeny', win: W(8, 17), w: 1.5, dayW: { futbal: 1.4 }, forget: 90,
    steps: [ch('zmeny', ['tamara', 'lucia'], 'Rozhodnúť o zmenách')], forgetFx: { rep: -2, nervy: 5 }, forgetSay: 'Rozpis zmien spravila Dana. Lenka nemá žiadnu. Lenka nepríde.',
    variants: [{ notify: 'Dana: „Lenka má ZASE víkend voľný?!“ Lenka: „TY si mala minulý!“' }, { notify: 'Lenka (SMS): „Buď ja, alebo Dana v sobotu. Rozhodni.“' }] });
  P({ id: 'obaly', fam: 'bistro', icon: '📦', title: 'Chýbajú obaly na rozvoz', win: W(7.5, 10), w: 2, dayW: { zaspal: 1.4 }, forget: 120,
    steps: [go('vo_pokladna', 'Kúpiť obaly vo veľkoobchode', { fx: { money: -48 }, give: 'obaly', say: 'Päťsto krabičiek. Fabia je plná polystyrénu.' }), go('rampa', 'Priviezť obaly do kuchyne', { need: { item: 'obaly' }, take: 'obaly' })],
    reward: { rep: 2 }, forgetFx: { money: -30, rep: -3 }, forgetSay: 'Jedlo išlo v alobale. Výdajne: „Čo je toto?!“',
    variants: [{ notify: 'Peter: „Šéfe, máme 12 krabičiek a 400 porcií. Matematika nesedí.“' }, { notify: 'Wayan: „Obaly? Žiadne. Honza vraj objednal.“ Honza: „Já? To ne.“' }] });
  P({ id: 'zla_dodavka', fam: 'bistro', icon: '🚚', title: 'Zlá dodávka', win: W(8, 13), w: 2, dayW: {}, forget: 140,
    steps: [hold('rampa', 2, 'Vyložiť tovar (drž E)'), ph('reklamacia', 'Reklamovať'), go('sanon', 'Založiť dodací list do šanónu', { say: 'Šanón praská. Ako tvoje nervy.' })],
    reward: { rep: 2 }, forgetFx: { money: -90 }, forgetSay: 'Šofér odišiel aj s tovarom. A účtoval prestoj.',
    variants: [{ notify: 'Šofér: „Šéfe, som pri rampe.“ Objednal si prsia. Priviezli krídla. 20 kíl.' }, { notify: 'Šofér: „Štyridsať kíl zemiakov.“ Objednal si štyri. Jedna nula navyše.' }, { notify: 'Dodávka mrazeného. Objednal si čerstvé. Santi: „Mrazené arepas? Nunca!“' }] });
  P({ id: 'zelenina', fam: 'bistro', icon: '🥕', title: 'Došla zelenina', win: W(8, 14), w: 2.5, dayW: {}, forget: 160,
    steps: [go('vo_zelenina', 'Nabrať zeleninu', { say: 'Cibuľa, mrkva, paprika. A jedna tekvica, lebo bola pekná.' }), pay('vo_pokladna', 64, 'Zaplatiť', { give: 'zelenina' }), go('regal', 'Uložiť zeleninu do skladu', { need: { item: 'zelenina' }, take: 'zelenina' })],
    reward: { rep: 3 }, forgetFx: { rep: -4 }, forgetSay: 'Guláš bez cibule. Wayan to nikdy neodpustí.',
    chain: [{ id: 'recenzent', p: 0.3, delay: 60, on: 'forget' }],
    variants: [{ notify: 'Wayan: „Šéfe, nemáme ani cibuľu! Ako mám robiť nasi goreng bez cibule?!“' }, { notify: 'Tunde: „Boss, no rice, no tomatoes. Jollof is cancelled.“ Jollof je zrušený.' }, { notify: 'Honza: „Hele šéfe, zelenina došla. Úplně. Ani mrkev.“' }] });
  P({ id: 'hygiena', fam: 'bistro', icon: '🧪', title: 'Kontrola z hygieny!', win: W(9.5, 16), w: 1.2, dayW: { kontrola: 4, dazd: 0.7 }, deadlineRel: 70, removeOnFail: true, noForget: true,
    steps: [hold('regal', 3, 'Upratať regál v sklade (drž E)'), hold('box', 2, 'Označiť dátumy (drž E)', { say: 'Jogurt z marca ide preč. Pokoj jeho duši.' }), go('pult', 'Odpratať hrnček kávy z pultu', { say: 'Hrnček s nápisom „Najlepší tatino“ zachránený.' })],
    reward: { rep: 6, nervy: -5 }, failFx: { rep: -15, money: -150 }, failSay: 'Hygiena našla tvoj hrnček. A dátumy. Pokuta 150 €.',
    variants: [{ intrude: 'call', notify: 'Sused: „Hygiena je na ulici, ide k tebe!“' }, { intrude: 'sms', notify: 'Peter (SMS): „Dve ženské v bielom pri kuchyni. Majú zložky. Utekám.“' }] });
  P({ id: 'danova', fam: 'bistro', icon: '🧾', title: 'Daňová kontrola', win: W(9, 15), w: 0.9, dayW: { kontrola: 4, vyplata: 1.5 }, deadlineRel: 60, removeOnFail: true, noForget: true,
    steps: [hold('sanon', 3, 'Nájsť bločky a faktúry (drž E)', { say: 'Bločky sú v šanóne. Aj účtenka z McDonaldu 2019.' }), hold('notebook', 2, 'Vytlačiť uzávierky (drž E)', { say: 'Tlačiareň má papier. Zázrak dňa.' }), go('joff', 'Odovzdať podklady Borisovi', { say: 'Boris: „Toto je… všetko?“ Áno. Bohužiaľ.' })],
    reward: { rep: 4, nervy: -5 }, failFx: { money: -300, rep: -8 }, failSay: 'Daňováci našli 3 tržby bez bločku. Pokuta 300 €. Boris nehovorí.',
    variants: [{ notify: 'Boris: „Paťo, sú tu z daňového. Chcú tržby za kvartál. HNEĎ.“' }, { notify: 'Dvaja v sakách pri pulte. „Finančná správa. Kto je zodpovedná osoba?“ Všetci ukazujú na teba.' }] });
  P({ id: 'inspektorat', fam: 'bistro', icon: '👷', title: 'Inšpektorát práce', win: W(9, 15), w: 0.9, dayW: { kontrola: 4 }, deadlineRel: 60, removeOnFail: true, noForget: true,
    steps: [hold('notebook', 2, 'Vytlačiť dochádzku (drž E)', { say: 'Dochádzka sedí. Približne. Umelecky.' }), ch('hadka', ['agus', 'ayo'], 'Upokojiť kuchyňu pred kontrolou')],
    reward: { rep: 3 }, failFx: { money: -250, rep: -6 }, failSay: 'Honza pracoval „na skúšku“ už tretí mesiac. Pokuta 250 €.',
    variants: [{ notify: 'Hanka: „Inšpektorát práce je v kuchyni. Sú zmluvy v poriadku?“ Sú. Väčšinou.' }, { notify: 'Honza: „Šéfe, nějaká paní se ptá, jestli mám smlouvu. Mám smlouvu?“ Máš. Niekde.' }] });
  P({ id: 'joff_cisla', intrude: 'call', fam: 'bistro', icon: '📊', title: 'Boris volá: „Čo tie čísla?“', win: W(8, 18), w: 2.5, dayW: { vyplata: 2, zaspal: 1.6 }, forget: 60,
    steps: [ph('joff', 'Zdvihnúť Borisovi', true)], forgetFx: { rep: -4 }, forgetSay: 'Boris: 4 zmeškané. Mail s predmetom „URGENT“. Veľkými.',
    variants: [{ notify: 'Boris volá. Tretíkrát. Má tabuľku a otázky.' }, { notify: 'Boris: „Paťo, prečo je marža v utorok 11 %? Jedenásť?!“' }, { notify: 'Boris (SMS): „Zavolaj. Čísla.“ Dve slová. Hrôza.' }] });
  P({ id: 'miska_menu', fam: 'bistro', icon: '📝', title: 'Hanka chce nové menu', win: W(9, 16), w: 2, dayW: {}, deadlineRel: 300, forget: 200,
    steps: [ch('menu', 'notebook', 'Vymyslieť nové menu'), hold('notebook', 2, 'Napísať menu (drž E)', { say: 'Menu hotové. Preklepy: 3. Hanka ich nájde všetky.' })],
    reward: { rep: 3 }, failFx: { rep: -5 }, failSay: 'Hanka: „Menu nemám. Takže zostáva rezeň.“ Zostáva rezeň.', forgetFx: { rep: -3 }, forgetSay: 'Menu si nenapísal. Zajtra bude Hanka písať tebe.',
    variants: [{ notify: 'Hanka: „Nové menu do zajtra. Niečo z kuchyne chalanov – Bali, Nigéria, Kolumbia. Nie rezeň.“' }, { notify: 'Hanka (mail): „Menu. Zajtra. Kreatívne. Nie krídla.“' }] });
  P({ id: 'simon_ochutnavka', fam: 'bistro', icon: '🍷', title: 'Ondro príde ochutnať', win: W(11, 15), w: 1.6, dayW: { kontrola: 1.3 }, deadlineRel: 45, removeOnFail: true,
    steps: [hold('doska', 2, 'Pripraviť degustačný tanier (drž E)'), ch('simon', 'pult', 'Čeliť Ondrovi')],
    reward: { rep: 3 }, failFx: { rep: -6 }, failSay: 'Ondro ochutnal včerajšie rezne z passu. Mlčal. Odišiel.',
    variants: [{ notify: 'Ondro (SMS): „Som tu o 20 minút. Chcem ochutnať ten nový sambal.“' }, { notify: 'Dana: „Ondro parkuje. Má kravatu. To je zlé.“' }] });
  P({ id: 'reklamacia_vydajna', fam: 'bistro', icon: '🥶', title: 'Reklamácia z výdajne', win: W(11.5, 14.5), w: 2, dayW: {}, forget: 90,
    onStart: (q, S) => { const d = S.deliveries.map(o => parseInt(String(o).replace('outlet_', ''), 10)); q.data.o = d.length ? pick(d) : ri(0, 11); },
    steps: [ph('vydajna', 'Zdvihnúť výdajni', true), hold('rampa', 2, 'Zabaliť náhradu (drž E)', { give: 'nahrada' }), { type: 'go', at: (q) => 'vydaj_' + q.data.o, label: (q) => `Odviezť teplé jedlo: ${outletName(q.data.o)}`, need: { item: 'nahrada' }, take: 'nahrada', say: 'Teplé. Konečne. Výdajňa ťa pustí dnu len s rukavicami.' }],
    reward: { rep: 3 }, forgetFx: { rep: -6 }, forgetSay: 'Výdajňa napísala Borisovi. Boris napísal tebe. Veľkými.',
    variants: [{ notify: (q) => `${outletName(q.data.o)}: „Jedlo prišlo STUDENÉ!“` }, { notify: (q) => `${outletName(q.data.o)}: „V boxe bola ryža namiesto rezňa. Ľudia revú.“` }] });
  P({ id: 'lukas_nabural', fam: 'bistro', icon: '🚐', title: 'Peter nabúral dodávku', win: W(8, 16), w: 1.4, dayW: { dazd: 2.2 }, forget: 90,
    steps: [ph('lukas', 'Zdvihnúť Petrovi', true), hold('sanon', 2, 'Nájsť poistku dodávky (drž E)', { say: 'Poistka platná. Do včera. Nie. Do zajtra. Fuu.' })],
    reward: { rep: 1 }, forgetFx: { money: -150, rep: -3 }, forgetSay: 'Peter to riešil sám. S policajtom. Spoluúčasť 150 €.',
    variants: [{ notify: 'Peter volá. Hlas sa trasie. „Šéfe… stĺp.“' }, { notify: 'Peter: „Šéfe, ten múr tam včera nebol!“ Bol tam 40 rokov.' }] });
  P({ id: 'matus_nedviha', fam: 'bistro', icon: '📵', title: 'Tomáš nedvíha', win: W(7, 11), w: 1.8, dayW: { zaspal: 1.5 }, forget: 60,
    steps: [ph('matus', 'Dovolať sa Tomášovi')], forgetFx: { rep: -3 }, forgetSay: 'Tomáš sa ozval o 11:30. „Sorry, budík.“',
    variants: [{ notify: 'Peter: „Tomáš nedvíha. Jeho boxy tu stoja.“' }, { notify: 'Tomášov telefón: „Volaný účastník je nedostupný.“ Siedmykrát.' }] });
  P({ id: 'special_dna', intrude: 'popup', fam: 'bistro', icon: '🍛', title: 'Špeciál dňa?', win: W(9.5, 11.5), w: 2.2, dayW: {}, forget: 60,
    steps: [{ type: 'choice', choice: 'special', at: (q) => ['agus', 'ayo', 'fredy'][q.def.variant || 0], label: 'Rozhodnúť o špeciáli' }],
    forgetFx: { rep: -1 }, forgetSay: 'Nerozhodol si. Bol rezeň. Zase.',
    variants: [{ notify: 'Wayan: „Šéfe! Nasi goreng ako špeciál? Mám sambal z Bali, mama poslala.“' }, { notify: 'Tunde: „Boss, jollof rice. Special. Today. Trust me.“' }, { notify: 'Santi: „Jefe, arepas con queso! Denné menu! Por favor!“' }] });
  P({ id: 'benji_pivo', fam: 'bistro', icon: '🍺', title: 'Honza a prázdna chladnička', win: W(9, 15), w: 1.2, dayW: { futbal: 2 }, forget: 80,
    steps: [ch('benjipivo', 'benji', 'Pokecať s Honzom')], forgetFx: { rep: -1 }, forgetSay: 'Honza: „Žádný pivo, žádná motivace.“ Krájal pomaly.',
    variants: [{ notify: 'Honza: „Hele šéfe, v lednici není pivo. To je v Česku trestný čin.“' }] });
  P({ id: 'mrazak', fam: 'bistro', icon: '🧊', title: 'Mrazák kašle', win: W(8, 17), w: 1.4, dayW: { kontrola: 1.5 }, forget: 60,
    steps: [hold('box', 2, 'Skontrolovať mrazák (drž E)'), ch('servisbox', 'box', 'Čo s mrazákom?')],
    forgetFx: { money: -120, rep: -3 }, forgetSay: 'Mrazák zomrel potichu. Mäso tiež. 120 €.',
    variants: [{ notify: 'Tunde: „Boss, the freezer is crying.“ Mrazák naozaj plače. Kvapká.' }, { notify: 'Santi: „Jefe, mrazák robí zvuk ako moja prvá Fabia.“' }] });

  // ===== Auto =====
  P({ id: 'defekt', intrude: 'none', fam: 'auto', icon: '🛞', title: 'Defekt!', win: W(8, 18), w: 2, dayW: { dazd: 1.4 }, noForget: true,
    onStart: (q) => { const c = car(); if (c) c.flat = true; }, onEnd: (q) => { const c = car(); if (c && q.finished) c.flat = false; },
    steps: [hold('botnik', 3, 'Rezerva z pivnice (drž E)', { give: 'rezerva', say: 'Rezerva v pivnici. Za bicyklom, za vianočným stromčekom, za rokom 2019.' }),
      hold('car', 6, 'Vymeniť koleso (drž E)', { need: { item: 'rezerva' }, take: 'rezerva', say: 'Hotovo. Ruky čierne, ego biele.', onDone: () => { const c = car(); if (c) c.flat = false; } })],
    reward: { nervy: -4 }, chain: [{ id: 'servis_rezerva', p: 0.15, delay: 20, on: 'done' }],
    variants: [{ notify: 'Bum-bum-bum. Fabia ťahá doľava. Ľavé predné je placka.' }, { notify: 'Klinec. Pekný, dlhý, stavebný. V zadnom kolese. Fabia kríva.' }] });
  // reťazené z defekt (15 %): dojazdová rezerva – nízka priorita, bez deadlinu, len SMS
  P({ id: 'servis_rezerva', intrude: 'sms', caller: 'Fero (servis)', fam: 'auto', icon: '🛞', title: 'Rezerva je len dojazdová', w: 0, dayW: {}, forget: 120,
    steps: [ph('servis_rezerva', 'Odpísať Ferovi')], forgetFx: { focus: -2 }, forgetSay: 'Fero neodpísal. Rezerva vydrží. Asi. Do zajtra.',
    variants: [{ notify: 'Fero (servis): „Tá rezerva je dojazdová, max 80 km/h. Zastav sa do zajtra.“' }] });
  P({ id: 'policia', fam: 'auto', icon: '👮', title: 'Policajná kontrola', win: W(8, 19), w: 2, dayW: { kontrola: 2, dazd: 0.8 }, cond: () => inCar(), noForget: true,
    onStart: () => { const c = car(); if (c) c.speed = 0; },
    steps: [auto('policia')], reward: {},
    variants: [{ notify: 'Modré svetlo. Píšťalka. „Zastavte vpravo.“ Jasné. Teraz.' }, { notify: 'Hliadka pri krajnici. Terčík. Ukazuje na teba. Na TEBA.' }] });
  P({ id: 'parkovisko_blok', intrude: 'popup', fam: 'auto', icon: '🅿️', title: 'Zablokované parkovisko', win: W(8, 18), w: 1.6, dayW: {}, cond: () => !inCar(), forget: 60,
    steps: [ch('parkovisko', 'car', 'Vyriešiť zablokovanú Fabiu')], forgetFx: { time: 20, nervy: 5 }, forgetSay: 'Čakal si. Majiteľ prišiel po 20 minútach. S kávou.',
    variants: [{ notify: 'Niekto zaparkoval priečne za Fabiou. SUV. Samozrejme SUV.' }, { notify: 'Dodávka kuriéra blokuje výjazd. Kuriér nikde. Kuriéri sú nikdy nikde.' }] });
  P({ id: 'pokuta', intrude: 'none', fam: 'auto', icon: '🎫', title: 'Pokuta za parkovanie', win: W(9, 17), w: 1.8, dayW: { vyplata: 1.5 }, cond: () => !inCar(), forget: 120,
    steps: [go('car', 'Pozrieť lístok za stieračom'), ch('pokuta', 'car', 'Čo s pokutou?')], forgetFx: { money: -45 }, forgetSay: 'Lístok odletel. Pokuta prišla poštou. S prirážkou. 45 €.',
    variants: [{ notify: 'Za stieračom Fabie niečo biele. Nie je to leták.' }, { notify: 'Mestský policajt práve odchádza od Fabie. Spokojný. Príliš.' }] });
  // slabá baterka: namiesto behania po káble zavoláš niekoho; čakáš pri Fabii (krok s `ready`), potom štart
  const HELPER = { lukas: 'Peter', matus: 'Tomáš', sused: 'Ľubo (sused)', asist: 'Asistenčná služba' };
  const HELPER_SAY = { lukas: 'Peter: „Šéfe, baterka má desať rokov. Ako Fabia.“ Vrrrm. Žije.', matus: 'Tomáš: „Šéfe, ja som nedvíhal, lebo… no. Štartuje.“ Štartuje.', sused: 'Ľubo: „Plus na plus, šéfe. Nie ako minule.“ Vrrrm. Pivo si pýta vopred.', asist: 'Technik: „Baterka. Vymeňte.“ Vrrrm. Odišiel bez pozdravu. Šesťdesiat eur.' };
  P({ id: 'baterka', intrude: 'popup', fam: 'auto', icon: '🔋', title: 'Slabá baterka', win: W(7.5, 18), w: 1.5, dayW: { dazd: 1.5 }, cond: () => !inCar(), noForget: true,
    onStart: () => { const c = car(); if (c) c.battery = 0; }, onEnd: (q) => { if (q.data.helper) setNpc(q.data.helper, { visible: false }); },
    steps: [
      ch('baterka_koho', 'phone', 'Zavolať pomoc'),
      hold('car', 2, 'Čakaj pri Fabii na káble', { ready: (q, S) => S.time >= (q.data.arriveAt || 0), readyMsg: (q, S) => `${HELPER[q.data.helper] || 'Pomoc'} je na ceste, ešte ${Math.max(1, Math.ceil((q.data.arriveAt || 0) - S.time))} min`,
        say: (q) => `${HELPER[q.data.helper] || 'Pomoc'} dorazil. Káble v ruke. Pohľad: „Zase?“`,
        onDone: (q) => { const c = car(); if (c && q.data.helper) setNpc(q.data.helper, { visible: true, x: c.x + 3, z: c.z }); } }),
      hold('car', 3, 'Naštartovať s káblami (drž E)', { say: (q) => HELPER_SAY[q.data.helper] || 'Vrrrrm. Žije! Fabia je nesmrteľná.', onDone: () => { const c = car(); if (c) c.battery = 1; } }),
    ],
    reward: { nervy: -3 },
    variants: [{ notify: 'Kľúč, otočiť, „kr-kr-kr“. Nič. Baterka je mŕtva ako tvoj spoločenský život.' }, { notify: 'Svetlá si nechal zapnuté. Celú noc. Fabia: „kr… kr…“' }] });
  P({ id: 'kontrolka', intrude: 'none', fam: 'auto', icon: '⚠️', title: 'Kontrolka motora', win: W(8, 18), w: 1.6, dayW: {}, forget: 100,
    steps: [ch('kontrolka', 'car', 'Čo s kontrolkou?')], forgetFx: { focus: -2 }, forgetSay: 'Kontrolka svieti ďalej. Stala sa súčasťou interiéru.',
    chain: [{ id: 'defekt', p: 0.2, delay: 120, on: 'forget' }],
    variants: [{ notify: 'Oranžová kontrolka. Tvar motora. Alebo ponorky. Svieti.' }, { notify: 'Fabia pípla a rozsvietila kontrolku. Pozerá sa na teba vyčítavo.' }] });
  P({ id: 'zapcha', fam: 'auto', icon: '🚧', title: 'Zápcha – cesta uzavretá', win: W(7.5, 18), w: 2, dayW: { dazd: 1.5, futbal: 1.6 }, cond: () => inCar(), noForget: true,
    onStart: (q, S) => {
      const c = car(), m = M();
      if (!c) return;
      const a = c.a || 0, bx = c.x + Math.sin(a) * 60, bz = c.z + Math.cos(a) * 60;
      S.roadBlock = { x: bx, z: bz, r: 25, until: S.time + 40, rect: { x: bx, z: bz, w: 50, d: 50, rot: 0, roadBlock: true } };
      if (m && Array.isArray(m.solidsCar)) m.solidsCar.push(S.roadBlock.rect);
      log('🚧 Cesta uzavretá na 40 min');
    },
    steps: [auto('zapcha')], reward: {},
    variants: [{ notify: 'Kužele, bager, červená. Cesta uzavretá na 40 minút.' }, { notify: 'Kolóna až k semaforu. Pred ňou prevrátená dodávka s jogurtmi. Biela cesta.' }] });
  P({ id: 'kluce_v_aute', intrude: 'popup', fam: 'auto', icon: '🔒', title: 'Kľúče zamknuté v aute', win: W(8, 18), w: 1.5, dayW: {}, cond: (S) => !inCar() && S.items.has('kluce'), noForget: true,
    onStart: (q, S) => { S.items.delete('kluce'); },
    steps: [ch('zamknute', 'car', 'Dostať sa do Fabie', { hold: 3 })], reward: { nervy: -2 },
    variants: [{ notify: 'Buchol si dverami. Kľúče na sedadle. Dvere zamknuté. Fabia sa smeje.' }, { notify: `${DOG} stúpil na zamykanie. Kľúče vnútri. On tiež nie. Ty tiež nie.` }] });
  P({ id: 'stk', intrude: 'sms', fam: 'auto', icon: '📋', title: 'STK končí', win: W(9, 16), w: 1.4, dayW: { kontrola: 1.5 }, forget: 100,
    steps: [ph('stk', 'Riešiť STK')], forgetFx: { focus: -2 }, forgetSay: 'STK končí o 3 dni. Zajtra o 2. Potom polícia.',
    chain: [{ id: 'policia', p: 0.3, delay: 90, on: 'forget' }],
    variants: [{ notify: 'SMS zo servisu: „STK vašej Fabie končí o 3 dni.“' }, { notify: 'Nálepka na skle. Dátum. Hm. To bolo tento mesiac?' }] });

  // ===== Nelka =====
  P({ id: 'pokakana', fam: 'timea', icon: '💩', title: `${KID} potrebuje náhradné oblečenie`, win: W(9, 15), w: 2, dayW: { timea_chora: 1.5 }, forget: 100,
    steps: [go('postielka', 'Náhradné oblečenie z postieľky', { give: 'oblecenie' }), { type: 'go', at: (q, S) => (S.flags.kidAtSkolka && !kidWithMe() ? 'satna' : 'kid'), label: 'Prezliecť', need: { item: 'oblecenie' }, take: 'oblecenie', say: `${KID}: „Toto tričko nie! Je s autami!“ Je to tvoje tričko.` }],
    reward: { dad: 2 }, forgetFx: { dad: -3, nervy: 5 }, forgetSay: `${KID} chodila v požičaných teplákoch z koša „stratené“. Učiteľka: pohľad.`,
    variants: [{ notify: `Učiteľka: „${KID} mala nehodu. Náhradné oblečenie nemá. Prineste, prosím.“` }, { notify: `${KID}: „Tati… stalo sa.“ Stalo sa.` }] });
  P({ id: 'teplota', intrude: 'call', fam: 'timea', icon: '🤒', title: `${KID} má teplotu`, win: W(9.5, 14.5), w: 1.4, dayW: { timea_chora: 0, dazd: 1.4 }, deadlineRel: 40, noForget: true,
    cond: (S) => S.flags.kidAtSkolka && !kidWithMe(),
    steps: [go('satna', `Prísť hneď po ${KIDACC}`, { onDone: () => { kidFollow(); }, say: `${KID} horúca ako sporák. „Tati, mne nie je zle.“ Je.` }), go('lekaren', 'Sirup a čapíky', { need: { kid: true }, fx: { money: -14 }, give: 'sirup' }), go('postielka', `Uložiť ${KIDACC} do postele`, { need: { kid: true }, take: 'sirup', onDone: (q, S) => { kidSet('sick'); S.flags.kidAtSkolka = false; S.flags.kidHomeSick = true; } })],
    reward: { dad: 4 }, failFx: { dad: -6, nervy: 15 }, failSay: `Učiteľka musela volať ex. Simona prišla. Simona zavolala tebe. Trikrát.`,
    variants: [{ notify: `Učiteľka: „${KID} má 38,2. Príďte hneď, prosím.“` }, { notify: `Škôlka: „${KID} je horúca a spí v kúte. Prídete?“` }] });
  P({ id: 'zabudnuta_vec', fam: 'timea', icon: '🎒', title: 'Zabudnutá vec v škôlke', win: W(7.5, 10.5), w: 2.5, dayW: { timea_chora: 0 }, forget: 150, cond: (S) => S.flags.kidAtSkolka,
    variants: [
      { notify: `Učiteľka: „${KID} nemá fľašu. Pije z kohútika ako mačka.“`, steps: [go('linka', 'Vziať fľašu z linky', { give: 'flasa' }), go('satna', 'Doniesť fľašu', { need: { item: 'flasa' }, take: 'flasa' })] },
      { notify: `Učiteľka: „Papuče? ${KID} behá v ponožkách po linoleu. Rýchlo.“`, steps: [go('botnik', 'Papuče z botníka', { give: 'papuce' }), go('satna', 'Doniesť papuče', { need: { item: 'papuce' }, take: 'papuce' })] },
      { notify: `${KID} plače: zabudla kresbu pre pani učiteľku. „Je to DÔLEŽITÉ, tati!“`, steps: [go('gauc', 'Kresba spod gauča', { give: 'kresba', say: 'Kresba: ty, Fabia, Bundáš. Všetci máte rovnakú bradu.' }), go('satna', 'Doniesť kresbu', { need: { item: 'kresba' }, take: 'kresba' })] },
    ],
    reward: { dad: 3 }, forgetFx: { dad: -2 }, forgetSay: `${KID} si to pamätá. Dlho.` });
  P({ id: 'karneval', fam: 'timea', icon: '🎭', title: 'Karneval: kostým do 14:00', win: W(8, 11), w: 1.5, dayW: { vylet: 0.5 }, deadline: 14 * 60, noForget: true,
    variants: [
      { notify: 'Učiteľka: „Karneval o 14:00! Kostým má?“ Nemá. Nevedel si o karnevale.', steps: [pay('vo_pokladna', 25, 'Kúpiť kostým vo veľkoobchode', { give: 'kostym', paySay: 'Kostým včely. Jediný v jej veľkosti. Bude včela.' }), go('satna', 'Odovzdať kostým', { need: { item: 'kostym' }, take: 'kostym', say: `${KID}: „Včela?!“ Pauza. „…dobre, včela.“` })] },
      { notify: `${KID} ráno: „Dnes je karneval a ja som princezná!“ Kostým? Aký kostým.`, steps: [hold('linka', 4, 'Ušiť kostým z obrusu (drž E)', { give: 'kostym', say: 'Obrus, špendlíky, alobalová korunka. Duch babky by bol hrdý.' }), go('satna', 'Odovzdať kostým', { need: { item: 'kostym' }, take: 'kostym' })] },
    ],
    reward: { dad: 5 }, failFx: { dad: -6, nervy: 10 }, failSay: `Karneval bez kostýmu. ${KID} išla ako „dieťa bez kostýmu“. Fotky sú navždy.` });
  P({ id: 'zjedla_zo_zeme', fam: 'timea', icon: '🌰', title: `${KID} zjedla niečo zo zeme`, win: W(10, 16), w: 1.6, dayW: { timea_chora: 0 }, forget: 40, cond: (S) => S.flags.kidAtSkolka,
    steps: [ph('ucitelka_zem', 'Zdvihnúť škôlke', true)], forgetFx: { dad: -2, nervy: 5 }, forgetSay: 'Učiteľka volala 3×. Potom volala ex.',
    variants: [{ notify: 'Škôlka volá. To nie je dobré. Nikdy to nie je dobré.' }] });
  P({ id: 'stratila_sa', intrude: 'none', fam: 'timea', icon: '😱', title: `${KID} sa stratila vo veľkoobchode`, win: W(10, 18), w: 1.6, dayW: { timea_chora: 2.5 }, cond: () => { const k = kid(); return k && k.state === 'follow'; }, noForget: true, deadlineRel: 20,
    onStart: (q) => { kidSet('lost'); const k = kid(), p = pick(['vo_zelenina', 'vo_hracky', 'vo_pokladna']); q.data.searchAt = p; const pos = hsPos(p); if (k && pos) { k.x = pos.x; k.z = pos.z; } q.data.searched = []; },
    steps: [{ type: 'search', spots: ['vo_zelenina', 'vo_hracky', 'vo_pokladna'], hold: 0.8, verb: 'Hľadať', label: `Nájsť ${KIDACC}`, found: { vo_zelenina: `👧 Medzi melónmi. „Tati, ten je najväčší!“`, vo_hracky: '👧 Pri hračkách. Samozrejme. Drží troch poníkov.', vo_pokladna: '👧 Pri pokladni. Rozpráva pokladníčke o Bundášovi.' }, fails: { vo_zelenina: 'Len melóny. Veľa melónov.', vo_hracky: 'Hračky. Žiadna Nelka. Panika rastie.', vo_pokladna: 'Pokladníčka: „Malé dievča? Nie… počkajte, hej, bežalo tam.“' }, onDone: () => kidFollow() }],
    reward: { dad: 2, nervy: -10 }, failFx: { dad: -8, nervy: 25 }, failSay: 'Rozhlas: „Otec Paťo, dcéra čaká pri informáciách.“ Celý veľkoobchod sa pozerá.',
    variants: [{ notify: `Otočíš sa. ${KID} nikde. Len vozík a tvoje srdce v krku.` }] });
  P({ id: 'kde_je_pes', intrude: 'popup', fam: 'timea', icon: '❓', title: `${KID}: „Kde je ${DOG}?“`, win: W(15, 20.5), w: 2, dayW: { timea_chora: 1.5 }, forget: 40, cond: () => kidWithMe(),
    steps: [ch('kdejepes', 'kid', 'Odpovedať')], forgetFx: { dad: -1 }, forgetSay: `${KID} si odpovedala sama: „${DOG} utiekol, lebo tati stále pracuje.“ Au.`,
    variants: [{ notify: `${KID} sa obzerá. „Tati… kde je ${DOG}?“ Dobrá otázka.` }] });
  P({ id: 'kupanie', intrude: 'popup', fam: 'timea', icon: '🛁', title: 'Večerné kúpanie', win: W(18.5, 21), w: 2.5, dayW: {}, forget: 80, cond: () => { const k = kid(); return k && (k.state === 'home' || k.state === 'sick' || kidWithMe()); },
    steps: [hold('postielka', 4, 'Kúpanie (drž E)', { say: 'Voda všade. Pena všade. Nelka čistá. Ty mokrý.' })],
    reward: { dad: 3, nervy: -5 }, forgetFx: { dad: -2 }, forgetSay: `${KID} išla spať s pieskom vo vlasoch. Zajtra to učiteľka uvidí.`,
    variants: [{ notify: `${KID}: „Kúpať! S penou! S KAČKOU!“` }, { notify: `${KID} má vo vlasoch piesok, farbu a niečo lepkavé. Kúpanie je nevyhnutné.` }] });
  P({ id: 'nechce_od_babky', intrude: 'popup', fam: 'timea', icon: '🧁', title: `${KID} nechce ísť od babky`, win: W(16, 19), w: 1.5, dayW: { babka_navsteva: 2 }, forget: 40, cond: () => kidWithMe() || (G.S && G.S.flags.kidAtBabka),
    steps: [ch('babka_nechce', 'babka', 'Riešiť odchod od babky')], forgetFx: { dad: -1, nervy: 4 }, forgetSay: 'Babka rozhodla. Nelka spí u babky. Ty nemáš slovo.',
    variants: [{ notify: `${KID} sa drží babkinej nohy. „NEJDEM!“ Babka sa usmieva. Víťazne.` }] });
  P({ id: 'chce_zajacika', intrude: 'grab', fam: 'timea', icon: '🐰', title: `${KID} chce zajačika. Hneď.`, win: W(13, 19), w: 1.5, dayW: { timea_chora: 2 }, forget: 60, cond: () => kidWithMe(),
    steps: [go('postielka', 'Zajačik z postieľky', { give: 'zajacik' }), go('kid', `Dať zajačika ${KIDDAT}`, { need: { item: 'zajacik' }, take: 'zajacik', say: 'Zajačik objatý. Svet zachránený.' })],
    reward: { dad: 3 }, forgetFx: { dad: -2, nervy: 5 }, forgetSay: `${KID} plakala za zajačikom 20 minút. Katka to počula cez telefón.`,
    variants: [{ notify: `${KID}: „Zajačika! Chcem zajačikaaa!“ Je doma. V postieľke. Vždy.` }] });
  P({ id: 'pyta_sa_na_mamu', intrude: 'popup', fam: 'timea', icon: '💬', title: `${KID} sa pýta na mamu`, win: W(17, 21.5), w: 1.6, dayW: { nove_zamky: 2 }, forget: 30, cond: () => kidWithMe() || (kid() && kid().state === 'home'),
    steps: [ch('mama', 'kid', 'Odpovedať')], forgetFx: { dad: -3 }, forgetSay: 'Neodpovedal si. Otázka ostala visieť. Ako všetky.',
    variants: [{ notify: `${KID} ticho: „Tati… a mama príde?“` }] });

  // ===== Bundáš =====
  // ===== Nelka u Simony (deň bez Nelky; awayOk = nepotrebuje ju fyzicky, awayOnly = len keď je u Simony) =====
  const AWAY = { fam: 'timea', awayOk: true, awayOnly: true, cond: () => !kidToday() };
  P(Object.assign({ id: 'vanda_fotky', intrude: 'sms', caller: 'Simona', icon: '📸', title: `Simona posiela fotku ${KIDGEN}`, win: W(10, 17), w: 2.2, dayW: {}, forget: 60,
    steps: [ph('vanda_fotky', 'Odpísať Simone')], forgetFx: { nervy: 2 }, forgetSay: `Neodpísal si. Simona: „Ani srdiečko?“ Ani.`,
    variants: [{ notify: `Simona (MMS): fotka. ${KID} s ${DOG}ovým plyšákom. Popis: „Chýba jej pes.“` }, { notify: `Simona (MMS): ${KID} v jednorožcovi. Na hlave má Bundášov plyšák. Podpis: „Tvoja výchova.“` }] }, AWAY));
  P(Object.assign({ id: 'videohovor_timea', intrude: 'call', caller: 'Simona', icon: '📹', title: `Videohovor s ${KIDINS}`, win: W(18.5, 20.5), w: 2.5, dayW: {}, forget: 25,
    steps: [ph('videohovor', 'Zdvihnúť videohovor', true)], forgetFx: { dad: -2, nervy: 4 }, forgetSay: `Nezdvihol si. ${KID} mávala do vypnutého displeja. Simona to nahrala.`,
    variants: [{ notify: `Simona volá. Video. ${KID} chce vidieť tata pred kúpaním.` }, { notify: `Videohovor: Simona. V náhľade polovica ${KIDGEN} a celý plyšák.` }] }, AWAY));
  P(Object.assign({ id: 'vyzivne', intrude: 'sms', caller: 'Simona', icon: '💶', title: 'Simona: „Výživné?“', win: W(9, 16), w: 2, dayW: { vyplata: 2 }, forget: 90,
    steps: [ph('vyzivne', 'Riešiť výživné')], forgetFx: { nervy: 6, dad: -1 }, forgetSay: 'Neodpísal si. Simona napísala tvojej mame. TVOJEJ MAME.',
    variants: [{ notify: 'Simona (SMS): „Výživné?“ Jedno slovo. Stačí.' }, { notify: 'Simona (SMS): „22. v mesiaci. Vieš, čo to znamená.“ Vieš.' }] }, AWAY));
  // reťazené z vyzivne (bez okna → len cez pushId)
  P(Object.assign({ id: 'vanda_vola_nahnevana', intrude: 'call', caller: 'Simona', icon: '📵', title: 'Simona volá. Nahnevaná.', w: 0, dayW: {}, forget: 30,
    steps: [ph('vanda_nahnevana', 'Zdvihnúť Simone', true)], forgetFx: { nervy: 8, dad: -1 }, forgetSay: 'Simona: 7 zmeškaných. Posledná SMS má len výkričníky.',
    variants: [{ notify: 'Simona volá. Displej sa trasie. Alebo ty.' }] }, AWAY, { awayOnly: false, cond: null }));
  P(Object.assign({ id: 'timea_chce_domov', intrude: 'call', caller: 'Simona', icon: '😭', title: `${KID} plače, chce k tatovi`, win: W(19, 21), w: 1.8, dayW: {}, forget: 25,
    steps: [ph('timea_chce_domov', 'Zdvihnúť Simone', true)], forgetFx: { dad: -3, nervy: 6 }, forgetSay: `Nezdvihol si. ${KID} zaspala s plačom. Simona to napísala. Trikrát.`,
    variants: [{ notify: `Simona volá. V pozadí ${KID}: „TATIIII!“ Zdvihni.` }] }, AWAY));
  // reťazené z timea_chce_domov: ísť po Nelku k Simone a doviezť ju domov (večer je potom s tebou + uspávanie)
  P(Object.assign({ id: 'timea_domov_cesta', intrude: 'none', icon: '🚗', title: `Ísť po ${KIDACC} k Simone`, w: 0, dayW: {}, noForget: true, deadline: 23 * 60,
    steps: [
      drive('ex', `Ísť po ${KIDACC} k Simone`),
      hold('ex_dvere', 2, `Vyzdvihnúť ${KIDACC} (drž E)`, { say: `Simona otvorila. ${KID} ti skočila na krk. Simona: „Pyžamo má. Zajtra o ôsmej.“ Dvere.`,
        onDone: (q, S) => { kidFollow(); S.kidWithMe = true; S.kidWhere = 'paťo'; log(`👧 ${KID} ide večer k tebe`); } }),
      go('postielka', `Doviesť ${KIDACC} domov`, { need: { kid: true }, say: `${KID} zaspala v aute. Zobudila sa pri dverách. Samozrejme.`,
        onDone: (q, S) => { kidSet('home'); S.pending.push({ t: 3, id: 'uspavanie', from: 'timea_domov_cesta' }); } }),
    ],
    reward: { dad: 3, nervy: -5 }, failFx: { dad: -4, nervy: 8 }, failSay: `Nestihol si. ${KID} zaspala u Simony. Simona nezaspala. Píše.`,
    variants: [{ notify: `Kľúče, bunda, Fabia. ${KID} čaká pri dverách u Simony.` }] }, AWAY, { awayOnly: false, cond: null }));
  P(Object.assign({ id: 'zabudnute_veci_timey', intrude: 'sms', caller: 'Simona', icon: '🎒', title: `Zabudnuté veci ${KIDGEN}`, win: W(9, 18), w: 1.8, dayW: {}, forget: 150,
    steps: [go('postielka', `Zobrať veci ${KIDGEN} z postieľky`, { give: 'veci_timey', say: 'Papuče, pyžamo, zajačik č. 2. Taška z Lidla. Reprezentatívne.' }),
      hold('ex_dvere', 2, `Odovzdať Simone veci ${KIDGEN} (drž E)`, { need: { item: 'veci_timey' }, take: 'veci_timey', say: 'Simona otvorila. Vzala tašku. „Papuče sú tie staré.“ Zavrela.' })],
    reward: { dad: 2, nervy: -2 }, forgetFx: { dad: -2, nervy: 5 }, forgetSay: `${KID} spí v maminom tričku. Simona to spomenie. Ešte v roku 2031.`,
    variants: [{ notify: `Simona (SMS): „${KID} nemá papuče ani pyžamo. Dones to. Dnes.“` }, { notify: `Simona (SMS): „Zajačik č. 2 ostal u teba. Vieš, čo to znamená o ôsmej.“ Vieš.` }] }, AWAY));
  P(Object.assign({ id: 'sam_doma_vecer', intrude: 'none', icon: '🛋️', title: `Večer bez ${KIDGEN} – čo teraz?`, win: W(19.5, 21.5), w: 2.5, dayW: {}, forget: 40,
    steps: [auto('sam_doma_vecer')], reward: {},
    variants: [{ notify: 'Byt. Ticho. Gauč. Mozog: „A čo teraz?“' }, { notify: `Nikto nechce rozprávku. ${DOG} chrápe. Ty nie.` }] }, AWAY));

  P({ id: 'kokes_vencit_hned', intrude: 'grab', fam: 'kokes', icon: '🐕', title: `${DOG} potrebuje von. HNEĎ.`, win: W(7, 20), w: 2.5, dayW: {}, forget: 25, cond: () => dogWithMe(),
    steps: [hold(['strom_byt', 'vybeh', 'strom_a'], 2, 'Nájsť strom (drž E)', { need: { dog: true }, say: `${DOG} si uľavil. Na koleso cudzieho auta. Rýchlo preč.` })],
    reward: { nervy: -2 }, forgetFx: { nervy: 8, rep: -2 }, forgetSay: `${DOG} to vyriešil. Na podlahe. Pred hosťami.`,
    variants: [{ notify: `${DOG} kňučí a točí sa dokola. Univerzálny signál.` }, { notify: `${DOG} sa díva na dvere. Potom na teba. Potom na dvere. Rozumieš.` }] });
  P({ id: 'kokes_usiel_park', fam: 'kokes', icon: '🏃', title: `${DOG} ušiel!`, win: W(8, 19), w: 2, dayW: { dazd: 0.6 }, noForget: true, deadlineRel: 45,
    onStart: (q) => { const spots = ['vybeh', 'strom_a', 'strom_b', 'strom_c']; q.data.searchAt = pick(spots); q.data.searched = []; dogSet('lost'); const d = dog(), p = hsPos(q.data.searchAt); if (d && p) { d.x = p.x; d.z = p.z; } },
    steps: [{ type: 'search', spots: ['vybeh', 'strom_a', 'strom_b', 'strom_c'], hold: 1, verb: 'Hľadať', label: `Nájsť ${DOGACC} v parku`, found: { vybeh: `🐕 Vo výbehu. Hrá sa s pudlom. Zamilovaný.`, strom_a: `🐕 Pri strome. Kope jamu. Dôležitú jamu.`, strom_b: `🐕 Pri jazierku. Mokrý. Šťastný. Smrdí.`, strom_c: `🐕 V kríkoch. Žerie niečo. Neopýtaš sa čo.` }, fails: { vybeh: 'Vo výbehu len pudel a dôchodca.', strom_a: 'Jama. Čerstvá. Bol tu.', strom_b: 'Kačky. Žiadny pes. Kačky sa smejú.', strom_c: 'Kríky. Tŕnie. Nadávky.' }, onDone: () => dogSet('follow') }],
    reward: { nervy: -8 }, failFx: { nervy: 20, dad: -2 }, failSay: `${DOGACC} priviedla pani s kočíkom. Podľa známky. Pohľad: „Vy ste ten otec?“`,
    variants: [{ intrude: 'none', notify: `Veverička. ${DOG} videl veveričku. ${DOG} je preč. Smer park.` }, { intrude: 'sms', notify: `Peter (SMS): „Šéfe, ${DOG} vybehol z rampy. Smer park. Sorry!“` }] });
  P({ id: 'kokes_klobasa', fam: 'kokes', icon: '🌭', title: `${DOG} zožral klobásu v kuchyni`, win: W(9, 14), w: 1.8, dayW: { kontrola: 2 }, forget: 40, cond: () => { const d = dog(); return d && (d.state === 'kuchyna' || dogWithMe()); },
    steps: [hold('pass', 2, 'Upratať dôkazy (drž E)', { say: 'Omrvinky, obal, slina. Dôkazy zlikvidované.' }), go('rampa', `Vyhnať ${DOGACC} z kuchyne`, { say: `${DOG} odchádza. Nie je mu ľúto. Vôbec.` })],
    reward: { nervy: -2 }, forgetFx: { rep: -4 }, forgetSay: 'Wayan to odfotil. Je to v skupinovom chate. Aj s Borisom.',
    chain: [{ id: 'hygiena', p: 0.5, delay: 60 }],
    variants: [{ notify: `Tunde: „Boss! The dog ate the whole klobása! Whole!“` }, { notify: `Honza: „Šéfe, hele, ${DOG} sežral klobásu. Celou. Já mu ji nedal.“ Dal.` }] });
  P({ id: 'kokes_zvracia', intrude: 'none', fam: 'kokes', icon: '🤮', title: `${DOG} zvracia vo Fabii`, win: W(8, 18), w: 1.8, dayW: {}, forget: 60, cond: () => { const d = dog(); return d && (d.state === 'car' || d.state === 'follow'); },
    steps: [hold('car', 4, 'Vyčistiť Fabiu (drž E)', { fx: { nervy: 8 }, say: 'Zadné sedadlo už nikdy nebude ako predtým. Ani tvoj nos.' })],
    reward: { nervy: -3 }, forgetFx: { nervy: 10, rep: -2 }, forgetSay: 'Zaschlo to. Fabia smrdí tri dni. Katka odmieta nastúpiť.',
    variants: [{ notify: `Zvuk zo zadného sedadla. Hlboký. Vlhký. ${DOG} sa tvári prekvapene.` }, { notify: `${DOG} zjedol trávu, klobásu a niečo z parku. Fabia to práve zistila.` }] });
  P({ id: 'kokes_plysak', intrude: 'grab', grabWho: 'kid', fam: 'kokes', icon: '🧸', title: `${DOG} hryzie Nelkin plyšák`, win: W(16, 21), w: 1.6, dayW: {}, forget: 30, cond: () => { const d = dog(), k = kid(); return d && d.state === 'home' && k && (k.state === 'home' || k.state === 'sick'); },
    steps: [go('pelech', `Zobrať ${DOGDAT} plyšáka`, { say: 'Zajačik má o jedno ucho menej. Operácia ihlou o polnoci.' })],
    reward: { dad: 2 }, forgetFx: { dad: -4, nervy: 8 }, forgetSay: `Zajačik je na tri kusy. ${KID} plače. ${DOG} spí. Spravodlivosť neexistuje.`,
    variants: [{ notify: `${KID}: „TATI! ${DOG} MÁ ZAJAČIKA!“ Vrčanie z pelechu.` }] });
  P({ id: 'kokes_steka_joff', intrude: 'none', fam: 'kokes', icon: '🗣️', title: `${DOG} šteká na Borisa`, win: W(9, 16), w: 1.4, dayW: {}, forget: 30, cond: () => { const d = dog(); return d && (d.state === 'kuchyna' || dogWithMe()); },
    steps: [go('joff', `Odvolať ${DOGACC} od Borisa`, { say: 'Boris: „Ten pes ma nemá rád.“ Má dobrý inštinkt na marže.' })],
    reward: { rep: 1 }, forgetFx: { rep: -3 }, forgetSay: 'Boris odišiel z kancelárie zadným vchodom. Mail: „Pes v prevádzke?“',
    variants: [{ notify: `Z kancelárie: „HAF HAF HAF!“ a Boris: „Paťo! PAŤO!“` }] });
  P({ id: 'kokes_obojok', fam: 'kokes', icon: '📿', title: 'Stratený obojok', win: W(8, 18), w: 1.4, dayW: {}, forget: 120, cond: () => dogWithMe(),
    onStart: (q) => { q.data.searchAt = pick(['pelech', 'gauc', 'car', 'vybeh']); q.data.searched = []; },
    steps: [{ type: 'search', spots: ['pelech', 'gauc', 'car', 'vybeh'], hold: 0.8, label: 'Nájsť obojok', give: 'obojok', found: { pelech: '📿 V pelechu. Zahrabaný. Úmyselne.', gauc: '📿 Pod gaučom s legom a kľúčmi od… niečoho.', car: '📿 Vo Fabii pod sedadlom. Samozrejme.', vybeh: '📿 Vo výbehu. Pudel ho mal na krku. Pudlov majiteľ sa červená.' }, fails: { pelech: 'Chlpy a jedna ponožka.', gauc: 'Lego. Veľa lega.', car: 'Hranolka z júna. Obojok nie.', vybeh: 'Len pudel. Bez obojka. Hm.' } }],
    reward: { nervy: -2 }, forgetFx: { money: -20 }, forgetSay: 'Nový obojok 20 €. Starý sa nájde zajtra. V chladničke.',
    variants: [{ notify: `${DOG} bez obojka. Známka, číslo, všetko preč. Kde ho stratil? On nevie. Ty nevieš.` }] });
  P({ id: 'kokes_vet', fam: 'kokes', icon: '💉', title: 'Veterinár: očkovanie končí dnes', win: W(9, 16), w: 1.5, dayW: {}, deadline: 17 * 60, noForget: true,
    steps: [go(['pelech', 'rampa', 'dog'], `Zobrať ${DOGACC}`, { onDone: () => dogSet('follow') }), drive('veterinar', 'Odviezť ho k veterinárovi', { need: { dog: true } }), pay('vet', 35, 'Zaplatiť očkovanie', { need: { dog: true }, paySay: `Veterinárka: „Pekný pes. Trochu tučný.“ ${DOG} sa urazil. Ty tiež.` })],
    reward: { dad: 1, nervy: -2 }, failFx: { money: -60 }, failSay: 'Očkovanie prepadlo. Nový preukaz, nové poplatky, 60 €.',
    variants: [{ intrude: 'sms', caller: 'Veterinár', notify: `SMS od veterinára: „Očkovanie ${DOGACC} proti besnote končí DNES.“` }, { intrude: 'call', notify: `Babka: „Paťko, ${DOG} má dnes očkovanie! Mám to v kalendári!“ Máš to v kalendári tiež. V tom, čo nečítaš.` }] });
  P({ id: 'kokes_zabudnuty', fam: 'kokes', icon: '🙈', title: `Zabudol si ${DOGACC} v kuchyni`, win: W(13.5, 17.5), w: 2, dayW: {}, forget: 120, cond: () => { const d = dog(); return d && d.state === 'kuchyna'; },
    steps: [go('rampa', `Zobrať ${DOGACC} z kuchyne`, { onDone: () => dogSet('follow'), say: `${DOG} spal pri rampe. Peter ho kŕmil rezňami. Je okrúhlejší.` })],
    reward: { dad: 1 }, forgetFx: { nervy: 6, rep: -2 }, forgetSay: `${DOG} prespal v kuchyni. Ráno zjedol ráno. Celé.`,
    variants: [{ notify: `Peter (SMS): „Šéfe, ${DOG} je stále tu. Pozerá na dvere. Smutne.“` }, { notify: `Hm. Ticho. Príliš ticho. Kde je ${DOG}? …V kuchyni. Od rána.` }] });
  P({ id: 'kokes_bitka', intrude: 'popup', fam: 'kokes', icon: '🐕‍🦺', title: 'Bitka v parku', win: W(8, 19), w: 1.3, dayW: {}, noForget: true, deadlineRel: 15, removeOnFail: true, cond: () => dogWithMe(),
    steps: [hold('vybeh', 3, 'Roztrhnúť psov! (drž E)', { need: { dog: true }, say: 'Roztrhnutí. Dobrman má škrabanec. Bundáš má ego. Majiteľ dobrmana má názor.' })],
    reward: { nervy: -4 }, failFx: { money: -80, nervy: 12 }, failSay: 'Veterinár pre dobrmana. 80 €. Majiteľ ti ešte zamáva. Nie pekne.',
    chain: [{ id: 'kokes_vet', p: 0.3, delay: 30, on: 'fail' }],
    variants: [{ notify: `${DOG} a dobrman. Oči v očiach. Vrčanie. Toto bude zlé.` }] });
  P({ id: 'kokes_nechce_auto', intrude: 'popup', fam: 'kokes', icon: '🚗', title: `${DOG} nechce do auta`, win: W(8, 18), w: 1.5, dayW: {}, forget: 30, cond: () => { const d = dog(), c = car(); return d && d.state === 'follow' && c && dist(d, c) < 15; },
    steps: [ch('kokes_auto', ['dog', 'car'], `Dostať ${DOGACC} do Fabie`, { onDone: () => dogSet('car') })],
    reward: {}, forgetFx: { nervy: 5 }, forgetSay: `${DOG} ostal sedieť pri aute. Pol hodiny. Potom išiel domov sám.`,
    variants: [{ notify: `${DOG} sadol pri dverách Fabie. Nehýbe sa. Pohľad: „Zase veterinár?“` }] });
  P({ id: 'ex_pes_nesmie', intrude: 'call', fam: 'kokes', icon: '📵', title: 'Simona: „Ten pes nesmie k Nelke“', win: W(8, 20), w: 1.4, dayW: { nove_zamky: 1.6 }, forget: 40,
    steps: [ph('ex_pes', 'Zdvihnúť ex', true)], forgetFx: { nervy: 6 }, forgetSay: 'Simona poslala 14 správ a 1 článok o alergiách.',
    variants: [{ notify: `Simona volá. Téma: ${DOG}. Téma je vždy ${DOG}, keď nie je téma peniaze.` }] });
  P({ id: 'kokes_blato', intrude: 'none', fam: 'kokes', icon: '🛁', title: `${DOG} je od blata`, win: W(8, 19), w: 1.5, dayW: { dazd: 3, normal: 0.6 }, forget: 50, cond: () => dogWithMe(),
    steps: [hold(['pelech', 'rampa'], 3, `Umyť ${DOGACC} (drž E)`, { need: { dog: true }, say: 'Hadica, šampón, boj. Mokrý si ty, on, aj stena.' })],
    reward: { nervy: -2 }, forgetFx: { rep: -3, nervy: 4 }, forgetSay: `${DOG} vošiel do bistra. Hnedé stopy od dverí k pultu. Dana kričí.`,
    variants: [{ notify: `${DOG} našiel mláku. Jedinú v okolí. Je v nej. Celý.` }] });

  // ===== Ex =====
  P({ id: 'ex_vola', intrude: 'call', fam: 'ex', icon: '📵', title: 'Volá ex', win: W(8, 21.5), w: 3, dayW: { nove_zamky: 1.5, vyplata: 1.5 }, forget: 40,
    steps: [ph('ex_vola', 'Zdvihnúť ex', true)], forgetFx: { nervy: 8, dad: -1 }, forgetSay: 'Simona: 6 zmeškaných, 1 hlasová správa, 3 minúty 40 sekúnd.',
    variants: [{ notify: 'Simona volá. Displej: „NEDVÍHAŤ“. Dvíhaš.' }, { notify: 'Simona volá. Je utorok. V utorok volá o víkende.' }, { notify: 'Simona volá. Hlas pokojný. To je najhoršie.' }] });
  P({ id: 'ex_pise_23', intrude: 'sms', fam: 'ex', icon: '🌙', title: 'Simona píše o 23:00', win: W(22.5, 23.8), w: 2, dayW: { nove_zamky: 2 }, forget: 30,
    steps: [ph('ex_pise', 'Pozrieť správu')], forgetFx: { energy: -5 }, forgetSay: 'Neodpísal si. Spal si zle. Aj tak.',
    variants: [{ notify: 'Mobil svieti. 23:04. Ex. Samozrejme.' }] });
  P({ id: 'nove_zamky', fam: 'ex', icon: '🔐', title: 'Simona vymenila zámky', win: W(8.5, 16), w: 0.6, dayW: { nove_zamky: 6, normal: 0.3 }, noForget: true, deadline: 18 * 60,
    steps: [go('ex_dvere', `Ísť po veci ${KIDGEN} k ex`, { say: 'Kľúč nejde. Otočíš ho. Nejde. Vymenila zámky. Kurnik.' }), ph('ex_vola', 'Zavolať ex', true), hold('zamocnik', 2, 'Zámočník: nové kľúče (drž E)', { fx: { money: -40 }, give: 'klucenove', say: 'Zámočník: „Kľúč od bytu, kde nebývate? Hm.“ Právne šedá zóna.' }), hold('ex_dvere', 3, `Čakať, kým ex otvorí (drž E)`, { give: 'oblecenie', say: `Otvorila. Podala tašku. Zavrela. Tri sekundy. Rekord.` })],
    reward: { dad: 2, nervy: -5 }, failFx: { dad: -4, nervy: 10 }, failSay: `${KID} nemá svoje veci. Spí v tvojom tričku. Zase.`,
    variants: [{ notify: `Simona (SMS): „Veci ${KIDGEN} sú pri dverách. Zvoň.“ Prečo zvoniť, keď máš kľúč? Aha.` }, { notify: 'Simona: „Mimochodom, vymenila som zámky. Pre istotu.“ Istotu pred čím?!' }] });
  P({ id: 'ex_v_bistre', intrude: 'popup', fam: 'ex', icon: '☕', title: 'Simona prišla do bistra', win: W(11, 15), w: 1.6, dayW: { nove_zamky: 1.5 }, forget: 30,
    onStart: () => { const p = hsPos('pult'); if (p) setNpc('ex', { x: p.x + 2, z: p.z + 1, visible: true, look: 'ex' }); }, onEnd: () => setNpc('ex', { visible: false }),
    steps: [ch('ex_bistro', 'pult', 'Čeliť ex pri pulte')], forgetFx: { nervy: 6, rep: -2 }, forgetSay: 'Simona čakala 20 minút. Hovorila s Danou. O tebe. Dana teraz vie veci.',
    variants: [{ notify: 'Dana šeptom: „Šéfe. Ex. Pri pulte. Nie, nevymýšľam si.“' }] });
  P({ id: 'ex_chce_fabiu', intrude: 'call', fam: 'ex', icon: '🚙', title: 'Simona chce Fabiu na víkend', win: W(9, 20), w: 1.4, dayW: {}, forget: 50,
    steps: [ph('ex_fabia', 'Zdvihnúť ex', true)], forgetFx: { nervy: 5 }, forgetSay: 'Simona: „Beriem to ako áno.“ Nebolo to áno.',
    variants: [{ notify: 'Simona: „Krátka otázka.“ Nikdy nie je krátka.' }] });

  // ===== Katka =====
  P({ id: 'nina_vola', intrude: 'call', fam: 'nina', icon: '💅', title: 'Katka volá', win: W(10, 21), w: 2.5, dayW: {}, forget: 40,
    steps: [ph('nina_vola', 'Zdvihnúť Katke', true)], forgetFx: { nervy: 4 }, forgetSay: 'Katka: „Ok.“ Dve písmená. Nie je to ok.',
    variants: [{ notify: 'Katka volá. Má ten hlas. Ten „kedy sa uvidíme“ hlas.' }, { notify: 'Katka: „Nerušíme? Jasné, že ruším. Dvíhaš?“' }] });
  P({ id: 'nina_a_ex', intrude: 'popup', fam: 'nina', icon: '💥', title: 'DVOJITÝ PRÚSER: Katka aj ex v bistre', win: W(11.5, 14.5), w: 1.2, dayW: { nove_zamky: 2 }, forget: 20,
    onStart: () => { const p = hsPos('pult'); if (p) { setNpc('ex', { x: p.x + 2, z: p.z + 1, visible: true }); setNpc('nina', { x: p.x - 3, z: p.z + 2, visible: true }); } }, onEnd: () => { setNpc('ex', { visible: false }); setNpc('nina', { visible: false }); },
    steps: [ch('nina_ex', 'pult', 'Prežiť toto')], forgetFx: { nervy: 15, dad: -2 }, forgetSay: 'Zistili to samy. Teraz sedia pri jednom stole. Smejú sa. Na tebe.',
    variants: [{ notify: 'Katka pri okne. Simona pri pulte. Dana ti ukazuje gestom „utekaj“.' }] });
  P({ id: 'nina_pise_uspavanie', intrude: 'sms', fam: 'nina', icon: '📱', title: 'Katka píše počas uspávania', win: W(19.5, 21.5), w: 2, dayW: {}, forget: 20, cond: () => { const k = kid(); return k && (k.state === 'home' || k.state === 'sick'); },
    steps: [ph('nina_pise', 'Riešiť mobil')], forgetFx: { nervy: 3 }, forgetSay: 'Mobil bzučal 11×. Nelka: „Tati, to je Katka?“ Vie meno. Kurnik.',
    variants: [{ notify: 'Mobil bzučí. Katka. Nelka má oči otvorené. Obe čakajú.' }] });
  P({ id: 'nina_vylet', fam: 'nina', icon: '🏕️', title: 'Katka chce ísť na výlet', win: W(12, 21), w: 1.5, dayW: { vylet: 1.5 }, forget: 50,
    steps: [ph('nina_vylet', 'Zdvihnúť Katke', true)], forgetFx: { nervy: 3 }, forgetSay: 'Katka si kúpila lístok sama. Pre jednu osobu.',
    variants: [{ notify: 'Katka: „Víkend. Chata. Víno. Bez psa, bez dieťaťa.“ Tri podmienky, tri problémy.' }] });
  P({ id: 'nina_kokes', intrude: 'sms', fam: 'nina', icon: '🐾', title: `Katka: „${DOG} ma má radšej“`, win: W(15, 22), w: 1.4, dayW: {}, forget: 40,
    steps: [ph('nina_kokes', 'Odpísať Katke')], forgetFx: { nervy: 2 }, forgetSay: 'Katka poslala fotku Bundáša. Z tvojho gauča. Kedy to bolo?!',
    variants: [{ notify: `Katka (SMS): „${DOG} ma má viac rád ako teba. Dôkaz: priložená fotka.“` }] });

  // ===== Výlet / zámky =====
  P({ id: 'vylet', intrude: 'sms', fam: 'vylet', icon: '🚌', title: 'Škôlkarský výlet: veci do 8:30', win: W(6.5, 7.5), w: 0.4, dayW: { vylet: 8, normal: 0.3, timea_chora: 0 }, deadline: 8 * 60 + 30, noForget: true,
    steps: [hold('linka', 2, 'Spraviť desiatu (drž E)', { give: 'desiata', say: 'Chlieb, syr, jablko. A keksík, lebo si slaboch.' }), go('botnik', 'Pršiplášť z botníka', { give: 'prsiplast', say: 'Pršiplášť s kačičkami. Trochu malý. Pôjde.' }), hold('notebook', 1, 'Podpísať súhlas (drž E)', { give: 'podpis', say: 'Podpis na papieri z minulého mesiaca. Lepšie neskoro.' }), go('satna', 'Odovzdať všetko v škôlke', { need: { item: ['desiata', 'prsiplast', 'podpis'] }, take: ['desiata', 'prsiplast', 'podpis'], say: 'Učiteľka: „Všetko máte? Prekvapenie.“' })],
    reward: { dad: 5, nervy: -5 }, failFx: { dad: -6, nervy: 10 }, failSay: `Autobus odišiel. ${KID} ostala s pani kuchárkou. Zoo bola bez nej.`,
    variants: [{ notify: `Učiteľka (SMS 6:40): „Dnes výlet do zoo! Desiata, pršiplášť, podpísaný súhlas. Do 8:30!“` }] });
  P({ id: 'zamocnik_termin', fam: 'vylet', icon: '🔧', title: 'Zámočník nemá termín', win: W(9, 16), w: 0.8, dayW: { nove_zamky: 5 }, forget: 60,
    steps: [ph('zamocnik_termin', 'Zavolať zámočníkovi', true)], forgetFx: { nervy: 5 }, forgetSay: 'Zámočník ti dal termín. O tri týždne. Sám si nezavolal.',
    variants: [{ notify: 'Zámočník: „Termín? Haha. Dobrý vtip.“' }, { notify: 'Zámočníctvo nedvíha. Pri dverách lístok: „Som na obede. Od 9:00.“' }] });
  P({ id: 'kluce_babka', intrude: 'call', caller: 'Babka', fam: 'vylet', icon: '🗝️', title: 'Nové kľúče pre babku', win: W(10, 18), w: 0.8, dayW: { nove_zamky: 5, babka_navsteva: 2 }, forget: 150,
    steps: [hold('zamocnik', 2, 'Dať spraviť kľúče (drž E)', { fx: { money: -18 }, give: 'klucenove', say: 'Dva kľúče. 18 €. Zámočník: „Tretí zadarmo?“ Nie, nikdy nie je zadarmo.' }), go('babka', 'Dať babke kľúče', { need: { item: 'klucenove' }, take: 'klucenove', say: 'Babka: „Konečne. Zasa som čakala na schodoch ako sirota.“' })],
    reward: { dad: 2, nervy: -3 }, forgetFx: { nervy: 6 }, forgetSay: 'Babka stála pred dverami 40 minút. Susedia už vedia všetko.',
    variants: [{ notify: 'Babka: „Paťko, od nových zámkov ja kľúč nemám. Ako mám strážiť Nelku?“' }] });
  P({ id: 'kluc_v_batohu', intrude: 'popup', fam: 'vylet', icon: '🎒', title: `Kľúč v batohu ${KIDGEN}`, win: W(15, 18), w: 0.8, dayW: { nove_zamky: 4 }, forget: 90, cond: (S) => S.flags.kidAtSkolka,
    steps: [ch('kluc_batoh', 'satna', 'Prehľadať batoh')], forgetFx: { nervy: 8 }, forgetSay: 'Večer pred dverami. Kľúč v škôlke. Škôlka zavretá. Babka má náhradný. Babka má zumbu.',
    variants: [{ notify: `Stop. Jediný kľúč od nových zámkov má ${KID}. V batohu. V škôlke.` }] });

  // ===== Papiere / telefón =====
  P({ id: 'uctovnicka', intrude: 'call', fam: 'papiere', icon: '🧾', title: 'Účtovníčka chce bločky', win: W(8, 17), w: 2, dayW: { vyplata: 1.5 }, forget: 150,
    steps: [ph('uctovnicka', 'Zdvihnúť Gabike', true), hold('sanon', 3, 'Nájsť bločky v šanóne (drž E)', { give: 'blocky', say: 'Bločky: 47 kusov. 12 z Fabie. 3 nečitateľné. 1 s hranolkou.' }), go('posta', 'Poslať bločky poštou', { need: { item: 'blocky' }, take: 'blocky', fx: { money: -3.2 } })],
    reward: { rep: 2, focus: 2 }, forgetFx: { money: -60 }, forgetSay: 'Gabika to spravila „odhadom“. Odhad stál 60 € navyše.',
    variants: [{ notify: 'Gabika: „Bločky za september. DNES.“' }, { notify: 'Gabika (SMS): „Ak nebudú bločky do 17:00, dávam výpoveď. Tebe.“' }] });
  P({ id: 'dodavatel_ceny', intrude: 'sms', caller: 'Dodávateľ', fam: 'papiere', icon: '📈', title: 'Dodávateľ zdražel', win: W(8, 16), w: 1.6, dayW: { vyplata: 1.3 }, forget: 100,
    steps: [ph('dodavatel_ceny', 'Riešiť ceny')], forgetFx: { money: -40 }, forgetSay: 'Nové ceny platia. Nevyjednal si nič. 40 € navyše tento týždeň.',
    variants: [{ notify: 'Mail: „Aktualizácia cenníka od pondelka.“ Aktualizácia znamená hore.' }] });
  P({ id: 'banka_karta', fam: 'papiere', icon: '💳', title: 'Banka zablokovala kartu', win: W(8, 17), w: 1.5, dayW: { vyplata: 4 }, forget: 120,
    onStart: (q, S) => { S.cardBlocked = true; }, onEnd: (q, S) => { if (q.finished) S.cardBlocked = false; },
    steps: [ph('banka', 'Riešiť kartu', true)], reward: { nervy: -3 }, forgetFx: { money: -25, rep: -2 }, forgetSay: 'Platil si hotovosťou z pokladne. Gabika plače. Poplatok 25 €.',
    variants: [{ intrude: 'sms', caller: 'Banka', notify: 'SMS: „Vaša karta bola zablokovaná.“ Pri pokladni. S radom za sebou.' }, { intrude: 'popup', caller: 'Pokladníčka', notify: 'Pokladníčka: „Zamietnuté.“ Druhýkrát: „Zamietnuté.“ Rad vzdychá.' }] });
  P({ id: 'najom', intrude: 'call', fam: 'papiere', icon: '🏢', title: 'Nájom ide hore', win: W(9, 18), w: 1.3, dayW: { vyplata: 2 }, forget: 100,
    steps: [ph('najom', 'Zdvihnúť majiteľovi', true)], forgetFx: { money: -50 }, forgetSay: 'Nájom +15 %. Bez diskusie. Mlčanie je súhlas.',
    variants: [{ notify: 'Majiteľ priestorov volá. Volá len, keď chce peniaze. Vždy chce peniaze.' }] });
  P({ id: 'mama_ciapka', intrude: 'call', caller: 'Babka', fam: 'papiere', icon: '🧢', title: 'Babka: „Čiapka?“', win: W(7, 9.5), w: 2, dayW: { babka_navsteva: 2, dazd: 1.5 }, forget: 40,
    steps: [ph('mamaciapka', 'Odpovedať babke')], forgetFx: { dad: -1 }, forgetSay: 'Babka to vyriešila. Prišla do škôlky s tromi čiapkami.',
    variants: [{ notify: `Babka (7:12): „Má ${KID} čiapku?“ Nemá. Nikdy nemá.` }] });
  P({ id: 'nezname_cislo', intrude: 'call', caller: 'Neznáme číslo', fam: 'papiere', icon: '📞', title: 'Neznáme číslo', win: W(8, 21.5), w: 2.5, dayW: {}, forget: 15, repeatable: true,
    steps: [ph('nezname', 'Zdvihnúť?')], forgetFx: {}, forgetSay: '',
    variants: [{ notify: 'Neznáme číslo. Tretíkrát dnes.' }, { notify: 'Neznáme číslo. Predvoľba +420. Honzova mama?' }, { notify: 'Neznáme číslo. To isté ako včera. A predvčerom.' }] });
  P({ id: 'kamos_fabia', intrude: 'sms', caller: 'Dodo', fam: 'papiere', icon: '🛋️', title: 'Dodo chce Fabiu', win: W(10, 19), w: 1.4, dayW: {}, forget: 90,
    steps: [ph('kamos_fabia', 'Odpísať Dodovi')], forgetFx: { nervy: 2 }, forgetSay: 'Dodo: „Seen.“ Urazený do stredy.',
    variants: [{ notify: 'Dodo: „Brácho, Fabiu na sobotu? Gauč.“' }] });
  P({ id: 'kamos_pivo', intrude: 'sms', caller: 'Dodo', fam: 'papiere', icon: '🍺', title: 'Dodo: „Pivko o 6?“', win: W(12, 18), w: 2, dayW: { futbal: 2.5 }, forget: 90,
    steps: [ph('kamos', 'Odpísať Dodovi')], forgetFx: { nervy: 3 }, forgetSay: 'Dodo: „Seen o 14:02.“ Urazil sa.',
    variants: [{ notify: 'Dodo: „Pivko o 6? Len jedno!“' }, { notify: 'Dodo: „Dnes hrá Slovan! Pivo! Nehovor nie!“' }] });
  P({ id: 'holic', intrude: 'sms', caller: 'Holič Juro', fam: 'papiere', icon: '💈', title: 'Holič má termín', win: W(7, 21.5), w: 1.6, dayW: {}, forget: 100,
    steps: [ph('holic', 'Odpísať holičovi')], forgetFx: { rep: -1 }, forgetSay: 'Termín prepadol. Brada vyhrala.',
    variants: [{ notify: 'Holič Juro: „Brada ti už žije vlastným životom. Prídeš?“' }] });
  P({ id: 'zubar', intrude: 'call', caller: 'Zubárka', fam: 'papiere', icon: '🦷', title: 'Zubárka volá', win: W(8, 16), w: 1.3, dayW: {}, forget: 60,
    steps: [ph('zubar', 'Zdvihnúť zubárke', true)], forgetFx: { focus: -1 }, forgetSay: 'Zubárka volala. Zub sa ozval sám. Večer.',
    variants: [{ notify: 'Zubárka. Po dvoch rokoch. Ako to vie?!' }] });
  P({ id: 'pokuta_posta', intrude: 'none', fam: 'papiere', icon: '✉️', title: 'Pokuta na pošte', win: W(9, 17), w: 1.6, dayW: { vyplata: 1.6 }, deadline: 17 * 60 + 30, forget: 200,
    steps: [pay('posta', 40, 'Zaplatiť pokutu na pošte', { paySay: 'Úradníčka: „Ďalší!“ Bez úsmevu. Ako vždy.' })],
    reward: { focus: 2 }, failFx: { money: -65 }, failSay: 'Pokuta nezaplatená. Prišla znova. S úrokom. 65 €.', forgetFx: { focus: -2 }, forgetSay: 'Žltý lístok leží na linke. Zajtra bude oranžový.',
    variants: [{ notify: 'Žltý lístok v schránke: „Doporučene – pokuta 40 €.“ Za čo? Nevieš. Nikdy nevieš.' }] });
  P({ id: 'balik', intrude: 'sms', caller: 'Pošta', fam: 'papiere', icon: '📦', title: 'Balík: posledný deň na pošte', win: W(9, 16), w: 1.8, dayW: {}, deadline: 17 * 60, forget: 200,
    steps: [hold('posta', 1.5, 'Vyzdvihnúť balík (drž E)', { say: 'Balík. Objednal si… svetielka pre Nelku. V júli. Konečne.' })],
    reward: { dad: 2 }, failFx: { money: -22 }, failSay: 'Balík išiel späť. Vrátenie poštovného 22 €. Svetielka v Číne.',
    variants: [{ notify: 'SMS: „Zásielka čaká posledný deň na pošte.“ Čo je to? Netušíš.' }] });
  P({ id: 'babka_vola', intrude: 'call', fam: 'papiere', icon: '👵', title: 'Babka volá', win: W(8, 19), w: 2, dayW: { babka_navsteva: 0.3 }, forget: 80,
    steps: [ph('babka_vola', 'Zavolať babke')], forgetFx: { dad: -1, nervy: 4 }, forgetSay: 'Babka volala 6×. Teraz volá susedke, či žiješ.',
    variants: [{ notify: 'Babka: „Paťko, zjedol si niečo?“' }] });
  P({ id: 'babka_upratala', fam: 'papiere', icon: '🧹', title: 'Babka „upratala“', win: W(7, 9), w: 0.3, dayW: { babka_navsteva: 8, normal: 0 }, forget: 120,
    steps: [hold('sanon', 2, 'Nájsť faktúry po babkinom upratovaní (drž E)', { say: 'Faktúry v šanóne „Recepty 1994“. Logika babky.' })],
    reward: { nervy: -2 }, forgetFx: { money: -45 }, forgetSay: 'Faktúra sa nenašla. Penále 45 €. Babka: „Ja som nič nevyhodila!“',
    variants: [{ notify: 'Babka: „Upratala som ti tie papiere, čo sa váľali.“ Faktúry. Váľali sa faktúry.' }] });

  // ===== ADHD =====
  P({ id: 'sporak_doma', intrude: 'popup', fam: 'adhd', icon: '🍳', title: 'Nechal si doma zapnutý sporák?!', win: W(8, 12), w: 1.6, dayW: { zaspal: 2 }, deadlineRel: 60, removeOnFail: true,
    steps: [go('linka', 'Skontrolovať sporák', { say: 'Platnička horúca. Hrniec prázdny. Čierny. Bol to dobrý hrniec.' })],
    reward: { nervy: -6 }, failFx: { money: -200, nervy: 15 }, failSay: 'Sused volal hasičov. Dym, nie oheň. Hrniec mŕtvy, kuchyňa čierna, 200 €.',
    variants: [{ notify: 'Moment. Vypol si sporák po kaši? Nevieš. Nikdy nevieš.' }, { notify: 'Sused (SMS): „Paťo, z tvojho okna ide para. Alebo dym. Neviem.“' }] });
  P({ id: 'mobil_v_ruke', fam: 'adhd', icon: '📱', title: 'Kde mám mobil?!', win: W(7, 22), w: 2, dayW: {}, forget: 10,
    steps: [auto('mobil')], reward: {}, variants: [{ notify: 'Mobil. Kde je. Vrecká prázdne. Panika.' }] });
  P({ id: 'sklad_preco', intrude: 'none', fam: 'adhd', icon: '🤔', title: 'Prečo som v sklade?', win: W(9, 17), w: 2, dayW: {}, forget: 20,
    steps: [go('regal', 'Ísť do skladu… po niečo', { say: 'Stojíš pred regálom. Prečo? Cibuľa? Obaly? Nič? Berieš cibuľu. Pre istotu.' })],
    reward: { focus: -2 }, forgetFx: {}, forgetSay: '',
    variants: [{ notify: 'Niečo potrebuješ zo skladu. Niečo dôležité. Choď, kým si pamätáš.' }] });
  P({ id: 'kupil_ine', fam: 'adhd', icon: '🍍', title: 'Kúpil si niečo iné', win: W(10, 16), w: 1.5, dayW: {}, forget: 15, cond: () => { const m = M(), p = player(); const l = m && m.locAt && p && m.locAt(p.x, p.z); return !!(l && l.id === 'metro'); },
    steps: [auto('kupil_ine')], reward: {}, variants: [{ notify: 'Pozrieš do košíka. Toto nie je zoznam.' }] });
  P({ id: 'kava_vychladla', intrude: 'none', fam: 'adhd', icon: '☕', title: 'Káva vychladla', win: W(7, 20), w: 2, dayW: {}, forget: 40,
    steps: [hold(['kavovar_byt', 'kavovar_pumpa', 'pult'], 1, 'Zohriať kávu (drž E)', { fx: { focus: 8 }, say: 'Mikrovlnka. Tretíkrát tá istá káva. Chutí ako rozhodnutia.' })],
    reward: {}, forgetFx: { focus: -3 }, forgetSay: 'Káva studená. Štvrtá dnes. Nepil si ani jednu.',
    variants: [{ notify: 'Káva. Uvarená o 7:10. Je 10:40. Studená. Ani si ju neochutnal.' }, { notify: 'Hrnček na pulte. Plný. Studený. Tvoj. Odkedy?' }] });
  P({ id: 'hyperfokus', fam: 'adhd', icon: '🧹', title: 'Hyperfokus: zlá vec', win: W(10.5, 12.5), w: 1.8, dayW: { kontrola: 1.5 }, forget: 5,
    onStart: (q, S) => { S.pending.push({ t: 0.5, id: 'hyperfokus_sklad' }); },
    steps: [], reward: {}, variants: [{ notify: 'Regál je krivý. Všimol si si to. Už to neodvidíš.' }] });
  P({ id: 'zabudol_parkovat', fam: 'adhd', icon: '🅿️', title: 'Kde som zaparkoval?', win: W(10, 18), w: 1.6, dayW: {}, forget: 15, cond: () => { const c = car(), p = player(); return c && p && !p.inCar && dist(c, p) > 60; },
    onStart: (q, S) => { S.hideCarArrow = S.time + 20; },
    steps: [auto('zabudol_park')], reward: {}, variants: [{ notify: 'Fabia. Kde. Šípka k autu zmizla. Tvoj mozog tiež.' }] });
  P({ id: 'tiktok', fam: 'adhd', icon: '🎵', title: 'TikTok ti zožral čas', win: W(7, 22), w: 2.2, dayW: {}, forget: 10,
    onStart: () => fx({ time: 10, focus: -5 }),
    steps: [auto('tiktok')], reward: {}, variants: [{ notify: '„Len jeden recept.“ +10 minút. −5 fokus. Melón 14 spôsobmi.' }, { notify: 'Scroll. Scroll. Scroll. Hodiny: +10 min. Kam sa podeli?' }] });
  P({ id: 'zabudol_zamknut', intrude: 'popup', fam: 'adhd', icon: '🚪', title: 'Zamkol som bistro?', win: W(19, 23), w: 1.4, dayW: {}, forget: 30, cond: () => { const m = M(), p = player(); const l = m && m.locAt && p && m.locAt(p.x, p.z); return !(l && l.id === 'bistro'); },
    steps: [go('pult', 'Skontrolovať, či je zamknuté', { say: 'Zamknuté. Bolo zamknuté. Vždy je zamknuté. Prišiel si zbytočne. Zase.' })],
    reward: { nervy: -4 }, forgetFx: { nervy: 6, energy: -3 }, forgetSay: 'Nespal si. Myslel si na dvere. Boli zamknuté.',
    variants: [{ notify: 'Zamkol si bistro? Asi hej. Asi. Mozog: „ASI?!“' }] });

  // ============================================================
  //  SOCIÁLNE UDALOSTI (v3.1): večera s Katkou v krčme, kávy v bistre, pivo u Doda, trapasy
  //  Všetko vyžaduje reálne prísť na miesto (krcma / riso / bistro / vo_pokladna ...).
  // ============================================================
  const flags = () => G.S.flags;
  const inLoc = (id) => { const m = M(), p = player(); const l = m && m.locAt && p ? m.locAt(p.x, p.z) : null; return !!(l && l.id === id); };
  // Nelka fyzicky viaže večer, kým nie je uspatá / u babky / v škôlke / u Simony
  const kidBusy = () => {
    const S = G.S; if (!S || !S.kidWithMe || S.flags.babysat || S.doneIds.has('uspavanie')) return false;
    const k = kid();
    return !(k && (k.state === 'skolka' || k.state === 'away'));
  };
  const riaMood = (n) => { const f = flags(); f.riaMood = clamp((f.riaMood || 0) + n, -5, 5); };
  const addBeer = (n) => {
    const S = G.S, f = S.flags;
    f.drinkBeers = (f.drinkBeers || 0) + n;
    if (f.drinkBeers >= 2 && !f.noDrive) {
      f.noDrive = true; f.noDriveUntil = 26 * 60; // do 02:00
      toast('🍺 Dve pivá. Do Fabie nesadneš.', 'bad');
      log('🍺 Dve pivá – šoférovanie zakázané');
      S.pending.push({ t: 2, id: 'taxi' });
    }
  };
  // jednoduchý builder možností: spec = { fx, say, mood, trap, beer, flag, pushId } alebo { p, a, b } (náhoda)
  const mkOpt = (t, spec) => ({ t, run: () => {
    const r = spec.p != null ? Object.assign({}, spec, rand() < spec.p ? spec.a : spec.b) : spec;
    if (r.trap) toast('😳 Trapas', 'bad');
    if (r.lucky) toast('🍀 Šťastie', 'good');
    if (r.mood) riaMood(r.mood);
    if (r.beer) addBeer(r.beer);
    if (r.run) r.run(G.S);
    return { fx: r.fx, say: r.say, flag: r.flag, pushId: r.pushId, pushDelay: r.pushDelay };
  } });
  const O = mkOpt;
  const CHO = (q, who, icon, opts) => ({ q, who, icon, opts });
  // NPC sa zjaví pri hotspote; pôvodná pozícia/viditeľnosť (kuchyňa, bistro) sa uloží a po udalosti obnoví
  const showNpc = (id, at, dx, dz, sit) => {
    const p = hsPos(at), a = A(), S = G.S;
    if (!p) return;
    S.npcSaved = S.npcSaved || {};
    const n = a && a.npcs && a.npcs[id];
    if (!(id in S.npcSaved)) S.npcSaved[id] = n ? { x: n.x, z: n.z, visible: !!n.visible, sit: !!n.sit } : null;
    setNpc(id, { x: p.x + dx, z: p.z + dz, visible: true, sit: !!sit });
  };
  const hideNpcs = (ids) => ids.forEach(id => {
    const S = G.S, sv = S && S.npcSaved && S.npcSaved[id];
    if (S && S.npcSaved && id in S.npcSaved) { delete S.npcSaved[id]; if (sv) { setNpc(id, sv); return; } }
    setNpc(id, { visible: false });
  });

  // ---------- Večera s Katkou: náhodný trapas pri stole ----------
  const ENC = {
    joff: { npcs: [['joff', 5, 2]], ch: () => CHO('Pri vedľajšom stole sedí Boris. S pivom. Pozerá na teba, na Katku, na sviečku a potom si v hlave rátá marže. „Paťo? Na rande? Keď sú čísla bistra také, aké sú?“', 'Boris', '📊', [
      O('„Pracovná večera. S dodávateľkou.“', { p: 0.4, a: { fx: { rep: 1, nervy: 8 }, mood: -1, say: 'Boris: „Dodávateľka má pekné nechty.“ Pustil to. Zatiaľ.' }, b: { trap: 1, fx: { rep: -3, nervy: 14, focus: -12 }, mood: -1, say: 'Katka: „Dodávateľka?!“ Boris sa usmial. Prvýkrát od januára.' } }),
      O('Predstaviť Katku ako „kolegyňu z účtovníctva“', { trap: 1, fx: { rep: -1, nervy: 10, focus: -10 }, mood: -2, say: 'Katka si dolieva víno s pohľadom, ktorý topí ľad. Boris: „Z účtovníctva? Gabika o nej nevie.“' }),
      O('Pozvať Borisa k stolu a zaplatiť mu pivo', { fx: { money: -18, rep: 2, nervy: 12, focus: -8 }, mood: 0, say: 'Boris si objednal to najdrahšie pivo. A tatárak. A bruchom tlačí na tvoj rozpočet aj na rande.' }),
      O('Schovať sa za jedálny lístok', { trap: 1, fx: { focus: -15, nervy: 8 }, mood: -1, say: 'Boris: „Vidím ťa, Paťo. Máš obrovské uši. A jedálny lístok je hore nohami.“' }),
    ]), after: 'joff' },
    miska: { npcs: [['miska', 5, 2]], ch: () => CHO('Do krčmy vchádza Hanka. Vidí ťa. Kráča rovno k tebe. „Paťo! Dobre, že ťa vidím — to nové menu: aké sú ceny? Teraz, hneď, kým si pamätám.“ Katka drží vidličku vo vzduchu.', 'Hanka', '📋', [
      O('Odpovedať vážne, s číslami, nad sviečkou', { fx: { focus: -12, rep: 2, nervy: 6 }, mood: -1, say: 'Katka: „Takže to menu je dôležitejšie než polievka?“ Polievka vychladla. Tiež.' }),
      O('„Hanka, v pondelok. Prosím.“', { p: 0.5, a: { fx: { rep: -1, nervy: 3 }, mood: 1, say: 'Hanka si všimla Katku. „Aha. Pardon.“ Zmizla. Katka sa usmiala. Skoro.' }, b: { trap: 1, fx: { rep: -3, nervy: 12, focus: -8 }, mood: -1, say: 'Hanka: „V pondelok bude neskoro, Paťo.“ A sadla si k stolu. Na tretiu stoličku.' } }),
      O('Pozvať ju na dezert a spoločné plánovanie menu', { trap: 1, fx: { rep: 3, nervy: 14, focus: -14, money: -12 }, mood: -2, say: 'Tri hodiny o sezónnych surovinách. Katka si objednala taxi. Pre seba.' }),
    ]) },
    simon: { npcs: [['simon', 5, 2]], ch: () => CHO('Ondro prišiel s tanierom ochutnávky a potkal ťa pri stole. „Paťo! Skvelé, že ťa vidím! Ochutnaj, tatárak z novej dodávky. A pani? Ochutnajte aj vy, prosím.“ Katka hľadí na surové mäso a potom na teba.', 'Ondro', '🍽️', [
      O('Ochutnať nadšene', { fx: { rep: 3, nervy: 8, focus: -8 }, mood: -1, say: 'Ondro: „Je to z Wayanovho sambalu!“ Katka je vegetariánka od utorka. Vieš to od teraz.' }),
      O('Presvedčiť Katku, aby ochutnala', { p: 0.4, a: { lucky: 1, fx: { rep: 4, nervy: -3 }, mood: 2, say: 'Katka zjedla. Zdvihla obočie. „Je to… dobré.“ Ondro sa rozplýva. Si hrdina.' }, b: { trap: 1, fx: { rep: -2, nervy: 14, focus: -12 }, mood: -2, say: 'Katka vypľula do servítky. Ondro to videl. Ondro vždy vidí.' } }),
      O('Vysvetliť Ondrovi, že máte rande', { trap: 1, fx: { nervy: 10, focus: -10, rep: -1 }, mood: 0, say: 'Ondro: „Rande?! S kým?“ Katka: „S ním.“ Ondro: „…Ale zaplatí firma.“ Nezaplatí.' }),
      O('Schovať Katku pod stôl a predstierať, že tu nikto nie je', { trap: 1, fx: { focus: -18, nervy: 18 }, mood: -3, say: 'Katka vyšla spod obrusu s vlasmi v polievke. Dvere, buch. Ondro: „Ty máš tu zase to svoje.“' }),
    ]) },
    staff: { npcs: [['agus', 5, 2], ['fredy', 6, -1], ['benji', 4, -2]], ch: () => CHO('Pri vedľajšom stole sedia Wayan, Santi a Honza. Santi zdvihne pohár: „¡Jefe! ¡Con la novia!“ Honza: „Hele šéfe, to je ta Katka? Tundemu to musím napsat.“', 'Santi', '🍺', [
      O('Pozvať ich k stolu', { fx: { money: -22, rep: 1, nervy: 12, focus: -10 }, mood: -2, say: 'Wayan hovorí Katke o Bali tri hodiny. Honza jej ukazuje fotky z lednice. Katka: „Veľa vás je.“' }),
      O('Poslať ich domov: „Zajtra o šiestej.“', { trap: 1, fx: { rep: -2, nervy: 8, focus: -8 }, mood: 0, say: 'Santi: „Jefe, hoy es tu noche.“ Honza: „Já tu sedím první!“ Nikto neodišiel.' }),
      O('Hrať, že ich nepoznáš', { p: 0.3, a: { fx: { nervy: -2, focus: -4 }, mood: 1, say: 'Santi sa nechal vtiahnuť: „Perdón, señor, ¿cocina?“ Katka sa zasmiala. Fungovalo. Zázrak.' }, b: { trap: 1, fx: { rep: -2, nervy: 10, focus: -10 }, mood: -1, say: 'Honza nahlas: „Šéfe, to je v pohodě, vždyť sme ti včera robili obed!“' } }),
    ]) },
    tamara: { npcs: [['tamara', 5, 2], ['lucia', 6, 0]], ch: () => CHO('Dvere. Dana a Lenka. Sadnú si dva stoly od vás. Lenka sa nahlas šepká s Danou, obe pozerajú na Katku. Dana si fotí menu. Alebo vás. „Zajtra to bude vedieť celé bistro“, zamáva ti.', 'Dana', '👀', [
      O('Pristúpiť k nim a podplatiť ich dezertom', { fx: { money: -16, nervy: 8, focus: -8, rep: 1 }, mood: -1, say: 'Dana: „Dvojitý dezert. A my sme nič nevideli.“ Lenka už píše správu. Aj tak.' }),
      O('Zamávať a sadnúť si tak, aby ťa nevideli', { trap: 1, fx: { focus: -12, nervy: 10 }, mood: -1, say: 'Sadol si na stoličku, ktorá je pre dieťa. Katka: „Čo robíš?“ Ty: „Nič.“' }),
      O('Nechať to tak: „Nech si hovoria“', { fx: { rep: -2, nervy: 6 }, mood: 1, say: 'Katka: „Ty sa nehanbíš?“ Ty: „Už nie.“ Klamstvo, ale zabralo.' }),
    ]) },
    vanda: { npcs: [['ex', 6, 2], ['marek', 7, 3.2]], ch: () => CHO('Dvere. Simona. S novým chlapom. Vysoký, svalnatý, usmieva sa príliš. Sadnú si do rohu — dva metre od vás. Simona ťa uvidí, uvidí Katku, pozrie sa na nového. Nikto nevie, kam s očami.', 'Simona', '💥', [
      O('Zamávať a predstaviť sa novému: „Paťo, bistro.“', { p: 0.4, a: { fx: { nervy: 8, focus: -8, dad: 1 }, mood: 1, say: 'Nový: „Radoš, fitness.“ Simona zamrzla. Katka sa uškrnula. Prvé body za civilizovanosť.' }, b: { trap: 1, fx: { nervy: 16, focus: -14, dad: -1 }, mood: -1, say: 'Radoš ti podal ruku. Pevne. Ruka ťa bolí. Simona: „Zlatko, to je Paťo. Otec našej dcéry.“ Ticho.' } }),
      O('Predstaviť Katku: „To je Katka, moja… priateľka.“', { trap: 1, fx: { nervy: 14, focus: -10, dad: -1 }, mood: 1, say: 'Katka zdvihla bradu. Simona zdvihla obočie. Radoš zdvihol pohár. Ty zdvihol tlak.' }),
      O('Predstierať, že ťa trápi telefón', { fx: { focus: -15, nervy: 12, rep: -1 }, mood: -2, say: 'Držíš mobil hore nohami. Katka: „Paťo, je hore nohami.“ Simona sa smeje. Nahlas.' }),
      O('Odísť. Hneď. Cez zadné dvere.', { trap: 1, fx: { nervy: 10, focus: -12, money: -10 }, mood: -3, say: 'Katka: „Zaplatíš ty alebo ja?“ Zaplatil si. Aj za tú druhú fľašu, čo si nepil.' }),
    ]), after: 'vanda' },
    mlynar: { npcs: [], ch: () => CHO('K stolu pristúpi majiteľ krčmy, pán Hájek. „Ty si ten z bistra? Vaše boxy mi zachránili svadbu v sobotu. Víno dnes na účet podniku.“ Katka má zrazu iný pohľad na teba.', 'Hájek', '🍷', [
      O('Prijať víno a poďakovať', { lucky: 1, fx: { money: 20, rep: 3, nervy: -8, focus: 4 }, mood: 2, say: 'Katka: „Takže ty si niekto.“ Si. Raz za mesiac.' }),
      O('Zablafovať, že boxy robíš osobne', { p: 0.5, a: { lucky: 1, fx: { rep: 2, nervy: -4 }, mood: 1, say: 'Hájek: „Ruky ako zlato.“ Katka sleduje tie ruky. Dlho.' }, b: { trap: 1, fx: { nervy: 8, focus: -8 }, mood: -1, say: 'Hájek: „Ale veď boxy robí Wayan.“ Katka: „Wayan?“' } }),
    ]) },
  };
  const ENC_ALL = Object.keys(ENC);
  const ENC_W = { joff: 1, miska: 1, simon: 1, staff: 1, tamara: 1, mlynar: 0.5 };
  function rollEnc() {
    if (rand() < 0.25) return 'vanda';
    const ks = ENC_ALL.filter(k => k !== 'vanda');
    return weightedPick(ks, k => ENC_W[k] || 1) || 'joff';
  }

  P({ id: 'ria_vecera_babka', intrude: 'call', caller: 'Babka', fam: 'nina', icon: '👵', title: 'Babka stráži Nelku? (kvôli Katke)', win: W(17.5, 19.6), w: 1.4, dayW: {}, forget: 40, kidOnly: true, cond: (S) => kidBusy() && !S.flags.babysat,
    steps: [ph({ q: 'Katka chce večeru v krčme. Nelka je doma. Voláš babke, či ju postráži. Babka dvíha po šiestom zazvonení: „Paťko? A kto bude s dieťaťom? Katka?“', who: 'Babka', icon: '👵', opts: [
      { t: '„Babka, ide o večeru. S Katkou. Prosím.“', run: () => { const S = G.S; S.flags.babysat = true; S.doneIds.add('uspavanie'); kidSet('away'); log(`👵 Babka si vzala ${KIDACC}`); return { fx: { dad: -1, nervy: 6, money: -8 }, say: 'Babka: „Dobre. Ale ja jej poviem, že ocino je nezodpovedný.“ Prišla s taškou buchiet. Nasýtil by sa celý Sereď.' }; } },
      { t: '„Pracovná schôdzka, babka.“', run: () => { const S = G.S; S.flags.babysat = true; S.doneIds.add('uspavanie'); kidSet('away'); const bad = rand() < 0.5; return { fx: bad ? { nervy: 10, dad: -1 } : { nervy: 3 }, say: bad ? 'Babka: „V takých šatách? Katka ti vybrala kravatu, hej?“ Babka vie všetko. Od vždy.' : 'Babka: „Schôdzka. Jasné. Dones mi vtedy pohľadnicu.“' }; } },
      { t: 'Zrušiť to: „Nemám kto strážiť.“', run: () => { riaMood(-1); return { fx: { nervy: 4, dad: 1 }, say: 'Katka: „Ok.“ Dve písmená. Nie je to ok.' }; } },
    ] }, 'Zavolať babke', true)],
    forgetFx: { nervy: 4 }, forgetSay: 'Babka sa už neozvala. Katka si objednala pizzu sama.', onEnd: (q) => { if (!q.finished) riaMood(-1); },
    variants: [{ notify: 'Katka (SMS): „Dnes? U Hájka? Alebo ťa mám zavolať rovno ja babke?“ (Nelka je s tebou.)' }, { notify: 'Katka: „Mám rezerváciu na 19:30. Mimochodom, Nelka spí, hej?“ Nespí.' }] });

  P({ id: 'ria_vecera', intrude: 'sms', caller: 'Katka', fam: 'nina', icon: '🍷', title: 'Večera s Katkou U Hájka', win: W(18, 21.5), w: 2.1, dayW: {}, deadlineRel: 150, removeOnFail: true, forget: 120,
    cond: (S) => !kidBusy() && !S.flags.noDriveSkip,
    onStart: (q, S) => { q.data.bill = 28 + ri(0, 18); },
    onEnd: (q, S) => { hideNpcs(['nina', 'joff', 'miska', 'simon', 'agus', 'fredy', 'benji', 'tamara', 'lucia', 'ex', 'marek']); if (!q.finished) riaMood(-2); },
    steps: [
      go(['krcma_bar'], 'Prísť do krčmy U Hájka', { say: 'Vôňa dreva, pivo, guláš. Katka už sedí pri stole a mávne ti. Nebudeš sa môcť schovať.' }),
      hold('krcma_stol', 4, 'Sadnúť si k Katke (drž E)', { onDone: (q, S) => {
        showNpc('nina', 'krcma_stol', 0, -1.4, true);
        q.data.enc = rollEnc();
        const e = ENC[q.data.enc];
        e.npcs.forEach(n => showNpc(n[0], 'krcma_stol', n[1], n[2], true));
        if (q.data.enc === 'joff') S.flags.joffSawDate = true;
        log(`😳 U Hájka: ${q.data.enc}`);
      }, say: 'Sviečka. Víno. Katka sa usmieva. Čo by sa mohlo pokaziť? (všetko)' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: (q) => ENC[q.data.enc || 'joff'].ch() },
      pay('krcma_bar', (q) => q.data.bill || 38, 'Zaplatiť večeru', { paySay: 'Účet. Katka: „Ďakujem, bolo to… pamätné.“ Pamätné, ako povodeň.' }),
    ],
    reward: (q) => ({ nervy: -6, dad: -0, focus: 2, energy: -4 }),
    chain: [{ id: 'ria_pise_po_vecere', p: 1, delay: 55, on: 'done' }, { id: 'joff_pondelok', p: 0.2, delay: 90, on: 'done' }],
    failFx: { nervy: 6, rep: -1 }, failSay: 'Katka čakala v krčme 40 minút. Posledná správa: „Ok.“',
    variants: [{ notify: 'Katka (SMS): „Dnes večer? U Hájka. 19:30. A nechoď v tom tričku od omáčky.“' }, { notify: 'Katka: „Rezervovala som stôl. Dnes má byť ten dobrý guláš. Alebo si ma zabudol?“' }, { notify: 'Katka (SMS): „Večera. Ty, ja, sviečka. Nikto iný. Slúbil si.“ Nikto iný — to zasa ktovie.' }] });

  P({ id: 'ria_pise_po_vecere', intrude: 'sms', caller: 'Katka', fam: 'nina', icon: '📱', title: 'Katka píše po večeri', w: 0, dayW: {}, forget: 60,
    steps: [ph({ q: (q, S) => { const m = S.flags.riaMood || 0; return m >= 2 ? 'Katka (SMS): „Bola to super večera. Aj ten Boris. Aj Simona. Aj tvoje uši. 😘 Zajtra znova?“' : m <= -2 ? 'Katka (SMS): „Dobrú noc. Ďalšiu večeru ti plánuje Dana. Hlavne nech je tam aj Boris.“' : 'Katka (SMS): „Bolo to fajn. Nabudúce bez publika, dobre?“'; }, who: 'Katka', icon: '💅', opts: [
      { t: 'Poslať srdiečko', run: () => ({ fx: { nervy: -4 }, say: (G.S.flags.riaMood || 0) <= -2 ? 'Katka: „Srdiečko. Hm.“ Odpoveď typu kameň.' : 'Katka: „😘“ Si späť v hre.' }) },
      { t: '„Nabudúce poznáme len my dvaja.“', run: () => { riaMood(1); return { fx: { nervy: -6, focus: -3 }, say: 'Katka: „Sľub?“ Sľúbil si. Zase.' }; } },
      { t: 'Nechať ju na čítanie', run: () => { riaMood(-1); return { fx: { nervy: 5 }, say: 'Katka: „Videla som, že si to čítal.“ Modré fajky. Prekliate fajky.' }; } },
    ] }, 'Odpísať Katke')],
    variants: [{ notify: 'Katka (SMS): správa o večeri. Tri bodky. Potom text. Potom ďalšie tri bodky.' }] });

  P({ id: 'joff_pondelok', intrude: 'call', caller: 'Boris', fam: 'bistro', icon: '📞', title: 'Boris: „Videl som ťa.“', w: 0, dayW: {}, forget: 40, cond: (S) => !S.flags.joffSawDate,
    steps: [ph({ q: 'Boris: „Paťo? Videl som ťa. Včera. U Hájka. So sviečkou. Čísla bistra sú nižšie ako tvoj hlas, vieš?“', who: 'Boris', icon: '📊', opts: [
      { t: 'Priznať všetko', fx: { rep: -2, nervy: 8, focus: -8 }, say: 'Boris: „Aspoň si úprimný. Pošli mi marže, aj tak.“ Ríša sa mu zaleskla. Alebo sa ti zdá.' },
      { t: 'Zapierať: „To som nebol ja.“', run: () => { const bad = rand() < 0.6; if (bad) toast('😳 Trapas', 'bad'); return bad ? { fx: { rep: -4, nervy: 12, focus: -10 }, say: 'Boris: „Mám fotku.“ Má fotku. Jeho manželka ju fotila.' } : { fx: { nervy: 4 }, say: 'Boris: „Hm. Podobný chlap.“ Prešlo. Tento raz.' }; } },
      { t: '„A ty si tam čo robil?“', fx: { rep: -1, nervy: 6 }, say: 'Boris: „Mal som tam manželku. Na výročie. Na rozdiel od teba mala meno.“ Au.' },
    ] }, 'Zdvihnúť Borisovi', true)],
    forgetFx: { rep: -2, nervy: 4 }, forgetSay: 'Boris nechal správu: „Zavolaj.“ Dve slová, tisíc interpretácií.',
    variants: [{ notify: 'Boris volá. Je pondelok. Hlas príliš pokojný.' }] });

  // ---------- Kávy s niekým (potrebujú prísť do bistra) ----------
  // person „dorazí“ po arriveAt (herné minúty); NPC sa zjaví pri pulte; potom hold 4 → choice
  function arriveCheck() {
    const S = G.S; if (!S) return;
    for (const q of S.stack) {
      if (q.data.arriveAt == null || q.data.arrived || !q.def.npcs || S.time < q.data.arriveAt) continue;
      q.data.arrived = true;
      q.def.npcs.forEach(n => showNpc(n[0], n[1] || 'pult', n[2] || 2.5, n[3] || 1, !!n[4]));
      toast(`☕ ${q.def.who || 'Hosť'} dorazil(a)`, 'info');
    }
  }
  const COFFEE_AT = ['kavovar_bistro', 'pult'];
  const coffee = (spec) => P({
    id: spec.id, intrude: spec.intrude || 'sms', caller: spec.caller, fam: spec.fam || 'social', icon: '☕', title: spec.title, win: spec.win || W(9, 16), w: spec.w || 1.2, dayW: spec.dayW || {}, forget: 70, who: spec.who,
    cond: spec.cond || ((S) => !S.bistroClosed), npcs: spec.npcs,
    onStart: (q, S) => { q.data.arriveAt = S.time + rr(6, 14); },
    onEnd: (q) => hideNpcs((q.def.npcs || []).map(n => n[0])),
    deadlineRel: 120, removeOnFail: true, failFx: spec.failFx || { rep: -1, nervy: 4 }, failSay: spec.failSay || `${spec.who} čakal(a) pri pulte pol hodiny. Odišiel(a) bez kávy aj bez slova.`,
    steps: [
      hold(COFFEE_AT, 4, `Dať si kávu s ${spec.whoDat || spec.who} (drž E)`, { fx: { focus: 15, energy: 4 }, say: spec.sip,
        ready: (q, S) => S.time >= (q.data.arriveAt || 0), readyMsg: (q, S) => `${spec.who} ešte nedorazil(a), asi ${Math.max(1, Math.ceil((q.data.arriveAt || 0) - S.time))} min` }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: spec.choice },
    ],
    reward: spec.reward || {}, forgetFx: spec.forgetFx, forgetSay: spec.forgetSay,
    variants: spec.variants,
  });

  coffee({ id: 'kava_s_simonom', who: 'Ondro', whoDat: 'Ondrom', title: 'Káva so Ondrom: ochutnávka', caller: 'Ondro', npcs: [['simon', 'pult', 2.5, 1.2]], sip: 'Ondro pije espresso ako víno — pomaly, s pauzami, s výrazom degustátora.',
    forgetSay: 'Ondro dopil sám. Vyriešil si to s kávovarom. Kávovar nič nehovorí.', forgetFx: { rep: -2 },
    choice: CHO('Ondro: „Paťo, tie nové jedlá chutia. Ale prečo je food cost vyšší ako moje IQ?“', 'Ondro', '☕', [
      O('Ponúknuť tasting plate zadarmo', { fx: { money: -12, rep: 3, focus: -4 }, say: 'Ondro: „Výborne. A tá zadarmo je najlepšia.“ Zjedol aj tvoju polovicu.' }),
      O('Vysvetliť food cost na servítke', { p: 0.5, a: { fx: { rep: 2, nervy: 4, focus: -6 }, say: 'Ondro: „Servítka je jasnejšia než Borisov Excel.“ Pochvala!' }, b: { fx: { rep: -2, nervy: 8, focus: -10 }, say: 'Ondro: „Servítka nie je Excel, Paťo.“ A položil ju do kávy.' } }),
      O('Odviesť reč na jeho dovolenku', { fx: { time: 20, nervy: 5, focus: -8 }, say: 'Chorvátsko, 20 minút. Panoramatické fotky. Kamarát Dino má loď. Dino má dlhy.' }),
      O('Predstierať, že mu zvoní mobil', { trap: 1, fx: { rep: -2, nervy: 9, focus: -6 }, say: 'Mobil nezvoní. Ale pípne ti alarm „Platba za dodávku!“ Ondro: „Tak to riešiť.“' }),
    ]),
    variants: [{ notify: 'Ondro (SMS): „Kávu? V bistre. Mám otázky o ochutnávke.“ Otázky, ktoré nepotrebujú odpoveď.' }, { notify: 'Ondro: „Kávu o chvíľu v bistre. Prinesiem tanier. Neboj, nejem sám.“' }] });

  coffee({ id: 'kava_s_miskou', who: 'Hanka', whoDat: 'Hankou', title: 'Káva s Hankou: nové menu', caller: 'Hanka', npcs: [['miska', 'pult', 2.5, 1.2]], sip: 'Hanka si položila na stôl notebook, tri notesy a dva telefóny. Káva hneď vychladla.',
    forgetSay: 'Hanka si menu napísala sama. Je v ňom šesť druhov tofu.', forgetFx: { rep: -3 },
    choice: CHO('Hanka: „Paťo, nové sezónne menu. Mám 14 nápadov. Všetky sú tvoje, ja len riadim.“', 'Hanka', '📋', [
      O('Všetko si zapísať', { fx: { focus: -8, rep: 2, time: 15 }, say: 'Zapisuješ. Prsty bolia. 14 nápadov, 3 z nich vykonateľné.' }),
      O('Schváliť všetko, nech skončíme', { fx: { money: -30, rep: 3, nervy: 8 }, say: 'Wayan bude plakať. Tunde bude spievať. Honza povie „to je v pohodě“.' }),
      O('Povedať, že kuchyňa je plná', { fx: { rep: -2, nervy: 5, focus: -4 }, say: 'Hanka: „Kuchyňa je vždy plná. Aj preto tam chodíš?“' }),
      O('Požiadať o tri nápady namiesto štrnástich', { p: 0.5, a: { lucky: 1, fx: { rep: 2, nervy: -3 }, say: 'Hanka: „Hm. Máš pravdu. Zajtra tri.“ Priznala chybu. Teraz si dobrý.' }, b: { fx: { rep: -1, nervy: 6 }, say: 'Hanka: „Nie.“ Nasleduje štrnásť. Plus pätnásty.' } }),
    ]),
    variants: [{ notify: 'Hanka (SMS): „Káva a menu. Bistro. Pol hodiny. Neutečieš.“' }] });

  coffee({ id: 'kava_s_vandou', who: 'Simona', whoDat: 'Simonou', title: 'Káva s Simonou: odovzdanie a Nelka', caller: 'Simona', intrude: 'call', fam: 'ex', npcs: [['ex', 'pult', 2.5, 1.2]], sip: 'Simona drží hrnček oboma rukami. Pozerá do kávy ako do hlbokej studne. Alebo na teba.',
    cond: (S) => !S.bistroClosed && !S.stack.some(q => q.id === 'ex_v_bistre' || q.id === 'nina_a_ex') && !S.stack.some(q => q.id === 'ria_vecera' && q.step > 0),
    failFx: { dad: -2, nervy: 6 }, failSay: 'Simona čakala. Odišla. Napísala tvojej mame. Zase.', forgetFx: { dad: -1, nervy: 5 }, forgetSay: 'Simona: „Tak nič. Ako vždy.“',
    choice: CHO(`Simona: „Chcem sa dohodnúť na ${KIDDAT}. Prázdniny, víkendy a kto platí zubára.“ V ruke drží Nelkine veci. A zápisník s bodkami.`, 'Simona', '💬', [
      O('Pokojne vyjednávať', { p: 0.6, a: { fx: { dad: 3, nervy: 10, focus: -12, time: 20 }, say: `Dohoda: víkendy striedavo, zubár napoly. ${KID} bude mať dvoch rodičov. Aj keď nie spolu.` }, b: { fx: { dad: 1, nervy: 14, focus: -14, time: 25 }, say: 'Simona otvorila päťročný archív výčitiek. Zaplatil si — pozornosťou.' } }),
      O('Bojovať o každý deň', { fx: { dad: -2, nervy: 15, rep: -1, focus: -10 }, say: 'Simona: „Takže sa nedohodneme.“ Dana sa kŕčovito usmieva pri pulte.' }),
      O('Súhlasiť so všetkým, nech to skončí', { fx: { dad: -3, nervy: -3, money: -40, focus: -6 }, say: 'Podpísal si tri veci na servítke. Právnici tomu hovoria dohoda. Ty tomu hovoríš kapitulácia.' }),
    ]),
    variants: [{ notify: `Simona (SMS): „Môžeme sa stretnúť v bistre? O ${KIDDAT}. Nič hrozné. Zatiaľ.“` }, { notify: `Simona volá: „Dobrý deň, tu je Simona. Prídem do bistra. Nie, nie je to vyhrážka.“` }] });

  coffee({ id: 'kava_s_lukasom', who: 'Peter', whoDat: 'Petrom', title: 'Káva s Petrom: dodávka', caller: 'Peter', npcs: [['lukas', 'pult', 2.5, 1.2]], sip: 'Peter pije kávu postojačky. Aj tak sa zdá, že sa vznáša nad dodávkou.',
    forgetSay: 'Peter odišiel a dodávka teraz klepe aj za teba.', forgetFx: { nervy: 5 },
    choice: CHO('Peter: „Šéfe, dodávka klepe. Aj klope. Aj jedno svetlo zmizlo. Neviem kam. Vraj odišlo.“', 'Peter', '🚐', [
      O('Poslať do servisu hneď', { fx: { money: -80, rep: 1, nervy: -2, focus: -4 }, say: 'Servis: „Ložisko, hadica a jedno svetlo.“ Svetlo je dražšie než dodávka.' }),
      O('„Ešte rok vydrží.“', { p: 0.5, a: { fx: { nervy: 3 }, say: 'Peter: „Hm.“ Zvuk dodávky sa zlepšil. Alebo si si zvykol.' }, b: { fx: { money: -150, nervy: 12, focus: -8 }, say: 'Dodávka sa pri rampe rozpadla. Dokonca aj s boxmi.' } }),
      O('Vziať to s Borisom: nová dodávka', { fx: { nervy: 10, focus: -10, rep: -1, time: 15 }, say: 'Boris: „Dodávka? Aká dodávka? Pošli mi Excel.“' }),
    ]),
    variants: [{ notify: 'Peter (SMS): „Šéfe, môžem sa zastaviť v bistre? Dodávka. Nie, nie je to urgentné. Ešte.“' }] });

  coffee({ id: 'kava_s_dodavatelom', who: 'Dodávateľ', whoDat: 'dodávateľom', title: 'Káva s dodávateľom: nový cenník', caller: 'Dodávateľ', npcs: [['dodavatel', 'pult', 2.5, 1.2]], sip: 'Dodávateľ rozbalil cenník ako starovekú mapu pokladu. Poklad je jeho.',
    fam: 'papiere', forgetFx: { money: -25 }, forgetSay: 'Dodávateľ nechal cenník na pulte. Platí od zajtra, bez diskusie.',
    choice: CHO('Dodávateľ: „Nové ceny. Mäso +8 %, olej +12 %, kuracie krídla… no, krídla sú v móde.“', 'Dodávateľ', '📈', [
      O('Prijať cenník', { fx: { money: -25, nervy: 3, focus: -3 }, say: 'Podpis. Plus 25 € mesačne. Alebo týždenne. Nečítal si.' }),
      O('Vyjednávať', { p: 0.4, a: { lucky: 1, fx: { money: 30, rep: 1, nervy: -2 }, say: 'Dodávateľ: „Dobre, -5 % pre vás.“ Veľký deň. Všetko je relatívne.' }, b: { fx: { nervy: 9, time: 15, focus: -8 }, say: 'Vyjednávaš 15 minút. Cena rovnaká. Dodávateľ má viac času než ty.' } }),
      O('Hrozit konkurenciou', { fx: { rep: -1, nervy: 6, focus: -5 }, say: 'Dodávateľ: „Konkurencia? Tá, čo nedodá?“ Má pravdu, hnusná pravda.' }),
      O('Vziať ochutnávku oleja a odísť', { fx: { energy: 4, nervy: 3 }, say: 'Fľaša oleja zadarmo. A pamflet na 40 strán. Použiješ ho ako podložku.' }),
    ]),
    variants: [{ notify: 'Mail: „Obchodný zástupca príde na kávu s novým cenníkom.“ Nový cenník znamená hore.' }, { notify: 'Dodávateľ (SMS): „Môžem sa zastaviť s cenníkom? Prinesiem koláčik.“ Koláčik je úplatok.' }] });

  coffee({ id: 'kava_s_tamarou', who: 'Dana', whoDat: 'Danou', title: 'Káva s Danou: personálny problém', caller: 'Dana', npcs: [['tamara', 'pult', 2.5, 1.2]], sip: 'Dana položila hrnček a zhlboka sa nadýchla. Nadýchla sa tak hlboko, že vedľa stojaca Lenka ustúpila.',
    forgetSay: 'Dana problém vyriešila sama. Lenka teraz robí na pokladni a plače.', forgetFx: { rep: -2, nervy: 4 },
    choice: CHO('Dana: „Šéfe, Lenka hrozí, že odíde kvôli prepitnému. A ja jej rozumiem. A ona mne. A ty nie.“', 'Dana', '👩‍🍳', [
      O('Dať obom dvojnásobné prepitné z pokladne', { fx: { money: -30, rep: 2, nervy: -3 }, say: 'Dana: „Konečne.“ Lenka: „Aj ja?“ Aj ty. Pokladňa plače.' }),
      O('Poslať ich na teambuilding', { fx: { money: -18, nervy: 6, focus: -6, rep: 1 }, say: 'Teambuilding: kávička s koláčom. Hádali sa o koláč.' }),
      O('„Nech sa dohodnú navzájom.“', { p: 0.4, a: { fx: { rep: 1, nervy: -2 }, say: 'Dohodli sa. Zázrak. Na pol hodinu.' }, b: { fx: { rep: -2, nervy: 9, focus: -8 }, say: 'Pri pulte letí utierka. Nepriamo cieli do kávovaru.' } }),
    ]),
    variants: [{ notify: 'Dana: „Šéfe, potrebujem päť minút. Pri káve. Nie, nie je to o platoch. Je to o platoch.“' }] });

  coffee({ id: 'kava_s_agusom', who: 'Wayan', whoDat: 'Wayanom', title: 'Káva s Wayanom: dovolenka na Bali', caller: 'Wayan', npcs: [['agus', 'pult', 2.5, 1.2]], sip: 'Wayan pije kávu s tromi lyžičkami cukru. „Na Bali sme to robili s palmovým cukrom, šéfe.“',
    forgetSay: 'Wayan si dovolenku vzal sám. Lístok na Bali už kúpil.', forgetFx: { rep: -2, nervy: 4 },
    choice: CHO('Wayan: „Šéfe, chcem tri týždne voľna. Mama sa vydáva. Už po tretíkrát. Nechápem prečo, ale musím byť tam.“', 'Wayan', '🇮🇩', [
      O('Povoliť dva týždne', { fx: { rep: 2, nervy: 6, focus: -6 }, say: 'Wayan: „Terima kasih!“ Na lístok pozerá s nadšením sveta. Kto bude varíť sambal?' }),
      O('Povoliť tri týždne a zohnať záskok (−60 €)', { fx: { money: -60, rep: 3, nervy: 4 }, say: 'Wayan ti dá obrovský sambal na rozlúčku. Túto vôňu už nedostaneš z bundy.' }),
      O('Nepovoliť. „Sezóna.“', { fx: { rep: -3, nervy: 10, focus: -6 }, say: 'Wayan: „Hm.“ Ticho v kuchyni. Dnes bude sambal veľmi, veľmi štipľavý.' }),
    ]),
    variants: [{ notify: 'Wayan: „Šéfe, môžeme na kávu? Je to o Bali. Nie, nie je to zlé. Je to… dlhé.“' }] });

  coffee({ id: 'kava_s_riou', who: 'Katka', whoDat: 'Katkou', title: 'Rýchla káva s Katkou v bistre', caller: 'Katka', fam: 'nina', npcs: [['nina', 'pult', 2.5, 1.2]], sip: 'Katka si objednala latte s mandľovým mliekom. Dana za pultom dvíha obočie na výšku stropu.',
    cond: (S) => !S.bistroClosed && !S.stack.some(q => q.id === 'ex_v_bistre' || q.id === 'nina_a_ex'), failFx: { nervy: 5 }, forgetFx: { nervy: 4 }, forgetSay: 'Katka: „Ok.“ Zase ok.',
    choice: CHO('Katka šepká: „Dana sa na nás pozerá. Už desať minút. Ona vie?“ Dana naozaj leští ten istý pohár už desať minút.', 'Katka', '💅', [
      O('„Vie. Všetci vedia.“', { fx: { rep: -1, nervy: 6, focus: -6 }, mood: 1, say: 'Katka sa zasmiala. Dana hodila pohár. Ale rozbil sa len sladkým zvukom.' }),
      O('Predstierať, že je to obchodné stretnutie', { trap: 1, fx: { nervy: 10, focus: -10, rep: -1 }, mood: -2, say: 'Katka: „Obchodné? Pod stolom ma kopeš tebe pre istotu?“ Kopal si Bundáša.' }),
      O('Dať jej pusu na líce', { p: 0.5, a: { fx: { nervy: -5, rep: -1 }, mood: 2, say: 'Dana si vydýchla do utierky. Katka sa usmiala. Tvoje body: vyššie než pult.' }, b: { trap: 1, fx: { nervy: 12, focus: -12, rep: -2 }, mood: -1, say: 'Trafil si ucho. Katka: „Au.“ Dana píše správu. Lenke.' } }),
    ]),
    variants: [{ notify: 'Katka (SMS): „Som pri bistre. Káva? Päť minút. Sľubujem, nebudem robiť scény. Zase.“' }] });

  // ---------- Pivo u Doda a večerné stretnutia ----------
  const RISO_NPC = () => { const p = hsPos('riso_gauc'); if (p) setNpc('riso', { x: p.x, z: p.z + 0.6, visible: true, sit: true }); };
  P({ id: 'riso_vola_von', intrude: 'call', caller: 'Dodo', fam: 'social', icon: '📞', title: 'Dodo volá: „Poď na pivo“', win: W(17, 20.6), w: 1.4, dayW: {}, forget: 30, cond: (S) => !kidBusy() && !S.doneIds.has('pivo_riso'),
    steps: [ph({ q: 'Dodo: „Čau, Paťo! Mám doma dve piva, FIFU a nálad ako po rozchode. Nemáš chuť vyvetrať hlavu?“', who: 'Dodo', icon: '🍺', opts: [
      { t: '„Dobre, idem. Jedno.“ (idem k nemu)', fx: { nervy: -2 }, pushId: 'pivo_riso', pushDelay: 3, say: 'Dodo: „Jedno. Dvere sú otvorené. Fabia na ulici nech stojí.“' },
      { t: '„Dnes nie, Dodo. Úlohy.“', fx: { nervy: 2 }, say: 'Dodo: „Úlohy. Ty by si mal byť zatvorený v múzeu pre takých ako si.“' },
      { t: '„Radšej do krčmy U Hájka.“', fx: { nervy: -1, money: -4 }, say: 'Dodo: „U Hájka? Tam chodí Katka. Hm. Nie, ja nechcem byť svedok.“' },
    ] }, 'Zdvihnúť Dodovi', true)],
    forgetFx: { nervy: 3 }, forgetSay: 'Dodo: 3 zmeškané. Posledná správa: „Zradca. Pivo vypijem sám.“',
    variants: [{ notify: 'Dodo volá. V pozadí FIFA, komentátor a plechovka. Pozvánka je evidentná.' }, { notify: 'Dodo: „Mám dve piva na dvoch rukách. Tretia ruka je voľná pre teba.“' }] });

  P({ id: 'pivo_riso', intrude: 'call', caller: 'Dodo', fam: 'social', icon: '🍺', title: 'Pivo u Doda', win: W(19, 22), w: 1.6, dayW: { futbal: 0.3 }, deadlineRel: 150, removeOnFail: true, forget: 90, cond: () => !kidBusy(),
    onStart: () => { RISO_NPC(); }, onEnd: () => setNpc('riso', { visible: false }),
    steps: [
      go('riso_dvere', 'Prísť k Dodovi (Byt Doda)', { say: 'Zvonček. Dodo otvára v trenírkach s logom Slovana: „Prišiel si! Dvere zavri, chladí sa.“' }),
      hold('riso_pivo', 3, 'Otvoriť pivo (drž E)', { say: 'Pššš. Pivo, FIFA na obrazovke, plesňová pizza z minulého týždňa. Domov.' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: CHO('Dodo: „Tak čo, jedno, dve, alebo ideme na to naplno? A hej — Simona, Katka, deti… čo máš, to vysyp.“', 'Dodo', '🍺', [
        O('Jedno a idem', { beer: 1, fx: { energy: 10, focus: -10, nervy: -8 }, say: 'Jedno pivo. Dodo: „Už? Si úplná nuda.“ Si.' }),
        O('Aj druhé. Ideme do Dodovho vyprávania', { beer: 2, fx: { energy: 10, focus: -16, nervy: -12, time: 30 }, say: 'Dodo hovorí 30 minút o svojej bývalej, mačke a Excelovej tabuľke vzťahov. Odnášaš si 2 piva a 0 odpovedí.' }),
        O('Zahrať FIFU', { beer: 1, p: 0.5, a: { fx: { energy: 10, focus: -8, nervy: -12, time: 25 }, say: 'Vyhral si 3:1! Dodo: „Podvádzaš!“ Najviac podvádza on.' }, b: { trap: 1, fx: { energy: 10, focus: -10, nervy: 10, time: 25 }, say: 'Dodo ti dal 7:0. Ovládač letel do steny. Sused búcha.' } }),
        O('Spýtať sa na radu o Simone', { beer: 1, p: 0.5, a: { fx: { energy: 10, focus: -10, dad: 2, nervy: -8 }, say: 'Dodo: „Hovor s ňou, ako keby ťa nemala za idiota. Teda — tak to skúsiš.“ Prekvapivo múdre.' }, b: { fx: { energy: 10, focus: -10, dad: -2, nervy: 8 }, say: 'Dodo: „Pošli ju do… Pardon, to je z iného filmu.“ Poradil ti niečo, čo nikdy nepoužiješ.' } }),
      ]) },
    ],
    reward: { nervy: -6, energy: 4 }, failFx: { nervy: 4 }, failSay: 'Dodo piva vypil sám. Posledná správa: „Zradca.“',
    variants: [{ notify: 'Dodo (SMS): „Pivo. U mňa. Teraz. FIFA čaká.“' }, { notify: 'Dodo: „Prines pizzu. Alebo seba. Pizza je dôležitejšia.“' }] });

  P({ id: 'taxi', intrude: 'sms', caller: 'Taxi', fam: 'adhd', icon: '🚕', title: 'Dve pivá: Fabia stojí', w: 0, dayW: {}, forget: 120, cond: (S) => !!S.flags.noDrive,
    steps: [ph({ q: 'Dve pivá. Fabia zostáva. Taxi do Fabie stojí 12 €. Alebo peši.', who: 'Taxi', icon: '🚕', opts: [
      { t: 'Zavolať taxi (−12 €)', run: () => { const S = G.S, c = car(), p = player(); S.flags.noDrive = false; S.flags.drinkBeers = 0; if (c && p) { p.x = c.x + 2.5; p.z = c.z; p.route = null; p.inCar = false; } return { fx: { money: -12, time: 25, nervy: 3, focus: 3 }, say: 'Taxikár ťa vezie okľukou 25 minút a hovorí o politike. Z Fabie si triezvy. Hlavne unavený.' }; } },
      { t: 'Ísť peši', fx: { energy: -6, nervy: -3 }, say: 'Idem peši. Dobré pre hlavu, zlé pre ponožky.' },
    ] }, 'Rozhodnúť sa')],
    variants: [{ notify: 'Dve pivá. Do Fabie sa nesadá. Taxi je 12 €. Pešo je zadarmo.' }] });

  P({ id: 'pivo_s_kamosmi_bistro', intrude: 'sms', caller: 'Peter', fam: 'social', icon: '🍻', title: 'Pivo po zatvorení v bistre', win: W(20, 22.6), w: 1.2, dayW: { futbal: 0.2 }, deadlineRel: 120, removeOnFail: true, forget: 80, cond: (S) => !kidBusy() && !S.bistroClosed,
    npcs: [['lukas', 'pult', 2.5, 1.2], ['matus', 'pult', 3.5, 2.2]], who: 'Peter s Tomášom',
    onStart: (q, S) => { q.data.arriveAt = S.time + rr(6, 12); }, onEnd: () => hideNpcs(['lukas', 'matus']),
    steps: [
      hold(['pult'], 4, 'Otvoriť pivo s Petrom a Tomášom (drž E)', { ready: (q, S) => S.time >= (q.data.arriveAt || 0), readyMsg: (q, S) => `Peter s Tomášom ešte nedorazili, asi ${Math.max(1, Math.ceil((q.data.arriveAt || 0) - S.time))} min`, say: 'Bistro zavreté, stoličky hore, v chladničke tri plechovky. Súkromná párty trojice.' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: CHO('Peter: „Šéfe, jedno?“ Tomáš: „Ja dnes nič nedvíham. Ani flašu.“', 'Peter', '🍻', [
        O('Jedno pre kamarátov', { beer: 1, fx: { energy: 10, focus: -10, nervy: -8, rep: 1 }, say: 'Peter: „Za šéfa!“ Tomáš: „Za vypnuté telefóny!“ Cink.' }),
        O('A hneď druhé. Plánujeme záchranu firmy', { beer: 2, fx: { energy: 10, focus: -14, nervy: -12, time: 25 }, say: 'Plán záchrany: Tomáš pôjde skoro spať. Peter zaparkuje rovno. Ty si zodpovedný. Nikto neverí.' }),
        O('Ukázať Tomášovi fotku Katke', { trap: 1, beer: 1, fx: { energy: 10, focus: -10, nervy: 8, rep: -1 }, say: 'Tomáš: „To je tá z Instagramu?“ Peter: „Šéf, ona má ex?“ Ty: „Mám ja.“' }),
        O('Pozrieť dochádzku a vyhodiť ich domov', { fx: { rep: 1, nervy: 5, focus: -4 }, say: 'Chlapi sa zdvihli s pohľadom spratkov. Tomáš: „Šéf je dnes tvrdý.“ Plechovky ostali nedotknuté.' }),
      ]) },
    ],
    reward: { nervy: -4 }, failSay: 'Peter s Tomášom pivo vypili sami. Naúčtovali ti to.', failFx: { money: -9 },
    variants: [{ notify: 'Peter (SMS): „Šéfe, po zatvorení pivo pri pulte? Tomáš prisľúbil, že príde. Reálne.“' }, { notify: 'Tomáš: „Šéfe, hádzem. Mám tri pivá a žiadnu výhovorku. Poď.“' }] });

  P({ id: 'susedova_oslava', intrude: 'sms', caller: 'Sused', fam: 'social', icon: '🎉', title: 'Susedova oslava pred bytom', win: W(18, 22.3), w: 1.1, dayW: {}, forget: 70, deadlineRel: 100, removeOnFail: true,
    steps: [
      go('strom_byt', 'Zájsť k susedovi pred bytom na oslavu', { say: 'Gril. Reproduktor. Ľubo v zástere „Kráľ grilu“. Sused ťa chytil ešte pred bránou.' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: CHO('Ľubo (sused): „Paťo! Narodeniny! Dáš si klobásu? Pivo? Tanec? Moja žena sa pýta na Nelku a na ‚tú pani, čo chodí v noci‘.“', 'Ľubo', '🎂', [
        O('Dať si klobásu a nič nehovoriť', { fx: { energy: 8, nervy: 3, focus: -4 }, say: 'Klobása. Slovenská klasika. Ľubo: „Vždy si ticho. Preto ťa mám rád.“' }),
        O('Zatancovať s ženou', { p: 0.4, a: { lucky: 1, fx: { energy: -4, nervy: -8, rep: 2 }, say: 'Ženy aplaudujú. Prvý raz za rok.' }, b: { trap: 1, fx: { energy: -6, nervy: 10, focus: -8, rep: -1 }, say: 'Stúpil si jej na nohu. Ľubo: „Má plochú nohu, ďakujem.“ Poplašne sa zasmiala.' } }),
        O('Odpovedať na ‚pani, čo chodí v noci‘', { trap: 1, fx: { nervy: 12, focus: -10, rep: -1, dad: -1 }, say: 'Povedal si, že je to „kolegyňa z práce“. Žena: „Aha. Z práce.“ Ľubo sa uškrnul.' }),
        O('Odísť s výhovorkou „Bundáš musí von“', { fx: { nervy: 3, focus: -3 }, say: 'Bundáš musí von. Bundáš spí. Ľubo to vidí cez okno.' }),
      ]) },
    ],
    reward: { nervy: -2 }, forgetFx: { nervy: 4 }, forgetSay: 'Ľubo ťa vyhľadal sám. S klobásou. Nedalo sa utiecť.',
    variants: [{ notify: 'Z balkóna dunie hudba. Ľubo (SMS): „Paťo, narodeniny! Klobása pre teba! Prines niečo tuhé.“' }, { notify: 'Sused Ľubo: „Zorganizoval som oslavu pred vchodom. Si pozvaný. Povinne.“' }] });

  // ---------- Trapasy a mikro-momenty ----------
  P({ id: 'trapas_metro_joff', intrude: 'sms', caller: 'Peter', fam: 'adhd', icon: '🛒', title: 'Basa piva z Veľkoobchodu', win: W(9, 17), w: 1, dayW: {}, forget: 70,
    steps: [go('vo_pokladna', 'Kúpiť basu piva vo Veľkoobchode', { fx: { money: -14 }, say: 'Basa je ťažká. Vo fronte pred tebou stojí… sivý sveter. Chrbát sa ti vyhýba.' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: CHO('V rade pred pokladňou stojí Boris. Otočí sa. Pozrie sa na basu. Potom na teba. „Paťo? Pivo? V stredu, o jedenástej?“', 'Boris', '🍺', [
        O('„Pre kuchyňu. Pracovný meeting.“', { p: 0.4, a: { fx: { rep: 0, nervy: 5 }, say: 'Boris: „Pracovný meeting s basou. To je odvaha.“ Prešiel.' }, b: { trap: 1, fx: { rep: -3, nervy: 12, focus: -10 }, say: 'Boris: „Fajn, Excel mi to tiež nepovie.“ Zdvihol obočie.' } }),
        O('Zdvihnúť basu a vrátiť sa do ulice', { trap: 1, fx: { energy: -8, nervy: 8, focus: -8 }, say: 'Basa je väčšia než ty. Pivá cinkajú. Pokladníčka: „Pane, zaplatiť ste mali.“' }),
        O('Ponúknuť Borisovi jedno pivo', { fx: { money: -4, rep: 2, nervy: 8 }, say: 'Boris: „Beriem.“ A hneď otvoril. V obchode. Pokladníčka je už z toho unavená.' }),
      ]) }],
    reward: {}, forgetFx: { nervy: 3 }, forgetSay: 'Chalani si pivo kúpili sami. Zaúčtovali ti ho.',
    variants: [{ notify: 'Peter (SMS): „Šéfe, chalani chcú po šichte pivo. Basa z Metra? Tunde tvrdí, že je to v zmluve.“' }] });

  P({ id: 'trapas_pumpa_rodic', intrude: 'none', fam: 'adhd', icon: '☕', title: 'Káva na pumpe (ADHD)', win: W(8, 18), w: 1, dayW: {}, forget: 60, cond: (S) => !inCar(),
    steps: [go('pokladna', 'Kúpiť si kávu na pumpe', { fx: { money: -2.5, focus: 6 }, say: 'Káva za 2,50. Papierový pohárik. Pri pokladni sa otočí mama zo škôlky.' }),
      { type: 'choice', at: 'auto', auto: true, label: '…', choice: CHO(`Mama z ${KIDGEN} škôlky: „Ahoj Paťo! Počula som o tej veci s Simonou a Katkou. Je to pravda, že… no… Katka prišla do škôlky a?“ Rad za tebou sa zastavil.`, 'Mama', '🤰', [
        O('„Nie, to je len fáma.“', { p: 0.5, a: { fx: { nervy: 4 }, say: 'Mama: „Aha. Ja som tomu nikdy neverila.“ Verila.' }, b: { trap: 1, fx: { nervy: 10, rep: -2, focus: -8 }, say: 'Mama: „Ale Katka bola fotená pred bránou.“ Pokladníčka drží lístok a načúva.' } }),
        O('Zmeniť tému: „Aké sú dnes počasie, však?“', { trap: 1, fx: { nervy: 6, focus: -8 }, say: 'Mama: „Prší.“ Svieti slnko. Rad sa smeje.' }),
        O('Bez slova zaplatiť a odísť', { fx: { nervy: 8, rep: -1, dad: -1 }, say: 'Odchádzaš tak rýchlo, že si zabudol kávu. A mama zostala pri pokladni s otvorenou pusou.' }),
      ]) }],
    reward: {}, forgetFx: { focus: -2 }, forgetSay: 'Káva sa neuvarila. Zostala ti len túžba po kofeíne.',
    variants: [{ notify: 'Mozog: „Káva. Pumpa má kávu. Ideme.“ Stretnutie s kofeínom je nutné.' }, { notify: 'Hlava: „Pumpa. Káva. Teraz.“ Zoznam úloh čaká.' }] });

  P({ id: 'trapas_tamara_pocula', intrude: 'call', caller: 'Katka', fam: 'adhd', icon: '📞', title: 'Katka volá. Dana počúva.', win: W(10, 20), w: 1, dayW: {}, forget: 40, cond: () => inLoc('bistro'),
    steps: [ph({ q: 'Katka: „Miláčik, kedy dnes? Chýbaš mi… a tá tvoja Dana nepočúva, hej?“ Dana stojí dva metre od teba s utierkou. Utierka sa nehýbe.', who: 'Katka', icon: '💅', opts: [
      { t: 'Šeptať: „Neskôr, Katka, neskôr…“', run: () => { toast('😳 Trapas', 'bad'); return { fx: { nervy: 10, focus: -10, rep: -1 }, say: 'Dana: „Neskôr, Katka, neskôr…“ — presne tým hlasom. Utierka sa pohla. Do kávovaru.' }; } },
      { t: 'Preložiť ju do kuchyne a zavesiť', run: () => { riaMood(-1); return { fx: { nervy: 6, focus: -6 }, say: 'Katka: „Zavesil si mi?!“ Zavesil. Dana sa uškrnula a pokračovala v leštení.' }; } },
      { t: 'Zahrať dodávateľa: „Áno, s mäsom. Bez cibule.“', run: () => { const ok = rand() < 0.4; if (!ok) toast('😳 Trapas', 'bad'); return ok ? { fx: { nervy: 4, focus: -4 }, say: 'Katka: „Čože?“ Dana kývla. Katka zložila. Pochopila to.' } : { fx: { nervy: 12, focus: -10, rep: -1 }, say: 'Katka: „Ty ma volaš dodávateľa?!“ Dana si zakrýva ústa. Lenka vykukla zo skladu.' }; } },
    ] }, 'Zdvihnúť Katke', true)],
    forgetFx: { nervy: 4 }, forgetSay: 'Katka: „Ok.“ A Dana vedela aj tak.',
    variants: [{ notify: 'Katka volá. V bistre. Pri pulte. Dana sa nenápadne priblížila.' }, { notify: 'Katka (volá): „Ahoj, zlatíčko.“ Dana a Lenka zastavili vzduch.' }] });

  P({ id: 'trapas_zla_sms_joff', intrude: 'sms', caller: 'Boris', fam: 'adhd', icon: '📲', title: 'SMS pre Katku išla Borisovi', win: W(9, 20), w: 1.1, dayW: {}, forget: 50,
    steps: [ph({ q: 'Boris (SMS): „Paťo, potvrď zajtrajšiu objednávku mäsa.“ Odpísal si rýchlo: „Jasné, mačiatko 😘 Dnes u teba? 🍷“. Odoslané. Šéfovi. Prečítané.', who: 'Boris', icon: '📲', opts: [
      { t: 'Zmazať správu (už je prečítaná)', run: () => { toast('😳 Trapas', 'bad'); return { fx: { nervy: 10, focus: -10, rep: -2 }, say: 'Zmazané u teba. U Borisa nie. Odpovedal: „Mäso potvrdené. Mačiatko tiež.“' }; } },
      { t: 'Poslať: „Sorry, to bolo pre Katku.“', run: () => { toast('😳 Trapas', 'bad'); return { fx: { nervy: 14, focus: -12, rep: -3 }, say: 'Boris: „Kto je Katka?“ Vedel to. Určite. A vedel aj, kto je Simona.' }; } },
      { t: 'Zahrať autokorekciu', run: () => { const ok = rand() < 0.45; if (!ok) toast('😳 Trapas', 'bad'); return ok ? { fx: { nervy: 4, focus: -4 }, say: 'Boris: „Autokorekcia je zradca.“ Prešlo. Dnes máš šťastie.' } : { fx: { nervy: 9, rep: -2, focus: -8 }, say: 'Boris: „Autokorekcia mení ‚mäso‘ na ‚mačiatko‘? Zaujímavé.“' }; } },
      { t: 'Zavolať Borisovi a hovoriť o objednávke akoby nič', fx: { rep: -1, nervy: 7, focus: -6 }, say: 'Boris: „Mäso 40 kíl, súhlasí.“ A po pauze: „Pozdravuj mačiatko.“' },
    ] }, 'Odpísať Borisovi')],
    forgetFx: { rep: -2, nervy: 4 }, forgetSay: 'Boris sa neozval. Ticho je horšie ako výčitka.',
    variants: [{ notify: 'Boris (SMS): „Potvrď objednávku.“ Palce išli ako sami. Odoslané.' }] });

  P({ id: 'trapas_kokes_noha', intrude: 'popup', fam: 'adhd', icon: '🐕', title: `${DOG} a noha hosťa`, win: W(11, 19), w: 0.9, dayW: {}, forget: 30, cond: () => dogWithMe(),
    steps: [ch(CHO(`${DOG} pri pulte prišiel k hosťovi v obleku a… no. Prisadol mu na nohu. Hosť stuhol. Dana tiež. Lenka nahlas dýcha.`, DOG, '🐕', [
      O('Odtiahnúť psa a ospravedlniť sa', { fx: { nervy: 8, focus: -8, rep: -2 }, trap: 1, say: 'Hosť: „V pohode, aspoň má temperament.“ Dana si zakryla tvár utierkou.' }),
      O('Ponúknuť hosťovi kávu na účet', { fx: { money: -4, rep: 1, nervy: 5 }, say: 'Hosť: „Dobrý pes. Aj káva.“ Šťastný koniec, jazdecký zvyk pozitívny.' }),
      O('Zachrániť situáciu vtipom', { p: 0.4, a: { fx: { rep: 3, nervy: -4 }, lucky: 1, say: 'Hosť sa smial. Celé bistro tlieskalo. Ty si hviezda večera.' }, b: { trap: 1, fx: { rep: -3, nervy: 10, focus: -8 }, say: 'Vtip zlyhal. Hosť odišiel. Platil. Bez prepitného.' } }),
    ]), 'pult', 'Zasiahnuť')],
    reward: {}, forgetFx: { rep: -3, nervy: 6 }, forgetSay: `${DOG} to dokončil. Hosť dokončil účet. Do čierneho.`,
    variants: [{ notify: `${DOG} sa zaľúbil. Do nohy hosťa. Hosť stále sedí a nevie, čo robiť.` }] });

  P({ id: 'trapas_dodavatel_ria', intrude: 'call', caller: 'Dodávateľ', fam: 'adhd', icon: '🙈', title: 'Dodávateľ a „Katka“', win: W(8, 19), w: 1, dayW: {}, forget: 40,
    steps: [ph({ q: 'Dodávateľ volá. Zdvihneš a v hlave stále s Katkou šepneš: „Ahoj, Katka, miláčik…“ Ticho. Potom: „Tu Viliam z Mäsa Horák, pán Paťo.“', who: 'Dodávateľ', icon: '🙈', opts: [
      { t: 'Preháňať: „Katka? To je… fiktívna hlasovka!“', run: () => { toast('😳 Trapas', 'bad'); return { fx: { nervy: 12, focus: -10, rep: -2 }, say: 'Viliam: „Fiktívna. Jasné. Moja Gabika je tiež fiktívna.“' }; } },
      { t: 'Hrať, že to bol vtip', fx: { nervy: 6, focus: -6 }, say: 'Viliam: „Dobrý vtip. Mäso 40 kíl, však?“ Obchodný zázrak.' },
      { t: 'Zložiť a hrať, že sa stratil signál', run: () => { const ok = rand() < 0.5; if (!ok) toast('😳 Trapas', 'bad'); return ok ? { fx: { nervy: 3 }, say: 'Zavolá znova. Mlčí. Obaja viete, že vieme.' } : { fx: { nervy: 8, rep: -1 }, say: 'Viliam volá dvakrát. Potom Borisovi. Boris volá tebe.' }; } },
    ] }, 'Zdvihnúť dodávateľovi', true)],
    forgetFx: { nervy: 3 }, forgetSay: 'Dodávateľ nechal správu: „Pozdravujte Katku.“ Zrejme vedel.',
    variants: [{ notify: 'Dodávateľ volá. Voláš ho „miláčik“ ešte pred pozdravom.' }] });

  P({ id: 'trapas_autocorrect', intrude: 'sms', caller: 'Ondro', fam: 'adhd', icon: '⌨️', title: 'Autokorekcia šéfovi', win: W(9, 18), w: 1, dayW: {}, forget: 50,
    steps: [ph({ q: 'Ondro (SMS): „Ochutnávka zajtra o 10:00. Potvrď.“ Napísal si: „Potvrdzujem, ochutnávka o desiatej, prinesiem kozľa.“ Autokorekcia: „…prinesiem BUNDÁŠA.“ Odoslané.', who: 'Ondro', icon: '⌨️', opts: [
      { t: 'Poslať opravu: „Kozľa. KOZĽA.“', fx: { nervy: 7, focus: -6, rep: -1 }, say: 'Ondro: „Bundáš nie je na jedálnom lístku, Paťo.“ Si si istý?' },
      { t: 'Hrať sa na to, že je to bistro vtip', run: () => { const ok = rand() < 0.5; if (!ok) toast('😳 Trapas', 'bad'); return ok ? { fx: { rep: 2, nervy: -3 }, say: 'Ondro sa zasmial: „Dobrý nápad. Bistro s tematickým menu.“' } : { fx: { rep: -3, nervy: 10 }, say: 'Ondro: „Doplníme menu o psa. Bundáš. Premýšľam, či platí zákon.“' }; } },
      { t: 'Vypnúť autokorekciu na minútu a odpovedať úplne nové', fx: { nervy: 5, focus: -5, time: 5 }, say: 'Ondro dostal dve správy. Prvá o Bundášovi. Druhá s ospravedlnením. Prečítal ich v opačnom poradí.' },
    ] }, 'Opraviť správu')],
    forgetFx: { rep: -2, nervy: 3 }, forgetSay: 'Ondro prišiel s prikrývkou pre psa. Pre Bundáša. Fakt.',
    variants: [{ notify: 'Ondro (SMS): „Ochutnávka! Potvrď!“ Už ťa varí bundáš, pardon, koža. Autokorekcia vybuchla.' }] });

  P({ id: 'trapas_hlasovka', intrude: 'popup', fam: 'adhd', icon: '🎙️', title: 'Hlasovka do skupiny „Kuchyňa“', win: W(9, 21), w: 0.9, dayW: {}, forget: 40,
    steps: [ch(CHO('Poslal si hlasovku pre Katku: „Zlatíčko, dnes zase nespím doma, Bundáš chce von a ja tiež…“ — do skupiny „Kuchyňa“. Wayan: „🎙️ Katka?“ Honza: „Šéfe!“ Tunde: „Boss, we heard.“', 'Wayan', '🎙️', [
      O('Napísať do skupiny „Žart. Hlasovka patrí Tundemu.“', { trap: 1, fx: { nervy: 10, focus: -8, rep: -2 }, say: 'Tunde: „Hej, ja nie som Katka.“ Santi: „Jefe, ¡ojo!“' }),
      O('Vyhodiť mobil pod stôl', { fx: { nervy: 6, focus: -12, money: -4 }, say: 'Mobil spadol, displej mal prasklinu — od teraz s autoritou.' }),
      O('Zavolať Katke a priznať', { p: 0.5, a: { fx: { nervy: 4 }, mood: 1, say: 'Katka sa smiala. „Aspoň si úprimný.“ Kuchyňa: ticho a uznanie.' }, b: { trap: 1, fx: { nervy: 10, focus: -8 }, mood: -1, say: 'Katka: „Čo? Do skupiny?!“ Pípla ešte jedna správa — od Honzu: „🔥“.' } }),
    ]), 'phone', 'Riešiť hlasovku')],
    reward: {}, forgetFx: { rep: -2, nervy: 5 }, forgetSay: 'Hlasovka sa rozšírila do štyroch skupín. Aj do babkinej.',
    variants: [{ notify: 'Hlasovka odoslaná. Vo vzduchu: ticho. Vo skupine: päť emoji.' }] });

  for (const p of POOL) { DEF[p.id] = p; p.variants = p.variants && p.variants.length ? p.variants : [{}]; }
  for (const k in BASE) { DEF[k] = BASE[k]; if (BASE[k].variants && !BASE[k].variants.length) delete BASE[k].variants; }

  // ===== špeciálne udalosti typov dňa =====
  P({ id: 'futbal_vecer', intrude: 'popup', fam: 'bistro', icon: '⚽', title: 'FUTBAL: bistro praská', win: W(18.3, 19.5), w: 0.2, dayW: { futbal: 10, normal: 0 }, deadlineRel: 90, removeOnFail: true, noForget: true,
    onStart: (q, S) => { q.data.interrupts = shuffle(LUNCH_INTERRUPTS.filter(i => !['skolka_vola', 'kokes_kuchyna'].includes(i.id))).slice(0, ri(2, 3)); S.flags.alone = false; },
    steps: [mini('cook', 'sporak', 'Variť pre fanúšikov! (sporák)', { total: 11 })],
    reward: { money: 60, rep: 4 }, failFx: { rep: -10, nervy: 12 }, failSay: 'Fanúšikovia odišli hladní do krčmy vedľa. Slovan prehral. Ty tiež.',
    variants: [{ notify: 'Dana: „Hrá Slovan. Je tu 40 chlapov v šáloch. Všetci chcú krídla. VŠETCI.“' }, { notify: 'Lenka: „Projektor beží, pivo tečie, kuchyňa… kde je kuchyňa?! PAŤO!“' }] });
  P({ id: 'vyplata_kuchyna', intrude: 'popup', caller: 'Honza', fam: 'bistro', icon: '💸', title: 'Výplata. Dnes. Všetci.', win: W(8, 11), w: 0.2, dayW: { vyplata: 10, normal: 0 }, forget: 120,
    steps: [{ type: 'choice', at: ['agus', 'ayo', 'fredy', 'benji'], label: 'Riešiť výplaty', choice: { q: 'Wayan, Tunde, Santi aj Honza stoja v rade. Je výplata. Karta je blokovaná. Honza: „Hele šéfe, nájem nepočká.“', opts: [
      { t: 'Vyplatiť z pokladne bistra hotovosť', fx: { money: -400, rep: 4 }, say: 'Pokladňa prázdna, kuchyňa šťastná. Gabika bude plakať.' },
      { t: '„Zajtra, chalani. Banka blbne.“', fx: { rep: -5, nervy: 8 }, say: 'Wayan mlčí. Tunde mlčí. Santi mlčí. Honza: „To je v pohodě.“ Nie je.' },
      { t: 'Polovicu dnes, polovicu zajtra (−200 €)', fx: { money: -200, rep: 1, nervy: 3 }, say: 'Kompromis. Nikto nie je šťastný, nikto nedal výpoveď. Výhra.' },
    ] } }],
    forgetFx: { rep: -8, nervy: 10 }, forgetSay: 'Kuchyňa varila bez slova. Studená vojna. Studený obed.',
    variants: [{ notify: 'Prvý v mesiaci. Kuchyňa stojí pri kancelárii. Všetci. Nikto sa neusmieva.' }] });
  P({ id: 'joff_pise_rano', intrude: 'sms', caller: 'Boris', fam: 'bistro', icon: '📲', title: 'Boris: „Kde si?!“', win: W(7.5, 8.5), w: 0.2, dayW: { zaspal: 10, normal: 0 }, forget: 30,
    steps: [{ type: 'choice', at: 'phone', label: 'Odpísať Borisovi (F)', choice: { q: 'Boris (7:41): „Kde si? Rozvoz stojí. Peter čaká. JA čakám.“', opts: [
      { t: '„Už idem, zápcha.“ (si v posteli)', run: coin(0.5, { fx: { nervy: 3 }, say: 'Boris: „Ok.“ Prešlo to. Zatiaľ.' }, { fx: { rep: -4, nervy: 6 }, say: 'Boris: „Zápcha? Peter ťa vidí cez okno. V pyžame.“' }) },
      { t: '„Zaspal som. Sorry. 20 minút.“', fx: { rep: -2, nervy: -2 }, say: 'Boris: „Aspoň úprimne.“ Pravda bolí menej ako Excel.' },
      { t: 'Neodpísať, len bežať', fx: { energy: -8, focus: -3 }, say: 'Bežíš. Ponožky rôzne. Nikto si to nevšimne. Všetci si to všimnú.' },
    ] } }],
    forgetFx: { rep: -5 }, forgetSay: 'Boris: 3 správy, 2 hovory, 1 mail s predmetom „Dochádzka“.',
    variants: [{ notify: 'Mobil: Boris. 7:41. „KDE SI?“' }] });
  for (const id of ['futbal_vecer', 'vyplata_kuchyna', 'joff_pise_rano']) { DEF[id] = POOL.find(p => p.id === id); }

  // ---------- typy dňa ----------
  const DAYTYPES = {
    normal: { name: 'Obyčajný deň (haha)', w: 30, reveal: ['spicka'] },
    timea_chora: { name: `${KID} chorá`, w: 8, reveal: ['timea_s_tebou'] },
    dazd: { name: 'Leje ako z krhly', w: 12, reveal: [], immediate: true },
    vyplata: { name: 'Výplata – všetci chcú peniaze', w: 8, reveal: ['banka_karta', 'vyplata_kuchyna'] },
    kontrola: { name: 'Kontrola (nejaká príde)', w: 8, reveal: ['hygiena', 'danova', 'inspektorat'] },
    babka_navsteva: { name: 'Babka na návšteve', w: 8, reveal: ['babka_upratala', 'kluce'] },
    zaspal: { name: 'Zaspal si', w: 8, reveal: [], immediate: true },
    futbal: { name: 'Futbalový večer', w: 7, reveal: ['futbal_vecer'] },
    vylet: { name: 'Škôlkarský výlet', w: 6, reveal: ['vylet'] },
    nove_zamky: { name: 'Nové zámky', w: 5, reveal: ['nove_zamky', 'zamocnik_termin'] },
  };
  function reveal(id) {
    const S = G.S;
    if (!S || S.dayTypeRevealed) return;
    const dt = DAYTYPES[S.dayType];
    if (!dt || !dt.reveal.includes(id)) return;
    S.dayTypeRevealed = true;
    S.dayTypeName = dt.name;
    toast('📅 Dnes: ' + dt.name, 'info');
    log('📅 Typ dňa odhalený: ' + dt.name);
  }

  // ---------- plánovač dňa ----------
  const isWeekend = (day) => ((day - 1) % 7) >= 5;
  function weightedPick(items, wf) {
    let tot = 0;
    const ws = items.map(i => { const w = Math.max(0, wf(i)); tot += w; return w; });
    if (tot <= 0) return null;
    let r = rand() * tot;
    for (let k = 0; k < items.length; k++) { r -= ws[k]; if (r <= 0) return items[k]; }
    return items[items.length - 1];
  }
  const winT = (def) => rr(def.win[0] * 60, def.win[1] * 60);

  function buildPlan(rng, day, seg) {
    const saved = RNG; RNG = rng;
    try {
      const weekend = isWeekend(day);
      const sid = seg ? seg.id : 'full';
      const morning = !seg || sid === 'rano';
      const inSeg = (t) => !seg || (t >= seg.start && t < seg.end);
      const segT = (t) => (seg ? clamp(t, seg.start + 3, seg.end - 10) : t);
      // striedavá starostlivosť: nepárne dni u Paťa, 20 % šanca na preklopenie (dva dni za sebou), deň 1 vždy s Nelkou
      let kidWithMe = day % 2 === 1;
      if (day > 1 && rand() < 0.2) kidWithMe = !kidWithMe;
      const ids = Object.keys(DAYTYPES);
      let dayType = weightedPick(ids, (id) => (DAYTYPES[id].w * ((weekend && (id === 'vylet' || id === 'kontrola')) ? 0 : 1)
        * ((!kidWithMe && (id === 'timea_chora' || id === 'vylet')) ? 0 : 1)
        * ((seg && DAYTYPE_SEGS[id] && !DAYTYPE_SEGS[id].includes(sid)) ? 0 : 1))) || 'normal';
      const dayStart = dayType === 'zaspal' ? 7 * 60 + 40 : CFG.dayStart;
      const start = morning ? dayStart : seg.start;
      const end = seg ? seg.end : CFG.dayEnd;
      const plan = [];
      const add = (t, id, variant, fam) => { t = Math.round(t); if (!inSeg(t)) return; plan.push({ t, id, variant: variant == null ? null : variant, fam: fam || (DEF[id] && DEF[id].fam) || 'base', fired: false, base: !DEF[id] || !DEF[id].win }); };
      const nv = (id) => (DEF[id] && DEF[id].variants ? DEF[id].variants.length : 1);
      const vi = (id) => Math.floor(rand() * nv(id));
      // čas v okne položky; v zmene len v prieniku okna so zmenou
      const winTS = (d) => (seg ? rr(Math.max(d.win[0] * 60, seg.start + 5), Math.min(d.win[1] * 60, seg.end - 10)) : winT(d));
      // ranný základ (len celý deň / ráno)
      const keyAt = dayType === 'babka_navsteva' ? pick(['chladnicka', 'linka']) : (rand() < 0.25 ? 'chladnicka' : pick(KEY_SPOTS));
      if (!kidWithMe) add(start, 'timea_u_vandy'); // info bez krokov – v každej zmene
      const kidPlan = !kidWithMe ? null : dayType === 'timea_chora' ? 'timea_s_tebou' : weekend ? (rand() < 0.5 ? 'timea_s_tebou' : 'timea_k_babke') : 'skolka';
      if (morning) {
        if (kidWithMe) add(start, 'ranajky', vi('ranajky'));
        add(start + 1, 'kluce');
        if (kidPlan) add(start + 2, kidPlan);
        add(start + rr(6, 25), 'kokes_vencenie', vi('kokes_vencenie'));
      }
      const matusMissing = rand() < 0.22;
      const nOut = ri(2, 4) + (matusMissing ? 2 : 0);
      const deliveries = shuffle(OUTLETS.map((_, i) => 'outlet_' + i)).slice(0, nOut);
      if (morning) add(segT(Math.max(start + 20, rr(8 * 60 + 10, 9 * 60 + 10) + (dayType === 'zaspal' ? 40 : 0))), 'rozvoz', matusMissing ? 1 : 0);
      else if (sid === 'dopoludnie') add(start, 'rozvoz', matusMissing ? 1 : 0);
      const lunchAt = sid === 'obed' ? rr(start + 10, start + 60) : rr(11 * 60, 13 * 60 + 30);
      // pes na začiatku zmeny: ráno/večer doma; dopoludnie 50 % s tebou (kokes_logistika má zmysel), inak v kuchyni / doma
      const dogStart = morning || sid === 'vecer' || sid === 'noc' ? 'home' : sid === 'dopoludnie' ? (rand() < 0.5 ? 'follow' : 'kuchyna') : (rand() < 0.5 ? 'kuchyna' : 'home');
      if (!seg) add(lunchAt - rr(55, 85), 'kokes_logistika');
      else if (sid === 'dopoludnie' && dogStart === 'follow') add(segT(lunchAt - rr(55, 85)), 'kokes_logistika');
      const lunchVar = rand() < 0.15 ? 1 : rand() < 0.18 ? 2 : 0;
      if (!seg || sid === 'obed') add(lunchAt, 'spicka', lunchVar);
      if (kidWithMe && kidPlan !== 'timea_s_tebou' && (!seg || sid === 'popoludnie')) add(rr(15 * 60, 16 * 60 + 45), 'vyzdvihnut');
      if (kidWithMe) {
        if (!seg) add(19 * 60 + 30, 'uspavanie');
        else if (sid === 'vecer') add(rr(19 * 60 + 30, 20 * 60), 'uspavanie');
        else if (sid === 'noc') add(start + 5, 'uspavanie');
      }
      // vynútené podľa typu dňa (v zmene len ak okno položky zasahuje do zmeny)
      const forced = [];
      // vynútená položka: nie mimo zmeny a nie taká, ktorá potrebuje Nelku, keď je u Simony (napr. zamocnik_termin)
      const force = (id, t) => { const d = DEF[id]; if (!d || !segIntersects(d, seg) || (!kidWithMe && needsKid(d))) return; forced.push(id); add(segT(t != null ? t : winTS(d)), id, vi(id)); };
      if (dayType === 'vylet') force('vylet', start + 3);
      if (dayType === 'babka_navsteva') force('babka_upratala', start + rr(10, 40));
      if (dayType === 'nove_zamky') { force('nove_zamky', rr(Math.max(9 * 60, start + 5), 12 * 60)); if (rand() < 0.6) force('zamocnik_termin'); }
      if (dayType === 'kontrola') force(pick(['hygiena', 'danova', 'inspektorat']));
      if (dayType === 'futbal') force('futbal_vecer');
      if (dayType === 'zaspal') force('joff_pise_rano', start + rr(1, 6));
      if (dayType === 'vyplata') { force('vyplata_kuchyna'); force('banka_karta'); }
      if (dayType === 'dazd' && rand() < 0.7) force('kokes_blato');
      // deň u Simony: aspoň jedna večerná a jedna denná položka „bez Nelky“ (zvyšok náhodne, so zvýšenou váhou)
      if (!kidWithMe) {
        const eve = ['videohovor_timea', 'timea_chce_domov', 'sam_doma_vecer'].filter(id => segIntersects(DEF[id], seg));
        const dayI = ['vanda_fotky', 'vyzivne', 'zabudnute_veci_timey'].filter(id => segIntersects(DEF[id], seg));
        if (eve.length) force(pick(eve));
        if (dayI.length) force(pick(dayI));
      }
      // náhodné udalosti (celý deň 9–13 z CFG, zmena 5–7; vynútené podľa typu dňa sa do toho počítajú)
      const rMax = seg ? SEG_RANDOM[1] : CFG.eventsMax;
      const n = Math.max(0, Math.min(ri(seg ? SEG_RANDOM[0] : CFG.eventsMin, rMax) - forced.length, seg ? SEG_PLAN_CAP - plan.length : 1e9));
      const famCap = {};
      let cands = POOL.filter(p => p.win && !forced.includes(p.id) && !['futbal_vecer', 'vyplata_kuchyna', 'joff_pise_rano'].includes(p.id) && segIntersects(p, seg));
      const mult = (p) => { const m = p.dayW && p.dayW[dayType] != null ? p.dayW[dayType] : 1; return (p.w || 1) * m * ((weekend && (p.cond && String(p.cond).includes('kidAtSkolka'))) ? 0 : 1)
        * ((!kidWithMe && (needsKid(p) || p.kidOnly)) || (kidWithMe && p.awayOnly) ? 0 : 1) * ((!kidWithMe && p.awayOnly) ? 2 : 1); };
      const chosen = [];
      for (let k = 0; k < n && cands.length; k++) {
        const c = weightedPick(cands, (p) => mult(p) * ((famCap[p.fam] || 0) >= 4 ? 0 : 1));
        if (!c) break;
        chosen.push(c);
        famCap[c.fam] = (famCap[c.fam] || 0) + 1;
        cands = cands.filter(p => p !== c);
      }
      const evs = chosen.map(c => ({ t: seg ? winTS(c) : clamp(winT(c), start + 25, 23 * 60 + 40), id: c.id, variant: vi(c.id), fam: c.fam, def: c }));
      // rozostupy min 18 min (v zmene 12), 12 % „dvojitý prúser“ (dve udalosti v tej istej minúte)
      const GAP = seg ? 12 : 18, PAIR_P = 0.12;
      const space = (allowPair) => {
        evs.sort((a, b) => a.t - b.t);
        let prev = -1e9, paired = false;
        for (const e of evs) {
          if (e.pair && e.t === prev) { paired = true; continue; }
          if (e.t - prev < GAP) {
            if (allowPair && !paired && prev > 0 && rand() < PAIR_P) { e.t = prev; e.pair = true; paired = true; }
            else { e.t = prev + GAP; paired = false; }
          } else paired = false;
          prev = e.t;
        }
        if (seg) for (const e of evs) e.t = Math.min(e.t, seg.end - 8);
      };
      space(true);
      // pokrytie hodín (celý deň 7–20, zmena: jej hodiny): ak niektorá hodina nemá nič, presuň tam udalosť z preplnenej hodiny, alebo pridaj/vymeň novú
      const mkEv = (c, t) => ({ t, id: c.id, variant: vi(c.id), fam: c.fam, def: c });
      const inHour = (h) => plan.concat(evs).filter(e => e.t >= h * 60 && e.t < (h + 1) * 60);
      const covers = seg ? (d, h) => d.win[0] * 60 <= h * 60 + 40 && d.win[1] * 60 >= h * 60 + 20 : (d, h) => d.win[0] <= h + 0.1 && d.win[1] >= h + 0.9;
      const hourT = (d, h) => {
        if (!seg) return h * 60 + rr(5, 50);
        const lo = Math.max(h * 60 + 5, d.win[0] * 60, seg.start + 3), hi = Math.min(h * 60 + 50, d.win[1] * 60, seg.end - 10);
        return lo >= hi ? hi : rr(lo, hi);
      };
      const hLo = Math.max(7, Math.ceil(start / 60)), hHi = seg ? Math.floor((seg.end - 15) / 60) : 20;
      const evCap = seg ? n : CFG.eventsMax - forced.length;
      for (let h = hLo; h <= hHi; h++) {
        if (inHour(h).length) continue;
        const mv = evs.find(e => !e.pair && covers(e.def, h) && inHour(Math.floor(e.t / 60)).length >= 2);
        if (mv) { mv.t = hourT(mv.def, h); continue; }
        const c = weightedPick(cands.filter(p => covers(p, h)), mult);
        if (!c) continue;
        if (evs.length >= evCap) {
          // vymeň: vyhoď náhodnú udalosť z najplnšej hodiny
          let best = null, bestN = 1;
          for (const e of evs) { const n2 = inHour(Math.floor(e.t / 60)).length; if (!e.pair && n2 > bestN) { bestN = n2; best = e; } }
          if (!best) continue;
          evs.splice(evs.indexOf(best), 1);
          cands.push(best.def);
        }
        evs.push(mkEv(c, hourT(c, h)));
        cands = cands.filter(p => p !== c);
      }
      space(false);
      for (const e of evs) add(e.t, e.id, e.variant, e.fam);
      plan.sort((a, b) => a.t - b.t);
      return { dayType, plan, deliveries, keyAt, matusMissing, lunchAt, start, end, weekend, kidPlan, kidWithMe, segment: seg, dogStart };
    } finally { RNG = saved; }
  }

  // simulácia plánu (verifier): segmentId → plán len pre danú zmenu
  function simulatePlan(seed, dayArg, segmentId) {
    const day = dayArg || load().day || 1;
    const seg = segmentId && segmentId !== 'full' ? segOf(segmentId) : null;
    const r = buildPlan(mulberry((seed >>> 0) || 1), day, seg);
    return { seed, dayType: r.dayType, kidWithMe: r.kidWithMe, segment: seg ? seg.id : 'full', start: Math.round(r.start), end: r.end, dogStart: r.dogStart, kidPlan: r.kidPlan,
      plan: r.plan.map(e => ({ t: e.t, id: e.id, variant: e.variant, fam: e.fam })), deliveries: r.deliveries, keyAt: r.keyAt, lunchAt: Math.round(r.lunchAt) };
  }

  // ---------- defaultné akcie ----------
  function cooled(key) { const S = G.S; return !(S.cool[key] > S.rt); }
  function setCool(key, s) { G.S.cool[key] = G.S.rt + s; }

  const BED_NO = ['Spať? O tomto čase? S mojím zoznamom?', 'Ľahnem si len na 5 minút… nie. Poznám sa.', 'Posteľ volá. Bistro kričí hlasnejšie.'];
  const TALK = {
    joff: ['Boris: „Paťo, marža v stredu 14 %. Štrnásť. Vieš, čo je to percento?“', 'Boris: „Excel nepustí. Pošli čísla do piatku. Do TOHTO piatku.“', 'Boris: „Food cost 38 %. To nie je bistro, to je charita.“'],
    tamara: ['Dana: „Šéfe, ex volala na pevnú. Na PEVNÚ. Kto ešte volá na pevnú?“', 'Dana: „Lenka zase mešká. Píše, že je ‚na ceste‘. Je v posteli.“', 'Dana: „Ten pán z dvojky chodí len kvôli mne. Alebo kvôli rezňu. Skôr rezňu.“'],
    lucia: ['Lenka: „Šéfe, Dana mi berie stoly. Zase. Schválne.“', 'Lenka: „Katka bola včera na káve. Pýtala sa, kedy končíš. Hm.“', 'Lenka: „Prepitné dnes 4 €. Štyri. Ľudia sú chudobní alebo lakomí.“'],
    agus: ['Wayan: „Šéfe, na Bali sme varili na ohni, bez plynu. Tu nejde ani plyn. Ako doma.“', 'Wayan: „Sambal od mamy prišiel. Ochutnaj. Nie, neplač, to je normálne.“', 'Wayan: „Nasi goreng s rezňom? Fúzia, šéfe. Alebo zločin. Uvidíme.“'],
    ayo: ['Tunde: „Boss, jollof je nigérijský. NIGÉRIJSKÝ. Ghana klame.“', 'Tunde: „V Lagose je toto normálna premávka. Tu panikárite pri troch autách.“', 'Tunde: „Honza dal do omáčky kôpor. Kôpor, boss. Musel som si sadnúť.“'],
    fredy: ['Santi: „Jefe, v Kolumbii sa obed začína o druhej. Prečo tu o jedenástej?!“', 'Santi: „Arepas na raňajky, arepas na obed. Rezeň je len veľká arepa z mäsa.“', 'Santi: „Moja babka… nie, tá žije. Tá druhá. Teda… neriešme to.“'],
    benji: ['Honza: „Hele šéfe, to je v pohodě. Všechno je v pohodě. I ta fritéza.“', 'Honza: „V Brně bysme na tohle měli pivo. Tady máme… kofolu. Taky dobrý.“', 'Honza: „Tunde říká, že kopr je zločin. Kopr je kultura, šéfe.“'],
    lukas: ['Peter: „Dodávka má nový zvuk. Taký klep-klep. Asi to nič nie je.“', 'Peter: „Tomáš? Písal o siedmej, že vstáva. Je desať.“', 'Peter: „Trenčín a späť tri hodiny. Trikrát do týždňa. Mám tam už priateľku.“'],
    matus: ['Tomáš: „Šéfe, nedvíhal som, lebo som šoféroval. Alebo spal. Jedno z toho.“', 'Tomáš: „Digital Park mi dal pokutu za parkovanie pred výdajňou. Pred VÝDAJŇOU.“', 'Tomáš: „Peter vraví, že som nespoľahlivý. Peter nabúral dodávku.“'],
    babka: ['Babka: „Paťko, ty si nejaký chudý. Tá Katka ťa nekŕmi?“', 'Babka: „Za našich čias sme kľúče nestrácali. Nemali sme auto.“', 'Babka: „Katka je pekná. Príliš pekná. Dávaj si pozor.“', 'Babka: „Kedy sa oholíš? Katka to vidí. Všetci to vidia.“'],
    ucitelka: [`Pani učiteľka: „${KID} dnes kreslila tatina. Máte tam tri ruky.“`, 'Pani učiteľka: „Nezabudnite, v piatok je karneval!“ (zabudneš)', 'Pani učiteľka: „Podpíšte, prosím, papier o výlete. Ten z minulého mesiaca.“'],
  };
  const TALK_LABEL = { joff: 'Pokecať s Borisom', tamara: 'Pokecať s Danou', lucia: 'Pokecať s Lenkou', agus: 'Pokecať s Wayanom', ayo: 'Pokecať s Tundem', fredy: 'Pokecať s Santim', benji: 'Pokecať s Honzom', lukas: 'Pokecať s Petrom', matus: 'Pokecať s Tomášom', babka: 'Pokecať s babkou', ucitelka: 'Pozdraviť pani učiteľku' };

  function defaultAction(hsId) {
    const S = G.S, p = player(), c = car(), k = kid(), d = dog();
    if (hsId.startsWith('kavovar_')) {
      const pumpa = hsId === 'kavovar_pumpa';
      return { label: pumpa ? 'Káva z automatu (2,50 €)' : 'Uvariť kávu', type: 'hold', time: 1.2, run: () => {
        if (!cooled('coffee')) return say('Ešte mám kávu v žilách. Chvíľu počkaj.');
        setCool('coffee', 45);
        S.coffees++;
        const o = { focus: 30, nervy: 3 };
        if (pumpa) o.money = -2.5;
        if (S.coffees > 4) o.nervy += 10;
        fx(o); snd('pour');
        say(S.coffees > 4 ? 'Trasú sa mi ruky.' : pick(['Áááh. Mozog sa zapína.', 'Káva. Jediný stabilný vzťah.', 'Fokus +30. Zatiaľ.']));
      } };
    }
    if (TALK[hsId]) {
      return { label: TALK_LABEL[hsId], type: 'press', time: 0, run: () => {
        if (hsId === 'babka' && cooled('buchta')) { setCool('buchta', 150); fx({ energy: 20 }); return say('Babka ti vtisla buchtu. Odmietnuť sa nedá.'); }
        say(pick(TALK[hsId]));
      } };
    }
    switch (hsId) {
      case 'chladnicka':
        return { label: 'Niečo zjesť', type: 'hold', time: 1.2, run: () => {
          if (!cooled('eat')) return say('Pred chvíľou som jedol. Asi. Myslím.');
          setCool('eat', 120); fx({ energy: 30 });
          say(pick(['Studený rezeň v stoji. Gastronómia.', `Zjedol si zvyšok ${KIDGEN} cestovín. Bez výčitiek.`]));
        } };
      case 'doska':
        return { label: 'Ochutnať', type: 'press', time: 0, run: () => {
          if (!cooled('taste')) return say('Kuchár, ktorý ochutnáva priveľa, je spokojný kuchár. Ale nie.');
          setCool('taste', 40); fx({ energy: 15 });
          say(pick(['Treba doladiť soľ. A ešte raz ochutnať. Pre istotu.', 'Wayanov sambal. Slzy. Dobré slzy.', 'Tundeho jollof. Ešte lyžičku. Posledná. Určite.']));
        } };
      case 'pokladna':
        return { label: 'Hot-dog (2,90 €)', type: 'press', time: 0, run: () => {
          if (!cooled('hotdog')) return say('Dva hot-dogy za sebou? To už je životný štýl.');
          setCool('hotdog', 60); fx({ money: -2.9, energy: 25 });
          say('Benzínkový hot-dog. Chuť slobody a horčice.');
        } };
      case 'sanon':
        if (!S.items.has('technicak')) return { label: 'Vziať techničák od Fabie', type: 'press', time: 0, run: () => { S.items.add('technicak'); say('Techničák. Do vrecka. Polícia dnes nemá šancu.'); } };
        return null;
      case 'postel':
        if (S.time >= 21 * 60) return { label: 'Ísť spať (koniec dňa)', type: 'press', time: 0, run: () => endDay(false) };
        return { label: 'Ľahnúť si', type: 'press', time: 0, run: () => say(pick(BED_NO)) };
      case 'kid':
        if (!k) return null;
        if (k.state === 'lost') return { label: `Zobrať ${KIDACC}`, type: 'press', time: 0, run: () => { kidFollow(); say(`${KID}: „Tati, zabudol si ma!“ Áno. Prepáč.`); } };
        if (k.state === 'skolka') return null;
        return { label: `Objať ${KIDACC}`, type: 'press', time: 0, run: () => {
          if (!cooled('hug')) return say(`${KID}: „Tati, už dosť, idem sa hrať!“`);
          setCool('hug', 30); fx({ nervy: -10, dad: 1 });
          say(pick(['Objatie. Najlepší liek na všetko.', `${KID}: „Ľúbim ťa, tati. Kúpiš mi poníka?“`, `${KID}: „Tati, smrdíš fritézou.“ Objatie aj tak.`]));
        } };
      case 'dog':
        if (!d) return null;
        if (d.state === 'lost') { if (p && dist(d, p) <= 40) return { label: `Zavolať ${DOGACC}`, type: 'press', time: 0, run: () => { dogSet('follow'); say(`${DOG} pribehol. Tvári sa, že sa nič nestalo.`); } }; return null; }
        if (d.state === 'follow' && c && dist(c, p) < 8 && !(p && p.inCar)) return { label: `Naložiť ${DOGACC} do auta`, type: 'press', time: 0, run: () => { dogSet('car'); say(`${DOG} skočil dnu. Zadné sedadlo je jeho. Vždy bolo.`); } };
        return { label: `Pohladkať ${DOGACC}`, type: 'press', time: 0, run: () => {
          if (!cooled('pet')) return say(`${DOG} odchádza. Má svoje veci.`);
          setCool('pet', 40); fx({ nervy: -6 });
          say(pick([`${DOG} kýva chvostom. Nervy −6. Lacná terapia.`, `${DOG} sa prevalil na chrbát. Brucho. Povinnosť.`, `${DOG} ti oblizol bradu. Teraz vonia ako klobása.`]));
        } };
      case 'pelech':
        if (d && d.state === 'follow') return { label: `Nechať ${DOGACC} doma`, type: 'press', time: 0, run: () => { dogSet('home'); S.dogWith = false; say(`${DOG} si ľahol do pelechu. Pohľad: zrada.`); } };
        return null;
      case 'rampa':
        if (d && d.state === 'follow') return { label: `Nechať ${DOGACC} v kuchyni`, type: 'press', time: 0, run: () => { dogSet('kuchyna'); S.dogWith = false; say(`Peter: „Jasné, postrážim.“ ${DOG} už vie, kde sú rezne.`); } };
        return null;
      case 'car':
        if (p && p.inCar) return null;
        return { label: 'Nasadnúť do Fabie', type: 'press', time: 0, run: () => useCar() };
      case 'stojan1': case 'stojan2': {
        if (S.stack.some(q => q.id === 'tankovanie')) return null;
        return { label: 'Natankovať', type: 'press', time: 0, run: () => {
          const pos = hsPos(hsId);
          if (!pos || !c || dist(c, pos) > 14) return say('Bez Fabie tankovať nebudem. Do vrecka sa to nezmestí.');
          const q = push('tankovanie', { force: true });
          const a = q && stepAction(q, hsId);
          if (a) a.run();
        } };
      }
    }
    return null;
  }

  function actionFor(hsId) {
    if (!G.S || !hsId) return null;
    hsId = canon(hsId);
    return questAction(hsId) || defaultAction(hsId);
  }

  function usePhone() {
    const a = questAction('phone');
    if (a) a.run();
    else ui('phoneIdle');
  }

  function useCar() {
    const S = G.S, c = car();
    if (S.flags.noDrive) {
      if (S.time >= (S.flags.noDriveUntil || 0)) { S.flags.noDrive = false; S.flags.drinkBeers = 0; }
      else return say('Dve pivá. Fabia zostáva. Idem peši.');
    }
    if (!S.items.has('kluce')) {
      const ex = S.stack.find(q => q.id === 'kluce');
      if (ex) { bringTop(ex); say('Kľúče stále nikde. Fabia čaká.'); }
      else { push('kluce', { force: true }); say('Kde sú kľúče?! Boli tu. Určite.'); }
      return;
    }
    if (c && c.battery != null && c.battery <= 0) {
      const ex = S.stack.find(q => q.id === 'baterka');
      if (ex) bringTop(ex); else push('baterka', { force: true });
      return say('Kr-kr-kr. Nič. Baterka je mŕtva.');
    }
    const a = A();
    if (a && a.enterCar) a.enterCar();
  }

  function spawnInterrupt(id) {
    if (!G.S) return null;
    return push(id, { force: true });
  }

  // ---------- náhodné prerušenia a rozptýlenia ----------
  const CORE = new Set(['ranajky', 'kluce', 'skolka', 'timea_s_tebou', 'timea_k_babke', 'kokes_vencenie', 'rozvoz', 'kokes_logistika', 'spicka', 'vyzdvihnut', 'uspavanie', 'timea_u_vandy']);
  const dayMult = (p, S) => (p.dayW && p.dayW[S.dayType] != null ? p.dayW[S.dayType] : 1);
  // kandidáti z POOL pre „teraz“: okno sedí, cond platí, dnes nepoužité, nie v pláne (nevyhorené)
  function eligibleNow(opts) {
    const S = G.S, h = S.time / 60;
    opts = opts || {};
    return POOL.filter(p => p.win && h >= p.win[0] && h <= p.win[1] && dayMult(p, S) > 0
      && !((needsKid(p) || p.kidOnly) && !S.kidWithMe)
      && !S.doneIds.has(p.id) && !S.stack.some(q => q.id === p.id)
      && !S.dayPlan.some(e => e.id === p.id && !e.fired && !e.skipped)
      && (opts.ignoreFam || !(S.famCount[p.fam] > 0))
      && (!opts.quick || isQuick(p))
      && (!p.cond || (() => { try { return !!p.cond(S); } catch (err) { return false; } })()));
  }
  // denný rozpočet pushov (jadro 9 + náhodné ≤ eventsMax + 1 rezerva na reťazenie): výplne z POOL len kým sa doň zmestia aj ešte neodpálené plánované položky;
  // extra pushe si nechávajú 2 miesta pre hodinovú garanciu (tá má prednosť)
  const DAY_BUDGET = () => (G.S && G.S.segment ? SEG_BUDGET : CFG.eventsMax + 10);
  // plánované položky čakajúce na nesplnenú podmienku (why === 'cond', napr. polícia bez auta) sa do „ešte príde“ nepočítajú
  const budgetLeft = () => { const S = G.S; const left = S.dayPlan.filter(e => !e.fired && !e.skipped && e.why !== 'cond').length + S.pending.length; return DAY_BUDGET() - S.fired - left; };
  function pushFiller(tag, opts) {
    const S = G.S;
    opts = opts || {};
    // výplne len ak stack < 6 („rýchle“ – telefón/voľba – až do 8) a len v rámci denného rozpočtu
    if (S.stack.length >= (opts.quick ? 8 : 6)) return null;
    if (budgetLeft() < (opts.reserve != null ? opts.reserve : 2) + 1) return null;
    const c = eligibleNow(opts);
    if (!c.length) return null;
    const sel = weightedPick(c, (p) => (p.w || 1) * dayMult(p, S));
    if (!sel) return null;
    const q = push(sel.id, { tag });
    if (q) { S.fillers++; log(`↪ (${tag}) ${sel.id}`); }
    return q;
  }
  // extra push každých 60–120 reálnych s: len ak stack < 5 a v rámci denného rozpočtu (pushFiller)
  function randomExtra() {
    const S = G.S;
    if (S.stack.length >= 5) return;
    const q = pushFiller('extra', { reserve: 2 });
    if (q) S.extraFired++;
  }
  // hodinová garancia: ak do hh:40 v tejto hodine nič neprišlo (7–20), vnúť výplň (ignoruje limit rodiny)
  // len ak stack < 6; „rýchle“ (telefón/voľba) až do 8
  // „rýchla“ udalosť = všetky kroky sú telefón / čistá voľba (vyrieši sa jedným klikom)
  const isQuick = (p) => (p.variants && p.variants.length ? p.variants : [{}]).every(v => (v.steps || p.steps || []).every(st => st.type === 'choice' && (st.at === 'phone' || st.at === 'auto' || st.auto)));
  function hourlyGuarantee() {
    const S = G.S, h = Math.floor(S.time / 60), m = S.time - h * 60, seg = S.segment;
    // celý deň: hodiny 7–20; zmena: len jej hodiny (a nie v posledných 8 minútach)
    const hLo = seg ? Math.floor(seg.start / 60) : 7, hHi = seg ? Math.floor((seg.end - 1) / 60) : 20;
    if (h < hLo || h > hHi || m < 40 || S.hourPushed[h]) return;
    if (seg && S.time > seg.end - 8) return;
    if (S.stack.length >= 8) return;
    if (S.hourTry[h] && S.time < S.hourTry[h]) return;
    S.hourTry[h] = S.time + 4;
    const quick = S.stack.length >= 6;
    // 1) potiahnuť dopredu plánovanú (ešte nevyhorenú) udalosť, ktorej okno sedí
    const hh = S.time / 60;
    const pull = S.dayPlan.filter(e => !e.fired && !e.skipped && !CORE.has(e.id) && DEF[e.id] && DEF[e.id].win
      && hh >= DEF[e.id].win[0] && hh <= DEF[e.id].win[1] && (!quick || isQuick(DEF[e.id]))
      && (!DEF[e.id].cond || (() => { try { return !!DEF[e.id].cond(S); } catch (err) { return false; } })()));
    if (pull.length) {
      const e = pull[0];
      const q = push(e.id, { variant: e.variant, force: true, tag: 'hodina' });
      if (q) { e.fired = true; e.firedAt = S.time; e.pulled = true; S.fillers++; S.famFired[e.fam] = (S.famFired[e.fam] || 0) + 1; log(`↪ (hodina, skôr) ${e.id}`); return; }
    }
    // 2) výplň z POOL (pri stacku ≥ 9 len „rýchle“ – telefón/voľba)
    // hodinová garancia smie rozpočet dočerpať (reserve −1 = aj pri 0 voľných)
    pushFiller('hodina', { quick, reserve: -1 }) || pushFiller('hodina', { quick, ignoreFam: true, reserve: -1 }) || (quick && pushFiller('hodina', { ignoreFam: true, reserve: -1 }));
  }

  const DISTRACT = [
    `🐕 ${DOG} sa škriabe. Musel si sa pozerať 20 sekúnd.`,
    '🤔 Zamkol si bistro? Asi hej. Asi.',
    '🎵 V hlave ti hrá pesnička z rozprávky. Už štvrtú hodinu.',
    '🧻 Doma nie je toaletný papier. Zapamätaj si to. (nezapamätáš)',
    '📱 Katka má nový profilový obrázok. Pozeral si ho dlhšie, než treba.',
    '🧾 Bloček z júla v zadnom vrecku. Prečo. Načo.',
  ];
  function distract() {
    const S = G.S, p = player();
    if (S.focus < 45 && rand() < 0.35) {
      S.hideArrow = 7;
      say('Počkaj… prečo som sem išiel?');
    } else if (!(p && p.inCar) && rand() < 0.4) {
      ui('insta', () => fx({ focus: -6 }));
    } else {
      toast(pick(DISTRACT), 'info');
      fx({ focus: -4 });
    }
  }

  // ---------- riaditeľ: spúšťanie plánu ----------
  function firePlan() {
    const S = G.S;
    for (const e of S.dayPlan) {
      if (e.fired || e.skipped || S.time < e.t) continue;
      const def = DEF[e.id];
      if (!def) { e.skipped = true; continue; }
      const core = CORE.has(e.id);
      const delay = (why) => { e.t += 10; e.tries = (e.tries || 0) + 1; e.why = why; e.waited = (e.waited || 0) + 10; };
      // náhrada len pri nesplnenej podmienke (raz); pôvodná položka ostáva v rade, kým nebude možná
      const subst = () => { if (e.subst || core) return; e.subst = true; const q = pushFiller('náhrada za ' + e.id); if (q) e.substId = q.id; };
      if (S.doneIds.has(e.id) && !def.repeatable) { e.skipped = true; continue; }
      if (S.stack.some(q => q.id === e.id)) { e.fired = true; continue; }
      if (e.id === 'spicka') {
        if (S.bistroClosed) e.variant = 3;
        else if (S.gasOut || S.flags.coldKitchen) e.variant = 4;
      }
      if (e.id === 'vyzdvihnut') {
        const k = kid();
        if (!(k && k.state === 'skolka')) { if (S.time > 18 * 60 + 30) e.skipped = true; else delay('kid'); continue; }
      }
      if (e.id === 'uspavanie') {
        const k = kid();
        if (!(k && (k.state === 'home' || k.state === 'sick') && !S.stack.some(q => q.id === 'vyzdvihnut'))) { if (S.time > 23 * 60) e.skipped = true; else delay('home'); continue; }
      }
      if (!core) {
        // rodina obsadená: odklad, po 30 min push aj tak
        if (e.fam !== 'base' && S.famCount[e.fam] > 0 && (e.famWait || 0) < 30) { delay('fam'); e.famWait = (e.famWait || 0) + 10; continue; }
        // plný stack: len odklad (náhrada by sa tiež nezmestila)
        if (S.stack.length >= 7) { if (S.time > 22 * 60 + 30) e.skipped = true; else delay('stack'); continue; }
        if (def.cond) {
          let ok = false; try { ok = !!def.cond(S); } catch (err) { ok = false; }
          if (!ok) {
            subst();
            if (S.time > 22 * 60 + 30 || (def.win && S.time > def.win[1] * 60 + 120)) e.skipped = true; else delay('cond');
            continue;
          }
        }
      } else if (def.cond) {
        // jadro dňa: iba skutočne nemožná podmienka (napr. kokes_logistika bez psa) sa odkladá, nikdy nenahrádza
        let ok = false; try { ok = !!def.cond(S); } catch (err) { ok = false; }
        if (!ok) { if (S.time > 22 * 60 + 30 || (e.id === 'kokes_logistika' && S.time > S.lunchAt)) e.skipped = true; else delay('cond'); continue; }
      }
      const q = push(e.id, { variant: e.variant, force: true });
      if (q) { e.fired = true; e.firedAt = S.time; S.famFired[e.fam] = (S.famFired[e.fam] || 0) + 1; }
      else if (core) { delay('push'); }
      else { e.skipped = true; subst(); }
    }
  }

  function driveCheck(dt) {
    const S = G.S, c = car(), p = player();
    if (!c || !p) return;
    for (const q of S.stack.slice()) {
      const st = stepOf(q);
      if (!st || st.type !== 'drive') continue;
      const lc = locCenter(val(st.loc, q));
      if (!lc) continue;
      if (dist(c, lc) > lc.r || Math.abs(c.speed || 0) > 2 || dist(p, c) > 25) continue;
      const miss = needMissing(st, 'loc:' + val(st.loc, q), q);
      if (miss) { if (cooled('driveMiss')) { setCool('driveMiss', 12); say(miss.msg); } continue; }
      runStep(q, st, 'loc:' + val(st.loc, q));
    }
  }

  // ---------- hlavná aktualizácia ----------
  function update(dt) {
    const S = G.S;
    if (!S || S.ended) return;
    if (G.UI && G.UI.modal) return;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.25);
    const p = player(), c = car();
    S.rt += dt;
    if (S.freeze > 0) S.freeze = Math.max(0, S.freeze - dt);
    const gm = dt * CFG.timeScale * (S.hyper > 0 ? 0.5 : 1);
    S.time += gm;
    S.stackInt += S.stack.length * gm; S.stackT += gm;
    if (S.hyper > 0) S.hyper = Math.max(0, S.hyper - dt);
    if (S.hideArrow > 0) S.hideArrow = Math.max(0, S.hideArrow - dt);

    // staty
    const running = !!(p && p.running && !p.inCar);
    S.focus = clamp(S.focus - 0.12 * dt, 0, 100);
    S.nervy = clamp(S.nervy - 0.05 * dt, 0, 100);
    S.energy = clamp(S.energy - (running ? 0.3 : 0.1) * dt, 0, 100);
    S.dad = Math.max(0, S.dad);
    if (S.nervy >= 100) {
      toast('AAAA! 🤯 Výbuch nervov.', 'bad');
      log('🤯 Výbuch nervov');
      fx({ rep: -5, focus: -20 });
      S.nervy = 55;
      snd('fail');
    }

    // zabúdanie
    for (let i = S.stack.length - 1; i >= 0; i--) {
      const q = S.stack[i];
      if (i === 0) { q.idle = 0; continue; }
      if (q.pinned || q.def.noForget) continue;
      q.idle += dt;
      if (q.idle >= (q.def.forget || CFG.forgetTime)) forget(q);
    }
    // deadliny
    for (const q of S.stack.slice()) {
      if (!q.late && q.deadline != null && S.time > q.deadline) failDeadline(q);
    }
    // plán dňa + hodinová garancia
    firePlan();
    hourlyGuarantee();
    // jazda k lokácii
    driveCheck(dt);
    arriveCheck();
    // odložené pushe (herné minúty)
    for (let i = S.pending.length - 1; i >= 0; i--) {
      const pd = S.pending[i];
      pd.t -= gm;
      if (pd.t <= 0) { S.pending.splice(i, 1); const q = push(pd.id); if (q && pd.from) log(`🔗 Reťazenie: ${pd.from} → ${pd.id}`); }
    }
    // rezerva paliva (max 1× za deň)
    if (c && S.tankCount < 1 && cooled('fuelTrig') && c.fuel < CFG.reserveFrac * CFG.tankL && !S.stack.some(q => q.id === 'tankovanie')) {
      S.tankCount++; push('tankovanie', { force: true });
    }
    // uzávierka cesty
    if (S.roadBlock && S.time >= S.roadBlock.until) {
      const m = M();
      if (m && Array.isArray(m.solidsCar)) { const i = m.solidsCar.indexOf(S.roadBlock.rect); if (i >= 0) m.solidsCar.splice(i, 1); }
      S.roadBlock = null;
      toast('🚧 Cesta je zase otvorená. Kopáči odišli na obed.', 'info');
    }
    if (S.hideCarArrow && S.time >= S.hideCarArrow) S.hideCarArrow = 0;
    // náhodné extra prerušenia a rozptýlenia (nie v hyperfokuse)
    if (S.hyper <= 0) {
      S.intT -= dt;
      if (S.intT <= 0) { S.intT = rr(60, 120) * (S.focus < 30 ? 0.8 : S.focus < 50 ? 0.9 : 1); randomExtra(); }
      S.disT -= dt * (S.focus < 30 ? 1.8 : S.focus < 50 ? 1.35 : 1);
      if (S.disT <= 0) { S.disT = rr(25, 60); distract(); }
    }
    // koniec dňa (polnoc na gauči) / koniec zmeny (bez penalizácie)
    if (S.segment) { if (S.time >= S.segment.end) endDay(false); }
    else if (S.time >= CFG.dayEnd) endDay(true);
  }

  // ---------- deň ----------
  const Ev = {};
  function newDay() {
    const sv = load();
    const seed = (Ev.debugSeed != null ? Ev.debugSeed : (Date.now() ^ (Math.random() * 0xffffffff))) >>> 0;
    Ev.seed = seed;
    RNG = mulberry(seed + 7);
    const mode = CFG.sessionMode || 'random';
    const seg = pickSegment(mode, sv.lastSegment, mulberry((seed + 23) || 1));
    const plan = buildPlan(mulberry(seed || 1), sv.day, seg);
    const S = G.S = fresh(sv);
    S.seed = seed;
    S.dayType = plan.dayType;
    S.dayTypeName = '?';
    S.segment = seg ? Object.assign({}, seg) : null;
    S.segmentName = seg ? seg.name : null;
    S.time = plan.start;
    S.dayStart = plan.start;
    S.dayEnd = seg ? seg.end : CFG.dayEnd;
    S.deliveries = plan.deliveries;
    S.keyAt = plan.keyAt;
    S.lunchAt = plan.lunchAt;
    S.weekend = plan.weekend;
    S.kidWithMe = !!plan.kidWithMe;
    S.kidWhere = S.kidWithMe ? 'paťo' : 'vanda';
    S.prevKidWithMe = sv.kidWithMe;
    S.dayPlan = plan.plan;
    S.intrude = assignIntrudes(mulberry((seed + 11) || 1));
    S.famFired = {};
    S.weather = plan.dayType === 'dazd' ? 'rain' : 'clear';
    Ev.dayPlan = S.dayPlan;
    const a = A();
    try { if (a && a.reset) a.reset(sv.day); } catch (e) { console.warn('Act.reset', e); }
    const c = car();
    if (c) { c.fuel = CFG.tankL * rr(0.4, 0.9); c.flat = false; c.battery = 1; }
    // striedavá starostlivosť: Nelka doma, alebo u Simony (mimo mapy, nekreslí sa)
    kidSet(S.kidWithMe ? 'home' : 'away'); dogSet('home');
    if (seg) placeForSegment(S, seg, plan);
    try { if (G.Scene && G.Scene.weather) G.Scene.weather(S.weather); } catch (e) { /* nič */ }
    const dt = DAYTYPES[S.dayType];
    if (dt && dt.immediate) { S.dayTypeRevealed = true; S.dayTypeName = dt.name; log('📅 ' + dt.name); }
    log(`🌅 ${G.DAYS ? G.DAYS[(sv.day - 1) % 7] : 'Deň'} ${sv.day}, seed ${seed}${seg ? ` – ${seg.name} (${hm(seg.start)}–${hm(seg.end)})` : ''}`);
    log(S.kidWithMe ? `👧 ${KID} je dnes s tebou` : `👧 ${KID} je dnes u Simony`);
    firePlan();
    const sid = seg ? seg.id : 'full';
    if (sid === 'full' || sid === 'rano') say(S.dayType === 'zaspal' ? 'JE 7:40?! BUDÍK! Kurnik, budík!' : S.dayType === 'dazd' ? 'Leje. Samozrejme, že leje.' : pick(['Ráno. Zase.', 'Budík. Tretíkrát odložený. Vstávaj.', `${DOG} ti dýcha do tváre. Ráno.`]));
    else say(SEG_OPENER[sid] ? SEG_OPENER[sid]() : '');
  }

  const SEG_OPENER = {
    dopoludnie: () => pick(['Rampa, káva, boxy. Dopoludnie.', 'Pol desiatej. Wayan už máva. Boxy čakajú.']),
    obed: () => pick(['Bistro sa plní. Dana sa na teba pozerá. Tým pohľadom.', 'Pol dvanástej. Vôňa rezňov. Ticho pred búrkou.']),
    popoludnie: () => pick(['Popoludnie. Škôlka zatvára o pol piatej. Nezabudni. (zabudneš)', 'Dve hodiny. Obed prežitý. Zoznam v hlave: dlhý.']),
    vecer: () => pick(['Večer. Doma. Teoreticky voľno.', `Pol šiestej. ${DOG} chce von, telefón chce teba.`]),
    noc: () => pick(['Pol deviatej. Byt tichý. Mozog nie.', 'Noc. Zoznam na zajtra píše sám seba. V hlave. O tretej ráno.']),
  };

  // počiatočný stav zmeny (po Act.reset + kidSet/dogSet podľa starostlivosti): kde si, kde je Fabia, Nelka, Bundáš, čo máš vo vrecku
  function placeForSegment(S, seg, plan) {
    const a = A(), p = player(), c = car(), m = M();
    const sid = seg.id;
    if (sid === 'rano') return; // ako doteraz: posteľ, Nelka doma, Bundáš doma, bez kľúčov
    S.items.add('kluce');
    if (sid === 'vecer' || sid === 'noc') {
      // doma pri posteli (Act.reset), Fabia na parkovisku pri byte, Nelka už vyzdvihnutá (home) alebo u Simony, Bundáš doma
      S.flags.pickedUp = true;
      return;
    }
    // dopoludnie / obed / popoludnie: pri rampe kuchyne, Fabia vedľa na dvore
    const rp = hsPos('rampa');
    if (rp && p) { p.x = rp.x + 2; p.z = rp.z - 2; p.inCar = false; p.route = null; }
    if (rp && c) {
      c.x = rp.x + 6; c.z = rp.z - 2; c.speed = 0;
      const nr = m && m.nearestRoad ? m.nearestRoad(c.x, c.z, 80) : null;
      if (nr) c.a = Math.atan2(nr.z - c.z, nr.x - c.x);
      try { if (a && a.unstuckCar) a.unstuckCar(); } catch (e) { /* nič */ }
    }
    if (sid === 'obed') { const pp = hsPos('pult'); if (pp && p) { p.x = pp.x; p.z = pp.z + 1.2; } }
    // Nelka cez deň: škôlka / u babky / s tebou (víkend, chorá)
    if (S.kidWithMe) {
      if (plan.kidPlan === 'timea_s_tebou') { if (S.dayType === 'timea_chora') kidSet('sick'); else kidFollow(); }
      else if (plan.kidPlan === 'timea_k_babke') { kidSet('skolka'); S.flags.kidAtBabka = true; const k = kid(), bp = hsPos('babka'); if (k && bp) { k.x = bp.x; k.z = bp.z; } }
      else { kidSet('skolka'); S.flags.kidAtSkolka = true; }
    }
    dogSet(plan.dogStart || 'kuchyna');
    S.dogWith = plan.dogStart === 'follow';
  }

  function endDay(forced) {
    const S = G.S;
    if (!S || S.ended) return;
    const k = kid(), c = car(), seg = S.segment;
    if (k && k.state === 'lost') { fx({ dad: -5 }); toast(`😱 ${KID} nie je doma! Babka ju priviezla taxíkom.`, 'bad'); log(`😱 ${KID} ostala vonku, zachránila babka`); }
    // Nelka v škôlke na konci: trest len na konci celého dňa (na konci dopoludnia/obeda tam patrí)
    if (!seg && k && k.state === 'skolka' && !S.flags.kidAtBabka) { fx({ dad: -8 }); toast(`😱 ${KID} ostala v škôlke! Učiteľka ju vzala domov. K sebe.`, 'bad'); log(`😱 ${KID} ostala v škôlke`); }
    const d = dog();
    if (d && d.state === 'lost') { fx({ nervy: 5 }); toast(`🐕 ${DOG} prišiel domov sám. O polnoci. Špinavý.`, 'info'); }
    if (seg) {
      // koniec zmeny: nedokončené položky nie sú zabudnuté ani zlyhané – len „ostalo v hlave“
      S.leftover = S.stack.map(q => String(val(q.def.title, q) || q.id));
      log(`⏱️ ${seg.name} je za tebou.${S.leftover.length ? ' V hlave ostalo: ' + S.leftover.join(', ') : ''}`);
    } else if (forced) { fx({ energy: -20 }); toast('🥱 Polnoc. Zaspal si oblečený na gauči.', 'info'); log('🥱 Polnoc na gauči'); }
    else log('🛏️ Spať. Konečne.');
    S.ended = true;
    S.stats = stats();
    save({ day: S.day + 1, money: S.money, rep: S.rep, dad: S.dad, fuel: c ? c.fuel : CFG.tankL * 0.6, kidWithMe: !!S.kidWithMe, lastSegment: seg ? seg.id : null });
    ui('summary', S, () => nextDay());
  }
  function nextDay() { newDay(); }

  function stats() {
    const S = G.S;
    if (!S) return null;
    const fams = {};
    for (const e of S.dayPlan) if (e.fired) fams[e.fam] = (fams[e.fam] || 0) + 1;
    return { dayType: S.dayType, kidWithMe: !!S.kidWithMe, kidWhere: S.kidWhere, segment: S.segment ? S.segment.id : 'full', segmentName: S.segment ? S.segment.name : null,
      leftover: (S.leftover || []).slice(), planned: S.dayPlan.length, fired: S.dayPlan.filter(e => e.fired).length, extra: S.extraFired || 0,
      families: fams, tankCount: S.tankCount, lunchInterrupts: S.lunchInterrupts | 0, lunchInterruptIds: S.lunchInterruptIds.slice(), fillers: S.fillers,
      skipped: S.dayPlan.filter(e => e.skipped).map(e => e.id), substituted: S.dayPlan.filter(e => e.substId).map(e => e.id + '→' + e.substId),
      // v3 metriky
      pushed: S.fired, completed: S.done.length, forgotten: S.forgotten.length, failed: S.failed.length,
      avgStack: S.stackT > 0 ? Math.round(S.stackInt / S.stackT * 100) / 100 : 0,
      avgTargetDist: S.tdN > 0 ? Math.round(S.tdSum / S.tdN) : 0,
      intrudes: Object.assign({}, S.intrudeCount),
      hoursPushed: Object.keys(S.hourPushed).map(Number).sort((a, b) => a - b) };
  }
  const frozen = () => !!(G.S && G.S.freeze > 0);

  Object.assign(Ev, {
    DEF, CH, POOL, LUNCH_INTERRUPTS, DAYTYPES, ITEM, hm, eur,
    newDay, update, fx, push, active, stepOf, targets, hsPos, dynHs, actionFor,
    usePhone, cycle, bringTop, pin, useCar, endDay, nextDay, spawnInterrupt, stats, simulatePlan, log,
    dayPlan: [], seed: 0, debugSeed: null,
    kidWithMe, kidToday, dogWithMe, frozen, assignIntrudes, INTRUDE_MIX,
    SEGMENTS, pickSegment,
  });
  G.Ev = Ev;
  G.Q = Ev;
})();
