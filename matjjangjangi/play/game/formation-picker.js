import { initial, GLYPHS, HORSE } from './rules.js';
import { pieceStyleForSeat } from './piece-skins.js';

// Read the same back-rank positions as the rules engine. Opponents face the viewer.
export function formationPieces(formation, opponent = false) {
  const board = initial({ choFormation: formation }).board;
  const pieces = [82, 83, 87, 88].map(index => board[index]);
  return opponent ? pieces.reverse() : pieces;
}

export function confirmedFormation(game, seat) {
  const action = game?.actions?.findLast(action => action.type === 'formation' && action.seat === seat);
  return Number.isInteger(action?.formation) && action.formation >= 0 && action.formation < 4 ? action.formation : null;
}

function drawPieces(element, kinds, seat, style) {
  element.dataset.stoneStyle = style;
  const key = `${seat}:${kinds?.join(',') ?? 'pending'}`;
  if (element.dataset.pieces === key) return;
  element.dataset.pieces = key;
  element.replaceChildren(...(kinds ?? [null, null, null, null]).map(kind => {
    const piece = document.createElement('span');
    piece.className = 'jangi-formation-piece';
    if (kind === null) {
      piece.classList.add('pending'); piece.textContent = '?';
    } else {
      const shadow = document.createElement('span'); shadow.className = 'jangi-formation-shadow';
      const face = document.createElement('span'); face.className = `stone ${seat === 1 ? 'black' : 'white'}`;
      face.dataset.kind = kind; face.textContent = GLYPHS[seat][kind - 1];
      piece.append(shadow, face);
    }
    return piece;
  }));
}

export function renderFormationPicker(dialog, game, { t, busy = false, localPieceStyle }) {
  dialog.querySelector('.jangi-formation-hint').textContent = t(game.clock?.kind === 'cumulative-v1' ? 'jangiFormationHint' : 'jangiFormationHintLegacy');
  const seat = game.you, opponent = 3 - seat, formation = confirmedFormation(game, opponent);
  const round = `${game.code}:${game.round}`;
  if (dialog.dataset.round !== round) {
    dialog.dataset.round = round;
    dialog.querySelector('[name="formation"][value="0"]').checked = true;
  }
  for (const option of dialog.querySelectorAll('.jangi-formation-choice')) {
    const input = option.querySelector('input'); input.disabled = busy;
    drawPieces(option.querySelector('.jangi-formation-pieces'), formationPieces(Number(input.value)), seat, pieceStyleForSeat(game, seat, localPieceStyle));
  }
  const preview = dialog.querySelector('#jangi-opponent-formation');
  preview.dataset.confirmed = String(formation !== null);
  preview.querySelector('strong').textContent = t('jangiOpponentFormation', { side: t(opponent === 1 ? 'black' : 'white') });
  preview.querySelector('.jangi-formation-state').textContent = t(formation === null ? 'jangiFormationNotChosen' : 'jangiFormationChosen');
  drawPieces(preview.querySelector('.jangi-formation-pieces'), formation === null ? null : formationPieces(formation, true), opponent, pieceStyleForSeat(game, opponent, localPieceStyle));
  preview.setAttribute('aria-label', formation === null ? t('jangiOpponentFormationPending')
    : t('jangiOpponentFormationSummary', { side: t(opponent === 1 ? 'black' : 'white'), pieces: formationPieces(formation, true).map(kind => t(kind === HORSE ? 'jangiHorse' : 'jangiElephant')).join(' · ') }));
  const confirm = dialog.querySelector('button[type="submit"]');
  confirm.disabled = busy;
  confirm.textContent = t(busy ? 'jangiFormationSaving' : 'jangiFormationConfirm');
}
