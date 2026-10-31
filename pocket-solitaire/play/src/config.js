// 출시 설정을 한곳에 모았어요. 출시 전에 이 파일만 확인하면 돼요.

export const APP_VERSION = '0.3.0';

// AdMob 광고 단위 ID — 지금은 구글이 공개한 '테스트용' ID예요. 실제 ID를 받으면 여기만 바꾸세요.
// 앱 ID는 release/android.json의 admob_app_id에 따로 적어요.
export const ADMOB = {
  testing: true, // 실제 ID로 바꾸면 false
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

// 의견 보내기 버튼이 여는 구글 설문 주소 (비어 있으면 버튼에 '준비 중' 안내)
export const FEEDBACK_URL = '';

// 개인정보처리방침 주소 (스토어 등록·광고 동의 화면에 필요)
export const PRIVACY_URL = '';

// 인앱 상품 ID (구글플레이 콘솔에 같은 ID로 '관리되는 상품'을 만들어요)
export const IAP = {
  removeAds: 'remove_ads',
};

// 힌트: 하루 무료 개수, 보상형 광고 한 번에 주는 개수 (광고 제거 구매자는 무제한)
export const HINTS = {
  freePerDay: 5,
  perReward: 3,
};
