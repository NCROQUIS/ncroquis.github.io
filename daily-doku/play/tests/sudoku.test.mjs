import test from "node:test";
import assert from "node:assert/strict";
import { generate, daily, countSolutions, PEERS, DIFFICULTY, kstDateKey, dailyDifficulty, prevDateKey, stars, shareText } from "../src/sudoku.js";

function validSolution(g) {
  return g.every((v, i) => v >= 1 && v <= 9 && PEERS[i].every((p) => g[p] !== v));
}

for (const diff of Object.keys(DIFFICULTY).filter((d) => !d.startsWith("mini"))) {
  test(`${diff}: 정답판이 맞고, 문제는 유일해이며 정답과 일치`, () => {
    for (let s = 1; s <= 5; s++) {
      const t0 = Date.now();
      const p = generate(s * 7919, diff);
      const ms = Date.now() - t0;
      assert.ok(validSolution(p.solution));
      assert.equal(countSolutions(p.puzzle, 2), 1);
      p.puzzle.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
      assert.ok(p.clues <= DIFFICULTY[diff].clues + 4, `${diff} clues ${p.clues}`);
      assert.ok(ms < 2000, `생성 ${ms}ms`);
    }
  });
}

test("오늘의 한 판: 같은 날짜면 같은 문제, 다른 날짜면 다른 문제", () => {
  const a = daily(20261104), b = daily(20261104), c = daily(20261105);
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.notDeepEqual(a.puzzle, c.puzzle);
});

test("KST 날짜 키: UTC 15:00 이후면 다음 날", () => {
  assert.equal(kstDateKey(new Date("2026-11-04T14:59:00Z")), 20261104);
  assert.equal(kstDateKey(new Date("2026-11-04T15:00:00Z")), 20261105);
});

test("요일 난이도와 전날 계산", () => {
  assert.equal(dailyDifficulty(20261102), "easy");   // 월
  assert.equal(dailyDifficulty(20261104), "medium"); // 수
  assert.equal(prevDateKey(20261101), 20261031);
  assert.equal(prevDateKey(20260101), 20251231);
});

test("3스타와 결과 카드", () => {
  assert.equal(stars({ mistakes: 0, seconds: 100, difficulty: "easy" }), 3);
  assert.equal(stars({ mistakes: 2, seconds: 9999, difficulty: "easy" }), 1);
  const t = shareText({ dateKey: 20261104, seconds: 272, mistakes: 1, streak: 3, starCount: 2,
    boxMistakes: [1,0,0,0,0,0,0,0,0], hinted: [0,1,0,0,0,0,0,0,0] });
  assert.match(t, /데일리도쿠 11\/4\(수\) ⭐⭐/);
  assert.match(t, /4:32 · 실수 1/);
  assert.match(t, /🟨🟦🟩/);
  assert.match(t, /3일 연속/);
});
