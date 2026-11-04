import { rng, INTRO_SEED, generate, daily, kstDateKey, prevDateKey, nextDateKey, dailyDifficulty, DIFFICULTY, geometry, findLastCell, stars, formatTime,
  shareText, findSingle, candidates, computeStreak, streakAtRisk, monthProgress, daysInMonth, badges } from "./sudoku.js";
import { load, save, reset } from "./store.js";
import { NcqAds } from "./ads.js";
import { haptic, setHapticEnabled, hapticSupported } from "./haptic.js";
import { drawResultCard, canvasToBlob } from "./card.js";
import { initNemo, renderNemoCard, nemoBack } from "./nemo.js";

const $ = (id) => document.getElementById(id);
let data = load();
setHapticEnabled(() => data.settings.haptic !== false);
let G = null;            // 현재 게임 상태
let timer = null;
let paused = false;
const MAX_MISTAKES = 3;  // 클래식만 (설정에서 끌 수 있어요). 오늘의 한 판은 기록만
const today = () => kstDateKey();
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const keyToDate = (k) => new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
const keyLabel = (k) => { const d = keyToDate(k); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- 친구 기록 링크 (?d=YYYYMMDD&vs=초&n=이름) → 친구 순위에 저장 ----------
const params = new URLSearchParams(location.search);
const vs = (() => {
  const d = Number(params.get("d")), t = Number(params.get("vs"));
  if (!(d > 20200101 && t > 0)) return null;
  const name = (params.get("n") || "친구").slice(0, 12);
  return { dateKey: d, seconds: Math.round(t), name };
})();
if (vs) {
  const list = data.friends[vs.dateKey] || (data.friends[vs.dateKey] = []);
  const f = list.find((x) => x.name === vs.name);
  if (!f) list.push({ name: vs.name, seconds: vs.seconds });
  else f.seconds = Math.min(f.seconds, vs.seconds);
  save(data);
}

// ---------- 화면 설정 (글씨 크기·테마) ----------
const hostTheme = document.documentElement.getAttribute("data-theme"); // 채팅 화면 등이 정한 테마
function applySettings() {
  const root = document.documentElement;
  root.classList.toggle("big", !!data.settings.big);
  const t = data.settings.theme;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  else if (hostTheme) root.setAttribute("data-theme", hostTheme);
  else root.removeAttribute("data-theme");
}
applySettings();

// ---------- 소리 (첫 터치 뒤에 켬) ----------
let audio = null;
function beep(freq = 660, dur = 0.06, type = "sine", vol = 0.08) {
  if (!data.settings.sound || document.hidden) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + dur);
  } catch { /* 소리 미지원 */ }
}
const sfx = {
  place: () => beep(720, 0.05),
  wrong: () => beep(180, 0.18, "square", 0.05),
  unit: () => { beep(880, 0.08); setTimeout(() => beep(1175, 0.1), 70); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.1), i * 110)),
  badge: () => [784, 988, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.14, "triangle", 0.08), i * 90)),
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { audio?.suspend?.(); if (G && !G.done) pauseGame(true); }
  else audio?.resume?.();
});

// ---------- 화면 전환 ----------
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  if (id === "game" && G?.mode === "classic") NcqAds.banner("BANNER"); // NCQ_ADS_BANNER: 클래식 하단 배너
  else NcqAds.hideBanner();
}
// 알림 문구는 차례로 보여요 (겹치면 앞의 것이 가려지지 않게)
const toastQueue = [];
function toast(msg) {
  toastQueue.push(msg);
  if (toastQueue.length === 1) showNextToast();
}
function showNextToast() {
  const t = $("toast"); t.textContent = toastQueue[0]; t.classList.remove("hidden");
  setTimeout(() => {
    toastQueue.shift();
    if (toastQueue.length) showNextToast(); else t.classList.add("hidden");
  }, 1900);
}

// ---------- 홈 ----------
function friendRanking(dateKey) {
  const list = (data.friends[dateKey] || []).map((f) => ({ ...f, me: false }));
  const rec = data.daily[dateKey];
  list.push({ name: data.settings.name || "나", seconds: rec ? rec.seconds : null, me: true });
  list.sort((a, b) => (a.seconds ?? 1e9) - (b.seconds ?? 1e9));
  return list;
}

