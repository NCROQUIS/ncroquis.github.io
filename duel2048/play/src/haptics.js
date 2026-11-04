// 햅틱(진동) — 플랫폼마다 가능한 방법을 골라 쓴다.
// 1) 토스: 연결층(release/toss/bridge.js)이 넣는 window.NcqHaptic(type) — 앱인토스 SDK 햅틱
// 2) 안드로이드 브라우저·앱(웹뷰): navigator.vibrate(ms)
// 3) 아이폰 사파리(iOS 18+): vibrate가 없어서, 숨긴 스위치 체크박스를 눌러 시스템 햅틱을 낸다 (터치 안에서만 동작)
// 종류: light(밀기), medium(합치기), heavy(큰 합치기), bump(못 미는 방향), success(2048), error(게임 오버)

const VIBRATE = {
  light: 8,
  medium: 16,
  heavy: 28,
  bump: [6, 40, 6],
  success: [20, 60, 20, 60, 40],
  error: [40, 80, 60],
};
// 앱인토스 SDK 햅틱 종류에 맞춘 이름
const TOSS = {
  light: "tickWeak",
  medium: "tap",
  heavy: "basicMedium",
  bump: "tickWeak",
  success: "success",
  error: "error",
};

let iosSwitch = null;
function iosTick() {
  try {
    if (!iosSwitch) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
  } catch { /* 지원 안 함 */ }
}

const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent || "");

export function haptic(kind, enabled = true) {
  if (!enabled || (typeof document !== "undefined" && document.hidden)) return;
  try {
    if (typeof window !== "undefined" && typeof window.NcqHaptic === "function") {
      window.NcqHaptic(TOSS[kind] || "tap");
      return;
    }
    if (canVibrate) { navigator.vibrate(VIBRATE[kind] ?? 10); return; }
    if (isIOS) {
      // 아이폰은 세기 조절이 안 돼서 횟수로 구분
      iosTick();
      if (kind === "heavy" || kind === "success" || kind === "error") setTimeout(iosTick, 90);
      if (kind === "success") setTimeout(iosTick, 180);
    }
  } catch { /* 진동이 막힌 환경이면 조용히 무시 */ }
}

// 합친 타일 크기로 세기 결정: 128 이상은 강하게
export const mergeKind = (v) => (v >= 128 ? "heavy" : "medium");
