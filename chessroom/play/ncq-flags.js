/* 엔크로키 출시 빌드 표시 (ncq_build.py가 만들어요) */
window.NCQ = Object.freeze({"NCQ_MARKET_WEB": true, "NCQ_TRACK_PUBLIC": true, "NCQ_PLATFORM": "web", "NCQ_VERSION": "0.2.0", "NCQ_VERSION_CODE": 0, "NCQ_PACKAGE": "com.ncroquis.chessroom", "NCQ_FEEDBACK": {"url": "https://kickoff-476465444216.asia-northeast3.run.app/ncq/v1/feedback/chessroom", "board": "https://ncroquis.github.io/chessroom/feedback/"}, "NCQ_AUTH": {"url": "https://ncq-game-api-476465444216.asia-northeast3.run.app", "game": "chessroom", "environment": "prod", "platform": "web", "firebase": {"projectId": "ncq-auth-prod", "apiKey": "AIzaSyDqEPsungpngw_qgoPvZhCGRZah1KpjQTk", "appId": "1:82264449125:web:1f719a207abad22b95e68c"}}, "NCQ_WEB_DESTINATION": "public", "NCQ_SOURCE_COMMIT": "46de806f357370b991a08d97645fbf3e0b5fc293", "NCQ_VIEWPORT": {"pageScroll": false}, "NCQ_DISPLAY": {"zoom": "locked", "awake": true, "textScale": "web"}});
Object.assign(window, window.NCQ);
/* NcqViewport — fixed game page, native inner scrolling and editable controls. ES2017. */
(function (w, d) {
  "use strict";
  if (!w || !d || !d.documentElement || !d.createElement || w.NcqViewport) return;
  var root = d.documentElement, gesture = null;
  var editable = "input,textarea,select,[contenteditable]:not([contenteditable='false']),[data-ncq-selectable],[data-copyable]";
  var config = (w.NCQ || {}).NCQ_VIEWPORT || {};
  var pageScroll = root.getAttribute("data-ncq-page-scroll") === "true" || config.pageScroll === true;
  var css = "html[data-ncq-viewport=locked]{height:100%;overflow:hidden;overscroll-behavior:none}" +
    "html[data-ncq-viewport=locked] body{height:100%;overflow:hidden;overscroll-behavior:none}" +
    "html[data-ncq-viewport] *{-webkit-tap-highlight-color:transparent}" +
    "html[data-ncq-viewport=locked] *{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}" +
    editable.split(",").map(function (selector) { return "html[data-ncq-viewport] " + selector; }).join(",") + "," +
    "html[data-ncq-viewport] [contenteditable]:not([contenteditable=false]) *,html[data-ncq-viewport] [data-ncq-selectable] *,html[data-ncq-viewport] [data-copyable] *" +
    "{-webkit-touch-callout:default;-webkit-user-select:text;user-select:text}" +
    "html[data-ncq-viewport=locked] img{-webkit-user-drag:none}";
  var style = d.createElement("style"); style.id = "ncq-viewport-style"; style.textContent = css;
  (d.head || root).appendChild(style);
  function apply() {
    root.setAttribute("data-ncq-viewport", pageScroll ? "scroll" : "locked");
    if (!pageScroll) w.scrollTo(0, 0);
  }
  function path(event) {
    if (event.composedPath) return event.composedPath().filter(function (node) { return node && node.nodeType === 1; });
    var nodes = [], node = event.target;
    while (node) { if (node.nodeType === 1) nodes.push(node); node = node.parentElement; }
    return nodes;
  }
  d.addEventListener("touchstart", function (event) {
    if (pageScroll || event.touches.length !== 1) { gesture = null; return; }
    var point = event.touches[0], nodes = path(event);
    gesture = { id:point.identifier, x:point.clientX, y:point.clientY, startX:point.clientX, startY:point.clientY, axis:null, nodes:nodes,
      editing:nodes.some(function (node) { return node.matches(editable); }) };
  }, { passive:true });
  d.addEventListener("touchmove", function (event) {
    if (pageScroll || !gesture || event.touches.length !== 1 || gesture.editing) return;
    var point = Array.prototype.find.call(event.touches, function (touch) { return touch.identifier === gesture.id; });
    if (!point) return;
    var dx = gesture.x - point.clientX, dy = gesture.y - point.clientY;
    gesture.x = point.clientX; gesture.y = point.clientY;
    if (!dx && !dy) return;
    var totalX = gesture.startX - point.clientX, totalY = gesture.startY - point.clientY;
    if (gesture.axis === null) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 4) return;
      gesture.axis = Math.abs(totalY) >= Math.abs(totalX) ? "y" : "x";
    }
    var vertical = gesture.axis === "y", delta = vertical ? dy : dx;
    if (!delta) return;
    for (var i = 0; i < gesture.nodes.length; i++) {
      var node = gesture.nodes[i];
      if (node === d.body || node === root) break;
      var computed = w.getComputedStyle(node), overflow = vertical ? computed.overflowY : computed.overflowX;
      if (!/^(auto|scroll)$/.test(overflow)) continue;
      var position = vertical ? node.scrollTop : node.scrollLeft;
      var limit = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
      var direction = delta;
      if (!vertical && computed.direction === "rtl") { position = -position; direction = -delta; }
      if (limit > 1 && (direction < 0 ? position > 0 : position < limit - 1)) return;
    }
    if (event.cancelable) event.preventDefault();
  }, { passive:false });
  ["touchend", "touchcancel"].forEach(function (type) {
    d.addEventListener(type, function () { gesture = null; }, { passive:true });
  });
  w.NcqViewport = {
    configure:function (options) {
      if (options && typeof options.pageScroll === "boolean") { pageScroll = options.pageScroll; gesture = null; apply(); }
      return { pageScroll:pageScroll };
    },
    status:function () { return { pageScroll:pageScroll }; }
  };
  apply();
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);

