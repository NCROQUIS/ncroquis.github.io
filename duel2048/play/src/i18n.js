// 언어: 공용 언어 모듈 NcqLang(ncq/lang.js, 킥오프가 관리)으로 해요. 글자 표는 src/texts.js
// 다른 파일은 여기서 import해서 늘 init 뒤에 써요: import { t, getLang, setLang, langList, locale } from "./i18n.js"
// 기본 언어: 주소 ?lang= → 고른 언어(duel2048:lang) → 기기 언어(선호 순서) → 영어
import { NcqLang } from "../ncq/lang.js";
import { TEXTS } from "./texts.js";

NcqLang.init({ id: "duel2048", texts: TEXTS });

export const t = (key, vars) => NcqLang.t(key, vars);
export const getLang = () => NcqLang.lang;
export const locale = () => (NcqLang.lang === "ko" ? "ko-KR" : "en-US");
export const langList = () => NcqLang.list(); // [{ code, name, current }]
export const setLang = (code) => NcqLang.set(code); // 저장하고 바꾸고 data-i18n을 다시 채움
export const onLangChange = (fn) => NcqLang.onChange(fn);
// 언어 메뉴 제목: 영어가 아니면 영어도 같이 ('언어 · Language') — 읽지 못하는 언어여도 찾아 돌아올 수 있게
export const langTitle = () => (NcqLang.lang === "en" ? t("language") : `${t("language")} · Language`);
