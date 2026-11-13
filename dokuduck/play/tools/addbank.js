/* 엑셀 레벨표에 맞춘 문제은행 보강: 선배치 규칙별(a: 1~6레벨, b: 7~10레벨) 은행, 7×7 R4, 10×10 R5(Hard) */
'use strict';
const fs = require('fs');
const { generate, rng } = require('./gen.js');
const file = __dirname + '/../bank/bank.json', bank = JSON.parse(fs.readFileSync(file));
Object.keys(bank).filter(k => k[0] === 's').forEach(k => delete bank[k]);
function fill(n, quota, mode, seed, limitMs, maxSingles) {
  const R = rng(seed), seen = new Set(), out = [], need = Object.assign({}, quota);
  let left = Object.values(need).reduce((a, b) => a + b, 0), tries = 0; const t0 = Date.now();
  while (left > 0 && Date.now() - t0 < limitMs) {
    tries++; const p = generate(n, R, mode);
    if (!p || seen.has(p.reg) || !need[p.rank]) continue;
    if (p.max > n * n * (n <= 5 ? 0.6 : 0.46) || p.singles > maxSingles) continue;
    seen.add(p.reg); need[p.rank]--; left--;
    out.push(mode === 'free' ? [p.reg, p.sol, p.rank, p.steps] : [p.reg, p.sol, p.rank, p.steps, p.pre]);
  }
  out.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  console.error(`${mode} n=${n}: ${out.length} (${tries} tries, ${Date.now() - t0}ms) unmet=${JSON.stringify(Object.fromEntries(Object.entries(need).filter(e => e[1] > 0)))}`);
  return out;
}
const A = { 4: { 1: 8 }, 5: { 1: 8 }, 6: { 1: 12, 2: 8 }, 8: { 1: 8 } };
const B = { 7: { 1: 6, 2: 12 }, 8: { 1: 6, 2: 6 }, 9: { 1: 6, 2: 6 } };
for (const n of Object.keys(A)) bank['a' + n] = fill(+n, A[n], 'startA', 3100 + +n, 60000, 1);
for (const n of Object.keys(B)) bank['b' + n] = fill(+n, B[n], 'startB', 3200 + +n, 90000, 2);
bank.f7 = fill(7, { 4: 4, 3: 4 }, 'free', 3307, 120000, 2);
const r5 = fill(10, { 5: 12 }, 'free', 3410, +process.argv[2] || 240000, 2);
bank.f10 = bank.f10.filter(p => p[2] !== 5).concat(r5);
fs.writeFileSync(file, JSON.stringify(bank));
console.error('bank bytes', fs.statSync(file).size, Object.keys(bank).map(k => k + ':' + bank[k].length).join(' '));
// 게임이 읽는 js/bank.js도 같은 내용으로 다시 쓴다
fs.writeFileSync(__dirname + '/../js/bank.js', '/* tools/addbank.js·buildbank.js가 만든 문제은행 (bank/bank.json과 같은 내용) */\nwindow.DOKU_BANK=' + fs.readFileSync(__dirname + '/../bank/bank.json', 'utf8') + ';\n');