function renderHome() {
  const t = today();
  const dt = keyToDate(t);
  $("today-date").textContent = `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${DAYS[dt.getUTCDay()]}요일 · ${DIFFICULTY[dailyDifficulty(t)].label}`;
  const rec = data.daily[t];
  const btn = $("btn-daily");
  const isNew = !data.tutorialDone;
  $("first-card").classList.toggle("hidden", !isNew);
  if (isNew) {
    const st = data.tutorialProgress?.stage || data.tutorialStage || 1;
    $("btn-first").textContent = st > 1 || data.tutorialProgress ? `이어서 하기 · ${st}/3단계` : "첫 판 시작하기";
  }
  btn.disabled = isNew;
  if (isNew) {
    btn.textContent = "첫 판을 풀면 열려요";
    btn.className = "btn ghost big";
    $("today-sub").textContent = "전국이 같은 문제를 풀어요";
  } else if (rec) {
    btn.textContent = `완료 ${"⭐".repeat(rec.stars)} · ${formatTime(rec.seconds)} — 결과 보기`;
    btn.className = "btn done big";
    $("today-sub").textContent = "내일 새 문제가 열려요";
  } else {
    btn.textContent = data.dailyProgress[t] ? "이어서 풀기" : "시작하기";
    btn.className = "btn primary big";
    $("today-sub").textContent = "전국이 같은 문제를 풀어요";
  }
  // 친구 링크 안내
  const vb = $("vs-banner");
  if (vs && vs.dateKey === t) {
    vb.textContent = rec
      ? (rec.seconds < vs.seconds ? `🎉 ${vs.name} 님 기록(${formatTime(vs.seconds)})을 이겼어요!` : `${vs.name} 님 기록 ${formatTime(vs.seconds)} — 아쉽게 졌어요`)
      : `🏁 ${vs.name} 님이 ${formatTime(vs.seconds)}에 풀었어요. 이겨 볼까요?`;
    vb.classList.remove("hidden");
  } else vb.classList.add("hidden");

  // 연속 기록
  const st = computeStreak(data.daily, t);
  $("streak-cur").textContent = st.current;
  $("streak-best").textContent = st.best;
  $("daily-count").textContent = Object.keys(data.daily).length;

  // 어제를 놓쳤을 때: 어제 문제 풀고 연속 기록 지키기
  const y = prevDateKey(t);
  const risk = !isNew && streakAtRisk(data.daily, t);
  $("risk-card").classList.toggle("hidden", !risk);
  if (risk) $("risk-title").textContent = `🔥 ${computeStreak(data.daily, prevDateKey(y)).current}일 연속이 끊기기 직전이에요`;

  // 이번 주 (월~일)
  const dow = (dt.getUTCDay() + 6) % 7;
  let k = t; for (let i = 0; i < dow; i++) k = prevDateKey(k);
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const r = data.daily[k];
    const cls = r ? (r.solvedOn && r.solvedOn > k ? "late" : "on") : "";
    cells.push(`<div>${"월화수목금토일"[i]}<i class="${cls} ${k === t ? "today" : ""}">✓</i></div>`);
    k = nextDateKey(k);
  }
  $("week").innerHTML = cells.join("");

  // 오늘의 친구 순위 (친구 기록 링크를 받았을 때)
  const friends = data.friends[t] || [];
  $("ranking").classList.toggle("hidden", friends.length === 0);
  if (friends.length) {
    let pos = 0;
    $("ranking-list").innerHTML = friendRanking(t).map((f) => {
      if (f.seconds != null) pos++;
      return `<li class="${f.me ? "me" : ""}"><span class="pos">${f.seconds != null ? pos : "-"}</span><span class="nm">${esc(f.name)}${f.me ? " (나)" : ""}</span><span class="tm">${f.seconds != null ? formatTime(f.seconds) : "아직 안 풀었어요"}</span></li>`;
    }).join("");
  }

  // 이번 달 달력
  const yy = dt.getUTCFullYear(), mm = dt.getUTCMonth() + 1;
  const mp = monthProgress(data.daily, yy, mm, t);
  $("month-label").textContent = mp.complete ? `🗓️ ${mm}월 완주!` : `${mm}월 ${mp.done}/${mp.total}일`;
  $("month-bar").style.width = `${Math.round((mp.done / mp.total) * 100)}%`;

  // 클래식
  const unlocked = data.classicUnlocked;
  $("classic-lock").textContent = unlocked ? "무제한으로 즐겨요" : "오늘의 한 판을 풀면 열려요";
  $("diff-grid").innerHTML = Object.entries(DIFFICULTY).filter(([, d]) => !d.hidden).map(([id, d]) =>
    `<button class="diff-btn" data-diff="${id}" ${unlocked ? "" : "disabled"}><b>${d.label}</b><small>${
      data.stats.best[id] ? "최고 " + formatTime(data.stats.best[id]) : "기록 없음"}</small></button>`).join("");
  const resumable = data.inProgress?.mode === "classic";
  $("btn-resume").classList.toggle("hidden", !resumable);
  if (resumable) $("btn-resume").textContent = `이어하기 · ${DIFFICULTY[data.inProgress.difficulty].label} ${formatTime(data.inProgress.seconds)}`;

  renderNemoCard();
}

$("btn-first").onclick = () => startTutorial();
$("btn-daily").onclick = () => {
  const t = today();
  if (!data.tutorialDone) return;
  if (data.daily[t]) { from = "home"; return showResult(data.daily[t], t, true); }
  startDaily(t, "home");
};
$("btn-risk").onclick = () => openPast(prevDateKey(today()), "home");
$("month-strip").onclick = () => openRecords();
$("btn-records").onclick = () => openRecords();
$("diff-grid").onclick = (e) => {
  const b = e.target.closest(".diff-btn"); if (!b || b.disabled) return;
  const start = () => startGame(newGame(generate((Math.random() * 2 ** 32) >>> 0, b.dataset.diff), "classic", 0), "home");
  if (data.inProgress?.mode === "classic") {
    dialog("새 게임을 시작할까요?", "진행 중인 클래식 게임은 사라져요.", [["새 게임", start, "primary"], ["취소", null, "ghost"]]);
  } else start();
};
$("btn-resume").onclick = () => startGame(data.inProgress, "home");

function startDaily(k, origin) {
  if (data.dailyProgress[k]) return startGame(data.dailyProgress[k], origin);
  startGame(newGame(daily(k), "daily", k), origin);
}

// 지난 문제: 보상형 광고로 열어요 (광고가 꺼진 빌드에서는 그냥 열려요)
function openPast(k, origin) {
  if (data.daily[k]) { from = origin; return showResult(data.daily[k], k, true); }
  if (k >= today() || data.unlocked[k] || data.dailyProgress[k] || !NcqAds.can("ARCHIVE")) return startDaily(k, origin);
  const isYesterday = k === prevDateKey(today());
  dialog(`${keyLabel(k)} 문제 열기`,
    isYesterday ? "광고를 보면 어제 문제를 풀 수 있어요. 오늘 안에 풀면 연속 기록이 이어져요." : "광고를 보면 이 날 문제를 풀 수 있어요. 연속 기록에는 들어가지 않아요.", [
    ["광고 보고 열기", async () => {
      // NCQ_ADS_ARCHIVE: 지난 문제 열기 보상형 광고
      if (await NcqAds.rewarded("ARCHIVE")) { data.unlocked[k] = true; save(data); startDaily(k, origin); }
    }, "primary"],
    ["취소", null, "ghost"],
  ]);
}

