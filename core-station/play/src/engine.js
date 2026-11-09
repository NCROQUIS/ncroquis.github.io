/* Station Zero — battle engine v2 (growth restructure). Pure logic, fixed tick, seeded RNG. No DOM. */
(function (root) {
  const TICK = 1 / 30;
  const WAVE_SEC = 20;
  const RUN_CAP_GAME_SEC = 15 * 60 * 2; // 15 real minutes at the default 2x
  const STATION_R = 7, SPAWN_R = 108;
  const TUNE = { hpG: 1.05, hpG2: 1.04, atkG: 1.04, energyG: 1.0, late: 25, hpMul: 1.55, rateStep: 0.04, inrunG: 1.35, regenAbs: 0, polyK: 0.07, polyP: 1.3, swarm: 2.5, rush: 0.4, spdG: 0.005, spdMax: 1.6, rangedG: 0.002, hullBase: 80, regenPct: 0.0015, regenG: 0.4 }; // hull 80 + slow regen: chip damage sticks, so the hull drains from wave 2 instead of collapsing at wave 9-10 // rush + light speed/ranged growth (6-seed auto-play keeps ≈+1.8 waves per level over Lv0-30) // v2: polynomial shipyard effects — ≈+2 waves/level to Lv20, then flattening (6-seed auto-play)

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- shipyard (permanent): effects grow polynomially, like The Tower workshop ----
  const poly = L => Math.pow(1 + TUNE.polyK * L, TUNE.polyP);
  const STATS = [
    { id: 'dmg',    tab: 'atk', name: '공격력',    base: 1.0, desc: L => `${(4 * poly(L)).toFixed(1)}` },
    { id: 'rate',   tab: 'atk', name: '공격 속도',  base: 1.2, desc: L => `${(1.2 * (1 + TUNE.rateStep * L)).toFixed(2)}/초` },
    { id: 'crit',   tab: 'atk', name: '치명타 확률', base: 1.5, desc: L => `${Math.round(Math.min(60, 5 + L))}%` },
    { id: 'range',  tab: 'atk', name: '사거리',     base: 1.2, desc: L => `${Math.round(40 + L)}` },
    { id: 'hull',   tab: 'def', name: '체력',      base: 1.0, desc: L => `${Math.round(TUNE.hullBase * poly(L))}` },
    { id: 'regen',  tab: 'def', name: '체력 회복',  base: 1.2, desc: L => `${(TUNE.regenPct * 100 * (1 + TUNE.regenG * L)).toFixed(2)}%/초` },
    { id: 'armor',  tab: 'def', name: '방어력',    base: 1.5, desc: L => `${Math.min(50, L)}%` },
    { id: 'energy', tab: 'utl', name: '에너지 획득량', base: 1.5, desc: L => `+${5 * L}%` },
    { id: 'datab',  tab: 'utl', name: '데이터 획득량', base: 2.0, desc: L => `+${3 * L}%` }
  ];
  const statCost = (id, L) => {
    const s = STATS.find(x => x.id === id);
    return Math.ceil(s.base * Math.pow(L + 1, 1.5));
  };

  // ---- research (real time) ----
  const RESEARCH = [
    { id: 'cap',   name: '최대 레벨 +1', desc: n => `업그레이드 최대 레벨 +1 (현재 ${20 + n})` },
    { id: 'econ',  name: '데이터 수입 증가',   desc: n => `데이터 수입 +3% (현재 +${3 * n}%)` },
    { id: 'start', name: '시작 에너지',     desc: n => `시작 에너지 +15 (현재 ${15 * n})` },
    { id: 'patrol', name: '방치 시간 늘리기',    max: 8, desc: n => `방치 보상 최대 시간 +1시간 (현재 ${4 + n}시간)` }
  ];
  const researchCost = n => Math.ceil(8 * n * n); // data cost for research level n
  const CELL_MINUTES = 20; // one energy cell shortens a running research by 20 minutes
  const RESEARCH_HOURS = n => 3.2 * n * Math.min(1, Math.pow(n / 8, 2)); // balance sheet v4: Lv1 3min, Lv2 24min, Lv3 81min, Lv4 3.2h, Lv8+ 3.2×n h

  // ---- enhancement (2nd layer, data sink): ×(1 + 1% per level), exponential cost ----
  const ENH = [
    { id: 'dmg',  name: '공격력 강화', desc: L => `공격력 ×${(1 + 0.01 * L).toFixed(2)}` },
    { id: 'hull', name: '체력 강화',   desc: L => `체력 ×${(1 + 0.01 * L).toFixed(2)}` },
    { id: 'data', name: '데이터 강화', desc: L => `데이터 ×${(1 + 0.01 * L).toFixed(2)}` }
  ];
  const ENH_UNLOCK_WAVE = 40, ENH_MAX = 100;
  const enhCost = L => Math.ceil(2000 * Math.pow(1.17, L));

  // ---- in-run ----
  // in-run upgrades bought with energy, grouped in three tabs like the permanent upgrades (fold-up sheet in the battle screen).
  // per = effect of one level, k = cost factor. core = what '자동 강화' buys (the original four, so auto-play balance stays put).
  const INRUN = [
    { id: 'dmg',    tab: 'atk', name: '공격력',      per: 12, unit: '%',  k: 1,   core: true },
    { id: 'rate',   tab: 'atk', name: '공격 속도',   per: 6,  unit: '%',  k: 1,   core: true },
    { id: 'crit',   tab: 'atk', name: '치명타 확률', per: 1,  unit: '%p', k: 3 },
    { id: 'range',  tab: 'atk', name: '사거리',      per: 1,  unit: '',   k: 3 },
    { id: 'hull',   tab: 'def', name: '체력',        per: 12, unit: '%',  k: 1,   core: true },
    { id: 'regen',  tab: 'def', name: '체력 회복',   per: 12, unit: '%',  k: 1,   core: true },
    { id: 'armor',  tab: 'def', name: '방어력',      per: 1,  unit: '%p', k: 3 },
    { id: 'energy', tab: 'utl', name: '에너지 획득량', per: 8, unit: '%', k: 2.5 },
    { id: 'datab',  tab: 'utl', name: '데이터 획득량', per: 2, unit: '%', k: 5 }
  ];
  const INRUN_K = Object.fromEntries(INRUN.map(u => [u.id, u.k]));
  const inrunCost = (lv, id) => Math.ceil(8 * (INRUN_K[id] || 1) * Math.pow(TUNE.inrunG, lv));
  // 2026-11-08 (Galaxy Defense style): energy no longer buys these directly. Kills fill an energy bar; when it is full the
  // battle pauses and offers 3 cards (weapons from the deck, stat boosts below, tactical cards). A stat card adds `n` levels of INRUN.
  const STAT_CARD = { dmg: 2, rate: 2, hull: 2, regen: 2, crit: 3, range: 3, armor: 2, energy: 2, datab: 2 };
  const CARD_NEED = { base: 6, g: 1.2 }; // energy for the k-th card = base × g^k (× wave energy growth)
  const ADVERSITY = { at: [40, 80, 120], crowd: 12, hullPct: 0.5 }; // game seconds (≈20/40/60 real s at 2x): if the swarm is piling up, a free card
  // weapons: 4 of these go in the deck before a sortie; in battle a card gives Lv1, more cards raise it to Lv5 (Lv3 and Lv5 change how it works).
  // damage scales off the main gun (d.dmg), so permanent upgrades carry over; mastery (data, HQ) adds +8% per level.
  const WEAPONS = [
    { id: 'bolt',    name: '번개',     unlock: 0,  desc: '적에게 번개를 내리꽂아요', evo3: '연쇄 번개: 옆 적 2기로 튀어요', evo5: '과부하: 맞은 적이 잠깐 멈춰요' },
    { id: 'beam',    name: '빔',       unlock: 0,  desc: '가까운 적을 계속 태워요', evo3: '굴절: 옆 적 2기에도 닿아요', evo5: '고출력: 빔 피해 ×1.6' },
    { id: 'hive',    name: '벌집',     unlock: 0,  desc: '적을 쫓는 말벌 드론을 날려요', evo3: '쌍둥이 말벌: 2기씩', evo5: '여왕벌: 3기씩, 더 빠르게' },
    { id: 'field',   name: '교란장',   unlock: 0,  desc: '정거장 둘레 적을 느리게 하고 태워요', evo3: '위상 고정: 안에선 위상 포식자가 숨지 못해요', evo5: '확장: 범위 +30%' },
    { id: 'wheel',   name: '화염 바퀴', unlock: 15, desc: '정거장 둘레를 도는 화염 원반', evo3: '두 바퀴: 원반 2개', evo5: '세 바퀴: 원반 3개, 더 크게' },
    { id: 'missile', name: '미사일',   unlock: 25, desc: '적 무리에 폭발 미사일을 쏴요', evo3: '2연장: 2발씩', evo5: '3연장: 3발씩, 폭발 범위 +40%' }
  ];
  // 2026-11-09: every core goes to Lv5 and changes twice — Lv3 '각성', Lv5 '완전 각성' (weapons: their evo3 / evo5)
  const AWAKE3 = { battery: '각성: 쌍열 포탑, 두 적을 동시에', hangar: '각성: 요격기 +1기', shield: '각성: 맞으면 2초 방어막 (15초마다)', collector: '각성: 에너지 +25% 더',
    amplifier: '각성: 맞닿은 코어 +35%', repair: '각성: 보스 웨이브를 넘기면 체력 30% 회복', link: '각성: 연결 무기 위력 ×1.5 더' };
  const AWAKE5 = { battery: '완전 각성: 세 적을 동시에', hangar: '완전 각성: 요격기 +2기', shield: '완전 각성: 방어막 3초, 10초마다', collector: '완전 각성: 데이터 +25% 더',
    amplifier: '완전 각성: 맞닿은 코어 +50%', repair: '완전 각성: 회복량 2배', link: '완전 각성: 위 2개 무기에 연결' };
  const AWAKE_TEXT = AWAKE3;
  const awakeText = (id, lv) => { const W = WEAPONS.find(w => w.id === id); return lv >= 5 ? (W ? '완전 각성: ' + W.evo5 : AWAKE5[id]) : (W ? '각성: ' + W.evo3 : AWAKE3[id]); };
  const WEAPON_MAX = 5, MASTERY_MAX = 10, DECK_SIZE = 6, DEFAULT_DECK = ['battery', 'hangar', 'bolt', 'field'];
  const masteryCost = L => Math.ceil(30 * Math.pow(L + 1, 1.7)); // data to raise a weapon's mastery from L to L+1
  // core research (2026-11-09): four cores to start; the rest are unlocked with data in HQ, then picked into the sortie deck (6)
  const CORE_UNLOCK = { battery: 0, hangar: 0, bolt: 0, field: 0, shield: 40, beam: 80, collector: 140, hive: 220, amplifier: 320, wheel: 450, repair: 620, missile: 850, link: 1150 };
  const CORE_ORDER = Object.keys(CORE_UNLOCK);
  const weaponUnlocked = (save, id) => !!WEAPONS.find(x => x.id === id) && (CORE_UNLOCK[id] === 0 || !!(save.coreUnlocked && save.coreUnlocked[id]));

  const CARDS = [
    { id: 'overcharge', name: '과충전 탄두',  text: '공격력 +25%' },
    { id: 'rapid',      name: '속사 회로',    text: '공격 속도 +20%' },
    { id: 'scope',      name: '치명 조준경',  text: '치명타 확률 +10%p' },
    { id: 'plating',    name: '보강 장갑',    text: '최대 체력 +30%, 즉시 회복' },
    { id: 'chain',      name: '연쇄 번개',    text: '치명타 시 주변 1기에 50% 피해' },
    { id: 'thorns',     name: '반격 실드',    text: '받은 접촉 피해의 30% 반사' },
    { id: 'coolant',    name: '무기 냉각기',  text: 'EMP·레일건 재충전 -20%' },
    { id: 'harvest',    name: '데이터 수집기', text: '이번 판 데이터 +20%' },
    { id: 'optics',     name: '사거리 확장',  text: '사거리 +15%' },
    { id: 'pierce',     name: '관통탄',      text: '투사체가 적 1기를 관통' }
  ];

  // ---- station structure: hex slots hold function tiles; orbitals join once the ring is complete ----
  const TAU = Math.PI * 2;
  const tileMul = L => 1 + 0.15 * (Math.max(1, L) - 1);
  const TILE_TYPES = [
    { id: 'hangar',    name: '격납고', col: '#ffd166', desc: L => `요격기 2기 출격 · 방어 구역 안 추격 · 사격 피해 주포의 ${Math.round(25 * tileMul(L))}%` },
    { id: 'battery',   name: '포대',   col: '#6fd3ff', desc: L => `보조 포대 · 가장 먼 적부터 · 피해 주포의 ${Math.round(40 * tileMul(L))}%` },
    { id: 'shield',    name: '방벽',   col: '#8fa2ff', desc: L => `체력 +${Math.round(8 * tileMul(L))}% · 체력 회복 +${Math.round(10 * tileMul(L))}% · 방어력 +2%p` },
    { id: 'collector', name: '수집기', col: '#c8fff0', desc: L => `에너지 +${Math.round(12 * tileMul(L))}% · 데이터 +${Math.round(6 * tileMul(L))}%` },
    // in-run cores (2026-11-08): three more kinds that make placement a small puzzle
    { id: 'amplifier', name: '증폭기', col: '#d9c2ff', desc: L => `맞닿은 코어 효과 +${Math.round(20 * tileMul(L))}%` },
    { id: 'repair',    name: '수리',   col: '#8dffcf', desc: L => `3초마다 최대 체력 ${(1 * tileMul(L)).toFixed(1)}% 회복` },
    { id: 'link',      name: '무기 연결', col: '#ffb3e0', desc: L => `가장 높은 레벨의 무기 코어 위력 +${Math.round(20 * tileMul(L))}%` }
  ];
  // weapons are cores too (2026-11-09): they sit in a slot like the rest; a kind's level is its highest core, its power the sum of its cores
  const WCOL0 = { bolt: '#9fd8ff', beam: '#ff7ad9', hive: '#b6ff6a', field: '#9ea8ff', wheel: '#ff9f43', missile: '#ff6a4d' };
  for (const W of WEAPONS) TILE_TYPES.push({ id: W.id, name: W.name, col: WCOL0[W.id], weapon: true, desc: () => W.desc });
  TILE_TYPES.sort((a, b) => CORE_ORDER.indexOf(a.id) - CORE_ORDER.indexOf(b.id));
  // 2026-11-08: the station grows inside a run. HQ slots became 'start cores' (pre-attached each sortie, 3 at most);
  // the rest of the ring is filled with core cards. The hull's slot layout is data so ships can bring other layouts later.
  const SLOT_WAVES = [8, 15, 22];               // best wave that opens each start-core slot
  const SLOT_ORDER = [1, 3, 5, 0, 2, 4];        // hex positions in unlock order: a triangle first, then the ring closes
  const ORBITAL_WAVES = [50, 65, 80];           // satellites join after the ring is complete (Luna recaptured)
  const TILE_MAX = 10;
  const tileCost = L => Math.ceil(12 * Math.pow(L + 1, 1.6)); // data to raise a core kind's research from L to L+1
  const HULLS = { core: { name: '기본 선체', slots: [0, 1, 2, 3, 4, 5] } }; // ring-1 positions this hull offers (outer ring: later, per ship)
  const CORE_MAX = 5, CORE_LV_MAX = 5;          // every core stacks to Lv5 (Lv3 각성, Lv5 완전 각성); the centre core overloads to Lv5
  const CORE_K = { lvAdd: 0.4, res: 0.10, same: 0.10, amp: 0.20, ampAwake: 0.35, ampFull: 0.50, attachHull: 0.04 };
  const coreOpen = (save, id) => id in CORE_UNLOCK && (CORE_UNLOCK[id] === 0 || !!(save.coreUnlocked && save.coreUnlocked[id]));
  // the sortie deck: every unlocked core while there are 6 or fewer, then the 6 the player picked in HQ
  function coreDeck(save) {
    const open = CORE_ORDER.filter(id => coreOpen(save, id));
    if (open.length <= DECK_SIZE) return open;
    const d = (save.coreDeck || []).filter(id => coreOpen(save, id)).slice(0, DECK_SIZE);
    for (const id of open) if (d.length < DECK_SIZE && !d.includes(id)) d.push(id);
    return d;
  }
  const ringNb = k => [(k + 1) % 6, (k + 5) % 6];  // ring-1 neighbours (both also touch the centre)
  // effect multiplier of each core: research level × 1.5^(lv-1) × neighbour bonus (same kind +10% each, amplifier +20%/+35%)
  function coreMul(save, tiles, k) {
    const t = tiles[k]; if (!t) return 0;
    let m = (1 + CORE_K.res * ((save.coreRes && save.coreRes[t.type]) || 0)) * (1 + CORE_K.lvAdd * (Math.min(t.lv, CORE_MAX) - 1)), nb = 0;
    for (const j of ringNb(k)) { const o = tiles[j]; if (!o) continue; if (o.type === t.type) nb += CORE_K.same; if (o.type === 'amplifier' && t.type !== 'amplifier') nb += o.lv >= 5 ? CORE_K.ampFull : o.lv >= 3 ? CORE_K.ampAwake : CORE_K.amp; }
    return m * (1 + nb);
  }
  const TILE_D = 8.7; // core → ring-1 tile center, world units (art draws the hull at STATION_R × 1.3)
  const slotPos = k => { const a = Math.PI / 6 + k * Math.PI / 3; return { x: Math.cos(a) * TILE_D, y: Math.sin(a) * TILE_D, a }; };
  const ORBIT = { a: 26, b: 14, tilt: -0.35, w: 1.2 };
  function orbitalPos(t, i, n) {
    const th = t * ORBIT.w + i * TAU / n, lx = Math.cos(th) * ORBIT.a, ly = Math.sin(th) * ORBIT.b;
    return { x: lx * Math.cos(ORBIT.tilt) - ly * Math.sin(ORBIT.tilt), y: lx * Math.sin(ORBIT.tilt) + ly * Math.cos(ORBIT.tilt), depth: Math.sin(th) };
  }
  const PROTO_TILES = { 1: 'hangar', 3: 'battery', 5: 'hangar' };
  function stationOf(save, b) {
    const tiles = [null, null, null, null, null, null];
    if (b && b.opts && b.opts.prologue) { for (let k = 0; k < 6; k++) tiles[k] = { type: k % 2 ? 'hangar' : 'battery', lv: 10, m: tileMul(10) }; return { tiles, open: 6, orbitals: 3, proto: false }; }
    if (b && b.module === 'proto' && !b.cores) { for (const k in PROTO_TILES) tiles[k] = { type: PROTO_TILES[k], lv: 1, m: 1, proto: true }; return { tiles, open: 3, orbitals: 0, proto: true }; }
    const best = save.best || 0, orbitals = ORBITAL_WAVES.filter(w => best >= w).length;
    if (b && b.cores) { // in a run: the cores attached so far, each with its effect multiplier
      b.cores.forEach((c, k) => { if (c) tiles[k] = { type: c.type, lv: c.lv, start: c.start }; });
      tiles.forEach((t, k) => { if (t) t.m = coreMul(save, tiles, k); });
      return { tiles, open: 6, orbitals, proto: false, coreLv: b.coreLv };
    }
    const open = SLOT_WAVES.filter(w => best >= w).length;
    const slots = (save.station && save.station.slots) || [];
    for (let i = 0; i < open; i++) if (slots[i] && slots[i].type && coreOpen(save, slots[i].type)) tiles[SLOT_ORDER[i]] = { type: slots[i].type, lv: 1, start: true };
    tiles.forEach((t, k) => { if (t) t.m = coreMul(save, tiles, k); });
    return { tiles, open, orbitals, proto: false };
  }

  // prologue finale timeline (seconds after wave 7 starts) and mothership placement in world units (station at 0,0)
  const MOTHER = { y0: -440, y1: -190, enter: 6.5, charge: 2.5, burn: 1.1, maw: 66 }; // giant: starts far above the screen and sinks in slowly (6.5 s, slow at both ends)

  // v2 has no sectors: each pair of new forms joins the waves after a boss (wave 10 / 20 / 30)
  const FOE_WAVE = { splitter: 11, volatile: 11, carapace: 21, mender: 21, brood: 31, stalker: 31 };
  const FOE_RULE = { share: 0.2, front: 0.5, frontCos: 0.4, blastR: 14, blastK: 3, healR: 26, healK: 0.12, healEvery: 1.6, layEvery: 3.2, hatch: 2.5, phase: 3.2, phaseVis: 2.2, menderPark: 22 };
  const BIG_FOE = { boss: 1, carapace: 1, brood: 1 };
  const ENEMY = {
    drone:   { hp: 3,  atk: 4,  spd: 14, r: 2.0, energy: 1 },
    meteor:  { hp: 10, atk: 10, spd: 7,  r: 3.4, energy: 2 },
    charger: { hp: 6,  atk: 14, spd: 22, r: 2.4, energy: 2 },
    shooter: { hp: 8,  atk: 6,  spd: 10, r: 2.6, energy: 3 },
    boss:    { hp: 90, atk: 25, spd: 5,  r: 7.0, energy: 20 },
    // swarm expansion (same forms as v3, 2026-11-06 sian 'swarm'): two new forms join after each 10-wave boss (FOE_WAVE)
    splitter: { hp: 5,  atk: 6,  spd: 10, r: 2.8, energy: 2 },   // 분열낭: bursts into 3 hatchlings when killed
    mini:     { hp: 0.8, atk: 2, spd: 18, r: 1.4, energy: 0.3 }, // hatchling (from splitter and eggs)
    volatile: { hp: 4,  atk: 18, spd: 13, r: 2.2, energy: 1 },   // 폭발 포자: big contact hit; shot down, it blasts the swarm around it
    carapace: { hp: 9,  atk: 12, spd: 6,  r: 3.2, energy: 4 },   // 갑각충: front plate takes 50% from shots coming from the station side
    mender:   { hp: 7,  atk: 4,  spd: 7,  r: 2.6, energy: 3 },   // 치유 해파리: hangs back and heals the swarm near it
    brood:    { hp: 14, atk: 16, spd: 4.5, r: 3.6, energy: 5 },  // 산란 어미: lays eggs that hatch into hatchlings
    egg:      { hp: 2,  atk: 0,  spd: 0,  r: 1.5, energy: 0.2 },
    stalker:  { hp: 5,  atk: 12, spd: 17, r: 2.4, energy: 3 }    // 위상 포식자: phases out now and then (untouchable while faded)
  };

  function derived(save, b) {
    const L = id => save.shipyard[id] || 0;
    const c = id => b ? (b.cardCount[id] || 0) : 0;
    const inr = id => b ? (b.inrun[id] || 0) : 0;
    const moduleMul = b && b.module === 'proto' ? 1.5 : 1;
    const st = stationOf(save, b), tsum = type => st.tiles.reduce((a, t) => a + (t && t.type === type ? t.m : 0), 0), tcount = type => st.tiles.filter(t => t && t.type === type).length;
    const topLv = type => st.tiles.reduce((a, t) => t && t.type === type && t.lv <= CORE_MAX ? Math.max(a, t.lv) : a, 0), awake = type => topLv(type) >= 3;
    const shieldM = tsum('shield'), collM = tsum('collector') * (awake('collector') ? 1.25 : 1), dataFull = topLv('collector') >= 5 ? 1.25 : 1;
    const coreLv = (b && b.coreLv) || 1, attached = b && b.cores ? b.cores.filter(Boolean).length : 0;
    const enh = id => 1 + 0.01 * ((save.enh && save.enh[id]) || 0);
    const hullMax = TUNE.hullBase * poly(L('hull')) * enh('hull') * (1 + 0.12 * inr('hull')) * (1 + 0.3 * c('plating')) * (1 + 0.08 * shieldM) * (1 + 0.1 * (coreLv - 1)) * (1 + CORE_K.attachHull * attached);
    const out = {
      dmg: 4 * poly(L('dmg')) * enh('dmg') * (1 + 0.12 * inr('dmg')) * (1 + 0.25 * c('overcharge')) * moduleMul * (1 + 0.15 * (coreLv - 1)),
      rate: Math.min(12, 1.2 * (1 + TUNE.rateStep * L('rate')) * (1 + 0.06 * inr('rate')) * (1 + 0.2 * c('rapid'))),
      crit: Math.min(0.75, 0.05 + 0.01 * L('crit') + 0.01 * inr('crit') + 0.1 * c('scope')),
      range: (40 + L('range') + inr('range')) * (1 + 0.15 * c('optics')),
      hullMax,
      regen: (TUNE.regenAbs ? TUNE.regenAbs * (1 + 0.15 * L('regen')) : hullMax * TUNE.regenPct * (1 + TUNE.regenG * L('regen'))) * (1 + 0.12 * inr('regen')) * (1 + 0.1 * shieldM),
      armor: Math.min(0.6, 0.01 * L('armor') + 0.01 * inr('armor') + 0.02 * tcount('shield')),
      energyMul: (1 + 0.05 * L('energy')) * (1 + 0.08 * inr('energy')) * (1 + 0.12 * collM),
      dataMul: enh('data') * (1 + 0.03 * L('datab')) * (1 + 0.03 * (save.research.levels.econ || 0)) * (1 + 0.2 * c('harvest')) * (1 + 0.06 * collM) * (1 + 0.02 * inr('datab')) * dataFull,
      cdMul: Math.pow(0.8, c('coolant')),
      pierce: c('pierce'), chain: c('chain'), thorns: c('thorns'),
      repair: hullMax * 0.01 / 3 * tsum('repair') * (topLv('repair') >= 5 ? 2 : 1), link: tsum('link'), linkAwake: awake('link'), linkFull: topLv('link') >= 5, shieldAwake: awake('shield'), shieldFull: topLv('shield') >= 5, repairAwake: awake('repair'),
      shots: coreLv >= 5 ? 3 : coreLv >= 3 ? 2 : 1, hangarAwake: awake('hangar'), batteryAwake: awake('battery')
    };
    if (b && b.opts && b.opts.prologue) Object.assign(out, { dmg: 400, rate: 12, crit: 0.5, range: 95, hullMax: 5000, regen: 0, armor: 0, pierce: 2, chain: 1, cdMul: 1 });
    return out;
  }

  class Battle {
    constructor(save, opts) {
      this.save = save;
      this.opts = Object.assign({ seed: 1, tutorial: false, prologue: false, headless: false, autoUpgrade: false, autoWeapons: false }, opts);
      this.waveSec = this.opts.prologue ? 3 : this.opts.tutorial ? 12 : WAVE_SEC; // tutorial waves are short so the first minute is dense
      this.rng = mulberry32(this.opts.seed >>> 0);
      this.t = 0; this.wave = 1; this.waveT = 0;
      this.enemies = []; this.projs = []; this.bullets = [];
      this.inrun = Object.fromEntries(INRUN.map(u => [u.id, 0]));
      this.cardCount = {}; this.cardsTaken = [];
      // weapons in this run: deck from the save (tutorial/prologue: default), levels start at 0 (not owned)
      this.deck = this.opts.tutorial || this.opts.prologue ? DEFAULT_DECK.slice() : coreDeck(save); // core kinds that can show up as cards this run
      this.wlv = {}; this.wsum = {};
      this.wst = { bolt: { t: 1 }, beam: { t: 0, tgts: [] }, hive: { t: 1.5 }, field: { t: 0 }, wheel: { a: 0 }, missile: { t: 2 } };
      this.picks = 0; this.need = CARD_NEED.base; this.advDone = 0;
      // in-run cores: the start cores from HQ are pre-attached; core cards attach or stack the rest (not in the tutorial/prologue)
      this.coreLv = 1; this.barrierT = 0; this.barrierCd = 0;
      if (!this.opts.tutorial && !this.opts.prologue) {
        this.hull_ = HULLS[save.hull] || HULLS.core;
        this.cores = [null, null, null, null, null, null];
        stationOf(save, null).tiles.forEach((t, k) => { if (t && this.hull_.slots.includes(k)) this.cores[k] = { type: t.type, lv: 1, start: true }; });
      }
      this.module = null; // 'proto' during tutorial
      this.weapons = {
        rail: { unlocked: !this.opts.tutorial || this.opts.prologue, cd: 0, max: this.opts.prologue ? 2.5 : 25 },
        emp:  { unlocked: this.opts.prologue || (!this.opts.tutorial && (save.best || 0) >= 20), cd: 0, max: this.opts.prologue ? 7 : 40 }
      };
      this.energy = 15 * (save.research.levels.start || 0);
      this.data = 0; this.kills = 0; this.cells = 0;
      this.spawnPlan = []; this.fireT = 0;
      this.events = []; this.over = false; this.reason = null; this.paused = false;
      this.planetCleared = false;
      const d = derived(save, this);
      this.hull = d.hullMax; this.d = d;
      this.craft = []; this.batteries = []; this.orbitals = 0;
      this.setupStation();
      this.planWave();
    }
    refresh() {
      const old = this.d.hullMax;
      this.d = derived(this.save, this);
      if (this.d.hullMax > old) this.hull += this.d.hullMax - old;
      this.setupStation();
      this.wlv = {}; this.wsum = {}; // weapon cores: level = highest core of that kind, power = sum of their effect multipliers
      if (this.station) this.station.tiles.forEach(t => { if (t && WCOL0[t.type]) { this.wlv[t.type] = Math.max(this.wlv[t.type] || 0, t.lv); this.wsum[t.type] = (this.wsum[t.type] || 0) + t.m; } });
    }
    // build interceptors / batteries / orbitals from the current tiles; existing craft keep flying
    setupStation() {
      const st = stationOf(this.save, this); this.station = st;
      const want = [];
      st.tiles.forEach((t, k) => { if (t && t.type === 'hangar') for (let j = 0; j < (t.lv <= CORE_MAX ? (t.lv >= 5 ? 4 : t.lv >= 3 ? 3 : 2) : 2); j++) want.push({ k, j, lv: t.lv, m: t.m }); });
      const old = this.craft;
      this.craft = want.map(w => {
        const o = old.find(c => c.k === w.k && c.j === w.j); if (o) { o.lv = w.lv; o.m = w.m; return o; }
        const p = slotPos(w.k); if (!this.opts.headless) this.events.push({ type: 'launch', x: p.x, y: p.y });
        return { k: w.k, j: w.j, lv: w.lv, m: w.m, x: p.x, y: p.y, vx: Math.cos(p.a) * 40, vy: Math.sin(p.a) * 40, ang: p.a, cd: 0.4 + 0.3 * w.j, tgt: null };
      });
      const oldB = this.batteries;
      this.batteries = []; st.tiles.forEach((t, k) => { if (t && t.type === 'battery') { const o = oldB.find(x => x.k === k); this.batteries.push({ k, lv: t.lv, m: t.m, twin: t.lv >= 3 && t.lv <= CORE_MAX, triple: t.lv >= 5 && t.lv <= CORE_MAX, fireT: o ? o.fireT : 0.15 * k, aim: o ? o.aim : slotPos(k).a }); } });
      this.orbitals = st.orbitals;
    }
    scale(w) { return Math.pow(TUNE.hpG, w - 1) * Math.pow(TUNE.hpG2, Math.max(0, w - TUNE.late)); }
    planWave() {
      const w = this.wave, plan = [];
      if (this.opts.prologue) { // a swarm the endgame station shreds
        for (let i = 0; i < 72; i++) plan.push({ at: (i / 72) * 2.8, type: i % 6 === 0 ? 'meteor' : i % 9 === 0 ? 'charger' : 'drone' });
        this.spawnPlan = plan; return; // the finale is the scripted giant mothership (see step), not a boss enemy
      }
      if (this.opts.tutorial && w <= 3) { // dense, one-shot drones so the first seconds feel alive
        const n0 = 14 + 4 * w;
        for (let i = 0; i < n0; i++) plan.push({ at: (i / n0) * 10, type: 'drone' });
        this.spawnPlan = plan; return;
      }
      const n = Math.round((6 + 0.8 * (w - 1)) * TUNE.swarm); // denser waves of weaker enemies: same total threat, more on screen
      // part of each wave (from wave 6) arrives together as a 3-way rush at 10s: one moment per wave where the screen fills up
      const nRush = w >= 6 ? Math.round(n * TUNE.rush * Math.min(1, 0.4 + (w - 6) * 0.05)) : 0, nPack = n - nRush; // rush grows from 16% to 40% of the wave
      const PACK = 7, packs = Math.max(1, Math.ceil(nPack / PACK)); // the rest arrive in packs from one direction
      const shooterShare = Math.min(0.35, (w >= 12 ? 2 / 12 : 0) + TUNE.rangedG * Math.max(0, w - 12)); // ranged enemies grow later, so range alone stops winning
      const nf = (this.opts.tutorial || this.opts.prologue) ? [] : Object.keys(FOE_WAVE).filter(t => w >= FOE_WAVE[t]);
      const pick = () => {
        if (nf.length && this.rng() < FOE_RULE.share) { let k = this.rng() * nf.reduce((a, t) => a + (t === 'brood' ? 0.5 : 1), 0); for (const t of nf) { k -= t === 'brood' ? 0.5 : 1; if (k <= 0) return t; } return nf[nf.length - 1]; }
        if (this.rng() < shooterShare) return 'shooter';
        const roll = this.rng() * (w >= 3 ? 10 : 8);
        return roll < 5 ? 'drone' : roll < 8 ? 'meteor' : 'charger';
      };
      for (let i = 0; i < nPack; i++) {
        const type = pick(), p = Math.floor(i / PACK);
        plan.push({ at: (p / packs) * 15 + (i % PACK) * 0.12, type: (type === 'meteor' && i % 3) ? 'drone' : type, pack: p });
      }
      this.packAng = Array.from({ length: packs + 3 }, () => this.rng() * Math.PI * 2);
      if (nRush) {
        plan.push({ at: 9.6, type: 'rushwarn' });
        for (let i = 0; i < nRush; i++) { const type = pick(); plan.push({ at: 10 + (i % 12) * 0.1, type: (type === 'meteor' && i % 2) ? 'drone' : type, pack: packs + (i % 3) }); }
      }
      plan.sort((x, y) => x.at - y.at);
      if (w % 10 === 0) plan.unshift({ at: 0, type: 'boss' });
      this.spawnPlan = plan;
    }
    spawn(type, pack, at) {
      const E = ENEMY[type], s = this.scale(this.wave);
      const a = at ? Math.atan2(at.y, at.x) : (pack !== undefined && this.packAng) ? this.packAng[pack] + (this.rng() - 0.5) * 0.5 : this.rng() * Math.PI * 2;
      let hpMul = 1, atkMul = 1;
      const dil = (!this.opts.prologue && !(this.opts.tutorial && this.wave <= 3) && type !== 'boss') ? 1 / TUNE.swarm : 1; // split the wave's threat across more bodies
      if (this.opts.prologue) { hpMul = type === 'boss' ? 400 : 6; atkMul = type === 'boss' ? 1 : 0.05; }
      else if (this.opts.tutorial) { // gentle first minutes, then a scripted first destruction
        if (this.wave >= 13) { hpMul = 3; atkMul = 1.6; } else if (this.wave <= 3) { hpMul = 0.35; atkMul = 0.4; } else { hpMul = 1.8; atkMul = 0.6; }
      }
      const e = {
        type, x: at ? at.x : Math.cos(a) * SPAWN_R, y: at ? at.y : Math.sin(a) * SPAWN_R, ang: a,
        hp: E.hp * s * hpMul * TUNE.hpMul * dil, maxhp: E.hp * s * hpMul * TUNE.hpMul * dil, atk: E.atk * Math.pow(TUNE.atkG, this.wave - 1) * atkMul * dil,
        spd: E.spd * (this.opts.prologue || this.opts.tutorial ? 1 : Math.min(TUNE.spdMax, 1 + TUNE.spdG * (this.wave - 1))), r: E.r, stun: 0, shootCd: 2.5, biteCd: 0, dead: false
      };
      if (type === 'stalker') e.phT = this.rng() * FOE_RULE.phase; else if (type === 'mender') e.healT = FOE_RULE.healEvery; else if (type === 'brood') e.layT = FOE_RULE.layEvery * 0.6; else if (type === 'egg') e.hatch = FOE_RULE.hatch;
      if (FOE_WAVE[type] && !(this.met || (this.met = {}))[type]) { this.met[type] = 1; this.events.push({ type: 'newfoe', etype: type }); }
      this.enemies.push(e);
      if (type === 'boss') this.events.push({ type: 'boss', wave: this.wave });
      return e;
    }
    damageStation(amount) {
      if (this.barrierT > this.t) return 0; // awakened 방벽: a 2-second barrier
      if (this.d.shieldAwake && this.barrierCd <= this.t) { this.barrierT = this.t + (this.d.shieldFull ? 3 : 2); this.barrierCd = this.t + (this.d.shieldFull ? 10 : 15); this.events.push({ type: 'barrier' }); return 0; }
      const dealt = amount * (1 - this.d.armor);
      this.hull -= dealt;
      if (this.d.thorns) return dealt * 0.3 * this.d.thorns;
      return 0;
    }
    killEnemy(e) {
      if (e.dead) return;
      e.dead = true; this.kills++;
      if (e.type === 'boss') { this.cells++; this.events.push({ type: 'cell', x: e.x, y: e.y }); }
      this.energy += ENEMY[e.type].energy * this.d.energyMul * Math.pow(TUNE.energyG, this.wave - 1);
      this.checkCards();
      this.events.push({ type: 'kill', x: e.x, y: e.y, etype: e.type, big: !!BIG_FOE[e.type] });
      if (e.type === 'splitter') for (let i = 0; i < 3; i++) { const a = Math.atan2(e.y, e.x) + (i - 1) * 1.1; this.spawn('mini', undefined, { x: e.x + Math.cos(a) * 3, y: e.y + Math.sin(a) * 3 }); }
      if (e.type === 'volatile') { // shot down: the spore pops and hurts the swarm around it, not the station
        const R = FOE_RULE.blastR; this.events.push({ type: 'blast', x: e.x, y: e.y, r: R, foe: true });
        for (const o of this.enemies) { if (o.dead || o === e) continue; const dx = o.x - e.x, dy = o.y - e.y, rr = R + o.r; if (dx * dx + dy * dy < rr * rr) this.hit(o, this.d.dmg * FOE_RULE.blastK, false); }
      }
    }
    hit(e, dmg, crit, from) {
      if (e.ghost) return; // phased-out stalker: shots pass through
      if (from && e.type === 'carapace') { // the plate faces the station: hits arriving from that side mostly glance off
        const fx = from.x - e.x, fy = from.y - e.y, sx = -e.x, sy = -e.y, c = (fx * sx + fy * sy) / ((Math.hypot(fx, fy) * Math.hypot(sx, sy)) || 1);
        if (c > FOE_RULE.frontCos) { dmg *= FOE_RULE.front; if (!this.opts.headless) this.events.push({ type: 'deflect', x: e.x - e.x / (Math.hypot(e.x, e.y) || 1) * e.r, y: e.y - e.y / (Math.hypot(e.x, e.y) || 1) * e.r }); }
      }
      e.hp -= dmg; e.hitT = this.t; // hitT: drawing only (hit flash)
      if (!this.opts.headless) this.events.push({ type: 'hit', x: e.x, y: e.y, v: dmg, crit });
      if (crit) this.events.push({ type: 'crit', x: e.x, y: e.y, v: dmg });
      if (e.hp <= 0) this.killEnemy(e);
    }
    nearest(x, y, maxR, exclude, excludeList) {
      let best = null, bd = maxR * maxR;
      for (const e of this.enemies) {
        if (e.dead || e === exclude || e.ghost || (excludeList && excludeList.includes(e))) continue;
        const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = e; }
      }
      return best;
    }
    // ---- cards (Galaxy Defense style): a full energy bar pauses the battle and offers 3 ----
    needFor(k) { return CARD_NEED.base * Math.pow(CARD_NEED.g, k) * Math.pow(TUNE.energyG, this.wave - 1); }
    checkCards() {
      if (this.opts.prologue || this.over || this.paused || this.energy < this.need) return;
      this.energy -= this.need; this.picks++; this.need = this.needFor(this.picks);
      this.offer();
    }
    offer(tag) {
      const cards = this.offerCards(tag);
      if (!cards.length) return;
      if (this.opts.autoUpgrade || this.opts.headless) { this.takeCard(autoPick(cards, this).id); return; }
      this.paused = true; this.events.push({ type: 'cards', cards, tag });
    }
    // card pool: core cards (new core of a deck kind, stack-up, centre overload), stat boosts, tactical cards.
    // The first offer always has two new cores. 'adv' (adversity boost) favours an awakening.
    offerCards(tag) {
      const pool = [];
      if (this.cores) { // core cards (2026-11-09; in the tutorial only after the trial cores arrive: weapons are cores too): a new core per deck kind, a stack-up per attached core, the centre overload
        const free = this.hull_.slots.filter(k => !this.cores[k]);
        for (const id of this.deck) {
          const T = TILE_TYPES.find(t => t.id === id), same = this.cores.find(c => c && c.type === id && c.lv < CORE_MAX);
          if (!T || (!free.length && !same)) continue;
          pool.push({ id: 'c_new_' + id, kind: 'core', core: id, lv: 1, name: T.name, text: T.desc(1), stack: same ? same.lv + 1 : 0, weapon: !!T.weapon, wgt: 1.2 });
        }
        this.cores.forEach((c, k) => { if (!c || c.lv >= CORE_MAX) return; const T = TILE_TYPES.find(t => t.id === c.type), lv = c.lv + 1, evo = lv === 3 || lv === 5;
          pool.push({ id: 'c_up_' + k, kind: 'core', core: c.type, slot: k, lv, up: true, evo, name: T.name, text: evo ? awakeText(c.type, lv) : `${T.name} 효과 +40%`, wgt: 1.0 * (tag === 'adv' && evo ? 4 : 1) }); });
        if (this.coreLv < CORE_LV_MAX) { const lv = this.coreLv + 1;
          pool.push({ id: 'c_core', kind: 'core', core: 'center', lv, evo: lv === 3 || lv === 5, name: '코어 과부하', text: lv === 3 ? '중심 코어 Lv3: 주포 2연장' : lv === 5 ? '중심 코어 Lv5: 주포 3연장' : '주포 공격력 +15% · 체력 +10%', wgt: 0.8 * (tag === 'adv' && (lv === 3 || lv === 5) ? 4 : 1) }); }
      }
      const sk = this.cores ? 0.5 : 1;
      for (const u of INRUN) pool.push({ id: 's_' + u.id, kind: 'stat', sid: u.id, name: u.name, text: `${u.name} +${u.per * STAT_CARD[u.id]}${u.unit}`, wgt: (u.core ? 1 : 0.6) * sk });
      for (const c of CARDS) pool.push(Object.assign({ kind: 'tactic', wgt: 0.5 * sk }, c));
      const pick = [], take = arr => { let k = this.rng() * arr.reduce((a, c) => a + c.wgt, 0); for (let i = 0; i < arr.length; i++) { k -= arr[i].wgt; if (k <= 0 || i === arr.length - 1) return arr.splice(i, 1)[0]; } };
      if (this.picks <= 1 && !this.cardsTaken.length) { const ws = pool.filter(c => c.kind === 'core' && !c.up && c.core !== 'center'); for (let i = 0; i < 2 && ws.length; i++) { const c = take(ws); pool.splice(pool.indexOf(c), 1); pick.push(c); } }
      while (pick.length < 3 && pool.length) pick.push(take(pool));
      return pick;
    }
    takeCard(id, slot) {
      if (id.startsWith('c_new_') && this.cores) { const type = id.slice(6); if (slot != null && slot >= 0 && !this.canPlace(type, slot)) return false; if (!this.placeCore(type, slot)) return false; }
      this.cardsTaken.push(id);
      if (id.startsWith('c_')) {
        if (id.startsWith('c_up_')) { const k = +id.slice(5), c = this.cores && this.cores[k]; if (c && c.lv < CORE_MAX) { c.lv++; this.events.push({ type: 'core', k, core: c.type, lv: c.lv, merged: true }); } }
        else if (id === 'c_core' && this.coreLv < CORE_LV_MAX) { this.coreLv++; this.events.push({ type: 'core', k: -1, core: 'center', lv: this.coreLv }); }
      }
      else if (id.startsWith('w_')) { const w = id.slice(2); if (this.wlv[w] != null && this.wlv[w] < WEAPON_MAX) { this.wlv[w]++; this.events.push({ type: 'weapon', id: w, lv: this.wlv[w] }); } }
      else if (id.startsWith('s_')) { const sid = id.slice(2); this.inrun[sid] = (this.inrun[sid] || 0) + (STAT_CARD[sid] || 1); }
      else this.cardCount[id] = (this.cardCount[id] || 0) + 1;
      this.refresh();
      if (id === 'plating') this.hull = this.d.hullMax;
      this.paused = false;
      this.checkCards(); // a big kill streak can fill the bar twice
    }
    // tutorial (2026-11-09): at wave 3 the trial cores arrive — three picks in a row, each placed by hand (or 자동 배치)
    tutorialCores() { this.hull_ = HULLS.core; this.cores = [null, null, null, null, null, null]; this.module = 'proto'; this.refresh(); }
    tutCards() {
      return ['hangar', 'bolt', 'shield'].map(id => { const T = TILE_TYPES.find(t => t.id === id), same = this.cores.find(c => c && c.type === id && c.lv < CORE_MAX);
        return { id: 'c_new_' + id, kind: 'core', core: id, lv: 1, name: T.name, text: T.desc(1), stack: same ? same.lv + 1 : 0 }; });
    }
    linkTargets() { const ws = Object.keys(this.wlv).sort((a, b) => this.wlv[b] - this.wlv[a] || this.wsum[b] - this.wsum[a]); return ws.slice(0, this.d.linkFull ? 2 : 1); } // 무기 연결: the highest-level weapon core(s)
    wmul(id) { const lk = this.d.link && this.linkTargets().includes(id) ? (1 + 0.2 * this.d.link) * (this.d.linkAwake ? 1.5 : 1) : 1;
      return (this.wsum[id] || 0) * lk; } // research, level and neighbours are already in each core's multiplier
    // ---- cores (2026-11-08): attach to an empty slot or stack onto the same kind (up to Lv3); the centre core overloads to Lv5 ----
    canPlace(type, k) { if (!this.cores || !this.hull_.slots.includes(k)) return false; const c = this.cores[k]; return !c || (c.type === type && c.lv < CORE_MAX); }
    placeScore(type, k) { // auto placement: a fresh slot beats stacking; neighbours that boost it (or that an amplifier boosts) count
      const c = this.cores[k]; if (c) return 0.6 + 0.05 * c.lv;
      let sc = 1; for (const j of ringNb(k)) { const o = this.cores[j]; if (!o) continue; if (o.type === type) sc += CORE_K.same; if (o.type === 'amplifier' && type !== 'amplifier') sc += CORE_K.amp; if (type === 'amplifier' && o.type !== 'amplifier') sc += CORE_K.amp; } return sc;
    }
    autoPlace(type) { let best = -1, bs = -1; for (const k of this.hull_.slots) if (this.canPlace(type, k)) { const sc = this.placeScore(type, k); if (sc > bs) { bs = sc; best = k; } } return best; }
    placeCore(type, k) {
      if (k == null || k < 0) k = this.autoPlace(type);
      if (!this.canPlace(type, k)) return false;
      const c = this.cores[k]; if (c) c.lv++; else this.cores[k] = { type, lv: 1 };
      this.events.push({ type: 'core', k, core: type, lv: this.cores[k].lv, merged: !!c });
      return true;
    }
    // ---- weapon behaviours (each tick) ----
    stepWeapons(dt) {
      const d = this.d, R = d.range, live = () => this.enemies.filter(e => !e.dead && !e.ghost && e.x * e.x + e.y * e.y < R * R * 1.21);
      const L = id => this.wlv[id] || 0, S = this.wst;
      if (L('bolt')) { // strike a random enemy in range; Lv3 chains to 2 neighbours, Lv5 stuns
        S.bolt.t -= dt;
        if (S.bolt.t <= 0) {
          const pool = live();
          if (pool.length) {
            S.bolt.t = Math.max(1, 2.4 - 0.25 * (L('bolt') - 1));
            let cur = pool[Math.floor(this.rng() * pool.length)]; const pts = [[0, 0]], hitList = [];
            const dmg = d.dmg * 2.2 * this.wmul('bolt');
            for (let j = 0; cur && j < (L('bolt') >= 3 ? 3 : 1); j++) { hitList.push(cur); pts.push([cur.x, cur.y]); let nx = null, nd = 28 * 28; for (const e of this.enemies) { if (e.dead || hitList.includes(e) || e.ghost) continue; const dx = e.x - cur.x, dy = e.y - cur.y, d2 = dx * dx + dy * dy; if (d2 < nd) { nd = d2; nx = e; } } cur = nx; }
            hitList.forEach((e, j) => { if (L('bolt') >= 5) e.stun = Math.max(e.stun, 0.6); this.hit(e, dmg * (j ? 0.6 : 1), false); });
            if (!this.opts.headless) this.events.push({ type: 'bolt', pts });
          } else S.bolt.t = 0.2;
        }
      }
      if (L('beam')) { // nearest enemy burns; damage lands every 0.2 s; Lv3 refracts to 2 more
        S.beam.t -= dt;
        const t0 = this.nearest(0, 0, R * 1.1); S.beam.tgts = [];
        if (t0) {
          S.beam.tgts.push(t0);
          if (L('beam') >= 3) { let prev = t0; for (let j = 0; j < 2; j++) { const n = this.nearest(prev.x, prev.y, 24, null, S.beam.tgts); if (!n) break; S.beam.tgts.push(n); prev = n; } }
          if (S.beam.t <= 0) { S.beam.t = 0.2; const dps = d.dmg * 1.6 * this.wmul('beam') * (L('beam') >= 5 ? 1.6 : 1); S.beam.tgts.forEach((e, j) => this.hit(e, dps * 0.2 * (j ? 0.5 : 1), false)); }
        }
      }
      if (L('hive')) { // homing wasps
        S.hive.t -= dt;
        if (S.hive.t <= 0) {
          const n = L('hive') >= 5 ? 3 : L('hive') >= 3 ? 2 : 1, pool = live();
          if (pool.length) { S.hive.t = L('hive') >= 5 ? 2.4 : 3; for (let j = 0; j < n; j++) { const tg = pool[Math.floor(this.rng() * pool.length)], a = this.rng() * TAU; this.projs.push({ x: Math.cos(a) * 6, y: Math.sin(a) * 6, tgt: tg, dmg: d.dmg * 2.4 * this.wmul('hive'), crit: false, pierce: 0, src: 'wasp', spd: L('hive') >= 5 ? 95 : 75 }); } }
          else S.hive.t = 0.3;
        }
      }
      if (L('field')) { // slow ring + burn every 0.5 s (slow itself is applied in enemy movement)
        S.field.r = (26 + 2 * L('field')) * (L('field') >= 5 ? 1.3 : 1);
        S.field.t -= dt;
        if (S.field.t <= 0) { S.field.t = 0.5; const r2 = S.field.r * S.field.r, dmg = d.dmg * 0.6 * this.wmul('field') * 0.5; for (const e of this.enemies) if (!e.dead && e.x * e.x + e.y * e.y < r2) { if (L('field') >= 3) e.ghost = false; this.hit(e, dmg, false); } }
      } else S.field.r = 0;
      if (L('wheel')) { // discs orbiting the station
        const n = L('wheel') >= 5 ? 3 : L('wheel') >= 3 ? 2 : 1, big = L('wheel') >= 5 ? 1.4 : 1; S.wheel.a += dt * 2.2; S.wheel.n = n; S.wheel.big = big;
        for (let j = 0; j < n; j++) {
          const a = S.wheel.a + j * TAU / n, wx = Math.cos(a) * 20, wy = Math.sin(a) * 20;
          for (const e of this.enemies) { if (e.dead || e.ghost || (e.wheelT || 0) > this.t) continue; const dx = e.x - wx, dy = e.y - wy, rr = 3.5 * big + e.r; if (dx * dx + dy * dy < rr * rr) { e.wheelT = this.t + 0.4; this.hit(e, d.dmg * 1.8 * this.wmul('wheel'), false, { x: wx, y: wy }); } }
        }
      } else S.wheel.n = 0;
      if (L('missile')) { // splash missiles at random enemies a bit beyond range
        S.missile.t -= dt;
        if (S.missile.t <= 0) {
          const pool = this.enemies.filter(e => !e.dead && !e.ghost && e.x * e.x + e.y * e.y < R * R * 1.7);
          if (pool.length) { S.missile.t = Math.max(1.2, 2.6 - 0.2 * (L('missile') - 1)); const n = L('missile') >= 5 ? 3 : L('missile') >= 3 ? 2 : 1; for (let j = 0; j < n; j++) this.projs.push({ x: 0, y: 0, tgt: pool[Math.floor(this.rng() * pool.length)], dmg: d.dmg * 2.4 * this.wmul('missile'), crit: false, pierce: 0, src: 'missile', spd: 60, splash: 10 * (L('missile') >= 5 ? 1.4 : 1) }); }
          else S.missile.t = 0.3;
        }
      }
    }
    fireWeapon(id) {
      const w = this.weapons[id];
      if (!w.unlocked || w.cd > 0 || this.over) return false;
      const target = this.nearest(0, 0, 200);
      if (!target) return false;
      w.cd = w.max * this.d.cdMul;
      if (id === 'rail') {
        const a = Math.atan2(target.y, target.x), ux = Math.cos(a), uy = Math.sin(a);
        for (const e of this.enemies) {
          if (e.dead) continue;
          const along = e.x * ux + e.y * uy, perp = Math.abs(-e.x * uy + e.y * ux);
          if (along > 0 && along < 140 && perp < 5 + e.r) this.hit(e, this.d.dmg * 20, false);
        }
        this.events.push({ type: 'rail', a });
      } else {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (e.x * e.x + e.y * e.y < 70 * 70) { e.stun = 3; this.hit(e, this.d.dmg * 5, false); }
        }
        this.events.push({ type: 'emp' });
      }
      return true;
    }
    step() {
      if (this.over || this.paused) return;
      const dt = TICK, d = this.d;
      this.t += dt; this.waveT += dt;
      // spawns
      while (this.spawnPlan.length && this.spawnPlan[0].at <= this.waveT) { const sp = this.spawnPlan.shift(); if (sp.type === 'rushwarn') this.events.push({ type: 'rush', wave: this.wave }); else this.spawn(sp.type, sp.pack); }
      // wave advance
      if (this.waveT >= this.waveSec) {
        this.data += 3 * d.dataMul;
        this.events.push({ type: 'wave', wave: this.wave });
        if (this.wave === 50 && !this.planetCleared) { this.planetCleared = true; this.events.push({ type: 'planet' }); }
        if (this.wave % 10 === 0 && d.repairAwake) { this.hull = Math.min(d.hullMax, this.hull + d.hullMax * 0.3); this.events.push({ type: 'heal', x: 0, y: 0 }); } // awakened 수리: a boss wave survived heals 30%
        this.wave++; this.waveT = 0; this.planWave();
      }
      // weapons cooldown + auto
      for (const k in this.weapons) { const w = this.weapons[k]; if (w.cd > 0) w.cd = Math.max(0, w.cd - dt); }
      if (this.opts.autoWeapons) { this.fireWeapon('rail'); this.fireWeapon('emp'); }
      // adversity boost: at fixed moments early on, if the swarm piles up (or the hull is low), a free card that favours an evolution
      if (!this.opts.prologue && !this.opts.tutorial && this.advDone < ADVERSITY.at.length && this.t >= ADVERSITY.at[this.advDone]) {
        this.advDone++;
        const crowd = this.enemies.filter(e => !e.dead).length;
        if (crowd >= ADVERSITY.crowd || this.hull < this.d.hullMax * ADVERSITY.hullPct) { this.events.push({ type: 'adversity' }); this.offer('adv'); if (this.paused) return; }
      }
      this.stepWeapons(dt);
      // enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.stun > 0) { e.stun -= dt; continue; }
        if (e.type === 'egg') { e.hatch -= dt; if (e.hatch <= 0) { e.dead = true; this.events.push({ type: 'hatch', x: e.x, y: e.y }); this.spawn('mini', undefined, { x: e.x, y: e.y }); } continue; }
        if (e.type === 'stalker') { e.phT += dt; const was = e.ghost; e.ghost = (e.phT % FOE_RULE.phase) > FOE_RULE.phaseVis; if (e.ghost !== was && !this.opts.headless) this.events.push({ type: 'phase', x: e.x, y: e.y, out: e.ghost }); }
        if (e.type === 'mender') { e.healT -= dt; if (e.healT <= 0) { e.healT = FOE_RULE.healEvery; let n = 0; for (const o of this.enemies) { if (o.dead || o === e || o.type === 'egg') continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < FOE_RULE.healR * FOE_RULE.healR && o.hp < o.maxhp) { o.hp = Math.min(o.maxhp, o.hp + o.maxhp * FOE_RULE.healK); n++; } } this.events.push({ type: 'heal', x: e.x, y: e.y, n }); } }
        const dist = Math.hypot(e.x, e.y);
        if (e.type === 'brood') { e.layT -= dt; if (e.layT <= 0 && dist > STATION_R + 20 && this.enemies.length < 60) { e.layT = FOE_RULE.layEvery; this.spawn('egg', undefined, { x: e.x * 1.05, y: e.y * 1.05 }); } }
        const stopAt = e.type === 'shooter' ? 60 : e.type === 'mender' ? STATION_R + FOE_RULE.menderPark : STATION_R + e.r;
        if (dist > stopAt) {
          const slow = this.wst.field.r && dist < this.wst.field.r ? 1 - Math.min(0.5, 0.25 + 0.05 * (this.wlv.field || 0)) : 1; // 교란장
          const mv = Math.min(e.spd * (e.ghost ? 1.5 : 1) * slow * dt, dist - stopAt);
          e.x -= e.x / dist * mv; e.y -= e.y / dist * mv;
        } else if (e.type === 'mender') { /* parked behind the swarm, healing */
        } else if (e.type === 'shooter') {
          e.shootCd -= dt;
          if (e.shootCd <= 0) { e.shootCd = 2.5; this.bullets.push({ x: e.x, y: e.y, atk: e.atk }); }
        } else if (e.type === 'boss') {
          e.biteCd -= dt;
          if (e.biteCd <= 0) { e.biteCd = 1.5; const ref = this.damageStation(e.atk); if (ref) this.hit(e, ref, false); }
        } else {
          const ref = this.damageStation(e.atk);
          e.dead = true; // kamikaze, no energy
          if (ref) { /* reflected damage has no target left */ }
        }
      }
      // enemy bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i], dist = Math.hypot(b.x, b.y);
        if (dist <= STATION_R) { this.damageStation(b.atk); this.bullets.splice(i, 1); continue; }
        b.x -= b.x / dist * 30 * dt; b.y -= b.y / dist * 30 * dt;
      }
      // turret
      this.fireT -= dt;
      if (this.fireT <= 0) {
        let tgt = null, bd = d.range * d.range;
        for (const e of this.enemies) {
          if (e.dead || e.ghost || (e.pending || 0) >= e.hp) continue; // already doomed by shots in flight
          const d2 = e.x * e.x + e.y * e.y;
          if (d2 < bd) { bd = d2; tgt = e; }
        }
        if (tgt) {
          this.fireT = 1 / d.rate;
          const crit = this.rng() < d.crit, dmg = d.dmg * (crit ? 2 : 1);
          tgt.pending = (tgt.pending || 0) + dmg;
          this.projs.push({ x: 0, y: 0, tgt, dmg, crit, pierce: d.pierce, booked: dmg });
          for (let j = 1; j < (d.shots || 1); j++) { const t2 = this.nearest(tgt.x, tgt.y, 30, tgt); if (t2) this.projs.push({ x: 0, y: 0, tgt: t2, dmg: dmg * 0.8, crit, pierce: d.pierce, booked: 0, src: 'gun2' }); } // overloaded core: extra barrels
        } else this.fireT = 0;
      }
      // projectiles (homing)
      for (let i = this.projs.length - 1; i >= 0; i--) {
        const p = this.projs[i];
        if (p.tgt.dead && (p.src === 'wasp' || p.src === 'missile')) { const n = this.nearest(p.x, p.y, 40); if (n) p.tgt = n; else { this.projs.splice(i, 1); continue; } }
        if (p.tgt.dead) {
          if (p.pierce > 0) { const n = this.nearest(p.x, p.y, 25); if (n) { p.tgt = n; p.booked = 0; } else { this.projs.splice(i, 1); continue; } }
          else { this.projs.splice(i, 1); continue; }
        }
        const dx = p.tgt.x - p.x, dy = p.tgt.y - p.y, dist = Math.hypot(dx, dy), mv = (p.spd || 130) * dt;
        if (dist <= mv + p.tgt.r) {
          const tgt = p.tgt;
          if (p.booked) { tgt.pending = Math.max(0, (tgt.pending || 0) - p.booked); p.booked = 0; }
          this.hit(tgt, p.dmg, p.crit, p);
          if (p.splash) { for (const o of this.enemies) { if (o.dead || o === tgt) continue; const ox = o.x - tgt.x, oy = o.y - tgt.y, rr = p.splash + o.r; if (ox * ox + oy * oy < rr * rr) this.hit(o, p.dmg * 0.6, false); } if (!this.opts.headless) this.events.push({ type: 'blast', x: tgt.x, y: tgt.y, r: p.splash, foe: true }); }
          if (p.crit && d.chain) { const n = this.nearest(tgt.x, tgt.y, 25, tgt); if (n) { this.hit(n, p.dmg * 0.5 * d.chain, false); this.events.push({ type: 'chain', x1: tgt.x, y1: tgt.y, x2: n.x, y2: n.y }); } }
          if (p.pierce > 0) { p.pierce--; p.x = tgt.x; p.y = tgt.y; const n = this.nearest(p.x, p.y, 25, tgt); if (n) { p.tgt = n; p.booked = 0; continue; } }
          this.projs.splice(i, 1); continue;
        }
        p.x += dx / dist * mv; p.y += dy / dist * mv;
      }
      // batteries: secondary turrets on their tiles
      for (const bt of this.batteries) {
        bt.fireT -= dt; if (bt.fireT > 0) continue;
        // long-range battery: prefers the farthest threat it can reach (shooters parked outside main range)
        let tgt = null, bd = -1; const R2 = d.range * d.range;
        for (const e of this.enemies) { if (e.dead || e.ghost || (e.pending || 0) >= e.hp) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 < R2 && d2 > bd) { bd = d2; tgt = e; } }
        if (!tgt) { bt.fireT = 0; continue; }
        const p = slotPos(bt.k); bt.fireT = 1 / (d.rate * 0.6); bt.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const crit = this.rng() < d.crit, dmg = d.dmg * 0.4 * bt.m * (crit ? 2 : 1);
        tgt.pending = (tgt.pending || 0) + dmg;
        this.projs.push({ x: p.x, y: p.y, tgt, dmg, crit, pierce: 0, booked: dmg, src: 'battery' });
        if (bt.twin) { let t2 = null, b2 = -1; for (const e of this.enemies) { if (e === tgt || e.dead || e.ghost) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 < R2 && d2 > b2) { b2 = d2; t2 = e; } } // awakened: twin barrels, a second target
          if (t2) this.projs.push({ x: p.x, y: p.y, tgt: t2, dmg, crit: false, pierce: 0, booked: dmg, src: 'battery' });
          if (t2 && bt.triple) { const t3 = this.nearest(t2.x, t2.y, 40, t2, [tgt]); if (t3) this.projs.push({ x: p.x, y: p.y, tgt: t3, dmg, crit: false, pierce: 0, booked: dmg, src: 'battery' }); } }
      }
      // interceptors: leave the station, strafe a target, return when the sky is clear
      if (this.craft.length) {
        const leash = d.range, L2 = leash * leash, cdBase = 1.1 / Math.sqrt(Math.max(1, d.rate / 1.2));
        for (const e of this.enemies) e.claims = 0;
        for (const c of this.craft) if (c.tgt && !c.tgt.dead) c.tgt.claims++;
        for (const c of this.craft) {
          if (c.tgt && (c.tgt.dead || c.tgt.ghost || c.tgt.x * c.tgt.x + c.tgt.y * c.tgt.y > L2 * 1.3)) c.tgt = null;
          if (!c.tgt) {
            let best = null, bs = Infinity;
            for (const e of this.enemies) {
              if (e.dead || e.ghost) continue; const r2 = e.x * e.x + e.y * e.y; if (r2 > L2) continue;
              const dx = e.x - c.x, dy = e.y - c.y, sc = dx * dx + dy * dy + (e.claims || 0) * 900 + r2 * 0.3;
              if (sc < bs) { bs = sc; best = e; }
            }
            c.tgt = best; if (best) best.claims = (best.claims || 0) + 1;
          }
          let gx, gy;
          if (c.tgt) { const ta = Math.atan2(c.y - c.tgt.y, c.x - c.tgt.x) + (c.j ? 0.9 : -0.9); gx = c.tgt.x + Math.cos(ta) * 9; gy = c.tgt.y + Math.sin(ta) * 9; }
          else { const oa = this.t * 1.1 + c.j * Math.PI + c.k * 1.05; gx = Math.cos(oa) * 17; gy = Math.sin(oa) * 17; }
          const dx = gx - c.x, dy = gy - c.y, dist = Math.hypot(dx, dy) || 1, sp = c.tgt ? 62 : 38, k = Math.min(1, dt * 4);
          c.vx += (dx / dist * sp - c.vx) * k; c.vy += (dy / dist * sp - c.vy) * k;
          c.x += c.vx * dt; c.y += c.vy * dt; c.ang = Math.atan2(c.vy, c.vx);
          c.cd -= dt;
          if (c.tgt && c.cd <= 0) {
            const ex = c.tgt.x - c.x, ey = c.tgt.y - c.y;
            if (ex * ex + ey * ey < 20 * 20) {
              c.cd = cdBase; const crit = this.rng() < d.crit, dmg = d.dmg * 0.25 * (c.m || tileMul(c.lv)) * (crit ? 2 : 1);
              if (!this.opts.headless) this.events.push({ type: 'zap', x1: c.x, y1: c.y, x2: c.tgt.x, y2: c.tgt.y });
              this.hit(c.tgt, dmg, crit, c);
            }
          }
        }
      }
      // orbitals: ram enemies on their path and swallow enemy shots
      for (let i = 0; i < this.orbitals; i++) {
        const o = orbitalPos(this.t, i, this.orbitals);
        for (let j = this.bullets.length - 1; j >= 0; j--) { const bl = this.bullets[j], dx = bl.x - o.x, dy = bl.y - o.y; if (dx * dx + dy * dy < 30) { this.bullets.splice(j, 1); if (!this.opts.headless) this.events.push({ type: 'block', x: o.x, y: o.y }); } }
        for (const e of this.enemies) {
          if (e.dead || (e.orbT || 0) > this.t) continue;
          const dx = e.x - o.x, dy = e.y - o.y, rr = 3.5 + e.r;
          if (dx * dx + dy * dy < rr * rr) { e.orbT = this.t + 0.5; this.hit(e, d.dmg * 1.5, false, o); }
        }
      }
      if (this.enemies.length > 64) this.enemies = this.enemies.filter(e => !e.dead);
      // regen + auto upgrade
      this.hull = Math.min(d.hullMax, this.hull + (d.regen + (d.repair || 0)) * dt);
      // prologue: arc lasers chain through the swarm several times a second
      if (this.opts.prologue) {
        this.arcT = (this.arcT == null ? 0.2 : this.arcT) - dt;
        if (this.arcT <= 0) {
          this.arcT = 0.35;
          const M = this.mother, pts = [[0, 0]];
          if (M && M.charge > 0.05 && M.beam < 0) pts.push([0, M.y + MOTHER.maw]); // lasers splash uselessly on the charging maw
          else {
            // two chains per volley, starting from different enemies, each jumping through up to 4 targets
            const used = [];
            for (let v = 0; v < 2; v++) {
              let cur = null, bd = 95 * 95;
              for (const e of this.enemies) { if (e.dead || used.includes(e)) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 < bd && (v === 0 || this.rng() < 0.6)) { bd = d2; cur = e; } }
              const chain = [[0, 0]];
              while (cur && chain.length < 5) { used.push(cur); chain.push([cur.x, cur.y]); let nx = null, nd = 40 * 40; for (const e of this.enemies) { if (e.dead || used.includes(e)) continue; const dx = e.x - cur.x, dy = e.y - cur.y, d2 = dx * dx + dy * dy; if (d2 < nd) { nd = d2; nx = e; } } cur = nx; }
              for (const e of used) if (!e.dead) this.hit(e, this.d.dmg * 2, false);
              if (chain.length > 1 && !this.opts.headless) this.events.push({ type: 'arc', pts: chain });
            }
          }
          if (pts.length > 1 && !this.opts.headless) this.events.push({ type: 'arc', pts });
        }
      }
      // prologue finale: a giant mothership descends, charges its main cannon and erases the endgame station
      if (this.opts.prologue && this.wave >= 7) {
        const T = this.motherT = (this.motherT || 0) + dt;
        if (!this.mother) { this.mother = { y: MOTHER.y0, charge: 0, beam: -1 }; this.events.push({ type: 'mother' }); }
        const ent = Math.min(1, T / MOTHER.enter), ease = ent * ent * ent * (ent * (ent * 6 - 15) + 10);
        this.mother.y = MOTHER.y0 + (MOTHER.y1 - MOTHER.y0) * ease;
        this.mother.charge = Math.max(0, Math.min(1, (T - MOTHER.enter) / MOTHER.charge));
        if (T >= MOTHER.enter && !this.chargeStarted) { this.chargeStarted = true; this.events.push({ type: 'charge' }); }
        const fireAt = MOTHER.enter + MOTHER.charge;
        if (T >= fireAt) { this.mother.beam = T - fireAt; if (!this.beamFired) { this.beamFired = true; this.events.push({ type: 'beam' }); } }
        if (T >= fireAt + MOTHER.burn) { this.hull = 0; }
      }
      // end conditions
      if (this.hull <= 0) { this.hull = 0; this.end(this.opts.prologue ? 'prologue' : 'destroyed'); }
      else if (this.t >= RUN_CAP_GAME_SEC) this.end('retreat');
    }
    end(reason) {
      if (this.over) return;
      this.over = true; this.reason = reason;
      this.events.push({ type: 'end', reason });
    }
    get reachedWave() { return this.wave; }
  }

  function newSave() {
    return {
      v: 2, data: 0, cells: 0, enh: { dmg: 0, hull: 0, data: 0 }, best: 0, runs: 0, module: false, planet1: false,
      shipyard: Object.fromEntries(STATS.map(s => [s.id, 0])),
      research: { levels: { cap: 0, econ: 0, start: 0, patrol: 0 }, slots: [null, null] },
      station: { slots: [null, null, null, null, null, null] },
      tutorial: 0, settings: { speed: 2, researchScale: 1, autoUpgrade: false, autoWeapons: false },
      deck: DEFAULT_DECK.slice(), mastery: {}, coreRes: {}, hull: 'core', coreUnlocked: {}, coreDeck: [],
      log: [], funnel: {}, lastSeen: 0, maxSeen: 0, offline: null
    };
  }
  const capOf = save => 20 + (save.research.levels.cap || 0);

  // ---- offline (idle) reward: an automated patrol keeps sending data while the app is closed ----
  // Active play earns ≈ 3 data × dataMul per wave, 6 waves per real minute at the default 2x (≈18/min).
  // Offline pays eff (8%) of that, scaled up by the best wave, capped at capBase hours (+1h per '순찰 확장' research, up to capMax):
  //   the first cap (4h at best wave 10) ≈ 410 data ≈ 23 min of active play; 2x ad ≈ 46 min.
  const OFFLINE = { eff: 0.08, capBase: 4, capMax: 12, minMin: 5, unlockBest: 5, bestK: 50 };
  const offlineCapH = save => Math.min(OFFLINE.capMax, OFFLINE.capBase + ((save.research && save.research.levels.patrol) || 0));
  const offlineUnlocked = save => (save.tutorial || 0) >= 2 && (save.best || 0) >= OFFLINE.unlockBest;
  function offlineRate(save) { // data per real minute
    if (!offlineUnlocked(save)) return 0;
    const d = derived(save, null);
    return OFFLINE.eff * 18 * d.dataMul * (1 + (save.best || 0) / OFFLINE.bestK);
  }
  // elapsedMs → { min (counted, capped), rawMin, capped, data }; null when too short or locked
  function offlineReward(save, elapsedMs) {
    if (!offlineUnlocked(save) || !(elapsedMs > 0)) return null;
    const rawMin = elapsedMs / 60000;
    if (rawMin < OFFLINE.minMin) return null;
    const cap = offlineCapH(save) * 60, min = Math.min(rawMin, cap);
    return { min: Math.floor(min), rawMin: Math.floor(rawMin), capped: rawMin > cap, data: Math.floor(offlineRate(save) * min) };
  }

  // auto choice (자동 선택 / simulator): weapon evolutions, then weapons we own, new weapons, core stats, tactical cards
  const TACTIC_PRIO = ['overcharge', 'rapid', 'plating', 'scope', 'chain', 'pierce', 'optics', 'thorns', 'coolant', 'harvest'];
  function autoPick(cards, b) {
    const score = c => c.kind === 'core' ? (c.evo ? 98 : c.core === 'center' ? 48 : c.up ? 52 + c.lv : (c.weapon ? 58 : 55)) : c.kind === 'weapon' ? (c.evo ? 100 : 0) + (c.lv > 1 ? 60 + c.lv : 50)
      : c.kind === 'stat' ? ({ dmg: 45, rate: 42, hull: 40, regen: 30 }[c.sid] || 20) : 30 - TACTIC_PRIO.indexOf(c.id);
    return cards.slice().sort((x, y) => score(y) - score(x))[0];
  }
  // Headless: run one full battle with auto-play, return the reached wave.
  function simulateRun(save, seed) {
    const b = new Battle(save, { seed, headless: true, autoUpgrade: true, autoWeapons: true });
    b.weapons.rail.unlocked = true; b.weapons.emp.unlocked = true;
    let guard = 0;
    while (!b.over && guard++ < 200000) { b.step(); b.events.length = 0; }
    return { wave: b.wave, data: b.data, reason: b.reason, t: b.t, kills: b.kills };
  }

  root.SZE = { FOES: FOE_WAVE, FOE_WAVE, FOE_RULE, BIG_FOE, TUNE, poly, researchCost, CELL_MINUTES, ENH, ENH_UNLOCK_WAVE, ENH_MAX, enhCost, TICK, WAVE_SEC, STATION_R, SPAWN_R, STATS, statCost, RESEARCH, RESEARCH_HOURS, INRUN, inrunCost, CARDS, ENEMY, STAT_CARD, CARD_NEED, ADVERSITY, WEAPONS, WEAPON_MAX, MASTERY_MAX, DECK_SIZE, DEFAULT_DECK, masteryCost, weaponUnlocked, autoPick,
    derived, Battle, newSave, capOf, simulateRun, MOTHER, OFFLINE, offlineCapH, offlineUnlocked, offlineRate, offlineReward,
    TILE_TYPES, HULLS, CORE_MAX, CORE_LV_MAX, CORE_K, AWAKE_TEXT, AWAKE3, AWAKE5, awakeText, CORE_UNLOCK, CORE_ORDER, coreDeck, coreMul, coreOpen, SLOT_WAVES, SLOT_ORDER, ORBITAL_WAVES, TILE_MAX, tileCost, tileMul, slotPos, orbitalPos, stationOf, ORBIT };
})(typeof window !== 'undefined' ? window : globalThis);
