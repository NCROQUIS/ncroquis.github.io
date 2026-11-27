// NcqReview — 엔크로키 공용 별점 요청 모듈 (ncq/review.js)
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 docs/ncq/review.md에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   <script src="ncq/review.js"><\/script>        index.html의 <head> (빌드 도구 없이)
//   import "../ncq/review.js";                       Vite 같은 빌드 도구를 쓰면 시작 파일 맨 위 (그다음 window.NcqReview)
//
//   NcqReview.init({ id, achievements: ["boss2_first_clear"] })   앱을 열 때 한 번 (게임별 성취 조건은 꼭 하나 이상)
//   NcqReview.achieve("boss2_first_clear")      성취를 처음 이뤘을 때 (기기에 남아요, 몇 번 불러도 같아요)
//   await NcqReview.maybeAsk({ screen: "result" })  안전한 화면(정산·결과)에서. 조건이 되면 OS 별점 창을 요청해요
//   const done = NcqReview.block("survey")      설문·광고·튜토리얼·전투 중에는 막아요. done()으로 풀어요
//   NcqReview.block("bankrupt", { seconds: 600 })   파산 직후처럼 잠깐만 막기
//   NcqReview.playing(false)                    실제 플레이가 아닌 시간(긴 메뉴 등)을 세지 않게 (기본: 화면이 보이는 동안 셈)
//   NcqReview.check()                           지금 요청할 수 있는지 {ok, reasons[]} (부작용 없음)
//   NcqReview.canOpenStore() / openStore()      설정 화면의 '평가하기' 버튼 (스토어 상세로 이동, 자동 요청 API는 안 불러요)
//   NcqReview.onEvent(fn)                       eligible · request_attempt · request_result · manual_store_open
//   NcqReview.status()                          지금 상태 (확인용)
//
// 기본 정책(게임이 더 엄격하게만 바꿀 수 있어요): 누적 실제 플레이 1800초 이상, 서로 다른 접속일 2일 이상,
// 마지막 자동 요청 뒤 30일 이상, 직전 365일 자동 요청 3회 미만, 게임별 성취 하나 이상, 막힌 상태가 아님.
// 어디서 요청하나: iOS 앱은 StoreKit 요청(출시 빌드가 넣는 In-App Review 플러그인), 안드로이드 앱은 Play In-App Review.
// 웹·토스·카카오처럼 지원하지 않는 곳은 아무것도 하지 않아요 (횟수에도 세지 않아요).
// OS가 창을 보일지 정해요. 창이 떴는지·별점을 줬는지는 알 수 없어서 추정하지 않아요 (result는 호출 결과만).
// 이력은 게임 저장(NcqSave)과 따로 기기에 남아서 게임 초기화·파산 뒤에도 유지돼요.
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION = 1;
  if (w.NcqReview && w.NcqReview.version >= VERSION) return; // 두 번 불러도 한 번만
  var d = w.document;

  var DAY = 86400000;
  var BASE = Object.freeze({ minPlaySec: 1800, minDays: 2, gapDays: 30, maxPerYear: 3 });
  var CALL_TIMEOUT = 8000; // 네이티브 응답이 없을 때 이만큼 기다리고 끝내요 (이력은 이미 남겼어요)
  var LOCK_MS = 60000;     // 다른 탭·창이 막 요청했으면 이 시간 동안 다시 요청하지 않아요
  var TICK = 1000, SAVE_EVERY = 15000;
  var BLOCK_NAMES = /^[a-z][a-z0-9_]{0,31}$/;
  var ACH_NAMES = /^[a-z0-9][a-z0-9_\-]{0,47}$/;

  var cfg = null, rec = null, key = null, policy = null, now = Date.now.bind(Date);
  var blocks = Object.create(null), adapters = [], listeners = [], inflight = null, played = true;
  var tickTimer = null, lastTick = 0, lastSave = 0;

  function warn(msg) { try { if (w.console) w.console.warn("[NcqReview] " + msg); } catch (e) { /* no console */ } }
  function store() { try { return w.localStorage || null; } catch (e) { return null; } }
  function blank() { return { v: 1, playSec: 0, days: [], dayCount: 0, lastDay: "", achieved: Object.create(null), calls: [], manual: 0, seenMax: 0 }; }
  function load() {
    var s = store(), r = null;
    try { r = s && JSON.parse(s.getItem(key) || "null"); } catch (e) { r = null; }
    var b = blank();
    if (!r || typeof r !== "object" || r.v !== 1) return b;
    b.playSec = Math.max(0, +r.playSec || 0);
    b.days = Array.isArray(r.days) ? r.days.filter(function (x) { return typeof x === "string"; }).slice(-30) : [];
    b.dayCount = Math.max(b.days.length, +r.dayCount || 0);
    b.lastDay = typeof r.lastDay === "string" ? r.lastDay : "";
    b.achieved = r.achieved && typeof r.achieved === "object" ? Object.assign(Object.create(null), r.achieved) : b.achieved;
    b.calls = Array.isArray(r.calls) ? r.calls.filter(function (c) { return c && typeof c.t === "number"; }).slice(-12) : [];
    b.manual = +r.manual || 0;
    b.seenMax = +r.seenMax || 0;
    return b;
  }
  function persist() {
    var s = store(); if (!s || !rec) return false;
    try {
      // Another scene can have saved a request while this one was in the background.
      var saved = load();
      var calls = new Map();
      saved.calls.concat(rec.calls).forEach(function (call) {
        if (call.status !== "pending" || !calls.has(call.t)) calls.set(call.t, call);
      });
      rec.calls = Array.from(calls.values()).sort(function (a, b) { return a.t - b.t; }).slice(-12);
      rec.achieved = Object.assign(Object.create(null), saved.achieved, rec.achieved);
      rec.playSec = Math.max(rec.playSec, saved.playSec);
      rec.days = Array.from(new Set(saved.days.concat(rec.days))).sort().slice(-30);
      rec.dayCount = Math.max(rec.days.length, rec.dayCount, saved.dayCount);
      rec.manual = Math.max(rec.manual, saved.manual);
      s.setItem(key, JSON.stringify(rec)); lastSave = now(); return true;
    } catch (e) { return false; }
  }
  function today(t) {
    var x = new Date(t);
    return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2);
  }
  function markDay() {
    var t = now(), day = today(t);
    rec.seenMax = Math.max(rec.seenMax || 0, t);
    if (rec.lastDay === day || rec.days.indexOf(day) >= 0) { rec.lastDay = day; return; }
    rec.days.push(day); rec.days = rec.days.slice(-30); rec.dayCount += 1; rec.lastDay = day;
  }
  function emit(type, data) {
    var ev = { type: type, at: now() };
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) ev[k] = data[k];
    listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { warn("onEvent 함수에서 오류: " + e); } });
    try { // 지표 모듈에 이벤트 칸이 있으면 같이 보내요 (없으면 건너뛰어요)
      var m = w.NcqMetrics;
      if (m && typeof m._tool === "function") m._tool("review_" + type, { result: ev.result || "" });
    } catch (e) { /* metrics optional */ }
    return ev;
  }
  function platform() {
    var p = ((w.NCQ || {}).NCQ_PLATFORM || "").toLowerCase();
    if (p) return p;
    var cap = w.Capacitor;
    try { if (cap && typeof cap.getPlatform === "function") return cap.getPlatform(); } catch (e) { /* ignore */ }
    return "web";
  }
  function storePlatform() {
    var p = platform();
    return p === "android" || p === "ios";
  }
  function nativeCap() {
    var cap = w.Capacitor;
    if (!cap || !cap.Plugins) return null;
    try { if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null; } catch (e) { return null; }
    return cap;
  }
  // Capacitor 플러그인 두 가지 중 출시 빌드가 넣은 것을 써요: @capacitor-community/in-app-review (InAppReview.requestReview),
  // @capawesome/capacitor-app-review (AppReview.requestReview · openAppStore)
  function capPlugin(name, method) {
    var cap = nativeCap(), p = cap && cap.Plugins[name];
    if (!p || typeof p[method] !== "function") return null;
    try { if (typeof cap.isPluginAvailable === "function" && cap.isPluginAvailable(name) === false) return null; } catch (e) { return null; }
    return p;
  }
  var BUILTIN = {
    id: "store",
    available: function () {
      var p = platform();
      if (p !== "android" && p !== "ios") return false;
      return !!(capPlugin("InAppReview", "requestReview") || capPlugin("AppReview", "requestReview"));
    },
    request: function () {
      var p = capPlugin("InAppReview", "requestReview") || capPlugin("AppReview", "requestReview");
      return p.requestReview();
    }
  };
  function adapter() {
    if (!storePlatform()) return null;
    for (var i = adapters.length - 1; i >= 0; i--) {
      try { if (adapters[i].available() === true) return adapters[i]; } catch (e) { /* skip */ }
    }
    try { return BUILTIN.available() ? BUILTIN : null; } catch (e) { return null; }
  }

  function tick() {
    if (!rec) return;
    var t = now(), dt = Math.min(5000, Math.max(0, t - lastTick)); lastTick = t;
    if (played && !(d && d.hidden)) rec.playSec += dt / 1000;
    if (!(d && d.hidden) && t - lastSave >= SAVE_EVERY) { markDay(); persist(); }
  }
  function startTicking() {
    if (tickTimer || typeof w.setInterval !== "function") return;
    lastTick = now();
    tickTimer = w.setInterval(tick, TICK);
    if (d && d.addEventListener) d.addEventListener("visibilitychange", function () { tick(); lastTick = now(); if (d.hidden) persist(); else { markDay(); persist(); } });
    if (w.addEventListener) w.addEventListener("pagehide", function () { tick(); persist(); });
  }

  function activeBlocks() {
    var t = now(), out = [];
    for (var k in blocks) if (Object.prototype.hasOwnProperty.call(blocks, k)) {
      var b = blocks[k];
      if (b.until && b.until <= t) { delete blocks[k]; continue; }
      if (b.n > 0 || b.until) out.push(k);
    }
    return out;
  }
  function callsWithin(ms) { var t = now(); return rec.calls.filter(function (c) { return c.t <= t && t - c.t < ms; }); }
  function lastCall() { return rec.calls.length ? rec.calls[rec.calls.length - 1] : null; }

  function check(opts) {
    opts = opts || {};
    if (!cfg) return { ok: false, reasons: ["not_initialized"] };
    if (!storePlatform()) return { ok: false, reasons: ["unsupported"] };
    tick();
    var savedCalls = load().calls;
    if (savedCalls.length && (!lastCall() || savedCalls[savedCalls.length - 1].t > lastCall().t)) rec.calls = savedCalls;
    var r = [], t = now(), last = lastCall();
    if (!Object.keys(rec.achieved).some(function (a) { return cfg.achievements.indexOf(a) >= 0; })) r.push("achievement");
    if (rec.playSec < policy.minPlaySec) r.push("play_time");
    if (rec.dayCount < policy.minDays) r.push("days");
    if (last) {
      if (t < last.t) r.push("clock"); // 시계를 되돌렸으면 기다려요
      else if (t - last.t < policy.gapDays * DAY) r.push("gap");
    }
    if (callsWithin(365 * DAY).length >= policy.maxPerYear) r.push("yearly_limit");
    var bl = activeBlocks(); if (bl.length) r.push("blocked:" + bl.join(","));
    if (d && d.hidden) r.push("hidden");
    if (w.NcqFeedback && typeof w.NcqFeedback.isOpen === "function" && w.NcqFeedback.isOpen()) r.push("blocked:feedback");
    if (inflight) r.push("in_progress");
    if (last && last.status === "pending" && t - last.t < LOCK_MS) r.push("in_progress");
    if (opts.safe === false) r.push("unsafe_screen");
    if (!adapter()) r.push("unsupported");
    return { ok: r.length === 0, reasons: r };
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve) {
      var done = false, timer = w.setTimeout(function () { if (!done) { done = true; resolve({ result: "timeout" }); } }, ms);
      Promise.resolve(p).then(function () { if (!done) { done = true; w.clearTimeout(timer); resolve({ result: "called" }); } },
        function (e) { if (!done) { done = true; w.clearTimeout(timer); resolve({ result: "error", error: String(e && e.message || e).slice(0, 120) }); } });
    });
  }

  function maybeAsk(opts) {
    var locks = w.navigator && w.navigator.locks;
    if (cfg && storePlatform() && locks && typeof locks.request === "function") {
      return locks.request(key, { ifAvailable: true }, function (lock) {
        return lock ? ask(opts) : { asked: false, reason: "in_progress" };
      }).catch(function () { return { asked: false, reason: "storage" }; });
    }
    return ask(opts);
  }

  function ask(opts) {
    opts = opts || {};
    if (inflight) return Promise.resolve({ asked: false, reason: "in_progress" });
    var c = check(opts);
    if (!c.ok) {
      var why = c.reasons.join(" ");
      return Promise.resolve({ asked: false, reason: why, reasons: c.reasons });
    }
    var ad = adapter();
    if (!ad) return Promise.resolve({ asked: false, reason: "unsupported" });
    var entry = { t: now(), status: "pending", via: ad.id, screen: String(opts.screen || "").slice(0, 32) };
    // 부르기 직전에 이력을 먼저 남겨요: 앱이 요청 중에 꺼져도 다시 요청하지 않게
    rec.calls.push(entry); rec.calls = rec.calls.slice(-12);
    if (!persist()) { rec.calls.pop(); return Promise.resolve({ asked: false, reason: "storage" }); } // 기록을 못 하면 부르지 않아요 (횟수에 안 셈)
    emit("eligible", { screen: entry.screen });
    emit("request_attempt", { via: ad.id, screen: entry.screen });
    var call;
    try { call = ad.request(); } catch (e) { call = Promise.reject(e); }
    inflight = withTimeout(call, CALL_TIMEOUT).then(function (res) {
      entry.status = res.result; persist(); inflight = null;
      emit("request_result", { via: ad.id, result: res.result });
      return { asked: true, result: res.result, error: res.error };
    });
    return inflight;
  }

  function storeIds() {
    var n = w.NCQ || {}, s = (cfg && cfg.store) || {}, b = n.NCQ_REVIEW_STORE || {};
    return { android: s.android || b.android || n.NCQ_PACKAGE || "", ios: s.ios || b.ios || "" };
  }
  function storeUrl() {
    var p = platform(), ids = storeIds();
    if (p === "android" && /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(ids.android)) return "https://play.google.com/store/apps/details?id=" + ids.android;
    if (p === "ios" && /^[1-9]\d{0,14}$/.test(String(ids.ios))) return "https://apps.apple.com/app/id" + ids.ios + "?action=write-review";
    return null; // 웹·토스·카카오(밖으로 나가는 링크 금지)·스토어 ID가 아직 없으면 숨겨요
  }
  function openStore() {
    var url = storeUrl(); if (!url) return Promise.resolve(false);
    if (rec) { rec.manual += 1; persist(); }
    emit("manual_store_open", { platform: platform() });
    var ids = storeIds(), ar = capPlugin("AppReview", "openAppStore");
    if (ar) return Promise.resolve(ar.openAppStore(platform() === "ios" ? { appId: String(ids.ios) } : {})).then(function () { return true; }, function () { return openUrl(url); });
    return Promise.resolve(openUrl(url));
  }
  function openUrl(url) {
    try { var o = w.open(url, "_system"); if (o !== null) return true; } catch (e) { /* fall through */ }
    try { w.location.href = url; return true; } catch (e) { return false; }
  }

  var api = {
    version: VERSION,
    policyBase: BASE,
    init: function (o) {
      o = o || {};
      if (!o.id || !/^[a-z0-9][a-z0-9\-]{1,40}$/.test(o.id)) throw new Error("NcqReview.init: id(프로젝트 코드네임)가 필요해요");
      var ach = (o.achievements || []).filter(function (a) { return ACH_NAMES.test(a); });
      if (!ach.length) throw new Error("NcqReview.init: 게임별 성취 조건(achievements)을 하나 이상 적어요");
      if (typeof o.now === "function") now = o.now; // 시험용 시계
      policy = {};
      var p = o.policy || {};
      // 기본 정책보다 느슨하게는 못 바꿔요 (더 엄격하게만)
      policy.minPlaySec = Math.max(BASE.minPlaySec, +p.minPlaySec || 0);
      policy.minDays = Math.max(BASE.minDays, +p.minDays || 0);
      policy.gapDays = Math.max(BASE.gapDays, +p.gapDays || 0);
      policy.maxPerYear = Math.min(BASE.maxPerYear, p.maxPerYear > 0 ? +p.maxPerYear : BASE.maxPerYear);
      ["minPlaySec", "minDays", "gapDays"].forEach(function (k) { if (p[k] != null && +p[k] < BASE[k]) warn(k + "는 기본(" + BASE[k] + ")보다 낮출 수 없어 기본값을 써요"); });
      if (p.maxPerYear > BASE.maxPerYear) warn("maxPerYear는 " + BASE.maxPerYear + "보다 높일 수 없어요");
      cfg = { id: o.id, achievements: ach, store: o.store || null };
      key = "ncq:review:" + o.id;
      if (!storePlatform()) { rec = null; return api; }
      rec = load(); played = true; lastTick = now();
      if (!(d && d.hidden)) markDay();
      persist();
      startTicking();
      return api;
    },
    achieve: function (name) {
      if (!cfg) { warn("init 전에 achieve를 불렀어요"); return false; }
      if (!rec) return false;
      if (cfg.achievements.indexOf(name) < 0) { warn("init에 없는 성취 이름: " + name); return false; }
      if (!rec.achieved[name]) { rec.achieved[name] = now(); persist(); }
      return true;
    },
    achieved: function (name) { return !!(rec && rec.achieved[name]); },
    block: function (reason, o) {
      reason = String(reason || "");
      if (!BLOCK_NAMES.test(reason)) { warn("block 이름은 영문 소문자·숫자·밑줄: " + reason); reason = "other"; }
      var b = blocks[reason] || (blocks[reason] = { n: 0, until: 0 });
      if (o && o.seconds > 0) { b.until = Math.max(b.until, now() + o.seconds * 1000); return function () {}; }
      b.n += 1; var released = false;
      return function () { if (released) return; released = true; b.n = Math.max(0, b.n - 1); if (!b.n && !b.until) delete blocks[reason]; };
    },
    playing: function (on) { tick(); played = on !== false; },
    check: check,
    maybeAsk: maybeAsk,
    request: maybeAsk,
    canOpenStore: function () { return !!storeUrl(); },
    storeUrl: storeUrl,
    openStore: openStore,
    onEvent: function (fn) { if (typeof fn !== "function") return function () {}; listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    // 퍼블리셔 SDK처럼 다른 별점 창을 붙일 때 (platform/review.js 같은 연결 파일에서만): {id, available(), request()}
    registerAdapter: function (a) {
      if (!a || typeof a.id !== "string" || typeof a.available !== "function" || typeof a.request !== "function") throw new Error("NcqReview.registerAdapter: {id, available, request}가 필요해요");
      adapters.push(a);
      return function () { adapters = adapters.filter(function (x) { return x !== a; }); };
    },
    status: function () {
      var c = check(), last = rec && lastCall();
      return {
        version: VERSION, id: cfg && cfg.id, platform: platform(), adapter: (adapter() || {}).id || null,
        policy: Object.assign({}, policy), playSec: rec ? Math.floor(rec.playSec) : 0, days: rec ? rec.dayCount : 0,
        achieved: rec ? Object.keys(rec.achieved) : [], calls365: rec ? callsWithin(365 * DAY).length : 0,
        lastCall: last ? { t: last.t, status: last.status } : null, blocks: activeBlocks(), eligible: c.ok, reasons: c.reasons,
        canOpenStore: !!storeUrl(), manualOpens: rec ? rec.manual : 0
      };
    }
  };
  w.NcqReview = api;
})();
