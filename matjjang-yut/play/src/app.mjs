import { createGame, restoreGame, position, throwForFirst, beginGame, throwSticks, randomThrow, settleTurn, movePiece, OUTCOMES, teamCount, memberIndex } from './game.mjs';
import { availableDestinations, defaultPieceId } from './move-selection.mjs';
import { t, NcqLang } from './i18n.mjs';
import { createRenderer } from './renderer.mjs';
import { playCapture } from './audio.mjs';
import { mountThrowSettings } from './throw-settings.mjs';
import { createFirstPlayerReveal } from './first-player-reveal.mjs';
import { createThrowResultMotion } from './throw-result-motion.mjs';
import { createTeamView, mountTeamSetup, localPlayerName, colorTeam } from './teams.mjs';

const $ = selector => document.querySelector(selector);
const NcqMetrics = window.NcqMetrics || { levelStart() {}, levelEnd() {}, step() {} };
const NcqFeedback = window.NcqFeedback || { can: () => false, open: async () => false, isOpen: () => false, close() {} };
window.NcqSave.init({ id: 'matjjang-yut', data: { match: null } });
const restored = restoreGame(window.NcqSave.get('match'));
let game = restored || createGame(), busy = false, selectedPiece = null, movingSteps = null;
let notice = restored ? 'restored' : null, phase = '', generation = 0, nextTestThrow = null, screen = 'lobby';
let resumeLevel = restored?.action > 0 && game.winner === null;
let openingThrower = null, openingRevealed = false;
let revealingFirst = false;
let hasSavedMatch = !!restored;
let arrivingResult = null, resultRevealTask = null;
const teamView = createTeamView(selectPiece);
const status = $('#game-status'), action = $('#main-button'), label = $('#main-label');
const resultBox = $('#throw-result');
const quitDialog = $('#quit-dialog');
const firstReveal = createFirstPlayerReveal($('#first-player-reveal'));
const resultMotion = createThrowResultMotion(resultBox, $('#play-area'));
const throwSettings = mountThrowSettings();
const renderer = createRenderer($('#board'), { game, getThrowSettings: throwSettings.get, getPieceElement: id => teamView.pieceButtons[id], onSelect: selectPiece, onMove: performMove, onPhase: value => { phase = value; render(); }, onReveal: showThrowResult });
const teamSetup = mountTeamSetup(sizes => {
  resetMatch(sizes); save(); showGame();
});
window.NcqPopup.watch(document);
window.NcqPopup.sound('wood');
// A modal is its own screen; the covered game action is not that screen's main action.
function syncModalScreen() {
  const modalOpen = !!document.querySelector('dialog[open]');
  $('#app').inert = modalOpen;
  $('#lobby').inert = modalOpen;
  action.removeAttribute('data-ncq-main');
  $('#together-button').removeAttribute('data-ncq-main');
  if (!modalOpen) {
    if (screen === 'game') action.setAttribute('data-ncq-main', 'game action');
    else $('#together-button').setAttribute('data-ncq-main', 'play together');
  }
}
new MutationObserver(syncModalScreen).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

