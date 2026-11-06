// 프리셀 규칙 — 52장을 8줄에 모두 앞면으로 나눠요. 빈 칸 4개(cells)에 카드를 잠시 둘 수 있어요.
// 상태 모양은 클론다이크와 같게 맞췄어요(stock·waste는 늘 비어 있음): { variant, cells[4], foundations[4], tableau[8], ... }
import { createDeck, shuffle, createRng, isRed, canPlaceOnFoundation } from './engine.js';

export const COLS = 8;

export function newGame({ seed = Date.now() } = {}) {
  const deck = shuffle(createDeck(), createRng(seed)).map((c) => ({ ...c, up: true }));
  const tableau = Array.from({ length: COLS }, () => []);
  deck.forEach((c, i) => tableau[i % COLS].push(c));
  return {
    variant: 'freecell', seed: String(seed), drawCount: 1,
    stock: [], waste: [], cells: [null, null, null, null],
    foundations: [[], [], [], []], tableau, moves: 0, recycles: 0, score: 0,
  };
}

export const clone = (st) => ({
  ...st,
  stock: [], waste: [],
  cells: st.cells.map((c) => (c ? { ...c } : null)),
  foundations: st.foundations.map((p) => p.map((c) => ({ ...c }))),
  tableau: st.tableau.map((p) => p.map((c) => ({ ...c }))),
});

const freeCells = (st) => st.cells.filter((c) => !c).length;
const emptyCols = (st, except = -1) => st.tableau.filter((p, i) => i !== except && p.length === 0).length;
// 한 번에 옮길 수 있는 장수: (빈 칸 + 1) × 2^(빈 줄)
export const maxRun = (st, toEmptyCol = false, toIndex = -1) => (freeCells(st) + 1) * 2 ** Math.max(0, emptyCols(st, toEmptyCol ? toIndex : -1));

export function getMovingCards(st, from) {
  if (from.type === 'cell') return st.cells[from.index] ? [st.cells[from.index]] : null;
  if (from.type === 'foundation') {
    const p = st.foundations[from.index];
    return p.length ? [p[p.length - 1]] : null;
  }
  if (from.type !== 'tableau') return null;
  const pile = st.tableau[from.index];
  if (!pile.length) return null;
  const i = from.cardIndex ?? pile.length - 1;
  if (i < 0 || i >= pile.length) return null;
  const run = pile.slice(i);
  for (let j = 1; j < run.length; j++) {
    if (isRed(run[j - 1]) === isRed(run[j]) || run[j].r !== run[j - 1].r - 1) return null;
  }
  return run;
}

export function isLegalMove(st, { from, to }) {
  if (!from || !to) return false;
  if (from.type === to.type && from.index === to.index) return false;
  const cards = getMovingCards(st, from);
  if (!cards) return false;
  if (to.type === 'cell') return cards.length === 1 && !st.cells[to.index];
  if (to.type === 'foundation') return cards.length === 1 && canPlaceOnFoundation(cards[0], st.foundations[to.index]);
  if (to.type === 'tableau') {
    const pile = st.tableau[to.index];
    if (cards.length > maxRun(st, pile.length === 0, to.index)) return false;
    if (!pile.length) return true;
    const top = pile[pile.length - 1];
    return isRed(top) !== isRed(cards[0]) && cards[0].r === top.r - 1;
  }
  return false;
}

export function applyMove(st, move) {
  if (!isLegalMove(st, move)) return null;
  const next = clone(st);
  let cards;
  if (move.from.type === 'cell') { cards = [next.cells[move.from.index]]; next.cells[move.from.index] = null; } else {
    const src = move.from.type === 'tableau' ? next.tableau[move.from.index] : next.foundations[move.from.index];
    const n = move.from.type === 'tableau' ? src.length - (move.from.cardIndex ?? src.length - 1) : 1;
    cards = src.splice(src.length - n, n);
  }
  if (move.to.type === 'cell') next.cells[move.to.index] = cards[0];
  else (move.to.type === 'tableau' ? next.tableau : next.foundations)[move.to.index].push(...cards);
  if (move.to.type === 'foundation') next.score += 10;
  if (move.from.type === 'foundation') next.score = Math.max(0, next.score - 15);
  next.moves += 1;
  return next;
}

