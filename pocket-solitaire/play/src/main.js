// 포켓 솔리테어 — 화면과 조작
import {
  SUITS, RANKS, isRed, newGame, draw, applyMove, bestMoveFrom, findHint, isWon,
  canAutoComplete, autoCompleteStep, getMovingCards, isLegalMove, dailySeed,
} from './engine.js';
import { load, save } from './storage.js';
import { Ads, adSlotOn } from './ads.js';
import { EASY_SEEDS, NORMAL_SEEDS } from './easy-seeds.js';
import { isStuck, findSolvableSeed } from './solver.js';
import { Sound } from './sound.js';
import { installSuitSymbols, faceSVG, simpleFace, SUIT_NAMES } from './cardart.js';
import { Analytics } from './analytics.js';
import { testOn, isNative, onBackButton, exitApp, openExternal } from './platform.js';
import { APP_VERSION, FEEDBACK_URL, HINTS } from './config.js';
import { Purchases, iapOn } from './iap.js';

const $ = (s) => document.querySelector(s);
const board = $('#board');
const store = load();

// ---------- 게임 상태 ----------
let state = null;
let history = [];
let mode = 'classic'; // classic | daily
let dailyDate = null;
let elapsed = 0; // 초
let timerOn = false;
let finished = false;
let autoRunning = false;
let hintTimer = null;

// 테이블 색 (클래식 그린이 기본, 나머지는 옵션)
const TABLES = [
  { id: 'classic', name: '클래식', top: '#2f8a5b', bottom: '#14543a' },
  { id: 'night', name: '나이트', top: '#24332e', bottom: '#0e1412' },
  { id: 'blue', name: '블루', top: '#2b62a8', bottom: '#12305c' },
  { id: 'wine', name: '와인', top: '#8e2f45', bottom: '#4a1324' },
  { id: 'graphite', name: '차콜', top: '#4a4d52', bottom: '#1f2124' },
  { id: 'sage', name: '라이트', top: '#f3f6f4', bottom: '#dfe7e2' },
];
function applyTable(id) {
  const t = TABLES.find((x) => x.id === id) || TABLES[0];
  if (t.id === 'classic') delete document.documentElement.dataset.table;
  else document.documentElement.dataset.table = t.id;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t.top));
}
applyTable(store.settings.table);
Sound.setMusic(store.settings.music !== false);
Sound.setSfx(store.settings.sfx !== false);
// 브라우저 정책: 첫 터치 이후에 소리 시작
document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- 카드 DOM (52장을 한 번만 만들고 위치만 바꿔요) ----------
const cardEls = new Map();
// 카드 디자인 (앞면 2종, 뒷면 4종 — 더보기에서 선택)
const FACES = [{ id: 'simple', name: '심플' }, { id: 'classic', name: '클래식' }];
const BACKS = [
  { id: 'blue', name: '블루' }, { id: 'red', name: '레드' }, { id: 'navy', name: '네이비' }, { id: 'mint', name: '민트' },
];
installSuitSymbols();
const cardFace = (s, r) => (store.settings.face === 'classic' ? faceSVG(s, r) : simpleFace(s, r));
function applyCardStyle() {
  document.documentElement.dataset.back = store.settings.back || 'blue';
  document.documentElement.dataset.face = store.settings.face || 'simple';
}
function redrawFaces() {
  for (const [id, el] of cardEls) el.querySelector('.face').innerHTML = cardFace(Math.floor(id / 13), (id % 13) + 1);
}
applyCardStyle();

function makeCard(id) {
  const s = Math.floor(id / 13);
  const r = (id % 13) + 1;
  const el = document.createElement('div');
  el.className = `card ${isRed({ s }) ? 'red' : 'black'}${r > 10 ? ' court' : ''}`;
  el.dataset.id = id;
  el.innerHTML = `<div class="back"></div><div class="face">${cardFace(s, r)}</div>`;
  el.setAttribute('aria-label', `${SUIT_NAMES[s]} ${RANKS[r]}`);
  board.appendChild(el);
  cardEls.set(id, el);
}
for (let i = 0; i < 52; i++) makeCard(i);

// ---------- 레이아웃 ----------
let L = null;
function layout() {
  const W = board.clientWidth;
  const H = board.clientHeight;
  const g = Math.max(3, Math.min(8, W * 0.01)); // 카드를 최대한 크게
  let cw = Math.min(96, (W - g * 8) / 7);
  // 가로로 긴 화면에서는 높이 기준으로 줄이기
  cw = Math.min(cw, (H - g * 4) / (1.42 * 3.2));
  const ch = cw * 1.42;
  const ox = (W - (cw * 7 + g * 6)) / 2;
  const colX = (i) => ox + i * (cw + g);
  const y0 = g;
  const y1 = y0 + ch + g * 2.2;
  L = { W, H, g, cw, ch, colX, y0, y1 };
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  const place = (el, x, y, h) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (h) el.style.height = `${h}px`;
  };
  place($('#stock-slot'), colX(0), y0);
  document.querySelectorAll('.found-slot').forEach((el) => place(el, colX(3 + Number(el.dataset.f)), y0));
  document.querySelectorAll('.tab-slot').forEach((el) => place(el, colX(Number(el.dataset.t)), y1));
}

