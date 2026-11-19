/* 엔크로키 결제 도구 NcqIap — 출시 빌드(ncq_build.py)가 웹 빌드에 넣어요. 출시 서버가 최신으로 바꾸니 직접 고치지 마세요.
 * ncq-iap 1
 *
 * 게임 코드에서 (상품 이름은 코드의 인앱 상품 표시 NCQ_IAP_<이름>의 <이름>, 예: COIN_500. 스토어 상품 ID는 소문자 coin_500)
 *   NcqIap.onGrant(function (상품, 정보) { ...지급...; return true; })
 *                       상품 지급은 여기 한 곳에서 해요. 새 구매도, 앱이 꺼져서 끝나지 않은 구매도, 다시 설치한 뒤 되찾은
 *                       비소모성 상품(정보.restored)도 여기로 와요. 앱을 열 때 바로 등록해요. 지급하지 못했으면 false를 돌려줘요
 *                       (그러면 구매를 마무리하지 않고 다음에 다시 와요). 비소모성 상품은 몇 번 와도 같게(켜기만) 지급해요.
 *                       정보.quantity는 산 개수예요 (보통 1, 구글플레이에서 여러 개 사기를 켰을 때만 더 커요).
 *                       정보.grantId는 이 구매만의 지급 번호예요: 공용 저장 모듈로 NcqSave.grant(정보.grantId, {coins: 500})처럼
 *                       넣으면 두 번 넣지 않고 바로 클라우드에 백업해요 (지급한 뒤 NcqSave.backup()도 불러요)
 *   NcqIap.can(상품)            이 빌드에서 이 상품을 팔 수 있으면 true (구매 버튼을 보일지). 상품 정보를 받기 전에는 false
 *   await NcqIap.ready()        상품 정보(가격)를 받을 때까지 기다려요. 결제를 쓸 수 있으면 true (window 이벤트 ncq-iap도 와요)
 *   NcqIap.price(상품)          스토어 가격 글 (예: "₩1,200"). 모르면 "". 가격은 코드에 적지 않아요 (스토어 정책)
 *   await NcqIap.buy(상품)       소모성 상품(코인처럼 여러 번 사는 것) 구매 → {ok, id, code, message}
 *   await NcqIap.buyOnce(상품)   비소모성 상품(광고 제거처럼 한 번 사는 것) 구매. 이미 샀으면 다시 지급하고 ok
 *   await NcqIap.owned(상품)     비소모성 상품을 산 적이 있는지 (다시 설치하거나 기기를 바꿔도)
 *   await NcqIap.restore()      산 비소모성 상품을 다시 지급해요 ('구매 복원' 버튼) → {ok, restored: [상품]}
 *   NcqIap.status()             지금 상태 (확인용)
 * 실패하면 NcqIap이 짧은 안내를 띄우고 {ok: false, code, message}를 돌려줘요 (사용자가 취소하면 안내 없이 code만).
 *
 * 어디서 도는지에 따라
 *   안드로이드 출시 빌드(인앱 상품을 켠 빌드): 구글플레이 결제 (@capgo/native-purchases, window.Capacitor.Plugins.NativePurchases).
 *                        구매는 지급한 뒤에 마무리해요 (소모성은 consume, 비소모성은 acknowledge. 3일 안에 마무리하지 않으면
 *                        구글이 환불해요). 플러그인의 자동 마무리는 꺼요. 플러그인은 명령마다 결제 연결을 새로 열고 닫아서
 *                        명령을 한 번에 하나씩만 보내요 (결제 중에는 owned도 이 기기의 지급 기록으로 답해요).
 *                        앱을 열 때와 돌아올 때 끝나지 않은 구매를 찾아 지급해요
 *   토스(앱인토스) 빌드: 토스 인앱 결제 (빌드가 넣는 ncq-toss.js의 웹 프레임워크 IAP). 지급은 결제 직후 30초 안에 해야 해서
 *                        onGrant를 바로 불러요. 앱을 열 때 결제됐지만 지급이 안 끝난 주문(getPendingOrders)을 지급해요.
 *                        토스는 테스트 결제가 따로 없어서 QR로 연 테스트 번들에서도 실제로 결제돼요 (테스트 빌드는 한 번 더 물어요)
 *   공유 테스트(웹): 진짜 결제 대신 '결제 자리' 화면 (돈은 나가지 않아요)
 *   인앱 상품을 끈 빌드: 아무것도 하지 않아요 (can은 false, buy는 바로 실패)
 * 게임 코드가 NcqIap을 부르기 전에는 결제 플러그인을 건드리지 않아요 (프로젝트가 직접 결제 코드를 써도 괜찮게).
 * 지표 모듈(NcqMetrics)이 있으면 결제 기록을 보내요 (게임 코드는 할 일이 없어요): purchase_start(결제 시작)·purchase(지급한
 * 새 구매: 스토어 가격 amount·통화 currency·개수 qty)·purchase_cancel(취소)·purchase_fail(실패 code)·purchase_restore(되찾음).
 * 가격은 스토어가 보여 준 값이라 매출은 추정이에요. 오류가 나도 결제는 그대로예요.
 */