// ---------- 기록 · 보관함 ----------
let cal = null;
const EARLIEST = 202601; // 보관함 첫 달
function openRecords() {
  const d = keyToDate(today());
  cal = cal || { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  renderRecords(); show("records");
}
function renderRecords() {
  const t = today();
  const { y, m } = cal;
  $("cal-title").textContent = `${y}년 ${m}월`;
  const nowYm = Math.floor(t / 100);
  $("cal-prev").disabled = y * 100 + m <= EARLIEST;
  $("cal-next").disabled = y * 100 + m >= nowYm;
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const n = daysInMonth(y, m);
  const html = [];
  for (let i = 0; i < first; i++) html.push("<span></span>");
  for (let d = 1; d <= n; d++) {
    const k = y * 10000 + m * 100 + d;
    const r = data.daily[k];
    if (k > t) { html.push(`<button disabled>${d}</button>`); continue; }
    let cls = "", sub = "";
    if (r) { cls = r.solvedOn && r.solvedOn > k ? "late" : "done"; sub = "★".repeat(r.stars); }
    else if (k < t) { cls = "open"; sub = data.unlocked[k] || data.dailyProgress[k] ? "열림" : "🔒"; }
    html.push(`<button class="${cls} ${k === t ? "today" : ""}" data-k="${k}">${d}<small>${sub}</small></button>`);
  }
  $("cal").innerHTML = html.join("");
  const mp = monthProgress(data.daily, y, m, t);
  const past = y * 100 + m < nowYm;
  $("cal-foot").innerHTML = mp.complete ? `🗓️ <b>${m}월 완주</b> 트로피를 받았어요!`
    : past ? `<b>${mp.done}/${mp.total}일</b> 풀었어요` : `<b>${mp.done}/${mp.total}일</b> · 완주까지 ${mp.total - mp.done}일`;

  $("badges").innerHTML = badges(data, t).map((b) => `<div class="badge ${b.got ? "" : "off"}"><i>${b.icon}</i>${b.label}</div>`).join("");
  $("bests").innerHTML = Object.entries(DIFFICULTY).filter(([, d]) => !d.hidden).map(([id, d]) =>
    `<div><b>${data.stats.best[id] ? formatTime(data.stats.best[id]) : "-"}</b><small>${d.label}</small></div>`).join("");
}
$("cal").onclick = (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  const k = +b.dataset.k;
  if (k === today() && !data.daily[k]) return startDaily(k, "records");
  openPast(k, "records");
};
$("cal-prev").onclick = () => { cal.m--; if (cal.m < 1) { cal.m = 12; cal.y--; } renderRecords(); };
$("cal-next").onclick = () => { cal.m++; if (cal.m > 12) { cal.m = 1; cal.y++; } renderRecords(); };
$("btn-records-back").onclick = () => { renderHome(); show("home"); };

// ---------- 게임 ----------
function newGame(p, mode, dateKey) {
  const n = p.n || 9;
  return {
    mode, dateKey, difficulty: p.difficulty, n,
    puzzle: p.puzzle, solution: p.solution,
    values: p.puzzle.slice(), notes: new Array(n * n).fill(0),
    mistakes: 0, seconds: 0, history: [], sel: -1, noteMode: false,
    boxMistakes: new Array(n).fill(0), hinted: new Array(n).fill(0), done: false, continued: false,
  };
}
// 지금 판의 모양 (예전에 저장된 판은 9x9)
const geo = () => geometry(G?.n || 9);

let from = "home";
let hintShown = null;
function startGame(state, origin = "home") {
  G = state; G.noteMode = false; paused = false; from = origin; hintShown = null;
  buildBoard(); render(); show("game");
  clearInterval(timer);
  timer = setInterval(() => { if (!paused && !G.done) { G.seconds++; $("game-time").textContent = formatTime(G.seconds); if (G.seconds % 5 === 0) persist(); } }, 1000);
}

function persist() {
  if (!G || G.done) return;
  if (G.mode === "daily") data.dailyProgress[G.dateKey] = G;
  else if (G.mode === "tutorial") data.tutorialProgress = G;
  else data.inProgress = G;
  save(data);
}

function buildBoard() {
  const g = geo();
  const b = $("board"); b.innerHTML = "";
  b.style.gridTemplateColumns = `repeat(${g.n}, 1fr)`;
  b.dataset.size = g.n;
  for (let i = 0; i < g.cells; i++) {
    const c = document.createElement("div");
    const r = g.row(i), col = g.col(i);
    c.className = "cell"
      + (col === g.n - 1 ? " lc" : (col % g.bw === g.bw - 1 ? " br" : ""))
      + (r === g.n - 1 ? " lr" : (r % g.bh === g.bh - 1 ? " bb" : ""));
    c.dataset.i = i;
    b.appendChild(c);
  }
  $("pad").style.gridTemplateColumns = `repeat(${g.n}, 1fr)`;
  $("pad").dataset.size = g.n;
  $("pad").innerHTML = [...Array(g.n).keys()].map((k) => `<button class="num" data-n="${k + 1}">${k + 1}<small></small></button>`).join("");
  // NCQ_TEST_CHEAT: 정답 채우기 버튼
  $("t-cheat").classList.toggle("hidden", !window.NCQ_TEST_CHEAT && !isDev());
  $("hint-box").classList.add("hidden");
  $("coach").classList.add("hidden");
}
function isDev() { return !window.NCQ && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.has("cheat"); }

const correctGrid = () => G.values.map((v, i) => (v === G.solution[i] ? v : 0));
const isSolved = (i) => G.values[i] === G.solution[i];

// 고른 칸이 어떤 줄·박스의 마지막 빈칸이면 그 답을 숫자판에 살짝 표시해요
function lastCellSuggestion() {
  const i = G.sel;
  if (i < 0 || isSolved(i)) return 0;
  for (const u of geo().units) {
    if (!u.cells.includes(i)) continue;
    if (u.cells.every((k) => k === i || isSolved(k))) return G.solution[i];
  }
  return 0;
}

function render() {
  const cells = $("board").children;
  const selV = G.sel >= 0 ? G.values[G.sel] : 0;
  const g = geo();
  const peers = G.sel >= 0 ? new Set(g.peers[G.sel]) : new Set();
  const hintUnit = hintShown?.unit ? new Set(hintShown.unit.cells) : hintShown ? new Set(g.peers[hintShown.cell]) : null;
  const digits = [...Array(g.n).keys()].map((k) => k + 1);
  for (let i = 0; i < g.cells; i++) {
    const c = cells[i], v = G.values[i];
    const wrong = v && v !== G.solution[i];
    c.classList.toggle("given", !!G.puzzle[i]);
    c.classList.toggle("sel", i === G.sel && !hintShown);
    c.classList.toggle("peer", !hintShown && peers.has(i));
    c.classList.toggle("same", !hintShown && !!selV && v === selV && i !== G.sel);
    c.classList.toggle("wrong", !!wrong);
    c.classList.toggle("hint-unit", !!hintUnit && hintUnit.has(i) && i !== hintShown.cell);
    c.classList.toggle("hint-cell", !!hintShown && i === hintShown.cell);
    if (v) c.textContent = v;
    else if (G.notes[i]) c.innerHTML = `<div class="notes">${digits.map((n) => `<span>${G.notes[i] & (1 << n) ? n : ""}</span>`).join("")}</div>`;
    else c.textContent = "";
  }
  const counts = new Array(10).fill(0);
  G.values.forEach((v, i) => { if (v && v === G.solution[i]) counts[v]++; });
  const sug = lastCellSuggestion();
  for (const b of $("pad").children) {
    const n = +b.dataset.n; const left = g.n - counts[n];
    b.classList.toggle("used", left === 0);
    b.classList.toggle("suggest", !G.noteMode && (n === sug || (G.coach === 2 && G.sel === G.coachCell && n === G.solution[G.sel])));
    b.querySelector("small").textContent = left;
  }
  const label = G.mode === "daily"
    ? (G.dateKey === today() ? "오늘의 한 판" : `${keyLabel(G.dateKey)} 문제`)
    : G.mode === "tutorial" ? `연습 ${G.stage || 3}/3` : "클래식";
  $("game-mode").textContent = `${label} · ${DIFFICULTY[G.difficulty].label}`;
  renderCoach();
  const limited = G.mode === "classic" && data.settings.mistakeLimit;
  $("game-mistakes").innerHTML = limited ? `<span class="${G.mistakes ? "bad" : ""}">실수 ${G.mistakes}/${MAX_MISTAKES}</span>` : `실수 ${G.mistakes}`;
  $("game-time").textContent = formatTime(G.seconds);
  $("t-note").classList.toggle("on", G.noteMode);
  $("note-state").textContent = G.noteMode ? "ON" : "OFF";
  $("pad").classList.toggle("note-mode", G.noteMode);
  const hb = $("hint-badge");
  if (G.mode === "tutorial") { hb.textContent = "무료"; hb.className = ""; }
  else if (data.hints > 0) { hb.textContent = data.hints; hb.className = ""; }
  else { hb.textContent = "AD"; hb.className = NcqAds.can("HINT") ? "ad" : "hidden"; }
  const vl = $("vs-line");
  const fr = G.mode === "daily" ? (data.friends[G.dateKey] || []) : [];
  if (fr.length) {
    const best = fr.reduce((a, b) => (a.seconds <= b.seconds ? a : b));
    vl.textContent = `${best.name} 님 기록 ${formatTime(best.seconds)}${fr.length > 1 ? ` 외 ${fr.length - 1}명` : ""}`;
    vl.classList.remove("hidden");
  } else vl.classList.add("hidden");
}

$("board").addEventListener("pointerdown", (e) => {
  const c = e.target.closest(".cell"); if (!c || G.done) return;
  if (hintShown) closeHint();
  if (G.sel !== +c.dataset.i) haptic("select");
  G.sel = +c.dataset.i;
  if (G.coach === 1 && !isSolved(G.sel)) G.coach = 2;
  render();
});
$("pad").addEventListener("click", (e) => { const b = e.target.closest(".num"); if (b) input(+b.dataset.n); });
document.addEventListener("keydown", (e) => {
  if (!$("game").classList.contains("active") || !G || G.done || e.target.tagName === "INPUT") return;
  if (/^[1-9]$/.test(e.key) && +e.key <= geo().n) input(+e.key);
  else if (e.key === "Backspace" || e.key === "Delete") erase();
  else if (e.key.startsWith("Arrow") && G.sel >= 0) {
    const n = geo().n;
    const d = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    G.sel = (G.sel + d + n * n) % (n * n); render();
  }
});

function snapshot() { G.history.push({ values: G.values.slice(), notes: G.notes.slice() }); if (G.history.length > 200) G.history.shift(); }

function input(n) {
  const i = G.sel;
  if (i < 0 || G.done || G.puzzle[i]) return;
  if (hintShown) closeHint();
  if (isSolved(i)) return; // 맞힌 칸은 고정
  if (G.noteMode) {
    if (G.values[i]) return;
    snapshot(); G.notes[i] ^= 1 << n; haptic("note"); render(); persist(); return;
  }
  if (G.values[i] === n) return;
  snapshot();
  G.values[i] = n;
  if (n !== G.solution[i]) {
    G.mistakes++; G.boxMistakes[geo().box(i)]++;
    sfx.wrong(); haptic("wrong");
    if (G.mode === "tutorial" && !G.wrongTold) { G.wrongTold = true; toast("빨간 숫자는 틀린 거예요. ⌫ 지우기로 지워요"); }
    render(); persist();
    if (G.mode === "classic" && data.settings.mistakeLimit && G.mistakes >= MAX_MISTAKES) return gameOver();
    return;
  }
  placed(i, "place");
}

// 맞는 숫자가 들어간 뒤 공통 처리
function placed(i, kind) {
  const n = G.values[i];
  G.notes[i] = 0;
  for (const p of geo().peers[i]) G.notes[p] &= ~(1 << n); // 메모 자동 정리
  sfx.place(); haptic(kind);
  if (G.coach === 1 || G.coach === 2) G.coach = 3;
  else if (G.coach === 4) G.coach = 5;
  render();
  const el = $("board").children[i];
  el.classList.add("pop"); setTimeout(() => el.classList.remove("pop"), 200);
  flashUnits(i);
  persist();
  if (G.values.every((v, k) => v === G.solution[k])) win();
}

function flashUnits(i) {
  let any = false;
  for (const u of geo().units) {
    if (!u.cells.includes(i) || !u.cells.every(isSolved)) continue;
    any = true;
    u.cells.forEach((k, idx) => setTimeout(() => {
      const el = $("board").children[k]; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }, idx * 30));
  }
  if (any) { sfx.unit(); setTimeout(() => haptic("unit"), 120); }
}

function erase() {
  const i = G.sel;
  if (i < 0 || G.puzzle[i] || G.done || isSolved(i)) return;
  if (!G.values[i] && !G.notes[i]) return;
  snapshot(); G.values[i] = 0; G.notes[i] = 0; haptic("note"); render(); persist();
}

$("t-erase").onclick = erase;
$("t-undo").onclick = () => {
  const h = G.history.pop(); if (!h) return toast("되돌릴 수 없어요");
  // 맞힌 칸은 되돌려도 남겨요 (실수 기록을 지우는 꼼수 방지)
  G.values = h.values.map((v, i) => (isSolved(i) ? G.values[i] : v)); G.notes = h.notes;
  haptic("note"); render(); persist();
};
$("t-note").onclick = () => { G.noteMode = !G.noteMode; haptic("note"); render(); };
$("t-auto").onclick = () => {
  if (G.done) return;
  snapshot();
  const cand = candidates(correctGrid());
  for (let i = 0; i < geo().cells; i++) if (!G.values[i]) G.notes[i] = cand[i];
  haptic("note"); render(); persist();
  toast("빈칸마다 들어갈 수 있는 숫자를 메모했어요");
};

// 힌트: 다음에 둘 수 있는 수와 그 이유를 보여 주고, '채우기'를 누르면 넣어요
$("t-hint").onclick = async () => {
  if (G.done) return;
  if (hintShown) return;
  const free = G.mode === "tutorial";
  if (!free && data.hints <= 0) {
    if (!NcqAds.can("HINT")) return toast("힌트를 다 썼어요");
    paused = true;
    // NCQ_ADS_HINT: 힌트 충전 보상형 광고
    const ok = await NcqAds.rewarded("HINT");
    paused = false;
    if (!ok) return;
    data.hints += 1;
  }
  let h = (G.mode === "tutorial" && findLastCell(correctGrid())) || findSingle(correctGrid());
  if (!h) {
    // 싱글로 안 풀리는 단계 (어려움·전문가): 후보가 가장 적은 칸의 답을 알려요
    const cand = candidates(correctGrid());
    let best = -1, bn = 10;
    for (let i = 0; i < geo().cells; i++) {
      if (isSolved(i)) continue;
      const n = cand[i].toString(2).split("1").length - 1;
      if (n < bn) { bn = n; best = i; }
    }
    if (best < 0) return;
    h = { cell: best, value: G.solution[best], unit: null,
      text: `지금은 메모로 후보를 줄여야 하는 단계예요. 후보가 가장 적은 이 칸의 답은 ${G.solution[best]}이에요.` };
  }
  if (!free) { data.hints--; save(data); }
  if (G.coach === 3) G.coach = 4;
  G.hinted[geo().box(h.cell)]++;
  hintShown = h; G.sel = h.cell;
  $("hint-text").textContent = h.text;
  $("hint-box").classList.remove("hidden");
  haptic("hint"); render(); persist();
};
function closeHint() { hintShown = null; $("hint-box").classList.add("hidden"); if (G?.coach === 4) G.coach = 5; render(); }
$("hint-close").onclick = closeHint;
$("hint-fill").onclick = () => {
  if (!hintShown) return;
  const { cell, value } = hintShown;
  hintShown = null; $("hint-box").classList.add("hidden");
  snapshot(); G.sel = cell; G.values[cell] = value;
  placed(cell, "place");
};
$("t-cheat").onclick = () => { G.values = G.solution.slice(); render(); win(); };

$("btn-back").onclick = () => leaveGame();
$("btn-pause").onclick = () => pauseGame();
function goBack() {
  G = null; hintShown = null;
  if (from === "records") { renderRecords(); show("records"); } else { renderHome(); show("home"); }
}
function leaveGame() { persist(); clearInterval(timer); goBack(); }

function pauseGame(silent) {
  if (!G || G.done || paused) return;
  paused = true; persist();
  if (silent && !$("dialog").classList.contains("hidden")) return;
  dialog("일시정지", `${$("game-mode").textContent} · ${formatTime(G.seconds)}`, [
    ["계속하기", () => { paused = false; }, "primary"],
    ["나가기", () => { paused = false; leaveGame(); }, "ghost"],
  ], () => { paused = false; });
}

function gameOver() {
  paused = true;
  const actions = [];
  if (!G.continued && NcqAds.can("CONTINUE")) {
    actions.push(["광고 보고 이어하기", async () => {
      // NCQ_ADS_CONTINUE: 실수 3회 뒤 이어하기 보상형 광고
      if (await NcqAds.rewarded("CONTINUE")) { G.continued = true; G.mistakes = MAX_MISTAKES - 1; paused = false; render(); }
      else gameOver();
    }, "primary"]);
  }
  actions.push(["새 게임", () => { data.stats.classicPlayed++; const d = G.difficulty; data.inProgress = null; save(data); startGame(newGame(generate((Math.random() * 2 ** 32) >>> 0, d), "classic", 0), from); }, actions.length ? "ghost" : "primary"]);
  actions.push(["나가기", () => { data.stats.classicPlayed++; data.inProgress = null; save(data); clearInterval(timer); goBack(); }, "ghost"]);
  dialog("실수 3번이에요", "이어서 풀거나 새 게임을 시작해요. 설정에서 실수 제한을 끌 수 있어요.", actions);
}

function win() {
  G.done = true; clearInterval(timer); hintShown = null; $("hint-box").classList.add("hidden");
  sfx.win(); haptic("win");
  const before = new Set(badges(data, today()).filter((b) => b.got).map((b) => b.id));
  const starCount = stars(G);
  const rec = { seconds: G.seconds, mistakes: G.mistakes, stars: starCount, boxMistakes: G.boxMistakes, hinted: G.hinted, difficulty: G.difficulty };
  if (G.mode === "tutorial") {
    rec.stage = G.stage || 3;
    if (rec.stage >= 3) finishTutorial();
    else { data.tutorialProgress = null; data.tutorialStage = rec.stage + 1; }
  } else if (G.mode === "daily") {
    rec.solvedOn = today();
    data.daily[G.dateKey] = rec;
    delete data.dailyProgress[G.dateKey];
    if (!data.classicUnlocked) { data.classicUnlocked = true; setTimeout(() => toast("클래식 모드가 열렸어요!"), 1500); }
  } else {
    data.inProgress = null;
    data.stats.classicPlayed++; data.stats.classicWon++;
    const b = data.stats.best[G.difficulty];
    if (!b || G.seconds < b) data.stats.best[G.difficulty] = G.seconds;
    data.classicSinceAd++;
  }
  save(data);
  const newBadges = badges(data, today()).filter((b) => b.got && !before.has(b.id));
  const mode = G.mode, dateKey = G.dateKey;
  setTimeout(() => {
    showResult(rec, dateKey, false, mode);
    if (newBadges.length) setTimeout(() => { sfx.badge(); toast(`새 배지: ${newBadges[0].icon} ${newBadges[0].label}`); }, 500);
  }, 700);
}

function rankText(dateKey) {
  const fr = data.friends[dateKey] || [];
  if (!fr.length) return "";
  const list = friendRanking(dateKey).filter((f) => f.seconds != null);
  const pos = list.findIndex((f) => f.me) + 1;
  return `친구 ${list.length}명 중 ${pos}위`;
}

function shareLink(dateKey, seconds) {
  const platform = window.NCQ?.NCQ_PLATFORM;
  if (platform === "toss" || platform === "android") return ""; // 앱 안에서는 외부 링크를 넣지 않아요
  if (!/github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname)) return ""; // 채팅 미리보기 등
  const n = data.settings.name ? `&n=${encodeURIComponent(data.settings.name)}` : "";
  return `${location.origin}${location.pathname}?d=${dateKey}&vs=${seconds}${n}`;
}

