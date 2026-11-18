import {initial,apply} from './rules.js';
import {clockStatus} from './clock.js';

export const AI_RULES_VERSION='ai-practice-v1';
export function aiInitial(hanFormation=0){
  return {...initial({hanFormation}),rule:'janggi',line:[],formations:[0,hanFormation],setup:1,turn:1};
}
export function aiApply(state,action){
  if(state.winner!==null)throw Error('wrongTurn');
  if(state.setup){
    if(action.type!=='formation'||!Number.isInteger(action.formation)||action.formation<0||action.formation>3)throw Error('invalid');
    const formations=[action.formation,state.formations[1]];
    return {...initial({choFormation:formations[0],hanFormation:formations[1]}),rule:'janggi',line:[],formations,setup:null};
  }
  const next=apply(state,action.type==='move'?{type:'move',from:action.from,to:action.index??action.to}:action);
  return {...next,endReason:next.reason==='checkmate'?'win':next.reason};
}
export function aiUndoIndex(actions){
  for(let i=actions.length-1;i>=0;i--)if(actions[i].seat===1&&actions[i].type!=='formation')return i;
  return -1;
}
const canonical=(state,action)=>action.type==='formation'?{type:'formation',formation:action.formation,seat:state.turn}:
  action.type==='move'?{type:'move',from:action.from,index:action.index??action.to,color:state.turn,seat:state.turn}:
  {type:action.type,seat:state.turn};
const clone=value=>JSON.parse(JSON.stringify(value));

