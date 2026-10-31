// 기기 안에만 저장 (이어하기, 기록, 설정, 오늘의 도전 달력). 저장이 막혀 있어도 게임은 돌아가요.
const KEY = 'pocket-solitaire:v1';

const defaults = () => ({
  settings: { drawCount: 1, table: 'classic', music: true, sfx: true, face: 'simple', back: 'blue', designV: 2 },
  stats: { played: 0, won: 0, bestTime: null, bestMoves: null, streak: 0, bestStreak: 0 },
  daily: {}, // { '2026-10-31': { time, moves } }
  current: null, // { state, history, elapsed, mode, dailyDate }
  premium: false, // 광고 제거 구매
  hints: { date: '', used: 0, bonus: 0 }, // 오늘 쓴 무료 힌트·광고로 받은 힌트
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
      stats: { ...base.stats, ...d.stats },
      daily: d.daily || {},
      current: d.current || null,
      premium: !!d.premium,
      hints: { ...base.hints, ...d.hints },
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