export const draw = () => null; // 프리셀은 덱이 없어요
export const isWon = (st) => st.foundations.every((p) => p.length === 13);

export function legalMovesFrom(st, from) {
  const cards = getMovingCards(st, from);
  if (!cards) return [];
  const out = [];
  const add = (to) => { const m = { from, to }; if (isLegalMove(st, m)) out.push(m); };
  if (cards.length === 1) for (let f = 0; f < 4; f++) add({ type: 'foundation', index: f });
  for (let t = 0; t < COLS; t++) add({ type: 'tableau', index: t });
  if (cards.length === 1 && from.type !== 'cell') for (let c = 0; c < 4; c++) { if (!st.cells[c]) { add({ type: 'cell', index: c }); break; } }
  return out;
}

// 탭 자동 이동: 파운데이션 → 카드 있는 줄 → 빈 줄 → 빈 칸
export function bestMoveFrom(st, from) {
  // 묶음을 탭하면, 옮길 수 없을 때 맨 위 한 장이라도 옮겨 봐요
  let moves = legalMovesFrom(st, from);
  const score = (m) => (m.to.type === 'foundation' ? 4 : m.to.type === 'tableau' && st.tableau[m.to.index].length ? 3 : m.to.type === 'tableau' ? 1 : 2);
  moves = moves.filter((m) => !(m.to.type === 'tableau' && !st.tableau[m.to.index].length && from.type === 'tableau' && from.cardIndex === 0));
  moves.sort((a, b) => score(b) - score(a));
  return moves[0] || null;
}

export function allMoves(st) {
  const out = [];
  st.cells.forEach((c, i) => { if (c) out.push(...legalMovesFrom(st, { type: 'cell', index: i })); });
  st.tableau.forEach((p, t) => {
    for (let i = 0; i < p.length; i++) out.push(...legalMovesFrom(st, { type: 'tableau', index: t, cardIndex: i }));
  });
  return out;
}

// 힌트: 파운데이션 → 칸에서 꺼내기 → 줄끼리(아래 카드를 드러내거나 칸을 비움) → 빈 칸으로
export function findHint(st) {
  const moves = allMoves(st);
  const rank = (m) => {
    if (m.to.type === 'foundation') return 6;
    if (m.from.type === 'cell' && m.to.type === 'tableau' && st.tableau[m.to.index].length) return 5;
    if (m.from.type === 'tableau' && m.to.type === 'tableau' && st.tableau[m.to.index].length) {
      const under = st.tableau[m.from.index][m.from.cardIndex - 1];
      if (!under) return 4.5;
      // 아래 카드가 같은 묶음의 일부라면 의미 없는 이동
      const top = st.tableau[m.from.index][m.from.cardIndex];
      if (isRed(under) !== isRed(top) && under.r === top.r + 1) return 0;
      return 4;
    }
    if (m.to.type === 'tableau' && !st.tableau[m.to.index].length) return m.from.type === 'tableau' && m.from.cardIndex === 0 ? 0 : 2;
    if (m.to.type === 'cell') return 1;
    return 0;
  };
  const useful = moves.filter((m) => rank(m) > 0).sort((a, b) => rank(b) - rank(a));
  return useful[0] || null;
}

// 줄마다 위로 갈수록 작아지면(내림차순) 가장 낮은 카드부터 차례로 올릴 수 있어요
export function canAutoComplete(st) {
  if (isWon(st)) return false;
  return st.tableau.every((p) => p.every((c, i) => i === 0 || c.r < p[i - 1].r));
}

export function autoCompleteStep(st) {
  let best = null;
  const consider = (card, from) => {
    for (let f = 0; f < 4; f++) {
      if (canPlaceOnFoundation(card, st.foundations[f]) && (!best || card.r < best.card.r)) best = { card, move: { from, to: { type: 'foundation', index: f } } };
    }
  };
  st.cells.forEach((c, i) => c && consider(c, { type: 'cell', index: i }));
  st.tableau.forEach((p, t) => p.length && consider(p[p.length - 1], { type: 'tableau', index: t, cardIndex: p.length - 1 }));
  return best ? applyMove(st, best.move) : null;
}

export const isStuck = (st) => !isWon(st) && !canAutoComplete(st) && !findHint(st);
