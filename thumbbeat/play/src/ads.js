// 광고 도구 NcqAds — 출시 빌드(공유 테스트·구글플레이)는 회사 광고 도구를 window.NcqAds로 넣어 줘요.
// 개발 중(로컬 서버로 index.html을 열 때)에는 NcqAds가 없어서 이 대신 쓰는 것으로 버튼을 보이고 보상을 바로 줘요.
// 출시 빌드인데 NcqAds가 없으면(window.NCQ·window.Capacitor가 있으면) 광고도 보상도 모두 꺼요.
// AdMob ID는 코드에 적지 않아요. 관리자가 승인하면 서버가 만들어 빌드에 넣어요.
const dev = !window.NCQ && !window.Capacitor;
export const NcqAds = window.NcqAds || { can: () => dev, rewarded: async () => dev, interstitial: async () => false,
  banner: async () => false, hideBanner: async () => {}, ready: async () => false, privacyRequired: () => false,
  showPrivacyOptions: async () => false, bannerSpace: () => ({ top: 0, bottom: 0 }) };
