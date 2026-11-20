// The ad SDK completion callback is the reward signal. The server owns quota and crediting.
export function createRewardedCoins({ request, watch, player, changed, credited, uuid = () => crypto.randomUUID() }) {
  let status = null;
  let busy = false;
  let pending = null;
  let owner = null;
  function sync() {
    if (owner !== player()) { owner = player(); status = null; pending = null; }
  }
  return {
    get state() { sync(); return { status, busy, retry: !!pending?.earned }; },
    async refresh() {
      sync();
      const account = owner;
      const result = await request("");
      if (account === player() && !result.error) { status = result.rewardAd; changed(); }
      return result;
    },
    async run() {
      sync();
      if (busy || !owner) return { error: "rewardAdBusy" };
      const account = owner;
      busy = true;
      changed();
      try {
        pending ??= { id: uuid(), earned: false };
        const id = pending.id;
        if (!pending.earned) {
          const start = await request("start", id);
          if (account !== player()) return {};
          if (start.error) { if (start.error !== "network") pending = null; return start; }
          status = start.rewardAd;
          let complete = false;
          try { complete = await watch(); } catch { /* Canceled or unavailable ads never grant. */ }
          if (account !== player()) return {};
          if (!complete) {
            const canceled = await request("cancel", id);
            if (canceled.error !== "network") pending = null;
            return { canceled: true };
          }
          pending.earned = true;
        }
        const result = await request("claim", id);
        if (account !== player()) return {};
        if (!result.error) {
          status = result.rewardAd;
          pending = null;
          credited(result);
        } else if (result.error !== "network") pending = null;
        return result;
      } finally { busy = false; sync(); changed(); }
    },
  };
}
