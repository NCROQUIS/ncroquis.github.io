// 데일리네모 — 하루 한 판 네모네모 로직
// 손맛은 Nonogram.com 기준: 틀린 칸은 바로 고쳐 주고 실수로 세요(실패 없음), 줄을 다 칠하면 남은 칸에 ✕가 자동으로 들어가요,
// 손가락으로 쭉 그으면 처음 움직인 방향(가로·세로)으로 여러 칸을 한 번에 칠해요. 다 풀면 숨은 그림이 색으로 드러나요.
import { rng, kstDateKey, prevDateKey, nextDateKey, formatTime, computeStreak, streakAtRisk, daysInMonth } from "./daily.js";
import { PICTURES, PALETTE, INTRO_PIC, puzzleOf, dailyNemo, findHint, nemoStars, nemoShareText } from "./nonogram.js";
import { load, save, reset } from "./store.js";
import { NcqAds } from "./ads.js";
import { haptic, setHapticEnabled, hapticSupported } from "./haptic.js";

const $ = (id) => document.getElementById(id);
let data = load();
setHapticEnabled(() => data.settings.haptic !== false);
const today = () => kstDateKey();
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const keyToDate = (k) => new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
const keyLabel = (k) => { const d = keyToDate(k); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const persistData = () => save(data);

// ---------- 친구 기록 링크 (?d=YYYYMMDD&vs=초&n=이름) → 친구 순위에 저장 ----------
const params = new URLSearchParams(location.search);
const vs = (() => {
  const d = Number(params.get("d")), t = Number(params.get("vs"));
  if (!(d > 20200101 && t > 0)) return null;
  return { dateKey: d, seconds: Math.round(t), name: (params.get("n") || "친구").slice(0, 12) };
})();
if (vs) {
  const list = data.friends[vs.dateKey] || (data.friends[vs.dateKey] = []);
  const f = list.find((x) => x.name === vs.name);
  if (!f) list.push({ name: vs.name, seconds: vs.seconds }); else f.seconds = Math.min(f.seconds, vs.seconds);
  persistData();
}

// ---------- 화면 설정 ----------
const hostTheme = document.documentElement.getAttribute("data-theme");
function applySettings() {
  const root = document.documentElement;
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
  place: () => beep(720, 0.04),
  wrong: () => beep(180, 0.18, "square", 0.05),
  unit: () => { beep(880, 0.08); setTimeout(() => beep(1175, 0.1), 70); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.1), i * 110)),
};
document.addEventListener("visibilitychange", () => { if (document.hidden) audio?.suspend?.(); else audio?.resume?.(); });

// ---------- 공용: 화면 전환·알림·다이얼로그 ----------
function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); }
const toastQueue = [];
function toast(msg) { toastQueue.push(msg); if (toastQueue.length === 1) showNextToast(); }
function showNextToast() {
  const t = $("toast"); t.textContent = toastQueue[0]; t.classList.remove("hidden");
  setTimeout(() => { toastQueue.shift(); if (toastQueue.length) showNextToast(); else t.classList.add("hidden"); }, 1900);
}
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

