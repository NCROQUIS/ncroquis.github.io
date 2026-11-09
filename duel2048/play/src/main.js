import {
  SIZE, MILESTONES, newGame, move, cloneGame, maxTile, spawn, canMove, revive, replay,
  encodeDuel2, decodeDuel, decodeDuel2, weekKey, weeklySeed, dayKey, dailySeed, prevDayKey, dailyGoal,
  nextRandom, hashSeed,
} from "./game.js";
import { NcqAds } from "./ads.js";
import { NcqIap } from "./iap.js";
import { haptic, mergeKind } from "./haptics.js";
import { createSfx } from "./sound.js";
import { t, getLang, setLang, langList, langTitle, locale } from "./i18n.js";

// ── 저장 ──────────────────────────────────
const KEY = "duel2048:v1";
const FREE_PER_DAY = 3; // 주간 도전·오늘의 판 하루 무료 횟수
const defaults = () => ({
  best: 0,
  bestTile: 0,
  name: "",
  sound: true,
  haptic: true,
  skin: "classic",
  unlocked: ["classic"],
  winStreak: 0,
  winStreakBest: 0,
  weekly: { key: "", best: 0, tile: 0, plays: 0 },
  daily: { date: "", best: 0, plays: 0, streak: 0, lastDone: "" },
  plays: { date: "", weekly: 0, daily: 0 },
  goal: { date: "", prog: 0, done: false }, // 오늘의 목표 진행
  stamps: { n: 0, cards: 0 }, // 목표 도장판: 오늘의 목표를 이루면 도장 1개, 7개면 한 장 완성
  shields: 0,   // 연속 기록 보호권 (7일 연속마다 1개, 최대 2개)
  noAds: false, // 광고 제거를 샀는지 (NCQ_IAP_REMOVE_ADS). 진행 초기화해도 남겨요
  duels: {},    // 시드별 대결 기록 { name, oppScore, oppBest, oppOps, myBest, rounds, retries, updated }
  received: [], // 이번 주에 받은 도전장 상대들 [{name, score, best, week}]
  saved: null,  // 진행 중인 판
});
let store = load();
function load() {
  try {
    const d = defaults();
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = { ...d, ...s, daily: { ...d.daily, ...(s.daily || {}) }, plays: { ...d.plays, ...(s.plays || {}) }, goal: { ...d.goal, ...(s.goal || {}) }, stamps: { ...d.stamps, ...(s.stamps || {}) } };
    // 돈 불리기 스킨은 클래식으로 정하면서 뺐음 (2026-11-04) — 쓰던 사람은 클래식으로
    out.unlocked = out.unlocked.filter((id) => id !== "money");
    if (out.skin === "money") out.skin = "classic";
    delete out.onboarded;
    return out;
  } catch { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* 저장 불가 환경 */ }
}

// ── 상태 ──────────────────────────────────
const DEV = !window.NCQ && !window.Capacitor;
const PLAY_URL = "https://ncroquis.github.io/duel2048/play/";
let mode = "weekly";     // weekly | daily | duel | practice
let opp = null;          // 대결 상대 { seed, score, best, name, ops, verified }
let ghost = null;        // 상대 수순 리플레이 결과 { frames, firsts, ... }
let game = null;
let snapshot = null;     // 되돌리기용 직전 상태
let undoUsed = false;
let endShown = false;
let wonShown = false;
let recorded = false;
let bestAtStart = 0;
let newBestFired = false; // 이번 판 최고 기록 갱신 연출을 했는지     // 판 시작할 때의 최고 점수 (NEW 표시용)    // 이 판 기록을 이미 남겼는지 (이어하기 뒤 다시 끝나도 횟수는 한 번)
let settingsShown = false; // 설정 시트가 열려 있는지 (상품 가격·광고 동의를 받아 오면 다시 그림)
let privacyNeeded = false; // 광고 동의를 다시 물을 수 있어야 하는 지역인지 (NcqAds가 알려 줌)

// ── 광고 제거 (인앱 상품) ─────────────────
// NCQ_IAP_REMOVE_ADS: 광고 제거
// 사면 보상형 광고 4곳(되돌리기·이어하기·재도전·연속 기록 지키기)을 광고 없이 바로 받아요. 횟수 제한은 그대로예요.
// 지급은 여기 한 곳에서만 (새 구매, 끝나지 않은 구매, 다시 설치한 뒤 되찾은 구매 모두 여기로 와요)
NcqIap.onGrant((id) => {
  if (id !== "REMOVE_ADS") return false; // 모르는 상품은 지급하지 않아요
  store.noAds = true; // 비소모성: 몇 번 와도 같게 (켜기만)
  save();
  if (game) renderHud();
  if (settingsShown) showSettings();
  return true;
});
const noAds = () => !!store.noAds;

// ── 스킨 ──────────────────────────────────
const SKINS = [
  { id: "classic" },
  { id: "pastel", test: (s) => s.bestTile >= 512 },
  { id: "animal", test: (s) => s.daily.streak >= 3 },
  { id: "neon", test: (s) => s.winStreakBest >= 3 },
  { id: "sunset", test: (s) => s.stamps.cards >= 1 },
  { id: "ink", test: (s) => s.bestTile >= 2048 },
];
const skinName = (id) => t("skin_" + id);
const skinNeed = (id) => t("need_" + id);
const ANIMAL = { 2: "🥚", 4: "🐣", 8: "🐥", 16: "🐤", 32: "🐔", 64: "🦃", 128: "🦆", 256: "🦢", 512: "🦩", 1024: "🦅", 2048: "🐉" };
function tileLabel(v) {
  if (store.skin === "animal") return `<span class="emo">${ANIMAL[v] || "🐲"}</span><span class="num">${v}</span>`;
  return String(v);
}
function applySkin() {
  const b = $("board");
  b.className = b.className.replace(/\bskin-\S+/g, "").trim();
  b.classList.add("skin-" + store.skin);
  $("ghost").className = "ghost skin-" + store.skin;
}
function checkUnlocks(quiet) {
  for (const sk of SKINS) {
    if (sk.test && !store.unlocked.includes(sk.id) && sk.test(store)) {
      store.unlocked.push(sk.id);
      save();
      if (!quiet) setTimeout(() => { toast(t("skin_unlocked", { name: skinName(sk.id) })); buzz("success"); }, 900);
    }
  }
}

// ── DOM ───────────────────────────────────
const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const tilesEl = $("tiles");
const gridEl = $("grid");
for (let i = 0; i < SIZE * SIZE; i++) gridEl.appendChild(document.createElement("i"));
const ghostEl = $("ghost");
for (let i = 0; i < SIZE * SIZE; i++) ghostEl.appendChild(document.createElement("span"));
const els = new Map(); // tile id → element

function tileClass(v) { return v > 2048 ? "vbig" : "v" + v; }
function makeTile(t, idx, extra) {
  const el = document.createElement("div");
  el.className = `tile ${tileClass(t.v)} ${extra || ""}`;
  el.style.setProperty("--r", Math.floor(idx / SIZE));
  el.style.setProperty("--c", idx % SIZE);
  el.innerHTML = `<div class="in">${tileLabel(t.v)}</div>`;
  tilesEl.appendChild(el);
  els.set(t.id, el);
  return el;
}
function placeTile(el, idx) {
  el.style.setProperty("--r", Math.floor(idx / SIZE));
  el.style.setProperty("--c", idx % SIZE);
}

// 판 전체를 다시 그림 (시작, 되돌리기, 불러오기, 스킨 변경)
function renderAll() {
  tilesEl.innerHTML = "";
  els.clear();
  game.cells.forEach((t, i) => { if (t) makeTile(t, i, ""); });
  $("overVeil").hidden = !game.over;
  $("hint").hidden = store.hintDone || game.moves > 0 || game.over;
  renderDanger();
  renderHud();
}

