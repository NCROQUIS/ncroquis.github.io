// 화면 글자: 공용 언어 모듈 NcqLang(ncq/lang.js, 킥오프가 관리해서 고치지 않아요) + 이 게임의 글자 표(src/texts.js)
// 기본 언어: 주소의 ?lang= (시험·스크린샷) → 메뉴에서 고른 언어 → 기기 언어(선호 순서) → 영어
import { NcqLang } from '../ncq/lang.js';
import { TEXTS } from './texts.js';

NcqLang.init({ id: 'pocket-solitaire', texts: TEXTS });

export const t = NcqLang.t;
export const num = NcqLang.num;
export { NcqLang };
