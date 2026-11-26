/* NcqInviteRewards 2 — platform routing and server-confirmed reward delivery. ES2017.
 * Share return values never grant rewards. Popup SDK callbacks are server-confirmed counts.
 * Existing NcqInvite APIs and server contracts are unchanged. */
(function (w) {
  "use strict";
  if (!w || w.NcqInviteRewards) return;
  var cfg = (w.NCQ || {}).NCQ_INVITE_REWARDS || w.NCQ_INVITE_REWARDS || null;
  var adapters = {}, receiver = null, listeners = [], work = null, generation = 0;
  var state = {enabled: false, available: false, provider: null, platform: null, status: "disabled", reason: "not_configured"};
  var prepared = new WeakMap(), connectedInvite = null;
  var retryTimer = null, retryCount = 0;
  var loading = {}, assetBase = null;
  try {
    var scriptURL = w.document && w.document.currentScript && w.document.currentScript.src;
    assetBase = scriptURL ? new URL(/\/ncq\/invite-rewards\.js(?:[?#]|$)/.test(scriptURL) ? "../" : "./", scriptURL).href :
      (w.document && w.document.baseURI);
  } catch (e) {}
  var ID = /^[A-Za-z0-9_.:-]{1,120}$/;
  function countProvider(r) { return r.provider !== "ncq_invite" && adapters[r.platform] &&
    adapters[r.platform].contract === "server-count-popup/v1"; }
  function err(code) { var e = new Error(code); e.code = code; return e; }
  function bounded(value) {
    return new Promise(function (resolve, reject) {
      var done = false, timer = w.setTimeout(function () {
        if (!done) { done = true; reject(err("provider_timeout")); }
      }, 30000);
      Promise.resolve(value).then(function (out) {
        if (!done) { done = true; w.clearTimeout(timer); resolve(out); }
      }, function (e) {
        if (!done) { done = true; w.clearTimeout(timer); reject(e); }
      });
    });
  }
  function emit(extra) {
    Object.assign(state, extra || {});
    listeners.slice().forEach(function (fn) { try { fn(Object.assign({}, state)); } catch (e) {} });
    return Object.assign({}, state);
  }
  function platform() {
    var declared = (w.NCQ || {}).NCQ_PLATFORM, p = declared || "web", h = w.HLSDK, hp;
    p = {googleplay: "android", appstore: "ios", kakao: "kakaotalk"}[p] || p;
    try { hp = h && h.provider && h.provider.ProviderType; } catch (e) {}
    hp = hp === "WEBGL_KAKAO" ? "kakaotalk" : (hp === "WEBGL_KAKAOPAY" ? "kakaopay" : null);
    if (hp && declared && p !== "hyperlane" && p !== hp) throw err("platform_mismatch");
    return hp || p;
  }
  function route(settlement) {
    if (!cfg) throw err("disabled");
    var p = platform(), provider = (cfg.routes || {})[p];
    if (!provider) provider = p === "kakaopay" || p === "kakaotalk" ? "neptune" : "ncq_invite";
    var active = cfg.enabled === true && provider !== "disabled";
    if (!active && !settlement) throw err("disabled");
    if (provider === "disabled") provider = ((cfg.adapters || {})[p] || {}).provider ||
      (p === "kakaopay" || p === "kakaotalk" ? "neptune" : "ncq_invite");
    if (provider === "ncq_invite" && !/^(web|android|ios|toss)$/.test(p)) throw err("unsupported_platform");
    return {platform: p, provider: provider, active: active};
  }
  function loadProvider(r) {
    if (r.provider === "ncq_invite" || adapters[r.platform]) return Promise.resolve();
    if (loading[r.platform]) return loading[r.platform];
    var entry = ((cfg.adapters || {})[r.platform] || {}).entry;
    if (!entry || !assetBase || !w.document) return Promise.reject(err("provider_unavailable"));
    var url = new URL(entry, assetBase);
    if (w.location && url.origin !== w.location.origin) return Promise.reject(err("provider_unavailable"));
    var script = w.document.createElement("script");
    loading[r.platform] = bounded(new Promise(function (resolve, reject) {
      script.src = url.href;
      script.onload = function () { adapters[r.platform] ? resolve() : reject(err("provider_unavailable")); };
      script.onerror = function () { reject(err("provider_unavailable")); };
      w.document.head.appendChild(script);
    })).catch(function (e) {
      delete loading[r.platform];
      if (script.parentNode) script.parentNode.removeChild(script);
      throw e;
    });
    return loading[r.platform];
  }
  function scope(r) {
    var s;
    if (r.provider === "ncq_invite") {
      // NcqAuth.account() exposes identity, not game/environment. Read those
      // from the authenticated build configuration; don't assume extra fields.
      var account = w.NcqAuth && w.NcqAuth.account && w.NcqAuth.account();
      var accountScope = (w.NCQ || {}).NCQ_AUTH || (w.NCQ || {}).NCQ_INVITE;
      s = account && accountScope && {game: accountScope.game, environment: accountScope.environment, player: account.player};
    }
    else {
      var a = adapters[r.platform];
      if (!a || a.id !== r.provider || a.ready() !== true) throw err("provider_unavailable");
      s = a.scope();
    }
    if (!s || s.game !== cfg.game || !/^(test|prod)$/.test(s.environment) ||
        (cfg.environment !== "auto" && s.environment !== cfg.environment) ||
        typeof s.player !== "string" || !ID.test(s.player)) throw err("scope_mismatch");
    var builtScope = (w.NCQ || {}).NCQ_AUTH || (w.NCQ || {}).NCQ_INVITE;
    if (builtScope && (builtScope.game !== s.game || builtScope.environment !== s.environment)) throw err("scope_mismatch");
    if (r.provider !== "ncq_invite" && s.platform && s.platform !== r.platform) throw err("scope_mismatch");
    return {game: s.game, environment: s.environment, player: s.player, platform: r.platform};
  }
  function same(a, b) { return !!(a && b && a.game === b.game && a.environment === b.environment && a.player === b.player &&
    (!a.platform || !b.platform || a.platform === b.platform)); }
  function assertOwner(r, s, token) {
    if (generation !== token || !same(scope(r), s)) throw err("account_changed");
  }
  function assertTarget(r, s, token, target) {
    assertOwner(r, s, token);
    if (receiver !== target || target.currentSaveId() !== target.saveId) throw err("save_changed");
  }
  function journalKey(r, s) { return "ncq:invite-rewards:" + [s.game, s.environment, r.platform, r.provider, s.player].join(":"); }
  function read(r, s) {
    var value = w.localStorage.getItem(journalKey(r, s));
    var items = value ? JSON.parse(value) : [];
    if (!Array.isArray(items) || items.some(function (x) { return !x || typeof x.id !== "string" || !ID.test(x.id) || typeof x.saveId !== "string" ||
        !/^[A-Za-z0-9_-]{8,100}$/.test(x.saveId); })) throw err("invalid_journal");
    return items;
  }
  function write(r, s, items) { w.localStorage.setItem(journalKey(r, s), JSON.stringify(items)); }
  function attach(r) {
    if (r.provider !== "ncq_invite") return;
    var i = w.NcqInvite;
    if (!i || typeof i.onGrant !== "function") throw err("invite_sdk_missing");
    if (!receiver) throw err("receiver_missing");
    if (connectedInvite === i) return;
    var target = receiver;
    i.onGrant(function (g) {
      if (receiver !== target || target.currentSaveId() !== target.saveId || !same(scope(r), target.owner)) return false;
      return target.fn(g);
    }, {saveId: target.saveId});
    if (i.onChange) i.onChange(function (st) {
      if (receiver && same(scope(r), receiver.owner)) emit({incoming: st.incoming || null});
    });
    connectedInvite = i;
  }
  function onGrant(fn, options) {
    if (typeof fn !== "function" || !options || typeof options.saveId !== "string" ||
        !/^[A-Za-z0-9_-]{8,100}$/.test(options.saveId)) throw err("invalid_receiver");
    var r = route(true), s = scope(r);
    if (!options.currentSaveId && (!w.NcqSave || w.NcqSave.version < 4)) throw err("storage_sdk_outdated");
    var currentSaveId = options.currentSaveId || (w.NcqSave && w.NcqSave.saveId);
    if (typeof currentSaveId !== "function" || currentSaveId() !== options.saveId) throw err("save_changed");
    generation++; prepared = new WeakMap(); connectedInvite = null;
    if (retryTimer) { w.clearTimeout(retryTimer); retryTimer = null; }
    receiver = {fn: fn, saveId: options.saveId, currentSaveId: currentSaveId, owner: s};
    attach(r);
    if (countProvider(r)) {
      var target = receiver, token = generation;
      adapters[r.platform].bind({scope: s, saveId: options.saveId, grant: fn,
        current: function () { assertTarget(r, s, token, target); },
        report: function (code) { if (receiver === target) emit({status: "deferred", reason: code}); },
        wake: function () { Promise.resolve(work).catch(function () {}).then(function () {
          if (receiver === target) return claimRewards();
        }).catch(function () {}); }});
      Promise.resolve(work).catch(function () {}).then(function () {
        if (receiver === target) claimRewards().catch(function () {});
      });
    } else if (r.provider !== "ncq_invite") {
      try {
        var binding = receiver;
        if (read(r, s).length) Promise.resolve(work).catch(function () {}).then(function () {
          if (receiver === binding) return claimRewards();
        }).catch(function () {});
      } catch (e) { emit({status: "deferred", reason: "storage_unavailable"}); }
    }
    return function () { if (receiver && receiver.fn === fn) { receiver = null; generation++; connectedInvite = null; } };
  }
  function ready() {
    var token = generation;
    return Promise.resolve().then(function () {
      var r = route(true);
      if (r.provider === "ncq_invite") {
        if (!w.NcqInvite || !w.NcqAuth || !(w.NCQ || {}).NCQ_INVITE) throw err("invite_sdk_missing");
        return w.NcqAuth.ready().then(function () { return refresh(); });
      }
      return loadProvider(r).then(function () { return refresh(); });
    }).catch(function (e) {
      if (generation !== token) return Object.assign({}, state);
      emit({enabled: false, available: false, player: null, incoming: null, claimed: null, claimable: null, remaining: null,
        status: e.code === "disabled" || e.code === "platform_disabled" ? "disabled" : "unavailable", reason: e.code || "provider_unavailable"});
      return Object.assign({}, state);
    });
  }
  function refresh() {
    var epoch = generation;
    return Promise.resolve().then(function () {
      var r = route(true), s = scope(r), token = generation;
      return Promise.resolve(r.provider === "ncq_invite" ? w.NcqInvite.ready() : bounded(adapters[r.platform].state())).then(function (out) {
        assertOwner(r, s, token);
        var count = countProvider(r), unknown = count && out && out.ok === false;
        if (r.provider !== "ncq_invite" && !unknown && (!out || out.ok !== true ||
            !Number.isSafeInteger(out.claimed) || out.claimed < 0 || !Number.isSafeInteger(out.claimable) || out.claimable < 0 ||
            (!(count && out.limit === null) && (!Number.isSafeInteger(out.limit) || out.limit < out.claimed ||
            out.claimable > out.limit - out.claimed)))) throw err("invalid_state");
        return emit({enabled: r.active && (r.provider !== "ncq_invite" || out.enabled !== false),
          available: true, status: r.active ? "ready" : "disabled", reason: unknown ? "query_failed" : (r.active ? null : "disabled"),
          provider: r.provider, platform: r.platform, player: s.player,
          contract: r.provider === "ncq_invite" ? "ncq_invite" : adapters[r.platform].contract,
          claimed: unknown ? null : out.claimed, claimable: unknown ? null : out.claimable, limit: out.limit,
          remaining: !unknown && Number.isSafeInteger(out.limit) ? out.limit - out.claimed : null,
          incoming: out.incoming || null});
      });
    }).catch(function (e) {
      if (epoch !== generation) throw e;
      emit({enabled: false, available: false, player: null, incoming: null, claimed: null, claimable: null, remaining: null,
        status: "unavailable", reason: e.code || "query_failed"});
      throw e;
    });
  }
  function prepareShare(options) {
    return ready().then(function (st) {
      if (!st.enabled) throw err(st.reason);
      var r = route(), s = scope(r), token = generation;
      if (!receiver || !same(receiver.owner, s)) throw err("receiver_missing");
      assertTarget(r, s, token, receiver);
      return Promise.resolve(r.provider === "ncq_invite" ? w.NcqInvite.prepareShare(options || {}) :
        bounded(adapters[r.platform].prepareShare(options || {}))).then(function (value) {
        assertOwner(r, s, token);
        var handle = {}; prepared.set(handle, {route: r, scope: s, token: token, value: value});
        return handle;
      });
    });
  }
  function share(handle) {
    // Invoke synchronously from a click. true, void, shared, copied never enter deliver().
    try {
      var p = prepared.get(handle);
      if (!p) throw err("share_not_prepared");
      assertOwner(p.route, p.scope, p.token);
      return Promise.resolve(p.route.provider === "ncq_invite" ? w.NcqInvite.share(p.value) :
        bounded(adapters[p.route.platform].share(p.value))).then(function (out) {
          assertOwner(p.route, p.scope, p.token);
          return out && typeof out.status === "string" ? {status: out.status} : {status: "opened"};
        });
    } catch (e) { return Promise.reject(e); }
  }
  function receiptId(r, s, id) {
    if (!w.crypto || !w.crypto.subtle || !w.TextEncoder) return Promise.reject(err("crypto_unavailable"));
    return w.crypto.subtle.digest("SHA-256", new w.TextEncoder().encode(JSON.stringify([r.platform, r.provider, s, id]))).then(function (bytes) {
      return "invite:" + Array.from(new Uint8Array(bytes)).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  function ack(r, s, item, token) {
    assertOwner(r, s, token);
    return bounded(adapters[r.platform].ack({id: item.id, saveId: item.saveId, scope: s})).then(function (out) {
      assertOwner(r, s, token);
      if (!out || out.ok !== true || out.id !== item.id || out.saveId !== item.saveId) throw err("ack_failed");
      write(r, s, read(r, s).filter(function (x) { return x.id !== item.id; }));
    });
  }
  function claimRewards(options) {
    if (work) return work;
    var epoch = generation;
    work = Promise.resolve().then(function () {
      var r = route(true), s = scope(r), token = generation;
      if (!receiver || !same(receiver.owner, s)) throw err("receiver_missing");
      assertTarget(r, s, token, receiver);
      if (r.provider === "ncq_invite") { attach(r); return w.NcqInvite.resume(); }
      if (countProvider(r)) return bounded(options && options.interactive === true ?
        adapters[r.platform].claim() : adapters[r.platform].resume());
      var a = adapters[r.platform], target = receiver, chain = Promise.resolve();
      // Persisted acks are owner-bound; don't move an old grant into a new save.
      read(r, s).forEach(function (item) { chain = chain.then(function () { return ack(r, s, item, token); }); });
      return chain.then(function () { assertTarget(r, s, token, target); return bounded(a.claim({scope: s, saveId: target.saveId})); }).then(function (out) {
        assertTarget(r, s, token, target);
        if (!out || out.ok !== true || out.source !== "server" || !same(out.scope, s) ||
            out.saveId !== target.saveId || !Array.isArray(out.grants) || out.grants.length > 100) throw err("server_grants_required");
        var ids = Object.create(null), sequence = Promise.resolve(), applied = 0;
        // Validate the entire batch before changing any balance.
        out.grants.forEach(function (g) {
          if (!g || typeof g.id !== "string" || !ID.test(g.id) || ids[g.id] ||
              !g.reward || !/^[A-Z][A-Z0-9_]{0,63}$/.test(g.reward.key) ||
              !Number.isSafeInteger(g.reward.amount) || g.reward.amount <= 0 || g.reward.amount > 1000000) throw err("invalid_grant");
          ids[g.id] = true;
        });
        out.grants.forEach(function (g) {
          sequence = sequence.then(function () {
            assertTarget(r, s, token, target);
            return receiptId(r, s, g.id);
          }).then(function (id) {
            assertTarget(r, s, token, target);
            return bounded(target.fn(Object.freeze({id: id, providerGrantId: g.id, provider: r.provider,
              scope: Object.freeze(Object.assign({}, s)), reward: Object.freeze({key: g.reward.key, amount: g.reward.amount})})));
          }).then(function (ok) {
            assertTarget(r, s, token, target);
            if (ok !== true) throw err("save_deferred");
            var item = {id: g.id, saveId: target.saveId}, queue = read(r, s);
            if (!queue.some(function (x) { return x.id === item.id; })) { queue.push(item); write(r, s, queue); }
            return ack(r, s, item, token).then(function () { applied++; });
          });
        });
        return sequence.then(function () { return {status: "settled", acknowledged: applied}; });
      });
    });
    var current = work;
    current.then(function () {
      if (work === current) work = null;
      if (epoch !== generation) return;
      retryCount = 0;
      if (retryTimer) { w.clearTimeout(retryTimer); retryTimer = null; }
      refresh().catch(function () {});
    }, function (e) {
      if (work === current) work = null;
      if (epoch !== generation) return;
      emit(Object.assign({status: "deferred", reason: e.code || "claim_failed"},
        e.code === "account_changed" ? {enabled: false, player: null, incoming: null} : {}));
      if (!retryTimer && receiver && !/^(account_changed|save_changed|receiver_missing|crypto_unavailable|invalid_|server_grants_required|disabled|platform_)/.test(e.code || "")) {
        retryTimer = w.setTimeout(function () {
          retryTimer = null;
          if (epoch === generation && receiver) claimRewards().catch(function () {});
        }, Math.min(600000, 30000 * Math.pow(2, retryCount++)));
      }
    });
    return current;
  }
  function registerProvider(a) {
    if (!a || !/^[a-z][a-z0-9_-]{0,39}$/.test(a.id || "") || a.id === "ncq_invite" ||
        !/^(kakaopay|kakaotalk)$/.test(a.platform || "") ||
        ["server-grants/v1", "server-count-popup/v1"].indexOf(a.contract) < 0 ||
        ["ready", "scope", "state", "prepareShare", "share", "claim"].concat(
          a.contract === "server-count-popup/v1" ? ["bind", "resume"] : ["ack"]
        ).some(function (k) { return typeof a[k] !== "function"; })) throw err("invalid_provider");
    if (adapters[a.platform]) throw err("provider_already_registered");
    adapters[a.platform] = a;
  }
  w.NcqInviteRewards = {version: 2, ready: ready, state: function () { return Object.assign({}, state); },
    refresh: refresh, onGrant: onGrant, prepareShare: prepareShare, share: share, claimRewards: claimRewards,
    registerProvider: registerProvider,
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    accept: function (token) { return route(true).provider === "ncq_invite" ? w.NcqInvite.accept(token) : Promise.reject(err("unsupported_operation")); },
    reached: function (event, fields) { return route(true).provider === "ncq_invite" ? w.NcqInvite.reached(event, fields) : Promise.resolve({status: "not_required"}); }};
  function resume() {
    if (!cfg) return;
    ready().then(function (st) { if (st.available && receiver) claimRewards().catch(function () {}); });
  }
  if (w.addEventListener) { w.addEventListener("focus", resume); w.addEventListener("online", resume); }
})(typeof window !== "undefined" ? window : null);
