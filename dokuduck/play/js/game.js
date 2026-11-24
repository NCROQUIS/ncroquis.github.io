/* dokuduck — 색 구역마다, 줄마다 오리 한 마리를 찾는 논리 퍼즐 */
(function () {
  'use strict';
  const E = window.DokuEngine, ART = window.DOKU_ART || {}, BANK = window.DOKU_BANK;
  const Metrics = window.DokuMetrics;
  const BLANK = 0, XM = 1, DUCK = 2, WRONG = 3;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const PALETTE = ['#F7A8C4', '#8FCDF2', '#8FDDB5', '#C3B1F0', '#FFB98A', '#CBE26B', '#5CC8C2', '#D9B48C', '#C9CED6', '#F58A8A', '#8FA3EE'];
  const TOOL_UNLOCK = { hint: 1, locate: 5, frog: 12, draft: 21 };            // 도구가 열리는 레벨 (오늘의 퍼즐은 아래 DAILY_UNLOCK)
  /* 화면 글자: js/texts.js의 표에서 지금 언어로 가져와요 (NcqLang, docs/ncq/lang.md). 글자는 그릴 때마다 tr()로 가져와요. */
  function tr(k, p) {
    const L = window.NcqLang;
    const beforeAccount = NEPTUNE && !partnerBooted;
    if (!beforeAccount && L && L.ready) return L.t(k, p);
    const T = window.DOKU_TEXTS || { en: {}, ko: {} }, table = T[beforeAccount ? startupLanguage() : 'en'] || T.en;
    let v = table[k] !== undefined ? table[k] : k;
    if (v && typeof v === 'object') v = p && p.n === 1 ? v.one : v.other;
    return String(v).replace(/\{(\w+)\}/g, (w, n) => (p && p[n] !== undefined ? p[n] : w));
  }
  function isKo() { const L = window.NcqLang; return !!(L && L.ready && L.lang === 'ko'); }
  function toolName(t) { return tr('tool_' + t); }
  const DRAFT_MAX = 3;                                                          // 낙서연필로 한 번에 그려 볼 수 있는 오리 수
  const COMBO_MAX = 5;
  // 오리 한마디: 멍한 말투는 좋지만, 연못 이야기나 뜻이 바로 안 와닿는 말은 넣지 않아요
  const LINE_CLEAR = ['clear_1', 'clear_2'], LINE_FAIL = ['fail_1', 'fail_2'];
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function iga(w) { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 ? '이' : '가'); }
  const TOOL_ICON = { hint: 'ic_bulb', locate: 'ic_find', frog: 'ic_frog', draft: 'ic_pencil' };
  // 연속 플레이 선물: 1~6일차는 작은 선물, 7일차는 큰 선물. 아직 안 열린 도구(TOOL_UNLOCK 레벨 전의 개굴점프·낙서연필)는 도쿠힌트로 대신 줘요.
  const STREAK_GIFT = [[['hint', 1]], [['frog', 1]], [['draft', 1]], [['hint', 1]], [['frog', 1]], [['draft', 1]], [['hint', 2], ['locate', 2]]];
  function streakGift(d) { return STREAK_GIFT[d - 1].map(r => S.level < TOOL_UNLOCK[r[0]] ? ['hint', r[1]] : r); }
  const DAILY_UNLOCK = 21;

  /* ---------- 광고 (docs/ncq/ads.md) ----------
     출시 빌드가 넣어 주는 NcqAds로만 불러요. 지면: TOOL(도구 +1 보상형), REVIVE(이어 하기 보상형), LEVEL_CLEAR(레벨 클리어 뒤 전면), BANNER(위쪽 배너).
     개발 중(파일을 바로 열거나 미리보기)에는 NcqAds가 없어서 아래 것을 대신 써요: 보상형은 광고 없이 바로 보상, 전면 광고는 없음.
     출시 빌드인데 NcqAds가 없으면(window.NCQ·window.Capacitor가 있으면) 광고도 보상도 모두 꺼요. */
  const ADS_DEV = !window.NcqAds && !window.NCQ && !window.Capacitor;
  const NcqAds = window.NcqAds || {
    can: () => ADS_DEV, rewarded: async () => ADS_DEV, interstitial: async () => false, banner: async () => false, hideBanner: async () => {},
    ready: async () => false, privacyRequired: () => false, showPrivacyOptions: async () => false, bannerSpace: () => ({ top: 0, bottom: 0 })
  };
  const AD_CLEAR_AFTER = 5, AD_CLEAR_EVERY = 3;                                 // 전면 광고: 5레벨을 넘긴 뒤(6레벨부터) 3판 깰 때마다 한 번 → 8, 11, 14…레벨을 깬 뒤
  let bannerOn = false;
  function adBanner() {                                                         // 첫 튜토리얼이 끝난 뒤부터 화면 맨 위에 배너를 띄워요 (자리는 --ncq-top이 비워 줘요)
    if (bannerOn || !S.tutorialDone) return;
    bannerOn = true;
    // NCQ_ADS_BANNER: 위쪽 배너 광고
    try { Promise.resolve(NcqAds.banner("BANNER", { position: "top" })).catch(() => {}); } catch (e) { /* 광고가 없어도 게임은 그대로 */ }
  }
  let adBusy = false;                                                           // 광고를 보는 동안에는 게임을 멈춰요 (시간도 가지 않고, 버튼을 또 눌러도 한 번만)

  /* ---------- 유틸 ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(arr, R) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fmtTime(s) { return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0'); }
  function dayIndex() { return Math.floor(Date.now() / 86400000); }            // UTC 기준 날짜
  function icon(name) { return '<span class="ic" style="background-image:url(' + (ART[name] || '') + ')"></span>'; }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------- 저장 ---------- */
  const KAKAO = window.NCQ && window.NCQ.NCQ_KAKAO;
  const NEPTUNE = !!(KAKAO && KAKAO.provider === 'neptune');
  // 공용 Neptune 백업은 app_id. 아래의 키만 복원해요. 다른 플랫폼의 기기 저장은 회원 계정으로 복사하지 않아요.
  const SAVE_KEY = NEPTUNE ? KAKAO.app_id + '.dokuduck.save.v2' : 'dokuduck.save.v2';
  let partnerBooted = false, partnerPaused = false;
  let partnerExtraRegistered = false, partnerBackupTimer = null;
  function partnerProgress() {
    // 도쿠덕의 랭킹 점수는 완료한 메인 레벨 수예요. 판 안의 콤보 점수·회원 정보는 보내지 않아요.
    const data = { schemaVersion: 1 };
    if (Number.isSafeInteger(S.level) && S.level >= 1) { data.score = S.level - 1; data.stage = S.level; }
    if (Number.isSafeInteger(S.wins) && S.wins >= 0) data.wins = S.wins;
    return data;
  }
  function backupPartner(immediate) {
    if (!partnerBooted || !partnerExtraRegistered) return;
    clearTimeout(partnerBackupTimer);
    const flush = () => {
      if (!partnerBooted || !partnerExtraRegistered) return;
      try {
        const sdk = window.NcqNeptune;
        if (sdk.status().ready) Promise.resolve(sdk.flush(!!immediate)).catch(() => {});
      } catch (e) { /* 백업 실패는 SDK에 남기고 다음 저장 때 재시도해요. */ }
    };
    if (immediate) flush(); else partnerBackupTimer = setTimeout(flush, 500);
  }
  function freshSave() {
    return {
      v: 1, tutorialDone: false, level: 1,
      tools: { hint: 2, locate: 1, frog: 0, draft: 0 },                         // 처음 주는 도구 (GPT 기획): 비상용만 주고 나머지는 깨면서 모아요. 이미 하던 저장의 개수는 그대로예요
      settings: { sfx: true, pattern: false, slow: false },
      cur: null, daily: { done: {}, best: null, cur: null, count: 0 },
      streak: { count: 0, last: -1 }, milestones: {}, seen: {}, wins: 0, tv: 2, adN: 0, vs: newVs(),
      dda: { state: 1, clean: 0, day: -1 }, cursor: {}
    };
  }
  let S = freshSave();
  /* 판 모양 바꾸기: 기기마다 정해지는 수(vs)로 같은 문제도 방향(반전·회전 8가지)과 색 배치를 다르게 내요.
     규칙이 대칭이라 답 하나·힌트 풀이·난이도 등급은 그대로예요. 판 정보(pk)에 넣어 두니 하던 판·다시 하기는 같은 모양이에요. */
  function newVs() { return (Math.random() * 1e9) | 0; }
  function vsOf(salt) { return hash((S.vs >>> 0) + ':' + salt); }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { Metrics.init(S, 'fresh'); return; }
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) { Metrics.init(S, 'unknown'); Metrics.step('save_read_failed', true); return; }
      if (d && d.v === 1) S = Object.assign(freshSave(), d, { tools: Object.assign(freshSave().tools, d.tools), settings: Object.assign(freshSave().settings, d.settings), daily: Object.assign(freshSave().daily, d.daily), streak: Object.assign(freshSave().streak, d.streak), dda: Object.assign(freshSave().dda, d.dda) });
      Metrics.init(S, 'existing');
      if (!S.vs) { S.vs = newVs(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { Metrics.step('save_write_failed', true); } }   // 예전 저장도 이제부터 여는 판은 모양이 달라져요
      if (S.settings.vib !== undefined) {                                        // 예전 저장의 진동 끔은 공용 진동 설정(NcqDevice)으로 한 번 옮겨요
        if (S.settings.vib === false && window.NcqDevice) window.NcqDevice.vibration(false);
        delete S.settings.vib;
      }
      if (d && d.v === 1 && d.tv === undefined) {                               // 도구 여는 레벨을 바꾸기 전의 저장: 이미 쓰던 도구는 소개를 다시 띄우지 않아요
        S.seen = Object.assign({}, S.seen);
        if (S.level >= TOOL_UNLOCK.locate) S.seen.tool_locate = 1;
        if (S.seen.unlock21) { S.seen.tool_frog = 1; S.seen.tool_draft = 1; }
        S.tv = 2;
      }
    } catch (e) { Metrics.init(S, 'unknown'); Metrics.step('save_read_failed', true); }
  }
  function save() {
    if (NEPTUNE && !partnerBooted) return false;
    if (G && G.status !== 'won') {
      const snap = snapshot();
      if (G.mode === 'main') S.cur = snap; else if (G.mode === 'daily') S.daily.cur = snap;
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); backupPartner(false); return true; }
    catch (e) { Metrics.step('save_write_failed', true); return false; }
  }

  /* ---------- 출제 정책 ----------
     4판 보통 → HARD(5의 배수) → 4판 보통 → SUPER HARD(10의 배수)를 끝없이 되풀이해요. 1000레벨을 넘어도 같은 규칙으로 이어지고,
     문제은행을 한 바퀴 돌면 같은 문제가 다른 방향·다른 색으로 다시 나와요.
     보통 판의 크기는 주기 8,10,10,9,(HARD),10,9,10,10,(SUPER HARD), 등급은 3까지. HARD는 등급 4, SUPER HARD는 등급 5 (처음 몇십 판은 낮춰서 시작). */
  const CYCLE = [8, 10, 10, 9, 10, 10, 9, 10, 10];
  const TIER_NAME = ['', 'HARD', 'SUPER HARD'];
  const FIXED = {                                                               // 처음 10판: [판 크기, 최소 등급, 최대 등급, 미리 놓인 오리]
    1: [4, 1, 1, 1], 2: [5, 1, 1, 1], 3: [6, 1, 1, 1], 4: [6, 1, 1, 1], 5: [8, 1, 1, 1],
    6: [6, 1, 2, 1], 7: [7, 1, 2, 1], 8: [8, 1, 2, 1], 9: [9, 1, 2, 1], 10: [9, 2, 2, 1]
  };
  const HARD_SIZE = [9, 10, 8, 10, 11, 10, 9, 10], SUPER_SIZE = [10, 9, 10, 11, 10, 9];    // 뒤쪽 판에서 돌려 쓰는 크기
  const rankMemo = {};
  // 그 크기·등급의 문제가 12개는 모여 있어야 써요 (몇 개뿐이면 같은 판이 자꾸 나와서 10×10으로 대신해요)
  function hasRank(size, rank) { const k = size + '/' + rank; if (rankMemo[k] === undefined) rankMemo[k] = (BANK['f' + size] || []).filter(p => p[2] === rank).length >= 12; return rankMemo[k]; }
  function tierOf(L) { return L % 10 === 0 ? 2 : L % 5 === 0 ? 1 : 0; }           // 0 보통, 1 HARD, 2 SUPER HARD
  /* HARD·SUPER HARD를 처음 깨면 받는 선물 (GPT 기획). SUPER HARD: 도쿠힌트 1 + 오리찾기 1.
     HARD: 5·15는 도쿠힌트 1, 25부터는 개굴점프 1과 낙서연필 1을 번갈아 (25 개굴 → 35 연필 → 45 개굴 …). */
  function levelGift(L) {
    if (L % 10 === 0) return [['hint', 1], ['locate', 1]];
    if (L % 5 !== 0) return [];
    return L < 25 ? [['hint', 1]] : [[((L - 25) / 10) % 2 === 0 ? 'frog' : 'draft', 1]];
  }
  function policy(L) {
    const t = tierOf(L), f = FIXED[L];
    const P = (size, rmin, rmax, prefill) => ({ size: size, rmin: rmin, rmax: rmax, prefill: prefill || 0, tier: t, hard: t > 0 });
    if (f) return P(f[0], f[1], f[2], f[3]);
    if (t === 2) {                                                              // SUPER HARD: 20은 등급 3, 30~90은 등급 4, 100부터 가장 어려운 등급 5
      if (L === 20) return P(9, 3, 3);
      if (L < 100) return P([9, 10, 10, 11, 10, 11, 10][L / 10 - 3], 4, 4);
      const size = SUPER_SIZE[(L / 10) % SUPER_SIZE.length];
      return P(hasRank(size, 5) ? size : 10, 5, 5);
    }
    if (t === 1) {                                                              // HARD: 15~35는 등급 3, 45부터 등급 4
      if (L < 45) return P([8, 9, 10][(L - 15) / 10], 3, 3);
      return P(HARD_SIZE[((L - 45) / 10) % HARD_SIZE.length], 4, 4);
    }
    const r = L <= 20 ? [1, 2] : L <= 50 ? [1, 3] : [2, 3];                     // 보통 판은 등급 3까지 (그 위는 HARD·SUPER HARD 몫)
    return P(CYCLE[(L - 11) % 10], r[0], r[1]);
  }
  function poolIndices(key, rank) {
    const pool = BANK[key];
    for (let d = 0; d < 5; d++) for (const r of (d ? [rank - d, rank + d] : [rank])) {
      const idx = []; pool.forEach((p, i) => { if (p[2] === r) idx.push(i); });
      if (idx.length) return idx;
    }
    return pool.map((p, i) => i);
  }
  /* 허용 등급 범위 안에서는 내부 난이도 상태로 고른다. 도움 없이 이기면 올라가고(51레벨 전 2번, 이후 1번),
     재시도·부활로 깬 판 뒤에는 내려간다. 하루 첫 판은 한 단계 쉽게. 같은 은행의 문제는 커서 순서대로 쓴다. */
  function ddaCap(L) { return L <= 5 ? 1 : L <= 20 ? 2 : L <= 50 ? 3 : L <= 100 ? 4 : L <= 200 ? 5 : 6; }
  function pickMain(L) {
    const pol = policy(L), today = dayIndex();
    const st = Math.max(L >= 51 ? 2 : 1, Math.min(S.dda.state, ddaCap(L)));
    const T = Math.max(pol.rmin, Math.min(pol.rmax, st));
    let rank = pol.rmin === pol.rmax ? pol.rmin : T <= 2 ? T : 2 + ((Math.random() * (T - 1)) | 0);   // 상태 3 이상이면 R2~R상태 중에서 고르기
    if (pol.rmin !== pol.rmax && S.dda.day !== today && rank > pol.rmin) rank--;                    // 하루 첫 판은 한 단계 쉽게
    S.dda.day = today;
    const key = (pol.prefill ? (L <= 6 ? 'a' : 'b') : 'f') + pol.size, cand = poolIndices(key, rank);
    const ck = key + 'r' + rank, ord = S.cursor[ck] || 0; S.cursor[ck] = ord + 1;
    const pass = Math.floor(ord / cand.length), idx = passOrder(cand, pass, ck)[ord % cand.length];
    const v = vsOf(key + '/' + idx);
    return { pk: [key, idx, (idx * 5 + pass * 3 + v) % 8, v % 997], hard: pol.hard, tier: pol.tier };       // 기기마다 다른 방향·색, 은행을 한 바퀴 돌면 또 다른 방향으로
  }
  // 은행을 한 바퀴 다 쓴 뒤에는 순서도 다시 섞어요 (바퀴마다 정해진 순서라 저장의 순번과 어긋나지 않고, 바퀴가 바뀔 때 같은 문제가 연달아 나오지 않게 해요)
  function passOrder(cand, pass, ck) {
    if (!pass || cand.length < 3) return cand;
    const mix = p => p ? shuffled(cand, rng(hash(ck) + p * 7919)) : cand;
    const a = mix(pass), prev = mix(pass - 1);
    if (a[0] === prev[prev.length - 1]) { const t = a[0]; a[0] = a[1]; a[1] = t; }
    return a;
  }
  function ddaAfterWin() {
    if (G.level < 6) return;
    const helped = G.used.hint + G.used.locate + G.used.frog + G.used.draft > 0, retried = G.revives > 0 || G.attempt > 1;
    if (!helped && !retried) { S.dda.clean++; if (S.dda.clean >= (G.level < 51 ? 2 : 1)) { S.dda.state = Math.min(6, S.dda.state + 1); S.dda.clean = 0; } }
    else { S.dda.clean = 0; if (retried) S.dda.state = Math.max(1, S.dda.state - 1); }
  }
  function pickDaily(day) {
    const size = [9, 10, 10, 9, 10, 10, 10][day % 7], rank = [2, 3, 2, 3, 3, 2, 3][day % 7];
    const cand = poolIndices('f' + size, rank);
    return { pk: ['f' + size, cand[(day * 7 + 3) % cand.length], day % 8], hard: false };
  }
  function tmap(n, t, r, c) {
    switch (t) {
      case 1: return [c, n - 1 - r]; case 2: return [n - 1 - r, n - 1 - c]; case 3: return [n - 1 - c, r];
      case 4: return [r, n - 1 - c]; case 5: return [n - 1 - r, c]; case 6: return [c, r]; case 7: return [n - 1 - c, n - 1 - r];
      default: return [r, c];
    }
  }
  function buildPuzzle(pk) {
    const e = BANK[pk[0]][pk[1]], n = Math.round(Math.sqrt(e[0].length)), t = pk[2];
    const src = E.decode(n, e[0], e[1]), reg = new Uint8Array(n * n), sol = new Int8Array(n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const p = tmap(n, t, r, c); reg[p[0] * n + p[1]] = src.reg[r * n + c]; }
    for (let r = 0; r < n; r++) { const p = tmap(n, t, r, src.sol[r]); sol[p[0]] = p[1]; }
    const pre = [];
    if (e.length > 4 && e[4] >= 0) { const p = tmap(n, t, (e[4] / n) | 0, e[4] % n); pre.push(p[0] * n + p[1]); }
    return { b: E.makeBoard(n, reg, sol), pre: pre };
  }

  /* ---------- 소리·진동 ---------- */
  // 녹음 효과음 (NcqSound가 있을 때): 오리 찾음 꽥, X 서걱, 지우기, 개굴점프 뾰옹. 없으면 아래 합성음
  // 크기는 버튼 소리(ui)와 가장 큰 순간(50ms)이 같게 맞춘 값이에요 (2026-11-24)
  const SFX = { quack: ['assets/audio/sfx_quack.mp3', 0.087], x: ['assets/audio/sfx_x.mp3', 0.13], erase: ['assets/audio/sfx_erase.mp3', 0.135], frog: ['assets/audio/sfx_frog.mp3', 0.11] };
  const SFX_VOL = 0.7;                                                           // 효과음 전체 크기 (2026-11-24: 30% 줄임)
  const Snd = {
    ctx: null, out: null,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      const N = window.NcqSound;                                                  // 공용 소리 모듈이 있으면 그 소리판에 이어요 (광고·화면 가림 때 멈춤)
      if (N) { try { this.ctx = N.context(); this.out = this.ctx ? N.output('sfx') : null; } catch (e) { this.ctx = null; this.out = null; } if (this.ctx) return; }
      try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    // 모든 효과음은 한 줄(bus)로 모아 압축기(compressor)를 거쳐 내보내요: 여러 소리가 한꺼번에 겹쳐도 갑자기 커지지 않게 눌러 줘요
    bus: null,
    dest() {
      if (!this.bus) {
        const c = this.ctx, out = this.out || c.destination;
        try {
          const k = c.createDynamicsCompressor(); k.threshold.value = -20; k.knee.value = 10; k.ratio.value = 12; k.attack.value = 0.002; k.release.value = 0.2;
          k.connect(out); this.bus = k;
        } catch (e) { this.bus = out; }
      }
      return this.bus;
    },
    // 녹음 효과음은 직접 받아 풀어 두고(AudioBuffer) 위 한 줄로 내요. 미리보기의 data: 주소는 받기(fetch)가 막혀서 글자를 직접 풀어요
    bufs: {}, last: {}, live: {},
    decode(src) {
      if (src in this.bufs || !this.ctx) return; this.bufs[src] = null;
      const ok = buf => { this.bufs[src] = buf; }, dec = ab => { const p = this.ctx.decodeAudioData(ab, ok, () => {}); if (p && p.then) p.then(ok, () => {}); };
      try {
        if (src.slice(0, 5) === 'data:') { const b = atob(src.slice(src.indexOf(',') + 1)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); dec(u.buffer); }
        else fetch(src).then(r => r.arrayBuffer()).then(dec, () => {});
      } catch (e) { /* 못 풀면 합성음 */ }
    },
    buf(src, vol, rate) {
      const c = this.ctx, b = this.bufs[src]; if (!b) { this.decode(src); return false; }
      const now = c.currentTime;
      if (now - (this.last[src] || -1) < 0.06) return true;                       // 같은 소리가 60ms 안에 또 오면 건너뛰어요 (드래그로 여러 칸)
      this.last[src] = now;
      const L = (this.live[src] = (this.live[src] || []).filter(v => v.end > now));
      if (L.length >= 2) { const o = L.shift(); try { o.g.gain.setTargetAtTime(0, now, 0.015); o.s.stop(now + 0.06); } catch (e) { /* 이미 멈춤 */ } }   // 같은 소리는 2개까지만 겹쳐요
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol * SFX_VOL;
      s.connect(g); g.connect(this.dest()); s.start();
      L.push({ s, g, end: now + b.duration / (rate || 1) });
      return true;
    },
    tone(type, f0, f1, dur, vol, delay, q) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * SFX_VOL, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (q) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = q; f.Q.value = 4; o.connect(f); node = f; }
      node.connect(g); g.connect(this.dest()); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      const c = this.ctx; if (!c) return;
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol * SFX_VOL;
      s.connect(f); f.connect(g); g.connect(this.dest()); s.start();
    },
    play(name, rate) {
      if (!S.settings.sfx) return;
      this.ensure(); if (!this.ctx) return;
      const f = SFX[name];
      if (f && this.buf(f[0], f[1], rate)) return;                                // 녹음 소리 (아직 못 풀었으면 이번만 아래 합성음)
      switch (name) {
        case 'x': this.noise(0.05, 0.22, 2600); break;
        case 'erase': this.noise(0.05, 0.12, 1400); break;
        case 'quack': this.tone('sawtooth', 620, 420, 0.09, 0.2, 0, 1300); this.tone('sawtooth', 540, 330, 0.13, 0.22, 0.1, 1100); break;
        case 'wrong': this.tone('square', 190, 110, 0.24, 0.044); break;
        case 'ui': this.tone('sine', 700, 900, 0.06, 0.12); break;
        case 'hint': this.tone('triangle', 660, 990, 0.14, 0.1); this.tone('triangle', 990, 1320, 0.16, 0.086, 0.1); break;
        case 'frog': this.tone('square', 150, 210, 0.07, 0.1, 0, 500); this.tone('square', 170, 240, 0.08, 0.1, 0.09, 600); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.08, i * 0.11)); break;   // 꽥은 다 같이 '여어!' 할 때 따로 한 번
        case 'lose': [392, 330, 262].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.26, 0.074, i * 0.16)); break;
      }
    }
  };
  /* ---------- 진동 (NcqDevice) ----------
     효과음과 같은 순간에 짧게 울려요. 세기는 '얼마나 큰 일인지'를 따라가요:
     tap 버튼·스위치 / light 내가 그린 표시(X·지우기)·힌트 켜짐 / medium 오리가 앉음·개굴 착지 /
     heavy 틀림(쿵)·HARD 등장 / warning 하트가 1개 남음 / error 하트를 다 씀 / success 클리어·보상.
     켬·끔과 기기별 진동 방식(앱·토스·브라우저)은 NcqDevice가 맡아요. */
  const VIB = { ui: 'tap', x: 'light', erase: 'light', hint: 'light', quack: 'medium', frog: 'medium', wrong: 'heavy', win: 'success', lose: 'error' };
  const VIB_SUPER = [30, 90, 30];                                               // SUPER HARD 등장: 쿵, 쿵
  // 카카오톡 빌드: 퍼블리셔가 넣은 카카오 햅틱(window.DokuHL, HLSDK.GenerateHapticFeedback). 다른 빌드에는 없어서 NcqDevice로 울려요
  const HL_KIND = { tap: 'tap', light: 'tickWeak', medium: 'softMedium', heavy: 'basicMedium', warning: 'wiggle', success: 'success', error: 'error' };
  function hl() { const h = window.DokuHL; return h && typeof h.haptic === 'function' ? h : null; }
  function buzz(kind) {
    if (!kind) return;
    const h = hl();
    if (h) { try { if (typeof h.hapticEnabled !== 'function' || h.hapticEnabled()) h.haptic(Array.isArray(kind) ? 'basicMedium' : (HL_KIND[kind] || 'tap')); } catch (e) { /* 진동이 안 돼도 게임은 그대로 */ } return; }
    const D = window.NcqDevice; if (D) { try { D.vibrate(kind); } catch (e) { /* 진동이 안 돼도 게임은 그대로 */ } }
  }
  function vibOn() { const h = hl(); if (h) { try { return typeof h.hapticEnabled === 'function' ? !!h.hapticEnabled() : true; } catch (e) { return true; } } const D = window.NcqDevice; return !!(D && D.vibration()); }
  function vibSet(on) { const h = hl(); if (h) { try { if (typeof h.setHapticEnabled === 'function') h.setHapticEnabled(on); } catch (e) { /* 무시 */ } return; } const D = window.NcqDevice; if (D) D.vibration(on); }
  /* ---------- 배경음 (NcqSound) ----------
     곡 파일은 끝의 무음을 잘라 둔 것(58.5초)이라 끝나면 바로 처음부터 되풀이해요. 켬·끔은 NcqSound가 기기에 저장해요 */
  const BGM = { src: 'assets/audio/bgm_brain_bounce.mp3', volume: 0.135 };   // 크기: 버튼 소리 기준의 3배 (2026-11-24, 사용자가 들어 보고 정함)
  function bgmStart() { const N = window.NcqSound; if (N) N.bgm(BGM.src, { volume: BGM.volume, loop: true }); }
  function bgmOn() { const N = window.NcqSound; return !!(N && N.enabled('bgm')); }
  function cue(name, vib, rate) { Snd.play(name, rate); buzz(vib === undefined ? VIB[name] : vib); }   // 소리 + 그 소리에 맞는 진동 (vib를 주면 그 진동, null이면 진동 없이)

  /* ---------- 구역 모양: 격자 외곽선을 따라가며 마커로 칠한 듯 살짝 흔들리는 경로를 만든다 ---------- */
  function regionPath(n, reg, g, R) {
    const U = 100, INSET = 3.4, AMP = 2.1;
    const inG = (r, c) => r >= 0 && r < n && c >= 0 && c < n && reg[r * n + c] === g;
    const out = new Map();
    const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; if (!out.has(k)) out.set(k, []); out.get(k).push([x2, y2]); };
    let inner = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!inG(r, c)) continue;
      if (!inG(r - 1, c)) add(c, r, c + 1, r);
      if (!inG(r, c + 1)) add(c + 1, r, c + 1, r + 1); else inner += 'M' + ((c + 1) * U + (R() - .5) * 3).toFixed(1) + ' ' + (r * U + 13) + 'L' + ((c + 1) * U + (R() - .5) * 3).toFixed(1) + ' ' + (r * U + 87);
      if (!inG(r + 1, c)) add(c + 1, r + 1, c, r + 1); else inner += 'M' + (c * U + 13) + ' ' + ((r + 1) * U + (R() - .5) * 3).toFixed(1) + 'L' + (c * U + 87) + ' ' + ((r + 1) * U + (R() - .5) * 3).toFixed(1);
      if (!inG(r, c - 1)) add(c, r + 1, c, r);
    }
    let d = '';
    while (out.size) {
      const k0 = out.keys().next().value, v0 = k0.split(',').map(Number), first = out.get(k0).shift();
      if (!out.get(k0).length) out.delete(k0);
      const loop = [v0];
      let cur = first, dir = [first[0] - v0[0], first[1] - v0[1]];
      for (let guard = 0; guard < 4000; guard++) {
        const k = cur[0] + ',' + cur[1], arr = out.get(k) || [], atStart = cur[0] === v0[0] && cur[1] === v0[1];
        const want = [cur[0] - dir[1], cur[1] + dir[0]];                       // 같은 칸을 끼고 도는 방향(오른쪽 회전) 우선
        let pick = -1;
        if (arr.length + (atStart ? 1 : 0) > 1) {
          if (atStart && want[0] === first[0] && want[1] === first[1]) break;
          pick = arr.findIndex(p => p[0] === want[0] && p[1] === want[1]);
          if (pick < 0) { if (atStart) break; pick = 0; }
        } else { if (atStart) break; pick = 0; }
        const nx = arr.splice(pick, 1)[0];
        if (!arr.length) out.delete(k);
        loop.push(cur); dir = [nx[0] - cur[0], nx[1] - cur[1]]; cur = nx;
      }
      // 일직선 위의 점 제거
      const V = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i + loop.length - 1) % loop.length], b = loop[i], c2 = loop[(i + 1) % loop.length];
        if ((b[0] - a[0]) * (c2[1] - b[1]) - (b[1] - a[1]) * (c2[0] - b[0]) !== 0) V.push(b);
      }
      const m = V.length, P = [], rad = [];
      for (let i = 0; i < m; i++) {
        const a = V[(i + m - 1) % m], b = V[i], c2 = V[(i + 1) % m];
        const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c2[0] - b[0]), Math.sign(c2[1] - b[1])];
        P.push([b[0] * U + INSET * (-d1[1] - d2[1]), b[1] * U + INSET * (d1[0] + d2[0])]);
        rad.push(d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 19 : 9);
      }
      const S0 = [], T0 = [], D = [], L = [];
      for (let i = 0; i < m; i++) {
        const a = P[i], b = P[(i + 1) % m], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
        const r1 = Math.min(rad[i], len * .42), r2 = Math.min(rad[(i + 1) % m], len * .42);
        S0.push([a[0] + dx * r1, a[1] + dy * r1]); T0.push([b[0] - dx * r2, b[1] - dy * r2]); D.push([dx, dy]); L.push(len - r1 - r2);
      }
      const f = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      d += 'M' + f(S0[0]);
      for (let i = 0; i < m; i++) {
        const k = Math.max(0, Math.round(L[i] / 34) - 1), pts = [S0[i]];
        for (let j = 1; j <= k; j++) {
          const t = j / (k + 1), w = (R() - .5) * 2 * AMP;
          pts.push([S0[i][0] + (T0[i][0] - S0[i][0]) * t - D[i][1] * w, S0[i][1] + (T0[i][1] - S0[i][1]) * t + D[i][0] * w]);
        }
        pts.push(T0[i]);
        for (let j = 1; j < pts.length - 1; j++) {
          const end = j === pts.length - 2 ? pts[j + 1] : [(pts[j][0] + pts[j + 1][0]) / 2, (pts[j][1] + pts[j + 1][1]) / 2];
          d += 'Q' + f(pts[j]) + ' ' + f(end);
        }
        if (pts.length === 2) d += 'L' + f(T0[i]);
        const cn = P[(i + 1) % m];
        d += 'Q' + f([cn[0] + (R() - .5) * 2.4, cn[1] + (R() - .5) * 2.4]) + ' ' + f(S0[(i + 1) % m]);
      }
      d += 'Z';
    }
    return { outline: d, inner: inner };
  }
  function patternDefs() {
    const ink = 'rgba(58,46,42,.26)', line = (d) => '<path d="' + d + '" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    const P = [
      '<circle cx="12" cy="12" r="4.5" fill="' + ink + '"/>', line('M-4 28L28 -4M10 42L42 10'), line('M-4 4L28 36M10 -10L42 22'), line('M0 12H32'), line('M12 0V32'),
      line('M0 16H32M16 0V32'), '<circle cx="16" cy="16" r="8" stroke="' + ink + '" stroke-width="4" fill="none"/>', line('M0 22L8 10L16 22L24 10L32 22'),
      line('M16 8V24M8 16H24'), '<circle cx="16" cy="16" r="9" fill="' + ink + '"/>', line('M0 0L32 32M32 0L0 32')
    ];
    return P.map((p, i) => '<pattern id="pt' + i + '" width="32" height="32" patternUnits="userSpaceOnUse">' + p + '</pattern>').join('');
  }

  /* ---------- 보드 화면 ---------- */
  const HAND_SVG = '<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M44 8c-7 0-12 5-12 12v44l-7-6c-6-5-14 1-11 8l13 32c4 10 12 16 24 16h8c14 0 23-9 23-22V66c0-8-9-12-15-8v-4c0-8-9-12-15-8V20c0-7-4-12-8-12z" fill="#fff" stroke="#3A2E2A" stroke-width="7" stroke-linejoin="round"/><path d="M52 50v14M67 58v10" stroke="#3A2E2A" stroke-width="5" stroke-linecap="round" fill="none"/></svg>';
  const XV = [['M24 26Q52 48 76 75', 'M77 24Q50 52 25 76'], ['M26 23Q46 52 75 77', 'M74 27Q52 47 23 74'], ['M23 28Q50 46 78 73', 'M75 22Q48 54 27 78']];
  function xSvg(i, cls) {
    const v = XV[i % XV.length];
    return '<svg class="mk x ' + (cls || '') + '" viewBox="0 0 100 100"><path pathLength="1" d="' + v[0] + '"/><path pathLength="1" d="' + v[1] + '"/></svg>';
  }
  // 판 위의 오리: 머리 묶음(.hd: 머리·깃털·볼터치·부리·눈) 위에 몸을 얹어 그려요. 몸은 가만히 있고, 머리 묶음만 기울여 갸우뚱, 얼굴 조각으로 눈 깜빡·고개 도리도리를 만들어요.
  function duckHTML(i, cls) {
    return '<span class="mk duck dk' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + tr('aria_duck') + '" style="--d:-' + ((i * 370) % 2600) + 'ms;--bd:' + (4.3 + (i * 7 % 5) * .5).toFixed(1) + 's;--fd:' + (11 + (i * 5 % 7) * 1.4).toFixed(1) + 's;--fo:-' + ((i * 3.7) % 11).toFixed(1) + 's"><span class="hd"><i class="hf"></i><i class="hr"></i><i class="fb"></i><i class="fk"></i><i class="fe"></i></span><i class="b0"></i><i class="b1"></i></span>';
  }
  const CHECK_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20 54Q33 66 42 77Q58 44 82 24"/></svg>';
  const View = {
    n: 0, cells: [], outline: [],
    build() {
      const b = G.b, n = b.n; this.n = n;
      const svg = $('#regions'); svg.setAttribute('viewBox', '0 0 ' + n * 100 + ' ' + n * 100);
      let html = '<defs>' + patternDefs();
      this.outline = []; this.frames = []; let body = '';
      for (let g = 0; g < n; g++) {
        const fr = [0].map(k => regionPath(n, b.reg, g, rng(G.seed + g * 97 + k * 7919)));
        this.outline[g] = fr[0].outline; this.frames[g] = fr.map(f => f.outline);
        // 마커로 지그재그 칠하는 마스크
        let r0 = n, r1 = -1, c0 = n, c1 = -1;
        b.regCells[g].forEach(i => { const r = (i / n) | 0, c = i % n; if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; });
        const x0 = c0 * 100 - 20, x1 = (c1 + 1) * 100 + 20, yEnd = (r1 + 1) * 100;
        let d = '', y = r0 * 100 + 30, dir = 0;
        for (; y < yEnd + 30; y += 58, dir ^= 1) d += (d ? 'L' : 'M') + (dir ? x1 : x0) + ' ' + y + 'L' + (dir ? x0 : x1) + ' ' + (y + 20);
        html += '<mask id="mk' + g + '" maskUnits="userSpaceOnUse" x="' + (x0 - 60) + '" y="' + (r0 * 100 - 60) + '" width="' + (x1 - x0 + 120) + '" height="' + (yEnd - r0 * 100 + 160) + '"><path class="paint" pathLength="1" stroke-width="84" style="animation-delay:' + (g * 55) + 'ms" d="' + d + '"/></mask>';
        body += '<g class="rgn" mask="url(#mk' + g + ')"><path class="fillp" d="' + fr[0].outline + '" fill="' + G.colors[g] + '"/><path class="pat" d="' + fr[0].outline + '" fill="url(#pt' + G.pats[g] + ')"/><path class="inner" d="' + fr[0].inner + '"/></g>';
      }
      svg.innerHTML = html + '</defs>' + body + '<g id="hl"></g><g id="bad"></g>';
      this.dimOff();
      this.fills = $$('.fillp', svg); this.patsEl = $$('.pat', svg); this.frame = 0;
      clearTimeout(this.maskTimer);
      this.maskTimer = setTimeout(() => $$('.rgn', svg).forEach(e => e.removeAttribute('mask')), 700 + n * 55);
      const cells = $('#cells'); cells.style.gridTemplateColumns = 'repeat(' + n + ',1fr)'; cells.style.gridTemplateRows = 'repeat(' + n + ',1fr)';
      let ch = ''; for (let i = 0; i < n * n; i++) ch += '<div class="cell"><span class="base"></span></div>';
      cells.innerHTML = ch; this.cells = $$('.cell', cells);
      $('#fx').innerHTML = '';
      $('#board').classList.toggle('patterns', !!S.settings.pattern);
      // 색깔별 진행 줄
      const order = []; for (let i = 0; i < n * n; i++) if (order.indexOf(b.reg[i]) < 0) order.push(b.reg[i]);
      const row = $('#g-colors'), mask = 'url(' + ART.duck_idle + ')';
      row.style.setProperty('--cd', Math.max(20, Math.min(window.innerHeight < 700 ? 36 : 46, Math.floor((Math.min(480, window.innerWidth) - 66) / n) - 4)) + 'px');
      row.innerHTML = order.map(g => '<span class="cdot" data-g="' + g + '" style="--c:' + G.colors[g] + '"><i style="-webkit-mask-image:' + mask + ';mask-image:' + mask + '"></i><img src="' + ART.duck_idle + '" alt=""><u></u></span>').join('');
      // 표시는 판이 칠해진 뒤에 차례로 나타난다
      const game = G; let k = 0;
      for (let i = 0; i < n * n; i++) if (G.marks[i] !== BLANK) { const idx = i; setTimeout(() => { if (G === game) this.cell(idx, true); }, 420 + (k++) * 22); }
      this.fit();
    },
    fit() {
      const h = $('#board-holder'), scr = $('#scr-game'); if (!h || !h.clientWidth) return;
      // 세로가 모자란 화면(작은 휴대폰, 위쪽 배너 광고): 판이 줄기 전에 위아래 줄을 먼저 줄여요.
      // 1단계(tight)는 여백·줄 높이를 작게. 그래도 한 칸이 34px보다 작아지면 2단계(tight2)로 규칙 카드까지 접어요 (칸이 큰 초반 판에서는 규칙 카드를 남겨요).
      const short = () => h.clientHeight - 8 < (h.clientWidth - 4) * 0.92;
      scr.classList.remove('tight', 'tight2');
      if (short()) { scr.classList.add('tight'); if (short() && (h.clientHeight - 8) / this.n < 34) scr.classList.add('tight2'); }
      const s = Math.floor(Math.min(h.clientWidth - 4, h.clientHeight - 8));
      const bd = $('#board'); bd.style.width = s + 'px'; bd.style.height = s + 'px';
      bd.style.fontSize = Math.max(9, (s - 10) / this.n * .34) + 'px';
    },
    cell(i, anim) {
      const m = G.marks[i], base = this.cells[i].firstChild, a = anim ? ' in' : '';
      let h = '';
      if (m === DUCK) h = duckHTML(i, anim ? 'in' : '');
      else if (m === WRONG) h = xSvg(i, 'wrong' + a);
      else if (m === XM) h = xSvg(i, a);
      else if (G.draft && G.draft[i] === 1) h = xSvg(i, 'draft' + a);
      else if (G.draft && G.draft[i] === 2) h = '<img class="mk duck draft' + a + '" src="' + ART.duck_idle + '" alt="">';
      base.innerHTML = h;
      if (m === DUCK && anim) { const el = base.firstChild; setTimeout(() => { if (el.isConnected) this.wave(el, 520); }, 250); }
    },
    erase(i) {
      const el = this.cells[i].firstChild.firstChild;
      if (!el || !el.classList.contains('x')) return this.cell(i);
      el.classList.remove('in'); el.classList.add('out');
      setTimeout(() => { if (this.cells[i] && this.cells[i].firstChild.firstChild === el) this.cell(i); }, 140);
    },
    // "여어!": 앉은 모양 그대로 한쪽 날개만 들었다가 팍 내려요
    wave(el, ms) {
      const t = el._w = (el._w || 0) + 1;
      el.classList.add('wave');
      setTimeout(() => { if (el._w !== t) return; el.classList.remove('wave', 'in', 'hop'); void el.offsetWidth; el.classList.add('settle'); }, ms);
    },
    // 튜토리얼: 판 전체를 한 장으로 어둡게 덮고, 눌러야 할 칸만 색 구역 모양 그대로 뚫어요
    dim(cells) {
      const n = this.n, L = n * 100 + 120, reg = G.b.reg, svg = $('#dim-svg'), seen = {};
      let rects = '', holes = '';
      cells.forEach(c => {
        rects += '<rect x="' + (c % n) * 100 + '" y="' + ((c / n) | 0) * 100 + '" width="100" height="100"/>';
        if (!seen[reg[c]]) { seen[reg[c]] = 1; holes += '<path d="' + this.outline[reg[c]] + '"/>'; }
      });
      svg.setAttribute('viewBox', '0 0 ' + n * 100 + ' ' + n * 100);
      svg.innerHTML = '<defs><clipPath id="dimclip">' + rects + '</clipPath><mask id="dimmask" maskUnits="userSpaceOnUse" x="-60" y="-60" width="' + L + '" height="' + L + '"><rect x="-60" y="-60" width="' + L + '" height="' + L + '" fill="#fff"/><g fill="#000" clip-path="url(#dimclip)">' + holes + '</g></mask></defs><rect class="dimr" x="-60" y="-60" width="' + L + '" height="' + L + '" mask="url(#dimmask)"/>';
      $('#dim').classList.add('on');
      const lit = new Set(cells); this.cells.forEach((el, i) => el.classList.toggle('unlit', !lit.has(i)));   // 밝게 남긴 칸이 아닌 칸 표시
    },
    dimOff() { $('#dim').classList.remove('on'); if (this.cells) this.cells.forEach(el => el.classList.remove('unlit')); },
    // 틀린 이유가 된 곳을 빨간 점선으로 잠깐 둘러요
    bad(html) {
      const g = $('#bad'); if (!g) return;
      g.innerHTML = html; clearTimeout(this.badTimer);
      this.badTimer = setTimeout(() => { g.innerHTML = ''; }, 1900);
    },
    box(c0, r0, c1, r1, cls) { return '<rect class="hl-line ' + cls + '" x="' + (c0 * 100 + 5) + '" y="' + (r0 * 100 + 5) + '" width="' + ((c1 - c0 + 1) * 100 - 10) + '" height="' + ((r1 - r0 + 1) * 100 - 10) + '" rx="26"/>'; },
    // 오리찾기: 손을 댄 색 구역 전체를 점선으로 보여 줘요
    pickHover(g) {
      const old = $('#hl .pick-on'); if (old) { if (+old.dataset.g === g) return; old.remove(); }
      if (g >= 0) $('#hl').insertAdjacentHTML('beforeend', '<path class="pick-on" data-g="' + g + '" d="' + this.outline[g] + '"/>');
    },
    burst(i) {
      const p = this.center(i), el = document.createElement('div');
      let d = ''; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + .3, c = Math.cos(a), sn = Math.sin(a); d += '<path pathLength="1" d="M' + (50 + c * 30).toFixed(1) + ' ' + (50 + sn * 30).toFixed(1) + 'L' + (50 + c * 47).toFixed(1) + ' ' + (50 + sn * 47).toFixed(1) + '"/>'; }
      el.innerHTML = '<svg class="sparks" viewBox="0 0 100 100" style="left:' + p[0] + '%;top:' + p[1] + '%;width:' + (240 / this.n) + '%">' + d + '</svg>';
      const sv = el.firstChild; $('#fx').appendChild(sv); setTimeout(() => sv.remove(), 560);
    },
    clearOverlays() { $$('.ov', $('#cells')).forEach(e => e.remove()); this.dimOff(); $('#hl').innerHTML = ''; this.handOff(); },
    hand(cells, mode) {
      this.handOff();
      if (!cells.length) return;
      const fx = $('#fx'), n = this.n, el = document.createElement('div'), ring = document.createElement('i');
      el.className = 'hand ' + mode; el.style.width = (120 / n) + '%'; el.innerHTML = HAND_SVG;
      ring.className = 'tapring ' + mode; ring.style.width = (100 / n) + '%';
      const put = c => { const p = this.center(c); el.style.left = ring.style.left = p[0] + '%'; el.style.top = ring.style.top = p[1] + '%'; };
      put(cells[0]); fx.appendChild(ring); fx.appendChild(el); this.handEl = el; this.ringEl = ring;
      if (mode === 'rub' && cells.length > 1) {
        let k = 0;
        this.handTimer = setInterval(() => {
          k = (k + 1) % (cells.length + 2);
          if (k < cells.length) { el.style.opacity = 1; put(cells[k]); }
          else if (k === cells.length) el.style.opacity = 0;
          else { el.style.transition = 'none'; put(cells[0]); void el.offsetWidth; el.style.transition = ''; }
        }, 340);
      }
    },
    handOff() { clearInterval(this.handTimer); if (this.handEl) this.handEl.remove(); if (this.ringEl) this.ringEl.remove(); this.handEl = this.ringEl = null; },
    overlay(i, html) { const d = document.createElement('div'); d.className = 'ov'; d.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;pointer-events:none'; d.innerHTML = html; this.cells[i].appendChild(d); },
    unit(type, idx, cls) {
      const n = this.n, hl = $('#hl');
      if (type === 'reg') hl.insertAdjacentHTML('beforeend', '<path class="hl-reg ' + (cls || '') + '" d="' + this.outline[idx] + '"/>');
      else {
        const x = type === 'col' ? idx * 100 + 5 : 5, y = type === 'row' ? idx * 100 + 5 : 5, w = type === 'col' ? 90 : n * 100 - 10, h = type === 'row' ? 90 : n * 100 - 10;
        hl.insertAdjacentHTML('beforeend', '<rect class="hl-line ' + (cls || '') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="26"/>');
      }
    },
    pickable(regs) { const hl = $('#hl'); regs.forEach(g => hl.insertAdjacentHTML('beforeend', '<path class="pick" d="' + this.outline[g] + '"/>')); },
    center(i) { const n = this.n; return [((i % n) + .5) / n * 100, (((i / n) | 0) + .5) / n * 100]; },
    float(i, text, sub) {
      const p = this.center(i), d = document.createElement('div'); d.className = 'float'; d.textContent = text;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; d.appendChild(s); }
      d.style.left = Math.min(88, Math.max(12, p[0])) + '%'; d.style.top = p[1] + '%';
      $('#fx').appendChild(d); setTimeout(() => d.remove(), 950);
    },
    confetti() {
      const fx = $('#fx');
      for (let k = 0; k < 34; k++) {
        const d = document.createElement('i'); d.className = 'bit';
        d.style.cssText = 'left:' + (20 + Math.random() * 60) + '%;top:' + (30 + Math.random() * 30) + '%;background:' + PALETTE[k % PALETTE.length] + ';--dx:' + ((Math.random() - .5) * 260) + 'px;--dy:' + (-60 - Math.random() * 180) + 'px;--rot:' + ((Math.random() - .5) * 720) + 'deg;animation-delay:' + (Math.random() * .25) + 's';
        fx.appendChild(d); setTimeout(() => d.remove(), 1500);
      }
    },
    cellAt(e) {
      const r = $('#cells').getBoundingClientRect(), n = this.n;
      const c = Math.floor((e.clientX - r.left) / r.width * n), rw = Math.floor((e.clientY - r.top) / r.height * n);
      return (c < 0 || c >= n || rw < 0 || rw >= n) ? -1 : rw * n + c;
    }
  };

  /* ---------- 게임 상태 ---------- */
  let G = null, screen = '', modalOpen = false;
  const UI = { mode: 'play', hint: null, busy: false };
  let metricModal = null, modalEpoch = 0, bootMainSnapshot = null, bootDailySnapshot = null;
  function metricRestore() {
    const g = screen === 'game' ? G : null;
    if (adBusy) return Metrics.flow('ad_wait', g);
    if (modalOpen && metricModal) return Metrics.flow(metricModal, g);
    if (!g) return screen === 'home' ? Metrics.flow('lobby', null) : undefined;
    if (!$('#tier').hidden) return Metrics.flow('tier_intro', g);
    if (g.status === 'won') return Metrics.flow(g.metricResultShown ? (g.metricStreakResult ? 'streak_result' : 'result') : 'clear_anim', g);
    if (g.status === 'lost') return; // 실패 창을 닫고 홈으로 가는 순간을 조작 가능한 판으로 만들지 않는다.
    if (g.tut) return Metrics.tutorialPrompt(g.tut.step, g);
    if (g.tt) return Metrics.flow('tool_trial', g);
    if (UI.hint) return Metrics.flow('hint_open', g);
    if (UI.mode === 'locate') return Metrics.flow('locate_pick', g);
    if (UI.mode === 'draft') return Metrics.flow('draft_open', g);
    if (!UI.busy) Metrics.flow(g.metricView || 'board_ready', g);
  }
  function metricGame(state) { if (G) G.metricView = state; metricRestore(); }
  function metricAction() {
    if (!G || G.tut || G.tt) return;
    Metrics.action(G);
    if (G.metricView !== 'playing') metricGame('playing');
  }
  function metricTrialDone(tool) {
    if (G && G.tt && G.tt.tool === tool) Metrics.step(tool + '_done');
  }

  function snapshot() {
    return { mode: G.mode, level: G.level, day: G.day, pk: G.pk, hard: G.hard, tier: G.tier, marks: Array.from(G.marks), hearts: G.hearts, found: G.found, mistakes: G.mistakes, score: G.score, combo: G.combo, secs: G.secs, used: G.used, revives: G.revives, status: G.status, lethal: G.lethal, attempt: G.attempt, practice: G.practice, metrics: G.metrics };
  }
  function setupGame(mode, opt, snap) {
    const built = buildPuzzle(opt.pk), b = built.b, n = b.n;
    const seed = hash(opt.pk.join('/') + '|' + (opt.level || opt.day || 0));
    const order = shuffled(PALETTE.map((c, i) => i), rng(seed));
    G = {
      mode: mode, level: opt.level || 0, day: opt.day || 0, pk: opt.pk, hard: !!opt.hard, tier: opt.tier !== undefined ? opt.tier : (opt.hard ? 2 : 0), practice: !!opt.practice, b: b, n: n, seed: seed, pre: built.pre,
      colors: order.slice(0, n).map(i => PALETTE[i]), pats: order.slice(0, n),
      marks: new Uint8Array(n * n), hearts: 3, found: 0, mistakes: 0, score: 0, combo: 0, secs: 0,
      used: { hint: 0, locate: 0, frog: 0, draft: 0 }, revives: 0, status: 'play', rev: 0, paidHint: null, draft: null, lethal: null, attempt: 1, tut: null
    };
    if (snap) {
      G.marks = Uint8Array.from(snap.marks); G.hearts = snap.hearts; G.found = snap.found; G.mistakes = snap.mistakes; G.score = snap.score; G.combo = snap.combo;
      G.secs = snap.secs; G.used = snap.used; G.revives = snap.revives; G.status = snap.status; G.lethal = snap.lethal || null; G.attempt = snap.attempt || 1; G.practice = !!snap.practice;
      G.metrics = snap.metrics ? Object.assign({}, snap.metrics) : null;
    } else built.pre.forEach(c => { G.marks[c] = DUCK; G.found++; });
    Metrics.prepare(G); G.metricView = 'board_ready';
    UI.mode = 'play'; UI.hint = null; UI.busy = false; lastTap.cell = -1;
  }
  function startMain(resume) {
    const fromBoot = resume && S.cur && S.cur === bootMainSnapshot && S.cur.level === S.level;
    if (resume && S.cur && S.cur.level === S.level) setupGame('main', S.cur, S.cur);
    else { const p = pickMain(S.level); setupGame('main', { pk: p.pk, level: S.level, hard: p.hard, tier: p.tier }); }
    if (fromBoot) { Metrics.step('saved_main_resume'); bootMainSnapshot = null; }
    enterGame(!(resume && S.cur && S.cur.level === S.level));
  }
  function startDaily(practice) {
    const day = dayIndex(), cur = S.daily.cur;
    const fromBoot = !practice && cur && cur === bootDailySnapshot && cur.day === day && cur.status !== 'won';
    if (!practice && cur && cur.day === day && cur.status !== 'won') setupGame('daily', cur, cur);
    else { const p = pickDaily(day); setupGame('daily', { pk: p.pk, day: day, practice: !!practice }); }
    if (fromBoot) { Metrics.step('saved_daily_resume'); bootDailySnapshot = null; }
    enterGame();
  }
  function enterGame(fresh) {
    Metrics.start(G); Metrics.checkpoint(G, 'start');
    show('game');
    $('#guide').hidden = true; $('#hintbar').hidden = true; $('#draftbar').hidden = true; toolsShown(true); $('#tools').classList.remove('dim'); ttMark(null); ttDraft(0); spot(false); okDim(false); $('#tier').hidden = true;
    $('#btn-rules').hidden = false; $('#hearts-row').hidden = false; $('#colors-row').hidden = false;
    const bd = $('#board'); bd.style.animation = 'none'; void bd.offsetWidth; bd.style.animation = '';
    View.build(); hud(true); status('');
    requestAnimationFrame(() => View.fit());
    save();
    if (G.status === 'lost') { const g = G; setTimeout(() => { if (G === g && screen === 'game' && g.status === 'lost') showFail(); }, 300); }
    else if (G.mode === 'main') {
      const g = G, tool = () => {                                               // 새로 열린 도구가 있으면 소개하고 한 번 써 보게 해요
        const t = ['locate', 'frog', 'draft'].find(k => G.level >= TOOL_UNLOCK[k] && !S.seen['tool_' + k]);
        if (t && G === g && G.status === 'play' && screen === 'game' && !modalOpen) showUnlock(t);
      };
      if (fresh && G.tier) {                                                     // HARD·SUPER HARD 판은 시작할 때 알려 줘요 (그동안은 판을 못 눌러요)
        UI.busy = true;
        setTimeout(() => {
          if (G !== g) return;
          if (screen === 'game' && !modalOpen) tierIntro(G.tier, () => setTimeout(tool, 200)); else { UI.busy = false; tool(); }
        }, 250);
      } else setTimeout(tool, 450);
    }
    metricRestore();
  }
  // HARD·SUPER HARD 판 시작 알림: 1초쯤 자동으로 나왔다가 사라져요 (글자는 영어로만 크게)
  let tierTok = 0;
  function tierIntro(t, done) {
    const el = $('#tier'), g = G, tok = ++tierTok;
    $('#tier-duck').src = ART[t === 2 ? 'duck_super' : 'duck_hard'] || ART.duck_think;
    $('#tier-title').textContent = TIER_NAME[t]; $('#tier-line').textContent = tr(t === 2 ? 'tier_line_2' : 'tier_line_1');
    el.className = 'tier t' + t; el.hidden = false; UI.busy = true; cue('hint', t === 2 ? VIB_SUPER : 'heavy'); metricRestore();
    setTimeout(() => {
      if (tok !== tierTok) return;
      el.hidden = true;
      if (G === g) { UI.busy = false; metricRestore(); if (done) done(); }
    }, 1500);
  }

  function toolLocked(t) { return G.mode !== 'tutorial' && S.level < TOOL_UNLOCK[t] && !(G.mode === 'main' && G.level >= TOOL_UNLOCK[t]); }
  let shownScore = 0, scoreAnim = 0, shownHearts = 3;
  function tweenScore(to) {
    const el = $('#g-score'), from = shownScore; shownScore = to;
    cancelAnimationFrame(scoreAnim);
    if (from === to) { el.textContent = to; return; }
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const t0 = performance.now();
    (function step(now) { const k = Math.min(1, (now - t0) / 380); el.textContent = Math.round(from + (to - from) * k); if (k < 1) scoreAnim = requestAnimationFrame(step); })(t0);
  }
  function hud(fresh) {
    $('#g-level-label').textContent = tr(G.mode === 'main' ? 'lbl_level' : G.mode === 'daily' ? (G.practice ? 'lbl_practice' : 'lbl_daily') : 'lbl_practice');
    const dt = new Date(G.day * 86400000);
    $('#g-level').textContent = G.mode === 'main' ? G.level : G.mode === 'daily' ? (dt.getUTCMonth() + 1) + '.' + dt.getUTCDate() : G.n + '×' + G.n;
    $('#g-badge').hidden = !G.tier; $('#g-badge').textContent = TIER_NAME[G.tier]; $('#g-badge').className = 'badge t' + G.tier;
    if (fresh) { shownScore = G.score; shownHearts = G.hearts; $('#g-score').textContent = G.score; } else tweenScore(G.score);
    let hh = ''; for (let i = 0; i < 3; i++) hh += '<span class="ic' + (i < G.hearts ? '' : ' empty') + (i >= G.hearts && i < shownHearts ? ' lost' : '') + '" style="background-image:url(' + (i < G.hearts ? ART.ic_heart : ART.ic_heart_empty) + ')"></span>';
    if (fresh || shownHearts !== G.hearts || !$('#g-hearts').firstChild) $('#g-hearts').innerHTML = hh;
    shownHearts = G.hearts;
    const A = E.analyze(G.b, G.marks);
    $$('.cdot', $('#g-colors')).forEach(el => el.classList.toggle('on', !!A.regHas[+el.dataset.g]));
    $$('.tool').forEach(el => {
      const t = el.dataset.tool, cnt = $('.cnt', el), locked = toolLocked(t);
      el.classList.toggle('locked', locked);
      el.classList.toggle('on', (t === 'locate' && UI.mode === 'locate') || (t === 'draft' && UI.mode === 'draft'));
      el.hidden = G.mode === 'tutorial' && t !== 'hint';
      if (locked) cnt.textContent = 'Lv.' + TOOL_UNLOCK[t];
      else if (G.mode === 'tutorial') cnt.textContent = '∞';
      else { const v = String(S.tools[t] > 0 ? S.tools[t] : '+'); if (!fresh && cnt.textContent !== v) { cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); } cnt.textContent = v; }
      cnt.classList.toggle('zero', !locked && G.mode !== 'tutorial' && S.tools[t] <= 0);
    });
  }
  function toolsShown(v) { $('#tools').style.visibility = v ? '' : 'hidden'; }
  function status(t) { $('#status').textContent = t || ''; }
  let toastTimer = 0;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1900); }

  /* ---------- 입력: 한 번 = X, 같은 칸 빠르게 두 번 = 오리, 드래그 = X 칠하기/지우기 ---------- */
  let ptr = null;
  const lastTap = { cell: -1, time: 0 };
  function dblMs() { return S.settings.slow ? 500 : 350; }
  function canInput() { return !partnerPaused && G && G.status === 'play' && !UI.busy && !modalOpen && !UI.hint && !(G.tt && G.tt.step === 1); }
  function editable(i) {
    if (G.tut) return G.tut.allow ? G.tut.allow.has(i) : G.tut.free;
    const k = ttdKind(); if (k !== null) return !!k && i === ttdCell();          // 낙서연필 써 보기: 표시된 칸만
    return true;
  }
  function paint(i, start) {
    if (!editable(i)) return;
    const m = G.marks[i];
    if (m === DUCK || m === WRONG) return;
    if (UI.mode === 'draft') {
      if (m !== BLANK) return;
      const dv = G.draft[i], k = ttdKind();
      if (k === 'duck') return;                                                 // 써 보기: 오리를 그릴 차례에는 두 번 톡톡만 받아요
      if (start) { lastTap.pi = i; lastTap.pv = dv; }
      if (ptr.pmode === null) ptr.pmode = dv ? 'erase' : 'add';
      if (ptr.pmode === 'add' && dv === 0) { G.draft[i] = 1; View.cell(i, true); cue('x'); if (k === 'x') ttdNext(); }
      else if (ptr.pmode === 'erase' && dv !== 0 && (start || dv === 1)) { G.draft[i] = 0; View.erase(i); cue('erase'); if (dv === 2) draftCount(); }
      return;
    }
    if (G.tut && G.tut.kind === 'x') {                                          // 튜토리얼 X 단계: 지정 칸에 X만 추가
      if (m === BLANK) { G.marks[i] = XM; G.rev++; View.cell(i, true); cue('x'); tutProgress(); }
      return;
    }
    if (G.tut && G.tut.kind === 'duck' && !start) return;
    if (ptr.pmode === null) ptr.pmode = m === BLANK ? 'add' : 'erase';
    if (ptr.pmode === 'add' && m === BLANK) { G.marks[i] = XM; G.rev++; metricAction(); View.cell(i, true); cue('x'); }
    else if (ptr.pmode === 'erase' && m === XM) { G.marks[i] = BLANK; G.rev++; metricAction(); View.erase(i); cue('erase'); }
  }
  function lineCells(a, b) {
    const n = G.n, out = [];
    let r0 = (a / n) | 0, c0 = a % n; const r1 = (b / n) | 0, c1 = b % n;
    const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0), sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
    let err = dc - dr;
    while (r0 !== r1 || c0 !== c1) { const e2 = 2 * err; if (e2 > -dr) { err -= dr; c0 += sc; } if (e2 < dc) { err += dc; r0 += sr; } out.push(r0 * n + c0); }
    return out;
  }
  function onDown(e) {
    Snd.ensure();
    if (ptr && ptr.id !== e.pointerId && performance.now() - ptr.t > 600) ptr = null;   // 아이폰: 손 뗀 신호를 못 받아 남은 누르기는 새 누르기에서 버려요
    if (ptr || !canInput()) return;
    const i = View.cellAt(e); if (i < 0) return;
    e.preventDefault();
    try { $('#board').setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    ptr = { id: e.pointerId, last: i, pmode: null, done: false, t: performance.now() };
    if (G.tut && View.handEl) { View.handEl.style.opacity = 0; if (View.ringEl) View.ringEl.style.display = 'none'; }
    if (UI.mode === 'locate') { ptr.pick = i; locateHover(i); return; }                 // 손을 댄 구역을 점선으로 보여 주고, 떼면 그 구역으로 정해요
    const now = performance.now();
    if (lastTap.cell === i && now - lastTap.time <= dblMs()) { lastTap.cell = -1; ptr.done = true; submitDuck(i); return; }
    lastTap.cell = i; lastTap.time = now;
    paint(i, true);
  }
  function locateHover(i) { View.pickHover(i >= 0 && openRegs().indexOf(G.b.reg[i]) >= 0 ? G.b.reg[i] : -1); }
  function onMove(e) {
    if (!ptr && G && UI.mode === 'locate' && e.pointerType === 'mouse' && canInput()) { locateHover(View.cellAt(e)); return; }
    if (ptr && ptr.id === e.pointerId && ptr.pick !== undefined) { ptr.pick = View.cellAt(e); locateHover(ptr.pick); return; }
    if (!ptr || ptr.id !== e.pointerId || ptr.done || !canInput()) return;
    const i = View.cellAt(e); if (i < 0 || i === ptr.last) return;
    lastTap.cell = -1;
    lineCells(ptr.last, i).forEach(c => paint(c, false));
    ptr.last = i;
  }
  function onUp(e) {
    if (!ptr || ptr.id !== e.pointerId) return;
    const pick = ptr.pick;
    ptr = null;
    if (pick !== undefined) { View.pickHover(-1); if (e.type === 'pointerup' && pick >= 0 && G && UI.mode === 'locate') locatePick(pick); return; }
    if (G && G.tut) tutHand();
    if (G && G.status === 'play') save();
  }

  /* ---------- 오리 제출 ---------- */
  function wrongReason(i) {
    const n = G.n, r = (i / n) | 0, c = i % n, nb = E.neighbors(n)[i];
    let sameReg = false, sameLine = false, adj = false, inRow = false, inCol = false; const near = [];
    for (let k = 0; k < n * n; k++) if (G.marks[k] === DUCK) {
      if (G.b.reg[k] === G.b.reg[i]) sameReg = true;
      if (((k / n) | 0) === r) inRow = true;
      if (k % n === c) inCol = true;
      if (nb.indexOf(k) >= 0) { adj = true; near.push(k); }
    }
    sameLine = inRow || inCol;
    const rule = sameReg ? 'color' : sameLine ? 'line' : adj ? 'adj' : '';
    if (rule) {
      // 위쪽 규칙 카드와 판 위의 그 자리(색 구역·줄·붙은 오리 둘레)를 빨간 점선으로 함께 보여 줘요
      const el = $('.rule[data-rule="' + rule + '"]'); el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('bad'), 1900);
      let h = '';
      if (rule === 'color') h = '<path class="hl-reg hl-bad" d="' + View.outline[G.b.reg[i]] + '"/>';
      else if (rule === 'line') h = (inRow ? View.box(0, r, n - 1, r, 'hl-bad') : '') + (inCol ? View.box(c, 0, c, n - 1, 'hl-bad') : '');
      else near.forEach(k => { const kr = (k / n) | 0, kc = k % n; h += View.box(Math.max(0, kc - 1), Math.max(0, kr - 1), Math.min(n - 1, kc + 1), Math.min(n - 1, kr + 1), 'hl-bad'); });
      View.bad(h);
    }
    return tr(sameReg ? 'wrong_color' : sameLine ? 'wrong_line' : adj ? 'wrong_adj' : 'wrong_spot');
  }
  function placeDuck(i, scored) {
    G.marks[i] = DUCK; G.found++; G.rev++; G.paidHint = null; metricAction();
    if (scored) { G.combo = Math.min(COMBO_MAX, G.combo + 1); const pts = 100 * G.combo; G.score += pts; View.float(i, '+' + pts, G.combo > 1 ? tr('combo', { n: G.combo }) : ''); }
    View.cell(i, true); View.burst(i); cue('quack', G.found >= G.n ? null : undefined); hud();   // 마지막 오리는 바로 이어지는 클리어 진동에 맡겨요
    if (G.found >= G.n) { win(); return true; }
    return false;
  }
  function submitDuck(i) {
    if (!editable(i)) return;
    const m = G.marks[i];
    if (m === DUCK || m === WRONG) return;
    if (UI.mode === 'draft') {
      const k = ttdKind(); if (k !== null && k !== 'duck') return;              // 써 보기: X 차례에는 한 번 누르기만 받아요
      const was = lastTap.pi === i ? lastTap.pv : G.draft[i];                    // 두 번 누르기의 첫 번째가 바꿔 놓기 전 상태
      lastTap.pi = -1;
      if (was !== 2 && draftDucks() >= DRAFT_MAX) {                              // 이미 3마리: 더 그리지 않고 첫 번째 누르기도 되돌려요
        G.draft[i] = was; View.cell(i); shake(i); toast(tr('draft_max', { n: DRAFT_MAX })); return;
      }
      G.draft[i] = was === 2 ? 0 : 2; View.cell(i, true); cue('ui'); draftCount();
      if (k === 'duck' && G.draft[i] === 2) ttdNext();
      return;
    }
    if (G.tut && G.tut.kind === 'x') return;
    if (G.b.solSet[i]) {
      if (G.tut && G.tut.kind === 'duck') Metrics.tutorialDone(G.tut.step);
      const done = placeDuck(i, true);
      if (!done) { save(); if (G.tut) tutProgress(); }
      return;
    }
    if (G.tut) { G.marks[i] = BLANK; View.cell(i); toast(tr('tut_wrong')); cue('wrong'); shake(i); return; }
    G.marks[i] = WRONG; G.rev++; G.paidHint = null; G.hearts--; G.mistakes++; G.combo = 0;
    if (G.mode === 'main') Metrics.step('mistake');
    if (G.hearts === 1) metricGame('hearts_low'); else if (G.hearts > 1 && G.mistakes === 1) metricGame('first_mistake');
    toast(wrongReason(i)); cue('wrong', G.hearts <= 0 ? null : G.hearts === 1 ? 'warning' : undefined); shake(i);   // 하트 1개 남으면 조심 신호, 다 쓰면 lose()의 실패 진동
    View.overlay(i, '<img class="mk duck" src="' + ART.duck_oops + '" alt="" style="animation:blink .25s 2">');
    setTimeout(() => { $$('.ov', View.cells[i]).forEach(x => x.remove()); View.cell(i, true); }, 480);
    hud();
    if (G.hearts <= 0) lose(); else save();
  }
  function shake(i) { const c = View.cells[i]; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }

  /* ---------- 승리·실패 ---------- */
  function touchStreak() {
    const d = dayIndex();
    if (S.streak.last === d) return 0;                                         // 오늘은 이미 이어졌어요
    S.streak.count = S.streak.last === d - 1 ? S.streak.count + 1 : 1; S.streak.last = d;
    return S.streak.count % 7 || 7;                                             // 오늘이 몇 일차인지 (1~7)
  }
  function streakNow() { return S.streak.last >= dayIndex() - 1 ? S.streak.count : 0; }   // 하루를 건너뛰면 끊긴 것으로 보여 줘요
  function streakWin(rewards, notes) {                                          // 그날 처음 깬 판이면 그 일차 선물을 줘요
    const d = touchStreak(); if (!d) return false;
    const o = {}; streakGift(d).forEach(r => { o[r[0]] = (o[r[0]] || 0) + r[1]; rewards.push(r); });
    grant(o); notes.push(d === 7 ? tr('gift_streak7') : tr('gift_streak', { n: d }));
    return true;
  }
  function grant(items) { Object.keys(items).forEach(k => { S.tools[k] = Math.min(999999, (S.tools[k] || 0) + items[k]); }); }
  function win() {
    const g0 = G;
    G.status = 'won'; UI.busy = true; ttEnd(); spot(false);
    const bonus = G.hearts * 200; G.score += bonus;
    const rewards = [], notes = []; let streakReward = false;
    if (G.mode === 'main') {
      ddaAfterWin();
      S.wins++; S.level = Math.max(S.level, G.level + 1); S.cur = null;
      if (G.level > AD_CLEAR_AFTER) S.adN = Math.min(99, (S.adN || 0) + 1);       // 전면 광고까지 깬 판 수
      const gift = levelGift(G.level);                                            // HARD·SUPER HARD를 처음 깼을 때만 받아요
      if (gift.length && !S.milestones[G.level]) {
        S.milestones[G.level] = 1; const items = {}; gift.forEach(r => { items[r[0]] = (items[r[0]] || 0) + r[1]; rewards.push(r); });
        grant(items); notes.push(tr('gift_tier', { tier: TIER_NAME[tierOf(G.level)] }));
      }
      streakReward = streakWin(rewards, notes);
    } else if (G.mode === 'daily') {
      S.daily.cur = null;
      if (!G.practice) {
        if (S.daily.done[G.day] === undefined) { S.daily.done[G.day] = G.secs; S.daily.count++; streakReward = streakWin(rewards, notes); }
        if (S.daily.best === null || G.secs < S.daily.best) S.daily.best = G.secs;
      }
    } else if (G.mode === 'tutorial') S.tutorialDone = true;
    Metrics.checkpoint(G, 'clear'); Metrics.end(G, true);
    const persisted = save(); G.metricStreakResult = !!streakReward && persisted;
    if (G.mode === 'main' && S.level >= DAILY_UNLOCK) Metrics.step('daily_unlocked');
    metricGame('clear_anim');
    cue('win');
    View.clearOverlays(); View.confetti();
    // 마지막 오리가 먼저 "여어!" 하고 손을 내린 다음(약 1.1초), 한 박자 쉬고 다 같이 "여어!"
    setTimeout(() => $$('.dk', $('#cells')).forEach(el => { el.classList.remove('in', 'settle'); el.classList.add('hop'); View.wave(el, 850); }), 1350);
    setTimeout(() => { if (G === g0) cue('quack', 'medium'); }, 1350);             // 다 같이 '여어!' 할 때 꽥 한 번 + 톡 (여러 마리여도 소리는 하나)
    setTimeout(() => { if (G === g0 && screen === 'game' && g0.status === 'won') showResult(rewards, notes, bonus); }, 2700);
  }
  function lose() {
    G.status = 'lost'; G.combo = 0; Metrics.step('hearts_empty'); ttEnd(); save();
    cue('lose');
    const g = G; setTimeout(() => { if (G === g && screen === 'game' && g.status === 'lost') showFail(); }, 650);
  }
  function restartSame() {
    if (G.status === 'lost') { Metrics.step('fail_retry'); Metrics.end(G, false); }
    const keepUsed = G.used, attempt = G.attempt + 1, mode = G.mode, opt = { pk: G.pk, level: G.level, day: G.day, hard: G.hard, tier: G.tier, practice: G.practice };
    setupGame(mode, opt); G.used = keepUsed; G.attempt = attempt;
    closeModal(); enterGame();
  }
  function revive() {
    if (G.lethal) { G.lethal.forEach(c => { if (G.marks[c] === WRONG) G.marks[c] = BLANK; }); G.lethal = null; }
    G.hearts = 3; G.combo = 0; G.revives++; G.status = 'play'; UI.busy = false;
    Metrics.step('revive'); G.metricView = 'playing';
    closeModal(); for (let i = 0; i < G.n * G.n; i++) View.cell(i); hud(); save(); toast(tr('revived')); buzz('success');
  }

  /* ---------- 도구 ---------- */
  function needTool(t) {
    // NCQ_ADS_TOOL: 도구 +1 보상형 광고
    // (도구가 다 떨어졌을 때 '광고 보고 +1')
    const head = '<img class="hero" src="' + ART.duck_think + '" alt=""><h2>' + tr('need_title', { tool: isKo() ? iga(toolName(t)) : toolName(t) }) + '</h2>';
    if (!NcqAds.can("TOOL")) {                                                  // 광고를 끈 빌드: 버튼 없이 모으는 방법만 알려 줘요
      return openModal(head + '<p>' + tr('need_noad') + '</p><div class="col"><button class="btn primary" data-act="close">' + tr('close') + '</button></div>', {}, false, 'tool_empty');
    }
    openModal(head + '<p>' + tr('need_ad', { tool: toolName(t) }) + '</p>' +
      '<div class="col"><button class="btn primary" data-act="ad">' + icon(TOOL_ICON[t]) + tr('btn_ad_plus') + '</button><button class="btn ghost" data-act="close">' + tr('close') + '</button></div>' + (ADS_DEV ? '<p class="note">' + tr('dev_tool') + '</p>' : ''),
      {
        async ad() {
          if (adBusy) return;
          const g = G, epoch = modalEpoch; adBusy = true; metricRestore();
          let ok = false; try { ok = await NcqAds.rewarded("TOOL"); } catch (e) { ok = false; }   // 끝까지 봤을 때만 true예요
          adBusy = false;
          if (G !== g || screen !== 'game' || modalEpoch !== epoch) { metricRestore(); return; }
          if (!ok) { metricRestore(); return; }                                                      // 중간에 닫았거나 광고가 없으면 그대로 둬요 (안내는 NcqAds가 해요)
          grant({ [t]: 1 }); save(); buzz('success');
          if (G === g) { closeModal(); hud(); }
          toast(toolName(t) + ' +1');
        }
      }, false, 'tool_empty');
  }
  function useTool(t) {
    if (!G || G.status !== 'play' || UI.busy) return;
    const T = G.tt;
    if (T && T.step === 1 && t !== T.tool) return;                              // 새 도구 써 보기: 가리킨 도구만 눌러요
    cue('ui');
    if (UI.mode === 'locate' && t === 'locate') { if (!T) setMode('play'); return; }
    if (UI.mode === 'draft') { if (t === 'draft') draftCancel(); return; }
    if (UI.hint) return;
    if (toolLocked(t)) { toast(tr('tool_locked', { n: TOOL_UNLOCK[t] })); return; }
    if (G.tut && t !== 'hint') return;
    if (t === 'hint') return useHint();
    if (T && T.step === 1) { T.free = true; S.seen['tool_' + t] = 1; if (t === 'draft') S.seen.unlock21 = 1; }   // 써 보는 한 번은 개수를 쓰지 않아요
    if (S.tools[t] <= 0 && !(T && T.free)) return needTool(t);
    if (t === 'locate') return locateStart();
    if (t === 'frog') return frogGo();
    if (t === 'draft') return draftStart();
  }
  function spend(t) {                                                           // 도구 한 개 쓰기 (새 도구 써 보기 중 첫 한 번은 그냥)
    if (G.tt && G.tt.free && G.tt.tool === t) { G.tt.free = false; return; }
    S.tools[t]--; G.used[t]++;
  }
  function setMode(m) {
    UI.mode = m; View.clearOverlays();
    $('#tools').classList.toggle('dim', m !== 'play');
    $('#draftbar').hidden = m !== 'draft'; toolsShown(!(m === 'draft'));
    status(m === 'locate' ? tr('locate_pick') : '');
    hud(); requestAnimationFrame(() => View.fit()); metricRestore();
  }

  // 힌트
  function hintText(h) {
    switch (h.rule) {
      case 'basic': return tr('hint_basic');
      case 'fixx': return tr('hint_fixx');
      case 'single': return tr('hint_single', { unit: tr('unit_' + h.ev.units[0].type) });
      case 'line':
        if (h.kind === 'reg>row') return tr('hint_reg_row');
        if (h.kind === 'reg>col') return tr('hint_reg_col');
        return tr('hint_line_reg', { line: tr(h.kind === 'row>reg' ? 'unit_row' : 'unit_col') });
      case 'group': return tr(h.kind.slice(0, 3) === 'reg' ? 'hint_k_reg' : 'hint_k_line', { k: h.k });
      case 'contra': return tr(h.chain.forced.length ? 'hint_contra_chain' : 'hint_contra', { unit: tr('red_' + h.chain.dead.type) });
    }
    return '';
  }
  function drawHint(h, detail) {
    View.clearOverlays();
    h.ev.units.forEach(u => View.unit(u.type, u.idx, h.rule === 'contra' ? 'hl-dead' : ''));
    if (h.rule !== 'contra') h.ev.cells.forEach(c => { if (G.marks[c] !== DUCK) View.overlay(c, '<span class="ring"></span>'); });
    h.targets.forEach(c => {
      if (h.action === 'x') View.overlay(c, h.rule === 'contra' ? '<img class="mk duck ghost" src="' + ART.duck_think + '" alt="">' : xSvg(c, 'ghost'));
      else if (h.action === 'duck') View.overlay(c, '<span class="ring target"></span><img class="mk duck ghost" src="' + ART.duck_idle + '" alt="">');
      else View.overlay(c, '<span class="ring target"></span>');
    });
    if (detail && h.chain) h.chain.forced.forEach((c, k) => View.overlay(c, '<img class="mk duck ghost" src="' + ART.duck_idle + '" alt=""><span class="mk num">' + (k + 1) + '</span>'));
    UI.hintDetail = !!detail; dimSync();                                        // 힌트가 가리키는 곳·말풍선·안내 줄만 밝게
  }
  function hintCells(h, detail) {                                               // 힌트가 가리키는 칸: 근거가 된 줄·색 구역, 근거 칸, 바꿀 칸 (자세히 보기면 차례로 정해지는 칸도)
    const set = new Set(h.targets);
    h.ev.units.forEach(u => E.unitCells(G.b, u.type, u.idx).forEach(c => set.add(c)));
    h.ev.cells.forEach(c => set.add(c));
    if (detail && h.chain) h.chain.forced.forEach(c => set.add(c));
    return Array.from(set);
  }
  function useHint() {
    let h = G.paidHint && G.paidHint.rev === G.rev ? G.paidHint.h : null;
    if (!h) {
      if (!G.tut && S.tools.hint <= 0) return needTool('hint');
      h = E.hint(G.b, G.marks);
      if (!h) { toast(tr('hint_none', { tool: toolName('locate') })); return; }
      if (!G.tut) { S.tools.hint--; G.used.hint++; }
      G.paidHint = { rev: G.rev, h: h }; save();
    }
    UI.hint = h; cue('hint');
    $('#hint-duck').src = ART.duck_think; $('#hint-text').textContent = hintText(h);
    $('#hint-more').hidden = !(h.chain && h.chain.forced.length);
    $('#hintbar').hidden = false; toolsShown(false); status('');
    $('#hint-apply').classList.toggle('nudge', !!(G.tut && G.tut.kind === 'hint'));   // 튜토리얼의 힌트: '확인'을 누르라고 까딱까딱
    Metrics.step(G.tut ? 'tut_hint_open' : 'hint_open');
    drawHint(h, false); hud(); requestAnimationFrame(() => View.fit());
    metricRestore();
    if (G.tut && G.tut.kind === 'hint') { spot(false); ttMark(null); tutGuide(tr('tut_hint'), 'duck_joy'); }
  }
  function hintClose(apply) {
    const h = UI.hint; if (!h) return;
    UI.hint = null; View.clearOverlays(); dimSync();
    $('#hintbar').hidden = true; toolsShown(true);
    if (apply) {
      Metrics.step(G.tut ? 'tut_hint_apply' : 'hint_apply');
      G.paidHint = null;
      if (h.action === 'duck') { placeDuck(h.targets[0], false); }
      else { h.targets.forEach(c => { G.marks[c] = h.action === 'x' ? XM : BLANK; View.cell(c, true); }); G.rev++; cue('x'); metricAction(); }
      if (G.status === 'play') { save(); if (G.tut) tutProgress(); }
    }
    requestAnimationFrame(() => View.fit()); metricRestore();
  }

  // 오리 찾기: 색을 고르면 그 색의 오리 한 마리를 알려 준다
  function openRegs() { const a = E.analyze(G.b, G.marks), r = []; for (let g = 0; g < G.n; g++) if (!a.regHas[g]) r.push(g); return r; }
  function locateReveal(g) {
    const cell = G.b.regCells[g].find(c => G.b.solSet[c]);
    spend('locate'); setMode('play'); metricTrialDone('locate');
    if (!placeDuck(cell, false)) save();
    if (G.tt) { G.tt.show = [cell]; ttStep(3); }
  }
  function locateStart() {
    const regs = openRegs();
    if (regs.length === 1) return locateReveal(regs[0]);
    setMode('locate'); View.pickable(regs);
    if (G.tt) ttStep(2);
  }
  function locatePick(i) {
    const g = G.b.reg[i];
    if (openRegs().indexOf(g) < 0) { toast(tr('locate_done')); return; }
    locateReveal(g);
  }

  // 개구리: 오리가 없는 빈칸 최대 3곳에 X
  async function frogGo() {
    const g = G;
    const a = E.analyze(G.b, G.marks), n = G.n, R = Math.random;
    const blanks = []; for (let i = 0; i < n * n; i++) if (G.marks[i] === BLANK && !G.b.solSet[i]) blanks.push(i);
    const pri = shuffled(blanks.filter(i => !a.regHas[G.b.reg[i]]), R), rest = shuffled(blanks.filter(i => a.regHas[G.b.reg[i]]), R);
    const targets = pri.concat(rest).slice(0, 3);
    let giveDuck = -1;
    if (!targets.length) {
      const sols = []; for (let i = 0; i < n * n; i++) if (G.b.solSet[i] && G.marks[i] !== DUCK) sols.push(i);
      giveDuck = sols.find(i => G.marks[i] === BLANK); if (giveDuck === undefined) giveDuck = sols.length ? sols[0] : -1;
      if (giveDuck < 0) return;
    }
    spend('frog'); UI.busy = true; hud(); if (G.tt) ttStep(2);
    const fx = $('#fx'), frog = document.createElement('img'); frog.className = 'frog'; frog.src = ART.ic_frog; frog.alt = '';
    frog.style.left = '50%'; frog.style.top = '108%'; fx.appendChild(frog);
    await wait(40);
    if (G !== g || screen !== 'game') { frog.remove(); return; }
    let hop = 0;
    for (const c of (targets.length ? targets : [giveDuck])) {
      const p = View.center(c); frog.style.left = p[0] + '%'; frog.style.top = p[1] + '%';
      frog.classList.remove('jump'); void frog.offsetWidth; frog.classList.add('jump'); cue('frog', undefined, 1 + Math.min(hop++, 4) * 0.06);   // 뾰옹 뾰옹 뾰옹: 뛸 때마다 조금씩 높게
      await wait(520);
      if (G !== g || screen !== 'game') { frog.remove(); return; }
      if (targets.length) { G.marks[c] = XM; G.rev++; View.cell(c, true); cue('x'); }
      await wait(160);
      if (G !== g || screen !== 'game') { frog.remove(); return; }
    }
    frog.remove(); UI.busy = false; G.paidHint = null; metricTrialDone('frog');
    if (targets.length) metricAction();
    if (!targets.length) { if (!placeDuck(giveDuck, false)) save(); } else save();
    hud();
    if (G.tt) { G.tt.show = targets.length ? targets : [giveDuck]; ttStep(3); }
  }

  /* 낙서연필: 오리를 3마리까지(X는 마음껏) 미리 그려 보고 확정해요.
     확정하면 맞는 오리만 남고, 틀린 낙서 오리는 X로 바뀌어요. 하트는 줄지 않아요 (안전하게 확인하는 도구).
     연필은 확정할 때 1개 써요. 그리다가 취소하거나 아무것도 안 그리고 확정하면 쓰지 않아요. */
  function draftDucks() { let k = 0; if (G.draft) for (let i = 0; i < G.draft.length; i++) if (G.draft[i] === 2) k++; return k; }
  function draftCount() { const el = $('#draft-count'); if (el) el.textContent = tr('draft_count', { n: draftDucks(), max: DRAFT_MAX }); }
  function draftStart() {
    G.draft = new Uint8Array(G.n * G.n);
    setMode('draft'); draftCount();
    if (G.tt) ttStep(2);
  }
  function draftCancel() {
    if (G.tt && G.tt.tool === 'draft') return;                                  // 써 보는 중에는 확정까지 해 봐요
    const d = G.draft; G.draft = null; setMode('play'); if (d) for (let i = 0; i < d.length; i++) if (d[i]) View.cell(i);
  }
  function draftApply() {
    if (G.tt && G.tt.tool === 'draft' && G.tt.step !== TTD_APPLY) return;
    const d = G.draft, n = G.n, wrong = [], right = [], xs = [];
    for (let i = 0; i < n * n; i++) { if (d[i] === 2) (G.b.solSet[i] ? right : wrong).push(i); else if (d[i] === 1) xs.push(i); }
    if (!wrong.length && !right.length && !xs.length) return draftCancel();      // 아무것도 안 그렸으면 그냥 닫아요 (연필도 안 써요)
    G.draft = null; setMode('play'); G.paidHint = null;
    spend('draft'); metricTrialDone('draft');
    xs.concat(wrong).forEach(c => { G.marks[c] = XM; });                        // 틀린 낙서 오리는 하트를 깎지 않고 X로 바꿔요
    G.rev++; metricAction();
    for (let i = 0; i < n * n; i++) View.cell(i);
    wrong.forEach(c => {                                                        // 틀린 자리: 오리가 '앗' 하고는 X가 돼요
      shake(c); View.overlay(c, '<img class="mk duck" src="' + ART.duck_oops + '" alt="" style="animation:blink .25s 2">');
      setTimeout(() => { if (!View.cells[c]) return; $$('.ov', View.cells[c]).forEach(x => x.remove()); View.cell(c, true); }, 480);
    });
    if (wrong.length) cue('x', 'heavy');                                        // 틀린 낙서가 있으면 쿵 (하트는 그대로)
    hud();
    let done = false;
    right.forEach(c => { if (!done) done = placeDuck(c, true); });
    if (!done) save();
    if (!G.tt && wrong.length && !done) toast(right.length ? tr('draft_kept', { n: wrong.length }) : tr('draft_none'));
    if (G.tt) { G.tt.show = right.concat(wrong, xs); ttStep(TTD_APPLY + 1); }
  }

  /* ---------- 화면·모달 ---------- */
  function show(name) {
    screen = name;
    $('#scr-home').hidden = name !== 'home'; $('#scr-game').hidden = name !== 'game';
    if (name === 'home') { renderHome(); metricRestore(); }
  }
  function openModal(html, acts, dismissable, metricState) {
    modalOpen = true; metricModal = metricState || null; modalEpoch++;
    // 창에는 X 버튼을 두지 않아요. 닫을 수 있는 창은 맨 아래에 큰 '닫기' 버튼을 둬요 (dismissable은 뒤로가기·바깥 누르기로도 닫힘)
    const sheet = $('#sheet'); sheet.classList.toggle('settings-sheet', metricState === 'settings');
    $('#modal').classList.toggle('settings-modal', metricState === 'settings');
    sheet.innerHTML = html + (dismissable && html.indexOf('data-act="close"') < 0 ? '<div class="col"><button class="btn ghost" data-act="close">' + tr('close') + '</button></div>' : '');
    sheet._acts = acts || {}; $('#modal').hidden = false; sheet.scrollTop = 0;
    if (metricState === 'tool_empty') Metrics.step('tool_empty');
    metricRestore();
    $$('[data-count]', sheet).forEach(el => {
      const to = +el.dataset.count, t0 = performance.now() + 250;
      (function step(now) { const k = Math.max(0, Math.min(1, (now - t0) / 650)); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(step); })(performance.now());
    });
  }
  function closeModal() { modalOpen = false; metricModal = null; modalEpoch++; $('#modal').hidden = true; metricRestore(); }
  function rewardHTML(list) { return list.length ? '<div class="rewards">' + list.map(r => '<span class="reward">' + icon(TOOL_ICON[r[0]]) + toolName(r[0]) + ' +' + r[1] + '</span>').join('') + '</div>' : ''; }

  function showResult(rewards, notes, bonus) {
    UI.busy = false; G.metricResultShown = true;
    Metrics.checkpoint(G, 'result');
    const usedN = G.used.hint + G.used.locate + G.used.frog + G.used.draft;
    let h = '<img class="hero joy" src="' + ART.duck_joy + '" alt="">';
    if (G.mode !== 'tutorial') {                                               // 오리 양옆: 왼쪽 친구 초대(힌트 +1), 오른쪽 자랑하기. 아래 끝을 오리 발뒤꿈치에 맞춰요
      h = '<div class="res-top">' + (inviteOn() ? '<button class="res-invite' + (inviteLeft() ? '' : ' off') + '" data-act="invite" type="button">' + bulbBadge() + '<em data-invite-label>' + inviteLabel() + '</em></button>' : '<span></span>') + h +
        '<button class="res-brag" data-act="brag" type="button">' + icon('ic_star') + tr('res_brag') + '</button></div>';
    }
    if (G.mode === 'tutorial') {
      h += '<h2>' + tr('tut_done_title') + '</h2><p>' + tr('tut_done_text') + '</p><div class="col"><button class="btn big primary" data-act="next">' + tr('btn_level1') + '</button></div>';
      return openModal(h, { next() { closeModal(); adBanner(); startMain(false); } }, false, 'result');
    }
    h += '<h2>' + (G.mode === 'main' ? tr('res_level', { n: G.level }) : G.practice ? tr('res_practice') : tr('res_daily')) + '</h2><p>' + tr(pick(LINE_CLEAR)) + '</p>';
    h += '<div class="stats"><div class="stat"><span>' + tr('stat_time') + '</span><b>' + fmtTime(G.secs) + '</b></div><div class="stat"><span>' + tr('stat_mistakes') + '</span><b>' + G.mistakes + '</b></div><div class="stat"><span>' + tr(G.mode === 'daily' ? 'stat_best' : 'lbl_score') + '</span><b>' + (G.mode === 'daily' ? fmtTime(S.daily.best) : '<i data-count="' + G.score + '" style="font-style:normal">0</i>') + '</b></div></div>';
    if (G.mode === 'main') h += '<p class="note">' + tr('res_note', { bonus: bonus, n: usedN }) + '</p>';
    if (rewards.length) h += '<p>' + notes.join(' · ') + '</p>' + rewardHTML(rewards);
    h += '<div class="col"><button class="btn big primary" data-act="next">' + (G.mode === 'main' ? tr('btn_next') : tr('btn_cont_level', { n: S.level })) + '</button><button class="btn ghost" data-act="home">' + icon('ic_home') + tr('btn_home') + '</button></div>';
    const shareSnap = { mode: G.mode, level: G.level, practice: G.practice, secs: G.secs, mistakes: G.mistakes, score: G.score };
    const adAfter = G.mode === 'main' && (S.adN || 0) >= AD_CLEAR_EVERY;
    openModal(h, {
      async next() {
        if (adBusy) return;
        if (adAfter) {
          // NCQ_ADS_LEVEL_CLEAR: 레벨 클리어 전면 광고
          // (5레벨을 넘긴 뒤 3판마다, 깬 뒤 '다음 레벨'을 누를 때. 못 보여 줬으면 다음 판을 깬 뒤에 다시 시도해요)
          const g = G, epoch = modalEpoch; adBusy = true; metricRestore();
          let shown = false; try { shown = await NcqAds.interstitial("LEVEL_CLEAR"); } catch (e) { shown = false; }
          adBusy = false;
          if (G !== g || screen !== 'game' || modalEpoch !== epoch) { metricRestore(); return; }
          if (shown) { S.adN = 0; save(); }
        }
        closeModal(); startMain(true);
      },
      home() { if (adBusy) return; closeModal(); G = null; show('home'); },
      async invite(btn) { if (adBusy) return; const ok = await doInvite(btn); },
      brag(btn) { if (adBusy) return; brag(shareSnap, btn); }
    }, false, G.metricStreakResult ? 'streak_result' : 'result');
  }
  function showFail() {
    UI.busy = false;
    // NCQ_ADS_REVIVE: 이어 하기 보상형 광고
    // (하트를 다 썼을 때 '광고 보고 계속하기')
    const canAd = NcqAds.can("REVIVE");
    openModal('<img class="hero" src="' + ART.duck_sad + '" alt=""><h2>' + tr('fail_title') + '</h2><p>' + tr(pick(LINE_FAIL)) + '<br>' + tr('fail_found', { n: G.n, k: G.found }) + '</p>' +
      '<div class="col">' + (canAd ? '<button class="btn primary" data-act="revive">' + icon('ic_heart') + tr('btn_revive') + '</button>' : '') +
      '<button class="btn yellow" data-act="restart">' + icon('ic_retry') + tr('btn_restart') + '</button><button class="btn ghost" data-act="home">' + icon('ic_home') + tr('btn_home') + '</button></div>' + (canAd && ADS_DEV ? '<p class="note">' + tr('dev_revive') + '</p>' : ''),
      {
        async revive() {
          if (adBusy) return;
          const g = G, epoch = modalEpoch; adBusy = true; metricRestore();
          let ok = false; try { ok = await NcqAds.rewarded("REVIVE"); } catch (e) { ok = false; }   // 끝까지 봤을 때만 이어 해요
          adBusy = false;
          if (ok && G === g && screen === 'game' && modalEpoch === epoch && G.status === 'lost') revive();
          else metricRestore();
        },
        restart() { if (!adBusy) restartSame(); },
        home() { if (adBusy) return; closeModal(); save(); G = null; show('home'); }
      }, false, 'hearts_empty');
  }
  function showUnlock(t) {
    buzz('success'); Metrics.step(t + '_intro');
    openModal('<img class="hero" src="' + ART.duck_joy + '" alt=""><h2>' + tr('unlock_title') + '</h2>' +
      '<div class="opt">' + icon(TOOL_ICON[t]) + '<span class="l">' + toolName(t) + '<small>' + tr('desc_' + t) + '</small></span></div>' +
      (t === 'draft' ? '<div class="opt">' + icon('ic_calendar') + '<span class="l">' + tr('lbl_daily') + '<small>' + tr('unlock_daily') + '</small></span></div>' : '') +
      '<div class="col"><button class="btn primary" data-act="go">' + tr('btn_try') + '</button></div>', { go() { closeModal(); ttStart(t); } }, false, 'tool_intro');
  }

  /* ---------- 새 도구 한 번 써 보기 (도구가 열리는 판에서 짧게) ---------- */
  const TT_TEXT = {
    locate: ['tt_locate_1', 'tt_locate_2', 'tt_locate_3'],
    frog: ['tt_frog_1', 'tt_frog_2', 'tt_frog_3'],
    // 낙서연필은 이것저것 그려 보고(맞는 오리 → 틀린 오리 → X) 확정했을 때 어떻게 되는지까지 봐야 알 수 있어서 단계가 더 있어요
    draft: ['tt_draft_1', 'tt_draft_2', 'tt_draft_3', 'tt_draft_4', 'tt_draft_5', 'tt_draft_6']
  };
  // 낙서연필 써 보기의 차례: 2 맞는 칸에 오리 → 3 바로 옆 칸에도 오리(틀린 자리) → 4 다른 칸에 X → 5 확정 → 6 끝. 옆에 빈칸이 모자라면 그 차례는 건너뛰어요.
  const TTD = { 2: 'duck', 3: 'duck', 4: 'x' }, TTD_APPLY = 5;
  function ttdKind() { const T = G && G.tt; return T && T.tool === 'draft' && UI.mode === 'draft' ? TTD[T.step] || '' : null; }   // null이면 써 보는 중이 아니에요
  function ttdCellAt(step) { const T = G.tt; return step === 2 ? T.cell : step === 3 ? T.cell2 : T.cell3; }
  function ttdCell() { return ttdCellAt(G.tt.step); }
  function ttdNext() { let st = G.tt.step + 1; while (st < TTD_APPLY && ttdCellAt(st) < 0) st++; ttStep(st); }
  function ttdNeighbors(c) {                                                    // 정답 칸 바로 옆의 빈칸들 (오리끼리 붙으면 안 되니 늘 틀린 자리예요). 옆 → 위아래 → 대각선 순서
    const n = G.n, r = (c / n) | 0, q = c % n, out = [];
    for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const r2 = r + d[0], q2 = q + d[1], k = r2 * n + q2;
      if (r2 >= 0 && r2 < n && q2 >= 0 && q2 < n && G.marks[k] === BLANK && !G.b.solSet[k]) out.push(k);
    }
    return out;
  }
  function ttMark(t) {                                                          // 눌러야 할 도구만 밝게 + 손가락
    $('#tools').classList.toggle('tt', !!t);
    $$('.tool').forEach(el => {
      const on = el.dataset.tool === t, h = $('.tthand', el);
      el.classList.toggle('pick', on);
      if (on && !h) el.insertAdjacentHTML('beforeend', '<span class="tthand">' + HAND_SVG + '</span>'); else if (!on && h) h.remove();
    });
  }
  function spot(on) { $('#spot').hidden = !on; $('#scr-game').classList.toggle('spoton', !!on); }   // 화면 전체를 어둡게 (말풍선과 도구 줄만 밝게)
  /* 눌러야 할 것이 하나뿐일 때는 그것만 밝게 두고 나머지를 살짝 어둡게 덮어요 (다른 곳은 못 누른다는 걸 알 수 있게):
     - 말풍선에 '알겠어요'가 떠 있을 때: 말풍선(+ 지금 설명하는 칸). 버튼은 까딱까딱 움직여요.
     - 힌트를 보여 줄 때: 힌트가 가리키는 칸, 아래 안내 줄('확인'), 말풍선.
     밝게 남길 칸이 있으면 판을 덮개 위로 올리고 판의 어둠에서 그 칸만 뚫어요 (그동안 판은 눌리지 않아요). */
  let okOn = false, okCells = null;
  function dimSync() {
    const scr = $('#scr-game'), hint = !!(G && UI.hint), on = okOn || hint;
    const cells = hint ? hintCells(UI.hint, UI.hintDetail) : okCells, hole = !!(on && cells && cells.length);
    $('#okdim').hidden = !on; scr.classList.toggle('okon', on); scr.classList.toggle('okhole', hole); $('#guide-ok').classList.toggle('nudge', okOn);
    if (hole) View.dim(cells);
  }
  function okDim(on, cells) { okOn = !!on; okCells = on && cells && cells.length ? cells : null; dimSync(); }
  function ttStart(t) {
    if (!G || G.status !== 'play' || screen !== 'game') return;
    G.tt = { tool: t, step: 0, free: false }; Metrics.step(t + '_start');
    $('#btn-rules').hidden = true; $('#guide').hidden = false;
    ttStep(1);
  }
  function ttDraft(step) {                                                      // 낙서연필 써 보기: 그릴 칸과 '확정' 버튼을 차례로 가리켜요
    const ok = $('#draft-apply'), h = $('.tthand', ok), kind = TTD[step], last = step === TTD_APPLY;
    $('#draft-cancel').classList.toggle('wait', !!kind || last);                // 써 보는 동안 취소는 흐리게만 보여요 (어디 있는지는 알 수 있게)
    ok.classList.toggle('wait', !!kind); ok.classList.toggle('pick', last);
    if (last && !h) ok.insertAdjacentHTML('beforeend', '<span class="tthand">' + HAND_SVG + '</span>'); else if (!last && h) h.remove();
    if (!kind) { if (last) View.clearOverlays(); return; }
    const c = ttdCellAt(step), shown = [];
    for (let st = 2; st <= step; st++) if (ttdCellAt(st) >= 0) shown.push(ttdCellAt(st));   // 앞에서 그린 칸도 같이 밝게
    View.clearOverlays(); View.dim(shown); View.overlay(c, '<span class="ring target"></span>');
    View.hand([c], kind === 'duck' ? 'tap2' : 'tap1');
  }
  function ttStep(s) {
    const T = G && G.tt; if (!T) return;
    if (G.status !== 'play') return ttEnd();
    const last = s === TT_TEXT[T.tool].length;
    T.step = s;
    if (T.tool === 'draft' && s === 2 && T.cell === undefined) { T.cell = tutSingle(); const nb = ttdNeighbors(T.cell); T.cell2 = nb.length ? nb[0] : -1; T.cell3 = nb.length > 1 ? nb[1] : -1; }
    tutGuide(tr(TT_TEXT[T.tool][s - 1]), last ? 'duck_joy' : s === 1 ? 'duck_hello' : 'duck_think', last ? () => { cue('ui'); ttEnd(); } : null, last ? T.show : null);
    ttMark(s === 1 ? T.tool : null);
    if (T.tool === 'draft') ttDraft(s);
    metricRestore();
  }
  function ttEnd() {
    if (!G || !G.tt) return;
    const wasDraft = G.tt.tool === 'draft';
    G.tt = null; ttMark(null); if (wasDraft) ttDraft(0);
    if ($('#scr-game').classList.contains('okhole')) View.dimOff();
    $('#guide').hidden = true; okDim(false); $('#btn-rules').hidden = false;
    save(); requestAnimationFrame(() => View.fit()); metricRestore();
  }
  function showRules() {
    const sq = (x, y, f) => '<rect x="' + x + '" y="' + y + '" width="18" height="18" rx="4" fill="' + f + '"/>';
    const dk = (x, y) => '<image href="' + ART.duck_idle + '" x="' + (x + 1) + '" y="' + y + '" width="16" height="18"/>';
    const xx = (x, y) => '<path d="M' + (x + 5) + ' ' + (y + 5) + 'l8 8m0-8l-8 8" stroke="#3A2E2A" stroke-width="2" stroke-linecap="round" opacity=".6"/>';
    const P = '#F7A8C4', B = '#8FCDF2', M = '#8FDDB5';
    const g1 = sq(2, 2, P) + sq(22, 2, P) + sq(42, 2, B) + sq(2, 22, P) + sq(22, 22, B) + sq(42, 22, B) + sq(2, 42, M) + sq(22, 42, M) + sq(42, 42, M) + dk(2, 2) + dk(42, 22) + dk(22, 42);
    const g2 = sq(2, 2, B) + sq(22, 2, B) + sq(42, 2, B) + sq(2, 22, B) + sq(22, 22, B) + sq(42, 22, B) + sq(2, 42, B) + sq(22, 42, B) + sq(42, 42, B) + dk(22, 22) + xx(2, 22) + xx(42, 22) + xx(22, 2) + xx(22, 42);
    const g3 = sq(2, 2, M) + sq(22, 2, M) + sq(42, 2, M) + sq(2, 22, M) + sq(22, 22, M) + sq(42, 22, M) + sq(2, 42, M) + sq(22, 42, M) + sq(42, 42, M) + dk(22, 22) + xx(2, 2) + xx(42, 2) + xx(2, 42) + xx(42, 42);
    const card = (g, t) => '<div class="rulecard"><svg viewBox="0 0 62 62">' + g + '</svg><p>' + t + '</p></div>';
    openModal('<h2>' + tr('rules_title') + '</h2>' + card(g1, tr('rule_1')) + card(g2, tr('rule_2')) + card(g3, tr('rule_3')) +
      '<p class="note">' + tr('rules_note') + '</p><div class="col"><button class="btn primary" data-act="close">' + tr('close') + '</button></div>', {}, true, 'rules');
  }
  function ruleGrid(kind) {
    const col = { color: ['#F7A8C4', '#F1E4C6'], line: ['#8FCDF2', '#8FCDF2'], adj: ['#8FDDB5', '#8FDDB5'] }[kind];
    const duck = { color: 4, line: 1, adj: 4 }[kind], xs = { color: [0, 1, 2, 3, 6], line: [0, 2, 4, 7], adj: [0, 1, 2, 3, 5, 6, 7, 8] }[kind];
    const main = kind === 'color' ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let h = '';
    for (let k = 0; k < 9; k++) {
      const x = (k % 3) * 20 + 1, y = ((k / 3) | 0) * 20 + 1;
      h += '<rect x="' + x + '" y="' + y + '" width="18" height="18" rx="4.5" fill="' + (main.indexOf(k) >= 0 ? col[0] : col[1]) + '"/>';
      if (k === duck) h += '<image href="' + ART.duck_idle + '" x="' + x + '" y="' + (y + 1) + '" width="18" height="16"/>';
      else if (xs.indexOf(k) >= 0) h += '<path d="M' + (x + 5.5) + ' ' + (y + 5.5) + 'l7 7m0-7l-7 7" stroke="#3A2E2A" stroke-width="2.3" stroke-linecap="round" opacity=".68" fill="none"/>';
    }
    return '<svg viewBox="0 0 60 60" aria-hidden="true">' + h + '</svg>';
  }
  function sw(key, label, sub, ic, on) { return '<div class="opt">' + (ic ? icon(ic) : '') + '<span class="l">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><button class="sw" role="switch" aria-checked="' + (on === undefined ? !!S.settings[key] : !!on) + '" data-sw="' + key + '" aria-label="' + label + '"></button></div>'; }
  function langRow() {
    const L = window.NcqLang; if (!L || !L.ready) return '';
    const title = L.lang === 'en' ? 'Language' : tr('language') + ' · Language';   // 읽지 못하는 언어여도 찾아 돌아올 수 있게 영어도 같이
    return '<div class="opt lang"><span class="l">' + title + '</span><span class="seg">' + L.list().map(o => '<button type="button" class="segb' + (o.current ? ' on' : '') + '" data-lang="' + o.code + '" aria-pressed="' + o.current + '">' + o.name + '</button>').join('') + '</span></div>';
  }
  function vibRow() { const D = window.NcqDevice; return hl() || (D && D.canVibrate()) ? sw('vib', tr('set_vib'), '', '', vibOn()) : ''; }   // 진동이 안 되는 곳(아이폰 브라우저·컴퓨터)에서는 칸을 숨겨요
  let settingsOpen = null;
  function kakaoHost() { try { return (window.NcqKakao && window.NcqKakao.status().host) || ''; } catch (e) { return ''; } }
  function neptuneUserId() {
    if (!NEPTUNE || !partnerBooted) return null;
    try {
      if (!window.NcqKakao.status().membershipReady) return null;
      const sdk = window.NcqNeptune, id = sdk && sdk.status().ready && typeof sdk.userKey === 'function' && sdk.userKey();
      return typeof id === 'string' && id ? id : null;
    } catch (e) { return null; }
  }
  async function copyUserId() {
    const epoch = modalEpoch, input = $('#neptune-user-id'), id = neptuneUserId();
    if (!input || !id || input.value !== id) return;
    const current = () => modalOpen && modalEpoch === epoch && neptuneUserId() === id;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error('clipboard_unavailable');
      await navigator.clipboard.writeText(id);
      if (current()) toast(tr('id_copied'));
    } catch (e) {
      if (current()) { input.focus(); input.select(); toast(tr('id_copy_manual')); }
    }
  }
  function showSettings(inGame) {
    settingsOpen = !!inGame;
    const userId = neptuneUserId();
    let h = '<h2>' + tr('settings') + '</h2><div class="settings-body">' + (window.NcqSound ? sw('bgm', tr('set_bgm'), '', 'ic_sound', bgmOn()) : '') + sw('sfx', tr('set_sfx'), '', window.NcqSound ? '' : 'ic_sound') + vibRow() + sw('pattern', tr('set_pattern'), tr('set_pattern_sub')) + sw('slow', tr('set_slow'), tr('set_slow_sub')) + langRow();
    if (NEPTUNE) h += '<div class="partner-user"><label for="neptune-user-id">' + tr(kakaoHost() === 'KAKAOTALK' ? 'user_id_talk' : 'user_id') + '</label><input id="neptune-user-id" type="text" readonly spellcheck="false" autocomplete="off"><button class="btn small ghost" data-act="copy-user"' + (userId ? '' : ' disabled') + '>' + tr('copy_id') + '</button></div>';
    h += '</div><div class="col"><button class="btn ghost" data-act="rules">' + icon('ic_bulb') + tr('rules_title') + '</button>';
    if (inGame && G && G.mode !== 'tutorial') h += '<button class="btn yellow" data-act="restart">' + icon('ic_retry') + tr('btn_restart') + '</button>';
    // NCQ_TEST_CHEAT: 테스트 메뉴 (레벨 이동·도구 지급)
    if (!inGame && (window.NCQ_TEST_CHEAT || !window.NCQ)) h += '<button class="btn ghost" data-act="test">' + tr('test_menu') + '</button>';
    // 앱 버전 표시: 빌드가 넣은 버전, 개발 중에는 dev
    const version = window.NCQ && window.NCQ.NCQ_VERSION;
    h += '<button class="btn ghost" data-act="privacy" id="btn-privacy" hidden>' + tr('privacy') + '</button>';
    const feedback = window.NcqFeedback;
    if (feedback && feedback.can()) h += '<button class="btn ghost" data-act="feedback">' + tr('send_feedback') + '</button>';
    h += '<button class="btn primary" data-act="close" data-ncq-main>' + tr('close') + '</button></div><span class="ver" id="app-version">' + (version ? 'v' + version : 'dev') + '</span>';
    openModal(h, { rules: showRules, restart: confirmRestart, test: showTest, 'copy-user': copyUserId,
      privacy() { NcqAds.showPrivacyOptions(); },
      feedback() { try { Promise.resolve(feedback.open()).catch(() => {}); } catch (e) { /* 설정 창은 유지 */ } }
    }, true, 'settings');
    if (NEPTUNE) {
      const input = $('#neptune-user-id');
      input.value = userId || ''; input.placeholder = tr('user_id_unavailable');
    }
    // 광고 동의를 다시 고를 수 있는 곳(유럽 등)에서만 '개인정보 설정' 버튼을 보여 줘요
    Promise.resolve().then(() => NcqAds.ready()).then(() => { const b = $('#btn-privacy'); if (b && NcqAds.privacyRequired()) b.hidden = false; }).catch(() => {});
  }
  function confirmRestart() {
    openModal('<img class="hero" src="' + ART.duck_think + '" alt=""><h2>' + tr('restart_title') + '</h2><p>' + tr('restart_text') + '</p><div class="col"><button class="btn yellow" data-act="restart">' + tr('btn_restart_short') + '</button><button class="btn ghost" data-act="close">' + tr('cancel') + '</button></div>', { restart: restartSame }, false, 'restart_confirm');
  }
  function showTest() {
    openModal('<h2>' + tr('test_menu') + '</h2><p class="note">' + tr('test_note') + '</p><div class="stepper"><button class="btn small" data-act="m10">-10</button><button class="btn small" data-act="m1">-1</button><b>' + tr('play_level', { n: S.level }) + '</b><button class="btn small" data-act="p1">+1</button><button class="btn small" data-act="p10">+10</button></div>' +
      '<div class="col"><button class="btn ghost" data-act="tools">' + tr('test_tools') + '</button><button class="btn ghost" data-act="tut">' + tr('test_tut') + '</button><button class="btn ghost" data-act="reset">' + tr('test_reset') + '</button></div>',
      {
        m10() { lv(-10); }, m1() { lv(-1); }, p1() { lv(1); }, p10() { lv(10); },
        tools() { Metrics.exclude(); grant({ hint: 5, locate: 5, frog: 5, draft: 5 }); save(); toast(tr('test_tools_done')); },
        tut() { Metrics.exclude(); save(); closeModal(); startTutorial(); },
        reset() {
          Metrics.exclude(); const observation = S.observation;
          S = freshSave(); S.observation = observation; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
          bannerOn = false; try { Promise.resolve(NcqAds.hideBanner()).catch(() => {}); } catch (e) { /* 무시 */ }   // 처음부터 다시: 튜토리얼 동안에는 배너도 다시 숨겨요
          save(); closeModal(); startTutorial();
        }
      }, true);
    function lv(d) { Metrics.exclude(); S.level = Math.max(1, S.level + d); S.cur = null; save(); showTest(); renderHome(); }
  }
  /* ---------- 친구 초대 (도쿠힌트 +1, 하루 3번) ----------
     지금은 '초대하기'를 누르면 초대를 끝낸 것으로 보고 바로 도쿠힌트를 줘요.
     초대 SDK(NcqInvite)는 다른 분이 붙일 예정이라, 붙일 자리를 inviteDone()에 주석으로 남겨 뒀어요. */
  const INVITE_MAX = 3;
  function inviteToday() { const v = S.invite || {}; return v.day === dayIndex() ? (v.n | 0) : 0; }
  function inviteLeft() { return Math.max(0, INVITE_MAX - inviteToday()); }
  // 공유 그림 (800×400): assets/share/. 토스 미리보기는 공개 주소(웹 공개 빌드)의 같은 그림을 써요
  const SHARE_IMG = { share: 'assets/share/dokuduck_share_800x400.jpg', invite: 'assets/share/dokuduck_share_reward_800x400.jpg', brag: 'assets/share/dokuduck_brag_800x400.jpg' };
  const SHARE_PUBLIC = 'https://ncroquis.github.io/dokuduck/play/';
  function shareBlob(k) { return fetch(SHARE_IMG[k]).then(r => (r.ok ? r.blob() : null)).catch(() => null); }
  function inviteSdk() { const I = window.NcqInvite; return I && typeof I.share === 'function' ? I : null; }
  function inviteOn() { return !!inviteSdk() || !window.NCQ; }               // 초대 도구가 없는 빌드(카카오 등)에서는 초대 화면을 숨겨요. 개발 화면은 미리보기용
  function saveId() {                                                         // 초대 보상을 받을 이 저장의 번호 (저장과 함께 보관해요)
    if (!S.saveId) { S.saveId = 'dk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); save(); }
    return S.saveId;
  }
  let invitePrepared = null;
  async function inviteDone() {
    const I = inviteSdk();
    if (!I) return 'dev';                                                     // 개발·미리보기: SDK가 없어서 누르면 초대를 끝낸 것으로 봐요
    // 출시 빌드: 초대 링크를 보내요. 보상은 친구가 초대를 받은 뒤 다시 들어왔을 때 NcqInvite.onGrant로 와요 (inviteGrant)
    if (!invitePrepared) invitePrepared = await I.prepareShare({ image: () => shareBlob('invite'), title: tr('invite_share_title'), message: tr('invite_share_text'), ogImageUrl: SHARE_PUBLIC + SHARE_IMG.invite });
    const r = await I.share(invitePrepared);
    if (r && r.status === 'ready') { toast(tr('share_again')); return 'ready'; }   // 링크를 받는 동안 누르기 권한이 끝났어요: 한 번 더 누르면 열려요
    if (r && (r.status === 'shared' || r.status === 'copied')) { invitePrepared = null; return 'sent'; }
    if (r && r.status === 'failed') { invitePrepared = null; toast(tr('brag_failed')); }
    return 'none';
  }
  let inviteBusy = false;
  async function doInvite(fromEl) {
    if (inviteBusy || inviteLeft() <= 0) return false;
    inviteBusy = true;
    let r = 'none'; try { r = await inviteDone(); } catch (e) { r = 'none'; toast(tr('brag_failed')); }
    inviteBusy = false;
    if (r === 'sent') { toast(tr('invite_sent')); return false; }
    if (r !== 'dev') return false;
    giveInviteHint(1, fromEl);
    return true;
  }
  function giveInviteHint(n, fromEl) {
    S.invite = { day: dayIndex(), n: Math.min(INVITE_MAX, inviteToday() + 1) };   // 오늘 받은 수
    grant({ hint: n }); const ok = save(); buzz('success');                   // 지급·저장을 먼저 하고 연출은 결과만 보여 줘요
    flyHint(fromEl);
    if (G) hud();
    renderInvite(); inviteTick();
    return ok;
  }
  // 초대 보상 (출시 빌드): 같은 지급 번호는 한 번만. 잔액과 지급 번호를 같은 저장에 넣은 뒤에만 true
  function inviteGrant(g) {
    if (!g || !g.reward || g.reward.key !== 'HINT') return false;
    S.inviteGrants = S.inviteGrants || [];
    if (S.inviteGrants.indexOf(g.id) >= 0) return true;
    const n = Math.max(1, Math.min(10, g.reward.amount | 0));
    S.inviteGrants.push(g.id); if (S.inviteGrants.length > 300) S.inviteGrants.splice(0, S.inviteGrants.length - 300);
    const ok = giveInviteHint(n, null);
    if (!ok) { S.inviteGrants = S.inviteGrants.filter(x => x !== g.id); S.tools.hint = Math.max(0, S.tools.hint - n); return false; }
    toast(tr('invite_got', { n: n }));
    return true;
  }
  // 초대 링크로 들어온 친구: 수락하면 둘 다 도쿠힌트를 받아요 (첫 튜토리얼이 끝난 뒤 홈에서 한 번 물어요)
  let inviteAsked = false;
  function inviteStart() {
    const I = inviteSdk(); if (!I) return;
    try {
      I.onGrant(inviteGrant, { saveId: saveId() });
      I.onChange(st => { if (st && st.incoming && !inviteAsked) setTimeout(inviteIncoming, 300); });
      Promise.resolve(I.ready()).then(st => { if (st && st.incoming) inviteIncoming(); }).catch(() => {});
    } catch (e) { /* 초대가 안 돼도 게임은 그대로 */ }
  }
  function inviteIncoming() {
    const I = inviteSdk(); if (!I || inviteAsked || modalOpen || screen !== 'home' || !S.tutorialDone) return;
    Promise.resolve(I.ready()).then(st => {
      if (!st || !st.incoming || inviteAsked || modalOpen || screen !== 'home') return;
      inviteAsked = true;
      openModal('<h2>' + tr('invite_in_title') + '</h2><div class="invite-hero">' + bulbBadge() + '</div><p>' + tr('invite_in_text') + '</p>' +
        '<div class="col"><button class="btn big yellow" data-act="accept">' + tr('invite_in_ok') + '</button><button class="btn primary" data-act="close">' + tr('close') + '</button></div>', {
        async accept(btn) {
          if (btn) btn.disabled = true;
          try { await I.accept(st.incoming.token); closeModal(); toast(tr('invite_in_done')); }
          catch (e) { if (btn) btn.disabled = false; toast(tr('brag_failed')); }
        }
      }, true, 'invite');
    }).catch(() => {});
  }
  // 도쿠힌트 아이콘이 화면 가운데에서 톡 나타났다가 도쿠힌트 버튼 자리(인게임 왼쪽 아래)로 쏘옥 들어가요
  function flyHint(fromEl) {
    const inGame = G && !$('#scr-game').hidden;
    const tool = inGame ? $('.tool[data-tool="hint"] .ic') : null;
    const vw = innerWidth, vh = innerHeight;
    const to = tool ? tool.getBoundingClientRect() : hintSlot() || { left: 26, top: vh - 92, width: 40, height: 40 };
    const fr = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    const el = document.createElement('div'); el.className = 'fly-hint'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="ic" style="background-image:url(' + ART.ic_bulb + ')"></span><b>+1</b>';
    document.body.appendChild(el);
    const S0 = 96, cx = vw / 2, cy = vh * 0.42;
    const sx = fr ? fr.left + fr.width / 2 : cx, sy = fr ? fr.top + fr.height / 2 : cy;
    const tx = to.left + to.width / 2, ty = to.top + to.height / 2, ts = Math.max(0.25, to.width / S0);
    const A = el.animate([
      { transform: `translate(${sx - S0 / 2}px, ${sy - S0 / 2}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${cx - S0 / 2}px, ${cy - S0 / 2}px) scale(1.15)`, opacity: 1, offset: 0.28 },
      { transform: `translate(${cx - S0 / 2}px, ${cy - S0 / 2}px) scale(1) rotate(-6deg)`, opacity: 1, offset: 0.42 },
      { transform: `translate(${cx - S0 / 2}px, ${cy - S0 / 2}px) scale(1) rotate(6deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx - S0 / 2}px, ${ty - S0 / 2}px) scale(${ts})`, opacity: 1, offset: 0.92 },
      { transform: `translate(${tx - S0 / 2}px, ${ty - S0 / 2}px) scale(${ts * 0.6})`, opacity: 0 }
    ], { duration: 1300, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
    A.onfinish = () => {
      el.remove();
      const btn = tool && tool.closest('.tool');
      if (btn) { btn.classList.remove('gulp'); void btn.offsetWidth; btn.classList.add('gulp'); setTimeout(() => btn.classList.remove('gulp'), 500); cue('quack', null); }
    };
  }
  // 결과 창 이름표: 남은 횟수 '친구 초대 (3/3)', 다 받으면 초대 창 버튼처럼 흐린 노랑 '오늘은 다 받았어요!' (홈 버튼은 늘 '친구 초대')
  function inviteLabel() {
    const left = inviteLeft();
    return left ? tr('invite_btn') + ' (' + left + '/' + INVITE_MAX + ')' : tr('invite_done_today');
  }
  let inviteDay = null;
  function inviteTick() {                                                       // 보이는 초대 이름표·버튼을 1초마다 맞춰요 (자정이 지나면 다시 3번)
    const left = inviteLeft();
    $$('[data-invite-label]').forEach(el => { el.textContent = inviteLabel(); const b = el.closest('button'); if (b) b.classList.toggle('off', !left); });
    if (inviteDay !== null && inviteDay !== dayIndex()) renderInvite();
    inviteDay = dayIndex();
  }
  setInterval(inviteTick, 1000);
  function bulbBadge() { return '<span class="bulb-badge">' + icon('ic_bulb') + '<b>+1</b></span>'; }   // 흰 동그라미 전구 + 초록 +1
  // 홈에서는 인게임 화면이 숨어 있어서, 잠깐 안 보이게 펼쳐 도쿠힌트 버튼 자리를 재요 (인게임과 똑같은 자리로 들어가게)
  function hintSlot() {
    const scr = $('#scr-game'), tools = $('.tools', scr);
    if (!scr || !tools) return null;
    const was = scr.hidden, tw = tools.hidden, vis = scr.style.visibility;
    scr.style.visibility = 'hidden'; scr.hidden = false; tools.hidden = false;
    let r = null;
    try {
      // 판 크기는 판을 열 때 정해져서, 버튼 줄은 화면 아래 끝(안쪽 여백 위)에 붙은 자리로 계산해요
      const ic = $('.tool[data-tool="hint"] .ic', scr), b = ic && ic.getBoundingClientRect(), tb = tools.getBoundingClientRect();
      const sb = scr.getBoundingClientRect(), pad = parseFloat(getComputedStyle(scr).paddingBottom) || 0;
      const bottom = Math.min(sb.bottom, innerHeight) - pad;
      if (b && b.width) r = { left: b.left, top: bottom - (tb.bottom - b.top), width: b.width, height: b.height };
    } catch (e) { r = null; }
    tools.hidden = tw; scr.hidden = was; scr.style.visibility = vis;
    return r;
  }
  function inviteHTML() {
    const n = inviteToday(), left = inviteLeft();
    return '<h2>' + tr('invite_title') + '</h2>' +
      '<div class="invite-hero">' + bulbBadge() + '</div>' +
      '<div class="invite-count"><b id="inv-n">' + n + '</b><span>/ ' + INVITE_MAX + '</span></div>' +
      '<p class="note">' + tr('invite_today') + '</p>' +
      '<div class="invite-bar"><i id="inv-bar" style="width:' + Math.round(n / INVITE_MAX * 100) + '%"></i></div>' +
      '<p>' + tr('invite_desc', { max: INVITE_MAX }) + '</p>' +
      '<div class="col"><button class="btn big yellow" data-act="invite" id="inv-go"' + (left ? '' : ' disabled') + '>' + (left ? tr('invite_go') : tr('invite_done_today')) + '</button>' +
      '<button class="btn primary" data-act="close">' + tr('close') + '</button></div>';
  }
  function showInvite() {
    openModal(inviteHTML(), { async invite(btn) { await doInvite(btn); } }, true, 'invite');
    $('#sheet').classList.add('invite-sheet');
  }
  function renderInvite() {                                                    // 열린 초대 창의 숫자·막대·버튼만 다시 그려요
    const n = $('#inv-n'); if (!n) return;
    const k = inviteToday(), left = inviteLeft();
    n.textContent = k; $('#inv-bar').style.width = Math.round(k / INVITE_MAX * 100) + '%';
    const go = $('#inv-go'); go.disabled = !left; go.textContent = left ? tr('invite_go') : tr('invite_done_today');
  }

  /* ---------- 자랑하기 (기록 공유) ----------
     출시 빌드에는 공용 공유 도구 NcqShare가 들어와요 (docs/ncq/share.md, release/share.json).
     개발·미리보기에는 없어서 기기 공유창(navigator.share)이나 글 복사로 대신해요. */
  function bragText(r) {
    return r.mode === 'main' ? tr('brag_level', { n: r.level, time: fmtTime(r.secs) }) : tr('brag_daily', { time: fmtTime(r.secs) });
  }
  function bragImage(r) {                                                     // 자랑 카드: 게임 그림과 기록을 캔버스에 그려요
    const W = 720, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), css = getComputedStyle(document.documentElement);
    const col = (v, d) => (css.getPropertyValue(v) || d).trim() || d;
    x.fillStyle = col('--pond', '#DDF1EC'); x.fillRect(0, 0, W, H);
    x.fillStyle = col('--paper', '#FFFBF0'); x.strokeStyle = col('--ink', '#3A2E2A'); x.lineWidth = 10;
    x.beginPath(); x.roundRect(40, 40, W - 80, H - 80, 48); x.fill(); x.stroke();
    const img = (k) => { const i = new Image(); i.src = ART[k]; return i; };
    const logo = img('logo'), duck = img('duck_joy');
    const draw = () => {
      try { x.drawImage(logo, 150, 80, 420, 420 * logo.naturalHeight / (logo.naturalWidth || 1)); } catch (e) { /* 그림 없이도 그려요 */ }
      try { x.drawImage(duck, 250, 190, 220, 220 * duck.naturalHeight / (duck.naturalWidth || 1)); } catch (e) { /* 그림 없이도 그려요 */ }
      x.fillStyle = col('--ink', '#3A2E2A'); x.textAlign = 'center';
      const f = getComputedStyle(document.body).fontFamily;
      x.font = '56px ' + f; x.fillText(r.mode === 'main' ? tr('res_level', { n: r.level }) : tr('res_daily'), W / 2, 500);
      x.font = '36px ' + f; x.fillText(tr('stat_time') + ' ' + fmtTime(r.secs) + '  ·  ' + tr('stat_mistakes') + ' ' + r.mistakes, W / 2, 566);
      x.font = '30px ' + f; x.fillText(tr('brag_card'), W / 2, 625);
      return c;
    };
    return Promise.all([logo, duck].map(i => i.decode ? i.decode().catch(() => {}) : null)).then(draw);
  }
  async function brag(r, btn) {
    const text = bragText(r), title = tr('brag_title');
    const S2 = window.NcqShare;
    try {
      if (S2 && S2.can && S2.can()) {
        const prepared = await S2.prepareShare({ image: () => shareBlob('brag').then(b => b || bragImage(r)), title: title, message: text });
        const res = await S2.share(prepared);
        if (res && res.status === 'copied') toast(tr('brag_copied'));
        else if (res && res.status === 'failed') toast(tr('brag_failed'));
        return;
      }
      if (navigator.share) { await navigator.share({ title: title, text: text, url: location.href.split('#')[0] }); return; }
      await navigator.clipboard.writeText(text + ' ' + location.href.split('#')[0]); toast(tr('brag_copied'));
    } catch (e) { if (!(e && e.name === 'AbortError')) toast(tr('brag_failed')); }
  }

  function showStreak() {
    // 받은 날은 완료 표시(체크), 고른 날은 점선 테두리가 돌아요. 날짜를 누르면 아래에 그날 선물이 나와요.
    const c = streakNow(), pos = c % 7 || (c ? 7 : 0), today = S.streak.last === dayIndex();
    let sel = Math.min(7, pos + 1), w = '';
    for (let i = 1; i <= 7; i++) w += '<button type="button" class="wd' + (i <= pos ? ' on' : '') + '" data-day="' + i + '" aria-label="' + tr(i <= pos ? 'day_got' : 'day_n', { n: i }) + '">' + (i <= pos ? CHECK_SVG : i) + '</button>';
    openModal('<h2>' + tr('streak_title', { n: c }) + '</h2><div class="week">' + w + '</div><div class="gift" id="gift"></div><p class="note">' + tr('streak_note') + '</p><div class="row2"><button class="btn ghost" data-act="close">' + tr('close') + '</button><button class="btn primary" data-act="close">' + tr('ok') + '</button></div>', {}, true, 'streak');
    const days = $$('.wd', $('#sheet'));
    const draw = () => {
      days.forEach(b => b.classList.toggle('sel', +b.dataset.day === sel));
      const when = sel <= pos ? tr('gift_got') : sel === pos + 1 ? tr(today ? 'gift_tomorrow' : 'gift_today') : tr('gift_more', { n: sel - pos });
      $('#gift').innerHTML = '<b>' + tr('gift_day', { n: sel }) + '</b>' + rewardHTML(streakGift(sel)) + '<small>' + when + '</small>';
    };
    days.forEach(b => { b.onclick = () => { sel = +b.dataset.day; cue('ui'); draw(); }; });
    draw();
  }
  function renderHome() {
    inviteTick(); $('#btn-invite').hidden = !inviteOn(); if (!inviteAsked) setTimeout(inviteIncoming, 400);
    $('#streak-n').textContent = streakNow(); $('#streak-u').textContent = tr('day_unit', { n: streakNow() });
    const cont = S.cur && S.cur.level === S.level && S.cur.status !== 'won';
    $('#play-label').textContent = tr(cont ? 'play_cont' : 'play_level', { n: S.level });
    $('#play-sub').textContent = cont ? tr('play_found', { n: S.cur.found }) : TIER_NAME[policy(S.level).tier];
    if (S.level >= DAILY_UNLOCK) Metrics.step('daily_unlocked');
    const day = dayIndex(), locked = S.level < DAILY_UNLOCK, done = S.daily.done[day] !== undefined;
    $('#btn-daily').classList.toggle('locked', locked);
    $('#btn-daily').firstElementChild.style.backgroundImage = 'url(' + (locked ? ART.ic_lock : ART.ic_calendar) + ')';
    $('#daily-sub').textContent = locked ? tr('daily_from', { n: DAILY_UNLOCK }) : done ? tr('daily_done_at', { time: fmtTime(S.daily.done[day]) }) : '';
    renderMap();
  }

  /* ---------- 로비: 레벨 길 ----------
     오리가 한 칸씩 올라가는 길이에요. 아래가 지나온 판, 위가 앞으로 갈 판이고 손가락으로 끌어 올려 볼 수 있어요.
     판마다 난이도(HARD·SUPER HARD), 깨면 받는 선물, 새로 열리는 도구가 보여요. */
  const MAP_STEP = 80, MAP_BACK = 30, MAP_AHEAD = 170;
  function mapX(L) { return 50 + 26 * Math.sin(L * 0.83); }                     // 길이 좌우로 굽이쳐요 (가로 %)
  function mapOpens(L) { const o = Object.keys(TOOL_UNLOCK).filter(t => TOOL_UNLOCK[t] === L && L > 1).map(t => TOOL_ICON[t]); if (L === DAILY_UNLOCK) o.push('ic_calendar'); return o; }
  function mapSide(L) {                                                         // 노드 옆 쪽지: 새로 열리는 것, 깨면 받는 선물
    const ic = k => '<i class="ic" style="background-image:url(' + ART[k] + ')"></i>', o = mapOpens(L), g = levelGift(L), out = [];
    if (o.length) out.push(o.map(ic).join('') + '<b>' + tr('map_opens') + '</b>');
    if (g.length) out.push(g.map(r => ic(TOOL_ICON[r[0]])).join('') + '<b>+1</b>');
    return out.join('<i class="bar"></i>');
  }
  function renderMap() {
    const box = $('#map'), inner = $('#map-in'); if (!box) return;
    const cur = S.level, lo = Math.max(1, cur - MAP_BACK), hi = cur + MAP_AHEAD;
    // 아래에서부터 높이를 쌓아요. 큰 노드(HARD·SUPER HARD)의 이름표·얼굴, 지금 판에 서 있는 오리가 옆 노드와 겹치지 않게 그 사이만 더 띄워요.
    const up = {}; let acc = 70;
    for (let L = lo; L <= hi; L++) { if (L > lo) acc += MAP_STEP + (tierOf(L) ? 16 : 0) + (tierOf(L - 1) ? 10 : 0) + (L - 1 === cur ? 36 : 0); up[L] = acc; }
    const H = acc + 120, Y = L => H - up[L];
    // 길은 노드에서 꺾이지 않게, 노드 사이를 잘게 나눠 물결 모양 그대로 한 줄로 이어요
    const SUB = 8; let way = '', done = '', nodes = '';
    for (let L = lo; L <= hi; L++) {
      const x = mapX(L).toFixed(1), y = Y(L);
      let seg = (L === lo ? 'M' : 'L') + mapX(L).toFixed(2) + ' ' + y.toFixed(1);
      if (L > lo) { let mid = ''; for (let k = 1; k < SUB; k++) { const f = k / SUB; mid += 'L' + mapX(L - 1 + f).toFixed(2) + ' ' + (Y(L - 1) + (y - Y(L - 1)) * f).toFixed(1); } seg = mid + seg; }
      way += seg; if (L <= cur) done += seg;
      const t = tierOf(L), st = L < cur ? 'done' : L === cur ? 'cur' : 'todo', side = mapSide(L);
      const el = st === 'cur' ? 'button' : 'div';                                // 누를 수 있는 건 지금 판뿐이에요
      nodes += '<' + el + (st === 'cur' ? ' type="button"' : ' role="img"') + ' class="nd t' + t + ' ' + st + '" data-l="' + L + '" style="left:' + x + '%;top:' + y + 'px" aria-label="' + tr('play_level', { n: L }) + (t ? ' ' + TIER_NAME[t] : '') + '">' +
        (t && st !== 'cur' ? '<i class="face" style="background-image:url(' + (ART[t === 2 ? 'head_super' : 'head_hard'] || '') + ')"></i>' : '') +
        '<span class="nb">' + L + '</span>' +
        (t ? '<em class="tag">' + TIER_NAME[t] + '</em>' : '') +
        (side ? '<span class="side ' + (mapX(L) < 50 ? 'r' : 'l') + '">' + side + '</span>' : '') +
        (st !== 'cur' ? '' : t ? '<span class="me pic" style="background-image:url(' + (ART[t === 2 ? 'duck_super' : 'duck_hard'] || '') + ')"></span>' : '<span class="me">' + duckHTML(L, '') + '</span>') + '</' + el + '>';
    }
    inner.style.height = H + 'px';
    inner.innerHTML = '<svg viewBox="0 0 100 ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path class="way" d="' + way + '"/><path class="way edge" d="' + done + '"/><path class="way done" d="' + done + '"/></svg>' + nodes;
    box.scrollTop = Y(cur) - box.clientHeight * 0.58;                           // 지금 판이 가운데 조금 아래에 오게
  }
  function mapBind() {
    const box = $('#map'); let drag = null, moved = false;
    box.addEventListener('click', e => {                                        // 지금 판 노드만 눌러져요 (다른 노드는 보기만)
      const nd = e.target.closest('.nd.cur'); if (!nd || moved) return;
      Snd.ensure(); cue('ui'); startMain(true);
    });
    // 마우스로도 끌어서 올려 볼 수 있게 (손가락은 그냥 스크롤)
    box.addEventListener('pointerdown', e => { moved = false; if (e.pointerType === 'mouse') drag = { y: e.clientY, top: box.scrollTop }; });
    window.addEventListener('pointermove', e => { if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 5) moved = true; box.scrollTop = drag.top - dy; });
    window.addEventListener('pointerup', () => { drag = null; });
  }

  /* ---------- 튜토리얼: 별도 4×4 판에서 배치 → 제외 → 추론 순서로 직접 해 보기 ---------- */
  function startTutorial() {
    const v = vsOf('tutorial');
    setupGame('tutorial', { pk: ['a4', 0, v % 8, v % 997] });                     // 튜토리얼도 기기마다 방향·색이 달라요 (단계는 판을 보고 정해져서 그대로예요)
    const pre = G.pre[0]; G.marks[pre] = BLANK; G.found = 0;
    G.tut = { step: 0, kind: '', allow: null, free: false, first: pre };
    show('game');
    $('#hintbar').hidden = true; $('#draftbar').hidden = true; toolsShown(false); $('#btn-rules').hidden = true; $('#hearts-row').hidden = true; $('#colors-row').hidden = true; $('#guide').hidden = false;
    View.build(); hud(true); status(''); ttMark(null); spot(false);
    Metrics.start(G); Metrics.checkpoint(G, 'start'); save();
    requestAnimationFrame(() => View.fit());
    tutStep(1);
  }
  function tutGuide(html, img, ok, cells) {
    $('#guide-text').innerHTML = html; $('#guide-duck').src = ART[img || 'duck_hello'];
    const b = $('#guide-ok'); b.hidden = !ok; b.onclick = ok || null; okDim(!!ok, cells);
    const g = $('#guide'); g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
    requestAnimationFrame(() => View.fit());
  }
  function tutTargets(kind, cells, demo) {
    G.tut.kind = kind; G.tut.allow = new Set(cells); G.tut.free = false; G.tut.demo = demo;
    View.clearOverlays();
    View.dim(cells);                                                            // 눌러야 할 칸만 밝게
    cells.forEach(c => View.overlay(c, '<span class="ring ' + (kind === 'duck' ? 'target' : 'tut') + '"></span>'));
    tutHand();
  }
  function tutHand() {
    const T = G && G.tut; if (!T || !T.allow || !T.demo || G.status !== 'play') return View.handOff();
    const n = G.n, left = Array.from(T.allow).filter(c => T.kind === 'duck' ? G.marks[c] !== DUCK : G.marks[c] === BLANK);
    left.sort((x, y) => { const rx = (x / n) | 0, ry = (y / n) | 0; return rx !== ry ? rx - ry : (rx % 2 ? y - x : x - y); });   // 지그재그로 한 붓에 문지르는 순서
    View.hand(left, T.demo);
  }
  function tutSingle() {
    const a = E.analyze(G.b, G.marks), n = G.n;
    for (const t of ['row', 'col', 'reg']) for (let u = 0; u < n; u++) {
      if ((t === 'row' ? a.rowHas : t === 'col' ? a.colHas : a.regHas)[u]) continue;
      const cs = E.unitCells(G.b, t, u).filter(c => a.cand[c]);
      if (cs.length === 1) return cs[0];
    }
    for (let i = 0; i < n * n; i++) if (G.b.solSet[i] && G.marks[i] !== DUCK) return i;
    return -1;
  }
  function tutBasic(lineOnly) {
    const n = G.n, out = new Set(), nb = E.neighbors(n);
    for (let d = 0; d < n * n; d++) if (G.marks[d] === DUCK) {
      const r = (d / n) | 0, c = d % n;
      for (let k = 0; k < n; k++) { out.add(r * n + k); out.add(k * n + c); }
      if (!lineOnly) nb[d].forEach(x => out.add(x));
    }
    return Array.from(out).filter(c => G.marks[c] === BLANK);
  }
  function tutStep(s) {
    const T = G.tut; T.step = s;
    Metrics.tutorialPrompt(s, G);
    if (s === 1) { tutTargets('duck', [T.first], 'tap2'); tutGuide(tr('tut_1'), 'duck_hello'); }
    else if (s === 2) {
      T.kind = 'info'; T.allow = new Set(); T.demo = ''; View.clearOverlays(); View.unit('reg', G.b.reg[T.first]);
      tutGuide(tr('tut_2'), 'duck_joy', () => { cue('ui'); Metrics.step('tut_color_ack'); tutStep(3); }, G.b.regCells[G.b.reg[T.first]]);
    }
    else if (s === 3) { tutTargets('x', tutBasic(true), 'tap1'); tutGuide(tr('tut_3'), 'duck_think'); }
    else if (s === 4) { tutTargets('duck', [tutSingle()], 'tap2'); tutGuide(tr('tut_4'), 'duck_hello'); }
    else if (s === 5) { tutTargets('x', tutBasic(false), 'rub'); tutGuide(tr('tut_5'), 'duck_think'); }
    else if (s === 6) { tutTargets('duck', [tutSingle()], 'tap2'); tutGuide(tr('tut_6'), 'duck_hello'); }
    else if (s === 7) {                                                         // 화면을 어둡게 하고 도쿠힌트를 바로 눌러 보게 해요
      T.kind = 'hint'; T.allow = new Set(); T.free = false; T.demo = ''; View.clearOverlays();
      tutBasic(false).forEach(c => { G.marks[c] = XM; View.cell(c, true); }); G.rev++;   // 남은 뻔한 X는 채워 둬서 힌트가 바로 마지막 오리를 알려 주게
      toolsShown(true); hud(); spot(true); ttMark('hint');
      tutGuide(tr('tut_7'), 'duck_think');
    }
    else if (s === 8) { tutTargets('duck', [tutSingle()], 'tap2'); tutGuide(tr('tut_8'), 'duck_hello'); }   // 힌트가 오리 자리가 아니었을 때만
  }
  function tutProgress() {
    const T = G.tut; if (!T) return;
    if (T.kind === 'hint') { if (!UI.hint) tutStep(8); return; }
    if (T.kind === 'duck') { if (Array.from(T.allow).every(c => G.marks[c] === DUCK)) tutStep(T.step + 1); }
    else if (T.kind === 'x') {
      const left = Array.from(T.allow).filter(c => G.marks[c] === BLANK);
      $$('.ov', $('#cells')).forEach(e => { if (!e.parentNode.firstChild.innerHTML) return; e.remove(); });
      if (!left.length) { Metrics.tutorialDone(T.step); tutStep(T.step + 1); } else if (!ptr) tutHand();
    }
  }

  /* ---------- 시작 ---------- */
  // HTML에 쓴 글자 채우기: data-i18n·data-i18n-attr는 NcqLang이, 줄바꿈(<br>)이 든 글자는 여기서
  function applyTexts() {
    const L = window.NcqLang;
    if (L && L.ready) L.apply(); else $$('[data-i18n]').forEach(el => { el.textContent = tr(el.getAttribute('data-i18n')); });
    $$('[data-i18n-html]').forEach(el => { el.innerHTML = tr(el.getAttribute('data-i18n-html')); });
    if (!(L && L.ready)) document.documentElement.lang = 'en';
  }
  function onLang() {
    applyTexts(); inviteTick();
    if (!$('#scr-home').hidden) renderHome();
    if (G && !$('#scr-game').hidden) { hud(true); if (UI.mode === 'draft') draftCount(); }
    if (settingsOpen !== null && !$('#modal').hidden) showSettings(settingsOpen);   // 설정 창은 고른 언어로 다시 그려요
  }
  let languageStarted = false;
  function startupLanguage() {
    // 인증 전에는 URL·기기 언어만 읽어요. NcqLang.init은 계정 저장 복원 뒤에 불러요.
    const match = value => /^(en|ko)(?:[-_]|$)/i.exec(String(value || ''));
    try {
      const fromUrl = match(new URLSearchParams(location.search).get('lang'));
      if (fromUrl) return fromUrl[1].toLowerCase();
    } catch (e) { /* 주소를 읽을 수 없으면 기기 언어 */ }
    for (const value of navigator.languages || [navigator.language]) {
      const found = match(value); if (found) return found[1].toLowerCase();
    }
    return 'en';
  }
  function initLanguage() {
    if (languageStarted) return;
    languageStarted = true;
    if (window.NcqLang) { try { window.NcqLang.init({ id: 'dokuduck', texts: window.DOKU_TEXTS }); window.NcqLang.onChange(onLang); } catch (e) { /* 언어 모듈이 없어도 영어로 표시 */ } }
  }
  function partnerStatus(key) {
    const el = $('#partner-status');
    el.hidden = !key;
    if (key) $('p', el).textContent = tr(key);
    if (!partnerBooted) document.documentElement.lang = startupLanguage();
    $('#app').inert = !!key;
  }
  async function launch() {
    if (!NEPTUNE) { boot(); return; }
    partnerStatus('partner_loading');
    partnerPaused = document.hidden;
    window.addEventListener('ncq-kakao-pause', () => {
      partnerPaused = true;
      if (partnerBooted) { save(); backupPartner(true); partnerStatus('partner_paused'); }
    });
    window.addEventListener('ncq-kakao-resume', () => {
      partnerPaused = document.hidden;
      if (partnerBooted) partnerStatus(partnerPaused ? 'partner_paused' : null);
    });
    try {
      const bridge = window.NcqKakao;
      const sdk = window.NcqNeptune;
      if (window.NCQ.NCQ_PLATFORM !== 'kakaopay' || !KAKAO.app_id || !KAKAO.game_id || !bridge || !bridge.ready || !bridge.status || !bridge.start || !sdk || !sdk.status) throw Error('partner_config');
      const state = await bridge.ready();
      if (!state || !state.available || !state.membershipReady || !bridge.status().membershipReady || !sdk.status().ready) throw Error('partner_not_ready');
      // 회원 확인·탈퇴 확인·서버 저장 복원이 끝난 다음에만 저장을 읽고 게임을 열어요.
      partnerBooted = true;
      boot();
      if (typeof sdk.setExtraData === 'function') {
        sdk.setExtraData(partnerProgress); partnerExtraRegistered = true; backupPartner(false);
      }
      await bridge.start();
      partnerStatus(partnerPaused ? 'partner_paused' : null);
    } catch (e) {
      partnerBooted = false;
      partnerExtraRegistered = false; clearTimeout(partnerBackupTimer);
      partnerPaused = true;
      partnerStatus('partner_failed');
    }
  }
  function boot() {
    const dk = document.createElement('style');                                 // 오리 조각 그림은 한 번만 등록해요 (칸마다 주소를 되풀이하지 않게)
    dk.textContent = [['b0', 'duck_body'], ['b1', 'duck_wave'], ['hf', 'duck_head'], ['hr', 'duck_hair'], ['fb', 'duck_blush'], ['fk', 'duck_beak'], ['fe', 'duck_eyes']].map(p => '.dk .' + p[0] + '{background-image:url("' + ART[p[1]] + '")}').join('');
    document.head.appendChild(dk);
    loadSave(); inviteStart(); Snd.ensure(); Object.keys(SFX).forEach(k => Snd.decode(SFX[k][0])); bgmStart();
    bootMainSnapshot = S.cur; bootDailySnapshot = S.daily.cur; save();
    // 언어: 주소의 ?lang= → 고른 언어 → 기기 언어 → 영어 (NcqLang). 바꾸면 지금 화면을 다시 그려요
    initLanguage();
    applyTexts();
    $$('[data-ic]').forEach(el => { el.style.backgroundImage = 'url(' + (ART[el.dataset.ic] || '') + ')'; });
    ['color', 'line', 'adj'].forEach(k => { $('#rg-' + k).innerHTML = ruleGrid(k); });
    const logo = $('#logo'); if (ART.logo) logo.style.backgroundImage = 'url(' + ART.logo + ')'; else logo.textContent = 'dokuduck';
    const board = $('#board');
    board.addEventListener('pointerdown', onDown); board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp); board.addEventListener('pointercancel', onUp);
    window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true);   // 판이 잠깐 막혀(pointer-events: none) 판에 손 뗀 신호가 오지 않아도 놓쳐지지 않게 (아이폰)
    board.addEventListener('contextmenu', e => e.preventDefault());
    board.addEventListener('pointerleave', () => { if (!ptr && G && UI.mode === 'locate') View.pickHover(-1); });
    $('#btn-play').onclick = () => { Snd.ensure(); cue('ui'); startMain(true); };
    mapBind();
    $('#btn-daily').onclick = () => {
      Snd.ensure(); cue('ui');
      if (S.level < DAILY_UNLOCK) return toast(tr('unlock_at', { n: DAILY_UNLOCK }));
      const day = dayIndex();
      if (S.daily.done[day] === undefined) return startDaily(false);
      openModal('<img class="hero" src="' + ART.duck_joy + '" alt=""><h2>' + tr('daily_done_title') + '</h2><div class="stats"><div class="stat"><span>' + tr('stat_today') + '</span><b>' + fmtTime(S.daily.done[day]) + '</b></div><div class="stat"><span>' + tr('stat_best') + '</span><b>' + fmtTime(S.daily.best) + '</b></div><div class="stat"><span>' + tr('stat_total') + '</span><b>' + S.daily.count + '</b></div></div><p>' + tr('daily_done_text') + '</p><div class="col"><button class="btn yellow" data-act="again">' + tr('btn_practice') + '</button><button class="btn ghost" data-act="close">' + tr('close') + '</button></div>', { again() { closeModal(); startDaily(true); } }, true, 'daily_summary');
    };
    $('#btn-streak').onclick = () => { cue('ui'); showStreak(); };
    $('#btn-invite').onclick = () => { cue('ui'); showInvite(); };
    $('#btn-home-settings').onclick = () => { cue('ui'); showSettings(false); };
    $('#btn-game-settings').onclick = () => { cue('ui'); showSettings(true); };
    $('#btn-rules').onclick = () => { cue('ui'); showRules(); };
    $('#btn-back').onclick = () => {
      cue('ui');
      if (G && G.mode === 'tutorial') { if (S.tutorialDone) { G = null; show('home'); } return; }
      if (UI.mode === 'draft') draftCancel(); else if (UI.mode === 'locate') setMode('play');
      if (UI.hint) hintClose(false);
      save(); G = null; show('home');
    };
    $$('.tool').forEach(el => { el.onclick = () => useTool(el.dataset.tool); });
    $('#cells').addEventListener('animationend', e => {
      const c = e.target.classList; if (!c || !c.contains('duck')) return;
      if (e.animationName === 'duckin') c.remove('in'); else if (e.animationName === 'cheer') c.remove('hop'); else if (e.animationName === 'settle') c.remove('settle');
    });
    $('#hint-apply').onclick = () => hintClose(true);
    $('#hint-more').onclick = () => {
      cue('ui'); const h = UI.hint; drawHint(h, true); $('#hint-more').hidden = true;
      $('#hint-text').textContent = tr('hint_contra_more');
    };
    $('#draft-cancel').onclick = () => { cue('ui'); draftCancel(); };
    $('#draft-apply').onclick = () => draftApply();
    $('#sheet').addEventListener('click', e => {
      const lb = e.target.closest('[data-lang]');
      if (lb) { cue('ui'); if (window.NcqLang) window.NcqLang.set(lb.dataset.lang); return; }
      const s = e.target.closest('[data-sw]');
      if (s) {
        const k = s.dataset.sw;
        if (k === 'bgm') { const on = !bgmOn(); window.NcqSound.enabled('bgm', on); s.setAttribute('aria-checked', on); cue('ui'); return; }
        if (k === 'vib') { const on = !vibOn(); vibSet(on); s.setAttribute('aria-checked', on); cue('ui'); return; }   // 켜면 바로 톡 하고 울려요
        S.settings[k] = !S.settings[k]; s.setAttribute('aria-checked', S.settings[k]); save(); cue('ui');
        if (k === 'pattern') $('#board').classList.toggle('patterns', S.settings.pattern);
        return;
      }
      const b = e.target.closest('[data-act]'); if (!b) return;
      Snd.ensure(); cue('ui');
      const acts = $('#sheet')._acts || {}, a = b.dataset.act;
      if (acts[a]) acts[a](b); else if (a === 'close') closeModal();   // 누른 버튼을 넘겨요 (연출 출발점)
    });
    document.addEventListener('pointerdown', e => {                             // 보드 밖을 누르면 색 선택 취소
      if (G && UI.mode === 'locate' && !G.tt && !e.target.closest('#board') && !e.target.closest('.tool')) setMode('play');
    });
    window.addEventListener('resize', () => View.fit());
    if (window.ResizeObserver) new ResizeObserver(() => View.fit()).observe($('#board-holder'));
    setInterval(() => {
      if (G && G.status === 'play' && screen === 'game' && !document.hidden && !partnerPaused && !modalOpen && !adBusy && !G.tut) { G.secs++; if (G.secs % 10 === 0) save(); }
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.status === 'play' && G.mode !== 'tutorial') save(); });
    Metrics.step('boot');
    if (!S.tutorialDone) startTutorial(); else show('home');
    adBanner();
  }
  // 기기 뒤로가기(구글플레이·토스): 떠 있는 창 → 도구 모드 → 게임 화면 순서로 닫고, 홈이면 false
  window.ncqBack = function () {
    const feedback = window.NcqFeedback;
    if (feedback && feedback.isOpen()) { feedback.close(); return true; }
    if (NEPTUNE && (!partnerBooted || partnerPaused)) return true;
    if (adBusy) return true;                                                    // 광고를 보는 동안에는 화면을 바꾸지 않아요
    if (modalOpen) { if (G && (G.status === 'lost' || G.status === 'won')) return true; closeModal(); return true; }
    if (screen === 'game') { $('#btn-back').click(); return true; }
    return false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch); else launch();
  window.__doku = { get G() { return G; }, get S() { return S; }, E: E, policy: policy, pickMain: pickMain, buildPuzzle: buildPuzzle };
})();
