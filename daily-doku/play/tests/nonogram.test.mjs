// 네모로직 엔진 검증: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { NcqLang } from "../ncq/lang.js";
import { PICTURES, PALETTE, solutionOf, lineClue, cluesOf, solveLine, lineSolve, isLineSolvable, findHint, dailyNemo, nemoStars, nemoShareText } from "../src/nonogram.js";

test("그림은 모두 10x10이고 색이 정해져 있어요", () => {
  const ids = new Set();
  for (const p of PICTURES) {
    assert.equal(p.rows.length, 10, p.id);
    for (const r of p.rows) assert.equal(r.length, 10, `${p.id} ${r}`);
    for (const ch of p.rows.join("")) if (ch !== ".") assert.ok(PALETTE[ch], `${p.id} 색 ${ch}`);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(p.name && p.emoji);
  }
});

test("모든 그림이 추측 없이 줄 논리만으로 풀려요 (답이 하나)", () => {
  for (const p of PICTURES) assert.ok(isLineSolvable(p), p.id);
});

test("단서 계산", () => {
  assert.deepEqual(lineClue([1, 1, 0, 1, 1, 1, 0, 0, 1, 0]), [2, 3, 1]);
  assert.deepEqual(lineClue([0, 0, 0]), [0]);
  assert.deepEqual(lineClue([1, 1, 1]), [3]);
});

test("줄 풀이기: 겹치는 칸·빈 줄·모순", () => {
  const u = new Array(10).fill(-1);
  assert.deepEqual(solveLine([8], u), [-1, -1, 1, 1, 1, 1, 1, 1, -1, -1]);
  assert.deepEqual(solveLine([0], u), new Array(10).fill(0));
  assert.deepEqual(solveLine([10], u), new Array(10).fill(1));
  assert.deepEqual(solveLine([4, 5], u), [1, 1, 1, 1, 0, 1, 1, 1, 1, 1]);
  assert.equal(solveLine([3], [1, 0, 1, -1, -1, -1, -1, -1, -1, -1]), null);
});

test("힌트는 항상 정답과 같은 칸을 알려 줘요", () => {
  for (const p of PICTURES) {
    const sol = solutionOf(p), clues = cluesOf(sol);
    const known = new Array(100).fill(-1);
    for (let step = 0; step < 100; step++) {
      const h = findHint(clues, known);
      if (!h) break;
      assert.equal(h.value, sol[h.cell], p.id);
      known[h.cell] = h.value;
    }
    assert.ok(known.every((v, i) => v === sol[i]), `${p.id} 힌트만으로 끝까지`);
  }
});

test("오늘의 그림: 날짜마다 같고, 한 바퀴 안에서는 겹치지 않아요", () => {
  assert.equal(dailyNemo(20261104).pic.id, dailyNemo(20261104).pic.id);
  const N = PICTURES.length;
  // 2026-01-01부터 한 바퀴(N일)
  const ids = new Set();
  let d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < N; i++) {
    const k = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    ids.add(dailyNemo(k).pic.id);
    d = new Date(d.getTime() + 86400000);
  }
  assert.equal(ids.size, N);
  const t = dailyNemo(20261104);
  assert.equal(lineSolve(t.clues).ok, true);
});

test("별·공유 글 (그림 이름은 나오지 않아요)", () => {
  assert.equal(nemoStars(0), 3); assert.equal(nemoStars(2), 2); assert.equal(nemoStars(5), 1);
  const t = dailyNemo(20261104);
  NcqLang.set("ko");
  const text = nemoShareText({ dateKey: 20261104, seconds: 151, mistakes: 1, stars: 2, rowMistakes: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], rowHinted: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0], streak: 3 });
  assert.match(text, /11월 4일/); assert.match(text, /2:31/); assert.match(text, /🟩🟨🟦/);
  assert.ok(!text.includes(t.pic.name));
  NcqLang.set("en");
  const en = nemoShareText({ dateKey: 20261104, seconds: 151, mistakes: 0, stars: 3, rowMistakes: new Array(10).fill(0), rowHinted: new Array(10).fill(0), streak: 1 });
  assert.match(en, /November 4/); assert.match(en, /0 mistakes/); assert.ok(!en.includes(t.pic.name));
});