// 그림 미리보기 (작은 칸 격자)
function thumbHTML(pic) {
  const n = pic.rows.length;
  return `<div class="px" style="--n:${n}">${pic.rows.join("").split("").map((c) => `<i style="background:${c === "." ? "transparent" : PALETTE[c]}"></i>`).join("")}</div>`;
}
// 답이 아닌 장식 무늬 (날짜 시드) — 오늘 그림의 힌트가 되지 않아요
function mysteryHTML(seed) {
  const r = rng((seed * 7349) >>> 0);
  return `<div class="px" style="--n:10">${Array.from({ length: 100 }, () => `<i class="${r() < 0.28 ? "on" : ""}"></i>`).join("")}</div><b>?</b>`;
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
  const t = today(), dt = keyToDate(t);
  const rec = data.daily[t];
  const isNew = !data.introDone;
  $("first-card").classList.toggle("hidden", !isNew);
  if (isNew) $("btn-first").textContent = data.introProgress ? "연습 이어서 하기" : "연습 시작하기";
  $("today-date").textContent = `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${DAYS[dt.getUTCDay()]}요일 · 10×10`;
  const thumb = $("today-thumb");
  const btn = $("btn-daily");
  btn.disabled = isNew;
  if (rec) {
    const p = dailyNemo(t).pic;
    thumb.innerHTML = thumbHTML(p); thumb.classList.add("solved");
    $("today-sub").textContent = `${p.emoji} ${p.name} 완성! 내일 새 그림이 열려요`;
    btn.textContent = `완료 ${"⭐".repeat(rec.stars)} · ${formatTime(rec.seconds)} — 결과 보기`; btn.className = "btn done big";
  } else {
    thumb.innerHTML = mysteryHTML(t); thumb.classList.remove("solved");
    $("today-sub").textContent = isNew ? "연습 그림을 풀면 열려요" : data.progress[t] ? `풀던 그림이 있어요 · ${formatTime(data.progress[t].seconds)}` : "어떤 그림이 숨어 있을까요?";
    btn.textContent = isNew ? "연습을 풀면 열려요" : data.progress[t] ? "이어서 풀기" : "시작하기";
    btn.className = isNew ? "btn ghost big" : "btn primary big";
  }
  const vb = $("vs-banner");
  if (vs && vs.dateKey === t) {
    vb.textContent = rec
      ? (rec.seconds < vs.seconds ? `🎉 ${vs.name} 님 기록(${formatTime(vs.seconds)})을 이겼어요!` : `${vs.name} 님 기록 ${formatTime(vs.seconds)} — 아쉽게 졌어요`)
      : `🏁 ${vs.name} 님이 ${formatTime(vs.seconds)}에 풀었어요. 이겨 볼까요?`;
    vb.classList.remove("hidden");
  } else vb.classList.add("hidden");

  const st = computeStreak(data.daily, t);
  $("streak-cur").textContent = st.current;
  $("streak-best").textContent = st.best;
  $("daily-count").textContent = Object.keys(data.daily).length;

  const risk = !isNew && streakAtRisk(data.daily, t);
  $("risk-card").classList.toggle("hidden", !risk);
  if (risk) $("risk-title").textContent = `🔥 ${computeStreak(data.daily, prevDateKey(prevDateKey(t))).current}일 연속이 끊기기 직전이에요`;

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

  const friends = data.friends[t] || [];
  $("ranking").classList.toggle("hidden", friends.length === 0);
  if (friends.length) {
    let pos = 0;
    $("ranking-list").innerHTML = friendRanking(t).map((f) => {
      if (f.seconds != null) pos++;
      return `<li class="${f.me ? "me" : ""}"><span class="pos">${f.seconds != null ? pos : "-"}</span><span class="nm">${esc(f.name)}${f.me ? " (나)" : ""}</span><span class="tm">${f.seconds != null ? formatTime(f.seconds) : "아직 안 풀었어요"}</span></li>`;
    }).join("");
  }

  const yy = dt.getUTCFullYear(), mm = dt.getUTCMonth() + 1;
  const done = monthDone(yy, mm), total = dt.getUTCDate();
  $("month-label").textContent = `${mm}월 ${done}/${daysInMonth(yy, mm)}일`;
  $("month-bar").style.width = `${Math.round((done / daysInMonth(yy, mm)) * 100)}%`;
  void total;
}
function monthDone(y, m) { return Object.keys(data.daily).filter((k) => Math.floor(k / 100) === y * 100 + m).length; }

$("btn-first").onclick = () => startIntro();
$("btn-daily").onclick = () => {
  const t = today();
  if (!data.introDone) return;
  if (data.daily[t]) return showResult(data.daily[t], t, true);
  startDaily(t, "home");
};
$("btn-risk").onclick = () => openPast(prevDateKey(today()), "home");
$("month-strip").onclick = () => openRecords();
$("btn-records").onclick = () => openRecords();

function startDaily(k, origin) {
  const P = dailyNemo(k);
  const saved = data.progress[k];
  startGame(P, saved && saved.cells?.length === P.size * P.size ? saved : newState("daily", k, P.size), origin);
}

// 지난 그림: 보상형 광고로 열어요 (광고가 꺼진 빌드에서는 그냥 열려요)
function openPast(k, origin) {
  if (data.daily[k]) { from = origin; return showResult(data.daily[k], k, true); }
  if (k >= today() || data.unlocked[k] || data.progress[k] || !NcqAds.can("ARCHIVE")) return startDaily(k, origin);
  const isYesterday = k === prevDateKey(today());
  dialog(`${keyLabel(k)} 그림 열기`,
    isYesterday ? "광고를 보면 어제 그림을 풀 수 있어요. 오늘 안에 풀면 연속 기록이 이어져요." : "광고를 보면 이 날 그림을 풀 수 있어요. 연속 기록에는 들어가지 않아요.", [
    ["광고 보고 열기", async () => {
      // NCQ_ADS_ARCHIVE: 지난 그림 열기 보상형 광고
      if (await NcqAds.rewarded("ARCHIVE")) { data.unlocked[k] = true; persistData(); startDaily(k, origin); }
    }, "primary"],
    ["취소", null, "ghost"],
  ]);
}