function showResult(rec, dateKey, fromHome, mode = "daily") {
  if (mode === "tutorial") return showTutorialResult(rec);
  $("btn-result-next").className = "btn ghost";
  $("btn-share").className = "btn primary"; $("btn-share").textContent = "결과 공유하기";
  const sc = rec.stars;
  const isDaily = mode === "daily";
  $("result-stars").innerHTML = [1, 2, 3].map((n) => `<span class="${n <= sc ? "" : "off"}">⭐</span>`).join("");
  $("r-time").textContent = formatTime(rec.seconds);
  $("r-mistakes").textContent = rec.mistakes;
  const streak = computeStreak(data.daily, today()).current;
  $("r-streak").textContent = isDaily ? `${streak}일` : DIFFICULTY[rec.difficulty].label;
  $("r-third-label").textContent = isDaily ? "연속" : "난이도";
  const rk = isDaily ? rankText(dateKey) : "";
  const fr = isDaily ? (data.friends[dateKey] || []) : [];
  const beatAll = fr.length && fr.every((f) => rec.seconds < f.seconds);
  $("result-title").textContent = isDaily
    ? (beatAll ? "친구들을 모두 이겼어요! 🎉" : dateKey === today() ? "오늘도 해냈어요!" : `${keyLabel(dateKey)} 문제 완료!`)
    : (data.stats.best[rec.difficulty] === rec.seconds ? "최고 기록이에요!" : "클리어!");
  $("result-rank").textContent = rk;
  $("result-rank").classList.toggle("hidden", !rk);

  const img = $("share-img");
  let canvas = null;
  if (isDaily) {
    try {
      canvas = drawResultCard(rec, { dateKey, streak, name: data.settings.name, rankText: rk });
      img.src = canvas.toDataURL("image/png");
      img.classList.remove("hidden");
    } catch { img.classList.add("hidden"); }
  } else img.classList.add("hidden");

  const text = isDaily ? shareText({ dateKey, seconds: rec.seconds, mistakes: rec.mistakes, streak, starCount: sc, boxMistakes: rec.boxMistakes, hinted: rec.hinted }) : "";
  $("btn-share").classList.toggle("hidden", !isDaily);
  $("btn-share").onclick = () => share(text, canvas, dateKey, rec.seconds);
  const next = $("btn-result-next");
  next.textContent = fromHome || isDaily ? (fromHome ? "닫기" : "홈으로") : "다음 판";
  next.onclick = async () => {
    $("result").classList.add("hidden");
    if (isDaily || fromHome) { if (G?.done) clearInterval(timer); if (G?.done || !G) goBack(); return; }
    // 첫 3판은 전면 광고 없이, 이후 2판에 1번
    if (data.stats.classicWon > 3 && data.classicSinceAd >= 2) {
      // NCQ_ADS_STAGE_CLEAR: 클래식 클리어 전면 광고
      if (await NcqAds.interstitial("STAGE_CLEAR")) { data.classicSinceAd = 0; save(data); }
    }
    startGame(newGame(generate((Math.random() * 2 ** 32) >>> 0, rec.difficulty), "classic", 0), from);
  };
  $("result").classList.remove("hidden");
}

