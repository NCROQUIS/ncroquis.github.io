/* Station Zero — battle engine v2 (growth restructure). Pure logic, fixed tick, seeded RNG. No DOM. */
(function (root) {
  const TICK = 1 / 30;
  const WAVE_SEC = 20;
  const RUN_CAP_GAME_SEC = 15 * 60 * 2; // 15 real minutes at the default 2x
  const STATION_R = 7, SPAWN_R = 108;
  const TUNE = { hpG: 1.05, hpG2: 1.04, atkG: 1.04, energyG: 1.0, late: 25, hpMul: 1.55, rateStep: 0.04, inrunG: 1.35, regenAbs: 0, polyK: 0.07, polyP: 1.3, swarm: 2.5, rush: 0.4, spdG: 0.005, spdMax: 1.6, rangedG: 0.002, hullBase: 80, regenPct: 0.0015, regenG: 0.4, runHull: 100, runHp: 1.65, runAtk: 0.92, runBat: 1.75, runCraft: 1.4, runMis: 1.25, runBossAtk: 0.6 }; // hull 80 + slow regen: chip damage sticks, so the hull drains from wave 2 instead of collapsing at wave 9-10 // rush + light speed/ranged growth (6-seed auto-play keeps ≈+1.8 waves per level over Lv0-30) // v2: polynomial shipyard effects — ≈+2 waves/level to Lv20, then flattening (6-seed auto-play)

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
    { id: 'dmg',    tab: 'atk', name: '피해',      base: 1.0, desc: L => `${(4 * poly(L)).toFixed(1)}` },
    { id: 'rate',   tab: 'atk', name: '연사 속도',  base: 1.2, desc: L => `${(1.2 * (1 + TUNE.rateStep * L)).toFixed(2)}/초` },
    { id: 'crit',   tab: 'atk', name: '치명타 확률', base: 1.5, desc: L => `${Math.round(Math.min(60, 5 + L))}%` },
    { id: 'range',  tab: 'atk', name: '사거리',     base: 1.2, desc: L => `${Math.round(40 + L)}` },
    { id: 'hull',   tab: 'def', name: '선체 내구도', base: 1.0, desc: L => `${Math.round(TUNE.hullBase * poly(L))}` },
    { id: 'regen',  tab: 'def', name: '선체 재생',  base: 1.2, desc: L => `${(TUNE.regenPct * 100 * (1 + TUNE.regenG * L)).toFixed(2)}%/초` },
    { id: 'armor',  tab: 'def', name: '피해 감소',  base: 1.5, desc: L => `${Math.min(50, L)}%` },
    { id: 'energy', tab: 'utl', name: '에너지 획득', base: 1.5, desc: L => `+${5 * L}%` },
    { id: 'datab',  tab: 'utl', name: '웨이브당 데이터', base: 2.0, desc: L => `+${3 * L}%` }
  ];
  const statCost = (id, L) => {
    const s = STATS.find(x => x.id === id);
    return Math.ceil(s.base * Math.pow(L + 1, 1.5));
  };

  // ---- research (real time) ----
  const RESEARCH = [
    { id: 'cap',   name: '강화 상한 해제', desc: n => `조선소 상한 +1 (현재 ${20 + n})` },
    { id: 'econ',  name: '데이터 연구',   desc: n => `데이터 수입 +3% (현재 +${3 * n}%)` },
    { id: 'start', name: '출격 준비',     desc: n => `시작 에너지 +15 (현재 ${15 * n})` }
  ];
  const researchCost = n => Math.ceil(8 * n * n); // data cost for research level n
  const CELL_MINUTES = 20; // one energy cell shortens a running research by 20 minutes
  const RESEARCH_HOURS = n => 3.2 * n * Math.min(1, Math.pow(n / 8, 2)); // balance sheet v4: Lv1 3min, Lv2 24min, Lv3 81min, Lv4 3.2h, Lv8+ 3.2×n h

  // ---- enhancement (2nd layer, data sink): ×(1 + 1% per level), exponential cost ----
  const ENH = [
    { id: 'dmg',  name: '피해 강화',   desc: L => `피해 ×${(1 + 0.01 * L).toFixed(2)}` },
    { id: 'hull', name: '선체 강화',   desc: L => `선체 ×${(1 + 0.01 * L).toFixed(2)}` },
    { id: 'data', name: '데이터 강화', desc: L => `데이터 ×${(1 + 0.01 * L).toFixed(2)}` }
  ];
  const ENH_UNLOCK_WAVE = 40, ENH_MAX = 100;
  const enhCost = L => Math.ceil(2000 * Math.pow(1.17, L));

  // ---- in-run ----
  const INRUN = [
    { id: 'dmg',   name: '피해 +12%' },
    { id: 'rate',  name: '연사 +6%' },
    { id: 'hull',  name: '선체 +12%' },
    { id: 'regen', name: '재생 +12%' }
  ];
  const inrunCost = lv => Math.ceil(8 * Math.pow(TUNE.inrunG, lv));

  const CARDS = [
    { id: 'overcharge', name: '과충전 탄두',  text: '피해 +25%' },
    { id: 'rapid',      name: '속사 회로',    text: '연사 속도 +20%' },
    { id: 'scope',      name: '치명 조준경',  text: '치명타 확률 +10%p' },
    { id: 'plating',    name: '보강 장갑',    text: '선체 최대치 +30%, 즉시 회복' },
    { id: 'chain',      name: '연쇄 번개',    text: '치명타 시 주변 1기에 50% 피해' },
    { id: 'thorns',     name: '반격 실드',    text: '받은 접촉 피해의 30% 반사' },
    { id: 'coolant',    name: '병기 냉각기',  text: '궤도 병기 쿨타임 -20%' },
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
    { id: 'shield',    name: '방벽',   col: '#8fa2ff', desc: L => `선체 +${Math.round(8 * tileMul(L))}% · 재생 +${Math.round(10 * tileMul(L))}% · 피해 감소 +2%p` },
    { id: 'collector', name: '수집기', col: '#c8fff0', desc: L => `에너지 +${Math.round(12 * tileMul(L))}% · 데이터 +${Math.round(6 * tileMul(L))}%` }
  ];
  const SLOT_WAVES = [8, 15, 22, 30, 40, 50];   // best wave that opens each hex slot
  const SLOT_ORDER = [1, 3, 5, 0, 2, 4];        // hex positions in unlock order: a triangle first, then the ring closes
  const ORBITAL_WAVES = [50, 65, 80];           // satellites join after the ring is complete (Luna recaptured)
  const TILE_MAX = 10;
  const tileCost = L => Math.ceil(12 * Math.pow(L + 1, 1.6)); // data to raise a slot from L to L+1
  const TILE_D = 8.7; // core → ring-1 tile center, world units (art draws the hull at STATION_R × 1.3)
  const slotPos = k => { const a = Math.PI / 6 + k * Math.PI / 3; return { x: Math.cos(a) * TILE_D, y: Math.sin(a) * TILE_D, a }; };
  const ORBIT = { a: 26, b: 14, tilt: -0.35, w: 1.2 };
  function orbitalPos(t, i, n, sc) {
    sc = sc || 1;
    const th = t * ORBIT.w + i * TAU / n, lx = Math.cos(th) * ORBIT.a * sc, ly = Math.sin(th) * ORBIT.b * sc;
    return { x: lx * Math.cos(ORBIT.tilt) - ly * Math.sin(ORBIT.tilt), y: lx * Math.sin(ORBIT.tilt) + ly * Math.cos(ORBIT.tilt), depth: Math.sin(th) };
  }
  const PROTO_TILES = { 1: 'hangar', 3: 'battery', 5: 'hangar' };
  // prologue finale timeline (seconds after wave 7 starts) and mothership placement in world units (station at 0,0)
  const MOTHER = { y0: -440, y1: -190, enter: 6.5, charge: 2.5, burn: 1.1, maw: 66 }; // giant: starts far above the screen and sinks in slowly (6.5 s, slow at both ends)

  // ======== v3 roguelike: tiles are built during a run; adjacency matters ========
  // slots 0-5 = inner ring (hex positions), 6-11 = outer ring straight out from 0-5
  const RT = [
    { id: 'hangar',    name: '격납고', col: '#ffd166', role: '공격', desc: (m, n) => `요격기 ${n}기 출격 · 사격 피해 주포의 ${Math.round(35 * m)}%`, syn: '옆 격납고 1개당 요격기 +1 (최대 4)' },
    { id: 'battery',   name: '포대',   col: '#6fd3ff', role: '공격', desc: m => `보조 포탑 · 피해 주포의 ${Math.round(70 * m)}%`, syn: '옆 포대 1개당 피해 +20%' },
    { id: 'missile',   name: '미사일', col: '#ff8f7a', role: '공격', desc: m => `2.2초마다 미사일 · 적이 몰린 곳에 피해 주포의 ${Math.round(125 * m)}%, 주변에 폭발`, syn: '옆 미사일 1개당 폭발 반경 +25%' },
    { id: 'shield',    name: '방벽',   col: '#8fa2ff', role: '방어', desc: m => `최대 선체 +${Math.round(25 * m)} · 피해 감소 +${Math.round(4 * m)}%p`, syn: '옆 방벽 1개당 피해 감소 +2%p' },
    { id: 'repair',    name: '수리',   col: '#8dffcf', role: '방어', desc: m => `전투 중 초당 선체 +${(0.6 * m).toFixed(1)} · 전투 후 +${Math.round(4 * m)}`, syn: '증폭기와 함께 쓰면 좋음' },
    { id: 'collector', name: '수집기', col: '#ffe9a8', role: '경제', desc: m => `크레딧 +${Math.round(25 * m)}%`, syn: '바깥 고리에 두면 손해 없음' },
    { id: 'amplifier', name: '증폭기', col: '#d9c2ff', role: '지원', desc: m => `옆 타일 효과 +${Math.round(30 * m)}%`, syn: '안쪽 고리 가운데에 둘수록 이웃이 많음' }
  ];
  const RLV = [0, 1, 1.6, 2.3]; // tile level 1..3 multiplier
  // Lv3 'awakening' (2026-11-05, 9 Kings: a maxed card changes how it works, not just its numbers)
  const AWAKE = {
    battery:   { name: '쌍열 포탑',   text: '포신 2개 · 한 번에 두 적을 쏨' },
    hangar:    { name: '정예 편대',   text: '요격기 +1기' },
    missile:   { name: '2연장 발사', text: '미사일 2발을 서로 다른 무리에' },
    shield:    { name: '이중 방벽',   text: '최대 선체 +25 · 피해 감소 +3%p 더' },
    repair:    { name: '긴급 수리반', text: '전투 후 수리 2배' },
    collector: { name: '고속 수집',   text: '크레딧 +25% 더' },
    amplifier: { name: '공명 증폭',   text: '옆 타일 효과 +20%p 더' }
  };
  const runPos = i => { const k = i % 6, p = slotPos(k), f = i < 6 ? 1 : 2; return { x: p.x * f, y: p.y * f, a: p.a }; };
  function runNeighbors(i) { if (i < 6) return [(i + 1) % 6, (i + 5) % 6, i + 6]; return [i - 6]; }
  // per-slot effect multiplier: level × (1 + amplifier bonus from neighbours)
  // tile training (2026-11-07, permanent upgrades): +10% tile power per level, by family (attack / defence / support)
  const TRAIN_OF = { battery: 'atk', hangar: 'atk', missile: 'atk', shield: 'def', repair: 'def', collector: 'sup', amplifier: 'sup' };
  const TRAIN_K = 0.1;
  function runTileInfo(tiles, train) {
    const tm = type => 1 + TRAIN_K * ((train && train[TRAIN_OF[type]]) || 0);
    return tiles.map((t, i) => {
      if (!t) return null;
      const nb = runNeighbors(i).map(j => tiles[j]).filter(Boolean);
      const amp = t.type === 'amplifier' ? 0 : nb.filter(x => x.type === 'amplifier').reduce((a, x) => a + (0.3 * RLV[x.lv || 1] + ((x.lv || 1) >= 3 ? 0.2 : 0)) * tm('amplifier'), 0);
      const same = nb.filter(x => x.type === t.type).length;
      return { type: t.type, lv: t.lv || 1, m: RLV[t.lv || 1] * (1 + amp) * tm(t.type), same, amp };
    });
  }
  const runHitR = tiles => tiles.slice(6).some(Boolean) ? 22 : tiles.slice(0, 6).some(Boolean) ? 13 : STATION_R;

  function stationOf(save, b) {
    if (b && b.opts && b.opts.run) return { tiles: b.opts.tiles, open: 12, orbitals: (b.cardCount && b.cardCount.orbital) || 0, proto: false, run: true };
    const tiles = [null, null, null, null, null, null];
    if (b && b.opts && b.opts.prologue) { for (let k = 0; k < 6; k++) tiles[k] = { type: k % 2 ? 'hangar' : 'battery', lv: 10 }; return { tiles, open: 6, orbitals: 3, proto: false }; }
    if (b && b.module === 'proto') { for (const k in PROTO_TILES) tiles[k] = { type: PROTO_TILES[k], lv: 1, proto: true }; return { tiles, open: 3, orbitals: 0, proto: true }; }
    const best = save.best || 0, open = SLOT_WAVES.filter(w => best >= w).length;
    const slots = (save.station && save.station.slots) || [];
    for (let i = 0; i < open; i++) if (slots[i] && slots[i].type) tiles[SLOT_ORDER[i]] = { type: slots[i].type, lv: slots[i].lv || 1 };
    return { tiles, open, orbitals: ORBITAL_WAVES.filter(w => best >= w).length, proto: false };
  }

  const ENEMY = {
    drone:   { hp: 3,  atk: 4,  spd: 14, r: 2.0, energy: 1 },
    meteor:  { hp: 10, atk: 10, spd: 7,  r: 3.4, energy: 2 },
    charger: { hp: 6,  atk: 14, spd: 22, r: 2.4, energy: 2 },
    shooter: { hp: 8,  atk: 6,  spd: 10, r: 2.6, energy: 3 },
    boss:    { hp: 90, atk: 25, spd: 5,  r: 7.0, energy: 20 },
    // swarm expansion (2026-11-06, sian 'swarm'): two new forms per sector, mixed into run waves (FOES, run.js newFoes)
    splitter: { hp: 5,  atk: 6,  spd: 10, r: 2.8, energy: 2 },   // 분열낭: bursts into 3 hatchlings when killed
    mini:     { hp: 0.8, atk: 2, spd: 18, r: 1.4, energy: 0.3 }, // hatchling (from splitter and eggs)
    volatile: { hp: 4,  atk: 18, spd: 13, r: 2.2, energy: 1 },   // 폭발 포자: big contact hit; shot down, it blasts the swarm around it
    carapace: { hp: 9,  atk: 12, spd: 6,  r: 3.2, energy: 4 },   // 갑각충: front plate takes 30% from shots coming from the station side
    mender:   { hp: 7,  atk: 4,  spd: 7,  r: 2.6, energy: 3 },   // 치유 해파리: hangs back and heals the swarm near it
    brood:    { hp: 14, atk: 16, spd: 4.5, r: 3.6, energy: 5 },  // 산란 어미: lays eggs that hatch into hatchlings
    egg:      { hp: 2,  atk: 0,  spd: 0,  r: 1.5, energy: 0.2 },
    stalker:  { hp: 5,  atk: 12, spd: 17, r: 2.4, energy: 3 }    // 위상 포식자: phases out now and then (untouchable while faded)
  };
  // when each new form joins run waves: [sector, first floor]; share = part of a wave's picks that are new forms
  const FOES = { splitter: [0, 5], volatile: [0, 5], carapace: [1, 0], mender: [1, 0], brood: [2, 0], stalker: [2, 0] };
  const FOE_RULE = { share: 0.2, front: 0.5, frontCos: 0.4, blastR: 14, blastK: 3, healR: 26, healK: 0.12, healEvery: 1.6, layEvery: 3.2, hatch: 2.5, phase: 3.2, phaseVis: 2.2, menderPark: 22 };
  const BIG_FOE = { boss: 1, carapace: 1, brood: 1 };

  // ---- active skills: two slots in a run (starting ship's own skill + a skill chip found during the run) ----
  // auto: when 'auto weapons' fires it — enemy: any target in reach · near: an enemy close to the hull · hurt: hull under 70%
  const SKILLS = {
    rail:      { name: '레일건',     cd: 25, auto: 'enemy', text: '일직선 광선. 줄에 선 적 모두에게 주포 피해 ×20' },
    emp:       { name: 'EMP 링',     cd: 40, auto: 'near',  text: '주변 적 3초 기절 + 주포 피해 ×5' },
    swarm:     { name: '편대 돌격',  cd: 30, auto: 'enemy', dur: 6, text: '6초 동안 요격기 사격 속도 ×2, 피해 ×1.5' },
    aegis:     { name: '방벽 전개',  cd: 35, auto: 'near',  dur: 5, text: '5초 동안 받는 피해를 막고 접촉한 적에게 반사' },
    salvo:     { name: '일제 사격',  cd: 32, auto: 'enemy', text: '미사일 12발을 가까운 적들에게 발사' },
    gravity:   { name: '중력 우물',  cd: 34, auto: 'enemy', dur: 3, text: '3초 동안 적을 한곳으로 끌어모으고 조금씩 피해' },
    overdrive: { name: '과충전',     cd: 30, auto: 'enemy', dur: 8, text: '8초 동안 주포·포대 연사 ×2 (포대 1개당 +10%)' },
    repair:    { name: '수리 드론',  cd: 40, auto: 'hurt',  dur: 4, text: '4초 동안 최대 선체의 25% 회복' },
    slow:      { name: '시간 왜곡',  cd: 36, auto: 'near',  dur: 6, text: '6초 동안 적 이동·사격 속도 절반' }
  };
  function derived(save, b) {
    const L = id => save.shipyard[id] || 0;
    const c = id => b ? (b.cardCount[id] || 0) : 0;
    const inr = id => b ? b.inrun[id] : 0;
    const moduleMul = b && b.module === 'proto' ? 1.5 : 1;
    const st = stationOf(save, b), tsum = type => st.tiles.reduce((a, t) => a + (t && t.type === type ? tileMul(t.lv) : 0), 0), tcount = type => st.tiles.filter(t => t && t.type === type).length;
    const shieldM = tsum('shield'), collM = tsum('collector');
    const enh = id => 1 + 0.01 * ((save.enh && save.enh[id]) || 0);
    const hullMax = TUNE.hullBase * poly(L('hull')) * enh('hull') * (1 + 0.12 * inr('hull')) * (1 + 0.3 * c('plating')) * (1 + 0.08 * shieldM);
    const out = {
      dmg: 4 * poly(L('dmg')) * enh('dmg') * (1 + 0.12 * inr('dmg')) * (1 + 0.25 * c('overcharge')) * moduleMul,
      rate: Math.min(12, 1.2 * (1 + TUNE.rateStep * L('rate')) * (1 + 0.06 * inr('rate')) * (1 + 0.2 * c('rapid'))),
      crit: Math.min(0.75, 0.05 + 0.01 * L('crit') + 0.1 * c('scope')),
      range: (40 + L('range')) * (1 + 0.15 * c('optics')),
      hullMax,
      regen: (TUNE.regenAbs ? TUNE.regenAbs * (1 + 0.15 * L('regen')) : hullMax * TUNE.regenPct * (1 + TUNE.regenG * L('regen'))) * (1 + 0.12 * inr('regen')) * (1 + 0.1 * shieldM),
      armor: Math.min(0.6, 0.01 * L('armor') + 0.02 * tcount('shield')),
      energyMul: (1 + 0.05 * L('energy')) * (1 + 0.12 * collM),
      dataMul: enh('data') * (1 + 0.03 * L('datab')) * (1 + 0.03 * (save.research.levels.econ || 0)) * (1 + 0.2 * c('harvest')) * (1 + 0.06 * collM),
      cdMul: Math.pow(0.8, c('coolant')),
      pierce: c('pierce'), chain: c('chain'), thorns: c('thorns')
    };
    if (b && b.opts && b.opts.run) {
      const info = runTileInfo(b.opts.tiles, b.opts.train), sum = (type, f) => info.reduce((a, t) => a + (t && t.type === type ? f(t) : 0), 0);
      const hitR = runHitR(b.opts.tiles);
      out.hullMax = TUNE.runHull * (1 + 0.3 * c('plating')) + sum('shield', t => 25 * t.m + (t.lv >= 3 ? 25 : 0));
      out.armor = Math.min(0.6, sum('shield', t => 0.04 * RLV[t.lv] + 0.02 * t.same + (t.lv >= 3 ? 0.03 : 0)));
      out.regen = sum('repair', t => 0.6 * t.m);
      out.energyMul = (1 + sum('collector', t => 0.25 * t.m + (t.lv >= 3 ? 0.25 : 0))) * (1 + 0.2 * c('harvest'));
      out.dataMul = 1;
      out.range += hitR - STATION_R; // range is measured from the hull, so a bigger station keeps its reach
      out.hitR = hitR; out.info = info;
      out.dmg *= b.opts.dmgMul || 1; // meta: shipyard turret upgrade / frame penalty
      out.cdMul *= Math.pow(0.7, c('railcool'));
      out.craftRate = Math.pow(1.3, c('hangarclock')); out.blastMul = Math.pow(1.4, c('warhead'));
    }
    if (b && b.opts && b.opts.prologue) Object.assign(out, { dmg: 400, rate: 12, crit: 0.5, range: 95, hullMax: 5000, regen: 0, armor: 0, pierce: 2, chain: 1, cdMul: 1 });
    return out;
  }

  class Battle {
    constructor(save, opts) {
      this.save = save;
      this.opts = Object.assign({ seed: 1, tutorial: false, prologue: false, headless: false, autoUpgrade: false, autoWeapons: false, run: false }, opts);
      this.waveSec = this.opts.prologue ? 3 : this.opts.tutorial ? 12 : WAVE_SEC; // tutorial waves are short so the first minute is dense
      this.rng = mulberry32(this.opts.seed >>> 0);
      this.t = 0; this.wave = this.opts.run ? this.opts.waveStart : 1; this.waveT = 0;
      this.waveEnd = this.opts.run ? this.opts.waveStart + this.opts.waveCount - 1 : Infinity; this.spawnDone = false; this.missiles = [];
      this.enemies = []; this.projs = []; this.bullets = [];
      this.inrun = { dmg: 0, rate: 0, hull: 0, regen: 0 };
      this.cardCount = Object.assign({}, this.opts.relics || {}); this.cardsTaken = [];
      this.module = null; // 'proto' during tutorial
      this.buff = {}; this.gwell = null;
      if (this.opts.skills) { // run mode: the two skill slots decide which weapons exist
        this.slots = this.opts.skills.slice(0, 2); this.weapons = {};
        for (const id of this.slots) if (id && SKILLS[id]) this.weapons[id] = { unlocked: true, cd: 0, max: SKILLS[id].cd * (this.opts.skillCd || 1) };
      } else {
        this.slots = ['rail', 'emp'];
        this.weapons = {
          rail: { unlocked: !this.opts.tutorial || this.opts.prologue, cd: 0, max: this.opts.prologue ? 2.5 : 25 },
          emp:  { unlocked: this.opts.prologue || (this.opts.run ? !!(this.opts.relics && this.opts.relics.emp) : (!this.opts.tutorial && (save.best || 0) >= 20)), cd: 0, max: this.opts.prologue ? 7 : 40 }
        };
      }
      this.energy = 15 * (save.research.levels.start || 0);
      this.data = 0; this.kills = 0; this.cells = 0;
      this.spawnPlan = []; this.fireT = 0;
      this.events = []; this.over = false; this.reason = null; this.paused = false;
      this.planetCleared = false;
      const d = derived(save, this);
      this.hull = this.opts.run && this.opts.hull != null ? Math.min(d.hullMax, this.opts.hull) : d.hullMax; this.d = d;
      this.hitR = d.hitR || STATION_R;
      this.craft = []; this.batteries = []; this.orbitals = 0;
      this.setupStation();
      this.planWave();
    }
    refresh() {
      const old = this.d.hullMax;
      this.d = derived(this.save, this);
      if (this.d.hullMax > old) this.hull += this.d.hullMax - old;
      this.setupStation();
    }
    // build interceptors / batteries / orbitals from the current tiles; existing craft keep flying
    setupStation() {
      const st = stationOf(this.save, this); this.station = st;
      const want = [], info = this.opts.run ? runTileInfo(st.tiles, this.opts.train) : null, posOf = k => this.opts.run ? runPos(k) : slotPos(k);
      this.posOf = posOf;
      st.tiles.forEach((t, k) => { if (t && t.type === 'hangar') { const aw = info && info[k].lv >= 3 ? 1 : 0, n = info ? Math.min(4 + aw, 2 + info[k].same + aw) : 2; for (let j = 0; j < n; j++) want.push({ k, j, lv: t.lv, m: info ? info[k].m * TUNE.runCraft : tileMul(t.lv) }); } });
      const old = this.craft;
      this.craft = want.map(w => {
        const o = old.find(c => c.k === w.k && c.j === w.j); if (o) { o.lv = w.lv; o.m = w.m; return o; }
        const p = posOf(w.k); if (!this.opts.headless) this.events.push({ type: 'launch', x: p.x, y: p.y });
        return { k: w.k, j: w.j, lv: w.lv, m: w.m, x: p.x, y: p.y, vx: Math.cos(p.a) * 40, vy: Math.sin(p.a) * 40, ang: p.a, cd: 0.4 + 0.3 * w.j, tgt: null };
      });
      const oldB = this.batteries;
      this.batteries = []; st.tiles.forEach((t, k) => { if (t && t.type === 'battery') { const o = oldB.find(x => x.k === k); this.batteries.push({ k, lv: t.lv, twin: !!info && t.lv >= 3, m: info ? info[k].m * (1 + 0.2 * info[k].same) * TUNE.runBat : tileMul(t.lv), fireT: o ? o.fireT : 0.15 * k, aim: o ? o.aim : posOf(k).a }); } });
      this.launchers = []; if (info) st.tiles.forEach((t, k) => { if (t && t.type === 'missile') this.launchers.push({ k, lv: t.lv, twin: t.lv >= 3, m: info[k].m * TUNE.runMis, blast: 10 * (1 + 0.25 * info[k].same), cd: 0.8 + 0.4 * k }); });
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
      const nf = this.opts.newFoes || [];
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
      if (this.opts.run ? (this.opts.boss && w === this.opts.waveStart) : w % 10 === 0) plan.unshift({ at: 0, type: 'boss' });
      this.spawnPlan = plan;
    }
    spawn(type, pack, at) {
      const E = ENEMY[type], s = this.scale(this.wave);
      const a = at ? Math.atan2(at.y, at.x) : (pack !== undefined && this.packAng) ? this.packAng[pack] + (this.rng() - 0.5) * 0.5 : this.rng() * Math.PI * 2;
      let hpMul = 1, atkMul = 1;
      const dil = (!this.opts.prologue && !(this.opts.tutorial && this.wave <= 3) && type !== 'boss') ? 1 / TUNE.swarm : 1; // split the wave's threat across more bodies
      if (this.opts.prologue) { hpMul = type === 'boss' ? 400 : 6; atkMul = type === 'boss' ? 1 : 0.05; }
      else if (this.opts.run) { hpMul = TUNE.runHp * (this.opts.foeHp || 1); atkMul = TUNE.runAtk * (this.opts.foeAtk || 1); if (type === 'boss') { hpMul *= (this.opts.bossHp || 1) * (this.opts.foeBoss || 1); atkMul *= TUNE.runBossAtk; } } // foe*: threat-level modifiers
      else if (this.opts.tutorial) { // gentle first minutes, then a scripted first destruction
        if (this.wave >= 13) { hpMul = 3; atkMul = 1.6; } else if (this.wave <= 3) { hpMul = 0.35; atkMul = 0.4; } else { hpMul = 1.8; atkMul = 0.6; }
      }
      const e = {
        type, x: at ? at.x : Math.cos(a) * SPAWN_R, y: at ? at.y : Math.sin(a) * SPAWN_R, ang: a,
        hp: E.hp * s * hpMul * TUNE.hpMul * dil, maxhp: E.hp * s * hpMul * TUNE.hpMul * dil, atk: E.atk * Math.pow(TUNE.atkG, this.wave - 1) * atkMul * dil,
        spd: E.spd * (this.opts.foeSpd || 1) * (this.opts.prologue || this.opts.tutorial ? 1 : Math.min(TUNE.spdMax, 1 + TUNE.spdG * (this.wave - 1))), r: E.r, stun: 0, shootCd: 2.5, biteCd: 0, dead: false
      };
      if (type === 'stalker') e.phT = this.rng() * FOE_RULE.phase; else if (type === 'mender') e.healT = FOE_RULE.healEvery; else if (type === 'brood') e.layT = FOE_RULE.layEvery * 0.6; else if (type === 'egg') e.hatch = FOE_RULE.hatch;
      if (FOES[type] && !(this.met || (this.met = {}))[type]) { this.met[type] = 1; this.events.push({ type: 'newfoe', etype: type }); }
      if (this.opts.run && this.opts.elite && type !== 'boss' && type !== 'mini' && type !== 'egg' && (this.spawnN = (this.spawnN || 0) + 1) % 4 === 0) { e.elite = true; e.hp *= 3; e.maxhp *= 3; e.atk *= 1.5; e.r *= 1.3; }
      this.enemies.push(e);
      if (type === 'boss') this.events.push({ type: 'boss', wave: this.wave });
    }
    damageStation(amount, src) {
      if ((this.buff.aegis || 0) > this.t) return amount * 0.8; // barrier up: nothing gets through, contact damage bounces back
      const dealt = amount * (1 - this.d.armor);
      this.hull -= dealt;
      if (!this.opts.headless && src && dealt > 0) this.events.push({ type: 'hurt', x: src.x, y: src.y, v: dealt }); // drawing only: where the station got hit
      if (this.d.thorns) return dealt * 0.3 * this.d.thorns;
      return 0;
    }
    killEnemy(e) {
      if (e.dead) return;
      e.dead = true; this.kills++;
      if (e.type === 'boss') { this.cells++; this.events.push({ type: 'cell', x: e.x, y: e.y }); }
      this.energy += ENEMY[e.type].energy * (e.elite ? 3 : 1) * this.d.energyMul * Math.pow(TUNE.energyG, this.wave - 1);
      this.events.push({ type: 'kill', x: e.x, y: e.y, etype: e.type, big: !!(BIG_FOE[e.type] || e.elite) });
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
    nearest(x, y, maxR, exclude) {
      let best = null, bd = maxR * maxR;
      for (const e of this.enemies) {
        if (e.dead || e === exclude || e.ghost) continue;
        const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = e; }
      }
      return best;
    }
    buyInrun(id) {
      const c = inrunCost(this.inrun[id]);
      if (this.energy < c || this.over) return false;
      this.energy -= c; this.inrun[id]++; this.refresh();
      this.events.push({ type: 'inrun', id });
      return true;
    }
    takeCard(id) {
      this.cardCount[id] = (this.cardCount[id] || 0) + 1; this.cardsTaken.push(id);
      this.refresh();
      if (id === 'plating') this.hull = this.d.hullMax;
      this.paused = false;
    }
    offerCards() {
      const pool = CARDS.slice(), pick = [];
      for (let i = 0; i < 3; i++) pick.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
      return pick;
    }
    fireWeapon(id) {
      const w = this.weapons[id];
      if (!w || !w.unlocked || w.cd > 0 || this.over) return false;
      const selfOnly = id === 'repair' || id === 'aegis';
      const target = this.nearest(0, 0, 200);
      if (!target && !selfOnly) return false;
      w.cd = w.max * this.d.cdMul;
      const S = SKILLS[id];
      if (id === 'swarm' || id === 'aegis' || id === 'overdrive' || id === 'repair' || id === 'slow') { this.buff[id] = this.t + S.dur; this.events.push({ type: 'skill', id }); return true; }
      if (id === 'salvo') {
        const tg = this.enemies.filter(e => !e.dead).sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y)).slice(0, 12);
        for (let i = 0; i < 12 && tg.length; i++) { const e = tg[i % tg.length], a = i / 12 * 6.283, dmg = this.d.dmg * 2.2; e.pending = (e.pending || 0) + dmg * 0.5; this.projs.push({ x: Math.cos(a) * this.hitR, y: Math.sin(a) * this.hitR, tgt: e, dmg, crit: false, pierce: 0, booked: dmg * 0.5, src: 'missile', splash: 9, spd: 130 }); }
        this.events.push({ type: 'skill', id }); return true;
      }
      if (id === 'gravity') {
        let best = target, bn = -1; for (const e of this.enemies) { if (e.dead) continue; let n = 0; for (const o of this.enemies) { if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 900) n++; } if (n > bn) { bn = n; best = e; } }
        this.gwell = { x: best.x, y: best.y, until: this.t + S.dur }; this.events.push({ type: 'skill', id, x: best.x, y: best.y }); return true;
      }
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
      if (this.opts.run && this.wave >= this.waveEnd && !this.spawnPlan.length) this.spawnDone = true;
      if (this.waveT >= this.waveSec && !this.spawnDone) {
        this.data += 3 * d.dataMul;
        this.events.push({ type: 'wave', wave: this.wave });
        if (this.wave === 50 && !this.planetCleared) { this.planetCleared = true; this.events.push({ type: 'planet' }); }
        this.wave++; this.waveT = 0; this.planWave();
        if ((this.wave - 1) % 5 === 0 && !this.opts.prologue && !this.opts.run) { this.paused = true; this.events.push({ type: 'cards', cards: this.offerCards() }); }
      }
      // weapons cooldown + auto
      for (const k in this.weapons) { const w = this.weapons[k]; if (w.cd > 0) w.cd = Math.max(0, w.cd - dt); }
      if (this.opts.autoWeapons) {
        if (!this.opts.skills) { this.fireWeapon('rail'); this.fireWeapon('emp'); }
        else for (const id of this.slots) {
          const S = SKILLS[id]; if (!S || !this.weapons[id] || this.weapons[id].cd > 0) continue;
          if (S.auto === 'hurt' ? this.hull < this.d.hullMax * 0.7 : S.auto === 'near' ? !!this.nearest(0, 0, this.hitR + 22) || this.bullets.length > 3 : true) this.fireWeapon(id);
        }
      }
      // gravity well: drag nearby enemies into the point and grind them
      if (this.gwell && this.t < this.gwell.until) for (const e of this.enemies) { if (e.dead) continue; const dx = this.gwell.x - e.x, dy = this.gwell.y - e.y, dd = Math.hypot(dx, dy); if (dd < 45 && dd > 0.5) { const mv = Math.min(dd, 45 * dt); e.x += dx / dd * mv; e.y += dy / dd * mv; e.gT = this.t + 0.1; if (dd < 6) this.hit(e, d.dmg * 0.9 * dt, false); } }
      const slowK = (this.buff.slow || 0) > this.t ? 0.5 : 1, odK = (this.buff.overdrive || 0) > this.t ? 2 * (1 + 0.1 * this.batteries.length) : 1, swK = (this.buff.swarm || 0) > this.t;
      if ((this.buff.repair || 0) > this.t) this.hull = Math.min(d.hullMax, this.hull + d.hullMax * 0.25 / 4 * dt);
      // enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.stun > 0) { e.stun -= dt; continue; }
        if ((e.gT || 0) > this.t) continue; // held by the gravity well
        if (e.type === 'egg') { e.hatch -= dt; if (e.hatch <= 0) { e.dead = true; this.events.push({ type: 'hatch', x: e.x, y: e.y }); this.spawn('mini', undefined, { x: e.x, y: e.y }); } continue; }
        if (e.type === 'stalker') { e.phT += dt; const was = e.ghost; e.ghost = (e.phT % FOE_RULE.phase) > FOE_RULE.phaseVis; if (e.ghost !== was && !this.opts.headless) this.events.push({ type: 'phase', x: e.x, y: e.y, out: e.ghost }); }
        if (e.type === 'mender') { e.healT -= dt; if (e.healT <= 0) { e.healT = FOE_RULE.healEvery; let n = 0; for (const o of this.enemies) { if (o.dead || o === e || o.type === 'egg') continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < FOE_RULE.healR * FOE_RULE.healR && o.hp < o.maxhp) { o.hp = Math.min(o.maxhp, o.hp + o.maxhp * FOE_RULE.healK); n++; } } this.events.push({ type: 'heal', x: e.x, y: e.y, n }); } }
        const dist = Math.hypot(e.x, e.y);
        if (e.type === 'brood') { e.layT -= dt; if (e.layT <= 0 && dist > this.hitR + 20 && this.enemies.length < 60) { e.layT = FOE_RULE.layEvery; this.spawn('egg', undefined, { x: e.x * 1.05, y: e.y * 1.05 }); } }
        const stopAt = e.type === 'shooter' ? (this.opts.run ? this.hitR + 28 : 60) : e.type === 'mender' ? this.hitR + FOE_RULE.menderPark : this.hitR + e.r; // run mode: shooters park inside turret reach, so builds are never hard-walled
        if (dist > stopAt) {
          const mv = Math.min(e.spd * slowK * (e.ghost ? 1.5 : 1) * dt, dist - stopAt);
          e.x -= e.x / dist * mv; e.y -= e.y / dist * mv;
        } else if (e.type === 'mender') { /* parked behind the swarm, healing */
        } else if (e.type === 'shooter') {
          e.shootCd -= dt * slowK;
          if (e.shootCd <= 0) { e.shootCd = 2.5; this.bullets.push({ x: e.x, y: e.y, atk: e.atk }); }
        } else if (e.type === 'boss') {
          e.biteCd -= dt;
          if (e.biteCd <= 0) { e.biteCd = 1.5; const ref = this.damageStation(e.atk, e); if (ref) this.hit(e, ref, false); }
        } else {
          const ref = this.damageStation(e.atk, e);
          e.dead = true; // kamikaze, no energy
          if (ref) { /* reflected damage has no target left */ }
        }
      }
      // enemy bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i], dist = Math.hypot(b.x, b.y);
        if (dist <= this.hitR) { this.damageStation(b.atk, b); this.bullets.splice(i, 1); continue; }
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
          this.fireT = 1 / (d.rate * odK);
          const crit = this.rng() < d.crit, dmg = d.dmg * (crit ? 2 : 1);
          tgt.pending = (tgt.pending || 0) + dmg;
          this.projs.push({ x: 0, y: 0, tgt, dmg, crit, pierce: d.pierce, booked: dmg });
        } else this.fireT = 0;
      }
      // projectiles (homing)
      for (let i = this.projs.length - 1; i >= 0; i--) {
        const p = this.projs[i];
        if (p.tgt.dead) {
          if (p.pierce > 0) { const n = this.nearest(p.x, p.y, 25); if (n) { p.tgt = n; p.booked = 0; } else { this.projs.splice(i, 1); continue; } }
          else { this.projs.splice(i, 1); continue; }
        }
        const dx = p.tgt.x - p.x, dy = p.tgt.y - p.y, dist = Math.hypot(dx, dy), mv = (p.spd || 130) * dt;
        if (dist <= mv + p.tgt.r) {
          const tgt = p.tgt;
          if (p.booked) { tgt.pending = Math.max(0, (tgt.pending || 0) - p.booked); p.booked = 0; }
          this.hit(tgt, p.dmg, p.crit, p);
          if (p.splash) {
            for (const e of this.enemies) { if (e.dead || e === tgt) continue; const ex = e.x - tgt.x, ey = e.y - tgt.y, rr = p.splash + e.r; if (ex * ex + ey * ey < rr * rr) this.hit(e, p.dmg * 0.6, false); }
            if (!this.opts.headless) this.events.push({ type: 'blast', x: tgt.x, y: tgt.y, r: p.splash });
          }
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
        const p = this.posOf(bt.k); bt.fireT = 1 / (d.rate * 0.6 * odK); bt.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const crit = this.rng() < d.crit, dmg = d.dmg * 0.4 * (bt.m || tileMul(bt.lv)) * (crit ? 2 : 1);
        tgt.pending = (tgt.pending || 0) + dmg;
        this.projs.push({ x: p.x, y: p.y, tgt, dmg, crit, pierce: 0, booked: dmg, src: 'battery' });
        if (bt.twin) { // awakened: the second barrel takes the next-farthest target (or the same one if alone)
          let t2 = tgt, b2 = -1; for (const e of this.enemies) { if (e === tgt || e.dead || (e.pending || 0) >= e.hp) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 < R2 && d2 > b2) { b2 = d2; t2 = e; } }
          const c2 = this.rng() < d.crit, dmg2 = d.dmg * 0.4 * bt.m * (c2 ? 2 : 1); t2.pending = (t2.pending || 0) + dmg2;
          this.projs.push({ x: p.x, y: p.y, tgt: t2, dmg: dmg2, crit: c2, pierce: 0, booked: dmg2, src: 'battery' }); bt.aim2 = Math.atan2(t2.y - p.y, t2.x - p.x);
        }
      }
      // interceptors: leave the station, strafe a target, return when the sky is clear
      if (this.craft.length) {
        const leash = d.range, L2 = leash * leash, cdBase = 1.1 / Math.sqrt(Math.max(1, d.rate / 1.2)) / (d.craftRate || 1);
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
          else { const oa = this.t * 1.1 + c.j * Math.PI + c.k * 1.05, orr = this.hitR + 10; gx = Math.cos(oa) * orr; gy = Math.sin(oa) * orr; }
          const dx = gx - c.x, dy = gy - c.y, dist = Math.hypot(dx, dy) || 1, sp = c.tgt ? 62 : 38, k = Math.min(1, dt * 4);
          c.vx += (dx / dist * sp - c.vx) * k; c.vy += (dy / dist * sp - c.vy) * k;
          c.x += c.vx * dt; c.y += c.vy * dt; c.ang = Math.atan2(c.vy, c.vx);
          c.cd -= dt;
          if (c.tgt && c.cd <= 0) {
            const ex = c.tgt.x - c.x, ey = c.tgt.y - c.y;
            if (ex * ex + ey * ey < 20 * 20) {
              c.cd = cdBase / (swK ? 2 : 1); const crit = this.rng() < d.crit, dmg = d.dmg * 0.25 * (c.m || tileMul(c.lv)) * (crit ? 2 : 1) * (swK ? 1.5 : 1);
              if (!this.opts.headless) this.events.push({ type: 'zap', x1: c.x, y1: c.y, x2: c.tgt.x, y2: c.tgt.y });
              this.hit(c.tgt, dmg, crit, c);
            }
          }
        }
      }
      // orbitals: ram enemies on their path and swallow enemy shots
      for (let i = 0; i < this.orbitals; i++) {
        const o = orbitalPos(this.t, i, this.orbitals, (this.hitR + 13) / 20);
        for (let j = this.bullets.length - 1; j >= 0; j--) { const bl = this.bullets[j], dx = bl.x - o.x, dy = bl.y - o.y; if (dx * dx + dy * dy < 30) { this.bullets.splice(j, 1); if (!this.opts.headless) this.events.push({ type: 'block', x: o.x, y: o.y }); } }
        for (const e of this.enemies) {
          if (e.dead || (e.orbT || 0) > this.t) continue;
          const dx = e.x - o.x, dy = e.y - o.y, rr = 3.5 + e.r;
          if (dx * dx + dy * dy < rr * rr) { e.orbT = this.t + 0.5; this.hit(e, d.dmg * 1.5, false, o); }
        }
      }
      // missile launchers: heavy shot aimed at the densest cluster in reach (skips targets already doomed)
      for (const L of this.launchers) {
        L.cd -= dt; if (L.cd > 0) continue;
        const p = this.posOf(L.k), R2 = (d.range * 1.15) * (d.range * 1.15), blast = L.blast * (d.blastMul || 1);
        let tgt = null, best = -1;
        for (const e of this.enemies) {
          if (e.dead || e.ghost || (e.pending || 0) >= e.hp) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 > R2) continue;
          let n = 0; for (const o of this.enemies) { if (o.dead) continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < blast * blast) n++; }
          const sc = n * 10 - Math.sqrt(d2) * 0.05; if (sc > best) { best = sc; tgt = e; }
        }
        if (!tgt) { L.cd = 0.2; continue; }
        L.cd = 2.2; const dmg = d.dmg * 1.0 * L.m;
        tgt.pending = (tgt.pending || 0) + dmg;
        this.projs.push({ x: p.x, y: p.y, tgt, dmg, crit: false, pierce: 0, booked: dmg, src: 'missile', splash: blast, spd: 120 });
        if (L.twin) { // awakened: second missile to the best cluster away from the first blast
          let t2 = null, b2 = -1;
          for (const e of this.enemies) {
            if (e.dead || e.ghost || (e.pending || 0) >= e.hp) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 > R2) continue;
            const fx = e.x - tgt.x, fy = e.y - tgt.y; if (fx * fx + fy * fy < blast * blast) continue;
            let n = 0; for (const o of this.enemies) { if (o.dead) continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < blast * blast) n++; }
            const sc = n * 10 - Math.sqrt(d2) * 0.05; if (sc > b2) { b2 = sc; t2 = e; }
          }
          if (!t2) t2 = tgt; t2.pending = (t2.pending || 0) + dmg;
          this.projs.push({ x: p.x, y: p.y, tgt: t2, dmg, crit: false, pierce: 0, booked: dmg, src: 'missile', splash: blast, spd: 112 });
        }
      }
      if (this.opts.run && this.spawnDone && !this.over && this.enemies.every(e => e.dead)) this.end('victory');
      if (this.enemies.length > 64) this.enemies = this.enemies.filter(e => !e.dead);
      // regen + auto upgrade
      this.hull = Math.min(d.hullMax, this.hull + d.regen * dt);
      if (this.opts.autoUpgrade) {
        let best = null;
        for (const u of INRUN) { const c = inrunCost(this.inrun[u.id]); if (!best || c < best.c) best = { id: u.id, c }; }
        if (best && this.energy >= best.c) this.buyInrun(best.id);
      }
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
      if (this.hull <= 0 && this.opts.lastStand && !this.lastStood && !this.opts.prologue) { this.lastStood = true; this.hull = this.d.hullMax * this.opts.lastStand; this.events.push({ type: 'laststand' }); } // emergency barrier (permanent upgrade, once per run)
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
      research: { levels: { cap: 0, econ: 0, start: 0 }, slots: [null, null] },
      station: { slots: [null, null, null, null, null, null] },
      tutorial: 0, settings: { speed: 2, researchScale: 1, autoUpgrade: false, autoWeapons: false },
      log: [], funnel: {}
    };
  }
  const capOf = save => 20 + (save.research.levels.cap || 0);

  // Headless: run one full battle with auto-play, return the reached wave.
  function simulateRun(save, seed) {
    const b = new Battle(save, { seed, headless: true, autoUpgrade: true, autoWeapons: true });
    b.weapons.rail.unlocked = true; b.weapons.emp.unlocked = true;
    const prio = ['overcharge', 'rapid', 'plating', 'scope', 'chain', 'pierce', 'optics', 'thorns', 'coolant', 'harvest'];
    let guard = 0;
    while (!b.over && guard++ < 200000) {
      b.step();
      for (const ev of b.events) if (ev.type === 'cards') {
        const pick = ev.cards.slice().sort((x, y) => prio.indexOf(x.id) - prio.indexOf(y.id))[0];
        b.takeCard(pick.id);
      }
      b.events.length = 0;
    }
    return { wave: b.wave, data: b.data, reason: b.reason, t: b.t, kills: b.kills };
  }

  root.SZE = { TRAIN_OF, TRAIN_K, FOES, FOE_RULE, BIG_FOE, TUNE, poly, researchCost, CELL_MINUTES, ENH, ENH_UNLOCK_WAVE, ENH_MAX, enhCost, TICK, WAVE_SEC, STATION_R, SPAWN_R, STATS, statCost, RESEARCH, RESEARCH_HOURS, INRUN, inrunCost, CARDS, ENEMY,
    derived, Battle, newSave, capOf, simulateRun, MOTHER, SKILLS,
    RT, RLV, AWAKE, runPos, runNeighbors, runTileInfo, runHitR,
    TILE_TYPES, SLOT_WAVES, SLOT_ORDER, ORBITAL_WAVES, TILE_MAX, tileCost, tileMul, slotPos, orbitalPos, stationOf, ORBIT };
})(typeof window !== 'undefined' ? window : globalThis);
