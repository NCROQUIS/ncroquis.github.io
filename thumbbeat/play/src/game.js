// 엄지비트 — 화면, 입력, 렌더링
import { SONGS, DIFFS, compose, buildChart, JudgeEngine, starsFor, coinsFor, WINDOWS, LEVEL_NAMES } from './core.js';
import { Synth, vibrate } from './audio.js';
import { NcqAds } from './ads.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has('autoplay');
const LANE_COLORS = ['#ff6b8b', '#ffc145', '#4cc9f0'];
const LEAD_IN = 2.4; // 시작 전 카운트다운(초)
const FLICK_PX = 26; // 이만큼 위로 밀면 플릭
const FLICK_WAIT = 0.22; // 이 시간 안에 안 밀면 그냥 탭으로 판정
const STORE_KEY = 'thumbbeat.v1';
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 저장 ----------
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') return { coins: 0, best: {}, silent: false, diff: 1, ...s };
  } catch (e) {
    /* 저장소를 못 쓰는 환경 */
  }
  return { coins: 0, best: {}, silent: false, diff: 1 };
}
const save = loadSave();
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  } catch (e) {
    /* 무시 */
  }
}
const bestRec = (songId) => Object.values(save.best[songId] || {});
const bestStars = (songId) => Math.max(0, ...bestRec(songId).map((b) => b.stars || 0));
const hasCrown = (songId) => bestRec(songId).some((b) => b.fc);
const totalStars = () => SONGS.reduce((a, s) => a + bestStars(s.id), 0);
const isUnlocked = (s) => totalStars() >= s.unlock;

// ---------- 상태 ----------
const synth = new Synth();
const cv = $('cv');
const g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let selSong = 0;
let run = null; // 현재 플레이
const fx = { pops: [], sparks: [], rings: [], banners: [], laneGlow: [0, 0, 0], beatPulse: 0, lastBeat: -1, shake: 0, flash: 0, comboPunch: 0, fever: 0 };

function resize() {
  const r = $('app').getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width;
  H = r.height;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
}
let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 1600);
}

// ---------- 노선도(메인) ----------
function renderMenu() {
  $('coinVal').textContent = save.coins;
  $('silentBtn').setAttribute('aria-pressed', String(save.silent));
  $('silentBtn').textContent = save.silent ? '무음' : '소리';
  const route = document.createElement('div');
  route.className = 'line';
  $('route').replaceChildren(route);
  SONGS.forEach((s, i) => {
    const locked = !isUnlocked(s);
    const st = bestStars(s.id);
    const b = document.createElement('button');
    b.className = 'station' + (i === selSong ? ' sel' : '') + (locked ? ' locked' : '');
    b.style.setProperty('--c', s.color);
    b.innerHTML = `<span class="stop">${hasCrown(s.id) ? '♛' : i + 1}</span>
      <span class="info"><div class="title">${s.title}</div>
      <div class="sub">${locked ? `별 ${s.unlock}개 모으면 열려요` : `${s.sub} · ${s.bpm} BPM`}</div></span>
      <span class="stars">${[0, 1, 2].map((k) => `<span class="${k < st ? '' : 'off'}">★</span>`).join('')}</span>`;
    b.onclick = () => {
      if (locked) return toast(`별 ${s.unlock - totalStars()}개 더 필요해요`);
      selSong = i;
      renderMenu();
    };
    route.appendChild(b);
  });
  const seg = $('diffSeg');
  seg.innerHTML = '';
  DIFFS.forEach((d, i) => {
    const b = document.createElement('button');
    b.textContent = d.name;
    b.setAttribute('aria-pressed', String(i === save.diff));
    b.onclick = () => {
      save.diff = i;
      persist();
      renderMenu();
    };
    seg.appendChild(b);
  });
  $('goBtn').style.background = SONGS[selSong].color;
  $('hint').textContent = save.silent ? '무음 모드: 화면 비트와 진동으로 박자를 맞춰요' : '탭 · 길게 누르기 · ▲는 위로 튕기기';
}

$('silentBtn').onclick = () => {
  save.silent = !save.silent;
  persist();
  synth.setMuted(save.silent);
  renderMenu();
  toast(save.silent ? '무음 모드: 진동과 화면 비트로 플레이' : '소리 켬');
};
$('goBtn').onclick = () => startSong(selSong, save.diff);