// Practice owns no ranked room. Only legal AI turns cross the authenticated Board API.
// A generation, not the ply count, invalidates every reply after undo/exit/restart.
export function createAiMatch({request,changed=()=>{},failed=()=>{},now=Date.now,
  setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let game=null,generation=0,pending=null,timer=null;
  function schedule(){
    clearTimer(timer);timer=null;
    if(!game||game.state.winner!==null)return;
    timer=setTimer(()=>{if(tick())changed(view());schedule();},250);timer?.unref?.();
  }
  function clock(){return game.clock;}
  function settleTime(){
    if(game.state.winner!==null)return false;
    const s=game.state,c=clock(),status=clockStatus({...s,clock:c},now());
    if(!status.expired)return false;
    if(s.setup){append({type:'formation',formation:0});return true;}
    game.clock={...c,remainingMs:status.remainingMs,refills:status.refills};
    game.state={...s,winner:3-s.turn,reason:'timeout',endReason:'timeout'};
    game.finishedAt=new Date(now()).toISOString();game.version++;generation++;pending=null;
    return true;
  }
  function tick(){return game?settleTime():false;}
  function switchClock(next,{undo=false}={}){
    const old=game.state,c=clock(),at=now();
    if(old.setup){game.clock={kind:'cumulative-v1',remainingMs:[300000,300000],refills:[3,3],deadline:at+300000};return;}
    const status=clockStatus({...old,clock:c},at);
    const remainingMs=status.remainingMs,refills=status.refills;
    if(!undo)remainingMs[next.turn-1]=Math.max(30000,remainingMs[next.turn-1]);
    game.clock={kind:'cumulative-v1',remainingMs,refills,deadline:at+remainingMs[next.turn-1]};
  }
  function append(action,memory){
    const next=aiApply(game.state,action),entry=canonical(game.state,action);
    switchClock(next);game.entries.push({before:game.state,memory:{...game.memory},action:entry});
    game.actions.push(entry);game.state=next;game.version++;game.updatedAt=now();
    if(memory)game.memory={afterMistake:memory.afterMistake===true};
    if(next.winner!==null){game.finishedAt=new Date(now()).toISOString();generation++;pending=null;}
  }
  function view(){
    if(!game)return null;
    const s=game.state,actions=game.actions,moves=actions.filter(a=>a.type==='move');
    const {positions,...visible}=s;
    const finished=s.winner!==null;
    const c=clock();
    return clone({...visible,code:game.code,id:game.code,number:null,mode:'ai',device:true,bot:true,botLevel:game.level,
      aiRulesVersion:AI_RULES_VERSION,phase:finished?'finished':'playing',winner:s.winner??0,
      version:game.version,round:1,you:1,black:1,ruleset:'jangi-v1',ratingChange:null,
      players:game.players,pieceStyles:game.pieceStyles,placementStyles:game.placementStyles,
      moves:moves.map(a=>({from:a.from,to:a.index})),moveColors:moves.map(a=>a.color),moveSeats:moves.map(a=>a.seat),
      passes:[1,2].map(seat=>actions.filter(a=>a.type==='pass'&&a.seat===seat).length),actions,
      clock:c,serverNow:now(),formationEndsAt:s.setup?c.deadline:null,
      turnEndsAt:finished||s.setup?null:c.deadline+c.refills[s.turn-1]*30000,
      turnSeconds:s.setup?null:c.remainingMs[s.turn-1]/1000,
      canRematch:false,rematch:0,requested:false,finishedAt:game.finishedAt??null,
      aiThinking:!!pending,canUndo:!finished&&!s.setup&&aiUndoIndex(actions)>=0,
      aiError:game.error??null,
      ...(finished?{recordDetail:{actions,state:{winner:s.winner,endReason:s.endReason??s.reason,rule:'janggi',black:1,
        formations:s.formations,line:[],pieceStyles:game.pieceStyles,placementStyles:game.placementStyles}}}:{})});
  }
  function stop(){generation++;pending=null;clearTimer(timer);timer=null;game=null;}
  function start({level=0,hanFormation=0,code=crypto.randomUUID(),players=[],pieceStyle='reference',placementStyle='plain'}={}){
    if(!Number.isInteger(level)||level<0||level>26)throw Error('invalid');
    stop();game={code,level,state:aiInitial(hanFormation),version:1,updatedAt:now(),memory:{afterMistake:false},entries:[],
      players,actions:[{type:'formation',formation:hanFormation,seat:2}],pieceStyles:[pieceStyle,pieceStyle],
      placementStyles:[placementStyle,'plain'],clock:{kind:'cumulative-v1',remainingMs:[300000,300000],refills:[3,3],deadline:now()+20000}};
    schedule();return view();
  }
  function perform(op,input={}){
    if(!game)return {error:'notFound'};
    if(tick())return view();
    if(input.version!==undefined&&input.version!==game.version)return {error:'stale'};
    if(game.state.winner!==null)return view();
    if(op==='leave'){
      if(!game.state.setup&&game.state.ply){
        generation++;pending=null;
        const status=clockStatus({...game.state,clock:clock()},now());
        game.clock={...clock(),remainingMs:status.remainingMs,refills:status.refills};
        game.actions.push({type:'resign',seat:1});game.state={...game.state,winner:2,reason:'resign',endReason:'resign'};
        game.finishedAt=new Date(now()).toISOString();game.version++;
      }
      return view();
    }
    if(op==='undo'){
      const at=aiUndoIndex(game.actions);if(game.state.setup||at<0)return {error:'invalid'};
      const entry=game.entries[at-1]; // Han formation is the first action and has no entry.
      generation++;pending=null;switchClock(entry.before,{undo:true});
      game.state=entry.before;game.memory={...entry.memory};game.actions.splice(at);game.entries.splice(at-1);
      game.error=null;
      game.version++;game.updatedAt=now();schedule();return view();
    }
    if(op!=='move'||game.state.turn!==1)return {error:'wrongTurn'};
    if(!input.action||!['formation','move','pass','accept-bikjang','resign'].includes(input.action.type))return {error:'invalid'};
    try{append(input.action);schedule();return view();}catch(error){return {error:error.message};}
  }
  async function respond(){
    if(!game||game.state.setup||game.state.winner!==null||game.state.turn!==2||pending)return;
    if(tick()){changed(view());return;}
    const current=game,epoch=generation,version=game.version;
    const job={epoch,version};pending=job;game.error=null;changed(view());
    try{
      const remaining=clockStatus({...game.state,clock:clock()},now()).remainingMs[1];
      const result=await request({id:game.code,version,rulesVersion:AI_RULES_VERSION,level:game.level,timeRemainingMs:remaining,actions:clone(game.actions),memory:{...game.memory}});
      if(game!==current||generation!==epoch||pending!==job||game.version!==version)return;
      if(tick()){changed(view());return;}
      if(result?.error){pending=null;game.error=result.error;failed(result.error);changed(view());return;}
      if(!result||result.version!==version||!result.action||!['move','pass','accept-bikjang','resign'].includes(result.action.type))throw Error('network');
      pending=null;
      append(result.action,result.memory);schedule();changed(view());
    }catch{if(game===current&&generation===epoch){pending=null;game.error='network';failed('network');changed(view());}}
  }
  return {start,perform,respond,stop,view,isCurrent:code=>game?.code===code,
    refresh(){if(tick())changed(view());},thinking:()=>!!pending};
}