function save() { hasSavedMatch = true; window.NcqSave.update(data => { data.match = structuredClone(game); }); }
function flow(state) { window.NcqMetrics?.flow?.(screen === 'game' && quitDialog.open ? 'quit_confirmation' : state, { mode: 'local' }); }
function currentFlow() { return screen === 'lobby' ? 'lobby' : quitDialog.open ? 'quit_confirmation' : revealingFirst ? 'opening_reveal' : game.opening ? 'opening' : game.winner !== null ? 'result' : game.pending.length ? 'choose_piece' : 'ready'; }
function showGame() {
  if (screen === 'game') return;
  screen = 'game'; $('#lobby').hidden = true; $('#app').hidden = false;
  $('#new-game-button').hidden = false; syncModalScreen(); render();
  NcqMetrics.step('together_selected');
  if (resumeLevel) { NcqMetrics.levelStart('local', { round: game.id }); resumeLevel = false; }
  flow(currentFlow());
  (action.disabled ? $('#back-to-lobby') : action).focus({ preventScroll: true });
  if (game.opening?.winner != null && !game.opening.revealed) void revealFirstPlayer();
}
function showLobby() {
  if (busy || screen === 'lobby') return;
  screen = 'lobby'; hideThrowResult(); $('#app').hidden = true; $('#lobby').hidden = false;
  $('#new-game-button').hidden = true; syncModalScreen();
  NcqMetrics.step('lobby_returned'); flow('lobby'); $('#together-button').focus({ preventScroll: true });
}
function requestQuit() {
  if (screen !== 'game' || quitDialog.open) return;
  window.NcqPopup.open(quitDialog); NcqMetrics.step('quit_requested'); flow('quit_confirmation');
}
function resetMatch(sizes = [1, 1]) {
  generation++; renderer.reset(); firstReveal.cancel();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  game = createGame(sizes); busy = false; revealingFirst = false; selectedPiece = null; movingSteps = null;
  notice = null; phase = ''; openingThrower = null; openingRevealed = false; resumeLevel = false; nextTestThrow = null; hideThrowResult();
}
function quitMatch() {
  if (screen !== 'game' || !quitDialog.open) return;
  resetMatch(); hasSavedMatch = false; window.NcqSave.update(data => { data.match = null; });
  NcqMetrics.step('match_quit'); render(); showLobby();
}
function destinations() { return availableDestinations(game, selectedPiece); }
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
  if (busy || game.winner !== null || !availableDestinations(game, id).length) return;
  selectedPiece = id; notice = null;
  NcqMetrics.step('piece_selected'); flow('destination'); render();
}
function showThrowResult() {
  const openingRoll = openingThrower === null ? null : game.opening?.rolls[openingThrower];
  if (openingRoll) { openingRevealed = true; render(); return; }
  const result = game.lastThrow;
  if (!result) return;
  phase = 'result_transfer'; render();
  resultRevealTask = resultMotion.play({
    text: t('out_' + result.outcome), player: result.player,
    getTarget: () => document.querySelector(`.pending-results[data-player="${result.player}"] .result-chip[data-result-id="${result.id}"]`),
    onArrive: () => { arrivingResult = null; render(); },
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
  normalizeSelection();
  const plans = destinations(), plan = plans[0];
  const { pendingLists, openingScores, pieceButtons } = teamView.sync(game, openingThrower ?? game.active);
  $('#app .mode').removeAttribute('data-i18n');
  $('#app .mode').textContent = t('teamMode', { n: teamCount(game) });
  $('#app .mode').hidden = !!game.opening;
  const localNote = $('#settings-dialog .local-note'); localNote.removeAttribute('data-i18n'); localNote.textContent = t('localTeamsNote', { n: teamCount(game) });
  $('#opening-title').hidden = !game.opening || game.opening.winner !== null || busy;
  $('#opening-scores').hidden = !game.opening;
  for (let player = 0; player < teamCount(game); player++) {
    const roll = game.opening?.rolls[player], hidden = openingThrower === player && !openingRevealed;
    const score = openingScores[player];
    score.textContent = hidden ? '' : roll ? t('out_' + roll.outcome) : '';
    score.hidden = !roll || hidden;
    score.setAttribute('aria-label', playerName(player) + ': ' + score.textContent);
  }
  if (game.opening?.winner != null) {
    colorTeam($('#first-player-reveal .first-player-card'), game.opening.winner);
    $('#first-player-reveal .avatar').dataset.member = String(memberIndex(game, game.opening.winner));
    $('#first-player-name').textContent = playerName(game.opening.winner);
  }
  for (const piece of game.pieces) {
    const button = pieceButtons[piece.id], finished = position(piece) === 'finish';
    button.hidden = position(piece) !== 'base';
    const canPlay = !button.hidden && !busy && piece.player === game.active && availableDestinations(game, piece.id).length > 0;
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
  action.disabled = busy || !game.opening && game.winner === null && game.throws === 0 && plans.length !== 1;
  if (revealingFirst) {
    label.textContent = t('startGame'); status.textContent = '';
  } else if (busy && phase === 'result_transfer') {
    label.textContent = t('throw'); status.textContent = '';
  } else if (busy) {
    label.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'move' : 'settle', { n: movingSteps ?? '' });
    status.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'moveHint' : phase === 'flight' ? 'flight' : 'settle');
  } else if (game.opening) {
    const opening = game.opening;
    label.textContent = t(opening.winner !== null ? 'startGame' : 'throw');
    status.textContent = opening.winner !== null ? '' : opening.rolls.every(Boolean) ? t(teamCount(game) > 2 ? 'teamOpeningTie' : 'openingTie') : t('openingPrompt', { player: playerName(game.active) });
  } else if (game.winner !== null) {
    label.textContent = t('newGame'); status.textContent = t('winner', { player: playerName(game.winner) });
    $('#winner-title').textContent = t('winner', { player: playerName(game.winner) });
  } else {
    label.textContent = game.throws > 0 ? t('throw') : plans.length === 1 ? (plan.target === 'finish' ? t('finishAction') : plan.steps < 0 ? t('backward') : t('move', { n: plan.steps })) : plans.length > 1 ? t('chooseDestination') : t('choosePiece');
    status.textContent = notice ? t(notice) : plans.length ? t('moveHint') : game.pending.length ? t('choosePiece') : t('throw');
  }
  $('#settings-button').disabled = busy;
  $('#back-to-lobby').disabled = false;
  const sound = window.NcqSound.enabled('sfx');
  for (const button of [$('#sound-button'), $('#lobby-sound-button')]) button.setAttribute('aria-pressed', String(sound));
  $('#sound-setting').checked = sound;
  $('#board').setAttribute('aria-label', t('rules') + ' · ' + t('moveHint'));
  const playableIds = busy ? [] : game.pieces.filter(piece => piece.player === game.active && availableDestinations(game, piece.id).length).map(piece => piece.id);
  renderer.update({ game, plans: busy ? [] : plans, pieceId: selectedPiece, playableIds, busy });
}
async function performOpeningThrow() {
  if (busy || !game.opening || game.opening.winner !== null) return;
  const player = game.active, token = ++generation, bits = nextTestThrow || randomThrow(); nextTestThrow = null;
  busy = true; openingThrower = player; openingRevealed = false; notice = null; hideThrowResult();
  game = throwForFirst(game, bits); save();
  $('#play-area').dataset.thrower = player === 0 || player === 3 ? 'me' : 'opponent';
  NcqMetrics.step('first_player_roll'); flow('opening_throwing'); phase = 'gather'; render();
  const completed = await renderer.animateThrow(player, game.opening.rolls[player].outcome, bits);
  if (!completed || token !== generation) return;
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
  busy = false; revealingFirst = false; flow('opening'); render();
}
function startAfterOpening() {
  if (busy || game.opening?.winner == null) return;
  game = beginGame(game); notice = null; hideThrowResult(); save();
  NcqMetrics.step('first_player_decided'); flow('ready'); render();
}
async function performThrow() {
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
  resetMatch(game.teams?.map(team => team.size) ?? [1, 1]); save();
  NcqMetrics.step('new_game'); flow('opening'); render();
}
action.addEventListener('click', () => { if (game.opening) { if (game.opening.winner !== null) startAfterOpening(); else void performOpeningThrow(); } else if (game.winner !== null) startNewGame(); else if (game.throws > 0) void performThrow(); else if (selection()) void performMove(); });
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
  if (!busy && game.opening?.winner != null && !game.opening.revealed) void revealFirstPlayer();
  else if (!busy && game.winner !== null) window.NcqPopup.open($('#winner-dialog'));
});
$('#language-select').addEventListener('change', event => { NcqLang.set(event.target.value); NcqMetrics.step('language_changed'); });
NcqLang.onChange(() => { setLanguageMenu(); teamSetup.render(); render(); document.title = t('title'); });
$('#feedback-button').hidden = !NcqFeedback.can();
$('#feedback-button').addEventListener('click', async () => { await NcqFeedback.open(); });
window.ncqBack = () => {
  if (NcqFeedback.isOpen()) { NcqFeedback.close(); return true; }
  if (window.NcqPopup.back()) return true;
  if (screen === 'game') { requestQuit(); return true; }
  return false;
};
$('#app-version').textContent = window.NCQ?.NCQ_VERSION ? 'v' + window.NCQ.NCQ_VERSION : 'dev';
// NCQ_TEST_DICE: 윷 결과와 판 상태를 지정하는 개발용 검사 도구
if (window.NCQ_TEST_DICE) window.__yutTest = {
  state: () => structuredClone(game), next: bits => { nextTestThrow = bits; },
  load: state => { const valid = restoreGame(state); if (!valid) throw new Error('Invalid test state'); generation++; renderer.cancel(); firstReveal.cancel(); revealingFirst = false; game = valid; busy = false; selectedPiece = null; movingSteps = null; notice = null; openingThrower = null; hideThrowResult(); save(); render(); },
};
NcqMetrics.step('000_loading_done'); if (restored) NcqMetrics.step('saved_game_restored');
$('#new-game-button').hidden = true; syncModalScreen();
flow('lobby'); setLanguageMenu(); render(); document.title = t('title');
