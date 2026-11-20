// supabase/functions/matjjangomok/bot-level-design.json
var bot_level_design_default = {
  defenseAfterStones: 5,
  ranks: [
    { name: "18\uAE09", attackPercent: 0, defenseMissPercent: 30, defenseMissCooldown: 1, depth: 1, candidates: 3 },
    { name: "17\uAE09", attackPercent: 0, defenseMissPercent: 28, defenseMissCooldown: 2, depth: 1, candidates: 3 },
    { name: "16\uAE09", attackPercent: 0, defenseMissPercent: 26, defenseMissCooldown: 3, depth: 1, candidates: 3 },
    { name: "15\uAE09", attackPercent: 0, defenseMissPercent: 24, defenseMissCooldown: 4, depth: 1, candidates: 3 },
    { name: "14\uAE09", attackPercent: 0, defenseMissPercent: 22, defenseMissCooldown: 5, depth: 1, candidates: 3 },
    { name: "13\uAE09", attackPercent: 0, defenseMissPercent: 20, defenseMissCooldown: 6, depth: 1, candidates: 4 },
    { name: "12\uAE09", attackPercent: 0, defenseMissPercent: 18, defenseMissCooldown: 7, depth: 1, candidates: 4 },
    { name: "11\uAE09", attackPercent: 5, defenseMissPercent: 16, defenseMissCooldown: 8, depth: 2, candidates: 4 },
    { name: "10\uAE09", attackPercent: 10, defenseMissPercent: 14, defenseMissCooldown: 9, depth: 2, candidates: 4 },
    { name: "9\uAE09", attackPercent: 15, defenseMissPercent: 12, defenseMissCooldown: 10, depth: 2, candidates: 4 },
    { name: "8\uAE09", attackPercent: 20, defenseMissPercent: 10, defenseMissCooldown: 11, depth: 2, candidates: 5 },
    { name: "7\uAE09", attackPercent: 25, defenseMissPercent: 8, defenseMissCooldown: 12, depth: 3, candidates: 5 },
    { name: "6\uAE09", attackPercent: 30, defenseMissPercent: 6, defenseMissCooldown: 13, depth: 3, candidates: 5 },
    { name: "5\uAE09", attackPercent: 35, defenseMissPercent: 4, defenseMissCooldown: 14, depth: 3, candidates: 5 },
    { name: "4\uAE09", attackPercent: 40, defenseMissPercent: 2, defenseMissCooldown: 15, depth: 3, candidates: 5 },
    { name: "3\uAE09", attackPercent: 45, defenseMissPercent: 1, defenseMissCooldown: 16, depth: 3, candidates: 6 },
    { name: "2\uAE09", attackPercent: 50, defenseMissPercent: 1, defenseMissCooldown: 17, depth: 4, candidates: 6 },
    { name: "1\uAE09", attackPercent: 55, defenseMissPercent: 1, defenseMissCooldown: 18, depth: 4, candidates: 6 },
    { name: "1\uB2E8", attackPercent: 60, defenseMissPercent: 1, defenseMissCooldown: 19, depth: 4, candidates: 6 },
    { name: "2\uB2E8", attackPercent: 65, defenseMissPercent: 1, defenseMissCooldown: 20, depth: 4, candidates: 6 },
    { name: "3\uB2E8", attackPercent: 70, defenseMissPercent: 1, defenseMissCooldown: 21, depth: 4, candidates: 7 },
    { name: "4\uB2E8", attackPercent: 75, defenseMissPercent: 1, defenseMissCooldown: 22, depth: 4, candidates: 7 },
    { name: "5\uB2E8", attackPercent: 80, defenseMissPercent: 1, defenseMissCooldown: 23, depth: 4, candidates: 7 },
    { name: "6\uB2E8", attackPercent: 85, defenseMissPercent: 1, defenseMissCooldown: 24, depth: 4, candidates: 7 },
    { name: "7\uB2E8", attackPercent: 90, defenseMissPercent: 1, defenseMissCooldown: 25, depth: 5, candidates: 7 },
    { name: "8\uB2E8", attackPercent: 95, defenseMissPercent: 1, defenseMissCooldown: 26, depth: 5, candidates: 8 },
    { name: "9\uB2E8", attackPercent: 100, defenseMissPercent: 1, defenseMissCooldown: 27, depth: 5, candidates: 8 }
  ]
};

