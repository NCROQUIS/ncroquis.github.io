// 오늘의 네모로직 화면 — 하루 1판 노노그램 (데일리도쿠 안의 두 번째 모드)
// 손맛은 Nonogram.com 기준: 틀린 칸은 바로 고쳐 주고 실수로 세요, 줄을 다 칠하면 남은 칸에 ✕가 자동으로 들어가요,
// 손가락으로 쭉 그으면 한 줄로 여러 칸을 한 번에 칠해요. 다 풀면 숨은 그림이 색으로 드러나요.
import { NcqMetrics } from "./metrics.js";
import { dailyNemo, findHint, nemoStars, nemoShareText, PALETTE } from "./nonogram.js";
import { formatTime, computeStreak, rng } from "./sudoku.js";
import { NcqAds } from "./ads.js";
import { haptic } from "./haptic.js";
import { t, fmtKey } from "./i18n.js";

const $ = (id) => document.getElementById(id);
let D = null;      // main.js가 넘겨주는 도구 (data, 화면 전환, 알림, 다이얼로그 …)
let N = null;      // 지금 푸는 판
let P = null;      // 오늘의 문제 (그림·정답·단서)
let mode = "fill"; // fill | x
let timer = null;
let paused = false;
let stroke = null;
let hintTimer = null;

const data = () => D.getData();
const nemo = () => data().nemo;

