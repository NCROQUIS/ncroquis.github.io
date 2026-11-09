// 날짜·시드·연속 기록 (DOM 없음 — 브라우저와 Node 테스트에서 함께 써요)
// 데일리도쿠(daily-doku)의 src/sudoku.js와 같은 규칙이에요. 한쪽을 고치면 다른 쪽도 맞춰요.

// 시드 난수 (mulberry32): 같은 시드면 어디서나 같은 결과가 나와요
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 한국 시간 기준 날짜 키 (YYYYMMDD)
export function kstDateKey(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate();
}
const toKey = (t) => t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
const keyMs = (key) => Date.UTC(Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100);
export function prevDateKey(key) { return toKey(new Date(keyMs(key) - 86400000)); }
export function nextDateKey(key) { return toKey(new Date(keyMs(key) + 86400000)); }

export function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// 연속 기록에 들어가는 날: 그날이나 다음 날 안에 푼 경우 (어제 문제는 보관함에서 풀어 메울 수 있어요)
export function countsForStreak(rec, key) {
  if (!rec) return false;
  const on = rec.solvedOn || key;
  return on <= nextDateKey(key);
}

export function computeStreak(daily, today) {
  const ok = (k) => countsForStreak(daily[k], k);
  let cur = 0;
  let k = ok(today) ? today : prevDateKey(today);
  while (ok(k)) { cur++; k = prevDateKey(k); }
  let best = cur;
  for (const key of Object.keys(daily).map(Number).sort((a, b) => a - b)) {
    if (!ok(key) || ok(prevDateKey(key))) continue; // 연속 구간의 첫날에서만 셈
    let n = 0, j = key;
    while (ok(j)) { n++; j = nextDateKey(j); }
    best = Math.max(best, n);
  }
  return { current: cur, best };
}

// 어제를 놓쳐서 연속 기록이 끊길 참인지 (어제 문제를 풀면 이어져요)
export function streakAtRisk(daily, today) {
  const y = prevDateKey(today);
  return !daily[y] && countsForStreak(daily[prevDateKey(y)], prevDateKey(y));
}

export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
