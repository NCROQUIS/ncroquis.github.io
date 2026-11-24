/* NcqDisplay — 기기 화면 설정 한 곳 (엔크로키 공용 모듈). ES5로 써요 (오래된 WebView에서 게임 코드보다 먼저 돌아요).
 * 출시 빌드는 ncq-flags.js에 붙이고(설정은 window.NCQ.NCQ_DISPLAY), 개발 화면은 <head>에서 불러 같은 동작을 해요.
 *   확대·축소 막기  viewport에 maximum-scale=1·user-scalable=no, 두 번 탭은 *{touch-action:manipulation}(게임이 요소에 적은
 *                   touch-action이 이겨요), 아이폰 사파리의 손가락 두 개 확대는 gesture 이벤트를 막아요. 게임이 받는 터치는 그대로.
 *                   열기: 설정 zoom "open"(release/android.json의 "zoom": true) 또는 <html data-ncq-zoom="open">.
 *   글자 크기 고정  브라우저의 자동 글자 확대를 꺼요 (text-size-adjust:100%). 설정 textScale "system"이면 그대로.
 *   화면 켜 두기    웹(브라우저)은 Screen Wake Lock을 보이는 동안 잡아요. 안드로이드·iOS 앱은 빌드가 네이티브로, 토스는
 *                   ncq-toss.js가 앱인토스 Screen으로 해요. 설정 awake false면 아무것도 안 해요.
 * 상태는 NcqDisplay.state(). 예전 이름 NcqNoZoom·NcqAwake도 그대로 둬요 (두 번 불려도 한 번만 설치). */
(function (w, d) {
  "use strict";
  if (!w || w.NcqDisplay) return;
  var NCQ = w.NCQ || {};
  var cfg = NCQ.NCQ_DISPLAY || {};
  var platform = String(NCQ.NCQ_PLATFORM || "");
  var root = d && d.documentElement;
  var zoomOpen = cfg.zoom === "open" || !!(root && root.getAttribute("data-ncq-zoom") === "open");
  var textScale = cfg.textScale === "system" ? "system" : "web";
  var awakeOn = cfg.awake !== false;
  var awakeHow = !awakeOn ? false : (platform === "" || platform === "web") ? "web"
    : (platform === "android" || platform === "ios") ? "native" : platform;
  var wake = null;

  function head() { return d.head || d.getElementsByTagName("head")[0] || root; }
  function firstStyle(id, css) {  // <head> 맨 앞에 (게임 CSS가 뒤에서 이기게). 빌드가 이미 넣었으면 그대로
    if (!d || d.getElementById(id)) return;
    var s = d.createElement("style");
    s.id = id;
    s.appendChild(d.createTextNode(css));
    var h = head();
    if (h) h.insertBefore(s, h.firstChild);
  }
  function lockViewport() {
    var meta = d.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = d.createElement("meta");
      meta.setAttribute("name", "viewport");
      meta.setAttribute("content", "width=device-width, initial-scale=1");
      var h = head();
      if (h) h.insertBefore(meta, h.firstChild);
    }
    var parts = String(meta.getAttribute("content") || "").split(",");
    var kept = [], locked = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/^\s+|\s+$/g, "");
      if (!p) continue;
      if (/^user-scalable\s*=\s*(no|0)$/i.test(p) || /^maximum-scale\s*=\s*1(\.0*)?$/i.test(p)) locked++;
      if (/^(maximum-scale|user-scalable)\s*=/i.test(p)) continue;
      kept.push(p);
    }
    if (locked < 2) meta.setAttribute("content", kept.concat(["maximum-scale=1", "user-scalable=no"]).join(", "));
  }
  function noZoom() {
    if (w.NcqNoZoom) return;  // 예전 빌드의 NCQ_NO_ZOOM이 이미 막고 있어요
    var stop = function (e) { if (e && e.cancelable !== false && e.preventDefault) e.preventDefault(); };
    var names = ["gesturestart", "gesturechange", "gestureend"];
    for (var i = 0; i < names.length; i++) d.addEventListener(names[i], stop, {passive: false});
    w.NcqNoZoom = Object.freeze({version: 1});
  }
  function keepAwake() {  // 브라우저의 Screen Wake Lock: 화면을 내리면 브라우저가 풀고, 다시 보면 다시 잡아요
    var nav = w.navigator, wl = nav && nav.wakeLock;
    if (!wl || typeof wl.request !== "function" || w.NcqAwake) return;
    var lock = null, asking = false, refused = 0;
    var held = function () { return !!lock && lock.released !== true; };
    var grab = function () {
      if (held() || asking || d.visibilityState === "hidden" || new Date().getTime() - refused < 1000) return;
      var p = wl.request("screen");
      if (!p || typeof p.then !== "function") return;
      asking = true;
      p.then(function (s) {
        asking = false;
        if (!s || s.released === true) return;
        lock = s;
        try { s.addEventListener("release", function () { if (lock === s) lock = null; }); } catch (e) { /* 다음 확인 때 */ }
      }, function () { asking = false; refused = new Date().getTime(); });
    };
    var poke = function () { try { grab(); } catch (e) { asking = false; refused = new Date().getTime(); } };
    d.addEventListener("visibilitychange", poke);
    w.addEventListener("pageshow", poke);
    w.addEventListener("focus", poke);
    var taps = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
    for (var i = 0; i < taps.length; i++) d.addEventListener(taps[i], poke, true);
    w.NcqAwake = Object.freeze({version: 1, held: held});
    wake = held;
    poke();
  }
  function step(fn) { try { fn(); } catch (e) { /* 하나가 안 돼도 게임과 나머지는 그대로 */ } }

  if (d) {
    if (!zoomOpen) {
      // 게임의 viewport 태그가 이 스크립트 뒤에 있으면(<head> 맨 앞에서 불렀을 때) 다 읽은 뒤에 맞춰요 (태그를 둘로 만들지 않게)
      if (d.querySelector('meta[name="viewport"]') || d.readyState !== "loading") step(lockViewport);
      else d.addEventListener("DOMContentLoaded", function () { step(lockViewport); });
      step(function () { firstStyle("ncq-no-zoom", "*{touch-action:manipulation}"); });
      step(noZoom);
    }
    if (textScale === "web") {
      step(function () {
        firstStyle("ncq-text-scale", ":where(html){font-size:16px}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}");
      });
    }
    if (awakeHow === "web") step(keepAwake);
  }
  w.NcqDisplay = Object.freeze({
    version: 1,
    state: function () {
      var vp = w.NcqViewport && typeof w.NcqViewport.status === "function" ? w.NcqViewport.status() : null;
      return {
        zoom: zoomOpen ? "open" : "locked",
        textScale: textScale,
        awake: awakeHow,
        awakeHeld: wake ? wake() : null,
        pageScroll: vp ? !!vp.pageScroll : null,
        motion: w.NcqMotion && w.NcqMotion.policy ? String(w.NcqMotion.policy) : null
      };
    }
  });
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);
