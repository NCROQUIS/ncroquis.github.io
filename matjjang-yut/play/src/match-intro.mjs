import { t } from './i18n.mjs';
import { colorTeam, localPlayerName, onlineMember } from './teams.mjs';

export const MATCH_INTRO_MOTION = Object.freeze({ enter: 860, contact: 301, hitStop: 77.4, hold: 1800, exit: 180 });

// A restored/advanced game goes straight to its current turn. The server clock keeps running.
export function shouldPlayMatchIntro(room, seconds) {
  return room.phase === 'playing' && room.state.seq === 0 && (seconds === null || seconds >= 4);
}

export function createMatchIntro(dialog,{onContact=()=>{},onCancel=()=>{}}={}) {
  const doc = dialog.ownerDocument, content = dialog.querySelector('.match-intro-content');
  const stage=dialog.querySelector('.match-duel'),template=stage.querySelector('.match-player').cloneNode(true),versus=stage.querySelector('.match-versus').cloneNode(true);
  let active = null;
  for (const angle of [-78,-52,-27,18,43,68,103,128,153,198,223,248]) {
    const spark = doc.createElement('i'); spark.style.setProperty('--angle', angle + 'deg'); dialog.querySelector('.match-sparks').append(spark);
  }
  function finish(completed = false) {
    const task = active;
    if (!task) return;
    active = null;
    cancelAnimationFrame(task.frame);onCancel();
    doc.removeEventListener('visibilitychange', task.visibility);
    dialog.removeEventListener('close', task.close);
    for (const animation of task.animations) animation.cancel();
    dialog.classList.remove('is-playing');
    dialog.dataset.phase = completed ? 'done' : 'idle';
    if (dialog.open) dialog.close();
    task.resolve(completed);
  }
  function play({ game, bot = false, paid = true, key=game.id }) {
    finish();
    stage.replaceChildren();stage.dataset.teams=String(game.teams?.length??2);
    stage.dataset.format=game.teams?.map(team=>team.size).join('vs')??'1vs1';
    dialog.querySelector('.match-intro-payoff').hidden=!paid;
    dialog.querySelector('#match-intro-title').textContent = t(bot ? 'matchingBotFound' : 'matchingFound');
    for(let team=0;team<(game.teams?.length??2);team++){
      if(team)stage.append(versus.cloneNode(true));
      const card=template.cloneNode(true),roster=doc.createElement('div'),size=game.teams?.[team]?.size??1;
      roster.className='match-roster';roster.dataset.members=String(size);
      const originalAvatar=card.querySelector('.avatar'),pawns=card.querySelector('.match-pawns');
      colorTeam(card, team);
      for(let member=0;member<size;member++){
        const person=doc.createElement('div'),avatar=originalAvatar.cloneNode(true),name=doc.createElement('strong');
        person.className='match-person';avatar.dataset.member=String(member);
        name.className='match-player-name';name.textContent=localPlayerName(game,team,member);person.setAttribute('aria-label',name.textContent);
        const source=onlineMember(game,team,member)?.avatar;
        if(typeof source==='string'&&/^https:\/\//.test(source)){
          const image=doc.createElement('img');image.className='profile-photo';image.alt='';image.referrerPolicy='no-referrer';image.src=source;
          image.addEventListener('error',()=>image.remove(),{once:true});avatar.append(image);
        }
        person.append(avatar,name);roster.append(person);
      }
      card.replaceChildren(roster,pawns);stage.append(card);
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
      function contact(){if(active!==task)return;if((timeline.currentTime??0)>=MATCH_INTRO_MOTION.contact){onContact(key);return;}task.frame=requestAnimationFrame(contact);}
      task.frame=requestAnimationFrame(contact);
      doc.addEventListener('visibilitychange', task.visibility);
      dialog.addEventListener('close', task.close);
      timeline.finished.then(() => { if (active === task) finish(true); }, () => { if (active === task) finish(); });
    });
  }
  return { play, cancel: () => finish(), get playing() { return !!active; } };
}
