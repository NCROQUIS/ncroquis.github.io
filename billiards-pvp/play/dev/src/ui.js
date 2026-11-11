
// ---------- 세로 화면 카메라: 당구대를 점수판과 조작부 사이에 맞춘다 ----------
const tcam=new THREE.PerspectiveCamera(FOV,1,0.05,60),tv=new V();
let viewW=1,viewH=1,free={y:0,h:1,w:1};
const fit={fixed:{pos:new V(-2,6,0),dy:0}};
function bbox(pos){
  tcam.aspect=viewW/viewH;tcam.updateProjectionMatrix();tcam.position.copy(pos);tcam.up.set(0,1,0);tcam.lookAt(O);tcam.updateMatrixWorld();
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const ox=HL+CW+RW,oz=HW+CW+RW;
  for(const sx of [-1,1])for(const sz of [-1,1]){tv.set(sx*ox,RAIL_TOP,sz*oz).project(tcam);const px=(tv.x+1)/2*viewW,py=(1-tv.y)/2*viewH;x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);}
  return {x0,x1,y0,y1};
}
function solveFit(tilt){
  const th=tilt*Math.PI/180,dir=new V(-Math.sin(th),Math.cos(th),0);
  let lo=1,hi=30;
  for(let i=0;i<30;i++){const m=(lo+hi)/2,b=bbox(tv.clone().copy(dir).multiplyScalar(m));if(b.x1-b.x0<=free.w-8&&b.y1-b.y0<=free.h-8)hi=m;else lo=m;}
  const pos=dir.clone().multiplyScalar(hi),b=bbox(pos);
  return {pos,dy:(b.y0+b.y1)/2-(free.y+free.h/2)};
}
function relayout(){
  const r=app.getBoundingClientRect();viewW=Math.max(1,r.width);viewH=Math.max(1,r.height);
  renderer.setSize(viewW,viewH,false);camera.aspect=viewW/viewH;camera.updateProjectionMatrix();
  const hud=$('hud'),dock=$('dock');let top=0,bot=viewH;
  if(!hud.hidden)top=hud.getBoundingClientRect().bottom-r.top;
  if(!dock.hidden)bot=dock.getBoundingClientRect().top-r.top;
  free={y:top,h:Math.max(80,bot-top),w:viewW};
  fit.fixed=solveFit(TILT);
  app.style.setProperty('--dock-h',(viewH-bot)+'px');app.style.setProperty('--hud-h',top+'px');
}
const camPos=new V(0,3,4),camLook=new V(),calm=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);let camDy=0;
function camTargets(now){
  if(G.mode==='attract'){const az=calm?.3:Math.sin(now*.00018)*.55;return {p:new V(-Math.cos(az)*5.3,2.45,Math.sin(az)*5.3),l:new V(.05,0,0),dy:-viewH*.03};}
  return {p:fit.fixed.pos,l:O,dy:fit.fixed.dy};
}
function updateCamera(dt,snap,now){
  const t=camTargets(now||performance.now()),k=snap?1:1-Math.exp(-dt*(phase==='shot'?3.2:6));
  camPos.lerp(t.p,k);camLook.lerp(t.l,k);camDy+=(t.dy-camDy)*k;
  camera.position.copy(camPos);camera.up.set(0,1,0);camera.lookAt(camLook);
  camera.setViewOffset(viewW,viewH,0,camDy,viewW,viewH);
  const d=camPos.distanceTo(camLook);scene.fog.near=d+1.6;scene.fog.far=d+11;
}

// ---------- 가이드·큐 ----------
function firstLegal(o){
  if(G.mode==='stage'||G.mode==='practice')return true;
  if(G.game==='4b')return o.i!==1-G.cueI;
  if(G.game==='pool'&&!G.isBreak){const g=G.players[G.turn].group;if(!g)return o.num!==8;const left=LB.some(b=>b.num>0&&b.num!==8&&!b.pot&&grp(b.num)===g);return left?o.num!==8&&grp(o.num)===g:o.num===8;}
  return true;
}
// 진행선이 쿠션을 넘지 않도록 길이를 자른다 (dx,dz는 단위 벡터)
function toRail(x,z,dx,dz,len){const tx=dx>0?(LIM_X-x)/dx:dx<0?(-LIM_X-x)/dx:Infinity,tz=dz>0?(LIM_Z-z)/dz:dz<0?(-LIM_Z-z)/dz:Infinity;return Math.max(0,Math.min(len,tx,tz));}
function updateGuide(){
  SEGS.forEach(m=>m.visible=false);ghost.visible=false;
  const show=phase==='aim'&&set.guide!=='off'&&G.mode!=='attract';
  cueRing.visible=(phase==='aim'||phase==='place')&&G.mode!=='attract';
  if(cueRing.visible){const c=LB[G.cueI].p;cueRing.position.set(c.x,0.003,c.z);cueRing.scale.setScalar(R);cueRing.material.color.setHex(phase==='place'?0xffcf4a:cueRisk?0xff3b30:0x4fb3ff);}
  if(!show)return;
  const c0=LB[G.cueI],cb=c0.p,cc=c0.glow,h=hDir(aimPhi);
  let tBall=Infinity,hitB=null;
  for(const o of LB){if(o.i===G.cueI||o.off)continue;
    const rx=o.p.x-cb.x,rz=o.p.z-cb.z,proj=rx*h.x+rz*h.z;if(proj<=0)continue;
    const perp2=rx*rx+rz*rz-proj*proj;if(perp2>=D2*D2)continue;
    const t=proj-Math.sqrt(D2*D2-perp2);if(t<tBall){tBall=t;hitB=o;}}
  const tx=h.x>0?(LIM_X-cb.x)/h.x:h.x<0?(-LIM_X-cb.x)/h.x:Infinity;
  const tz=h.z>0?(LIM_Z-cb.z)/h.z:h.z<0?(-LIM_Z-cb.z)/h.z:Infinity;
  const tC2=Math.min(tx,tz);let t=Math.min(tBall,tC2);
  const short=set.guide==='short';if(short)t=Math.min(t,0.45);
  const ex=cb.x+h.x*t,ez=cb.z+h.z*t;seg(0,cb.x,cb.z,ex,ez,cc,1,short);
  if(short)return;
  if(hitB&&tBall<=tC2){
    ghost.visible=true;ghost.position.set(ex,0.0052,ez);ghost.scale.setScalar(R);ghost.material.color.setHex(firstLegal(hitB)?cc:0xff5a4e).convertSRGBToLinear();
    const nx=hitB.p.x-ex,nz=hitB.p.z-ez,nl=Math.hypot(nx,nz)||1;
    const ol=toRail(hitB.p.x,hitB.p.z,nx/nl,nz/nl,.42);if(ol>.003)seg(1,hitB.p.x,hitB.p.z,hitB.p.x+nx/nl*ol,hitB.p.z+nz/nl*ol,hitB.glow,1,true);
    const dt=h.x*nx/nl+h.z*nz/nl;let px=h.x-nx/nl*dt,pz=h.z-nz/nl*dt;const pl=Math.hypot(px,pz);
    if(pl>.05){const cl=toRail(ex,ez,px/pl,pz/pl,.3);if(cl>.003)seg(2,ex,ez,ex+px/pl*cl,ez+pz/pl*cl,cc,.95,true);}
  }else if(tC2<Infinity){
    const rx=tx<tz?-h.x:h.x,rz=tx<tz?h.z:-h.z;const bl=toRail(ex,ez,rx,rz,.5);if(bl>.003)seg(1,ex,ez,ex+rx*bl,ez+rz*bl,cc,.9,true);
  }
}
// 큐대가 수구 말고 다른 공에 닿는 자세면 빨갛게 표시한다
let cueRisk=false;
function setCueRisk(on){if(on===cueRisk)return;cueRisk=on;cue.traverse(o=>{if(o.isMesh){const m=o.material;if(!m.userData.c)m.userData.c=m.color.clone();if(on)m.color.setHex(0x8a0f0a);else m.color.copy(m.userData.c);m.emissive.setHex(on?0xd01008:0);m.emissiveIntensity=on?.9:1;}});}
// e도에서 큐대가 막히지 않는지 본다
function cueClear(e,c,rail,balls){
  const d=cueDir(aimPhi,e),tip=c.p.clone().add(contactRel(d,hit.a,hit.b)).addScaledVector(d,-0.027),len=1.45;
  if(balls)for(const o of LB){if(o===c||o.off)continue;const rel=o.p.clone().sub(tip),t=clamp(-rel.dot(d),0,len);if(rel.addScaledVector(d,t).length()<R+0.0062+0.0086*t/len)return false;}
  if(rail)for(let t=.02;t<len;t+=.02){
    const px=tip.x-d.x*t,pz=tip.z-d.z*t,py=tip.y-d.y*t-(0.0062+0.0086*t/len),ax=Math.abs(px),az=Math.abs(pz);
    if(ax<=HL&&az<=HW)continue;if(py>RAIL_TOP+.002)break;
    if(ax>HL+CW+RW||az>HW+CW+RW)break;
    if(hasPockets&&POCKETS.some(q=>Math.hypot(px-q.x,pz-q.z)<q.r+.012))continue;
    const h=(ax<HL+CW&&az<HW+CW)?CUSH_H+(CHH+.0015-CUSH_H)*Math.max(ax-HL,az-HW)/CW:RAIL_TOP;
    if(py<h)return false;
  }
  return true;
}
// 막히지 않는 가장 낮은 각도. 끝까지 막히면 76
function cueFloor(c,rail,balls){for(let e=0;e<=75;e++)if(cueClear(e,c,rail,balls))return e;return 76;}
let cueShake=0,blockAt=0;
function cueBlocked(why){
  const now=Date.now();cueShake=.28;
  const cell=elevIn.closest('.cell')||elevIn.parentElement;cell.classList.remove('nudge');void cell.offsetWidth;cell.classList.add('nudge');
  try{navigator.vibrate&&navigator.vibrate(30);}catch(e){}
  if(now-blockAt>900){blockAt=now;toast(why==='rail'?'쿠션에 큐가 걸려 더 내릴 수 없어요':'다른 공에 큐가 걸려 더 내릴 수 없어요',true);}
}
function updateCue(dt){
  const c=LB[G.cueI],show=G.mode!=='attract'&&(phase==='aim'||phase==='strike'||phase==='ai-aim'||phase==='wait'||(phase==='ai-think'&&G.players[G.turn]&&G.players[G.turn].bot))&&c&&!c.off;
  cue.visible=!!show;if(!show){setCueRisk(false);return;}
  const target=phase==='strike'?-0.004:0.025+power*0.24;
  pull+=(target-pull)*Math.min(1,dt*(phase==='strike'?40:14));
  const mine=phase==='aim',rf=cueFloor(c,true,false),bf=cueFloor(c,false,true);
  if(mine&&elev<rf){elev=Math.min(rf,75);syncSpinUI();}
  setCueRisk(mine&&elev<bf);
  const d=cueDir(aimPhi,Math.min(75,Math.max(elev,rf,bf))),tip=c.p.clone().add(contactRel(d,hit.a,hit.b)).addScaledVector(d,-(0.002+pull));
  if(cueShake>0){cueShake=Math.max(0,cueShake-dt);const k=Math.sin(cueShake*90)*cueShake*.016;tip.x+=d.z*k;tip.z-=d.x*k;}
  cue.position.copy(tip);cue.quaternion.setFromUnitVectors(Y,d.clone().negate());
}

