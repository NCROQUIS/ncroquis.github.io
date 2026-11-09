// 2048 : Jelly — 게임 코드 (빌드 도구 없이 ES 모듈로 바로 열어요)
import { NcqLang } from "../ncq/lang.js";
import { TEXTS } from "./texts.js";
import { NcqMetrics } from "./metrics.js";
import { NcqAds } from "./ads.js";

NcqLang.init({ id: "jelly2048", texts: TEXTS });
const tr = NcqLang.t;
const val = x => typeof x === "function" ? x() : x;
const APP_VERSION = window.NCQ?.NCQ_VERSION ? "v" + window.NCQ.NCQ_VERSION : "dev";

const $=id=>document.getElementById(id);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- icons ---------- */
function gearPath(){let d='';const n=8,k=n*4;for(let i=0;i<k;i++){const a=i/k*Math.PI*2-Math.PI/2-Math.PI/k*1.5,r=(i%4<2)?10.4:7.9;
  d+=(i?'L':'M')+(12+Math.cos(a)*r).toFixed(2)+' '+(12+Math.sin(a)*r).toFixed(2)}
  return `<path class="fill" fill-rule="evenodd" d="${d}Z M15.3 12a3.3 3.3 0 1 0-6.6 0a3.3 3.3 0 1 0 6.6 0Z"/>`}
const P={
  gear:gearPath(),
  home:'<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h4v-5h3v5h4V10"/>',
  undo:'<path d="M9 6.5 4.5 11 9 15.5"/><path d="M5 11h9.5a5 5 0 0 1 0 10H11"/>',
  restart:'<path d="M19.5 13a7.5 7.5 0 1 1-2.3-6.4"/><path d="M19.5 4.5v4.5H15"/>',
  trophy:'<path d="M7 4h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 6.5H4.2v1a3.6 3.6 0 0 0 3.4 3.6M17 6.5h2.8v1a3.6 3.6 0 0 1-3.4 3.6"/><path d="M12 14.5v3M8.5 20.5h7M9.8 17.5h4.4"/>',
  medal:'<path d="M8.6 13.4 7 21l5-2.6 5 2.6-1.6-7.6"/><circle cx="12" cy="9" r="5.6"/><path class="fill" d="m12 5.9 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/>',
  play:'<path class="fill" d="M8.5 4.8c0-.9 1-1.5 1.8-1l10 6.6c.7.5.7 1.6 0 2.1l-10 6.6c-.8.5-1.8-.1-1.8-1z"/>',
  crown:'<path class="fill" d="M2.5 7.5 7.4 12 12 3.8l4.6 8.2 4.9-4.5L19.6 20H4.4z"/>',
  soundOn:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2"/>',
  soundOff:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
  vibe:'<rect x="8" y="3.5" width="8" height="17" rx="2.2"/><path d="M4.5 8v8M19.5 8v8"/>',
  close:'<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  grid:'<rect class="fill" x="4" y="4" width="7" height="7" rx="1.5"/><rect class="fill" x="13" y="4" width="7" height="7" rx="1.5"/><rect class="fill" x="4" y="13" width="7" height="7" rx="1.5"/><rect class="fill" x="13" y="13" width="7" height="7" rx="1.5"/>',
  gridTall:'<rect class="fill" x="6" y="2.5" width="5" height="5.5" rx="1.2"/><rect class="fill" x="13" y="2.5" width="5" height="5.5" rx="1.2"/><rect class="fill" x="6" y="9.3" width="5" height="5.5" rx="1.2"/><rect class="fill" x="13" y="9.3" width="5" height="5.5" rx="1.2"/><rect class="fill" x="6" y="16" width="5" height="5.5" rx="1.2"/><rect class="fill" x="13" y="16" width="5" height="5.5" rx="1.2"/>',
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.8 5.4 3.8 8.5s-1.2 5.9-3.8 8.5c-2.6-2.6-3.8-5.4-3.8-8.5S9.4 6.1 12 3.5z"/>',
  lock:'<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
};
const ic=n=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
document.querySelectorAll('[data-ic]').forEach(el=>el.innerHTML=ic(el.dataset.ic));

/* ---------- logo ---------- */
const LOGO=[['2','#c8f7e6','#4fd3a3','#1d6b50'],['0','#cdeeff','#4fb4f0','#16507a'],['4','#fff3b8','#ffcf2e','#8a5a00'],['8','#ffd9b8','#ff8f45','#7a3300']];
const JELLY_WORD=[['J','#ffd6e6','#ff6f9a','#7a1238'],['e','#ecdcff','#b07cff','#3f1a78'],['l','#d9f3ff','#4fb4f0','#16507a'],['l','#c8f7e6','#4fd3a3','#1d6b50'],['y','#fff3b8','#ffcf2e','#8a5a00']];
const logoCh=([t,a,b,c])=>`<span class="ch" style="--c1:${a};--c2:${b};--c3:${c}">${t}</span>`;
$('logoNum').innerHTML=LOGO.map(logoCh).join('')+'<span class="colon">:</span><span class="logo-word">'+JELLY_WORD.map(logoCh).join('')+'</span>';
$('logoNum').setAttribute('aria-label','2048 : Jelly');

/* ---------- data ---------- */
const MODES=[{id:'4x4',c:4,r:4},{id:'5x5',c:5,r:5},{id:'6x6',c:6,r:6},{id:'8x8',c:8,r:8},
             {id:'3x5',c:3,r:5},{id:'4x6',c:4,r:6},{id:'5x8',c:5,r:8},{id:'6x9',c:6,r:9}];