// ---------- 보관함 ----------
let cal = null;
const EARLIEST = 202611; // 보관함 첫 달 (출시 달)
function openRecords() {
  const d = keyToDate(today());
  cal = cal || { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  renderRecords(); show("records");
}
function renderRecords() {
  const t = today(), { y, m } = cal;
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
    if (r) { cls = r.solvedOn && r.solvedOn > k ? "late" : "done"; sub = dailyNemo(k).pic.emoji; }
    else if (k < t) { cls = "open"; sub = data.unlocked[k] || data.progress[k] ? "열림" : "🔒"; }
    html.push(`<button class="${cls} ${k === t ? "today" : ""}" data-k="${k}">${d}<small>${sub}</small></button>`);
  }
  $("cal").innerHTML = html.join("");
  const done = monthDone(y, m);
  $("cal-foot").innerHTML = done >= n ? `🗓️ <b>${m}월 완주</b>!` : `<b>${done}/${n}일</b> 풀었어요`;
  // 모은 그림: 한 번이라도 푼 그림은 색으로, 아직은 물음표로
  const got = new Set(Object.values(data.daily).map((r) => r.pic));
  $("collect-count").textContent = `${got.size}/${PICTURES.length}`;
  $("collection").innerHTML = PICTURES.map((p) => got.has(p.id)
    ? `<div class="col-item got"><div class="nemo-thumb solved">${thumbHTML(p)}</div><span>${p.emoji} ${p.name}</span></div>`
    : `<div class="col-item"><div class="nemo-thumb"><b>?</b></div><span>아직 몰라요</span></div>`).join("");
}
$("cal").onclick = (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  const k = +b.dataset.k;
  if (k === today() && !data.daily[k]) { if (!data.introDone) return toast("연습 그림부터 풀어 주세요"); return startDaily(k, "records"); }
  if (!data.introDone) return toast("연습 그림부터 풀어 주세요");
  openPast(k, "records");
};
$("cal-prev").onclick = () => { cal.m--; if (cal.m < 1) { cal.m = 12; cal.y--; } renderRecords(); };
$("cal-next").onclick = () => { cal.m++; if (cal.m > 12) { cal.m = 1; cal.y++; } renderRecords(); };
$("btn-records-back").onclick = () => { renderHome(); show("home"); };

// ---------- 게임 ----------
let P = null;      // 지금 문제 (그림·정답·단서)
let G = null;      // 지금 판 상태
let mode = "fill"; // fill | x
let timer = null;
let paused = false;
let stroke = null;
let hintTimer = null;
let from = "home";

function newState(kind, dateKey, n) {
  return { kind, dateKey, cells: new Array(n * n).fill(0), err: [], auto: [], mistakes: 0, seconds: 0,
    rowMistakes: new Array(n).fill(0), rowHinted: new Array(n).fill(0), hints: 0, done: false, coach: kind === "intro" ? 1 : 0 };
}

function startGame(puzzle, state, origin = "home") {
  P = puzzle; G = state; G.done = false; stroke = null; paused = false; from = origin;
  setMode("fill");
  build(); show("nemo"); layout(); render(); renderCoach();
  $("nemo-reveal").classList.add("hidden");
  $("nemo-tools").classList.remove("hidden");
  // NCQ_TEST_CHEAT: 정답 채우기 버튼
  $("nemo-cheat").classList.toggle("hidden", !window.NCQ_TEST_CHEAT && !isDev());
  const vl = $("vs-line");
  const f = G.kind === "daily" ? (data.friends[G.dateKey] || []) : [];
  if (f.length) { const best = f.reduce((a, b) => (a.seconds < b.seconds ? a : b)); vl.textContent = `🏁 ${best.name} 님 기록 ${formatTime(best.seconds)}`; vl.classList.remove("hidden"); }
  else vl.classList.add("hidden");
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  if (G.kind === "daily" && !data.rulesSeen) showRules(true);
}
function isDev() { return !window.NCQ && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.has("cheat"); }

function tick() {
  if (!G || G.done || paused || document.hidden || !$("nemo").classList.contains("active") || !$("dialog").classList.contains("hidden")) return;
  G.seconds++;
  $("nemo-time").textContent = formatTime(G.seconds);
  if (G.seconds % 5 === 0) persist();
}

function persist() {
  if (!G || G.done) return;
  if (G.kind === "intro") data.introProgress = G; else data.progress[G.dateKey] = G;
  persistData();
}

function leaveGame() {
  persist(); clearInterval(timer); closeHintBox();
  G = null; P = null;
  if (from === "records") { renderRecords(); show("records"); } else { renderHome(); show("home"); }
}
$("nemo-back").onclick = () => leaveGame();
$("nemo-help").onclick = () => showRules(false);
$("nemo-seg").onclick = (e) => { const b = e.target.closest("button"); if (b) { setMode(b.dataset.m); haptic("note"); } };
$("nemo-hint").onclick = () => useHint();
$("nemo-cheat").onclick = () => {
  if (!G || G.done) return;
  P.solution.forEach((v, i) => { if (v) G.cells[i] = 1; });
  checkAllLines(); render(); win();
};
document.addEventListener("keydown", (e) => {
  if (!$("nemo").classList.contains("active")) return;
  if (e.key === "x" || e.key === "X") setMode(mode === "x" ? "fill" : "x");
});

