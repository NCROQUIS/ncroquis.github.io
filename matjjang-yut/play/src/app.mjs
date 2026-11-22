import { createGame, restoreGame, position, throwSticks, randomThrow, settleTurn, planMove, legalMoves, movePiece, OUTCOMES } from './game.mjs';
import { t, NcqLang } from './i18n.mjs';
import { createRenderer } from './renderer.mjs';
import { playCapture } from './audio.mjs';

const $ = selector => document.querySelector(selector);
const NcqMetrics = window.NcqMetrics || { levelStart() {}, levelEnd() {}, step() {} };
const NcqFeedback = window.NcqFeedback || { can: () => false, open: async () => false, isOpen: () => false, close() {} };
window.NcqSave.init({ id: 'matjjang-yut', data: { match: null } });
const restored = restoreGame(window.NcqSave.get('match'));
let game = restored || createGame(), busy = false, selectedPiece = null, selectedResult = null;
let notice = restored ? 'restored' : null, phase = '', generation = 0, nextTestThrow = null;
const cards = [$('#my-card'), $('#opponent-card')];
const racks = [$('#my-pieces'), $('#opponent-pieces')];
const status = $('#game-status'), action = $('#main-button'), label = $('#main-label'), results = $('#pending-results');
const resultBox = $('#throw-result');
const renderer = createRenderer($('#board'), { game, onSelect: selectPiece, onMove: performMove, onPhase: value => { phase = value; render(); }, onReveal: showThrowResult });
const pieceButtons = game.pieces.map(piece => {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'piece-button'; button.dataset.piece = String(piece.id);
  button.addEventListener('click', () => selectPiece(piece.id)); racks[piece.player].append(button); return button;
});
window.NcqPopup.watch(document);
window.NcqPopup.sound('wood');
// A modal is its own screen; the covered game action is not that screen's main action.
function syncModalScreen() {
  const modalOpen = !!document.querySelector('dialog[open]');
  $('#app').inert = modalOpen;
  if (modalOpen) action.removeAttribute('data-ncq-main');
  else action.setAttribute('data-ncq-main', 'game action');
}
new MutationObserver(syncModalScreen).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