// ---------- 신규 유저 첫 판: 4×4 → 6×6 → 9×9 세 단계 ----------
const STAGES = { 1: "mini4", 2: "mini6", 3: "intro" };
// 코치: 1 칸 고르기 → 2 숫자 넣기 → 3 힌트 눌러 보기 → 4 힌트 채우기 → 5 혼자 풀기 (1단계)
//       6 = 2단계 시작 안내, 7 = 3단계 시작 안내, 0 = 끝
const COACH = {
  1: "빈칸을 하나 눌러 보세요. 반짝이는 칸부터 해 볼까요?",
  2: "아래 숫자를 눌러 칸을 채워요. 같은 가로줄·세로줄·박스에 같은 숫자가 있으면 안 돼요.",
  3: "잘했어요! 막히면 💡 힌트가 이유와 함께 알려 줘요. 한번 눌러 보세요.",
  5: "이제 혼자 끝까지 풀어 봐요. 줄이나 박스를 다 채우면 반짝여요!",
  6: "이번엔 6×6이에요. 줄이나 박스에 빈칸이 하나만 남은 곳부터 채워 보세요.",
  7: "이제 진짜 크기 9×9예요! 숫자 1~9와 3×3 박스 9개로 이뤄져요. 막히면 힌트를 써요.",
};
function startStage(stage) {
  const g = newGame(generate(INTRO_SEED, STAGES[stage]), "tutorial", 0);
  g.stage = stage;
  g.coach = stage === 1 ? 1 : stage === 2 ? 6 : 7;
  g.coachCell = stage === 1 ? (findLastCell(g.puzzle) || findSingle(g.puzzle))?.cell ?? -1 : -1;
  startGame(g, "home");
}
function startTutorial() {
  if (data.tutorialProgress) return startGame(data.tutorialProgress, "home");
  startStage(data.tutorialStage || 1);
}
function renderCoach() {
  const box = $("coach");
  const step = G?.coach || 0;
  const text = COACH[step];
  box.classList.toggle("hidden", !text || !!hintShown);
  if (text) $("coach-text").textContent = text;
  $("coach-ok").classList.toggle("hidden", ![5, 6, 7].includes(step));
  const cells = $("board").children;
  for (let i = 0; i < cells.length; i++) cells[i].classList.toggle("coach-cell", step === 1 && i === G.coachCell);
  $("t-hint").classList.toggle("coach-tool", step === 3);
}
$("coach-ok").onclick = () => { if (G) { G.coach = 0; render(); persist(); } };