function showRules(first) {
  paused = true;
  const body = document.createElement("div");
  body.className = "nemo-rules";
  body.innerHTML = `
    <div class="rule-demo" aria-hidden="true"><span class="rd-clue">3 1</span><i class="f"></i><i class="f"></i><i class="f"></i><i class="x">✕</i><i class="f"></i></div>
    <p><b>줄 옆 숫자</b>는 그 줄에 연속으로 칠할 칸 수예요. <b>3 1</b>이면 3칸을 칠하고, 한 칸 이상 띄운 뒤 1칸을 칠해요.</p>
    <p>확실히 비는 칸은 <b>✕</b>로 표시해 두면 편해요. 틀리면 바로 고쳐 주고 실수로 세요.</p>
    <p>손가락으로 <b>쭉 그으면</b> 여러 칸을 한 번에 칠해요. 다 풀면 오늘의 <b>숨은 그림</b>이 나타나요!</p>`;
  dialog(first ? "오늘의 그림" : "하는 방법", body, [[first ? "시작하기" : "알겠어요", () => { paused = false; }, "primary"]], () => { paused = false; });
  if (first) { data.rulesSeen = true; persistData(); }
}

function setMode(m) {
  mode = m;
  $("nemo-fill").classList.toggle("on", m === "fill");
  $("nemo-x").classList.toggle("on", m === "x");
}

// ---------- 연습 그림 (5x5, 단계별 안내) ----------
const COACH = {
  1: "숫자 <b>5</b>는 그 줄 5칸을 모두 칠한다는 뜻이에요. 반짝이는 줄을 손가락으로 <b>쭉 그어</b> 보세요.",
  2: "잘했어요! 바로 아래 줄도 <b>5</b>예요. 똑같이 쭉 칠해 볼까요?",
  3: "줄을 다 칠하면 남은 칸에 ✕가 저절로 들어가요. 이제 위쪽 세로줄 숫자를 보고 나머지를 풀어 보세요. 막히면 💡 힌트(무료)!",
};
function startIntro() {
  const saved = data.introProgress;
  startGame(puzzleOf(INTRO_PIC), saved && saved.cells?.length === 25 ? saved : newState("intro", 0, 5), "home");
}
function renderCoach() {
  const on = G && G.kind === "intro" && G.coach > 0 && !G.done;
  $("coach").classList.toggle("hidden", !on);
  const b = $("nemo-board");
  b.querySelectorAll(".coach-line").forEach((el) => el.classList.remove("coach-line"));
  if (!on) return;
  $("coach-text").innerHTML = COACH[G.coach];
  const row = G.coach === 1 ? 1 : G.coach === 2 ? 2 : -1;
  if (row >= 0) {
    lineCells("row", row).forEach((i) => b.querySelector(`.nc[data-i="${i}"]`)?.classList.add("coach-line"));
    b.querySelector(`.rc[data-r="${row}"]`)?.classList.add("coach-line");
  }
}
function advanceCoach() {
  if (G.kind !== "intro" || !G.coach) return;
  if (G.coach === 1 && lineDone("row", 1)) G.coach = lineDone("row", 2) ? 3 : 2;
  else if (G.coach === 2 && lineDone("row", 2)) G.coach = 3;
  renderCoach();
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
  b.style.setProperty("--n", n);
  b.dataset.size = n;
  b.dataset.maxRow = Math.max(...rows.map((x) => x.length));
  b.dataset.maxCol = Math.max(...cols.map((x) => x.length));
  $("nemo-mode").textContent = G.kind === "intro" ? "연습 그림 · 5×5" : G.dateKey === today() ? `오늘의 그림 · ${keyLabel(G.dateKey)}` : `${keyLabel(G.dateKey)} 그림`;
}

