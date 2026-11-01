// Station Zero art module: 3D-parallax space background, station designs, enemy sprite families.
// Shared by the game (index.src.html) and the art mockup page (sian.src.html). No game logic here.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const COL = { drone: '#5fe39a', meteor: '#9aa3b8', charger: '#ff9f4d', shooter: '#c08bff', boss: '#ff6f9f' };

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
    // turret on the core, pointing at the current target
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.save(); ctx.rotate(o.aim || 0);
    ctx.fillStyle = '#2a3c58'; ctx.fillRect(R * 0.1, -R * 0.13, R * 0.42, R * 0.26);
    ctx.fillStyle = '#dfe8f5'; ctx.fillRect(R * 0.2, -R * 0.065, R * 0.78, R * 0.13);
    ctx.fillStyle = '#9fe6ff'; ctx.fillRect(R * 0.9, -R * 0.05, R * 0.12, R * 0.1);
    ctx.restore();
    ctx.fillStyle = '#d6f3ff'; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, R * 0.6, '#9fe6ff', 0.85);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (o._front) { o._front(); o._front = null; }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  // hex core: ring-1 slots carry function tiles; empty open slots show a docking frame; orbitals circle outside
  const TILE_COL = { hangar: '#ffd166', battery: '#6fd3ff', shield: '#8fa2ff', collector: '#c8fff0' };
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
  function tileArt(ctx, x, y, r, a, tl, t, k, aim, R) {
    const col = tl.proto ? '#ffd166' : (TILE_COL[tl.type] || '#6fd3ff');
    hexPath(ctx, x, y, r, 0); ctx.fillStyle = '#0e1b2f'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = R * 0.07; ctx.stroke();
    hexPath(ctx, x, y, r * 0.66, 0); ctx.fillStyle = '#14294a'; ctx.fill();
    ctx.save(); ctx.translate(x, y);
    if (tl.type === 'hangar') {
      ctx.rotate(a); ctx.fillStyle = '#04070e'; ctx.fillRect(-r * 0.5, -r * 0.24, r * 1.0, r * 0.48);
      ctx.strokeStyle = col; ctx.lineWidth = R * 0.04; ctx.strokeRect(-r * 0.5, -r * 0.24, r * 1.0, r * 0.48);
      ctx.globalCompositeOperation = 'lighter'; const on = Math.sin(t * 5 + k) > 0;
      glow(ctx, r * 0.42, -r * 0.16, r * 0.22, col, on ? 1 : 0.3); glow(ctx, r * 0.42, r * 0.16, r * 0.22, col, on ? 0.3 : 1);
    } else if (tl.type === 'battery') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.fillStyle = '#1b2a40'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = R * 0.05; ctx.stroke();
      ctx.rotate(aim == null ? a : aim); ctx.fillStyle = '#dfe8f5'; ctx.fillRect(0, -r * 0.1, r * 0.95, r * 0.2);
      ctx.fillStyle = col; ctx.fillRect(r * 0.85, -r * 0.08, r * 0.14, r * 0.16);
    } else if (tl.type === 'shield') {
      ctx.rotate(a); ctx.strokeStyle = col; ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.62, -1.1, 1.1); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + k); ctx.lineWidth = R * 0.18; ctx.stroke();
    } else if (tl.type === 'collector') {
      ctx.rotate(a); ctx.strokeStyle = col; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, r * 0.75, 0, r * 0.3, col, 0.5 + 0.5 * Math.max(0, Math.sin(t * 3 + k)));
    }
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function hexStation(ctx, t, R, o) {
    const tiles = o.tiles || tierTiles(o.tier || 0), grow = o.grow == null ? 1 : o.grow;
    const openK = o.openK || SLOT_ORDER.filter(k => tiles[k]);
    const nT = tiles.filter(Boolean).length, cr = R * 0.52, d = cr * Math.sqrt(3) * 1.06, tr = cr * 0.9;
    const nO = o.orbitals == null ? ((o.tier || 0) >= 2 ? 3 : 0) : o.orbitals, ot = o.ot == null ? t : o.ot, sc = R / 9.1;
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
  const SPR_S = { boss: 168, meteor: 88 };
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
  function enemySprite(style, type, bucket, frame) {
    const key = style + type + bucket + '_' + frame; if (ESPR[key]) return ESPR[key];
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
      const u = S * 0.4; g.scale(u, u); DRAW[style][type](g, col, 1 / u, frame);
    }
    ESPR[key] = c; return c;
  }
  // visual radius (world units) of each type, matching the current balance of sizes
  const SIZE = { drone: 1.8, meteor: 1.5, charger: 1.875, shooter: 1.5, boss: 1.2 };
  function drawEnemy(ctx, style, e, time) {
    const type = e.type, ext = SIZE[type] * e.r;
    let a, frame = 0, half;
    if (style === 'geo') {
      half = ext / 0.52;
      a = type === 'meteor' ? e.ang + time * 0.5 : type === 'shooter' ? time : type === 'boss' ? time * 0.4 : Math.atan2(-e.y, -e.x);
    } else {
      half = ext * 1.18 / 0.8;
      a = type === 'meteor' ? e.ang + time * 0.5 : Math.atan2(-e.y, -e.x);
      if (e._ph == null) e._ph = Math.random() * 10;
      frame = Math.floor(time * (type === 'drone' ? 14 : type === 'boss' ? 3 : 6) + e._ph) % 2;
    }
    const bucket = ((Math.round(a / TAU * ROT) % ROT) + ROT) % ROT;
    ctx.drawImage(enemySprite(style, type, bucket, frame), e.x - half, e.y - half, half * 2, half * 2);
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

  root.SZA = { COL, glowSprite, glow, makeBackground, drawBackground, STATION_STYLES, drawStation, ENEMY_STYLES, enemySprite, drawEnemy, ROT, drawCraft, craftSprite, TILE_COL, orbitPos };
})(typeof window !== 'undefined' ? window : globalThis);
