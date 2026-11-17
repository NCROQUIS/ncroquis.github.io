import { KING, HORSE, ELEPHANT, sideOf, pseudoMoves, facing } from './rules.js';

const point = (index, flipped) => {
  const visible = flipped ? 89 - index : index;
  return [visible % 9 + .5, Math.floor(visible / 9) + .5];
};
const path = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.join(' ')}`).join('');

function route(board, from, to, flipped) {
  const x = from % 9, y = Math.floor(from / 9), dx = to % 9 - x, dy = Math.floor(to / 9) - y;
  const points = [[x + .5, y + .5]], kind = Math.abs(board[from]);
  if (kind === HORSE || kind === ELEPHANT) {
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const first = [x + .5 + (horizontal ? Math.sign(dx) : 0), y + .5 + (horizontal ? 0 : Math.sign(dy))];
    points.push(first);
    if (kind === ELEPHANT) points.push([first[0] + Math.sign(dx), first[1] + Math.sign(dy)]);
  }
  points.push([to % 9 + .5, Math.floor(to / 9) + .5]);
  if (flipped) for (const p of points) { p[0] = 9 - p[0]; p[1] = 10 - p[1]; }
  // Stop the arrow outside the general's body, including short, adjacent attacks.
  const trimmed = points.map(p => [...p]), end = trimmed.at(-1), previous = trimmed.at(-2);
  const distance = Math.hypot(end[0] - previous[0], end[1] - previous[1]);
  const inset = Math.min(.55, distance * .6);
  end[0] -= (end[0] - previous[0]) / distance * inset;
  end[1] -= (end[1] - previous[1]) / distance * inset;
  return { from, to, points, path: path(points), arrowPath: path(trimmed) };
}

// Use exactly the same attack detection as inCheck, including screens and blocked legs.
// Both sides are inspected so optimistic moves and historical positions need no turn guess.
export function boardThreats(board, { flipped = false, bikjang = false, offeringSide = 1 } = {}) {
  const routes = [];
  for (const side of [1, 2]) {
    const king = board.indexOf(side === 1 ? KING : -KING);
    if (king < 0) continue;
    for (let from = 0; from < 90; from++) {
      if (sideOf(board[from]) === 3 - side && pseudoMoves(board, from).includes(king)) routes.push(route(board, from, king, flipped));
    }
  }
  if (routes.length) return { kind: 'check', routes, callers: routes.map(r => r.from), kings: [...new Set(routes.map(r => r.to))] };
  if (!bikjang || !facing(board)) return null;
  const from = board.indexOf(offeringSide === 2 ? -KING : KING), to = board.indexOf(offeringSide === 2 ? KING : -KING);
  return { kind: 'bikjang', routes: [route(board, from, to, flipped)], callers: [from], kings: [board.indexOf(KING), board.indexOf(-KING)] };
}

export const threatPoint = point;

// Prefer empty space beside the caller; clamp every candidate inside the board.
export function speechPlacement(anchor, size, bounds, obstacles, {preferredSide} = {}) {
  const gap = 5, centerX = anchor.x + anchor.width / 2, centerY = anchor.y + anchor.height / 2;
  const candidates = [];
  for (const offset of [0, -.5, .5, -1, 1, -1.5, 1.5]) {
    candidates.push({ side: 'left', x: anchor.x + anchor.width + gap, y: centerY - size.height / 2 + size.height * offset });
    candidates.push({ side: 'right', x: anchor.x - size.width - gap, y: centerY - size.height / 2 + size.height * offset });
    candidates.push({ side: 'bottom', x: centerX - size.width / 2 + size.width * offset, y: anchor.y - size.height - gap });
    candidates.push({ side: 'top', x: centerX - size.width / 2 + size.width * offset, y: anchor.y + anchor.height + gap });
  }
  for (const candidate of candidates) {
    candidate.x = Math.max(2, Math.min(bounds.width - size.width - 2, candidate.x));
    candidate.y = Math.max(2, Math.min(bounds.height - size.height - 2, candidate.y));
    const overlap = [anchor, ...obstacles].reduce((total, box) => total +
      Math.max(0, Math.min(candidate.x + size.width, box.x + box.width) - Math.max(candidate.x, box.x)) *
      Math.max(0, Math.min(candidate.y + size.height, box.y + box.height) - Math.max(candidate.y, box.y)), 0);
    candidate.score = overlap * 1000 + Math.hypot(candidate.x + size.width / 2 - centerX, candidate.y + size.height / 2 - centerY)
      + (preferredSide && candidate.side !== preferredSide ? bounds.width : 0);
  }
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0], vertical = best.side === 'left' || best.side === 'right';
  best.tail = Math.max(8, Math.min((vertical ? size.height : size.width) - 8, vertical ? centerY - best.y : centerX - best.x));
  return best;
}
