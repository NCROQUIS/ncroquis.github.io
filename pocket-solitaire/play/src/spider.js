// 스파이더 규칙 — 카드 104장(1·2·4무늬), 10줄. 무늬 상관없이 1 작은 카드를 얹고, 같은 무늬 묶음만 함께 옮겨요.
// K부터 A까지 같은 무늬로 이어지면 자동으로 걷혀요(foundations에 8묶음). 덱을 누르면 10줄에 한 장씩 나눠요.
import { createRng, shuffle } from './engine.js';

export const COLS = 10;
const SUIT_SETS = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };

export function newGame({ seed = Date.now(), suits = 1 } = {}) {
  const set = SUIT_SETS[suits] || SUIT_SETS[1];
  const deck = [];
  for (let k = 0; k < 104; k++) {
    const s = set[Math.floor(k / 13) % set.length];
    deck.push({ id: k, s, r: (k % 13) + 1, up: false });
  }
  const d = shuffle(deck, createRng(seed));
  const tableau = Array.from({ length: COLS }, () => []);
  let k = 0;
  for (let col = 0; col < COLS; col++) {
    const n = col < 4 ? 6 : 5;
    for (let i = 0; i < n; i++) tableau[col].push({ ...d[k++], up: i === n - 1 });
  }
  return {
    variant: 'spider', seed: String(seed), suits: set.length, drawCount: 10,
    stock: d.slice(k).map((c) => ({ ...c, up: false })), waste: [],
    foundations: [], tableau, moves: 0, recycles: 0, score: 500,
  };
}

export const clone = (st) => ({
  ...st,
  stock: st.stock.map((c) => ({ ...c })), waste: [],
  foundations: st.foundations.map((p) => p.map((c) => ({ ...c }))),
  tableau: st.tableau.map((p) => p.map((c) => ({ ...c }))),
});

export function getMovingCards(st, from) {
  if (from.type !== 'tableau') return null;
  const pile = st.tableau[from.index];
  if (!pile.length) return null;
  const i = from.cardIndex ?? pile.length - 1;
  if (i < 0 || i >= pile.length || !pile[i].up) return null;
  const run = pile.slice(i);
  for (let j = 1; j < run.length; j++) {
    if (run[j].s !== run[0].s || run[j].r !== run[j - 1].r - 1) return null;
  }
  return run;
}

export function isLegalMove(st, { from, to }) {
  if (!from || !to || to.type !== 'tableau' || from.type !== 'tableau' || from.index === to.index) return false;
  const cards = getMovingCards(st, from);
  if (!cards) return false;
  const pile = st.tableau[to.index];
  return !pile.length || pile[pile.length - 1].r === cards[0].r + 1;
}

// K~A 같은 무늬 묶음이 맨 위에 생기면 걷어 내요
function collect(next, t) {
  const p = next.tableau[t];
  if (p.length < 13) return false;
  const run = p.slice(-13);
  const ok = run.every((c, i) => c.up && c.s === run[0].s && c.r === 13 - i);
  if (!ok) return false;
  p.splice(p.length - 13, 13);
  next.foundations.push(run);
  next.score += 100;
  if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
  return true;
}

export function applyMove(st, move) {
  if (!isLegalMove(st, move)) return null;
  const next = clone(st);
  const src = next.tableau[move.from.index];
  const cards = src.splice(move.from.cardIndex ?? src.length - 1);
  next.tableau[move.to.index].push(...cards);
  if (src.length && !src[src.length - 1].up) src[src.length - 1].up = true;
  collect(next, move.to.index);
  next.score = Math.max(0, next.score - 1);
  next.moves += 1;
  return next;
}

// 덱 나누기: 10줄에 한 장씩 (빈 줄이 있어도 나눠 줘요 — 중장년층이 막히지 않게 완화한 규칙)
export function draw(st) {
  if (!st.stock.length) return null;
  const next = clone(st);
  for (let t = 0; t < COLS && next.stock.length; t++) {
    const c = next.stock.pop();
    c.up = true;
    next.tableau[t].push(c);
  }
  for (let t = 0; t < COLS; t++) collect(next, t);
  next.score = Math.max(0, next.score - 1);
  next.moves += 1;
  return next;
}

export const isWon = (st) => st.foundations.length === 8;

export function legalMovesFrom(st, from) {
  const out = [];
  for (let t = 0; t < COLS; t++) {
    const m = { from, to: { type: 'tableau', index: t } };
    if (isLegalMove(st, m)) out.push(m);
  }
  return out;
}

// 같은 무늬 위로 → 다른 무늬 위로 → 빈 줄 순서
function moveRank(st, m) {
  const pile = st.tableau[m.from.index];
  const i = m.from.cardIndex;
  const card = pile[i];
  const dest = st.tableau[m.to.index];
  const top = dest[dest.length - 1];
  const under = pile[i - 1];
  const reveals = i > 0 && !under.up;
  const emptiesCol = i === 0;
  // 이미 이어진 자리에서 빼는 건 의미 없음
  const alreadyLinked = under && under.up && under.r === card.r + 1;
  if (!top) {
    if (emptiesCol) return 0;
    return reveals ? 3 : alreadyLinked ? 0 : 1;
  }
  const sameSuit = top.s === card.s;
  if (alreadyLinked && !(sameSuit && under.s !== card.s)) return 0;
  return (sameSuit ? 6 : 4) + (reveals ? 2 : 0) + (emptiesCol ? 1 : 0);
}

export function bestMoveFrom(st, from) {
  const moves = legalMovesFrom(st, from);
  if (!moves.length) return null;
  const r = (m) => {
    const dest = st.tableau[m.to.index];
    const top = dest[dest.length - 1];
    const card = st.tableau[from.index][from.cardIndex ?? st.tableau[from.index].length - 1];
    return !top ? 0 : top.s === card.s ? 2 : 1;
  };
  moves.sort((a, b) => r(b) - r(a));
  return moves[0];
}

export function allMoves(st) {
  const out = [];
  st.tableau.forEach((p, t) => {
    for (let i = 0; i < p.length; i++) if (p[i].up) out.push(...legalMovesFrom(st, { type: 'tableau', index: t, cardIndex: i }));
  });
  return out;
}

export function findHint(st) {
  const useful = allMoves(st).map((m) => ({ m, r: moveRank(st, m) })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r);
  if (useful.length) return useful[0].m;
  if (st.stock.length) return { draw: true };
  return null;
}

export const canAutoComplete = () => false;
export const autoCompleteStep = () => null;
export const isStuck = (st) => !isWon(st) && !findHint(st);
