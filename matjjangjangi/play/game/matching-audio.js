import { MATCHING_AUDIO } from './matching-audio-assets.js';

export const MATCHING_SOUND_TIMING = Object.freeze({ first:1080, response:540, period:4320, impact:300 });

// Existing games and already-tracked rounds enter quietly. No server rules change.
export function freshMatchingEntry(game, trackedRound) {
  return game?.phase === 'playing' && [1,2].includes(game.setup)
    && Array.isArray(game.moves) && game.moves.length === 0
    && trackedRound !== `${game.code}:${game.round}`;
}

// Matching owns its own reservations/voices; move and result audio stay separate.
export function createMatchingAudio({ sound=globalThis.NcqSound, hidden=()=>globalThis.document?.hidden,
  blocked=()=>false, now=()=>performance.now(), setTimer=setTimeout, clearTimer=clearTimeout }={}) {
  const seen=new Set(), voices=new Map(), timing=MATCHING_SOUND_TIMING;
  let current=null, timer=null;
  sound?.load(Object.values(MATCHING_AUDIO));
  function available() {
    try {
      return typeof sound?.sfx === 'function' && !hidden() && !blocked()
        && sound.enabled('sfx') !== false && sound.volume?.('sfx') !== 0
        && sound.state?.().active !== false;
    } catch { return false; }
  }
  function silence(fade=.05) {
    for(const voice of voices.keys())voice.stop(fade);
    voices.clear();
  }
  function stop() {
    if(timer!==null)clearTimer(timer);
    timer=null;current=null;silence();
  }
  function play(kind, time) {
    const voice=sound.sfx(MATCHING_AUDIO[kind],{volume:.85});
    // Keep pending SDK voices too (up to 400ms loading/unlock grace).
    if(voice)voices.set(voice,time+(kind==='found'?1800:900));
  }
  function nextPair(session, earliest) {
    const first=session.origin+timing.first;
    return first+Math.max(0,Math.ceil((earliest-first)/timing.period))*timing.period;
  }
  function pump() {
    if(timer!==null)clearTimer(timer);
    timer=null;
    const session=current;
    if(!session)return;
    if(!session.valid()){stop();return;}
    const time=now();
    for(const[voice,until]of voices)if(until<=time)voices.delete(voice);
    if(!available()) {
      // Stop the voice gain immediately even if the shared context is suspended.
      silence(0);
      if(session.kind==='found'){current=null;return;}
      session.due=null;session.note=0;
    } else if(session.kind==='waiting') {
      if(session.due===null)session.due=nextPair(session,time+timing.first);
      if(time>=session.due) {
        if(time-session.due<=120) {
          play(session.note?'high':'low',time);
          session.due+=session.note?timing.period-timing.response:timing.response;
          session.note=1-session.note;
        } else {
          // A throttled tab skips missed beats rather than replaying a burst.
          session.note=0;session.due=nextPair(session,time+1);
        }
      }
    } else if(!session.played && time>=session.due) {
      session.played=true;
      if(time-session.due<=120)play('found',time);
      else {current=null;return;}
      session.due=time+1800;
    } else if(session.played && time>=session.due) {
      current=null;return;
    }
    const delay=session.due===null?100:Math.max(1,Math.min(100,session.due-now()));
    timer=setTimer(pump,delay);
  }
  return {
    waiting(key,{valid=()=>true}={}) {
      if(current?.kind==='waiting'&&current.key===key)return;
      stop();
      const origin=now();
      current={kind:'waiting',key,valid,origin,due:origin+timing.first,note:0};
      pump();
    },
    found(key,{valid=()=>true,delay=timing.impact}={}) {
      stop();
      if(seen.has(key))return ()=>{};
      // Consume the event while muted/hidden too: it must never play on return.
      seen.add(key);
      if(seen.size>256)seen.delete(seen.values().next().value);
      const session={kind:'found',key,valid,due:now()+delay,played:false};
      current=session;pump();
      return ()=>{if(current===session)stop();};
    },
    stopWaiting(){if(current?.kind==='waiting')stop();},
    stop,
    sync:pump,
  };
}
