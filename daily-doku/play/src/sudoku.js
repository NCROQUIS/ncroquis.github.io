// 스도쿠 생성·풀이 로직 (DOM 없음 — 브라우저와 Node 테스트에서 함께 써요)

// 시드 난수 (mulberry32): 같은 시드면 어디서나 같은 문제가 나와요
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

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
export const boxOf = BOX;

// 같은 행·열·박스에 있는 칸 목록 (미리 계산)
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  }
  return [...s];
});

// 비트마스크 풀이기: 해의 개수를 limit까지 세요 (유일해 검사용)
export function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (v) {
      const b = 1 << v;
      if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0; // 모순
      rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
    }
  }
  let count = 0;
  function search() {
    // 후보가 가장 적은 빈칸부터
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & 0x3fe;
      const n = popcount(mask);
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best === -1) { count++; return count >= limit; }
    if (bestN === 0) return false;
    const r = ROW(best), c = COL(best), bx = BOX(best);
    for (let v = 1; v <= 9; v++) {
      const b = 1 << v;
      if (!(bestMask & b)) continue;
      g[best] = v; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      if (search()) return true;
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
    }
    return false;
  }
  search();
  return count;
}

function popcount(x) { let n = 0; while (x) { x &= x - 1; n++; } return n; }

// 꽉 찬 정답판 만들기
function makeSolution(rand) {
  const g = new Array(81).fill(0);
  function fill(i) {
    if (i === 81) return true;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    for (const v of nums) {
      if (PEERS[i].every((p) => g[p] !== v)) {
        g[i] = v;
        if (fill(i + 1)) return true;
      }
    }
    g[i] = 0;
    return false;
  }
  fill(0);
  return g;
}

// 난이도별 남길 단서 수 (적을수록 어려움)
export const DIFFICULTY = {
  easy:   { label: "쉬움",   clues: 42, target: 6 * 60 },
  medium: { label: "보통",   clues: 34, target: 10 * 60 },
  hard:   { label: "어려움", clues: 29, target: 15 * 60 },
  expert: { label: "전문가", clues: 25, target: 22 * 60 },
};

// 유일해를 지키며 칸을 지워 문제 만들기 (한 번 시도)
function carve(seed, difficulty) {
  const rand = rng(seed);
  const solution = makeSolution(rand);
  const puzzle = solution.slice();
  const target = DIFFICULTY[difficulty].clues;
  // 대칭(180도)으로 지워서 보기 좋게
  const order = shuffle([...Array(41).keys()], rand);
  let clues = 81;
  for (const i of order) {
    if (clues <= target) break;
    const j = 80 - i;
    const keep = [puzzle[i], puzzle[j]];
    puzzle[i] = 0; puzzle[j] = 0;
    const removed = i === j ? 1 : 2;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = keep[0]; puzzle[j] = keep[1]; }
    else clues -= removed;
  }
  // 대칭으로 더 못 지우면 한 칸씩 더 시도 (어려움·전문가용)
  if (clues > target) {
    for (const i of shuffle([...Array(81).keys()], rand)) {
      if (clues <= target) break;
      if (!puzzle[i]) continue;
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep;
      else clues--;
    }
  }
  return { puzzle, solution, clues, difficulty, seed };
}

// 풀이 기법으로 난이도 맞추기
// 쉬움·보통: 싱글 기법(한 칸에 한 숫자, 한 줄·박스에 한 자리)만으로 풀려야 해요
// 어려움·전문가: 싱글만으로는 막혀서 메모를 써야 해요
export function generate(seed, difficulty = "easy") {
  const wantSingles = difficulty === "easy" || difficulty === "medium";
  let last = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const p = carve((seed + attempt * 0x9e3779b1) >>> 0, difficulty);
    const singles = solveWithSingles(p.puzzle).solved;
    p.technique = singles ? "singles" : "advanced";
    if (singles === wantSingles) return p;
    last = p;
  }
  return last; // 드물게 조건을 못 맞추면 마지막 문제를 써요
}

// ---------- 사람이 쓰는 풀이 기법 ----------
const UNITS = (() => {
  const u = [];
  for (let r = 0; r < 9; r++) u.push({ kind: "row", idx: r, cells: [...Array(9).keys()].map((c) => r * 9 + c) });
  for (let c = 0; c < 9; c++) u.push({ kind: "col", idx: c, cells: [...Array(9).keys()].map((r) => r * 9 + c) });
  for (let b = 0; b < 9; b++) u.push({ kind: "box", idx: b, cells: [...Array(81).keys()].filter((i) => BOX(i) === b) });
  return u;
})();
export { UNITS };

// 칸마다 들어갈 수 있는 숫자 (비트마스크)
export function candidates(values) {
  return values.map((v, i) => {
    if (v) return 0;
    let m = 0x3fe;
    for (const p of PEERS[i]) if (values[p]) m &= ~(1 << values[p]);
    return m;
  });
}

const UNIT_NAME = { row: "가로줄", col: "세로줄", box: "박스" };
// 숫자 뒤 조사: 1·3·6·7·8은 받침이 있어서 '이', 2·4·5·9는 '가'
export const iga = (n) => `${n}${[1, 3, 6, 7, 8].includes(n) ? "이" : "가"}`;

