import { getOnlineAuth } from './online-duel.mjs';
import { t } from './i18n.mjs';
export function mountAccount() {
  const dialog=document.querySelector('#settings-dialog'),field=document.querySelector('#account-id'),copy=document.querySelector('#copy-account-id'),status=document.querySelector('#account-status');
  let observed;
  async function refresh(){
    if(!dialog.open)return;
    const task=window.NcqPopup.lease(dialog,'account');field.value='';copy.disabled=true;status.textContent=t('accountLoading');
    try{const auth=await getOnlineAuth(),profile=await auth.profile({forceRefresh:true});task.apply(()=>{field.value=profile.player;copy.disabled=false;status.textContent='';});
      if(observed!==auth){observed=auth;auth.onChange?.(next=>{if(dialog.open&&field.value!==next.player)void refresh();});}
    }
    catch{task.apply(()=>{status.textContent=t('accountError');});}
  }
  new MutationObserver(()=>{if(dialog.open)void refresh();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  copy.addEventListener('click',async()=>{
    const value=field.value;if(!value)return;
    try{await navigator.clipboard.writeText(value);if(dialog.open&&field.value===value)status.textContent=t('copied');}
    catch{field.focus();field.select();status.textContent=t('copySelect');}
  });
  return {refresh};
}
