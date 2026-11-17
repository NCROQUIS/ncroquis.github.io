export function roundNoticeKeys(game) {
  const reason=game.endReason??game.recordDetail?.state?.endReason??game.reason;
  const title=!game.winner ? reason==='bikjang'?'jangiEndBikjang':reason==='passes'?'jangiEndPasses':'jangiEndDraw'
    : ['win','checkmate'].includes(reason)?'jangiEndCheckmate':reason==='timeout'?'jangiEndTimeout'
      : ['resign','disconnect'].includes(reason)?'jangiEndResign':'jangiEndFinished';
  return {title,result:!game.winner?'drawn':game.winner===game.you?'won':'lost'};
}

export function createRoundNotice(node,t,{schedule=setTimeout,cancel=clearTimeout}={}) {
  let scope, timer, finish, promise;
  function hide(){cancel(timer);node.hidden=true;node.parentElement?.removeAttribute('data-ending');const done=finish;finish=null;promise=null;done?.();}
  function retain(next){if(scope!==next){hide();scope=next;}}
  function show(game,{isCurrent=()=>true,watching=false}={}){
    if(!isCurrent()||node.ownerDocument.hidden)return Promise.resolve();
    const key=game.code+':'+game.round;
    retain(key);
    if(promise)return promise;
    const keys=roundNoticeKeys(game);
    node.querySelector('strong').textContent=t(keys.title);
    node.querySelector('span').textContent=watching&&game.winner?t('jangiEndSideWins',{side:t(game.winner===(game.black??1)?'black':'white')}):t(keys.result);
    node.dataset.result=keys.result;node.hidden=false;node.parentElement?.setAttribute('data-ending','');
    promise=new Promise(resolve=>{finish=resolve;timer=schedule(hide,1400);});return promise;
  }
  node.ownerDocument.addEventListener('visibilitychange',()=>{if(node.ownerDocument.hidden)hide();});
  return {show,hide,retain};
}
