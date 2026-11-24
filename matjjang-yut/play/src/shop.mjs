import {t} from './i18n.mjs';
import {SKIN_IDS,SKIN_KINDS,sameAppearance} from './skin-model.mjs';
import {mountSkinPreview} from './skin-preview.mjs';
import {enableSkinScroll} from './skin-scroll.mjs';

const $=selector=>document.querySelector(selector);
const names={default:'shopDefault',porcelain:'skinPorcelain',jade:'skinJade',lacquer:'skinLacquer',ocean:'skinOcean',soda:'skinSoda',mokhwa:'skinMokhwa'};
const kindNames={board:'shopBoard',sticks:'shopSticks',pieces:'shopPieces'};
const icons={
  shop:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M8 20v-6h5v6"/></svg>',
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/></svg>',
  rank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v6c0 7-10 7-10 0V3ZM7 5H3v3c0 3 2 4 5 4M17 5h4v3c0 3-2 4-5 4M12 15v5M8 21h8"/></svg>'
};

export function mountShop({skins,onNavigate=()=>{}}){
  let page='home',tab='dress',applied=skins.get(),selected={...applied};
  let epoch=0,loading=false,applying=false,failed=false,saved=false,catalogReady=false,failureKind='load';
  const cards=[],centers=[];
  const flowState=()=>page==='shop'?(tab==='dress'?'skin_shop':'currency_shop'):page==='rank'?'ranking':'lobby';
  const preview=mountSkinPreview($('#skin-preview'),{skins,getSelection:()=>selected});
  for(const node of document.querySelectorAll('#lobby [data-icon]'))node.innerHTML=icons[node.dataset.icon];
  function art(kind,id){
    if(id==='default'){
      if(kind==='board')return '<span class="default-board"></span>';
      if(kind==='pieces')return '<span class="default-pieces"><i></i><i></i></span>';
      return '<span class="mini-stick default-flat"></span><span class="mini-stick round default-round"></span>';
    }
    if(!catalogReady)return '';
    const image=name=>'<img src="'+skins.url(id,name)+'" alt="" draggable="false">';
    if(kind==='board')return image('board');
    if(kind==='pieces')return image('piece-blue');
    return '<span class="mini-stick">'+image('stick-flat')+'</span><span class="mini-stick round" style="--x-color:'+skins.look(id).mark+'">'+image('stick-round')+'</span>';
  }
  const centerSelected=()=>centers.forEach(center=>center());
  for(const kind of SKIN_KINDS){
    const section=document.createElement('section');section.className='shelf';
    section.setAttribute('aria-labelledby','skin-'+kind+'-title');
    section.innerHTML='<div class="shelf-heading"><h3 id="skin-'+kind+'-title"></h3><span></span></div><div class="skin-list" role="group"></div>';
    const row=section.querySelector('.skin-list');row.dataset.kind=kind;
    const center=enableSkinScroll(row);
    centers.push(()=>center(row.querySelector('[data-skin='+selected[kind]+']')));
    for(const id of SKIN_IDS){
      const card=document.createElement('button');card.type='button';card.className='skin-card';card.dataset.kind=kind;card.dataset.skin=id;
      card.innerHTML='<span class="card-art" aria-hidden="true">'+art(kind,id)+'</span><span class="card-title"></span><span class="card-status"></span>';
      card.addEventListener('click',()=>{if(applying)return;selected={...selected,[kind]:id};saved=false;void prepare();});
      card.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const list=Array.from(row.children),index=list.indexOf(card);
        const next=event.key==='Home'?0:event.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,index+(event.key==='ArrowRight'?1:-1)));
        list[next].focus({preventScroll:true});list[next].click();center(list[next]);
      });
      row.append(card);cards.push(card);
    }
    $('#skin-shelves').append(section);
  }
  function render(){
    for(const name of ['home','shop','rank'])$('#lobby-'+name).hidden=page!==name;
    for(const button of document.querySelectorAll('[data-lobby-nav]')){
      if(button.dataset.lobbyNav===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    for(const name of ['currency','dress']){
      $('#'+name+'-tab').setAttribute('aria-selected',String(tab===name));$('#'+name+'-tab').tabIndex=tab===name?0:-1;
      $('#'+name+'-panel').hidden=tab!==name;
    }
    for(const row of document.querySelectorAll('#skin-shelves .skin-list')){
      const kind=row.dataset.kind,section=row.parentElement;
      section.querySelector('h3').textContent=t(kindNames[kind]);
      section.querySelector('.shelf-heading span').textContent=t(kind==='pieces'?'shopFourColors':'shopSwipe');
      row.setAttribute('aria-label',t(kindNames[kind]));
    }
    for(const card of cards){
      const {kind,skin:id}=card.dataset,isSelected=selected[kind]===id,isApplied=applied[kind]===id;
      const status=t(isApplied?'shopApplied':isSelected?'shopSelected':'shopAvailable');
      card.setAttribute('aria-pressed',String(isSelected));card.dataset.applied=String(isApplied);
      card.tabIndex=isSelected?0:-1;card.disabled=applying;
      card.querySelector('.card-title').textContent=t(names[id]);card.querySelector('.card-status').textContent=status;
      card.setAttribute('aria-label',t(kindNames[kind])+' · '+t(names[id])+' · '+status);
    }
    const changed=!sameAppearance(selected,applied),apply=$('#apply-skins');
    apply.disabled=!changed||loading||applying||failed;
    apply.textContent=t(applying?'shopApplying':!changed?'shopApplied':'shopApply');
    $('#restore-selection').disabled=applying||!changed;
    $('#skin-status').textContent=t(failed?(failureKind==='save'?'shopSaveFailed':'shopLoadFailed'):loading?'shopLoading':saved?'shopSaved':changed?'shopChanged':'shopChoose');
    $('#skin-retry').hidden=!failed;$('#skin-retry').textContent=t('shopRetry');
    $('#skin-preview').setAttribute('aria-label',t('shopPreviewLabel',Object.fromEntries(SKIN_KINDS.map(kind=>[kind,t(names[selected[kind]])]))));
    $('#dress-panel').setAttribute('aria-busy',String(loading||applying));
    preview.draw();onNavigate(flowState());
  }
  async function prepare(){
    const request=++epoch,selection={...selected};loading=true;failed=false;failureKind='load';render();
    try{
      await skins.catalog();
      if(!catalogReady){catalogReady=true;for(const card of cards)card.querySelector('.card-art').innerHTML=art(card.dataset.kind,card.dataset.skin);}
      await skins.ensure(selection);
      if(request!==epoch)return;
    }catch{if(request!==epoch)return;failed=true;}
    loading=false;render();
  }
  function navigate(next){
    if(page===next)return;
    epoch++;loading=false;applying=false;failed=false;saved=false;selected={...skins.get()};page=next;
    if(next==='shop'){tab='dress';$('#skin-shelves').scrollTop=0;void prepare();requestAnimationFrame(centerSelected);}else render();
  }
  function setTab(next){
    if(applying){epoch++;applying=false;}
    tab=next;if(next==='dress'){void prepare();requestAnimationFrame(centerSelected);}else{epoch++;loading=false;render();}
  }
  for(const button of document.querySelectorAll('[data-lobby-nav]'))button.addEventListener('click',()=>navigate(button.dataset.lobbyNav));
  for(const name of ['currency','dress']){
    const button=$('#'+name+'-tab');button.addEventListener('click',()=>setTab(name));
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'currency':event.key==='End'?'dress':tab==='dress'?'currency':'dress';setTab(next);$('#'+next+'-tab').focus();});
  }
  $('#go-dress').addEventListener('click',()=>setTab('dress'));
  $('#ranking-home').addEventListener('click',()=>navigate('home'));
  $('#restore-selection').addEventListener('click',()=>{selected={...skins.get()};saved=false;void prepare();requestAnimationFrame(centerSelected);});
  $('#skin-retry').addEventListener('click',()=>{void prepare();});
  $('#apply-skins').addEventListener('click',async()=>{
    if(applying||loading||failed||sameAppearance(selected,applied))return;
    const request=++epoch,selection={...selected};applying=true;render();
    try{
      const ok=await skins.apply(selection,()=>request===epoch&&page==='shop'&&tab==='dress');
      if(request!==epoch)return;
      if(ok){applied=skins.get();saved=true;}
    }catch(error){if(request!==epoch)return;failed=true;failureKind=error?.message==='skin-save'?'save':'load';selected=selection;}
    applying=false;render();
  });
  skins.subscribe(()=>{const previous=applied;applied=skins.get();if(sameAppearance(selected,previous))selected={...applied};render();});
  render();
  return{render,home:()=>navigate('home'),page:()=>page,flow:flowState,back:()=>{if(page==='home')return false;navigate('home');return true;},
    main(modalOpen,gameOpen){
      const visible=!modalOpen&&!gameOpen;
      $('#apply-skins').toggleAttribute('data-ncq-main',visible&&page==='shop'&&tab==='dress');
      $('#go-dress').toggleAttribute('data-ncq-main',visible&&page==='shop'&&tab==='currency');
      $('#ranking-home').toggleAttribute('data-ncq-main',visible&&page==='rank');
    }};
}
