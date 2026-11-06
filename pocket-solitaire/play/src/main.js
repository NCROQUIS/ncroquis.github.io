// 포켓 솔리테어 — 화면과 조작
import { RANKS, isRed, dailySeed, timeBonus } from './engine.js';
import { rulesOf, VARIANTS, modeLabel, modeKey, variantName } from './rules.js';
import { t, num, NcqLang } from './i18n.js';
import * as Progress from './progress.js';
import { load, save, exportCode, importCode, STORE_KEY } from './storage.js';
import { Ads, NcqAds, isDevAds, adState, bannerPos } from './ads.js';
import { EASY_SEEDS, NORMAL_SEEDS } from './easy-seeds.js';
import { isStuck, findSolvableSeed } from './solver.js';
import { hintFor, prefetchHint, stopPrefetch, hintReady } from './search.js';
import { FREECELL_SEEDS } from './freecell-seeds.js';
import { SPIDER_SEEDS } from './spider-seeds.js';
import { Sound } from './sound.js';
import { Haptics } from './haptics.js';
import { installSuitSymbols, faceSVG, simpleFace } from './cardart.js';
import { Analytics } from './analytics.js';
import { testOn, onBackButton, exitApp, openExternal, platform } from './platform.js';
import { APP_VERSION, FEEDBACK_URL, HINTS, UNDO, RATING } from './config.js';
import { NcqIap, buyRemoveAds, restorePurchases } from './iap.js';
import { NcqMetrics } from './metrics.js';

const $ = (s) => document.querySelector(s);
const board = $('#board');
const store = load();

// ---------- 게임 상태 ----------
const R = () => rulesOf(state); // 지금 판의 규칙 (클래식·스파이더·프리셀)
let state = null;
let history = [];
let mode = 'classic'; // classic | daily
let dailyDate = null;
let elapsed = 0; // 초
let timerOn = false;
let finished = false;
let autoRunning = false;
let hintTimer = null;

// 테이블 색 (클래식 그린이 기본, 나머지는 옵션). 이름은 글자 표의 table_<id>
const TABLES = [
  { id: 'classic', top: '#2f8a5b', bottom: '#14543a' },
  { id: 'night', top: '#24332e', bottom: '#0e1412' },
  { id: 'blue', top: '#2b62a8', bottom: '#12305c' },
  { id: 'wine', top: '#8e2f45', bottom: '#4a1324' },
  { id: 'graphite', top: '#4a4d52', bottom: '#1f2124' },
  { id: 'sage', top: '#f3f6f4', bottom: '#dfe7e2' },
];
function applyTable(id) {
  const tb = TABLES.find((x) => x.id === id) || TABLES[0];
  if (tb.id === 'classic') delete document.documentElement.dataset.table;
  else document.documentElement.dataset.table = tb.id;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', tb.top));
}
applyTable(store.settings.table);
Sound.setMusic(store.settings.music !== false);
Sound.setSfx(store.settings.sfx !== false);
Haptics.setOn(store.settings.haptics !== false);
// 브라우저 정책: 첫 터치 이후에 소리 시작
document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- 카드 DOM (52장을 한 번만 만들고 위치만 바꿔요) ----------
const cardEls = new Map();
// 카드 디자인 (앞면 2종, 뒷면 4종 — 더보기에서 선택). 이름은 글자 표의 face_<id>·back_<id>
const FACES = ['simple', 'classic'];
const BACKS = ['blue', 'red', 'navy', 'mint'];
// 화면 읽기용 카드 이름 (스페이드 A / Ace of Spades)
const cardLabel = (c) => t('card_label', { suit: t(`suit_${c.s}`), rank: c.r === 1 || c.r > 10 ? t(`rank_${c.r}`) : RANKS[c.r] });
installSuitSymbols();
// 스파이더처럼 줄이 많아 카드가 좁으면 숫자를 더 크게 그려요 (narrow)
const narrowCards = () => !!L && L.cols > 8;
const cardFace = (s, r) => (store.settings.face === 'classic' && !narrowCards() ? faceSVG(s, r) : simpleFace(s, r, { narrow: narrowCards() }));
function applyCardStyle() {
  document.documentElement.dataset.back = store.settings.back || 'blue';
  document.documentElement.dataset.face = store.settings.face || 'simple';
}
function redrawFaces() {
  for (const el of cardEls.values()) el._key = null;
  if (state) render({ instant: true });
}
applyCardStyle();

// 카드 DOM: 처음 보이는 카드만 만들고(스파이더는 104장), 무늬·숫자가 바뀌면 그림만 다시 그려요
const allCards = (st) => [st.stock, st.waste, (st.cells || []).filter(Boolean), ...st.foundations, ...st.tableau].flat();
function ensureCard(c) {
  let el = cardEls.get(c.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    el.innerHTML = '<div class="back"></div><div class="face"></div>';
    board.appendChild(el);
    cardEls.set(c.id, el);
    if (L) {
      el.classList.add('no-anim');
      el.style.transform = `translate(${L.stockX}px, ${L.y0}px)`;
      el._pos = { x: L.stockX, y: L.y0 };
    }
  }
  const key = `${c.s}-${c.r}-${store.settings.face}-${narrowCards() ? 'n' : ''}-${NcqLang.lang}`;
  if (el._key !== key) {
    el._key = key;
    el.classList.toggle('red', isRed(c));
    el.classList.toggle('black', !isRed(c));
    el.classList.toggle('court', c.r > 10);
    el.querySelector('.face').innerHTML = cardFace(c.s, c.r);
    el.setAttribute('aria-label', cardLabel(c));
  }
  return el;
}

// ---------- 레이아웃 ----------
let L = null;
const COLS = { klondike: 7, freecell: 8, spider: 10 };
const variantOf = (st) => (st && st.variant) || 'klondike';

// 카드 자리: 게임 종류가 바뀔 때마다 새로 만들어요
let slotsFor = null;
function buildSlots(v) {
  if (slotsFor === v) return;
  slotsFor = v;
  board.querySelectorAll('.slot').forEach((e) => e.remove());
  const add = (cls, attrs = {}, html = '') => {
    const el = document.createElement('div');
    el.className = `slot ${cls}`;
    Object.entries(attrs).forEach(([k, val]) => { if (k === 'id') el.id = val; else el.dataset[k] = val; });
    el.innerHTML = html;
    board.insertBefore(el, board.firstChild);
    return el;
  };
  const cols = COLS[v];
  for (let t = cols - 1; t >= 0; t--) add('tab-slot', { t });
  if (v === 'klondike') {
    for (let f = 3; f >= 0; f--) add('found-slot', { f }, '<span>A</span>');
    add('stock-slot', { id: 'stock-slot' }, '<svg class="recycle"><use href="#i-recycle"/></svg>');
  } else if (v === 'freecell') {
    for (let f = 3; f >= 0; f--) add('found-slot', { f }, '<span>A</span>');
    for (let c = 3; c >= 0; c--) add('cell-slot', { c });
  } else {
    for (let f = 7; f >= 0; f--) add('found-slot spider', { f }, '<span>K</span>');
    add('stock-slot', { id: 'stock-slot' }, '<span class="deals"></span>');
  }
}

function layout() {
  const v = variantOf(state);
  buildSlots(v);
  const cols = COLS[v];
  const lefty = !!store.settings.lefty;
  const W = board.clientWidth;
  const H = board.clientHeight;
  const g = Math.max(cols > 8 ? 1.5 : 2, Math.min(8, W * (cols > 8 ? 0.004 : cols > 7 ? 0.007 : 0.01))); // 카드를 최대한 크게
  // 스파이더(10줄)는 카드가 좁아서 세로로 조금 길게 그려 큰 숫자가 들어갈 자리를 만들어요
  const ratio = cols > 8 ? 1.5 : 1.42;
  let cw = Math.min(96, (W - g * (cols + 1)) / cols);
  // 가로로 긴 화면에서는 높이 기준으로 줄이기
  cw = Math.min(cw, (H - g * 4) / (ratio * 3.2));
  const ch = cw * ratio;
  const ox = (W - (cw * cols + g * (cols - 1))) / 2;
  const colX = (i) => ox + i * (cw + g);
  const y0 = g;
  const y1 = y0 + ch + g * 2.2;
  // 위 줄 자리 (왼손 배치면 좌우를 바꿔요)
  const side = (i) => colX(lefty ? cols - 1 - i : i);
  let stockX = side(0);
  let wasteX = side(1);
  let wasteDir = lefty ? -1 : 1;
  let foundX = (f) => side(3 + f);
  let cellX = () => 0;
  if (v === 'klondike') foundX = (f) => (lefty ? colX(f) : colX(3 + f));
  if (v === 'freecell') { cellX = (c) => (lefty ? colX(4 + c) : colX(c)); foundX = (f) => (lefty ? colX(f) : colX(4 + f)); stockX = colX(0); }
  if (v === 'spider') { foundX = (f) => (lefty ? colX(f) : colX(2 + f)); wasteX = stockX; wasteDir = 1; }
  const wasNarrow = narrowCards();
  L = { W, H, g, cw, ch, colX, y0, y1, stockX, wasteX, wasteDir, foundX, cellX, cols, variant: v };
  if (wasNarrow !== narrowCards()) for (const el of cardEls.values()) el._key = null; // 그림을 좁은 카드용으로 다시
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  const place = (el, x, y) => { el.style.left = `${x}px`; el.style.top = `${y}px`; };
  const st = $('#stock-slot');
  if (st) place(st, stockX, y0);
  document.querySelectorAll('.found-slot').forEach((el) => place(el, foundX(Number(el.dataset.f)), y0));
  document.querySelectorAll('.cell-slot').forEach((el) => place(el, cellX(Number(el.dataset.c)), y0));
  document.querySelectorAll('.tab-slot').forEach((el) => place(el, colX(Number(el.dataset.t)), y1));
}

