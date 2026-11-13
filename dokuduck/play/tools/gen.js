/* 문제은행 생성기: 정답 배치 → 구역 성장 → 유일해가 될 때까지 구역 수선 → 힌트 엔진으로 등급 평가.
   사용: node gen.js <size> <count> <seed> [mode]
   mode: free(선배치 없음) | start(선배치 1마리 기준 평가) */
'use strict';
const E = require('../js/engine.js');

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genSolution(n, R) {
  const sol = new Int8Array(n), used = new Uint8Array(n);
  function rec(r) {
    if (r === n) return true;
    const order = [...Array(n).keys()].sort(() => R() - 0.5);
    for (const c of order) {
      if (used[c] || (r > 0 && Math.abs(c - sol[r - 1]) < 2)) continue;
      used[c] = 1; sol[r] = c;
      if (rec(r + 1)) return true;
      used[c] = 0;
    }
    return false;
  }
  return rec(0) ? sol : null;
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function growRegions(n, sol, R) {
  const N = n * n, reg = new Int16Array(N).fill(-1);
  const ids = [...Array(n).keys()].sort(() => R() - 0.5);
  const w = [];
  for (let r = 0; r < n; r++) { reg[r * n + sol[r]] = ids[r]; }
  // 구역마다 성장 가중치를 다르게 줘서 큰 구역과 작은 구역이 섞이게 한다
  for (let g = 0; g < n; g++) w.push(Math.pow(R(), 1.7) * 3 + 0.1);
  let left = N - n;
  while (left > 0) {
    // 구역을 가중치로 고르고, 그 구역에 붙은 빈칸 하나를 채운다
    let tot = 0; for (let g = 0; g < n; g++) tot += w[g];
    let x = R() * tot, g = 0;
    for (; g < n - 1; g++) { x -= w[g]; if (x <= 0) break; }
    const fr = [];
    for (let i = 0; i < N; i++) {
      if (reg[i] !== g) continue;
      const r = (i / n) | 0, c = i % n;
      for (const [dr, dc] of D4) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        if (reg[rr * n + cc] < 0) fr.push(rr * n + cc);
      }
    }
    if (!fr.length) { w[g] *= 0.5; if (w[g] < 1e-6) w[g] = 1e-6; continue; }
    reg[fr[(R() * fr.length) | 0]] = g; left--;
  }
  return Uint8Array.from(reg);
}

function connectedWithout(n, reg, g, skip) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (reg[i] === g && i !== skip) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), st = [cells[0]];
  while (st.length) {
    const i = st.pop(), r = (i / n) | 0, c = i % n;
    for (const [dr, dc] of D4) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const j = rr * n + cc;
      if (j !== skip && reg[j] === g && !seen.has(j)) { seen.add(j); st.push(j); }
    }
  }
  return seen.size === cells.length;
}

/* 다른 해가 있으면, 그 해의 오리 칸 하나를 이웃 구역으로 넘겨 그 해를 깨뜨린다 */
function repair(n, reg, sol, R, maxIter) {
  for (let it = 0; it < maxIter; it++) {
    const out = [];
    const cnt = E.countSolutions(n, reg, 2, out);
    if (cnt === 1) return true;
    const alt = out.find(s => s.some((c, r) => c !== sol[r]));
    if (!alt) return false;
    const moves = [];
    for (let r = 0; r < n; r++) {
      if (alt[r] === sol[r]) continue;
      const i = r * n + alt[r], g = reg[i];
      if (!connectedWithout(n, reg, g, i)) continue;
      for (const [dr, dc] of D4) {
        const rr = r + dr, cc = alt[r] + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const h = reg[rr * n + cc];
        if (h !== g) moves.push([i, h]);
      }
    }
    if (!moves.length) return false;
    const m = moves[(R() * moves.length) | 0];
    reg[m[0]] = m[1];
  }
  return false;
}

function regionStats(n, reg) {
  const size = new Array(n).fill(0);
  for (let i = 0; i < n * n; i++) size[reg[i]]++;
  return { singles: size.filter(s => s === 1).length, max: Math.max(...size), min: Math.min(...size) };
}

/* 구역 번호를 왼쪽 위부터 등장 순으로 다시 매긴다 (중복 제거용 정규형) */
function canon(n, reg) {
  const map = {}; let k = 0, s = '';
  for (let i = 0; i < n * n; i++) { if (map[reg[i]] === undefined) map[reg[i]] = k++; s += '0123456789abcdefghijklmnopqrstuvwxyz'[map[reg[i]]]; }
  return s;
}

function generate(n, R, mode) {
  for (let tries = 0; tries < 200; tries++) {
    const sol = genSolution(n, R);
    if (!sol) continue;
    const reg = growRegions(n, sol, R);
    if (!repair(n, reg, sol, R, 400)) continue;
    if (!E.validSolution(n, reg, sol)) continue;
    const st = regionStats(n, reg);
    // 정규형으로 구역 번호를 다시 매기고 보드 구성
    const cs = canon(n, reg), b = E.decode(n, cs, [...sol].map(c => c.toString(36)).join(''));
    let pre = -1, rt;
    if (mode === 'startA' || mode === 'startB') {
      // 선배치 1마리 규칙 — A(1~6레벨): 여러 칸 구역의 정답 우선 / B(7~10레벨): 한 칸 구역의 정답 우선. 없으면 첫 행 정답.
      const want = mode === 'startA' ? (sz => sz > 1) : (sz => sz === 1);
      for (let r = 0; r < n && pre < 0; r++) { const cell = r * n + sol[r]; if (want(b.regCells[b.reg[cell]].length)) pre = cell; }
      if (pre < 0) pre = sol[0];
      rt = E.rate(b, [pre]);
    } else rt = E.rate(b);
    if (!rt) continue;
    return { n, reg: cs, sol: E.encode(b)[1], rank: rt.rank, steps: rt.steps, per: rt.per, singles: st.singles, max: st.max, pre };
  }
  return null;
}

if (require.main === module) {
  const n = +process.argv[2], count = +process.argv[3], seed = +process.argv[4] || 1, mode = process.argv[5] || 'free';
  const R = rng(seed), seen = new Set(), res = [];
  const t0 = Date.now();
  while (res.length < count) {
    const p = generate(n, R, mode);
    if (!p || seen.has(p.reg)) continue;
    seen.add(p.reg); res.push(p);
  }
  const hist = {};
  res.forEach(p => { hist[p.rank] = (hist[p.rank] || 0) + 1; });
  console.error(`n=${n} mode=${mode} count=${res.length} ${Date.now() - t0}ms ranks=${JSON.stringify(hist)} avgSingles=${(res.reduce((a, p) => a + p.singles, 0) / res.length).toFixed(2)}`);
  console.log(JSON.stringify(res));
}
module.exports = { generate, rng, canon };