(function (w, d) {
  "use strict";
  if (w.NcqIap && w.NcqIap.version) return; // 두 번 들어와도 하나만

  var VERSION = 4;
  var LEDGER = "ncq-iap-v1"; // 지급한 구매 (같은 구매를 두 번 지급하지 않게)
  var SIM = "ncq-iap-sim-v1"; // 공유 테스트에서 '산 것으로 한' 비소모성 상품
  var KEEP = 120 * 86400000; // 지급 기록을 남겨 두는 기간
  var KEEP_MAX = 300;
  var CALL_WAIT = 20000; // 플러그인 명령이 이 시간 안에 대답하지 않으면 실패로 봐요
  var ORDER_WAIT = 600000; // 결제 화면이 끝내 대답이 없으면 이 시간 뒤 정리 (게임이 '결제 중'에 묶이지 않게)
  var RESUME_GAP = 60000; // 앱으로 돌아왔을 때 끝나지 않은 구매를 다시 보는 최소 간격
  var RETRY_GAP = 20000; // 결제 준비·상품 정보를 못 받았을 때 다시 해 보는 최소 간격 (ready()와 결제는 바로 다시)
  var CHECK_AGAIN = 5000; // 다른 구매로 끝난 결제는 이 시간 뒤 한 번 더 찾아봐요
  var GRANT_WAIT = 30000; // 지급 함수가 이보다 오래 걸리면 다른 스토어 명령은 다시 줄을 세워요 (지급 결과는 계속 기다려요)
  var HISTORY_GAP = 60000; // 토스 주문 기록을 다시 받는 최소 간격
  var HISTORY_PAGES = 50; // 토스 주문 기록은 50건씩 이만큼까지 (넘으면 못 읽은 것으로 봐요)
  var CODES = ["USER_CANCELED", "ITEM_ALREADY_OWNED", "ITEM_NOT_OWNED", "ITEM_UNAVAILABLE", "BILLING_UNAVAILABLE",
    "SERVICE_DISCONNECTED", "SERVICE_UNAVAILABLE", "DEVELOPER_ERROR", "FEATURE_NOT_SUPPORTED", "NETWORK_ERROR",
    "PAYMENT_PENDING", "INVALID_PRODUCT_ID", "INVALID_USER_ENVIRONMENT", "APP_MARKET_VERIFICATION_FAILED",
    "TOSS_SERVER_VERIFICATION_FAILED", "INTERNAL_ERROR", "KOREAN_ACCOUNT_ONLY", "PRODUCT_NOT_GRANTED_BY_PARTNER",
    "UNSUPPORTED_APP_VERSION", "BILLING_SETUP_TIMEOUT", "BILLING_SETUP_FAILED", "QUERY_PURCHASES_FAILED"];
  var KO = /^ko/i.test(String((w.navigator && w.navigator.language) || "")) ||
    String((w.NCQ || {}).NCQ_PLATFORM || "") === "toss";
  var T = KO ? {
    unavailable: "지금은 살 수 없는 상품이에요.", pending: "결제 승인을 기다리고 있어요. 승인되면 앱을 열 때 지급돼요.",
    network: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", failed: "결제에 실패했어요. 잠시 후 다시 시도해 주세요.",
    noBilling: "이 기기나 계정에서는 결제할 수 없어요.", korean: "한국 앱스토어 계정에서만 구매할 수 있어요.",
    update: "토스 앱을 최신 버전으로 업데이트하면 구매할 수 있어요.",
    verify: "결제 확인에 실패했어요. 앱스토어에 환불을 요청해 주세요.",
    late: "결제는 완료됐지만 확인이 늦어지고 있어요. 잠시 후 앱을 다시 열어 주세요.",
    slow: "결제 확인이 늦어지고 있어요. 결제됐다면 앱을 다시 열 때 지급돼요.",
    checking: "결제를 확인하고 있어요. 결제됐다면 곧 지급돼요.",
    notGranted: "상품을 지급하지 못했어요. 앱을 다시 열면 다시 지급해요.",
    owned: "끝나지 않은 지난 구매를 마무리했어요. 한 번 더 사려면 다시 눌러 주세요.",
    sim: "결제 자리", simNote: "공유 테스트에서는 진짜 결제 대신 이 화면이 나와요. 돈은 나가지 않아요.",
    simBuy: "산 것으로 하기", cancel: "취소", consumable: "소모성 상품", nonConsumable: "비소모성 상품 (한 번 사면 계속)",
    testPrice: "테스트 가격", tossTest: "토스 테스트 빌드예요", tossTestNote: "토스 결제는 테스트 번들에서도 실제로 결제돼요. " +
      "그래도 결제할까요?", tossTestGo: "실제로 결제하기"
  } : {
    unavailable: "This item isn't available right now.", pending: "Your payment is pending. You'll get it once it's approved.",
    network: "Please check your connection and try again.", failed: "The purchase failed. Please try again later.",
    noBilling: "Purchases aren't available on this device or account.", korean: "Only Korean store accounts can buy this.",
    update: "Update the Toss app to buy this.", verify: "We couldn't verify the payment. Please ask the store for a refund.",
    late: "Your payment went through but is taking a while to confirm. Please reopen the app soon.",
    slow: "The payment is taking a while. If it went through, you'll get it when you reopen the app.",
    checking: "We're checking your payment. If it went through, you'll get it shortly.",
    notGranted: "We couldn't deliver the item. Reopen the app to try again.",
    owned: "We finished your earlier purchase. Tap again to buy another.",
    sim: "Purchase placeholder", simNote: "Test builds show this instead of a real payment. No money is charged.",
    simBuy: "Mark as bought", cancel: "Cancel", consumable: "Consumable item", nonConsumable: "One-time item (keeps forever)",
    testPrice: "Test price", tossTest: "This is a Toss test build", tossTestNote: "Toss charges real money even in test " +
      "bundles. Buy anyway?", tossTestGo: "Pay for real"
  };
  var MESSAGES = {
    USER_CANCELED: "", BUSY: "", PENDING: T.pending, NETWORK_ERROR: T.network, SERVICE_UNAVAILABLE: T.network,
    SERVICE_DISCONNECTED: T.network, TIMEOUT: T.network, BILLING_SETUP_TIMEOUT: T.network, QUERY_PURCHASES_FAILED: T.network,
    SLOW: T.slow, CHECKING: T.checking, ITEM_UNAVAILABLE: T.unavailable, INVALID_PRODUCT_ID: T.unavailable,
    UNAVAILABLE: T.unavailable, BILLING_UNAVAILABLE: T.noBilling, FEATURE_NOT_SUPPORTED: T.noBilling,
    INVALID_USER_ENVIRONMENT: T.noBilling, KOREAN_ACCOUNT_ONLY: T.korean, UNSUPPORTED_APP_VERSION: T.update,
    APP_MARKET_VERIFICATION_FAILED: T.verify, TOSS_SERVER_VERIFICATION_FAILED: T.late,
    PRODUCT_NOT_GRANTED_BY_PARTNER: T.notGranted, NOT_GRANTED: T.notGranted, ITEM_ALREADY_OWNED: T.owned
  };

  var st = {
    conn: null, connAt: 0, load: null, loadAt: 0, loaded: false, off: false, busy: false, handler: null, recovered: 0,
    running: 0, granting: 0, history: null, historyAt: 0, warned: {}, learned: {}
  };
  var shelf = {}; // 상품 이름 → {sku(스토어 ID), price, title, offer} (스토어에서 받은 것만, 팔 수 있는 상품)
  var chain = Promise.resolve(); // 스토어 명령(구매·복구·조회)은 한 번에 하나씩
  var inflight = {}; // 지급 중인 구매 (같은 구매를 동시에 두 번 지급하지 않게)
  var memLedger = null; // localStorage를 못 쓰는 곳에서는 메모리에만 (앱을 닫으면 없어져요)
  var seen = null;

  /** 출시 빌드 표시 (ncq-flags.js의 window.NCQ). cfg는 결제 설정 NCQ_STORE {products: {상품: {id, type}}, test}. */
  function env() {
    if (seen) return seen;
    var ncq = w.NCQ || {};
    var platform = String(ncq.NCQ_PLATFORM || "");
    var cfg = ncq.NCQ_STORE && typeof ncq.NCQ_STORE === "object" ? ncq.NCQ_STORE : null;
    var e = {ncq: ncq, cfg: cfg, platform: platform, sim: platform === "web", android: platform === "android" && !!cfg,
             ios: platform === "ios" && !!cfg, toss: platform === "toss" && !!cfg};
    if (w.NCQ) seen = e;
    return e;
  }

  function noop() {}

  function warn(text, err) {
    var why = err ? (err.message || err.errorMessage || err.code || err) : "";
    try { w.console.warn("[NcqIap] " + text, why); } catch (e) { /* 콘솔이 없어도 괜찮아요 */ }
  }

  function once(id, text, err) {
    if (st.warned[id]) return;
    st.warned[id] = true;
    warn(text, err);
  }

  /** 대답이 끝내 없는 플러그인 명령에 묶이지 않게 시간 제한 */
  function timed(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var e = new Error("대답이 없어요");
        e.code = "TIMEOUT";
        reject(e);
      }, ms);
      Promise.resolve(promise).then(function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); });
    });
  }

  /** 스토어 명령은 한 번에 하나씩 (플러그인이 명령마다 결제 연결을 새로 열면서 앞 연결을 닫아요).
   * 지급 함수(onGrant) 안에서 부르면 바로 해요: 앞 명령은 지급을 기다리는 중이라 겹치지 않고, 기다리면 서로 기다리게 돼요. */
  function serial(task) {
    if (st.granting > 0) return Promise.resolve().then(task);
    function run() {
      st.running += 1;
      var out;
      try {
        out = Promise.resolve(task());
      } catch (e) {
        out = Promise.reject(e);
      }
      return out.then(function (v) {
        st.running -= 1;
        return v;
      }, function (e) {
        st.running -= 1;
        throw e;
      });
    }
    var p = chain.then(run, run);
    chain = p.then(noop, noop);
    return p;
  }

  /** 알아서 하는 복구(앱으로 돌아옴·다시 찾기)를 지금 해도 되는지: 결제·다른 명령·지급 중이면 다음 기회에 */
  function idle() { return !st.busy && !st.running && !st.granting; }

  function each(list, fn) {
    return (list || []).reduce(function (p, item) {
      return p.then(function () { return fn(item); }).then(noop, function (e) { warn("구매 하나를 처리하지 못했어요", e); });
    }, Promise.resolve());
  }

  function uniq(list) {
    var out = [];
    (list || []).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  /** 상품 이름 정리 (coin_500 → COIN_500, 앞에 붙은 ncq_iap_는 뗀다) */
  function keyOf(id) {
    var k = String(id == null ? "" : id).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return k.indexOf("NCQ_IAP_") === 0 ? k.slice(8) : k;
  }

  function products() { return (env().cfg && env().cfg.products) || {}; }

  function conf(k) {
    var p = products()[k];
    return p && typeof p === "object" ? p : null;
  }

  /** 이 빌드에서 켠 상품 (출시 서버가 고른 것) */
  function isOn(k) { return !!conf(k) || env().ncq["NCQ_IAP_" + k] === true; }

  /** 스토어 상품 ID (구글플레이 상품 ID, 토스 SKU). 설정에 없으면 소문자 이름 */
  function storeId(k) {
    var c = conf(k);
    return (c && typeof c.id === "string" && c.id) || k.toLowerCase();
  }

  /** 상품 종류: consumable(소모성) · non_consumable(비소모성) · "" (모름: 코드에서 buy·buyOnce로 부르지 않음) */
  function typeOf(k) {
    var c = conf(k);
    var t = (c && c.type) || st.learned[k] || "";
    return t === "consumable" || t === "non_consumable" ? t : "";
  }

  /** 스토어 상품 ID → 상품 이름 (켠 상품의 설정·받은 상품 정보에서, 대소문자만 달라도. 없으면 ID를 정리해서) */
  function keyOfStore(id) {
    var text = String(id || "");
    if (!text) return "";
    var low = text.toLowerCase();
    var all = products();
    var hit = "";
    Object.keys(shelf).forEach(function (k) { if (!hit && shelf[k].sku === text) hit = k; });
    Object.keys(all).forEach(function (k) { if (!hit && storeId(k) === text) hit = k; });
    Object.keys(all).forEach(function (k) { if (!hit && storeId(k).toLowerCase() === low) hit = k; });
    return hit || keyOf(text);
  }

  function sameSku(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

  function qty(t) {
    var n = Math.floor(Number(t && t.quantity));
    return n > 0 ? n : 1;
  }

  function plugin() {
    var cap = w.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.NativePurchases) || null;
  }

  function tossIap() {
    var t = w.NcqToss;
    return (t && t.IAP) || null;
  }

  function supported(fn) {
    try {
      return typeof fn === "function" && (typeof fn.isSupported !== "function" || fn.isSupported() !== false);
    } catch (e) {
      return false;
    }
  }

  // ------------------------------------------------------------ 지급 기록 (같은 구매를 두 번 지급하지 않게)
  function readLedger() {
    if (memLedger) return memLedger;
    try {
      var v = JSON.parse(w.localStorage.getItem(LEDGER) || "null");
      if (v && typeof v === "object" && v.g && typeof v.g === "object") return v;
    } catch (e) { /* 아래 빈 기록 */ }
    return {g: {}};
  }

  function writeLedger(l) {
    var now = Date.now();
    var keys = Object.keys(l.g).filter(function (t) {
      var at = l.g[t] && l.g[t][1];
      return typeof at === "number" && now - at < KEEP;
    }).sort(function (a, b) { return l.g[b][1] - l.g[a][1]; }).slice(0, KEEP_MAX);
    var out = {g: {}};
    keys.forEach(function (t) { out.g[t] = l.g[t]; });
    try {
      w.localStorage.setItem(LEDGER, JSON.stringify(out));
      memLedger = null;
    } catch (e) {
      memLedger = out;
    }
  }

  function granted(token) { return !!(token && readLedger().g[String(token)]); }

  function remember(token, k) {
    if (!token) return;
    var l = readLedger();
    l.g[String(token)] = [k, Date.now()];
    writeLedger(l);
  }

  /** 이 기기에서 이 상품을 지급한 가장 최근 구매 (없으면 "") */
  function ledgerToken(k) {
    var g = readLedger().g;
    var best = "";
    Object.keys(g).forEach(function (t) {
      if (g[t] && g[t][0] === k && (!best || g[t][1] > g[best][1])) best = t;
    });
    return best;
  }

  function readSim() {
    try {
      var v = JSON.parse(w.localStorage.getItem(SIM) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function addSim(k) {
    var list = readSim();
    if (list.indexOf(k) < 0) list.push(k);
    try { w.localStorage.setItem(SIM, JSON.stringify(list)); } catch (e) { /* 저장 못 해도 괜찮아요 */ }
  }

  // ------------------------------------------------------------ 지표 (지표 모듈 NcqMetrics가 있으면 결제 기록을 보내요)
  function note(name, k, extra) {
    try {
      var m = w.NcqMetrics;
      if (!k || !m || typeof m._tool !== "function") return;
      var p = {product: k, kind: typeOf(k) || st.learned[k] || ""};
      if (extra) {
        for (var x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) p[x] = extra[x];
      }
      m._tool(name, p);
    } catch (e) { /* 지표 때문에 결제가 멈추면 안 돼요 */ }
  }

  /** 지급한 구매 기록: 새 구매(끝나지 않았던 구매 포함)는 purchase, 다시 설치해 되찾은 비소모성 상품은 purchase_restore */
  function noteGrant(k, info) {
    if (info && info.restored) return note("purchase_restore", k);
    var shown = shelf[k] || {};
    var extra = {qty: (info && info.quantity) || 1};
    if (typeof shown.amount === "number" && isFinite(shown.amount)) {
      extra.amount = shown.amount;
      extra.currency = shown.currency || "";
    }
    if (info && info.test) extra.test = true;
    if (info && info.recovered) extra.recovered = true;
    note("purchase", k, extra);
  }

  /** 결제가 지급 없이 끝났을 때 (취소·실패). 성공은 지급할 때 적어요 */
  function noteEnd(k, r) {
    if (!r || r.ok) return;
    if (r.code === "USER_CANCELED") note("purchase_cancel", k);
    else note("purchase_fail", k, {code: String(r.code || "ERROR")});
  }

  /** 가격 글의 숫자 (토스 원화 '1,200원' → 1200). 숫자가 없으면 null */
  function won(text) {
    var n = parseInt(String(text == null ? "" : text).replace(/[^0-9]/g, ""), 10);
    return isFinite(n) ? n : null;
  }

  /** 공용 저장 모듈 NcqSave를 쓰는 게임이면 지급한 저장을 바로 클라우드에 올려요 (결제한 재화가 이 기기에만 있지 않게).
   * 백업이 늦어지거나 실패해도 결제 마무리는 그대로 해요 (NcqSave가 다시 올려요). */
  function backupSave() {
    try {
      if (w.NcqSave && w.NcqSave.backup) w.NcqSave.backup();
    } catch (e) { /* 저장 백업은 결제를 막지 않아요 */ }
  }

  // ------------------------------------------------------------ 지급 (게임의 onGrant)
  /** 게임에 지급을 맡기고, 지급했으면 기록해요. 지급했으면 true (false를 돌려주거나 오류가 나면 false).
   * 같은 구매를 지급하는 중에 또 부르면 같은 결과를 기다려요 (두 번 지급하지 않게). */
  function deliver(k, token, info) {
    var id = token ? String(token) : "";
    if (id && inflight[id]) return inflight[id];
    if (!st.handler) {
      once("handler", "NcqIap.onGrant(...)로 지급 함수를 먼저 등록해요. 지급할 곳이 없어 구매를 마무리하지 않았어요.");
      return Promise.resolve(false);
    }
    var p;
    st.granting += 1;
    info = info || {};
    info.grantId = id ? "iap:" + id : ""; // 이 구매만의 지급 번호 (NcqSave.grant(정보.grantId, …)로 두 번 넣지 않게)
    try {
      var out = st.handler(k, info);
      p = Promise.resolve(out).then(function (ok) {
        if (ok === false) return false;
        remember(id, k);
        noteGrant(k, info);
        backupSave();
        return true;
      }, function (e) {
        warn("onGrant에서 오류가 났어요 (" + k + ")", e);
        return false;
      });
    } catch (e) {
      warn("onGrant에서 오류가 났어요 (" + k + ")", e);
      p = Promise.resolve(false);
    }
    if (id) inflight[id] = p;
    var released = false;
    function release() {
      if (released) return;
      released = true;
      st.granting -= 1;
    }
    setTimeout(release, GRANT_WAIT);
    p.then(function () {
      release();
      if (id) delete inflight[id];
    });
    return p;
  }

  function result(ok, k, code, extra) {
    var r = {ok: ok, id: k};
    if (!ok) {
      r.code = code || "ERROR";
      r.message = code in MESSAGES ? MESSAGES[code] : T.failed;
    }
    if (extra) {
      for (var x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) r[x] = extra[x];
    }
    return r;
  }

  /** 실패를 알려요 (취소·진행 중은 조용히) */
  function failed(k, code, err) {
    var r = result(false, k, code);
    if (err && code !== "USER_CANCELED") warn("결제가 끝나지 않았어요 (" + k + ", " + code + ")", err);
    if (r.message) toast(r.message);
    return r;
  }

  /** 오류에서 결제 결과 이름을 찾아요 (플러그인마다 code·message 자리가 달라요) */
  function codeOf(e) {
    var parts = [e && e.code, e && e.message, e && e.errorMessage, typeof e === "string" ? e : ""];
    var text = parts.map(function (p) { return String(p == null ? "" : p); }).join(" ");
    for (var i = 0; i < CODES.length; i++) {
      if (new RegExp("\\b" + CODES[i] + "\\b").test(text)) return CODES[i] === "PAYMENT_PENDING" ? "PENDING" : CODES[i];
    }
    if (/\bTIMEOUT\b/.test(text)) return "TIMEOUT";
    if (/pending/i.test(text)) return "PENDING";
    if (/cancel/i.test(text)) return "USER_CANCELED";
    if (/not found/i.test(text)) return "ITEM_UNAVAILABLE";
    return "ERROR";
  }

  // ------------------------------------------------------------ 준비 (결제 연결, 상품 정보)
  /** 결제 연결 (플러그인·결제 지원 확인). 되면 기억하고, 안 되면 다음에 다시 해 봐요 (force면 바로). */
  function connect(force) {
    if (st.conn) return st.conn;
    var e = env();
    if (!e.sim && !e.android && !e.ios && !e.toss) return Promise.resolve(false);
    if (!force && st.connAt && Date.now() - st.connAt < RETRY_GAP) return Promise.resolve(false);
    st.connAt = Date.now();
    var step = e.sim ? Promise.resolve(true) : e.android || e.ios ? serial(connectNative) : Promise.resolve(connectToss());
    var p = step.then(function (ok) { return !!ok; }, function (err) {
      warn("결제를 준비하지 못했어요. 잠시 뒤 다시 해요", err);
      return false;
    }).then(function (ok) {
      if (!ok) st.conn = null; // 실패는 기억하지 않아요
      st.off = !ok;
      return ok;
    });
    st.conn = p; // 준비하는 동안 부르면 같은 결과를 기다려요
    return p;
  }

  function connectNative() {
    var P = plugin();
    if (!P) {
      once("plugin", "결제 플러그인(@capgo/native-purchases)이 앱에 없어요. 출시 빌드가 넣어요 (프로젝트가 직접 Capacitor를 " +
        "쓰면 package.json에 넣어요).");
      return false;
    }
    // 플러그인의 자동 마무리를 꺼요: 켜 두면 결제 대기였던 구매가 다른 명령 중에 끝날 때 지급 전에 확인(acknowledge)돼요
    var setup = typeof P.configure === "function" ?
      timed(P.configure({autoFinishTransactions: false}), CALL_WAIT).then(noop, function (err) {
        warn("결제 플러그인의 자동 마무리를 끄지 못했어요", err);
      }) : Promise.resolve();
    return setup.then(function () {
      if (env().ios) {
        if (typeof P.getUnfinishedTransactions !== "function" || typeof P.finishTransaction !== "function") return false;
        if (typeof P.addListener === "function") P.addListener("transactionUpdated", checkAgain).then(noop, noop);
      }
      if (typeof P.isBillingSupported !== "function") return true;
      return timed(P.isBillingSupported(), CALL_WAIT).then(function (r) {
        if (r && r.isBillingSupported === false) {
          warn("지금은 이 기기에서 " + (env().ios ? "App Store" : "구글플레이") + " 결제를 쓸 수 없어요. 잠시 뒤 다시 해요.");
          return false;
        }
        return true;
      });
    });
  }

  function connectToss() {
    var I = tossIap();
    if (!I || !supported(I.createOneTimePurchaseOrder)) {
      once("toss", "토스 인앱 결제를 쓸 수 없어요 (토스 앱이 오래됐거나, 빌드에 ncq-toss.js가 없어요).");
      return false;
    }
    return true;
  }

  /** 상품 정보(가격) 받기. 받으면 기억하고, 못 받으면 다음에 다시 (force면 바로). 결제를 쓸 수 있으면 true. */
  function load(force) {
    if (st.loaded) return Promise.resolve(true);
    if (st.load) return st.load;
    var e = env();
    if (!e.sim && !e.android && !e.ios && !e.toss) return Promise.resolve(false);
    if (!force && st.loadAt && Date.now() - st.loadAt < RETRY_GAP) return Promise.resolve(false);
    st.loadAt = Date.now();
    st.load = connect(force).then(function (ok) {
      if (!ok) return false;
      if (e.sim) return true;
      return serial(e.android || e.ios ? loadNative : loadToss);
    }).then(function (ok) {
      st.load = null;
      st.loaded = !!ok;
      announce();
      return st.loaded;
    }, function (err) {
      st.load = null;
      warn("상품 정보를 받지 못했어요. 잠시 뒤 다시 해요", err);
      announce();
      return false;
    });
    return st.load;
  }

  function wanted() {
    return Object.keys(products()).filter(function (k) { return /^[A-Z0-9_]+$/.test(k); });
  }

  function loadNative() {
    var P = plugin();
    var store = env().ios ? "App Store" : "구글플레이";
    var keys = wanted();
    if (!keys.length) return true;
    var ids = keys.map(storeId);
    return timed(P.getProducts({productIdentifiers: ids, productType: "inapp"}), CALL_WAIT).then(function (res) {
      ((res && res.products) || []).forEach(function (p) {
        var id = p && (p.identifier || p.productIdentifier);
        var k = id ? keyOfStore(id) : "";
        if (k && !shelf[k]) { // 구매 옵션마다 하나씩 와요: 첫 옵션의 가격을 보여 주고 그 옵션으로 결제해요
          shelf[k] = {sku: String(id), price: String(p.priceString || ""), title: String(p.title || ""),
                      offer: p.offerToken ? String(p.offerToken) : "",
                      amount: typeof p.price === "number" && isFinite(p.price) ? p.price : null,
                      currency: String(p.currencyCode || "")};
        }
      });
      keys.forEach(function (k) {
        if (!shelf[k]) once("missing-" + k, store + "에 없거나 판매 중이 아닌 상품이라 숨겨요: " + storeId(k));
      });
      return true;
    }, function (err) {
      if (/not found/i.test(String((err && (err.message || err.code)) || err))) { // 스토어에 켠 상품이 하나도 없어요
        keys.forEach(function (k) { once("missing-" + k, store + "에 없거나 판매 중이 아닌 상품이라 숨겨요: " + storeId(k)); });
        return true;
      }
      warn(store + " 상품 정보를 받지 못했어요. 잠시 뒤 다시 해요", err);
      return false;
    });
  }

  function loadToss() {
    var I = tossIap();
    if (!supported(I.getProductItemList)) {
      once("toss-list", "이 토스 앱은 상품 목록을 주지 않아서 상품을 숨겨요 (토스 앱 업데이트가 필요해요).");
      return true;
    }
    return timed(I.getProductItemList(), CALL_WAIT).then(function (res) {
      var list = ((res && res.products) || []).filter(function (p) { return p && p.sku; });
      wanted().forEach(function (k) {
        var want = storeId(k);
        var hit = null;
        list.forEach(function (p) {
          if (!hit && String(p.sku) === want) hit = p;
        });
        list.forEach(function (p) { // 콘솔 SKU가 대소문자만 다르면 이어 붙여요
          if (!hit && String(p.sku).toLowerCase() === want.toLowerCase()) hit = p;
        });
        if (hit) {
          shelf[k] = {sku: String(hit.sku), price: String(hit.displayAmount || ""), title: String(hit.displayName || ""),
                      type: String(hit.type || ""),
                      amount: typeof hit.amount === "number" && isFinite(hit.amount) ? hit.amount : won(hit.displayAmount),
                      currency: "KRW"}; // 토스는 원화 결제만 (한국 계정)
        } else {
          once("missing-" + k, "앱인토스 콘솔에 없거나 노출하지 않은 상품이라 숨겨요: " + want + " (콘솔 상품 SKU를 출시 서버에 " +
            "알려 주면 release/toss/iap.json에 저장돼요)");
        }
      });
      return true;
    }, function (err) {
      warn("토스 상품 정보를 받지 못했어요. 잠시 뒤 다시 해요", err);
      return false;
    });
  }

  function announce() {
    try {
      w.dispatchEvent(new w.CustomEvent("ncq-iap", {detail: status()}));
    } catch (e) { /* 이벤트를 못 만들어도 괜찮아요 */ }
  }

  // ------------------------------------------------------------ 끝나지 않은 구매 찾기
  /** 결제됐지만 지급·마무리가 안 끝난 구매를 지급해요. all이면 산 비소모성 상품도 모두 다시 지급 (구매 복원).
   * {ok, list: [지급한 상품], code}. 상품 정보와 상관없이 해요 (가격을 못 받아도 산 것은 지급). */
  function recover(all, force) {
    if (!st.handler) return Promise.resolve({ok: false, list: [], code: "NO_GRANT"});
    return connect(force).then(function (ok) {
      if (!ok) return {ok: false, list: [], code: "UNAVAILABLE"};
      return serial(function () {
        st.recovered = Date.now();
        var e = env();
        var job = e.sim ? simRecover(all) : e.ios ? iosRecover(all) : e.android ? androidRecover(all) : tossRecover(all);
        return job.then(function (list) { return {ok: true, list: list}; }, function (err) {
          warn("끝나지 않은 구매를 찾지 못했어요. 다음에 다시 해요", err);
          st.recovered = 0; // 다음에 앱으로 돌아오면 바로 다시
          return {ok: false, list: [], code: codeOf(err)};
        });
      });
    });
  }

  /** 다른 구매로 끝났거나 확인이 늦은 결제: 조금 뒤 한 번 더 찾아봐요 */
  function checkAgain() {
    st.recovered = 0;
    setTimeout(function () {
      if (st.handler && idle()) recover(false, true).then(noop, noop); // 못 하면 앱으로 돌아올 때 해요
    }, CHECK_AGAIN);
  }

  function finishAndroid(P, token, type, acked) {
    var job = null;
    if (type === "consumable") {
      job = P.consumePurchase({purchaseToken: token});
    } else if (!acked) {
      job = P.acknowledgePurchase({purchaseToken: token});
    }
    if (!job) return Promise.resolve(true);
    return timed(job, CALL_WAIT).then(function () { return true; }, function (e) {
      warn("구매를 마무리하지 못했어요. 다음에 앱을 열 때 다시 해요", e);
      st.recovered = 0;
      return false;
    });
  }

  function iosEntitlements() {
    return timed(plugin().getPurchases({productType: "inapp", onlyCurrentEntitlements: true}), CALL_WAIT).then(function (r) {
      if (!r || !Array.isArray(r.purchases)) throw new Error("StoreKit 구매 목록을 읽지 못했어요.");
      return r.purchases.filter(function (t) { return t && !t.revocationDate; });
    });
  }

  function iosGrant(t, restored) {
    var k = t && keyOfStore(t.productIdentifier);
    var token = t && String(t.transactionId || "");
    if (!k || !/^\d+$/.test(token) || t.revocationDate || (restored && typeOf(k) !== "non_consumable")) {
      return Promise.resolve(false);
    }
    var ledger = "ios:" + token;
    var grant = !restored && granted(ledger) ? Promise.resolve(true)
      : deliver(k, ledger, {restored: restored, order: token, quantity: qty(t)});
    return grant.then(function (ok) {
      if (!ok) return false;
      if (restored) return k;
      return timed(plugin().finishTransaction({transactionId: token}), CALL_WAIT).then(function () { return k; }, function (e) {
        warn("StoreKit 구매를 마무리하지 못했어요. 다음에 다시 해요", e);
        checkAgain();
        return k; // 지급 기록이 있어 다음 시도에는 마무리만 해요
      });
    });
  }

  function iosRecover(all) {
    var done = [];
    done.left = [];
    done.waiting = [];
    var P = plugin();
    var ready = all ? timed(P.restorePurchases(), ORDER_WAIT) : Promise.resolve();
    return ready.then(function () { return timed(P.getUnfinishedTransactions(), CALL_WAIT); }).then(function (r) {
      if (!r || !Array.isArray(r.transactions)) throw new Error("StoreKit 미완료 거래를 읽지 못했어요.");
      return each(r.transactions, function (t) {
        return iosGrant(t, false).then(function (k) { if (k) done.push(k); else if (t) done.left.push(keyOfStore(t.productIdentifier)); });
      });
    }).then(function () {
      if (!all) return;
      return iosEntitlements().then(function (list) {
        return each(list, function (t) {
          return iosGrant(t, true).then(function (k) { if (k) done.push(k); });
        });
      });
    }).then(function () { return done; });
  }

  function iosBuy(k, type) {
    var P = plugin();
    var id = storeId(k);
    var before = type === "non_consumable" ? iosEntitlements() : Promise.resolve([]);
    return before.then(function (list) {
      var owned = list.find(function (t) { return t.productIdentifier === id; });
      if (owned) return iosGrant(owned, true).then(function (got) {
        return got ? result(true, k, null, {restored: true}) : failed(k, "NOT_GRANTED");
      });
      return timed(P.purchaseProduct({productIdentifier: id, productType: "inapp", quantity: 1,
                                      isConsumable: type === "consumable", autoAcknowledgePurchases: false}), ORDER_WAIT)
        .then(function (t) {
          if (!t || t.productIdentifier !== id || !t.transactionId) {
            checkAgain();
            return failed(k, "CHECKING");
          }
          return iosGrant(t, false).then(function (got) { return got ? result(true, k) : failed(k, "NOT_GRANTED"); });
        });
    }).catch(function (err) {
      var message = String(err && err.message || "");
      if (/cancel/i.test(message)) return failed(k, "USER_CANCELED", err);
      if (/pending|defer/i.test(message)) {
        checkAgain();
        return failed(k, "PENDING", err);
      }
      return failed(k, codeOf(err), err);
    });
  }

  /** 구글플레이의 결제된 구매 목록. 못 받으면 오류 (빈 목록으로 다루면 산 것을 잃은 것처럼 보여요) */
  function androidPurchases() {
    return timed(plugin().getPurchases({productType: "inapp"}), CALL_WAIT).then(function (res) {
      if (!res || !Array.isArray(res.purchases)) {
        var e = new Error("구매 목록 모양이 달라요");
        e.code = "QUERY_PURCHASES_FAILED";
        throw e;
      }
      return res.purchases;
    });
  }

  function findPurchase(list, id) {
    var hit = null;
    (list || []).forEach(function (t) {
      if (!hit && t && String(t.productIdentifier) === id && String(t.purchaseState) === "1") hit = t;
    });
    return hit;
  }

  /** 지급한 상품 목록. 지급·마무리하지 못한 상품은 .left, 결제 대기 중인 상품은 .waiting에 */
  function androidRecover(all) {
    var P = plugin();
    var done = [];
    done.left = [];
    done.waiting = [];
    return androidPurchases().then(function (list) {
      return each(list, function (t) {
        var k = t && keyOfStore(t.productIdentifier);
        if (!k) return null;
        if (String(t.purchaseState) !== "1") { // 결제 대기(현금 결제 등): 끝나면 다시 와요
          done.waiting.push(k);
          return null;
        }
        var token = t.purchaseToken || t.transactionId;
        if (!token) return null;
        var type = typeOf(k);
        var acked = t.isAcknowledged === true;
        var info = {restored: false, recovered: true, order: t.orderId || "", quantity: qty(t),
                    purchaseToken: t.purchaseToken};
        function finish() {
          return finishAndroid(P, token, type, acked).then(function (ok) { if (!ok) done.left.push(k); });
        }
        if (type === "consumable" || !acked) { // 쓰기(consume) 전이거나 마무리(acknowledge) 전: 끝나지 않은 구매
          if (granted(token)) return finish();
          return deliver(k, token, info).then(function (ok) {
            if (!ok) {
              done.left.push(k);
              return null;
            }
            done.push(k);
            return finish();
          });
        }
        if (type === "non_consumable") { // 산 비소모성 상품 (다시 설치·기기 변경)
          if (!all && granted(token)) return null;
          return deliver(k, token, {restored: true, order: t.orderId || "", quantity: 1}).then(function (ok) {
            if (ok) done.push(k);
          });
        }
        // 종류를 모르는 마무리된 구매 (다른 코드가 자동으로 확인한 것 등): 이 기기에서 한 번만 지급하고 마무리는 하지 않아요
        if (granted(token)) return null;
        return deliver(k, token, info).then(function (ok) { if (ok) done.push(k); });
      });
    }).then(function () { return done; });
  }

  /** 토스 주문 기록 {ok, list} (못 읽었거나 너무 길면 ok false, 이 토스 앱에 기능이 없으면 unsupported) */
  function tossHistory() {
    var I = tossIap();
    if (!I || !supported(I.getCompletedOrRefundedOrders)) return Promise.resolve({ok: false, unsupported: true});
    if (st.history && Date.now() - st.historyAt < HISTORY_GAP) return Promise.resolve({ok: true, list: st.history});
    var all = [];
    function page(key, n) {
      return timed(I.getCompletedOrRefundedOrders(key ? {key: key} : undefined), CALL_WAIT).then(function (r) {
        if (!r || !Array.isArray(r.orders)) throw new Error("주문 기록 모양이 달라요");
        all = all.concat(r.orders);
        if (r.hasNext && r.nextKey) {
          if (n + 1 >= HISTORY_PAGES) throw new Error("주문 기록이 너무 길어요");
          return page(r.nextKey, n + 1);
        }
        return all;
      });
    }
    return page(null, 0).then(function (list) {
      st.history = list;
      st.historyAt = Date.now();
      return {ok: true, list: list};
    }, function (e) {
      warn("토스 주문 기록을 받지 못했어요", e);
      return {ok: false};
    });
  }

  /** 토스 주문 기록에서 이 SKU의 완료된(환불되지 않은) 주문 (SKU는 대소문자만 달라도 같은 상품으로 봐요) */
  function completed(list, sku) {
    var hit = null;
    (list || []).forEach(function (o) {
      if (o && sameSku(o.sku, sku) && String(o.status).toUpperCase() === "COMPLETED") hit = hit || o;
    });
    return hit;
  }

  function tossSku(k) { return (shelf[k] && shelf[k].sku) || storeId(k); }

  function tossComplete(orderId) {
    var I = tossIap();
    if (!I || !supported(I.completeProductGrant)) return Promise.resolve();
    return timed(I.completeProductGrant({params: {orderId: orderId}}), CALL_WAIT).then(noop, function (e) {
      warn("토스 주문 지급 완료를 알리지 못했어요. 다음에 앱을 열 때 다시 해요", e);
      st.recovered = 0;
    });
  }

  function tossRecover(all) {
    var I = tossIap();
    var done = [];
    var pend = supported(I.getPendingOrders) ? timed(I.getPendingOrders(), CALL_WAIT).then(function (r) {
      if (!r || !Array.isArray(r.orders)) throw new Error("지급 안 된 주문 모양이 달라요");
      return r.orders;
    }) : Promise.resolve([]);
    return pend.then(function (orders) {
      return each(orders, function (o) {
        var k = o && keyOfStore(o.sku);
        var id = o && o.orderId;
        if (!k || !id) return null;
        if (granted(id)) return tossComplete(id);
        return deliver(k, id, {restored: false, recovered: true, order: id, quantity: 1}).then(function (ok) {
          if (!ok) return null;
          done.push(k);
          return tossComplete(id);
        });
      });
    }).then(function () {
      var keys = Object.keys(products()).filter(function (k) { return typeOf(k) === "non_consumable"; });
      if (!keys.length) return null;
      return tossHistory().then(function (h) {
        if (!h.ok) {
          if (all && !h.unsupported) throw new Error("토스 주문 기록을 받지 못했어요");
          return null;
        }
        return each(keys, function (k) {
          var o = completed(h.list, tossSku(k));
          if (!o || (!all && granted(o.orderId))) return null;
          return deliver(k, o.orderId, {restored: true, order: o.orderId, quantity: 1}).then(function (ok) {
            if (ok) done.push(k);
          });
        });
      });
    }).then(function () { return done; });
  }

  function simRecover(all) {
    if (!all) return Promise.resolve([]);
    var done = [];
    return each(readSim(), function (k) {
      return deliver(k, "", {restored: true, test: true, quantity: 1}).then(function (ok) { if (ok) done.push(k); });
    }).then(function () { return done; });
  }

  // ------------------------------------------------------------ 게임이 부르는 것
  function onGrant(fn) {
    st.handler = typeof fn === "function" ? fn : null;
    if (st.handler) recover(false, true).then(noop, noop); // 앱을 열 때 끝나지 않은 구매부터
    return api;
  }

  function can(id) {
    var k = keyOf(id);
    if (!k) return false;
    var e = env();
    if (e.sim) return true;
    if (!e.android && !e.ios && !e.toss) return false;
    if (!st.loaded) load(false);
    return st.loaded && isOn(k) && !!shelf[k];
  }

  function ready() {
    return load(true);
  }

  function price(id) {
    var k = keyOf(id);
    if (env().sim) return k ? T.testPrice : "";
    if (!st.loaded) load(false);
    return (shelf[k] && shelf[k].price) || "";
  }

  function buy(id, options) { return purchase(id, "consumable", options); }

  function buyOnce(id) { return purchase(id, "non_consumable"); }

  function purchase(id, type, options) {
    var k = keyOf(id);
    if (!k) return Promise.resolve(failed(k, "UNAVAILABLE"));
    st.learned[k] = type;
    if (st.busy) return Promise.resolve(result(false, k, "BUSY"));
    if (!st.handler) {
      once("handler", "NcqIap.onGrant(...)로 지급 함수를 먼저 등록해요. 지급할 곳이 없어 결제를 시작하지 않았어요.");
      return Promise.resolve(failed(k, "NO_GRANT"));
    }
    st.busy = true;
    note("purchase_start", k);
    return load(true).then(function () {
      if (!can(k)) return failed(k, "UNAVAILABLE");
      return serial(function () {
        if (env().sim) return simBuy(k, type);
        if (env().ios) return iosBuy(k, type);
        if (env().android) return androidBuy(k, type, options);
        return tossBuy(k, type);
      });
    }).then(function (r) {
      st.busy = false;
      noteEnd(k, r);
      return r;
    }, function (e) {
      st.busy = false;
      var r = failed(k, codeOf(e), e);
      noteEnd(k, r);
      return r;
    });
  }

  function androidBuy(k, type, options) {
    var P = plugin();
    var id = storeId(k);
    var first = type === "non_consumable" ? androidPurchases().then(function (list) {
      var t = findPurchase(list, id);
      if (!t) return null; // 아직 안 산 상품
      var token = t.purchaseToken || t.transactionId;
      return deliver(k, token, {restored: true, order: t.orderId || "", quantity: 1}).then(function (ok) {
        if (!ok) return failed(k, "NOT_GRANTED");
        return finishAndroid(P, token, type, t.isAcknowledged === true).then(function () {
          return result(true, k, null, {restored: true});
        });
      });
    }, function (e) { // 목록을 못 받으면 결제로 넘어가요 (이미 산 상품이면 구글플레이가 결제하지 않고 알려 줘요)
      warn("구글플레이 구매 목록을 받지 못했어요", e);
      return null;
    }) : Promise.resolve(null);
    return first.then(function (done) {
      if (done) return done;
      var opts = {productIdentifier: id, productType: "inapp", quantity: 1, isConsumable: type === "consumable",
                  autoAcknowledgePurchases: false};
      if (options && options.appAccountToken !== undefined) {
        if (typeof options.appAccountToken !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(options.appAccountToken)) {
          return failed(k, "UNAVAILABLE");
        }
        opts.appAccountToken = options.appAccountToken;
      }
      if (shelf[k] && shelf[k].offer) opts.offerToken = shelf[k].offer; // 보여 준 가격의 구매 옵션으로
      return timed(P.purchaseProduct(opts), ORDER_WAIT).then(function (t) {
        var token = (t && (t.purchaseToken || t.transactionId)) || "";
        if (t && t.productIdentifier && String(t.productIdentifier) !== id) {
          // 결제 대기였던 다른 구매가 이 결제 중에 끝났어요: 그 구매는 제 상품으로 지급하고, 이 결제는 조금 뒤 다시 찾아봐요
          return androidRecover(false).then(noop, noop).then(function () {
            checkAgain();
            return failed(k, "CHECKING");
          });
        }
        if (t && t.purchaseState != null && String(t.purchaseState) !== "1") return failed(k, "PENDING");
        if (!token) {
          checkAgain();
          return failed(k, "CHECKING");
        }
        return deliver(k, token, {restored: false, order: (t && t.orderId) || "", quantity: qty(t),
                                  purchaseToken: t && t.purchaseToken}).then(function (ok) {
          if (!ok) return failed(k, "NOT_GRANTED");
          return finishAndroid(P, token, type, !!(t && t.isAcknowledged)).then(function () { return result(true, k); });
        });
      }, function (e) {
        var code = codeOf(e);
        if (code === "TIMEOUT") {
          checkAgain();
          return failed(k, "SLOW");
        }
        if (code !== "ITEM_ALREADY_OWNED") return failed(k, code, e);
        // 이미 가진 상품: 비소모성은 다시 지급, 소모성은 끝나지 않은 지난 구매를 마무리해요
        return androidRecover(type === "non_consumable").then(function (got) {
          if (type === "non_consumable") {
            return got.indexOf(k) >= 0 ? result(true, k, null, {restored: true}) : failed(k, "NOT_GRANTED");
          }
          if (got.left.indexOf(k) >= 0) return failed(k, "NOT_GRANTED");
          if (got.waiting.indexOf(k) >= 0) return failed(k, "PENDING");
          return failed(k, "ITEM_ALREADY_OWNED");
        }, function (err) {
          return failed(k, "NETWORK_ERROR", err);
        });
      });
    });
  }

  function tossBuy(k, type) {
    var I = tossIap();
    var sku = tossSku(k);
    function again(token) {
      return deliver(k, token, {restored: true, order: token, quantity: 1}).then(function (ok) {
        return ok ? result(true, k, null, {restored: true}) : failed(k, "NOT_GRANTED");
      });
    }
    var first = type === "non_consumable" ? tossHistory().then(function (h) {
      if (h.ok) {
        var o = completed(h.list, sku);
        return o ? again(o.orderId) : null;
      }
      if (h.unsupported) { // 주문 기록을 주지 않는 토스 앱: 이 기기에서 산 기록으로
        var token = ledgerToken(k);
        return token ? again(token) : null;
      }
      return failed(k, "NETWORK_ERROR"); // 산 적이 있는지 모르면 두 번 결제하지 않게 주문을 열지 않아요
    }) : Promise.resolve(null);
    return first.then(function (done) {
      if (done) return done;
      var ask = env().cfg && env().cfg.test ? confirmTest() : Promise.resolve(true);
      return ask.then(function (go) {
        if (!go) return result(false, k, "USER_CANCELED");
        return tossOrder(I, k, sku);
      });
    });
  }

  function tossOrder(I, k, sku) {
    return new Promise(function (resolve) {
      var cleanup = null;
      var ended = false;
      var grant = null; // 이 주문의 지급 (processProductGrant)
      var timer = 0;
      /** 주문이 끝나면: 지급 중이면 그 결과를 기다려서, 지급했으면 성공, 아니면 fallback()의 결과 */
      function settle(fallback) {
        Promise.resolve(grant).then(function (ok) {
          if (ended) return;
          ended = true;
          clearTimeout(timer);
          setTimeout(function () {
            try { if (typeof cleanup === "function") cleanup(); } catch (e) { /* 이미 정리됐어요 */ }
          }, 0);
          st.history = null; // 다음에는 새 주문 기록을 받아요
          resolve(ok === true ? result(true, k) : fallback());
        });
      }
      timer = setTimeout(function () {
        settle(function () {
          checkAgain();
          return failed(k, "SLOW");
        });
      }, ORDER_WAIT);
      try {
        cleanup = I.createOneTimePurchaseOrder({
          options: {
            sku: sku,
            processProductGrant: function (p) { // 결제 직후 30초 안에 지급해야 해요
              var orderId = p && p.orderId;
              if (orderId && granted(orderId)) {
                grant = Promise.resolve(true);
                return true;
              }
              grant = deliver(k, orderId, {restored: false, order: orderId || "", quantity: 1});
              return grant;
            }
          },
          onEvent: function (e) {
            if (!e || e.type !== "success") return;
            settle(function () { // 결제는 됐는데 지급을 부르지 않은 토스 앱: 지급 안 된 주문에서 찾아 지급해요
              return tossRecover(false).then(function (got) {
                return got.indexOf(k) >= 0 ? result(true, k) : failed(k, "NOT_GRANTED");
              }, function (err) {
                checkAgain();
                return failed(k, "CHECKING", err);
              });
            });
          },
          onError: function (err) {
            settle(function () { return failed(k, codeOf(err), err); });
          }
        });
      } catch (e) {
        settle(function () { return failed(k, codeOf(e), e); });
      }
    });
  }

  function ledgerHas(k) { return !!ledgerToken(k); }

  function owned(id) {
    var k = keyOf(id);
    if (!k) return Promise.resolve(false);
    var e = env();
    if (e.sim) return Promise.resolve(readSim().indexOf(k) >= 0);
    if (!e.android && !e.ios && !e.toss) return Promise.resolve(false);
    if (st.busy) return Promise.resolve(ledgerHas(k)); // 결제 중에는 플러그인을 건드리지 않아요 (이 기기의 지급 기록으로)
    return connect(false).then(function (ok) {
      if (!ok) return ledgerHas(k);
      return serial(function () {
        if (e.ios) return iosEntitlements().then(function (list) {
          return list.some(function (t) { return t.productIdentifier === storeId(k); });
        }, function () { return ledgerHas(k); });
        if (e.android) {
          return androidPurchases().then(function (list) { return !!findPurchase(list, storeId(k)); }, function (err) {
            warn("구글플레이 구매 목록을 받지 못해 이 기기의 지급 기록으로 답해요", err);
            return ledgerHas(k);
          });
        }
        return tossHistory().then(function (h) { return h.ok ? !!completed(h.list, tossSku(k)) : ledgerHas(k); });
      });
    });
  }

  function restore() {
    if (!st.handler) {
      once("handler", "NcqIap.onGrant(...)로 지급 함수를 먼저 등록해요.");
      return Promise.resolve({ok: false, restored: [], code: "NO_GRANT"});
    }
    if (st.granting > 0) return Promise.resolve({ok: false, restored: [], code: "BUSY"}); // 지급 함수 안에서는 복원하지 않아요
    st.history = null; // 새 주문 기록으로
    return recover(true, true).then(function (r) {
      return r.ok ? {ok: true, restored: uniq(r.list)} : {ok: false, restored: [], code: r.code || "ERROR"};
    });
  }

  function status() {
    var e = env();
    var items = {};
    Object.keys(products()).forEach(function (k) {
      items[k] = {on: isOn(k), id: storeId(k), type: typeOf(k) || null, sellable: !!shelf[k],
                  price: (shelf[k] && shelf[k].price) || ""};
    });
    return {
      version: VERSION, platform: e.platform, mode: e.sim ? "simulate" : e.ios ? "appstore" : e.android ? "googleplay" : e.toss ? "toss" : "off",
      plugin: e.toss ? !!tossIap() : !!plugin(), ready: st.loaded, off: st.off, busy: st.busy, handler: !!st.handler,
      test: !!(e.cfg && e.cfg.test), products: items
    };
  }

  // ------------------------------------------------------------ 화면 (공유 테스트의 결제 자리, 토스 테스트 확인, 알림)
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

  /** 물어보는 판: [[글, 주 버튼인지, 값], ...] 중 누른 값 */
  function ask(top, title, note, choices) {
    return new Promise(function (resolve) {
      var o = layer();
      var c = card();
      if (top) c.appendChild(el("div", "font-size:12px;letter-spacing:.08em;opacity:.65", top));
      c.appendChild(el("div", "margin-top:6px;font-size:19px;font-weight:700", title));
      c.appendChild(el("div", "margin:8px 0 6px;font-size:13px;opacity:.75", note));
      choices.forEach(function (ch) {
        c.appendChild(button(ch[0], ch[1], function () {
          o.remove();
          resolve(ch[2]);
        }));
      });
      o.appendChild(c);
      mount(o);
    });
  }

  function simBuy(k, type) {
    return ask("IAP · " + k, T.sim, (type === "consumable" ? T.consumable : T.nonConsumable) + " · " + T.simNote,
      [[T.simBuy, true, true], [T.cancel, false, false]]).then(function (go) {
      if (!go) return result(false, k, "USER_CANCELED");
      var token = "sim-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      return deliver(k, token, {restored: false, test: true, quantity: 1}).then(function (ok) {
        if (!ok) return failed(k, "NOT_GRANTED");
        if (type === "non_consumable") addSim(k);
        return result(true, k, null, {test: true});
      });
    });
  }

  function confirmTest() {
    return ask("TOSS · TEST", T.tossTest, T.tossTestNote, [[T.tossTestGo, true, true], [T.cancel, false, false]]);
  }

  function toast(text) {
    var t = el("div", "position:fixed;left:50%;bottom:24px;bottom:calc(24px + var(--ncq-banner-bottom,0px) + " +
      "env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:" + (Z + 20) + ";max-width:90vw;" +
      "max-width:min(90vw,360px);box-sizing:border-box;" +
      "padding:10px 16px;border-radius:999px;background:rgba(20,24,30,.92);color:#fff;text-align:center;" +
      "pointer-events:none;word-break:keep-all;" + FONT + "font-size:14px", text);
    mount(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  // ------------------------------------------------------------ 시작
  var api = {
    version: VERSION, onGrant: onGrant, can: can, ready: ready, price: price, buy: buy, buyOnce: buyOnce, owned: owned,
    restore: restore, status: status
  };
  try { Object.freeze(api); } catch (e) { /* 얼리지 못해도 괜찮아요 */ }
  w.NcqIap = api;
  // 앱으로 돌아오면 그사이 끝난 결제(현금 결제 승인 등)를 지급하고, 못 받은 상품 정보를 다시 받아요
  // (게임이 NcqIap을 쓰기 시작한 뒤에만, 결제 중에는 하지 않아요)
  d.addEventListener("visibilitychange", function () {
    if (d.visibilityState !== "visible" || !idle()) return;
    if (st.handler && Date.now() - st.recovered > RESUME_GAP) recover(false, false).then(noop, noop);
    if (!st.loaded && st.loadAt) load(false).then(noop, noop);
  });
})(window, document);
