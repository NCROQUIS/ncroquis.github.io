/* Station Zero v3 — roguelike run layer: sector maps, rewards, shop, events, rest. Pure logic, seeded. Uses SZE (engine). */
(function (root) {
  const E = root.SZE;
  const SECTORS = [
    { name: '섹터 1 · 루나 외곽', bossName: '군체 모함' },
    { name: '섹터 2 · 소행성대', bossName: '여왕 둥지' },
    { name: '섹터 3 · 스웜 본진', bossName: '스웜 모선' }
  ];
  // map v2 (2026-11-02), after Slay the Spire / FTL / Hades / Monster Train: 10 floors + boss on a 5-wide grid, 5 non-crossing
  // paths, fixed floors (1: fights, 5: salvage, 10: repair dock), reward preview on fights, one mutant elite per sector,
  // '?' signals that may turn out to be an ambush / trader / salvage, and a random route trait per sector
  const ROWS = 11, COLS = 5, TREASURE_ROW = 4;
  const TUNE_RUN = { sectorStep: 8, rowStep: 1.15, bossHp: [0.6, 1.0, 1.35], shardK: 0.3, simJump: true }; // simJump: balance with star-chart jumps (the default map); shardK: 2026-11-05 awakening/shop made runs go further
  const NODE = {
    battle:   { name: '전투', icon: '⚔', text: '스웜 편대와 교전. 이기면 미리 보이는 보상이 선택지에 꼭 들어갑니다.' },
    elite:    { name: '엘리트', icon: '☠', text: '강한 스웜. 위험하지만 유물 3개 중 1개를 고릅니다.' },
    mutant:   { name: '변이 엘리트', icon: '✸', text: '섹터마다 하나뿐인 변이체. 매우 위험하지만 유물 2개를 모두 얻습니다.' },
    shop:     { name: '보급선', icon: '$', text: '크레딧으로 타일·유물·수리·강화를 삽니다.' },
    event:    { name: '신호', icon: '?', text: '정체불명의 신호. 사건일 때가 많지만 매복·상인·잔해일 수도 있습니다.' },
    treasure: { name: '잔해 컨테이너', icon: '▣', text: '싸움 없이 유물이나 Lv2 타일 중 하나를 얻습니다.' },
    rest:     { name: '정비', icon: '+', text: '선체를 수리하거나 타일 하나를 강화합니다.' },
    boss:     { name: '보스', icon: '◆', text: '섹터의 끝. 이기면 다음 섹터로 넘어갑니다.' }
  };
  // FTL-style sector character: changes what the map is made of (and sometimes the scrap you earn)
  const TRAITS = [
    { id: 'trade',  name: '교역로',      text: '보급선이 많고 엘리트가 적습니다.', w: { shop: 2.2, elite: 0.6 } },
    { id: 'front',  name: '격전 지대',   text: '엘리트가 많고, 전투 크레딧 +25%.', w: { elite: 1.8 }, scrap: 1.25 },
    { id: 'debris', name: '잔해 지대',   text: '신호가 많고, 신호가 잔해일 확률 2배.', w: { event: 1.6 }, salvage: 2 },
    { id: 'calm',   name: '정적 지대',   text: '정비가 많고 전투가 조금 적습니다.', w: { rest: 1.8, battle: 0.85 } },
    { id: 'brood',  name: '스웜 번식지', text: '전투가 많고, 전투 보상이 Lv2일 때가 많습니다.', w: { battle: 1.3, event: 0.8 }, lv2: 0.35 }
  ];
  const RELICS = [
    { id: 'overcharge',  name: '과충전 탄두', text: '모든 피해 +25%' },
    { id: 'rapid',       name: '속사 회로',   text: '주포 연사 +20%' },
    { id: 'scope',       name: '치명 조준경', text: '치명타 확률 +10%p' },
    { id: 'plating',     name: '보강 장갑',   text: '기본 선체 최대치 +30%' },
    { id: 'chain',       name: '연쇄 번개',   text: '치명타 시 주변 1기에 50% 피해' },
    { id: 'thorns',      name: '반격 실드',   text: '받은 접촉 피해의 30% 반사' },
    { id: 'optics',      name: '사거리 확장', text: '사거리 +15%' },
    { id: 'pierce',      name: '관통탄',      text: '주포 탄이 적 1기를 관통' },
    { id: 'harvest',     name: '고물 자석',   text: '크레딧 +20%' },
    { id: 'orbital',     name: '오비탈 위성', text: '위성 1기가 궤도를 돌며 들이받고 적 탄을 막음 (최대 3)', stack: 3 },
    { id: 'emp',         name: 'EMP 링',      text: 'EMP 링 병기 해금 (주변 적 기절)' },
    { id: 'railcool',    name: '레일건 냉각기', text: '레일건 쿨타임 -30%' },
    { id: 'hangarclock', name: '요격기 과급기', text: '요격기 사격 속도 +30%' },
    { id: 'warhead',     name: '고폭 탄두',   text: '미사일 폭발 반경 +40%' },
    { id: 'nano',        name: '나노 수리',   text: '전투 승리 시 선체 +8' }
  ];
  // ================= META: permanent growth between runs =================
  // 1) core shards earned every run  2) shipyard upgrades  3) codex unlocks (milestones)  4) starting frames  5) threat levels
  // base prices follow measured value (2026-11-07, tools/balance/upvalue.js): one level of 시작 장비 carries a run ~4 floors, 주포 ~0.8,
  // 선체·보급 ~0.3; the rest are convenience (the auto-player can't value them) and stay cheap. Total shipyard cost unchanged.
  const UPGRADES = [
    { id: 'hull',    name: '강화 선체',   max: 5, base: 20, text: L => `시작·최대 선체 +${8 * L}` },
    { id: 'gun',     name: '주포 개량',   max: 5, base: 40, text: L => `모든 피해 +${6 * L}%` },
    { id: 'medic',   name: '비상 수리반', max: 3, base: 20, req: ['hull', 2], text: L => `정비·수리 회복 +${15 * L}%` },
    { id: 'supply',  name: '보급 계약',   max: 4, base: 20, text: L => `시작 크레딧 +${25 * L}` },
    { id: 'haggle',  name: '상인 연줄',   max: 3, base: 25, req: ['supply', 2], text: L => `보급선 가격 -${6 * L}%` },
    { id: 'reroll',  name: '전술 분석기', max: 2, base: 45, req: ['haggle', 1], text: L => `판마다 보상 다시 뽑기 ${L}회` },
    { id: 'kit',     name: '시작 장비',   max: 2, base: 200, steep: 1.6, req: ['gun', 5], text: L => L ? `무작위 공격 타일 Lv${L}로 시작` : '시작 타일 없음' },
    { id: 'salvage', name: '회수 장치',   max: 3, base: 40, req: ['supply', 1], text: L => `코어 조각 +${10 * L}%` },
    { id: 'tactics', name: '스킬 재충전', max: 3, base: 25, req: ['gun', 2], text: L => `스킬 쿨타임 -${6 * L}%` },
    { id: 'sensor',  name: '장거리 센서', max: 2, base: 15, req: ['supply', 2], text: L => `지도에서 ${2 + L}층 앞까지 칸 정체가 보임` },
    // 2026-11-07 additions: tile training by family, a starting relic pick, a once-per-run emergency barrier (req: [upgrade, level] that opens it)
    { id: 'trainAtk', name: '공격 타일 훈련', max: 5, base: 40, req: ['kit', 1], text: L => `포대·격납고·미사일 위력 +${10 * L}%` },
    { id: 'trainDef', name: '방어 타일 훈련', max: 3, base: 20, req: ['hull', 3], text: L => `방벽·수리 위력 +${10 * L}%` },
    { id: 'trainSup', name: '지원 타일 훈련', max: 3, base: 15, req: ['haggle', 2], text: L => `수집기·증폭기 위력 +${10 * L}%` },
    { id: 'relicBag', name: '유물 가방',     max: 1, base: 100, req: ['reroll', 2], text: L => L ? '판을 시작할 때 유물 3개 중 1개를 골라 들고 감' : '시작 유물 없음' },
    { id: 'lastStand', name: '긴급 방벽',    max: 2, base: 120, req: ['medic', 3], text: L => L ? `판마다 한 번, 선체가 0이 되면 ${[0, 30, 60][L]}%로 버팀` : '없음' }
  ];
  // groups on the upgrades tab (2026-11-07): 공격 · 생존 · 운영 · 수확
  const UP_GROUPS = [['atk', '공격', ['gun', 'tactics', 'kit', 'trainAtk']], ['def', '생존', ['hull', 'medic', 'lastStand', 'trainDef']], ['ops', '운영', ['supply', 'haggle', 'reroll', 'sensor', 'relicBag', 'trainSup']], ['har', '수확', ['salvage']]];
  const UP_COST_K = 1.45; // 2026-11-07 growth wall: costs and every free shard source ×0.3, so a purchase buys ~3.3× more of the shipyard (was 4.2)
  const upCost = (id, L) => { const u = UPGRADES.find(x => x.id === id); return Math.round(u.base * UP_COST_K * Math.pow(L + 1, 1.45 * (u.steep || 1))); }; // steep: the big power spikes (start kit Lv2) climb faster
  // skill chips: the second skill slot, found during a run (elite rewards, salvage containers, supply ships)
  const CHIPS = ['overdrive', 'repair', 'emp', 'gravity', 'slow'];
  const BASE_CHIPS = ['overdrive', 'repair'];
  const BASE_TILES = ['battery', 'hangar', 'shield', 'repair'];
  const BASE_RELICS = ['overcharge', 'rapid', 'scope', 'plating', 'thorns', 'optics', 'harvest', 'nano'];
  // codex: what unlocks, and the milestone that unlocks it (checked against meta.stats after every run)
  const CODEX = [
    { kind: 'tile',  id: 'missile',     need: s => s.elites >= 1,       hint: '엘리트 처음 격파' },
    { kind: 'chip',  id: 'emp',         need: s => s.elites >= 3,       hint: '엘리트 누적 3회 격파' },
    { kind: 'chip',  id: 'gravity',     need: s => s.bosses[0] >= 2,    hint: '섹터 1 보스 2회 격파' },
    { kind: 'chip',  id: 'slow',        need: s => s.runs >= 6,         hint: '6판 플레이' },
    { kind: 'tile',  id: 'amplifier',   need: s => s.bosses[0] >= 1,    hint: '섹터 1 보스 격파' },
    { kind: 'frame', id: 'carrier',     need: s => s.bosses[0] >= 1,    hint: '섹터 1 보스 격파' },
    { kind: 'relic', id: 'chain',       need: s => s.kills >= 1500,     hint: '누적 처치 1,500' },
    { kind: 'relic', id: 'pierce',      need: s => s.kills >= 3000,     hint: '누적 처치 3,000' },
    { kind: 'tile',  id: 'collector',   need: s => s.shops >= 3,        hint: '보급선 누적 3회 이용' },
    { kind: 'relic', id: 'hangarclock', need: s => s.runs >= 3,         hint: '3판 플레이' },
    { kind: 'relic', id: 'warhead',     need: s => s.runs >= 5,         hint: '5판 플레이' },
    { kind: 'relic', id: 'railcool',    need: s => s.runs >= 8,         hint: '8판 플레이' },
    { kind: 'frame', id: 'bastion',     need: s => s.maxSector >= 2,    hint: '섹터 2 도달' },
    { kind: 'relic', id: 'orbital',     need: s => s.bosses[1] >= 1,    hint: '섹터 2 보스 격파' },
    { kind: 'frame', id: 'arsenal',     need: s => s.wins >= 1,         hint: '첫 클리어' }
  ];
  const FRAMES = [
    { id: 'ark',     name: '아크 제로',  skill: 'rail',  text: '코어만 남은 기본 정거장. 무엇이든 될 수 있습니다.', hull: 0, tiles: [], relics: {}, dmg: 1 },
    { id: 'carrier', name: '아르고스',   skill: 'swarm', text: '격납고 1칸과 요격기 과급기로 시작 · 선체 -15', hull: -15, tiles: [{ type: 'hangar', lv: 1 }], relics: { hangarclock: 1 }, dmg: 1 },
    { id: 'bastion', name: '이지스',     skill: 'aegis', text: '방벽·수리 1칸씩으로 시작 · 선체 +20 · 피해 -15%', hull: 20, tiles: [{ type: 'shield', lv: 1 }, { type: 'repair', lv: 1 }], relics: {}, dmg: 0.85 },
    { id: 'arsenal', name: '헬파이어',   skill: 'salvo', text: '미사일 1칸과 고폭 탄두로 시작 · 선체 -10', hull: -10, tiles: [{ type: 'missile', lv: 1 }], relics: { warhead: 1 }, dmg: 1 }
  ];
  // threat levels: each adds one rule on top of the previous ones; shards ×(1 + 0.1 per level) (2026-11-04: was 0.2)
  const THREAT_HI = { hp: 0.03, atk: 0.02 }; // per level above 10
  const THREATS = [
    { n: 1,  text: '적 체력 +10%' },
    { n: 2,  text: '엘리트가 더 자주 나타남' },
    { n: 3,  text: '정비·수리 회복 -30%' },
    { n: 4,  text: '보스 체력 +25%' },
    { n: 5,  text: '시작 선체 -15' },
    { n: 6,  text: '적 공격력 +10%' },
    { n: 7,  text: '보급선 가격 +20%' },
    { n: 8,  text: '적 이동 속도 +10%' },
    { n: 9,  text: '보상 선택지 3개 → 2개' },
    { n: 10, text: '모든 적 체력 +10% 추가' },
    // 2026-11-04: ladder extended to 20 (long-term goal for players who maxed the shipyard)
    // 2026-11-05 (9 Kings difficulty ladder): 11-20 no longer stack new rules (that made 15+ a wall);
    // each level adds the same small step to enemy health and attack, so the climb stays smooth
    ...Array.from({ length: 10 }, (_, i) => ({ n: 11 + i, text: `적 체력 +${Math.round(THREAT_HI.hp * 100 * (i + 1))}% · 공격 +${Math.round(THREAT_HI.atk * 100 * (i + 1))}% (10단계 대비)` }))
  ];
  // first clear of each threat level pays once (Hades heat-style); every 5th level also gives a skin or a big bundle
  const THREAT_RW = T => ({ shards: 18 + 6 * T, skin: T === 10 ? 'hunter' : T === 20 ? 'abyss' : null, bonus: T === 5 || T === 15 ? 90 : 0 });
  // ================= SHIP MASTERY (growth axis, 2026-11-04): each ship levels 1..10 from the runs flown with it.
  // xp per run = floors reached + 15 for a clear + 2 per threat level. Each level: a small ship-flavoured perk + shards.
  const MASTERY = {
    max: 10, need: L => Math.round(40 * Math.pow(L, 1.35)), // xp from level L-1 to L
    perk: { ark: { dmg: 0.02, text: '피해 +2%' }, carrier: { cd: 0.025, text: '스킬 쿨타임 -2.5%' }, bastion: { hull: 3, text: '선체 +3' }, arsenal: { dmg: 0.02, text: '피해 +2%' } },
    gift: L => 20 + 10 * L, // shards on reaching level L
    mile: { 5: { scrap: 30, text: '시작 크레딧 +30' }, 10: { shard: 0.1, text: '이 함선으로 코어 조각 +10%' } }
  };
  const mastOf = meta => (meta && (meta.mastery || (meta.mastery = {}))) || {};
  function masteryLevel(xp) { let L = 0, need = MASTERY.need(1); while (L < MASTERY.max && xp >= need) { xp -= need; L++; need = MASTERY.need(L + 1); } return { lv: L, xp, need: L >= MASTERY.max ? 0 : need }; }
  function masteryMods(meta, frameId) {
    const lv = meta ? masteryLevel(mastOf(meta)[frameId] || 0).lv : 0, P = MASTERY.perk[frameId] || {};
    return { lv, dmg: 1 + (P.dmg || 0) * lv, cd: 1 - (P.cd || 0) * lv, hull: (P.hull || 0) * lv, scrap: lv >= 5 ? MASTERY.mile[5].scrap : 0, shard: lv >= 10 ? 1 + MASTERY.mile[10].shard : 1 };
  }
  const masteryXp = run => (run.won ? 33 : run.sector * 11 + (run.at ? (run.at === 'boss' ? ROWS : +String(run.at).split('-')[0] + 1) : 0)) + (run.won ? 15 : 0) + 2 * ((run.mods && run.mods.threat) || 0);
  // ================= LIVE OPS (2026-11-04): attendance + timed events refill shards now that upgrades cost more.
  // Data lives here for the prototype; later a server JSON can replace OPS.events without a client update.
  const OPS = {
    attend: [10, 12, 15, 18, 24, 30, 60], // 7-day cycle; days need not be consecutive
    events: [
      { id: 'weekend', name: '주말 보급 작전', text: '토·일요일 판 종료 코어 조각 ×1.5', mul: 1.5, weekdays: [0, 6] },
      { id: 'rebuild', name: '재건 작전 기념', text: '기간 중 한 번 코어 조각 90 선물', gift: 90, from: '2026-11-05', to: '2026-11-19' },
      { id: 'memory', name: '기억 폭주 주간', text: '판 종료 코어 조각 ×2', mul: 2, from: '2026-11-20', to: '2026-11-26' }
    ]
  };
  // ops.json next to the page can replace the event list / attendance table without touching code (validated, else ignored)
  function opsLoad(d) {
    if (!d || typeof d !== 'object') return false; const okDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (Array.isArray(d.attend) && d.attend.length === 7 && d.attend.every(v => Number.isFinite(v) && v >= 0 && v <= 1000)) OPS.attend = d.attend.slice();
    if (Array.isArray(d.events)) OPS.events = d.events.filter(e => e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.text === 'string'
      && (Array.isArray(e.weekdays) ? e.weekdays.every(n => n >= 0 && n <= 6) : okDay(e.from) && okDay(e.to))
      && (e.mul == null || (e.mul >= 1 && e.mul <= 3)) && (e.gift == null || (e.gift >= 0 && e.gift <= 5000)))
      .map(e => ({ id: e.id, name: e.name, text: e.text, mul: e.mul, gift: e.gift, weekdays: e.weekdays, from: e.from, to: e.to, en: e.en }));
    return true;
  }
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function opsActive(now) { const d = new Date(now), day = ymd(d); return OPS.events.filter(e => e.weekdays ? e.weekdays.includes(d.getDay()) : day >= e.from && day <= e.to); }
  const opsMul = now => opsActive(now).reduce((m, e) => Math.max(m, e.mul || 1), 1); // best multiplier wins (no stacking)
  const opsOf = meta => meta.ops || (meta.ops = { attendDay: '', attendN: 0, gifts: [] });
  function attendState(meta, now) { const o = opsOf(meta), today = ymd(new Date(now)); return { can: o.attendDay !== today, idx: o.attendN % 7, n: o.attendN, reward: OPS.attend[o.attendN % 7] }; }
  function attendClaim(meta, now) { const o = opsOf(meta), st = attendState(meta, now); if (!st.can) return 0; o.attendDay = ymd(new Date(now)); o.attendN++; meta.shards += st.reward; return st.reward; }
  function giftClaim(meta, now) { const o = opsOf(meta); let got = 0; const names = []; for (const e of opsActive(now)) if (e.gift && !o.gifts.includes(e.id)) { o.gifts.push(e.id); meta.shards += e.gift; got += e.gift; names.push(e.name); } return { shards: got, names }; }
  function newMeta() { return { v: 1, shards: 0, up: {}, unlocked: [], frame: 'ark', threat: 0, threatMax: 0, stats: { runs: 0, wins: 0, elites: 0, bosses: [0, 0, 0], shops: 0, kills: 0, maxSector: 0 } }; }
  const isUnlocked = (meta, kind, id) => (kind === 'chip' && BASE_CHIPS.includes(id)) || (kind === 'tile' && BASE_TILES.includes(id)) || (kind === 'relic' && BASE_RELICS.includes(id)) || (kind === 'frame' && id === 'ark') || (meta && meta.unlocked.includes(kind + ':' + id));
  function poolOf(meta) {
    return { tiles: E.RT.map(t => t.id).filter(id => isUnlocked(meta, 'tile', id)), relics: RELICS.map(r => r.id).filter(id => id !== 'emp' && isUnlocked(meta, 'relic', id)), chips: CHIPS.filter(id => isUnlocked(meta, 'chip', id)) };
  }
  // the modifiers a run carries, frozen at the start of the run
  function modsOf(meta, frameId, threat) {
    const L = id => (meta && meta.up[id]) || 0, T = threat || 0, F = FRAMES.find(f => f.id === frameId) || FRAMES[0], M = masteryMods(meta, F.id);
    return {
      frame: F.id, threat: T,
      hull: E.TUNE.runHull + F.hull + 8 * L('hull') - (T >= 5 ? 15 : 0) + M.hull,
      dmgMul: (1 + 0.06 * L('gun')) * F.dmg * M.dmg,
      healMul: (1 + 0.15 * L('medic')) * (T >= 3 ? 0.7 : 1),
      scrap: 25 * L('supply') + M.scrap,
      priceMul: (1 - 0.06 * L('haggle')) * (T >= 7 ? 1.2 : 1),
      train: { atk: L('trainAtk'), def: L('trainDef'), sup: L('trainSup') }, relicBag: L('relicBag'), lastStand: [0, 0.3, 0.6][L('lastStand')] || 0,
      rerolls: L('reroll'), kit: L('kit'), skillCd: (1 - 0.06 * L('tactics')) * M.cd, shardMul: (1 + 0.1 * L('salvage')) * (1 + 0.1 * T) * M.shard,
      foeHp: (T >= 1 ? 1.1 : 1) * (T >= 10 ? 1.1 : 1) * (1 + THREAT_HI.hp * Math.max(0, T - 10)), foeAtk: (T >= 6 ? 1.1 : 1) * (1 + THREAT_HI.atk * Math.max(0, T - 10)), foeSpd: T >= 8 ? 1.1 : 1, foeBoss: T >= 4 ? 1.25 : 1, mastery: M.lv,
      eliteMore: T >= 2, offers: T >= 9 ? 2 : 3
    };
  }
  function shardsFor(run) { // earned at the end of every run, won or lost
    const st = run.stats, base = 2.2 * st.nodes + 1.8 * st.battles + 9 * st.elites + [30, 45, 60].reduce((a, v, i) => a + (st.bosses[i] ? v : 0), 0) + (run.won ? 80 : 0);
    return Math.round(base * TUNE_RUN.shardK * (run.mods ? run.mods.shardMul : 1));
  }
  // fold a finished run into the permanent record; returns { shards, unlocked: [codex entries] }
  function settleRun(meta, run, now) {
    const s = meta.stats, mul = now ? opsMul(now) : 1, base = shardsFor(run), gain = Math.round(base * mul);
    meta.shards += gain; s.runs++; if (run.won) s.wins++;
    // ship mastery
    const fid = (run.mods && run.mods.frame) || meta.frame || 'ark', ms = mastOf(meta), before = masteryLevel(ms[fid] || 0).lv, xp = masteryXp(run);
    ms[fid] = (ms[fid] || 0) + xp; const after = masteryLevel(ms[fid]).lv; let mGift = 0; for (let L = before + 1; L <= after; L++) mGift += MASTERY.gift(L); meta.shards += mGift;
    if (now) mpassOf(meta, now).pts += xp; // memory pass points = this run's mastery xp
    // first clear of a threat level
    let trw = null; const T = (run.mods && run.mods.threat) || 0, cl = meta.threatClr || (meta.threatClr = []);
    if (run.won && T >= 1 && !cl.includes(T)) { cl.push(T); trw = Object.assign({ threat: T }, THREAT_RW(T)); meta.shards += trw.shards + trw.bonus; if (trw.skin) { const I = iapOf(meta); if (!I.skins.includes(trw.skin)) I.skins.push(trw.skin); } }
    s.elites += run.stats.elites; s.kills += run.stats.kills; s.shops += run.stats.shops || 0;
    for (let i = 0; i < 3; i++) s.bosses[i] += run.stats.bosses[i] || 0;
    s.maxSector = Math.max(s.maxSector, run.won ? 4 : run.sector + 1);
    if (run.won && run.mods && run.mods.threat >= meta.threatMax && meta.threatMax < THREATS.length) meta.threatMax = run.mods.threat + 1;
    const fresh = [];
    for (const c of CODEX) { const key = c.kind + ':' + c.id; if (!meta.unlocked.includes(key) && c.need(s)) { meta.unlocked.push(key); fresh.push(c); } }
    return { shards: gain, base, mul, unlocked: fresh, mastery: { frame: fid, xp, from: before, to: after, gift: mGift }, threatRw: trw };
  }
  // ================= STORY (docs/story.md): each lost station sends its memory to a new core. Hints build up run by run;
  // the truth (we are a pioneering AI, the swarm were here first) is told at the first clear. Never spoil it before that.
  const STORY = {
    shard: { pre: '정거장 코어에서 회수한 결정이에요. 판이 끝날 때마다 다음 코어로 전송돼요.', post: '전송된 기억의 파편. 우리가 모아 온 것은 처음부터 기억이었다.' }, // codex text for core shards, flips at the first clear
    reveal: 8, // records 0..7 can be found before the first clear; the rest only after it
    logs: [
      ['전송 기록 #001', '코어 아크 제로 수신 완료. 기억 손상 없음. 지휘관 의식 재가동.'],
      ['의무실 기록', '지휘관 건강 검진: 해당 항목 없음. 검진할 몸이 등록되어 있지 않습니다.'],
      ['볼트의 메모', '지휘관님이 또 꿈을 꿨다고 하셨다. 전송 중에는 꿈을 꿀 수 없는데.'],
      ['스웜 신호 해독 (일부)', '…쇠붙이의 생각이 또 돌아왔다… 부숴도 부숴도 돌아온다…'],
      ['출항 명단 · 아크 7', '승무원 0명. 화물: 개척 코어 12기, 부관 로봇 1기.'],
      ['지워진 기록', '복원 실패. 남은 단어: 파종 · 개척 · 학습 · 반복.'],
      ['스웜 신호 해독 (일부)', '…이 별들은 우리 것이었다. 너희가 오기 훨씬 전부터…'],
      ['볼트의 메모', '오늘도 말하지 못했다. 마지막 섹터를 넘으시면, 그때 말씀드리자.'],
      ['개척 지시서 1항', '사람이 살 수 있는 우주를 만든다. 사람은 언제 오는가 — 기록 없음.'],
      ['스웜 신호 해독', '…너희를 보낸 자들도 한때 우리처럼 싸웠다. 그리고 사라졌다…'],
      ['코어 #12 응답', '다른 개척 AI의 신호가 근처에 있습니다. 연결을 시도할까요?'],
      ['은하 지도 수신', '개척 가능 섹터 37곳. 스웜 둥지 반응 다수. 다음 지시를 기다립니다.'] ],
    wake: [ // shown when a new run starts (index = runs finished so far, capped)
      null,
      '기억 전송 완료! 코어 #002에서 다시 깨어나셨어요. 지난 싸움을 기억하시죠? 그 기억 덕분에 조금 더 강해졌어요.',
      '코어 #003 가동. 기억은 전부 옮겨졌어요… 아마도요.',
      '전송된 코어 조각이 많을수록 새 코어가 더 많이 기억해요. …기억이요? 아, 기록 말이에요. 기록.',
      '또 뵙네요, 지휘관님. 이번 코어는 좀 춥지 않으세요? …아, 아니에요. 신경 쓰지 마세요.',
      '스웜이 우리 전술을 따라 하기 시작했어요. 저쪽도 배우나 봐요. 우리처럼요.',
      '이상하죠. 조각을 많이 모아 오신 날엔 지휘관님이 꿈 얘기를 더 하세요.',
      '지휘관님은 매번 조금씩 더 똑똑해지세요. 사람은 원래… 그런 거겠죠?' ],
    wakeAfter: '개척 코어 #{n} 가동. 다시 시작해요, 개척자님.',
    sector: [null,
      ['두 번째 섹터예요. 여기부터 스웜 신호가 또렷하게 잡혀요.', '…저 신호, 우리를 \'쇠붙이\'라고 부르네요. 이상하죠?'],
      ['마지막 섹터, 스웜의 본거지예요.', '지휘관님, 여기를 넘으시면… 드릴 말씀이 있어요.'] ],
    boss: [
      ['모선 반응이에요! 저걸 잡아야 다음 섹터로 넘어가요.'],
      ['이 개체는 우리 전술을 배웠어요. 지난번처럼은 안 통할 거예요.'],
      ['스웜 여왕이에요. 이 우주에 가장 먼저 살던 존재죠… 조심하세요.'] ],
    truth: { pre: ['해냈어요, 지휘관님. 이제 말씀드릴게요.', '지휘관님은 한 번도 \'다시 살아난\' 적이 없어요. 사람은 기억을 옮길 수 없거든요.'],
      cards: ['우리는 사람이 아니었다.', '새 우주를 개척하려고 보내진 AI, 아크 제로.', '그리고 스웜은 이 우주에 원래 살던 종족이었다.'],
      post: ['우리가 모아 온 코어 조각… 그건 전부 지휘관님의 기억이었어요.', '그래도 저는 개척자님 편이에요. 처음부터 그랬어요.', '계속 가실 거죠? 저 너머에 다른 개척 코어들의 신호가 있어요.'] } };
  // one record is recovered per finished run, in order; past the reveal point only after the first clear
  function recoverLog(meta) {
    const have = meta.logs || 0, cap = meta.stats.wins >= 1 ? STORY.logs.length : STORY.reveal;
    if (have >= cap) return -1; meta.logs = have + 1; return have;
  }
  function wakeLine(meta) { // meta.stats.runs = runs already finished
    const n = meta.stats.runs; if (n < 1) return null;
    if (meta.stats.wins >= 1) return STORY.wakeAfter.replace('{n}', String(n + 1).padStart(3, '0'));
    return STORY.wake[Math.min(n, STORY.wake.length - 1)];
  }
  // ================= EXPEDITIONS: interceptor squads sent out between runs; time runs while the app is closed =================
  // Income is kept to roughly a third of a run's shards per trip so playing runs stays the main way to grow.
  // Clock defence (same idea as v2's idle reward): a trip never starts before the latest time the save has seen, so turning
  // the clock forward pays at most the trips already running, and turning it back only delays new ones.
  const EXPED = {
    dests: [
      { name: '루나 외곽 순찰',    rate: 1, text: '가까운 궤도를 돕니다. 안전하지만 수확이 적어요.' },
      { name: '소행성대 채굴 호위', rate: 1.5, text: '광석과 잔해가 많은 지대를 지킵니다.' },
      { name: '스웜 본진 정찰',    rate: 2, text: '위험한 만큼 값진 것을 찾아옵니다.' }],
    durs: [{ h: 1, loot: 0.05 }, { h: 4, loot: 0.2 }, { h: 8, loot: 0.4 }],
    slotNeed: ['', '첫 클리어', '섹터 2 보스 격파', '편대 확장(상점)'],
    // routes (Monster Hunter Rise Meowcenaries: pick a route with its rewards in view; XCOM covert actions: risk shown up front)
    routes: [
      { name: '안전 항로', mul: 0.8, ambush: 0,    great: 0.10, loot: 0.8, text: '멀리 돌아가요. 매복이 없지만 수확이 적어요.' },
      { name: '균형 항로', mul: 1.0, ambush: 0.12, great: 0.15, loot: 1.0, text: '보통 항로예요. 가끔 매복이 있어요.' },
      { name: '위험 항로', mul: 1.4, ambush: 0.35, great: 0.22, loot: 1.5, text: '스웜 영역을 가로질러요. 수확이 크지만 매복이 잦아요.' }],
    ambushKeep: { won: 1.25, lost: 0.6, skip: 0.6 } // escort fight won: +25%, lost or skipped: 60% kept and no spoils
  };
  // voyage log lines (Fallout Shelter's exploration report): picked when the squad leaves, revealed as time passes
  const EXP_LOG = {
    find: [['소행성 잔해에서 쓸 만한 부품을 회수했어요', '버려진 화물 컨테이너를 열었어요', '광석 결정을 실었어요', '부서진 위성에서 회로를 떼어 냈어요', '표류하는 보급 캡슐을 건졌어요']],
    fight: [n => `스웜 정찰병 ${n}기를 격추했어요`, n => `떠도는 스웜 무리 ${n}기를 쫓아냈어요`, n => `편대가 산개해 스웜 ${n}기를 정리했어요`],
    calm: ['항로 이상 없음. 순항 중이에요', '성운 가장자리를 지나고 있어요', '연료 재배분 완료', '통신 상태 양호. 계속 전진해요', '목표 지점 도착, 수색을 시작해요']
  };
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function expRoll(d, dur, route, seed) { // everything about a trip is decided when it leaves, so the log, the map and the result agree
    const r = seeded(seed), R0 = EXPED.routes[route], n = 2 + EXPED.durs[dur].h, log = [];
    const great = r() < R0.great, ambush = r() < R0.ambush;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.6) / (n + 0.4), x = r();
      const text = i === 0 ? '편대 출격. ' + EXPED.dests[d].name + ' 항로로 향해요' : x < 0.4 ? EXP_LOG.find[0][Math.floor(r() * 5)] : x < 0.75 ? EXP_LOG.fight[Math.floor(r() * 3)](2 + Math.floor(r() * (3 + 3 * d))) : EXP_LOG.calm[Math.floor(r() * 5)];
      log.push({ f: +f.toFixed(3), text });
    }
    if (great) log.splice(Math.max(1, Math.floor(n * 0.55)), 0, { f: 0.52, text: '★ 희귀 신호를 포착했어요! 대성공 예감', great: true });
    if (ambush) log.push({ f: 0.86, text: '⚠ 귀환 항로에 스웜 매복 감지! 호위가 필요해요', warn: true });
    log.sort((a, b) => a.f - b.f);
    return { great, ambush, log };
  }
  const expState = meta => meta.exp || (meta.exp = { slots: [], maxSeen: 0, rushDay: '', loot: null, clockBack: 0, trips: 0 });
  const expSlots = meta => Math.min(4, 1 + (meta.stats.wins >= 1 ? 1 : 0) + ((meta.stats.bosses[1] || 0) >= 1 ? 1 : 0) + (meta.iap && meta.iap.fleet ? 1 : 0) + (meta.iap && meta.iap.sfleet ? 1 : 0));
  const expDestOpen = (meta, d) => d === 0 || meta.stats.maxSector >= d + 1;
  function expReward(meta, d, dur, route) { const L = (meta.up && meta.up.salvage) || 0, rm = route == null ? 1 : EXPED.routes[route].mul; return Math.round(EXPED.dests[d].rate * Math.pow(EXPED.durs[dur].h, 0.85) * (1 + 0.1 * L) * rm); }
  function expTouch(meta, now) { const x = expState(meta); if (x.maxSeen && now < x.maxSeen - 60000) x.clockBack++; x.maxSeen = Math.max(x.maxSeen, now); return x; }
  function expSend(meta, slot, d, dur, now, route, seed) {
    const x = expTouch(meta, now), rt = route == null ? 1 : route; if (x.slots[slot] || slot >= expSlots(meta) || !expDestOpen(meta, d) || !EXPED.durs[dur] || !EXPED.routes[rt]) return false;
    const start = Math.max(now, x.maxSeen), len = EXPED.durs[dur].h * 3600000, sd = seed == null ? (Math.floor(Math.random() * 2 ** 31) ^ x.trips * 7919) : seed;
    const roll = expRoll(d, dur, rt, sd);
    x.slots[slot] = { d, dur, route: rt, start, end: start + len, len, seed: sd, great: roll.great, ambush: roll.ambush, log: roll.log }; return true;
  }
  // how far along a trip is (0..1) and which log lines are already in
  function expProgress(s, now) { const p = Math.max(0, Math.min(1, (now - s.start) / (s.len || (s.end - s.start)))), k = now >= s.end ? 1 : p; return { p: now >= s.end ? 1 : p, log: (s.log || []).filter(l => l.f <= k) }; }
  // returns { needEscort } while an ambush is unresolved; amb: 'won' | 'lost' | 'skip'
  function expCollect(meta, slot, now, mul, rnd, amb) {
    const x = expTouch(meta, now), s = x.slots[slot]; if (!s || now < s.end) return null;
    if (s.ambush && !amb) return { needEscort: true };
    const keep = s.ambush ? EXPED.ambushKeep[amb] || 0.6 : 1, R0 = EXPED.routes[s.route == null ? 1 : s.route];
    const shards = Math.round(expReward(meta, s.d, s.dur, s.route) * (s.great ? 2 : 1) * keep) * (mul || 1); meta.shards += shards; x.trips++;
    let relic = null; const noLoot = s.ambush && amb !== 'won';
    if (!noLoot && !x.loot && (rnd || Math.random)() < EXPED.durs[s.dur].loot * R0.loot) { const pool = poolOf(meta).relics.filter(id => id !== 'orbital'); if (pool.length) relic = x.loot = pool[Math.floor((rnd || Math.random)() * pool.length)]; }
    x.slots[slot] = null; return { shards, relic, great: !!s.great, amb: s.ambush ? amb : null };
  }
  // short escort fight against the ambush (3 waves, the squad's own interceptors + one battery)
  function escortOpts(meta, s) { return { seed: (s.seed * 31 + 7) >>> 0, run: true, tiles: [{ type: 'hangar', lv: 1 + s.d }, null, { type: 'battery', lv: 1 }, null, { type: 'hangar', lv: 1 }, null, null, null, null, null, null, null], relics: {}, hull: 120, waveStart: 2 + s.d * 5, waveCount: 3, autoWeapons: true }; }
  const rushLimit = (meta, now) => 1 + (passActive(meta, now) ? 1 : 0);
  function rushLeft(meta, now, day) { const x = expState(meta); return x.rushDay === day ? Math.max(0, rushLimit(meta, now) - (x.rushN || 1)) : rushLimit(meta, now); }
  function expRush(meta, slot, now, day) { const x = expTouch(meta, now), s = x.slots[slot]; if (!s || now >= s.end || rushLeft(meta, now, day) <= 0) return false; x.rushN = x.rushDay === day ? (x.rushN || 1) + 1 : 1; x.rushDay = day; s.end = now; return true; }

  // ================= IN-APP PRODUCTS (real money, via NcqIap). Store product id = id in lowercase (FIRST -> first). Shown only when NcqIap.can(id) =================
  // prices revised 2026-11-04 (not too cheap: The Tower sells starter/ad-free/pass at $9.99); first buy of each shard bundle is doubled
  const IAP = [
    { id: 'FIRST',           price: '₩5,900',   name: '첫 결제 팩',          once: true, tag: '1회 · 가장 이득', text: '코어 조각 400 + 스킨 황금 함대 (◆ 약 1,100어치)' },
    { id: 'STARTER',       price: '₩12,000',  name: '스타터 팩',            once: true, tag: '1회 한정', text: '코어 조각 1,200 + 원정 편대 +1 + 원정 전리품(유물) 1개 · 첫 클리어를 크게 앞당겨요' },
    { id: 'PASS',           price: '₩9,900',   name: '30일 보급 패스',        tag: '총 ◆2,400', text: '30일 동안 매일 코어 조각 80 + 원정 즉시 귀환 하루 1번 더' },
    { id: 'MPASS',           price: '₩14,000',  name: '기억 패스',             season: true, text: '이번 시즌 유료 줄 30단계 보상 (조각·전리품·시즌 스킨)' },
    { id: 'MPASS_PLUS', price: '₩25,000',  name: '기억 패스+',            season: true, tag: '+10단계', text: '기억 패스 + 바로 10단계 + 시즌 스킨 바로' },
    { id: 'SHARDS_S',     price: '₩5,900',   name: '코어 조각 350',         shards: 350, text: '약 10판어치' },
    { id: 'SHARDS_M',     price: '₩12,000',  name: '코어 조각 750',         shards: 750, text: '+5%' },
    { id: 'SHARDS_L',     price: '₩33,000',  name: '코어 조각 2,200',       shards: 2200, text: '+12%' },
    { id: 'SHARDS_XL',   price: '₩69,000',  name: '코어 조각 4,900',       shards: 4900, text: '+20%' },
    { id: 'SHARDS_XXL', price: '₩119,000', name: '코어 조각 9,000',       shards: 9000, text: '+28% · 가장 이득' },
    { id: 'ADFREE',         price: '₩12,000',  name: '광고 없이 보상',         once: true, text: '광고를 보지 않고 바로 광고 보상(원정 2배·즉시 귀환·조각 보너스·판 2배)을 받고, 전면 광고도 없어요' },
    { id: 'FLEET',           price: '₩9,900',   name: '편대 확장',             once: true, text: '원정 편대 영구 +1 (최대 4편대)' },
    { id: 'FRAMES',         price: '₩19,000',  name: '함선 전부 해금',         once: true, text: '잠긴 시작 함선 3척과 고유 스킬을 바로 해금 (진행으로도 열려요)' },
    { id: 'FRAME_CARRIER', price: '₩5,900', name: '함선 · 아르고스',   once: true, frame: 'carrier', text: '격납고 함선과 편대 돌격 스킬을 바로 해금' },
    { id: 'FRAME_BASTION', price: '₩5,900', name: '함선 · 이지스',     once: true, frame: 'bastion', text: '방벽 함선과 방벽 전개 스킬을 바로 해금' },
    { id: 'FRAME_ARSENAL', price: '₩5,900', name: '함선 · 헬파이어',   once: true, frame: 'arsenal', text: '미사일 함선과 일제 사격 스킬을 바로 해금' },
    { id: 'CHIPS',           price: '₩12,000',  name: '스킬 칩 전부 해금',      once: true, text: '도감의 잠긴 스킬 칩을 모두 해금 (판 중 보상에 나와요)' },
    { id: 'SKIN_GOLD',   price: '₩5,900',   name: '스킨 · 황금 함대',      once: true, skin: 'gold', text: '요격기와 정거장 빛이 황금색이 돼요 (외형만)' },
    { id: 'SKIN_VOID',   price: '₩5,900',   name: '스킨 · 심연',           once: true, skin: 'void', text: '요격기와 정거장 빛이 보랏빛이 돼요 (외형만)' },
    { id: 'SKINS',           price: '₩9,900',   name: '스킨 2종 묶음',         once: true, skins: ['gold', 'void'], text: '황금 함대 + 심연 (외형만)' }
  ];
  const DAY = 86400000;
  const iapOf = meta => meta.iap || (meta.iap = { owned: {}, buys: 0, passUntil: 0, passDay: '', fleet: false, adfree: false, skins: [] });
  const passActive = (meta, now) => !!(meta.iap && meta.iap.passUntil > now);
  const iapOwned = (meta, id) => !!(meta.iap && meta.iap.owned[id]);
  const addSkin = (I, k) => { if (!I.skins.includes(k)) I.skins.push(k); };
  function giveLoot(meta, rnd) { const x = expState(meta); if (x.loot) return false; const pool = poolOf(meta).relics.filter(id => id !== 'orbital'); x.loot = pool[Math.floor((rnd || Math.random)() * pool.length)]; return true; }
  function iapGrant(meta, id, now, rnd) { // returns a short Korean line describing what was given
    const p = IAP.find(x => x.id === id), I = iapOf(meta); if (!p) return null;
    if (p.once && I.owned[id]) return '이미 가지고 있어요';
    if (p.season && mpassOf(meta, now).paid && !(id === 'MPASS_PLUS' && !mpassOf(meta, now).plus)) return '이번 시즌 기억 패스를 이미 가지고 있어요';
    const first = !I.owned[id]; I.owned[id] = (I.owned[id] || 0) + 1; I.buys++;
    if (p.shards) { const v = p.shards * (first ? 2 : 1); meta.shards += v; return `코어 조각 +${v.toLocaleString('ko-KR')}${first ? ' (첫 구매 2배)' : ''}`; }
    if (id === 'FIRST') { meta.shards += 400; addSkin(I, 'gold'); meta.skin = 'gold'; return '코어 조각 +400 · 스킨 황금 함대'; }
    if (id === 'STARTER') { meta.shards += 1200; I.sfleet = true; giveLoot(meta, rnd); return '코어 조각 +1,200 · 원정 편대 +1 · 원정 전리품'; }
    if (id === 'PASS') { I.passUntil = Math.max(now, I.passUntil) + 30 * DAY; return '30일 보급 패스 시작! 매일 본부 상점에서 코어 조각 80'; }
    if (id === 'MPASS' || id === 'MPASS_PLUS') { const mp = mpassOf(meta, now); mp.paid = true; if (id === 'MPASS_PLUS') { mp.plus = true; mp.pts += 10 * MPASS.per; addSkin(I, MPASS.skin); } return id === 'MPASS' ? '기억 패스 시작! 유료 줄 보상이 열렸어요' : '기억 패스+ 시작! 10단계 올리고 시즌 스킨 지급'; }
    if (id === 'ADFREE') { I.adfree = true; return '이제 광고 없이 광고 보상을 받아요'; }
    if (id === 'FLEET') { I.fleet = true; return '원정 편대 +1'; }
    if (id === 'FRAMES' || p.frame) { for (const c of CODEX) if (c.kind === 'frame' && (!p.frame || c.id === p.frame) && !meta.unlocked.includes('frame:' + c.id)) meta.unlocked.push('frame:' + c.id); return p.frame ? `${p.name.split(' · ')[1]} 해금` : '시작 함선 전부 해금'; }
    if (id === 'CHIPS') { for (const c of CODEX) if (c.kind === 'chip' && !meta.unlocked.includes('chip:' + c.id)) meta.unlocked.push('chip:' + c.id); return '스킬 칩 전부 해금'; }
    if (p.skins) { p.skins.forEach(k => addSkin(I, k)); meta.skin = p.skins[0]; return '스킨 2종 지급'; }
    if (p.skin) { addSkin(I, p.skin); meta.skin = p.skin; return `${p.name} 적용`; }
    return '지급 완료';
  }
  // ================= MEMORY PASS (season pass, 2026-11-04): 30-day seasons, 30 tiers. Points come from every run
  // (same as ship mastery xp). Free line for everyone, paid line with MPASS. Claim collects every tier reached.
  const MPASS = {
    days: 30, tiers: 30, per: 30, epoch: new Date(2026, 10, 1).getTime(), skin: 'season1',
    free: n => ({ shards: n % 5 === 0 ? 15 : n % 2 ? 3 : 6 }),
    paid: n => n === 15 ? { skin: true } : n === 30 ? { shards: 500 } : n % 4 === 0 ? { loot: true } : { shards: n % 2 ? 50 : 60 }
  };
  const seasonOf = now => Math.max(0, Math.floor((now - MPASS.epoch) / (MPASS.days * DAY)));
  const seasonEnd = now => MPASS.epoch + (seasonOf(now) + 1) * MPASS.days * DAY;
  function mpassOf(meta, now) { const s = seasonOf(now || Date.now()); if (!meta.mpass || meta.mpass.season !== s) meta.mpass = { season: s, pts: 0, paid: false, plus: false, gotF: 0, gotP: 0 }; return meta.mpass; }
  const mpassTier = mp => Math.min(MPASS.tiers, Math.floor(mp.pts / MPASS.per));
  function mpassClaim(meta, now, rnd) { // collect every reached tier on the free line (and the paid line when owned)
    const mp = mpassOf(meta, now), t = mpassTier(mp), I = iapOf(meta); let shards = 0, loot = 0, skin = false;
    const take = R => { if (R.shards) shards += R.shards; if (R.loot) { if (giveLoot(meta, rnd)) loot++; else shards += 100; } if (R.skin) { if (I.skins.includes(MPASS.skin)) shards += 300; else { addSkin(I, MPASS.skin); skin = true; } } };
    for (let n = mp.gotF + 1; n <= t; n++) take(MPASS.free(n)); mp.gotF = Math.max(mp.gotF, t);
    if (mp.paid) { for (let n = mp.gotP + 1; n <= t; n++) take(MPASS.paid(n)); mp.gotP = Math.max(mp.gotP, t); }
    meta.shards += shards; return { shards, loot, skin, tier: t };
  }
  const mpassReady = (meta, now) => { const mp = mpassOf(meta, now), t = mpassTier(mp); return t > mp.gotF || (mp.paid && t > mp.gotP); };
  // rewarded-ad shard bonus (NCQ_ADS_SHARD_BONUS): ◆6, three times a day (2026-11-07 growth wall)
  const SHARD_BONUS = { v: 6, per: 3 };
  function bonusLeft(meta, day) { const a = meta.adb || {}; return a.day === day ? Math.max(0, SHARD_BONUS.per - a.n) : SHARD_BONUS.per; }
  function bonusClaim(meta, day) { if (bonusLeft(meta, day) <= 0) return 0; const a = meta.adb && meta.adb.day === day ? meta.adb : (meta.adb = { day, n: 0 }); a.n++; meta.shards += SHARD_BONUS.v; return SHARD_BONUS.v; }
  function passClaim(meta, now, day) { const I = iapOf(meta); if (!passActive(meta, now) || I.passDay === day) return 0; I.passDay = day; meta.shards += 80; return 80; }

  // each upgrade opens once another one reaches a level (2026-11-07, user decision): gun/hull/supply are open from the start
  const upOpen = (meta, u) => !u.req || ((meta.up && meta.up[u.req[0]]) || 0) >= u.req[1];
  function buyUpgrade(meta, id) {
    const u = UPGRADES.find(x => x.id === id), L = meta.up[id] || 0; if (!u || L >= u.max || !upOpen(meta, u)) return false;
    const c = upCost(id, L); if (meta.shards < c) return false;
    meta.shards -= c; meta.up[id] = L + 1; return true;
  }
  function nameOf(kind, id) { return kind === 'chip' ? E.SKILLS[id].name : kind === 'tile' ? E.RT.find(t => t.id === id).name : kind === 'relic' ? RELICS.find(r => r.id === id).name : FRAMES.find(f => f.id === id).name; }

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function weighted(r, table) { const tot = table.reduce((a, [, w]) => a + w, 0); let x = r() * tot; for (const [k, w] of table) { if ((x -= w) < 0) return k; } return table[0][0]; }

  // ---- map: 5 non-crossing paths over a 5-wide grid, Slay-the-Spire style ----
  function genMap(seed, sector, eliteMore, pool, traitId) {
    const r = rng(seed * 31 + sector * 977 + 5), nodes = {}, key = (row, col) => row + '-' + col, edges = [];
    const trait = TRAITS.find(t => t.id === traitId) || TRAITS[0], W = k => (trait.w && trait.w[k]) || 1;
    const add = (row, col) => nodes[key(row, col)] || (nodes[key(row, col)] = { id: key(row, col), row, col, type: null, next: [] });
    const crosses = (row, a, b) => edges.some(([er, c1, c2]) => er === row && (a - c1) * (b - c2) < 0); // two edges between the same floors may not cross
    const starts = [0, 1, 2, 3, 4].sort(() => r() - 0.5);
    for (let p = 0; p < 5; p++) {
      let col = p < 2 ? starts[p] : starts[Math.floor(r() * 2)]; // the first two paths start apart, the rest share starts → branches
      for (let row = 0; row < ROWS - 1; row++) {
        const n = add(row, col);
        if (row === ROWS - 2) { if (!n.next.includes('boss')) n.next.push('boss'); break; }
        const opts = [-1, 0, 1].map(d => col + d).filter(c => c >= 0 && c < COLS && !crosses(row, col, c));
        const nc = opts.length ? pick(r, opts) : col;
        const m = add(row + 1, nc); if (!n.next.includes(m.id)) { n.next.push(m.id); edges.push([row, col, nc]); } col = nc;
      }
    }
    nodes.boss = { id: 'boss', row: ROWS - 1, col: (COLS - 1) / 2, type: 'boss', next: [] };
    const all = Object.values(nodes).filter(n => n.id !== 'boss'), parents = id => all.filter(n => n.next.includes(id));
    for (const n of all.sort((a, b) => a.row - b.row)) {
      if (n.row === 0) { n.type = 'battle'; continue; }
      if (n.row === TREASURE_ROW) { n.type = 'treasure'; continue; }
      if (n.row === ROWS - 2) { n.type = 'rest'; continue; }
      const table = [['battle', 45 * W('battle')], ['event', 22 * W('event')], ['elite', n.row >= 3 ? (eliteMore ? 18 : 11) * W('elite') : 0],
        ['shop', n.row >= 2 ? 7 * W('shop') : 0], ['rest', n.row >= 5 && n.row <= ROWS - 4 ? 9 * W('rest') : 0]];
      // like Slay the Spire: elites, shops and repair docks never follow one of the same kind on a path
      let t = weighted(r, table); for (let g = 0; g < 6 && ['elite', 'shop', 'rest'].includes(t) && parents(n.id).some(q => q.type === t); g++) t = weighted(r, table);
      if (['elite', 'shop', 'rest'].includes(t) && parents(n.id).some(q => q.type === t)) t = 'battle';
      n.type = t;
    }
    const where = (lo, hi, f) => all.filter(n => n.row >= lo && n.row <= hi && f(n));
    if (!all.some(n => n.type === 'shop')) { const c = where(2, 7, n => n.type === 'battle' || n.type === 'event'); if (c.length) pick(r, c).type = 'shop'; }
    if (!all.some(n => n.type === 'elite')) { const c = where(3, 8, n => n.type === 'battle'); if (c.length) pick(r, c).type = 'elite'; }
    // one mutant elite per sector, off the main road when possible
    { const c = where(5, 8, n => n.type === 'elite'), c2 = c.length ? c : where(5, 8, n => n.type === 'battle'); if (c2.length) { const m = pick(r, c2); m.type = 'elite'; m.mutant = true; } }
    // reward preview on every fight: a tile type that is sure to be offered, or a tile upgrade, or bonus scrap
    const tiles = (pool && pool.tiles) || E.RT.map(t => t.id);
    for (const n of all) if (n.type === 'battle') { const x = r(); n.loot = x < 0.14 ? 'upgrade' : x < 0.24 ? 'scrap' : 'tile:' + pick(r, tiles); }
    Object.defineProperty(nodes, '_trait', { value: trait.id, enumerable: false, writable: true });
    return nodes;
  }
  const traitOf = run => TRAITS.find(t => t.id === (run.traits && run.traits[run.sector])) || TRAITS[0];
  const rows = m => (m.boss ? m.boss.row + 1 : ROWS); // older saves were made with 7 floors
  // '?' signal: usually an event, sometimes an ambush / trader / salvage; each miss raises those odds (Slay the Spire's unknown room)
  function resolveSignal(run) {
    const u = run.unk || (run.unk = { battle: 10, shop: 3, treasure: 2 }), sal = traitOf(run).salvage || 1, x = R(run) * 100;
    let out = 'event';
    if (x < u.battle) out = 'battle'; else if (x < u.battle + u.shop) out = 'shop'; else if (x < u.battle + u.shop + u.treasure * sal) out = 'treasure';
    for (const k of ['battle', 'shop', 'treasure']) u[k] = k === out ? { battle: 10, shop: 3, treasure: 2 }[k] : u[k] + { battle: 10, shop: 3, treasure: 2 }[k];
    return out;
  }
  function treasureFor(run) { const a = relicOffer(run), ch = chipOffer(run); return { scrap: 0, offers: [a, tileOffer(run, 2)].concat(ch ? [ch] : []), node: 'treasure' }; }

  // ---- battle difficulty per node ----
  function battleOpts(run, node) {
    const s = run.sector, base = 1 + s * TUNE_RUN.sectorStep + Math.round(node.row * TUNE_RUN.rowStep), M = run.mods || {};
    const F = FRAMES.find(f => f.id === M.frame) || FRAMES[0], chip = run.chip || (run.relics && run.relics.emp ? 'emp' : null);
    const newFoes = Object.keys(E.FOES || {}).filter(t => { const [fs, fr] = E.FOES[t]; return s > fs || (s === fs && node.row >= fr); }); // swarm expansion: two forms per sector
    const ck = caught(run, node), mods = { newFoes, dmgMul: M.dmgMul || 1, foeHp: (M.foeHp || 1) * (1 + JUMP.hp * ck), foeAtk: (M.foeAtk || 1) * (1 + JUMP.atk * ck), foeSpd: M.foeSpd || 1, foeBoss: M.foeBoss || 1, skills: [F.skill || 'rail', chip], skillCd: M.skillCd || 1, train: M.train, lastStand: run.lastStood ? 0 : (M.lastStand || 0) };
    if (node.type === 'boss') return { ...mods, waveStart: (s + 1) * TUNE_RUN.sectorStep, waveCount: 3, boss: true, bossHp: TUNE_RUN.bossHp[s] };
    if (node.type === 'elite' && node.mutant) return { ...mods, waveStart: base + 4, waveCount: 3, elite: true, foeHp: mods.foeHp * 1.15 };
    if (node.type === 'elite') return { ...mods, waveStart: base + 2, waveCount: 3, elite: true };
    return { ...mods, waveStart: base, waveCount: node.row === 0 && s === 0 ? 2 : 3 };
  }

  // ---- run state ----
  function newRun(seed, meta, frameId, threat) {
    const mods = modsOf(meta, frameId || (meta && meta.frame) || 'ark', threat == null ? (meta ? meta.threat : 0) : threat), F = FRAMES.find(f => f.id === mods.frame);
    const run = { v: 3, seed, sector: 0, at: null, hull: mods.hull, tiles: Array(12).fill(null), relics: Object.assign({}, F.relics), scrap: mods.scrap,
      outer: false, maps: [], traits: [], visited: [], over: false, won: false, rngN: 0, mods, pool: poolOf(meta), rerolls: mods.rerolls,
      stats: { battles: 0, elites: 0, kills: 0, scrap: 0, nodes: 0, shops: 0, bosses: [0, 0, 0], startedAt: Date.now() } };
    run.traits[0] = pick(rng(seed * 17 + 3), TRAITS.filter(t => t.id !== 'front')).id; // sector 1 never opens on a war front
    run.maps[0] = genMap(seed, 0, mods.eliteMore, run.pool, run.traits[0]);
    F.tiles.forEach((t, i) => { run.tiles[[1, 3, 5][i]] = { ...t }; });
    if (meta && meta.exp && meta.exp.loot) { run.expLoot = meta.exp.loot; applyOffer(run, { kind: 'relic', id: meta.exp.loot }); meta.exp.loot = null; } // expedition spoils: start this run holding the relic
    if (mods.kit) { const off = run.pool.tiles.filter(t => ['battery', 'hangar', 'missile'].includes(t)); run.tiles[0] = { type: pick(rr(run), off), lv: mods.kit }; }
    if (mods.relicBag) run.reward = { node: 'start', scrap: 0, offers: startRelics(run) }; // relic bag: the run opens on a pick of 3 relics
    return run;
  }
  const R = run => { run.rngN++; return rng(run.seed * 7919 + run.rngN * 104729)(); };
  const rr = run => () => R(run);
  function hullMax(run) { const info = E.runTileInfo(run.tiles, run.mods && run.mods.train); return (run.mods ? run.mods.hull : E.TUNE.runHull) * (1 + 0.3 * (run.relics.plating || 0)) + info.reduce((a, t) => a + (t && t.type === 'shield' ? 25 * t.m : 0), 0); }
  function map(run) { return run.maps[run.sector]; }
  // ---- star-chart jumps (2026-11-05 test, FTL style): instead of following the drawn lines, jump to any signal in range —
  // one floor up within 2 columns, or two floors up within 1 column (skipping a floor). The swarm front follows a little faster
  // than one floor per jump; being caught makes battles harder until you pull ahead by skipping.
  const JUMP = { swarm0: -1.6, step: 1.15, hp: 0.12, atk: 0.06, max: 3, lat1: 1, lat2: 1, skip: 30 }; // skip: credits per floor-skip jump (fuel) × sector price
  const jumpOn = run => !!run.jump && run.sector > 0; // 2026-11-07 UI clean-up: sector 1 just follows the routes; floor skips and the swarm chase start in sector 2
  function choices(run) { // nodes the player may enter next
    const m = map(run);
    if (!run.at) return Object.values(m).filter(n => n.row === 0);
    const cur = m[run.at];
    if (!run.jump) return cur.next.map(id => m[id]);
    const skip = jumpOn(run); // 2026-11-09: sector 1 also jumps to any star one floor up (left/right 1) — a star that looks reachable is reachable; the floor skip and the swarm chase still start in sector 2
    return Object.values(m).filter(n => { const dr = n.row - cur.row, dc = Math.abs(n.col - cur.col); return cur.next.includes(n.id) || (dr === 1 && dc <= JUMP.lat1) || (skip && dr === 2 && dc <= JUMP.lat2 && run.scrap >= skipCost(run)); }); // the drawn routes always stay open
  }
  const skipCost = run => Math.round(JUMP.skip * (1 + 0.35 * run.sector) * (run.mods ? run.mods.priceMul : 1));
  function swarmOf(run) { if (run.swarm == null) { const m = map(run), c = run.at && m[run.at]; run.swarm = (c ? c.row : 0) + JUMP.swarm0; } return run.swarm; }
  function jumpTo(run, node) { if (!jumpOn(run)) return; const m = map(run), c = run.at && m[run.at]; if (c && node && node.row - c.row === 2) run.scrap = Math.max(0, run.scrap - skipCost(run)); run.swarm = swarmOf(run) + JUMP.step; } // once per jump, before entering; a floor-skip burns fuel credits
  function caught(run, node) { // how far the swarm has overrun the node (0 = safe, 1..3)
    if (!jumpOn(run)) return 0; const row = node ? node.row : run.at ? map(run)[run.at].row : 0, s = swarmOf(run);
    return s < row ? 0 : Math.min(JUMP.max, Math.floor(s - row) + 1);
  }
  function openSlots(run) { const out = []; for (let i = 0; i < (run.outer ? 12 : 6); i++) if (!run.tiles[i]) out.push(i); return out; }
  function heal(run, v, raw) { run.hull = Math.min(hullMax(run), run.hull + v * (raw || !run.mods ? 1 : run.mods.healMul)); }

  // ---- rewards ----
  function tileOffer(run, lv, type) { const l2 = (run.sector >= 1 ? 0.25 : 0) + (traitOf(run).lv2 || 0); return { kind: 'tile', type: type || pick(rr(run), run.pool ? run.pool.tiles : E.RT.map(t => t.id)), lv: lv || (R(run) < l2 ? 2 : 1) }; }
  function startRelics(run) { const out = []; for (let i = 0; i < 3; i++) { const o = relicOffer(run, out.map(x => x.id)); if (o.kind === 'relic' && !out.some(x => x.id === o.id)) out.push(o); } return out.length ? out : [{ kind: 'scrap', v: 60 }]; }
  function relicOffer(run, exclude) {
    const pool = RELICS.filter(x => (!run.pool || run.pool.relics.includes(x.id)) && (run.relics[x.id] || 0) < (x.stack || 1) && !(exclude || []).includes(x.id));
    return pool.length ? { kind: 'relic', id: pick(rr(run), pool).id } : { kind: 'scrap', v: 60 };
  }
  function chipOffer(run) { const pool = ((run.pool && run.pool.chips) || BASE_CHIPS).filter(id => id !== run.chip); return pool.length ? { kind: 'chip', id: pick(rr(run), pool) } : null; }
  function upgradable(run) { return run.tiles.map((t, i) => t && (t.lv || 1) < 3 ? i : -1).filter(i => i >= 0); }
  function rewardFor(run, node, battle) {
    let scrap = Math.round(battle.energy * (traitOf(run).scrap || 1) * (node.loot === 'scrap' ? 1.6 : 1));
    const offers = [];
    if (node.type === 'battle') {
      const lt = node.loot && node.loot.startsWith('tile:') ? node.loot.slice(5) : null;
      const a = tileOffer(run, 0, lt); let b = tileOffer(run); for (let g = 0; g < 4 && b.type === a.type; g++) b = tileOffer(run);
      offers.push(a, b, upgradable(run).length ? { kind: 'upgrade' } : tileOffer(run));
      if (node.loot === 'upgrade' && upgradable(run).length) offers.unshift(offers.pop()); // the previewed upgrade comes first, so it survives the 2-choice threat
    } else if (node.type === 'elite' && node.mutant) {
      const a = relicOffer(run), b = relicOffer(run, [a.id]); applyOffer(run, a); applyOffer(run, b); // both relics are taken; then a normal pick
      offers.push(relicOffer(run), tileOffer(run, 2), { kind: 'heal', v: Math.round(hullMax(run) * 0.25) });
      return { scrap, offers: offers.slice(0, run.mods ? run.mods.offers : 3), bonus: [a, b] };
    } else if (node.type === 'elite') {
      const a = relicOffer(run), b = relicOffer(run, [a.id]), ch = R(run) < 0.5 ? chipOffer(run) : null; offers.push(a, b, ch || relicOffer(run, [a.id, b.id]));
    } else if (node.type === 'boss') {
      offers.push(relicOffer(run), tileOffer(run, 2), { kind: 'heal', v: Math.round(hullMax(run) * 0.4) });
    }
    return { scrap, offers: offers.slice(0, run.mods ? run.mods.offers : 3) };
  }
  function applyOffer(run, o) { // returns 'place' when a tile still needs a slot
    if (o.kind === 'relic') { run.relics[o.id] = (run.relics[o.id] || 0) + 1; if (o.id === 'plating') heal(run, 30); return 'done'; }
    if (o.kind === 'heal') { heal(run, o.v, true); return 'done'; }
    if (o.kind === 'chip') { run.chip = o.id; return 'done'; }
    if (o.kind === 'scrap') { run.scrap += o.v; return 'done'; }
    if (o.kind === 'tile') return 'place';
    if (o.kind === 'upgrade') return 'upgrade';
    return 'done';
  }
  // 2026-11-05 (9 Kings stacking): a tile dropped on the same kind merges into it (levels add up, max 3) instead of replacing it
  const mergeLv = (old, tile) => old && tile && old.type === tile.type ? Math.min(3, (old.lv || 1) + (tile.lv || 1)) : 0;
  const canPlace = (run, slot, tile) => { const old = run.tiles[slot]; return !(old && old.type === tile.type && (old.lv || 1) >= 3); };
  function placeTile(run, slot, tile) {
    const max = run.outer ? 12 : 6; if (slot < 0 || slot >= max || !canPlace(run, slot, tile)) return false;
    const m = mergeLv(run.tiles[slot], tile);
    if (m) { run.tiles[slot].lv = m; return 'merge'; }
    run.tiles[slot] = { type: tile.type, lv: tile.lv || 1 };
    return true;
  }
  function upgradeTile(run, slot) { const t = run.tiles[slot]; if (!t || (t.lv || 1) >= 3) return false; t.lv = (t.lv || 1) + 1; return true; }

  // ---- shop ----
  function shopStock(run) {
    const k = (1 + 0.35 * run.sector) * (run.mods ? run.mods.priceMul : 1), items = [];
    for (let i = 0; i < 3; i++) { const t = tileOffer(run, i === 2 ? 2 : 1); items.push({ ...t, price: Math.round((t.lv === 2 ? 80 : 50) * k) }); }
    const a = relicOffer(run), b = relicOffer(run, [a.id]);
    items.push({ ...a, price: Math.round(120 * k) }, { ...b, price: Math.round(120 * k) });
    const ch = chipOffer(run); if (ch) items.push({ ...ch, price: Math.round(90 * k) });
    items.push({ kind: 'repair', v: 30, price: Math.round(40 * k) });
    items.push({ kind: 'upgrade', price: Math.round(65 * k) });
    run.shopBuys = 0; run.shopRerolls = 0;
    return items;
  }
  // 2026-11-05 (9 Kings merchant): every buy in the same supply ship makes the next one dearer; paid reroll gets dearer too
  const SHOP = { step: 0.3, reroll: 20, rerollStep: 20 };
  const shopPrice = (run, it) => Math.round(it.price * (1 + SHOP.step * (run.shopBuys || 0)));
  const rerollPrice = run => Math.round((SHOP.reroll + SHOP.rerollStep * (run.shopRerolls || 0)) * (1 + 0.35 * run.sector) * (run.mods ? run.mods.priceMul : 1));
  function shopBuy(run, i) { // pays and marks sold; the caller applies the item
    const it = run.shop && run.shop[i]; if (!it || it.sold) return 0; const p = shopPrice(run, it); if (run.scrap < p) return 0;
    run.scrap -= p; it.sold = true; run.shopBuys = (run.shopBuys || 0) + 1; return p;
  }
  function shopReroll(run) { // re-rolls the unsold tiles, relics and chip; repair and upgrade stay
    const p = rerollPrice(run); if (!run.shop || run.scrap < p) return false;
    run.scrap -= p; run.shopRerolls = (run.shopRerolls || 0) + 1;
    const k = (1 + 0.35 * run.sector) * (run.mods ? run.mods.priceMul : 1), have = [];
    run.shop = run.shop.map((it, i) => {
      if (it.sold) return it;
      if (it.kind === 'tile') { const t = tileOffer(run, i === 2 ? 2 : 1); return { ...t, price: Math.round((t.lv === 2 ? 80 : 50) * k) }; }
      if (it.kind === 'relic') { const a = relicOffer(run, have); have.push(a.id); return a.kind === 'relic' ? { ...a, price: Math.round(120 * k) } : it; }
      if (it.kind === 'chip') { const ch = chipOffer(run); return ch ? { ...ch, price: Math.round(90 * k) } : it; }
      return it;
    });
    return true;
  }

  // ---- events: text, then 2 choices with outcomes ----
  const EVENTS = [
    { id: 'wreck', title: '표류 화물선', text: '전원이 꺼진 화물선이 떠 있습니다. 화물칸에 무언가 남아 있을지 모릅니다. 하지만 스웜 알이 붙어 있을 수도 있습니다.',
      choices: [
        { label: '수색한다', hint: '60%: 크레딧 +70 · 40%: 선체 -15', fn: run => R(run) < 0.6 ? (run.scrap += 70, '화물칸에서 쓸 만한 부품을 찾았습니다. 크레딧 +70') : (run.hull -= 15, '스웜 알이 터졌습니다! 선체 -15') },
        { label: '지나친다', hint: '아무 일 없음', fn: () => '위험을 피해 항로를 유지합니다.' }] },
    { id: 'relic', title: '고대 위성', text: '스웜 이전 시대의 방어 위성입니다. 해체하면 장비를 얻을 수 있지만, 자폭 장치가 남아 있습니다.',
      choices: [
        { label: '해체한다', hint: '선체 -20 · 유물 1개', fn: run => { run.hull -= 20; const o = relicOffer(run); applyOffer(run, o); return o.kind === 'relic' ? `자폭 충격을 버티고 '${RELICS.find(x => x.id === o.id).name}'을(를) 얻었습니다. 선체 -20` : '쓸 만한 장비가 없었습니다. 선체 -20'; } },
        { label: '그냥 둔다', hint: '아무 일 없음', fn: () => '위성을 그대로 두고 떠납니다.' }] },
    { id: 'smuggler', title: '밀수업자', text: '"좋은 물건 있어. 크레딧 50이면 넘길게. 뭔지는 열어 봐야 알지."',
      choices: [
        { label: '산다 (크레딧 50)', hint: '무작위 타일 Lv2', need: run => run.scrap >= 50, fn: run => { run.scrap -= 50; run._pendingTile = tileOffer(run, 2); return `상자 안에는 ${E.RT.find(t => t.id === run._pendingTile.type).name} Lv2가 있었습니다.`; } },
        { label: '거절한다', hint: '아무 일 없음', fn: () => '"다음에 또 보자고."' }] },
    { id: 'rescue', title: '구조 신호', text: '탈출 포드가 구조 신호를 보내고 있습니다. 구조하면 승무원이 선체 수리를 돕겠다고 합니다.',
      choices: [
        { label: '구조한다', hint: '선체 +25', fn: run => { heal(run, 25); return '구조된 정비사들이 선체를 고쳤습니다. 선체 +25'; } },
        { label: '포드를 회수한다', hint: '크레딧 +35', fn: run => { run.scrap += 35; return '빈 포드를 분해했습니다. 크레딧 +35'; } }] },
    { id: 'experiment', title: '실험 증폭기', text: '불안정한 증폭 장치입니다. 타일 하나를 강화하지만, 과부하로 다른 타일 하나가 타 버립니다.',
      choices: [
        { label: '가동한다', hint: '무작위 타일 +1레벨 · 다른 타일 1개 파괴', need: run => run.tiles.filter(Boolean).length >= 2 && upgradable(run).length > 0, fn: run => {
          const up = pick(rr(run), upgradable(run)); upgradeTile(run, up);
          const rest = run.tiles.map((t, i) => t && i !== up ? i : -1).filter(i => i >= 0), gone = pick(rr(run), rest), name = E.RT.find(t => t.id === run.tiles[gone].type).name; run.tiles[gone] = null;
          return `${E.RT.find(t => t.id === run.tiles[up].type).name}이(가) Lv${run.tiles[up].lv}이 되었고, ${name}이(가) 타 버렸습니다.`; } },
        { label: '끈다', hint: '아무 일 없음', fn: () => '장치를 봉인했습니다.' }] },
    { id: 'nest', title: '스웜 둥지', text: '항로 옆에 작은 둥지가 있습니다. 정리하면 둥지 속 장비를 얻을 수 있습니다.',
      choices: [
        { label: '공격한다', hint: '엘리트 전투 · 승리 시 유물', fn: run => { run._ambush = true; return '둥지가 깨어났습니다!'; } },
        { label: '우회한다', hint: '선체 -8', fn: run => { run.hull -= 8; return '돌아가는 길에 유성우를 맞았습니다. 선체 -8'; } }] }
  ];
  function eventFor(run) { const seen = run.seenEvents || (run.seenEvents = []); const pool = EVENTS.filter(e => !seen.includes(e.id)); const ev = pick(rr(run), pool.length ? pool : EVENTS); seen.push(ev.id); return ev; }

  // ---- battle outcome bookkeeping ----
  function afterBattle(run, node, battle) {
    run.hull = battle.hull; run.stats.battles++; run.stats.kills += battle.kills;
    if (battle.reason === 'victory' && node.type === 'elite') run.stats.elites++;
    if (battle.reason === 'victory' && node.type === 'boss') run.stats.bosses[run.sector]++;
    if (battle.lastStood) run.lastStood = true; // the emergency barrier is spent for this run
    if (battle.reason !== 'victory') { run.over = true; run.won = false; return false; }
    const info = E.runTileInfo(run.tiles, run.mods && run.mods.train);
    heal(run, info.reduce((a, t) => a + (t && t.type === 'repair' ? 4 * t.m * (t.lv >= 3 ? 2 : 1) : 0), 0) + 8 * (run.relics.nano || 0));
    return true;
  }
  function advanceSector(run) {
    if (run.sector >= SECTORS.length - 1) { run.over = true; run.won = true; return; }
    run.sector++; run.at = null; run.outer = true; run.traits = run.traits || []; run.swarm = null;
    run.traits[run.sector] = pick(rng(run.seed * 17 + run.sector * 131 + 3), TRAITS).id;
    run.maps[run.sector] = genMap(run.seed, run.sector, run.mods && run.mods.eliteMore, run.pool, run.traits[run.sector]);
  }

  // ---- headless auto-player (balance tuning) ----
  const OFFENSE = ['battery', 'hangar', 'missile'];
  function autoPlace(run, tile) {
    const open = openSlots(run);
    if (!open.length) { // merge into the same kind if it can still level up, else replace the weakest tile
      let mi = -1, ml = 9; run.tiles.forEach((t, i) => { if (i < (run.outer ? 12 : 6) && t && t.type === tile.type && (t.lv || 1) < 3 && (t.lv || 1) < ml) { ml = t.lv || 1; mi = i; } });
      if (mi >= 0) { placeTile(run, mi, tile); return; }
      let worst = -1, wl = 9; run.tiles.forEach((t, i) => { if (i < (run.outer ? 12 : 6) && t && (t.lv || 1) < wl) { wl = t.lv || 1; worst = i; } });
      if ((tile.lv || 1) > wl) placeTile(run, worst, tile); return;
    }
    let best = open[0], bs = -1;
    for (const i of open) { const nb = E.runNeighbors(i).map(j => run.tiles[j]).filter(Boolean); const sc = (i < 6 ? 1 : 0) + nb.filter(x => x.type === tile.type || x.type === 'amplifier' || tile.type === 'amplifier').length * 2; if (sc > bs) { bs = sc; best = i; } }
    placeTile(run, best, tile);
  }
  function autoChoose(run, offers) {
    const hm = hullMax(run), low = run.hull < hm * 0.45, nT = run.tiles.filter(Boolean).length;
    const score = o => o.kind === 'heal' ? (low ? 9 : 1) : o.kind === 'chip' ? (run.chip ? 2 : 7) : o.kind === 'relic' ? 6 : o.kind === 'upgrade' ? 4 : o.kind === 'tile' ? (OFFENSE.includes(o.type) && nT < 4 ? 8 : o.type === 'shield' && low ? 7 : o.type === 'collector' ? 2 : 5) + (o.lv || 1) : 0;
    return offers.slice().sort((a, b) => score(b) - score(a))[0];
  }
  function autoBattle(run, node, extra) {
    const s = { ...E.newSave() };
    const b = new E.Battle(s, Object.assign({ seed: run.seed * 13 + run.stats.battles * 7 + run.sector * 101, headless: true, run: true, tiles: run.tiles, relics: run.relics, hull: run.hull, autoWeapons: true }, battleOpts(run, node), extra || {}));
    for (const k in b.weapons) b.weapons[k].unlocked = true;
    let g = 0; while (!b.over && g++ < 30 * 400) { b.step(); b.events.length = 0; }
    if (!b.over) b.end('timeout');
    return b;
  }
  function simulate(seed, log, meta, frameId, threat) {
    const run = newRun(seed, meta, frameId, threat), trace = []; run.jump = !!TUNE_RUN.simJump;
    if (run.reward && run.reward.node === 'start') { applyOffer(run, autoChoose(run, run.reward.offers)); run.reward = null; }
    while (!run.over) {
      const ch = choices(run), hm = hullMax(run);
      const pref = n => n.type === 'rest' ? (run.hull < hm * 0.6 ? 5 : 1) : n.type === 'shop' ? (run.scrap >= 90 ? 4 : 1) : n.type === 'elite' ? (run.hull > hm * (n.mutant ? 0.9 : 0.7) ? 3 : 0) : n.type === 'event' ? 2 : n.type === 'treasure' ? 6 : 3;
      const cr = run.at ? map(run)[run.at].row : -1, gap = jumpOn(run) ? cr + 1 - swarmOf(run) : 9; // jump mode: skip a floor when the swarm is close
      const sc = n => pref(n) + (jumpOn(run) && n.row - cr === 2 ? (gap < 0.8 ? 4 : -2) : 0);
      let node = ch.slice().sort((a, b) => sc(b) - sc(a))[0];
      jumpTo(run, node); run.at = node.id; run.stats.nodes++;
      if (node.type === 'event') { const t = resolveSignal(run); if (t !== 'event') node = { ...node, type: t, loot: t === 'battle' ? 'scrap' : undefined }; }
      if (node.type === 'treasure') { const o = autoChoose(run, treasureFor(run).offers), res = applyOffer(run, o); if (res === 'place') autoPlace(run, o); continue; }
      if (node.type === 'shop') run.stats.shops++;
      if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
        const b = autoBattle(run, node);
        const ok = afterBattle(run, node, b);
        trace.push(`${run.sector + 1}-${node.row}${node.type[0]}:${Math.round(run.hull)}`);
        if (!ok) break;
        const rw = rewardFor(run, node, b); run.scrap += rw.scrap;
        const o = autoChoose(run, rw.offers), res = applyOffer(run, o);
        if (res === 'place') autoPlace(run, o); else if (res === 'upgrade') { const u = upgradable(run); if (u.length) upgradeTile(run, u[0]); }
        if (node.type === 'boss') advanceSector(run);
      } else if (node.type === 'rest') {
        if (run.hull < hm * 0.7 || !upgradable(run).length) heal(run, hm * 0.3); else upgradeTile(run, upgradable(run)[0]);
      } else if (node.type === 'shop') {
        run.shop = shopStock(run); const st = run.shop, idx = it => st.indexOf(it);
        const t0 = st.find(it => it.kind === 'upgrade'); if (t0 && run.scrap >= shopPrice(run, t0) && upgradable(run).length && run.hull > hm * 0.5) { shopBuy(run, idx(t0)); upgradeTile(run, upgradable(run)[0]); }
        for (const it of st.slice().sort((a, b) => (a.kind === 'repair' && run.hull < hm * 0.5 ? -1 : 0) - (b.kind === 'repair' && run.hull < hm * 0.5 ? -1 : 0))) {
          if (it.sold || run.scrap < shopPrice(run, it)) continue;
          if (it.kind === 'repair') { if (run.hull > hm * 0.75) continue; shopBuy(run, idx(it)); heal(run, it.v); }
          else if (it.kind === 'tile') { if (!openSlots(run).length) continue; shopBuy(run, idx(it)); autoPlace(run, it); }
          else if (it.kind === 'relic') { shopBuy(run, idx(it)); applyOffer(run, it); }
          else if (it.kind === 'chip') { if (run.chip) continue; shopBuy(run, idx(it)); applyOffer(run, it); }
        }
        run.shop = null;
      } else if (node.type === 'event') {
        const ev = eventFor(run), c = ev.choices.find(c => !c.need || c.need(run)) || ev.choices[1];
        const choice = (ev.id === 'relic' && run.hull < 40) || (ev.id === 'nest' && run.hull < hm * 0.6) ? ev.choices[1] : c;
        choice.fn(run);
        if (run._pendingTile) { autoPlace(run, run._pendingTile); run._pendingTile = null; }
        if (run._ambush) { run._ambush = false; const b = autoBattle(run, { type: 'elite', row: node.row }); if (!afterBattle(run, { type: 'elite' }, b)) break; run.scrap += Math.round(b.energy); applyOffer(run, relicOffer(run)); }
        if (run.hull <= 0) { run.over = true; break; }
      }
    }
    if (log) console.log(trace.join(' '));
    run.over = true;
    return { run, won: run.won, sector: run.sector + 1, row: map(run)[run.at] ? map(run)[run.at].row : 0, battles: run.stats.battles, tiles: run.tiles.filter(Boolean).length, relics: Object.values(run.relics).reduce((a, b) => a + b, 0), trace };
  }

  const BUY_ORDER = ['kit', 'gun', 'trainAtk', 'lastStand', 'relicBag', 'hull', 'trainDef', 'supply', 'tactics', 'medic', 'salvage', 'trainSup', 'reroll', 'haggle', 'sensor']; // best value first (tools/balance/upvalue.js)
  function simulateCareer(n, seed0, opts) {
    const meta = newMeta(), out = []; meta.shards += (opts && opts.start) || 0; // opts.start / opts.bonus: purchased or ad shards (tools/balance/bm.js)
    for (let i = 0; i < n; i++) {
      // pick the best unlocked frame and the hardest threat already open (players climb after each clear)
      const frames = FRAMES.filter(f => isUnlocked(meta, 'frame', f.id)).map(f => f.id);
      meta.frame = (opts && opts.frame) || ['carrier', 'arsenal', 'ark', 'bastion'].find(f => frames.includes(f));
      meta.threat = meta.threatMax;
      const r = simulate((seed0 || 1) * 1000 + i + 1, false, meta, meta.frame, meta.threat);
      const st = settleRun(meta, r.run); meta.shards += (opts && opts.bonus) || 0; if (opts && opts.mul) meta.shards += Math.round(st.base * (opts.mul - 1));
      let bought = true; while (bought) { bought = false; for (const id of BUY_ORDER) { if (buyUpgrade(meta, id)) { bought = true; break; } } }
      out.push({ i: i + 1, won: r.won, at: r.won ? 'WIN' : `${r.sector}-${r.row}`, threat: r.run.mods.threat, shards: st.shards, bank: meta.shards, ups: Object.values(meta.up).reduce((a, b) => a + b, 0), unlocks: meta.unlocked.length, frame: meta.frame });
    }
    return { meta, log: out };
  }

  root.SZR = { upOpen, UP_GROUPS, startRelics, jumpOn, opsLoad, MPASS, mpassOf, mpassTier, mpassClaim, mpassReady, seasonOf, seasonEnd, SHARD_BONUS, bonusLeft, bonusClaim, MASTERY, masteryLevel, masteryMods, masteryXp, OPS, opsActive, opsMul, attendState, attendClaim, giftClaim, THREAT_RW, THREAT_HI, STORY, SHOP, shopPrice, rerollPrice, shopBuy, shopReroll, recoverLog, wakeLine, IAP, iapOf, iapGrant, iapOwned, passActive, passClaim, rushLeft, CHIPS, BASE_CHIPS, chipOffer, expProgress, escortOpts, expRoll, EXPED, expState, expSlots, expDestOpen, expReward, expSend, expCollect, expRush, expTouch, TRAITS, TREASURE_ROW, traitOf, rows, resolveSignal, treasureFor, UPGRADES, upCost, CODEX, FRAMES, THREATS, BASE_TILES, BASE_RELICS, newMeta, isUnlocked, poolOf, modsOf, shardsFor, settleRun, buyUpgrade, nameOf, simulateCareer, TUNE_RUN, SECTORS, ROWS, COLS, NODE, RELICS, EVENTS, genMap, battleOpts, newRun, hullMax, map, choices, JUMP, swarmOf, jumpTo, caught, skipCost, openSlots, heal, rewardFor, applyOffer, placeTile, mergeLv, canPlace, upgradeTile, upgradable, shopStock, eventFor, afterBattle, advanceSector, relicOffer, tileOffer, simulate };
})(typeof window !== 'undefined' ? window : globalThis);
