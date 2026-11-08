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

  async function token(forceRefresh) {
    try {
      const value = await getToken({ forceRefresh });
      if (typeof value === "string" && /^\S+$/.test(value)) return value;
    } catch {
      // The token provider owns session recovery.
    }
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

  async function request(path, input) {
    const bearer = await token(false);
    try {
      return await send(path, input, bearer, 8000);
    } catch (error) {
      if (error.status !== 401 || !["authFailed", "unauthorized"].includes(error.code)) throw error;
      return send(path, input, await token(true), 8000);
    }
  }

  const room = (code, op) => "/rooms/" + encodeURIComponent(code) + "/" + op;
  return Object.freeze({
    lobby: () => send("/lobby", undefined, undefined, 3500),
    match: (input = {}) => request("/matchmaking", input),
    cancel: ticket => request("/matchmaking/cancel", { ticket }),
    state: code => request(room(code, "state")),
    join: code => request(room(code, "join"), {}),
    move: (code, input) => request(room(code, "move"), input),
    leave: code => request(room(code, "leave"), {}),
    rematch: (code, input) => request(room(code, "rematch"), input),
    profile: () => request("/profile"),
    gameRequest: request,
  });
}

export const NcqBoard = Object.freeze({ create });
if (typeof window !== "undefined") window.NcqBoard = NcqBoard;
