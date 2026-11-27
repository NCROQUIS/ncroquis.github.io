window.NCQ_BUILD_INFO = Object.freeze({"schema":1,"source_sha":"5ea4beaadacfa16bd07f11f7098c318d0c6042e8","dirty":false,"version":"0.1.0","platform":"web","built_at":"2026-11-27T03:43:43+00:00"});
// NcqBuild — immutable build source identity, shared version labels and copy.
// ES2017, no network, storage, authentication or game-state changes.
(function () {
  "use strict";
  var w = typeof window !== "undefined" ? window : null;
  if (!w || (w.NcqBuild && w.NcqBuild.version >= 1)) return;
  var d = w.document;
  var source = w.NCQ_BUILD_INFO || {};
  var commit = /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(source.source_sha || "") ? source.source_sha.toLowerCase() : "";
  var observed = false;
  var pending = false;
  var selector = "[data-ncq-version],#app-version,.app-version";

  function info() {
    var n = w.NCQ || {};
    return Object.freeze({version: String(n.NCQ_VERSION || source.version || ""),
      source_sha: commit, short_sha: commit.slice(0, 12), dirty: source.dirty === true,
      platform: String(n.NCQ_PLATFORM || source.platform || ""),
      built_at: String(source.built_at || ""), schema: 1});
  }
  function label() {
    var b = info();
    return (b.version ? "v" + b.version : "dev") + " · " + (b.short_sha || "unknown") + (b.dirty ? " *" : "");
  }
  function text() {
    var b = info();
    return label() + "\ncommit: " + (b.source_sha || "unknown") + "\nplatform: " + b.platform +
      "\nbuilt: " + b.built_at + "\nmodified: " + b.dirty;
  }
  function copy() {
    var value = text();
    function fallback() {
      if (!d || !d.body || !d.execCommand) return false;
      var active = d.activeElement, el = d.createElement("textarea");
      el.value = value;
      el.readOnly = true;
      el.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none";
      var ok = false;
      try {
        d.body.appendChild(el);
        el.select();
        ok = d.execCommand("copy") === true;
      } catch (e) { /* unsupported clipboard */ }
      if (el.parentNode) el.parentNode.removeChild(el);
      try { if (active && active.focus) active.focus({preventScroll: true}); } catch (e) { /* detached */ }
      return ok;
    }
    try {
      if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
        return Promise.resolve(w.navigator.clipboard.writeText(value)).then(function () { return true; }, fallback);
      }
    } catch (e) { /* WebView can throw synchronously */ }
    return Promise.resolve(fallback());
  }
  function mount(el) {
    if (!el || !el.setAttribute) return;
    var value = label();
    if (el.textContent !== value) el.textContent = value;
    if (!el.hasAttribute("data-ncq-version")) el.setAttribute("data-ncq-version", "");
    el.setAttribute("data-ncq-selectable", "");
    el.style.cursor = "pointer";
    if (!el.__ncqBuildCopy) {
      el.__ncqBuildCopy = true;
      if (el.tagName !== "BUTTON" && el.tagName !== "A") {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); }
        });
      }
      el.addEventListener("click", function () { copy(); });
    }
  }
  function refresh() {
    if (!d || !d.querySelectorAll) return;
    Array.prototype.forEach.call(d.querySelectorAll(selector), mount);
  }
  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; refresh(); });
  }
  function start() {
    refresh();
    if (!observed && w.MutationObserver && d.documentElement) {
      observed = true;
      new w.MutationObserver(schedule).observe(d.documentElement, {childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["data-ncq-version", "id", "class"]});
      // HyperLane may fill NCQ_VERSION asynchronously without changing the DOM.
      var ticks = 0, timer = w.setInterval(function () {
        refresh();
        if (++ticks >= 60) w.clearInterval(timer);
      }, 1000);
    }
  }
  w.NcqBuild = Object.freeze({version: 1, info: info, label: label, text: text, copy: copy, mount: mount, refresh: refresh});
  if (d) {
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
  }
})();