// 화면 크기에 맞춰 칸 크기와 단서 칸 너비를 정해요
function layout() {
  const b = $("nemo-board"), wrap = b.parentElement;
  const n = +b.dataset.size, maxRow = +b.dataset.maxRow, maxCol = +b.dataset.maxCol;
  const W = wrap.clientWidth, H = Math.max(wrap.clientHeight, 240);
  const maxCs = n <= 5 ? 58 : 46;
  let cs = 30;
  for (let k = 0; k < 3; k++) {
    const fs = Math.max(11, Math.min(18, cs * 0.44));
    const lw = maxRow * fs * 0.95 + 12, th = maxCol * fs * 1.12 + 8;
    cs = Math.floor(Math.min((W - lw) / n, (H - th) / n));
    cs = Math.max(22, Math.min(maxCs, cs));
    b.style.setProperty("--fs", `${fs}px`);
    b.style.setProperty("--lw", `${Math.ceil(lw)}px`);
    b.style.setProperty("--th", `${Math.ceil(th)}px`);
  }
  b.style.setProperty("--cs", `${cs}px`);
}
window.addEventListener("resize", () => { if ($("nemo").classList.contains("active") && P) layout(); });

function render() {
  const b = $("nemo-board");
  const err = new Set(G.err), auto = new Set(G.auto);
  b.querySelectorAll(".nc").forEach((el, i) => {
    const v = G.cells[i];
    el.classList.toggle("f", v === 1);
    el.classList.toggle("x", v === 2);
    el.classList.toggle("err", err.has(i));
    el.classList.toggle("auto", auto.has(i));
  });
  const n = P.size;
  for (let r = 0; r < n; r++) b.querySelector(`.rc[data-r="${r}"]`).classList.toggle("ok", lineDone("row", r));
  for (let c = 0; c < n; c++) b.querySelector(`.cc[data-c="${c}"]`).classList.toggle("ok", lineDone("col", c));
  $("nemo-mistakes").textContent = `실수 ${G.mistakes}`;
  $("nemo-mistakes").classList.toggle("bad", G.mistakes > 0);
  $("nemo-time").textContent = formatTime(G.seconds);
  const hb = $("nemo-hint-badge");
  const h = data.hints;
  hb.textContent = G.kind === "intro" ? "무료" : h > 0 ? h : NcqAds.can("HINT") ? "AD" : "0";
  hb.classList.toggle("ad", G.kind !== "intro" && h <= 0);
}

// ---------- 줄 ----------
const lineCells = (kind, idx) => Array.from({ length: P.size }, (_, t) => (kind === "row" ? idx * P.size + t : t * P.size + idx));
function lineDone(kind, idx) { return lineCells(kind, idx).every((i) => !P.solution[i] || G.cells[i] === 1); }
// 줄을 다 칠하면 남은 칸에 ✕를 자동으로 넣어요
function completeLine(kind, idx) {
  if (!lineDone(kind, idx)) return;
  for (const i of lineCells(kind, idx)) if (G.cells[i] === 0) { G.cells[i] = 2; G.auto.push(i); }
}
function checkAllLines() { for (let t = 0; t < P.size; t++) { completeLine("row", t); completeLine("col", t); } }