// 각 카드의 자리 계산
function positions(st) {
  const pos = new Map();
  const { cw, ch, colX, y0, y1, H, g } = L;
  st.stock.forEach((c, i) => pos.set(c.id, { x: colX(0), y: y0, z: i + 1 }));
  // 버림 더미: 3장 뽑기면 위 3장을 펼쳐 보여요
  const fanN = st.drawCount === 3 ? 3 : 1;
  const wl = st.waste.length;
  st.waste.forEach((c, i) => {
    const k = Math.max(0, i - (wl - fanN));
    pos.set(c.id, { x: colX(1) + k * cw * 0.5, y: y0, z: 100 + i }); // 3장 펼침: 큰 숫자가 가려지지 않게
  });
  st.foundations.forEach((p, f) => p.forEach((c, i) => pos.set(c.id, { x: colX(3 + f), y: y0, z: 200 + i })));
  const avail = H - y1 - g;
  st.tableau.forEach((p, t) => {
    let down = ch * 0.13;
    let up = ch * 0.35; // 겹친 카드도 큰 숫자가 다 보이게
    const nd = p.filter((c) => !c.up).length;
    const nu = p.length - nd;
    const need = nd * down + Math.max(0, nu - 1) * up + ch;
    if (need > avail && p.length > 1) {
      const k = (avail - ch) / (need - ch);
      down *= k;
      up *= k;
    }
    let y = y1;
    p.forEach((c, i) => {
      pos.set(c.id, { x: colX(t), y, z: 300 + i });
      y += c.up ? up : down;
    });
  });
  return pos;
}

