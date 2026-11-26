/* NcqCollect: presentation-only resource collection. ES2017, no wallet/storage/network APIs.
 * NcqCollect.create().play({id, amount, from, to, image?, value?, targetIcon?, size?, accent?, onHit?, onComplete?})
 * Load via <script src> or side-effect import. Currency is granted BEFORE calling this module.
 */
(function (root) {
  "use strict";
  if (!root || root.NcqCollect) return;
const mix = (a, b, t) => a + (b - a) * t;
const limit = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const easeOut = t => 1 - (1 - t) ** 3;
const smooth = t => t * t * (3 - 2 * t);

// Sample one continuous curve instead of joining a few straight-line tweens.
// The browser interpolates transform/opacity on the compositor, including in
// WebViews whose CSS motion-path support differs from desktop Chrome.
function flightFrames({ start, spread, end, birth, appear, pullAt, flight, rotation, bend }) {
  const anticipation = 68, hitAt = pullAt + anticipation + flight;
  const distance = Math.hypot(end.x - spread.x, end.y - spread.y) || 1;
  const direction = { x: (end.x - spread.x) / distance, y: (end.y - spread.y) / distance };
  const away = { x: spread.x - direction.x * 5, y: spread.y - direction.y * 5 };
  const normal = { x: -direction.y * bend, y: direction.x * bend };
  const control1 = { x: away.x + direction.x * distance * .16 + normal.x,
    y: away.y + direction.y * distance * .16 + normal.y };
  const control2 = { x: end.x - direction.x * distance * .2 + normal.x * .6,
    y: end.y - direction.y * distance * .2 + normal.y * .6 };
  const coin = [], trail = [];
  const reveal = Math.min(72, appear * .26), release = reveal * .78;
  const times = new Set([0, birth, birth + release, birth + reveal, birth + appear, pullAt, pullAt + anticipation, hitAt]);
  for (let time = 0; time < hitAt; time += 12) times.add(time);
  for (const time of [...times].sort((a, b) => a - b)) {
    let x = start.x, y = start.y, scale = .22, opacity = 0, turn = rotation * -.5;
    let tail = 0, angle = 0, stretch = 1;
    if (time >= birth && time <= birth + appear) {
      const elapsed = time - birth, visible = limit(elapsed / reveal);
      // Reveal at the shared source BEFORE moving away. Fading during a fast
      // ease-out hides the departure and makes coins materialize in mid-air.
      const position = easeOut(limit((elapsed - release) / (appear - release))), u = 1 - position;
      const controlX = mix(start.x, spread.x, .7), controlY = spread.y - 12;
      x = u ** 3 * start.x + 3 * u * u * position * start.x + 3 * u * position * position * controlX + position ** 3 * spread.x;
      y = u ** 3 * start.y + 3 * u * u * position * (start.y - 30) + 3 * u * position * position * controlY + position ** 3 * spread.y;
      const grown = limit(elapsed / appear);
      scale = .22 + .78 * (1 - (1 - grown) ** 2);
      opacity = smooth(visible); turn = mix(rotation * -.5, rotation, position);
    } else if (time > birth + appear && time < pullAt) {
      const t = (time - birth - appear) / (pullAt - birth - appear);
      x = spread.x; y = spread.y - Math.sin(t * Math.PI) * 2;
      scale = opacity = 1; turn = rotation;
    } else if (time >= pullAt && time < pullAt + anticipation) {
      const t = smooth((time - pullAt) / anticipation);
      x = mix(spread.x, away.x, t); y = mix(spread.y, away.y, t);
      scale = 1 - .045 * t; opacity = 1; turn = rotation;
    } else if (time >= pullAt + anticipation) {
      const t = time === hitAt ? 1 : limit((time - pullAt - anticipation) / flight), s = t ** 2.65, u = 1 - s;
      x = u ** 3 * away.x + 3 * u * u * s * control1.x + 3 * u * s * s * control2.x + s ** 3 * end.x;
      y = u ** 3 * away.y + 3 * u * u * s * control1.y + 3 * u * s * s * control2.y + s ** 3 * end.y;
      const dx = 3 * u * u * (control1.x - away.x) + 6 * u * s * (control2.x - control1.x) + 3 * s * s * (end.x - control2.x);
      const dy = 3 * u * u * (control1.y - away.y) + 6 * u * s * (control2.y - control1.y) + 3 * s * s * (end.y - control2.y);
      angle = Math.atan2(dy, dx) * 180 / Math.PI;
      tail = t >= 1 ? 0 : limit((t - .28) / .6) * .55;
      stretch = 1 + tail * .22;
      scale = mix(.955, .72, s); opacity = 1 - smooth(limit((t - .92) / .08));
      turn = rotation + s * 28;
    }
    const offset = time / hitAt;
    coin.push({ offset, opacity, transform: `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${turn}deg) scale(${scale * stretch},${scale})` });
    trail.push({ offset, opacity: tail,
      transform: `translate3d(${x - 42}px,${y - 4}px,0) rotate(${angle}deg) scaleX(${.25 + tail * 1.8})` });
  }
  return { coin, trail, hitAt };
}


const STYLE_ID = "ncq-collect-style";
const CSS = `.ncq-collect-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: visible;
  background: transparent;
  color: #fff9d9;
  pointer-events: none;
}
.ncq-collect-layer::backdrop { background: transparent; pointer-events: none; }
.ncq-collect-piece,
.ncq-collect-wallet i {
  display: block;
  width: var(--ncq-collect-size, 28px);
  height: var(--ncq-collect-size, 28px);
  background: var(--ncq-collect-image) center / contain no-repeat;
}
.ncq-collect-piece {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  filter: drop-shadow(0 2px 2px #0004) drop-shadow(0 0 3px var(--ncq-collect-accent));
  will-change: transform, opacity;
}
.ncq-collect-trail {
  position: absolute;
  left: 0;
  top: 0;
  width: 42px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, var(--ncq-collect-accent) 65%, #fff9e5);
  transform-origin: right center;
  opacity: 0;
  filter: blur(1px);
  will-change: transform, opacity;
}
.ncq-collect-impact {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(circle, #fffbe5 4%, var(--ncq-collect-accent) 28%, transparent 72%);
  opacity: 0;
  pointer-events: none;
}
.ncq-collect-impact::after { content: ""; position: absolute; inset: 2px; border: 1px solid var(--ncq-collect-accent); border-radius: 50%; }
.ncq-collect-source {
  position: absolute;
  width: 26px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(ellipse, #fff4bf 3%, var(--ncq-collect-accent) 36%, transparent 72%);
  opacity: 0;
  pointer-events: none;
}
.ncq-collect-wallet {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: var(--ncq-collect-size, 28px);
  padding: 3px 9px;
  border: 1px solid var(--ncq-collect-accent);
  border-radius: 999px;
  background: #18251ff2;
  box-shadow: 0 0 12px #0003;
  transform: translate(-20px, -50%);
  white-space: nowrap;
}
.ncq-collect-wallet i { width: 19px; height: 19px; }
.ncq-collect-wallet strong { font: inherit; font-weight: 700; font-size: 14px; }
`;
const DEFAULT_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2040%2040%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x2%3D%22.8%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23fff3a1%22/%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23ffcd46%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23db920f%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2218%22%20fill%3D%22url%28%23g%29%22%20stroke%3D%22%23a96a08%22%20stroke-width%3D%222%22/%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2213%22%20fill%3D%22none%22%20stroke%3D%22%23fff0a0%22%20stroke-width%3D%222%22/%3E%3Cpath%20d%3D%22M20%2011v18m5-15c-7-5-14%204-5%206s3%2010-5%205%22%20fill%3D%22none%22%20stroke%3D%22%23aa6c0b%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E";

function create(options) {
  options = options || {};
  const w = options.window || root, d = options.document || w.document;
  const random = options.random || Math.random;
  const setTimer = options.setTimer || function (fn, ms) { return w.setTimeout(fn, ms); };
  const clearTimer = options.clearTimer || function (id) { w.clearTimeout(id); };
  const rate = limit(Number(options.playbackRate) || 1, .25, 2);
  const seen = new Set();
  let active = null, disposed = false, listening = false;
  function element(value) {
    if (typeof value === "string") {
      try { return d.querySelector(value); } catch (e) { return null; }
    }
    return value && typeof value.getBoundingClientRect === "function" ? value : null;
  }
  function point(value) {
    const node = element(value);
    if (node) {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    }
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  }
  function call(callback) { if (typeof callback === "function") try { callback(); } catch (e) { /* visual callbacks are isolated */ } }
  function stop() {
    if (!active) return;
    const current = active;
    active = null;
    current.timers.forEach(function (id) { clearTimer(id); });
    current.animations.forEach(function (animation) { try { animation.cancel(); } catch (e) { /* detached target */ } });
    current.layer.remove();
  }
  function hidden() { if (d.hidden) stop(); }
  function listen() {
    if (listening) return;
    listening = true;
    w.addEventListener("resize", stop);
    w.addEventListener("pagehide", stop);
    d.addEventListener("visibilitychange", hidden);
    d.addEventListener("pause", stop);
  }
  function play(input) {
    const p = input || {}, id = p.id;
    if (disposed || !d || !d.body || typeof id !== "string" || !id || id.length > 512 || seen.has(id)
      || !Number.isSafeInteger(p.amount) || p.amount <= 0) return false;
    let current;
    try {
      const target = element(p.to);
      const icon = target && target.querySelector && target.querySelector(p.targetIcon || "[data-ncq-collect-icon]");
      const destination = point(icon) || point(p.to);
      if (!destination) return false;
      stop();
      seen.add(id);
      if (seen.size > 256) seen.delete(seen.values().next().value);
      if (d.hidden || (w.NcqMotion && w.NcqMotion.reduced())) return false;
      const width = w.innerWidth, height = w.innerHeight;
      const size = limit(Number(p.size) || 28, 12, 80), margin = Math.max(22, size / 2 + 4);
      const safe = w.NcqSafe ? w.NcqSafe.space() : { top: 0, right: 0, bottom: 0, left: 0 };
      const clamp = function (v, low, high) { return Math.max(low, Math.min(Math.max(low, high), v)); };
      const start = point(p.from) || { x: width / 2, y: height / 2 };
      const layer = d.createElement("div");
      layer.className = "ncq-collect-layer";
      layer.setAttribute("aria-hidden", "true");
      const image = typeof p.image === "string" && p.image ? p.image : DEFAULT_IMAGE;
      layer.style.setProperty("--ncq-collect-image", "url(" + JSON.stringify(image) + ")");
      layer.style.setProperty("--ncq-collect-size", size + "px");
      layer.style.setProperty("--ncq-collect-accent", /^#[\da-f]{3,4}$|^#[\da-f]{6}([\da-f]{2})?$/i.test(p.accent || "") ? p.accent : "#ffd36b");
      if (!d.getElementById(STYLE_ID)) {
        const style = d.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        (d.head || d.body).append(style);
      }
      const topLayer = typeof layer.showPopover === "function";
      if (topLayer) layer.setAttribute("popover", "manual");
      const dialogs = d.querySelectorAll("dialog[open]");
      const parent = topLayer ? d.body : dialogs[dialogs.length - 1] || d.body;
      parent.append(layer);
      current = active = { layer: layer, animations: [], timers: new Set() };
      listen();
      const schedule = function (ms, callback) {
        const timer = setTimer(function () {
          current.timers.delete(timer);
          if (active !== current) return;
          try { callback(); } catch (e) { stop(); }
        }, ms / rate);
        current.timers.add(timer);
      };
      if (topLayer) layer.showPopover();
      // Viewport CSS pixels; compensate for a transformed dialog in old WebViews.
      const bounds = layer.getBoundingClientRect();
      const scaleX = layer.offsetWidth / bounds.width || 1, scaleY = layer.offsetHeight / bounds.height || 1;
      const local = function (v) { return { x: (v.x - bounds.left) * scaleX, y: (v.y - bounds.top) * scaleY }; };
      const end = local(destination), from = local(start);
      const hit = d.elementFromPoint(destination.x, destination.y);
      const blocker = hit && hit.getBoundingClientRect();
      const covered = hit && hit !== target && !(target && target.contains(hit)) && blocker
        && destination.x >= blocker.left && destination.x <= blocker.right
        && destination.y >= blocker.top && destination.y <= blocker.bottom;
      const visibleTarget = target && !covered;
      if (!visibleTarget && p.value !== undefined) {
        const badge = d.createElement("span");
        badge.className = "ncq-collect-wallet";
        badge.style.left = end.x + "px"; badge.style.top = end.y + "px";
        const badgeIcon = d.createElement("i"), countLabel = d.createElement("strong");
        countLabel.textContent = String(p.value);
        badge.append(badgeIcon, countLabel); layer.append(badge);
      }
      const count = Math.min(20, Math.max(8, Math.ceil(Math.log2(p.amount + 1) * 2))), arrivals = [], pulls = [];
      const gatherAt = (count - 1) * 14 + 12 + 305 + 90;
      const source = d.createElement("i");
      source.className = "ncq-collect-source";
      source.style.left = from.x + "px"; source.style.top = from.y + "px";
      layer.append(source);
      current.animations.push(source.animate([
        { opacity: 0, transform: "translate(-50%,-50%) scale(.5)" },
        { opacity: .8, transform: "translate(-50%,-50%) scale(1)", offset: .15 },
        { opacity: .5, transform: "translate(-50%,-50%) scale(.9)", offset: .65 },
        { opacity: 0, transform: "translate(-50%,-50%) scale(.7)" }
      ], { duration: (count * 14 + 140) / rate, easing: "ease-out" }));
      for (let i = 0; i < count; i++) {
        const piece = d.createElement("i"), trail = d.createElement("i");
        piece.className = "ncq-collect-piece"; trail.className = "ncq-collect-trail";
        layer.append(trail, piece);
        const angle = i * 2.399963 + random() * .8;
        const radius = Math.sqrt(random()) * Math.min(46 + count * 1.7, width * .22);
        const spread = local({
          x: clamp(start.x + Math.cos(angle) * radius, safe.left + margin, width - safe.right - margin),
          y: clamp(start.y + Math.sin(angle) * radius, safe.top + margin, height - safe.bottom - margin)
        });
        const distance = Math.hypot(end.x - spread.x, end.y - spread.y);
        const birth = i * 14 + random() * 12, appear = 260 + random() * 45;
        const pullAt = gatherAt + i * 8 + random() * 18;
        const frames = flightFrames({ start: from, spread: spread, end: end, birth: birth, appear: appear, pullAt: pullAt,
          flight: 300 + Math.min(100, distance * .15), rotation: random() * 36 - 18, bend: random() * 28 - 14 });
        const timing = { duration: frames.hitAt / rate, easing: "linear", fill: "both" };
        current.animations.push(piece.animate(frames.coin, timing), trail.animate(frames.trail, timing));
        arrivals.push(frames.hitAt); pulls.push(pullAt);
      }
      arrivals.sort(function (a, b) { return a - b; });
      const last = arrivals[arrivals.length - 1];
      current.timing = { pullAt: Math.min.apply(Math, pulls), hitAt: arrivals[0], endAt: last + 240 };
      const impact = d.createElement("i");
      impact.className = "ncq-collect-impact";
      impact.style.left = end.x + "px"; impact.style.top = end.y + "px"; layer.append(impact);
      [arrivals[0], arrivals[Math.floor(count / 2)], last].forEach(function (at) {
        schedule(at, function () {
          current.animations.push(impact.animate([
            { opacity: .95, transform: "translate(-50%,-50%) scale(.35)" },
            { opacity: .7, transform: "translate(-50%,-50%) scale(1.25)", offset: .25 },
            { opacity: 0, transform: "translate(-50%,-50%) scale(1.8)" }
          ], { duration: 180 / rate, easing: "ease-out" }));
          if (visibleTarget && target.isConnected && !d.hidden) current.animations.push(target.animate([
            { scale: "1", filter: "brightness(1)" },
            { scale: "1.09", filter: "brightness(1.55)", offset: .22 },
            { scale: ".985", filter: "brightness(1.05)", offset: .6 },
            { scale: "1", filter: "brightness(1)" }
          ], { duration: 210 / rate, easing: "ease-out" }));
        });
      });
      schedule(arrivals[0], function () { call(p.onHit); });
      schedule(last + 240, function () { stop(); call(p.onComplete); });
      return true;
    } catch (e) {
      // Missing animation APIs must never interrupt the caller's reward handling.
      if (active === current) stop();
      return false;
    }
  }
  return { play: play, stop: stop, point: point,
    get timing() {
      const t = active && active.timing;
      return t ? { pullAt: t.pullAt, hitAt: t.hitAt, endAt: t.endAt } : null;
    },
    dispose: function () {
      stop(); disposed = true;
      if (!listening) return;
      w.removeEventListener("resize", stop); w.removeEventListener("pagehide", stop);
      d.removeEventListener("visibilitychange", hidden); d.removeEventListener("pause", stop);
      listening = false;
    }
  };
}
let shared;
root.NcqCollect = { create: create,
  play: function (options) { if (!shared) shared = create(); return shared.play(options); },
  stop: function () { if (shared) shared.stop(); }
};
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
