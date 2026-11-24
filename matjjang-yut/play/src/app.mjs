import { createGame, restoreGame, position, throwForFirst, beginGame, throwSticks, randomThrow, settleTurn, movePiece, OUTCOMES, teamCount, memberIndex } from './game.mjs';
import { availableDestinations, defaultPieceId } from './move-selection.mjs';
import { t, NcqLang } from './i18n.mjs';
import { createRenderer } from './renderer.mjs';
import { playCapture } from './audio.mjs';
import { mountThrowSettings } from './throw-settings.mjs';
import { createFirstPlayerReveal } from './first-player-reveal.mjs';
import { createThrowResultMotion } from './throw-result-motion.mjs';
import { createTeamView, mountTeamSetup, localPlayerName, colorTeam } from './teams.mjs';
import { createOnlineDuel } from './online-duel.mjs';
import { projectRoom, orientMatch, pieceForSeat } from './online-state.mjs';
import { mountAccount } from './account.mjs';
import { createSkinService } from './skin-assets.mjs';
import { mountShop } from './shop.mjs';
import { rackSpriteBox } from './skin-model.mjs';
import { roomClock, remainingSeconds } from './online-clock.mjs';
import { mountWallet } from './wallet.mjs';
import { createMatchIntro, shouldPlayMatchIntro } from './match-intro.mjs';

const $ = selector => document.querySelector(selector);
const NcqMetrics = window.NcqMetrics || { levelStart() {}, levelEnd() {}, step() {} };
const NcqFeedback = window.NcqFeedback || { can: () => false, open: async () => false, isOpen: () => false, close() {} };
window.NcqSave.init({ id: 'matjjang-yut', data: { match: null, appearance: { version:1, board:'default', sticks:'default', pieces:'default' } } });
const skins=createSkinService();
const restored = restoreGame(window.NcqSave.get('match'));
let game = restored || createGame(), busy = false, selectedPiece = null, movingSteps = null;
let notice = restored ? 'restored' : null, phase = '', generation = 0, nextTestThrow = null, screen = 'lobby';
let resumeLevel = restored?.action > 0 && game.winner === null;
let openingThrower = null, openingRevealed = false;
let revealingFirst = false;
let hasSavedMatch = !!restored;
let arrivingResult = null, resultRevealTask = null;
let onlineMode=false,onlineRequest=false,onlineFailure=null,onlineVisualRoom=null,onlineQueue=[],onlinePlaying=false,onlineEpoch=0,onlineRevealKey='',onlineStartedKey='',onlineEndedKey='';
let onlineClock=null,clockInterval=null,lastOnlineEvent=null,clockExpired=false;
const teamView = createTeamView(selectPiece);
const status = $('#game-status'), action = $('#main-button'), label = $('#main-label');
const resultBox = $('#throw-result');
const quitDialog = $('#quit-dialog');
const firstReveal = createFirstPlayerReveal($('#first-player-reveal'));
const matchIntro = createMatchIntro($('#match-intro-dialog'));
const resultMotion = createThrowResultMotion(resultBox, $('#play-area'));
const throwSettings = mountThrowSettings();
// Leave room for result and first-player motion within the server's opening grace.
const renderer = createRenderer($('#board'), { game, skins, getThrowSettings: throwSettings.get, getMaxThrowDuration:()=>onlineMode?(game.opening?1400:2800):Infinity, getPieceElement: id => teamView.pieceButtons[id], onSelect: selectPiece, onMove: performMove, onPhase: value => { phase = value; render(); }, onReveal: showThrowResult,
  onTrayBounds:({top,bottom})=>{
    $('#app').style.setProperty('--tray-inset-top',Math.max(0,top)+'px');
    $('#app').style.setProperty('--tray-inset-bottom',Math.max(0,bottom)+'px');
  }
});
const teamSetup = mountTeamSetup(sizes => {
  resetMatch(sizes); save(); showGame();
});
const online=createOnlineDuel({onRoom:receiveOnlineRoom,onStatus:value=>{if(value==='connected')onlineFailure=null;if(value==='identityChanged'){onlineEpoch++;onlineQueue=[];matchIntro.cancel();busy=false;}if(onlineMode&&['connecting','reconnecting'].includes(value))flow(value);renderMatching();render();if(value==='connected'&&!onlineRequest)void continueAfterOpening();},onError:error=>{onlineFailure=error.code??'network';renderMatching();if(onlineMode)render();}});
const account=mountAccount();
const wallet=mountWallet(renderEconomy);
let shop=null;
shop=mountShop({skins,onNavigate:state=>{syncModalScreen();if(screen==='lobby')flow(state);}});
skins.subscribe(()=>render());
window.NcqPopup.watch(document);
window.NcqPopup.sound('wood');
// A modal is its own screen; the covered game action is not that screen's main action.
function syncModalScreen() {
  const modalOpen = !!document.querySelector('dialog[open]');
  $('#app').inert = modalOpen;
  $('#lobby').inert = modalOpen;
  action.removeAttribute('data-ncq-main');
  $('#together-button').removeAttribute('data-ncq-main');
  $('#duel-button').removeAttribute('data-ncq-main');
  shop?.main(modalOpen,screen==='game');
  if (!modalOpen) {
    if (screen === 'game') action.setAttribute('data-ncq-main', 'game action');
    else if(!shop||shop.page()==='home') { $('#together-button').setAttribute('data-ncq-main', 'play together'); $('#duel-button').setAttribute('data-ncq-main','online duel'); }
  }
}
new MutationObserver(syncModalScreen).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

