// 어디서 돌고 있는지(개발·웹·안드로이드)와 출시 표시(테스트 기능)를 다뤄요.
// 출시 빌드에서는 고른 기능만 window에 true로 들어와요 (ncq-flags.js). 개발 중에는 모두 켜져요.
//
// NCQ_TEST_DEBUG: 디버그 도구 (자동 테스트용 훅, 메뉴의 이벤트 로그 보기)
// NCQ_TEST_CHEAT: 치트 메뉴 (바로 이기기, 기록 초기화)

export const platform = () => (window.NCQ && window.NCQ.NCQ_PLATFORM) || 'dev';
export const isNative = () => platform() === 'android' || platform() === 'ios';
export const testOn = (name) => platform() === 'dev' || window[`NCQ_TEST_${name}`] === true;
export const plugin = (name) => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

// 안드로이드 뒤로 가기 버튼: 열린 창이 있으면 닫고, 없으면 종료 확인
export function onBackButton(handler) {
  const App = plugin('App');
  if (!App || !App.addListener) return false;
  try { App.addListener('backButton', handler); return true; } catch { return false; }
}
export function exitApp() {
  const App = plugin('App');
  try { App && App.exitApp && App.exitApp(); } catch { /* 무시 */ }
}

// 외부 주소 열기 (앱에서는 시스템 브라우저)
export function openExternal(url) {
  const Browser = plugin('Browser');
  if (Browser && Browser.open) return Browser.open({ url }).catch(() => window.open(url, '_blank'));
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return Promise.resolve();
}