// ---------- 플레이 ----------
async function startSong(songIdx, diffIdx) {
  await synth.unlock();
  synth.setMuted(save.silent);
  const song = SONGS[songIdx];
  const comp = compose(song);
  const diff = DIFFS[diffIdx];
  const chart = buildChart(comp, diff);
  const engine = new JudgeEngine(chart);
  const startAt = synth.now() + LEAD_IN;
  run = {
    song, songIdx, diff, diffIdx, comp, engine, startAt,
    pointers: new Map(), held: [false, false, false], pendingFlick: null,
    paused: false, continued: false, over: false, countdownUntil: 0, sectionIdx: 0,
  };
  Object.assign(fx, { pops: [], sparks: [], rings: [], banners: [], lastBeat: -1, shake: 0, flash: 0, fever: 0 });
  synth.setLevel(0);
  synth.play(comp, startAt, chart.ghosts);
  $('songName').textContent = `${song.title} · ${diff.name}`;
  renderLayers(0);
  show('hud');
  window.__tb.run = run;
}

function songTime() {
  if (!run) return 0;
  return synth.now() - run.startAt - synth.latency;
}

function laneAt(x) {
  const pad = 10;
  const lw = (W - pad * 2) / 3;
  return Math.max(0, Math.min(2, Math.floor((x - pad) / lw)));
}

function onPress(lane, pointerId = null, y = 0) {
  if (!run || run.paused || run.over) return;
  run.held[lane] = true;
  fx.laneGlow[lane] = 1;
  const now = songTime();
  const target = run.engine.peek(lane, now);
  if (target && target.flick) {
    // 위로 튕기는지 잠깐 지켜봐요. 판정 시각은 손가락이 닿은 순간이에요.
    run.pendingFlick = { lane, t: now, pointerId, y, note: target };
    return;
  }
  handle(run.engine.press(lane, now));
}
function resolveFlick(swiped) {
  const pf = run && run.pendingFlick;
  if (!pf) return;
  run.pendingFlick = null;
  handle(run.engine.press(pf.lane, pf.t, swiped));
}
function onRelease(lane) {
  if (!run) return;
  run.held[lane] = false;
  if (run.paused || run.over) return;
  if (run.pendingFlick && run.pendingFlick.lane === lane) resolveFlick(false);
  handle(run.engine.release(lane, songTime()));
}

cv.addEventListener('pointerdown', (e) => {
  if (!run) return;
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const lane = laneAt(e.clientX - r.left);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  run.pointers.set(e.pointerId, lane);
  onPress(lane, e.pointerId, e.clientY);
});
cv.addEventListener('pointermove', (e) => {
  const pf = run && run.pendingFlick;
  if (pf && pf.pointerId === e.pointerId && pf.y - e.clientY >= FLICK_PX) resolveFlick(true);
});
const up = (e) => {
  if (!run || !run.pointers.has(e.pointerId)) return;
  const lane = run.pointers.get(e.pointerId);
  run.pointers.delete(e.pointerId);
  onRelease(lane);
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
// PC: A·S·D / J·K·L 탭, 위 화살표·W·I를 누른 채 레인 키 = 플릭
const KEYS = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 };
const keyFlick = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w' || k === 'i') keyFlick.add(k);
  const lane = KEYS[k];
  if (lane != null) {
    onPress(lane);
    if (keyFlick.size && run && run.pendingFlick) resolveFlick(true);
  }
  if (e.key === 'Escape' && run && !run.over) pause();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keyFlick.delete(k);
  const lane = KEYS[k];
  if (lane != null) onRelease(lane);
});

