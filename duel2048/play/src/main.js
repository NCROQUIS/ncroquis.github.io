import {
  SIZE, newGame, move, cloneGame, maxTile, spawn, canMove,
  encodeDuel, decodeDuel, weekKey, weeklySeed, nextRandom, hashSeed,
} from "./game.js";
import { NcqAds } from "./ads.js";

// ── 저장 ──────────────────────────────────
const KEY = "duel2048:v1";
const defaults = () => ({
  best: 0,
  name: "",
  sound: true,
  weekly: { key: "", best: 0, tile: 0, plays: 0 },
  received: [], // 이번 주에 받은 도전장 상대들 [{name, score, best, week}]
  saved: null,  // 진행 중인 판
});
let store = load();
function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* 저장 불가 환경 */ }
}

// ── 상태 ──────────────────────────────────
const DEV = !window.NCQ && !window.Capacitor;
let mode = "weekly";     // weekly | duel | practice
let opp = null;          // 대결 상대 { seed, score, best, name }
let game = null;
let snapshot = null;     // 되돌리기용 직전 상태
let undoUsed = false;
let endShown = false;
let wonShown = false;

// ── DOM ───────────────────────────────────
const $ = (id) => document.getElementById(id);
const tilesEl = $("tiles");
const gridEl = $("grid");
for (let i = 0; i < SIZE * SIZE; i++) gridEl.appendChild(document.createElement("i"));
const els = new Map(); // tile id → element

function tileClass(v) { return v > 2048 ? "vbig" : "v" + v; }
function makeTile(t, idx, extra) {
  const el = document.createElement("div");
  el.className = `tile ${tileClass(t.v)} ${extra || ""}`;
  el.style.setProperty("--r", Math.floor(idx / SIZE));
  el.style.setProperty("--c", idx % SIZE);
  el.innerHTML = `<div class="in">${t.v}</div>`;
  tilesEl.appendChild(el);
  els.set(t.id, el);
  return el;
}
function placeTile(el, idx) {
  el.style.setProperty("--r", Math.floor(idx / SIZE));
  el.style.setProperty("--c", idx % SIZE);
}

// 판 전체를 다시 그림 (시작, 되돌리기, 불러오기)
function renderAll() {
  tilesEl.innerHTML = "";
  els.clear();
  game.cells.forEach((t, i) => { if (t) makeTile(t, i, ""); });
  renderHud();
}