export function initNemo(deps) {
  D = deps;
  $("btn-nemo").onclick = () => openNemo();
  $("nemo-back").onclick = () => leaveNemo();
  $("nemo-help").onclick = () => showRules();
  $("nemo-seg").onclick = (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
  $("nemo-hint").onclick = () => useHint();
  $("nemo-cheat").onclick = () => { if (!N || N.done) return; P.solution.forEach((v, i) => { if (v && N.cells[i] !== 1) N.cells[i] = 1; }); checkAllLines(); render(); win(); };
  $("nr-close").onclick = () => closeResult();
  $("nemo-result").addEventListener("click", (e) => { if (e.target.id === "nemo-result") closeResult(); });
  const board = $("nemo-board");
  board.addEventListener("pointerdown", onDown);
  board.addEventListener("pointermove", onMove);
  board.addEventListener("pointerup", onUp);
  board.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", () => { if ($("nemo").classList.contains("active")) layout(); });
  document.addEventListener("keydown", (e) => {
    if (!$("nemo").classList.contains("active")) return;
    if (e.key === "x" || e.key === "X") setMode(mode === "x" ? "fill" : "x");
  });
}

// ---------- 홈 카드 ----------
export function renderNemoCard() {
  const k = D.today();
  const rec = nemo().daily[k];
  const prog = nemo().progress[k];
  const st = computeStreak(nemo().daily, k).current;
  const btn = $("btn-nemo");
  const thumb = $("nemo-thumb");
  if (rec) {
    const p = dailyNemo(k).pic;
    thumb.innerHTML = p.rows.join("").split("").map((c) => `<i style="background:${c === "." ? "transparent" : PALETTE[c]}"></i>`).join("");
    thumb.classList.add("solved");
    $("nemo-card-sub").textContent = t("nemo_card_done", { emoji: p.emoji, pic: p.name, stars: "⭐".repeat(rec.stars), time: formatTime(rec.seconds) }) + (st > 1 ? t("nemo_card_streak", { n: st }) : "");
    btn.textContent = t("see_result"); btn.className = "btn done";
  } else {
    // 답이 아닌 장식 무늬 (날짜 시드) — 오늘 그림의 힌트가 되지 않아요
    const r = rng((k * 7349) >>> 0);
    thumb.innerHTML = Array.from({ length: 100 }, () => `<i class="${r() < 0.28 ? "on" : ""}"></i>`).join("") + "<b>?</b>";
    thumb.classList.remove("solved");
    $("nemo-card-sub").textContent = prog ? t("nemo_card_resume", { time: formatTime(prog.seconds) }) : st > 0 ? t("nemo_card_sub_streak", { n: st }) : t("nemo_sub");
    btn.textContent = prog ? t("continue_solving") : t("start"); btn.className = "btn primary";
  }
}

// ---------- 시작·나가기 ----------
export function openNemo() {
  const k = D.today();
  P = dailyNemo(k);
  if (nemo().daily[k]) { N = null; return showResult(nemo().daily[k], k, true); }
  const saved = nemo().progress[k];
  N = saved && saved.cells?.length === P.size * P.size ? saved : newNemo(k);
  N.done = false; stroke = null; paused = false;
  setMode("fill");
  build(); D.show("nemo"); layout(); render();
  $("nemo-reveal").classList.add("hidden");
  $("nemo-tools").classList.remove("hidden");
  // NCQ_TEST_CHEAT: 정답 채우기 버튼
  $("nemo-cheat").classList.toggle("hidden", !D.isCheat());
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  NcqMetrics.levelStart("nemo");
  if (!nemo().introDone) showRules(true);
}

function newNemo(k) {
  const n = P.size;
  return { dateKey: k, cells: new Array(n * n).fill(0), err: [], auto: [], mistakes: 0, seconds: 0,
    rowMistakes: new Array(n).fill(0), rowHinted: new Array(n).fill(0), hints: 0, done: false };
}

function tick() {
  if (!N || N.done || paused || document.hidden || !$("nemo").classList.contains("active")) return;
  N.seconds++;
  $("nemo-time").textContent = formatTime(N.seconds);
  if (N.seconds % 5 === 0) persist();
}

function persist() {
  if (!N || N.done) return;
  nemo().progress[N.dateKey] = N;
  D.save();
}

export function leaveNemo() {
  persist(); clearInterval(timer); closeHintBox();
  N = null; D.renderHome(); D.show("home");
}

// 토스 뒤로가기: 처리했으면 true
export function nemoBack() {
  if (!$("nemo-result").classList.contains("hidden")) { closeResult(); return true; }
  if ($("nemo").classList.contains("active")) { leaveNemo(); return true; }
  return false;
}

function showRules(first) {
  paused = true;
  const body = document.createElement("div");
  body.className = "nemo-rules";
  body.innerHTML = `
    <div class="rule-demo" aria-hidden="true"><span class="rd-clue">3 1</span><i class="f"></i><i class="f"></i><i class="f"></i><i class="x">✕</i><i class="f"></i></div>
    ${t("nemo_rules")}`;
  D.dialog(first ? t("nemo_title") : t("how_to"), body, [[first ? t("start") : t("got_it"), () => { paused = false; }, "primary"]], () => { paused = false; });
  if (first) { nemo().introDone = true; D.save(); }
}

function setMode(m) {
  mode = m;
  $("nemo-fill").classList.toggle("on", m === "fill");
  $("nemo-x").classList.toggle("on", m === "x");
  haptic("note");
}

// ---------- 판 그리기 ----------
function build() {
  const n = P.size;
  const { rows, cols } = P.clues;
  const html = [`<div class="corner"></div>`];
  cols.forEach((cl, c) => html.push(`<div class="cc ${c % 5 === 4 && c < n - 1 ? "br" : ""}" data-c="${c}">${cl.map((v) => `<span>${v}</span>`).join("")}</div>`));
  for (let r = 0; r < n; r++) {
    html.push(`<div class="rc ${r % 5 === 4 && r < n - 1 ? "bb" : ""}" data-r="${r}">${rows[r].map((v) => `<span>${v}</span>`).join("")}</div>`);
    for (let c = 0; c < n; c++) {
      const cls = [c % 5 === 4 && c < n - 1 ? "br" : "", r % 5 === 4 && r < n - 1 ? "bb" : "", c === n - 1 ? "last-c" : "", r === n - 1 ? "last-r" : ""].join(" ");
      html.push(`<div class="nc ${cls}" data-i="${r * n + c}"></div>`);
    }
  }
  const b = $("nemo-board");
  b.className = "nemo-board";
  b.innerHTML = html.join("");
  b.dataset.size = n;
  const maxRow = Math.max(...rows.map((x) => x.length)), maxCol = Math.max(...cols.map((x) => x.length));
  b.dataset.maxRow = maxRow; b.dataset.maxCol = maxCol;
  $("nemo-mode").textContent = modeLabel();
}

function modeLabel() { return t("nemo_mode", { date: fmtKey(N.dateKey, { month: "short", day: "numeric" }) }); }

// 화면 크기에 맞춰 칸 크기와 단서 칸 너비를 정해요
function layout() {
  const b = $("nemo-board"), wrap = b.parentElement;
  const n = +b.dataset.size, maxRow = +b.dataset.maxRow, maxCol = +b.dataset.maxCol;
  const W = wrap.clientWidth, H = Math.max(wrap.clientHeight, 260);
  let cs = 30;
  for (let k = 0; k < 3; k++) {
    const fs = Math.max(11, Math.min(16, cs * 0.44));
    const lw = maxRow * fs * 0.95 + 10, th = maxCol * fs * 1.12 + 8;
    cs = Math.floor(Math.min((W - lw) / n, (H - th) / n));
    cs = Math.max(22, Math.min(46, cs));
    b.style.setProperty("--fs", `${fs}px`);
    b.style.setProperty("--lw", `${Math.ceil(lw)}px`);
    b.style.setProperty("--th", `${Math.ceil(th)}px`);
  }
  b.style.setProperty("--cs", `${cs}px`);
}

function render() {
  const b = $("nemo-board");
  const cells = b.querySelectorAll(".nc");
  const err = new Set(N.err), auto = new Set(N.auto);
  cells.forEach((el, i) => {
    const v = N.cells[i];
    el.className = el.className.replace(/\b(f|x|err|auto)\b/g, "").replace(/\s+/g, " ").trim();
    if (v === 1) el.classList.add("f");
    if (v === 2) el.classList.add("x");
    if (err.has(i)) el.classList.add("err");
    if (auto.has(i)) el.classList.add("auto");
  });
  const n = P.size;
  for (let r = 0; r < n; r++) b.querySelector(`.rc[data-r="${r}"]`).classList.toggle("ok", lineDone("row", r));
  for (let c = 0; c < n; c++) b.querySelector(`.cc[data-c="${c}"]`).classList.toggle("ok", lineDone("col", c));
  $("nemo-mistakes").textContent = t("mistakes_n", { n: N.mistakes });
  $("nemo-mistakes").classList.toggle("bad", N.mistakes > 0);
  $("nemo-time").textContent = formatTime(N.seconds);
  const hb = $("nemo-hint-badge");
  const h = data().hints;
  hb.textContent = h > 0 ? h : NcqAds.can("HINT") ? "AD" : "0";
  hb.classList.toggle("ad", h <= 0);
}

// ---------- 줄 ----------
const lineCells = (kind, idx) => Array.from({ length: P.size }, (_, t) => (kind === "row" ? idx * P.size + t : t * P.size + idx));
function lineDone(kind, idx) { return lineCells(kind, idx).every((i) => !P.solution[i] || N.cells[i] === 1); }

// 줄을 다 칠하면 남은 칸에 ✕를 자동으로 넣어요
function completeLine(kind, idx) {
  if (!lineDone(kind, idx)) return false;
  let added = false;
  for (const i of lineCells(kind, idx)) if (N.cells[i] === 0) { N.cells[i] = 2; N.auto.push(i); added = true; }
  return added;
}
function checkAllLines() {
  for (let t = 0; t < P.size; t++) { completeLine("row", t); completeLine("col", t); }
}

// ---------- 칠하기 ----------
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.(".nc");
  return el && $("nemo-board").contains(el) ? +el.dataset.i : -1;
}

