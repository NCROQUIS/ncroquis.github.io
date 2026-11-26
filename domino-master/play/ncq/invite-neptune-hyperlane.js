/* Confirmed HyperLane KakaoTalk API (dokuduck publisher 834cbda).
 * The SDK verifies/claims with Neptune before onGrant(count). Local delivery IDs
 * only deduplicate storage retries; they are NOT Neptune share/grant IDs. ES2017. */
(function (w) {
  "use strict";
  if (!w || !w.NcqInviteRewards) return;
  var binding = null, opened = false, claiming = null, draining = null;
  var memory = Object.create(null), lastOptions = {};
  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function sdk() {
    var h = w.HLSDK, descriptor = h && Object.getOwnPropertyDescriptor(h, "Instance");
    return descriptor && descriptor.value ? descriptor.value : h; // never initialize a lazy SDK
  }
  function settings() { return (w.NCQ || {}).NCQ_INVITE_REWARDS || w.NCQ_INVITE_REWARDS || {}; }
  function provider() { var h = sdk(); return h && h.provider; }
  function ready() {
    var h = sdk(), p = provider(), reward = settings().reward;
    return !!(w.crypto && typeof w.crypto.getRandomValues === "function" &&
      reward && /^[A-Z][A-Z0-9_]{0,63}$/.test(reward.key) &&
      Number.isSafeInteger(reward.amount) && reward.amount > 0 && reward.amount <= 1000000 &&
      h && p && p.ProviderType === "WEBGL_KAKAO" &&
      typeof h.CheckLoginStatus === "function" && h.CheckLoginStatus() === true &&
      typeof h.GetUserKey === "function" && typeof h.getServerTypeStr === "function" &&
      typeof h.GetUserKey() === "string" && h.GetUserKey() && !/^guest_/.test(h.GetUserKey()) &&
      typeof p.ShowInvitePopup === "function" && typeof p.CheckInviteRewardsAsync === "function" &&
      typeof p.claimInviteRewards === "function" && w.InvitePopup && typeof w.InvitePopup.show === "function");
  }
  function scope() {
    var mode = sdk().getServerTypeStr();
    return {game: settings().game, environment: mode === "live" ? "prod" : (mode === "dev" ? "test" : ""),
      player: sdk().GetUserKey(), platform: "kakaotalk"};
  }
  function limit() {
    var p = provider(), n = p && p.constructor && p.constructor.INVITE_MAX_PER_DAY;
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  function key(b) { return "ncq:invite-count:" + JSON.stringify([b.scope, b.saveId]); }
  function queue(b) {
    var k = key(b);
    if (!memory[k]) {
      var raw = w.localStorage.getItem(k), value = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value) || value.some(function (g) {
        return !g || !/^invite-local:[a-f0-9]{32}$/.test(g.id) || g.source !== "neptune-server-count" ||
          !Number.isSafeInteger(g.count) || g.count <= 0 || !g.reward ||
          !/^[A-Z][A-Z0-9_]{0,63}$/.test(g.reward.key) ||
          !Number.isSafeInteger(g.reward.amount) || g.reward.amount <= 0 || g.reward.amount > 1000000;
      })) throw fail("invalid_journal");
      memory[k] = value;
    }
    return memory[k];
  }
  function persist(b) { w.localStorage.setItem(key(b), JSON.stringify(queue(b))); }
  function localId() {
    if (!w.crypto || !w.crypto.getRandomValues) throw fail("crypto_unavailable");
    var bytes = new Uint8Array(16);
    w.crypto.getRandomValues(bytes);
    return "invite-local:" + Array.from(bytes).map(function (n) { return ("0" + n.toString(16)).slice(-2); }).join("");
  }
  function receive(b, count) {
    var reward = b.reward;
    if (!Number.isSafeInteger(count) || count <= 0 || (limit() !== null && count > limit()) || !reward ||
        !Number.isSafeInteger(reward.amount * count) || reward.amount * count > 1000000) {
      b.report("invalid_grant"); return;
    }
    // Preserve the original binding even if the account changed during the SDK request.
    var item = {id: localId(), source: "neptune-server-count", providerGrantId: null, count: count,
      provider: "neptune", scope: Object.assign({}, b.scope),
      reward: {key: reward.key, amount: reward.amount * count}};
    try { queue(b).push(item); persist(b); }
    catch (e) { b.report("storage_unavailable"); }
    b.wake();
  }
  function resume() {
    if (draining) return draining;
    var b = binding;
    if (!b) return Promise.reject(fail("receiver_missing"));
    draining = Promise.resolve().then(function () {
      b.current(); persist(b);
      var items = queue(b).slice(), sequence = Promise.resolve(), delivered = 0;
      items.forEach(function (g) {
        sequence = sequence.then(function () {
          b.current();
          return b.grant(Object.freeze(Object.assign({}, g, {reward: Object.freeze(Object.assign({}, g.reward))})));
        }).then(function (ok) {
          b.current();
          if (ok !== true) throw fail("save_deferred");
          var old = queue(b), remaining = old.filter(function (item) { return item.id !== g.id; });
          // Keep the pending item if journal cleanup fails; the same local ID is retried.
          w.localStorage.setItem(key(b), JSON.stringify(remaining));
          memory[key(b)] = remaining; delivered++;
        });
      });
      return sequence.then(function () { return {status: "settled", delivered: delivered, recovery: "local-journal"}; });
    });
    var current = draining;
    current.then(function () { if (draining === current) draining = null; },
      function () { if (draining === current) draining = null; });
    return current;
  }
  function share(options) {
    if (!binding || !ready()) throw fail("provider_unavailable");
    binding.current();
    if (opened || claiming || queue(binding).length) throw fail("save_deferred");
    persist(binding);
    var b = binding;
    opened = true; lastOptions = options || lastOptions;
    var onClose = lastOptions.onClose;
    try {
      provider().ShowInvitePopup(Object.assign({}, lastOptions, {
        onGrant: function (count) { receive(b, count); },
        onClose: function () {
          opened = false; b.wake();
          if (typeof onClose === "function") onClose();
        }
      }));
    } catch (e) { opened = false; throw e; }
    return {status: "opened"};
  }
  function claim() {
    if (claiming) return claiming;
    if (opened) return Promise.reject(fail("popup_open"));
    var b = binding;
    if (!b || !ready()) return Promise.reject(fail("provider_unavailable"));
    // Explicit user action only. Background resume never calls the server's claim API.
    claiming = resume().then(function () {
      b.current();
      return provider().claimInviteRewards(function (count) { receive(b, count); });
    }).then(function (n) {
      if (!Number.isSafeInteger(n) || n < 0) throw fail("claim_failed");
      return resume();
    });
    var current = claiming;
    current.then(function () { if (claiming === current) claiming = null; },
      function () { if (claiming === current) claiming = null; });
    return current;
  }
  w.NcqInviteRewards.registerProvider({
    id: "neptune", platform: "kakaotalk", contract: "server-count-popup/v1",
    ready: ready, scope: scope,
    state: function () { return Promise.resolve(provider().CheckInviteRewardsAsync()).then(function (out) {
      return Object.assign({}, out, {limit: limit()});
    }); },
    bind: function (value) { binding = Object.assign({}, value, {reward: Object.assign({}, settings().reward)}); },
    prepareShare: function (options) { lastOptions = options; return options; },
    share: share, resume: resume, claim: claim
  });
})(typeof window !== "undefined" ? window : null);
