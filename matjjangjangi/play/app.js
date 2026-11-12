// game/rules.js
var KING = 1;
var GUARD = 2;
var ROOK = 3;
var CANNON = 4;
var HORSE = 5;
var ELEPHANT = 6;
var SOLDIER = 7;
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
var positionKey = ({ board: board2, turn }) => board2.join(",") + ":" + turn;

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
function drawJangiBoard({ game, displayedBoard, cells: cells2, selectedFrom: selectedFrom2, selected: selected2, lastMoveMarker: lastMoveMarker2, board: board2, selectable, coordinate: coordinate2, t: t3, latest, moveNumbers }) {
  const targets = selectable ? targetsFrom(game, selectedFrom2) : [];
  const checked = inCheck(displayedBoard, game.turn);
  const flipped = game.you === 2;
  board2.dataset.jangi = "";
  board2.classList.toggle("selectable", selectable);
  const move = game.moves[(latest ? game.moves.length : game.displayPly) - 1];
  const last = destination(move), lastCell = cells2[last];
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
    const token = cell.firstElementChild;
    const preview = target && !piece ? displayedBoard[selectedFrom2] : piece;
    token.hidden = !preview;
    token.dataset.kind = Math.abs(preview);
    token.className = "stone " + (sideOf(preview) === 2 ? "white" : "black");
    token.textContent = preview ? GLYPHS[sideOf(preview)][Math.abs(preview) - 1] : "";
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
  image.src = "./assets/jangi-lobby.svg";
  for (const image2 of document.querySelectorAll(".logo-stones image,.start-stones image")) image2.setAttribute("href", "./assets/jangi-pair.svg");
  const preview = document.querySelector(".appearance-preview-grid");
  if (preview) {
    for (const cell of preview.querySelectorAll(".cell")) cell.remove();
    for (const [index2, piece] of initial().board.entries()) {
      if (!piece) continue;
      const cell = document.createElement("span");
      cell.className = "cell";
      cell.dataset.stone = sideOf(piece);
      cell.style.gridArea = `${Math.floor(index2 / 9) + 1} / ${index2 % 9 + 1}`;
      const token = document.createElement("span");
      token.className = "stone " + (piece > 0 ? "black" : "white");
      token.dataset.kind = Math.abs(piece);
      token.textContent = GLYPHS[sideOf(piece)][Math.abs(piece) - 1];
      cell.append(token);
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
    selectStone: "\uC774\uB3D9\uD560 \uAE30\uBB3C\uACFC \uBAA9\uC801\uC9C0\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
    placeSelectHint: "\uAE30\uBB3C\xB7\uBAA9\uC801\uC9C0 \uC120\uD0DD",
    placeReadyHint: "\uC120\uD0DD \uC644\uB8CC",
    shopStones: "\uC7A5\uAE30\uB9D0",
    shopBoard: "\uC7A5\uAE30\uD310",
    recordPlayGame: "\uC7A5\uAE30 \uB450\uB7EC \uAC00\uAE30",
    jangiEmpty: "\uBE48 \uC790\uB9AC",
    jangiCheck: "\uC7A5\uAD70! \uAD81\uC744 \uC9C0\uD0A4\uB294 \uC218\uB97C \uB450\uC138\uC694.",
    jangiBikjang: "\uBE45\uC7A5\uC785\uB2C8\uB2E4. \uB9C8\uC8FC \uBCF4\uB294 \uAD81\uC744 \uD480\uAC70\uB098 \uD55C \uC218 \uC27C\uC73C\uB85C \uC218\uB77D\uD558\uC138\uC694.",
    jangiFormation: "\uB9C8\uC0C1 \uCC28\uB9BC",
    jangiFormationWait: "\uC0C1\uB300\uAC00 \uB9C8\uC0C1 \uCC28\uB9BC\uC744 \uACE0\uB974\uACE0 \uC788\uC5B4\uC694.",
    jangiFormationChoose: "\uB0B4 \uB9C8\uC0C1 \uCC28\uB9BC\uC744 \uACE0\uB974\uC138\uC694.",
    jangiFormation0: "\uB9C8\xB7\uC0C1 / \uC0C1\xB7\uB9C8",
    jangiFormation1: "\uC0C1\xB7\uB9C8 / \uC0C1\xB7\uB9C8",
    jangiFormation2: "\uB9C8\xB7\uC0C1 / \uB9C8\xB7\uC0C1",
    jangiFormation3: "\uC0C1\xB7\uB9C8 / \uB9C8\xB7\uC0C1",
    jangiFormationConfirm: "\uCC28\uB9BC \uD655\uC815",
    jangiFormationHint: "\uB0B4 \uC9C4\uC601\uC5D0\uC11C \uBCF8 \uC67C\uCABD / \uC624\uB978\uCABD \uC21C\uC11C\uC608\uC694. \uD55C\uC774 \uACE0\uB978 \uB4A4 \uCD08\uAC00 \uACE0\uB974\uACE0, \uCD08\uBD80\uD130 \uB461\uB2C8\uB2E4.",
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
    selectStone: "Select your piece and its destination.",
    placeSelectHint: "Select piece & target",
    placeReadyHint: "Ready to move",
    shopStones: "Pieces",
    shopBoard: "Janggi board",
    recordPlayGame: "Play Janggi",
    jangiEmpty: "Empty point",
    jangiCheck: "Check! Protect your general.",
    jangiBikjang: "Bikjang. Break the facing generals or pass to accept a draw.",
    jangiFormation: "Horse & elephant setup",
    jangiFormationWait: "Your opponent is choosing a formation.",
    jangiFormationChoose: "Choose your formation.",
    jangiFormation0: "Horse\xB7Elephant / Elephant\xB7Horse",
    jangiFormation1: "Elephant\xB7Horse / Elephant\xB7Horse",
    jangiFormation2: "Horse\xB7Elephant / Horse\xB7Elephant",
    jangiFormation3: "Elephant\xB7Horse / Horse\xB7Elephant",
    jangiFormationConfirm: "Confirm formation",
    jangiFormationHint: "Left / right from your own seat. Han chooses before Cho; Cho moves first.",
    mustEscapeCheck: "You must escape check.",
    invalidMove: "That move is not legal.",
    notYourPiece: "Select your own piece."
  }
};

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
function apply(root) {
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
  apply();
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
  apply();
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
  apply,
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
function boardError(code, status = 0) {
  return Object.assign(new Error(code), { code, status });
}
function create({ apiUrl, getToken }) {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new TypeError("NcqBoard requires an HTTPS API URL");
  }
  const base2 = url.href.replace(/\/$/, "") + "/api";
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
  async function token(forceRefresh) {
    try {
      const value = await getToken({ forceRefresh });
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
    const response = await fetch(base2 + path, {
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
    join: (code) => request(room2(code, "join"), {}),
    move: (code, input) => request(room2(code, "move"), input),
    leave: (code) => request(room2(code, "leave"), {}),
    rematch: (code, input) => request(room2(code, "rematch"), input),
    profile: (cooldown = 3) => request("/profile", void 0, cooldown),
    gameRequest: request,
    clearCache
  });
}
var NcqBoard = Object.freeze({ create });
if (typeof window !== "undefined") window.NcqBoard = NcqBoard;

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
    shopSakuraPlacementGuide: "Petals scatter as the stone lands. Yours to keep.",
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
    shopSakuraPurchased: "Cherry blossom placement is now equipped.",
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
    engravedGrid: "Dark engraved",
    softGrid: "Light engraved",
    referenceStones: "Signature",
    referenceBoard: "Amber wood",
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
    rematch: "Play again",
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
    shopSakuraPlacementGuide: "\uBC9A\uAF43\uC78E\uC774 \uD769\uC5B4\uC838\uC694. \uD55C \uBC88 \uAD6C\uB9E4\uD558\uBA74 \uACC4\uC18D \uC4F8 \uC218 \uC788\uC5B4\uC694.",
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
    shopSakuraPurchased: "\uBC9A\uAF43 \uCC29\uC218\uB97C \uAD6C\uB9E4\uD558\uACE0 \uC801\uC6A9\uD588\uC5B4\uC694.",
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
    engravedGrid: "\uC9C4\uD55C \uC74C\uAC01",
    softGrid: "\uC605\uC740 \uC74C\uAC01",
    referenceStones: "\uB9DE\uC9F1 \uB3CC",
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
    rematch: "\uB2E4\uC2DC \uB300\uACB0",
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
  shop: ["icons/shop", 242, 231, [9, 8, 225, 214]]
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
  resource(el2("start"), "primary", "start-surface", [934, 155, 62, 77]);
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
var listDialogReference = { width: 678, height: 1430, border: 2 };
function listDialogFrameHeight(available, scale) {
  return Math.min(available, listDialogReference.height * scale);
}
function installListDialog(dialog, { title, close, icon, tabs, onResize = () => {
} }) {
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
    const scale = dialog.clientWidth / designWidth;
    const style = getComputedStyle(dialog);
    const available = parseFloat(style.maxHeight) || innerHeight - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0) - 20;
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
  art2(el2("join-tournament"), "primary", "ranking-primary-surface", [622, 96, 55, 46]);
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
    const scale = Math.min(1, width / missionReference.screen[0], height / missionReference.screen[1]);
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

// app.js
for (const language of ["ko", "en"]) Object.assign(TEXTS[language], JANGI_TEXTS[language]);
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
  sakura: { price: 150, purchased: "shopSakuraPurchased" },
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
var room = null;
var stream = null;
var connected = false;
var busy = false;
var reviewPly = 0;
var awaitingResultDismissal = false;
var promotionCloseTimer;
var showMoveNumbers = false;
var archive = null;
var spectator = null;
var lobbyView = "lobby";
var recordsReturnView = "lobby";
var recordsScope = recordsKey;
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
var gaugeObserver = new ResizeObserver((entries) => {
  const inset = 4;
  for (const { target, contentRect: { width, height } } of entries) {
    if (height <= 2 * inset || width < height) continue;
    const right = width - inset;
    const bottom = height - inset;
    const radius = height / 2 - inset;
    target.querySelector("path").setAttribute(
      "d",
      `M ${width / 2} ${inset} H ${right - radius}
       A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom} H ${inset + radius}
       A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset} Z`
    );
  }
});
for (const id of ["place-gauge", "opponent-gauge"]) gaugeObserver.observe(el(id));
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
    const fitted = fitBoardFrame(width, (height - Math.max(216, controlsHeight())) * 9 / 10, inset, border);
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
  nicknameInput.value = nicknameOverride;
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
el("show-options").addEventListener("click", () => {
  feedback("restore-feedback");
  feedback("player-id-feedback");
  feedbackButton.hidden = Boolean(room ?? archive ?? spectator) || !window.NcqFeedback?.can();
  optionsDialog.showModal();
  render();
});
optionsDialog.addEventListener("close", closeLobbyMenu);
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
feedbackButton.addEventListener("click", () => {
  optionsDialog.close();
  window.NcqFeedback.open();
});
window.ncqBack = () => {
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
  if (document.hidden) stopPlacementSound();
  else if (placementAudio) unlockPlacementAudio();
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
      drag = { id: event.pointerId, x: event.clientX, scroll: row.scrollLeft };
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
    row.scrollLeft = drag.scroll - distance;
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
    row.scrollLeft += cardBounds.left - rowBounds.left + (cardBounds.width - rowBounds.width) / 2;
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
    shopTab = tab;
    feedback("shop-feedback");
    renderShop();
    shop.querySelector(".shop-content").scrollTop = 0;
  });
}
for (const input of shopRadios) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    shopPreview[input.name] = input.value;
    feedback("shop-feedback");
    renderShop();
  });
}
shopAction.addEventListener("click", () => saveShopSelection(shopAction.hasAttribute("data-purchase")));
el("shop-claim-test-coins").addEventListener("click", claimTestCoins);
for (const { button, effect } of shopEffectOptions) {
  button.addEventListener("click", () => {
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
el("language").addEventListener("change", (event) => NcqLang.set(event.target.value));
NcqLang.onChange(render);
function loadShopState(fallback2) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(appearanceKey) ?? localStorage.getItem(legacyAppearanceKey));
  } catch {
  }
  if (!saved && fallback2) return fallback2;
  const appearance = {
    stones: Object.hasOwn(skinPrices.stones, saved?.stones) ? saved.stones : "reference",
    board: Object.hasOwn(skinPrices.board, saved?.board) ? saved.board : "reference",
    grid: saved?.grid === "soft" ? "soft" : "engraved"
  };
  const ownedSkins = new Set(Array.isArray(saved?.ownedSkins) ? saved.ownedSkins : []);
  for (const kind of skinKinds) {
    if (skinPrices[kind][appearance[kind]] > 0) ownedSkins.add(kind + ":" + appearance[kind]);
  }
  return {
    appearance,
    ownedSkins: [...ownedSkins]
  };
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
function koreaDay(timestamp) {
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
  if (effect === "sakura") return serverWallet?.sakuraOwned === true;
  return placementUntil(effect) > Date.now();
}
function placementRequest() {
  if (!backend && !ownsPlacement(placementStyle)) return { placementStyle: "plain" };
  return { placementStyle, ...!backend ? { placementUntil: placementUntil(placementStyle) } : {} };
}
function applyWallet(next) {
  if (next.error || !Number.isInteger(next.coins)) return false;
  if (!serverWallet || next.version >= serverWallet.version && next.day >= serverWallet.day && (next.day !== serverWallet.day || next.count >= serverWallet.count)) {
    serverWallet = next;
  }
  return true;
}
async function refreshWallet(cooldown = 3) {
  if (!backend) return;
  const next = await remoteRequest((client) => client.gameRequest("/wallet", void 0, cooldown));
  if (applyWallet(next)) {
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
  const today = koreaDay(Date.now());
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
  const day = koreaDay(Date.now());
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
  coinRewardQueue.push({ coins, source, player: authSession?.player });
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
    render();
    el("coin-reward-title").focus();
    return;
  }
}
function scheduleMissionReset() {
  setTimeout(() => {
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
  const timed = Boolean(placementEffects[selection].expiry);
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
  const sakura = effect === "sakura";
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
      if (!sakura) effectPurchaseIds[effect] ??= crypto.randomUUID();
      const path = sakura ? "/wallet/buy-sakura" : effect === "golden" ? "/wallet/buy-effect" : "/wallet/buy-placement";
      const data = sakura ? {} : { requestId: effectPurchaseIds[effect], effect };
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
function presentPlacement(index2, style) {
  if (index2 == null || document.hidden) return;
  const cell = cells[index2];
  if (!cell || !["1", "2"].includes(cell.dataset.stone) || cell.classList.contains("selected")) return;
  cancelPlacement();
  if (reducedMotion.matches) {
    playPlacementSound(0);
    return;
  }
  const landingTime = !el("placement-timing").hidden && placementTimingAvailable() ? replayPlacementDuration : placementTiming.landing;
  cell.classList.add("placing");
  const contactTime = landingTime * 0.4;
  const animation = animateStonePlacement(cell, lastMoveMarker, {
    duration: landingTime,
    shouldContinue: () => !document.hidden && !cell.classList.contains("selected") && cell.dataset.stone !== "0",
    onStart() {
      playPlacementSound(contactTime / 1e3);
      if (placementEffects[style]?.price) void playPlacementEffect(cell, style, contactTime, landingTime);
    }
  });
  activePlacement = { cell, animation };
  return animation.finished.catch(() => {
  }).finally(() => {
    if (activePlacement?.animation !== animation) return;
    activePlacement = null;
    cell.classList.remove("placing");
  });
}
function presentRoundPlacement(game, ply) {
  return presentPlacement(destination(game.moves[ply]), game.placementStyles?.[game.moveSeats?.[ply] - 1]);
}
function coordinate(index2) {
  return columns[index2 % size] + (Math.floor(index2 / size) + 1);
}
function canAct() {
  return room?.phase === "playing" && room.turn === room.you && connected && !busy && !matchIntroDialog.open && !leaveDialog.open && (turnDeadline === null || performance.now() < turnDeadline);
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
  if (game.mode === "tournament") return "weeklyTournament";
  if (game.rule === "taraguchi") return "ruleTaraguchiShort";
  return ruleNames[game.rule] ?? "onlineMatch";
}
function recordModeLabel(game) {
  const mode = t2(game.mode === "tournament" ? "weeklyTournament" : "casualMatch");
  return game.rule ? mode + " \xB7 " + t2(ruleNames[game.rule]) : mode;
}
function moveColor(game, ply) {
  return game.moveColors?.[ply] ?? ply % 2 + 1;
}
function clockDeadline(game) {
  return game.phase === "playing" && game.turnSeconds > 0 && Number.isFinite(game.turnEndsAt) && Number.isFinite(game.serverNow) ? performance.now() + Math.max(0, game.turnEndsAt - game.serverNow) : null;
}
function updateTurnClock(now, deadline, secondsPerTurn, ownTurn, watching) {
  const remaining = Math.max(0, deadline - now);
  const activeClock = ownTurn ? ownClock : opponentClock;
  const progress = ownTurn ? ownProgress : opponentProgress;
  const seconds = String(Math.ceil(remaining / 1e3)).padStart(2, "0");
  if (activeClock.textContent !== seconds) {
    activeClock.getAnimations().forEach((animation) => animation.cancel());
    activeClock.textContent = seconds;
    if (!reducedMotion.matches) activeClock.animate([
      { offset: 0, transform: "translateY(2px) scale(.88)", easing: "cubic-bezier(.16, 1, .3, 1)" },
      { offset: 0.22, transform: "translateY(-5px) scale(1.55)", easing: "cubic-bezier(.45, 0, .75, 1)" },
      { offset: 0.48, transform: "translateY(1.5px) scale(.92)", easing: "cubic-bezier(.16, 1, .3, 1)" },
      { offset: 0.7, transform: "translateY(-2px) scale(1.22)", easing: "ease-in-out" },
      { offset: 1, transform: "translateY(0) scale(1)" }
    ], { duration: 700 });
  }
  const percent = Math.min(100, remaining / (secondsPerTurn * 1e3) * 100);
  progress.style.setProperty("--match-art-progress", percent.toFixed(2));
  progress.toggleAttribute("data-empty", remaining === 0);
  if (remaining > 0) {
    turnFrame = requestAnimationFrame((time) => updateTurnClock(time, deadline, secondsPerTurn, ownTurn, watching));
  } else if (!watching) {
    const place = el("place");
    place.disabled = true;
    place.dataset.placementState = "inactive";
    el("place-state").hidden = true;
    board.classList.remove("selectable");
    for (const cell of cells) cell.setAttribute("aria-disabled", "true");
  }
}
function resetTurnGauge(clock, progress, text) {
  clock.getAnimations().forEach((animation) => animation.cancel());
  clock.textContent = text;
  progress.style.removeProperty("--match-art-progress");
  progress.removeAttribute("data-empty");
}
function ownNickname() {
  return nicknameOverride || playerNickname || t2("guestNickname");
}
function renderPlayers(game, showPanels, watching = false) {
  cancelAnimationFrame(turnFrame);
  for (const id of ["opponent-panel", "own-panel"]) el(id).hidden = !showPanels;
  el("live-actions").hidden = !showPanels || watching;
  for (const id of ["opponent-profile", "own-profile"]) el(id).disabled = watching || game.phase === "finished";
  const reviewing = !showPanels && game.phase === "finished";
  el("player-bar").hidden = showPanels || reviewing;
  if (reviewing) return;
  if (!showPanels) {
    for (const [color, seat] of [["black", 1], ["white", 2]]) {
      const profile = recordPlayer(game, seat);
      el(color + "-player-label").textContent = game.you === seat ? ownNickname() : profile.name;
      el(color + "-profile").disabled = game.phase === "waiting" && game.you !== seat;
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
  el("opponent-turn").textContent = t2(opponentTurn ? "turnActive" : "turnWaiting");
  for (const [side, seat] of [["own", lowerSeat], ["opponent", 3 - lowerSeat]]) {
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
    stone.setAttribute("aria-label", t2(color));
  }
  for (const id of ["place-gauge", "opponent-gauge", "place-divider", "opponent-divider", "own-clock", "opponent-clock"]) {
    el(id).toggleAttribute("hidden", !watching && deadline === null);
  }
  if (!live || deadline === null) {
    if (watching) {
      resetTurnGauge(ownClock, ownProgress, "\u2014");
      resetTurnGauge(opponentClock, opponentProgress, "\u2014");
    }
    return;
  }
  const idleClock = ownTurn ? opponentClock : ownClock;
  const idleProgress = ownTurn ? opponentProgress : ownProgress;
  resetTurnGauge(idleClock, idleProgress, String(Math.ceil(game.turnSeconds)).padStart(2, "0"));
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
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function saveRecord(game) {
  const id = game.id + ":" + game.round;
  const existing = new Map([...records, ...loadRecords()].map((record) => [record.id, record]));
  const {
    number,
    round,
    moves,
    winner,
    line,
    you,
    finishedAt,
    endReason,
    players,
    bot,
    mode,
    rule,
    black,
    moveColors,
    passes,
    moveSeats,
    placementStyles: placementStyles2,
    formations
  } = game;
  existing.set(id, {
    id,
    number,
    round,
    moves,
    winner,
    line,
    you,
    finishedAt,
    endReason,
    players,
    bot,
    mode,
    rule,
    black,
    moveColors,
    passes,
    moveSeats,
    placementStyles: placementStyles2,
    formations
  });
  records = [...existing.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 50);
  try {
    localStorage.setItem(recordsScope, JSON.stringify(records));
  } catch {
  }
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
  if (!game.winner) return t2("draw");
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
  const savedName = profile?.nickname || (profile?.guestCode ? t2("recordGuest", { code: profile.guestCode }) : "");
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
reviewPlay.href = window.NcqShare?.playUrl?.() || publicPlayUrl;
function recordVisibilityPath(game) {
  const code = game.code ?? game.id?.split(":")[0];
  if (!backend || game.device || !recordTokenPattern.test(code) || !Number.isInteger(game.round)) return null;
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
    el("record-share-close").disabled = sharing;
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
    const result = await remoteRequest((client) => client.gameRequest(path, manageVisibility ? void 0 : { public: true }));
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
  const result = await remoteRequest((client) => client.gameRequest(target.path, { public: !target.shareId }));
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
    if (recordDialogTarget?.updating || recordDialogTarget?.sharing) event.preventDefault();
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
    const seatLabel = el(prefix + "seat");
    seatLabel.hidden = Boolean(game.sharedView);
    seatLabel.textContent = [t2(side === "own" ? "you" : "opponent"), t2(color), recordRank(profile)].filter(Boolean).join(" \xB7 ");
    el(prefix + "stone").className = "stone " + color;
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
  const visible = records.filter((game) => recordFilter === "all" || (recordFilter === "favorites" ? saved.has(game.id) : describeOutcome(game) === "won"));
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
  el("result-title").textContent = t2(label);
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
async function playRankPromotion({ code, round }) {
  if (!resultDialog.hasAttribute("data-promoted")) return;
  const ripple = el("result-promotion-ripple").getAnimations().find((animation) => animation.animationName === "promotion-threshold-ripple");
  await ripple?.finished.catch(() => {
  });
  if (!resultDialog.open || room?.code !== code || room.round !== round || room.phase !== "finished") return;
  if (!resultDialog.hasAttribute("data-promoted")) return;
  resultDialog.setAttribute("data-promotion-revealed", "");
  renderResult(room);
  rankCelebration.showModal();
  clearTimeout(promotionCloseTimer);
  promotionCloseTimer = setTimeout(() => rankCelebration.close(), 5e3);
}
function render() {
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
  nicknameInput.placeholder = playerNickname || t2("guestNickname");
  el("language").value = NcqLang.lang;
  if (optionsDialog.open) {
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
  el("watch-back").toggleAttribute("data-ncq-main", Boolean(spectator));
  el("review-header").hidden = !reviewing;
  el("review-opponent-profile").hidden = !reviewing;
  const reviewActionsVisible = reviewing && !profileDialog.open && !recordShareDialog.open;
  reviewShare.hidden = !reviewing || !sharedReview && !recordVisibilityPath(game);
  reviewShare.toggleAttribute("data-ncq-main", reviewActionsVisible && !reviewShare.hidden);
  reviewPlay.hidden = !sharedReview;
  reviewPlay.toggleAttribute("data-ncq-main", reviewActionsVisible && sharedReview);
  el("show-shop").hidden = Boolean(game);
  el("lobby-wallet").hidden = Boolean(game);
  renderCoinBalance();
  if (!game) renderDailyMissions();
  if (shop.open) renderShop();
  const nav = el("lobby-nav");
  nav.hidden = Boolean(game);
  for (const button of nav.querySelectorAll("button[aria-controls]")) {
    if (button.getAttribute("aria-controls") === lobbyView) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    button.disabled = busy;
  }
  const mainAction = !game && !matchmaking && !shop.open && !missionDialog.open && !optionsDialog.open && !forest.watchDialog.open && !ruleDialog?.open && !profileDialog.open && !recordDialogTarget?.dialog.open && !tournamentCatchUpDialog.open && !coinShortageDialog.open && !coinRewardDialog.open;
  el("start").disabled = busy || Boolean(matchmaking);
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
  const showTournamentEntry = inRankings && Boolean(backend) && rankingTab === "weekly";
  const tournamentStatus = rankingResults.weekly?.result;
  const attempts = tournamentStatus?.remaining;
  const catchUp = attempts === 0 && tournamentStatus.catchUpRemaining > 0;
  const enoughCoins = catchUp && tournamentCoinBalance(tournamentStatus) >= tournamentStatus.catchUpCost;
  const attemptsLabel = el("tournament-attempts");
  el("tournament-entry").hidden = !showTournamentEntry;
  attemptsLabel.hidden = attempts !== 0;
  attemptsLabel.textContent = catchUp ? t2(enoughCoins ? "tournamentCatchUp" : "tournamentCatchUpFunds", { n: NcqLang.num(tournamentStatus.catchUpRemaining) }) : t2("tournamentLimit");
  el("join-tournament-label").textContent = catchUp ? t2("joinTournamentCatchUp") : Number.isInteger(attempts) ? t2("joinTournamentAttempts", { remaining: attempts, limit: tournamentStatus.dailyLimit }) : t2("joinTournament");
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
  joinTournament.disabled = busy || Boolean(matchmaking) || !(attempts > 0 || catchUp);
  const joinVisible = showTournamentEntry && !joinTournament.disabled;
  joinTournament.toggleAttribute("data-ncq-main", mainAction && joinVisible);
  el("show-lobby").toggleAttribute("data-ncq-main", mainAction && inRankings && !joinVisible);
  el("records-back").toggleAttribute("data-ncq-main", mainAction && lobbyView === "records");
  if (inLobby) renderLobby();
  renderWeeklyRewards(mainAction);
  if (!el("records").hidden) renderRecords();
  if (inRankings) renderRankings();
  if (inLobby || inRankings) renderPlayerCard();
  forest.render(game, lobbyView);
  if (matchmaking) {
    const { canceled, mode: mode2, rule } = matchmaking;
    el("queue-status").textContent = t2(canceled ? "canceling" : mode2 === "tournament" ? "tournamentWaiting" : "findingOpponent");
    el("queue-rule").textContent = t2(ruleNames[rule]);
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
  for (const id of ["place", "invite"]) {
    el(id).toggleAttribute("data-ncq-main", !awaitingReview && !profileDialog.open && !matchIntroDialog.open && !leaveDialog.open);
  }
  const openingActions = el("opening-actions");
  openingActions.hidden = !canAct() || !maySwap(game) && !mayOffer(game);
  for (const button of openingActions.querySelectorAll("button")) {
    button.hidden = button.dataset.opening === "swap" ? !maySwap(game) : !mayOffer(game);
    button.toggleAttribute("data-ncq-main", !openingActions.hidden && !button.hidden);
  }
  const pass = el("pass-turn");
  pass.hidden = !playing || Boolean(game.setup);
  pass.disabled = !canAct() || game.board && inCheck(game.board, game.turn);
  let status = "waiting";
  if (finished) status = describeOutcome(game);
  else if (room && !connected) status = "reconnecting";
  else if (playing) status = game.turn === game.you ? "yourTurn" : "theirTurn";
  el("room-label").textContent = t2(archive ? "records" : "room");
  el("room-id").textContent = "#" + game.number;
  const mode = matchMode(game);
  const heading = playing && connected ? game.opening ? openingStatus(game) : t2(mode) + " \xB7 " + t2("movesCount", { n: game.moves.length }) : t2(status);
  if (el("status").textContent !== heading) el("status").textContent = heading;
  el("status").setAttribute("aria-live", playing ? "off" : "polite");
  const announcement = game.opening ? heading : t2(status);
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
  place.disabled = !actionable || selected === null;
  const placementState = !actionable ? "inactive" : selected === null ? "selecting" : "ready";
  place.dataset.placementState = placementState;
  const placeState = el("place-state");
  placeState.hidden = placementState === "inactive";
  if (!placeState.hidden) placeState.textContent = t2(placementState === "selecting" ? "placeSelectHint" : "placeReadyHint");
  el("place-text").textContent = t2(game.opening === "offerFive" ? "offerShort" : game.opening === "pickFive" ? "pickShort" : "placeStone");
  const placeLabel = game.turn !== game.you ? t2("theirTurn") : selected === null ? t2("selectStone") : t2("place", { cell: coordinate(selected) });
  place.setAttribute("aria-label", placeLabel);
  place.title = placeLabel;
  renderPlayers(game, liveLayout);
  el("review").hidden = !reviewing;
  const canRematch = Boolean(room) && !game.bot && game.mode !== "tournament" && game.canRematch !== false && game.endReason !== "resign" && game.endReason !== "disconnect";
  reviewRoomAction.hidden = !reviewing;
  reviewRoomAction.toggleAttribute("data-ncq-main", reviewActionsVisible);
  reviewRoomAction.dataset.action = canRematch ? "rematch" : "leave";
  reviewRoomAction.disabled = busy || canRematch && (!connected || game.requested);
  reviewRoomAction.textContent = t2(!canRematch ? "leave" : game.requested ? "rematchWaiting" : game.rematch ? "rematchReady" : "rematch");
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
    duration: replayPlacementDuration,
    contact: Math.round(replayPlacementDuration * 0.4)
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
  const displayedBoard = latest && game.board ? game.board : replayBoard(game, ply);
  const moveNumbers = reviewing && showMoveNumbers ? Array(90).fill(0) : null;
  if (moveNumbers) for (let n = 0; n < ply; n++) {
    const move = game.moves[n];
    if (typeof move === "object") {
      moveNumbers[move.from] = 0;
      moveNumbers[move.to] = n + 1;
    }
  }
  game.displayPly = ply;
  drawJangiBoard({ game, displayedBoard, cells, selectedFrom, selected, lastMoveMarker, board, selectable: canAct() && !game.setup, coordinate, t: t2, latest, moveNumbers });
  if (!reviewing && game.phase === "playing" && !game.setup && game.board) {
    const hint = inCheck(game.board, game.turn) ? "jangiCheck" : game.bikjang ? "jangiBikjang" : null;
    if (hint) el("status").textContent = t2(hint);
  }
}
function renderSpectator({ game, closed, reconnecting, ply }) {
  let announcement;
  if (closed) announcement = t2("watchEnded");
  else if (reconnecting) announcement = t2("reconnecting");
  else if (game.phase === "finished") {
    announcement = game.winner ? t2("watchWinner", { color: sideName(game, game.winner) }) : t2("draw");
  } else if (game.opening) {
    announcement = openingStatus(game);
  } else announcement = t2("watchTurn", { color: sideName(game, game.turn) });
  const current2 = ply ?? game.moves.length;
  const live = !closed && !reconnecting && game.phase === "playing";
  const heading = ply !== null ? t2("watchReplay", { n: current2 }) : live && !game.opening ? t2(matchMode(game)) + " \xB7 " + t2("movesCount", { n: current2 }) : announcement;
  const status = el("status");
  status.setAttribute("aria-live", live ? "off" : "polite");
  if (status.textContent !== heading) status.textContent = heading;
  if (el("turn-announcement").textContent !== announcement) el("turn-announcement").textContent = announcement;
  el("room-bar").hidden = reviewRoomAction.hidden = el("invite").hidden = true;
  el("review").hidden = false;
  const place = el("place");
  place.disabled = true;
  place.dataset.placementState = "inactive";
  el("place-state").hidden = true;
  place.removeAttribute("data-ncq-main");
  const lowerLabel = t2(live && game.turn === (game.black ?? 1) ? "turnActive" : "turnWaiting");
  el("place-text").textContent = lowerLabel;
  place.setAttribute("aria-label", lowerLabel);
  place.title = lowerLabel;
  renderPlayers(game, true, true);
  renderReplayControls(current2, game.moves.length, true);
  board.removeAttribute("inert");
  drawGamePosition(game, current2);
}
var version = window.NCQ?.NCQ_VERSION;
el("app-version").textContent = version ? "v" + version : "dev";
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
  if (room?.code === next.code && next.version <= room.version) {
    if (next.version === room.version && next.players) room = { ...room, players: next.players };
    return;
  }
  const sameRound = room?.code === next.code && room.round === next.round;
  const showResult = next.phase === "finished" && (!sameRound || room.phase !== "finished");
  const newMoveCount = sameRound && room.phase === "playing" ? next.moves.length - room.moves.length : 0;
  room = next;
  if (leaveDialog.open && (!sameRound || room.phase === "finished")) leaveDialog.close("cancel");
  turnDeadline = clockDeadline(next);
  selected = null;
  selectedFrom = null;
  if (showResult) {
    awaitingResultDismissal = true;
    reviewPly = room.moves.length;
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
  if (room.phase === "finished" && !backend) saveRecord(room);
  render();
  const placement = newMoveCount === 1 ? presentRoundPlacement(next, next.moves.length - 1) : void 0;
  if (showResult) {
    const openResult = () => {
      if (room?.code !== next.code || room.round !== next.round || room.phase !== "finished" || resultDialog.open) return;
      if (profileDialog.open) profileDialog.close();
      resultDialog.removeAttribute("data-promotion-revealed");
      resultDialog.showModal();
      render();
      void playRankPromotion(next);
      refreshPlayerCard(-1);
    };
    if (newMoveCount > 0) {
      void Promise.resolve(placement).then(() => setTimeout(openResult, 1e3));
    } else {
      openResult();
    }
  }
}
async function exitRoom(message = "", { showAd = false } = {}) {
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
  el("share").close();
  recordShareDialog.close();
  matchIntroDialog.close();
  room = null;
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
  if (tournamentMatch) showRankings();
  el(tournamentMatch ? "tournament-title" : "start").focus();
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
  if (authConfig) return authConfig;
  const response = await fetch(
    backend ? "./ncq/auth-config.json" : "./api/auth/config",
    { signal: AbortSignal.timeout(4e3) }
  );
  if (!response.ok) throw new Error();
  authConfig = await response.json();
  if (window.NCQ?.NCQ_PLATFORM === "toss") authConfig = { ...authConfig, platform: "toss" };
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
    authSession = { player, expiresAt: Infinity };
    recordsScope = recordsKey + ":" + player;
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
  await refreshAuthProfile();
}
async function ensureIdentity(force = false) {
  authenticating ??= openPlayerSession(force).finally(() => {
    authenticating = null;
  });
  return authenticating;
}
async function post(path, data = {}, online) {
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
  session.timer = setTimeout(() => pollSpectator(session), 1e3);
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
  await session.pendingPresence;
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
    let timer;
    const polling = { close: () => clearTimeout(timer) };
    stream = polling;
    async function refresh() {
      if (stream !== polling) return;
      const next = await remoteRequest((client) => client.state(code));
      if (stream !== polling) return;
      if (["notFound", "forbidden", "authFailed", "tournamentClosed"].includes(next.error)) {
        if (next.error === "notFound") {
          if (room?.phase === "playing") {
            const history2 = await remoteRequest((client) => client.gameRequest("/records", void 0, -1));
            if (stream !== polling) return;
            if (room.phase === "playing") {
              const result = Array.isArray(history2) && history2.find((record) => record.id === code + ":" + room.round);
              if (result) {
                connected = false;
                applyState({ ...result, code, phase: "finished", version: room.version + 1, canRematch: false });
                return;
              }
            }
          }
          if (room?.phase === "finished") {
            connected = false;
            room.canRematch = false;
            render();
            return;
          }
        }
        exitRoom(["authFailed", "tournamentClosed"].includes(next.error) ? next.error : "closed");
        return;
      }
      connected = !next.error;
      if (connected) applyState(next);
      render();
      const botWait = next.botMoveAt - next.serverNow;
      const activeDelay = botWait > 0 ? Math.min(900, Math.max(25, botWait)) : 900;
      timer = setTimeout(refresh, room?.phase === "finished" || document.hidden ? 2500 : activeDelay);
    }
    refresh();
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
  run(async () => {
    const next = await post("/rooms/" + code + "/" + action, input, (client) => client[action](code, input));
    if (action === "leave" && next.error === "notFound") return {};
    return next;
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
    const status = rankingResults.weekly?.result;
    if (!Number.isInteger(status?.remaining)) return;
    if (status.remaining === 0) {
      if (!(status.catchUpRemaining > 0)) return;
      if (tournamentCoinBalance(status) < status.catchUpCost) {
        showCoinShortage();
        return;
      }
      tournamentCatchUpQuote = { cost: status.catchUpCost, missed: status.catchUpRemaining };
      tournamentCatchUpDialog.returnValue = "";
      tournamentCatchUpDialog.showModal();
      render();
      return;
    }
  }
  const job = { canceled: false, mode, catchUpCost, rule: "janggi", placement: placementRequest() };
  matchmaking = job;
  feedback("lobby-error");
  render();
  el("matchmaking").showModal();
  findMatch(job);
}
tournamentCatchUpDialog.addEventListener("close", () => {
  const quote = tournamentCatchUpQuote;
  tournamentCatchUpQuote = void 0;
  if (tournamentCatchUpDialog.returnValue === "confirm" && quote && lobbyView === "tournament" && rankingTab === "weekly") {
    startMatching("tournament", quote.cost);
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
  const tournamentOnly = source === "tournament";
  run(async () => {
    if (backend) {
      const result = await remoteRequest((client) => client.gameRequest(tournamentOnly ? "/records?mode=tournament" : "/records"));
      if (Array.isArray(result)) {
        const device = tournamentOnly ? [] : [...loadRecords(), ...loadRecords(recordsKey)].map((game) => [game.id, { ...game, device: true }]);
        const remote = tournamentOnly ? result.filter((game) => game.mode === "tournament") : result;
        const combined = new Map([...device, ...remote.map((game) => [game.id, game])]);
        records = [...combined.values()].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
      }
      return Array.isArray(result) ? {} : result;
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
async function loadRankings(tab, page = 1, pageSize = rankingResults[tab]?.pageSize ?? rankingPageTarget, reusePages = false) {
  const previous = rankingResults[tab];
  if (!backend || previous?.loading && previous.page === page && previous.pageSize === pageSize) return;
  clearTimeout(previous?.refresh);
  const source = reusePages && previous?.source || new RankingPages(
    tab,
    (path) => remoteRequest((client) => client.gameRequest(path))
  );
  const state = { page, pageSize, source, result: previous?.result, loading: true };
  rankingResults[tab] = state;
  const visible = () => lobbyView === "tournament" && rankingTab === tab && rankingResults[tab] === state;
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
      if (lobbyView === "tournament" && rankingTab === tab) loadRankings(tab, state.page, state.pageSize);
    }, Math.max(1e3, refreshAfter + 100));
  }
  if (visible()) {
    render();
  }
}
function rankingPlayerName(row) {
  return row.you ? ownNickname() : row.nickname || t2("playerAlias", { alias: row.alias });
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
  recordFilter = button.dataset.filter;
  renderRecords();
  el("record-list").parentElement.scrollTop = 0;
});
function leaveMatch() {
  if (spectator) {
    const session = spectator;
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
      if (!backend) saveRecord(next);
    }
    void exitRoom("", { showAd: finished });
  });
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
el("place").addEventListener("click", () => {
  if (canAct() && selected !== null && selectedFrom !== null) roomAction("move", { from: selectedFrom, index: selected, version: room.version });
});
el("opening-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-opening]");
  if (!button || button.hidden || !canAct()) return;
  roomAction("move", { action: { type: button.dataset.opening }, version: room.version });
});
el("pass-turn").addEventListener("click", () => {
  if (!canAct() || room.setup || inCheck(room.board, room.turn)) return;
  if (!window.confirm(t2("confirmPass")) || !canAct()) return;
  roomAction("move", { action: { type: "pass" }, version: room.version });
});
reviewRoomAction.addEventListener("click", () => {
  if (reviewRoomAction.dataset.action === "leave") leaveMatch();
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
  } else if (targetsFrom(room, selectedFrom).includes(index2)) selected = index2;
  else {
    feedback("match-error", "invalidMove", true);
    return;
  }
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
      async getToken({ forceRefresh }) {
        await ensureIdentity();
        return window.NcqAuth.getToken({ forceRefresh, expectedPlayer: authSession.player });
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
  if (show && !dialog.open) {
    dialog.showModal();
    NcqLang.apply?.();
  } else if (!show && dialog.open) dialog.close();
  if (game?.setup) el("status").textContent = t2(game.setup === game.you ? "jangiFormationChoose" : "jangiFormationWait");
}
el("jangi-formation").addEventListener("cancel", (event) => event.preventDefault());
el("jangi-formation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const formation = Number(new FormData(event.currentTarget).get("formation"));
  el("jangi-formation").close();
  roomAction("move", { action: { type: "formation", formation }, version: room.version });
});
matchIntroDialog.addEventListener("close", () => render());
