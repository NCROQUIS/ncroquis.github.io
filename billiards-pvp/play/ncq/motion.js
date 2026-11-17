/* NcqMotion: game motion policy, independent of device preferences unless the game chose to follow them. ES2017.
 * policy "authored" (default): reduced-motion media queries always answer "full motion".
 * policy "device" (release/android.json "motion": "device", the build adds <meta name="ncq-motion" content="device">):
 *   follow the device setting, and let players override it from the game's options with NcqMotion.set("device"|"full"|"reduce").
 */
(function (w, d) {
  "use strict";
  if (!w || w.NcqMotion) return;
  var ALWAYS = "(min-width: 0px)", NEVER = "(max-width: -1px)";
  var CHOICES = ["device", "full", "reduce"];
  var FEATURE = /\(\s*prefers-reduced-motion\s*(?::\s*(reduce|no-preference)\s*)?\)/gi;
  var SPACE = "(?:\\s|/\\*[\\s\\S]*?\\*/)*";
  var CSS_TOKEN = new RegExp("/\\*[\\s\\S]*?\\*/|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|" +
    "(\\(" + SPACE + "prefers-reduced-motion" + SPACE + "(?::" + SPACE + "(reduce|no-preference)" + SPACE + ")?\\))", "gi");
  var policy = readPolicy();
  var KEY = "ncq:motion:" + folder(); // 웹 공개는 여러 게임이 같은 주소라 게임 폴더마다 따로
  var choice = policy === "device" ? load() : "full";

  function readPolicy() {
    try {
      var m = /[?&]ncq-motion=(device|authored)\b/.exec(String((w.location && w.location.search) || ""));
      if (m) return m[1];
    } catch (e) { /* no location */ }
    try {
      var meta = d && d.querySelector && d.querySelector('meta[name="ncq-motion"]');
      if (meta && String(meta.getAttribute("content")).toLowerCase() === "device") return "device";
    } catch (e) { /* no DOM */ }
    return "authored";
  }
  function folder() {
    try {
      var p = String((w.location && w.location.pathname) || "/");
      return p.slice(0, p.lastIndexOf("/") + 1) || "/";
    } catch (e) { return "/"; }
  }
  function load() {
    try {
      var v = w.localStorage.getItem(KEY);
      return CHOICES.indexOf(v) >= 0 ? v : "device";
    } catch (e) { return "device"; }
  }
  function save(v) {
    try { if (v === "device") w.localStorage.removeItem(KEY); else w.localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }
  // null: leave the device answer alone. "full" / "reduce": answer every reduced-motion question that way.
  function mode() { return choice === "device" ? null : choice; }
  function swap(value, m) {
    // "no-preference" asks "full motion?"; "reduce" or a bare feature asks "reduced motion?"
    var asksFull = !!value && value.toLowerCase() === "no-preference";
    return (asksFull ? m === "full" : m === "reduce") ? ALWAYS : NEVER;
  }
  function query(value, m) {
    var text = String(value);
    if (m === undefined) m = mode();
    if (!m || !/prefers-reduced-motion/i.test(text)) return text;
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(FEATURE, function (_, v) { return swap(v, m); });
  }
  function css(value, m) {
    if (m === undefined) m = mode();
    if (!m) return String(value);
    return String(value).replace(CSS_TOKEN, function (all, feature, v) { return feature ? swap(v, m) : all; });
  }

  // CSS-in-JS and constructed stylesheets use these APIs without a DOM mutation.
  if (w.CSSStyleSheet) ["insertRule", "replaceSync", "replace"].forEach(function (name) {
    var prototype = w.CSSStyleSheet.prototype, original = prototype[name];
    if (typeof original !== "function") return;
    prototype[name] = function () {
      var args = Array.prototype.slice.call(arguments);
      if (policy === "authored") {
        if (args.length) args[0] = css(args[0]);
        return original.apply(this, args);
      }
      // device policy: keep the original text so a later option change can switch it again
      var self = this, result = original.apply(this, args);
      if (result && typeof result.then === "function") return result.then(function (value) { sheet(self, []); return value; });
      sheet(self, []);
      return result;
    };
  });

  var origins = typeof WeakMap === "function" ? new WeakMap() : null;
  function rules(values, seen) {
    for (var i = 0; values && i < values.length; i++) {
      var rule = values[i];
      if (rule.media && typeof rule.media.mediaText === "string") {
        var before = rule.media.mediaText, source = origins && origins.get(rule);
        if (source === undefined && /prefers-reduced-motion/i.test(before)) {
          source = before;
          if (origins) origins.set(rule, source);
        }
        if (source !== undefined) {
          var after = query(source);
          if (after !== before) rule.media.mediaText = after;
        }
      }
      if (rule.styleSheet) sheet(rule.styleSheet, seen);
      if (rule.cssRules) rules(rule.cssRules, seen);
    }
  }
  function sheet(value, seen) {
    if (!value || seen.indexOf(value) >= 0) return;
    seen.push(value);
    try { rules(value.cssRules, seen); } catch (e) { /* cross-origin CSS is covered by the build transform */ }
  }
  function media(node) {
    if (!node || !node.getAttribute) return;
    var source = node.getAttribute("data-ncq-motion-media"), current = node.getAttribute("media");
    if (source === null) {
      if (!current || !/prefers-reduced-motion/i.test(current)) return;
      source = current;
      if (policy === "device") node.setAttribute("data-ncq-motion-media", source);
    }
    var after = query(source);
    if (after !== current) node.setAttribute("media", after);
  }
  function refresh() {
    if (!d) return;
    var seen = [], i;
    var styles = d.querySelectorAll("style[media],link[media]");
    for (i = 0; i < styles.length; i++) media(styles[i]);
    for (i = 0; i < d.styleSheets.length; i++) sheet(d.styleSheets[i], seen);
    for (i = 0; d.adoptedStyleSheets && i < d.adoptedStyleSheets.length; i++) sheet(d.adoptedStyleSheets[i], seen);
  }

  // MediaQueryList answers. "authored": the native list for the rewritten query (fixed answer).
  // "device": a live list that follows both the device and the player's option.
  var nativeMatchMedia = typeof w.matchMedia === "function" ? w.matchMedia : null;
  var lives = [];
  function listen(list, fn, on) {
    if (on) { if (list.addEventListener) list.addEventListener("change", fn); else if (list.addListener) list.addListener(fn); }
    else if (list.removeEventListener) list.removeEventListener("change", fn); else if (list.removeListener) list.removeListener(fn);
  }
  function changeEvent(target, matches, text) {
    var event = null;
    try { event = new w.MediaQueryListEvent("change", { matches: matches, media: text }); } catch (e) { event = null; }
    if (!event) event = { type: "change", matches: matches, media: text };
    try { Object.defineProperty(event, "currentTarget", { value: target, configurable: true }); } catch (e) { /* read-only */ }
    return event;
  }
  function live(text) {
    var list = null, handlers = [], onchange = null, nat = null, last = null, active = false;
    try { list = Object.create(w.MediaQueryList ? w.MediaQueryList.prototype : Object.prototype); } catch (e) { list = {}; }
    function now() { return nativeMatchMedia.call(w, query(text)).matches; }
    function emit() {
      var value = now();
      if (value === last) return;
      last = value;
      var event = changeEvent(list, value, text), all = handlers.slice();
      for (var i = 0; i < all.length; i++) try { all[i].call(list, event); } catch (e) { setTimeout(function () { throw e; }); }
      if (typeof onchange === "function") try { onchange.call(list, event); } catch (e) { setTimeout(function () { throw e; }); }
    }
    function bind() {
      if (nat) listen(nat, emit, false);
      nat = nativeMatchMedia.call(w, query(text));
      listen(nat, emit, true);
    }
    function update() {
      if (!active) return;
      if (handlers.length || typeof onchange === "function") { bind(); emit(); return; }
      active = false;
      if (nat) listen(nat, emit, false);
      nat = null;
      var at = lives.indexOf(entry);
      if (at >= 0) lives.splice(at, 1);
    }
    function start() {
      if (active) return;
      active = true;
      last = now();
      bind();
      lives.push(entry);
    }
    var entry = { rebind: function () { if (active) { bind(); emit(); } } };
    var props = {
      media: { value: text, enumerable: true },
      matches: { get: now, enumerable: true },
      onchange: { get: function () { return onchange; }, set: function (fn) { onchange = fn; if (typeof fn === "function") start(); else update(); }, enumerable: true },
      addEventListener: { value: function (type, fn) {
        if (type !== "change" || typeof fn !== "function" || handlers.indexOf(fn) >= 0) return;
        handlers.push(fn); start();
      } },
      removeEventListener: { value: function (type, fn) {
        var at = handlers.indexOf(fn);
        if (type !== "change" || at < 0) return;
        handlers.splice(at, 1); update();
      } },
      addListener: { value: function (fn) { list.addEventListener("change", fn); } },
      removeListener: { value: function (fn) { list.removeEventListener("change", fn); } },
      dispatchEvent: { value: function (event) {
        var all = handlers.slice();
        for (var i = 0; i < all.length; i++) all[i].call(list, event);
        if (typeof onchange === "function") onchange.call(list, event);
        return true;
      } }
    };
    for (var key in props) if (Object.prototype.hasOwnProperty.call(props, key)) {
      props[key].configurable = true;
      Object.defineProperty(list, key, props[key]);
    }
    return list;
  }
  if (nativeMatchMedia) {
    w.matchMedia = function (value) {
      var original = String(value);
      if (!/prefers-reduced-motion/i.test(original)) return nativeMatchMedia.call(w, original);
      if (policy === "device") return live(original);
      var result = nativeMatchMedia.call(w, query(original));
      try { Object.defineProperty(result, "media", { value: original, configurable: true }); } catch (e) { /* old WebView */ }
      var preserveMedia = function (event) {
        try { Object.defineProperty(event, "media", { value: original, configurable: true }); } catch (e) { /* old WebView */ }
      };
      if (result.addEventListener) result.addEventListener("change", preserveMedia, true);
      else if (result.addListener) result.addListener(preserveMedia);
      return result;
    };
  }

  function reduced() {
    if (!nativeMatchMedia) return choice === "reduce";
    return nativeMatchMedia.call(w, query("(prefers-reduced-motion: reduce)")).matches;
  }
  function mark() {
    if (!d || !d.documentElement) return;
    d.documentElement.setAttribute("data-ncq-motion", policy);
    d.documentElement.setAttribute("data-ncq-motion-setting", choice);
  }
  var watchers = [], watching = null, lastReduced = null;
  function notify() {
    var value = reduced();
    if (value === lastReduced) return;
    lastReduced = value;
    var all = watchers.slice(), info = { reduced: value, setting: choice, policy: policy };
    for (var i = 0; i < all.length; i++) try { all[i](info); } catch (e) { setTimeout(function () { throw e; }); }
  }
  function set(value) {
    if (policy !== "device" || CHOICES.indexOf(value) < 0) return false;
    if (value !== choice) {
      choice = value;
      save(value);
      mark();
      refresh();
      var all = lives.slice();
      for (var i = 0; i < all.length; i++) all[i].rebind();
      notify();
    }
    return true;
  }
  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    watchers.push(fn);
    if (policy === "device" && !watching && nativeMatchMedia) {
      lastReduced = reduced();
      watching = nativeMatchMedia.call(w, "(prefers-reduced-motion: reduce)");
      listen(watching, notify, true);
    }
    return function () {
      var at = watchers.indexOf(fn);
      if (at >= 0) watchers.splice(at, 1);
    };
  }

  if (d && d.documentElement) {
    mark();
    d.addEventListener("load", function (event) { if (event.target && event.target.tagName === "LINK") refresh(); }, true);
    d.addEventListener("DOMContentLoaded", refresh);
    if (w.MutationObserver) new w.MutationObserver(function (changes) {
      for (var i = 0; i < changes.length; i++) {
        var change = changes[i];
        if (change.type === "attributes" || (change.target && (change.target.nodeName === "STYLE" ||
            (change.type === "characterData" && change.target.parentNode && change.target.parentNode.nodeName === "STYLE")))) { refresh(); return; }
        for (var j = 0; j < change.addedNodes.length; j++) {
          var node = change.addedNodes[j];
          if (node.nodeType === 1 && (node.matches("style,link[rel~=stylesheet]") || node.querySelector("style,link[rel~=stylesheet]"))) { refresh(); return; }
        }
      }
    }).observe(d.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["media"] });
    refresh();
  }
  w.NcqMotion = Object.freeze({
    policy: policy,                                    // "authored" | "device"
    adjustable: policy === "device",                   // true면 게임 옵션 화면에 연출 설정을 둬요
    choices: function () { return policy === "device" ? CHOICES.slice() : ["full"]; },
    setting: function () { return choice; },           // "device" | "full" | "reduce"
    set: set,                                          // 옵션 화면에서 고른 값 (기기 설정을 따르는 게임만)
    reduced: reduced,                                  // 지금 연출을 줄이는지
    onChange: onChange,                                // fn({reduced, setting, policy}) · 해제 함수를 돌려줘요
    query: function (value) { return query(value); },
    refresh: refresh
  });
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);
