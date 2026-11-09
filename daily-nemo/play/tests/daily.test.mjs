// 날짜·연속 기록 검증
import test from "node:test";
import assert from "node:assert/strict";
import { kstDateKey, prevDateKey, nextDateKey, computeStreak, streakAtRisk, formatTime, daysInMonth } from "../src/daily.js";

test("KST 날짜 키: UTC 15:00 이후면 다음 날", () => {
  assert.equal(kstDateKey(new Date(Date.UTC(2026, 10, 4, 14, 59))), 20261104);
  assert.equal(kstDateKey(new Date(Date.UTC(2026, 10, 4, 15, 0))), 20261105);
});

test("전날·다음 날 (달·해 넘김)", () => {
  assert.equal(prevDateKey(20260301), 20260228);
  assert.equal(nextDateKey(20261231), 20270101);
  assert.equal(daysInMonth(2026, 2), 28);
});

test("연속 기록: 당일·다음 날 풀이 인정, 하루 비면 끊김", () => {
  const r = (solvedOn) => ({ seconds: 100, solvedOn });
  const daily = { 20261101: r(20261101), 20261102: r(20261103), 20261103: r(20261103) };
  assert.deepEqual(computeStreak(daily, 20261103), { current: 3, best: 3 });
  assert.equal(computeStreak(daily, 20261104).current, 3); // 오늘 아직 안 풀어도 어제까지 이어짐
  assert.equal(computeStreak(daily, 20261105).current, 0);
  assert.equal(computeStreak({ 20261101: r(20261105) }, 20261105).current, 0); // 너무 늦게 메운 날은 빠져요
});

test("연속 기록 위험: 그제는 풀고 어제를 놓쳤을 때만", () => {
  const daily = { 20261102: { solvedOn: 20261102 } };
  assert.equal(streakAtRisk(daily, 20261104), true);
  assert.equal(streakAtRisk(daily, 20261103), false);
});

test("시간 표시", () => { assert.equal(formatTime(151), "2:31"); assert.equal(formatTime(5), "0:05"); });
