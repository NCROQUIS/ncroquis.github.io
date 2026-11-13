// NcqDevice — 엔크로키 공용 기기 모듈 (ncq/device.js): 휴대폰 진동
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 AGENTS.md의 '진동 (NcqDevice)'에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   <script src="ncq/device.js"></script>     index.html의 <head> (빌드 도구 없이)
//   import "../ncq/device.js";                  Vite 같은 빌드 도구를 쓰면 시작 파일 맨 위 (그다음 window.NcqDevice)
//
//   NcqDevice.vibrate()              짧게 톡 (= "tap")
//   NcqDevice.vibrate("success")     이름: tap light medium heavy success warning error
//                                    (토스 햅틱 이름 tickWeak tickMedium softMedium basicWeak basicMedium wiggle confetti도 돼요)
//   NcqDevice.vibrate(300)           0.3초 (최대 1초)
//   NcqDevice.vibrate([80, 40, 80])  켬·끔·켬… ms (모두 합쳐 5초까지)
//   NcqDevice.vibrate(0)             울리던 진동 멈추기
//   NcqDevice.canVibrate()           이 기기에서 진동이 되는지 (설정 화면에 '진동' 칸을 보일지)
//   NcqDevice.vibration()            진동을 켰는지 (기본 켬, 기기에 저장)
//   NcqDevice.vibration(false)       끄기·켜기 (설정 화면의 '진동' 칸)
//
// 어디서 울리나: 토스 빌드는 앱인토스 햅틱(Device.triggerHaptic), 구글플레이·iOS 앱은 출시 빌드가 넣는 Capacitor
// Haptics 플러그인(세기를 고른 진동), 휴대폰 브라우저(웹 공개)는 navigator.vibrate. 아이폰 브라우저는 진동이 없어요
// (canVibrate() false). 진동을 껐거나, 화면이 가려졌거나, 짧은 진동이 45ms 안에 또 오면 울리지 않고 false를 돌려줘요.
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION = 1;
  if (w.NcqDevice && w.NcqDevice.version >= VERSION) return; // 두 번 불러도 한 번만
  var d = w.document;
  var KEY = "ncq:vibration";
  var GAP = 45; // 이보다 가깝게 온 짧은 진동은 건너뛰어요 (겹치면 '징' 하는 떨림이 돼요)
  var MAX_MS = 1000; // 한 번에 울리는 가장 긴 시간
  var MAX_TOTAL = 5000; // 패턴 전체 길이
  var MAX_STEPS = 20;
  // 이름 → [토스 햅틱, 앱 햅틱(Capacitor Haptics: LIGHT·MEDIUM·HEAVY는 impact, SUCCESS·WARNING·ERROR는 notification),
  //          휴대폰 브라우저 진동(ms 또는 [켬, 끔, 켬…])]
  var KINDS = {
    tap: ["tap", "LIGHT", 12],
    light: ["tickWeak", "LIGHT", 8],
    medium: ["tickMedium", "MEDIUM", 16],
    heavy: ["basicMedium", "HEAVY", 28],
    success: ["success", "SUCCESS", [18, 60, 28]],
    warning: ["wiggle", "WARNING", [12, 40, 12, 40, 12]],
    error: ["error", "ERROR", [40, 50, 40]],
    // 토스 햅틱 이름 (토스는 그 햅틱, 다른 곳은 가까운 것으로)
    tickWeak: ["tickWeak", "LIGHT", 8],
    tickMedium: ["tickMedium", "MEDIUM", 16],
    softMedium: ["softMedium", "MEDIUM", 22],
    basicWeak: ["basicWeak", "LIGHT", 14],
    basicMedium: ["basicMedium", "HEAVY", 28],
    wiggle: ["wiggle", "WARNING", [12, 40, 12, 40, 12]],
    confetti: ["confetti", "SUCCESS", [20, 50, 20, 50, 40, 60, 70]]
  };
  var NOTICE = {SUCCESS: true, WARNING: true, ERROR: true};
  var LOWER = {};
  Object.keys(KINDS).forEach(function (k) { LOWER[k.toLowerCase()] = k; });
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  var on = null; // 진동 켬·끔 (null이면 저장된 값을 아직 안 읽음)
  var last = 0;
  var timers = [];
  var warned = {};

  function noop() {}

  function quiet(p) { // 약속(Promise)이 실패해도 조용히
    if (p && typeof p.then === "function") p.then(noop, noop);
  }

  function now() { return new Date().getTime(); }

  function hidden() { return !!d && d.visibilityState === "hidden"; }

  function tossHaptic() {
    var t = w.NcqToss;
    var dev = t && t.Device;
    return dev && typeof dev.triggerHaptic === "function" ? dev : null;
  }

  function appHaptic() {
    var cap = w.Capacitor;
    var h = cap && cap.Plugins && cap.Plugins.Haptics;
    if (!h || typeof h.impact !== "function") return null;
    try {
      if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
      if (typeof cap.isPluginAvailable === "function" && cap.isPluginAvailable("Haptics") === false) return null;
    } catch (e) {
      return null;
    }
    return h;
  }

  function webVibrate() {
    var nav = w.navigator;
    return nav && typeof nav.vibrate === "function" ? nav : null;
  }

  function stored() {
    if (on === null) {
      on = true;
      try {
        on = w.localStorage.getItem(KEY) !== "off";
      } catch (e) { /* 저장소가 막혀 있으면 켬 */ }
    }
    return on;
  }

  function vibration(value) {
    if (arguments.length && value !== undefined) {
      on = !!value; // 체크 칸의 checked처럼 참·거짓 (0도 끔)
      try {
        if (on) w.localStorage.removeItem(KEY);
        else w.localStorage.setItem(KEY, "off");
      } catch (e) { /* 이번 실행에만 */ }
      if (!on) stop();
    }
    return stored();
  }

  function canVibrate() {
    if (tossHaptic() || appHaptic()) return true;
    if (!webVibrate()) return false;
    try { // 브라우저 진동은 휴대폰에서만 (컴퓨터 브라우저에도 navigator.vibrate는 있지만 울릴 모터가 없어요)
      return (w.navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in w;
    } catch (e) {
      return false;
    }
  }

  function stop() {
    while (timers.length) clearTimeout(timers.pop());
    var nav = webVibrate();
    if (nav && !tossHaptic() && !appHaptic()) {
      try { nav.vibrate(0); } catch (e) { /* 멈출 진동이 없어요 */ }
    }
  }

  function ms(value) {
    var n = Math.round(Number(value) || 0);
    return n < 0 ? 0 : (n > MAX_MS ? MAX_MS : n);
  }

  function pattern(list) { // [켬, 끔, 켬…] → 앞에서부터 MAX_STEPS개, 모두 합쳐 MAX_TOTAL까지
    var out = [];
    var total = 0;
    for (var i = 0; i < list.length && out.length < MAX_STEPS; i++) {
      var v = Math.min(ms(list[i]), MAX_TOTAL - total);
      if (v <= 0 && i % 2 === 0) break;
      out.push(v);
      total += v;
      if (total >= MAX_TOTAL) break;
    }
    while (out.length && out.length % 2 === 0) out.pop(); // 끝은 '켬'으로
    return out;
  }

  function tossFor(length) { // 토스는 길이를 정할 수 없어서 비슷한 세기 한 번
    return length <= 20 ? "tickWeak" : (length <= 40 ? "tap" : "basicMedium");
  }

  function each(steps, fn) { // 패턴의 '켬'마다 fn(길이), 사이는 기다려요
    var at = 0;
    steps.forEach(function (v, i) {
      if (i % 2 === 0) {
        if (at === 0) fn(v);
        else timers.push(setTimeout(function () { if (!hidden()) fn(v); }, at));
      }
      at += v;
    });
  }

  function kindOf(value) {
    if (value === undefined || value === null || value === true) return KINDS.tap;
    if (typeof value === "string") {
      var k = own(KINDS, value) ? value : (own(LOWER, value.toLowerCase()) ? LOWER[value.toLowerCase()] : null);
      if (k) return KINDS[k];
      if (!own(warned, value)) {
        warned[value] = true;
        try { w.console.warn("[NcqDevice] 모르는 진동 이름이에요: " + value + " (tap light medium heavy success warning error)"); }
        catch (e) { /* 콘솔이 없어요 */ }
      }
    }
    return null;
  }

  function vibrate(value) {
    try {
      if (value === 0 || value === false) {
        stop();
        return false;
      }
      if (!stored() || hidden()) return false;
      var toss = tossHaptic();
      var app = toss ? null : appHaptic();
      var nav = toss || app ? null : webVibrate();
      if (!toss && !app && !nav) return false;
      var kind = null;
      var steps = null;
      if (Array.isArray(value)) {
        steps = pattern(value);
        if (!steps.length) return false;
      } else if (typeof value === "number") {
        steps = [ms(value)];
        if (!steps[0]) return false;
      } else {
        kind = kindOf(value);
        if (!kind) return false;
      }
      var short = steps ? steps.length === 1 && steps[0] <= 100 : !NOTICE[kind[1]] && !Array.isArray(kind[2]);
      var t = now();
      if (short && t - last < GAP) return false;
      last = t;
      while (timers.length) clearTimeout(timers.pop()); // 새 진동이 울리던 패턴을 바꿔요
      if (toss) {
        if (kind) quiet(toss.triggerHaptic({type: kind[0]}));
        else each(steps, function (v) { quiet(toss.triggerHaptic({type: tossFor(v)})); });
      } else if (app) {
        if (kind && NOTICE[kind[1]]) quiet(app.notification({type: kind[1]}));
        else if (kind) quiet(app.impact({style: kind[1]}));
        else each(steps, function (v) { quiet(app.vibrate({duration: v})); });
      } else {
        return nav.vibrate(kind ? kind[2] : (steps.length === 1 ? steps[0] : steps)) !== false;
      }
      return true;
    } catch (e) {
      return false; // 진동이 안 돼도 게임은 그대로
    }
  }

  if (d && d.addEventListener) {
    d.addEventListener("visibilitychange", function () { if (hidden()) stop(); });
  }

  w.NcqDevice = {version: VERSION, vibrate: vibrate, canVibrate: canVibrate, vibration: vibration};
})();
