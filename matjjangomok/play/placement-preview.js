// A preview never changes the authoritative board, turn or version.
export function previewPlacement(game, index) {
  if (!game || game.phase !== "playing" || game.turn !== game.you || game.opening === "offerFive" || !Number.isInteger(index)
    || index < 0 || index >= game.board.length || game.board[index]) return null;
  return { code: game.code, round: game.round, version: game.version, seat: game.you,
    index, color: game.stone ?? (game.you === (game.black ?? 1) ? 1 : 2), ply: game.moves.length };
}
export function confirmsPlacement(preview, game) {
  return Boolean(preview && game.code === preview.code && game.round === preview.round
    && game.version > preview.version && game.moves[preview.ply] === preview.index
    && game.board[preview.index] === preview.color
    && (!game.moveSeats || game.moveSeats[preview.ply] === preview.seat));
}
