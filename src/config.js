// Základné nastavenia hry v2 – mená a čísla sa dajú meniť tu.
window.G = window.G || {};
G.CFG = {
  hero: 'Paťo',
  kid: 'Nelka', kidGen: 'Nelky', kidAcc: 'Nelku', kidDat: 'Nelke', kidIns: 'Nelkou',
  dog: 'Bundáš', dogGen: 'Bundáša', dogDat: 'Bundášovi', dogIns: 'Bundášom',
  bistro: 'Bistro',
  kitchen: 'Centrálna kuchyňa',
  W: 640, H: 440,               // veľkosť mapy v metroch (x, z) – v3 kompaktná
  walk: 8.5, run: 13.5,         // m/s (rýchly chaos)
  carMax: 52, carOffroad: 26, carAccel: 26, carBrake: 38, carReverse: 12,
  tankL: 45,                    // nádrž Fabie (litre)
  fuelPerM: 45 / (2.5 * 25000), // plná nádrž vydrží ~2,5 herného dňa (~25 km/deň na malej mape)
  fuelPrice: 1.629,
  reserveFrac: 0.15,
  timeScale: 0.65,              // herné minúty za reálnu sekundu (časť dňa ≈ 5 min)
  timeScaleSeg: 0.65, timeScaleFull: 0.9,
  sessionMode: 'random',        // random | rano | dopoludnie | obed | popoludnie | vecer | noc | full
  dayStart: 6 * 60 + 30,
  dayEnd: 23 * 60 + 59,
  eventsMin: 9, eventsMax: 13,  // náhodných udalostí za deň
  forgetFade: 80, forgetTime: 180,
  notes: 3,
  saveKey: 'patova-hra-friends-v1',
  showRoles: true,             // true = menovky s rolou nad postavami + „Kto je kto“ v pauze (zapína ho tools/make_friends.py)
  zoomFoot: 22, zoomCar: 7.5,   // px na meter (2D renderer)
  actorScale: 2.8,              // postavy väčšie než fyzicky (ako v1, čitateľnosť); pes dostáva polovicu
};
G.DAYS = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
G.NAMES = {
  bosses: ['Boris', 'Hanka', 'Ondro'],
  colleagues: ['Peter', 'Tomáš'],
  kitchen: ['Wayan', 'Tunde', 'Santi', 'Honza'],
  origin: { Wayan: 'Bali', Tunde: 'Nigéria', Santi: 'Kolumbia', Honza: 'Česko' },
  bistro: ['Dana', 'Lenka'],
  ex: 'Ex', exName: 'Simona',
  sidechick: 'Katka',
  babka: 'Babka',
  teacher: 'pani učiteľka',
  outlets: ['Trenčianska', 'Nám. slobody', 'Jégého', 'Továrenská FT', 'Tobrucká', 'MILLHAUS',
            'Herlianska', 'Lenardova', 'Digital Park', 'Poľná FT', 'Trnava', 'Trenčín'],
};
// id výdajní: outlet_0 .. outlet_11 v poradí G.NAMES.outlets; hotspoty vydaj_0 .. vydaj_11
G.outletId = i => 'outlet_' + i;

// ---- Roly postáv (kľúč = zobrazené meno; tools/make_friends.py premenúva kľúče spolu s menami) ----
G.ROLES = {
  Boris: 'ŠÉF', Hanka: 'ŠÉFKA', Ondro: 'MAJITEĽ',
  Dana: 'ČAŠNÍČKA', Lenka: 'ČAŠNÍČKA',
  Wayan: 'KUCHÁR', Tunde: 'KUCHÁR', Santi: 'KUCHÁR', Honza: 'KUCHÁR',
  Peter: 'KOLEGA (ŠOFÉR)', Tomáš: 'KOLEGA (ŠOFÉR)',
  Simona: 'EX', Katka: 'PRIATEĽKA', Dodo: 'KAMOŠ',
  Gabika: 'ÚČTOVNÍČKA', Fero: 'SERVISÁK', Hájek: 'MAJITEĽ KRČMY', Radoš: 'NOVÝ EXKY',
  Ľubo: 'SUSED', Babka: 'BABKA', Juro: 'HOLIČ', Viliam: 'MÄSIAR',
  Nelka: 'DCÉRA', Bundáš: 'PES',
};
G.ROLES[G.NAMES.teacher] = 'UČITEĽKA';
G.ROLES['Pani učiteľka'] = 'UČITEĽKA';
G.ROLES[G.CFG.kid] = 'DCÉRA'; G.ROLES[G.CFG.dog] = 'PES';
// NPC id → meno (pre menovky nad postavami)
G.NPC_NAME = {
  joff: G.NAMES.bosses[0], miska: G.NAMES.bosses[1], simon: G.NAMES.bosses[2],
  tamara: G.NAMES.bistro[0], lucia: G.NAMES.bistro[1],
  agus: G.NAMES.kitchen[0], ayo: G.NAMES.kitchen[1], fredy: G.NAMES.kitchen[2], benji: G.NAMES.kitchen[3],
  lukas: G.NAMES.colleagues[0], matus: G.NAMES.colleagues[1],
  ucitelka: G.NAMES.teacher, babka: G.NAMES.babka, ex: G.NAMES.exName, nina: G.NAMES.sidechick, riso: 'Dodo',
};
// rola podľa mena (znáša „Fero (servis)“, „Holič Juro“ ap.)
G.roleOf = function (name) {
  if (!name) return '';
  const R = G.ROLES;
  if (R[name]) return R[name];
  const base = String(name).replace(/\s*\(.*\)\s*$/, '').trim();
  if (R[base]) return R[base];
  const parts = base.split(/\s+/);
  for (const w of parts) if (R[w]) return R[w];
  return '';
};
// „Kto je kto“ v pauze: [meno, krátky popis] (roly sa berú z G.ROLES)
G.WHO = [
  ['Boris', 'chce čísla, tržby a odpovede hneď'],
  ['Hanka', 'šéfka cateringu; mlčí horšie než kričí'],
  ['Ondro', 'majiteľ firmy; ochutnáva a mlčí'],
  ['Wayan', 'kuchyňa; sambal z domu'],
  ['Tunde', 'kuchyňa; vždy „Boss, no gas“'],
  ['Santi', 'kuchyňa; „¡Jefe!“ a arepas'],
  ['Honza', 'kuchyňa; hovorí po česky'],
  ['Dana', 'bistro; drží linku, keď ty nie'],
  ['Lenka', 'bistro; tichšia, ale vidí všetko'],
  ['Peter', 'vozí jedlo; občas nabúra dodávku'],
  ['Tomáš', 'vozí jedlo; nedvíha, „jasné“'],
  ['Simona', 'bývalá; mama Nelky, vždy s plánom'],
  ['Katka', 'tvoja priateľka; večere a nervy'],
  ['Dodo', 'kamoš; vždy „jedno pivo“'],
  ['Gabika', 'účtovníčka; chce bločky DNES'],
  ['Fero', 'servisák; Fabia je jeho stály zákazník'],
  ['Hájek', 'majiteľ krčmy U Hájka'],
  ['Radoš', 'nový chlap Simony; fitness'],
  ['Ľubo', 'sused; gril, hudba a narodeniny'],
  ['Babka', 'tvoja mama; „Paťko, a kto bude s dieťaťom?“'],
  ['Nelka', 'tvoja dcéra; zajačik je dôležitý'],
  ['Bundáš', 'pes; žerie plyšáky a ponožky'],
];
