// 네모네모 로직(노노그램) — 그림 라이브러리, 단서 계산, 줄 풀이기, 오늘의 그림 고르기
// 오늘의 네모로직은 KST 날짜로 그림을 골라서 모두 같은 문제를 받아요.
// 모든 그림은 '줄 단위 논리만으로(추측 없이)' 풀리는지 tests/nonogram.test.mjs에서 검증해요.
import { rng } from "./sudoku.js";
import { t, fmtKey } from "./i18n.js";

// 그림 색 (풀 때는 모두 같은 색, 다 풀면 이 색으로 드러나요)
export const PALETTE = {
  K: "#2B2D42", R: "#E5484D", O: "#F28C28", Y: "#F2C14E", G: "#56C271", B: "#3182F6",
  L: "#7FB0FF", P: "#F49AC1", N: "#9A6A3A", W: "#EFE3C8", V: "#8E6CEF", A: "#9AA3B5",
};

// 10x10 그림. '.'은 빈칸, 글자는 칠할 칸(글자는 색)
export const PICTURES = [
  { id: "cat", get name() { return t("pic_cat"); }, emoji: "🐱", rows: [
    ".K......K.", ".KK....KK.", ".KKKKKKKK.", "KK.KKKK.KK", "KKKKKKKKKK",
    "KKKKPPKKKK", ".KKKKKKKK.", "..KKKKKK..", "..K.KK.K..", ".KK.KK.KK."] },
  { id: "heart", get name() { return t("pic_heart"); }, emoji: "❤️", rows: [
    "..........", ".RRR..RRR.", "RRRRRRRRRR", "RRRRRRRRRR", "RRRRRRRRRR",
    ".RRRRRRRR.", "..RRRRRR..", "...RRRR...", "....RR....", ".........."] },
  { id: "apple", get name() { return t("pic_apple"); }, emoji: "🍎", rows: [
    "....N.....", "....NGGG..", "..RRNRGG..", ".RRRRRRRR.", "RRRRRRRRRR",
    "RRRRRRRRRR", "RRRRRRRRRR", ".RRRRRRRR.", "..RRRRRR..", "...RR.RR.."] },
  { id: "mushroom", get name() { return t("pic_mushroom"); }, emoji: "🍄", rows: [
    "...RRRR...", ".RRWWRRRR.", "RRWWRRRWRR", "RRRRRRWWWR", "RWWRRRRWRR",
    "RRRRRRRRRR", "...WWWW...", "...WWWW...", "..WWWWWW..", "..WWWWWW.."] },
  { id: "house", get name() { return t("pic_house"); }, emoji: "🏠", rows: [
    "....RR....", "...RRRR...", "..RRRRRR..", ".RRRRRRRR.", "RRRRRRRRRR",
    ".WWWWWWWW.", ".WBBWWNNW.", ".WBBWWNNW.", ".WWWWWNNW.", "GGGGGGGGGG"] },
  { id: "tree", get name() { return t("pic_tree"); }, emoji: "🌲", rows: [
    "....GG....", "...GGGG...", "..GGGGGG..", ".GGGGGGGG.", "...GGGG...",
    "..GGGGGG..", ".GGGGGGGGG", "GGGGGGGGGG", "....NN....", "...NNNN..."] },
  { id: "fish", get name() { return t("pic_fish"); }, emoji: "🐟", rows: [
    "..........", "....BB....", "...BBBB..B", ".BBBBBBBBB", "BB.BBBBBB.",
    "BBBBBBBBB.", ".BBBBBBBBB", "...BBBB..B", "....BB....", ".........."] },
  { id: "umbrella", get name() { return t("pic_umbrella"); }, emoji: "☂️", rows: [
    "....K.....", "..VVVVVV..", ".VVVVVVVV.", "VVVVVVVVVV", "V.V.VV.V.V",
    "....K.....", "....K.....", "....K.....", "..K.K.....", "...K......"] },
  { id: "star", get name() { return t("pic_star"); }, emoji: "⭐", rows: [
    "....YY....", "....YY....", "...YYYY...", "YYYYYYYYYY", ".YYYYYYYY.",
    "..YYYYYY..", "..YYYYYY..", ".YYYYYYYY.", ".YYY..YYY.", "YY......YY"] },
  { id: "dog", get name() { return t("pic_dog"); }, emoji: "🐶", rows: [
    ".NN....NN.", "NNN....NNN", "NNNNNNNNNN", "NN.NNNN.NN", "NNNNNNNNNN",
    ".NNNKKNNN.", ".NNNNNNNN.", "..NNPPNN..", "...NNNN...", ".........."] },
  { id: "coffee", get name() { return t("pic_coffee"); }, emoji: "☕", rows: [
    "..A..A....", "...A..A...", "..A..A....", "..........", "KKKKKKKK..",
    "KKKKKKKKKK", "KKKKKKKK.K", "KKKKKKKKKK", ".KKKKKK...", "KKKKKKKKK."] },
  { id: "rocket", get name() { return t("pic_rocket"); }, emoji: "🚀", rows: [
    "....RR....", "...RRRR...", "...AAAA...", "...ABBA...", "...ABBA...",
    "...AAAA...", "..AAAAAA..", ".RAAAAAAR.", ".RR.OO.RR.", "....OO...."] },
  { id: "duck", get name() { return t("pic_duck"); }, emoji: "🐥", rows: [
    "...YYY....", "..YYYYY...", "..YY.YYOO.", "..YYYYYOO.", "...YYY....",
    "..YYYYYYY.", ".YYYYYYYYY", ".YYYYYYYYY", "..YYYYYYY.", ".........."] },
  { id: "icecream", get name() { return t("pic_icecream"); }, emoji: "🍦", rows: [
    "...PPPP...", "..PPPPPP..", ".PPPPPPPP.", ".PPPPPPPP.", "..YYYYYY..",
    "..YYYYYY..", "...YYYY...", "...YYYY...", "....YY....", "....YY...."] },
  { id: "note", get name() { return t("pic_note"); }, emoji: "🎵", rows: [
    "....KKKKKK", "....KKKKKK", "....K....K", "....K....K", "....K....K",
    "....K....K", "..KKK..KKK", ".KKKK.KKKK", ".KKKK.KKKK", "..KK...KK."] },
  { id: "smile", get name() { return t("pic_smile"); }, emoji: "😊", rows: [
    "..YYYYYY..", ".YYYYYYYY.", "YY.YYYY.YY", "YY.YYYY.YY", "YYYYYYYYYY",
    "Y.YYYYYY.Y", "YY.YYYY.YY", "YYY....YYY", ".YYYYYYYY.", "..YYYYYY.."] },
];