function finishTutorial() { data.tutorialDone = true; data.tutorialProgress = null; data.tutorialStage = 3; save(data); }

function showTutorialResult(rec) {
  const stage = rec.stage || 3;
  $("result-stars").innerHTML = [1, 2, 3].map((n) => `<span class="${n <= rec.stars ? "" : "off"}">⭐</span>`).join("");
  $("r-time").textContent = formatTime(rec.seconds);
  $("r-mistakes").textContent = rec.mistakes;
  $("share-img").classList.add("hidden");
  const next = $("btn-result-next"), alt = $("btn-share");
  next.disabled = false; next.className = "btn primary";
  if (stage < 3) {
    $("result-title").textContent = `${stage}단계 완료! 👏`;
    $("r-streak").textContent = `${stage}/3`;
    $("r-third-label").textContent = "단계";
    $("result-rank").textContent = stage === 1 ? "규칙을 익혔어요! 다음은 조금 큰 6×6이에요." : "좋아요! 마지막은 진짜 크기 9×9예요.";
    next.textContent = `${stage + 1}단계 하기`;
    next.onclick = () => { $("result").classList.add("hidden"); clearInterval(timer); G = null; startStage(stage + 1); };
    // 1단계 뒤에는 스도쿠를 아는 사람이 바로 넘어갈 수 있게
    alt.className = "btn ghost";
    alt.classList.toggle("hidden", stage !== 1);
    alt.textContent = "스도쿠를 알아요 · 바로 오늘의 한 판";
    alt.onclick = () => { finishTutorial(); $("result").classList.add("hidden"); clearInterval(timer); G = null; startDaily(today(), "home"); };
  } else {
    $("result-title").textContent = "첫 판 완료! 🎉";
    $("r-streak").textContent = "열림";
    $("r-third-label").textContent = "오늘의 한 판";
    $("result-rank").textContent = "이제 매일 새 문제가 열려요. 전국이 함께 푸는 오늘의 한 판에 도전해 볼까요?";
    alt.classList.add("hidden");
    next.textContent = "오늘의 한 판 시작하기";
    next.onclick = () => { $("result").classList.add("hidden"); clearInterval(timer); G = null; startDaily(today(), "home"); };
  }
  $("result-rank").classList.remove("hidden");
  $("result").classList.remove("hidden");
}

