// 진행 저장 (localStorage 키 하나)
const KEY = "dailynemo.v1";

export function defaultData() {
  return {
    daily: {},          // { [dateKey]: { seconds, mistakes, stars, rowMistakes, rowHinted, hints, pic, solvedOn } }
    progress: {},       // 풀다 만 날짜별 그림 { [dateKey]: 게임 상태 }
    unlocked: {},       // 보관함에서 광고로 연 지난 그림 { [dateKey]: true }
    friends: {},        // 친구 기록 링크로 받은 기록 { [dateKey]: [{ name, seconds }] }
    hints: 3,
    introDone: false,       // 5x5 연습 그림을 마쳤는지
    introProgress: null,    // 풀다 만 연습 그림
    rulesSeen: false,       // 하는 방법 안내를 봤는지
    settings: { sound: true, haptic: true, theme: "auto", name: "" },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    const def = defaultData();
    const out = { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } };
    if (!out.introDone && Object.keys(out.daily).length) out.introDone = true; // 이미 푼 사람은 연습을 건너뛰어요
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