// 한 번 움직인 결과를 애니메이션으로 그림
function renderMove(res) {
  for (const s of res.slides) {
    const el = els.get(s.id);
    if (el) { el.classList.remove("new", "merged"); placeTile(el, s.to); }
  }
  for (const m of res.merges) {
    for (const id of m.from) {
      const el = els.get(id);
      els.delete(id);
      if (el) setTimeout(() => el.remove(), 100);
    }
    makeTile(m.tile, m.to, "merged");
    if (m.tile.v >= 8) bloom(m.tile.v, m.to);
  }
  if (res.spawned) makeTile(res.spawned.tile, res.spawned.idx, "new");
  if (res.gained) floatGain(res.gained);
  // 동시 합치기: 한 번 밀어 2쌍 이상 합치면 판이 살짝 흔들리고, 3쌍 이상이면 "한 번에 N쌍!" 글자 (점수 보너스는 없음)
  if (res.merges.length >= 2) {
    boardEl.classList.remove("shake"); void boardEl.offsetWidth; boardEl.classList.add("shake");
    if (res.merges.length >= 3) floatCombo(res.merges.length);
  }
  sparks(res.merges);
  renderDanger();
  renderHud();
}

// 합친 자리에서 타일 색이 퍼지는 연출
function bloom(v, idx) {
  const b = document.createElement("i");
  b.className = `bloom ${tileClass(v)}`;
  b.style.setProperty("--r", Math.floor(idx / SIZE));
  b.style.setProperty("--c", idx % SIZE);
  tilesEl.prepend(b);
  setTimeout(() => b.remove(), 520);
}

function floatGain(n) {
  const box = $("score").parentElement;
  box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump");
  const g = document.createElement("div");
  g.className = "gained"; g.textContent = "+" + n;
  box.style.position = "relative";
  box.appendChild(g);
  setTimeout(() => g.remove(), 650);
}
function floatCombo(n) {
  const c = document.createElement("div");
  c.className = "combo"; c.textContent = t("combo", { n });
  boardEl.appendChild(c);
  setTimeout(() => c.remove(), 1050);
}
function sparks(merges) {
  let budget = 14;
  for (const m of merges) {
    if (m.tile.v < 16 || budget <= 0) continue;
    const n = Math.min(m.tile.v >= 256 ? 8 : 5, budget);
    budget -= n;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = `spark ${tileClass(m.tile.v)}`;
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const d = 28 + Math.random() * 22;
      s.style.setProperty("--r", Math.floor(m.to / SIZE));
      s.style.setProperty("--c", m.to % SIZE);
      s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
      tilesEl.appendChild(s);
      setTimeout(() => s.remove(), 650);
    }
  }
}
const emptyCount = () => game.cells.filter((t) => !t).length;
// 위기: 빈칸이 2칸 이하면 판 테두리가 붉어짐
function renderDanger() { boardEl.classList.toggle("danger", !game.over && emptyCount() <= 2); }

const fmt = (n) => n.toLocaleString(locale());
// 이름이 없는 링크는 엔진이 "친구"로 채움 → 지금 언어로 보여 줌
const nm = (name) => (!name || name === "친구" ? t("friend") : name);
// 오늘의 목표 글자 (엔진의 g.text 대신 지금 언어로)
const goalText = (g) => t("goal_" + g.type, { v: fmt(g.target) });
const duelRec = () => (opp ? store.duels[String(opp.seed)] : null);

function modeLabel() {
  if (mode === "duel") { const r = duelRec(); const n = (r?.rounds || 0) + (recorded ? 0 : 1); return t("mode_duel", { name: nm(opp.name), n: Math.max(1, n) }); }
  if (mode === "daily") return t("mode_daily") + (store.daily.streak ? t("mode_streak", { n: store.daily.streak }) : "");
  if (mode === "weekly") return t("mode_weekly", { w: weekKey().slice(5) });
  return t("mode_practice");
}

function renderHud() {
  $("score").textContent = fmt(game.score);
  $("best").textContent = fmt(Math.max(store.best, game.score));
  // 이번 판에서 최고 기록을 넘으면 NEW
  const isNew = bestAtStart > 0 && game.score > bestAtStart;
  $("bestBox").classList.toggle("is-new", isNew);
  // 이번 판에서 처음 최고 기록을 넘는 순간: 반짝임 + 소리
  if (isNew && !newBestFired) { newBestFired = true; sparkleBest(); sfx.record(); buzz("success"); }
  document.body.classList.toggle("in-duel", mode === "duel");
  renderGoal();
  $("modeChip").textContent = modeLabel();

  const bar = $("duelBar");
  bar.hidden = mode !== "duel";
  if (mode === "duel") renderDuelBar();

  const undo = $("undoBtn");
  // NCQ_ADS_UNDO: 되돌리기 보상형 광고 (광고 제거를 샀으면 광고 없이)
  undo.hidden = !(noAds() || NcqAds.can("UNDO"));
  undo.disabled = !snapshot || undoUsed || game.over;
  undo.querySelector(".ad-tag").hidden = noAds();
}

// 대결 바: 고스트(상대가 같은 수일 때의 판) + 같은 수 점수 비교 + 최종 점수까지 진행
function renderDuelBar() {
  const bar = $("duelBar");
  const finalGap = opp.score - game.score;
  $("duelFill").style.width = Math.min(100, (game.score / Math.max(1, opp.score)) * 100) + "%";
  bar.classList.toggle("has-ghost", !!ghost);
  if (ghost) {
    const last = ghost.frames.length - 1;
    const k = Math.min(game.moves, last);
    const f = ghost.frames[k];
    [...ghostEl.children].forEach((sp, i) => {
      const v = f.cells[i];
      sp.className = v ? tileClass(v) : "";
      sp.textContent = v ? (store.skin === "animal" ? ANIMAL[v] || "🐲" : v) : "";
    });
    const diff = game.score - f.score;
    $("duelLabel").textContent = game.moves > last ? t("duel_ended", { name: nm(opp.name), n: last }) : t("duel_at", { name: nm(opp.name), n: k, s: fmt(f.score) });
    $("duelGap").textContent = diff > 0 ? t("ahead", { d: fmt(diff) }) : diff < 0 ? t("behind", { d: fmt(diff) }) : t("tied");
    bar.classList.toggle("ahead", diff >= 0);
    bar.classList.toggle("behind", diff < 0);
    $("duelSub").textContent = finalGap > 0 ? t("final_gap", { s: fmt(opp.score), g: fmt(finalGap) }) : t("final_pass", { d: fmt(-finalGap) });
  } else {
    $("duelLabel").textContent = t("opp_score", { name: nm(opp.name), s: fmt(opp.score) });
    $("duelGap").textContent = finalGap > 0 ? t("pts_left", { g: fmt(finalGap) }) : t("passed", { d: fmt(-finalGap) });
    bar.classList.toggle("ahead", finalGap <= 0);
    bar.classList.remove("behind");
    $("duelSub").textContent = "";
  }
}

// ── 판 시작 ───────────────────────────────
function playsToday(kind) {
  if (store.plays.date !== dayKey()) store.plays = { date: dayKey(), weekly: 0, daily: 0 };
  return store.plays[kind] || 0;
}
function seedFor(m) { return m === "weekly" ? weeklySeed() : dailySeed(); }

function start(newMode, seed, opponent) {
  mode = newMode;
  opp = opponent || null;
  ghost = null;
  if (opp && opp.ops && opp.ops.length) {
    const r = replay(opp.seed, opp.ops);
    if (r.valid) { ghost = r; opp.verified = r.score === opp.score; opp.score = r.score; opp.best = r.best; }
    else opp.verified = false;
  }
  game = newGame(seed);
  bestAtStart = store.best;
  newBestFired = false;
  snapshot = null;
  undoUsed = false;
  endShown = false;
  wonShown = false;
  recorded = false;
  queue.length = 0;
  if (mode === "weekly" || mode === "daily") { playsToday(mode); store.plays[mode] += 1; }
  persist();
  renderAll();
}

