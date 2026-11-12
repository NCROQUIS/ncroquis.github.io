// Every style uses these same stone, shadow and marker poses on one frame clock.
const frames = {
  stone: [
    { offset: 0, transform: "translate(-50%, -58%) scale(1.34)", opacity: 1, easing: "cubic-bezier(.55, .05, 1, .7)" },
    { offset: .4, transform: "translate(-50%, -50%) scale(1.1, .9)", opacity: 1 },
    { offset: .58, transform: "translate(-50%, -50%) scale(1.1, .9)", opacity: 1 },
    { offset: .78, transform: "translate(-50%, -50%) scale(.985, 1.02)", opacity: 1 },
    { offset: 1, transform: "translate(-50%, -50%)", opacity: 1 },
  ],
  shadow: [
    { offset: 0, transform: "translate(-50%, -50%) scale(.72)", opacity: .36, easing: "cubic-bezier(.55, .05, 1, .7)" },
    { offset: .4, transform: "translate(-50%, -50%) scale(1.12, .94)", opacity: 1 },
    { offset: .58, transform: "translate(-50%, -50%) scale(1.12, .94)", opacity: 1 },
    { offset: .78, transform: "translate(-50%, -50%) scale(.98, 1.02)", opacity: .9 },
    { offset: 1, transform: "translate(-50%, -50%)", opacity: 1 },
  ],
  marker: [{ offset: 0, opacity: 0 }, { offset: .58, opacity: 0 }, { offset: .78, opacity: 1 }, { offset: 1, opacity: 1 }],
};

export function animateStonePlacement(cell, marker, { duration, onStart, shouldContinue = () => true,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  const animations = [
    [cell.querySelector(".stone"), frames.stone],
    [cell.querySelector(".stone-shadow"), frames.shadow],
    [marker, frames.marker],
  ].filter(([element]) => element).map(([element, keyframes]) => {
    const animation = element.animate(keyframes, { duration, fill: "both", easing: "linear" });
    animation.pause();
    animation.currentTime = 0;
    return animation;
  });
  let resolve;
  const finished = new Promise(done => { resolve = done; });
  let frame, started, stopped = false;
  const cancel = () => {
    if (stopped) return;
    stopped = true;
    cancelFrame(frame);
    for (const animation of animations) animation.cancel();
    resolve();
  };
  const tick = time => {
    if (!shouldContinue()) { cancel(); return; }
    // Start from the first displayed frame, not the network response or style update.
    // A delayed WebView frame must still show the first pose instead of skipping the motion.
    if (started === undefined) { started = time; onStart?.(); }
    const elapsed = Math.min(duration, Math.max(0, time - started));
    for (const animation of animations) animation.currentTime = elapsed;
    if (elapsed >= duration) cancel();
    else frame = requestFrame(tick);
  };
  frame = requestFrame(tick);
  return { finished, cancel };
}
