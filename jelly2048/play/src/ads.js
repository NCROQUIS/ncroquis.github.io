// 개발 중에는 NcqAds가 없어서 대신 써요.
// 출시 빌드인데 NcqAds가 없으면(window.NCQ·window.Capacitor가 있으면) 광고도 보상도 모두 꺼요
const dev = !window.NCQ && !window.Capacitor;
export const NcqAds = window.NcqAds || { can: () => dev, rewarded: async () => dev, interstitial: async () => false,
  banner: async () => false, hideBanner: async () => {}, ready: async () => false, privacyRequired: () => false,
  showPrivacyOptions: async () => false, bannerSpace: () => ({ top: 0, bottom: 0 }) };