// 주간·오늘의 판: 하루 3번 무료, 그 뒤는 보상형 광고
async function startLimited(m) {
  const used = playsToday(m);
  if (used < FREE_PER_DAY) { start(m, seedFor(m)); return true; }
  // NCQ_ADS_RETRY: 재도전 보상형 광고 (주간·오늘의 판 4번째부터, 대결 두 번째 복수전부터)
  if (noAds() || (NcqAds.can("RETRY") && await NcqAds.rewarded("RETRY"))) { start(m, seedFor(m)); return true; }
  toast(t("no_free"));
  return false;
}
// 대결 같은 판 다시(복수전): 시드마다 첫 번은 무료, 그 뒤는 보상형 광고 (광고 제거를 샀으면 광고 없이)
async function startRevenge() {
  const r = duelRec();
  if (r && r.retries >= 1 && !noAds()) {
    if (!(NcqAds.can("RETRY") && await NcqAds.rewarded("RETRY"))) return false;
  }
  if (r) { r.retries = (r.retries || 0) + 1; save(); }
  start("duel", opp.seed, { ...opp });
  return true;
}

function persist() {
  store.saved = { mode, opp, game, undoUsed, wonShown, recorded };
  save();
}

function resume() {
  const s = store.saved;
  if (!s || !s.game || !s.game.cells) return false;
  // 주간·오늘의 판인데 기간이 바뀌었으면 새 판으로
  if (s.mode === "weekly" && s.game.seed !== weeklySeed()) return false;
  if (s.mode === "daily" && s.game.seed !== dailySeed()) return false;
  bestAtStart = store.best;
  newBestFired = true; // 이어서 할 땐 다시 터뜨리지 않음
  mode = s.mode; opp = s.opp; game = s.game; undoUsed = !!s.undoUsed; wonShown = !!s.wonShown; recorded = !!s.recorded;
  game.log = game.log || []; game.firsts = game.firsts || {}; game.revives = game.revives || 0;
  ghost = opp && opp.ops && opp.ops.length ? replay(opp.seed, opp.ops) : null;
  if (ghost && !ghost.valid) ghost = null;
  snapshot = null; endShown = false;
  renderAll();
  if (game.over) setTimeout(showResult, 300);
  return true;
}

function randomSeed() {
  const a = new Uint32Array(1);
  (crypto.getRandomValues ? crypto.getRandomValues(a) : (a[0] = (Math.random() * 2 ** 32) >>> 0));
  return a[0] >>> 0;
}

// ── 조작 (입력 버퍼 포함) ───────────────────
const ANIM_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 100;
const queue = [];
let animUntil = 0;
let flushTimer = null;
// 애니메이션 중 들어온 빠른 스와이프는 최대 2개까지 담아 두었다가 순서대로 처리
function requestMove(dir) {
  if (performance.now() < animUntil) {
    if (queue.length < 2) queue.push(dir);
    scheduleFlush();
    return;
  }
  doMove(dir);
}
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const d = queue.shift();
    if (d) requestMove(d);
    if (queue.length) scheduleFlush();
  }, Math.max(0, animUntil - performance.now()) + 4);
}

function doMove(dir) {
  if (!game || game.over || !$("sheet").hidden) { queue.length = 0; return; }
  const before = cloneGame(game);
  const res = move(game, dir);
  if (!res.moved) { sfx.bump(); buzz("bump"); return; }
  snapshot = before;
  animUntil = performance.now() + ANIM_MS;
  renderMove(res);
  const danger = boardEl.classList.contains("danger");
  if (res.merges.length) {
    const top = Math.max(...res.merges.map((m) => m.tile.v));
    sfx.merge(res.merges.map((m) => m.tile.v)); buzz(res.merges.length >= 2 || danger ? "heavy" : mergeKind(top));
  } else { sfx.slide(); buzz(danger ? "medium" : "light"); }
  if (game.score > store.best) store.best = game.score;
  hideHint();
  updateGoal(res);
  celebrateFirsts(before.firsts, game.firsts);
  renderGoal();
  if (game.won && !wonShown) { wonShown = true; setTimeout(() => toast(t("won_toast")), 1700); }
  persist();
  if (game.over) { queue.length = 0; $("overVeil").hidden = false; sfx.over(); setTimeout(() => buzz("error"), 120); setTimeout(showResult, 700); }
}

// ── 오늘의 목표 ───────────────────────────
function goalState() {
  const today = dayKey();
  if (store.goal.date !== today) store.goal = { date: today, prog: 0, done: false };
  return store.goal;
}
function renderGoal() {
  const el = $("goal");
  el.hidden = mode === "duel"; // 대결 중엔 상대 바가 그 자리를 씀
  if (el.hidden) return;
  const g = dailyGoal(), st = goalState();
  $("goalText").textContent = goalText(g);
  el.classList.toggle("done", st.done);
  const cur = Math.min(st.prog, g.target);
  const pct = g.type === "tile" ? (cur ? Math.log2(cur) / Math.log2(g.target) : 0) : cur / g.target;
  $("goalFill").style.width = (st.done ? 100 : Math.round(pct * 100)) + "%";
  $("goalStamps").innerHTML = stampDots();
  $("goalProg").textContent = st.done ? t("goal_done")
    : g.type === "combo" ? "0 / 1" : `${fmt(cur)} / ${fmt(g.target)}`;
}
function updateGoal(res) {
  const g = dailyGoal(), st = goalState();
  if (st.done) return;
  const now = g.type === "tile" ? maxTile(game) : g.type === "score" ? game.score : res.merges.length >= 3 ? 1 : 0;
  if (now > st.prog) st.prog = now;
  if (st.prog >= g.target) {
    st.done = true;
    const el = $("goal");
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    setTimeout(() => { toast(t("goal_toast", { text: goalText(g) })); buzz("success"); sfx.fanfare(); }, 200);
    addStamp();
  }
  save();
}

// ── 목표 도장판: 오늘의 목표를 이루면 도장 1개, 7개 모으면 한 장 완성 ──
const STAMPS = 7, MAX_SHIELDS = 2;
function addStamp() {
  const sp = store.stamps;
  sp.n += 1;
  let msg;
  if (sp.n >= STAMPS) {
    sp.n = 0; sp.cards += 1;
    const before = store.unlocked.length;
    checkUnlocks(true);
    if (store.unlocked.length > before) msg = t("stamp_full_skin", { name: skinName("sunset") });
    else if (store.shields < MAX_SHIELDS) { store.shields += 1; msg = t("stamp_full_shield"); }
    else msg = t("stamp_full");
  } else msg = t("stamp_got", { n: sp.n, total: STAMPS });
  save();
  renderGoal();
  setTimeout(() => toast(msg), 2600);
}
function stampDots() {
  return Array.from({ length: STAMPS }, (_, i) => `<i class="${i < store.stamps.n ? "on" : ""}"></i>`).join("");
}

// ── 연속 기록 지키기: 하루 빠지면 다음 날 보호권이나 광고로 이어 가기 ──
function streakState() {
  const d = store.daily, today = dayKey();
  if (!d.streak) return "none";
  if (d.lastDone === today || d.lastDone === prevDayKey(today)) return "alive";
  if (d.lastDone === prevDayKey(prevDayKey(today))) return "risk"; // 어제 하루만 빠짐
  return "lost";
}
function checkStreak() {
  const st = streakState(), d = store.daily, today = dayKey();
  if (st === "lost") { d.streak = 0; save(); renderHud(); return; }
  if (st !== "risk" || d.offered === today || !$("sheet").hidden) return;
  if (!store.shields && !noAds() && !NcqAds.can("STREAK")) return; // 지킬 방법이 없으면 묻지 않음
  d.offered = today; save();
  showStreakSave();
}
function keepStreak(how) {
  const d = store.daily;
  if (how === "shield") store.shields -= 1;
  d.lastDone = prevDayKey(dayKey()); // 어제 한 것으로 쳐서 오늘의 판을 하면 이어짐
  save(); closeSheet(); renderHud(); buzz("success"); sfx.fanfare();
  toast(t("streak_kept", { n: d.streak }));
}
function showStreakSave() {
  const n = store.daily.streak;
  // NCQ_ADS_STREAK: 연속 기록 지키기 보상형 광고
  // 광고 제거를 샀으면 보호권도 광고도 없이 바로 지켜요 (보호권은 아껴 둠)
  const free = noAds();
  const adOk = !free && NcqAds.can("STREAK");
  openSheet(`
    <div class="result-badge">🔥</div>
    <h2 style="text-align:center">${t("streak_save_title", { n })}</h2>
    <p class="sub" style="text-align:center">${t("streak_save_sub")}</p>
    ${free ? `<button class="btn primary" data-free>${t("streak_keep_free")}</button>` : ""}
    ${!free && store.shields > 0 ? `<button class="btn primary" data-shield>${t("streak_use_shield")} <small>🛡️ ${t("shields_n", { n: store.shields })}</small></button>` : ""}
    ${adOk ? `<button class="btn ${store.shields > 0 ? "" : "primary"}" data-ad>${t("streak_watch_ad")}</button>` : ""}
    <button class="btn ghost" data-drop>${t("streak_drop")}</button>
    <p class="note">${t("streak_note")}</p>
  `, (card) => {
    const fr = card.querySelector("[data-free]");
    if (fr) fr.onclick = () => keepStreak("free");
    const sh = card.querySelector("[data-shield]");
    if (sh) sh.onclick = () => keepStreak("shield");
    const ad = card.querySelector("[data-ad]");
    if (ad) ad.onclick = async () => { if (await NcqAds.rewarded("STREAK")) keepStreak("ad"); };
    card.querySelector("[data-drop]").onclick = () => { store.daily.streak = 0; save(); closeSheet(); renderHud(); };
  });
}

