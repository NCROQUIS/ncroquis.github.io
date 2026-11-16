// NcqSound — 엔크로키 공용 소리 모듈 (ncq/sound.js): 배경음·효과음
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 AGENTS.md의 '소리 (NcqSound)'에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   <script src="ncq/sound.js"></script>     index.html의 <head> (빌드 도구 없이)
//   import "../ncq/sound.js";                  Vite 같은 빌드 도구를 쓰면 시작 파일 맨 위 (그다음 window.NcqSound)
//
//   NcqSound.bgm("assets/audio/map.mp3")       배경음 (되풀이). 다른 곡이면 0.8초 동안 바꿔 틀고, 같은 곡이면 그대로
//   NcqSound.bgm(곡, {volume: 0.6, fade: 1.5, loop: false, restart: true})
//                                              곡 음량 0~2 · 바꾸는 시간(초) · 한 번만 · 같은 곡도 처음부터
//   NcqSound.bgm(null)                         배경음 끄기 (fade만큼 천천히) · NcqSound.bgm()은 지금 곡 주소
//   NcqSound.sfx("assets/audio/hit.mp3")       효과음 한 번 ({volume: 0.5, rate: 1.2, loop: true, gap: 0})
//                                              돌려받은 값의 stop()으로 멈춰요 (되풀이 효과음). 못 울리면 null
//   NcqSound.load(["assets/audio/hit.mp3"])    효과음 미리 불러 두기 (약속: 모두 불렀으면 true)
//   NcqSound.enabled("bgm") · NcqSound.enabled("sfx", false)   켬·끔 (설정 화면, 기본 켬, 기기에 저장)
//   NcqSound.volume("bgm") · NcqSound.volume("sfx", 0.5)       음량 0~1 (설정 화면의 슬라이더 값, 기본 1, 기기에 저장)
//   NcqSound.settings() · NcqSound.onChange(fn)  지금 설정 {bgm: {on, volume}, sfx: {on, volume}} · 바뀌면 fn(설정)
//   NcqSound.pause("menu") · NcqSound.resume("menu")   모든 소리를 잠깐 멈추기·다시 (이유마다. 광고는 NcqAds가 "ad"로)
//   NcqSound.context() · NcqSound.output("sfx")  직접 합성하는 게임: 공용 AudioContext와 그 채널 입구(GainNode)
//   NcqSound.level("sfx")                      켬·음량을 합친 소리 크기 0~1 (자기 AudioContext를 그대로 쓰는 게임)
//   NcqSound.state()                           지금 상태 (확인용)
//
// 휴대폰 브라우저는 첫 터치 전에는 소리를 막아요: 그 전에 부른 배경음은 첫 터치 때 시작하고 효과음은 건너뛰어요
// (구글플레이·iOS 앱은 열자마자 나와요). 화면이 가려지면 모든 소리를 멈췄다가 돌아오면 이어서 틀어요.
// 배경음은 <audio>로 흘려 들으며 틀고(긴 곡도 메모리를 적게), 음량은 Web Audio로 맞춰요 (아이폰은 <audio>의 음량을
// 바꿀 수 없어요). 효과음은 짧은 파일을 받아 풀어 둔 뒤(AudioBuffer) 울려요. 음량 슬라이더 값은 귀에 고르게
// 들리도록 제곱해서 써요 (0.5 → 소리 크기 0.25).
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  var VERSION = 1;
  if (w.NcqSound && w.NcqSound.version >= VERSION) return; // 두 번 불러도 한 번만
  var d = w.document;
  var CHANNELS = ["bgm", "sfx"];
  var FADE = 0.8; // 배경음을 바꿔 틀 때 (초)
  var BACK = 0.25; // 멈췄던 배경음을 다시 틀 때 (초)
  var HUSH = 0.06; // 배경음을 끌 때 줄이는 시간 (초): 뚝 끊기는 소리가 나지 않게
  var MAX_VOICES = 24; // 한꺼번에 울리는 효과음 (넘으면 가장 오래된 것부터 멈춰요)
  var GAP = 30; // 같은 효과음이 이보다 가깝게(ms) 또 오면 건너뛰어요 (한꺼번에 여러 번 불러도 소리가 겹쳐 커지지 않게)
  var LATE = 400; // 아직 안 불렸거나 잠금이 풀리는 중인 효과음은 이 시간(ms) 안에 울릴 수 있을 때만 울려요
  var TOUCH = 1000; // 터치(또는 소리 준비)에서 이 시간(ms) 안에 부른 효과음은 잠금이 풀리길 기다려요
  var KEY = "ncq:sound:" + folder(); // 웹 공개는 여러 게임이 같은 주소(ncroquis.github.io)라 게임 폴더마다 따로
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function folder() {
    try {
      var p = String((w.location && w.location.pathname) || "/");
      return p.slice(0, p.lastIndexOf("/") + 1) || "/";
    } catch (e) {
      return "/";
    }
  }

  function noop() {}

  function now() { return new Date().getTime(); }

  function quiet(p) { // 약속(Promise)이 실패해도 조용히
    if (p && typeof p.then === "function") p.then(noop, noop);
  }

  function num(v, lo, hi, dflt) { // 숫자로 (모르는 값은 dflt), lo~hi 안으로
    var n = Number(v);
    if (v === undefined || v === null || v === "" || typeof v === "boolean" || !isFinite(n)) return dflt;
    return n < lo ? lo : (n > hi ? hi : n);
  }

  var warned = {};

  function warn(id, text) {
    if (own(warned, id)) return;
    warned[id] = true;
    try { w.console.warn("[NcqSound] " + text); } catch (e) { /* 콘솔이 없어요 */ }
  }

  // ------------------------------------------------------------ 설정 (기기에 저장)
  var prefs = null;
  var listeners = [];

  function read() {
    if (prefs) return prefs;
    prefs = {bgm: {on: true, volume: 1}, sfx: {on: true, volume: 1}};
    try {
      var raw = JSON.parse(w.localStorage.getItem(KEY) || "null");
      CHANNELS.forEach(function (ch) {
        var r = raw && typeof raw === "object" ? raw[ch] : null;
        if (!r || typeof r !== "object") return;
        if (typeof r.on === "boolean") prefs[ch].on = r.on;
        prefs[ch].volume = num(r.volume, 0, 1, 1);
      });
    } catch (e) { /* 저장소가 막혀 있거나 깨졌으면 기본값 */ }
    return prefs;
  }

  function channel(ch) {
    var c = String(ch === undefined || ch === null ? "" : ch).toLowerCase();
    if (c === "bgm" || c === "sfx") return c;
    warn("ch:" + c, "모르는 채널이에요: " + ch + " (bgm·sfx)");
    return "";
  }

  function settings() {
    var p = read();
    return {bgm: {on: p.bgm.on, volume: p.bgm.volume}, sfx: {on: p.sfx.on, volume: p.sfx.volume}};
  }

  function changed() {
    try { w.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* 이번 실행에만 */ }
    apply();
    var s = settings();
    listeners.slice().forEach(function (fn) {
      try {
        fn(s);
      } catch (e) { // 게임 함수의 오류는 숨기지 않되 소리 모듈은 그대로
        setTimeout(function () { throw e; }, 0);
      }
    });
    try { w.dispatchEvent(new w.CustomEvent("ncq-sound", {detail: s})); } catch (e) { /* 오래된 브라우저 */ }
  }

  function enabled(ch, value) {
    var c = channel(ch);
    if (!c) return false;
    var p = read()[c];
    if (arguments.length > 1 && value !== undefined && p.on !== !!value) {
      p.on = !!value; // 체크 칸의 checked처럼 참·거짓
      changed();
    }
    return p.on;
  }

  function volume(ch, value) {
    var c = channel(ch);
    if (!c) return 0;
    var p = read()[c];
    if (arguments.length > 1 && value !== undefined) {
      var v = num(value, 0, 1, null);
      if (v === null) {
        warn("volume:" + value, "음량은 0~1 숫자예요: " + value);
      } else {
        v = Math.round(v * 1000) / 1000;
        if (v !== p.volume) {
          p.volume = v;
          changed();
        }
      }
    }
    return p.volume;
  }

  function level(ch) { // 켬·음량을 합친 소리 크기: 슬라이더가 귀에 고르게 들리게 제곱해요
    var c = channel(ch);
    if (!c) return 0;
    var p = read()[c];
    return p.on ? p.volume * p.volume : 0;
  }

  function onChange(fn) {
    if (typeof fn !== "function") return noop;
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // ------------------------------------------------------------ 멈춤: 화면이 가려짐·앱이 뒤로 감·이유(광고 등)
  var reasons = Object.create(null);
  var away = {page: false, frozen: false, app: false};

  function hidden() { return !!d && d.visibilityState === "hidden"; }

  function active() {
    return !hidden() && !away.page && !away.frozen && !away.app && !Object.keys(reasons).length;
  }

  function reasonOf(r) { return r === undefined || r === null || r === "" ? "game" : String(r); }

  function pause(reason) {
    var r = reasonOf(reason);
    if (!reasons[r]) {
      reasons[r] = true;
      react();
    }
  }

  function resume(reason) {
    var r = reasonOf(reason);
    if (reasons[r]) {
      delete reasons[r];
      react();
    }
  }

  // ------------------------------------------------------------ Web Audio (처음 쓸 때 만들어요)
  var AC = w.AudioContext || w.webkitAudioContext;
  var ctx = null;
  var master = null; // 멈출 때(가려짐·광고) 줄여요
  var buses = {}; // 채널 입구: 켬·음량
  var made = 0; // 만든 때 (ms)
  var none = false; // Web Audio를 쓸 수 없는 곳
  var resuming = null; // ctx.resume() 약속
  var sleeping = 0; // ctx.suspend() 타이머

  function audio() {
    if (ctx || none) return ctx;
    if (!AC) {
      none = true;
      return null;
    }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = active() ? 1 : 0;
      master.connect(ctx.destination);
      CHANNELS.forEach(function (ch) {
        buses[ch] = ctx.createGain();
        buses[ch].gain.value = level(ch);
        buses[ch].connect(master);
      });
    } catch (e) {
      warn("ctx", "Web Audio를 쓸 수 없어요: " + (e && e.message));
      try { if (ctx && ctx.close) quiet(ctx.close()); } catch (e2) { /* 그래도 괜찮아요 */ }
      ctx = null;
      none = true;
      return null;
    }
    made = now();
    if (ctx.addEventListener) ctx.addEventListener("statechange", onState);
    else ctx.onstatechange = onState;
    if (touching) unlock(); // 터치 안에서 만들었으면 바로 풀어요
    react();
    return ctx;
  }

  function wake(force) { // 다시 돌려요 (터치 안에서는 force: 하던 게 있어도 다시)
    if (!ctx || ctx.state === "running" || ctx.state === "closed" || (resuming && !force)) return;
    var p;
    try {
      p = ctx.resume();
    } catch (e) {
      return;
    }
    if (!p || typeof p.then !== "function") return;
    resuming = p;
    var done = function () {
      if (resuming === p) resuming = null;
      music();
    };
    p.then(done, done);
  }

  function sleep() {
    sleeping = 0;
    if (ctx && !active() && ctx.state === "running") quiet(ctx.suspend());
  }

  function unlock() { // 터치 안에서: 돌리고, 오래된 아이폰은 소리 하나를 틀어야 풀려요
    if (!ctx || ctx.state === "running" || !active()) return;
    wake(true);
    try {
      var s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* 그래도 괜찮아요 */ }
  }

  function onState() {
    if (ctx && ctx.state === "running" && !active() && !sleeping) sleeping = setTimeout(sleep, 80);
    music();
  }

  function fadeTo(param, value, secs) {
    try {
      var t = ctx.currentTime;
      var from = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(from, t);
      if (secs > 0) param.linearRampToValueAtTime(value, t + secs);
      else param.setValueAtTime(value, t);
    } catch (e) {
      try { param.value = value; } catch (e2) { /* 그래도 괜찮아요 */ }
    }
  }

  /** 멈출 일·다시 틀 일이 생기면 (가려짐·돌아옴·이유) */
  function react() {
    if (ctx) {
      if (active()) {
        clearTimeout(sleeping);
        sleeping = 0;
        fadeTo(master.gain, 1, 0.03);
        wake(false);
      } else {
        fadeTo(master.gain, 0, 0.02);
        if (!sleeping) sleeping = setTimeout(sleep, 80);
      }
    }
    music();
  }

  /** 설정이 바뀌면: 채널 음량을 맞추고 배경음을 틀거나 멈춰요 */
  function apply() {
    if (ctx) CHANNELS.forEach(function (ch) { fadeTo(buses[ch].gain, level(ch), 0.05); });
    if (cur && !cur.gain) volumeOf(cur);
    music();
  }

  function context() { return audio(); }

  function output(ch) {
    var c = channel(ch);
    return c && audio() ? buses[c] : null;
  }

  // ------------------------------------------------------------ 터치: 휴대폰 브라우저는 사용자가 누른 뒤에야 소리를 내요
  var touched = 0; // 마지막 터치 때 (ms)
  var touching = false; // 지금 터치를 처리하는 중 (게임의 클릭 처리도 이 안이에요)
  var settling = false;

  function activates(e) { // 브라우저가 '사용자가 눌렀다'고 보는 이벤트 (터치는 누를 때가 아니라 뗄 때)
    if (!e || e.isTrusted === false) return false; // 게임이 흉내 낸 이벤트로는 풀어 주지 않아요
    if (e.type === "pointerdown") return e.pointerType === "mouse";
    if (e.type === "pointerup") return e.pointerType !== "mouse";
    if (e.type === "keydown") return e.key !== "Escape";
    return true; // touchend·mousedown·click
  }

  function gesture(e) {
    if (!activates(e)) return;
    touched = now();
    touching = true;
    if (!settling) {
      settling = true;
      setTimeout(function () { // 이 이벤트(와 게임의 처리)가 끝나면
        settling = false;
        touching = false;
      }, 0);
    }
    unlock();
    if (!decks.length) haveDecks(); // 터치 안에서 만들어 깨워 둬요 (아이폰)
    decks.forEach(prime);
    music();
  }

  // ------------------------------------------------------------ 배경음: <audio> 두 개를 번갈아 (바꿀 때 하나는 줄고 하나는 커져요)
  var decks = [];
  var cur = null; // 지금 곡을 트는 것
  var track = null; // 바라는 곡 {src, volume, loop}

  function makeDeck() {
    var el = new w.Audio();
    el.preload = "auto";
    var k = {el: el, gain: null, wired: false, src: "", vol: 1, fade: FADE, started: false, played: false,
             primed: false, pending: 0, token: 0, timer: 0, hush: 0, retiring: false, retired: 0, failed: false};
    el.addEventListener("error", function () {
      if (!k.src || !el.error) return;
      k.failed = true;
      warn("bgm:" + k.src, "배경음 파일을 못 불러왔어요: " + k.src);
    });
    el.addEventListener("ended", function () { // 한 번만 트는 곡이 끝났어요
      if (k === cur && !el.loop) {
        cur = null;
        track = null;
      }
    });
    return k;
  }

  function haveDecks() {
    if (decks.length) return true;
    if (typeof w.Audio !== "function") return false;
    try {
      decks = [makeDeck(), makeDeck()];
    } catch (e) {
      decks = [];
      return false;
    }
    if (touching) decks.forEach(prime);
    return true;
  }

  function prime(k) { // 아이폰은 <audio>마다 사용자가 누를 때 한 번 깨워 둬야 나중에(누르지 않을 때도) 곡을 틀 수 있어요
    if (k.primed || k.played || k.pending || !k.el.paused) return;
    k.primed = true;
    try { k.el.load(); } catch (e) { /* 그래도 괜찮아요 */ }
  }

  function wire(k) { // Web Audio로 이어요 (아이폰에서도 음량을 맞추게). 못 하면 <audio>의 volume으로
    if (k.wired) return;
    k.wired = true;
    var c = audio();
    if (!c) return;
    try {
      var node = c.createMediaElementSource(k.el);
      var g = c.createGain();
      g.gain.value = 0;
      node.connect(g);
      g.connect(buses.bgm);
      k.gain = g;
    } catch (e) {
      k.gain = null;
      warn("wire", "배경음을 Web Audio로 잇지 못했어요: " + (e && e.message));
    }
  }

  function volumeOf(k, v) { // Web Audio가 없을 때: <audio>의 volume (아이폰은 바뀌지 않아요)
    try {
      var x = v === undefined ? k.vol * level("bgm") : v;
      k.el.volume = x < 0 ? 0 : (x > 1 ? 1 : x);
    } catch (e) { /* 그래도 괜찮아요 */ }
  }

  function bgm(src, opts) {
    if (!arguments.length) return track ? track.src : "";
    try {
      var o = opts && typeof opts === "object" ? opts : {};
      var fade = num(o.fade, 0, 10, FADE);
      if (!src) {
        track = null;
        if (cur) retire(cur, fade);
        cur = null;
        return true;
      }
      src = String(src);
      var vol = num(o.volume, 0, 2, 1);
      var loop = o.loop !== false;
      if (cur && cur.src === src && !o.restart && !cur.failed && !cur.el.ended) { // 같은 곡: 그대로 (음량·되풀이만)
        track = {src: src, volume: vol, loop: loop};
        cur.el.loop = loop;
        if (cur.vol !== vol) {
          cur.vol = vol;
          if (!cur.gain) volumeOf(cur);
          else if (cur.started && !cur.el.paused && !cur.hush) fadeTo(cur.gain.gain, vol, Math.min(fade, 1));
        }
        music();
        return true;
      }
      if (!haveDecks()) return false;
      track = {src: src, volume: vol, loop: loop};
      var old = cur;
      cur = null;
      var k = decks[0] === old ? decks[1] : (decks[1] === old ? decks[0] : idle());
      if (old) retire(old, fade);
      stopDeck(k);
      wire(k);
      k.src = src;
      k.vol = vol;
      k.fade = fade;
      k.started = false;
      k.failed = false;
      k.el.loop = loop;
      k.el.src = src;
      cur = k;
      music();
      return true;
    } catch (e) {
      warn("bgm", "배경음을 틀지 못했어요: " + (e && e.message));
      return false;
    }
  }

  function idle() { // 새 곡을 받을 것: 줄고 있지 않은 것, 둘 다 줄고 있으면 먼저 줄기 시작한 것
    var a = decks[0];
    var b = decks[1];
    if (!a.retiring) return a;
    if (!b.retiring) return b;
    return a.retired <= b.retired ? a : b;
  }

  function retire(k, fade) { // 줄이고 멈춰요 (바꿔 틀 때·끌 때). 들리지 않는 곡(꺼 둠·끄는 중·가려짐)은 바로
    if (k.gain && !k.el.paused && !k.hush && fade > 0 && active() && read().bgm.on) {
      clearTimeout(k.hush);
      clearTimeout(k.timer);
      k.hush = 0;
      k.token++; // 기다리던 play()는 그만
      k.retiring = true;
      k.retired = now();
      fadeTo(k.gain.gain, 0, fade);
      k.timer = setTimeout(function () { stopDeck(k); }, fade * 1000 + 50);
    } else {
      stopDeck(k);
    }
  }

  function stopDeck(k) {
    clearTimeout(k.timer);
    clearTimeout(k.hush);
    k.timer = 0;
    k.hush = 0;
    k.retiring = false;
    k.token++;
    try { k.el.pause(); } catch (e) { /* 그래도 괜찮아요 */ }
    if (k.gain) fadeTo(k.gain.gain, 0, 0);
  }

  function wants(k) { return k === cur && !!track && !k.failed && read().bgm.on && active(); }

  /** 지금 곡을 틀거나 멈춰요 (설정·가려짐·잠금이 바뀔 때마다) */
  function music() {
    decks.forEach(function (k) { if (k.retiring && !active()) stopDeck(k); }); // 가려지면 줄던 곡은 바로 멈춰요
    var k = cur;
    if (!k) return;
    if (!wants(k)) {
      hush(k);
      return;
    }
    if (k.hush) { // 끄던 중에 다시 켰어요
      clearTimeout(k.hush);
      k.hush = 0;
      if (k.gain) fadeTo(k.gain.gain, k.vol, BACK);
    }
    if (!k.gain) volumeOf(k);
    if (!k.el.paused || k.pending) return;
    // Web Audio로 이은 곡은 AudioContext가 돌 때만 틀어요 (멈춘 채 틀면 소리 없이 곡만 지나가요). 터치 안에서는 바로 (풀리는 중)
    if (k.gain && ctx.state !== "running" && !touching) return;
    start(k);
  }

  function hush(k) { // 자리를 그대로 두고 멈춰요 (다시 켜면 이어서)
    k.token++;
    if (k.el.paused || k.hush) return;
    if (k.gain && active() && ctx.state === "running") { // 켜 둔 채 끌 때는 살짝 줄인 뒤 (뚝 끊기지 않게)
      fadeTo(k.gain.gain, 0, HUSH);
      k.hush = setTimeout(function () {
        k.hush = 0;
        if (!wants(k)) {
          try { k.el.pause(); } catch (e) { /* 그래도 괜찮아요 */ }
        }
      }, HUSH * 1000 + 40);
    } else {
      try { k.el.pause(); } catch (e) { /* 그래도 괜찮아요 */ }
    }
  }

  function start(k) {
    var first = !k.started;
    var token = ++k.token;
    k.pending = token;
    if (k.gain) fadeTo(k.gain.gain, 0, 0);
    else volumeOf(k);
    var p;
    try {
      p = k.el.play();
    } catch (e) {
      p = Promise.reject(e);
    }
    Promise.resolve(p).then(function () {
      if (k.pending === token) k.pending = 0;
      k.played = true;
      if (token !== k.token) return; // 그사이 바꾸거나 멈췄어요 (멈추는 쪽이 맡아요)
      if (!wants(k)) {
        music();
        return;
      }
      k.started = true;
      if (k.gain) fadeTo(k.gain.gain, k.vol, first ? k.fade : BACK);
    }, function (e) {
      if (k.pending === token) k.pending = 0;
      var name = e && e.name;
      if (name === "NotAllowedError" || name === "AbortError") return; // 터치를 기다리거나(다음 터치에 다시) 곡을 바꿨어요
      if (token === k.token && !k.failed) warn("play:" + k.src, "배경음을 틀지 못했어요: " + k.src + " (" + (name || e) + ")");
    });
  }

  // ------------------------------------------------------------ 효과음: 짧은 파일을 받아 풀어 두고(AudioBuffer) 울려요
  var bank = {}; // 파일 → {buf, wait(약속), failed}
  var voices = []; // 울리는 효과음
  var lastAt = {}; // 파일 → 마지막으로 울린 때 (ms)

  function fetchSound(src) {
    if (own(bank, src)) return bank[src].wait;
    var c = audio();
    if (!c || typeof w.fetch !== "function") return Promise.resolve(null);
    var b = {buf: null, failed: false, wait: null};
    bank[src] = b;
    b.wait = w.fetch(src).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(function (data) {
      return new Promise(function (resolve, reject) {
        var p = c.decodeAudioData(data, resolve, reject); // 오래된 사파리는 약속 없이 콜백만
        if (p && typeof p.then === "function") p.then(resolve, reject);
      });
    }).then(function (buf) {
      b.buf = buf;
      return buf;
    }, function (e) {
      b.failed = true;
      warn("sfx:" + src, "효과음 파일을 못 불러왔어요: " + src + " (" + ((e && e.message) || e) + ")");
      return null;
    });
    return b.wait;
  }

  function load(list) {
    var all = (Array.isArray(list) ? list : [list]).filter(function (s) { return !!s; });
    return Promise.all(all.map(function (s) { return fetchSound(String(s)); })).then(function (bufs) {
      return bufs.every(function (b) { return !!b; });
    }, function () {
      return false;
    });
  }

  function started(c) { // AudioContext가 돌 때까지 (LATE까지만 기다려요)
    if (c.state === "running") return Promise.resolve();
    return new Promise(function (resolve) {
      setTimeout(resolve, LATE);
      if (resuming) resuming.then(resolve, resolve);
    });
  }

  function sfx(src, opts) {
    try {
      if (!src) return null;
      src = String(src);
      var o = opts && typeof opts === "object" ? opts : {};
      if (!read().sfx.on || !active()) return null;
      var c = audio();
      if (!c) return null;
      var t = now();
      if (c.state !== "running" && t - touched > TOUCH && t - made > TOUCH) return null; // 잠겨 있어요 (첫 터치 전)
      var gap = num(o.gap, 0, 60000, GAP);
      if (gap && own(lastAt, src) && t - lastAt[src] < gap) return null;
      var b = own(bank, src) ? bank[src] : null;
      if (b && b.failed) return null;
      lastAt[src] = t;
      var v = {node: null, gain: null, off: false};
      if (b && b.buf && c.state === "running") {
        ring(v, b.buf, o);
      } else { // 아직 안 불렸거나 잠금이 풀리는 중: LATE 안에 울릴 수 있을 때만
        Promise.all([fetchSound(src), started(c)]).then(function (r) {
          if (r[0] && now() - t <= LATE && read().sfx.on && active() && c.state === "running") ring(v, r[0], o);
          else v.off = true;
        });
      }
      return {stop: function (fade) { stopVoice(v, fade); }};
    } catch (e) {
      return null;
    }
  }

  function ring(v, buf, o) {
    if (v.off) return;
    while (voices.length >= MAX_VOICES) stopVoice(voices[0], 0.015); // 가장 오래된 것부터
    var node = ctx.createBufferSource();
    var g = ctx.createGain();
    node.buffer = buf;
    node.loop = !!o.loop;
    var rate = num(o.rate, 0.25, 4, 1);
    if (rate !== 1) node.playbackRate.value = rate;
    g.gain.value = num(o.volume, 0, 2, 1);
    node.connect(g);
    g.connect(buses.sfx);
    v.node = node;
    v.gain = g;
    node.onended = function () {
      forget(v);
      try { g.disconnect(); } catch (e) { /* 이미 떨어졌어요 */ }
    };
    voices.push(v);
    node.start(0);
  }

  function forget(v) {
    var i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }

  function stopVoice(v, fade) { // 멈춰요 (fade초 동안 줄이고)
    if (v.off) return;
    v.off = true;
    forget(v);
    if (!v.node) return; // 아직 울리지 않았으면 울리지 않게만
    var secs = num(fade, 0, 10, 0.03);
    try {
      fadeTo(v.gain.gain, 0, secs);
      v.node.stop(ctx.currentTime + secs + 0.01);
    } catch (e) { /* 이미 멈췄어요 */ }
  }

  // ------------------------------------------------------------ 상태 (확인용)
  function state() {
    var p = settings();
    var k = cur;
    return {
      version: VERSION,
      context: ctx ? ctx.state : (none ? "none" : "idle"),
      active: active(),
      paused: Object.keys(reasons),
      hidden: hidden() || away.page || away.frozen || away.app,
      bgm: {on: p.bgm.on, volume: p.bgm.volume, src: track ? track.src : "",
            playing: !!k && !k.el.paused && !k.hush && !k.pending, time: k ? k.el.currentTime : 0},
      sfx: {on: p.sfx.on, volume: p.sfx.volume, voices: voices.length,
            loaded: Object.keys(bank).filter(function (s) { return !!bank[s].buf; }).length}
    };
  }

  // ------------------------------------------------------------ 시작
  ["pointerdown", "pointerup", "touchend", "mousedown", "keydown", "click"].forEach(function (type) {
    try { w.addEventListener(type, gesture, {capture: true, passive: true}); } catch (e) { /* 그래도 괜찮아요 */ }
  });
  if (d && d.addEventListener) {
    d.addEventListener("visibilitychange", react);
    d.addEventListener("freeze", function () { // 브라우저가 뒤에 있는 페이지를 얼려요
      away.frozen = true;
      react();
    });
    d.addEventListener("resume", function () { // 페이지·앱(Capacitor)이 돌아왔어요
      away.frozen = false;
      away.app = false;
      react();
    });
    d.addEventListener("pause", function (e) { // 앱(Capacitor)이 뒤로 갔어요
      if (e && e.target !== d) return;
      away.app = true;
      react();
    });
  }
  try {
    w.addEventListener("pagehide", function () {
      away.page = true;
      react();
    });
    w.addEventListener("pageshow", function () {
      away.page = false;
      react();
    });
  } catch (e) { /* 그래도 괜찮아요 */ }

  w.NcqSound = {version: VERSION, bgm: bgm, sfx: sfx, load: load, enabled: enabled, volume: volume, level: level,
                settings: settings, onChange: onChange, pause: pause, resume: resume, context: context, output: output,
                state: state};
})();
