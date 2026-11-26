/* NcqAuth — 플랫폼 증명 교환과 Firebase 로그인. ES2017. */
(function (w) {
  "use strict";
  if (!w || w.NcqAuth) return;
  var cfg = (w.NCQ || {}).NCQ_AUTH;
  var enabled = !!(cfg && cfg.url && cfg.game && cfg.firebase && /^(test|prod)$/.test(cfg.environment));
  var base = enabled ? String(cfg.url).replace(/\/$/, "") : "";
  var prefix = enabled ? "ncq:invite:" + cfg.game + ":" + cfg.environment + ":" : "";
  var firebase, auth, starting, busy, identityProvider;
  var profileCache, profileAt = 0, profilePending, profileEpoch = 0, profileListeners = [];

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
          if (["AUTH_CODE_INVALID", "INVALID_PARAMS", "UPSTREAM_ERROR", "SERVER_ERROR"].indexOf(out.neptune_code) >= 0) {
            e.neptuneCode = out.neptune_code;
          }
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
      proof && /^neptune_kakaopay_/.test(proof.provider) ? 35000 : proof && proof.provider === "play_games" ? 7500 : 0).then(function (out) {
      if (out.neptune) neptuneSession = out.neptune;
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
      if (cfg.platform === "kakaopay") return Promise.reject(error("identity_required", 401));
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
        if (!platformRefreshed && scope.platform === "web" && ["googleplay", "appstore"].indexOf(cfg.platform) >= 0) {
          var player = user.uid;
          var renewal = busy || track(exchange(null, null, result.token));
          return renewal.then(function (refreshed) {
            return tokenSession(refreshed, false, expectedPlayer || player, true);
          });
        }
        throw error("wrong_scope", 403, "이 게임과 환경에서 다시 사용자 확인을 해 주세요.");
      }
      if (profileCache && (profileCache.player !== user.uid || profileCache.identity !== scope.identity)) {
        profileCache = null; profileAt = 0; profilePending = null; profileEpoch++;
      }
      return {token: result.token, player: user.uid, identity: scope.identity, role: result.claims.role,
        photoUrl: scope.photoUrl || null, nickname: scope.nickname || null, profileVersion: scope.profileVersion || 0};
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
  function currentPlayer(player) {
    if (!auth.currentUser || auth.currentUser.uid !== player) throw error("identity_changed", 409);
  }
  function publishProfile(value) {
    currentPlayer(value.player);
    var changed = !profileCache || profileCache.player !== value.player ||
      profileCache.profileVersion !== value.profileVersion || profileCache.nickname !== value.nickname;
    if (profileCache && profileCache.player === value.player && profileCache.profileVersion > value.profileVersion) return profileCache;
    profileCache = Object.assign({}, value);
    profileAt = Date.now();
    if (changed) profileListeners.slice().forEach(function (fn) { try { fn(Object.assign({}, value)); } catch (e) {} });
    return Object.assign({}, profileCache);
  }
  function profile(options) {
    options = options || {};
    return session().then(function (result) {
      if (profileCache && profileCache.player === result.player && !options.forceRefresh && Date.now() - profileAt < 3000) {
        return Object.assign({}, profileCache);
      }
      if (profilePending && profilePending.player === result.player && !options.forceRefresh) return profilePending.work;
      var epoch = profileEpoch;
      var pending = {player: result.player};
      var work = http("/auth/v1/profile", "GET", undefined, result.token).catch(function (e) {
        if (e.status !== 404) throw e;
        // Older servers remain readable while the shared API is rolled out.
        return {player: result.player, identity: result.identity, photoUrl: result.photoUrl,
          nickname: result.nickname, nicknameOverride: null, defaultNickname: result.nickname,
          profileVersion: 0, profileInitialized: false, profileManaged: false};
      }).then(function (value) {
        currentPlayer(result.player);
        if (value.player !== result.player) throw error("identity_changed", 409);
        if (epoch !== profileEpoch) {
          if (profileCache && profileCache.player === result.player) return Object.assign({}, profileCache);
          throw error("profile_changed", 409);
        }
        if (value.profileManaged !== false) value.profileManaged = true;
        return publishProfile(value);
      });
      pending.work = work.then(function (value) {
        if (profilePending === pending) profilePending = null;
        return value;
      }, function (e) { if (profilePending === pending) profilePending = null; throw e; });
      profilePending = pending;
      return pending.work;
    });
  }
  function updateProfile(changes, options) {
    options = options || {};
    if (!changes || Object.keys(changes).length !== 1 || typeof changes.nickname !== "string" ||
        Array.from(changes.nickname.trim()).length > 20) return Promise.reject(error("invalid_nickname", 400));
    return session(false, options.expectedPlayer).then(function (result) {
      var epoch = ++profileEpoch;
      profilePending = null;
      var input = {nickname: changes.nickname};
      if (options.ifUnset !== undefined) input.ifUnset = options.ifUnset;
      if (options.expectedVersion !== undefined) input.expectedVersion = options.expectedVersion;
      return http("/auth/v1/profile", "POST", input, result.token).then(function (value) {
        currentPlayer(result.player);
        if (value.player !== result.player) throw error("identity_changed", 409);
        if (epoch !== profileEpoch) throw error("profile_changed", 409);
        value.profileManaged = true;
        return publishProfile(value);
      });
    });
  }
  function onProfileChange(fn) {
    if (typeof fn !== "function") throw new TypeError("NcqAuth.onChange requires a function");
    profileListeners.push(fn);
    return function () { profileListeners = profileListeners.filter(function (item) { return item !== fn; }); };
  }
  function displayName(value, guestLabel) {
    var name = value && value.nickname;
    if (typeof name === "string" && name) return name.normalize("NFC");
    if (typeof guestLabel === "string") return guestLabel;
    return value && value.guestCode ? "Guest #" + value.guestCode : "Guest";
  }
  function getToken(options) {
    options = options || {};
    return session(options.forceRefresh, options.expectedPlayer).then(function (result) {
      var profileChanged = profileCache && profileCache.player === result.player && profileCache.profileManaged &&
        profileCache.profileVersion > result.profileVersion;
      if (!profileChanged && (options.role !== "authenticated" || result.role === "authenticated")) return result.token;
      // Upgrade an existing signed session in place. Never create another player for a missing claim.
      var renewal = busy || track(exchange(null, null, result.token, true));
      return renewal.then(function (user) { return tokenSession(user, true, result.player); }).then(function (fresh) {
        if (options.role === "authenticated" && fresh.role !== "authenticated") throw error("auth_unavailable", 503);
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
  var neptuneSession = null;
  function neptuneSignIn(code, environment) {
    if (cfg.platform !== "kakaopay" || (environment !== "sandbox" && environment !== "production")) {
      return Promise.reject(error("wrong_scope", 403));
    }
    return init().then(function () {
      if (busy) throw error("busy", 409);
      neptuneSession = null;
      // 새 플랫폼의 증명을 기존 게스트나 다른 계정에 자동으로 연결하지 않는다.
      return track(exchange({provider: environment === "sandbox" ? "neptune_kakaopay_dev" : "neptune_kakaopay_live",
        token: code}, null, ""));
    }).then(ready).then(function (session) {
      if (!neptuneSession || !neptuneSession.userKey) throw error("identity_unavailable", 503);
      return {player: session.player, identity: session.identity, neptune: Object.assign({}, neptuneSession)};
    });
  }
  w.NcqAuth = Object.freeze({profileContractVersion: 1, ready: ready, profile: profile, updateProfile: updateProfile,
    displayName: displayName, onChange: onProfileChange,
    signIn: signIn, getToken: getToken, request: request,
    neptuneSignIn: neptuneSignIn,
    publicRequest: function (path) { return enabled ? http(path) : Promise.reject(error("disabled")); },
    setIdentityProvider: function (fn) { identityProvider = fn; }
  });
  if (enabled && cfg.platform === "googleplay") ready().catch(function () { /* 초대 기능이 필요할 때 다시 시도해요. */ });
})(typeof window !== "undefined" ? window : null);
