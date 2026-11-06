// 진동(햅틱) — 어디서 돌든 같은 이름으로 불러요.
// 토스: 연결층(release/toss/bridge.js)의 window.ncqHaptic → 토스 진동(generateHapticFeedback)
// 안드로이드 앱: Capacitor Haptics 플러그인 / 웹: navigator.vibrate (아이폰 브라우저는 진동이 없어요)
import { plugin } from './platform.js';

// 종류별 느낌: 토스 진동 이름, 앱 진동(impact·notification), 웹 진동 길이(ms)
const KINDS = {
  tick: { toss: 'tickWeak', app: ['impact', 'LIGHT'], web: 6 }, // 숫자가 올라갈 때처럼 아주 살짝
  place: { toss: 'tap', app: ['impact', 'LIGHT'], web: 10 }, // 카드를 놓을 때
  foundation: { toss: 'tickMedium', app: ['impact', 'MEDIUM'], web: 16 }, // 위 칸에 올릴 때
  error: { toss: 'error', app: ['notification', 'ERROR'], web: [14, 50, 14] }, // 못 놓는 곳
  burst: { toss: 'basicMedium', app: ['impact', 'HEAVY'], web: 24 }, // 불꽃이 터질 때
  success: { toss: 'success', app: ['notification', 'SUCCESS'], web: [20, 50, 34] }, // 클리어
  confetti: { toss: 'confetti', app: ['notification', 'SUCCESS'], web: [30, 60, 30, 60, 60] }, // 레벨 업·최고 기록
};

let on = true;
let last = 0;

function fire(kind) {
  const k = KINDS[kind];
  if (!on || !k || document.hidden) return;
  // 너무 촘촘하면 손에서 뭉개져요: 40ms 안의 진동은 건너뛰어요 (클리어 같은 큰 진동은 예외)
  const now = performance.now();
  if (now - last < 40 && kind !== 'success' && kind !== 'confetti') return;
  last = now;
  try {
    if (typeof window.ncqHaptic === 'function') { Promise.resolve(window.ncqHaptic(k.toss)).catch(() => {}); return; }
    const H = plugin('Haptics');
    if (H) {
      const [fn, arg] = k.app;
      const p = fn === 'impact' ? H.impact({ style: arg }) : H.notification({ type: arg });
      if (p && p.catch) p.catch(() => {});
      return;
    }
    if (navigator.vibrate) navigator.vibrate(k.web);
  } catch { /* 진동이 없는 기기 */ }
}

export const Haptics = {
  setOn(v) { on = !!v; },
  get on() { return on; },
  play: fire,
  // 여러 번 이어지는 진동: [[ms, 종류], ...]
  sequence(steps) { steps.forEach(([ms, kind]) => setTimeout(() => fire(kind), ms)); },
};