const KEY='jelly2048-v2';
let S={sound:true,best:{},maxTile:{},played:[],ach:{},stats:{},saves:{},sel:'4x4',page:0};
try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
try{const old=+localStorage.getItem('jelly2048-best')||0;if(old>(S.best['4x4']||0))S.best['4x4']=old}catch(e){}
S.stats=S.stats||{};Object.keys(S.ach).forEach(k=>{if(k.indexOf(':')<0)delete S.ach[k]});
function persist(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const fmt=n=>NcqLang.num(n);
const modeOf=id=>MODES.find(m=>m.id===id)||MODES[0];
const label=m=>`${m.c}×${m.r}`;

/* ---------- achievement definitions (per mode + common) ---------- */
const MULTI_N={2:'DOUBLE',3:'TRIPLE',4:'QUADRA',5:'PENTA',6:'HEXA',7:'HEPTA',8:'OCTA',9:'NONA',10:'MEGA'};
const multiName=k=>MULTI_N[Math.min(k,10)];
const maxMulti=m=>Math.max(m.r*Math.floor(m.c/2),m.c*Math.floor(m.r/2));
const stat=id=>S.stats[id]||(S.stats[id]={multi:{},maxCombo:0,games:0,merged:0});
const short=n=>n>=1e6?(n/1e6).toFixed(n%1e6?1:0)+'M':fmt(n);
const SCORE_T=[1000,5000,10000,25000,50000,100000,250000,500000,1000000];
const COMBO_T=[3,5,10,15,20,30,50];
const GAMES_T=[1,10,50,100];
function modeAch(m){
  const id=m.id,L=[],add=(sec,k,n,d,cur,goal)=>L.push({key:id+':'+k,sec,n,d,cur,goal}),ml=label(m);
  SCORE_T.forEach(v=>add('score','s'+v,()=>tr('a_score',{v:short(v)}),()=>tr('a_score_d',{v:fmt(v)}),()=>S.best[id]||0,v));
  [64,128,256,512,1024,2048,4096].concat(m.r*m.c>=36?[8192]:[])
    .forEach(v=>add('jelly','t'+v,()=>tr('a_tile',{v}),()=>tr('a_tile_d',{v}),()=>S.maxTile[id]||0,v));
  const mx=maxMulti(m),ks=[];for(let k=2;k<=Math.min(mx,9);k++)ks.push(k);if(mx>=10)ks.push(10);
  ks.forEach(k=>{const nm=multiName(k);
    add('multi','m'+k,nm+'!',()=>tr('a_multi_d',{k}),()=>stat(id).multi[k]||0,1);
    add('multi','mm'+k,()=>tr('a_multi_m',{name:nm}),()=>tr('a_multi_md',{k}),()=>stat(id).multi[k]||0,10)});
  COMBO_T.forEach(n=>add('combo','c'+n,`COMBO ×${n}`,()=>tr('a_combo_d',{n}),()=>stat(id).maxCombo||0,n));
  GAMES_T.forEach(n=>add('play','g'+n,()=>n===1?tr('a_first_game'):tr('a_games',{n}),()=>n===1?tr('a_first_game_d',{mode:ml}):tr('a_games_d',{n,mode:ml}),()=>stat(id).games||0,n));
  const others=L.slice();
  L.unshift({key:id+':master',sec:'master',master:true,n:()=>tr('a_master',{mode:ml}),d:()=>tr('a_master_d',{mode:ml,n:others.length}),
    cur:()=>others.filter(a=>S.ach[a.key]).length,goal:others.length});
  return L;
}
const ACH_BY={};
MODES.forEach(m=>ACH_BY[m.id]=modeAch(m));
ACH_BY.all=[
  {key:'all:grand',sec:'master',master:true,n:()=>tr('a_grand'),d:()=>tr('a_grand_d'),cur:()=>MODES.filter(m=>S.ach[m.id+':master']).length,goal:MODES.length},
  {key:'all:master1',sec:'common',n:()=>tr('a_master1'),d:()=>tr('a_master1_d'),cur:()=>MODES.filter(m=>S.ach[m.id+':master']).length,goal:1},
  {key:'all:first',sec:'common',n:()=>tr('a_first'),d:()=>tr('a_first_d'),cur:()=>Object.values(S.stats).reduce((a,s)=>a+(s.merged||0),0),goal:1},
  {key:'all:explore4',sec:'common',n:()=>tr('a_explore4'),d:()=>tr('a_explore4_d'),cur:()=>S.played.length,goal:4},
  {key:'all:explore8',sec:'common',n:()=>tr('a_explore8'),d:()=>tr('a_explore8_d'),cur:()=>S.played.length,goal:8},
  {key:'all:games100',sec:'common',n:()=>tr('a_games100'),d:()=>tr('a_games100_d'),cur:()=>Object.values(S.stats).reduce((a,s)=>a+(s.games||0),0),goal:100}
];
const ACH_LIST=[...MODES.flatMap(m=>ACH_BY[m.id]),...ACH_BY.all];

/* ---------- sound (synthesized; modeled on Block Blast's palette: click+thump pickup, wood tock, rising major-chord clears, praise stingers) ---------- */
let ac=null,master=null,revIn=null,noiseBuf=null;
function unlock(){
  if(ac){if(ac.state==='suspended')ac.resume();return}
  try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(ac.destination);
    master=ac.createGain();master.gain.value=.6;master.connect(comp);
    // small room reverb for sparkle tails
    const len=ac.sampleRate*1.4,ir=ac.createBuffer(2,len,ac.sampleRate);
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3)}
    const conv=ac.createConvolver();conv.buffer=ir;const wet=ac.createGain();wet.gain.value=.28;
    revIn=ac.createGain();revIn.connect(conv).connect(wet).connect(master);
    noiseBuf=ac.createBuffer(1,ac.sampleRate*.5,ac.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }catch(e){ac=null}
}
['pointerdown','keydown'].forEach(ev=>window.addEventListener(ev,unlock,{passive:true}));
const on=()=>ac&&S.sound;
const now=()=>ac.currentTime;
const hz=(n)=>440*Math.pow(2,(n-69)/12); // midi -> Hz
function out(node,send){node.connect(master);if(send)node.connect(revIn)}
function env(g,t,a,peak,dec){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec)}
function osc(type,f0,t,dur,peak,o){o=o||{};const n=ac.createOscillator();n.type=type;n.frequency.setValueAtTime(f0,t);
  if(o.f1)n.frequency.exponentialRampToValueAtTime(o.f1,t+(o.glide||dur*.6));
  const g=ac.createGain();env(g,t,o.a||.005,peak,dur);let last=g;
  if(o.lp){const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=o.lp;g.connect(f);last=f}
  n.connect(g);out(last,o.send);n.start(t);n.stop(t+dur+.08)}
function noise(t,dur,peak,o){o=o||{};const s=ac.createBufferSource();s.buffer=noiseBuf;const f=ac.createBiquadFilter();
  f.type=o.type||'bandpass';f.Q.value=o.q||1;f.frequency.setValueAtTime(o.f||2000,t);if(o.f1)f.frequency.exponentialRampToValueAtTime(o.f1,t+dur);
  const g=ac.createGain();env(g,t,o.a||.003,peak,dur);s.connect(f).connect(g);out(g,o.send);s.start(t);s.stop(t+dur+.05)}