// 각 카드의 자리 계산
function positions(st) {
  const pos = new Map();
  const { cw, ch, colX, y0, y1, H, g } = L;
  const v = variantOf(st);
  if (v === 'spider') {
    // 남은 덱은 10장 묶음마다 살짝 비켜 쌓아 몇 번 더 나눌 수 있는지 보여요
    st.stock.forEach((c, i) => pos.set(c.id, { x: L.stockX + Math.floor(i / 10) * cw * 0.12 * (store.settings.lefty ? -1 : 1), y: y0, z: i + 1 }));
  } else st.stock.forEach((c, i) => pos.set(c.id, { x: L.stockX, y: y0, z: i + 1 }));
  // 버림 더미: 3장 뽑기면 위 3장을 펼쳐 보여요
  const fanN = st.drawCount === 3 ? 3 : 1;
  const wl = st.waste.length;
  st.waste.forEach((c, i) => {
    const k = Math.max(0, i - (wl - fanN));
    pos.set(c.id, { x: L.wasteX + k * cw * 0.5 * L.wasteDir, y: y0, z: 100 + i }); // 3장 펼침: 큰 숫자가 가려지지 않게
  });
  (st.cells || []).forEach((c, i) => c && pos.set(c.id, { x: L.cellX(i), y: y0, z: 150 + i }));
  // 스파이더는 걷은 묶음의 K가 맨 위에 보이게
  st.foundations.forEach((p, f) => p.forEach((c, i) => pos.set(c.id, { x: L.foundX(f), y: y0, z: 200 + (v === 'spider' ? 12 - i : i) })));
  const avail = H - y1 - g;
  st.tableau.forEach((p, t) => {
    let down = ch * (L.cols > 8 ? 0.16 : 0.13);
    let up = ch * (L.cols > 8 ? 0.46 : 0.35); // 겹친 카드도 큰 숫자가 다 보이게
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
  if (!L || L.variant !== variantOf(state)) layout();
  const cards = allCards(state);
  cards.forEach(ensureCard);
  const pos = positions(state);
  lastPos = pos;
  const upMap = new Map();
  cards.forEach((c) => upMap.set(c.id, c.up));
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
  $('#score').textContent = state.score || 0;
  $('#time').textContent = fmtTime(elapsed);
  const stockSlot = $('#stock-slot');
  if (stockSlot) {
    stockSlot.classList.toggle('empty', state.stock.length === 0);
    const rc = stockSlot.querySelector('.recycle');
    if (rc) rc.style.visibility = state.waste.length ? 'visible' : 'hidden';
    const dl = stockSlot.querySelector('.deals');
    if (dl) dl.textContent = state.stock.length ? '' : '';
  }
  board.dataset.variant = variantOf(state);
  $('[data-act="undo"]').disabled = history.length === 0 || finished;
  renderHintBadge();
  renderUndoBadge();
  $('#auto-btn').hidden = !R().canAutoComplete(state) || autoRunning || finished;
  const title = $('#mode-title');
  title.textContent = mode === 'daily' ? dailyTitle(dailyDate) : modeLabel(state);
  title.classList.toggle('daily', mode === 'daily');
}

// 날짜 글자: 'YYYY-MM-DD' → 지금 언어로 (11월 4일 / November 4)
const dateOf = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
const dayText = (ds, month = 'long') => NcqLang.date(dateOf(ds), { month, day: 'numeric' });
// 오늘의 도전 제목: 오늘의 도전 11/4 · 지난 도전 11/3 (Daily · Nov 4)
const dailyTitle = (ds) => t(ds === todayStr() ? 'title_today' : 'title_past',
  { md: `${Number(ds.slice(5, 7))}/${Number(ds.slice(8))}`, date: dayText(ds, 'short') });

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- 진행 ----------
let resetting = false; // 기록 초기화 중에는 다시 저장하지 않아요
function persist() {
  if (resetting || !state) return;
  store.current = finished ? null : { state, history: history.slice(-40), elapsed, mode, dailyDate, undos: gameUndos, undoBonus, hints: gameHints };
  save(store);
}

const haptic = (kind) => Haptics.play(kind); // 진동 종류: place·foundation·error·success … (src/haptics.js)

// 이전·다음 상태를 비교해 알맞은 효과음
const faceDown = (st) => st.tableau.reduce((n, p) => n + p.filter((c) => !c.up).length, 0);
const foundCount = (st) => st.foundations.reduce((n, p) => n + p.length, 0);
function moveSound(prev, next) {
  if (next.recycles > prev.recycles) return Sound.play('recycle');
  if (next.waste.length > prev.waste.length && next.stock.length < prev.stock.length) return Sound.play('draw');
  if (foundCount(next) > foundCount(prev)) {
    const f = next.foundations.find((p, i) => p.length > ((prev.foundations[i] && prev.foundations[i].length) || 0));
    Sound.play(variantOf(next) === 'spider' ? 'pop' : 'foundation', f ? f[f.length - 1].r : 1);
  } else Sound.play('place');
  if (faceDown(next) < faceDown(prev)) Sound.play('flip', null, 0.12);
}

function commit(next) {
  if (!next) return false;
  haptic(foundCount(next) > foundCount(state) ? 'foundation' : 'place');
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
let undoBonus = 0; // 오늘의 도전: 보상형 광고로 더 받은 되돌리기
// 끝까지 푸는 힌트를 쓰는 게임: 프리셀·스파이더 1무늬 (2·4무늬는 풀이가 너무 오래 걸려 간단한 힌트)
const solverHints = () => state && (state.variant === 'freecell' || (state.variant === 'spider' && (state.suits || 1) === 1));
// 사람이 생각하는 동안 다음 힌트를 미리 찾아 둬요 (화면이 한가할 때 조금씩)
function warmHint() { if (solverHints() && !finished) prefetchHint(state); else stopPrefetch(); }

function afterMove() {
  if (R().isWon(state)) return onWin();
  persist();
  warmHint();
  if (!stuckShown && !autoRunning && isStuck(state)) {
    stuckShown = true;
    Analytics.track('stuck_shown', { moves: state.moves, time: elapsed });
    setTimeout(showStuck, 450);
  }
}

// 막혔을 때: 덱을 다 넘겨 봐도 둘 곳이 없으면 출구를 안내
function showStuck() {
  if (finished || !$('#modal').hidden || !isStuck(state)) return;
  const v = variantOf(state);
  showModal(`
    <h2>${t('stuck_title')}</h2>
    <p class="sub">${t(v === 'klondike' ? 'stuck_klondike' : v === 'spider' ? 'stuck_spider' : 'stuck_other')}</p>
    <div class="list">
      ${solverHints() && history.length && (store.premium || Ads.can('STUCK_RESCUE')) ? `<button class="btn" data-m="rescue">${t(store.premium ? 'rescue' : 'rescue_ad')} <small>${t('rescue_sub')}</small></button>` : ''}
      ${undoLeft() > 0 ? `<button class="btn" data-m="back">${t('stuck_back')} <small>${mode === 'daily' ? t('undos_left', { n: undoLeft() }) : t('few_moves_back')}</small></button>` : ''}
      <button class="btn" data-m="restart">${t('restart')} <small>${t('same_deal')}</small></button>
    </div>
    <div class="row"><button class="btn" data-m="close">${t('keep_looking')}</button><button class="btn primary" data-m="new" data-ncq-main="New Game">${t('new_game')}</button></div>
  `, async (act) => {
    hideModal();
    if (act === 'back') {
      while (history.length && isStuck(state)) state = history.pop();
      gameUndos += 1;
      stuckShown = false;
      Sound.play('undo');
      render();
      persist();
    } else if (act === 'rescue') {
      await stuckRescue();
    } else if (act === 'restart') restartSame();
    else if (act === 'new') {
      await Ads.gameEnd('stuck', { played: store.stats.played });
      startGame();
    }
  });
}

// 막혔을 때 길 찾기: 지나온 판을 거꾸로 살펴 끝까지 풀리는 가장 가까운 갈림길을 찾아요.
// 찾은 뒤에만 광고를 보여 줘요 (못 찾으면 광고를 보게 하지 않아요). 프리셀·스파이더 1무늬만
function findRescue() {
  const end = performance.now() + 2500;
  for (let i = history.length - 1, n = 0; i >= 0 && n < 80 && performance.now() < end; i--, n++) {
    if (isStuck(history[i])) continue;
    if (hintFor(history[i], { maxNodes: 5000, maxMs: Math.min(220, end - performance.now()) })) return i;
  }
  return -1;
}
async function stuckRescue() {
  toast(t('rescue_finding'));
  await new Promise((r) => setTimeout(r, 60)); // 안내 문구가 먼저 보이게
  const i = findRescue();
  if (i < 0) {
    Analytics.track('stuck_rescue', { found: 0 });
    showModal(`
      <h2>${t('rescue_none_title')}</h2>
      <p class="sub">${t('rescue_none_sub')}</p>
      <div class="row"><button class="btn" data-m="restart">${t('from_start')}</button><button class="btn primary" data-m="new" data-ncq-main="New Game">${t('new_game')}</button></div>
    `, (act) => { hideModal(); if (act === 'restart') restartSame(); else if (act === 'new') startGame(); });
    return;
  }
  if (!store.premium && !(await Ads.stuckRescue())) return toast(t('ad_failed'));
  const back = history.length - i;
  state = history[i];
  history = history.slice(0, i);
  gameUndos += 1;
  stuckShown = false;
  Analytics.track('stuck_rescue', { found: 1, back });
  Sound.play('undo');
  render();
  persist();
  toast(t('rescue_done', { n: back }));
  const h = hintFor(state, { maxMs: 250 });
  if (h) setTimeout(() => { showHintMove(h); clearTimeout(hintTimer); hintTimer = setTimeout(clearHint, 3200); }, 450);
}

function restartSame() {
  if (!history.length) return;
  state = history[0];
  history = [];
  elapsed = 0;
  finished = false;
  stuckShown = false;
  NcqMetrics.levelStart(roundName()); // 판 지표: 같은 판을 처음부터 (앞 판은 그만둔 판으로 세요)
  render();
  persist();
}

// 판 지표(NcqMetrics)의 판 이름: 게임 종류마다 (오늘의 도전은 daily). 관리자 페이지 지표의 '판' 카드에 이 이름으로 쌓여요
function roundName() {
  if (mode === 'daily') return 'daily';
  const v = variantOf(state);
  if (v === 'spider') return `spider-${state.suits || 1}suit`;
  if (v === 'freecell') return 'freecell';
  return `classic-draw${state.drawCount === 3 ? 3 : 1}`;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// 목록에서 최근에 안 한 판을 골라요 (한 바퀴 돌면 다시 처음부터)
function pickFresh(list, tag) {
  if (!list.length) return null;
  const used = (store.usedSeeds[tag] = (store.usedSeeds[tag] || []).filter((x) => list.includes(x)));
  let left = list.filter((x) => !used.includes(x));
  if (!left.length) { used.length = 0; left = list; }
  const sd = pick(left);
  used.push(sd);
  return sd;
}

function startGame({ daily = false, date = null, drawCount, variant, suits } = {}) {
  hideHome();
  restoreWinCards();
  if (state && !finished && state.moves > 0) recordLoss();
  mode = daily ? 'daily' : 'classic';
  dailyDate = daily ? (date || todayStr()) : null;
  // 오늘의 도전은 늘 클래식 1장씩
  const v = daily ? 'klondike' : (variant || store.settings.variant || 'klondike');
  const sp = Number(suits || store.settings.spiderSuits || 1);
  // 난이도 계단 (클래식만): 처음 하는 사람의 1판째는 쉬움, 2~3판째는 보통 (모두 힌트만 따라가도 풀리는 판, 1장 뽑기)
  const n = store.stats.played;
  const tier = daily || v !== 'klondike' ? null : n === 0 ? 'easy' : n <= 2 ? 'normal' : null;
  const dc = daily || tier ? 1 : (drawCount ?? store.settings.drawCount);
  const rand = `${Date.now()}-${Math.random()}`;
  // '이길 수 있는 판만'을 켜면 힌트만 따라가도 풀리는 판을 골라요 (클래식, 스파이더 1무늬. 프리셀은 거의 모든 판이 풀려요)
  const winnable = store.settings.winnable !== false;
  let seed = rand;
  if (daily) seed = findSolvableSeed(dailySeed(dailyDate, 1)); // 오늘의 도전은 반드시 풀리는 판 (모두에게 같은 결과)
  else if (tier === 'easy') seed = pick(EASY_SEEDS);
  else if (tier === 'normal') seed = pick(NORMAL_SEEDS);
  else if (winnable && v === 'klondike') seed = findSolvableSeed(rand, { drawCount: dc, maxRecycles: dc === 3 ? 6 : 3, tries: dc === 3 ? 900 : 300 });
  else if (winnable && v === 'spider' && sp === 1) seed = findSolvableSeed(rand, { variant: 'spider', suits: 1, tries: 30 });
  else if (winnable && v === 'spider') seed = pickFresh(SPIDER_SEEDS[sp] || [], `sp${sp}`) || rand; // 2·4무늬는 미리 풀어 본 판 목록에서
  else if (winnable && v === 'freecell') seed = pickFresh(FREECELL_SEEDS, 'fc') || rand; // 미리 풀어 본 300판에서 (시작할 때 풀어 보지 않아 바로 시작)
  state = v === 'klondike' ? VARIANTS.klondike.newGame({ seed, drawCount: dc }) : VARIANTS[v].newGame({ seed, suits: sp });
  layout();
  stuckShown = false;
  gameHints = 0;
  gameUndos = 0;
  undoBonus = 0;
  Analytics.track('game_start', { mode, variant: v, tier: tier || 'random', draw: dc, ...(v === 'spider' ? { suits: sp } : {}), ...(daily ? { date: dailyDate } : {}) });
  NcqMetrics.levelStart(roundName()); // 판 지표: 새 판 시작
  const pr = Progress.onStart(store.progress, todayStr());
  setTimeout(() => announceProgress(pr), 1400);
  if (tier === 'easy') setTimeout(() => toast(t('welcome_easy')), 900);
  if (daily) setTimeout(() => toast(t('daily_undo_limit', { n: UNDO.dailyLimit })), 900);
  history = [];
  elapsed = 0;
  timerOn = false;
  finished = false;
  autoRunning = false;
  clearHint();
  // 모든 카드를 덱 자리에 모은 뒤 나눠 주는 연출
  allCards(state).forEach(ensureCard);
  for (const el of cardEls.values()) {
    el.classList.add('no-anim');
    el.classList.remove('up');
    el.style.transform = `translate(${L.stockX}px, ${L.y0}px)`;
    el._pos = { x: L.stockX, y: L.y0 };
  }
  board.offsetHeight; // 강제 리플로우
  for (const el of cardEls.values()) el.classList.remove('no-anim');
  render({ deal: !store.settings.calm, instant: !!store.settings.calm });
  Sound.play('deal');
  setTimeout(() => cardEls.forEach((el) => { el.style.transitionDelay = ''; }), 1200);
  persist();
  setTimeout(warmHint, 1300); // 카드를 다 나눈 뒤에
}

function recordLoss() {
  Analytics.track('game_end', { result: 'abandon', mode, time: elapsed, moves: state.moves, hints: gameHints, undos: gameUndos });
  store.stats.played += 1;
  store.stats.streak = 0;
  save(store);
}

// 오늘의 도전은 되돌리기 횟수 제한, 일반 판은 무제한
const undoLeft = () => (mode === 'daily' ? Math.max(0, UNDO.dailyLimit + undoBonus - gameUndos) : Infinity);
function renderUndoBadge() {
  const b = $('[data-act="undo"]');
  let badge = b.querySelector('.badge');
  if (!badge) { badge = document.createElement('i'); badge.className = 'badge'; b.appendChild(badge); }
  const left = undoLeft();
  badge.hidden = left === Infinity;
  badge.textContent = String(left);
  badge.classList.toggle('empty', left === 0);
}

// 오늘의 도전 되돌리기를 다 썼을 때: 보상형 광고로 1번 더 (한 판에 UNDO.dailyBonusMax번까지, 광고 제거 구매자는 광고 없이)
const canMoreUndo = () => mode === 'daily' && undoBonus < UNDO.dailyBonusMax && (store.premium || Ads.can('DAILY_UNDO'));
function showUndoOut() {
  if (!canMoreUndo()) return toast(t('daily_undo_limit', { n: UNDO.dailyLimit + undoBonus }));
  showModal(`
    <h2>${t('undo_out_title')}</h2>
    <p class="sub">${t('undo_out_sub', { n: UNDO.dailyLimit })}</p>
    <div class="cta">
      <button class="btn primary big" data-m="more" data-ncq-main="One More Undo">${t(store.premium ? 'undo_more' : 'undo_more_ad')}</button>
      <button class="btn" data-m="close">${t('no_thanks')}</button>
    </div>
  `, async (act) => {
    hideModal();
    if (act !== 'more') return;
    if (store.premium || await Ads.dailyUndo()) {
      undoBonus += 1;
      Analytics.track('daily_undo_bonus', { n: undoBonus });
      renderUndoBadge();
      undo();
    } else toast(t('ad_failed'));
  });
}

function undo() {
  if (!history.length || finished || autoRunning) return;
  if (undoLeft() <= 0) {
    Sound.play('invalid');
    return showUndoOut();
  }
  state = history.pop();
  gameUndos += 1;
  Sound.play('undo');
  clearHint();
  render();
  persist();
  warmHint();
}

// ---------- 힌트 개수 (하루 무료 + 보상형 광고로 추가, 광고 제거 구매자는 무제한) ----------
const hintsLimited = () => !store.premium && NcqAds.can('HINT');
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
    <h2>${t('hints_out_title')}</h2>
    <p class="sub">${t('hints_out_sub', { n: HINTS.freePerDay })}</p>
    <div class="cta">
      <button class="btn primary big" data-m="reward" data-ncq-main="Get Hints">${t('hints_reward', { n: HINTS.perReward })}</button>
      ${NcqIap.can('REMOVE_ADS') ? `<button class="btn gold-soft" data-m="buy">${t('hints_buy')}</button>` : ''}
      <button class="btn" data-m="close">${t('close')}</button>
    </div>
  `, async (act) => {
    if (act === 'reward') {
      hideModal();
      if (await Ads.hint()) {
        hintsLeft();
        store.hints.bonus += HINTS.perReward;
        save(store);
        Analytics.track('hint_rewarded', { amount: HINTS.perReward });
        renderHintBadge();
        toast(t('hints_got', { n: HINTS.perReward }));
        hint();
      } else toast(t('ad_failed'));
    } else if (act === 'buy') showRemoveAds();
    else hideModal();
  });
}

async function hint() {
  if (finished || autoRunning) return;
  // 프리셀·스파이더는 끝까지 푸는 길을 먼저 찾아 그 첫 수를 알려 줘요 (못 찾으면 간단한 힌트)
  const h = (solverHints() && hintFor(state, { maxMs: 250 })) || R().findHint(state);
  if (!h) return toast(t('no_moves'));
  if (hintsLeft() <= 0) return showHintsOut();
  useHint();
  renderHintBadge();
  gameHints += 1;
  showHintMove(h);
}

// 힌트 수 하나를 화면에 표시 (옮길 카드와 놓을 자리를 노랗게)
function showHintMove(h) {
  clearHint();
  Sound.play('hint');
  if (h.draw) {
    $('#stock-slot')?.classList.add('glow');
    const top = state.stock[state.stock.length - 1];
    if (top) cardEls.get(top.id).classList.add('hint');
    toast(t(variantOf(state) === 'spider' ? 'hint_deal' : state.stock.length ? 'hint_draw' : 'hint_recycle'));
  } else {
    const cards = R().getMovingCards(state, h.from);
    cards.forEach((c) => cardEls.get(c.id).classList.add('hint'));
    const sel = h.to.type === 'foundation' ? `.found-slot[data-f="${h.to.index}"]` : h.to.type === 'cell' ? `.cell-slot[data-c="${h.to.index}"]` : `.tab-slot[data-t="${h.to.index}"]`;
    const target = h.to.type === 'foundation' ? state.foundations[h.to.index]
      : h.to.type === 'cell' ? (state.cells[h.to.index] ? [state.cells[h.to.index]] : []) : state.tableau[h.to.index];
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
  while (!R().isWon(state)) {
    const n = R().autoCompleteStep(state);
    if (!n) break;
    const f = n.foundations.find((p, i) => p.length > state.foundations[i].length);
    Sound.play('foundation', f ? f[f.length - 1].r : 1);
    if (state.moves % 2 === 0) haptic('tick'); // 자동 완성: 두 장에 한 번 톡
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
  // 점수: 클래식·프리셀은 시간 보너스를 더해요
  const v = variantOf(state);
  const finalScore = (state.score || 0) + (v === 'spider' ? 0 : timeBonus(elapsed));
  Analytics.track('game_end', { result: 'win', mode, variant: v, time: elapsed, moves: state.moves, score: finalScore, hints: gameHints, undos: gameUndos, draw: state.drawCount });
  // 판 지표: 이긴 판. 솔리테어는 지는 끝이 없어서(막혀도 되돌릴 수 있어요) 끝내지 않은 판은 '그만둔 판'으로 세요
  NcqMetrics.levelEnd(roundName(), true, { score: finalScore });
  if (mode === 'daily') Analytics.track('daily_complete', { date: dailyDate, late: dailyDate < todayStr() ? 1 : 0 });
  const s = store.stats;
  const noUndo = gameUndos === 0;
  if (noUndo) s.noUndoWins = (s.noUndoWins || 0) + 1;
  s.played += 1;
  s.won += 1;
  s.streak += 1;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  // 최고 기록은 게임 종류별로 따로 (클래식 1장·3장, 스파이더 무늬 수, 프리셀)
  const mk = modeKey(state);
  const best = (s.best[mk] = s.best[mk] || { time: null, score: 0, won: 0 });
  best.won += 1;
  const prevBest = best.time;
  const newBestTime = prevBest === null || elapsed < prevBest;
  if (newBestTime) best.time = elapsed;
  const newBestScore = finalScore > (best.score || 0);
  if (newBestScore) best.score = finalScore;
  if (s.bestTime === null || elapsed < s.bestTime) s.bestTime = elapsed;
  if (s.bestMoves === null || state.moves < s.bestMoves) s.bestMoves = state.moves;
  // 경험치·오늘의 할 일
  const pr = Progress.onWin(store.progress, todayStr(), { variant: v, suits: state.suits, drawCount: state.drawCount, daily: mode === 'daily', undos: gameUndos, hints: gameHints, time: elapsed });
  const lv = Progress.levelInfo(store.progress.xp);
  const today = todayStr();
  if (mode === 'daily') {
    const rec = store.daily[dailyDate];
    // 더 좋은 기록만 남겨요: 되돌리기를 덜 쓴 판, 같으면 더 빠른 판
    const better = !rec || rec.saved || gameUndos < (rec.undos ?? Infinity) || (gameUndos === (rec.undos ?? Infinity) && elapsed < rec.time);
    if (better) {
      store.daily[dailyDate] = { time: elapsed, moves: state.moves, undos: gameUndos, ...(dailyDate < today && !(rec && !rec.late) ? { late: true } : {}) };
    }
  }
  persist();
  render();
  const calm = reduceMotion();
  const big = newBestScore || noUndo || mode === 'daily' || !!pr.levelUp;
  celebrate({ big, sub: [fmtTime(elapsed), noUndo ? t('no_undo') : ''].filter(Boolean).join(' · ') });
  // 경험치 막대는 이번 판 전 자리에서 채워져요 (레벨이 오르면 0부터)
  const xpFrom = pr.levelUp ? 0 : Progress.levelInfo(Math.max(0, store.progress.xp - pr.xp)).pct;
  const xpTo = pr.levelUp ? 100 : lv.pct; // 레벨이 오르면 막대를 끝까지 채워요 (새 레벨 0%로 비어 보이지 않게)
  setTimeout(() => {
    if (!finished) return; // 그 사이 새 판을 시작했으면 결과 창은 띄우지 않아요
    showModal(`
      <div class="win-badge"><svg viewBox="0 0 72 72"><defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcc00"/><stop offset="1" stop-color="#ff9500"/></linearGradient></defs><path fill="url(#wg)" d="M36 4l7.6 5.5 9.4-.1 2.9 8.9 7.6 5.6-2.9 8.9 2.9 8.9-7.6 5.6-2.9 8.9-9.4-.1L36 68l-7.6-5.5-9.4.1-2.9-8.9-7.6-5.6 2.9-8.9-2.9-8.9 7.6-5.6 2.9-8.9 9.4.1z"/><path d="M24 36.5l8 8 16-17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2 class="center">${t(mode === 'daily' ? 'win_daily' : 'win_title')}</h2>
      <p class="sub center">${[fmtTime(elapsed), t('moves', { n: state.moves }), noUndo ? '' : t('undo_count', { n: gameUndos })].filter(Boolean).join(' · ')}</p>
      <div class="score-line"><span>${t('score')}</span><b id="win-score">${calm ? num(finalScore) : '0'}</b>${newBestScore ? `<em class="pop">${t('high_score_pop')}</em>` : ''}</div>
      ${noUndo ? `<div class="no-undo"><svg viewBox="0 0 24 24"><path class="fill" d="M12 2l2.9 6.2 6.8.8-5 4.6 1.4 6.7L12 16.9 5.9 20.3l1.4-6.7-5-4.6 6.8-.8Z"/></svg>${t('no_undo_clear')}<small>${t('no_undo_count', { n: s.noUndoWins })}</small></div>` : ''}
      <div class="result-note ${newBestTime && mode !== 'daily' ? 'best' : ''}">${
  mode === 'daily' ? t('result_daily', { streak: dailyStreak(), month: monthDone(today.slice(0, 7)) })
    : newBestTime ? (prevBest === null ? t('first_record') : t('new_best', { time: fmtTime(prevBest - elapsed) }))
      : t('best_gap', { best: fmtTime(prevBest), sec: elapsed - prevBest })}</div>
      <div class="xp-box">
        <div class="xp-head"><b>${t('lv_title', { level: lv.level, title: lv.title })}</b><span>${t('xp_gain', { xp: pr.xp })}</span></div>
        <div class="bar"><i id="win-xp" style="width:${calm ? xpTo : xpFrom}%"></i></div>
        ${pr.missions.length ? `<p class="xp-note">${[t('missions_done', { list: pr.missions.map(Progress.missionText).join(', ') }), pr.allDone ? t('missions_all') : ''].filter(Boolean).join(' · ')}</p>` : ''}
        ${pr.levelUp ? `<p class="xp-note up">${[t('level_up', { n: pr.levelUp }), pr.unlocked.length ? t('new_rewards', { list: pr.unlocked.map(unlockName).join(', ') }) : ''].filter(Boolean).join(' ')}</p>` : ''}
      </div>
      <div class="stats">
        <div><b>${num(s.won)}</b><span>${t('wins')}</span></div>
        <div><b>${s.played ? Math.round((s.won / s.played) * 100) : 0}%</b><span>${t('win_rate')}</span></div>
        <div><b>${num(s.streak)}</b><span>${t('streak')}</span></div>
      </div>
      <div class="cta">
        <button class="btn primary big" data-m="new" data-ncq-main="New Game">${t('new_game')}</button>
        ${mode === 'daily' ? `<button class="btn" data-m="daily">${t('view_calendar')}</button>`
    : !store.daily[today] ? `<button class="btn gold-soft" data-m="daily">${t('go_daily')}</button>` : ''}
      </div>
    `, async (act) => {
      hideModal();
      if (act === 'new') {
        await Ads.gameEnd('win', { played: store.stats.played });
        startGame();
      } else if (act === 'daily') showDaily();
    });
    if (!calm) winCountUp(finalScore, xpTo, newBestScore || !!pr.levelUp);
  }, calm ? 1200 : 2700);
}

// 느린 휴대폰: 코어 4개 이하이거나 메모리 3GB 이하 — 클리어 연출을 가볍게
const lowEnd = () => (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
const reduceMotion = () => !!store.settings.calm || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 결과 창: 점수가 0부터 올라가고(살짝 톡톡 진동), 경험치 막대가 채워져요. 최고 점수·레벨 업이면 마지막에 축하 진동
function winCountUp(to, xpPct, special) {
  const el = $('#win-score');
  if (!el) return;
  const t0 = performance.now();
  const dur = 900;
  let lastTick = 0;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    el.textContent = num(Math.round(to * e));
    if (now - lastTick > 110 && k < 1) { lastTick = now; Haptics.play('tick'); }
    if (k < 1 && document.body.contains(el)) requestAnimationFrame(step);
    else if (special) { Haptics.play('confetti'); document.querySelector('.score-line em')?.classList.add('on'); }
  })(t0);
  setTimeout(() => { const bar = $('#win-xp'); if (bar) bar.style.width = `${xpPct}%`; }, 250);
}

// 클리어 연출 (약 2.7초)
// 1) 팡파르 + '딱' 진동 + 위 칸 카드가 차례로 통통  2) '클리어!' 배너
// 3) 위 칸 카드가 하나씩 튀어 올라 화면 아래로 쏟아짐(톡톡 진동)  4) 불꽃놀이(터질 때마다 진동) + 꽃가루
// 움직임 줄이기·동작 줄이기 설정이면 배너와 진동만 (카드·불꽃은 움직이지 않아요)
let winAnims = [];
function restoreWinCards() {
  if (!winAnims.length) return;
  winAnims.forEach((a) => a.cancel());
  winAnims = [];
}

function celebrate({ big = false, sub = '' } = {}) {
  const calm = reduceMotion();
  Sound.play('win');
  haptic('success');
  stopPrefetch();
  if (!calm) {
    // 맨 위 카드 통통: 모두 떼었다가 한 번만 다시 그린 뒤 한꺼번에 붙여요 (카드마다 다시 그리면 느린 폰에서 멈칫해요)
    const tops = state.foundations.map((p) => p[p.length - 1]).filter(Boolean).map((c) => cardEls.get(c.id));
    tops.forEach((el, f) => { el.classList.remove('hop'); el.style.animationDelay = `${f * 90}ms`; });
    void board.offsetWidth;
    tops.forEach((el) => el.classList.add('hop'));
    setTimeout(() => tops.forEach((el) => { el.classList.remove('hop'); el.style.animationDelay = ''; }), 1400);
  }
  const banner = document.createElement('div');
  banner.className = `clear-banner${big ? ' big' : ''}`;
  banner.innerHTML = `<span class="ring"></span><span class="ring r2"></span>${big ? '<span class="ring r3"></span>' : ''}<div class="cb-text"><b>${t(mode === 'daily' ? 'win_daily' : 'win_title')}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), calm ? 1300 : 2500);
  if (calm) return;
  setTimeout(cardFountain, 700);
  fireworks(big);
  confetti(big);
}

// 위 칸 카드 분수: 맨 위 카드부터 하나씩 튀어 올랐다가 중력처럼 아래로 떨어져요
function cardFountain() {
  if (!finished || !L) return; // 그 사이 새 판을 시작했으면 그만
  const W = board.clientWidth;
  const H = window.innerHeight;
  const piles = state.foundations.map((p) => p.slice().reverse());
  // 느린 휴대폰은 날리는 카드 수를 줄여요 (나머지는 위 칸에 그대로)
  const total = Math.min(piles.reduce((n, p) => n + p.length, 0), lowEnd() ? 36 : 104);
  const gap = Math.min(24, 1500 / Math.max(1, total)); // 스파이더 104장도 1.5초 안에
  const t0 = performance.now();
  const launched = [];
  let order = 0;
  const longest = Math.max(0, ...piles.map((p) => p.length));
  for (let i = 0; i < longest; i++) {
    piles.forEach((p) => {
      const c = p[i];
      const el = c && cardEls.get(c.id);
      if (!el || !el._pos || order >= total) return;
      el.classList.remove('hop');
      const { x, y } = el._pos;
      const tx = Math.random() * (W - L.cw); // 화면 어디로든 떨어져요
      const up = L.ch * (0.6 + Math.random() * 1.4);
      const rot = (Math.random() * 2 - 1) * 320;
      const delay = order * gap;
      el.style.zIndex = 4000 + order;
      const a = el.animate([
        { transform: `translate(${x}px, ${y}px) rotate(0deg)`, easing: 'cubic-bezier(.2,.7,.4,1)' },
        { transform: `translate(${x + (tx - x) * 0.35}px, ${y - up}px) rotate(${rot * 0.3}deg)`, offset: 0.3, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: `translate(${tx}px, ${H + L.ch}px) rotate(${rot}deg)` },
      ], { duration: 1150 + Math.random() * 450, delay, fill: 'forwards' });
      el.classList.add('flying');
      a.finished.then(() => el.classList.remove('flying')).catch(() => el.classList.remove('flying'));
      winAnims.push(a);
      launched.push({ a, el, delay });
      if (order % 5 === 0) setTimeout(() => finished && haptic('tick'), delay);
      order += 1;
    });
  }
  // 화면이 버벅이면(한 장면이 60ms 넘게 3번) 아직 출발하지 않은 카드는 날리지 않아요
  let slow = 0;
  let last = t0;
  (function watch(t) {
    if (t - last > 60) slow += 1;
    last = t;
    if (slow >= 3) {
      launched.forEach(({ a, el, delay }) => { if (t - t0 < delay) { a.cancel(); el.classList.remove('flying'); } });
      return;
    }
    if (t - t0 < 1600 && finished) requestAnimationFrame(watch);
  })(t0);
}

function fireworks(big = false) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const cv = document.createElement('canvas');
  cv.className = 'fireworks';
  const dpr = 1; // 불꽃은 흐릿한 빛이라 화면 배율을 낮춰도 같아 보여요 (그리는 양이 4~6배 줄어요)
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#007aff', '#af52de', '#ffffff'];
  const parts = [];
  const bursts = big ? [0, 260, 520, 800, 1080, 1360, 1650, 1950] : [0, 280, 560, 900, 1250, 1600];
  bursts.forEach((ms, i) => setTimeout(() => {
    const x = W * (0.2 + Math.random() * 0.6);
    const y = H * (0.15 + Math.random() * 0.3);
    const c1 = colors[(i * 3) % colors.length];
    const c2 = colors[(i * 3 + 4) % colors.length];
    const n = lowEnd() ? 40 : 64;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
      const sp = 2.2 + Math.random() * 3.2;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: k % 3 ? c1 : c2, r: 1.6 + Math.random() * 1.6 });
    }
    Sound.play('pop');
    if (i > 0) haptic('burst'); // 첫 불꽃은 클리어 진동과 겹치지 않게
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
      g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); // 작은 점은 네모로 그려도 똑같이 보이고 훨씬 빨라요
    }
    g.globalAlpha = 1;
    if (now - t0 < 3600) requestAnimationFrame(frame);
    else cv.remove();
  })(t0);
}

