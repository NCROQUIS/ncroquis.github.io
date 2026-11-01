/* 엔크로키 광고 도구 NcqAds — 출시 빌드(ncq_build.py)가 웹 빌드에 넣어요. 출시 서버가 최신으로 바꾸니 직접 고치지 마세요.
 * ncq-ads 1
 *
 * 게임 코드에서 (지면 이름은 코드의 광고 지면 표시 NCQ_ADS_<이름>의 <이름>, 예: REVIVE)
 *   NcqAds.can(지면)                 이 빌드에서 이 지면 광고를 보여 줄 수 있으면 true (보상 버튼을 보일지 정할 때)
 *   await NcqAds.rewarded(지면)       보상형 광고. 끝까지 봤을 때만 true (그때만 보상). 불러오는 동안은 NcqAds가 안내해요
 *   await NcqAds.interstitial(지면)   전면 광고. 닫힐 때까지 기다려요. 못 보여 주면(준비 전, 앱을 연 지 30초 안,
 *                                    앞 광고 뒤 60초 안) 바로 false
 *   NcqAds.banner(지면, {position: "bottom" | "top"}) · NcqAds.hideBanner()
 *   await NcqAds.ready()   광고 준비(동의 확인)가 끝날 때까지. 광고를 쓸 수 있으면 true
 *   NcqAds.privacyRequired() · NcqAds.showPrivacyOptions()   설정 화면의 '개인정보 설정' 버튼이 필요한지 · 열기
 *   NcqAds.bannerSpace()   배너가 가린 높이 {top, bottom} (CSS 변수 --ncq-banner-top·--ncq-banner-bottom, window 이벤트 ncq-banner)
 *   NcqAds.status()        지금 상태 (확인용)
 *
 * 어디서 도는지에 따라
 *   안드로이드 출시 빌드(광고 지면을 켠 빌드): 관리자가 승인한 AdMob 광고 (테스트 기능을 켠 빌드는 구글 테스트 광고)
 *   공유 테스트(웹): 진짜 광고 대신 '광고 자리' 화면 (어디서 어떻게 나오는지 미리 봐요)
 *   광고를 끈 빌드: 아무것도 하지 않아요 (can·rewarded·interstitial 모두 false)
 * 광고 동의(유럽 등)는 앱을 열 때 NcqAds가 구글 동의 화면(UMP)으로 물어요.
 */