function onDown(e) {
  if (!N || N.done || paused) return;
  const el = e.target.closest(".nc"); if (!el) return;
  e.preventDefault();
  try { $("nemo-board").setPointerCapture(e.pointerId); } catch { /* 무시 */ }
  const i = +el.dataset.i;
  stroke = { start: i, last: i, axis: null, stopped: false, changed: false };
  closeHintBox();
  apply(i);
  highlight(i);
}

function onMove(e) {
  if (!stroke || stroke.stopped) return;
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i < 0 || i === stroke.last) return;
  const n = P.size;
  const r0 = Math.floor(stroke.start / n), c0 = stroke.start % n;
  const r = Math.floor(i / n), c = i % n;
  if (!stroke.axis) {
    if (r === r0 && c === c0) return;
    stroke.axis = Math.abs(c - c0) >= Math.abs(r - r0) ? "row" : "col";
  }
  // 처음 움직인 방향(가로·세로)으로만 이어서 칠해요
  const target = stroke.axis === "row" ? r0 * n + c : r * n + c0;
  const lr = Math.floor(stroke.last / n), lc = stroke.last % n;
  const tr = Math.floor(target / n), tc = target % n;
  const step = stroke.axis === "row" ? Math.sign(tc - lc) : Math.sign(tr - lr);
  if (!step) return;
  let cur = stroke.last;
  while (cur !== target && !stroke.stopped) {
    cur = stroke.axis === "row" ? cur + step : cur + step * n;
    apply(cur);
    stroke.last = cur;
  }
  highlight(stroke.last);
}

function onUp() {
  if (!stroke) return;
  const s = stroke; stroke = null;
  if (s.changed) persist();
}