function pluck(f,t,dur,peak,send){osc('triangle',f,t,dur,peak,{send});osc('sine',f*2,t,dur*.5,peak*.35,{send})}
function bell(f,t,dur,peak){[[1,1],[2.76,.45],[5.4,.22],[8.93,.1]].forEach(([r,a],i)=>osc('sine',f*r,t,dur/(1+i*.7),peak*a,{send:true}))}
function thump(f,t,peak,dur){osc('sine',f*1.7,t,dur||.16,peak,{f1:f,glide:.06})}
function sparkle(t,peak,dur){noise(t,dur||.35,peak,{type:'highpass',f:7000,send:true})}

// game feel
function sfxSwipe(){if(!on())return;const t=now();           // pickup: bright click + low thump
  noise(t,.025,.22,{type:'highpass',f:3200});osc('triangle',hz(91),t,.045,.08);thump(82,t,.32,.13);
  noise(t,.13,.06,{f:600,f1:2200,q:1.2})}
function sfxLand(){if(!on())return;const t=now();             // wood tock + A2 thud
  osc('triangle',hz(72),t,.07,.16,{f1:hz(68),glide:.03});thump(110,t,.28,.16)}
function sfxMerge(maxV,c,count){if(!on())return;const t=now();
  // jelly bloop body per merged tile
  for(let i=0;i<Math.min(count,6);i++){const tt=t+i*.045,f0=hz(57+Math.min(Math.log2(maxV),12));
    osc('sine',f0*.55,tt,.22,.26,{f1:f0*1.3,glide:.06})}
  // major triad that climbs a semitone per combo step (like the reference)
  const root=60+Math.min(Math.max(c,1)-1,19);
  [0,4,7,12].forEach((iv,i)=>pluck(hz(root+iv+12),t+.02+i*.022,.55,i===3?.06:.1,true));
  sparkle(t+.04,.05,.3);
  if(count>1)osc('sine',hz(root+24),t+.1,.4,.05,{send:true});
}
function sfxPop(){if(!on())return;const t=now()+.03;osc('sine',1150,t,.06,.07,{f1:540,glide:.05})}
function sfxBump(){if(!on())return;const t=now();thump(70,t,.3,.2);osc('square',hz(45),t,.08,.04,{lp:600})}
function sfxCallout(l){if(!on())return;const t=now()+.03,base=72+Math.min(l,8)*2,arp=[0,4,7,12,16,19,24];   // praise stinger
  arp.slice(0,Math.min(3+l,7)).forEach((iv,i)=>pluck(hz(base+iv),t+i*.05,.3,.11,true));
  const tt=t+Math.min(3+l,7)*.05;[0,4,7].forEach(iv=>osc('triangle',hz(base+iv+12),tt,.7,.06,{send:true}));sparkle(tt,.08,.6)}
function sfxPang(k){if(!on())return;const t=now();noise(t,.06,.32,{type:'highpass',f:1800});const f0=300*Math.pow(2,k*2/12);
  osc('sine',f0*2.2,t,.12,.3,{f1:f0,glide:.07});sparkle(t+.01,.06,.2)}
function sfxStart(){if(!on())return;const t=now()+.05;      // rising sparkle (logo / game start)
  [77,81,83,84,88].forEach((n,i)=>pluck(hz(n),t+i*.07,.35,.09,true));sparkle(t+.3,.06,.5)}
function sfxOver(){if(!on())return;const t=now();[0,-3,-7,-12].forEach((s,i)=>pluck(hz(69+s),t+i*.16,.45,.13,true));thump(65,t+.62,.35,.4)}
function sfxWin(){if(!on())return;const t=now();[72,76,79,84].forEach((n,i)=>pluck(hz(n),t+i*.08,.4,.12,true));
  [84,88,91,96].forEach(n=>osc('triangle',hz(n),t+.36,1.1,.05,{send:true}));bell(hz(96),t+.36,1.4,.06);sparkle(t+.36,.1,1)}
function sfxAch(){if(!on())return;const t=now();bell(hz(81),t,1.1,.09);bell(hz(85),t+.08,1.1,.07);bell(hz(91),t+.16,1.2,.07)}
function sfxBest(){if(!on())return;const t=now();[79,84,88,91].forEach((n,i)=>pluck(hz(n),t+i*.09,.4,.11,true));sparkle(t+.3,.07,.5)}
function sfxUndo(){if(!on())return;const t=now();noise(t,.18,.09,{f:2400,f1:500,q:1.4});[79,76,72].forEach((n,i)=>pluck(hz(n),t+i*.05,.2,.07))}
// UI
function sfxTap(){if(!on())return;const t=now();osc('square',220,t,.09,.07,{lp:1400});osc('triangle',hz(81),t,.04,.05)}
function sfxSelect(){if(!on())return;const t=now();osc('triangle',hz(84),t,.06,.09);thump(130,t,.14,.08)}
function sfxPage(){if(!on())return;const t=now();noise(t,.16,.08,{f:900,f1:2600,q:1.5});osc('triangle',hz(79),t+.05,.05,.05)}
function sfxOpen(){if(!on())return;const t=now();pluck(hz(69),t,.12,.07);pluck(hz(76),t+.05,.16,.08)}
function sfxClose(){if(!on())return;const t=now();pluck(hz(76),t,.1,.06);pluck(hz(69),t+.05,.14,.06)}
function sfxToggle(v){if(!on())return;const t=now();osc('sine',hz(v?76:69),t,.07,.12,{f1:hz(v?83:62),glide:.05})}
function sfxPlay(){if(!on())return;const t=now();thump(120,t,.25,.12);pluck(hz(72),t,.15,.1);pluck(hz(79),t+.05,.2,.1)}
// 진동은 공용 모듈 NcqDevice로 (켬·끔 저장, 토스 햅틱·앱 햅틱·브라우저 진동을 모듈이 골라요)
const buzz=k=>{if(window.NcqDevice)NcqDevice.vibrate(k)};
const canBuzz=()=>!!(window.NcqDevice&&NcqDevice.canVibrate());

/* ---------- screens ---------- */
const lobby=$('lobby'),game=$('game');
function showScreen(which){
  lobby.hidden=which!=='lobby';game.hidden=which!=='game';
  if(which==='game'){
    requestAnimationFrame(fit);
    // NCQ_ADS_BANNER: 게임 화면 하단 배너
    NcqAds.banner("BANNER");
  }else{NcqAds.hideBanner();refreshLobby()}
}