// 다음에 둘 수 있는 수를 하나 찾아요 (사람이 찾기 쉬운 순서: 박스 → 줄 → 칸)
export function findSingle(values) {
  const cand = candidates(values);
  for (const kind of ["box", "row", "col"]) {
    for (const u of UNITS) {
      if (u.kind !== kind) continue;
      for (let v = 1; v <= 9; v++) {
        if (u.cells.some((i) => values[i] === v)) continue;
        const spots = u.cells.filter((i) => cand[i] & (1 << v));
        if (spots.length === 1) {
          return { cell: spots[0], value: v, kind: "hidden", unit: u,
            text: `이 ${UNIT_NAME[kind]}에서 ${iga(v)} 들어갈 수 있는 자리는 여기 하나뿐이에요.` };
        }
      }
    }
  }
  for (let i = 0; i < 81; i++) {
    if (values[i] || popcount(cand[i]) !== 1) continue;
    const v = Math.log2(cand[i]);
    return { cell: i, value: v, kind: "naked", unit: null,
      text: `같은 가로줄·세로줄·박스에 다른 숫자가 모두 있어서 이 칸에는 ${v}만 들어갈 수 있어요.` };
  }
  return null;
}

export function solveWithSingles(puzzle) {
  const g = puzzle.slice();
  let steps = 0;
  for (;;) {
    if (g.every((v) => v)) return { solved: true, steps, grid: g };
    const s = findSingle(g);
    if (!s) return { solved: false, steps, grid: g };
    g[s.cell] = s.value; steps++;
  }
}

// 한국 시간 기준 오늘 날짜 키 (YYYYMMDD 숫자)
export function kstDateKey(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate();
}

// 요일별 난이도: 월·화 쉬움 → 수·목 보통 → 금 보통 → 주말 어려움은 부담이라 보통 유지
export function dailyDifficulty(dateKey) {
  const y = Math.floor(dateKey / 10000), m = Math.floor(dateKey / 100) % 100, d = dateKey % 100;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  return dow === 1 || dow === 2 ? "easy" : "medium";
}

export function daily(dateKey = kstDateKey()) {
  // 날짜에 상수를 섞어 클래식 시드와 겹치지 않게
  return generate((dateKey * 2654435761) >>> 0, dailyDifficulty(dateKey));
}

// 날짜 키 → 전날 키 (연속 기록 계산용)
export function prevDateKey(key) {
  const y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

// 결과 3스타
export function stars({ mistakes, seconds, difficulty }) {
  let s = 1;
  if (mistakes === 0) s++;
  if (seconds <= DIFFICULTY[difficulty].target) s++;
  return s;
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Wordle식 결과 카드 문구 (박스별 실수 여부를 3x3 이모지로)
export function shareText({ dateKey, seconds, mistakes, streak, starCount, boxMistakes, hinted }) {
  const m = Math.floor(dateKey / 100) % 100, d = dateKey % 100;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = days[new Date(Date.UTC(Math.floor(dateKey / 10000), m - 1, d)).getUTCDay()];
  const grid = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
    const b = r * 3 + c;
    return boxMistakes[b] > 0 ? "🟨" : hinted[b] ? "🟦" : "🟩";
  }).join("")).join("\n");
  return `데일리도쿠 ${m}/${d}(${dow}) ${"⭐".repeat(starCount)}\n⏱ ${formatTime(seconds)} · 실수 ${mistakes}\n${grid}\n🔥 ${streak}일 연속`;
}

// 날짜 키 → 다음 날 키
export function nextDateKey(key) {
  const y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
  const t = new Date(Date.UTC(y, m - 1, d) + 86400000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
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
  // 최고 기록: 기록된 날짜를 훑어요
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

// 월간 달력 완주 트로피
export function monthProgress(daily, y, m, today) {
  const total = daysInMonth(y, m);
  let done = 0;
  for (let d = 1; d <= total; d++) {
    const k = y * 10000 + m * 100 + d;
    if (k > today) break;
    if (daily[k]) done++;
  }
  return { done, total, complete: done === total };
}

// 배지
export function badges(data, today) {
  const daily = data.daily;
  const recs = Object.values(daily);
  const { best } = computeStreak(daily, today);
  const months = new Set(Object.keys(daily).map((k) => Math.floor(k / 100)));
  const fullMonths = [...months].filter((ym) => monthProgress(daily, Math.floor(ym / 100), ym % 100, today).complete).length;
  return [
    { id: "first", icon: "🌱", label: "첫 한 판", got: recs.length >= 1 },
    { id: "perfect", icon: "⭐", label: "첫 별 3개", got: recs.some((r) => r.stars === 3) },
    { id: "s3", icon: "🔥", label: "3일 연속", got: best >= 3 },
    { id: "s7", icon: "🔥", label: "7일 연속", got: best >= 7 },
    { id: "s30", icon: "🏆", label: "30일 연속", got: best >= 30 },
    { id: "d10", icon: "📅", label: "10일 풀기", got: recs.length >= 10 },
    { id: "d50", icon: "📅", label: "50일 풀기", got: recs.length >= 50 },
    { id: "month", icon: "🗓️", label: "한 달 완주", got: fullMonths >= 1 },
    { id: "classic10", icon: "🧩", label: "클래식 10판", got: (data.stats?.classicWon || 0) >= 10 },
  ];
}