function apply(i) {
  const v = N.cells[i];
  if (v !== 0 || N.done) return;
  const n = P.size, r = Math.floor(i / n);
  const want = mode === "fill" ? 1 : 0;
  if (stroke) stroke.changed = true;
  const was = doneLines(i);
  if (P.solution[i] === want) {
    N.cells[i] = want ? 1 : 2;
    if (want) { D.sfx.place(); haptic("place"); } else haptic("note");
  } else {
    // 틀렸어요: 바로 맞는 상태로 고쳐 주고 실수로 세요. 긋던 손가락은 여기서 멈춰요
    N.cells[i] = P.solution[i] ? 1 : 2;
    N.err.push(i);
    N.mistakes++; N.rowMistakes[r]++;
    D.sfx.wrong(); haptic("wrong");
    if (stroke) stroke.stopped = true;
    const el = $("nemo-board").querySelector(`.nc[data-i="${i}"]`);
    el?.classList.add("shake"); setTimeout(() => el?.classList.remove("shake"), 400);
  }
  afterChange(i, was);
}

// 이 칸이 속한 가로·세로 줄이 끝났는지
function doneLines(i) { const n = P.size; return { row: lineDone("row", Math.floor(i / n)), col: lineDone("col", i % n) }; }

function afterChange(i, was) {
  const n = P.size, r = Math.floor(i / n), c = i % n;
  const now = doneLines(i);
  const before = new Set(N.auto);
  if (now.row || now.col) checkAllLines(); // 끝난 줄의 남은 칸에 ✕ (그 ✕로 빈 줄이 함께 끝나기도 해요)
  render();
  N.auto.filter((x) => !before.has(x)).forEach((x) => $("nemo-board").querySelector(`.nc[data-i="${x}"]`)?.classList.add("pop"));
  const newRow = now.row && !was.row, newCol = now.col && !was.col;
  if (newRow || newCol) {
    D.sfx.unit(); haptic("unit");
    if (newRow) flashLine("row", r);
    if (newCol) flashLine("col", c);
  }
  if (P.solution.every((v, x) => !v || N.cells[x] === 1)) win();
}