if(window.NcqViewport && typeof window.NcqViewport.configure === 'function' && window.NCQ.NCQ_VIEWPORT){window.NcqViewport.configure(window.NCQ.NCQ_VIEWPORT);}

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

/* 엔크로키 지표 모듈 (ncq_build.py가 ncq-flags.js 뒤에 붙여요. 직접 고치지 마세요)
   ncq-metrics 9 (2: 판 시작·끝 NcqMetrics.levelStart·levelEnd, 3: 광고·결제 도구가 보내는 광고·결제 이벤트,
   4: 저장 모듈의 save_tamper, 5: 게임 오류 app_error, 6: 토스 포인트 지급 promo_reward, 7: 진행 단계 NcqMetrics.step,
   8: 초기 반복 동선 NcqMetrics.flow — 20판·300건·14일, 9: 비정상 종료 app_exit·웹뷰 되살림 app_recover)

   아래 이벤트는 게임 코드가 할 일 없이 저절로 모아 킥오프 서버로 보내요.
     first_open     이 기기에서 처음 실행 (설치 ID를 만들 때)
     session_start  세션 시작 (30분 넘게 쉬었다 다시 열면 새 세션)
     engagement     화면을 보고 있던 시간(ms). 화면을 벗어날 때와 5분마다
     app_update     버전이 바뀐 뒤 처음 실행
   한 판씩 하는 게임은 판 시작·끝을 알려요 (Firebase 추천 이벤트와 같은 이름. 경험치로 오르는 유저 레벨이 아니에요):
     NcqMetrics.levelStart("stage-3")                  → level_start {level_name, round}
     NcqMetrics.levelEnd("stage-3", true, {score: 120}) → level_end {level_name, round, success, ms, score}
   진행 단계는 처음 거친 단계를 알려요 (이탈 지점: 새로 온 사람이 어느 단계까지 왔다가 떠나는지):
     NcqMetrics.step("03_first_match")                 → step {step_name}  (설치마다 단계 이름당 처음 한 번만 보내요)
   판 이름은 스테이지나 모드(예: "endless")예요. ms는 시작부터 끝까지 화면을 보고 있던 시간이고, 끝을 알리지 않은 판은
   서버가 '그만둔 판'으로 세요.
   광고·결제는 공용 도구(NcqAds·NcqIap)가 NcqMetrics._tool로 알려요 (게임 코드는 할 일이 없어요):
     ad_load·ad_fail·ad_show·ad_reward·ad_call {slot, format, stage, why, result}
     purchase_start·purchase·purchase_cancel·purchase_fail·purchase_restore {product, kind, amount, currency, qty, code}
   공용 저장 모듈(NcqSave)은 기기 저장이 바깥에서 바뀐 걸 알아채면 save_tamper {where}를 알려요 (지표 모듈 4).
   게임 스크립트에서 잡히지 않은 오류는 app_error {kind, msg, src, line}로 알려요 (지표 모듈 5, 업데이트 뒤 깨진 버전을
   찾으려고). 글의 주소·이메일·긴 숫자는 지우고 120자까지, 한 번 열 때 같은 오류는 한 번·모두 10개까지예요.
   화면을 보던 중에 앱이 끝났으면(크래시·응답 없음 강제 종료·메모리 부족 — 사용자가 닫으면 화면을 먼저 벗어나서 세지 않아요)
   다음에 열 때 app_exit {up, pvn, pvc}로 알려요 (지표 모듈 9, 끝난 때의 시각·버전으로). 안드로이드 앱이 죽은 웹뷰를 되살렸으면
   (빌드가 넣는 NcqSystem) 그 일은 app_recover {n, crashed, fg}로 알리고 app_exit로 또 세지 않아요.
   설치 ID는 코드네임별 무작위 값이라 기기·광고 ID·개인정보와 이어지지 않아요. 앱을 지우면 함께 지워져요.
   보내지 못한 이벤트는 기기에 모아 뒀다가(최대 300개) 다음에 보내요. 서버가 받았다고 답한 것만 지워요.
   같은 이벤트가 두 번 가도 서버 집계가 이벤트 ID로 한 번만 세요. 오류가 나도 게임은 그대로 돌아가요. */
