/* NcqPopup — 열린 순서·취소·비동기 응답 수명을 관리하는 공용 모듈. ES2017. */
(function (w, d) {
  "use strict";
  if (!w || !d || w.NcqPopup) return;
  var entries = new WeakMap(), stack = [], watched = new WeakSet();
  var serial = 0;
  var defaultSound = false;

  var warned = {};
  // 잘못 적은 소리 이름이 팝업을 막지 않게: 경고만 하고 그 소리는 꺼요 (null도 끄기).
  function soundStyle(value) {
    if (value === undefined) return undefined;
    if (value === true) return "pop";
    if (value === false || value === null) return false;
    if (["pop", "wood", "chime", "digital"].indexOf(value) >= 0) return value;
    var key = String(value);
    if (!warned[key]) {
      warned[key] = true;
      try { w.console.warn("[NcqPopup] 팝업 소리는 pop·wood·chime·digital·false 중 하나예요: " + key + " (소리 없이 열어요)"); } catch (e) { /* 콘솔이 없어요 */ }
    }
    return false;
  }
  function sound(style) {
    if (arguments.length) defaultSound = soundStyle(style) || false;
    return defaultSound;
  }
  function playSound(entry, action) {
    var style = entry.options.sound === undefined ? defaultSound : entry.options.sound;
    if (style === true) style = "pop";
    if (!style) return;
    try {
      if (w.NcqSound && typeof w.NcqSound.popup === "function") w.NcqSound.popup(action, style);
    } catch (e) { /* 소리 지원·잠금·오류가 팝업 동작을 막지 않아요. */ }
  }

  function opened(entry) {
    return entry.element.isConnected !== false && (entry.options.isOpen ? entry.options.isOpen() : entry.element.open);
  }
  function invalidate(entry) {
    entry.epoch++;
    Object.keys(entry.tasks).forEach(function (key) { entry.tasks[key].abort(); });
    entry.tasks = Object.create(null);
  }
  function remove(entry, notify, audible) {
    var wasActive = entry.active;
    entry.active = false;
    stack = stack.filter(function (item) { return item !== entry; });
    invalidate(entry);
    if (wasActive && audible) playSound(entry, "close");
    if (notify !== false && wasActive && entry.options.onClose) entry.options.onClose();
  }
  function activate(entry, audible) {
    remove(entry, false);
    entry.active = true;
    stack.push(entry);
    if (audible) playSound(entry, "open");
  }
  function register(element, options) { return track(element, options, false); }
  // audible: watch가 새로 붙은 창을 이미 열린 채로 찾았을 때 (붙이자마자 연 창) 열림음을 내요.
  function track(element, options, audible) {
    if (!element || !element.addEventListener) throw new TypeError("NcqPopup requires an element");
    if (options && typeof options === "object" && "sound" in options) {
      options = Object.assign({}, options);
      options.sound = soundStyle(options.sound);
    }
    var previous = entries.get(element);
    if (previous) {
      Object.assign(previous.options, options || {});
      return previous.handle;
    }
    var native = typeof element.showModal === "function" && typeof element.close === "function";
    options = Object.assign({}, options || {});
    if (!native && !(options.show && options.hide && options.isOpen)) {
      throw new TypeError("Custom popups require show, hide and isOpen");
    }
    var entry = {element: element, options: options, epoch: 0, tasks: Object.create(null), native: native};
    entries.set(element, entry);
    var originals = {};
    if (native) {
      ["show", "showModal", "close"].forEach(function (name) {
        if (typeof element[name] !== "function") return;
        originals[name] = element[name];
        element[name] = function () {
          var was = opened(entry);
          var result = originals[name].apply(element, arguments);
          if (name === "close") { if (!opened(entry)) remove(entry, true, was); }
          else if (!was && opened(entry)) activate(entry, true);
          return result;
        };
      });
    }
    function closed() { if (!opened(entry)) remove(entry, true, element.isConnected !== false); }
    element.addEventListener("close", closed);
    entry.handle = Object.freeze({
      open: function () {
        if (opened(entry)) return;
        if (native) element.showModal();
        else { entry.options.show(); if (opened(entry)) activate(entry, true); }
      },
      close: function (value) {
        if (native) element.close(value === undefined ? "cancel" : value);
        else { entry.options.hide(value === undefined ? "cancel" : value); if (!opened(entry)) remove(entry, true, true); }
      },
      isOpen: function () { return !!opened(entry); },
      dispose: function () {
        remove(entry);
        element.removeEventListener("close", closed);
        Object.keys(originals).forEach(function (name) { element[name] = originals[name]; });
        entries.delete(element);
      }
    });
    if (opened(entry)) activate(entry, audible);
    return entry.handle;
  }
  function topEntry() {
    stack.slice().forEach(function (entry) { if (!opened(entry)) remove(entry, true, entry.element.isConnected !== false); });
    return stack[stack.length - 1];
  }
  function requestClose(entry, reason) {
    if (entry.options.canClose && !entry.options.canClose(reason)) return;
    if (entry.options.requestClose) { entry.options.requestClose(reason); return; }
    if (entry.native) {
      // Preserve the game's formation/confirmation cancel guards on back and Escape alike.
      var event = d.createEvent("Event");
      event.initEvent("cancel", false, true);
      event.ncqPopupRequest = true;
      event.ncqReason = reason;
      if (!entry.element.dispatchEvent(event)) return;
    }
    entry.handle.close("cancel");
  }
  function back(reason) {
    var entry = topEntry();
    if (!entry) return false;
    requestClose(entry, reason || "back");
    return true;
  }
  function lease(element, key) {
    register(element);
    var entry = entries.get(element);
    if (!opened(entry)) throw new Error("popup_closed");
    key = key === undefined ? "task-" + (++serial) : String(key);
    if (entry.tasks[key]) entry.tasks[key].abort();
    var epoch = entry.epoch, active = true;
    var controller = w.AbortController ? new w.AbortController() : null;
    function abort() { active = false; if (controller) controller.abort(); }
    function current() { return active && entry.epoch === epoch && !!opened(entry); }
    var task = Object.freeze({
      signal: controller ? controller.signal : undefined,
      isCurrent: current,
      apply: function (fn) { if (!current()) return false; fn(); return true; },
      abort: abort
    });
    entry.tasks[key] = task;
    return task;
  }
  function watch(root) {
    root = root || d;
    function discover(node, audible) {
      if (node.matches && node.matches("dialog")) track(node, undefined, audible);
      if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll("dialog"), function (el) { track(el, undefined, audible); });
    }
    discover(root, false); // 이미 있던 창은 조용히 등록해요
    if (watched.has(root) || !w.MutationObserver) return;
    watched.add(root);
    new w.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === "childList") {
          Array.prototype.forEach.call(record.addedNodes, function (node) { discover(node, true); });
          topEntry();
        } else {
          var entry = entries.get(record.target);
          if (!entry) return;
          if (!opened(entry)) remove(entry, true, entry.element.isConnected !== false);
          else if (stack.indexOf(entry) < 0) activate(entry, true);
        }
      });
    }).observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ["open"]});
  }
  d.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || event.isComposing || !topEntry()) return;
    event.preventDefault(); event.stopImmediatePropagation(); back("escape");
  }, true);
  d.addEventListener("cancel", function (event) {
    if (event.ncqPopupRequest || !entries.has(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation(); back("escape");
  }, true);
  w.NcqPopup = Object.freeze({
    contractVersion: 1, register: register, watch: watch, lease: lease, back: back, sound: sound,
    open: function (element, options) { register(element, options).open(); },
    close: function (element, value) { register(element).close(value); },
    top: function () { var entry = topEntry(); return entry ? entry.element : null; },
    state: function () { topEntry(); return stack.map(function (entry) { return {id: entry.element.id || "", epoch: entry.epoch}; }); }
  });
  watch(d);
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);
