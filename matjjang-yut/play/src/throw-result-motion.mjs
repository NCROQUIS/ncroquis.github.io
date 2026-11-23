export const THROW_RESULT_MOTION = Object.freeze({ enter: 240, hold: 480, flight: 620, land: 240 });

export function createThrowResultMotion(root, area) {
  const doc = root.ownerDocument, win = doc.defaultView, name = root.querySelector('.result-name');
  let generation = 0, animation = null, cleanup = null;
  function cancel() {
    generation++;
    animation?.cancel(); animation = null; cleanup?.(); cleanup = null;
    for (const current of root.getAnimations()) current.cancel();
    root.hidden = true; root.setAttribute('aria-hidden', 'true'); root.dataset.phase = 'idle';
  }
  async function play({ text, player, getTarget, onArrive, fast = false }) {
    cancel();
    const token = generation, factor = fast ? .12 : 1;
    let refresh = () => {}, arrived = false;
    const arrive = () => { if (!arrived && token === generation) { arrived = true; onArrive(); } };
    const paused = () => doc.hidden || !!doc.querySelector('dialog[open]');
    const sync = () => { if (animation) { if (paused()) animation.pause(); else animation.play(); } };
    const observer = new win.MutationObserver(sync);
    doc.addEventListener('visibilitychange', sync);
    observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    const resize = new win.ResizeObserver(() => refresh()); resize.observe(area);
    win.addEventListener('resize', refreshGeometry);
    function refreshGeometry() { refresh(); }
    cleanup = () => { doc.removeEventListener('visibilitychange', sync); observer.disconnect(); resize.disconnect(); win.removeEventListener('resize', refreshGeometry); };
    function origin() {
      const rect = area.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height * ([0, 3].includes(player) ? .58 : .28) };
    }
    function target() {
      const chip = getTarget();
      if (!chip) return null;
      const lane = chip.parentElement, box = chip.getBoundingClientRect(), view = lane.getBoundingClientRect();
      if (box.right > view.right - 4) lane.scrollLeft += box.right - view.right + 4;
      else if (box.left < view.left + 4) lane.scrollLeft += box.left - view.left - 4;
      const rect = chip.getBoundingClientRect(), style = win.getComputedStyle(chip);
      return { chip, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, fontSize: style.fontSize, color: style.color };
    }
    async function animate(element, frames, duration, easing = 'ease-out') {
      const current = element.animate(frames, { duration: duration * factor, easing, fill: 'both' });
      animation = current; sync();
      try { await current.finished; }
      finally { if (animation === current) animation = null; }
      return current;
    }
    name.textContent = text; root.hidden = false; root.setAttribute('aria-hidden', 'false');
    root.dataset.player = String(player); root.dataset.phase = 'reveal';
    let point = origin(), size = Math.min(56, Math.max(44, area.getBoundingClientRect().width * .13));
    Object.assign(root.style, { left: point.x + 'px', top: point.y + 'px', fontSize: size + 'px' });
    const available = Math.max(100, win.innerWidth - 32), measured = root.getBoundingClientRect().width;
    if (measured > available) { size *= available / measured; root.style.fontSize = size + 'px'; }
    try {
      await animate(root, [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.66)' },
        { offset: .65, opacity: 1, transform: 'translate(-50%,-50%) scale(1.10)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
      ], THROW_RESULT_MOTION.enter, 'cubic-bezier(.17,.9,.3,1)');
      if (token !== generation) return false;
      root.dataset.phase = 'hold';
      await animate(root, [{ opacity: 1 }, { opacity: 1 }], THROW_RESULT_MOTION.hold);
      if (token !== generation) return false;
      if (!target()) { arrive(); return true; }
      const frames = () => {
        const from = origin(), end = target();
        if (!end) return null;
        return [
          { left: from.x + 'px', top: from.y + 'px', fontSize: size + 'px', color: '#e8ab3f', webkitTextStrokeWidth: '2px', textShadow: '0 3px 0 #75451e,0 5px 0 #e7cd9e' },
          { offset: .48, left: (from.x + (end.x - from.x) * .45 + 14) + 'px', top: (from.y + (end.y - from.y) * .36) + 'px', fontSize: size * .76 + 'px', webkitTextStrokeWidth: '1px' },
          { left: end.x + 'px', top: end.y + 'px', fontSize: end.fontSize, color: end.color, webkitTextStrokeWidth: '0px', textShadow: '0 0 0 transparent' },
        ];
      };
      root.dataset.phase = 'flight';
      refresh = () => { const next = frames(); if (next) animation?.effect?.setKeyframes(next); };
      await animate(root, frames(), THROW_RESULT_MOTION.flight, 'cubic-bezier(.32,0,.19,1)');
      refresh = () => {};
      if (token !== generation) return false;
      root.hidden = true; root.setAttribute('aria-hidden', 'true');
      arrive(); root.dataset.phase = 'land';
      const chip = target()?.chip;
      if (chip) {
        const landed = await animate(chip, [
          { transform: 'scale(.78)', filter: 'brightness(1.45)' },
          { offset: .6, transform: 'scale(1.12)', filter: 'brightness(1.12)' },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ], THROW_RESULT_MOTION.land);
        landed.cancel();
      }
      if (token !== generation) return false;
      root.dataset.phase = 'done'; return true;
    } catch (error) {
      if (token !== generation) return false;
      arrive();
      if (error.name !== 'AbortError') throw error;
      return true;
    } finally {
      if (token === generation) {
        cleanup?.(); cleanup = null; root.hidden = true; root.setAttribute('aria-hidden', 'true');
        for (const current of root.getAnimations()) current.cancel();
      }
    }
  }
  return { play, cancel };
}