// ---------- 판정 결과 → 소리·진동·연출 ----------
const POP_TEXT = { perfectPlus: 'PERFECT+', perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const POP_COLOR = { perfectPlus: '#ffe08a', perfect: '#ffd166', great: '#7ef0c0', good: '#9ad0ff', miss: '#ff6b8b', hold: '#ffffff' };

function handle(r) {
  if (!r) return;
  const { note, judge } = r;
  const lane = note.lane;
  if (judge === 'miss') {
    fx.pops.push({ text: 'MISS', judge, lane, t: performance.now() });
    synth.miss();
    synth.releaseKey(note.id);
    vibrate(30);
    fx.shake = Math.max(fx.shake, 4);
    return;
  }
  if (judge === 'hold') {
    synth.releaseKey(note.id);
    burst(lane, 10, 1.1);
    return;
  }
  synth.key(note, judge, note.end != null ? note.id : null);
  fx.pops.push({ text: POP_TEXT[judge], judge, lane, t: performance.now(), early: judge !== 'perfectPlus' && judge !== 'perfect' && r.offset != null ? (r.offset < 0 ? '빠름' : '느림') : '' });
  fx.comboPunch = 1;
  if (r.flicked) {
    synth.flick();
    vibrate([10, 30, 18]);
    fx.shake = Math.max(fx.shake, 9);
    fx.flash = Math.max(fx.flash, 0.35);
    burst(lane, 26, 1.8, true);
    fx.rings.push({ lane, t: performance.now(), big: true });
  } else {
    vibrate(judge === 'perfectPlus' || judge === 'perfect' ? 14 : 8);
    burst(lane, judge === 'perfectPlus' ? 16 : judge === 'perfect' ? 12 : 6, 1);
    fx.rings.push({ lane, t: performance.now(), big: false });
  }
}

function burst(lane, n, speed, up = false) {
  if (reduceMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const sp = (90 + Math.random() * 240) * speed;
    fx.sparks.push({ lane, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, size: 2 + Math.random() * 3 });
  }
}

const LEVEL_BANNER = ['', '베이스 합류!', '코드 합류!', 'FEVER!'];
function onEngineEvent(ev) {
  if (ev.type === 'levelUp') {
    synth.setLevel(ev.level);
    renderLayers(ev.level, true);
    banner(LEVEL_BANNER[ev.level], ev.level === 3 ? 'fever' : 'level');
    if (ev.level === 3) {
      fx.flash = 0.6;
      vibrate([20, 40, 20, 40, 40]);
    } else fx.flash = Math.max(fx.flash, 0.2);
  } else if (ev.type === 'levelDown') {
    synth.setLevel(ev.level);
    renderLayers(ev.level);
  } else if (ev.type === 'milestone') {
    // FEVER 배너가 떠 있으면 겹치지 않게 콤보 배너는 생략해요
    if (!fx.banners.some((b) => b.kind === 'fever')) banner(`${ev.combo} COMBO`, 'combo');
  }
}

function renderLayers(level, pop = false) {
  for (const el of document.querySelectorAll('.lp')) {
    const l = Number(el.dataset.l);
    el.classList.toggle('on', l <= level);
    if (pop && l === level) {
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 200);
    }
  }
  $('multVal').textContent = `x${level + 1}`;
  $('multVal').classList.toggle('hot', level >= 2);
}

function banner(text, kind) {
  fx.banners = fx.banners.filter((b) => b.kind !== kind);
  fx.banners.push({ text, kind, t: performance.now() });
}

