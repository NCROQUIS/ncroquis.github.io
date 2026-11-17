// A pass is recorded by the server; display never infers a draw from pass totals.
export const isPassDraw = game => !game?.winner && game?.phase !== 'playing' &&
  (game?.endReason ?? game?.reason ?? game?.recordDetail?.state?.endReason) === 'passes';

// Keep stored moves and signed payloads intact. Only the viewer uses this index.
export function replayTimeline(game) {
  const moves=game?.moves??[],source=game?.recordDetail?.actions??game?.actions;
  const legacy=()=>moves.map((_,moveIndex)=>({type:'move',moveIndex,movePly:moveIndex+1,
    side:game.moveColors?.[moveIndex]??game.moveSeats?.[moveIndex]??moveIndex%2+1}));
  if(!Array.isArray(source))return legacy();
  const result=[];let moveIndex=0,side=1;
  for(const action of source){
    if(!['move','pass'].includes(action?.type))continue;
    const seat=action.seat??action.color??action.side;
    if(seat!==side)return legacy();
    if(action.type==='move'){
      const move=moves[moveIndex];
      if(!move||move.from!==action.from||move.to!==(action.index??action.to))return legacy();
      result.push({type:'move',side,moveIndex,movePly:++moveIndex});
    }else result.push({type:'pass',side,movePly:moveIndex});
    side=3-side;
  }
  return moveIndex===moves.length?result:legacy();
}
export const replayLength = game => replayTimeline(game).length;
export function replayPosition(game,step) {
  const actions=replayTimeline(game),ply=Math.max(0,Math.min(actions.length,step));
  return {actions,ply,total:actions.length,movePly:actions[ply-1]?.movePly??0,
    last:actions[ply-1]??null,nextSide:actions[ply]?.side??null};
}

export function createPassNotice(node,translate,{schedule=setTimeout,cancel=clearTimeout}={}) {
  let previous=null,timer=null,generation=0;
  function hide(){generation++;if(timer!==null)cancel(timer);timer=null;node.hidden=true;}
  function flash(){
    hide();const token=generation;node.textContent=translate();node.hidden=false;
    timer=schedule(()=>{if(token===generation){node.hidden=true;timer=null;}},1000);
  }
  function sync(game,{mode='live',active=true,position=0}={}){
    const scope=game?`${mode}:${game.code??game.id}:${game.round}:${mode==='replay'?position:''}`:null;
    const ply=Number.isInteger(game?.ply)?game.ply:(game?.moves?.length??0)+(Array.isArray(game?.passes)?game.passes.reduce((a,b)=>a+b,0):0);
    if(!previous||previous.scope!==scope){previous={scope,ply};hide();return;}
    if(mode==='replay')return;
    if(!active){previous.ply=ply;hide();return;}
    if(ply<=previous.ply)return;
    previous.ply=ply;hide();
    if(game?.last?.type==='pass'&&game.phase==='playing'&&!game.setup)flash();
  }
  return {sync,flash,hide};
}