/* ---------- lobby ---------- */
const pages=$('pages'),modesEl=$('modes');
function preview(m){
  const v={},big=[256,128,64,32,16,8,4,2];
  for(let i=0;i<m.c;i++)v[(m.r-1)*m.c+i]=big[i%8];
  [8,4,2].slice(0,Math.min(m.c,3)).forEach((x,i)=>v[(m.r-2)*m.c+(m.c-1-i)]=x);
  v[(m.r-3)*m.c+m.c-1]=2;
  // 게임 판과 같은 재질: 빈 칸은 홈, 숫자는 젤리 (크기는 칸 크기 기준 cqmin)
  let h='';for(let i=0;i<m.r*m.c;i++){const x=v[i],d=x>=100?' d3':'',lt=[64,128,256].includes(x)?' lt':'';
    h+=x?`<span class="pc"><b class="jelly${d}${lt}" data-v="${x}">${x}</b></span>`:'<span class="pc"><i></i></span>'}
  return h;
}
function wobblePreview(id){ // 고른 카드의 젤리가 통통 튀어요
  if(reduce)return;
  document.querySelectorAll(`.mode[data-id="${id}"] .jelly`).forEach((j,i)=>{j.style.animationDelay=(i*28)+'ms';play(j,'spawn')});
}
let swiped=false;
MODES.forEach((m,idx)=>{
  if(idx%4===0){const pg=document.createElement('div');pg.className='page';pages.appendChild(pg)}
  const b=document.createElement('button');b.type='button';b.className='mode';b.dataset.id=m.id;
  b.innerHTML=`<div class="pv-wrap"><div class="pv" style="--pc:${m.c};--pr:${m.r}">${preview(m)}</div></div><span class="ml">${label(m)}</span><span class="mb"></span>`;
  b.addEventListener('click',()=>{if(swiped)return;if(S.sel===m.id){sfxPlay();startGame(m.id)}else{sfxSelect();S.sel=m.id;persist();refreshLobby();wobblePreview(m.id)}});
  pages.lastChild.appendChild(b);
});
function setPage(p){S.page=Math.max(0,Math.min(1,p));persist();refreshLobby()}
function refreshLobby(){
  pages.style.transform=`translateX(${-50*S.page}%)`;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',+t.dataset.p===S.page));
  document.querySelectorAll('.mode').forEach(b=>{
    const id=b.dataset.id,sv=S.saves[id],best=S.best[id]||0,mb=b.querySelector('.mb');
    b.classList.toggle('sel',id===S.sel);
    mb.classList.toggle('resume',!!sv);
    mb.textContent=sv?tr('resume_n',{n:fmt(sv.score)}):best?tr('best_n',{n:fmt(best)}):tr('new_game');
  });
  $('btnPlay').setAttribute('aria-label',tr(S.saves[S.sel]?'resume_mode':'play_mode',{mode:label(modeOf(S.sel))}));
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{sfxPage();setPage(+t.dataset.p)}));
let lx=0,ly=0,ldown=false;
modesEl.addEventListener('pointerdown',e=>{lx=e.clientX;ly=e.clientY;ldown=true;swiped=false});
modesEl.addEventListener('pointermove',e=>{if(!ldown)return;const dx=e.clientX-lx;
  if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(e.clientY-ly)){ldown=false;swiped=true;setPage(S.page+(dx<0?1:-1));sfxPage()}});
['pointerup','pointercancel','pointerleave'].forEach(ev=>modesEl.addEventListener(ev,()=>{ldown=false;setTimeout(()=>swiped=false,0)}));
$('btnPlay').addEventListener('click',()=>{sfxPlay();startGame(S.sel)});
$('btnRank').addEventListener('click',()=>openRank());
$('btnAch').addEventListener('click',()=>openAch());
$('lobSet').addEventListener('click',()=>openSettings(false));

/* ---------- game state ---------- */
const board=$('board'),tray=$('tray'),stage=$('stage'),boardArea=$('boardArea');
const $score=$('score'),$best=$('best'),$scoreBox=$('scoreBox'),overlay=$('overlay'),comboLayer=$('comboLayer');
const undoBtn=$('undoBtn'),restartBtn=$('restartBtn');
let bestAtStart=0,bestShown=false,mode=MODES[0],R=4,C=4,grid=[],score=0,won=false,keepGoing=false,over=false,busy=false,combo=0,undoSnap=null;

function fit(){
  if(game.hidden)return;
  const a=boardArea.getBoundingClientRect(),ar=C/R;
  if(!a.width||!a.height)return;
  const w=Math.floor(Math.min(a.width,a.height*ar)),h=Math.floor(w/ar),pad=Math.max(6,Math.round(Math.min(w,h)*.025));
  tray.style.width=w+'px';tray.style.height=h+'px';tray.style.padding=pad+'px';
}
new ResizeObserver(fit).observe(boardArea);