// ---------- 소리 ----------
// 첨부 타격음을 세기·음색별로 변형하고, 작은 홀 잔향을 얹는다
const HIT_B64='/*HIT_WAV*/';
let ac=null,hitBuf=null,dry=null,wet=null,lastSfx={};
function ensureAudio(){
  if(ac){if(ac.state==='suspended')ac.resume();return;}
  try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=3;comp.connect(ac.destination);
    dry=ac.createGain();dry.gain.value=.95;dry.connect(comp);
    const len=ac.sampleRate*.55|0,ir=ac.createBuffer(2,len,ac.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);let lp=0;for(let i=0;i<len;i++){const t=i/len;lp+=((Math.random()*2-1)-lp)*(.5-.42*t);d[i]=lp*Math.pow(1-t,3.2)*(i<300?i/300:1);}}
    const cv=ac.createConvolver();cv.buffer=ir;wet=ac.createGain();wet.gain.value=.22;cv.connect(wet);wet.connect(comp);dry.wetIn=cv;
    const bin=atob(HIT_B64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    ac.decodeAudioData(u.buffer,b=>{hitBuf=b;},()=>{});
  }catch(e){ac=null;}
}
function playHit(rate,gain,cut,at){
  if(!hitBuf)return;const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime+(at||0);
  s.buffer=hitBuf;s.playbackRate.value=rate;f.type='lowpass';f.frequency.value=cut;f.Q.value=.4;g.gain.value=gain;
  s.connect(f).connect(g);g.connect(dry);g.connect(dry.wetIn);s.start(t);
}
function tones(list,gain){if(!ac)return;const now=ac.currentTime;list.forEach(([f,at,len])=>{const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.0001,now+at);g.gain.exponentialRampToValueAtTime(gain,now+at+0.012);g.gain.exponentialRampToValueAtTime(0.0001,now+at+len);o.connect(g);g.connect(dry);g.connect(dry.wetIn);o.start(now+at);o.stop(now+at+len+.05);});}
function sfx(type,vol){
  if(!ac||G.mode==='attract')return;const now=ac.currentTime;if(lastSfx[type]&&now-lastSfx[type]<0.02)return;lastSfx[type]=now;
  const v=clamp(vol,0,1);
  switch(type){
    case 'score':tones([[587,0,.5],[880,.09,.55]],.1);break;
    case 'win':tones([[523,0,.5],[659,.14,.5],[784,.28,.5],[1047,.42,.8]],.11);break;
    case 'lose':tones([[392,0,.5],[330,.2,.5],[262,.4,.8]],.09);break;
    case 'cue':playHit(.9+v*.08,.5+.5*v,5000+11000*v);playHit(.5,.28*v,800);break;
    case 'ball':playHit(.96+Math.random()*.1+v*.06,.1+.9*Math.pow(v,1.25),2600+14000*v);break;
    case 'cushion':playHit(.42,.12+.5*v,520+500*v);break;
    case 'bounce':playHit(.68,.45*v,1700);break;
    case 'miscue':playHit(1.3,.5,4200);playHit(.7,.3,1200,.012);break;
    case 'pocket':playHit(.46,.7,560);playHit(.36,.5,380,.085);playHit(.31,.3,300,.17);break;
  }
}

