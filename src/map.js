// Mapa v3: kompaktné mestečko 640×440 m – dáta mapy (cesty ako krivky, lokácie, nábytok, hotspoty), 2D logika
// (kolízie, isPaved, trasovanie A*), predkreslená zem (groundCanvas 5120×3520, GS = 8 px/m) a GTA minimapa (miniCanvas 640×440).
// Čistý JS, bez modulov, funguje cez file://.
//
// Súradnice: metre, x 0..640 (východ), z 0..440 (juh).
// Obdĺžniky {x,z,w,d,rot}: x,z = STRED, w pozdĺž lokálnej osi x, d pozdĺž lokálnej osi z.
// rot/rotY: uhol v rovine XZ, kladný otáča lokálnu os +x smerom k +z (na mape v smere hodinových ručičiek).
//   lokálne -> svet: wx = cx + cos*lx - sin*lz ; wz = cz + sin*lx + cos*lz.
//
// Rozloženie (CONTRACT3 §2): diaľnica D1 pozdĺž severného okraja (Trenčín západ, Trnava východ), 2 hlavné ulice
// (Hlavná z≈130, Špitálska z≈300), 3 zvlnené priečne (Západná x≈130, Stredná x≈330 s mostom, Východná x≈520),
// diagonála Jégého cez centrum, zákruta Parková okolo parku, Nábrežie a rieka pozdĺž juhu.
// Zhluky: západ byt+škôlka+babka+park, centrum kuchyňa+bistro+6 výdajní, sever benzínka+veľkoobchod+servis,
// juh pošta+pohotovosť+zámočník+veterinár (za mostom), východ ex+Katka.
(() => {
  'use strict';
  const G = (window.G = window.G || {});
  const M = (G.Map = G.Map || {});
  const CFG = G.CFG || {};
  const NAMES = G.NAMES || { outlets: [] };
  const W = CFG.W || 640, H = CFG.H || 440;
  // rozlíšenie textúry zeme: 8 px/m (5120×3520); ?lowres = 4 px/m (len pre slabé GPU / testy)
  const LOWRES = (typeof location !== 'undefined' && /lowres/.test(location.search)) || (G.CFG && G.CFG.lowres);
  const GS = LOWRES ? 5 : 10, GW = W * GS, GH = H * GS;
  M.W = W; M.H = H; M.GW = GW; M.GH = GH; M.GS = GS;
  M.SIDEWALK = 1.5; M.DOOR_W = 1.6; M.WALL_T = 0.3; M.NODE_STEP = 15; M.HS_R = 2.5;
  M.RIVER_W = 24;

  // ---------- RNG (deterministický) ----------
  let seed = 20251022;
  M.seed = (s) => { seed = s >>> 0; };
  const R = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = Math.hypot;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  M.mk = mk;

  // ---------- farby ----------
  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (r, g, b) => '#' + ((1 << 24) | (cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).slice(1);
  function shade(h, a) {
    const c = hexRgb(h);
    if (a >= 0) return toHex(c[0] + (255 - c[0]) * a, c[1] + (255 - c[1]) * a, c[2] + (255 - c[2]) * a);
    return toHex(c[0] * (1 + a), c[1] * (1 + a), c[2] * (1 + a));
  }
  const rgba = (h, a) => { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  M.shade = shade;

  // ============================================================
  //  DÁTA: CESTY (kontrolné body -> Catmull-Rom)
  // ============================================================
  const P = (a) => a.map((p) => ({ x: p[0], z: p[1] }));
  const ROADS = [
    { id: 'd1', name: 'Diaľnica D1', kind: 'hwy', w: 12, ctrl: P([[0, 24], [150, 20], [320, 26], [480, 20], [640, 24]]) },
    { id: 'hlavna', name: 'Hlavná', kind: 'main', w: 10, ctrl: P([[0, 136], [110, 131], [230, 125], [340, 130], [450, 134], [560, 129], [640, 132]]) },
    { id: 'spitalska', name: 'Špitálska', kind: 'main', w: 10, ctrl: P([[0, 298], [120, 306], [240, 300], [350, 294], [460, 298], [560, 304], [640, 298]]) },
    { id: 'nabrezie', name: 'Nábrežie', kind: 'city', w: 7, ctrl: P([[60, 374], [180, 366], [300, 370], [420, 374], [540, 368], [610, 362]]) },
    { id: 'zapadna', name: 'Západná', kind: 'city', w: 7, ctrl: P([[128, 22], [134, 90], [127, 200], [132, 306], [128, 372]]) },
    { id: 'stredna', name: 'Stredná (most)', kind: 'main', w: 10, bridge: true, ctrl: P([[328, 24], [334, 130], [326, 220], [332, 294], [338, 370], [342, 436]]) },
    { id: 'vychodna', name: 'Východná', kind: 'city', w: 7, ctrl: P([[518, 22], [524, 130], [516, 220], [522, 300], [518, 370]]) },
    { id: 'jegeho', name: 'Jégého', kind: 'city', w: 7, ctrl: P([[332, 294], [395, 242], [455, 192], [524, 130]]) },
    { id: 'parkova', name: 'Parková', kind: 'city', w: 7, ctrl: P([[130, 178], [172, 168], [222, 182], [248, 222], [256, 262], [260, 300]]) },
  ];
  const RIVER = { id: 'dunaj', name: 'Dunaj', w: M.RIVER_W,
    ctrl: P([[-10, 404], [100, 398], [220, 404], [340, 402], [460, 398], [580, 404], [650, 400]]) };

  // polia / záhradky: {x,z (stred), w,d, rot, t (typ 'A' obilie,'B' zelené,'C' pôda)}
  const FIELDS = [
    { x: 48, z: 225, w: 70, d: 104, rot: 0.04, t: 'B' },
    { x: 100, z: 429, w: 180, d: 16, rot: 0, t: 'A' },
    { x: 560, z: 429, w: 140, d: 16, rot: 0, t: 'C' },
  ];

  // ============================================================
  //  DÁTA: LOKÁCIE (lokálne súradnice vzhľadom na stred budovy; prevedú sa do sveta v build())
  //  interior: [typ, lx, lz, w, d, solid, extra]   hs: [id, name, lx, lz]   lots: [kind, lx, lz, w, d]   paths: [[lx,lz],[lx,lz],...,w]
  //  label: krátky nápis na strechu (2D renderer)
  // ============================================================
  const OUT = NAMES.outlets || [];
  const outletName = (i) => OUT[i] || ('Výdajňa ' + (i + 1));

  // kiosk výdajne: malá búdka (6×5 m, väčšie 8×6 / 10×7) s okienkom pri dverách a spevnenou plochou (pad) smerom k ceste
  function kiosk(i, x, z, side, rotY, opt) {
    opt = opt || {};
    const w = opt.w || 6, d = opt.d || 5;
    const nx = side === 'E' ? 1 : side === 'W' ? -1 : 0, nz = side === 'S' ? 1 : side === 'N' ? -1 : 0;
    const dx = nx * w / 2, dz = nz * d / 2; // dvere (lokálne)
    const along = nz !== 0; // dverová stena vodorovná (pozdĺž x)
    const cL = Math.min(4, (along ? w : d) - 1.2), sL = Math.min(5.5, (along ? w : d) - 1);
    const interior = [
      ['counter', dx - nx * 1.3, dz - nz * 1.3, along ? cL : 0.8, along ? 0.8 : cL, 1, { win: true }],
      ['shelf', -dx + nx * 0.5, -dz + nz * 0.5, along ? sL : 0.8, along ? 0.8 : sL, 1],
      ['fridge', along ? -w / 2 + 0.6 : 0, along ? 0 : -d / 2 + 0.6, 1, 1, 1],
      ['board', dx - nx * 0.4 + (along ? w / 2 - 0.9 : 0), dz - nz * 0.4 + (along ? 0 : d / 2 - 0.9), along ? 1.2 : 0.3, along ? 0.3 : 1.2, 0],
    ];
    const padLen = (opt.padLen || 12) + 4, padW = opt.padW || Math.max(12, (along ? w : d) + 6);
    return {
      id: G.outletId ? G.outletId(i) : 'outlet_' + i, name: outletName(i), label: outletName(i).toUpperCase(), outlet: i,
      x, z, w, d, rotY: rotY || 0, floors: 1, color: opt.color || '#d8d2c4', kind: 'outlet', floor: 'tile', flat: true,
      doors: [{ side, at: 0 }],
      interior,
      hs: [['vydaj_' + i, 'Okienko – ' + outletName(i), dx + nx * 1.6, dz + nz * 1.6]],
      lots: [['pad', dx + nx * (padLen / 2 + 0.2), dz + nz * (padLen / 2 + 0.2), along ? padW : padLen, along ? padLen : padW]],
    };
  }

  const DIAG = -0.707; // smer diagonály Jégého (rad)
  const LOCS = [
    // ---- západ: byt, škôlka, babka, park ----
    { id: 'byt', name: 'Byt', label: 'DOMA', x: 280, z: 170, w: 20, d: 16, rotY: 0, floors: 3, color: '#c9a87c', kind: 'flat', floor: 'wood',
      doors: [{ side: 'E', at: 0 }],
      interior: [
        ['rug', -5.5, -1.5, 4.5, 3.2, 0, { c: '#d98bb0' }],
        ['crib', -7.6, -6.6, 2.4, 1.4, 1], ['cabinet', -1, -7.4, 2.6, 0.7, 1], ['bed', 5.5, -6.4, 2, 2.4, 1],
        ['sofa', -2.2, -5.5, 2.4, 1, 1], ['table', 1.5, -2.5, 1.6, 1, 1],
        ['counter', 3.5, 7.4, 5.6, 0.7, 1, { sink: true, hob: true }], ['coffee', 7, 7.4, 0.6, 0.5, 1], ['fridge', 8.8, 5.8, 1, 1, 1],
        ['shoes', 8.4, 2.8, 0.5, 1.2, 1], ['hooks', 9.6, -2.6, 0.3, 1.4, 1], ['dogbed', -7, 5, 1.1, 0.9, 0],
        ['rug', 4, 3, 3.5, 2.4, 0, { c: '#8a9bb0' }],
      ],
      hs: [['postielka', 'Postieľka', -6, -5], ['satna', 'Šatník', -1, -5.5], ['postel', 'Posteľ', 5.5, -4],
        ['gauc', 'Gauč', -2.2, -3.5], ['linka', 'Kuchynská linka', 3, 5.5], ['kavovar_byt', 'Kávovar', 6.8, 5.5],
        ['chladnicka', 'Chladnička', 7.5, 4.2], ['botnik', 'Botník', 7.3, 2.4], ['bunda', 'Vešiak s bundou', 8.2, -2.2],
        ['pelech', 'Bundášov pelech', -6.5, 4.5]],
      lots: [['parking', 29, 0, 38, 30]], paths: [[[10, 0], [13, 0], 2.5]] },

    { id: 'skolka', name: 'Škôlka Slniečko', label: 'ŠKÔLKA', x: 280, z: 250, w: 24, d: 14, rotY: 0, floors: 1, color: '#e8a0b8', kind: 'school', floor: 'lino',
      doors: [{ side: 'E', at: 0 }],
      interior: [
        ['rug', -7, -3, 6, 4.5, 0, { c: '#f2c84b' }], ['lockers', -5, 6.3, 7, 0.9, 1], ['kidtable', 4, -3.5, 2.4, 1.2, 1], ['kidtable', 4, 1.5, 2.4, 1.2, 1],
        ['shelf', -11.4, -1, 0.8, 6, 1], ['crib', 8, -5.5, 2.4, 1.4, 1], ['crib', 8, 5, 2.4, 1.4, 1], ['desk', 10, 0, 1.2, 2, 1],
      ],
      hs: [['ucitelka', 'Pani učiteľka', 9, 0]],
      lots: [['parking', 28, 0, 32, 22]], paths: [[[12, 0], [14, 0], 2.5]] },

    { id: 'babka', name: 'U babky', label: 'BABKA', x: 165, z: 191, w: 12, d: 10, rotY: 0.15, floors: 1, color: '#c98a5a', kind: 'house', floor: 'carpet',
      doors: [{ side: 'W', at: 0 }],
      interior: [['rug', -1, -1, 6, 4, 0, { c: '#9b4a3c' }], ['armchair', -3.5, 1, 1, 1, 1], ['table', 0, -0.5, 1.4, 0.9, 1], ['cabinet', 3, -4.4, 3, 0.7, 1], ['bed', 4.5, 2.5, 1.6, 2.2, 1]],
      hs: [['babka', 'Babka', -2, 1.5]],
      lots: [['drive', -21, 0, 30, 5]], paths: [] },

    { id: 'park', name: 'Park', label: 'PARK', x: 188, z: 240, w: 76, d: 56, rotY: 0, floors: 0, color: '#2f6b3a', kind: 'park', floor: 'grass',
      doors: [], interior: [['pond', -18, 10, 22, 16, 0], ['fence', 22, -12, 22, 18, 1],
        ['bench', -14, -22, 2, 0.6, 0], ['bench', 4, -22, 2, 0.6, 0], ['bench', 14, 14, 2, 0.6, 0], ['bench', -32, 22, 0.6, 2, 0]],
      hs: [['vybeh', 'Výbeh pre psov', 22, -12]],
      lots: [],
      paths: [[[-38, 0], [-56, 0], 2.5], [[38, -2], [60, -8], 2.5], [[0, 28], [0, 57], 2.5],
        [[-38, 0], [-34, -10], [-20, -18], [0, -16], [8, -2], [38, -2], 2.2],
        [[0, 28], [-2, 20], [-5, -1], [8, -2], 2.2],
        [[-5, -1], [-6, 20], [-20, 24], [-34, 14], [-38, 0], 2.0],
        [[8, -2], [20, 4], [38, -2], 2.0]] },

    // ---- centrum: kuchyňa, bistro, 6 výdajní ----
    { id: 'kuchyna', name: 'Centrálna kuchyňa', label: 'KUCHYŇA', x: 390, z: 178, w: 50, d: 30, rotY: 0, floors: 1, color: '#aeb6bd', kind: 'hall', floor: 'concrete', flat: true,
      doors: [{ side: 'N', at: -15 }, { side: 'N', at: 15 }],
      interior: [
        ['stove', -19, 13.8, 6, 1.2, 1], ['fryer', -14.5, 13.8, 2.2, 1.2, 1], ['steel', -17, 3, 9, 1.6, 1], ['steel', -17, 8, 9, 1.6, 1],
        ['pass', -9, -13.6, 8, 1, 1], ['shelf', 23.8, -6, 1, 12, 1], ['shelf', 23.8, 8, 1, 10, 1], ['coldbox', 15, 9, 7, 8, 1],
        ['desk', -22.5, -13.5, 2.2, 1, 1], ['cabinet', -24.5, -10, 0.7, 4, 1], ['shelf', 0, 3, 3, 1, 1], ['shelf', 6, 3, 3, 1, 1],
        ['steel', -4, 12, 8, 1.6, 1], ['sink', 5, 13.8, 2.6, 1, 1], ['table', 18, -8, 2, 1, 1], ['bench', 18, -6, 2, 0.5, 1],
        ['ramp', 15, -17, 16, 4, 1, { outside: true }],
      ],
      hs: [['sporak', 'Sporák', -19, 11.5], ['friteza', 'Fritéza', -14.5, 11.5], ['doska', 'Pracovná doska', -17, 5.5], ['regal', 'Regál', 22, -6],
        ['pass', 'Pass (výdaj)', -9, -11.5], ['rampa', 'Rampa – nakládka', 15, -20.5], ['joff', 'Boris (kancelária)', -22, -11.5],
        ['agus', 'Wayan', -21, 10], ['ayo', 'Tunde', -13, 10], ['fredy', 'Santi', -12, 5.5], ['benji', 'Honza', -5, -11],
        ['lukas', 'Peter', 8, -20.5], ['matus', 'Tomáš', 22, -20.5]],
      lots: [['yard', 0, -27, 70, 30]], paths: [] },

    { id: 'bistro', name: 'Bistro', label: 'BISTRO', x: 442, z: 228, w: 22, d: 14, rotY: DIAG, floors: 1, color: '#d9825a', kind: 'shop', floor: 'tile',
      doors: [{ side: 'N', at: -4 }, { side: 'S', at: 6 }],
      interior: [
        ['board', -9.5, -6.5, 1.6, 0.3, 0], ['table', -8, -3.5, 1.2, 1.2, 1], ['table', -4, -3.5, 1.2, 1.2, 1], ['table', -8, 1, 1.2, 1.2, 1],
        ['table', -4, 1, 1.2, 1.2, 1], ['table', -8, 5, 1.2, 1.2, 1], ['counter', 2, -5.5, 5.5, 1, 1, { coffee: true }], ['counter', 4.4, -1.5, 1, 6, 1],
        ['stove', 8.5, -6.3, 3, 1.1, 1], ['fryer', 10.4, -6.3, 0.9, 1.1, 1], ['steel', 8.5, -2.5, 4, 1.2, 1], ['coldbox', -10, 4.8, 1.6, 2.2, 1],
        ['desk', 8, 5.8, 2.2, 1, 1], ['cabinet', 10.5, 2.5, 0.8, 2.2, 1], ['shelf', 1, 6.3, 4, 0.8, 1],
      ],
      hs: [['pult', 'Pult', 1, -3.2], ['kavovar_bistro', 'Kávovar (bistro)', -1.4, -3.2], ['tamara', 'Dana', 3.2, -3.4], ['lucia', 'Lenka', 0, 2.5], ['notebook', 'Notebook', 8, 4],
        ['sanon', 'Šanón s papiermi', 9, 2.5], ['box', 'Chladiaci box', -8.5, 4.8]],
      lots: [['plaza', -3, -11.5, 26, 9], ['pad', 6, 10.5, 8, 7]], paths: [] },

    kiosk(0, 471, 149, 'S', DIAG, { padLen: 12 }),
    kiosk(1, 350, 200, 'W', 0, { padLen: 12, color: '#e3dccb' }),
    kiosk(2, 430, 276, 'S', 0, { padLen: 12 }),
    kiosk(3, 470, 112, 'S', 0, { padLen: 12 }),
    kiosk(4, 496, 240, 'E', 0, { padLen: 12 }),
    kiosk(5, 380, 322, 'N', 0, { padLen: 16 }),
    // ---- ostatné výdajne ----
    kiosk(6, 545, 230, 'W', 0, { w: 8, d: 6, padLen: 18, padW: 14 }),
    kiosk(7, 104, 160, 'E', 0, { w: 8, d: 6, padLen: 16, padW: 14 }),
    kiosk(8, 300, 108, 'S', 0, { w: 10, d: 7, padLen: 12, padW: 18, color: '#b9c4cf' }),
    kiosk(9, 205, 322, 'N', 0, { w: 8, d: 6, padLen: 16, padW: 14 }),
    kiosk(10, 600, 47, 'N', 0, { w: 10, d: 7, padLen: 14, padW: 26 }),
    kiosk(11, 72, 47, 'N', 0, { w: 10, d: 7, padLen: 14, padW: 26 }),

    // ---- sever: benzínka, veľkoobchod, servis ----
    { id: 'pumpa', name: 'Benzínka', label: 'BENZÍNKA', x: 560, z: 75, w: 10, d: 7, rotY: 0, floors: 1, color: '#9c9d98', kind: 'shop', floor: 'tile', flat: true,
      doors: [{ side: 'W', at: 0 }],
      interior: [
        ['checkout', -3.5, -2, 1.4, 2.4, 1], ['coffee', 3.6, -2.8, 0.8, 0.6, 1], ['shelf', 0.5, 2.8, 6, 0.8, 1], ['shelf', 4.2, 0, 0.8, 3, 1],
        ['pump', -21, -7, 1, 2.2, 1, { outside: true, n: 1 }], ['pump', -21, 7, 1, 2.2, 1, { outside: true, n: 2 }],
        ['pillar', -27, -12, 0.5, 0.5, 1, { outside: true }], ['pillar', -15, -12, 0.5, 0.5, 1, { outside: true }],
        ['pillar', -27, 12, 0.5, 0.5, 1, { outside: true }], ['pillar', -15, 12, 0.5, 0.5, 1, { outside: true }],
      ],
      hs: [['pokladna', 'Pokladňa', -1.5, -1.5], ['kavovar_pumpa', 'Kávovar', 2.5, -1.5], ['stojan1', 'Stojan 1', -18.5, -7], ['stojan2', 'Stojan 2', -18.5, 7]],
      canopy: { lx: -21, lz: 0, w: 14, d: 26 },
      lots: [['yard', -21, 0, 34, 40]], paths: [] },

    { id: 'metro', name: 'Veľkoobchod', label: 'VEĽKOOBCHOD', x: 240, z: 76, w: 40, d: 24, rotY: 0, floors: 1, color: '#8a8d90', kind: 'hall', floor: 'concrete', flat: true,
      doors: [{ side: 'S', at: -8 }],
      interior: [
        ['checkout', -15, 9, 1.2, 2.6, 1], ['checkout', -11.5, 9, 1.2, 2.6, 1], ['shelf', 2, -4, 28, 1, 1, { veg: true }], ['shelf', 2, 1, 28, 1, 1],
        ['shelf', 2, 6, 28, 1, 1], ['coldbox', 2, -10.8, 20, 1.6, 1], ['shelf', -17, -4, 1, 10, 1],
      ],
      hs: [['vo_zelenina', 'Zelenina', 0, -6], ['vo_pokladna', 'Pokladňa (VO)', -13, 6]],
      lots: [['parking', 0, 28, 64, 32]], paths: [] },

    { id: 'servis', name: 'Pneuservis', label: 'PNEUSERVIS', x: 70, z: 92, w: 20, d: 14, rotY: 0, floors: 1, color: '#7b7f84', kind: 'hall', floor: 'concrete', flat: true,
      doors: [{ side: 'S', at: -6 }, { side: 'S', at: 4 }],
      interior: [['counter', -7, 3.5, 3, 0.8, 1], ['lift', 3, -1, 4.5, 6, 1], ['shelf', 8.6, 0, 0.8, 10, 1, { tires: true }], ['steel', -6, -5.5, 5, 1.2, 1]],
      hs: [['servis_pult', 'Pult servisu', -7, 5.3]],
      lots: [['yard', 0, 21, 32, 28]], paths: [] },

    // ---- juh: pošta, pohotovosť, zámočník, veterinár (za mostom) ----
    { id: 'posta', name: 'Pošta a banka', label: 'POŠTA', x: 250, z: 338, w: 18, d: 12, rotY: 0, floors: 2, color: '#4e5c6d', kind: 'office', floor: 'tile2',
      doors: [{ side: 'N', at: 0 }],
      interior: [['counter', 0, 3, 14, 1, 1, { post: true }], ['bench', -5, -3.5, 3, 0.6, 1], ['bench', 5, -3.5, 3, 0.6, 1], ['cabinet', 7.5, -5.3, 1.2, 0.8, 1, { atm: true }]],
      hs: [['posta', 'Priehradka', 0, 0.8]],
      lots: [['parking', 0, -20, 26, 28]], paths: [] },

    { id: 'pohotovost', name: 'Pohotovosť a lekáreň', label: 'POHOTOVOSŤ', x: 420, z: 340, w: 24, d: 14, rotY: 0, floors: 2, color: '#e8e4dc', kind: 'office', floor: 'lino',
      doors: [{ side: 'N', at: -4 }, { side: 'N', at: 6 }],
      interior: [['counter', 6, -3.5, 6, 0.8, 1], ['shelf', 6, 6.3, 8, 0.8, 1], ['bench', -7, -2, 3, 0.6, 1], ['bench', -7, 0.5, 3, 0.6, 1], ['bed', -8, 5.5, 2, 2.4, 1], ['desk', -2, 5.5, 2, 1, 1]],
      hs: [['lekaren', 'Lekáreň', 6, -1.5]],
      lots: [['parking', 0, -24, 32, 34]], paths: [] },

    { id: 'zamocnik', name: 'Zámočníctvo', label: 'ZÁMOČNÍK', x: 546, z: 342, w: 10, d: 8, rotY: 0, floors: 1, color: '#8d7a6a', kind: 'shop', floor: 'concrete',
      doors: [{ side: 'W', at: 0 }],
      interior: [['counter', -1, -2.6, 5, 0.8, 1], ['shelf', 4.6, 0, 0.8, 6, 1], ['steel', 1, 2.8, 4, 1.2, 1]],
      hs: [['zamocnik', 'Zámočník', -1, -0.8]],
      lots: [['pad', -16, 0, 22, 14]], paths: [] },

    { id: 'veterinar', name: 'Veterinár', label: 'VETERINÁR', x: 368, z: 428, w: 12, d: 10, rotY: 0, floors: 1, color: '#9fc4a8', kind: 'shop', floor: 'tile',
      doors: [{ side: 'W', at: 0 }],
      interior: [['counter', -3, 2.6, 4, 0.8, 1], ['steel', 2.5, -1, 2, 1, 1], ['bench', 3.5, 3.6, 3, 0.6, 1], ['shelf', -5.6, -1, 0.8, 5, 1]],
      hs: [['vet', 'Veterinár', 0, 0]],
      lots: [['pad', -15, 0, 18, 14]], paths: [] },

    // ---- východ: ex, Katka ----
    { id: 'ex', name: 'Byt Simony (ex)', label: 'PANELÁK', x: 585, z: 170, w: 30, d: 12, rotY: 0, floors: 4, color: '#b8b4ac', kind: 'flat', floor: 'tile2',
      doors: [{ side: 'N', at: 0 }],
      interior: [['bench', -12, 3, 2, 0.5, 1], ['cabinet', -13.5, -4.5, 2, 0.6, 1, { mail: true }]],
      hs: [['ex_dvere', 'Dvere ex', 0, -8.5]],
      lots: [['parking', 0, -22, 36, 32]], paths: [] },

    { id: 'nina', name: 'Byt Katke', label: 'KATKA', x: 585, z: 265, w: 16, d: 12, rotY: 0, floors: 3, color: '#d2b8a0', kind: 'flat', floor: 'wood',
      doors: [{ side: 'S', at: 0 }],
      interior: [['bench', 6, -4, 2, 0.5, 1], ['cabinet', -4, -5, 2, 0.6, 1, { mail: true }]],
      hs: [['nina_dvere', 'Dvere Katke', 0, 8.5]],
      lots: [['parking', 0, 20, 22, 28]], paths: [] },

    // ---- juhovýchod: krčma U Hájka, byt Doda ----
    { id: 'krcma', name: 'Reštaurácia U Hájka', label: 'KRČMA', x: 595, z: 342, w: 24, d: 14, rotY: 0, floors: 1, color: '#a8643a', kind: 'shop', floor: 'wood',
      doors: [{ side: 'N', at: -6 }, { side: 'N', at: 6 }],
      interior: [
        ['table', -8, -2, 1.6, 1.2, 1], ['table', -3, -2, 1.6, 1.2, 1], ['table', 2, -2, 1.6, 1.2, 1],
        ['table', -8, 3, 1.6, 1.2, 1], ['table', -3, 3, 1.6, 1.2, 1], ['table', 2, 3, 1.6, 1.2, 1],
        ['counter', 9, 0, 1, 9, 1, { coffee: true }], ['shelf', 11.4, 0, 0.8, 8, 1], ['bench', -10.8, 0.5, 0.6, 8, 1],
        ['rug', -3, 0.5, 14, 8.5, 0, { c: '#7a3b2a' }],
      ],
      hs: [['krcma_stol', 'Stôl U Hájka', -3, 0.6], ['krcma_bar', 'Bar', 7, 0]],
      lots: [['parking', 0, -19, 30, 22]], paths: [] },

    { id: 'riso', name: 'Byt Doda', label: 'DODO', x: 492, z: 350, w: 14, d: 10, rotY: 0, floors: 1, color: '#8fa0b4', kind: 'flat', floor: 'wood',
      doors: [{ side: 'S', at: 3 }],
      interior: [
        ['sofa', -3.5, -3.6, 3, 1.1, 1], ['table', -3.5, -1.2, 1.8, 1, 1], ['rug', -3.5, -1.5, 5, 3.4, 0, { c: '#4d5e75' }],
        ['bed', 5, -3, 2, 2.4, 1], ['cabinet', 0.5, -4.5, 2.4, 0.7, 1], ['counter', 4.5, 3.9, 4.6, 0.7, 1, { sink: true, hob: true }],
        ['fridge', 6.3, 1.8, 1, 1, 1], ['shoes', 1.5, 4.2, 1.2, 0.5, 1],
      ],
      hs: [['riso_dvere', 'Dvere Doda', 3, 6.2], ['riso_pivo', 'Dodov stôl s pivom', -3.5, 1.2], ['riso_gauc', 'Dodov gauč', -3.5, -2.6]],
      lots: [['pad', 3, 11.5, 14, 13]], paths: [] },
  ];

  // dekoračné budovy bez interiéru (strechy v 2D, pre auto/chôdzu pevné): [x, z, w, d, poschodia, farba]
  const FILLERS = [
    // sever (medzi diaľnicou a Hlavnou)
    [22, 72, 20, 14, 2, '#c8b89a'], [96, 54, 18, 12, 2, '#b9a98c'], [160, 60, 22, 14, 3, '#cfc2a6'], [162, 100, 20, 14, 2, '#a89c88'],
    [200, 48, 16, 12, 2, '#bfae92'], [296, 60, 20, 14, 3, '#d0c3a8'], [296, 86, 18, 10, 2, '#c0b29c'],
    [362, 60, 24, 16, 3, '#b4a68e'], [420, 52, 20, 14, 2, '#cdbfa3'], [362, 100, 20, 14, 2, '#a99f8e'], [482, 70, 22, 14, 3, '#c3b59b'], [430, 100, 16, 12, 2, '#b8ac95'],
    [600, 82, 22, 14, 2, '#cbbd9f'], [612, 108, 20, 12, 2, '#bdb09a'],
    // západ
    [40, 156, 24, 14, 3, '#c5b79c'], [100, 200, 16, 12, 2, '#aea38f'], [100, 270, 18, 12, 2, '#c9bba0'],
    [152, 154, 16, 12, 2, '#b6aa94'], [200, 150, 20, 12, 2, '#cdbfa5'], [240, 160, 18, 12, 2, '#b0b4b8'],
    [160, 284, 16, 10, 1, '#b7bbbf'], [225, 284, 16, 10, 1, '#c6b9a0'], [282, 210, 20, 14, 3, '#bcae96'],
    // centrum
    [350, 240, 18, 14, 3, '#b3a690'], [380, 215, 16, 12, 2, '#a7a498'], [342, 262, 10, 10, 2, '#b5ab98'],
    [490, 190, 18, 14, 3, '#8f949a'], [470, 275, 16, 12, 2, '#c3b69d'], [497, 275, 14, 12, 2, '#cabca2'],
    // východ
    [620, 200, 18, 14, 3, '#b2a894'], [560, 195, 20, 14, 3, '#c8b89a'], [620, 250, 16, 12, 2, '#b9a98c'], [548, 270, 16, 12, 2, '#cfc2a6'],
    // juh
    [150, 326, 20, 14, 2, '#a89c88'], [200, 352, 18, 10, 1, '#b5ab98'], [300, 330, 22, 14, 3, '#bfae92'], [300, 352, 18, 10, 2, '#d0c3a8'],
    [470, 335, 22, 14, 3, '#c0b29c'],
    [40, 330, 22, 14, 2, '#c3b59b'], [90, 342, 16, 12, 2, '#b8ac95'],
    // zahustenie
    [116, 108, 16, 12, 2, '#c9bba0'], [196, 98, 16, 12, 2, '#b6aa94'], [400, 80, 18, 12, 2, '#cdbfa5'], [456, 44, 14, 10, 2, '#b0b4b8'],
    [560, 110, 18, 12, 2, '#b7bbbf'], [625, 60, 14, 12, 2, '#c6b9a0'], [620, 160, 16, 12, 2, '#bcae96'], [575, 222, 18, 12, 2, '#b3a690'],
    [78, 162, 14, 12, 2, '#a7a498'], [100, 240, 14, 12, 2, '#b5ab98'], [50, 352, 18, 10, 1, '#8f949a'], [108, 328, 14, 12, 2, '#c3b69d'],
    [250, 354, 18, 8, 1, '#cabca2'], [395, 352, 14, 10, 1, '#b2a894'], [500, 215, 14, 12, 2, '#c8b89a'],
  ].map((a, i) => ({ id: 'f' + i, x: a[0], z: a[1], w: a[2], d: a[3], floors: a[4], color: a[5], rotY: 0, kind: 'filler' }));

  // ============================================================
  //  GEOMETRIA
  // ============================================================
  function catmull(ctrl, closed, step) {
    const n = ctrl.length, out = [];
    const Pt = (i) => closed ? ctrl[((i % n) + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = Pt(i - 1), p1 = Pt(i), p2 = Pt(i + 1), p3 = Pt(i + 2);
      const len = hyp(p2.x - p1.x, p2.z - p1.z), k = Math.max(2, Math.ceil(len / step));
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        });
      }
    }
    if (!closed) out.push({ x: ctrl[n - 1].x, z: ctrl[n - 1].z });
    return out;
  }
  M.catmull = catmull;

  function segDist2(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + dx * t, qz = az + dz * t;
    return { d2: (px - qx) * (px - qx) + (pz - qz) * (pz - qz), t, x: qx, z: qz };
  }
  function segX(a, b, c, d) {
    const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return null;
    const qx = c.x - a.x, qz = c.z - a.z, t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, x: a.x + rx * t, z: a.z + rz * t };
  }
  function toWorld(loc, lx, lz) {
    const c = Math.cos(loc.rotY || 0), s = Math.sin(loc.rotY || 0);
    return { x: loc.x + c * lx - s * lz, z: loc.z + s * lx + c * lz };
  }
  function toLocal(loc, x, z) {
    const c = Math.cos(loc.rotY || 0), s = Math.sin(loc.rotY || 0), dx = x - loc.x, dz = z - loc.z;
    return { x: c * dx + s * dz, z: -s * dx + c * dz };
  }
  M.toWorld = toWorld; M.toLocal = toLocal;
  function rectCorners(r) {
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0), hw = r.w / 2, hd = r.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => ({ x: r.x + c * p[0] - s * p[1], z: r.z + s * p[0] + c * p[1] }));
  }
  M.rectCorners = rectCorners;
  function inRect(x, z, r, m) {
    m = m || 0;
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0), dx = x - r.x, dz = z - r.z;
    const lx = c * dx + s * dz, lz = -s * dx + c * dz;
    return Math.abs(lx) <= r.w / 2 + m && Math.abs(lz) <= r.d / 2 + m;
  }
  M.inRect = inRect;

  // kolízie kruh × (otočený) obdĺžnik
  function hitRect(x, z, r, Rc) {
    const dx = x - Rc.x, dz = z - Rc.z;
    const rb = Rc.rb || (Rc.rb = hyp(Rc.w, Rc.d) / 2);
    if (dx * dx + dz * dz > (rb + r) * (rb + r)) return null;
    const c = Math.cos(Rc.rot || 0), s = Math.sin(Rc.rot || 0);
    const lx = c * dx + s * dz, lz = -s * dx + c * dz, hw = Rc.w / 2, hd = Rc.d / 2;
    const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hd, hd), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) return null;
    let nx, nz, pen;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
    else {
      const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
      if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; pen = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = pz + r; }
    }
    return { nx: c * nx - s * nz, nz: s * nx + c * nz, pen, rect: Rc };
  }
  M.resolve = function (x, z, r, rects) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let any = false;
      for (let i = 0; i < rects.length; i++) {
        const h = hitRect(x, z, r, rects[i]);
        if (h) { x += h.nx * (h.pen + 0.01); z += h.nz * (h.pen + 0.01); any = hit = true; }
      }
      if (!any) break;
    }
    return { x, z, hit };
  };
  M.circleHits = function (x, z, r, rects) {
    for (let i = 0; i < rects.length; i++) if (hitRect(x, z, r, rects[i])) return rects[i];
    return null;
  };
  M.hitRect = hitRect;

  // ---------- raster masky (1 px = 1 m) ----------
  let paved = null, water = null;
  function rCapsule(mask, ax, az, bx, bz, hw, val) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - hw)), z1 = Math.min(H - 1, Math.ceil(Math.max(az, bz) + hw));
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, hw2 = hw * hw;
    for (let pz = z0; pz <= z1; pz++) {
      const cz = pz + 0.5;
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5;
        let t = l2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = cx - (ax + dx * t), ez = cz - (az + dz * t);
        if (ex * ex + ez * ez <= hw2) mask[pz * W + px] = val;
      }
    }
  }
  function rPoly(mask, pts, hw, val, closed) {
    for (let i = 0; i + 1 < pts.length; i++) rCapsule(mask, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, hw, val);
    if (closed && pts.length > 2) rCapsule(mask, pts[pts.length - 1].x, pts[pts.length - 1].z, pts[0].x, pts[0].z, hw, val);
  }
  function rRect(mask, r, val, margin) {
    margin = margin || 0;
    const cs = rectCorners({ x: r.x, z: r.z, w: r.w + 2 * margin, d: r.d + 2 * margin, rot: r.rot });
    const x0 = Math.max(0, Math.floor(Math.min(...cs.map((p) => p.x)))), x1 = Math.min(W - 1, Math.ceil(Math.max(...cs.map((p) => p.x))));
    const z0 = Math.max(0, Math.floor(Math.min(...cs.map((p) => p.z)))), z1 = Math.min(H - 1, Math.ceil(Math.max(...cs.map((p) => p.z))));
    const rr2 = { x: r.x, z: r.z, w: r.w + 2 * margin, d: r.d + 2 * margin, rot: r.rot };
    for (let pz = z0; pz <= z1; pz++) for (let px = x0; px <= x1; px++) if (inRect(px + 0.5, pz + 0.5, rr2)) mask[pz * W + px] = val;
  }
  function rEllipse(mask, cx, cz, rx, rz, val) {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx)), z0 = Math.max(0, Math.floor(cz - rz)), z1 = Math.min(H - 1, Math.ceil(cz + rz));
    for (let pz = z0; pz <= z1; pz++) for (let px = x0; px <= x1; px++) {
      const ex = (px + 0.5 - cx) / rx, ez = (pz + 0.5 - cz) / rz;
      if (ex * ex + ez * ez <= 1) mask[pz * W + px] = val;
    }
  }
  const maskAt = (mask, x, z) => {
    const px = x | 0, pz = z | 0;
    if (px < 0 || pz < 0 || px >= W || pz >= H) return false;
    return mask[pz * W + px] > 0;
  };
  M.isPaved = (x, z) => !!paved && maskAt(paved, x, z);
  M.isWater = (x, z) => !!water && maskAt(water, x, z) && !maskAt(paved, x, z);
  M.isRoad = (x, z) => !!paved && paved[(z | 0) * W + (x | 0)] === 2;

  // ---------- priestorová mriežka segmentov ciest ----------
  const CELL = 50, GCX = Math.ceil(W / CELL), GCZ = Math.ceil(H / CELL);
  let segGrid = null;
  function buildSegGrid(roads) {
    segGrid = new Array(GCX * GCZ);
    roads.forEach((rd) => {
      const n = rd.pts.length, segs = rd.loop ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = rd.pts[i], b = rd.pts[(i + 1) % n];
        const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
        const z0 = Math.floor(Math.min(a.z, b.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z) / CELL);
        for (let gz = Math.max(0, z0); gz <= Math.min(GCZ - 1, z1); gz++) for (let gx = Math.max(0, x0); gx <= Math.min(GCX - 1, x1); gx++) {
          const k = gz * GCX + gx; (segGrid[k] || (segGrid[k] = [])).push({ rd, i, a, b });
        }
      }
    });
  }
  M.nearestRoad = function (x, z, maxDist) {
    maxDist = maxDist || 60;
    const rings = Math.ceil(maxDist / CELL), gx0 = Math.floor(x / CELL), gz0 = Math.floor(z / CELL);
    let best = null;
    for (let ring = 0; ring <= rings; ring++) {
      for (let gz = gz0 - ring; gz <= gz0 + ring; gz++) for (let gx = gx0 - ring; gx <= gx0 + ring; gx++) {
        if (Math.max(Math.abs(gz - gz0), Math.abs(gx - gx0)) !== ring) continue;
        if (gx < 0 || gz < 0 || gx >= GCX || gz >= GCZ) continue;
        const cell = segGrid[gz * GCX + gx]; if (!cell) continue;
        for (const s of cell) {
          const q = segDist2(x, z, s.a.x, s.a.z, s.b.x, s.b.z);
          if (!best || q.d2 < best.d2) best = { d2: q.d2, seg: s, t: q.t, px: q.x, pz: q.z };
        }
      }
      if (best && Math.sqrt(best.d2) < ring * CELL) break;
    }
    if (!best || best.d2 > maxDist * maxDist) return null;
    const s = best.seg, l = hyp(s.b.x - s.a.x, s.b.z - s.a.z) || 1;
    return { road: s.rd, dist: Math.sqrt(best.d2), x: best.px, z: best.pz, dx: (s.b.x - s.a.x) / l, dz: (s.b.z - s.a.z) / l, i: s.i };
  };
  M.roadDir = function (x, z) {
    const n = M.nearestRoad(x, z, 40);
    if (!n || n.dist > n.road.w / 2 + 6) return null;
    return { dx: n.dx, dz: n.dz, dist: n.dist, road: n.road.id, x: n.x, z: n.z };
  };

  // ---------- offset polyline (pruhy) ----------
  function offsetPoly(pts, off, closed) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
      out.push({ x: p.x - dz * off, z: p.z + dx * off }); // pravá strana = (-dz, dx)
    }
    return out;
  }
  function thin(pts, step, closed) {
    const out = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      if (acc >= step || (!closed && i === pts.length - 1)) { out.push(pts[i]); acc = 0; }
    }
    return out;
  }

  // ============================================================
  //  BUILD
  // ============================================================
  M.roads = ROADS; M.river = RIVER; M.fields = FIELDS; M.fillers = FILLERS;
  M.locs = {}; M.locList = []; M.hs = {}; M.lots = []; M.paths = []; M.graph = null; M.trafficLanes = [];
  M.solidsWalk = []; M.solidsCar = []; M.trees = []; M.lamps = []; M.intersections = [];
  M.groundCanvas = null; M.miniCanvas = null; M.blocked = [];
  let built = false;

  M.build = function (opt) {
    opt = opt || {};
    M.seed(20251021);
    // 1. cesty
    ROADS.forEach((rd) => { rd.pts = catmull(rd.ctrl, !!rd.loop, 3); rd.len = polyLen(rd.pts, rd.loop); });
    RIVER.pts = catmull(RIVER.ctrl, false, 4);
    buildSegGrid(ROADS);
    // 2. lokácie
    M.locList = LOCS.map(prepLoc);
    M.locs = {}; M.locList.forEach((l) => { M.locs[l.id] = l; });
    M.hs.hasiak = { id: 'hasiak', name: 'Hasiak (v aute)', x: 0, z: 0, r: M.HS_R, loc: null, dynamic: true };
    // 3. masky
    paved = new Uint8Array(W * H); water = new Uint8Array(W * H);
    M.lots.forEach((lt) => rRect(paved, lt, 1));
    M.paths.forEach((p) => rPoly(paved, p.pts, p.w / 2, 1, false));
    ROADS.forEach((rd) => rPoly(paved, rd.pts, rd.w / 2 + (rd.kind === 'hwy' ? 1 : M.SIDEWALK), 1, rd.loop));
    ROADS.forEach((rd) => rPoly(paved, rd.pts, rd.w / 2, 2, rd.loop));
    rPoly(water, RIVER.pts, RIVER.w / 2, 1, false);
    const park = M.locs.park;
    park.interior.filter((f) => f.type === 'pond').forEach((f) => rEllipse(water, f.x, f.z, f.w / 2, f.d / 2, 1));
    M.pavedMask = paved; M.waterMask = water;
    // 4. pevné prekážky
    buildSolids();
    // 5. graf + pruhy
    buildGraph();
    M.trafficLanes = [];
    ROADS.forEach((rd) => {
      const p = thin(rd.pts, 6, rd.loop), off = rd.w / 4;
      M.trafficLanes.push({ pts: offsetPoly(p, off, rd.loop), loop: !!rd.loop, road: rd.id, kind: rd.kind, w: rd.w });
      const rev = p.slice().reverse();
      M.trafficLanes.push({ pts: offsetPoly(rev, off, rd.loop), loop: !!rd.loop, road: rd.id, kind: rd.kind, w: rd.w });
    });
    // 6. stromy a lampy
    buildTreesLamps();
    // 7. plátna
    if (!opt.noCanvas && typeof document !== 'undefined') {
      try { M.groundCanvas = drawGround(); } catch (e) { console.warn('Map.groundCanvas zlyhal', e); }
      try { M.miniCanvas = drawMini(); } catch (e) { console.warn('Map.miniCanvas zlyhal', e); }
    }
    built = true;
    return M;
  };
  M.isBuilt = () => built;

  function polyLen(pts, loop) {
    let L = 0; for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (loop) L += hyp(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    return L;
  }

  function prepLoc(src) {
    const loc = Object.assign({}, src);
    loc.rot = loc.rotY || 0;
    loc.corners = rectCorners(loc);
    const xs = loc.corners.map((p) => p.x), zs = loc.corners.map((p) => p.z);
    loc.bbox = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    loc.interior = (src.interior || []).map((a) => {
      const it = Object.assign({ type: a[0], lx: a[1], lz: a[2], w: a[3], d: a[4], solid: !!a[5], rot: loc.rot, loc: loc.id }, a[6] || {});
      const wp = toWorld(loc, it.lx, it.lz); it.x = wp.x; it.z = wp.z;
      return it;
    });
    loc.hs = (src.hs || []).map((a) => {
      const wp = toWorld(loc, a[2], a[3]);
      const h = { id: a[0], name: a[1], x: wp.x, z: wp.z, r: M.HS_R, loc: loc.id, lx: a[2], lz: a[3] };
      M.hs[h.id] = h; return h;
    });
    loc.doorList = (src.doors || []).map((d) => doorInfo(loc, d));
    (src.lots || []).forEach((a, i) => {
      const wp = toWorld(loc, a[1], a[2]);
      M.lots.push({ id: loc.id + '_lot' + i, loc: loc.id, kind: a[0], x: wp.x, z: wp.z, w: a[3], d: a[4], rot: loc.rot, lx: a[1], lz: a[2] });
    });
    (src.paths || []).forEach((a) => {
      const w = a[a.length - 1], pts = a.slice(0, -1).map((p) => toWorld(loc, p[0], p[1]));
      M.paths.push({ loc: loc.id, pts, w, kind: loc.kind === 'park' ? 'gravel' : 'pavers' });
    });
    if (src.canopy) { const wp = toWorld(loc, src.canopy.lx, src.canopy.lz); loc.canopy = { x: wp.x, z: wp.z, w: src.canopy.w, d: src.canopy.d, rot: loc.rot, h: 5 }; }
    return loc;
  }
  function doorInfo(loc, d) {
    const hw = loc.w / 2, hd = loc.d / 2;
    let lx = 0, lz = 0, nx = 0, nz = 0;
    if (d.side === 'N') { lx = d.at; lz = -hd; nz = -1; } else if (d.side === 'S') { lx = d.at; lz = hd; nz = 1; }
    else if (d.side === 'E') { lx = hw; lz = d.at; nx = 1; } else { lx = -hw; lz = d.at; nx = -1; }
    const p = toWorld(loc, lx, lz), pin = toWorld(loc, lx - nx * 1.6, lz - nz * 1.6), pout = toWorld(loc, lx + nx * 2.2, lz + nz * 2.2);
    const nw = toWorld(loc, nx, nz);
    return { side: d.side, at: d.at, lx, lz, x: p.x, z: p.z, inX: pin.x, inZ: pin.z, outX: pout.x, outZ: pout.z, nx: nw.x - loc.x, nz: nw.z - loc.z };
  }
  M.doorPts = (loc) => (typeof loc === 'string' ? M.locs[loc] : loc).doorList.slice();
  M.locAt = function (x, z, margin) {
    for (const l of M.locList) if (l.kind !== 'park' && inRect(x, z, l, margin || 0)) return l;
    return null;
  };
  M.areaAt = function (x, z, margin) {
    for (const l of M.locList) if (inRect(x, z, l, margin || 0)) return l;
    return null;
  };
  M.hsAt = function (x, z) {
    let best = null, bd = 1e9;
    for (const k in M.hs) { const h = M.hs[k]; if (h.dynamic) continue; const d = hyp(h.x - x, h.z - z); if (d <= h.r && d < bd) { bd = d; best = h; } }
    return best;
  };
  M.streetNameAt = function (x, z) {
    const a = M.areaAt(x, z, 6);
    if (a) return a.name;
    const n = M.nearestRoad(x, z, 120);
    if (M.isWater(x, z) && !(n && n.dist < n.road.w / 2 + 3)) return 'Dunaj';
    if (n && n.dist < 45) return n.road.name;
    const near = M.locList.slice().sort((p, q) => hyp(p.x - x, p.z - z) - hyp(q.x - x, q.z - z))[0];
    if (near && hyp(near.x - x, near.z - z) < 60) return 'pri: ' + near.name;
    return n ? n.road.name : 'Polia';
  };

  // ---------- pevné prekážky ----------
  function wallRects(loc) {
    const out = [], T = M.WALL_T, hw = loc.w / 2, hd = loc.d / 2, DW = M.DOOR_W / 2;
    const sides = { N: [], S: [], E: [], W: [] };
    loc.doorList.forEach((d) => sides[d.side].push(d.at));
    const pieces = (len, gaps) => {
      const segs = []; let a = -len / 2;
      gaps.slice().sort((p, q) => p - q).forEach((g) => { if (g - DW > a) segs.push([a, g - DW]); a = g + DW; });
      if (a < len / 2) segs.push([a, len / 2]);
      return segs;
    };
    const add = (lx, lz, w, d) => { const p = toWorld(loc, lx, lz); out.push({ x: p.x, z: p.z, w, d, rot: loc.rot, kind: 'wall', loc: loc.id }); };
    pieces(loc.w, sides.N).forEach((s) => add((s[0] + s[1]) / 2, -hd + T / 2, s[1] - s[0], T));
    pieces(loc.w, sides.S).forEach((s) => add((s[0] + s[1]) / 2, hd - T / 2, s[1] - s[0], T));
    pieces(loc.d, sides.E).forEach((s) => add(hw - T / 2, (s[0] + s[1]) / 2, T, s[1] - s[0]));
    pieces(loc.d, sides.W).forEach((s) => add(-hw + T / 2, (s[0] + s[1]) / 2, T, s[1] - s[0]));
    return out;
  }
  function buildSolids() {
    const walk = [], car = [];
    M.locList.forEach((loc) => {
      if (loc.kind === 'park') {
        loc.interior.filter((f) => f.type === 'fence').forEach((f) => {
          const T = 0.2, hw = f.w / 2, hd = f.d / 2;
          walk.push({ x: f.x, z: f.z - hd, w: f.w, d: T, rot: 0, kind: 'fence' }, { x: f.x, z: f.z + hd, w: f.w, d: T, rot: 0, kind: 'fence' });
          walk.push({ x: f.x + hw, z: f.z, w: T, d: f.d, rot: 0, kind: 'fence' });
          walk.push({ x: f.x - hw, z: f.z - (hd + 1) / 2, w: T, d: hd - 1, rot: 0, kind: 'fence' }, { x: f.x - hw, z: f.z + (hd + 1) / 2, w: T, d: hd - 1, rot: 0, kind: 'fence' });
        });
        return;
      }
      wallRects(loc).forEach((r) => walk.push(r));
      car.push({ x: loc.x, z: loc.z, w: loc.w, d: loc.d, rot: loc.rot, kind: 'building', loc: loc.id });
      loc.interior.forEach((f) => {
        if (!f.solid) return;
        const r = { x: f.x, z: f.z, w: f.w, d: f.d, rot: f.rot, kind: f.type, loc: loc.id };
        walk.push(r);
        if (f.type === 'pump' || f.type === 'pillar' || f.type === 'ramp') car.push(r);
      });
    });
    FILLERS.forEach((f) => {
      const r = { x: f.x, z: f.z, w: f.w, d: f.d, rot: 0, kind: 'filler', loc: f.id };
      walk.push(r); car.push(r);
    });
    M.solidsWalk = walk; M.solidsCar = car;
  }
  // dynamická prekážka (uzavretý úsek): {x,z,w,d,rot,id}
  M.block = function (id, rect) {
    M.unblock(id);
    const r = Object.assign({ rot: 0, kind: 'block', id }, rect);
    M.blocked.push(r); M.solidsCar.push(r); M.solidsWalk.push(r);
    if (M.graph) M.graph.edges.forEach((e) => { if (!e.blocked && inRect((e.ax + e.bx) / 2, (e.az + e.bz) / 2, r, 4)) { e.blocked = id; } });
    return r;
  };
  M.unblock = function (id) {
    M.blocked = M.blocked.filter((b) => b.id !== id);
    M.solidsCar = M.solidsCar.filter((b) => b.id !== id); M.solidsWalk = M.solidsWalk.filter((b) => b.id !== id);
    if (M.graph) M.graph.edges.forEach((e) => { if (e.blocked === id) e.blocked = null; });
  };

  // ---------- graf ----------
  function buildGraph() {
    const nodes = [], edges = [], adj = [];
    const addNode = (x, z, rd) => { nodes.push({ id: nodes.length, x, z, road: rd.id, kind: rd.kind, w: rd.w }); adj.push([]); return nodes.length - 1; };
    // marks na každej ceste: { s, x, z, fixed }
    const marks = ROADS.map(() => []);
    const cum = ROADS.map((rd) => {
      const s = [0]; for (let i = 1; i < rd.pts.length; i++) s.push(s[i - 1] + hyp(rd.pts[i].x - rd.pts[i - 1].x, rd.pts[i].z - rd.pts[i - 1].z));
      if (rd.loop) s.push(s[s.length - 1] + hyp(rd.pts[0].x - rd.pts[rd.pts.length - 1].x, rd.pts[0].z - rd.pts[rd.pts.length - 1].z));
      return s;
    });
    const segOf = (rd, i) => [rd.pts[i], rd.pts[(i + 1) % rd.pts.length]];
    const nseg = (rd) => rd.loop ? rd.pts.length : rd.pts.length - 1;
    // križovatky
    for (let a = 0; a < ROADS.length; a++) for (let b = a + 1; b < ROADS.length; b++) {
      const A = ROADS[a], B = ROADS[b];
      for (let i = 0; i < nseg(A); i++) {
        const [a0, a1] = segOf(A, i);
        for (let j = 0; j < nseg(B); j++) {
          const [b0, b1] = segOf(B, j);
          const X = segX(a0, a1, b0, b1);
          if (!X) continue;
          marks[a].push({ s: cum[a][i] + X.t * (cum[a][i + 1] - cum[a][i]), x: X.x, z: X.z, fixed: true });
          marks[b].push({ s: cum[b][j] + X.u * (cum[b][j + 1] - cum[b][j]), x: X.x, z: X.z, fixed: true });
        }
      }
    }
    // T-napojenia koncov
    ROADS.forEach((rd, a) => {
      if (rd.loop) return;
      [0, rd.pts.length - 1].forEach((ei) => {
        const p = rd.pts[ei];
        let best = null;
        ROADS.forEach((o, b) => {
          if (b === a) return;
          for (let j = 0; j < nseg(o); j++) {
            const [q0, q1] = segOf(o, j), q = segDist2(p.x, p.z, q0.x, q0.z, q1.x, q1.z);
            if (q.d2 <= (o.w / 2 + 8) * (o.w / 2 + 8) && (!best || q.d2 < best.d2)) best = { d2: q.d2, b, j, q };
          }
        });
        if (best) {
          const o = ROADS[best.b];
          marks[best.b].push({ s: cum[best.b][best.j] + best.q.t * (cum[best.b][best.j + 1] - cum[best.b][best.j]), x: best.q.x, z: best.q.z, fixed: true });
          marks[a].push({ s: cum[a][ei === 0 ? 0 : rd.pts.length - 1], x: best.q.x, z: best.q.z, fixed: true, end: true });
        } else marks[a].push({ s: cum[a][ei === 0 ? 0 : rd.pts.length - 1], x: p.x, z: p.z, fixed: true, end: true });
      });
    });
    // pravidelné uzly
    const roadNodes = [];
    ROADS.forEach((rd, a) => {
      const L = cum[a][cum[a].length - 1], n = Math.max(1, Math.round(L / M.NODE_STEP)), ds = L / n;
      for (let k = rd.loop ? 0 : 1; k < n; k++) {
        const s = k * ds, p = pointAt(rd, cum[a], s);
        marks[a].push({ s, x: p.x, z: p.z, fixed: false });
      }
      const ms = marks[a].sort((p, q) => p.s - q.s);
      const kept = [];
      ms.forEach((m) => {
        if (m.fixed) { kept.push(m); return; }
        if (ms.some((o) => o.fixed && Math.abs(o.s - m.s) < 7)) return;
        kept.push(m);
      });
      // duplicitné fixed blízko seba zlúčiť
      const fin = [];
      kept.forEach((m) => { if (!fin.length || Math.abs(fin[fin.length - 1].s - m.s) > 1.5 || m.end) fin.push(m); });
      fin.forEach((m) => { m.node = addNode(m.x, m.z, rd); });
      roadNodes.push(fin);
    });
    // zlúčiť uzly bližšie než 5 m
    const parent = nodes.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const grid = new Map();
    nodes.forEach((n) => { const k = ((n.x / 10) | 0) + ',' + ((n.z / 10) | 0); (grid.get(k) || grid.set(k, []).get(k)).push(n.id); });
    nodes.forEach((n) => {
      const gx = (n.x / 10) | 0, gz = (n.z / 10) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cell = grid.get((gx + dx) + ',' + (gz + dz)); if (!cell) continue;
        cell.forEach((j) => { if (j > n.id && hyp(nodes[j].x - n.x, nodes[j].z - n.z) < 5) parent[find(j)] = find(n.id); });
      }
    });
    const rep = nodes.map((_, i) => find(i));
    const addEdge = (i, j, rd, len) => {
      i = rep[i]; j = rep[j]; if (i === j) return;
      if (adj[i].some((e) => e.to === j)) return;
      const e = { a: i, b: j, len, road: rd.id, kind: rd.kind, w: rd.w, ax: nodes[i].x, az: nodes[i].z, bx: nodes[j].x, bz: nodes[j].z, blocked: null };
      edges.push(e); adj[i].push({ to: j, e }); adj[j].push({ to: i, e });
    };
    ROADS.forEach((rd, a) => {
      const fin = roadNodes[a];
      for (let k = 0; k + 1 < fin.length; k++) addEdge(fin[k].node, fin[k + 1].node, rd, Math.max(0.5, fin[k + 1].s - fin[k].s));
      if (rd.loop && fin.length > 2) addEdge(fin[fin.length - 1].node, fin[0].node, rd, Math.max(0.5, cum[a][cum[a].length - 1] - fin[fin.length - 1].s + fin[0].s));
    });
    nodes.forEach((n, i) => { n.rep = rep[i]; n.deg = adj[rep[i]].length; });
    M.graph = { nodes, edges, adj, rep };
    // križovatky (stupeň >= 3)
    M.intersections = [];
    nodes.forEach((n, i) => {
      if (rep[i] !== i || adj[i].length < 3) return;
      const arms = adj[i].map((e) => {
        const o = nodes[e.to]; let dx = o.x - n.x, dz = o.z - n.z; const l = hyp(dx, dz) || 1;
        return { dx: dx / l, dz: dz / l, w: e.e.w, kind: e.e.kind, road: e.e.road };
      });
      M.intersections.push({ x: n.x, z: n.z, node: i, arms, maxW: Math.max(...arms.map((a) => a.w)), hwy: arms.some((a) => a.kind === 'hwy') });
    });
  }
  function pointAt(rd, cum, s) {
    const n = rd.pts.length;
    let i = 0; while (i + 1 < cum.length - 1 && cum[i + 1] < s) i++;
    const a = rd.pts[i % n], b = rd.pts[(i + 1) % n], l = cum[i + 1] - cum[i] || 1, t = clamp((s - cum[i]) / l, 0, 1);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  M.nearestNode = function (x, z, carOnly) {
    const nodes = M.graph.nodes, rep = M.graph.rep; let best = -1, bd = 1e18;
    for (let i = 0; i < nodes.length; i++) {
      if (rep[i] !== i) continue;
      if (carOnly && nodes[i].deg === 0) continue;
      const d = (nodes[i].x - x) * (nodes[i].x - x) + (nodes[i].z - z) * (nodes[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // binárna halda
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
  Heap.prototype.pop = function () { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; };
  M.route = function (ax, az, bx, bz, opt) {
    opt = opt || {};
    const g = M.graph; if (!g) return [{ x: ax, z: az }, { x: bx, z: bz }];
    const s = M.nearestNode(ax, az), t = M.nearestNode(bx, bz);
    const start = { x: ax, z: az }, end = { x: bx, z: bz };
    if (s < 0 || t < 0 || s === t) return [start, end];
    const N = g.nodes, open = new Heap(), gs = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1), closed = new Uint8Array(N.length);
    const hf = (i) => hyp(N[i].x - N[t].x, N[i].z - N[t].z) * 0.7;
    const kf = opt.pedestrian ? { hwy: 1.6, main: 1, city: 1 } : { hwy: 0.7, main: 0.85, city: 1 };
    gs[s] = 0; open.push(hf(s), s);
    let found = false;
    while (open.a.length) {
      const [, u] = open.pop();
      if (closed[u]) continue; closed[u] = 1;
      if (u === t) { found = true; break; }
      for (const e of g.adj[u]) {
        if (e.e.blocked && !opt.ignoreBlocks) continue;
        const v = e.to, ng = gs[u] + e.e.len * kf[e.e.kind];
        if (ng < gs[v]) { gs[v] = ng; prev[v] = u; open.push(ng + hf(v), v); }
      }
    }
    if (!found) return [start, end];
    const path = []; for (let u = t; u !== -1; u = prev[u]) path.push({ x: N[u].x, z: N[u].z, node: u }); path.reverse();
    if (path.length >= 2 && hyp(start.x - path[1].x, start.z - path[1].z) < hyp(path[0].x - path[1].x, path[0].z - path[1].z)) path.shift();
    if (path.length >= 2 && hyp(end.x - path[path.length - 2].x, end.z - path[path.length - 2].z) < hyp(path[path.length - 1].x - path[path.length - 2].x, path[path.length - 1].z - path[path.length - 2].z)) path.pop();
    return [start].concat(path, [end]);
  };
  M.routeLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return L; };

  // ---------- stromy a lampy ----------
  function freeSpot(x, z, m) {
    if (x < 3 || z < 3 || x > W - 3 || z > H - 3) return false;
    if (M.isPaved(x, z) || M.isWater(x, z)) return false;
    for (const l of M.locList) if (l.kind !== 'park' && inRect(x, z, l, m)) return false;
    for (const f of FILLERS) if (inRect(x, z, f, m)) return false;
    for (const lt of M.lots) if (inRect(x, z, lt, 1)) return false;
    for (const p of M.paths) for (let i = 0; i + 1 < p.pts.length; i++) if (segDist2(x, z, p.pts[i].x, p.pts[i].z, p.pts[i + 1].x, p.pts[i + 1].z).d2 < (p.w / 2 + 1.2) * (p.w / 2 + 1.2)) return false;
    const n = M.nearestRoad(x, z, 30); if (n && n.dist < n.road.w / 2 + M.SIDEWALK + 1.5) return false;
    if (Math.abs(z - riverZ(x)) < RIVER.w / 2 + 3) return false;
    return true;
  }
  function buildTreesLamps() {
    const trees = [], lamps = [];
    const pushTree = (x, z, r) => { if (freeSpot(x, z, 2.5) && !trees.some((t) => hyp(t.x - x, t.z - z) < 4.5)) trees.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(1) }); };
    const park = M.locs.park;
    // park
    for (let i = 0; i < 70; i++) pushTree(park.x + rr(-36, 36), park.z + rr(-26, 26), rr(2.4, 3.8));
    // aleje pozdĺž ulíc (striedavo po stranách)
    ROADS.filter((r) => r.kind !== 'hwy').forEach((rd) => {
      const p = thin(rd.pts, rd.kind === 'main' ? 24 : 30, rd.loop);
      [1, -1].forEach((side) => offsetPoly(p, side * (rd.w / 2 + M.SIDEWALK + 2.8), rd.loop).forEach((q, i) => { if ((i + (side > 0 ? 0 : 1)) % 2 === 0 && R() < 0.7) pushTree(q.x, q.z, rr(2, 3.2)); }));
    });
    // breh rieky
    RIVER.pts.forEach((p, i) => { if (i % 5 === 0 && R() < 0.8) { const s = R() < 0.5 ? -1 : 1; pushTree(p.x + rr(-5, 5), p.z + s * (RIVER.w / 2 + rr(4, 9)), rr(2.4, 3.8)); } });
    // pás stromov za diaľnicou + malé hájiky
    for (let x = 6; x < W; x += rr(6, 12)) pushTree(x, rr(3, 9), rr(2, 3.2));
    [[30, 110, 22], [620, 185, 18], [60, 300, 18], [300, 200, 14], [615, 290, 16]].forEach((c) => {
      for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * c[2]; pushTree(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d * 0.8, rr(2.4, 3.8)); }
    });
    // náhodné dvorové stromy
    for (let i = 0; i < 140 && trees.length < 262; i++) pushTree(rr(5, W - 5), rr(12, H - 5), rr(2, 3.4));
    // lampy ~ každých 22 m (hlavné ulice obojstranne, striedavo)
    const lampOk = (q) => !M.isWater(q.x, q.z) && !M.locAt(q.x, q.z) && !FILLERS.some((f) => inRect(q.x, q.z, f, 0.5)) && !M.isRoad(q.x, q.z);
    ROADS.forEach((rd) => {
      const step = rd.kind === 'hwy' ? 30 : rd.kind === 'main' ? 24 : 22, p = thin(rd.pts, step, rd.loop);
      offsetPoly(p, rd.w / 2 + (rd.kind === 'hwy' ? 1.6 : 1.1), rd.loop).forEach((q) => { if (lampOk(q)) lamps.push({ x: +q.x.toFixed(1), z: +q.z.toFixed(1), side: 1 }); });
      if (rd.kind === 'main') offsetPoly(p, -(rd.w / 2 + 1.1), rd.loop).forEach((q, i) => { if (i % 2 === 1 && lampOk(q)) lamps.push({ x: +q.x.toFixed(1), z: +q.z.toFixed(1), side: -1 }); });
    });
    M.lots.filter((l) => l.kind === 'parking' || l.kind === 'yard').forEach((l) => { const c = rectCorners(l); [c[0], c[2]].forEach((q) => { if (lampOk(q)) lamps.push({ x: +q.x.toFixed(1), z: +q.z.toFixed(1), side: 0 }); }); });
    // lampy v parku popri chodníkoch
    M.paths.filter((p) => p.loc === 'park').forEach((p) => { const tp = thin(p.pts, 26, false); tp.forEach((q, i) => { const q2 = { x: q.x + 1.6, z: q.z + 1.6 }; if (i % 2 === 1 && i < tp.length - 1 && lampOk(q2) && !M.isPaved(q2.x, q2.z)) lamps.push({ x: +q2.x.toFixed(1), z: +q2.z.toFixed(1), side: 0 }); }); });
    M.trees = trees; M.lamps = lamps;
  }
  function riverZ(x) {
    let best = RIVER.pts[0], bd = 1e9;
    for (const p of RIVER.pts) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
    return best.z;
  }

  // ============================================================
  //  TEXTÚRY (dlaždice -> createPattern)
  // ============================================================
  function vnoise(cells) {
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = R();
    return function (u, v) {
      const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const i0 = ((x0 % cells) + cells) % cells, i1 = (i0 + 1) % cells, j0 = ((y0 % cells) + cells) % cells, j1 = (j0 + 1) % cells;
      const a = g[j0 * cells + i0], b = g[j0 * cells + i1], c = g[j1 * cells + i0], d = g[j1 * cells + i1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }
  function pixTile(w, h, fn) {
    const c = mk(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data, o = [0, 0, 0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { fn(i, j, o); const k = (j * w + i) * 4; d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = 255; }
    x.putImageData(id, 0, 0);
    return c;
  }
  const TILES = {};
  function makeTiles() {
    const S = 256, n1 = vnoise(4), n2 = vnoise(12), n3 = vnoise(48);
    TILES.grass = pixTile(S, S, (i, j, o) => {
      const u = i / S, v = j / S, n = n1(u, v) * 0.5 + n2(u, v) * 0.3 + n3(u, v) * 0.2, r = (R() - 0.5) * 22;
      o[0] = 58 + n * 40 + r * 0.6; o[1] = 96 + n * 50 + r; o[2] = 36 + n * 22 + r * 0.4;
    });
    {
      const n = vnoise(16);
      TILES.asphalt = pixTile(128, 128, (i, j, o) => {
        let v = 66 + (n(i / 128, j / 128) - 0.5) * 12 + (R() - 0.5) * 16; const s = R(); if (s < 0.015) v += 40; else if (s < 0.03) v -= 18;
        o[0] = v; o[1] = v + 2; o[2] = v + 5;
      });
      TILES.asphalt2 = pixTile(128, 128, (i, j, o) => { let v = 84 + (n(i / 128, j / 128) - 0.5) * 12 + (R() - 0.5) * 14; o[0] = v; o[1] = v + 1; o[2] = v + 3; });
    }
    TILES.pavers = pixTile(96, 96, (i, j, o) => {
      const row = Math.floor(j / 6), off = row % 2 ? 3 : 0, ii = (i + off) % 96, lx = ii % 6, ly = j % 6;
      let v = (R() - 0.5) * 14 + ((row * 7 + Math.floor(ii / 6) * 3) % 5) * 3;
      if (lx === 0 || ly === 0) { o[0] = 118 + v; o[1] = 114 + v; o[2] = 108 + v; return; }
      o[0] = 176 + v; o[1] = 170 + v; o[2] = 158 + v;
    });
    {
      const n = vnoise(8);
      TILES.concrete = pixTile(128, 128, (i, j, o) => {
        let v = 160 + (n(i / 128, j / 128) - 0.5) * 20 + (R() - 0.5) * 10; if (i % 16 === 0 || j % 16 === 0) v -= 34;
        o[0] = v; o[1] = v; o[2] = v - 4;
      });
      TILES.gravel = pixTile(64, 64, (i, j, o) => { const v = 150 + (R() - 0.5) * 60; o[0] = v + 10; o[1] = v + 2; o[2] = v - 12; });
    }
    {
      const ends = []; for (let r = 0; r < 24; r++) ends.push(ri(0, 63));
      TILES.wood = pixTile(64, 72, (i, j, o) => {
        const row = Math.floor(j / 3), ly = j % 3, g = Math.sin(i * 0.9 + row * 2.1) * 6 + (R() - 0.5) * 10;
        let r = 164 + g, gg = 112 + g * 0.8, b = 66 + g * 0.5;
        if (ly === 0 || i === ends[row]) { r -= 40; gg -= 30; b -= 18; }
        o[0] = r; o[1] = gg; o[2] = b;
      });
    }
    const ceramic = (cs, base, base2, grout) => pixTile(cs * 8, cs * 8, (i, j, o) => {
      const cx = Math.floor(i / cs), cy = Math.floor(j / cs), lx = i % cs, ly = j % cs, bc = (cx + cy) % 2 && base2 ? base2 : base, v = (R() - 0.5) * 8;
      if (lx === 0 || ly === 0) { o[0] = grout[0] + v; o[1] = grout[1] + v; o[2] = grout[2] + v; return; }
      o[0] = bc[0] + v; o[1] = bc[1] + v; o[2] = bc[2] + v;
    });
    TILES.tile = ceramic(3, [228, 224, 216], null, [165, 160, 150]);
    TILES.tile2 = ceramic(4, [198, 206, 214], [180, 190, 200], [130, 136, 144]);
    {
      const n = vnoise(8);
      TILES.lino = pixTile(64, 64, (i, j, o) => { const v = (n(i / 64, j / 64) - 0.5) * 18 + (R() - 0.5) * 6; const s = R(); if (s < 0.01) { o[0] = 240; o[1] = 120; o[2] = 90; return; } o[0] = 170 + v; o[1] = 204 + v; o[2] = 198 + v; });
      TILES.carpet = pixTile(64, 64, (i, j, o) => { const v = (n(i / 64, j / 64) - 0.5) * 14 + (R() - 0.5) * 30; o[0] = 176 + v; o[1] = 150 + v * 0.9; o[2] = 118 + v * 0.8; });
      TILES.water = pixTile(128, 128, (i, j, o) => { const v = (n(i / 128, j / 128) - 0.5) * 26 + (R() - 0.5) * 8; o[0] = 44 + v * 0.5; o[1] = 92 + v; o[2] = 138 + v; });
    }
    const field = (a, b) => pixTile(60, 60, (i, j, o) => { const s = Math.floor(i / 6) % 2 ? a : b, v = (R() - 0.5) * 26 + (i % 6 === 0 ? -18 : 0); o[0] = s[0] + v; o[1] = s[1] + v; o[2] = s[2] + v; });
    TILES.fieldA = field([201, 179, 106], [185, 162, 87]);
    TILES.fieldB = field([111, 154, 62], [95, 138, 52]);
    TILES.fieldC = field([122, 90, 62], [106, 76, 51]);
    TILES.fiber = pixTile(32, 32, (i, j, o) => { const v = 215 + (R() - 0.5) * 70; o[0] = v; o[1] = v; o[2] = v; });
  }
  const PAT = {};
  function makePatterns(x) {
    for (const k in TILES) {
      const p = x.createPattern(TILES[k], 'repeat');
      try { if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([1 / GS, 0, 0, 1 / GS, 0, 0])); } catch (e) { /* ignore */ }
      PAT[k] = p;
    }
  }

  // ---------- kresliace pomôcky (v metroch) ----------
  function rrect(c, x, z, w, d, r) {
    r = Math.max(0, Math.min(r, w / 2, d / 2));
    c.beginPath(); c.moveTo(x + r, z); c.arcTo(x + w, z, x + w, z + d, r); c.arcTo(x + w, z + d, x, z + d, r); c.arcTo(x, z + d, x, z, r); c.arcTo(x, z, x + w, z, r); c.closePath();
  }
  function box(c, x, z, w, d, col, r, noSh) {
    r = r == null ? 0.15 : r;
    if (!noSh) { c.save(); c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 3; c.shadowOffsetX = 1.5; c.shadowOffsetY = 2; rrect(c, x, z, w, d, r); c.fillStyle = col; c.fill(); c.restore(); }
    const g = c.createLinearGradient(x, z, x + w * 0.4, z + d); g.addColorStop(0, shade(col, 0.18)); g.addColorStop(1, shade(col, -0.22));
    rrect(c, x, z, w, d, r); c.fillStyle = g; c.fill();
    c.lineWidth = 0.08; c.strokeStyle = shade(col, -0.5); c.stroke();
  }
  function circ(c, x, z, r, col) { c.beginPath(); c.arc(x, z, r, 0, Math.PI * 2); if (col) { c.fillStyle = col; c.fill(); } }
  function line(c, x1, z1, x2, z2, col, lw) { c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.strokeStyle = col; c.lineWidth = lw || 0.08; c.stroke(); }
  function strokePoly(c, pts, w, style, closed, dash) {
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.z) : c.moveTo(p.x, p.z))); if (closed) c.closePath();
    c.lineWidth = w; c.strokeStyle = style; c.lineJoin = 'round'; c.lineCap = closed ? 'butt' : 'round';
    if (dash) c.setLineDash(dash); c.stroke(); if (dash) c.setLineDash([]);
  }
  function steel(c, x, z, w, d) {
    const g = c.createLinearGradient(x, z, x + w, z + d); g.addColorStop(0, '#dde2e6'); g.addColorStop(0.5, '#aeb5bb'); g.addColorStop(1, '#c9cfd4');
    c.fillStyle = g; c.fillRect(x, z, w, d);
  }
  const PRODUCT = ['#d64545', '#e8a33d', '#3d8fd6', '#4caf50', '#f2d64b', '#9b59b6', '#e67e22', '#ecf0f1', '#c0392b', '#16a085'];
  const CARDBOARD = ['#b88a55', '#a77a48', '#c9a06a', '#9c7444'];
  const VEG = ['#4caf50', '#e53935', '#fb8c00', '#8bc34a', '#fdd835', '#6d4c41'];
  function chair(c, cx, cz, col, sz) { sz = sz || 0.45; box(c, cx - sz / 2, cz - sz / 2, sz, sz, col, 0.08, true); }

  // nábytok zhora (lokálne súradnice budovy, jednotky metre)
  const FD = {};
  FD.rug = (c, f, x, z, w, d) => {
    const col = f.c || '#a05040';
    c.fillStyle = col; c.fillRect(x, z, w, d); c.save(); c.globalAlpha = 0.45; c.globalCompositeOperation = 'multiply'; c.fillStyle = PAT.fiber; c.fillRect(x, z, w, d); c.restore();
    c.strokeStyle = rgba(shade(col, -0.35), 0.9); c.lineWidth = 0.25; c.strokeRect(x + 0.3, z + 0.3, w - 0.6, d - 0.6);
    c.beginPath(); c.ellipse(x + w / 2, z + d / 2, w * 0.2, d * 0.22, 0, 0, Math.PI * 2); c.fillStyle = rgba(shade(col, -0.22), 0.8); c.fill();
  };
  FD.crib = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#d9b07a', 0.1);
    c.fillStyle = '#f5a9c4'; c.fillRect(x + 0.2, z + 0.2, w - 0.4, d - 0.4);
    c.fillStyle = '#fff'; rrect(c, x + 0.3, z + 0.3, 0.5, d - 0.6, 0.1); c.fill();
    circ(c, x + w - 0.6, z + d / 2, 0.22, '#a0703e');
    c.strokeStyle = 'rgba(120,80,30,0.6)'; c.lineWidth = 0.05; c.beginPath(); for (let t = x + 0.3; t < x + w; t += 0.25) { c.moveTo(t, z); c.lineTo(t, z + 0.15); c.moveTo(t, z + d); c.lineTo(t, z + d - 0.15); } c.stroke();
  };
  FD.bed = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#6b4426', 0.1);
    c.fillStyle = '#f3f1ec'; c.fillRect(x + 0.1, z + 0.25, w - 0.2, d - 0.35);
    const pw = (w - 0.5) / 2;
    [0, 1].forEach((i) => { rrect(c, x + 0.2 + i * (pw + 0.1), z + 0.35, pw, 0.55, 0.15); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 0.04; c.stroke(); });
    const g = c.createLinearGradient(x, z + 1, x + w, z + d); g.addColorStop(0, '#6386c6'); g.addColorStop(1, '#2f4b80');
    rrect(c, x + 0.1, z + 1.05, w - 0.2, d - 1.15, 0.12); c.fillStyle = g; c.fill();
    c.fillStyle = '#ebe7df'; c.fillRect(x + 0.1, z + 1.05, w - 0.2, 0.22);
  };
  FD.sofa = (c, f, x, z, w, d) => {
    const col = f.c || '#6a7f8d'; box(c, x, z, w, d, col, 0.25);
    c.fillStyle = shade(col, -0.25); c.fillRect(x + 0.05, z + 0.05, w - 0.1, d * 0.32);
    const n = Math.max(1, Math.round(w / 0.8)), sw = (w - 0.4) / n;
    for (let i = 0; i < n; i++) { rrect(c, x + 0.2 + i * sw + 0.04, z + d * 0.32, sw - 0.08, d * 0.62, 0.1); c.fillStyle = shade(col, 0.08); c.fill(); }
    box(c, x + 0.5, z + 0.35, 0.4, 0.4, '#e3b04b', 0.08, true); box(c, x + w - 0.9, z + 0.35, 0.4, 0.4, '#c8553d', 0.08, true);
  };
  FD.armchair = (c, f, x, z, w, d) => { FD.sofa(c, { c: '#5e7b4f' }, x, z, w, d); };
  FD.counter = (c, f, x, z, w, d) => {
    const base = f.post ? '#7d5a3c' : f.win ? '#8d6a4a' : '#5a3e2b'; box(c, x, z, w, d, base, 0.05);
    const top = f.post ? ['#c9b48f', '#a8926d'] : ['#e4e0d8', '#c0bbb0'];
    const g = c.createLinearGradient(x, z, x + w, z + d); g.addColorStop(0, top[0]); g.addColorStop(1, top[1]); c.fillStyle = g; c.fillRect(x + 0.06, z + 0.06, w - 0.12, d - 0.12);
    const hor = w >= d;
    if (f.sink) { const sx = hor ? x + w * 0.6 : x + w / 2, sz = hor ? z + d / 2 : z + d * 0.6; rrect(c, sx - 0.45, sz - 0.25, 0.9, 0.5, 0.08); c.fillStyle = '#aeb6bd'; c.fill(); circ(c, sx, sz, 0.06, '#3a3f44'); }
    if (f.hob) { const hx = hor ? x + w * 0.25 : x + w / 2, hz = hor ? z + d / 2 : z + d * 0.25; c.fillStyle = '#1b1b1f'; c.fillRect(hx - 0.35, hz - 0.3, 0.7, 0.6); [[-0.17, -0.14], [0.17, -0.14], [-0.17, 0.14], [0.17, 0.14]].forEach((p) => { circ(c, hx + p[0], hz + p[1], 0.1, null); c.strokeStyle = '#666'; c.lineWidth = 0.03; c.stroke(); }); }
    if (f.coffee) { FD.coffee(c, {}, x + 0.3, z + 0.2, 0.6, 0.5); for (let i = 0; i < 3; i++) circ(c, x + 1.3 + i * 0.3, z + d - 0.3, 0.1, '#f5f5f5'); }
    if (f.post) for (let i = 0; i < 3; i++) { const px = x + w * (i + 0.5) / 3; c.fillStyle = '#2f3338'; c.fillRect(px - 0.3, z + 0.15, 0.6, 0.4); c.fillStyle = '#7fd3e8'; c.fillRect(px - 0.25, z + 0.2, 0.5, 0.25); }
    if (f.win) { c.fillStyle = '#f2f0e8'; c.fillRect(x + w / 2 - 0.3, z + d / 2 - 0.2, 0.6, 0.4); circ(c, x + 0.4, z + d / 2, 0.12, '#c9a227'); }
  };
  FD.sink = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#9aa1a8', 0.05); steel(c, x + 0.06, z + 0.06, w - 0.12, d - 0.12); rrect(c, x + 0.3, z + 0.2, w - 0.6, d - 0.4, 0.08); c.fillStyle = '#7f878f'; c.fill(); circ(c, x + w / 2, z + d / 2, 0.06, '#3a3f44'); };
  FD.fridge = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#e9edf0', 0.1); line(c, x + 0.1, z + d * 0.4, x + w - 0.1, z + d * 0.4, 'rgba(0,0,0,0.3)', 0.05); c.fillStyle = '#e94b3c'; c.fillRect(x + w - 0.3, z + 0.2, 0.15, 0.15); };
  FD.table = (c, f, x, z, w, d) => {
    const cc = '#6b4a2e', cx = x + w / 2, cz = z + d / 2;
    if (w <= 1.5 && d <= 1.5) { chair(c, cx, z - 0.3, cc); chair(c, cx, z + d + 0.3, cc); chair(c, x - 0.3, cz, cc); chair(c, x + w + 0.3, cz, cc); }
    else [0.3, 0.7].forEach((t) => { chair(c, x + w * t, z - 0.3, cc); chair(c, x + w * t, z + d + 0.3, cc); });
    box(c, x, z, w, d, '#a0703f', 0.08); c.save(); c.globalAlpha = 0.5; c.fillStyle = PAT.wood; c.fillRect(x + 0.05, z + 0.05, w - 0.1, d - 0.1); c.restore();
    circ(c, cx, cz, 0.2, '#e8e1d4'); circ(c, cx - 0.06, cz, 0.07, '#d93a2b'); circ(c, cx + 0.07, cz + 0.03, 0.06, '#8cbf3f');
  };
  FD.kidtable = (c, f, x, z, w, d) => {
    ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'].forEach((col, i) => chair(c, x + w * (i < 2 ? 0.3 : 0.7), i % 2 ? z + d + 0.25 : z - 0.25, col, 0.35));
    box(c, x, z, w, d, '#f8e8a8', 0.1); c.fillStyle = '#e67e22'; c.fillRect(x + 0.3, z + 0.3, 0.4, 0.3); c.fillStyle = '#3498db'; c.fillRect(x + w - 0.7, z + d - 0.6, 0.4, 0.3);
  };
  FD.shoes = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#8a5f33', 0.05); ['#222', '#c0392b', '#f5f5f5', '#2a6fb0'].forEach((col, i) => { c.fillStyle = col; if (d > w) c.fillRect(x + 0.08, z + 0.1 + i * 0.28, w - 0.16, 0.2); else c.fillRect(x + 0.1 + i * 0.28, z + 0.08, 0.2, d - 0.16); }); };
  FD.hooks = (c, f, x, z, w, d) => { c.fillStyle = '#6e4720'; c.fillRect(x, z, w, d); ['#2a6fb0', '#c0392b', '#f2c230'].forEach((col, i) => { c.beginPath(); c.ellipse(x + w / 2 + 0.25, z + 0.25 + i * 0.45, 0.28, 0.18, 0, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }); };
  FD.cabinet = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, f.atm ? '#2f4b80' : '#8a5f33', 0.05);
    if (f.atm) { c.fillStyle = '#7fd3e8'; c.fillRect(x + 0.2, z + 0.15, w - 0.4, d * 0.4); }
    else if (f.mail) { c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.03; for (let t = 0.25; t < w; t += 0.25) line(c, x + t, z, x + t, z + d, 'rgba(0,0,0,0.35)', 0.03); }
    else { const hor = w >= d; line(c, hor ? x + w / 2 : x, hor ? z : z + d / 2, hor ? x + w / 2 : x + w, hor ? z + d : z + d / 2, 'rgba(0,0,0,0.35)', 0.04); circ(c, x + w / 2 - 0.1, z + d / 2, 0.04, '#222'); circ(c, x + w / 2 + 0.1, z + d / 2, 0.04, '#222'); }
  };
  FD.checkout = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#9aa1a8', 0.05); c.fillStyle = '#d7dadd'; c.fillRect(x + 0.08, z + 0.08, w - 0.16, d - 0.16); c.fillStyle = '#2f3338'; c.fillRect(x + w / 2 - 0.25, z + 0.25, 0.5, 0.4); c.fillStyle = '#7fd3e8'; c.fillRect(x + w / 2 - 0.2, z + 0.3, 0.4, 0.25); c.fillStyle = '#222'; c.fillRect(x + 0.15, z + d - 0.6, w - 0.3, 0.3); };
  FD.coffee = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#2b2b30', 0.06); c.fillStyle = '#c8ccd0'; c.fillRect(x + 0.06, z + 0.06, w - 0.12, d * 0.35); circ(c, x + w - 0.1, z + d - 0.1, 0.04, '#ff3b30'); };
  FD.shelf = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#8d949b', 0.04); c.fillStyle = '#c4c9cd'; c.fillRect(x + 0.05, z + 0.05, w - 0.1, d - 0.1);
    const hor = w >= d, L = hor ? w : d, D = hor ? d : w, pal = f.veg ? VEG : f.tires ? ['#222', '#2a2a2a', '#1a1a1a'] : f.box ? CARDBOARD : PRODUCT;
    for (let row = 0; row < 2; row++) {
      let t = 0.1;
      while (t < L - 0.25) {
        const s = Math.min(rr(0.25, 0.7), L - 0.1 - t), col = pick(pal), d0 = 0.08 + row * (D / 2 - 0.02), dd = D / 2 - 0.14;
        const bx = hor ? x + t : x + d0, bz = hor ? z + d0 : z + t, bw = hor ? s - 0.05 : dd, bh = hor ? dd : s - 0.05;
        if (f.veg) { circ(c, bx + bw / 2, bz + bh / 2, Math.min(bw, bh) / 2, col); } else { c.fillStyle = col; c.fillRect(bx, bz, bw, bh); }
        t += s;
      }
    }
  };
  FD.pump = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#e7eaec', 0.1); c.fillStyle = '#1f9d55'; c.fillRect(x + 0.05, z + 0.05, w - 0.1, 0.35); c.fillStyle = '#1b2630'; c.fillRect(x + 0.15, z + 0.55, w - 0.3, 0.5);
    c.fillStyle = '#7cf0a0'; c.fillRect(x + 0.2, z + 0.65, w - 0.4, 0.08);
    c.strokeStyle = '#141414'; c.lineWidth = 0.08; c.beginPath(); c.moveTo(x + 0.15, z + d - 0.1); c.quadraticCurveTo(x - 0.5, z + d + 0.2, x - 0.1, z + 1.3); c.moveTo(x + w - 0.15, z + d - 0.1); c.quadraticCurveTo(x + w + 0.5, z + d + 0.2, x + w + 0.1, z + 1.3); c.stroke();
  };
  FD.pillar = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#bdbdb8', 0.02); c.fillStyle = '#d42f2f'; c.fillRect(x + 0.05, z + d / 2 - 0.06, w - 0.1, 0.12); };
  FD.board = (c, f, x, z, w, d) => { c.fillStyle = '#8a5a34'; c.fillRect(x - 0.04, z - 0.04, w + 0.08, d + 0.08); c.fillStyle = '#23302a'; c.fillRect(x, z, w, d); c.strokeStyle = 'rgba(240,240,230,0.85)'; c.lineWidth = 0.03; c.beginPath(); for (let i = 0; i < 4; i++) { const sx = x + 0.1 + i * (w / 4); c.moveTo(sx, z + d / 2); c.lineTo(sx + w / 6, z + d / 2); } c.stroke(); };
  FD.stove = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#9aa1a8', 0.06); steel(c, x + 0.06, z + 0.06, w - 0.12, d - 0.12);
    const n = Math.max(2, Math.round(w / 0.75));
    for (let i = 0; i < n; i++) { const bx = x + w * (i + 0.5) / n, bz = z + d * 0.45; circ(c, bx, bz, 0.26, '#1d1d1f'); const g = c.createRadialGradient(bx, bz, 0.02, bx, bz, 0.22); g.addColorStop(0, 'rgba(255,230,140,1)'); g.addColorStop(0.5, 'rgba(255,120,30,0.9)'); g.addColorStop(1, 'rgba(60,10,0,0)'); circ(c, bx, bz, 0.22, null); c.fillStyle = g; c.fill(); circ(c, bx, z + d - 0.15, 0.06, '#2b2b2b'); }
  };
  FD.fryer = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#9aa1a8', 0.06); steel(c, x + 0.06, z + 0.06, w - 0.12, d - 0.12);
    const n = w > 1.5 ? 2 : 1, bw = (w - 0.2 * (n + 1)) / n;
    for (let i = 0; i < n; i++) { const bx = x + 0.2 + i * (bw + 0.2); const g = c.createLinearGradient(bx, z, bx, z + d); g.addColorStop(0, '#d9a441'); g.addColorStop(1, '#8a5a12'); c.fillStyle = g; c.fillRect(bx, z + 0.15, bw, d - 0.45); c.strokeStyle = 'rgba(40,40,40,0.7)'; c.lineWidth = 0.03; c.strokeRect(bx, z + 0.15, bw, d - 0.45); c.fillStyle = '#1a1a1a'; c.fillRect(bx + bw / 2 - 0.08, z + d - 0.3, 0.16, 0.25); }
  };
  FD.steel = (c, f, x, z, w, d) => {
    box(c, x, z, w, d, '#9aa1a8', 0.04); steel(c, x + 0.06, z + 0.06, w - 0.12, d - 0.12);
    box(c, x + w * 0.3, z + 0.25, Math.min(1.2, w * 0.3), d - 0.5, '#d9b07a', 0.05, true);
    circ(c, x + w * 0.15, z + d / 2, Math.min(0.35, d * 0.35), '#e8ecef'); circ(c, x + w * 0.15 - 0.08, z + d / 2 - 0.05, 0.1, '#6bb33d'); circ(c, x + w * 0.15 + 0.1, z + d / 2 + 0.06, 0.09, '#f2c230');
    circ(c, x + w * 0.8, z + d / 2, Math.min(0.3, d * 0.3), '#3a3a3e'); circ(c, x + w * 0.8, z + d / 2, Math.min(0.22, d * 0.22), '#222');
  };
  FD.pass = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#9aa1a8', 0.04); steel(c, x + 0.06, z + 0.06, w - 0.12, d - 0.12); for (let i = 0; i < Math.floor(w / 1.2); i++) { const px = x + 0.6 + i * 1.2; circ(c, px, z + d / 2, 0.3, 'rgba(255,150,40,0.55)'); circ(c, px, z + d / 2, 0.18, '#ffb347'); } for (let i = 0; i < 4; i++) { c.fillStyle = '#fff'; c.fillRect(x + 0.3 + i * 0.5, z + d - 0.3, 0.35, 0.22); } };
  FD.coldbox = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#eef2f5', 0.1); const g = c.createLinearGradient(x, z, x + w, z + d); g.addColorStop(0, 'rgba(180,215,240,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x + 0.1, z + 0.1, w - 0.2, d - 0.2); c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 0.04; c.strokeRect(x + 0.12, z + 0.12, w - 0.24, d - 0.24); c.fillStyle = '#7d868e'; if (w > d) c.fillRect(x + w / 2 - 0.3, z + d - 0.15, 0.6, 0.1); else c.fillRect(x + w - 0.15, z + d / 2 - 0.3, 0.1, 0.6); };
  FD.desk = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#8a5a36', 0.05); c.fillStyle = '#2b2b30'; c.fillRect(x + w / 2 - 0.35, z + d / 2 - 0.25, 0.7, 0.5); c.fillStyle = '#7fd3e8'; c.fillRect(x + w / 2 - 0.3, z + d / 2 - 0.22, 0.6, 0.3); c.fillStyle = '#f2f0e8'; c.fillRect(x + 0.15, z + 0.15, 0.4, 0.5); chair(c, x + w / 2, z + d + 0.35, '#333'); };
  FD.lockers = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#8d6a4a', 0.04); const n = Math.round(w / 0.5); const pal = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22', '#9b59b6']; for (let i = 0; i < n; i++) { c.fillStyle = pal[i % pal.length]; c.fillRect(x + 0.05 + i * (w / n), z + 0.05, w / n - 0.06, d - 0.1); } };
  FD.bench = (c, f, x, z, w, d) => { box(c, x, z, w, d, '#8a5a36', 0.05); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.03; if (w >= d) for (let t = 0.15; t < d; t += 0.15) line(c, x, z + t, x + w, z + t, 'rgba(0,0,0,0.3)', 0.03); else for (let t = 0.15; t < w; t += 0.15) line(c, x + t, z, x + t, z + d, 'rgba(0,0,0,0.3)', 0.03); };
  FD.dogbed = (c, f, x, z, w, d) => { c.beginPath(); c.ellipse(x + w / 2, z + d / 2, w / 2, d / 2, 0, 0, Math.PI * 2); c.fillStyle = '#7a4a28'; c.fill(); c.beginPath(); c.ellipse(x + w / 2, z + d / 2, w / 2 - 0.15, d / 2 - 0.15, 0, 0, Math.PI * 2); c.fillStyle = '#c9a27a'; c.fill(); circ(c, x + w / 2 + 0.2, z + d / 2, 0.1, '#e94b3c'); };
  FD.ramp = (c, f, x, z, w, d) => { c.fillStyle = PAT.concrete; c.fillRect(x, z, w, d); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, z, w, d); c.save(); c.beginPath(); c.rect(x, z, w, 0.6); c.clip(); for (let t = x - 1; t < x + w + 1; t += 1.2) { c.fillStyle = '#f2c230'; c.fillRect(t, z, 0.6, 0.6); c.fillStyle = '#1a1a1a'; c.fillRect(t + 0.6, z, 0.6, 0.6); } c.restore(); };
  FD.lift = (c, f, x, z, w, d) => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, z, w, d); c.fillStyle = '#6b7075'; c.fillRect(x + 0.4, z, 0.9, d); c.fillRect(x + w - 1.3, z, 0.9, d); c.fillStyle = '#d42f2f'; c.fillRect(x + 0.4, z + d / 2 - 0.2, w - 0.8, 0.4); };
  FD.pond = (c, f, x, z, w, d) => {
    const cx = x + w / 2, cz = z + d / 2;
    c.beginPath(); c.ellipse(cx, cz, w / 2 + 1.5, d / 2 + 1.5, 0, 0, Math.PI * 2); c.fillStyle = '#8a7a5a'; c.fill();
    c.beginPath(); c.ellipse(cx, cz, w / 2, d / 2, 0, 0, Math.PI * 2); const g = c.createRadialGradient(cx, cz, 1, cx, cz, w / 2); g.addColorStop(0, '#2d5f8a'); g.addColorStop(1, '#4a86b0'); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 0.15; c.beginPath(); c.ellipse(cx - 2, cz - 1.5, w / 5, d / 6, 0, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 5; i++) circ(c, cx + rr(-w / 3, w / 3), cz + rr(-d / 3, d / 3), 0.35, '#3d8a45');
  };
  FD.fence = (c, f, x, z, w, d) => {
    c.fillStyle = 'rgba(190,160,110,0.35)'; c.fillRect(x, z, w, d);
    c.strokeStyle = '#5a4628'; c.lineWidth = 0.22; c.strokeRect(x, z, w, d); c.strokeStyle = 'rgba(255,240,200,0.5)'; c.lineWidth = 0.06; c.strokeRect(x + 0.2, z + 0.2, w - 0.4, d - 0.4);
    c.fillStyle = '#4a3820'; for (let t = 0; t <= w; t += 2) { c.fillRect(x + t - 0.2, z - 0.2, 0.4, 0.4); c.fillRect(x + t - 0.2, z + d - 0.2, 0.4, 0.4); } for (let t = 2; t < d; t += 2) { c.fillRect(x - 0.2, z + t - 0.2, 0.4, 0.4); c.fillRect(x + w - 0.2, z + t - 0.2, 0.4, 0.4); }
    c.fillStyle = PAT.grass; c.fillRect(x - 0.2, z + 1, 0.4, d - 2);
    circ(c, x + w * 0.3, z + d * 0.6, 0.5, '#8a7a5a'); circ(c, x + w * 0.7, z + d * 0.35, 0.6, '#8a7a5a');
  };

  // ============================================================
  //  ZEM (groundCanvas, GS px/m) – viditeľná 2D zem v3: čiary 0.25 m (2 px), okná na vonkajších stenách, rohožky, parkovacie boxy, zebry
  // ============================================================
  const LW = 0.25; // šírka značenia v metroch (2 px pri 8 px/m)
  function drawGround() {
    const cv = mk(GW, GH), c = cv.getContext('2d');
    makeTiles(); makePatterns(c);
    c.setTransform(GS, 0, 0, GS, 0, 0);
    // tráva + škvrny
    c.fillStyle = PAT.grass; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = rr(0, W), z = rr(0, H), rx = rr(5, 26), rz = rx * rr(0.5, 1), dark = R() < 0.55;
      c.fillStyle = dark ? `rgba(30,70,20,${rr(0.08, 0.2)})` : `rgba(170,200,90,${rr(0.06, 0.16)})`;
      c.beginPath(); c.ellipse(x, z, rx, rz, rr(0, 3), 0, Math.PI * 2); c.fill();
    }
    // polia / záhradky
    FIELDS.forEach((f) => {
      c.save(); c.translate(f.x, f.z); c.rotate(f.rot || 0); c.fillStyle = PAT['field' + f.t]; c.fillRect(-f.w / 2, -f.d / 2, f.w, f.d);
      c.strokeStyle = 'rgba(70,55,30,0.55)'; c.lineWidth = 1.2; c.strokeRect(-f.w / 2, -f.d / 2, f.w, f.d);
      for (let t = -f.w / 2; t < f.w / 2; t += rr(3, 7)) circ(c, t, -f.d / 2 - 1.2, rr(1, 2), 'rgba(40,80,25,0.5)');
      c.restore();
    });
    // park
    const park = M.locs.park;
    c.fillStyle = 'rgba(60,130,50,0.22)'; rrect(c, park.x - park.w / 2, park.z - park.d / 2, park.w, park.d, 10); c.fill();
    c.strokeStyle = 'rgba(70,90,50,0.6)'; c.lineWidth = 0.5; c.stroke();
    // kvetinové záhony v parku
    for (let i = 0; i < 6; i++) { const fx = park.x + rr(-30, 30), fz = park.z + rr(-20, 20); if (!M.isPaved(fx, fz) && !M.isWater(fx, fz)) { c.beginPath(); c.ellipse(fx, fz, rr(1.5, 3), rr(1, 2), rr(0, 3), 0, Math.PI * 2); c.fillStyle = pick(['rgba(230,80,90,0.7)', 'rgba(240,200,60,0.7)', 'rgba(200,90,200,0.6)']); c.fill(); } }
    // rieka
    strokePoly(c, RIVER.pts, RIVER.w + 10, '#8a7a5a');
    strokePoly(c, RIVER.pts, RIVER.w + 4, '#6f8a4a');
    strokePoly(c, RIVER.pts, RIVER.w, '#2f5d85');
    strokePoly(c, RIVER.pts, RIVER.w - 6, '#3a709a');
    c.save(); c.globalAlpha = 0.55; strokePoly(c, RIVER.pts, RIVER.w, PAT.water); c.restore();
    c.save(); c.globalAlpha = 0.35; strokePoly(c, offsetPoly(RIVER.pts, -RIVER.w * 0.22, false), 0.9, '#9cc6e0', false, [5, 12]); strokePoly(c, offsetPoly(RIVER.pts, RIVER.w * 0.18, false), 0.8, '#9cc6e0', false, [8, 15]); c.restore();
    // chodníky (obrubník + dlažba)
    ROADS.forEach((rd) => {
      if (rd.kind === 'hwy') { strokePoly(c, rd.pts, rd.w + 3, PAT.gravel, rd.loop); return; }
      strokePoly(c, rd.pts, rd.w + 2 * M.SIDEWALK + 0.6, 'rgba(70,70,70,0.75)', rd.loop); strokePoly(c, rd.pts, rd.w + 2 * M.SIDEWALK, PAT.pavers, rd.loop);
    });
    // plochy (parkoviská, dvory, dlažba) – cez chodník (znížený obrubník), pod asfalt
    M.lots.forEach((lt) => drawLot(c, lt));
    M.paths.forEach((p) => { strokePoly(c, p.pts, p.w + 0.5, 'rgba(90,80,60,0.6)'); strokePoly(c, p.pts, p.w, p.kind === 'gravel' ? PAT.gravel : PAT.pavers); });
    // asfalt
    ROADS.forEach((rd) => { strokePoly(c, rd.pts, rd.w + 0.4, '#3b3d40', rd.loop); });
    ROADS.forEach((rd) => { strokePoly(c, rd.pts, rd.w, PAT.asphalt, rd.loop); });
    // mosty: svetlejšia doska + zábradlie
    ROADS.filter((r) => r.bridge).forEach((rd) => {
      const seg = rd.pts.filter((p) => Math.abs(p.z - riverZ(p.x)) < RIVER.w / 2 + 6);
      if (seg.length < 2) return;
      const butt = (pts, w, st) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.z) : c.moveTo(p.x, p.z))); c.lineWidth = w; c.strokeStyle = st; c.lineJoin = 'round'; c.lineCap = 'butt'; c.stroke(); };
      butt(seg, rd.w + 2 * M.SIDEWALK + 1, '#55595e'); butt(seg, rd.w + 2 * M.SIDEWALK, PAT.concrete); butt(seg, rd.w, PAT.asphalt2);
      [1, -1].forEach((s) => { const rail = offsetPoly(seg, s * (rd.w / 2 + M.SIDEWALK - 0.3), false); strokePoly(c, rail, 0.35, '#9aa0a6'); rail.forEach((p, i) => { if (i % 2 === 0) circ(c, p.x, p.z, 0.22, '#6c7278'); }); });
    });
    // čiary
    ROADS.forEach((rd) => {
      const hw = rd.w / 2;
      [1, -1].forEach((s) => strokePoly(c, offsetPoly(rd.pts, s * (hw - 0.4), rd.loop), LW, 'rgba(235,235,230,0.85)', rd.loop));
      if (rd.kind === 'city') strokePoly(c, rd.pts, LW, 'rgba(240,240,235,0.9)', rd.loop, [3, 5]);
      else if (rd.kind === 'main') [0.32, -0.32].forEach((o) => strokePoly(c, offsetPoly(rd.pts, o, rd.loop), LW, 'rgba(240,240,235,0.9)', rd.loop, [4, 5]));
      else { [0.32, -0.32].forEach((o) => strokePoly(c, offsetPoly(rd.pts, o, rd.loop), LW, 'rgba(245,235,200,0.95)', rd.loop)); [hw - 1.6, -(hw - 1.6)].forEach((o) => strokePoly(c, offsetPoly(rd.pts, o, rd.loop), LW, 'rgba(240,240,235,0.85)', rd.loop, [5, 7])); }
    });
    // križovatky: prekryť čiary, zebry + stopčiary
    M.intersections.forEach((it) => {
      if (it.hwy) return;
      circ(c, it.x, it.z, it.maxW / 2 + 1, null); c.fillStyle = PAT.asphalt; c.fill();
      const zebra = it.maxW >= 10 || it.arms.length >= 4;
      it.arms.forEach((a) => {
        const d0 = it.maxW / 2 + 2.4, nx = -a.dz, nz = a.dx, hw = a.w / 2 - 0.5;
        if (zebra) {
          c.fillStyle = 'rgba(240,240,235,0.9)';
          for (let t = -hw + 0.3; t < hw - 0.3; t += 1) {
            const bx = it.x + a.dx * d0 + nx * t, bz = it.z + a.dz * d0 + nz * t;
            c.save(); c.translate(bx, bz); c.rotate(Math.atan2(a.dz, a.dx)); c.fillRect(0, -0.25, 2.6, 0.5); c.restore();
          }
        }
        // stopčiara na pravej strane ramena (v smere do križovatky)
        const sd = d0 + (zebra ? 3.4 : 0.6), sx = it.x + a.dx * sd, sz = it.z + a.dz * sd;
        line(c, sx + nx * 0.2, sz + nz * 0.2, sx + nx * hw, sz + nz * hw, 'rgba(240,240,235,0.9)', 0.4);
      });
    });
    // stromy: tieň + kmeň na zemi (koruny kreslí renderer)
    M.trees.forEach((t) => {
      const g = c.createRadialGradient(t.x + t.r * 0.3, t.z + t.r * 0.4, t.r * 0.15, t.x + t.r * 0.3, t.z + t.r * 0.4, t.r * 0.95);
      g.addColorStop(0, 'rgba(0,15,0,0.32)'); g.addColorStop(0.7, 'rgba(0,15,0,0.2)'); g.addColorStop(1, 'rgba(0,15,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(t.x + t.r * 0.3, t.z + t.r * 0.4, t.r * 0.95, 0, Math.PI * 2); c.fill();
      circ(c, t.x, t.z, 0.32, '#4a3420'); circ(c, t.x - 0.08, t.z - 0.08, 0.16, '#7a5634');
    });
    // lampy: pätka
    M.lamps.forEach((l) => { circ(c, l.x + 0.15, l.z + 0.2, 0.42, 'rgba(0,0,0,0.3)'); circ(c, l.x, l.z, 0.36, '#4a4d52'); circ(c, l.x - 0.08, l.z - 0.08, 0.16, '#7d8188'); });
    // budovy
    M.locList.forEach((loc) => drawBuilding(c, loc));
    FILLERS.forEach((f) => drawFiller(c, f));
    c.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  }
  function drawLot(c, lt) {
    c.save(); c.translate(lt.x, lt.z); c.rotate(lt.rot || 0);
    const x = -lt.w / 2, z = -lt.d / 2, w = lt.w, d = lt.d;
    if (lt.kind === 'parking' || lt.kind === 'drive') {
      c.fillStyle = '#4a4c4f'; c.fillRect(x - 0.3, z - 0.3, w + 0.6, d + 0.6); c.fillStyle = PAT.asphalt; c.fillRect(x, z, w, d);
      if (lt.kind === 'parking') {
        c.strokeStyle = 'rgba(240,240,235,0.85)'; c.lineWidth = LW;
        const hor = w >= d; // rady kolmo na dlhšiu stranu, pri oboch okrajoch (ak je dosť hĺbky)
        const L = hor ? w : d, D = hor ? d : w, bays = Math.floor((L - 2) / 2.6), off = (L - bays * 2.6) / 2, two = D >= 16, bl = Math.min(5, D / 2 - 1);
        c.beginPath();
        for (let i = 0; i <= bays; i++) {
          const t = off + i * 2.6;
          if (hor) { c.moveTo(x + t, z); c.lineTo(x + t, z + bl); if (two) { c.moveTo(x + t, z + d); c.lineTo(x + t, z + d - bl); } }
          else { c.moveTo(x, z + t); c.lineTo(x + bl, z + t); if (two) { c.moveTo(x + w, z + t); c.lineTo(x + w - bl, z + t); } }
        }
        c.stroke();
        c.fillStyle = 'rgba(240,240,235,0.8)'; c.font = 'bold 3px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', 0, 0);
      }
    } else if (lt.kind === 'yard') {
      c.fillStyle = '#5a5c5e'; c.fillRect(x - 0.3, z - 0.3, w + 0.6, d + 0.6); c.fillStyle = PAT.concrete; c.fillRect(x, z, w, d); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, z, w, d);
      // olejové škvrny
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + rr(3, w - 3), z + rr(3, d - 3), rr(0.6, 1.6), rr(0.4, 1), rr(0, 3), 0, Math.PI * 2); c.fillStyle = 'rgba(20,20,25,0.25)'; c.fill(); }
    } else {
      c.fillStyle = 'rgba(90,80,60,0.7)'; c.fillRect(x - 0.3, z - 0.3, w + 0.6, d + 0.6); c.fillStyle = PAT.pavers; c.fillRect(x, z, w, d);
      if (lt.kind === 'plaza') { c.fillStyle = 'rgba(120,60,40,0.35)'; c.beginPath(); c.ellipse(0, 0, Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 0, 0, Math.PI * 2); c.fill(); }
      if (lt.kind === 'pad' && Math.min(w, d) >= 12) { // 2 parkovacie boxy na spevnenej ploche
        c.strokeStyle = 'rgba(240,240,235,0.8)'; c.lineWidth = LW; c.beginPath();
        const hor = w >= d; for (let i = -1; i <= 1; i++) { const t = i * 2.6; if (hor) { c.moveTo(x + 0.6 + 0, z + d / 2 + t); c.lineTo(x + 0.6 + 5, z + d / 2 + t); } else { c.moveTo(x + w / 2 + t, z + 0.6); c.lineTo(x + w / 2 + t, z + 0.6 + 5); } }
        c.stroke();
      }
    }
    c.restore();
  }
  // steny s oknami (lokálne súradnice, budova vycentrovaná v 0,0)
  function drawWalls(c, loc) {
    const T = M.WALL_T, hw = loc.w / 2, hd = loc.d / 2, DW = M.DOOR_W / 2;
    const sides = { N: [], S: [], E: [], W: [] };
    loc.doorList.forEach((d) => sides[d.side].push(d.at));
    const pieces = (len, gaps) => {
      const segs = []; let a = -len / 2;
      gaps.slice().sort((p, q) => p - q).forEach((g) => { if (g - DW > a) segs.push([a, g - DW]); a = g + DW; });
      if (a < len / 2) segs.push([a, len / 2]);
      return segs;
    };
    const win = loc.kind === 'hall' ? { len: 2.4, step: 6, start: 2.2 } : loc.kind === 'outlet' ? { len: 1.4, step: 99, start: 0.9 } : { len: 1.2, step: 2.8, start: 1.3 };
    const seg = (x, z, w, d, hor) => {
      const g = hor ? c.createLinearGradient(0, z, 0, z + d) : c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#50545b'); g.addColorStop(1, '#2e3035');
      c.fillStyle = g; c.fillRect(x, z, w, d);
      const L = hor ? w : d;
      if (L >= win.start * 2 + win.len) for (let t = win.start; t + win.len <= L - win.start + 0.01; t += win.step) {
        const g2 = hor ? c.createLinearGradient(x + t, 0, x + t + win.len, 0) : c.createLinearGradient(0, z + t, 0, z + t + win.len);
        g2.addColorStop(0, '#9fd0ea'); g2.addColorStop(0.5, '#e6f6ff'); g2.addColorStop(1, '#8cc0de'); c.fillStyle = g2;
        if (hor) c.fillRect(x + t, z + 0.04, win.len, d - 0.08); else c.fillRect(x + 0.04, z + t, w - 0.08, win.len);
      }
    };
    pieces(loc.w, sides.N).forEach((s) => seg(s[0], -hd, s[1] - s[0], T, true));
    pieces(loc.w, sides.S).forEach((s) => seg(s[0], hd - T, s[1] - s[0], T, true));
    pieces(loc.d, sides.E).forEach((s) => seg(hw - T, s[0], T, s[1] - s[0], false));
    pieces(loc.d, sides.W).forEach((s) => seg(-hw, s[0], T, s[1] - s[0], false));
    // vonkajšia tmavá linka (1 px)
    c.strokeStyle = 'rgba(20,18,16,0.85)'; c.lineWidth = 1 / GS; c.strokeRect(-hw, -hd, loc.w, loc.d);
  }
  function shadowRect(c, x, z, w, d) {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.38)'; c.shadowBlur = 10; c.shadowOffsetX = 5; c.shadowOffsetY = 7; c.fillStyle = '#3b3e44'; c.fillRect(x, z, w, d); c.restore();
  }
  function drawBuilding(c, loc) {
    c.save(); c.translate(loc.x, loc.z); c.rotate(loc.rot || 0);
    const hw = loc.w / 2, hd = loc.d / 2;
    if (loc.kind !== 'park') {
      shadowRect(c, -hw, -hd, loc.w, loc.d);
      const fp = PAT[loc.floor] || PAT.concrete;
      c.fillStyle = fp; c.fillRect(-hw, -hd, loc.w, loc.d);
      if (loc.floor === 'wood') { c.fillStyle = 'rgba(120,70,30,0.12)'; c.fillRect(-hw, -hd, loc.w, loc.d); }
      // rohožky + prah pred dverami (vonku)
      loc.doorList.forEach((d) => {
        const hor = d.side === 'N' || d.side === 'S', sgn = (d.side === 'S' || d.side === 'E') ? 1 : -1;
        c.save(); c.translate(d.lx, d.lz); if (!hor) c.rotate(Math.PI / 2);
        const mz = sgn * (hor ? 1 : -1) > 0 ? 0.2 : -0.9;
        c.fillStyle = '#3a3530'; rrect(c, -1.1, mz, 2.2, 0.7, 0.08); c.fill();
        c.save(); c.globalAlpha = 0.5; c.globalCompositeOperation = 'multiply'; c.fillStyle = PAT.fiber; c.fillRect(-1, mz + 0.08, 2, 0.54); c.restore();
        c.strokeStyle = 'rgba(160,140,110,0.7)'; c.lineWidth = 0.06; c.strokeRect(-0.95, mz + 0.12, 1.9, 0.46);
        c.restore();
      });
    }
    // nábytok (koberce najprv)
    const items = loc.interior.slice().sort((a, b) => (a.type === 'rug' ? -1 : b.type === 'rug' ? 1 : 0));
    items.forEach((f) => { const fn = FD[f.type]; if (!fn) return; c.save(); try { fn(c, f, f.lx - f.w / 2, f.lz - f.d / 2, f.w, f.d); } catch (e) { /* ignore */ } c.restore(); });
    if (loc.kind !== 'park') {
      drawWalls(c, loc);
      // dvere: prah + krídlo
      loc.doorList.forEach((d) => {
        const hor = d.side === 'N' || d.side === 'S', sgn = (d.side === 'S' || d.side === 'E') ? 1 : -1;
        c.save(); c.translate(d.lx, d.lz); if (!hor) c.rotate(Math.PI / 2);
        c.fillStyle = '#8a7a66'; c.fillRect(-M.DOOR_W / 2, -M.WALL_T / 2, M.DOOR_W, M.WALL_T);
        c.strokeStyle = loc.kind === 'outlet' ? '#f2c230' : '#7a3a2a'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(-M.DOOR_W / 2, 0); c.lineTo(-M.DOOR_W / 2 + 0.35, -sgn * (hor ? 1 : -1) * 1.45); c.stroke();
        c.restore();
      });
      // okienko výdajne: pult pri dverách už má okno; ešte tabuľka s nápisom vedľa dverí
      if (loc.kind === 'outlet') { const d = loc.doorList[0]; if (d) { c.save(); c.translate(d.lx, d.lz); c.fillStyle = '#f2c230'; if (d.side === 'N' || d.side === 'S') c.fillRect(1.2, -0.12, 1.4, 0.24); else c.fillRect(-0.12, 1.2, 0.24, 1.4); c.restore(); } }
      if (loc.canopy) { c.save(); c.globalAlpha = 0.18; c.fillStyle = '#000'; c.fillRect(loc.canopy.x - loc.x - loc.canopy.w / 2 + 0.8, loc.canopy.z - loc.z - loc.canopy.d / 2 + 1, loc.canopy.w, loc.canopy.d); c.restore(); }
    }
    c.restore();
  }
  function drawFiller(c, f) {
    c.save(); c.translate(f.x, f.z);
    shadowRect(c, -f.w / 2, -f.d / 2, f.w, f.d);
    c.fillStyle = PAT.concrete; c.fillRect(-f.w / 2, -f.d / 2, f.w, f.d); c.fillStyle = rgba(f.color, 0.35); c.fillRect(-f.w / 2, -f.d / 2, f.w, f.d);
    drawWalls(c, { w: f.w, d: f.d, kind: 'filler', doorList: [{ side: 'S', at: -f.w / 2 + 3 }] });
    c.restore();
  }

  // ============================================================
  //  MINIMAPA (640×440, 1 px = 1 m) – čistá GTA mapa
  // ============================================================
  function drawMini() {
    const cv = mk(W, H), c = cv.getContext('2d');
    c.fillStyle = '#1e2521'; c.fillRect(0, 0, W, H);
    // zastavané územie (charcoal) medzi diaľnicou a riekou
    c.fillStyle = '#1b1f24'; rrect(c, 0, 30, W, 352, 6); c.fill();
    FIELDS.forEach((f) => { c.save(); c.translate(f.x, f.z); c.rotate(f.rot || 0); c.fillStyle = f.t === 'C' ? '#262320' : '#1f2a1f'; c.fillRect(-f.w / 2, -f.d / 2, f.w, f.d); c.restore(); });
    const park = M.locs.park;
    c.fillStyle = '#2f6b3a'; rrect(c, park.x - park.w / 2, park.z - park.d / 2, park.w, park.d, 8); c.fill();
    strokePoly(c, RIVER.pts, RIVER.w, '#2b4f73');
    park.interior.filter((f) => f.type === 'pond').forEach((f) => { c.beginPath(); c.ellipse(f.x, f.z, f.w / 2, f.d / 2, 0, 0, Math.PI * 2); c.fillStyle = '#2b4f73'; c.fill(); });
    M.lots.forEach((lt) => { c.save(); c.translate(lt.x, lt.z); c.rotate(lt.rot || 0); c.fillStyle = '#3a4046'; c.fillRect(-lt.w / 2, -lt.d / 2, lt.w, lt.d); c.restore(); });
    M.paths.forEach((p) => strokePoly(c, p.pts, 2, '#4a5056'));
    ROADS.forEach((rd) => strokePoly(c, rd.pts, rd.w * 1.2 + 3, '#2c3137', rd.loop));
    ROADS.forEach((rd) => strokePoly(c, rd.pts, rd.w * 1.2, rd.kind === 'hwy' ? '#d9c98a' : rd.kind === 'main' ? '#cfd3d8' : '#b9bec4', rd.loop));
    FILLERS.forEach((f) => { c.fillStyle = '#596069'; c.fillRect(f.x - f.w / 2, f.z - f.d / 2, f.w, f.d); });
    const KEY = { byt: '#f2b84b', kuchyna: '#d64545', bistro: '#f28c3d', skolka: '#f07fb0', pumpa: '#4caf50', metro: '#7fb3e8', posta: '#e8d44c', pohotovost: '#ff6b6b', babka: '#c9a27a', ex: '#b48cd6', nina: '#ff9ad5', krcma: '#b5703a', riso: '#8fa0b4', veterinar: '#8fd1a8', zamocnik: '#c8c8c8', servis: '#9aa6b2' };
    M.locList.forEach((loc) => {
      if (loc.kind === 'park') return;
      c.save(); c.translate(loc.x, loc.z); c.rotate(loc.rot || 0);
      if (loc.kind === 'outlet') { c.fillStyle = '#ffffff'; c.fillRect(-loc.w / 2, -loc.d / 2, loc.w, loc.d); }
      else { c.fillStyle = KEY[loc.id] || '#596069'; c.fillRect(-loc.w / 2, -loc.d / 2, loc.w, loc.d); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.strokeRect(-loc.w / 2, -loc.d / 2, loc.w, loc.d); }
      c.restore();
    });
    // most: tenké okraje
    ROADS.filter((r) => r.bridge).forEach((rd) => { const seg = rd.pts.filter((p) => Math.abs(p.z - riverZ(p.x)) < RIVER.w / 2 + 4); if (seg.length > 1) [1, -1].forEach((s) => strokePoly(c, offsetPoly(seg, s * (rd.w * 0.6 + 1), false), 1.5, '#8a9099')); });
    return cv;
  }

  // ---------- názvy ciest / debug ----------
  M.roadById = (id) => ROADS.find((r) => r.id === id) || null;
  M.hsList = () => Object.keys(M.hs).map((k) => M.hs[k]);
  M.outletLoc = (i) => M.locs[G.outletId ? G.outletId(i) : 'outlet_' + i] || null;
})();
