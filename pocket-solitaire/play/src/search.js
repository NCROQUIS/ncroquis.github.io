// 풀이 탐색 — 프리셀·스파이더를 끝까지 풀어 보는 '가장 좋아 보이는 수부터' 탐색이에요.
// 힌트(프리셀: 이 판을 끝까지 푸는 길의 첫 수)와 '이길 수 있는 판' 고르기(스파이더 2·4무늬 판 목록 만들기)에 써요.
import { isRed, canPlaceOnFoundation } from './engine.js';
import * as FC from './freecell.js';
import * as SP from './spider.js';

// ---------- 작은 우선순위 큐 (점수가 큰 것부터) ----------
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f >= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f > a[m].f) m = l;
        if (r < a.length && a[r].f > a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- 프리셀 ----------
const cid = (c) => c.s * 13 + c.r;
// 칸과 빈 줄은 서로 바꿔도 같은 판이라 정렬해서 같은 상태로 봐요
function fcKey(st) {
  const cols = st.tableau.map((p) => p.map(cid).join('.')).sort().join('|');
  const cells = st.cells.map((c) => (c ? cid(c) : 0)).sort((a, b) => a - b).join('.');
  return `${st.foundations.map((p) => p.length).join('')}/${cells}/${cols}`;
}

// 더 둘 필요 없이 올려도 되는 카드(양쪽 색 낮은 카드가 이미 올라감)는 바로 파운데이션으로
function fcSafeUp(st) {
  let g = st;
  const moves = [];
  for (let changed = true; changed;) {
    changed = false;
    const low = { red: 99, black: 99 };
    // 무늬별 파운데이션 높이 (파운데이션 칸은 무늬가 정해져 있지 않아 실제 카드로 봐요)
    const h = [0, 0, 0, 0];
    g.foundations.forEach((p) => { if (p.length) h[p[0].s] = p.length; });
    low.red = Math.min(h[1], h[2]);
    low.black = Math.min(h[0], h[3]);
    const safe = (c) => c.r <= 2 || c.r <= (isRed(c) ? low.black : low.red) + 1;
    const tryFrom = (card, from) => {
      if (!safe(card)) return false;
      for (let f = 0; f < 4; f++) {
        if (canPlaceOnFoundation(card, g.foundations[f])) {
          const m = { from, to: { type: 'foundation', index: f } };
          const n = FC.applyMove(g, m);
          if (n) { moves.push(m); g = n; return true; }
        }
      }
      return false;
    };
    for (let i = 0; i < 4 && !changed; i++) if (g.cells[i]) changed = tryFrom(g.cells[i], { type: 'cell', index: i });
    for (let t = 0; t < 8 && !changed; t++) {
      const p = g.tableau[t];
      if (p.length) changed = tryFrom(p[p.length - 1], { type: 'tableau', index: t, cardIndex: p.length - 1 });
    }
  }
  return { g, moves };
}

function fcMoves(st) {
  const out = [];
  const cellFree = st.cells.findIndex((c) => !c);
  const emptyCol = st.tableau.findIndex((p) => !p.length);
  const pushIf = (m) => { if (FC.isLegalMove(st, m)) out.push(m); };
  // 칸 → 파운데이션·줄
  st.cells.forEach((c, i) => {
    if (!c) return;
    const from = { type: 'cell', index: i };
    for (let f = 0; f < 4; f++) pushIf({ from, to: { type: 'foundation', index: f } });
    for (let t = 0; t < 8; t++) if (st.tableau[t].length) pushIf({ from, to: { type: 'tableau', index: t } });
    if (emptyCol >= 0) pushIf({ from, to: { type: 'tableau', index: emptyCol } });
  });
  st.tableau.forEach((p, t) => {
    if (!p.length) return;
    const top = { type: 'tableau', index: t, cardIndex: p.length - 1 };
    for (let f = 0; f < 4; f++) pushIf({ from: top, to: { type: 'foundation', index: f } });
    // 줄 → 줄 (이어진 묶음의 어느 지점에서든)
    let start = p.length - 1;
    while (start > 0 && isRed(p[start - 1]) !== isRed(p[start]) && p[start - 1].r === p[start].r + 1) start--;
    for (let i = start; i < p.length; i++) {
      const from = { type: 'tableau', index: t, cardIndex: i };
      for (let d = 0; d < 8; d++) if (d !== t && st.tableau[d].length) pushIf({ from, to: { type: 'tableau', index: d } });
      // 빈 줄로: 줄 전체를 옮기는 건 의미 없어요
      if (emptyCol >= 0 && i > 0) pushIf({ from, to: { type: 'tableau', index: emptyCol } });
    }
    if (cellFree >= 0) out.push({ from: top, to: { type: 'cell', index: cellFree } });
  });
  return out;
}

function fcScore(st) {
  let s = 0;
  st.foundations.forEach((p) => { s += p.length * 12; });
  s += st.cells.filter((c) => !c).length * 3;
  st.tableau.forEach((p) => {
    if (!p.length) { s += 6; return; }
    // 맨 위 이어진 묶음은 좋고, 큰 카드 위에 깔린 작은 카드는 나빠요
    let mn = 99;
    p.forEach((c, i) => {
      if (c.r < mn) mn = c.r;
      else if (i > 0) s -= 2; // 더 작은 카드가 밑에 깔려 있음
    });
    s -= (p.length - tailRun(p)) * 0.5;
  });
  return s;
}
const tailRun = (p) => {
  let n = 1;
  for (let i = p.length - 1; i > 0; i--) {
    if (isRed(p[i - 1]) !== isRed(p[i]) && p[i - 1].r === p[i].r + 1) n++;
    else break;
  }
  return n;
};

// ---------- 스파이더 ----------
function spKey(st) {
  return `${st.stock.length}/${st.foundations.length}/${st.tableau.map((p) => p.map((c) => (c.up ? c.s * 13 + c.r : '#')).join('.')).join('|')}`;
}

function spMoves(st) {
  const out = [];
  const empty = st.tableau.findIndex((p) => !p.length);
  st.tableau.forEach((p, t) => {
    if (!p.length) return;
    // 같은 무늬로 이어진 맨 위 묶음
    let start = p.length - 1;
    while (start > 0 && p[start - 1].up && p[start - 1].s === p[start].s && p[start - 1].r === p[start].r + 1) start--;
    for (let i = start; i < p.length; i++) {
      const card = p[i];
      const under = p[i - 1];
      const linkedUnder = under && under.up && under.r === card.r + 1; // 무늬가 달라도 이미 이어져 있음
      const from = { type: 'tableau', index: t, cardIndex: i };
      for (let d = 0; d < 10; d++) {
        if (d === t || !st.tableau[d].length) continue;
        const top = st.tableau[d][st.tableau[d].length - 1];
        if (top.r !== card.r + 1) continue;
        // 이미 이어진 자리에서 다른 무늬로 옮기는 건 제자리걸음 — 같은 무늬 위로 갈 때만
        if (linkedUnder && !(top.s === card.s && under.s !== card.s)) continue;
        out.push({ from, to: { type: 'tableau', index: d } });
      }
      if (empty >= 0 && i > 0 && !(linkedUnder && under.s === card.s)) out.push({ from, to: { type: 'tableau', index: empty } });
    }
  });
  if (st.stock.length) out.push({ draw: true });
  return out;
}

const SPW = { found: 200, empty: 25, down: 10, same: 8, other: 1, stock: 0.4, run: 1 };
export const spWeights = SPW; // 판 목록 만들기 도구가 무늬 수에 맞춰 바꿔 써요
function spScore(st) {
  const w = SPW;
  let s = st.foundations.length * w.found - st.stock.length * w.stock;
  st.tableau.forEach((p) => {
    if (!p.length) { s += w.empty; return; }
    let run = 1;
    p.forEach((c, i) => {
      if (!c.up) { s -= w.down; return; }
      const u = p[i - 1];
      if (u && u.up && u.r === c.r + 1) {
        if (u.s === c.s) { s += w.same; run += 1; } else { s += w.other; run = 1; }
      } else run = 1;
      if (i === p.length - 1) s += run * run * w.run; // 맨 위 같은 무늬 묶음이 길수록 좋아요
    });
  });
  return s;
}

// ---------- 공통 탐색 ----------
const KINDS = {
  freecell: { R: FC, key: fcKey, moves: fcMoves, score: fcScore, pre: fcSafeUp },
  spider: { R: SP, key: spKey, moves: spMoves, score: spScore, pre: (g) => ({ g, moves: [] }) },
};

// 이 판을 끝까지 푸는 수 목록을 찾아요. 못 찾으면 null.
// 조금씩 나눠 돌 수 있게 '발전기'로 만들었어요: 200개 살펴볼 때마다 한 번 쉬어요 (화면이 멈추지 않게)
function* solveGen(state, maxNodes) {
  const K = KINDS[state.variant];
  if (!K) return null;
  const { R } = K;
  const start = K.pre(state);
  const root = { g: start.g, path: null, steps: start.moves, depth: 0 };
  if (R.isWon(root.g)) return start.moves;
  const seen = new Set([K.key(root.g)]);
  const heap = new Heap();
  root.f = K.score(root.g);
  heap.push(root);
  let nodes = 0;
  while (heap.size && nodes < maxNodes) {
    const n = heap.pop();
    nodes += 1;
    if (nodes % 200 === 0) yield null;
    for (const m of K.moves(n.g)) {
      const g1 = m.draw ? R.draw(n.g) : R.applyMove(n.g, m);
      if (!g1) continue;
      const after = K.pre(g1);
      const k = K.key(after.g);
      if (seen.has(k)) continue;
      seen.add(k);
      const child = { g: after.g, parent: n, steps: [m, ...after.moves], depth: n.depth + 1 };
      if (R.isWon(after.g)) return unwind(child);
      child.f = K.score(after.g) - child.depth * 0.05;
      heap.push(child);
    }
  }
  return null;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// 한 번에 끝까지 (maxMs를 넘기면 그만해요 — 느린 휴대폰에서 오래 멈추지 않게)
export function solve(state, { maxNodes = 20000, maxMs = Infinity } = {}) {
  const it = solveGen(state, maxNodes);
  const end = now() + maxMs;
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (now() > end) return null;
  }
}

function unwind(n) {
  const out = [];
  for (let x = n; x; x = x.parent) out.unshift(...x.steps);
  return out;
}

// 힌트: 끝까지 푸는 길이 있으면 그 첫 수, 없으면 null (그때는 각 규칙의 간단한 힌트를 써요)
export function solverHint(state, opts) {
  const path = solve(state, opts);
  return path && path.length ? path[0] : null;
}

// 힌트를 누를 때마다 다시 풀지 않도록, 찾은 풀이 길의 각 상태를 기억해 둬요
const sig = (st) => `${st.stock.length}/${(st.cells || []).map((c) => (c ? c.id : '_')).join('.')}/${st.foundations.map((p) => p.length).join('.')}/${st.tableau.map((p) => p.map((c) => c.id + (c.up ? 'u' : 'd')).join('.')).join('|')}`;
let cache = new Map();
function remember(state, path) {
  cache = new Map();
  let g = state;
  const R = KINDS[state.variant].R;
  for (const m of path) {
    cache.set(sig(g), m);
    g = m.draw ? R.draw(g) : R.applyMove(g, m);
    if (!g) break;
  }
}

// 힌트: 미리 찾아 둔 풀이가 있으면 바로, 없으면 maxMs 안에서만 찾아요
export function hintFor(state, { maxNodes = 6000, maxMs = 250 } = {}) {
  if (!KINDS[state.variant]) return null;
  const k = sig(state);
  if (cache.has(k)) return cache.get(k);
  stopPrefetch();
  const path = solve(state, { maxNodes, maxMs });
  if (!path || !path.length) return null;
  remember(state, path);
  return path[0];
}

// 미리 찾아 두기: 사람이 생각하는 동안(화면이 한가할 때) 조금씩 풀어 둬요. 판이 바뀌면 멈춰요
let job = null;
export function stopPrefetch() { if (job) { job.stop = true; job = null; } }
export function prefetchHint(state, { maxNodes = 8000, sliceMs = 6 } = {}) {
  if (!KINDS[state.variant] || cache.has(sig(state))) return;
  stopPrefetch();
  const it = solveGen(state, maxNodes);
  const me = (job = { stop: false });
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 16);
  const step = () => {
    if (me.stop) return;
    const end = now() + sliceMs;
    while (now() < end) {
      const r = it.next();
      if (r.done) {
        if (r.value && r.value.length) remember(state, r.value);
        if (job === me) job = null;
        return;
      }
    }
    idle(step);
  };
  setTimeout(() => idle(step), 60);
}
export const hintReady = (state) => !!KINDS[state.variant] && cache.has(sig(state));
