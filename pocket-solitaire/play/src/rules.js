// 게임 종류별 규칙 고르기 — 상태의 variant를 보고 맞는 규칙 묶음을 돌려줘요 (variant가 없으면 클론다이크)
import * as klondike from './engine.js';
import * as freecell from './freecell.js';
import * as spider from './spider.js';
import { t } from './i18n.js';

export const VARIANTS = { klondike, freecell, spider };
export const rulesOf = (st) => VARIANTS[(st && st.variant) || 'klondike'] || klondike;

// 게임 종류 이름 (화면 표시용, 지금 언어로)
export const variantName = (v) => t(`v_${v || 'klondike'}`);
export function modeLabel(st) {
  const v = (st && st.variant) || 'klondike';
  if (v === 'spider') return t('mode_spider', { n: st.suits || 1 });
  if (v === 'freecell') return t('v_freecell');
  return t('mode_klondike', { n: st.drawCount === 3 ? 3 : 1 });
}
// 기록을 따로 모으는 단위 (최고 기록·점수)
export const modeKey = (st) => {
  const v = (st && st.variant) || 'klondike';
  if (v === 'spider') return `spider${st.suits || 1}`;
  if (v === 'freecell') return 'freecell';
  return `klondike${st.drawCount === 3 ? 3 : 1}`;
};
