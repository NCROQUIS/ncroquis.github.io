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

export function renderCapturedPieces(node, { game, board, capturedSide, localStyle, label, t }) {
  const groups = game.summaryOnly ? [] : capturedPieces(board, capturedSide);
  node.hidden = groups.length === 0;
  const style = pieceStyleForSeat(game, capturedSide, localStyle);
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
      const token = document.createElement('span'); token.className = 'jangi-captured-token';
      token.dataset.stoneStyle = style; token.style.setProperty('--pile-index', n);
      const shadow = document.createElement('span'); shadow.className = 'stone-shadow';
      const body = document.createElement('span'); body.className = 'stone ' + (capturedSide === 1 ? 'black' : 'white');
      body.dataset.kind = kind; setPieceGlyph(body, GLYPHS[capturedSide][kind - 1]);
      token.append(shadow, body); pile.append(token);
    }
    node.append(pile);
  }
}
