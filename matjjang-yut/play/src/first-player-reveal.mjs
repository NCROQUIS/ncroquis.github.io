export const FIRST_PLAYER_MOTION = Object.freeze({ enter: 440, hold: 700, exit: 340 });

export function createFirstPlayerReveal(root,{onConfirm=()=>{},onCancel=()=>{}}={}) {
  const card = root.querySelector('.first-player-card'), doc = root.ownerDocument;
  let animation = null, frame = 0, generation = 0;
  function cancel() {
    if(animation)onCancel();
    generation++;
    cancelAnimationFrame(frame);
    animation?.cancel(); animation = null;
    root.hidden = true; root.setAttribute('aria-hidden', 'true'); root.dataset.phase = 'idle';
  }
  async function play() {
    cancel();
    const token = generation, { enter, hold, exit } = FIRST_PLAYER_MOTION, duration = enter + hold + exit;
    root.hidden = false; root.setAttribute('aria-hidden', 'false'); root.dataset.phase = 'enter';
    const current = card.animate([
      { offset: 0, opacity: 0, transform: 'translateY(24px) scale(.72) rotate(-4deg)', easing: 'cubic-bezier(.15,.9,.28,1)' },
      { offset: enter * .68 / duration, opacity: 1, transform: 'translateY(-2px) scale(1.045) rotate(.8deg)', easing: 'ease-out' },
      { offset: enter / duration, opacity: 1, transform: 'translateY(0) scale(1) rotate(0)' },
      { offset: (enter + hold) / duration, opacity: 1, transform: 'translateY(0) scale(1) rotate(0)', easing: 'cubic-bezier(.4,0,.8,.5)' },
      { offset: 1, opacity: 0, transform: 'translateY(-15px) scale(.93) rotate(0)' },
    ], { duration, fill: 'both' });
    animation = current;
    const visibility = () => { if (doc.hidden) current.pause(); else current.play(); };
    doc.addEventListener('visibilitychange', visibility); visibility();
    let confirmed=false;
    function phase() {
      if (token !== generation) return;
      const elapsed = current.currentTime ?? 0;
      if(!confirmed&&elapsed>=enter*.68){confirmed=true;onConfirm();}
      root.dataset.phase = elapsed < enter ? 'enter' : elapsed < enter + hold ? 'hold' : 'exit';
      frame = requestAnimationFrame(phase);
    }
    frame = requestAnimationFrame(phase);
    try {
      await current.finished;
      if (token !== generation) return false;
      cancelAnimationFrame(frame); animation = null;
      root.hidden = true; root.setAttribute('aria-hidden', 'true'); root.dataset.phase = 'done';
      current.cancel();
      return true;
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
      return false;
    } finally { doc.removeEventListener('visibilitychange', visibility); }
  }
  return { play, cancel };
}
