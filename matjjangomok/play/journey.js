// The shared SDK owns sampling, persistence and limits. This file only names game states.
export function reportJourney(mode, state) {
  const NcqMetrics = window.NcqMetrics;
  if (!NcqMetrics) return;
  if (typeof NcqMetrics.flow === "function") NcqMetrics.flow(state, { mode });
  if (typeof NcqMetrics.step !== "function") return;
  if (mode === "app" && state === "lobby") NcqMetrics.step("01_lobby_ready");
  if (mode === "casual" || mode === "tournament") {
    if (state === "matching") NcqMetrics.step("02_online_intent");
    if (state === "first_turn" || state === "intro") NcqMetrics.step("03_online_start");
    if (state === "playing") NcqMetrics.step("04_online_first_move");
    if (state === "result" || state === "finishing") NcqMetrics.step("05_online_first_end");
  }
  if (mode === "ai") {
    if (state === "select") NcqMetrics.step("06_ai_picker_open");
    if (state === "first_turn") NcqMetrics.step("07_ai_start");
    if (state === "playing") NcqMetrics.step("08_ai_first_move");
    if (state === "result" || state === "finishing") NcqMetrics.step("09_ai_first_end");
  }
  if (mode === "together") {
    if (state === "first_turn") NcqMetrics.step("10_together_start");
    if (state === "playing") NcqMetrics.step("11_together_first_move");
    if (state === "result") NcqMetrics.step("12_together_first_end");
  }
}