// 판이 끝난 뒤 '내일' 카드: 연속 기록 예고 + 내일의 목표 + 도장판
function tomorrowCard() {
  const d = store.daily, today = dayKey();
  const now = new Date();
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const streakLine = d.lastDone === today ? t("tmr_streak", { n: d.streak + 1 })
    : streakState() === "alive" ? t("tmr_daily_today", { n: d.streak + 1 }) : t("tmr_daily_start");
  return `<div class="tomorrow">
    <div class="tm-row"><span class="tm-ico">🔥</span><span>${streakLine}</span></div>
    <div class="tm-row"><span class="tm-ico">🎯</span><span>${t("tmr_goal", { text: goalText(dailyGoal(tmr)) })}</span></div>
    <div class="tm-row"><span class="tm-ico">✅</span><span>${t("stamps_k")}</span><span class="stamps">${stampDots()}</span><small>${store.stamps.n}/${STAMPS}</small></div>
  </div>`;
}

// 처음 판 안내는 첫 이동에서 사라지고 다시 안 나옴
function hideHint() {
  const h = $("hint");
  if (store.hintDone) return;
  store.hintDone = true;
  save();
  h.classList.add("out");
  setTimeout(() => { h.hidden = true; h.classList.remove("out"); }, 280);
}

// 처음 만든 큰 타일 축하: 이번 판 첫 256 이상, 그리고 평생 최고 타일 갱신
function celebrateFirsts(prev, now) {
  const fresh = Object.keys(now).map(Number).filter((v) => !prev[v] && v >= 256).sort((a, b) => b - a);
  const top = maxTile(game);
  if (fresh.length) {
    const v = fresh[0];
    const record = v > store.bestTile;
    if (v >= 512) bigMoment(v, record);           // 512·1024·2048…: 큰 순간 연출
    else if (record) { toast(t("best_tile_toast", { v })); buzz("success"); sfx.fanfare(); }
    else toast(t("first_tile_toast", { v }));
  }
  if (top > store.bestTile) { store.bestTile = top; checkUnlocks(); }
}

// ── 큰 순간: 판이 금빛으로 번지고, 숫자가 크게 뜨고, 꽃가루가 터짐 ──
const REDUCED = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function bigMoment(v, record) {
  const wash = document.createElement("div");
  wash.className = `goldwash ${tileClass(v)}`;
  boardEl.appendChild(wash);
  setTimeout(() => wash.remove(), 1100);
  const lab = document.createElement("div");
  lab.className = `bigmoment ${tileClass(v)}`;
  lab.innerHTML = `<b>${v}</b><span>${v === 2048 ? t("big_2048") : record ? t("big_record") : t("big_first", { v })}</span>`;
  boardEl.appendChild(lab);
  setTimeout(() => lab.remove(), 1700);
  boardEl.classList.remove("thump"); void boardEl.offsetWidth; boardEl.classList.add("thump");
  sfx.big(v); buzz("success");
  if (!REDUCED) confetti(v >= 2048 ? 140 : v >= 1024 ? 100 : 70);
}

