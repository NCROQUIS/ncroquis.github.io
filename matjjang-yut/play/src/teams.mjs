import { teamCount, memberIndex } from './game.mjs';
import { t } from './i18n.mjs';
import { TEAM_COLORS } from './team-colors.mjs';
export function colorTeam(element, team) {
  element.dataset.player = String(team);
  for (const [key, value] of Object.entries(TEAM_COLORS[team])) element.style.setProperty('--team' + (key === 'main' ? '' : '-' + key), value);
  element.style.setProperty('--result-bright', TEAM_COLORS[team].main);
  element.style.setProperty('--result-dark', TEAM_COLORS[team].dark);
}
const sizesOf = game => game.teams?.map(team => team.size) ?? [1, 1];
const numberOf = (sizes, team, member) => sizes.slice(0, team).reduce((sum, n) => sum + n, 0) + member + 1;
export const onlineMember=(game,team,member=memberIndex(game,team))=>game.onlinePlayers?.[team]?.members?.[member]??game.onlinePlayers?.[team];
export function localPlayerName(game, team, member = memberIndex(game, team)) {
  if (onlineMember(game,team,member)?.nickname) return onlineMember(game,team,member).nickname;
  const sizes = sizesOf(game);
  if (sizes.length === 2 && sizes.every(n => n === 1)) return t(team === 0 ? 'you' : 'opponent');
  return t('localPlayer', { n: numberOf(sizes, team, member) });
}
function avatar(member) {
  const node = document.createElement('span'); node.className = 'avatar member-avatar'; node.dataset.member = String(member);
  for (const name of ['hair', 'face', 'robe', 'glasses']) { const part = document.createElement('span'); part.className = name; node.append(part); }
  return node;
}

export function createTeamView(onSelect) {
  const refs = { cards:[], pendingLists:[], openingScores:[], pieceButtons:[] };
  let mounted = '';
  function mount(game) {
    const sizes = sizesOf(game), key = sizes.join(','); if (key === mounted) return;
    mounted = key;
    for (const selector of ['.upper-teams','.lower-teams','#pending-results','#opening-scores']) document.querySelector(selector).replaceChildren();
    for (const array of Object.values(refs)) array.length = 0;
    for (let team = 0; team < sizes.length; team++) {
      const card = document.createElement('section'); card.className = 'player-card ' + ([0,3].includes(team) ? 'me' : 'opponent');
      card.id = team === 0 ? 'my-card' : team === 1 ? 'opponent-card' : 'team-card-' + team; colorTeam(card, team);
      const identity = document.createElement('div'); identity.className = 'team-identity';
      const members = document.createElement('div'); members.className = 'team-members'; members.setAttribute('role','list');
      for (let member = 0; member < sizes[team]; member++) {
        const person = document.createElement('span'); person.className = 'team-person'; person.dataset.member = String(member); person.setAttribute('role','listitem');
        person.append(avatar(member)); members.append(person);
      }
      const nickname = document.createElement('h2'); nickname.className = 'active-nickname'; identity.append(members,nickname);
      const rack = document.createElement('div'); rack.className = 'piece-rack'; rack.id = team === 0 ? 'my-pieces' : team === 1 ? 'opponent-pieces' : 'team-pieces-' + team;
      for (const piece of game.pieces.filter(piece => piece.player === team)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'piece-button'; button.dataset.piece = String(piece.id);
        for (const name of ['piece-choice-halo','piece-selected-ring']) { const mark = document.createElement('span'); mark.className = name; mark.setAttribute('aria-hidden','true'); button.append(mark); }
        const slot = document.createElement('span'); slot.className = 'piece-slot'; slot.dataset.slot = String(piece.id);
        slot.innerHTML = '<span class="piece-slot-ghost" aria-hidden="true"></span><svg class="piece-slot-check" viewBox="0 0 24 24" role="img"><path d="m6 12 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        button.addEventListener('click', () => onSelect(piece.id)); slot.append(button); rack.append(slot); refs.pieceButtons[piece.id] = button;
      }
      card.append(identity,rack); document.querySelector([0,3].includes(team) ? '.lower-teams' : '.upper-teams').append(card); refs.cards.push(card);
      const pending = document.createElement('div'); pending.className = 'pending-results'; pending.setAttribute('role','group'); colorTeam(pending,team);
      pending.id = team === 0 ? 'my-pending-results' : team === 1 ? 'opponent-pending-results' : 'team-pending-' + team;
      document.querySelector('#pending-results').append(pending); refs.pendingLists.push(pending);
      const score = document.createElement('span'); score.className = 'opening-score ' + ([0,3].includes(team) ? 'me' : 'opponent'); colorTeam(score,team);
      score.id = team === 0 ? 'my-opening-result' : team === 1 ? 'opponent-opening-result' : 'team-opening-' + team;
      document.querySelector('#opening-scores').append(score); refs.openingScores.push(score);
    }
  }
  function sync(game, turn) {
    mount(game);
    const sizes = sizesOf(game), shell = document.querySelector('#app');
    shell.dataset.teams = String(teamCount(game)); shell.dataset.largeTeam = String(Math.max(...sizes) > 2);
    refs.cards.forEach((card,team) => {
      const active = turn === team, member = memberIndex(game,team);
      card.classList.toggle('is-active',active);
      if (active) card.setAttribute('aria-current','true'); else card.removeAttribute('aria-current');
      card.setAttribute('aria-label',t('teamName',{n:team+1}));
      card.querySelector('.active-nickname').textContent = active ? localPlayerName(game,team) : '';
      card.querySelectorAll('.team-person').forEach((person,index) => {
        const current = active && member === index;
        person.classList.toggle('is-current',current); person.setAttribute('aria-label',localPlayerName(game,team,index));
        if (current) person.setAttribute('aria-current','true'); else person.removeAttribute('aria-current');
        const image=onlineMember(game,team,index)?.avatar,existing=person.querySelector('.profile-photo');
        if(typeof image==='string'&&/^https:\/\//.test(image)){
          if(!existing){const photo=document.createElement('img');photo.className='profile-photo';photo.alt='';photo.referrerPolicy='no-referrer';photo.src=image;photo.addEventListener('error',()=>photo.remove());person.querySelector('.avatar').append(photo);}
          else if(existing.src!==image)existing.src=image;
        }else existing?.remove();
      });
    });
    return refs;
  }
  return { sync, get pieceButtons() { return refs.pieceButtons; } };
}

