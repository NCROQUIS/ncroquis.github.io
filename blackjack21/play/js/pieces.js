/* Things that move on the table: cards (dealt the way a dealer does it: pulled
   from the shoe, carried low across the felt, turned over onto the hand) and
   chips (thrown, bouncing, skidding and knocking into each other). */
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util, T3 = window.THREE, S = BJ.stage, anim = BJ.anim;

  /* =========================== Cards =========================== */
  var C = BJ.cards = { W: 7.94, H: 11.11, T: 0.05 };
  var cardGeo, edgeGeo, backMat, edgeMat, faceTex = {};

  function initCards() {
    var w = C.W, h = C.H, r = 0.62, sh = new T3.Shape();
    sh.moveTo(-w / 2 + r, -h / 2);
    sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    cardGeo = new T3.ShapeGeometry(sh, 6);
    var pos = cardGeo.attributes.position, uv = cardGeo.attributes.uv;
    for (var i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    uv.needsUpdate = true;
    edgeGeo = new T3.ExtrudeGeometry(sh, { depth: C.T, bevelEnabled: false, curveSegments: 6 });
    backMat = S.backMat(new T3.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.28, envMapIntensity: 0.7 }));
    edgeMat = new T3.MeshStandardMaterial({ color: S.col('#e9e6dc'), roughness: 0.8 });
  }

  function Card(card) {
    if (!cardGeo) initCards();
    var key = card.rank + card.suit;
    if (!faceTex[key]) faceTex[key] = S.tex(BJ.art.cardFace(card));
    this.card = card;
    this.mat = new T3.MeshPhysicalMaterial({ map: faceTex[key], roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.28, envMapIntensity: 0.7 });
    var front = new T3.Mesh(cardGeo, this.mat); front.rotation.x = -Math.PI / 2; front.position.y = C.T / 2 + 0.004;
    var back = new T3.Mesh(cardGeo, backMat); back.rotation.x = Math.PI / 2; back.position.y = -(C.T / 2 + 0.004);
    var edge = new T3.Mesh(edgeGeo, edgeMat); edge.rotation.x = -Math.PI / 2; edge.position.y = -C.T / 2;
    front.castShadow = back.castShadow = true; front.receiveShadow = back.receiveShadow = true;
    this.root = new T3.Group(); this.pitch = new T3.Group(); this.roll = new T3.Group();
    this.root.add(this.pitch); this.pitch.add(this.roll); this.roll.add(front, back, edge);
    this.roll.rotation.z = Math.PI;          // face down
    this.faceUp = false;
    S.scene.add(this.root);
  }
  Card.prototype.remove = function () { S.scene.remove(this.root); this.mat.dispose(); };

  C.make = function (card) { return new Card(card); };
  // A face-down card whose face isn't known yet (an online dealer's hole card) gets its real face when it's turned.
  C.setFace = function (c, card) {
    var key = card.rank + card.suit;
    if (!faceTex[key]) faceTex[key] = S.tex(BJ.art.cardFace(card));
    c.mat.map = faceTex[key]; c.mat.needsUpdate = true; c.card = card;
  };

  function angLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // Deal one card from the shoe to `tg` = {x, y, z, yaw, faceUp}.
  C.deal = function (c, tg) {
    var sh = S.shoe, root = c.root;
    var lx = Math.cos(tg.yaw), lz = -Math.sin(tg.yaw);                  // card's own right-hand direction
    var gx = tg.x + (tg.faceUp ? lx * C.W : 0), gz = tg.z + (tg.faceUp ? lz * C.W : 0);
    var hover = tg.y + 0.75;

    // 1) Slide out of the shoe along its slope.
    root.position.set(sh.ix, sh.iy, sh.iz);
    root.rotation.y = sh.yaw; c.pitch.rotation.x = sh.pitch; c.roll.rotation.z = Math.PI;
    root.scale.setScalar(S.HELD);
    BJ.audio.cardSlide();
    var pOut = sh.pitchOut || 0;
    return anim.tween(0.13, function (e) {
      root.position.set(U.lerp(sh.ix, sh.x, e), U.lerp(sh.iy, sh.y, e), U.lerp(sh.iz, sh.z, e));
      c.pitch.rotation.x = U.lerp(sh.pitch, pOut, e);
    }, U.inOutSine).then(function () {
      // 2) Carry it low over the felt on a slightly bowed path, squaring it up on the way.
      var dx = gx - sh.x, dz = gz - sh.z, dist = Math.sqrt(dx * dx + dz * dz);
      var bow = dist * 0.12, cx = (sh.x + gx) / 2 - (dz / dist) * bow, cz = (sh.z + gz) / 2 + (dx / dist) * bow;
      return anim.tween(0.2 + dist * 0.0042, function (e) {
        var a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, d = e * e;
        root.position.set(a * sh.x + b * cx + d * gx, U.lerp(sh.y, hover, e) + Math.sin(Math.PI * e) * 0.9, a * sh.z + b * cz + d * gz);
        root.rotation.y = angLerp(sh.yaw, tg.yaw, U.outCubic(e));
        c.pitch.rotation.x = pOut * (1 - Math.min(1, e * 2.2));
        root.scale.setScalar(U.lerp(S.HELD, 1, Math.min(1, e * 1.6)));
      }, U.outCubic);
    }).then(function () {
      if (!tg.faceUp) {
        return anim.tween(0.07, function (e) { root.position.y = U.lerp(hover, tg.y, e); }, U.outCubic);
      }
      // 3) Turn it over like a page: the left edge stays down, the card lands one width to the left.
      var px = tg.x + lx * C.W / 2, pz = tg.z + lz * C.W / 2;
      BJ.audio.cardFlip();
      return anim.tween(0.19, function (e) {
        var phi = Math.PI * e, r = C.W / 2;
        root.position.set(px + lx * r * Math.cos(phi), tg.y + r * Math.sin(phi) + 0.75 * (1 - e), pz + lz * r * Math.cos(phi));
        c.roll.rotation.z = Math.PI + phi;
      }, U.inOutSine).then(function () { c.roll.rotation.z = 0; c.faceUp = true; });
    }).then(function () {
      root.position.set(tg.x, tg.y, tg.z);
      BJ.audio.cardLand();
    });
  };

  // Turn a face-down card over where it lies (dealer's hole card).
  C.reveal = function (c) {
    var y0 = c.root.position.y;
    BJ.audio.cardFlip();
    return anim.tween(0.28, function (e) {
      var phi = Math.PI * e;
      c.roll.rotation.z = Math.PI + phi;
      c.root.position.y = y0 + Math.sin(phi) * (C.W / 2 + 0.3);
    }, U.inOutSine).then(function () { c.roll.rotation.z = 0; c.faceUp = true; c.root.position.y = y0; BJ.audio.cardLand(); });
  };

  // The dealer lifts the far edge of the hole card to check for blackjack.
  C.peek = function (c) {
    var y0 = c.root.position.y;
    return anim.tween(0.46, function (e) {
      var k = Math.sin(Math.PI * e);
      c.pitch.rotation.x = 0.3 * k;
      c.root.position.y = y0 + 1.75 * k;
    }, U.linear).then(function () { c.pitch.rotation.x = 0; c.root.position.y = y0; });
  };

  C.moveTo = function (c, tg, seconds) {
    var p = c.root.position, x0 = p.x, y0 = p.y, z0 = p.z, yaw0 = c.root.rotation.y;
    return anim.tween(seconds || 0.2, function (e) {
      p.set(U.lerp(x0, tg.x, e), U.lerp(y0, tg.y, e), U.lerp(z0, tg.z, e));
      if (tg.yaw !== undefined) c.root.rotation.y = angLerp(yaw0, tg.yaw, e);
    }, U.outCubic);
  };

  // Sweep used cards into the discard rack, turning them face down on the way.
  C.collect = function (list) {
    var D = S.discard, jobs = [];
    list.forEach(function (c, i) {
      var p = c.root.position, x0 = p.x, y0 = p.y, z0 = p.z, yaw0 = c.root.rotation.y, roll0 = c.roll.rotation.z;
      jobs.push(anim.wait(i * 0.035).then(function () {
        if (i % 2 === 0) BJ.audio.cardSlide();
        return anim.tween(0.36, function (e) {
          p.set(U.lerp(x0, D.x, e), U.lerp(y0, D.y + 0.3, e) + Math.sin(Math.PI * e) * 3.2, U.lerp(z0, D.z, e));
          c.root.rotation.y = angLerp(yaw0, D.yaw, e);
          c.roll.rotation.z = U.lerp(roll0, roll0 < Math.PI / 2 ? Math.PI : roll0, Math.min(1, e * 1.6));
          c.root.scale.setScalar(U.lerp(1, S.HELD, e));
        }, U.inOutCubic);
      }).then(function () { c.remove(); }));
    });
    return Promise.all(jobs).then(function () { if (list.length) S.addDiscards(list.length); });
  };

  /* =========================== Chips =========================== */
  var Ch = BJ.chips = { R: 2.3, T: 0.4 };
  var R = Ch.R, TH = Ch.T, G = 980, DIA = R * 2;
  // Invisible kerbs around the betting area: the padded rail below, the screen edges at the
  // sides, and KEEP_Z above so that no chip ends up lying on the player's cards.
  var RAIL_Z = 23.6, SIDE_X = 11.6, KEEP_Z = 13.4;
  var DEF_BOX = { x0: -SIDE_X, x1: SIDE_X, z0: KEEP_Z, z1: RAIL_Z };
  var chipGeo, chipMats = {}, chips = [], piles = {};
  var q1 = new T3.Quaternion(), q2 = new T3.Quaternion(), ax = new T3.Vector3(), UP = new T3.Vector3(0, 1, 0);

  function mats(denom) {
    if (chipMats[denom]) return chipMats[denom];
    var side = new T3.MeshStandardMaterial({ map: S.tex(BJ.art.chipEdge(denom)), roughness: 0.5, metalness: 0, envMapIntensity: 0.6 });
    var face = new T3.MeshStandardMaterial({ map: S.tex(BJ.art.chipFace(denom)), roughness: 0.56, metalness: 0, envMapIntensity: 0.6 });
    return (chipMats[denom] = [side, face, face]);
  }
  // A new lounge reprints the faces (its name goes round the inlay).
  Ch.retexture = function () {
    Object.keys(chipMats).forEach(function (d) {
      var face = chipMats[d][1];
      if (face.map) face.map.dispose();
      face.map = S.tex(BJ.art.chipFace(+d)); face.needsUpdate = true;
    });
  };

  function Chip(denom, pile) {
    if (!chipGeo) chipGeo = new T3.CylinderGeometry(R, R, TH, 40, 1);
    this.denom = denom; this.pile = pile;
    var pb = piles[pile] && piles[pile].box;          // side seats keep their chips in their own spot
    this.kb = pb || DEF_BOX;
    this.mesh = new T3.Mesh(chipGeo, mats(denom));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.random() * 6.28; this.yawV = 0;
    this.tilt = 0; this.tiltDir = 0; this.tiltV = 0;     // tumble while in the air
    this.wob = 0; this.wobPhase = 0;                     // coin wobble after landing
    this.lean = 0; this.leanDir = 0;                     // resting against another chip
    this.state = 'air'; this.bounces = 0;
    S.scene.add(this.mesh);
    chips.push(this);
  }
  function removeChip(c) {
    var i = chips.indexOf(c);
    if (i >= 0) chips.splice(i, 1);
    S.scene.remove(c.mesh);
  }

  Ch.setPile = function (id, x, z, box) {
    piles[id] = { x: x, z: z, box: box ? { x0: x - box, x1: x + box, z0: z - box, z1: z + box } : null };
  };
  // A chip tossed from somewhere other than the player's seat (a tablemate's hand at the side).
  Ch.betFrom = function (denom, pile, from) {
    var p = piles[pile], a = U.rand(0, 6.28), r = Math.sqrt(Math.random()) * 1.2;
    return Ch.throwChip(denom, pile, from, { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }, U.rand(0.3, 0.38));
  };
  Ch.pile = function (id) { return piles[id]; };
  Ch.count = function (id) { var n = 0; for (var i = 0; i < chips.length; i++) if (chips[i].pile === id) n++; return n; };

  // What is under chip c: a flat surface height, and possibly another chip's edge to lean on.
  function supportAt(c) {
    var h = 0, flatJ = null, leans = [], i, j, dx, dz, d;
    for (i = 0; i < chips.length; i++) {
      j = chips[i];
      if (j === c || j.state === 'air' || j.state === 'kin') continue;
      dx = j.x - c.x; dz = j.z - c.z; d = Math.sqrt(dx * dx + dz * dz);
      if (d >= DIA * 0.93) continue;
      if (j.y + TH * 0.4 > c.y) continue;                 // not underneath
      var top = j.y + TH / 2;
      if (d <= R) { if (top > h) { h = top; flatJ = j; } }
      else leans.push({ j: j, top: top, d: d, dir: Math.atan2(dz, dx) });
    }
    var lean = 0, leanDir = 0, leanJ = null;
    for (i = 0; i < leans.length; i++) {
      var L = leans[i];
      if (L.top > h + 0.05) {
        var th = Math.asin(Math.min(0.8, (L.top - h) / L.d));
        if (th > lean) { lean = th; leanDir = L.dir; leanJ = L.j; }
      }
    }
    return { h: h, lean: lean, leanDir: leanDir, flatJ: flatJ, leanJ: leanJ };
  }
  function restHeight(sup, tilt) { return sup.h + R * Math.sin(tilt) + (TH / 2) * Math.cos(tilt); }

  function wake(j) {
    if (j.state !== 'rest') return;
    j.state = 'slide';
    for (var i = 0; i < chips.length; i++) {
      var k = chips[i];
      if (k.state !== 'rest' || k.y <= j.y + TH * 0.3) continue;
      var dx = k.x - j.x, dz = k.z - j.z;
      if (dx * dx + dz * dz < DIA * DIA) wake(k);
    }
  }

  function step(c, h) {
    var sup, target, speed;
    if (c.state === 'air') {
      c.vy -= G * h;
      c.x += c.vx * h; c.y += c.vy * h; c.z += c.vz * h;
      c.yaw += c.yawV * h; c.tilt += c.tiltV * h;
      if (c.y < 3.2) {                                   // skimming low: the kerbs apply in the air too
        if (c.z < c.kb.z0 && c.vz <= 0) { c.z = c.kb.z0; c.vz = -c.vz * 0.35; }
        else if (c.z > c.kb.z1 && c.vz >= 0 && c.bounces > 0) { c.z = c.kb.z1; c.vz = -c.vz * 0.35; }
      }
      sup = supportAt(c);
      target = restHeight(sup, sup.lean);
      if (c.y <= target && c.vy < 0) {
        var impact = -c.vy, onChip = sup.flatJ || sup.leanJ;
        c.y = target;
        BJ.audio.chip(Math.min(1, impact / 220), !!onChip);
        if (onChip && !c.neat) {                        // knock the chip it landed on
          wake(onChip);
          onChip.vx += c.vx * 0.32; onChip.vz += c.vz * 0.32;
        }
        if (c.neat) {                                    // set down, not thrown: one small hop and no skid
          c.vx *= 0.12; c.vz *= 0.12;
          if (c.bounces < 1 && impact > 60) { c.vy = impact * 0.1; c.bounces++; }
          else { c.state = 'slide'; c.vy = 0; c.wob = Math.min(0.12, 0.03 + impact * 0.0004); c.wobPhase = c.tiltDir; c.tilt = 0; c.tiltV = 0; }
        } else if (impact > 55 && c.bounces < 3) {
          var hard = impact > 180, keep = hard ? 0.45 : 0.62;     // a lobbed chip thuds and mostly stops
          c.vy = impact * (onChip ? 0.34 : hard ? 0.17 : 0.22);
          c.vx *= keep; c.vz *= keep;
          c.tiltV = U.rand(-1, 1) * impact * 0.018;
          c.bounces++;
        } else {
          c.state = 'slide'; c.vy = 0;
          c.wob = Math.min(0.42, Math.abs(c.tilt) * 0.6 + impact * 0.0014 + 0.03);
          c.wobPhase = c.tiltDir; c.tilt = 0; c.tiltV = 0;
        }
      }
    } else if (c.state === 'slide') {
      if (c.neat) {                                      // ease onto the stack's centre
        var kk = Math.min(1, h * 14);
        c.x += (c.neat.x - c.x) * kk; c.z += (c.neat.z - c.z) * kk; c.vx *= 0.5; c.vz *= 0.5;
      }
      sup = supportAt(c);
      speed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
      if (speed > 0) {
        var ns = Math.max(0, speed - (sup.flatJ ? 0.5 : 0.82) * G * h);
        c.vx *= ns / speed; c.vz *= ns / speed; speed = ns;
        c.x += c.vx * h; c.z += c.vz * h;
      }
      c.yawV *= Math.exp(-7 * h); c.yaw += c.yawV * h;
      c.wob *= Math.exp(-7.5 * h);
      c.wobPhase += h * (12 + 46 * (1 - Math.min(1, c.wob / 0.42)));
      c.lean += (sup.lean - c.lean) * (1 - Math.exp(-22 * h));
      if (sup.lean > 0) c.leanDir = sup.leanDir;
      target = restHeight(sup, Math.max(c.lean, c.wob));
      if (c.y > target + 0.12) { c.state = 'air'; c.vy = 0; c.bounces = 2; }      // slid off an edge
      else c.y = target;
      collide(c);
      // Kerbs last, so that a shove from another chip cannot leave this one past them.
      var kb = c.kb;
      if (c.z > kb.z1) { c.z = kb.z1; if (c.vz > 0) c.vz = -c.vz * 0.3; }
      else if (c.z < kb.z0) { c.z = kb.z0; if (c.vz < 0) c.vz = -c.vz * 0.3; }
      if (c.x > kb.x1) { c.x = kb.x1; if (c.vx > 0) c.vx = -c.vx * 0.3; }
      else if (c.x < kb.x0) { c.x = kb.x0; if (c.vx < 0) c.vx = -c.vx * 0.3; }
      if (speed < 2.5 && c.wob < 0.012 && Math.abs(c.lean - sup.lean) < 0.012) {
        c.state = 'rest'; c.vx = c.vz = 0; c.wob = 0; c.lean = sup.lean; c.yawV = 0;
        c.y = restHeight(sup, c.lean);
      }
    }
  }

  // Chips on the same level bump like pucks.
  function collide(c) {
    for (var i = 0; i < chips.length; i++) {
      var j = chips[i];
      if (j === c || j.state === 'air' || j.state === 'kin') continue;
      if (c.neat && j.neat) continue;
      if (Math.abs(j.y - c.y) > TH * 0.7) continue;
      var dx = c.x - j.x, dz = c.z - j.z, d2 = dx * dx + dz * dz;
      if (d2 >= DIA * DIA || d2 < 1e-6) continue;
      var d = Math.sqrt(d2), nx = dx / d, nz = dz / d, overlap = DIA - d;
      var vn = (c.vx - j.vx) * nx + (c.vz - j.vz) * nz;
      if (j.state === 'rest' && vn < -6) wake(j);
      if (j.state === 'rest') { c.x += nx * overlap; c.z += nz * overlap; }
      else { c.x += nx * overlap / 2; c.z += nz * overlap / 2; j.x -= nx * overlap / 2; j.z -= nz * overlap / 2; }
      if (vn < 0) {
        if (j.state === 'rest') { c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz; }
        else {
          var J = -(1.55) * vn / 2;
          c.vx += J * nx; c.vz += J * nz; j.vx -= J * nx; j.vz -= J * nz;
          j.yawV += U.rand(-6, 6);
        }
        if (vn < -25) BJ.audio.chip(Math.min(1, -vn / 160), true);
      }
    }
  }

  function place(c) {
    var m = c.mesh, tx, tz;
    m.position.set(c.x, c.y, c.z);
    if (c.state === 'air') { tx = Math.cos(c.tiltDir) * c.tilt; tz = Math.sin(c.tiltDir) * c.tilt; }
    else { tx = Math.cos(c.leanDir) * c.lean + Math.cos(c.wobPhase) * c.wob; tz = Math.sin(c.leanDir) * c.lean + Math.sin(c.wobPhase) * c.wob; }
    var th = Math.sqrt(tx * tx + tz * tz);
    q1.setFromAxisAngle(UP, c.yaw);
    if (th > 1e-4) { ax.set(-tz / th, 0, tx / th); q2.setFromAxisAngle(ax, th); m.quaternion.multiplyQuaternions(q2, q1); }
    else m.quaternion.copy(q1);
  }

  Ch.update = function (dt) {
    var n = 3, h = dt / n, i, s;
    for (s = 0; s < n; s++) for (i = 0; i < chips.length; i++) step(chips[i], h);
    for (i = 0; i < chips.length; i++) place(chips[i]);
  };

  // Throw a chip from `from` so that it first touches the felt at `to` after `flight` seconds.
  Ch.throwChip = function (denom, pile, from, to, flight) {
    var c = new Chip(denom, pile);
    c.x = from.x; c.y = from.y; c.z = from.z;
    c.vx = (to.x - from.x) / flight; c.vz = (to.z - from.z) / flight;
    c.vy = (TH / 2 - from.y + 0.5 * G * flight * flight) / flight;
    c.yawV = U.rand(-16, 16);
    c.tilt = U.rand(0.05, 0.3); c.tiltDir = U.rand(0, 6.28); c.tiltV = U.rand(-2.4, 2.4);
    place(c);
    return c;
  };

  // The player tosses a chip into the betting box.
  // Where each chip value is stacked inside a betting spot. A wide spot has three stacks side by side;
  // the narrower spots of a split hand stack them in a small triangle.
  function stackSlot(pile, denom) {
    var p = piles[pile], vals = S.trayDenoms.length ? S.trayDenoms : [denom];
    var k = vals.indexOf(denom); if (k < 0) k = denom >= vals[vals.length - 1] ? vals.length - 1 : 0;
    var wide = Math.abs(p.x) < 1;
    var off = wide ? [[-4.9, 0], [0, 0], [4.9, 0]][k] : [[-1.3, -2.3], [1.3, -2.3], [0, 2.2]][k];
    return { x: p.x + off[0], z: p.z + off[1] };
  }

  // The player tosses a chip into the betting spot: it lands somewhere near the middle, hops, and skids a little.
  Ch.bet = function (denom, pile) {
    var p = piles[pile], from = { x: U.rand(-6, 6), y: U.rand(6, 9), z: 41 };
    var a = U.rand(0, 6.28), r = Math.sqrt(Math.random()) * (Math.abs(p.x) > 1 ? 1.4 : 2.2);
    // It skids forward after landing, so aim a little short of the spot.
    var to = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r + 3.0 };
    var c = Ch.throwChip(denom, pile, from, to, U.rand(0.25, 0.33));
    colorUp(pile);
    return c;
  };

  // The dealer pays: chips are lobbed from the float, down both sides of the hand, and come
  // down inside the betting box rather than skidding across the cards.
  Ch.pay = function (list, pile) {
    var p = piles[pile], jobs = [], wide = Math.abs(p.x) < 1;
    list.forEach(function (denom, i) {
      jobs.push(anim.wait(i * 0.05).then(function () {
        var side = i % 2 ? 1 : -1;
        var f = S.trayFront(denom); S.trayTake(denom);            // the chip really leaves the float
        var from = { x: f.x + U.rand(-0.5, 0.5), y: f.y + U.rand(1, 2.5), z: f.z + 0.5 };
        var to = { x: p.x + side * (wide ? U.rand(1.2, 5.4) : U.rand(0.4, 2.8)), z: p.z + U.rand(-4.1, -1.6) };
        Ch.throwChip(denom, pile, from, to, U.rand(0.44, 0.5));
      }));
    });
    return Promise.all(jobs).then(function () { return anim.wait(0.95); });
  };

  // Rake a pile off the table: to the dealer when lost, back to the player when won or returned.
  Ch.sweep = function (pile, toward) {
    var jobs = [], n = 0;
    chips.slice().forEach(function (c) {
      if (c.pile !== pile) return;
      c.state = 'kin'; c.pile = null;
      var x0 = c.x, z0 = c.z, y0 = c.y;
      var x1 = toward === 'dealer' ? x0 * 0.3 + U.rand(-2, 2) : x0 * 0.6 + U.rand(-2, 2);
      var z1 = toward === 'dealer' ? S.tray.z - 4 : 46;
      var spin = U.rand(-5, 5);
      jobs.push(anim.wait(n++ * 0.012).then(function () {
        return anim.tween(toward === 'dealer' ? 0.4 : 0.34, function (e) {
          c.x = U.lerp(x0, x1, e); c.z = U.lerp(z0, z1, e);
          // lift over the cards on the way to the dealer, over the padded rail on the way to the player
          c.y = toward === 'dealer' ? U.lerp(y0, Math.max(y0, 2.2), Math.min(1, e * 1.3)) : y0 + U.clamp((c.z - 21) / 7, 0, 1) * 4.6;
          c.yaw += spin * 0.016;
        }, U.inCubic);
      }).then(function () { removeChip(c); if (toward === 'dealer') S.trayGive(c.denom); }));
    });
    if (n) BJ.audio.chipRake(Math.min(n, 10));
    return Promise.all(jobs);
  };

  // Slide a pile sideways (when a hand is split).
  Ch.shift = function (pile, dx) {
    var jobs = [];
    chips.forEach(function (c) {
      if (c.pile !== pile) return;
      var x0 = c.x, st = c.state;
      c.state = 'kin';
      jobs.push(anim.tween(0.24, function (e) { c.x = x0 + dx * e; }, U.outCubic).then(function () { c.state = st === 'air' ? 'slide' : st; }));
    });
    return Promise.all(jobs);
  };

  Ch.retag = function (from, to) { chips.forEach(function (c) { if (c.pile === from) c.pile = to; }); };

  // A stack of small chips that gets tall is traded up: the top chips lift off together, fold into
  // one chip of the next value, and that chip is set on its own stack.
  function colorUp(pile) {
    var D = BJ.engine.DENOMS;
    for (var di = 0; di < D.length - 1; di++) {
      var need = D[di + 1] / D[di];
      if (need !== Math.round(need) || need > 10) continue;
      var same = chips.filter(function (c) { return c.pile === pile && c.denom === D[di] && c.state === 'rest'; });
      if (same.length < Math.max(14, need + 6)) continue;
      same.sort(function (a, b) { return b.y - a.y; });
      var take = same.slice(0, need), top = take[0], up = D[di + 1];
      take.forEach(function (c) { c.state = 'kin'; c.pile = null; });
      var y0 = take.map(function (c) { return c.y; });
      anim.tween(0.22, function (e) {
        take.forEach(function (c, i) { c.y = U.lerp(y0[i], top.y + 3.5, e); c.x = U.lerp(c.x, top.x, e * 0.5); c.z = U.lerp(c.z, top.z, e * 0.5); c.yaw += 0.2; });
      }, U.outCubic).then(function () {
        var x = top.x, z = top.z, y = top.y;
        take.forEach(removeChip);
        BJ.audio.chip(0.5, true);
        var p = piles[pile];
        Ch.throwChip(up, pile, { x: x, y: y, z: z }, { x: p.x + U.rand(-1.5, 1.5), z: p.z + U.rand(-1, 1) }, 0.24);
      });
      return;
    }
  }

  Ch.clearAll = function () { chips.slice().forEach(removeChip); };
  Ch.all = function () { return chips; };

  /* =========================== Decks and the opening shuffle ===========================
     In the lobby the sealed decks lie on the felt and the shoe is empty. Sitting down stacks them
     into two halves, riffles them together, squares the pack and lays it out into the shoe card by
     card. Leaving runs it backwards. Everything runs on the tween clock, so it can be fast-forwarded. */
  var Intro = BJ.intro = {};
  var deckGeo, deckMats, packs = [], DT = 0.9, GRID = { x: 1.2, z: -4.2 };

  function setHeight(m, h) { m.scale.y = Math.max(0.001, h); m.position.y = h / 2 + 0.02; m.visible = h > 0.03; }
  function deckMesh(h) {
    if (!deckGeo) {
      if (!cardGeo) initCards();
      deckGeo = new T3.BoxGeometry(C.W, 1, C.H);
      var paper = new T3.MeshStandardMaterial({ map: S.tex(BJ.art.cardEdges()), roughness: 0.75 });
      deckMats = [paper, paper, backMat, paper, paper, paper];
    }
    var m = new T3.Mesh(deckGeo, deckMats);
    m.castShadow = true; m.receiveShadow = true;
    setHeight(m, h);
    S.scene.add(m);
    return m;
  }
  // Where deck i lies when the decks are set out: two loose rows.
  function slot(i, decks) {
    var cols = Math.ceil(decks / 2), row = i < cols ? 0 : 1, col = i % cols;
    return { row: row, col: col, x: GRID.x + (col - (cols - 1) / 2) * 9.0 + U.rand(-0.4, 0.4), z: GRID.z + (row ? 6.2 : -6.2) + U.rand(-0.4, 0.4), yaw: U.rand(-0.14, 0.14) };
  }
  function clearDecks() { packs.forEach(function (pk) { S.scene.remove(pk.m); }); packs = []; }

  // Lobby state, set at once: empty shoe, decks on the felt.
  Intro.setOut = function (decks) {
    decks = decks || 6;
    clearDecks(); S.setShoe(false); S.resetDiscards();
    for (var i = 0; i < decks; i++) {
      var sl = slot(i, decks), m = deckMesh(DT);
      m.position.x = sl.x; m.position.z = sl.z; m.rotation.y = sl.yaw;
      packs.push({ m: m, row: sl.row, col: sl.col });
    }
  };

  // Leaving the table: the pack comes back out of the shoe onto the felt and is cut into the decks again.
  Intro.unload = function (decks) {
    decks = decks || 6;
    var full = DT * decks, from = { x: GRID.x, z: GRID.z, h: full };
    clearDecks(); S.resetDiscards();
    BJ.audio.cardSlide();
    return anim.tween(0.85, function (e) { S.packFlow(1 - e, from); }, U.linear).then(function () {
      S.setShoe(false);
      var jobs = [];
      for (var i = 0; i < decks; i++) (function (i) {
        var sl = slot(i, decks), m = deckMesh(DT), y0 = DT / 2 + 0.02 + (decks - 1 - i) * DT;
        m.position.set(GRID.x, y0, GRID.z);
        packs.push({ m: m, row: sl.row, col: sl.col });
        jobs.push(anim.wait(i * 0.05).then(function () {
          return anim.tween(0.3, function (e) {
            m.position.set(U.lerp(GRID.x, sl.x, e), U.lerp(y0, DT / 2 + 0.02, e) + Math.sin(Math.PI * e) * 2, U.lerp(GRID.z, sl.z, e));
            m.rotation.y = sl.yaw * e;
          }, U.outCubic).then(function () { BJ.audio.deckDrop(); });
        }));
      })(i);
      return Promise.all(jobs);
    });
  };

  Intro.play = function (decks) {
    decks = decks || 6;
    if (packs.length !== decks) Intro.setOut(decks);
    var halfX = 5.6, cz = GRID.z, halfH = DT * decks / 2, full = DT * decks, mine = packs;
    packs = [];
    S.setShoe(false); S.resetDiscards();

    // 1) Stack the decks into two halves. The recorded shuffle runs under the stacking and the riffle.
    var recorded = BJ.audio.shuffle();
    var jobs = [];
    mine.forEach(function (pk) {
      var m = pk.m, hx = GRID.x + (pk.row ? halfX : -halfX), x0 = m.position.x, z0 = m.position.z, r0 = m.rotation.y;
      jobs.push(anim.wait(pk.col * 0.1).then(function () {
        return anim.tween(0.28, function (e) {
          m.position.set(U.lerp(x0, hx, e), DT / 2 + 0.02 + pk.col * DT * e + Math.sin(Math.PI * e) * 2.6, U.lerp(z0, cz, e));
          m.rotation.y = U.lerp(r0, 0, e);
        }, U.inOutCubic).then(function () { BJ.audio.deckDrop(); });
      }));
    });

    return Promise.all(jobs).then(function () { return anim.wait(0.1); }).then(function () {
      // 2) Riffle: cards drop alternately from each half into one pack between them.
      mine.forEach(function (pk) { S.scene.remove(pk.m); });
      var L = deckMesh(halfH), Rt = deckMesh(halfH), mid = deckMesh(0), K = 46, hL = halfH, hR = halfH, hM = 0;
      L.position.x = GRID.x - halfX; Rt.position.x = GRID.x + halfX; mid.position.x = GRID.x;
      L.position.z = Rt.position.z = mid.position.z = cz;
      var js = [anim.tween(0.18, function (e) {
        L.position.x = GRID.x + U.lerp(-halfX, -4.6, e); Rt.position.x = GRID.x + U.lerp(halfX, 4.6, e);
        L.rotation.y = -0.4 * e; Rt.rotation.y = 0.4 * e;
      }, U.outCubic)];
      for (var k = 0; k < K; k++) (function (k) {
        js.push(anim.wait(0.17 + k * 0.021).then(function () {
          var left = k % 2 === 0, src = left ? L : Rt;
          if (left) { hL = Math.max(0, hL - halfH / (K / 2)); setHeight(L, hL); }
          else { hR = Math.max(0, hR - halfH / (K / 2)); setHeight(Rt, hR); }
          var card = new T3.Mesh(cardGeo, backMat), holder = new T3.Group();
          card.rotation.x = -Math.PI / 2; card.castShadow = true;
          holder.add(card); S.scene.add(holder);
          var x0 = src.position.x, y0 = (left ? hL : hR) + 0.12, yaw0 = src.rotation.y;
          var x1 = GRID.x + U.rand(-0.16, 0.16), y1 = hM + full / K + 0.08, yaw1 = U.rand(-0.07, 0.07);
          if (!recorded) BJ.audio.riffle();
          return anim.tween(0.12, function (e) {
            holder.position.set(U.lerp(x0, x1, e), U.lerp(y0, y1, e) + Math.sin(Math.PI * e) * 1.3, cz);
            holder.rotation.y = U.lerp(yaw0, yaw1, e);
          }, U.outCubic).then(function () { S.scene.remove(holder); hM += full / K; setHeight(mid, hM); });
        }));
      })(k);
      return Promise.all(js).then(function () {
        // 3) Square the pack up.
        S.scene.remove(L); S.scene.remove(Rt);
        setHeight(mid, full);
        BJ.audio.deckDrop();
        return anim.tween(0.22, function (e) {
          mid.position.y = full / 2 + 0.02 + Math.sin(Math.PI * e) * 0.9;
          mid.rotation.y = Math.sin(Math.PI * 2 * e) * 0.05;
        }, U.linear).then(function () { return mid; });
      });
    }).then(function (mid) {
      // 4) Lay the pack out into the shoe: cards peel off the top in a stream and fan into place.
      var from = { x: GRID.x, z: cz, h: full };
      S.scene.remove(mid);
      S.packFlow(0, from);
      anim.wait(0.5).then(BJ.audio.deckDrop);                                   // 착
      for (var k = 0; k < 14; k++) anim.wait(0.56 + k * 0.028).then(BJ.audio.riffle);   // 샤악
      return anim.tween(1.2, function (e) { S.packFlow(e, from); }, U.linear).then(function () { S.setShoe(true); });
    });
  };
})();