// ---------- 화면 요소 ----------
const elevIn=$('elev'),elevVal=$('elevVal'),pad=$('pad'),dot=$('dot');
let toastTimer=0,bannerTimer=0;
function toast(t,bad){const el=$('toast');el.textContent=t;el.classList.toggle('bad',!!bad);el.classList.toggle('long',t.length>7);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1050);}
function banner(t){const el=$('banner');el.textContent=t;el.classList.add('show');clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>el.classList.remove('show'),850);}
function drawDot(){
  const ka=hit.a/SPIN_MAX,kb=hit.b/SPIN_MAX;$('dotZoom').style.left=(50+ka*50)+'%';$('dotZoom').style.top=(50-kb*50)+'%';
  const r=pad.clientWidth/2||35;dot.style.left=(r+ka*r)+'px';dot.style.top=(r-kb*r)+'px';
  const v=hit.b>0.12?'밀어치기':hit.b<-0.12?'끌어치기':'',s=hit.a>0.12?'오른쪽':hit.a<-0.12?'왼쪽':'',read=$('spinRead');
  read.textContent=(s||v)?[s,v].filter(Boolean).join(' '):'중앙';
  read.style.color=shotOpts().miscue&&Math.hypot(hit.a,hit.b)>MISCUE?'var(--warn)':'';
}
function syncSpinUI(){drawDot();elevIn.value=elev;elevVal.textContent=Math.round(elev)+'°';}
function renderBeads(el,n,on){
  if(el.children.length!==n){el.textContent='';for(let i=0;i<n;i++)el.appendChild(document.createElement('i'));}
  const d=Math.min(12,(el.clientWidth||90)/n),sz=Math.max(3,Math.min(10,d-1));[...el.children].forEach((b,i)=>{const lit=i<on;b.className=lit?'on':'';b.style.width=b.style.height=sz+'px';b.style.top=((10-sz)/2)+'px';b.style.left=lit?(i*d)+'px':`calc(100% - ${(n-i)*d}px)`;});
}
function renderDots(el,g){
  const nums=g==='stripe'?[9,10,11,12,13,14,15]:[1,2,3,4,5,6,7];
  if(el.children.length!==7){el.textContent='';for(let i=0;i<7;i++)el.appendChild(document.createElement('i'));}
  [...el.children].forEach((d,i)=>{const n=nums[i],b=LB[n];d.style.background=(g&&b&&!b.pot)?POOL_COL[(n-1)%8]:'';d.style.opacity=(g&&b&&b.pot)?'.28':'1';});
}
function updateHUD(){
  const solo=G.mode==='stage'||G.mode==='practice';
  $('clockBar').hidden=solo;
  $('hudPlayers').hidden=solo;$('hudSolo').hidden=!solo;
  if(solo){
    const st=G.stage,isS=G.mode==='stage';
    $('soloTag').textContent=isS?`${G.info.name} · 스테이지 ${st.idx+1}`:`${G.info.name} · 연습`;
    $('soloTitle').textContent=isS?st.name:'자유 연습';
    $('soloGoal').textContent=isS?st.desc:'규칙 없이 쳐 보세요.';
    $('soloTries').textContent=`시도 ${G.tries}`;$('soloTries').hidden=!isS;
    $('hintBtn').hidden=!isS||!st.sol||(!!window.NcqAds&&!window.NcqAds.can('HINT'));$('undoBtn').hidden=isS;$('resetBtn').hidden=isS;
    return;
  }
  const me=G.myIdx,pool=G.game==='pool';
  [me,1-me].forEach((pi,k)=>{
    const p=G.players[pi],chip=$('chip'+k);
    {const nm=$('nm'+k);nm.textContent=k===0&&G.mode!=='local'?(G.mode==='online'&&G.net?save.nick:'나'):p.name;for(let t=0;t<(p.to|0);t++){const i=document.createElement('span');i.className='tmo';i.title='시간 초과';i.innerHTML=TMO_SVG;nm.appendChild(i);}}
    $('pl'+k).classList.toggle('on',G.turn===pi&&!G.over);
    $('sc'+k).textContent=p.score;$('sc'+k).hidden=pool;
    $('bd'+k).hidden=pool;$('dt'+k).hidden=!pool;
    if(pool){
      renderDots($('dt'+k),p.group);chip.className='b';chip.style.setProperty('--c',p.group==='solid'?POOL_COL[0]:p.group==='stripe'?'#f4f1e8':'#3a4757');chip.style.backgroundImage=p.group==='stripe'?`linear-gradient(180deg,transparent 28%,${POOL_COL[1]} 28% 72%,transparent 72%)`:'';
    }else{renderBeads($('bd'+k),G.target,p.score);chip.className='b '+(pi===0?'w':'y');chip.style.removeProperty('--c');chip.style.backgroundImage='';}
  });
  $('ruleName').textContent=G.info.name;
  $('inn').textContent=G.isBreak?'브레이크':`${G.inning}이닝`;
}
function updateUI(){
  const my=phase==='aim';
  $('powerwrap').classList.toggle('idle',!my);$('fineTicks').hidden=!my;
  document.querySelector('.cell.spin').classList.toggle('idle',!my);elevIn.disabled=!my;tutCtl();
  $('placeBar').hidden=phase!=='place';
  $('powerFill').style.height=(power*100)+'%';$('powerVal').textContent=Math.round(power*100);

}
function enterGameUI(){
  ['lobby','sheet','matching','result','menu'].forEach(id=>$(id).hidden=true);
  ['hud','dock','powerwrap','menuBtn'].forEach(id=>$(id).hidden=false);$('hintBtn').innerHTML='<span class="adTag">AD</span>힌트';
  $('powerMark').hidden=true;$('menuQuit').textContent='나가기';$('menuQuit').classList.remove('arm');
  updateHUD();relayout();
}
function exitGameUI(){['hud','dock','powerwrap','menuBtn','placeBar','menu'].forEach(id=>$(id).hidden=true);cue.visible=false;cueRing.visible=false;SEGS.forEach(m=>m.visible=false);ghost.visible=false;relayout();}
function toLobby(){hintEnd();
  if(G.net&&!G.net.closed)netClose();
  exitGameUI();
  ['result','matching','sheet'].forEach(id=>$(id).hidden=true);$('lobby').hidden=false;$('lobby').classList.remove('sheeted');
  refreshLobby();attract(G.info?G.info.kind:tableKind);
}
// 랭킹 팝업: 회사 게임 서버의 종목별 Rating 1~100위 (공용 봇이 처음부터 표를 채워요), 맨 아래는 늘 내 순위
let rankTab=null;
async function openRanks(g){
  rankTab=g;
  document.querySelectorAll('#ranks .rules-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.k===g));
  const tb=$('rankList'),foot=$('rankMine'),note=$('rankNote');tb.textContent='';foot.textContent='';note.textContent='불러오는 중…';$('ranks').hidden=false;
  const b=await getBoard();if(rankTab!==g)return;
  if(!b){note.textContent='Online 랭킹은 출시 빌드에서 볼 수 있어요.';return;}
  let lb=null;try{lb=await b.leaderboard(100,BOARD_Q[g]);}catch(e){}
  if(rankTab!==g||$('ranks').hidden)return;
  if(!lb||!Array.isArray(lb.top)){note.textContent='랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';return;}
  const row=(x,rank)=>{const me=!!x.you,tr=document.createElement('tr');if(me)tr.className='me';
    [rank,(me?save.nick:safeNick(x.nickname||'','플레이어'))+(me?' (나)':''),x.rating|0,`${x.wins|0}승 ${x.losses|0}패`].forEach((v,j)=>{const td=document.createElement('td');td.textContent=v;if(j===1)td.prepend(iconEl(me?(save.icon||'ball-w'):rankIcon(x),20));tr.appendChild(td);});return tr;};
  lb.top.slice(0,100).forEach(x=>tb.appendChild(row(x,x.rank)));
  const y=lb.you,mine=played(y);RANK.pos[g]=mine?y.rank:0;
  const rec=save.rec[g];foot.appendChild(row(y||{you:true,rating:rec.rk,wins:rec.w,losses:rec.l},mine?y.rank+'':'—'));
  note.textContent=mine?'Online 대전 Rating 순이에요.':'Online 대전을 하면 내 순위가 매겨져요.';
}
document.querySelectorAll('#ranks .rules-tabs button').forEach(b=>b.onclick=()=>openRanks(b.dataset.k));
$('rankOpen').onclick=()=>openRanks('3c');
document.querySelectorAll('[data-rk]').forEach(b=>{b.addEventListener('pointerdown',e=>e.stopPropagation());b.onclick=e=>{e.preventDefault();e.stopPropagation();openRanks(b.dataset.rk);};});
$('ranksClose').onclick=()=>{$('ranks').hidden=true;rankTab=null;};
const TMO_SVG='<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v3.6l2 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 1.6 8.6 5.2l2.4.6-1.6 3.2" fill="none" stroke="#0b0f14" stroke-width="1.8"/><path d="M10.5 1.6 8.6 5.2l2.4.6-1.6 3.2" fill="none" stroke="currentColor" stroke-width=".8"/></svg>';
function refreshLobby(){
  achCheck(true);profRender();
  let w=0,l=0;Object.values(save.rec).forEach(r=>{w+=r.w;l+=r.l;});
  const got=Object.keys(STAGES).reduce((n,g)=>n+starsOf(g),0),all=Object.values(STAGES).reduce((n,l)=>n+l.length*3,0);
  $('stageSub').textContent=got?`1큐 스테이지 · ★ ${got} / ${all}`:'한 번의 샷으로 깨는 1큐 스테이지';
  $('onlineSub').textContent=w+l?`실시간 매칭 · ${w}승 ${l}패`:'실시간 매칭 · 승패 기록';
  const rows=$('rankRows');rows.textContent='';
  ['3c','4b','pool'].forEach(g=>{const r=save.rec[g],tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=GAME_INFO[g].name;tr.appendChild(th);[r.rk,rankPos(g)?rankPos(g)+'위':'—',`${r.w}-${r.l}`].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});rows.appendChild(tr);});
}
// ---------- 광고 자리: 실제 SDK를 붙일 때 Ads의 두 함수만 교체 ----------
const AD={STAGE_EVERY:3,INTER_SEC:3,REWARD_SEC:5};
function adOverlay(kind,sec,reward){
  return new Promise(res=>{
    const el=$('adFull'),count=$('adCount'),done=$('adDone'),stop=$('adStop');let left=sec;
    $('adKind').textContent=kind;$('adNote').textContent=reward?'끝까지 보면 힌트를 받아요.':'실제 광고가 들어갈 자리예요.';count.textContent=left;
    el.hidden=false;done.hidden=true;stop.hidden=!reward;
    const iv=setInterval(()=>{left--;count.textContent=Math.max(0,left);if(left<=0){clearInterval(iv);stop.hidden=true;done.hidden=false;done.textContent=reward?'힌트 받기':'닫기';}},1000);
    const finish=v=>{clearInterval(iv);el.hidden=true;res(v);};
    done.onclick=()=>finish(true);stop.onclick=()=>finish(false);
  });
}
// 출시 빌드에는 NcqAds가 들어와요. 없으면(아티팩트) 자리 표시 화면을 보여 줘요
const NA=window.NcqAds;
// NCQ_ADS_RESULT: 대전 종료·스테이지 클리어 전면 광고
// NCQ_ADS_HINT: 스테이지 힌트 보상형 광고
const Ads=NA?{interstitial:()=>NA&&NcqAds.interstitial("RESULT"),rewarded:()=>NcqAds.rewarded("HINT")}:{interstitial:()=>adOverlay('전면 광고',AD.INTER_SEC,false),rewarded:()=>adOverlay('리워드 광고',AD.REWARD_SEC,true)};
let interPending=false;
const afterAd=fn=>()=>{if(interPending){interPending=false;Ads.interstitial().then(fn);}else fn();};
function showResult(o){
  ['hud','dock','powerwrap','menuBtn','placeBar','menu'].forEach(id=>$(id).hidden=true);
  cue.visible=false;cueRing.visible=false;SEGS.forEach(m=>m.visible=false);ghost.visible=false;
  interPending=!!o.ad;
  $('result').hidden=false;$('rTag').textContent=o.tag;
  const m=$('rMain');m.textContent=o.main;m.className=o.cls||'';
  $('rWhy').textContent=o.why||'';
  $('rScore').hidden=!o.score;if(o.score)$('rScore').textContent=o.score;
  const st=$('rStars');st.hidden=o.stars==null;if(o.stars!=null){renderStars(st,o.stars);[...st.children].forEach((e,i)=>{e.style.animationDelay=(.25+i*.32)+'s';e.classList.add('pop');});
    // 별이 하나씩 팡! 팡! 팡!
    if(ac)for(let i=0;i<o.stars;i++)tones([[880+i*220,.25+i*.32+.18,.18],[1320+i*220,.25+i*.32+.2,.22]],.12);}
  const nt=$('rNote');nt.hidden=!o.note;if(o.note)nt.innerHTML=LOCK_MINI+'<span></span>',nt.lastChild.textContent=o.note;
  const rk=$('rRk');rk.hidden=!o.rk;
  if(o.rk){rk.textContent='';const d=o.rk.after-o.rk.before,b=document.createElement('b'),s=document.createElement('span');b.textContent=`${o.rk.label} ${o.rk.after} `;s.textContent=(d>=0?`+${d}`:`${d}`);s.className=d>=0?'up':'down';b.appendChild(s);rk.appendChild(b);rk.appendChild(document.createTextNode(`  ·  ${o.rk.w}승 ${o.rk.l}패`));}
  const p=$('rPrimary');p.textContent=o.primary[0];p.onclick=afterAd(o.primary[1]);
  const s2=$('rSecond');s2.hidden=!o.second;if(o.second){s2.textContent=o.second[0];s2.onclick=afterAd(o.second[1]);}
}
// ---------- 튜토리얼: 4구 스테이지 1~3에서 조작을 하나씩 ----------
let tut=null,tutLine=null,tutPulse=false;
const TUT_TEXT={
  aim:'화면을 누르거나 드래그해서\n큐 방향을 노란 선에 맞춰 보세요',
  line:'화면을 드래그하거나 아래 화면을 스와이프해서\n노란 선에 딱 맞춰 보세요',
  fine:'노란 선이 살짝 옮겨졌어요.\n아래 화면을 좌우로 스와이프해서\n노란 선에 딱 겹치게 맞춰 보세요',
  spin:'왼쪽 공을 누른 채 아래로 드래그해서\n노란 원(공의 아랫부분)에 맞춰 보세요',
  elev:'큐 각도 바를 오른쪽으로 드래그해서\n노란 표시까지 큐를 세워 보세요',
  power:'오른쪽 바를 아래로 당겨\n노란 표시에서 놓아 보세요'
};
const TUT_HINT_TEXT={spin:'왼쪽 공을 누른 채 드래그해서\n노란 원에 맞춰 보세요',elev:'큐 각도 바를 드래그해서\n노란 표시에 맞춰 보세요'};
const TUT_SPOT={line:'pip',fine:'pip',spin:'pad',elev:'elevCell',power:'power'};
const TUT_STAGES=[
  {card:'1단계 · 기본 샷\n각도를 맞추고 힘을 줘서\n빨간 공 두 개를 맞혀 볼게요.',steps:['aim','fine','power']},
  {card:'2단계 · 회전 주기\n공의 윗부분을 치면 앞으로 밀려가고(밀어치기),\n아랫부분을 치면 뒤로 끌려와요(끌어치기).',steps:['spin','power']},
  {card:'3단계 · 큐 세우기\n큐를 세워 세게 치면 공이 뛰어오르고(점프샷),\n옆을 치면 휘어 나가요(마세).\n노란 공을 뛰어넘어 볼게요.',steps:['elev','power']}
];
const TUT_OFF=.04,TUT_FINE=.012,tutAimT=()=>tut.sol.phi+(tut.step==='aim'?TUT_OFF:0);
const angGap=(x,y)=>Math.abs(Math.atan2(Math.sin(x-y),Math.cos(x-y)));
function tutCard(text,fn){$('tutText').textContent=text;$('tutCard').hidden=false;$('tutNext').onclick=()=>{$('tutCard').hidden=true;fn();};}
function tutGhost(on){
  if(!tutLine){const g=new THREE.PlaneGeometry(1,.02);g.translate(.5,0,0);g.rotateX(-Math.PI/2);tutLine=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffd34a,depthTest:false,transparent:true,opacity:.95,toneMapped:false}));tutLine.renderOrder=6;scene.add(tutLine);}
  tutLine.visible=!!on;if(!on)return;
  const c=LB[G.cueI].p;tutLine.position.set(c.x,c.y+.002,c.z);tutLine.rotation.y=-tutAimT();tutLine.scale.x=.9;
}
function tutMarks(step){
  const s=tut&&tut.sol;
  document.querySelectorAll('.padTgt').forEach(e=>{e.hidden=step!=='spin';if(s){e.style.left=(50+s.a/SPIN_MAX*50)+'%';e.style.top=(50-s.b/SPIN_MAX*50)+'%';}});
  const em=$('elevMark');em.hidden=step!=='elev';
  if(step==='elev'){const r=elevIn.getBoundingClientRect(),c=$('elevCell').getBoundingClientRect(),k=s.elev/75,th=16;em.style.left=(r.left-c.left+th/2+k*(r.width-th))+'px';em.style.top=(r.top-c.top+r.height/2)+'px';}
  const m=$('powerMark');if(step==='power'){m.style.top=(s.pw/PMAX*100)+'%';m.hidden=false;}else if(step)m.hidden=true;
  tutGhost(step==='aim'||step==='fine'||step==='line');
}
function tutGo(step){
  if(!tut)return;tut.step=step;tut.lock=false;
  document.querySelectorAll('.tutSpot').forEach(e=>e.classList.remove('tutSpot'));
  $('tutTap').hidden=true;$('tutDim').hidden=!(step==='aim');tutPulse=step==='aim'||step==='fine'||step==='line';
  const b=$('tutBubble');b.hidden=!step;tutMarks(step);tutCtl();
  if(!step)return;
  $('tutMsg').textContent=(tut.hint&&TUT_HINT_TEXT[step])||TUT_TEXT[step];if(TUT_SPOT[step])$(TUT_SPOT[step]).classList.add('tutSpot');
}
function tutDone(step){
  const s=tut&&tut.sol;if(!s||tut.step!==step)return false;
  if(step==='aim')return angGap(aimPhi,s.phi+TUT_OFF)<.025;
  if(step==='fine'||step==='line')return angGap(aimPhi,s.phi)<TUT_FINE;
  if(step==='spin')return Math.abs(hit.a-s.a)<.09&&Math.abs(hit.b-s.b)<.09;
  if(step==='elev')return Math.abs(elev-s.elev)<=5;
  return false;
}
// 노란 선에 한 번 맞추면 그 자리에 딱 붙이고 더는 움직이지 않아요 (손을 떼면 다음 단계로).
// 빠르게 드래그해서 한 번에 노란 선을 넘어가도(prev와 지금이 선의 양쪽) 맞춘 걸로 봐요
const sgn=d=>{while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
function tutSnap(prev){
  if(!tut||tut.lock)return;const st=tut.step;
  if(st!=='aim'&&st!=='fine'&&st!=='line')return;
  const tgt=st==='aim'?tut.sol.phi+TUT_OFF:tut.sol.phi,g1=sgn(aimPhi-tgt),g0=prev==null?g1:sgn(prev-tgt);
  const hitNow=Math.abs(g1)<(st==='aim'?.025:TUT_FINE),crossed=g0*g1<0&&Math.abs(g0)+Math.abs(g1)<.5;
  if(!hitNow&&!crossed)return;
  aimPhi=tgt;tut.lock=true;tones([[660,0,.22]],.05);
}
const aimLocked=()=>!!(tut&&tut.lock);
// 조작을 끝냈을 때 목표에 맞으면 다음 단계로
function tutReady(step){
  if(tut&&tut.step==='line'&&(step==='aim'||step==='fine'))step='line';
  if(!tutDone(step))return;
  const s=tut.sol;if(step==='aim')aimPhi=s.phi+TUT_OFF;else if(step==='fine'||step==='line')aimPhi=s.phi;else if(step==='spin'){hit={a:s.a,b:s.b};drawDot();}else if(step==='elev'){elev=s.elev;syncSpinUI();}
  const st=tut.steps;tones([[880,0,.35]],.06);tutGo(st[st.indexOf(step)+1]);
}
// 힘: 표시 근처에서 놓으면 정답 샷으로 맞춰 치고, 아니면 다시
function tutPower(){
  const s=tut.sol,t=s.pw/PMAX;
  if(tut.step!=='power'||Math.abs(power-t)>.09){power=0;updateUI();const e=$('power');e.classList.remove('nudge');void e.offsetWidth;e.classList.add('nudge');toast('노란 표시에서 놓아 주세요',true);return false;}
  aimPhi=s.phi;hit={a:s.a,b:s.b};elev=s.elev;power=t;syncSpinUI();return true;
}
function tutStage(i){
  tut.i=i;const st=STAGES['4b'][i];tut.sol=st.sol;tut.steps=TUT_STAGES[i].steps;
  startGame({mode:'stage',game:'4b',stage:st,tut:true});
  if(i>0){aimPhi=tut.sol.phi;}
  tutGo(null);tutCard(TUT_STAGES[i].card,()=>tutGo(TUT_STAGES[i].steps[0]));
}
function tutStageDone(){
  if(tut.i<TUT_STAGES.length-1){tutStage(tut.i+1);return;}
  tutGo(null);tut.step='end';
  tutCard('튜토리얼 완료!\n이제 자유롭게 게임을 즐겨 보세요.',()=>{
    tut=null;tutCtl();app.classList.remove('tut');save.tut=2;persist();G.over=true;toLobby();
  });
}
function tutQuit(){tutGo(null);tut=null;tutCtl();app.classList.remove('tut');save.tut=2;persist();}
function tutStart(){
  tut={step:'intro',i:0};$('rules').hidden=true;app.classList.add('tut');
  tutStage(0);$('tutCard').hidden=true;
  tutCard('게임에 입장하기 앞서,\n간단하게 조작을 알려드리겠습니다.',()=>{ensureAudio();tutCard(TUT_STAGES[0].card,()=>tutGo('aim'));});
}
const tutOK=step=>!tut||tut.step===step||(tut.step==='line'&&(step==='aim'||step==='fine'));
// 튜토리얼·힌트 중에는 지금 단계의 조작만 움직일 수 있어요 (나머지 칸은 흐리게 막아요)
function tutCtl(){
  const on=!!tut&&tut.step!=='end';
  [['.cell.spin','spin'],['#pip','fine'],['#elevCell','elev'],['#powerwrap','power']].forEach(([sel,k])=>{const el=document.querySelector(sel);if(el)el.classList.toggle('tutOff',on&&!tutOK(k));});
  if(on&&!tutOK('elev'))elevIn.disabled=true;
}
function openRules(g){
  document.querySelectorAll('#rules .rules-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.r===g));
  document.querySelectorAll('#rules .rules-body').forEach(b=>b.hidden=b.dataset.rb!==g);
  $('rules').hidden=false;
}
document.querySelectorAll('#rules .rules-tabs button').forEach(b=>b.onclick=()=>openRules(b.dataset.r));
$('goRules').onclick=()=>{$('rulesTut').hidden=false;openRules(GAME_INFO[nav.game]?nav.game:'3c');};
$('menuRules').onclick=()=>{$('rulesTut').hidden=true;openRules(G.game);};
$('rulesClose').onclick=()=>{$('rules').hidden=true;};
$('rulesTut').onclick=tutStart;

function renderStars(el,n){el.textContent='';for(let i=0;i<3;i++){const s=document.createElement('span');s.textContent='★';if(i>=n)s.className='off';el.appendChild(s);}}

// ---------- 입력 ----------
function pointOn(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);const pt=new V();return ray.ray.intersectPlane(aimPlane,pt)?pt:null;}
function aimTo(pt){const c=LB[G.cueI].p;if(Math.hypot(pt.x-c.x,pt.z-c.z)<R*1.5)return;aimPhi=Math.atan2(pt.z-c.z,pt.x-c.x);}
function placeTo(pt){const c=LB[0],x=clamp(pt.x,-LIM_X+.01,LIM_X-.01),z=clamp(pt.z,-LIM_Z+.01,LIM_Z-.01);if(LB.some(o=>o!==c&&!o.off&&Math.hypot(o.p.x-x,o.p.z-z)<D2*1.03))return;c.p.x=x;c.p.z=z;}
let drag=null;
canvas.addEventListener('pointerdown',e=>{
  ensureAudio();
  if(phase==='place'){drag={place:true};canvas.setPointerCapture(e.pointerId);const p=pointOn(e);if(p)placeTo(p);return;}
  if(phase!=='aim'||!tutOK('aim'))return;
  drag={x:e.clientX};canvas.setPointerCapture(e.pointerId);
  if(aimLocked())return;
  const p=pointOn(e);if(p)aimTo(p);tutSnap(null);
});
canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(drag.place){const p=pointOn(e);if(p)placeTo(p);return;}
  if(phase!=='aim'||aimLocked())return;
  const a0=aimPhi,p=pointOn(e);if(p)aimTo(p);tutSnap(a0);
});
const endDrag=()=>{if(drag&&tut&&!drag.place)tutReady('aim');drag=null;};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
let wheelT=0;canvas.addEventListener('wheel',e=>{if(phase!=='aim'||(tut&&!['aim','fine','line'].includes(tut.step)))return;e.preventDefault();if(aimLocked())return;const a0=aimPhi;aimPhi+=Math.sign(e.deltaY)*0.002;tutSnap(a0);if(tut){clearTimeout(wheelT);wheelT=setTimeout(()=>tut&&tutReady(tut.step),300);}},{passive:false});
// 큐 시점 화면을 좌우로 스와이프해서 미세 조준
const pipEl=$('pip'),ticksEl=$('fineTicks'),FINE_K=0.0007;let sDrag=null,ticksOff=0;
pipEl.addEventListener('pointerdown',e=>{ensureAudio();if(phase!=='aim'||!tutOK('fine'))return;sDrag={x:e.clientX,m:0};pipEl.setPointerCapture(e.pointerId);});
pipEl.addEventListener('pointermove',e=>{if(!sDrag||phase!=='aim')return;const dx=e.clientX-sDrag.x;sDrag.x=e.clientX;sDrag.m+=Math.abs(dx);if(aimLocked())return;const a0=aimPhi;aimPhi+=dx*FINE_K;tutSnap(a0);ticksOff+=dx;ticksEl.style.backgroundPosition=`${ticksOff}px center,${ticksOff}px center,0 0`;});
const sEnd=()=>{if(sDrag&&tut&&sDrag.m>0)tutReady('fine');sDrag=null;};pipEl.addEventListener('pointerup',sEnd);pipEl.addEventListener('pointercancel',sEnd);
// 칠 곳: 누르면 크게 뜨고, 드래그한 만큼 큰 공 기준으로 움직인다
let padDrag=null;const padZoom=$('padZoom');
pad.addEventListener('pointerdown',e=>{ensureAudio();if(phase!=='aim'||!tutOK('spin'))return;padDrag={x:e.clientX,y:e.clientY,m:0};pad.setPointerCapture(e.pointerId);padZoom.style.bottom=($('dock').offsetHeight+12)+'px';padZoom.hidden=false;drawDot();});
pad.addEventListener('pointermove',e=>{if(!padDrag)return;const dx=e.clientX-padDrag.x,dy=e.clientY-padDrag.y,rad=(padZoom.clientWidth/2)||100;padDrag.x=e.clientX;padDrag.y=e.clientY;padDrag.m+=Math.abs(dx)+Math.abs(dy);let a=hit.a+dx/rad*SPIN_MAX,b=hit.b-dy/rad*SPIN_MAX;const l=Math.hypot(a,b);if(l>SPIN_MAX){a*=SPIN_MAX/l;b*=SPIN_MAX/l;}hit={a,b};drawDot();});
const padEnd=()=>{if(!padDrag)return;padZoom.hidden=true;if(tut&&padDrag.m>=6)tutReady('spin');padDrag=null;};
pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);
$('spinRead').onclick=()=>{if(phase!=='aim'||!tutOK('spin'))return;hit={a:0,b:0};drawDot();};
pad.addEventListener('dblclick',()=>{if(phase!=='aim'||!tutOK('spin'))return;hit={a:0,b:0};drawDot();});
elevIn.addEventListener('input',()=>{
  if(tut&&!tutOK('elev')){elevIn.value=elev;return;}
  let v=+elevIn.value;const c=LB[G.cueI];
  if(c&&v<elev){const rf=cueFloor(c,true,false),bf=cueFloor(c,false,true),lim=Math.min(elev,Math.min(75,Math.max(rf,bf)));if(v<lim){v=lim;elevIn.value=v;cueBlocked(rf>=bf?'rail':'ball');}}
  elev=v;elevVal.textContent=elev+'°';
});
let tutElev0=5;
elevIn.addEventListener('change',()=>tutReady('elev'));
const pw=$('power');let pDrag=null;
pw.addEventListener('pointerdown',e=>{ensureAudio();if(phase!=='aim'||!tutOK('power'))return;pDrag={y:e.clientY};pw.setPointerCapture(e.pointerId);});
pw.addEventListener('pointermove',e=>{if(!pDrag)return;power=clamp((e.clientY-pDrag.y)/(pw.clientHeight*.85),0,1);updateUI();});
function release(){
  if(!pDrag)return;pDrag=null;
  if(power<.02){power=0;updateUI();return;}
  if(G.mode==='practice'){history.push({pos:LB.map(b=>({p:b.p.clone(),q:b.mesh.quaternion.clone(),off:b.off,pot:b.pot})),aimPhi});if(history.length>20)history.shift();}
  if(tut&&!tutPower())return;
  // 큐가 다른 공에 닿는지는 치는 순간의 조준·큐 각도로 다시 봐요 (튜토리얼·힌트가 방금 정답으로 맞춘 값까지)
  const cb=LB[G.cueI],rf=cueFloor(cb,true,false);if(elev<rf){elev=Math.min(rf,75);syncSpinUI();}
  const foul=elev<cueFloor(cb,false,true);setCueRisk(foul);
  pendingShot=buildShot(aimPhi,hit.a,hit.b,elev,power*PMAX,shotOpts());pendingShot.cueFoul=foul;
  phase='strike';strikeT=0;$('powerMark').hidden=true;updateUI();
  if(tut)tutGo(null);
}
pw.addEventListener('pointerup',release);pw.addEventListener('pointercancel',release);
$('placeOk').onclick=()=>{if(phase!=='place')return;G.bih=false;aimDefault();phase='aim';updateUI();};
$('undoBtn').onclick=()=>{if(phase!=='aim')return;const h=history.pop();if(!h)return;LB.forEach((b,i)=>{const s=h.pos[i];b.p.copy(s.p);b.mesh.quaternion.copy(s.q);b.off=s.off;b.pot=s.pot;b.sink=null;b.mesh.visible=!b.off;b.v.set(0,0,0);b.w.set(0,0,0);});aimPhi=h.aimPhi;power=0;updateUI();};
$('resetBtn').onclick=()=>{if(phase!=='aim')return;layoutStart();history=[];aimDefault();};
function applyHint(){
  const c=G.stage.sol;G.usedHint=true;G.tries=1;layoutStage(G.stage);power=0;
  // 정답 조준·칠 곳에서 큐가 레일·다른 공에 닿지 않는 가장 낮은 각도 (지금 조준이 아니라 정답 방향으로 봐요)
  const q=LB[G.cueI];aimPhi=c.phi;hit={a:c.a,b:c.b};
  const rf=cueFloor(q,true,false),ef=Math.min(75,Math.max(c.elev,rf,cueFloor(q,false,true))),steps=['line'];
  hit={a:0,b:0};elev=5;aimDefault();syncSpinUI();updateHUD();
  if(Math.hypot(c.a,c.b)>.05)steps.push('spin');
  if(ef>Math.max(5,rf)+4)steps.push('elev');
  steps.push('power');
  // 큐 각도 단계가 없으면 처음부터 정답 각도로 세워 둬요 (큐가 빨갛게 보이지 않게)
  if(!steps.includes('elev')){elev=ef;syncSpinUI();}
  tut={hint:true,i:-1,sol:Object.assign({},c,{elev:ef}),steps,step:null};
  tutGo('line');updateUI();
}
function hintEnd(){if(tut&&tut.hint){tutGo(null);tut=null;tutCtl();}}
$('hintBtn').onclick=()=>{
  const s=G.stage;if(!s||!s.sol||phase!=='aim')return;
  if(G.hintGranted){applyHint();return;}
  Ads.rewarded().then(ok=>{if(ok&&G.stage===s&&phase==='aim'){G.hintGranted=true;applyHint();}});
};
$('menuBtn').onclick=()=>{
  $('menuQuit').textContent=G.mode==='online'?'기권하기':'나가기';$('menuQuit').classList.remove('arm');
  $('menu').hidden=false;
};
$('menuClose').onclick=()=>{$('menu').hidden=true;};
$('menu').addEventListener('pointerdown',e=>{if(e.target===$('menu'))$('menu').hidden=true;});
$('menuQuit').onclick=()=>{
  const b=$('menuQuit');
  // 튜토리얼·힌트 중에 나가면 그 안내를 끝내요 (남아 있으면 다음 판의 조작이 막혀요)
  if(tut){if(tut.hint)hintEnd();else tutQuit();}
  if(G.mode==='online'&&!G.over){
    if(!b.classList.contains('arm')){b.classList.add('arm');b.textContent='한 번 더 누르면 기권';return;}
    $('menu').hidden=true;netForfeit();finishGame(1-G.myIdx,'기권했어요');return;
  }
  if(G.mode==='stage'){const g=G.game;$('menu').hidden=true;G.mode='attract';toLobby();openStages(g);return;}
  $('menu').hidden=true;G.over=true;toLobby();
};
$('optGuide').onchange=e=>set.guide=e.target.value;