// 꽃가루: 판 위에서 위로 터졌다가 떨어짐 (캔버스 하나로 그리고 끝나면 지움)
function confetti(n) {
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const x = cv.getContext("2d"); x.scale(dpr, dpr);
  const r = boardEl.getBoundingClientRect();
  const cols = ["#edc22e", "#f2b179", "#f67c5f", "#f65e3b", "#edcf72", "#ffffff", "#8fb6e0"];
  const ps = Array.from({ length: n }, () => ({
    x: r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.3, y: r.top + r.height * 0.45,
    vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 8, g: 0.28 + Math.random() * 0.12,
    w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
    c: cols[(Math.random() * cols.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const life = (t - t0) / 1600;
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.globalAlpha = Math.max(0, 1 - life * life);
      x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 2)) + 2);
      x.restore();
    }
    if (life < 1) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// 최고 기록 갱신: 최고 상자에서 별이 튐
function sparkleBest() {
  const box = $("bestBox");
  box.classList.remove("glint"); void box.offsetWidth; box.classList.add("glint");
  if (REDUCED) return;
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("i");
    s.className = "star";
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4, d = 30 + Math.random() * 26;
    s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
    s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
    s.style.animationDelay = `${Math.random() * 120}ms`;
    box.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

// 소리 켜기: 휴대폰 브라우저는 '손을 뗄 때(touchend)·클릭·키 입력' 안에서만 소리를 허락함
// (아이폰 사파리는 touchstart를 인정하지 않아서, 예전처럼 touchstart에서 켜면 끝까지 무음이었음)
// capture로 등록해 스와이프 처리보다 먼저 켜지게 하고, 멈춰 있으면 매번 다시 깨움
for (const type of ["touchend", "pointerup", "click", "keydown"]) {
  document.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });
}

// 스와이프
let t0 = null;
window.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (!t0) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
  t0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  requestMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
document.addEventListener("touchmove", (e) => { if (!e.target.closest(".sheet-card")) e.preventDefault(); }, { passive: false });
// 마우스 드래그 (PC 테스트)
let m0 = null;
window.addEventListener("mousedown", (e) => { if (!e.target.closest("button,.sheet")) { m0 = { x: e.clientX, y: e.clientY }; } });
window.addEventListener("mouseup", (e) => {
  if (!m0) return;
  const dx = e.clientX - m0.x, dy = e.clientY - m0.y; m0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  requestMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const d = KEYS[e.key]; if (d) { e.preventDefault(); requestMove(d); }
});

// ── 버튼 ──────────────────────────────────
$("undoBtn").onclick = async () => {
  if (!snapshot || undoUsed) return;
  if (noAds() || await NcqAds.rewarded("UNDO")) {
    game = snapshot; snapshot = null; undoUsed = true;
    persist(); renderAll(); toast(t("undo_toast"));
  }
};
$("newBtn").onclick = showModes;
$("modeChip").onclick = showModes;
$("rankBtn").onclick = () => showRanking("weekly");
$("setBtn").onclick = showSettings;

// ── 시트 ──────────────────────────────────
function openSheet(html, bind) {
  settingsShown = false;
  $("sheetCard").innerHTML = html;
  $("sheet").hidden = false;
  bind?.($("sheetCard"));
}
function closeSheet() { $("sheet").hidden = true; settingsShown = false; }

// 토스 뒤로가기: 열린 창이 있으면 닫고 true, 없으면 false(빌드가 종료를 물어요)
window.ncqBack = () => {
  if (!$("sheet").hidden && !game?.over) { closeSheet(); return true; }
  return false;
};

const buzz = (kind) => haptic(kind, store.haptic);
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" && !game.over) closeSheet(); });

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const myName = () => store.name || t("me");

function showModes() {
  const wk = store.weekly.key === weekKey() ? store.weekly : { best: 0 };
  const dl = store.daily.date === dayKey() ? store.daily : { best: 0 };
  const left = (m) => Math.max(0, FREE_PER_DAY - playsToday(m));
  const freeTag = (m) => (left(m) > 0 ? t("free_left", { n: left(m) }) : noAds() ? t("free") : t("ad_try"));
  const doneToday = store.daily.lastDone === dayKey();
  openSheet(`
    <h2>${t("new_game")}</h2>
    <p class="sub">${t("modes_sub")}</p>
    <button class="mode-item" data-m="daily"><span class="emo ico-line"><svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-2.7 7-6.8 0-3.4-2.3-5.6-3.6-7.2-.4 1.6-1.3 2.8-2.4 3.3C13.3 7.6 11.6 4.3 9 2c.2 3-1.5 5.1-3 7-1.2 1.6-2 3.4-2 5.4C4 19 7.4 22 12 22Z"/></svg></span><div><b>${t("daily_title")} ${store.daily.streak ? `<em class="streak">${t("streak_badge", { n: store.daily.streak })}</em>` : ""}${store.shields ? ` <em class="shield">🛡️${store.shields}</em>` : ""}</b><span>${doneToday ? t("daily_done") : t("daily_desc")}${t("my_best", { s: fmt(dl.best || 0) })} · ${freeTag("daily")}</span></div></button>
    <button class="mode-item" data-m="weekly"><span class="emo ico-line"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></span><div><b>${t("weekly_title")}</b><span>${t("weekly_desc")} · ${t("my_best", { s: fmt(wk.best || 0) })} · ${freeTag("weekly")}</span></div></button>
    ${opp ? `<button class="mode-item" data-m="duel"><span class="emo ico-line"><svg viewBox="0 0 24 24"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4M7 17l-3 3M3 19l2 2"/></svg></span><div><b>${t("rematch_title", { name: esc(nm(opp.name)) })}</b><span>${t("rematch_desc", { s: fmt(opp.score) })}</span></div></button>` : ""}
    <button class="mode-item" data-m="practice"><span class="emo ico-line"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/></svg></span><div><b>${t("practice_title")}</b><span>${t("practice_desc")}</span></div></button>
    <button class="btn ghost" data-close>${t("close")}</button>
  `, (card) => {
    card.querySelectorAll("[data-m]").forEach((b) => b.onclick = async () => {
      const m = b.dataset.m;
      if (m === "weekly" || m === "daily") { if (await startLimited(m)) closeSheet(); }
      else if (m === "duel") { if (await startRevenge()) closeSheet(); }
      else { closeSheet(); start("practice", randomSeed()); }
    });
    card.querySelector("[data-close]").onclick = closeSheet;
  });
}

// 판이 끝났을 때 기록 (이어하기 뒤 다시 끝나면 최고 점수만 갱신)
function recordEnd() {
  const first = !recorded;
  recorded = true;
  const top = maxTile(game);
  if (mode === "weekly") {
    const k = weekKey();
    if (store.weekly.key !== k) store.weekly = { key: k, best: 0, tile: 0, plays: 0 };
    if (first) store.weekly.plays += 1;
    if (game.score > store.weekly.best) { store.weekly.best = game.score; store.weekly.tile = top; }
  }
  if (mode === "daily") {
    const today = dayKey();
    const d = store.daily;
    if (d.date !== today) { d.date = today; d.best = 0; d.plays = 0; }
    if (first) d.plays += 1;
    if (game.score > d.best) d.best = game.score;
    if (d.lastDone !== today) {
      d.streak = d.lastDone === prevDayKey(today) ? d.streak + 1 : 1; d.lastDone = today;
      // 7일 연속마다 보호권 1개 (최대 2개)
      if (d.streak % 7 === 0 && store.shields < MAX_SHIELDS) { store.shields += 1; setTimeout(() => toast(t("shield_earned", { n: d.streak })), 1400); }
    }
  }
  if (mode === "duel") {
    const key = String(opp.seed);
    const r = store.duels[key] || (store.duels[key] = { name: opp.name, rounds: 0, retries: 0 });
    Object.assign(r, { name: opp.name, oppScore: opp.score, oppBest: opp.best, updated: Date.now() });
    if (first) {
      r.rounds = (r.rounds || 0) + 1;
      const win = game.score > opp.score;
      store.winStreak = win ? store.winStreak + 1 : 0;
      store.winStreakBest = Math.max(store.winStreakBest, store.winStreak);
    }
    if (r.myBest == null || game.score > r.myBest) { r.myBest = game.score; r.myOps = game.log.slice(); }
  }
  persist();
  checkUnlocks();
}

// 구간 비교: 128·256·512…를 처음 만든 수
function milestoneRows() {
  const mine = game.firsts || {};
  const theirs = ghost ? ghost.firsts : {};
  return MILESTONES.filter((v) => mine[v] || theirs[v]).map((v) => {
    const a = mine[v], b = theirs[v];
    const meFaster = a && (!b || a < b), themFaster = b && (!a || b < a);
    return `<li><span class="mt ${tileClass(v)}">${v}</span>
      <span class="${meFaster ? "fast" : ""}">${a ? t("moves_cell", { n: a }) : "—"}</span>
      <span class="${themFaster ? "fast" : ""}">${b ? t("moves_cell", { n: b }) : "—"}</span></li>`;
  }).join("");
}

function showResult() {
  if (endShown) return;
  endShown = true;
  recordEnd();
  const me = { name: myName(), score: game.score, best: maxTile(game) };
  // NCQ_ADS_REVIVE: 게임 오버 이어하기 보상형 광고 (광고 제거를 샀으면 광고 없이)
  const reviveOk = game.over && (noAds() || NcqAds.can("REVIVE")) && !game.revives;
  const reviveBtn = reviveOk ? `<button class="btn revive" data-revive>${t("revive")} <small>${noAds() ? t("revive_sub_free") : t("revive_sub")}</small></button>` : "";

  let body;
  if (mode === "duel") {
    const win = me.score > opp.score, draw = me.score === opp.score;
    const r = duelRec();
    const rows = milestoneRows();
    const revengeLabel = `${t("revenge")} <small>${r && r.retries >= 1 && !noAds() ? t("ad_watch") : t("free")}</small>`;
    body = `
      <div class="result-badge">${win ? "🏆" : draw ? "🤝" : "😤"}</div>
      <h2 style="text-align:center">${win ? t("win") : draw ? t("draw") : t("lose")}</h2>
      <p class="sub" style="text-align:center">${win ? `${store.winStreak >= 2 ? t("win_streak", { n: store.winStreak }) : ""}${t("win_sub", { name: esc(nm(opp.name)) })}` : t("lose_sub", { d: fmt(opp.score - me.score) })}</p>
      <div class="vs">
        <div class="side ${win ? "win" : ""}"><div class="who">${esc(me.name)}</div><div class="pts">${fmt(me.score)}</div><div class="tilemax">${t("best_tile", { v: me.best })}</div>${game.revives ? `<div class="flag">${t("revives_n", { n: game.revives })}</div>` : ""}</div>
        <div class="mid">VS</div>
        <div class="side ${!win && !draw ? "win" : ""}"><div class="who">${esc(nm(opp.name))}</div><div class="pts">${fmt(opp.score)}</div><div class="tilemax">${t("best_tile", { v: opp.best })}</div>${ghost ? `<div class="flag ok">${t("verified")}</div>` : opp.verified === false ? `<div class="flag">${t("unverified")}</div>` : ""}${ghost?.revives ? `<div class="flag">${t("revives_n", { n: ghost.revives })}</div>` : ""}</div>
      </div>
      ${rows ? `<div class="miles"><div class="miles-head"><span>${t("tile")}</span><span>${esc(me.name)}</span><span>${esc(nm(opp.name))}</span></div><ul>${rows}</ul></div>` : ""}
      ${reviveBtn}
      ${win ? `<button class="btn primary" data-share>${t("send_result")}</button><button class="btn" data-retry>${t("again_same")}</button>`
            : `<button class="btn primary" data-retry>${revengeLabel}</button><button class="btn" data-share>${t("send_result")}</button>`}
      <button class="btn ghost" data-new>${t("other_game")}</button>
      ${r ? `<p class="note">${t("rounds_note", { name: esc(nm(opp.name)), n: r.rounds })}</p>` : ""}`;
  } else {
    const wk = mode === "weekly" ? store.weekly : null;
    const sub = mode === "weekly" ? t("weekly_sub", { n: wk.plays, s: fmt(wk.best) })
      : mode === "daily" ? t("daily_sub", { n: store.daily.streak, s: fmt(store.daily.best) })
      : t("practice_sub");
    const again = mode === "weekly" || mode === "daily"
      ? `<button class="btn" data-again>${t("again", { mode: mode === "weekly" ? t("weekly_title") : t("daily_title") })} <small>${playsToday(mode) < FREE_PER_DAY ? t("free_n", { n: FREE_PER_DAY - playsToday(mode) }) : noAds() ? t("free") : t("ad_watch")}</small></button>` : "";
    body = `
      <h2 style="text-align:center">${t("game_over_title")}</h2>
      <p class="sub" style="text-align:center">${sub}</p>
      <div class="solo-score">${fmt(me.score)}</div>
      <p class="sub" style="text-align:center">${t("solo_line", { v: me.best, n: game.moves })}${game.revives ? t("solo_revives", { n: game.revives }) : ""}</p>
      ${tomorrowCard()}
      ${reviveBtn}
      <button class="btn primary" data-share>${t("send_challenge")}</button>
      ${again}
      <button class="btn ghost" data-new>${t("other_game")}</button>
      <p class="note">${t("solo_note")}</p>`;
  }
  openSheet(body, (card) => {
    card.querySelector("[data-share]").onclick = () => showShare(me);
    card.querySelector("[data-new]").onclick = () => { closeSheet(); showModes(); };
    const again = card.querySelector("[data-again]");
    if (again) again.onclick = async () => { if (await startLimited(mode)) closeSheet(); };
    const retry = card.querySelector("[data-retry]");
    if (retry) retry.onclick = async () => { if (await startRevenge()) closeSheet(); };
    const rv = card.querySelector("[data-revive]");
    if (rv) rv.onclick = async () => {
      if (noAds() || await NcqAds.rewarded("REVIVE")) {
        revive(game);
        endShown = false;
        closeSheet(); persist(); renderAll(); buzz("success");
        toast(t("revive_toast"));
      }
    };
  });
}

// ── 공유: 결과 카드 이미지 + 도전장 링크 ────────
function challengeLink(me) {
  const code = encodeDuel2({ seed: game.seed, score: me.score, best: me.best, ops: game.log, name: me.name });
  // 공개 플레이 주소가 아닌 곳(안드로이드 앱·토스·Claude 아티팩트 등)에서는 공유 테스트 주소로 링크를 만든다
  // 안드로이드 앱(Capacitor)도 주소가 https://localhost라서, localhost는 개발 중(DEV)일 때만 그대로 쓴다
  const here = /\.github\.io$/.test(location.hostname) || (DEV && /^localhost$|^127\./.test(location.hostname));
  const base = here ? `${location.origin}${location.pathname}` : PLAY_URL;
  return `${base}?g=${code}`;
}

function shareText(me) {
  if (mode === "duel") {
    const win = me.score > opp.score;
    return win ? t("share_duel_win", { a: fmt(me.score), b: fmt(opp.score) }) : t("share_duel_lose", { a: fmt(me.score) });
  }
  return t("share_solo", { s: fmt(me.score), v: me.best });
}

// 결과 카드 그리기 (1080×1350, 메신저에 붙이기 좋은 세로형)
function drawCard(me) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const F = '"Num2048", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const rr = (X, Y, w, h, r, fill) => { x.beginPath(); x.roundRect(X, Y, w, h, r); x.fillStyle = fill; x.fill(); };
  x.fillStyle = "#faf8ef"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#776e65"; x.font = `800 120px ${F}`; x.textAlign = "left"; x.fillText("2048", 80, 180);
  const tw = x.measureText("2048").width;
  x.font = `700 46px ${F}`; x.fillStyle = "#f67c5f"; x.fillText("Duel", 80 + tw + 16, 175);
  x.font = `600 36px ${F}`; x.fillStyle = "#a39689"; x.textAlign = "right";
  x.fillText(mode === "duel" ? t("card_duel") : mode === "daily" ? t("card_daily", { d: dayKey() }) : mode === "weekly" ? t("card_weekly", { w: weekKey() }) : t("card_challenge"), W - 80, 175);
  // 점수 상자
  const box = (X, w, who, pts, tile, win) => {
    rr(X, 240, w, 260, 32, "#ffffff");
    if (win) { x.lineWidth = 10; x.strokeStyle = "#2fb36d"; x.beginPath(); x.roundRect(X + 5, 245, w - 10, 250, 28); x.stroke(); }
    x.textAlign = "center"; x.fillStyle = "#776e65"; x.font = `700 40px ${F}`; x.fillText(who, X + w / 2, 315);
    x.fillStyle = "#4a443e"; x.font = `800 ${w > 600 ? 110 : 84}px ${F}`; x.fillText(fmt(pts), X + w / 2, 412);
    x.fillStyle = "#a39689"; x.font = `600 32px ${F}`; x.fillText(t("best_tile", { v: tile }), X + w / 2, 470);
  };
  if (mode === "duel") {
    const win = me.score > opp.score;
    box(80, 420, me.name, me.score, me.best, win);
    box(580, 420, nm(opp.name), opp.score, opp.best, !win && me.score !== opp.score);
    x.fillStyle = "#b9ab9e"; x.font = `800 44px ${F}`; x.textAlign = "center"; x.fillText("VS", 540, 385);
  } else box(80, 920, me.name, me.score, me.best, false);
  // 내 마지막 판
  const S = 600, X0 = (W - S) / 2, Y0 = 560, g = 16, cs = (S - g * 5) / 4;
  rr(X0, Y0, S, S, 24, "#bbada0");
  const COL = { 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e" };
  game.cells.forEach((t, i) => {
    const cx = X0 + g + (i % 4) * (cs + g), cy = Y0 + g + Math.floor(i / 4) * (cs + g);
    rr(cx, cy, cs, cs, 12, t ? COL[t.v] || "#3c3a32" : "#cdc1b4");
    if (t) {
      x.fillStyle = t.v <= 4 ? "#776e65" : "#f9f6f2";
      x.font = `800 ${t.v >= 1024 ? 40 : t.v >= 128 ? 50 : 60}px ${F}`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(t.v), cx + cs / 2, cy + cs / 2 + 2); x.textBaseline = "alphabetic";
    }
  });
  x.fillStyle = "#4a443e"; x.font = `800 52px ${F}`; x.textAlign = "center";
  x.fillText(mode === "duel" && me.score > opp.score ? t("card_cta_win") : t("card_cta"), W / 2, 1255);
  x.fillStyle = "#a39689"; x.font = `600 30px ${F}`; x.fillText(t("card_foot"), W / 2, 1305);
  return c;
}

async function showShare(me) {
  // 보낸 도전장도 기록해 두어야 친구 답장(복수전)을 알아봄
  const key = String(game.seed);
  const rec = store.duels[key] || (store.duels[key] = { name: opp?.name || null, rounds: 0, retries: 0 });
  if (rec.myBest == null || me.score > rec.myBest) { rec.myBest = me.score; rec.myOps = game.log.slice(); }
  rec.updated = Date.now();
  save();
  const url = challengeLink(me);
  const text = shareText(me);
  let canvas, imgUrl = "";
  try { canvas = drawCard(me); imgUrl = canvas.toDataURL("image/png"); } catch { /* 캔버스 불가 */ }
  openSheet(`
    <h2>${t("send_result")}</h2>
    <p class="sub">${t("share_sub")}</p>
    ${imgUrl ? `<img class="share-img" src="${imgUrl}" alt="${t("card_alt")}" />` : ""}
    <button class="btn primary" data-native>${t("share")}</button>
    <button class="btn" data-copy>${t("copy_link")}</button>
    <textarea id="linkBox" class="link-box" readonly rows="3" hidden>${esc(`${text}\n${url}`)}</textarea>
    <button class="btn ghost" data-back>${t("back")}</button>
  `, (card) => {
    const box = card.querySelector("#linkBox");
    const showBox = (msg) => { box.hidden = false; box.focus(); box.select(); toast(msg); };
    const copy = async () => {
      try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t("copied")); }
      catch { showBox(t("copy_blocked")); }
    };
    card.querySelector("[data-copy]").onclick = copy;
    card.querySelector("[data-native]").onclick = async () => {
      try {
        if (window.NcqShare) { await window.NcqShare({ text, url }); return; } // 토스 연결층 자리
        if (canvas && navigator.canShare) {
          const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          const file = new File([blob], "duel2048.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${text}\n${url}` }); return; }
        }
        if (navigator.share) { await navigator.share({ title: "2048 Duel", text, url }); return; }
        await copy();
      } catch (e) { if (e?.name !== "AbortError") await copy(); }
    };
    card.querySelector("[data-back]").onclick = () => {
      closeSheet();
      if (game.over) { endShown = false; showResult(); }
    };
  });
}

