/* 문제은행 빌드: 크기·등급별 목표 수량을 채울 때까지 생성하고 bank.json으로 저장 */
'use strict';
const fs = require('fs');
const { generate, rng } = require('./gen.js');

// 선배치 1마리 기준(1~10레벨용)
const START = { 4: { 1: 8 }, 5: { 1: 8 }, 6: { 1: 10, 2: 6 }, 7: { 1: 4, 2: 8, 3: 4 }, 8: { 1: 8, 2: 6 }, 9: { 1: 3, 2: 6 } };
// 선배치 없음(11레벨 이후, 일일 퍼즐)
const FREE = { 8: { 1: 14, 2: 22, 3: 22, 4: 8 }, 9: { 1: 14, 2: 30, 3: 36, 4: 12 }, 10: { 1: 40, 2: 80, 3: 90, 4: 24 }, 11: { 3: 14, 4: 10 } };

function fill(n, quota, mode, seed) {
  const R = rng(seed), seen = new Set(), out = [], need = Object.assign({}, quota);
  let left = Object.values(need).reduce((a, b) => a + b, 0), tries = 0;
  const t0 = Date.now();
  while (left > 0 && Date.now() - t0 < 240000) {
    tries++;
    const p = generate(n, R, mode);
    if (!p || seen.has(p.reg) || !need[p.rank]) continue;
    if (p.max > n * n * (n <= 5 ? 0.6 : 0.46)) continue;          // 한 구역이 판을 뒤덮지 않게
    if (p.singles > (mode === 'start' ? 1 : 2)) continue;          // 한 칸 구역 제한
    seen.add(p.reg); need[p.rank]--; left--;
    out.push(mode === 'start' ? [p.reg, p.sol, p.rank, p.steps, p.pre] : [p.reg, p.sol, p.rank, p.steps]);
  }
  out.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  console.error(`${mode} n=${n}: ${out.length} puzzles, ${tries} tries, ${Date.now() - t0}ms, unmet=${JSON.stringify(Object.fromEntries(Object.entries(need).filter(e => e[1] > 0)))}`);
  return out;
}

const bank = {};
for (const n of Object.keys(START)) bank['s' + n] = fill(+n, START[n], 'start', 1000 + +n);
for (const n of Object.keys(FREE)) bank['f' + n] = fill(+n, FREE[n], 'free', 2000 + +n);
fs.writeFileSync(__dirname + '/../bank/bank.json', JSON.stringify(bank));
console.error('bank bytes', fs.statSync(__dirname + '/../bank/bank.json').size);
// 게임이 읽는 js/bank.js도 같은 내용으로 다시 쓴다
fs.writeFileSync(__dirname + '/../js/bank.js', '/* tools/addbank.js·buildbank.js가 만든 문제은행 (bank/bank.json과 같은 내용) */\nwindow.DOKU_BANK=' + fs.readFileSync(__dirname + '/../bank/bank.json', 'utf8') + ';\n');
