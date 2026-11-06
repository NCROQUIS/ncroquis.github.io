// 인앱 상품 — 엔크로키 공통 결제 도구 NcqIap으로만 붙여요 (AGENTS.md '결제 (NcqIap)').
// 구글플레이 결제(@capgo/native-purchases)와 토스 인앱 결제는 출시 빌드가 넣어 주는 NcqIap이 해요.
// 가격은 코드에 적지 않고 스토어에서 받아 보여 줘요. 지급은 main.js의 grantItem 한 곳에서 해요 (NcqIap.onGrant).
// 개발 중(npm run serve)에는 NcqIap이 없어서 아래 대신 쓰는 것으로 바로 산 것으로 해요.
// 출시 빌드인데 NcqIap이 없으면(window.NCQ·window.Capacitor가 있으면) 상품을 모두 숨겨요.
import { Analytics } from './analytics.js';

const dev = !window.NCQ && !window.Capacitor;
let grant = null;
export const NcqIap = window.NcqIap || { onGrant: (fn) => { grant = fn; }, can: () => dev, ready: async () => dev,
  price: () => '', owned: async () => false, restore: async () => ({ ok: dev, restored: [] }),
  buy: async (id) => (dev && grant && grant(String(id).toUpperCase(), {}) !== false ? { ok: true, id } : { ok: false, id }),
  buyOnce: async (id) => (dev && grant && grant(String(id).toUpperCase(), {}) !== false ? { ok: true, id } : { ok: false, id }) };

// 인앱 상품 (이름표 주석은 출시 때 고르는 이름이 돼요. 스토어 상품 ID는 이름의 소문자: remove_ads)
// 광고 제거는 한 번 사면 계속이에요: 배너·전면 광고 없음, 힌트 무제한, 보상형 혜택은 광고 없이
// NCQ_IAP_REMOVE_ADS: 광고 제거
const PRODUCT = 'remove_ads'; // 이벤트 기록에 남기는 스토어 상품 ID

// 광고 제거 사기 (비소모성). 성공하면 NcqIap이 grantItem을 먼저 불러 광고가 꺼져요.
// 실패 안내는 NcqIap이 띄워요 (사용자가 취소하면 조용히). 이미 샀으면 다시 지급하고 ok예요
export async function buyRemoveAds() {
  Analytics.track('iap_start', { product: PRODUCT });
  let r;
  try { r = await NcqIap.buyOnce('REMOVE_ADS'); } catch { r = { ok: false, code: 'ERROR' }; }
  if (r && r.ok) Analytics.track('iap_success', { product: PRODUCT, restored: r.restored ? 1 : 0, test: r.test || dev ? 1 : 0 });
  else Analytics.track('iap_fail', { product: PRODUCT, reason: (r && r.code) || 'ERROR' });
  return r || { ok: false };
}

// 구매 복원 ('구매 복원' 버튼): 산 광고 제거를 grantItem으로 다시 지급해요 → {ok, restored: [상품 이름]}
export async function restorePurchases() {
  let r;
  try { r = await NcqIap.restore(); } catch { r = { ok: false, restored: [], code: 'ERROR' }; }
  const p = { ok: r.ok ? 1 : 0, restored: (r.restored || []).length };
  if (!r.ok) p.reason = r.code || 'ERROR';
  Analytics.track('iap_restore', p);
  return r;
}