// 한 번 움직인 결과를 애니메이션으로 그림
function renderMove(res) {
  // 1) 미끄러지기
  for (const s of res.slides) {
    const el = els.get(s.id);
    if (el) { el.classList.remove("new", "merged"); placeTile(el, s.to); }
  }
  // 2) 합쳐진 원래 타일은 미끄러진 뒤 지우고, 새 타일을 팝
  for (const m of res.merges) {
    for (const id of m.from) {
      const el = els.get(id);
      els.delete(id);
      if (el) setTimeout(() => el.remove(), 100);
    }
    makeTile(m.tile, m.to, "merged");
  }
  // 3) 새로 생긴 타일
  if (res.spawned) makeTile(res.spawned.tile, res.spawned.idx, "new");
  if (res.gained) floatGain(res.gained);
  renderHud();
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

const fmt = (n) => n.toLocaleString("ko-KR");

function renderHud() {
  $("score").textContent = fmt(game.score);
  $("best").textContent = fmt(Math.max(store.best, game.score));
  $("modeChip").textContent =
    mode === "duel" ? `${opp.name}와 대결` : mode === "weekly" ? `주간 도전 · ${weekKey().slice(5)}` : "연습";

  const bar = $("duelBar");
  bar.hidden = mode !== "duel";
  if (mode === "duel") {
    const gap = opp.score - game.score;
    $("duelLabel").textContent = `${opp.name} ${fmt(opp.score)}점`;
    $("duelGap").textContent = gap > 0 ? `${fmt(gap)}점 남음` : `추월! +${fmt(-gap)}`;
    bar.classList.toggle("ahead", gap <= 0);
    $("duelFill").style.width = Math.min(100, (game.score / Math.max(1, opp.score)) * 100) + "%";
  }

  const undo = $("undoBtn");
  // NCQ_ADS_UNDO: 되돌리기 보상형 광고
  const adOk = NcqAds.can("UNDO");
  undo.hidden = !adOk;
  undo.disabled = !snapshot || undoUsed || game.over;
}

// ── 판 시작 ───────────────────────────────
function start(newMode, seed, opponent) {
  mode = newMode;
  opp = opponent || null;
  game = newGame(seed);
  snapshot = null;
  undoUsed = false;
  endShown = false;
  wonShown = false;
  persist();
  renderAll();
}

function persist() {
  store.saved = { mode, opp, game, undoUsed, wonShown };
  save();
}

function resume() {
  const s = store.saved;
  if (!s || !s.game || !s.game.cells) return false;
  mode = s.mode; opp = s.opp; game = s.game; undoUsed = !!s.undoUsed; wonShown = !!s.wonShown;
  snapshot = null; endShown = false;
  // 주간 도전인데 주가 바뀌었으면 새 주로
  if (mode === "weekly" && game.seed !== weeklySeed()) return false;
  renderAll();
  if (game.over) setTimeout(showResult, 300);
  return true;
}

function randomSeed() {
  const a = new Uint32Array(1);
  (crypto.getRandomValues ? crypto.getRandomValues(a) : (a[0] = (Math.random() * 2 ** 32) >>> 0));
  return a[0] >>> 0;
}

// ── 조작 ──────────────────────────────────
function doMove(dir) {
  if (!game || game.over || !$("sheet").hidden) return;
  const before = cloneGame(game);
  const res = move(game, dir);
  if (!res.moved) { sfx.bump(); return; }
  snapshot = before;
  renderMove(res);
  if (res.merges.length) sfx.merge(Math.max(...res.merges.map((m) => m.tile.v)));
  else sfx.slide();
  if (game.score > store.best) store.best = game.score;
  if (game.won && !wonShown) { wonShown = true; setTimeout(() => toast("2048 달성! 계속 가서 점수를 더 올려요"), 250); }
  persist();
  if (game.over) { sfx.over(); setTimeout(showResult, 700); }
}

// 스와이프
let t0 = null;
window.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  sfx.unlock();
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (!t0) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
  t0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
document.addEventListener("touchmove", (e) => { if (!e.target.closest(".sheet-card")) e.preventDefault(); }, { passive: false });
// 마우스 드래그 (PC 테스트)
let m0 = null;
window.addEventListener("mousedown", (e) => { if (!e.target.closest("button,.sheet")) { m0 = { x: e.clientX, y: e.clientY }; sfx.unlock(); } });
window.addEventListener("mouseup", (e) => {
  if (!m0) return;
  const dx = e.clientX - m0.x, dy = e.clientY - m0.y; m0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const d = KEYS[e.key]; if (d) { e.preventDefault(); sfx.unlock(); doMove(d); }
});

// ── 버튼 ──────────────────────────────────
$("undoBtn").onclick = async () => {
  if (!snapshot || undoUsed) return;
  if (await NcqAds.rewarded("UNDO")) {
    game = snapshot; snapshot = null; undoUsed = true;
    persist(); renderAll(); toast("한 수 되돌렸어요 (판마다 1번)");
  }
};
$("newBtn").onclick = showModes;
$("modeChip").onclick = showModes;
$("rankBtn").onclick = showRanking;
$("setBtn").onclick = showSettings;

// ── 시트 ──────────────────────────────────
function openSheet(html, bind) {
  $("sheetCard").innerHTML = html;
  $("sheet").hidden = false;
  bind?.($("sheetCard"));
}
function closeSheet() { $("sheet").hidden = true; }
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" && !game.over) closeSheet(); });

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const myName = () => store.name || "나";

function showModes() {
  const wk = store.weekly.key === weekKey() ? store.weekly : { best: 0 };
  openSheet(`
    <h2>새 게임</h2>
    <p class="sub">같은 판(블록 순서)이면 누구든 공정하게 겨룰 수 있어요.</p>
    <button class="mode-item" data-m="weekly"><span class="emo">📅</span><div><b>주간 도전</b><span>이번 주 모두 같은 판 · 내 최고 ${fmt(wk.best || 0)}점</span></div></button>
    ${opp ? `<button class="mode-item" data-m="duel"><span class="emo">⚔️</span><div><b>${esc(opp.name)}와 다시 대결</b><span>상대 ${fmt(opp.score)}점 · 같은 판으로</span></div></button>` : ""}
    <button class="mode-item" data-m="practice"><span class="emo">🎲</span><div><b>연습</b><span>새로운 무작위 판 · 끝나면 친구에게 도전장</span></div></button>
    <button class="btn ghost" data-close>닫기</button>
  `, (card) => {
    card.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => {
      const m = b.dataset.m;
      closeSheet();
      if (m === "weekly") start("weekly", weeklySeed());
      else if (m === "duel") start("duel", opp.seed, opp);
      else start("practice", randomSeed());
    });
    card.querySelector("[data-close]").onclick = closeSheet;
  });
}