// supabase/functions/matjjangomok/omok-ai.mjs
var size = 15;
var axes = [[1, 0], [0, 1], [1, 1], [1, -1]];
var win = 1e5;
var fork = 12e3;
var topLevel = bot_level_design_default.ranks.length - 1;
function shape(board, row, col, seat, line, exact) {
  let value = 0;
  let completions = 0;
  for (const [dy, dx] of axes) {
    for (let offset = -5; offset <= 5; offset += 1) {
      const y = row + offset * dy;
      const x = col + offset * dx;
      line[offset + 5] = offset === 0 ? seat : y < 0 || y >= size || x < 0 || x >= size ? 3 - seat : board[y * size + x];
    }
    let best = 0;
    let gaps = 0;
    for (let start = 1; start <= 5; start += 1) {
      let stones = 0;
      let gap = 0;
      for (let i = start; i < start + 5; i += 1) {
        if (line[i] === seat) stones += 1;
        else if (line[i] === 0) gap = i;
        else break;
        if (i !== start + 4) continue;
        if (exact && stones >= 4 && (line[start - 1] === seat || line[start + 5] === seat)) continue;
        if (stones === 5) return win;
        if (stones === 4) gaps |= 1 << gap;
        const open = Number(start > 1 && line[start - 1] === 0) + Number(start < 5 && line[start + 5] === 0);
        if (stones === 3) best = Math.max(best, 90 + 55 * open);
        if (stones === 2) best = Math.max(best, 16 + 8 * open);
      }
    }
    if (gaps) {
      completions += gaps & gaps - 1 ? 2 : 1;
      best = 1600;
    }
    value += best;
  }
  return completions >= 2 ? fork + value : value;
}
function candidates(board) {
  const nearby = new Uint8Array(board.length);
  let occupied = false;
  for (let index = 0; index < board.length; index += 1) {
    if (!board[index]) continue;
    occupied = true;
    const row = Math.floor(index / size);
    const col = index % size;
    for (let y = Math.max(0, row - 2); y <= Math.min(size - 1, row + 2); y += 1) {
      for (let x = Math.max(0, col - 2); x <= Math.min(size - 1, col + 2); x += 1) {
        const near = y * size + x;
        if (!board[near]) nearby[near] = 1;
      }
    }
  }
  if (!occupied) nearby[112] = 1;
  return nearby;
}
function assess(board, seat, level, policy, {
  randomness = 0,
  random = Math.random,
  guardOpening = false,
  legal = false,
  readDefense = true
} = {}) {
  const nearby = candidates(board);
  const line = new Int8Array(11);
  const ownExact = policy?.exactFive(seat);
  const opponentExact = policy?.exactFive(3 - seat);
  const moves = [];
  const blocks = [];
  let bestAttack = 0;
  let bestDefense = 0;
  let forcing;
  let openingBlock;
  for (let index = 0; index < nearby.length; index += 1) {
    if (!nearby[index] || legal && policy && !policy.allowed(board, index, seat)) continue;
    const row = Math.floor(index / size);
    const col = index % size;
    const attack = shape(board, row, col, seat, line, ownExact);
    if (attack === win) return { winning: index };
    const isForcing = attack >= fork;
    if (isForcing && forcing === void 0) forcing = index;
    const defense = !readDefense || legal && policy && !policy.allowed(board, index, 3 - seat) ? 0 : shape(board, row, col, 3 - seat, line, opponentExact);
    if (defense === win) blocks.push(index);
    if (guardOpening && defense >= fork && openingBlock === void 0) openingBlock = index;
    bestAttack = Math.max(bestAttack, attack);
    bestDefense = Math.max(bestDefense, defense);
    const center2 = 14 - Math.abs(row - 7) - Math.abs(col - 7);
    const variation = randomness ? random() * randomness : 0;
    const score = attack + defense * (1.12 + level * 6e-3) + center2 + variation;
    moves.push({ index, score, forcing: isForcing });
  }
  return { moves, blocks, forcing, openingBlock, value: bestAttack - Math.min(bestDefense, fork) * 0.9 };
}
function shortlist(moves, width) {
  return moves.sort((a, b) => b.score - a.score).slice(0, width).map((move) => move.index);
}
function readAhead(board, seat, level, depth, width, alpha, beta, budget, policy) {
  budget.remaining -= 1;
  const position = assess(board, seat, level, policy);
  if (position.winning !== void 0) return win + depth;
  if (position.blocks.length > 1) return -win - depth + 1;
  if (position.moves.length === 0) return 0;
  if (!position.blocks.length && position.forcing !== void 0) return win + depth - 2;
  if (budget.remaining === 0 || depth <= 0 && (!position.blocks.length || depth === -3)) return position.value;
  let best = -Infinity;
  const moves = position.blocks.length ? position.blocks : shortlist(position.moves, width);
  for (const index of moves) {
    board[index] = seat;
    const score = -readAhead(board, 3 - seat, level, depth - 1, width, -beta, -alpha, budget, policy);
    board[index] = 0;
    if (budget.remaining === 0) return 0;
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}
function chooseOmokMove(board, seat, level = 0, random = Math.random, policy, defenseState = {}) {
  const { depth, candidates: width, attackPercent, defenseMissPercent, defenseMissCooldown } = bot_level_design_default.ranks[level] ?? bot_level_design_default.ranks[0];
  const variation = (topLevel - level) ** 2 * 0.65 + 3 * Math.max(0, 7 - level) ** 2;
  const opponentStones = board.filter((stone) => stone === 3 - seat).length;
  const missChance = defenseMissPercent / 100;
  const cooldown = defenseState.cooldown ?? 0;
  const readDefense = cooldown > 0 || opponentStones < bot_level_design_default.defenseAfterStones || missChance === 0 || random() >= missChance;
  defenseState.cooldown = readDefense ? Math.max(0, cooldown - 1) : defenseMissCooldown;
  const position = assess(board, seat, level, policy, {
    randomness: variation,
    random,
    guardOpening: opponentStones === 3,
    legal: true,
    readDefense
  });
  if (position.winning !== void 0) return position.winning;
  if (position.blocks.length) return position.blocks[0];
  const attackChance = attackPercent / 100;
  if (position.forcing !== void 0 && attackChance > 0 && (attackChance === 1 || random() < attackChance)) {
    return position.forcing;
  }
  if (position.openingBlock !== void 0) return position.openingBlock;
  const alternatives = position.forcing === void 0 ? position.moves : position.moves.filter((move) => !move.forcing);
  const moves = shortlist(alternatives.length ? alternatives : position.moves, width);
  if (!readDefense || depth === 1 || moves.length < 2) return moves[0];
  const nextBoard = [...board];
  const budget = { remaining: 1200 };
  let bestScore = -Infinity;
  let bestMove = moves[0];
  for (const index of moves) {
    nextBoard[index] = seat;
    const score = -readAhead(nextBoard, 3 - seat, level, depth - 2, width, -Infinity, -bestScore, budget, policy);
    nextBoard[index] = 0;
    if (budget.remaining === 0) break;
    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }
  return bestMove;
}

// supabase/functions/matjjangomok/bot-persona.mjs
var beginnings = [
  "\uB178\uC744\uBE5B",
  "\uC0C8\uBCBD",
  "\uD478\uB978",
  "\uBC24\uD558\uB298",
  "\uB3D9\uB124",
  "\uC8FC\uB9D0",
  "\uD558\uC580",
  "\uC5EC\uB984",
  "\uD55C\uBC24",
  "\uB290\uB9B0",
  "\uC870\uC6A9\uD55C",
  "\uC791\uC740",
  "\uC194\uC78E",
  "\uC624\uD6C4",
  "\uBCC4\uBE5B",
  "\uB2E4\uC815\uD55C",
  "\uB77C\uC784",
  "\uBCF4\uB9AC",
  "\uC720\uC790",
  "\uC0B0\uB4E4"
];
var endings = [
  "\uC0B0\uCC45",
  "\uC5EC\uC6B0",
  "\uCC3B\uC9D1",
  "\uC6B0\uC720",
  "\uBCC4",
  "\uB098\uBB34",
  "\uAD6C\uB984",
  "\uACE0\uB798",
  "\uB2EC",
  "\uC624\uD6C4",
  "\uCE74\uD398",
  "\uC218\uCCA9",
  "\uACE8\uBAA9",
  "\uC5F0\uD544",
  "\uD55C\uC218",
  "\uC815\uC6D0",
  "\uBAA8\uC790",
  "\uACE0\uC591\uC774",
  "\uBC14\uB78C",
  "\uBB38\uAD6C\uC810"
];
function botNickname(seed, offset = 0) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const value = ((hash >>> 0) + offset) % (beginnings.length * endings.length);
  return beginnings[value % beginnings.length] + endings[Math.floor(value / beginnings.length)];
}
function withBotProfile(players, roomId, seat, rating) {
  const existing = players?.find((player) => player.seat === seat);
  const bot = { ...existing, seat, bot: true, nickname: existing?.nickname || botNickname(roomId) };
  if (Number.isInteger(rating)) bot.rating = rating;
  return [...(players ?? []).filter((player) => player.seat !== seat), bot].sort((a, b) => a.seat - b.seat);
}

