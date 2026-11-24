// Anchor to server time, so device clock changes cannot add time to a turn.
export function roomClock(room,receivedAt=performance.now()) {
  if(room?.phase!=='playing'||room.state?.ncqAutomation?.protocol!=='ncq-board-autoplay-v1'
    ||![room.actionStartsAt,room.actionEndsAt,room.serverNow].every(Number.isFinite))return null;
  return {receivedAt,start:room.actionStartsAt-room.serverNow,end:room.actionEndsAt-room.serverNow,
    seconds:room.state.ncqAutomation.timeoutSeconds};
}
export function remainingSeconds(clock,now=performance.now()) {
  return clock?Math.max(0,Math.min(clock.seconds,Math.ceil((clock.end-(now-clock.receivedAt))/1000))):null;
}