// ---------- 일시정지 / 이어하기 ----------
async function pause() {
  if (!run || run.paused || run.over) return;
  run.paused = true;
  await synth.pause();
  $('pauseModal').classList.add('on');
}
async function resumeWithCountdown() {
  $('pauseModal').classList.remove('on');
  $('failModal').classList.remove('on');
  // 손가락을 다시 올릴 시간을 주려고 1.5초 기다린 뒤 재개해요
  run.countdownUntil = performance.now() + 1500;
  await new Promise((r) => setTimeout(r, 1500));
  run.countdownUntil = 0;
  run.pointers.clear();
  run.held = [false, false, false];
  run.pendingFlick = null;
  run.paused = false;
  await synth.resume();
}
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = resumeWithCountdown;
$('restartBtn').onclick = async () => {
  $('pauseModal').classList.remove('on');
  synth.stop();
  await synth.resume();
  startSong(run.songIdx, run.diffIdx);
};
$('quitBtn').onclick = async () => {
  $('pauseModal').classList.remove('on');
  synth.stop();
  await synth.resume();
  run = null;
  show('menu');
  renderMenu();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// ---------- 광고 (보상형 2곳, 회사 광고 도구 NcqAds) ----------
// 광고를 보는 동안 곡은 이미 멈춰 있어요 (이어하기: 체력 0으로 멈춤, 코인 2배: 곡이 끝난 결과 화면).
// 끝까지 본 광고만 true라서 그때만 보상을 줘요. 광고를 끈 빌드에서는 can이 false라 버튼이 숨어요.
let adBusy = false;

async function fail() {
  run.paused = true;
  await synth.pause();
  // NCQ_ADS_REVIVE: 이어하기 보상형 광고 (체력 절반으로, 곡당 1번)
  const canRevive = !run.continued && NcqAds.can('REVIVE');
  $('continueBtn').style.display = canRevive ? '' : 'none';
  $('continueBtn').disabled = false;
  $('failText').textContent = canRevive
    ? '체력이 다 떨어졌어요. 광고를 보면 체력 절반으로 이어서 달릴 수 있어요. (곡당 1번)'
    : run.continued ? '체력이 다 떨어졌어요. 이어하기는 곡당 1번이에요.' : '체력이 다 떨어졌어요.';
  $('failModal').classList.add('on');
}
$('continueBtn').onclick = async () => {
  const r = run;
  if (!r || r.continued || r.over || adBusy) return;
  adBusy = true;
  $('continueBtn').disabled = true;
  const watched = await NcqAds.rewarded('REVIVE');
  adBusy = false;
  $('continueBtn').disabled = false;
  if (!watched || run !== r || r.over) return; // 끝까지 안 봤으면 그대로 (다시 보거나 내리기)
  r.continued = true;
  r.engine.health = 50;
  resumeWithCountdown();
};
$('giveupBtn').onclick = async () => {
  $('failModal').classList.remove('on');
  await synth.resume();
  finish(false);
};

// ---------- 결과 ----------
function finish(cleared) {
  if (!run || run.over) return;
  run.over = true;
  synth.stop();
  const e = run.engine;
  const acc = e.accuracy();
  const stars = starsFor(acc, cleared);
  const fc = cleared && e.fullCombo;
  const coins = coinsFor(stars, e.score, fc);
  const rec = (save.best[run.song.id] ||= {});
  const prev = rec[run.diff.id] || { stars: 0, score: 0, fc: false };
  const newBest = e.score > prev.score;
  rec[run.diff.id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, e.score), fc: prev.fc || fc };
  const beforeUnlocked = SONGS.filter(isUnlocked).length;
  save.coins += coins;
  persist();
  const newlyUnlocked = SONGS.filter(isUnlocked).length > beforeUnlocked;
  run.result = { cleared, acc, stars, coins, fc, doubled: false, newBest };

  $('rArrive').textContent = cleared ? (newBest ? '도착! 최고 기록이에요' : '도착했어요') : '중간에 내렸어요';
  $('rTitle').textContent = `${run.song.title} · ${run.diff.name}`;
  $('rScore').textContent = e.score.toLocaleString();
  $('rAcc').textContent = `정확도 ${(acc * 100).toFixed(1)}% · 최대 콤보 ${e.maxCombo} · PERFECT+ ${e.counts.perfectPlus}`;
  $('rBadge').hidden = !fc;
  $('rBadge').textContent = fc && e.counts.perfectPlus === e.notes.length ? '♛ ALL PERFECT+' : '♛ FULL COMBO';
  $('cP').textContent = e.counts.perfectPlus + e.counts.perfect;
  $('cG').textContent = e.counts.great;
  $('cGo').textContent = e.counts.good;
  $('cM').textContent = e.counts.miss;
  $('rCoins').textContent = `● ${coins}`;
  $('doubleBtn').style.display = coins > 0 && NcqAds.can('DOUBLE_COINS') ? '' : 'none';
  $('doubleBtn').disabled = false;
  const nextIdx = run.songIdx + 1;
  $('nextBtn').disabled = !(nextIdx < SONGS.length && isUnlocked(SONGS[nextIdx]));
  $('nextBtn').style.opacity = $('nextBtn').disabled ? 0.4 : 1;
  const spans = [...$('rStars').children];
  spans.forEach((s) => s.classList.remove('show', 'lit'));
  show('result');
  spans.forEach((s, i) => setTimeout(() => {
    s.classList.add('show');
    if (i < stars) { s.classList.add('lit'); vibrate(20); }
  }, 250 + i * 280));
  if (newlyUnlocked) setTimeout(() => toast('새 역이 열렸어요!'), 1300);
}
// NCQ_ADS_DOUBLE_COINS: 결과 화면 코인 2배 보상형 광고
$('doubleBtn').onclick = async () => {
  const res = run && run.result;
  if (!res || res.doubled || adBusy) return;
  adBusy = true;
  $('doubleBtn').disabled = true;
  const watched = await NcqAds.rewarded('DOUBLE_COINS');
  adBusy = false;
  if (!watched) { // 끝까지 안 봤으면 보상 없이, 다시 누를 수 있게
    if (run && run.result === res) $('doubleBtn').disabled = false;
    return;
  }
  res.doubled = true; // 보는 사이 화면을 옮겼어도 끝까지 본 보상은 줘요
  save.coins += res.coins;
  persist();
  if (run && run.result === res) $('rCoins').textContent = `● ${res.coins * 2}`;
  toast(`코인 ${res.coins}개 추가`);
};
$('retryBtn').onclick = () => startSong(run.songIdx, run.diffIdx);
$('nextBtn').onclick = () => {
  selSong = run.songIdx + 1;
  startSong(selSong, run.diffIdx);
};
$('mapBtn').onclick = () => {
  if (run) selSong = run.songIdx;
  run = null;
  show('menu');
  renderMenu();
};

