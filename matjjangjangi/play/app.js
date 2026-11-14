// game/rules.js
var KING = 1;
var GUARD = 2;
var ROOK = 3;
var CANNON = 4;
var HORSE = 5;
var ELEPHANT = 6;
var SOLDIER = 7;
var VALUES = [0, 0, 3, 13, 7, 5, 3, 2];
var GLYPHS = { 1: ["\u695A", "\u58EB", "\u8ECA", "\u5305", "\u99AC", "\u8C61", "\u5352"], 2: ["\u6F22", "\u58EB", "\u8ECA", "\u5305", "\u99AC", "\u8C61", "\u5175"] };
var sideOf = (piece) => piece > 0 ? 1 : piece < 0 ? 2 : 0;
var index = (x, y) => y * 9 + x;
var inside = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 10;
var orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var palaceLines = [
  [index(3, 0), index(4, 1), index(5, 2)],
  [index(5, 0), index(4, 1), index(3, 2)],
  [index(3, 7), index(4, 8), index(5, 9)],
  [index(5, 7), index(4, 8), index(3, 9)]
];
var palace = (x, y, side) => x >= 3 && x <= 5 && (side === 1 ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
var diagonalNeighbors = (from) => palaceLines.flatMap((line) => {
  const at = line.indexOf(from);
  return at < 0 ? [] : [line[at - 1], line[at + 1]].filter((p) => p !== void 0);
});
function initial({ choFormation = 0, hanFormation = 0 } = {}) {
  if (![choFormation, hanFormation].every((n) => Number.isInteger(n) && n >= 0 && n < 4)) throw new Error("invalidFormation");
  const board2 = Array(90).fill(0);
  for (const side of [1, 2]) {
    const sign = side === 1 ? 1 : -1;
    const home = side === 1 ? 9 : 0;
    const formation = side === 1 ? choFormation : hanFormation;
    const back = [ROOK, HORSE, ELEPHANT, GUARD, 0, GUARD, ELEPHANT, HORSE, ROOK];
    if (formation & 1) [back[1], back[2]] = [back[2], back[1]];
    if (formation & 2) [back[6], back[7]] = [back[7], back[6]];
    for (let x = 0; x < 9; x++) board2[index(side === 1 ? x : 8 - x, home)] = back[x] * sign;
    board2[index(4, side === 1 ? 8 : 1)] = KING * sign;
    for (const x of [1, 7]) board2[index(x, side === 1 ? 7 : 2)] = CANNON * sign;
    for (const x of [0, 2, 4, 6, 8]) board2[index(x, side === 1 ? 6 : 3)] = SOLDIER * sign;
  }
  const state = { board: board2, turn: 1, winner: null, reason: null, ply: 0, passes: 0, quiet: 0, bikjang: false, last: null, positions: {} };
  state.positions[positionKey(state)] = 1;
  return state;
}
function pseudoMoves(board2, from) {
  const piece = board2[from], side = sideOf(piece), kind = Math.abs(piece);
  if (!side) return [];
  const x = from % 9, y = Math.floor(from / 9), result = [];
  const add = (to) => {
    if (sideOf(board2[to]) !== side) result.push(to);
  };
  const step = (nx, ny) => {
    if (inside(nx, ny)) add(index(nx, ny));
  };
  if (kind === KING || kind === GUARD) {
    for (const [dx, dy] of orthogonal) if (palace(x + dx, y + dy, side)) step(x + dx, y + dy);
    for (const to of diagonalNeighbors(from)) if (palace(to % 9, Math.floor(to / 9), side)) add(to);
  } else if (kind === SOLDIER) {
    const forward = side === 1 ? -1 : 1;
    step(x - 1, y);
    step(x + 1, y);
    step(x, y + forward);
    for (const to of diagonalNeighbors(from)) if (Math.floor(to / 9) === y + forward) add(to);
  } else if (kind === HORSE || kind === ELEPHANT) {
    for (const [dx, dy] of orthogonal) {
      const firstX = x + dx, firstY = y + dy;
      if (!inside(firstX, firstY) || board2[index(firstX, firstY)]) continue;
      for (const wing of [-1, 1]) {
        const sx = dx || wing, sy = dy || wing;
        const middleX = firstX + sx, middleY = firstY + sy;
        if (kind === HORSE) step(middleX, middleY);
        else if (inside(middleX, middleY) && !board2[index(middleX, middleY)]) step(middleX + sx, middleY + sy);
      }
    }
  } else if (kind === ROOK || kind === CANNON) {
    const scan = (ray) => {
      let screened = kind === ROOK;
      for (const to of ray) {
        const target = board2[to];
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
      scan(line.slice(at + 1));
      scan(line.slice(0, at).reverse());
    }
  }
  return [...new Set(result)];
}
function inCheck(board2, side) {
  const king = board2.indexOf(side === 1 ? KING : -KING);
  if (king === -1) return true;
  for (let from = 0; from < 90; from++) if (sideOf(board2[from]) === 3 - side && pseudoMoves(board2, from).includes(king)) return true;
  return false;
}
function legalMoves(board2, side) {
  const result = [];
  for (let from = 0; from < 90; from++) {
    if (sideOf(board2[from]) !== side) continue;
    for (const to of pseudoMoves(board2, from)) {
      if (Math.abs(board2[to]) === KING) continue;
      const next = board2.slice();
      next[to] = next[from];
      next[from] = 0;
      if (!inCheck(next, side)) result.push({ type: "move", from, to });
    }
  }
  return result;
}
function facing(board2) {
  const cho = board2.indexOf(KING), han = board2.indexOf(-KING);
  if (cho < 0 || han < 0 || cho % 9 !== han % 9) return false;
  for (let p = Math.min(cho, han) + 9; p < Math.max(cho, han); p += 9) if (board2[p]) return false;
  return true;
}
var positionKey = ({ board: board2, turn }) => board2.join(",") + ":" + turn;
function material(board2) {
  const points = { 1: 0, 2: 1.5 };
  for (const piece of board2) if (piece) points[sideOf(piece)] += VALUES[Math.abs(piece)];
  return points;
}
function apply(state, action) {
  if (state.winner !== null) throw new Error("gameOver");
  const side = state.turn;
  if (!action || typeof action !== "object") throw new Error("invalidMove");
  const next = { ...state, board: state.board.slice(), positions: { ...state.positions }, last: { ...action, side }, ply: state.ply + 1 };
  if (action.type === "resign") return { ...next, winner: 3 - side, reason: "resign" };
  if (action.type === "pass" || action.type === "accept-bikjang") {
    if (inCheck(state.board, side)) throw new Error("mustEscapeCheck");
    if (action.type === "accept-bikjang" && !state.bikjang) throw new Error("invalidMove");
    next.passes = state.passes + 1;
    next.quiet = state.quiet + 1;
  } else if (action.type === "move") {
    if (!Number.isInteger(action.from) || !Number.isInteger(action.to) || action.from < 0 || action.from >= 90 || action.to < 0 || action.to >= 90) throw new Error("invalidMove");
    if (sideOf(state.board[action.from]) !== side) throw new Error("notYourPiece");
    if (!legalMoves(state.board, side).some((m) => m.from === action.from && m.to === action.to)) throw new Error(inCheck(state.board, side) ? "mustEscapeCheck" : "invalidMove");
    next.last.piece = state.board[action.from];
    next.last.captured = state.board[action.to];
    next.quiet = state.board[action.to] ? 0 : state.quiet + 1;
    next.board[action.to] = next.board[action.from];
    next.board[action.from] = 0;
    next.passes = 0;
  } else throw new Error("invalidMove");
  next.turn = 3 - side;
  const checked = inCheck(next.board, next.turn);
  if (checked && !legalMoves(next.board, next.turn).length) return { ...next, winner: side, reason: "checkmate", bikjang: false };
  const stillFacing = facing(next.board);
  if (state.bikjang && stillFacing && !inCheck(next.board, side)) return { ...next, winner: 0, reason: "bikjang", bikjang: false };
  next.bikjang = stillFacing && !checked;
  if (next.passes >= 2) return { ...next, winner: 0, reason: "passes" };
  const key = positionKey(next);
  next.positions[key] = (next.positions[key] || 0) + 1;
  if (next.positions[key] >= 3) return { ...next, winner: 0, reason: "repetition" };
  if (next.quiet >= 100) return { ...next, winner: 0, reason: "quiet" };
  return next;
}

// game/piece-skins.js
var PIECE_STYLES = Object.freeze(["reference", "classic", "glossy", "vintage", "gilded", "porcelain", "jade", "lacquer", "ocean", "soda", "quartz", "marble", "sapphire", "sakura", "aurora"]);
var DEFAULT_PIECE_STYLE = "reference";
var normalizePieceStyle = (style) => PIECE_STYLES.includes(style) ? style : DEFAULT_PIECE_STYLE;
function pieceStyleForSeat(game, seat, localStyle = DEFAULT_PIECE_STYLE) {
  if (seat !== 1 && seat !== 2) return DEFAULT_PIECE_STYLE;
  if (Array.isArray(game?.pieceStyles)) return normalizePieceStyle(game.pieceStyles[seat - 1]);
  return game?.you === seat && !game.sharedView ? normalizePieceStyle(localStyle) : DEFAULT_PIECE_STYLE;
}
function applyPreviewPieceStyles(preview, choice, game) {
  const own2 = game?.you === 2 ? 2 : 1;
  for (const cell of preview.querySelectorAll(".cell")) {
    const seat = Number(cell.dataset.stone);
    cell.dataset.stoneStyle = seat === own2 ? normalizePieceStyle(choice) : pieceStyleForSeat(game, seat);
    const index2 = Number(cell.dataset.index);
    if (Number.isInteger(index2)) {
      const point = own2 === 2 ? 89 - index2 : index2;
      cell.style.gridArea = `${Math.floor(point / 9) + 1} / ${point % 9 + 1}`;
    }
  }
}

// game/bikjang.js
var isBikjangDraw = (game) => !game?.winner && (game?.endReason ?? game?.reason ?? game?.recordDetail?.state?.endReason) === "bikjang";
function endsInBikjangDraw(game, action) {
  if (!game?.bikjang || game.phase !== "playing" || game.setup) return false;
  try {
    const next = apply(
      { ...game, winner: null, positions: {}, passes: 0 },
      action.type === "move" ? { ...action, to: action.to ?? action.index } : action
    );
    return next.winner === 0 && next.reason === "bikjang";
  } catch {
    return false;
  }
}
function bikjangGeometry(board2, flipped = false) {
  if (!facing(board2)) return null;
  const kings = [board2.indexOf(KING), board2.indexOf(-KING)];
  const points = kings.map((index2) => {
    const visible = flipped ? 89 - index2 : index2;
    return [visible % 9 + 0.5, Math.floor(visible / 9) + 0.5];
  });
  return { kings, path: `M${points[0].join(" ")}L${points[1].join(" ")}` };
}

// game/piece-glyph.js
function setPieceGlyph(stone, text) {
  let glyph = stone.firstElementChild;
  if (!glyph?.classList.contains("jangi-glyph")) {
    glyph = document.createElement("span");
    glyph.className = "jangi-glyph";
    stone.replaceChildren(glyph);
  }
  glyph.textContent = text;
}

// game/jangi-view.js
var destination = (move) => typeof move === "object" ? move.to : move;
function replayBoard(game, ply) {
  const board2 = initial({ choFormation: game.formations?.[0] ?? 0, hanFormation: game.formations?.[1] ?? 0 }).board;
  for (const move of game.moves.slice(0, ply)) {
    if (!move || typeof move !== "object" || !Number.isInteger(move.from) || !Number.isInteger(move.to)) continue;
    board2[move.to] = board2[move.from];
    board2[move.from] = 0;
  }
  return board2;
}
var targetsFrom = (game, from) => game?.board && from !== null && !game.setup ? legalMoves(game.board, game.turn).filter((move) => move.from === from).map((move) => move.to) : [];
function drawJangiBoard({ game, displayedBoard, cells: cells2, selectedFrom: selectedFrom2, selected: selected2, lastMoveMarker: lastMoveMarker2, board: board2, selectable, coordinate: coordinate2, t: t3, latest, moveNumbers, pendingMove, localPieceStyle }) {
  const targets = selectable ? targetsFrom(game, selectedFrom2) : [];
  const checked = inCheck(displayedBoard, game.turn);
  const flipped = game.you === 2;
  const bikjang = !game.setup && (latest ? game.bikjang || isBikjangDraw(game) : true) ? bikjangGeometry(displayedBoard, flipped) : null;
  let line = board2.querySelector(".jangi-bikjang-line");
  if (!line) {
    line = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    line.setAttribute("class", "jangi-bikjang-line");
    line.setAttribute("viewBox", "0 0 9 10");
    line.setAttribute("preserveAspectRatio", "none");
    line.setAttribute("aria-hidden", "true");
    line.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    board2.querySelector(".board-grid").append(line);
  }
  line.style.display = bikjang ? "" : "none";
  if (bikjang) line.firstElementChild.setAttribute("d", bikjang.path);
  board2.dataset.jangi = "";
  board2.classList.toggle("selectable", selectable);
  const move = game.moves[(latest ? game.moves.length : game.displayPly) - 1];
  const last = pendingMove?.index ?? destination(move), lastCell = cells2[last];
  lastMoveMarker2.toggleAttribute("hidden", !lastCell);
  if (lastCell && lastMoveMarker2.parentElement !== lastCell) lastCell.append(lastMoveMarker2);
  for (const [index2, cell] of cells2.entries()) {
    const piece = displayedBoard[index2] || 0, side = sideOf(piece), kind = Math.abs(piece);
    const chosen = selectable && selectedFrom2 === index2;
    const target = selectable && selected2 === index2;
    cell.dataset.stone = side;
    cell.dataset.kind = kind;
    cell.style.order = flipped ? 89 - index2 : index2;
    cell.classList.toggle("selected-piece", chosen);
    cell.classList.toggle("selected", target);
    cell.classList.toggle("jangi-legal", targets.includes(index2));
    cell.classList.toggle("jangi-check", kind === KING && side === game.turn && checked);
    cell.classList.toggle("jangi-bikjang", Boolean(bikjang?.kings.includes(index2)));
    const token = cell.firstElementChild;
    const preview = target && !piece ? displayedBoard[selectedFrom2] : piece;
    cell.dataset.stoneStyle = pieceStyleForSeat(game, sideOf(preview), localPieceStyle);
    token.hidden = !preview;
    token.dataset.kind = Math.abs(preview);
    token.className = "stone " + (sideOf(preview) === 2 ? "white" : "black");
    setPieceGlyph(token, preview ? GLYPHS[sideOf(preview)][Math.abs(preview) - 1] : "");
    cell.toggleAttribute("data-number", Boolean(moveNumbers?.[index2]));
    if (moveNumbers?.[index2]) cell.dataset.number = moveNumbers[index2];
    cell.setAttribute("aria-label", coordinate2(index2) + " " + (piece ? t3(side === 1 ? "black" : "white") + " " + GLYPHS[side][kind - 1] : t3("jangiEmpty")));
    cell.setAttribute("aria-selected", String(chosen || target));
    cell.setAttribute("aria-disabled", String(!selectable || side !== game.you && !targets.includes(index2)));
  }
}
function jangiGridPath() {
  const parts = [];
  for (let x = 0; x < 9; x++) parts.push(`M${x + 0.5} .5V9.5`);
  for (let y = 0; y < 10; y++) parts.push(`M.5 ${y + 0.5}H8.5`);
  parts.push("M3.5 .5 5.5 2.5M5.5 .5 3.5 2.5M3.5 7.5 5.5 9.5M5.5 7.5 3.5 9.5");
  return parts.join(" ");
}
function installJangiArtwork() {
  document.getElementById("board-line-path").setAttribute("d", jangiGridPath());
  for (const svg of document.querySelectorAll("svg.board-lines")) svg.setAttribute("viewBox", "0 0 9 10");
  const image = document.querySelector(".lobby-board-image");
  image.src = "./assets/jangi-lobby-hero.png";
  for (const image2 of document.querySelectorAll(".logo-stones image,.start-stones image")) image2.setAttribute("href", "./assets/jangi-pair.svg");
  const preview = document.querySelector(".appearance-preview-grid");
  if (preview) {
    for (const cell of preview.querySelectorAll(".cell")) cell.remove();
    for (const [index2, piece] of initial().board.entries()) {
      if (!piece) continue;
      const cell = document.createElement("span");
      cell.className = "cell";
      cell.dataset.stone = sideOf(piece);
      cell.dataset.index = index2;
      cell.style.gridArea = `${Math.floor(index2 / 9) + 1} / ${index2 % 9 + 1}`;
      const token = document.createElement("span");
      token.className = "stone " + (piece > 0 ? "black" : "white");
      token.dataset.kind = Math.abs(piece);
      setPieceGlyph(token, GLYPHS[sideOf(piece)][Math.abs(piece) - 1]);
      const shadow = document.createElement("span");
      shadow.className = "stone-shadow";
      cell.append(token, shadow);
      preview.append(cell);
    }
  }
  for (const span of document.querySelectorAll(".shop-preview-stone")) span.classList.add("jangi-piece-sample");
}

// game/jangi-texts.js
var JANGI_TEXTS = {
  ko: {
    title: "\uB9DE\uC9F1 \uC7A5\uAE30",
    black: "\uCD08",
    white: "\uD55C",
    blackSquare: "{cell} \uCD08 \uAE30\uBB3C",
    whiteSquare: "{cell} \uD55C \uAE30\uBB3C",
    ruleJangi: "\uC7A5\uAE30",
    ruleRenju: "\uC7A5\uAE30",
    ruleFree: "\uC7A5\uAE30",
    ruleTaraguchi: "\uC7A5\uAE30",
    ruleTaraguchiShort: "\uC7A5\uAE30",
    ruleRenjuHelp: "\uAD81\uC744 \uC9C0\uD0A4\uBA70 \uC0C1\uB300 \uAD81\uC744 \uC678\uD1B5\uC218\uB85C \uBAB0\uBA74 \uC774\uAE41\uB2C8\uB2E4.",
    ruleFreeHelp: "\uAD81\uC744 \uC9C0\uD0A4\uBA70 \uC0C1\uB300 \uAD81\uC744 \uC678\uD1B5\uC218\uB85C \uBAB0\uBA74 \uC774\uAE41\uB2C8\uB2E4.",
    selectStone: "\uB9D0\uC744 \uACE0\uB978 \uB4A4 \uC774\uB3D9\uD560 \uC704\uCE58\uB97C \uB204\uB974\uBA74 \uBC14\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.",
    placeSelectHint: "\uC774\uB3D9\uD560 \uB9D0 \uC120\uD0DD",
    placeReadyHint: "\uC774\uB3D9\uD560 \uACF3 \uC120\uD0DD",
    jangiSelectPiece: "\uC774\uB3D9\uD560 \uB9D0 \uC120\uD0DD",
    jangiSelectTarget: "\uC774\uB3D9\uD560 \uACF3 \uC120\uD0DD",
    jangiMoveSaving: "\uCC29\uC218 \uD655\uC778 \uC911",
    jangiMaterialPoints: "{points}\uC810",
    jangiMaterialLabel: "\uB0A8\uC740 \uAE30\uBB3C \uC810\uC218 {points}\uC810",
    jangiOwnTurn: "\uB0B4 \uCC28\uB840",
    jangiOpponentTurn: "\uC0C1\uB300 \uCC28\uB840",
    jangiOwnGauge: "\uB0B4 \uB0A8\uC740 \uC2DC\uAC04",
    jangiOpponentGauge: "\uC0C1\uB300 \uB0A8\uC740 \uC2DC\uAC04",
    jangiClockUpdating: "\uB300\uAD6D \uC2DC\uAC04\uC744 \uD655\uC778\uD558\uACE0 \uC788\uC5B4\uC694.",
    shopStones: "\uC7A5\uAE30\uB9D0",
    shopBoard: "\uC7A5\uAE30\uD310",
    recordPlayGame: "\uC7A5\uAE30 \uB450\uB7EC \uAC00\uAE30",
    shopPreviewGuide: "\uB0B4 \uB9D0\uC5D0\uB9CC \uC801\uC6A9\uB3FC\uC694. \uC0C1\uB300 \uB9D0\uC740 \uC0C1\uB300\uAC00 \uACE0\uB978 \uC2A4\uD0A8\uC73C\uB85C \uBCF4\uC5EC\uC694.",
    jangiEmpty: "\uBE48 \uC790\uB9AC",
    jangiCheck: "\uC7A5\uAD70! \uAD81\uC744 \uC9C0\uD0A4\uB294 \uC218\uB97C \uB450\uC138\uC694.",
    jangiBikjang: "\uBE45\uC7A5! \uAD81\uC774 \uC11C\uB85C \uB9C8\uC8FC \uBCF4\uACE0 \uC788\uC5B4\uC694.",
    jangiBikjangCall: "\uBE45\uC7A5!",
    jangiBikjangGuide: "\uAD81\uC744 \uC62E\uAE30\uAC70\uB098 \uC0AC\uC774\uB97C \uB9C9\uC73C\uC138\uC694. \uADF8\uB300\uB85C \uB450\uBA74 \uBB34\uC2B9\uBD80\uC785\uB2C8\uB2E4.",
    jangiBikjangWaiting: "\uC0C1\uB300\uAC00 \uBE45\uC7A5\uC744 \uD574\uC18C\uD558\uC9C0 \uC54A\uC73C\uBA74 \uBB34\uC2B9\uBD80\uAC00 \uB429\uB2C8\uB2E4.",
    jangiBikjangWatch: "\uB2E4\uC74C \uC218\uC5D0\uB3C4 \uAD81\uC774 \uB9C8\uC8FC \uBCF4\uBA74 \uBE45\uC7A5 \uBB34\uC2B9\uBD80\uC785\uB2C8\uB2E4.",
    jangiBikjangConfirmTitle: "\uBE45\uC7A5 \uBB34\uC2B9\uBD80\uB85C \uB05D\uB0BC\uAE4C\uC694?",
    jangiBikjangConfirmMessage: "\uC774 \uC218\uB97C \uB450\uBA74 \uAD81\uC774 \uB9C8\uC8FC \uBCF4\uB294 \uC0C1\uD0DC\uAC00 \uC720\uC9C0\uB418\uC5B4 \uBB34\uC2B9\uBD80\uB85C \uB300\uAD6D\uC774 \uB05D\uB0A9\uB2C8\uB2E4.",
    jangiBikjangClockNotice: "\uD655\uC778 \uC911\uC5D0\uB3C4 \uB300\uAD6D \uC2DC\uAC04\uC740 \uACC4\uC18D \uD758\uB7EC\uC694.",
    jangiBikjangContinue: "\uB2E4\uB978 \uC218 \uB450\uAE30",
    jangiBikjangAccept: "\uBB34\uC2B9\uBD80\uB85C \uB05D\uB0B4\uAE30",
    jangiBikjangDraw: "\uBE45\uC7A5 \uBB34\uC2B9\uBD80",
    jangiBikjangDrawReason: "\uB450 \uAD81\uC774 \uB9C8\uC8FC \uBCF4\uB294 \uC0C1\uD0DC\uAC00 \uB2E4\uC74C \uC218\uC5D0\uB3C4 \uC720\uC9C0\uB418\uC5B4 \uBB34\uC2B9\uBD80\uB85C \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.",
    jangiFormation: "\uB9C8\uC0C1 \uD3EC\uC9C4 \uC120\uD0DD",
    jangiFormationWait: "\uC0C1\uB300\uAC00 \uB9C8\uC0C1 \uCC28\uB9BC\uC744 \uACE0\uB974\uACE0 \uC788\uC5B4\uC694.",
    jangiFormationChoose: "\uB0B4 \uB9C8\uC0C1 \uCC28\uB9BC\uC744 \uACE0\uB974\uC138\uC694.",
    jangiFormationActive: "\uCC28\uB9BC \uC120\uD0DD",
    jangiFormationWaiting: "\uCC28\uB9BC \uB300\uAE30",
    jangiFormationStatus: "\uB9C8\uC0C1 \uCC28\uB9BC \xB7 \uCCAB \uCC29\uC218\uB294 \uCD08",
    jangiFormation0: "\uB9C8\xB7\uC0C1 / \uC0C1\xB7\uB9C8",
    jangiFormation1: "\uC0C1\xB7\uB9C8 / \uC0C1\xB7\uB9C8",
    jangiFormation2: "\uB9C8\xB7\uC0C1 / \uB9C8\xB7\uC0C1",
    jangiFormation3: "\uC0C1\xB7\uB9C8 / \uB9C8\xB7\uC0C1",
    jangiFormationConfirm: "\uD3EC\uC9C4 \uD655\uC815",
    jangiFormationHint: "20\uCD08 \uD6C4 \uAE30\uBCF8 \uD3EC\uC9C4\uC73C\uB85C \uC790\uB3D9 \uD655\uC815\uB3FC\uC694. \uBC30\uCE58\uB294 \uB0B4 \uC2DC\uC810\uC774\uBA70, \uC591\uCABD\uC774 \uACE0\uB974\uBA74 \uCD08\uBD80\uD130 \uC2DC\uC791\uD574\uC694.",
    jangiOpponentFormation: "\uC0C1\uB300({side}) \uD3EC\uC9C4",
    jangiFormationNotChosen: "\uC120\uD0DD \uC804",
    jangiFormationChosen: "\uD655\uC815",
    jangiOpponentFormationPending: "\uC0C1\uB300\uAC00 \uC544\uC9C1 \uD3EC\uC9C4\uC744 \uC120\uD0DD\uD558\uC9C0 \uC54A\uC558\uC5B4\uC694.",
    jangiOpponentFormationSummary: "\uC0C1\uB300({side}) \uD655\uC815 \uD3EC\uC9C4: {pieces}",
    jangiHorse: "\uB9C8",
    jangiElephant: "\uC0C1",
    jangiFormationSaving: "\uD3EC\uC9C4 \uD655\uC815 \uC911\u2026",
    jangiClockRefills: "30\uCD08 \uCDA9\uC804 {count}\uD68C \uB0A8\uC74C",
    jangiFormationCountdown: "{seconds}\uCD08",
    jangiFormationHintLegacy: "\uB0B4\uAC00 \uD310\uC744 \uBCF4\uB294 \uBC29\uD5A5\uC758 \uBC30\uCE58\uC608\uC694. \uC591\uCABD\uC774 \uD3EC\uC9C4\uC744 \uACE0\uB974\uBA74 \uCD08\uBD80\uD130 \uC2DC\uC791\uD574\uC694.",
    mustEscapeCheck: "\uC7A5\uAD70\uC744 \uBA3C\uC800 \uD53C\uD574\uC57C \uD574\uC694.",
    invalidMove: "\uADF8\uACF3\uC73C\uB85C\uB294 \uC774\uB3D9\uD560 \uC218 \uC5C6\uC5B4\uC694.",
    notYourPiece: "\uB0B4 \uAE30\uBB3C\uC744 \uACE8\uB77C \uC8FC\uC138\uC694."
  },
  en: {
    title: "Janggi Duel",
    black: "Cho",
    white: "Han",
    blackSquare: "{cell}, Cho piece",
    whiteSquare: "{cell}, Han piece",
    ruleJangi: "Janggi",
    ruleRenju: "Janggi",
    ruleFree: "Janggi",
    ruleTaraguchi: "Janggi",
    ruleTaraguchiShort: "Janggi",
    ruleRenjuHelp: "Protect your general and checkmate your opponent.",
    ruleFreeHelp: "Protect your general and checkmate your opponent.",
    selectStone: "Select your piece, then tap a destination to move immediately.",
    placeSelectHint: "Select a piece",
    placeReadyHint: "Tap a destination",
    jangiSelectPiece: "Select a piece",
    jangiSelectTarget: "Tap destination",
    jangiMoveSaving: "Confirming move",
    jangiMaterialPoints: "{points} pts",
    jangiMaterialLabel: "Remaining material: {points} points",
    jangiOwnTurn: "Your turn",
    jangiOpponentTurn: "Their turn",
    jangiOwnGauge: "Your remaining time",
    jangiOpponentGauge: "Opponent remaining time",
    jangiClockUpdating: "Updating the match clock\u2026",
    shopStones: "Pieces",
    shopBoard: "Janggi board",
    recordPlayGame: "Play Janggi",
    shopPreviewGuide: "Applies to your pieces. Your opponent uses their own skin.",
    jangiEmpty: "Empty point",
    jangiCheck: "Check! Protect your general.",
    jangiBikjang: "Bikjang! The generals are facing each other.",
    jangiBikjangCall: "Bikjang!",
    jangiBikjangGuide: "Move your general or block the line. Leaving it open ends the game in a draw.",
    jangiBikjangWaiting: "The game is drawn if your opponent leaves the generals facing each other.",
    jangiBikjangWatch: "If the generals still face after the next move, the game ends in a bikjang draw.",
    jangiBikjangConfirmTitle: "End in a bikjang draw?",
    jangiBikjangConfirmMessage: "This move leaves the generals facing each other and ends the game in a draw.",
    jangiBikjangClockNotice: "Your clock keeps running while you decide.",
    jangiBikjangContinue: "Choose another move",
    jangiBikjangAccept: "End in a draw",
    jangiBikjangDraw: "Bikjang draw",
    jangiBikjangDrawReason: "The generals remained facing each other after the reply, so the game ended in a draw.",
    jangiFormation: "Horse & elephant setup",
    jangiFormationWait: "Your opponent is choosing a formation.",
    jangiFormationChoose: "Choose your formation.",
    jangiFormationActive: "Choosing setup",
    jangiFormationWaiting: "Awaiting setup",
    jangiFormationStatus: "Setup \xB7 Cho moves first",
    jangiFormation0: "Horse\xB7Elephant / Elephant\xB7Horse",
    jangiFormation1: "Elephant\xB7Horse / Elephant\xB7Horse",
    jangiFormation2: "Horse\xB7Elephant / Horse\xB7Elephant",
    jangiFormation3: "Elephant\xB7Horse / Horse\xB7Elephant",
    jangiFormationConfirm: "Confirm formation",
    jangiFormationHint: "Choose within 20s or use the default. Shown from your view; Cho starts after both players choose.",
    jangiOpponentFormation: "Opponent ({side}) setup",
    jangiFormationNotChosen: "Not chosen",
    jangiFormationChosen: "Confirmed",
    jangiOpponentFormationPending: "Your opponent has not chosen a formation yet.",
    jangiOpponentFormationSummary: "Opponent ({side}) confirmed setup: {pieces}",
    jangiHorse: "Horse",
    jangiElephant: "Elephant",
    jangiFormationSaving: "Confirming\u2026",
    jangiClockRefills: "{count} automatic 30-second refills left",
    jangiFormationCountdown: "{seconds}s",
    jangiFormationHintLegacy: "Shown from your view. Cho starts after both players choose.",
    mustEscapeCheck: "You must escape check.",
    invalidMove: "That move is not legal.",
    notYourPiece: "Select your own piece."
  }
};

// game/formation-picker.js
function formationPieces(formation, opponent = false) {
  const board2 = initial({ choFormation: formation }).board;
  const pieces = [82, 83, 87, 88].map((index2) => board2[index2]);
  return opponent ? pieces.reverse() : pieces;
}
function confirmedFormation(game, seat) {
  const action = game?.actions?.findLast((action2) => action2.type === "formation" && action2.seat === seat);
  return Number.isInteger(action?.formation) && action.formation >= 0 && action.formation < 4 ? action.formation : null;
}
function drawPieces(element, kinds, seat, style) {
  element.dataset.stoneStyle = style;
  const key = `${seat}:${kinds?.join(",") ?? "pending"}`;
  if (element.dataset.pieces === key) return;
  element.dataset.pieces = key;
  element.replaceChildren(...(kinds ?? [null, null, null, null]).map((kind) => {
    const piece = document.createElement("span");
    piece.className = "jangi-formation-piece";
    if (kind === null) {
      piece.classList.add("pending");
      piece.textContent = "?";
    } else {
      const shadow = document.createElement("span");
      shadow.className = "jangi-formation-shadow";
      const face = document.createElement("span");
      face.className = `stone ${seat === 1 ? "black" : "white"}`;
      face.dataset.kind = kind;
      setPieceGlyph(face, GLYPHS[seat][kind - 1]);
      piece.append(shadow, face);
    }
    return piece;
  }));
}
function renderFormationPicker(dialog, game, { t: t3, busy: busy2 = false, localPieceStyle }) {
  dialog.querySelector(".jangi-formation-hint").textContent = t3(game.clock?.kind === "cumulative-v1" ? "jangiFormationHint" : "jangiFormationHintLegacy");
  const seat = game.you, opponent = 3 - seat, formation = confirmedFormation(game, opponent);
  const round = `${game.code}:${game.round}`;
  if (dialog.dataset.round !== round) {
    dialog.dataset.round = round;
    dialog.querySelector('[name="formation"][value="0"]').checked = true;
  }
  for (const option of dialog.querySelectorAll(".jangi-formation-choice")) {
    const input = option.querySelector("input");
    input.disabled = busy2;
    drawPieces(option.querySelector(".jangi-formation-pieces"), formationPieces(Number(input.value)), seat, pieceStyleForSeat(game, seat, localPieceStyle));
  }
  const preview = dialog.querySelector("#jangi-opponent-formation");
  preview.dataset.confirmed = String(formation !== null);
  preview.querySelector("strong").textContent = t3("jangiOpponentFormation", { side: t3(opponent === 1 ? "black" : "white") });
  preview.querySelector(".jangi-formation-state").textContent = t3(formation === null ? "jangiFormationNotChosen" : "jangiFormationChosen");
  drawPieces(preview.querySelector(".jangi-formation-pieces"), formation === null ? null : formationPieces(formation, true), opponent, pieceStyleForSeat(game, opponent, localPieceStyle));
  preview.setAttribute("aria-label", formation === null ? t3("jangiOpponentFormationPending") : t3("jangiOpponentFormationSummary", { side: t3(opponent === 1 ? "black" : "white"), pieces: formationPieces(formation, true).map((kind) => t3(kind === HORSE ? "jangiHorse" : "jangiElephant")).join(" \xB7 ") }));
  const confirm = dialog.querySelector('button[type="submit"]');
  confirm.disabled = busy2;
  confirm.textContent = t3(busy2 ? "jangiFormationSaving" : "jangiFormationConfirm");
}

// game/clock.js
var REFILL_MS = 3e4;
var isCumulativeClock = (game) => game?.clock?.kind === "cumulative-v1";
function clockStatus(game, serverNow) {
  if (!isCumulativeClock(game)) return null;
  const clock = game.clock, index2 = game.turn - 1;
  const remainingMs = [...clock.remainingMs], refills = [...clock.refills];
  if (game.setup) return {
    formation: true,
    remainingMs,
    refills,
    formationMs: Math.max(0, clock.deadline - serverNow),
    expired: serverNow >= clock.deadline
  };
  const used = serverNow >= clock.deadline ? Math.min(refills[index2], Math.floor((serverNow - clock.deadline) / REFILL_MS) + 1) : 0;
  const expired = serverNow >= clock.deadline + refills[index2] * REFILL_MS;
  refills[index2] -= used;
  remainingMs[index2] = Math.max(0, clock.deadline + used * REFILL_MS - serverNow);
  return {
    formation: false,
    remainingMs,
    refills,
    expired,
    periodMs: used ? REFILL_MS : clock.remainingMs[index2]
  };
}
function clockText(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1e3));
  return seconds > 30 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : String(seconds).padStart(2, "0");
}

// ncq/lang.js
var VERSION = 1;
var NAMES = {
  en: "English",
  ko: "\uD55C\uAD6D\uC5B4",
  ja: "\u65E5\u672C\u8A9E",
  "zh-Hans": "\u7B80\u4F53\u4E2D\u6587",
  "zh-Hant": "\u7E41\u9AD4\u4E2D\u6587",
  es: "Espa\xF1ol",
  fr: "Fran\xE7ais",
  de: "Deutsch",
  it: "Italiano",
  pt: "Portugu\xEAs",
  "pt-BR": "Portugu\xEAs (Brasil)",
  ru: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  th: "\u0E44\u0E17\u0E22",
  vi: "Ti\u1EBFng Vi\u1EC7t",
  tr: "T\xFCrk\xE7e",
  pl: "Polski",
  nl: "Nederlands",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  hi: "\u0939\u093F\u0928\u094D\u0926\u0940"
};
var ALIAS = {
  "zh-tw": "zh-hant",
  "zh-hk": "zh-hant",
  "zh-mo": "zh-hant",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans",
  "zh-my": "zh-hans",
  zh: "zh-hans"
};
var RTL = ["ar", "he", "fa", "ur"];
var texts = {};
var codes = [];
var fallback = "en";
var current = "en";
var storeKey = "ncq:lang";
var started = false;
var listeners = [];
var warned = {};
var plurals = {};
var own = (obj, key) => obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
var dev = () => typeof window !== "undefined" && !window.NCQ && !window.Capacitor;
function base(code) {
  return String(code).toLowerCase().split("-")[0];
}
function match(tag) {
  if (typeof tag !== "string" || !tag.trim()) return null;
  const parts = tag.trim().replace(/_/g, "-").toLowerCase().split("-");
  while (parts.length) {
    const want = parts.join("-");
    for (const name of [want, ALIAS[want]]) {
      if (!name) continue;
      for (const code of codes) if (code.toLowerCase() === name) return code;
    }
    parts.pop();
  }
  const b = base(tag.trim().replace(/_/g, "-"));
  if (b === "zh") return null;
  for (const code of codes) if (base(code) === b) return code;
  return null;
}
function deviceTags() {
  if (typeof navigator === "undefined" || !navigator) return [];
  const list2 = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  return Array.prototype.slice.call(list2);
}
function fromDevice() {
  for (const tag of deviceTags()) {
    const code = match(tag);
    if (code) return code;
  }
  return null;
}
function fromAddress() {
  try {
    const m = /[?&]lang=([A-Za-z_-]+)/.exec(String(location.search || ""));
    return m ? match(m[1]) : null;
  } catch (e) {
    return null;
  }
}
function fromStore() {
  try {
    return match(localStorage.getItem(storeKey));
  } catch (e) {
    return null;
  }
}
function store(code) {
  try {
    localStorage.setItem(storeKey, code);
  } catch (e) {
  }
}
function markDocument() {
  try {
    const root = document.documentElement;
    root.lang = current;
    root.dir = RTL.indexOf(base(current)) >= 0 ? "rtl" : "ltr";
  } catch (e) {
  }
}
function warn(key, code) {
  if (!dev() || warned[code + ":" + key]) return;
  warned[code + ":" + key] = true;
  try {
    console.warn("[NcqLang] '" + code + "' \uAE00\uC790 \uD45C\uC5D0 '" + key + "'\uAC00 \uC5C6\uC5B4\uC694");
  } catch (e) {
  }
}
function pluralForm(code, n) {
  try {
    if (typeof Intl !== "undefined" && Intl.PluralRules) {
      const rules = plurals[code] || (plurals[code] = new Intl.PluralRules(code));
      return rules.select(n);
    }
  } catch (e) {
  }
  return n === 1 ? "one" : "other";
}
function pick(forms, params, code) {
  let n = null;
  if (params && typeof params.n === "number") n = params.n;
  else if (params && typeof params.count === "number") n = params.count;
  if (n !== null) {
    if (n === 0 && own(forms, "zero")) return forms.zero;
    const form = pluralForm(code, n);
    if (own(forms, form)) return forms[form];
  }
  if (own(forms, "other")) return forms.other;
  if (own(forms, "one")) return forms.one;
  return "";
}
function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => own(params, name) ? String(params[name]) : whole);
}
function lookup(key) {
  if (own(texts[current], key)) return [current, texts[current][key]];
  if (current !== fallback) warn(key, current);
  if (own(texts[fallback], key)) return [fallback, texts[fallback][key]];
  for (const code of codes) if (own(texts[code], key)) return [code, texts[code][key]];
  warn(key, fallback);
  return null;
}
function t(key, params) {
  const found = lookup(String(key));
  if (!found) return String(key);
  let value = found[1];
  if (value !== null && typeof value === "object") value = pick(value, params, found[0]);
  return fill(String(value), params);
}
function has(key) {
  return own(texts[current], key) || own(texts[fallback], key);
}
function apply2(root) {
  let scope = root;
  try {
    if (!scope) scope = document;
    if (!scope || !scope.querySelectorAll) return;
  } catch (e) {
    return;
  }
  scope.querySelectorAll("[data-i18n]").forEach((el2) => {
    el2.textContent = t(el2.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-attr]").forEach((el2) => {
    String(el2.getAttribute("data-i18n-attr")).split(";").forEach((pair) => {
      const at = pair.indexOf(":");
      if (at < 1) return;
      const attr = pair.slice(0, at).trim();
      const key = pair.slice(at + 1).trim();
      if (attr && key) el2.setAttribute(attr, t(key));
    });
  });
}
function emit() {
  listeners.slice().forEach((fn) => {
    try {
      fn(current);
    } catch (e) {
      try {
        console.error(e);
      } catch (e2) {
      }
    }
  });
  try {
    window.dispatchEvent(new CustomEvent("ncq-lang", { detail: { lang: current } }));
  } catch (e) {
  }
  apply2();
}
function init(options) {
  const opts = options || {};
  texts = {};
  codes = [];
  const given = opts.texts && typeof opts.texts === "object" ? opts.texts : {};
  Object.keys(given).forEach((code) => {
    if (given[code] && typeof given[code] === "object") {
      texts[code] = given[code];
      codes.push(code);
    }
  });
  if (!codes.length) {
    texts = { en: {} };
    codes = ["en"];
  }
  fallback = own(texts, "en") ? "en" : codes[0];
  storeKey = (opts.id ? String(opts.id) : "ncq") + ":lang";
  current = fromAddress() || fromStore() || fromDevice() || fallback;
  started = true;
  markDocument();
  apply2();
  return current;
}
function set(code) {
  const next = match(code);
  if (!next) return false;
  store(next);
  if (next !== current) {
    current = next;
    markDocument();
    emit();
  }
  return true;
}
function onChange(fn) {
  if (typeof fn !== "function") return () => {
  };
  listeners.push(fn);
  return () => {
    const at = listeners.indexOf(fn);
    if (at >= 0) listeners.splice(at, 1);
  };
}
function nameOf(code) {
  if (own(NAMES, code)) return NAMES[code];
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const shown = new Intl.DisplayNames([code], { type: "language" }).of(code);
      if (shown) return shown.charAt(0).toUpperCase() + shown.slice(1);
    }
  } catch (e) {
  }
  return code;
}
function list() {
  return codes.map((code) => ({ code, name: nameOf(code), current: code === current }));
}
function num(value, options) {
  try {
    return new Intl.NumberFormat(current, options).format(value);
  } catch (e) {
    return String(value);
  }
}
function date(value, options) {
  try {
    return new Intl.DateTimeFormat(current, options).format(value);
  } catch (e) {
    return String(value);
  }
}
function missing() {
  const all = {};
  codes.forEach((code) => Object.keys(texts[code]).forEach((key) => {
    all[key] = true;
  }));
  const out = {};
  codes.forEach((code) => {
    const gaps = Object.keys(all).filter((key) => !own(texts[code], key));
    if (gaps.length) out[code] = gaps;
  });
  return out;
}
var NcqLang = {
  version: VERSION,
  init,
  t,
  has,
  set,
  onChange,
  list,
  apply: apply2,
  num,
  date,
  missing,
  get lang() {
    return current;
  },
  get fallback() {
    return fallback;
  },
  get ready() {
    return started;
  }
};
try {
  if (typeof window !== "undefined") window.NcqLang = NcqLang;
} catch (e) {
}

// ncq/board.js
var WebSocketFactory = class {
  /**
   * Static-only utility – prevent instantiation.
   */
  constructor() {
  }
  static detectEnvironment() {
    var _a;
    if (typeof WebSocket !== "undefined") {
      return { type: "native", wsConstructor: WebSocket };
    }
    const gt = globalThis;
    if (typeof globalThis !== "undefined" && typeof gt.WebSocket !== "undefined") {
      return { type: "native", wsConstructor: gt.WebSocket };
    }
    const gl = typeof global !== "undefined" ? global : void 0;
    if (gl && typeof gl.WebSocket !== "undefined") {
      return { type: "native", wsConstructor: gl.WebSocket };
    }
    if (typeof globalThis !== "undefined" && typeof gt.WebSocketPair !== "undefined" && typeof globalThis.WebSocket === "undefined") {
      return {
        type: "cloudflare",
        error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
        workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
      };
    }
    if (typeof globalThis !== "undefined" && gt.EdgeRuntime || typeof navigator !== "undefined" && ((_a = navigator.userAgent) === null || _a === void 0 ? void 0 : _a.includes("Vercel-Edge"))) {
      return {
        type: "unsupported",
        error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
        workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
      };
    }
    const _process = globalThis["process"];
    if (_process) {
      const processVersions = _process["versions"];
      if (processVersions && processVersions["node"]) {
        return {
          type: "unsupported",
          error: "Node.js detected but native WebSocket not found.",
          workaround: "Ensure you are running Node.js 22+ or provide a WebSocket implementation via the transport option."
        };
      }
    }
    return {
      type: "unsupported",
      error: "Unknown JavaScript runtime without WebSocket support.",
      workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
    };
  }
  /**
   * Returns the best available WebSocket constructor for the current runtime.
   *
   * @category Realtime
   *
   * @example Example with error handling
   * ```ts
   * try {
   *   const WS = WebSocketFactory.getWebSocketConstructor()
   *   const socket = new WS('wss://example.com/socket')
   * } catch (error) {
   *   console.error('WebSocket not available in this environment.', error)
   * }
   * ```
   */
  static getWebSocketConstructor() {
    const env = this.detectEnvironment();
    if (env.wsConstructor) {
      return env.wsConstructor;
    }
    let errorMessage = env.error || "WebSocket not supported in this environment.";
    if (env.workaround) {
      errorMessage += `

Suggested solution: ${env.workaround}`;
    }
    throw new Error(errorMessage);
  }
  /**
   * Detects whether the runtime can establish WebSocket connections.
   *
   * @category Realtime
   *
   * @example Example in a Node.js script
   * ```ts
   * if (!WebSocketFactory.isWebSocketSupported()) {
   *   console.error('WebSockets are required for this script.')
   *   process.exitCode = 1
   * }
   * ```
   */
  static isWebSocketSupported() {
    try {
      const env = this.detectEnvironment();
      return env.type === "native";
    } catch (_a) {
      return false;
    }
  }
};
var websocket_factory_default = WebSocketFactory;
var version = "2.119.0";
var DEFAULT_VERSION = `realtime-js/${version}`;
var VSN_1_0_0 = "1.0.0";
var VSN_2_0_0 = "2.0.0";
var DEFAULT_VSN = VSN_2_0_0;
var DEFAULT_TIMEOUT = 1e4;
var DEFAULT_POSTGRES_CHANGES_WAIT_TIMEOUT = 15e3;
var POSTGRES_CHANGES_WAIT_ERROR_GRACE = 1e4;
var MAX_PUSH_BUFFER_SIZE = 100;
var CHANNEL_STATES = {
  closed: "closed",
  errored: "errored",
  joined: "joined",
  joining: "joining",
  leaving: "leaving"
};
var CHANNEL_EVENTS = {
  close: "phx_close",
  error: "phx_error",
  join: "phx_join",
  reply: "phx_reply",
  leave: "phx_leave",
  access_token: "access_token"
};
var CONNECTION_STATE = {
  connecting: "connecting",
  open: "open",
  closing: "closing",
  closed: "closed"
};
var Serializer = class _Serializer {
  constructor(allowedMetadataKeys) {
    this.HEADER_LENGTH = 1;
    this.USER_BROADCAST_PUSH_META_LENGTH = 6;
    this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 };
    this.BINARY_ENCODING = 0;
    this.JSON_ENCODING = 1;
    this.BROADCAST_EVENT = "broadcast";
    this.allowedMetadataKeys = _Serializer.DEFAULT_METADATA_KEYS;
    this.allowedMetadataKeys = allowedMetadataKeys !== null && allowedMetadataKeys !== void 0 ? allowedMetadataKeys : _Serializer.DEFAULT_METADATA_KEYS;
  }
  encode(msg, callback) {
    if (msg.event === this.BROADCAST_EVENT && !(msg.payload instanceof ArrayBuffer) && typeof msg.payload.event === "string") {
      return callback(this._binaryEncodeUserBroadcastPush(msg));
    }
    let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
    return callback(JSON.stringify(payload));
  }
  _binaryEncodeUserBroadcastPush(message) {
    var _a;
    if (this._isArrayBuffer((_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload)) {
      return this._encodeBinaryUserBroadcastPush(message);
    } else {
      return this._encodeJsonUserBroadcastPush(message);
    }
  }
  _encodeBinaryUserBroadcastPush(message) {
    var _a, _b;
    const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : new ArrayBuffer(0);
    return this._encodeUserBroadcastPush(message, this.BINARY_ENCODING, userPayload);
  }
  _encodeJsonUserBroadcastPush(message) {
    var _a, _b;
    const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : {};
    const encoder = new TextEncoder();
    const encodedUserPayload = encoder.encode(JSON.stringify(userPayload)).buffer;
    return this._encodeUserBroadcastPush(message, this.JSON_ENCODING, encodedUserPayload);
  }
  _encodeUserBroadcastPush(message, encodingType, encodedPayload) {
    var _a, _b;
    const encoder = new TextEncoder();
    const topic = encoder.encode(message.topic);
    const ref = encoder.encode((_a = message.ref) !== null && _a !== void 0 ? _a : "");
    const joinRef = encoder.encode((_b = message.join_ref) !== null && _b !== void 0 ? _b : "");
    const userEvent = encoder.encode(message.payload.event);
    const rest = this.allowedMetadataKeys ? this._pick(message.payload, this.allowedMetadataKeys) : {};
    const metadata = encoder.encode(Object.keys(rest).length === 0 ? "" : JSON.stringify(rest));
    if (joinRef.length > 255) {
      throw new Error(`joinRef length ${joinRef.length} exceeds maximum of 255`);
    }
    if (ref.length > 255) {
      throw new Error(`ref length ${ref.length} exceeds maximum of 255`);
    }
    if (topic.length > 255) {
      throw new Error(`topic length ${topic.length} exceeds maximum of 255`);
    }
    if (userEvent.length > 255) {
      throw new Error(`userEvent length ${userEvent.length} exceeds maximum of 255`);
    }
    if (metadata.length > 255) {
      throw new Error(`metadata length ${metadata.length} exceeds maximum of 255`);
    }
    const metaLength = this.USER_BROADCAST_PUSH_META_LENGTH + joinRef.length + ref.length + topic.length + userEvent.length + metadata.length;
    const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
    const view = new DataView(header);
    const bytes = new Uint8Array(header);
    let offset = 0;
    view.setUint8(offset++, this.KINDS.userBroadcastPush);
    view.setUint8(offset++, joinRef.length);
    view.setUint8(offset++, ref.length);
    view.setUint8(offset++, topic.length);
    view.setUint8(offset++, userEvent.length);
    view.setUint8(offset++, metadata.length);
    view.setUint8(offset++, encodingType);
    bytes.set(joinRef, offset);
    offset += joinRef.length;
    bytes.set(ref, offset);
    offset += ref.length;
    bytes.set(topic, offset);
    offset += topic.length;
    bytes.set(userEvent, offset);
    offset += userEvent.length;
    bytes.set(metadata, offset);
    offset += metadata.length;
    var combined = new Uint8Array(header.byteLength + encodedPayload.byteLength);
    combined.set(new Uint8Array(header), 0);
    combined.set(new Uint8Array(encodedPayload), header.byteLength);
    return combined.buffer;
  }
  decode(rawPayload, callback) {
    if (this._isArrayBuffer(rawPayload)) {
      let result = this._binaryDecode(rawPayload);
      return callback(result);
    }
    if (typeof rawPayload === "string") {
      const jsonPayload = JSON.parse(rawPayload);
      const [join_ref, ref, topic, event, payload] = jsonPayload;
      return callback({ join_ref, ref, topic, event, payload });
    }
    return callback({});
  }
  _binaryDecode(buffer) {
    const view = new DataView(buffer);
    const kind = view.getUint8(0);
    const decoder = new TextDecoder();
    switch (kind) {
      case this.KINDS.userBroadcast:
        return this._decodeUserBroadcast(buffer, view, decoder);
    }
  }
  _decodeUserBroadcast(buffer, view, decoder) {
    const topicSize = view.getUint8(1);
    const userEventSize = view.getUint8(2);
    const metadataSize = view.getUint8(3);
    const payloadEncoding = view.getUint8(4);
    let offset = this.HEADER_LENGTH + 4;
    const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    const userEvent = decoder.decode(buffer.slice(offset, offset + userEventSize));
    offset = offset + userEventSize;
    const metadata = decoder.decode(buffer.slice(offset, offset + metadataSize));
    offset = offset + metadataSize;
    const payload = buffer.slice(offset, buffer.byteLength);
    const parsedPayload = payloadEncoding === this.JSON_ENCODING ? JSON.parse(decoder.decode(payload)) : payload;
    const data = {
      type: this.BROADCAST_EVENT,
      event: userEvent,
      payload: parsedPayload
    };
    if (metadataSize > 0) {
      data["meta"] = JSON.parse(metadata);
    }
    return { join_ref: null, ref: null, topic, event: this.BROADCAST_EVENT, payload: data };
  }
  _isArrayBuffer(buffer) {
    var _a;
    return buffer instanceof ArrayBuffer || ((_a = buffer === null || buffer === void 0 ? void 0 : buffer.constructor) === null || _a === void 0 ? void 0 : _a.name) === "ArrayBuffer";
  }
  _pick(obj, keys) {
    if (!obj || typeof obj !== "object") {
      return {};
    }
    return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
  }
};
Serializer.DEFAULT_METADATA_KEYS = ["persist"];
var serializer_default = Serializer;
var PostgresTypes;
(function(PostgresTypes2) {
  PostgresTypes2["abstime"] = "abstime";
  PostgresTypes2["bool"] = "bool";
  PostgresTypes2["date"] = "date";
  PostgresTypes2["daterange"] = "daterange";
  PostgresTypes2["float4"] = "float4";
  PostgresTypes2["float8"] = "float8";
  PostgresTypes2["int2"] = "int2";
  PostgresTypes2["int4"] = "int4";
  PostgresTypes2["int4range"] = "int4range";
  PostgresTypes2["int8"] = "int8";
  PostgresTypes2["int8range"] = "int8range";
  PostgresTypes2["json"] = "json";
  PostgresTypes2["jsonb"] = "jsonb";
  PostgresTypes2["money"] = "money";
  PostgresTypes2["numeric"] = "numeric";
  PostgresTypes2["oid"] = "oid";
  PostgresTypes2["reltime"] = "reltime";
  PostgresTypes2["text"] = "text";
  PostgresTypes2["time"] = "time";
  PostgresTypes2["timestamp"] = "timestamp";
  PostgresTypes2["timestamptz"] = "timestamptz";
  PostgresTypes2["timetz"] = "timetz";
  PostgresTypes2["tsrange"] = "tsrange";
  PostgresTypes2["tstzrange"] = "tstzrange";
})(PostgresTypes || (PostgresTypes = {}));
var convertChangeData = (columns2, record, options = {}) => {
  var _a;
  const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
  if (!record) {
    return {};
  }
  return Object.keys(record).reduce((acc, rec_key) => {
    acc[rec_key] = convertColumn(rec_key, columns2, record, skipTypes);
    return acc;
  }, {});
};
var convertColumn = (columnName, columns2, record, skipTypes) => {
  const column = columns2.find((x) => x.name === columnName);
  const colType = column === null || column === void 0 ? void 0 : column.type;
  const value = record[columnName];
  if (colType && !skipTypes.includes(colType)) {
    return convertCell(colType, value);
  }
  return noop(value);
};
var convertCell = (type, value) => {
  if (type.charAt(0) === "_") {
    const dataType = type.slice(1, type.length);
    return toArray(value, dataType);
  }
  switch (type) {
    case PostgresTypes.bool:
      return toBoolean(value);
    case PostgresTypes.float4:
    case PostgresTypes.float8:
    case PostgresTypes.int2:
    case PostgresTypes.int4:
    case PostgresTypes.int8:
    case PostgresTypes.numeric:
    case PostgresTypes.oid:
      return toNumber(value);
    case PostgresTypes.json:
    case PostgresTypes.jsonb:
      return toJson(value);
    case PostgresTypes.timestamp:
      return toTimestampString(value);
    // Format to be consistent with PostgREST
    case PostgresTypes.abstime:
    // To allow users to cast it based on Timezone
    case PostgresTypes.date:
    // To allow users to cast it based on Timezone
    case PostgresTypes.daterange:
    case PostgresTypes.int4range:
    case PostgresTypes.int8range:
    case PostgresTypes.money:
    case PostgresTypes.reltime:
    // To allow users to cast it based on Timezone
    case PostgresTypes.text:
    case PostgresTypes.time:
    // To allow users to cast it based on Timezone
    case PostgresTypes.timestamptz:
    // To allow users to cast it based on Timezone
    case PostgresTypes.timetz:
    // To allow users to cast it based on Timezone
    case PostgresTypes.tsrange:
    case PostgresTypes.tstzrange:
      return noop(value);
    default:
      return noop(value);
  }
};
var noop = (value) => {
  return value;
};
var toBoolean = (value) => {
  switch (value) {
    case "t":
      return true;
    case "f":
      return false;
    default:
      return value;
  }
};
var toNumber = (value) => {
  if (typeof value === "string") {
    const parsedValue = parseFloat(value);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }
  return value;
};
var toJson = (value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_a) {
      return value;
    }
  }
  return value;
};
var toArray = (value, type) => {
  if (typeof value !== "string") {
    return value;
  }
  const lastIdx = value.length - 1;
  const closeBrace = value[lastIdx];
  const openBrace = value[0];
  if (openBrace === "{" && closeBrace === "}") {
    let arr;
    const valTrim = value.slice(1, lastIdx);
    try {
      arr = JSON.parse("[" + valTrim + "]");
    } catch (_) {
      arr = valTrim ? valTrim.split(",") : [];
    }
    return arr.map((val) => convertCell(type, val));
  }
  return value;
};
var toTimestampString = (value) => {
  if (typeof value === "string") {
    return value.replace(" ", "T");
  }
  return value;
};
var httpEndpointURL = (socketUrl) => {
  const wsUrl = new URL(socketUrl);
  wsUrl.protocol = wsUrl.protocol.replace(/^ws/i, "http");
  wsUrl.pathname = wsUrl.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, "");
  if (wsUrl.pathname === "" || wsUrl.pathname === "/") {
    wsUrl.pathname = "/api/broadcast";
  } else {
    wsUrl.pathname = wsUrl.pathname + "/api/broadcast";
  }
  return wsUrl.href;
};
var closure = (value) => {
  if (typeof value === "function") {
    return (
      /** @type {() => T} */
      value
    );
  } else {
    let closure2 = function() {
      return value;
    };
    return closure2;
  }
};
var globalSelf = typeof self !== "undefined" ? self : null;
var phxWindow = typeof window !== "undefined" ? window : null;
var global2 = globalSelf || phxWindow || globalThis;
var DEFAULT_VSN2 = "2.0.0";
var DEFAULT_TIMEOUT2 = 1e4;
var WS_CLOSE_NORMAL = 1e3;
var MAX_LONGPOLL_BATCH_SIZE = 100;
var SOCKET_STATES = (
  /** @type {const} */
  { connecting: 0, open: 1, closing: 2, closed: 3 }
);
var CHANNEL_STATES2 = (
  /** @type {const} */
  {
    closed: "closed",
    errored: "errored",
    joined: "joined",
    joining: "joining",
    leaving: "leaving"
  }
);
var CHANNEL_EVENTS2 = (
  /** @type {const} */
  {
    close: "phx_close",
    error: "phx_error",
    join: "phx_join",
    reply: "phx_reply",
    leave: "phx_leave"
  }
);
var TRANSPORTS = (
  /** @type {const} */
  {
    longpoll: "longpoll",
    websocket: "websocket"
  }
);
var XHR_STATES = (
  /** @type {const} */
  {
    complete: 4
  }
);
var AUTH_TOKEN_PREFIX = "base64url.bearer.phx.";
var Push = class {
  /**
   * Initializes the Push
   * @param {Channel} channel - The Channel
   * @param {ChannelEvent} event - The event, for example `"phx_join"`
   * @param {() => Record<string, unknown>} payload - The payload, for example `{user_id: 123}`
   * @param {number} timeout - The push timeout in milliseconds
   */
  constructor(channel, event, payload, timeout) {
    this.channel = channel;
    this.event = event;
    this.payload = payload || function() {
      return {};
    };
    this.receivedResp = null;
    this.timeout = timeout;
    this.timeoutTimer = null;
    this.recHooks = [];
    this.sent = false;
    this.ref = void 0;
  }
  /**
   *
   * @param {number} timeout
   */
  resend(timeout) {
    this.timeout = timeout;
    this.reset();
    this.send();
  }
  /**
   *
   */
  send() {
    if (this.hasReceived("timeout")) {
      return;
    }
    this.startTimeout();
    this.sent = true;
    this.channel.socket.push({
      topic: this.channel.topic,
      event: this.event,
      payload: this.payload(),
      ref: this.ref,
      join_ref: this.channel.joinRef()
    });
  }
  /**
   *
   * @param {string} status
   * @param {(response: any) => void} callback
   */
  receive(status, callback) {
    if (this.hasReceived(status)) {
      callback(this.receivedResp.response);
    }
    this.recHooks.push({ status, callback });
    return this;
  }
  reset() {
    this.cancelRefEvent();
    this.ref = null;
    this.refEvent = null;
    this.receivedResp = null;
    this.sent = false;
  }
  destroy() {
    this.cancelRefEvent();
    this.cancelTimeout();
  }
  /**
   * @private
   */
  matchReceive({ status, response, _ref }) {
    this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
  }
  /**
   * @private
   */
  cancelRefEvent() {
    if (!this.refEvent) {
      return;
    }
    this.channel.off(this.refEvent);
  }
  cancelTimeout() {
    clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }
  startTimeout() {
    if (this.timeoutTimer) {
      this.cancelTimeout();
    }
    this.ref = this.channel.socket.makeRef();
    this.refEvent = this.channel.replyEventName(this.ref);
    this.channel.on(this.refEvent, (payload) => {
      this.cancelRefEvent();
      this.cancelTimeout();
      this.receivedResp = payload;
      this.matchReceive(payload);
    });
    this.timeoutTimer = setTimeout(() => {
      this.trigger("timeout", {});
    }, this.timeout);
  }
  /**
   * @private
   */
  hasReceived(status) {
    return this.receivedResp && this.receivedResp.status === status;
  }
  trigger(status, response) {
    this.channel.trigger(this.refEvent, { status, response });
  }
};
var Timer = class {
  /**
  * @param {() => void} callback
  * @param {(tries: number) => number} timerCalc
  */
  constructor(callback, timerCalc) {
    this.callback = callback;
    this.timerCalc = timerCalc;
    this.timer = void 0;
    this.tries = 0;
  }
  reset() {
    this.tries = 0;
    clearTimeout(this.timer);
  }
  /**
   * Cancels any previous scheduleTimeout and schedules callback
   */
  scheduleTimeout() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.tries = this.tries + 1;
      this.callback();
    }, this.timerCalc(this.tries + 1));
  }
};
var Channel = class {
  /**
   * @param {string} topic
   * @param {Params | (() => Params)} params
   * @param {Socket} socket
   */
  constructor(topic, params, socket) {
    this.state = CHANNEL_STATES2.closed;
    this.topic = topic;
    this.params = closure(params || {});
    this.socket = socket;
    this.bindings = [];
    this.bindingRef = 0;
    this.timeout = this.socket.timeout;
    this.joinedOnce = false;
    this.joinPush = new Push(this, CHANNEL_EVENTS2.join, this.params, this.timeout);
    this.pushBuffer = [];
    this.stateChangeRefs = [];
    this.rejoinTimer = new Timer(() => {
      if (this.socket.isConnected()) {
        this.rejoin();
      }
    }, this.socket.rejoinAfterMs);
    this.stateChangeRefs.push(this.socket.onError(() => this.rejoinTimer.reset()));
    this.stateChangeRefs.push(
      this.socket.onOpen(() => {
        this.rejoinTimer.reset();
        if (this.isErrored()) {
          this.rejoin();
        }
      })
    );
    this.joinPush.receive("ok", () => {
      this.state = CHANNEL_STATES2.joined;
      this.rejoinTimer.reset();
      this.pushBuffer.forEach((pushEvent) => pushEvent.send());
      this.pushBuffer = [];
    });
    this.joinPush.receive("error", (reason) => {
      this.state = CHANNEL_STATES2.errored;
      if (this.socket.hasLogger()) this.socket.log("channel", `error ${this.topic}`, reason);
      if (this.socket.isConnected()) {
        this.rejoinTimer.scheduleTimeout();
      }
    });
    this.onClose(() => {
      this.rejoinTimer.reset();
      if (this.socket.hasLogger()) this.socket.log("channel", `close ${this.topic}`);
      this.state = CHANNEL_STATES2.closed;
      this.socket.remove(this);
    });
    this.onError((reason) => {
      if (this.socket.hasLogger()) this.socket.log("channel", `error ${this.topic}`, reason);
      if (this.isJoining()) {
        this.joinPush.reset();
      }
      this.state = CHANNEL_STATES2.errored;
      if (this.socket.isConnected()) {
        this.rejoinTimer.scheduleTimeout();
      }
    });
    this.joinPush.receive("timeout", () => {
      if (this.socket.hasLogger()) this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
      let leavePush = new Push(this, CHANNEL_EVENTS2.leave, closure({}), this.timeout);
      leavePush.send();
      this.state = CHANNEL_STATES2.errored;
      this.joinPush.reset();
      if (this.socket.isConnected()) {
        this.rejoinTimer.scheduleTimeout();
      }
    });
    this.on(CHANNEL_EVENTS2.reply, (payload, ref) => {
      this.trigger(this.replyEventName(ref), payload);
    });
  }
  /**
   * Join the channel
   * @param {number} timeout
   * @returns {Push}
   */
  join(timeout = this.timeout) {
    if (this.joinedOnce) {
      throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
    } else {
      this.timeout = timeout;
      this.joinedOnce = true;
      this.rejoin();
      return this.joinPush;
    }
  }
  /**
   * Teardown the channel.
   *
   * Destroys and stops related timers.
   */
  teardown() {
    this.pushBuffer.forEach((push) => push.destroy());
    this.pushBuffer = [];
    this.rejoinTimer.reset();
    this.joinPush.destroy();
    this.state = CHANNEL_STATES2.closed;
    this.bindings = [];
  }
  /**
   * Hook into channel close
   * @param {ChannelBindingCallback} callback
   */
  onClose(callback) {
    this.on(CHANNEL_EVENTS2.close, callback);
  }
  /**
   * Hook into channel errors
   * @param {ChannelOnErrorCallback} callback
   * @return {number}
   */
  onError(callback) {
    return this.on(CHANNEL_EVENTS2.error, (reason) => callback(reason));
  }
  /**
   * Subscribes on channel events
   *
   * Subscription returns a ref counter, which can be used later to
   * unsubscribe the exact event listener
   *
   * @example
   * const ref1 = channel.on("event", do_stuff)
   * const ref2 = channel.on("event", do_other_stuff)
   * channel.off("event", ref1)
   * // Since unsubscription, do_stuff won't fire,
   * // while do_other_stuff will keep firing on the "event"
   *
   * @param {string} event
   * @param {ChannelBindingCallback} callback
   * @returns {number} ref
   */
  on(event, callback) {
    let ref = this.bindingRef++;
    this.bindings.push({ event, ref, callback });
    return ref;
  }
  /**
   * Unsubscribes off of channel events
   *
   * Use the ref returned from a channel.on() to unsubscribe one
   * handler, or pass nothing for the ref to unsubscribe all
   * handlers for the given event.
   *
   * @example
   * // Unsubscribe the do_stuff handler
   * const ref1 = channel.on("event", do_stuff)
   * channel.off("event", ref1)
   *
   * // Unsubscribe all handlers from event
   * channel.off("event")
   *
   * @param {string} event
   * @param {number} [ref]
   */
  off(event, ref) {
    this.bindings = this.bindings.filter((bind) => {
      return !(bind.event === event && (typeof ref === "undefined" || ref === bind.ref));
    });
  }
  /**
   * @private
   */
  canPush() {
    return this.socket.isConnected() && this.isJoined();
  }
  /**
   * Sends a message `event` to phoenix with the payload `payload`.
   * Phoenix receives this in the `handle_in(event, payload, socket)`
   * function. if phoenix replies or it times out (default 10000ms),
   * then optionally the reply can be received.
   *
   * @example
   * channel.push("event")
   *   .receive("ok", payload => console.log("phoenix replied:", payload))
   *   .receive("error", err => console.log("phoenix errored", err))
   *   .receive("timeout", () => console.log("timed out pushing"))
   * @param {string} event
   * @param {Object} payload
   * @param {number} [timeout]
   * @returns {Push}
   */
  push(event, payload, timeout = this.timeout) {
    payload = payload || {};
    if (!this.joinedOnce) {
      throw new Error(`tried to push '${event}' to '${this.topic}' before joining. Use channel.join() before pushing events`);
    }
    let pushEvent = new Push(this, event, function() {
      return payload;
    }, timeout);
    if (this.canPush()) {
      pushEvent.send();
    } else {
      pushEvent.startTimeout();
      this.pushBuffer.push(pushEvent);
    }
    return pushEvent;
  }
  /** Leaves the channel
   *
   * Unsubscribes from server events, and
   * instructs channel to terminate on server
   *
   * Triggers onClose() hooks
   *
   * To receive leave acknowledgements, use the `receive`
   * hook to bind to the server ack, ie:
   *
   * @example
   * channel.leave().receive("ok", () => alert("left!") )
   *
   * @param {number} timeout
   * @returns {Push}
   */
  leave(timeout = this.timeout) {
    this.rejoinTimer.reset();
    this.joinPush.cancelTimeout();
    this.state = CHANNEL_STATES2.leaving;
    let onClose = () => {
      if (this.socket.hasLogger()) this.socket.log("channel", `leave ${this.topic}`);
      this.trigger(CHANNEL_EVENTS2.close, "leave");
    };
    let leavePush = new Push(this, CHANNEL_EVENTS2.leave, closure({}), timeout);
    leavePush.receive("ok", () => onClose()).receive("timeout", () => onClose());
    leavePush.send();
    if (!this.canPush()) {
      leavePush.trigger("ok", {});
    }
    return leavePush;
  }
  /**
   * Overridable message hook
   *
   * Receives all events for specialized message handling
   * before dispatching to the channel callbacks.
   *
   * Must return the payload, modified or unmodified
   * @type{ChannelOnMessage}
   */
  onMessage(_event, payload, _ref) {
    return payload;
  }
  /**
   * Overridable filter hook
   *
   * If this function returns `true`, `binding`'s callback will be called.
   *
   * @type{ChannelFilterBindings}
   */
  filterBindings(_binding, _payload, _ref) {
    return true;
  }
  isMember(topic, event, payload, joinRef) {
    if (this.topic !== topic) {
      return false;
    }
    if (joinRef && joinRef !== this.joinRef()) {
      if (this.socket.hasLogger()) this.socket.log("channel", "dropping outdated message", { topic, event, payload, joinRef });
      return false;
    } else {
      return true;
    }
  }
  joinRef() {
    return this.joinPush.ref;
  }
  /**
   * @private
   */
  rejoin(timeout = this.timeout) {
    if (this.isLeaving()) {
      return;
    }
    this.socket.leaveOpenTopic(this.topic);
    this.state = CHANNEL_STATES2.joining;
    this.joinPush.resend(timeout);
  }
  /**
   * @param {string} event
   * @param {unknown} [payload]
   * @param {?string} [ref]
   * @param {?string} [joinRef]
   */
  trigger(event, payload, ref, joinRef) {
    let handledPayload = this.onMessage(event, payload, ref, joinRef);
    if (payload && !handledPayload) {
      throw new Error("channel onMessage callbacks must return the payload, modified or unmodified");
    }
    let eventBindings = this.bindings.filter((bind) => bind.event === event && this.filterBindings(bind, payload, ref));
    for (let i = 0; i < eventBindings.length; i++) {
      let bind = eventBindings[i];
      bind.callback(handledPayload, ref, joinRef || this.joinRef());
    }
  }
  /**
  * @param {string} ref
  */
  replyEventName(ref) {
    return `chan_reply_${ref}`;
  }
  isClosed() {
    return this.state === CHANNEL_STATES2.closed;
  }
  isErrored() {
    return this.state === CHANNEL_STATES2.errored;
  }
  isJoined() {
    return this.state === CHANNEL_STATES2.joined;
  }
  isJoining() {
    return this.state === CHANNEL_STATES2.joining;
  }
  isLeaving() {
    return this.state === CHANNEL_STATES2.leaving;
  }
};
var Ajax = class {
  static request(method, endPoint, headers, body, timeout, ontimeout, callback) {
    if (global2.XDomainRequest) {
      let req = new global2.XDomainRequest();
      return this.xdomainRequest(req, method, endPoint, body, timeout, ontimeout, callback);
    } else if (global2.XMLHttpRequest) {
      let req = new global2.XMLHttpRequest();
      return this.xhrRequest(req, method, endPoint, headers, body, timeout, ontimeout, callback);
    } else if (global2.fetch && global2.AbortController) {
      return this.fetchRequest(method, endPoint, headers, body, timeout, ontimeout, callback);
    } else {
      throw new Error("No suitable XMLHttpRequest implementation found");
    }
  }
  static fetchRequest(method, endPoint, headers, body, timeout, ontimeout, callback) {
    let options = {
      method,
      headers,
      body
    };
    let controller = null;
    if (timeout) {
      controller = new AbortController();
      const _timeoutId = setTimeout(() => controller.abort(), timeout);
      options.signal = controller.signal;
    }
    global2.fetch(endPoint, options).then((response) => response.text()).then((data) => this.parseJSON(data)).then((data) => callback && callback(data)).catch((err) => {
      if (err.name === "AbortError" && ontimeout) {
        ontimeout();
      } else {
        callback && callback(null);
      }
    });
    return controller;
  }
  static xdomainRequest(req, method, endPoint, body, timeout, ontimeout, callback) {
    req.timeout = timeout;
    req.open(method, endPoint);
    req.onload = () => {
      let response = this.parseJSON(req.responseText);
      callback && callback(response);
    };
    if (ontimeout) {
      req.ontimeout = ontimeout;
    }
    req.onprogress = () => {
    };
    req.send(body);
    return req;
  }
  static xhrRequest(req, method, endPoint, headers, body, timeout, ontimeout, callback) {
    req.open(method, endPoint, true);
    req.timeout = timeout;
    for (let [key, value] of Object.entries(headers)) {
      req.setRequestHeader(key, value);
    }
    req.onerror = () => callback && callback(null);
    req.onreadystatechange = () => {
      if (req.readyState === XHR_STATES.complete && callback) {
        let response = this.parseJSON(req.responseText);
        callback(response);
      }
    };
    if (ontimeout) {
      req.ontimeout = ontimeout;
    }
    req.send(body);
    return req;
  }
  static parseJSON(resp) {
    if (!resp || resp === "") {
      return null;
    }
    try {
      return JSON.parse(resp);
    } catch {
      console && console.log("failed to parse JSON response", resp);
      return null;
    }
  }
  static serialize(obj, parentKey) {
    let queryStr = [];
    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        continue;
      }
      let paramKey = parentKey ? `${parentKey}[${key}]` : key;
      let paramVal = obj[key];
      if (typeof paramVal === "object") {
        queryStr.push(this.serialize(paramVal, paramKey));
      } else {
        queryStr.push(encodeURIComponent(paramKey) + "=" + encodeURIComponent(paramVal));
      }
    }
    return queryStr.join("&");
  }
  static appendParams(url, params) {
    if (Object.keys(params).length === 0) {
      return url;
    }
    let prefix = url.match(/\?/) ? "&" : "?";
    return `${url}${prefix}${this.serialize(params)}`;
  }
};
var arrayBufferToBase64 = (buffer) => {
  let binary = "";
  let bytes = new Uint8Array(buffer);
  let len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
var LongPoll = class {
  constructor(endPoint, protocols) {
    if (protocols && protocols.length === 2 && protocols[1].startsWith(AUTH_TOKEN_PREFIX)) {
      this.authToken = atob(protocols[1].slice(AUTH_TOKEN_PREFIX.length));
    }
    this.endPoint = null;
    this.token = null;
    this.skipHeartbeat = true;
    this.reqs = /* @__PURE__ */ new Set();
    this.awaitingBatchAck = false;
    this.currentBatch = null;
    this.currentBatchTimer = null;
    this.batchBuffer = [];
    this.onopen = function() {
    };
    this.onerror = function() {
    };
    this.onmessage = function() {
    };
    this.onclose = function() {
    };
    this.pollEndpoint = this.normalizeEndpoint(endPoint);
    this.readyState = SOCKET_STATES.connecting;
    setTimeout(() => this.poll(), 0);
  }
  normalizeEndpoint(endPoint) {
    return endPoint.replace("ws://", "http://").replace("wss://", "https://").replace(new RegExp("(.*)/" + TRANSPORTS.websocket), "$1/" + TRANSPORTS.longpoll);
  }
  endpointURL() {
    return Ajax.appendParams(this.pollEndpoint, { token: this.token });
  }
  closeAndRetry(code, reason, wasClean) {
    this.close(code, reason, wasClean);
    this.readyState = SOCKET_STATES.connecting;
  }
  ontimeout() {
    this.onerror("timeout");
    this.closeAndRetry(1005, "timeout", false);
  }
  isActive() {
    return this.readyState === SOCKET_STATES.open || this.readyState === SOCKET_STATES.connecting;
  }
  poll() {
    const headers = { "Accept": "application/json" };
    if (this.authToken) {
      headers["X-Phoenix-AuthToken"] = this.authToken;
    }
    this.ajax("GET", headers, null, () => this.ontimeout(), (resp) => {
      if (resp) {
        var { status, token, messages } = resp;
        if (status === 410 && this.token !== null) {
          this.onerror(410);
          this.closeAndRetry(3410, "session_gone", false);
          return;
        }
        this.token = token;
      } else {
        status = 0;
      }
      switch (status) {
        case 200:
          messages.forEach((msg) => {
            setTimeout(() => this.onmessage({ data: msg }), 0);
          });
          this.poll();
          break;
        case 204:
          this.poll();
          break;
        case 410:
          this.readyState = SOCKET_STATES.open;
          this.onopen({});
          this.poll();
          break;
        case 403:
          this.onerror(403);
          this.close(1008, "forbidden", false);
          break;
        case 0:
        case 500:
          this.onerror(500);
          this.closeAndRetry(1011, "internal server error", 500);
          break;
        default:
          throw new Error(`unhandled poll status ${status}`);
      }
    });
  }
  // we collect all pushes within the current event loop by
  // setTimeout 0, which optimizes back-to-back procedural
  // pushes against an empty buffer
  send(body) {
    if (typeof body !== "string") {
      body = arrayBufferToBase64(body);
    }
    if (this.currentBatch) {
      this.currentBatch.push(body);
    } else if (this.awaitingBatchAck) {
      this.batchBuffer.push(body);
    } else {
      this.currentBatch = [body];
      this.currentBatchTimer = setTimeout(() => {
        this.batchSend(this.currentBatch);
        this.currentBatch = null;
      }, 0);
    }
  }
  batchSend(messages, offset = 0) {
    this.awaitingBatchAck = true;
    const next = offset + MAX_LONGPOLL_BATCH_SIZE;
    const batch = messages.slice(offset, next);
    this.ajax("POST", { "Content-Type": "application/x-ndjson" }, batch.join("\n"), () => this.onerror("timeout"), (resp) => {
      if (!resp || resp.status !== 200) {
        this.awaitingBatchAck = false;
        this.onerror(resp && resp.status);
        this.closeAndRetry(1011, "internal server error", false);
      } else if (next < messages.length) {
        this.batchSend(messages, next);
      } else if (this.batchBuffer.length > 0) {
        this.batchSend(this.batchBuffer);
        this.batchBuffer = [];
      } else {
        this.awaitingBatchAck = false;
      }
    });
  }
  close(code, reason, wasClean) {
    for (let req of this.reqs) {
      req.abort();
    }
    this.readyState = SOCKET_STATES.closed;
    let opts = Object.assign({ code: 1e3, reason: void 0, wasClean: true }, { code, reason, wasClean });
    this.batchBuffer = [];
    clearTimeout(this.currentBatchTimer);
    this.currentBatchTimer = null;
    if (typeof CloseEvent !== "undefined") {
      this.onclose(new CloseEvent("close", opts));
    } else {
      this.onclose(opts);
    }
  }
  ajax(method, headers, body, onCallerTimeout, callback) {
    let req;
    let ontimeout = () => {
      this.reqs.delete(req);
      onCallerTimeout();
    };
    req = Ajax.request(method, this.endpointURL(), headers, body, this.timeout, ontimeout, (resp) => {
      this.reqs.delete(req);
      if (this.isActive()) {
        callback(resp);
      }
    });
    this.reqs.add(req);
  }
};
var Presence = class _Presence {
  /**
   * Initializes the Presence
   * @param {Channel} channel - The Channel
   * @param {PresenceOptions} [opts] - The options, for example `{events: {state: "state", diff: "diff"}}`
   */
  constructor(channel, opts = {}) {
    let events = opts.events || /** @type {PresenceEvents} */
    { state: "presence_state", diff: "presence_diff" };
    this.state = /* @__PURE__ */ Object.create(null);
    this.pendingDiffs = [];
    this.channel = channel;
    this.joinRef = null;
    this.caller = {
      onJoin: function() {
      },
      onLeave: function() {
      },
      onSync: function() {
      }
    };
    this.channel.on(events.state, (newState) => {
      let { onJoin, onLeave, onSync } = this.caller;
      this.joinRef = this.channel.joinRef();
      this.state = _Presence.syncState(this.state, newState, onJoin, onLeave);
      this.pendingDiffs.forEach((diff) => {
        this.state = _Presence.syncDiff(this.state, diff, onJoin, onLeave);
      });
      this.pendingDiffs = [];
      onSync();
    });
    this.channel.on(events.diff, (diff) => {
      let { onJoin, onLeave, onSync } = this.caller;
      if (this.inPendingSyncState()) {
        this.pendingDiffs.push(diff);
      } else {
        this.state = _Presence.syncDiff(this.state, diff, onJoin, onLeave);
        onSync();
      }
    });
  }
  /**
   * @param {PresenceOnJoin} callback
   */
  onJoin(callback) {
    this.caller.onJoin = callback;
  }
  /**
   * @param {PresenceOnLeave} callback
   */
  onLeave(callback) {
    this.caller.onLeave = callback;
  }
  /**
   * @param {PresenceOnSync} callback
   */
  onSync(callback) {
    this.caller.onSync = callback;
  }
  /**
   * Returns the array of presences, with selected metadata.
   *
   * @template [T=PresenceState]
   * @param {((key: string, obj: PresenceState) => T)} [by]
   *
   * @returns {T[]}
   */
  list(by) {
    return _Presence.list(this.state, by);
  }
  inPendingSyncState() {
    return !this.joinRef || this.joinRef !== this.channel.joinRef();
  }
  // lower-level public static API
  /**
   * Used to sync the list of presences on the server
   * with the client's state. An optional `onJoin` and `onLeave` callback can
   * be provided to react to changes in the client's local presences across
   * disconnects and reconnects with the server.
   *
   * @param {Record<string, PresenceState>} currentState
   * @param {Record<string, PresenceState>} newState
   * @param {PresenceOnJoin} onJoin
   * @param {PresenceOnLeave} onLeave
   *
   * @returns {Record<string, PresenceState>}
   */
  static syncState(currentState, newState, onJoin, onLeave) {
    let state = this.toNullProtoObj(this.clone(currentState));
    newState = this.toNullProtoObj(newState);
    let joins = /* @__PURE__ */ Object.create(null);
    let leaves = /* @__PURE__ */ Object.create(null);
    this.map(state, (key, presence) => {
      if (!newState[key]) {
        leaves[key] = presence;
      }
    });
    this.map(newState, (key, newPresence) => {
      let currentPresence = state[key];
      if (currentPresence) {
        let newRefs = newPresence.metas.map((m) => m.phx_ref);
        let curRefs = currentPresence.metas.map((m) => m.phx_ref);
        let joinedMetas = newPresence.metas.filter((m) => curRefs.indexOf(m.phx_ref) < 0);
        let leftMetas = currentPresence.metas.filter((m) => newRefs.indexOf(m.phx_ref) < 0);
        if (joinedMetas.length > 0) {
          joins[key] = newPresence;
          joins[key].metas = joinedMetas;
        }
        if (leftMetas.length > 0) {
          leaves[key] = this.clone(currentPresence);
          leaves[key].metas = leftMetas;
        }
      } else {
        joins[key] = newPresence;
      }
    });
    return this.syncDiff(state, { joins, leaves }, onJoin, onLeave);
  }
  /**
   *
   * Used to sync a diff of presence join and leave
   * events from the server, as they happen. Like `syncState`, `syncDiff`
   * accepts optional `onJoin` and `onLeave` callbacks to react to a user
   * joining or leaving from a device.
   *
   * @param {Record<string, PresenceState>} state
   * @param {PresenceDiff} diff
   * @param {PresenceOnJoin} onJoin
   * @param {PresenceOnLeave} onLeave
   *
   * @returns {Record<string, PresenceState>}
   */
  static syncDiff(state, diff, onJoin, onLeave) {
    state = this.toNullProtoObj(state);
    let { joins, leaves } = this.clone(diff);
    if (!onJoin) {
      onJoin = function() {
      };
    }
    if (!onLeave) {
      onLeave = function() {
      };
    }
    this.map(joins, (key, newPresence) => {
      let currentPresence = state[key];
      state[key] = this.clone(newPresence);
      if (currentPresence) {
        let joinedRefs = state[key].metas.map((m) => m.phx_ref);
        let curMetas = currentPresence.metas.filter((m) => joinedRefs.indexOf(m.phx_ref) < 0);
        state[key].metas.unshift(...curMetas);
      }
      onJoin(key, currentPresence, newPresence);
    });
    this.map(leaves, (key, leftPresence) => {
      let currentPresence = state[key];
      if (!currentPresence) {
        return;
      }
      let refsToRemove = leftPresence.metas.map((m) => m.phx_ref);
      currentPresence.metas = currentPresence.metas.filter((p) => {
        return refsToRemove.indexOf(p.phx_ref) < 0;
      });
      onLeave(key, currentPresence, leftPresence);
      if (currentPresence.metas.length === 0) {
        delete state[key];
      }
    });
    return state;
  }
  /**
   * Returns the array of presences, with selected metadata.
   *
   * @template [T=PresenceState]
   * @param {Record<string, PresenceState>} presences
   * @param {((key: string, obj: PresenceState) => T)} [chooser]
   *
   * @returns {T[]}
   */
  static list(presences, chooser) {
    if (!chooser) {
      chooser = function(key, pres) {
        return pres;
      };
    }
    return this.map(presences, (key, presence) => {
      return chooser(key, presence);
    });
  }
  // private
  /**
  * @template T
  * @param {Record<string, PresenceState>} obj
  * @param {(key: string, obj: PresenceState) => T} func
  */
  static map(obj, func) {
    return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
  }
  // Presence keys are chosen on the server and may collide with
  // Object.prototype properties ("__proto__", "constructor", ...), so any
  // object indexed by presence key must not have a prototype chain
  //
  // TODO: replace the null-prototype objects with Maps in Phoenix 2.0
  // (breaking change for the lower-level static API)
  static toNullProtoObj(obj) {
    if (Object.getPrototypeOf(obj) === null) {
      return obj;
    }
    let cleaned = /* @__PURE__ */ Object.create(null);
    Object.getOwnPropertyNames(obj).forEach((key) => {
      cleaned[key] = obj[key];
    });
    return cleaned;
  }
  /**
  * @template T
  * @param {T} obj
  * @returns {T}
  */
  static clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};
var serializer_default2 = {
  HEADER_LENGTH: 1,
  META_LENGTH: 4,
  KINDS: { push: 0, reply: 1, broadcast: 2 },
  /**
  * @template T
  * @param {Message<Record<string, any>>} msg
  * @param {(msg: ArrayBuffer | string) => T} callback
  * @returns {T}
  */
  encode(msg, callback) {
    if (msg.payload.constructor === ArrayBuffer) {
      return callback(this.binaryEncode(msg));
    } else {
      let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
      return callback(JSON.stringify(payload));
    }
  },
  /**
  * @template T
  * @param {ArrayBuffer | string} rawPayload
  * @param {(msg: Message<unknown>) => T} callback
  * @returns {T}
  */
  decode(rawPayload, callback) {
    if (rawPayload.constructor === ArrayBuffer) {
      return callback(this.binaryDecode(rawPayload));
    } else {
      let [join_ref, ref, topic, event, payload] = JSON.parse(rawPayload);
      return callback({ join_ref, ref, topic, event, payload });
    }
  },
  /** @private */
  binaryEncode(message) {
    let { join_ref, ref, event, topic, payload } = message;
    let encoder = new TextEncoder();
    let joinRefBytes = encoder.encode(join_ref);
    let refBytes = encoder.encode(ref);
    let topicBytes = encoder.encode(topic);
    let eventBytes = encoder.encode(event);
    this.assertFieldSize(joinRefBytes.byteLength, "join_ref");
    this.assertFieldSize(refBytes.byteLength, "ref");
    this.assertFieldSize(topicBytes.byteLength, "topic");
    this.assertFieldSize(eventBytes.byteLength, "event");
    let metaLength = this.META_LENGTH + joinRefBytes.byteLength + refBytes.byteLength + topicBytes.byteLength + eventBytes.byteLength;
    let header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
    let headerBytes = new Uint8Array(header);
    let view = new DataView(header);
    let offset = 0;
    view.setUint8(offset++, this.KINDS.push);
    view.setUint8(offset++, joinRefBytes.byteLength);
    view.setUint8(offset++, refBytes.byteLength);
    view.setUint8(offset++, topicBytes.byteLength);
    view.setUint8(offset++, eventBytes.byteLength);
    headerBytes.set(joinRefBytes, offset);
    offset += joinRefBytes.byteLength;
    headerBytes.set(refBytes, offset);
    offset += refBytes.byteLength;
    headerBytes.set(topicBytes, offset);
    offset += topicBytes.byteLength;
    headerBytes.set(eventBytes, offset);
    offset += eventBytes.byteLength;
    var combined = new Uint8Array(header.byteLength + payload.byteLength);
    combined.set(headerBytes, 0);
    combined.set(new Uint8Array(payload), header.byteLength);
    return combined.buffer;
  },
  assertFieldSize(size2, name) {
    if (size2 > 255) {
      throw new Error(`unable to convert ${name} to binary: must be less than or equal to 255 bytes, but is ${size2} bytes`);
    }
  },
  /**
  * @private
  */
  binaryDecode(buffer) {
    let view = new DataView(buffer);
    let kind = view.getUint8(0);
    let decoder = new TextDecoder();
    switch (kind) {
      case this.KINDS.push:
        return this.decodePush(buffer, view, decoder);
      case this.KINDS.reply:
        return this.decodeReply(buffer, view, decoder);
      case this.KINDS.broadcast:
        return this.decodeBroadcast(buffer, view, decoder);
    }
  },
  /** @private */
  decodePush(buffer, view, decoder) {
    let joinRefSize = view.getUint8(1);
    let topicSize = view.getUint8(2);
    let eventSize = view.getUint8(3);
    let offset = this.HEADER_LENGTH + this.META_LENGTH - 1;
    let joinRef = decoder.decode(buffer.slice(offset, offset + joinRefSize));
    offset = offset + joinRefSize;
    let topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    let event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    let data = buffer.slice(offset, buffer.byteLength);
    return { join_ref: joinRef, ref: null, topic, event, payload: data };
  },
  /** @private */
  decodeReply(buffer, view, decoder) {
    let joinRefSize = view.getUint8(1);
    let refSize = view.getUint8(2);
    let topicSize = view.getUint8(3);
    let eventSize = view.getUint8(4);
    let offset = this.HEADER_LENGTH + this.META_LENGTH;
    let joinRef = decoder.decode(buffer.slice(offset, offset + joinRefSize));
    offset = offset + joinRefSize;
    let ref = decoder.decode(buffer.slice(offset, offset + refSize));
    offset = offset + refSize;
    let topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    let event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    let data = buffer.slice(offset, buffer.byteLength);
    let payload = { status: event, response: data };
    return { join_ref: joinRef, ref, topic, event: CHANNEL_EVENTS2.reply, payload };
  },
  /** @private */
  decodeBroadcast(buffer, view, decoder) {
    let topicSize = view.getUint8(1);
    let eventSize = view.getUint8(2);
    let offset = this.HEADER_LENGTH + 2;
    let topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    let event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    let data = buffer.slice(offset, buffer.byteLength);
    return { join_ref: null, ref: null, topic, event, payload: data };
  }
};
var Socket = class {
  /** Initializes the Socket *
   *
   * For IE8 support use an ES5-shim (https://github.com/es-shims/es5-shim)
   *
   * @constructor
   * @param {string} endPoint - The string WebSocket endpoint, ie, `"ws://example.com/socket"`,
   *                                               `"wss://example.com"`
   *                                               `"/socket"` (inherited host & protocol)
   * @param {SocketOptions} [opts] - Optional configuration
   */
  constructor(endPoint, opts = {}) {
    this.stateChangeCallbacks = { open: [], close: [], error: [], message: [] };
    this.channels = [];
    this.sendBuffer = [];
    this.ref = 0;
    this.fallbackRef = null;
    this.timeout = opts.timeout || DEFAULT_TIMEOUT2;
    this.transport = opts.transport || global2.WebSocket || LongPoll;
    this.conn = void 0;
    this.primaryPassedHealthCheck = false;
    this.longPollFallbackMs = opts.longPollFallbackMs;
    this.fallbackTimer = null;
    let envSessionStorage = null;
    try {
      envSessionStorage = global2 && global2.sessionStorage;
    } catch {
    }
    this.sessionStore = opts.sessionStorage || envSessionStorage;
    this.establishedConnections = 0;
    this.defaultEncoder = serializer_default2.encode.bind(serializer_default2);
    this.defaultDecoder = serializer_default2.decode.bind(serializer_default2);
    this.closeWasClean = true;
    this.disconnecting = false;
    this.binaryType = opts.binaryType || "arraybuffer";
    this.connectClock = 1;
    this.pageHidden = false;
    this.encode = void 0;
    this.decode = void 0;
    if (this.transport !== LongPoll) {
      this.encode = opts.encode || this.defaultEncoder;
      this.decode = opts.decode || this.defaultDecoder;
    } else {
      this.encode = this.defaultEncoder;
      this.decode = this.defaultDecoder;
    }
    let awaitingConnectionOnPageShow = null;
    if (phxWindow && phxWindow.addEventListener) {
      phxWindow.addEventListener("pagehide", (_e) => {
        if (this.conn) {
          this.disconnect();
          awaitingConnectionOnPageShow = this.connectClock;
        }
      });
      phxWindow.addEventListener("pageshow", (_e) => {
        if (awaitingConnectionOnPageShow === this.connectClock) {
          awaitingConnectionOnPageShow = null;
          this.connect();
        }
      });
      phxWindow.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.pageHidden = true;
        } else {
          this.pageHidden = false;
          if (!this.isConnected() && !this.closeWasClean) {
            this.teardown(() => this.connect());
          }
        }
      });
    }
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs || 3e4;
    this.autoSendHeartbeat = opts.autoSendHeartbeat ?? true;
    this.heartbeatCallback = opts.heartbeatCallback ?? (() => {
    });
    this.rejoinAfterMs = (tries) => {
      if (opts.rejoinAfterMs) {
        return opts.rejoinAfterMs(tries);
      } else {
        return [1e3, 2e3, 5e3][tries - 1] || 1e4;
      }
    };
    this.reconnectAfterMs = (tries) => {
      if (opts.reconnectAfterMs) {
        return opts.reconnectAfterMs(tries);
      } else {
        return [10, 50, 100, 150, 200, 250, 500, 1e3, 2e3][tries - 1] || 5e3;
      }
    };
    this.logger = opts.logger || null;
    if (!this.logger && opts.debug) {
      this.logger = (kind, msg, data) => {
        console.log(`${kind}: ${msg}`, data);
      };
    }
    this.longpollerTimeout = opts.longpollerTimeout || 2e4;
    this.params = closure(opts.params || {});
    this.endPoint = `${endPoint}/${TRANSPORTS.websocket}`;
    this.vsn = opts.vsn || DEFAULT_VSN2;
    this.heartbeatTimeoutTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatSentAt = null;
    this.pendingHeartbeatRef = null;
    this.reconnectTimer = new Timer(() => {
      if (this.pageHidden) {
        this.log("Not reconnecting as page is hidden!");
        this.teardown();
        return;
      }
      this.teardown(async () => {
        if (opts.beforeReconnect) await opts.beforeReconnect();
        this.connect();
      });
    }, this.reconnectAfterMs);
    this.authToken = opts.authToken && closure(opts.authToken);
  }
  /**
   * Returns the LongPoll transport reference
   */
  getLongPollTransport() {
    return LongPoll;
  }
  /**
   * Disconnects and replaces the active transport
   *
   * @param {SocketTransport} newTransport - The new transport class to instantiate
   *
   */
  replaceTransport(newTransport) {
    this.connectClock++;
    this.closeWasClean = true;
    clearTimeout(this.fallbackTimer);
    this.reconnectTimer.reset();
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    this.transport = newTransport;
  }
  /**
   * Returns the socket protocol
   *
   * @returns {"wss" | "ws"}
   */
  protocol() {
    return location.protocol.match(/^https/) ? "wss" : "ws";
  }
  /**
   * The fully qualified socket url
   *
   * @returns {string}
   */
  endPointURL() {
    let uri = Ajax.appendParams(
      Ajax.appendParams(this.endPoint, this.params()),
      { vsn: this.vsn }
    );
    if (uri.charAt(0) !== "/") {
      return uri;
    }
    if (uri.charAt(1) === "/") {
      return `${this.protocol()}:${uri}`;
    }
    return `${this.protocol()}://${location.host}${uri}`;
  }
  /**
   * Disconnects the socket
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes for valid status codes.
   *
   * @param {() => void} [callback] - Optional callback which is called after socket is disconnected.
   * @param {number} [code] - A status code for disconnection (Optional).
   * @param {string} [reason] - A textual description of the reason to disconnect. (Optional)
   */
  disconnect(callback, code, reason) {
    this.connectClock++;
    this.disconnecting = true;
    this.closeWasClean = true;
    clearTimeout(this.fallbackTimer);
    this.reconnectTimer.reset();
    this.teardown(() => {
      this.disconnecting = false;
      callback && callback();
    }, code, reason);
  }
  /**
   * @param {Params} [params] - [DEPRECATED] The params to send when connecting, for example `{user_id: userToken}`
   *
   * Passing params to connect is deprecated; pass them in the Socket constructor instead:
   * `new Socket("/socket", {params: {user_id: userToken}})`.
   */
  connect(params) {
    if (params) {
      console && console.log("passing params to connect is deprecated. Instead pass :params to the Socket constructor");
      this.params = closure(params);
    }
    if (this.conn && !this.disconnecting) {
      return;
    }
    if (this.longPollFallbackMs && this.transport !== LongPoll) {
      this.connectWithFallback(LongPoll, this.longPollFallbackMs);
    } else {
      this.transportConnect();
    }
  }
  /**
   * Logs the message. Override `this.logger` for specialized logging. noops by default
   * @param {string} kind
   * @param {string} msg
   * @param {Object} data
   */
  log(kind, msg, data) {
    this.logger && this.logger(kind, msg, data);
  }
  /**
   * Returns true if a logger has been set on this socket.
   */
  hasLogger() {
    return this.logger !== null;
  }
  /**
   * Registers callbacks for connection open events
   *
   * @example socket.onOpen(function(){ console.info("the socket was opened") })
   *
   * @param {SocketOnOpen} callback
   */
  onOpen(callback) {
    let ref = this.makeRef();
    this.stateChangeCallbacks.open.push([ref, callback]);
    return ref;
  }
  /**
   * Registers callbacks for connection close events
   * @param {SocketOnClose} callback
   * @returns {string}
   */
  onClose(callback) {
    let ref = this.makeRef();
    this.stateChangeCallbacks.close.push([ref, callback]);
    return ref;
  }
  /**
   * Registers callbacks for connection error events
   *
   * @example socket.onError(function(error){ alert("An error occurred") })
   *
   * @param {SocketOnError} callback
   * @returns {string}
   */
  onError(callback) {
    let ref = this.makeRef();
    this.stateChangeCallbacks.error.push([ref, callback]);
    return ref;
  }
  /**
   * Registers callbacks for connection message events
   * @param {SocketOnMessage} callback
   * @returns {string}
   */
  onMessage(callback) {
    let ref = this.makeRef();
    this.stateChangeCallbacks.message.push([ref, callback]);
    return ref;
  }
  /**
   * Sets a callback that receives lifecycle events for internal heartbeat messages.
   * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
   * @param {HeartbeatCallback} callback
   */
  onHeartbeat(callback) {
    this.heartbeatCallback = callback;
  }
  /**
   * Pings the server and invokes the callback with the RTT in milliseconds
   * @param {(timeDelta: number) => void} callback
   *
   * Returns true if the ping was pushed or false if unable to be pushed.
   */
  ping(callback) {
    if (!this.isConnected()) {
      return false;
    }
    let ref = this.makeRef();
    let startTime = Date.now();
    this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref });
    let onMsgRef = this.onMessage((msg) => {
      if (msg.ref === ref) {
        this.off([onMsgRef]);
        callback(Date.now() - startTime);
      }
    });
    return true;
  }
  /**
   * @private
   *
   * @param {Function}
   */
  transportName(transport) {
    switch (transport) {
      case LongPoll:
        return "LongPoll";
      default:
        return transport.name;
    }
  }
  /**
   * @private
   */
  transportConnect() {
    this.connectClock++;
    this.closeWasClean = false;
    let protocols = void 0;
    if (this.authToken) {
      protocols = ["phoenix", `${AUTH_TOKEN_PREFIX}${btoa(this.authToken()).replace(/=/g, "")}`];
    }
    this.conn = new this.transport(this.endPointURL(), protocols);
    this.conn.binaryType = this.binaryType;
    this.conn.timeout = this.longpollerTimeout;
    this.conn.onopen = () => this.onConnOpen();
    this.conn.onerror = (error) => this.onConnError(error);
    this.conn.onmessage = (event) => this.onConnMessage(event);
    this.conn.onclose = (event) => this.onConnClose(event);
  }
  getSession(key) {
    return this.sessionStore && this.sessionStore.getItem(key);
  }
  storeSession(key, val) {
    this.sessionStore && this.sessionStore.setItem(key, val);
  }
  connectWithFallback(fallbackTransport, fallbackThreshold = 2500) {
    clearTimeout(this.fallbackTimer);
    let established = false;
    let primaryTransport = true;
    let openRef, errorRef;
    let fallbackTransportName = this.transportName(fallbackTransport);
    let fallback2 = (reason) => {
      this.log("transport", `falling back to ${fallbackTransportName}...`, reason);
      this.off([openRef, errorRef]);
      primaryTransport = false;
      this.replaceTransport(fallbackTransport);
      this.transportConnect();
    };
    if (this.getSession(`phx:fallback:${fallbackTransportName}`)) {
      return fallback2("memorized");
    }
    this.fallbackTimer = setTimeout(fallback2, fallbackThreshold);
    errorRef = this.onError((reason) => {
      this.log("transport", "error", reason);
      if (primaryTransport && !established) {
        clearTimeout(this.fallbackTimer);
        fallback2(reason);
      }
    });
    if (this.fallbackRef) {
      this.off([this.fallbackRef]);
    }
    this.fallbackRef = this.onOpen(() => {
      established = true;
      if (!primaryTransport) {
        let fallbackTransportName2 = this.transportName(fallbackTransport);
        if (!this.primaryPassedHealthCheck) {
          this.storeSession(`phx:fallback:${fallbackTransportName2}`, "true");
        }
        return this.log("transport", `established ${fallbackTransportName2} fallback`);
      }
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = setTimeout(fallback2, fallbackThreshold);
      this.ping((rtt) => {
        this.log("transport", "connected to primary after", rtt);
        this.primaryPassedHealthCheck = true;
        clearTimeout(this.fallbackTimer);
      });
    });
    this.transportConnect();
  }
  clearHeartbeats() {
    clearTimeout(this.heartbeatTimer);
    clearTimeout(this.heartbeatTimeoutTimer);
  }
  onConnOpen() {
    if (this.hasLogger()) this.log("transport", `connected to ${this.endPointURL()}`);
    this.closeWasClean = false;
    this.disconnecting = false;
    this.establishedConnections++;
    this.flushSendBuffer();
    this.reconnectTimer.reset();
    if (this.autoSendHeartbeat) {
      this.resetHeartbeat();
    }
    this.triggerStateCallbacks("open");
  }
  /**
   * @private
   */
  heartbeatTimeout() {
    if (this.pendingHeartbeatRef) {
      this.pendingHeartbeatRef = null;
      this.heartbeatSentAt = null;
      if (this.hasLogger()) {
        this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
      }
      try {
        this.heartbeatCallback("timeout");
      } catch (e) {
        this.log("error", "error in heartbeat callback", e);
      }
      this.triggerChanError(new Error("heartbeat timeout"));
      this.closeWasClean = false;
      this.teardown(() => this.reconnectTimer.scheduleTimeout(), WS_CLOSE_NORMAL, "heartbeat timeout");
    }
  }
  resetHeartbeat() {
    if (this.conn && this.conn.skipHeartbeat) {
      return;
    }
    this.pendingHeartbeatRef = null;
    this.clearHeartbeats();
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }
  teardown(callback, code, reason) {
    if (!this.conn) {
      return callback && callback();
    }
    const connToClose = this.conn;
    this.waitForBufferDone(connToClose, () => {
      if (code) {
        connToClose.close(code, reason || "");
      } else {
        connToClose.close();
      }
      this.waitForSocketClosed(connToClose, () => {
        if (this.conn === connToClose) {
          this.conn.onopen = function() {
          };
          this.conn.onerror = function() {
          };
          this.conn.onmessage = function() {
          };
          this.conn.onclose = function() {
          };
          this.conn = null;
        }
        callback && callback();
      });
    });
  }
  waitForBufferDone(conn, callback, tries = 1) {
    if (tries === 5 || !conn.bufferedAmount) {
      callback();
      return;
    }
    setTimeout(() => {
      this.waitForBufferDone(conn, callback, tries + 1);
    }, 150 * tries);
  }
  waitForSocketClosed(conn, callback, tries = 1) {
    if (tries === 5 || conn.readyState === SOCKET_STATES.closed) {
      callback();
      return;
    }
    setTimeout(() => {
      this.waitForSocketClosed(conn, callback, tries + 1);
    }, 150 * tries);
  }
  /**
  * @param {CloseEvent} event
  */
  onConnClose(event) {
    if (this.conn) this.conn.onclose = () => {
    };
    if (this.hasLogger()) this.log("transport", "close", event);
    this.triggerChanError(event);
    this.clearHeartbeats();
    if (!this.closeWasClean) {
      this.reconnectTimer.scheduleTimeout();
    }
    this.triggerStateCallbacks("close", event);
  }
  /**
   * @private
   * @param {Event} error
   */
  onConnError(error) {
    if (this.hasLogger()) this.log("transport", "error", error);
    let transportBefore = this.transport;
    let establishedBefore = this.establishedConnections;
    this.triggerStateCallbacks("error", error, transportBefore, establishedBefore);
    if (transportBefore === this.transport || establishedBefore > 0) {
      this.triggerChanError(error);
    }
  }
  /**
   * @private
   * @param {unknown} [reason] underlying close/error event forwarded to channel error listeners
   */
  triggerChanError(reason) {
    this.channels.forEach((channel) => {
      if (!(channel.isErrored() || channel.isLeaving() || channel.isClosed())) {
        channel.trigger(CHANNEL_EVENTS2.error, reason);
      }
    });
  }
  /**
   * @returns {string}
   */
  connectionState() {
    switch (this.conn && this.conn.readyState) {
      case SOCKET_STATES.connecting:
        return "connecting";
      case SOCKET_STATES.open:
        return "open";
      case SOCKET_STATES.closing:
        return "closing";
      default:
        return "closed";
    }
  }
  /**
   * @returns {boolean}
   */
  isConnected() {
    return this.connectionState() === "open";
  }
  /**
   *
   * @param {Channel} channel
   */
  remove(channel) {
    this.off(channel.stateChangeRefs);
    this.channels = this.channels.filter((c) => c !== channel);
  }
  /**
   * Removes `onOpen`, `onClose`, `onError,` and `onMessage` registrations.
   *
   * @param {string[]} refs - list of refs returned by calls to
   *                 `onOpen`, `onClose`, `onError,` and `onMessage`
   */
  off(refs) {
    for (let key in this.stateChangeCallbacks) {
      this.stateChangeCallbacks[key] = this.stateChangeCallbacks[key].filter(([ref]) => {
        return refs.indexOf(ref) === -1;
      });
    }
  }
  /**
   * Initiates a new channel for the given topic
   *
   * @param {string} topic
   * @param {Params | (() => Params)} [chanParams]- Parameters for the channel
   * @returns {Channel}
   */
  channel(topic, chanParams = {}) {
    let chan = new Channel(topic, chanParams, this);
    this.channels.push(chan);
    return chan;
  }
  /**
   * @param {Message<Record<string, any>>} data
   */
  push(data) {
    if (this.hasLogger()) {
      let { topic, event, payload, ref, join_ref } = data;
      this.log("push", `${topic} ${event} (${join_ref}, ${ref})`, payload);
    }
    if (this.isConnected()) {
      this.encode(data, (result) => this.conn.send(result));
    } else {
      this.sendBuffer.push(() => this.encode(data, (result) => this.conn.send(result)));
    }
  }
  /**
   * Return the next message ref, accounting for overflows
   * @returns {string}
   */
  makeRef() {
    let newRef = this.ref + 1;
    if (newRef === this.ref) {
      this.ref = 0;
    } else {
      this.ref = newRef;
    }
    return this.ref.toString();
  }
  sendHeartbeat() {
    if (!this.isConnected()) {
      try {
        this.heartbeatCallback("disconnected");
      } catch (e) {
        this.log("error", "error in heartbeat callback", e);
      }
      return;
    }
    if (this.pendingHeartbeatRef) {
      this.heartbeatTimeout();
      return;
    }
    this.pendingHeartbeatRef = this.makeRef();
    this.heartbeatSentAt = Date.now();
    this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.pendingHeartbeatRef });
    try {
      this.heartbeatCallback("sent");
    } catch (e) {
      this.log("error", "error in heartbeat callback", e);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => this.heartbeatTimeout(), this.heartbeatIntervalMs);
  }
  flushSendBuffer() {
    if (this.isConnected() && this.sendBuffer.length > 0) {
      this.sendBuffer.forEach((callback) => callback());
      this.sendBuffer = [];
    }
  }
  /**
  * @param {MessageEvent<any>} rawMessage
  */
  onConnMessage(rawMessage) {
    this.decode(rawMessage.data, (msg) => {
      let { topic, event, payload, ref, join_ref } = msg;
      if (ref && ref === this.pendingHeartbeatRef) {
        const latency = this.heartbeatSentAt ? Date.now() - this.heartbeatSentAt : void 0;
        this.clearHeartbeats();
        try {
          this.heartbeatCallback(payload.status === "ok" ? "ok" : "error", latency);
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
        this.pendingHeartbeatRef = null;
        this.heartbeatSentAt = null;
        if (this.autoSendHeartbeat) {
          this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
        }
      }
      if (this.hasLogger()) this.log("receive", `${payload.status || ""} ${topic} ${event} ${ref && "(" + ref + ")" || ""}`.trim(), payload);
      for (let i = 0; i < this.channels.length; i++) {
        const channel = this.channels[i];
        if (!channel.isMember(topic, event, payload, join_ref)) {
          continue;
        }
        channel.trigger(event, payload, ref, join_ref);
      }
      this.triggerStateCallbacks("message", msg);
    });
  }
  /**
   * @private
   * @template {keyof SocketStateChangeCallbacks} K
   * @param {K} event
   * @param {...Parameters<SocketStateChangeCallbacks[K][number][1]>} args
   * @returns {void}
   */
  triggerStateCallbacks(event, ...args) {
    try {
      this.stateChangeCallbacks[event].forEach(([_, callback]) => {
        try {
          callback(...args);
        } catch (e) {
          this.log("error", `error in ${event} callback`, e);
        }
      });
    } catch (e) {
      this.log("error", `error triggering ${event} callbacks`, e);
    }
  }
  leaveOpenTopic(topic) {
    let dupChannel = this.channels.find((c) => c.topic === topic && (c.isJoined() || c.isJoining()));
    if (dupChannel) {
      if (this.hasLogger()) this.log("transport", `leaving duplicate topic "${topic}"`);
      dupChannel.leave();
    }
  }
};
var PresenceAdapter = class _PresenceAdapter {
  constructor(channel, opts) {
    const phoenixOptions = phoenixPresenceOptions(opts);
    this.presence = new Presence(channel.getChannel(), phoenixOptions);
    this.presence.onJoin((key, currentPresence, newPresence) => {
      const onJoinPayload = _PresenceAdapter.onJoinPayload(key, currentPresence, newPresence);
      channel.getChannel().trigger("presence", onJoinPayload);
    });
    this.presence.onLeave((key, currentPresence, leftPresence) => {
      const onLeavePayload = _PresenceAdapter.onLeavePayload(key, currentPresence, leftPresence);
      channel.getChannel().trigger("presence", onLeavePayload);
    });
    this.presence.onSync(() => {
      channel.getChannel().trigger("presence", { event: "sync" });
    });
  }
  get state() {
    return _PresenceAdapter.transformState(this.presence.state);
  }
  /**
   * @private
   * Remove 'metas' key
   * Change 'phx_ref' to 'presence_ref'
   * Remove 'phx_ref' and 'phx_ref_prev'
   *
   * @example Transform state
   * // returns {
   *  abc123: [
   *    { presence_ref: '2', user_id: 1 },
   *    { presence_ref: '3', user_id: 2 }
   *  ]
   * }
   * RealtimePresence.transformState({
   *  abc123: {
   *    metas: [
   *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
   *      { phx_ref: '3', user_id: 2 }
   *    ]
   *  }
   * })
   *
   */
  static transformState(state) {
    state = cloneState(state);
    return Object.getOwnPropertyNames(state).reduce((newState, key) => {
      const presences = state[key];
      newState[key] = transformState(presences);
      return newState;
    }, {});
  }
  static onJoinPayload(key, currentPresence, newPresence) {
    const currentPresences = parseCurrentPresences(currentPresence);
    const newPresences = transformState(newPresence);
    return {
      event: "join",
      key,
      currentPresences,
      newPresences
    };
  }
  static onLeavePayload(key, currentPresence, leftPresence) {
    const currentPresences = parseCurrentPresences(currentPresence);
    const leftPresences = transformState(leftPresence);
    return {
      event: "leave",
      key,
      currentPresences,
      leftPresences
    };
  }
};
function transformState(presences) {
  return presences.metas.map((presence) => {
    const descriptors = Object.getOwnPropertyDescriptors(presence);
    const transformedPresence = Object.defineProperties({}, descriptors);
    transformedPresence["presence_ref"] = transformedPresence["phx_ref"];
    delete transformedPresence["phx_ref"];
    delete transformedPresence["phx_ref_prev"];
    return transformedPresence;
  });
}
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
function phoenixPresenceOptions(opts) {
  return (opts === null || opts === void 0 ? void 0 : opts.events) && { events: opts.events };
}
function parseCurrentPresences(currentPresences) {
  return (currentPresences === null || currentPresences === void 0 ? void 0 : currentPresences.metas) ? transformState(currentPresences) : [];
}
var REALTIME_PRESENCE_LISTEN_EVENTS;
(function(REALTIME_PRESENCE_LISTEN_EVENTS2) {
  REALTIME_PRESENCE_LISTEN_EVENTS2["SYNC"] = "sync";
  REALTIME_PRESENCE_LISTEN_EVENTS2["JOIN"] = "join";
  REALTIME_PRESENCE_LISTEN_EVENTS2["LEAVE"] = "leave";
})(REALTIME_PRESENCE_LISTEN_EVENTS || (REALTIME_PRESENCE_LISTEN_EVENTS = {}));
var RealtimePresence = class {
  get state() {
    return this.presenceAdapter.state;
  }
  /**
   * Creates a Presence helper that keeps the local presence state in sync with the server.
   *
   * @param channel - The realtime channel to bind to.
   * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
   *
   * @category Realtime
   *
   * @example Example for a presence channel
   * ```ts
   * const presence = new RealtimePresence(channel)
   *
   * channel.on('presence', ({ event, key }) => {
   *   console.log(`Presence ${event} on ${key}`)
   * })
   * ```
   */
  constructor(channel, opts) {
    this.channel = channel;
    this.presenceAdapter = new PresenceAdapter(this.channel.channelAdapter, opts);
  }
};
function normalizeChannelError(reason) {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === "string") {
    return new Error(reason);
  }
  if (reason && typeof reason === "object") {
    const obj = reason;
    if (typeof obj.code === "number") {
      const detail = typeof obj.reason === "string" && obj.reason ? ` (${obj.reason})` : "";
      return new Error(`socket closed: ${obj.code}${detail}`, { cause: reason });
    }
    return new Error("channel error: transport failure", { cause: reason });
  }
  return new Error("channel error: connection lost");
}
var ChannelAdapter = class {
  constructor(socket, topic, params) {
    const phoenixParams = phoenixChannelParams(params);
    this.channel = socket.getSocket().channel(topic, phoenixParams);
    this.socket = socket;
  }
  get state() {
    return this.channel.state;
  }
  set state(state) {
    this.channel.state = state;
  }
  get joinedOnce() {
    return this.channel.joinedOnce;
  }
  get joinPush() {
    return this.channel.joinPush;
  }
  get rejoinTimer() {
    return this.channel.rejoinTimer;
  }
  on(event, callback) {
    return this.channel.on(event, callback);
  }
  off(event, refNumber) {
    this.channel.off(event, refNumber);
  }
  subscribe(timeout) {
    return this.channel.join(timeout);
  }
  unsubscribe(timeout) {
    return this.channel.leave(timeout);
  }
  teardown() {
    this.channel.teardown();
  }
  onClose(callback) {
    this.channel.onClose(callback);
  }
  onError(callback) {
    return this.channel.onError(callback);
  }
  push(event, payload, timeout) {
    let push;
    try {
      push = this.channel.push(event, payload, timeout);
    } catch (error) {
      throw new Error(`tried to push '${event}' to '${this.channel.topic}' before joining. Use channel.subscribe() before pushing events`);
    }
    if (this.channel.pushBuffer.length > MAX_PUSH_BUFFER_SIZE) {
      const removedPush = this.channel.pushBuffer.shift();
      removedPush.cancelTimeout();
      this.socket.log("channel", `discarded push due to buffer overflow: ${removedPush.event}`, removedPush.payload());
    }
    return push;
  }
  updateJoinPayload(payload) {
    const oldPayload = this.channel.joinPush.payload();
    this.channel.joinPush.payload = () => Object.assign(Object.assign({}, oldPayload), payload);
  }
  canPush() {
    return this.socket.isConnected() && this.state === CHANNEL_STATES.joined;
  }
  isJoined() {
    return this.state === CHANNEL_STATES.joined;
  }
  isJoining() {
    return this.state === CHANNEL_STATES.joining;
  }
  isClosed() {
    return this.state === CHANNEL_STATES.closed;
  }
  isLeaving() {
    return this.state === CHANNEL_STATES.leaving;
  }
  updateFilterBindings(filterBindings) {
    this.channel.filterBindings = filterBindings;
  }
  updatePayloadTransform(callback) {
    this.channel.onMessage = callback;
  }
  /**
   * @internal
   */
  getChannel() {
    return this.channel;
  }
};
function phoenixChannelParams(options) {
  return {
    config: Object.assign({
      broadcast: { ack: false, self: false },
      presence: { key: "", enabled: false },
      private: false
    }, options.config)
  };
}
var PostgrestReservedCharsRegexp = /[,()"\\]/;
var needsQuoting = (value) => PostgrestReservedCharsRegexp.test(value) || value !== value.trim();
var quote = (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
var serializeScalar = (value) => {
  const serialized = value === null ? "null" : String(value);
  return needsQuoting(serialized) ? quote(serialized) : serialized;
};
var serializeIsValue = (value) => value === null ? "null" : String(value);
var serialize = (operator, value) => {
  if (operator === "in") {
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0) {
      throw new Error("Realtime `in` filter requires at least one value.");
    }
    const items = Array.from(new Set(values)).map((v) => serializeScalar(v)).join(",");
    return `in.(${items})`;
  }
  if (operator === "is") {
    return `is.${serializeIsValue(value)}`;
  }
  return `${operator}.${serializeScalar(value)}`;
};
var RealtimePostgresFilterBuilder = class {
  constructor() {
    this.filters = [];
  }
  add(column, operator, value, negate = false) {
    const prefix = negate ? "not." : "";
    this.filters.push(`${column}=${prefix}${serialize(operator, value)}`);
    return this;
  }
  /** Match rows where `column` equals `value` (`column=eq.value`). */
  eq(column, value) {
    return this.add(column, "eq", value);
  }
  /** Match rows where `column` does not equal `value` (`column=neq.value`). */
  neq(column, value) {
    return this.add(column, "neq", value);
  }
  /** Match rows where `column` is greater than `value` (`column=gt.value`). */
  gt(column, value) {
    return this.add(column, "gt", value);
  }
  /** Match rows where `column` is greater than or equal to `value` (`column=gte.value`). */
  gte(column, value) {
    return this.add(column, "gte", value);
  }
  /** Match rows where `column` is less than `value` (`column=lt.value`). */
  lt(column, value) {
    return this.add(column, "lt", value);
  }
  /** Match rows where `column` is less than or equal to `value` (`column=lte.value`). */
  lte(column, value) {
    return this.add(column, "lte", value);
  }
  /**
   * Match rows where `column` is one of `values` (`column=in.(a,b,c)`).
   * Requires at least one value; duplicates are removed. An element containing a
   * reserved character is double-quoted (`in.("a,b",c)`), so commas inside an
   * element are preserved. `null` is intentionally not accepted (`IN (null)`
   * never matches in SQL) — use `is`/`not('col','is',null)` for null checks.
   */
  in(column, values) {
    return this.add(column, "in", values);
  }
  /** Match rows where `column` matches the case-sensitive `pattern` (`column=like.pattern`). */
  like(column, pattern) {
    return this.add(column, "like", pattern);
  }
  /** Match rows where `column` matches the case-insensitive `pattern` (`column=ilike.pattern`). */
  ilike(column, pattern) {
    return this.add(column, "ilike", pattern);
  }
  /** Match rows where `column` matches the POSIX regex `pattern` (`column=match.pattern`). */
  match(column, pattern) {
    return this.add(column, "match", pattern);
  }
  /** Match rows where `column` matches the case-insensitive POSIX regex `pattern` (`column=imatch.pattern`). */
  imatch(column, pattern) {
    return this.add(column, "imatch", pattern);
  }
  /**
   * Match rows where `column` `IS` the given value (`column=is.null`).
   * Accepts `null`, a boolean, or the keywords `'null' | 'true' | 'false' | 'unknown'`.
   */
  is(column, value) {
    return this.add(column, "is", value);
  }
  /** Match rows where `column` is distinct from `value` (`column=isdistinct.value`). NULL-safe inequality. */
  isDistinct(column, value) {
    return this.add(column, "isdistinct", value);
  }
  not(column, operator, value) {
    return this.add(column, operator, value, true);
  }
  /**
   * Serialize all conditions into the comma-separated (AND) filter string.
   *
   * Conditions are joined by commas, which the server applies as `AND`. A scalar
   * value (or single `in` element) that contains a reserved character — `,`,
   * `(`, `)`, `"`, `\` — or surrounding whitespace is double-quoted and escaped
   * the way PostgREST does, so commas inside a value are preserved rather than
   * read as a condition boundary.
   */
  build() {
    return this.filters.join(",");
  }
  /** Alias for {@link build}; lets the builder be used wherever a string is expected. */
  toString() {
    return this.build();
  }
};
var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
(function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2) {
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["ALL"] = "*";
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["INSERT"] = "INSERT";
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["UPDATE"] = "UPDATE";
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["DELETE"] = "DELETE";
})(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT || (REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}));
var REALTIME_LISTEN_TYPES;
(function(REALTIME_LISTEN_TYPES2) {
  REALTIME_LISTEN_TYPES2["BROADCAST"] = "broadcast";
  REALTIME_LISTEN_TYPES2["PRESENCE"] = "presence";
  REALTIME_LISTEN_TYPES2["POSTGRES_CHANGES"] = "postgres_changes";
  REALTIME_LISTEN_TYPES2["SYSTEM"] = "system";
})(REALTIME_LISTEN_TYPES || (REALTIME_LISTEN_TYPES = {}));
var REALTIME_SUBSCRIBE_STATES;
(function(REALTIME_SUBSCRIBE_STATES2) {
  REALTIME_SUBSCRIBE_STATES2["SUBSCRIBED"] = "SUBSCRIBED";
  REALTIME_SUBSCRIBE_STATES2["TIMED_OUT"] = "TIMED_OUT";
  REALTIME_SUBSCRIBE_STATES2["CLOSED"] = "CLOSED";
  REALTIME_SUBSCRIBE_STATES2["CHANNEL_ERROR"] = "CHANNEL_ERROR";
})(REALTIME_SUBSCRIBE_STATES || (REALTIME_SUBSCRIBE_STATES = {}));
var RealtimeChannel = class _RealtimeChannel {
  get state() {
    return this.channelAdapter.state;
  }
  set state(state) {
    this.channelAdapter.state = state;
  }
  get joinedOnce() {
    return this.channelAdapter.joinedOnce;
  }
  get timeout() {
    return this.socket.timeout;
  }
  get joinPush() {
    return this.channelAdapter.joinPush;
  }
  get rejoinTimer() {
    return this.channelAdapter.rejoinTimer;
  }
  /**
   * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
   *
   * The topic determines which realtime stream you are subscribing to. Config options let you
   * enable acknowledgement for broadcasts, presence tracking, or private channels.
   *
   * @category Realtime
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const channel = supabase.channel('room1')
   * channel
   *   .on('broadcast', { event: 'cursor-pos' }, (payload) => console.log(payload))
   *   .subscribe()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'your-publishable-key' },
   * })
   * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
   * ```
   */
  constructor(topic, params = { config: {} }, socket) {
    var _a, _b;
    this.topic = topic;
    this.params = params;
    this.socket = socket;
    this.bindings = {};
    this.subTopic = topic.replace(/^realtime:/i, "");
    this.params.config = Object.assign({
      broadcast: { ack: false, self: false },
      presence: { key: "", enabled: false },
      private: false
    }, params.config);
    this.channelAdapter = new ChannelAdapter(this.socket.socketAdapter, topic, this.params);
    this.presence = new RealtimePresence(this);
    this._onClose(() => {
      this.socket._remove(this);
    });
    this._updateFilterTransform();
    this.broadcastEndpointURL = httpEndpointURL(this.socket.socketAdapter.endPointURL());
    this.private = this.params.config.private || false;
    if (!this.private && ((_b = (_a = this.params.config) === null || _a === void 0 ? void 0 : _a.broadcast) === null || _b === void 0 ? void 0 : _b.replay)) {
      throw new Error(`tried to use replay on public channel '${this.topic}'. It must be a private channel.`);
    }
  }
  /**
   * Subscribe registers your client with the server.
   *
   * The optional `callback` receives a `status` and, on failure, an `err` argument.
   * Log the full `err` so its `cause`, `name`, and any structured fields aren't hidden
   * behind `err.message`.
   *
   * @category Realtime
   *
   * @example Handling errors
   * ```js
   * supabase.channel('room1').subscribe((status, err) => {
   *   if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
   *     // Log the full error: its `cause` often holds the underlying reason.
   *     console.error(status, err)
   *   }
   * })
   * ```
   */
  subscribe(callback, timeout = this.timeout) {
    var _a, _b, _c, _d;
    if (!this.socket.isConnected()) {
      this.socket.connect();
    }
    if (this.channelAdapter.isClosed()) {
      const { config: { broadcast, presence, private: isPrivate, postgres_changes_options } } = this.params;
      const postgres_changes = (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [];
      const presence_enabled = !!this.bindings[REALTIME_LISTEN_TYPES.PRESENCE] && this.bindings[REALTIME_LISTEN_TYPES.PRESENCE].length > 0 || ((_c = this.params.config.presence) === null || _c === void 0 ? void 0 : _c.enabled) === true;
      const accessTokenPayload = {};
      const config = Object.assign({ broadcast, presence: Object.assign(Object.assign({}, presence), { enabled: presence_enabled }), postgres_changes, private: isPrivate }, postgres_changes_options ? { postgres_changes_options } : {});
      if (this.socket.accessTokenValue) {
        accessTokenPayload.access_token = this.socket.accessTokenValue;
      }
      this._onError((reason) => {
        callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, normalizeChannelError(reason));
      });
      this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CLOSED));
      this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
      this._updateFilterMessage();
      const joinTimeout = (postgres_changes_options === null || postgres_changes_options === void 0 ? void 0 : postgres_changes_options.wait) && postgres_changes.length > 0 ? Math.max(timeout, ((_d = postgres_changes_options.timeout) !== null && _d !== void 0 ? _d : DEFAULT_POSTGRES_CHANGES_WAIT_TIMEOUT) + POSTGRES_CHANGES_WAIT_ERROR_GRACE) : timeout;
      this.channelAdapter.subscribe(joinTimeout).receive("ok", async ({ postgres_changes: postgres_changes2 }) => {
        if (!this.socket._isManualToken()) {
          this.socket.setAuth();
        }
        if (postgres_changes2 === void 0) {
          callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
          return;
        }
        this._updatePostgresBindings(postgres_changes2, callback);
      }).receive("error", (error) => {
        this.state = CHANNEL_STATES.errored;
        const message = Object.values(error).join(", ") || "error";
        callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error(message, { cause: error }));
      }).receive("timeout", () => {
        callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
      });
    }
    return this;
  }
  _updatePostgresBindings(postgres_changes, callback) {
    var _a;
    const clientPostgresBindings = this.bindings.postgres_changes;
    const bindingsLen = (_a = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a !== void 0 ? _a : 0;
    const newPostgresBindings = [];
    for (let i = 0; i < bindingsLen; i++) {
      const clientPostgresBinding = clientPostgresBindings[i];
      const { filter: { event, schema, table, filter } } = clientPostgresBinding;
      const serverPostgresFilter = postgres_changes && postgres_changes[i];
      if (serverPostgresFilter && serverPostgresFilter.event === event && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.schema, schema) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.table, table) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.filter, filter)) {
        newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
      } else {
        this.unsubscribe();
        this.state = CHANNEL_STATES.errored;
        callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
        return;
      }
    }
    this.bindings.postgres_changes = newPostgresBindings;
    if (this.state != CHANNEL_STATES.errored && callback) {
      callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    }
  }
  /**
   * Returns the current presence state for this channel.
   *
   * The shape is a map keyed by presence key (for example a user id) where each entry contains the
   * tracked metadata for that user.
   *
   * @category Realtime
   */
  presenceState() {
    return this.presence.state;
  }
  /**
   * Sends the supplied payload to the presence tracker so other subscribers can see that this
   * client is online. Use `untrack` to stop broadcasting presence for the same key.
   *
   * Tracking makes this client visible to other subscribers immediately, regardless of this
   * channel's `config.presence.enabled` setting or whether it has a `presence` listener — that
   * flag only affects whether *this* client receives presence updates from others (and, on
   * RLS-protected channels, whether it's authorized to do so).
   *
   * @category Realtime
   */
  async track(payload, opts = {}) {
    return await this.send({
      type: "presence",
      event: "track",
      payload
    }, opts);
  }
  /**
   * Removes the current presence state for this client.
   *
   * @category Realtime
   */
  async untrack(opts = {}) {
    return await this.send({
      type: "presence",
      event: "untrack"
    }, opts);
  }
  /**
   * Listen to realtime events on this channel.
   * @category Realtime
   *
   * @remarks
   * - By default, Broadcast and Presence are enabled for all projects.
   * - By default, listening to database changes is disabled for new projects due to database performance and security concerns. You can turn it on by managing Realtime's [replication](/docs/guides/api#realtime-api-overview).
   * - You can receive the "previous" data for updates and deletes by setting the table's `REPLICA IDENTITY` to `FULL` (e.g., `ALTER TABLE your_table REPLICA IDENTITY FULL;`).
   * - Row level security is not applied to delete statements. When RLS is enabled and replica identity is set to full, only the primary key is sent to clients.
   *
   * @example Listen to broadcast messages
   * ```js
   * const channel = supabase.channel("room1")
   *
   * channel.on("broadcast", { event: "cursor-pos" }, (payload) => {
   *   console.log("Cursor position received!", payload);
   * }).subscribe((status) => {
   *   if (status === "SUBSCRIBED") {
   *     channel.send({
   *       type: "broadcast",
   *       event: "cursor-pos",
   *       payload: { x: Math.random(), y: Math.random() },
   *     });
   *   }
   * });
   * ```
   *
   * @example Listen to presence sync
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'sync' }, () => {
   *     console.log('Synced presence state: ', channel.presenceState())
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *     }
   *   })
   * ```
   *
   * @example Listen to presence join
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'join' }, ({ newPresences }) => {
   *     console.log('Newly joined presences: ', newPresences)
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *     }
   *   })
   * ```
   *
   * @example Listen to presence leave
   * ```js
   * const channel = supabase.channel('room1')
   * channel
   *   .on('presence', { event: 'leave' }, ({ leftPresences }) => {
   *     console.log('Newly left presences: ', leftPresences)
   *   })
   *   .subscribe(async (status) => {
   *     if (status === 'SUBSCRIBED') {
   *       await channel.track({ online_at: new Date().toISOString() })
   *       await channel.untrack()
   *     }
   *   })
   * ```
   *
   * Registering the same `postgres_changes` filter more than once on a channel is a no-op: the
   * duplicate is ignored and an error is logged, since the server only ever creates one
   * subscription per distinct filter.
   *
   * @example Listen to all database changes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: '*', schema: '*' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @example Listen to a specific table
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: '*', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @example Listen to inserts
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to updates
   * By default, Supabase will send only the updated record. If you want to receive the previous values as well you can
   * enable full replication for the table you are listening to:
   *
   * ```sql
   * alter table "your_table" replica identity full;
   * ```
   *
   * @example Listen to updates
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to deletes
   * By default, Supabase does not send deleted records. If you want to receive the deleted record you can
   * enable full replication for the table you are listening to:
   *
   * ```sql
   * alter table "your_table" replica identity full;
   * ```
   *
   * @example Listen to deletes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'countries' }, payload => {
   *     console.log('Change received!', payload)
   *   })
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to multiple events
   * You can chain listeners if you want to listen to multiple events for each table.
   *
   * @example Listen to multiple events
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'countries' }, handleRecordInserted)
   *   .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'countries' }, handleRecordDeleted)
   *   .subscribe()
   * ```
   *
   * @exampleDescription Listen to row level changes
   * You can listen to individual rows using the format `{table}:{col}=eq.{val}` - where `{col}` is the column name, and `{val}` is the value which you want to match.
   *
   * @example Listen to row level changes
   * ```js
   * supabase
   *   .channel('room1')
   *   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'countries', filter: 'id=eq.200' }, handleRecordUpdated)
   *   .subscribe()
   * ```
   */
  on(type, filter, callback) {
    const stateCheck = this.channelAdapter.isJoined() || this.channelAdapter.isJoining();
    const typeCheck = type === REALTIME_LISTEN_TYPES.PRESENCE || type === REALTIME_LISTEN_TYPES.POSTGRES_CHANGES;
    if (stateCheck && typeCheck) {
      this.socket.log("channel", `cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
      throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    }
    return this._on(type, filter, callback);
  }
  /**
   * Sends a broadcast message explicitly via REST API.
   *
   * This method always uses the REST API endpoint regardless of WebSocket connection state.
   * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
   *
   * Payloads that are `ArrayBuffer` or `ArrayBufferView` (e.g. `Uint8Array`) are sent as
   * `application/octet-stream`; all other payloads are JSON-encoded.
   *
   * @param event The name of the broadcast event
   * @param payload Payload to be sent (required)
   * @param opts Options including timeout and persist
   * @returns Promise resolving to object with success status, and error details if failed
   *
   * @category Realtime
   */
  async httpSend(event, payload, opts = {}) {
    var _a;
    if (payload === void 0 || payload === null) {
      return Promise.reject(new Error("Payload is required for httpSend()"));
    }
    const isBinary = payload instanceof ArrayBuffer || ArrayBuffer.isView(payload);
    const headers = {
      apikey: this.socket.apiKey ? this.socket.apiKey : "",
      "Content-Type": isBinary ? "application/octet-stream" : "application/json"
    };
    if (this.socket.accessTokenValue) {
      headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
    }
    const url = new URL(this.broadcastEndpointURL);
    url.pathname += `/${encodeURIComponent(this.subTopic)}/events/${encodeURIComponent(event)}`;
    if (this.private) {
      url.searchParams.set("private", "true");
    }
    if (opts.persist) {
      if (!this.private) {
        return Promise.reject(new Error("Realtime httpSend() cannot store a message on a public channel."));
      }
      const ttl = typeof opts.persist === "object" ? opts.persist.ttl : void 0;
      if (ttl === void 0) {
        url.searchParams.set("persist", "true");
      } else {
        url.searchParams.set("persist[ttl]", String(ttl));
      }
    }
    const options = {
      method: "POST",
      headers,
      body: isBinary ? payload : JSON.stringify(payload)
    };
    const response = await this._fetchWithTimeout(url.toString(), options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
    if (response.status === 202) {
      return { success: true };
    }
    if (response.status === 404) {
      return Promise.reject(new Error("httpSend() requires Realtime server v2.97.0 or newer; the endpoint returned 404. Update your Supabase CLI to a recent version, or upgrade the Realtime server in your self-hosted setup. See https://github.com/supabase/supabase-js/blob/master/packages/core/realtime-js/migrations/httpsend-server-version.md"));
    }
    let errorMessage = response.statusText;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error || errorBody.message || errorMessage;
    } catch (_b) {
    }
    return Promise.reject(new Error(errorMessage));
  }
  /**
   * Sends a message into the channel.
   *
   * @param args Arguments to send to channel
   * @param args.type The type of event to send
   * @param args.event The name of the event being sent
   * @param args.payload Payload to be sent
   * @param args.persist Stores the broadcast for replay on a private channel
   * @param opts Options to be used during the send process
   *
   * @category Realtime
   *
   * @remarks
   * - When using REST you don't need to subscribe to the channel
   * - REST calls are only available from 2.37.0 onwards
   * - If you create a channel only to send a REST broadcast, remove it from
   *   the client when the send completes
   *
   * @example Send a message via websocket
   * ```js
   * const channel = supabase.channel('room1')
   *
   * channel.subscribe((status) => {
   *   if (status === 'SUBSCRIBED') {
   *     channel.send({
   *       type: 'broadcast',
   *       event: 'cursor-pos',
   *       payload: { x: Math.random(), y: Math.random() },
   *     })
   *   }
   * })
   * ```
   *
   * @exampleResponse Send a message via websocket
   * ```js
   * ok | timed out | error
   * ```
   *
   * @example Send a message via REST
   * ```js
   * const channel = supabase.channel('room1')
   *
   * try {
   *   await channel.httpSend('cursor-pos', { x: Math.random(), y: Math.random() })
   * } finally {
   *   await supabase.removeChannel(channel)
   * }
   * ```
   */
  async send(args, opts = {}) {
    var _a, _b;
    if (args.type === "broadcast" && args.persist && (!this.private || this.socket.vsn === VSN_1_0_0)) {
      const persistError = this.private ? "Realtime send() cannot store a message with protocol 1.0.0. Use httpSend() or connect with vsn 2.0.0." : "Realtime send() cannot store a message on a public channel.";
      if (this.socket.hasLogger()) {
        this.socket.log("channel", persistError);
      } else {
        console.error(persistError);
      }
      return "error";
    }
    if (!this.channelAdapter.canPush() && args.type === "broadcast") {
      const fallbackWarning = "Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.";
      if (this.socket.hasLogger()) {
        this.socket.log("channel", fallbackWarning);
      } else {
        console.warn(fallbackWarning);
      }
      const { event, payload: endpoint_payload } = args;
      if (args.persist) {
        const persistError = "Realtime send() fell back to REST and cannot store this message. The batch endpoint does not support persistence. Use httpSend() or send after the channel is connected and subscribed.";
        if (this.socket.hasLogger()) {
          this.socket.log("channel", persistError);
        } else {
          console.error(persistError);
        }
        return "error";
      }
      const headers = {
        apikey: this.socket.apiKey ? this.socket.apiKey : "",
        "Content-Type": "application/json"
      };
      if (this.socket.accessTokenValue) {
        headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
      }
      const options = {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [
            {
              topic: this.subTopic,
              event,
              payload: endpoint_payload,
              private: this.private
            }
          ]
        })
      };
      try {
        const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
        await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
        return response.ok ? "ok" : "error";
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return "timed out";
        } else {
          return "error";
        }
      }
    } else {
      return new Promise((resolve) => {
        var _a2, _b2, _c;
        const push = this.channelAdapter.push(args.type, args, opts.timeout || this.timeout);
        if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
          resolve("ok");
        }
        push.receive("ok", () => resolve("ok"));
        push.receive("error", (response) => resolve(args.persist && typeof (response === null || response === void 0 ? void 0 : response.error) === "string" ? response.error : "error"));
        push.receive("timeout", () => resolve("timed out"));
      });
    }
  }
  /**
   * Updates the payload that will be sent the next time the channel joins (reconnects).
   * Useful for rotating access tokens or updating config without re-creating the channel.
   *
   * @category Realtime
   */
  updateJoinPayload(payload) {
    this.channelAdapter.updateJoinPayload(payload);
  }
  /**
   * Leaves the channel.
   *
   * Unsubscribes from server events, and instructs channel to terminate on server.
   * Triggers onClose() hooks.
   *
   * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
   * channel.unsubscribe().receive("ok", () => alert("left!") )
   *
   * @category Realtime
   */
  async unsubscribe(timeout = this.timeout) {
    return new Promise((resolve) => {
      this.channelAdapter.unsubscribe(timeout).receive("ok", () => resolve("ok")).receive("timeout", () => resolve("timed out")).receive("error", () => resolve("error"));
    });
  }
  /**
   * Destroys and stops related timers.
   *
   * @category Realtime
   */
  teardown() {
    this.channelAdapter.teardown();
  }
  /** @internal */
  async _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
    clearTimeout(id);
    return response;
  }
  /** @internal */
  _on(type, filter, callback) {
    var _a;
    const typeLower = type.toLocaleLowerCase();
    const filterValue = filter === null || filter === void 0 ? void 0 : filter.filter;
    if (filterValue instanceof RealtimePostgresFilterBuilder || typeof filterValue === "object" && filterValue !== null && typeof filterValue.build === "function") {
      filter = Object.assign(Object.assign({}, filter), { filter: filterValue.build() });
    }
    if (typeLower === REALTIME_LISTEN_TYPES.POSTGRES_CHANGES) {
      const duplicate = (_a = this.bindings[typeLower]) === null || _a === void 0 ? void 0 : _a.find((bind) => _RealtimeChannel.isSamePostgresFilter(bind.filter, filter));
      if (duplicate) {
        this.socket.log("error", `duplicate \`postgres_changes\` binding for ${this.topic} ignored`, filter);
        return this;
      }
    }
    const ref = this.channelAdapter.on(type, callback);
    const binding = {
      type: typeLower,
      filter,
      callback,
      ref
    };
    if (this.bindings[typeLower]) {
      this.bindings[typeLower].push(binding);
    } else {
      this.bindings[typeLower] = [binding];
    }
    this._updateFilterMessage();
    return this;
  }
  /**
   * Registers a callback that will be executed when the channel closes.
   *
   * @internal
   */
  _onClose(callback) {
    this.channelAdapter.onClose(callback);
  }
  /**
   * Registers a callback that will be executed when the channel encounteres an error.
   *
   * @internal
   */
  _onError(callback) {
    this.channelAdapter.onError(callback);
  }
  /** @internal */
  _updateFilterMessage() {
    this.channelAdapter.updateFilterBindings((binding, payload, ref) => {
      var _a, _b, _c, _d, _e, _f, _g;
      const typeLower = binding.event.toLocaleLowerCase();
      if (this._notThisChannelEvent(typeLower, ref)) {
        return false;
      }
      const bind = (_a = this.bindings[typeLower]) === null || _a === void 0 ? void 0 : _a.find((bind2) => bind2.ref === binding.ref);
      if (!bind) {
        return true;
      }
      if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
        if ("id" in bind) {
          const bindId = bind.id;
          const bindEvent = (_b = bind.filter) === null || _b === void 0 ? void 0 : _b.event;
          return bindId && ((_c = payload.ids) === null || _c === void 0 ? void 0 : _c.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_d = payload.data) === null || _d === void 0 ? void 0 : _d.type.toLocaleLowerCase()));
        } else {
          const bindEvent = (_f = (_e = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _e === void 0 ? void 0 : _e.event) === null || _f === void 0 ? void 0 : _f.toLocaleLowerCase();
          return bindEvent === "*" || bindEvent === ((_g = payload === null || payload === void 0 ? void 0 : payload.event) === null || _g === void 0 ? void 0 : _g.toLocaleLowerCase());
        }
      } else {
        return bind.type.toLocaleLowerCase() === typeLower;
      }
    });
  }
  /** @internal */
  _notThisChannelEvent(event, ref) {
    const { close, error, leave, join: join2 } = CHANNEL_EVENTS;
    const events = [close, error, leave, join2];
    return ref && events.includes(event) && ref !== this.joinPush.ref;
  }
  /** @internal */
  _updateFilterTransform() {
    this.channelAdapter.updatePayloadTransform((event, payload, ref) => {
      if (typeof payload === "object" && "ids" in payload) {
        const postgresChanges = payload.data;
        const { schema, table, commit_timestamp, type, errors } = postgresChanges;
        const enrichedPayload = {
          schema,
          table,
          commit_timestamp,
          eventType: type,
          new: {},
          old: {},
          errors
        };
        return Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
      }
      return payload;
    });
  }
  copyBindings(other) {
    if (this.joinedOnce) {
      throw new Error("cannot copy bindings into joined channel");
    }
    for (const kind in other.bindings) {
      for (const binding of other.bindings[kind]) {
        this._on(binding.type, binding.filter, binding.callback);
      }
    }
  }
  /**
   * Compares two optional filter values for equality.
   * Treats undefined, null, and empty string as equivalent empty values.
   * @internal
   */
  static isFilterValueEqual(serverValue, clientValue) {
    const normalizedServer = serverValue !== null && serverValue !== void 0 ? serverValue : void 0;
    const normalizedClient = clientValue !== null && clientValue !== void 0 ? clientValue : void 0;
    return normalizedServer === normalizedClient;
  }
  /**
   * Two `postgres_changes` filters are the same when the server would collapse them into a single
   * subscription.
   * @internal
   */
  static isSamePostgresFilter(a, b) {
    var _a, _b, _c, _d;
    const selectA = (_b = (_a = a === null || a === void 0 ? void 0 : a.select) === null || _a === void 0 ? void 0 : _a.join()) !== null && _b !== void 0 ? _b : void 0;
    const selectB = (_d = (_c = b === null || b === void 0 ? void 0 : b.select) === null || _c === void 0 ? void 0 : _c.join()) !== null && _d !== void 0 ? _d : void 0;
    return (a === null || a === void 0 ? void 0 : a.event) === (b === null || b === void 0 ? void 0 : b.event) && _RealtimeChannel.isFilterValueEqual(a === null || a === void 0 ? void 0 : a.schema, b === null || b === void 0 ? void 0 : b.schema) && _RealtimeChannel.isFilterValueEqual(a === null || a === void 0 ? void 0 : a.table, b === null || b === void 0 ? void 0 : b.table) && _RealtimeChannel.isFilterValueEqual(a === null || a === void 0 ? void 0 : a.filter, b === null || b === void 0 ? void 0 : b.filter) && selectA === selectB;
  }
  /** @internal */
  _getPayloadRecords(payload) {
    const records2 = {
      new: {},
      old: {}
    };
    if (payload.type === "INSERT" || payload.type === "UPDATE") {
      records2.new = convertChangeData(payload.columns, payload.record);
    }
    if (payload.type === "UPDATE" || payload.type === "DELETE") {
      records2.old = convertChangeData(payload.columns, payload.old_record);
    }
    return records2;
  }
};
var SocketAdapter = class {
  constructor(endPoint, options) {
    this.socket = new Socket(endPoint, options);
  }
  get timeout() {
    return this.socket.timeout;
  }
  get endPoint() {
    return this.socket.endPoint;
  }
  get transport() {
    return this.socket.transport;
  }
  get heartbeatIntervalMs() {
    return this.socket.heartbeatIntervalMs;
  }
  get heartbeatCallback() {
    return this.socket.heartbeatCallback;
  }
  set heartbeatCallback(callback) {
    this.socket.heartbeatCallback = callback;
  }
  get heartbeatTimer() {
    return this.socket.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    return this.socket.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socket.reconnectTimer;
  }
  get vsn() {
    return this.socket.vsn;
  }
  get encode() {
    return this.socket.encode;
  }
  get decode() {
    return this.socket.decode;
  }
  get reconnectAfterMs() {
    return this.socket.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socket.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socket.stateChangeCallbacks;
  }
  connect() {
    this.socket.connect();
  }
  disconnect(callback, code, reason, timeout = 1e4) {
    return new Promise((resolve) => {
      setTimeout(() => resolve("timeout"), timeout);
      this.socket.disconnect(() => {
        callback();
        resolve("ok");
      }, code, reason);
    });
  }
  push(data) {
    this.socket.push(data);
  }
  log(kind, msg, data) {
    this.socket.log(kind, msg, data);
  }
  hasLogger() {
    return this.socket.hasLogger();
  }
  makeRef() {
    return this.socket.makeRef();
  }
  onOpen(callback) {
    this.socket.onOpen(callback);
  }
  onClose(callback) {
    this.socket.onClose(callback);
  }
  onError(callback) {
    this.socket.onError(callback);
  }
  onMessage(callback) {
    this.socket.onMessage(callback);
  }
  isConnected() {
    return this.socket.isConnected();
  }
  isConnecting() {
    return this.socket.connectionState() == CONNECTION_STATE.connecting;
  }
  isDisconnecting() {
    return this.socket.connectionState() == CONNECTION_STATE.closing;
  }
  connectionState() {
    return this.socket.connectionState();
  }
  endPointURL() {
    return this.socket.endPointURL();
  }
  sendHeartbeat() {
    this.socket.sendHeartbeat();
  }
  /**
   * @internal
   */
  getSocket() {
    return this.socket;
  }
};
var CONNECTION_TIMEOUTS = {
  HEARTBEAT_INTERVAL: 25e3,
  RECONNECT_DELAY: 10,
  HEARTBEAT_TIMEOUT_FALLBACK: 100
};
var RECONNECT_INTERVALS = [1e3, 2e3, 5e3, 1e4];
var DEFAULT_RECONNECT_FALLBACK = 1e4;
function createMemorySessionStorage() {
  const store2 = /* @__PURE__ */ new Map();
  return {
    get length() {
      return store2.size;
    },
    clear() {
      store2.clear();
    },
    getItem(key) {
      return store2.has(key) ? store2.get(key) : null;
    },
    key(index2) {
      var _a;
      return (_a = Array.from(store2.keys())[index2]) !== null && _a !== void 0 ? _a : null;
    },
    removeItem(key) {
      store2.delete(key);
    },
    setItem(key, value) {
      store2.set(key, String(value));
    }
  };
}
function resolveSessionStorage() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.sessionStorage) {
      return globalThis.sessionStorage;
    }
  } catch (_a) {
  }
  return createMemorySessionStorage();
}
var WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
var RealtimeClient = class {
  get endPoint() {
    return this.socketAdapter.endPoint;
  }
  get timeout() {
    return this.socketAdapter.timeout;
  }
  get transport() {
    return this.socketAdapter.transport;
  }
  get heartbeatCallback() {
    return this.socketAdapter.heartbeatCallback;
  }
  get heartbeatIntervalMs() {
    return this.socketAdapter.heartbeatIntervalMs;
  }
  get heartbeatTimer() {
    if (this.worker) {
      return this._workerHeartbeatTimer;
    }
    return this.socketAdapter.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    if (this.worker) {
      return this._pendingWorkerHeartbeatRef;
    }
    return this.socketAdapter.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socketAdapter.reconnectTimer;
  }
  get vsn() {
    return this.socketAdapter.vsn;
  }
  get encode() {
    return this.socketAdapter.encode;
  }
  get decode() {
    return this.socketAdapter.decode;
  }
  get reconnectAfterMs() {
    return this.socketAdapter.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socketAdapter.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socketAdapter.stateChangeCallbacks;
  }
  /**
   * Initializes the Socket.
   *
   * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
   * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
   * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
   * @param options.params The optional params to pass when connecting.
   * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
   * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
   * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
   * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
   * @param options.logLevel Sets the log level for Realtime
   * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
   * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
   * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
   * @param options.worker Use Web Worker to set a side flow. Defaults to false.
   * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
   * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
   *
   * @category Realtime
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const channel = supabase.channel('room1')
   * channel
   *   .on('broadcast', { event: 'cursor-pos' }, (payload) => console.log(payload))
   *   .subscribe()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'your-publishable-key' },
   * })
   * client.connect()
   * ```
   */
  constructor(endPoint, options) {
    var _a;
    this.channels = new Array();
    this.accessTokenValue = null;
    this.accessToken = null;
    this.apiKey = null;
    this.httpEndpoint = "";
    this.headers = {};
    this.params = {};
    this.ref = 0;
    this.serializer = new serializer_default();
    this._manuallySetToken = false;
    this._authPromise = null;
    this._authGeneration = 0;
    this._workerHeartbeatTimer = void 0;
    this._pendingWorkerHeartbeatRef = null;
    this._pendingDisconnectTimer = null;
    this._disconnectOnEmptyChannelsAfterMs = 0;
    this._resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    if (!((_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey)) {
      throw new Error("API key is required to connect to Realtime");
    }
    this.apiKey = options.params.apikey;
    const socketAdapterOptions = this._initializeOptions(options);
    this.socketAdapter = new SocketAdapter(endPoint, socketAdapterOptions);
    this.httpEndpoint = httpEndpointURL(endPoint);
    this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
  }
  /**
   * Connects the socket, unless already connected.
   *
   * @category Realtime
   */
  connect() {
    if (this.isConnecting() || this.isDisconnecting() || this.isConnected()) {
      return;
    }
    if (this.accessToken && !this._authPromise) {
      this._setAuthSafely("connect");
    }
    this._setupConnectionHandlers();
    try {
      this.socketAdapter.connect();
    } catch (error) {
      const errorMessage = error.message;
      throw new Error(`WebSocket not available: ${errorMessage}`);
    }
    this._handleNodeJsRaceCondition();
  }
  /**
   * Returns the URL of the websocket.
   * @returns string The URL of the websocket.
   *
   * @category Realtime
   */
  endpointURL() {
    return this.socketAdapter.endPointURL();
  }
  /**
   * Disconnects the socket.
   *
   * @param code A numeric status code to send on disconnect.
   * @param reason A custom reason for the disconnect.
   *
   * @category Realtime
   */
  async disconnect(code, reason) {
    this._cancelPendingDisconnect();
    if (this.isDisconnecting()) {
      return "ok";
    }
    return await this.socketAdapter.disconnect(() => {
      clearInterval(this._workerHeartbeatTimer);
      this._terminateWorker();
    }, code, reason);
  }
  /**
   * Returns all created channels
   *
   * @category Realtime
   */
  getChannels() {
    return this.channels;
  }
  /**
   * Unsubscribes, removes and tears down a single channel
   * @param channel A RealtimeChannel instance
   *
   * @category Realtime
   */
  async removeChannel(channel) {
    const status = await channel.unsubscribe();
    if (status === "ok") {
      channel.teardown();
    }
    return status;
  }
  /**
   * Unsubscribes, removes and tears down all channels
   *
   * @category Realtime
   */
  async removeAllChannels() {
    const promises = this.channels.map(async (channel) => {
      const result2 = await channel.unsubscribe();
      channel.teardown();
      return result2;
    });
    const result = await Promise.all(promises);
    await this.disconnect();
    return result;
  }
  /**
   * Logs the message.
   *
   * For customized logging, `this.logger` can be overridden in Client constructor.
   *
   * @category Realtime
   */
  log(kind, msg, data) {
    this.socketAdapter.log(kind, msg, data);
  }
  /**
   * Returns true if a custom `logger` has been configured on this client.
   *
   * @category Realtime
   */
  hasLogger() {
    return this.socketAdapter.hasLogger();
  }
  /**
   * Returns the current state of the socket.
   *
   * @category Realtime
   */
  connectionState() {
    return this.socketAdapter.connectionState() || CONNECTION_STATE.closed;
  }
  /**
   * Returns `true` is the connection is open.
   *
   * @category Realtime
   */
  isConnected() {
    return this.socketAdapter.isConnected();
  }
  /**
   * Returns `true` if the connection is currently connecting.
   *
   * @category Realtime
   */
  isConnecting() {
    return this.socketAdapter.isConnecting();
  }
  /**
   * Returns `true` if the connection is currently disconnecting.
   *
   * @category Realtime
   */
  isDisconnecting() {
    return this.socketAdapter.isDisconnecting();
  }
  /**
   * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
   *
   * Topics are automatically prefixed with `realtime:` to match the Realtime service.
   * If a channel with the same topic already exists it will be returned instead of creating
   * a duplicate connection.
   *
   * @category Realtime
   */
  channel(topic, params = { config: {} }) {
    const realtimeTopic = `realtime:${topic}`;
    const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
    if (!exists) {
      const chan = new RealtimeChannel(`realtime:${topic}`, params, this);
      this._cancelPendingDisconnect();
      this.channels.push(chan);
      return chan;
    } else {
      return exists;
    }
  }
  /**
   * Push out a message if the socket is connected.
   *
   * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
   *
   * @category Realtime
   */
  push(data) {
    this.socketAdapter.push(data);
  }
  /**
   * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
   *
   * If param is null it will use the `accessToken` callback function or the token set on the client.
   *
   * On callback used, it will set the value of the token internal to the client.
   *
   * When a token is explicitly provided AND no `accessToken` callback is configured,
   * it will be preserved across channel operations (including removeChannel and
   * resubscribe) and the client stays in manual-token mode.
   *
   * When an `accessToken` callback IS configured, the callback is the source of truth:
   * the client remains in callback mode and continues to refresh from it on heartbeat,
   * even after a bootstrap/override `setAuth(token)` call.
   *
   * The callback is called on connect and on every heartbeat (`heartbeatIntervalMs`,
   * default 25000ms). Its token must stay valid past the next call, or the server closes
   * the channel at expiry with no automatic resubscribe.
   *
   * @param token A JWT string to override the token set on the client.
   *
   * @example Setting the authorization header
   * // Use a manual token (preserved across resubscribes when no accessToken callback is set)
   * client.realtime.setAuth('my-custom-jwt')
   *
   * // Switch back to using the accessToken callback
   * client.realtime.setAuth()
   *
   * @category Realtime
   */
  async setAuth(token = null) {
    const authGeneration = ++this._authGeneration;
    const authPromise = this._performAuth(token, authGeneration);
    if (authGeneration === this._authGeneration) {
      this._authPromise = authPromise;
    }
    try {
      await authPromise;
    } finally {
      if (this._authPromise === authPromise) {
        this._authPromise = null;
      }
    }
  }
  /**
   * Returns true if the current access token was explicitly set via setAuth(token),
   * false if it was obtained via the accessToken callback.
   * @internal
   */
  _isManualToken() {
    return this._manuallySetToken;
  }
  /**
   * Sends a heartbeat message if the socket is connected.
   *
   * @category Realtime
   */
  async sendHeartbeat() {
    this.socketAdapter.sendHeartbeat();
  }
  /**
   * Sets a callback that receives lifecycle events for internal heartbeat messages.
   * Useful for instrumenting connection health (e.g. sent/ok/timeout).
   *
   * @category Realtime
   */
  onHeartbeat(callback) {
    this.socketAdapter.heartbeatCallback = this._wrapHeartbeatCallback(callback);
  }
  /**
   * Return the next message ref, accounting for overflows
   *
   * @internal
   */
  _makeRef() {
    return this.socketAdapter.makeRef();
  }
  /**
   * Removes a channel from RealtimeClient
   *
   * @param channel An open subscription.
   *
   * @internal
   */
  _remove(channel) {
    this.channels = this.channels.filter((c) => c.topic !== channel.topic);
    if (this.channels.length === 0) {
      this.log("transport", "no channels remaining, scheduling disconnect");
      this._schedulePendingDisconnect();
    }
  }
  /** @internal */
  _schedulePendingDisconnect() {
    this._cancelPendingDisconnect();
    if (this._disconnectOnEmptyChannelsAfterMs === 0) {
      this.log("transport", "disconnecting immediately - no channels");
      this.disconnect();
      return;
    }
    this._pendingDisconnectTimer = setTimeout(() => {
      this._pendingDisconnectTimer = null;
      if (this.channels.length === 0) {
        this.log("transport", "deferred disconnect fired - no channels, disconnecting");
        this.disconnect();
      }
    }, this._disconnectOnEmptyChannelsAfterMs);
    this.log("transport", `deferred disconnect scheduled in ${this._disconnectOnEmptyChannelsAfterMs}ms`);
  }
  /** @internal */
  _cancelPendingDisconnect() {
    if (this._pendingDisconnectTimer !== null) {
      this.log("transport", "pending disconnect cancelled - channel activity detected");
      clearTimeout(this._pendingDisconnectTimer);
      this._pendingDisconnectTimer = null;
    }
  }
  /**
   * Perform the actual auth operation
   * @internal
   */
  async _performAuth(token, authGeneration) {
    let tokenToSend;
    let isManualToken = false;
    if (token) {
      tokenToSend = token;
      isManualToken = true;
    } else if (this.accessToken) {
      try {
        tokenToSend = await this.accessToken();
      } catch (e) {
        this.log("error", "Error fetching access token from callback", e);
        tokenToSend = this.accessTokenValue;
      }
    } else {
      tokenToSend = this.accessTokenValue;
    }
    if (authGeneration !== this._authGeneration) {
      return;
    }
    if (this.accessToken) {
      this._manuallySetToken = false;
    } else if (isManualToken) {
      this._manuallySetToken = true;
    }
    if (this.accessTokenValue != tokenToSend) {
      this.accessTokenValue = tokenToSend;
      this.channels.forEach((channel) => {
        const payload = {
          access_token: tokenToSend,
          version: DEFAULT_VERSION
        };
        channel.updateJoinPayload(payload);
        if (channel.joinedOnce && channel.channelAdapter.isJoined()) {
          channel.channelAdapter.push(CHANNEL_EVENTS.access_token, {
            access_token: tokenToSend
          });
        }
      });
    }
  }
  /**
   * Wait for any in-flight auth operations to complete
   * @internal
   */
  async _waitForAuthIfNeeded() {
    if (this._authPromise) {
      await this._authPromise;
    }
  }
  /**
   * Safely call setAuth with standardized error handling
   * @internal
   */
  _setAuthSafely(context = "general") {
    if (!this._isManualToken()) {
      this.setAuth().catch((e) => {
        this.log("error", `Error setting auth in ${context}`, e);
      });
    }
  }
  /** @internal */
  _setupConnectionHandlers() {
    this.socketAdapter.onOpen(() => {
      const authPromise = this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
      authPromise.catch((e) => {
        this.log("error", "error waiting for auth on connect", e);
      });
      if (this.worker && !this.workerRef) {
        this._startWorkerHeartbeat();
      }
    });
    this.socketAdapter.onClose(() => {
      if (this.worker && this.workerRef) {
        this._terminateWorker();
      }
    });
    this.socketAdapter.onMessage((message) => {
      if (message.ref && message.ref === this._pendingWorkerHeartbeatRef) {
        this._pendingWorkerHeartbeatRef = null;
      }
    });
  }
  /** @internal */
  _handleNodeJsRaceCondition() {
    if (this.socketAdapter.isConnected()) {
      this.socketAdapter.getSocket().onConnOpen();
    }
  }
  /** @internal */
  _wrapHeartbeatCallback(heartbeatCallback) {
    return (status, latency) => {
      if (status === "disconnected")
        return;
      if (status == "sent")
        this._setAuthSafely();
      if (heartbeatCallback)
        heartbeatCallback(status, latency);
    };
  }
  /** @internal */
  _startWorkerHeartbeat() {
    if (this.workerUrl) {
      this.log("worker", `starting worker for from ${this.workerUrl}`);
    } else {
      this.log("worker", `starting default worker`);
    }
    const objectUrl = this._workerObjectUrl(this.workerUrl);
    this.workerRef = new Worker(objectUrl);
    this.workerRef.onerror = (error) => {
      this.log("worker", "worker error", error.message);
      this._terminateWorker();
      this.disconnect();
    };
    this.workerRef.onmessage = (event) => {
      if (event.data.event === "keepAlive") {
        this.sendHeartbeat();
      }
    };
    this.workerRef.postMessage({
      event: "start",
      interval: this.heartbeatIntervalMs
    });
  }
  /**
   * Terminate the Web Worker and clear the reference
   * @internal
   */
  _terminateWorker() {
    if (this.workerRef) {
      this.log("worker", "terminating worker");
      this.workerRef.terminate();
      this.workerRef = void 0;
    }
  }
  /** @internal */
  _workerObjectUrl(url) {
    let result_url;
    if (url) {
      result_url = url;
    } else {
      const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
      result_url = URL.createObjectURL(blob);
    }
    return result_url;
  }
  /**
   * Initialize socket options with defaults
   * @internal
   */
  _initializeOptions(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    this.worker = (_a = options === null || options === void 0 ? void 0 : options.worker) !== null && _a !== void 0 ? _a : false;
    this.accessToken = (_b = options === null || options === void 0 ? void 0 : options.accessToken) !== null && _b !== void 0 ? _b : null;
    const result = {};
    result.timeout = (_c = options === null || options === void 0 ? void 0 : options.timeout) !== null && _c !== void 0 ? _c : DEFAULT_TIMEOUT;
    result.heartbeatIntervalMs = (_d = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _d !== void 0 ? _d : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
    this._disconnectOnEmptyChannelsAfterMs = (_e = options === null || options === void 0 ? void 0 : options.disconnectOnEmptyChannelsAfterMs) !== null && _e !== void 0 ? _e : 2 * ((_f = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _f !== void 0 ? _f : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL);
    result.transport = (_g = options === null || options === void 0 ? void 0 : options.transport) !== null && _g !== void 0 ? _g : websocket_factory_default.getWebSocketConstructor();
    result.params = options === null || options === void 0 ? void 0 : options.params;
    result.logger = options === null || options === void 0 ? void 0 : options.logger;
    result.heartbeatCallback = this._wrapHeartbeatCallback(options === null || options === void 0 ? void 0 : options.heartbeatCallback);
    result.sessionStorage = (_h = options === null || options === void 0 ? void 0 : options.sessionStorage) !== null && _h !== void 0 ? _h : resolveSessionStorage();
    result.reconnectAfterMs = (_j = options === null || options === void 0 ? void 0 : options.reconnectAfterMs) !== null && _j !== void 0 ? _j : ((tries) => {
      return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK;
    });
    let defaultEncode;
    let defaultDecode;
    const vsn = (_k = options === null || options === void 0 ? void 0 : options.vsn) !== null && _k !== void 0 ? _k : DEFAULT_VSN;
    switch (vsn) {
      case VSN_1_0_0:
        defaultEncode = (payload, callback) => {
          return callback(JSON.stringify(payload));
        };
        defaultDecode = (payload, callback) => {
          return callback(JSON.parse(payload));
        };
        break;
      case VSN_2_0_0:
        defaultEncode = this.serializer.encode.bind(this.serializer);
        defaultDecode = this.serializer.decode.bind(this.serializer);
        break;
      default:
        throw new Error(`Unsupported serializer version: ${vsn}`);
    }
    result.vsn = vsn;
    result.encode = (_l = options === null || options === void 0 ? void 0 : options.encode) !== null && _l !== void 0 ? _l : defaultEncode;
    result.decode = (_m = options === null || options === void 0 ? void 0 : options.decode) !== null && _m !== void 0 ? _m : defaultDecode;
    result.beforeReconnect = this._reconnectAuth.bind(this);
    if ((options === null || options === void 0 ? void 0 : options.logLevel) || (options === null || options === void 0 ? void 0 : options.log_level)) {
      this.logLevel = options.logLevel || options.log_level;
      result.params = Object.assign(Object.assign({}, result.params), { log_level: this.logLevel });
    }
    if (this.worker) {
      if (typeof window !== "undefined" && !window.Worker) {
        throw new Error("Web Worker is not supported");
      }
      this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
      result.autoSendHeartbeat = !this.worker;
    }
    return result;
  }
  /** @internal */
  async _reconnectAuth() {
    await this._waitForAuthIfNeeded();
    if (!this.isConnected()) {
      this.connect();
    }
  }
};
var newer = (a, b) => !b || a.round > b.round || a.round === b.round && a.version > b.version;
function watchRoom({
  code,
  initialState,
  config,
  getToken,
  load,
  presence,
  onState,
  onStatus = () => {
  },
  onError = () => {
  },
  clientFactory = (url, options) => new RealtimeClient(url, options),
  environment = globalThis,
  random = Math.random,
  mode = "room"
}) {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(code) || !["room", "watch"].includes(mode)) {
    throw new TypeError("NcqBoard subscriptions require a room UUID and a room/watch mode");
  }
  let current2 = initialState, wanted, closed = false, connected2 = false, writing = false;
  let client, channel, loading, dirty = false, needsSnapshot = true, generation = 0, heartbeat, retry;
  let resolveReady, reconnectAttempts = 0;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const status = (value) => {
    if (!closed) onStatus(value);
  };
  const accepts = (value) => value?.code === code && Number.isInteger(value.version) && Number.isInteger(value.round);
  function accept(value) {
    if (!accepts(value) || current2 && newer(current2, value)) return;
    current2 = value;
    if (wanted && !newer(wanted, value) && wanted.phase !== "closed") wanted = null;
  }
  async function sync() {
    dirty = true;
    if (closed || !connected2 || writing || loading) return loading;
    const session = generation;
    loading = (async () => {
      let reads = 0;
      do {
        if (++reads > 3) throw new Error("NcqBoard snapshot did not catch up");
        dirty = false;
        const value = await load();
        if (closed || session !== generation) return;
        if (value?.error) throw Object.assign(new Error(value.error), value, { code: value.error });
        if (!accepts(value)) throw new Error("Invalid NcqBoard snapshot");
        if (!current2 || !newer(current2, value)) {
          accept(value);
          onState(value);
        }
        needsSnapshot = false;
        if (wanted && newer(wanted, current2)) dirty = true;
      } while (dirty && !closed && connected2 && !writing);
      if (!closed && session === generation) {
        reconnectAttempts = 0;
        status("connected");
        resolveReady(current2);
      }
    })().catch((error) => {
      if (!closed && session === generation) {
        connected2 = false;
        status("reconnecting");
        onError(error);
        scheduleReconnect();
      }
    }).finally(() => {
      loading = null;
      if (dirty && connected2 && !writing && !closed) queueMicrotask(sync);
    });
    return loading;
  }
  function changed(message) {
    const notice = message.payload;
    if (!accepts(notice) || current2 && !newer(notice, current2) && notice.phase !== "closed") return;
    if (!wanted || newer(notice, wanted) || notice.phase === "closed") wanted = notice;
    void sync();
  }
  function disconnect() {
    connected2 = false;
    environment.clearInterval(heartbeat);
    environment.clearTimeout(retry);
    if (client) void client.disconnect();
    client = channel = null;
  }
  function scheduleReconnect() {
    environment.clearTimeout(retry);
    if (!closed) {
      const delay = Math.min(3e4, 1e3 * 2 ** Math.min(5, reconnectAttempts++));
      retry = environment.setTimeout(connect, Math.min(3e4, delay * (1 + random() * 0.2)));
    }
  }
  async function connect() {
    const session = ++generation;
    disconnect();
    status("connecting");
    try {
      const settings = await config();
      const bearer = await getToken(false);
      if (closed || session !== generation) return;
      const origin = new URL(settings.url);
      if (origin.protocol !== "https:" || typeof settings.publishableKey !== "string" || !settings.publishableKey || !/^[a-z][a-z0-9-]{2,29}$/.test(settings.game)) {
        throw new Error("Invalid NcqBoard realtime configuration");
      }
      client = clientFactory(origin.origin + "/realtime/v1", {
        params: { apikey: settings.publishableKey },
        accessToken: () => getToken(false)
      });
      await client.setAuth(bearer);
      if (closed || session !== generation) return;
      channel = client.channel(`ncq-board:${settings.game}:${mode}:${code}`, { config: { private: true } });
      channel.on("broadcast", { event: "changed" }, (message) => {
        if (!closed && session === generation) changed(message);
      }).subscribe((next) => {
        if (closed || session !== generation) return;
        if (next === "SUBSCRIBED") {
          connected2 = true;
          needsSnapshot = true;
          environment.clearTimeout(retry);
          void sync();
          environment.clearInterval(heartbeat);
          if (presence) heartbeat = environment.setInterval(() => {
            if (!closed && connected2) void presence().catch((error) => {
              if (!closed && session === generation) {
                connected2 = false;
                status("reconnecting");
                onError(error);
                scheduleReconnect();
              }
            });
          }, 5e3);
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) {
          connected2 = false;
          environment.clearInterval(heartbeat);
          status("reconnecting");
          scheduleReconnect();
        }
      });
    } catch (error) {
      if (!closed && session === generation) {
        status("reconnecting");
        onError(error);
        scheduleReconnect();
      }
    }
  }
  const resume = () => {
    if (!environment.document || environment.document.visibilityState === "visible") void connect();
  };
  environment.addEventListener?.("online", resume);
  environment.document?.addEventListener("visibilitychange", resume);
  void connect();
  return {
    ready,
    sync,
    accept,
    beginWrite() {
      writing = true;
    },
    endWrite(value) {
      if (value && !value.error) accept(value);
      writing = false;
      if (needsSnapshot || wanted && newer(wanted, current2)) void sync();
      else if (dirty) {
        dirty = false;
        if (!value || value.error) void sync();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      generation++;
      disconnect();
      resolveReady(null);
      environment.removeEventListener?.("online", resume);
      environment.document?.removeEventListener("visibilitychange", resume);
    }
  };
}
function boardError(code, status = 0) {
  return Object.assign(new Error(code), { code, status });
}
function create({ apiUrl, getToken, region }) {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new TypeError("NcqBoard requires an HTTPS API URL");
  }
  const base2 = url.href.replace(/\/$/, "") + "/api";
  if (region !== void 0 && !/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new TypeError("Invalid NcqBoard function region");
  const reads = /* @__PURE__ */ new Map();
  let identity;
  function clearCache() {
    reads.clear();
  }
  function bindIdentity(bearer) {
    if (identity === bearer) return;
    identity = bearer;
    clearCache();
  }
  function seconds(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 && value !== -1) {
      throw new TypeError("NcqBoard cooldown must be -1 or a non-negative number of seconds");
    }
    return value;
  }
  const copy = (value) => JSON.parse(JSON.stringify(value));
  async function read(path, bearer, cooldown, load) {
    const key = (bearer ? "private:" : "public:") + path;
    const previous = reads.get(key);
    const startedAt = Date.now();
    if (cooldown !== -1 && previous) {
      const age = startedAt - previous.startedAt;
      if (previous.ready && age >= 0 && age < cooldown * 1e3) return copy(previous.value);
      if (previous.pending) return previous.pending.then(copy);
    }
    const entry = { startedAt };
    reads.set(key, entry);
    if (reads.size > 256) reads.delete(reads.keys().next().value);
    entry.pending = load().then((value) => {
      entry.pending = null;
      if (reads.get(key) === entry) {
        if (value && value.error) reads.delete(key);
        else {
          entry.value = value;
          entry.ready = true;
        }
      }
      return value;
    }, (error) => {
      if (reads.get(key) === entry) reads.delete(key);
      throw error;
    });
    return entry.pending.then(copy);
  }
  async function token(forceRefresh, role) {
    try {
      const value = await getToken({ forceRefresh, ...role ? { role } : {} });
      if (typeof value === "string" && /^\S+$/.test(value)) return value;
    } catch {
    }
    clearCache();
    throw boardError("authFailed", 401);
  }
  async function send2(path, input, bearer, timeout) {
    const headers = {};
    if (bearer) headers.Authorization = "Bearer " + bearer;
    if (input !== void 0) headers["Content-Type"] = "application/json";
    const requestUrl = new URL(base2 + path);
    if (region) requestUrl.searchParams.set("forceFunctionRegion", region);
    const response = await fetch(requestUrl.href, {
      method: input === void 0 ? "GET" : "POST",
      headers,
      body: input === void 0 ? void 0 : JSON.stringify(input),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeout)
    });
    const data = await response.json();
    if (!response.ok) throw boardError(data.error ?? data.code ?? "network", response.status);
    return data;
  }
  async function request(path, input, cooldown = 3) {
    seconds(cooldown);
    const bearer = await token(false);
    bindIdentity(bearer);
    const load = async () => {
      try {
        return await send2(path, input, bearer, 8e3);
      } catch (error) {
        if (error.status !== 401 || !["authFailed", "unauthorized"].includes(error.code)) throw error;
        clearCache();
        const fresh = await token(true);
        bindIdentity(fresh);
        return send2(path, input, fresh, 8e3);
      }
    };
    if (input === void 0) return read(path, bearer, cooldown, load);
    clearCache();
    try {
      return await load();
    } finally {
      clearCache();
    }
  }
  function queued(path, queue, cooldown) {
    if (typeof queue === "number" && cooldown === void 0) {
      cooldown = queue;
      queue = void 0;
    }
    return request(
      path + (queue ? (path.includes("?") ? "&" : "?") + "queue=" + encodeURIComponent(queue) : ""),
      void 0,
      cooldown
    );
  }
  const room2 = (code, op) => "/rooms/" + encodeURIComponent(code) + "/" + op;
  return Object.freeze({
    lobby: (cooldown = 3) => read(
      "/lobby",
      void 0,
      seconds(cooldown),
      () => send2("/lobby", void 0, void 0, 3500)
    ),
    spectate: (code, cooldown = -1) => read(
      "/spectate/" + encodeURIComponent(code),
      void 0,
      seconds(cooldown),
      () => send2("/spectate/" + encodeURIComponent(code), void 0, void 0, 3500)
    ),
    match: (input = {}) => request("/matchmaking", input),
    cancel: (ticket) => request("/matchmaking/cancel", { ticket }),
    state: (code, cooldown = -1) => request(room2(code, "state"), void 0, cooldown),
    subscribeRoom: (code, options = {}) => watchRoom({
      ...options,
      code,
      config: () => request("/realtime", void 0, -1),
      getToken: (force) => token(force, "authenticated"),
      load: options.load ?? (() => request(room2(code, "state"), void 0, -1)),
      presence: options.presence === false ? void 0 : options.presence ?? (() => request(room2(code, "presence"), {}))
    }),
    join: (code) => request(room2(code, "join"), {}),
    move: (code, input) => request(room2(code, "move"), input),
    leave: (code) => request(room2(code, "leave"), {}),
    rematch: (code, input) => request(room2(code, "rematch"), input),
    profile: (queue, cooldown) => queued("/profile", queue, cooldown),
    records: (cooldown = 3) => request("/records", void 0, cooldown),
    seats: (code, cooldown = 3) => request(room2(code, "seats"), void 0, cooldown),
    leaderboard: (limit = 100, queue, cooldown) => queued("/leaderboard?limit=" + encodeURIComponent(limit), queue, cooldown),
    setName: (nickname, avatar) => request("/name", { nickname, avatar }),
    gameRequest: request,
    clearCache
  });
}
var NcqBoard = Object.freeze({ version: 3, create });
if (typeof window !== "undefined") window.NcqBoard = NcqBoard;

// ncq/save.js
(function() {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION2 = 3;
  if (w.NcqSave && w.NcqSave.version >= VERSION2) return;
  var PREFIX = "ncq:save:";
  var MAX_BYTES = 2e5;
  var PUSH_WAIT = 2e3;
  var BACKUP_EVERY = 24 * 60 * 60 * 1e3;
  var RETRY = [5e3, 3e4, 12e4, 6e5];
  var READY_WAIT = 8e3;
  var ID_RE = /^[A-Za-z0-9_-]{1,60}$/;
  var own2 = function(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  };
  var STORE_TAG = "ncq2.";
  var MIX = "ncq-save:v2:";
  var cfg = null;
  var rec = null;
  var vault = {};
  var watchers = [];
  var tamper = { storage: 0, at: 0 };
  var memory = {};
  var listeners2 = [];
  var warned2 = {};
  var cloud = { player: null, identity: null, checked: null, at: 0, error: null, restored: false };
  var syncing = null, timer = null, retryTimer = null, retries = 0;
  function warn2(key2, text, e) {
    if (warned2[key2]) return;
    warned2[key2] = true;
    try {
      if (w.console) w.console.warn("[NcqSave] " + text, e || "");
    } catch (x) {
    }
  }
  function clone(v) {
    return v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
  }
  function h32(text, seed) {
    var h = (seed >>> 0 ^ 2166136261) >>> 0, i;
    for (i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 1540483477);
    h ^= h >>> 15;
    return h >>> 0;
  }
  function stream2(seed) {
    var x = seed >>> 0 || 2654435769;
    return function() {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return x >>> 0;
    };
  }
  function codes2(list2) {
    var out = "", i;
    for (i = 0; i < list2.length; i += 8192) out += String.fromCharCode.apply(null, list2.slice(i, i + 8192));
    return out;
  }
  var SESSION = (function() {
    try {
      if (w.crypto && w.crypto.getRandomValues) return w.crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
    }
    return Math.floor(Math.random() * 4294967296);
  })();
  function seal(k, value2) {
    var text = JSON.stringify(value2), next = stream2(SESSION ^ h32(k)), list2 = new Array(text.length), i;
    for (i = 0; i < text.length; i++) list2[i] = text.charCodeAt(i) ^ next() & 65535;
    return codes2(list2);
  }
  function unseal(k, text) {
    var next = stream2(SESSION ^ h32(k)), list2 = new Array(text.length), i;
    for (i = 0; i < text.length; i++) list2[i] = text.charCodeAt(i) ^ next() & 65535;
    return JSON.parse(codes2(list2));
  }
  function setData(data) {
    var out = {};
    Object.keys(data).forEach(function(k) {
      if (data[k] !== void 0) out[k] = seal(k, data[k]);
    });
    vault = out;
  }
  function getData() {
    var out = {};
    Object.keys(vault).forEach(function(k) {
      out[k] = unseal(k, vault[k]);
    });
    return out;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function toB64(bin) {
    var out = "", i, n;
    for (i = 0; i < bin.length; i += 3) {
      n = bin.charCodeAt(i) << 16 | (bin.charCodeAt(i + 1) || 0) << 8 | (bin.charCodeAt(i + 2) || 0);
      out += B64.charAt(n >>> 18 & 63) + B64.charAt(n >>> 12 & 63) + (i + 1 < bin.length ? B64.charAt(n >>> 6 & 63) : "=") + (i + 2 < bin.length ? B64.charAt(n & 63) : "=");
    }
    return out;
  }
  function fromB64(text) {
    if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(text) || text.length % 4) throw new Error("base64");
    var list2 = [], i, n, a, b, c, d2;
    for (i = 0; i < text.length; i += 4) {
      a = B64.indexOf(text.charAt(i));
      b = B64.indexOf(text.charAt(i + 1));
      c = text.charAt(i + 2) === "=" ? 0 : B64.indexOf(text.charAt(i + 2));
      d2 = text.charAt(i + 3) === "=" ? 0 : B64.indexOf(text.charAt(i + 3));
      n = a << 18 | b << 12 | c << 6 | d2;
      list2.push(n >>> 16 & 255);
      if (text.charAt(i + 2) !== "=") list2.push(n >>> 8 & 255);
      if (text.charAt(i + 3) !== "=") list2.push(n & 255);
    }
    return codes2(list2);
  }
  function sign(json, id) {
    return h32(json, h32(MIX + "sig:" + id)).toString(36);
  }
  function encodeStore(json, id) {
    var bin = unescape(encodeURIComponent(json)), next = stream2(h32(MIX + id)), list2 = new Array(bin.length), i;
    for (i = 0; i < bin.length; i++) list2[i] = bin.charCodeAt(i) ^ next() & 255;
    return STORE_TAG + sign(json, id) + "." + toB64(codes2(list2));
  }
  function decodeStore(text, id) {
    var dot = text.indexOf(".", STORE_TAG.length);
    if (dot < 0) throw new Error("shape");
    var bin = fromB64(text.slice(dot + 1)), next = stream2(h32(MIX + id)), list2 = new Array(bin.length), i;
    for (i = 0; i < bin.length; i++) list2[i] = bin.charCodeAt(i) ^ next() & 255;
    var json = decodeURIComponent(escape(codes2(list2)));
    return { json, signed: text.slice(STORE_TAG.length, dot) === sign(json, id) };
  }
  function noticeTamper(where) {
    tamper.storage += 1;
    tamper.at = Date.now();
    warn2("tamper", "\uAE30\uAE30 \uC800\uC7A5\uC774 \uBC14\uAE65\uC5D0\uC11C \uBC14\uB010 \uAC83 \uAC19\uC544\uC694 (\uC11C\uBA85\uC774 \uB9DE\uC9C0 \uC54A\uC544\uC694). \uADF8\uB300\uB85C \uC4F0\uACE0 \uAE30\uB85D\uB9CC \uB0A8\uACA8\uC694.");
    try {
      if (w.NcqMetrics && w.NcqMetrics._tool) w.NcqMetrics._tool("save_tamper", { where });
    } catch (e) {
    }
    try {
      w.dispatchEvent(new w.CustomEvent("ncq-save-tamper", { detail: { where } }));
    } catch (e) {
    }
  }
  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function newId() {
    var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", out = "", i;
    var bytes = null;
    try {
      if (w.crypto && w.crypto.getRandomValues) bytes = w.crypto.getRandomValues(new Uint8Array(24));
    } catch (e) {
      bytes = null;
    }
    for (i = 0; i < 24; i++) out += abc.charAt((bytes ? bytes[i] : Math.floor(Math.random() * 256)) % abc.length);
    return out;
  }
  function key(suffix) {
    return PREFIX + cfg.id + (suffix || "");
  }
  function readRaw(k) {
    try {
      return w.localStorage.getItem(k);
    } catch (e) {
      return own2(memory, k) ? memory[k] : null;
    }
  }
  function writeRaw(k, text) {
    try {
      w.localStorage.setItem(k, text);
      delete memory[k];
      return true;
    } catch (e) {
      memory[k] = text;
      warn2("storage", "\uAE30\uAE30\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694 (\uC800\uC7A5 \uACF5\uAC04\uC774 \uC5C6\uAC70\uB098 \uB9C9\uD600 \uC788\uC5B4\uC694). \uC571\uC744 \uB2EB\uC73C\uBA74 \uC5C6\uC5B4\uC9C8 \uC218 \uC788\uC5B4\uC694.", e);
      return false;
    }
  }
  function fill2(data) {
    var out = isObj(data) ? data : {};
    Object.keys(cfg.data).forEach(function(k) {
      if (!own2(out, k)) out[k] = clone(cfg.data[k]);
    });
    return out;
  }
  function fresh(owner) {
    return {
      v: 1,
      sid: newId(),
      rev: 0,
      base: 0,
      dirty: false,
      at: 0,
      owner: owner || null,
      data: fill2(clone(cfg.data)),
      rc: {},
      up: 0,
      hot: false
    };
  }
  function load() {
    var raw = readRaw(key()), r = null;
    if (!raw) return null;
    try {
      if (raw.indexOf(STORE_TAG) === 0) {
        var got = decodeStore(raw, cfg.id);
        r = JSON.parse(got.json);
        if (!got.signed) noticeTamper("storage");
      } else {
        r = JSON.parse(raw);
      }
    } catch (e) {
      r = null;
    }
    if (!isObj(r) || r.v !== 1 || typeof r.sid !== "string" || !isObj(r.data)) {
      writeRaw(key(":broken"), raw);
      warn2("broken", "\uAE30\uAE30 \uC800\uC7A5\uC744 \uC77D\uC9C0 \uBABB\uD574 \uCC98\uC74C\uBD80\uD130 \uC2DC\uC791\uD574\uC694 (\uC608\uC804 \uC800\uC7A5\uC740 " + key(":broken") + "\uC5D0 \uB0A8\uACA8 \uB480\uC5B4\uC694).");
      return null;
    }
    r.rc = isObj(r.rc) ? r.rc : {};
    r.rev = r.rev | 0;
    r.base = r.base | 0;
    r.at = +r.at || 0;
    r.dirty = !!r.dirty;
    r.owner = r.owner || null;
    r.up = +r.up || 0;
    r.hot = !!r.hot;
    r.data = fill2(r.data);
    return r;
  }
  function use(r) {
    var data = r.data;
    delete r.data;
    rec = r;
    setData(data);
  }
  function plain() {
    return {
      v: 1,
      sid: rec.sid,
      rev: rec.rev,
      base: rec.base,
      dirty: rec.dirty,
      at: rec.at,
      owner: rec.owner,
      data: getData(),
      rc: rec.rc,
      up: rec.up,
      hot: rec.hot
    };
  }
  function sealed(r) {
    var json = JSON.stringify(r);
    try {
      return encodeStore(json, cfg.id);
    } catch (e) {
      warn2("encode", "\uC800\uC7A5\uC5D0 \uC4F8 \uC218 \uC5C6\uB294 \uAE00\uC790\uAC00 \uC788\uC5B4 \uAE30\uAE30\uC5D0 \uADF8\uB300\uB85C \uC801\uC5B4\uC694.", e);
      return json;
    }
  }
  function store2() {
    return writeRaw(key(), sealed(plain()));
  }
  function emit2(source) {
    var data = getData(), info = { source };
    listeners2.slice().forEach(function(fn) {
      try {
        fn(clone(data), info);
      } catch (e) {
        warn2("listener", "onChange \uD568\uC218\uC5D0\uC11C \uC624\uB958\uAC00 \uB0AC\uC5B4\uC694.", e);
      }
    });
    notifyValues(info);
    try {
      w.dispatchEvent(new w.CustomEvent("ncq-save", { detail: info }));
    } catch (e) {
    }
  }
  function ensure() {
    if (!cfg) {
      warn2("init", "NcqSave.init({id, data})\uB97C \uBA3C\uC800 \uBD88\uB7EC \uC8FC\uC138\uC694. \uC9C0\uAE08\uC740 \uC774\uB984 'game'\uC73C\uB85C \uC800\uC7A5\uD574\uC694.");
      init2({});
    }
  }
  function init2(opts) {
    opts = opts || {};
    var id = ID_RE.test(String(opts.id || "")) ? String(opts.id) : "game";
    if (opts.id && id !== String(opts.id)) warn2("id", "id\uB294 \uC601\uBB38\xB7\uC22B\uC790\xB7_\xB7- 60\uC790\uAE4C\uC9C0\uC608\uC694. 'game'\uC73C\uB85C \uC800\uC7A5\uD574\uC694.");
    if (cfg && cfg.id === id) {
      if (isObj(opts.data)) {
        cfg.data = clone(opts.data);
        setData(fill2(getData()));
      }
      if (typeof opts.merge === "function") cfg.merge = opts.merge;
      return api;
    }
    cfg = { id, data: isObj(opts.data) ? clone(opts.data) : {}, merge: typeof opts.merge === "function" ? opts.merge : null };
    use(load() || fresh());
    cloud.checked = null;
    store2();
    notifyValues({ source: "init" });
    if (cloudOn()) schedule(0);
    return api;
  }
  function walk(path, make, root) {
    var parts = String(path).split("."), cur = root, i;
    for (i = 0; i < parts.length - 1; i++) {
      if (!isObj(cur[parts[i]])) {
        if (!make) return null;
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    return [cur, parts[parts.length - 1]];
  }
  function get(path) {
    ensure();
    if (path === void 0 || path === null || path === "") return getData();
    var top = String(path).split(".")[0];
    if (!own2(vault, top)) return void 0;
    var holder = {};
    holder[top] = unseal(top, vault[top]);
    var at = walk(path, false, holder);
    return at && own2(at[0], at[1]) ? at[0][at[1]] : void 0;
  }
  function apply3(data, change) {
    Object.keys(change).forEach(function(path) {
      var v = change[path], at = walk(path, true, data);
      if (typeof v === "number" && isFinite(v)) at[0][at[1]] = (typeof at[0][at[1]] === "number" ? at[0][at[1]] : 0) + v;
      else at[0][at[1]] = clone(v);
    });
  }
  function commit(data, source) {
    var size2 = JSON.stringify(data).length;
    if (size2 > MAX_BYTES) warn2("size", "\uC800\uC7A5\uC774 \uB108\uBB34 \uCEE4\uC11C(" + size2 + "\uC790) \uD074\uB77C\uC6B0\uB4DC\uC5D0 \uC62C\uB9AC\uC9C0 \uBABB\uD574\uC694. " + MAX_BYTES + "\uC790 \uC544\uB798\uB85C \uC904\uC5EC \uC8FC\uC138\uC694.");
    setData(data);
    rec.rev += 1;
    rec.at = Date.now();
    rec.dirty = true;
    var ok = store2();
    emit2(source);
    return ok;
  }
  function update(fn) {
    ensure();
    if (typeof fn !== "function") return false;
    var draft = getData(), out;
    try {
      out = fn(draft);
    } catch (e) {
      warn2("update", "update \uD568\uC218\uC5D0\uC11C \uC624\uB958\uAC00 \uB098\uC11C \uC800\uC7A5\uD558\uC9C0 \uC54A\uC558\uC5B4\uC694.", e);
      return false;
    }
    if (out === false) return false;
    if (isObj(out) && out !== draft) draft = out;
    var ok = commit(fill2(draft), "update");
    if (due()) schedule(PUSH_WAIT);
    return ok;
  }
  function grant(id, change) {
    ensure();
    id = id === void 0 || id === null ? "" : String(id);
    if (id.length > 200) {
      warn2("grantId", "\uBCF4\uC0C1 id\uB294 200\uC790\uAE4C\uC9C0\uC608\uC694.");
      return false;
    }
    if (id && own2(rec.rc, id)) return true;
    var draft = getData(), out;
    if (typeof change === "function") {
      try {
        out = change(draft);
      } catch (e) {
        warn2("grant", "grant \uD568\uC218\uC5D0\uC11C \uC624\uB958\uAC00 \uB098\uC11C \uB123\uC9C0 \uC54A\uC558\uC5B4\uC694.", e);
        return false;
      }
      if (out === false) return false;
      if (isObj(out) && out !== draft) draft = out;
    } else if (isObj(change)) {
      apply3(draft, change);
    } else {
      return false;
    }
    if (id) rec.rc[id] = { t: Date.now(), a: isObj(change) ? clone(change) : 0 };
    rec.hot = true;
    var ok = commit(fill2(draft), "grant");
    schedule(0);
    return ok;
  }
  function has2(id) {
    ensure();
    return own2(rec.rc, String(id));
  }
  function reset() {
    ensure();
    var base2 = rec.base, owner = rec.owner, start = fresh(owner);
    use(start);
    rec.base = base2;
    rec.hot = true;
    commit(getData(), "reset");
    schedule(0);
    return true;
  }
  function onChange2(fn) {
    if (typeof fn !== "function") return function() {
    };
    listeners2.push(fn);
    return function() {
      listeners2 = listeners2.filter(function(f) {
        return f !== fn;
      });
    };
  }
  function cloudOn() {
    return !!(cfg && w.NCQ && w.NCQ.NCQ_SAVE && w.NcqAuth && w.NcqAuth.request);
  }
  function call(method, body) {
    return w.NcqAuth.request("/save/v1/save", method, body);
  }
  function parse(remote) {
    try {
      var s = JSON.parse(remote.data);
      if (isObj(s) && isObj(s.data)) return {
        sid: typeof s.sid === "string" ? s.sid : null,
        data: s.data,
        rc: isObj(s.rc) ? s.rc : {},
        at: +s.at || 0
      };
    } catch (e) {
    }
    return null;
  }
  function stash(why) {
    writeRaw(key(":" + why), sealed(plain()));
  }
  function adopt(remote, theirs, player) {
    if (rec.rev > 0 && rec.owner !== player) stash("before-cloud");
    setData(fill2(theirs.data));
    rec.rc = theirs.rc;
    rec.sid = theirs.sid || rec.sid;
    rec.at = theirs.at;
    rec.base = remote.rev;
    rec.owner = player;
    rec.dirty = false;
    rec.hot = false;
    rec.up = Date.now();
    store2();
    cloud.restored = true;
    emit2("cloud");
    return { ok: true, restored: true };
  }
  function merge(remote, theirs, player) {
    stash("before-merge");
    var mine = rec.owner === player, data, rc = {}, k;
    var local = { data: getData(), rc: rec.rc, at: rec.at };
    for (k in theirs.rc) if (own2(theirs.rc, k)) rc[k] = theirs.rc[k];
    for (k in local.rc) if (own2(local.rc, k)) rc[k] = local.rc[k];
    if (cfg.merge) {
      try {
        data = cfg.merge(clone(local.data), clone(theirs.data), { sameAccount: mine });
      } catch (e) {
        warn2("merge", "merge \uD568\uC218\uC5D0\uC11C \uC624\uB958\uAC00 \uB098\uC11C \uAE30\uBCF8 \uBC29\uBC95\uC73C\uB85C \uD569\uCCE4\uC5B4\uC694.", e);
        data = null;
      }
    }
    if (!isObj(data)) {
      var pick2 = mine && local.at >= theirs.at ? local : theirs, other = pick2 === local ? theirs : local;
      data = clone(pick2.data);
      for (k in other.rc) {
        if (own2(other.rc, k) && !own2(pick2.rc, k) && isObj(other.rc[k]) && isObj(other.rc[k].a)) apply3(data, other.rc[k].a);
      }
    }
    rec.rc = rc;
    rec.base = remote.rev;
    rec.owner = player;
    rec.sid = mine ? rec.sid : theirs.sid || rec.sid;
    commit(fill2(data), "cloud");
    cloud.restored = true;
  }
  function settle(remote, player, depth) {
    if (depth > 3) return Promise.reject(Object.assign(new Error("conflict"), { code: "conflict" }));
    var mine = rec.owner === player;
    if (!remote) {
      rec.owner = player;
      if (rec.rev === 0 && !rec.dirty) {
        store2();
        return Promise.resolve({ ok: true, restored: false });
      }
      rec.base = 0;
      return push(player, depth);
    }
    if (remote.rev === rec.base && mine) return rec.dirty && due() ? push(player, depth) : Promise.resolve({ ok: true, restored: false });
    var theirs = parse(remote);
    if (!theirs) return Promise.reject(Object.assign(new Error("bad_save"), { code: "bad_save" }));
    if (!rec.dirty || rec.rev === 0) return Promise.resolve(adopt(remote, theirs, player));
    merge(remote, theirs, player);
    return push(player, depth).then(function(r) {
      r.restored = true;
      return r;
    });
  }
  function push(player, depth) {
    var body = JSON.stringify({ sid: rec.sid, data: getData(), rc: rec.rc, at: rec.at });
    if (body.length > MAX_BYTES) return Promise.reject(Object.assign(new Error("too_large"), { code: "too_large" }));
    var sent = rec.rev;
    return call("POST", { base: rec.base, save: body }).then(function(out) {
      if (out.conflict) return settle(out.save, player, depth + 1);
      rec.base = out.rev;
      rec.owner = player;
      rec.up = Date.now();
      if (rec.rev === sent) {
        rec.dirty = false;
        rec.hot = false;
      }
      store2();
      cloud.at = Date.now();
      if (rec.dirty && due()) schedule(PUSH_WAIT);
      return { ok: true, restored: false };
    });
  }
  function sync() {
    if (!cloudOn()) return Promise.resolve({ ok: false, code: "disabled" });
    if (syncing) return syncing;
    syncing = w.NcqAuth.ready().then(function(me) {
      var player = me && me.player;
      if (!player) throw Object.assign(new Error("no_player"), { code: "no_player" });
      cloud.player = player;
      cloud.identity = me.identity || null;
      if (rec.owner && rec.owner !== player) {
        stash("account-" + rec.owner);
        use(fresh(null));
        cloud.checked = null;
        store2();
        emit2("account");
      }
      if (cloud.checked === player) return rec.dirty && due() ? push(player, 0) : { ok: true, restored: false };
      return call("GET").then(function(out) {
        return settle(out.save || null, player, 0);
      }).then(function(r) {
        cloud.checked = player;
        return r;
      });
    }).then(function(r) {
      cloud.error = null;
      retries = 0;
      return r;
    }, function(e) {
      cloud.error = e && e.code || "error";
      if (cloud.error === "too_large") warn2("size", "\uC800\uC7A5\uC774 \uB108\uBB34 \uCEE4\uC11C \uD074\uB77C\uC6B0\uB4DC\uC5D0 \uC62C\uB9AC\uC9C0 \uBABB\uD588\uC5B4\uC694.");
      else if (rec.dirty) retry();
      return { ok: false, code: cloud.error };
    }).then(function(r) {
      syncing = null;
      return r;
    });
    return syncing;
  }
  function retry() {
    if (retryTimer) return;
    var wait = RETRY[Math.min(retries, RETRY.length - 1)];
    retries += 1;
    retryTimer = w.setTimeout(function() {
      retryTimer = null;
      if (rec.dirty) sync();
    }, wait);
  }
  function schedule(ms) {
    if (!cloudOn()) return;
    if (timer) w.clearTimeout(timer);
    timer = w.setTimeout(function() {
      timer = null;
      sync();
    }, ms);
  }
  function due() {
    if (!rec) return false;
    if (rec.hot || !rec.up) return true;
    return Math.abs(Date.now() - rec.up) >= BACKUP_EVERY;
  }
  function backup() {
    if (!cfg && recordStores && Object.keys(recordStores).length) return Promise.resolve({ ok: true });
    ensure();
    if (rec.dirty && !rec.hot) {
      rec.hot = true;
      store2();
    }
    if (timer) {
      w.clearTimeout(timer);
      timer = null;
    }
    return sync().then(function(r) {
      return r.ok ? { ok: true } : { ok: false, code: r.code };
    });
  }
  function ready() {
    ensure();
    if (!cloudOn()) return Promise.resolve({ cloud: false, ok: true, restored: false });
    var wait = new Promise(function(resolve) {
      w.setTimeout(function() {
        resolve({ ok: false, code: "timeout" });
      }, READY_WAIT);
    });
    return Promise.race([sync(), wait]).then(function(r) {
      return { cloud: true, ok: !!r.ok, restored: cloud.restored, code: r.code };
    });
  }
  function status() {
    ensure();
    return {
      version: VERSION2,
      id: cfg.id,
      saveId: rec.sid,
      rev: rec.rev,
      dirty: rec.dirty,
      at: rec.at,
      receipts: Object.keys(rec.rc).length,
      tamper: { storage: tamper.storage, at: tamper.at },
      cloud: {
        enabled: cloudOn(),
        player: cloud.player,
        identity: cloud.identity,
        base: rec.base,
        at: cloud.at,
        error: cloud.error,
        busy: !!syncing,
        restored: cloud.restored,
        backedUp: rec.up,
        next: rec.dirty ? due() ? 0 : rec.up + BACKUP_EVERY : null
      }
    };
  }
  try {
    w.addEventListener("storage", function(e) {
      if (!cfg || e.key !== key()) return;
      var r = load();
      if (r) {
        use(r);
        emit2("other-tab");
      }
    });
    w.addEventListener("online", function() {
      if (cfg && rec.dirty && due()) sync();
    });
    var d = w.document;
    if (d) d.addEventListener("visibilitychange", function() {
      if (cfg && d.visibilityState === "hidden" && rec.dirty && due()) {
        if (timer) {
          w.clearTimeout(timer);
          timer = null;
        }
        sync();
      }
    });
  } catch (e) {
  }
  var KINDS = {
    int: function(v, start) {
      v = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
      return isFinite(v) ? Math.trunc(v) : start;
    },
    num: function(v, start) {
      v = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
      return isFinite(v) ? v : start;
    },
    bool: function(v) {
      return !!v;
    },
    str: function(v, start) {
      return v === void 0 || v === null ? start : String(v);
    }
  };
  function readValue(kind, path, start) {
    if (!cfg) return start;
    var v = get(path);
    return v === void 0 ? start : KINDS[kind](v, start);
  }
  function notifyValues(info) {
    watchers.slice().forEach(function(it) {
      var v = readValue(it.kind, it.path, it.start), mark = h32(JSON.stringify(v));
      if (mark === it.last) return;
      it.last = mark;
      try {
        it.fn(v, info);
      } catch (e) {
        warn2("value", "\uAC12\uC758 on \uD568\uC218\uC5D0\uC11C \uC624\uB958\uAC00 \uB0AC\uC5B4\uC694.", e);
      }
    });
  }
  function value(kind, path, start) {
    path = String(path || "");
    if (!path || path.split(".").some(function(p) {
      return !p;
    })) {
      warn2("path:" + path, "\uAC12 \uC774\uB984\uC774 \uBE44\uC5C8\uC5B4\uC694: NcqSave." + kind + '("coins", 0)\uCC98\uB7FC \uBD88\uB7EC\uC694.');
    }
    start = KINDS[kind](start, kind === "str" ? "" : kind === "bool" ? false : 0);
    var numeric = kind === "int" || kind === "num";
    function read() {
      return readValue(kind, path, start);
    }
    function write(v) {
      ensure();
      v = KINDS[kind](v, read());
      if (read() === v) return true;
      var done = false;
      update(function(s) {
        var at = walk(path, true, s);
        at[0][at[1]] = v;
        done = true;
      });
      return done;
    }
    function change(n, needEnough) {
      ensure();
      n = Number(n);
      if (!numeric || !isFinite(n)) return false;
      if (kind === "int") n = Math.trunc(n);
      var done = false;
      update(function(s) {
        var at = walk(path, true, s), cur = own2(at[0], at[1]) ? KINDS[kind](at[0][at[1]], start) : start;
        if (needEnough && (n < 0 || cur < n)) return false;
        at[0][at[1]] = KINDS[kind](needEnough ? cur - n : cur + n, start);
        done = true;
      });
      return done;
    }
    function on(fn) {
      if (typeof fn !== "function") return function() {
      };
      var it = { kind, path, start, fn, last: null };
      watchers.push(it);
      if (cfg) notifyValues({ source: "on" });
      return function() {
        watchers = watchers.filter(function(x) {
          return x !== it;
        });
      };
    }
    function bind(target, format) {
      return on(function(v) {
        var text = typeof format === "function" ? format(v) : String(v);
        if (typeof target === "function") target(text, v);
        else if (target && "textContent" in target) target.textContent = text;
      });
    }
    var h = { kind, path, get: read, set: write, on, bind };
    if (numeric) {
      h.add = function(n) {
        return change(n, false);
      };
      h.spend = function(n) {
        return change(n, true);
      };
    }
    Object.defineProperty(h, "value", { get: read, set: write, enumerable: true });
    return Object.freeze(h);
  }
  var recordStores = {};
  function records2(options) {
    options = options || {};
    var game = options.id || cfg && cfg.id, name = options.collection, player = options.player;
    if (!ID_RE.test(game || "") || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(name || "") || typeof player !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(player)) throw new Error("invalid_record_scope");
    var prefix = PREFIX + game + ":records:" + name + ":" + player + ":";
    if (recordStores[prefix]) return recordStores[prefix];
    var path = "/save/v1/records/" + name, callbacks = [], busy2 = null, checked = false, closed = false;
    var wake = null, attempts = 0, failure = null;
    function read(k) {
      var raw = own2(memory, k) ? memory[k] : readRaw(k);
      if (!raw) return null;
      try {
        var decoded = decodeStore(raw, prefix);
        if (!decoded.signed) noticeTamper("records");
        return JSON.parse(decoded.json);
      } catch (e) {
        failure = "bad_local_record";
        return null;
      }
    }
    function write(k, value2) {
      var ok = writeRaw(k, encodeStore(JSON.stringify(value2), prefix));
      if (!ok) failure = "storage_full";
      return ok;
    }
    function meta() {
      return read(prefix + "meta") || { cursor: 0, backedUpAt: 0, uploading: false };
    }
    function setMeta(values) {
      var next = meta();
      Object.keys(values).forEach(function(key2) {
        next[key2] = values[key2];
      });
      return write(prefix + "meta", next);
    }
    function itemKey(id) {
      return prefix + "item:" + encodeURIComponent(id);
    }
    function entries() {
      var keys = Object.keys(memory), seen = {};
      try {
        for (var i = 0; i < w.localStorage.length; i++) keys.push(w.localStorage.key(i));
      } catch (e) {
      }
      return keys.filter(function(key2) {
        if (!key2 || key2.indexOf(prefix + "item:") !== 0 || own2(seen, key2)) return false;
        seen[key2] = true;
        return true;
      }).map(read).filter(function(item) {
        return item && typeof item.id === "string" && isObj(item.data);
      });
    }
    function pending() {
      return entries().filter(function(item) {
        return !item.backed;
      });
    }
    function enabled() {
      var auth = w.NCQ && w.NCQ.NCQ_AUTH;
      return !closed && options.cloud !== false && !!(w.NCQ && w.NCQ.NCQ_SAVE && w.NcqAuth && w.NcqAuth.request) && (!auth || auth.game === game);
    }
    function due2() {
      var state = meta();
      return state.uploading || !state.backedUpAt || Math.abs(Date.now() - state.backedUpAt) >= BACKUP_EVERY;
    }
    function emit3(source) {
      callbacks.slice().forEach(function(fn) {
        try {
          fn({ source });
        } catch (e) {
          warn2("records-listener", "\uAE30\uB85D \uBCC0\uACBD \uC54C\uB9BC\uC5D0\uC11C \uC624\uB958\uAC00 \uB0AC\uC5B4\uC694.", e);
        }
      });
    }
    function later(ms) {
      if (wake) w.clearTimeout(wake);
      if (enabled()) wake = w.setTimeout(function() {
        wake = null;
        syncRecords();
      }, ms);
    }
    function bytes(value2) {
      return unescape(encodeURIComponent(JSON.stringify(value2))).length;
    }
    function add(id, data) {
      if (closed) return false;
      try {
        if (typeof id !== "string" || !id.length || id.length > 200 || !isObj(data)) throw new Error("invalid_record");
        data = clone(data);
        if (!isObj(data)) throw new Error("invalid_record");
        if (bytes(data) > 32e3) throw new Error("record_too_large");
        if (read(itemKey(id))) return true;
        var ok = write(itemKey(id), { id, data: clone(data), backed: false });
        emit3("local");
        later(PUSH_WAIT);
        return ok;
      } catch (e) {
        failure = e.message || "invalid_record";
        return false;
      }
    }
    async function request(method, body, cursor) {
      var me = await w.NcqAuth.ready();
      if (closed || me.player !== player) throw Object.assign(new Error("account_changed"), { code: "account_changed" });
      var out = await w.NcqAuth.request(path + (cursor === void 0 ? "" : "?after=" + cursor), method, body, player);
      if (closed) throw Object.assign(new Error("closed"), { code: "closed" });
      if (!out || out.ok !== true) throw Object.assign(new Error("bad_response"), { code: out && out.code || "bad_response" });
      return out;
    }
    async function pull() {
      var more = true;
      while (more) {
        var before = meta().cursor, out = await request("GET", void 0, before);
        if (!Array.isArray(out.items) || out.items.length > 50 || !Number.isSafeInteger(out.cursor) || out.cursor < before || out.hasMore && out.cursor === before) throw new Error("bad_response");
        var sequence = before;
        out.items.forEach(function(item) {
          if (typeof item.id !== "string" || !item.id.length || item.id.length > 200 || !isObj(item.data) || !Number.isSafeInteger(item.sequence) || item.sequence <= sequence) throw new Error("bad_response");
          sequence = item.sequence;
          if (!write(itemKey(item.id), { id: item.id, data: item.data, backed: true })) throw new Error("storage_full");
        });
        if (out.cursor !== sequence) throw new Error("bad_response");
        if (!setMeta({
          cursor: Math.max(meta().cursor, out.cursor),
          backedUpAt: Math.max(meta().backedUpAt, Number(out.backedUpAt) || 0)
        })) throw new Error("storage_full");
        if (out.items.length) emit3("cloud");
        more = out.hasMore === true;
      }
      checked = true;
    }
    async function pushRecords() {
      if (!setMeta({ uploading: true })) throw new Error("storage_full");
      var left = pending();
      while (left.length) {
        var batch = [];
        for (var i = 0; i < left.length && batch.length < 20; i++) {
          var item = { id: left[i].id, data: left[i].data };
          if (batch.length && bytes({ items: batch.concat([item]) }) > 24e4) break;
          batch.push(item);
        }
        var out = await request("POST", { items: batch });
        if (!Array.isArray(out.acknowledged) || batch.some(function(item2) {
          return out.acknowledged.indexOf(item2.id) < 0;
        })) throw new Error("bad_response");
        batch.forEach(function(item2) {
          var current2 = read(itemKey(item2.id));
          if (current2 && !write(itemKey(item2.id), { id: current2.id, data: current2.data, backed: true })) throw new Error("storage_full");
        });
        left = pending();
      }
      if (!setMeta({ uploading: false, backedUpAt: Date.now() })) throw new Error("storage_full");
      emit3("backup");
    }
    function syncRecords() {
      if (busy2) return busy2;
      if (!enabled()) return Promise.resolve({ ok: false, code: "disabled" });
      if (wake) {
        w.clearTimeout(wake);
        wake = null;
      }
      busy2 = Promise.resolve().then(async function() {
        if (!checked) await pull();
        if (pending().length && due2()) await pushRecords();
        failure = null;
        attempts = 0;
        return { ok: true };
      }).catch(function(e) {
        failure = e.code || e.message || "network";
        attempts += 1;
        if (failure !== "account_changed" && failure !== "closed") later(RETRY[Math.min(attempts - 1, RETRY.length - 1)]);
        return { ok: false, code: failure };
      }).then(function(result) {
        busy2 = null;
        if (result.ok && pending().length) later(Math.max(PUSH_WAIT, meta().backedUpAt + BACKUP_EVERY - Date.now()));
        return result;
      });
      return busy2;
    }
    function onStorage(event) {
      if (event.key === null || event.key && event.key.indexOf(prefix) === 0) {
        emit3("other-tab");
        later(PUSH_WAIT);
      }
    }
    function onOnline() {
      later(0);
    }
    function onVisibility() {
      if (!w.document || w.document.visibilityState === "visible") later(0);
    }
    var handle = Object.freeze({
      add,
      get: function(id) {
        var item = read(itemKey(id));
        return item ? clone(item.data) : void 0;
      },
      list: function() {
        return entries().map(function(item) {
          return { id: item.id, data: clone(item.data) };
        });
      },
      ready: syncRecords,
      sync: syncRecords,
      onChange: function(fn) {
        callbacks.push(fn);
        return function() {
          callbacks = callbacks.filter(function(item) {
            return item !== fn;
          });
        };
      },
      status: function() {
        var state = meta();
        return {
          player,
          collection: name,
          count: entries().length,
          pending: pending().length,
          backedUpAt: state.backedUpAt,
          cursor: state.cursor,
          cloud: enabled(),
          busy: !!busy2,
          error: failure
        };
      },
      dispose: function() {
        closed = true;
        if (wake) w.clearTimeout(wake);
        w.removeEventListener("storage", onStorage);
        w.removeEventListener("online", onOnline);
        if (w.document) w.document.removeEventListener("visibilitychange", onVisibility);
        delete recordStores[prefix];
      }
    });
    recordStores[prefix] = handle;
    w.addEventListener("storage", onStorage);
    w.addEventListener("online", onOnline);
    if (w.document) w.document.addEventListener("visibilitychange", onVisibility);
    later(0);
    return handle;
  }
  var api = {
    version: VERSION2,
    records: records2,
    init: init2,
    get,
    update,
    grant,
    has: has2,
    reset,
    onChange: onChange2,
    ready,
    backup,
    saveId: function() {
      ensure();
      return rec.sid;
    },
    status,
    int: function(path, start) {
      return value("int", path, start);
    },
    num: function(path, start) {
      return value("num", path, start);
    },
    bool: function(path, start) {
      return value("bool", path, start);
    },
    str: function(path, start) {
      return value("str", path, start);
    }
  };
  w.NcqSave = Object.freeze(api);
})();

// ncq/device.js
(function() {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION2 = 1;
  if (w.NcqDevice && w.NcqDevice.version >= VERSION2) return;
  var d = w.document;
  var KEY = "ncq:vibration";
  var GAP = 45;
  var MAX_MS = 1e3;
  var MAX_TOTAL = 5e3;
  var MAX_STEPS = 20;
  var KINDS = {
    tap: ["tap", "LIGHT", 12],
    light: ["tickWeak", "LIGHT", 8],
    medium: ["tickMedium", "MEDIUM", 16],
    heavy: ["basicMedium", "HEAVY", 28],
    success: ["success", "SUCCESS", [18, 60, 28]],
    warning: ["wiggle", "WARNING", [12, 40, 12, 40, 12]],
    error: ["error", "ERROR", [40, 50, 40]],
    // 토스 햅틱 이름 (토스는 그 햅틱, 다른 곳은 가까운 것으로)
    tickWeak: ["tickWeak", "LIGHT", 8],
    tickMedium: ["tickMedium", "MEDIUM", 16],
    softMedium: ["softMedium", "MEDIUM", 22],
    basicWeak: ["basicWeak", "LIGHT", 14],
    basicMedium: ["basicMedium", "HEAVY", 28],
    wiggle: ["wiggle", "WARNING", [12, 40, 12, 40, 12]],
    confetti: ["confetti", "SUCCESS", [20, 50, 20, 50, 40, 60, 70]]
  };
  var NOTICE = { SUCCESS: true, WARNING: true, ERROR: true };
  var LOWER = {};
  Object.keys(KINDS).forEach(function(k) {
    LOWER[k.toLowerCase()] = k;
  });
  var own2 = function(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  };
  var on = null;
  var last = 0;
  var timers = [];
  var warned2 = {};
  function noop2() {
  }
  function quiet(p) {
    if (p && typeof p.then === "function") p.then(noop2, noop2);
  }
  function now() {
    return (/* @__PURE__ */ new Date()).getTime();
  }
  function hidden() {
    return !!d && d.visibilityState === "hidden";
  }
  function tossHaptic() {
    var t3 = w.NcqToss;
    var dev2 = t3 && t3.Device;
    return dev2 && typeof dev2.triggerHaptic === "function" ? dev2 : null;
  }
  function appHaptic() {
    var cap = w.Capacitor;
    var h = cap && cap.Plugins && cap.Plugins.Haptics;
    if (!h || typeof h.impact !== "function") return null;
    try {
      if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
      if (typeof cap.isPluginAvailable === "function" && cap.isPluginAvailable("Haptics") === false) return null;
    } catch (e) {
      return null;
    }
    return h;
  }
  function webVibrate() {
    var nav = w.navigator;
    return nav && typeof nav.vibrate === "function" ? nav : null;
  }
  function stored() {
    if (on === null) {
      on = true;
      try {
        on = w.localStorage.getItem(KEY) !== "off";
      } catch (e) {
      }
    }
    return on;
  }
  function vibration(value) {
    if (arguments.length && value !== void 0) {
      on = !!value;
      try {
        if (on) w.localStorage.removeItem(KEY);
        else w.localStorage.setItem(KEY, "off");
      } catch (e) {
      }
      if (!on) stop();
    }
    return stored();
  }
  function canVibrate() {
    if (tossHaptic() || appHaptic()) return true;
    if (!webVibrate()) return false;
    try {
      return (w.navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in w;
    } catch (e) {
      return false;
    }
  }
  function stop() {
    while (timers.length) clearTimeout(timers.pop());
    var nav = webVibrate();
    if (nav && !tossHaptic() && !appHaptic()) {
      try {
        nav.vibrate(0);
      } catch (e) {
      }
    }
  }
  function ms(value) {
    var n = Math.round(Number(value) || 0);
    return n < 0 ? 0 : n > MAX_MS ? MAX_MS : n;
  }
  function pattern(list2) {
    var out = [];
    var total = 0;
    for (var i = 0; i < list2.length && out.length < MAX_STEPS; i++) {
      var v = Math.min(ms(list2[i]), MAX_TOTAL - total);
      if (v <= 0 && i % 2 === 0) break;
      out.push(v);
      total += v;
      if (total >= MAX_TOTAL) break;
    }
    while (out.length && out.length % 2 === 0) out.pop();
    return out;
  }
  function tossFor(length) {
    return length <= 20 ? "tickWeak" : length <= 40 ? "tap" : "basicMedium";
  }
  function each(steps, fn) {
    var at = 0;
    steps.forEach(function(v, i) {
      if (i % 2 === 0) {
        if (at === 0) fn(v);
        else timers.push(setTimeout(function() {
          if (!hidden()) fn(v);
        }, at));
      }
      at += v;
    });
  }
  function kindOf(value) {
    if (value === void 0 || value === null || value === true) return KINDS.tap;
    if (typeof value === "string") {
      var k = own2(KINDS, value) ? value : own2(LOWER, value.toLowerCase()) ? LOWER[value.toLowerCase()] : null;
      if (k) return KINDS[k];
      if (!own2(warned2, value)) {
        warned2[value] = true;
        try {
          w.console.warn("[NcqDevice] \uBAA8\uB974\uB294 \uC9C4\uB3D9 \uC774\uB984\uC774\uC5D0\uC694: " + value + " (tap light medium heavy success warning error)");
        } catch (e) {
        }
      }
    }
    return null;
  }
  function vibrate(value) {
    try {
      if (value === 0 || value === false) {
        stop();
        return false;
      }
      if (!stored() || hidden()) return false;
      var toss = tossHaptic();
      var app = toss ? null : appHaptic();
      var nav = toss || app ? null : webVibrate();
      if (!toss && !app && !nav) return false;
      var kind = null;
      var steps = null;
      if (Array.isArray(value)) {
        steps = pattern(value);
        if (!steps.length) return false;
      } else if (typeof value === "number") {
        steps = [ms(value)];
        if (!steps[0]) return false;
      } else {
        kind = kindOf(value);
        if (!kind) return false;
      }
      var short = steps ? steps.length === 1 && steps[0] <= 100 : !NOTICE[kind[1]] && !Array.isArray(kind[2]);
      var t3 = now();
      if (short && t3 - last < GAP) return false;
      last = t3;
      while (timers.length) clearTimeout(timers.pop());
      if (toss) {
        if (kind) quiet(toss.triggerHaptic({ type: kind[0] }));
        else each(steps, function(v) {
          quiet(toss.triggerHaptic({ type: tossFor(v) }));
        });
      } else if (app) {
        if (kind && NOTICE[kind[1]]) quiet(app.notification({ type: kind[1] }));
        else if (kind) quiet(app.impact({ style: kind[1] }));
        else each(steps, function(v) {
          quiet(app.vibrate({ duration: v }));
        });
      } else {
        return nav.vibrate(kind ? kind[2] : steps.length === 1 ? steps[0] : steps) !== false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  if (d && d.addEventListener) {
    d.addEventListener("visibilitychange", function() {
      if (hidden()) stop();
    });
  }
  w.NcqDevice = { version: VERSION2, vibrate, canVibrate, vibration };
})();

// texts.js
var TEXTS = {
  en: {
    forestWatch: "Watch",
    forestDaysLeft: "{n}d left",
    forestHoursLeft: "{n}h left",
    forestMinutesLeft: "{n}m left",
    forestRecords: "Records",
    forestMission: "Missions",
    forestChampionship: "Weekly Championship",
    forestPromotionProgress: "Progress to the next rank",
    forestMissionRules: "Mission eligibility",
    forestWeekEnded: "Ended",
    forestThisWeek: "This week",
    forestLastWeek: "Last week",
    forestOverall: "All time",
    forestRankingPoints: "{n} pts",
    chooseRules: "Choose rules",
    currentRule: "Choose rules. Selected: {rule}",
    ruleFree: "Freestyle",
    ruleFreeHelp: "Win with five or more in a row.",
    ruleTaraguchi: "World Championship \xB7 Taraguchi-10",
    ruleTaraguchiShort: "Taraguchi-10",
    ruleTaraguchiHelp: "Play inside the center squares and swap colors during the opening. After four stones, Black may offer ten fifth moves for White to choose from.",
    ruleRenju: "Renju",
    ruleRenjuHelp: "Alternate from the first stone. Black must make exactly five and cannot play double-threes, double-fours or overlines. White may win with five or more.",
    swapColors: "Swap colors",
    offerFifthMoves: "Offer 10 fifth moves",
    offerProgress: "Fifth-move offers {n}/{total}",
    pickFifth: "White chooses the fifth stone",
    offerShort: "Offer",
    pickShort: "Choose",
    fifthCandidate: "Fifth-move candidate {n}",
    openingStone: "Taraguchi-10 \xB7 Stone {n} ({color})",
    openingInArea: "Stone {n} ({color}) \xB7 Center {size}\xD7{size}",
    outsideOpening: "Play inside the marked opening area.",
    alreadyOffered: "This spot is already a candidate.",
    symmetricOffer: "This spot is symmetric to an existing candidate.",
    chooseOffered: "Choose one of the numbered candidates.",
    passTurn: "Pass",
    confirmPass: "Pass your turn without placing a stone?",
    matchActive: "Leave your current match room before changing rules.",
    renjuOverline: "Black cannot make a line of six or more.",
    renjuDoubleThree: "Black cannot play a double-three here.",
    renjuDoubleFour: "Black cannot play a double-four here.",
    title: "Jangi Duel",
    liveGames: "Live games",
    liveCount: { one: "{n} game", other: "{n} games" },
    liveWatchers: "{n} watching",
    liveMoves: { one: "{n} move played", other: "{n} moves played" },
    liveLoading: "Loading games\u2026",
    noLiveGames: "No games in progress yet.",
    liveUnavailable: "Couldn\u2019t load games.",
    start: "Play now",
    refreshLobby: "Refresh",
    lobbyNavigation: "Lobby navigation",
    rankings: "Rankings",
    playTab: "Play",
    playerInfo: "My profile",
    lobbyRankRecord: "Rank record \xB7 {record}",
    profileRating: "Rating",
    profileRatingValue: "{rating} pts",
    profileRatingStanding: "Overall ranking",
    profileRatingStandingValue: "#{position} / {players} players",
    profileRatingStandingPending: "Play a rated match",
    overallRecord: "Overall record",
    winRate: "Win rate",
    currentRankRecord: "Current rank record",
    profileWinRate: "Win rate {rate}",
    profileRankings: "View rankings",
    confirmProfile: "OK",
    profileLoading: "Loading your record\u2026",
    profileUnavailable: "Couldn\u2019t load your record.",
    profileOffline: "Your online record is available when connected.",
    opponentProfileLoading: "Loading the opponent\u2019s record\u2026",
    opponentProfileUnavailable: "Couldn\u2019t load the opponent\u2019s record.",
    opponentProfileOffline: "Opponent records are available in online matches.",
    promotionPoints: "Promotion and demotion points",
    demotion: "Demotion",
    promotion: "Promotion",
    lowestRank: "Lowest rank",
    highestRank: "Highest rank",
    promotionMeter: "{value} points from the rank midpoint. {lowLabel} {lowTick}. {highLabel} {highTick}.",
    resultPromotionMeter: "From {previous} to {value} points relative to the rank midpoint. {lowLabel} {lowTick}. {highLabel} {highTick}.",
    resultMeterPrevious: "Previous",
    resultMeterCurrent: "Current",
    shop: "Shop",
    shopCurrency: "Coins",
    shopRemoveAdsTitle: "Remove ads",
    shopRemoveAdsOnce: "One-time",
    shopRemoveAdsDescription: "Play without ads.",
    shopRemoveAdsBuy: "Buy \xB7 {price}",
    shopRemoveAdsActivated: "Ad removal is active.",
    shopRemoveAdsPending: "Ad removal will activate when your payment is confirmed.",
    shopRemoveAdsFailed: "The purchase could not be confirmed. Try again or restore purchases.",
    shopCoinPacks: "Coin packs",
    rewardAdTitle: "20 free coins",
    rewardAdGuide: "Watch an ad \xB7 Up to 3 per day. Resets at midnight Korea time.",
    rewardAdRemaining: "{n} / {max} views left today",
    rewardAdWatch: "Watch ad",
    rewardAdWatching: "Please wait\u2026",
    rewardAdChecking: "Checking remaining views\u2026",
    rewardAdRetry: "Claim reward",
    rewardAdDone: "Daily limit reached",
    rewardAdLimit: "You've received all 3 ad rewards today. Come back after midnight Korea time.",
    rewardAdBusy: "An ad reward is already in progress on your account. Try again shortly.",
    rewardAdExpired: "This ad reward session has expired. Please try again.",
    rewardAdFailed: "Couldn't start the ad reward. Please try again.",
    rewardAdRetryMessage: "Couldn't receive the reward. Tap Claim reward to retry without watching another ad.",
    shopCoinPacksGuide: "Use coins for skins and placement effects.",
    shopCoinPacksUnavailable: "Coin packs are unavailable on this device.",
    shopCoinPackPrice: "{n} coins \xB7 {price}",
    shopTestCoinClaim: "Claim 50 test coins",
    shopTestCoinDone: "Test coins were credited to your wallet.",
    shopTestCoinFailed: "Couldn\u2019t claim test coins. Try again.",
    optionsPlayerId: "Player ID",
    optionsPlayerIdCopy: "Copy",
    optionsPlayerIdCopyLabel: "Copy player ID",
    optionsPlayerIdCopied: "Player ID copied.",
    optionsPlayerIdCopyManually: "Copy the selected player ID.",
    shopCoinPurchaseDone: "Your purchase was added to your account wallet.",
    shopCoinPurchasePending: "Your purchase is being checked. Coins will be added once it is confirmed.",
    shopCoinPurchaseFailed: "Could not complete the coin purchase. Try again later.",
    shopCoinRefundDebt: "{n} coins from a refund will be deducted from future credits.",
    purchaseRestore: "Restore purchases",
    purchaseRestored: "Ad removal restored.",
    purchaseRestoreEmpty: "No ad removal purchase to restore.",
    purchaseRestoreFailed: "Purchases could not be restored. Try again.",
    shopSkins: "Skins",
    shopPreviousSkins: "Previous skins",
    shopNextSkins: "More skins",
    shopBalance: "Balance",
    lobbyCoins: "Coin balance",
    dailyMissions: "Daily missions",
    missionGuide: "Resets daily at 00:00 (Korea time)",
    missionEligibility: "Wins, draws and losses count. Games with no moves, or ending by resignation, disconnect or timeout before move 6, are excluded.",
    missionFirstGoal: "Play {n} match",
    missionGoal: "Play {n} matches",
    missionRepeatGoal: "Repeat mission",
    missionRepeatProgress: "Today {count}/{target}",
    missionRepeatNote: "After {after} matches: {coins} coins each \xB7 Up to {n}/day",
    missionProgress: "{count}/{target}",
    missionTrackCount: "{count} / {target}",
    missionOverview: "Today's missions",
    missionOverviewCount: "{count} / {target}",
    missionClaim: "Claim",
    missionClaimed: "Claimed",
    missionInProgress: "In progress",
    missionClaimSuccess: "Coins added.",
    coinRewardTitle: "Reward received",
    coinRewardCoins: "+{n} coins",
    missionClaimFailed: "Couldn't save your reward. Try again.",
    missionMilestoneTotal: "/ {target} complete",
    missionView: "View",
    shopGoldenPlacement: "Golden placement",
    shopPlacementStyle: "Placement effect",
    shopEffectsTab: "Effects",
    shopPlainPlacement: "Standard placement",
    shopSakuraPlacement: "Cherry blossom placement",
    shopRipplePlacement: "Blue ripples",
    shopMysticPlacement: "Mystic aura",
    shopPlacementGuide: "Choose the effect both players see when you place a stone.",
    shopGoldenPlacementGuide: "A flash of gold. The pass lasts 24 hours.",
    shopSakuraPlacementGuide: "Petals scatter as the stone lands. The pass lasts 24 hours.",
    shopRipplePlacementGuide: "Blue ripples and water droplets spread from the stone. The pass lasts 24 hours.",
    shopMysticPlacementGuide: "Violet wisps and sparkling particles rise from the stone. The pass lasts 24 hours.",
    shopPlainPlacementGuide: "A stone lands with the standard motion.",
    shopEffectFree: "Free",
    shopEffectApplied: "Placement effect applied.",
    shopEffectMinutesLeft: "{m}m left",
    shopEffectHoursLeft: "{h}h {m}m left",
    shopBuyEffect: "Activate \xB7 {n} coins",
    shopExtendEffect: "Add 24 hours \xB7 {n} coins",
    shopEffectPurchased: "Golden placement is active.",
    shopSakuraPurchased: "Cherry blossom placement equipped. 24 hours added to your pass.",
    shopRipplePurchased: "Blue ripples equipped. 24 hours added to your pass.",
    shopMysticPurchased: "Mystic aura equipped. 24 hours added to your pass.",
    adPrivacy: "Ad privacy settings",
    shopPreviewGuide: "Choose a skin to preview.",
    shopLockedPreview: "Buy to apply.",
    shopNotEnough: "Not enough coins.",
    shopApplied: "Applied",
    shopSelected: "Selected",
    shopSelectedLocked: "Selected \xB7 Locked",
    shopOwned: "Owned",
    shopLocked: "Locked",
    shopPrice: "{n} coins",
    shopApply: "Apply",
    shopBuyPrice: "Buy \xB7 {n} coins",
    shopPurchaseComplete: "Purchase complete",
    shopPurchased: "Purchased {items}. Select Apply to equip.",
    shopAppliedTemporarily: "Applied for this visit.",
    shopSaveFailed: "Couldn\u2019t save the purchase. Your balance has stayed the same.",
    shopClose: "Close",
    nickname: "Nickname",
    editNickname: "Edit nickname",
    guestNickname: "Guest",
    rankKyu: "{n} kyu",
    rankDan: "{n} dan",
    stoneStyle: "Stone style",
    boardStyle: "Board background",
    appearancePreview: "Preview",
    gridStyle: "Grid lines",
    stoneSound: "Stone sounds",
    vibration: "Vibration",
    engravedGrid: "Dark engraved",
    softGrid: "Light engraved",
    referenceStones: "Matjjang",
    referenceBoard: "Golden Wood",
    gildedStones: "Antique",
    gildedBoard: "Gilded walnut",
    vintageStones: "Vintage stones",
    vintageBoard: "Vintage wood",
    porcelainSkin: "Porcelain & Ink",
    jadeSkin: "Jade",
    lacquerSkin: "Lacquer & Pearl",
    oceanSkin: "Night Sea",
    sodaSkin: "Soda Glass",
    quartzSkin: "Quartz",
    marbleSkin: "Marble",
    sapphireSkin: "Blue Sapphire",
    sakuraSkin: "Cherry Blossom",
    auroraSkin: "Aurora",
    classicStyle: "Classic",
    glossyStones: "Glossy",
    woodBoard: "Wood grain",
    records: "Records",
    friends: "Friends",
    comingSoon: "Coming soon",
    careerRecord: "{wins}W \xB7 {draws}D \xB7 {losses}L",
    rankRating: "{rank} \xB7 {rating} rating",
    nextRank: "{points} points to {rank}",
    rankUp: "Promoted to {rank}",
    rankCelebration: "Promoted to {rank}!",
    rankCelebrationIntro: "Rank up!",
    rankCelebrationDismiss: "Tap anywhere to close",
    rankDown: "Moved to {rank}",
    noRecords: "Your completed games will appear here.",
    backToRecords: "Back to records",
    matching: "Finding a match",
    matchIntroTitle: "Match start",
    matchIntroRating: "Rating {rating} pts",
    matchIntroEstimate: "Estimated rating change",
    matchIntroWin: "Win {points}",
    matchIntroLoss: "Loss {points}",
    findingOpponent: "Looking for an opponent\u2026",
    cancel: "Cancel",
    canceling: "Canceling\u2026",
    queueExpired: "The search ended. Tap Find a match to try again.",
    onlineMatch: "Online match",
    casualMatch: "Regular match",
    nextMatch: "Next match",
    spectate: "Watch",
    leaveSpectating: "Back to lobby",
    watchTurn: "{color} to move",
    watchReplay: "Replay \xB7 move {n}",
    watchLatestMove: "Go to latest move",
    watchWinner: "{color} wins",
    watchEnded: "This match has ended.",
    opponent: "Opponent",
    movesCount: { one: "{n} move", other: "{n} moves" },
    authFailed: "Couldn\u2019t verify your player ID. Try again.",
    forbidden: "Only players in this match can open it.",
    weeklyTournament: "Weekly tournament",
    currentTournament: "Current tournament",
    currentTournamentRecord: "Current tournament record",
    previousTournament: "Last week",
    previousTournamentRecord: "Last week\u2019s tournament record",
    tournamentSummary: "Ranks & entry",
    championshipName: "{month} Week {week} Jangi Duel Championship",
    championshipEndsDays: "Ends in {days}d {hours}h",
    championshipEndsHours: "Ends in {hours}h {minutes}m",
    championshipEndsMinutes: "Ends in {minutes}m",
    noStandings: "No ranked results yet. Complete a weekly tournament match to appear here.",
    ratingRankings: "Overall rankings",
    noPreviousStandings: "There were no results last week.",
    tournamentFinalizing: "Finalizing results",
    tournamentFinalized: "Final results",
    tournamentStandings: "Tournament standings",
    participationReward: "Participation reward",
    rankingReward: "Ranking reward",
    participationRewardProgress: "Eligible games: {target} ({count}/{target})",
    rankingRewardPlace: "Reward rank #{rank}",
    weeklyRewardClaim: "Claim",
    weeklyRewardClaimed: "Claimed",
    weeklyRewardClaimLabel: "{reward}, {coins} coins, {action}",
    rewardAvailableLabel: "{label} \xB7 Reward available",
    weeklyRewardUnavailable: "This tournament reward is no longer available.",
    rankingPosition: "Rank #{rank}",
    rankingPositionEmpty: "Rank -",
    rankingScoreEmpty: "Score -",
    rankingPlayerCount: { one: "{count} player", other: "{count} players" },
    tournamentRuleFixed: "Renju rules, fixed for the tournament",
    tournamentLimit: "You have no attempts left today. Free attempts reset at midnight KST.",
    tournamentCatchUp: "{n} missed attempts available this week.",
    tournamentCatchUpFunds: "{n} missed attempts available. You need more coins.",
    joinTournamentCatchUp: "Catch up",
    joinTournamentCatchUpCost: "Catch up for {n} coins",
    tournamentMissedAttempts: "Missed attempts this week",
    tournamentMissedCount: "{n}",
    confirmTournamentCatchUp: "Make up one missed attempt? Coins are charged when a match is found.",
    tournamentPriceChanged: "The catch-up price changed. Check the new price and try again.",
    coinNotEnough: "You don\u2019t have enough available coins.",
    coinShortageTitle: "Not enough coins",
    coinShortageMessage: "You don\u2019t have enough coins. Would you like to buy more?",
    coinShortageYes: "Yes",
    coinShortageNo: "No",
    missionUnavailable: "This mission reward isn\u2019t available. Check your progress and try again.",
    tournamentClosed: "The weekly tournament has ended.",
    noRatingStandings: "No rated matches yet.",
    rankingsUnavailable: "Rankings are available online.",
    rankingsLoading: "Loading rankings\u2026",
    rankingsLoadFailed: "Couldn\u2019t load the rankings.",
    rankingRetry: "Try again",
    rankingPrevious: "Previous",
    rankingNext: "Next",
    rankingPage: "Page {page}",
    rankingPageOf: "{page} / {pages}",
    joinTournament: "Enter",
    joinTournamentExhausted: "No attempts left",
    joinTournamentAttempts: "Enter ({remaining}/{limit})",
    tournamentWaiting: "Finding a weekly tournament opponent\u2026",
    playerAlias: "Player #{alias}",
    deviceRecord: "On this device",
    pointsCount: { one: "{n} point", other: "{n} points" },
    options: "Options",
    language: "Language",
    sendFeedback: "Send feedback",
    room: "MATCH",
    leave: "Leave",
    waiting: "Waiting for a friend",
    reconnecting: "Reconnecting\u2026",
    yourTurn: "Your turn",
    theirTurn: "Opponent\u2019s turn",
    turnActive: "Turn",
    turnWaiting: "Waiting",
    won: "You win!",
    lost: "Opponent wins",
    draw: "It\u2019s a draw",
    round: "Round {n}",
    black: "Black",
    white: "White",
    you: "You",
    result: "MATCH RESULT",
    victoryMedal: "Victory!",
    defeatMedal: "Defeat",
    drawMedal: "Draw",
    winBadge: "WIN",
    lossBadge: "LOSS",
    drawBadge: "DRAW",
    resultWinner: "{color} won in {n} moves.",
    review: "Review",
    recordView: "Game review",
    moveNumbers: "Show move numbers",
    moveNumbersShort: "Moves",
    placementTimingTest: "Placement timing \xB7 Test",
    placementTimingValue: "Land {duration} ms \xB7 Contact {contact} ms",
    placementTimingHelp: "Release to replay this stone. Applies in review only.",
    moveNumber: "Move {n}",
    recordShare: "Share game record",
    recordShareAction: "Share",
    recordSendLink: "Share link",
    recordShareMessage: "Replay this Jangi Duel game.",
    recordPlay: "Play Jangi",
    recordPublic: "Public",
    recordPrivate: "Private",
    recordPublicLink: "Public link",
    recordVisibilitySettings: "Record visibility",
    recordMakePublic: "Make public and create link",
    recordMakePrivate: "Make private",
    recordCopyLink: "Copy link",
    recordLinkCopied: "Game record link copied.",
    recordCopyManually: "The link is selected. Copy it to share.",
    recordShareLoading: "Checking link visibility\u2026",
    recordSharePreparing: "Preparing the link\u2026",
    recordShareSaving: "Updating link visibility\u2026",
    recordShareFailed: "Couldn\u2019t update the link. Try again.",
    recordMadePrivate: "Your previous link is now closed.",
    recordSharedUnavailable: "This game record link is private or no longer available.",
    recordList: "Game records",
    tournamentRecords: "Tournament records",
    noTournamentRecords: "Your completed weekly tournament games will appear here.",
    recordPasses: "Passes: Black {black} \xB7 White {white}",
    recordFilters: "Filter game records",
    recordAll: "All",
    recordFavorite: "Favorite this game",
    recordFavorites: "Favorites",
    recordWins: "Wins",
    recordNoFavorites: "Star a game to keep it here.",
    recordNoWins: "Your wins will appear here.",
    recordVersus: "vs {name}",
    reviewBack: "Go back",
    recordGuest: "Guest #{code}",
    recordWin: "{color} wins",
    recordTimeWin: "{color} wins on time",
    recordResignWin: "{color} wins by resignation",
    recordDisconnectWin: "{color} wins by disconnect",
    recordUnknownWin: "{color} wins \xB7 Reason unavailable",
    recordPersonalWin: "Win",
    recordPersonalLoss: "Loss",
    recordPersonalTimeWin: "Win on time",
    recordPersonalTimeLoss: "Loss on time",
    recordPersonalResignWin: "Win by resignation",
    recordPersonalResignLoss: "Loss by resignation",
    recordPersonalDisconnectWin: "Win by disconnect",
    recordPersonalDisconnectLoss: "Loss by disconnect",
    recordPersonalUnknownWin: "Win \xB7 Reason unavailable",
    recordPersonalUnknownLoss: "Loss \xB7 Reason unavailable",
    firstMove: "Go to empty board",
    previousMove: "Previous move",
    nextMove: "Next move",
    lastMove: "Go to final move",
    board: "Jangi board",
    square: "{cell}, empty",
    blackSquare: "{cell}, black",
    whiteSquare: "{cell}, white",
    invite: "Copy invite link",
    copied: "Invite link copied.",
    copyManually: "Copy this link to invite a friend.",
    done: "Done",
    selectStone: "Choose a spot",
    placeStone: "Place",
    placeSelectHint: "Pick a spot",
    placeReadyHint: "Ready",
    place: "Place at {cell}",
    rematch: "Rematch",
    rematchWaiting: "Waiting \xB7 1/2",
    rematchReady: "Accept rematch",
    confirmLeave: "Leave and close this room for both players?",
    confirmLeaveTitle: "Leave game",
    confirmResign: "Leave and resign this game?",
    closed: "The room has closed.",
    notFound: "That room has closed or the code is incorrect.",
    full: "Two players are already in that room.",
    busy: "All rooms are in use. Try again later.",
    invalid: "That action couldn\u2019t be completed.",
    stale: "The round has changed. Try again.",
    wrongTurn: "You can place a stone on your turn.",
    occupied: "There\u2019s already a stone there.",
    network: "Couldn\u2019t reach the game server. Try again."
  },
  ko: {
    forestWatch: "\uAD00\uC804",
    forestDaysLeft: "{n}\uC77C \uB0A8\uC74C",
    forestHoursLeft: "{n}\uC2DC\uAC04 \uB0A8\uC74C",
    forestMinutesLeft: "{n}\uBD84 \uB0A8\uC74C",
    forestRecords: "\uAE30\uBCF4",
    forestMission: "\uBBF8\uC158",
    forestChampionship: "\uC8FC\uAC04 \uCC54\uD53C\uC5B8\uC2ED",
    forestPromotionProgress: "\uB2E4\uC74C \uAE09\uC218\uAE4C\uC9C0\uC758 \uC9C4\uD589\uB3C4",
    forestMissionRules: "\uBBF8\uC158 \uC9D1\uACC4 \uAE30\uC900",
    forestWeekEnded: "\uC885\uB8CC",
    forestThisWeek: "\uC774\uBC88 \uC8FC",
    forestLastWeek: "\uC9C0\uB09C\uC8FC",
    forestOverall: "\uB204\uC801",
    forestRankingPoints: "{n}\uC810",
    chooseRules: "\uB300\uAD6D \uB8F0 \uC120\uD0DD",
    currentRule: "\uB300\uAD6D \uB8F0 \uC120\uD0DD. \uD604\uC7AC {rule}",
    ruleFree: "\uC790\uC720\uB8F0",
    ruleFreeHelp: "\uD751\uACFC \uBC31 \uBAA8\uB450 \uB2E4\uC12F \uC54C \uC774\uC0C1\uC744 \uC774\uC73C\uBA74 \uC774\uACA8\uC694.",
    ruleTaraguchi: "\uC138\uACC4\uB300\uD68C\uB8F0 \xB7 \uD0C0\uB77C\uAD6C\uCE58-10",
    ruleTaraguchiShort: "\uC138\uACC4\uB300\uD68C\uB8F0",
    ruleTaraguchiHelp: "\uCD08\uBC18\uC5D0\uB294 \uC911\uC559 \uBC94\uC704\uC5D0 \uB450\uACE0 \uD751\uBC31\uC744 \uBC14\uAFC0 \uC218 \uC788\uC5B4\uC694. \uB124 \uC218 \uB4A4 \uD751\uC774 5\uC218 \uD6C4\uBCF4 10\uACF3\uC744 \uB0B4\uBA74 \uBC31\uC774 \uD55C \uACF3\uC744 \uACE8\uB77C\uC694.",
    ruleRenju: "\uB80C\uC8FC\uB8F0",
    ruleRenjuHelp: "\uCCAB \uC218\uBD80\uD130 \uBC88\uAC08\uC544 \uB46C\uC694. \uD751\uC740 33\xB744\xB7\uC7A5\uBAA9\uC774 \uAE08\uC218\uC774\uACE0 \uC815\uD655\uD788 \uB2E4\uC12F \uC54C\uC744 \uC774\uC73C\uBA74 \uC774\uACA8\uC694. \uBC31\uC740 \uB2E4\uC12F \uC54C \uC774\uC0C1\uC774\uBA74 \uC774\uACA8\uC694.",
    swapColors: "\uD751\uBC31 \uBC14\uAFB8\uAE30",
    offerFifthMoves: "5\uC218 \uD6C4\uBCF4 10\uACF3 \uC81C\uC548",
    offerProgress: "5\uC218 \uD6C4\uBCF4 \uC81C\uC548 {n}/{total}",
    pickFifth: "\uBC31\uC774 5\uC218 \uD6C4\uBCF4\uB97C \uACE8\uB77C\uC694",
    offerShort: "\uC81C\uC548",
    pickShort: "\uC120\uD0DD",
    fifthCandidate: "5\uC218 \uD6C4\uBCF4 {n}\uBC88",
    openingStone: "\uD0C0\uB77C\uAD6C\uCE58-10 \xB7 {n}\uBC88\uC9F8 {color}",
    openingInArea: "{n}\uBC88\uC9F8 {color} \xB7 \uC911\uC559 {size}\xD7{size}",
    outsideOpening: "\uD45C\uC2DC\uB41C \uC911\uC559 \uBC94\uC704 \uC548\uC5D0 \uB458 \uC218 \uC788\uC5B4\uC694.",
    alreadyOffered: "\uC774\uBBF8 \uC81C\uC548\uD55C \uD6C4\uBCF4\uC608\uC694.",
    symmetricOffer: "\uC774\uBBF8 \uC81C\uC548\uD55C \uD6C4\uBCF4\uC640 \uB300\uCE6D\uC778 \uC790\uB9AC\uC608\uC694.",
    chooseOffered: "\uBC88\uD638\uAC00 \uBD99\uC740 \uD6C4\uBCF4 \uC911\uC5D0\uC11C \uACE8\uB77C \uC8FC\uC138\uC694.",
    passTurn: "\uD55C \uC218 \uC27C",
    confirmPass: "\uB3CC\uC744 \uB193\uC9C0 \uC54A\uACE0 \uC0C1\uB300\uC5D0\uAC8C \uCC28\uB840\uB97C \uB118\uAE38\uAE4C\uC694?",
    matchActive: "\uB8F0\uC744 \uBC14\uAFB8\uB824\uBA74 \uAE30\uC874 \uB300\uAD6D\uBC29\uC5D0\uC11C \uBA3C\uC800 \uB098\uC640 \uC8FC\uC138\uC694.",
    renjuOverline: "\uD751\uC740 \uC5EC\uC12F \uC54C \uC774\uC0C1 \uC787\uB294 \uC790\uB9AC\uC5D0 \uB458 \uC218 \uC5C6\uC5B4\uC694.",
    renjuDoubleThree: "\uD751\uC740 33 \uAE08\uC218 \uC790\uB9AC\uC5D0 \uB458 \uC218 \uC5C6\uC5B4\uC694.",
    renjuDoubleFour: "\uD751\uC740 44 \uAE08\uC218 \uC790\uB9AC\uC5D0 \uB458 \uC218 \uC5C6\uC5B4\uC694.",
    title: "\uB9DE\uC9F1 \uC7A5\uAE30",
    liveGames: "\uB300\uAD6D \uBAA9\uB85D",
    liveCount: "\uCD1D {n}\uAC1C",
    liveWatchers: "{n}\uBA85 \uAD00\uC804",
    liveMoves: "{n}\uC218 \uC9C4\uD589",
    liveLoading: "\uB300\uAD6D \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
    noLiveGames: "\uC544\uC9C1 \uC9C4\uD589 \uC911\uC778 \uB300\uAD6D\uC774 \uC5C6\uC5B4\uC694.",
    liveUnavailable: "\uB300\uAD6D \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.",
    start: "\uB300\uAD6D \uC2DC\uC791",
    refreshLobby: "\uCD5C\uC2E0 \uC815\uBCF4 \uAC31\uC2E0",
    lobbyNavigation: "\uB85C\uBE44 \uBA54\uB274",
    rankings: "\uB7AD\uD0B9",
    playTab: "\uB300\uAD6D",
    playerInfo: "\uB0B4 \uC815\uBCF4",
    lobbyRankRecord: "\uD604\uAE09\uC218 {record}",
    profileRating: "\uB808\uC774\uD305",
    profileRatingValue: "{rating}\uC810",
    profileRatingStanding: "\uB204\uC801 \uB7AD\uD0B9",
    profileRatingStandingValue: "{position}\uC704 / {players}\uBA85",
    profileRatingStandingPending: "\uCCAB \uB808\uC774\uD305 \uB300\uAD6D \uD6C4 \uC9D1\uACC4",
    overallRecord: "\uC804\uCCB4 \uC804\uC801",
    winRate: "\uC2B9\uB960",
    currentRankRecord: "\uD604\uC7AC \uAE09\uC218 \uC804\uC801",
    profileWinRate: "\uC2B9\uB960 {rate}",
    profileRankings: "\uB7AD\uD0B9 \uBCF4\uAE30",
    confirmProfile: "\uD655\uC778",
    profileLoading: "\uC804\uC801\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
    profileUnavailable: "\uC804\uC801\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.",
    profileOffline: "\uC628\uB77C\uC778\uC5D0 \uC5F0\uACB0\uD558\uBA74 \uC804\uC801\uC744 \uBCFC \uC218 \uC788\uC5B4\uC694.",
    opponentProfileLoading: "\uC0C1\uB300 \uC804\uC801\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
    opponentProfileUnavailable: "\uC0C1\uB300 \uC804\uC801\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.",
    opponentProfileOffline: "\uC628\uB77C\uC778 \uB300\uAD6D\uC5D0\uC11C \uC0C1\uB300 \uC804\uC801\uC744 \uBCFC \uC218 \uC788\uC5B4\uC694.",
    promotionPoints: "\uC2B9\uAC15\uAE09 \uD3EC\uC778\uD2B8",
    demotion: "\uAC15\uAE09",
    promotion: "\uC2B9\uAE09",
    lowestRank: "\uCD5C\uC800 \uAE09\uC218",
    highestRank: "\uCD5C\uACE0 \uB2E8\uC218",
    promotionMeter: "\uD604\uC7AC \uAE09\uC218\uC758 \uAE30\uC900\uC810\uC5D0\uC11C {value}\uC810. {lowLabel} {lowTick}. {highLabel} {highTick}.",
    resultPromotionMeter: "\uD604\uC7AC \uAE09\uC218 \uAE30\uC900\uC810\uC5D0\uC11C \uC774\uC804 {previous}\uC810, \uD604\uC7AC {value}\uC810. {lowLabel} {lowTick}. {highLabel} {highTick}.",
    resultMeterPrevious: "\uC774\uC804",
    resultMeterCurrent: "\uD604\uC7AC",
    shop: "\uC0C1\uC810",
    shopCurrency: "\uCF54\uC778",
    shopRemoveAdsTitle: "\uAD11\uACE0 \uC81C\uAC70",
    shopRemoveAdsOnce: "1\uD68C \uAD6C\uB9E4",
    shopRemoveAdsDescription: "\uAD11\uACE0 \uC5C6\uC774 \uB354 \uCF8C\uC801\uD558\uAC8C",
    shopRemoveAdsBuy: "\uAD6C\uB9E4 \xB7 {price}",
    shopRemoveAdsActivated: "\uAD11\uACE0 \uC81C\uAC70\uAC00 \uC801\uC6A9\uB410\uC5B4\uC694.",
    shopRemoveAdsPending: "\uACB0\uC81C\uAC00 \uD655\uC778\uB418\uBA74 \uAD11\uACE0 \uC81C\uAC70\uAC00 \uC801\uC6A9\uB3FC\uC694.",
    shopRemoveAdsFailed: "\uAD6C\uB9E4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098 \uAD6C\uB9E4\uB97C \uBCF5\uC6D0\uD574 \uC8FC\uC138\uC694.",
    shopCoinPacks: "\uCF54\uC778 \uCDA9\uC804",
    rewardAdTitle: "\uBB34\uB8CC 20\uCF54\uC778",
    rewardAdGuide: "\uAD11\uACE0 \uC2DC\uCCAD \xB7 \uD558\uB8E8 \uCD5C\uB300 3\uD68C. \uD55C\uAD6D \uC2DC\uAC04 \uC790\uC815\uC5D0 \uCD08\uAE30\uD654\uB3FC\uC694.",
    rewardAdRemaining: "\uC624\uB298 \uB0A8\uC740 \uD69F\uC218 {n} / {max}\uD68C",
    rewardAdWatch: "\uAD11\uACE0 \uBCF4\uAE30",
    rewardAdWatching: "\uCC98\uB9AC \uC911\u2026",
    rewardAdChecking: "\uB0A8\uC740 \uD69F\uC218 \uD655\uC778 \uC911\u2026",
    rewardAdRetry: "\uBCF4\uC0C1 \uC218\uB839",
    rewardAdDone: "\uC624\uB298 \uC218\uB839 \uC644\uB8CC",
    rewardAdLimit: "\uC624\uB298 \uAD11\uACE0 \uBCF4\uC0C1 3\uD68C\uB97C \uBAA8\uB450 \uBC1B\uC558\uC5B4\uC694. \uD55C\uAD6D \uC2DC\uAC04 \uC790\uC815 \uC774\uD6C4 \uB2E4\uC2DC \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.",
    rewardAdBusy: "\uC774 \uACC4\uC815\uC5D0\uC11C \uAD11\uACE0 \uBCF4\uC0C1\uC744 \uC9C4\uD589 \uC911\uC774\uC5D0\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    rewardAdExpired: "\uAD11\uACE0 \uBCF4\uC0C1 \uC2DC\uAC04\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    rewardAdFailed: "\uAD11\uACE0 \uBCF4\uC0C1\uC744 \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    rewardAdRetryMessage: "\uBCF4\uC0C1\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC5B4\uC694. \uBCF4\uC0C1 \uC218\uB839\uC744 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694. \uC644\uB8CC\uD55C \uAD11\uACE0\uB294 \uB2E4\uC2DC \uBCF4\uC9C0 \uC54A\uC544\uB3C4 \uB3FC\uC694.",
    shopCoinPacksGuide: "\uBCF4\uC720 \uCF54\uC778\uC73C\uB85C \uC2A4\uD0A8\uACFC \uCC29\uC218 \uC5F0\uCD9C\uC744 \uAD6C\uB9E4\uD560 \uC218 \uC788\uC5B4\uC694.",
    shopCoinPacksUnavailable: "\uC774 \uAE30\uAE30\uC5D0\uC11C\uB294 \uCF54\uC778 \uC0C1\uD488\uC744 \uAD6C\uB9E4\uD560 \uC218 \uC5C6\uC5B4\uC694.",
    shopCoinPackPrice: "{n}\uCF54\uC778 \xB7 {price}",
    shopTestCoinClaim: "\uD14C\uC2A4\uD2B8 \uCF54\uC778 50\uAC1C \uBC1B\uAE30",
    shopTestCoinDone: "\uD14C\uC2A4\uD2B8 \uCF54\uC778\uC744 \uACC4\uC815 \uC9C0\uAC11\uC5D0 \uC801\uB9BD\uD588\uC5B4\uC694.",
    shopTestCoinFailed: "\uD14C\uC2A4\uD2B8 \uCF54\uC778\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    optionsPlayerId: "\uC720\uC800 ID",
    optionsPlayerIdCopy: "\uBCF5\uC0AC",
    optionsPlayerIdCopyLabel: "\uC720\uC800 ID \uBCF5\uC0AC",
    optionsPlayerIdCopied: "\uC720\uC800 ID\uB97C \uBCF5\uC0AC\uD588\uC5B4\uC694.",
    optionsPlayerIdCopyManually: "\uC120\uD0DD\uB41C \uC720\uC800 ID\uB97C \uC9C1\uC811 \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.",
    shopCoinPurchaseDone: "\uAD6C\uB9E4\uD55C \uCF54\uC778\uC744 \uACC4\uC815 \uC9C0\uAC11\uC5D0 \uBC18\uC601\uD588\uC5B4\uC694.",
    shopCoinPurchasePending: "\uACB0\uC81C\uB97C \uD655\uC778 \uC911\uC774\uC5D0\uC694. \uD655\uC778\uB418\uBA74 \uCF54\uC778\uC774 \uC801\uB9BD\uB3FC\uC694.",
    shopCoinPurchaseFailed: "\uCF54\uC778 \uAD6C\uB9E4\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    shopCoinRefundDebt: "\uD658\uBD88 \uCC28\uAC10\uBD84 {n}\uCF54\uC778\uC740 \uB2E4\uC74C \uC801\uB9BD\uC5D0\uC11C \uCC28\uAC10\uB3FC\uC694.",
    purchaseRestore: "\uAD6C\uB9E4 \uBCF5\uC6D0",
    purchaseRestored: "\uAD11\uACE0 \uC81C\uAC70\uB97C \uBCF5\uC6D0\uD588\uC5B4\uC694.",
    purchaseRestoreEmpty: "\uBCF5\uC6D0\uD560 \uAD11\uACE0 \uC81C\uAC70 \uAD6C\uB9E4 \uB0B4\uC5ED\uC774 \uC5C6\uC5B4\uC694.",
    purchaseRestoreFailed: "\uAD6C\uB9E4\uB97C \uBCF5\uC6D0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    shopSkins: "\uC2A4\uD0A8",
    shopPreviousSkins: "\uC774\uC804 \uC2A4\uD0A8",
    shopNextSkins: "\uB354 \uB9CE\uC740 \uC2A4\uD0A8",
    shopBalance: "\uBCF4\uC720",
    lobbyCoins: "\uBCF4\uC720 \uCF54\uC778",
    dailyMissions: "\uC77C\uC77C \uBBF8\uC158",
    missionGuide: "\uB9E4\uC77C 00:00 \uCD08\uAE30\uD654 (\uD55C\uAD6D \uC2DC\uAC04)",
    missionEligibility: "\uC2B9\uD328\uC640 \uAD00\uACC4\uC5C6\uC774 \uC9D1\uACC4\uD574\uC694. \uCC29\uC218 \uC5C6\uB294 \uB300\uAD6D\uACFC 6\uC218 \uC804\uC5D0 \uAE30\uAD8C\xB7\uC811\uC18D \uC885\uB8CC\xB7\uC2DC\uAC04 \uCD08\uACFC\uB85C \uB05D\uB09C \uB300\uAD6D\uC740 \uC81C\uC678\uB3FC\uC694.",
    missionFirstGoal: "\uB300\uAD6D {n}\uD310",
    missionGoal: "\uB300\uAD6D {n}\uD310",
    missionRepeatGoal: "\uBC18\uBCF5 \uBBF8\uC158",
    missionRepeatProgress: "\uC624\uB298 \uC218\uB839 {count}/{target}",
    missionRepeatNote: "{after}\uD310 \uC774\uD6C4 \uB9E4 \uD310 {coins}\uCF54\uC778 \xB7 \uD558\uB8E8 \uCD5C\uB300 {n}\uD68C",
    missionProgress: "{count}/{target}\uD310",
    missionTrackCount: "{count} / {target}",
    missionOverview: "\uC624\uB298\uC758 \uBBF8\uC158",
    missionOverviewCount: "{count} / {target}",
    missionClaim: "\uC218\uB839",
    missionClaimed: "\uC218\uB839 \uC644\uB8CC",
    missionInProgress: "\uC9C4\uD589 \uC911",
    missionClaimSuccess: "\uCF54\uC778\uC744 \uBC1B\uC558\uC5B4\uC694.",
    coinRewardTitle: "\uBCF4\uC0C1 \uD68D\uB4DD",
    coinRewardCoins: "+{n} \uCF54\uC778",
    missionClaimFailed: "\uBCF4\uC0C1\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    missionMilestoneTotal: "/ {target} \uC644\uB8CC",
    missionView: "\uBCF4\uAE30",
    shopGoldenPlacement: "\uAE08\uBE5B \uCC29\uC218",
    shopPlacementStyle: "\uCC29\uC218 \uC5F0\uCD9C",
    shopEffectsTab: "\uCC29\uC218 \uC5F0\uCD9C",
    shopPlainPlacement: "\uAE30\uBCF8 \uCC29\uC218",
    shopSakuraPlacement: "\uBC9A\uAF43 \uCC29\uC218",
    shopRipplePlacement: "\uD478\uB978 \uBB3C\uACB0",
    shopMysticPlacement: "\uC2E0\uBE44\uD55C \uAE30\uC6B4",
    shopPlacementGuide: "\uB3CC\uC744 \uB193\uC744 \uB54C \uB450 \uC0AC\uB78C\uC5D0\uAC8C \uBCF4\uC774\uB294 \uD6A8\uACFC\uC608\uC694.",
    shopGoldenPlacementGuide: "\uAE08\uBE5B \uD30C\uB3D9\uC774 \uBC88\uB729\uC5EC\uC694. 24\uC2DC\uAC04 \uC774\uC6A9\uAD8C\uC774\uC5D0\uC694.",
    shopSakuraPlacementGuide: "\uBC9A\uAF43\uC78E\uC774 \uD769\uC5B4\uC838\uC694. 24\uC2DC\uAC04 \uC774\uC6A9\uAD8C\uC774\uC5D0\uC694.",
    shopRipplePlacementGuide: "\uB3CC \uBC11\uC5D0\uC11C \uD478\uB978 \uD30C\uBB38\uACFC \uBB3C\uBC29\uC6B8\uC774 \uD37C\uC838\uC694. \uAD6C\uB9E4\uD558\uBA74 24\uC2DC\uAC04 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.",
    shopMysticPlacementGuide: "\uBCF4\uB78F\uBE5B \uAE30\uB958\uC640 \uBE5B \uC785\uC790\uAC00 \uD53C\uC5B4\uC62C\uB77C\uC694. \uAD6C\uB9E4\uD558\uBA74 24\uC2DC\uAC04 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.",
    shopPlainPlacementGuide: "\uB3CC\uC774 \uD310 \uC704\uC5D0 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB0B4\uB824\uC549\uC544\uC694.",
    shopEffectFree: "\uBB34\uB8CC",
    shopEffectApplied: "\uCC29\uC218 \uC5F0\uCD9C\uC744 \uC801\uC6A9\uD588\uC5B4\uC694.",
    shopEffectMinutesLeft: "{m}\uBD84 \uB0A8\uC74C",
    shopEffectHoursLeft: "{h}\uC2DC\uAC04 {m}\uBD84 \uB0A8\uC74C",
    shopBuyEffect: "\uD65C\uC131\uD654 \xB7 {n} \uCF54\uC778",
    shopExtendEffect: "24\uC2DC\uAC04 \uC5F0\uC7A5 \xB7 {n} \uCF54\uC778",
    shopEffectPurchased: "\uAE08\uBE5B \uCC29\uC218\uB97C \uC801\uC6A9\uD588\uC5B4\uC694.",
    shopSakuraPurchased: "\uBC9A\uAF43 \uCC29\uC218\uB97C \uC801\uC6A9\uD558\uACE0 \uC774\uC6A9 \uC2DC\uAC04\uC744 24\uC2DC\uAC04 \uCD94\uAC00\uD588\uC5B4\uC694.",
    shopRipplePurchased: "\uD478\uB978 \uBB3C\uACB0\uC744 \uC801\uC6A9\uD558\uACE0 \uC774\uC6A9 \uC2DC\uAC04\uC744 24\uC2DC\uAC04 \uCD94\uAC00\uD588\uC5B4\uC694.",
    shopMysticPurchased: "\uC2E0\uBE44\uD55C \uAE30\uC6B4\uC744 \uC801\uC6A9\uD558\uACE0 \uC774\uC6A9 \uC2DC\uAC04\uC744 24\uC2DC\uAC04 \uCD94\uAC00\uD588\uC5B4\uC694.",
    adPrivacy: "\uAD11\uACE0 \uAC1C\uC778\uC815\uBCF4 \uC124\uC815",
    shopPreviewGuide: "\uC2A4\uD0A8\uC744 \uACE8\uB77C \uBBF8\uB9AC \uBCF4\uC138\uC694.",
    shopLockedPreview: "\uAD6C\uB9E4\uD55C \uB4A4 \uC801\uC6A9\uD574 \uC8FC\uC138\uC694.",
    shopNotEnough: "\uCF54\uC778\uC774 \uBD80\uC871\uD574\uC694.",
    shopApplied: "\uD604\uC7AC \uC801\uC6A9 \uC911",
    shopSelected: "\uD604\uC7AC \uC120\uD0DD \uC911",
    shopSelectedLocked: "\uC120\uD0DD \uC911 \xB7 \uC7A0\uAE08",
    shopOwned: "\uBCF4\uC720",
    shopLocked: "\uC7A0\uAE08",
    shopPrice: "{n} \uCF54\uC778",
    shopApply: "\uC801\uC6A9",
    shopBuyPrice: "\uAD6C\uB9E4 \xB7 {n} \uCF54\uC778",
    shopPurchaseComplete: "\uAD6C\uB9E4 \uC644\uB8CC",
    shopPurchased: "{items} \uC2A4\uD0A8\uC744 \uAD6C\uB9E4\uD588\uC5B4\uC694. \uC801\uC6A9\uC744 \uB204\uB974\uBA74 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.",
    shopAppliedTemporarily: "\uC774\uBC88 \uC2E4\uD589\uC5D0\uB9CC \uC801\uC6A9\uD588\uC5B4\uC694.",
    shopSaveFailed: "\uAD6C\uB9E4\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uCF54\uC778\uC740 \uCC28\uAC10\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.",
    shopClose: "\uB2EB\uAE30",
    nickname: "\uB2C9\uB124\uC784",
    editNickname: "\uB2C9\uB124\uC784 \uD3B8\uC9D1",
    guestNickname: "\uAC8C\uC2A4\uD2B8",
    rankKyu: "{n}\uAE09",
    rankDan: "{n}\uB2E8",
    stoneStyle: "\uC7A5\uAE30\uB9D0 \uC2A4\uD0C0\uC77C",
    boardStyle: "\uC7A5\uAE30\uD310 \uBC30\uACBD",
    appearancePreview: "\uBBF8\uB9AC\uBCF4\uAE30",
    gridStyle: "\uACA9\uC790\uC120",
    stoneSound: "\uCC29\uC218\uC74C",
    vibration: "\uC9C4\uB3D9",
    engravedGrid: "\uC9C4\uD55C \uC74C\uAC01",
    softGrid: "\uC605\uC740 \uC74C\uAC01",
    referenceStones: "\uB9DE\uC9F1",
    referenceBoard: "\uD669\uAE08\uBE5B \uB098\uBB34",
    gildedStones: "\uC564\uD2F1 \uB3CC",
    gildedBoard: "\uAE08\uD14C \uC6D4\uB11B",
    vintageStones: "\uBE48\uD2F0\uC9C0 \uB3CC",
    vintageBoard: "\uBE48\uD2F0\uC9C0 \uB098\uBB34",
    porcelainSkin: "\uBC31\uC790\uC640 \uBA39",
    jadeSkin: "\uBE44\uCDE8\uC640 \uC625",
    lacquerSkin: "\uC63B\uCE60\uACFC \uC790\uAC1C",
    oceanSkin: "\uBC24\uBC14\uB2E4",
    sodaSkin: "\uC18C\uB2E4 \uAE00\uB77C\uC2A4",
    quartzSkin: "\uC11D\uC601",
    marbleSkin: "\uB300\uB9AC\uC11D",
    sapphireSkin: "\uCCAD\uC625",
    sakuraSkin: "\uBC9A\uAF43",
    auroraSkin: "\uC624\uB85C\uB77C",
    classicStyle: "\uD074\uB798\uC2DD",
    glossyStones: "\uAD11\uD0DD \uB3CC",
    woodBoard: "\uB098\uBB34 \uBB34\uB2AC",
    records: "\uAE30\uBCF4 \uBCF4\uAE30",
    friends: "\uCE5C\uAD6C",
    comingSoon: "\uC900\uBE44 \uC911",
    careerRecord: "{wins}\uC2B9 \xB7 {draws}\uBB34 \xB7 {losses}\uD328",
    rankRating: "{rank} \xB7 {rating}\uC810",
    nextRank: "{rank}\uAE4C\uC9C0 {points}\uC810",
    rankUp: "{rank} \uC2B9\uAE09",
    rankCelebration: "{rank} \uC2B9\uAE09!",
    rankCelebrationIntro: "\uAE09\uC218 \uC2B9\uAE09!",
    rankCelebrationDismiss: "\uD654\uBA74\uC744 \uB20C\uB7EC \uB2EB\uAE30",
    rankDown: "{rank} \uAC15\uAE09",
    noRecords: "\uB300\uAD6D\uC744 \uB9C8\uCE58\uBA74 \uC5EC\uAE30\uC5D0 \uAE30\uBCF4\uAC00 \uC800\uC7A5\uB3FC\uC694.",
    backToRecords: "\uAE30\uBCF4 \uBAA9\uB85D",
    matching: "\uC0C1\uB300\uB97C \uCC3E\uACE0 \uC788\uC5B4\uC694",
    matchIntroTitle: "\uB300\uAD6D \uC2DC\uC791",
    matchIntroRating: "\uB808\uC774\uD305 {rating}\uC810",
    matchIntroEstimate: "\uC608\uC0C1 \uB808\uC774\uD305 \uBCC0\uB3D9",
    matchIntroWin: "\uC2B9\uB9AC \uC2DC {points}\uC810",
    matchIntroLoss: "\uD328\uBC30 \uC2DC {points}\uC810",
    findingOpponent: "\uB300\uAE30 \uC911\uC778 \uC0C1\uB300\uB97C \uD655\uC778\uD558\uB294 \uC911\u2026",
    cancel: "\uCDE8\uC18C",
    canceling: "\uB9E4\uCE6D\uC744 \uCDE8\uC18C\uD558\uB294 \uC911\u2026",
    queueExpired: "\uB9E4\uCE6D \uB300\uAE30\uAC00 \uB05D\uB0AC\uC5B4\uC694. \uB300\uAD6D \uC2E0\uCCAD\uC744 \uB20C\uB7EC \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    onlineMatch: "\uC628\uB77C\uC778 \uB300\uAD6D",
    casualMatch: "\uC77C\uBC18 \uB300\uAD6D",
    nextMatch: "\uB2E4\uC74C \uB300\uAD6D",
    spectate: "\uAD00\uC804",
    leaveSpectating: "\uB85C\uBE44\uB85C",
    watchTurn: "{color} \uCC28\uB840",
    watchReplay: "\uBCF5\uAE30 \xB7 {n}\uC218",
    watchLatestMove: "\uCD5C\uC2E0 \uC218\uB85C",
    watchWinner: "{color} \uC2B9\uB9AC",
    watchEnded: "\uB300\uAD6D\uC774 \uC885\uB8CC\uB410\uC5B4\uC694.",
    opponent: "\uC0C1\uB300",
    movesCount: "{n}\uC218",
    authFailed: "\uC0AC\uC6A9\uC790 ID\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    forbidden: "\uB300\uAD6D\uC5D0 \uCC38\uAC00\uD55C \uC0AC\uB78C\uB9CC \uC5F4 \uC218 \uC788\uC5B4\uC694.",
    weeklyTournament: "\uC8FC\uAC04 \uB300\uD68C",
    currentTournament: "\uD604\uC7AC \uB300\uD68C",
    currentTournamentRecord: "\uD604\uC7AC \uB300\uD68C \uC804\uC801",
    previousTournament: "\uC9C0\uB09C\uC8FC \uB300\uD68C",
    previousTournamentRecord: "\uC9C0\uB09C\uC8FC \uB300\uD68C \uC804\uC801",
    tournamentSummary: "\uC21C\uC704 \xB7 \uCC38\uAC00",
    championshipName: "{month} {week}\uC8FC\uCC28 \uB9DE\uC9F1 \uC7A5\uAE30 \uCC54\uD53C\uC5B8\uC2ED",
    championshipEndsDays: "{days}\uC77C {hours}\uC2DC\uAC04 \uD6C4 \uC885\uB8CC",
    championshipEndsHours: "{hours}\uC2DC\uAC04 {minutes}\uBD84 \uD6C4 \uC885\uB8CC",
    championshipEndsMinutes: "{minutes}\uBD84 \uD6C4 \uC885\uB8CC",
    noStandings: "\uC544\uC9C1 \uC21C\uC704\uC5D0 \uBC18\uC601\uB41C \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694. \uC8FC\uAC04 \uB300\uD68C \uB300\uAD6D\uC744 \uB9C8\uCE58\uBA74 \uC21C\uC704\uC5D0 \uD45C\uC2DC\uB3FC\uC694.",
    ratingRankings: "\uB204\uC801 \uB7AD\uD0B9",
    noPreviousStandings: "\uC9C0\uB09C\uC8FC \uB300\uD68C \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694.",
    tournamentFinalizing: "\uC21C\uC704 \uC9D1\uACC4 \uC911",
    tournamentFinalized: "\uCD5C\uC885 \uC21C\uC704",
    tournamentStandings: "\uB300\uD68C \uB7AD\uD0B9",
    participationReward: "\uCC38\uAC00 \uBCF4\uC0C1",
    rankingReward: "\uC21C\uC704 \uBCF4\uC0C1",
    participationRewardProgress: "\uC720\uD6A8 \uB300\uAD6D {target}\uD310 ({count}/{target})",
    rankingRewardPlace: "\uBCF4\uC0C1 \uC21C\uC704 {rank}\uC704",
    weeklyRewardClaim: "\uC218\uB839\uD558\uAE30",
    weeklyRewardClaimed: "\uC218\uB839 \uC644\uB8CC",
    weeklyRewardClaimLabel: "{reward} {coins}\uCF54\uC778 {action}",
    rewardAvailableLabel: "{label} \xB7 \uBC1B\uC744 \uBCF4\uC0C1 \uC788\uC74C",
    weeklyRewardUnavailable: "\uC9C0\uAE08 \uBC1B\uC744 \uC218 \uC788\uB294 \uB300\uD68C \uBCF4\uC0C1\uC774 \uC544\uB2C8\uC5D0\uC694.",
    rankingPosition: "\uC21C\uC704 {rank}\uC704",
    rankingPositionEmpty: "\uC21C\uC704 -",
    rankingScoreEmpty: "\uC810\uC218 -",
    rankingPlayerCount: "\uCD1D {count}\uBA85",
    tournamentRuleFixed: "\uC8FC\uAC04\uB300\uD68C \uB80C\uC8FC\uB8F0 \uACE0\uC815",
    tournamentLimit: "\uC624\uB298 \uC0AC\uC6A9\uD560 \uC218 \uC788\uB294 \uB3C4\uC804\uAD8C\uC774 \uC5C6\uC5B4\uC694. \uBB34\uB8CC \uB3C4\uC804\uC740 \uD55C\uAD6D \uC2DC\uAC04 \uC790\uC815\uC5D0 \uCD08\uAE30\uD654\uB3FC\uC694.",
    tournamentCatchUp: "\uC774\uBC88 \uC8FC \uB193\uCE5C \uB3C4\uC804 {n}\uD310\uC744 \uBCF4\uCDA9\uD560 \uC218 \uC788\uC5B4\uC694.",
    tournamentCatchUpFunds: "\uC774\uBC88 \uC8FC \uBCF4\uCDA9 {n}\uD310\uC774 \uB0A8\uC558\uC5B4\uC694. \uCF54\uC778\uC774 \uBD80\uC871\uD574\uC694.",
    joinTournamentCatchUp: "\uCD94\uAC00 \uB3C4\uC804",
    joinTournamentCatchUpCost: "\uCD94\uAC00 \uB3C4\uC804 {n}\uCF54\uC778",
    tournamentMissedAttempts: "\uC774\uBC88 \uC8FC \uB193\uCE5C \uB3C4\uC804 \uAE30\uD68C",
    tournamentMissedCount: "{n}\uD310",
    confirmTournamentCatchUp: "\uB193\uCE5C \uB3C4\uC804 1\uD310\uC744 \uBCF4\uCDA9\uD560\uAE4C\uC694? \uCF54\uC778\uC740 \uB300\uAD6D\uC774 \uC131\uB9BD\uD560 \uB54C \uCC28\uAC10\uB3FC\uC694.",
    tournamentPriceChanged: "\uBCF4\uCDA9 \uAC00\uACA9\uC774 \uBC14\uB00C\uC5C8\uC5B4\uC694. \uC0C8 \uAC00\uACA9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    coinNotEnough: "\uC0AC\uC6A9\uD560 \uC218 \uC788\uB294 \uCF54\uC778\uC774 \uBD80\uC871\uD574\uC694.",
    coinShortageTitle: "\uCF54\uC778 \uBD80\uC871",
    coinShortageMessage: "\uCF54\uC778\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uCF54\uC778\uC744 \uAD6C\uB9E4\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
    coinShortageYes: "\uC608",
    coinShortageNo: "\uC544\uB2C8\uC694",
    missionUnavailable: "\uC9C0\uAE08 \uBC1B\uC744 \uC218 \uC788\uB294 \uBCF4\uC0C1\uC774 \uC544\uB2C8\uC5D0\uC694. \uBBF8\uC158 \uC9C4\uD589\uB3C4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    tournamentClosed: "\uC8FC\uAC04 \uB300\uD68C\uAC00 \uB9C8\uAC10\uB410\uC5B4\uC694.",
    noRatingStandings: "\uC544\uC9C1 \uB808\uC774\uD305 \uB300\uAD6D \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694.",
    rankingsUnavailable: "\uB7AD\uD0B9\uC740 \uC628\uB77C\uC778\uC5D0\uC11C \uBCFC \uC218 \uC788\uC5B4\uC694.",
    rankingsLoading: "\uB7AD\uD0B9\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
    rankingsLoadFailed: "\uB7AD\uD0B9\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.",
    rankingRetry: "\uB2E4\uC2DC \uC2DC\uB3C4",
    rankingPrevious: "\uC774\uC804",
    rankingNext: "\uB2E4\uC74C",
    rankingPage: "{page}\uD398\uC774\uC9C0",
    rankingPageOf: "{page} / {pages}",
    joinTournament: "\uB300\uD68C \uCC38\uAC00",
    joinTournamentExhausted: "\uB3C4\uC804 \uD69F\uC218 \uC18C\uC9C4",
    joinTournamentAttempts: "\uB300\uD68C \uCC38\uAC00 ({remaining}/{limit})",
    tournamentWaiting: "\uC8FC\uAC04 \uB300\uD68C \uC0C1\uB300\uB97C \uCC3E\uB294 \uC911\u2026",
    playerAlias: "\uD50C\uB808\uC774\uC5B4 #{alias}",
    deviceRecord: "\uC774 \uAE30\uAE30 \uAE30\uBCF4",
    pointsCount: "{n}\uC810",
    options: "\uC635\uC158",
    language: "\uC5B8\uC5B4 \xB7 Language",
    sendFeedback: "\uD53C\uB4DC\uBC31 \uBCF4\uB0B4\uAE30",
    room: "\uB300\uAD6D",
    leave: "\uB098\uAC00\uAE30",
    waiting: "\uCE5C\uAD6C\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911",
    reconnecting: "\uB2E4\uC2DC \uC5F0\uACB0\uD558\uB294 \uC911\u2026",
    yourTurn: "\uB0B4 \uCC28\uB840",
    theirTurn: "\uC0C1\uB300 \uCC28\uB840",
    turnActive: "\uCC28\uB840",
    turnWaiting: "\uB300\uAE30",
    won: "\uB0B4\uAC00 \uC774\uACBC\uC5B4\uC694!",
    lost: "\uC0C1\uB300\uAC00 \uC774\uACBC\uC5B4\uC694",
    draw: "\uBB34\uC2B9\uBD80",
    round: "{n}\uBC88\uC9F8 \uD310",
    black: "\uCD08 \uAE30\uBB3C",
    white: "\uD55C \uAE30\uBB3C",
    you: "\uB098",
    result: "\uB300\uAD6D \uACB0\uACFC",
    victoryMedal: "\uC2B9\uB9AC!",
    defeatMedal: "\uD328\uBC30",
    drawMedal: "\uBB34\uC2B9\uBD80",
    winBadge: "\uC2B9",
    lossBadge: "\uD328",
    drawBadge: "\uBB34",
    resultWinner: "{n}\uC218 \uB9CC\uC5D0 {color}\uC774 \uC774\uACBC\uC5B4\uC694.",
    review: "\uBCF5\uAE30",
    recordView: "\uAE30\uBCF4 \uBCF4\uAE30",
    moveNumbers: "\uC218\uC21C \uD45C\uAE30",
    moveNumbersShort: "\uC218\uC21C",
    placementTimingTest: "\uCC29\uC218 \uD0C0\uC774\uBC0D \xB7 \uD14C\uC2A4\uD2B8",
    placementTimingValue: "\uCC29\uC218 {duration}ms \xB7 \uC811\uCD09 {contact}ms",
    placementTimingHelp: "\uB193\uC73C\uBA74 \uD604\uC7AC \uC218\uB97C \uC7AC\uC0DD\uD574\uC694. \uAE30\uBCF4\uC5D0\uC11C\uB9CC \uC801\uC6A9\uB3FC\uC694.",
    moveNumber: "{n}\uC218",
    recordShare: "\uAE30\uBCF4 \uACF5\uC720",
    recordShareAction: "\uACF5\uC720\uD558\uAE30",
    recordSendLink: "\uB9C1\uD06C \uACF5\uC720\uD558\uAE30",
    recordShareMessage: "\uB9DE\uC9F1 \uC7A5\uAE30 \uAE30\uBCF4\uB97C \uD655\uC778\uD574 \uBCF4\uC138\uC694.",
    recordPlay: "\uC7A5\uAE30 \uB450\uB7EC \uAC00\uAE30",
    recordPublic: "\uACF5\uAC1C",
    recordPrivate: "\uBE44\uACF5\uAC1C",
    recordPublicLink: "\uACF5\uAC1C \uB9C1\uD06C",
    recordVisibilitySettings: "\uAE30\uBCF4 \uACF5\uAC1C \uC124\uC815",
    recordMakePublic: "\uACF5\uAC1C\uD558\uACE0 \uB9C1\uD06C \uB9CC\uB4E4\uAE30",
    recordMakePrivate: "\uBE44\uACF5\uAC1C\uB85C \uBC14\uAFB8\uAE30",
    recordCopyLink: "\uB9C1\uD06C \uBCF5\uC0AC",
    recordLinkCopied: "\uAE30\uBCF4 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC5B4\uC694.",
    recordCopyManually: "\uB9C1\uD06C\uB97C \uC120\uD0DD\uD588\uC5B4\uC694. \uBCF5\uC0AC\uD574\uC11C \uACF5\uC720\uD574 \uC8FC\uC138\uC694.",
    recordShareLoading: "\uACF5\uAC1C \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC5B4\uC694\u2026",
    recordSharePreparing: "\uAE30\uBCF4 \uB9C1\uD06C\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694\u2026",
    recordShareSaving: "\uACF5\uAC1C \uC0C1\uD0DC\uB97C \uBC14\uAFB8\uACE0 \uC788\uC5B4\uC694\u2026",
    recordShareFailed: "\uACF5\uAC1C \uC0C1\uD0DC\uB97C \uBC14\uAFB8\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    recordMadePrivate: "\uB0B4\uAC00 \uB9CC\uB4E0 \uC774\uC804 \uB9C1\uD06C\uAC00 \uB2EB\uD614\uC5B4\uC694.",
    recordSharedUnavailable: "\uBE44\uACF5\uAC1C\uB85C \uBC14\uB00C\uC5C8\uAC70\uB098 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uAE30\uBCF4 \uB9C1\uD06C\uC608\uC694.",
    recordList: "\uAE30\uBCF4 \uBAA9\uB85D",
    tournamentRecords: "\uB300\uD68C \uAE30\uBCF4",
    noTournamentRecords: "\uC8FC\uAC04 \uB300\uD68C \uB300\uAD6D\uC744 \uB9C8\uCE58\uBA74 \uC5EC\uAE30\uC5D0 \uAE30\uBCF4\uAC00 \uC800\uC7A5\uB3FC\uC694.",
    recordPasses: "\uD55C \uC218 \uC27C: \uCD08 \uAE30\uBB3C {black}\uD68C \xB7 \uD55C \uAE30\uBB3C {white}\uD68C",
    recordFilters: "\uAE30\uBCF4 \uD544\uD130",
    recordAll: "\uC804\uCCB4",
    recordFavorite: "\uC774 \uAE30\uBCF4 \uC990\uACA8\uCC3E\uAE30",
    recordFavorites: "\uC990\uACA8\uCC3E\uAE30",
    recordWins: "\uC2B9\uB9AC",
    recordNoFavorites: "\uBCC4\uD45C\uB97C \uB204\uB978 \uAE30\uBCF4\uAC00 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB3FC\uC694.",
    recordNoWins: "\uC774\uAE34 \uB300\uAD6D\uC758 \uAE30\uBCF4\uAC00 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB3FC\uC694.",
    recordVersus: "vs {name}",
    reviewBack: "\uB4A4\uB85C",
    recordGuest: "\uAC8C\uC2A4\uD2B8 #{code}",
    recordWin: "{color} \uC2B9\uB9AC",
    recordTimeWin: "{color} \uC2DC\uAC04\uC2B9",
    recordResignWin: "{color} \uAE30\uAD8C\uC2B9",
    recordDisconnectWin: "{color} \uC2B9\uB9AC \xB7 \uC0C1\uB300 \uC811\uC18D \uB04A\uAE40",
    recordUnknownWin: "{color} \uC2B9\uB9AC \xB7 \uC885\uB8CC \uC0AC\uC720 \uBBF8\uAE30\uB85D",
    recordPersonalWin: "\uC2B9\uB9AC",
    recordPersonalLoss: "\uD328\uBC30",
    recordPersonalTimeWin: "\uC2DC\uAC04\uC2B9",
    recordPersonalTimeLoss: "\uC2DC\uAC04\uD328",
    recordPersonalResignWin: "\uAE30\uAD8C\uC2B9",
    recordPersonalResignLoss: "\uAE30\uAD8C\uD328",
    recordPersonalDisconnectWin: "\uC811\uC18D \uB04A\uAE40\uC2B9",
    recordPersonalDisconnectLoss: "\uC811\uC18D \uB04A\uAE40\uD328",
    recordPersonalUnknownWin: "\uC2B9\uB9AC \xB7 \uC885\uB8CC \uC0AC\uC720 \uBBF8\uAE30\uB85D",
    recordPersonalUnknownLoss: "\uD328\uBC30 \xB7 \uC885\uB8CC \uC0AC\uC720 \uBBF8\uAE30\uB85D",
    firstMove: "\uBE48 \uD310\uC73C\uB85C",
    previousMove: "\uC774\uC804 \uC218",
    nextMove: "\uB2E4\uC74C \uC218",
    lastMove: "\uB9C8\uC9C0\uB9C9 \uC218\uB85C",
    board: "\uC624\uBAA9\uD310",
    square: "{cell}, \uBE48 \uC790\uB9AC",
    blackSquare: "{cell}, \uCD08 \uAE30\uBB3C",
    whiteSquare: "{cell}, \uD55C \uAE30\uBB3C",
    invite: "\uCD08\uB300 \uB9C1\uD06C \uBCF5\uC0AC",
    copied: "\uCD08\uB300 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC5B4\uC694.",
    copyManually: "\uCE5C\uAD6C\uC5D0\uAC8C \uBCF4\uB0BC \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD558\uC138\uC694.",
    done: "\uB2EB\uAE30",
    selectStone: "\uB3CC\uC744 \uB193\uC744 \uACF3\uC744 \uACE0\uB974\uC138\uC694",
    placeStone: "\uCC29\uC218",
    placeSelectHint: "\uC704\uCE58 \uC120\uD0DD",
    placeReadyHint: "\uC120\uD0DD \uC644\uB8CC",
    place: "{cell}\uC5D0 \uB3CC \uB193\uAE30",
    rematch: "\uC7AC\uB300\uACB0",
    rematchWaiting: "\uC218\uB77D \uB300\uAE30 \xB7 1/2",
    rematchReady: "\uC7AC\uB300\uACB0 \uC218\uB77D",
    confirmLeave: "\uB098\uAC00\uBA74 \uB450 \uC0AC\uB78C \uBAA8\uB450 \uC774 \uBC29\uC5D0\uC11C \uB098\uAC00\uAC8C \uB429\uB2C8\uB2E4. \uB098\uAC08\uAE4C\uC694?",
    confirmLeaveTitle: "\uB300\uAD6D \uB098\uAC00\uAE30",
    confirmResign: "\uC9C0\uAE08 \uB098\uAC00\uBA74 \uAE30\uAD8C\uC73C\uB85C \uAE30\uB85D\uB3FC\uC694. \uB098\uAC08\uAE4C\uC694?",
    closed: "\uBC29\uC774 \uB2EB\uD614\uC5B4\uC694.",
    notFound: "\uBC29\uC774 \uB2EB\uD614\uAC70\uB098 \uCF54\uB4DC\uAC00 \uD2C0\uB838\uC5B4\uC694.",
    full: "\uC774\uBBF8 \uB450 \uC0AC\uB78C\uC774 \uC785\uC7A5\uD55C \uBC29\uC774\uC5D0\uC694.",
    busy: "\uBAA8\uB4E0 \uBC29\uC774 \uC0AC\uC6A9 \uC911\uC774\uC5D0\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    invalid: "\uC774 \uB3D9\uC791\uC744 \uC644\uB8CC\uD560 \uC218 \uC5C6\uC5B4\uC694.",
    stale: "\uC9C4\uD589 \uC911\uC778 \uD310\uC774 \uBC14\uB00C\uC5C8\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
    wrongTurn: "\uB0B4 \uCC28\uB840\uC5D0 \uB3CC\uC744 \uB193\uC744 \uC218 \uC788\uC5B4\uC694.",
    occupied: "\uC774\uBBF8 \uB3CC\uC774 \uB193\uC778 \uC790\uB9AC\uC608\uC694.",
    network: "\uAC8C\uC784 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694."
  }
};

// nickname.js
function displayNickname(value) {
  return typeof value === "string" ? value.normalize("NFC") : "";
}

// lobby-layout.js
var lobbyReference = {
  width: 1024,
  height: 1536,
  adHeight: 56,
  contentHeight: 1480,
  boxes: {
    header: [36, 96, 952, 80],
    profile: [36, 205, 952, 130],
    board: [165, 417, 692, 457],
    missions: [839, 407, 114, 132],
    championship: [50, 956, 924, 86],
    start: [45, 1090, 934, 155],
    navigation: [36, 1349, 952, 132]
  }
};
var art = {
  pair: ["board/stones_pair", 383, 362, [9, 9, 366, 344]],
  profile: ["panels/profile_panel", 476, 177, [11, 10, 456, 155]],
  avatar: ["panels/avatar_frame", 243, 234, [11, 8, 220, 226]],
  person: ["icons/profile", 210, 234, [8, 9, 194, 217]],
  score: ["panels/score_badge", 310, 126, [11, 9, 289, 106]],
  track: ["panels/progress_track", 439, 179, [10, 105, 417, 62]],
  fill: ["panels/progress_fill", 433, 179, [10, 106, 413, 60]],
  currency: ["panels/currency_capsule", 347, 127, [10, 8, 326, 108]],
  coin: ["icons/coin", 229, 233, [9, 9, 211, 216]],
  round: ["panels/round_button", 231, 228, [11, 10, 209, 216]],
  settings: ["icons/settings", 239, 243, [8, 8, 222, 226]],
  gift: ["icons/gift", 244, 258, [9, 8, 227, 241]],
  notice: ["icons/notification", 188, 192, [8, 8, 172, 176]],
  championship: ["panels/championship_banner", 475, 178, [11, 9, 453, 157]],
  trophy: ["icons/trophy", 326, 211, [8, 9, 310, 193]],
  chevron: ["icons/chevron_right", 145, 214, [8, 9, 129, 197]],
  primary: ["panels/primary_button", 483, 147, [11, 10, 462, 125]],
  navigation: ["panels/bottom_navigation", 477, 139, [11, 8, 456, 119]],
  book: ["icons/book", 260, 197, [9, 9, 242, 180]],
  watch: ["icons/watch", 262, 184, [8, 9, 246, 167]],
  shop: ["icons/shop", 242, 231, [9, 8, 225, 214]],
  shopBag: ["shop/bag-stones", 230, 240, [0, 0, 230, 240]]
};
var ns = "http://www.w3.org/2000/svg";
var svgNode = (tag, attributes) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};
function resource(parent, name, className, panel, clip = false) {
  const [path, width, height, [x, y, w, h]] = art[name];
  const span = document.createElement("span");
  span.className = "lobby-resource " + className;
  span.setAttribute("aria-hidden", "true");
  span.dataset.lobbyAsset = path;
  const image = () => svgNode("image", { href: `./assets/forest-ui/${path}.webp`, width, height, preserveAspectRatio: "none" });
  const root = svgNode("svg", { viewBox: panel ? `0 0 ${panel[0]} ${panel[1]}` : `${x} ${y} ${w} ${h}`, preserveAspectRatio: "none", focusable: "false" });
  Object.assign(root.style, { width: "100%", height: "100%", display: "block", overflow: clip ? "hidden" : "visible" });
  if (panel) {
    const [dw, dh, sourceCap, targetCap] = panel;
    const sx = [x, x + sourceCap, x + w - sourceCap, x + w];
    const sy = [y, y + sourceCap, y + h - sourceCap, y + h];
    const dx = [0, targetCap, dw - targetCap, dw];
    const dy = [0, targetCap, dh - targetCap, dh];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const tile = (source, destination2, index2, fullSize) => {
        const scale = (source[index2 + 1] - source[index2]) / (destination2[index2 + 1] - destination2[index2]);
        const from = index2 ? destination2[index2] - 0.5 : destination2[index2] - source[0] / scale;
        const to = index2 < 2 ? destination2[index2 + 1] + 0.5 : destination2[index2 + 1] + (fullSize - source[3]) / scale;
        return [from, to - from, source[index2] + (from - destination2[index2]) * scale, (to - from) * scale];
      };
      if (dx[col] === dx[col + 1] || dy[row] === dy[row + 1]) continue;
      const [tx, tw, vx, vw] = tile(sx, dx, col, width);
      const [ty, th, vy, vh] = tile(sy, dy, row, height);
      const piece = svgNode("svg", {
        x: tx,
        y: ty,
        width: tw,
        height: th,
        viewBox: `${vx} ${vy} ${vw} ${vh}`,
        preserveAspectRatio: "none",
        overflow: "hidden"
      });
      Object.assign(piece.style, { width: tw + "px", height: th + "px" });
      piece.append(image());
      root.append(piece);
    }
  } else root.append(image());
  span.append(root);
  parent.append(span);
  return span;
}
function titleUnderline(className) {
  const image = document.createElement("img");
  image.className = className;
  image.src = "./assets/forest-ui/branding/title-underline.svg";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  return image;
}
function primaryButtonSurface(button, className, width, height, { sourceCap = 62, capRatio } = {}) {
  const cap = capRatio == null ? Math.floor(height / 2) : height * capRatio;
  return resource(button, "primary", className, [width, height, sourceCap, cap]);
}
function installMeasuredLobby() {
  const el2 = (id) => document.getElementById(id);
  const shell = document.querySelector(".shell");
  const host = document.createElement("div");
  host.id = "lobby-stage-host";
  const stage = document.createElement("div");
  stage.id = "lobby-stage";
  stage.append(document.querySelector(".topbar"), el2("lobby"), el2("lobby-nav"), el2("lobby-error"));
  host.append(stage);
  shell.querySelector("main").append(host);
  new ResizeObserver(([{ contentRect: { width, height } }]) => {
    if (!width || !height) return;
    const { width: referenceWidth, adHeight, boxes: { navigation } } = lobbyReference;
    const minimumHeight = navigation[1] + navigation[3] - adHeight;
    const scale = Math.min(width / referenceWidth, height / minimumHeight);
    stage.style.setProperty("--lobby-scale", scale);
    stage.style.width = referenceWidth + "px";
    stage.style.height = height / scale + "px";
    stage.style.transform = `scale(${scale}) translateX(-50%)`;
    stage.dataset.sized = "true";
  }).observe(host);
  resource(document.querySelector(".mark"), "pair", "logo-stones");
  document.querySelector(".brand").append(titleUnderline("lobby-logo-underline"));
  resource(el2("lobby-wallet"), "currency", "currency-surface", [164, 59, 52, 29]);
  resource(el2("lobby-wallet").querySelector(".shop-coin"), "coin", "currency-coin");
  resource(el2("show-options"), "round", "settings-surface");
  resource(el2("show-options"), "settings", "settings-art");
  resource(el2("player-card"), "profile", "profile-surface", [952, 130, 45, 34]);
  const avatar = el2("player-card").querySelector(".player-avatar");
  resource(avatar, "avatar", "avatar-surface");
  resource(avatar, "person", "avatar-symbol");
  resource(el2("player-career"), "score", "score-surface", [154, 54, 42, 19]);
  const meter = document.querySelector(".lobby-rank-meter");
  resource(meter, "track", "meter-track", void 0, true);
  resource(meter.firstElementChild, "fill", "meter-fill", void 0, true);
  const missionSurface = document.createElement("img");
  missionSurface.src = "./assets/forest-ui/panels/mission-button.svg";
  missionSurface.alt = "";
  missionSurface.className = "lobby-resource mission-surface";
  el2("show-missions").append(missionSurface);
  resource(el2("show-missions").querySelector(".mission-shortcut-icon"), "gift", "mission-gift-art");
  resource(el2("show-missions"), "notice", "mission-notice");
  resource(el2("show-tournament"), "championship", "championship-surface", [924, 86, 45, 28]);
  el2("show-tournament").querySelector(".tournament-icon").remove();
  resource(el2("show-tournament"), "trophy", "championship-trophy");
  resource(el2("show-tournament"), "chevron", "championship-chevron");
  el2("show-tournament").append(Object.assign(document.createElement("span"), { className: "championship-divider" }));
  primaryButtonSurface(el2("start"), "start-surface", 934, 155);
  el2("start").querySelector("img").remove();
  const startContent = document.createElement("span");
  startContent.className = "start-content";
  startContent.append(el2("start").querySelector("[data-i18n]"));
  resource(startContent, "pair", "start-stones");
  el2("start").append(startContent);
  resource(el2("lobby-nav"), "navigation", "navigation-surface", [952, 132, 42, 33]);
  for (const [id, artName] of [["show-records", "book"], ["show-watch", "watch"], ["show-rankings", null], ["show-shop", "shop"]]) {
    const button = el2(id);
    button.querySelector("img").remove();
    let wrapper = button.querySelector(".lobby-nav-icon");
    if (!wrapper) {
      wrapper = document.createElement("span");
      wrapper.className = "lobby-nav-icon";
      button.prepend(wrapper);
    }
    if (artName) resource(wrapper, artName, "navigation-art");
    else {
      const art2 = document.createElement("span");
      art2.className = "lobby-resource navigation-art";
      art2.setAttribute("aria-hidden", "true");
      const trophy = svgNode("svg", { viewBox: "2 2 20 20", preserveAspectRatio: "none", focusable: "false" });
      Object.assign(trophy.style, { width: "100%", height: "100%", display: "block", overflow: "visible" });
      trophy.append(svgNode("use", { href: "#nav-ranking", width: 24, height: 24 }));
      art2.append(trophy);
      wrapper.append(art2);
    }
  }
  return { render(game) {
    host.hidden = Boolean(game);
  } };
}

// list-dialog.js
var listDialogReference = { width: 678, height: 1430, minStageHeight: 1060, border: 2 };
function listDialogFrameHeight(available, scale) {
  const { height, border } = listDialogReference;
  return Math.min(available, (height - 2 * border) * scale + 2 * border);
}
function installListDialog(dialog, {
  title,
  close,
  icon,
  tabs,
  minStageHeight = listDialogReference.minStageHeight,
  onResize = () => {
  }
}) {
  dialog.classList.add("forest-list-dialog");
  const stage = dialog.firstElementChild;
  stage.classList.add("list-dialog-stage");
  const heading = title.closest(".list-heading, .review-header");
  heading.classList.add("list-dialog-heading");
  title.classList.add("list-dialog-title");
  close.classList.add("list-dialog-close");
  close.textContent = "";
  heading.prepend(title);
  heading.append(close);
  resource(heading, icon, "list-dialog-resource list-dialog-icon");
  heading.append(titleUnderline("list-dialog-underline"));
  resource(close, "round", "list-dialog-resource list-dialog-close-surface");
  tabs?.classList.add("list-dialog-tabs");
  const resize = () => {
    if (!dialog.open || !dialog.clientWidth) return;
    const { width, border } = listDialogReference;
    const designWidth = width - 2 * border;
    const style = getComputedStyle(dialog);
    const available = parseFloat(style.maxHeight) || innerHeight - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0) - 20;
    if (minStageHeight > 0) {
      const widthForHeight = 2 * border + Math.max(0, available - 2 * border) * designWidth / minStageHeight;
      dialog.style.setProperty("--list-dialog-height-width", widthForHeight + "px");
    }
    const scale = dialog.clientWidth / designWidth;
    const height = listDialogFrameHeight(available, scale);
    dialog.style.setProperty("--list-dialog-scale", scale);
    dialog.style.setProperty("--list-dialog-height", height + "px");
    stage.style.width = designWidth + "px";
    stage.style.height = (height - 2 * border) / scale + "px";
    stage.style.transform = `scale(${scale})`;
    stage.dataset.sized = "true";
    onResize(scale);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(dialog);
  observer.observe(stage);
  window.addEventListener("resize", resize);
  window.addEventListener("ncq-banner", resize);
  return resize;
}

// ranking-pages.js
var serverPageSize = 30;
var rankingPageTarget = 10;
var rankingPageLimit = 20;
var RankingPages = class {
  constructor(tab, request) {
    this.tab = tab;
    this.request = request;
    this.batches = /* @__PURE__ */ new Map();
    this.total = null;
  }
  async batch(page) {
    if (!this.batches.has(page)) {
      const path = this.tab === "rating" ? "/rankings/rating?page=" + page : this.tab === "previous" ? "/tournament?view=previous" : "/tournament";
      const pending = Promise.resolve().then(() => this.request(path)).then((result) => {
        if (result.error) this.batches.delete(page);
        return result;
      }, (error) => {
        this.batches.delete(page);
        throw error;
      });
      this.batches.set(page, pending);
    }
    return this.batches.get(page);
  }
  async page(number, size2) {
    if (!Number.isInteger(number) || number < 1 || !Number.isInteger(size2) || size2 < 1 || size2 > rankingPageLimit) {
      throw new TypeError("Rankings require a positive page and 1\u201320 entries per page");
    }
    const first = (number - 1) * size2;
    const batchNumber = this.tab === "rating" ? Math.floor(first / serverPageSize) + 1 : 1;
    const result = await this.batch(batchNumber);
    if (result.error) return { ...result, page: number, pages: Math.max(1, Math.ceil((this.total ?? 0) / size2)) };
    const rows = result.standings ?? [];
    this.total = this.tab === "rating" ? result.total : rows.length;
    const pages = Math.max(1, Math.ceil(this.total / size2));
    if (number > pages) return this.page(pages, size2);
    let entries = rows;
    let offset = first;
    if (this.tab === "rating") {
      offset = first % serverPageSize;
      if (offset + size2 > serverPageSize && result.hasMore) {
        const next = await this.batch(batchNumber + 1);
        if (next.error) return { ...next, page: number, pages };
        entries = [...rows, ...next.standings ?? []];
      }
    }
    return {
      ...result,
      standings: entries.slice(offset, offset + size2),
      page: number,
      pages,
      pageSize: size2,
      hasMore: number < pages
    };
  }
};

// ranking-layout.js
function installMeasuredRankings(dialog, onCapacity = () => {
}) {
  const el2 = (id) => document.getElementById(id);
  const art2 = (parent, name, className, panel) => resource(parent, name, "ranking-resource " + className, panel);
  const join2 = el2("join-tournament");
  let joinSurface;
  new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    const width = box?.inlineSize ?? join2.offsetWidth;
    const height = box?.blockSize ?? join2.offsetHeight;
    if (!width || !height) return;
    joinSurface?.remove();
    joinSurface = primaryButtonSurface(
      join2,
      "ranking-resource ranking-primary-surface",
      width,
      height,
      { sourceCap: 55, capRatio: 46 / 96 }
    );
  }).observe(join2);
  for (const reward of document.querySelectorAll(".weekly-reward")) {
    art2(reward.querySelector(".weekly-reward-icon"), "round", "ranking-reward-icon-surface");
  }
  let capacityQueued = false;
  let capacity = rankingPageTarget;
  return installListDialog(dialog, {
    title: el2("tournament-title"),
    close: el2("show-lobby"),
    icon: "trophy",
    tabs: el2("ranking-tabs"),
    onResize(scale) {
      const panel = el2("tournament").querySelector(".ranking-panel:not([hidden])");
      if (!panel) return;
      const list2 = panel.querySelector(".ranking-cards");
      const row = list2.querySelector(".ranking-card");
      const rowHeight = row ? parseFloat(getComputedStyle(row).height) || 64 : 64;
      const gap = parseFloat(getComputedStyle(list2).rowGap) || 0;
      const body = panel.querySelector(".list-body").getBoundingClientRect();
      const reward = panel.querySelector(".weekly-reward:not([hidden])");
      const top = reward ? reward.getBoundingClientRect().bottom + 18 * scale : body.top;
      const room2 = Math.max(0, (body.bottom - top) / scale - 5);
      capacity = Math.max(1, Math.min(
        rankingPageLimit,
        Math.floor((room2 + gap) / (rowHeight + gap))
      ));
      if (!capacityQueued) {
        capacityQueued = true;
        queueMicrotask(() => {
          capacityQueued = false;
          onCapacity(capacity);
        });
      }
    }
  });
}

// mission-layout.js
var missionReference = {
  screen: [670, 1067],
  panel: [632, 778],
  centerOffset: 46.5,
  overview: [23, 150, 586, 125],
  list: [23, 288, 586, 361],
  rows: [0, 93, 186, 277],
  eligibility: [27, 697, 578, 48]
};
function installMeasuredMissions() {
  const dialog = document.getElementById("missions");
  const balance = document.getElementById("mission-balance");
  const layout = () => {
    const space = window.NcqSafe.space();
    const width = document.documentElement.clientWidth - space.left - space.right;
    const height = window.innerHeight - space.top - space.bottom;
    const maximumWidth = parseFloat(getComputedStyle(dialog).getPropertyValue("--popup-max-width")) || 560;
    const scale = Math.min(
      1,
      maximumWidth / missionReference.panel[0],
      width / missionReference.screen[0],
      height / missionReference.screen[1]
    );
    dialog.style.setProperty("--mission-scale", scale);
    dialog.style.width = missionReference.panel[0] * scale + "px";
    dialog.style.height = missionReference.panel[1] * scale + "px";
    dialog.style.left = space.left + (width - missionReference.panel[0] * scale) / 2 + "px";
    dialog.style.top = space.top + (height - missionReference.panel[1] * scale) / 2 + missionReference.centerOffset * scale + "px";
  };
  new ResizeObserver(layout).observe(document.documentElement);
  window.NcqSafe.onChange(layout);
  layout();
  const fitBalance = () => dialog.style.setProperty("--mission-coin-chars", Math.max(1, balance.textContent.length));
  new MutationObserver(fitBalance).observe(balance, { childList: true, characterData: true, subtree: true });
  fitBalance();
  const close = document.getElementById("mission-close");
  close.textContent = "";
  const hit = document.createElement("span");
  hit.className = "mission-close-hit";
  hit.setAttribute("aria-hidden", "true");
  close.append(hit);
  const ns2 = "http://www.w3.org/2000/svg";
  const wave = document.createElementNS(ns2, "svg");
  wave.setAttribute("viewBox", "0 0 165 16");
  wave.setAttribute("preserveAspectRatio", "none");
  wave.setAttribute("aria-hidden", "true");
  wave.classList.add("mission-title-wave");
  const path = document.createElementNS(ns2, "path");
  path.setAttribute("d", "M0 5C58 17 101-4 165 10C104 0 67 23 0 5Z");
  path.setAttribute("fill", "#8ca532");
  wave.append(path);
  document.getElementById("missions-title").append(wave);
  dialog.querySelector(".mission-eligibility").addEventListener("toggle", (event) => {
    if (event.target.open) requestAnimationFrame(() => event.target.scrollIntoView({ block: "nearest" }));
  });
}

// forest-ui.js
function createForestUI({ closeView, getView, hasGame, translate, onRankingCapacity }) {
  const el2 = (id) => document.getElementById(id);
  const wrap = (id, title, content) => {
    const dialog = document.createElement("dialog");
    dialog.id = id;
    dialog.className = "forest-page-dialog";
    dialog.setAttribute("aria-labelledby", title);
    const window2 = document.createElement("div");
    window2.className = "forest-window";
    window2.append(content);
    dialog.append(window2);
    document.body.append(dialog);
    return dialog;
  };
  const recordsDialog = wrap("records-dialog", "records-heading", el2("records"));
  const rankingsDialog = wrap("rankings-dialog", "tournament-title", el2("tournament"));
  const meta = document.createElement("div");
  meta.className = "forest-championship-meta";
  for (const id of ["forest-championship-period", "forest-championship-countdown"]) {
    const chip = document.createElement("span");
    chip.id = id;
    meta.append(chip);
  }
  const separator = document.createElement("span");
  separator.className = "forest-championship-separator";
  separator.textContent = "|";
  separator.setAttribute("aria-hidden", "true");
  meta.insertBefore(separator, meta.lastElementChild);
  el2("tournament").querySelector(".list-heading").after(meta);
  const watchDialog = wrap("watch-dialog", "lobby-heading", document.querySelector(".lobby-feed"));
  const watchHeading = watchDialog.querySelector(".list-heading");
  const toolbar = document.createElement("div");
  toolbar.className = "watch-list-toolbar";
  toolbar.append(el2("live-count"), el2("refresh-lobby"));
  watchHeading.after(toolbar);
  watchHeading.prepend(el2("lobby-heading"));
  watchHeading.querySelector(".list-heading-title").remove();
  watchHeading.append(el2("watch-close"));
  el2("show-tournament").querySelector(".tournament-icon").replaceWith(Object.assign(document.createElement("img"), {
    src: "./assets/forest-ui/icons/trophy.webp",
    alt: "",
    className: "tournament-icon"
  }));
  el2("lobby-mission-slot").append(el2("show-missions"));
  el2("lobby-championship-slot").append(el2("show-tournament"));
  el2("lobby-cta-slot").append(el2("lobby-entry"));
  document.querySelector(".lobby-highlights").remove();
  el2("shop").classList.add("forest-page-dialog", "forest-shop");
  for (const [dialog, view] of [[recordsDialog, "records"], [rankingsDialog, "tournament"]]) {
    dialog.addEventListener("close", () => {
      if (!dialog.open && !hasGame() && getView() === view) closeView();
    });
  }
  for (const button of document.querySelectorAll("[data-close-dialog]")) {
    button.addEventListener("click", () => el2(button.dataset.closeDialog).close());
  }
  const meter = document.createElement("span");
  meter.className = "lobby-rank-meter";
  meter.setAttribute("role", "progressbar");
  meter.append(document.createElement("span"));
  el2("player-card").append(meter);
  const measuredLobby = installMeasuredLobby();
  const measuredRankings = installMeasuredRankings(rankingsDialog, onRankingCapacity);
  const measuredRecords = installListDialog(recordsDialog, {
    title: el2("records-heading"),
    close: el2("records-back"),
    icon: "book",
    tabs: el2("record-filters")
  });
  const measuredWatch = installListDialog(watchDialog, {
    title: el2("lobby-heading"),
    close: el2("watch-close"),
    icon: "watch"
  });
  const measuredShop = installListDialog(el2("shop"), {
    title: el2("shop-title"),
    close: el2("shop").querySelector(".shop-heading .forest-close"),
    icon: "shopBag",
    tabs: el2("shop").querySelector(".shop-tabs")
  });
  const reviewAction = el2("review-room-action");
  const reviewSummary = document.querySelector(".review-result");
  resource(reviewAction.firstElementChild, "pair", "review-action-stones");
  let reviewSurface;
  new ResizeObserver(([{ contentRect: { width, height } }]) => {
    if (!width || !height) return;
    reviewSurface?.remove();
    reviewSurface = primaryButtonSurface(reviewAction, "review-primary-surface", width, height);
  }).observe(reviewAction);
  installMeasuredMissions();
  const setLayer = (dialog, visible) => {
    if (visible && !dialog.open) dialog.showModal();
    else if (!visible && dialog.open) dialog.close();
  };
  return {
    watchDialog,
    openWatch() {
      if (hasGame()) return;
      watchDialog.showModal();
      measuredWatch();
      el2("lobby-heading").focus();
    },
    back() {
      const dialog = [watchDialog, recordsDialog, rankingsDialog].find((layer) => layer.open);
      if (!dialog) return false;
      dialog.close();
      return true;
    },
    render(game, view) {
      measuredLobby.render(game);
      if (game && !game.sharedView) {
        if (reviewSummary.parentElement !== el2("review-own-status")) el2("review-own-status").append(reviewSummary);
      } else if (reviewSummary.parentElement !== el2("review")) {
        el2("review").insertBefore(reviewSummary, document.querySelector(".review-footer"));
      }
      const ranking = !game && view === "tournament";
      const cardParent = ranking ? el2("play-footer") : el2("lobby-profile-slot");
      if (el2("player-card").parentElement !== cardParent) cardParent.prepend(el2("player-card"));
      const footerParent = ranking ? rankingsDialog.firstElementChild : document.querySelector(".shell");
      if (el2("play-footer").parentElement !== footerParent) footerParent.append(el2("play-footer"));
      el2("play-footer").hidden = !ranking;
      if (game || view !== "lobby") watchDialog.close();
      setLayer(recordsDialog, !game && view === "records");
      setLayer(rankingsDialog, ranking);
      if (ranking) measuredRankings();
      if (!game && view === "records") measuredRecords();
      if (el2("shop").open) measuredShop();
    },
    profile(rating, lower, upper) {
      meter.setAttribute("aria-label", translate("forestPromotionProgress"));
      meter.setAttribute("aria-valuemin", lower);
      meter.setAttribute("aria-valuemax", upper);
      meter.setAttribute("aria-valuenow", Math.max(lower, Math.min(upper, rating)));
      meter.style.setProperty("--rank-fill", Math.max(0, Math.min(100, (rating - lower) / (upper - lower) * 100)) + "%");
    }
  };
}

// placement-motion.js
var frames = {
  stone: [
    { offset: 0, transform: "translate(-50%, -58%) scale(1.34)", opacity: 1, easing: "cubic-bezier(.55, .05, 1, .7)" },
    { offset: 0.4, transform: "translate(-50%, -50%) scale(1.1, .9)", opacity: 1 },
    { offset: 0.58, transform: "translate(-50%, -50%) scale(1.1, .9)", opacity: 1 },
    { offset: 0.78, transform: "translate(-50%, -50%) scale(.985, 1.02)", opacity: 1 },
    { offset: 1, transform: "translate(-50%, -50%)", opacity: 1 }
  ],
  shadow: [
    { offset: 0, transform: "translate(-50%, -50%) scale(.72)", opacity: 0.36, easing: "cubic-bezier(.55, .05, 1, .7)" },
    { offset: 0.4, transform: "translate(-50%, -50%) scale(1.12, .94)", opacity: 1 },
    { offset: 0.58, transform: "translate(-50%, -50%) scale(1.12, .94)", opacity: 1 },
    { offset: 0.78, transform: "translate(-50%, -50%) scale(.98, 1.02)", opacity: 0.9 },
    { offset: 1, transform: "translate(-50%, -50%)", opacity: 1 }
  ],
  marker: [{ offset: 0, opacity: 0 }, { offset: 0.58, opacity: 0 }, { offset: 0.78, opacity: 1 }, { offset: 1, opacity: 1 }]
};
function animateStonePlacement(cell, marker, {
  duration,
  onStart,
  shouldContinue = () => true,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame
}) {
  const animations = [
    [cell.querySelector(".stone"), frames.stone],
    [cell.querySelector(".stone-shadow"), frames.shadow],
    [marker, frames.marker]
  ].filter(([element]) => element).map(([element, keyframes]) => {
    const animation = element.animate(keyframes, { duration, fill: "both", easing: "linear" });
    animation.pause();
    animation.currentTime = 0;
    return animation;
  });
  let resolve;
  const finished = new Promise((done) => {
    resolve = done;
  });
  let frame, started2, stopped = false;
  const cancel = () => {
    if (stopped) return;
    stopped = true;
    cancelFrame(frame);
    for (const animation of animations) animation.cancel();
    resolve();
  };
  const tick = (time) => {
    if (!shouldContinue()) {
      cancel();
      return;
    }
    if (started2 === void 0) {
      started2 = time;
      onStart?.();
    }
    const elapsed = Math.min(duration, Math.max(0, time - started2));
    for (const animation of animations) animation.currentTime = elapsed;
    if (elapsed >= duration) cancel();
    else frame = requestFrame(tick);
  };
  frame = requestFrame(tick);
  return { finished, cancel };
}

// game/piece-motion.js
var JANGI_TRAVEL_DURATION = 240;
function jangiMoveTiming(landing = 80) {
  return { duration: JANGI_TRAVEL_DURATION + landing, contact: JANGI_TRAVEL_DURATION + landing * 0.4 };
}
function animateJangiMove(from, cell, marker, {
  landing = 80,
  onStart,
  shouldContinue = () => true,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame
} = {}) {
  const source = from.getBoundingClientRect(), target = cell.getBoundingClientRect();
  const x = source.left + source.width / 2 - target.left - target.width / 2;
  const y = source.top + source.height / 2 - target.top - target.height / 2;
  const lift = Math.min(11, target.width * 0.23);
  const { duration, contact } = jangiMoveTiming(landing);
  const raised = JANGI_TRAVEL_DURATION * 0.25 / duration, arrived = JANGI_TRAVEL_DURATION / duration;
  const impact = contact / duration, settle = (JANGI_TRAVEL_DURATION + landing * 0.78) / duration;
  const pose = (dx, dy, scale = "1") => `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
  const smooth = "cubic-bezier(.3, 0, .2, 1)";
  const stone = [
    { offset: 0, transform: pose(x, y), easing: "ease-out" },
    { offset: raised, transform: pose(x, y - lift, "1.12"), easing: smooth },
    { offset: arrived, transform: pose(0, -lift, "1.12"), easing: "ease-in" },
    { offset: impact, transform: pose(0, 0, "1.04, .98"), easing: "ease-out" },
    { offset: settle, transform: pose(0, 0, ".995, 1.005") },
    { offset: 1, transform: pose(0, 0) }
  ];
  const shadow = [
    { offset: 0, transform: pose(x, y), opacity: 1, filter: "blur(0px)", easing: "ease-out" },
    { offset: raised, transform: pose(x + 2, y + 2, "1.1"), opacity: 0.48, filter: "blur(1.3px)", easing: smooth },
    { offset: arrived, transform: pose(2, 2, "1.1"), opacity: 0.48, filter: "blur(1.3px)", easing: "ease-in" },
    { offset: impact, transform: pose(0, 0, "1.05, .98"), opacity: 1, filter: "blur(0px)" },
    { offset: 1, transform: pose(0, 0), opacity: 1, filter: "blur(0px)" }
  ];
  const animations = [
    [cell.querySelector(".stone"), stone],
    [cell.querySelector(".stone-shadow"), shadow],
    [marker, [{ offset: 0, opacity: 0 }, { offset: impact, opacity: 0 }, { offset: settle, opacity: 1 }, { offset: 1, opacity: 1 }]]
  ].filter(([element]) => element).map(([element, keyframes]) => {
    const animation = element.animate(keyframes, { duration, fill: "both", easing: "linear" });
    animation.pause();
    animation.currentTime = 0;
    return animation;
  });
  let frame, started2, stopped = false, resolve;
  const finished = new Promise((done) => {
    resolve = done;
  });
  function cancel() {
    if (stopped) return;
    stopped = true;
    cancelFrame(frame);
    animations.forEach((animation) => animation.cancel());
    resolve();
  }
  function tick(time) {
    if (!shouldContinue()) return cancel();
    if (started2 === void 0) {
      started2 = time;
      onStart?.(contact);
    }
    const elapsed = Math.min(duration, Math.max(0, time - started2));
    animations.forEach((animation) => {
      animation.currentTime = elapsed;
    });
    if (elapsed >= duration) cancel();
    else frame = requestFrame(tick);
  }
  frame = requestFrame(tick);
  return { finished, cancel };
}

// placement-preview.js
function previewPlacement(game, from, index2) {
  if (!game || game.phase !== "playing" || game.turn !== game.you || game.setup || !Number.isInteger(from) || !Number.isInteger(index2) || from < 0 || from >= 90 || index2 < 0 || index2 >= 90 || sideOf(game.board[from]) !== game.you || !legalMoves(game.board, game.you).some((move) => move.from === from && move.to === index2)) return null;
  return {
    code: game.code,
    round: game.round,
    version: game.version,
    seat: game.you,
    from,
    index: index2,
    piece: game.board[from],
    color: game.you,
    ply: game.moves.length
  };
}
function confirmsPlacement(preview, game) {
  return Boolean(preview && game.code === preview.code && game.round === preview.round && game.version > preview.version && game.moves[preview.ply]?.from === preview.from && game.moves[preview.ply]?.to === preview.index && game.board[preview.index] === preview.piece && (!game.moveSeats || game.moveSeats[preview.ply] === preview.seat));
}

// rewarded-coins.js
function createRewardedCoins({ request, watch, player, changed, credited, uuid = () => crypto.randomUUID() }) {
  let status = null;
  let busy2 = false;
  let pending = null;
  let owner = null;
  function sync() {
    if (owner !== player()) {
      owner = player();
      status = null;
      pending = null;
    }
  }
  return {
    get state() {
      sync();
      return { status, busy: busy2, retry: !!pending?.earned };
    },
    async refresh() {
      sync();
      const account = owner;
      const result = await request("");
      if (account === player() && !result.error) {
        status = result.rewardAd;
        changed();
      }
      return result;
    },
    async run() {
      sync();
      if (busy2 || !owner) return { error: "rewardAdBusy" };
      const account = owner;
      busy2 = true;
      changed();
      try {
        pending ??= { id: uuid(), earned: false };
        const id = pending.id;
        if (!pending.earned) {
          const start = await request("start", id);
          if (account !== player()) return {};
          if (start.error) {
            if (start.error !== "network") pending = null;
            return start;
          }
          status = start.rewardAd;
          let complete = false;
          try {
            complete = await watch();
          } catch {
          }
          if (account !== player()) return {};
          if (!complete) {
            const canceled = await request("cancel", id);
            if (canceled.error !== "network") pending = null;
            return { canceled: true };
          }
          pending.earned = true;
        }
        const result = await request("claim", id);
        if (account !== player()) return {};
        if (!result.error) {
          status = result.rewardAd;
          pending = null;
          credited(result);
        } else if (result.error !== "network") pending = null;
        return result;
      } finally {
        busy2 = false;
        sync();
        changed();
      }
    }
  };
}

// haptics.js
function createGameHaptics({
  device = () => globalThis.NcqDevice,
  blocked = () => false,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  clear = (timer) => clearTimeout(timer)
} = {}) {
  const seen = /* @__PURE__ */ new Set();
  const clocks = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  let lastTap = -Infinity;
  const trim = (collection) => {
    if (collection.size > 1024) collection.delete(collection.keys().next().value);
  };
  const available = () => {
    try {
      const api = device();
      return !blocked() && api?.canVibrate() && api.vibration();
    } catch {
      return false;
    }
  };
  const play = (kind) => {
    if (!available()) return;
    try {
      device().vibrate(kind);
    } catch {
    }
  };
  const once = (key, kind, { delay = 0, valid = () => true } = {}) => {
    if (seen.has(key)) return () => {
    };
    seen.add(key);
    trim(seen);
    if (!available()) return () => {
    };
    const timers = /* @__PURE__ */ new Set();
    let canceled = false;
    const cancel = () => {
      canceled = true;
      for (const timer of timers) clear(timer);
      timers.clear();
      pending.delete(cancel);
    };
    const beats = kind === "promotion" ? [[0, "light"], [90, "medium"], [220, "success"]] : [[0, kind]];
    for (const [offset, feedback2] of beats) {
      const run2 = () => {
        if (!canceled && valid()) play(feedback2);
      };
      if (delay + offset > 0) {
        pending.add(cancel);
        const timer = schedule(() => {
          timers.delete(timer);
          if (!timers.size) pending.delete(cancel);
          run2();
        }, delay + offset);
        timers.add(timer);
      } else run2();
    }
    return cancel;
  };
  return {
    once,
    tap() {
      if (now() - lastTap < 120) return;
      lastTap = now();
      play("light");
    },
    clock(key, remaining, allowed = true) {
      const previous = clocks.get(key);
      clocks.set(key, remaining);
      trim(clocks);
      if (previous > 5e3 && remaining <= 5e3 && remaining > 0) {
        once("clock:" + key, "warning", { valid: () => allowed });
      }
    },
    stop() {
      for (const cancel of pending) cancel();
      try {
        device()?.vibrate(0);
      } catch {
      }
    }
  };
}

// record-storage.js
function recordSnapshot(game, online) {
  if (!game || typeof game !== "object" || game.summaryOnly) return null;
  const code = game.code ?? game.id?.split(":")[0];
  if (!code || !Number.isInteger(game.round) || !Array.isArray(game.moves)) return null;
  const snapshot = { id: code + ":" + game.round, code, device: game.device === true || !online };
  for (const key of [
    "number",
    "round",
    "moves",
    "winner",
    "line",
    "you",
    "finishedAt",
    "endReason",
    "players",
    "bot",
    "mode",
    "rule",
    "black",
    "moveColors",
    "passes",
    "moveSeats",
    "placementStyles",
    "pieceStyles",
    "ratingChange",
    "recordDetail",
    "formations"
  ]) {
    if (game[key] !== void 0) snapshot[key] = game[key];
  }
  const actions = game.recordDetail?.actions ?? game.actions;
  if (Array.isArray(actions)) {
    snapshot.passes = [1, 2].map((seat) => actions.filter((action) => action.type === "pass" && action.seat === seat).length);
  }
  return JSON.parse(JSON.stringify(snapshot));
}
function createRecordHistory(NcqSave, { player, cloud, legacy = [], changed }) {
  if (!NcqSave?.records) return null;
  const archive2 = NcqSave.records({ id: "matjjangjangi", collection: "games", player, cloud });
  for (const game of legacy) {
    const record = recordSnapshot(game, cloud && game.device !== true);
    if (record) archive2.add(record.id, record);
  }
  const unsubscribe = archive2.onChange((info) => {
    if (info.source === "cloud" || info.source === "other-tab") changed?.();
  });
  return {
    player,
    list: () => {
      const records2 = /* @__PURE__ */ new Map();
      for (const item of archive2.list()) {
        const record = recordSnapshot(item.data, cloud);
        if (record && (!records2.has(record.id) || record.recordDetail)) records2.set(record.id, record);
      }
      return [...records2.values()].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    },
    add: (game) => {
      const record = recordSnapshot(game, cloud);
      if (!record) return false;
      const old = archive2.list().find((item) => item.id === record.id)?.data;
      const id = record.recordDetail && old && !old.recordDetail ? record.id + "@detail-v1" : record.id;
      return archive2.add(id, record);
    },
    ready: () => archive2.ready(),
    status: () => archive2.status(),
    dispose: () => {
      unsubscribe();
      archive2.dispose();
    }
  };
}
function restoreResult(previous, result, saved) {
  const code = result.id?.split(":")[0] ?? previous.code;
  const local = saved?.find((game) => game.id === code + ":" + result.round);
  return {
    ...previous,
    ...local,
    ...result.state,
    code,
    round: result.round,
    you: result.you,
    ratingChange: result.ratingChange,
    winner: result.state.winner,
    finishedAt: result.finishedAt,
    phase: "finished",
    canRematch: false,
    version: Math.max(previous.version + 1, result.version ?? 0),
    summaryOnly: !local,
    ...local ? { recordDetail: local.recordDetail } : {},
    ...local ? { board: replayBoard2(local), actions: local.recordDetail?.actions } : {}
  };
}
function replayBoard2(game) {
  return replayBoard(game, game.moves.length);
}
function mergeFinishedRoom(previous, next, records2) {
  if (!next.summaryOnly) return next;
  const local = records2.find((game) => game.id === next.code + ":" + next.round);
  const current2 = previous?.code === next.code && previous.round === next.round ? previous : {};
  return {
    ...current2,
    ...local,
    ...next,
    moves: local?.moves ?? current2.moves ?? [],
    moveColors: local?.moveColors ?? current2.moveColors,
    moveSeats: local?.moveSeats ?? current2.moveSeats,
    line: local?.line ?? current2.line ?? [],
    placementStyles: local?.placementStyles ?? current2.placementStyles,
    formations: local?.formations ?? current2.formations ?? next.formations,
    pieceStyles: local?.pieceStyles ?? current2.pieceStyles ?? next.pieceStyles,
    board: local ? replayBoard2(local) : current2.board ?? next.board,
    recordDetail: local?.recordDetail ?? current2.recordDetail,
    summaryOnly: !local,
    actions: local?.recordDetail?.actions ?? current2.recordDetail?.actions ?? next.actions
  };
}

// supabase/functions/matjjangjangi/daily-puzzles.mjs
var compositions = [
  { theme: "rookNet", pieces: [[7, 3], [12, -1], [14, -2], [21, -2], [35, -7], [38, 3], [50, 6], [76, 1]] },
  { theme: "rookCapture", pieces: [[3, -2], [5, -2], [22, -1], [32, 3], [36, 3], [40, -7], [50, 6], [76, 1]] },
  { theme: "cannonBridge", pieces: [[12, -2], [22, -1], [23, -2], [28, 6], [30, 3], [36, -7], [40, 4], [76, 1]] },
  { theme: "cannonNet", pieces: [[3, -2], [4, -1], [6, 4], [7, 6], [12, -2], [23, 3], [40, -7], [76, 1]] },
  { theme: "horseNet", pieces: [[3, -1], [12, -2], [23, -2], [25, 6], [39, 5], [40, -7], [49, 3], [76, 1]] },
  { theme: "horsePalace", pieces: [[3, -2], [5, -2], [14, -1], [21, 3], [33, -7], [38, 5], [46, 6], [76, 1]] },
  { theme: "soldierCapture", pieces: [[5, -2], [8, 6], [14, -1], [23, -2], [31, 3], [32, 7], [40, -7], [76, 1]] },
  { theme: "soldierNet", pieces: [[4, 6], [13, -2], [21, -2], [22, -1], [32, 3], [33, -7], [40, 7], [76, 1]] }
];
var DAILY_PUZZLE_COUNT = compositions.length * 4;
var DAILY_PUZZLE_REWARD = 50;
var koreaDay = (time) => new Date(time + 9 * 60 * 6e4).toISOString().slice(0, 10);
function puzzleForDay(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("invalidDay");
  const time = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) throw Error("invalidDay");
  const offset = Math.floor((time - Date.UTC(2026, 10, 14)) / 864e5);
  const slot = (offset % DAILY_PUZZLE_COUNT + DAILY_PUZZLE_COUNT) % DAILY_PUZZLE_COUNT;
  const base2 = compositions[slot % compositions.length], variant = Math.floor(slot / compositions.length);
  const board2 = Array(90).fill(0), rotate = variant >= 2;
  for (const [i, piece] of base2.pieces) {
    const mirrored = variant % 2 ? Math.floor(i / 9) * 9 + 8 - i % 9 : i;
    board2[rotate ? 89 - mirrored : mirrored] = rotate ? -piece : piece;
  }
  return { id: "mate-v1-" + slot, number: slot + 1, theme: base2.theme, board: board2, turn: rotate ? 2 : 1, goal: "mateInOne" };
}

// daily-puzzle-progress.js
function createPuzzleProgress({ now = Date.now, elapsed = () => performance.now() } = {}) {
  let player = null, lastRewardDay = null, serverTime = null, receivedAt = 0;
  function accept(wallet, owner) {
    if (owner !== player) {
      player = owner;
      lastRewardDay = null;
      serverTime = null;
    }
    if (Object.hasOwn(wallet, "puzzleLastRewardDay")) lastRewardDay = wallet.puzzleLastRewardDay;
    if (Number.isFinite(wallet.serverNow)) {
      serverTime = wallet.serverNow;
      receivedAt = elapsed();
    }
  }
  const today = () => koreaDay(serverTime === null ? now() : serverTime + Math.max(0, elapsed() - receivedAt));
  return {
    accept,
    today,
    claimed: (day = today()) => Boolean(lastRewardDay && lastRewardDay >= day),
    correctTime: (time) => {
      if (Number.isFinite(time)) {
        serverTime = time;
        receivedAt = elapsed();
      }
    }
  };
}

// daily-puzzle.js
function createDailyPuzzle({ t: t3, request, credited, appearance, changed }) {
  const el2 = (id) => document.getElementById(id), dialog = el2("daily-puzzle"), grid = el2("puzzle-grid");
  const board2 = el2("puzzle-board"), cells2 = [];
  const progress = createPuzzleProgress();
  let data = null, from = null, solved = null, pending = false, error = null, message = null, hint = null, generation = 0, motion = null, claimMove = null;
  const state = () => ({ ...initial(), board: data.puzzle.board.slice(), turn: data.puzzle.turn, positions: {} });
  const coordinate2 = (i) => "ABCDEFGHJ"[i % 9] + (10 - Math.floor(i / 9));
  for (let i = 0; i < 90; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = i;
    cell.setAttribute("role", "gridcell");
    const token = document.createElement("span");
    token.className = "stone";
    const shadow = document.createElement("span");
    shadow.className = "stone-shadow";
    cell.append(token, shadow);
    cell.addEventListener("click", () => void pick2(i));
    grid.append(cell);
    cells2.push(cell);
  }
  const marker = document.createElement("span");
  function render2() {
    const puzzle = data?.puzzle, playable = Boolean(puzzle) && !pending && !error && !solved;
    if (data) data.claimed = progress.claimed(data.day);
    dialog.dataset.result = solved ? "solved" : message === "puzzleWrong" ? "wrong" : "";
    el2("show-daily-puzzle").toggleAttribute("data-claimed", progress.claimed());
    el2("puzzle-date").textContent = puzzle ? t3("puzzleDate", { day: data.day, n: puzzle.number }) : "";
    el2("puzzle-reward").textContent = t3(data?.claimed ? "puzzleClaimed" : "puzzleReward", { n: DAILY_PUZZLE_REWARD });
    el2("puzzle-side").textContent = solved ? t3("puzzleTheme_" + puzzle.theme) : from !== null ? t3("puzzleSelected", {
      piece: GLYPHS[puzzle.turn][Math.abs(puzzle.board[from]) - 1]
    }) : puzzle ? t3("puzzleSide", { side: t3(puzzle.turn === 1 ? "black" : "white") }) : t3("puzzleSubtitle");
    el2("puzzle-board-slot").hidden = !puzzle;
    el2("puzzle-status").textContent = t3(pending ? "puzzleSubmit" : error ?? (!puzzle ? "puzzleLoading" : solved ? "puzzleSuccess" : message ?? (data?.claimed ? "puzzleSolvedHint" : "puzzleTheme_" + puzzle.theme)));
    el2("puzzle-explanation").textContent = solved ? t3("puzzleExplain", {
      piece: GLYPHS[puzzle.turn][Math.abs(puzzle.board[solved.from]) - 1],
      from: coordinate2(solved.from),
      to: coordinate2(solved.to)
    }) + (solved.granted ? " " + t3("puzzleGranted", { n: data.reward }) : " " + t3("puzzleNext")) : hint !== null ? t3("puzzleHintText") : "";
    el2("puzzle-hint").disabled = !playable;
    el2("puzzle-hint").hidden = Boolean(error);
    el2("puzzle-reset").disabled = pending;
    el2("puzzle-reset").textContent = t3(error ? claimMove && error !== "puzzleExpired" ? "puzzleRetryReward" : "puzzleReload" : solved ? "puzzlePractice" : "puzzleReset");
    el2("puzzle-reset").toggleAttribute("data-ncq-main", dialog.open && Boolean(error || solved));
    if (!puzzle) return;
    const styles = appearance();
    board2.dataset.boardStyle = styles.board;
    const displayedBoard = solved ? apply(state(), { type: "move", from: solved.from, to: solved.to }).board : puzzle.board;
    const game = { ...puzzle, you: puzzle.turn, moves: solved ? [solved] : [], turn: solved ? 3 - puzzle.turn : puzzle.turn };
    drawJangiBoard({
      game,
      displayedBoard,
      cells: cells2,
      selectedFrom: from,
      selected: null,
      lastMoveMarker: marker,
      board: board2,
      selectable: playable,
      coordinate: coordinate2,
      t: t3,
      latest: true,
      localPieceStyle: styles.stones
    });
    for (const [i, cell] of cells2.entries()) {
      cell.disabled = !playable;
      cell.classList.toggle("puzzle-hint", i === hint);
    }
  }
  function load() {
    ++generation;
    motion?.cancel();
    motion = null;
    pending = false;
    error = null;
    solved = null;
    from = null;
    hint = null;
    message = null;
    claimMove = null;
    const day = progress.today();
    data = { day, puzzle: puzzleForDay(day), reward: DAILY_PUZZLE_REWARD };
    window.NcqMetrics?.levelStart("daily-puzzle");
    render2();
  }
  function finish(move, granted = false) {
    solved = { ...move, granted };
    hint = null;
    from = null;
    claimMove = null;
    error = null;
    window.NcqMetrics?.levelEnd("daily-puzzle", true, { score: DAILY_PUZZLE_REWARD });
    render2();
    const own2 = generation;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) motion = animateJangiMove(cells2[move.from], cells2[move.to], null, {
      shouldContinue: () => dialog.open && generation === own2 && !document.hidden
    });
  }
  async function pick2(index2) {
    if (!data || pending || solved || error) return;
    if (data.day !== progress.today()) {
      load();
      return;
    }
    const puzzle = data.puzzle;
    if (sideOf(puzzle.board[index2]) === puzzle.turn) {
      from = from === index2 ? null : index2;
      message = null;
      render2();
      return;
    }
    if (from === null || !legalMoves(puzzle.board, puzzle.turn).some((m) => m.from === from && m.to === index2)) return;
    const move = { from, to: index2 };
    if (apply(state(), { type: "move", ...move }).winner !== puzzle.turn) {
      message = "puzzleWrong";
      from = null;
      render2();
      return;
    }
    if (progress.claimed(data.day)) {
      finish(move);
      return;
    }
    await claim(move);
  }
  async function claim(move) {
    if (pending) return;
    const own2 = generation, puzzle = data.puzzle;
    claimMove = move;
    pending = true;
    error = null;
    message = null;
    render2();
    try {
      const result = await request({ day: data.day, id: puzzle.id, ...move });
      if (own2 !== generation) return;
      if (result?.error) {
        progress.correctTime(result.serverNow);
        error = result.error === "puzzleExpired" ? "puzzleExpired" : "puzzleClaimFailed";
        return;
      }
      if (!result?.correct || !result.wallet) {
        error = "puzzleClaimFailed";
        return;
      }
      credited(result.wallet);
      finish(move, result.granted);
    } catch {
      if (own2 === generation) error = "puzzleClaimFailed";
    } finally {
      if (own2 === generation) {
        pending = false;
        render2();
      }
    }
  }
  el2("show-daily-puzzle").addEventListener("click", () => {
    dialog.showModal();
    load();
    changed();
  });
  el2("puzzle-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    ++generation;
    motion?.cancel();
    motion = null;
    pending = false;
    changed();
  });
  el2("puzzle-reset").addEventListener("click", () => {
    if (error) {
      if (claimMove && error !== "puzzleExpired") void claim(claimMove);
      else load();
      return;
    }
    const finished = Boolean(solved);
    motion?.cancel();
    motion = null;
    solved = null;
    from = null;
    hint = null;
    message = null;
    if (finished) window.NcqMetrics?.levelStart("daily-puzzle");
    render2();
  });
  el2("puzzle-hint").addEventListener("click", () => {
    const answer = legalMoves(data.puzzle.board, data.puzzle.turn).find((move) => apply(state(), move).winner === data.puzzle.turn);
    hint = answer?.from ?? null;
    from = hint;
    render2();
  });
  const fit = () => board2.style.setProperty("--puzzle-height", Math.floor(el2("puzzle-board-slot").getBoundingClientRect().height) + "px");
  new ResizeObserver(fit).observe(el2("puzzle-board-slot"));
  const dayChanged = () => {
    el2("show-daily-puzzle").toggleAttribute("data-claimed", progress.claimed());
    if (dialog.open && !pending && data?.day !== progress.today()) load();
  };
  return {
    render: () => {
      if (dialog.open) render2();
    },
    isOpen: () => dialog.open,
    close: () => dialog.close(),
    dayChanged,
    updateWallet: (wallet, player) => {
      progress.accept(wallet, player);
      dayChanged();
      if (dialog.open) render2();
    }
  };
}

// daily-puzzle-texts.js
var DAILY_PUZZLE_TEXTS = {
  ko: {
    puzzleTitle: "\uC624\uB298\uC758 \uBB38\uC81C",
    puzzleEntry: "\uC624\uB298\uC758 \uBB38\uC81C \uD480\uAE30",
    puzzleSubtitle: "\uAE30\uBCF4 \uC18D \uC2B9\uBD80\uB97C \uB05D\uB0BC \uD55C \uC218",
    puzzleGoal: "\uD55C \uC218\uB85C \uC678\uD1B5\uC744 \uB9CC\uB4DC\uC138\uC694",
    puzzleSide: "{side} \uCC28\uB840 \xB7 \uB9D0\uC744 \uACE0\uB974\uACE0 \uC774\uB3D9\uD560 \uACF3\uC744 \uB204\uB974\uC138\uC694.",
    puzzleReward: "\uD574\uACB0 \uBCF4\uC0C1 {n}\uCF54\uC778",
    puzzleRules: "\uB9E4\uC77C 00:00 (\uD55C\uAD6D \uC2DC\uAC04) \uC0C8 \uBB38\uC81C \xB7 \uD558\uB8E8 \uD55C \uBC88 \uBCF4\uC0C1",
    puzzleSource: "\uCC3D\uC791 \uC5F0\uC2B5 \uAE30\uBCF4 \xB7 \uD55C \uC218 \uC678\uD1B5",
    puzzleLoading: "\uC624\uB298\uC758 \uAE30\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
    puzzleOffline: "\uC5F0\uACB0\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uBD88\uB7EC\uC640 \uC8FC\uC138\uC694.",
    puzzleReload: "\uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30",
    puzzleHint: "\uD78C\uD2B8",
    puzzleHintText: "\uBE5B\uB098\uB294 \uB9D0\uC744 \uC6C0\uC9C1\uC5EC \uBCF4\uC138\uC694. \uD78C\uD2B8\uB97C \uC368\uB3C4 \uBCF4\uC0C1\uC740 \uAC19\uC544\uC694.",
    puzzleReset: "\uCC98\uC74C \uC704\uCE58",
    puzzleClose: "\uB2EB\uAE30",
    puzzleSubmit: "\uBCF4\uC0C1\uC744 \uC9C0\uAE09\uD558\uB294 \uC911\u2026",
    puzzleRetryReward: "\uBCF4\uC0C1 \uB2E4\uC2DC \uBC1B\uAE30",
    puzzleClaimFailed: "\uBCF4\uC0C1 \uC9C0\uAE09\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uBC1B\uAE30\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.",
    puzzleWrong: "\uC544\uC9C1 \uC678\uD1B5\uC774 \uC544\uB2C8\uC5D0\uC694. \uB2E4\uB978 \uC218\uB97C \uCC3E\uC544\uBCF4\uC138\uC694!",
    puzzleSuccess: "\uC815\uB2F5! \uC678\uD1B5\uC744 \uB9CC\uB4E4\uC5C8\uC5B4\uC694.",
    puzzleGranted: "{n}\uCF54\uC778\uC744 \uBC1B\uC558\uC5B4\uC694!",
    puzzleClaimed: "\uC624\uB298 \uBCF4\uC0C1 \uC218\uB839 \uC644\uB8CC",
    puzzlePractice: "\uB2E4\uC2DC \uD480\uAE30",
    puzzleNext: "\uB2E4\uC74C \uBB38\uC81C\uB294 \uD55C\uAD6D \uC2DC\uAC04 \uC790\uC815\uC5D0 \uC5F4\uB824\uC694.",
    puzzleSelected: "{piece} \uC120\uD0DD \xB7 \uD45C\uC2DC\uB41C \uACF3\uC73C\uB85C \uC6C0\uC9C1\uC5EC \uBCF4\uC138\uC694.",
    puzzleDate: "{day} \xB7 \uCC3D\uC791 \uAE30\uBCF4 #{n}",
    puzzleExpired: "\uC0C8\uB85C\uC6B4 \uB0A0\uC774 \uB418\uC5C8\uC5B4\uC694. \uC624\uB298 \uBB38\uC81C\uB97C \uB2E4\uC2DC \uBD88\uB7EC\uC640 \uC8FC\uC138\uC694.",
    puzzleExplain: "{piece} {from} \u2192 {to}. \uC7A5\uAD70\uC744 \uD53C\uD558\uAC70\uB098 \uB9C9\uAC70\uB098, \uACF5\uACA9\uD55C \uB9D0\uC744 \uC7A1\uC744 \uC218 \uC5C6\uC5B4 \uC678\uD1B5\uC774\uC5D0\uC694.",
    puzzleSolvedHint: "\uC774\uBBF8 \uBCF4\uC0C1\uC744 \uBC1B\uC740 \uBB38\uC81C\uC608\uC694. \uB2E4\uC2DC \uD480\uBA70 \uC5F0\uC2B5\uD560 \uC218 \uC788\uC5B4\uC694.",
    puzzleTheme_rookNet: "\uCC28\uC758 \uD3EC\uC704",
    puzzleTheme_rookCapture: "\uAE38\uC744 \uC5EC\uB294 \uCC28",
    puzzleTheme_cannonBridge: "\uD3EC\uC758 \uB2E4\uB9AC",
    puzzleTheme_cannonNet: "\uD3EC\uC758 \uD55C \uC218",
    puzzleTheme_horseNet: "\uB9C8\uC758 \uD3EC\uC704",
    puzzleTheme_horsePalace: "\uAD81\uC131\uC744 \uB178\uB9AC\uB294 \uB9C8",
    puzzleTheme_soldierCapture: "\uC878\uBCD1\uC758 \uB3CC\uD30C",
    puzzleTheme_soldierNet: "\uC878\uBCD1\uC758 \uB9C8\uBB34\uB9AC"
  },
  en: {
    puzzleTitle: "Daily puzzle",
    puzzleEntry: "Play today\u2019s puzzle",
    puzzleSubtitle: "Find the move that ends the game",
    puzzleGoal: "Checkmate in one move",
    puzzleSide: "{side} to move \xB7 Pick a piece, then a destination.",
    puzzleReward: "Solve for {n} coins",
    puzzleRules: "New puzzle at 00:00 KST \xB7 One reward per day",
    puzzleSource: "Original practice position \xB7 Mate in one",
    puzzleLoading: "Loading today\u2019s position\u2026",
    puzzleOffline: "Check your connection and try loading again.",
    puzzleReload: "Reload puzzle",
    puzzleHint: "Hint",
    puzzleHintText: "Move the highlighted piece. Hints keep your full reward.",
    puzzleReset: "Reset position",
    puzzleClose: "Close",
    puzzleSubmit: "Collecting your reward\u2026",
    puzzleRetryReward: "Retry reward",
    puzzleClaimFailed: "Your reward could not be confirmed. Please retry collecting it.",
    puzzleWrong: "That is not checkmate yet. Try another move!",
    puzzleSuccess: "Correct! Checkmate.",
    puzzleGranted: "You received {n} coins!",
    puzzleClaimed: "Today\u2019s reward collected",
    puzzlePractice: "Solve again",
    puzzleNext: "The next puzzle opens at midnight KST.",
    puzzleSelected: "{piece} selected \xB7 Choose a marked destination.",
    puzzleDate: "{day} \xB7 Original position #{n}",
    puzzleExpired: "A new day has started. Reload today\u2019s puzzle.",
    puzzleExplain: "{piece} {from} \u2192 {to}. The general cannot escape, block the check, or capture the attacker.",
    puzzleSolvedHint: "You have collected this reward. Solve again for practice.",
    puzzleTheme_rookNet: "The rook\u2019s net",
    puzzleTheme_rookCapture: "Clear the file",
    puzzleTheme_cannonBridge: "The cannon\u2019s bridge",
    puzzleTheme_cannonNet: "A cannon finish",
    puzzleTheme_horseNet: "The horse\u2019s net",
    puzzleTheme_horsePalace: "A horse at the palace",
    puzzleTheme_soldierCapture: "Soldier breakthrough",
    puzzleTheme_soldierNet: "The soldier\u2019s finish"
  }
};

// app.js
for (const language of ["ko", "en"]) Object.assign(TEXTS[language], JANGI_TEXTS[language], DAILY_PUZZLE_TEXTS[language]);
NcqLang.init({ id: "matjjangjangi", texts: TEXTS });
try {
  if (!new URL(location.href).searchParams.has("lang") && !localStorage.getItem("matjjangjangi:lang")) NcqLang.set("ko");
} catch {
  if (!new URL(location.href).searchParams.has("lang")) NcqLang.set("ko");
}
installJangiArtwork();
requestAnimationFrame(installJangiArtwork);
var maySwap = () => false;
var mayOffer = () => false;
var offerCount = 0;
var openingRadius = () => null;
var selectedFrom = null;
var t2 = NcqLang.t;
var el = (id) => document.getElementById(id);
var size = 9;
var columns = "ABCDEFGHJKLMNOP";
var recordsKey = "matjjangjangi.records";
var appearanceKey = "matjjangjangi.appearance.settings";
var legacyAppearanceKey = "matjjangjangi.appearance";
var nicknameKey = "matjjangjangi.nickname";
var stoneSoundKey = "matjjangjangi.stoneSound";
var placementStyleKey = "matjjangjangi.placementStyle";
var matchAdsKey = "matjjangjangi.matchAds";
var matchAdCooldown = 9e4;
var adFreeRounds = 3;
var NcqAds = window.NcqAds;
var NcqIap = window.NcqIap;
var coinPacks = {};
var adsRemoved = false;
var adPurchaseBusy = false;
var matchAds = { freeRounds: [], lastShownAt: 0, lastAttemptedRound: null };
var pendingMatchAdRound = null;
var placementEffects = {
  plain: { price: 0 },
  golden: { price: 120, expiry: "goldenPlacementUntil", purchased: "shopEffectPurchased" },
  sakura: { price: 150, expiry: "sakuraPlacementUntil", purchased: "shopSakuraPurchased" },
  ripple: { price: 150, expiry: "ripplePlacementUntil", purchased: "shopRipplePurchased" },
  mystic: { price: 150, expiry: "mysticPlacementUntil", purchased: "shopMysticPurchased" }
};
var placementStyles = Object.keys(placementEffects);
var placementTiming = { landing: 80, effectRatio: 320 / 180 };
var replayPlacementDuration = placementTiming.landing;
var placementStyle = loadPlacementStyle();
var dayMs = 24 * 60 * 6e4;
var koreaOffset = 9 * 60 * 6e4;
var dailyMissions = [
  { target: 1, coins: 30 },
  { target: 3, coins: 50 },
  { target: 6, coins: 80 }
];
var repeatMission = { after: dailyMissions.at(-1).target, limit: 10, coins: 5 };
var dailyMissionLimit = repeatMission.after + repeatMission.limit;
var missionRewards = new Map(dailyMissions.map(({ target, coins }) => [target, coins]));
for (let target = repeatMission.after + 1; target <= dailyMissionLimit; target += 1) {
  missionRewards.set(target, repeatMission.coins);
}
var missionTargets = [...missionRewards.keys()];
var missionClaiming = false;
var pairedSkinPrices = {
  reference: 0,
  classic: 0,
  vintage: 300,
  porcelain: 800,
  jade: 1e3,
  lacquer: 400,
  ocean: 700,
  soda: 600,
  gilded: 500,
  quartz: 350,
  marble: 250,
  sapphire: 400,
  sakura: 450,
  aurora: 500
};
var skinPrices = {
  stones: { ...pairedSkinPrices, glossy: 200 },
  board: { ...pairedSkinPrices, wood: 200 }
};
var skinKinds = Object.keys(skinPrices);
var shopState = loadShopState();
var serverWallet;
var canClaimTestCoins = false;
var testCoinRequestId;
var testCoinClaiming = false;
var rewardedCoins = createRewardedCoins({
  player: () => authSession?.player,
  request: (op, requestId) => remoteRequest((client) => client.gameRequest(
    "/wallet/reward-ad" + (op ? "/" + op : ""),
    op ? { requestId } : void 0,
    -1
  )),
  // NCQ_ADS_COINS: 코인 20개 보상형 광고
  watch: () => NcqAds.rewarded("COINS"),
  changed: () => {
    if (shop.open) renderRewardAd();
  },
  credited: (next) => {
    if (!applyWallet(next)) return;
    render();
    if (next.adReward) showCoinReward(next.adReward.coins, "ad:" + next.adReward.id, "shop");
  }
});
var effectPurchaseIds = {};
var shopPreview = { ...shopState.appearance };
var shopTab = "skins";
var shopEffectPreview;
var shopEffectTimer;
var shopSaving = false;
var board = el("board");
var boardGrid = el("board-grid");
var lastMoveMarker = el("last-move-marker");
var reviewMoveNumbers = el("review-move-numbers");
var ownClock = el("own-clock");
var opponentClock = el("opponent-clock");
var ownProgress = el("own-progress");
var opponentProgress = el("opponent-progress");
var cells = [];
var focused = 76;
var selected = null;
selectedFrom = null;
var pendingPlacement = null;
var room = null;
var stream = null;
var connected = false;
var busy = false;
var nextMatchPending = false;
var reviewPly = 0;
var awaitingResultDismissal = false;
var promotionCloseTimer;
var showMoveNumbers = false;
var archive = null;
var spectator = null;
var lobbyView = "lobby";
var recordsReturnView = "lobby";
var recordsScope = recordsKey;
var recordHistory = null;
var recordReceipts = /* @__PURE__ */ new Set();
var records = loadRecords();
var recordPreviewObserver;
var recordPreviewJobs = /* @__PURE__ */ new WeakMap();
var recordFilter = "all";
var favoritesScope;
var favorites = /* @__PURE__ */ new Set();
var recordDialogTarget = null;
var liveGames = null;
var lobbyUnavailable = false;
var lobbyLoading = false;
var playerStats = null;
var playerPhoto = null;
var playerNickname = "";
var nicknameOverride = "";
var profileLoading = false;
var profileRequest = 0;
var profileTarget = null;
var matchmaking = null;
var tournamentCatchUpDialog = el("tournament-catch-up");
var tournamentCatchUpQuote;
var ruleNames = { janggi: "ruleJangi" };
var defaultRule = "janggi";
var ruleDialog = el("rule-dialog");
var availableRules = Object.keys(ruleNames);
var preferredRule = defaultRule;
try {
  preferredRule = localStorage.getItem("matjjangjangi.rule") ?? defaultRule;
} catch {
}
var matchIntro = null;
var authConfig;
var authSession;
var authenticating;
var backend;
var boardApiUrl;
var finishBoardStartup;
var boardStartup = new Promise((resolve) => {
  finishBoardStartup = resolve;
});
var rankingTab = "weekly";
var rankingResults = {};
var weeklyRewardButtons = [...document.querySelectorAll("[data-weekly-reward]")];
var weeklyRewards;
var weeklyRewardsRequest = 0;
var weeklyRewardsTimer;
var weeklyRewardClaiming = false;
var turnDeadline = null;
var turnFrame = 0;
var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
var placementAudio;
var placementBuffer;
var activePlacementSound;
var placementSoundCue = 0;
var activePlacement;
var activePlacementEffect;
var cancelLandingHaptic;
var cancelPromotionHaptic;
var purchaseNotice = 0;
var haptics = createGameHaptics({
  blocked: () => document.hidden || adPurchaseBusy || document.querySelector(".shell").inert || Boolean(NcqAds?.status?.().busy) || Boolean(window.NcqFeedback?.isOpen())
});
var roundHapticKey = (game) => `${game.code}:${game.round}`;
var dailyPuzzle = createDailyPuzzle({
  t: t2,
  appearance: () => shopState.appearance,
  changed: () => render(),
  request: async (input) => {
    await boardStartup;
    if (!backend) return { error: "network" };
    await ensureIdentity();
    const player = authSession?.player;
    const result = await remoteRequest((client) => client.gameRequest("/puzzles/daily", input, -1));
    if (player !== authSession?.player) return { error: "network" };
    if (result.wallet && player === authSession?.player && applyWallet(result.wallet)) renderCoinBalance();
    if (result.error === "puzzleExpired") await refreshWallet(-1);
    return result;
  },
  credited: (wallet) => {
    if (applyWallet(wallet)) {
      renderCoinBalance();
      haptics.once("daily-puzzle:" + wallet.day, "success");
    }
  }
});
var boardLayoutFrame;
function fitBoardFrame(playWidth, availableHeight, inset, border = 0) {
  const proportional = inset.trim().endsWith("%");
  const value = parseFloat(inset) || 0;
  const ratio = proportional ? value / 100 : 0;
  const fixed = proportional ? border : 2 * value + border;
  const frame = Math.max(0, Math.min((playWidth + fixed) / (1 - 2 * ratio), availableHeight));
  return { frame, grid: Math.max(0, frame * (1 - 2 * ratio) - fixed) };
}
function scheduleBoardLayout() {
  cancelAnimationFrame(boardLayoutFrame);
  boardLayoutFrame = requestAnimationFrame(() => {
    const match2 = el("match");
    if (match2.hidden || !document.body.classList.contains("in-match")) return;
    const safe = window.NcqSafe?.space() ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const width = Math.max(0, Math.min(640, innerWidth) - safe.left - safe.right - 4);
    const height = Math.max(0, innerHeight - safe.top - safe.bottom);
    const slot = board.parentElement;
    const style = getComputedStyle(board);
    const inset = style.getPropertyValue("--board-inset");
    const border = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const desired = fitBoardFrame(width, Infinity, inset, border).frame;
    match2.removeAttribute("data-compact-board");
    const controlsHeight = () => match2.getBoundingClientRect().height - slot.getBoundingClientRect().height;
    if (desired * 10 / 9 + controlsHeight() > height) match2.setAttribute("data-compact-board", "");
    const reserved = match2.hasAttribute("data-playing") ? controlsHeight() : Math.max(240, controlsHeight());
    const fitted = fitBoardFrame(width, (height - reserved) * 9 / 10, inset, border);
    board.style.setProperty("--board-frame-size", `${fitted.frame.toFixed(2)}px`);
    board.style.setProperty("--board-grid-size", `${fitted.grid.toFixed(2)}px`);
  });
}
new ResizeObserver(scheduleBoardLayout).observe(el("match"));
window.addEventListener("resize", scheduleBoardLayout);
window.NcqSafe?.onChange(scheduleBoardLayout);
applyAppearance();
var shop = el("shop");
var shopMainActions = [...shop.querySelectorAll("[data-ncq-main]")];
var shopPurchaseDialog = el("shop-purchase-complete");
var coinShortageDialog = el("coin-shortage");
var leaveDialog = el("leave-dialog");
var leaveDialogRoom;
var bikjangDialog = el("bikjang-confirm");
var bikjangPending = null;
var bikjangCallKey = null;
var bikjangCallTimer;
var resultDialog = el("result");
var rankCelebration = el("rank-celebration");
var shopAction = el("shop-action");
var shopEffectAction = el("shop-effect-action");
var shopEffectOptions = [...shop.querySelectorAll(".shop-effect-option")].map((button) => ({
  button,
  effect: button.dataset.effect,
  status: button.querySelector(".shop-effect-status"),
  time: button.querySelector(".shop-effect-time")
}));
var missionDialog = el("missions");
var coinRewardDialog = el("coin-reward-dialog");
var coinRewardQueue = [];
var coinRewardReceipts = /* @__PURE__ */ new Set();
var activeCoinReward;
var optionsDialog = el("options");
var feedbackButton = el("send-feedback");
var profileDialog = el("player-profile");
var nicknameEdit = el("profile-nickname-edit");
var nicknameEditor = el("profile-nickname-editor");
var nicknameInput = el("nickname");
var matchIntroDialog = el("match-intro");
var playerPhotos = ["player-photo", "match-player-photo", "match-intro-photo"].map(el);
var forest = createForestUI({
  closeView: showLobby,
  getView: () => lobbyView,
  hasGame: () => Boolean(room ?? archive ?? spectator),
  translate: t2,
  onRankingCapacity: resizeRankingPage
});
matchIntroDialog.addEventListener("click", () => matchIntroDialog.close());
matchIntroDialog.addEventListener("close", () => {
  if (matchIntroDialog.open) return;
  matchIntro?.cancelHaptic?.();
  clearTimeout(matchIntro?.timer);
  matchIntro = null;
  render();
});
el("player-card").addEventListener("click", () => openPlayerProfile());
el("own-profile").addEventListener("click", () => openPlayerProfile(room.you));
el("opponent-profile").addEventListener("click", () => openPlayerProfile(3 - room.you));
el("black-profile").addEventListener("click", () => openPlayerProfile(1));
el("white-profile").addEventListener("click", () => openPlayerProfile(2));
el("review-opponent-profile").addEventListener("click", () => openPlayerProfile(3 - (room ?? archive).you));
el("review-own-profile").addEventListener("click", () => openPlayerProfile((room ?? archive).you));
profileDialog.addEventListener("close", () => {
  if (profileDialog.open) return;
  const ranking = profileTarget?.ranking;
  profileTarget = null;
  nicknameEditor.hidden = true;
  nicknameEdit.setAttribute("aria-expanded", "false");
  render();
  if (ranking && lobbyView === "tournament" && rankingTab === ranking.tab) {
    const card = el("ranking-" + ranking.tab + "-list").querySelector(`[data-ranking-player="${CSS.escape(ranking.key)}"]`);
    (card ?? el("ranking-" + ranking.tab + "-tab")).focus();
  }
});
profileDialog.querySelector(".profile-close").addEventListener("click", () => profileDialog.close());
nicknameEdit.addEventListener("click", () => {
  const opening = nicknameEditor.hidden;
  nicknameEditor.hidden = !opening;
  nicknameEdit.setAttribute("aria-expanded", String(opening));
  if (!opening) return;
  nicknameInput.value = displayNickname(nicknameOverride);
  nicknameInput.focus();
  nicknameInput.select();
});
profileDialog.querySelector("form").addEventListener("submit", () => {
  if (!profileTarget?.own || nicknameEditor.hidden) return;
  nicknameOverride = nicknameInput.value.trim();
  try {
    localStorage.setItem(nicknameKey, nicknameOverride);
  } catch {
  }
});
el("profile-rankings").addEventListener("click", () => {
  profileDialog.close();
  showRankings();
});
function openOptions() {
  feedback("restore-feedback");
  feedback("player-id-feedback");
  feedbackButton.hidden = !window.NcqFeedback?.can();
  optionsDialog.showModal();
  render();
}
el("show-options").addEventListener("click", openOptions);
el("match-options").addEventListener("click", openOptions);
optionsDialog.addEventListener("close", closeLobbyMenu);
el("vibration").addEventListener("change", (event) => {
  window.NcqDevice?.vibration(event.target.checked);
  if (event.target.checked) haptics.tap();
});
el("options-player-id").addEventListener("click", (event) => event.currentTarget.select());
el("copy-player-id").addEventListener("click", async () => {
  const input = el("options-player-id");
  const player = input.value;
  if (!player) return;
  try {
    await navigator.clipboard.writeText(player);
    if (optionsDialog.open && input.value === player) feedback("player-id-feedback", "optionsPlayerIdCopied");
  } catch {
    if (!optionsDialog.open || input.value !== player) return;
    input.focus();
    input.select();
    feedback("player-id-feedback", "optionsPlayerIdCopyManually", true);
  }
});
feedbackButton.addEventListener("click", async () => {
  optionsDialog.close();
  const completion = window.NcqFeedback.open();
  render();
  try {
    await completion;
  } finally {
    render();
  }
});
window.ncqBack = () => {
  if (bikjangDialog.open) {
    bikjangDialog.close("cancel");
    return true;
  }
  if (dailyPuzzle.isOpen()) {
    dailyPuzzle.close();
    return true;
  }
  if (window.NcqFeedback?.isOpen()) {
    window.NcqFeedback.close();
    return true;
  }
  if (coinRewardDialog.open) {
    coinRewardDialog.close();
    return true;
  }
  if (leaveDialog.open) {
    leaveDialog.close("cancel");
    return true;
  }
  if (coinShortageDialog.open) {
    coinShortageDialog.close();
    return true;
  }
  if (rankCelebration.open) {
    rankCelebration.close();
    return true;
  }
  if (resultDialog.open) {
    resultDialog.close();
    return true;
  }
  if (shopPurchaseDialog.open) {
    shopPurchaseDialog.close();
    return true;
  }
  if (optionsDialog.open) {
    optionsDialog.close();
    return true;
  }
  if (missionDialog.open) {
    missionDialog.close();
    return true;
  }
  if (shop.open) {
    shop.close();
    return true;
  }
  if (forest.back()) return true;
  if ((room || archive || spectator) && !document.querySelector("dialog[open]")) {
    leaveMatch();
    return true;
  }
  return false;
};
var stoneSoundToggle = el("stone-sound");
var adPrivacy = el("ad-privacy");
NcqAds?.ready().then(() => {
  adPrivacy.hidden = !NcqAds.privacyRequired();
}).catch(() => {
});
adPrivacy.addEventListener("click", () => NcqAds?.showPrivacyOptions());
try {
  stoneSoundToggle.checked = localStorage.getItem(stoneSoundKey) !== "off";
} catch {
}
stoneSoundToggle.addEventListener("change", () => {
  if (stoneSoundToggle.checked) unlockPlacementAudio();
  else stopPlacementSound();
  try {
    localStorage.setItem(stoneSoundKey, stoneSoundToggle.checked ? "on" : "off");
  } catch {
  }
});
document.addEventListener("click", unlockPlacementAudio, { capture: true });
document.addEventListener("keydown", unlockPlacementAudio, { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelPlacement();
    haptics.stop();
  } else if (placementAudio) unlockPlacementAudio();
});
try {
  nicknameOverride = localStorage.getItem(nicknameKey)?.trim() ?? "";
} catch {
}
var shopRows = Array.from(shop.querySelectorAll(".appearance-choices"));
for (const row of shopRows) {
  const inputs = Array.from(row.querySelectorAll("input"));
  inputs.sort((a, b) => skinPrices[a.name][a.value] - skinPrices[b.name][b.value]);
  row.append(...inputs.map((input) => input.closest("label")));
  const [previous, next] = row.parentElement.querySelectorAll("[data-skin-scroll]");
  const updateArrows = () => {
    previous.disabled = row.scrollLeft <= 1;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
  };
  for (const button of [previous, next]) {
    button.addEventListener("click", () => {
      const gap = parseFloat(getComputedStyle(row).columnGap);
      const distance = row.firstElementChild.getBoundingClientRect().width + gap;
      row.scrollBy({ left: Number(button.dataset.skinScroll) * distance, behavior: reducedMotion.matches ? "auto" : "smooth" });
    });
  }
  row.addEventListener("scroll", updateArrows, { passive: true });
  new ResizeObserver(updateArrows).observe(row);
  let drag;
  row.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button === 0 && row.scrollWidth > row.clientWidth) {
      drag = {
        id: event.pointerId,
        x: event.clientX,
        scroll: row.scrollLeft,
        scale: row.getBoundingClientRect().width / row.offsetWidth || 1
      };
    }
  });
  row.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id || !event.buttons) return;
    const distance = event.clientX - drag.x;
    if (!row.hasPointerCapture(event.pointerId)) {
      if (Math.abs(distance) < 6) return;
      row.setPointerCapture(event.pointerId);
      row.setAttribute("data-dragging", "");
    }
    row.scrollLeft = drag.scroll - distance / drag.scale;
  });
  const endDrag = (event) => {
    if (event.pointerId !== drag?.id) return;
    drag = null;
    row.removeAttribute("data-dragging");
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) row.addEventListener(type, endDrag);
  row.addEventListener("pointerleave", (event) => {
    if (!row.hasPointerCapture(event.pointerId)) endDrag(event);
  });
}
var shopRadios = Array.from(shop.querySelectorAll('input[type="radio"]'));
var skinCards = shopRadios.filter((input) => input.name !== "grid").map((input) => {
  const label = input.closest("label");
  const boardSample = label.querySelector(".board-sample");
  const status = document.createElement("span");
  const price = document.createElement("span");
  status.className = "shop-skin-status";
  price.className = "shop-skin-price";
  label.append(status, price);
  return { input, label, boardSample, status, price };
});
function openShop() {
  lobbyView = "lobby";
  forest.render(room ?? archive ?? spectator?.game, lobbyView);
  shopPreview = { ...shopState.appearance };
  shopEffectPreview = null;
  shopTab = "skins";
  canClaimTestCoins = false;
  feedback("shop-feedback");
  shop.showModal();
  render();
  void refreshCoinCheckout();
  shop.querySelector(".shop-content").scrollTop = 0;
  for (const row of shopRows) {
    const card = row.querySelector("input:checked")?.closest("label");
    if (!card) continue;
    const cardBounds = card.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const scale = rowBounds.width / row.offsetWidth || 1;
    row.scrollLeft += (cardBounds.left - rowBounds.left + (cardBounds.width - rowBounds.width) / 2) / scale;
  }
  void refreshWallet();
}
var shopTabs = ["currency", "effects", "skins"];
var missionRows = [...dailyMissions, repeatMission].map((_, index2) => {
  const row = el("daily-mission-row").content.firstElementChild.cloneNode(true);
  row.querySelector(".mission-goal").id = "mission-goal-" + index2;
  row.querySelector(".mission-claim").setAttribute("aria-describedby", "mission-goal-" + index2);
  el("daily-mission-list").append(row);
  return row;
});
var missionSteps = dailyMissions.map(() => {
  const step = document.createElement("span");
  step.className = "mission-step";
  el("daily-mission-steps").append(step);
  return step;
});
var repeatMissionRow = missionRows.at(-1);
var repeatCount = document.createElement("span");
repeatCount.id = "mission-repeat-count";
repeatMissionRow.querySelector(".mission-label").append(repeatCount);
repeatMissionRow.classList.add("mission-repeat");
var missionMarkers = [...el("mission-markers").children];
el("show-shop").addEventListener("click", openShop);
el("show-missions").addEventListener("click", () => {
  feedback("mission-feedback");
  missionDialog.showModal();
  el("mission-content").scrollTop = 0;
  render();
  void refreshWallet();
});
missionDialog.addEventListener("close", (event) => {
  if (!missionDialog.open && activeCoinReward?.source === "missions") coinRewardDialog.close();
  closeLobbyMenu(event);
});
coinRewardDialog.addEventListener("close", () => {
  if (coinRewardDialog.open) return;
  activeCoinReward = null;
  render();
  presentCoinReward();
  if (coinRewardDialog.open) return;
  if (missionDialog.open) {
    const next = missionDialog.querySelector(".mission-claim:not([hidden]):not(:disabled)");
    (next ?? el("mission-close")).focus({ preventScroll: true });
  } else if (shop.open) {
    el("shop-tab-" + shopTab).focus({ preventScroll: true });
  }
});
missionDialog.addEventListener("click", (event) => {
  const button = event.target.closest(".mission-claim");
  if (button) void claimMission(button);
});
shop.addEventListener("close", (event) => {
  if (!shop.open) clearTimeout(shopEffectTimer);
  closeLobbyMenu(event);
});
shopPurchaseDialog.addEventListener("close", () => {
  render();
  if (shop.open && !shop.contains(document.activeElement)) {
    el("shop-tab-" + shopTab).focus({ preventScroll: true });
  }
  presentCoinReward();
});
coinShortageDialog.addEventListener("close", () => {
  if (coinShortageDialog.returnValue === "yes") {
    if (!shop.open) openShop();
    shopTab = "currency";
    feedback("shop-feedback");
    renderShop();
    shop.querySelector(".shop-content").scrollTop = 0;
    el("shop-tab-currency").focus({ preventScroll: true });
  }
  render();
});
for (const tab of shopTabs) {
  el("shop-tab-" + tab).addEventListener("click", () => {
    if (shopTab !== tab) haptics.tap();
    shopTab = tab;
    feedback("shop-feedback");
    renderShop();
    shop.querySelector(".shop-content").scrollTop = 0;
  });
}
for (const input of shopRadios) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    if (shopPreview[input.name] !== input.value) haptics.tap();
    shopPreview[input.name] = input.value;
    feedback("shop-feedback");
    renderShop();
  });
}
shopAction.addEventListener("click", () => saveShopSelection(shopAction.hasAttribute("data-purchase")));
el("shop-claim-test-coins").addEventListener("click", claimTestCoins);
el("shop-watch-ad-coins").addEventListener("click", async () => {
  feedback("shop-feedback");
  const result = await rewardedCoins.run();
  if (result.error) {
    const message = ["rewardAdLimit", "rewardAdBusy", "rewardAdExpired"].includes(result.error) ? result.error : rewardedCoins.state.retry ? "rewardAdRetryMessage" : "rewardAdFailed";
    feedback("shop-feedback", message, true);
  }
  if (backend) void rewardedCoins.refresh();
});
for (const { button, effect } of shopEffectOptions) {
  button.addEventListener("click", () => {
    if ((shopEffectPreview ?? placementStyle) !== effect) haptics.tap();
    shopEffectPreview = effect;
    feedback("shop-feedback");
    renderPlacementCards();
    previewPlacementEffect(button, effect);
  });
}
shopEffectAction.addEventListener("click", () => {
  if (shopEffectAction.hasAttribute("data-purchase")) {
    void buyPlacementEffect(shopEffectPreview ?? placementStyle);
  } else {
    setPlacementStyle(shopEffectPreview);
    shopEffectPreview = null;
    feedback("shop-feedback", "shopEffectApplied");
    renderShop();
  }
});
el("shop-buy-remove-ads").addEventListener("click", buyRemoveAds);
el("shop-restore-ads").addEventListener("click", () => restoreAdPurchase("shop-feedback"));
el("restore-purchases").addEventListener("click", () => restoreAdPurchase("restore-feedback"));
window.addEventListener("ncq-iap", refreshAdPurchase);
window.addEventListener("storage", (event) => {
  if (event.key === placementStyleKey || event.key === null) {
    placementStyle = loadPlacementStyle();
    if (shop.open) renderPlacementCards();
  }
  if (event.key !== appearanceKey && event.key !== null) return;
  shopState = loadShopState();
  applyAppearance();
  renderCoinBalance();
  dailyPuzzle.render();
  renderDailyMissions();
  if (shop.open) renderShop();
});
for (let row = 0; row < 10; row += 1) {
  const rowEl = document.createElement("div");
  rowEl.className = "board-row";
  rowEl.setAttribute("role", "row");
  for (let col = 0; col < size; col += 1) {
    const index2 = row * size + col;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.tabIndex = index2 === focused ? 0 : -1;
    cell.dataset.index = index2;
    cell.setAttribute("role", "gridcell");
    const stone = document.createElement("span");
    stone.className = "stone";
    stone.setAttribute("aria-hidden", "true");
    cell.append(stone);
    const shadow = document.createElement("span");
    shadow.className = "stone-shadow";
    shadow.setAttribute("aria-hidden", "true");
    cell.append(shadow);
    rowEl.append(cell);
    cells.push(cell);
  }
  boardGrid.append(rowEl);
}
for (const language of NcqLang.list()) {
  el("language").add(new Option(language.name, language.code));
}
el("language").addEventListener("change", (event) => {
  if (NcqLang.lang !== event.target.value) haptics.tap();
  NcqLang.set(event.target.value);
});
NcqLang.onChange(render);
function loadShopState(fallback2) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(appearanceKey) ?? localStorage.getItem(legacyAppearanceKey));
  } catch {
  }
  if (!saved && fallback2) return fallback2;
  const appearance = {
    stones: normalizePieceStyle(saved?.stones),
    board: Object.hasOwn(skinPrices.board, saved?.board) ? saved.board : "reference",
    grid: saved?.grid === "soft" ? "soft" : "engraved"
  };
  const ownedSkins = new Set(Array.isArray(saved?.ownedSkins) ? saved.ownedSkins : []);
  for (const kind of skinKinds) {
    if (skinPrices[kind][appearance[kind]] > 0) ownedSkins.add(kind + ":" + appearance[kind]);
  }
  const state = { appearance, ownedSkins: [...ownedSkins] };
  if (saved?.stones === "janggi" || saved?.board === "janggi") {
    try {
      persistShopState(state);
    } catch {
    }
  }
  return state;
}
function persistShopState({ appearance, ownedSkins }) {
  localStorage.setItem(appearanceKey, JSON.stringify({
    stones: appearance.stones,
    board: appearance.board,
    grid: appearance.grid,
    ownedSkins
  }));
}
async function updateShop(action) {
  if (navigator.locks) return navigator.locks.request(appearanceKey, action);
  return action();
}
function setAppearanceTheme(element, appearance) {
  element.dataset.stoneStyle = appearance.stones;
  element.dataset.boardStyle = appearance.board;
  element.dataset.gridStyle = appearance.grid;
}
function applyAppearance() {
  setAppearanceTheme(document.documentElement, shopState.appearance);
}
function ownsSkin(state, kind, style) {
  const id = kind + ":" + style;
  return skinPrices[kind][style] === 0 || state.ownedSkins.includes(id) || serverWallet?.ownedSkins.includes(id);
}
function shopPurchase(selection, state) {
  const locked = skinKinds.filter((kind) => !ownsSkin(state, kind, selection[kind]));
  return {
    skins: locked.map((kind) => kind + ":" + selection[kind]),
    price: locked.reduce((sum, kind) => sum + skinPrices[kind][selection[kind]], 0)
  };
}
function koreaDay2(timestamp) {
  return new Date(timestamp + koreaOffset).toISOString().slice(0, 10);
}
function missionProgress(count, target) {
  return { count: NcqLang.num(Math.min(count, target)), target: NcqLang.num(target) };
}
function coinBalance() {
  return serverWallet?.coins ?? 0;
}
function canAffordShop(price) {
  return price <= coinBalance();
}
function loadPlacementStyle() {
  try {
    const style = localStorage.getItem(placementStyleKey);
    if (placementStyles.includes(style)) return style;
  } catch {
  }
  return "golden";
}
function setPlacementStyle(style) {
  if (!placementStyles.includes(style)) return;
  placementStyle = style;
  try {
    localStorage.setItem(placementStyleKey, style);
  } catch {
  }
}
function placementUntil(effect) {
  const key = placementEffects[effect]?.expiry;
  return serverWallet?.[key] ?? 0;
}
function ownsPlacement(effect) {
  if (effect === "plain") return true;
  if (effect === "sakura" && serverWallet?.sakuraOwned) return true;
  return placementUntil(effect) > Date.now();
}
function placementRequest() {
  const pieceStyle = normalizePieceStyle(shopState.appearance.stones);
  if (!backend && !ownsPlacement(placementStyle)) return { placementStyle: "plain", pieceStyle };
  return { placementStyle, pieceStyle, ...!backend ? { placementUntil: placementUntil(placementStyle) } : {} };
}
function applyWallet(next) {
  if (next.error || !Number.isInteger(next.coins)) return false;
  if (!serverWallet || next.version >= serverWallet.version && next.day >= serverWallet.day && (next.day !== serverWallet.day || next.count >= serverWallet.count)) {
    serverWallet = next;
    dailyPuzzle.updateWallet(next, authSession?.player);
  }
  return true;
}
async function refreshWallet(cooldown = 3) {
  if (!backend) return;
  const next = await remoteRequest((client) => client.gameRequest("/wallet", void 0, cooldown));
  if (applyWallet(next)) {
    if (shop.open) void rewardedCoins.refresh();
    canClaimTestCoins = next.canClaimTestCoins === true;
    render();
  }
}
async function claimTestCoins() {
  if (!canClaimTestCoins || testCoinClaiming) return;
  testCoinRequestId ??= crypto.randomUUID();
  testCoinClaiming = true;
  feedback("shop-feedback");
  renderShop();
  try {
    const next = await remoteRequest((client) => client.gameRequest("/wallet/test-coins", {
      requestId: testCoinRequestId
    }));
    if (next.error === "forbidden") canClaimTestCoins = false;
    if (next.error !== "network") testCoinRequestId = void 0;
    const credited = applyWallet(next);
    if (shop.open && shopTab === "currency") {
      feedback("shop-feedback", credited ? "shopTestCoinDone" : "shopTestCoinFailed", !credited);
    }
  } finally {
    testCoinClaiming = false;
    render();
  }
}
function applyWeeklyRewards(result) {
  if (result.error || !result.participation) return false;
  weeklyRewards = result;
  clearTimeout(weeklyRewardsTimer);
  const refreshIn = Date.parse(result.refreshAt) - Date.parse(result.serverNow);
  if (Number.isFinite(refreshIn)) {
    weeklyRewardsTimer = setTimeout(() => {
      weeklyRewards = void 0;
      render();
      void refreshWeeklyRewards();
    }, Math.max(1e3, refreshIn + 100));
  }
  return true;
}
async function refreshWeeklyRewards(cooldown = 3) {
  if (!backend || weeklyRewardClaiming) return;
  const request = ++weeklyRewardsRequest;
  const result = await remoteRequest((client) => client.gameRequest("/tournament/rewards", void 0, cooldown));
  if (request === weeklyRewardsRequest && applyWeeklyRewards(result)) render();
}
async function claimWeeklyReward(type) {
  const reward = weeklyRewards?.[type];
  if (weeklyRewardClaiming || !reward?.available) return;
  weeklyRewardClaiming = true;
  ++weeklyRewardsRequest;
  const message = type + "-reward-feedback";
  feedback(message);
  render();
  const result = await remoteRequest((client) => client.gameRequest("/tournament/rewards", { kind: type, week: reward.week }));
  weeklyRewardClaiming = false;
  if (applyWeeklyRewards(result)) {
    applyWallet(result.wallet);
  } else {
    feedback(message, result.error ?? "network", true);
    void refreshWeeklyRewards();
  }
  render();
}
function renderRewardBadge(id, ready, label, attribute = "data-reward-ready") {
  const entry = el(id);
  entry.toggleAttribute(attribute, ready);
  if (ready) entry.setAttribute("aria-label", t2("rewardAvailableLabel", { label }));
  else entry.removeAttribute("aria-label");
}
function renderWeeklyRewards(mainAction) {
  const participationReady = Boolean(weeklyRewards?.participation?.available);
  const rankingReady = Boolean(weeklyRewards?.ranking?.available);
  const hasReward = participationReady || rankingReady;
  renderRewardBadge("show-rankings", hasReward, t2("rankings"));
  const lobbyLabel = [el("lobby-championship").textContent, el("championship-countdown").textContent].filter(Boolean).join(" \xB7 ");
  for (const [id, ready, label] of [
    ["show-tournament", hasReward, lobbyLabel],
    ["ranking-weekly-tab", participationReady, t2("currentTournament")],
    ["ranking-previous-tab", rankingReady, t2("previousTournament")]
  ]) {
    renderRewardBadge(id, ready, label, "data-weekly-reward-ready");
  }
  for (const button of weeklyRewardButtons) {
    const type = button.dataset.weeklyReward;
    const reward = weeklyRewards?.[type];
    const card = el(type + "-reward");
    card.hidden = !reward;
    const tab = type === "participation" ? "weekly" : "previous";
    const ready = Boolean(reward?.available);
    button.toggleAttribute("data-weekly-reward-ready", ready);
    button.toggleAttribute("data-ncq-main", ready && !weeklyRewardClaiming && mainAction && lobbyView === "tournament" && rankingTab === tab);
    if (!reward) continue;
    if (type === "participation") {
      el("participation-reward-progress").textContent = t2("participationRewardProgress", {
        target: NcqLang.num(reward.target),
        count: NcqLang.num(reward.count)
      });
      Array.from(el("participation-reward-steps").children).forEach((step, index2) => {
        step.toggleAttribute("data-completed", index2 < reward.count);
      });
    } else {
      el("ranking-reward-rank").textContent = t2("rankingRewardPlace", { rank: NcqLang.num(reward.rank) });
    }
    const action = t2(reward.claimed ? "weeklyRewardClaimed" : "weeklyRewardClaim");
    const coins = NcqLang.num(reward.coins);
    button.querySelector(".weekly-reward-coins strong").textContent = coins;
    button.querySelector(".weekly-reward-action").textContent = action;
    button.setAttribute("aria-label", t2("weeklyRewardClaimLabel", { reward: t2(type + "Reward"), coins, action }));
    button.setAttribute("aria-disabled", String(weeklyRewardClaiming || !ready));
    button.toggleAttribute("data-claimed", reward.claimed);
    if (reward.claimed) feedback(type + "-reward-feedback");
  }
}
function renderCoinBalance() {
  const coins = NcqLang.num(coinBalance());
  el("lobby-coin-count").textContent = coins;
  el("lobby-coin-count").style.setProperty("--coin-characters", coins.length);
  el("shop-balance").textContent = coins;
}
function renderDailyMissions() {
  const today = koreaDay2(Date.now());
  const missions = today === serverWallet?.day ? serverWallet : { count: 0, claimed: [] };
  const { count, claimed } = missions;
  const ready = missionTargets.filter((target) => target <= count && !claimed.includes(target));
  const hasReward = ready.length > 0;
  const completed = dailyMissions.filter(({ target }) => count >= target).length;
  const progress = missionProgress(completed, dailyMissions.length);
  el("daily-mission-count").textContent = progress.count;
  el("daily-mission-total").textContent = t2("missionMilestoneTotal", progress);
  const filledSegments = Math.max(0, completed - 1);
  el("daily-mission-steps").style.setProperty("--mission-rail-fill", filledSegments / (dailyMissions.length - 1) * 100 + "%");
  missionSteps.forEach((step, index2) => step.toggleAttribute("data-completed", index2 < completed));
  el("show-missions").toggleAttribute("data-ready", hasReward);
  renderRewardBadge("show-lobby", hasReward, t2("playTab"));
  el("daily-mission-action").textContent = t2(hasReward ? "missionClaim" : "missionView");
  if (!missionDialog.open) return;
  el("mission-close").toggleAttribute("data-ncq-main", !coinRewardDialog.open);
  el("mission-balance").textContent = NcqLang.num(coinBalance());
  const overview = el("mission-overview-progress");
  overview.setAttribute("aria-valuenow", completed);
  overview.style.setProperty("--mission-fill", completed / dailyMissions.length * 100 + "%");
  const total = el("mission-total");
  const slash = document.createElement("span");
  slash.className = "mission-count-slash";
  slash.textContent = "/";
  total.replaceChildren(document.createTextNode(progress.count), slash, document.createTextNode(progress.target));
  total.setAttribute("aria-label", t2("missionOverviewCount", progress));
  missionMarkers.forEach((marker, index2) => {
    const done = index2 < completed;
    marker.toggleAttribute("data-done", done);
    marker.textContent = done ? "\u2713" : "";
  });
  dailyMissions.forEach(({ target, coins: coins2 }, index2) => {
    const goal = t2(target === 1 ? "missionFirstGoal" : "missionGoal", { n: NcqLang.num(target) });
    renderMissionRow(missionRows[index2], {
      goal,
      coins: coins2,
      progress: Math.min(count, target),
      max: target,
      claim: ready.includes(target) ? target : null,
      done: claimed.includes(target)
    });
  });
  const { after, limit, coins } = repeatMission;
  const repeats = claimed.filter((target) => target > after).length;
  renderMissionRow(repeatMissionRow, {
    goal: t2("missionRepeatGoal"),
    coins,
    progress: Math.min(Math.max(0, count - after), limit),
    max: limit,
    claim: ready.find((target) => target > after),
    done: repeats >= limit
  });
  el("mission-repeat-count").textContent = t2("missionRepeatProgress", missionProgress(repeats, limit));
  el("mission-repeat-note").textContent = t2("missionRepeatNote", { after: NcqLang.num(after), n: NcqLang.num(limit), coins: NcqLang.num(coins) });
  const status = el("mission-feedback");
  if (!status.hidden) status.textContent = t2(status.dataset.message);
}
function renderMissionRow(row, { goal, coins, progress, max, claim, done }) {
  row.dataset.state = claim ? "ready" : done ? "done" : "pending";
  row.querySelector(".mission-goal").textContent = goal;
  row.querySelector(".mission-coins").textContent = NcqLang.num(coins);
  row.querySelector(".mission-amount").setAttribute("aria-label", t2("shopPrice", { n: NcqLang.num(coins) }));
  const track = row.querySelector(".mission-track");
  track.setAttribute("aria-label", goal);
  track.setAttribute("aria-valuemax", max);
  track.setAttribute("aria-valuenow", progress);
  track.style.setProperty("--mission-fill", progress / max * 100 + "%");
  track.toggleAttribute("data-filled", progress * 2 >= max);
  track.querySelector("span").textContent = t2("missionTrackCount", missionProgress(progress, max));
  const button = row.querySelector(".mission-claim");
  button.textContent = t2("missionClaim");
  button.hidden = !claim;
  button.toggleAttribute("data-ncq-main", Boolean(claim) && !coinRewardDialog.open);
  button.disabled = missionClaiming;
  button.value = claim ?? "";
  const status = row.querySelector(".mission-status");
  status.hidden = Boolean(claim);
  status.textContent = t2(done ? "missionClaimed" : "missionInProgress");
}
async function claimMission(button) {
  if (missionClaiming || !missionDialog.open || !backend) return;
  const target = Number(button.value);
  const reward = missionRewards.get(target);
  if (!reward || serverWallet?.claimed?.includes(target)) return;
  const day = koreaDay2(Date.now());
  const restoreFocus = document.activeElement === button;
  missionClaiming = true;
  renderDailyMissions();
  try {
    const result = await remoteRequest((client) => client.gameRequest("/wallet/claim-mission", { day, target }));
    if (!applyWallet(result) || result.day !== day || !result.claimed?.includes(target)) {
      feedback("mission-feedback", result.error ?? "missionClaimFailed", true);
      void refreshWallet();
      return;
    }
    feedback("mission-feedback", "missionClaimSuccess");
    if (missionDialog.open) {
      showCoinReward(reward, `mission:${day}:${target}`, "missions");
    }
  } catch {
    feedback("mission-feedback", "missionClaimFailed", true);
  } finally {
    missionClaiming = false;
    renderCoinBalance();
    renderDailyMissions();
    if (shop.open) renderShop();
    if (restoreFocus && missionDialog.open && !coinRewardDialog.open) {
      (button.hidden ? el("mission-close") : button).focus({ preventScroll: true });
    }
  }
}
function renderCoinReward() {
  el("coin-reward-coins").textContent = t2("coinRewardCoins", { n: NcqLang.num(activeCoinReward.coins) });
  el("coin-reward-balance").textContent = NcqLang.num(coinBalance());
}
function showCoinReward(coins, receipt, source) {
  const id = (authSession?.player ?? "") + ":" + receipt;
  if (!Number.isSafeInteger(coins) || coins <= 0 || coinRewardReceipts.has(id)) return;
  coinRewardReceipts.add(id);
  coinRewardQueue.push({ coins, source, player: authSession?.player, receipt: id });
  presentCoinReward();
}
function presentCoinReward() {
  if (coinRewardDialog.open || !coinRewardQueue.length || adPurchaseBusy || document.hidden || room || archive || spectator) return;
  if ([...document.querySelectorAll("dialog[open]")].some((dialog) => dialog !== shop && dialog !== missionDialog)) return;
  while (coinRewardQueue.length) {
    const reward = coinRewardQueue.shift();
    if (reward.player !== authSession?.player || reward.source === "missions" && !missionDialog.open) continue;
    activeCoinReward = reward;
    renderCoinReward();
    coinRewardDialog.showModal();
    haptics.once("reward:" + reward.receipt, "success");
    render();
    el("coin-reward-title").focus();
    return;
  }
}
function scheduleMissionReset() {
  setTimeout(() => {
    dailyPuzzle.dayChanged();
    renderDailyMissions();
    void refreshWallet();
    scheduleMissionReset();
  }, dayMs - (Date.now() + koreaOffset) % dayMs);
}
function renderShop() {
  for (const button of shopMainActions) button.toggleAttribute("data-ncq-main", !coinShortageDialog.open && !coinRewardDialog.open && !shopPurchaseDialog.open);
  renderAdPurchase();
  renderCoinPacks();
  const skins = shopTab === "skins";
  for (const tab of shopTabs) {
    const active = shopTab === tab;
    el("shop-tab-" + tab).setAttribute("aria-pressed", String(active));
    el("shop-" + tab).hidden = !active;
  }
  shopAction.hidden = !skins;
  renderPlacementCards();
  setAppearanceTheme(el("appearance-preview"), shopPreview);
  applyPreviewPieceStyles(el("appearance-preview"), shopPreview.stones, room);
  for (const input of shopRadios) {
    input.checked = shopPreview[input.name] === input.value;
    input.disabled = shopSaving;
  }
  for (const { input, label, boardSample, status: status2, price: price2 } of skinCards) {
    const { name, value, checked } = input;
    label.title = input.nextElementSibling.textContent;
    const applied = shopState.appearance[name] === value;
    const owned = ownsSkin(shopState, name, value);
    label.toggleAttribute("data-locked", !owned);
    label.toggleAttribute("data-applied", applied);
    if (boardSample) boardSample.dataset.gridStyle = shopPreview.grid;
    status2.textContent = t2(!owned ? checked ? "shopSelectedLocked" : "shopLocked" : applied ? "shopApplied" : checked ? "shopSelected" : "shopOwned");
    price2.hidden = owned;
    price2.textContent = owned ? "" : t2("shopPrice", { n: NcqLang.num(skinPrices[name][value]) });
  }
  const { price } = shopPurchase(shopPreview, shopState);
  const changed = Object.keys(shopPreview).some((kind) => shopPreview[kind] !== shopState.appearance[kind]);
  const buying = price > 0;
  const enough = canAffordShop(price);
  shopAction.toggleAttribute("data-purchase", buying);
  shopAction.disabled = shopSaving || adPurchaseBusy || !buying && !changed;
  shopAction.textContent = buying ? t2("shopBuyPrice", { n: NcqLang.num(price) }) : t2("shopApply");
  const status = el("shop-feedback");
  status.classList.toggle("sr-only", skins);
  if (!status.hidden) status.textContent = t2(status.dataset.message);
  const guide = el("shop-preview-guide");
  guide.textContent = !status.hidden ? status.textContent : t2(buying ? enough ? "shopLockedPreview" : "shopNotEnough" : "shopPreviewGuide");
  guide.toggleAttribute("data-hint", status.hidden && !buying);
  guide.toggleAttribute("data-error", !status.hidden && status.hasAttribute("data-error"));
}
function renderPlacementCards() {
  clearTimeout(shopEffectTimer);
  shopEffectAction.hidden = shopTab !== "effects";
  if (shopEffectAction.hidden) return;
  const now = Date.now();
  const owned = Object.fromEntries(placementStyles.map((effect) => [effect, ownsPlacement(effect)]));
  const applied = owned[placementStyle] ? placementStyle : "plain";
  const selection = shopEffectPreview ?? applied;
  const timed = Boolean(placementEffects[selection].expiry) && !(selection === "sakura" && serverWallet?.sakuraOwned);
  const buying = !owned[selection] || timed && applied === selection;
  const price = placementEffects[selection].price;
  let refreshIn = Infinity;
  for (const { button, effect, status, time } of shopEffectOptions) {
    const selected2 = effect === selection;
    const isApplied = effect === applied;
    const locked = !owned[effect];
    button.setAttribute("aria-pressed", String(selected2));
    button.toggleAttribute("data-applied", isApplied);
    button.disabled = shopSaving;
    status.toggleAttribute("data-priced", locked);
    status.textContent = locked ? t2("shopPrice", { n: NcqLang.num(placementEffects[effect].price) }) : t2(isApplied ? "shopApplied" : selected2 ? "shopSelected" : effect === "plain" ? "shopEffectFree" : "shopOwned");
    if (time) {
      const remaining = placementUntil(effect) - now;
      time.hidden = remaining <= 0;
      if (remaining > 0) {
        const minutes = Math.ceil(remaining / 6e4);
        time.textContent = minutes < 60 ? t2("shopEffectMinutesLeft", { m: NcqLang.num(minutes) }) : t2("shopEffectHoursLeft", { h: NcqLang.num(Math.floor(minutes / 60)), m: NcqLang.num(minutes % 60) });
        refreshIn = Math.min(refreshIn, remaining % 6e4 || 6e4);
      }
    }
  }
  if (shop.open && Number.isFinite(refreshIn)) shopEffectTimer = setTimeout(renderPlacementCards, refreshIn);
  shopEffectAction.toggleAttribute("data-purchase", buying);
  shopEffectAction.disabled = shopSaving || adPurchaseBusy || !buying && selection === applied;
  const purchaseLabel = timed ? owned[selection] ? "shopExtendEffect" : "shopBuyEffect" : "shopBuyPrice";
  shopEffectAction.textContent = buying ? t2(purchaseLabel, { n: NcqLang.num(price) }) : t2("shopApply");
}
function playCoinBilling() {
  return Boolean(backend && NcqIap?.version >= 4 && NcqIap.status().mode === "googleplay");
}
async function refreshCoinCheckout() {
  if (!playCoinBilling()) return;
  const checkout = await remoteRequest((client) => client.gameRequest("/wallet/play-coins"));
  coinPacks = checkout.products ?? {};
  if (shop.open) renderCoinPacks();
}
function renderCoinPacks() {
  renderRewardAd();
  const list2 = el("shop-coin-pack-buttons");
  const products = playCoinBilling() ? Object.entries(NcqIap.status().products) : [];
  const available = products.flatMap(([id, product]) => {
    const coins = coinPacks[product.id];
    if (product.type !== "consumable" || !Number.isInteger(coins) || !NcqIap.can(id)) return [];
    const price = NcqIap.price(id);
    return price ? [{ id, productId: product.id, coins, price }] : [];
  }).sort((a, b) => a.coins - b.coins);
  const catalog = JSON.stringify([NcqLang.lang, available]);
  if (list2.dataset.catalog !== catalog) {
    const cards = available.map(({ id, productId, coins, price }, index2) => {
      const card = el("shop-coin-pack-card").content.firstElementChild.cloneNode(true);
      const n = NcqLang.num(coins);
      card.dataset.tier = Math.min(index2, 2);
      card.querySelector(".shop-coin-quantity").textContent = t2("shopPrice", { n });
      const buy = card.querySelector("button");
      buy.textContent = price;
      buy.setAttribute("aria-label", t2("shopCoinPackPrice", { n, price }));
      buy.addEventListener("click", () => buyCoinPack(id, productId, coins));
      return card;
    });
    list2.replaceChildren(...cards);
    list2.dataset.catalog = catalog;
  }
  for (const button of list2.querySelectorAll("button")) button.disabled = adPurchaseBusy || shopSaving;
  const claim = el("shop-claim-test-coins");
  claim.hidden = !canClaimTestCoins;
  claim.disabled = testCoinClaiming;
  el("shop-no-coin-packs").hidden = available.length > 0;
  const debt = serverWallet?.refundDebt ?? 0;
  el("shop-refund-debt").hidden = debt <= 0;
  if (debt > 0) el("shop-refund-debt").textContent = t2("shopCoinRefundDebt", { n: NcqLang.num(debt) });
}
function renderRewardAd() {
  const { status, busy: busy2, retry } = rewardedCoins.state;
  const card = el("shop-ad-coins");
  card.hidden = !backend || !NcqAds?.can("COINS");
  if (card.hidden) return;
  el("shop-ad-coins-count").textContent = status ? t2("rewardAdRemaining", { n: NcqLang.num(status.remaining), max: NcqLang.num(status.limit) }) : t2("rewardAdChecking");
  const button = el("shop-watch-ad-coins");
  button.disabled = busy2 || adPurchaseBusy || shopSaving || !status || !retry && status.remaining <= 0;
  button.textContent = t2(busy2 ? "rewardAdWatching" : retry ? "rewardAdRetry" : status?.remaining === 0 ? "rewardAdDone" : "rewardAdWatch");
}
function renderAdPurchase() {
  const store2 = NcqIap?.status();
  const sellable = store2?.ready && NcqIap.can("REMOVE_ADS");
  const price = sellable ? NcqIap.price("REMOVE_ADS") : "";
  const canRestore = adsRemoved || store2 && (store2.mode === "simulate" || store2.mode !== "off" && store2.products.REMOVE_ADS?.on);
  const offer = el("shop-remove-ads");
  const hideOffer = adsRemoved || !price;
  if (hideOffer && offer.contains(document.activeElement)) {
    el("shop-tab-" + shopTab).focus({ preventScroll: true });
  }
  offer.hidden = hideOffer;
  const buy = el("shop-buy-remove-ads");
  buy.disabled = adPurchaseBusy || shopSaving;
  buy.setAttribute("aria-label", t2("shopRemoveAdsBuy", { price }));
  el("shop-remove-ads-price").textContent = price;
  el("shop-restore-ads").hidden = !canRestore;
  el("restore-purchases").hidden = !canRestore;
  el("shop-restore-ads").disabled = el("restore-purchases").disabled = adPurchaseBusy || shopSaving;
  const status = el("restore-feedback");
  if (!status.hidden) status.textContent = t2(status.dataset.message);
}
function refreshAdPurchase() {
  if (shop.open) renderShop();
  else renderAdPurchase();
}
function showGameBanner() {
  if (adsRemoved || !NcqAds?.can("BANNER")) return;
  void NcqAds.banner("BANNER", { position: "top" }).catch(() => {
  });
}
function enableAdRemoval() {
  if (adsRemoved) return;
  adsRemoved = true;
  NcqAds?.hideBanner().catch(() => {
  });
  refreshAdPurchase();
}
async function initializeAdPurchase() {
  if (NcqIap) {
    NcqIap.onGrant(async (id, info) => {
      if (id === "REMOVE_ADS") {
        enableAdRemoval();
        return true;
      }
      const product = NcqIap.status().products[id];
      if (product?.type !== "consumable" || !playCoinBilling() || info?.test || !info?.purchaseToken) return false;
      const next = await remoteRequest((client) => client.gameRequest("/wallet/play-coins", {
        productId: product.id,
        purchaseToken: info.purchaseToken
      }));
      if (!applyWallet(next)) return false;
      render();
      const reward = next.purchaseReward;
      if (/^[a-f0-9]{64}$/.test(reward?.id ?? "")) {
        showCoinReward(reward.coins, "purchase:" + reward.id, "shop");
      }
      return true;
    });
    void NcqIap.ready().then(refreshAdPurchase, refreshAdPurchase);
    try {
      if (await NcqIap.owned("REMOVE_ADS")) enableAdRemoval();
    } catch {
    }
  }
  showGameBanner();
  refreshAdPurchase();
}
function showShopPurchase(message, values) {
  el("shop-purchase-message").textContent = t2(message, values);
  shopPurchaseDialog.showModal();
  haptics.once("purchase:" + ++purchaseNotice, "success");
  render();
}
function showCoinShortage() {
  if (coinShortageDialog.open) return;
  coinShortageDialog.returnValue = "";
  coinShortageDialog.showModal();
  render();
}
async function withShopCheckout(checkout) {
  if (adPurchaseBusy || shopSaving) return;
  adPurchaseBusy = true;
  feedback("shop-feedback");
  const content = shop.querySelector(".shop-content");
  const scrollTop = content.scrollTop;
  const shell = document.querySelector(".shell");
  shop.close();
  haptics.stop();
  shell.inert = true;
  let purchaseMessage;
  try {
    await adOwnershipReady;
    purchaseMessage = await checkout();
  } finally {
    shell.inert = false;
    adPurchaseBusy = false;
    shop.showModal();
    render();
    content.scrollTop = scrollTop;
  }
  if (purchaseMessage === "shopCoinPurchaseDone" && (coinRewardDialog.open || coinRewardQueue.length)) presentCoinReward();
  else if (purchaseMessage) showShopPurchase(purchaseMessage);
  else presentCoinReward();
}
async function buyRemoveAds() {
  if (adsRemoved || !NcqIap?.can("REMOVE_ADS")) return;
  await withShopCheckout(async () => {
    if (adsRemoved) return;
    try {
      const result = await NcqIap.buyOnce("REMOVE_ADS");
      if (result.ok) return "shopRemoveAdsActivated";
      if (["PENDING", "CHECKING"].includes(result.code)) feedback("shop-feedback", "shopRemoveAdsPending");
      else if (result.code !== "USER_CANCELED") feedback("shop-feedback", "shopRemoveAdsFailed", true);
    } catch {
      feedback("shop-feedback", "shopRemoveAdsFailed", true);
    }
  });
}
async function buyCoinPack(id, productId, displayedCoins) {
  if (!playCoinBilling() || !NcqIap.can(id)) return;
  await withShopCheckout(async () => {
    try {
      const checkout = await remoteRequest((client) => client.gameRequest("/wallet/play-coins"));
      const { accountTag } = checkout;
      coinPacks = checkout.products ?? {};
      if (!/^[a-f0-9]{64}$/.test(accountTag ?? "") || coinPacks[productId] !== displayedCoins) {
        feedback("shop-feedback", "shopCoinPurchaseFailed", true);
        return;
      }
      const result = await NcqIap.buy(id, { appAccountToken: accountTag });
      if (result.ok) return "shopCoinPurchaseDone";
      if (["PENDING", "CHECKING", "NOT_GRANTED"].includes(result.code)) feedback("shop-feedback", "shopCoinPurchasePending");
      else if (result.code !== "USER_CANCELED") feedback("shop-feedback", "shopCoinPurchaseFailed", true);
    } catch {
      feedback("shop-feedback", "shopCoinPurchaseFailed", true);
    }
  });
}
async function restoreAdPurchase(statusId) {
  if (adPurchaseBusy || !NcqIap) return;
  adPurchaseBusy = true;
  feedback(statusId);
  refreshAdPurchase();
  try {
    await adOwnershipReady;
    const result = await NcqIap.restore();
    if (!result.ok) {
      feedback(statusId, "purchaseRestoreFailed", true);
    } else if (result.restored.includes("REMOVE_ADS")) {
      feedback(statusId, "purchaseRestored");
    } else {
      if (adsRemoved && !await NcqIap.owned("REMOVE_ADS")) {
        adsRemoved = false;
        showGameBanner();
      }
      feedback(statusId, adsRemoved ? "purchaseRestored" : "purchaseRestoreEmpty");
    }
  } catch {
    feedback(statusId, "purchaseRestoreFailed", true);
  } finally {
    adPurchaseBusy = false;
    refreshAdPurchase();
  }
}
async function saveShopSelection(buy) {
  if (shopSaving || adPurchaseBusy) return;
  const selection = { ...shopPreview };
  shopSaving = true;
  feedback("shop-feedback");
  renderShop();
  const save = async () => {
    const state = loadShopState(shopState);
    shopState = state;
    const { skins, price } = shopPurchase(selection, state);
    if (buy && (!backend || !serverWallet)) {
      feedback("shop-feedback", "network", true);
      return;
    }
    if (buy && price > 0 && !canAffordShop(price)) {
      showCoinShortage();
      return;
    }
    if (buy && price > 0) {
      const result = await remoteRequest((client) => client.gameRequest("/wallet/buy-skins", { skins }));
      if (applyWallet(result)) return skins;
      if (result.error === "coinNotEnough") {
        showCoinShortage();
        void refreshWallet();
      } else feedback("shop-feedback", result.error ?? "shopSaveFailed", true);
      return;
    }
    if (price) {
      shopState = state;
      return;
    }
    const next = { ...state, appearance: selection };
    try {
      persistShopState(next);
      if (!buy) feedback("shop-feedback", "shopApplied");
    } catch {
      if (buy) {
        feedback("shop-feedback", "shopSaveFailed", true);
        return;
      }
      feedback("shop-feedback", "shopAppliedTemporarily");
    }
    shopState = next;
    if (buy) return skins;
  };
  try {
    const purchased = await updateShop(save);
    if (purchased?.length) {
      const items = skinCards.filter(({ input }) => purchased.includes(`${input.name}:${input.value}`)).map(({ input }) => input.nextElementSibling.textContent).join(" \xB7 ");
      showShopPurchase("shopPurchased", { items });
    }
  } catch {
    feedback("shop-feedback", "shopSaveFailed", true);
  } finally {
    shopSaving = false;
    applyAppearance();
    renderCoinBalance();
    if (shop.open) renderShop();
  }
}
async function buyPlacementEffect(effect) {
  if (shopSaving || adPurchaseBusy || !placementEffects[effect]?.price) return;
  if (!backend || !serverWallet) {
    feedback("shop-feedback", "network", true);
    return;
  }
  const { price, purchased: message } = placementEffects[effect];
  shopSaving = true;
  feedback("shop-feedback");
  renderShop();
  try {
    const purchased = await updateShop(async () => {
      if (coinBalance() < price) {
        showCoinShortage();
        return;
      }
      effectPurchaseIds[effect] ??= crypto.randomUUID();
      const path = effect === "golden" ? "/wallet/buy-effect" : "/wallet/buy-placement";
      const data = { requestId: effectPurchaseIds[effect], effect };
      const result = await remoteRequest((client) => client.gameRequest(path, data));
      if (!applyWallet(result)) {
        if (result.error !== "network") delete effectPurchaseIds[effect];
        if (result.error === "coinNotEnough") {
          showCoinShortage();
          void refreshWallet();
        } else feedback("shop-feedback", result.error ?? "shopSaveFailed", true);
        return;
      }
      delete effectPurchaseIds[effect];
      setPlacementStyle(effect);
      return true;
    });
    if (purchased) showShopPurchase(message);
  } catch {
    feedback("shop-feedback", "shopSaveFailed", true);
  } finally {
    shopSaving = false;
    renderCoinBalance();
    if (shop.open) renderShop();
  }
}
async function recordMissionRound(game) {
  if (!game.moves.length || ["resign", "disconnect", "timeout"].includes(game.endReason) && game.moves.length < 6) return;
  if (game.mode === "tournament") void refreshWeeklyRewards(-1);
  return refreshWallet(-1);
}
function unlockPlacementAudio() {
  if (!stoneSoundToggle.checked || document.hidden) return;
  const Audio = window.AudioContext ?? window.webkitAudioContext;
  if (!Audio) return;
  try {
    placementAudio ??= new Audio();
    if (placementAudio.state !== "running") placementAudio.resume().catch(() => {
    });
    placementBuffer ??= fetch(new URL("./assets/match-ui/stone-on-wood.wav", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("Placement sound unavailable");
      return response.arrayBuffer();
    }).then((data) => placementAudio.decodeAudioData(data)).catch(() => {
      placementBuffer = null;
      return null;
    });
  } catch {
  }
}
function stopPlacementSound() {
  placementSoundCue += 1;
  if (!activePlacementSound) return;
  activePlacementSound.stop();
  activePlacementSound = null;
}
async function playPlacementSound(delay) {
  if (!stoneSoundToggle.checked || document.hidden || !placementBuffer) return;
  const audio = placementAudio;
  const cue = placementSoundCue;
  const contact = audio.currentTime + delay;
  const buffer = await placementBuffer;
  if (!buffer || cue !== placementSoundCue || !stoneSoundToggle.checked || document.hidden || audio.state !== "running") return;
  if (audio.currentTime > contact + 0.1) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.addEventListener("ended", () => {
    source.disconnect();
    if (activePlacementSound === source) activePlacementSound = null;
  }, { once: true });
  source.start(Math.max(contact, audio.currentTime));
  activePlacementSound = source;
}
function cancelPlacement() {
  stopPlacementSound();
  cancelLandingHaptic?.();
  cancelLandingHaptic = void 0;
  activePlacementEffect?.remove();
  activePlacementEffect = null;
  if (!activePlacement) return;
  const { cell, animation } = activePlacement;
  activePlacement = null;
  animation.cancel();
  cell.classList.remove("placing");
}
function addSakuraParticles(burst, unit) {
  const random = (min, max) => min + Math.random() * (max - min);
  const phase = random(0, 2 * Math.PI);
  const flowers = 3;
  const petals = 12;
  for (let i = 0; i < flowers + petals; i += 1) {
    const flower = i < flowers;
    const slot = flower ? i : i - flowers;
    const count = flower ? flowers : petals;
    const angle = phase + (slot + random(0.08, 0.92)) * 2 * Math.PI / count;
    const distance = unit * (flower ? random(0.97, 1.42) : random(1.55, 2.65));
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const drift = random(-0.33, 0.33) * unit;
    const spin = random(-195, 195);
    const rotation = random(0, 360);
    const particle = document.createElement("span");
    particle.className = flower ? "sakura-particle sakura-flower" : "sakura-particle";
    const properties = {
      "size": `${(unit * (flower ? random(0.68, 0.89) : random(0.27, 0.56))).toFixed(1)}px`,
      "start": `${rotation.toFixed(0)}deg`,
      "middle": `translate(${(x * 0.69 + drift).toFixed(1)}px, ${(y * 0.69).toFixed(1)}px) rotate(${(rotation + spin * 0.45).toFixed(0)}deg)`,
      "end": `translate(${x.toFixed(1)}px, ${(y + unit * random(0.14, 0.47)).toFixed(1)}px) rotate(${(rotation + spin).toFixed(0)}deg)`
    };
    for (const [name, value] of Object.entries(properties)) particle.style.setProperty(`--sakura-${name}`, value);
    burst.append(particle);
  }
}
function addEnergyParticles(burst, unit, style) {
  const random = (min, max) => min + Math.random() * (max - min);
  const water = style === "ripple";
  const phase = random(0, 2 * Math.PI);
  const count = water ? 18 : 20;
  for (let i = 0; i < count; i += 1) {
    const angle = phase + (i + random(0.1, 0.9)) * 2 * Math.PI / count;
    const distance = unit * random(1.3, 2.5);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.58;
    const curl = unit * random(-0.7, 0.7);
    const rise = unit * random(0.25, water ? 0.9 : 1.5);
    const particle = document.createElement("span");
    particle.className = "energy-particle" + (!water && i % 4 === 0 ? " energy-star" : "");
    const properties = {
      size: `${(unit * random(water ? 0.09 : 0.07, water ? 0.2 : 0.19)).toFixed(1)}px`,
      start: `translate(${(Math.cos(angle) * unit * 0.38).toFixed(1)}px, ${(Math.sin(angle) * unit * 0.2).toFixed(1)}px)`,
      middle: `translate(${(x * 0.6 + curl).toFixed(1)}px, ${(y * 0.55 - rise).toFixed(1)}px)`,
      end: `translate(${x.toFixed(1)}px, ${(y + (water ? unit * 0.3 : -rise)).toFixed(1)}px)`,
      rotation: `${Math.round(random(0, 360))}deg`
    };
    for (const [name, value] of Object.entries(properties)) particle.style.setProperty(`--energy-${name}`, value);
    burst.append(particle);
  }
  const waves = water ? 3 : 2;
  for (let i = 0; i < waves; i += 1) {
    const wave = document.createElement("span");
    wave.className = water ? "energy-ring" : "energy-wisp";
    wave.style.setProperty("--energy-wave-offset", String(i * 0.14));
    wave.style.setProperty("--energy-wave-turn", `${i * 96 + random(-15, 15)}deg`);
    burst.append(wave);
  }
}
function trackPlacementAnimation(element, name, duration) {
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  const done = () => {
    clearTimeout(timer);
    element.removeEventListener("animationend", ended);
    element.removeEventListener("animationcancel", ended);
    finish();
  };
  const ended = (event) => {
    if (event.target === element && event.animationName === name) done();
  };
  const timer = setTimeout(done, duration + 100);
  element.addEventListener("animationend", ended);
  element.addEventListener("animationcancel", ended);
  return { finished, cancel: done };
}
function playPlacementEffect(cell, style, contactTime, landingTime = placementTiming.landing) {
  const effect = document.createElement("span");
  const sakura = style === "sakura";
  const energy = style === "ripple" || style === "mystic";
  const effectClass = sakura ? "sakura-placement-burst" : energy ? "energy-placement-burst" : "golden-placement-wave";
  const animationName = sakura ? "sakura-burst" : energy ? "energy-burst" : "golden-wave-spread";
  effect.className = "placement-effect " + effectClass;
  effect.dataset.effect = style;
  effect.setAttribute("aria-hidden", "true");
  effect.style.setProperty("--placement-contact-delay", `${contactTime}ms`);
  effect.style.setProperty("--placement-effect-duration", `${landingTime * placementTiming.effectRatio}ms`);
  if (sakura) addSakuraParticles(effect, cell.clientWidth);
  if (energy) addEnergyParticles(effect, cell.clientWidth, style);
  cell.append(effect);
  const animation = trackPlacementAnimation(effect, animationName, contactTime + landingTime * placementTiming.effectRatio);
  activePlacementEffect = effect;
  return animation.finished.catch(() => {
  }).finally(() => {
    effect.remove();
    if (activePlacementEffect === effect) activePlacementEffect = null;
  });
}
function previewPlacementEffect(button, style) {
  for (const preview2 of shop.querySelectorAll(".shop-effect-preview")) preview2.remove();
  if (style === "plain" || reducedMotion.matches) return;
  const preview = document.createElement("span");
  preview.className = "shop-effect-preview";
  button.querySelector(".shop-effect-art").append(preview);
  void Promise.resolve(playPlacementEffect(preview, style, 0)).finally(() => preview.remove());
}
function presentPlacement(index2, style, landingHaptic, from) {
  if (index2 == null || document.hidden) return;
  const cell = cells[index2];
  if (!cell || !["1", "2"].includes(cell.dataset.stone) || cell.classList.contains("selected")) return;
  cancelPlacement();
  if (reducedMotion.matches) {
    playPlacementSound(0);
    landingHaptic?.(0);
    return;
  }
  const landingTime = !el("placement-timing").hidden && placementTimingAvailable() ? replayPlacementDuration : placementTiming.landing;
  cell.classList.add("placing");
  const moving = Number.isInteger(from) && cells[from] && from !== index2;
  const contactTime = moving ? jangiMoveTiming(landingTime).contact : landingTime * 0.4;
  const options = {
    duration: landingTime,
    landing: landingTime,
    shouldContinue: () => !document.hidden && !cell.classList.contains("selected") && cell.dataset.stone !== "0",
    onStart() {
      playPlacementSound(contactTime / 1e3);
      cancelLandingHaptic = landingHaptic?.(contactTime);
      if (placementEffects[style]?.price) void playPlacementEffect(cell, style, contactTime, landingTime);
    }
  };
  const animation = moving ? animateJangiMove(cells[from], cell, lastMoveMarker, options) : animateStonePlacement(cell, lastMoveMarker, options);
  activePlacement = { cell, animation };
  return animation.finished.catch(() => {
  }).finally(() => {
    if (activePlacement?.animation !== animation) return;
    activePlacement = null;
    cell.classList.remove("placing");
  });
}
function presentRoundPlacement(game, ply, movingSeat) {
  const landingHaptic = movingSeat == null ? void 0 : (delay) => haptics.once(
    `move:${roundHapticKey(game)}:${ply}`,
    movingSeat === game.you ? "medium" : "light",
    { delay, valid: () => room?.code === game.code && room.round === game.round && !archive && !spectator }
  );
  return presentPlacement(destination(game.moves[ply]), game.placementStyles?.[game.moveSeats?.[ply] - 1], landingHaptic, game.moves[ply]?.from);
}
function coordinate(index2) {
  return columns[index2 % size] + (Math.floor(index2 / size) + 1);
}
function canAct() {
  return room?.phase === "playing" && room.turn === room.you && connected && !busy && !pendingPlacement && !matchIntroDialog.open && !leaveDialog.open && !bikjangDialog.open && !optionsDialog.open && !window.NcqFeedback?.isOpen() && (turnDeadline === null || performance.now() < turnDeadline);
}
function activeRule() {
  if (!el("choose-rule")) return defaultRule;
  if (availableRules.includes(preferredRule)) return preferredRule;
  return availableRules.includes(defaultRule) ? defaultRule : "free";
}
function renderRulePicker(mainAction) {
  const button = el("choose-rule");
  if (!button || !ruleDialog) return;
  button.disabled = busy || Boolean(matchmaking) || availableRules.length < 2;
  button.toggleAttribute("data-ncq-main", mainAction && lobbyView === "lobby" && availableRules.length > 1);
  const rule = activeRule();
  el("selected-rule").textContent = t2(rule === "taraguchi" ? "ruleTaraguchiShort" : ruleNames[rule]);
  button.setAttribute("aria-label", t2("currentRule", { rule: t2(ruleNames[rule]) }));
  for (const option of ruleDialog.querySelectorAll(".rule-option")) {
    option.hidden = !availableRules.includes(option.value);
    option.setAttribute("aria-pressed", String(option.value === rule));
  }
}
function openingStatus(game) {
  if (game.opening === "offerFive") return t2("offerProgress", { n: game.offers.length, total: offerCount });
  if (game.opening === "pickFive") return t2("pickFifth");
  const radius = openingRadius(game);
  const color = t2(colorName(game.stone));
  return radius === null ? t2("openingStone", { color, n: game.moves.length + 1 }) : t2("openingInArea", { color, n: game.moves.length + 1, size: radius * 2 + 1 });
}
function seatColor(game, seat) {
  return seat === (game?.black ?? 1) ? 1 : 2;
}
function colorName(color) {
  return color === 1 ? "black" : "white";
}
function sideName(game, seat) {
  return t2(colorName(seatColor(game, seat)));
}
function matchMode(game) {
  return game.mode === "tournament" ? "weeklyTournament" : "casualMatch";
}
function recordModeLabel(game) {
  return t2(matchMode(game));
}
function moveColor(game, ply) {
  return game.moveColors?.[ply] ?? ply % 2 + 1;
}
function clockDeadline(game) {
  if (game.clock?.kind === "cumulative-v1") {
    const end = game.setup ? game.formationEndsAt : game.turnEndsAt;
    return game.phase === "playing" && Number.isFinite(end) && Number.isFinite(game.serverNow) ? performance.now() + Math.max(0, end - game.serverNow) : null;
  }
  return game.phase === "playing" && game.turnSeconds > 0 && Number.isFinite(game.turnEndsAt) && Number.isFinite(game.serverNow) ? performance.now() + Math.max(0, game.turnEndsAt - game.serverNow) : null;
}
function updateTurnClock(now, deadline, secondsPerTurn, ownTurn, watching) {
  const remaining = Math.max(0, deadline - now);
  if (!watching && ownTurn && room?.phase === "playing") {
    haptics.clock(
      `${roundHapticKey(room)}:${room.moves.length}:${room.turn}`,
      remaining,
      connected && !matchIntroDialog.open && !leaveDialog.open && !profileDialog.open
    );
  }
  const activeClock = ownTurn ? ownClock : opponentClock;
  const progress = ownTurn ? ownProgress : opponentProgress;
  const secondsLeft = Math.ceil(remaining / 1e3);
  const seconds = String(secondsLeft).padStart(2, "0");
  activeClock.toggleAttribute("data-urgent", secondsLeft <= 10);
  activeClock.closest(".match-player").toggleAttribute("data-low", secondsLeft <= 10);
  if (activeClock.textContent !== seconds) {
    activeClock.getAnimations().forEach((animation) => animation.cancel());
    activeClock.textContent = seconds;
  }
  renderTimeGauge(progress, remaining, secondsPerTurn * 1e3);
  if (remaining > 0) {
    turnFrame = requestAnimationFrame((time) => updateTurnClock(time, deadline, secondsPerTurn, ownTurn, watching));
  } else if (!watching) {
    if (bikjangDialog.open) bikjangDialog.close("cancel");
    const place = el("place");
    place.dataset.placementState = "inactive";
    el("place-state").textContent = t2("jangiClockUpdating");
    board.classList.remove("selectable");
    for (const cell of cells) cell.setAttribute("aria-disabled", "true");
  }
}
function resetTurnGauge(clock, progress, text) {
  clock.getAnimations().forEach((animation) => animation.cancel());
  clock.textContent = text;
  clock.removeAttribute("data-urgent");
  clock.removeAttribute("data-byoyomi");
  clock.closest(".match-player").removeAttribute("data-low");
  renderTimeGauge(progress, null);
}
function renderTimeGauge(progress, remainingMs, totalMs = 3e5) {
  const track = progress.parentElement;
  const seconds = Math.max(0, Math.ceil((remainingMs ?? 0) / 1e3));
  progress.style.setProperty("--match-art-progress", String(Math.max(0, Math.min(100, (remainingMs ?? 0) / totalMs * 100))));
  track.setAttribute("aria-valuemax", String(totalMs / 1e3));
  track.setAttribute("aria-valuenow", String(Math.min(totalMs / 1e3, seconds)));
  track.setAttribute("aria-valuetext", remainingMs === null ? "\u2014" : clockText(remainingMs));
}
function renderClockRefills(node, count) {
  node.hidden = false;
  const label = t2("jangiClockRefills", { count });
  node.setAttribute("aria-label", label);
  node.title = label;
  if (!node.children.length) node.innerHTML = Array.from({ length: 3 }, () => '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 1h10M3 19h10M4 2v3c0 2 2 3 4 5-2 2-4 3-4 5v3m8-16v3c0 2-2 3-4 5 2 2 4 3 4 5v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m5 5 3 3 3-3zm0 12h6l-3-3z" fill="currentColor"/></svg>').join("");
  for (const [index2, icon] of [...node.children].entries()) icon.toggleAttribute("data-used", index2 >= count);
}
function updateCumulativeClock(game, deadline, lowerSeat, watching) {
  const finalEnd = game.setup ? game.formationEndsAt : game.turnEndsAt;
  const status = clockStatus(game, finalEnd - (deadline - performance.now()));
  for (const [side, seat, clock, progress] of [
    ["own", lowerSeat, ownClock, ownProgress],
    ["opponent", 3 - lowerSeat, opponentClock, opponentProgress]
  ]) {
    const active = game.turn === seat;
    const remaining = status.formation ? active ? status.formationMs : null : status.remainingMs[seat - 1];
    clock.textContent = remaining === null ? "\u2014" : clockText(remaining);
    clock.toggleAttribute("data-byoyomi", !status.formation && remaining <= 3e4);
    el(side + "-panel").toggleAttribute("data-low", !status.formation && remaining <= 3e4);
    clock.removeAttribute("data-urgent");
    el(side + "-refills").hidden = status.formation;
    if (!status.formation) renderClockRefills(el(side + "-refills"), status.refills[seat - 1]);
    renderTimeGauge(progress, remaining, status.formation ? 2e4 : 3e5);
    if (!status.formation && active && !watching && seat === game.you) {
      haptics.clock(
        `${roundHapticKey(game)}:${game.moves.length}:${seat}:${status.refills[seat - 1]}`,
        remaining,
        connected && !matchIntroDialog.open && !leaveDialog.open && !profileDialog.open
      );
    }
  }
  const formationClock = el("jangi-formation-clock");
  formationClock.hidden = !status.formation;
  if (status.formation) formationClock.textContent = t2("jangiFormationCountdown", { seconds: Math.ceil(status.formationMs / 1e3) });
  if (!status.expired) turnFrame = requestAnimationFrame(() => updateCumulativeClock(game, deadline, lowerSeat, watching));
  else if (!watching && !status.formation) {
    if (bikjangDialog.open) bikjangDialog.close("cancel");
    el("place").dataset.placementState = "inactive";
    el("place-state").textContent = t2("jangiClockUpdating");
    board.classList.remove("selectable");
    for (const cell of cells) cell.setAttribute("aria-disabled", "true");
  }
}
function ownNickname() {
  return displayNickname(nicknameOverride || playerNickname || t2("guestNickname"));
}
function renderMaterialPoints(game, displayedBoard) {
  const points = material(displayedBoard);
  const lowerSeat = spectator ? game.black ?? 1 : game.you;
  for (const [side, seat] of [["own", lowerSeat], ["opponent", 3 - lowerSeat]]) {
    const value = NcqLang.num(points[seatColor(game, seat)], { maximumFractionDigits: 1 });
    for (const id of [side + "-material", "review-" + side + "-material"]) {
      el(id).textContent = t2("jangiMaterialPoints", { points: value });
      el(id).setAttribute("aria-label", t2("jangiMaterialLabel", { points: value }));
    }
  }
}
function renderPlayers(game, showPanels, watching = false) {
  cancelAnimationFrame(turnFrame);
  for (const side of ["own", "opponent"]) el(side + "-refills").hidden = true;
  el("jangi-formation-clock").hidden = true;
  for (const id of ["opponent-panel", "own-panel"]) el(id).hidden = !showPanels;
  el("live-actions").hidden = !showPanels || watching || el("opening-actions").hidden;
  for (const id of ["opponent-profile", "own-profile"]) el(id).disabled = watching || game.phase === "finished";
  const reviewing = !showPanels && game.phase === "finished";
  el("player-bar").hidden = showPanels || reviewing;
  if (reviewing) return;
  if (!showPanels) {
    for (const [color, seat] of [["black", 1], ["white", 2]]) {
      const profile = recordPlayer(game, seat);
      el(color + "-player-label").textContent = game.you === seat ? ownNickname() : profile.name;
      el(color + "-profile").disabled = game.phase === "waiting" && game.you !== seat;
      const stone = el(color + "-profile").querySelector(".stone");
      if (stone) stone.dataset.stoneStyle = pieceStyleForSeat(game, seat, shopState.appearance.stones);
    }
    return;
  }
  const lowerSeat = watching ? game.black ?? 1 : game.you;
  const deadline = watching ? spectator.deadline : turnDeadline;
  const live = game.phase === "playing" && (!watching || !spectator.closed && !spectator.reconnecting);
  const ownTurn = live && game.turn === lowerSeat;
  const opponentTurn = live && !ownTurn;
  el("own-panel").dataset.active = el("place").dataset.active = String(ownTurn);
  el("opponent-panel").dataset.active = el("opponent-timer").dataset.active = String(opponentTurn);
  for (const [side, seat] of [["own", lowerSeat], ["opponent", 3 - lowerSeat]]) {
    const active = side === "own" ? ownTurn : opponentTurn;
    const badge = el(side === "own" ? "place-text" : "opponent-turn");
    badge.textContent = t2(game.setup && live ? active ? "jangiFormationActive" : "jangiFormationWaiting" : active ? watching ? "turnActive" : side === "own" ? "jangiOwnTurn" : "jangiOpponentTurn" : "turnWaiting");
    const color = colorName(seatColor(game, seat));
    const profile = recordPlayer(game, seat);
    const nickname = watching ? profile.savedName || t2(color) : side === "own" ? ownNickname() : profile.name;
    el(side + "-nickname").textContent = nickname;
    el(side + "-nickname").title = nickname;
    if (!watching && side === "own") renderOwnRank();
    else {
      const rank = recordRank(profile) || (!watching && game.botLevel != null ? rankName(game.botLevel) : "");
      el(side + "-rank").hidden = !rank;
      el(side + "-rank").textContent = rank;
    }
    const stone = el(side + "-stone");
    stone.className = "stone " + color;
    stone.dataset.stoneStyle = pieceStyleForSeat(game, seat, shopState.appearance.stones);
    stone.setAttribute("aria-label", t2(color));
  }
  for (const id of ["place-gauge", "opponent-gauge", "own-clock", "opponent-clock"]) el(id).hidden = false;
  if (live && deadline !== null && isCumulativeClock(game)) {
    updateCumulativeClock(game, deadline, lowerSeat, watching);
    return;
  }
  if (!live || deadline === null) {
    for (const [seat, clock, progress] of [[lowerSeat, ownClock, ownProgress], [3 - lowerSeat, opponentClock, opponentProgress]]) {
      resetTurnGauge(clock, progress, "\u2014");
      if (isCumulativeClock(game)) {
        const remaining = game.clock.remainingMs[seat - 1];
        clock.textContent = clockText(remaining);
        clock.toggleAttribute("data-byoyomi", remaining <= 3e4);
        clock.closest(".match-player").toggleAttribute("data-low", remaining <= 3e4);
        renderTimeGauge(progress, remaining);
        renderClockRefills(el((seat === lowerSeat ? "own" : "opponent") + "-refills"), game.clock.refills[seat - 1]);
      }
    }
    return;
  }
  const idleClock = ownTurn ? opponentClock : ownClock;
  const idleProgress = ownTurn ? opponentProgress : ownProgress;
  resetTurnGauge(idleClock, idleProgress, String(Math.ceil(game.turnSeconds)).padStart(2, "0"));
  renderTimeGauge(idleProgress, game.turnSeconds * 1e3, game.turnSeconds * 1e3);
  updateTurnClock(performance.now(), deadline, game.turnSeconds, ownTurn, watching);
}
function feedback(id, message = "", error = false) {
  const node = el(id);
  node.dataset.message = message;
  node.toggleAttribute("data-error", error);
  node.hidden = !message;
  node.textContent = message ? t2(message) : "";
}
function loadRecords(key = recordsScope) {
  if (key === recordsScope && recordHistory) return recordHistory.list();
  return legacyRecords(key);
}
function legacyRecords(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function bindRecordHistory(player, cloud) {
  if (recordHistory?.player === player) return;
  recordHistory?.dispose();
  recordHistory = createRecordHistory(window.NcqSave, {
    player,
    cloud,
    legacy: legacyRecords(recordsScope),
    changed: () => {
      records = loadRecords();
      if (lobbyView === "records") renderRecords();
    }
  });
  records = loadRecords();
  const history2 = recordHistory;
  void history2?.ready().then(() => cloud && importLegacyRecords(history2));
}
async function importLegacyRecords(history2) {
  const imported = await remoteRequest((client) => client.gameRequest("/legacy-records", void 0, -1));
  if (recordHistory !== history2 || !Array.isArray(imported)) return;
  for (const game of imported) {
    if (history2.add(game)) acknowledgeRecord(game);
  }
  records = loadRecords();
  if (lobbyView === "records") renderRecords();
}
function saveRecord(game, refresh = true) {
  const snapshot = recordSnapshot(game, Boolean(backend));
  if (!snapshot) return false;
  if (recordHistory) {
    const saved = recordHistory.add(snapshot);
    if (refresh) records = loadRecords();
    return saved;
  }
  const existing = new Map([...records, ...loadRecords()].map((record) => [record.id, record]));
  existing.set(snapshot.id, snapshot);
  records = [...existing.values()].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  try {
    localStorage.setItem(recordsScope, JSON.stringify(records));
    return true;
  } catch {
  }
  return false;
}
function acknowledgeRecord(game) {
  if (!backend || !game.recordDetail || !authSession?.player) return;
  const key = authSession.player + ":" + game.code + ":" + game.round;
  if (recordReceipts.has(key)) return;
  recordReceipts.add(key);
  void remoteRequest((client) => client.gameRequest("/record-receipts/" + game.code + "/" + game.round, {})).then((result) => {
    if (result.error) recordReceipts.delete(key);
  }).catch(() => recordReceipts.delete(key));
}
function describeOutcome(game) {
  return !game.winner ? "draw" : game.winner === game.you ? "won" : "lost";
}
var recordResultTexts = {
  win: { neutral: "recordWin", won: "recordPersonalWin", lost: "recordPersonalLoss" },
  timeout: { neutral: "recordTimeWin", won: "recordPersonalTimeWin", lost: "recordPersonalTimeLoss" },
  resign: { neutral: "recordResignWin", won: "recordPersonalResignWin", lost: "recordPersonalResignLoss" },
  disconnect: { neutral: "recordDisconnectWin", won: "recordPersonalDisconnectWin", lost: "recordPersonalDisconnectLoss" },
  unknown: { neutral: "recordUnknownWin", won: "recordPersonalUnknownWin", lost: "recordPersonalUnknownLoss" }
};
function recordResult(game, { personal = false } = {}) {
  if (!game.winner) return t2(isBikjangDraw(game) ? "jangiBikjangDraw" : "draw");
  const reason = game.endReason;
  const ending = reason === "disconnect" || reason === "timeout" ? reason : reason === "resign" || game.actions?.some((action) => action.type === "resign") ? "resign" : reason === "win" || game.line?.length >= 5 ? "win" : "unknown";
  const labels = recordResultTexts[ending];
  if (personal && !game.sharedView && (game.you === 1 || game.you === 2)) {
    return t2(labels[describeOutcome(game)]);
  }
  return t2(labels.neutral, { color: sideName(game, game.winner) });
}
function recordPlayer(game, seat) {
  const profile = game.players?.find((player) => player.seat === seat);
  const savedName = displayNickname(profile?.nickname || (profile?.guestCode ? t2("recordGuest", { code: profile.guestCode }) : ""));
  return { ...profile, savedName, name: savedName || t2(seat === game.you ? "you" : "opponent") };
}
function recordPhoto(profile) {
  return typeof profile?.photoUrl === "string" && /^https:\/\//i.test(profile.photoUrl) ? profile.photoUrl : "";
}
function recordRank(profile) {
  return Number.isInteger(profile.rating) ? rankName(rankLevel(profile.rating)) : "";
}
function setRecordPhoto(image, profile) {
  const url = recordPhoto(profile);
  if (image.getAttribute("src") === (url || null)) return;
  image.hidden = !url;
  if (url) image.src = url;
  else image.removeAttribute("src");
}
function recordFavorites() {
  const key = recordsScope + ".favorites";
  if (favoritesScope !== key) {
    favoritesScope = key;
    favorites = /* @__PURE__ */ new Set();
    try {
      const ids = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(ids)) favorites = new Set(ids);
    } catch {
    }
  }
  return favorites;
}
function toggleFavorite(id) {
  const saved = recordFavorites();
  const active = !saved.has(id);
  if (active) saved.add(id);
  else saved.delete(id);
  try {
    localStorage.setItem(favoritesScope, JSON.stringify([...saved]));
  } catch {
  }
  return active;
}
function markFavorite(button, active) {
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", t2("recordFavorite"));
}
var recordTokenPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;
var recordShareDialog = el("record-share-dialog");
var recordVisibilityDialog = el("record-visibility-dialog");
var publicPlayUrl = "https://ncroquis.github.io/matjjangjangi/play/";
var reviewPlay = el("review-play");
var reviewRoomAction = el("review-room-action");
var reviewShare = el("review-share");
var reviewExit = el("review-exit");
reviewPlay.href = window.NcqShare?.playUrl?.() || publicPlayUrl;
function recordVisibilityPath(game) {
  const code = game.code ?? game.id?.split(":")[0];
  if (!backend || game.device || game.summaryOnly || !recordTokenPattern.test(code) || !Number.isInteger(game.round)) return null;
  return "/records/" + code + "/" + game.round + "/visibility";
}
function recordShareUrl(shareId2) {
  const url = new URL(publicPlayUrl);
  url.hash = "record=" + shareId2;
  return url.href;
}
function renderRecordDialog() {
  if (!recordDialogTarget?.dialog.open) return;
  const { dialog, feedbackId, shareId: shareId2, updating, ready, prepared, sharing } = recordDialogTarget;
  if (dialog === recordVisibilityDialog) {
    const toggle = el("record-visibility-toggle");
    toggle.hidden = !ready;
    toggle.disabled = updating;
    toggle.textContent = t2(shareId2 ? "recordMakePrivate" : "recordMakePublic");
    el("record-visibility-close").disabled = updating;
  } else {
    el("record-link-panel").hidden = !shareId2;
    const link = el("record-link");
    const url = shareId2 ? recordShareUrl(shareId2) : "";
    if (link.value !== url) link.value = url;
    el("record-send-link").hidden = !prepared;
    el("record-send-link").disabled = sharing;
    el("record-copy-link").disabled = sharing;
    el("record-share-close").disabled = false;
  }
  const status = el(feedbackId);
  if (!status.hidden) status.textContent = t2(status.dataset.message);
}
async function openRecordDialog(game, dialog) {
  if (!game || recordDialogTarget?.dialog.open) return;
  const manageVisibility = dialog === recordVisibilityDialog;
  const path = game.sharedView ? null : recordVisibilityPath(game);
  if (!path && (manageVisibility || !game.sharedView || !game.shareId)) return;
  const feedbackId = manageVisibility ? "record-visibility-feedback" : "record-share-feedback";
  const target = { game, dialog, feedbackId, path, shareId: path ? null : game.shareId, ready: false };
  recordDialogTarget = target;
  feedback(feedbackId, !path ? "" : manageVisibility ? "recordShareLoading" : "recordSharePreparing");
  dialog.showModal();
  render();
  if (path) {
    const result = await remoteRequest((client) => client.gameRequest(path, manageVisibility ? void 0 : { public: true, record: game.recordDetail }));
    const success = !result.error && (manageVisibility || Boolean(result.shareId));
    const active = recordDialogTarget === target && dialog.open;
    if (success && (active || !manageVisibility)) updateRecordShareId(target, result.shareId);
    if (!active) return;
    target.ready = success;
    feedback(feedbackId, success ? "" : "recordShareFailed", !success);
    render();
  }
  if (manageVisibility || !target.shareId) return;
  await prepareRecordShare(target);
  const nativeShare = ["android", "ios", "toss"].includes(window.NCQ?.NCQ_PLATFORM);
  if (nativeShare || navigator.userActivation?.isActive !== false) await sendRecordLink(target);
}
function updateRecordShareId(target, shareId2) {
  target.shareId = target.game.shareId = shareId2;
  const id = target.game.code ? target.game.code + ":" + target.game.round : target.game.id;
  const record = records.find((item) => item.id === id);
  if (record) record.shareId = shareId2;
}
async function prepareRecordShare(target) {
  const { shareId: shareId2 } = target;
  if (!shareId2 || !window.NcqShare?.can()) return;
  const url = recordShareUrl(shareId2);
  try {
    const prepared = await window.NcqShare.prepareShare({ url, title: t2("title"), message: t2("recordShareMessage") });
    if (recordDialogTarget !== target || !target.dialog.open || prepared.url !== url) return;
    target.prepared = prepared;
    renderRecordDialog();
  } catch {
  }
}
async function toggleRecordVisibility() {
  const target = recordDialogTarget;
  if (target?.dialog !== recordVisibilityDialog || !target.ready || target.updating) return;
  target.updating = true;
  feedback(target.feedbackId, "recordShareSaving");
  renderRecordDialog();
  const result = await remoteRequest((client) => client.gameRequest(
    target.path,
    { public: !target.shareId, ...!target.shareId ? { record: target.game.recordDetail } : {} }
  ));
  target.updating = false;
  if (!result.error) updateRecordShareId(target, result.shareId);
  if (recordDialogTarget !== target || !target.dialog.open) return;
  if (result.error) {
    feedback(target.feedbackId, "recordShareFailed", true);
  } else {
    feedback(target.feedbackId, result.shareId ? "" : "recordMadePrivate");
  }
  render();
  el("record-visibility-toggle").focus();
}
el("record-visibility-toggle").addEventListener("click", toggleRecordVisibility);
reviewShare.addEventListener("click", () => openRecordDialog(room ?? archive, recordShareDialog));
reviewPlay.addEventListener("click", (event) => {
  if (archive?.sharedView && ["android", "ios", "toss"].includes(window.NCQ?.NCQ_PLATFORM)) {
    event.preventDefault();
    leaveMatch();
  }
});
function selectPublicRecordLink() {
  const input = el("record-link");
  input.focus();
  input.select();
  feedback("record-share-feedback", "recordCopyManually");
}
async function sendRecordLink(target) {
  if (!target?.prepared || recordDialogTarget !== target || !recordShareDialog.open || target.sharing) return;
  target.sharing = true;
  feedback("record-share-feedback");
  renderRecordDialog();
  let status = "failed";
  try {
    ({ status } = await window.NcqShare.share(target.prepared));
  } catch {
  }
  target.sharing = false;
  if (!recordShareDialog.open || recordDialogTarget !== target) return;
  renderRecordDialog();
  if (status === "copied") feedback("record-share-feedback", "recordLinkCopied");
  if (status === "failed") selectPublicRecordLink();
  else if (!recordShareDialog.contains(document.activeElement)) el("record-send-link").focus({ preventScroll: true });
}
el("record-send-link").addEventListener("click", () => sendRecordLink(recordDialogTarget));
el("record-copy-link").addEventListener("click", async () => {
  const input = el("record-link");
  const target = recordDialogTarget;
  try {
    await navigator.clipboard.writeText(input.value);
    if (recordShareDialog.open && recordDialogTarget === target) feedback("record-share-feedback", "recordLinkCopied");
  } catch {
    if (!recordShareDialog.open || recordDialogTarget !== target) return;
    selectPublicRecordLink();
  }
});
for (const dialog of [recordShareDialog, recordVisibilityDialog]) {
  dialog.addEventListener("cancel", (event) => {
    if (recordDialogTarget?.updating) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open || recordDialogTarget?.dialog !== dialog) return;
    const { game } = recordDialogTarget;
    recordDialogTarget = null;
    render();
    if (!el("review").hidden && !reviewShare.hidden) reviewShare.focus();
    else if (!el("records").hidden) {
      const row = Array.from(el("record-list").children).find((item) => item.dataset.recordId === game.id);
      (row?.querySelector(".record-visibility") ?? el("records-heading")).focus();
    }
  });
}
function renderReview(game) {
  reviewMoveNumbers.setAttribute("aria-pressed", String(showMoveNumbers));
  const nextColor = reviewPly < game.moves.length ? moveColor(game, reviewPly) : null;
  for (const [side, seat] of [["opponent", 3 - game.you], ["own", game.you]]) {
    const stone = seatColor(game, seat);
    const color = colorName(stone);
    const profile = recordPlayer(game, seat);
    const prefix = "review-" + side + "-";
    const label = el(prefix + "name");
    label.textContent = label.title = game.sharedView ? t2(color) : profile.name;
    const rank = game.sharedView ? "" : recordRank(profile);
    el(prefix + "rank").hidden = !rank;
    el(prefix + "rank").textContent = rank;
    const seatLabel = el(prefix + "seat");
    seatLabel.hidden = Boolean(game.sharedView);
    seatLabel.textContent = [t2(side === "own" ? "you" : "opponent"), t2(color)].join(" \xB7 ");
    el(prefix + "stone").className = "stone " + color;
    el(prefix + "stone").dataset.stoneStyle = pieceStyleForSeat(game, seat, shopState.appearance.stones);
    setRecordPhoto(el(prefix + "photo"), profile);
    const active = nextColor === stone;
    const card = el(prefix + "profile");
    card.disabled = Boolean(game.sharedView);
    card.toggleAttribute("data-turn", active);
    const turn = el(prefix + "turn");
    turn.hidden = false;
    turn.setAttribute("aria-hidden", String(!active));
    turn.textContent = t2("watchTurn", { color: t2(color) });
  }
  const id = archive ? game.id : game.id + ":" + game.round;
  const favorite = el("review-favorite");
  favorite.hidden = Boolean(game.sharedView);
  favorite.dataset.recordId = id;
  markFavorite(favorite, recordFavorites().has(id));
  el("review-result").textContent = recordResult(game, { personal: true });
  el("review-mode").textContent = recordModeLabel(game);
  const passes = game.actions ? [0, 0] : game.passes ?? [0, 0];
  if (game.actions) {
    for (const action of game.actions) {
      if (action.type === "pass" && (action.seat === 1 || action.seat === 2)) passes[action.seat - 1]++;
    }
  }
  const black = game.black ?? 1;
  el("review-passes").hidden = !passes.some(Boolean);
  el("review-passes").textContent = t2("recordPasses", { black: passes[black - 1], white: passes[2 - black] });
}
function entryRow(label, note, onOpen) {
  const row = document.createElement("li");
  row.className = "entry-row";
  const body = document.createElement(onOpen ? "button" : "div");
  body.className = "entry-body";
  const name = document.createElement("strong");
  name.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = note;
  body.append(name, detail);
  if (onOpen) {
    body.type = "button";
    body.addEventListener("click", onOpen);
  }
  row.append(body);
  return row;
}
function liveGameRow(game, label) {
  const row = el("live-game-row").content.firstElementChild.cloneNode(true);
  const button = row.firstElementChild;
  button.title = label;
  const black = game.black ?? 1;
  row.querySelectorAll(".live-game-player").forEach((playerRow, index2) => {
    const profile = recordPlayer(game, index2 === 0 ? black : 3 - black);
    playerRow.querySelector(".stone").setAttribute("aria-label", t2(colorName(index2 + 1)));
    playerRow.querySelector(".live-game-rank").textContent = recordRank(profile);
    const name = profile.savedName || t2("guestNickname");
    const nickname = playerRow.querySelector(".live-game-name");
    nickname.textContent = name;
    nickname.title = name;
  });
  const watchers = row.querySelector(".live-game-watchers");
  watchers.hidden = !Number.isInteger(game.spectators);
  watchers.textContent = watchers.hidden ? "" : t2("liveWatchers", { n: game.spectators });
  row.querySelector(".live-game-moves").textContent = t2("liveMoves", { n: game.moves });
  button.addEventListener("click", () => openSpectator(game.code));
  return row;
}
function championshipPeriod(startsAt, endsAt) {
  const date2 = (value) => {
    const korea = new Date(value + koreaOffset);
    return String(korea.getUTCMonth() + 1).padStart(2, "0") + "." + String(korea.getUTCDate()).padStart(2, "0");
  };
  return date2(startsAt) + "~" + date2(endsAt - 1);
}
function renderChampionship(now = Date.now()) {
  const koreaNow = now + koreaOffset;
  const daysSinceMonday = (new Date(koreaNow).getUTCDay() + 6) % 7;
  const monday = new Date((Math.floor(koreaNow / dayMs) - daysSinceMonday) * dayMs);
  const end = monday.getTime() + 7 * dayMs - koreaOffset;
  const month = NcqLang.date(monday, { month: "long", timeZone: "UTC" });
  const week = NcqLang.num(Math.ceil(monday.getUTCDate() / 7));
  el("lobby-championship").textContent = t2("championshipName", { month, week });
  const minutesLeft = Math.ceil((end - now) / 6e4);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const countdown = el("championship-countdown");
  countdown.dateTime = new Date(end).toISOString();
  countdown.textContent = t2(hoursLeft >= 24 ? "championshipEndsDays" : hoursLeft ? "championshipEndsHours" : "championshipEndsMinutes", {
    days: NcqLang.num(Math.floor(hoursLeft / 24)),
    hours: NcqLang.num(hoursLeft % 24),
    minutes: NcqLang.num(minutesLeft % 60)
  });
  const fullCountdown = countdown.textContent;
  countdown.textContent = t2(hoursLeft >= 24 ? "forestDaysLeft" : hoursLeft ? "forestHoursLeft" : "forestMinutesLeft", {
    n: NcqLang.num(hoursLeft >= 24 ? Math.floor(hoursLeft / 24) : hoursLeft || minutesLeft)
  });
  countdown.title = fullCountdown;
  countdown.style.setProperty("--countdown-characters", countdown.textContent.length);
  el("lobby-championship").title = el("lobby-championship").textContent;
  el("lobby-championship").textContent = t2("forestChampionship");
  el("forest-championship-countdown").textContent = rankingTab === "previous" ? t2("forestWeekEnded") : countdown.textContent;
  if (rankingTab !== "previous" || !el("forest-championship-period").textContent) {
    el("forest-championship-period").textContent = championshipPeriod(end - 7 * dayMs, end);
  }
}
function renderLobby() {
  if (backend) renderChampionship();
  const count = el("live-count");
  count.hidden = lobbyUnavailable || !liveGames;
  count.textContent = t2("liveCount", { n: liveGames?.length ?? 0 });
  const message = lobbyUnavailable ? "liveUnavailable" : liveGames ? "noLiveGames" : "liveLoading";
  el("live-message").textContent = t2(message);
  el("live-message").hidden = !lobbyUnavailable && Boolean(liveGames?.length);
  const activeCode = document.activeElement?.dataset.watchCode;
  const entries = el("live-games");
  entries.replaceChildren(...(lobbyUnavailable ? [] : liveGames ?? []).map((game) => {
    const moves = t2("movesCount", { n: game.moves });
    const mode = t2(matchMode(game));
    const label = mode + " #" + game.number;
    if (!game.code) return entryRow(label, moves);
    const row = game.players?.length === 2 ? liveGameRow(game, label) : entryRow(label, moves + " \xB7 " + t2("spectate"), () => openSpectator(game.code));
    row.firstElementChild.dataset.watchCode = game.code;
    row.firstElementChild.disabled = busy;
    return row;
  }));
  if (activeCode && !busy) {
    const active = [...entries.querySelectorAll("button")].find((button) => button.dataset.watchCode === activeCode);
    (active ?? el("lobby-heading")).focus({ preventScroll: true });
  }
}
function ratingNumber(value) {
  return new Intl.NumberFormat(NcqLang.lang).format(value);
}
var danMinimums = [2200, 2260, 2340, 2440, 2560, 2700, 2860, 3040, 3240];
function rankLevel(rating) {
  if (rating < 1520) return 0;
  if (rating < danMinimums[0]) return 1 + Math.floor((rating - 1520) / 40);
  const nextDan = danMinimums.findIndex((minimum) => rating < minimum);
  return nextDan === -1 ? 26 : 17 + nextDan;
}
function rankMinimum(level) {
  return level < 18 ? 1520 + 40 * (level - 1) : danMinimums[level - 18];
}
function rankName(level) {
  return level < 18 ? t2("rankKyu", { n: 18 - level }) : t2("rankDan", { n: level - 17 });
}
function renderOwnRank() {
  if (spectator) return;
  const rating = backend ? playerStats?.rating : 1500;
  const rank = el("own-rank");
  rank.hidden = !Number.isFinite(rating);
  if (!rank.hidden) rank.textContent = rankName(rankLevel(rating));
}
function renderPlayerCard() {
  const tab = lobbyView === "tournament" ? rankingTab : null;
  const standing = tab === "weekly" || tab === "previous" ? rankingResults[tab]?.result?.own : null;
  const tournamentScore = tab === "previous" || Boolean(standing);
  const overall = tab === "rating";
  const rating = playerStats?.rating ?? standing?.rating ?? 1500;
  const level = Number.isFinite(rating) ? rankLevel(rating) : null;
  const name = ownNickname();
  el("lobby-player-name").textContent = name;
  el("lobby-player-name").title = name;
  const rank = el("lobby-player-rank");
  rank.hidden = level === null;
  if (!rank.hidden) rank.textContent = rankName(level);
  const record = el("player-record");
  const stats = tournamentScore ? standing : overall ? playerStats : playerStats?.rankRecord;
  record.hidden = !stats || ![stats.wins, stats.draws, stats.losses].every(Number.isInteger);
  if (!record.hidden) {
    const career = t2("careerRecord", stats);
    record.textContent = record.title = tournamentScore || overall ? career + " \xB7 " + t2("profileWinRate", { rate: winRate(stats) }) : t2("lobbyRankRecord", { record: career });
  }
  const score = el("player-career");
  score.hidden = !tournamentScore && !overall && level === null;
  if (!score.hidden) {
    el("player-rating-label").hidden = tournamentScore;
    const value = el("player-rating-value");
    if (tournamentScore) {
      value.textContent = Number.isInteger(standing?.points) ? t2("pointsCount", { n: standing.points }) : t2("rankingScoreEmpty");
    } else {
      value.textContent = level === null ? "-" : t2("profileRatingValue", { rating: ratingNumber(rating) });
    }
    const detail = el("player-card-detail");
    if (tournamentScore || overall) {
      const position = overall ? playerStats?.ratingRank?.position : standing?.rank;
      detail.textContent = Number.isInteger(position) && position > 0 ? t2("rankingPosition", { rank: ratingNumber(position) }) : t2("rankingPositionEmpty");
    } else {
      detail.textContent = nextRankText(level, rating);
    }
    detail.hidden = !detail.textContent;
  }
  const progressLevel = rankLevel(rating);
  forest.profile(rating, rankMinimum(progressLevel), progressLevel < 26 ? rankMinimum(progressLevel + 1) : rankMinimum(progressLevel) + 100);
}
function nextRankText(level, rating) {
  if (level === 26) return "";
  return t2("nextRank", {
    rank: rankName(level + 1),
    points: ratingNumber(rankMinimum(level + 1) - rating)
  });
}
function winRate({ wins, draws, losses }) {
  const total = wins + draws + losses;
  return total > 0 ? new Intl.NumberFormat(NcqLang.lang, { style: "percent", maximumFractionDigits: 1 }).format(wins / total) : "\u2014";
}
function renderPromotionMeter(meterId, prefix, rating, { previousRating } = {}) {
  const level = rankLevel(rating);
  const canDemote = level > 0;
  const canPromote = level < 26;
  const lower = canDemote ? rankMinimum(level) : 1500 - (rankMinimum(1) - 1500);
  const upper = canPromote ? rankMinimum(level + 1) : lower + (lower - rankMinimum(level - 1));
  const center = (lower + upper) / 2;
  const comparing = previousRating !== void 0;
  const start = comparing ? Math.min(lower, previousRating, rating) : lower;
  const end = comparing ? Math.max(upper, previousRating, rating) : upper;
  const position = (score) => Math.max(0, Math.min(100, 100 * (score - start) / (end - start)));
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  const tickNumber = comparing ? new Intl.NumberFormat(NcqLang.lang, { signDisplay: "never" }) : signed;
  const currentOffset = rating - center;
  const lowerOffset = lower - center;
  const upperOffset = upper - center;
  const lowLabel = canDemote ? t2("demotion") : t2("lowestRank");
  const highLabel = canPromote ? t2("promotion") : t2("highestRank");
  const meter = el(meterId);
  const to = position(rating);
  meter.style.setProperty("--promotion-position", `${to}%`);
  const announcement = {
    value: signed.format(currentOffset),
    lowLabel,
    lowTick: canDemote ? signed.format(lowerOffset) : "\u2014",
    highLabel,
    highTick: canPromote ? signed.format(upperOffset) : "\u2014"
  };
  if (comparing) {
    const from = position(previousRating);
    meter.style.setProperty("--promotion-start", `${from}%`);
    meter.style.setProperty("--promotion-change-left", `${Math.min(from, to)}%`);
    meter.style.setProperty("--promotion-change-right", `${Math.max(from, to)}%`);
    meter.style.setProperty("--promotion-band-start", `${position(lower)}%`);
    meter.style.setProperty("--promotion-band-end", `${position(upper)}%`);
    announcement.previous = signed.format(previousRating - center);
    el(`${prefix}-previous`).textContent = announcement.previous;
  }
  meter.setAttribute("aria-label", t2(comparing ? "resultPromotionMeter" : "promotionMeter", announcement));
  el(`${prefix}-value`).textContent = announcement.value;
  el(`${prefix}-lower-label`).textContent = lowLabel;
  el(`${prefix}-upper-label`).textContent = highLabel;
  el(`${prefix}-lower`).textContent = canDemote ? tickNumber.format(lowerOffset) : "\u2014";
  el(`${prefix}-upper`).textContent = canPromote ? tickNumber.format(upperOffset) : "\u2014";
}
async function openPlayerProfile(seat, ranking = null) {
  const game = room ?? archive;
  const own2 = ranking ? Boolean(ranking.row.you) : seat === void 0 || seat === game?.you;
  const code = game?.code ?? game?.id?.split(":")[0];
  const online = Boolean(backend && !game?.device && /^[\da-f-]{36}$/.test(code ?? ""));
  const target = { own: own2, seat, online, ranking, stats: ranking?.row ?? null, loading: !ranking && !own2 && online };
  profileTarget = target;
  renderPlayerProfile();
  profileDialog.showModal();
  render();
  if (own2) {
    await refreshPlayerCard();
  } else if (target.loading) {
    const stats = await getOpponentProfile(code, game.round);
    if (profileTarget !== target || !profileDialog.open) return;
    target.loading = false;
    if (!stats.error) target.stats = stats;
    renderPlayerProfile();
  }
}
function getOpponentProfile(code, round) {
  return remoteRequest((client) => client.gameRequest(`/rooms/${code}/opponent-profile?round=${round}`));
}
function renderMatchIntro() {
  const { game, opponentLevel } = matchIntro;
  const currentGame = room?.code === game.code ? room : game;
  const opponent = recordPlayer(currentGame, 3 - game.you);
  const opponentRating = matchIntro.opponentRating ?? opponent.rating;
  const ownRating = playerStats?.rating ?? recordPlayer(currentGame, game.you).rating;
  setRecordPhoto(el("match-intro-opponent-photo"), opponent);
  for (const [side, name, rating, fallbackLevel] of [
    ["own", ownNickname(), ownRating, null],
    ["opponent", opponent.name, opponentRating, opponentLevel]
  ]) {
    const prefix = `match-intro-${side}-`;
    const nameLabel = el(prefix + "name");
    nameLabel.textContent = nameLabel.title = name;
    const level = Number.isFinite(rating) ? rankLevel(rating) : fallbackLevel;
    const rankLabel = el(prefix + "rank");
    rankLabel.hidden = level == null;
    if (!rankLabel.hidden) rankLabel.textContent = rankName(level);
    const ratingLabel = el(prefix + "rating");
    ratingLabel.hidden = !Number.isFinite(rating);
    if (!ratingLabel.hidden) ratingLabel.textContent = t2("matchIntroRating", { rating: ratingNumber(rating) });
  }
  const points = el("match-intro-points");
  points.hidden = !Number.isFinite(ownRating) || !Number.isFinite(opponentRating);
  if (points.hidden) return;
  const expected = 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  el("match-intro-win").textContent = t2("matchIntroWin", { points: signed.format(Math.round(32 * (1 - expected))) });
  el("match-intro-loss").textContent = t2("matchIntroLoss", { points: signed.format(-Math.round(32 * expected)) });
}
async function openMatchIntro(game) {
  if (game.phase !== "playing") return;
  const intro = { game, opponentRating: null, opponentLevel: game.botLevel };
  matchIntro = intro;
  renderMatchIntro();
  matchIntroDialog.showModal();
  intro.cancelHaptic = haptics.once("match:" + roundHapticKey(game), "heavy", {
    delay: reducedMotion.matches ? 0 : 300,
    valid: () => matchIntro === intro && matchIntroDialog.open
  });
  intro.timer = setTimeout(() => {
    if (matchIntro === intro && matchIntroDialog.open) matchIntroDialog.close();
  }, 5e3);
  render();
  if (!backend) return;
  if (!playerStats) refreshPlayerCard();
  const stats = await getOpponentProfile(game.code, game.round);
  if (matchIntro !== intro || !matchIntroDialog.open || !Number.isFinite(stats?.rating)) return;
  intro.opponentRating = stats.rating;
  renderMatchIntro();
}
function renderPlayerProfile() {
  const { own: own2, seat, online, loading, ranking, stats: opponentStats } = profileTarget;
  const ranked = own2 ? null : ranking;
  const tournament = ranked && ranked.tab !== "rating";
  const previous = tournament && ranked.tab === "previous";
  const stats = own2 ? playerStats : opponentStats;
  const game = room ?? archive;
  const saved = ranked?.row ?? (seat && game && (!own2 || game.phase === "finished") ? recordPlayer(game, seat) : null);
  const name = ranked ? rankingPlayerName(ranked.row) : saved?.savedName || (own2 ? ownNickname() : t2("opponent"));
  const title = el("player-profile-title");
  const status = el("profile-status");
  const photo = el("profile-photo");
  const source = recordPhoto(saved) || (own2 ? playerPhoto : null);
  if (photo.getAttribute("src") !== source) {
    photo.hidden = true;
    if (source) photo.src = source;
    else photo.removeAttribute("src");
  }
  const stone = el("profile-stone");
  stone.hidden = Boolean(ranking);
  stone.className = "stone " + colorName(seatColor(game, seat));
  stone.dataset.stoneStyle = own2 && !game ? shopState.appearance.stones : pieceStyleForSeat(game, seat, shopState.appearance.stones);
  nicknameEdit.hidden = !own2;
  const hasRating = Number.isFinite(stats?.rating);
  const hasRecord = stats && [stats.wins, stats.draws, stats.losses].every(Number.isInteger);
  const showStanding = ranked ? Number.isInteger(ranked.row.rank) : own2 && stats && Object.hasOwn(stats, "ratingRank");
  el("profile-rating-section").hidden = !hasRating && !showStanding;
  el("profile-rating-line").hidden = !hasRating;
  el("profile-records").hidden = !hasRecord;
  el("profile-rating-standing-row").hidden = !showStanding;
  el("profile-rankings").hidden = !own2 || !backend || Boolean(room ?? archive);
  el("profile-promotion").hidden = !own2 || !stats;
  status.hidden = Boolean(stats);
  if (!stats) {
    title.textContent = name;
    status.textContent = t2(own2 ? !backend ? "profileOffline" : profileLoading ? "profileLoading" : "profileUnavailable" : !online ? "opponentProfileOffline" : loading ? "opponentProfileLoading" : "opponentProfileUnavailable");
    return;
  }
  const { rating, rankRecord } = stats;
  const level = hasRating ? rankLevel(rating) : null;
  title.textContent = hasRating ? rankName(level) + " " + name : name;
  if (hasRating) el("profile-rating").textContent = t2("profileRatingValue", { rating: ratingNumber(rating) });
  if (showStanding) {
    el("profile-rating-standing-label").textContent = t2(tournament ? previous ? "previousTournament" : "currentTournament" : "profileRatingStanding");
    const standing = el("profile-rating-standing");
    if (ranked) {
      standing.textContent = t2("rankingPosition", { rank: ratingNumber(ranked.row.rank) });
      if (tournament && Number.isInteger(ranked.row.points)) standing.textContent += " \xB7 " + t2("pointsCount", { n: ranked.row.points });
    } else {
      const { ratingRank } = stats;
      standing.textContent = ratingRank ? t2("profileRatingStandingValue", {
        position: ratingNumber(ratingRank.position),
        players: ratingNumber(ratingRank.players)
      }) : t2("profileRatingStandingPending");
    }
  }
  const nextRank = hasRating && !ranked ? nextRankText(level, rating) : "";
  el("profile-next-rank").textContent = nextRank;
  el("profile-next-rank").hidden = !nextRank;
  if (hasRecord) {
    el("profile-record-label").textContent = t2(tournament ? previous ? "previousTournamentRecord" : "currentTournamentRecord" : "overallRecord");
    el("profile-record").textContent = t2("careerRecord", stats);
    const rate = winRate(stats);
    el("profile-win-rate").hidden = !own2;
    el("profile-opponent-win-rate-row").hidden = own2;
    if (own2) el("profile-win-rate").textContent = t2("profileWinRate", { rate });
    else el("profile-opponent-win-rate").textContent = rate;
  }
  el("profile-rank-record-row").hidden = !rankRecord;
  if (rankRecord) {
    el("profile-rank-record").textContent = t2("careerRecord", rankRecord);
    el("profile-rank-win-rate").textContent = t2("profileWinRate", { rate: winRate(rankRecord) });
  }
  if (own2) renderPromotionMeter("profile-promotion-meter", "promotion", rating);
}
async function refreshPlayerCard(cooldown = 3) {
  if (!backend || profileLoading && cooldown !== -1) return;
  const request = ++profileRequest;
  profileLoading = true;
  if (profileDialog.open) renderPlayerProfile();
  try {
    const stats = await remoteRequest((client) => client.profile(cooldown));
    if (request === profileRequest && !stats.error) {
      playerStats = stats;
      renderPlayerCard();
      renderOwnRank();
    }
    await refreshAuthProfile();
  } finally {
    if (request === profileRequest) {
      profileLoading = false;
      if (profileDialog.open) renderPlayerProfile();
      if (matchIntroDialog.open) renderMatchIntro();
    }
  }
}
async function refreshAuthProfile() {
  const profile = await window.NcqAuth?.profile?.().catch(() => null);
  if (!profile) return;
  const photo = profile.photoUrl ?? null;
  if (photo !== playerPhoto) {
    playerPhoto = photo;
    for (const image of playerPhotos) {
      image.hidden = true;
      if (photo) image.src = photo;
      else image.removeAttribute("src");
    }
  }
  const nickname = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
  if (nickname !== playerNickname) {
    playerNickname = nickname;
    render();
  }
}
function recordDate(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value)) / 6e4));
  if (minutes < 7 * 24 * 60 && typeof Intl.RelativeTimeFormat === "function") {
    const format = new Intl.RelativeTimeFormat(NcqLang.lang, { numeric: "auto" });
    if (minutes < 60) return format.format(-minutes, "minute");
    if (minutes < 24 * 60) return format.format(-Math.floor(minutes / 60), "hour");
    return format.format(-Math.floor(minutes / (24 * 60)), "day");
  }
  return NcqLang.date(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function drawRecordPreview(svg, game) {
  svg.setAttribute("viewBox", "0 0 9 10");
  const position = replayBoard(game, game.moves.length);
  for (const [index2, piece] of position.entries()) {
    if (!piece) continue;
    const token = document.createElementNS("http://www.w3.org/2000/svg", "text");
    token.setAttribute("x", index2 % 9 + 0.5);
    token.setAttribute("y", Math.floor(index2 / 9) + 0.76);
    token.setAttribute("font-size", ".9");
    token.setAttribute("font-weight", "bold");
    token.setAttribute("text-anchor", "middle");
    token.setAttribute("fill", sideOf(piece) === 1 ? "#086236" : "#a82c26");
    token.textContent = GLYPHS[sideOf(piece)][Math.abs(piece) - 1];
    svg.append(token);
  }
}
function queueRecordPreview(svg, game) {
  if (typeof IntersectionObserver === "undefined") {
    drawRecordPreview(svg, game);
    return;
  }
  recordPreviewObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const pending = recordPreviewJobs.get(entry.target);
      if (pending) drawRecordPreview(entry.target, pending);
      recordPreviewJobs.delete(entry.target);
      recordPreviewObserver.unobserve(entry.target);
    }
  }, { root: el("record-list").parentElement, rootMargin: "150px 0px" });
  recordPreviewJobs.set(svg, game);
  recordPreviewObserver.observe(svg);
}
function recordCard(game, saved) {
  const row = el("record-row").content.firstElementChild.cloneNode(true);
  row.dataset.recordId = game.id;
  const opponent = recordPlayer(game, 3 - game.you);
  const own2 = recordPlayer(game, game.you);
  const outcome = describeOutcome(game);
  const avatar = row.querySelector("img");
  avatar.addEventListener("error", () => {
    avatar.hidden = true;
  });
  setRecordPhoto(avatar, opponent);
  row.querySelector(".record-opponent").textContent = t2("recordVersus", {
    name: [recordRank(opponent), opponent.name].filter(Boolean).join(" ")
  });
  const badge = row.querySelector(".record-outcome");
  badge.dataset.outcome = outcome;
  badge.textContent = t2({ won: "winBadge", lost: "lossBadge", draw: "drawBadge" }[outcome]);
  row.querySelector(".record-summary").textContent = recordDate(game.finishedAt) + " \xB7 " + recordResult(game, { personal: true });
  const context = [recordRank(own2), own2.name].filter(Boolean).join(" ");
  const mode = t2(game.device ? "deviceRecord" : game.mode === "tournament" ? "weeklyTournament" : "casualMatch");
  row.querySelector(".record-context").textContent = mode + " \xB7 " + context;
  queueRecordPreview(row.querySelector(".record-preview svg"), game);
  row.querySelector(".record-open").addEventListener("click", () => openArchive(game));
  const button = row.querySelector(".record-favorite");
  markFavorite(button, saved);
  button.addEventListener("click", () => {
    const active = toggleFavorite(game.id);
    if (recordFilter === "favorites") {
      renderRecords();
      el("record-filters").querySelector('[data-filter="favorites"]').focus();
    } else {
      markFavorite(button, active);
    }
  });
  const visibility = row.querySelector(".record-visibility");
  visibility.hidden = !recordVisibilityPath(game);
  visibility.textContent = t2(game.shareId ? "recordPublic" : "recordPrivate");
  visibility.toggleAttribute("data-public", Boolean(game.shareId));
  visibility.addEventListener("click", () => openRecordDialog(game, recordVisibilityDialog));
  return row;
}
function renderRecords() {
  recordPreviewObserver?.disconnect();
  recordPreviewJobs = /* @__PURE__ */ new WeakMap();
  const saved = recordFavorites();
  const tournamentOnly = recordsReturnView === "tournament";
  el("records-heading").textContent = t2(tournamentOnly ? "tournamentRecords" : "recordList");
  const visible = records.filter((game) => (!tournamentOnly || game.mode === "tournament") && (recordFilter === "all" || (recordFilter === "favorites" ? saved.has(game.id) : describeOutcome(game) === "won")));
  for (const button of el("record-filters").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === recordFilter));
  }
  const empty = el("records-empty");
  empty.hidden = visible.length > 0;
  empty.textContent = t2({
    all: tournamentOnly ? "noTournamentRecords" : "noRecords",
    favorites: "recordNoFavorites",
    wins: "recordNoWins"
  }[recordFilter]);
  el("record-list").replaceChildren(...visible.map((game) => recordCard(game, saved.has(game.id))));
}
async function refreshLobby() {
  if (room || archive || spectator || lobbyView !== "lobby" || lobbyLoading || document.hidden) return;
  lobbyLoading = true;
  try {
    if (backend) {
      liveGames = await backend.lobby();
    } else {
      const response = await fetch("./api/lobby", { signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error();
      liveGames = await response.json();
    }
    lobbyUnavailable = false;
  } catch {
    lobbyUnavailable = true;
  } finally {
    lobbyLoading = false;
    if (!el("lobby").hidden) renderLobby();
  }
}
function renderResult(game) {
  const outcome = describeOutcome(game);
  const medals = {
    won: ["victoryMedal", "nav-ranking"],
    lost: ["defeatMedal", "result-loss-icon"],
    draw: ["drawMedal", "result-draw-icon"]
  };
  const [label, icon] = medals[outcome];
  const victoryStone = outcome === "won" ? colorName(seatColor(game, game.you)) : "";
  resultDialog.dataset.outcome = outcome;
  resultDialog.dataset.victoryStone = victoryStone;
  el("result-stone-color").textContent = victoryStone ? t2(victoryStone) : "";
  const bikjang = isBikjangDraw(game);
  resultDialog.toggleAttribute("data-bikjang", bikjang);
  el("result-title").textContent = t2(bikjang ? "jangiBikjangDraw" : label);
  el("result-reason").hidden = !bikjang;
  el("result-reason").textContent = bikjang ? t2("jangiBikjangDrawReason") : "";
  el("result-symbol").setAttribute("href", `#${icon}`);
  const change = game.ratingChange;
  el("result-rating").hidden = el("result-rating-change").hidden = !change;
  if (!change) {
    resultDialog.removeAttribute("data-promoted");
    return;
  }
  const { before, after, delta } = change;
  const beforeLevel = rankLevel(before);
  const afterLevel = rankLevel(after);
  const rank = rankName(afterLevel);
  const promoted = afterLevel > beforeLevel;
  resultDialog.toggleAttribute("data-promoted", promoted);
  let rankLabel = rank;
  if (promoted) {
    const previousRank = rankName(beforeLevel);
    rankLabel = resultDialog.hasAttribute("data-promotion-revealed") ? t2("rankUp", { rank }) : previousRank;
    el("rank-celebration-before").textContent = previousRank;
    el("rank-celebration-after").textContent = rank;
    el("rank-celebration-heading").textContent = t2("rankCelebration", { rank });
  } else if (afterLevel < beforeLevel) {
    rankLabel = t2("rankDown", { rank });
  }
  el("result-rank").textContent = rankLabel;
  el("rating-range").textContent = `${ratingNumber(before)} \u2192 ${ratingNumber(after)}`;
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  const deltaText = el("rating-delta");
  deltaText.textContent = t2("profileRatingValue", { rating: signed.format(delta) });
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  deltaText.dataset.direction = el("result-promotion-meter").dataset.direction = direction;
  renderPromotionMeter("result-promotion-meter", "result-promotion", after, { previousRating: before });
}
async function playRankPromotion({ code, round }, notify = false) {
  if (!resultDialog.hasAttribute("data-promoted")) return;
  const ripple = el("result-promotion-ripple").getAnimations().find((animation) => animation.animationName === "promotion-threshold-ripple");
  await ripple?.finished.catch(() => {
  });
  if (!resultDialog.open || room?.code !== code || room.round !== round || room.phase !== "finished") return;
  if (!resultDialog.hasAttribute("data-promoted")) return;
  resultDialog.setAttribute("data-promotion-revealed", "");
  renderResult(room);
  rankCelebration.showModal();
  if (notify) {
    const plaque = rankCelebration.querySelector(".rank-celebration-plaque");
    const delay = plaque.getAnimations().find((animation) => animation.animationName === "rank-plaque-in")?.effect.getTiming().delay ?? 0;
    cancelPromotionHaptic = haptics.once(`result:${code}:${round}`, "promotion", {
      delay,
      valid: () => rankCelebration.open && room?.code === code && room.round === round
    });
  }
  clearTimeout(promotionCloseTimer);
  promotionCloseTimer = setTimeout(() => rankCelebration.close(), 5e3);
}
function render() {
  el("bikjang-guide").hidden = true;
  if (bikjangDialog.open && !validBikjangConfirmation(bikjangPending)) bikjangDialog.close("cancel");
  el("placement-timing").hidden = true;
  if (coinRewardDialog.open) renderCoinReward();
  queueMicrotask(presentCoinReward);
  if (leaveDialog.open) renderLeaveConfirmation();
  if (profileDialog.open) renderPlayerProfile();
  renderRecordDialog();
  if (matchIntroDialog.open) renderMatchIntro();
  const game = room ?? archive ?? spectator?.game;
  const playing = !spectator && game?.phase === "playing";
  const finished = !spectator && game?.phase === "finished";
  const awaitingReview = finished && game === room && awaitingResultDismissal;
  const reviewing = finished && !awaitingReview;
  const sharedReview = Boolean(reviewing && game.sharedView);
  const liveLayout = playing || awaitingReview || Boolean(spectator);
  nicknameInput.placeholder = displayNickname(playerNickname || t2("guestNickname"));
  el("language").value = NcqLang.lang;
  if (optionsDialog.open) {
    el("vibration-option").hidden = !window.NcqDevice?.canVibrate();
    el("vibration").checked = window.NcqDevice?.vibration() ?? true;
    const player = backend && authSession?.player || "";
    el("options-player").hidden = !player;
    const input = el("options-player-id");
    if (input.value !== player) {
      input.value = player;
      feedback("player-id-feedback");
    }
    const status2 = el("player-id-feedback");
    if (!status2.hidden) status2.textContent = t2(status2.dataset.message);
  }
  document.title = t2("title");
  document.body.classList.toggle("in-match", Boolean(game));
  document.body.classList.toggle("match-art-backdrop", liveLayout);
  document.body.classList.toggle("spectating", Boolean(spectator));
  document.body.classList.toggle("in-review", reviewing);
  const postMatchReview = reviewing && Boolean(room);
  const tournamentReview = postMatchReview && game.mode === "tournament";
  document.body.classList.toggle("post-match-review", postMatchReview);
  document.body.classList.toggle("shared-review", sharedReview);
  document.body.classList.toggle("in-records", !game && lobbyView === "records");
  el("match").toggleAttribute("data-playing", liveLayout);
  el("match").toggleAttribute("data-taraguchi", game?.rule === "taraguchi");
  el("match").toggleAttribute("data-ncq-no-main", awaitingReview);
  for (const view of ["lobby", "records", "tournament"]) {
    el(view).hidden = Boolean(game) || lobbyView !== view;
  }
  el("match").hidden = !game;
  el("watch-back").hidden = !spectator;
  el("leave-match").hidden = !liveLayout || Boolean(spectator);
  el("match-options").hidden = !liveLayout;
  el("place-state").hidden = !liveLayout;
  el("watch-back").toggleAttribute("data-ncq-main", Boolean(spectator));
  el("review-header").hidden = !reviewing;
  el("review-opponent-profile").hidden = !reviewing;
  const reviewActionsVisible = reviewing && !profileDialog.open && !recordShareDialog.open && !tournamentCatchUpDialog.open && !coinShortageDialog.open && !matchmaking;
  reviewExit.hidden = !postMatchReview;
  reviewExit.disabled = busy || nextMatchPending;
  reviewExit.toggleAttribute("data-ncq-main", postMatchReview && reviewActionsVisible);
  reviewShare.hidden = !reviewing || !sharedReview && !recordVisibilityPath(game);
  reviewShare.disabled = postMatchReview && (busy || nextMatchPending);
  reviewShare.toggleAttribute("data-ncq-main", reviewActionsVisible && !reviewShare.hidden);
  reviewPlay.hidden = !sharedReview;
  reviewPlay.toggleAttribute("data-ncq-main", reviewActionsVisible && sharedReview);
  el("show-shop").hidden = Boolean(game);
  el("lobby-wallet").hidden = Boolean(game);
  renderCoinBalance();
  dailyPuzzle.render();
  if (!game) renderDailyMissions();
  if (shop.open) renderShop();
  const nav = el("lobby-nav");
  nav.hidden = Boolean(game);
  for (const button of nav.querySelectorAll("button[aria-controls]")) {
    if (button.getAttribute("aria-controls") === lobbyView) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    button.disabled = busy;
  }
  const mainAction = !game && !matchmaking && !shop.open && !missionDialog.open && !dailyPuzzle.isOpen() && !optionsDialog.open && !forest.watchDialog.open && !ruleDialog?.open && !profileDialog.open && !recordDialogTarget?.dialog.open && !tournamentCatchUpDialog.open && !coinShortageDialog.open && !coinRewardDialog.open;
  el("start").disabled = busy || nextMatchPending || Boolean(matchmaking);
  el("show-records").disabled = busy || Boolean(matchmaking);
  renderRulePicker(mainAction);
  el("player-card").disabled = busy;
  el("start").toggleAttribute("data-ncq-main", mainAction && lobbyView === "lobby");
  el("show-tournament").hidden = !backend;
  el("show-tournament").disabled = busy;
  const inLobby = !el("lobby").hidden;
  const inRankings = !el("tournament").hidden;
  el("play-footer").hidden = !inLobby && !inRankings;
  el("lobby-entry").hidden = !inLobby;
  const joinTournament = el("join-tournament");
  const tournamentEntry = el("tournament-entry");
  const joinParent = tournamentReview ? reviewShare.parentElement : tournamentEntry;
  if (joinTournament.parentElement !== joinParent) {
    if (tournamentReview) joinParent.insertBefore(joinTournament, reviewShare);
    else joinParent.prepend(joinTournament);
  }
  const showRankingEntry = inRankings && Boolean(backend) && rankingTab === "weekly";
  const showTournamentEntry = showRankingEntry || tournamentReview;
  const tournamentState = rankingResults.weekly;
  const tournamentStatus = tournamentState?.result;
  const attempts = tournamentStatus?.remaining;
  const catchUp = attempts === 0 && tournamentStatus.catchUpRemaining > 0;
  const attemptsExhausted = !tournamentState?.loading && !tournamentStatus?.error && attempts === 0 && tournamentStatus.catchUpRemaining === 0;
  const enoughCoins = catchUp && tournamentCoinBalance(tournamentStatus) >= tournamentStatus.catchUpCost;
  const attemptsLabel = el("tournament-attempts");
  tournamentEntry.hidden = !showRankingEntry;
  joinTournament.hidden = !showTournamentEntry;
  attemptsLabel.hidden = attempts !== 0;
  attemptsLabel.textContent = catchUp ? t2(enoughCoins ? "tournamentCatchUp" : "tournamentCatchUpFunds", { n: NcqLang.num(tournamentStatus.catchUpRemaining) }) : t2("tournamentLimit");
  el("join-tournament-label").textContent = attemptsExhausted ? t2("joinTournamentExhausted") : catchUp ? t2("joinTournamentCatchUp") : Number.isInteger(attempts) ? t2("joinTournamentAttempts", { remaining: attempts, limit: tournamentStatus.dailyLimit }) : t2("joinTournament");
  el("join-tournament-cost").hidden = !catchUp;
  joinTournament.toggleAttribute("data-catch-up", catchUp);
  if (catchUp) {
    const n = NcqLang.num(tournamentStatus.catchUpCost);
    el("join-tournament-coins").textContent = n;
    joinTournament.setAttribute("aria-label", t2("joinTournamentCatchUpCost", { n }));
    joinTournament.setAttribute("aria-haspopup", "dialog");
  } else {
    joinTournament.removeAttribute("aria-label");
    joinTournament.removeAttribute("aria-haspopup");
  }
  if (tournamentCatchUpDialog.open) {
    const { missed, cost } = tournamentCatchUpQuote;
    const n = NcqLang.num(cost);
    el("tournament-catch-up-missed").textContent = t2("tournamentMissedCount", { n: NcqLang.num(missed) });
    el("tournament-catch-up-coins").textContent = n;
    el("confirm-tournament-catch-up").setAttribute("aria-label", t2("joinTournamentCatchUpCost", { n }));
  }
  el("tournament-records").disabled = busy || Boolean(matchmaking);
  joinTournament.disabled = busy || nextMatchPending || Boolean(matchmaking) || tournamentState?.loading === true || Boolean(tournamentStatus?.error) || !(attempts > 0 || catchUp);
  const joinVisible = showTournamentEntry && !joinTournament.disabled;
  joinTournament.toggleAttribute("data-ncq-main", joinVisible && (mainAction || tournamentReview && reviewActionsVisible));
  el("show-lobby").toggleAttribute("data-ncq-main", mainAction && inRankings && !joinVisible);
  el("records-back").toggleAttribute("data-ncq-main", mainAction && lobbyView === "records");
  if (inLobby) renderLobby();
  renderWeeklyRewards(mainAction);
  if (!el("records").hidden) renderRecords();
  if (inRankings) renderRankings();
  if (inLobby || inRankings) renderPlayerCard();
  forest.render(game, lobbyView);
  if (matchmaking) {
    const { canceled, mode: mode2 } = matchmaking;
    el("queue-status").textContent = t2(canceled ? "canceling" : mode2 === "tournament" ? "tournamentWaiting" : "findingOpponent");
    el("cancel-match").disabled = canceled;
  }
  for (const node of [el("lobby-error"), el("match-error")]) {
    if (!node.hidden) node.textContent = t2(node.dataset.message);
  }
  renderJangiFormation(game);
  if (!game) return;
  if (spectator) {
    renderSpectator(spectator);
    return;
  }
  for (const id of ["invite"]) {
    el(id).toggleAttribute("data-ncq-main", !awaitingReview && !profileDialog.open && !matchIntroDialog.open && !leaveDialog.open);
  }
  const openingActions = el("opening-actions");
  openingActions.hidden = !canAct() || !maySwap(game) && !mayOffer(game);
  for (const button of openingActions.querySelectorAll("button")) {
    button.hidden = button.dataset.opening === "swap" ? !maySwap(game) : !mayOffer(game);
    button.toggleAttribute("data-ncq-main", !openingActions.hidden && !button.hidden);
  }
  let status = "waiting";
  if (finished) status = isBikjangDraw(game) ? "jangiBikjangDraw" : describeOutcome(game);
  else if (room && !connected) status = "reconnecting";
  else if (playing) status = game.turn === game.you ? "yourTurn" : "theirTurn";
  el("room-label").textContent = t2(archive ? "records" : "room");
  el("room-id").textContent = "#" + game.number;
  const mode = matchMode(game);
  const heading = playing && connected ? game.setup ? t2("jangiFormationStatus") : game.opening ? openingStatus(game) : t2(mode) + " \xB7 " + t2("movesCount", { n: game.moves.length }) : t2(status);
  if (el("status").textContent !== heading) el("status").textContent = heading;
  el("status").setAttribute("aria-live", playing ? "off" : "polite");
  const announcement = game.setup || game.opening ? heading : t2(status);
  if (playing && el("turn-announcement").textContent !== announcement) el("turn-announcement").textContent = announcement;
  el("round").textContent = t2("round", { n: game.round });
  el("mode").textContent = t2(reviewing ? "review" : awaitingReview ? "result" : mode);
  el("room-bar").hidden = playing || finished;
  el("invite").hidden = playing || finished || el("share").open;
  el("leave").disabled = busy;
  el("leave-match").disabled = busy || awaitingReview;
  el("leave").textContent = t2(archive ? "backToRecords" : "leave");
  el("leave").removeAttribute("data-ncq-main");
  el("review-back").disabled = busy;
  const place = el("place");
  const actionable = canAct() && !game.setup;
  const placementState = actionable ? "ready" : "inactive";
  place.dataset.placementState = placementState;
  const placeState = el("place-state");
  const moveHint = pendingPlacement ? "jangiMoveSaving" : selectedFrom === null ? "jangiSelectPiece" : "jangiSelectTarget";
  placeState.hidden = !liveLayout;
  placeState.textContent = t2(game.setup ? game.setup === game.you ? "jangiFormationChoose" : "jangiFormationWait" : !connected ? "reconnecting" : !playing ? "result" : game.turn !== game.you ? "theirTurn" : moveHint);
  const placeLabel = game.setup ? t2(game.setup === game.you ? "jangiFormationChoose" : "jangiFormationWait") : game.turn !== game.you ? t2("theirTurn") : t2(moveHint);
  place.setAttribute("aria-label", placeLabel);
  place.title = placeLabel;
  renderPlayers(game, liveLayout);
  el("review").hidden = !reviewing;
  const canRematch = Boolean(room) && !game.bot && game.mode !== "tournament" && game.canRematch !== false && game.endReason !== "resign" && game.endReason !== "disconnect";
  const canMatchNext = Boolean(room) && game.mode !== "tournament" && !canRematch;
  reviewRoomAction.hidden = !reviewing || tournamentReview;
  reviewRoomAction.toggleAttribute("data-ncq-main", reviewActionsVisible && !tournamentReview);
  reviewRoomAction.dataset.action = canRematch ? "rematch" : canMatchNext ? "next" : "leave";
  reviewRoomAction.disabled = busy || nextMatchPending || canRematch && (!connected || game.requested);
  el("review-room-action-label").textContent = t2(canMatchNext ? "nextMatch" : !canRematch ? "leave" : game.requested ? "rematchWaiting" : game.rematch ? "rematchReady" : "rematch");
  if (finished) renderResult(game);
  if (reviewing) {
    renderReview(game);
    renderReplayControls(reviewPly, game.moves.length);
  }
  board.toggleAttribute("inert", !playing && !reviewing);
  drawGamePosition(game, reviewing ? reviewPly : game.moves.length, reviewing);
}
function renderReplayControls(ply, total, watching = false) {
  el("review-ply").textContent = ply;
  el("review-total").textContent = " / " + total;
  for (const button of el("review").querySelectorAll("[data-step]")) {
    const step = button.dataset.step;
    button.disabled = ["first", "previous"].includes(step) ? ply === 0 : ply === total;
    button.toggleAttribute("data-ncq-main", watching && !button.disabled);
    if (step === "last") button.setAttribute("aria-label", t2(watching ? "watchLatestMove" : "lastMove"));
  }
  el("placement-timing").hidden = !placementTimingAvailable() || watching && spectator?.ply === null;
  renderPlacementTiming();
}
function placementTimingAvailable() {
  return window.NCQ_TEST_PLACEMENT_TIMING === true || canClaimTestCoins;
}
function renderPlacementTiming() {
  const slider = el("placement-duration");
  slider.value = replayPlacementDuration;
  el("placement-duration-value").textContent = t2("placementTimingValue", {
    duration: jangiMoveTiming(replayPlacementDuration).duration,
    contact: Math.round(jangiMoveTiming(replayPlacementDuration).contact)
  });
}
new ResizeObserver(([entry]) => {
  const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
  const gap = parseFloat(getComputedStyle(el("match")).rowGap) || 0;
  el("match").style.setProperty("--placement-timing-height", `${height ? height + gap : 0}px`);
}).observe(el("placement-timing"));
el("placement-duration").addEventListener("input", (event) => {
  const duration = Number(event.target.value);
  if (!placementTimingAvailable() || !Number.isFinite(duration)) return;
  replayPlacementDuration = Math.max(50, Math.min(600, duration));
  renderPlacementTiming();
});
el("placement-duration").addEventListener("change", () => {
  if (el("placement-timing").hidden || !placementTimingAvailable()) return;
  const game = room ?? archive ?? spectator?.game;
  const ply = spectator ? spectator.ply ?? game?.moves.length : reviewPly;
  if (game && ply > 0) presentRoundPlacement(game, ply - 1);
});
function drawGamePosition(game, ply, reviewing = false) {
  const latest = ply === game.moves.length;
  let displayedBoard = latest && game.board ? game.board : replayBoard(game, ply);
  const optimistic = game === room && pendingPlacement?.code === game.code && pendingPlacement.round === game.round ? pendingPlacement : null;
  if (optimistic) {
    displayedBoard = [...displayedBoard];
    displayedBoard[optimistic.from] = 0;
    displayedBoard[optimistic.index] = optimistic.piece;
  }
  const moveNumbers = reviewing && showMoveNumbers ? Array(90).fill(0) : null;
  if (moveNumbers) for (let n = 0; n < ply; n++) {
    const move = game.moves[n];
    if (typeof move === "object") {
      moveNumbers[move.from] = 0;
      moveNumbers[move.to] = n + 1;
    }
  }
  game.displayPly = ply;
  renderMaterialPoints(game, displayedBoard);
  drawJangiBoard({ game, displayedBoard, cells, selectedFrom, selected, lastMoveMarker, board, selectable: canAct() && !game.setup, coordinate, t: t2, latest, moveNumbers, pendingMove: optimistic, localPieceStyle: shopState.appearance.stones });
  renderBikjangNotice(game, latest && !reviewing);
  if (!reviewing && game.phase === "playing" && !game.setup && game.board) {
    const hint = inCheck(game.board, game.turn) ? "jangiCheck" : game.bikjang ? "jangiBikjang" : null;
    if (hint) el("status").textContent = t2(hint);
  }
}
function renderBikjangNotice(game, latest) {
  const active = latest && game.phase === "playing" && !game.setup && game.bikjang;
  const guide = el("bikjang-guide"), call = el("bikjang-call");
  guide.hidden = !active;
  if (!active) {
    clearTimeout(bikjangCallTimer);
    call.hidden = true;
    return;
  }
  guide.textContent = t2(spectator ? "jangiBikjangWatch" : game.turn === game.you ? "jangiBikjangGuide" : "jangiBikjangWaiting");
  call.textContent = t2("jangiBikjangCall");
  const key = `${game.code}:${game.round}:${game.ply ?? game.actions?.length ?? game.moves.length}:${game.turn}`;
  if (key === bikjangCallKey) return;
  bikjangCallKey = key;
  clearTimeout(bikjangCallTimer);
  call.hidden = true;
  void call.offsetWidth;
  call.hidden = false;
  bikjangCallTimer = setTimeout(() => {
    call.hidden = true;
  }, 1400);
  scheduleBoardLayout();
}
function renderSpectator({ game, closed, reconnecting, ply }) {
  let announcement;
  if (closed) announcement = t2("watchEnded");
  else if (reconnecting) announcement = t2("reconnecting");
  else if (game.phase === "finished") {
    announcement = game.winner ? t2("watchWinner", { color: sideName(game, game.winner) }) : t2(isBikjangDraw(game) ? "jangiBikjangDraw" : "draw");
  } else if (game.setup) {
    announcement = t2("jangiFormationStatus");
  } else if (game.opening) {
    announcement = openingStatus(game);
  } else announcement = t2("watchTurn", { color: sideName(game, game.turn) });
  const current2 = ply ?? game.moves.length;
  const live = !closed && !reconnecting && game.phase === "playing";
  const heading = ply !== null ? t2("watchReplay", { n: current2 }) : live && !game.opening && !game.setup ? t2(matchMode(game)) + " \xB7 " + t2("movesCount", { n: current2 }) : announcement;
  const status = el("status");
  status.setAttribute("aria-live", live ? "off" : "polite");
  if (status.textContent !== heading) status.textContent = heading;
  if (el("turn-announcement").textContent !== announcement) el("turn-announcement").textContent = announcement;
  el("room-bar").hidden = reviewRoomAction.hidden = el("invite").hidden = true;
  el("review").hidden = false;
  const place = el("place");
  place.dataset.placementState = "inactive";
  el("place-state").hidden = !live;
  el("place-state").textContent = announcement;
  place.removeAttribute("data-ncq-main");
  const lowerLabel = t2(game.setup && live ? game.setup === (game.black ?? 1) ? "jangiFormationActive" : "jangiFormationWaiting" : live && game.turn === (game.black ?? 1) ? "turnActive" : "turnWaiting");
  el("place-text").textContent = lowerLabel;
  place.setAttribute("aria-label", lowerLabel);
  place.title = lowerLabel;
  renderPlayers(game, true, true);
  renderReplayControls(current2, game.moves.length, true);
  board.removeAttribute("inert");
  drawGamePosition(game, current2);
}
var version2 = window.NCQ?.NCQ_VERSION;
el("app-version").textContent = version2 ? "v" + version2 : "dev";
function loadMatchAds() {
  try {
    const saved = JSON.parse(localStorage.getItem(matchAdsKey));
    if (Array.isArray(saved?.freeRounds) && Number.isFinite(saved.lastShownAt)) return saved;
  } catch {
  }
  return matchAds;
}
function saveMatchAds(next) {
  matchAds = next;
  try {
    localStorage.setItem(matchAdsKey, JSON.stringify(next));
  } catch {
  }
}
function recordCompletedRound(roundKey) {
  const progress = loadMatchAds();
  if (progress.freeRounds.includes(roundKey)) return;
  if (progress.freeRounds.length < adFreeRounds) {
    saveMatchAds({ ...progress, freeRounds: [...progress.freeRounds, roundKey] });
    return;
  }
  pendingMatchAdRound = roundKey;
}
async function showReturnAd(roundKey = null) {
  const shell = document.querySelector(".shell");
  const eligibleProgress = () => {
    if (lobbyView !== "lobby" || adsRemoved || adPurchaseBusy || document.hidden || room || archive || spectator || matchmaking || document.querySelector("dialog[open]") || window.NcqFeedback?.isOpen()) return null;
    const progress = loadMatchAds();
    if (progress.freeRounds.length < adFreeRounds || roundKey && progress.lastAttemptedRound === roundKey || Date.now() - progress.lastShownAt < matchAdCooldown) return null;
    return progress;
  };
  if (shell.inert || !NcqAds?.can("MATCH_END") || !eligibleProgress()) return;
  const focused2 = document.activeElement;
  const show = async () => {
    const progress = eligibleProgress();
    if (!progress) return;
    if (roundKey) saveMatchAds({ ...progress, lastAttemptedRound: roundKey });
    stopPlacementSound();
    haptics.stop();
    if (await NcqAds.interstitial("MATCH_END")) saveMatchAds({ ...loadMatchAds(), lastShownAt: Date.now() });
  };
  shell.inert = true;
  try {
    await adOwnershipReady;
    if (navigator.locks) {
      await navigator.locks.request(matchAdsKey, { ifAvailable: true }, (lock) => lock && show());
    } else {
      await show();
    }
  } catch {
  } finally {
    shell.inert = false;
    if (focused2 instanceof HTMLElement && document.activeElement === document.body) focused2.focus({ preventScroll: true });
  }
}
function applyState(next) {
  if (next.summaryOnly) next = mergeFinishedRoom(room, next, loadRecords());
  if (room?.code === next.code && next.version <= room.version && !(room.summaryOnly && !next.summaryOnly)) {
    if (next.version === room.version) {
      room = {
        ...room,
        ...next.players ? { players: next.players } : {},
        clock: next.clock,
        formationEndsAt: next.formationEndsAt,
        serverNow: next.serverNow,
        turnEndsAt: next.turnEndsAt,
        turnSeconds: next.turnSeconds
      };
      turnDeadline = clockDeadline(next);
    }
    const receipt = authSession?.player + ":" + next.code + ":" + next.round;
    if (next.phase === "finished" && !recordReceipts.has(receipt) && saveRecord(next)) acknowledgeRecord(next);
    return;
  }
  const sameRound = room?.code === next.code && room.round === next.round;
  const previewConfirmed = confirmsPlacement(pendingPlacement, next);
  if (pendingPlacement && pendingPlacement.code === next.code) pendingPlacement = null;
  const movingSeat = sameRound ? room.turn : void 0;
  const freshResult = sameRound && room.phase === "playing" && next.phase === "finished";
  const showResult = next.phase === "finished" && (!sameRound || room.phase !== "finished");
  const newMoveCount = sameRound && room.phase === "playing" ? next.moves.length - room.moves.length : 0;
  room = next;
  if (bikjangDialog.open && !validBikjangConfirmation(bikjangPending)) bikjangDialog.close("cancel");
  if (leaveDialog.open && (!sameRound || room.phase === "finished")) leaveDialog.close("cancel");
  turnDeadline = clockDeadline(next);
  selected = null;
  selectedFrom = null;
  if (showResult) {
    awaitingResultDismissal = true;
    reviewPly = room.moves.length;
    if (room.mode === "tournament") void loadRankings("weekly", 1, void 0, false, -1);
  }
  if (room.phase !== "finished") {
    awaitingResultDismissal = false;
    rankCelebration.close();
    resultDialog.close();
  }
  if (room.phase !== "finished") recordShareDialog.close();
  if (room.phase !== "waiting") el("share").close();
  if (room.phase !== "playing") matchIntroDialog.close();
  const roundKey = room.code + ":" + room.round;
  const metricKey = "matjjangjangi.round";
  const tracked = sessionStorage.getItem(metricKey);
  if (room.phase === "playing" && tracked !== roundKey) {
    sessionStorage.setItem(metricKey, roundKey);
    window.NcqMetrics?.levelStart("online");
  }
  if (room.phase === "finished" && tracked === roundKey) {
    sessionStorage.removeItem(metricKey);
    window.NcqMetrics?.levelEnd("online", room.winner ? room.winner === room.you : void 0);
    if (room.moves.length) recordCompletedRound(roundKey);
    void recordMissionRound(room);
  }
  if (room.phase === "finished" && saveRecord(room)) acknowledgeRecord(room);
  render();
  const placement = newMoveCount === 1 && !previewConfirmed ? presentRoundPlacement(next, next.moves.length - 1, movingSeat) : void 0;
  if (sameRound && movingSeat !== next.you && next.turn === next.you && next.phase === "playing" && (newMoveCount === 0 || next.moves.at(-1) == null)) {
    haptics.once(`turn:${roundHapticKey(next)}:${next.moves.length}:${next.turn}`, "light");
  }
  if (showResult) {
    const openResult = () => {
      if (room?.code !== next.code || room.round !== next.round || room.phase !== "finished" || resultDialog.open) return;
      if (profileDialog.open) profileDialog.close();
      resultDialog.removeAttribute("data-promotion-revealed");
      resultDialog.showModal();
      render();
      if (freshResult && !resultDialog.hasAttribute("data-promoted")) {
        haptics.once("result:" + roundHapticKey(next), describeOutcome(next) === "won" ? "success" : "light");
      }
      void playRankPromotion(next, freshResult);
      refreshPlayerCard(-1);
    };
    if (newMoveCount > 0) {
      void Promise.resolve(placement).then(() => setTimeout(openResult, 1e3));
    } else {
      openResult();
    }
  }
}
async function exitRoom(message = "", { showAd = false, openRankings = true } = {}) {
  const tournamentMatch = room?.mode === "tournament";
  const adRound = showAd && room?.phase === "finished" ? pendingMatchAdRound : null;
  stream?.close();
  stream = null;
  connected = false;
  pendingMatchAdRound = null;
  awaitingResultDismissal = false;
  cancelPlacement();
  rankCelebration.close();
  resultDialog.close();
  leaveDialog.close("cancel");
  bikjangDialog.close("cancel");
  el("share").close();
  recordShareDialog.close();
  matchIntroDialog.close();
  room = null;
  pendingPlacement = null;
  turnDeadline = null;
  cancelAnimationFrame(turnFrame);
  selected = null;
  selectedFrom = null;
  sessionStorage.removeItem("matjjangjangi.round");
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
  if (tournamentMatch) lobbyView = "lobby";
  feedback("lobby-error", message, Boolean(message));
  render();
  refreshLobby();
  refreshPlayerCard();
  void refreshWallet();
  if (adRound) await showReturnAd(adRound);
  if (tournamentMatch && openRankings) showRankings();
  el(tournamentMatch && openRankings ? "tournament-title" : "start").focus();
}
async function send(path, data = {}) {
  try {
    const response = await fetch("./api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8e3)
    });
    const result = await response.json();
    if (response.ok) return result;
    if (Object.hasOwn(TEXTS.en, result.error)) return { error: result.error };
  } catch {
  }
  return { error: "network" };
}
async function getAuthConfig() {
  await boardStartup;
  if (authConfig) return authConfig;
  const response = await fetch(
    backend ? "./ncq/auth-config.json" : "./api/auth/config",
    { signal: AbortSignal.timeout(4e3) }
  );
  if (!response.ok) throw new Error();
  authConfig = await response.json();
  const platform = window.NCQ?.NCQ_PLATFORM;
  if (platform === "android" || platform === "toss") {
    authConfig = { ...authConfig, platform: platform === "android" ? "googleplay" : "toss" };
  }
  return authConfig;
}
async function openPlayerSession(force) {
  const config = await getAuthConfig();
  if (backend && !config.enabled) throw new Error();
  if (!config.enabled || !force && authSession?.expiresAt > Date.now() + 3e4) return;
  if (!window.NcqAuth) {
    window.NCQ = { ...window.NCQ, NCQ_AUTH: window.NCQ?.NCQ_AUTH ?? {
      url: config.url ?? location.origin,
      game: config.game,
      platform: config.platform,
      environment: config.environment,
      firebase: config.firebase
    } };
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = backend ? "./ncq/auth-sdk.js" : "./api/auth/sdk";
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  if (backend) {
    const { player } = await window.NcqAuth.ready();
    await window.NcqAuth.getToken({ role: "authenticated", expectedPlayer: player });
    authSession = { player, expiresAt: Infinity };
    recordsScope = recordsKey + ":" + player;
    bindRecordHistory(player, true);
    return;
  }
  const { ticket } = await window.NcqAuth.request("/api/auth/session", "POST", {});
  const session = await send("/auth/claim", { ticket });
  if (!session.player) throw new Error();
  authSession = session;
  const scope = recordsKey + ":" + session.player;
  if (recordsScope !== scope) {
    recordsScope = scope;
    records = loadRecords();
  }
  bindRecordHistory(session.player, false);
  await refreshAuthProfile();
}
async function ensureIdentity(force = false) {
  authenticating ??= openPlayerSession(force).finally(() => {
    authenticating = null;
  });
  return authenticating;
}
async function post(path, data = {}, online) {
  await boardStartup;
  if (backend) return remoteRequest(online);
  try {
    await ensureIdentity();
    const result = await send(path, data);
    if (result.error !== "authFailed" || !authConfig?.enabled) return result;
    await ensureIdentity(true);
    return send(path, data);
  } catch {
    return { error: "authFailed" };
  }
}
async function remoteRequest(action) {
  try {
    return await action(backend);
  } catch (error) {
    const code = error.status === 401 ? "authFailed" : error.code;
    return { error: Object.hasOwn(TEXTS.en, code) ? code : "network" };
  }
}
async function run(action, success) {
  if (busy) return;
  busy = true;
  const messageId = room ? "match-error" : "lobby-error";
  feedback(messageId);
  render();
  try {
    const result = await action();
    if (result.error) feedback(messageId, result.error, true);
    else success(result);
  } finally {
    busy = false;
    render();
  }
}
function spectatorUrl(code, viewer) {
  const base2 = boardApiUrl ? boardApiUrl + "/" : document.baseURI;
  const url = new URL("api/spectate/" + encodeURIComponent(code), base2);
  if (viewer) url.searchParams.set("viewer", viewer);
  return url;
}
async function fetchSpectator(code, viewer) {
  try {
    const response = await fetch(spectatorUrl(code, viewer), {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return { error: response.status === 404 ? "notFound" : "network" };
    return await response.json();
  } catch {
    return { error: "network" };
  }
}
function scheduleSpectator(session) {
  if (session.closed || session.game.phase === "finished") return;
  if (backend) {
    session.connection = backend.subscribeRoom(session.game.code, {
      mode: "watch",
      initialState: session.game,
      load: () => fetchSpectator(session.game.code),
      presence: session.viewer ? () => {
        const request = backend.gameRequest(`/spectate/${session.game.code}/presence`, { viewer: session.viewer });
        session.pendingPresence = request;
        return request.finally(() => {
          if (session.pendingPresence === request) session.pendingPresence = null;
        });
      } : false,
      onState: (next) => updateSpectator(session, next),
      onStatus: (status) => {
        if (spectator !== session) return;
        session.reconnecting = status !== "connected";
        render();
      },
      onError: (error) => {
        if (spectator !== session) return;
        session.closed = (error.error ?? error.code) === "notFound";
        session.reconnecting = !session.closed;
        if (session.closed) session.connection?.close();
        render();
      }
    });
    return;
  }
  session.timer = setTimeout(() => pollSpectator(session), 1e3);
}
function updateSpectator(session, next) {
  if (spectator !== session || next.error) return;
  const previous = session.game;
  session.game = next;
  session.deadline = clockDeadline(next);
  if (previous.round !== next.round) session.ply = null;
  session.reconnecting = false;
  render();
  if (session.ply === null && previous.round === next.round && next.moves.length === previous.moves.length + 1) {
    presentRoundPlacement(next, next.moves.length - 1);
  }
}
async function pollSpectator(session) {
  if (!document.hidden) {
    const renew = session.viewer && performance.now() >= session.renewAt;
    const request = fetchSpectator(session.game.code, renew ? session.viewer : null);
    if (renew) session.pendingPresence = request;
    const next = await request;
    if (renew) {
      session.pendingPresence = null;
      if (!next.error) session.renewAt = performance.now() + 5e3;
    }
    if (spectator !== session) return;
    if (next.error) {
      const closed = next.error === "notFound";
      if (!session.reconnecting || closed) {
        session.closed = closed;
        session.reconnecting = !closed;
        render();
      }
    } else if (session.reconnecting || next.version !== session.game.version || next.phase !== session.game.phase) {
      const previous = session.game;
      session.game = next;
      session.deadline = clockDeadline(next);
      if (previous.round !== next.round) session.ply = null;
      session.reconnecting = false;
      render();
      if (session.ply === null && previous.round === next.round && next.moves.length === previous.moves.length + 1) {
        presentRoundPlacement(next, next.moves.length - 1);
      }
    }
  }
  scheduleSpectator(session);
}
async function openSpectator(code) {
  if (room || archive || spectator || matchmaking || busy) return;
  const viewer = crypto.randomUUID?.();
  await run(async () => {
    if (backend) {
      try {
        await ensureIdentity();
      } catch {
        return { error: "authFailed" };
      }
    }
    const game = await fetchSpectator(code, viewer);
    if (game.error !== "notFound") return game;
    refreshLobby();
    return { error: "watchEnded" };
  }, (game) => {
    selected = null;
    selectedFrom = null;
    feedback("match-error");
    spectator = {
      game,
      viewer,
      renewAt: performance.now() + 5e3,
      pendingPresence: null,
      ply: null,
      deadline: clockDeadline(game),
      closed: false,
      reconnecting: false,
      timer: null
    };
    scheduleSpectator(spectator);
  });
  (spectator ? el("status") : el("lobby-heading")).focus();
}
async function releaseSpectator(session) {
  session.connection?.close();
  try {
    await session.pendingPresence;
  } catch {
  }
  try {
    await fetch(spectatorUrl(session.game.code, session.viewer), {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      redirect: "error",
      signal: AbortSignal.timeout(3500)
    });
  } catch {
  }
  refreshLobby();
}
function openRoom(next) {
  lobbyView = "lobby";
  archive = null;
  const url = new URL(location.href);
  url.searchParams.set("room", next.code);
  history.replaceState(null, "", url);
  feedback("match-error");
  connected = true;
  applyState(next);
  el("status").focus();
  connectRoom(next.code);
}
function connectRoom(code) {
  if (backend) {
    let subscription;
    async function failed(error) {
      if (stream !== subscription) return;
      const next = { error: error.error ?? error.code ?? "network" };
      if (["notFound", "forbidden", "authFailed", "tournamentClosed"].includes(next.error)) {
        if (next.error === "notFound") {
          if (room?.phase === "playing") {
            const result = await remoteRequest((client) => client.gameRequest("/results/" + code + "/" + room.round, void 0, -1));
            if (stream !== subscription) return;
            if (room.phase === "playing") {
              if (!result.error && result.state) {
                subscription.close();
                connected = false;
                applyState(restoreResult(room, result, loadRecords()));
                return;
              }
            }
          }
          if (room?.phase === "finished") {
            subscription.close();
            connected = false;
            room.canRematch = false;
            render();
            return;
          }
        }
        exitRoom(["authFailed", "tournamentClosed"].includes(next.error) ? next.error : "closed");
        return;
      }
      connected = false;
      render();
    }
    subscription = backend.subscribeRoom(code, {
      initialState: room,
      onState: (next) => {
        if (stream !== subscription) return;
        connected = true;
        applyState(next);
        render();
      },
      onStatus: (status) => {
        if (stream !== subscription) return;
        connected = status === "connected";
        render();
      },
      onError: (error) => {
        void failed(error);
      }
    });
    stream = subscription;
    return;
  }
  const events = new EventSource("./api/rooms/" + code + "/events");
  stream = events;
  events.addEventListener("state", (event) => {
    if (stream !== events) return;
    connected = true;
    applyState(JSON.parse(event.data));
    render();
  });
  events.addEventListener("closed", () => {
    if (stream === events) exitRoom("closed");
  });
  events.addEventListener("reauth", async () => {
    if (stream !== events) return;
    events.close();
    connected = false;
    render();
    try {
      await ensureIdentity(true);
      if (stream === events) connectRoom(code);
    } catch {
      if (stream === events) exitRoom("authFailed");
    }
  });
  events.onerror = () => {
    if (stream !== events) return;
    connected = false;
    selected = null;
    selectedFrom = null;
    render();
  };
}
function roomAction(action, details, success = applyState) {
  if (!room) return;
  const { code, round } = room;
  const input = { round, ...details };
  return run(async () => {
    const connection = stream;
    connection?.beginWrite?.();
    let next;
    try {
      next = await post("/rooms/" + code + "/" + action, input, (client) => client[action](code, input));
      if (action === "leave" && next.error === "notFound") return {};
      return next;
    } finally {
      if ((!next || next.error) && pendingPlacement) {
        const preview = pendingPlacement;
        pendingPlacement = null;
        cancelPlacement();
        if (room?.code === preview.code && room.round === preview.round && room.version === preview.version) {
          selected = null;
          selectedFrom = preview.from;
        }
      }
      connection?.endWrite?.(next);
      if (!next || next.error) void connection?.sync?.();
    }
  }, (next) => {
    if (room?.code === code) success(next);
  });
}
function join(code) {
  run(() => post(
    "/rooms/" + code + "/join",
    { nickname: ownNickname(), ...placementRequest() },
    (client) => client.join(code)
  ), openRoom);
}
function closeMatching(message = "") {
  const tournamentMatch = matchmaking?.mode === "tournament";
  matchmaking = null;
  el("matchmaking").close();
  feedback("lobby-error", message, Boolean(message));
  render();
  (tournamentMatch ? el("ranking-weekly-tab") : el("start")).focus();
  if (tournamentMatch && lobbyView === "tournament") loadRankings("weekly");
  if (tournamentMatch) void refreshWallet();
}
async function cancelMatching(job) {
  if (job.ticket) await post("/matchmaking/cancel", { ticket: job.ticket }, (client) => client.cancel(job.ticket));
  closeMatching();
}
async function findMatch(job) {
  job.pending = true;
  const input = { ticket: job.ticket, mode: job.mode, rule: job.rule, catchUpCost: job.catchUpCost, ...job.placement };
  const result = await post("/matchmaking", { ...input, nickname: ownNickname() }, (client) => client.match(input));
  job.pending = false;
  job.ticket = result.ticket ?? job.ticket;
  if (job.canceled) return cancelMatching(job);
  if (result.error) {
    closeMatching(result.error === "coinNotEnough" ? "" : result.error);
    if (result.error === "coinNotEnough") showCoinShortage();
  } else if (result.game) {
    closeMatching();
    openRoom(result.game);
    openMatchIntro(result.game);
  } else {
    job.timer = setTimeout(() => findMatch(job), job.mode === "tournament" ? 1250 : 650);
  }
}
function requestCancel() {
  const job = matchmaking;
  if (!job || job.canceled) return;
  job.canceled = true;
  clearTimeout(job.timer);
  render();
  if (!job.pending) cancelMatching(job);
}
function tournamentCoinBalance(status) {
  return serverWallet && serverWallet.version >= status.coinVersion ? serverWallet.coins : status.coins;
}
function startMatching(mode, catchUpCost) {
  if (matchmaking || busy || tournamentCatchUpDialog.open || document.querySelector(".shell").inert) return;
  if (mode === "tournament" && catchUpCost === void 0) {
    const state = rankingResults.weekly;
    const status = state?.result;
    if (state?.loading || status?.error || !Number.isInteger(status?.remaining)) return;
    if (status.remaining === 0) {
      if (!(status.catchUpRemaining > 0)) return;
      if (tournamentCoinBalance(status) < status.catchUpCost) {
        showCoinShortage();
        return;
      }
      tournamentCatchUpQuote = {
        cost: status.catchUpCost,
        missed: status.catchUpRemaining,
        room: room ? { code: room.code, round: room.round } : null
      };
      tournamentCatchUpDialog.returnValue = "";
      tournamentCatchUpDialog.showModal();
      render();
      return;
    }
  }
  if (room) {
    if (mode === "tournament" && room.mode === "tournament" && room.phase === "finished") {
      return startNextMatch("tournament", catchUpCost);
    }
    return;
  }
  const job = { canceled: false, mode, catchUpCost, rule: "janggi", placement: placementRequest() };
  matchmaking = job;
  feedback("lobby-error");
  render();
  el("matchmaking").showModal();
  findMatch(job);
}
tournamentCatchUpDialog.addEventListener("close", () => {
  const quote2 = tournamentCatchUpQuote;
  tournamentCatchUpQuote = void 0;
  const sameRoom = quote2?.room && room?.code === quote2.room.code && room.round === quote2.room.round && room.phase === "finished" && room.mode === "tournament";
  const rankingsEntry = !quote2?.room && !room && lobbyView === "tournament" && rankingTab === "weekly";
  if (tournamentCatchUpDialog.returnValue === "confirm" && quote2 && (sameRoom || rankingsEntry)) {
    startMatching("tournament", quote2.cost);
  }
  if (!matchmaking) render();
});
el("start").addEventListener("click", () => startMatching("casual"));
el("choose-rule")?.addEventListener("click", () => {
  ruleDialog.returnValue = "";
  ruleDialog.showModal();
  render();
});
ruleDialog?.addEventListener("close", () => {
  if (availableRules.includes(ruleDialog.returnValue)) {
    preferredRule = ruleDialog.returnValue;
    try {
      localStorage.setItem("matjjangjangi.rule", preferredRule);
    } catch {
    }
  }
  render();
  el("choose-rule")?.focus();
});
el("refresh-lobby").addEventListener("click", refreshLobby);
el("show-watch").addEventListener("click", () => {
  forest.openWatch();
  render();
  refreshLobby();
});
forest.watchDialog.addEventListener("close", render);
el("cancel-match").addEventListener("click", requestCancel);
el("matchmaking").addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCancel();
});
function openArchive(record) {
  archive = { ...record, phase: "finished" };
  reviewPly = record.moves.length;
  feedback("match-error");
  render();
  el("review-heading").focus();
}
function showRecords() {
  const source = lobbyView;
  run(async () => {
    if (backend) {
      await ensureIdentity();
      await recordHistory?.ready();
      records = loadRecords();
      return {};
    }
    try {
      await ensureIdentity();
      return {};
    } catch {
      return { error: "authFailed" };
    }
  }, () => {
    if (recordsReturnView !== source) recordFilter = "all";
    recordsReturnView = source;
    lobbyView = "records";
    render();
    el("records-heading").focus();
  });
}
el("show-records").addEventListener("click", showRecords);
el("tournament-records").addEventListener("click", showRecords);
function showRankings(tab = "weekly") {
  lobbyView = "tournament";
  rankingTab = tab;
  for (const state of Object.values(rankingResults)) clearTimeout(state.refresh);
  rankingResults = {};
  feedback("lobby-error");
  render();
  el("tournament-title").focus();
  loadRankings(tab);
  void refreshWeeklyRewards();
}
el("show-tournament").addEventListener("click", () => {
  const previous = !weeklyRewards?.participation?.available && weeklyRewards?.ranking?.available;
  showRankings(previous ? "previous" : "weekly");
});
el("show-rankings").addEventListener("click", () => showRankings());
el("join-tournament").addEventListener("click", () => startMatching("tournament"));
for (const button of weeklyRewardButtons) {
  button.addEventListener("click", () => claimWeeklyReward(button.dataset.weeklyReward));
}
var rankingTabs = [...el("ranking-tabs").querySelectorAll("button")];
for (const button of rankingTabs) {
  const tab = button.dataset.ranking;
  button.addEventListener("click", () => {
    if (rankingTab !== tab) haptics.tap();
    rankingTab = tab;
    render();
    if (!rankingResults[tab]) loadRankings(tab);
    if (tab === "rating") void refreshPlayerCard();
  });
  el("ranking-" + tab + "-retry").addEventListener("click", () => {
    el("ranking-" + tab + "-panel").focus();
    loadRankings(tab, rankingResults[tab]?.page);
  });
}
el("ranking-tabs").addEventListener("keydown", (event) => {
  const index2 = rankingTabs.indexOf(event.target);
  const length = rankingTabs.length;
  const destinations = {
    ArrowLeft: (index2 + length - 1) % length,
    ArrowRight: (index2 + 1) % length,
    Home: 0,
    End: length - 1
  };
  const button = rankingTabs[destinations[event.key]];
  if (!button) return;
  event.preventDefault();
  button.focus();
  button.click();
});
for (const [direction, step] of [["prev", -1], ["next", 1]]) {
  el("ranking-" + direction).addEventListener("click", (event) => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") return;
    const state = rankingResults[rankingTab];
    if (state) loadRankings(rankingTab, state.page + step, state.pageSize, true);
  });
}
function resizeRankingPage(size2) {
  if (lobbyView !== "tournament") return;
  const state = rankingResults[rankingTab];
  if (!state?.result || state.result.error || state.pageSize === size2) return;
  const first = (state.page - 1) * state.pageSize;
  loadRankings(rankingTab, Math.floor(first / size2) + 1, size2, true);
}
async function loadRankings(tab, page = 1, pageSize = rankingResults[tab]?.pageSize ?? rankingPageTarget, reusePages = false, cooldown = 3) {
  const previous = rankingResults[tab];
  if (!backend || cooldown >= 0 && previous?.loading && previous.page === page && previous.pageSize === pageSize) return;
  clearTimeout(previous?.refresh);
  const source = reusePages && previous?.source || new RankingPages(
    tab,
    (path) => remoteRequest((client) => client.gameRequest(path, void 0, cooldown))
  );
  const state = { page, pageSize, source, result: previous?.result, loading: true };
  rankingResults[tab] = state;
  const visible = () => rankingResults[tab] === state && (lobbyView === "tournament" && rankingTab === tab || tab === "weekly" && room?.mode === "tournament" && room.phase === "finished");
  if (visible()) render();
  state.result = await source.page(page, pageSize);
  state.loading = false;
  if (rankingResults[tab] !== state) return;
  state.page = state.result.page;
  const { resetsAt, serverNow, finalized, finalizesAt } = state.result;
  const refreshAt = tab === "previous" && finalized === false ? finalizesAt : resetsAt;
  const refreshAfter = Date.parse(refreshAt) - Date.parse(serverNow);
  if (Number.isFinite(refreshAfter)) {
    state.refresh = setTimeout(() => {
      if (rankingResults[tab] !== state) return;
      delete rankingResults[tab];
      if (lobbyView === "tournament" && rankingTab === tab || tab === "weekly" && room?.mode === "tournament" && room.phase === "finished") {
        loadRankings(tab, state.page, state.pageSize, false, -1);
      }
    }, Math.max(1e3, refreshAfter + 100));
  }
  if (visible()) {
    render();
  }
}
function rankingPlayerName(row) {
  return row.you ? ownNickname() : displayNickname(row.nickname || t2("playerAlias", { alias: row.alias }));
}
function rankingCard(row, tab, index2) {
  const card = el("ranking-card-template").content.firstElementChild.cloneNode(true);
  const own2 = row.you;
  const key = own2 ? "self" : row.alias ? "alias:" + row.alias : "entry:" + index2;
  card.dataset.rankingPlayer = key;
  card.addEventListener("click", () => openPlayerProfile(void 0, { row, tab, key }));
  card.toggleAttribute("data-own-ranking", Boolean(own2));
  const place = card.querySelector(".ranking-place");
  place.textContent = ratingNumber(row.rank);
  place.title = t2("rankingPosition", { rank: ratingNumber(row.rank) });
  if (row.rank <= 3) place.dataset.medal = row.rank;
  const badge = card.querySelector(".player-card-badge");
  badge.hidden = !own2;
  if (own2) badge.textContent = t2("playerInfo");
  const photo = card.querySelector("img");
  photo.addEventListener("error", () => {
    photo.hidden = true;
  }, { once: true });
  setRecordPhoto(photo, own2 ? { photoUrl: playerPhoto } : row);
  const rank = card.querySelector(".player-card-rank");
  const label = recordRank({ rating: own2 ? playerStats?.rating ?? row.rating : row.rating });
  rank.textContent = label;
  rank.hidden = !label;
  const name = card.querySelector(".player-card-name");
  name.textContent = name.title = rankingPlayerName(row);
  const record = card.querySelector(".player-card-record");
  record.hidden = ![row.wins, row.draws, row.losses].every(Number.isInteger);
  if (!record.hidden) record.textContent = t2("careerRecord", row) + " \xB7 " + t2("profileWinRate", { rate: winRate(row) });
  card.querySelector(".ranking-card-score strong").textContent = tab === "rating" ? t2("profileRatingValue", { rating: ratingNumber(row.rating) }) : t2("forestRankingPoints", { n: row.points });
  return card;
}
function renderRankings() {
  renderChampionship();
  for (const button of rankingTabs) {
    const selected2 = button.dataset.ranking === rankingTab;
    button.setAttribute("aria-selected", String(selected2));
    button.tabIndex = selected2 ? 0 : -1;
    el(button.getAttribute("aria-controls")).hidden = !selected2;
  }
  const rating = rankingTab === "rating";
  const previous = rankingTab === "previous";
  const state = rankingResults[rankingTab];
  const result = state?.result;
  const rows = result?.standings ?? [];
  const summary = el("ranking-" + rankingTab + "-summary");
  summary.hidden = !result || Boolean(result.error);
  if (!summary.hidden) {
    const total = result.total ?? rows.length;
    summary.querySelector("span").textContent = t2("rankingPlayerCount", { n: total, count: ratingNumber(total) });
  }
  const message = el("ranking-" + rankingTab + "-message");
  const empty = rating ? "noRatingStandings" : previous ? result?.finalized === false ? "tournamentFinalizing" : "noPreviousStandings" : "noStandings";
  message.textContent = t2(!backend ? "rankingsUnavailable" : result?.error ? "rankingsLoadFailed" : result ? empty : "rankingsLoading");
  message.hidden = rows.length > 0;
  el("ranking-" + rankingTab + "-retry").hidden = !result?.error;
  const standings = rating ? "rating-standings" : previous ? "previous-standings" : "standings";
  el(standings).replaceChildren(...rows.map((row, index2) => {
    const entry = document.createElement("li");
    entry.append(rankingCard(row, rankingTab, index2));
    return entry;
  }));
  if (!rating) {
    const dates = el("ranking-" + rankingTab + "-dates");
    dates.hidden = !result?.startsAt;
    if (!dates.hidden) {
      const date2 = (value) => NcqLang.date(value, { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
      dates.textContent = date2(Date.parse(result.startsAt)) + " \u2013 " + date2(Date.parse(result.endsAt) - 1);
      el("forest-championship-period").textContent = championshipPeriod(Date.parse(result.startsAt), Date.parse(result.endsAt));
      if (previous) dates.textContent += " \xB7 " + t2(result.finalized ? "tournamentFinalized" : "tournamentFinalizing");
    }
  }
  const page = state?.page ?? 1;
  const pages = result?.pages ?? 1;
  const pagination = el("ranking-pagination");
  pagination.hidden = !result || page === 1 && pages === 1;
  el("ranking-page").textContent = t2("rankingPageOf", { page: ratingNumber(page), pages: ratingNumber(pages) });
  el("ranking-page").setAttribute("aria-label", t2("rankingPage", { page: ratingNumber(page) }));
  el("ranking-prev").setAttribute("aria-disabled", String(page === 1 || state?.loading === true));
  el("ranking-next").setAttribute("aria-disabled", String(Boolean(result?.error) || !result?.hasMore || state?.loading === true));
}
function closeLobbyMenu(event) {
  render();
  if (lobbyView === "lobby" && !event.currentTarget.open) void showReturnAd();
}
async function showLobby() {
  if (lobbyView === "lobby") return;
  const fromRecords = lobbyView === "records";
  lobbyView = "lobby";
  feedback("lobby-error");
  render();
  refreshLobby();
  void refreshWeeklyRewards();
  await showReturnAd();
  el(fromRecords ? "show-records" : "start").focus();
}
el("show-lobby").addEventListener("click", showLobby);
el("records-back").addEventListener("click", showLobby);
el("record-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  if (recordFilter !== button.dataset.filter) haptics.tap();
  recordFilter = button.dataset.filter;
  renderRecords();
  el("record-list").parentElement.scrollTop = 0;
});
function leaveMatch() {
  if (spectator) {
    const session = spectator;
    session.connection?.close();
    clearTimeout(session.timer);
    cancelAnimationFrame(turnFrame);
    spectator = null;
    cancelPlacement();
    render();
    forest.openWatch();
    render();
    refreshLobby();
    if (session.viewer) releaseSpectator(session);
    el("lobby-heading").focus();
    return;
  }
  if (archive) {
    cancelPlacement();
    const sharedView = archive.sharedView;
    const id = archive.id;
    archive = null;
    if (sharedView) {
      const url = new URL(location.href);
      url.hash = "";
      history.replaceState(null, "", url);
      render();
      refreshLobby();
      refreshPlayerCard();
      el("start").focus();
      return;
    }
    render();
    const row = Array.from(el("record-list").children).find((item) => item.dataset.recordId === id);
    (row?.querySelector(".record-open") ?? el("records-heading")).focus();
    return;
  }
  if (!room || busy || leaveDialog.open) return;
  if (room.phase === "finished") return leaveCurrentRoom();
  leaveDialogRoom = { code: room.code, round: room.round };
  leaveDialog.returnValue = "";
  renderLeaveConfirmation();
  leaveDialog.showModal();
  render();
  el("leave-dialog-title").focus();
}
function isResigning(game) {
  return game?.phase === "playing" && (game.moves.length > 0 || game.passed || game.mode === "tournament");
}
function renderLeaveConfirmation() {
  el("leave-dialog-message").textContent = t2(isResigning(room) ? "confirmResign" : "confirmLeave");
}
function leaveCurrentRoom() {
  const finished = room?.phase === "finished";
  if (finished && !connected) return exitRoom("", { showAd: true });
  const resigning = isResigning(room);
  roomAction("leave", {}, (next) => {
    if (next.phase === "finished") {
      if (resigning) void recordMissionRound(next);
      if (saveRecord(next)) acknowledgeRecord(next);
    }
    void exitRoom("", { showAd: finished });
  });
}
async function startNextMatch(mode = "casual", catchUpCost) {
  if (busy || nextMatchPending || !room || room.phase !== "finished" || room.mode === "tournament" !== (mode === "tournament") || document.querySelector(".shell").inert) return;
  nextMatchPending = true;
  render();
  try {
    if (connected) {
      let left = false;
      await roomAction("leave", {}, (next) => {
        if (next.phase === "finished" && saveRecord(next)) acknowledgeRecord(next);
        left = true;
      });
      if (!left) return;
    }
    await exitRoom("", { showAd: true, openRankings: mode !== "tournament" });
    if (mode === "tournament") {
      lobbyView = "tournament";
      rankingTab = "weekly";
      render();
    }
    startMatching(mode, catchUpCost);
  } finally {
    nextMatchPending = false;
    render();
  }
}
leaveDialog.addEventListener("close", () => {
  if (leaveDialog.open) return;
  const target = leaveDialogRoom;
  leaveDialogRoom = null;
  render();
  if (leaveDialog.returnValue !== "leave" || busy || !target || room?.code !== target.code || room.round !== target.round) return;
  leaveCurrentRoom();
});
el("leave").addEventListener("click", leaveMatch);
el("watch-back").addEventListener("click", leaveMatch);
el("leave-match").addEventListener("click", leaveMatch);
el("review-back").addEventListener("click", leaveMatch);
reviewExit.addEventListener("click", leaveMatch);
reviewMoveNumbers.addEventListener("click", () => {
  showMoveNumbers = !showMoveNumbers;
  render();
});
el("review-favorite").addEventListener("click", (event) => {
  const button = event.currentTarget;
  markFavorite(button, toggleFavorite(button.dataset.recordId));
});
for (const side of ["opponent", "own"]) {
  const image = el("review-" + side + "-photo");
  image.addEventListener("error", () => {
    image.hidden = true;
  });
}
function validBikjangConfirmation(target) {
  return target && room?.code === target.code && room.round === target.round && room.version === target.version && room.phase === "playing" && room.turn === room.you && !room.setup && connected && !busy && (turnDeadline === null || performance.now() < turnDeadline);
}
bikjangDialog.addEventListener("close", () => {
  if (bikjangDialog.open) return;
  const target = bikjangPending, accepted = bikjangDialog.returnValue === "accept";
  bikjangPending = null;
  render();
  if (!validBikjangConfirmation(target)) return;
  selectedFrom = target.from;
  if (accepted) movePiece(target.index, target);
  else {
    render();
    focusCell(target.from);
  }
});
function movePiece(index2, confirmation = null) {
  if (!canAct() || selectedFrom === null) return;
  const preview = previewPlacement(room, selectedFrom, index2);
  if (!preview) return;
  if (endsInBikjangDraw(room, { type: "move", from: preview.from, to: preview.index }) && !(validBikjangConfirmation(confirmation) && confirmation.from === preview.from && confirmation.index === preview.index)) {
    bikjangPending = preview;
    bikjangDialog.returnValue = "cancel";
    bikjangDialog.showModal();
    render();
    el("bikjang-cancel").focus();
    return;
  }
  pendingPlacement = preview;
  selected = null;
  selectedFrom = null;
  render();
  void presentPlacement(preview.index, room.placementStyles?.[room.you - 1], (delay) => haptics.once(
    `move:${roundHapticKey(room)}:${preview.ply}`,
    "medium",
    {
      delay,
      valid: () => room?.code === preview.code && room.round === preview.round && !archive && !spectator
    }
  ), preview.from);
  roomAction("move", { from: preview.from, index: preview.index, version: preview.version });
}
el("opening-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-opening]");
  if (!button || button.hidden || !canAct()) return;
  roomAction("move", { action: { type: button.dataset.opening }, version: room.version });
});
reviewRoomAction.addEventListener("click", () => {
  if (reviewRoomAction.dataset.action === "leave") leaveMatch();
  else if (reviewRoomAction.dataset.action === "next") void startNextMatch();
  else roomAction("rematch", placementRequest());
});
el("review").addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  const game = room ?? archive ?? spectator?.game;
  if (!button || button.disabled || !spectator && game?.phase !== "finished") return;
  const step = button.dataset.step;
  const last = game.moves.length;
  const before = spectator ? spectator.ply ?? last : reviewPly;
  const destination2 = { first: 0, previous: before - 1, next: before + 1, last };
  const ply = Math.max(0, Math.min(last, destination2[step]));
  if (spectator) spectator.ply = ply === last ? null : ply;
  else reviewPly = ply;
  render();
  if (step === "next" && ply > before) presentRoundPlacement(game, before);
  else cancelPlacement();
  if (button.disabled) {
    el("review").querySelector(ply ? '[data-step="previous"]' : '[data-step="next"]').focus();
  }
});
rankCelebration.addEventListener("click", () => rankCelebration.close());
rankCelebration.addEventListener("close", () => {
  if (rankCelebration.open) return;
  cancelPromotionHaptic?.();
  cancelPromotionHaptic = void 0;
  clearTimeout(promotionCloseTimer);
  if (resultDialog.open) el("result-confirm").focus({ preventScroll: true });
});
resultDialog.addEventListener("close", () => {
  if (resultDialog.open) return;
  rankCelebration.close();
  awaitingResultDismissal = false;
  render();
  if (room?.phase === "finished") el("review-heading").focus();
});
el("share").addEventListener("close", render);
el("invite").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", room.code);
  try {
    await navigator.clipboard.writeText(url.href);
    feedback("match-error", "copied");
  } catch {
    el("share-url").value = url.href;
    el("share").showModal();
    render();
    el("share-url").select();
  }
});
function focusCell(index2) {
  cells[focused].tabIndex = -1;
  focused = index2;
  cells[focused].tabIndex = 0;
  cells[focused].focus({ preventScroll: true });
}
board.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || !canAct() || room.setup) return;
  const index2 = Number(cell.dataset.index);
  cancelPlacement();
  if (sideOf(room.board[index2]) === room.you) {
    selectedFrom = selectedFrom === index2 ? null : index2;
    selected = null;
  } else if (targetsFrom(room, selectedFrom).includes(index2)) {
    focusCell(index2);
    feedback("match-error");
    movePiece(index2);
    return;
  } else {
    haptics.once(`invalid:${roundHapticKey(room)}:${room.moves.length}:${index2}`, "error");
    feedback("match-error", "invalidMove", true);
    return;
  }
  haptics.tap();
  focusCell(index2);
  feedback("match-error");
  render();
});
board.addEventListener("keydown", (event) => {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  const next = focused + offset;
  if (next < 0 || next >= cells.length) return;
  if (Math.abs(offset) === 1 && Math.floor(next / size) !== Math.floor(focused / size)) return;
  focusCell(next);
});
try {
  const config = await (await fetch("./ncq/board-config.json", { signal: AbortSignal.timeout(3500) })).json();
  if (config.enabled !== false && /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/(?:ncq-board\/)?matjjangjangi$/.test(config.apiUrl)) {
    backend = NcqBoard.create({
      apiUrl: config.apiUrl,
      region: config.region,
      async getToken(options) {
        await ensureIdentity();
        return window.NcqAuth.getToken({ ...options, expectedPlayer: authSession.player });
      }
    });
    boardApiUrl = config.apiUrl;
    availableRules = ["janggi"];
    const response = await fetch(boardApiUrl + "/api/rules", {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(1800)
    });
    if (response.ok) {
      const rules = await response.json();
      if (Array.isArray(rules)) availableRules = Object.keys(ruleNames).filter((rule) => rules.includes(rule));
    }
  }
} catch {
} finally {
  finishBoardStartup();
}
function sharedRecordToken() {
  return new URLSearchParams(location.hash.slice(1)).get("record");
}
async function loadSharedRecord(shareId2) {
  if (!boardApiUrl || !recordTokenPattern.test(shareId2)) {
    feedback("lobby-error", "recordSharedUnavailable", true);
    return;
  }
  try {
    const response = await fetch(boardApiUrl + "/api/shared-records/" + shareId2, {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8e3)
    });
    if (response.status === 404) {
      feedback("lobby-error", "recordSharedUnavailable", true);
      return;
    }
    if (!response.ok) throw new Error();
    const record = await response.json();
    openArchive({ ...record, id: shareId2, shareId: shareId2, sharedView: true, you: record.black === 2 ? 1 : 2 });
  } catch {
    feedback("lobby-error", "network", true);
  }
}
var adOwnershipReady = initializeAdPurchase();
var shareId = sharedRecordToken();
if (shareId !== null) {
  await loadSharedRecord(shareId);
} else {
  const inviteCode = new URL(location.href).searchParams.get("room") ?? "";
  if (backend ? recordTokenPattern.test(inviteCode) : /^[A-Z2-9]{6}$/i.test(inviteCode)) {
    join(backend ? inviteCode : inviteCode.toUpperCase());
  }
}
window.addEventListener("hashchange", () => {
  if (sharedRecordToken() !== null || archive?.sharedView) location.reload();
});
if (!backend) bindRecordHistory("device", false);
render();
scheduleMissionReset();
if (lobbyView === "tournament" && !rankingResults[rankingTab]) loadRankings(rankingTab);
refreshLobby();
for (const image of [...playerPhotos, el("profile-photo"), el("match-intro-opponent-photo")]) {
  image.addEventListener("load", () => {
    image.hidden = !image.hasAttribute("src");
  });
  image.addEventListener("error", () => {
    image.hidden = true;
  });
}
if (shareId === null) {
  refreshPlayerCard();
  void refreshWallet();
  void refreshWeeklyRewards();
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    dailyPuzzle.dayChanged();
    renderDailyMissions();
    presentCoinReward();
    void refreshWallet();
    void refreshWeeklyRewards();
  }
  refreshLobby();
});
setInterval(refreshLobby, 2500);
function renderJangiFormation(game) {
  const dialog = el("jangi-formation");
  const show = room && game === room && game.phase === "playing" && game.setup === game.you && !matchIntroDialog.open;
  if (show) renderFormationPicker(dialog, game, { t: t2, busy, localPieceStyle: shopState.appearance.stones });
  if (show && !dialog.open) {
    dialog.showModal();
    NcqLang.apply?.();
  } else if (!show && dialog.open) dialog.close();
}
el("jangi-formation").addEventListener("cancel", (event) => event.preventDefault());
el("jangi-formation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy || !room || room.setup !== room.you) return;
  const formation = Number(new FormData(event.currentTarget).get("formation"));
  roomAction("move", { action: { type: "formation", formation }, version: room.version });
});
matchIntroDialog.addEventListener("close", () => render());
