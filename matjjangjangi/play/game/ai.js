import { apply, inCheck, legalMoves, sideOf, VALUES, SOLDIER, KING } from './rules.js';

// A small deterministic practice opponent; it is explicitly labelled as AI in the UI.
function evaluate(board, side) {
  let total = 0;
  for (let i = 0; i < 90; i++) {
    const piece = board[i];
    if (!piece) continue;
    const owner = sideOf(piece), kind = Math.abs(piece), y = Math.floor(i / 9), x = i % 9;
    let value = VALUES[kind] * 100;
    if (kind !== KING) value += (4 - Math.abs(4 - x)) * 3;
    if (kind === SOLDIER) value += (owner === 1 ? 9 - y : y) * 9;
    total += owner === side ? value : -value;
  }
  return total;
}
function ordered(board, side) {
  return legalMoves(board, side).sort((a, b) =>
    ((VALUES[Math.abs(board[b.to])] || 0) * 100 - VALUES[Math.abs(board[b.from])]) -
    ((VALUES[Math.abs(board[a.to])] || 0) * 100 - VALUES[Math.abs(board[a.from])]));
}

export function chooseMove(state, { depth = 2, nodeLimit = 6000 } = {}) {
  if (state.winner !== null) return null;
  let nodes = 0;
  const search = (board, side, remaining, alpha, beta) => {
    if (++nodes >= nodeLimit || remaining === 0) return evaluate(board, side);
    const moves = ordered(board, side);
    if (!moves.length) return inCheck(board, side) ? -100000 - remaining : evaluate(board, side);
    let best = -Infinity;
    for (const move of moves) {
      const next = board.slice(); next[move.to] = next[move.from]; next[move.from] = 0;
      const score = -search(next, 3 - side, remaining - 1, -beta, -alpha);
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta || nodes >= nodeLimit) break;
    }
    return best;
  };
  let best = null;
  const moves = ordered(state.board, state.turn);
  if (!moves.length) return inCheck(state.board, state.turn) ? null : { type: 'pass' };
  // Iterative deepening commits only completed depths, avoiding a cutoff bias toward early moves.
  for (let level = 1; level <= depth; level++) {
    let candidate = moves[0], score = -Infinity, complete = true;
    for (const move of moves) {
      if (nodes >= nodeLimit) { complete = false; break; }
      const next = apply(state, move);
      let value = next.winner === state.turn ? 100000 : next.winner === 0 ? 0 : -search(next.board, next.turn, level - 1, -Infinity, -score);
      if (next.winner === null && next.positions[next.board.join(',') + ':' + next.turn] > 1) value -= 25;
      if (value > score) { score = value; candidate = move; }
    }
    if (complete || !best) best = candidate;
    if (!complete) break;
  }
  return best;
}