function buildSlots(){
  board.innerHTML='';board.style.setProperty('--C',C);board.style.setProperty('--R',R);
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const s=document.createElement('div');s.className='slot';
    s.style.transform=`translate(${c*100}%,${r*100}%)`;s.appendChild(document.createElement('i'));board.appendChild(s)}
}
function setPos(t){t.w.style.transform=`translate(${t.c*100}%,${t.r*100}%)`}
function setVal(t){
  t.j.textContent=t.v;const key=t.v>2048?'big':String(t.v);t.j.dataset.v=key;
  const d=String(t.v).length;t.j.classList.remove('d3','d4','d5');if(d>=3)t.j.classList.add('d'+Math.min(d,5));
  t.j.classList.toggle('lt',[64,128,256,1024].includes(t.v)||t.v>2048);
}
function play(el,name){el.classList.remove('spawn','slide-x','slide-y','land-x','land-y','merge');void el.offsetWidth;if(name)el.classList.add(name)}
function create(r,c,v,anim){
  const w=document.createElement('div');w.className='tw';const j=document.createElement('div');j.className='jelly';w.appendChild(j);
  const t={r,c,v,w,j};setPos(t);setVal(t);board.appendChild(w);grid[r][c]=t;if(anim)play(j,anim);return t;
}
function addRandom(){
  const e=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(!grid[r][c])e.push([r,c]);
  if(!e.length)return;const [r,c]=e[Math.random()*e.length|0];create(r,c,Math.random()<.9?2:4,'spawn');sfxPop();
}
const values=()=>grid.map(row=>row.map(t=>t?t.v:0));
function loadCells(cells){
  board.querySelectorAll('.tw').forEach(n=>n.remove());
  grid=Array.from({length:R},()=>Array(C).fill(null));
  cells.forEach((row,r)=>row.forEach((v,c)=>{if(v)create(r,c,v,'spawn')}));
}
function save(){S.saves[mode.id]={cells:values(),score,won,keepGoing,undo:undoSnap};persist()}
function hud(){
  $score.textContent=fmt(score);$best.textContent=fmt(S.best[mode.id]||0);
  undoBtn.disabled=!undoSnap;restartBtn.classList.toggle('pulse',over);
}
function startGame(id){
  mode=modeOf(id);R=mode.r;C=mode.c;S.sel=id;
  if(!S.played.includes(id))S.played.push(id);
  persist();buildSlots();showScreen('game');fit();
  overlay.hidden=true;comboLayer.replaceChildren();
  const sv=S.saves[id];
  if(sv&&sv.cells&&sv.cells.length===R){
    score=sv.score||0;won=!!sv.won;keepGoing=!!sv.keepGoing;undoSnap=sv.undo||null;combo=0;over=false;busy=false;
    loadCells(sv.cells);bestAtStart=S.best[id]||0;bestShown=score>=bestAtStart;sfxStart();if(!canMove()){over=true;showOver()}
  }else newGame();
  hud();checkAch({});
}
function newGame(){
  NcqMetrics.levelStart(mode.id);
  stat(mode.id).games=(stat(mode.id).games||0)+1;
  board.querySelectorAll('.tw').forEach(n=>n.remove());
  grid=Array.from({length:R},()=>Array(C).fill(null));
  score=0;combo=0;won=false;keepGoing=false;over=false;busy=false;undoSnap=null;overlay.hidden=true;comboLayer.replaceChildren();
  addRandom();addRandom();hud();save();bestAtStart=S.best[mode.id]||0;bestShown=false;sfxStart();
}
function canMove(){
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const t=grid[r][c];if(!t)return true;
    if(c<C-1&&grid[r][c+1]&&grid[r][c+1].v===t.v)return true;
    if(r<R-1&&grid[r+1][c]&&grid[r+1][c].v===t.v)return true}
  return false;
}
function addScore(add,mult){
  score+=add;$score.textContent=fmt(score);
  if(add>0){const p=document.createElement('div');p.className='plus';p.innerHTML='+'+fmt(add)+(mult>1?`<small>×${mult}</small>`:'');$scoreBox.appendChild(p);setTimeout(()=>p.remove(),900)}
  if(score>(S.best[mode.id]||0)){S.best[mode.id]=score;$best.textContent=fmt(score)}
  if(!bestShown&&bestAtStart>0&&score>bestAtStart){bestShown=true;setTimeout(()=>{sfxBest();toast(label(mode),tr('new_best'),true)},450)}
}

function move(dir){
  if(busy||over||!overlay.hidden||!$('modal').hidden)return;
  const dx=dir==='left'?-1:dir==='right'?1:0,dy=dir==='up'?-1:dir==='down'?1:0;
  const rows=[...Array(R).keys()],cols=[...Array(C).keys()];if(dy===1)rows.reverse();if(dx===1)cols.reverse();
  const snap={cells:values(),score};
  const merged=new Set(),leaving=[],movers=new Set();let moved=false,gain=0;
  for(const r of rows)for(const c of cols){
    const t=grid[r][c];if(!t)continue;let nr=r,nc=c;
    while(true){const rr=nr+dy,cc=nc+dx;if(rr<0||rr>=R||cc<0||cc>=C||grid[rr][cc])break;nr=rr;nc=cc}
    const rr=nr+dy,cc=nc+dx,tgt=(rr>=0&&rr<R&&cc>=0&&cc<C)?grid[rr][cc]:null;
    if(tgt&&tgt.v===t.v&&!merged.has(tgt)){grid[r][c]=null;t.r=rr;t.c=cc;t.w.classList.add('leaving');setPos(t);
      tgt.v*=2;merged.add(tgt);leaving.push(t);movers.add(t);gain+=tgt.v;moved=true}
    else if(nr!==r||nc!==c){grid[r][c]=null;grid[nr][nc]=t;t.r=nr;t.c=nc;setPos(t);movers.add(t);moved=true}
  }
  if(!moved){tilt(dx,dy,3);sfxBump();buzz('tap');return}
  undoSnap=snap;busy=true;
  const ax=dx!==0?'x':'y';tilt(dx,dy);sfxSwipe();
  movers.forEach(t=>play(t.j,'slide-'+ax));
  setTimeout(()=>{
    leaving.forEach(t=>t.w.remove());
    movers.forEach(t=>{if(!merged.has(t)&&leaving.indexOf(t)<0)play(t.j,'land-'+ax)});
    combo=merged.size?combo+1:0;
    const st=stat(mode.id);if(combo>(st.maxCombo||0))st.maxCombo=combo;
    if(merged.size){st.merged=(st.merged||0)+merged.size;
      for(let k=2;k<=Math.min(merged.size,9);k++)st.multi[k]=(st.multi[k]||0)+1;
      if(merged.size>=10)st.multi[10]=(st.multi[10]||0)+1}
    let i=0,maxV=0;
    merged.forEach(t=>{setVal(t);play(t.j,'merge');burst(t,combo);i++;maxV=Math.max(maxV,t.v)});
    if(merged.size)sfxMerge(maxV,combo,merged.size);else sfxLand();
    if(merged.size>=2||combo>=2)callout(merged.size,combo);
    if(gain){const mult=Math.max(combo,1)*Math.max(merged.size,1);addScore(gain*mult,mult);buzz(Math.max(combo,merged.size)>=4?'heavy':(combo>=2||merged.size>=2)?'medium':'light')}
    if(maxV>(S.maxTile[mode.id]||0))S.maxTile[mode.id]=maxV;
    addRandom();busy=false;hud();
    checkAch({merged:merged.size,maxV});
    if(maxV>=2048&&!won&&!keepGoing){won=true;setTimeout(showWin,420)}
    else if(!canMove()){over=true;hud();NcqMetrics.levelEnd(mode.id,undefined,{score});setTimeout(sfxOver,300);buzz('error');setTimeout(showOver,420)}
    save();
  },140);
}
function undo(){
  if(!undoSnap||busy)return;sfxUndo();
  score=undoSnap.score;loadCells(undoSnap.cells);undoSnap=null;combo=0;over=false;overlay.hidden=true;hud();save();
}
function restart(){
  if(over||score===0){newGame();return}
  openModal(tr('new_game'),`<p class="sh-note">${tr('restart_msg',{mode:label(mode)})}</p>
    <div class="btn-row"><button class="btn" type="button" data-close>${tr('cancel')}</button><button class="btn primary" type="button" id="cfmNew">${tr('new_game')}</button></div>`,
    ()=>$('cfmNew').addEventListener('click',()=>{closeModal();newGame()}));
}
undoBtn.addEventListener('click',undo);
restartBtn.addEventListener('click',restart);
$('gameSet').addEventListener('click',()=>openSettings(true));
function goLobby(){closeModal();save();showScreen('lobby')}

