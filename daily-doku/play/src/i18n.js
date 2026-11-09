// 언어: 영어(기본)·한국어. 화면 글자는 src/texts.js 한 곳에 있고, 그릴 때 t()로 가져와요.
// 다른 파일은 여기서 import해요 (이 파일을 불러올 때 init이 먼저 돌아서 늘 init 뒤에 써요).
import { NcqLang } from "../ncq/lang.js";
import { TEXTS } from "./texts.js";

NcqLang.init({ id: "daily-doku", texts: TEXTS });   // 주소 ?lang= → 고른 언어 → 기기 언어 → 영어

export const t = NcqLang.t;
export { NcqLang };

// 날짜 키(YYYYMMDD)를 지금 언어 형식으로. 예: { month: "short", day: "numeric" } → "Nov 8" · "11월 8일"
export function fmtKey(k, options) {
  const d = new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
  return NcqLang.date(d, Object.assign({ timeZone: "UTC" }, options));
}
