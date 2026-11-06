// 진행 시스템 — 오늘의 할 일 3개, 경험치·레벨·칭호, 레벨 보상(카드 뒷면·테이블 색)
// 화면과 분리된 순수 함수예요. 저장은 main.js가 store.progress에 해요.
import { hashSeed, createRng } from './engine.js';
import { t } from './i18n.js';

// 할 일 목록: 쉬움 1개 + 보통 1개 + 실력 1개를 날짜마다 골라요 (모두에게 같은 할 일). 글자는 글자 표의 mission_<id>
export const MISSIONS = {
  play3: { target: 3, counter: 'plays' },
  win1: { target: 1, counter: 'wins' },
  win3: { target: 3, counter: 'wins' },
  daily: { target: 1, counter: 'daily' },
  spider: { target: 1, counter: 'spider' },
  freecell: { target: 1, counter: 'freecell' },
  noundo: { target: 1, counter: 'noundo' },
  nohint: { target: 1, counter: 'nohint' },
  fast: { target: 1, counter: 'fast' },
  draw3: { target: 1, counter: 'draw3' },
};
export const missionText = (id) => t(`mission_${id}`);
const GROUPS = [['play3', 'win1'], ['daily', 'spider', 'freecell', 'win3'], ['noundo', 'nohint', 'fast', 'draw3']];

export function missionsFor(date) {
  const rng = createRng(hashSeed(`missions-${date}`));
  return GROUPS.map((g) => g[Math.floor(rng() * g.length)]);
}

// 경험치
export const XP = { win: 20, noUndo: 10, daily: 10, spider2: 10, spider4: 20, mission: 15, allMissions: 30 };

// 레벨: 다음 레벨까지 60, 90, 120 ... 씩
export const needFor = (level) => 60 + 30 * (level - 1);
export function levelInfo(xp = 0) {
  let level = 1;
  let rest = xp;
  while (rest >= needFor(level)) { rest -= needFor(level); level += 1; }
  return { level, cur: rest, need: needFor(level), pct: Math.round((rest / needFor(level)) * 100), title: titleFor(level) };
}
// 칭호: 이 레벨부터 (글자는 글자 표의 title_<id>)
const TITLES = [[20, 'legend'], [16, 'grandmaster'], [12, 'master'], [8, 'expert'], [5, 'fan'], [3, 'friend'], [1, 'rookie']];
export const titleFor = (level) => t(`title_${TITLES.find(([l]) => level >= l)[1]}`);

// 레벨 보상: 이 레벨이 되면 열려요 (없으면 처음부터 열림)
export const UNLOCKS = {
  table: { blue: 2, wine: 4, graphite: 6 },
  back: { red: 3, mint: 5, navy: 7 },
};
export const unlockLevel = (kind, id) => (UNLOCKS[kind] && UNLOCKS[kind][id]) || 1;
export const isUnlocked = (kind, id, level) => level >= unlockLevel(kind, id);
export function unlocksAt(level) {
  const out = [];
  for (const kind of Object.keys(UNLOCKS)) for (const [id, l] of Object.entries(UNLOCKS[kind])) if (l === level) out.push({ kind, id });
  return out;
}

export const emptyProgress = () => ({ xp: 0, day: '', counters: {}, done: [] });

// 날이 바뀌면 할 일 진행을 새로 시작
export function rollDay(p, date) {
  if (p.day !== date) { p.day = date; p.counters = {}; p.done = []; }
  return p;
}

// 판 시작: '3판 해 보기' 셈
export function onStart(p, date) {
  rollDay(p, date);
  p.counters.plays = (p.counters.plays || 0) + 1;
  return settle(p, date, 0);
}

// 판에서 이김: 경험치 + 할 일 셈. ev = { variant, suits, drawCount, daily, undos, hints, time }
export function onWin(p, date, ev) {
  rollDay(p, date);
  const c = p.counters;
  const inc = (k) => { c[k] = (c[k] || 0) + 1; };
  inc('wins');
  if (ev.daily) inc('daily');
  if (ev.variant === 'spider') inc('spider');
  if (ev.variant === 'freecell') inc('freecell');
  if (!ev.undos) inc('noundo');
  if (!ev.hints) inc('nohint');
  if (ev.time <= 300) inc('fast');
  if (ev.variant === 'klondike' && ev.drawCount === 3) inc('draw3');
  let xp = XP.win;
  if (!ev.undos) xp += XP.noUndo;
  if (ev.daily) xp += XP.daily;
  if (ev.variant === 'spider' && ev.suits === 2) xp += XP.spider2;
  if (ev.variant === 'spider' && ev.suits === 4) xp += XP.spider4;
  return settle(p, date, xp);
}

// 새로 끝난 할 일을 찾아 경험치를 더하고, 레벨이 오르면 알려요
function settle(p, date, baseXp) {
  const list = missionsFor(date);
  const newly = list.filter((id) => !p.done.includes(id) && (p.counters[MISSIONS[id].counter] || 0) >= MISSIONS[id].target);
  let xp = baseXp + newly.length * XP.mission;
  p.done.push(...newly);
  const allNow = newly.length > 0 && list.every((id) => p.done.includes(id));
  if (allNow) xp += XP.allMissions;
  const before = levelInfo(p.xp).level;
  p.xp += xp;
  const after = levelInfo(p.xp).level;
  const unlocked = [];
  for (let l = before + 1; l <= after; l++) unlocked.push(...unlocksAt(l));
  return { xp, missions: newly, allDone: allNow, levelUp: after > before ? after : 0, unlocked };
}
