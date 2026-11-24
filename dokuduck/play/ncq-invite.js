/* NcqInvite 1 — 초대 조건과 지급권. 실제 재화와 grant.id는 게임이 같은 저장 작업으로 반영해요.
 * onGrant(fn, {saveId}): 영구 저장을 마친 뒤 true만 반환해요. 같은 번호는 다시 받아도 한 번만 지급해요.
 * ES2017. 빌드 설정이 없으면 서버나 플랫폼 SDK를 호출하지 않아요. */
(function (w) {
  "use strict";
  if (!w || w.NcqInvite) return;
  var cfg = (w.NCQ || {}).NCQ_INVITE || null;
  var auth = w.NcqAuth;
  var enabled = !!(auth && cfg && cfg.url && cfg.game && /^(test|prod)$/.test(cfg.environment));
  var base = enabled ? String(cfg.url).replace(/\/$/, "") : "";
  var prefix = "ncq:invite:" + (cfg ? cfg.game + ":" + cfg.environment : "off") + ":";
  var handler = null, saveId = "", busy = null, readyBusy = null, state = {enabled: false};
  var listeners = [], inFlight = {}, retryTimer = null, retryCount = 0, bound = false, pendingWork = false;
  var shareStates = new WeakMap();
  var ID = /^[A-Za-z0-9_-]{8,100}$/;
  var activePlayer = read("player", (read("session", {}) || {}).player);

  function error(code, status, message) {
    var e = new Error(message || code); e.code = code; e.status = status || 0; return e;
  }
  function read(key, fallback) {
    try { var x = w.localStorage.getItem(prefix + key); return x ? JSON.parse(x) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { w.localStorage.setItem(prefix + key, JSON.stringify(value)); }
    catch (e) { throw error("storage_unavailable", 0, "초대 처리 기록을 저장하지 못했어요."); }
  }
  function randomId() {
    var b = new Uint8Array(18), out = "", i;
    if (!w.crypto || !w.crypto.getRandomValues) throw error("crypto_unavailable");
    w.crypto.getRandomValues(b);
    for (i = 0; i < b.length; i++) out += ("0" + b[i].toString(16)).slice(-2);
    return out;
  }
  function emit(extra) {
    if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
    listeners.slice().forEach(function (fn) { try { fn(Object.assign({}, state)); } catch (e) { /* 화면 오류는 지급과 별개 */ } });
  }
  function retry(e) {
    emit({lastError: e.code || "network_error"});
    if (retryTimer || !enabled || (e.status && e.status < 500 && e.status !== 429 && e.status !== 401 && e.code !== "busy")) return;
    var delay = Math.max(e.retryAfter || 0, Math.min(600000, 30000 * Math.pow(2, retryCount++)));
    retryTimer = w.setTimeout(function () { retryTimer = null; resume(); }, delay);
  }
  function api(path, method, data, player) {
    if (!enabled) return Promise.reject(error("disabled"));
    return auth.request(path, method, data, player || activePlayer);
  }
  function rememberIncoming(value) {
    try {
      var u = new URL(value, w.location.href), parts = u.pathname.split("/");
      if (parts[1] === "i" && (parts[2] !== cfg.game || parts[3] !== cfg.environment)) return;
      var token = u.searchParams.get("ncq-invite") || (parts[1] === "i" ? parts[4] : "");
      if (token && ID.test(token)) { write("incoming", token); emit({incomingToken: token}); }
    } catch (e) { /* 초대 주소가 아니면 무시 */ }
  }
  function nativeIncoming() {
    if (!enabled || bound) return Promise.resolve();
    bound = true;
    rememberIncoming(w.location.href);
    var plugins = ((w.Capacitor || {}).Plugins || {}), app = plugins.App, jobs = [];
    if (app && app.getLaunchUrl) jobs.push(Promise.resolve(app.getLaunchUrl()).then(function (v) { if (v && v.url) rememberIncoming(v.url); }).catch(function () {}));
    if (app && app.addListener) app.addListener("appUrlOpen", function (v) { rememberIncoming(v.url); readyBusy = null; ready().catch(retry); });
    if (plugins.NcqInviteNative && plugins.NcqInviteNative.getInstallReferrer) {
      jobs.push(Promise.resolve(plugins.NcqInviteNative.getInstallReferrer()).then(function (v) {
        if (read("incoming", null)) return;
        var ref = new URLSearchParams(v.referrer || "").get("ncq_invite");
        if (ref && ID.test(ref)) write("incoming", ref);
      }).catch(function () {}));
    }
    return Promise.all(jobs);
  }
  function ready() {
    if (!enabled) return Promise.resolve({enabled: false});
    if (readyBusy) return readyBusy;
    readyBusy = nativeIncoming().then(function () { return auth.ready(); }).then(function (session) {
      var previous = activePlayer;
      if (previous !== session.player) {
        shareStates = new WeakMap();
        write("referral", false);
      }
      activePlayer = session.player;
      var queue = read("signals", []);
      if (queue.some(function (event) { return !event.player; })) {
        write("signals", queue.map(function (event) {
          return event.player ? event : Object.assign({}, event, {player: previous || activePlayer});
        }));
      }
      write("player", activePlayer);
      if (read("session", null)) write("session", null);
      return api("/invite/v1/bootstrap", "GET", undefined, activePlayer);
    }).then(function (out) {
      state = Object.assign({}, out);
      write("referral", !!out.referral);
      var incoming = read("incoming", null);
      if (!incoming) { emit(); return Object.assign({}, state); }
      return auth.publicRequest("/invite/v1/invites/" + encodeURIComponent(incoming)).then(function (preview) {
        if (preview.game === cfg.game && preview.environment === cfg.environment) state.incoming = {token: incoming, preview: preview};
        emit(); return Object.assign({}, state);
      }).catch(function (e) { emit({incomingError: e.code}); return Object.assign({}, state); });
    });
    var p = readyBusy;
    p.then(function () { if (readyBusy === p) readyBusy = null; }, function (e) { if (readyBusy === p) readyBusy = null; retry(e); });
    return p;
  }
  function signIn(proof) {
    if (!enabled) return Promise.reject(error("disabled"));
    if (busy) return Promise.reject(error("busy", 409));
    return auth.signIn(proof).then(function () { readyBusy = null; return ready(); });
  }
  function accept(value) {
    var incoming = value || read("incoming", "");
    if (!ID.test(incoming)) return Promise.reject(error("invalid_id"));
    return api("/invite/v1/referrals", "POST", {token: incoming}).then(function (out) {
      write("referral", true); write("incoming", null); emit({incoming: null}); resume(); return out;
    });
  }
  function signalFields(event, fields) {
    fields = fields || {};
    if (typeof fields !== "object" || Array.isArray(fields)) throw error("invalid_event");
    if (event === "tutorial_complete") return {};
    if (event === "level_complete" && Number.isInteger(fields.level) && fields.level >= 1 && fields.level <= 1000000) {
      return {level: fields.level};
    }
    if (/^custom_[a-z][a-z0-9_]*$/.test(event) && typeof fields.unit === "string" && fields.unit && Array.from(fields.unit).length <= 80) {
      return {unit: fields.unit};
    }
    throw error("invalid_event");
  }
  function reached(event, fields) {
    if (!enabled) return Promise.resolve({status: "disabled"});
    if (typeof event !== "string" || !/^(tutorial_complete|level_complete|custom_[a-z][a-z0-9_]*)$/.test(event)) return Promise.reject(error("invalid_event"));
    if (!activePlayer || !read("referral", false)) return Promise.resolve({status: "no_referral"});
    try {
      fields = signalFields(event, fields);
      var queue = read("signals", []), signature = JSON.stringify([event, fields]);
      if (!queue.some(function (e) { return e.player === activePlayer && e.signature === signature; })) {
        if (queue.length >= 1000) throw error("queue_full");
        queue.push({id: randomId(), event: event, fields: fields, signature: signature, player: activePlayer});
        write("signals", queue);
      }
    } catch (e) { return Promise.reject(e); }
    return resume().then(function (ok) { return {status: ok && !read("signals", []).some(function (e) { return e.player === activePlayer; }) ? "accepted" : "queued"}; });
  }
  function flushSignals(player) {
    var queue = read("signals", []).filter(function (e) { return e.player === player; });
    if (!queue.length) return Promise.resolve();
    var batch = [], invalid = [];
    queue.slice(0, 20).forEach(function (e) {
      try { batch.push({id: e.id, event: e.event, fields: signalFields(e.event, e.fields)}); }
      catch (err) { invalid.push(e.id); }
    });
    if (invalid.length) {
      write("signals", read("signals", []).filter(function (e) { return e.player !== player || invalid.indexOf(e.id) < 0; }));
      emit({lastError: "invalid_event"});
    }
    if (!batch.length) return flushSignals(player);
    return api("/invite/v1/signals", "POST", {events: batch}, player).then(function (out) {
      var ids = {};
      (out.events || []).forEach(function (e) { ids[e.id] = true; });
      write("signals", read("signals", []).filter(function (e) { return e.player !== player || !ids[e.id]; }));
      emit({referralStatus: out.status});
      return flushSignals(player);
    });
  }
  function ackPending(player) {
    var pending = read("acks", []), chain = Promise.resolve();
    pending.forEach(function (item) {
      if (item.player !== player) return;
      chain = chain.then(function () {
        return api("/invite/v1/grants/" + item.id + "/ack", "POST", {save_id: item.saveId}, player).then(function () {
          write("acks", read("acks", []).filter(function (a) { return a.id !== item.id || a.player !== item.player; }));
          emit({lastAcknowledged: item.id});
        });
      });
    });
    return chain;
  }
  function deliver(grant, player) {
    if (!handler || !saveId) return Promise.resolve();
    if (inFlight[grant.id]) return inFlight[grant.id];
    var fn = handler, target = saveId;
    var work = api("/invite/v1/grants/" + grant.id + "/claim", "POST", {save_id: target}, player).then(function (out) {
      if (out.grant.status === "acknowledged") return;
      return Promise.resolve().then(function () { return fn(Object.freeze(out.grant)); }).then(function (ok) {
        if (ok !== true) { emit({lastDeferred: grant.id}); return; }
        var queue = read("acks", []);
        if (!queue.some(function (a) { return a.id === grant.id && a.player === player; })) {
          queue.push({id: grant.id, saveId: target, player: player});
          write("acks", queue);
        }
        return ackPending(player);
      });
    }).catch(function (e) {
      if (e.code === "busy" || e.code === "different_save") {
        emit({lastDeferred: grant.id});
        if (e.code === "busy") { e.retryAfter = 120000; retry(e); }
      }
      else retry(e);
    });
    inFlight[grant.id] = work;
    work.then(function () { delete inFlight[grant.id]; }, function () { delete inFlight[grant.id]; });
    return work;
  }
  function drain(cursor, player) {
    if (!handler || !saveId) return Promise.resolve();
    return api("/invite/v1/grants?save_id=" + encodeURIComponent(saveId) + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, player).then(function (out) {
      emit({otherSave: out.other_save || 0});
      var chain = Promise.resolve();
      (out.items || []).forEach(function (g) { chain = chain.then(function () { return deliver(g, player); }); });
      return chain.then(function () { if (out.cursor) return drain(out.cursor, player); });
    });
  }
  function resume() {
    if (!enabled) return Promise.resolve(false);
    if (busy) { pendingWork = true; return busy; }
    pendingWork = false;
    busy = ready().then(function () {
      var player = activePlayer;
      return ackPending(player).then(function () { return flushSignals(player); }).then(function () { return drain("", player); });
    }).then(function () {
      retryCount = 0; return true;
    }).catch(function (e) { retry(e); return false; });
    var p = busy;
    p.then(function (ok) {
      if (busy === p) busy = null;
      if (ok && pendingWork) { pendingWork = false; resume(); }
    });
    return p;
  }
  function onGrant(fn, options) {
    if (typeof fn !== "function" || !options || !ID.test(options.saveId)) throw error("invalid_handler");
    if (busy && saveId && saveId !== options.saveId) throw error("busy", 409);
    handler = fn; saveId = options.saveId;
    if (enabled) resume();
    return function () { if (handler === fn && !Object.keys(inFlight).length) handler = null; };
  }
  function makeCard(options) {
    return Promise.resolve().then(function () {
      return typeof options.image === "function" ? options.image() : options.image;
    }).then(function (source) {
      if (!source || !w.document) return null;
      if (typeof Blob !== "undefined" && source instanceof Blob) return source;
      var canvas = w.document.createElement("canvas"), context = canvas.getContext("2d");
      canvas.width = 1200; canvas.height = 600;
      context.fillStyle = "#13223a"; context.fillRect(0, 0, 1200, 600);
      var width = source.width || 1200, height = source.height || 600, scale = Math.min(1200 / width, 470 / height);
      context.drawImage(source, (1200 - width * scale) / 2, 0, width * scale, height * scale);
      context.fillStyle = "#fff"; context.font = "bold 36px sans-serif";
      context.fillText(String(options.title || cfg.game).slice(0, 40), 40, 525, 1120);
      context.font = "24px sans-serif";
      context.fillText(String(options.message || "").slice(0, 100), 40, 572, 1120);
      return new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", 0.85); });
    }).catch(function () { return null; });
  }
  function prepareShare(options) {
    if (!enabled) return Promise.reject(error("disabled"));
    options = options || {};
    var prepared = {title: String(options.title || cfg.game), text: String(options.message || ""),
      image: null, ogImageUrl: options.ogImageUrl};
    return makeCard(options).then(function (blob) {
      prepared.image = blob;
      var plugins = ((w.Capacitor || {}).Plugins || {});
      if (!blob || !plugins.Filesystem || cfg.platform !== "googleplay") return;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(",")[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }).then(function (data) {
        var extension = blob.type === "image/png" ? ".png" : ".jpg";
        return plugins.Filesystem.writeFile({path: "ncq-invite-" + randomId() + extension, data: data, directory: "CACHE"});
      }).then(function (file) { prepared.file = file.uri; }).catch(function () { prepared.imageError = true; });
    }).then(function () { return prepared; });
  }
  function issueShareLink(prepared, requestId) {
    return api("/invite/v1/invites", "POST", {request_id: requestId}).then(function (invite) {
      var link = {url: base + "/i/" + cfg.game + "/" + cfg.environment + "/" + invite.token,
        code: invite.code, expires: invite.expires};
      var toss = w.NcqToss || {};
      if (cfg.platform === "toss" && toss.Share && toss.Share.createLink) {
        return toss.Share.createLink({path: "intoss://" + (cfg.tossApp || cfg.game) + "?ncq-invite=" + invite.token,
          ogImageUrl: prepared.ogImageUrl}).then(function (url) { link.url = url; return link; });
      }
      return link;
    });
  }
  function openShare(prepared, link, newLink) {
    function result(status) { return {status: status, url: link.url, code: link.code}; }
    var text = prepared.text ? prepared.text + "\n" + link.url : link.url;
    var toss = w.NcqToss || {}, plugins = ((w.Capacitor || {}).Plugins || {}), work;
    var browser = false, status = "shared", nav = w.navigator;
    try {
      if (cfg.platform === "toss" && toss.Share && toss.Share.sendMessage) work = toss.Share.sendMessage({message: text});
      else if (plugins.Share && plugins.Share.share) {
        var options = {title: prepared.title, text: text};
        if (prepared.file) options.files = [prepared.file];
        work = plugins.Share.share(options);
      } else {
        browser = true;
        if (!nav.share && !(nav.clipboard && nav.clipboard.writeText)) {
          return Promise.resolve(Object.assign(result("failed"), {image: prepared.image}));
        }
        // 링크 발급을 기다리다 클릭 권한이 끝나면 다음 클릭에서 같은 링크로 연다.
        if (newLink && nav.userActivation && !nav.userActivation.isActive) return Promise.resolve(result("ready"));
        if (nav.share) {
          var data = {title: prepared.title, text: prepared.text, url: link.url};
          if (prepared.image && typeof File !== "undefined" && nav.canShare) {
            var file = new File([prepared.image], "invite.jpg", {type: prepared.image.type});
            if (nav.canShare({files: [file]})) data.files = [file];
          }
          work = nav.share(data);
        } else {
          status = "copied";
          work = nav.clipboard.writeText(text);
        }
      }
    } catch (e) { work = Promise.reject(e); }
    return Promise.resolve(work).then(function () { return result(status); }, function (e) {
      if (newLink && browser && e && e.name === "NotAllowedError") return result("ready");
      return result(e && e.name === "AbortError" ? "cancelled" : "failed");
    });
  }
  function share(prepared) {
    if (!enabled || !prepared || typeof prepared !== "object") return Promise.resolve({status: "failed"});
    var current = shareStates.get(prepared);
    if (!current) {
      current = {link: typeof prepared.url === "string" ? prepared : null};
      shareStates.set(prepared, current);
    }
    if (current.work) return current.work;
    if (current.link && current.link.expires && current.link.expires * 1000 <= Date.now()) {
      current.link = null;
      current.requestId = null;
    }
    if (current.link) current.work = openShare(prepared, current.link, false);
    else current.work = Promise.resolve().then(function () {
      if (!current.requestId) current.requestId = randomId();
      return issueShareLink(prepared, current.requestId);
    }).then(function (link) {
      if (link.expires && link.expires * 1000 <= Date.now()) {
        current.requestId = null;
        throw error("expired", 410, "초대 링크가 만료됐어요. 공유 버튼을 다시 눌러 주세요.");
      }
      current.link = link;
      return openShare(prepared, link, true);
    });
    function done() { current.work = null; }
    current.work.then(done, done);
    return current.work;
  }
  w.NcqInvite = Object.freeze({version: 1, ready: ready, signIn: signIn, accept: accept, reached: reached,
    onGrant: onGrant, resume: resume, prepareShare: prepareShare, share: share,
    status: function () { return enabled ? ready() : Promise.resolve({enabled: false}); },
    setIdentityProvider: function (fn) { if (auth) auth.setIdentityProvider(fn); },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }
  });
  if (enabled && w.addEventListener) {
    w.addEventListener("online", function () { resume(); });
    w.addEventListener("focus", function () { resume(); });
    if (w.document && w.document.addEventListener) w.document.addEventListener("visibilitychange", function () { if (!w.document.hidden) resume(); });
  }
})(typeof window !== "undefined" ? window : null);
