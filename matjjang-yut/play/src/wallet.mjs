import {createOnlineBoard} from './online-duel.mjs';
import {NcqLang,t} from './i18n.mjs';

// This is only the last server response, never a local grant, save or settlement.
export function createWallet({load=createOnlineBoard,onChange=()=>{}}={}) {
  let client,pending,version=0,unsubscribe,value=null,status='loading';
  const publish=()=>onChange({value,status});
  async function refresh(force=false) {
    if(pending){await pending;return force?refresh():value;}
    const revision=version;
    status=value?'ready':'loading';publish();
    const task=(async()=>{
      try {
        if(!client){
          const next=await load();if(revision!==version)return null;client=next;
          unsubscribe?.();unsubscribe=client.auth?.onChange?.(profile=>{
            if(profile.player===next.player)return;
            version++;client=null;pending=null;value=null;status='loading';publish();void refresh();
          });
        }
        const owner=client.player,result=await client.board.gameRequest('/wallet',undefined,-1);
        if(revision!==version)return null;
        if(result.player!==owner||!Number.isSafeInteger(result.coins)||result.coins<0)throw new Error('Invalid wallet');
        value=result;status='ready';publish();return result;
      }catch(error){if(revision===version){status='error';publish();}return null;}
    })();
    pending=task;
    try{return await task;}finally{if(pending===task)pending=null;}
  }
  return {refresh,get value(){return value;},get status(){return status;},close(){version++;unsubscribe?.();client=null;pending=null;value=null;}};
}

export function mountWallet(onChange=()=>{}) {
  function render(){
    for(const element of document.querySelectorAll('[data-wallet-coins]'))element.textContent=wallet.value
      ?new Intl.NumberFormat(NcqLang.lang).format(wallet.value.coins):'—';
    for(const element of document.querySelectorAll('[data-wallet]')){
      element.dataset.status=wallet.status;
      element.setAttribute('aria-label',t(wallet.status==='error'?'walletUnavailable':'yeopjeon')+(wallet.value?' '+wallet.value.coins:''));
    }
    onChange();
  }
  const wallet=createWallet({onChange:render});
  for(const element of document.querySelectorAll('[data-wallet]'))element.addEventListener('click',()=>void wallet.refresh());
  NcqLang.onChange(render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void wallet.refresh();});
  // Defer until the caller has finished mounting its dependent UI.
  queueMicrotask(()=>void wallet.refresh());
  return wallet;
}