async function share(text, canvas, dateKey, seconds) {
  const link = shareLink(dateKey, seconds);
  const full = link ? `${text}\n나랑 겨뤄 볼래요? ${link}` : text;
  // 1) 이미지 + 글 공유 (휴대폰 공유 창)
  try {
    if (canvas && navigator.canShare) {
      const blob = await canvasToBlob(canvas);
      const file = blob && new File([blob], `dailydoku-${dateKey}.png`, { type: "image/png" });
      if (file && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: full }); return; }
    }
    if (navigator.share) { await navigator.share({ text: full }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  // 2) 복사
  try { await navigator.clipboard.writeText(full); toast("결과를 복사했어요. 대화방에 붙여 넣어 보세요"); return; } catch { /* 아래로 */ }
  // 3) 직접 복사할 수 있게 보여 주기
  const ta = document.createElement("textarea");
  ta.value = full; ta.readOnly = true; ta.rows = 7; ta.style.cssText = "width:100%;border-radius:12px;padding:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);user-select:text;-webkit-user-select:text";
  dialog("결과 복사하기", ta, [["닫기", null, "ghost"]]);
  setTimeout(() => { ta.focus(); ta.select(); }, 50);
}

// ---------- 공용 다이얼로그 ----------
let dialogOnClose = null;
function dialog(title, body, actions, onClose) {
  $("dialog-title").textContent = title;
  const bodyEl = $("dialog-body");
  if (typeof body === "string") bodyEl.textContent = body; else { bodyEl.innerHTML = ""; bodyEl.appendChild(body); }
  const box = $("dialog-actions"); box.innerHTML = "";
  for (const [label, fn, cls] of actions) {
    const b = document.createElement("button"); b.className = `btn ${cls || "ghost"}`; b.textContent = label;
    b.onclick = () => { closeDialog(false); fn?.(); };
    box.appendChild(b);
  }
  dialogOnClose = onClose || null;
  $("dialog").classList.remove("hidden");
}
function closeDialog(runOnClose = true) {
  $("dialog").classList.add("hidden");
  if (runOnClose) dialogOnClose?.();
  dialogOnClose = null;
}
$("dialog").addEventListener("click", (e) => { if (e.target.id === "dialog") closeDialog(); });
function closeResult() { $("result").classList.add("hidden"); if (G?.done) goBack(); }
$("result").addEventListener("click", (e) => { if (e.target.id === "result") closeResult(); });

// ---------- 설정 ----------
function switchRow(label, id, on, onToggle) {
  const row = document.createElement("div"); row.className = "setting-row";
  row.innerHTML = `<span>${label}</span><button class="switch ${on ? "on" : ""}" id="${id}" aria-label="${label}" aria-pressed="${on}"></button>`;
  row.querySelector("button").onclick = (e) => { const v = onToggle(); e.currentTarget.classList.toggle("on", v); e.currentTarget.setAttribute("aria-pressed", v); save(data); };
  return row;
}
$("btn-settings").onclick = async () => {
  const s = data.settings;
  const wrap = document.createElement("div");
  const nameRow = document.createElement("div"); nameRow.className = "setting-row";
  nameRow.innerHTML = `<span>닉네임 <small style="color:var(--sub)">친구 순위에 보여요</small></span><input class="name-input" id="set-name" maxlength="12" placeholder="나" />`;
  const inp = nameRow.querySelector("input"); inp.value = s.name || "";
  inp.oninput = () => { s.name = inp.value.trim().slice(0, 12); save(data); };
  wrap.appendChild(nameRow);
  wrap.appendChild(switchRow("소리", "sw-sound", s.sound, () => (s.sound = !s.sound)));
  if (hapticSupported()) wrap.appendChild(switchRow("진동", "sw-haptic", s.haptic !== false, () => { s.haptic = s.haptic === false; haptic("place"); return s.haptic; }));
  wrap.appendChild(switchRow("글씨 크게", "sw-big", !!s.big, () => { s.big = !s.big; applySettings(); return s.big; }));
  wrap.appendChild(switchRow("클래식 실수 3번 제한", "sw-limit", s.mistakeLimit, () => (s.mistakeLimit = !s.mistakeLimit)));
  const themeRow = document.createElement("div"); themeRow.className = "setting-row";
  themeRow.innerHTML = `<span>화면</span><div class="seg" id="seg-theme">${[["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]]
    .map(([v, l]) => `<button data-v="${v}" class="${(s.theme || "auto") === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  themeRow.querySelector(".seg").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    s.theme = b.dataset.v; save(data); applySettings();
    themeRow.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  wrap.appendChild(themeRow);
  const info = document.createElement("div"); info.className = "setting-row";
  info.innerHTML = `<span>버전</span><span>${window.NCQ?.NCQ_VERSION || "개발 중"}</span>`;
  wrap.appendChild(info);
  const actions = [];
  if (await NcqAds.ready() && NcqAds.privacyRequired()) actions.push(["개인정보 설정", () => NcqAds.showPrivacyOptions(), "ghost"]);
  actions.push(["진행 초기화", () => dialog("정말 초기화할까요?", "연속 기록, 배지, 친구 기록, 네모로직 기록, 진행 중인 게임이 모두 지워져요.", [
    ["초기화", () => { data = reset(); applySettings(); renderHome(); toast("초기화했어요"); }, "danger"],
    ["취소", null, "ghost"],
  ]), "danger"]);
  actions.push(["닫기", () => renderHome(), "ghost"]);
  dialog("설정", wrap, actions, () => renderHome());
};

// ---------- 토스 뒤로가기 ----------
window.ncqBack = () => {
  if (!$("dialog").classList.contains("hidden")) { closeDialog(); return true; }
  if (!$("result").classList.contains("hidden")) { closeResult(); return true; }
  if (hintShown) { closeHint(); return true; }
  if (nemoBack()) return true;
  if ($("game").classList.contains("active")) { leaveGame(); return true; }
  if ($("records").classList.contains("active")) { renderHome(); show("home"); return true; }
  return false; // 시작 화면·홈은 첫 화면이에요
};

// 날짜가 바뀐 채로 열려 있으면 홈 갱신
setInterval(() => { if ($("home").classList.contains("active")) renderHome(); }, 60000);

// ---------- 시작 화면 ----------
// 날마다 바뀌는 1~9 배치를 하나씩 띄워요 (오늘 문제의 답과는 상관없는 순서라 힌트가 되지 않아요)
function renderSplash() {
  const t = today();
  const r = rng((t * 40503) >>> 0);
  const box = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 8; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [box[i], box[j]] = [box[j], box[i]]; }
  const hl = t % 9;
  $("splash-grid").innerHTML = box.map((v, i) => `<span class="${i === hl ? "hl" : ""}" style="animation-delay:${i * 45}ms">${v}</span>`).join("");
  const dt = keyToDate(t);
  const st = computeStreak(data.daily, t).current;
  const dayText = `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${DAYS[dt.getUTCDay()]}요일`;
  $("splash-today").textContent = !data.tutorialDone ? `${dayText} · 쉬운 첫 판부터 시작해요`
    : data.daily[t] ? `${dayText} · 오늘 문제 완료 ✓`
    : st > 0 ? `${dayText} · 🔥 ${st}일 연속 중` : `${dayText} · 오늘의 문제가 열렸어요`;
  const sv = $("splash-vs");
  if (vs && vs.dateKey === t && !data.daily[t]) { sv.textContent = `🏁 ${vs.name} 님이 ${formatTime(vs.seconds)} 기록으로 도전장을 보냈어요`; sv.classList.remove("hidden"); }
  else sv.classList.add("hidden");
}
function startFromSplash() {
  if (!$("splash").classList.contains("active")) return;
  beep(660, 0.05); // 첫 터치에서 소리를 깨워요
  haptic("place");
  renderHome(); show("home");
}
$("splash").addEventListener("click", startFromSplash);

// ---------- 오늘의 네모로직 ----------
initNemo({
  getData: () => data, save: () => save(data), show, toast, dialog, sfx, today, renderHome,
  isCheat: () => !!window.NCQ_TEST_CHEAT || isDev(),
});

renderSplash();
