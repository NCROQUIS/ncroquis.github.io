const root=new URL('../assets/game-ui/',import.meta.url);
const keys=['background','button','playable','selected','back','settings'];
export const DEFAULT_GAME_ART_PRESENTATION=Object.freeze({backgroundBlur:1,playableScale:1,playableX:0,playableY:24,selectedScale:1.08,selectedX:0,selectedY:0,
  modeShadowStrength:1,modeShadowX:0,modeShadowY:-2,statusShadowStrength:1,statusShadowX:0,statusShadowY:-1,
  buttonIconX:-12,buttonIconY:-3,buttonTextX:-9,buttonTextY:-3,inactiveCardBackgroundOpacity:.8});

// Three horizontal slices retain the supplied image's round caps for any label.
export function paintActionBackplate(ctx,image,frame,width,height){
  const [x,y,w,h]=frame,sourceCap=Math.min(h/2,w/2),cap=Math.min(height/2,width/2);
  ctx.clearRect(0,0,width,height);
  ctx.drawImage(image,x,y,sourceCap,h,0,0,cap,height);
  if(width>cap*2)ctx.drawImage(image,x+sourceCap,y,w-sourceCap*2,h,cap,0,width-cap*2,height);
  ctx.drawImage(image,x+w-sourceCap,y,sourceCap,h,width-cap,0,cap,height);
}

export function mountGameArt(shell,button){
  const images=new Map(),sprites=new Map(),listeners=new Set();
  const background=document.createElement('span');background.className='game-art-background';background.setAttribute('aria-hidden','true');shell.prepend(background);
  const canvas=document.createElement('canvas');canvas.className='action-button-art';canvas.setAttribute('aria-hidden','true');
  button.prepend(canvas);
  let catalog=null,pending=null,ready=false,presentation={...DEFAULT_GAME_ART_PRESENTATION};
  const emit=()=>{for(const listener of listeners)listener();};
  function setPresentation(next={}){
    for(const [key,min,max]of [['backgroundBlur',0,20],['playableScale',.4,2.5],['playableX',-100,100],['playableY',-100,100],['selectedScale',.4,2.5],['selectedX',-100,100],['selectedY',-100,100],
      ['modeShadowStrength',0,1],['modeShadowX',-30,30],['modeShadowY',-30,30],['statusShadowStrength',0,1],['statusShadowX',-30,30],['statusShadowY',-30,30],
      ['buttonIconX',-24,24],['buttonIconY',-16,16],['buttonTextX',-24,24],['buttonTextY',-16,16],['inactiveCardBackgroundOpacity',0,1]]){
      if(Number.isFinite(next[key]))presentation[key]=Math.max(min,Math.min(max,next[key]));
    }
    // Only the unshipped tuning page uses this variable; the game uses baked art.
    shell.style.setProperty('--game-background-blur',presentation.backgroundBlur+'px');
    shell.style.setProperty('--playable-art-scale',presentation.playableScale);
    shell.style.setProperty('--playable-art-x',presentation.playableX/100);
    shell.style.setProperty('--playable-art-y',presentation.playableY/100);
    shell.style.setProperty('--selected-art-scale',presentation.selectedScale);
    shell.style.setProperty('--selected-art-x',presentation.selectedX/100);
    shell.style.setProperty('--selected-art-y',presentation.selectedY/100);
    shell.style.setProperty('--inactive-card-background-opacity',presentation.inactiveCardBackgroundOpacity*100+'%');
    for(const [key,css,unit]of [['modeShadowStrength','mode-shadow-strength',''],['modeShadowX','mode-shadow-x','px'],['modeShadowY','mode-shadow-y','px'],
      ['statusShadowStrength','status-shadow-strength',''],['statusShadowX','status-shadow-x','px'],['statusShadowY','status-shadow-y','px'],
      ['buttonIconX','button-icon-x','px'],['buttonIconY','button-icon-y','px'],['buttonTextX','button-text-x','px'],['buttonTextY','button-text-y','px']]){
      shell.style.setProperty('--'+css,presentation[key]+unit);
    }
    emit();return{...presentation};
  }
  setPresentation();
  function drawButton(){
    if(!ready)return;
    const rect=button.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(devicePixelRatio||1,2),width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    paintActionBackplate(ctx,images.get('button'),catalog.assets.button.bounds,rect.width,rect.height);
  }
  function cssFrame(key){
    const item=catalog.assets[key],[x,y,w,h]=item.bounds;
    const scope=['back','settings'].includes(key)?document.documentElement:shell;
    scope.style.setProperty('--'+key+'-art-size',item.width/w*100+'% '+item.height/h*100+'%');
    scope.style.setProperty('--'+key+'-art-position',(item.width===w?50:x/(item.width-w)*100)+'% '+(item.height===h?50:y/(item.height-h)*100)+'%');
    scope.style.setProperty('--'+key+'-art-ratio',String(h/w));
  }
  function load(){
    if(pending)return pending;
    pending=(async()=>{
      try{
        if(!catalog){
          const response=await fetch(new URL('catalog.json',root));if(!response.ok)throw Error('game-art');
          const data=await response.json();
          if(data.version!==1||keys.some(key=>{
            const item=data.assets?.[key];
            if(!item||!/^[\w-]+\.webp$/.test(item.file)||!Number.isFinite(item.width)||!Number.isFinite(item.height)||!Array.isArray(item.bounds)||item.bounds.length!==4)return true;
            const [x,y,w,h]=item.bounds;return item.bounds.some(n=>!Number.isFinite(n))||x<0||y<0||w<=0||h<=0||x+w>item.width||y+h>item.height;
          }))throw Error('game-art');
          catalog=data;
        }
        await Promise.all(keys.map(async key=>{
          if(images.has(key))return;
          const info=catalog.assets[key],image=new Image();image.src=new URL(info.file,root).href;await image.decode();
          if(image.naturalWidth!==info.width||image.naturalHeight!==info.height)throw Error('game-art-dimensions');
          images.set(key,image);
        }));
        // Reuse compact decoded cue textures rather than downsampling 1K images
        // for every token on each animation frame. The shipped art stays intact.
        for(const key of ['playable','selected']){
          const frame=catalog.assets[key].bounds,sprite=document.createElement('canvas');sprite.width=256;sprite.height=Math.round(256*frame[3]/frame[2]);
          sprite.getContext('2d').drawImage(images.get(key),...frame,0,0,sprite.width,sprite.height);sprites.set(key,sprite);
        }
        ready=true;for(const key of ['playable','selected','back','settings'])cssFrame(key);shell.dataset.referenceArt='ready';document.documentElement.dataset.headerArt='ready';drawButton();emit();return true;
      }catch{ready=false;shell.dataset.referenceArt='fallback';document.documentElement.dataset.headerArt='fallback';emit();return false;}
      finally{pending=null;}
    })();
    return pending;
  }
  new ResizeObserver(drawButton).observe(button);
  window.addEventListener('online',()=>{if(!ready)void load();});
  return {ready:load(),get loaded(){return ready;},image:key=>ready?(sprites.get(key)??images.get(key)):null,
    frame:key=>sprites.has(key)?[0,0,sprites.get(key).width,sprites.get(key).height]:catalog?.assets[key]?.bounds,
    presentation:()=>({...presentation}),setPresentation,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},retry:load};
}