// 로비 동선
const nav={mode:'single',game:'3c',step:'stepGame'};
function showStep(id,title,sub){
  $('sheet').hidden=false;$('lobby').classList.add('sheeted');['stepGame','stepMode','stepStages'].forEach(s=>$(s).hidden=s!==id);nav.step=id;
  const h=$('sheetTitle');h.textContent=title;if(sub){const s=document.createElement('span');s.textContent=sub;h.appendChild(s);}
}
const starsOf=g=>STAGES[g].reduce((n,s)=>n+(save.stars[g+'-'+s.idx]||0),0);
function openGames(){
  const isS=nav.mode==='stage',isO=nav.mode==='online';
  document.querySelectorAll('[data-rk]').forEach(b=>b.hidden=!isO);$('stepGame').classList.toggle('ranked',isO);$('stepGame').classList.toggle('starts',isO);
  document.querySelectorAll('[data-gs]').forEach(el=>{el.hidden=!isS;if(isS){const g=el.dataset.gs;el.textContent=`★ ${starsOf(g)} / ${STAGES[g].length*3}`;}});
  showStep('stepGame',{stage:'Stage',single:'Single',online:'Online'}[nav.mode],'종목 선택');
}
function openModes(){$('aiRule').textContent=GAME_INFO[nav.game].rule;showStep('stepMode',GAME_INFO[nav.game].name,'Single');}
const LOCK_MINI='<svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true"><path d="M3.2 6.2V4.4a2.8 2.8 0 0 1 5.6 0v1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="1.2" y="6" width="9.6" height="7.4" rx="1.6" fill="currentColor"/></svg>';
const ST_HINT=`번호를 누르면 <b>바로 시작</b>해요. 별 <b class="g">${UNLOCK_STARS}개</b> 이상 받으면 다음 판이 열려요.`;
let stHintT=0;
// 잠긴 판을 누르면: 칸이 흔들리고 위 안내 줄이 잠깐 까닭을 알려 줘요
function stageLocked(g,i,tile){
  tile.classList.remove('nudge');void tile.offsetWidth;tile.classList.add('nudge');
  const h=$('stepStages').querySelector('.st-hint');if(!h)return;
  h.classList.add('warn');h.innerHTML=LOCK_MINI+'<span></span>';
  h.lastChild.textContent=stageOpen(g,i-1)?`${i}번을 별 ${UNLOCK_STARS}개 이상으로 깨면 열려요`:`앞 스테이지를 별 ${UNLOCK_STARS}개 이상으로 깨면 차례로 열려요`;
  clearTimeout(stHintT);stHintT=setTimeout(()=>{h.classList.remove('warn');h.innerHTML=ST_HINT;},2200);
}
function openStages(g){
  nav.game=g;nav.mode='stage';const info=GAME_INFO[g],box=$('stepStages');box.textContent='';clearTimeout(stHintT);
  // 다음에 할 스테이지를 파란 칸으로: 처음 하는 판은 ▶, 다시 깨야 하는 판(별 1개)은 별
  const nextI=stageNext(g);
  const hint=document.createElement('p');hint.className='st-hint';hint.innerHTML=ST_HINT;box.appendChild(hint);
  STAGES[g].forEach((s,i)=>{
    const got=stStars(g,i),open=stageOpen(g,i),b=document.createElement('button');
    b.className='stc'+(!open?' lock':got?' done':'')+(i===nextI?' next':'');b.title=s.name;
    b.setAttribute('aria-label',open?`스테이지 ${i+1} ${s.name} 시작`:`스테이지 ${i+1} 잠김`);
    const no=document.createElement('b');no.textContent=i+1;
    let st;
    if(!open){st=document.createElement('span');st.innerHTML=LOCK_MINI;st=st.firstChild;}
    else if(i===nextI&&!got){st=document.createElement('i');st.className='ply';}
    else{st=document.createElement('span');st.className='stars';renderStars(st,got);}
    b.append(no,st);b.onclick=()=>{if(stageOpen(g,i))startStage(s);else stageLocked(g,i,b);};box.appendChild(b);
  });
  showStep('stepStages',info.name,`스테이지 · ★ ${starsOf(g)} / ${STAGES[g].length*3}`);
  if(nextI>4)requestAnimationFrame(()=>{const n=box.querySelector('.stc.next');if(n)box.scrollTop=Math.max(0,n.offsetTop-box.offsetTop-box.clientHeight/2+n.offsetHeight/2);});
  if(G.mode==='attract'&&attr.kind!==info.kind)attract(info.kind);
}
function pickMode(m){ensureAudio();nav.mode=m;openGames();}
$('goStage').onclick=()=>pickMode('stage');
$('goSingle').onclick=()=>pickMode('single');
$('goOnline').onclick=()=>pickMode('online');
document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{
  nav.game=b.dataset.game;const kind=GAME_INFO[nav.game].kind;if(attr.kind!==kind)attract(kind);
  if(nav.mode==='online')startMatching(nav.game);else if(nav.mode==='stage')openStages(nav.game);else openModes();
});
document.querySelectorAll('[data-lv]').forEach(b=>b.onclick=()=>startGame({mode:'ai',game:nav.game,lv:b.dataset.lv}));
$('openPractice').onclick=()=>startGame({mode:'practice',game:nav.game});
$('openLocal').onclick=()=>startGame({mode:'local',game:nav.game});
$('sheetBack').onclick=()=>{if(nav.step==='stepGame'){$('sheet').hidden=true;$('lobby').classList.remove('sheeted');}else openGames();};
$('mCancel').onclick=matchCancel;
$('rLobby').onclick=afterAd(()=>{if(tut)tutQuit();toLobby();});
(function(){const g=$('rackGlyph');let k=0;const order=[1,9,2,10,8,3,11,4,12,5,13,6,14,7,15];for(let r=0;r<5;r++)for(let j=0;j<=r;j++){const n=order[k++],b=document.createElement('i');b.className='b';b.style.setProperty('--c',POOL_COL[(n-1)%8]);b.style.left=(r*11)+'px';b.style.top=(23+(j-r/2)*12.4)+'px';g.appendChild(b);}})();

