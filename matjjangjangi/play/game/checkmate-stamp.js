export const CHECKMATE_STAMP_DURATION = 1850;
export const CHECKMATE_STAMP_CONTACT = 145;
export const END_STAMP_FRAME = './assets/jangi-end-stamps/end-frame-v1.webp';
const asset = (language,outcome) => `./assets/jangi-end-stamps/${language}-${outcome}-v1.webp`;
const stampLanguage = language => String(language).toLowerCase().startsWith('ko') ? 'ko' : 'en';

export function checkmateStampVariant(game,{language='en',watching=false}={}) {
  const reason=game.endReason??game.recordDetail?.state?.endReason??game.reason;
  const lang=stampLanguage(language),outcome=!game.winner?'draw':watching||game.winner===game.you?'win':'loss';
  if(game.winner&&['win','checkmate'].includes(reason))return {language:lang,outcome,src:asset(lang,outcome)};
  return {language:lang,outcome,src:END_STAMP_FRAME,dynamic:true};
}

// Cosmetic only. The notice owns completion; cancellation never changes a game.
export function createCheckmateStamp(node) {
  const body=node.querySelector('.jangi-checkmate-stamp');
  if(!body)return {prepare(){},play(){},cancel(){}};
  const image=body.querySelector('img'),fallback=body.querySelector('.jangi-stamp-fallback');
  const effects=node.querySelector('.jangi-stamp-effects'),ring=effects.querySelector('.jangi-stamp-ring');
  const flash=effects.querySelector('.jangi-stamp-flash'),dust=effects.querySelector('.jangi-stamp-dust');
  const camera=node.closest('.match')??node.parentElement,animations=new Set(),preloaded=new Map();
  let generation=0;
  for(let i=0;i<12;i++)dust.append(node.ownerDocument.createElement('i'));

  function prepare(language) {
    const ImageType=node.ownerDocument.defaultView?.Image;
    if(!ImageType)return;
    for(const src of [asset(stampLanguage(language),'win'),asset(stampLanguage(language),'loss'),END_STAMP_FRAME]){
      if(!preloaded.has(src)){const preload=new ImageType();preload.src=src;preloaded.set(src,preload);}
    }
  }
  function cancel() {
    generation++;
    for(const animation of animations)animation.cancel();
    animations.clear();image.onerror=null;body.hidden=true;effects.hidden=true;
    body.removeAttribute('data-fallback');body.removeAttribute('data-dynamic');body.removeAttribute('data-long-title');
  }
  function animate(target,frames,options) {
    if(!target?.animate)return;
    animations.add(target.animate(frames,{fill:'forwards',...options}));
  }
  function play(variant,{title,result}) {
    cancel();const token=generation;
    body.hidden=false;effects.hidden=false;
    body.dataset.language=variant.language;body.dataset.outcome=variant.outcome;
    body.toggleAttribute('data-dynamic',Boolean(variant.dynamic));
    body.toggleAttribute('data-long-title',title.replace(/\s/g,'').length>=4);
    fallback.querySelector('b').textContent=title;fallback.querySelector('em').textContent=result;
    image.onerror=()=>{if(token===generation&&!body.hidden)body.setAttribute('data-fallback','');};
    if(image.getAttribute('src')!==variant.src)image.src=variant.src;
    // A previously failed cached image need not dispatch a second error event.
    if(image.complete&&!image.naturalWidth)body.setAttribute('data-fallback','');
    const total=CHECKMATE_STAMP_DURATION,contact=CHECKMATE_STAMP_CONTACT,hitStop=50,settled=330,hold=1630/total;
    const pose='translate(0,0) rotate(-7deg) scale(1.12,.88)';
    animate(node,[{opacity:1,offset:0},{opacity:1,offset:hold},{opacity:0,offset:1}],{duration:total});
    animate(body,[
      {transform:'translate(9px,-62px) rotate(-19deg) scale(2.3)',opacity:0,filter:'blur(3px)',offset:0,easing:'cubic-bezier(.55,0,.9,.35)'},
      {transform:'translate(8px,-55px) rotate(-18deg) scale(2.2)',opacity:1,filter:'blur(2px)',offset:30/total,easing:'cubic-bezier(.62,0,.9,.42)'},
      {transform:pose,opacity:1,filter:'blur(0)',offset:contact/total},
      {transform:pose,offset:(contact+hitStop)/total,easing:'cubic-bezier(.15,.8,.2,1)'},
      {transform:'translate(0,-3px) rotate(-7deg) scale(.98,1.025)',offset:260/total,easing:'ease-out'},
      {transform:'translate(0,0) rotate(-7deg) scale(1)',offset:settled/total},
      {transform:'translate(0,0) rotate(-7deg) scale(1)',offset:hold},
      {transform:'translate(0,-2px) rotate(-7deg) scale(.985)',opacity:1,offset:1},
    ],{duration:total,easing:'linear'});
    animate(camera,[{transform:'translate(0,0)'},{transform:'translate(5px,2.75px)',offset:.13},
      {transform:'translate(-3.5px,-2px)',offset:.33},{transform:'translate(2px,1px)',offset:.55},
      {transform:'translate(-.9px,0)',offset:.77},{transform:'translate(0,0)'}],{delay:contact+hitStop,duration:185,easing:'linear'});
    animate(ring,[{opacity:0,transform:'scale(.88)'},{opacity:.7,transform:'scale(1)',offset:.1},{opacity:0,transform:'scale(1.68)'}],{delay:contact,duration:310,easing:'ease-out'});
    animate(flash,[{opacity:0},{opacity:.5,offset:.1},{opacity:0}],{delay:contact,duration:110});
    [...dust.children].forEach((particle,i)=>{
      const angle=i/12*Math.PI*2-.2,radius=44.4,travel=36+(i%3)*12,x=Math.cos(angle),y=Math.sin(angle);
      animate(particle,[{opacity:0,transform:`translate(${x*radius}px,${y*radius}px) scale(.7)`},
        {opacity:.7,transform:`translate(${x*(radius+8)}px,${y*(radius+8)}px) scale(1)`,offset:.13},
        {opacity:0,transform:`translate(${x*(radius+travel)}px,${y*(radius+travel)+8}px) scale(.2)`}],
      {delay:contact+10+(i%3)*6,duration:260+(i%3)*35,easing:'cubic-bezier(.1,.7,.2,1)'});
    });
  }
  return {prepare,play,cancel};
}