// ---------- 렌더 ----------
function rr(x, y, w, h, r) {
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}
const hexA = (hex, a) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

function draw() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!run) return;
  const t = songTime();
  const nowMs = performance.now();
  const pad = 10;
  const lw = (W - pad * 2) / 3;
  const topY = 118;
  const hitY = Math.round(H * 0.8);
  const span = hitY - topY;
  const appr = run.diff.approach;
  const yOf = (nt) => hitY - ((nt - t) / appr) * span;
  const level = run.engine.level;
  const feverOn = level === 3;
  fx.fever += ((feverOn ? 1 : 0) - fx.fever) * 0.08;

  // 비트 펄스
  const bi = Math.floor((t + 1e-4) / (run.comp.stepDur * 4));
  if (bi !== fx.lastBeat && bi >= 0 && bi < run.comp.beats.length) {
    fx.lastBeat = bi;
    fx.beatPulse = 1;
  }
  fx.beatPulse *= 0.9;
  const pulseK = save.silent ? 1 : 0.35 + fx.fever * 0.5;

  // 화면 흔들림
  const sh = reduceMotion ? 0 : fx.shake;
  if (sh > 0.1) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  fx.shake *= 0.85;

  // FEVER 배경: 곡 색이 번지고 속도선이 흘러요
  if (fx.fever > 0.02) {
    const col = run.song.color;
    const rg = g.createRadialGradient(W / 2, hitY, 20, W / 2, hitY, H * 0.9);
    rg.addColorStop(0, hexA(col, 0.35 * fx.fever * (0.7 + fx.beatPulse * 0.3)));
    rg.addColorStop(1, hexA(col, 0));
    g.fillStyle = rg;
    g.fillRect(-20, -20, W + 40, H + 40);
    g.strokeStyle = `rgba(255,255,255,${0.08 * fx.fever})`;
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97.3) % W);
      const y = ((nowMs * 0.9 + i * 211) % (H + 200)) - 100;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 60);
      g.stroke();
    }
  }

  // 레인
  for (let i = 0; i < 3; i++) {
    const x = pad + lw * i;
    const grad = g.createLinearGradient(0, topY, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, `rgba(255,255,255,${0.035 + fx.laneGlow[i] * 0.12})`);
    g.fillStyle = grad;
    rr(x + 3, topY - 20, lw - 6, H - topY + 20, 14);
    g.fill();
    if (fx.laneGlow[i] > 0.01) {
      const lg = g.createLinearGradient(0, hitY - 180, 0, hitY + 40);
      lg.addColorStop(0, 'rgba(0,0,0,0)');
      lg.addColorStop(1, hexA(LANE_COLORS[i], fx.laneGlow[i] * 0.4));
      g.fillStyle = lg;
      g.fillRect(x + 3, hitY - 180, lw - 6, 220);
    }
    fx.laneGlow[i] = run.held[i] ? Math.max(fx.laneGlow[i] * 0.92, 0.55) : fx.laneGlow[i] * 0.85;
  }

  // 마디선
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 1;
  const bar = run.comp.barDur;
  for (let k = Math.max(0, Math.floor(t / bar)); k * bar < t + appr * 1.2; k++) {
    const y = yOf(k * bar);
    if (y < topY - 20 || y > hitY) continue;
    g.beginPath();
    g.moveTo(pad + 6, y);
    g.lineTo(W - pad - 6, y);
    g.stroke();
  }

  // 판정선과 타깃
  const pulse = fx.beatPulse * pulseK;
  g.fillStyle = `rgba(255,255,255,${0.18 + pulse * 0.35})`;
  g.fillRect(pad, hitY - 1.5, W - pad * 2, 3);
  for (let i = 0; i < 3; i++) {
    const cx = pad + lw * i + lw / 2;
    g.beginPath();
    g.arc(cx, hitY, 22 + pulse * 6, 0, Math.PI * 2);
    g.strokeStyle = LANE_COLORS[i];
    g.globalAlpha = 0.55 + fx.laneGlow[i] * 0.45;
    g.lineWidth = 4;
    g.stroke();
    g.globalAlpha = 1;
  }

  // 충격파
  fx.rings = fx.rings.filter((r) => nowMs - r.t < (r.big ? 450 : 300));
  for (const r of fx.rings) {
    const k = (nowMs - r.t) / (r.big ? 450 : 300);
    const cx = pad + lw * r.lane + lw / 2;
    g.beginPath();
    if (r.big) g.arc(cx, hitY, 24 + k * 120, 0, Math.PI * 2);
    else g.arc(cx, hitY, 22 + k * 34, 0, Math.PI * 2);
    g.strokeStyle = hexA(LANE_COLORS[r.lane], 1 - k);
    g.lineWidth = r.big ? 6 * (1 - k) + 1 : 3;
    g.stroke();
  }

  // 노트
  const nw = lw - 22;
  const nh = 24;
  for (const n of run.engine.notes) {
    if (n.t - t > appr * 1.05) break;
    if (n.state === 'done') continue;
    if (n.state === 'missed' && (n.end ?? n.t) < t - 0.4) continue;
    if (n.state === 'broken' && n.end < t) continue;
    const x = pad + lw * n.lane + 11;
    const col = feverOn && n.state === 'pending' ? '#ffe08a' : LANE_COLORS[n.lane];
    const dim = n.state === 'missed' || n.state === 'broken';
    if (n.end != null) {
      const yHead = n.state === 'holding' ? hitY : yOf(n.t);
      const yTail = Math.max(topY - 30, yOf(n.end));
      if (yTail < yHead) {
        g.fillStyle = hexA(col, dim ? 0.13 : n.state === 'holding' ? 0.6 : 0.35);
        rr(x + nw * 0.22, yTail, nw * 0.56, yHead - yTail, 10);
        g.fill();
        g.fillStyle = hexA(col, dim ? 0.27 : 1);
        rr(x + nw * 0.15, yTail - 6, nw * 0.7, 12, 6);
        g.fill();
      }
      if (n.state === 'holding') {
        // 누르는 동안 판정선에서 불꽃이 튀어요
        if (Math.random() < 0.5) fx.sparks.push({ lane: n.lane, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 160, life: 0.7, size: 2.5 });
      }
      drawNote(x, yHead - nh / 2, nw, nh, col, dim, false);
    } else {
      const y = yOf(n.t);
      if (y > H + 30) continue;
      drawNote(x, y - nh / 2, nw, n.flick ? nh + 8 : nh, col, dim, n.flick);
    }
  }

  // 판정 텍스트
  fx.pops = fx.pops.filter((p) => nowMs - p.t < 520);
  for (const p of fx.pops) {
    const k = (nowMs - p.t) / 520;
    const cx = pad + lw * p.lane + lw / 2;
    const s = p.judge === 'perfectPlus' ? 1 + (1 - Math.min(1, k * 4)) * 0.4 : 1;
    g.globalAlpha = 1 - k;
    g.textAlign = 'center';
    g.font = `900 ${Math.round((p.judge === 'perfectPlus' ? 19 : 17) * s + (1 - k) * 3)}px system-ui, sans-serif`;
    g.fillStyle = POP_COLOR[p.judge];
    if (p.judge === 'perfectPlus') {
      g.shadowColor = '#ffd166';
      g.shadowBlur = 14;
    }
    const half = g.measureText(p.text).width / 2 + 6;
    const tx = Math.max(half, Math.min(W - half, cx));
    g.fillText(p.text, tx, hitY - 56 - k * 20);
    g.shadowBlur = 0;
    if (p.early) {
      g.font = '700 12px system-ui, sans-serif';
      g.fillStyle = '#c9cbe8';
      g.fillText(p.early, tx, hitY - 38 - k * 20);
    }
    g.globalAlpha = 1;
  }

  // 불꽃
  const dt = 1 / 60;
  for (const s of fx.sparks) {
    s.life -= dt * 2.2;
    s.x = (s.x ?? pad + lw * s.lane + lw / 2) + s.vx * dt;
    s.y = (s.y ?? hitY) + s.vy * dt;
    s.vy += 520 * dt;
    g.globalAlpha = Math.max(0, s.life);
    g.fillStyle = feverOn ? '#ffe08a' : LANE_COLORS[s.lane];
    g.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  g.globalAlpha = 1;
  fx.sparks = fx.sparks.filter((s) => s.life > 0);
  if (fx.sparks.length > 400) fx.sparks.splice(0, fx.sparks.length - 400);

  // 콤보 (칠 때마다 튕겨요)
  const combo = run.engine.combo;
  fx.comboPunch *= 0.82;
  if (combo >= 5) {
    const s = 1 + fx.comboPunch * 0.18;
    g.save();
    g.translate(W / 2, H * 0.42);
    g.scale(s, s);
    g.textAlign = 'center';
    g.fillStyle = feverOn ? 'rgba(255,224,138,0.5)' : 'rgba(255,255,255,0.16)';
    g.font = '900 68px system-ui, sans-serif';
    g.fillText(combo, 0, 0);
    g.font = '800 13px system-ui, sans-serif';
    g.fillStyle = feverOn ? 'rgba(255,224,138,0.8)' : 'rgba(255,255,255,0.38)';
    g.fillText(feverOn ? 'FEVER COMBO' : 'COMBO', 0, 24);
    g.restore();
  }

  // 배너 (레벨업, 콤보 마일스톤, 구간)
  fx.banners = fx.banners.filter((b) => nowMs - b.t < 1100);
  fx.banners.forEach((b, i) => {
    const k = (nowMs - b.t) / 1100;
    const ease = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = H * 0.3 + fx.banners.slice(0, i).reduce((a, o) => a + (o.kind === 'fever' ? 80 : 40), 0);
    g.globalAlpha = ease;
    g.textAlign = 'center';
    if (b.kind === 'fever') {
      const s = 1 + (1 - Math.min(1, k * 5)) * 0.6;
      g.save();
      g.translate(W / 2, y);
      g.scale(s, s);
      const lg = g.createLinearGradient(-90, 0, 90, 0);
      lg.addColorStop(0, '#ff6b8b');
      lg.addColorStop(0.5, '#ffc145');
      lg.addColorStop(1, '#4cc9f0');
      g.fillStyle = lg;
      g.font = '900 52px system-ui, sans-serif';
      g.fillText(b.text, 0, 0);
      g.font = '800 13px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText('점수 x4 · 모든 악기 합류', 0, 24);
      g.restore();
    } else {
      g.font = b.kind === 'section' ? '800 18px system-ui, sans-serif' : '900 24px system-ui, sans-serif';
      g.fillStyle = b.kind === 'section' ? run.song.color : '#fff';
      g.fillText(b.text, W / 2, y);
    }
    g.globalAlpha = 1;
  });

  drawRoute(t);

  // 화면 섬광, 체력 경고
  if (fx.flash > 0.01) {
    g.fillStyle = `rgba(255,255,255,${fx.flash * 0.35})`;
    g.fillRect(-20, -20, W + 40, H + 40);
    fx.flash *= 0.88;
  }
  if (run.engine.health < 30) {
    const a = (30 - run.engine.health) / 30 * (0.35 + fx.beatPulse * 0.2);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(255,40,80,0)');
    vg.addColorStop(1, `rgba(255,40,80,${a})`);
    g.fillStyle = vg;
    g.fillRect(-20, -20, W + 40, H + 40);
  }

  // 카운트다운
  let cd = null;
  if (t < 0 && !run.paused) cd = Math.ceil(-t);
  if (run.countdownUntil) cd = Math.ceil((run.countdownUntil - nowMs) / 500);
  if (cd != null && cd > 0) {
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = '900 72px system-ui, sans-serif';
    g.fillText(cd, W / 2, H * 0.45);
    if (t < 0) {
      g.font = '700 15px system-ui, sans-serif';
      g.fillStyle = '#c9cbe8';
      g.fillText('콤보를 이으면 악기가 하나씩 합류해요', W / 2, H * 0.45 + 32);
    }
  }
}

