export const ITEMS=Object.freeze([
  {id:'logo',label:'타이틀 로고',selector:'#lobby-title img',image:true},
  {id:'subtitle',label:'부제 · 붓 획과 글자',selector:'.lobby-tagline'},
  {id:'characters',label:'중앙 인물 · 윷',selector:'.lobby-characters img',image:true,bounds:{x:98,y:635,width:737,height:410}},
  {id:'leftMenu',label:'왼쪽 미션 메뉴',selector:'#daily-missions-button'},
  {id:'rightMenu',label:'오른쪽 꾸미기 메뉴',selector:'#lobby-dress-shortcut'},
]);
export const LIMITS=Object.freeze({scale:[30,200],x:[-220,220],y:[-400,400]});
export const APPROVED_LAYOUT=Object.freeze({
  logo:Object.freeze({scale:80,x:0,y:-9}),
  subtitle:Object.freeze({scale:108,x:0,y:-24}),
  characters:Object.freeze({scale:80,x:0,y:0}),
  leftMenu:Object.freeze({scale:90,x:-9,y:-80}),
  rightMenu:Object.freeze({scale:90,x:9,y:-80}),
});
export function normalizeLayout(raw){
  return Object.fromEntries(ITEMS.map(({id})=>[id,Object.fromEntries(Object.entries(LIMITS).map(([key,[min,max]])=>{
    const number=raw?.[id]?.[key];return[key,typeof number==='number'&&Number.isFinite(number)?Math.round(Math.min(max,Math.max(min,number))):APPROVED_LAYOUT[id][key]];
  }))]));
}
export function applyLayout(win,layout){
  const root=win.document.querySelector('#lobby'),width=root.clientWidth,height=root.clientHeight;
  if(!width||!height)return;
  for(const item of ITEMS){
    const node=win.document.querySelector(item.selector),value=layout[item.id];
    node.style.removeProperty('transform');
    const style=win.getComputedStyle(node),base=style.transform==='none'?'':style.transform;
    const inheritedScale=Number.parseFloat(style.scale)||1;
    node.style.transform=`${base} translate(${value.x*width/393/inheritedScale}px,${value.y*height/852/inheritedScale}px) scale(${value.scale/100})`;
  }
}
export function artworkRect(win,item){
  const node=win.document.querySelector(item.selector),rect=node.getBoundingClientRect();
  if(!item.image)return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  const fit=win.getComputedStyle(node).objectFit==='contain'?Math.min:Math.max;
  const ratio=fit(rect.width/node.naturalWidth,rect.height/node.naturalHeight);
  const bounds=item.bounds??{x:0,y:0,width:node.naturalWidth,height:node.naturalHeight};
  return{x:rect.x+(rect.width-node.naturalWidth*ratio)/2+bounds.x*ratio,y:rect.y+(rect.height-node.naturalHeight*ratio)/2+bounds.y*ratio,width:bounds.width*ratio,height:bounds.height*ratio};
}
