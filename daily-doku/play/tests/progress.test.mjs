import test from "node:test";
import assert from "node:assert/strict";
import { INTRO_SEED, iga, generate, easySteps, countGeneric, geometry, findSingle as fs2, daily, findSingle, solveWithSingles, computeStreak, streakAtRisk, monthProgress, badges, countSolutions } from "../src/sudoku.js";

test("기법 난이도: 쉬움·보통은 싱글로 풀리고, 어려움·전문가는 막혀요", () => {
  for (let s = 1; s <= 6; s++) {
    assert.equal(solveWithSingles(generate(s * 101, "easy").puzzle).solved, true);
    assert.equal(solveWithSingles(generate(s * 101, "medium").puzzle).solved, true);
    assert.equal(solveWithSingles(generate(s * 101, "hard").puzzle).solved, false);
  }
});

test("오늘의 한 판도 싱글로 풀리고 답이 하나", () => {
  for (const k of [20261102, 20261104, 20261107, 20261231]) {
    const p = daily(k);
    assert.equal(solveWithSingles(p.puzzle).solved, true);
    assert.equal(countSolutions(p.puzzle, 2), 1);
  }
});

test("힌트: 찾은 수는 정답과 같고 설명이 있어요", () => {
  const p = generate(77, "medium");
  const g = p.puzzle.slice();
  for (let n = 0; n < 20; n++) {
    const h = findSingle(g);
    assert.ok(h);
    assert.equal(h.value, p.solution[h.cell]);
    assert.ok(h.text.length > 10);
    g[h.cell] = h.value;
  }
});

test("연속 기록: 당일·다음 날 풀이 인정, 하루 비면 끊김", () => {
  const d = {
    20261101: {}, 20261102: {}, 20261103: { solvedOn: 20261104 }, // 3일은 다음 날 메움
    20261104: {},
  };
  assert.deepEqual(computeStreak(d, 20261104), { current: 4, best: 4 });
  assert.equal(computeStreak(d, 20261105).current, 4);          // 오늘 아직 안 풀어도 유지
  assert.equal(computeStreak(d, 20261106).current, 0);          // 어제도 안 풀면 끊김
  const late = { 20261101: {}, 20261102: { solvedOn: 20261110 } }; // 너무 늦게 푼 건 불인정
  assert.equal(computeStreak(late, 20261102).best, 1);
});

test("연속 기록 위험: 그제는 풀고 어제를 놓쳤을 때만", () => {
  assert.equal(streakAtRisk({ 20261102: {} }, 20261104), true);
  assert.equal(streakAtRisk({ 20261103: {} }, 20261104), false);
  assert.equal(streakAtRisk({}, 20261104), false);
});

test("월간 완주와 배지", () => {
  const d = {};
  for (let i = 1; i <= 30; i++) d[20261100 + i] = { stars: i === 5 ? 3 : 1 };
  assert.equal(monthProgress(d, 2026, 11, 20261130).complete, true);
  assert.deepEqual(monthProgress(d, 2026, 11, 20261104), { done: 4, total: 30, complete: false });
  const b = Object.fromEntries(badges({ daily: d, stats: { classicWon: 0 } }, 20261130).map((x) => [x.id, x.got]));
  assert.equal(b.month, true); assert.equal(b.s30, true); assert.equal(b.perfect, true); assert.equal(b.d50, false);
});

test("숫자 조사", () => {
  assert.deepEqual([1,2,3,4,5,6,7,8,9].map(iga), ["1이","2가","3이","4가","5가","6이","7이","8이","9가"]);
});

test("신규 유저 첫 판: 단서가 많고 싱글로 풀리며 모두 같은 문제", () => {
  const a = generate(INTRO_SEED, "intro"), b = generate(INTRO_SEED, "intro");
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.ok(81 - a.clues >= 19 && 81 - a.clues <= 21, `blanks ${81 - a.clues}`);
  const st = easySteps(a.puzzle);
  assert.ok(st.solved && st.other >= 2 && st.other <= 5, JSON.stringify(st));
  assert.equal(solveWithSingles(a.puzzle).solved, true);
  assert.equal(countSolutions(a.puzzle, 2), 1);
});

test("신규 유저 1·2단계: 4x4·6x6 미니 판", () => {
  for (const [d, n, blanks] of [["mini4", 4, 6], ["mini6", 6, 12]]) {
    const p = generate(INTRO_SEED, d);
    assert.equal(p.n, n);
    assert.equal(p.puzzle.filter((v) => !v).length, blanks);
    assert.equal(countGeneric(p.puzzle), 1);
    assert.equal(easySteps(p.puzzle).other, 0); // 모두 '하나만 남은 칸'으로 풀려요
    const geo = geometry(n);
    p.solution.forEach((v, i) => { assert.ok(v >= 1 && v <= n); assert.ok(geo.peers[i].every((q) => p.solution[q] !== v)); });
    const h = fs2(p.puzzle); assert.equal(h.value, p.solution[h.cell]);
  }
  assert.deepEqual([geometry(6).bw, geometry(6).bh], [3, 2]);
});