function recordEnd() {
  if (mode === "weekly") {
    const k = weekKey();
    if (store.weekly.key !== k) store.weekly = { key: k, best: 0, tile: 0, plays: 0 };
    store.weekly.plays += 1;
    if (game.score > store.weekly.best) { store.weekly.best = game.score; store.weekly.tile = maxTile(game); }
  }
  save();
}

function showResult() {
  if (endShown) return;
  endShown = true;
  recordEnd();
  const me = { name: myName(), score: game.score, best: maxTile(game) };
  const retryOk = NcqAds.can("RETRY");

  let body;
  if (mode === "duel") {
    const win = me.score > opp.score, draw = me.score === opp.score;
    body = `
      <div class="result-badge">${win ? "🏆" : draw ? "🤝" : "😤"}</div>
      <h2 style="text-align:center">${win ? "이겼어요!" : draw ? "비겼어요" : "아쉽게 졌어요"}</h2>
      <p class="sub" style="text-align:center">${win ? `${esc(opp.name)}에게 결과를 보내 약 올려 볼까요?` : `${fmt(opp.score - me.score)}점 차이예요. 같은 판으로 다시 해 봐요`}</p>
      <div class="vs">
        <div class="side ${win ? "win" : ""}"><div class="who">${esc(me.name)}</div><div class="pts">${fmt(me.score)}</div><div class="tilemax">최고 타일 ${me.best}</div></div>
        <div class="mid">VS</div>
        <div class="side ${!win && !draw ? "win" : ""}"><div class="who">${esc(opp.name)}</div><div class="pts">${fmt(opp.score)}</div><div class="tilemax">최고 타일 ${opp.best}</div></div>
      </div>
      <button class="btn primary" data-share>${win ? "결과 보내기" : "다시 도전장 보내기"}</button>
      ${retryOk ? `<button class="btn" data-retry>같은 판 다시 <small>광고 보고</small></button>` : ""}
      <button class="btn ghost" data-new>다른 게임</button>`;
  } else {
    const wk = mode === "weekly" ? store.weekly : null;
    body = `
      <h2 style="text-align:center">게임 끝!</h2>
      <p class="sub" style="text-align:center">${mode === "weekly" ? `이번 주 도전 ${wk.plays}번째 · 내 주간 최고 ${fmt(wk.best)}점` : "이 판 그대로 친구에게 보내 겨뤄 봐요"}</p>
      <div class="solo-score">${fmt(me.score)}</div>
      <p class="sub" style="text-align:center">최고 타일 ${me.best} · ${game.moves}수</p>
      <button class="btn primary" data-share>친구에게 도전장 보내기</button>
      ${mode === "weekly" ? `<button class="btn" data-again>주간 도전 다시</button>` : ""}
      <button class="btn ghost" data-new>다른 게임</button>
      <p class="note">도전장을 받은 친구는 같은 블록 순서로 한 판을 두고, 내 점수와 비교해요.</p>`;
  }
  openSheet(body, (card) => {
    card.querySelector("[data-share]").onclick = () => shareDuel(me);
    card.querySelector("[data-new]").onclick = () => { closeSheet(); showModes(); };
    const again = card.querySelector("[data-again]");
    if (again) again.onclick = () => { closeSheet(); start("weekly", weeklySeed()); };
    const retry = card.querySelector("[data-retry]");
    // NCQ_ADS_RETRY: 대결 같은 판 재도전 보상형 광고
    if (retry) retry.onclick = async () => {
      if (await NcqAds.rewarded("RETRY")) { closeSheet(); start("duel", opp.seed, opp); }
    };
  });
}

