// 광고 — 엔크로키 공통 광고 도구 NcqAds로만 붙여요 (AGENTS.md '광고 (NcqAds)').
// 광고 키(AdMob ID)는 관리자 승인 뒤 출시 서버가 빌드에 넣어요. 그래서 이 레포에는 AdMob ID도, 광고 플러그인도 없어요.
// 개발 중(npm run serve)에는 NcqAds가 없어서 아래 대신 쓰는 것으로 '광고 자리'만 흉내 내요.
// 출시 빌드인데 NcqAds가 없으면(window.NCQ·window.Capacitor가 있으면) 광고도 보상도 모두 꺼요.
import { Analytics } from './analytics.js';
import { Sound } from './sound.js';
import { platform } from './platform.js';

const dev = !window.NCQ && !window.Capacitor;
export const NcqAds = window.NcqAds || { can: () => dev, rewarded: async () => dev, interstitial: async () => false,
  banner: async () => false, hideBanner: async () => {}, ready: async () => false, privacyRequired: () => false,
  showPrivacyOptions: async () => false, bannerSpace: () => ({ top: 0, bottom: 0 }) };

// 광고 지면 (이름표 주석은 출시 때 고르는 이름이 돼요)
// NCQ_ADS_BANNER: 배너 (안드로이드는 화면 위, 토스는 화면 아래)
// NCQ_ADS_GAME_END: 판이 끝난 뒤 전면 광고 (2판에 1번)
// NCQ_ADS_HINT: 힌트 추가 보상형 광고
// NCQ_ADS_STREAK: 오늘의 도전 연속 기록 지키기 보상형 광고
// NCQ_ADS_DAILY_UNDO: 오늘의 도전 되돌리기 1번 더 보상형 광고
// NCQ_ADS_STUCK_RESCUE: 막혔을 때 길 찾기 보상형 광고

// 배너 자리: 안드로이드·웹은 위(자주 누르는 아래 버튼 막대에서 떼어 실수로 누르는 일을 줄여요),
// 토스는 아래(토스의 ⋯·X 메뉴가 화면 오른쪽 위에 떠 있어서 겹치지 않게)
export const bannerPos = () => (platform() === 'toss' ? 'bottom' : 'top');

// 전면 광고 규칙: 처음 3판은 없음(첫인상), 2판에 1번, 앞 전면 광고 뒤 최소 3분 (NcqAds의 60초보다 넉넉하게)
export const GAME_END_RULES = { skipFirstGames: 3, every: 2, minGapMs: 180000 };
let gameEnds = 0;
const LAST_KEY = 'pocket-solitaire:lastad';
const lastShown = () => { try { return Number(localStorage.getItem(LAST_KEY)) || 0; } catch { return 0; } };
const markShown = () => { try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* 무시 */ } };
export const isDevAds = () => !window.NcqAds && dev; // 개발 중: 화면에 '광고' 자리만 보여 줘요

// 광고를 보는 동안 게임 소리·시간을 멈춰요
export const adState = { playing: false };
async function during(fn) {
  adState.playing = true;
  Sound.pause();
  try { return await fn(); } finally {
    adState.playing = false;
    Sound.resume();
  }
}

export const Ads = {
  removed: false, // 광고 제거 구매자
  log: [], // 개발 중 기록 (테스트용)

  // 광고 제거 구매자는 배너·전면 없음 (보상형 지면은 그대로 물어봐요 — 혜택은 main.js가 광고 없이 줘요)
  can(slot) { return !this.removed || !['BANNER', 'GAME_END'].includes(slot) ? NcqAds.can(slot) : false; },

  showBanner() {
    if (this.removed || !NcqAds.can('BANNER')) return;
    NcqAds.banner('BANNER', { position: bannerPos() }).then((shown) => { if (shown) Analytics.track('ad_impression', { type: 'banner', pos: bannerPos() }); });
  },
  hideBanner() { return NcqAds.hideBanner(); },

  // 판이 끝난 뒤 쉬는 지점에서만
  // played: 지금까지 끝낸 판 수 (처음 3판은 전면 광고 없이)
  async gameEnd(reason, { played = 99 } = {}) {
    const R = GAME_END_RULES;
    if (this.removed || !NcqAds.can('GAME_END') || played < R.skipFirstGames) return false;
    if (Date.now() - lastShown() < R.minGapMs) return false; // 앞 광고 뒤 3분 안에는 세지도 않아요
    gameEnds += 1;
    if (gameEnds % R.every !== 0) return false;
    const shown = await during(() => NcqAds.interstitial('GAME_END'));
    if (shown || isDevAds()) markShown();
    if (shown) Analytics.track('ad_impression', { type: 'interstitial', reason });
    if (isDevAds()) this.log.push({ type: 'interstitial', reason });
    return shown;
  },

  // 보상형: 끝까지 봤을 때만 true
  async hint() {
    const ok = await during(() => NcqAds.rewarded('HINT'));
    Analytics.track('ad_reward', { reason: 'hint', ok: ok ? 1 : 0 });
    if (isDevAds()) this.log.push({ type: 'rewarded', reason: 'hint' });
    return ok;
  },
  async dailyUndo() {
    const ok = await during(() => NcqAds.rewarded('DAILY_UNDO'));
    Analytics.track('ad_reward', { reason: 'daily_undo', ok: ok ? 1 : 0 });
    if (isDevAds()) this.log.push({ type: 'rewarded', reason: 'daily_undo' });
    return ok;
  },
  async stuckRescue() {
    const ok = await during(() => NcqAds.rewarded('STUCK_RESCUE'));
    Analytics.track('ad_reward', { reason: 'stuck_rescue', ok: ok ? 1 : 0 });
    if (isDevAds()) this.log.push({ type: 'rewarded', reason: 'stuck_rescue' });
    return ok;
  },
  async streak() {
    const ok = await during(() => NcqAds.rewarded('STREAK'));
    Analytics.track('ad_reward', { reason: 'streak', ok: ok ? 1 : 0 });
    if (isDevAds()) this.log.push({ type: 'rewarded', reason: 'streak' });
    return ok;
  },
};
