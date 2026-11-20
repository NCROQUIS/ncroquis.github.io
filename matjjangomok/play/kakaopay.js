// The release pipeline supplies the partner SDK and server-verified account.
// Wait before reading any device save; failed login/save fetch must never create a guest game.
export async function prepareKakaopay(win) {
  if (win.NCQ?.NCQ_KAKAO?.provider !== "neptune") return false;
  if (win.NCQ.NCQ_PLATFORM !== "kakaopay" || !win.NcqKakao || !win.NcqNeptune) {
    throw new Error("Neptune build bridge is missing");
  }
  const state = await win.NcqKakao.ready();
  if (!state.available || !state.membershipReady || !win.NcqNeptune.status().ready) {
    throw new Error("Neptune account and save are not ready");
  }
  return true;
}

// Settings/replay writes are already local. Back up important writes without spamming each field update.
let backupTimer;
export function backupKakaopay(win) {
  if (win.NCQ?.NCQ_KAKAO?.provider !== "neptune" || !win.NcqNeptune?.status().ready) return;
  win.clearTimeout(backupTimer);
  backupTimer = win.setTimeout(() => { void win.NcqNeptune.flush().catch(() => {}); }, 500);
}
