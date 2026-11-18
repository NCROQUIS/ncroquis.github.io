export const REFILL_MS = 30_000;
export const isCumulativeClock = game => game?.clock?.kind === 'cumulative-v1';

// Server time and the immutable turn deadline also cover refills while offline.
export function clockStatus(game, serverNow) {
  if (!isCumulativeClock(game)) return null;
  const clock = game.clock, index = game.turn - 1;
  const remainingMs = [...clock.remainingMs], refills = [...clock.refills];
  if (game.setup) return { formation: true, remainingMs, refills,
    formationMs: Math.max(0, clock.deadline - serverNow), expired: serverNow >= clock.deadline };
  const used = serverNow >= clock.deadline
    ? Math.min(refills[index], Math.floor((serverNow - clock.deadline) / REFILL_MS) + 1) : 0;
  const expired = serverNow >= clock.deadline + refills[index] * REFILL_MS;
  refills[index] -= used;
  remainingMs[index] = Math.max(0, clock.deadline + used * REFILL_MS - serverNow);
  return { formation: false, remainingMs, refills, expired,
    periodMs: used ? REFILL_MS : clock.remainingMs[index] };
}

export function clockText(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return seconds > 30 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : String(seconds).padStart(2, '0');
}
