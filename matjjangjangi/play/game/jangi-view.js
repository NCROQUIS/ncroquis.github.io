import { initial, legalMoves, sideOf, GLYPHS, KING, inCheck } from './rules.js';
import { pieceStyleForSeat } from './piece-skins.js';
import { setPieceGlyph } from './piece-glyph.js';

export { sideOf, GLYPHS, KING, inCheck };
export const destination = move => typeof move === 'object' ? move.to : move;
export function replayBoard(game, ply) {
  const board = initial({ choFormation: game.formations?.[0] ?? 0, hanFormation: game.formations?.[1] ?? 0 }).board;
  for (const move of game.moves.slice(0, ply)) {
    if (!move || typeof move !== 'object' || !Number.isInteger(move.from) || !Number.isInteger(move.to)) continue;
    board[move.to] = board[move.from]; board[move.from] = 0;
  }
  return board;
}
export const targetsFrom = (game, from) => game?.board && from !== null && !game.setup
  ? legalMoves(game.board, game.turn).filter(move => move.from === from).map(move => move.to) : [];

export function drawJangiBoard({ game, displayedBoard, cells, selectedFrom, selected, lastMoveMarker, board, selectable, coordinate, t, latest, moveNumbers, pendingMove, localPieceStyle }) {
  const targets = selectable ? targetsFrom(game, selectedFrom) : [];
  const checked = inCheck(displayedBoard, game.turn);
  const flipped = game.you === 2;
  board.dataset.jangi = ''; board.classList.toggle('selectable', selectable);
  const move = game.moves[(latest ? game.moves.length : game.displayPly) - 1];
  const last = pendingMove?.index ?? destination(move), lastCell = cells[last];
  lastMoveMarker.toggleAttribute('hidden', !lastCell);
  if (lastCell && lastMoveMarker.parentElement !== lastCell) lastCell.append(lastMoveMarker);
  for (const [index, cell] of cells.entries()) {
    const piece = displayedBoard[index] || 0, side = sideOf(piece), kind = Math.abs(piece);
    const chosen = selectable && selectedFrom === index;
    const target = selectable && selected === index;
    cell.dataset.stone = side; cell.dataset.kind = kind;
    cell.style.order = flipped ? 89 - index : index;
    cell.classList.toggle('selected-piece', chosen);
    cell.classList.toggle('selected', target);
    cell.classList.toggle('jangi-legal', targets.includes(index));
    cell.classList.toggle('jangi-check', kind === KING && side === game.turn && checked);
    const token = cell.firstElementChild;
    const preview = target && !piece ? displayedBoard[selectedFrom] : piece;
    cell.dataset.stoneStyle = pieceStyleForSeat(game, sideOf(preview), localPieceStyle);
    token.hidden = !preview;
    token.dataset.kind = Math.abs(preview);
    token.className = 'stone ' + (sideOf(preview) === 2 ? 'white' : 'black');
    setPieceGlyph(token, preview ? GLYPHS[sideOf(preview)][Math.abs(preview) - 1] : '');
    cell.toggleAttribute('data-number', Boolean(moveNumbers?.[index]));
    if (moveNumbers?.[index]) cell.dataset.number = moveNumbers[index];
    cell.setAttribute('aria-label', coordinate(index) + ' ' + (piece ? t(side === 1 ? 'black' : 'white') + ' ' + GLYPHS[side][kind - 1] : t('jangiEmpty')));
    cell.setAttribute('aria-selected', String(chosen || target));
    cell.setAttribute('aria-disabled', String(!selectable || (side !== game.you && !targets.includes(index))));
  }
}

export function jangiGridPath() {
  const parts = [];
  for (let x = 0; x < 9; x++) parts.push(`M${x + .5} .5V9.5`);
  for (let y = 0; y < 10; y++) parts.push(`M.5 ${y + .5}H8.5`);
  parts.push('M3.5 .5 5.5 2.5M5.5 .5 3.5 2.5M3.5 7.5 5.5 9.5M5.5 7.5 3.5 9.5');
  return parts.join(' ');
}

export function installJangiArtwork() {
  document.getElementById('board-line-path').setAttribute('d', jangiGridPath());
  for (const svg of document.querySelectorAll('svg.board-lines')) svg.setAttribute('viewBox', '0 0 9 10');
  const image = document.querySelector('.lobby-board-image');
  image.src = './assets/jangi-lobby.svg';
  for (const image of document.querySelectorAll('.logo-stones image,.start-stones image')) image.setAttribute('href','./assets/jangi-pair.svg');
  const preview = document.querySelector('.appearance-preview-grid');
  if (preview) {
    for (const cell of preview.querySelectorAll('.cell')) cell.remove();
    for (const [index,piece] of initial().board.entries()) {
      if (!piece) continue;
      const cell=document.createElement('span'); cell.className='cell'; cell.dataset.stone=sideOf(piece); cell.dataset.index=index; cell.style.gridArea=`${Math.floor(index/9)+1} / ${index%9+1}`;
      const token=document.createElement('span'); token.className='stone '+(piece>0?'black':'white'); token.dataset.kind=Math.abs(piece); setPieceGlyph(token,GLYPHS[sideOf(piece)][Math.abs(piece)-1]);
      const shadow=document.createElement('span'); shadow.className='stone-shadow';
      cell.append(token,shadow); preview.append(cell);
    }
  }
  for (const span of document.querySelectorAll('.shop-preview-stone')) span.classList.add('jangi-piece-sample');
}
