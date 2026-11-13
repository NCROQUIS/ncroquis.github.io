/* NcqAuth — 플랫폼 증명 교환과 Firebase 로그인. ES2017. */
(function (w) {
  "use strict";
  if (!w || w.NcqAuth) return;
  var cfg = (w.NCQ || {}).NCQ_AUTH;
  var enabled = !!(cfg && cfg.url && cfg.game && cfg.firebase && /^(test|prod)$/.test(cfg.environment));
  var base = enabled ? String(cfg.url).replace(/\/$/, "") : "";
  var prefix = enabled ? "ncq:invite:" + cfg.game + ":" + cfg.environment + ":" : "";
  var firebase, auth, starting, busy, identityProvider;

  function error(code, status, message) {
    var e = new Error(message || code); e.code = code; e.status = status || 0; return e;
  }
  function legacyCredential() {
    try { return JSON.parse(w.localStorage.getItem(prefix + "credential")); }
    catch (e) { return null; }
  }
  function init() {
    if (!enabled) return Promise.reject(error("disabled"));
    if (!starting) {
      starting = Promise.resolve().then(function () {
        firebase = typeof ncqFirebaseSdk !== "undefined" ? ncqFirebaseSdk : w.NcqFirebaseAuth;
        if (!firebase) throw error("auth_unavailable", 503, "Firebase 로그인 도구를 불러오지 못했어요.");
        var app = firebase.initializeApp(cfg.firebase, "ncq:" + cfg.environment + ":" + cfg.game);
        auth = firebase.initializeAuth(app, {persistence: [firebase.indexedDBLocalPersistence, firebase.browserLocalPersistence]});
        if (cfg.emulator) {
          if (cfg.environment !== "test" || !/^demo-/.test(cfg.firebase.projectId) ||
              !/^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]{1,5}$/.test(cfg.emulator)) throw error("invalid_emulator");
          firebase.connectAuthEmulator(auth, cfg.emulator, {disableWarnings: true});
        }
        return auth.authStateReady();
      });
    }
    return starting;
  }
  function http(path, method, data, token, timeoutMs) {
    var headers = {}, options = {method: method || "GET", headers: headers, credentials: "omit", cache: "no-store"};
    if (token) {
      headers.Authorization = "Bearer " + token;
      headers["X-Ncq-Game"] = cfg.game;
      headers["X-Ncq-Environment"] = cfg.environment;
    }
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(data);
    }
    var controller = w.AbortController ? new w.AbortController() : null;
    if (controller) options.signal = controller.signal;
    var timeout;
    var fetchRequest = Promise.resolve().then(function () { return w.fetch(base + path, options); }).then(function (r) {
      return r.json().then(function (out) {
        if (!r.ok) {
          var e = error(out.code || "server_error", r.status, out.message);
          e.retryAfter = Math.min(3600, parseInt(r.headers.get("Retry-After") || "0", 10) || 0) * 1000;
          throw e;
        }
        return out;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timeout = w.setTimeout(function () { if (controller) controller.abort(); reject(error("network_timeout")); }, timeoutMs || 15000);
    });
    return Promise.race([fetchRequest, deadline]).then(function (out) { w.clearTimeout(timeout); return out; }, function (e) {
      w.clearTimeout(timeout); throw e;
    });
  }
  function tossProof() {
    var user = (w.NcqToss || {}).User;
    if (!user || !user.createAnonymousKeyAuthCode) return Promise.reject(error("identity_unavailable", 403));
    return Promise.resolve(user.createAnonymousKeyAuthCode()).then(function (out) {
      return {provider: "toss", token: typeof out === "string" ? out : out.code};
    });
  }
  function exchange(proof, credential, token, refresh) {
    var request = {game: cfg.game, environment: cfg.environment, platform: cfg.platform || "web"};
    if (credential) request.credential = credential;
    if (proof) request.proof = proof;
    return http(refresh ? "/auth/v1/session/refresh" : "/auth/v1/session", "POST", request, token,
      proof && proof.provider === "play_games" ? 7500 : 0).then(function (out) {
      return firebase.signInWithCustomToken(auth, out.customToken);
    }).then(function () {
      try { w.localStorage.removeItem(prefix + "credential"); } catch (e) { /* Firebase has saved the login */ }
      return auth.currentUser;
    });
  }
  function playGamesProof() {
    var native = (((w.Capacitor || {}).Plugins || {}).NcqPlayGames);
    if (!cfg.playGamesClientId || !native || !native.getServerAuthCode) return Promise.resolve(null);
    var timer;
    var wait = new Promise(function (resolve) { timer = w.setTimeout(function () { resolve(null); }, 3000); });
    var code = Promise.resolve().then(function () {
      return native.getServerAuthCode({clientId: cfg.playGamesClientId});
    }).then(function (out) {
      return out && typeof out.code === "string" && out.code ? {provider: "play_games", token: out.code} : null;
    }, function () { return null; });
    return Promise.race([code, wait]).then(function (proof) { w.clearTimeout(timer); return proof; });
  }
  function firstLogin(restorePlayGames) {
    function start() {
      if (cfg.platform === "googleplay" && restorePlayGames !== false) {
        return playGamesProof().then(function (proof) {
          if (!proof) return exchange();
          return exchange(proof).catch(function () { return exchange(); });
        });
      }
      if (cfg.platform === "toss") {
        return tossProof().then(function (proof) { return exchange(proof); }).catch(function (e) {
          if (e.code !== "identity_unavailable" && e.code !== "invalid_proof") throw e;
          return exchange();
        });
      }
      return exchange();
    }
    var credential = legacyCredential();
    return credential ? exchange(null, credential).catch(function (e) {
      if (e.code !== "invalid_credential") throw e;
      return start();
    }) : start();
  }
  function track(work) {
    busy = work;
    function done() { if (busy === work) busy = null; }
    work.then(done, done);
    return work;
  }
  function tokenSession(user, force, expectedPlayer, platformRefreshed, userRefreshed) {
    if (expectedPlayer && user.uid !== expectedPlayer) throw error("identity_changed", 409, "사용자가 바뀌었어요.");
    return user.getIdTokenResult(!!force).then(function (result) {
      if (auth.currentUser !== user) {
        // A signed refresh replaces Firebase's User object while preserving its UID.
        if (!userRefreshed && auth.currentUser && auth.currentUser.uid === user.uid) {
          return tokenSession(auth.currentUser, force, expectedPlayer || user.uid, platformRefreshed, true);
        }
        throw error("identity_changed", 409, "사용자가 바뀌었어요.");
      }
      var scope = result.claims.ncq;
      if (!scope || scope.game !== cfg.game || scope.environment !== cfg.environment) {
        throw error("wrong_scope", 403, "이 게임과 환경에서 다시 사용자 확인을 해 주세요.");
      }
      if (scope.platform !== (cfg.platform || "web")) {
        if (!platformRefreshed && scope.platform === "web" && cfg.platform === "googleplay") {
          var player = user.uid;
          var renewal = busy || track(exchange(null, null, result.token));
          return renewal.then(function (refreshed) {
            return tokenSession(refreshed, false, expectedPlayer || player, true);
          });
        }
        throw error("wrong_scope", 403, "이 게임과 환경에서 다시 사용자 확인을 해 주세요.");
      }
      return {token: result.token, player: user.uid, identity: scope.identity, role: result.claims.role,
        photoUrl: scope.photoUrl || null, nickname: scope.nickname || null};
    });
  }
  function session(force, expectedPlayer) {
    return init().then(function () {
      return busy || auth.currentUser || track(firstLogin());
    }).then(function (user) {
      return tokenSession(user, force, expectedPlayer).catch(function (e) {
        // 네트워크 장애는 기존 사용자와 미지급 보상을 유지해요.
        if (cfg.platform !== "googleplay" || !/^auth\/(user-token-expired|invalid-user-token|user-disabled|user-not-found)$/.test(e.code)
            || (auth.currentUser && auth.currentUser !== user)) throw e;
        var restart = busy || track(Promise.resolve().then(function () {
          if (auth.currentUser === user) return auth.signOut();
        }).then(function () { return auth.currentUser || firstLogin(false); }));
        return restart.then(function (guest) { return tokenSession(guest, false, expectedPlayer); });
      });
    });
  }
  function summary(result) { return {player: result.player, identity: result.identity}; }
  function ready() { return session().then(summary); }
  function profile() {
    return session().then(function (result) {
      return {player: result.player, identity: result.identity, photoUrl: result.photoUrl, nickname: result.nickname};
    });
  }
  function getToken(options) {
    options = options || {};
    return session(options.forceRefresh, options.expectedPlayer).then(function (result) {
      if (options.role !== "authenticated" || result.role === "authenticated") return result.token;
      // Upgrade an existing signed session in place. Never create another player for a missing claim.
      var renewal = busy || track(exchange(null, null, result.token, true));
      return renewal.then(function (user) { return tokenSession(user, true, result.player); }).then(function (fresh) {
        if (fresh.role !== "authenticated") throw error("auth_unavailable", 503);
        return fresh.token;
      });
    });
  }
  function signIn(proof) {
    return init().then(function () {
      if (busy) throw error("busy", 409);
      var getProof = proof ? Promise.resolve(proof) : cfg.platform === "toss" ? tossProof()
        : identityProvider ? Promise.resolve().then(identityProvider) : Promise.reject(error("identity_unavailable", 403));
      var user = auth.currentUser;
      return track(getProof.then(function (verified) {
        var token = user ? user.getIdToken() : Promise.resolve("");
        return token.then(function (idToken) { return exchange(verified, user ? null : legacyCredential(), idToken); });
      }));
    }).then(ready);
  }
  function request(path, method, data, expectedPlayer) {
    return session(false, expectedPlayer).then(function (s) {
      return http(path, method, data, s.token).catch(function (e) {
        if (e.status !== 401 || e.code !== "unauthorized") throw e;
        return session(true, s.player).then(function (fresh) { return http(path, method, data, fresh.token); });
      });
    });
  }
  w.NcqAuth = Object.freeze({ready: ready, profile: profile, signIn: signIn, getToken: getToken, request: request,
    publicRequest: function (path) { return enabled ? http(path) : Promise.reject(error("disabled")); },
    setIdentityProvider: function (fn) { identityProvider = fn; }
  });
  if (enabled && cfg.platform === "googleplay") ready().catch(function () { /* 초대 기능이 필요할 때 다시 시도해요. */ });
})(typeof window !== "undefined" ? window : null);