// 그림 → 정답 배열(1 칠함, 0 빈칸)
export function solutionOf(pic) {
  return pic.rows.join("").split("").map((c) => (c === "." ? 0 : 1));
}

// 한 줄의 단서 (예: 1,1,0,1,1,1 → [2,3]). 칠한 칸이 없으면 [0]
export function lineClue(cells) {
  const out = [];
  let run = 0;
  for (const c of cells) { if (c === 1) run++; else if (run) { out.push(run); run = 0; } }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export function cluesOf(solution, size = 10) {
  const rows = [], cols = [];
  for (let r = 0; r < size; r++) rows.push(lineClue(solution.slice(r * size, r * size + size)));
  for (let c = 0; c < size; c++) cols.push(lineClue(Array.from({ length: size }, (_, r) => solution[r * size + c])));
  return { rows, cols };
}

// 줄 풀이기: line은 -1(모름)·0(빈칸)·1(칠함). 이 줄에서 확실해지는 칸을 채운 새 배열, 모순이면 null
export function solveLine(clue, line) {
  const n = line.length;
  const blocks = clue[0] === 0 ? [] : clue;
  const k = blocks.length;
  const feasMemo = new Map();
  const fits = (i, j) => {
    const len = blocks[j];
    if (i + len > n) return false;
    for (let t = i; t < i + len; t++) if (line[t] === 0) return false;
    return i + len === n || line[i + len] !== 1;
  };
  const feas = (i, j) => {
    const key = i * 64 + j;
    if (feasMemo.has(key)) return feasMemo.get(key);
    let ok = false;
    if (j === k) { ok = true; for (let t = i; t < n; t++) if (line[t] === 1) { ok = false; break; } }
    else if (i < n) {
      if (line[i] !== 1 && feas(i + 1, j)) ok = true;
      else if (fits(i, j)) ok = feas(Math.min(n, i + blocks[j] + 1), j + 1);
    }
    feasMemo.set(key, ok);
    return ok;
  };
  if (!feas(0, 0)) return null;
  const canFill = new Array(n).fill(false), canEmpty = new Array(n).fill(false);
  const seen = new Set();
  const visit = (i, j) => {
    const key = i * 64 + j;
    if (seen.has(key)) return;
    seen.add(key);
    if (j === k) { for (let t = i; t < n; t++) canEmpty[t] = true; return; }
    if (i >= n) return;
    if (line[i] !== 1 && feas(i + 1, j)) { canEmpty[i] = true; visit(i + 1, j); }
    if (fits(i, j) && feas(Math.min(n, i + blocks[j] + 1), j + 1)) {
      const len = blocks[j];
      for (let t = i; t < i + len; t++) canFill[t] = true;
      if (i + len < n) canEmpty[i + len] = true;
      visit(Math.min(n, i + len + 1), j + 1);
    }
  };
  visit(0, 0);
  return line.map((v, t) => (v !== -1 ? v : canFill[t] && !canEmpty[t] ? 1 : canEmpty[t] && !canFill[t] ? 0 : -1));
}

const rowIdx = (r, size) => Array.from({ length: size }, (_, c) => r * size + c);
const colIdx = (c, size) => Array.from({ length: size }, (_, r) => r * size + c);
// 줄 목록: { kind: "row"|"col", index, cells: [칸 번호] }
export function linesOf(size = 10) {
  const out = [];
  for (let r = 0; r < size; r++) out.push({ kind: "row", index: r, cells: rowIdx(r, size) });
  for (let c = 0; c < size; c++) out.push({ kind: "col", index: c, cells: colIdx(c, size) });
  return out;
}

// 줄 논리만으로 끝까지 풀어 봐요. 결과 grid(-1 남으면 막힘)와 줄 풀이 횟수
export function lineSolve(clues, size = 10, start = null) {
  const grid = start ? start.slice() : new Array(size * size).fill(-1);
  const lines = linesOf(size);
  let changed = true, passes = 0;
  while (changed) {
    changed = false; passes++;
    for (const L of lines) {
      const clue = L.kind === "row" ? clues.rows[L.index] : clues.cols[L.index];
      const cur = L.cells.map((i) => grid[i]);
      const next = solveLine(clue, cur);
      if (!next) return { grid, ok: false, passes };
      next.forEach((v, t) => { if (v !== cur[t]) { grid[L.cells[t]] = v; changed = true; } });
    }
  }
  return { grid, ok: !grid.includes(-1), passes };
}

// 추측 없이 풀리고 답이 하나인지 (줄 논리로 끝까지 풀리면 답은 하나예요)
export function isLineSolvable(pic) {
  const sol = solutionOf(pic);
  const size = pic.rows.length;
  const res = lineSolve(cluesOf(sol, size), size);
  return res.ok && res.grid.every((v, i) => v === sol[i]);
}

// 힌트: 지금 아는 칸(known: -1/0/1)에서 줄 하나만 보고 확실해지는 칸을 찾아요
export function findHint(clues, known, size = 10) {
  for (const L of linesOf(size)) {
    const clue = L.kind === "row" ? clues.rows[L.index] : clues.cols[L.index];
    const cur = L.cells.map((i) => known[i]);
    const next = solveLine(clue, cur);
    if (!next) continue;
    const t = next.findIndex((v, x) => cur[x] === -1 && v !== -1);
    if (t >= 0) return { cell: L.cells[t], value: next[t], kind: L.kind, index: L.index, clue };
  }
  return null;
}

// 날짜 → 2026-01-01부터 며칠째
function dayNumber(dateKey) {
  const y = Math.floor(dateKey / 10000), m = Math.floor(dateKey / 100) % 100, d = dateKey % 100;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
}

// 오늘의 그림: 그림 수만큼의 날을 한 바퀴로 보고, 바퀴마다 순서를 섞어요 (한 바퀴 안에서는 겹치지 않아요)
export function dailyNemo(dateKey) {
  const N = PICTURES.length;
  const day = dayNumber(dateKey);
  const cycle = Math.floor(day / N);
  const order = Array.from({ length: N }, (_, i) => i);
  const r = rng(((cycle + 1000) * 2654435761) >>> 0);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const index = order[((day % N) + N) % N];
  const pic = PICTURES[index];
  const solution = solutionOf(pic);
  return { index, pic, size: pic.rows.length, solution, clues: cluesOf(solution, pic.rows.length) };
}

export function nemoStars(mistakes) { return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1; }

// 결과 공유 글 — 그림은 비밀로, 줄마다 실수(🟨)·힌트(🟦)·깔끔(🟩)만 보여요
export function nemoShareText({ dateKey, seconds, mistakes, stars, rowMistakes, rowHinted, streak }) {
  const mm = Math.floor(seconds / 60), ss = String(seconds % 60).padStart(2, "0");
  const rows = rowMistakes.map((x, i) => (x > 0 ? "🟨" : rowHinted[i] > 0 ? "🟦" : "🟩")).join("");
  const date = fmtKey(dateKey, { month: "long", day: "numeric" });
  const line = t("nemo_share_line", { stars: "⭐".repeat(stars), time: `${mm}:${ss}`, mistakes: t("share_mistakes", { n: mistakes }) })
    + (streak > 1 ? t("nemo_share_streak", { n: streak }) : "");
  return [t("nemo_share_title", { date }), line, rows, t("nemo_share_cta")].join("\n");
}
