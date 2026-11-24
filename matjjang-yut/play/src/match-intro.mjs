import { t } from './i18n.mjs';
import { colorTeam, localPlayerName } from './teams.mjs';

export const MATCH_INTRO_MOTION = Object.freeze({ enter: 860, contact: 301, hitStop: 77.4, hold: 1800, exit: 180 });

// A restored/advanced game goes straight to its current turn. The server clock keeps running.
export function shouldPlayMatchIntro(room, seconds) {
  return room.phase === 'playing' && room.state.seq === 0 && (seconds === null || seconds >= 4);
}

export function createMatchIntro(dialog) {
  const doc = dialog.ownerDocument, content = dialog.querySelector('.match-intro-content');
  let active = null;
  for (const angle of [-78,-52,-27,18,43,68,103,128,153,198,223,248]) {
    const spark = doc.createElement('i'); spark.style.setProperty('--angle', angle + 'deg'); dialog.querySelector('.match-sparks').append(spark);
  }
  function finish(completed = false) {
    const task = active;
    if (!task) return;
    active = null;
    doc.removeEventListener('visibilitychange', task.visibility);
    dialog.removeEventListener('close', task.close);
    for (const animation of task.animations) animation.cancel();
    dialog.classList.remove('is-playing');
    dialog.dataset.phase = completed ? 'done' : 'idle';
    if (dialog.open) dialog.close();
    task.resolve(completed);
  }
  function play({ game, bot = false }) {
    finish();
    dialog.querySelector('#match-intro-title').textContent = t(bot ? 'matchingBotFound' : 'matchingFound');
    for (const [team, card] of [...dialog.querySelectorAll('.match-player')].entries()) {
      colorTeam(card, team);
      card.querySelector('.match-player-name').textContent = localPlayerName(game, team);
      card.querySelector('.profile-photo')?.remove();
      const source = game.onlinePlayers?.[team]?.avatar;
      if (typeof source === 'string' && /^https:\/\//.test(source)) {
        const image = doc.createElement('img'); image.className = 'profile-photo'; image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = source;
        image.addEventListener('error', () => image.remove(), { once: true }); card.querySelector('.avatar').append(image);
      }
    }
    if (doc.hidden) return Promise.resolve(false);
    dialog.classList.add('is-playing'); dialog.dataset.phase = 'playing';
    window.NcqPopup.open(dialog);
    const { enter, hold, exit } = MATCH_INTRO_MOTION, duration = enter + hold + exit;
    const timeline = content.animate([
      { opacity: 0 }, { opacity: 1, offset: 100 / duration },
      { opacity: 1, offset: (enter + hold) / duration }, { opacity: 0 },
    ], { duration, fill: 'both' });
    return new Promise(resolve => {
      const task = { resolve, animations: dialog.getAnimations({ subtree: true }), visibility: () => { if (doc.hidden) finish(); }, close: () => { if (!dialog.open) finish(); } };
      active = task;
      doc.addEventListener('visibilitychange', task.visibility);
      dialog.addEventListener('close', task.close);
      timeline.finished.then(() => { if (active === task) finish(true); }, () => { if (active === task) finish(); });
    });
  }
  return { play, cancel: () => finish(), get playing() { return !!active; } };
}