function flashLine(kind, idx) {
  const b = $("nemo-board");
  const els = lineCells(kind, idx).map((i) => b.querySelector(`.nc[data-i="${i}"]`));
  els.forEach((el, t) => { el.style.animationDelay = `${t * 25}ms`; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
  setTimeout(() => els.forEach((el) => { el.classList.remove("flash"); el.style.animationDelay = ""; }), 700);
}

// 손가락이 있는 칸의 가로·세로 줄과 단서를 옅게 표시해요
function highlight(i) {
  const b = $("nemo-board"), n = P.size, r = Math.floor(i / n), c = i % n;
  b.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
  b.querySelector(`.rc[data-r="${r}"]`)?.classList.add("hl");
  b.querySelector(`.cc[data-c="${c}"]`)?.classList.add("hl");
  b.querySelectorAll(".nc").forEach((el) => { const x = +el.dataset.i; if (Math.floor(x / n) === r || x % n === c) el.classList.add("hl"); });
}

// ---------- 힌트 ----------
async function useHint() {
  if (!N || N.done) return;
  if (data().hints <= 0) {
    if (!NcqAds.can("HINT")) return D.toast(t("toast_no_hints"));
    paused = true;
    // NCQ_ADS_HINT: 힌트 충전 보상형 광고
    const ok = await NcqAds.rewarded("HINT");
    paused = false;
    if (!ok) return;
    data().hints += 1;
  }
  const known = N.cells.map((v) => (v === 1 ? 1 : v === 2 ? 0 : -1));
  let h = findHint(P.clues, known, P.size);
  if (!h) { const i = known.findIndex((v) => v === -1); if (i < 0) return; h = { cell: i, value: P.solution[i], kind: "row", index: Math.floor(i / P.size), clue: P.clues.rows[Math.floor(i / P.size)] }; }
  data().hints--; D.save();
  const n = P.size, r = Math.floor(h.cell / n);
  const was = doneLines(h.cell);
  N.cells[h.cell] = h.value ? 1 : 2;
  N.rowHinted[r]++; N.hints++;
  haptic("hint");
  lastHint = h;
  showHintText();
  $("nemo-hint-box").classList.remove("hidden");
  const b = $("nemo-board");
  b.querySelectorAll(".hint-line,.hint-cell").forEach((el) => el.classList.remove("hint-line", "hint-cell"));
  lineCells(h.kind, h.index).forEach((i) => b.querySelector(`.nc[data-i="${i}"]`)?.classList.add("hint-line"));
  b.querySelector(h.kind === "row" ? `.rc[data-r="${h.index}"]` : `.cc[data-c="${h.index}"]`)?.classList.add("hint-line");
  b.querySelector(`.nc[data-i="${h.cell}"]`)?.classList.add("hint-cell");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(closeHintBox, 6000);
  afterChange(h.cell, was);
  persist();
}
let lastHint = null;
function showHintText() {
  const h = lastHint; if (!h) return;
  const where = t(h.kind === "row" ? "nemo_hint_row" : "nemo_hint_col", { n: h.index + 1 });
  $("nemo-hint-text").innerHTML = t("nemo_hint", { where, clue: h.clue.join(" "), what: t(h.value ? "nemo_hint_fill" : "nemo_hint_empty") });
}
function closeHintBox() {
  clearTimeout(hintTimer);
  $("nemo-hint-box").classList.add("hidden");
  $("nemo-board").querySelectorAll(".hint-line,.hint-cell").forEach((el) => el.classList.remove("hint-line", "hint-cell"));
}

// ---------- 다 풀었을 때 ----------
function win() {
  if (N.done) return;
  N.done = true; clearInterval(timer); stroke = null; closeHintBox();
  const k = N.dateKey;
  const rec = { seconds: N.seconds, mistakes: N.mistakes, stars: nemoStars(N.mistakes), rowMistakes: N.rowMistakes.slice(),
    rowHinted: N.rowHinted.slice(), hints: N.hints, pic: P.pic.id, solvedOn: D.today() };
  NcqMetrics.levelEnd("nemo", true, { score: rec.stars });
  nemo().daily[k] = rec;
  delete nemo().progress[k];
  D.save();
  // 숨은 그림이 대각선으로 물들며 나타나요
  const b = $("nemo-board"), n = P.size;
  const colors = P.pic.rows.join("").split("");
  b.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
  b.querySelectorAll(".nc").forEach((el) => {
    const i = +el.dataset.i, ch = colors[i];
    el.style.setProperty("--pc", ch === "." ? "transparent" : PALETTE[ch]);
    el.style.transitionDelay = `${(Math.floor(i / n) + (i % n)) * 35}ms`;
  });
  b.classList.add("reveal");
  $("nemo-tools").classList.add("hidden");
  const rv = $("nemo-reveal");
  rv.innerHTML = `<span>${P.pic.emoji}</span> ${t("nemo_reveal", { pic: P.pic.name })}`;
  rv.classList.remove("hidden");
  D.sfx.win(); haptic("win");
  setTimeout(() => { if ($("nemo").classList.contains("active")) showResult(rec, k, false); }, 1700);
}

function drawArt(canvas, pic) {
  const ctx = canvas.getContext("2d");
  const n = pic.rows.length, W = canvas.width, s = W / n;
  ctx.clearRect(0, 0, W, W);
  pic.rows.join("").split("").forEach((ch, i) => {
    if (ch === ".") return;
    ctx.fillStyle = PALETTE[ch];
    ctx.fillRect((i % n) * s + 1, Math.floor(i / n) * s + 1, s - 2, s - 2);
  });
}

function showResult(rec, k, fromHome) {
  const pic = dailyNemo(k).pic;
  const streak = computeStreak(nemo().daily, D.today()).current;
  $("nr-stars").innerHTML = [1, 2, 3].map((x) => `<span class="${x <= rec.stars ? "" : "off"}">⭐</span>`).join("");
  $("nr-title").textContent = t("nemo_done", { emoji: pic.emoji, pic: pic.name });
  drawArt($("nr-art"), pic);
  $("nr-time").textContent = formatTime(rec.seconds);
  $("nr-mistakes").textContent = rec.mistakes;
  $("nr-streak").textContent = t("days_n", { n: streak });
  const text = nemoShareText({ dateKey: k, seconds: rec.seconds, mistakes: rec.mistakes, stars: rec.stars, rowMistakes: rec.rowMistakes, rowHinted: rec.rowHinted, streak });
  $("nr-preview").textContent = text;
  $("nr-share").onclick = () => share(text);
  $("nr-close").textContent = fromHome ? t("close") : t("home");
  $("nemo-result").classList.remove("hidden");
}

function closeResult() {
  $("nemo-result").classList.add("hidden");
  if ($("nemo").classList.contains("active")) leaveNemo(); else D.renderHome();
}

async function share(text) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); D.toast(t("toast_copied")); return; } catch { /* 아래로 */ }
  D.toast(t("toast_cant_share"));
}

// 언어가 바뀌면: 홈 카드와 네모로직 화면의 글자를 다시 그려요 (main.js의 NcqLang.onChange에서 불러요)
export function nemoRelang() {
  if (!D) return;
  if ($("home").classList.contains("active")) renderNemoCard();
  if (N && $("nemo").classList.contains("active")) {
    $("nemo-mode").textContent = modeLabel();
    render();
    if (!$("nemo-hint-box").classList.contains("hidden")) showHintText();
  }
}