(function (w, d) {
  "use strict";
  if (w.NcqAds && w.NcqAds.version) return; // 두 번 들어와도 하나만

  var VERSION = 1;
  var GAP = 60000; // 전면 광고 사이 최소 간격 (보상형 광고를 본 뒤에도)
  var START_GAP = 30000; // 앱을 열고 이 시간 안에는 전면 광고를 띄우지 않아요
  var WAIT = 10000; // 보상형 광고를 불러오며 기다리는 최대 시간
  var RETRY = [30000, 60000, 120000, 300000]; // 불러오기 실패 뒤 다시 시도 간격
  var SAFETY = 300000; // 광고가 닫혔다는 신호가 끝내 안 오면 이 시간 뒤 정리
  var MAX_AGE = 3300000; // 불러 둔 광고는 1시간쯤 지나면 못 써요 (구글 권장). 55분이 지나면 새로 불러요
  var CALL_WAIT = 4000; // 배너 명령이 이 시간 안에 대답이 없으면 (플러그인이 이미 떠 있는 배너를 보면 대답하지 않아요)
  var KINDS = {
    interstitial: {prepare: "prepareInterstitial", show: "showInterstitial",
                   dismissed: "interstitialAdDismissed", failed: "interstitialAdFailedToShow"},
    rewarded: {prepare: "prepareRewardVideoAd", show: "showRewardVideoAd", dismissed: "onRewardedVideoAdDismissed",
               failed: "onRewardedVideoAdFailedToShow", reward: "onRewardedVideoAdReward"},
    rewarded_interstitial: {prepare: "prepareRewardInterstitialAd", show: "showRewardInterstitialAd",
                            dismissed: "onRewardedInterstitialAdDismissed",
                            failed: "onRewardedInterstitialAdFailedToShow", reward: "onRewardedInterstitialAdReward"}
  };
  var KO = /^ko/i.test(String((w.navigator && w.navigator.language) || ""));
  var T = KO ? {
    loading: "광고를 불러오는 중이에요…", cancel: "취소", noAd: "지금은 볼 수 있는 광고가 없어요. 잠시 뒤 다시 해 주세요.",
    interstitial: "전면 광고 자리", rewarded: "보상형 광고 자리", banner: "배너 광고 자리",
    note: "공유 테스트에서는 진짜 광고 대신 이 화면이 나와요.", close: "닫기",
    reward: "끝까지 봤어요 (보상 받기)", skip: "그만 볼래요 (보상 없음)", privacy: "개인정보 설정은 출시 앱에서 열려요."
  } : {
    loading: "Loading ad…", cancel: "Cancel", noAd: "No ad is available right now. Please try again later.",
    interstitial: "Interstitial ad", rewarded: "Rewarded ad", banner: "Banner ad",
    note: "Test builds show this placeholder instead of a real ad.", close: "Close",
    reward: "Watched it all (get reward)", skip: "Stop watching (no reward)",
    privacy: "Privacy settings open in the released app."
  };

  var st = {
    init: null, ready: false, off: false, busy: false, started: Date.now(), last: 0, privacy: false,
    want: null, banner: null, bannerFails: 0, bannerTimer: 0, space: {top: 0, bottom: 0}, warned: {}
  };
  var full = {}; // 광고 단위 ID → {loaded, at(불러온 때), loading, fails, timer}
  var bannerChain = Promise.resolve();
  var seen = null;

  /** 출시 빌드 표시 (ncq-flags.js의 window.NCQ). 처음 쓸 때 읽어요 (표시 파일이 이 파일보다 늦게 돌아도 되게). */
  function env() {
    if (seen) return seen;
    var ncq = w.NCQ || {};
    var cfg = ncq.NCQ_ADMOB && typeof ncq.NCQ_ADMOB === "object" ? ncq.NCQ_ADMOB : null;
    var platform = String(ncq.NCQ_PLATFORM || "");
    var e = {ncq: ncq, cfg: cfg, platform: platform, sim: platform === "web", native: !!cfg && platform === "android"};
    if (w.NCQ) seen = e;
    return e;
  }

  function noop() {}

  function warn(text, err) {
    var why = err ? (err.message || err.errorMessage || err) : "";
    try { w.console.warn("[NcqAds] " + text, why); } catch (e) { /* 콘솔이 없어도 괜찮아요 */ }
  }

  function once(id, text, err) {
    if (st.warned[id]) return;
    st.warned[id] = true;
    warn(text, err);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** 대답이 끝내 없는 플러그인 명령에 묶이지 않게 시간 제한 */
  function timed(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var e = new Error("대답이 없어요");
        e.timeout = true;
        reject(e);
      }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  /** 지면 이름 정리 (revive → REVIVE, 앞에 붙은 ncq_ads_는 뗀다) */
  function slotKey(slot) {
    var k = String(slot == null ? "" : slot).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return k.indexOf("NCQ_ADS_") === 0 ? k.slice(8) : k;
  }

  function flagOn(k) { return env().ncq["NCQ_ADS_" + k] === true; }

  function units() { return (env().cfg && env().cfg.units) || {}; }

  function unit(k) { return typeof units()[k] === "string" ? units()[k] : ""; }

  function formatOf(k) {
    var formats = (env().cfg && env().cfg.formats) || {};
    return String(formats[k] || "").toLowerCase();
  }

  function plugin() {
    var cap = w.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.AdMob) || null;
  }

  function call(name, options) {
    var p = plugin();
    if (!p || typeof p[name] !== "function") return Promise.reject(new Error("AdMob." + name + "을 찾지 못했어요"));
    try {
      return Promise.resolve(p[name](options || {}));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function listen(name, fn) {
    var p = plugin();
    if (!p || typeof p.addListener !== "function") return noop;
    try {
      var handle = p.addListener(name, fn);
      return function () {
        Promise.resolve(handle).then(function (h) { if (h && h.remove) return h.remove(); }).catch(noop);
      };
    } catch (e) {
      return noop;
    }
  }

  function retryDelay(fails) { return RETRY[Math.min(Math.max(fails, 1), RETRY.length) - 1]; }

  /** 부른 함수(banner·interstitial·rewarded)가 이 지면의 광고 단위 형식과 맞는지 */
  function fits(k, method) {
    var f = formatOf(k);
    var ok = method === "rewarded" ? f === "rewarded" || f === "rewarded_interstitial" : f === method;
    if (!ok && f) once("format-" + k, "이 지면의 광고 단위는 " + f + " 형식이라 " + method + "로 보여 줄 수 없어요 (" + k + ")");
    return ok || (!f && method === "banner");
  }

  // ------------------------------------------------------------ 준비 (안드로이드)
  function init() {
    if (st.init) return st.init;
    st.init = (async function () {
      if (!env().native) return false;
      if (!plugin()) {
        st.off = true;
        warn("AdMob 플러그인이 없어서 광고를 보여 줄 수 없어요");
        return false;
      }
      var info = null;
      try {
        info = await call("requestConsentInfo", {});
      } catch (e) {
        warn("광고 동의 정보를 받지 못했어요 (광고는 그대로 시도해요)", e);
      }
      if (info && info.status === "REQUIRED" && info.isConsentFormAvailable) {
        try {
          info = await call("showConsentForm", {});
        } catch (e) {
          warn("광고 동의 화면을 열지 못했어요", e);
          info = {canRequestAds: false};
        }
      }
      if (info) {
        st.privacy = info.privacyOptionsRequirementStatus === "REQUIRED";
        if (info.canRequestAds === false) {
          st.off = true;
          warn("광고 동의를 받지 못해서 이번에는 광고를 쉬어요");
          return false;
        }
      }
      await call("initialize", {});
      // 새로 고침·다른 페이지로 오기 전에 띄운 배너가 남아 있으면 지운다 (남아 있으면 새 배너 명령이 대답하지 않아요)
      await timed(call("removeBanner", {}), CALL_WAIT).catch(noop);
      await sleep(300);
      st.ready = true;
      watchBanner();
      Object.keys(units()).forEach(function (k) {
        if (flagOn(k) && KINDS[formatOf(k)]) load(k);
      });
      if (st.want) applyBanner();
      return true;
    })().catch(function (e) {
      st.off = true;
      warn("광고를 준비하지 못했어요", e);
      return false;
    });
    return st.init;
  }

  /** 전면·보상형 광고를 미리 불러온다. 불러왔으면 true. 실패하면 조금 뒤 다시 시도한다.
   * 다시 시도를 기다리는 중이면 건너뛴다 (force: 사용자가 보상형 광고를 직접 눌렀을 때는 바로). */
  function load(k, force) {
    var id = unit(k);
    var kind = KINDS[formatOf(k)];
    if (!id || !kind || !st.ready) return Promise.resolve(false);
    var a = full[id] || (full[id] = {loaded: false, loading: null, fails: 0, timer: 0});
    if (a.loaded) return Promise.resolve(true);
    if (a.loading) return a.loading;
    if (a.timer && !force) return Promise.resolve(false);
    clearTimeout(a.timer);
    a.timer = 0;
    a.loading = call(kind.prepare, {adId: id}).then(function () {
      a.loaded = true;
      a.at = Date.now();
      a.fails = 0;
      return true;
    }, function (e) {
      a.fails += 1;
      warn("광고를 불러오지 못했어요 (" + k + ")", e);
      a.timer = setTimeout(function () { a.timer = 0; load(k); }, retryDelay(a.fails));
      return false;
    }).then(function (ok) {
      a.loading = null;
      return ok;
    });
    return a.loading;
  }

  /** 불러 둔 광고가 있고 아직 쓸 수 있는지 (오래됐으면 버리고 false) */
  function fresh(id) {
    var a = full[id];
    if (!a || !a.loaded) return false;
    if (Date.now() - a.at < MAX_AGE) return true;
    a.loaded = false;
    return false;
  }

  /** 불러 둔 전면·보상형 광고를 보여 주고 닫힐 때까지 기다린다. 보상형은 보상을 받았으면 true. */
  function showFull(k) {
    var id = unit(k);
    var fmt = formatOf(k);
    var kind = KINDS[fmt];
    var a = full[id];
    st.busy = true;
    return new Promise(function (resolve) {
      var stops = [];
      var done = false;
      var earned = false;
      var safety = 0;
      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(safety);
        stops.forEach(function (stop) { stop(); });
        if (a) a.loaded = false;
        st.busy = false;
        st.last = Date.now();
        setTimeout(function () { load(k); }, 1000); // 다음 광고를 미리
        resolve(result);
      }
      stops.push(listen(kind.dismissed, function () {
        if (kind.reward) setTimeout(function () { finish(earned); }, 400); // 보상 신호가 닫힘보다 늦게 와도 받게
        else finish(true);
      }));
      stops.push(listen(kind.failed, function (e) {
        warn("광고를 보여 주지 못했어요 (" + k + ")", e);
        finish(false);
      }));
      if (kind.reward) stops.push(listen(kind.reward, function () { earned = true; }));
      safety = setTimeout(function () { finish(kind.reward ? earned : true); }, SAFETY);
      call(kind.show, {adId: id}).then(function () {
        if (kind.reward) earned = true; // 보상형은 보상을 받았을 때 끝나요
      }, function (e) {
        warn("광고를 보여 주지 못했어요 (" + k + ")", e);
        finish(false);
      });
    });
  }

  // ------------------------------------------------------------ 게임이 부르는 것
  function can(slot) {
    var k = slotKey(slot);
    if (!k) return false;
    if (env().sim) return true;
    return env().native && !st.off && flagOn(k) && !!unit(k) && !!plugin();
  }

  function tooSoon() {
    var now = Date.now();
    return now - st.started < START_GAP || (st.last && now - st.last < GAP);
  }

  function interstitial(slot) {
    var k = slotKey(slot);
    if (!can(k) || st.busy || tooSoon()) return Promise.resolve(false);
    if (env().sim) return simulate(k, "interstitial");
    if (!fits(k, "interstitial")) return Promise.resolve(false);
    if (!st.ready || !fresh(unit(k))) { // 기다리게 하지 않아요 (다음을 위해 불러 둬요)
      if (st.ready) load(k);
      else init();
      return Promise.resolve(false);
    }
    return showFull(k);
  }

  function rewarded(slot) {
    var k = slotKey(slot);
    if (!can(k) || st.busy) return Promise.resolve(false);
    if (env().sim) return simulate(k, "rewarded");
    if (!fits(k, "rewarded")) return Promise.resolve(false);
    st.busy = true; // 기다리는 동안 두 번 누르기·다른 광고를 막아요
    var id = unit(k);
    var box = null;
    var timer = 0;
    var canceled = false;
    return new Promise(function (resolve) {
      if (st.ready && fresh(id)) return resolve(true);
      box = waiting(function () { canceled = true; resolve(false); });
      timer = setTimeout(function () { resolve(false); }, WAIT);
      init().then(function (ok) { return ok ? load(k, true) : false; }).then(resolve, function () { resolve(false); });
    }).then(function (ready) {
      clearTimeout(timer);
      if (box) box.remove();
      if (canceled || !ready || !fresh(id)) {
        st.busy = false;
        if (!canceled) toast(T.noAd);
        return false;
      }
      return showFull(k);
    }).catch(function (e) {
      st.busy = false;
      warn("보상형 광고 오류 (" + k + ")", e);
      return false;
    });
  }

  function banner(slot, options) {
    var k = slotKey(slot);
    var pos = options && String(options.position || "").toLowerCase() === "top" ? "top" : "bottom";
    if (!can(k) || (!env().sim && !fits(k, "banner"))) return Promise.resolve(false);
    st.want = {k: k, pos: pos};
    if (env().sim) {
      simBanner(k, pos);
      return Promise.resolve(true);
    }
    return init().then(function (ok) { return ok ? applyBanner() : false; });
  }

  function hideBanner() {
    st.want = null;
    if (env().sim) {
      simBanner(null);
      return Promise.resolve();
    }
    return st.ready ? applyBanner().then(noop) : Promise.resolve();
  }

  /** st.want(보이고 싶은 배너)에 맞춘다. 한 번에 하나씩 차례로. 플러그인 명령은 모두 시간 제한을 둔다. */
  function applyBanner() {
    var run = bannerChain.then(async function () {
      if (!st.ready) return false;
      var want = st.want;
      var cur = st.banner;
      if (!want) {
        if (cur && !cur.hidden) {
          cur.hidden = true;
          setSpace(0, 0);
          await timed(call("hideBanner", {}), CALL_WAIT).catch(noop);
        }
        return false;
      }
      var id = unit(want.k);
      if (!id) return false;
      if (cur && cur.id === id && cur.pos === want.pos) {
        if (cur.hidden) {
          cur.hidden = false;
          try {
            await timed(call("resumeBanner", {}), CALL_WAIT);
          } catch (e) {
            st.banner = null;
            throw e;
          }
        }
        return true;
      }
      if (cur) { // 다른 지면·자리: 지우고 새로 (지우기가 끝나기 전에 만들면 옛 배너를 다시 불러와요)
        st.banner = null;
        setSpace(0, 0);
        await timed(call("removeBanner", {}), CALL_WAIT).catch(noop);
        await sleep(400);
      }
      var options = {adId: id, adSize: "ADAPTIVE_BANNER", position: want.pos === "top" ? "TOP_CENTER" : "BOTTOM_CENTER",
                     margin: 0};
      st.banner = {k: want.k, id: id, pos: want.pos, hidden: false};
      try {
        await timed(call("showBanner", options), CALL_WAIT);
      } catch (e) {
        if (!e || !e.timeout) {
          st.banner = null;
          throw e;
        }
        // 대답이 없으면 이미 떠 있던 배너 때문이에요: 지우고 한 번 더
        await timed(call("removeBanner", {}), CALL_WAIT).catch(noop);
        await sleep(600);
        try {
          await timed(call("showBanner", options), CALL_WAIT);
        } catch (e2) {
          st.banner = null;
          throw e2;
        }
      }
      return true;
    }).catch(function (e) {
      warn("배너를 보여 주지 못했어요", e);
      return false;
    });
    bannerChain = run.then(noop, noop);
    return run;
  }

  function watchBanner() {
    listen("bannerAdSizeChanged", function (info) {
      var b = st.banner;
      if (!st.want || !b || b.hidden) return setSpace(0, 0); // 숨긴 뒤에 늦게 끝난 첫 불러오기도 자리를 차지하지 않게
      var h = Math.max(0, Math.round(Number(info && info.height) || 0));
      setSpace(b.pos === "top" ? h : 0, b.pos === "top" ? 0 : h);
    });
    listen("bannerAdLoaded", function () { st.bannerFails = 0; });
    listen("bannerAdFailedToLoad", function (e) { // 플러그인이 배너를 지웠어요. 조금 뒤 다시
      warn("배너 광고를 불러오지 못했어요", e);
      st.banner = null;
      setSpace(0, 0);
      st.bannerFails += 1;
      clearTimeout(st.bannerTimer);
      st.bannerTimer = setTimeout(function () { if (st.want) applyBanner(); }, retryDelay(st.bannerFails));
    });
  }

  function writeSpace(top, bottom) {
    var root = d.documentElement;
    if (root && root.style) {
      root.style.setProperty("--ncq-banner-top", top + "px");
      root.style.setProperty("--ncq-banner-bottom", bottom + "px");
    }
  }

  function setSpace(top, bottom) {
    if (st.space.top === top && st.space.bottom === bottom) return;
    st.space = {top: top, bottom: bottom};
    writeSpace(top, bottom);
    try {
      w.dispatchEvent(new CustomEvent("ncq-banner", {detail: {top: top, bottom: bottom}}));
    } catch (e) { /* 이벤트를 못 보내도 CSS 변수는 들어가요 */ }
  }

  function bannerSpace() { return {top: st.space.top, bottom: st.space.bottom}; }

  function privacyRequired() { return !!st.privacy; }

  /** 광고 준비(동의 확인·초기화)가 끝날 때까지. 광고를 쓸 수 있으면 true (공유 테스트는 바로 true). */
  function ready() {
    if (env().sim) return Promise.resolve(true);
    if (!env().native) return Promise.resolve(false);
    return init();
  }

  function showPrivacyOptions() {
    if (env().sim) {
      toast(T.privacy);
      return Promise.resolve(false);
    }
    if (!env().native || !plugin()) return Promise.resolve(false);
    return init().then(function () { return call("showPrivacyOptionsForm", {}); }).then(function () {
      return true;
    }, function (e) {
      warn("개인정보 설정을 열지 못했어요", e);
      return false;
    });
  }

  function status() {
    var slots = {};
    var e = env();
    Object.keys(units()).forEach(function (k) {
      var a = full[unit(k)];
      slots[k] = {on: flagOn(k), format: formatOf(k) || null, loaded: !!(a && a.loaded)};
    });
    return {
      version: VERSION, platform: e.platform, mode: e.sim ? "simulate" : e.native ? "admob" : "off", plugin: !!plugin(),
      ready: st.ready, off: st.off, test: !!(e.cfg && e.cfg.test), busy: st.busy, privacyRequired: st.privacy,
      banner: st.banner ? {slot: st.banner.k, position: st.banner.pos, hidden: st.banner.hidden} : null,
      space: bannerSpace(), slots: slots
    };
  }

  // ------------------------------------------------------------ 화면 (공유 테스트의 광고 자리, 불러오는 중, 알림)
  var FONT = "font:15px/1.5 system-ui,-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif;";
  var Z = 2147483000;

  function el(tag, css, text) {
    var e = d.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function mount(node) {
    (d.body || d.documentElement).appendChild(node);
    return node;
  }

  /** 화면 전체를 덮는 판. 누른 것이 게임으로 새지 않게 막는다. */
  function layer() {
    var o = el("div", "position:fixed;top:0;right:0;bottom:0;left:0;z-index:" + (Z + 10) + ";display:flex;" +
      "align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:rgba(8,10,14,.82);" +
      "color:#fff;touch-action:none;-webkit-user-select:none;user-select:none;" + FONT);
    ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click", "wheel", "contextmenu",
      "keydown", "keyup"]
      .forEach(function (type) { o.addEventListener(type, function (e) { e.stopPropagation(); }); });
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    return o;
  }

  function card() {
    return el("div", "width:100%;max-width:320px;box-sizing:border-box;padding:22px 20px;border-radius:14px;" +
      "background:#1d232b;border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 40px rgba(0,0,0,.45);text-align:center;" +
      "word-break:keep-all;overflow-wrap:anywhere");
  }

  function button(text, primary, onClick) {
    var b = el("button", "display:block;width:100%;min-height:46px;margin-top:10px;padding:10px 14px;border-radius:10px;" +
      "cursor:pointer;" + FONT + "font-weight:600;" + (primary ? "border:0;background:#3b7cf6;color:#fff;" :
      "border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;"), text);
    b.type = "button";
    b.addEventListener("click", function (e) {
      e.preventDefault();
      onClick();
    });
    return b;
  }

  function simulate(k, kind) {
    st.busy = true;
    return new Promise(function (resolve) {
      var o = layer();
      var c = card();
      c.appendChild(el("div", "font-size:12px;letter-spacing:.08em;opacity:.65", "AD · " + k));
      c.appendChild(el("div", "margin-top:6px;font-size:19px;font-weight:700", T[kind]));
      c.appendChild(el("div", "margin:8px 0 6px;font-size:13px;opacity:.75", T.note));
      function end(result) {
        o.remove();
        resolve(result);
      }
      if (kind === "rewarded") {
        c.appendChild(button(T.reward, true, function () { end(true); }));
        c.appendChild(button(T.skip, false, function () { end(false); }));
      } else {
        c.appendChild(button(T.close, true, function () { end(true); }));
      }
      o.appendChild(c);
      mount(o);
    }).then(function (result) {
      st.busy = false;
      st.last = Date.now();
      return result;
    });
  }

  var simBar = null;

  function simBanner(k, pos) {
    if (simBar) {
      simBar.remove();
      simBar = null;
    }
    if (!k) {
      setSpace(0, 0);
      return;
    }
    var h = 50;
    simBar = el("div", "position:fixed;left:0;right:0;" + (pos === "top" ? "top:0;" : "bottom:0;") + "height:" + h +
      "px;z-index:" + Z + ";display:flex;align-items:center;justify-content:center;box-sizing:border-box;" +
      "background:repeating-linear-gradient(135deg,#eef1f4 0 12px,#e2e7ec 12px 24px);color:#4a5561;" +
      "border-" + (pos === "top" ? "bottom" : "top") + ":1px dashed #9aa6b2;" + FONT + "font-size:13px", T.banner + " · " + k);
    mount(simBar);
    setSpace(pos === "top" ? h : 0, pos === "top" ? 0 : h);
  }

  function waiting(onCancel) {
    var o = layer();
    var c = card();
    c.appendChild(el("div", "font-size:16px;font-weight:600", T.loading));
    c.appendChild(button(T.cancel, false, onCancel));
    o.appendChild(c);
    return mount(o);
  }

  function toast(text) {
    var gap = st.space.bottom + 24;
    var t = el("div", "position:fixed;left:50%;bottom:" + gap + "px;bottom:calc(" + gap +
      "px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:" + (Z + 20) + ";max-width:90vw;" +
      "max-width:min(90vw,360px);box-sizing:border-box;" +
      "padding:10px 16px;border-radius:999px;background:rgba(20,24,30,.92);color:#fff;text-align:center;" +
      "pointer-events:none;word-break:keep-all;" + FONT + "font-size:14px", text);
    mount(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ------------------------------------------------------------ 시작
  writeSpace(0, 0); // var(--ncq-banner-bottom)을 처음부터 쓸 수 있게
  var api = {
    version: VERSION, can: can, rewarded: rewarded, interstitial: interstitial, banner: banner, hideBanner: hideBanner,
    ready: ready, privacyRequired: privacyRequired, showPrivacyOptions: showPrivacyOptions, bannerSpace: bannerSpace,
    status: status
  };
  try { Object.freeze(api); } catch (e) { /* 얼리지 못해도 괜찮아요 */ }
  w.NcqAds = api;
  function boot() { // 앱을 열 때 동의를 묻고 광고를 미리 불러 둬요
    if (env().native) init();
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);
})(window, document);
