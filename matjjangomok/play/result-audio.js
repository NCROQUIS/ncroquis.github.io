import { RESULT_AUDIO } from './audio-assets.js?v=689216405a77';

// Voices and delayed cues have the same lifetime as their actual result screen.
export function createResultAudio({sound=globalThis.NcqSound,hidden=()=>globalThis.document?.hidden,
  blocked=()=>false,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const seen=new Set(), jobs=new Set();
  const lengths={won:1619,lost:2279,promotion:1680};
  sound?.load(Object.values(RESULT_AUDIO));
  function available(){
    return !hidden()&&!blocked()&&typeof sound?.sfx==='function'&&sound.enabled('sfx')!==false
      &&sound.volume?.('sfx')!==0&&sound.state?.().active!==false;
  }
  function cancel(job,fade=.03){clearTimer(job.timer);job.voice?.stop(fade);jobs.delete(job);}
  function stopResult(fade=.03){for(const job of jobs)if(job.kind!=='promotion')cancel(job,fade);}
  function stopPromotion(){for(const job of jobs)if(job.kind==='promotion')cancel(job,0);}
  function stop(){for(const job of jobs)cancel(job,0);}
  function pump(job){
    clearTimer(job.timer);
    if(!jobs.has(job))return;
    if(!available()||!job.valid()){cancel(job,0);return;}
    const time=now();
    if(!job.played&&time>=job.due){
      if(time-job.due>120){cancel(job,0);return;}
      job.played=true;job.voice=sound.sfx(RESULT_AUDIO[job.kind],{volume:job.kind==='promotion'?1:.72});
      job.until=time+lengths[job.kind]+450;
    }
    const due=job.played?job.until:job.due;
    if(job.played&&time>=due){jobs.delete(job);return;}
    job.timer=setTimer(()=>pump(job),Math.max(1,Math.min(50,due-time)));
  }
  function cue(kind,key,{delay=0,valid=()=>true}={}){
    const id=kind+':'+key;
    if(!Object.hasOwn(RESULT_AUDIO,kind)||seen.has(id))return ()=>{};
    seen.add(id);if(seen.size>512)seen.delete(seen.values().next().value);
    if(!available()||!valid())return ()=>{};
    if(kind==='promotion')stopResult(.06);else stopResult();
    const job={kind,due:now()+Math.max(0,delay),valid,played:false};jobs.add(job);pump(job);
    return ()=>cancel(job,0);
  }
  return {result:(key,outcome,options)=>cue(outcome,key,options),promotion:(key,options)=>cue('promotion',key,options),
    stopResult,stopPromotion,stop,sync(){for(const job of jobs)pump(job);}};
}
