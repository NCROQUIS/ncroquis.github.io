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
  function orbitalPos(t, i, n) {
    const th = t * ORBIT.w + i * TAU / n, lx = Math.cos(th) * ORBIT.a, ly = Math.sin(th) * ORBIT.b;
    return { x: lx * Math.cos(ORBIT.tilt) - ly * Math.sin(ORBIT.tilt), y: lx * Math.sin(ORBIT.tilt) + ly * Math.cos(ORBIT.tilt), depth: Math.sin(th) };
  }
  const PROTO_TILES = { 1: 'hangar', 3: 'battery', 5: 'hangar' };
  function stationOf(save, b) {
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
    boss:    { hp: 90, atk: 25, spd: 5,  r: 7.0, energy: 20 }
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
      this.inrun = { dmg: 0, rate: 0, hull: 0, regen: 0 };
      this.cardCount = {}; this.cardsTaken = [];
      this.module = null; // 'proto' during tutorial
      this.weapons = {
        rail: { unlocked: !this.opts.tutorial || this.opts.prologue, cd: 0, max: this.opts.prologue ? 4 : 25 },
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
    }
    // build interceptors / batteries / orbitals from the current tiles; existing craft keep flying
    setupStation() {
      const st = stationOf(this.save, this); this.station = st;
      const want = [];
      st.tiles.forEach((t, k) => { if (t && t.type === 'hangar') for (let j = 0; j < 2; j++) want.push({ k, j, lv: t.lv }); });
      const old = this.craft;
      this.craft = want.map(w => {
        const o = old.find(c => c.k === w.k && c.j === w.j); if (o) { o.lv = w.lv; return o; }
        const p = slotPos(w.k); if (!this.opts.headless) this.events.push({ type: 'launch', x: p.x, y: p.y });
        return { k: w.k, j: w.j, lv: w.lv, x: p.x, y: p.y, vx: Math.cos(p.a) * 40, vy: Math.sin(p.a) * 40, ang: p.a, cd: 0.4 + 0.3 * w.j, tgt: null };
      });
      const oldB = this.batteries;
      this.batteries = []; st.tiles.forEach((t, k) => { if (t && t.type === 'battery') { const o = oldB.find(x => x.k === k); this.batteries.push({ k, lv: t.lv, fireT: o ? o.fireT : 0.15 * k, aim: o ? o.aim : slotPos(k).a }); } });
      this.orbitals = st.orbitals;
    }
    scale(w) { return Math.pow(TUNE.hpG, w - 1) * Math.pow(TUNE.hpG2, Math.max(0, w - TUNE.late)); }
    planWave() {
      const w = this.wave, plan = [];
      if (this.opts.prologue) { // a swarm the endgame station shreds
        for (let i = 0; i < 72; i++) plan.push({ at: (i / 72) * 2.8, type: i % 6 === 0 ? 'meteor' : i % 9 === 0 ? 'charger' : 'drone' });
        if (w === 7) plan.unshift({ at: 0, type: 'boss' });
        this.spawnPlan = plan; return;
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
      const pick = () => {
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
    spawn(type, pack) {
      const E = ENEMY[type], s = this.scale(this.wave);
      const a = (pack !== undefined && this.packAng) ? this.packAng[pack] + (this.rng() - 0.5) * 0.5 : this.rng() * Math.PI * 2;
      let hpMul = 1, atkMul = 1;
      const dil = (!this.opts.prologue && !(this.opts.tutorial && this.wave <= 3) && type !== 'boss') ? 1 / TUNE.swarm : 1; // split the wave's threat across more bodies
      if (this.opts.prologue) { hpMul = type === 'boss' ? 400 : 6; atkMul = type === 'boss' ? 1 : 0.05; }
      else if (this.opts.tutorial) { // gentle first minutes, then a scripted first destruction
        if (this.wave >= 13) { hpMul = 3; atkMul = 1.6; } else if (this.wave <= 3) { hpMul = 0.35; atkMul = 0.4; } else { hpMul = 1.8; atkMul = 0.6; }
      }
      const e = {
        type, x: Math.cos(a) * SPAWN_R, y: Math.sin(a) * SPAWN_R, ang: a,
        hp: E.hp * s * hpMul * TUNE.hpMul * dil, maxhp: E.hp * s * hpMul * TUNE.hpMul * dil, atk: E.atk * Math.pow(TUNE.atkG, this.wave - 1) * atkMul * dil,
        spd: E.spd * (this.opts.prologue || this.opts.tutorial ? 1 : Math.min(TUNE.spdMax, 1 + TUNE.spdG * (this.wave - 1))), r: E.r, stun: 0, shootCd: 2.5, biteCd: 0, dead: false
      };
      this.enemies.push(e);
      if (type === 'boss') this.events.push({ type: 'boss', wave: this.wave });
    }
    damageStation(amount) {
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
      this.events.push({ type: 'kill', x: e.x, y: e.y, etype: e.type });
    }
    hit(e, dmg, crit) {
      e.hp -= dmg;
      if (!this.opts.headless) this.events.push({ type: 'hit', x: e.x, y: e.y, v: dmg, crit });
      if (crit) this.events.push({ type: 'crit', x: e.x, y: e.y, v: dmg });
      if (e.hp <= 0) this.killEnemy(e);
    }
    nearest(x, y, maxR, exclude) {
      let best = null, bd = maxR * maxR;
      for (const e of this.enemies) {
        if (e.dead || e === exclude) continue;
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
        this.wave++; this.waveT = 0; this.planWave();
        if ((this.wave - 1) % 5 === 0 && !this.opts.prologue) { this.paused = true; this.events.push({ type: 'cards', cards: this.offerCards() }); }
      }
      // weapons cooldown + auto
      for (const k in this.weapons) { const w = this.weapons[k]; if (w.cd > 0) w.cd = Math.max(0, w.cd - dt); }
      if (this.opts.autoWeapons) { this.fireWeapon('rail'); this.fireWeapon('emp'); }
      // enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.stun > 0) { e.stun -= dt; continue; }
        const dist = Math.hypot(e.x, e.y);
        const stopAt = e.type === 'shooter' ? 60 : e.type === 'boss' ? STATION_R + e.r : STATION_R + e.r;
        if (dist > stopAt) {
          const mv = Math.min(e.spd * dt, dist - stopAt);
          e.x -= e.x / dist * mv; e.y -= e.y / dist * mv;
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
          if (e.dead || (e.pending || 0) >= e.hp) continue; // already doomed by shots in flight
          const d2 = e.x * e.x + e.y * e.y;
          if (d2 < bd) { bd = d2; tgt = e; }
        }
        if (tgt) {
          this.fireT = 1 / d.rate;
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
        const dx = p.tgt.x - p.x, dy = p.tgt.y - p.y, dist = Math.hypot(dx, dy), mv = 130 * dt;
        if (dist <= mv + p.tgt.r) {
          const tgt = p.tgt;
          if (p.booked) { tgt.pending = Math.max(0, (tgt.pending || 0) - p.booked); p.booked = 0; }
          this.hit(tgt, p.dmg, p.crit);
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
        for (const e of this.enemies) { if (e.dead || (e.pending || 0) >= e.hp) continue; const d2 = e.x * e.x + e.y * e.y; if (d2 < R2 && d2 > bd) { bd = d2; tgt = e; } }
        if (!tgt) { bt.fireT = 0; continue; }
        const p = slotPos(bt.k); bt.fireT = 1 / (d.rate * 0.6); bt.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const crit = this.rng() < d.crit, dmg = d.dmg * 0.4 * tileMul(bt.lv) * (crit ? 2 : 1);
        tgt.pending = (tgt.pending || 0) + dmg;
        this.projs.push({ x: p.x, y: p.y, tgt, dmg, crit, pierce: 0, booked: dmg, src: 'battery' });
      }
      // interceptors: leave the station, strafe a target, return when the sky is clear
      if (this.craft.length) {
        const leash = d.range, L2 = leash * leash, cdBase = 1.1 / Math.sqrt(Math.max(1, d.rate / 1.2));
        for (const e of this.enemies) e.claims = 0;
        for (const c of this.craft) if (c.tgt && !c.tgt.dead) c.tgt.claims++;
        for (const c of this.craft) {
          if (c.tgt && (c.tgt.dead || c.tgt.x * c.tgt.x + c.tgt.y * c.tgt.y > L2 * 1.3)) c.tgt = null;
          if (!c.tgt) {
            let best = null, bs = Infinity;
            for (const e of this.enemies) {
              if (e.dead) continue; const r2 = e.x * e.x + e.y * e.y; if (r2 > L2) continue;
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
              c.cd = cdBase; const crit = this.rng() < d.crit, dmg = d.dmg * 0.25 * tileMul(c.lv) * (crit ? 2 : 1);
              if (!this.opts.headless) this.events.push({ type: 'zap', x1: c.x, y1: c.y, x2: c.tgt.x, y2: c.tgt.y });
              this.hit(c.tgt, dmg, crit);
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
          if (dx * dx + dy * dy < rr * rr) { e.orbT = this.t + 0.5; this.hit(e, d.dmg * 1.5, false); }
        }
      }
      if (this.enemies.length > 64) this.enemies = this.enemies.filter(e => !e.dead);
      // regen + auto upgrade
      this.hull = Math.min(d.hullMax, this.hull + d.regen * dt);
      if (this.opts.autoUpgrade) {
        let best = null;
        for (const u of INRUN) { const c = inrunCost(this.inrun[u.id]); if (!best || c < best.c) best = { id: u.id, c }; }
        if (best && this.energy >= best.c) this.buyInrun(best.id);
      }
      // prologue: once the mothership arrives, it charges and destroys the endgame station
      if (this.opts.prologue && this.wave >= 7) {
        this.motherT = (this.motherT || 0) + dt;
        if (this.motherT > 3.2 && !this.beamFired) { this.beamFired = true; this.events.push({ type: 'beam' }); }
        if (this.motherT > 4.0) { this.hull = 0; }
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
      research: { levels: { cap: 0, econ: 0, start: 0 }, slots: [null, null] },
      station: { slots: [null, null, null, null, null, null] },
      tutorial: 0, settings: { speed: 2, researchScale: 1, autoUpgrade: false, autoWeapons: false },
      log: [], funnel: {}, lastSeen: 0, offline: null
    };
  }
  const capOf = save => 20 + (save.research.levels.cap || 0);

  // ---- offline (idle) reward: an automated patrol keeps sending data while the app is closed ----
  // Active play earns ≈ 3 data × dataMul per wave, 6 waves per real minute at the default 2x (≈18/min).
  // Offline pays eff (8%) of that, scaled up by the best wave, capped at capH hours:
  //   8h at Lv0 ≈ 700 data (~40 min of active play); with the 2x ad ≈ 80 min.
  const OFFLINE = { eff: 0.08, capH: 8, minMin: 5, unlockBest: 5, bestK: 50 };
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
    const min = Math.min(rawMin, OFFLINE.capH * 60);
    return { min: Math.floor(min), rawMin: Math.floor(rawMin), capped: rawMin > OFFLINE.capH * 60, data: Math.floor(offlineRate(save) * min) };
  }

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

  root.SZE = { TUNE, poly, researchCost, CELL_MINUTES, ENH, ENH_UNLOCK_WAVE, ENH_MAX, enhCost, TICK, WAVE_SEC, STATION_R, SPAWN_R, STATS, statCost, RESEARCH, RESEARCH_HOURS, INRUN, inrunCost, CARDS, ENEMY,
    derived, Battle, newSave, capOf, simulateRun, OFFLINE, offlineUnlocked, offlineRate, offlineReward,
    TILE_TYPES, SLOT_WAVES, SLOT_ORDER, ORBITAL_WAVES, TILE_MAX, tileCost, tileMul, slotPos, orbitalPos, stationOf, ORBIT };
})(typeof window !== 'undefined' ? window : globalThis);