// 내가 보낸 판에 친구가 답장(복수전)했을 때 결과 보여 주기
function showReply(d, rec) {
  const meWin = rec.myBest > d.score, draw = rec.myBest === d.score;
  opp = { ...d };
  openSheet(`
    <div class="result-badge">${meWin ? "😎" : draw ? "🤝" : "🔥"}</div>
    <h2 style="text-align:center">${t("reply_title", { name: esc(nm(d.name)), kind: rec.rounds ? t("kind_rematch") : t("kind_reply") })}</h2>
    <p class="sub" style="text-align:center">${meWin ? t("still_win") : draw ? t("tie_now") : t("overtaken", { d: fmt(d.score - rec.myBest) })}</p>
    <div class="vs">
      <div class="side ${meWin ? "win" : ""}"><div class="who">${esc(myName())}</div><div class="pts">${fmt(rec.myBest)}</div><div class="tilemax">${t("my_record")}</div></div>
      <div class="mid">VS</div>
      <div class="side ${!meWin && !draw ? "win" : ""}"><div class="who">${esc(nm(d.name))}</div><div class="pts">${fmt(d.score)}</div><div class="tilemax">${t("best_tile", { v: d.best })}</div></div>
    </div>
    <button class="btn primary" data-go>${meWin ? t("one_more") : t("retake")}</button>
    <button class="btn ghost" data-close>${t("later")}</button>
  `, (card) => {
    card.querySelector("[data-go]").onclick = async () => { closeSheet(); start("duel", d.seed, { ...d }); };
    card.querySelector("[data-close]").onclick = () => { closeSheet(); };
  });
}

