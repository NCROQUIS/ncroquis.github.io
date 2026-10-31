// 판 난이도 판정·막힘 감지 (브라우저와 도구가 같이 씀)
import { newGame, draw, applyMove, findHint, isWon, canAutoComplete, autoCompleteStep } from './engine.js';

const key = (s) => [
  s.stock.map((c) => c.id).join(','), s.waste.map((c) => c.id).join(','),
  s.foundations.map((p) => p.length).join(','),
  s.tableau.map((p) => p.map((c) => c.id + (c.up ? 'u' : 'd')).join(',')).join('|'),
].join('/');

// 힌트만 따라 두는 플레이어. 덱 되감기를 maxRecycles번까지 허용. 이기면 { moves, recycles }, 못 이기면 null
export function greedyPlay(seed, drawCount = 1, maxRecycles = 0) {
  let g = newGame({ seed, drawCount });
  const seen = new Set();
  for (let step = 0; step < 900; step++) {
    if (isWon(g)) return { moves: g.moves, recycles: g.recycles };
    if (canAutoComplete(g)) {
      while (!isWon(g)) g = autoCompleteStep(g);
      return { moves: g.moves, recycles: g.recycles };
    }
    const k = key(g);
    if (seen.has(k)) return null;
    seen.add(k);
    const h = findHint(g);
    if (!h) return null;
    g = h.draw ? draw(g) : applyMove(g, h);
    if (g.recycles > maxRecycles) return null;
  }
  return null;
}

// 막힘: 덱을 끝까지 한 바퀴 넘겨 봐도 의미 있는 수가 하나도 없으면 true
export function isStuck(state) {
  if (isWon(state) || canAutoComplete(state)) return false;
  let g = state;
  const total = g.stock.length + g.waste.length;
  const maxDraws = Math.ceil(total / g.drawCount) + 2;
  for (let i = 0; i <= maxDraws; i++) {
    const h = findHint(g);
    if (!h) return true;
    if (!h.draw) return false;
    g = draw(g);
    if (!g) return true;
  }
  return true;
}

// 기준 문자열에서 시작해 '풀리는 판'을 찾아 시드를 돌려줘요 (모두에게 같은 결과)
export function findSolvableSeed(base, { drawCount = 1, maxRecycles = 3, tries = 400 } = {}) {
  for (let k = 0; k < tries; k++) {
    const seed = k === 0 ? base : `${base}~${k}`;
    if (greedyPlay(seed, drawCount, maxRecycles)) return seed;
  }
  return base;
}
