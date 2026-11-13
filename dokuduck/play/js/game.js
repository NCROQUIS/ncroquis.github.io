/* dokuduck — 색 구역마다, 줄마다 오리 한 마리를 찾는 논리 퍼즐 */
(function () {
  'use strict';
  const E = window.DokuEngine, ART = window.DOKU_ART || {}, BANK = window.DOKU_BANK;
  const BLANK = 0, XM = 1, DUCK = 2, WRONG = 3;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const PALETTE = ['#F7A8C4', '#8FCDF2', '#8FDDB5', '#C3B1F0', '#FFB98A', '#CBE26B', '#5CC8C2', '#D9B48C', '#C9CED6', '#F58A8A', '#8FA3EE'];
  const TOOL_UNLOCK = { hint: 1, locate: 1, frog: 21, draft: 21 };
  const TOOL_NAME = { hint: '도쿠힌트', locate: '오리찾기', frog: '개굴점프', draft: '낙서연필' };
  const TOOL_DESC = { hint: '다음 수와 그 이유를 알려줘요.', locate: '선택한 색에서 오리 한 마리를 찾아줘요.', frog: '오리가 없는 빈칸 최대 3곳에 X를 찍어요.', draft: '오리와 X를 임시로 표시하고, 확정하거나 취소해요.' };
  const COMBO_MAX = 5, HARD_NAME = '깊은연못';
  const LINE_CLEAR = ['어… 벌써 다 풀었네요!', '저… 꽤 똑똑한가 봐요.', '꽥… 다음 연못도 가요!'], LINE_FAIL = ['어… 잠깐 멍해졌어요.', '괜찮아요. 다시 해봐요.'];
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function iga(w) { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 ? '이' : '가'); }
  const TOOL_ICON = { hint: 'ic_bulb', locate: 'ic_find', frog: 'ic_frog', draft: 'ic_pencil' };
  // 연속 플레이 선물: 1~6일차는 작은 선물, 7일차는 큰 선물. 아직 안 열린 도구(레벨 21 전의 개굴점프·낙서연필)는 도쿠힌트로 대신 줘요.
  const STREAK_GIFT = [[['hint', 1]], [['frog', 1]], [['draft', 1]], [['hint', 1]], [['frog', 1]], [['draft', 1]], [['hint', 2], ['locate', 2]]];
  function streakGift(d) { return STREAK_GIFT[d - 1].map(r => S.level < TOOL_UNLOCK[r[0]] ? ['hint', r[1]] : r); }
  const DAILY_UNLOCK = 21;

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
  const SAVE_KEY = 'dokuduck.save.v2';
  function freshSave() {
    return {
      v: 1, tutorialDone: false, level: 1,
      tools: { hint: 5, locate: 5, frog: 2, draft: 5 },
      settings: { sfx: true, vib: true, pattern: false, slow: false },
      cur: null, daily: { done: {}, best: null, cur: null, count: 0 },
      streak: { count: 0, last: -1 }, milestones: {}, seen: {}, wins: 0,
      dda: { state: 1, clean: 0, day: -1 }, cursor: {}
    };
  }
  let S = freshSave();
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === 1) S = Object.assign(freshSave(), d, { tools: Object.assign(freshSave().tools, d.tools), settings: Object.assign(freshSave().settings, d.settings), daily: Object.assign(freshSave().daily, d.daily), streak: Object.assign(freshSave().streak, d.streak), dda: Object.assign(freshSave().dda, d.dda) });
    } catch (e) { /* 저장소를 못 쓰는 환경에서는 이번 실행 동안만 유지 */ }
  }
  function save() {
    if (G && G.status !== 'won') {
      const snap = snapshot();
      if (G.mode === 'main') S.cur = snap; else if (G.mode === 'daily') S.daily.cur = snap;
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  }

  /* ---------- 출제 정책: 엑셀 '레벨1-1000' 시트 그대로 ----------
     크기 주기(11레벨부터) 8,10,10,9,10,10,9,10,10 + 10의 배수는 Hard. 표에서 주기와 다른 줄은 FIXED에 적는다.
     값 = [크기, 최소 등급, 최대 등급, 선배치, Hard, 특별 판 이름] */
  const CYCLE = [8, 10, 10, 9, 10, 10, 9, 10, 10];
  const FIXED = {
    1: [4, 1, 1, 1, 0], 2: [5, 1, 1, 1, 0], 3: [6, 1, 1, 1, 0], 4: [6, 1, 1, 1, 0], 5: [8, 1, 1, 1, 0],
    6: [6, 1, 2, 1, 0], 7: [7, 1, 2, 1, 0], 8: [8, 1, 2, 1, 0], 9: [9, 1, 2, 1, 0], 10: [7, 2, 2, 1, 0, 'digit1'],
    20: [8, 2, 2, 0, 0, 'digit2'], 30: [9, 4, 4, 0, 1, '30'], 40: [8, 3, 3, 0, 1, 'window'], 50: [9, 4, 4, 0, 1, '50'],
    55: [9, 4, 4, 0, 0, 'wave'], 60: [9, 4, 4, 0, 1, '60'], 62: [7, 4, 4, 0, 0, 'bar'], 70: [9, 4, 4, 0, 1, '70'],
    75: [9, 4, 4, 0, 0, 'pi'], 80: [9, 4, 4, 0, 1, 'IQ'], 90: [9, 4, 4, 0, 1, '90'], 100: [10, 4, 4, 0, 1, '1'],
    123: [9, 4, 4, 0, 0, '123'], 200: [11, 4, 4, 0, 1], 250: [11, 4, 4, 0, 1], 314: [9, 4, 4, 0, 0], 456: [9, 4, 4, 0, 0, '456']
  };
  function policy(L) {
    const f = FIXED[L];
    if (f) return { size: f[0], rmin: f[1], rmax: f[2], prefill: f[3], hard: !!f[4], special: f[5] || '' };
    if (L % 10 === 0) return { size: 10, rmin: 5, rmax: 5, prefill: 0, hard: true, special: '' };
    const r = L <= 20 ? [1, 2] : L <= 50 ? [1, 3] : [2, 4];
    return { size: CYCLE[(L - 11) % 10], rmin: r[0], rmax: r[1], prefill: 0, hard: false, special: '' };
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
    const idx = cand[ord % cand.length], pass = Math.floor(ord / cand.length);
    return { pk: [key, idx, (idx * 5 + pass * 3) % 8], hard: pol.hard };                  // 은행을 한 바퀴 돌면 다른 방향으로 다시 낸다
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
  const Snd = {
    ctx: null,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    tone(type, f0, f1, dur, vol, delay, q) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (q) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = q; f.Q.value = 4; o.connect(f); node = f; }
      node.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      const c = this.ctx; if (!c) return;
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    },
    play(name) {
      if (!S.settings.sfx) return;
      this.ensure(); if (!this.ctx) return;
      switch (name) {
        case 'x': this.noise(0.05, 0.22, 2600); break;
        case 'erase': this.noise(0.05, 0.12, 1400); break;
        case 'quack': this.tone('sawtooth', 620, 420, 0.09, 0.2, 0, 1300); this.tone('sawtooth', 540, 330, 0.13, 0.22, 0.1, 1100); break;
        case 'wrong': this.tone('square', 190, 110, 0.24, 0.13); break;
        case 'ui': this.tone('sine', 700, 900, 0.06, 0.12); break;
        case 'hint': this.tone('triangle', 660, 990, 0.14, 0.16); this.tone('triangle', 990, 1320, 0.16, 0.14, 0.1); break;
        case 'frog': this.tone('square', 150, 210, 0.07, 0.1, 0, 500); this.tone('square', 170, 240, 0.08, 0.1, 0.09, 600); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.18, i * 0.11)); this.tone('sawtooth', 620, 420, 0.09, 0.14, 0.5, 1300); this.tone('sawtooth', 540, 330, 0.13, 0.16, 0.6, 1100); break;
        case 'lose': [392, 330, 262].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.26, 0.16, i * 0.16)); break;
      }
    }
  };
  function buzz(ms) { if (S.settings.vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* 무시 */ } } }

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
    return '<span class="mk duck dk' + (cls ? ' ' + cls : '') + '" role="img" aria-label="오리" style="--d:-' + ((i * 370) % 2600) + 'ms;--bd:' + (4.3 + (i * 7 % 5) * .5).toFixed(1) + 's;--fd:' + (11 + (i * 5 % 7) * 1.4).toFixed(1) + 's;--fo:-' + ((i * 3.7) % 11).toFixed(1) + 's"><span class="hd"><i class="hf"></i><i class="hr"></i><i class="fb"></i><i class="fk"></i><i class="fe"></i></span><i class="b0"></i><i class="b1"></i></span>';
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
      const h = $('#board-holder'); if (!h || !h.clientWidth) return;
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
    },
    dimOff() { $('#dim').classList.remove('on'); },
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

  function snapshot() {
    return { mode: G.mode, level: G.level, day: G.day, pk: G.pk, hard: G.hard, marks: Array.from(G.marks), hearts: G.hearts, found: G.found, mistakes: G.mistakes, score: G.score, combo: G.combo, secs: G.secs, used: G.used, revives: G.revives, status: G.status, lethal: G.lethal, attempt: G.attempt, practice: G.practice };
  }
  function setupGame(mode, opt, snap) {
    const built = buildPuzzle(opt.pk), b = built.b, n = b.n;
    const seed = hash(opt.pk.join('/') + '|' + (opt.level || opt.day || 0));
    const order = shuffled(PALETTE.map((c, i) => i), rng(seed));
    G = {
      mode: mode, level: opt.level || 0, day: opt.day || 0, pk: opt.pk, hard: !!opt.hard, practice: !!opt.practice, b: b, n: n, seed: seed, pre: built.pre,
      colors: order.slice(0, n).map(i => PALETTE[i]), pats: order.slice(0, n),
      marks: new Uint8Array(n * n), hearts: 3, found: 0, mistakes: 0, score: 0, combo: 0, secs: 0,
      used: { hint: 0, locate: 0, frog: 0, draft: 0 }, revives: 0, status: 'play', rev: 0, paidHint: null, draft: null, lethal: null, attempt: 1, tut: null
    };
    if (snap) {
      G.marks = Uint8Array.from(snap.marks); G.hearts = snap.hearts; G.found = snap.found; G.mistakes = snap.mistakes; G.score = snap.score; G.combo = snap.combo;
      G.secs = snap.secs; G.used = snap.used; G.revives = snap.revives; G.status = snap.status; G.lethal = snap.lethal || null; G.attempt = snap.attempt || 1; G.practice = !!snap.practice;
    } else built.pre.forEach(c => { G.marks[c] = DUCK; G.found++; });
    UI.mode = 'play'; UI.hint = null; UI.busy = false; lastTap.cell = -1;
  }
  function startMain(resume) {
    if (resume && S.cur && S.cur.level === S.level) setupGame('main', S.cur, S.cur);
    else { const p = pickMain(S.level); setupGame('main', { pk: p.pk, level: S.level, hard: p.hard }); }
    enterGame();
  }
  function startDaily(practice) {
    const day = dayIndex(), cur = S.daily.cur;
    if (!practice && cur && cur.day === day && cur.status !== 'won') setupGame('daily', cur, cur);
    else { const p = pickDaily(day); setupGame('daily', { pk: p.pk, day: day, practice: !!practice }); }
    enterGame();
  }
  function enterGame() {
    show('game');
    $('#guide').hidden = true; $('#hintbar').hidden = true; $('#draftbar').hidden = true; toolsShown(true); $('#tools').classList.remove('dim');
    $('#btn-rules').hidden = false; $('#hearts-row').hidden = false; $('#colors-row').hidden = false;
    const bd = $('#board'); bd.style.animation = 'none'; void bd.offsetWidth; bd.style.animation = '';
    View.build(); hud(true); status('');
    requestAnimationFrame(() => View.fit());
    save();
    if (G.status === 'lost') setTimeout(showFail, 300);
    else if (G.mode === 'main' && G.level === 21 && !S.seen.unlock21) { S.seen.unlock21 = 1; save(); setTimeout(showUnlock, 350); }
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
    $('#g-level-label').textContent = G.mode === 'main' ? '레벨' : G.mode === 'daily' ? (G.practice ? '연습' : '오늘의 퍼즐') : '연습';
    const dt = new Date(G.day * 86400000);
    $('#g-level').textContent = G.mode === 'main' ? G.level : G.mode === 'daily' ? (dt.getUTCMonth() + 1) + '.' + dt.getUTCDate() : G.n + '×' + G.n;
    $('#g-badge').hidden = !G.hard; $('#g-badge').textContent = HARD_NAME;
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
  function canInput() { return G && G.status === 'play' && !UI.busy && !modalOpen && !UI.hint; }
  function editable(i) {
    if (G.tut) return G.tut.allow ? G.tut.allow.has(i) : G.tut.free;
    return true;
  }
  function paint(i, start) {
    if (!editable(i)) return;
    const m = G.marks[i];
    if (m === DUCK || m === WRONG) return;
    if (UI.mode === 'draft') {
      if (m !== BLANK) return;
      const dv = G.draft[i];
      if (ptr.pmode === null) ptr.pmode = dv ? 'erase' : 'add';
      if (ptr.pmode === 'add' && dv === 0) { G.draft[i] = 1; View.cell(i, true); Snd.play('x'); }
      else if (ptr.pmode === 'erase' && dv !== 0 && (start || dv === 1)) { G.draft[i] = 0; View.erase(i); Snd.play('erase'); }
      return;
    }
    if (G.tut && G.tut.kind === 'x') {                                          // 튜토리얼 X 단계: 지정 칸에 X만 추가
      if (m === BLANK) { G.marks[i] = XM; G.rev++; View.cell(i, true); Snd.play('x'); tutProgress(); }
      return;
    }
    if (G.tut && G.tut.kind === 'duck' && !start) return;
    if (ptr.pmode === null) ptr.pmode = m === BLANK ? 'add' : 'erase';
    if (ptr.pmode === 'add' && m === BLANK) { G.marks[i] = XM; G.rev++; View.cell(i, true); Snd.play('x'); }
    else if (ptr.pmode === 'erase' && m === XM) { G.marks[i] = BLANK; G.rev++; View.erase(i); Snd.play('erase'); }
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
    if (ptr || !canInput()) return;
    const i = View.cellAt(e); if (i < 0) return;
    e.preventDefault();
    try { $('#board').setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    ptr = { id: e.pointerId, last: i, pmode: null, done: false };
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
    return sameReg ? '어… 같은 색에 친구가 있어요.' : sameLine ? '이 줄엔 이미 친구가 있어요.' : adj ? '어… 너무 붙어 앉았어요.' : '어라… 여긴 제 자리가 아니에요.';
  }
  function placeDuck(i, scored) {
    G.marks[i] = DUCK; G.found++; G.rev++; G.paidHint = null;
    if (scored) { G.combo = Math.min(COMBO_MAX, G.combo + 1); const pts = 100 * G.combo; G.score += pts; View.float(i, '+' + pts, G.combo > 1 ? '콤보 ' + G.combo : ''); }
    View.cell(i, true); View.burst(i); Snd.play('quack'); buzz(18); hud();
    if (G.found >= G.n) { win(); return true; }
    return false;
  }
  function submitDuck(i) {
    if (!editable(i)) return;
    const m = G.marks[i];
    if (m === DUCK || m === WRONG) return;
    if (UI.mode === 'draft') { G.draft[i] = G.draft[i] === 2 ? 0 : 2; View.cell(i, true); Snd.play('ui'); return; }
    if (G.tut && G.tut.kind === 'x') return;
    if (G.b.solSet[i]) {
      const done = placeDuck(i, true);
      if (!done) { save(); if (G.tut) tutProgress(); }
      return;
    }
    if (G.tut) { G.marks[i] = BLANK; View.cell(i); toast('여기는 아니에요. 다시 찾아볼까요?'); Snd.play('wrong'); shake(i); return; }
    G.marks[i] = WRONG; G.rev++; G.paidHint = null; G.hearts--; G.mistakes++; G.combo = 0;
    toast(wrongReason(i)); Snd.play('wrong'); buzz([30, 40, 30]); shake(i);
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
    const d = touchStreak(); if (!d) return;
    const o = {}; streakGift(d).forEach(r => { o[r[0]] = (o[r[0]] || 0) + r[1]; rewards.push(r); });
    grant(o); notes.push(d === 7 ? '7일 연속 플레이 선물' : '연속 플레이 ' + d + '일차 선물');
  }
  function grant(items) { Object.keys(items).forEach(k => { S.tools[k] = Math.min(999999, (S.tools[k] || 0) + items[k]); }); }
  function win() {
    G.status = 'won'; UI.busy = true;
    const bonus = G.hearts * 200; G.score += bonus;
    const rewards = [], notes = [];
    if (G.mode === 'main') {
      ddaAfterWin();
      S.wins++; S.level = Math.max(S.level, G.level + 1); S.cur = null;
      if (G.level % 10 === 0 && !S.milestones[G.level]) { S.milestones[G.level] = 1; grant({ hint: 1, locate: 1 }); rewards.push(['hint', 1], ['locate', 1]); notes.push('어라, 건넜어요!'); }
      streakWin(rewards, notes);
    } else if (G.mode === 'daily') {
      S.daily.cur = null;
      if (!G.practice) {
        if (S.daily.done[G.day] === undefined) { S.daily.done[G.day] = G.secs; S.daily.count++; streakWin(rewards, notes); }
        if (S.daily.best === null || G.secs < S.daily.best) S.daily.best = G.secs;
      }
    } else if (G.mode === 'tutorial') S.tutorialDone = true;
    save();
    Snd.play('win'); buzz([20, 60, 20, 60, 40]);
    View.clearOverlays(); View.confetti();
    // 마지막 오리가 먼저 "여어!" 하고 손을 내린 다음(약 1.1초), 한 박자 쉬고 다 같이 "여어!"
    setTimeout(() => $$('.dk', $('#cells')).forEach(el => { el.classList.remove('in', 'settle'); el.classList.add('hop'); View.wave(el, 850); }), 1350);
    setTimeout(() => showResult(rewards, notes, bonus), 2700);
  }
  function lose() {
    G.status = 'lost'; G.combo = 0; save();
    Snd.play('lose');
    setTimeout(showFail, 650);
  }
  function restartSame() {
    const keepUsed = G.used, attempt = G.attempt + 1, mode = G.mode, opt = { pk: G.pk, level: G.level, day: G.day, hard: G.hard, practice: G.practice };
    setupGame(mode, opt); G.used = keepUsed; G.attempt = attempt;
    closeModal(); enterGame();
  }
  function revive() {
    if (G.lethal) { G.lethal.forEach(c => { if (G.marks[c] === WRONG) G.marks[c] = BLANK; }); G.lethal = null; }
    G.hearts = 3; G.combo = 0; G.revives++; G.status = 'play'; UI.busy = false;
    closeModal(); for (let i = 0; i < G.n * G.n; i++) View.cell(i); hud(); save(); toast('하트를 다시 채웠어요');
  }

  /* ---------- 도구 ---------- */
  function needTool(t) {
    openModal('<img class="hero" src="' + ART.duck_think + '" alt=""><h2>' + iga(TOOL_NAME[t]) + ' 다 떨어졌어요</h2><p>광고를 보면 ' + TOOL_NAME[t] + ' 1개를 받아요.</p>' +
      '<div class="col"><button class="btn primary" data-act="ad">' + icon(TOOL_ICON[t]) + '광고 보고 +1</button><button class="btn ghost" data-act="close">닫기</button></div><p class="note">테스트 빌드: 광고 없이 바로 지급돼요</p>',
      { ad() { grant({ [t]: 1 }); save(); closeModal(); hud(); toast(TOOL_NAME[t] + ' +1'); } });
  }
  function useTool(t) {
    if (!G || G.status !== 'play' || UI.busy) return;
    Snd.play('ui');
    if (UI.mode === 'locate' && t === 'locate') { setMode('play'); return; }
    if (UI.mode === 'draft') { if (t === 'draft') draftCancel(); return; }
    if (UI.hint) return;
    if (toolLocked(t)) { toast('레벨 ' + TOOL_UNLOCK[t] + '부터 쓸 수 있어요'); return; }
    if (G.tut && t !== 'hint') return;
    if (t === 'hint') return useHint();
    if (S.tools[t] <= 0) return needTool(t);
    if (t === 'locate') return locateStart();
    if (t === 'frog') return frogGo();
    if (t === 'draft') return draftStart();
  }
  function setMode(m) {
    UI.mode = m; View.clearOverlays();
    $('#tools').classList.toggle('dim', m !== 'play');
    $('#draftbar').hidden = m !== 'draft'; toolsShown(!(m === 'draft'));
    status(m === 'locate' ? '오리를 찾고 싶은 색을 눌러 주세요' : '');
    hud(); requestAnimationFrame(() => View.fit());
  }

  // 힌트
  const UNIT_WORD = { row: '이 가로줄', col: '이 세로줄', reg: '이 색' };
  function hintText(h) {
    switch (h.rule) {
      case 'basic': return '이 오리와 같은 줄이나 바로 옆 칸에는 다른 오리가 올 수 없어요.';
      case 'fixx': return '이 X는 지우고 다시 살펴보세요.';
      case 'single': return UNIT_WORD[h.ev.units[0].type] + '에서 오리가 올 수 있는 칸은 여기뿐이에요.';
      case 'line':
        if (h.kind === 'reg>row') return '이 색 오리는 꼭 이 가로줄에 있어요. 같은 줄의 다른 색 칸은 지울 수 있어요.';
        if (h.kind === 'reg>col') return '이 색 오리는 꼭 이 세로줄에 있어요. 같은 줄의 다른 색 칸은 지울 수 있어요.';
        return (h.kind === 'row>reg' ? '이 가로줄' : '이 세로줄') + '의 오리는 꼭 이 색 안에 있어요. 이 색의 다른 칸은 지울 수 있어요.';
      case 'group':
        if (h.kind.slice(0, 3) === 'reg') return '이 색 ' + h.k + '개가 이 줄 ' + h.k + '개를 모두 차지해요. 그 줄의 다른 색 칸은 지울 수 있어요.';
        return '이 줄 ' + h.k + '개의 오리는 모두 이 색 ' + h.k + '개 안에 있어요. 그 색의 다른 칸은 지울 수 있어요.';
      case 'contra': return '여기에 오리를 놓으면 ' + (h.chain.forced.length ? '결국 ' : '') + UNIT_WORD[h.chain.dead.type].replace('이 ', '빨간 ') + '에 오리가 올 자리가 없어져요.';
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
  }
  function useHint() {
    let h = G.paidHint && G.paidHint.rev === G.rev ? G.paidHint.h : null;
    if (!h) {
      if (!G.tut && S.tools.hint <= 0) return needTool('hint');
      h = E.hint(G.b, G.marks);
      if (!h) { toast('지금은 알려 줄 힌트가 없어요. 오리찾기를 써 보세요'); return; }
      if (!G.tut) { S.tools.hint--; G.used.hint++; }
      G.paidHint = { rev: G.rev, h: h }; save();
    }
    UI.hint = h; Snd.play('hint');
    $('#hint-duck').src = ART.duck_think; $('#hint-text').textContent = hintText(h);
    $('#hint-more').hidden = !(h.chain && h.chain.forced.length);
    $('#hintbar').hidden = false; toolsShown(false); status('');
    drawHint(h, false); hud(); requestAnimationFrame(() => View.fit());
  }
  function hintClose(apply) {
    const h = UI.hint; if (!h) return;
    UI.hint = null; View.clearOverlays();
    $('#hintbar').hidden = true; toolsShown(true);
    if (apply) {
      G.paidHint = null;
      if (h.action === 'duck') { placeDuck(h.targets[0], false); }
      else { h.targets.forEach(c => { G.marks[c] = h.action === 'x' ? XM : BLANK; View.cell(c, true); }); G.rev++; Snd.play('x'); }
      if (G.status === 'play') { save(); if (G.tut) tutProgress(); }
    }
    requestAnimationFrame(() => View.fit());
  }

  // 오리 찾기: 색을 고르면 그 색의 오리 한 마리를 알려 준다
  function openRegs() { const a = E.analyze(G.b, G.marks), r = []; for (let g = 0; g < G.n; g++) if (!a.regHas[g]) r.push(g); return r; }
  function locateReveal(g) {
    const cell = G.b.regCells[g].find(c => G.b.solSet[c]);
    S.tools.locate--; G.used.locate++; setMode('play');
    if (!placeDuck(cell, false)) save();
  }
  function locateStart() {
    const regs = openRegs();
    if (regs.length === 1) return locateReveal(regs[0]);
    setMode('locate'); View.pickable(regs);
  }
  function locatePick(i) {
    const g = G.b.reg[i];
    if (openRegs().indexOf(g) < 0) { toast('이 색은 이미 찾았어요'); return; }
    locateReveal(g);
  }

  // 개구리: 오리가 없는 빈칸 최대 3곳에 X
  async function frogGo() {
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
    S.tools.frog--; G.used.frog++; UI.busy = true; hud();
    const fx = $('#fx'), frog = document.createElement('img'); frog.className = 'frog'; frog.src = ART.ic_frog; frog.alt = '';
    frog.style.left = '50%'; frog.style.top = '108%'; fx.appendChild(frog);
    await wait(40);
    for (const c of (targets.length ? targets : [giveDuck])) {
      const p = View.center(c); frog.style.left = p[0] + '%'; frog.style.top = p[1] + '%';
      frog.classList.remove('jump'); void frog.offsetWidth; frog.classList.add('jump'); Snd.play('frog');
      await wait(520);
      if (targets.length) { G.marks[c] = XM; G.rev++; View.cell(c, true); Snd.play('x'); }
      await wait(160);
    }
    frog.remove(); UI.busy = false; G.paidHint = null;
    if (!targets.length) { if (!placeDuck(giveDuck, false)) save(); } else save();
    hud();
  }

  // 연필(드래프트): 임시로 그려 보고 한꺼번에 제출
  function draftStart() {
    S.tools.draft--; G.used.draft++; G.draft = new Uint8Array(G.n * G.n); save();
    setMode('draft');
  }
  function draftCancel() { const d = G.draft; G.draft = null; setMode('play'); if (d) for (let i = 0; i < d.length; i++) if (d[i]) View.cell(i); }
  function draftApply() {
    const d = G.draft, n = G.n, wrong = [], right = [], xs = [];
    for (let i = 0; i < n * n; i++) { if (d[i] === 2) (G.b.solSet[i] ? right : wrong).push(i); else if (d[i] === 1) xs.push(i); }
    G.draft = null; setMode('play'); G.paidHint = null;
    if (wrong.length >= G.hearts) {                                             // 치명적 제출: 초안은 버리고 남은 하트만큼 오답 처리
      const hit = wrong.slice(0, G.hearts);
      hit.forEach(c => { G.marks[c] = WRONG; }); G.lethal = hit; G.mistakes += hit.length; G.hearts = 0; G.rev++;
      for (let i = 0; i < n * n; i++) View.cell(i);
      hit.forEach(shake); Snd.play('wrong'); hud(); lose(); return;
    }
    xs.forEach(c => { G.marks[c] = XM; }); wrong.forEach(c => { G.marks[c] = WRONG; G.hearts--; G.mistakes++; });
    if (wrong.length) { G.combo = 0; Snd.play('wrong'); toast('어라… 틀린 오리가 ' + wrong.length + '마리 있어요.'); }
    G.rev++;
    for (let i = 0; i < n * n; i++) View.cell(i);
    wrong.forEach(shake); hud();
    let done = false;
    right.forEach(c => { if (!done) done = placeDuck(c, true); });
    if (!done) save();
  }

  /* ---------- 화면·모달 ---------- */
  function show(name) {
    screen = name;
    $('#scr-home').hidden = name !== 'home'; $('#scr-game').hidden = name !== 'game';
    if (name === 'home') renderHome();
  }
  function openModal(html, acts, dismissable) {
    modalOpen = true;
    // 창에는 X 버튼을 두지 않아요. 닫을 수 있는 창은 맨 아래에 큰 '닫기' 버튼을 둬요 (dismissable은 뒤로가기·바깥 누르기로도 닫힘)
    const sheet = $('#sheet'); sheet.innerHTML = html + (dismissable && html.indexOf('data-act="close"') < 0 ? '<div class="col"><button class="btn ghost" data-act="close">닫기</button></div>' : '');
    sheet._acts = acts || {}; $('#modal').hidden = false; sheet.scrollTop = 0;
    $$('[data-count]', sheet).forEach(el => {
      const to = +el.dataset.count, t0 = performance.now() + 250;
      (function step(now) { const k = Math.max(0, Math.min(1, (now - t0) / 650)); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(step); })(performance.now());
    });
  }
  function closeModal() { modalOpen = false; $('#modal').hidden = true; }
  function rewardHTML(list) { return list.length ? '<div class="rewards">' + list.map(r => '<span class="reward">' + icon(TOOL_ICON[r[0]]) + TOOL_NAME[r[0]] + ' +' + r[1] + '</span>').join('') + '</div>' : ''; }

  function showResult(rewards, notes, bonus) {
    UI.busy = false;
    const usedN = G.used.hint + G.used.locate + G.used.frog + G.used.draft;
    let h = '<img class="hero joy" src="' + ART.duck_joy + '" alt="">';
    if (G.mode === 'tutorial') {
      h += '<h2>연습 끝!</h2><p>이제 진짜 퍼즐을 풀어 볼까요?</p><div class="col"><button class="btn big primary" data-act="next">레벨 1 시작</button></div>';
      return openModal(h, { next() { closeModal(); startMain(false); } });
    }
    h += '<h2>' + (G.mode === 'main' ? '레벨 ' + G.level + ' 클리어!' : G.practice ? '연습 완료!' : '오늘의 퍼즐 완료!') + '</h2><p>' + pick(LINE_CLEAR) + '</p>';
    h += '<div class="stats"><div class="stat"><span>시간</span><b>' + fmtTime(G.secs) + '</b></div><div class="stat"><span>실수</span><b>' + G.mistakes + '</b></div><div class="stat"><span>' + (G.mode === 'daily' ? '최고 기록' : '점수') + '</span><b>' + (G.mode === 'daily' ? fmtTime(S.daily.best) : '<i data-count="' + G.score + '" style="font-style:normal">0</i>') + '</b></div></div>';
    if (G.mode === 'main') h += '<p class="note">남은 하트 보너스 +' + bonus + ' · 사용한 도구 ' + usedN + '개</p>';
    if (rewards.length) h += '<p>' + notes.join(' · ') + '</p>' + rewardHTML(rewards);
    h += '<div class="col"><button class="btn big primary" data-act="next">' + (G.mode === 'main' ? '다음 레벨' : '레벨 ' + S.level + ' 이어서') + '</button><button class="btn ghost" data-act="home">' + icon('ic_home') + '홈으로</button></div>';
    openModal(h, { next() { closeModal(); startMain(true); }, home() { closeModal(); G = null; show('home'); } });
  }
  function showFail() {
    UI.busy = false;
    openModal('<img class="hero" src="' + ART.duck_sad + '" alt=""><h2>하트를 다 썼어요</h2><p>' + pick(LINE_FAIL) + '<br>오리 ' + G.n + '마리 중 ' + G.found + '마리를 찾았어요.</p>' +
      '<div class="col"><button class="btn primary" data-act="revive">' + icon('ic_heart') + '광고 보고 계속하기</button><button class="btn yellow" data-act="restart">' + icon('ic_retry') + '같은 판 다시 시작</button><button class="btn ghost" data-act="home">' + icon('ic_home') + '홈으로</button></div><p class="note">테스트 빌드: 광고 없이 바로 이어져요</p>',
      { revive: revive, restart: restartSame, home() { closeModal(); save(); G = null; show('home'); } });
  }
  function showUnlock() {
    openModal('<img class="hero" src="' + ART.duck_joy + '" alt=""><h2>새 도구가 열렸어요</h2>' +
      '<div class="opt">' + icon('ic_frog') + '<span class="l">' + TOOL_NAME.frog + '<small>' + TOOL_DESC.frog + '</small></span></div>' +
      '<div class="opt">' + icon('ic_pencil') + '<span class="l">' + TOOL_NAME.draft + '<small>' + TOOL_DESC.draft + '</small></span></div>' +
      '<div class="opt">' + icon('ic_calendar') + '<span class="l">오늘의 퍼즐<small>홈에서 매일 새 퍼즐을 풀 수 있어요</small></span></div>' +
      '<div class="col"><button class="btn primary" data-act="close">좋아요</button></div>', {});
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
    openModal('<h2>오리 찾는 법</h2>' + card(g1, '같은 색 칸에는 오리가 딱 한 마리 있어요.') + card(g2, '가로줄과 세로줄에도 한 마리씩만 있어요.') + card(g3, '오리끼리는 붙어 있지 않아요. 대각선으로 바로 옆도 안 돼요.') +
      '<p class="note">칸을 한 번 누르면 X, 같은 칸을 빠르게 두 번 누르면 오리. 쓱 문지르면 X를 이어서 그려요.</p><div class="col"><button class="btn primary" data-act="close">닫기</button></div>', {}, true);
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
  function sw(key, label, sub, ic) { return '<div class="opt">' + (ic ? icon(ic) : '') + '<span class="l">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><button class="sw" role="switch" aria-checked="' + !!S.settings[key] + '" data-sw="' + key + '" aria-label="' + label + '"></button></div>'; }
  function showSettings(inGame) {
    let h = '<h2>설정</h2>' + sw('sfx', '효과음', '', 'ic_sound') + sw('vib', '진동') + sw('pattern', '색 구역 무늬', '색 구분이 어려울 때 켜 주세요') + sw('slow', '느린 두 번 누르기', '두 번 누르기 간격을 넉넉하게');
    h += '<div class="col"><button class="btn ghost" data-act="rules">' + icon('ic_bulb') + '오리 찾는 법</button>';
    if (inGame && G && G.mode !== 'tutorial') h += '<button class="btn yellow" data-act="restart">' + icon('ic_retry') + '같은 판 다시 시작</button>';
    // NCQ_TEST_CHEAT: 테스트 메뉴 (레벨 이동·도구 지급)
    if (!inGame && (window.NCQ_TEST_CHEAT || !window.NCQ)) h += '<button class="btn ghost" data-act="test">테스트 메뉴</button>';
    // 앱 버전 표시: 빌드가 넣은 버전, 개발 중에는 dev
    const version = window.NCQ && window.NCQ.NCQ_VERSION;
    h += '<button class="btn primary" data-act="close">닫기</button></div><span class="ver" id="app-version">' + (version ? 'v' + version : 'dev') + '</span>';
    openModal(h, { rules: showRules, restart: confirmRestart, test: showTest }, true);
  }
  function confirmRestart() {
    openModal('<img class="hero" src="' + ART.duck_think + '" alt=""><h2>처음부터 다시 할까요?</h2><p>같은 퍼즐을 처음 상태로 되돌려요. 이미 쓴 도구는 돌아오지 않아요.</p><div class="col"><button class="btn yellow" data-act="restart">다시 시작</button><button class="btn ghost" data-act="close">취소</button></div>', { restart: restartSame });
  }
  function showTest() {
    openModal('<h2>테스트 메뉴</h2><p class="note">기획 확인용이에요. 출시 빌드에서는 빠져요.</p><div class="stepper"><button class="btn small" data-act="m10">-10</button><button class="btn small" data-act="m1">-1</button><b>레벨 ' + S.level + '</b><button class="btn small" data-act="p1">+1</button><button class="btn small" data-act="p10">+10</button></div>' +
      '<div class="col"><button class="btn ghost" data-act="tools">도구 전부 +5</button><button class="btn ghost" data-act="tut">튜토리얼 다시 보기</button><button class="btn ghost" data-act="reset">진행 전부 지우기</button></div>',
      {
        m10() { lv(-10); }, m1() { lv(-1); }, p1() { lv(1); }, p10() { lv(10); },
        tools() { grant({ hint: 5, locate: 5, frog: 5, draft: 5 }); save(); toast('도구 +5'); },
        tut() { closeModal(); startTutorial(); },
        reset() { S = freshSave(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ } closeModal(); startTutorial(); }
      }, true);
    function lv(d) { S.level = Math.max(1, S.level + d); S.cur = null; save(); showTest(); renderHome(); }
  }
  function showStreak() {
    // 받은 날은 완료 표시(체크), 고른 날은 점선 테두리가 돌아요. 날짜를 누르면 아래에 그날 선물이 나와요.
    const c = streakNow(), pos = c % 7 || (c ? 7 : 0), today = S.streak.last === dayIndex();
    let sel = Math.min(7, pos + 1), w = '';
    for (let i = 1; i <= 7; i++) w += '<button type="button" class="wd' + (i <= pos ? ' on' : '') + '" data-day="' + i + '" aria-label="' + i + '일차' + (i <= pos ? ' 받음' : '') + '">' + (i <= pos ? CHECK_SVG : i) + '</button>';
    openModal('<h2>연속 플레이 ' + c + '일</h2><div class="week">' + w + '</div><div class="gift" id="gift"></div><p class="note">하루에 한 판만 깨도 이어져요.</p><div class="row2"><button class="btn ghost" data-act="close">닫기</button><button class="btn primary" data-act="close">확인</button></div>', {}, true);
    const days = $$('.wd', $('#sheet'));
    const draw = () => {
      days.forEach(b => b.classList.toggle('sel', +b.dataset.day === sel));
      const when = sel <= pos ? '받았어요' : sel === pos + 1 ? (today ? '내일 한 판 깨면 받아요' : '오늘 한 판 깨면 받아요') : (sel - pos) + '일 더 이어가면 받아요';
      $('#gift').innerHTML = '<b>' + sel + '일차 선물</b>' + rewardHTML(streakGift(sel)) + '<small>' + when + '</small>';
    };
    days.forEach(b => { b.onclick = () => { sel = +b.dataset.day; Snd.play('ui'); draw(); }; });
    draw();
  }
  function renderHome() {
    $('#streak-n').textContent = streakNow();
    const cont = S.cur && S.cur.level === S.level && S.cur.status !== 'won';
    $('#play-label').textContent = (cont ? '이어하기 · ' : '') + '레벨 ' + S.level;
    $('#play-sub').textContent = cont ? '오리 ' + S.cur.found + '마리 찾음' : (policy(S.level).hard ? HARD_NAME : '');
    const day = dayIndex(), locked = S.level < DAILY_UNLOCK, done = S.daily.done[day] !== undefined;
    $('#btn-daily').classList.toggle('locked', locked);
    $('#btn-daily').firstElementChild.style.backgroundImage = 'url(' + (locked ? ART.ic_lock : ART.ic_calendar) + ')';
    $('#daily-sub').textContent = locked ? '레벨 ' + DAILY_UNLOCK + '부터' : done ? '완료 ' + fmtTime(S.daily.done[day]) : '';
  }

  /* ---------- 튜토리얼: 별도 4×4 판에서 배치 → 제외 → 추론 순서로 직접 해 보기 ---------- */
  function startTutorial() {
    setupGame('tutorial', { pk: ['a4', 0, 0] });
    const pre = G.pre[0]; G.marks[pre] = BLANK; G.found = 0;
    G.tut = { step: 0, kind: '', allow: null, free: false, first: pre };
    show('game');
    $('#hintbar').hidden = true; $('#draftbar').hidden = true; toolsShown(false); $('#btn-rules').hidden = true; $('#hearts-row').hidden = true; $('#colors-row').hidden = true; $('#guide').hidden = false;
    View.build(); hud(true); status('');
    requestAnimationFrame(() => View.fit());
    tutStep(1);
  }
  function tutGuide(html, img, ok) {
    $('#guide-text').innerHTML = html; $('#guide-duck').src = ART[img || 'duck_hello'];
    const b = $('#guide-ok'); b.hidden = !ok; b.onclick = ok || null;
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
    if (s === 1) { tutTargets('duck', [T.first], 'tap2'); tutGuide('<b>동그라미 친 칸</b>을 빠르게<br><b>두 번 톡톡!</b>', 'duck_hello'); }
    else if (s === 2) {
      T.kind = 'info'; T.allow = new Set(); T.demo = ''; View.clearOverlays(); View.unit('reg', G.b.reg[T.first]);
      tutGuide('잘했어요! <b>같은 색</b> 칸에는 오리가 <b>딱 한 마리</b>예요.', 'duck_joy', () => { Snd.play('ui'); tutStep(3); });
    }
    else if (s === 3) { tutTargets('x', tutBasic(true), 'tap1'); tutGuide('같은 줄에도 오리는 한 마리뿐! 표시된 칸을 <b>톡 눌러 X</b>', 'duck_think'); }
    else if (s === 4) { tutTargets('duck', [tutSingle()], 'tap2'); tutGuide('이 줄에 남은 칸은 하나! 여기를 <b>두 번 톡톡!</b>', 'duck_hello'); }
    else if (s === 5) { tutTargets('x', tutBasic(false), 'rub'); tutGuide('오리끼리는 붙을 수 없어요. 표시된 칸을 <b>쓱 문질러 X!</b>', 'duck_think'); }
    else if (s === 6) { tutTargets('duck', [tutSingle()], 'tap2'); tutGuide('세 번째 오리 자리가 보여요. <b>두 번 톡톡!</b>', 'duck_hello'); }
    else if (s === 7) {
      T.kind = 'free'; T.allow = null; T.free = true; T.demo = ''; View.clearOverlays(); toolsShown(true); hud();
      tutGuide('마지막 한 마리는 혼자 찾아봐요. 막히면 아래 <b>도쿠힌트</b>!', 'duck_think');
    }
  }
  function tutProgress() {
    const T = G.tut; if (!T) return;
    if (T.kind === 'duck') { if (Array.from(T.allow).every(c => G.marks[c] === DUCK)) tutStep(T.step + 1); }
    else if (T.kind === 'x') {
      const left = Array.from(T.allow).filter(c => G.marks[c] === BLANK);
      $$('.ov', $('#cells')).forEach(e => { if (!e.parentNode.firstChild.innerHTML) return; e.remove(); });
      if (!left.length) tutStep(T.step + 1); else if (!ptr) tutHand();
    }
  }

  /* ---------- 시작 ---------- */
  function boot() {
    const dk = document.createElement('style');                                 // 오리 조각 그림은 한 번만 등록해요 (칸마다 주소를 되풀이하지 않게)
    dk.textContent = [['b0', 'duck_body'], ['b1', 'duck_wave'], ['hf', 'duck_head'], ['hr', 'duck_hair'], ['fb', 'duck_blush'], ['fk', 'duck_beak'], ['fe', 'duck_eyes']].map(p => '.dk .' + p[0] + '{background-image:url("' + ART[p[1]] + '")}').join('');
    document.head.appendChild(dk);
    loadSave();
    $$('[data-ic]').forEach(el => { el.style.backgroundImage = 'url(' + (ART[el.dataset.ic] || '') + ')'; });
    $('#hero-duck').src = ART.duck_hello;
    ['color', 'line', 'adj'].forEach(k => { $('#rg-' + k).innerHTML = ruleGrid(k); });
    const logo = $('#logo'); if (ART.logo) logo.style.backgroundImage = 'url(' + ART.logo + ')'; else logo.textContent = 'dokuduck';
    const board = $('#board');
    board.addEventListener('pointerdown', onDown); board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp); board.addEventListener('pointercancel', onUp);
    board.addEventListener('contextmenu', e => e.preventDefault());
    board.addEventListener('pointerleave', () => { if (!ptr && G && UI.mode === 'locate') View.pickHover(-1); });
    $('#btn-play').onclick = () => { Snd.ensure(); Snd.play('ui'); startMain(true); };
    $('#btn-daily').onclick = () => {
      Snd.ensure(); Snd.play('ui');
      if (S.level < DAILY_UNLOCK) return toast('레벨 ' + DAILY_UNLOCK + '부터 열려요');
      const day = dayIndex();
      if (S.daily.done[day] === undefined) return startDaily(false);
      openModal('<img class="hero" src="' + ART.duck_joy + '" alt=""><h2>오늘의 퍼즐 완료</h2><div class="stats"><div class="stat"><span>오늘 기록</span><b>' + fmtTime(S.daily.done[day]) + '</b></div><div class="stat"><span>최고 기록</span><b>' + fmtTime(S.daily.best) + '</b></div><div class="stat"><span>누적 완료</span><b>' + S.daily.count + '</b></div></div><p>내일 새 퍼즐이 열려요. 같은 판을 연습으로 다시 풀 수 있어요.</p><div class="col"><button class="btn yellow" data-act="again">연습으로 다시 풀기</button><button class="btn ghost" data-act="close">닫기</button></div>', { again() { closeModal(); startDaily(true); } }, true);
    };
    $('#btn-streak').onclick = () => { Snd.play('ui'); showStreak(); };
    $('#btn-home-settings').onclick = () => { Snd.play('ui'); showSettings(false); };
    $('#btn-game-settings').onclick = () => { Snd.play('ui'); showSettings(true); };
    $('#btn-rules').onclick = () => { Snd.play('ui'); showRules(); };
    $('#btn-back').onclick = () => {
      Snd.play('ui');
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
      Snd.play('ui'); const h = UI.hint; drawHint(h, true); $('#hint-more').hidden = true;
      $('#hint-text').textContent = '여기에 오리가 있다고 해 볼게요. 그러면 번호 순서대로 오리 자리가 정해지고, 빨간 곳에는 오리가 올 칸이 남지 않아요.';
    };
    $('#draft-cancel').onclick = () => { Snd.play('ui'); draftCancel(); };
    $('#draft-apply').onclick = () => draftApply();
    $('#sheet').addEventListener('click', e => {
      const s = e.target.closest('[data-sw]');
      if (s) {
        const k = s.dataset.sw; S.settings[k] = !S.settings[k]; s.setAttribute('aria-checked', S.settings[k]); save(); Snd.play('ui');
        if (k === 'pattern') $('#board').classList.toggle('patterns', S.settings.pattern);
        return;
      }
      const b = e.target.closest('[data-act]'); if (!b) return;
      Snd.ensure(); Snd.play('ui');
      const acts = $('#sheet')._acts || {}, a = b.dataset.act;
      if (acts[a]) acts[a](); else if (a === 'close') closeModal();
    });
    document.addEventListener('pointerdown', e => {                             // 보드 밖을 누르면 색 선택 취소
      if (G && UI.mode === 'locate' && !e.target.closest('#board') && !e.target.closest('.tool')) setMode('play');
    });
    window.addEventListener('resize', () => View.fit());
    if (window.ResizeObserver) new ResizeObserver(() => View.fit()).observe($('#board-holder'));
    setInterval(() => {
      if (G && G.status === 'play' && screen === 'game' && !document.hidden && !modalOpen && !G.tut) { G.secs++; if (G.secs % 10 === 0) save(); }
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.status === 'play' && G.mode !== 'tutorial') save(); });
    if (!S.tutorialDone) startTutorial(); else show('home');
  }
  // 기기 뒤로가기(구글플레이·토스): 떠 있는 창 → 도구 모드 → 게임 화면 순서로 닫고, 홈이면 false
  window.ncqBack = function () {
    if (modalOpen) { if (G && (G.status === 'lost' || G.status === 'won')) return true; closeModal(); return true; }
    if (screen === 'game') { $('#btn-back').click(); return true; }
    return false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.__doku = { get G() { return G; }, get S() { return S; }, E: E, policy: policy, pickMain: pickMain, buildPuzzle: buildPuzzle };
})();