function confetti(big = false) {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  const n = Math.round((big ? 120 : 70) * (lowEnd() ? 0.5 : 1));
  const gold = ['#ffcc00', '#ffb800', '#ffe066'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = big && i % 3 === 0 ? gold[i % gold.length] : colors[i % colors.length];
    p.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

// ---------- 진행: 할 일 완료·레벨 업 알림 ----------
function unlockName(u) {
  if (u.kind === 'table') return t('unlock_table', { name: t(`table_${u.id}`) });
  return t('unlock_back', { name: t(`back_${u.id}`) });
}
function announceProgress(pr) {
  if (!pr) return;
  save(store);
  if (pr.levelUp) { toast(t('toast_level', { n: pr.levelUp, title: Progress.titleFor(pr.levelUp) })); Sound.play('hint'); return; }
  if (pr.missions.length) { toast(t('toast_mission', { text: Progress.missionText(pr.missions[0]), xp: Progress.XP.mission })); Sound.play('hint'); }
}
const myLevel = () => Progress.levelInfo(store.progress.xp).level;
// 테마가 열렸는지: 레벨 보상이 생기기 전부터 하던 사람은 원래 쓰던 테마가 모두 열려 있어요
const themeOpen = (kind, id) => !!store.legacyThemes || Progress.isUnlocked(kind, id, myLevel());

// ---------- 팝업 ----------
let modalHandler = null;
// noMain: 메인 버튼이 따로 없는 창(설정 목록처럼)이면 창에 '메인 버튼 없음' 표시 (화면 시험·빌드 확인용)
function showModal(html, handler, { noMain = false } = {}) {
  const body = $('#modal-body');
  const foot = $('#modal-foot');
  body.innerHTML = html;
  foot.textContent = '';
  // 메인 버튼(data-ncq-main)이 든 맨 아래 버튼 줄은 창 아래(#modal-foot)로 옮겨요: 내용이 길면 내용만 스크롤되고 메인 버튼은 늘 보여요
  const main = body.querySelector('[data-ncq-main]');
  const row = main && main.closest('.row, .cta');
  if (row && row.parentElement === body) foot.appendChild(row);
  $('#modal .sheet').toggleAttribute('data-ncq-no-main', noMain);
  modalHandler = handler;
  $('#modal').hidden = false;
  body.scrollTop = 0; // 앞 창에서 내려 본 자리가 남지 않게 늘 맨 위부터
}
function hideModal() {
  $('#modal').hidden = true;
  modalHandler = null;
  restoreWinCards(); // 클리어 연출로 날아간 카드를 제자리에
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') return hideModal();
  const b = e.target.closest('[data-m]');
  if (b && modalHandler) modalHandler(b.dataset.m, b);
});

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// 새 게임: 게임 종류(클래식·스파이더·프리셀)와 옵션 고르기
const GAME_IDS = ['klondike', 'spider', 'freecell'];
function showNewGameMenu() {
  const st = store.settings;
  const v = st.variant || 'klondike';
  const opt = v === 'klondike'
    ? `<p class="group-label">${t('draw_question')}</p>
       <div class="seg"><button data-m="dc:1" class="${st.drawCount !== 3 ? 'on' : ''}">${t('draw_1')}</button><button data-m="dc:3" class="${st.drawCount === 3 ? 'on' : ''}">${t('draw_3')}</button></div>`
    : v === 'spider'
      ? `<p class="group-label">${t('suits_question')}</p>
       <div class="seg">${[1, 2, 4].map((n) => `<button data-m="suits:${n}" class="${(st.spiderSuits || 1) === n ? 'on' : ''}">${t(`suits_${n}`)}</button>`).join('')}</div>`
      : `<p class="sub">${t('freecell_note')}</p>`;
  showModal(`
    <h2>${t('new_game')}</h2>
    <div class="mode-pick">${GAME_IDS.map((id) => `<button data-m="v:${id}" class="${v === id ? 'on' : ''}"><b>${variantName(id)}</b><small>${t(`desc_${id}`)}</small></button>`).join('')}</div>
    ${opt}
    <div class="list"><button class="toggle" data-m="winnable" role="switch" aria-checked="${st.winnable !== false}">${t('winnable')}<span class="switch${st.winnable !== false ? ' on' : ''}"></span></button></div>
    <div class="row"><button class="btn" data-m="close">${t('cancel')}</button><button class="btn primary" data-m="start" data-ncq-main="Start">${t('start')}</button></div>
  `, (act, btn) => {
    if (act.startsWith('v:')) { st.variant = act.slice(2); save(store); Sound.play('tap'); return showNewGameMenu(); }
    if (act.startsWith('dc:')) { st.drawCount = Number(act.slice(3)); save(store); return showNewGameMenu(); }
    if (act.startsWith('suits:')) { st.spiderSuits = Number(act.slice(6)); save(store); return showNewGameMenu(); }
    if (act === 'winnable') {
      st.winnable = st.winnable === false;
      save(store);
      btn.querySelector('.switch').classList.toggle('on', st.winnable);
      return;
    }
    if (act === 'start') {
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
  // 요일 머리글: 2024-01-07이 일요일 (일 월 화 … / S M T …)
  let cells = [0, 1, 2, 3, 4, 5, 6].map((i) => `<div class="dow">${NcqLang.date(new Date(2024, 0, 7 + i), { weekday: 'narrow' })}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="d blank"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${calMonth}-${String(d).padStart(2, '0')}`;
    const r = store.daily[ds];
    const cls = ['d', r && !r.saved ? (r.late ? 'done late' : 'done') : '', r?.saved ? 'saved' : '',
      ds === today ? 'today' : '', ds > today ? 'future' : '', ds === calSel ? 'sel' : ''].filter(Boolean).join(' ');
    cells += ds > today ? `<div class="${cls}">${d}</div>`
      : `<button class="${cls}" data-m="day:${ds}" aria-label="${r ? t('day_cleared', { date: dayText(ds) }) : dayText(ds)}">${r && !r.saved ? '✓' : d}</button>`;
  }
  const done = monthDone(calMonth);
  const streak = dailyStreak();
  const selRec = store.daily[calSel];
  const selToday = calSel === today;
  Progress.rollDay(store.progress, today);
  const todo = Progress.missionsFor(today);
  const pc = store.progress.counters;
  const lvNow = Progress.levelInfo(store.progress.xp);
  const undoText = (u) => (u === 0 ? t('undo_none_b') : u == null ? t('undo_unknown') : t('undo_count', { n: u }));
  showModal(`
    <h2>${t('today_tasks')}</h2>
    <div class="todo">${todo.map((id) => {
    const ms = Progress.MISSIONS[id];
    const did = store.progress.done.includes(id);
    const n = Math.min(ms.target, pc[ms.counter] || 0);
    return `<div class="todo-row${did ? ' done' : ''}"><i>${did ? '✓' : ''}</i><span>${Progress.missionText(id)}</span><small>${did ? `+${Progress.XP.mission}` : `${n}/${ms.target}`}</small></div>`;
  }).join('')}
      <div class="todo-foot">${t('tasks_foot', { level: lvNow.level, title: lvNow.title, xp: Progress.XP.allMissions })}</div>
    </div>
    <h2 class="h2-sub">${t('daily')}</h2>
    <p class="sub">${t('daily_sub')}</p>
    <div class="chips">
      <span class="chip fire"><svg viewBox="0 0 24 24"><path class="fill" d="M12 2c1 3.5 5 5.6 5 10.5A5 5 0 0 1 7 13c0-2 .8-3.4 2-4.5.2 1.6 1 2.6 2 3 0-3.6-.6-6.3 1-9.5Z"/></svg>${t('streak_chip', { n: streak })}</span>
      <span class="chip trophy"><svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/></svg>${t('trophies', { n: trophies() })}</span>
    </div>
    ${canSaveStreak() && (store.premium || NcqAds.can('STREAK')) ? `<button class="save-streak" data-m="save"><b>${t('missed_yesterday')}</b><span>${t('save_streak')}</span></button>` : ''}
    <div class="cal-head"><button data-m="prev" aria-label="${t('prev_month')}"><svg><use href="#i-chevron-l"/></svg></button><span>${NcqLang.date(new Date(y, m - 1, 1), { year: 'numeric', month: 'long' })}</span><button data-m="next" aria-label="${t('next_month')}"><svg><use href="#i-chevron-r"/></svg></button></div>
    <div class="cal">${cells}</div>
    <div class="month-progress"><div class="bar"><i style="width:${Math.round((done / days) * 100)}%"></i></div><span>${t('month_progress', { done, days })}</span></div>
    ${selRec && !selRec.saved ? `<p class="sel-rec">${t('rec_line', { day: selToday ? t('rec_today') : dayText(calSel), time: fmtTime(selRec.time), moves: t('moves', { n: selRec.moves }), undo: undoText(selRec.undos) })}</p>` : ''}
    <p class="sel-rec rule">${t('daily_undo_rule', { n: UNDO.dailyLimit })}</p>
    <div class="row"><button class="btn" data-m="close">${t('close')}</button><button class="btn gold" data-m="play" data-ncq-main="Play Daily">${selRec && !selRec.saved ? t('replay') : selToday ? t('play_today') : t('play_day', { date: dayText(calSel) })}</button></div>
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
      if (store.premium || await Ads.streak()) {
        store.daily[addDays(todayStr(), -1)] = { saved: true };
        Analytics.track('streak_save', {});
        save(store);
        toast(t('streak_saved'));
      }
      showDaily();
    } else if (act === 'play') {
      hideModal();
      startGame({ daily: true, date: calSel });
    } else hideModal();
  });
}

// ---------- 광고 제거 (인앱 상품, 결제 도구 NcqIap — src/iap.js) ----------
function applyPremium(announce = false) {
  store.premium = true;
  save(store);
  Ads.removed = true;
  Ads.hideBanner();
  $('#ad-banner').classList.add('off');
  layout();
  if (state) render({ instant: true });
  if (announce) toast(t('ads_removed_toast'));
}

// 지급은 여기 한 곳에서만 (NcqIap.onGrant): 새 구매, 앱이 꺼져서 끝나지 않은 구매, 다시 설치한 뒤 되찾은 구매(info.restored)
function grantItem(id) {
  if (id !== 'REMOVE_ADS') return false; // 모르는 상품은 지급하지 않아요 (NcqIap이 구매를 마무리하지 않고 다음에 다시 줘요)
  if (!store.premium) applyPremium(true); // 비소모성: 몇 번 와도 같게 (켜기만). 저장은 applyPremium이 바로 해요
  return true;
}

function showRemoveAds() {
  const price = NcqIap.price('REMOVE_ADS'); // 스토어 가격 글 그대로 (가격은 코드에 적지 않아요)
  showModal(`
    <h2>${t('noads_title')}</h2>
    <p class="sub">${t('noads_sub')}</p>
    <div class="list perks">
      <div class="btn">${t('perk_banner')}</div>
      <div class="btn">${t('perk_between')}</div>
      <div class="btn">${t('perk_hints')}</div>
      <div class="btn">${t('perk_streak')}</div>
    </div>
    <div class="cta">
      <button class="btn primary big" data-m="buy-now" data-ncq-main="Buy">${price ? t('buy_for', { price }) : t('buy')}</button>
      <button class="btn" data-m="close">${t('later')}</button>
    </div>
  `, async (act) => {
    hideModal();
    if (act === 'buy-now') await buyRemoveAds(); // 광고 끄기는 grantItem이, 실패 안내는 NcqIap이 해요 (취소는 조용히)
  });
}

// NCQ_TEST_CHEAT: 바로 이기기 — 모든 카드를 앞면으로 정리해 자동 완성으로 끝내요
function cheatWin() {
  const cards = allCards(state).map((c) => ({ ...c, up: true }));
  history.push(state);
  if (variantOf(state) === 'spider') {
    // 같은 무늬 K~A 8묶음을 모두 걷은 상태로
    const runs = [];
    const pool = cards.slice();
    while (pool.length) {
      const s0 = pool[0].s;
      const run = [];
      for (let r = 13; r >= 1; r--) { const i = pool.findIndex((x) => x.s === s0 && x.r === r); run.push(pool.splice(i, 1)[0]); }
      runs.push(run);
    }
    state = { ...state, stock: [], foundations: runs, tableau: state.tableau.map(() => []) };
    render();
    afterMove();
    return;
  }
  const tableau = state.tableau.map(() => []);
  for (let s0 = 0; s0 < 4; s0++) for (let r = 13; r >= 1; r--) { const c = cards.find((x) => x.s === s0 && x.r === r); if (c) tableau[s0].push(c); }
  state = { ...state, stock: [], waste: [], ...(state.cells ? { cells: [null, null, null, null] } : {}), foundations: [[], [], [], []], tableau };
  render();
  autoComplete();
}

// NCQ_TEST_DEBUG: 이벤트 로그 요약 (잔존·판 수·광고 노출이 잘 쌓이는지 QA)
function showEventLog() {
  const a = Analytics.summary();
  showModal(`
    <h2>${t('log_title')}</h2>
    <p class="sub">${t('log_sub', { date: a.installDate, sessions: a.sessions, days: a.activeDays })}</p>
    <div class="stats">
      <div><b>${a.gameStart}</b><span>${t('log_starts')}</span></div>
      <div><b>${a.wins}/${a.gameEnd}</b><span>${t('log_wins')}</span></div>
      <div><b>${a.adImpressions}</b><span>${t('log_ads')}</span></div>
    </div>
    <div class="list log">${a.recent.map((e) => `<div class="log-row"><b>${e.name}</b><small>${Object.entries(e).filter(([k]) => !['t', 'name', 'v', 'platform'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')}</small></div>`).join('')}</div>
    <div class="row"><button class="btn primary" data-m="close">${t('close')}</button></div>
  `, hideModal, { noMain: true });
}

function showMenu() {
  const s = store.stats;
  const lv = Progress.levelInfo(store.progress.xp);
  const mb = s.best[modeKey(state)] || {};
  const nextUnlock = Object.entries(Progress.UNLOCKS).flatMap(([kind, m]) => Object.entries(m).map(([id, level]) => ({ kind, id, level })))
    .filter((u) => u.level > lv.level).sort((a, b) => a.level - b.level)[0];
  const lockTag = (kind, id) => (themeOpen(kind, id) ? '' : `<em class="lock">${t('lv', { n: Progress.unlockLevel(kind, id) })}</em>`);
  const toggle = (k, label, on) => `<button class="toggle" data-m="${k}" role="switch" aria-checked="${on}">${label}<span class="switch${on ? ' on' : ''}"></span></button>`;
  const item = (m, label, sub, cls = '') => `<button class="btn${cls}" data-m="${m}">${label}${sub ? ` <small>${sub}</small>` : ''}</button>`;
  showModal(`
    <h2>${t('menu')}</h2>
    <div class="xp-box">
      <div class="xp-head"><b>${t('lv_title', { level: lv.level, title: lv.title })}</b><span>${lv.cur}/${lv.need}</span></div>
      <div class="bar"><i style="width:${lv.pct}%"></i></div>
      <p class="xp-note">${store.legacyThemes ? t('themes_all_open') : nextUnlock ? t('next_reward', { level: nextUnlock.level, name: unlockName(nextUnlock) }) : t('all_rewards')}</p>
    </div>
    <p class="sub">${t('my_stats', { mode: modeLabel(state) })}</p>
    <div class="stats">
      <div><b>${num(s.played)}</b><span>${t('played')}</span></div>
      <div><b>${num(s.won)}</b><span>${t('wins')}</span></div>
      <div><b>${s.played ? Math.round((s.won / s.played) * 100) : 0}%</b><span>${t('win_rate')}</span></div>
      <div><b>${mb.time == null ? '-' : fmtTime(mb.time)}</b><span>${t('best_time')}</span></div>
      <div><b>${mb.score ? num(mb.score) : '-'}</b><span>${t('high_score')}</span></div>
      <div><b>${num(s.bestStreak)}</b><span>${t('best_streak')}</span></div>
    </div>
    <p class="group-label lang-label"><svg aria-hidden="true"><use href="#i-globe"/></svg>${t('language')}${NcqLang.lang === 'en' ? '' : ' · Language'}</p>
    <div class="seg lang-pick">${NcqLang.list().map((l) => `<button data-m="lang:${l.code}" lang="${l.code}" class="${l.current ? 'on' : ''}" aria-pressed="${l.current}">${l.name}</button>`).join('')}</div>
    <p class="group-label">${t('sound_group')}</p>
    <div class="list">
      ${toggle('music', t('music'), store.settings.music !== false)}
      ${toggle('sfx', t('sfx'), store.settings.sfx !== false)}
      ${toggle('haptics', t('vibration'), store.settings.haptics !== false)}
    </div>
    <p class="group-label">${t('comfort_group')}</p>
    <div class="list">
      ${toggle('winnable', t('winnable'), store.settings.winnable !== false)}
      ${toggle('lefty', t('lefty'), !!store.settings.lefty)}
      ${toggle('calm', t('calm'), !!store.settings.calm)}
    </div>
    <p class="group-label">${t('card_face')}</p>
    <div class="face-pick">${FACES.map((id) => `<button data-m="face:${id}" class="${(store.settings.face || 'simple') === id ? 'on' : ''}"><span class="minis"><span class="mini red">${id === 'simple' ? simpleFace(1, 12) : faceSVG(1, 12)}</span><span class="mini">${id === 'simple' ? simpleFace(0, 7) : faceSVG(0, 7)}</span></span>${t(`face_${id}`)}</button>`).join('')}</div>
    <p class="group-label">${t('card_back')}</p>
    <div class="back-pick">${BACKS.map((id) => `<button data-m="back:${id}" class="${(store.settings.back || 'blue') === id ? 'on' : ''}${themeOpen('back', id) ? '' : ' locked'}"><span class="mini-back" data-back="${id}"></span>${t(`back_${id}`)}${lockTag('back', id)}</button>`).join('')}</div>
    <p class="group-label">${t('table_color')}</p>
    <div class="swatches">${TABLES.map((tb) => `<button data-m="table:${tb.id}" class="${(store.settings.table || 'classic') === tb.id ? 'on' : ''}${themeOpen('table', tb.id) ? '' : ' locked'}" aria-label="${t(`table_${tb.id}`)}"><i style="background:radial-gradient(circle at 50% 30%, ${tb.top}, ${tb.bottom})"></i>${t(`table_${tb.id}`)}${lockTag('table', tb.id)}</button>`).join('')}</div>
    <div class="list">
      ${item('home', t('go_home'), t('game_saved'))}
      ${item('restart', t('restart'), t('same_deal'))}
      ${item('rules', t('how_to_play'))}
      ${item('backup', t('transfer'), t('to_new_phone'))}
      ${platform() === 'toss' ? '' : item('feedback', t('feedback'), t('feedback_sub'))}
      ${item('reset', t('reset'), t('reset_sub'), ' danger')}
      ${privacyBtn ? item('privacy', t('privacy'), t('privacy_sub')) : ''}
    </div>
    ${store.premium || NcqIap.can('REMOVE_ADS') ? `<p class="group-label">${t('ads_group')}</p>
    <div class="list">
      ${store.premium ? `<div class="btn done-row">${t('ads_removed')} <small>${t('thanks')}</small></div>`
    : item('buy', t('remove_ads'), NcqIap.price('REMOVE_ADS') || t('one_time')) + item('restore', t('restore'), t('restore_sub'))}
    </div>` : ''}
    ${testOn('CHEAT') || testOn('DEBUG') ? `<p class="group-label">${t('test_group')} <small>${t('test_off')}</small></p>
    <div class="list test">
      ${testOn('CHEAT') ? item('cheat-win', t('cheat_win')) + item('cheat-reset', t('reset'), t('cheat_reset_sub')) : ''}
      ${testOn('DEBUG') ? item('debug-log', t('debug_log')) : ''}
    </div>` : ''}
    <div class="row"><button class="btn primary" data-m="close">${t('resume')}</button></div>
    <p class="version">${t('app_name')} ${APP_VERSION === 'dev' ? 'dev' : `v${APP_VERSION}`}</p>
  `, (act, btn) => {
    if (act.startsWith('lang:')) {
      // 언어 바꾸기: 저장하고 바로 바꿔요 (화면은 NcqLang.onChange에서 다시 그려요). 메뉴는 보던 자리 그대로
      const code = act.slice(5);
      if (code === NcqLang.lang || !NcqLang.set(code)) return;
      Analytics.track('setting_change', { key: 'lang', value: code });
      Sound.play('tap');
      const body = $('#modal-body');
      const y = body.scrollTop;
      showMenu();
      body.scrollTop = y;
      return;
    }
    if (act === 'feedback') {
      Analytics.track('feedback_open', {});
      if (FEEDBACK_URL) { hideModal(); openExternal(FEEDBACK_URL); } else toast(t('feedback_soon'));
      return;
    }
    if (act === 'privacy') { hideModal(); NcqAds.showPrivacyOptions(); return; }
    if (act === 'buy') { showRemoveAds(); return; }
    if (act === 'restore') {
      hideModal();
      // 되찾으면 grantItem이 광고를 끄고 알려 줘요. 여기서는 되찾은 게 없을 때·구매 내역을 못 받았을 때만 알려요
      restorePurchases().then((r) => {
        if (!r.ok) toast(t('restore_failed'));
        else if (!store.premium) toast(t('no_restore'));
      });
      return;
    }
    if (act === 'cheat-win') { hideModal(); cheatWin(); return; }
    if (act === 'cheat-reset') {
      try { localStorage.clear(); } catch { /* 무시 */ }
      location.reload();
      return;
    }
    if (act === 'debug-log') { showEventLog(); return; }
    if (act === 'reset') { showResetConfirm(); return; }
    if (act === 'backup') { showBackup(); return; }
    if (act === 'home') { hideModal(); persist(); showHome(); return; }
    if (act === 'winnable' || act === 'lefty' || act === 'calm') {
      const on = act === 'winnable' ? store.settings.winnable === false : !store.settings[act];
      store.settings[act] = on;
      save(store);
      Analytics.track('setting_change', { key: act, value: on ? 1 : 0 });
      btn.querySelector('.switch').classList.toggle('on', on);
      btn.setAttribute('aria-checked', String(on));
      document.documentElement.classList.toggle('calm', !!store.settings.calm);
      if (act === 'lefty') { layout(); render({ instant: true }); }
      return;
    }
    if (act === 'music' || act === 'sfx' || act === 'haptics') {
      const on = store.settings[act] === false;
      store.settings[act] = on;
      save(store);
      Analytics.track('setting_change', { key: act, value: on ? 1 : 0 });
      if (act === 'haptics') { Haptics.setOn(on); if (on) haptic('foundation'); } else if (act === 'music') Sound.setMusic(on);
      else { Sound.setSfx(on); if (on) Sound.play('place'); }
      btn.querySelector('.switch').classList.toggle('on', on);
      btn.setAttribute('aria-checked', String(on));
      return;
    }
    if (act.startsWith('back:') && !themeOpen('back', act.slice(5))) { Sound.play('invalid'); toast(t('unlock_at', { n: Progress.unlockLevel('back', act.slice(5)) })); return; }
    if (act.startsWith('table:') && !themeOpen('table', act.slice(6))) { Sound.play('invalid'); toast(t('unlock_at', { n: Progress.unlockLevel('table', act.slice(6)) })); return; }
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
      showRules();    } else hideModal();
  }, { noMain: true }); // 메뉴는 설정 목록이라 메인 버튼이 없어요
}

// 게임 방법 (지금 하는 게임 종류에 맞춰): 글자 표의 rules_<게임>_1~4 + 모든 게임 공통 두 줄
function showRules() {
  const v = variantOf(state);
  const lines = [1, 2, 3, 4].map((i) => t(`rules_${v}_${i}`)).concat(t('rules_tap'), t('rules_help'));
  showModal(`
    <h2>${t('rules_title', { name: variantName(v) })}</h2>
    <p class="sub" style="line-height:1.65;color:var(--label)">${lines.map((line) => `• ${line}`).join('<br>')}</p>
    <div class="row"><button class="btn primary" data-m="close" data-ncq-main="Got It">${t('got_it')}</button></div>
  `, hideModal);
}

// 기록 옮기기: 서버 없이, 기록을 글자 코드로 만들어 새 기기에 붙여 넣어요 (산 상품은 '구매 복원'으로)
function showBackup(view = 'menu') {
  if (view === 'make') {
    const code = exportCode(store);
    Analytics.track('backup_export', { size: code.length });
    showModal(`
      <h2>${t('backup_title')}</h2>
      <p class="sub">${t('backup_make_sub')}</p>
      <textarea class="code-box" readonly rows="5">${code}</textarea>
      <div class="row"><button class="btn" data-m="close">${t('close')}</button><button class="btn primary" data-m="copy" data-ncq-main="Copy">${t('copy')}</button></div>
    `, async (act) => {
      if (act !== 'copy') return hideModal();
      const box = $('.code-box');
      let ok = false;
      try { await navigator.clipboard.writeText(code); ok = true; } catch { box.select(); try { ok = document.execCommand('copy'); } catch { /* 무시 */ } }
      toast(t(ok ? 'copied' : 'copy_manual'));
    });
    return;
  }
  if (view === 'load') {
    showModal(`
      <h2>${t('enter_code')}</h2>
      <p class="sub">${t('enter_code_sub')}</p>
      <textarea class="code-box" rows="5" placeholder="${t('code_placeholder')}"></textarea>
      <div class="row"><button class="btn" data-m="close">${t('cancel')}</button><button class="btn primary" data-m="apply" data-ncq-main="Import">${t('import')}</button></div>
    `, (act) => {
      if (act !== 'apply') return hideModal();
      const d = importCode($('.code-box').value);
      if (!d) { Sound.play('invalid'); toast(t('bad_code')); return; }
      resetting = true;
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...d, premium: store.premium, current: null })); } catch { /* 무시 */ }
      Analytics.track('backup_import', {});
      location.reload();
    });
    return;
  }
  showModal(`
    <h2>${t('transfer')}</h2>
    <p class="sub">${t('transfer_sub')}</p>
    <div class="list">
      <button class="btn" data-m="make">${t('make_code')} <small>${t('on_this_phone')}</small></button>
      <button class="btn" data-m="load">${t('enter_code')} <small>${t('on_new_phone')}</small></button>
    </div>
    <div class="row"><button class="btn primary" data-m="close">${t('close')}</button></div>
  `, (act) => (act === 'make' || act === 'load' ? showBackup(act) : hideModal()), { noMain: true });
}

// 기록 초기화 (확인 후). 고른 언어는 기록이 아니라 설정이라 남겨요
function showResetConfirm() {
  showModal(`
    <h2>${t('reset_title')}</h2>
    <p class="sub">${t('reset_body')}</p>
    <div class="row"><button class="btn" data-m="close">${t('cancel')}</button><button class="btn danger-fill" data-m="reset-now">${t('erase')}</button></div>
  `, (act) => {
    if (act !== 'reset-now') return hideModal();
    const keepPremium = store.premium;
    resetting = true;
    try {
      ['pocket-solitaire:v1', 'pocket-solitaire:meta', 'pocket-solitaire:events'].forEach((k) => localStorage.removeItem(k));
      if (keepPremium) localStorage.setItem('pocket-solitaire:v1', JSON.stringify({ premium: true })); // 산 상품은 남겨요
    } catch { /* 무시 */ }
    Analytics.track('progress_reset', {});
    location.reload();
  });
}

// ---------- 시작 화면 ----------
// 카드 다섯 장이 부채꼴로 펼쳐지고 천천히 떠 있어요. 카드를 누르면 다시 섞여요 (움직임 줄이기면 멈춰 있어요)
const home = $('#home');
const HOME_CARDS = [[0, 1], [1, 13], [3, 12], [2, 11], [1, 1]]; // A♠ K♥ Q♣ J♦ A♥
function buildHomeCards() {
  const box = home.querySelector('.home-cards');
  box.innerHTML = HOME_CARDS.map(([s0, r], i) => `<div class="hcard ${isRed({ s: s0 }) ? 'red' : 'black'}" style="--i:${i - 2}">${simpleFace(s0, r)}</div>`).join('');
  box.classList.remove('play');
  void box.offsetWidth;
  box.classList.add('play');
}
function renderHome() {
  const today = todayStr();
  Progress.rollDay(store.progress, today);
  const lv = Progress.levelInfo(store.progress.xp);
  const todo = Progress.missionsFor(today);
  const doneN = todo.filter((id) => store.progress.done.includes(id)).length;
  const cont = !!state && !finished;
  const streak = dailyStreak();
  const dailyDone = store.daily[today] && !store.daily[today].saved;
  home.querySelector('#home-rating').innerHTML = `<b>${t(RATING.key)}</b>`;
  home.querySelector('#home-level').innerHTML = `<span>${t('lv_title', { level: lv.level, title: lv.title })}</span><span>${t('home_tasks', { n: doneN })}</span>`;
  home.querySelector('#home-actions').innerHTML = `
    ${cont ? `<button class="btn primary" data-h="continue" data-ncq-main="Continue">${t('continue')}<small>${mode === 'daily' ? t('daily') : modeLabel(state)} · ${fmtTime(elapsed)}</small></button>` : ''}
    <button class="btn${cont ? '' : ' primary'}" data-h="new" data-ncq-main="${cont ? 'New Game' : 'Play'}">${cont ? t('new_game') : t('play')}${cont ? `<small>${t('home_sub')}</small>` : ''}</button>
    <button class="btn gold" data-h="daily" data-ncq-main="Daily Challenge">${t('daily')}<small>${dailyDone ? t('daily_cleared') : streak ? t('streak_nth', { n: streak }) : t('daily_same')}</small></button>`;
}
function showHome() {
  hideModal();
  clearHint();
  renderHome();
  home.hidden = false;
  home.classList.remove('out');
  buildHomeCards();
  Analytics.track('home_view', {});
}
function hideHome() {
  if (home.hidden) return;
  home.classList.add('out');
  setTimeout(() => { if (home.classList.contains('out')) home.hidden = true; }, store.settings.calm ? 0 : 280);
}
home.addEventListener('click', (e) => {
  if (e.target.closest('.home-cards')) { buildHomeCards(); Sound.play('deal'); return; }
  const b = e.target.closest('[data-h]');
  if (!b) return;
  Sound.play('tap');
  const act = b.dataset.h;
  if (act === 'continue') { hideHome(); render({ instant: true }); }
  else if (act === 'new') { if (!state && store.stats.played === 0) startGame(); else showNewGameMenu(); } // 처음 하는 사람은 바로 쉬운 첫 판
  else if (act === 'daily') showDaily();
});

// ---------- 하단 버튼 ----------
document.querySelector('.toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || autoRunning) return;
  ({ new: showNewGameMenu, daily: showDaily, hint, undo, menu: showMenu })[b.dataset.act]?.();
});
$('#auto-btn').addEventListener('click', autoComplete);

// ---------- 터치·마우스 조작 ----------
function locate(id) {
  for (let t = 0; t < state.tableau.length; t++) {
    const i = state.tableau[t].findIndex((c) => c.id === id);
    if (i >= 0) return { type: 'tableau', index: t, cardIndex: i };
  }
  if (state.cells) {
    const c = state.cells.findIndex((x) => x && x.id === id);
    if (c >= 0) return { type: 'cell', index: c };
  }
  if (variantOf(state) !== 'spider') {
    for (let f = 0; f < state.foundations.length; f++) {
      const p = state.foundations[f];
      if (p.length && p[p.length - 1].id === id) return { type: 'foundation', index: f };
    }
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
    if (commit(R().draw(state)) === false) toast(t(variantOf(state) === 'spider' ? 'no_deal' : 'deck_empty'));
    return;
  }
  if (!cardEl) return;
  const from = locate(Number(cardEl.dataset.id));
  if (!from) return;
  const cards = R().getMovingCards(state, from);
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
    const m = R().bestMoveFrom(state, d.from);
    if (!commit(m && R().applyMove(state, m))) {
      // 위에 얹힌 카드까지 한 몸처럼 흔들기
      d.els.forEach((el) => el.classList.remove('shake'));
      void d.els[0].offsetWidth;
      d.els.forEach((el) => el.classList.add('shake'));
      haptic('error');
      Sound.play('invalid');
      render();
    }
    return;
  }
  const target = dropTarget(d);
  if (!target || !commit(R().applyMove(state, { from: d.from, to: target }))) render();
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
  if (variantOf(state) !== 'spider') for (let f = 0; f < 4; f++) cands.push({ to: { type: 'foundation', index: f }, a: overlap(L.foundX(f), y0, cw, ch) });
  if (state.cells) for (let c = 0; c < 4; c++) cands.push({ to: { type: 'cell', index: c }, a: overlap(L.cellX(c), y0, cw, ch) });
  for (let t = 0; t < state.tableau.length; t++) {
    const p = state.tableau[t];
    const topPos = p.length ? lastPos.get(p[p.length - 1].id) : { y: y1 };
    cands.push({ to: { type: 'tableau', index: t }, a: overlap(colX(t), y1, cw, Math.max(topPos.y - y1 + ch, ch, H - y1)) * 0.6 + overlap(colX(t), topPos.y, cw, ch) });
  }
  const legal = cands.filter((c) => c.a > 0 && R().isLegalMove(state, { from: d.from, to: c.to }));
  legal.sort((a, b) => b.a - a.a);
  return legal[0]?.to || null;
}

// ---------- 시간 ----------
setInterval(() => {
  if (timerOn && !finished && !document.hidden && $('#modal').hidden && home.hidden && !adState.playing) {
    elapsed += 1;
    $('#time').textContent = fmtTime(elapsed);
    if (elapsed % 10 === 0) persist();
  }
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------- 시작 ----------
window.addEventListener('resize', () => { layout(); if (state) render({ instant: true }); });
layout();
const saved = store.current;
if (saved && saved.state) {
  state = saved.state;
  history = saved.history || [];
  elapsed = saved.elapsed || 0;
  mode = saved.mode || 'classic';
  dailyDate = saved.dailyDate || null;
  gameUndos = saved.undos || 0;
  undoBonus = saved.undoBonus || 0;
  gameHints = saved.hints || 0;
  timerOn = state.moves > 0;
  render({ instant: true });
}
showHome(); // 앱을 열면 시작 화면부터
if (store.premium) Ads.removed = true; // 광고 제거 구매자
// 하단 배너: 개발 중에는 화면에 '광고' 자리만, 빌드에서는 NcqAds가 띄우고 가린 높이만큼 비켜 줘요(--ncq-banner-bottom)
if (!isDevAds() || Ads.removed || !NcqAds.can('BANNER')) $('#ad-banner').classList.add('off');
if (bannerPos() === 'top') { const ab = $('#ad-banner'); ab.classList.add('top'); $('#app').insertBefore(ab, $('#app').firstChild); } // 배너 자리를 위로 (개발 중 '광고' 자리도)
Ads.showBanner();
window.addEventListener('ncq-banner', () => { layout(); if (state) render({ instant: true }); });
Analytics.open();
// 인앱 상품: 지급 함수를 등록하면 NcqIap이 끝나지 않은 구매와 다시 설치한 뒤 되찾을 구매를 찾아 지급해요 (앱으로 돌아올 때도).
// 가격(상품 정보)은 메뉴를 열기 전에 미리 받아 둬요
NcqIap.onGrant(grantItem);
NcqIap.ready().catch(() => {});

// 광고 동의(유럽 등)가 필요한 사용자에게만 메뉴에 '개인정보 설정'
let privacyBtn = false;
NcqAds.ready().then(() => { privacyBtn = !!NcqAds.privacyRequired(); }).catch(() => {});

// 안드로이드 뒤로 가기: 열린 창 닫기 → 없으면 종료 확인
onBackButton(() => {
  if (!$('#modal').hidden) return hideModal();
  if (home.hidden) { persist(); return showHome(); } // 게임 중이면 시작 화면으로
  showModal(`
    <h2>${t('quit_title')}</h2>
    <p class="sub">${t('quit_sub')}</p>
    <div class="row"><button class="btn" data-m="exit">${t('quit')}</button><button class="btn primary" data-m="close" data-ncq-main="Resume">${t('resume')}</button></div>
  `, (act) => { if (act === 'exit') { persist(); exitApp(); } else hideModal(); });
});

// 언어가 바뀌면 (메뉴의 '언어'): HTML의 data-i18n 글자는 NcqLang이 바꾸고, 그려 둔 화면은 여기서 다시 그려요
NcqLang.onChange(() => {
  redrawFaces(); // 카드 읽기 이름 + 판(제목)
  if (!home.hidden) renderHome();
});

// 토스 뒤로가기: 열린 창이 있으면 닫고 true, 첫 화면이면 false (토스가 '게임을 종료할까요?'를 물어요)
window.ncqBack = () => {
  if (!$('#modal').hidden) { hideModal(); return true; }
  persist();
  if (home.hidden) { showHome(); return true; } // 게임 중 → 시작 화면
  return false; // 시작 화면이 첫 화면이에요
};
document.documentElement.classList.toggle('calm', !!store.settings.calm);

// NCQ_TEST_DEBUG: 자동 테스트·디버깅용 훅 (출시 빌드에서는 없어요)
if (testOn('DEBUG')) window.__ps = {
  get state() { return state; },
  set state(v) { hideModal(); state = v; history = []; finished = false; stuckShown = false; mode = 'classic'; dailyDate = null; render({ instant: true }); },
  startGame, undo, hint, autoComplete, render, Sound, Haptics, Analytics, cheatWin, Ads, Progress, layout, showHome, hideHome, hintFor, hintReady, setHistory(h) { history = h; }, get undoLeft() { return undoLeft(); },
  get store() { return store; },
};
