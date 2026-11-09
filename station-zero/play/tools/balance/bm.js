// BM check (2026-11-04): how much do ads / passes / shard bundles shorten "shipyard fully upgraded" (target 25–30 runs free)?
// 출석(주 ◆560 ≈ 하루 ◆80)·주말/기간 이벤트(평균 ×1.2)는 '출석·이벤트' 줄. assumes 2.5 runs a day; ad bonus and pass shards are spread over those runs. usage: node tools/balance/bm.js [careers]
require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const R = globalThis.SZR;
const N = +(process.argv[2] || 6), RUNS_PER_DAY = 2.5, MAXUPS = R.UPGRADES.reduce((a, u) => a + u.max, 0);
const total = R.UPGRADES.reduce((a, u) => { let s = 0; for (let L = 0; L < u.max; L++) s += R.upCost(u.id, L); return a + s; }, 0);
const cases = [
  ['무과금 (이벤트 없음)', {}],
  ['무과금 + 출석·이벤트', { bonus: 80 / RUNS_PER_DAY, mul: 1.2 }],
  ['광고 ◆20×3/일', { bonus: 60 / RUNS_PER_DAY }],
  ['보급 패스 ◆80/일', { bonus: 80 / RUNS_PER_DAY }],
  ['패스 + 광고', { bonus: 140 / RUNS_PER_DAY }],
  ['출석·이벤트 + 패스 + 광고', { bonus: 220 / RUNS_PER_DAY, mul: 1.2 }],
  ['스타터 팩 ◆1,500', { start: 1500 }],
  ['묶음 ₩33,000 ◆2,200', { start: 2200 }],
  ['묶음 ₩69,000 ◆4,900', { start: 4900 }],
  ['묶음 ₩119,000 ◆9,000', { start: 9000 }]
];
console.log(`강화 총비용 ◆${total} · 강화 ${MAXUPS}단계 · 하루 ${RUNS_PER_DAY}판 가정 · 커리어 ${N}개 평균`);
for (const [name, o] of cases) {
  const at = [];
  for (let s = 1; s <= N; s++) { const c = R.simulateCareer(90, s, o); const k = c.log.findIndex(l => l.ups === MAXUPS); at.push(k < 0 ? 91 : k + 1); }
  const m = at.reduce((a, b) => a + b, 0) / at.length;
  console.log(`${name.padEnd(20)} 강화 완료 ${m.toFixed(1)}판 (${(m / RUNS_PER_DAY).toFixed(1)}일)  [${at.join(', ')}]`);
}
