import {CHECKMATE_STAMP_DURATION,CHECKMATE_STAMP_CONTACT,checkmateStampVariant,createCheckmateStamp} from './checkmate-stamp.js';

export function roundNoticeKeys(game) {
  const reason=game.endReason??game.recordDetail?.state?.endReason??game.reason;
  const title=!game.winner ? reason==='bikjang'?'jangiEndBikjang':reason==='passes'?'jangiEndPasses':'jangiEndDraw'
    : ['win','checkmate'].includes(reason)?'jangiEndCheckmate':reason==='timeout'?'jangiEndTimeout'
      : ['resign','disconnect'].includes(reason)?'jangiEndResign':'jangiEndFinished';
  return {title,result:!game.winner?'drawn':game.winner===game.you?'won':'lost'};
}

export function createRoundNotice(node,t,{schedule=setTimeout,cancel=clearTimeout,
  language=()=>node.ownerDocument.documentElement?.lang??'en',onStamp=()=>{}}={}) {
  const stamp=createCheckmateStamp(node);
  stamp.prepare(language());
  let scope, timer, finish, promise, cancelSound;
  function hide(completed=false){if(!completed){cancelSound?.();cancelSound=null;}cancel(timer);stamp.cancel();node.hidden=true;node.removeAttribute?.('data-stamp');node.parentElement?.removeAttribute('data-ending');const done=finish;finish=null;promise=null;done?.();}
  function retain(next){stamp.prepare(language());if(scope!==next){hide();scope=next;}}
  function show(game,{isCurrent=()=>true,watching=false}={}){
    if(!isCurrent()||node.ownerDocument.hidden)return Promise.resolve();
    const key=game.code+':'+game.round;
    retain(key);
    if(promise)return promise;
    const keys=roundNoticeKeys(game);
    const reason=game.endReason??game.recordDetail?.state?.endReason??game.reason;
    const drawDetail=keys.title==='jangiEndDraw'?(reason==='repetition'?'jangiStampRepetition':reason==='quiet'?'jangiStampQuiet':'jangiEndFinished'):'jangiStampDraw';
    const result=watching&&game.winner?t('jangiEndSideWins',{side:t(game.winner===(game.black??1)?'black':'white')})
      :!game.winner?t(drawDetail):t(game.winner===game.you?'jangiStampVictory':'jangiStampDefeat');
    node.querySelector('strong').textContent=t(keys.title);
    node.querySelector('span').textContent=result;
    node.dataset.result=keys.result;node.hidden=false;node.parentElement?.setAttribute('data-ending','');
    const variant=checkmateStampVariant(game,{language:language(),watching});
    node.dataset.stamp='';
    stamp.play(variant,{title:t(keys.title),result});
    cancelSound=onStamp(key,{delay:CHECKMATE_STAMP_CONTACT,valid:()=>scope===key&&!node.hidden&&isCurrent()});
    promise=new Promise(resolve=>{finish=resolve;timer=schedule(()=>hide(true),CHECKMATE_STAMP_DURATION);});return promise;
  }
  node.ownerDocument.addEventListener('visibilitychange',()=>{if(node.ownerDocument.hidden)hide();});
  return {show,hide,retain};
}
