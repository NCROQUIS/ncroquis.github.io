/* tools/addhard.js가 만든 파일을 문제은행에 합친다.
   사용: node tools/mergehard.js <출력.json>...
   - 이미 있는 문제와 같은 판(돌리거나 뒤집은 것 포함)은 넣지 않는다.
   - 저장 데이터가 은행의 순번으로 판을 기억하므로, 새 문제는 늘 맨 뒤에 붙인다 (앞의 순서를 바꾸지 않는다).
   - 넣기 전에 한 번 더 확인한다: 해가 하나뿐인지, 힌트 엔진만으로 풀리는지. */
'use strict';
const fs = require('fs');
const E = require('../js/engine.js');
const file = __dirname + '/../bank/bank.json', bank = JSON.parse(fs.readFileSync(file));

// 돌리거나 뒤집어도 같은 판을 알아보는 이름: 8방향으로 놓고 구역 번호를 나온 순서대로 다시 매긴 것 중 가장 앞선 글자열
function tmap(n, t, r, c) {
  switch (t) {
    case 1: return [c, n - 1 - r]; case 2: return [n - 1 - r, n - 1 - c]; case 3: return [n - 1 - c, r];
    case 4: return [r, n - 1 - c]; case 5: return [n - 1 - r, c]; case 6: return [c, r]; case 7: return [n - 1 - c, n - 1 - r];
    default: return [r, c];
  }
}
function canon(reg) {
  const n = Math.round(Math.sqrt(reg.length)); let best = null;
  for (let t = 0; t < 8; t++) {
    const g = new Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const [r2, c2] = tmap(n, t, r, c); g[r2 * n + c2] = reg[r * n + c]; }
    const m = {}; let k = 0, s = '';
    for (const ch of g) { if (m[ch] === undefined) m[ch] = (k++).toString(36); s += m[ch]; }
    if (best === null || s < best) best = s;
  }
  return best;
}
function check(n, e) {
  const b = E.decode(n, e[0], e[1]);
  if (!E.validSolution(n, b.reg, b.sol)) return '정답이 규칙에 안 맞음';
  if (E.countSolutions(n, b.reg, 2) !== 1) return '해가 하나가 아님';
  const r = E.rate(b);
  if (!r) return '힌트만으로 안 풀림';
  if (r.rank !== e[2]) return '등급이 다름 (' + r.rank + ')';
  return '';
}

let added = 0, dup = 0, bad = 0;
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(f)), key = 'f' + d.n, pool = bank[key] || (bank[key] = []);
  const seen = new Set(pool.map(p => canon(p[0])));
  for (const e of d.list) {
    const id = canon(e[0]);
    if (seen.has(id)) { dup++; continue; }
    const why = check(d.n, e);
    if (why) { bad++; console.error(key, why, e[0].slice(0, 20)); continue; }
    seen.add(id); pool.push(e); added++;
  }
}
fs.writeFileSync(file, JSON.stringify(bank));
fs.writeFileSync(__dirname + '/../js/bank.js', '/* tools/addbank.js·buildbank.js가 만든 문제은행 (bank/bank.json과 같은 내용) */\nwindow.DOKU_BANK=' + fs.readFileSync(file, 'utf8') + ';\n');
const count = {};
for (const k of Object.keys(bank)) { count[k] = {}; bank[k].forEach(p => { count[k]['R' + p[2]] = (count[k]['R' + p[2]] || 0) + 1; }); }
console.error(`더함 ${added}, 겹쳐서 뺌 ${dup}, 확인에서 뺌 ${bad}`);
console.error(Object.keys(count).map(k => k + ' ' + JSON.stringify(count[k])).join('\n'));
