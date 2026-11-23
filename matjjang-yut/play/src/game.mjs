export const SCHEMA = 1;
export const OUTCOMES = Object.freeze({
  do: { steps: 1, extra: false }, gae: { steps: 2, extra: false },
  geol: { steps: 3, extra: false }, yut: { steps: 4, extra: true },
  mo: { steps: 5, extra: true }, backdo: { steps: -1, extra: false },
});
export const ROUTES = Object.freeze({
  outer: ['base', ...Array.from({ length: 19 }, (_, i) => `o${i + 1}`), 'finish'],
  ne: ['o5', 'ne1', 'ne2', 'center', 'sw2', 'sw1', 'o15', 'o16', 'o17', 'o18', 'o19', 'finish'],
  nw: ['o10', 'nw1', 'nw2', 'center', 'se2', 'se1', 'finish'],
  center: ['center', 'se2', 'se1', 'finish'],
});
export const POINTS = (() => {
  const a = 3.08, points = { base: [a, a], finish: [a, a], center: [0, 0] };
  for (let i = 1; i <= 19; i++) {
    if (i <= 5) points[`o${i}`] = [a, a - i * 2 * a / 5];
    else if (i <= 10) points[`o${i}`] = [a - (i - 5) * 2 * a / 5, -a];
    else if (i <= 15) points[`o${i}`] = [-a, -a + (i - 10) * 2 * a / 5];
    else points[`o${i}`] = [-a + (i - 15) * 2 * a / 5, a];
  }
  for (const [arm, x, y] of [['ne', a, -a], ['nw', -a, -a], ['sw', -a, a], ['se', a, a]]) {
    points[`${arm}1`] = [x * 2 / 3, y * 2 / 3];
    points[`${arm}2`] = [x / 3, y / 3];
  }
  return Object.freeze(points);
})();
const copy = value => structuredClone(value);
export const position = piece => piece.history.at(-1).node;
export function createGame() {
  return {
    schema: SCHEMA, id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
    active: 0, winner: null, throws: 1, pending: [], nextResult: 1, turn: 1, action: 0,
    pieces: Array.from({ length: 8 }, (_, id) => ({ id, player: id < 4 ? 0 : 1, history: [{ node: 'base', route: 'outer' }] })),
    lastThrow: null, lastMove: null, lastPass: false,
    opening: { round: 1, rolls: [null, null], winner: null },
  };
}
export function classify(bits) {
  if (!Array.isArray(bits) || bits.length !== 4 || bits.some(bit => bit !== 0 && bit !== 1)) throw new TypeError('Four binary stick faces required');
  const flat = bits.reduce((sum, bit) => sum + bit, 0);
  return flat === 0 ? 'mo' : flat === 4 ? 'yut' : flat === 3 ? 'geol' : flat === 2 ? 'gae' : bits[0] ? 'backdo' : 'do';
}
export function randomThrow(random = globalThis.crypto) {
  const bytes = new Uint8Array(4);
  random.getRandomValues(bytes);
  return Array.from(bytes, value => value & 1);
}
// Back-do is a one-face Do when choosing the first player; no piece moves yet.
const openingRank = roll => Math.max(1, OUTCOMES[roll.outcome].steps);
function openingWinner(rolls) {
  if (rolls.some(roll => roll === null)) return null;
  const difference = openingRank(rolls[0]) - openingRank(rolls[1]);
  return difference === 0 ? null : difference > 0 ? 0 : 1;
}
export function throwForFirst(game, bits) {
  if (!game.opening || game.opening.winner !== null) throw new Error('Cannot roll for first player now');
  const outcome = classify(bits), state = copy(game), opening = state.opening;
  if (opening.rolls.every(roll => roll !== null)) {
    opening.round += 1; opening.rolls = [null, null];
  }
  const player = opening.rolls[0] === null ? 0 : 1;
  opening.rolls[player] = { outcome, bits: bits.slice() };
  opening.winner = openingWinner(opening.rolls);
  state.active = player === 0 ? 1 : opening.winner ?? 0;
  return state;
}
export function beginGame(game) {
  if (!game.opening || game.opening.winner === null) throw new Error('First player is not decided');
  const state = copy(game);
  state.active = state.opening.winner;
  state.opening = null;
  return state;
}
export function throwSticks(game, bits) {
  if (game.opening || game.winner !== null || game.throws < 1) throw new Error('Cannot throw now');
  const outcome = classify(bits), state = copy(game);
  state.throws -= 1;
  if (OUTCOMES[outcome].extra) state.throws += 1;
  const result = { id: state.nextResult++, outcome, steps: OUTCOMES[outcome].steps };
  state.pending.push(result);
  state.lastThrow = { ...result, player: state.active, bits: bits.slice() };
  state.lastMove = null;
  state.lastPass = false;
  state.action += 1;
  return state;
}
export function advance(piece, steps) {
  const start = position(piece);
  if (start === 'finish' || start === 'base' && steps < 0) return null;
  const history = copy(piece.history), path = [];
  if (steps < 0) {
    history.pop();
    path.push(history.at(-1).node);
    return { history, path, target: history.at(-1).node };
  }
  let route = history.at(-1).route;
  if (start === 'o5') route = 'ne';
  if (start === 'o10') route = 'nw';
  if (start === 'center') route = 'center';
  const track = ROUTES[route];
  const index = track.indexOf(start);
  if (index < 0) throw new Error('Invalid route');
  for (let n = 1; n <= steps; n++) {
    const node = track[Math.min(index + n, track.length - 1)];
    history.push({ node, route });
    path.push(node);
    if (node === 'finish') break;
  }
  return { history, path, target: history.at(-1).node };
}
export function planMove(game, pieceId, resultId) {
  if (game.opening || game.winner !== null) return null;
  const piece = game.pieces.find(p => p.id === pieceId);
  const result = game.pending.find(r => r.id === resultId);
  if (!piece || piece.player !== game.active || !result) return null;
  const plan = advance(piece, result.steps);
  if (!plan) return null;
  const start = position(piece);
  const stackIds = start === 'base' ? [piece.id] : game.pieces.filter(p => p.player === piece.player && position(p) === start).map(p => p.id);
  const captured = plan.target === 'base' || plan.target === 'finish' ? [] : game.pieces.filter(p => p.player !== piece.player && position(p) === plan.target).map(p => p.id);
  return { ...plan, from: start, player: piece.player, pieceId, resultId, stackIds, captured };
}
export function legalMoves(game, resultId) {
  const results = resultId === undefined ? game.pending : game.pending.filter(r => r.id === resultId);
  return results.flatMap(result => game.pieces.map(piece => planMove(game, piece.id, result.id)).filter(Boolean));
}
export function settleTurn(game) {
  if (game.opening || game.winner !== null || game.throws > 0 || legalMoves(game).length > 0) return game;
  const state = copy(game);
  state.lastPass = state.pending.length > 0;
  state.pending = [];
  state.active = 1 - state.active;
  state.turn += 1;
  state.throws = 1;
  return state;
}
export function movePiece(game, pieceId, resultId) {
  const plan = planMove(game, pieceId, resultId);
  if (!plan) throw new Error('Illegal move');
  const state = copy(game);
  for (const id of plan.stackIds) state.pieces[id].history = copy(plan.history);
  for (const id of plan.captured) state.pieces[id].history = [{ node: 'base', route: 'outer' }];
  // A stack shares the arriving path, including the history used for Back-do.
  if (!['base', 'finish'].includes(plan.target)) {
    for (const piece of state.pieces) if (piece.player === state.active && position(piece) === plan.target) piece.history = copy(plan.history);
  }
  state.pending = state.pending.filter(result => result.id !== resultId);
  if (plan.captured.length > 0) state.throws += 1;
  state.action += 1;
  state.lastMove = { player: state.active, from: plan.from, target: plan.target, ids: plan.stackIds, captured: plan.captured, path: plan.path };
  state.lastPass = false;
  if (state.pieces.filter(p => p.player === state.active).every(p => position(p) === 'finish')) {
    state.winner = state.active;
    state.pending = [];
    state.throws = 0;
    return state;
  }
  return settleTurn(state);
}
export function restoreGame(value) {
  try {
    if (!value || value.schema !== SCHEMA || typeof value.id !== 'string' || ![0, 1].includes(value.active) || ![null, 0, 1].includes(value.winner)) return null;
    if (!Number.isSafeInteger(value.throws) || value.throws < 0 || value.throws > 128 || !Number.isSafeInteger(value.turn) || value.turn < 1) return null;
    if (!Number.isSafeInteger(value.action) || value.action < 0) return null;
    if (!Number.isSafeInteger(value.nextResult) || value.nextResult < 1 || !Array.isArray(value.pending) || value.pending.length > 128 || !Array.isArray(value.pieces) || value.pieces.length !== 8) return null;
    const ids = new Set();
    for (const result of value.pending) {
      if (!Number.isSafeInteger(result.id) || result.id < 1 || result.id >= value.nextResult || ids.has(result.id) || !OUTCOMES[result.outcome] || OUTCOMES[result.outcome].steps !== result.steps) return null;
      ids.add(result.id);
    }
    for (let id = 0; id < 8; id++) {
      const piece = value.pieces[id];
      if (piece.id !== id || piece.player !== (id < 4 ? 0 : 1) || !Array.isArray(piece.history) || piece.history.length < 1 || piece.history.length > 40) return null;
      if (piece.history[0].node !== 'base') return null;
      for (const point of piece.history) if (!ROUTES[point.route]?.includes(point.node)) return null;
    }
    if (value.winner !== null && !value.pieces.filter(p => p.player === value.winner).every(p => position(p) === 'finish')) return null;
    const occupied = new Map();
    for (const piece of value.pieces) {
      const node = position(piece);
      if (node === 'base' || node === 'finish') continue;
      if (occupied.has(node) && occupied.get(node) !== piece.player) return null;
      occupied.set(node, piece.player);
    }
    const state = copy(value);
    // Saves from before this feature keep their turn. Older clients may also
    // have started playing while retaining an unknown opening field.
    if (state.opening === undefined || state.opening === null || state.action > 0) state.opening = null;
    else {
      const opening = state.opening;
      if (!Number.isSafeInteger(opening.round) || opening.round < 1 || !Array.isArray(opening.rolls) || opening.rolls.length !== 2 || ![null, 0, 1].includes(opening.winner)) return null;
      if (state.winner !== null || state.throws !== 1 || state.pending.length || state.turn !== 1 || state.nextResult !== 1 || state.lastThrow !== null || state.lastMove !== null || state.lastPass !== false || state.pieces.some(piece => piece.history.length !== 1)) return null;
      for (const roll of opening.rolls) if (roll !== null && classify(roll.bits) !== roll.outcome) return null;
      if (opening.rolls[0] === null && opening.rolls[1] !== null || openingWinner(opening.rolls) !== opening.winner) return null;
      const active = opening.rolls[0] === null ? 0 : opening.rolls[1] === null ? 1 : opening.winner ?? 0;
      if (state.active !== active) return null;
    }
    return settleTurn(state);
  } catch { return null; }
}
