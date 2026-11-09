// 언어 검증: 모든 키가 영어·한국어에 다 있고, 그림·난이도·배지 이름이 언어를 따라가요
import test from "node:test";
import assert from "node:assert/strict";
import { NcqLang } from "../ncq/lang.js";
import { TEXTS } from "../src/texts.js";
import { t } from "../src/i18n.js";
import { DIFFICULTY, badges } from "../src/sudoku.js";
import { PICTURES } from "../src/nonogram.js";

test("글자 표: 모든 키가 모든 언어에 있어요", () => {
  assert.deepEqual(NcqLang.missing(), {});
  assert.deepEqual(Object.keys(TEXTS).sort(), ["en", "ko"]);
  for (const code of ["en", "ko"]) for (const [k, v] of Object.entries(TEXTS[code])) assert.ok(typeof v === "string" ? v.length : v.other, `${code}.${k}`);
});

test("영어 복수형과 한국어", () => {
  NcqLang.set("en");
  assert.equal(t("days_n", { n: 1 }), "1 day");
  assert.equal(t("days_n", { n: 3 }), "3 days");
  assert.equal(t("share_mistakes", { n: 0 }), "0 mistakes");
  assert.equal(DIFFICULTY.easy.label, "Easy");
  assert.equal(PICTURES.find((p) => p.id === "cat").name, "Cat");
  NcqLang.set("ko");
  assert.equal(t("days_n", { n: 3 }), "3일");
  assert.equal(DIFFICULTY.easy.label, "쉬움");
  assert.equal(PICTURES.find((p) => p.id === "cat").name, "고양이");
  const data = { daily: {}, stats: { classicWon: 0 } };
  assert.equal(badges(data, 20261104)[0].label, "첫 한 판");
  NcqLang.set("en");
  assert.equal(badges(data, 20261104)[0].label, "First puzzle");
});

test("그림마다 이름이 두 언어에 있어요", () => {
  for (const p of PICTURES) {
    assert.ok(TEXTS.en["pic_" + p.id], p.id);
    assert.ok(TEXTS.ko["pic_" + p.id], p.id);
  }
});
