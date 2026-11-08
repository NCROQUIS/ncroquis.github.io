/* 엔크로키 출시 빌드 표시 (ncq_build.py가 만들어요) */
window.NCQ = Object.freeze({"NCQ_MARKET_WEB": true, "NCQ_TRACK_SHARE": true, "NCQ_PLATFORM": "web", "NCQ_VERSION": "0.4.0", "NCQ_VERSION_CODE": 0, "NCQ_PACKAGE": "com.ncroquis.matjjangomok"});
Object.assign(window, window.NCQ);

/* 화면 켜 두기 (ncq_build.py가 넣어요, 웹 공개). 게임을 보는 동안 휴대폰 화면이 저절로 꺼지지 않게 브라우저의
 * Screen Wake Lock을 잡아요. 화면을 내리면 브라우저가 풀고, 다시 보면 다시 잡아요. 지원하지 않는 브라우저는 그대로이고,
 * 브라우저가 거절하면(절전 모드, 첫 터치 전) 1초 뒤의 터치에 다시 해 봐요. 잡혀 있는지는 NcqAwake.held(). */
(function (w, d) {
  "use strict";
  try {
    var nav = w.navigator, wl = nav && nav.wakeLock;
    if (!d || !wl || typeof wl.request !== "function" || w.NcqAwake) return;
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
    poke();
  } catch (e) { /* 화면 켜 두기가 안 돼도 게임은 그대로 */ }
})(window, typeof document !== "undefined" ? document : null);

/* 엔크로키 지표 모듈 (ncq_build.py가 ncq-flags.js 뒤에 붙여요. 직접 고치지 마세요)
   ncq-metrics 3 (2: 판 시작·끝 NcqMetrics.levelStart·levelEnd, 3: 광고·결제 도구가 보내는 광고·결제 이벤트)

   아래 이벤트는 게임 코드가 할 일 없이 저절로 모아 킥오프 서버로 보내요.
     first_open     이 기기에서 처음 실행 (설치 ID를 만들 때)
     session_start  세션 시작 (30분 넘게 쉬었다 다시 열면 새 세션)
     engagement     화면을 보고 있던 시간(ms). 화면을 벗어날 때와 5분마다
     app_update     버전이 바뀐 뒤 처음 실행
   한 판씩 하는 게임은 판 시작·끝을 알려요 (Firebase 추천 이벤트와 같은 이름. 경험치로 오르는 유저 레벨이 아니에요):
     NcqMetrics.levelStart("stage-3")                  → level_start {level_name, round}
     NcqMetrics.levelEnd("stage-3", true, {score: 120}) → level_end {level_name, round, success, ms, score}
   판 이름은 스테이지나 모드(예: "endless")예요. ms는 시작부터 끝까지 화면을 보고 있던 시간이고, 끝을 알리지 않은 판은
   서버가 '그만둔 판'으로 세요.
   광고·결제는 공용 도구(NcqAds·NcqIap)가 NcqMetrics._tool로 알려요 (게임 코드는 할 일이 없어요):
     ad_load·ad_fail·ad_show·ad_reward·ad_call {slot, format, stage, why, result}
     purchase_start·purchase·purchase_cancel·purchase_fail·purchase_restore {product, kind, amount, currency, qty, code}
   설치 ID는 코드네임별 무작위 값이라 기기·광고 ID·개인정보와 이어지지 않아요. 앱을 지우면 함께 지워져요.
   보내지 못한 이벤트는 기기에 모아 뒀다가(최대 300개) 다음에 보내요. 서버가 받았다고 답한 것만 지워요.
   같은 이벤트가 두 번 가도 서버 집계가 이벤트 ID로 한 번만 세요. 오류가 나도 게임은 그대로 돌아가요. */
(function (cfg) {
  "use strict";
  if (!cfg || !cfg.url || !cfg.cn || typeof window === "undefined" || typeof document === "undefined") return;

  var SDK = 3;
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
  function track(name, props) {
    seq += 1;
    save("seq", String(seq));
    var ev = {i: rand(16), n: name, t: now(), s: session ? session.id : undefined, q: seq, k: ctxKey};
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
    roundsAway(t, true);
    engage(t);
    visibleSince = null;
    lastBeat = t;
    touch(t);
    flush(true);
  }
  function shown() {
    var t = now();
    roundsAway(t, false);
    if (!session || t - session.last > SESSION_GAP) startSession(t);
    else touch(t);
    if (visibleSince === null) visibleSince = t;
    lastBeat = t;
    flush(false);
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
  function levelStart(name) {
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
  // ------------------------------------------------------------ 광고·결제 (공용 도구 NcqAds·NcqIap가 부르는 함수)
  // 이름은 정해 둔 것만 받고, 값은 짧은 글·숫자·참거짓만 남긴다 (게임 코드가 부르는 함수가 아니에요)
  var TOOL_EVENTS = {ad_load: 1, ad_fail: 1, ad_show: 1, ad_reward: 1, ad_call: 1, purchase_start: 1, purchase: 1,
                     purchase_cancel: 1, purchase_fail: 1, purchase_restore: 1};
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
  function guard(fn) {  // 게임이 부르는 함수: 어떤 값이 와도 오류를 게임으로 넘기지 않는다
    return function (a, b, c) { try { fn(a, b, c); } catch (err) { /* 무시 */ } };
  }
  try {
    window.NcqMetrics = {levelStart: guard(levelStart), levelEnd: guard(levelEnd), _tool: guard(toolEvent), sdk: SDK};
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
    if (!isHidden()) visibleSince = t0;

    document.addEventListener("visibilitychange", safe(function () { if (isHidden()) hidden(); else shown(); }));
    window.addEventListener("pagehide", safe(hidden));
    window.addEventListener("pageshow", safe(function (e) { if (e && e.persisted) shown(); }));
    document.addEventListener("pause", safe(hidden), false);   // Capacitor·Cordova 앱이 뒤로 갈 때
    document.addEventListener("resume", safe(shown), false);
    window.addEventListener("online", safe(function () { retryAt = 0; flush(false); }));
    window.setInterval(safe(beat), BEAT);
    window.setInterval(safe(function () { flush(false); }), FLUSH_EVERY);
    window.setTimeout(safe(function () { flush(false); }), 2000);
  } catch (e) { /* 지표 때문에 게임이 멈추면 안 된다 */ }
})({"url":"https://kickoff-476465444216.asia-northeast3.run.app/ncq/v1/sync","cn":"matjjangomok","pf":"web","mk":"web","tr":"share","vn":"0.4.0","vc":0,"cm":"755e9ca","ft":[]});
