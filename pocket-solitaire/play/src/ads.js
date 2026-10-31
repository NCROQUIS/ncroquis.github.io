// 광고 — 앱(안드로이드)에서는 AdMob(@capacitor-community/admob)으로 실제 광고를, 웹·개발 중에는 자리만 보여 줘요.
// 모든 함수는 Promise를 돌려주고, 광고가 실패해도 게임은 멈추지 않아요.
//
// 출시 표시: 출시 빌드에서는 고른 광고 지면만 window에 true로 들어와요. 개발 중(NCQ_PLATFORM 없음)에는 전부 켜서 자리를 확인해요.
// NCQ_ADS_BANNER: 하단 배너
// NCQ_ADS_INTERSTITIAL: 판 사이 전면 광고 (2판에 1번)
// NCQ_ADS_REWARDED: 보상형 광고 (오늘의 도전 연속 지키기)
import { ADMOB } from './config.js';
import { plugin, platform } from './platform.js';
import { Analytics } from './analytics.js';

const inDev = () => platform() === 'dev';
export const adSlotOn = (name) => inDev() || window[`NCQ_ADS_${name}`] === true;
const admob = () => plugin('AdMob');

let lastInterstitial = 0;
let gameEnds = 0;
let ready = false;
let interstitialLoaded = false;
let rewardedLoaded = false;
const INTERSTITIAL_GAP_MS = 90 * 1000; // 전면 광고 최소 간격
const INTERSTITIAL_EVERY = 2; // 판이 끝날 때 2판에 1번만 (리듬이 끊기지 않게)

async function preloadInterstitial() {
  const A = admob();
  if (!A || !adSlotOn('INTERSTITIAL')) return;
  try { await A.prepareInterstitial({ adId: ADMOB.interstitial, isTesting: ADMOB.testing }); interstitialLoaded = true; } catch { interstitialLoaded = false; }
}
async function preloadRewarded() {
  const A = admob();
  if (!A || !adSlotOn('REWARDED')) return;
  try { await A.prepareRewardVideoAd({ adId: ADMOB.rewarded, isTesting: ADMOB.testing }); rewardedLoaded = true; } catch { rewardedLoaded = false; }
}

export const Ads = {
  removed: false, // 광고 제거 인앱 구매 시 true
  log: [], // 테스트·디버깅용 기록
  native: false,

  // 앱 시작 시 한 번: 동의(유럽 등 필요한 지역만 창이 떠요) → 초기화 → 배너 → 전면·보상형 미리 받기
  async init({ onBannerHeight } = {}) {
    const A = admob();
    if (!A || this.removed) return false;
    this.native = true;
    try {
      await A.initialize({ initializeForTesting: ADMOB.testing });
      try {
        const info = await A.requestConsentInfo();
        if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') await A.showConsentForm();
      } catch { /* 동의 기능이 없는 버전이면 건너뜀 */ }
      ready = true;
      if (adSlotOn('BANNER')) {
        if (A.addListener) {
          A.addListener('bannerAdSizeChanged', (s) => onBannerHeight && onBannerHeight(s && s.height ? s.height : 0));
          A.addListener('bannerAdLoaded', () => Analytics.track('ad_impression', { type: 'banner' }));
        }
        await A.showBanner({ adId: ADMOB.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: this.bannerMargin || 0, isTesting: ADMOB.testing });
      }
      preloadInterstitial();
      preloadRewarded();
      return true;
    } catch (e) {
      console.warn('[ads] 초기화 실패', e);
      return false;
    }
  },

  bannerMargin: 0,
  async hideBanner() { try { await admob()?.hideBanner(); } catch { /* 무시 */ } },
  async resumeBanner() { try { await admob()?.resumeBanner(); } catch { /* 무시 */ } },

  async showInterstitial(reason) {
    gameEnds += 1;
    if (this.removed || !adSlotOn('INTERSTITIAL')) return false;
    if (gameEnds % INTERSTITIAL_EVERY !== 0) return false;
    const now = Date.now();
    if (now - lastInterstitial < INTERSTITIAL_GAP_MS) return false;
    const A = admob();
    if (A && ready) {
      if (!interstitialLoaded) { preloadInterstitial(); return false; }
      try {
        interstitialLoaded = false;
        await A.showInterstitial();
        lastInterstitial = Date.now();
        Analytics.track('ad_impression', { type: 'interstitial', reason });
        preloadInterstitial();
        return true;
      } catch { preloadInterstitial(); return false; }
    }
    lastInterstitial = now;
    this.log.push({ type: 'interstitial', reason });
    Analytics.track('ad_impression', { type: 'interstitial', reason, placeholder: 1 });
    return true;
  },

  // 보상형 광고: 끝까지 보면 true
  async showRewarded(reason) {
    if (!adSlotOn('REWARDED')) return true; // 지면을 끈 빌드에서는 광고 없이 보상
    const A = admob();
    if (A && ready) {
      if (!rewardedLoaded) { await preloadRewarded(); if (!rewardedLoaded) return false; }
      try {
        rewardedLoaded = false;
        const reward = await A.showRewardVideoAd();
        Analytics.track('ad_impression', { type: 'rewarded', reason });
        preloadRewarded();
        const ok = !!reward;
        if (ok) Analytics.track('ad_reward', { reason });
        return ok;
      } catch { preloadRewarded(); return false; }
    }
    this.log.push({ type: 'rewarded', reason });
    Analytics.track('ad_impression', { type: 'rewarded', reason, placeholder: 1 });
    Analytics.track('ad_reward', { reason, placeholder: 1 });
    return true;
  },
};