function save() { window.NcqSave.update(data => { data.match = structuredClone(game); }); }
function flow(state) { window.NcqMetrics?.flow?.(state, { mode: 'local' }); }
function selection() { return selectedPiece === null || selectedResult === null ? null : planMove(game, selectedPiece, selectedResult); }
function playerName(player) { return t(player === 0 ? 'you' : 'opponent'); }
function normalizeSelection() {
  if (!game.pending.some(result => result.id === selectedResult)) selectedResult = game.pending.find(result => legalMoves(game, result.id).length > 0)?.id ?? null;
  if (selectedPiece !== null && !planMove(game, selectedPiece, selectedResult)) selectedPiece = null;
}
function selectPiece(id) {
  if (busy || game.winner !== null) return;
  let plan = planMove(game, id, selectedResult);
  if (!plan) {
    const result = game.pending.find(result => planMove(game, id, result.id));
    if (!result) return;
    selectedResult = result.id;
  }
  selectedPiece = id; notice = null;
  NcqMetrics.step('piece_selected'); flow('destination'); render();
}
function showThrowResult() {
  if (!game.lastThrow) return;
  const result = game.lastThrow, extra = OUTCOMES[result.outcome].extra;
  resultBox.querySelector('.result-name').textContent = t('out_' + result.outcome) + '!';
  resultBox.querySelector('.result-eyebrow').textContent = extra ? t('extra') : playerName(result.player);
  resultBox.querySelector('.result-detail').textContent = result.steps < 0 ? t('backward') : t('move', { n: result.steps });
  resultBox.classList.add('is-visible'); resultBox.setAttribute('aria-hidden', 'false');
}
function hideThrowResult() { resultBox.classList.remove('is-visible'); resultBox.setAttribute('aria-hidden', 'true'); }
function setLanguageMenu() {
  const select = $('#language-select'); select.replaceChildren();
  for (const language of NcqLang.list()) {
    const option = document.createElement('option'); option.value = language.code; option.textContent = language.name; option.selected = language.code === NcqLang.lang; select.append(option);
  }
  $('#language-label').textContent = t('language') + (NcqLang.lang === 'en' ? '' : ' · Language');
}
function render() {
  normalizeSelection();
  const plan = selection();
  for (let player = 0; player < 2; player++) {
    const active = game.active === player;
    cards[player].classList.toggle('is-active', active);
    if (active) cards[player].setAttribute('aria-current', 'true'); else cards[player].removeAttribute('aria-current');
  }
  for (const piece of game.pieces) {
    const button = pieceButtons[piece.id], finished = position(piece) === 'finish';
    const canPlay = !busy && piece.player === game.active && game.pending.some(result => planMove(game, piece.id, result.id));
    button.disabled = !canPlay;
    button.classList.toggle('is-finished', finished);
    button.classList.toggle('is-playable', canPlay);
    button.classList.toggle('is-selected', !!plan?.stackIds.includes(piece.id));
    button.setAttribute('aria-label', playerName(piece.player) + ' · ' + t('piece', { n: piece.id % 4 + 1 }));
    button.setAttribute('aria-pressed', String(!!plan?.stackIds.includes(piece.id)));
  }
  results.replaceChildren();
  if (!busy) for (const result of game.pending) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'result-chip'; chip.textContent = t('out_' + result.outcome);
    chip.setAttribute('aria-pressed', String(result.id === selectedResult)); chip.dataset.resultId = String(result.id);
    chip.disabled = legalMoves(game, result.id).length === 0;
    chip.addEventListener('click', () => { selectedResult = result.id; selectedPiece = null; notice = null; NcqMetrics.step('result_selected'); render(); }); results.append(chip);
  }
  const chosen = game.pending.find(result => result.id === selectedResult);
  action.disabled = busy || game.winner === null && !plan && game.throws === 0;
  if (busy) {
    label.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'move' : 'settle', { n: chosen?.steps || '' });
    status.textContent = t(phase === 'gather' || phase === 'charge' ? 'gather' : phase === 'moving' ? 'moveHint' : phase === 'flight' ? 'flight' : 'settle');
  } else if (game.winner !== null) {
    label.textContent = t('newGame'); status.textContent = t('winner', { player: playerName(game.winner) });
    $('#winner-title').textContent = t('winner', { player: playerName(game.winner) });
  } else {
    label.textContent = plan ? (chosen.steps < 0 ? t('backward') : t('move', { n: chosen.steps })) : game.throws > 0 ? t('throw') : t('choosePiece');
    status.textContent = notice ? t(notice) : plan ? t('moveHint') : game.pending.length ? t('choosePiece') : t('throw');
  }
  $('#settings-button').disabled = busy;
  const sound = window.NcqSound.enabled('sfx');
  $('#sound-button').setAttribute('aria-pressed', String(sound)); $('#sound-setting').checked = sound;
  $('#board').setAttribute('aria-label', t('rules') + ' · ' + t('moveHint'));
  renderer.update({ game, plan: busy ? null : plan, pieceId: selectedPiece, busy });
}
async function performThrow() {
  if (busy || game.throws < 1 || game.winner !== null) return;
  busy = true; notice = null; selectedPiece = null; hideThrowResult();
  const token = ++generation, player = game.active;
  if (game.action === 0) { NcqMetrics.levelStart('local', { round: game.id }); NcqMetrics.step('001_first_game_start'); }
  const bits = nextTestThrow || randomThrow(); nextTestThrow = null;
  game = throwSticks(game, bits); save();
  $('#play-area').dataset.thrower = player === 0 ? 'me' : 'opponent';
  NcqMetrics.step('first_throw'); flow('throwing'); phase = 'gather'; render();
  const completed = await renderer.animateThrow(player, game.lastThrow.outcome, bits);
  if (!completed || token !== generation) return;
  hideThrowResult(); busy = false; phase = '';
  game = settleTurn(game); notice = game.lastPass ? 'pass' : OUTCOMES[game.lastThrow.outcome].extra ? 'extra' : null;
  if (game.lastPass) NcqMetrics.step('backdo_pass');
  if (OUTCOMES[game.lastThrow.outcome].extra) NcqMetrics.step('extra_throw');
  NcqMetrics.step('throw_result'); flow(game.pending.length ? 'choose_piece' : 'ready'); save(); render();
}
async function performMove() {
  const plan = selection(); if (busy || !plan) return;
  busy = true; phase = 'moving'; hideThrowResult(); const token = ++generation; render();
  const completed = await renderer.animateMove(plan);
  if (!completed || token !== generation) return;
  game = movePiece(game, plan.pieceId, plan.resultId); busy = false; selectedPiece = null;
  notice = plan.captured.length ? 'capture' : plan.target === 'finish' ? 'finish' : null;
  if (plan.captured.length) { playCapture(); NcqMetrics.step('first_capture'); }
  if (plan.stackIds.length > 1) NcqMetrics.step('stack_moved');
  if (plan.target === 'finish') NcqMetrics.step('first_piece_home');
  NcqMetrics.step('first_move'); save(); render();
  if (game.winner !== null) {
    NcqMetrics.levelEnd('local', game.winner === 0); NcqMetrics.step('first_game_complete'); flow('result');
    $('#winner-title').textContent = t('winner', { player: playerName(game.winner) }); window.NcqPopup.open($('#winner-dialog'));
  } else flow(game.pending.length ? 'choose_piece' : 'ready');
}
function startNewGame() {
  generation++; renderer.cancel();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  game = createGame(); busy = false; selectedPiece = null; selectedResult = null; notice = null; phase = ''; hideThrowResult(); save();
  NcqMetrics.step('new_game'); flow('ready'); render();
}
action.addEventListener('click', () => { if (game.winner !== null) startNewGame(); else if (selection()) void performMove(); else void performThrow(); });
$('#sound-button').addEventListener('click', () => { window.NcqSound.enabled('sfx', !window.NcqSound.enabled('sfx')); NcqMetrics.step('sound_changed'); render(); });
$('#sound-setting').addEventListener('change', event => { window.NcqSound.enabled('sfx', event.target.checked); render(); });
$('#settings-button').addEventListener('click', () => { setLanguageMenu(); window.NcqPopup.open($('#settings-dialog')); NcqMetrics.step('settings_open'); flow('settings'); });
$('#new-game-button').addEventListener('click', () => window.NcqPopup.open($('#restart-dialog')));
$('#confirm-new-game').addEventListener('click', startNewGame); $('#play-again-button').addEventListener('click', startNewGame);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('#settings-dialog').addEventListener('close', () => flow(game.winner !== null ? 'result' : 'ready'));
$('#language-select').addEventListener('change', event => { NcqLang.set(event.target.value); NcqMetrics.step('language_changed'); });
NcqLang.onChange(() => { setLanguageMenu(); render(); document.title = t('title'); });
$('#feedback-button').hidden = !NcqFeedback.can();
$('#feedback-button').addEventListener('click', async () => { await NcqFeedback.open(); });
window.ncqBack = () => { if (NcqFeedback.isOpen()) { NcqFeedback.close(); return true; } return window.NcqPopup.back(); };
$('#app-version').textContent = window.NCQ?.NCQ_VERSION ? 'v' + window.NCQ.NCQ_VERSION : 'dev';
// NCQ_TEST_DICE: 윷 결과와 판 상태를 지정하는 개발용 검사 도구
if (window.NCQ_TEST_DICE) window.__yutTest = {
  state: () => structuredClone(game), next: bits => { nextTestThrow = bits; },
  load: state => { const valid = restoreGame(state); if (!valid) throw new Error('Invalid test state'); generation++; renderer.cancel(); game = valid; busy = false; selectedPiece = null; selectedResult = null; notice = null; save(); render(); },
};
NcqMetrics.step('000_loading_done'); if (restored) NcqMetrics.step('saved_game_restored');
if (restored?.action > 0 && game.winner === null) NcqMetrics.levelStart('local', { round: game.id });
flow(game.pending.length ? 'choose_piece' : 'ready'); setLanguageMenu(); render(); document.title = t('title');