function drawNote(x, y, w, h, col, dim, flick) {
  g.save();
  if (!dim) {
    g.shadowColor = col;
    g.shadowBlur = flick ? 24 : 16;
  }
  g.fillStyle = dim ? hexA(col, 0.27) : col;
  rr(x, y, w, h, h / 2);
  g.fill();
  g.restore();
  if (dim) return;
  if (flick) {
    // ▲ 위로 튕기기 표시
    const cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = '#1a1030';
    for (const dx of [-14, 14]) {
      g.beginPath();
      g.moveTo(cx + dx - 7, cy + 4);
      g.lineTo(cx + dx, cy - 5);
      g.lineTo(cx + dx + 7, cy + 4);
      g.closePath();
      g.fill();
    }
    g.font = '900 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('UP', cx, cy + 4);
  } else {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    rr(x + 8, y + 4, w - 16, 5, 3);
    g.fill();
  }
}

// 곡 진행 = 지하철 노선. 구간이 바뀔 때마다 역을 지나요.
function drawRoute(t) {
  const y = 104;
  const x0 = 24, x1 = W - 24;
  const dur = run.comp.duration;
  const p = Math.max(0, Math.min(1, t / dur));
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.strokeStyle = run.song.color;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * p, y); g.stroke();
  const stops = [...run.comp.sections.map((s) => s.t), dur];
  for (const st of stops) {
    const sx = x0 + (x1 - x0) * (st / dur);
    g.beginPath();
    g.arc(sx, y, 6, 0, Math.PI * 2);
    g.fillStyle = st <= t ? run.song.color : '#0f1020';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = st <= t ? '#fff' : 'rgba(255,255,255,0.35)';
    g.stroke();
  }
  const tx = x0 + (x1 - x0) * p;
  g.fillStyle = '#fff';
  rr(tx - 9, y - 6, 18, 12, 4);
  g.fill();
}