/* ---------- overlays ---------- */
function ovBtn(icon,text,id,main){return `<button class="ov-btn${main?' main':''}" type="button" id="${id}"><span class="icon-btn">${ic(icon)}</span>${text}</button>`}
function showOver(){
  overlay.innerHTML='';const w=makeWord('GAME OVER',COMBO_COL,{rot:-3});w.style.setProperty('--hold','99999s');overlay.appendChild(w);
  overlay.insertAdjacentHTML('beforeend',`<p>${tr('this_score')} <b>${fmt(score)}</b></p><div class="ov-row">${ovBtn('home',tr('lobby'),'ovHome')}${ovBtn('undo',tr('undo'),'ovUndo')}${ovBtn('restart',tr('retry'),'ovNew',true)}</div>`);
  overlay.hidden=false;
  $('ovHome').onclick=()=>{sfxTap();goLobby()};
  $('ovNew').onclick=async()=>{
    if(ac)ac.suspend();
    // NCQ_ADS_GAME_OVER: 게임 오버 뒤 다시 하기 전면 광고
    await NcqAds.interstitial("GAME_OVER");
    if(ac&&S.sound)ac.resume();
    newGame();
  };
  const u=$('ovUndo');u.querySelector('.icon-btn').disabled=!undoSnap;u.onclick=undo;
}
function showWin(){
  overlay.innerHTML='';const w=makeWord('2048!',TIER[8],{rot:-4});w.style.setProperty('--hold','99999s');overlay.appendChild(w);
  overlay.insertAdjacentHTML('beforeend',`<p>${tr('win_msg')}</p><div class="ov-row">${ovBtn('restart',tr('new_game'),'ovNew')}${ovBtn('play',tr('keep_going'),'ovKeep',true)}</div>`);
  overlay.hidden=false;buzz('success');sfxWin();if(!reduce)popBursts(6,TIER[8],COMBO_COL);
  $('ovNew').onclick=()=>newGame();$('ovKeep').onclick=()=>{sfxTap();keepGoing=true;overlay.hidden=true;save()};
}

/* ---------- modal sheets ---------- */
const modal=$('modal'),sheet=$('sheet');
function openModal(title,body,mount){
  sheet.innerHTML=`<div class="sh-head"><h2>${title}</h2><button class="icon-btn sm" type="button" data-close aria-label="${tr('close')}">${ic('close')}</button></div><div class="sh-body">${body}</div>`;
  if(modal.hidden)sfxOpen();modal.hidden=false;sheet.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal()));
  if(mount)mount();
}
function closeModal(){if(!modal.hidden)sfxClose();modal.hidden=true;sheet.innerHTML=''}
modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
function swRow(id,icon,text,val){return `<button class="set-row" type="button" role="switch" id="${id}" aria-checked="${val}"><span>${ic(icon)}</span><span class="lbl">${text}</span><span class="sw"></span></button>`}
function langRow(){
  const title=NcqLang.lang==='en'?tr('language'):`${tr('language')} · Language`;
  return `<div class="set-row lang-row"><span>${ic('globe')}</span><span class="lbl">${title}</span><span class="seg">${
    NcqLang.list().map(l=>`<button type="button" class="seg-btn${l.current?' on':''}" data-lang="${l.code}">${l.name}</button>`).join('')}</span></div>`;
}
function openSettings(inGame){
  openModal(tr('settings'),
    swRow('tSound',S.sound?'soundOn':'soundOff',tr('sound'),S.sound)+(canBuzz()?swRow('tVibe','vibe',tr('vibration'),NcqDevice.vibration()):'')+langRow()+
    (inGame?`<button class="set-row" type="button" id="goHome"><span>${ic('home')}</span><span class="lbl">${tr('to_lobby')}<small>${tr('to_lobby_sub')}</small></span></button>`:'')+`<p class="ver">${tr('version')} ${APP_VERSION}</p>`,
    ()=>{
      $('tSound').addEventListener('click',e=>{S.sound=!S.sound;persist();const b=e.currentTarget;b.setAttribute('aria-checked',S.sound);
        b.firstElementChild.innerHTML=ic(S.sound?'soundOn':'soundOff');unlock();sfxToggle(true)});
      if(canBuzz())$('tVibe').addEventListener('click',e=>{const v=!NcqDevice.vibration();NcqDevice.vibration(v);e.currentTarget.setAttribute('aria-checked',v);sfxToggle(v);buzz('tap')});
      if(inGame)$('goHome').addEventListener('click',()=>goLobby());
      sheet.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{sfxSelect();NcqLang.set(b.dataset.lang)}));
    });
}
function openRank(){
  const rows=MODES.map(m=>{const b=S.best[m.id]||0,t=S.maxTile[m.id]||0,k=t>2048?'big':t;
    return `<div class="rk-row${m.id===S.sel?' cur-mode':''}"><span class="rk-mode">${label(m)}</span>
      <span class="rk-tile"${t?` data-v="${k}"`:''}>${t||'–'}</span>${b?`<b>${fmt(b)}</b>`:`<b class="none">${tr('no_record')}</b>`}</div>`}).join('');
  openModal(tr('records_title'),`<p class="sh-note">${tr('records_note')}</p>${rows}`);
}
const tabName=k=>k==='all'?tr('tab_common'):label(modeOf(k));
function openAch(tab){
  openModal(tr('achievements'),'<div class="ach-tabs" id="achTabs"></div><div class="ach-list" id="achList"></div>',()=>renderAch(tab||S.sel));
}
function renderAch(tab){
  const tabsEl=$('achTabs'),listEl=$('achList');if(!tabsEl)return;
  tabsEl.innerHTML=['all',...MODES.map(m=>m.id)].map(t=>{const L=ACH_BY[t],d=L.filter(a=>S.ach[a.key]).length;
    return `<button class="ach-tab${t===tab?' on':''}" type="button" data-t="${t}">${tabName(t)}<small>${d}/${L.length}</small></button>`}).join('');
  let sec='',rows='';
  ACH_BY[tab].forEach(a=>{
    if(a.sec!==sec){sec=a.sec;rows+=`<div class="ach-sec">${tr('sec_'+sec)}</div>`}
    const done=!!S.ach[a.key],cur=Math.min(a.cur(),a.goal);
    rows+=`<div class="ach${done?' done':''}${a.master?' master':''}"><span class="medal">${ic(done?(a.master?'crown':'medal'):'lock')}</span>
      <span class="t"><b>${val(a.n)}</b><span>${val(a.d)}</span>${a.goal>1&&!done?`<i class="bar"><i style="width:${cur/a.goal*100}%"></i></i>`:''}</span>
      ${done?'':(a.goal>1?`<span class="ach-prog">${short(cur)}/${short(a.goal)}</span>`:'')}</div>`});
  listEl.innerHTML=rows;
  tabsEl.querySelectorAll('.ach-tab').forEach(b=>b.addEventListener('click',()=>{sfxSelect();renderAch(b.dataset.t);listEl.parentElement.scrollTop=0}));
  const on=tabsEl.querySelector('.on');tabsEl.scrollLeft=on.offsetLeft-tabsEl.clientWidth/2+on.offsetWidth/2;
}

