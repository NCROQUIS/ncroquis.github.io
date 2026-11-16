// NcqSave — 엔크로키 공용 저장 모듈 (ncq/save.js): 게임 저장(재화·진행도)과 클라우드 백업
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 AGENTS.md의 '저장 (NcqSave)'에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   <script src="ncq/save.js"></script>     index.html의 <head> (빌드 도구 없이)
//   import "../ncq/save.js";                  Vite 같은 빌드 도구를 쓰면 시작 파일 맨 위 (그다음 window.NcqSave)
//
//   NcqSave.init({id: "hole-cup", data: {coins: 0, stage: 1}})   게임을 시작할 때 한 번 (id는 코드네임, data는 처음 값)
//   NcqSave.get()                  지금 저장 (사본). NcqSave.get("coins")처럼 한 칸만도
//   NcqSave.update(function (s) { s.coins -= 100; s.stage += 1; })   고치고 바로 기기에 저장 → 잠시 뒤 클라우드 백업
//   NcqSave.grant(id, {coins: 500})   보상 한 번만 넣기 (결제·초대·쿠폰): 같은 id는 두 번 넣지 않고 바로 클라우드 백업.
//                                  숫자는 더하고 그 밖의 값은 바꿔요 ("items.sword": true처럼 점으로 안쪽 칸도)
//   NcqSave.has(id)                그 보상을 넣었는지
//   await NcqSave.ready()          클라우드에서 저장을 받아 맞출 때까지 (최대 8초, 게임은 기다리지 않아도 돼요)
//   NcqSave.onChange(fn)           저장이 바뀌면 fn(저장, {source}) — source가 "cloud"면 다른 기기의 저장을 받은 거예요
//   await NcqSave.backup()         지금 바로 클라우드에 올리기 → {ok, code}
//   NcqSave.saveId()               이 저장의 ID (NcqInvite.onGrant의 saveId)
//   NcqSave.reset()                처음부터 (테스트용 초기화 버튼, 클라우드에도 처음 상태를 올려요)
//   NcqSave.status()               지금 상태 (확인용)
//
//   값 하나씩 (재화·주요 수치): 바뀌면 화면에 바로, 저장·클라우드 백업도 저절로 (init 전에 만들어 둬도 돼요)
//   const coins = NcqSave.int("coins", 0)      정수. NcqSave.num(실수)·bool(참거짓)·str(글자)도 같아요 ("wallet.gems"처럼 안쪽 칸도)
//   coins.value / coins.get()        지금 값          coins.set(100) / coins.value = 100   바꾸고 저장
//   coins.add(50)                    더하기 (빼기는 음수)    if (coins.spend(30)) buy()   모자라면 false, 있으면 빼고 true
//   coins.on(function (v) { ... })   지금 값으로 한 번, 바뀔 때마다 다시 (다른 기기의 저장을 받았을 때도) → 끄는 함수
//   coins.bind(el, NcqLang.num)      요소 글자를 늘 그 값으로 (format은 선택)
//
// 보호: 저장은 기기에 그대로 적지 않고 읽기 어렵게 바꿔 서명해서, 저장 파일을 손으로 고치면 알아채요 (status().tamper,
// window의 ncq-save-tamper 이벤트, 지표). 앱이 돌아가는 동안에도 값은 메모리에 그대로 두지 않아서(코인 500을 찾아 바꾸는
// 메모리 검색 도구에 잡히지 않게) 게임의 진짜 값은 NcqSave에서 읽어요. 막지는 않고 알리기만 해요 (게임 버그로 값을 잃지 않게).
//
// 저장은 늘 기기(localStorage)에 바로 해요. 클라우드 백업은 출시 빌드가 켜 줄 때만(window.NCQ.NCQ_SAVE와 NcqAuth) 해요:
// 토스는 토스 계정, 구글플레이는 Play 게임즈로 사용자를 알아서 다시 설치하거나 기기를 바꿔도 저장이 돌아와요.
// 클라우드에 올리는 건 결제·보상(grant)·초기화·backup()이면 바로, 보통 저장(update·값 하나씩)은 마지막 백업 뒤 하루가
// 지났을 때만이에요 (서버 쓰기를 줄여요. 앱을 열 때 클라우드 저장을 받아 보는 건 그대로).
// 인터넷이 없으면 기기에 남겨 두고 다시 연결되면 올려요. 두 기기에서 따로 바뀌었으면 더 최근 저장을 고르고, 다른 쪽에만 있는
// 보상(grant)을 다시 더해요 (init의 merge로 직접 합칠 수도 있어요). 개발 중(npm run dev)에는 기기에만 저장해요.
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION = 3;
  if (w.NcqSave && w.NcqSave.version >= VERSION) return; // 두 번 불러도 한 번만
  var PREFIX = "ncq:save:";
  var MAX_BYTES = 200000; // 클라우드에 올리는 저장 크기 (서버 ncqsave.MAX_SAVE와 같게)
  var PUSH_WAIT = 2000; // 올릴 때가 되면 이만큼 더 모아서 올려요
  var BACKUP_EVERY = 24 * 60 * 60 * 1000; // 보통 저장(update·값 하나씩)은 마지막 클라우드 백업 뒤 이만큼 지났을 때만 올려요 (하루 한 번)
  var RETRY = [5000, 30000, 120000, 600000]; // 백업이 실패하면 다시 해 볼 때까지
  var READY_WAIT = 8000;
  var ID_RE = /^[A-Za-z0-9_-]{1,60}$/;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  var STORE_TAG = "ncq2."; // 기기 저장 모양: ncq2.<서명>.<읽기 어렵게 바꾼 저장 (base64)>
  var MIX = "ncq-save:v2:"; // 읽기 어렵게 바꿀 때 섞는 글자 (비밀은 아니에요. 손으로 고치기 어렵게만)

  var cfg = null; // {id, data(처음 값), merge}
  var rec = null; // {v, sid, rev, base, dirty, at, owner, rc, up, hot} — 저장 내용(data)은 vault에 감춰 둬요
  //                  up: 마지막으로 클라우드에 올렸거나 받은 때, hot: 바로 올려야 하는 변경(grant·reset·backup)이 있음
  var vault = {}; // 맨 위 칸 → 이 세션 열쇠로 바꾼 글자 (메모리에 값이 그대로 있지 않게)
  var watchers = []; // 값 하나씩 (int·num·bool·str)의 on: {path, start, fn, last}
  var tamper = {storage: 0, at: 0};
  var memory = {}; // localStorage를 못 쓰는 곳 (앱을 닫으면 없어져요)
  var listeners = [];
  var warned = {};
  var cloud = {player: null, identity: null, checked: null, at: 0, error: null, restored: false};
  var syncing = null, timer = null, retryTimer = null, retries = 0;

  function warn(key, text, e) {
    if (warned[key]) return;
    warned[key] = true;
    try { if (w.console) w.console.warn("[NcqSave] " + text, e || ""); } catch (x) { /* 무시 */ }
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  // ------------------------------------------------------------ 보호 (읽기 어렵게 바꾸기·서명)
  function h32(text, seed) {
    var h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0, i;
    for (i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }
  function stream(seed) { // xorshift32
    var x = (seed >>> 0) || 0x9e3779b9;
    return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  }
  function codes(list) { // 숫자 목록 → 글자 (긴 저장도 한 번에 넘치지 않게 나눠서)
    var out = "", i;
    for (i = 0; i < list.length; i += 8192) out += String.fromCharCode.apply(null, list.slice(i, i + 8192));
    return out;
  }
  var SESSION = (function () {
    try { if (w.crypto && w.crypto.getRandomValues) return w.crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { /* 아래 */ }
    return Math.floor(Math.random() * 4294967296);
  })();
  function seal(k, value) { // 메모리용: 이 세션에만 쓰는 열쇠로 글자마다 바꿔요
    var text = JSON.stringify(value), next = stream(SESSION ^ h32(k)), list = new Array(text.length), i;
    for (i = 0; i < text.length; i++) list[i] = text.charCodeAt(i) ^ (next() & 0xffff);
    return codes(list);
  }
  function unseal(k, text) {
    var next = stream(SESSION ^ h32(k)), list = new Array(text.length), i;
    for (i = 0; i < text.length; i++) list[i] = text.charCodeAt(i) ^ (next() & 0xffff);
    return JSON.parse(codes(list));
  }
  function setData(data) { // 저장 내용을 메모리에 감춰 두기
    var out = {};
    Object.keys(data).forEach(function (k) { if (data[k] !== undefined) out[k] = seal(k, data[k]); });
    vault = out;
  }
  function getData() { // 감춘 저장 내용 → 보통 값 (새 사본)
    var out = {};
    Object.keys(vault).forEach(function (k) { out[k] = unseal(k, vault[k]); });
    return out;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function toB64(bin) {
    var out = "", i, n;
    for (i = 0; i < bin.length; i += 3) {
      n = (bin.charCodeAt(i) << 16) | ((bin.charCodeAt(i + 1) || 0) << 8) | (bin.charCodeAt(i + 2) || 0);
      out += B64.charAt(n >>> 18 & 63) + B64.charAt(n >>> 12 & 63)
        + (i + 1 < bin.length ? B64.charAt(n >>> 6 & 63) : "=") + (i + 2 < bin.length ? B64.charAt(n & 63) : "=");
    }
    return out;
  }
  function fromB64(text) {
    if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(text) || text.length % 4) throw new Error("base64");
    var list = [], i, n, a, b, c, d;
    for (i = 0; i < text.length; i += 4) {
      a = B64.indexOf(text.charAt(i)); b = B64.indexOf(text.charAt(i + 1));
      c = text.charAt(i + 2) === "=" ? 0 : B64.indexOf(text.charAt(i + 2));
      d = text.charAt(i + 3) === "=" ? 0 : B64.indexOf(text.charAt(i + 3));
      n = (a << 18) | (b << 12) | (c << 6) | d;
      list.push(n >>> 16 & 255);
      if (text.charAt(i + 2) !== "=") list.push(n >>> 8 & 255);
      if (text.charAt(i + 3) !== "=") list.push(n & 255);
    }
    return codes(list);
  }
  function sign(json, id) { return h32(json, h32(MIX + "sig:" + id)).toString(36); }
  function encodeStore(json, id) { // 기기 저장: UTF-8 → 열쇠로 바꾸기 → base64, 앞에 서명
    var bin = unescape(encodeURIComponent(json)), next = stream(h32(MIX + id)), list = new Array(bin.length), i;
    for (i = 0; i < bin.length; i++) list[i] = bin.charCodeAt(i) ^ (next() & 255);
    return STORE_TAG + sign(json, id) + "." + toB64(codes(list));
  }
  function decodeStore(text, id) { // → {json, signed} (서명이 맞는지). 모양이 틀리면 오류
    var dot = text.indexOf(".", STORE_TAG.length);
    if (dot < 0) throw new Error("shape");
    var bin = fromB64(text.slice(dot + 1)), next = stream(h32(MIX + id)), list = new Array(bin.length), i;
    for (i = 0; i < bin.length; i++) list[i] = bin.charCodeAt(i) ^ (next() & 255);
    var json = decodeURIComponent(escape(codes(list)));
    return {json: json, signed: text.slice(STORE_TAG.length, dot) === sign(json, id)};
  }
  function noticeTamper(where) {
    tamper.storage += 1;
    tamper.at = Date.now();
    warn("tamper", "기기 저장이 바깥에서 바뀐 것 같아요 (서명이 맞지 않아요). 그대로 쓰고 기록만 남겨요.");
    try { if (w.NcqMetrics && w.NcqMetrics._tool) w.NcqMetrics._tool("save_tamper", {where: where}); } catch (e) { /* 무시 */ }
    try { w.dispatchEvent(new w.CustomEvent("ncq-save-tamper", {detail: {where: where}})); } catch (e) { /* 오래된 WebView */ }
  }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function newId() {
    var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", out = "", i;
    var bytes = null;
    try { if (w.crypto && w.crypto.getRandomValues) bytes = w.crypto.getRandomValues(new Uint8Array(24)); } catch (e) { bytes = null; }
    for (i = 0; i < 24; i++) out += abc.charAt((bytes ? bytes[i] : Math.floor(Math.random() * 256)) % abc.length);
    return out;
  }
  function key(suffix) { return PREFIX + cfg.id + (suffix || ""); }
  function readRaw(k) {
    try { return w.localStorage.getItem(k); } catch (e) { return own(memory, k) ? memory[k] : null; }
  }
  function writeRaw(k, text) {
    try { w.localStorage.setItem(k, text); delete memory[k]; return true; } catch (e) {
      memory[k] = text;
      warn("storage", "기기에 저장하지 못했어요 (저장 공간이 없거나 막혀 있어요). 앱을 닫으면 없어질 수 있어요.", e);
      return false;
    }
  }
  function fill(data) {
    var out = isObj(data) ? data : {};
    Object.keys(cfg.data).forEach(function (k) { if (!own(out, k)) out[k] = clone(cfg.data[k]); });
    return out;
  }
  function fresh(owner) {
    return {v: 1, sid: newId(), rev: 0, base: 0, dirty: false, at: 0, owner: owner || null, data: fill(clone(cfg.data)), rc: {},
      up: 0, hot: false};
  }
  function load() {
    var raw = readRaw(key()), r = null;
    if (!raw) return null;
    try {
      if (raw.indexOf(STORE_TAG) === 0) {
        var got = decodeStore(raw, cfg.id);
        r = JSON.parse(got.json);
        if (!got.signed) noticeTamper("storage");
      } else {
        r = JSON.parse(raw); // 예전(1판) 모양: 다음 저장부터 새 모양으로
      }
    } catch (e) { r = null; }
    if (!isObj(r) || r.v !== 1 || typeof r.sid !== "string" || !isObj(r.data)) {
      writeRaw(key(":broken"), raw); // 읽지 못한 저장은 지우지 않고 따로 둬요
      warn("broken", "기기 저장을 읽지 못해 처음부터 시작해요 (예전 저장은 " + key(":broken") + "에 남겨 뒀어요).");
      return null;
    }
    r.rc = isObj(r.rc) ? r.rc : {};
    r.rev = r.rev | 0; r.base = r.base | 0; r.at = +r.at || 0; r.dirty = !!r.dirty; r.owner = r.owner || null;
    r.up = +r.up || 0; r.hot = !!r.hot;
    r.data = fill(r.data);
    return r;
  }
  function use(r) { // 읽은 기록을 지금 저장으로: 내용은 메모리에 감춰 두고 나머지만 rec에
    var data = r.data;
    delete r.data;
    rec = r;
    setData(data);
  }
  function plain() { // 기기·클라우드에 적을 모양 (1판과 같아요)
    return {v: 1, sid: rec.sid, rev: rec.rev, base: rec.base, dirty: rec.dirty, at: rec.at, owner: rec.owner,
      data: getData(), rc: rec.rc, up: rec.up, hot: rec.hot};
  }
  function sealed(r) { // 기기에 적을 글자 (UTF-8로 못 바꾸는 글자가 있으면 예전처럼 그대로)
    var json = JSON.stringify(r);
    try { return encodeStore(json, cfg.id); } catch (e) {
      warn("encode", "저장에 쓸 수 없는 글자가 있어 기기에 그대로 적어요.", e);
      return json;
    }
  }
  function store() { return writeRaw(key(), sealed(plain())); }
  function emit(source) {
    var data = getData(), info = {source: source};
    listeners.slice().forEach(function (fn) {
      try { fn(clone(data), info); } catch (e) { warn("listener", "onChange 함수에서 오류가 났어요.", e); }
    });
    notifyValues(info);
    try { w.dispatchEvent(new w.CustomEvent("ncq-save", {detail: info})); } catch (e) { /* 오래된 WebView */ }
  }
  function ensure() {
    if (!cfg) {
      warn("init", "NcqSave.init({id, data})를 먼저 불러 주세요. 지금은 이름 'game'으로 저장해요.");
      init({});
    }
  }

  // ------------------------------------------------------------ 기기 저장
  function init(opts) {
    opts = opts || {};
    var id = ID_RE.test(String(opts.id || "")) ? String(opts.id) : "game";
    if (opts.id && id !== String(opts.id)) warn("id", "id는 영문·숫자·_·- 60자까지예요. 'game'으로 저장해요.");
    if (cfg && cfg.id === id) {
      if (isObj(opts.data)) { cfg.data = clone(opts.data); setData(fill(getData())); }
      if (typeof opts.merge === "function") cfg.merge = opts.merge;
      return api;
    }
    cfg = {id: id, data: isObj(opts.data) ? clone(opts.data) : {}, merge: typeof opts.merge === "function" ? opts.merge : null};
    use(load() || fresh());
    cloud.checked = null;
    store();
    notifyValues({source: "init"}); // init 전에 만든 값(on·bind)에 지금 값을 알려요
    if (cloudOn()) schedule(0);
    return api;
  }
  function walk(path, make, root) {
    var parts = String(path).split("."), cur = root, i;
    for (i = 0; i < parts.length - 1; i++) {
      if (!isObj(cur[parts[i]])) {
        if (!make) return null;
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    return [cur, parts[parts.length - 1]];
  }
  function get(path) {
    ensure();
    if (path === undefined || path === null || path === "") return getData();
    var top = String(path).split(".")[0];
    if (!own(vault, top)) return undefined;
    var holder = {};
    holder[top] = unseal(top, vault[top]); // 그 칸만 꺼내요 (자주 읽어도 가볍게)
    var at = walk(path, false, holder);
    return at && own(at[0], at[1]) ? at[0][at[1]] : undefined;
  }
  function apply(data, change) {
    Object.keys(change).forEach(function (path) {
      var v = change[path], at = walk(path, true, data);
      if (typeof v === "number" && isFinite(v)) at[0][at[1]] = (typeof at[0][at[1]] === "number" ? at[0][at[1]] : 0) + v;
      else at[0][at[1]] = clone(v);
    });
  }
  function commit(data, source) {
    var size = JSON.stringify(data).length;
    if (size > MAX_BYTES) warn("size", "저장이 너무 커서(" + size + "자) 클라우드에 올리지 못해요. " + MAX_BYTES + "자 아래로 줄여 주세요.");
    setData(data);
    rec.rev += 1;
    rec.at = Date.now();
    rec.dirty = true;
    var ok = store();
    emit(source);
    return ok;
  }
  function update(fn) {
    ensure();
    if (typeof fn !== "function") return false;
    var draft = getData(), out;
    try { out = fn(draft); } catch (e) { warn("update", "update 함수에서 오류가 나서 저장하지 않았어요.", e); return false; }
    if (out === false) return false;
    if (isObj(out) && out !== draft) draft = out;
    var ok = commit(fill(draft), "update");
    if (due()) schedule(PUSH_WAIT); // 보통 저장은 하루 한 번만 클라우드에 (기기에는 바로)
    return ok;
  }
  function grant(id, change) {
    ensure();
    id = id === undefined || id === null ? "" : String(id);
    if (id.length > 200) { warn("grantId", "보상 id는 200자까지예요."); return false; }
    if (id && own(rec.rc, id)) return true; // 이미 넣은 보상
    var draft = getData(), out;
    if (typeof change === "function") {
      try { out = change(draft); } catch (e) { warn("grant", "grant 함수에서 오류가 나서 넣지 않았어요.", e); return false; }
      if (out === false) return false;
      if (isObj(out) && out !== draft) draft = out;
    } else if (isObj(change)) {
      apply(draft, change);
    } else {
      return false;
    }
    if (id) rec.rc[id] = {t: Date.now(), a: isObj(change) ? clone(change) : 0}; // a: 다른 기기 저장과 합칠 때 다시 더할 값
    rec.hot = true; // 결제·보상은 바로 올려요 (앱이 꺼져도 다음에 열면 올려요)
    var ok = commit(fill(draft), "grant");
    schedule(0);
    return ok;
  }
  function has(id) { ensure(); return own(rec.rc, String(id)); }
  function reset() {
    ensure();
    var base = rec.base, owner = rec.owner, start = fresh(owner);
    use(start);
    rec.base = base;
    rec.hot = true;
    commit(getData(), "reset");
    schedule(0);
    return true;
  }
  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // ------------------------------------------------------------ 클라우드 백업 (출시 빌드의 NcqAuth로)
  function cloudOn() { return !!(cfg && w.NCQ && w.NCQ.NCQ_SAVE && w.NcqAuth && w.NcqAuth.request); }
  function call(method, body) { return w.NcqAuth.request("/save/v1/save", method, body); }
  function parse(remote) {
    try {
      var s = JSON.parse(remote.data);
      if (isObj(s) && isObj(s.data)) return {sid: typeof s.sid === "string" ? s.sid : null, data: s.data,
        rc: isObj(s.rc) ? s.rc : {}, at: +s.at || 0};
    } catch (e) { /* 아래 */ }
    return null;
  }
  function stash(why) { writeRaw(key(":" + why), sealed(plain())); }
  function adopt(remote, theirs, player) {
    if (rec.rev > 0 && rec.owner !== player) stash("before-cloud");
    setData(fill(theirs.data));
    rec.rc = theirs.rc;
    rec.sid = theirs.sid || rec.sid;
    rec.at = theirs.at;
    rec.base = remote.rev;
    rec.owner = player;
    rec.dirty = false;
    rec.hot = false;
    rec.up = Date.now();
    store();
    cloud.restored = true;
    emit("cloud");
    return {ok: true, restored: true};
  }
  function merge(remote, theirs, player) {
    stash("before-merge");
    var mine = rec.owner === player, data, rc = {}, k;
    var local = {data: getData(), rc: rec.rc, at: rec.at};
    for (k in theirs.rc) if (own(theirs.rc, k)) rc[k] = theirs.rc[k];
    for (k in local.rc) if (own(local.rc, k)) rc[k] = local.rc[k];
    if (cfg.merge) {
      try { data = cfg.merge(clone(local.data), clone(theirs.data), {sameAccount: mine}); } catch (e) {
        warn("merge", "merge 함수에서 오류가 나서 기본 방법으로 합쳤어요.", e);
        data = null;
      }
    }
    if (!isObj(data)) {
      // 같은 계정에서 따로 바뀌었으면 더 최근 저장, 이 기기 저장이 누구 것인지 모르면(처음 연결·다시 설치) 클라우드 저장.
      // 고르지 않은 쪽에만 있는 보상은 다시 더해요 (결제한 코인이 사라지지 않게)
      var pick = mine && local.at >= theirs.at ? local : theirs, other = pick === local ? theirs : local;
      data = clone(pick.data);
      for (k in other.rc) {
        if (own(other.rc, k) && !own(pick.rc, k) && isObj(other.rc[k]) && isObj(other.rc[k].a)) apply(data, other.rc[k].a);
      }
    }
    rec.rc = rc;
    rec.base = remote.rev;
    rec.owner = player;
    rec.sid = mine ? rec.sid : (theirs.sid || rec.sid);
    commit(fill(data), "cloud");
    cloud.restored = true;
  }
  function settle(remote, player, depth) {
    if (depth > 3) return Promise.reject(Object.assign(new Error("conflict"), {code: "conflict"}));
    var mine = rec.owner === player;
    if (!remote) {
      rec.owner = player;
      if (rec.rev === 0 && !rec.dirty) { store(); return Promise.resolve({ok: true, restored: false}); }
      rec.base = 0;
      return push(player, depth);
    }
    if (remote.rev === rec.base && mine) return rec.dirty && due() ? push(player, depth) : Promise.resolve({ok: true, restored: false});
    var theirs = parse(remote);
    if (!theirs) return Promise.reject(Object.assign(new Error("bad_save"), {code: "bad_save"}));
    if (!rec.dirty || rec.rev === 0) return Promise.resolve(adopt(remote, theirs, player));
    merge(remote, theirs, player);
    return push(player, depth).then(function (r) { r.restored = true; return r; });
  }
  function push(player, depth) {
    var body = JSON.stringify({sid: rec.sid, data: getData(), rc: rec.rc, at: rec.at});
    if (body.length > MAX_BYTES) return Promise.reject(Object.assign(new Error("too_large"), {code: "too_large"}));
    var sent = rec.rev;
    return call("POST", {base: rec.base, save: body}).then(function (out) {
      if (out.conflict) return settle(out.save, player, depth + 1);
      rec.base = out.rev;
      rec.owner = player;
      rec.up = Date.now();
      if (rec.rev === sent) { rec.dirty = false; rec.hot = false; }
      store();
      cloud.at = Date.now();
      if (rec.dirty && due()) schedule(PUSH_WAIT); // 올리는 동안 grant가 왔으면 이어서
      return {ok: true, restored: false};
    });
  }
  function sync() {
    if (!cloudOn()) return Promise.resolve({ok: false, code: "disabled"});
    if (syncing) return syncing;
    syncing = w.NcqAuth.ready().then(function (me) {
      var player = me && me.player;
      if (!player) throw Object.assign(new Error("no_player"), {code: "no_player"});
      cloud.player = player;
      cloud.identity = me.identity || null;
      if (rec.owner && rec.owner !== player) { // 다른 계정: 이 기기 저장은 따로 두고 그 계정의 저장으로
        stash("account-" + rec.owner);
        use(fresh(null));
        cloud.checked = null;
        store();
        emit("account");
      }
      if (cloud.checked === player) return rec.dirty && due() ? push(player, 0) : {ok: true, restored: false};
      return call("GET").then(function (out) {
        return settle(out.save || null, player, 0);
      }).then(function (r) { cloud.checked = player; return r; });
    }).then(function (r) {
      cloud.error = null;
      retries = 0;
      return r;
    }, function (e) {
      cloud.error = (e && e.code) || "error";
      if (cloud.error === "too_large") warn("size", "저장이 너무 커서 클라우드에 올리지 못했어요.");
      else if (rec.dirty) retry();
      return {ok: false, code: cloud.error};
    }).then(function (r) { syncing = null; return r; });
    return syncing;
  }
  function retry() {
    if (retryTimer) return;
    var wait = RETRY[Math.min(retries, RETRY.length - 1)];
    retries += 1;
    retryTimer = w.setTimeout(function () { retryTimer = null; if (rec.dirty) sync(); }, wait);
  }
  function schedule(ms) {
    if (!cloudOn()) return;
    if (timer) w.clearTimeout(timer);
    timer = w.setTimeout(function () { timer = null; sync(); }, ms);
  }
  function due() { // 클라우드에 올릴 때가 됐는지: 바로 올릴 변경, 처음 백업, 마지막 백업 뒤 하루 (시계를 크게 돌려도)
    if (!rec) return false;
    if (rec.hot || !rec.up) return true;
    return Math.abs(Date.now() - rec.up) >= BACKUP_EVERY;
  }
  function backup() {
    // NcqIap also calls backup after a server-wallet purchase. A records-only game
    // has no snapshot to force, and its records must keep their daily schedule.
    if (!cfg && recordStores && Object.keys(recordStores).length) return Promise.resolve({ok: true});
    ensure();
    if (rec.dirty && !rec.hot) { rec.hot = true; store(); } // 게임이 직접 부르면 시간과 상관없이 올려요
    if (timer) { w.clearTimeout(timer); timer = null; }
    return sync().then(function (r) { return r.ok ? {ok: true} : {ok: false, code: r.code}; });
  }
  function ready() {
    ensure();
    if (!cloudOn()) return Promise.resolve({cloud: false, ok: true, restored: false});
    var wait = new Promise(function (resolve) {
      w.setTimeout(function () { resolve({ok: false, code: "timeout"}); }, READY_WAIT);
    });
    return Promise.race([sync(), wait]).then(function (r) {
      return {cloud: true, ok: !!r.ok, restored: cloud.restored, code: r.code};
    });
  }
  function status() {
    ensure();
    return {version: VERSION, id: cfg.id, saveId: rec.sid, rev: rec.rev, dirty: rec.dirty, at: rec.at,
      receipts: Object.keys(rec.rc).length, tamper: {storage: tamper.storage, at: tamper.at},
      cloud: {enabled: cloudOn(), player: cloud.player, identity: cloud.identity, base: rec.base, at: cloud.at,
        error: cloud.error, busy: !!syncing, restored: cloud.restored, backedUp: rec.up,
        next: rec.dirty ? (due() ? 0 : rec.up + BACKUP_EVERY) : null}};
  }

  try {
    w.addEventListener("storage", function (e) { // 같은 게임을 연 다른 탭이 저장했어요
      if (!cfg || e.key !== key()) return;
      var r = load();
      if (r) { use(r); emit("other-tab"); }
    });
    w.addEventListener("online", function () { if (cfg && rec.dirty && due()) sync(); });
    var d = w.document;
    if (d) d.addEventListener("visibilitychange", function () {
      if (cfg && d.visibilityState === "hidden" && rec.dirty && due()) { if (timer) { w.clearTimeout(timer); timer = null; } sync(); }
    });
  } catch (e) { /* 이벤트가 없는 곳 */ }

  // ------------------------------------------------------------ 값 하나씩 (재화·주요 수치)
  var KINDS = {
    int: function (v, start) { v = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return isFinite(v) ? Math.trunc(v) : start; },
    num: function (v, start) { v = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return isFinite(v) ? v : start; },
    bool: function (v) { return !!v; },
    str: function (v, start) { return v === undefined || v === null ? start : String(v); }
  };
  function readValue(kind, path, start) {
    if (!cfg) return start; // init 전에는 처음 값 (init 때 on으로 다시 알려요)
    var v = get(path);
    return v === undefined ? start : KINDS[kind](v, start);
  }
  function notifyValues(info) {
    watchers.slice().forEach(function (it) {
      var v = readValue(it.kind, it.path, it.start), mark = h32(JSON.stringify(v));
      if (mark === it.last) return;
      it.last = mark;
      try { it.fn(v, info); } catch (e) { warn("value", "값의 on 함수에서 오류가 났어요.", e); }
    });
  }
  function value(kind, path, start) {
    path = String(path || "");
    if (!path || path.split(".").some(function (p) { return !p; })) {
      warn("path:" + path, "값 이름이 비었어요: NcqSave." + kind + '("coins", 0)처럼 불러요.');
    }
    start = KINDS[kind](start, kind === "str" ? "" : kind === "bool" ? false : 0);
    var numeric = kind === "int" || kind === "num";
    function read() { return readValue(kind, path, start); }
    function write(v) {
      ensure();
      v = KINDS[kind](v, read());
      if (read() === v) return true;
      var done = false;
      update(function (s) { var at = walk(path, true, s); at[0][at[1]] = v; done = true; });
      return done; // 기기에 못 적어도(저장 공간 없음) 값은 바뀌었어요
    }
    function change(n, needEnough) {
      ensure();
      n = Number(n);
      if (!numeric || !isFinite(n)) return false;
      if (kind === "int") n = Math.trunc(n);
      var done = false;
      update(function (s) {
        var at = walk(path, true, s), cur = own(at[0], at[1]) ? KINDS[kind](at[0][at[1]], start) : start;
        if (needEnough && (n < 0 || cur < n)) return false;
        at[0][at[1]] = KINDS[kind](needEnough ? cur - n : cur + n, start);
        done = true;
      });
      return done;
    }
    function on(fn) {
      if (typeof fn !== "function") return function () {};
      var it = {kind: kind, path: path, start: start, fn: fn, last: null};
      watchers.push(it);
      if (cfg) notifyValues({source: "on"}); // 지금 값으로 한 번 (init 전이면 init 때)
      return function () { watchers = watchers.filter(function (x) { return x !== it; }); };
    }
    function bind(target, format) {
      return on(function (v) {
        var text = typeof format === "function" ? format(v) : String(v);
        if (typeof target === "function") target(text, v);
        else if (target && "textContent" in target) target.textContent = text;
      });
    }
    var h = {kind: kind, path: path, get: read, set: write, on: on, bind: bind};
    if (numeric) {
      h.add = function (n) { return change(n, false); };
      h.spend = function (n) { return change(n, true); };
    }
    Object.defineProperty(h, "value", {get: read, set: write, enumerable: true});
    return Object.freeze(h);
  }

  // ------------------------------------------------------------ 계정별 기록: 로컬 즉시, 하루마다 미백업 건만 추가
  var recordStores = {};
  function records(options) {
    options = options || {};
    var game = options.id || (cfg && cfg.id), name = options.collection, player = options.player;
    if (!ID_RE.test(game || "") || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(name || "")
        || typeof player !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(player)) throw new Error("invalid_record_scope");
    var prefix = PREFIX + game + ":records:" + name + ":" + player + ":";
    if (recordStores[prefix]) return recordStores[prefix];
    var path = "/save/v1/records/" + name, callbacks = [], busy = null, checked = false, closed = false;
    var wake = null, attempts = 0, failure = null;
    function read(k) {
      var raw = own(memory, k) ? memory[k] : readRaw(k);
      if (!raw) return null;
      try {
        var decoded = decodeStore(raw, prefix);
        if (!decoded.signed) noticeTamper("records");
        return JSON.parse(decoded.json);
      } catch (e) { failure = "bad_local_record"; return null; }
    }
    function write(k, value) {
      var ok = writeRaw(k, encodeStore(JSON.stringify(value), prefix));
      if (!ok) failure = "storage_full";
      return ok;
    }
    function meta() { return read(prefix + "meta") || {cursor: 0, backedUpAt: 0, uploading: false}; }
    function setMeta(values) {
      var next = meta();
      Object.keys(values).forEach(function (key) { next[key] = values[key]; });
      return write(prefix + "meta", next);
    }
    function itemKey(id) { return prefix + "item:" + encodeURIComponent(id); }
    function entries() {
      var keys = Object.keys(memory), seen = {};
      try { for (var i = 0; i < w.localStorage.length; i++) keys.push(w.localStorage.key(i)); } catch (e) { /* memory */ }
      return keys.filter(function (key) {
        if (!key || key.indexOf(prefix + "item:") !== 0 || own(seen, key)) return false;
        seen[key] = true; return true;
      })
        .map(read).filter(function (item) { return item && typeof item.id === "string" && isObj(item.data); });
    }
    function pending() { return entries().filter(function (item) { return !item.backed; }); }
    function enabled() {
      var auth = w.NCQ && w.NCQ.NCQ_AUTH;
      return !closed && options.cloud !== false && !!(w.NCQ && w.NCQ.NCQ_SAVE && w.NcqAuth && w.NcqAuth.request)
        && (!auth || auth.game === game);
    }
    function due() {
      var state = meta();
      return state.uploading || !state.backedUpAt || Math.abs(Date.now() - state.backedUpAt) >= BACKUP_EVERY;
    }
    function emit(source) {
      callbacks.slice().forEach(function (fn) { try { fn({source: source}); } catch (e) { warn("records-listener", "기록 변경 알림에서 오류가 났어요.", e); } });
    }
    function later(ms) {
      if (wake) w.clearTimeout(wake);
      if (enabled()) wake = w.setTimeout(function () { wake = null; syncRecords(); }, ms);
    }
    function bytes(value) { return unescape(encodeURIComponent(JSON.stringify(value))).length; }
    function add(id, data) {
      if (closed) return false;
      try {
        if (typeof id !== "string" || !id.length || id.length > 200 || !isObj(data)) throw new Error("invalid_record");
        data = clone(data);
        if (!isObj(data)) throw new Error("invalid_record");
        if (bytes(data) > 32000) throw new Error("record_too_large");
        if (read(itemKey(id))) return true; // 최초 기록을 보존한다. 수정 기록은 새 ID를 사용한다.
        var ok = write(itemKey(id), {id: id, data: clone(data), backed: false});
        emit("local");
        later(PUSH_WAIT);
        return ok;
      } catch (e) { failure = e.message || "invalid_record"; return false; }
    }
    async function request(method, body, cursor) {
      var me = await w.NcqAuth.ready();
      if (closed || me.player !== player) throw Object.assign(new Error("account_changed"), {code: "account_changed"});
      // The auth module binds both its first request and token refresh to this account.
      var out = await w.NcqAuth.request(path + (cursor === undefined ? "" : "?after=" + cursor), method, body, player);
      if (closed) throw Object.assign(new Error("closed"), {code: "closed"});
      if (!out || out.ok !== true) throw Object.assign(new Error("bad_response"), {code: out && out.code || "bad_response"});
      return out;
    }
    async function pull() {
      var more = true;
      while (more) {
        var before = meta().cursor, out = await request("GET", undefined, before);
        if (!Array.isArray(out.items) || out.items.length > 50 || !Number.isSafeInteger(out.cursor)
            || out.cursor < before || (out.hasMore && out.cursor === before)) throw new Error("bad_response");
        var sequence = before;
        out.items.forEach(function (item) {
          if (typeof item.id !== "string" || !item.id.length || item.id.length > 200 || !isObj(item.data)
              || !Number.isSafeInteger(item.sequence) || item.sequence <= sequence) throw new Error("bad_response");
          sequence = item.sequence;
          if (!write(itemKey(item.id), {id: item.id, data: item.data, backed: true})) throw new Error("storage_full");
        });
        if (out.cursor !== sequence) throw new Error("bad_response");
        if (!setMeta({cursor: Math.max(meta().cursor, out.cursor),
          backedUpAt: Math.max(meta().backedUpAt, Number(out.backedUpAt) || 0)})) throw new Error("storage_full");
        if (out.items.length) emit("cloud");
        more = out.hasMore === true;
      }
      checked = true;
    }
    async function pushRecords() {
      if (!setMeta({uploading: true})) throw new Error("storage_full");
      var left = pending();
      while (left.length) {
        var batch = [];
        for (var i = 0; i < left.length && batch.length < 20; i++) {
          var item = {id: left[i].id, data: left[i].data};
          if (batch.length && bytes({items: batch.concat([item])}) > 240000) break;
          batch.push(item);
        }
        var out = await request("POST", {items: batch});
        if (!Array.isArray(out.acknowledged) || batch.some(function (item) { return out.acknowledged.indexOf(item.id) < 0; })) throw new Error("bad_response");
        batch.forEach(function (item) {
          var current = read(itemKey(item.id));
          if (current && !write(itemKey(item.id), {id: current.id, data: current.data, backed: true})) throw new Error("storage_full");
        });
        left = pending();
      }
      if (!setMeta({uploading: false, backedUpAt: Date.now()})) throw new Error("storage_full");
      emit("backup");
    }
    function syncRecords() {
      if (busy) return busy;
      if (!enabled()) return Promise.resolve({ok: false, code: "disabled"});
      if (wake) { w.clearTimeout(wake); wake = null; }
      busy = Promise.resolve().then(async function () {
        if (!checked) await pull();
        if (pending().length && due()) await pushRecords();
        failure = null;
        attempts = 0;
        return {ok: true};
      }).catch(function (e) {
        failure = e.code || e.message || "network";
        attempts += 1;
        if (failure !== "account_changed" && failure !== "closed") later(RETRY[Math.min(attempts - 1, RETRY.length - 1)]);
        return {ok: false, code: failure};
      }).then(function (result) {
        busy = null;
        if (result.ok && pending().length) later(Math.max(PUSH_WAIT, meta().backedUpAt + BACKUP_EVERY - Date.now()));
        return result;
      });
      return busy;
    }
    function onStorage(event) {
      if (event.key === null || (event.key && event.key.indexOf(prefix) === 0)) { emit("other-tab"); later(PUSH_WAIT); }
    }
    function onOnline() { later(0); }
    function onVisibility() { if (!w.document || w.document.visibilityState === "visible") later(0); }
    var handle = Object.freeze({add: add,
      get: function (id) { var item = read(itemKey(id)); return item ? clone(item.data) : undefined; },
      list: function () { return entries().map(function (item) { return {id: item.id, data: clone(item.data)}; }); },
      ready: syncRecords, sync: syncRecords,
      onChange: function (fn) {
        callbacks.push(fn);
        return function () { callbacks = callbacks.filter(function (item) { return item !== fn; }); };
      },
      status: function () { var state = meta(); return {player: player, collection: name, count: entries().length,
        pending: pending().length, backedUpAt: state.backedUpAt, cursor: state.cursor,
        cloud: enabled(), busy: !!busy, error: failure}; },
      dispose: function () {
        closed = true;
        if (wake) w.clearTimeout(wake);
        w.removeEventListener("storage", onStorage);
        w.removeEventListener("online", onOnline);
        if (w.document) w.document.removeEventListener("visibilitychange", onVisibility);
        delete recordStores[prefix];
      }});
    recordStores[prefix] = handle;
    w.addEventListener("storage", onStorage);
    w.addEventListener("online", onOnline);
    if (w.document) w.document.addEventListener("visibilitychange", onVisibility);
    later(0);
    return handle;
  }

  var api = {version: VERSION, records: records, init: init, get: get, update: update, grant: grant, has: has, reset: reset,
    onChange: onChange, ready: ready, backup: backup, saveId: function () { ensure(); return rec.sid; }, status: status,
    int: function (path, start) { return value("int", path, start); },
    num: function (path, start) { return value("num", path, start); },
    bool: function (path, start) { return value("bool", path, start); },
    str: function (path, start) { return value("str", path, start); }};
  w.NcqSave = Object.freeze(api);
})();
