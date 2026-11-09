// Station Zero art module: 3D-parallax space background, station designs, enemy sprite families.
// Shared by the game (index.src.html) and the art mockup page (sian.src.html). No game logic here.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const COL = { drone: '#5fe39a', meteor: '#9aa3b8', charger: '#ff9f4d', shooter: '#c08bff', boss: '#ff6f9f',
    splitter: '#b6f05a', mini: '#b6f05a', volatile: '#ffe04a', carapace: '#e3c992', mender: '#ff8fd6', brood: '#ff8a66', egg: '#ff8a66', stalker: '#9af2ff' }; // swarm expansion (2026-11-06)

  // ---------- shared glow sprite cache ----------
  const GLOW = {};
  function glowSprite(col) {
    if (GLOW[col]) return GLOW[col];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, col); gr.addColorStop(0.45, col + '66'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GLOW[col] = c; return c;
  }
  function glow(ctx, x, y, r, col, a) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ======================================================================
  // Background: deep layer (nebula, galaxy, dust stars) + 3D starfield + Luna.
  // A slow camera drift and a slow forward glide give every layer its own speed (parallax).
  // ======================================================================
  const ZN = 0.5, ZF = 6, VZ = 0.05;
  function makeBackground() { return { key: '', stars: null, deep: null, luna: null, glint: null, r: rng(7) }; }
  function buildBackground(bg, W, H) {
    bg.key = W + 'x' + H; const r = rng(11);
    const DW = Math.round(W * 1.1), DH = Math.round(H * 1.1);
    const d = document.createElement('canvas'); d.width = DW; d.height = DH; const g = d.getContext('2d');
    g.fillStyle = '#04060d'; g.fillRect(0, 0, DW, DH);
    const neb = (x, y, rr, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, DW, DH); };
    const M = Math.max(DW, DH);
    neb(DW * 0.12, DH * 0.22, M * 0.6, 'rgba(60,40,140,0.34)');
    neb(DW * 0.92, DH * 0.72, M * 0.55, 'rgba(20,90,140,0.28)');
    neb(DW * 0.62, DH * 0.04, M * 0.36, 'rgba(140,40,110,0.18)');
    neb(DW * 0.35, DH * 0.55, M * 0.25, 'rgba(40,70,160,0.10)');
    // faint dust lane
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 900; i++) {
      const t = r(), x = DW * (-0.1 + 1.2 * t), y = DH * (0.18 + 0.55 * t) + (r() - 0.5) * DH * 0.16 * (1 - Math.abs(t - 0.5));
      g.fillStyle = `rgba(150,170,255,${0.03 + r() * 0.05})`; g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
    // static far star dust
    for (let i = 0; i < 520; i++) { g.fillStyle = `rgba(220,230,255,${0.08 + r() * 0.22})`; const s = r() < 0.9 ? 1 : 1.6; g.fillRect(r() * DW, r() * DH, s, s); }
    g.globalCompositeOperation = 'source-over';
    bg.deep = d;
    // spiral galaxy, upper right: a face-on sprite that drawBackground tilts and slowly spins in its own plane
    const gR = Math.min(DW, DH) * 0.12, GS = Math.ceil(gR * 2.2), gc = document.createElement('canvas'); gc.width = gc.height = GS;
    const gg2 = gc.getContext('2d'), m = GS / 2; gg2.globalCompositeOperation = 'lighter';
    const core = gg2.createRadialGradient(m, m, 0, m, m, gR * 0.45); core.addColorStop(0, 'rgba(255,236,205,0.6)'); core.addColorStop(1, 'rgba(255,236,205,0)');
    gg2.fillStyle = core; gg2.fillRect(0, 0, GS, GS);
    for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 300; i++) {
      const th = i * 0.04, rr = gR * 0.07 * Math.exp(0.3 * th); if (rr > gR) break;
      const a = th + arm * Math.PI + (r() - 0.5) * 0.35, s = rr < gR * 0.3 ? 1.6 : 1.3;
      gg2.fillStyle = `rgba(200,215,255,${0.38 * (1 - rr / gR) + 0.05})`; gg2.fillRect(m + Math.cos(a) * rr, m + Math.sin(a) * rr, s, s);
    }
    bg.galaxy = gc; bg.galaxyAt = [DW * 0.8, DH * 0.15];
    // Luna: own layer so it can move a little faster than the deep layer
    const pr = Math.min(W, H) * 0.42, L = document.createElement('canvas'); L.width = L.height = Math.ceil(pr * 2.3); const lg = L.getContext('2d'), c0 = L.width / 2;
    const atm = lg.createRadialGradient(c0, c0, pr * 0.95, c0, c0, pr * 1.12); atm.addColorStop(0, 'rgba(111,211,255,0.18)'); atm.addColorStop(1, 'rgba(111,211,255,0)');
    lg.fillStyle = atm; lg.fillRect(0, 0, L.width, L.height);
    const pg = lg.createRadialGradient(c0 + pr * 0.35, c0 - pr * 0.35, pr * 0.1, c0, c0, pr);
    pg.addColorStop(0, '#5a6584'); pg.addColorStop(0.7, '#232a40'); pg.addColorStop(1, '#0b0e18');
    lg.fillStyle = pg; lg.beginPath(); lg.arc(c0, c0, pr, 0, TAU); lg.fill();
    lg.save(); lg.beginPath(); lg.arc(c0, c0, pr, 0, TAU); lg.clip();
    for (let i = 0; i < 26; i++) { const a = -1.75 + r() * 1.9, dd = pr * (0.2 + r() * 0.75), cr = pr * (0.015 + r() * 0.05); lg.fillStyle = 'rgba(0,0,0,0.2)'; lg.beginPath(); lg.arc(c0 + Math.cos(a) * dd, c0 + Math.sin(a) * dd, cr, 0, TAU); lg.fill(); lg.strokeStyle = 'rgba(160,175,210,0.12)'; lg.lineWidth = 1; lg.beginPath(); lg.arc(c0 + Math.cos(a) * dd - cr * 0.15, c0 + Math.sin(a) * dd - cr * 0.15, cr, 3.6, 5.6); lg.stroke(); }
    lg.restore();
    lg.strokeStyle = 'rgba(111,211,255,0.38)'; lg.lineWidth = Math.max(2, pr * 0.012); lg.beginPath(); lg.arc(c0, c0, pr, -1.9, -0.05); lg.stroke();
    bg.luna = L; bg.lunaPos = [-pr * 0.25 - c0, H + pr * 0.05 - c0];
    // glint sprite for the nearest stars
    const gs = document.createElement('canvas'); gs.width = gs.height = 32; const gg = gs.getContext('2d');
    const gd = gg.createRadialGradient(16, 16, 0, 16, 16, 7); gd.addColorStop(0, 'rgba(255,255,255,1)'); gd.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = gd; gg.fillRect(0, 0, 32, 32);
    for (const [x0, y0, x1, y1] of [[2, 16, 30, 16], [16, 2, 16, 30]]) { const lgd = gg.createLinearGradient(x0, y0, x1, y1); lgd.addColorStop(0, 'rgba(200,225,255,0)'); lgd.addColorStop(0.5, 'rgba(230,240,255,0.9)'); lgd.addColorStop(1, 'rgba(200,225,255,0)'); gg.strokeStyle = lgd; gg.lineWidth = 1.2; gg.beginPath(); gg.moveTo(x0, y0); gg.lineTo(x1, y1); gg.stroke(); }
    bg.glint = gs;
    // stars in a view-aligned box; z is depth (smaller = nearer)
    bg.stars = Array.from({ length: 260 }, (_, i) => { const s = {}; spawn(bg, s, W, H, ZN + bg.r() * (ZF - ZN), 0, 0); s.m = 0.5 + Math.pow(bg.r(), 2.5) * 1.6; s.ph = bg.r() * TAU; s.tw = 0.8 + bg.r() * 2.2; s.c = i % 9 === 0 ? '#bcd7ff' : i % 13 === 0 ? '#ffe2b8' : '#ffffff'; return s; });
  }
  function spawn(bg, s, W, H, z, cx, cy) {
    const F = Math.min(W, H) * 0.9;
    s.z = z; s.x = cx + (bg.r() * 2 - 1) * (W / 2 / F) * z * 1.15; s.y = cy + (bg.r() * 2 - 1) * (H / 2 / F) * z * 1.15; s.born = z;
  }
  function drawBackground(ctx, bg, W, H, time, dt, lite) {
    if (bg.key !== W + 'x' + H) buildBackground(bg, W, H);
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const F = Math.min(W, H) * 0.9;
    const cx = 0.22 * Math.sin(time * 0.021), cy = 0.12 * Math.sin(time * 0.015 + 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const dx = -W * 0.05 - cx * F / 24, dy = -H * 0.05 - cy * F / 24;
    ctx.drawImage(bg.deep, dx, dy);
    // galaxy turns slowly (one turn ≈ 2 minutes), tilted like a disc seen at an angle
    ctx.save(); ctx.translate(dx + bg.galaxyAt[0], dy + bg.galaxyAt[1]); ctx.rotate(-0.5); ctx.scale(1, 0.42); ctx.rotate(-time * 0.048);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(bg.galaxy, -bg.galaxy.width / 2, -bg.galaxy.height / 2); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    const k = Math.min(W, H) / 390; // ~device px per css px
    ctx.globalCompositeOperation = 'lighter';
    const step = lite ? 2 : 1;
    for (let i = 0; i < bg.stars.length; i += step) {
      const s = bg.stars[i];
      s.z -= dt * VZ;
      let px = W / 2 + (s.x - cx) / s.z * F, py = H / 2 + (s.y - cy) / s.z * F;
      if (s.z < ZN || px < -20 || px > W + 20 || py < -20 || py > H + 20) { spawn(bg, s, W, H, ZF * (0.85 + 0.15 * bg.r()), cx, cy); continue; }
      const fade = Math.min(1, (s.born - s.z) / 0.6 + (s.born < ZF * 0.8 ? 1 : 0));
      const tw = 0.75 + 0.25 * Math.sin(time * s.tw + s.ph);
      const a = Math.min(1, 0.22 + 0.8 / s.z) * fade * tw;
      const size = Math.min(3.2, s.m * Math.pow(1.6 / s.z, 0.75)) * k;
      if (!lite && size > 1.9 * k) { ctx.globalAlpha = a; const gsz = size * 4.5; ctx.drawImage(bg.glint, px - gsz / 2, py - gsz / 2, gsz, gsz); }
      else { ctx.globalAlpha = a; ctx.fillStyle = s.c; ctx.fillRect(px - size / 2, py - size / 2, size, size); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(bg.luna, bg.lunaPos[0] - cx * F / 4, bg.lunaPos[1] - cy * F / 4);
  }

  // ======================================================================
  // Stations. Drawn in world units around (0,0); R = collision radius.
  // tier 0 = starting hull, 1 = module attached, 2 = endgame (prologue).
  // ======================================================================
  const STATION_STYLES = [
    { id: 'hex', name: 'A · 헥사 코어', rec: true, desc: '육각 코어에 타일을 붙여 커지는 모듈형입니다. 모듈·연구가 타일 하나로 보여 성장이 가장 잘 읽히고, AI로 타일 아트를 늘리기도 쉽습니다.', pro: '성장 단계가 한눈에 보임 · 타일 단위로 아트 확장', con: '정지한 느낌 → 코어 회전·패널 점멸로 보완' },
    { id: 'ring', name: 'B · 링 스테이션', desc: '회전하는 거주 링과 스포크로 된 고전 우주정거장입니다. 처음 보는 사람도 바로 우주정거장으로 읽습니다.', pro: '장르가 즉시 읽힘 · 회전 링이 살아 있는 느낌', con: '링을 겹치는 방식이라 단계별 차이가 작음' },
    { id: 'orbital', name: 'C · 크리스탈 오비탈', desc: '결정 코어 주위를 위성 포드가 입체 궤도로 돕니다. 앞뒤로 도는 위성이 원근감을 가장 크게 줍니다.', pro: '입체감 최고 · 보석 같은 수집 욕구', con: '위성이 적과 섞여 보일 수 있음 · 정거장보다 무기처럼 보임' }
  ];
  function hexPath(ctx, x, y, r, rot) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
  function panel(ctx, x0, x1, h, R, t, seed) {
    const sx = Math.sign(x1 - x0) || 1, w = Math.abs(x1 - x0), xa = Math.min(x0, x1);
    ctx.fillStyle = '#0f2148'; ctx.fillRect(xa, -h / 2, w, h);
    ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = R * 0.035;
    ctx.beginPath(); for (let x = R * 0.2; x < w; x += R * 0.2) { ctx.moveTo(xa + x, -h / 2); ctx.lineTo(xa + x, h / 2); } ctx.moveTo(xa, 0); ctx.lineTo(xa + w, 0); ctx.stroke();
    ctx.strokeStyle = '#7fb4ff'; ctx.lineWidth = R * 0.05; ctx.strokeRect(xa, -h / 2, w, h);
    // sweep of reflected light
    const p = ((t * 0.18 + seed) % 1.6) - 0.3; if (p > 0 && p < 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 * Math.sin(p * Math.PI); ctx.fillStyle = '#bfe0ff'; ctx.fillRect(sx > 0 ? x0 + w * p - R * 0.08 : x0 - w * p - R * 0.08, -h / 2, R * 0.16, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  function drawStation(ctx, style, t, o) {
    const R = o.R, tier = o.tier || 0, mod = o.mod || '#6fd3ff', grow = o.grow == null ? 1 : o.grow;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (style === 'ring') ringStation(ctx, t, R, tier, mod, grow);
    else if (style === 'orbital') orbitalStation(ctx, t, R, tier, mod, grow);
    else hexStation(ctx, t, R, o);
    // turret on the core, pointing at the current target (kicks back on each shot)
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const rk = (o.recoil || 0) * R * 0.18;
    ctx.save(); ctx.rotate(o.aim || 0);
    ctx.fillStyle = '#2a3c58'; ctx.fillRect(R * 0.1, -R * 0.13, R * 0.42, R * 0.26);
    ctx.fillStyle = '#dfe8f5'; ctx.fillRect(R * 0.2 - rk, -R * 0.065, R * 0.78, R * 0.13);
    ctx.fillStyle = '#9fe6ff'; ctx.fillRect(R * 0.9 - rk, -R * 0.05, R * 0.12, R * 0.1);
    if (o.recoil > 0.4) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, R * 1.1, 0, R * 0.45 * o.recoil, '#bfefff', o.recoil); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    ctx.restore();
    if (style === 'hex') stationLife(ctx, t, R, o);
    ctx.fillStyle = '#d6f3ff'; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, R * 0.6, '#9fe6ff', 0.85);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (o._front) { o._front(); o._front = null; }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  // hex core: ring-1 slots carry function tiles; empty open slots show a docking frame; orbitals circle outside
  const TILE_COL = { hangar: '#ffd166', battery: '#6fd3ff', shield: '#8fa2ff', collector: '#ffe9a8', missile: '#ff8f7a', repair: '#8dffcf', amplifier: '#d9c2ff' };
  const SLOT_ORDER = [1, 3, 5, 0, 2, 4];
  const ORBIT = { a: 26, b: 14, tilt: -0.35, w: 1.2 }; // world units at R = 9.1 (must match engine ORBIT)
  function orbitPos(t, i, n, sc) {
    const th = t * ORBIT.w + i * TAU / n, lx = Math.cos(th) * ORBIT.a * sc, ly = Math.sin(th) * ORBIT.b * sc;
    return { x: lx * Math.cos(ORBIT.tilt) - ly * Math.sin(ORBIT.tilt), y: lx * Math.sin(ORBIT.tilt) + ly * Math.cos(ORBIT.tilt), depth: Math.sin(th), th };
  }
  function tierTiles(tier) {
    const t = [null, null, null, null, null, null];
    if (tier >= 1) { t[1] = { type: 'hangar' }; t[3] = { type: 'battery' }; t[5] = { type: 'hangar' }; }
    if (tier >= 2) { t[0] = { type: 'shield' }; t[2] = { type: 'battery' }; t[4] = { type: 'collector' }; }
    return t;
  }
  // tile pictograms (2026-11-04): one source for the reward cards (SVG) and the station tiles (same picture as an image),
  // so the card the player picked looks like the tile that lands on the station
  const HEXB = '<path d="M24 3 42 13.5v21L24 45 6 34.5v-21z" fill="#0b1426" stroke="currentColor" stroke-width="2"/><path d="M24 7 38.5 15.5v17L24 41 9.5 32.5v-17z" fill="currentColor" opacity=".12"/>';
  const TICON = {
    battery: '<circle cx="24" cy="29" r="7" fill="#1b2a40" stroke="currentColor" stroke-width="2"/><path d="M24 29 34 17" stroke="#e6eef8" stroke-width="4" stroke-linecap="round"/><path d="M33 18l3.5-4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="12" r="2.2" fill="#fff"/><path d="M36 9.5l1-2.5M40.5 13.5l2.5-1M40 9.8l2-2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><path d="M15 36h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    hangar: '<path d="M12 36V25a12 12 0 0 1 24 0v11z" fill="#1b2a40" stroke="currentColor" stroke-width="2"/><path d="M17 36v-9a7 7 0 0 1 14 0v9" fill="#04070e"/><path d="M22 18 30 13l-2.6 6.6z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M30 22 38 17l-2.6 6.6z" fill="currentColor"/><path d="M14 18.5c2-1 4-1.4 6-1" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.6" fill="none"/>',
    missile: '<g transform="rotate(-35 24 24)"><path d="M18 34V18l3-5 3 5v16z" fill="#e6eef8" stroke="currentColor" stroke-width="1.4"/><path d="M18 30l-3 4h3zM24 30l3 4h-3z" fill="currentColor"/><path d="M19.5 34.5 21 41l1.5-6.5" fill="#ffb347"/></g><circle cx="36" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="36" cy="13" r="2.4" fill="currentColor"/>',
    shield: '<path d="M10 30a14 14 0 0 1 28 0" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.6"/><path d="M14 30a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/><path d="M24 26.5 27.5 28.5v4L24 34.5l-3.5-2v-4z" fill="#123152" stroke="#9fe6ff" stroke-width="1.3"/><path d="M7 18l4 3M41 18l-4 3M24 9v4" stroke="#ff6f7d" stroke-width="1.6" stroke-linecap="round"/>',
    repair: '<path d="M30.5 13.5a6 6 0 0 0-7.6 7.6L13 31a2.6 2.6 0 0 0 3.7 3.7l9.9-9.9a6 6 0 0 0 7.6-7.6l-3.6 3.6-3.4-.6-.6-3.4z" fill="#e6eef8" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M33 29h8M37 25v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    collector: '<path d="M14 14v10a10 10 0 0 0 20 0V14h-6v10a4 4 0 0 1-8 0V14z" fill="currentColor" stroke="#fff" stroke-width="1" stroke-opacity=".4"/><path d="M14 14h6v4h-6zM28 14h6v4h-6z" fill="#e6eef8"/><path d="M19 38l2-3 2 3zM27 40l1.8-3.4 2.2 3.2zM24 44l1.4-2.6 1.6 2.6z" fill="#ffd166"/><path d="M22 33.5v-2M26 35v-2" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 1.2"/>',
    amplifier: '<path d="M24 19.5 28 21.8v4.5L24 28.6l-4-2.3v-4.5z" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M24 17V9M20 12l4-4 4 4"/><path d="M31 27.5l7 4M33.8 35.4l4.2-3.9-1.3-5.6"/><path d="M17 27.5l-7 4M14.2 35.4 10 31.5l1.3-5.6"/></g>'
  };
  const ticonImg = {};
  function tileIcon(type, col) {
    const key = type + col; if (key in ticonImg) return ticonImg[key];
    if (typeof Image === 'undefined' || !TICON[type]) return (ticonImg[key] = null);
    const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 50" width="96" height="100" color="${col}">${TICON[type]}</svg>`);
    return (ticonImg[key] = im);
  }
  for (const k in TILE_COL) if (k !== 'battery') tileIcon(k, TILE_COL[k]); // decode early so the first station frame already has the pictures
  function tileArt(ctx, x, y, r, a, tl, t, k, aim, R) {
    const col = tl.proto ? '#ffd166' : (TILE_COL[tl.type] || '#6fd3ff');
    hexPath(ctx, x, y, r, 0); ctx.fillStyle = '#0e1b2f'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = R * 0.07; ctx.stroke();
    hexPath(ctx, x, y, r * 0.66, 0); ctx.fillStyle = '#14294a'; ctx.fill();
    { const gr = ctx.createLinearGradient(x, y - r, x, y + r); gr.addColorStop(0, 'rgba(190,225,255,0.22)'); gr.addColorStop(0.45, 'rgba(190,225,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); hexPath(ctx, x, y, r * 0.96, 0); ctx.fillStyle = gr; ctx.fill(); }
    ctx.save(); ctx.translate(x, y);
    const icon = tl.type !== 'battery' ? tileIcon(tl.type, col) : null;
    if (icon && icon.complete && icon.naturalWidth) {
      // same pictogram as the card, kept upright so it reads at a glance; a small pulse shows the tile is working
      ctx.drawImage(icon, -r * 0.87, -r * 0.92, r * 1.74, r * 1.81);
      ctx.globalCompositeOperation = 'lighter';
      const p = Math.max(0, Math.sin(t * (tl.type === 'amplifier' ? 2 : 2.6) + k));
      if (tl.type === 'hangar') glow(ctx, 0, r * 0.18, r * 0.42, col, 0.2 + 0.5 * (Math.sin(t * 5 + k) > 0 ? 1 : 0));
      else if (tl.type === 'shield') glow(ctx, 0, r * 0.05, r * 0.7, col, 0.15 + 0.25 * p);
      else if (tl.type === 'amplifier') { ctx.globalAlpha = 0.6 * (1 - ((t * 0.8 + k * 0.13) % 1)); ctx.strokeStyle = col; ctx.lineWidth = R * 0.04; ctx.beginPath(); ctx.arc(0, 0, r * (0.25 + 0.6 * ((t * 0.8 + k * 0.13) % 1)), 0, TAU); ctx.stroke(); }
      else glow(ctx, 0, 0, r * 0.55, col, 0.12 + 0.3 * p);
    } else if (tl.type === 'hangar') {
      ctx.rotate(a); ctx.fillStyle = '#04070e'; ctx.fillRect(-r * 0.5, -r * 0.24, r * 1.0, r * 0.48);
      ctx.strokeStyle = col; ctx.lineWidth = R * 0.04; ctx.strokeRect(-r * 0.5, -r * 0.24, r * 1.0, r * 0.48);
      ctx.globalCompositeOperation = 'lighter'; const on = Math.sin(t * 5 + k) > 0;
      glow(ctx, r * 0.42, -r * 0.16, r * 0.22, col, on ? 1 : 0.3); glow(ctx, r * 0.42, r * 0.16, r * 0.22, col, on ? 0.3 : 1);
    } else if (tl.type === 'battery') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.fillStyle = '#1b2a40'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = R * 0.05; ctx.stroke();
      ctx.rotate(aim == null ? a : aim);
      if ((tl.lv || 1) >= 3) for (const sd of [-1, 1]) { ctx.fillStyle = '#ffe9a8'; ctx.fillRect(0, sd * r * 0.16 - r * 0.075, r * 1.0, r * 0.15); ctx.fillStyle = '#ffd166'; ctx.fillRect(r * 0.9, sd * r * 0.16 - r * 0.065, r * 0.14, r * 0.13); }
      else { ctx.fillStyle = '#dfe8f5'; ctx.fillRect(0, -r * 0.1, r * 0.95, r * 0.2); ctx.fillStyle = col; ctx.fillRect(r * 0.85, -r * 0.08, r * 0.14, r * 0.16); }
    } else if (tl.type === 'shield') {
      ctx.rotate(a); ctx.strokeStyle = col; ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.62, -1.1, 1.1); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + k); ctx.lineWidth = R * 0.18; ctx.stroke();
    } else if (tl.type === 'missile') {
      ctx.rotate(a);
      for (const sd of [-1, 1]) { ctx.fillStyle = '#1f2a3d'; ctx.fillRect(-r * 0.35, sd * r * 0.28 - r * 0.13, r * 0.8, r * 0.26); ctx.strokeStyle = col; ctx.lineWidth = R * 0.035; ctx.strokeRect(-r * 0.35, sd * r * 0.28 - r * 0.13, r * 0.8, r * 0.26); ctx.fillStyle = '#ff5d5d'; ctx.fillRect(r * 0.38, sd * r * 0.28 - r * 0.09, r * 0.16, r * 0.18); }
    } else if (tl.type === 'repair') {
      ctx.fillStyle = col; ctx.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 0.9); ctx.fillRect(-r * 0.45, -r * 0.12, r * 0.9, r * 0.24);
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, r * 0.6, col, 0.25 + 0.25 * Math.max(0, Math.sin(t * 2.5 + k)));
    } else if (tl.type === 'amplifier') {
      ctx.rotate(t * 0.6 + k); ctx.strokeStyle = col; ctx.lineWidth = R * 0.05;
      for (let i = 0; i < 3; i++) { const aa = i * TAU / 3; ctx.beginPath(); ctx.moveTo(Math.cos(aa) * r * 0.15, Math.sin(aa) * r * 0.15); ctx.lineTo(Math.cos(aa) * r * 0.6, Math.sin(aa) * r * 0.6); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, r * 0.45, col, 0.7);
    } else if (tl.type === 'collector') {
      ctx.rotate(a); ctx.strokeStyle = col; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, r * 0.75, 0, r * 0.3, col, 0.5 + 0.5 * Math.max(0, Math.sin(t * 3 + k)));
    }
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if ((tl.lv || 1) >= 3 && !tl.ghost) { // awakened tile: gold double rim + a spark running round it
      hexPath(ctx, x, y, r * 1.08, 0); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = R * 0.05; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3 + k); hexPath(ctx, x, y, r * 1.08, 0); ctx.lineWidth = R * 0.14; ctx.stroke();
      const ph = (t * 0.5 + k * 0.17) % 1, ang = ph * TAU; ctx.globalAlpha = 1; glow(ctx, x + Math.cos(ang) * r * 1.05, y + Math.sin(ang) * r * 1.05, r * 0.32, '#fff3c4', 0.9);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // level badge (2026-11-05): a numbered chip on the tile's corner — grey 1, blue 2, gold 3 (awakened) — instead of dots
    if (tl.lv && tl.lv <= 3 && !tl.noBadge) { // run tiles only (the prologue station uses Lv10 and shows no badge)
      const lv = Math.min(3, tl.lv), bx = x + r * 0.62, by = y - r * 0.6, br = Math.max(r * 0.36, R * 0.16);
      const fill = lv >= 3 ? '#ffd166' : lv === 2 ? '#6fd3ff' : '#3a4a63', ink = lv >= 2 ? '#0a1222' : '#e6eef8';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = Math.max(1, br * 0.22); ctx.strokeStyle = '#0a1222'; ctx.stroke();
      ctx.fillStyle = ink; ctx.font = `800 ${Math.round(br * 1.35)}px system-ui, -apple-system, 'Noto Sans KR', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(lv), bx, by + br * 0.06);
    }
  }
  function hexStation(ctx, t, R, o) {
    const tiles = o.tiles || tierTiles(o.tier || 0), grow = o.grow == null ? 1 : o.grow;
    const openK = o.openK || SLOT_ORDER.filter(k => tiles[k]);
    const nT = Math.min(6, tiles.filter(Boolean).length), cr = R * 0.52, d = cr * Math.sqrt(3) * 1.06, tr = cr * 0.9;
    const nO = o.orbitals == null ? ((o.tier || 0) >= 2 ? 3 : 0) : o.orbitals, ot = o.ot == null ? t : o.ot, sc = R / 9.1 * (o.osc || 1);
    const sat = (front) => {
      if (!nO) return;
      ctx.save(); ctx.rotate(ORBIT.tilt); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = R * 0.03; ctx.globalAlpha = front ? 0.4 : 0.14;
      ctx.beginPath(); ctx.ellipse(0, 0, ORBIT.a * sc, ORBIT.b * sc, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      for (let i = 0; i < nO; i++) {
        const p = orbitPos(ot, i, nO, sc); if ((p.depth >= 0) !== front) continue;
        const z = 0.8 + 0.25 * p.depth; ctx.globalAlpha = front ? 1 : 0.55;
        hexPath(ctx, p.x, p.y, R * 0.3 * z, p.th); ctx.fillStyle = '#13253e'; ctx.fill(); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = R * 0.06; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, p.x, p.y, R * 0.42 * z, '#ffd166', front ? 0.85 : 0.35); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    };
    sat(false);
    // solar wings grow with the hull
    const wl = R * (0.85 + 0.17 * nT + (o.outer ? 0.6 : 0)), wh = R * (0.36 + 0.03 * nT);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#5c6d88'; ctx.lineWidth = R * 0.09; ctx.beginPath(); ctx.moveTo(s * cr * 0.8, 0); ctx.lineTo(s * (d + R * 0.25), 0); ctx.stroke();
      panel(ctx, s * (d + R * 0.25), s * (d + R * 0.25 + wl), wh, R, t, s > 0 ? 0 : 0.7);
    }
    const pos = (k, dist) => { const a = TAU / 12 + k * TAU / 6; return [Math.cos(a) * dist, Math.sin(a) * dist, a]; };
    // outer ring (v3 runs): tiles[6..11] sit straight out from inner slot k
    if (tiles.length > 6) for (let k = 0; k < 6; k++) {
      const tl = tiles[6 + k], [x, y, a] = pos(k, d * 2);
      if (!tl) { if (openK.includes(6 + k)) { hexPath(ctx, x, y, tr, 0); ctx.setLineDash([R * 0.18, R * 0.14]); ctx.strokeStyle = 'rgba(111,211,255,0.4)'; ctx.lineWidth = R * 0.05; ctx.stroke(); ctx.setLineDash([]); } continue; }
      ctx.strokeStyle = '#3a4d6a'; ctx.lineWidth = R * 0.12; ctx.beginPath(); ctx.moveTo(x * 0.5, y * 0.5); ctx.lineTo(x, y); ctx.stroke();
      tileArt(ctx, x, y, tr, a, tl, t, k + 6, o.aims && o.aims[6 + k], R);
    }
    if (o.outer) { const OT = ['battery', 'hangar', 'shield', 'battery', 'hangar', 'collector']; for (let k = 0; k < 6; k++) { const [x, y, a] = pos(k, d * 2); ctx.strokeStyle = '#3a4d6a'; ctx.lineWidth = R * 0.1; ctx.beginPath(); ctx.moveTo(x * 0.5, y * 0.5); ctx.lineTo(x, y); ctx.stroke(); tileArt(ctx, x, y, tr * 0.82, a, { type: OT[k] }, t, k + 6, null, R); } }
    for (let k = 0; k < 6; k++) {
      const tl = tiles[k], [x, y, a] = pos(k, d);
      if (!tl) {
        if (openK.includes(k)) { hexPath(ctx, x, y, tr, 0); ctx.setLineDash([R * 0.18, R * 0.14]); ctx.strokeStyle = 'rgba(111,211,255,0.55)'; ctx.lineWidth = R * 0.05; ctx.stroke(); ctx.setLineDash([]); }
        continue;
      }
      const g = tl.isNew ? grow : 1; if (g <= 0.01) continue;
      const [gx, gy] = pos(k, d * (0.55 + 0.45 * g));
      ctx.strokeStyle = '#3a4d6a'; ctx.lineWidth = R * 0.12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * cr * 0.8, Math.sin(a) * cr * 0.8); ctx.lineTo(gx, gy); ctx.stroke();
      tileArt(ctx, gx, gy, tr * g, a, tl, t, k, o.aims && o.aims[k], R);
    }
    hexPath(ctx, 0, 0, cr, 0); ctx.fillStyle = '#123152'; ctx.fill(); ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = R * 0.09; ctx.stroke();
    hexPath(ctx, 0, 0, cr * 0.66, t * 0.8); ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = R * 0.045; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
    o._front = () => sat(true);
  }
  // living details on the hex station: blinking nav lights on the wing tips, smoke and sparks when the hull is low,
  // red emergency strobes below 25 %, and a white flash over the whole hull on a hit
  function stationLife(ctx, t, R, o) {
    const tiles = o.tiles || [], nT = Math.min(6, tiles.filter(Boolean).length), cr = R * 0.52, d = cr * Math.sqrt(3) * 1.06;
    const wx = d + R * 0.25 + R * (0.85 + 0.17 * nT + (o.outer ? 0.6 : 0));
    ctx.globalCompositeOperation = 'lighter';
    const blink = (t * 1.25) % 1 < 0.14;
    glow(ctx, -wx, 0, R * 0.35, '#ff4d5e', blink ? 1 : 0.18); glow(ctx, wx, 0, R * 0.35, '#5fe39a', blink ? 1 : 0.18);
    glow(ctx, 0, -cr * 1.02, R * 0.22, '#ffffff', (t * 0.9) % 1 < 0.08 ? 1 : 0.1);
    const dmg = o.dmg || 0;
    if (dmg > 0.5) { // smoke rises from damaged tiles, sparks spit now and then
      ctx.globalCompositeOperation = 'source-over';
      const pts = [[0, 0]]; for (let k = 0; k < 6; k++) if (tiles[k]) { const a = TAU / 12 + k * TAU / 6; pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
      const n = Math.min(pts.length, 1 + Math.floor((dmg - 0.5) * 8));
      for (let i = 0; i < n; i++) { const [px, py] = pts[(i * 3 + 1) % pts.length];
        for (let j = 0; j < 4; j++) { const u = ((t * 0.55 + j / 4 + i * 0.37) % 1); ctx.globalAlpha = 0.32 * (1 - u); ctx.fillStyle = '#2b3140';
          ctx.beginPath(); ctx.arc(px + Math.sin(u * 5 + i) * R * 0.25, py - u * R * 1.6, R * (0.18 + u * 0.4), 0, TAU); ctx.fill(); }
        if (Math.sin(t * 7.3 + i * 2.1) > 0.92) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, px, py, R * 0.4, '#ffb347', 0.9); ctx.globalCompositeOperation = 'source-over'; } }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    }
    if (dmg > 0.75 && (t * 2) % 1 < 0.5) for (let k = 0; k < 6; k++) { const a = k * TAU / 6; glow(ctx, Math.cos(a) * cr * 0.9, Math.sin(a) * cr * 0.9, R * 0.3, '#ff3b4e', 0.9); }
    const hit = o.hit || 0;
    if (hit > 0) { glow(ctx, 0, 0, R * 1.6, '#ffffff', 0.55 * hit); for (let k = 0; k < 6; k++) if (tiles[k]) { const a = TAU / 12 + k * TAU / 6; glow(ctx, Math.cos(a) * d, Math.sin(a) * d, R * 0.75, '#ffd6d6', 0.6 * hit); } }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function ringStation(ctx, t, R, tier, mod, grow) {
    // antenna mast with a beacon
    ctx.strokeStyle = '#5c6d88'; ctx.lineWidth = R * 0.07; ctx.beginPath(); ctx.moveTo(0, -R * 0.4); ctx.lineTo(0, -R * 1.95); ctx.moveTo(-R * 0.25, -R * 1.65); ctx.lineTo(R * 0.25, -R * 1.65); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -R * 1.95, R * 0.28, '#ff4d5e', Math.sin(t * 3) > 0.4 ? 1 : 0.25); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (tier >= 2) for (const s of [-1, 1]) panel(ctx, s * R * 2.55, s * R * 3.5, R * 0.5, R, t, s > 0 ? 0 : 0.7);
    // outer weapon rings
    const outer = tier >= 2 ? [[1.75, -0.5, mod, 4], [2.4, 0.35, '#ffd166', 6]] : tier >= 1 ? [[1.75, -0.5, mod, 4]] : [];
    for (const [k, w, c, n] of outer) {
      const rr = R * k * (0.75 + 0.25 * grow);
      ctx.save(); ctx.rotate(t * w);
      ctx.strokeStyle = '#1b2b44'; ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = R * 0.05; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(0, 0, rr, i * TAU / n + 0.2, i * TAU / n + TAU / n - 0.2); ctx.stroke(); }
      for (let i = 0; i < n; i++) { const a = i * TAU / n; ctx.save(); ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr); ctx.rotate(a); ctx.fillStyle = '#0e1b2f'; ctx.fillRect(-R * 0.17, -R * 0.17, R * 0.34, R * 0.34); ctx.strokeStyle = c; ctx.lineWidth = R * 0.05; ctx.strokeRect(-R * 0.17, -R * 0.17, R * 0.34, R * 0.34); ctx.fillStyle = '#c9d6ea'; ctx.fillRect(R * 0.15, -R * 0.04, R * 0.22, R * 0.08); ctx.restore(); }
      ctx.restore();
    }
    // habitat ring + spokes, rotating
    const rot = t * 0.35, hr = R * 1.12;
    ctx.save(); ctx.rotate(rot);
    ctx.strokeStyle = '#2b3d58'; ctx.lineWidth = R * 0.13; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3; ctx.moveTo(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4); ctx.lineTo(Math.cos(a) * hr, Math.sin(a) * hr); } ctx.stroke();
    ctx.strokeStyle = '#15253c'; ctx.lineWidth = R * 0.34; ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.arc(0, 0, hr + R * 0.17, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#3d6b8f'; ctx.lineWidth = R * 0.04; ctx.beginPath(); ctx.arc(0, 0, hr - R * 0.17, 0, TAU); ctx.stroke();
    for (let i = 0; i < 18; i++) { const a = i * TAU / 18; ctx.fillStyle = i % 3 ? '#ffe9a8' : '#bfefff'; ctx.fillRect(Math.cos(a) * hr - R * 0.05, Math.sin(a) * hr - R * 0.05, R * 0.1, R * 0.1); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.48, 0, TAU); ctx.fillStyle = '#123152'; ctx.fill(); ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = R * 0.09; ctx.stroke();
  }
  function orbitalStation(ctx, t, R, tier, mod, grow) {
    const orbits = [{ a: 1.6, b: 0.5, tilt: -0.35, w: 0.9, n: 2, c: '#6fd3ff', g: 1 }];
    if (tier >= 1) orbits.push({ a: 2.05, b: 0.7, tilt: 0.65, w: -0.7, n: 2, c: mod, g: grow });
    if (tier >= 2) orbits.push({ a: 2.6, b: 0.9, tilt: 1.45, w: 0.5, n: 3, c: '#ffd166', g: 1 });
    const sat = (o, front) => {
      for (let i = 0; i < o.n; i++) {
        const th = t * o.w + i * TAU / o.n, depth = Math.sin(th); if ((depth >= 0) !== front) continue;
        const lx = Math.cos(th) * o.a * R * o.g, ly = Math.sin(th) * o.b * R * o.g;
        const x = lx * Math.cos(o.tilt) - ly * Math.sin(o.tilt), y = lx * Math.sin(o.tilt) + ly * Math.cos(o.tilt);
        const sc = 0.8 + 0.25 * depth; ctx.globalAlpha = front ? 1 : 0.55;
        hexPath(ctx, x, y, R * 0.24 * sc, th); ctx.fillStyle = '#13253e'; ctx.fill(); ctx.strokeStyle = o.c; ctx.lineWidth = R * 0.06; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, R * 0.3 * sc, o.c, front ? 0.8 : 0.35); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    };
    const path = (o, front) => {
      ctx.save(); ctx.rotate(o.tilt); ctx.strokeStyle = o.c; ctx.lineWidth = R * 0.03; ctx.globalAlpha = front ? 0.45 : 0.15;
      ctx.beginPath(); ctx.ellipse(0, 0, o.a * R * o.g, o.b * R * o.g, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    };
    for (const o of orbits) { path(o, false); sat(o, false); }
    // crystal core, rocking as if turning in 3D
    const wx = R * 0.62 * (0.5 + 0.5 * Math.abs(Math.cos(t * 0.6))), hy = R * 1.05;
    ctx.beginPath(); ctx.moveTo(0, -hy); ctx.lineTo(wx, 0); ctx.lineTo(0, hy); ctx.lineTo(-wx, 0); ctx.closePath(); ctx.fillStyle = '#1a4a72'; ctx.fill();
    const lit = Math.cos(t * 0.6) > 0 ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(0, -hy); ctx.lineTo(lit * wx, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#3b8fc4'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -hy); ctx.lineTo(wx, 0); ctx.lineTo(0, hy); ctx.lineTo(-wx, 0); ctx.closePath(); ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = R * 0.07; ctx.stroke();
    ctx.strokeStyle = 'rgba(191,243,255,0.5)'; ctx.lineWidth = R * 0.03; ctx.beginPath(); ctx.moveTo(0, -hy); ctx.lineTo(0, hy); ctx.moveTo(-wx, 0); ctx.lineTo(wx, 0); ctx.stroke();
    for (const o of orbits) { path(o, true); sat(o, true); }
  }

  // ======================================================================
  // Enemies. Each family draws every type facing +x in unit space ([-1,1]),
  // baked into pre-rotated sprites (ROT buckets × 2 animation frames).
  // ======================================================================
  const ENEMY_STYLES = [
    { id: 'bio', name: '1 · 생체 스웜', rec: true, desc: '말벌·딱정벌레·해파리·여왕 둥지. 기계 정거장과 대비되는 생물 실루엣이라 아군·적 구분이 즉시 되고, 세계관의 \'스웜\'과도 맞습니다.', pro: '아군과 확실히 구분 · 날개짓으로 살아 있는 느낌', con: '징그러움 수위 조절 필요 → 네온 윤곽으로 순화' },
    { id: 'mech', name: '2 · 기계 함대', desc: '전투기·충각선·포함·모함. 정통 SF 함대전 분위기이고 진영 확장(해적·제국)이 쉽습니다.', pro: '정통 SF · 함선 수집·스킨 확장이 쉬움', con: '정거장과 재질이 같아 아군과 덜 구분됨' },
    { id: 'geo', name: '3 · 네온 도형 (현재)', desc: '삼각·사각·육각 네온 도형. The Tower처럼 추상적이고 가장 가볍습니다.', pro: '가장 가볍고 읽기 쉬움', con: 'The Tower와 너무 비슷함 · 세계관이 안 보임' }
  ];
  const ROT = 24, ESPR = {};
  const SPR_S = { boss: 168, meteor: 88, brood: 100, carapace: 92, mini: 52, egg: 44 };
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function polyU(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
  function body(g, col, px, lw, dark) { g.fillStyle = dark || '#0b111d'; g.fill(); g.globalAlpha = 0.32; g.fillStyle = col; g.fill(); g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = (lw || 2.4) * px; g.stroke(); }
  function dot(g, x, y, r, c) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = c; g.fill(); }
  function softGlow(g, x, y, r, c, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, c + '00'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
  function meteorShape(g, col, px) {
    const rr = [1, 0.82, 0.95, 0.78, 0.9, 1, 0.8, 0.92, 0.85, 0.97];
    polyU(g, rr.map((k, i) => [Math.cos(i / rr.length * TAU) * k * 0.82, Math.sin(i / rr.length * TAU) * k * 0.82]));
    g.fillStyle = '#2c3343'; g.fill(); g.strokeStyle = col; g.lineWidth = 2.2 * px; g.stroke();
    for (const [x, y, r] of [[0.22, -0.22, 0.17], [-0.3, 0.12, 0.13], [0.12, 0.38, 0.09], [-0.12, -0.42, 0.07]]) { ell(g, x, y, r, r); g.fillStyle = '#1b2130'; g.fill(); g.strokeStyle = '#5d667c'; g.lineWidth = 1.2 * px; g.stroke(); }
    g.strokeStyle = '#d3d9e6'; g.globalAlpha = 0.55; g.lineWidth = 1.6 * px; g.beginPath(); g.arc(0, 0, 0.7, 3.5, 4.6); g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = '#ff9f4d'; g.globalAlpha = 0.6; g.lineWidth = 1.2 * px; g.beginPath(); g.moveTo(-0.05, 0.05); g.lineTo(0.25, 0.15); g.lineTo(0.38, 0.05); g.stroke(); g.globalAlpha = 1;
  }
  const DRAW = {
    bio: {
      drone(g, col, px, f) {
        for (const s of [-1, 1]) {
          ell(g, -0.12, s * 0.4, 0.46, 0.17, s * (f ? 0.32 : 0.78)); g.fillStyle = col + '38'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.4 * px; g.stroke();
          ell(g, -0.34, s * 0.3, 0.3, 0.11, s * (f ? 0.6 : 1.05)); g.fillStyle = col + '28'; g.fill(); g.stroke();
        }
        ell(g, -0.5, 0, 0.42, 0.24); body(g, col, px);
        g.strokeStyle = col; g.lineWidth = 1.8 * px; g.beginPath(); g.moveTo(-0.38, -0.22); g.lineTo(-0.38, 0.22); g.moveTo(-0.62, -0.19); g.lineTo(-0.62, 0.19); g.stroke();
        g.beginPath(); g.moveTo(-0.9, 0); g.lineTo(-1.04, 0); g.stroke();
        ell(g, 0.04, 0, 0.2, 0.17); body(g, col, px);
        ell(g, 0.36, 0, 0.16, 0.16); body(g, col, px);
        dot(g, 0.43, -0.08, 0.06, '#eaffef'); dot(g, 0.43, 0.08, 0.06, '#eaffef');
        g.strokeStyle = col; g.lineWidth = 1.6 * px; g.beginPath(); g.moveTo(0.5, -0.06); g.lineTo(0.62, -0.13); g.lineTo(0.66, -0.03); g.moveTo(0.5, 0.06); g.lineTo(0.62, 0.13); g.lineTo(0.66, 0.03); g.stroke();
      },
      charger(g, col, px, f) {
        g.strokeStyle = col; g.lineWidth = 2 * px;
        for (let i = 0; i < 3; i++) { const x = 0.2 - i * 0.32, w = (i % 2 ? 1 : -1) * (f ? 0.07 : -0.07); g.beginPath(); g.moveTo(x, -0.36); g.lineTo(x - 0.12 + w, -0.66); g.moveTo(x, 0.36); g.lineTo(x - 0.12 - w, 0.66); g.stroke(); }
        ell(g, -0.12, 0, 0.6, 0.47); body(g, col, px, 2.6);
        g.strokeStyle = col; g.globalAlpha = 0.7; g.lineWidth = 1.6 * px; g.beginPath(); g.moveTo(-0.7, 0); g.lineTo(0.22, 0); g.stroke(); g.globalAlpha = 1;
        dot(g, -0.32, -0.22, 0.075, '#ffd8b0'); dot(g, -0.32, 0.22, 0.075, '#ffd8b0'); dot(g, -0.02, -0.25, 0.05, '#ffd8b0'); dot(g, -0.02, 0.25, 0.05, '#ffd8b0');
        ell(g, 0.43, 0, 0.19, 0.24); body(g, col, px);
        polyU(g, [[0.52, -0.13], [1.05, 0], [0.52, 0.13]]); g.fillStyle = '#ffd0a0'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.6 * px; g.stroke();
        dot(g, 0.52, -0.17, 0.045, '#ffffff'); dot(g, 0.52, 0.17, 0.045, '#ffffff');
      },
      shooter(g, col, px, f) {
        g.strokeStyle = col; g.lineWidth = 1.9 * px; g.globalAlpha = 0.9;
        for (let k = -2; k <= 2; k++) { const y0 = k * 0.13, w = (k % 2 ? 1 : -1) * (f ? 0.14 : -0.14); g.beginPath(); g.moveTo(-0.15, y0); g.quadraticCurveTo(-0.55, y0 + w, -0.98, y0 * 1.5 - w * 0.5); g.stroke(); }
        g.globalAlpha = 1;
        g.beginPath(); g.moveTo(-0.22, -0.44); g.quadraticCurveTo(0.75, -0.62, 0.68, 0); g.quadraticCurveTo(0.75, 0.62, -0.22, 0.44); g.quadraticCurveTo(-0.1, 0, -0.22, -0.44); body(g, col, px, 2.6);
        for (const a of [-0.9, -0.45, 0.45, 0.9]) dot(g, 0.22 + Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.04, '#f0e0ff');
        softGlow(g, 0.2, 0, 0.32, col, 0.8); dot(g, 0.2, 0, 0.16, col); dot(g, 0.2, 0, 0.07, '#ffffff');
        dot(g, 0.66, 0, f ? 0.09 : 0.065, '#f3e6ff');
      },
      meteor: meteorShape,
      // ---- swarm expansion (2026-11-06, sian 'swarm') ----
      splitter(g, col, px, f) { // 분열낭: a sac with three embryos curled inside
        g.strokeStyle = col; g.lineWidth = 1.6 * px;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-0.6, k * 0.25); g.quadraticCurveTo(-0.95, k * 0.3 + (f ? 0.12 : -0.12) * (k || 1), -1.18, k * 0.42); g.stroke(); }
        ell(g, -0.02, 0, 0.8, 0.7); body(g, col, px, 2.4);
        for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + (f ? 0.35 : 0), x = Math.cos(a) * 0.32, y = Math.sin(a) * 0.3; ell(g, x, y, 0.2, 0.13, a + (f ? 0.4 : -0.2)); g.fillStyle = col + '66'; g.fill(); dot(g, x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, 0.04, '#f6ffe0'); }
        dot(g, 0.62, -0.12, 0.07, '#f6ffe0'); dot(g, 0.62, 0.12, 0.07, '#f6ffe0');
      },
      mini(g, col, px, f) { // hatchling: a tiny wasp
        for (const s of [-1, 1]) { ell(g, -0.1, s * 0.36, 0.42, 0.16, s * (f ? 0.32 : 0.8)); g.fillStyle = col + '38'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.4 * px; g.stroke(); }
        ell(g, -0.35, 0, 0.42, 0.26); body(g, col, px); ell(g, 0.3, 0, 0.24, 0.22); body(g, col, px);
        dot(g, 0.4, -0.09, 0.07, '#f6ffe0'); dot(g, 0.4, 0.09, 0.07, '#f6ffe0');
      },
      volatile(g, col, px, f) { // 폭발 포자: spiked sac with a hot core
        softGlow(g, 0, 0, 1.15, col, f ? 0.75 : 0.45);
        g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 0.55 : 0.9; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); body(g, col, px, 2.2, '#1a1406');
        dot(g, 0, 0, 0.3, col + 'aa'); dot(g, 0, 0, f ? 0.22 : 0.15, '#ffffff');
      },
      carapace(g, col, px, f) { // 갑각충: heavy front plate facing the station
        g.strokeStyle = col; g.lineWidth = 2 * px;
        for (let i = 0; i < 3; i++) { const x = 0.05 - i * 0.3, w = (i % 2 ? 1 : -1) * (f ? 0.06 : -0.06); g.beginPath(); g.moveTo(x, -0.4); g.lineTo(x - 0.1 + w, -0.72); g.moveTo(x, 0.4); g.lineTo(x - 0.1 - w, 0.72); g.stroke(); }
        ell(g, -0.3, 0, 0.56, 0.46); body(g, col, px, 2.2);
        g.beginPath(); g.arc(-0.05, 0, 0.95, -1.15, 1.15); g.arc(-0.05, 0, 0.6, 1.15, -1.15, true); g.closePath(); body(g, col, px, 2.8, '#1d180f');
        g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 1.4 * px; for (const a of [-0.6, 0, 0.6]) { g.beginPath(); g.moveTo(Math.cos(a) * 0.62 - 0.05, Math.sin(a) * 0.62); g.lineTo(Math.cos(a) * 0.93 - 0.05, Math.sin(a) * 0.93); g.stroke(); } g.globalAlpha = 1;
        dot(g, 0.5, -0.16, 0.05, '#fff4d8'); dot(g, 0.5, 0.16, 0.05, '#fff4d8');
      },
      mender(g, col, px, f) { // 치유 해파리: bell with a glowing cross, trailing tendrils
        g.strokeStyle = col; g.lineWidth = 1.6 * px;
        for (let k = -2; k <= 2; k++) { const y0 = k * 0.15, w = (k % 2 ? 1 : -1) * (f ? 0.16 : -0.16); g.beginPath(); g.moveTo(-0.25, y0); g.bezierCurveTo(-0.6, y0 + w, -0.95, y0 - w, -1.3, y0 * 1.6); g.stroke(); }
        g.beginPath(); g.moveTo(-0.3, -0.62); g.bezierCurveTo(0.5, -0.82, 0.95, -0.3, 0.8, 0); g.bezierCurveTo(0.95, 0.3, 0.5, 0.82, -0.3, 0.62); g.quadraticCurveTo(-0.15, 0, -0.3, -0.62); body(g, col, px, 2.4);
        softGlow(g, 0.22, 0, f ? 0.5 : 0.38, col, 0.9);
        g.fillStyle = '#ffffff'; g.fillRect(0.16, -0.2, 0.12, 0.4); g.fillRect(0.02, -0.06, 0.4, 0.12);
      },
      brood(g, col, px, f) { // 산란 어미: bloated abdomen studded with eggs
        g.strokeStyle = col; g.lineWidth = 2 * px;
        for (let i = 0; i < 3; i++) { const x = 0.35 - i * 0.22, w = (i % 2 ? 1 : -1) * (f ? 0.06 : -0.06); g.beginPath(); g.moveTo(x, -0.3); g.lineTo(x - 0.05 + w, -0.62); g.moveTo(x, 0.3); g.lineTo(x - 0.05 - w, 0.62); g.stroke(); }
        ell(g, -0.42, 0, 0.72, 0.58); body(g, col, px, 2.6);
        g.globalAlpha = 0.85; for (const [x, y] of [[-0.7, -0.25], [-0.45, 0.28], [-0.2, -0.22], [-0.8, 0.15], [-0.4, -0.02]]) { ell(g, x, y, 0.12, 0.1); g.fillStyle = '#ffe2d4'; g.fill(); } g.globalAlpha = 1;
        ell(g, 0.32, 0, 0.26, 0.24); body(g, col, px); ell(g, 0.62, 0, 0.16, 0.15); body(g, col, px);
        dot(g, 0.7, -0.07, 0.045, '#ffffff'); dot(g, 0.7, 0.07, 0.045, '#ffffff');
      },
      egg(g, col, px, f) { g.rotate(f ? 0.18 : -0.18); ell(g, 0, 0, 0.55, 0.45); body(g, col, px, 2, '#1a0f0b'); ell(g, 0.05, -0.08, 0.14, 0.14); g.fillStyle = '#ffe2d4aa'; g.fill(); },
      stalker(g, col, px, f) { // 위상 포식자: thin mantis body, scythe arms forward
        g.strokeStyle = col; g.lineWidth = 2.2 * px;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0.2, s * 0.12); g.lineTo(0.55, s * 0.42); g.quadraticCurveTo(1.05, s * 0.5, 1.1, s * (f ? 0.05 : 0.15)); g.stroke(); }
        ell(g, -0.45, 0, 0.62, 0.16); body(g, col, px, 2); ell(g, 0.1, 0, 0.22, 0.14); body(g, col, px);
        g.beginPath(); g.moveTo(0.28, -0.14); g.lineTo(0.55, 0); g.lineTo(0.28, 0.14); g.closePath(); body(g, col, px, 1.8);
        dot(g, 0.42, -0.06, 0.04, '#ffffff'); dot(g, 0.42, 0.06, 0.04, '#ffffff');
        g.strokeStyle = col; g.lineWidth = 1.4 * px; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-0.6, s * 0.1); g.lineTo(-0.85, s * (0.5 + (f ? 0.05 : 0))); g.moveTo(-0.3, s * 0.1); g.lineTo(-0.45, s * 0.45); g.stroke(); }
      },
      boss(g, col, px, f) {
        g.strokeStyle = col; g.lineWidth = 3 * px;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0.5, s * 0.28); g.quadraticCurveTo(1.08, s * 0.5, 0.96, s * 0.04); g.quadraticCurveTo(0.8, s * 0.3, 0.5, s * 0.28); body(g, col, px, 2.4); }
        for (let i = 0; i < 6; i++) { const a = TAU / 12 + i * TAU / 6 + Math.PI / 6; g.save(); g.translate(Math.cos(a) * 0.66, Math.sin(a) * 0.62); g.rotate(a); ell(g, 0, 0, 0.2, 0.15); body(g, col, px, 2.2); dot(g, 0.02, 0, 0.075, (i + f) % 2 ? '#ffd0e0' : col); g.restore(); }
        ell(g, 0, 0, 0.64, 0.56); body(g, col, px, 3, '#160b14');
        g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = 1.8 * px;
        g.beginPath(); g.arc(-0.05, 0, 0.42, -2.2, 2.2); g.stroke(); g.beginPath(); g.arc(-0.05, 0, 0.26, -2.4, 2.4); g.stroke(); g.globalAlpha = 1;
        softGlow(g, -0.06, 0, 0.36, col, f ? 0.9 : 0.6); dot(g, -0.06, 0, 0.15, col); dot(g, -0.06, 0, 0.06, '#ffffff');
        dot(g, 0.47, 0, 0.065, '#ffffff'); dot(g, 0.41, -0.15, 0.05, '#ffe0ec'); dot(g, 0.41, 0.15, 0.05, '#ffe0ec');
      }
    },
    mech: {
      drone(g, col, px, f) {
        softGlow(g, -0.36, 0, f ? 0.42 : 0.3, col, 0.9); dot(g, -0.33, 0, f ? 0.12 : 0.09, '#ffffff');
        polyU(g, [[1, 0], [-0.55, 0.72], [-0.28, 0], [-0.55, -0.72]]); body(g, col, px, 2.4);
        g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = 1.4 * px; g.beginPath(); g.moveTo(0.7, 0); g.lineTo(-0.2, 0); g.moveTo(0.2, -0.3); g.lineTo(-0.35, -0.48); g.moveTo(0.2, 0.3); g.lineTo(-0.35, 0.48); g.stroke(); g.globalAlpha = 1;
        ell(g, 0.3, 0, 0.15, 0.08); g.fillStyle = '#eaffef'; g.fill();
      },
      charger(g, col, px, f) {
        for (const s of [-1, 1]) { softGlow(g, -0.8, s * 0.3, f ? 0.3 : 0.22, col, 0.9); g.fillStyle = '#2a2f3c'; g.fillRect(-0.86, s * 0.3 - 0.1, 0.22, 0.2); g.strokeStyle = col; g.lineWidth = 1.4 * px; g.strokeRect(-0.86, s * 0.3 - 0.1, 0.22, 0.2); }
        polyU(g, [[1.02, 0], [0.25, 0.44], [-0.68, 0.5], [-0.68, -0.5], [0.25, -0.44]]); body(g, col, px, 2.6);
        g.strokeStyle = col; g.globalAlpha = 0.65; g.lineWidth = 1.5 * px; g.beginPath(); g.moveTo(0.25, -0.44); g.lineTo(-0.15, -0.16); g.lineTo(-0.15, 0.16); g.lineTo(0.25, 0.44); g.moveTo(-0.15, -0.16); g.lineTo(-0.68, -0.22); g.moveTo(-0.15, 0.16); g.lineTo(-0.68, 0.22); g.stroke(); g.globalAlpha = 1;
        polyU(g, [[0.55, -0.1], [1.04, 0], [0.55, 0.1]]); g.fillStyle = '#ffe3c8'; g.fill();
      },
      shooter(g, col, px, f) {
        for (const s of [-1, 1]) { g.beginPath(); g.rect(-0.66, s > 0 ? 0.3 : -0.6, 0.78, 0.3); body(g, col, px, 2); softGlow(g, -0.68, s * 0.45, 0.2, col, 0.8); }
        g.strokeStyle = '#3a3150'; g.lineWidth = 3 * px; g.beginPath(); g.moveTo(-0.2, -0.3); g.lineTo(-0.2, 0.3); g.stroke();
        g.beginPath(); g.rect(-0.46, -0.23, 0.86, 0.46); body(g, col, px, 2.4);
        g.fillStyle = '#e0d0ff'; g.fillRect(0.38, -0.07, 0.6, 0.14);
        softGlow(g, 0.98, 0, f ? 0.3 : 0.18, col, 1); dot(g, -0.02, 0, 0.09, '#f3e6ff');
      },
      meteor: meteorShape,
      boss(g, col, px, f) {
        for (const s of [-1, 1]) softGlow(g, -0.86, s * 0.28, f ? 0.32 : 0.24, col, 0.9);
        polyU(g, Array.from({ length: 6 }, (_, i) => [Math.cos(i * TAU / 6) * 0.86, Math.sin(i * TAU / 6) * 0.86])); body(g, col, px, 3, '#150b12');
        polyU(g, Array.from({ length: 6 }, (_, i) => [Math.cos(i * TAU / 6) * 0.56, Math.sin(i * TAU / 6) * 0.56])); g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 1.6 * px; g.stroke(); g.globalAlpha = 1;
        for (let i = 0; i < 4; i++) { g.fillStyle = (i + f) % 2 ? '#ffd0e0' : '#5a2a3c'; g.fillRect(0.6, -0.3 + i * 0.17, 0.16, 0.08); }
        for (const [x, y] of [[0.3, -0.62], [0.3, 0.62], [-0.45, -0.6], [-0.45, 0.6]]) { dot(g, x, y, 0.1, '#2a1a24'); g.strokeStyle = col; g.lineWidth = 1.6 * px; g.beginPath(); g.arc(x, y, 0.1, 0, TAU); g.stroke(); g.fillStyle = '#e8d6e0'; g.fillRect(x, y - 0.025, 0.2, 0.05); }
        softGlow(g, 0, 0, 0.34, col, f ? 0.95 : 0.7); dot(g, 0, 0, 0.15, '#ff3f74'); dot(g, 0, 0, 0.06, '#ffffff');
      }
    },
    geo: {} // current look: n-gon outlines, built in enemySprite
  };
  function flashSprite(src, key) { // white silhouette of a sprite, for the hit flash
    if (ESPR[key]) return ESPR[key];
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, c.width, c.height);
    ESPR[key] = c; return c;
  }
  function enemySprite(style, type, bucket, frame) {
    const key = style + type + bucket + '_' + frame; if (ESPR[key]) return ESPR[key];
    if (style === 'geo' && !GEO_T[type]) style = 'bio'; // the new forms have no geo outline: they use their bio drawing
    const S = style === 'geo' ? (type === 'boss' ? 96 : 48) : (SPR_S[type] || 76);
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), col = COL[type], m = S / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, col + (style === 'geo' ? '55' : '30')); gr.addColorStop(0.5, col + (style === 'geo' ? '22' : '12')); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.translate(m, m); g.rotate(bucket / ROT * TAU); g.lineJoin = 'round'; g.lineCap = 'round';
    if (style === 'geo') {
      const n = { drone: 3, meteor: 7, charger: 4, shooter: 4, boss: 6 }[type], rr = S * 0.26, rot = type === 'shooter' ? 0.785 : 0;
      const shape = (r, ro) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = ro + i / n * TAU; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
      shape(rr, rot); g.globalAlpha = 0.25; g.fillStyle = col; g.fill(); g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 2 * S / 48; g.stroke();
      if (type === 'boss') { shape(rr * 0.55, -rot); g.stroke(); }
    } else {
      const u = S * 0.4; g.scale(u, u); (DRAW[style][type] || DRAW.bio[type])(g, col, 1 / u, frame); // new forms share the bio drawing
    }
    ESPR[key] = c; return c;
  }
  // visual radius (world units) of each type, matching the current balance of sizes
  const SIZE = { drone: 1.8, meteor: 1.5, charger: 1.875, shooter: 1.5, boss: 1.2, splitter: 1.55, mini: 1.9, volatile: 1.6, carapace: 1.45, mender: 1.6, brood: 1.45, egg: 1.6, stalker: 1.75 };
  const GEO_T = { drone: 1, meteor: 1, charger: 1, shooter: 1, boss: 1 };
  function drawEnemy(ctx, style, e, time, flash) {
    const type = e.type, ext = SIZE[type] * e.r; if (style === 'geo' && !GEO_T[type]) style = 'bio';
    let a, frame = 0, half;
    if (style === 'geo') {
      half = ext / 0.52;
      a = type === 'meteor' ? e.ang + time * 0.5 : type === 'shooter' ? time : type === 'boss' ? time * 0.4 : Math.atan2(-e.y, -e.x);
    } else {
      half = ext * 1.18 / 0.8;
      a = type === 'meteor' ? e.ang + time * 0.5 : Math.atan2(-e.y, -e.x);
      if (e._ph == null) e._ph = Math.random() * 10;
      frame = Math.floor(time * (type === 'drone' || type === 'mini' ? 14 : type === 'boss' ? 3 : type === 'egg' ? 10 : 6) + e._ph) % 2;
    }
    const bucket = ((Math.round(a / TAU * ROT) % ROT) + ROT) % ROT;
    if (style === 'bio' && type !== 'meteor') half *= 1 + 0.05 * Math.sin(time * (type === 'boss' ? 2.2 : 7) + (e._ph || 0)); // living bodies breathe
    const spr = enemySprite(style, type, bucket, frame), ga = ctx.globalAlpha;
    if (e.ghost) ctx.globalAlpha = ga * (0.16 + 0.08 * Math.sin(time * 30)); // phased-out stalker: a faint shimmer
    ctx.drawImage(flash ? flashSprite(spr, style + type + bucket + '_' + frame + 'w') : spr, e.x - half, e.y - half, half * 2, half * 2);
    ctx.globalAlpha = ga;
  }

  // interceptor: slim dart with forward-swept blades (original design), baked into rotation buckets
  const CSPR = {};
  function craftSprite(bucket, col) {
    const key = bucket + col; if (CSPR[key]) return CSPR[key];
    const S = 40, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), u = S * 0.4, px = 1 / u;
    g.translate(S / 2, S / 2); g.rotate(bucket / ROT * TAU); g.scale(u, u); g.lineJoin = 'round';
    softGlow(g, -0.82, 0, 0.42, '#9fe6ff', 0.95); dot(g, -0.8, 0, 0.12, '#ffffff');
    for (const sd of [-1, 1]) { polyU(g, [[-0.25, sd * 0.12], [0.5, sd * 0.78], [0.28, sd * 0.9], [-0.55, sd * 0.32]]); body(g, col, px, 2.2, '#101826'); }
    polyU(g, [[1, 0], [0.2, 0.17], [-0.7, 0.13], [-0.86, 0], [-0.7, -0.13], [0.2, -0.17]]); body(g, col, px, 2.4, '#101826');
    ell(g, 0.32, 0, 0.16, 0.07); g.fillStyle = '#eaf6ff'; g.fill();
    CSPR[key] = c; return c;
  }
  function drawCraft(ctx, c, col) {
    const half = 2.4, bucket = ((Math.round(c.ang / TAU * ROT) % ROT) + ROT) % ROT;
    ctx.drawImage(craftSprite(bucket, col || '#ffd166'), c.x - half, c.y - half, half * 2, half * 2);
  }

  // giant swarm mothership for the prologue finale: drawn in world units, centre (x, y), maw at y + 66
  function aglow(ctx, x, y, r, col, a) { if (a > 0 && r > 0) glow(ctx, x, y, r, col, Math.min(1, a)); ctx.globalAlpha = 1; }
  function bug(ctx, x, y, s, a, col, t) { // tiny swarm drone (egg contents, hatchlings)
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = col; ctx.fillStyle = '#0b111d'; ctx.lineWidth = 1;
    const f = Math.sin(t * 40) > 0 ? 0.4 : 0.9; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-s * 0.1, sd * s * 0.45, s * 0.5, s * 0.18, sd * f, 0, TAU); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.28, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // ================= prologue mothership 'brood ark' (2026-11-04 pick: rose palette + egg sacs with drones inside + eye cluster) =================
  // drawn in its own units (maw at y=46), scaled and shifted so the maw sits at engine MOTHER.maw (66) below the ship's origin
  // P: palette { plates: [5 colours back→front], rim, vein, pore, maw, glowA }
  const PAL = {
    rose: { plates: ['#1a0816', '#260b20', '#33102a', '#401434', '#4d183d'], rim: '255,111,159', vein: '#ff6f9f', pore: '#ffb3d1', maw: '#ff6f9f', tooth: '#ffd0e0', sac: ['#ff9fc0', '#7a2350', '#2a0c20'], tent: '#3d1430' }
  };
  function ark(ctx, t, charge, o) {
    const P = PAL[o.pal], breath = 1 + 0.015 * Math.sin(t * 1.4), W0 = o.wide || 1;
    // optional membrane fins on the flanks (behind everything)
    if (o.wings) for (const sd of [-1, 1]) { const fl = 0.25 + 0.12 * Math.sin(t * 1.8 + sd); ctx.save(); ctx.translate(sd * 120 * W0, -10); ctx.rotate(sd * fl);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sd * 80, -60, sd * 120, -20); ctx.quadraticCurveTo(sd * 95, 10, sd * 110, 40); ctx.quadraticCurveTo(sd * 60, 30, 0, 24); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, sd * 120, 0); g.addColorStop(0, `rgba(${P.rim},0.28)`); g.addColorStop(1, `rgba(${P.rim},0.04)`); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = `rgba(${P.rim},0.6)`; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = `rgba(${P.rim},0.3)`; for (let v = 0; v < 5; v++) { ctx.beginPath(); ctx.moveTo(0, 10); ctx.quadraticCurveTo(sd * (30 + v * 14), -20 + v * 8, sd * (60 + v * 12), -40 + v * 18); ctx.stroke(); } ctx.restore(); }
    // tentacle fringe
    const nT = o.tentacles == null ? 18 : o.tentacles;
    for (let i = 0; i < nT; i++) { const x0 = (-128 + i * (256 / Math.max(1, nT - 1))) * W0, sw = Math.sin(t * 1.6 + i * 0.7) * 9, len = (46 + (i * 37 % 5) * 9) * (o.tentLen || 1);
      ctx.strokeStyle = P.tent; ctx.lineWidth = 4 - (i % 3); ctx.beginPath(); ctx.moveTo(x0, 40); ctx.bezierCurveTo(x0 + sw, 40 + len * 0.4, x0 - sw, 40 + len * 0.7, x0 + sw * 1.5, 40 + len); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; aglow(ctx, x0 + sw * 1.5, 40 + len, 4, P.vein, 0.25 + 0.35 * Math.max(0, Math.sin(t * 2 + i))); ctx.globalCompositeOperation = 'source-over'; }
    // brood sacs: n sacs hung under the belly; 'eggs' style shows wriggling drones inside
    const nS = o.sacs || 2;
    for (let s = 0; s < nS; s++) { const f = nS === 1 ? 0 : s / (nS - 1) * 2 - 1, sx = f * 96 * W0, sy = 54 + Math.abs(f) * -4 + Math.sin(t * 1.1 + s) * 3 + (o.eggs ? 10 : 0), R = o.eggs ? 15 : 12;
      ctx.strokeStyle = P.tent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(f * 80 * W0, 30); ctx.quadraticCurveTo(f * 88 * W0, 42, sx, sy - R); ctx.stroke();
      const sg = ctx.createRadialGradient(sx - 4, sy - 4, 1, sx, sy, R * 1.3); sg.addColorStop(0, P.sac[0]); sg.addColorStop(0.4, P.sac[1]); sg.addColorStop(1, P.sac[2]);
      ctx.globalAlpha = o.eggs ? 0.8 : 1; ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.8, R * breath, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = P.vein; ctx.lineWidth = 1; ctx.stroke();
      if (o.eggs) { ctx.save(); ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.75, R * 0.95, 0, 0, TAU); ctx.clip(); bug(ctx, sx + Math.sin(t * 3 + s) * 2, sy, 9, Math.PI / 2 + Math.sin(t * 4 + s) * 0.5, '#5fe39a', t + s); ctx.restore(); }
      const dp = ((t * 0.45 + s / nS) % 1); if (dp < 0.7 && (s % 2 === 0 || nS <= 2)) bug(ctx, sx + f * dp * 40, sy + R + 6 + dp * 120, 7, Math.PI / 2 + f * 0.4, '#5fe39a', t); }
    // chitin plates
    const nP = o.plates || 5, plates = [[-18, 150, 70], [-6, 136, 62], [6, 118, 54], [18, 96, 44], [28, 70, 32]].slice(5 - nP);
    plates.forEach(([y, rx, ry], i) => { const c = P.plates[5 - nP + i]; rx *= W0;
      ctx.beginPath(); for (let k = 0; k <= 48; k++) { const a = Math.PI + k / 48 * Math.PI * 2, wob = 1 + 0.035 * Math.sin(a * 7 + i), sp = o.spikes && a < Math.PI * 2 && k % 4 === 0 ? 1.12 : 1; ctx.lineTo(Math.cos(a) * rx * wob * breath * sp, y + Math.sin(a) * ry * wob * sp * (a > Math.PI * 2 ? 0.75 : 1)); } ctx.closePath();
      const g = ctx.createLinearGradient(0, y - ry, 0, y + ry); g.addColorStop(0, c); g.addColorStop(0.5, '#0a0408'); g.addColorStop(1, c); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = `rgba(${P.rim},${0.25 + i * 0.1})`; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,240,0.16)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, y, rx * 0.97 * breath, ry * 0.95, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      if (o.cracks && i >= nP - 3) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = P.vein; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + i) + 0.3 * charge; ctx.lineWidth = 1.3;
        for (let c2 = 0; c2 < 3; c2++) { const a = Math.PI * (1.25 + c2 * 0.25), x1 = Math.cos(a) * rx * 0.9, y1 = y + Math.sin(a) * ry * 0.9; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 * 0.85 + 6, y1 + 8); ctx.lineTo(x1 * 0.7 - 4, y1 + 12); ctx.lineTo(x1 * 0.6, y1 + 20); ctx.stroke(); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } });
    // spikes on the crest
    if (o.spikes) for (let i = 0; i < 11; i++) { const a = Math.PI * 1.08 + i / 10 * Math.PI * 0.84, bx = Math.cos(a) * 146 * W0, by = -18 + Math.sin(a) * 68, len = 18 + (i % 2) * 14 + (i === 5 ? 16 : 0);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(0, -len); ctx.lineTo(5, 4); ctx.closePath(); const g = ctx.createLinearGradient(0, 4, 0, -len); g.addColorStop(0, P.plates[4]); g.addColorStop(1, P.tooth); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = `rgba(${P.rim},0.7)`; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore(); }
    // coral / crystal spires growing on top (old, ancient look)
    if (o.coral) { ctx.globalCompositeOperation = 'source-over'; for (let i = 0; i < 9; i++) { const x = (-90 + i * 22.5) * W0, base = -18 - Math.sqrt(Math.max(0, 1 - (x / (150 * W0)) ** 2)) * 66, h = 26 + ((i * 53) % 5) * 9;
        ctx.strokeStyle = `rgba(${P.rim},0.85)`; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, base + 6); ctx.lineTo(x + (i % 2 ? 4 : -4), base - h); ctx.stroke();
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + (i % 2 ? 2 : -2), base - h * 0.45); ctx.lineTo(x + (i % 2 ? 12 : -12), base - h * 0.75); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; aglow(ctx, x + (i % 2 ? 4 : -4), base - h, 6, P.pore, 0.5 + 0.5 * Math.max(0, Math.sin(t * 1.5 + i)) + 0.3 * charge); aglow(ctx, x + (i % 2 ? 12 : -12), base - h * 0.75, 3.5, P.vein, 0.6); ctx.globalCompositeOperation = 'source-over'; } }
    // veins
    ctx.globalCompositeOperation = 'lighter';
    const veins = [[-120, -20, -70, 10, -30, 30], [120, -20, 70, 10, 30, 30], [-60, -50, -40, 0, -14, 34], [60, -50, 40, 0, 14, 34], [0, -60, -6, -10, 0, 30]];
    for (const [x0, y0, x1, y1, x2, y2] of veins) { ctx.strokeStyle = `rgba(${P.rim},0.35)`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 * W0, y0); ctx.quadraticCurveTo(x1 * W0, y1, x2 * W0, y2); ctx.stroke();
      for (let j = 0; j < 3; j++) { const p = (t * (0.5 + charge * 1.5) + j / 3) % 1, q = 1 - p; aglow(ctx, (q * q * x0 + 2 * q * p * x1 + p * p * x2) * W0, q * q * y0 + 2 * q * p * y1 + p * p * y2, 5 + charge * 4, P.vein, 0.6 + 0.4 * charge); } }
    for (let i = 0; i < 26; i++) { const a = Math.PI * 1.08 + (i / 26) * Math.PI * 0.84, rr = 0.55 + (i % 4) * 0.1; aglow(ctx, Math.cos(a) * 130 * rr * W0, -6 + Math.sin(a) * 60 * rr, 2.5, P.pore, 0.3 + 0.5 * Math.max(0, Math.sin(t * 2.4 + i * 1.3))); }
    // eye cluster above the maw (optional)
    if (o.eyes) for (let i = 0; i < 5; i++) { const ex = (i - 2) * 13, ey = 20 - Math.abs(i - 2) * 3, open = (t * 0.9 + i * 0.37) % 5 < 0.12 ? 0.2 : 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#0a0306'; ctx.beginPath(); ctx.ellipse(ex, ey, 4.5, 4.5 * open, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; aglow(ctx, ex, ey, 5 + charge * 3, P.maw, 0.9 * open); }
    ctx.globalCompositeOperation = 'source-over';
    // maw: n petals open with the charge
    const my = 46, open = 0.15 + 0.85 * charge, nM = o.petals || 4, big = o.bigMaw ? 1.35 : 1;
    ctx.globalCompositeOperation = 'lighter'; aglow(ctx, 0, my, (16 + 40 * charge) * big, P.maw, 0.5 + 0.5 * charge); if (charge > 0) aglow(ctx, 0, my, (8 + 18 * charge) * big, '#ffffff', charge); ctx.globalCompositeOperation = 'source-over';
    for (let k = 0; k < nM; k++) { const base = k * TAU / nM + Math.PI / nM; ctx.save(); ctx.translate(0, my); ctx.rotate(base); ctx.translate((6 + 10 * open) * big, 0); ctx.rotate(0.6 * open); ctx.scale(big, big);
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(22, -9, 26, 0); ctx.quadraticCurveTo(22, 9, 0, 7); ctx.closePath(); ctx.fillStyle = P.plates[1]; ctx.fill(); ctx.strokeStyle = P.vein; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = P.tooth; for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.moveTo(6 + s * 6, 5); ctx.lineTo(8 + s * 6, 9); ctx.lineTo(10 + s * 6, 5); ctx.fill(); } ctx.restore(); }
    if (charge > 0) { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 20; i++) { const ph = (t * 1.3 + i / 20) % 1, a = i * 2.4, d = 90 * (1 - ph); aglow(ctx, Math.cos(a) * d, my + Math.sin(a) * d * 0.6, 2.4, i % 3 ? P.vein : P.tooth, ph * charge); } ctx.globalCompositeOperation = 'source-over'; }
    return { mx: 0, my, beam: P.maw };
  }
  const ARK = { pal: 'rose', sacs: 6, eggs: true, eyes: true, petals: 4, tentacles: 20, tentLen: 1.1 }, ARK_K = 0.8;
  function drawMothership(ctx, x, y, t, charge) {
    ctx.save(); ctx.translate(x, y + 66 - 46 * ARK_K); ctx.scale(ARK_K, ARK_K); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ark(ctx, t, charge, ARK);
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ======================================================================
  // Memory transfer warp (run lost → the station's memory flies to the next core).
  // 8.5 s cinematic, drawn in a 1080x1920 design space and cover-scaled to any screen:
  // 0–1 s core cracks under red alarm → 1.0 s white flash → 1–5 s hexagonal light tunnel (amber/blue/violet light,
  // passing wall lamps, speed streaks) → 4.5–7 s tunnel melts into light ribbons that converge → 7.05 s new core ignites.
  // Pure function of t (deterministic), so it can be skipped/seeked. Timing matches assets/audio/warp.mp3.
  // ======================================================================
  const WARP_DUR = 8.5;
  const WARP = (() => {
    const r = rng(7), P = [], RIB = [], STARS = [];
    for (let i = 0; i < 420; i++) P.push({ a: r() * TAU, r: 0.25 + r() * 1.1, z: r() * 40, w: 0.6 + r() * 2.4, c: r() });
    for (let i = 0; i < 9; i++) RIB.push({ ph: r() * 6, fq: 0.8 + r() * 1.4, amp: 60 + r() * 160, y0: (r() - 0.5) * 520, w: 1.5 + r() * 5, c: i % 3 });
    for (let i = 0; i < 220; i++) STARS.push({ x: r() * 1080, y: r() * 1920, s: r() * 1.8 + 0.3, tw: r() * 6 });
    // camera travel: integrate the speed curve once (60 steps / s)
    const ss = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
    const speed = t => (0.2 + 8.8 * ss(0.7, 1.6, t)) * (1 - 0.75 * ss(4.6, 6.2, t));
    const camZ = []; for (let i = 0, z = 0; i <= WARP_DUR * 60 + 2; i++) { camZ.push(z); z += speed(i / 60) / 60; }
    return { P, RIB, STARS, ss, speed, camZ };
  })();
  function drawWarp(ctx, W, H, t) {
    const { P, RIB, STARS, ss, speed, camZ } = WARP, DW = 1080, DH = 1920, CX = 540, CY = 880, F = 620;
    const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), mix = (a, b, k) => a + (b - a) * k;
    const mixc = (a, b, k) => a.map((v, i) => mix(v, b[i], k)), rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    const AMBER = [255, 170, 60], BLUE = [70, 120, 255], VIOLET = [190, 140, 255], CYAN = [90, 220, 255], PINK = [255, 120, 200], WHITE = [255, 245, 235];
    const KEYS = [[0, AMBER], [1.6, AMBER], [2.3, BLUE], [2.9, AMBER], [3.5, VIOLET], [4.6, BLUE], [5.4, VIOLET], [99, VIOLET]];
    let gc = VIOLET; for (let i = 0; i < KEYS.length - 1; i++) if (t <= KEYS[i + 1][0]) { gc = mixc(KEYS[i][1], KEYS[i + 1][1], ss(KEYS[i][0], KEYS[i + 1][0], t)); break; }
    const jr = rng(1234 + Math.floor(t * 30)); // per-frame jitter (shake, grain)
    const g = ctx, sc = Math.max(W / DW, H / DH);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.scale(sc, sc); g.translate(-DW / 2, -DH / 2);
    const proj = (x, y, z) => { const s = F / Math.max(z, 0.02); return [CX + x * s, CY + y * s, s]; };
    const hexPath = (cx, cy, rr, rot = 0) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + Math.PI / 6 + i * Math.PI / 3, x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    const glowLine = (path, col, a, w) => { if (a <= 0.004) return; path(); g.strokeStyle = rgba(col, a * 0.18); g.lineWidth = w * 5; g.stroke(); g.strokeStyle = rgba(col, a * 0.45); g.lineWidth = w * 2.2; g.stroke(); g.strokeStyle = rgba(mixc(col, WHITE, 0.6), a); g.lineWidth = w; g.stroke(); };
    const tunnel = ss(0.75, 1.2, t) * (1 - ss(4.8, 5.8, t)), ribbon = ss(4.5, 5.4, t) * (1 - ss(6.6, 7.3, t));
    const flick = tunnel * Math.pow(0.5 + 0.5 * Math.sin(t * 9.3), 6) * 0.6 + tunnel * Math.pow(0.5 + 0.5 * Math.sin(t * 4.1 + 1), 10) * 0.5;
    // background light (the tunnel lamps tint the whole frame, like the reference)
    const amb = mixc([6, 8, 22], gc, 0.18 * tunnel + 0.42 * flick + 0.35 * ribbon), bg = g.createRadialGradient(CX, CY, 0, CX, CY, 1300);
    bg.addColorStop(0, rgba(mixc(amb, gc, 0.35 * tunnel + 0.3 * ribbon), 1)); bg.addColorStop(0.55, rgba(amb, 1)); bg.addColorStop(1, rgba(mixc(amb, [0, 0, 0], 0.6), 1));
    g.fillStyle = bg; g.fillRect(-DW, -DH, DW * 3, DH * 3);
    g.globalCompositeOperation = 'lighter';
    const starA = Math.max(0, 1 - tunnel * 0.9 - ribbon * 0.6);
    if (starA > 0.02) for (const s of STARS) { g.fillStyle = rgba(WHITE, starA * (0.35 + 0.35 * Math.sin(t * 2 + s.tw))); g.fillRect(s.x, s.y, s.s, s.s); }
    g.save();
    g.translate(CX, CY); g.rotate(0.10 * Math.sin(t * 0.9) * tunnel + (t < 1.2 ? 0 : 0.02 * Math.sin(t * 23) * tunnel)); g.translate(-CX, -CY);
    const shk = (t < 0.95 ? ss(0.1, 0.85, t) * 14 : 0) + tunnel * speed(t) * 0.35; g.translate((jr() - 0.5) * shk, (jr() - 0.5) * shk);
    const cz = camZ[Math.min(camZ.length - 1, Math.round(t * 60))], sp = speed(t);
    if (tunnel > 0.01) {
      const SP = 1.6, first = Math.floor(cz / SP) + 1;
      for (let i = first + 18; i >= first; i--) { const d = i * SP - cz; if (d < 0.15) continue;
        const [x, y, s] = proj(0, 0, d), near = cl(1 - d / 28), a = tunnel * near * near * (0.55 + 0.45 * Math.sin(i * 1.7));
        glowLine(() => hexPath(x, y, 1.15 * s, Math.sin(i * 0.4) * 0.06), i % 5 === 0 ? mixc(gc, WHITE, 0.5) : gc, a * 0.7, Math.max(1, s * 0.006)); }
      for (let lane = 0; lane < 6; lane++) { // wall lamps along the hex corners, streaking past
        const a = Math.PI / 6 + lane * Math.PI / 3, lx = Math.cos(a) * 1.1, ly = Math.sin(a) * 1.1, lc = lane % 2 ? gc : mixc(gc, CYAN, 0.5);
        for (let k = 0; k < 14; k++) { const segZ = Math.floor(cz / 2.2) * 2.2 + k * 2.2 + ((lane * 0.37) % 1) * 2.2, d0 = segZ - cz, d1 = d0 + 1.2 + sp * 0.12;
          if (d0 < 0.7) continue; const [x0, y0] = proj(lx, ly, d0), [x1, y1] = proj(lx, ly, d1);
          glowLine(() => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); }, lc, tunnel * cl(1 - d0 / 26) * (lane >= 4 ? 1 : 0.55) * cl((d0 - 0.7) / 1.5), Math.min(9, Math.max(1.2, F / d0 * 0.012))); }
      }
    }
    const fadeStreak = (t < 0.75 ? 0.25 : 1) * (1 - 0.92 * ss(6.3, 7.1, t)) * (1 - ribbon * 0.8), len = Math.min(14, 0.05 + sp * 0.32);
    for (const p of P) { const d = ((p.z - cz) % 40 + 40) % 40 + 0.2, a = cl(1 - d / 38) * (0.25 + 0.75 * cl(sp / 4)) * fadeStreak; if (a < 0.02) continue;
      const x = Math.cos(p.a) * p.r, y = Math.sin(p.a) * p.r, [x0, y0, s0] = proj(x, y, d), [x1, y1] = proj(x, y, d + len);
      g.strokeStyle = rgba(p.c < 0.55 ? mixc(gc, WHITE, 0.35) : p.c < 0.8 ? CYAN : WHITE, a); g.lineWidth = Math.max(0.6, p.w * s0 * 0.004); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    if (ribbon > 0.01) { const conv = ss(6.2, 7.2, t);
      RIB.forEach((rb, i) => glowLine(() => { g.beginPath(); for (let x = -80; x <= DW + 80; x += 18) { const u = x / DW, env = Math.sin(Math.PI * cl(u));
        let y = CY + 260 + rb.y0 * (1 - conv) + Math.sin(u * TAU * rb.fq + t * 2.4 + rb.ph) * rb.amp * env * (1 - conv) + (u - 0.5) * -140 * (1 - conv), xx = x;
        if (conv > 0) { xx = mix(x, CX, conv * 0.92); y = mix(y, CY, conv); } x === -80 ? g.moveTo(xx, y) : g.lineTo(xx, y); } }, [CYAN, WHITE, PINK][rb.c], ribbon * (0.55 + 0.45 * Math.sin(t * 3 + i)), rb.w)); }
    g.restore();
    // the core: cracking at the start, a fresh one igniting at the end
    const core = (x, y, s, k, dying) => {
      g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(t * (dying ? 38 : 6)), hc = dying ? [255, 90, 80] : CYAN, halo = g.createRadialGradient(0, 0, 0, 0, 0, s * 3.2);
      halo.addColorStop(0, rgba(hc, 0.55 * pulse)); halo.addColorStop(1, rgba(hc, 0)); g.fillStyle = halo; g.fillRect(-s * 3.2, -s * 3.2, s * 6.4, s * 6.4);
      const ring = dying ? 1 : ss(0.25, 1, (t - 6.6) / 1.1);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; let tx = Math.cos(a) * s * 1.73, ty = Math.sin(a) * s * 1.73;
        if (dying) { const f = ss(0.25, 0.95, k) * (1.2 + i * 0.25); tx *= 1 + f; ty *= 1 + f; }
        glowLine(() => hexPath(tx, ty, s * 0.86, dying ? k * (i - 2.5) * 2 : 0), i % 2 ? [255, 200, 90] : CYAN, dying ? 1 - ss(0.6, 1, k) : ring * (0.35 + 0.15 * Math.sin(t * 5 + i)), 3); }
      const ca = dying ? 1 - ss(0.75, 1.05, k) : 1;
      glowLine(() => hexPath(0, 0, s), dying ? [255, 140, 120] : CYAN, ca, 4); glowLine(() => hexPath(0, 0, s * 0.55, Math.PI / 6), WHITE, ca * 0.8, 2);
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.5); cg.addColorStop(0, rgba(WHITE, ca)); cg.addColorStop(1, rgba(hc, 0)); g.fillStyle = cg; g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.fill();
      if (dying) { g.strokeStyle = rgba(WHITE, 0.9 * ca); g.lineWidth = 2.5; for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4, L = s * mix(0.2, 1.1, ss(0.05, 0.5, k));
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * L * 0.5 + 6, Math.sin(a) * L * 0.5 - 4); g.lineTo(Math.cos(a + 0.2) * L, Math.sin(a + 0.2) * L); g.stroke(); } }
      g.restore();
    };
    if (t < 1.25) { core(CX, CY, 110 * (1 + ss(0.6, 1.1, t) * 0.4), Math.min(t, 1.2), true);
      g.globalCompositeOperation = 'source-over'; const vg = g.createRadialGradient(CX, CY, 400, CX, CY, 1200);
      vg.addColorStop(0, 'rgba(255,40,60,0)'); vg.addColorStop(1, `rgba(255,40,60,${0.28 * (0.6 + 0.4 * Math.sin(t * 20)) * (1 - ss(0.8, 1.1, t))})`); g.fillStyle = vg; g.fillRect(-DW, -DH, DW * 3, DH * 3); }
    if (t > 6.55) { core(CX, CY, mix(10, 105, ss(6.55, 7.3, t)) * (1 + 0.03 * Math.sin(t * 6)), 0, false);
      const sw = (t - 7.0) / 0.9; if (sw > 0 && sw < 1) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(CYAN, (1 - sw) * 0.6); g.lineWidth = 6 * (1 - sw) + 1; hexPath(CX, CY, 120 + sw * 700); g.stroke(); } }
    const flash = Math.exp(-Math.pow((t - 1.0) / 0.12, 2)) * 0.95 + Math.exp(-Math.pow((t - 7.05) / 0.1, 2)) * 0.7;
    if (flash > 0.01) { g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(WHITE, flash); g.fillRect(-DW, -DH, DW * 3, DH * 3); }
    g.globalCompositeOperation = 'source-over';
    const v = g.createRadialGradient(CX, DH / 2, DH * 0.35, CX, DH / 2, DH * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = v; g.fillRect(-DW, -DH, DW * 3, DH * 3);
    const fade = 1 - ss(0, 0.25, t); if (fade > 0) { g.fillStyle = `rgba(0,0,0,${fade})`; g.fillRect(-DW, -DH, DW * 3, DH * 3); }
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.025)'; for (let i = 0; i < 160; i++) g.fillRect(jr() * DW, jr() * DH, 2, 2); // film grain
    g.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  root.SZA = { HEXB, TICON, tileIcon, COL, glowSprite, glow, makeBackground, drawBackground, STATION_STYLES, drawStation, ENEMY_STYLES, enemySprite, drawEnemy, ROT, drawCraft, craftSprite, TILE_COL, orbitPos, drawMothership, drawWarp, WARP_DUR };
})(typeof window !== 'undefined' ? window : globalThis);
