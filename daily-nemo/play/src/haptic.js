// 햅틱(진동) — 토스 안에서는 토스 햅틱(release/toss/bridge.js의 window.ncqHaptic), 그 밖에서는 navigator.vibrate
// 아이폰 사파리처럼 진동을 지원하지 않는 곳에서는 조용히 넘어가요.

// 동작별 세기: [토스 햅틱 종류, 안드로이드 진동 패턴(ms)]
const PATTERNS = {
  select: ["tickWeak", 6],              // 칸 고르기
  place:  ["tap", 12],                  // 맞는 숫자
  note:   ["tickWeak", 6],              // 메모·지우기·되돌리기
  wrong:  ["error", [40, 40, 40]],      // 틀린 숫자 (두 번 툭툭)
  unit:   ["softMedium", [14, 50, 22]], // 줄·박스 완성
  hint:   ["basicMedium", 20],          // 힌트
  win:    ["confetti", [25, 60, 25, 60, 90]], // 다 풀었을 때
};

let enabled = () => true;
export function setHapticEnabled(fn) { enabled = fn; }

export function haptic(kind) {
  if (!enabled() || document.hidden) return;
  const p = PATTERNS[kind];
  if (!p) return;
  try {
    if (typeof window.ncqHaptic === "function") { window.ncqHaptic(p[0]); return; }
    navigator.vibrate?.(p[1]);
  } catch { /* 진동 미지원 */ }
}

// 설정 화면에 진동 스위치를 보여 줄지 (지원하는 기기에서만)
export function hapticSupported() {
  return typeof window.ncqHaptic === "function" || typeof navigator.vibrate === "function";
}
