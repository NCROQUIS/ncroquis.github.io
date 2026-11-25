/* Small helpers shared by every module: math, easing, and a promise-based tween clock. */
(function () {
  'use strict';
  var BJ = window.BJ = window.BJ || {};

  var U = BJ.util = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    inCubic: function (t) { return t * t * t; },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    linear: function (t) { return t; },
    // 12500 -> "12,500"
    fmt: function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    // Money on screen: exact below 10,000, then short like the chips: 12.5K, 320K, 1.5M, 30M, 2.1B.
    money: function (n) {
      // one style everywhere: 950, 1K, 2.5K, 19.5K, 250K, 2.5M, 2.5B, 100T
      var a = Math.abs(n), sign = n < 0 ? '-' : '';
      if (a < 1000) return sign + U.fmt(Math.round(a));
      var unit = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
      var v = a / unit[0], t = v < 100 ? (Math.floor(v * 10 + 1e-9) / 10).toString() : Math.floor(v + 1e-9).toString();
      return sign + t + unit[1];
    },
    // 5000 -> "5K" (chip faces)
    short: function (n) { return U.money(n); }
  };

  // Tweens run on the game clock (advanced once per frame), so they pause with the tab.
  var tweens = [];
  BJ.anim = {
    speed: 1,
    // fn(t, k): t is the eased 0..1 value, k the raw progress. Resolves when done.
    tween: function (seconds, fn, ease) {
      return new Promise(function (resolve) {
        tweens.push({ t: 0, d: Math.max(0.0001, seconds), fn: fn, ease: ease || U.linear, done: resolve });
      });
    },
    wait: function (seconds) { return BJ.anim.tween(seconds, function () {}); },
    update: function (dt) {
      for (var i = 0; i < tweens.length; i++) {
        var w = tweens[i];
        w.t += dt;
        var k = w.t >= w.d ? 1 : w.t / w.d;
        w.fn(w.ease(k), k);
        if (k >= 1) { tweens.splice(i--, 1); w.done(); }
      }
    }
  };
})();
// Metrics (NcqMetrics): the release build puts window.NcqMetrics in; during development these do nothing.
// Calls in the game are written out in full (NcqMetrics.step + the literal name) so the release server can find them.
(function () {
  var M = function () { return window.NcqMetrics || {}; };
  window.BJ.ncqMetrics = {
    levelStart: function (a, b) { var m = M(); if (m.levelStart) m.levelStart(a, b); },
    levelEnd: function (a, b, c) { var m = M(); if (m.levelEnd) m.levelEnd(a, b, c); },
    step: function (a) { var m = M(); if (m.step) m.step(a); },
    flow: function (a, b) { var m = M(); if (m.flow) m.flow(a, b); }
  };
})();
