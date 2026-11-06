// 기기 안에만 저장 (이어하기, 기록, 설정, 오늘의 도전 달력). 저장이 막혀 있어도 게임은 돌아가요.
const KEY = 'pocket-solitaire:v1';
export const STORE_KEY = KEY;

const defaults = () => ({
  settings: { drawCount: 1, table: 'classic', music: true, sfx: true, haptics: true, face: 'simple', back: 'blue', designV: 2,
    variant: 'klondike', spiderSuits: 1, winnable: true, lefty: false, calm: false },
  stats: { played: 0, won: 0, bestTime: null, bestMoves: null, streak: 0, bestStreak: 0, best: {} }, // best: 게임 종류별 최고 기록
  progress: { xp: 0, day: '', counters: {}, done: [] }, // 경험치·오늘의 할 일
  daily: {}, // { '2026-10-31': { time, moves } }
  current: null, // { state, history, elapsed, mode, dailyDate }
  premium: false, // 광고 제거 구매
  hints: { date: '', used: 0, bonus: 0 }, // 오늘 쓴 무료 힌트·광고로 받은 힌트
  usedSeeds: {}, // 미리 풀어 본 판 목록에서 최근에 한 판 (같은 판이 바로 또 나오지 않게)
  legacyThemes: false, // 레벨 보상이 생기기 전부터 하던 사람: 원래 열려 있던 테마를 그대로 써요
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw);
    const base = defaults();
    const settings = { ...base.settings, ...d.settings };
    // 디자인 2판: 기본 카드를 '심플'(큰 글자)로 바꿈 — 예전 기본값을 쓰던 사람도 한 번 옮겨 줌
    if (!d.settings || !d.settings.designV) { settings.face = 'simple'; settings.designV = 2; }
    return {
      settings,
      stats: { ...base.stats, ...d.stats, best: { ...((d.stats && d.stats.best) || {}) } },
      daily: d.daily || {},
      current: d.current || null,
      premium: !!d.premium,
      hints: { ...base.hints, ...d.hints },
      progress: { ...base.progress, ...d.progress },
      usedSeeds: d.usedSeeds || {},
      // 레벨 보상 이전 기록(진행 정보 없이 판을 한 적 있음)이면 모든 테마를 열어 둬요
      legacyThemes: d.legacyThemes ?? (!d.progress && !!(d.stats && d.stats.played > 0)),
    };
  } catch {
    return defaults();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 기록 옮기기 코드: 진행 중인 판·산 상품은 빼고 기록만 글자로 (PS1-...)
export function exportCode(data) {
  const { current, premium, ...rest } = data;
  void current; void premium;
  return `PS1-${btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, ...rest }))))}`;
}
export function importCode(code) {
  const t = String(code || '').replace(/\s+/g, '');
  if (!t.startsWith('PS1-')) return null;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))));
    if (!d || typeof d !== 'object' || !d.stats || !d.settings || !d.progress) return null;
    delete d.v;
    return d;
  } catch {
    return null;
  }
}