function save() { if(onlineMode)return;hasSavedMatch = true; window.NcqSave.update(data => { data.match = structuredClone(game); }); }
function flow(state) { window.NcqMetrics?.flow?.(screen === 'game' && quitDialog.open ? 'quit_confirmation' : state, { mode: onlineMode?'online':'local' }); }
function currentFlow() { return screen === 'lobby' ? shop.flow() : quitDialog.open ? 'quit_confirmation' : revealingFirst ? 'opening_reveal' : game.opening ? 'opening' : game.winner !== null ? 'result' : game.pending.length ? 'choose_piece' : 'ready'; }
function showGame() {
  if (screen === 'game') return;
  screen = 'game'; $('#lobby').hidden = true; $('#app').hidden = false;
  $('#new-game-button').hidden = false; syncModalScreen(); render();
  if(onlineMode)NcqMetrics.step('online_matched');else NcqMetrics.step('together_selected');
  if (!onlineMode && resumeLevel) { NcqMetrics.levelStart('local', { round: game.id }); resumeLevel = false; }
  flow(currentFlow());
  (action.disabled ? $('#back-to-lobby') : action).focus({ preventScroll: true });
  if (!onlineMode) void continueAfterOpening();
}
function showLobby() {
  if (busy || screen === 'lobby') return;
  screen = 'lobby'; hideThrowResult(); $('#app').hidden = true; $('#lobby').hidden = false;
  shop.home();
  $('#new-game-button').hidden = true; syncModalScreen();
  NcqMetrics.step('lobby_returned'); flow('lobby'); $('#together-button').focus({ preventScroll: true });
}
function requestQuit() {
  if (screen !== 'game' || quitDialog.open) return;
  $('#quit-detail').dataset.i18n=onlineMode?'onlineQuitDetail':'quitDetail';$('#quit-detail').textContent=t($('#quit-detail').dataset.i18n);
  window.NcqPopup.open(quitDialog); NcqMetrics.step('quit_requested'); flow('quit_confirmation');
}
function resetMatch(sizes = [1, 1]) {
  generation++; renderer.reset(); firstReveal.cancel(); matchIntro.cancel();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  game = createGame(sizes); busy = false; revealingFirst = false; selectedPiece = null; movingSteps = null;
  notice = null; phase = ''; openingThrower = null; openingRevealed = false; resumeLevel = false; nextTestThrow = null; hideThrowResult();
}
function quitMatch() {
  if (screen !== 'game' || !quitDialog.open) return;
  if(onlineMode){void leaveOnlineMatch();return;}
  resetMatch(); hasSavedMatch = false; window.NcqSave.update(data => { data.match = null; });
  NcqMetrics.step('match_quit'); render(); showLobby();
}
function onlineCanInput(){return online.canAct()&&!onlineRequest&&!matchIntro.playing&&remainingSeconds(onlineClock)!==0&&onlineVisualRoom?.code===online.room?.code&&onlineVisualRoom?.round===online.room?.round&&onlineVisualRoom?.version===online.room?.version;}
function destinations() { return onlineMode&&!onlineCanInput()?[]:availableDestinations(game, selectedPiece); }
function selection(resultId = null) {
  const choices = destinations();
  return resultId === null ? choices.length === 1 ? choices[0] : null : choices.find(plan => plan.resultId === resultId) ?? null;
}
function playerName(player) { return localPlayerName(game, player); }
function normalizeSelection() {
  if (busy) return;
  if (!destinations().length) selectedPiece = defaultPieceId(game);
}
function selectPiece(id) {
  if (busy || onlineMode&&!onlineCanInput() || game.winner !== null || !availableDestinations(game, id).length) return;
  selectedPiece = id; notice = null;
  NcqMetrics.step('piece_selected'); flow('destination'); render();
}
function showThrowResult() {
  const openingRoll = openingThrower === null ? null : game.opening?.rolls[openingThrower];
  const result = openingRoll ?? game.lastThrow;
  if (!result) return;
  const player = openingRoll ? openingThrower : result.player;
  phase = 'result_transfer'; render();
  resultRevealTask = resultMotion.play({
    text: t('out_' + result.outcome), player,
    getTarget: () => openingRoll ? document.querySelector(`.opening-score[data-player="${player}"]`) : document.querySelector(`.pending-results[data-player="${player}"] .result-chip[data-result-id="${result.id}"]`),
    onArrive: () => { if (openingRoll) openingRevealed = true; else arrivingResult = null; render(); },
    fast: !!(window.NCQ_TEST_DICE && window.__yutFast),
  });
}
function hideThrowResult() { resultMotion.cancel(); arrivingResult = null; resultRevealTask = null; }
function setLanguageMenu() {
  const select = $('#language-select'); select.replaceChildren();
  for (const language of NcqLang.list()) {
    const option = document.createElement('option'); option.value = language.code; option.textContent = language.name; option.selected = language.code === NcqLang.lang; select.append(option);
  }
  $('#language-label').textContent = t('language') + (NcqLang.lang === 'en' ? '' : ' · Language');
}
function render() {
  renderEconomy();
  normalizeSelection();
  const plans = destinations(), plan = plans[0];
  const { pendingLists, openingScores, pieceButtons } = teamView.sync(game, openingThrower ?? game.active);
  $('#app .mode').removeAttribute('data-i18n');
  $('#app').dataset.online=String(onlineMode);
  $('#app .mode').textContent = onlineMode?t('onlineMode')+(online.room?.bot?' · '+t('botLabel'):''):t('teamMode', { n: teamCount(game) });
  $('#app .mode').hidden = !!game.opening;
  const localNote = $('#settings-dialog .local-note'); localNote.removeAttribute('data-i18n'); localNote.textContent = onlineMode?t('onlineMode'):t('localTeamsNote', { n: teamCount(game) });
  const saveNote=$('#settings-dialog .save-note');saveNote.dataset.i18n=onlineMode?'onlineSaveNote':'saved';saveNote.textContent=t(saveNote.dataset.i18n);
  const restartNote=$('#restart-detail');restartNote.dataset.i18n=onlineMode?'onlineQuitDetail':'newConfirm';restartNote.textContent=t(restartNote.dataset.i18n);
  $('#opening-title').hidden = !game.opening || game.opening.winner !== null || busy;
  $('#opening-scores').hidden = !game.opening;
  for (let player = 0; player < teamCount(game); player++) {
    const roll = game.opening?.rolls[player], hidden = openingThrower === player && !openingRevealed;
    const score = openingScores[player];
    score.textContent = roll ? t('out_' + roll.outcome) : '';
    score.hidden = !roll;
    score.classList.toggle('is-result-arriving', hidden);
    score.setAttribute('aria-label', playerName(player) + ': ' + score.textContent);
  }
  if (game.opening?.winner != null) {
    colorTeam($('#first-player-reveal .first-player-card'), game.opening.winner);
    $('#first-player-reveal .avatar').dataset.member = String(memberIndex(game, game.opening.winner));
    $('#first-player-name').textContent = playerName(game.opening.winner);
  }
  for (const piece of game.pieces) {
    const button = pieceButtons[piece.id], node = position(piece), finished = node === 'finish';
    const slot = button.parentElement, check = slot.querySelector('.piece-slot-check');
    slot.dataset.state = finished ? 'finished' : node === 'base' ? 'reserve' : 'deployed';
    check.setAttribute('aria-label', playerName(piece.player) + ' · ' + t('piece', { n: piece.id % 4 + 1 }) + ' · ' + t('finishAction'));
    check.setAttribute('aria-hidden', String(!finished));
    const skin=skins.sprite(piece.player);
    if(skin){
      button.dataset.skin=skin.id;
      let image=button.querySelector('.piece-skin');
      if(!image){image=document.createElement('img');image.className='piece-skin';image.alt='';image.draggable=false;button.append(image);}
      if(image.src!==skin.image.src)image.src=skin.image.src;
      const {box,dx,dy}=rackSpriteBox(skin);
      Object.assign(image.style,{left:'calc(50% + '+(box.left+dx)+' * var(--size))',top:'calc(50% + '+(box.top+dy)+' * var(--size))',width:'calc(var(--size) * '+box.width+')',height:'calc(var(--size) * '+box.height+')'});
    }else{delete button.dataset.skin;button.querySelector('.piece-skin')?.remove();}
    button.hidden = node !== 'base';
    const canPlay = !button.hidden && !busy && (!onlineMode||onlineCanInput()) && piece.player === game.active && availableDestinations(game, piece.id).length > 0;
    button.disabled = !canPlay;
    button.classList.toggle('is-finished', finished);
    button.classList.toggle('is-playable', canPlay);
    button.classList.toggle('is-selected', !!plan?.stackIds.includes(piece.id));
    button.setAttribute('aria-label', playerName(piece.player) + ' · ' + t('piece', { n: piece.id % 4 + 1 }));
    button.setAttribute('aria-pressed', String(!!plan?.stackIds.includes(piece.id)));
  }
  for (const [player, list] of pendingLists.entries()) {
    const scroll = list.scrollLeft;
    list.replaceChildren();
    list.setAttribute('aria-label', playerName(player) + ' · ' + t('pendingResults'));
    if (game.active === player) for (const result of game.pending) {
      const chip = document.createElement('span'); chip.className = 'result-chip'; chip.textContent = t('out_' + result.outcome);
      chip.classList.toggle('is-result-arriving', result.id === arrivingResult);
      chip.dataset.resultId = String(result.id); list.append(chip);
    }
    list.scrollLeft = scroll;
  }
  action.disabled = busy || game.opening?.winner != null || !game.opening && game.winner === null && game.throws === 0 && plans.length !== 1;
  if (revealingFirst) {
    label.textContent = t('throw'); status.textContent = '';
  } else if (busy && phase === 'result_transfer') {
    label.textContent = t('throw'); status.textContent = '';
  } else if (busy) {
    label.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'move' : 'settle', { n: movingSteps ?? '' });
    status.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'moveHint' : phase === 'flight' ? 'flight' : 'settle');
  } else if (game.opening) {
    const opening = game.opening;
    label.textContent = t('throw');
    status.textContent = opening.winner !== null ? '' : opening.rolls.every(Boolean) ? t(teamCount(game) > 2 ? 'teamOpeningTie' : 'openingTie') : t('openingPrompt', { player: playerName(game.active) });
  } else if (game.winner !== null) {
    label.textContent = t('newGame'); status.textContent = t('winner', { player: playerName(game.winner) });
    $('#winner-title').textContent = t('winner', { player: playerName(game.winner) });
  } else {
    label.textContent = game.throws > 0 ? t('throw') : plans.length === 1 ? (plan.target === 'finish' ? t('finishAction') : plan.steps < 0 ? t('backward') : t('move', { n: plan.steps })) : plans.length > 1 ? t('chooseDestination') : t('choosePiece');
    status.textContent = notice ? t(notice) : plans.length ? t('moveHint') : game.pending.length ? t('choosePiece') : t('throw');
  }
  if(onlineMode){
    action.disabled ||= onlineRequest||online.status!=='connected'||online.writing||game.winner===null&&!onlineCanInput();
    if(!busy&&game.winner===null){
      if(onlineRequest){label.textContent=t('connecting');status.textContent='';}
      else if(online.status!=='connected'){label.textContent=t(online.status==='connecting'?'connecting':'reconnecting');status.textContent=label.textContent;}
      else if(!onlineCanInput()){label.textContent=t('opponentTurn');status.textContent=onlineFailure?t('onlineError'):t('opponentTurn');}
      else if(onlineFailure)status.textContent=t('onlineError');
    }
    if(game.onlineDraw){status.textContent=t('draw');$('#winner-title').textContent=t('draw');}
  }
  $('#settings-button').disabled = busy;
  $('#back-to-lobby').disabled = false;
  const sound = window.NcqSound.enabled('sfx');
  for (const button of [$('#sound-button'), $('#lobby-sound-button')]) button.setAttribute('aria-pressed', String(sound));
  $('#sound-setting').checked = sound;
  $('#board').setAttribute('aria-label', t('rules') + ' · ' + t('moveHint'));
  const locked=busy||onlineMode&&!onlineCanInput();
  const playableIds = locked ? [] : game.pieces.filter(piece => piece.player === game.active && availableDestinations(game, piece.id).length).map(piece => piece.id);
  renderer.update({ game, plans: locked ? [] : plans, pieceId: selectedPiece, playableIds, busy:locked });
  renderClock();
}
function renderClock(){
  const counter=$('#turn-countdown'),seconds=remainingSeconds(onlineClock);
  if(onlineMode&&(seconds===0)!==clockExpired){clockExpired=seconds===0;render();return;}
  const throwing=game.opening?game.opening.winner===null:game.throws>0;
  const visible=onlineMode&&throwing&&onlineClock?.seconds===5&&online.status==='connected'&&!busy&&!onlineRequest&&game.winner===null
    &&onlineVisualRoom?.version===online.room?.version;
  counter.hidden=!visible;action.classList.toggle('has-countdown',visible);
  if(!visible)return;
  const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
  text(counter,NcqLang.num(seconds));
  if(seconds===0){action.disabled=true;text(label,t('throw'));text(status,t('autoThrowing'));}
  else if(!onlineFailure)text(status,lastOnlineEvent?.automatic==='disconnect'?t('aiPlayed'):t('throwCountdown',{n:NcqLang.num(seconds)}));
}
async function performOpeningThrow() {
  if(onlineMode){await sendOnlineAction({type:'throw'});return;}
  if (busy || !game.opening || game.opening.winner !== null) return;
  const player = game.active, token = ++generation, bits = nextTestThrow || randomThrow(); nextTestThrow = null;
  busy = true; openingThrower = player; openingRevealed = false; notice = null; hideThrowResult();
  game = throwForFirst(game, bits); save();
  $('#play-area').dataset.thrower = player === 0 || player === 3 ? 'me' : 'opponent';
  NcqMetrics.step('first_player_roll'); flow('opening_throwing'); phase = 'gather'; render();
  const completed = await renderer.animateThrow(player, game.opening.rolls[player].outcome, bits);
  if (!completed || token !== generation) return;
  const arrived = await resultRevealTask;
  if (arrived === false || token !== generation) return;
  hideThrowResult(); busy = false; openingThrower = null; phase = '';
  if (game.opening.winner !== null) { if (quitDialog.open) render(); else await revealFirstPlayer(); return; }
  if (game.opening.winner === null && game.opening.rolls.every(Boolean)) NcqMetrics.step('first_player_tie');
  flow('opening'); render();
}
async function revealFirstPlayer() {
  if (revealingFirst || game.opening?.winner == null || game.opening.revealed) return;
  const token = ++generation;
  busy = true; revealingFirst = true; openingThrower = null; hideThrowResult();
  flow('opening_reveal'); render();
  const completed = await firstReveal.play();
  if (!completed || token !== generation) return;
  game.opening.revealed = true; save();
  busy = false; revealingFirst = false;
  void continueAfterOpening();
  flow(currentFlow()); render();
}
async function continueAfterOpening() {
  if (busy || screen !== 'game' || quitDialog.open || document.hidden || game.opening?.winner == null) return;
  if (!game.opening.revealed) { await revealFirstPlayer(); return; }
  startAfterOpening();
}
function startAfterOpening() {
  if (busy || game.opening?.winner == null || quitDialog.open || document.hidden) return;
  // Keep the existing server handshake, but remove its separate user action.
  if (onlineMode && (onlineFailure || !onlineCanInput())) return;
  if(onlineMode){void sendOnlineAction({type:'start'});return;}
  game = beginGame(game); notice = null; hideThrowResult(); save();
  NcqMetrics.step('first_player_decided'); flow('ready'); render();
}
async function performThrow() {
  if(onlineMode){await sendOnlineAction({type:'throw'});return;}
  if (busy || game.opening || game.throws < 1 || game.winner !== null) return;
  busy = true; notice = null; selectedPiece = null; hideThrowResult();
  const token = ++generation, player = game.active;
  if (game.action === 0) { NcqMetrics.levelStart('local', { round: game.id }); NcqMetrics.step('001_first_game_start'); }
  const bits = nextTestThrow || randomThrow(); nextTestThrow = null;
  game = throwSticks(game, bits); save();
  arrivingResult = game.lastThrow.id;
  $('#play-area').dataset.thrower = player === 0 || player === 3 ? 'me' : 'opponent';
  NcqMetrics.step('first_throw'); flow('throwing'); phase = 'gather'; render();
  const completed = await renderer.animateThrow(player, game.lastThrow.outcome, bits);
  if (!completed || token !== generation) return;
  const arrived = await resultRevealTask;
  if (arrived === false || token !== generation) return;
  hideThrowResult(); busy = false; phase = '';
  game = settleTurn(game); notice = game.lastPass ? 'pass' : OUTCOMES[game.lastThrow.outcome].extra ? 'extra' : null;
  if (game.lastPass) NcqMetrics.step('backdo_pass');
  if (OUTCOMES[game.lastThrow.outcome].extra) NcqMetrics.step('extra_throw');
  NcqMetrics.step('throw_result'); flow(game.pending.length ? 'choose_piece' : 'ready'); save(); render();
}
async function performMove(resultId = null) {
  const plan = selection(resultId); if (busy || !plan) return;
  if(onlineMode){await sendOnlineAction({type:'move',pieceId:pieceForSeat(plan.pieceId,online.room.you),resultId:plan.resultId});return;}
  const next = movePiece(game, plan.pieceId, plan.resultId);
  NcqMetrics.step('destination_selected');
  busy = true; movingSteps = plan.steps; phase = 'moving'; hideThrowResult(); const token = ++generation; render();
  const completed = await renderer.animateMove(plan, { onContact: () => {
    if (token !== generation) return false;
    game = next; save(); render();
    if (plan.captured.length) playCapture();
    return true;
  } });
  if (!completed || token !== generation) return;
  busy = false; selectedPiece = null; movingSteps = null;
  notice = plan.captured.length ? 'capture' : plan.target === 'finish' ? 'finish' : null;
  if (plan.captured.length) NcqMetrics.step('first_capture');
  if (plan.stackIds.length > 1) NcqMetrics.step('stack_moved');
  if (plan.target === 'finish') NcqMetrics.step('first_piece_home');
  NcqMetrics.step('first_move'); save(); render();
  if (game.winner !== null) {
    NcqMetrics.levelEnd('local', game.winner === 0); NcqMetrics.step('first_game_complete'); flow('result');
    $('#winner-title').textContent = t('winner', { player: playerName(game.winner) }); if (!quitDialog.open) window.NcqPopup.open($('#winner-dialog'));
  } else flow(game.pending.length ? 'choose_piece' : 'ready');
}
function startNewGame() {
  if(onlineMode){void startAnotherOnlineMatch();return;}
  resetMatch(game.teams?.map(team => team.size) ?? [1, 1]); save();
  NcqMetrics.step('new_game'); flow('opening'); render();
}

