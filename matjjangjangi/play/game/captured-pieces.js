import { KING, GLYPHS, sideOf } from './rules.js';
import { pieceStyleForSeat } from './piece-skins.js';
import { setPieceGlyph } from './piece-glyph.js';

const inventory = [0, 1, 2, 2, 2, 2, 2, 5];
const order = [3, 4, 5, 6, 2, 7];
// Derive from the shown position, so undo/replay and rejected optimistic moves restore the piles.
export function capturedPieces(board, side) {
  if (!Array.isArray(board) || board.length !== 90 || ![1, 2].includes(side) ||
      !board.includes(KING) || !board.includes(-KING)) return [];
  const remaining = Array(8).fill(0);
  for (const piece of board) if (sideOf(piece) === side) remaining[Math.abs(piece)]++;
  return order.map(kind => ({ kind, count: Math.max(0, inventory[kind] - remaining[kind]) })).filter(p => p.count);
}

export function capturedToken(piece, style, index = 0) {
  const token = document.createElement('span'); token.className = 'jangi-captured-token';
  token.dataset.stoneStyle = style; token.style.setProperty('--pile-index', index);
  const shadow = document.createElement('span'); shadow.className = 'stone-shadow';
  const body = document.createElement('span'); body.className = 'stone ' + (sideOf(piece) === 1 ? 'black' : 'white');
  body.dataset.kind = Math.abs(piece); setPieceGlyph(body, GLYPHS[sideOf(piece)][Math.abs(piece) - 1]);
  token.append(shadow, body); return token;
}

export function renderCapturedPieces(node, { game, board, capturedSide, localStyle, label, t, reserveEmpty = false }) {
  const groups = game.summaryOnly ? [] : capturedPieces(board, capturedSide);
  node.hidden = !reserveEmpty && groups.length === 0;
  const seat=capturedSide===1?game.black??1:3-(game.black??1);
  const style = pieceStyleForSeat(game, seat, localStyle);
  const text = groups.map(({kind,count}) => GLYPHS[capturedSide][kind - 1] + ' × ' + count).join(', ');
  const description = t(label, { pieces: text || t('jangiCapturedNone') });
  const key = JSON.stringify([groups, capturedSide, style, description]);
  if (node.dataset.piecesKey === key) return;
  node.dataset.piecesKey = key;
  node.dataset.side = capturedSide;
  node.setAttribute('aria-label', description);
  node.replaceChildren();
  for (const {kind,count} of groups) {
    const pile = document.createElement('span');
    pile.className = 'jangi-captured-pile'; pile.dataset.kind = kind; pile.dataset.count = count;
    pile.style.setProperty('--pile-count', count); pile.setAttribute('aria-hidden', 'true');
    for (let n = 0; n < count; n++) {
      pile.append(capturedToken((capturedSide === 1 ? 1 : -1) * kind, style, n));
    }
    node.append(pile);
  }
}
