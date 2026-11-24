export const SKIN_IDS=Object.freeze(['default','porcelain','jade','lacquer','ocean','soda','mokhwa']);
export const SKIN_KINDS=Object.freeze(['board','sticks','pieces']);
const valid=new Set(SKIN_IDS);
export function normalizeAppearance(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(SKIN_KINDS.map(kind=>[kind,typeof source[kind]==='string'&&valid.has(source[kind])?source[kind]:'default']));
}
export function sameAppearance(a,b){return SKIN_KINDS.every(kind=>a[kind]===b[kind]);}
export function appearanceRecord(value){return{version:1,...normalizeAppearance(value)};}
export const isCharacterSkin=id=>valid.has(id)&&!['default','mokhwa'].includes(id);
export const SKIN_LOOKS=Object.freeze({
  default:{flatMark:'#9b3f2c',route:'#a9aca4',node:'#f0f1ec',edge:'#a4a79d',medallion:'#ada897',text:'#7f847a',side:'#c7c2b8',cap:[189,134,73],mark:'#4d2915'},
  porcelain:{flatMark:'#253b5d',route:'#253b5d',node:'#fff7e8',edge:'#405e82',medallion:'#35567b',text:'#253b5d',side:'#c7bdac',cap:[237,225,204],mark:'#fff2dc'},
  jade:{flatMark:'#425447',route:'#46574b',node:'#f3e8d1',edge:'#6e7c63',medallion:'#b69b64',text:'#425c4c',side:'#284c42',cap:[109,139,111],mark:'#f8ead1'},
  lacquer:{flatMark:'#6d2e26',route:'#eddaae',node:'#f1e5ce',edge:'#c9ad75',medallion:'#b5965b',text:'#f8e4ba',side:'#332527',cap:[104,33,21],mark:'#57331f'},
  ocean:{flatMark:'#173b56',route:'#ede6d7',node:'#f1ece0',edge:'#d8d4c6',medallion:'#17364b',text:'#f0ead8',side:'#23394b',cap:[40,72,96],mark:'#173b56'},
  soda:{flatMark:'#60478d',route:'#69519b',node:'#eee2ff',edge:'#7861ae',medallion:'#7055a3',text:'#60478d',side:'#9ab5d8',cap:[150,206,224],mark:'#6c50a2'},
  mokhwa:{flatMark:'#6d2e1c',route:'#eed6a8',node:'#653825',edge:'#f0dcb2',medallion:'#efdab2',text:'#f5e2ba',side:'#4e2c21',cap:[114,57,32],mark:'#5d2d16'}
});
export function spriteBox(skin,r){
  const [bx,by,bw,bh]=skin.info.opaqueBounds,character=skin.character;
  const scale=Math.min(r*(character?2.8:2.3)/bw,r*(character?3.15:2.05)/bh);
  const width=skin.info.width*scale,height=skin.info.height*scale;
  const left=-width*.5,top=r*(character?.55:.7)-height*skin.info.anchor[1];
  return{left,top,width,height,visibleLeft:left+bx*scale,visibleTop:top+by*scale,visibleWidth:bw*scale,visibleHeight:bh*scale};
}
// Rack buttons shrink for four teams. Express their sprites relative to the
// existing --size so resizing also keeps heads and feet inside each button.
export function rackSpriteBox(skin,size=1){
  const r=size*(skin.character?.4:.5),box=spriteBox(skin,r);
  return{r,box,dx:-box.visibleLeft-box.visibleWidth/2,dy:-box.visibleTop-box.visibleHeight/2};
}