function renderEconomy(){
  const room=online.room,paid=onlineMode&&room?.state?.economy?.version==='yeopjeon-v1';
  $('#match-economy').hidden=!paid;
  const result=$('#economy-result');result.hidden=!paid||room?.phase!=='finished';
  if(result.hidden)return;
  const entry=wallet.value?.recent?.find(item=>item.room===room.code&&item.round===room.round&&item.settled);
  result.dataset.net=entry?.net>0?'positive':entry?.net<0?'negative':'neutral';
  result.textContent=entry?t('coinsChange',{n:new Intl.NumberFormat(NcqLang.lang,{signDisplay:'always'}).format(entry.net)})
    :t(wallet.status==='error'?'walletUnavailable':'walletSettling');
}
function renderMatching(){
  const message=$('#matching-status');message.removeAttribute('data-i18n');
  message.hidden=!onlineFailure;
  message.textContent=onlineFailure?t(['onlineUnavailable','coinNotEnough'].includes(onlineFailure)?onlineFailure:'onlineError'):'';
  $('#matching-dialog').classList.toggle('has-error',!!onlineFailure);
  $('#retry-matching').hidden=!onlineFailure||online.matching;
}
async function startOnlineMatch(){
  if(online.matching||matchIntro.playing)return;
  onlineFailure=null;renderMatching();window.NcqPopup.open($('#matching-dialog'));
  const task=window.NcqPopup.lease($('#matching-dialog'),'matching');
  NcqMetrics.step('online_match_requested');window.NcqMetrics?.flow?.('matching',{mode:'online'});
  try{await online.start();}catch{task.apply(renderMatching);}
}
async function sendOnlineAction(value){
  if(busy||!onlineCanInput())return;
  onlineRequest=true;onlineFailure=null;render();
  try{await online.send(value);}catch(error){onlineFailure=error.code??'network';}
  finally{onlineRequest=false;render();}
}
function receiveOnlineRoom(next,context){
  onlineFailure=null;
  onlineClock=roomClock(next);clockExpired=false;clearInterval(clockInterval);
  clockInterval=onlineClock?setInterval(renderClock,200):null;
  if(context.initial||next.phase==='finished')void wallet.refresh(true);
  if(context.initial){
    matchIntro.cancel();
    onlineEpoch++;onlineQueue=[];onlineVisualRoom=null;onlineRevealKey='';onlineMode=true;
    generation++;renderer.reset();firstReveal.cancel();hideThrowResult();busy=false;revealingFirst=false;openingThrower=null;notice=null;selectedPiece=null;
    $('#matching-dialog').close();
  }
  onlineQueue.push({room:next,...context});
  if(onlineQueue.length>8)onlineQueue=onlineQueue.slice(-1);
  void playOnlineQueue();
}
async function playOnlineQueue(){
  if(onlinePlaying)return;onlinePlaying=true;
  try{
    while(onlineQueue.length&&onlineMode){
      const item=onlineQueue.shift(),token=onlineEpoch,next=item.room;
      const {game:nextGame,event}=projectRoom(next,item.seats);
      const contiguous=onlineVisualRoom?.code===next.code&&onlineVisualRoom.round===next.round&&next.state.seq===onlineVisualRoom.state.seq+1;
      busy=true;notice=null;selectedPiece=null;hideThrowResult();
      if(item.initial){
        game=nextGame;
        if(shouldPlayMatchIntro(next,remainingSeconds(onlineClock))&&next.version===online.room?.version){
          await matchIntro.play({game:nextGame,bot:next.bot===true});
          if(token!==onlineEpoch)continue;
        }
        showGame();
      }
      if(contiguous&&event?.type==='opening'){
        game=nextGame;openingThrower=event.player;openingRevealed=false;phase='gather';
        $('#play-area').dataset.thrower=event.player===0?'me':'opponent';render();
        const done=await renderer.animateThrow(event.player,event.roll.outcome,event.roll.bits);
        if(!done||token!==onlineEpoch)continue;
        const arrived=await resultRevealTask;if(arrived===false||token!==onlineEpoch)continue;
      }else if(contiguous&&event?.type==='throw'){
        game=orientMatch(throwSticks(onlineVisualRoom.state.match,event.roll.bits),next.you);game.onlinePlayers=nextGame.onlinePlayers;
        openingThrower=null;arrivingResult=event.roll.id;phase='gather';
        $('#play-area').dataset.thrower=event.player===0?'me':'opponent';render();
        const done=await renderer.animateThrow(event.player,event.roll.outcome,event.roll.bits);
        if(!done||token!==onlineEpoch)continue;
        const arrived=await resultRevealTask;if(arrived===false||token!==onlineEpoch)continue;
      }else if(contiguous&&event?.type==='move'){
        phase='moving';movingSteps=event.plan.steps;render();
        const done=await renderer.animateMove(event.plan,{onContact:()=>{
          if(token!==onlineEpoch)return false;game=nextGame;render();if(event.plan.captured.length)playCapture();return true;
        }});
        if(!done||token!==onlineEpoch)continue;
      }else{game=nextGame;renderer.restoreThrow(game.lastThrow??(event?.type==='opening'?{...event.roll,player:event.player}:null));}
      if(token!==onlineEpoch)continue;
      hideThrowResult();game=nextGame;onlineVisualRoom=next;lastOnlineEvent=event;busy=false;phase='';movingSteps=null;openingThrower=null;openingRevealed=false;
      const roundKey=next.code+':'+next.round;
      if(game.action>0&&onlineStartedKey!==roundKey){onlineStartedKey=roundKey;NcqMetrics.levelStart('online',{round:roundKey});NcqMetrics.step('online_first_action');}
      if(game.opening?.winner!==null&&game.opening?.winner!==undefined){
        const key=roundKey+':'+game.opening.round+':'+game.opening.winner;
        if(onlineRevealKey===key)game.opening.revealed=true;
        else if(!quitDialog.open){await revealFirstPlayer();if(token!==onlineEpoch)continue;if(game.opening?.revealed)onlineRevealKey=key;}
        void continueAfterOpening();
      }
      if(next.phase==='finished'&&onlineEndedKey!==roundKey){
        onlineEndedKey=roundKey;NcqMetrics.levelEnd('online',next.winner===0?undefined:next.winner===next.you);NcqMetrics.step('online_first_result');
        $('#winner-title').textContent=game.onlineDraw?t('draw'):t('winner',{player:playerName(game.winner)});
        if(!quitDialog.open&&!document.querySelector('dialog[open]'))window.NcqPopup.open($('#winner-dialog'));
      }
      render();flow(currentFlow());
    }
  }catch(error){onlineFailure=error.code??'network';busy=false;hideThrowResult();render();}
  finally{onlinePlaying=false;}
}
async function leaveOnlineMatch(){
  $('#confirm-quit').disabled=true;
  try{
    await online.leave();onlineEpoch++;onlineQueue=[];matchIntro.cancel();onlineMode=false;onlineVisualRoom=null;onlineRequest=false;
    clearInterval(clockInterval);clockInterval=null;onlineClock=null;lastOnlineEvent=null;
    resetMatch();const local=restoreGame(window.NcqSave.get('match'));game=local??createGame();hasSavedMatch=!!local;notice=local?'restored':null;resumeLevel=!!local&&local.action>0&&local.winner===null;
    render();showLobby();return true;
  }catch(error){onlineFailure=error.code??'network';render();return false;}
  finally{$('#confirm-quit').disabled=false;void wallet.refresh(true);}
}
async function startAnotherOnlineMatch(){if(await leaveOnlineMatch())await startOnlineMatch();}

