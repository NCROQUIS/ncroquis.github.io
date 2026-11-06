// 포켓 솔리테어 — 클론다이크 게임 로직 (화면과 분리된 순수 함수)
// 상태는 직접 고치지 않고 항상 새 상태를 돌려줘요. 되돌리기는 이전 상태를 쌓아 두는 방식이에요.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const isRed = (card) => card.s === 1 || card.s === 2;

// ---------- 난수 (시드 고정 → 오늘의 도전은 모두 같은 판) ----------
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  return function mulberry32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) deck.push({ id: s * 13 + r - 1, s, r, up: false });
  }
  return deck;
}

export function shuffle(deck, rng) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---------- 새 게임 ----------
export function newGame({ seed = Date.now(), drawCount = 1 } = {}) {
  const deck = shuffle(createDeck(), createRng(seed));
  const tableau = [[], [], [], [], [], [], []];
  let k = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const c = { ...deck[k++] };
      c.up = row === col;
      tableau[col].push(c);
    }
  }
  const stock = deck.slice(k).map((c) => ({ ...c, up: false }));
  return {
    seed: String(seed),
    drawCount: drawCount === 3 ? 3 : 1,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    variant: 'klondike',
    recycles: 0,
  };
}

export const clone = (state) => ({
  ...state,
  stock: state.stock.map((c) => ({ ...c })),
  waste: state.waste.map((c) => ({ ...c })),
  foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
  tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
});

// ---------- 규칙 ----------
export function canPlaceOnFoundation(card, pile) {
  if (!card) return false;
  if (pile.length === 0) return card.r === 1;
  const top = pile[pile.length - 1];
  return top.s === card.s && card.r === top.r + 1;
}

export function canPlaceOnTableau(card, pile) {
  if (!card) return false;
  if (pile.length === 0) return card.r === 13;
  const top = pile[pile.length - 1];
  return top.up && isRed(top) !== isRed(card) && card.r === top.r - 1;
}

function pileOf(state, loc) {
  if (loc.type === 'tableau') return state.tableau[loc.index];
  if (loc.type === 'foundation') return state.foundations[loc.index];
  if (loc.type === 'waste') return state.waste;
  if (loc.type === 'stock') return state.stock;
  return null;
}

// 옮기려는 카드 묶음 (테이블은 cardIndex부터 끝까지, 나머지는 맨 위 한 장)
export function getMovingCards(state, from) {
  const pile = pileOf(state, from);
  if (!pile || pile.length === 0) return null;
  if (from.type === 'stock') return null;
  if (from.type === 'tableau') {
    const i = from.cardIndex ?? pile.length - 1;
    if (i < 0 || i >= pile.length || !pile[i].up) return null;
    const run = pile.slice(i);
    for (let j = 1; j < run.length; j++) {
      const a = run[j - 1];
      const b = run[j];
      if (!b.up || isRed(a) === isRed(b) || b.r !== a.r - 1) return null;
    }
    return run;
  }
  return [pile[pile.length - 1]];
}

export function isLegalMove(state, move) {
  const { from, to } = move;
  if (!from || !to) return false;
  if (from.type === to.type && from.index === to.index) return false;
  const cards = getMovingCards(state, from);
  if (!cards) return false;
  const target = pileOf(state, to);
  if (!target) return false;
  if (to.type === 'foundation') return cards.length === 1 && canPlaceOnFoundation(cards[0], target);
  if (to.type === 'tableau') return canPlaceOnTableau(cards[0], target);
  return false;
}

// 성공하면 새 상태, 규칙에 어긋나면 null
export function applyMove(state, move) {
  if (!isLegalMove(state, move)) return null;
  const next = clone(state);
  const src = pileOf(next, move.from);
  const count = move.from.type === 'tableau'
    ? src.length - (move.from.cardIndex ?? src.length - 1)
    : 1;
  const cards = src.splice(src.length - count, count);
  pileOf(next, move.to).push(...cards);
  // 테이블에서 뒷면 카드가 드러나면 뒤집기
  let gain = 0;
  if (move.from.type === 'tableau' && src.length && !src[src.length - 1].up) {
    src[src.length - 1].up = true;
    gain += SCORE.flip;
  }
  // 표준 점수 (윈도우 솔리테어 방식)
  const f = move.from.type;
  const t = move.to.type;
  if (t === 'foundation') gain += SCORE.toFoundation;
  else if (f === 'waste') gain += SCORE.wasteToTableau;
  else if (f === 'foundation') gain += SCORE.foundationToTableau;
  next.score = Math.max(0, (next.score || 0) + gain);
  next.moves += 1;
  return next;
}

export const SCORE = { toFoundation: 10, wasteToTableau: 5, flip: 5, foundationToTableau: -15, recycle1: -100, recycle3: -20 };
// 끝났을 때 시간 보너스 (30초 이상 걸린 판만)
export const timeBonus = (sec) => (sec >= 30 ? Math.round(700000 / sec) : 0);

