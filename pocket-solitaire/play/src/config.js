// 출시 설정을 한곳에 모았어요. 출시 전에 이 파일만 확인하면 돼요.

// 버전: 출시 빌드에서는 빌드할 때 고른 버전(window.NCQ.NCQ_VERSION), 개발 중에는 아래 값
export const APP_VERSION = (window.NCQ && window.NCQ.NCQ_VERSION) || 'dev';

// 광고 키(AdMob ID)는 코드에 적지 않아요. 관리자 승인 뒤 출시 서버가 빌드에 넣어요 (src/ads.js 참고).

// 의견 보내기 버튼이 여는 구글 설문 주소 (비어 있으면 버튼에 '준비 중' 안내)
export const FEEDBACK_URL = '';

// 개인정보처리방침 주소 (스토어 등록·광고 동의 화면에 필요)
export const PRIVACY_URL = 'https://ncroquis.github.io/privacy/pocket-solitaire/';

// 인앱 상품은 src/iap.js (결제 도구 NcqIap). 광고 제거 REMOVE_ADS의 스토어 상품 ID는 remove_ads예요:
// 구글플레이는 Play Console > 수익 창출 > 일회성 상품, 토스는 앱인토스 콘솔 > 인앱 결제에 만들어요 (가격은 콘솔에서)

// 힌트: 하루 무료 개수, 보상형 광고 한 번에 주는 개수 (광고 제거 구매자는 무제한)
export const HINTS = {
  freePerDay: 5,
  perReward: 3,
};

// 되돌리기: 일반 판은 무제한, 오늘의 도전은 판마다 이 횟수까지 (모두 같은 판이라 공정하게)
export const UNDO = {
  dailyLimit: 3,
  dailyBonusMax: 3, // 다 쓰면 보상형 광고로 1번씩, 한 판에 이만큼까지 더 (기록에는 쓴 횟수가 그대로 남아요)
};

// 게임 이용 등급: 시작 화면 아래에 늘 보여요 (토스 게임 출시 기준: 이용 등급을 3초 이상 표시)
// 게임물관리위원회(GRAC) 자체등급분류 조회 결과가 나오면 그 값으로 맞춰요 (구글플레이 공개 뒤 조회돼요)
// 글자는 글자 표(src/texts.js)의 키: rating_all(전체 이용가)·rating_12·rating_15·rating_18
export const RATING = {
  key: 'rating_all',
};