export function mountTeamSetup(onStart) {
  const dialog = document.querySelector('#team-setup-dialog'), list = document.querySelector('#setup-teams'), add = document.querySelector('#add-team');
  let sizes = [1,1];
  function render() {
    list.replaceChildren();
    sizes.forEach((size,team) => {
      const card = document.createElement('section'); card.className = 'setup-team'; colorTeam(card,team);
      const header = document.createElement('header'), title = document.createElement('h3'); title.textContent = t('teamName',{n:team+1}); header.append(title);
      if (team >= 2) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-team'; remove.textContent = '×'; remove.setAttribute('aria-label',t('removeTeam')+' · '+t('teamName',{n:team+1}));
        remove.addEventListener('click', () => { sizes.splice(team,1); render(); }); header.append(remove);
      }
      const members = document.createElement('div'); members.className = 'setup-members';
      for (let member = 0; member < size; member++) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'setup-member'; button.append(avatar(member));
        button.setAttribute('aria-label',t(size > 1 ? 'removeMember' : 'localPlayer',{n:numberOf(sizes,team,member)})); button.disabled = size === 1;
        if (size > 1) { const mark = document.createElement('span'); mark.className = 'remove-member'; mark.textContent = '×'; mark.setAttribute('aria-hidden','true'); button.append(mark); }
        button.addEventListener('click', () => { if (sizes[team] > 1) { sizes[team]--; render(); } }); members.append(button);
      }
      if (size < 4) {
        const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'add-member'; plus.textContent = '+'; plus.setAttribute('aria-label',t('addMember')+' · '+t('teamName',{n:team+1}));
        plus.addEventListener('click', () => { if (sizes[team] < 4) { sizes[team]++; render(); } }); members.append(plus);
      }
      card.append(header,members); list.append(card);
    });
    add.disabled = sizes.length >= 4;
    document.querySelector('#setup-format').textContent = sizes.join('vs');
  }
  add.addEventListener('click', () => { if (sizes.length < 4) { sizes.push(1); render(); } });
  document.querySelector('#start-together').addEventListener('click', () => { const selected = sizes.slice(); dialog.close(); onStart(selected); });
  return { open() { sizes = [1,1]; render(); window.NcqPopup.open(dialog); }, render };
}