(function (cfg) {
  "use strict";
  if (!cfg || !cfg.url || !cfg.cn || typeof window === "undefined" || typeof document === "undefined") return;

  var SDK = 9;
  var SESSION_GAP = 30 * 60 * 1000;      // 이만큼 쉬면 새 세션
  var BEAT = 15 * 1000;                  // 살아 있음 기록 (꺼져도 그때까지 시간은 남는다)
  var ENGAGE_EVERY = 5 * 60 * 1000;      // 오래 켜 둬도 이만큼마다 플레이 시간을 보낸다
  var FLUSH_EVERY = 10 * 1000;
  var INFLIGHT_TIMEOUT = 60 * 1000;      // 이만큼 지나도 답이 없으면 다시 보낼 수 있다
  var BATCH = 50;
  var MAX_QUEUE = 300;
  var PREFIX = "ncq:" + cfg.cn + ":";    // 공개 페이지는 여러 게임이 같은 주소라 코드네임별로 따로 둔다

  var mem = {};
  function load(key) {
    try { var v = window.localStorage.getItem(PREFIX + key); return v === null ? (mem[key] || null) : v; }
    catch (e) { return mem[key] || null; }
  }
  function save(key, value) {
    mem[key] = value;
    try { window.localStorage.setItem(PREFIX + key, value); } catch (e) { /* 저장소가 없거나 가득 참 */ }
  }
  function loadJson(key) {
    try { return JSON.parse(load(key) || "null"); } catch (e) { return null; }
  }
  function rand(n) {
    var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", out = "", i, bytes = null;
    try {
      bytes = new Uint8Array(n);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
    } catch (e) { bytes = null; }
    for (i = 0; i < n; i++) out += abc.charAt(bytes ? bytes[i] & 63 : Math.floor(Math.random() * 64));
    return out;
  }
  function now() { return Date.now(); }
  function osName() {
    var ua = (navigator.userAgent || "").toLowerCase();
    if (ua.indexOf("android") >= 0) return "android";
    if (/iphone|ipad|ipod/.test(ua) || (ua.indexOf("macintosh") >= 0 && navigator.maxTouchPoints > 1)) return "ios";
    if (ua.indexOf("cros") >= 0) return "chromeos";
    if (ua.indexOf("windows") >= 0) return "windows";
    if (ua.indexOf("mac os") >= 0) return "mac";
    if (ua.indexOf("linux") >= 0) return "linux";
    return "other";
  }
  function timezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; }
  }

  // ------------------------------------------------------------ 상태
  var ctx = {cn: cfg.cn, pf: cfg.pf || "", mk: cfg.mk || "", tr: cfg.tr || "", vn: cfg.vn || "",
             vc: cfg.vc || 0, cm: cfg.cm || "", ft: cfg.ft || []};
  var ctxKey = [ctx.pf, ctx.mk, ctx.tr, ctx.vn, ctx.vc, ctx.cm, ctx.ft.join(",")].join("|");
  var device = {tz: timezone(), lg: navigator.language || "", os: osName(), sdk: SDK};
  var iid = load("iid");
  var firstOpen = !iid || !/^[A-Za-z0-9_-]{16,40}$/.test(iid);
  if (firstOpen) { iid = rand(22); save("iid", iid); }
  var seq = parseInt(load("seq") || "0", 10) || 0;
  var queue = loadJson("q");
  if (!queue || typeof queue !== "object" || !queue.e || !queue.c) queue = {c: {}, e: []};
  queue.c[ctxKey] = ctx;
  var session = loadJson("sess");
  var visibleSince = null, pendingMs = 0, lastEngage = now(), lastBeat = now();
  var sendingAt = 0, sendTicket = 0, failures = 0, retryAt = 0;  // 정기 전송은 한 번에 하나 (답이 1분 넘게 없으면 다음)
  var inflight = {};  // 보내는 중인 이벤트 ID → 보낸 시각 (답을 받기 전에 같은 이벤트를 또 보내지 않게)
  var rounds = {};    // 진행 중인 판: 판 이름 → {r: 판 ID, t: 시작, away: 안 보고 있던 시간, hid: 숨은 시각}

  function persistQueue() {
    var used = {}, c = {}, k;
    for (var i = 0; i < queue.e.length; i++) used[queue.e[i].k] = true;
    used[ctxKey] = true;
    for (k in queue.c) if (used[k]) c[k] = queue.c[k];
    queue.c = c;
    save("q", JSON.stringify(queue));
  }
  function track(name, props, stamp) {
    seq += 1;
    save("seq", String(seq));
    var ev = {i: rand(16), n: name, t: stamp ? stamp.time : now(), s: stamp ? stamp.session : session ? session.id : undefined, q: seq, k: ctxKey};
    if (props) ev.p = props;
    queue.e.push(ev);
    if (queue.e.length > MAX_QUEUE) queue.e.splice(0, queue.e.length - MAX_QUEUE);
    persistQueue();
    if (queue.e.length >= 20) flush(false);
  }

  // ------------------------------------------------------------ 보내기
  function busy(id, t) {
    return Object.prototype.hasOwnProperty.call(inflight, id) && t - inflight[id] < INFLIGHT_TIMEOUT;
  }
  function batch() {  // 보내는 중이 아닌 이벤트 중 같은 빌드 정보(k)인 것을 BATCH개까지
    var t = now(), k = null, picked = [], ids = {}, count = 0;
    for (var i = 0; i < queue.e.length && picked.length < BATCH; i++) {
      var ev = queue.e[i];
      if (busy(ev.i, t)) continue;
      if (k === null) k = ev.k;
      if (ev.k !== k) continue;
      var out = {i: ev.i, n: ev.n, t: ev.t, q: ev.q};
      if (ev.s) out.s = ev.s;
      if (ev.p) out.p = ev.p;
      picked.push(out);
      ids[ev.i] = true;
      count += 1;
    }
    if (!count) return null;
    var c = queue.c[k] || ctx, body = {};
    for (var key in c) body[key] = c[key];
    body.iid = iid;
    for (var d in device) body[d] = device[d];
    return {ids: ids, json: JSON.stringify({v: 1, st: now(), c: body, e: picked})};
  }
  function drop(ids) {
    var keep = [];
    for (var i = 0; i < queue.e.length; i++) if (!ids[queue.e[i].i]) keep.push(queue.e[i]);
    queue.e = keep;
    persistQueue();
  }
  function post(b, done) {  // keepalive: 화면을 벗어나거나 페이지가 닫혀도 브라우저가 끝까지 보낸다
    var t = now(), id;
    for (id in b.ids) inflight[id] = t;
    var finished = false;
    var finish = function (status) {
      if (finished) return;
      finished = true;
      for (var j in b.ids) if (inflight[j] === t) delete inflight[j];
      // 400·403·413은 다시 보내도 안 되는 묶음이라 버린다. 429·5xx·연결 실패는 남겨 두고 나중에 다시.
      var settled = (status >= 200 && status < 300) || status === 400 || status === 403 || status === 413;
      if (settled) drop(b.ids);
      done(settled);
    };
    try {
      fetch(cfg.url, {method: "POST", body: b.json, headers: {"Content-Type": "text/plain"}, keepalive: true,
                      credentials: "omit", mode: "cors"}).then(function (r) { finish(r.status); },
                                                             function () { finish(0); });
    } catch (e) { finish(0); }
  }
  function beaconAll() {  // fetch가 없는 옛 브라우저만: 결과를 알 수 없어서 넘긴 것으로 친다
    for (var tries = 0, b; tries < 3 && (b = batch()); tries++) {
      var sent = false;
      try {
        sent = !!(navigator.sendBeacon && navigator.sendBeacon(cfg.url, new Blob([b.json], {type: "text/plain"})));
      } catch (e) { sent = false; }
      if (!sent) break;
      drop(b.ids);
    }
  }
  function flush(leaving) {
    var b;
    if (typeof fetch !== "function") {
      if (leaving) beaconAll();
      return;
    }
    if (leaving) {  // 화면을 벗어날 때: 보내는 중인 것을 기다리지 않고 나머지를 바로 보낸다
      for (var n = 0; n < 3 && (b = batch()); n++) post(b, function () {});
      return;
    }
    if ((sendingAt && now() - sendingAt < INFLIGHT_TIMEOUT) || now() < retryAt || !(b = batch())) return;
    var ticket = ++sendTicket;
    sendingAt = now();
    post(b, function (ok) {
      if (ticket !== sendTicket) return;  // 늦게 온 옛 답
      sendingAt = 0;
      if (ok) {
        failures = 0;
        if (queue.e.length) window.setTimeout(safe(function () { flush(false); }), 1000);
      } else {
        failures += 1;
        retryAt = now() + Math.min(10 * 60 * 1000, 15000 * Math.pow(2, failures - 1));
      }
    });
  }

  // ------------------------------------------------------------ 세션과 플레이 시간
  function startSession(t) {
    var n = session && session.n ? session.n + 1 : 1;
    session = {id: rand(12), start: t, last: t, n: n};
    save("sess", JSON.stringify(session));
    track("session_start", {n: n});
  }
  function touch(t) {
    if (!session) return;
    session.last = t;
    save("sess", JSON.stringify(session));
  }
  function settle(t) {  // 보고 있던 시간을 쌓아 둔 몫에 더한다
    if (visibleSince !== null) {
      pendingMs += Math.max(0, Math.min(t - visibleSince, SESSION_GAP));
      visibleSince = t;
    }
  }
  function engage(t) {
    settle(t);
    if (pendingMs >= 1000) track("engagement", {ms: Math.round(pendingMs)});
    pendingMs = 0;
    lastEngage = t;
  }
  function roundsAway(t, hid) {  // 화면을 벗어나면 진행 중인 판의 시간을 멈추고, 돌아오면 다시 잰다
    for (var name in rounds) {
      var rd = rounds[name];
      if (hid) { if (rd.hid === null) rd.hid = t; }
      else if (rd.hid !== null) { rd.away += Math.max(0, t - rd.hid); rd.hid = null; }
    }
  }
  function hidden() {
    var t = now();
    runMark(t, false);
    roundsAway(t, true);
    engage(t);
    visibleSince = null;
    lastBeat = t;
    touch(t);
    flush(true);
  }
  function shown() {
    var t = now();
    runMark(t, true);
    roundsAway(t, false);
    if (!session || t - session.last > SESSION_GAP) startSession(t);
    else touch(t);
    if (visibleSince === null) visibleSince = t;
    lastBeat = t;
    flush(false);
    if (lastFlow) flow(lastFlow.state, {mode: lastFlow.mode});
  }
  function beat() {
    if (isHidden()) return;
    var t = now();
    if (t - lastBeat > BEAT * 3) {  // 타이머가 멈췄었다 (화면 알림 없이 앱이 뒤로 갔거나 기기가 잠들었다)
      for (var name in rounds) if (rounds[name].hid === null) rounds[name].away += t - lastBeat;
      if (visibleSince !== null) pendingMs += Math.max(0, Math.min(lastBeat - visibleSince, SESSION_GAP));
      visibleSince = t;
      if (session && t - session.last > SESSION_GAP) {
        engage(t);
        startSession(t);
      }
    } else {
      settle(t);
    }
    lastBeat = t;
    touch(t);
    runMark(t, true);
    if (t - lastEngage >= ENGAGE_EVERY) engage(t);
  }
  function isHidden() { return document.visibilityState ? document.visibilityState === "hidden" : !!document.hidden; }
  function safe(fn) {  // 이벤트·타이머 안에서 난 오류도 게임으로 번지지 않게
    return function (e) { try { fn(e); } catch (err) { /* 무시 */ } };
  }

  // ------------------------------------------------------------ 판 (게임이 부르는 함수)
  var MAX_ROUNDS = 20;                 // 끝을 알리지 않은 판을 이만큼만 기억한다
  var MAX_ROUND_MS = 4 * 3600 * 1000;  // 판 시간 상한 (서버의 플레이 시간 상한과 같다)
  function roundName(v) {
    if (typeof v === "number" && isFinite(v)) v = String(v);
    if (typeof v !== "string") return "";
    return v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "").slice(0, 60);
  }
  function levelStart(name, options) {
    name = roundName(name);
    if (!name) return;
    var t = now(), keys = [], k;
    for (k in rounds) keys.push(k);
    if (keys.length >= MAX_ROUNDS && !rounds[name]) {  // 가장 오래된 판은 잊는다 (서버는 그만둔 판으로 세요)
      keys.sort(function (a, b) { return rounds[a].t - rounds[b].t; });
      delete rounds[keys[0]];
    }
    var rd = {r: rand(12), t: t, away: 0, hid: isHidden() ? t : null};
    rounds[name] = rd;  // 끝내지 않고 같은 판을 다시 시작하면 앞 판은 그만둔 판이에요
    track("level_start", {level_name: name, round: rd.r});
    journeyWork(function (j) {
      if (j.closed) return;
      var key = options && options.round;
      if (typeof key === "string" && key.length <= 128) {
        j.keys = j.keys || [];
        if (j.keys.indexOf(key) >= 0) return;
        j.keys.push(key);
      }
      if (j.rounds >= 20) { journeyStop(j, "round_limit"); return; }
      j.rounds += 1;
      journeySave(j);
    });
  }
  function levelEnd(name, success, extra) {
    name = roundName(name);
    if (!name) return;
    var t = now(), rd = rounds[name], props = {level_name: name};
    if (rd) {
      var away = rd.away + (rd.hid !== null ? Math.max(0, t - rd.hid) : 0);
      props.round = rd.r;
      props.ms = Math.max(0, Math.min(MAX_ROUND_MS, Math.round(t - rd.t - away)));
      delete rounds[name];
    }
    if (success === true || success === "true" || success === 1) props.success = true;
    else if (success === false || success === "false" || success === 0) props.success = false;
    var score = extra && typeof extra === "object" ? extra.score : undefined;
    if (typeof score === "number" && isFinite(score)) props.score = score;
    track("level_end", props);
  }
  // ------------------------------------------------------------ 진행 단계 (게임이 부르는 함수, 이탈 지점)
  // 설치마다 단계 이름당 처음 한 번만 보낸다 (같은 단계를 몇 번 불러도 돼요). 서버는 첫 실행부터 어느 단계까지 왔는지 세요
  var STEP_MAX = 200;  // 초기 5일 약 100개 관측 설계와 이후 확장 (기존 최초 도달 기록은 그대로 유지)
  var stepsSent = loadJson("steps");
  if (!stepsSent || typeof stepsSent !== "object") stepsSent = {};
  function step(name) {
    name = roundName(name).slice(0, 40);
    if (!name || Object.prototype.hasOwnProperty.call(stepsSent, name)) return;
    var n = 0, k;
    for (k in stepsSent) n += 1;
    if (n >= STEP_MAX) return;
    stepsSent[name] = 1;
    save("steps", JSON.stringify(stepsSent));
    track("step", {step_name: name});
  }
  // ------------------------------------------------------------ 초기 반복 동선 (설치·게임별 공용 상한)
  // 기존 설치는 SDK 8 도입 이후의 관측임을 별도 표시한다. 판 지표·리텐션 수집은 멈추지 않는다.
  var JOURNEY_DAYS = 14 * 86400000, JOURNEY_MAX = 300, journeyBoot = now(), lastFlow = null, journeyDisabled = false;
  function journeySave(j) {
    try {
      // 영속 저장이 안 되는 환경에서는 상세 동선만 끈다. 다시 열 때 예산이 초기화되지 않게.
      var value = JSON.stringify(j);
      window.localStorage.setItem(PREFIX + "journey", value);
      if (window.localStorage.getItem(PREFIX + "journey") !== value) throw new Error("storage");
    } catch (e) { journeyDisabled = true; }
  }
  function journeyLoad() {
    var j = loadJson("journey");
    if (!j || j.v !== 1 || typeof j.started !== "number" || typeof j.events !== "number" || typeof j.rounds !== "number") {
      j = {v: 1, started: journeyBoot, events: 0, rounds: 0, cohort: firstOpen ? "new" : "existing", active: false, closed: ""};
      journeySave(j);
    }
    return j;
  }
  function journeyProps(j) {
    var last = lastFlow || j.last || {mode: "app", state: "unknown"};
    return {mode: last.mode, state_name: last.state,
      sample: 1, sample_index: j.events, sample_round: Math.min(j.rounds, 20),
      sample_started: j.started, sample_cohort: j.cohort};
  }
  function journeyStop(j, reason) {
    if (j.closed) return;
    j.closed = reason;
    if (j.active && j.events < JOURNEY_MAX) {
      j.events += 1;
      var props = journeyProps(j); props.reason = reason;
      // 상한도달은 관측 종료다. 보고서는 이 세션을 이탈로 세지 않는다.
      track("flow_stop", props);
    }
    journeySave(j);
  }
  function journeyWork(work) {
    var run = function () {
      if (journeyDisabled) return;
      var j = journeyLoad();
      if (journeyDisabled) return;
      if (!j.closed && now() - j.started >= JOURNEY_DAYS) journeyStop(j, "day_limit");
      work(j);
    };
    // 지원 브라우저에서는 여러 탭도 같은 설치의 예산을 직렬로 사용한다.
    if (navigator.locks && typeof navigator.locks.request === "function") {
      navigator.locks.request(PREFIX + "journey", run).catch(function () {});
    } else run();
  }
  function flow(name, options) {
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(name)) return;
    var mode = options && options.mode || "app";
    if (typeof mode !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(mode)) return;
    var at = now();
    if (!session || at - session.last > SESSION_GAP) startSession(at);
    touch(at);
    var state = {state: name, mode: mode, session: session.id};
    journeyWork(function (j) {
      if (j.closed) return;
      j.active = true;
      lastFlow = state;
      if (j.last && j.last.state === state.state && j.last.mode === state.mode && j.last.session === state.session) return;
      if (j.events >= JOURNEY_MAX - 1) { journeyStop(j, "event_limit"); return; }
      j.last = state; j.events += 1;
      var props = journeyProps(j);
      journeySave(j);
      if (!journeyDisabled) track("flow_state", props, {time: at, session: state.session});
    });
  }
  // ------------------------------------------------------------ 광고·결제 (공용 도구 NcqAds·NcqIap가 부르는 함수)
  // 이름은 정해 둔 것만 받고, 값은 짧은 글·숫자·참거짓만 남긴다 (게임 코드가 부르는 함수가 아니에요)
  var TOOL_EVENTS = {ad_load: 1, ad_fail: 1, ad_show: 1, ad_reward: 1, ad_call: 1, purchase_start: 1, purchase: 1,
                     purchase_cancel: 1, purchase_fail: 1, purchase_restore: 1, save_tamper: 1,
                     survey_prompt_shown: 1, survey_open: 1, survey_dismiss: 1, survey_submit_attempt: 1, survey_submit_confirmed: 1,
                     review_eligible: 1, review_request_attempt: 1, review_request_result: 1, review_manual_store_open: 1,
                     promo_reward: 1};
  function toolEvent(name, props) {
    if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(TOOL_EVENTS, name)) return;
    var out = {}, n = 0;
    if (props && typeof props === "object") {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k) || n >= 12 || !/^[a-z_]{1,20}$/.test(k)) continue;
        var v = props[k];
        if (typeof v === "string") v = v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 60);
        else if (!(typeof v === "number" && isFinite(v)) && typeof v !== "boolean") continue;
        out[k] = v;
        n += 1;
      }
    }
    track(name, out);
  }
  // ------------------------------------------------------------ 게임 오류 (업데이트 뒤 깨진 버전을 찾으려고)
  // 개인정보가 섞이지 않게 주소·이메일·긴 숫자를 지우고, 한 번 열 때 같은 오류는 한 번·모두 ERR_MAX개까지만 보낸다
  var ERR_MAX = 10, errCount = 0, errSeen = {};
  function cleanText(s, n) {
    return String(s || "").replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)'"]+/gi, "<url>")
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>").replace(/\d{4,}/g, "#")
      .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/^\s+|\s+$/g, "").slice(0, n);
  }
  function fileOf(src) {  // 주소에서 파일 이름만 (쿼리·조각 빼고)
    var m = /([^\/?#]+)(?:[?#].*)?$/.exec(String(src || ""));
    return m ? cleanText(m[1], 40) : "";
  }
  function appError(kind, msg, src, line) {
    if (errCount >= ERR_MAX) return;
    var m = cleanText(msg, 120) || "?", f = fileOf(src), key = kind + "|" + m + "|" + f + "|" + line;
    if (errSeen[key]) return;
    errSeen[key] = 1;
    errCount += 1;
    var props = {kind: kind, msg: m};
    if (f) props.src = f;
    if (typeof line === "number" && isFinite(line) && line > 0) props.line = Math.round(line);
    track("app_error", props);
  }
  function reasonText(r) {
    if (r && typeof r === "object" && typeof r.message === "string") return (r.name ? r.name + ": " : "") + r.message;
    try { return String(r); } catch (err) { return "?"; }
  }

  // ------------------------------------------------------------ 비정상 종료 (지표 모듈 9)
  // 실행마다 기기에 '켜져 있음' 표시(runs)를 두고 화면을 보는 동안 BEAT마다 시각을 고친다. 화면을 벗어나면 '안 보임'으로 바꾼다.
  // 다음에 열 때 '보이는 채'로 멈춘 표시가 남아 있으면 앞 실행이 화면을 보던 중에 끝났다는 뜻이라 app_exit로 알린다 (그 실행의
  // 마지막 시각·버전으로). 웹은 다른 탭이 아직 켜져 있을 수 있어서 RUN_STALE만큼 소식이 없는 표시만 끝난 실행으로 본다.
  // 안드로이드 앱이 죽은 웹뷰를 되살렸으면(NcqSystem.takeRecovered, 빌드가 넣어요) app_recover로 알리고, 보던 중에 되살린 수만큼
  // app_exit를 빼요 (같은 일을 두 번 세지 않게). 크래시와 사용자의 강제 종료를 가르지 못해서 서버·화면은 '추정'이라고 불러요.
  var RUN_STALE = BEAT * 4, RUN_MAX = 5, EXIT_MAX = 3, RECOVER_WAIT = 3000;
  var single = ctx.pf === "android" || ctx.pf === "ios" || ctx.pf === "toss";  // 한 번에 하나만 켜지는 앱
  var runId = rand(12), runStart = now(), deadRuns = [];
  function runsLoad() {
    var r = loadJson("runs");
    return r && typeof r === "object" ? r : {};
  }
  function runMark(t, visible) {
    var r = runsLoad();
    r[runId] = {s: runStart, l: t, v: visible ? 1 : 0, vn: ctx.vn, vc: ctx.vc, sid: session ? session.id : ""};
    save("runs", JSON.stringify(r));
  }
  function runsOpen(t) {  // 시작할 때: 끝난 실행 중 보던 채로 멈춘 것을 고르고, 아직 켜져 있을 수 있는 다른 탭만 남긴다
    var r = runsLoad(), keep = {}, kept = 0, k, e;
    for (k in r) {
      e = r[k];
      if (!e || typeof e !== "object" || typeof e.l !== "number") continue;
      if (!single && e.v === 1 && t - e.l < RUN_STALE && t >= e.l) {
        if (kept < RUN_MAX - 1) { keep[k] = e; kept += 1; }
      } else if (e.v === 1 && deadRuns.length < EXIT_MAX) deadRuns.push(e);
    }
    keep[runId] = {s: runStart, l: t, v: isHidden() ? 0 : 1, vn: ctx.vn, vc: ctx.vc, sid: session ? session.id : ""};
    save("runs", JSON.stringify(keep));
  }
  function runsReport(recoveredFg) {
    deadRuns.sort(function (a, b) { return a.l - b.l; });
    for (var i = 0; i < deadRuns.length; i++) {
      var e = deadRuns[i];
      if (recoveredFg > 0) { recoveredFg -= 1; continue; }  // 앱이 웹뷰를 되살린 실행 (app_recover로 셌어요)
      var props = {up: Math.max(0, Math.min(86400, Math.round((e.l - (e.s || e.l)) / 1000)))};
      if (typeof e.vn === "string" && e.vn) props.pvn = e.vn.slice(0, 40);
      if (typeof e.vc === "number" && isFinite(e.vc)) props.pvc = e.vc;
      var sid = typeof e.sid === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(e.sid) ? e.sid : undefined;
      track("app_exit", props, {time: e.l, session: sid});
    }
    deadRuns = [];
  }
  function recovered(done) {  // 안드로이드 앱(NcqSystem)이 이번 실행 전에 웹뷰를 되살렸는지 → 보던 중에 되살린 수
    var finished = false;
    var finish = function (n) { if (!finished) { finished = true; done(n); } };
    var cap = window.Capacitor, plugin = cap && cap.Plugins && cap.Plugins.NcqSystem;
    if (ctx.pf !== "android" || !plugin || typeof plugin.takeRecovered !== "function"
        || (typeof cap.isPluginAvailable === "function" && !cap.isPluginAvailable("NcqSystem"))) { finish(0); return; }
    window.setTimeout(safe(function () { finish(0); }), RECOVER_WAIT);
    plugin.takeRecovered().then(safe(function (r) {
      var n = r && typeof r.count === "number" ? Math.max(0, Math.min(20, Math.floor(r.count))) : 0;
      var fg = r && typeof r.fg === "number" ? Math.max(0, Math.min(n, Math.floor(r.fg))) : 0;
      var crashed = r && typeof r.crashed === "number" ? Math.max(0, Math.min(n, Math.floor(r.crashed))) : 0;
      if (n) track("app_recover", {n: n, crashed: crashed, fg: fg});
      finish(fg);
    }), safe(function () { finish(0); }));
  }

  function guard(fn) {  // 게임이 부르는 함수: 어떤 값이 와도 오류를 게임으로 넘기지 않는다
    return function (a, b, c) { try { fn(a, b, c); } catch (err) { /* 무시 */ } };
  }
  try {
    window.NcqMetrics = {levelStart: guard(levelStart), levelEnd: guard(levelEnd), step: guard(step), flow: guard(flow), _tool: guard(toolEvent), sdk: SDK};
  } catch (e) { /* 무시 */ }
  try {
    var t0 = now();
    if (firstOpen) track("first_open", null);
    var verKey = [ctx.vc, ctx.vn, ctx.cm].join("|"), lastVer = load("ver");
    if (lastVer && lastVer !== verKey && !firstOpen) {
      var parts = lastVer.split("|");
      track("app_update", {from_vc: parseInt(parts[0], 10) || 0, from_vn: parts[1] || ""});
    }
    save("ver", verKey);
    if (!session || t0 - session.last > SESSION_GAP) startSession(t0);
    else touch(t0);
    try { runsOpen(t0); recovered(safe(runsReport)); } catch (e) { /* 비정상 종료 기록은 덤이에요 */ }
    journeyWork(function () {});
    if (!isHidden()) visibleSince = t0;

    document.addEventListener("visibilitychange", safe(function () { if (isHidden()) hidden(); else shown(); }));
    window.addEventListener("pagehide", safe(hidden));
    window.addEventListener("pageshow", safe(function (e) { if (e && e.persisted) shown(); }));
    document.addEventListener("pause", safe(hidden), false);   // Capacitor·Cordova 앱이 뒤로 갈 때
    document.addEventListener("resume", safe(shown), false);
    window.addEventListener("online", safe(function () { retryAt = 0; flush(false); }));
    window.addEventListener("error", safe(function (e) {  // 스크립트 오류만 (이미지·소리 못 불러옴은 빼요)
      if (!e || (e.target && e.target !== window)) return;
      appError("error", e.message, e.filename, e.lineno);
    }));
    window.addEventListener("unhandledrejection", safe(function (e) {
      appError("promise", reasonText(e && e.reason));
    }));
    window.setInterval(safe(beat), BEAT);
    window.setInterval(safe(function () { flush(false); }), FLUSH_EVERY);
    window.setTimeout(safe(function () { flush(false); }), 2000);
  } catch (e) { /* 지표 때문에 게임이 멈추면 안 된다 */ }
})({"url":"https://kickoff-476465444216.asia-northeast3.run.app/ncq/v1/sync","cn":"chessroom","pf":"web","mk":"web","tr":"share","vn":"0.2.0","vc":0,"cm":"46de806","ft":[]});

(function(w){
  function no(){return false;}
  function unavailable(id){return Promise.resolve({ok:false,id:id,code:"UNAVAILABLE"});}
  var api={version:5,onGrant:function(){return api;},can:no,price:function(){return "";},
    ready:function(){return Promise.resolve(false);},owned:function(){return Promise.resolve(false);},
    buy:unavailable,buyOnce:unavailable,restore:function(){return Promise.resolve({ok:false,restored:[],code:"UNAVAILABLE"});},
    status:function(){return {platform:"web",mode:"off",off:true,ready:false,products:{}};}};
  w.NcqIap=Object.freeze(api);
})(window);