let lastPos = new Map();
function render({ instant = false, deal = false } = {}) {
  const pos = positions(state);
  lastPos = pos;
  const upMap = new Map();
  [state.stock, state.waste, ...state.foundations, ...state.tableau].forEach((p) => p.forEach((c) => upMap.set(c.id, c.up)));
  let order = 0;
  for (const [id, el] of cardEls) {
    const p = pos.get(id);
    el.style.display = p ? '' : 'none'; // 상태에 없는 카드는 숨김 (테스트용 부분 상태 대비)
    if (!p) continue;
    el.classList.toggle('no-anim', instant);
    const delay = deal ? (p.z >= 300 ? (p.z - 300) * 7 + order++ : 0) * 12 : 0;
    // 나눠 줄 때는 덱 위에서 기다리는 동안 뒷면으로 두고, 날아가는 도중에 뒤집어요 (덱 위에서 앞면이 번쩍이지 않게)
    clearTimeout(el._ft);
    if (deal && upMap.get(id)) {
      el.classList.remove('up');
      el._ft = setTimeout(() => el.classList.add('up'), delay + 200);
    } else {
      el.classList.toggle('up', upMap.get(id));
    }
    el.style.transitionDelay = delay ? `${delay}ms` : '';
    // 움직이는 카드는 이동하는 동안 다른 카드 위로 띄우고, 도착하면 원래 순서로
    const prev = el._pos;
    const moving = !instant && prev && (Math.abs(prev.x - p.x) > 0.5 || Math.abs(prev.y - p.y) > 0.5);
    clearTimeout(el._zt);
    if (moving) {
      el.style.zIndex = 5000 + p.z;
      el._zt = setTimeout(() => { el.style.zIndex = p.z; }, 420 + delay);
    } else if (!el.classList.contains('dragging')) {
      el.style.zIndex = p.z;
    }
    el._pos = { x: p.x, y: p.y };
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }
  if (instant) requestAnimationFrame(() => cardEls.forEach((el) => el.classList.remove('no-anim')));
  $('#moves').textContent = state.moves;
  $('#time').textContent = fmtTime(elapsed);
  $('#stock-slot').classList.toggle('empty', state.stock.length === 0);
  $('#stock-slot .recycle').style.visibility = state.waste.length ? 'visible' : 'hidden';
  $('[data-act="undo"]').disabled = history.length === 0 || finished;
  renderHintBadge();
  $('#auto-btn').hidden = !canAutoComplete(state) || autoRunning || finished;
  const t = $('#mode-title');
  t.textContent = mode === 'daily' ? `${dailyDate === todayStr() ? '오늘의 도전' : '지난 도전'} ${Number(dailyDate.slice(5, 7))}/${Number(dailyDate.slice(8))}` : (state.drawCount === 3 ? '3장씩 넘기기' : '1장씩 넘기기');
  t.classList.toggle('daily', mode === 'daily');
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- 진행 ----------
function persist() {
  store.current = finished ? null : { state, history: history.slice(-40), elapsed, mode, dailyDate };
  save(store);
}

const haptic = (ms) => { try { navigator.vibrate?.(ms); } catch { /* 지원 안 함 */ } };

// 이전·다음 상태를 비교해 알맞은 효과음
const faceDown = (st) => st.tableau.reduce((n, p) => n + p.filter((c) => !c.up).length, 0);
const foundCount = (st) => st.foundations.reduce((n, p) => n + p.length, 0);
function moveSound(prev, next) {
  if (next.recycles > prev.recycles) return Sound.play('recycle');
  if (next.waste.length > prev.waste.length && next.stock.length < prev.stock.length) return Sound.play('draw');
  if (foundCount(next) > foundCount(prev)) {
    const f = next.foundations.find((p, i) => p.length > prev.foundations[i].length);
    Sound.play('foundation', f[f.length - 1].r);
  } else Sound.play('place');
  if (faceDown(next) < faceDown(prev)) Sound.play('flip', null, 0.12);
}

function commit(next) {
  if (!next) return false;
  haptic(8);
  moveSound(state, next);
  history.push(state);
  if (history.length > 1000) history.shift();
  state = next;
  timerOn = true;
  clearHint();
  render();
  afterMove();
  return true;
}

let stuckShown = false;
let gameHints = 0;
let gameUndos = 0;
function afterMove() {
  if (isWon(state)) return onWin();
  persist();
  if (!stuckShown && !autoRunning && isStuck(state)) {
    stuckShown = true;
    Analytics.track('stuck_shown', { moves: state.moves, time: elapsed });
    setTimeout(showStuck, 450);
  }
}

// 막혔을 때: 덱을 다 넘겨 봐도 둘 곳이 없으면 출구를 안내
function showStuck() {
  if (finished || !$('#modal').hidden || !isStuck(state)) return;
  showModal(`
    <h2>더 둘 곳이 없어요</h2>
    <p class="sub">덱을 끝까지 넘겨 봐도 놓을 수 있는 카드가 없어요.</p>
    <div class="list">
      <button class="btn" data-m="back">막히기 전으로 되돌리기 <small>몇 수 전으로</small></button>
      <button class="btn" data-m="restart">이 판 처음부터 <small>같은 배치로</small></button>
    </div>
    <div class="row"><button class="btn" data-m="close">더 살펴볼게요</button><button class="btn primary" data-m="new">새 게임</button></div>
  `, async (act) => {
    hideModal();
    if (act === 'back') {
      while (history.length && isStuck(state)) state = history.pop();
      stuckShown = false;
      Sound.play('undo');
      render();
      persist();
    } else if (act === 'restart') restartSame();
    else if (act === 'new') {
      await Ads.showInterstitial('stuck');
      startGame();
    }
  });
}

function restartSame() {
  if (!history.length) return;
  state = history[0];
  history = [];
  elapsed = 0;
  finished = false;
  stuckShown = false;
  render();
  persist();
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function startGame({ daily = false, date = null, drawCount } = {}) {
  if (state && !finished && state.moves > 0) recordLoss();
  mode = daily ? 'daily' : 'classic';
  dailyDate = daily ? (date || todayStr()) : null;
  // 난이도 계단: 처음 하는 사람의 1판째는 쉬움, 2~3판째는 보통 (모두 힌트만 따라가도 풀리는 판, 1장 뽑기)
  const n = store.stats.played;
  const tier = daily ? null : n === 0 ? 'easy' : n <= 2 ? 'normal' : null;
  const dc = daily || tier ? 1 : (drawCount ?? store.settings.drawCount);
  // 오늘의 도전은 반드시 풀리는 판 (모두에게 같은 결과)
  const seed = daily ? findSolvableSeed(dailySeed(dailyDate, 1))
    : tier === 'easy' ? pick(EASY_SEEDS)
      : tier === 'normal' ? pick(NORMAL_SEEDS)
        : `${Date.now()}-${Math.random()}`;
  state = newGame({ seed, drawCount: dc });
  stuckShown = false;
  gameHints = 0;
  gameUndos = 0;
  Analytics.track('game_start', { mode, tier: tier || 'random', draw: dc, ...(daily ? { date: dailyDate } : {}) });
  if (tier === 'easy') setTimeout(() => toast('환영해요! 첫 판은 쉽게 준비했어요'), 900);
  history = [];
  elapsed = 0;
  timerOn = false;
  finished = false;
  autoRunning = false;
  clearHint();
  // 모든 카드를 덱 자리에 모은 뒤 나눠 주는 연출
  for (const el of cardEls.values()) {
    el.classList.add('no-anim');
    el.classList.remove('up');
    el.style.transform = `translate(${L.colX(0)}px, ${L.y0}px)`;
    el._pos = { x: L.colX(0), y: L.y0 };
  }
  board.offsetHeight; // 강제 리플로우
  for (const el of cardEls.values()) el.classList.remove('no-anim');
  render({ deal: true });
  Sound.play('deal');
  setTimeout(() => cardEls.forEach((el) => { el.style.transitionDelay = ''; }), 1200);
  persist();
}

function recordLoss() {
  Analytics.track('game_end', { result: 'abandon', mode, time: elapsed, moves: state.moves, hints: gameHints, undos: gameUndos });
  store.stats.played += 1;
  store.stats.streak = 0;
  save(store);
}

function undo() {
  if (!history.length || finished || autoRunning) return;
  state = history.pop();
  gameUndos += 1;
  Sound.play('undo');
  clearHint();
  render();
  persist();
}

// ---------- 힌트 개수 (하루 무료 + 보상형 광고로 추가, 광고 제거 구매자는 무제한) ----------
const hintsLimited = () => !store.premium && adSlotOn('REWARDED');
function hintsLeft() {
  if (!hintsLimited()) return Infinity;
  if (store.hints.date !== todayStr()) store.hints = { date: todayStr(), used: 0, bonus: 0 };
  return Math.max(0, HINTS.freePerDay + store.hints.bonus - store.hints.used);
}
function useHint() {
  if (!hintsLimited()) return;
  hintsLeft();
  store.hints.used += 1;
  save(store);
}
function renderHintBadge() {
  const b = $('[data-act="hint"]');
  let badge = b.querySelector('.badge');
  if (!badge) { badge = document.createElement('i'); badge.className = 'badge'; b.appendChild(badge); }
  const left = hintsLeft();
  badge.hidden = left === Infinity;
  badge.textContent = left === 0 ? 'AD' : String(left);
  badge.classList.toggle('ad', left === 0);
}

function showHintsOut() {
  showModal(`
    <h2>오늘 무료 힌트를 다 썼어요</h2>
    <p class="sub">무료 힌트는 매일 ${HINTS.freePerDay}개씩 다시 생겨요.</p>
    <div class="cta">
      <button class="btn primary big" data-m="reward">광고 보고 힌트 ${HINTS.perReward}개 받기</button>
      ${iapOn('remove_ads') ? '<button class="btn gold-soft" data-m="buy">광고 제거하고 힌트 무제한</button>' : ''}
      <button class="btn" data-m="close">닫기</button>
    </div>
  `, async (act) => {
    if (act === 'reward') {
      hideModal();
      if (await Ads.showRewarded('hint')) {
        hintsLeft();
        store.hints.bonus += HINTS.perReward;
        save(store);
        Analytics.track('hint_rewarded', { amount: HINTS.perReward });
        renderHintBadge();
        toast(`힌트 ${HINTS.perReward}개를 받았어요`);
        hint();
      } else toast('광고를 불러오지 못했어요. 잠시 뒤 다시 해 주세요');
    } else if (act === 'buy') showRemoveAds();
    else hideModal();
  });
}

async function hint() {
  if (finished || autoRunning) return;
  const h = findHint(state);
  if (!h) return toast('더 이상 둘 수 있는 수가 없어요. 새 게임을 시작해 보세요');
  if (hintsLeft() <= 0) return showHintsOut();
  useHint();
  renderHintBadge();
  clearHint();
  gameHints += 1;
  Sound.play('hint');
  if (h.draw) {
    $('#stock-slot').classList.add('glow');
    const top = state.stock[state.stock.length - 1];
    if (top) cardEls.get(top.id).classList.add('hint');
    toast(state.stock.length ? '덱에서 카드를 넘겨 보세요' : '덱을 다시 뒤집어 보세요');
  } else {
    const cards = getMovingCards(state, h.from);
    cards.forEach((c) => cardEls.get(c.id).classList.add('hint'));
    const sel = h.to.type === 'foundation' ? `.found-slot[data-f="${h.to.index}"]` : `.tab-slot[data-t="${h.to.index}"]`;
    const target = h.to.type === 'foundation' ? state.foundations[h.to.index] : state.tableau[h.to.index];
    if (target.length) cardEls.get(target[target.length - 1].id).classList.add('hint');
    else $(sel).classList.add('glow');
  }
  hintTimer = setTimeout(clearHint, 1800);
}

function clearHint() {
  clearTimeout(hintTimer);
  document.querySelectorAll('.hint').forEach((e) => e.classList.remove('hint'));
  document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow'));
}

async function autoComplete() {
  if (autoRunning) return;
  autoRunning = true;
  render();
  while (!isWon(state)) {
    const n = autoCompleteStep(state);
    if (!n) break;
    const f = n.foundations.find((p, i) => p.length > state.foundations[i].length);
    Sound.play('foundation', f ? f[f.length - 1].r : 1);
    history.push(state);
    state = n;
    render();
    await new Promise((r) => setTimeout(r, 90));
  }
  autoRunning = false;
  afterMove();
}

// ---------- 승리 ----------
function onWin() {
  finished = true;
  timerOn = false;
  Analytics.track('game_end', { result: 'win', mode, time: elapsed, moves: state.moves, hints: gameHints, undos: gameUndos, draw: state.drawCount });
  if (mode === 'daily') Analytics.track('daily_complete', { date: dailyDate, late: dailyDate < todayStr() ? 1 : 0 });
  const s = store.stats;
  s.played += 1;
  s.won += 1;
  s.streak += 1;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  const prevBest = s.bestTime;
  const newBestTime = prevBest === null || elapsed < prevBest;
  if (newBestTime) s.bestTime = elapsed;
  if (s.bestMoves === null || state.moves < s.bestMoves) s.bestMoves = state.moves;
  const today = todayStr();
  if (mode === 'daily') {
    const rec = store.daily[dailyDate];
    if (!rec || rec.saved || elapsed < rec.time) {
      store.daily[dailyDate] = { time: elapsed, moves: state.moves, ...(dailyDate < today && !(rec && !rec.late) ? { late: true } : {}) };
    }
  }
  persist();
  render();
  celebrate();
  setTimeout(() => {
    showModal(`
      <div class="win-badge"><svg viewBox="0 0 72 72"><defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcc00"/><stop offset="1" stop-color="#ff9500"/></linearGradient></defs><path fill="url(#wg)" d="M36 4l7.6 5.5 9.4-.1 2.9 8.9 7.6 5.6-2.9 8.9 2.9 8.9-7.6 5.6-2.9 8.9-9.4-.1L36 68l-7.6-5.5-9.4.1-2.9-8.9-7.6-5.6 2.9-8.9-2.9-8.9 7.6-5.6 2.9-8.9 9.4.1z"/><path d="M24 36.5l8 8 16-17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2 class="center">${mode === 'daily' ? '오늘의 도전 성공!' : '클리어!'}</h2>
      <p class="sub center">${fmtTime(elapsed)} · ${state.moves}번 이동</p>
      <div class="result-note ${newBestTime ? 'best' : ''}">${
  mode === 'daily' ? `연속 <b>${dailyStreak()}일</b>째 · 이번 달 ${monthDone(today.slice(0, 7))}일 성공`
    : newBestTime ? (prevBest === null ? '첫 클리어 기록이에요!' : `새 최고 기록! ${fmtTime(prevBest - elapsed)} 단축`)
      : `최고 기록 ${fmtTime(prevBest)}까지 <b>${elapsed - prevBest}초</b>`}</div>
      <div class="stats">
        <div><b>${s.won}</b><span>승리</span></div>
        <div><b>${s.played ? Math.round((s.won / s.played) * 100) : 0}%</b><span>승률</span></div>
        <div><b>${s.streak}</b><span>연승</span></div>
      </div>
      <div class="cta">
        <button class="btn primary big" data-m="new">새 게임</button>
        ${mode === 'daily' ? '<button class="btn" data-m="daily">달력 보기</button>'
    : !store.daily[today] ? '<button class="btn gold-soft" data-m="daily">오늘의 도전 하러 가기</button>' : ''}
      </div>
    `, async (act) => {
      hideModal();
      if (act === 'new') {
        await Ads.showInterstitial('win');
        startGame();
      } else if (act === 'daily') showDaily();
    });
  }, 2100);
}

// 클리어 연출: 축하 팡파르 + 파운데이션 카드 점프 + 불꽃놀이 + '클리어!' 배너
function celebrate() {
  Sound.play('win');
  haptic([20, 60, 20, 60, 40]);
  state.foundations.forEach((p, f) => {
    const top = p[p.length - 1];
    if (!top) return;
    const el = cardEls.get(top.id);
    el.style.animationDelay = `${f * 90}ms`;
    el.classList.remove('hop');
    void el.offsetWidth;
    el.classList.add('hop');
    setTimeout(() => { el.classList.remove('hop'); el.style.animationDelay = ''; }, 1400);
  });
  const banner = document.createElement('div');
  banner.className = 'clear-banner';
  banner.innerHTML = `<span class="ring"></span><span class="ring r2"></span><b>${mode === 'daily' ? '오늘의 도전 성공!' : '클리어!'}</b>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 2200);
  fireworks();
  confetti();
}

function fireworks() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const cv = document.createElement('canvas');
  cv.className = 'fireworks';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#007aff', '#af52de', '#ffffff'];
  const parts = [];
  const bursts = [0, 280, 560, 900, 1250, 1600];
  bursts.forEach((ms, i) => setTimeout(() => {
    const x = W * (0.2 + Math.random() * 0.6);
    const y = H * (0.15 + Math.random() * 0.3);
    const c1 = colors[(i * 3) % colors.length];
    const c2 = colors[(i * 3 + 4) % colors.length];
    for (let k = 0; k < 70; k++) {
      const a = (k / 70) * Math.PI * 2 + Math.random() * 0.1;
      const sp = 2.2 + Math.random() * 3.2;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: k % 3 ? c1 : c2, r: 1.6 + Math.random() * 1.6 });
    }
    Sound.play('pop');
  }, ms));
  const t0 = performance.now();
  (function frame(now) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.vx *= 0.975;
      p.vy = p.vy * 0.975 + 0.06;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.012;
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.c;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (now - t0 < 3600) requestAnimationFrame(frame);
    else cv.remove();
  })(t0);
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

// ---------- 팝업 ----------
let modalHandler = null;
function showModal(html, handler) {
  $('#modal-body').innerHTML = html;
  modalHandler = handler;
  $('#modal').hidden = false;
}
function hideModal() {
  $('#modal').hidden = true;
  modalHandler = null;
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') return hideModal();
  const b = e.target.closest('[data-m]');
  if (b && modalHandler) modalHandler(b.dataset.m, b);
});

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function showNewGameMenu() {
  const dc = store.settings.drawCount;
  showModal(`
    <h2>새 게임</h2>
    <p class="sub">카드를 한 번에 몇 장씩 넘길까요?</p>
    <div class="seg"><button data-m="dc1" class="${dc === 1 ? 'on' : ''}">1장 (쉬움)</button><button data-m="dc3" class="${dc === 3 ? 'on' : ''}">3장 (정통)</button></div>
    <div class="row"><button class="btn" data-m="close">취소</button><button class="btn primary" data-m="start">시작</button></div>
  `, (act, btn) => {
    if (act === 'dc1' || act === 'dc3') {
      store.settings.drawCount = act === 'dc1' ? 1 : 3;
      save(store);
      btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    } else if (act === 'start') {
      hideModal();
      startGame();
    } else hideModal();
  });
}

// ---------- 오늘의 도전: 연속 일수·월간 트로피·연속 지키기 ----------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
// 연속 일수: 그날 바로 깬 날(또는 광고로 지킨 날)이 오늘(아직 안 했으면 어제)부터 끊김 없이 이어진 수
const countsForStreak = (ds) => { const r = store.daily[ds]; return !!r && (!r.late || r.saved); };
function dailyStreak() {
  let d = todayStr();
  if (!countsForStreak(d)) d = addDays(d, -1);
  let n = 0;
  while (countsForStreak(d)) { if (!store.daily[d].saved) n++; d = addDays(d, -1); }
  return n;
}
const monthDone = (ym) => Object.keys(store.daily).filter((k) => k.startsWith(ym) && !store.daily[k].saved).length;
const trophies = () => [...new Set(Object.keys(store.daily).map((k) => k.slice(0, 7)))].filter((ym) => monthDone(ym) >= daysIn(ym)).length;
// 어제를 놓쳤고 그 전날까지 연속이었다면, 광고를 보고 어제를 채워 연속을 지킬 수 있어요
function canSaveStreak() {
  const y1 = addDays(todayStr(), -1);
  const y2 = addDays(todayStr(), -2);
  return !store.daily[y1] && countsForStreak(y2);
}

let calMonth = null;
let calSel = null;
function showDaily() {
  const today = todayStr();
  if (!calMonth) calMonth = today.slice(0, 7);
  if (!calSel || calSel > today) calSel = today;
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = daysIn(calMonth);
  let cells = ['일', '월', '화', '수', '목', '금', '토'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="d blank"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${calMonth}-${String(d).padStart(2, '0')}`;
    const r = store.daily[ds];
    const cls = ['d', r && !r.saved ? (r.late ? 'done late' : 'done') : '', r?.saved ? 'saved' : '',
      ds === today ? 'today' : '', ds > today ? 'future' : '', ds === calSel ? 'sel' : ''].filter(Boolean).join(' ');
    cells += ds > today ? `<div class="${cls}">${d}</div>`
      : `<button class="${cls}" data-m="day:${ds}" aria-label="${m}월 ${d}일${r ? ' 성공' : ''}">${r && !r.saved ? '✓' : d}</button>`;
  }
  const done = monthDone(calMonth);
  const streak = dailyStreak();
  const selRec = store.daily[calSel];
  const selLabel = calSel === today ? '오늘 판' : `${Number(calSel.slice(5, 7))}월 ${Number(calSel.slice(8))}일 판`;
  showModal(`
    <h2>오늘의 도전</h2>
    <p class="sub">매일 모두에게 같은 판이 나와요. 반드시 풀 수 있는 판이에요.</p>
    <div class="chips">
      <span class="chip fire"><svg viewBox="0 0 24 24"><path class="fill" d="M12 2c1 3.5 5 5.6 5 10.5A5 5 0 0 1 7 13c0-2 .8-3.4 2-4.5.2 1.6 1 2.6 2 3 0-3.6-.6-6.3 1-9.5Z"/></svg>연속 ${streak}일</span>
      <span class="chip trophy"><svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/></svg>트로피 ${trophies()}개</span>
    </div>
    ${canSaveStreak() ? '<button class="save-streak" data-m="save"><b>어제를 놓쳤어요</b><span>광고 보고 연속 기록 지키기</span></button>' : ''}
    <div class="cal-head"><button data-m="prev" aria-label="이전 달"><svg><use href="#i-chevron-l"/></svg></button><span>${y}년 ${m}월</span><button data-m="next" aria-label="다음 달"><svg><use href="#i-chevron-r"/></svg></button></div>
    <div class="cal">${cells}</div>
    <div class="month-progress"><div class="bar"><i style="width:${Math.round((done / days) * 100)}%"></i></div><span>${done}/${days}일 · 다 채우면 트로피</span></div>
    <div class="row"><button class="btn" data-m="close">닫기</button><button class="btn gold" data-m="play">${selRec && !selRec.saved ? `다시 하기 (${fmtTime(selRec.time)})` : `${selLabel} 시작`}</button></div>
  `, async (act) => {
    if (act === 'prev' || act === 'next') {
      const d = new Date(y, m - 1 + (act === 'next' ? 1 : -1), 1);
      calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      showDaily();
    } else if (act.startsWith('day:')) {
      calSel = act.slice(4);
      Sound.play('tap');
      showDaily();
    } else if (act === 'save') {
      if (store.premium || await Ads.showRewarded('streak')) {
        store.daily[addDays(todayStr(), -1)] = { saved: true };
        Analytics.track('streak_save', {});
        save(store);
        toast('연속 기록을 지켰어요');
      }
      showDaily();
    } else if (act === 'play') {
      hideModal();
      startGame({ daily: true, date: calSel });
    } else hideModal();
  });
}

// ---------- 광고 제거 (인앱 상품) ----------
function applyPremium(announce = false) {
  store.premium = true;
  save(store);
  Ads.removed = true;
  Ads.hideBanner();
  const spacer = $('#ad-banner');
  spacer.classList.add('off');
  spacer.style.height = '';
  layout();
  render({ instant: true });
  if (announce) toast('광고가 사라졌어요. 고맙습니다!');
}

function showRemoveAds() {
  showModal(`
    <h2>광고 없이 즐기기</h2>
    <p class="sub">한 번만 구매하면 계속 적용돼요.</p>
    <div class="list perks">
      <div class="btn">아래 배너 광고 없음</div>
      <div class="btn">판 사이 광고 없음</div>
      <div class="btn">힌트 무제한</div>
      <div class="btn">연속 기록 지키기도 광고 없이</div>
    </div>
    <div class="cta">
      <button class="btn primary big" data-m="buy-now">${Purchases.price ? `${Purchases.price}에 구매` : '구매하기'}</button>
      <button class="btn" data-m="close">나중에</button>
    </div>
  `, async (act) => {
    hideModal();
    if (act !== 'buy-now') return;
    if (await Purchases.buyRemoveAds()) applyPremium(true);
    else toast('구매가 완료되지 않았어요');
  });
}

// NCQ_TEST_CHEAT: 바로 이기기 — 모든 카드를 앞면으로 정리해 자동 완성으로 끝내요
function cheatWin() {
  const cards = [state.stock, state.waste, ...state.foundations, ...state.tableau].flat().map((c) => ({ ...c, up: true }));
  const tableau = [[], [], [], [], [], [], []];
  for (let s = 0; s < 4; s++) for (let r = 13; r >= 1; r--) { const c = cards.find((x) => x.s === s && x.r === r); if (c) tableau[s].push(c); }
  history.push(state);
  state = { ...state, stock: [], waste: [], foundations: [[], [], [], []], tableau };
  render();
  autoComplete();
}

// NCQ_TEST_DEBUG: 이벤트 로그 요약 (잔존·판 수·광고 노출이 잘 쌓이는지 QA)
function showEventLog() {
  const a = Analytics.summary();
  showModal(`
    <h2>이벤트 로그</h2>
    <p class="sub">설치일 ${a.installDate} · 접속 ${a.sessions}회 · 접속한 날 ${a.activeDays}일</p>
    <div class="stats">
      <div><b>${a.gameStart}</b><span>판 시작</span></div>
      <div><b>${a.wins}/${a.gameEnd}</b><span>승리/종료</span></div>
      <div><b>${a.adImpressions}</b><span>광고 노출</span></div>
    </div>
    <div class="list log">${a.recent.map((e) => `<div class="log-row"><b>${e.name}</b><small>${Object.entries(e).filter(([k]) => !['t', 'name', 'v', 'platform'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')}</small></div>`).join('')}</div>
    <div class="row"><button class="btn primary" data-m="close">닫기</button></div>
  `, hideModal);
}

function showMenu() {
  const s = store.stats;
  showModal(`
    <h2>메뉴</h2>
    <p class="sub">내 기록</p>
    <div class="stats">
      <div><b>${s.played}</b><span>판 수</span></div>
      <div><b>${s.won}</b><span>승리</span></div>
      <div><b>${s.played ? Math.round((s.won / s.played) * 100) : 0}%</b><span>승률</span></div>
      <div><b>${s.bestTime === null ? '-' : fmtTime(s.bestTime)}</b><span>최단 시간</span></div>
      <div><b>${s.bestMoves ?? '-'}</b><span>최소 이동</span></div>
      <div><b>${s.bestStreak}</b><span>최다 연승</span></div>
    </div>
    <p class="group-label">사운드</p>
    <div class="list">
      <button class="toggle" data-m="music" role="switch" aria-checked="${store.settings.music !== false}">배경음악<span class="switch${store.settings.music !== false ? ' on' : ''}"></span></button>
      <button class="toggle" data-m="sfx" role="switch" aria-checked="${store.settings.sfx !== false}">효과음<span class="switch${store.settings.sfx !== false ? ' on' : ''}"></span></button>
    </div>
    <p class="group-label">카드 앞면</p>
    <div class="face-pick">${FACES.map((f) => `<button data-m="face:${f.id}" class="${(store.settings.face || 'simple') === f.id ? 'on' : ''}"><span class="minis"><span class="mini red">${f.id === 'simple' ? simpleFace(1, 12) : faceSVG(1, 12)}</span><span class="mini">${f.id === 'simple' ? simpleFace(0, 7) : faceSVG(0, 7)}</span></span>${f.name}</button>`).join('')}</div>
    <p class="group-label">카드 뒷면</p>
    <div class="back-pick">${BACKS.map((b) => `<button data-m="back:${b.id}" class="${(store.settings.back || 'blue') === b.id ? 'on' : ''}"><span class="mini-back" data-back="${b.id}"></span>${b.name}</button>`).join('')}</div>
    <p class="group-label">테이블 색</p>
    <div class="swatches">${TABLES.map((t) => `<button data-m="table:${t.id}" class="${(store.settings.table || 'classic') === t.id ? 'on' : ''}" aria-label="${t.name}"><i style="background:radial-gradient(circle at 50% 30%, ${t.top}, ${t.bottom})"></i>${t.name}</button>`).join('')}</div>
    <div class="list">
      <button class="btn" data-m="restart">이 판 처음부터 <small>같은 배치로</small></button>
      <button class="btn" data-m="rules">게임 방법</button>
      <button class="btn" data-m="feedback">의견 보내기 <small>불편한 점·바라는 점</small></button>
    </div>
    ${iapOn('remove_ads') ? `<p class="group-label">광고</p>
    <div class="list">
      ${store.premium ? '<div class="btn done-row">광고 제거됨 <small>감사합니다</small></div>'
    : `<button class="btn" data-m="buy">광고 제거 <small>${Purchases.price || '한 번만 구매'}</small></button>`}
      ${isNative() && !store.premium ? '<button class="btn" data-m="restore">구매 복원 <small>다시 설치했을 때</small></button>' : ''}
    </div>` : ''}
    ${testOn('CHEAT') || testOn('DEBUG') ? `<p class="group-label">테스트 기능 <small>(출시 빌드에서는 꺼져요)</small></p>
    <div class="list test">
      ${testOn('CHEAT') ? '<button class="btn" data-m="cheat-win">바로 이기기</button><button class="btn" data-m="cheat-reset">기록 초기화 <small>첫 판부터 다시</small></button>' : ''}
      ${testOn('DEBUG') ? '<button class="btn" data-m="debug-log">이벤트 로그 보기</button>' : ''}
    </div>` : ''}
    <div class="row"><button class="btn primary" data-m="close">계속하기</button></div>
    <p class="version">포켓 솔리테어 v${APP_VERSION}</p>
  `, (act, btn) => {
    if (act === 'feedback') {
      Analytics.track('feedback_open', {});
      if (FEEDBACK_URL) { hideModal(); openExternal(FEEDBACK_URL); } else toast('의견 보내기는 곧 열려요');
      return;
    }
    if (act === 'buy') { showRemoveAds(); return; }
    if (act === 'restore') {
      hideModal();
      Purchases.restore().then((ok) => { if (ok) applyPremium(true); else toast('복원할 구매 내역이 없어요'); });
      return;
    }
    if (act === 'cheat-win') { hideModal(); cheatWin(); return; }
    if (act === 'cheat-reset') {
      try { localStorage.clear(); } catch { /* 무시 */ }
      location.reload();
      return;
    }
    if (act === 'debug-log') { showEventLog(); return; }
    if (act === 'music' || act === 'sfx') {
      const on = store.settings[act] === false;
      store.settings[act] = on;
      save(store);
      Analytics.track('setting_change', { key: act, value: on ? 1 : 0 });
      if (act === 'music') Sound.setMusic(on);
      else { Sound.setSfx(on); if (on) Sound.play('place'); }
      btn.querySelector('.switch').classList.toggle('on', on);
      btn.setAttribute('aria-checked', String(on));
      return;
    }
    if (act.startsWith('face:') || act.startsWith('back:')) {
      const [k, v] = act.split(':');
      store.settings[k] = v;
      save(store);
      Analytics.track('setting_change', { key: k, value: v });
      applyCardStyle();
      if (k === 'face') redrawFaces();
      Sound.play('flip');
      btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      return;
    }
    if (act.startsWith('table:')) {
      store.settings.table = act.slice(6);
      save(store);
      Analytics.track('setting_change', { key: 'table', value: store.settings.table });
      applyTable(store.settings.table);
      btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      return;
    }
    if (act === 'restart') {
      hideModal();
      restartSame();
    } else if (act === 'rules') {
      showModal(`
        <h2>게임 방법</h2>
        <p class="sub" style="line-height:1.65;color:var(--label)">
        • 모든 카드를 오른쪽 위 4칸에 무늬별로 A부터 K까지 쌓으면 이겨요.<br>
        • 아래 7줄에서는 빨강·검정을 번갈아, 숫자를 하나씩 낮춰 쌓아요.<br>
        • 빈 줄에는 K만 놓을 수 있어요.<br>
        • 왼쪽 위 덱을 누르면 카드를 넘겨요. 다 넘기면 다시 뒤집어요.<br>
        • 카드를 <b>탭하면 갈 수 있는 곳으로 자동 이동</b>하고, 끌어서 옮길 수도 있어요.<br>
        • 막히면 힌트, 실수하면 되돌리기(무제한)를 쓰세요.</p>
        <div class="row"><button class="btn primary" data-m="close">알겠어요</button></div>
      `, hideModal);
    } else hideModal();
  });
}

// ---------- 하단 버튼 ----------
document.querySelector('.toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || autoRunning) return;
  ({ new: showNewGameMenu, daily: showDaily, hint, undo, menu: showMenu })[b.dataset.act]?.();
});
$('#auto-btn').addEventListener('click', autoComplete);

// ---------- 터치·마우스 조작 ----------
function locate(id) {
  for (let t = 0; t < 7; t++) {
    const i = state.tableau[t].findIndex((c) => c.id === id);
    if (i >= 0) return { type: 'tableau', index: t, cardIndex: i };
  }
  for (let f = 0; f < 4; f++) {
    const p = state.foundations[f];
    if (p.length && p[p.length - 1].id === id) return { type: 'foundation', index: f };
  }
  if (state.waste.length && state.waste[state.waste.length - 1].id === id) return { type: 'waste', index: 0 };
  if (state.stock.some((c) => c.id === id)) return { type: 'stock' };
  return null;
}

let drag = null;
board.addEventListener('pointerdown', (e) => {
  if (finished || autoRunning || drag) return;
  const cardEl = e.target.closest('.card');
  const onStock = e.target.closest('#stock-slot') || (cardEl && locate(Number(cardEl.dataset.id))?.type === 'stock');
  if (onStock) {
    if (commit(draw(state)) === false && !state.waste.length) toast('덱이 비었어요');
    return;
  }
  if (!cardEl) return;
  const from = locate(Number(cardEl.dataset.id));
  if (!from) return;
  const cards = getMovingCards(state, from);
  if (!cards) return;
  drag = {
    from, cards, sx: e.clientX, sy: e.clientY, moved: false, pointerId: e.pointerId,
    els: cards.map((c) => cardEls.get(c.id)),
    start: cards.map((c) => lastPos.get(c.id)),
  };
  board.setPointerCapture(e.pointerId);
});

board.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.sx;
  const dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    clearHint();
    drag.els.forEach((el, i) => { el.classList.add('dragging'); el.style.zIndex = 3000 + i; });
  }
  drag.els.forEach((el, i) => {
    el.style.transform = `translate(${drag.start[i].x + dx}px, ${drag.start[i].y + dy}px) scale(1.05)`;
  });
  drag.dx = dx;
  drag.dy = dy;
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  d.els.forEach((el, i) => {
    el.classList.remove('dragging');
    // 놓은 자리에서 출발하는 것으로 기록 → 돌아가거나 옮겨지는 동안 맨 위에 보이게
    if (d.moved) el._pos = { x: d.start[i].x + d.dx, y: d.start[i].y + d.dy };
  });
  if (!d.moved) {
    // 탭: 갈 수 있는 가장 좋은 곳으로
    const m = bestMoveFrom(state, d.from);
    if (!commit(m && applyMove(state, m))) {
      // 위에 얹힌 카드까지 한 몸처럼 흔들기
      d.els.forEach((el) => el.classList.remove('shake'));
      void d.els[0].offsetWidth;
      d.els.forEach((el) => el.classList.add('shake'));
      haptic([12, 40, 12]);
      Sound.play('invalid');
      render();
    }
    return;
  }
  const target = dropTarget(d);
  if (!target || !commit(applyMove(state, { from: d.from, to: target }))) render();
}
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) { drag = null; render(); } });

// 끌어 놓은 카드와 가장 많이 겹치는, 놓을 수 있는 자리
function dropTarget(d) {
  const { cw, ch, colX, y0, y1, H } = L;
  const x = d.start[0].x + d.dx;
  const y = d.start[0].y + d.dy;
  const overlap = (rx, ry, rw, rh) => Math.max(0, Math.min(x + cw, rx + rw) - Math.max(x, rx)) * Math.max(0, Math.min(y + ch, ry + rh) - Math.max(y, ry));
  const cands = [];
  for (let f = 0; f < 4; f++) cands.push({ to: { type: 'foundation', index: f }, a: overlap(colX(3 + f), y0, cw, ch) });
  for (let t = 0; t < 7; t++) {
    const p = state.tableau[t];
    const topPos = p.length ? lastPos.get(p[p.length - 1].id) : { y: y1 };
    cands.push({ to: { type: 'tableau', index: t }, a: overlap(colX(t), y1, cw, Math.max(topPos.y - y1 + ch, ch, H - y1)) * 0.6 + overlap(colX(t), topPos.y, cw, ch) });
  }
  const legal = cands.filter((c) => c.a > 0 && isLegalMove(state, { from: d.from, to: c.to }));
  legal.sort((a, b) => b.a - a.a);
  return legal[0]?.to || null;
}

// ---------- 시간 ----------
setInterval(() => {
  if (timerOn && !finished && !document.hidden && $('#modal').hidden) {
    elapsed += 1;
    $('#time').textContent = fmtTime(elapsed);
    if (elapsed % 10 === 0) persist();
  }
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------- 시작 ----------
window.addEventListener('resize', () => { layout(); render({ instant: true }); });
layout();
const saved = store.current;
if (saved && saved.state) {
  state = saved.state;
  history = saved.history || [];
  elapsed = saved.elapsed || 0;
  mode = saved.mode || 'classic';
  dailyDate = saved.dailyDate || null;
  timerOn = state.moves > 0;
  render({ instant: true });
} else {
  startGame();
}
if (store.premium) Ads.removed = true; // 광고 제거 구매자
if (Ads.removed || !adSlotOn('BANNER')) $('#ad-banner').classList.add('off');
Analytics.open();
Purchases.init();
if (isNative() && !store.premium) Purchases.owned().then((ok) => { if (ok) applyPremium(); });

// 앱(안드로이드): 실제 광고 — 배너는 아래 버튼 막대 바로 위에 붙고, 화면의 광고 자리가 그 높이만큼 비켜 줘요
if (isNative()) {
  const tb = document.querySelector('.toolbar');
  Ads.bannerMargin = Math.round(tb.getBoundingClientRect().height);
  const spacer = $('#ad-banner');
  spacer.classList.add('native');
  Ads.init({ onBannerHeight: (h) => { spacer.style.height = `${h}px`; layout(); render({ instant: true }); } });
}

// 안드로이드 뒤로 가기: 열린 창 닫기 → 없으면 종료 확인
onBackButton(() => {
  if (!$('#modal').hidden) return hideModal();
  showModal(`
    <h2>게임을 마칠까요?</h2>
    <p class="sub">지금 판은 저장돼요. 다음에 이어서 할 수 있어요.</p>
    <div class="row"><button class="btn" data-m="exit">마치기</button><button class="btn primary" data-m="close">계속하기</button></div>
  `, (act) => { if (act === 'exit') { persist(); exitApp(); } else hideModal(); });
});

// NCQ_TEST_DEBUG: 자동 테스트·디버깅용 훅 (출시 빌드에서는 없어요)
if (testOn('DEBUG')) window.__ps = {
  get state() { return state; },
  set state(v) { hideModal(); state = v; history = []; finished = false; stuckShown = false; mode = 'classic'; dailyDate = null; render({ instant: true }); },
  startGame, undo, hint, autoComplete, render, Sound, Analytics, cheatWin, Ads,
  get store() { return store; },
};
