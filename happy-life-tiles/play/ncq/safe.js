// NcqSafe — 엔크로키 공용 화면 안전 영역 모듈 (ncq/safe.js)
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 AGENTS.md의 '화면 안전 영역'에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   <script src="ncq/safe.js"></script>     index.html의 <head> 맨 앞 (빌드 도구 없이)
//   import "../ncq/safe.js";                  Vite 같은 빌드 도구를 쓰면 시작 파일 맨 위 (그다음 window.NcqSafe)
//
// CSS 변수 (웹 공개·안드로이드 앱·토스 어디서나 늘 있어요):
//   --ncq-top --ncq-right --ncq-bottom --ncq-left   버튼·글자를 두면 안 되는 가장자리 폭
//                                                     (기기 안전 영역 + 토스 게임의 메뉴 줄 + 배너 광고)
//   --ncq-safe-top·right·bottom·left               기기 안전 영역만 (상태 바·카메라 구멍·내비게이션 바·홈 인디케이터)
//   --ncq-toss-top --ncq-toss-right                토스 게임의 위 메뉴(⋯·✕) 줄 높이·오른쪽 너비 (토스 밖은 0)
//   --ncq-banner-top --ncq-banner-bottom           배너 광고 높이 (광고 도구 NcqAds가 넣어요, 없으면 0)
//
// JS (캔버스 게임·화면 시험):
//   NcqSafe.space()       {top, right, bottom, left, menu}  --ncq-top 등을 px 숫자로 (menu: 오른쪽 위 토스 메뉴 너비)
//   NcqSafe.insets()      {top, right, bottom, left}        기기 안전 영역만
//   NcqSafe.onChange(fn)  값이 바뀌면 fn(space) (화면 돌림·크기·토스 안전 영역·배너). 그만 받는 함수를 돌려줘요
//   NcqSafe.check(el)     {ok, name, problems}  el이 가리는 자리 밖에 다 보이고 다른 것(하단 메뉴 등)에 가리지 않는지
//   NcqSafe.checkAll()    {ok, count, items}    data-ncq-main을 붙인, 지금 보이는 요소(메인 버튼) 모두 check
//
// 시험·스크린샷: 주소에 ?ncq-safe=android | iphone | toss | 24,0,48,0 (위,오른쪽,아래,왼쪽 px)를 붙이면 그 기기처럼
// 자리를 비우고 가리는 자리를 반투명 막대로 그려요. &ncq-banner=50 은 아래 배너 자리예요.
// 흉내 낼 때는 가린 메인 버튼(data-ncq-main)에 빨간 점선을 그리고 콘솔에 알려요.
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  var d = w && w.document;
  if (!d || !d.documentElement) return;
  var VERSION = 1;
  if (w.NcqSafe && w.NcqSafe.version >= VERSION) return; // 두 번 불러도 한 번만

  var EDGES = ["top", "right", "bottom", "left"];
  // 토스 게임의 위 메뉴(⋯·✕) 자리: 빌드의 토스 화면 맞춤(ncq_build.py TOSS_LOOK)과 같은 값
  var TOSS_MENU_H = 54;
  var TOSS_MENU_W = 110;
  var PRESETS = {
    android: {top: 32, right: 0, bottom: 48, left: 0, name: "안드로이드 (3버튼 내비게이션)", bar: "내비게이션 바"},
    iphone: {top: 59, right: 0, bottom: 34, left: 0, name: "아이폰 (다이내믹 아일랜드)", bar: "홈 인디케이터"},
    toss: {top: 59, right: 0, bottom: 34, left: 0, name: "토스 게임 (아이폰)", bar: "홈 인디케이터", toss: true}
  };
  var Z = 2147483000;
  var root = d.documentElement;
  var listeners = [];
  var last = null;
  var pending = false;
  var probe = null;
  var sim = null;
  var warned = {};

  function rule() {
    // 안드로이드 앱(Capacitor 8)은 WebView를 안전 영역 안에 두거나(env = 0) 화면 끝까지 그리면서 env에 진짜 값을 넣고,
    // 같은 값을 --safe-area-inset-*로도 넣어요. 토스는 env가 0일 수 있어서 빌드가 --ncq-safe-*를 직접 넣어요(인라인이 이겨요).
    var css = ":root{";
    EDGES.forEach(function (k) {
      css += "--ncq-safe-" + k + ":max(env(safe-area-inset-" + k + ",0px),var(--safe-area-inset-" + k + ",0px));";
    });
    css += "--ncq-toss-top:0px;--ncq-toss-right:0px;--ncq-banner-top:0px;--ncq-banner-bottom:0px;" +
      "--ncq-top:calc(max(var(--ncq-toss-top),var(--ncq-safe-top)) + var(--ncq-banner-top));" +
      "--ncq-bottom:calc(var(--ncq-safe-bottom) + var(--ncq-banner-bottom));" +
      "--ncq-left:var(--ncq-safe-left);--ncq-right:var(--ncq-safe-right)}" +
      ".ncq-safe-bad{outline:3px dashed #ff3b30 !important;outline-offset:2px !important}";
    return css;
  }

  function addStyle() {
    if (d.getElementById("ncq-safe-style")) return;
    var s = d.createElement("style");
    s.id = "ncq-safe-style";
    s.textContent = rule();
    var at = d.head || root;
    at.insertBefore(s, at.firstChild); // 맨 앞: 게임 CSS가 같은 변수를 정하면 게임 쪽이 이겨요
  }

  function num(v) {
    v = parseFloat(v);
    return isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0;
  }

  function measure() {
    if (!probe) {
      probe = d.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;" +
        "pointer-events:none;box-sizing:content-box;" +
        "padding:var(--ncq-top) var(--ncq-right) var(--ncq-bottom) var(--ncq-left);" +
        "margin:var(--ncq-safe-top) var(--ncq-safe-right) var(--ncq-safe-bottom) var(--ncq-safe-left);" +
        "border:0 solid transparent;border-right-width:var(--ncq-toss-right);border-bottom-width:var(--ncq-banner-bottom)";
    }
    if (!probe.parentNode) (d.body || root).appendChild(probe);
    return w.getComputedStyle(probe);
  }

  function space() {
    var s = measure();
    return {top: num(s.paddingTop), right: num(s.paddingRight), bottom: num(s.paddingBottom), left: num(s.paddingLeft),
            menu: num(s.borderRightWidth)};
  }

  function insets() {
    var s = measure();
    return {top: num(s.marginTop), right: num(s.marginRight), bottom: num(s.marginBottom), left: num(s.marginLeft)};
  }

  function bannerBottom() { return num(measure().borderBottomWidth); }

  function viewport() {
    return {w: w.innerWidth || root.clientWidth || 0, h: w.innerHeight || root.clientHeight || 0};
  }

  function describe(el) {
    if (!el || !el.tagName) return String(el);
    var label = el.getAttribute && el.getAttribute("data-ncq-main");
    if (label) return label;
    var cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean)
      .filter(function (c) { return c !== "ncq-safe-bad"; }).slice(0, 2) : [];
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls.length ? "." + cls.join(".") : "");
  }

  function visible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var s = w.getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  }

  // 가린 것의 이름: 화면에 떠 있는(fixed·sticky) 막대나 이름(id) 있는 가까운 조상으로 (탭 바의 아이콘 대신 탭 바)
  function coverName(el) {
    var cur = el;
    for (var i = 0; cur && cur !== d.body && cur !== root && i < 8; i++, cur = cur.parentElement) {
      var pos = w.getComputedStyle(cur).position;
      if (pos === "fixed" || pos === "sticky") return describe(cur);
    }
    cur = el;
    for (var j = 0; cur && cur !== d.body && j < 4; j++, cur = cur.parentElement) {
      if (cur.id) return describe(cur);
    }
    return describe(el);
  }

  // 요소 안쪽 다섯 점(가운데와 1/4 안쪽 네 곳)에서 맨 위에 있는 게 그 요소(나 안쪽)인지. 둥근 모서리는 피해서 봐요
  function coveredBy(el, r, vp) {
    var pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    for (var i = 0; i < pts.length; i++) {
      var x = r.left + r.width * pts[i][0];
      var y = r.top + r.height * pts[i][1];
      if (x < 0 || y < 0 || x >= vp.w || y >= vp.h) continue;
      var top = d.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      return coverName(top);
    }
    return null;
  }

  function check(target) {
    var el = typeof target === "string" ? d.querySelector(target) : target;
    if (!el || !el.getBoundingClientRect) return {ok: false, name: String(target), problems: ["찾을 수 없어요"]};
    var name = describe(el);
    if (!visible(el)) return {ok: false, name: name, problems: ["보이지 않아요 (숨김·크기 0)"]};
    var r = el.getBoundingClientRect();
    var vp = viewport();
    var s = space();
    var E = 0.5;
    var problems = [];
    if (r.top >= vp.h) {
      problems.push("화면 아래 밖에 있어요 (스크롤해야 보여요)");
    } else if (r.bottom <= 0 || r.right <= 0 || r.left >= vp.w) {
      problems.push("화면 밖에 있어요");
    } else {
      if (r.top < s.top - E) problems.push("위 가리는 자리(상태 바·카메라 구멍" + (s.menu ? "·토스 메뉴 줄" : "") + ")에 걸려요");
      if (r.bottom > vp.h - s.bottom + E) {
        problems.push(r.bottom > vp.h + E ? "아래가 화면 밖으로 나가요 (스크롤해야 다 보여요)"
          : "아래 가리는 자리(내비게이션 바·홈 인디케이터" + (bannerBottom() ? "·배너" : "") + ")에 걸려요");
      }
      if (r.left < s.left - E || r.right > vp.w - s.right + E) problems.push("옆 가리는 자리나 화면 밖에 걸려요");
      var by = coveredBy(el, r, vp);
      if (by) problems.push(by + "에 가려요");
    }
    return {ok: !problems.length, name: name, problems: problems,
            rect: {top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right)}};
  }

  function checkAll(selector) {
    var list = Array.prototype.slice.call(d.querySelectorAll(selector || "[data-ncq-main]")).filter(visible);
    var items = list.map(check);
    return {ok: items.every(function (i) { return i.ok; }), count: items.length, items: items};
  }

  // ------------------------------------------------------------ 바뀜 알림
  function fire() {
    pending = false;
    var s = space();
    var key = JSON.stringify(s);
    if (sim) mark();
    if (key === last) return;
    last = key;
    listeners.slice().forEach(function (fn) {
      try { fn(s); } catch (e) { if (w.console) w.console.error(e); }
    });
  }

  function schedule() {
    if (pending) return;
    pending = true;
    (w.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fire);
  }

  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    if (last === null) last = JSON.stringify(space());
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // ------------------------------------------------------------ 흉내 (시험·스크린샷)
  function parseSim() {
    var q;
    try { q = new w.URLSearchParams(w.location.search || ""); } catch (e) { return null; }
    var v = (q.get("ncq-safe") || "").trim().toLowerCase();
    var b = num(q.get("ncq-banner"));
    if (!v && !b) return null;
    var p = PRESETS[v];
    if (!p && /^\d+(\.\d+)?(,\d+(\.\d+)?){3}$/.test(v)) {
      var n = v.split(",").map(Number);
      p = {top: n[0], right: n[1], bottom: n[2], left: n[3], name: v + " (위,오른쪽,아래,왼쪽)", bar: "아래 안전 영역"};
    }
    if (v && !p) {
      if (w.console) w.console.warn("NcqSafe: ?ncq-safe=" + v + "는 모르는 값이에요 (android, iphone, toss, 24,0,48,0)");
      if (!b) return null;
    }
    p = p || {top: 0, right: 0, bottom: 0, left: 0, name: "", bar: ""};
    return {top: p.top, right: p.right, bottom: p.bottom, left: p.left, name: p.name, bar: p.bar, toss: !!p.toss, banner: b};
  }

  function bar(css, text, bg) {
    var el = d.createElement("div");
    el.style.cssText = "position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;" +
      "box-sizing:border-box;color:#fff;font:600 10px/1.2 system-ui,sans-serif;letter-spacing:0;white-space:nowrap;" +
      "background:" + (bg || "rgba(0,0,0,.55)") + ";" + css;
    el.textContent = text || "";
    return el;
  }

  function applySim() {
    var s = root.style;
    EDGES.forEach(function (k) { s.setProperty("--ncq-safe-" + k, sim[k] + "px"); });
    s.setProperty("--ncq-toss-top", (sim.toss ? sim.top + TOSS_MENU_H : 0) + "px");
    s.setProperty("--ncq-toss-right", (sim.toss ? sim.right + TOSS_MENU_W : 0) + "px");
    if (sim.banner) s.setProperty("--ncq-banner-bottom", sim.banner + "px");
    root.classList.add("ncq-safe-sim");
    var box = d.createElement("div");
    box.id = "ncq-safe-sim";
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:" + Z;
    if (sim.top) box.appendChild(bar("left:0;right:0;top:0;height:" + sim.top + "px", "상태 바"));
    if (sim.bottom) {
      box.appendChild(bar("left:0;right:0;bottom:0;height:" + sim.bottom + "px", sim.bar));
    }
    if (sim.left) box.appendChild(bar("left:0;top:0;bottom:0;width:" + sim.left + "px", ""));
    if (sim.right) box.appendChild(bar("right:0;top:0;bottom:0;width:" + sim.right + "px", ""));
    if (sim.toss) {
      box.appendChild(bar("left:0;right:0;top:" + sim.top + "px;height:" + TOSS_MENU_H + "px", "",
                          "rgba(49,130,246,.18)"));
      box.appendChild(bar("right:" + (sim.right + 10) + "px;top:" + (sim.top + 10) + "px;width:" + (TOSS_MENU_W - 20) +
        "px;height:34px;border-radius:17px;font-size:13px", "⋯   ✕", "rgba(0,0,0,.6)"));
    }
    if (sim.banner) {
      box.appendChild(bar("left:0;right:0;bottom:" + sim.bottom + "px;height:" + sim.banner + "px;" +
        "border-top:1px dashed #9aa6b2;color:#4a5561", "배너 " + sim.banner,
        "repeating-linear-gradient(135deg,rgba(238,241,244,.92) 0 12px,rgba(226,231,236,.92) 12px 24px)"));
    }
    d.body.appendChild(box);
    if (w.console && sim.name) w.console.info("NcqSafe: " + sim.name + "처럼 안전 영역을 흉내 내요");
    watchScreen();
    mark();
  }

  function mark() { // 표시가 바뀔 때만 class를 건드려요 (지켜보기가 다시 부르지 않게)
    var all = d.querySelectorAll("[data-ncq-main], .ncq-safe-bad");
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var c = el.hasAttribute("data-ncq-main") && visible(el) ? check(el) : null;
      var bad = !!(c && !c.ok);
      if (el.classList.contains("ncq-safe-bad") !== bad) el.classList.toggle("ncq-safe-bad", bad);
      if (!bad) continue;
      var key = c.name + ":" + c.problems.join("/");
      if (!warned[key] && w.console) {
        warned[key] = true;
        w.console.warn("NcqSafe: 메인 버튼 '" + c.name + "' — " + c.problems.join(", "));
      }
    }
  }

  function watchScreen() { // 흉내 낼 때만: 화면이 바뀌면(다른 화면·팝업) 메인 버튼을 다시 봐요
    if (!w.MutationObserver || !d.body) return;
    var t = null;
    new w.MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var n = list[i].target;
        if (n && n.id === "ncq-safe-sim") return;
      }
      clearTimeout(t);
      t = setTimeout(mark, 250);
    }).observe(d.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"]});
  }

  // ------------------------------------------------------------ 시작
  addStyle();
  w.addEventListener("resize", schedule);
  w.addEventListener("orientationchange", schedule);
  w.addEventListener("ncq-banner", schedule);
  if (w.visualViewport && w.visualViewport.addEventListener) w.visualViewport.addEventListener("resize", schedule);
  if (w.MutationObserver) { // 토스 빌드·Capacitor가 바꾸는 <html> 인라인 변수
    new w.MutationObserver(schedule).observe(root, {attributes: true, attributeFilter: ["style"]});
  }
  sim = parseSim();
  if (sim) {
    if (d.body) applySim();
    else d.addEventListener("DOMContentLoaded", applySim);
  }

  w.NcqSafe = {
    version: VERSION, space: space, insets: insets, onChange: onChange, check: check, checkAll: checkAll,
    simulated: function () { return sim ? {name: sim.name, top: sim.top, right: sim.right, bottom: sim.bottom,
                                          left: sim.left, toss: sim.toss, banner: sim.banner} : null; }
  };
})();
