// 진행 저장 (localStorage 키 하나)
const KEY = "dailydoku.v1";

export function defaultData() {
  return {
    daily: {},          // { [dateKey]: { seconds, mistakes, stars, boxMistakes, hinted, solvedOn } }
    unlocked: {},       // 보관함에서 연 지난 문제 { [dateKey]: true }
    friends: {},        // 친구 기록 링크로 받은 기록 { [dateKey]: [{ name, seconds }] }
    stats: { classicPlayed: 0, classicWon: 0, best: {} }, // best[difficulty] = seconds
    hints: 3,
    classicUnlocked: false,
    classicSinceAd: 0,
    inProgress: null,   // 이어하기용 게임 상태 (클래식)
    dailyProgress: {},  // 풀다 만 날짜별 문제 { [dateKey]: 게임 상태 }
    tutorialDone: false,    // 신규 유저 첫 판(쉬운 연습)을 마쳤는지
    tutorialProgress: null, // 풀다 만 첫 판
    tutorialStage: 1,       // 다음에 할 첫 판 단계 (1: 4×4, 2: 6×6, 3: 9×9)
    nemo: { daily: {}, progress: {}, introDone: false }, // 오늘의 네모로직 { daily: { [dateKey]: 기록 }, progress: { [dateKey]: 풀다 만 판 } }
    settings: { sound: true, haptic: true, big: false, theme: "auto", mistakeLimit: true, name: "" },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    const def = defaultData();
    const out = { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) }, nemo: { ...def.nemo, ...(d.nemo || {}) } };
    // 이미 플레이한 적 있는 사람은 첫 판을 건너뛰어요
    if (!d.tutorialDone && (Object.keys(out.daily).length || out.stats?.classicPlayed)) out.tutorialDone = true;
    // 예전 형식: 오늘의 한 판 이어하기가 inProgress에 있었어요
    if (out.inProgress?.mode === "daily") { out.dailyProgress[out.inProgress.dateKey] = out.inProgress; out.inProgress = null; }
    return out;
  } catch {
    return defaultData();
  }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 저장 불가 환경은 무시 */ }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return defaultData();
}
