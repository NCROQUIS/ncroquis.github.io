// Game feedback stays separate from sound and delegates device support/settings
// to NcqDevice. Keys are consumed even when muted: old events never play later.
export function createGameHaptics({
  device = () => globalThis.NcqDevice,
  blocked = () => false,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  clear = timer => clearTimeout(timer),
} = {}) {
  const seen = new Set();
  const clocks = new Map();
  const pending = new Set();
  let lastTap = -Infinity;
  const trim = collection => {
    if (collection.size > 1024) collection.delete(collection.keys().next().value);
  };
  const available = () => {
    try {
      const api = device();
      return !blocked() && api?.canVibrate() && api.vibration();
    } catch { return false; }
  };
  const play = kind => {
    if (!available()) return;
    try { device().vibrate(kind); } catch { /* Feedback must never block play. */ }
  };
  const once = (key, kind, { delay = 0, valid = () => true } = {}) => {
    if (seen.has(key)) return () => {};
    seen.add(key);
    trim(seen);
    if (!available()) return () => {};
    const timers = new Set();
    let canceled = false;
    const cancel = () => {
      canceled = true;
      for (const timer of timers) clear(timer);
      timers.clear();
      pending.delete(cancel);
    };
    // Native apps map confetti to ordinary success, so use distinct impacts
    // followed by success to keep promotion special on every supported platform.
    const beats = kind === "promotion" ? [[0, "light"], [90, "medium"], [220, "success"]] : [[0, kind]];
    for (const [offset, feedback] of beats) {
      const run = () => { if (!canceled && valid()) play(feedback); };
      if (delay + offset > 0) {
        pending.add(cancel);
        const timer = schedule(() => {
          timers.delete(timer);
          if (!timers.size) pending.delete(cancel);
          run();
        }, delay + offset);
        timers.add(timer);
      } else run();
    }
    return cancel;
  };
  return {
    once,
    tap() {
      if (now() - lastTap < 120) return;
      lastTap = now();
      play("light");
    },
    clock(key, remaining, allowed = true) {
      const previous = clocks.get(key);
      clocks.set(key, remaining);
      trim(clocks);
      if (previous > 5000 && remaining <= 5000 && remaining > 0) {
        once("clock:" + key, "warning", { valid: () => allowed });
      }
    },
    stop() {
      for (const cancel of pending) cancel();
      try { device()?.vibrate(0); } catch { /* Unsupported device. */ }
    },
  };
}
