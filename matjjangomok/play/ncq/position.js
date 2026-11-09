export const size = 15;
const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

function point(index, dy, dx, offset) {
  const row = Math.floor(index / size) + dy * offset;
  const col = index % size + dx * offset;
  return row >= 0 && row < size && col >= 0 && col < size ? row * size + col : -1;
}

function linesThrough(board, index, color) {
  return directions.map(([dy, dx]) => {
    const line = [index];
    for (const sign of [-1, 1]) {
      for (let step = sign; board[point(index, dy, dx, step)] === color; step += sign) {
        line.push(point(index, dy, dx, step));
      }
    }
    return line;
  });
}

// Count stone groups, so the two ends of one straight four count only once.
function threats(board, index, length) {
  const groups = new Map();
  for (const [dy, dx] of directions) {
    for (let start = 1 - length; start <= 0; start += 1) {
      const before = point(index, dy, dx, start - 1);
      const after = point(index, dy, dx, start + length);
      if (length === 5) {
        if (board[before] === 1 || board[after] === 1) continue;
      } else if (board[before] !== 0 || board[after] !== 0 ||
          board[point(index, dy, dx, start - 2)] === 1 ||
          board[point(index, dy, dx, start + length + 1)] === 1) continue;
      const stones = [];
      let empty = -1;
      for (let offset = start; offset < start + length; offset += 1) {
        const square = point(index, dy, dx, offset);
        if (board[square] === 1) stones.push(square);
        else if (board[square] === 0 && empty === -1) empty = square;
        else break;
      }
      if (stones.length !== length - 1 || empty === -1) continue;
      const key = stones.join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(empty);
    }
  }
  return groups;
}

function blackFoul(board, index, lines) {
  if (lines.some(line => line.length > 5)) return "renjuOverline";
  if (threats(board, index, 5).size > 1) return "renjuDoubleFour";
  const threes = threats(board, index, 4);
  if (threes.size < 2) return;
  let open = 0;
  for (const extensions of threes.values()) {
    const real = extensions.some(square => {
      board[square] = 1;
      const lines = linesThrough(board, square, 1);
      const allowed = !lines.some(line => line.length === 5) && !blackFoul(board, square, lines);
      board[square] = 0;
      return allowed;
    });
    if (real && ++open === 2) return "renjuDoubleThree";
  }
}

export function exactFive(rule, color) {
  return color === 1 && hasForbiddenMoves(rule);
}

export function hasForbiddenMoves(rule) {
  return rule === "renju" || rule === "taraguchi";
}

export function forbiddenAt(board, index, rule) {
  if (board[index] !== 0) return;
  board[index] = 1;
  const { error } = judgeStone(board, index, 1, rule);
  board[index] = 0;
  return error;
}

export function judgeStone(board, index, color, rule) {
  const lines = linesThrough(board, index, color);
  const line = lines.find(line => exactFive(rule, color) ? line.length === 5 : line.length >= 5);
  if (line) return { line };
  if (color === 1 && hasForbiddenMoves(rule)) {
    const error = blackFoul(board, index, lines);
    if (error) return { error };
  }
  return { line: [] };
}