/* ---------- achievements ---------- */
let toastQ=Promise.resolve();
function toast(sub,title,quiet){
  toastQ=toastQ.then(()=>new Promise(res=>{
    const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');
    t.innerHTML=`<span class="medal">${ic('medal')}</span><span><small>${sub}</small><b>${title}</b></span>`;
    $('toastLayer').appendChild(t);if(!quiet)sfxAch();setTimeout(()=>{t.remove();res()},2400);
  }));
}
function checkAch(){
  const got=[];
  for(let pass=0;pass<3;pass++){let any=false;
    ACH_LIST.forEach(a=>{if(!S.ach[a.key]&&a.cur()>=a.goal){S.ach[a.key]=Date.now();got.push(a);any=true}});
    if(!any)break}
  if(!got.length)return;persist();
  if(got.length>2){toast(tr('ach_many_sub'),tr('ach_many',{n:got.length}));return}
  got.forEach(a=>{const m=a.key.split(':')[0];toast(m==='all'?tr('ach_unlocked'):tr('ach_unlocked_mode',{mode:label(modeOf(m))}),val(a.n))});
}

/* ---------- particles ---------- */
const fx=$('fx'),ctx=fx.getContext('2d');
let parts=[],rings=[],raf=0,dpr=1;
function sizeFx(){dpr=Math.min(window.devicePixelRatio||1,2);const r=fx.getBoundingClientRect();fx.width=r.width*dpr;fx.height=r.height*dpr}
new ResizeObserver(sizeFx).observe(fx);
function cellCenter(r,c){const b=board.getBoundingClientRect(),f=fx.getBoundingClientRect();
  return {x:b.left-f.left+(c+.5)*b.width/C,y:b.top-f.top+(r+.5)*b.height/R,s:b.width/C}}
function burst(t,c){
  if(reduce)return;
  const cs=getComputedStyle(t.j),col=['--c1','--c2','--c3'].map(k=>cs.getPropertyValue(k).trim());
  const p=cellCenter(t.r,t.c),n=10+Math.min(c,6)*5,power=(1+Math.min(c,6)*.18)*Math.min(1,p.s/80);
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=(2+Math.random()*4.5)*power;
    parts.push({x:p.x,y:p.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2.2*power,r:p.s*.05+Math.random()*p.s*.07,life:1,decay:.018+Math.random()*.018,col:col[i%3],wob:Math.random()*6})}
  rings.push({x:p.x,y:p.y,r:p.s*.35,max:p.s*(.9+Math.min(c,6)*.12),life:1,col:col[1]});
  if(!raf)raf=requestAnimationFrame(tick);
}
function starPath(r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,d=i%2?r*.45:r;ctx.lineTo(Math.cos(a)*d,Math.sin(a)*d)}ctx.closePath()}
function tick(){
  const w=fx.width/dpr,h=fx.height/dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  rings=rings.filter(g=>{g.life-=g.fill?.12:.05;if(g.life<=0)return false;const rr=g.max-(g.max-g.r)*g.life;
    if(g.fill){ctx.globalAlpha=g.life*.9;ctx.fillStyle=g.col;ctx.beginPath();ctx.arc(g.x,g.y,rr,0,Math.PI*2);ctx.fill();return true}
    ctx.globalAlpha=g.life*.7;ctx.lineWidth=4*g.life+1;ctx.strokeStyle=g.col;ctx.beginPath();ctx.arc(g.x,g.y,rr,0,Math.PI*2);ctx.stroke();return true});
  parts=parts.filter(q=>{
    const t=q.type||'drop';
    q.vy+=t==='conf'?.1:t==='star'?.16:.28;q.vx*=t==='conf'?.96:.985;q.x+=q.vx;q.y+=q.vy;q.life-=q.decay;q.wob+=.35;q.rot=(q.rot||0)+(q.vr||0);
    if(q.life<=0)return false;
    ctx.globalAlpha=Math.min(1,q.life*1.6);ctx.save();ctx.translate(q.x,q.y);
    if(t==='star'){const r=q.r*(.5+.5*q.life);ctx.rotate(q.rot);ctx.fillStyle=q.col;starPath(r);ctx.fill();ctx.lineWidth=r*.16;ctx.strokeStyle='rgba(0,0,0,.14)';ctx.stroke()}
    else if(t==='conf'){ctx.rotate(q.rot);ctx.scale(1,Math.cos(q.wob));ctx.fillStyle=q.col;ctx.fillRect(-q.r*.7,-q.r*.35,q.r*1.4,q.r*.7)}
    else{const r=q.r*(.4+.6*q.life),sq=1+Math.sin(q.wob)*.18;ctx.scale(sq,2-sq);
      ctx.fillStyle=q.col;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.75)';ctx.beginPath();ctx.arc(-r*.35,-r*.35,r*.3,0,Math.PI*2);ctx.fill()}
    ctx.restore();return true});
  ctx.globalAlpha=1;
  if(parts.length||rings.length)raf=requestAnimationFrame(tick);else{raf=0;ctx.clearRect(0,0,w,h)}
}

