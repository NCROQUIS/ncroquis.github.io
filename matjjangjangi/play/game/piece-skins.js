// Cosmetic IDs are shared with the server allow-list. Bodies are always light.
export const PIECE_STYLES = Object.freeze(['reference','classic','glossy','vintage','gilded','porcelain','jade','lacquer','ocean','soda','quartz','marble','sapphire','sakura','aurora']);
export const DEFAULT_PIECE_STYLE = 'reference';
export const normalizePieceStyle = style => PIECE_STYLES.includes(style) ? style : DEFAULT_PIECE_STYLE;

export function pieceStyleForSeat(game, seat, localStyle = DEFAULT_PIECE_STYLE) {
  if (seat !== 1 && seat !== 2) return DEFAULT_PIECE_STYLE;
  // A round's server snapshot also belongs to spectators and replays.
  if (Array.isArray(game?.pieceStyles)) return normalizePieceStyle(game.pieceStyles[seat - 1]);
  // Old rounds never borrow the viewer's choice for the opponent.
  return game?.you === seat && !game.sharedView ? normalizePieceStyle(localStyle) : DEFAULT_PIECE_STYLE;
}

export function applyPreviewPieceStyles(preview, choice, game) {
  const own = game?.you === 2 ? 2 : 1;
  for (const cell of preview.querySelectorAll('.cell')) {
    const seat = Number(cell.dataset.stone);
    cell.dataset.stoneStyle = seat === own ? normalizePieceStyle(choice) : pieceStyleForSeat(game, seat);
    const index = Number(cell.dataset.index);
    if (Number.isInteger(index)) {
      const point = own === 2 ? 89 - index : index;
      cell.style.gridArea = `${Math.floor(point / 9) + 1} / ${point % 9 + 1}`;
    }
  }
}
