import { planMove, position } from './game.mjs';

// A destination consumes exactly one result. Equivalent destinations use the
// oldest result, so repeated throws never produce overlapping target controls.
export function availableDestinations(game, pieceId) {
  if (pieceId === null || pieceId === undefined) return [];
  const targets = new Map();
  for (const result of [...game.pending].sort((a, b) => a.id - b.id)) {
    const plan = planMove(game, pieceId, result.id);
    if (plan && !targets.has(plan.target)) targets.set(plan.target, { ...plan, steps: result.steps, outcome: result.outcome });
  }
  return [...targets.values()];
}

export function defaultPieceId(game) {
  if (game.opening || game.winner !== null || !game.pending.length) return null;
  const playable = game.pieces.filter(piece => piece.player === game.active && availableDestinations(game, piece.id).length);
  const deployed = playable.filter(piece => !['base', 'finish'].includes(position(piece)));
  deployed.sort((a, b) => (b.movedAt || 0) - (a.movedAt || 0) || a.id - b.id);
  return deployed[0]?.id ?? playable.find(piece => position(piece) === 'base')?.id ?? null;
}