// ── 랭킹: 주간 판 / 친구 전적 ─────────────────
function friendRows() {
  const by = {};
  for (const r of Object.values(store.duels)) {
    if (r.myBest == null || r.oppScore == null || !r.name) continue;
    const f = by[r.name] || (by[r.name] = { name: r.name, w: 0, l: 0, d: 0, games: 0 });
    f.games += 1;
    if (r.myBest > r.oppScore) f.w += 1; else if (r.myBest < r.oppScore) f.l += 1; else f.d += 1;
  }
  return Object.values(by).sort((a, b) => b.w - a.w || a.l - b.l);
}

function showRanking(tab = "weekly") {
  const k = weekKey();
  let list;
  if (tab === "weekly") {
    const rng = { s: hashSeed("friends:" + k) };
    const names = t("mock_names").split(",");
    const rows = names.map((n) => ({ name: n, score: Math.round((2000 + nextRandom(rng) ** 1.6 * 34000) / 4) * 4, tag: t("tag_mock") }));
    for (const r of store.received.filter((x) => x.week === k)) rows.push({ name: nm(r.name), score: r.score, tag: t("tag_challenge") });
    const live = mode === "weekly" && game ? game.score : 0;
    rows.push({ name: myName(), score: Math.max(store.weekly.key === k ? store.weekly.best : 0, live), me: true });
    rows.sort((a, b) => b.score - a.score);
    list = `<p class="sub">${t("rank_weekly_sub")}</p>
      <ol class="rank-list">${rows.map((r, i) => `<li class="${r.me ? "me" : ""}"><span class="no">${i + 1}</span><span class="nm">${esc(r.name)}${r.tag ? `<small>${r.tag}</small>` : ""}</span><span class="sc">${fmt(r.score)}</span></li>`).join("")}</ol>
      <button class="btn primary" data-play>${t("play_weekly")}</button>`;
  } else {
    const rows = friendRows();
    list = rows.length
      ? `<p class="sub">${t("friends_sub")}</p>
        <ol class="rank-list">${rows.map((r, i) => `<li><span class="no">${i + 1}</span><span class="nm">${esc(nm(r.name))}<small>${t("games_n", { n: r.games })}</small></span><span class="sc rec"><b class="w">${t("wins", { n: r.w })}</b> ${t("losses", { n: r.l })}${r.d ? ` ${t("draws", { n: r.d })}` : ""}</span></li>`).join("")}</ol>`
      : `<div class="empty"><b>${t("no_friends")}</b><span>${t("no_friends_sub")}</span></div>`;
  }
  openSheet(`
    <h2>${t("ranking")}</h2>
    <div class="tabs"><button class="${tab === "weekly" ? "on" : ""}" data-tab="weekly">${t("tab_weekly", { w: k.slice(5) })}</button><button class="${tab === "friends" ? "on" : ""}" data-tab="friends">${t("tab_friends")}</button></div>
    ${list}
    <button class="btn ghost" data-close>${t("close")}</button>
    ${tab === "weekly" ? `<p class="note">${t("rank_note")}</p>` : ""}
  `, (card) => {
    card.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => showRanking(b.dataset.tab)));
    const play = card.querySelector("[data-play]");
    if (play) play.onclick = async () => {
      if (mode === "weekly" && !game.over) { closeSheet(); return; } // 하던 주간 판 이어서
      if (await startLimited("weekly")) closeSheet();
    };
    card.querySelector("[data-close]").onclick = closeSheet;
  });
}