// 덱 넘기기: 덱이 비면 버림 더미를 다시 덱으로 (무제한)
export function draw(state) {
  if (state.stock.length === 0 && state.waste.length === 0) return null;
  const next = clone(state);
  if (next.stock.length === 0) {
    next.stock = next.waste.reverse().map((c) => ({ ...c, up: false }));
    next.waste = [];
    next.recycles += 1;
    next.score = Math.max(0, (next.score || 0) + (next.drawCount === 3 ? SCORE.recycle3 : SCORE.recycle1));
  } else {
    const n = Math.min(next.drawCount, next.stock.length);
    for (let i = 0; i < n; i++) {
      const c = next.stock.pop();
      c.up = true;
      next.waste.push(c);
    }
  }
  next.moves += 1;
  return next;
}

export const isWon = (state) => state.foundations.every((p) => p.length === 13);

// ---------- 이동 찾기 (탭 자동 이동, 힌트) ----------
function isUseful(state, move) {
  const { from, to } = move;
  if (to.type === 'foundation') return true;
  if (from.type === 'tableau' && to.type === 'tableau') {
    const pile = state.tableau[from.index];
    const i = from.cardIndex;
    // 맨 아래 킹 묶음을 빈 칸으로 옮기는 건 의미 없음
    if (i === 0 && state.tableau[to.index].length === 0) return false;
    // 뒷면을 드러내거나 칸을 비우는 이동만 의미 있음
    if (i === 0 || !pile[i - 1].up) return true;
    // 그 밖엔 아래 카드를 파운데이션에 올릴 수 있게 해 주면 의미 있음
    const under = pile[i - 1];
    return state.foundations.some((f) => canPlaceOnFoundation(under, f));
  }
  if (from.type === 'foundation') return false; // 힌트로 파운데이션 카드를 내리진 않음
  return true; // 버림 더미 → 테이블
}

export function legalMovesFrom(state, from) {
  const cards = getMovingCards(state, from);
  if (!cards) return [];
  const out = [];
  if (cards.length === 1) {
    for (let f = 0; f < 4; f++) {
      const m = { from, to: { type: 'foundation', index: f } };
      if (isLegalMove(state, m)) out.push(m);
    }
  }
  for (let t = 0; t < 7; t++) {
    const m = { from, to: { type: 'tableau', index: t } };
    if (isLegalMove(state, m)) out.push(m);
  }
  return out;
}

// 탭 한 번 자동 이동: 파운데이션 → 카드 있는 열 → 빈 열 순서
export function bestMoveFrom(state, from) {
  const moves = legalMovesFrom(state, from);
  if (!moves.length) return null;
  const score = (m) => {
    if (m.to.type === 'foundation') return 3;
    if (state.tableau[m.to.index].length > 0) return 2;
    // 빈 열로 옮기기: 의미 없는 킹 이동은 맨 뒤로
    return from.type === 'tableau' && from.cardIndex === 0 ? 0 : 1;
  };
  moves.sort((a, b) => score(b) - score(a));
  return moves[0];
}

export function allMoves(state) {
  const out = [];
  const froms = [];
  if (state.waste.length) froms.push({ type: 'waste', index: 0 });
  for (let t = 0; t < 7; t++) {
    const pile = state.tableau[t];
    for (let i = 0; i < pile.length; i++) {
      if (pile[i].up) froms.push({ type: 'tableau', index: t, cardIndex: i });
    }
  }
  for (let f = 0; f < 4; f++) {
    if (state.foundations[f].length) froms.push({ type: 'foundation', index: f });
  }
  for (const from of froms) out.push(...legalMovesFrom(state, from));
  return out;
}

// 힌트: 의미 있는 이동 하나 (없으면 덱 넘기기, 그것도 없으면 null)
export function findHint(state) {
  const useful = allMoves(state).filter((m) => isUseful(state, m));
  const rank = (m) => {
    if (m.from.type === 'tableau' && m.to.type === 'foundation') return 5;
    if (m.from.type === 'tableau' && m.to.type === 'tableau') return 4;
    if (m.to.type === 'foundation') return 3;
    return 2;
  };
  useful.sort((a, b) => rank(b) - rank(a));
  if (useful.length) return useful[0];
  if (state.stock.length || state.waste.length) return { draw: true };
  return null;
}

// 덱·버림 더미가 비고 모든 카드가 앞면이면 자동 완성 가능
export function canAutoComplete(state) {
  return state.stock.length === 0 && state.waste.length === 0
    && state.tableau.every((p) => p.every((c) => c.up)) && !isWon(state);
}

// 자동 완성 한 단계 (가장 낮은 카드부터 파운데이션으로)
export function autoCompleteStep(state) {
  let best = null;
  for (let t = 0; t < 7; t++) {
    const pile = state.tableau[t];
    if (!pile.length) continue;
    const card = pile[pile.length - 1];
    for (let f = 0; f < 4; f++) {
      if (canPlaceOnFoundation(card, state.foundations[f]) && (!best || card.r < best.card.r)) {
        best = { card, move: { from: { type: 'tableau', index: t, cardIndex: pile.length - 1 }, to: { type: 'foundation', index: f } } };
      }
    }
  }
  return best ? applyMove(state, best.move) : null;
}

// 오늘의 도전 시드 (한국 시간 기준 날짜 문자열을 넣어요)
export const dailySeed = (dateStr, drawCount = 1) => `daily-${dateStr}-d${drawCount}`;
