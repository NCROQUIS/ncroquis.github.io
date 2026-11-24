import {AUDIO_ASSETS} from './audio-assets.mjs';
import {createLoopMusic} from './loop-music.mjs';

export function createGameAudio({sound=globalThis.NcqSound,hidden=()=>globalThis.document?.hidden,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,musicFactory=createLoopMusic}={}){
  const voices=new Map(),jobs=new Set(),seen=new Set();
  const music=musicFactory({sound,src:AUDIO_ASSETS.music.url,volume:.3});
  let prepared=false,waiting=null,waitTimer=null;
  const available=()=>!hidden()&&typeof sound?.sfx==='function'&&sound.enabled('sfx')!==false
    &&sound.volume?.('sfx')!==0&&sound.state?.().active!==false;
  function prepare(){
    if(prepared)return;prepared=true;
    try{sound?.load?.(Object.entries(AUDIO_ASSETS).filter(([kind])=>kind!=='music').map(([,asset])=>asset.url))?.catch?.(()=>{});}catch{}
  }
  function track(voice,group='motion',seconds=1){
    const time=now();for(const[handle,entry]of voices)if(entry.until<time)voices.delete(handle);
    if(voice)voices.set(voice,{group,until:time+seconds*1000+500});
    return voice;
  }
  function play(kind,{volume=.65,group='motion',...options}={}){
    if(!available())return null;
    prepare();return track(sound.sfx(AUDIO_ASSETS[kind].url,{volume,...options}),group,AUDIO_ASSETS[kind].seconds);
  }
  function cancel(group){
    for(const job of [...jobs])if(!group||job.group===group){clearTimer(job.timer);jobs.delete(job);}
    for(const[voice,entry]of voices)if(!group||entry.group===group){try{voice.stop();}catch{}voices.delete(voice);}
  }
  function later(kind,delay,{valid=()=>true,group='motion',...options}={}){
    if(!available()||!valid())return()=>{};
    const job={due:now()+delay,group,timer:null};jobs.add(job);
    function pump(){
      if(!jobs.has(job))return;
      if(!available()||!valid()){jobs.delete(job);return;}
      const remaining=job.due-now();
      if(remaining<=0){jobs.delete(job);if(remaining>=-120)play(kind,{...options,group});return;}
      job.timer=setTimer(pump,Math.min(50,remaining));
    }
    pump();return()=>{clearTimer(job.timer);jobs.delete(job);};
  }
  function first(key){
    if(seen.has(key))return false;seen.add(key);
    if(seen.size>512)seen.delete(seen.values().next().value);
    return true;
  }
  function once(kind,key,options){if(first(kind+':'+key))return play(kind,options);return null;}
  function stopWaiting(){clearTimer(waitTimer);waitTimer=null;waiting=null;cancel('waiting');}
  function pumpWaiting(){
    clearTimer(waitTimer);const session=waiting;if(!session)return;
    if(!available()){cancel('waiting');session.due=null;session.note=0;}
    else{
      session.due??=now()+1080;
      if(now()>=session.due){
        if(now()-session.due<=120){play(session.note?'stack':'normal',{group:'waiting',volume:.5});session.due+=session.note?3780:540;session.note=1-session.note;}
        else{session.due=now()+1080;session.note=0;}
      }
    }
    waitTimer=setTimer(pumpWaiting,session.due===null?100:Math.max(1,Math.min(100,session.due-now())));
  }
  function sync(){if(!available())cancel();}
  sound?.onChange?.(sync);
  return{
    prepare,play,once,track,later,cancel,available,sync,stopWaiting,
    scene(active){if(active)prepare();music.scene(active);},musicState:()=>music.state(),
    waiting(key){if(waiting?.key===key)return;stopWaiting();prepare();waiting={key,due:now()+1080,note:0};pumpWaiting();},
    firstPlayer(key){return once('found','first:'+key,{group:'first',volume:.65});},
    found(key){return once('found','match:'+key,{group:'found',volume:.8});},
    move(plan,after){
      if(after.winner!==null)return;
      if(plan.captured.length)play('capture',{volume:.8,group:'effects'});
      else if(plan.target==='finish')play('finish',{volume:.65,group:'effects'});
      else if(after.pieces.filter(piece=>piece.player===plan.player&&piece.history.at(-1).node===plan.target).length>plan.stackIds.length)play('stack',{volume:.65,group:'effects'});
    },
    result(key,outcome,{valid=()=>true}={}){
      if(!['won','lost'].includes(outcome)||!first('result:'+key))return;
      stopWaiting();cancel();music.scene(false);
      if(!valid())return;
      if(outcome==='won'){play('stamp',{group:'result',volume:.55});later('won',3056,{group:'result',volume:.78,valid});}
      else play('lost',{group:'result',volume:.72});
    },
    stop(){stopWaiting();cancel();music.scene(false);},
  };
}

const controllers=new WeakMap();
export function getGameAudio(){
  const sound=globalThis.NcqSound??globalThis.window?.NcqSound;
  if(!sound)return null;
  if(!controllers.has(sound))controllers.set(sound,createGameAudio({sound}));
  return controllers.get(sound);
}
