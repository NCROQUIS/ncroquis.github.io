/* 도쿠덕 관측 연결. 전송·최초 도달 중복 제거·관측 한도는 회사 NcqMetrics가 담당한다. */
(function () {
  'use strict';
  let observation = { v: 1, enrolled: false, excluded: false };
  const started = new Set(), active = new Map();
  let sequence = 0;
  function safe(fn) { try { fn(); return true; } catch (e) { return false; } }
  function enabled() { return !observation.excluded; }
  function first(fn, diagnostic) {
    if (enabled() && (observation.enrolled || diagnostic)) safe(fn);
  }
  // 이름은 출시 검사기가 읽을 수 있도록 글자로 유지한다.
  const steps = {
    boot: () => window.NcqMetrics?.step?.("001_boot_ready"),
    tutorial_start: () => window.NcqMetrics?.step?.("002_tutorial_start"),
    tut_duck1_prompt: () => window.NcqMetrics?.step?.("003_tut_duck1_prompt"),
    tut_duck1_done: () => window.NcqMetrics?.step?.("004_tut_duck1_done"),
    tut_color_prompt: () => window.NcqMetrics?.step?.("005_tut_color_prompt"),
    tut_color_ack: () => window.NcqMetrics?.step?.("006_tut_color_ack"),
    tut_x_prompt: () => window.NcqMetrics?.step?.("007_tut_x_prompt"),
    tut_x_done: () => window.NcqMetrics?.step?.("008_tut_x_done"),
    tut_duck2_prompt: () => window.NcqMetrics?.step?.("009_tut_duck2_prompt"),
    tut_duck2_done: () => window.NcqMetrics?.step?.("010_tut_duck2_done"),
    tut_drag_prompt: () => window.NcqMetrics?.step?.("011_tut_drag_prompt"),
    tut_drag_done: () => window.NcqMetrics?.step?.("012_tut_drag_done"),
    tut_duck3_prompt: () => window.NcqMetrics?.step?.("013_tut_duck3_prompt"),
    tut_duck3_done: () => window.NcqMetrics?.step?.("014_tut_duck3_done"),
    tut_hint_prompt: () => window.NcqMetrics?.step?.("015_tut_hint_prompt"),
    tut_hint_open: () => window.NcqMetrics?.step?.("016_tut_hint_open"),
    tut_hint_apply: () => window.NcqMetrics?.step?.("017_tut_hint_apply"),
    tutorial_clear: () => window.NcqMetrics?.step?.("018_tutorial_clear"),
    tutorial_result: () => window.NcqMetrics?.step?.("019_tutorial_result"),
    main_first_start: () => window.NcqMetrics?.step?.("020_main_first_start"),
    main_first_action: () => window.NcqMetrics?.step?.("021_main_first_action"),
    main_first_clear: () => window.NcqMetrics?.step?.("022_main_first_clear"),
    main_first_result: () => window.NcqMetrics?.step?.("023_main_first_result"),
    main_second_start: () => window.NcqMetrics?.step?.("024_main_second_start"),
    stage3_start: () => window.NcqMetrics?.step?.("025_stage3_start"),
    stage3_clear: () => window.NcqMetrics?.step?.("026_stage3_clear"),
    stage5_start: () => window.NcqMetrics?.step?.("027_stage5_start"),
    stage5_clear: () => window.NcqMetrics?.step?.("028_stage5_clear"),
    stage8_start: () => window.NcqMetrics?.step?.("029_stage8_start"),
    stage8_clear: () => window.NcqMetrics?.step?.("030_stage8_clear"),
    stage10_start: () => window.NcqMetrics?.step?.("031_stage10_start"),
    stage10_clear: () => window.NcqMetrics?.step?.("032_stage10_clear"),
    stage12_start: () => window.NcqMetrics?.step?.("033_stage12_start"),
    stage12_clear: () => window.NcqMetrics?.step?.("034_stage12_clear"),
    stage21_start: () => window.NcqMetrics?.step?.("035_stage21_start"),
    stage21_clear: () => window.NcqMetrics?.step?.("036_stage21_clear"),
    locate_intro: () => window.NcqMetrics?.step?.("locate_intro_shown"),
    locate_start: () => window.NcqMetrics?.step?.("locate_trial_start"),
    locate_done: () => window.NcqMetrics?.step?.("locate_trial_done"),
    frog_intro: () => window.NcqMetrics?.step?.("frog_intro_shown"),
    frog_start: () => window.NcqMetrics?.step?.("frog_trial_start"),
    frog_done: () => window.NcqMetrics?.step?.("frog_trial_done"),
    draft_intro: () => window.NcqMetrics?.step?.("draft_intro_shown"),
    draft_start: () => window.NcqMetrics?.step?.("draft_trial_start"),
    draft_done: () => window.NcqMetrics?.step?.("draft_trial_done"),
    hint_open: () => window.NcqMetrics?.step?.("hint_first_open"),
    hint_apply: () => window.NcqMetrics?.step?.("hint_first_apply"),
    mistake: () => window.NcqMetrics?.step?.("main_first_mistake"),
    hearts_empty: () => window.NcqMetrics?.step?.("first_hearts_empty"),
    fail_retry: () => window.NcqMetrics?.step?.("first_fail_retry"),
    revive: () => window.NcqMetrics?.step?.("first_revive_applied"),
    tool_empty: () => window.NcqMetrics?.step?.("first_tool_empty"),
    daily_unlocked: () => window.NcqMetrics?.step?.("daily_unlocked"),
    daily_start: () => window.NcqMetrics?.step?.("daily_first_start"),
    daily_clear: () => window.NcqMetrics?.step?.("daily_first_clear"),
    practice_start: () => window.NcqMetrics?.step?.("practice_first_start"),
    save_read_failed: () => window.NcqMetrics?.step?.("save_read_failed"),
    save_write_failed: () => window.NcqMetrics?.step?.("save_write_failed"),
    saved_main_resume: () => window.NcqMetrics?.step?.("saved_main_resume"),
    saved_daily_resume: () => window.NcqMetrics?.step?.("saved_daily_resume")
  };
  function step(key, diagnostic) { if (steps[key]) first(steps[key], diagnostic); }
  function init(save, origin) {
    const old = save.observation;
    observation = old && old.v === 1 && typeof old.enrolled === 'boolean' && typeof old.excluded === 'boolean'
      ? old : { v: 1, enrolled: origin === 'fresh', excluded: false };
    save.observation = observation;
  }
  function exclude() { observation.excluded = true; observation.enrolled = false; }
  function mode(g) {
    if (!g) return 'app';
    if (g.mode === 'daily') return g.practice ? 'practice' : 'daily';
    if (g.mode === 'main') return g.tier === 2 ? 'main_super' : g.tier === 1 ? 'main_hard' : 'main';
    return 'tutorial';
  }
  function flow(state, g) {
    if (enabled()) safe(() => window.NcqMetrics?.flow?.(state, { mode: mode(g) }));
  }
  function name(g) { return g.mode === 'main' ? 'stage-' + g.level : mode(g); }
  function prepare(g) {
    if (!g.metrics || typeof g.metrics.key !== 'string' || g.metrics.key.length > 128) {
      // 기기 안의 표본 키. SDK가 이벤트 값으로 전송하지 않는다.
      g.metrics = { key: Date.now().toString(36) + '_' + (++sequence) + '_' + Math.random().toString(36).slice(2), ended: false, acted: false };
    }
    return g.metrics;
  }
  function start(g) {
    const m = prepare(g), sdk = window.NcqMetrics;
    if (!enabled() || m.ended || started.has(m.key) || typeof sdk?.levelStart !== 'function') return;
    if (safe(() => window.NcqMetrics.levelStart(name(g), { round: m.key }))) {
      started.add(m.key); active.set(name(g), m.key);
    }
    // SDK 8도 재실행의 level_start는 새 전송 구간이다. 표본 키만 재사용한다.
  }
  function end(g, success) {
    const m = prepare(g);
    if (!enabled() || m.ended || active.get(name(g)) !== m.key) return;
    m.ended = true;
    safe(() => window.NcqMetrics && window.NcqMetrics.levelEnd && window.NcqMetrics.levelEnd(name(g), success, { score: g.score }));   // 출시 서버가 이 모양을 찾아요
    active.delete(name(g));
  }
  function checkpoint(g, phase) {
    if (g.mode === 'tutorial') return step('tutorial_' + phase);
    if (g.mode === 'daily') {
      if (phase === 'start') step(g.practice ? 'practice_start' : 'daily_start');
      else if (phase === 'clear' && !g.practice) step('daily_clear');
      return;
    }
    if (g.level === 1) step('main_first_' + phase);
    else if (g.level === 2 && phase === 'start') step('main_second_start');
    else if ([3, 5, 8, 10, 12, 21].includes(g.level) && (phase === 'start' || phase === 'clear')) step('stage' + g.level + '_' + phase);
  }
  function action(g) {
    const m = prepare(g);
    if (!m.acted) { m.acted = true; checkpoint(g, 'action'); }
  }
  const prompts = ['', 'tut_duck1_prompt', 'tut_color_prompt', 'tut_x_prompt', 'tut_duck2_prompt', 'tut_drag_prompt', 'tut_duck3_prompt', 'tut_hint_prompt'];
  const states = ['', 'tut_duck1', 'tut_color', 'tut_x', 'tut_duck2', 'tut_drag', 'tut_duck3', 'tut_hint', 'tut_finish'];
  function tutorialPrompt(n, g) { if (prompts[n]) step(prompts[n]); flow(states[n] || 'tut_finish', g); }
  function tutorialDone(n) { const k = { 1: 'tut_duck1_done', 3: 'tut_x_done', 4: 'tut_duck2_done', 5: 'tut_drag_done', 6: 'tut_duck3_done' }[n]; if (k) step(k); }
  window.DokuMetrics = { init, exclude, step, flow, prepare, start, end, checkpoint, action, tutorialPrompt, tutorialDone, mode };
})();

