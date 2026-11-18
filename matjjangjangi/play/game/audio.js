import { inCheck, sideOf } from './rules.js';
import { createLoopMusic } from './loop-music.js';
import { GUGAK_AUDIO } from './audio-assets.js';
import { END_AUDIO } from './end-audio-assets.js';
import { createEndAudio } from './end-audio.js';

export const GAME_AUDIO = Object.freeze({
  music: './assets/audio/jangi/match-bgm.mp3?v=52e852f3a85d',
  move: './assets/match-ui/stone-on-wood.wav',
  ...GUGAK_AUDIO,
  ...END_AUDIO,
});

export function moveAudio(board, move) {
  if (!board || !Number.isInteger(move?.from) || !Number.isInteger(move?.to)) return {};
  const side = sideOf(board[move.from]);
  if (!side) return {};
  const next = [...board]; next[move.to] = next[move.from]; next[move.from] = 0;
  return {capture: Boolean(board[move.to] && sideOf(board[move.to]) !== side), check: inCheck(next, 3-side)};
}

// NcqSound owns playback, mute/volume, unlocking and platform interruption handling.
export function createGameAudio({sound = globalThis.NcqSound, hidden = () => globalThis.document?.hidden,
  blocked = () => false, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let music = false;
  const background = createLoopMusic({sound, src:GAME_AUDIO.music});
  const timers = new Set(), voices = new Set(), results = new Set(), resultVoices = new Set();
  const endings = createEndAudio({sound,hidden,blocked,now,setTimer,clearTimer,onPromotion:()=>stopResult(.06)});
  sound?.load(Object.entries(GAME_AUDIO).filter(([kind]) => kind !== 'music').map(([,url])=>url));
  const play = (kind, volume = .75, group = voices) => {
    if (hidden() || !sound?.enabled('sfx')) return;
    const voice = sound.sfx(GAME_AUDIO[kind], {volume});
    if (voice) group.add(voice);
  };
  function cancelMove() {
    for (const timer of timers) clearTimer(timer);
    timers.clear();
    for (const voice of voices) voice.stop();
    voices.clear();
  }
  function later(ms, action) {
    const timer = setTimer(() => { timers.delete(timer); action(); }, Math.max(0, ms));
    timers.add(timer);
  }
  function stopResult(fade=.03) {
    for (const voice of resultVoices) voice.stop(fade);
    resultVoices.clear();
  }
  return {
    placement(delaySeconds, cue = {}) {
      cancelMove();
      later(delaySeconds*1000, () => play(cue.capture ? 'capture' : 'move', cue.capture ? .8 : .65));
      if (cue.check) later(cue.checkAt ?? 360, () => play('check', .62));
    },
    cancelMove,
    stop() { cancelMove(); stopResult(); endings.stop(); },
    stamp: endings.stamp,
    promotion: endings.promotion,
    scene(active) {
      active = Boolean(active);
      if (active === music) return;
      music = active;
      background.scene(active);
      if (!active) cancelMove();
      else { stopResult(); endings.stop(); }
    },
    result(key, outcome) {
      if (!['won','lost'].includes(outcome) || results.has(key) || hidden()) return;
      results.add(key);
      if (results.size > 256) results.delete(results.values().next().value);
      stopResult();play(outcome, .72, resultVoices);
    },
    musicState: () => background.state(),
  };
}
