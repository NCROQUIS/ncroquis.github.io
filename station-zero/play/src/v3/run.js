/* Station Zero v3 — roguelike run layer: sector maps, rewards, shop, events, rest. Pure logic, seeded. Uses SZE (engine). */
(function (root) {
  const E = root.SZE;
  const SECTORS = [
    { name: '섹터 1 · 루나 외곽', bossName: '군체 모함' },
    { name: '섹터 2 · 소행성대', bossName: '여왕 둥지' },
    { name: '섹터 3 · 스웜 본진', bossName: '스웜 모선' }
  ];
  const ROWS = 7, COLS = 4;
  const TUNE_RUN = { sectorStep: 8, rowStep: 1.2, bossHp: [0.6, 1.0, 1.35] };
  const NODE = {
    battle: { name: '전투', icon: '⚔' },
    elite:  { name: '엘리트', icon: '☠' },
    shop:   { name: '보급선', icon: '$' },
    event:  { name: '신호', icon: '?' },
    rest:   { name: '정비', icon: '+' },
    boss:   { name: '보스', icon: '◆' }
  };
  const RELICS = [
    { id: 'overcharge',  name: '과충전 탄두', text: '모든 피해 +25%' },
    { id: 'rapid',       name: '속사 회로',   text: '주포 연사 +20%' },
    { id: 'scope',       name: '치명 조준경', text: '치명타 확률 +10%p' },
    { id: 'plating',     name: '보강 장갑',   text: '기본 선체 최대치 +30%' },
    { id: 'chain',       name: '연쇄 번개',   text: '치명타 시 주변 1기에 50% 피해' },
    { id: 'thorns',      name: '반격 실드',   text: '받은 접촉 피해의 30% 반사' },
    { id: 'optics',      name: '사거리 확장', text: '사거리 +15%' },
    { id: 'pierce',      name: '관통탄',      text: '주포 탄이 적 1기를 관통' },
    { id: 'harvest',     name: '고물 자석',   text: '스크랩 +20%' },
    { id: 'orbital',     name: '오비탈 위성', text: '위성 1기가 궤도를 돌며 들이받고 적 탄을 막음 (최대 3)', stack: 3 },
    { id: 'emp',         name: 'EMP 링',      text: 'EMP 링 병기 해금 (주변 적 기절)' },
    { id: 'railcool',    name: '레일건 냉각기', text: '레일건 쿨타임 -30%' },
    { id: 'hangarclock', name: '요격기 과급기', text: '요격기 사격 속도 +30%' },
    { id: 'warhead',     name: '고폭 탄두',   text: '미사일 폭발 반경 +40%' },
    { id: 'nano',        name: '나노 수리',   text: '전투 승리 시 선체 +8' }
  ];
  // ================= META: permanent growth between runs =================
  // 1) core shards earned every run  2) shipyard upgrades  3) codex unlocks (milestones)  4) starting frames  5) threat levels
  const UPGRADES = [
    { id: 'hull',    name: '강화 선체',   max: 5, base: 25, text: L => `시작·최대 선체 +${8 * L}` },
    { id: 'gun',     name: '주포 개량',   max: 5, base: 30, text: L => `모든 피해 +${6 * L}%` },
    { id: 'medic',   name: '비상 수리반', max: 3, base: 35, text: L => `정비·수리 회복 +${15 * L}%` },
    { id: 'supply',  name: '보급 계약',   max: 4, base: 20, text: L => `시작 스크랩 +${25 * L}` },
    { id: 'haggle',  name: '상인 연줄',   max: 3, base: 40, text: L => `보급선 가격 -${6 * L}%` },
    { id: 'reroll',  name: '전술 분석기', max: 2, base: 60, text: L => `판마다 보상 다시 뽑기 ${L}회` },
    { id: 'kit',     name: '시작 장비',   max: 2, base: 70, text: L => L ? `무작위 공격 타일 Lv${L}로 시작` : '시작 타일 없음' },
    { id: 'salvage', name: '회수 장치',   max: 3, base: 50, text: L => `코어 조각 +${10 * L}%` }
  ];
  const UP_COST_K = 2.2; // tuned so a typical player maxes the shipyard after ~30 runs
  const upCost = (id, L) => { const u = UPGRADES.find(x => x.id === id); return Math.round(u.base * UP_COST_K * Math.pow(L + 1, 1.45)); };
  const BASE_TILES = ['battery', 'hangar', 'shield', 'repair'];
  const BASE_RELICS = ['overcharge', 'rapid', 'scope', 'plating', 'thorns', 'optics', 'harvest', 'nano'];
  // codex: what unlocks, and the milestone that unlocks it (checked against meta.stats after every run)
  const CODEX = [
    { kind: 'tile',  id: 'missile',     need: s => s.elites >= 1,       hint: '엘리트 처음 격파' },
    { kind: 'relic', id: 'emp',         need: s => s.elites >= 3,       hint: '엘리트 누적 3회 격파' },
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
    { id: 'ark',     name: '아크 제로',  text: '코어만 남은 기본 정거장. 무엇이든 될 수 있습니다.', hull: 0, tiles: [], relics: {}, dmg: 1 },
    { id: 'carrier', name: '아르고스',   text: '격납고 1칸과 요격기 과급기로 시작 · 선체 -15', hull: -15, tiles: [{ type: 'hangar', lv: 1 }], relics: { hangarclock: 1 }, dmg: 1 },
    { id: 'bastion', name: '이지스',     text: '방벽·수리 1칸씩으로 시작 · 선체 +20 · 피해 -15%', hull: 20, tiles: [{ type: 'shield', lv: 1 }, { type: 'repair', lv: 1 }], relics: {}, dmg: 0.85 },
    { id: 'arsenal', name: '헬파이어',   text: '미사일 1칸과 고폭 탄두로 시작 · 선체 -10', hull: -10, tiles: [{ type: 'missile', lv: 1 }], relics: { warhead: 1 }, dmg: 1 }
  ];
  // threat levels: each adds one rule on top of the previous ones; shards ×(1 + 0.2 per level)
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
    { n: 10, text: '모든 적 체력 +10% 추가' }
  ];
  function newMeta() { return { v: 1, shards: 0, up: {}, unlocked: [], frame: 'ark', threat: 0, threatMax: 0, stats: { runs: 0, wins: 0, elites: 0, bosses: [0, 0, 0], shops: 0, kills: 0, maxSector: 0 } }; }
  const isUnlocked = (meta, kind, id) => (kind === 'tile' && BASE_TILES.includes(id)) || (kind === 'relic' && BASE_RELICS.includes(id)) || (kind === 'frame' && id === 'ark') || (meta && meta.unlocked.includes(kind + ':' + id));
  function poolOf(meta) {
    return { tiles: E.RT.map(t => t.id).filter(id => isUnlocked(meta, 'tile', id)), relics: RELICS.map(r => r.id).filter(id => isUnlocked(meta, 'relic', id)) };
  }
  // the modifiers a run carries, frozen at the start of the run
  function modsOf(meta, frameId, threat) {
    const L = id => (meta && meta.up[id]) || 0, T = threat || 0, F = FRAMES.find(f => f.id === frameId) || FRAMES[0];
    return {
      frame: F.id, threat: T,
      hull: E.TUNE.runHull + F.hull + 8 * L('hull') - (T >= 5 ? 15 : 0),
      dmgMul: (1 + 0.06 * L('gun')) * F.dmg,
      healMul: (1 + 0.15 * L('medic')) * (T >= 3 ? 0.7 : 1),
      scrap: 25 * L('supply'),
      priceMul: (1 - 0.06 * L('haggle')) * (T >= 7 ? 1.2 : 1),
      rerolls: L('reroll'), kit: L('kit'), shardMul: (1 + 0.1 * L('salvage')) * (1 + 0.2 * T),
      foeHp: (T >= 1 ? 1.1 : 1) * (T >= 10 ? 1.1 : 1), foeAtk: T >= 6 ? 1.1 : 1, foeSpd: T >= 8 ? 1.1 : 1, foeBoss: T >= 4 ? 1.25 : 1,
      eliteMore: T >= 2, offers: T >= 9 ? 2 : 3
    };
  }
  function shardsFor(run) { // earned at the end of every run, won or lost
    const st = run.stats, base = 4 * st.nodes + 3 * st.battles + 12 * st.elites + [30, 45, 60].reduce((a, v, i) => a + (st.bosses[i] ? v : 0), 0) + (run.won ? 80 : 0);
    return Math.round(base * (run.mods ? run.mods.shardMul : 1));
  }
  // fold a finished run into the permanent record; returns { shards, unlocked: [codex entries] }
  function settleRun(meta, run) {
    const s = meta.stats, gain = shardsFor(run);
    meta.shards += gain; s.runs++; if (run.won) s.wins++;
    s.elites += run.stats.elites; s.kills += run.stats.kills; s.shops += run.stats.shops || 0;
    for (let i = 0; i < 3; i++) s.bosses[i] += run.stats.bosses[i] || 0;
    s.maxSector = Math.max(s.maxSector, run.won ? 4 : run.sector + 1);
    if (run.won && run.mods && run.mods.threat >= meta.threatMax && meta.threatMax < THREATS.length) meta.threatMax = run.mods.threat + 1;
    const fresh = [];
    for (const c of CODEX) { const key = c.kind + ':' + c.id; if (!meta.unlocked.includes(key) && c.need(s)) { meta.unlocked.push(key); fresh.push(c); } }
    return { shards: gain, unlocked: fresh };
  }
  function buyUpgrade(meta, id) {
    const u = UPGRADES.find(x => x.id === id), L = meta.up[id] || 0; if (!u || L >= u.max) return false;
    const c = upCost(id, L); if (meta.shards < c) return false;
    meta.shards -= c; meta.up[id] = L + 1; return true;
  }
  function nameOf(kind, id) { return kind === 'tile' ? E.RT.find(t => t.id === id).name : kind === 'relic' ? RELICS.find(r => r.id === id).name : FRAMES.find(f => f.id === id).name; }

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function weighted(r, table) { const tot = table.reduce((a, [, w]) => a + w, 0); let x = r() * tot; for (const [k, w] of table) { if ((x -= w) < 0) return k; } return table[0][0]; }

  // ---- map: 3 crossing paths over a 4-wide grid, Slay-the-Spire style ----
  function genMap(seed, sector, eliteMore) {
    const r = rng(seed * 31 + sector * 977 + 5), nodes = {}, key = (row, col) => row + '-' + col;
    const add = (row, col) => nodes[key(row, col)] || (nodes[key(row, col)] = { id: key(row, col), row, col, type: null, next: [] });
    const starts = [0, 1, 2, 3].sort(() => r() - 0.5).slice(0, 3);
    for (const s of starts) {
      let col = s;
      for (let row = 0; row < ROWS - 1; row++) {
        const n = add(row, col);
        if (row === ROWS - 2) { if (!n.next.includes('boss')) n.next.push('boss'); break; }
        let nc = Math.max(0, Math.min(COLS - 1, col + pick(r, [-1, 0, 0, 1])));
        const m = add(row + 1, nc); if (!n.next.includes(m.id)) n.next.push(m.id); col = nc;
      }
    }
    nodes.boss = { id: 'boss', row: ROWS - 1, col: 1.5, type: 'boss', next: [] };
    for (const n of Object.values(nodes)) {
      if (n.type) continue;
      if (n.row === 0) n.type = 'battle';
      else if (n.row === ROWS - 2) n.type = 'rest';
      else n.type = weighted(r, [['battle', 45], ['event', 22], ['elite', n.row >= 2 ? (eliteMore ? 26 : 14) : 0], ['shop', n.row >= 1 ? 12 : 0], ['rest', n.row >= 3 ? 7 : 0]]);
    }
    const mid = Object.values(nodes).filter(n => n.row >= 2 && n.row <= 4);
    if (!mid.some(n => n.type === 'shop')) { const c = mid.filter(n => n.type !== 'elite'); if (c.length) pick(r, c).type = 'shop'; }
    return nodes;
  }

  // ---- battle difficulty per node ----
  function battleOpts(run, node) {
    const s = run.sector, base = 1 + s * TUNE_RUN.sectorStep + Math.round(node.row * TUNE_RUN.rowStep), M = run.mods || {};
    const mods = { dmgMul: M.dmgMul || 1, foeHp: M.foeHp || 1, foeAtk: M.foeAtk || 1, foeSpd: M.foeSpd || 1, foeBoss: M.foeBoss || 1 };
    if (node.type === 'boss') return { ...mods, waveStart: (s + 1) * TUNE_RUN.sectorStep, waveCount: 3, boss: true, bossHp: TUNE_RUN.bossHp[s] };
    if (node.type === 'elite') return { ...mods, waveStart: base + 2, waveCount: 3, elite: true };
    return { ...mods, waveStart: base, waveCount: node.row === 0 && s === 0 ? 2 : 3 };
  }

  // ---- run state ----
  function newRun(seed, meta, frameId, threat) {
    const mods = modsOf(meta, frameId || (meta && meta.frame) || 'ark', threat == null ? (meta ? meta.threat : 0) : threat), F = FRAMES.find(f => f.id === mods.frame);
    const run = { v: 3, seed, sector: 0, at: null, hull: mods.hull, tiles: Array(12).fill(null), relics: Object.assign({}, F.relics), scrap: mods.scrap,
      outer: false, maps: [genMap(seed, 0, mods.eliteMore)], visited: [], over: false, won: false, rngN: 0, mods, pool: poolOf(meta), rerolls: mods.rerolls,
      stats: { battles: 0, elites: 0, kills: 0, scrap: 0, nodes: 0, shops: 0, bosses: [0, 0, 0], startedAt: Date.now() } };
    F.tiles.forEach((t, i) => { run.tiles[[1, 3, 5][i]] = { ...t }; });
    if (mods.kit) { const off = run.pool.tiles.filter(t => ['battery', 'hangar', 'missile'].includes(t)); run.tiles[0] = { type: pick(rr(run), off), lv: mods.kit }; }
    return run;
  }
  const R = run => { run.rngN++; return rng(run.seed * 7919 + run.rngN * 104729)(); };
  const rr = run => () => R(run);
  function hullMax(run) { const info = E.runTileInfo(run.tiles); return (run.mods ? run.mods.hull : E.TUNE.runHull) * (1 + 0.3 * (run.relics.plating || 0)) + info.reduce((a, t) => a + (t && t.type === 'shield' ? 25 * t.m : 0), 0); }
  function map(run) { return run.maps[run.sector]; }
  function choices(run) { // nodes the player may enter next
    const m = map(run);
    if (!run.at) return Object.values(m).filter(n => n.row === 0);
    return m[run.at].next.map(id => m[id]);
  }
  function openSlots(run) { const out = []; for (let i = 0; i < (run.outer ? 12 : 6); i++) if (!run.tiles[i]) out.push(i); return out; }
  function heal(run, v, raw) { run.hull = Math.min(hullMax(run), run.hull + v * (raw || !run.mods ? 1 : run.mods.healMul)); }

  // ---- rewards ----
  function tileOffer(run, lv) { return { kind: 'tile', type: pick(rr(run), run.pool ? run.pool.tiles : E.RT.map(t => t.id)), lv: lv || (run.sector >= 1 && R(run) < 0.25 ? 2 : 1) }; }
  function relicOffer(run, exclude) {
    const pool = RELICS.filter(x => (!run.pool || run.pool.relics.includes(x.id)) && (run.relics[x.id] || 0) < (x.stack || 1) && !(exclude || []).includes(x.id));
    return pool.length ? { kind: 'relic', id: pick(rr(run), pool).id } : { kind: 'scrap', v: 60 };
  }
  function upgradable(run) { return run.tiles.map((t, i) => t && (t.lv || 1) < 3 ? i : -1).filter(i => i >= 0); }
  function rewardFor(run, node, battle) {
    const scrap = Math.round(battle.energy);
    const offers = [];
    if (node.type === 'battle') {
      const a = tileOffer(run); let b = tileOffer(run); for (let g = 0; g < 4 && b.type === a.type; g++) b = tileOffer(run);
      offers.push(a, b, upgradable(run).length ? { kind: 'upgrade' } : tileOffer(run));
    } else if (node.type === 'elite') {
      const a = relicOffer(run), b = relicOffer(run, [a.id]), c = relicOffer(run, [a.id, b.id]); offers.push(a, b, c);
    } else if (node.type === 'boss') {
      offers.push(relicOffer(run), tileOffer(run, 2), { kind: 'heal', v: Math.round(hullMax(run) * 0.4) });
    }
    return { scrap, offers: offers.slice(0, run.mods ? run.mods.offers : 3) };
  }
  function applyOffer(run, o) { // returns 'place' when a tile still needs a slot
    if (o.kind === 'relic') { run.relics[o.id] = (run.relics[o.id] || 0) + 1; if (o.id === 'plating') heal(run, 30); return 'done'; }
    if (o.kind === 'heal') { heal(run, o.v, true); return 'done'; }
    if (o.kind === 'scrap') { run.scrap += o.v; return 'done'; }
    if (o.kind === 'tile') return 'place';
    if (o.kind === 'upgrade') return 'upgrade';
    return 'done';
  }
  function placeTile(run, slot, tile) {
    const max = run.outer ? 12 : 6; if (slot < 0 || slot >= max) return false;
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
    items.push({ kind: 'repair', v: 30, price: Math.round(40 * k) });
    items.push({ kind: 'upgrade', price: Math.round(65 * k) });
    return items;
  }

  // ---- events: text, then 2 choices with outcomes ----
  const EVENTS = [
    { id: 'wreck', title: '표류 화물선', text: '전원이 꺼진 화물선이 떠 있습니다. 화물칸에 무언가 남아 있을지 모릅니다. 하지만 스웜 알이 붙어 있을 수도 있습니다.',
      choices: [
        { label: '수색한다', hint: '60%: 스크랩 +70 · 40%: 선체 -15', fn: run => R(run) < 0.6 ? (run.scrap += 70, '화물칸에서 쓸 만한 부품을 찾았습니다. 스크랩 +70') : (run.hull -= 15, '스웜 알이 터졌습니다! 선체 -15') },
        { label: '지나친다', hint: '아무 일 없음', fn: () => '위험을 피해 항로를 유지합니다.' }] },
    { id: 'relic', title: '고대 위성', text: '스웜 이전 시대의 방어 위성입니다. 해체하면 장비를 얻을 수 있지만, 자폭 장치가 남아 있습니다.',
      choices: [
        { label: '해체한다', hint: '선체 -20 · 유물 1개', fn: run => { run.hull -= 20; const o = relicOffer(run); applyOffer(run, o); return o.kind === 'relic' ? `자폭 충격을 버티고 '${RELICS.find(x => x.id === o.id).name}'을(를) 얻었습니다. 선체 -20` : '쓸 만한 장비가 없었습니다. 선체 -20'; } },
        { label: '그냥 둔다', hint: '아무 일 없음', fn: () => '위성을 그대로 두고 떠납니다.' }] },
    { id: 'smuggler', title: '밀수업자', text: '"좋은 물건 있어. 스크랩 50이면 넘길게. 뭔지는 열어 봐야 알지."',
      choices: [
        { label: '산다 (스크랩 50)', hint: '무작위 타일 Lv2', need: run => run.scrap >= 50, fn: run => { run.scrap -= 50; run._pendingTile = tileOffer(run, 2); return `상자 안에는 ${E.RT.find(t => t.id === run._pendingTile.type).name} Lv2가 있었습니다.`; } },
        { label: '거절한다', hint: '아무 일 없음', fn: () => '"다음에 또 보자고."' }] },
    { id: 'rescue', title: '구조 신호', text: '탈출 포드가 구조 신호를 보내고 있습니다. 구조하면 승무원이 선체 수리를 돕겠다고 합니다.',
      choices: [
        { label: '구조한다', hint: '선체 +25', fn: run => { heal(run, 25); return '구조된 정비사들이 선체를 고쳤습니다. 선체 +25'; } },
        { label: '포드를 회수한다', hint: '스크랩 +35', fn: run => { run.scrap += 35; return '빈 포드를 분해했습니다. 스크랩 +35'; } }] },
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
    if (battle.reason !== 'victory') { run.over = true; run.won = false; return false; }
    const info = E.runTileInfo(run.tiles);
    heal(run, info.reduce((a, t) => a + (t && t.type === 'repair' ? 4 * t.m : 0), 0) + 8 * (run.relics.nano || 0));
    return true;
  }
  function advanceSector(run) {
    if (run.sector >= SECTORS.length - 1) { run.over = true; run.won = true; return; }
    run.sector++; run.at = null; run.outer = true; run.maps[run.sector] = genMap(run.seed, run.sector, run.mods && run.mods.eliteMore);
  }

  // ---- headless auto-player (balance tuning) ----
  const OFFENSE = ['battery', 'hangar', 'missile'];
  function autoPlace(run, tile) {
    const open = openSlots(run);
    if (!open.length) { // replace the weakest tile
      let worst = -1, wl = 9; run.tiles.forEach((t, i) => { if (i < (run.outer ? 12 : 6) && t && (t.lv || 1) < wl) { wl = t.lv || 1; worst = i; } });
      if ((tile.lv || 1) > wl) placeTile(run, worst, tile); return;
    }
    let best = open[0], bs = -1;
    for (const i of open) { const nb = E.runNeighbors(i).map(j => run.tiles[j]).filter(Boolean); const sc = (i < 6 ? 1 : 0) + nb.filter(x => x.type === tile.type || x.type === 'amplifier' || tile.type === 'amplifier').length * 2; if (sc > bs) { bs = sc; best = i; } }
    placeTile(run, best, tile);
  }
  function autoChoose(run, offers) {
    const hm = hullMax(run), low = run.hull < hm * 0.45, nT = run.tiles.filter(Boolean).length;
    const score = o => o.kind === 'heal' ? (low ? 9 : 1) : o.kind === 'relic' ? 6 : o.kind === 'upgrade' ? 4 : o.kind === 'tile' ? (OFFENSE.includes(o.type) && nT < 4 ? 8 : o.type === 'shield' && low ? 7 : o.type === 'collector' ? 2 : 5) + (o.lv || 1) : 0;
    return offers.slice().sort((a, b) => score(b) - score(a))[0];
  }
  function autoBattle(run, node, extra) {
    const s = { ...E.newSave() };
    const b = new E.Battle(s, Object.assign({ seed: run.seed * 13 + run.stats.battles * 7 + run.sector * 101, headless: true, run: true, tiles: run.tiles, relics: run.relics, hull: run.hull, autoWeapons: true }, battleOpts(run, node), extra || {}));
    b.weapons.rail.unlocked = true;
    let g = 0; while (!b.over && g++ < 30 * 400) { b.step(); b.events.length = 0; }
    if (!b.over) b.end('timeout');
    return b;
  }
  function simulate(seed, log, meta, frameId, threat) {
    const run = newRun(seed, meta, frameId, threat), trace = [];
    while (!run.over) {
      const ch = choices(run), hm = hullMax(run);
      const pref = n => n.type === 'rest' ? (run.hull < hm * 0.6 ? 5 : 1) : n.type === 'shop' ? (run.scrap >= 90 ? 4 : 1) : n.type === 'elite' ? (run.hull > hm * 0.7 ? 3 : 0) : n.type === 'event' ? 2 : 3;
      const node = ch.slice().sort((a, b) => pref(b) - pref(a))[0];
      run.at = node.id; run.stats.nodes++;
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
        const st = shopStock(run);
        const t0 = st.find(it => it.kind === 'upgrade'); if (t0 && run.scrap >= t0.price && upgradable(run).length && run.hull > hm * 0.5) { run.scrap -= t0.price; t0.sold = true; upgradeTile(run, upgradable(run)[0]); }
        for (const it of st.sort((a, b) => (a.kind === 'repair' && run.hull < hm * 0.5 ? -1 : 0) - (b.kind === 'repair' && run.hull < hm * 0.5 ? -1 : 0))) {
          if (run.scrap < it.price || it.sold) continue;
          if (it.kind === 'repair') { if (run.hull > hm * 0.75) continue; run.scrap -= it.price; heal(run, it.v); }
          else if (it.kind === 'tile') { if (!openSlots(run).length) continue; run.scrap -= it.price; autoPlace(run, it); }
          else if (it.kind === 'relic') { run.scrap -= it.price; applyOffer(run, it); }
        }
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

  const BUY_ORDER = ['gun', 'hull', 'kit', 'supply', 'medic', 'salvage', 'reroll', 'haggle'];
  function simulateCareer(n, seed0, opts) {
    const meta = newMeta(), out = [];
    for (let i = 0; i < n; i++) {
      // pick the best unlocked frame and the hardest threat already open (players climb after each clear)
      const frames = FRAMES.filter(f => isUnlocked(meta, 'frame', f.id)).map(f => f.id);
      meta.frame = (opts && opts.frame) || ['carrier', 'arsenal', 'ark', 'bastion'].find(f => frames.includes(f));
      meta.threat = meta.threatMax;
      const r = simulate((seed0 || 1) * 1000 + i + 1, false, meta, meta.frame, meta.threat);
      const st = settleRun(meta, r.run);
      let bought = true; while (bought) { bought = false; for (const id of BUY_ORDER) { if (buyUpgrade(meta, id)) { bought = true; break; } } }
      out.push({ i: i + 1, won: r.won, at: r.won ? 'WIN' : `${r.sector}-${r.row}`, threat: r.run.mods.threat, shards: st.shards, bank: meta.shards, ups: Object.values(meta.up).reduce((a, b) => a + b, 0), unlocks: meta.unlocked.length, frame: meta.frame });
    }
    return { meta, log: out };
  }

  root.SZR = { UPGRADES, upCost, CODEX, FRAMES, THREATS, BASE_TILES, BASE_RELICS, newMeta, isUnlocked, poolOf, modsOf, shardsFor, settleRun, buyUpgrade, nameOf, simulateCareer, TUNE_RUN, SECTORS, ROWS, COLS, NODE, RELICS, EVENTS, genMap, battleOpts, newRun, hullMax, map, choices, openSlots, heal, rewardFor, applyOffer, placeTile, upgradeTile, upgradable, shopStock, eventFor, afterBattle, advanceSector, relicOffer, tileOffer, simulate };
})(typeof window !== 'undefined' ? window : globalThis);
