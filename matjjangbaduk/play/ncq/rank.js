/* NcqRank 1 — independent leaderboards, ES2017. NcqAuth owns identity and profile. */
(function (w) {
  "use strict";
  if (!w || w.NcqRank) return;
  function error(code, status) { var e = new Error(code); e.code = code; e.status = status || 0; return e; }
  function create(options) {
    options = options || (w.NCQ || {}).NCQ_RANK;
    if (!options || typeof options.apiUrl !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(options.game || "") ||
        !/^(test|prod)$/.test(options.environment || "")) throw error("rank_not_configured");
    var url = new URL(options.apiUrl);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))) {
      throw error("invalid_url");
    }
    var base = options.apiUrl.replace(/\/$/, "") + "/api/" + options.game + "/" + options.environment;
    var projected = "", pending = null;
    function auth() {
      var value = options.auth || w.NcqAuth;
      if (!value || !value.ready || !value.getToken) throw error("auth_unavailable");
      return value;
    }
    function same(a, player) {
      return a.ready().then(function (current) { if (current.player !== player) throw error("identity_changed", 409); });
    }
    function send(a, player, path, data, force) {
      return a.getToken({expectedPlayer: player, forceRefresh: !!force}).then(function (token) {
        return same(a, player).then(function () {
          var controller = typeof AbortController === "function" ? new AbortController() : null;
          var timer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
          var request = w.fetch(base + path, {method: data === undefined ? "GET" : "POST",
            headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
            body: data === undefined ? undefined : JSON.stringify(data), credentials: "omit", redirect: "error", cache: "no-store",
            signal: controller ? controller.signal : undefined});
          return request.then(function (response) {
            if (timer) clearTimeout(timer);
            return response.json().then(function (value) {
              return same(a, player).then(function () {
                if (response.status === 401 && !force) return send(a, player, path, data, true);
                if (!response.ok) throw error(value.error || "network", response.status);
                return value;
              });
            });
          }, function () { if (timer) clearTimeout(timer); throw error("network"); });
        });
      });
    }
    function project(a, player) {
      if (!a.profile) return Promise.resolve();
      return a.profile().then(function (profile) {
        if (profile.player !== player) throw error("identity_changed", 409);
        var data = {nickname: profile.nickname || "", avatar: typeof profile.avatar === "string" ? profile.avatar : null};
        var key = JSON.stringify([player, data]);
        if (key === projected) return;
        if (pending && pending.key === key) return pending.promise;
        var job = send(a, player, "/profile", data).then(function () { projected = key; });
        var task = {key: key, promise: job}; pending = task;
        return job.then(function () { if (pending === task) pending = null; },
          function (e) { if (pending === task) pending = null; throw e; });
      }).catch(function (e) { if (e.code === "identity_changed") throw e; });
    }
    function request(path, data, skipProfile) {
      var a = auth();
      return a.ready().then(function (owner) {
        if (!owner || !owner.player) throw error("unauthorized", 401);
        return (skipProfile ? Promise.resolve() : project(a, owner.player)).then(function () {
          return send(a, owner.player, path, data);
        });
      });
    }
    function name(board) {
      if (typeof board !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(board)) throw error("invalid_board");
      return "/boards/" + board;
    }
    function leaderboard(board, options) {
      options = options || {};
      return request(name(board) + "?limit=" + encodeURIComponent(options.limit === undefined ? 50 : options.limit) +
        "&nearby=" + encodeURIComponent(options.nearby === undefined ? 3 : options.nearby));
    }
    return Object.freeze({
      boards: function () { return request("/boards"); },
      submit: function (board, record) {
        if (!record || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/.test(record.id) ||
            !Number.isSafeInteger(record.value)) return Promise.reject(error("invalid"));
        return request(name(board) + "/scores", {id: record.id, value: record.value});
      },
      leaderboard: leaderboard,
      mine: function (board) { return leaderboard(board, {limit: 1, nearby: 0}).then(function (data) { return data.you; }); },
      nearby: function (board, radius) { return leaderboard(board, {limit: 1, nearby: radius === undefined ? 3 : radius})
        .then(function (data) { return data.nearby; }); },
      erase: function () { return request("/erase", {}, true).then(function (data) { projected = ""; return data; }); }
    });
  }
  var shared;
  function current() { if (!shared) shared = create(); return shared; }
  w.NcqRank = Object.freeze({version: 1, create: create,
    boards: function () { return current().boards(); },
    submit: function (board, record) { return current().submit(board, record); },
    leaderboard: function (board, options) { return current().leaderboard(board, options); },
    mine: function (board) { return current().mine(board); },
    nearby: function (board, radius) { return current().nearby(board, radius); },
    erase: function () { return current().erase(); }
  });
})(typeof window !== "undefined" ? window : null);
