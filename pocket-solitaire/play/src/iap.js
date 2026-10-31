// 인앱 상품 — 앱(안드로이드)에서는 @capgo/native-purchases로 구글플레이 결제, 개발 중에는 테스트 구매로 흉내 내요.
// 출시 표시: 출시 빌드에서는 고른 상품만 window에 true로 들어와요.
// NCQ_IAP_remove_ads: 광고 제거 (1회 구매, 배너·전면 광고 없음 + 힌트 무제한)
import { IAP } from './config.js';
import { plugin, platform, isNative } from './platform.js';
import { Analytics } from './analytics.js';

const billing = () => plugin('NativePurchases');
const INAPP = 'inapp';

// 이 빌드에서 상품을 팔 수 있는지: 개발 중이거나, 앱에서 고른 상품일 때
export const iapOn = (id) => platform() === 'dev' || (isNative() && window[`NCQ_IAP_${id}`] === true);

export const Purchases = {
  price: null, // 스토어에서 받은 가격 문구 (예: ₩3,900) — 가격은 코드에 적지 않아요 (스토어 정책)

  async init() {
    const S = billing();
    if (!S || !iapOn(IAP.removeAds)) return;
    try {
      const { isBillingSupported } = await S.isBillingSupported();
      if (!isBillingSupported) return;
      const { product } = await S.getProduct({ productIdentifier: IAP.removeAds, productType: INAPP });
      this.price = product && product.priceString;
    } catch { /* 상품 정보를 못 받아도 게임은 계속 */ }
  },

  // 이미 산 적이 있는지 (재설치·기기 변경 후 복원 포함)
  async owned() {
    const S = billing();
    if (!S) return false;
    try {
      const { purchases } = await S.getPurchases({ productType: INAPP });
      return (purchases || []).some((p) => p.productIdentifier === IAP.removeAds);
    } catch { return false; }
  },

  // 구매: 성공하면 true
  async buyRemoveAds() {
    Analytics.track('iap_start', { product: IAP.removeAds });
    const S = billing();
    if (!S) {
      if (platform() !== 'dev') return false;
      Analytics.track('iap_success', { product: IAP.removeAds, test: 1 });
      return true; // 개발 중 테스트 구매
    }
    try {
      const result = await S.purchaseProduct({ productIdentifier: IAP.removeAds, productType: INAPP, quantity: 1 });
      // 구글플레이는 3일 안에 구매 확인(acknowledge)을 해야 환불되지 않아요
      if (result && result.purchaseToken && S.acknowledgePurchase) {
        try { await S.acknowledgePurchase({ purchaseToken: result.purchaseToken }); } catch { /* 자동 확인되는 버전이면 무시 */ }
      }
      Analytics.track('iap_success', { product: IAP.removeAds });
      return true;
    } catch (e) {
      Analytics.track('iap_fail', { product: IAP.removeAds, reason: String((e && e.message) || e).slice(0, 60) });
      return false;
    }
  },

  async restore() {
    const S = billing();
    if (!S) return false;
    try { await S.restorePurchases(); } catch { /* 무시 */ }
    return this.owned();
  },
};