// ---------- 루프 ----------
// 밖으로 나간 공: 판정과 별개로 바닥까지 떨어져 튀는 모습만 그린다
const FLY_AXIS=new V(),FLY_Q=new THREE.Quaternion();
function flyTick(b,dt){
  const f=b.fly,m=b.mesh.position,floorY=floor.position.y+R;
  f.t+=dt;f.y-=GV*dt;m.x+=f.x*dt;m.y+=f.y*dt;m.z+=f.z*dt;
  if(m.y<floorY){m.y=floorY;if(-f.y>.5){sfx('bounce',Math.min(1,-f.y/4));f.y*=-.48;f.x*=.8;f.z*=.8;}else{f.y=0;f.x*=.985;f.z*=.985;}}
  const sp=Math.hypot(f.x,f.z);if(sp>.01){FLY_AXIS.set(f.z/sp,0,-f.x/sp);FLY_Q.setFromAxisAngle(FLY_AXIS,sp*dt/R);b.mesh.quaternion.premultiply(FLY_Q);}
  if(f.t>2.4||Math.abs(m.x)>HL+3.5||Math.abs(m.z)>HW+3.5){b.fly=null;b.mesh.visible=false;}
}
function syncMeshes(dt){
  if(tutLine&&tutLine.visible){const on=!!(tut&&(tut.lock||((tut.step==='fine'||tut.step==='line')&&angGap(aimPhi,tut.sol.phi)<TUT_FINE)));tutLine.material.opacity=on||!tutPulse?1:.72+.28*Math.sin(performance.now()/180);tutLine.scale.z=on?2:1;}
  LB.forEach(b=>{
    if(b.sink){const s=b.sink;s.t+=dt/.26;const k=Math.min(1,s.t);b.mesh.position.set(s.x+(s.tx-s.x)*k,R-.12*k*k,s.z+(s.tz-s.z)*k);if(k>=1){b.sink=null;b.mesh.visible=false;}}
    else if(b.fly&&b.off)flyTick(b,dt);
    else if(!b.off){b.fly=null;b.mesh.position.copy(b.p);if(Math.abs(b.p.x)>HL+CW*.5||Math.abs(b.p.z)>HW+CW*.5)b.mesh.position.y=Math.max(b.p.y,RAIL_TOP+R);}
    const h=Math.max(0,(b.off?b.mesh.position.y:b.p.y)-R);b.ao.visible=!b.off&&!b.sink&&b.mesh.visible&&h<.35;if(b.ao.visible){const k=Math.min(1,h/.18);b.ao.position.x=b.p.x;b.ao.position.z=b.p.z;b.ao.material.opacity=.78*(1-.55*k);const sc=b.aoS*(1+1.2*k);b.ao.scale.set(sc,1,sc);}
  });
}
let lastClock=Date.now();
function clockTick(dt){
  const nowMs=Date.now(),gap=nowMs-lastClock;lastClock=nowMs;
  if((G.mode!=='ai'&&G.mode!=='online')||G.over)return;
  if(G.mode==='ai'&&G.clockEnd)G.clockEnd+=$('menu').hidden?Math.max(0,gap-dt*1000):gap;
  const running=phase==='aim'||phase==='place'||phase==='ai-think'||phase==='ai-aim'||phase==='wait';
  $('clockBar').classList.toggle('held',!running);
  if(!running||!G.clockEnd)return;
  const left=Math.max(0,G.clockEnd-nowMs),fill=$('clockFill');
  fill.style.transform=`scaleX(${left/SHOT_MS})`;fill.classList.toggle('low',left<=10000);
  if(left<=0&&(phase==='aim'||phase==='place'))timeoutTurn();
}
function tick(dt,now){
  switch(phase){
    case 'attract':attractTick(dt);break;
    case 'strike':strikeT+=dt;if(strikeT>=.08){const s=pendingShot;pendingShot=null;if(G.net)netShoot(s);else fireLive(G.cueI,s);}break;
    case 'shot':stepLive(dt);shotT+=dt;stillT=anyMoving(LB)?0:stillT+dt;if(stillT>.3||shotT>30)endShot();break;
    case 'ai-think':aiTick();break;
    case 'ai-aim':aiAimTick(dt);break;
    case 'pause':G.pauseT-=dt;if(G.pauseT<=0){const f=G.next;G.next=null;if(f)f();}break;
  }
  clockTick(dt);
}
let last=performance.now();
function loop(now){
  const fdt=Math.min(0.05,(now-last)/1000);last=now;
  tick(fdt,now);
  syncMeshes(fdt);updateCue(fdt);updateGuide();updateCamera(fdt,false,now);
  renderer.setScissorTest(false);renderer.setViewport(0,0,viewW,viewH);renderer.setClearColor(0x07090c,1);renderer.clear();
  if(!$('dock').hidden){const b=free.y+free.h;renderer.setScissorTest(true);renderer.setScissor(0,viewH-b,viewW,b);}
  renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);renderer.setScissorTest(false);
  const pip=$('pip'),c=LB[G.cueI];
  if(!$('dock').hidden&&cue.visible&&c){
    const r=pip.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
    if(r.width>2&&r.height>2){
      const x=r.left-cr.left,y=viewH-(r.top-cr.top)-r.height,d=cueDir(aimPhi,elev);
      pipCam.aspect=r.width/r.height;pipCam.updateProjectionMatrix();
      pipCam.position.copy(c.p).addScaledVector(d,-0.3).add(new V(0,0.03,0));pipCam.lookAt(c.p.x,c.p.y+0.004,c.p.z);
      const gv=SEGS.map(m=>m.visible),ghv=ghost.visible,crv=cueRing.visible;SEGS.forEach(m=>m.visible=false);ghost.visible=false;cueRing.visible=false;
      renderer.setScissorTest(true);renderer.setViewport(x,y,r.width,r.height);renderer.setScissor(x,y,r.width,r.height);
      renderer.render(scene,pipCam);renderer.setScissorTest(false);
      SEGS.forEach((m,i)=>m.visible=gv[i]);ghost.visible=ghv;cueRing.visible=crv;
    }
  }
  requestAnimationFrame(loop);
}
window.addEventListener('resize',relayout);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(relayout);
{const v=window.NCQ&&window.NCQ.NCQ_VERSION;$('appVer').textContent=v?'v'+v:'dev';
 const fb=window.NcqFeedback,btn=$('feedBtn');btn.hidden=!(fb&&fb.can());btn.onclick=()=>fb.open();
 // Online·랭킹은 회사 게임 서버에 로그인할 수 있는 출시 빌드에서만 (개발 중·미리보기에는 가짜 상대를 두지 않아요)
 if(!onlineOn()){$('goOnline').hidden=true;$('rankOpen').hidden=true;$('goSingle').setAttribute('data-ncq-main','Single');}}
loadSave();refreshLobby();netRefresh();attract('carom');relayout();updateCamera(0,true,performance.now());drawDot();
if((save.tut|0)<2)tutStart();
requestAnimationFrame(loop);
/*__TEST_HOOK__*/
})();
