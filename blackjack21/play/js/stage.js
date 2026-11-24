/* The 3D table: renderer, camera, lights and everything that does not move
   (felt, print, padded rail, shoe, discard rack, chip float, limits placard).
   World units are centimetres; +x is right, +z is toward the player. */
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util, T3 = window.THREE;
  var S = BJ.stage = {};

  // One look per table of the ladder.
  // Each lounge has its own felt and its own deck, the back picked to stand off the felt.
  S.THEMES = [
    { felt: '#126b3c', ink: '#f3e9c8', rail: '#1c120c', shoe: '#1d1d20', floor: '#100c0a', glow: ['#ffb65c','#ff6a50','#ffd9a0'], prop: { glass: true, color: '#e4f1f3', opacity: 0.26 } },   // alley   - green  / red backs
    { felt: '#1163ad', ink: '#eef4fb', rail: '#161210', shoe: '#1d1d20', floor: '#070a10', glow: ['#ffc878','#9cc8ff','#ffe2b0'], prop: { glass: true, color: '#8fa9c9', opacity: 0.4 } },   // harbor  - blue   / coral backs
    { felt: '#8f1b2b', ink: '#f2d37c', rail: '#1a0f0c', shoe: '#1d1d20', floor: '#07100b', glow: ['#ffc47a','#ff7a9a','#d8ffd0'], prop: { tex: 'rattan', bump: 0.6, rough: 0.7, coat: 0.15, rep: 1.4 } },   // garden  - wine   / emerald backs
    { felt: '#4a2b86', ink: '#f0dca0', rail: '#141018', shoe: '#1d1d20', floor: '#0e0912', glow: ['#ffcf8a','#ffe6c0','#d6a0ff'], prop: { tex: 'burl', rough: 0.3, coat: 1, mul: 1.25, rep: 1 } },   // grand   - violet / gold backs
    { felt: '#11274f', ink: '#e9c56a', rail: '#0f0f12', shoe: '#1d1d20', floor: '#070a14', glow: ['#ffc27a','#ffe2b8','#9ab6ff'], prop: { tex: 'tufted', color: '#7a1f22', bump: 1.4, rough: 0.5, coat: 0.25, rep: 1.2, leather: true } },   // royal   - navy   / ivory backs
    { felt: '#2a3038', ink: '#e7c15c', rail: '#0c0c0e', shoe: '#ffffff', floor: '#08090c', glow: ['#ffd59a','#a8c8ff','#ffffff'], prop: { tex: 'brushed', color: '#b6bcc6', metal: 0.72, rough: 0.34, rep: 1 } },   // sky     - charcoal
    { felt: '#0e5a57', ink: '#f1d58a', rail: '#1a120c', shoe: '#ffffff', floor: '#0a0f0f', glow: ['#ffcf88','#7fe0d6','#ffe7c0'], prop: { tex: 'marble', rough: 0.18, coat: 1, rep: 0.8 } },   // monte   - Mediterranean teal
    { felt: '#a3141c', ink: '#f6cf6a', rail: '#160b08', shoe: '#ffffff', floor: '#120606', glow: ['#ff7a4a','#ffc65a','#ffe0a0'], prop: { tex: 'hammered', color: '#f0cc78', mul: 1.25, metal: 0.7, rough: 0.3, bump: 1.2, rep: 1.5 } },   // macau   - lucky red
    { felt: '#6b1146', ink: '#ffd6f0', rail: '#120a10', shoe: '#ffffff', floor: '#0c0710', glow: ['#ff6ab8','#6ad8ff','#ffbf6a'], prop: { tex: 'carbon', rough: 0.28, coat: 1, rep: 2, mul: 1.3 } },   // vegas   - neon magenta
    { felt: '#22252c', ink: '#dfe6ee', rail: '#08080a', shoe: '#ffffff', floor: '#060607', glow: ['#e8f0ff','#c8d4ff','#ffffff'], prop: { tex: 'pearl', rough: 0.15, coat: 1, rep: 1 } },   // diamond - black and silver
    { felt: '#7a6a42', ink: '#2a1e08', rail: '#120c06', shoe: '#ffffff', floor: '#0f0b05', glow: ['#ffd78a','#fff0c8','#ffc46a'], prop: { tex: 'pearl', color: '#3f8f70', rough: 0.18, coat: 1, rep: 1 } }   // crown   - champagne felt / jade lacquer
  ];
  // Every material that shows a card back; they all change deck together.
  var backMats = [], plasticMats = [];
  var woodBox, woodShape;
  // The shoe, discard rack and chip float share one finish, changed per lounge: acrylic, woven cane, burl,
  // tufted leather, steel, marble, hammered gold, carbon, pearl. Each lounge gets its own pair of materials
  // (boxes, and the long extruded walls whose UVs run in table units).
  var propMeshes = [], finishCache = {};
  function woodMats() {
    if (woodBox) return;
    woodBox = new T3.MeshPhysicalMaterial({ color: col('#888888') });
    woodShape = woodBox;
  }
  function prop(mesh) { mesh.userData.long = mesh.material === woodShape && mesh.geometry.type === 'ExtrudeGeometry'; propMeshes.push(mesh); return mesh; }
  function finishMats(index, f) {
    if (finishCache[index]) return finishCache[index];
    function make(scale) {
      var o = { color: col(f.color || '#ffffff').multiplyScalar(f.mul || 1), roughness: f.rough == null ? 0.5 : f.rough,
                metalness: f.metal || 0, clearcoat: f.coat || 0, clearcoatRoughness: 0.12, envMapIntensity: f.metal ? 1.9 : 0.8 };
      if (f.glass) { o.transparent = true; o.opacity = f.opacity; o.depthWrite = false; o.roughness = 0.06; o.clearcoat = 1; o.clearcoatRoughness = 0.05; o.envMapIntensity = 1.6; }
      if (f.tex) {
        var canvas = BJ.art[f.tex](), r = (f.rep || 1) * scale;
        o.map = tex(canvas, r, r);
        if (f.bump) { o.bumpMap = tex(canvas, r, r); o.bumpMap.encoding = T3.LinearEncoding; o.bumpScale = 0.06 * f.bump; }
      }
      return new T3.MeshPhysicalMaterial(o);
    }
    return (finishCache[index] = { box: make(1), long: make(0.07) });
  }
  function setFinish(index, f) {
    var m = finishMats(index, f);
    propMeshes.forEach(function (o) { o.material = o.userData.long ? m.long : m.box; o.castShadow = !f.glass; o.renderOrder = f.glass ? 2 : 0; });
  }

  // Cards waiting in the shoe or lying in the discard rack are drawn a little smaller than cards in play.
  S.HELD = 0.86;
  S.backMat = function (m) { backMats.push(m); if (S.backTex) { m.map = S.backTex; m.needsUpdate = true; } return m; };

  // Camera positions. `table` is the playing view; `lobby` is a low look across the felt.
  S.POSES = {
    table: { p: [0, 73.6, 53.3], t: [0, 0, 1.5], fov: 45 },
    multi: { p: [0, 104, 84], t: [0, 0, -1.5], fov: 55 },        // a step back, so the seats either side are in view
    lobby: { p: [0, 70, 78], t: [0, 0, -2], fov: 42 }
  };

  // Where things sit on the felt. Far row, left to right: discard rack, chip float, shoe.
  S.LAYOUT = { dealerZ: -17, dealerHalf: 10 };

  function col(hex) { return new T3.Color(hex).convertSRGBToLinear(); }
  function tex(canvas, repeatX, repeatY) {
    var t = new T3.CanvasTexture(canvas);
    t.encoding = T3.sRGBEncoding;
    t.anisotropy = S.maxAniso || 1;
    if (repeatX) { t.wrapS = t.wrapT = T3.RepeatWrapping; t.repeat.set(repeatX, repeatY); }
    return t;
  }
  S.col = col; S.tex = tex;

  // Filled in by the builders below.
  S.shoe = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  S.discard = { x: -15, y: 0.45, z: -30.4, yaw: Math.PI / 4, count: 0 };
  S.tray = { x: 0, y: 1.6, z: -31.6 };

  function buildEnvironment(renderer) {
    var es = new T3.Scene();
    es.add(new T3.Mesh(new T3.SphereGeometry(300, 24, 12),
      new T3.MeshBasicMaterial({ color: new T3.Color(0.012, 0.013, 0.018), side: T3.BackSide })));
    function panel(x, y, z, w, h, r, g, b) {
      var m = new T3.Mesh(new T3.PlaneGeometry(w, h),
        new T3.MeshBasicMaterial({ color: new T3.Color(r, g, b), side: T3.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    }
    panel(0, 170, 30, 190, 110, 7.5, 6.6, 5.4);      // warm pendant lamp over the table
    panel(-170, 70, -40, 70, 150, 1.2, 1.5, 2.1);    // cool window, left
    panel(180, 50, 70, 60, 110, 2.2, 1.5, 0.9);      // warm lamp, right
    panel(0, 40, -220, 280, 50, 0.9, 0.62, 0.38);    // bar glow behind the dealer
    var pm = new T3.PMREMGenerator(renderer);
    var out = pm.fromScene(es, 0.035).texture;
    pm.dispose();
    return out;
  }

  S.init = function (container) {
    var renderer = new T3.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T3.sRGBEncoding;
    renderer.toneMapping = T3.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T3.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    S.renderer = renderer;
    S.container = container;
    S.maxAniso = renderer.capabilities.getMaxAnisotropy();

    var scene = S.scene = new T3.Scene();
    scene.background = col('#06070a');
    scene.environment = buildEnvironment(renderer);

    S.camera = new T3.PerspectiveCamera(45, 0.5, 8, 600);
    S.setPose(S.POSES.lobby);

    // Light: one warm pendant with a soft edge, a sky/bounce fill, a cool kicker from behind.
    scene.add(new T3.HemisphereLight(0xd6e2ff, 0x2a1c10, 0.34));
    var key = new T3.SpotLight(0xfff1de, 1.62, 0, 0.52, 1.0, 1);
    key.position.set(9, 100, 32);
    key.target.position.set(0, 0, -5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 50; key.shadow.camera.far = 180;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    scene.add(key); scene.add(key.target);
    var kick = new T3.DirectionalLight(0x9db7ff, 0.34);
    kick.position.set(-50, 22, -70);
    scene.add(kick);

    buildTable(scene);
    buildRoom(scene);
    S.resize();
    return true;
  };

  /* ---------- camera ---------- */
  var pose = { p: [0, 0, 0], t: [0, 0, 0], fov: 45 }, look = new T3.Vector3();
  function applyPose(dx, dy, dz) {
    S.camera.position.set(pose.p[0] + (dx || 0), pose.p[1] + (dy || 0), pose.p[2] + (dz || 0));
    look.set(pose.t[0], pose.t[1], pose.t[2]);
    S.camera.lookAt(look);
    if (S.camera.fov !== pose.fov) { S.camera.fov = pose.fov; S.camera.updateProjectionMatrix(); }
  }
  S.setPose = function (to) { pose = { p: to.p.slice(), t: to.t.slice(), fov: to.fov }; applyPose(); };
  // Crane move from wherever the camera is to `to`.
  S.fly = function (to, seconds) {
    var from = { p: pose.p.slice(), t: pose.t.slice(), fov: pose.fov };
    return BJ.anim.tween(seconds, function (e) {
      for (var i = 0; i < 3; i++) { pose.p[i] = U.lerp(from.p[i], to.p[i], e); pose.t[i] = U.lerp(from.t[i], to.t[i], e); }
      pose.p[1] += Math.sin(Math.PI * e) * 7;
      pose.fov = U.lerp(from.fov, to.fov, e);
      applyPose();
    }, U.inOutCubic).then(function () { S.setPose(to); });
  };
  // Betting spots for the side seats at a shared table: a thin chalk oval on the felt, turned toward the dealer.
  var spotMeshes = [];
  S.seatSpots = function (list) {
    spotMeshes.forEach(function (m) { S.scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); });
    spotMeshes = [];
    if (!list || !list.length) return;
    var A = BJ.art, sz = A.betSpotSize, ink = (S.THEMES[S.themeIndex || 0] || {}).ink || '#f4ecd8';
    list.forEach(function (sp) {
      var m = new T3.Mesh(new T3.PlaneGeometry(sz.w, sz.h),
        new T3.MeshBasicMaterial({ map: tex(A.betSpot(ink)), transparent: true, depthWrite: false, opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = sp.yaw || 0;
      m.position.set(sp.x, 0.03, sp.z);
      S.scene.add(m); spotMeshes.push(m);
    });
  };

  // In the lobby the camera glides slowly from side to side across the table, so neither side of the room
  // sits out of view for long. It eases in when the lobby opens, and a crane move starts from wherever it is.
  var driftStart = -1;
  S.drift = function (time) {
    var base = S.POSES.lobby;
    if (driftStart < 0) driftStart = time;
    var k = Math.min(1, (time - driftStart) / 2.5); k = k * k * (3 - 2 * k);
    var a = (time - driftStart) * 0.11;
    pose.p[0] = base.p[0] + Math.sin(a) * 13 * k;
    pose.p[1] = base.p[1] + Math.sin(a * 0.7) * 2.5 * k;
    pose.p[2] = base.p[2] - (1 - Math.cos(a)) * 2.5 * k;
    pose.t[0] = base.t[0] + Math.sin(a) * 3 * k;
    applyPose();
  };
  S.driftStop = function () { driftStart = -1; };

  /* ---------- the table ---------- */
  var feltMat, printMat, railMat, placardMat, trayCols = [];
  var RC_Z = -25, RAD = 53.25, RAIL_R = 58.6, BACK_Z = -43;      // half-round player side, straight dealer side

  function buildTable(scene) {
    var A = BJ.art;

    // Felt, cut to the table's D shape.
    var feltCanvas = A.felt();
    var feltMap = tex(feltCanvas, 1, 1), feltBump = tex(feltCanvas, 1, 1); feltBump.encoding = T3.LinearEncoding;
    feltMat = new T3.MeshStandardMaterial({ map: feltMap, bumpMap: feltBump, bumpScale: 0.16, roughness: 1, metalness: 0, envMapIntensity: 0.12 });
    var top = new T3.Shape();                         // shape y is world -z
    top.moveTo(-RAIL_R, -BACK_Z); top.lineTo(RAIL_R, -BACK_Z); top.lineTo(RAIL_R, -RC_Z);
    top.absarc(0, -RC_Z, RAIL_R, 0, Math.PI, true);
    top.lineTo(-RAIL_R, -BACK_Z);
    var feltGeo = new T3.ShapeGeometry(top, 48), fuv = feltGeo.attributes.uv, fpos = feltGeo.attributes.position;
    for (var i = 0; i < fpos.count; i++) fuv.setXY(i, fpos.getX(i) / 12, fpos.getY(i) / 12);
    var felt = new T3.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true;
    scene.add(felt);

    // Print layer
    printMat = new T3.MeshStandardMaterial({ transparent: true, roughness: 0.95, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.1 });
    var P = A.PRINT;
    var print = new T3.Mesh(new T3.PlaneGeometry(P.w, P.h), printMat);
    print.rotation.x = -Math.PI / 2; print.position.set(P.cx, 0.012, P.cz);
    print.receiveShadow = true; print.renderOrder = 1;
    scene.add(print);

    // Padded leather rail around the player's side and up both flanks, with a brass bead inside it.
    var leather = A.leather();
    var lMap = tex(leather, 70, 2.4), lBump = tex(leather, 70, 2.4); lBump.encoding = T3.LinearEncoding;
    railMat = new T3.MeshStandardMaterial({ map: lMap, bumpMap: lBump, bumpScale: 0.07, roughness: 0.46, metalness: 0, envMapIntensity: 0.9 });
    var rail = new T3.Mesh(new T3.TorusGeometry(RAIL_R, 5.2, 20, 128, Math.PI), railMat);
    rail.rotation.set(Math.PI / 2, 0, 0); rail.scale.z = 0.5;
    rail.position.set(0, 1.25, RC_Z); rail.castShadow = true; rail.receiveShadow = true;
    scene.add(rail);
    var brass = new T3.MeshStandardMaterial({ color: col('#c9a14a'), roughness: 0.26, metalness: 1, envMapIntensity: 1.25 });
    S.brass = brass;
    var bead = new T3.Mesh(new T3.TorusGeometry(RAD, 0.42, 10, 140, Math.PI), brass);
    bead.rotation.set(Math.PI / 2, 0, 0); bead.position.set(0, 0.22, RC_Z); bead.castShadow = true;
    scene.add(bead);
    var flank = RC_Z - BACK_Z;
    [-1, 1].forEach(function (s) {
      var pad = new T3.Mesh(new T3.CylinderGeometry(5.2, 5.2, flank, 20, 1), railMat);
      pad.rotation.x = Math.PI / 2; pad.scale.z = 0.5; pad.position.set(s * RAIL_R, 1.25, (RC_Z + BACK_Z) / 2);
      pad.castShadow = true; pad.receiveShadow = true; scene.add(pad);
      var b = new T3.Mesh(new T3.CylinderGeometry(0.42, 0.42, flank, 10, 1), brass);
      b.rotation.x = Math.PI / 2; b.position.set(s * RAD, 0.22, (RC_Z + BACK_Z) / 2); scene.add(b);
    });

    // Dealer's edge: the same padded leather rail closes the far side, with the brass bead inside it and
    // rounded corners where it meets the flanks, so the table reads as one piece all the way round.
    var back = new T3.Mesh(new T3.CylinderGeometry(5.2, 5.2, RAIL_R * 2, 20, 1), railMat);
    back.rotation.z = Math.PI / 2; back.scale.x = 0.5; back.position.set(0, 1.25, BACK_Z); back.castShadow = true; back.receiveShadow = true; scene.add(back);
    [-1, 1].forEach(function (s) {
      var corner = new T3.Mesh(new T3.SphereGeometry(5.2, 20, 12), railMat);
      corner.scale.y = 0.5; corner.position.set(s * RAIL_R, 1.25, BACK_Z); corner.castShadow = true; scene.add(corner);
    });
    var bb = new T3.Mesh(new T3.CylinderGeometry(0.42, 0.42, RAD * 2, 10, 1), brass);
    bb.rotation.z = Math.PI / 2; bb.position.set(0, 0.22, BACK_Z + (RAIL_R - RAD)); scene.add(bb);
    // the cabinet under the rail, lacquered wood, seen only as a thin dark lip
    var wood = new T3.MeshPhysicalMaterial({ color: col('#3a2414'), roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.9 });
    var edge = new T3.Mesh(new T3.BoxGeometry((RAIL_R + 5.2) * 2, 6, 6), wood);
    edge.position.set(0, -3.2, BACK_Z - 1); edge.receiveShadow = true; scene.add(edge);

    buildShoe(scene);
    buildDiscard(scene);
    buildTray(scene);
    buildPlacard(scene);
  }

  // The room behind the dealer: a painted wall far out of focus, a dark floor, and a few soft lights floating
  // in between that drift past as the camera cranes. Only the lobby and the crane really see it.
  var wallMat, floorMat, bokeh = [];
  function buildRoom(scene) {
    wallMat = new T3.MeshBasicMaterial({ color: new T3.Color(2.1, 2.1, 2.1), fog: false });
    var wall = new T3.Mesh(new T3.PlaneGeometry(124, 62), wallMat);
    wall.position.set(-6, -8, -96); scene.add(wall);
    floorMat = new T3.MeshStandardMaterial({ color: col('#0a0a0c'), roughness: 0.9, metalness: 0 });
    var floor = new T3.Mesh(new T3.PlaneGeometry(400, 200), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -33, -10); floor.receiveShadow = true; scene.add(floor);
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.7)'); rg.addColorStop(0.8, 'rgba(255,255,255,0.18)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    var map = new T3.CanvasTexture(c);
    for (var i = 0; i < 16; i++) {
      var m = new T3.SpriteMaterial({ map: map, transparent: true, opacity: U.rand(0.05, 0.16), blending: T3.AdditiveBlending, depthWrite: false });
      var sp = new T3.Sprite(m);
      sp.position.set(U.rand(-70, 60), U.rand(-6, 40), U.rand(-90, -66));
      sp.scale.setScalar(U.rand(4, 11));
      scene.add(sp); bokeh.push(sp);
    }
  }
  var roomShown = -1;
  function loadRoomPhoto(index) {
    var A = BJ.art;
    if (A.roomPhotos[index] !== undefined) return;
    A.roomPhotos[index] = null;
    var img = new Image();
    img.onload = function () { A.roomPhotos[index] = img; if (roomShown === index) setRoom(index, S.THEMES[index]); };
    img.src = 'img/room/' + index + '.jpg';
  }
  function setRoom(index, th) {
    roomShown = index; loadRoomPhoto(index);
    if (wallMat.map) wallMat.map.dispose();
    wallMat.map = tex(BJ.art.room(index)); wallMat.needsUpdate = true;
    wallMat.color.setScalar(BJ.art.roomPhotos[index] ? 1.05 : 2.1);       // photos are already lit; the paintings need lifting
    floorMat.color.copy(col(th.floor || '#0b0a0a'));
    bokeh.forEach(function (sp, i) { sp.material.color.copy(col(th.glow[i % th.glow.length])).multiplyScalar(1.6); });
  }

  /* The shoe: the pack stands leaning back in a clear tray, turned a little so its fanned side shows.
     You see the back of the front card and, behind it, the stepped edges of the rest.
     Cards here are the same size as on the felt. */
  var shoePack, slabs = [], shoeFrame = { yaw: 0, ox: 0, oz: 0 }, SLAB = 0.085;
  function buildShoe(scene) {
    var A = BJ.art, g = new T3.Group(), W = 7.94 * S.HELD, H = 11.11 * S.HELD;
    woodMats();
    // A long black dealing shoe lying along the far edge, mouth toward the table's middle.
    var plastic = woodBox;
    var paper = new T3.MeshStandardMaterial({ map: tex(A.cardEdges()), roughness: 0.75 });
    var white = new T3.MeshStandardMaterial({ color: col('#eeebe1'), roughness: 0.8 });
    // The front card leans into the overhead lamp: matt and a touch darker so it reads the same red as the felt cards.
    var back = S.backMat(new T3.MeshStandardMaterial({ color: col('#bcbcbc'), roughness: 0.95, metalness: 0, envMapIntensity: 0.05 }));

    // Local frame: +z is the mouth, cards stand leaning back toward -z, stacked from the mouth to the back.
    var alpha = 0.75, sa = Math.sin(alpha), ca = Math.cos(alpha);
    var N = 26, stepZ = 0.2, tight = SLAB / sa, baseY = 0.55, z0 = 5.7;
    shoePack = new T3.InstancedMesh(new T3.BoxGeometry(W, H, SLAB), [paper, paper, paper, white, back, white], N);
    var e = new T3.Euler();
    for (var i = 0; i < N; i++) {
      var along = i ? U.rand(-0.12, 0.12) : 0, side = i ? U.rand(-0.06, 0.06) : 0, half = H / 2 + along;
      e.set(-(Math.PI / 2 - alpha), 0, i ? U.rand(-0.012, 0.012) : 0);
      var q = new T3.Quaternion().setFromEuler(e);
      e.set(-(Math.PI / 2 - alpha), 0, 0);
      // p: its place in the run of cards; p0: squared up in a tight block at the back of the shoe
      slabs.push({ p: new T3.Vector3(side, baseY + half * sa, z0 - i * stepZ - half * ca), q: q,
                   p0: new T3.Vector3(0, baseY + (H / 2) * sa, z0 - (N - 1) * stepZ + (N - 1 - i) * tight - (H / 2) * ca),
                   q0: new T3.Quaternion().setFromEuler(e) });
    }
    shoePack.castShadow = true; shoePack.receiveShadow = true;
    g.add(shoePack);

    var mouth = 6.9, backEnd = z0 - (N - 1) * stepZ - H * ca - 0.6, len = mouth - backEnd, wide = W + 1.0, hW = 6.6;   // walls tall enough to hold the pack's sides
    var base = prop(new T3.Mesh(new T3.BoxGeometry(wide, 0.5, len), plastic));
    base.position.set(0, 0.25, (mouth + backEnd) / 2); base.castShadow = true; base.receiveShadow = true; g.add(base);
    // side walls: flat top, sloping down to a low lip at the mouth
    var sh = new T3.Shape();
    sh.moveTo(backEnd, 0.4); sh.lineTo(backEnd, hW); sh.lineTo(mouth - 3.6, hW); sh.lineTo(mouth, 1.2); sh.lineTo(mouth, 0.4);
    var wallGeo = new T3.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 });
    [-wide / 2, wide / 2 - 0.35].forEach(function (x) {
      var w = prop(new T3.Mesh(wallGeo, woodShape)); w.rotation.y = -Math.PI / 2; w.position.set(x + 0.35, 0, 0); w.castShadow = true; g.add(w);
    });
    var rear = prop(new T3.Mesh(new T3.BoxGeometry(wide, hW, 0.4), plastic));
    rear.position.set(0, hW / 2, backEnd + 0.2); rear.castShadow = true; g.add(rear);
    var lip = prop(new T3.Mesh(new T3.BoxGeometry(wide, 0.9, 0.7), plastic)); lip.position.set(0, 0.9, mouth - 0.35); lip.castShadow = true; g.add(lip);

    var yaw = -Math.PI / 4;                               // mouth turned 45 degrees toward the player
    g.rotation.y = yaw;
    scene.add(g);
    shoeGroup = g;
    // Front card: centre of its back, a hair off the pack. Then the spot just outside the mouth.
    shoeLocal = { yaw: yaw, alpha: alpha, top: [0, baseY + (H / 2) * sa + 0.12 * ca, z0 - (H / 2) * ca + 0.12 * sa], out: [0, 1.15, mouth + 2.6],
                  tag: [0, baseY + 0.6, z0 + 0.4],     // on the bottom edge of the front card
                  // how far right of its origin the shoe reaches, and how far forward
                  reach: Math.max.apply(null, [[-wide / 2, backEnd], [wide / 2, backEnd], [-wide / 2, mouth], [wide / 2, mouth]].map(function (q) { return q[0] * Math.cos(yaw) + q[1] * Math.sin(yaw); })) + 0.4 };
    S.placeShoe(11, SHOE_Z);
    S.packFlow(1);
    shoePack.visible = false;
  }
  var shoeGroup, shoeLocal, SHOE_Z = -30.6;     // in front of the padded rail, so the cases don't sink into it
  S.placeShoe = function (ox, oz) {
    var L = shoeLocal, yaw = L.yaw;
    shoeFrame = { yaw: yaw, ox: ox, oz: oz };
    shoeGroup.position.set(ox, 0, oz);
    function world(v) { return { x: ox + v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), y: v[1], z: oz - v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw) }; }
    var top = world(L.top), out = world(L.out), tg = world(L.tag);
    S.shoe = { tag: tg, ix: top.x, iy: top.y, iz: top.z, x: out.x, y: out.y, z: out.z, yaw: yaw, pitch: L.alpha, pitchOut: 0.17 };
    if (shoePack.visible) S.packFlow(1);
  };
  // Push the discard rack and the shoe out to the screen's left and right edges, whatever the phone's shape.
  function edgeX(sign, y, z) {
    var x = 0;
    for (var i = 0; i < 400; i++) { var p = S.project(sign * x, y, z); if ((sign > 0 ? p.x / S.w : 1 - p.x / S.w) > 0.985) break; x += 0.1; }
    return sign * x;
  }
  // Which playing view the shoe and rack are fitted to: the single-player view, or the wider multiplayer one.
  S.edgePose = 'table';
  S.placeEdges = function (which) {
    if (which) S.edgePose = which;
    if (!shoeGroup || !S.w) return;
    var cam = S.camera.position.clone(), q = S.camera.quaternion.clone(), fov = S.camera.fov;
    var P = S.POSES[S.edgePose];                         // measure against the playing view, wherever the camera is now
    S.camera.position.set(P.p[0], P.p[1], P.p[2]); S.camera.lookAt(P.t[0], P.t[1], P.t[2]); S.camera.fov = P.fov; S.camera.updateProjectionMatrix(); S.camera.updateMatrixWorld();
    var right = edgeX(1, 4, SHOE_Z), left = edgeX(-1, 2.4, S.discard.z);
    S.camera.position.copy(cam); S.camera.quaternion.copy(q); S.camera.fov = fov; S.camera.updateProjectionMatrix(); S.camera.updateMatrixWorld();
    S.placeShoe(Math.max(11, right - shoeLocal.reach), SHOE_Z);
    S.discard.x = left + 9.0;                           // the rack is turned 45 degrees, so it reaches about 8 cm either side
    if (discardGroup) discardGroup.position.x = S.discard.x;
  };

  S.setShoe = function (full) { if (full) { S.packFlow(1); S.setShoeCount(S.shoeLeft); } else shoePack.visible = false; };
  // The run of cards in the shoe gets shorter as the shoe is dealt down (`left` of 312).
  S.shoeLeft = 312;
  S.setShoeCount = function (left) {
    S.shoeLeft = left;
    shoePack.count = Math.max(1, Math.min(slabs.length, Math.ceil(slabs.length * left / 312)));
  };

  /* Move the pack between a squared-up stack lying on the felt (u = 0, at `from` = {x, z, h}) and its
     fanned place in the shoe (u = 1). First half: the whole pack drops into the shoe in one go, squared
     up. Second half: a sweep runs from the front card to the back and fans the cards out. */
  var fA = new T3.Vector3(), fP = new T3.Vector3(), fS = new T3.Vector3(), fQ = new T3.Quaternion(), fQ2 = new T3.Quaternion(), fE = new T3.Euler(), fM = new T3.Matrix4();
  S.packFlow = function (u, from) {
    shoePack.count = slabs.length;
    var N = slabs.length, yaw = shoeFrame.yaw, SNAP = 0.42;
    var dx = from ? from.x - shoeFrame.ox : 0, dz = from ? from.z - shoeFrame.oz : 0;
    var lx = dx * Math.cos(yaw) - dz * Math.sin(yaw), lz = dx * Math.sin(yaw) + dz * Math.cos(yaw), h = from ? from.h : 1;
    fE.set(-Math.PI / 2, -yaw, 0, 'YXZ'); fQ.setFromEuler(fE);          // lying flat, back up, square to the table
    var a = from ? U.clamp(u / SNAP, 0, 1) : 1, ea = a < 1 ? U.inOutCubic(a) : 1;
    var b = from ? U.clamp((u - SNAP) / (1 - SNAP), 0, 1) : 1;
    for (var i = 0; i < N; i++) {
      var s = slabs[i];
      // phase 1: felt -> squared in the shoe
      fA.set(lx, 0.02 + (i + 0.5) * h / N, lz);
      fP.copy(fA).lerp(s.p0, ea); fP.y += Math.sin(Math.PI * a) * 6;
      fQ2.copy(fQ).slerp(s.q0, ea);
      var g0 = U.lerp(1 / S.HELD, 1, ea); fS.set(g0, g0, U.lerp(h / N / SLAB, 1, ea));
      // phase 2: the sweep, back card first and the front card last, each overshooting a touch before it settles
      var k = U.clamp(b * 1.8 - (1 - i / (N - 1)) * 0.8, 0, 1), e = U.outBack(k);
      if (k > 0) { fP.lerpVectors(s.p0, s.p, e); fQ2.copy(s.q0).slerp(s.q, U.clamp(e, 0, 1)); fS.set(1, 1, 1); }
      fM.compose(fP, fQ2, fS); shoePack.setMatrixAt(i, fM);
    }
    shoePack.instanceMatrix.needsUpdate = true;
    shoePack.visible = true;
  };

  var discardStack, discardGroup;
  function buildDiscard(scene) {
    var A = BJ.art, g = new T3.Group();
    woodMats();
    var acrylic = woodBox;
    var base = prop(new T3.Mesh(new T3.BoxGeometry(8.6, 0.45, 11.4), acrylic)); base.position.y = 0.22; base.castShadow = true; base.receiveShadow = true; g.add(base);
    var wall = prop(new T3.Mesh(new T3.BoxGeometry(8.6, 2.4, 0.5), acrylic)); wall.position.set(0, 1.2, -5.7); wall.castShadow = true; g.add(wall);
    // a U-shaped tray: back and both sides closed, the open end facing the middle of the table where the cards come from
    [-4.3, 4.3].forEach(function (x) {
      var side = prop(new T3.Mesh(new T3.BoxGeometry(0.5, 2.4, 11.4), acrylic)); side.position.set(x, 1.2, 0); side.castShadow = true; g.add(side);
    });
    var paper = new T3.MeshStandardMaterial({ map: tex(A.cardEdges()), roughness: 0.75 });
    var back = S.backMat(new T3.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.28, envMapIntensity: 0.7 }));
    discardStack = new T3.Mesh(new T3.BoxGeometry(7.94 * S.HELD, 1, 11.11 * S.HELD), [paper, paper, back, paper, paper, paper]);
    discardStack.castShadow = true; discardStack.visible = false;
    g.add(discardStack);
    g.position.set(S.discard.x, 0, S.discard.z); g.rotation.y = S.discard.yaw;
    scene.add(g);
    discardGroup = g;
  }
  // Used cards pile up in the rack until the next shuffle.
  S.addDiscards = function (n) {
    S.discard.count = Math.min(312, S.discard.count + n);
    var h = 0.1 + S.discard.count * 0.02;
    discardStack.visible = true;
    discardStack.scale.y = h; discardStack.position.y = 0.45 + h / 2;
    S.discard.y = 0.45 + h;
  };
  S.resetDiscards = function () { S.discard.count = 0; S.discard.y = 0.45; discardStack.visible = false; };

  function buildTray(scene) {
    var g = new T3.Group();
    woodMats();
    var steel = woodBox;
    var base = prop(new T3.Mesh(new T3.BoxGeometry(13.2, 0.7, 9.4), steel)); base.position.y = 0.35; base.castShadow = true; base.receiveShadow = true; g.add(base);
    [-4.5, 4.5].forEach(function (z) {
      var m = prop(new T3.Mesh(new T3.BoxGeometry(13.2, 1.5, 0.5), steel)); m.position.set(0, 0.9, z); g.add(m);
    });
    [-6.4, 6.4].forEach(function (x) {
      var m = prop(new T3.Mesh(new T3.BoxGeometry(0.5, 1.5, 9.4), steel)); m.position.set(x, 0.9, 0); g.add(m);
    });
    for (var i = 0; i < 3; i++) {
      var mat = new T3.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
      var capMat = new T3.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
      var c = new T3.Mesh(new T3.CylinderGeometry(1.85, 1.85, 8.2, 28, 1), [mat, capMat, capMat]);
      c.rotation.x = Math.PI / 2; c.position.set((i - 1) * 4.05, 1.75, 0); c.castShadow = true;
      g.add(c); trayCols.push(c);
      c.userData.x = (i - 1) * 4.05;
    }
    g.position.set(S.tray.x, 0, S.tray.z);
    scene.add(g);
    trayGroup = g;
  }

  /* The dealer's float holds real chips: paying a win takes them out, a lost bet puts them back.
     A column that runs low gets a fresh bundle dropped in; one that overflows has a bundle taken away. */
  var trayGroup, FULL = 40, BUNDLE = 20, COL_LEN = 8.2;
  S.trayCount = [FULL, FULL, FULL];
  S.trayDenoms = [];
  function drawColumn(i) {
    // a full column stays full: extra chips coming in don't make it poke out of the float
    var c = trayCols[i], n = Math.max(0, S.trayCount[i]), k = Math.min(1, Math.max(0.0001, n / FULL));
    c.scale.y = k;                                      // the cylinder's length runs along the tray (z)
    c.position.z = -COL_LEN / 2 + COL_LEN * k / 2;      // stacked from the back wall forward
    c.visible = n > 0;
    var side = c.material[0];
    if (side.map) { side.map.repeat.set(1, Math.max(1, Math.round(n / 2))); }
  }
  function colOf(denom) { return S.trayDenoms.indexOf(denom); }
  // Where the chip at the front of a column sits in the world.
  S.trayFront = function (denom) {
    var i = colOf(denom), k = i < 0 ? 1 : Math.max(0.1, S.trayCount[i] / FULL);
    return { x: S.tray.x + (i < 0 ? 0 : trayCols[i].userData.x), y: S.tray.y + 0.3, z: S.tray.z - COL_LEN / 2 + COL_LEN * k };
  };
  S.trayTake = function (denom) {
    var i = colOf(denom); if (i < 0) return;
    S.trayCount[i]--; drawColumn(i);
    if (S.trayCount[i] < 10 && !trayCols[i].userData.refilling) bundle(i, 1);
  };
  S.trayGive = function (denom) {
    var i = colOf(denom); if (i < 0) return;
    S.trayCount[i] = Math.min(FULL, S.trayCount[i] + 1); drawColumn(i);
  };
  // A wrapped bundle of chips flies in from behind the dealer and drops into the column (dir 1), or out (dir -1).
  function bundle(i, dir) {
    var col = trayCols[i]; col.userData.refilling = true;
    var m = new T3.Mesh(col.geometry, col.material); m.castShadow = true;
    m.rotation.x = Math.PI / 2; m.scale.y = BUNDLE / FULL;
    var band = new T3.Mesh(new T3.CylinderGeometry(1.9, 1.9, 0.7, 24, 1, true), new T3.MeshStandardMaterial({ color: col_('#d9c38a'), roughness: 0.6, side: T3.DoubleSide }));
    band.scale.y = FULL / BUNDLE; m.add(band);         // paper band round the bundle
    var gx = S.tray.x + col.userData.x, slotZ = function () { return S.tray.z - COL_LEN / 2 + COL_LEN * S.trayCount[i] / FULL + COL_LEN * BUNDLE / FULL / 2; };
    var far = { x: gx + 3, y: 22, z: S.tray.z - 18 };
    S.scene.add(m);
    var a = dir > 0 ? far : { x: gx, y: 1.75, z: slotZ() - COL_LEN * BUNDLE / FULL }, b = dir > 0 ? null : far;
    if (dir < 0) { S.trayCount[i] -= BUNDLE; drawColumn(i); }
    var startT = BJ.anim.tween(dir > 0 ? 0.5 : 0.45, function (e) {
      var to = b || { x: gx, y: 1.75, z: slotZ() };
      m.position.set(U.lerp(a.x, to.x, e), U.lerp(a.y, to.y, e) + Math.sin(Math.PI * e) * (dir > 0 ? 6 : 4), U.lerp(a.z, to.z, e));
      m.rotation.z = (1 - e) * (dir > 0 ? 0.6 : -0.6);
    }, dir > 0 ? U.outCubic : U.inCubic);
    return startT.then(function () {
      S.scene.remove(m);
      if (dir > 0) { S.trayCount[i] += BUNDLE; drawColumn(i); BJ.audio.deckDrop(); BJ.audio.chip(0.8, true); }
      col.userData.refilling = false;
    });
  }
  function col_(h) { return col(h); }

  function buildPlacard(scene) {
    placardMat = new T3.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
    var dark = new T3.MeshStandardMaterial({ color: col('#1a1408'), roughness: 0.5 });
    var p = new T3.Mesh(new T3.BoxGeometry(6.0, 4.0, 0.25), [dark, dark, dark, dark, placardMat, dark]);
    p.position.set(-16.2, 1.75, -15.0); p.rotation.set(-0.95, 0.3, 0, 'YXZ'); p.castShadow = true;
    scene.add(p);
  }

  // Repaint everything that depends on the table tier.
  S.setTheme = function (index, table, labels) {
    S.themeIndex = index;
    var A = BJ.art, th = S.THEMES[index % S.THEMES.length];
    feltMat.color.copy(col(th.felt));
    railMat.color.copy(col(th.rail)).multiplyScalar(2.2);
    if (printMat.map) printMat.map.dispose();
    printMat.map = tex(A.print(th)); printMat.needsUpdate = true;
    if (placardMat.map) placardMat.map.dispose();
    placardMat.map = tex(A.placard(labels.title, labels.lines)); placardMat.needsUpdate = true;
    if (S.backTex) S.backTex.dispose();
    S.backTex = tex(A.cardBack(index));
    setFinish(index, th.prop); setRoom(index, th);
    A.house = labels.house || '';
    if (BJ.chips && BJ.chips.retexture) BJ.chips.retexture();
    backMats.forEach(function (m) { m.map = S.backTex; m.needsUpdate = true; });
    // Dealer's float: the three chips this table plays with.
    S.trayDenoms = table.chips.slice(); S.trayCount = [FULL, FULL, FULL];
    trayCols.forEach(function (m, i) {
      var d = table.chips[i];
      var side = m.material[0], cap = m.material[1];
      if (side.map) side.map.dispose();
      var t = tex(A.chipEdge(d), 1, 21); side.map = t; side.needsUpdate = true;
      if (cap.map) cap.map.dispose();
      cap.map = tex(A.chipFace(d)); cap.needsUpdate = true;
      drawColumn(i);
    });
  };

  S.resize = function () {
    if (!S.container) return;
    var w = S.container.clientWidth, h = S.container.clientHeight;
    if (!w || !h) return;
    S.renderer.setSize(w, h, false);
    S.renderer.domElement.style.width = w + 'px';
    S.renderer.domElement.style.height = h + 'px';
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
    S.w = w; S.h = h;
    S.placeEdges();
  };

  var tmp = new T3.Vector3();
  // World point -> CSS pixels inside the stage.
  S.project = function (x, y, z) {
    tmp.set(x, y, z).project(S.camera);
    return { x: (tmp.x * 0.5 + 0.5) * S.w, y: (-tmp.y * 0.5 + 0.5) * S.h };
  };

  S.render = function () { S.renderer.render(S.scene, S.camera); };
})();
