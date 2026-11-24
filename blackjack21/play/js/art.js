/* Every surface in the game is painted here on 2D canvases at load time:
   felt, table print, leather, card faces and backs, chips. No image files. */
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util;
  var A = BJ.art = {};

  var FONT_PRINT = '"Playfair Display", Georgia, "Times New Roman", serif';
  var FONT_INDEX = '"Oswald", "Arial Narrow", Arial, sans-serif';
  var FONT_NUM = '"Archivo Black", "Arial Black", Arial, sans-serif';
  A.fonts = ['900 40px "Playfair Display"', 'italic 600 40px "Playfair Display"', '600 40px "Oswald"', '40px "Archivo Black"'];

  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function grain(g, w, h, amount) {
    var img = g.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * amount;
      d[i] = U.clamp(d[i] + n, 0, 255); d[i + 1] = U.clamp(d[i + 1] + n, 0, 255); d[i + 2] = U.clamp(d[i + 2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);
  }

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }

  /* ---------- Felt: a neutral, tileable nap. The material colour tints it. ---------- */
  A.felt = function () {
    var S = 512, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, S, S);
    grain(g, S, S, 74);
    for (var i = 0; i < 16000; i++) {
      var x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 6;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.17)' : 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.6 + Math.random() * 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  };

  /* ---------- Leather for the padded rail ---------- */
  A.leather = function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, S, S);
    for (var i = 0; i < 2600; i++) {
      var x = Math.random() * S, y = Math.random() * S, r = 1.5 + Math.random() * 3.5;
      g.fillStyle = Math.random() < 0.55 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)';
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
    grain(g, S, S, 18);
    return c;
  };

  /* ---------- Table print (a transparent layer that sits on the felt) ---------- */
  var PX = 32, X0 = -24, Z0 = -42;       // 32 px per cm; covers x -24..24, z -42..30
  A.PRINT = { w: 48, h: 72, cx: 0, cz: -6 };

  function arcText(g, text, cx, cy, r, font, spacing) {
    g.save();
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    var ws = [], total = 0, i;
    for (i = 0; i < text.length; i++) { var w = g.measureText(text[i]).width + spacing; ws.push(w); total += w; }
    var a = Math.PI / 2 + (total / 2) / r;
    for (i = 0; i < text.length; i++) {
      a -= (ws[i] / 2) / r;
      g.save();
      g.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
      g.rotate(a - Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
      a -= (ws[i] / 2) / r;
    }
    g.restore();
  }

  A.print = function (theme) {
    var W = 48 * PX, H = 72 * PX, c = cv(W, H), g = c.getContext('2d');
    function px(x) { return (x - X0) * PX; }
    function pz(z) { return (z - Z0) * PX; }
    var ink = theme.ink;

    // No baked vignette: the cloth is one even colour out to the rail, like one big table top.
    for (var m = 0; m < 70; m++) {
      var mx = Math.random() * W, my = Math.random() * H, mr = (3 + Math.random() * 7) * PX;
      var mg = g.createRadialGradient(mx, my, 0, mx, my, mr), tone = Math.random() < 0.5 ? '255,255,255' : '0,0,0';
      mg.addColorStop(0, 'rgba(' + tone + ',0.035)'); mg.addColorStop(1, 'rgba(' + tone + ',0)');
      g.fillStyle = mg; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }

    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';

    // Layout border, following the player's side of the table.
    g.globalAlpha = 0.85;
    g.lineWidth = 0.2 * PX; g.beginPath(); g.arc(px(0), pz(-25), 51.9 * PX, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.06 * PX; g.beginPath(); g.arc(px(0), pz(-25), 51.2 * PX, 0, Math.PI * 2); g.stroke();

    // Dealer's card boxes.
    g.globalAlpha = 0.5; g.lineWidth = 0.09 * PX;
    [-4.35, 4.35].forEach(function (x) {
      rrect(g, px(x - 3.97), pz(-17 - 5.55), 7.94 * PX, 11.1 * PX, 0.62 * PX); g.stroke();
    });

    // House rule, on an arc.
    g.globalAlpha = 0.86;
    var ccx = px(0), ccy = pz(-52);
    arcText(g, 'Dealer must draw to 16 and stand on all 17s', ccx, ccy, 43.2 * PX, 'italic 600 ' + (1.22 * PX) + 'px ' + FONT_PRINT, 0.05 * PX);

    // Payout ribbon.
    var r0 = 45.75 * PX, r1 = 49.05 * PX, span = 0.318, a0 = Math.PI / 2 - span, a1 = Math.PI / 2 + span, notch = 0.02;
    g.beginPath();
    g.arc(ccx, ccy, r1, a0, a1);
    g.lineTo(ccx + (r0 + r1) / 2 * Math.cos(a1 - notch), ccy + (r0 + r1) / 2 * Math.sin(a1 - notch));
    g.arc(ccx, ccy, r0, a1, a0, true);
    g.lineTo(ccx + (r0 + r1) / 2 * Math.cos(a0 + notch), ccy + (r0 + r1) / 2 * Math.sin(a0 + notch));
    g.closePath();
    g.globalAlpha = 0.07; g.fill();
    g.globalAlpha = 0.86; g.lineWidth = 0.14 * PX; g.stroke();
    arcText(g, 'BLACKJACK PAYS 3 TO 2', ccx, ccy, 47.98 * PX, '900 ' + (1.62 * PX) + 'px ' + FONT_PRINT, 0.17 * PX);

    // Betting box.
    drawBox(g, px(0), pz(17.6));

    // Ink does not sit evenly on a napped cloth: wear tiny holes into everything.
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 60000; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.12 + Math.random() * 0.28) + ')';
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.2, 1 + Math.random() * 2.2);
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  /* ---------- Cards ---------- */
  var CWp = 360, CHp = 504;
  var RED = '#c21f2b', BLACK = '#17171b';

  function suitPath(g, s, size) {
    var r = size / 2;
    g.beginPath();
    if (s === 'H') {
      g.moveTo(0, r * 0.92);
      g.bezierCurveTo(-r * 1.3, r * 0.02, -r * 0.86, -r * 1.02, 0, -r * 0.4);
      g.bezierCurveTo(r * 0.86, -r * 1.02, r * 1.3, r * 0.02, 0, r * 0.92);
    } else if (s === 'D') {
      g.moveTo(0, -r);
      g.quadraticCurveTo(r * 0.34, -r * 0.36, r * 0.8, 0);
      g.quadraticCurveTo(r * 0.34, r * 0.36, 0, r);
      g.quadraticCurveTo(-r * 0.34, r * 0.36, -r * 0.8, 0);
      g.quadraticCurveTo(-r * 0.34, -r * 0.36, 0, -r);
    } else if (s === 'S') {
      g.moveTo(0, -r * 0.96);
      g.bezierCurveTo(r * 0.5, -r * 0.42, r * 0.98, -r * 0.05, r * 0.98, r * 0.3);
      g.bezierCurveTo(r * 0.98, r * 0.78, r * 0.34, r * 0.8, r * 0.1, r * 0.4);
      g.lineTo(r * 0.34, r * 0.96); g.lineTo(-r * 0.34, r * 0.96); g.lineTo(-r * 0.1, r * 0.4);
      g.bezierCurveTo(-r * 0.34, r * 0.8, -r * 0.98, r * 0.78, -r * 0.98, r * 0.3);
      g.bezierCurveTo(-r * 0.98, -r * 0.05, -r * 0.5, -r * 0.42, 0, -r * 0.96);
    } else {
      var cr = r * 0.42;
      g.moveTo(cr, -r * 0.46); g.arc(0, -r * 0.46, cr, 0, Math.PI * 2);
      g.moveTo(-r * 0.5 + cr, r * 0.16); g.arc(-r * 0.5, r * 0.16, cr, 0, Math.PI * 2);
      g.moveTo(r * 0.5 + cr, r * 0.16); g.arc(r * 0.5, r * 0.16, cr, 0, Math.PI * 2);
      g.moveTo(r * 0.16, -r * 0.1); g.arc(0, -r * 0.02, r * 0.26, 0, Math.PI * 2);
      g.moveTo(-r * 0.08, r * 0.1); g.lineTo(-r * 0.3, r * 0.96); g.lineTo(r * 0.3, r * 0.96); g.lineTo(r * 0.08, r * 0.1);
    }
    g.closePath();
  }
  A.suitPath = suitPath;

  function pip(g, s, x, y, size, flip) {
    g.save(); g.translate(x, y); if (flip) g.rotate(Math.PI);
    suitPath(g, s, size); g.fill(); g.restore();
  }

  // Jumbo index: on a phone the corner is what you actually read.
  function corner(g, card) {
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '600 108px ' + FONT_INDEX;
    g.save(); g.translate(52, 106); if (card.rank === '10') g.scale(0.7, 1); g.fillText(card.rank, 0, 0); g.restore();
    pip(g, card.suit, 52, 152, 54, false);
    g.restore();
  }

  var L = 0.37, C = 0.5, R = 0.63, T = 0.21, B = 0.79, M = 0.5, T2 = 0.403, B2 = 0.597;
  var PIPS = {
    '2': [[C, T], [C, B]],
    '3': [[C, T], [C, M], [C, B]],
    '4': [[L, T], [R, T], [L, B], [R, B]],
    '5': [[L, T], [R, T], [C, M], [L, B], [R, B]],
    '6': [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]],
    '7': [[L, T], [R, T], [C, 0.355], [L, M], [R, M], [L, B], [R, B]],
    '8': [[L, T], [R, T], [C, 0.355], [L, M], [R, M], [C, 0.645], [L, B], [R, B]],
    '9': [[L, T], [R, T], [L, T2], [R, T2], [C, M], [L, B2], [R, B2], [L, B], [R, B]],
    '10': [[L, T], [R, T], [C, 0.3], [L, T2], [R, T2], [L, B2], [R, B2], [C, 0.7], [L, B], [R, B]]
  };

  function court(g, card, colour) {
    var x0 = 100, y0 = 60, w = CWp - 200, h = CHp - 120;
    var tones = { J: ['#2b56a8', '#e3b53c'], Q: ['#b3243a', '#e3b53c'], K: ['#1f7a5a', '#e3b53c'] }[card.rank];
    function half() {
      g.save();
      g.beginPath(); g.rect(x0, y0, w, h / 2); g.clip();
      g.fillStyle = '#f4ecd2'; g.fillRect(x0, y0, w, h / 2);
      // sash
      g.save(); g.translate(CWp / 2, y0 + h / 2); g.rotate(-0.62);
      g.fillStyle = tones[0]; g.fillRect(-260, -150, 520, 74);
      g.fillStyle = tones[1]; g.fillRect(-260, -76, 520, 14); g.fillRect(-260, -164, 520, 14);
      g.restore();
      // crest
      g.fillStyle = tones[1];
      g.beginPath();
      var cxm = CWp / 2, cy = y0 + 30;
      if (card.rank === 'K') {
        g.moveTo(cxm - 44, cy + 26); g.lineTo(cxm - 44, cy - 6); g.lineTo(cxm - 22, cy + 10); g.lineTo(cxm, cy - 16);
        g.lineTo(cxm + 22, cy + 10); g.lineTo(cxm + 44, cy - 6); g.lineTo(cxm + 44, cy + 26);
      } else if (card.rank === 'Q') {
        g.moveTo(cxm - 40, cy + 26); g.quadraticCurveTo(cxm, cy - 30, cxm + 40, cy + 26);
        g.moveTo(cxm + 7, cy - 10); g.arc(cxm, cy - 10, 7, 0, Math.PI * 2);
      } else {
        g.moveTo(cxm - 36, cy + 26); g.lineTo(cxm - 36, cy + 6); g.lineTo(cxm + 36, cy - 8); g.lineTo(cxm + 36, cy + 26);
      }
      g.closePath(); g.fill();
      // letter
      g.font = '900 136px ' + FONT_PRINT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.lineWidth = 9; g.strokeStyle = '#f4ecd2'; g.strokeText(card.rank, CWp / 2, y0 + 172);
      g.fillStyle = colour; g.fillText(card.rank, CWp / 2, y0 + 172);
      g.restore();
    }
    half();
    g.save(); g.translate(CWp, CHp); g.rotate(Math.PI); half(); g.restore();
    g.fillStyle = tones[1]; g.fillRect(x0, CHp / 2 - 5, w, 10);
    g.lineWidth = 5; g.strokeStyle = colour; g.strokeRect(x0, y0, w, h);
    g.lineWidth = 2; g.strokeStyle = tones[1]; g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
  }

  var faceCache = {};
  A.cardFace = function (card) {
    var key = card.rank + card.suit;
    if (faceCache[key]) return faceCache[key];
    var c = cv(CWp, CHp), g = c.getContext('2d');
    var colour = (card.suit === 'H' || card.suit === 'D') ? RED : BLACK;
    var paper = g.createLinearGradient(0, 0, CWp, CHp);
    paper.addColorStop(0, '#fdfcf7'); paper.addColorStop(1, '#f3f0e6');
    g.fillStyle = paper; g.fillRect(0, 0, CWp, CHp);
    g.fillStyle = colour;
    corner(g, card);
    g.save(); g.translate(CWp, CHp); g.rotate(Math.PI); corner(g, card); g.restore();
    if (card.rank === 'A') {
      pip(g, card.suit, CWp / 2, CHp / 2, card.suit === 'S' ? 190 : 150, false);
      if (card.suit === 'S') {
        g.fillStyle = '#f6f3ea'; pip(g, 'S', CWp / 2, CHp / 2 - 6, 60, false);
      }
    } else if (PIPS[card.rank]) {
      PIPS[card.rank].forEach(function (p) { pip(g, card.suit, p[0] * CWp, p[1] * CHp, 62, p[1] > 0.5); });
    } else {
      court(g, card, colour);
    }
    g.strokeStyle = 'rgba(70,60,40,0.16)'; g.lineWidth = 5; rrect(g, 1, 1, CWp - 2, CHp - 2, 26); g.stroke();
    grain(g, CWp, CHp, 5);
    faceCache[key] = c;
    return c;
  };

  // One deck per lounge. Drawn images (set in A.backImages) win over the drawn-in-code fallback.
  // One deck per lounge: a plain body, a fine tone-on-tone lattice, a thin frame and a small mark. Kept quiet on purpose.
  A.BACKS = [
    { a: '#b3202b', b: '#84111b', line: 'rgba(255,226,208,0.34)', frame: '#fff0e2', emblem: 'D', step: 26 },   // alley   - classic red
    { a: '#22457c', b: '#132a4f', line: 'rgba(214,230,255,0.26)', frame: '#eaf1fb', emblem: 'S', step: 22 },   // harbor  - navy
    { a: '#1d6b4a', b: '#0e4230', line: 'rgba(236,214,150,0.26)', frame: '#e8cf88', emblem: 'H', step: 22 },   // garden  - emerald / gold
    { a: '#5b2c7c', b: '#371650', line: 'rgba(240,214,150,0.24)', frame: '#e6c477', emblem: 'S', step: 20 },   // grand   - plum / gold
    { a: '#f2ecdf', b: '#ddd3bb', line: 'rgba(20,40,90,0.20)', frame: '#1a2f63', emblem: 'K', step: 20 },     // royal   - ivory / navy
    { a: '#2e3641', b: '#171c23', line: 'rgba(222,230,240,0.18)', frame: '#c9d2dc', emblem: 'S', step: 18 },   // sky     - slate / silver
    { a: '#ece1c7', b: '#d2bf95', line: 'rgba(14,90,87,0.20)', frame: '#0e5a57', emblem: 'K', step: 20 },     // monte   - sand / teal
    { a: '#1a1410', b: '#0b0806', line: 'rgba(217,176,74,0.24)', frame: '#d9b04a', emblem: 'D', step: 18 },    // macau   - black / gold
    { a: '#1a121d', b: '#0b070d', line: 'rgba(232,176,162,0.22)', frame: '#e8b4a6', emblem: 'H', step: 18 },   // vegas   - black / rose gold
    { a: '#f5f5f7', b: '#d9dbe1', line: 'rgba(16,18,24,0.16)', frame: '#17181d', emblem: 'D', step: 16 },     // diamond - pearl / black
    { a: '#123b2f', b: '#0a241c', line: 'rgba(232,198,120,0.24)', frame: '#e6c47a', emblem: 'K', step: 16 }    // crown   - jade / gold
  ];
  A.backImages = [];
  var backCache = {};
  A.cardBack = function (index) {
    index = index || 0;
    var img = A.backImages[index];
    if (img && img.complete && img.naturalWidth) {
      var ci = cv(CWp, CHp), gi = ci.getContext('2d');
      gi.fillStyle = '#f8f6ee'; gi.fillRect(0, 0, CWp, CHp);
      gi.save(); rrect(gi, 8, 8, CWp - 16, CHp - 16, 22); gi.clip();
      gi.drawImage(img, 0, 0, CWp, CHp);
      gi.restore();
      grain(gi, CWp, CHp, 4);
      return ci;
    }
    if (backCache[index]) return backCache[index];
    var P = A.BACKS[index % A.BACKS.length];
    var c = cv(CWp, CHp), g = c.getContext('2d'), m = 9, i, j;      // thin white edge, so the back reads as big as a face
    g.fillStyle = '#f8f6ee'; g.fillRect(0, 0, CWp, CHp);
    var body = g.createLinearGradient(0, 0, CWp, CHp);
    body.addColorStop(0, P.a); body.addColorStop(1, P.b);
    g.save();
    rrect(g, m, m, CWp - m * 2, CHp - m * 2, 16); g.fillStyle = body; g.fill(); g.clip();
    g.strokeStyle = P.line; g.lineWidth = P.step >= 24 ? 2.2 : 1.5;
    for (i = -CHp; i < CWp + CHp; i += P.step) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + CHp, CHp); g.stroke();
      g.beginPath(); g.moveTo(i, CHp); g.lineTo(i + CHp, 0); g.stroke();
    }
    g.restore();
    g.strokeStyle = P.frame; g.globalAlpha = 0.9; g.lineWidth = 3;
    rrect(g, m + 14, m + 14, CWp - (m + 14) * 2, CHp - (m + 14) * 2, 10); g.stroke();
    if (index) { g.lineWidth = 1.2; rrect(g, m + 21, m + 21, CWp - (m + 21) * 2, CHp - (m + 21) * 2, 7); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = P.b; g.beginPath(); g.ellipse(CWp / 2, CHp / 2, 62, 86, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = P.frame; g.lineWidth = 3; g.stroke();
    g.fillStyle = P.frame;
    if (P.emblem === 'K') {          // crown
      g.beginPath(); var cx = CWp / 2, cy = CHp / 2;
      g.moveTo(cx - 36, cy + 22); g.lineTo(cx - 36, cy - 14); g.lineTo(cx - 18, cy + 4); g.lineTo(cx, cy - 26);
      g.lineTo(cx + 18, cy + 4); g.lineTo(cx + 36, cy - 14); g.lineTo(cx + 36, cy + 22); g.closePath(); g.fill();
    } else pip(g, P.emblem, CWp / 2, CHp / 2, 86, false);
    grain(g, CWp, CHp, 6);
    backCache[index] = c;
    return c;
  };

  // The money coin shown next to the balance: struck gold with a reeded rim and a spade.
  A.coinUrl = function () {
    var S = 128, c = cv(S, S), g = c.getContext('2d'), k;
    g.translate(S / 2, S / 2);
    var rim = g.createLinearGradient(-60, -60, 60, 60);
    rim.addColorStop(0, '#fff3b8'); rim.addColorStop(0.35, '#e0aa2e'); rim.addColorStop(0.7, '#9a6a10'); rim.addColorStop(1, '#f0c95a');
    g.fillStyle = rim; g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,55,0,0.55)'; g.lineWidth = 1.4;          // reeding
    for (k = 0; k < 72; k++) { var a = k * Math.PI / 36; g.beginPath(); g.moveTo(Math.cos(a) * 55, Math.sin(a) * 55); g.lineTo(Math.cos(a) * 62, Math.sin(a) * 62); g.stroke(); }
    var face = g.createRadialGradient(-16, -20, 4, 0, 0, 54);
    face.addColorStop(0, '#fff6c8'); face.addColorStop(0.45, '#f1c443'); face.addColorStop(1, '#b8841a');
    g.fillStyle = face; g.beginPath(); g.arc(0, 0, 52, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,80,5,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.stroke();
    for (k = 0; k < 24; k++) { var b = k * Math.PI / 12; g.fillStyle = 'rgba(120,80,5,0.6)'; g.beginPath(); g.arc(Math.cos(b) * 48, Math.sin(b) * 48, 1.6, 0, Math.PI * 2); g.fill(); }
    g.save(); g.translate(1.5, 2); g.fillStyle = 'rgba(100,62,0,0.55)'; suitPath(g, 'S', 48); g.fill(); g.restore();   // emboss shadow
    var sp = g.createLinearGradient(0, -24, 0, 24); sp.addColorStop(0, '#fff7d0'); sp.addColorStop(1, '#d9a42a');
    g.fillStyle = sp; suitPath(g, 'S', 48); g.fill();
    g.globalCompositeOperation = 'lighter';
    var hl = g.createLinearGradient(-50, -50, 20, 20); hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png');
  };


  // A betting spot like the player's, on its own transparent sheet so it can be turned for a side seat.
  // The betting box: the same pill for your seat (printed on the felt) and the side seats.
  var BOX = { w: 9.6, h: 4.5, r: 4.5 };
  function drawBox(g, cx, cz) {
    var bw = BOX.w * PX, bh = BOX.h * PX, r = BOX.r * PX, in1 = 0.55 * PX;
    g.globalAlpha = 0.86; g.lineWidth = 0.2 * PX;
    rrect(g, cx - bw, cz - bh, bw * 2, bh * 2, r); g.stroke();
    g.globalAlpha = 0.5; g.lineWidth = 0.06 * PX;
    rrect(g, cx - bw + in1, cz - bh + in1, bw * 2 - in1 * 2, bh * 2 - in1 * 2, r - in1); g.stroke();
    g.globalAlpha = 0.07; rrect(g, cx - bw, cz - bh, bw * 2, bh * 2, r); g.fill();
    g.globalAlpha = 1;
  }
  A.betSpot = function (ink) {
    var W = (BOX.w * 2 + 0.6) * PX, H = (BOX.h * 2 + 0.6) * PX, c = cv(W, H), g = c.getContext('2d');
    g.strokeStyle = ink; g.fillStyle = ink;
    drawBox(g, W / 2, H / 2);
    return c;
  };
  A.betSpotSize = { w: BOX.w * 2 + 0.6, h: BOX.h * 2 + 0.6 };

  // Old, dark wood: long grain, a few knots, worn lighter on the high spots. Tileable along the grain.
  A.wood = function () {
    var W = 512, H = 512, c = cv(W, H), g = c.getContext('2d'), i, y;
    g.fillStyle = '#3a2416'; g.fillRect(0, 0, W, H);
    for (y = 0; y < H; y += 1) {                       // grain: wavy bands across the width
      var w = Math.sin(y * 0.045) * 0.5 + Math.sin(y * 0.013 + 1.7) * 0.5;
      g.fillStyle = 'rgba(' + (w > 0 ? '90,58,34,' : '22,12,6,') + (Math.abs(w) * 0.35).toFixed(3) + ')';
      g.fillRect(0, y, W, 1);
    }
    for (i = 0; i < 420; i++) {                        // fine fibres
      var yy = Math.random() * H, len = 60 + Math.random() * 300, x0 = Math.random() * W;
      g.strokeStyle = Math.random() < 0.6 ? 'rgba(15,8,4,0.32)' : 'rgba(150,104,64,0.16)';
      g.lineWidth = 0.6 + Math.random() * 1.2;
      g.beginPath(); g.moveTo(x0, yy);
      g.bezierCurveTo(x0 + len / 3, yy + (Math.random() - 0.5) * 6, x0 + len * 2 / 3, yy + (Math.random() - 0.5) * 6, x0 + len, yy + (Math.random() - 0.5) * 4);
      g.stroke();
    }
    for (i = 0; i < 3; i++) {                          // knots
      var kx = Math.random() * W, ky = Math.random() * H;
      for (var r = 26; r > 2; r -= 3) {
        g.strokeStyle = 'rgba(' + (r % 6 ? '20,10,5' : '110,72,40') + ',0.4)'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(kx, ky, r * 1.9, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    grain(g, W, H, 22);
    var wear = g.createLinearGradient(0, 0, 0, H);      // worn patina
    wear.addColorStop(0, 'rgba(255,220,170,0.05)'); wear.addColorStop(0.5, 'rgba(0,0,0,0.12)'); wear.addColorStop(1, 'rgba(255,220,170,0.05)');
    g.fillStyle = wear; g.fillRect(0, 0, W, H);
    return c;
  };

  /* ---------- The room behind the table ----------
     One painted wall per lounge, seen far out of focus behind the dealer: a few shapes and lamps, then blurred
     and pushed dark so the table stays the brightest thing on screen. */
  var roomCache = {};
  function glow(g, x, y, r, color, a) {
    var rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a == null ? 1 : a; g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  }
  function vgrad(g, W, H, stops) {
    var lg = g.createLinearGradient(0, 0, 0, H);
    stops.forEach(function (st) { lg.addColorStop(st[0], st[1]); });
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
  }
  function seeded(n) { var x = n * 9301 + 49297; return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  var PAINT = [
    function alley(g, W, H, r) {             // old brick, one warm wall lamp, a dim red sign
      vgrad(g, W, H, [[0, '#120b09'], [0.6, '#2a1712'], [1, '#100a08']]);
      for (var y = 0, row = 0; y < H; y += 26, row++) for (var x = (row % 2) * -40; x < W; x += 80) {
        g.fillStyle = 'rgba(' + (70 + r() * 40 | 0) + ',' + (30 + r() * 16 | 0) + ',22,' + (0.35 + r() * 0.2) + ')';
        g.fillRect(x + 3, y + 3, 74, 20);
      }
      glow(g, W * 0.3, H * 0.42, 190, 'rgba(255,180,96,0.9)', 0.7); glow(g, W * 0.3, H * 0.42, 40, 'rgba(255,230,180,1)');
      g.strokeStyle = 'rgba(255,70,60,0.75)'; g.lineWidth = 7; g.lineJoin = 'round';
      g.strokeRect(W * 0.62, H * 0.3, 190, 70); glow(g, W * 0.62 + 95, H * 0.3 + 35, 210, 'rgba(255,60,50,0.5)', 0.8);
    },
    function harbor(g, W, H, r) {           // tall panes over the night water, harbour lights on the far shore
      vgrad(g, W, H, [[0, '#070b14'], [0.45, '#14294a'], [0.62, '#0c1a30'], [1, '#05080e']]);
      for (var i = 0; i < 70; i++) {
        var x = r() * W, c = r() < 0.6 ? 'rgba(255,200,120,1)' : 'rgba(170,210,255,1)';
        glow(g, x, H * 0.5 + r() * 10, 6 + r() * 8, c, 0.9);
        g.globalAlpha = 0.18; g.fillStyle = c; g.fillRect(x - 1.5, H * 0.53, 3, 40 + r() * 80); g.globalAlpha = 1;
      }
      g.fillStyle = '#05070b';
      for (var k = 0; k <= 6; k++) g.fillRect(k * W / 6 - 9, 0, 18, H);
      g.fillRect(0, H * 0.76, W, H * 0.24);
    },
    function garden(g, W, H, r) {           // a glasshouse at night: dark leaves, lanterns, a few roses
      vgrad(g, W, H, [[0, '#06100b'], [0.5, '#0f2a1c'], [1, '#050a07']]);
      g.strokeStyle = 'rgba(160,190,170,0.16)'; g.lineWidth = 6;
      for (var k = 0; k < 6; k++) { var x0 = k * W / 5; g.beginPath(); g.moveTo(x0 - 80, H); g.lineTo(x0 - 80, H * 0.3); g.arc(x0, H * 0.3, 80, Math.PI, 0); g.lineTo(x0 + 80, H); g.stroke(); }
      for (var i = 0; i < 40; i++) glow(g, r() * W, H * (0.45 + r() * 0.5), 40 + r() * 80, 'rgba(10,40,24,1)', 0.9);
      for (i = 0; i < 5; i++) { var lx = W * (0.1 + i * 0.2); glow(g, lx, H * 0.36, 120, 'rgba(255,196,120,0.8)', 0.6); glow(g, lx, H * 0.36, 16, 'rgba(255,236,200,1)'); }
      for (i = 0; i < 26; i++) glow(g, r() * W, H * (0.55 + r() * 0.3), 8 + r() * 10, 'rgba(230,90,120,1)', 0.75);
    },
    function grand(g, W, H, r) {            // columns, sconces, a chandelier high in the middle
      vgrad(g, W, H, [[0, '#0d0812'], [0.55, '#2a1636'], [1, '#0b0710']]);
      for (var k = 0; k < 5; k++) {
        var x = W * (0.1 + k * 0.2), cg = g.createLinearGradient(x - 34, 0, x + 34, 0);
        cg.addColorStop(0, 'rgba(0,0,0,0.6)'); cg.addColorStop(0.5, 'rgba(120,90,110,0.35)'); cg.addColorStop(1, 'rgba(0,0,0,0.6)');
        g.fillStyle = cg; g.fillRect(x - 34, 0, 68, H);
        if (k < 4) { glow(g, x + W * 0.1, H * 0.42, 110, 'rgba(255,190,110,0.85)', 0.6); glow(g, x + W * 0.1, H * 0.42, 14, 'rgba(255,240,210,1)'); }
      }
      glow(g, W * 0.5, H * 0.08, 260, 'rgba(255,214,150,0.7)', 0.8);
      for (var i = 0; i < 40; i++) glow(g, W * 0.5 + (r() - 0.5) * 300, H * (0.02 + r() * 0.16), 6 + r() * 6, 'rgba(255,240,210,1)', 0.9);
    },
    function royal(g, W, H, r) {            // navy panelled wall with gilt frames and candelabra
      vgrad(g, W, H, [[0, '#060a16'], [0.5, '#14244a'], [1, '#050814']]);
      g.strokeStyle = 'rgba(210,170,90,0.45)'; g.lineWidth = 5;
      for (var k = 0; k < 4; k++) { var x = W * (0.05 + k * 0.25); g.strokeRect(x, H * 0.18, W * 0.17, H * 0.5); g.lineWidth = 2; g.strokeRect(x + 14, H * 0.18 + 14, W * 0.17 - 28, H * 0.5 - 28); g.lineWidth = 5; }
      for (k = 0; k < 3; k++) { var cx = W * (0.25 + k * 0.25); glow(g, cx, H * 0.55, 150, 'rgba(255,196,120,0.8)', 0.55); for (var j = -1; j <= 1; j++) glow(g, cx + j * 18, H * 0.53, 9, 'rgba(255,236,200,1)'); }
    },
    function sky(g, W, H, r) {              // a wall of glass over the city at night
      vgrad(g, W, H, [[0, '#04060c'], [0.5, '#101a30'], [0.7, '#1a2440'], [1, '#05070c']]);
      for (var x = 0; x < W;) {
        var bw = 30 + r() * 70, bh = H * (0.15 + r() * 0.45), top = H * 0.78 - bh;
        g.fillStyle = 'rgba(8,11,20,0.95)'; g.fillRect(x, top, bw, bh + H * 0.3);
        for (var wy = top + 6; wy < H * 0.78; wy += 9) for (var wx = x + 4; wx < x + bw - 4; wx += 8)
          if (r() < 0.35) { g.fillStyle = r() < 0.7 ? 'rgba(255,214,150,0.8)' : 'rgba(180,210,255,0.8)'; g.fillRect(wx, wy, 3, 4); }
        x += bw + 4;
      }
      g.fillStyle = '#030408';
      for (var k = 0; k <= 4; k++) g.fillRect(k * W / 4 - 7, 0, 14, H);
      g.fillRect(0, H * 0.8, W, H * 0.2);
    },
    function monte(g, W, H, r) {            // arched windows on a teal night, gilt ceiling light
      vgrad(g, W, H, [[0, '#2a1e0e'], [0.25, '#0c1e1e'], [1, '#050c0c']]);
      glow(g, W * 0.5, 0, 420, 'rgba(255,206,130,0.55)', 0.8);
      for (var k = 0; k < 4; k++) {
        var x = W * (0.13 + k * 0.25), w = 120;
        g.fillStyle = 'rgba(20,70,80,0.75)';
        g.beginPath(); g.moveTo(x - w / 2, H * 0.8); g.lineTo(x - w / 2, H * 0.4); g.arc(x, H * 0.4, w / 2, Math.PI, 0); g.lineTo(x + w / 2, H * 0.8); g.fill();
        g.strokeStyle = 'rgba(220,180,100,0.5)'; g.lineWidth = 6; g.stroke();
        glow(g, x + W * 0.125, H * 0.5, 90, 'rgba(255,200,120,0.8)', 0.5);
      }
    },
    function macau(g, W, H, r) {            // lacquer red and gold, rows of lanterns
      vgrad(g, W, H, [[0, '#120404'], [0.5, '#3a0b0b'], [1, '#0e0303']]);
      g.strokeStyle = 'rgba(220,170,70,0.35)'; g.lineWidth = 3;
      for (var y = H * 0.66; y < H; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (var row = 0; row < 2; row++) for (var k = 0; k < 7; k++) {
        var x = W * (0.07 + k * 0.143) + row * 40, y = H * (0.22 + row * 0.2), s = row ? 0.7 : 1;
        glow(g, x, y, 90 * s, 'rgba(255,90,50,0.8)', 0.55);
        g.fillStyle = 'rgba(230,60,40,0.95)'; g.beginPath(); g.ellipse(x, y, 22 * s, 28 * s, 0, 0, Math.PI * 2); g.fill();
        glow(g, x, y, 14 * s, 'rgba(255,220,150,1)');
      }
    },
    function vegas(g, W, H, r) {            // the slot floor far away: low rows of soft coloured lights
      vgrad(g, W, H, [[0, '#07040a'], [0.55, '#1c0c20'], [1, '#060308']]);
      var cs = ['rgba(255,80,170,1)', 'rgba(80,210,255,1)', 'rgba(255,190,80,1)', 'rgba(170,110,255,1)'];
      for (var row = 0; row < 3; row++) for (var x = 10; x < W; x += 34 + row * 8) {
        var y = H * (0.5 + row * 0.1), c = cs[(r() * 4) | 0];
        glow(g, x, y, 16 + row * 6, c, 0.6 - row * 0.1);
        g.globalAlpha = 0.5; g.fillStyle = c; g.fillRect(x - 7, y - 10, 14, 18); g.globalAlpha = 1;
      }
      glow(g, W * 0.5, H * 0.15, 360, 'rgba(255,120,200,0.35)', 0.8);
    },
    function diamond(g, W, H, r) {          // black marble, silver veins, cool downlights
      vgrad(g, W, H, [[0, '#050507'], [0.5, '#121318'], [1, '#040405']]);
      g.strokeStyle = 'rgba(200,210,225,0.16)'; g.lineWidth = 1.6;
      for (var i = 0; i < 14; i++) {
        var x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
        for (var k = 0; k < 6; k++) { x += 40 + r() * 80; y += (r() - 0.5) * 90; g.lineTo(x, y); }
        g.stroke();
      }
      for (var k2 = 0; k2 < 5; k2++) {
        var cx = W * (0.1 + k2 * 0.2), cone = g.createLinearGradient(0, 0, 0, H * 0.8);
        cone.addColorStop(0, 'rgba(220,232,255,0.35)'); cone.addColorStop(1, 'rgba(220,232,255,0)');
        g.fillStyle = cone; g.beginPath(); g.moveTo(cx - 10, 0); g.lineTo(cx + 10, 0); g.lineTo(cx + 90, H * 0.8); g.lineTo(cx - 90, H * 0.8); g.fill();
        glow(g, cx, 4, 40, 'rgba(240,246,255,1)');
      }
    },
    function crown(g, W, H, r) {             // a palace gallery: gilt arches, mirrors, candle chandeliers
      vgrad(g, W, H, [[0, '#1a1206'], [0.5, '#3a2a12'], [1, '#0e0a04']]);
      for (var k = 0; k < 5; k++) {
        var x = W * (0.1 + k * 0.2), w = 140;
        var mg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        mg.addColorStop(0, 'rgba(120,100,70,0.5)'); mg.addColorStop(0.5, 'rgba(230,210,170,0.35)'); mg.addColorStop(1, 'rgba(120,100,70,0.5)');
        g.fillStyle = mg; g.beginPath(); g.moveTo(x - w / 2, H * 0.85); g.lineTo(x - w / 2, H * 0.35); g.arc(x, H * 0.35, w / 2, Math.PI, 0); g.lineTo(x + w / 2, H * 0.85); g.fill();
        g.strokeStyle = 'rgba(240,200,110,0.7)'; g.lineWidth = 8; g.stroke();
      }
      for (k = 0; k < 3; k++) {
        var cx = W * (0.2 + k * 0.3); glow(g, cx, H * 0.14, 200, 'rgba(255,214,140,0.8)', 0.6);
        for (var i = 0; i < 14; i++) glow(g, cx + (r() - 0.5) * 150, H * (0.08 + r() * 0.12), 6, 'rgba(255,244,214,1)', 0.9);
      }
    }
  ];
  // Photographed rooms (img/room/<n>.jpg) replace the painted ones once they have loaded.
  A.roomPhotos = [];
  A.room = function (index) {
    index = index % PAINT.length;
    var photo = A.roomPhotos[index], key = index + (photo ? 'p' : '');
    if (roomCache[key]) return roomCache[key];
    var W = 1024, H = 512, src = cv(W, H), g = src.getContext('2d');
    if (photo) {                       // cover-fit the 16:9 photo into the 2:1 wall, keeping its lower-middle band
      // zoomed in a little, with the photo's middle (where the lamps and bars are) set where the camera sees the wall
      var iw = photo.naturalWidth, ih = photo.naturalHeight, sc = Math.max(W / iw, H / ih) * 1.3, dw = iw * sc, dh = ih * sc;
      g.drawImage(photo, (W - dw) / 2, H * 0.5 - dh * 0.36, dw, dh);
    } else PAINT[index](g, W, H, seeded(index + 3));
    var out = cv(W, H), o = out.getContext('2d');
    if ('filter' in o) { o.filter = 'blur(9px)'; o.drawImage(src, 0, 0); o.filter = 'none'; }
    else {                                                  // no canvas filters: blur by squeezing and stretching back
      var small = cv(W / 8, H / 8); small.getContext('2d').drawImage(src, 0, 0, W / 8, H / 8);
      o.imageSmoothingQuality = 'high'; o.drawImage(small, 0, 0, W, H);
    }
    var v = o.createRadialGradient(W / 2, H * 0.55, H * 0.2, W / 2, H * 0.55, W * 0.62);   // keep the edges in shadow
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    o.fillStyle = v; o.fillRect(0, 0, W, H);
    grain(o, W, H, 8);
    roomCache[key] = out;
    return out;
  };

  // Brushed metal: fine streaks along one direction, a little lighter and darker.
  A.brushed = function () {
    var W = 256, H = 256, c = cv(W, H), g = c.getContext('2d');
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H);
    for (var y = 0; y < H; y++) { var v = 200 + Math.random() * 55 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.55)'; g.fillRect(0, y, W, 1); }
    var sh = g.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.5, 'rgba(0,0,0,0.1)'); sh.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    return c;
  };

  /* ---------- Prop finishes: each a different material, not a recolour ---------- */
  var finCache = {};
  function once(key, fn) { return finCache[key] || (finCache[key] = fn()); }
  // Woven cane: strips running both ways, over and under.
  A.rattan = function () { return once('rattan', function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d'), n = 8, w = S / n, i, j;
    g.fillStyle = '#2a1a0c'; g.fillRect(0, 0, S, S);
    function strip(x, y, wd, ht, horiz) {
      var lg = horiz ? g.createLinearGradient(0, y, 0, y + ht) : g.createLinearGradient(x, 0, x + wd, 0);
      lg.addColorStop(0, '#8a6634'); lg.addColorStop(0.5, '#e2c28a'); lg.addColorStop(1, '#8a6634');
      g.fillStyle = lg; g.fillRect(x, y, wd, ht);
      g.strokeStyle = 'rgba(90,60,25,0.35)'; g.lineWidth = 1;
      for (var k = 0; k < 3; k++) { g.beginPath(); if (horiz) { var yy = y + ht * (0.3 + k * 0.2); g.moveTo(x, yy); g.lineTo(x + wd, yy); } else { var xx = x + wd * (0.3 + k * 0.2); g.moveTo(xx, y); g.lineTo(xx, y + ht); } g.stroke(); }
    }
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      var over = (i + j) % 2 === 0, x = i * w, y = j * w, p = w * 0.12;
      if (over) { strip(x + p, y, w - p * 2, w, false); strip(x, y + p, w, w - p * 2, true); }
      else { strip(x, y + p, w, w - p * 2, true); strip(x + p, y, w - p * 2, w, false); }
      var sh = g.createRadialGradient(x + w / 2, y + w / 2, w * 0.2, x + w / 2, y + w / 2, w * 0.75);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = sh; g.fillRect(x, y, w, w);
    }
    grain(g, S, S, 14); return c;
  }); };
  // Burl walnut: swirling figure around a few eyes, deep and glossy.
  A.burl = function () { return once('burl', function () {
    var S = 512, c = cv(S, S), g = c.getContext('2d'), k, r;
    g.fillStyle = '#4a2812'; g.fillRect(0, 0, S, S);
    for (k = 0; k < 16; k++) {
      var cx = Math.random() * S, cy = Math.random() * S, rot = Math.random() * 3, sq = 0.4 + Math.random() * 0.5;
      for (r = 4; r < 90; r += 3 + Math.random() * 3) {
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(20,8,2,0.28)' : 'rgba(170,110,60,0.18)'; g.lineWidth = 1 + Math.random() * 2;
        g.beginPath(); g.ellipse(cx, cy, r * (1 + Math.random() * 0.15), r * sq, rot + Math.random() * 0.2, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(15,6,2,0.6)'; g.beginPath(); g.arc(cx, cy, 3 + Math.random() * 4, 0, Math.PI * 2); g.fill();
    }
    grain(g, S, S, 16); return c;
  }); };
  // Tufted leather: diamond quilting with sunk buttons.
  A.tufted = function () { return once('tufted', function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d'), st = 64, i, j;
    g.drawImage(A.leather(), 0, 0);
    for (j = 0; j <= S / st; j++) for (i = 0; i <= S / st; i++) {
      var x = i * st, y = j * st;
      var pg = g.createRadialGradient(x + st / 2 - 8, y + st / 2 - 8, 2, x + st / 2, y + st / 2, st * 0.6);
      pg.addColorStop(0, 'rgba(255,255,255,0.22)'); pg.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = pg; g.beginPath(); g.moveTo(x + st / 2, y); g.lineTo(x + st, y + st / 2); g.lineTo(x + st / 2, y + st); g.lineTo(x, y + st / 2); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    for (i = -S; i <= S * 2; i += st) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke(); }
    for (j = 0; j <= S / st; j++) for (i = 0; i <= S / st; i++) {
      [[0, 0], [st / 2, st / 2]].forEach(function (o) {
        var bx = i * st + o[0], by = j * st + o[1], bg = g.createRadialGradient(bx - 1, by - 1, 0, bx, by, 5);
        bg.addColorStop(0, 'rgba(255,255,255,0.5)'); bg.addColorStop(0.5, 'rgba(60,60,60,0.8)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bg; g.beginPath(); g.arc(bx, by, 5, 0, Math.PI * 2); g.fill();
      });
    }
    return c;
  }); };
  // Carrara marble: white with soft grey veins and the odd thread of gold.
  A.marble = function () { return once('marble', function () {
    var S = 512, c = cv(S, S), g = c.getContext('2d'), k;
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, S, S);
    for (k = 0; k < 60; k++) { var cg = g.createRadialGradient(Math.random() * S, Math.random() * S, 0, Math.random() * S, Math.random() * S, 160); cg.addColorStop(0, 'rgba(200,198,192,0.18)'); cg.addColorStop(1, 'rgba(200,198,192,0)'); g.fillStyle = cg; g.fillRect(0, 0, S, S); }
    function vein(col, w, blur) {
      var x = Math.random() * S, y = -20, a = Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      g.strokeStyle = col; g.lineWidth = w; g.filter = blur ? 'blur(' + blur + 'px)' : 'none';
      g.beginPath(); g.moveTo(x, y);
      while (y < S + 20 && x > -40 && x < S + 40) { a += (Math.random() - 0.5) * 0.6; x += Math.cos(a) * 14; y += Math.abs(Math.sin(a)) * 14 + 2; g.lineTo(x, y); }
      g.stroke(); g.filter = 'none';
    }
    for (k = 0; k < 7; k++) vein('rgba(110,110,115,0.35)', 6, 4);
    for (k = 0; k < 10; k++) vein('rgba(90,90,96,0.5)', 1.4, 0);
    for (k = 0; k < 3; k++) vein('rgba(190,150,70,0.55)', 1.2, 0);
    grain(g, S, S, 6); return c;
  }); };
  // Hammered gold: overlapping dimples, each catching the light on one side.
  A.hammered = function () { return once('hammered', function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, S, S);
    for (var k = 0; k < 420; k++) {
      var x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 9;
      [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]].forEach(function (o) {
        var dg = g.createRadialGradient(x + o[0] - r * 0.35, y + o[1] - r * 0.35, 0, x + o[0], y + o[1], r);
        dg.addColorStop(0, 'rgba(255,255,255,0.35)'); dg.addColorStop(0.6, 'rgba(170,170,170,0.1)'); dg.addColorStop(1, 'rgba(60,60,60,0.3)');
        g.fillStyle = dg; g.beginPath(); g.arc(x + o[0], y + o[1], r, 0, Math.PI * 2); g.fill();
      });
    }
    return c;
  }); };
  // Carbon fibre: a tight 2x2 twill that flips light square by square.
  A.carbon = function () { return once('carbon', function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d'), n = 16, w = S / n;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var horiz = ((i + j) >> 1) % 2 === 0, lg = horiz ? g.createLinearGradient(0, j * w, 0, j * w + w) : g.createLinearGradient(i * w, 0, i * w + w, 0);
      lg.addColorStop(0, '#2a2c31'); lg.addColorStop(0.5, horiz ? '#5a5e66' : '#3e4148'); lg.addColorStop(1, '#2a2c31');
      g.fillStyle = lg; g.fillRect(i * w, j * w, w, w);
    }
    grain(g, S, S, 8); return c;
  }); };
  // Pearl lacquer: a soft shimmer, no figure.
  A.pearl = function () { return once('pearl', function () {
    var S = 256, c = cv(S, S), g = c.getContext('2d');
    var lg = g.createLinearGradient(0, 0, S, S);
    lg.addColorStop(0, '#f4f2ee'); lg.addColorStop(0.35, '#ece9f2'); lg.addColorStop(0.65, '#eef3f1'); lg.addColorStop(1, '#f6f1ea');
    g.fillStyle = lg; g.fillRect(0, 0, S, S); grain(g, S, S, 5); return c;
  }); };

  // The side of a pack: paper edges stacked up.
  A.cardEdges = function () {
    var c = cv(64, 128), g = c.getContext('2d');
    g.fillStyle = '#ece9df'; g.fillRect(0, 0, 64, 128);
    for (var y = 0; y < 128; y += 2) { g.fillStyle = 'rgba(60,50,40,' + (0.1 + Math.random() * 0.16) + ')'; g.fillRect(0, y, 64, 1); }
    return c;
  };

  /* ---------- Chips ---------- */
  var CHIP = {
    5:      { base: '#c8322b', insert: '#f4f0e4', inlay: '#f5f0e2', text: '#9e211b' },
    10:     { base: '#2759c4', insert: '#f4f0e4', inlay: '#f1efe6', text: '#1b3f96' },
    50:     { base: '#e07a1c', insert: '#f4f0e4', inlay: '#fbf3e2', text: '#a8520a' },
    100:    { base: '#1d1d21', insert: '#d9b24a', inlay: '#efe8d2', text: '#1d1d21' },
    500:    { base: '#6a2fa6', insert: '#f4f0e4', inlay: '#f3ecf8', text: '#4f1f82' },
    1000:   { base: '#d6a11c', insert: '#2a2520', inlay: '#fff5d2', text: '#7d5a00' },
    5000:   { base: '#c2185b', insert: '#f4f0e4', inlay: '#fdeef3', text: '#8f0f41' },
    10000:  { base: '#0f7d68', insert: '#f0d58a', inlay: '#ecf7f2', text: '#085a4a' },
    50000:  { base: '#5a3a2a', insert: '#e8c77a', inlay: '#f4e8d2', text: '#4a2d1f' },
    100000: { base: '#8fa3ad', insert: '#1f2a30', inlay: '#f2f6f7', text: '#33434c' },
    500000: { base: '#5a1f30', insert: '#e4c35a', inlay: '#f3e6c8', text: '#5a1f30' },
    1000000: { base: '#f2f2f4', insert: '#c9a14a', inlay: '#1a1a1e', text: '#f2d27a' },
    5000000: { base: '#2a7fd4', insert: '#f4f0e4', inlay: '#f0f6ff', text: '#0f3d73' },
    10000000: { base: '#12405e', insert: '#e4c35a', inlay: '#f6efdc', text: '#12405e' }
  };
  A.chipStyle = function (d) { return CHIP[d] || CHIP[100]; };

  // Every lounge prints its own name around the inlay of its chips.
  A.house = '';
  var chipFaceCache = {}, chipEdgeCache = {};
  A.chipFace = function (denom) {
    var ck = denom + '|' + A.house;
    if (chipFaceCache[ck]) return chipFaceCache[ck];
    var st = A.chipStyle(denom), c = cv(256, 256), g = c.getContext('2d'), k;
    g.translate(128, 128);
    g.fillStyle = st.base; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = st.insert;
    for (k = 0; k < 8; k++) {
      var a = k * Math.PI / 4;
      g.beginPath(); g.arc(0, 0, 128, a - 0.19, a + 0.19); g.arc(0, 0, 98, a + 0.19, a - 0.19, true); g.closePath(); g.fill();
      g.beginPath(); g.arc(Math.cos(a + Math.PI / 8) * 112, Math.sin(a + Math.PI / 8) * 112, 5.5, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = st.insert; g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, 94, 0, Math.PI * 2); g.stroke();
    var inl = g.createRadialGradient(-18, -22, 6, 0, 0, 84);
    inl.addColorStop(0, '#ffffff'); inl.addColorStop(0.25, st.inlay); inl.addColorStop(1, st.inlay);
    g.fillStyle = inl; g.beginPath(); g.arc(0, 0, 84, 0, Math.PI * 2); g.fill();
    g.strokeStyle = st.text; g.globalAlpha = 0.55; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 76, 0, Math.PI * 2); g.stroke();
    if (A.house) {
      g.fillStyle = st.text; g.globalAlpha = 0.62; g.font = '700 11px ' + FONT_NUM; g.textAlign = 'center'; g.textBaseline = 'middle';
      var word = A.house.toUpperCase().split('').join(' ');
      [-Math.PI / 2, Math.PI / 2].forEach(function (mid, side) {
        var n = word.length, span = Math.min(2.0, n * 0.105), a0 = mid - span / 2;
        for (var q = 0; q < n; q++) {
          var ang = side ? mid + span / 2 - (q + 0.5) * span / n : a0 + (q + 0.5) * span / n;
          g.save(); g.translate(Math.cos(ang) * 69, Math.sin(ang) * 69); g.rotate(side ? ang - Math.PI / 2 : ang + Math.PI / 2);
          g.fillText(word[q], 0, 0); g.restore();
        }
      });
    } else {
      for (k = 0; k < 36; k++) {
        var b = k * Math.PI / 18;
        g.beginPath(); g.moveTo(Math.cos(b) * 66, Math.sin(b) * 66); g.lineTo(Math.cos(b) * 72, Math.sin(b) * 72); g.stroke();
      }
    }
    g.globalAlpha = 1;
    var label = U.short(denom);
    g.fillStyle = st.text; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = (label.length <= 2 ? 70 : label.length === 3 ? 54 : 44) + 'px ' + FONT_NUM;
    g.fillText(label, 0, 5);
    var rim = g.createRadialGradient(0, 0, 96, 0, 0, 128);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.24)');
    g.fillStyle = rim; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    grain(g, 256, 256, 14);
    chipFaceCache[ck] = c;
    return c;
  };

  A.chipEdge = function (denom) {
    if (chipEdgeCache[denom]) return chipEdgeCache[denom];
    var st = A.chipStyle(denom), c = cv(512, 32), g = c.getContext('2d');
    g.fillStyle = st.base; g.fillRect(0, 0, 512, 32);
    g.fillStyle = st.insert;
    var hw = 0.19 / (Math.PI * 2) * 512;
    for (var k = 0; k <= 8; k++) g.fillRect(k * 64 - hw, 0, hw * 2, 32);
    var sh = g.createLinearGradient(0, 0, 0, 32);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)'); sh.addColorStop(0.22, 'rgba(0,0,0,0)');
    sh.addColorStop(0.78, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = sh; g.fillRect(0, 0, 512, 32);
    chipEdgeCache[denom] = c;
    return c;
  };

  /* ---------- Table limits placard ---------- */
  A.placard = function (title, lines) {
    var c = cv(384, 256), g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#f6e7a6'); bg.addColorStop(1, '#e2c869');
    g.fillStyle = bg; g.fillRect(0, 0, 384, 256);
    g.strokeStyle = '#5b4510'; g.lineWidth = 6; g.strokeRect(12, 12, 360, 232);
    g.fillStyle = '#3d2e08'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 40px ' + FONT_PRINT; g.fillText(title, 192, 62);
    g.fillRect(60, 94, 264, 3);
    g.font = '46px ' + FONT_NUM;
    lines.forEach(function (t, i) { g.fillText(t, 192, 142 + i * 58); });
    return c;
  };

  // The chip buttons in the HUD reuse the 3D chip face.
  A.chipUrl = function (denom) { return A.chipFace(denom).toDataURL('image/png'); };
})();