/* ---------- callouts: DOUBLE! TRIPLE! ... COMBO! ---------- */
const TIER={2:['#c9ffe9','#2fd39a','#0b6a4c'],3:['#d9f3ff','#3cb2f5','#0b4a78'],4:['#fff6b5','#ffc21a','#875000'],
  5:['#ffe3cc','#ff8a3d','#863200'],6:['#ffd3e2','#ff4f8b','#760e34'],7:['#ecdcff','#a35cff','#3b1474'],8:['#fff7b0','#ffb000','#5e2400']};
const COMBO_COL=['#ffe3e7','#ff5470','#781024'];
function makeWord(text,col,o){
  o=o||{};const start=o.start||0;
  const w=document.createElement('div');w.className='word'+(o.sm?' sm':'');
  w.style.cssText=`--f1:${col[0]};--f2:${col[1]};--s:${col[2]};--rot:${o.rot==null?-5:o.rot}deg`;
  [...text].forEach((ch,i)=>{const s=document.createElement('span');s.className='ch';s.textContent=ch===' '?' ':ch;s.style.setProperty('--i',start+i);w.appendChild(s)});
  if(o.badge){const b=document.createElement('span');b.className='badge';b.textContent='×'+o.badge;b.style.setProperty('--d',((start+text.length)*42+120)+'ms');w.appendChild(b)}
  return w;
}
function callout(multi,c){
  const lvl=Math.max(multi,c),main=multi>=2?TIER[Math.min(multi,8)]:COMBO_COL;
  const wrap=document.createElement('div');wrap.className='callout';let n=0;
  if(multi>=2){const t=multiName(multi)+'!';wrap.appendChild(makeWord(t,main,{rot:-6}));n=t.length}
  if(c>=2)wrap.appendChild(makeWord('COMBO!',COMBO_COL,{sm:multi>=2,rot:multi>=2?3:-5,start:n,badge:c}));
  if(lvl>=4&&!reduce){const f=document.createElement('div');f.className='flash';tray.appendChild(f);setTimeout(()=>f.remove(),400)}
  comboLayer.replaceChildren(wrap);clearTimeout(callout.t);callout.t=setTimeout(()=>wrap.remove(),1500);
  sfxCallout(lvl);
  if(!reduce){shake(lvl);popBursts(Math.min(lvl,7),main,(c>=2&&multi>=2)?COMBO_COL:main)}
}
function shake(l){const a=Math.min(2+l*1.5,10),k=[];
  for(let i=0;i<6;i++)k.push({transform:`translate(${(Math.random()*2-1)*a}px,${(Math.random()*2-1)*a}px)`});
  k.push({transform:'translate(0,0)'});stage.animate(k,{duration:260+l*20,delay:60,easing:'ease-out'})}
function popBursts(n,colA,colB){
  const f=fx.getBoundingClientRect(),cx=f.width/2,cy=f.height/2,R0=Math.min(f.width,f.height)*.3;
  for(let k=0;k<n;k++)setTimeout(()=>{const a=Math.random()*Math.PI*2,d=R0*(.45+Math.random()*.55);
    spawnBurst(cx+Math.cos(a)*d,cy+Math.sin(a)*d*.8,k%2?colB:colA,Math.min(f.width,f.height)/13);sfxPang(k)},70+k*110);
}
function spawnBurst(x,y,col,s){
  const pal=[col[1],col[0],'#ffffff',col[1]];
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2+Math.random()*.3,sp=3+Math.random()*4;
    parts.push({type:['star','conf','drop'][i%3],x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,r:s*(.18+Math.random()*.16),
      life:1,decay:.02+Math.random()*.015,col:pal[i%4],rot:Math.random()*6,vr:(Math.random()-.5)*.4,wob:Math.random()*6})}
  rings.push({x,y,r:s*.1,max:s*.75,life:1,col:'#ffffff',fill:true});
  rings.push({x,y,r:s*.2,max:s*1.4,life:1,col:col[1]});
  if(!raf)raf=requestAnimationFrame(tick);
}

/* ---------- board tilt ---------- */
function tilt(dx,dy,amt){
  if(reduce)return;const a=amt||7,ry=dx*a,rx=-dy*a,tx=dx*5,ty=dy*5;
  tray.animate([{transform:'rotateX(0) rotateY(0) translate(0,0)'},
    {transform:`rotateX(${rx}deg) rotateY(${ry}deg) translate(${tx}px,${ty}px)`,offset:.3},
    {transform:`rotateX(${-rx*.35}deg) rotateY(${-ry*.35}deg) translate(${-tx*.3}px,${-ty*.3}px)`,offset:.62},
    {transform:`rotateX(${rx*.12}deg) rotateY(${ry*.12}deg)`,offset:.82},
    {transform:'rotateX(0) rotateY(0) translate(0,0)'}],{duration:520,easing:'cubic-bezier(.25,.8,.35,1)'});
}

/* ---------- input ---------- */
let sx=0,sy=0,tracking=false;
boardArea.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;tracking=true});
boardArea.addEventListener('pointermove',e=>{if(!tracking)return;const ddx=e.clientX-sx,ddy=e.clientY-sy;
  if(Math.max(Math.abs(ddx),Math.abs(ddy))>28){tracking=false;move(Math.abs(ddx)>Math.abs(ddy)?(ddx>0?'right':'left'):(ddy>0?'down':'up'))}});
['pointerup','pointercancel','pointerleave'].forEach(ev=>boardArea.addEventListener(ev,()=>tracking=false));
document.addEventListener('keydown',e=>{
  if(!modal.hidden){if(e.key==='Escape')closeModal();return}
  if(game.hidden){if(e.key==='ArrowLeft')setPage(0);if(e.key==='ArrowRight')setPage(1);return}
  const m={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'}[e.key];
  if(m){e.preventDefault();move(m)}
  else if(e.key==='z'||e.key==='Backspace')undo();
});

/* ---------- platform hooks ---------- */
// 토스 뒤로가기: 처리했으면 true, 첫 화면이면 false
window.ncqBack=()=>{
  if(!modal.hidden){closeModal();return true}
  if(!game.hidden){goLobby();return true}
  return false;
};
// 화면이 가려지면 소리를 끄고, 돌아오면 다시 켜요
document.addEventListener('visibilitychange',()=>{if(!ac)return;if(document.hidden)ac.suspend();else if(S.sound)ac.resume()});
// 언어를 바꾸면 지금 화면을 다시 그려요
NcqLang.onChange(()=>{refreshLobby();if(!modal.hidden&&$('tSound'))openSettings(!game.hidden)});

refreshLobby();
