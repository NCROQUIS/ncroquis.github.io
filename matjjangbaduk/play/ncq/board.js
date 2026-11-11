/* NcqBoard — board game API client. */

function boardError(code, status = 0) {
  return Object.assign(new Error(code), { code, status });
}

function create({ apiUrl, getToken }) {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new TypeError("NcqBoard requires an HTTPS API URL");
  }
  const base = url.href.replace(/\/$/, "") + "/api";
  const reads = new Map();
  let identity;

  function clearCache() {
    reads.clear();
  }

  function bindIdentity(bearer) {
    if (identity === bearer) return;
    identity = bearer;
    clearCache();
  }

  function seconds(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || (value < 0 && value !== -1)) {
      throw new TypeError("NcqBoard cooldown must be -1 or a non-negative number of seconds");
    }
    return value;
  }

  // Each caller gets its own JSON value, including the first network response.
  const copy = value => JSON.parse(JSON.stringify(value));

  async function read(path, bearer, cooldown, load) {
    const key = (bearer ? "private:" : "public:") + path;
    const previous = reads.get(key);
    const startedAt = Date.now();
    if (cooldown !== -1 && previous) {
      const age = startedAt - previous.startedAt;
      if (previous.ready && age >= 0 && age < cooldown * 1000) return copy(previous.value);
      if (previous.pending) return previous.pending.then(copy);
    }
    const entry = { startedAt };
    reads.set(key, entry);
    if (reads.size > 256) reads.delete(reads.keys().next().value);
    entry.pending = load().then(value => {
      entry.pending = null;
      // A forced request, write or account change may have superseded this one.
      if (reads.get(key) === entry) {
        if (value && value.error) reads.delete(key);
        else { entry.value = value; entry.ready = true; }
      }
      return value;
    }, error => {
      if (reads.get(key) === entry) reads.delete(key);
      throw error;
    });
    return entry.pending.then(copy);
  }

  async function token(forceRefresh) {
    try {
      const value = await getToken({ forceRefresh });
      if (typeof value === "string" && /^\S+$/.test(value)) return value;
    } catch {
      // The token provider owns session recovery.
    }
    clearCache();
    throw boardError("authFailed", 401);
  }

  async function send(path, input, bearer, timeout) {
    const headers = {};
    if (bearer) headers.Authorization = "Bearer " + bearer;
    if (input !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method: input === undefined ? "GET" : "POST", headers,
      body: input === undefined ? undefined : JSON.stringify(input),
      credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeout),
    });
    const data = await response.json();
    if (!response.ok) throw boardError(data.error ?? data.code ?? "network", response.status);
    return data;
  }

  async function request(path, input, cooldown = 3) {
    seconds(cooldown);
    const bearer = await token(false);
    bindIdentity(bearer);
    const load = async () => {
      try {
        return await send(path, input, bearer, 8000);
      } catch (error) {
        if (error.status !== 401 || !["authFailed", "unauthorized"].includes(error.code)) throw error;
        clearCache();
        const fresh = await token(true);
        bindIdentity(fresh);
        return send(path, input, fresh, 8000);
      }
    };
    if (input === undefined) return read(path, bearer, cooldown, load);
    clearCache();
    try { return await load(); }
    finally { clearCache(); }
  }

  function queued(path, queue, cooldown) {
    if (typeof queue === "number" && cooldown === undefined) {
      cooldown = queue;
      queue = undefined;
    }
    return request(path + (queue ? (path.includes("?") ? "&" : "?") + "queue=" + encodeURIComponent(queue) : ""),
      undefined, cooldown);
  }

  const room = (code, op) => "/rooms/" + encodeURIComponent(code) + "/" + op;
  return Object.freeze({
    lobby: (cooldown = 3) => read("/lobby", undefined, seconds(cooldown),
      () => send("/lobby", undefined, undefined, 3500)),
    spectate: (code, cooldown = -1) => read("/spectate/" + encodeURIComponent(code), undefined, seconds(cooldown),
      () => send("/spectate/" + encodeURIComponent(code), undefined, undefined, 3500)),
    match: (input = {}) => request("/matchmaking", input),
    cancel: ticket => request("/matchmaking/cancel", { ticket }),
    state: (code, cooldown = -1) => request(room(code, "state"), undefined, cooldown),
    join: code => request(room(code, "join"), {}),
    move: (code, input) => request(room(code, "move"), input),
    leave: code => request(room(code, "leave"), {}),
    rematch: (code, input) => request(room(code, "rematch"), input),
    profile: (queue, cooldown) => queued("/profile", queue, cooldown),
    records: (cooldown = 3) => request("/records", undefined, cooldown),
    seats: (code, cooldown = 3) => request(room(code, "seats"), undefined, cooldown),
    leaderboard: (limit = 100, queue, cooldown) => queued("/leaderboard?limit=" + encodeURIComponent(limit), queue, cooldown),
    setName: (nickname, avatar) => request("/name", { nickname, avatar }),
    gameRequest: request,
    clearCache,
  });
}

export const NcqBoard = Object.freeze({ create });
if (typeof window !== "undefined") window.NcqBoard = NcqBoard;
