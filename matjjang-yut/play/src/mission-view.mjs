import {createDailyMissions,DAILY_MISSIONS} from './daily-missions.mjs';
import {t,NcqLang} from './i18n.mjs';

export function mountDailyMissions({wallet,canAnimate=()=>true,onNavigate=()=>{}}){
  const $=selector=>document.querySelector(selector),card=$('#daily-missions-button'),dialog=$('#daily-missions-dialog');
  const effect=window.NcqCollect.create(),queue=[];
  let service,lease=null,resetTimer=0,clockTimer=0,generation=0,claimGeneration=0,claimOrigin=null,previousDay=null;
  function cancelEffects(){generation++;queue.length=0;effect.stop();}
  function flushAwards(){
    if(!queue.length||document.hidden||!canAnimate()||effect.timing)return;
    const to=dialog.open?$('.daily-earned'):[...document.querySelectorAll('[data-wallet]')].find(el=>el.getClientRects().length);
    if(!to)return;
    const awards=queue.splice(0),amount=awards.reduce((sum,item)=>sum+item.reward,0);
    $('#daily-mission-announcement').textContent=t('dailyAward',{n:NcqLang.num(amount)});
    effect.play({id:service.value.player+':'+awards.map(item=>item.receipt).join(','),amount,
      from:awards[0].origin??card,to,targetIcon:'.yeopjeon-icon',image:'./assets/yeopjeon.svg',accent:'#edc451',size:25,
      onComplete:()=>queueMicrotask(flushAwards)});
  }
  function resetClock(){
    const remaining=service.remaining();if(remaining===null)return;
    const minutes=Math.ceil(remaining/60000),hours=Math.floor(minutes/60),rest=minutes%60;
    $('#daily-reset').textContent=t('dailyReset',{time:NcqLang.num(hours)+':'+String(rest).padStart(2,'0')});
  }
  function renderDetails(){
    const value=service.value,ready=service.status==='ready'&&!!value;
    for(const element of dialog.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n);
    $('#daily-earned').textContent=ready?t('dailyEarned',{n:NcqLang.num(value.earned),total:NcqLang.num(20)}):t(service.status==='error'?'dailyUnavailable':'dailyLoading');
    for(const definition of DAILY_MISSIONS){
      const row=dialog.querySelector('[data-mission-key='+definition.key+']'),item=value?.items.find(item=>item.key===definition.key);
      row.dataset.state=ready?(item.claimed?'paid':item.complete?'ready':'pending'):'unknown';
      row.querySelector('.daily-row-reward span').textContent='+'+NcqLang.num(definition.reward);
      const button=row.querySelector('.daily-row-claim'),canClaim=ready&&item.complete&&!item.claimed;
      button.hidden=!canClaim;button.disabled=service.claiming;
      button.textContent=t(service.claimingKey===definition.key?'dailyClaiming':'dailyClaim');
      button.setAttribute('aria-label',t('dailyClaimLabel',{mission:row.querySelector('h3').textContent,n:NcqLang.num(definition.reward)}));
      button.toggleAttribute('data-ncq-main',canClaim);
      const status=row.querySelector('.daily-row-status');status.hidden=canClaim;
      row.querySelector('.daily-status-label').textContent=t(ready?(item.claimed?'dailyPaid':'dailyPending'):service.status==='error'?'dailyUnavailable':'dailyLoading');
      const complete=ready&&item.complete;
      row.querySelector('.daily-progress').hidden=!ready;
      row.querySelector('.daily-progress-track').setAttribute('aria-valuenow',complete?'1':'0');
      row.querySelector('.daily-progress-track span').style.width=complete?'100%':'0%';
      row.querySelector('.daily-progress-count').textContent=NcqLang.num(complete?1:0)+'/'+NcqLang.num(1);
    }
    const retry=$('#daily-retry');retry.hidden=service.status!=='error';
    retry.toggleAttribute('data-ncq-main',!retry.hidden);
    dialog.toggleAttribute('data-ncq-no-main',retry.hidden&&!value?.available);
    const message=$('#daily-error');message.hidden=!service.error;message.textContent=service.error?t(service.error==='dayChanged'?'dailyDayChanged':'dailyClaimError'):'';
    $('#daily-footer').hidden=retry.hidden&&message.hidden;
    $('#daily-reset').hidden=!ready;resetClock();
  }
  function render(){
    const value=service.value,ready=service.status==='ready'&&!!value;
    $('#daily-card-title').textContent=t('dailyTitle');$('#daily-card-maximum').textContent=t('dailyMaximum',{n:NcqLang.num(20)});
    $('#daily-card-progress').textContent=ready?t('dailyProgress',{done:NcqLang.num(value.completed),total:NcqLang.num(3)}):t(service.status==='error'?'dailyUnavailable':'dailyLoading');
    card.dataset.state=ready&&value.earned===20?'complete':ready&&value.available?'claimable':service.status;
    if(dialog.open)lease?.apply(renderDetails);
  }
  function scheduleReset(){
    clearTimeout(resetTimer);const remaining=service.remaining();
    if(remaining>0)resetTimer=setTimeout(()=>service.tick(),Math.min(2147483000,remaining+100));
  }
  service=createDailyMissions({
    onChange:({value})=>{
      if(value?.day!==previousDay){cancelEffects();previousDay=value?.day??null;}
      render();scheduleReset();
    },
    onWallet:value=>wallet.accept(value),
    onAward(awards,owner){
      if(claimGeneration!==generation||service.value?.player!==owner)return;
      queue.push(...awards.map(award=>({...award,origin:claimOrigin})));flushAwards();
    }
  });
  wallet.subscribe(({value,status})=>service.observeWallet(value,status));
  card.addEventListener('click',()=>{
    window.NcqPopup.open(dialog);lease=window.NcqPopup.lease(dialog,'missions');onNavigate(true);service.tick();render();
    clearInterval(clockTimer);clockTimer=setInterval(()=>service.tick(),30000);
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-claim-mission]');if(!button||button.disabled||service.claiming)return;
    claimGeneration=generation;
    const rect=button.getBoundingClientRect();claimOrigin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    const task=window.NcqPopup.lease(dialog,'mission-claim');
    void service.claim(button.dataset.claimMission).then(()=>task.apply(()=>{
      if(button.hidden&&(document.activeElement===button||document.activeElement===document.body))
        (dialog.querySelector('.daily-row-claim:not([hidden]):not(:disabled)')??dialog.querySelector('[data-close]')).focus({preventScroll:true});
    }));
  });
  $('#daily-retry').addEventListener('click',()=>void wallet.refresh(true));
  dialog.addEventListener('close',()=>{lease=null;clearInterval(clockTimer);cancelEffects();onNavigate(false);});
  NcqLang.onChange(render);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelEffects();else service.tick();});
  window.addEventListener('resize',cancelEffects);
  render();
  return {observeRoom:service.observeRoom,markQuit:service.markQuit,flushAwards,cancelEffects,get value(){return service.value;}};
}