$('#duel-button').addEventListener('click',()=>void startOnlineMatch());
$('#retry-matching').addEventListener('click',()=>void startOnlineMatch());
$('#matching-dialog').addEventListener('close',()=>{if(online.matching){void online.cancel().catch(error=>{onlineFailure=error.code??'network';});window.NcqMetrics?.flow?.('lobby',{mode:'online'});}});
action.addEventListener('click', () => { if (game.opening) { if (game.opening.winner === null) void performOpeningThrow(); } else if (game.winner !== null) startNewGame(); else if (game.throws > 0) void performThrow(); else if (selection()) void performMove(); });
for (const button of [$('#sound-button'), $('#lobby-sound-button')]) button.addEventListener('click', () => { window.NcqSound.enabled('sfx', !window.NcqSound.enabled('sfx')); NcqMetrics.step('sound_changed'); render(); });
$('#sound-setting').addEventListener('change', event => { window.NcqSound.enabled('sfx', event.target.checked); render(); });
for (const button of [$('#settings-button'), $('#lobby-settings-button')]) button.addEventListener('click', () => { setLanguageMenu(); window.NcqPopup.open($('#settings-dialog')); NcqMetrics.step('settings_open'); flow('settings'); });
$('#together-button').addEventListener('click', () => { if (hasSavedMatch) showGame(); else { teamSetup.open(); NcqMetrics.step('team_setup_opened'); flow('team_setup'); } });
$('#team-setup-dialog').addEventListener('close', () => flow(currentFlow()));
$('#back-to-lobby').addEventListener('click', requestQuit);
$('#confirm-quit').addEventListener('click', quitMatch);
$('#new-game-button').addEventListener('click', () => window.NcqPopup.open($('#restart-dialog')));
$('#confirm-new-game').addEventListener('click', startNewGame); $('#play-again-button').addEventListener('click', startNewGame);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('#settings-dialog').addEventListener('close', () => flow(currentFlow()));
quitDialog.addEventListener('close', () => {
  if (screen !== 'game') return;
  flow(currentFlow());
  if (!busy && game.opening?.winner != null) void continueAfterOpening();
  else if (!busy && game.winner !== null) window.NcqPopup.open($('#winner-dialog'));
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) void continueAfterOpening(); });
$('#language-select').addEventListener('change', event => { NcqLang.set(event.target.value); NcqMetrics.step('language_changed'); });
NcqLang.onChange(() => { setLanguageMenu(); teamSetup.render(); shop.render(); renderMatching();render(); document.title = t('title'); });
$('#feedback-button').hidden = !NcqFeedback.can();
$('#feedback-button').addEventListener('click', async () => { await NcqFeedback.open(); });
window.ncqBack = () => {
  if (NcqFeedback.isOpen()) { NcqFeedback.close(); return true; }
  if (window.NcqPopup.back()) return true;
  if (screen === 'game') { requestQuit(); return true; }
  if (shop.back()) return true;
  return false;
};
$('#app-version').textContent = window.NCQ?.NCQ_VERSION ? 'v' + window.NCQ.NCQ_VERSION : 'dev';
// NCQ_TEST_DICE: 윷 결과와 판 상태를 지정하는 개발용 검사 도구
if (window.NCQ_TEST_DICE) window.__yutTest = {
  state: () => structuredClone(game), next: bits => { nextTestThrow = bits; },
  load: state => { const valid = restoreGame(state); if (!valid) throw new Error('Invalid test state'); generation++; renderer.cancel(); firstReveal.cancel(); revealingFirst = false; game = valid; busy = false; selectedPiece = null; movingSteps = null; notice = null; openingThrower = null; hideThrowResult(); save(); render(); },
};
if(window.NCQ_TEST_DICE)window.__yutOnlineTest={room:()=>structuredClone(online.room),status:()=>online.status,ready:()=>onlineMode&&onlineCanInput()&&!busy,visual:()=>structuredClone(game),busy:()=>busy,matching:()=>online.matching,sync:()=>online.sync(),diagnostic:()=>({failure:onlineFailure,request:onlineRequest,phase,playing:onlinePlaying,queue:onlineQueue.length,version:onlineVisualRoom?.version,hidden:document.hidden})};
NcqMetrics.step('000_loading_done'); if (restored) NcqMetrics.step('saved_game_restored');
$('#new-game-button').hidden = true; syncModalScreen();
flow('lobby'); setLanguageMenu(); render(); document.title = t('title');