// supabase/functions/matjjangomok/position.mjs
var size2 = 15;
var directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
function point(index, dy, dx, offset) {
  const row = Math.floor(index / size2) + dy * offset;
  const col = index % size2 + dx * offset;
  return row >= 0 && row < size2 && col >= 0 && col < size2 ? row * size2 + col : -1;
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
function threats(board, index, length) {
  const groups = /* @__PURE__ */ new Map();
  for (const [dy, dx] of directions) {
    for (let start = 1 - length; start <= 0; start += 1) {
      const before = point(index, dy, dx, start - 1);
      const after = point(index, dy, dx, start + length);
      if (length === 5) {
        if (board[before] === 1 || board[after] === 1) continue;
      } else if (board[before] !== 0 || board[after] !== 0 || board[point(index, dy, dx, start - 2)] === 1 || board[point(index, dy, dx, start + length + 1)] === 1) continue;
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
  if (lines.some((line) => line.length > 5)) return "renjuOverline";
  if (threats(board, index, 5).size > 1) return "renjuDoubleFour";
  const threes = threats(board, index, 4);
  if (threes.size < 2) return;
  let open = 0;
  for (const extensions of threes.values()) {
    const real = extensions.some((square) => {
      board[square] = 1;
      const lines2 = linesThrough(board, square, 1);
      const allowed = !lines2.some((line) => line.length === 5) && !blackFoul(board, square, lines2);
      board[square] = 0;
      return allowed;
    });
    if (real && ++open === 2) return "renjuDoubleThree";
  }
}
function exactFive(rule, color) {
  return color === 1 && hasForbiddenMoves(rule);
}
function hasForbiddenMoves(rule) {
  return rule === "renju" || rule === "taraguchi";
}
function forbiddenAt(board, index, rule) {
  if (board[index] !== 0) return;
  board[index] = 1;
  const { error } = judgeStone(board, index, 1, rule);
  board[index] = 0;
  return error;
}
function judgeStone(board, index, color, rule) {
  const lines = linesThrough(board, index, color);
  const line = lines.find((line2) => exactFive(rule, color) ? line2.length === 5 : line2.length >= 5);
  if (line) return { line };
  if (color === 1 && hasForbiddenMoves(rule)) {
    const error = blackFoul(board, index, lines);
    if (error) return { error };
  }
  return { line: [] };
}

// supabase/functions/matjjangomok/taraguchi.mjs
var offerCount = 10;
var center = Math.floor(size2 / 2);
function maySwap(state) {
  return state.opening === "limited" && state.placed > 0 && !state.swapped;
}
function mayOffer(state) {
  return maySwap(state) && state.placed === 4;
}
function openingRadius(state) {
  return state.opening === "limited" && state.placed < 5 ? state.placed : null;
}
function symmetricOffer(board, offers, index) {
  if (!offers.length) return false;
  const stones = board.flatMap((color, square) => color ? [square] : []);
  for (const transpose of [false, true]) {
    for (const flipRow of [false, true]) {
      for (const flipCol of [false, true]) {
        if (!transpose && !flipRow && !flipCol) continue;
        const transform = (square) => {
          const row = Math.floor(square / size2);
          const col = square % size2;
          const y = transpose ? col : row;
          const x = transpose ? row : col;
          return (flipRow ? size2 - 1 - y : y) * size2 + (flipCol ? size2 - 1 - x : x);
        };
        if (offers.includes(transform(index)) && stones.every((square) => board[square] === board[transform(square)])) {
          return true;
        }
      }
    }
  }
  return false;
}
function openingError(state, index) {
  const radius = openingRadius(state);
  if (radius !== null) {
    const row = Math.floor(index / size2);
    const col = index % size2;
    if (Math.max(Math.abs(row - center), Math.abs(col - center)) > radius) return "outsideOpening";
  }
  if (state.opening === "offerFive") {
    if (state.offers.includes(index)) return "alreadyOffered";
    if (symmetricOffer(state.board, state.offers, index)) return "symmetricOffer";
  }
  if (state.opening === "pickFive" && !state.offers.includes(index)) return "chooseOffered";
}
function applyOpening(state, seat, action, color) {
  if (action.type === "swap" && maySwap(state)) {
    return { ...state, black: 3 - state.black, turn: 3 - seat, swapped: true };
  }
  if (action.type === "offerFive" && mayOffer(state)) {
    return { ...state, opening: "offerFive", offers: [] };
  }
  const { index } = action;
  if (action.type !== "move" || !Number.isInteger(index) || index < 0 || index >= state.board.length) {
    return { error: "invalid" };
  }
  if (state.board[index]) return { error: "occupied" };
  const error = openingError(state, index);
  if (error) return { error };
  if (state.opening === "offerFive") {
    const offers = [...state.offers, index];
    return offers.length === offerCount ? { ...state, offers, opening: "pickFive", turn: 3 - seat } : { ...state, offers };
  }
  const board = [...state.board];
  board[index] = color;
  if (state.opening === "pickFive") {
    return { ...state, board, opening: null, placed: 5, offers: [] };
  }
  const placed = state.placed + 1;
  return { ...state, board, placed, opening: placed === 6 ? null : "limited", turn: 3 - seat, swapped: false };
}

// supabase/functions/matjjangomok/omok.mjs
function nextStone(state) {
  if (state.opening === "pickFive") return 1;
  return state.turn === (state.black ?? 1) ? 1 : 2;
}
var omok = {
  initial(rule = "free") {
    return {
      board: Array(size2 * size2).fill(0),
      turn: 1,
      winner: null,
      line: [],
      ...rule === "free" ? {} : { rule },
      ...rule === "taraguchi" ? { opening: "limited", placed: 0, black: 1, swapped: false } : {}
    };
  },
  legacyAction: ({ index }) => ({ type: "move", index }),
  matchModes: ["tournament"],
  apply(state, seat, action) {
    if (state.winner !== null || state.turn !== seat) return { error: "wrongTurn" };
    const color = nextStone(state);
    if (state.opening) return applyOpening(state, seat, action, color);
    if (hasForbiddenMoves(state.rule) && action.type === "pass") {
      return { ...state, passed: true, turn: 3 - seat, winner: state.passed ? 0 : null };
    }
    const { index } = action;
    if (action.type !== "move" || !Number.isInteger(index) || index < 0 || index >= state.board.length) {
      return { error: "invalid" };
    }
    if (state.board[index]) return { error: "occupied" };
    const board = [...state.board];
    board[index] = color;
    const result = judgeStone(board, index, color, state.rule);
    if (result.error) return result;
    const { line } = result;
    return {
      ...state,
      board,
      line,
      winner: line.length ? seat : board.every(Boolean) ? 0 : null,
      turn: 3 - seat,
      ...state.passed ? { passed: false } : {}
    };
  },
  applyBot(state, seat, action) {
    const next = omok.apply(state, seat, action);
    if (next.error) return next;
    return {
      ...next,
      botDefenseCooldowns: { ...state.botDefenseCooldowns, [seat]: action.defenseMissCooldown ?? 0 }
    };
  },
  bot({ state, bot_level }, random = Math.random) {
    const color = nextStone(state);
    if (state.opening === "pickFive") return { type: "move", index: state.offers[0] };
    const policy = state.rule ? {
      exactFive: (stone) => exactFive(state.rule, stone),
      allowed(board, index2, stone) {
        if (state.opening) return !openingError(state, index2);
        return stone !== 1 || !hasForbiddenMoves(state.rule) || !forbiddenAt(board, index2, state.rule);
      }
    } : void 0;
    const defenseState = { cooldown: state.botDefenseCooldowns?.[state.turn] ?? 0 };
    const index = chooseOmokMove(state.board, color, bot_level ?? 0, random, policy, defenseState);
    const memory = { defenseMissCooldown: defenseState.cooldown };
    if (index !== void 0) return { type: "move", index, ...memory };
    const spare = state.board.findIndex((stone, index2) => !stone && (!policy || policy.allowed(state.board, index2, color)));
    return spare < 0 ? { type: "pass", ...memory } : { type: "move", index: spare, ...memory };
  },
  view(state, actions, room) {
    const { rematchPlacementStyle, botDefenseCooldowns, ...publicState } = state;
    const endReason = state.endReason ?? (actions.some((action) => action.type === "resign") ? "resign" : state.line?.length >= 5 ? "win" : state.winner === 0 ? "draw" : null);
    const placements = actions.filter((action) => action.type === "move");
    return {
      ...publicState,
      winner: state.winner ?? 0,
      endReason,
      moves: placements.map((action) => action.index),
      ...state.placementStyles ? { moveSeats: placements.map((action) => action.seat) } : {},
      ...state.rule ? { moveColors: placements.map((action) => action.color) } : {},
      ...state.opening ? { stone: nextStone(state) } : {},
      ...room ? { botLevel: room.bot_level ?? null } : {}
    };
  },
  spectatorView({ board, turn, winner, line, endReason, rule, black, opening, placed, offers, placementStyles }, actions) {
    return { ...omok.view({ board, turn, winner, line, endReason, rule, black, opening, placed, offers, placementStyles }, actions), endReason };
  },
  sharedView({ mode, bot, state, actions }) {
    const { winner, line, moves, endReason, rule, black, moveColors, moveSeats, placementStyles } = omok.view(state, actions);
    return { mode, bot, winner, line, moves, endReason, rule, black, moveColors, moveSeats, placementStyles };
  },
  async get(path, query, read, readGame) {
    const opponent = /^\/api\/rooms\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\/opponent-profile$/.exec(path);
    if (opponent) {
      const round = query.get("round");
      if (!/^[1-9]\d{0,9}$/.test(round ?? "") || Number(round) > 2147483647) return { error: "invalid" };
      return readGame("ncq_omok_opponent_profile", { p_room: opponent[1], p_round: Number(round) });
    }
    if (path === "/api/records") {
      const mode = query.get("mode");
      if (mode !== null && mode !== "tournament") return { error: "invalid" };
      const records = mode ? await readGame("ncq_omok_tournament_records") : await read("records");
      return Array.isArray(records) ? records.filter((record) => record.summaryVersion !== 1).map(({ state, ...record }) => ({
        ...record,
        ...omok.view(state, record.actions),
        ...record.bot && typeof record.id === "string" ? {
          players: withBotProfile(record.players, record.id.split(":")[0], 3 - record.you)
        } : {}
      })) : records;
    }
    if (path === "/api/tournament") {
      const week = query.get("week");
      const view = query.get("view");
      if (week && (week.length > 40 || !Number.isFinite(Date.parse(week)))) return { error: "invalid" };
      if (view !== null && (view !== "previous" || week)) return { error: "invalid" };
      return read("tournament", { ...week ? { week } : {}, ...view ? { view } : {} });
    }
    if (path === "/api/rankings/rating") {
      const page = query.get("page") ?? "1";
      if (!/^[1-9]\d{0,8}$/.test(page)) return { error: "invalid" };
      return readGame("ncq_omok_rating_leaderboard", { p_page: Number(page) });
    }
  }
};

// together-state.js
function createTogetherRound() {
  let state = omok.initial("renju");
  const entries = [], remaining = [3, 3];
  const lastOwn = (side) => entries.findLastIndex((entry) => entry.side === side);
  return {
    rulesVersion: "omok-together-v1",
    get state() {
      return state;
    },
    get actions() {
      return entries.map(({ side, action }) => ({ ...action, seat: side }));
    },
    remaining: (side) => remaining[side - 1],
    canUndo: (side) => state.winner === null && remaining[side - 1] > 0 && lastOwn(side) >= 0,
    play(action) {
      const next = omok.apply(state, state.turn, action);
      if (next.error) return next;
      entries.push({ side: state.turn, action: { ...action }, before: state });
      state = next;
      return state;
    },
    undo(side) {
      if (!this.canUndo(side)) return false;
      const at = lastOwn(side);
      state = entries[at].before;
      entries.splice(at);
      remaining[side - 1]--;
      return true;
    },
    resign(side) {
      if (state.winner !== null || ![1, 2].includes(side)) return false;
      state = { ...state, winner: 3 - side, endReason: "resign" };
      return true;
    }
  };
}

// game-modes-ui.js
import { animateStonePlacement } from "./placement-motion.js?v=689216405a77";
function createGameModes({
  t,
  rankName,
  canOpen,
  startAi,
  undoAi,
  current,
  appearance,
  changed,
  settings,
  sound,
  haptics,
  completedRound,
  returnToLobby,
  journeyChanged = () => {
  }
}) {
  const el = (id) => document.getElementById(id), picker = el("ai-rank-picker"), undoDialog = el("ai-undo-dialog");
  const screen = el("together-screen"), confirm = el("together-confirm"), result = el("together-result");
  let level = 0, group = 0, round = null, selected = null, busy = false, epoch = 0, ended = false, metricEnded = false;
  let roundKey = null, counted = false;
  let action = null, undoTarget = null, motion = null, undoBusy = false, undoUncertain = false, paused = false, undoEpoch = 0;
  const surface = el("board").cloneNode(true);
  for (const node of [surface, ...surface.querySelectorAll("[id]")]) node.removeAttribute("id");
  surface.id = "together-board";
  surface.removeAttribute("data-ncq-main");
  surface.querySelectorAll(".cell,#last-move-marker,.board-grid-definitions,svg:not(.board-lines)").forEach((node) => node.remove());
  const grid = surface.querySelector(".board-grid");
  for (const child of [...grid.children]) if (!child.classList.contains("board-lines")) child.remove();
  grid.style.containerType = "inline-size";
  const cells = Array.from({ length: 225 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.index = index;
    button.innerHTML = '<span class="stone-shadow"></span><span class="stone"></span>';
    if ([48, 56, 112, 168, 176].includes(index)) button.classList.add("star");
    grid.append(button);
    return button;
  });
  el("together-board-host").append(surface);
  const sideName = (side) => t(side === 1 ? "togetherBlack" : "togetherWhite");
  const opened = () => !!round;
  function fitTogether() {
    if (!round) return;
    const layout = getComputedStyle(screen), group2 = screen.querySelector(".together-group");
    const availableHeight = innerHeight - parseFloat(layout.paddingTop) - parseFloat(layout.paddingBottom);
    const availableWidth = innerWidth - parseFloat(layout.paddingLeft) - parseFloat(layout.paddingRight);
    for (let pass = 0; pass < 2; pass++) {
      const controls = [...screen.querySelectorAll(".together-seat")].reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
      const chrome = screen.querySelector("header").getBoundingClientRect().height + screen.lastElementChild.getBoundingClientRect().height + controls + 2 * parseFloat(layout.rowGap) + 2 * parseFloat(getComputedStyle(group2).rowGap);
      group2.style.setProperty("--together-size", Math.max(1, Math.min(560, availableWidth, availableHeight - chrome)) + "px");
    }
  }
  const cleanMotion = () => {
    motion?.cancel();
    motion = null;
    busy = false;
  };
  function countRound() {
    if (counted || !round?.state.board.some(Boolean)) return;
    counted = true;
    completedRound(roundKey);
  }
  function dismiss() {
    countRound();
    epoch++;
    cleanMotion();
    round = null;
    action = null;
    selected = null;
    confirm.close("cancel");
    result.close();
    screen.hidden = true;
    document.body.classList.remove("in-together");
    el("lobby-stage-host").inert = false;
    changed();
    el("show-together").focus({ preventScroll: true });
    returnToLobby();
  }
  function start() {
    epoch++;
    cleanMotion();
    confirm.close("cancel");
    result.close();
    round = createTogetherRound();
    roundKey = "together:" + crypto.randomUUID();
    counted = false;
    selected = null;
    ended = false;
    metricEnded = false;
    screen.hidden = false;
    document.body.classList.add("in-together");
    el("lobby-stage-host").inert = true;
    window.NcqMetrics?.levelStart("together", { round: roundKey });
    render();
    changed();
  }
  function ask(kind, side, callback) {
    if (!round || busy || paused) return;
    selected = null;
    action = callback;
    confirm.dataset.side = side;
    el("together-confirm-title").textContent = t("together" + kind + "Title");
    el("together-confirm-info").textContent = t("together" + kind + "Info");
    el("together-confirm-yes").textContent = t(kind === "Undo" ? "undoConfirm" : kind === "Resign" ? "togetherResign" : "leave");
    render();
    confirm.showModal();
  }
  function journeyState() {
    if (!screen.hidden && round) return { mode: "together", state: round.state.winner !== null ? "result" : round.state.board.some(Boolean) ? "playing" : "first_turn" };
    return picker.open ? { mode: "ai", state: "select" } : null;
  }
  function render() {
    journeyChanged();
    for (const button of picker.querySelectorAll("[data-ai-group]")) button.setAttribute("aria-selected", String(Number(button.dataset.aiGroup) === group));
    const rankGrid = el("ai-rank-grid");
    if (rankGrid.dataset.group !== String(group)) {
      rankGrid.replaceChildren(...Array.from({ length: 9 }, (_, i) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aiLevel = group * 9 + i;
        return button;
      }));
      rankGrid.dataset.group = group;
    }
    for (const button of rankGrid.children) {
      const n = Number(button.dataset.aiLevel);
      button.textContent = rankName(n);
      button.setAttribute("aria-pressed", String(n === level));
    }
    el("ai-start").textContent = t("aiStart", { rank: rankName(level) });
    el("ai-start").disabled = !canOpen(true);
    const game = current(), used = game?.aiUndoCount ?? 0, cost = used === 0 ? t("aiFree") : t("aiCoins", { n: used === 1 ? 5 : 10 });
    el("ai-actions").hidden = game?.mode !== "ai" || game.phase !== "playing";
    el("ai-undo").textContent = undoUncertain ? t("aiUndoRetry") : used >= 3 ? t("aiUndoLimit") : t("aiUndo", { n: Math.max(0, 3 - used), cost });
    el("ai-undo").disabled = undoBusy || !game || !undoUncertain && (game.phase !== "playing" || used >= 3 || !game.moves.length || !game.moves.some((_, i) => game.moveSeats?.[i] === game.you));
    if (undoDialog.open) {
      el("ai-undo-cost").textContent = undoUncertain ? t("aiUndoRetry") : t("aiUndoPay", { cost });
      undoDialog.querySelector('[value="cancel"]').disabled = undoBusy || undoUncertain;
      if (!undoUncertain && !undoBusy && (!game || game.code !== undoTarget?.code || game.phase !== "playing")) undoDialog.close("cancel");
    }
    if (!round) return;
    const state = round.state;
    appearance(surface);
    for (const [index, cell] of cells.entries()) {
      const value = state.board[index] || (index === selected ? state.turn : 0);
      cell.dataset.stone = state.board[index];
      const stone = cell.querySelector(".stone");
      stone.hidden = !value;
      stone.className = "stone " + (value === 1 ? "black" : "white");
      cell.classList.toggle("selected", index === selected);
      cell.classList.toggle("win", state.line.includes(index));
      const foul = !state.board[index] && state.turn === 1 ? forbiddenAt(state.board, index, "renju") : null;
      if (foul) cell.dataset.foul = { renjuDoubleThree: "33", renjuDoubleFour: "44", renjuOverline: "6+" }[foul];
      else delete cell.dataset.foul;
      cell.disabled = busy || paused || state.winner !== null || !!state.board[index];
      cell.setAttribute("aria-label", `${index % 15 + 1}, ${Math.floor(index / 15) + 1}`);
    }
    for (const side of [1, 2]) {
      const panel = screen.querySelector(`[data-together-side="${side}"]`), active = state.winner === null && state.turn === side;
      panel.toggleAttribute("data-active", active);
      panel.querySelector("strong").textContent = sideName(side);
      const undo = panel.querySelector("[data-tg-undo]");
      undo.textContent = t("togetherUndo", { n: round.remaining(side) });
      undo.disabled = busy || paused || !round.canUndo(side);
      const place = panel.querySelector("[data-tg-place]");
      place.textContent = t(selected === null ? "togetherSelect" : "togetherPlace");
      place.disabled = busy || paused || !active || selected === null;
      panel.querySelector("[data-tg-pass]").disabled = panel.querySelector("[data-tg-resign]").disabled = busy || paused || !active;
    }
    fitTogether();
    if (state.winner !== null && !metricEnded) {
      countRound();
      metricEnded = true;
      window.NcqMetrics?.levelEnd("together", state.winner ? true : void 0);
    }
    if (state.winner !== null && !ended && !busy && !paused && !document.hidden) {
      ended = true;
      el("together-result-title").textContent = state.winner ? t("togetherWinner", { side: sideName(state.winner) }) : t("togetherDraw");
      result.showModal();
      haptics?.once("together-result:" + epoch, "success");
    }
  }
  async function play(input) {
    if (!round || busy || paused) return;
    const next = round.play(input);
    if (next.error) return;
    selected = null;
    busy = input.type === "move";
    render();
    if (input.type === "move") {
      busy = true;
      render();
      const token = epoch;
      motion = animateStonePlacement(cells[input.index], null, { duration: 80, onStart: () => sound(), shouldContinue: () => token === epoch && !document.hidden });
      await motion.finished;
      if (token !== epoch) return;
      motion = null;
      busy = false;
      if (!paused) haptics?.once("together-move:" + epoch + ":" + round.actions.length, "medium");
      render();
    }
  }
  el("show-together").addEventListener("click", () => {
    if (canOpen()) start();
  });
  el("show-ai").addEventListener("click", () => {
    if (canOpen()) {
      render();
      picker.showModal();
      changed();
    }
  });
  picker.addEventListener("close", changed);
  picker.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-ai-group]"), choice = e.target.closest("[data-ai-level]");
    if (tab) group = Number(tab.dataset.aiGroup);
    if (choice) level = Number(choice.dataset.aiLevel);
    render();
  });
  el("ai-start").addEventListener("click", () => {
    if (canOpen(true)) {
      picker.close();
      void startAi(level);
    }
  });
  el("ai-undo").addEventListener("click", () => {
    const game = current();
    if (!game || game.mode !== "ai") return;
    undoTarget ??= { code: game.code, round: game.round, version: game.version, requestId: crypto.randomUUID() };
    el("ai-undo-error").textContent = "";
    render();
    undoEpoch++;
    undoDialog.showModal();
  });
  undoDialog.querySelector("form").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "undo") {
      if (undoBusy || undoUncertain) e.preventDefault();
      else undoTarget = null;
      return;
    }
    if (undoBusy) {
      e.preventDefault();
      return;
    }
    if (!undoUncertain && undoTarget && current()?.code === undoTarget.code) undoTarget.version = current().version;
    e.preventDefault();
    const token = ++undoEpoch, target = undoTarget;
    const button = el("ai-undo-cost");
    button.disabled = true;
    undoBusy = true;
    render();
    try {
      const response = await undoAi(target);
      if (token === undoEpoch && undoDialog.open && target === undoTarget) {
        if (!response?.error) {
          undoUncertain = false;
          undoTarget = null;
          undoDialog.close("done");
        } else {
          undoUncertain = response.error === "network";
          el("ai-undo-error").textContent = t(undoUncertain ? "aiUndoUnknown" : response.error);
          if (!undoUncertain) undoTarget = null;
        }
      }
    } finally {
      undoBusy = false;
      button.disabled = false;
      changed();
    }
  });
  undoDialog.addEventListener("cancel", (e) => {
    if (undoBusy || undoUncertain) e.preventDefault();
  });
  undoDialog.addEventListener("close", () => {
    if (!undoDialog.open) {
      undoEpoch++;
      if (!el("ai-undo-error").textContent) undoTarget = null;
    }
  });
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || cell.disabled || !round || confirm.open) return;
    if (cell.dataset.foul) {
      haptics?.tap();
      return;
    }
    selected = Number(cell.dataset.index);
    render();
    haptics?.tap();
  });
  screen.addEventListener("click", (e) => {
    const panel = e.target.closest("[data-together-side]"), side = Number(panel?.dataset.togetherSide);
    if (e.target.closest("[data-tg-place]") && side === round?.state.turn && selected !== null) void play({ type: "move", index: selected });
    if (e.target.closest("[data-tg-undo]") && round?.canUndo(side)) ask("Undo", side, () => {
      round.undo(side);
      render();
    });
    if (e.target.closest("[data-tg-pass]") && side === round?.state.turn) void play({ type: "pass" });
    if (e.target.closest("[data-tg-resign]") && side === round?.state.turn) ask("Resign", side, () => {
      round.resign(side);
      render();
    });
  });
  el("together-leave").addEventListener("click", () => ask("Leave", 1, dismiss));
  el("together-settings").addEventListener("click", settings);
  confirm.querySelector("form").addEventListener("submit", (e) => {
    const next = action;
    action = null;
    if (e.submitter?.value === "yes") {
      confirm.close();
      next?.();
    }
  });
  el("together-again").addEventListener("click", start);
  el("together-done").addEventListener("click", dismiss);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cleanMotion();
    if (round) render();
  });
  window.addEventListener("resize", fitTogether);
  window.NcqSafe?.onChange(fitTogether);
  window.addEventListener("ncq-kakao-pause", () => {
    paused = true;
    cleanMotion();
    if (round) render();
  });
  window.addEventListener("ncq-kakao-resume", () => {
    paused = false;
    if (round) render();
  });
  return {
    render,
    journeyState,
    isOpen: opened,
    undoBlocked: () => undoBusy || undoUncertain,
    backModal() {
      const own = [undoDialog, confirm, picker, result], focused = document.activeElement?.closest("dialog[open]");
      if (focused && !own.includes(focused)) return false;
      const dialog = own.find((node) => node.open);
      if (!dialog) return false;
      if (dialog !== undoDialog || !undoBusy && !undoUncertain) dialog.close("cancel");
      return true;
    },
    back() {
      if (!round) return false;
      if (round.state.winner !== null) dismiss();
      else ask("Leave", 1, dismiss);
      return true;
    }
  };
}
export {
  createGameModes
};