function showSettings() {
  const skins = SKINS.map((sk) => {
    const open = store.unlocked.includes(sk.id);
    return `<button class="skin ${store.skin === sk.id ? "on" : ""} ${open ? "" : "locked"}" data-skin="${sk.id}" ${open ? "" : "aria-disabled=\"true\""}>
      <span class="sw skin-${sk.id}"><i class="v2"></i><i class="v8"></i><i class="v64"></i><i class="v512"></i></span>
      <b>${skinName(sk.id)}</b><small>${open ? (store.skin === sk.id ? t("in_use") : t("select")) : `🔒 ${skinNeed(sk.id)}`}</small></button>`;
  }).join("");
  // 광고 제거: 샀으면 표시만, 아니면 스토어가 파는 상품일 때만 구매·구매 복원 (가격은 스토어 글 그대로)
  const sell = !store.noAds && NcqIap.can("REMOVE_ADS");
  const price = sell ? NcqIap.price("REMOVE_ADS") : "";
  const adsBlock = store.noAds
    ? `<div class="row"><span>${t("remove_ads")}</span><b class="owned">${t("remove_ads_owned")}</b></div>`
    : sell ? `<button class="btn primary" data-buy>${t("remove_ads")}${price ? ` <small>${esc(price)}</small>` : ""}</button>
      <p class="note">${t("remove_ads_desc")}</p>
      <button class="btn ghost" data-restore>${t("restore")}</button>` : "";
  openSheet(`
    <h2>${t("settings")}</h2>
    <div class="row"><span>${t("my_name")}</span><input id="nameIn" type="text" maxlength="10" placeholder="${t("name_ph")}" value="${esc(store.name)}" /></div>
    <div class="row"><span>${t("sound")}</span><button id="sndSw" class="switch ${store.sound ? "on" : ""}" aria-label="${t("sound")}"></button></div>
    <div class="row"><span>${t("haptics")}</span><button id="hapSw" class="switch ${store.haptic ? "on" : ""}" aria-label="${t("haptics")}"></button></div>
    <div class="row"><span>${langTitle()}</span><div class="seg" id="langSeg">${langList().map(({ code, name, current }) => `<button class="${current ? "on" : ""}" data-lang="${code}" lang="${code}">${name}</button>`).join("")}</div></div>
    ${adsBlock}
    <h3 class="sec">${t("tile_skins")} <small>${store.unlocked.length}/${SKINS.length}</small></h3>
    <div class="skins">${skins}</div>
    ${privacyNeeded ? `<button class="btn" data-privacy>${t("privacy_settings")}</button>` : ""}
    <button class="btn danger" data-reset>${t("reset")}</button>
    <button class="btn ghost" data-close>${t("close")}</button>
    <p class="note">${t("reset_note")}${store.noAds ? ` ${t("reset_keeps_purchase")}` : ""}</p>
  `, (card) => {
    const buy = card.querySelector("[data-buy]");
    if (buy) buy.onclick = async () => {
      buy.disabled = true;
      // 비소모성(한 번 사는 것). 성공하면 onGrant가 먼저 불려요. 실패 안내는 NcqIap이 띄워요 (취소는 조용히)
      const r = await NcqIap.buyOnce("REMOVE_ADS");
      if (r.ok) { toast(t("remove_ads_done")); buzz("success"); }
      if (settingsShown) showSettings();
    };
    const rs = card.querySelector("[data-restore]");
    if (rs) rs.onclick = async () => {
      rs.disabled = true;
      const r = await NcqIap.restore(); // 되찾은 상품은 onGrant로 와요
      if (r.ok) toast(store.noAds ? t("restore_done") : t("restore_none"));
      if (settingsShown) showSettings();
    };
    const pv = card.querySelector("[data-privacy]");
    if (pv) pv.onclick = () => NcqAds.showPrivacyOptions();
    const nameIn = card.querySelector("#nameIn");
    nameIn.oninput = () => { store.name = nameIn.value.trim().slice(0, 10); save(); };
    card.querySelector("#sndSw").onclick = (e) => { store.sound = !store.sound; e.currentTarget.classList.toggle("on", store.sound); save(); };
    card.querySelector("#hapSw").onclick = (e) => {
      store.haptic = !store.haptic; e.currentTarget.classList.toggle("on", store.haptic); save();
      buzz("medium"); // 켤 때 바로 느껴 보게
    };
    // 언어: 고르면 바로 바뀌고 저장됨 (새로 고침 없이 지금 화면을 다시 그림)
    card.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => {
      if (b.dataset.lang === getLang()) return;
      setLang(b.dataset.lang); renderAll(); showSettings();
    }));
    card.querySelectorAll("[data-skin]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.skin;
      if (!store.unlocked.includes(id)) { toast(t("locked", { need: skinNeed(id) })); return; }
      store.skin = id; save(); applySkin(); renderAll(); showSettings();
    }));
    // 확인창 대신 버튼을 두 번 누르게 함 (아티팩트·웹뷰에서 confirm이 막힘)
    const resetBtn = card.querySelector("[data-reset]");
    resetBtn.onclick = () => {
      if (!resetBtn.dataset.armed) {
        resetBtn.dataset.armed = "1";
        resetBtn.textContent = t("reset_confirm");
        return;
      }
      const keepNoAds = store.noAds; // 산 상품은 지우지 않아요
      try { localStorage.removeItem(KEY); } catch { /* */ }
      store = defaults();
      store.noAds = keepNoAds;
      closeSheet();
      applySkin();
      start("weekly", weeklySeed());
      toast(t("reset_done"));
    };
    card.querySelector("[data-close]").onclick = closeSheet;
  });
  settingsShown = true;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

// ── 소리 (첫 터치 뒤에 켬) ─────────────────
const sfx = createSfx(() => store.sound);
document.addEventListener("visibilitychange", () => (document.hidden ? sfx.suspend() : sfx.resume()));

// 상대 한 판을 흉내 내 만든 도전장 (테스트용)
function fakeChallenge(name = "민수", seed = randomSeed()) {
  const g = newGame(seed);
  const order = ["left", "down", "right", "down"];
  for (let i = 0; i < 4000 && !g.over; i++) if (!move(g, order[i % 4]).moved) move(g, "up");
  return encodeDuel2({ seed, score: g.score, best: maxTile(g), ops: g.log, name });
}

// NCQ_TEST_CHEAT: 치트 메뉴
// (개발 중엔 항상, 출시 빌드는 테스트 기능 켰을 때만)
if (window.NCQ_TEST_CHEAT || DEV) {
  const p = $("testPanel");
  p.hidden = false;
  const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; p.appendChild(b); return b; };
  // 평소엔 접어 두고 '테스트'를 누르면 펼침
  add(t("test_toggle"), () => p.classList.toggle("open")).className = "test-toggle";
  add("1024×2", () => {
    const empty = game.cells.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0).slice(0, 2);
    for (const i of empty) game.cells[i] = { id: game.nextId++, v: 1024 };
    persist(); renderAll();
  });
  add(t("cheat_score"), () => { game.score += 5000; if (game.score > store.best) store.best = game.score; persist(); renderHud(); });
  add(t("cheat_over"), () => {
    game.cells = game.cells.map((_, i) => ({ id: game.nextId++, v: (i % 4 + Math.floor(i / 4)) % 2 ? 4 : 2 }));
    game.over = !canMove(game); persist(); renderAll(); sfx.over(); setTimeout(showResult, 700);
  });
  add(t("cheat_challenge"), () => { location.href = `${location.pathname}?g=${fakeChallenge()}`; });
  add(t("cheat_skins"), () => { store.unlocked = SKINS.map((s) => s.id); save(); toast(t("cheat_skins_toast")); });
  add(t("cheat_noads"), () => { store.noAds = !store.noAds; save(); renderHud(); toast(t("cheat_noads_toast", { s: store.noAds ? "ON" : "OFF" })); });
}

// 상품 가격과 광고 동의 상태는 받아 오는 대로 반영 (설정이 열려 있으면 다시 그림)
NcqIap.ready().then(() => { if (settingsShown && NcqIap.can("REMOVE_ADS")) showSettings(); }).catch(() => {});
NcqAds.ready().then(() => {
  privacyNeeded = !!NcqAds.privacyRequired();
  if (settingsShown && privacyNeeded) showSettings();
}).catch(() => {});

// ── 시작 ──────────────────────────────────
(function boot() {
  applySkin();
  const params = new URLSearchParams(location.search);
  const d = decodeDuel2(params.get("g")) || decodeDuel(params.get("d"));
  if (d) {
    // 링크로 들어오면 대결 시작. 새로고침해도 다시 시작하지 않게 주소에서 지움
    history.replaceState(null, "", location.pathname);
    const k = weekKey();
    if (!store.received.some((r) => r.week === k && r.name === d.name && r.score === d.score)) {
      store.received.push({ name: d.name, score: d.score, best: d.best, week: k });
      store.received = store.received.slice(-30);
    }
    // 점수는 수순을 리플레이해서 검증 (조작된 점수는 실제 점수로 바뀜)
    if (d.ops && d.ops.length) {
      const r = replay(d.seed, d.ops);
      if (r.valid) { d.score = r.score; d.best = r.best; d.verified = true; }
    }
    const rec = store.duels[String(d.seed)];
    if (rec && rec.myBest != null) {
      // 내가 이미 둔 판 → 친구의 답장(복수전)
      Object.assign(rec, { name: d.name, oppScore: d.score, oppBest: d.best, updated: Date.now() });
      save();
      if (!resume()) start("weekly", weeklySeed());
      showReply(d, rec);
      return;
    }
    store.duels[String(d.seed)] = { name: d.name, oppScore: d.score, oppBest: d.best, rounds: 0, retries: 0, updated: Date.now() };
    start("duel", d.seed, d);
    setTimeout(() => toast(t("challenge_toast", { name: nm(d.name) })), 300);
    return;
  }
  if (!resume()) start("weekly", weeklySeed());
  setTimeout(checkStreak, 400);
})();

// 테스트에서 상태를 볼 수 있게
window.__duel = {
  get game() { return game; }, get mode() { return mode; }, get ghost() { return ghost; }, get store() { return store; },
  doMove, requestMove, spawn, fakeChallenge, goal: () => dailyGoal(), sfx, bigMoment, checkStreak, addStamp, streakState, dayKey, prevDayKey,
  finish() { game.over = true; persist(); endShown = false; showResult(); },
  setCells(vals) { game.cells = vals.map((v) => (v ? { id: game.nextId++, v } : null)); game.over = false; persist(); renderAll(); },
};
