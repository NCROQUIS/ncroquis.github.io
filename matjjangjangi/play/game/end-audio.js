import { END_AUDIO } from './end-audio-assets.js';

const duration={stamp:3057,promotion:1680};

// Separate from move sounds: completing the stamp must leave its tail playing.
export function createEndAudio({sound,hidden,blocked=()=>false,now=()=>performance.now(),
  setTimer=setTimeout,clearTimer=clearTimeout,onPromotion=()=>{}}) {
  const seen=new Set(),jobs=new Set();
  function available(){
    return !hidden()&&!blocked()&&sound?.enabled('sfx')!==false&&sound?.volume?.('sfx')!==0
      &&sound?.state?.().active!==false&&typeof sound?.sfx==='function';
  }
  function cancel(job,fade=.03){
    clearTimer(job.timer);job.voice?.stop(fade);jobs.delete(job);
  }
  function stop(){for(const job of jobs)cancel(job,0);}
  function pump(job){
    clearTimer(job.timer);
    if(!jobs.has(job))return;
    if(!available()||(!job.played&&!job.valid())){cancel(job,0);return;}
    const time=now();
    if(!job.played&&time>=job.due){
      // Throttled/background tabs skip missed cues rather than playing on return.
      if(time-job.due>120){cancel(job,0);return;}
      job.played=true;job.voice=sound.sfx(END_AUDIO[job.kind],{volume:1});
      job.until=time+duration[job.kind]+50;
    }
    const due=job.played?job.until:job.due;
    if(time>=due&&job.played){jobs.delete(job);return;}
    job.timer=setTimer(()=>pump(job),Math.max(1,Math.min(50,due-time)));
  }
  function cue(kind,key,{delay=0,valid=()=>true}={}){
    const id=kind+':'+key;
    if(seen.has(id))return ()=>{};
    seen.add(id);if(seen.size>512)seen.delete(seen.values().next().value);
    if(!available()||!valid())return ()=>{};
    if(kind==='promotion')onPromotion();
    const job={kind,due:now()+Math.max(0,delay),valid,played:false};jobs.add(job);pump(job);
    return ()=>cancel(job);
  }
  sound?.onChange?.(()=>{for(const job of jobs)pump(job);});
  return {stamp:(key,options)=>cue('stamp',key,options),promotion:(key,options)=>cue('promotion',key,options),stop};
}