// ---------- 루프 ----------
function loop() {
  if (run && !run.paused && !run.over) {
    const t = songTime();
    if (AUTOPLAY) {
      for (const n of run.engine.notes) {
        if (n.t > t) break;
        if (n.state === 'pending' && t - n.t < WINDOWS.good) {
          run.held[n.lane] = n.end != null;
          fx.laneGlow[n.lane] = 1;
          handle(run.engine.press(n.lane, t, n.flick));
        }
      }
      for (const [lane] of run.engine.activeHold) run.held[lane] = true;
    }
    if (run.pendingFlick && t - run.pendingFlick.t > FLICK_WAIT) resolveFlick(false);
    for (const ev of run.engine.update(t)) {
      handle(ev);
      if (ev.judge === 'hold') run.held[ev.note.lane] = [...run.pointers.values()].includes(ev.note.lane);
    }
    for (const ev of run.engine.takeEvents()) onEngineEvent(ev);
    // 구간이 바뀌면 다음 역 안내
    const secs = run.comp.sections;
    while (run.sectionIdx + 1 < secs.length && t >= secs[run.sectionIdx + 1].t) {
      run.sectionIdx++;
      const s = secs[run.sectionIdx];
      banner(s.type === 'chorus' ? '환승 구간! 노트가 몰려와요' : s.type === 'outro' ? '곧 도착해요' : `${s.name} 진입`, 'section');
    }
    $('scoreVal').textContent = run.engine.score.toLocaleString();
    $('hpBar').style.width = run.engine.health + '%';
    $('hp').classList.toggle('low', run.engine.health < 30);
    if (run.engine.health <= 0) fail();
    else if (t > run.comp.duration + 0.6 && run.engine.finished) finish(true);
  }
  if (run && !run.over) draw();
  else {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
  }
  requestAnimationFrame(loop);
}

// 테스트·디버그용 훅
window.__tb = { save, startSong, finish, songTime, LEVEL_NAMES, get synth() { return synth; }, run: null };

synth.setMuted(save.silent);
renderMenu();
requestAnimationFrame(loop);
if (params.has('song')) {
  const si = Number(params.get('song')) || 0;
  const di = params.has('diff') ? Number(params.get('diff')) : save.diff;
  startSong(si, di);
}
