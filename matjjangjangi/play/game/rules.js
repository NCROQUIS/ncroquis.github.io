// Pure Janggi rules shared by the browser, practice AI and a future NcqBoard adapter.
// Positive pieces belong to Cho (seat 1), negative pieces to Han (seat 2).
export const KING = 1, GUARD = 2, ROOK = 3, CANNON = 4, HORSE = 5, ELEPHANT = 6, SOLDIER = 7;
export const VALUES = [0, 0, 3, 13, 7, 5, 3, 2];
export const GLYPHS = { 1: ['楚', '士', '車', '包', '馬', '象', '卒'], 2: ['漢', '士', '車', '包', '馬', '象', '兵'] };
export const sideOf = piece => piece > 0 ? 1 : piece < 0 ? 2 : 0;
export const index = (x, y) => y * 9 + x;
const inside = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 10;
const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const palaceLines = [
  [index(3, 0), index(4, 1), index(5, 2)], [index(5, 0), index(4, 1), index(3, 2)],
  [index(3, 7), index(4, 8), index(5, 9)], [index(5, 7), index(4, 8), index(3, 9)],
];
const palace = (x, y, side) => x >= 3 && x <= 5 && (side === 1 ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
const diagonalNeighbors = from => palaceLines.flatMap(line => {
  const at = line.indexOf(from);
  return at < 0 ? [] : [line[at - 1], line[at + 1]].filter(p => p !== undefined);
});

export function initial({ choFormation = 0, hanFormation = 0 } = {}) {
  if (![choFormation, hanFormation].every(n => Number.isInteger(n) && n >= 0 && n < 4)) throw new Error('invalidFormation');
  const board = Array(90).fill(0);
  for (const side of [1, 2]) {
    const sign = side === 1 ? 1 : -1;
    const home = side === 1 ? 9 : 0;
    const formation = side === 1 ? choFormation : hanFormation;
    // Formation bits swap each horse/elephant pair, from that player's perspective.
    const back = [ROOK, HORSE, ELEPHANT, GUARD, 0, GUARD, ELEPHANT, HORSE, ROOK];
    if (formation & 1) [back[1], back[2]] = [back[2], back[1]];
    if (formation & 2) [back[6], back[7]] = [back[7], back[6]];
    for (let x = 0; x < 9; x++) board[index(side === 1 ? x : 8 - x, home)] = back[x] * sign;
    board[index(4, side === 1 ? 8 : 1)] = KING * sign;
    for (const x of [1, 7]) board[index(x, side === 1 ? 7 : 2)] = CANNON * sign;
    for (const x of [0, 2, 4, 6, 8]) board[index(x, side === 1 ? 6 : 3)] = SOLDIER * sign;
  }
  const state = { board, turn: 1, winner: null, reason: null, ply: 0, passes: 0, quiet: 0, bikjang: false, last: null, positions: {} };
  state.positions[positionKey(state)] = 1;
  return state;
}

export function pseudoMoves(board, from) {
  const piece = board[from], side = sideOf(piece), kind = Math.abs(piece);
  if (!side) return [];
  const x = from % 9, y = Math.floor(from / 9), result = [];
  const add = to => { if (sideOf(board[to]) !== side) result.push(to); };
  const step = (nx, ny) => { if (inside(nx, ny)) add(index(nx, ny)); };
  if (kind === KING || kind === GUARD) {
    for (const [dx, dy] of orthogonal) if (palace(x + dx, y + dy, side)) step(x + dx, y + dy);
    for (const to of diagonalNeighbors(from)) if (palace(to % 9, Math.floor(to / 9), side)) add(to);
  } else if (kind === SOLDIER) {
    const forward = side === 1 ? -1 : 1;
    step(x - 1, y); step(x + 1, y); step(x, y + forward);
    for (const to of diagonalNeighbors(from)) if (Math.floor(to / 9) === y + forward) add(to);
  } else if (kind === HORSE || kind === ELEPHANT) {
    for (const [dx, dy] of orthogonal) {
      const firstX = x + dx, firstY = y + dy;
      if (!inside(firstX, firstY) || board[index(firstX, firstY)]) continue;
      for (const wing of [-1, 1]) {
        const sx = dx || wing, sy = dy || wing;
        const middleX = firstX + sx, middleY = firstY + sy;
        if (kind === HORSE) step(middleX, middleY);
        else if (inside(middleX, middleY) && !board[index(middleX, middleY)]) step(middleX + sx, middleY + sy);
      }
    }
  } else if (kind === ROOK || kind === CANNON) {
    const scan = ray => {
      let screened = kind === ROOK;
      for (const to of ray) {
        const target = board[to];
        if (!screened) {
          if (!target) continue;
          if (Math.abs(target) === CANNON) break;
          screened = true;
          continue;
        }
        if (!target) result.push(to);
        else {
          if (sideOf(target) !== side && !(kind === CANNON && Math.abs(target) === CANNON)) result.push(to);
          break;
        }
      }
    };
    for (const [dx, dy] of orthogonal) {
      const ray = [];
      for (let nx = x + dx, ny = y + dy; inside(nx, ny); nx += dx, ny += dy) ray.push(index(nx, ny));
      scan(ray);
    }
    for (const line of palaceLines) {
      const at = line.indexOf(from);
      if (at < 0) continue;
      scan(line.slice(at + 1)); scan(line.slice(0, at).reverse());
    }
  }
  return [...new Set(result)];
}

export function inCheck(board, side) {
  const king = board.indexOf(side === 1 ? KING : -KING);
  if (king === -1) return true;
  for (let from = 0; from < 90; from++) if (sideOf(board[from]) === 3 - side && pseudoMoves(board, from).includes(king)) return true;
  return false;
}

export function legalMoves(board, side) {
  const result = [];
  for (let from = 0; from < 90; from++) {
    if (sideOf(board[from]) !== side) continue;
    for (const to of pseudoMoves(board, from)) {
      if (Math.abs(board[to]) === KING) continue; // A game ends at mate, never by taking a general.
      const next = board.slice(); next[to] = next[from]; next[from] = 0;
      if (!inCheck(next, side)) result.push({ type: 'move', from, to });
    }
  }
  return result;
}

export function facing(board) {
  const cho = board.indexOf(KING), han = board.indexOf(-KING);
  if (cho < 0 || han < 0 || cho % 9 !== han % 9) return false;
  for (let p = Math.min(cho, han) + 9; p < Math.max(cho, han); p += 9) if (board[p]) return false;
  return true;
}

export const positionKey = ({ board, turn }) => board.join(',') + ':' + turn;
export function material(board) {
  const points = { 1: 0, 2: 1.5 };
  for (const piece of board) if (piece) points[sideOf(piece)] += VALUES[Math.abs(piece)];
  return points;
}

export function apply(state, action) {
  if (state.winner !== null) throw new Error('gameOver');
  const side = state.turn;
  if (!action || typeof action !== 'object') throw new Error('invalidMove');
  const next = { ...state, board: state.board.slice(), positions: { ...state.positions }, last: { ...action, side }, ply: state.ply + 1 };
  if (action.type === 'resign') return { ...next, winner: 3 - side, reason: 'resign' };
  if (action.type === 'pass' || action.type === 'accept-bikjang') {
    if (inCheck(state.board, side)) throw new Error('mustEscapeCheck');
    if (action.type === 'accept-bikjang' && !state.bikjang) throw new Error('invalidMove');
    next.passes = state.passes + 1;
    next.quiet = state.quiet + 1;
  } else if (action.type === 'move') {
    if (!Number.isInteger(action.from) || !Number.isInteger(action.to) || action.from < 0 || action.from >= 90 || action.to < 0 || action.to >= 90) throw new Error('invalidMove');
    if (sideOf(state.board[action.from]) !== side) throw new Error('notYourPiece');
    if (!legalMoves(state.board, side).some(m => m.from === action.from && m.to === action.to)) throw new Error(inCheck(state.board, side) ? 'mustEscapeCheck' : 'invalidMove');
    next.last.piece = state.board[action.from]; next.last.captured = state.board[action.to];
    next.quiet = state.board[action.to] ? 0 : state.quiet + 1;
    next.board[action.to] = next.board[action.from]; next.board[action.from] = 0;
    next.passes = 0;
  } else throw new Error('invalidMove');
  next.turn = 3 - side;
  const checked = inCheck(next.board, next.turn);
  if (checked && !legalMoves(next.board, next.turn).length) return { ...next, winner: side, reason: 'checkmate', bikjang: false };
  const stillFacing = facing(next.board);
  // Practice rules: resolve a pending bikjang or accept a draw. A check must always be answered.
  if (state.bikjang && stillFacing && !inCheck(next.board, side)) return { ...next, winner: 0, reason: 'bikjang', bikjang: false };
  next.bikjang = stillFacing && !checked;
  if (next.passes >= 2) return { ...next, winner: 0, reason: 'passes' };
  const key = positionKey(next);
  next.positions[key] = (next.positions[key] || 0) + 1;
  if (next.positions[key] >= 3) return { ...next, winner: 0, reason: 'repetition' };
  if (next.quiet >= 100) return { ...next, winner: 0, reason: 'quiet' };
  return next;
}
