// 판 난이도 판정·막힘 감지 (브라우저와 도구가 같이 씀) — 클래식·스파이더·프리셀 공통
import { newGame as klondikeNew } from './engine.js';
import { rulesOf, VARIANTS } from './rules.js';

const ids = (p) => p.map((c) => (c ? c.id + (c.up ? 'u' : 'd') : '_')).join(',');
const key = (s) => [ids(s.stock), ids(s.waste), ids(s.cells || []),
  s.foundations.map((p) => p.length).join(','), s.tableau.map(ids).join('|')].join('/');

// 힌트만 따라 두는 플레이어. 클래식은 덱 되감기를 maxRecycles번까지 허용. 이기면 { moves, recycles }, 못 이기면 null
// 예전 호출 greedyPlay(seed, drawCount, maxRecycles)도 그대로 클래식으로 동작해요
export function greedyPlay(seed, drawCount = 1, maxRecycles = 0, { variant = 'klondike', suits = 1 } = {}) {
  const R = VARIANTS[variant];
  let g = variant === 'klondike' ? klondikeNew({ seed, drawCount }) : R.newGame({ seed, suits });
  const seen = new Set();
  for (let step = 0; step < 2000; step++) {
    if (R.isWon(g)) return { moves: g.moves, recycles: g.recycles };
    if (R.canAutoComplete(g)) {
      while (!R.isWon(g)) g = R.autoCompleteStep(g);
      return { moves: g.moves, recycles: g.recycles };
    }
    const k = key(g);
    if (seen.has(k)) return null;
    seen.add(k);
    const h = R.findHint(g);
    if (!h) return null;
    g = h.draw ? R.draw(g) : R.applyMove(g, h);
    if (!g || g.recycles > maxRecycles) return null;
  }
  return null;
}

// 막힘: 클래식은 덱을 끝까지 한 바퀴 넘겨 봐도 의미 있는 수가 없으면, 다른 종류는 힌트가 없으면 true
export function isStuck(state) {
  const R = rulesOf(state);
  if (R.isStuck) return R.isStuck(state);
  if (R.isWon(state) || R.canAutoComplete(state)) return false;
  let g = state;
  const total = g.stock.length + g.waste.length;
  const maxDraws = Math.ceil(total / g.drawCount) + 2;
  for (let i = 0; i <= maxDraws; i++) {
    const h = R.findHint(g);
    if (!h) return true;
    if (!h.draw) return false;
    g = R.draw(g);
    if (!g) return true;
  }
  return true;
}

// 기준 문자열에서 시작해 '풀리는 판'을 찾아 시드를 돌려줘요 (모두에게 같은 결과). 못 찾으면 기준 그대로
export function findSolvableSeed(base, { drawCount = 1, maxRecycles = 3, tries = 400, variant = 'klondike', suits = 1 } = {}) {
  for (let k = 0; k < tries; k++) {
    const seed = k === 0 ? base : `${base}~${k}`;
    if (greedyPlay(seed, drawCount, maxRecycles, { variant, suits })) return seed;
  }
  return base;
}
