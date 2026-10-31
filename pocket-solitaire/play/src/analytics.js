// 이벤트 로그: 잔존(D1·D7), 판 수, 광고 노출을 모아요.
// 앱(안드로이드)에서는 Firebase Analytics 플러그인이 있으면 그쪽으로 보내고, 없으면 기기 안에만 최근 기록을 남겨요.
// 개인 정보는 담지 않아요 (판 결과·설정·광고 노출 같은 게임 이벤트만).
import { plugin, platform } from './platform.js';
import { APP_VERSION } from './config.js';

const META_KEY = 'pocket-solitaire:meta';
const LOG_KEY = 'pocket-solitaire:events';
const MAX_LOG = 300;

const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 실패는 무시 */ }
}

let meta = readJSON(META_KEY, null);
let buffer = readJSON(LOG_KEY, []);

function send(name, params) {
  const FA = plugin('FirebaseAnalytics');
  if (FA && FA.logEvent) {
    try { FA.logEvent({ name, params }); } catch { /* 무시 */ }
  }
  if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...params });
}

export const Analytics = {
  // 앱을 열 때 한 번: 설치일·세션·잔존 날짜 계산
  open() {
    const today = dayStr();
    const first = !meta;
    if (!meta) meta = { installDate: today, sessions: 0, activeDays: [] };
    meta.sessions += 1;
    const newDay = !meta.activeDays.includes(today);
    if (newDay) meta.activeDays = [...meta.activeDays, today].slice(-60);
    writeJSON(META_KEY, meta);
    const dayN = dayDiff(meta.installDate, today);
    this.track('app_open', { first_open: first ? 1 : 0, session: meta.sessions });
    // 잔존: 설치 후 N일째 처음 들어온 날 한 번씩 (D1·D7·D30 지표)
    if (newDay && dayN > 0) {
      this.track('retention_day', { day_n: dayN });
      if (dayN === 1 || dayN === 7 || dayN === 30) this.track(`retained_d${dayN}`, {});
    }
  },

  track(name, params = {}) {
    const p = {
      ...params,
      day_n: meta ? dayDiff(meta.installDate, dayStr()) : 0,
      v: APP_VERSION,
      platform: platform(),
    };
    buffer.push({ t: Date.now(), name, ...p });
    if (buffer.length > MAX_LOG) buffer = buffer.slice(-MAX_LOG);
    writeJSON(LOG_KEY, buffer);
    send(name, p);
  },

  // QA용 요약 (디버그 메뉴에서 보여 줘요)
  summary() {
    const count = (n) => buffer.filter((e) => e.name === n).length;
    return {
      installDate: meta?.installDate,
      sessions: meta?.sessions || 0,
      activeDays: meta?.activeDays?.length || 0,
      gameStart: count('game_start'),
      gameEnd: count('game_end'),
      wins: buffer.filter((e) => e.name === 'game_end' && e.result === 'win').length,
      adImpressions: count('ad_impression'),
      recent: buffer.slice(-8).reverse(),
    };
  },
  get events() { return buffer.slice(); },
};