// ---------- 칠하기 ----------
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.(".nc");
  return el && $("nemo-board").contains(el) ? +el.dataset.i : -1;
}
const board = $("nemo-board");
board.addEventListener("pointerdown", (e) => {
  if (!G || G.done || paused) return;
  const el = e.target.closest(".nc"); if (!el) return;
  e.preventDefault();
  try { board.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
  const i = +el.dataset.i;
  stroke = { start: i, last: i, axis: null, stopped: false, changed: false };
  closeHintBox();
  haptic("select");
  apply(i);
  highlight(i);
});
board.addEventListener("pointermove", (e) => {
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
  while (cur !== target && !stroke.stopped && G && !G.done) {
    cur = stroke.axis === "row" ? cur + step : cur + step * n;
    apply(cur);
    stroke.last = cur;
  }
  if (G && !G.done) highlight(stroke.last);
});
const endStroke = () => { if (!stroke) return; const s = stroke; stroke = null; if (s.changed) persist(); };
board.addEventListener("pointerup", endStroke);
board.addEventListener("pointercancel", endStroke);

function apply(i) {
  if (!G || G.done || G.cells[i] !== 0) return;
  const n = P.size, r = Math.floor(i / n);
  const want = mode === "fill" ? 1 : 0;
  if (stroke) stroke.changed = true;
  const was = doneLines(i);
  if (P.solution[i] === want) {
    G.cells[i] = want ? 1 : 2;
    if (want) { sfx.place(); haptic("place"); } else haptic("note");
  } else {
    // 틀렸어요: 바로 맞는 상태로 고쳐 주고 실수로 세요. 긋던 손가락은 여기서 멈춰요
    G.cells[i] = P.solution[i] ? 1 : 2;
    G.err.push(i);
    G.mistakes++; G.rowMistakes[r]++;
    sfx.wrong(); haptic("wrong");
    if (stroke) stroke.stopped = true;
    const el = board.querySelector(`.nc[data-i="${i}"]`);
    el?.classList.add("shake"); setTimeout(() => el?.classList.remove("shake"), 400);
  }
  afterChange(i, was);
}

function doneLines(i) { const n = P.size; return { row: lineDone("row", Math.floor(i / n)), col: lineDone("col", i % n) }; }

function afterChange(i, was) {
  const n = P.size, r = Math.floor(i / n), c = i % n;
  const now = doneLines(i);
  const before = new Set(G.auto);
  if (now.row || now.col) checkAllLines(); // 끝난 줄의 남은 칸에 ✕ (그 ✕로 빈 줄이 함께 끝나기도 해요)
  render();
  G.auto.filter((x) => !before.has(x)).forEach((x) => board.querySelector(`.nc[data-i="${x}"]`)?.classList.add("pop"));
  const newRow = now.row && !was.row, newCol = now.col && !was.col;
  if (newRow || newCol) {
    sfx.unit(); haptic("unit");
    if (newRow) flashLine("row", r);
    if (newCol) flashLine("col", c);
  }
  advanceCoach();
  if (P.solution.every((v, x) => !v || G.cells[x] === 1)) win();
}

function flashLine(kind, idx) {
  const els = lineCells(kind, idx).map((i) => board.querySelector(`.nc[data-i="${i}"]`));
  els.forEach((el, t) => { el.style.animationDelay = `${t * 25}ms`; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
  setTimeout(() => els.forEach((el) => { el.classList.remove("flash"); el.style.animationDelay = ""; }), 700);
}

// 손가락이 있는 칸의 가로·세로 줄과 단서를 옅게 표시해요
function highlight(i) {
  const n = P.size, r = Math.floor(i / n), c = i % n;
  board.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
  board.querySelector(`.rc[data-r="${r}"]`)?.classList.add("hl");
  board.querySelector(`.cc[data-c="${c}"]`)?.classList.add("hl");
  board.querySelectorAll(".nc").forEach((el) => { const x = +el.dataset.i; if (Math.floor(x / n) === r || x % n === c) el.classList.add("hl"); });
}

// ---------- 힌트: 줄 하나만 보고 확실해지는 칸을 이유와 함께 알려 줘요 ----------
async function useHint() {
  if (!G || G.done) return;
  const free = G.kind === "intro";
  if (!free && data.hints <= 0) {
    if (!NcqAds.can("HINT")) return toast("힌트를 다 썼어요");
    paused = true;
    // NCQ_ADS_HINT: 힌트 충전 보상형 광고
    const ok = await NcqAds.rewarded("HINT");
    paused = false;
    if (!ok) return;
    data.hints += 1;
  }
  const known = G.cells.map((v) => (v === 1 ? 1 : v === 2 ? 0 : -1));
  let h = findHint(P.clues, known, P.size);
  if (!h) { const i = known.findIndex((v) => v === -1); if (i < 0) return; const rr = Math.floor(i / P.size); h = { cell: i, value: P.solution[i], kind: "row", index: rr, clue: P.clues.rows[rr] }; }
  if (!free) { data.hints--; persistData(); }
  const r = Math.floor(h.cell / P.size);
  const was = doneLines(h.cell);
  G.cells[h.cell] = h.value ? 1 : 2;
  G.rowHinted[r]++; G.hints++;
  haptic("hint");
  const where = h.kind === "row" ? `위에서 ${h.index + 1}번째 가로줄` : `왼쪽에서 ${h.index + 1}번째 세로줄`;
  $("nemo-hint-text").innerHTML = `${where}의 단서 <b>${h.clue.join(" ")}</b>를 보면, 반짝이는 칸은 꼭 <b>${h.value ? "칠해야" : "비워야(✕)"}</b> 해요.`;
  $("nemo-hint-box").classList.remove("hidden");
  board.querySelectorAll(".hint-line,.hint-cell").forEach((el) => el.classList.remove("hint-line", "hint-cell"));
  lineCells(h.kind, h.index).forEach((i) => board.querySelector(`.nc[data-i="${i}"]`)?.classList.add("hint-line"));
  board.querySelector(h.kind === "row" ? `.rc[data-r="${h.index}"]` : `.cc[data-c="${h.index}"]`)?.classList.add("hint-line");
  board.querySelector(`.nc[data-i="${h.cell}"]`)?.classList.add("hint-cell");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(closeHintBox, 6000);
  afterChange(h.cell, was);
  persist();
}
function closeHintBox() {
  clearTimeout(hintTimer);
  $("nemo-hint-box").classList.add("hidden");
  board.querySelectorAll(".hint-line,.hint-cell").forEach((el) => el.classList.remove("hint-line", "hint-cell"));
}

// ---------- 다 풀었을 때 ----------
function win() {
  if (G.done) return;
  G.done = true; clearInterval(timer); stroke = null; closeHintBox();
  const rec = { seconds: G.seconds, mistakes: G.mistakes, stars: nemoStars(G.mistakes), rowMistakes: G.rowMistakes.slice(),
    rowHinted: G.rowHinted.slice(), hints: G.hints, pic: P.pic.id, solvedOn: today() };
  if (G.kind === "intro") { data.introDone = true; data.introProgress = null; }
  else { data.daily[G.dateKey] = rec; delete data.progress[G.dateKey]; }
  persistData();
  renderCoach();
  // 숨은 그림이 대각선으로 물들며 나타나요
  const n = P.size, colors = P.pic.rows.join("").split("");
  board.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
  board.querySelectorAll(".nc").forEach((el) => {
    const i = +el.dataset.i, ch = colors[i];
    el.style.setProperty("--pc", ch === "." ? "transparent" : PALETTE[ch]);
    el.style.transitionDelay = `${(Math.floor(i / n) + (i % n)) * 35}ms`;
  });
  board.classList.add("reveal");
  $("nemo-tools").classList.add("hidden");
  const rv = $("nemo-reveal");
  rv.innerHTML = G.kind === "intro" ? `<span>${P.pic.emoji}</span> 연습 그림은 <b>${P.pic.name}</b>!` : `<span>${P.pic.emoji}</span> 오늘의 그림은 <b>${P.pic.name}</b>!`;
  rv.classList.remove("hidden");
  sfx.win(); haptic("win");
  const kind = G.kind, k = G.dateKey;
  setTimeout(() => { if ($("nemo").classList.contains("active")) showResult(rec, k, false, kind); }, 1700);
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

function rankText(dateKey) {
  const fr = data.friends[dateKey] || [];
  if (!fr.length || !data.daily[dateKey]) return "";
  const list = friendRanking(dateKey).filter((f) => f.seconds != null);
  return `친구 ${list.length}명 중 ${list.findIndex((f) => f.me) + 1}위`;
}
function shareLink(dateKey, seconds) {
  const platform = window.NCQ?.NCQ_PLATFORM;
  if (platform === "toss" || platform === "android") return ""; // 앱 안에서는 외부 링크를 넣지 않아요
  if (!/github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname)) return ""; // 채팅 미리보기 등
  const n = data.settings.name ? `&n=${encodeURIComponent(data.settings.name)}` : "";
  return `${location.origin}${location.pathname}?d=${dateKey}&vs=${seconds}${n}`;
}

function showResult(rec, k, fromHome, kind = "daily") {
  const intro = kind === "intro";
  const pic = intro ? INTRO_PIC : dailyNemo(k).pic;
  const streak = computeStreak(data.daily, today()).current;
  $("nr-stars").innerHTML = [1, 2, 3].map((x) => `<span class="${x <= rec.stars ? "" : "off"}">⭐</span>`).join("");
  $("nr-title").textContent = intro ? "연습 완료! 오늘의 그림이 열렸어요" : `${pic.emoji} ${pic.name} 완성!`;
  drawArt($("nr-art"), pic);
  $("nr-time").textContent = formatTime(rec.seconds);
  $("nr-mistakes").textContent = rec.mistakes;
  $("nr-streak").textContent = intro ? "-" : `${streak}일`;
  const rk = intro ? "" : rankText(k);
  $("nr-rank").textContent = rk; $("nr-rank").classList.toggle("hidden", !rk);
  const text = intro ? "" : nemoShareText({ dateKey: k, seconds: rec.seconds, mistakes: rec.mistakes, stars: rec.stars, rowMistakes: rec.rowMistakes, rowHinted: rec.rowHinted, streak });
  $("nr-preview").textContent = text;
  $("nr-preview").classList.toggle("hidden", intro);
  $("nr-share").classList.toggle("hidden", intro);
  $("nr-share").onclick = () => share(text, k, rec.seconds);
  const close = $("nr-close");
  close.textContent = intro ? "오늘의 그림 풀기" : fromHome ? "닫기" : "홈으로";
  close.className = intro ? "btn primary" : "btn ghost";
  close.onclick = () => { closeResult(); if (intro) startDaily(today(), "home"); };
  $("result").classList.remove("hidden");
}
function closeResult() {
  $("result").classList.add("hidden");
  if ($("nemo").classList.contains("active")) leaveGame();
  else if ($("records").classList.contains("active")) renderRecords();
  else renderHome();
}
$("result").addEventListener("click", (e) => { if (e.target.id === "result") closeResult(); });

async function share(text, dateKey, seconds) {
  const link = shareLink(dateKey, seconds);
  const full = link ? `${text}\n${link}` : text;
  try { if (navigator.share) { await navigator.share({ text: full }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(full); toast("결과를 복사했어요. 대화방에 붙여 넣어 보세요"); return; } catch { /* 아래로 */ }
  toast("공유할 수 없는 환경이에요. 미리보기 글을 길게 눌러 복사해 주세요");
}

// ---------- 설정 ----------
function switchRow(label, id, on, onToggle) {
  const row = document.createElement("div"); row.className = "setting-row";
  row.innerHTML = `<span>${label}</span><button class="switch ${on ? "on" : ""}" id="${id}" aria-label="${label}" aria-pressed="${on}"></button>`;
  row.querySelector("button").onclick = (e) => { const v = onToggle(); e.currentTarget.classList.toggle("on", v); e.currentTarget.setAttribute("aria-pressed", v); persistData(); };
  return row;
}
$("btn-settings").onclick = async () => {
  const s = data.settings;
  const wrap = document.createElement("div");
  const nameRow = document.createElement("div"); nameRow.className = "setting-row";
  nameRow.innerHTML = `<span>닉네임 <small style="color:var(--sub)">친구 순위에 보여요</small></span><input class="name-input" id="set-name" maxlength="12" placeholder="나" />`;
  const inp = nameRow.querySelector("input"); inp.value = s.name || "";
  inp.oninput = () => { s.name = inp.value.trim().slice(0, 12); persistData(); };
  wrap.appendChild(nameRow);
  wrap.appendChild(switchRow("소리", "sw-sound", s.sound, () => (s.sound = !s.sound)));
  if (hapticSupported()) wrap.appendChild(switchRow("진동", "sw-haptic", s.haptic !== false, () => { s.haptic = s.haptic === false; haptic("place"); return s.haptic; }));
  const themeRow = document.createElement("div"); themeRow.className = "setting-row";
  themeRow.innerHTML = `<span>화면</span><div class="seg" id="seg-theme">${[["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]]
    .map(([v, l]) => `<button data-v="${v}" class="${(s.theme || "auto") === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  themeRow.querySelector(".seg").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    s.theme = b.dataset.v; persistData(); applySettings();
    themeRow.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  wrap.appendChild(themeRow);
  const info = document.createElement("div"); info.className = "setting-row";
  info.innerHTML = `<span>버전</span><span>${window.NCQ?.NCQ_VERSION || "개발 중"}</span>`;
  wrap.appendChild(info);
  const actions = [];
  if (await NcqAds.ready() && NcqAds.privacyRequired()) actions.push(["개인정보 설정", () => NcqAds.showPrivacyOptions(), "ghost"]);
  actions.push(["진행 초기화", () => dialog("정말 초기화할까요?", "연속 기록, 모은 그림, 친구 기록, 풀던 그림이 모두 지워져요.", [
    ["초기화", () => { data = reset(); applySettings(); renderHome(); toast("초기화했어요"); }, "danger"],
    ["취소", null, "ghost"],
  ]), "danger"]);
  actions.push(["닫기", () => renderHome(), "ghost"]);
  dialog("설정", wrap, actions, () => renderHome());
};

// ---------- 토스 뒤로가기: 처리했으면 true, 첫 화면이면 false ----------
window.ncqBack = () => {
  if (!$("dialog").classList.contains("hidden")) { closeDialog(); return true; }
  if (!$("result").classList.contains("hidden")) { closeResult(); return true; }
  if (!$("nemo-hint-box").classList.contains("hidden")) { closeHintBox(); return true; }
  if ($("nemo").classList.contains("active")) { leaveGame(); return true; }
  if ($("records").classList.contains("active")) { renderHome(); show("home"); return true; }
  return false; // 시작 화면·홈은 첫 화면이에요
};

// 날짜가 바뀐 채로 열려 있으면 홈 갱신
setInterval(() => { if ($("home").classList.contains("active")) renderHome(); }, 60000);

// ---------- 시작 화면 ----------
// 날마다 바뀌는 장식 무늬 (오늘 그림과는 상관없어요)
function renderSplash() {
  const t = today();
  const r = rng((t * 40503) >>> 0);
  $("splash-pixels").innerHTML = Array.from({ length: 25 }, (_, i) => `<i class="${r() < 0.5 ? "on" : ""}" style="animation-delay:${(Math.floor(i / 5) + (i % 5)) * 45}ms"></i>`).join("");
  const dt = keyToDate(t);
  const st = computeStreak(data.daily, t).current;
  const dayText = `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${DAYS[dt.getUTCDay()]}요일`;
  $("splash-today").textContent = !data.introDone ? `${dayText} · 연습 그림부터 시작해요`
    : data.daily[t] ? `${dayText} · 오늘 그림 완성 ✓`
    : st > 0 ? `${dayText} · 🔥 ${st}일 연속 중` : `${dayText} · 오늘의 그림이 열렸어요`;
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
renderSplash();
