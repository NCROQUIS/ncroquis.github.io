/* 어려운 문제 보충: HARD(등급 4)·SUPER HARD(등급 5)용 문제를 시간 안에 되는 만큼 만들어 파일로 모은다.
   사용: node tools/addhard.js <size> <seed> <분> <출력.json> [등급4 최대 개수]
   끝난 뒤: node tools/mergehard.js <출력.json>...  (bank/bank.json과 js/bank.js에 합친다) */
'use strict';
const fs = require('fs');
const { generate, rng } = require('./gen.js');
const n = +process.argv[2], seed = +process.argv[3], ms = +process.argv[4] * 60000, out = process.argv[5], cap4 = +(process.argv[6] || 0);
const R = rng(seed), seen = new Set(), got = [], t0 = Date.now();
let tries = 0, n4 = 0, n5 = 0, lastSave = 0;
while (Date.now() - t0 < ms) {
  tries++;
  const p = generate(n, R, 'free');
  if (!p || seen.has(p.reg) || p.rank < 4) continue;
  if (p.rank === 4 && n4 >= cap4) continue;
  if (p.max > n * n * 0.46 || p.singles > 2) continue;                 // 한 구역이 판을 뒤덮거나 한 칸 구역이 많으면 뺀다
  seen.add(p.reg); got.push([p.reg, p.sol, p.rank, p.steps]);
  if (p.rank === 4) n4++; else n5++;
  if (Date.now() - lastSave > 15000) { fs.writeFileSync(out, JSON.stringify({ n, seed, list: got })); lastSave = Date.now(); }
}
fs.writeFileSync(out, JSON.stringify({ n, seed, list: got }));
console.error(`n=${n} seed=${seed}: R4 ${n4}, R5 ${n5} (${tries} tries, ${Math.round((Date.now() - t0) / 1000)}s)`);