async function shareDuel(me) {
  const code = encodeDuel({ seed: game.seed, score: me.score, best: me.best, name: me.name });
  const url = `${location.origin}${location.pathname}?d=${code}`;
  const text = `2048 대결! 나는 ${fmt(me.score)}점 (최고 ${me.best}). 같은 블록 순서로 나를 이겨 봐`;
  try {
    if (window.NcqShare) { await window.NcqShare({ text, url }); return; } // 토스 연결층 자리 (아직 없음)
    if (navigator.share) { await navigator.share({ title: "2048 대결", text, url }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast("도전장 링크를 복사했어요. 친구에게 붙여 넣어 보내 주세요"); }
  catch { prompt("이 링크를 복사해 보내 주세요", url); }
}

// 주간 랭킹 (목업): 가짜 친구 + 이번 주 받은 도전장 상대 + 나
function showRanking() {
  const k = weekKey();
  const rng = { s: hashSeed("friends:" + k) };
  const names = ["민수", "지영", "현우", "수아", "도윤", "하은"];
  const rows = names.map((n) => ({ name: n, score: Math.round((2000 + nextRandom(rng) ** 1.6 * 34000) / 4) * 4, tag: "목업" }));
  for (const r of store.received.filter((x) => x.week === k)) rows.push({ name: r.name, score: r.score, tag: "도전장" });
  // 진행 중인 주간 판 점수도 반영
  const live = mode === "weekly" && game ? game.score : 0;
  const mine = Math.max(store.weekly.key === k ? store.weekly.best : 0, live);
  rows.push({ name: myName(), score: mine, me: true });
  rows.sort((a, b) => b.score - a.score);
  openSheet(`
    <h2>주간 랭킹 <span style="font-size:14px;color:#a39689">${k}</span></h2>
    <p class="sub">이번 주 모두 같은 판이에요. 월요일에 새 판으로 바뀌어요.</p>
    <ol class="rank-list">
      ${rows.map((r, i) => `<li class="${r.me ? "me" : ""}"><span class="no">${i + 1}</span><span class="nm">${esc(r.name)}${r.tag ? `<small>${r.tag}</small>` : r.me && store.name ? "<small>나</small>" : ""}</span><span class="sc">${fmt(r.score)}</span></li>`).join("")}
    </ol>
    <button class="btn primary" data-play>주간 도전 하기</button>
    <button class="btn ghost" data-close>닫기</button>
    <p class="note">프로토타입: 친구 점수는 임시 데이터예요. 토스 친구 연동·랭킹 서버는 재미 검증 뒤에 붙여요.</p>
  `, (card) => {
    // 이미 주간 판을 하고 있으면 이어서, 아니면 새로 시작
    card.querySelector("[data-play]").onclick = () => { closeSheet(); if (!(mode === "weekly" && !game.over)) start("weekly", weeklySeed()); };
    card.querySelector("[data-close]").onclick = closeSheet;
  });
}

function showSettings() {
  openSheet(`
    <h2>설정</h2>
    <div class="row"><span>내 이름 (도전장에 표시)</span><input id="nameIn" type="text" maxlength="10" placeholder="나" value="${esc(store.name)}" /></div>
    <div class="row"><span>소리</span><button id="sndSw" class="switch ${store.sound ? "on" : ""}" aria-label="소리"></button></div>
    <button class="btn danger" data-reset>진행 초기화</button>
    <button class="btn ghost" data-close>닫기</button>
    <p class="note">초기화하면 최고 점수, 주간 기록, 받은 도전장, 진행 중인 판이 모두 지워져요.</p>
  `, (card) => {
    const nameIn = card.querySelector("#nameIn");
    nameIn.oninput = () => { store.name = nameIn.value.trim().slice(0, 10); save(); };
    card.querySelector("#sndSw").onclick = (e) => { store.sound = !store.sound; e.currentTarget.classList.toggle("on", store.sound); save(); };
    card.querySelector("[data-reset]").onclick = () => {
      if (!confirm("모든 진행을 초기화할까요?")) return;
      try { localStorage.removeItem(KEY); } catch { /* */ }
      store = defaults();
      closeSheet();
      start("weekly", weeklySeed());
      toast("초기화했어요");
    };
    card.querySelector("[data-close]").onclick = closeSheet;
  });
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

// ── 소리 (첫 터치 뒤에 켬) ─────────────────
const sfx = (() => {
  let ctx = null;
  const tone = (freq, dur, type = "sine", vol = 0.06) => {
    if (!ctx || !store.sound || document.hidden) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  };
  return {
    unlock() {
      if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    },
    slide: () => tone(220, 0.05, "triangle", 0.03),
    merge: (v) => tone(260 * Math.pow(2, Math.log2(v) / 6), 0.12, "sine", 0.07),
    bump: () => tone(110, 0.04, "square", 0.015),
    over: () => { tone(330, 0.18); setTimeout(() => tone(220, 0.3), 160); },
    suspend: () => ctx?.suspend(),
    resume: () => ctx?.resume(),
  };
})();
document.addEventListener("visibilitychange", () => (document.hidden ? sfx.suspend() : sfx.resume()));

// NCQ_TEST_CHEAT: 치트 메뉴
// (개발 중엔 항상, 출시 빌드는 테스트 기능 켰을 때만)
if (window.NCQ_TEST_CHEAT || DEV) {
  const p = $("testPanel");
  p.hidden = false;
  const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; p.appendChild(b); };
  add("1024×2", () => {
    const empty = game.cells.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0).slice(0, 2);
    for (const i of empty) game.cells[i] = { id: game.nextId++, v: 1024 };
    persist(); renderAll();
  });
  add("+5000점", () => { game.score += 5000; if (game.score > store.best) store.best = game.score; persist(); renderHud(); });
  add("게임오버", () => {
    game.cells = game.cells.map((_, i) => ({ id: game.nextId++, v: (i % 4 + Math.floor(i / 4)) % 2 ? 4 : 2 }));
    game.over = !canMove(game); persist(); renderAll(); setTimeout(showResult, 300);
  });
  add("도전장 받기", () => {
    location.href = `${location.pathname}?d=${encodeDuel({ seed: randomSeed(), score: 8000 + Math.floor(Math.random() * 8000), best: 1024, name: "민수" })}`;
  });
}

// ── 시작 ──────────────────────────────────
(function boot() {
  const params = new URLSearchParams(location.search);
  const d = decodeDuel(params.get("d"));
  if (d) {
    // 링크로 들어오면 대결 시작. 새로고침해도 다시 시작하지 않게 주소에서 지움
    history.replaceState(null, "", location.pathname);
    const k = weekKey();
    if (!store.received.some((r) => r.week === k && r.name === d.name && r.score === d.score)) {
      store.received.push({ name: d.name, score: d.score, best: d.best, week: k });
      store.received = store.received.slice(-30);
    }
    start("duel", d.seed, d);
    setTimeout(() => toast(`${d.name}의 도전장! ${fmt(d.score)}점을 넘어 봐요`), 300);
    return;
  }
  if (!resume()) start("weekly", weeklySeed());
})();

// 테스트에서 상태를 볼 수 있게
window.__duel = { get game() { return game; }, get mode() { return mode; }, doMove, spawn };
