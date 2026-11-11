
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
// 로비 제목·부제가 오른쪽 위 전적 표 밑으로 들어가지 않게 글자 크기를 줄여 맞춰요 (언어마다 길이가 달라요)
function fitBrand(){
  const box=document.querySelector('#lobby .rankbox');if(!box||$('lobby').hidden)return;
  const right=box.getBoundingClientRect().left-10;
  // 제목은 줄여서 한 줄로, 부제는 14px까지 줄이고 그래도 길면 두 줄로 나눠요
  document.querySelectorAll('.brand h1,.brand p').forEach(el=>{
    const h1=el.tagName==='H1',min=h1?28:14;el.style.fontSize=el.style.whiteSpace=el.style.maxWidth='';
    const w=el.getBoundingClientRect().width,room=right-el.getBoundingClientRect().left;if(w<=room||room<=0)return;
    const want=Math.floor(parseFloat(getComputedStyle(el).fontSize)*room/w);
    el.style.fontSize=Math.max(min,want)+'px';
    if(want<min&&!h1){el.style.whiteSpace='normal';el.style.maxWidth=room+'px';}
  });
}
function relayout(){
  fitBrand();
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
  vib('light');
  if(now-blockAt>900){blockAt=now;toast(T(why==='rail'?'cue_rail':'cue_ball'),true);}
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
  if(ac){if(!window.NcqSound&&ac.state==='suspended')ac.resume();return;}
  try{
    // 공용 소리 모듈 NcqSound의 AudioContext·효과음 채널에 이어서 설정의 효과음 켬·끔·음량, 화면이 가려지면 멈춤이 그대로 적용돼요
    const S=window.NcqSound;ac=S?S.context():new (window.AudioContext||window.webkitAudioContext)();if(!ac)return;
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=3;comp.connect((S&&S.output('sfx'))||ac.destination);
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
// 진동: 공용 기기 모듈 NcqDevice (설정에서 끌 수 있어요)
function vib(k){if(G.mode==='attract')return;try{window.NcqDevice&&NcqDevice.vibrate(k);}catch(e){}}
// 설정을 바꿀 때 들려주는 짧은 소리 (로비에서도)
function uiTick(){if(ac&&hitBuf)playHit(1.05,.5,9000);}
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
function banner(t){const el=$('banner');el.textContent=t;el.classList.toggle('long',t.length>18);el.classList.add('show');clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>el.classList.remove('show'),850);}
function drawDot(){
  const ka=hit.a/SPIN_MAX,kb=hit.b/SPIN_MAX;$('dotZoom').style.left=(50+ka*50)+'%';$('dotZoom').style.top=(50-kb*50)+'%';
  const r=pad.clientWidth/2||35;dot.style.left=(r+ka*r)+'px';dot.style.top=(r-kb*r)+'px';
  const v=hit.b>0.12?T('spin_follow'):hit.b<-0.12?T('spin_draw'):'',s=hit.a>0.12?T('spin_right'):hit.a<-0.12?T('spin_left'):'',read=$('spinRead');
  read.textContent=s&&v?T('spin_both',{s,v}):(s||v||T('spin_center'));
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
// 대전 화면의 프로필 아이콘: 나는 고른 아이콘, Online 상대는 서버 아이콘, AI·2인 대전 상대는 공 아이콘
function playerIcon(pi){
  const p=G.players[pi],mine=G.mode==='local'?pi===0:pi===G.myIdx;
  if(mine)return save.icon||'ball-w';
  if(G.mode==='online'&&G.net&&G.net.oppIcon)return G.net.oppIcon;
  return G.mode==='local'?'ball-y':'ball-r';
}
function updateHUD(){
  const solo=G.mode==='stage'||G.mode==='practice';
  $('clockBar').hidden=solo;
  $('hudPlayers').hidden=solo;$('hudSolo').hidden=!solo;
  if(solo){
    const st=G.stage,isS=G.mode==='stage';
    $('soloTag').textContent=isS?T('stage_tag',{game:G.info.name,n:st.idx+1}):T('practice_tag',{game:G.info.name});
    $('soloTitle').textContent=isS?st.name:T('free_practice');
    $('soloGoal').textContent=isS?st.desc:T('free_practice_d');
    $('soloTries').textContent=T('tries',{n:G.tries});$('soloTries').hidden=!isS;
    $('hintBtn').hidden=!isS||!st.sol||(!!window.NcqAds&&!window.NcqAds.can('HINT'));$('undoBtn').hidden=isS;$('resetBtn').hidden=isS;
    return;
  }
  const me=G.myIdx,pool=G.game==='pool';
  [me,1-me].forEach((pi,k)=>{
    const p=G.players[pi],chip=$('chip'+k);
    {const id=playerIcon(pi),pc=$('pic'+k);if(pc.dataset.id!==id){pc.dataset.id=id;pc.innerHTML=iconSVG(id,30);}}
    {const nm=$('nm'+k);nm.textContent=k===0&&G.mode!=='local'?(G.mode==='online'&&G.net?save.nick:T('you')):p.name;for(let t=0;t<(p.to|0);t++){const i=document.createElement('span');i.className='tmo';i.title=T('timed_out');i.innerHTML=TMO_SVG;nm.appendChild(i);}}
    $('pl'+k).classList.toggle('on',G.turn===pi&&!G.over);
    $('sc'+k).textContent=p.score;$('sc'+k).hidden=pool;
    $('bd'+k).hidden=pool;$('dt'+k).hidden=!pool;
    if(pool){
      renderDots($('dt'+k),p.group);chip.className='b';chip.style.setProperty('--c',p.group==='solid'?POOL_COL[0]:p.group==='stripe'?'#f4f1e8':'#3a4757');chip.style.backgroundImage=p.group==='stripe'?`linear-gradient(180deg,transparent 28%,${POOL_COL[1]} 28% 72%,transparent 72%)`:'';
    }else{renderBeads($('bd'+k),G.target,p.score);chip.className='b '+(pi===0?'w':'y');chip.style.removeProperty('--c');chip.style.backgroundImage='';}
  });
  $('ruleName').textContent=G.info.name;
  $('inn').textContent=G.isBreak?T('break_'):T('inning',{n:G.inning});
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
  ['hud','dock','powerwrap','menuBtn'].forEach(id=>$(id).hidden=false);
  $('powerMark').hidden=true;$('menuQuit').textContent=T('quit');$('menuQuit').classList.remove('arm');
  updateHUD();relayout();
}
function exitGameUI(){['hud','dock','powerwrap','menuBtn','placeBar','menu'].forEach(id=>$(id).hidden=true);cue.visible=false;cueRing.visible=false;SEGS.forEach(m=>m.visible=false);ghost.visible=false;relayout();}
function toLobby(){hintEnd();
  if(G.net&&!G.net.closed)netClose();
  exitGameUI();
  ['result','matching','sheet'].forEach(id=>$(id).hidden=true);$('lobby').hidden=false;$('lobby').classList.remove('sheeted');
  refreshLobby();attract(nav.game);
}
// 랭킹 팝업: 회사 게임 서버의 종목별 Rating 1~100위 (공용 봇이 처음부터 표를 채워요), 맨 아래는 늘 내 순위
let rankTab=null;
async function openRanks(g){
  rankTab=g;
  document.querySelectorAll('#ranks .rules-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.k===g));
  const tb=$('rankList'),foot=$('rankMine'),note=$('rankNote');tb.textContent='';foot.textContent='';note.textContent=T('loading');$('ranks').hidden=false;
  const b=await getBoard();if(rankTab!==g)return;
  if(!b){note.textContent=T('rank_dev');return;}
  let lb=null;try{lb=await b.leaderboard(100,BOARD_Q[g]);}catch(e){}
  if(rankTab!==g||$('ranks').hidden)return;
  if(!lb||!Array.isArray(lb.top)){note.textContent=T('rank_fail');return;}
  const row=(x,rank)=>{const me=!!x.you,tr=document.createElement('tr');if(me)tr.className='me';
    [rank,me?T('me_name',{name:save.nick}):safeNick(x.nickname||'',T('player')),x.rating|0,T('wl',{w:x.wins|0,l:x.losses|0})].forEach((v,j)=>{const td=document.createElement('td');td.textContent=v;if(j===1)td.prepend(iconEl(me?(save.icon||'ball-w'):rankIcon(x),20));tr.appendChild(td);});return tr;};
  lb.top.slice(0,100).forEach(x=>tb.appendChild(row(x,x.rank)));
  const y=lb.you,mine=played(y);RANK.pos[g]=mine?y.rank:0;
  const rec=save.rec[g];foot.appendChild(row(y||{you:true,rating:rec.rk,wins:rec.w,losses:rec.l},mine?y.rank+'':'—'));
  note.textContent=T(mine?'rank_note_on':'rank_note_off');
}
document.querySelectorAll('#ranks .rules-tabs button').forEach(b=>b.onclick=()=>openRanks(b.dataset.k));
$('rankOpen').onclick=()=>openRanks(nav.game);
$('ranksClose').onclick=()=>{$('ranks').hidden=true;rankTab=null;};
const TMO_SVG='<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v3.6l2 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 1.6 8.6 5.2l2.4.6-1.6 3.2" fill="none" stroke="#0b0f14" stroke-width="1.8"/><path d="M10.5 1.6 8.6 5.2l2.4.6-1.6 3.2" fill="none" stroke="currentColor" stroke-width=".8"/></svg>';
function refreshLobby(){
  achCheck(true);profRender();
  // 부제: 종목 이름을 '·'로 이어요. 줄이 바뀔 때 이름 가운데(3-Cushion의 '-' 등)에서 끊기지 않게 이름마다 묶어요
  const bs=$('brandSub');bs.textContent='';['3c','4b','pool'].forEach((g,i)=>{if(i)bs.append('\u00a0· ');const n=document.createElement('span');n.style.whiteSpace='nowrap';n.textContent=GAME_INFO[g].name;bs.append(n);});
  requestAnimationFrame(fitBrand);
  pickGame(nav.game,true);
  const rows=$('rankRows');rows.textContent='';
  ['3c','4b','pool'].forEach(g=>{const r=save.rec[g],tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=GAME_INFO[g].name;tr.appendChild(th);[r.rk,rankPos(g)?T('rank_pos',{n:rankPos(g)}):'—',`${r.w}-${r.l}`].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});rows.appendChild(tr);});
}
// ---------- 광고 자리: 실제 SDK를 붙일 때 Ads의 두 함수만 교체 ----------
const AD={STAGE_EVERY:3,INTER_SEC:3,REWARD_SEC:5};
function adOverlay(kind,sec,reward){
  return new Promise(res=>{
    const el=$('adFull'),count=$('adCount'),done=$('adDone'),stop=$('adStop');let left=sec;
    $('adKind').textContent=kind;$('adNote').textContent=T(reward?'ad_reward_note':'ad_note');count.textContent=left;
    el.hidden=false;done.hidden=true;stop.hidden=!reward;
    const iv=setInterval(()=>{left--;count.textContent=Math.max(0,left);if(left<=0){clearInterval(iv);stop.hidden=true;done.hidden=false;done.textContent=T(reward?'get_hint':'close');}},1000);
    const finish=v=>{clearInterval(iv);el.hidden=true;res(v);};
    done.onclick=()=>finish(true);stop.onclick=()=>finish(false);
  });
}
// 출시 빌드에는 NcqAds가 들어와요. 없으면(아티팩트) 자리 표시 화면을 보여 줘요
const NA=window.NcqAds;
// NCQ_ADS_RESULT: 대전 종료·스테이지 클리어 전면 광고
// NCQ_ADS_HINT: 스테이지 힌트 보상형 광고
const Ads=NA?{interstitial:()=>NA&&NcqAds.interstitial("RESULT"),rewarded:()=>NcqAds.rewarded("HINT")}:{interstitial:()=>adOverlay(T('ad_inter'),AD.INTER_SEC,false),rewarded:()=>adOverlay(T('ad_reward'),AD.REWARD_SEC,true)};
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
  if(o.rk){rk.textContent='';const d=o.rk.after-o.rk.before,b=document.createElement('b'),s=document.createElement('span');b.textContent=`${o.rk.label} ${o.rk.after} `;s.textContent=(d>=0?`+${d}`:`${d}`);s.className=d>=0?'up':'down';b.appendChild(s);rk.appendChild(b);rk.appendChild(document.createTextNode('  ·  '+T('wl',{w:o.rk.w,l:o.rk.l})));}
  const p=$('rPrimary');p.textContent=o.primary[0];p.onclick=afterAd(o.primary[1]);
  const s2=$('rSecond');s2.hidden=!o.second;if(o.second){s2.textContent=o.second[0];s2.onclick=afterAd(o.second[1]);}
}
// ---------- 튜토리얼: 4구 스테이지 1~3에서 조작을 하나씩 ----------
let tut=null,tutLine=null,tutPulse=false;
// 안내 문구는 글자 표(texts.js)의 키
const TUT_TEXT={aim:'tut_aim',line:'tut_line',fine:'tut_fine',spin:'tut_spin',elev:'tut_elev',power:'tut_power'};
const TUT_HINT_TEXT={spin:'tuth_spin',elev:'tuth_elev'};
// 지금 단계 안내 문구 키 (힌트 문구 → 그 튜토리얼 판만의 문구 → 기본)
const tutKey=step=>(tut.hint&&TUT_HINT_TEXT[step])||(!tut.hint&&TUT_STAGES[tut.i]&&TUT_STAGES[tut.i].text&&TUT_STAGES[tut.i].text[step])||TUT_TEXT[step];
const TUT_SPOT={line:'pip',fine:'pip',spin:'pad',elev:'elevCell',power:'power'};
const TUT_STAGES=[
  {card:'tut_card1',steps:['aim','fine','power']},
  {card:'tut_card2',steps:['spin','power']},
  {card:'tut_card3',steps:['spin','elev','power'],text:{spin:'tut_spin3'}}
];
// 이만큼 가까이 오면 목표에 딱 붙여요 (조준·미세 조준은 라디안, 칠 곳은 패드 반지름 비율, 큐 각도는 도, 힘은 0~1)
const TUT_SNAP={aim:.045,fine:.02,spin:.15,elev:6,power:.06};
const TUT_OFF=.04,TUT_FINE=TUT_SNAP.fine,tutAimT=()=>tut.sol.phi+(tut.step==='aim'?TUT_OFF:0);
const angGap=(x,y)=>Math.abs(Math.atan2(Math.sin(x-y),Math.cos(x-y)));
let tutCardKey=null;
function tutCard(key,fn){tutCardKey=key;$('tutText').textContent=T(key);$('tutCard').hidden=false;$('tutNext').onclick=()=>{$('tutCard').hidden=true;fn();};}
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
  tutPulse=step==='aim'||step==='fine'||step==='line';tutCycle0=performance.now();tutGeoKey='';
  const b=$('tutBubble');b.hidden=!step;tutMarks(step);tutCtl();
  if(!step)return;
  $('tutMsg').textContent=T(tutKey(step));if(TUT_SPOT[step])$(TUT_SPOT[step]).classList.add('tutSpot');
}
function tutDone(step){
  const s=tut&&tut.sol;if(!s||tut.step!==step)return false;
  if(step==='aim')return angGap(aimPhi,s.phi+TUT_OFF)<TUT_SNAP.aim;
  if(step==='fine'||step==='line')return angGap(aimPhi,s.phi)<TUT_FINE;
  if(step==='spin')return Math.abs(hit.a-s.a)<.09&&Math.abs(hit.b-s.b)<.09;
  if(step==='elev')return Math.abs(elev-s.elev)<=TUT_SNAP.elev;
  return false;
}
// 노란 선에 한 번 맞추면 그 자리에 딱 붙이고 더는 움직이지 않아요 (손을 떼면 다음 단계로).
// 빠르게 드래그해서 한 번에 노란 선을 넘어가도(prev와 지금이 선의 양쪽) 맞춘 걸로 봐요
const sgn=d=>{while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
function tutSnap(prev){
  if(!tut||tut.lock)return;const st=tut.step;
  if(st!=='aim'&&st!=='fine'&&st!=='line')return;
  const tgt=st==='aim'?tut.sol.phi+TUT_OFF:tut.sol.phi,g1=sgn(aimPhi-tgt),g0=prev==null?g1:sgn(prev-tgt);
  const hitNow=Math.abs(g1)<(st==='aim'?TUT_SNAP.aim:TUT_FINE),crossed=g0*g1<0&&Math.abs(g0)+Math.abs(g1)<.5;
  if(!hitNow&&!crossed)return;
  aimPhi=tgt;tutLockNow();
}
// 목표에 딱 붙었을 때: 소리와 반짝임, 손을 떼면 다음 단계로
function tutLockNow(){tut.lock=true;tones([[660,0,.12],[990,.07,.2]],.06);const r=$('tutRings');r.classList.remove('snap');void r.getBoundingClientRect();r.classList.add('snap');}
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
  if(tut.step!=='power'||Math.abs(power-t)>.09){power=0;updateUI();const e=$('power');e.classList.remove('nudge');void e.offsetWidth;e.classList.add('nudge');toast(T('tut_release'),true);return false;}
  aimPhi=s.phi;hit={a:s.a,b:s.b};elev=s.elev;power=t;syncSpinUI();return true;
}
function tutStage(i){
  tut.i=i;const st=STAGES['4b'][i];tut.sol=st.sol;tut.steps=TUT_STAGES[i].steps;
  startGame({mode:'stage',game:'4b',stage:st,tut:true});
  // 1단계는 처음 조준을 목표에서 90도 돌려 둬요 (노란 선에 맞췄을 때 딱 붙는 게 잘 보이게), 2·3단계는 정답 방향
  aimPhi=i>0?tut.sol.phi:tut.sol.phi+TUT_OFF+Math.PI/2;
  tutGo(null);tutCard(TUT_STAGES[i].card,()=>tutGo(TUT_STAGES[i].steps[0]));
}
function tutStageDone(){
  if(tut.i<TUT_STAGES.length-1){tutStage(tut.i+1);return;}
  tutGo(null);tut.step='end';
  tutCard('tut_done',()=>{
    tut=null;tutCtl();app.classList.remove('tut');save.tut=2;persist();G.over=true;toLobby();
  });
}
// 튜토리얼을 그만두면 떠 있는 안내 카드도 닫아요 (카드가 화면을 덮어 다음 판 조작이 막히지 않게)
function tutQuit(){$('tutCard').hidden=true;tutGo(null);tut=null;tutCtl();app.classList.remove('tut');save.tut=2;persist();}
function tutStart(){
  tut={step:'intro',i:0};$('rules').hidden=true;app.classList.add('tut');
  tutStage(0);$('tutCard').hidden=true;
  tutCard('tut_intro',()=>{ensureAudio();tutCard(TUT_STAGES[0].card,()=>tutGo('aim'));});
}
const tutOK=step=>!tut||tut.step===step||(tut.step==='line'&&(step==='aim'||step==='fine'));
// 튜토리얼·힌트 중에는 지금 단계의 조작만 움직일 수 있어요 (나머지 칸은 흐리게 막아요)
function tutCtl(){
  const on=!!tut&&tut.step!=='end';
  [['.cell.spin','spin'],['#pip','fine'],['#elevCell','elev'],['#powerwrap','power']].forEach(([sel,k])=>{const el=document.querySelector(sel);if(el)el.classList.toggle('tutOff',on&&!tutOK(k));});
  // 큐 각도 바는 칸을 흐리게 하는 것 말고 disabled로 막아서, 큐 각도 단계가 되면 여기서 다시 풀어요 (안 풀면 바가 안 움직여요)
  elevIn.disabled=phase!=='aim'||(on&&!tutOK('elev'));
}
// ---------- 튜토리얼 안내 그림 ----------
// 화면을 진하게 어둡게 깔고 지금 만질 곳만 뚫어 밝게 보여 줘요. 손가락이 누를 곳에서 끌 방향으로 되풀이해서 움직이고,
// 말풍선은 그 곳 가까이(아래 조작 칸이면 바로 위, 힘 바면 왼쪽)에 붙어요. 사용자가 만지는 동안과 딱 붙은 뒤에는 손가락을 숨겨요.
const SVGNS='http://www.w3.org/2000/svg',tutV=new V();
let tutCycle0=0,tutGeoKey='',tutPressT=-1e9,tutRelT=-1e9;
app.addEventListener('pointerdown',()=>{tutPressT=performance.now();},true);
['pointerup','pointercancel'].forEach(t=>window.addEventListener(t,()=>{tutRelT=performance.now();},true));
// 당구대 위 점(x,z) → #app 안 화면 좌표
function scrPt(x,z){const c=canvas.getBoundingClientRect(),a=app.getBoundingClientRect();tutV.set(x,R,z).project(camera);return {x:c.left-a.left+(tutV.x+1)/2*c.width,y:c.top-a.top+(1-tutV.y)/2*c.height};}
function relRect(el,pad){const r=el.getBoundingClientRect(),a=app.getBoundingClientRect(),p=pad||0;return {x:r.left-a.left-p,y:r.top-a.top-p,w:r.width+2*p,h:r.height+2*p};}
// 단계마다: 밝게 뚫을 곳(holes), 손가락이 지나갈 길(pts), 말풍선 자리(where)
function tutGeom(step){
  const s=tut.sol;
  if(step==='aim'||step==='line'){
    const c=LB[G.cueI].p,tgt=step==='aim'?s.phi+TUT_OFF:s.phi,len=a=>Math.max(.14,Math.min(.5,toRail(c.x,c.z,Math.cos(a),Math.sin(a),.5)*.9));
    const d=sgn(tgt-aimPhi),n=14,pts=[],cc=scrPt(c.x,c.z);
    for(let i=0;i<=n;i++){const k=i/n,a=aimPhi+d*k,l=len(tgt)*k+len(aimPhi)*(1-k);pts.push(scrPt(c.x+Math.cos(a)*l,c.z+Math.sin(a)*l));}
    const B=pts[n],d2=a=>'M'+a.map(p=>p.x.toFixed(1)+' '+p.y.toFixed(1)).join('L');
    const holes=[{cx:cc.x,cy:cc.y,r:30,ring:0},{d:d2(pts),w:74},{d:d2([cc,B]),w:34},{cx:B.x,cy:B.y,r:30,hole:0}];
    if(step==='line')holes.push(relRect($('pip'),5));
    return {holes,pts,where:'table'};
  }
  if(step==='fine'){
    const r=relRect($('pip'),5),gap=sgn(s.phi-aimPhi),dir=gap>0?1:-1,dist=Math.min(r.w*.44,Math.max(46,Math.abs(gap)/FINE_K)),cx=r.x+r.w/2,cy=r.y+r.h*.42;
    return {holes:[r],pts:[{x:cx-dir*dist/2,y:cy},{x:cx+dir*dist/2,y:cy}],where:'dock'};
  }
  if(step==='spin'){
    // 칠 곳은 끈 거리만큼 크게 뜬 공에서 움직여요: 손가락이 끌 거리 = 바꿀 양 ÷ 최대 회전 × 큰 공 반지름
    const r=relRect(pad),cx=r.x+r.w/2,cy=r.y+r.h/2,zr=Math.min(app.clientWidth*.62,230)/2,dx=(s.a-hit.a)/SPIN_MAX*zr,dy=-(s.b-hit.b)/SPIN_MAX*zr;
    return {holes:[{cx,cy,r:r.w/2+12}],pts:[{x:cx-dx/2,y:cy-dy/2},{x:cx+dx/2,y:cy+dy/2}],where:'dock'};
  }
  if(step==='elev'){
    const r=relRect(elevIn),th=16,x=v=>r.x+th/2+v/75*(r.w-th),y=r.y+r.h/2;
    return {holes:[relRect($('elevCell'),5)],pts:[{x:x(elev),y},{x:x(s.elev),y}],where:'dock'};
  }
  const r=relRect($('power')),x=r.x+r.w/2,y0=r.y+14;
  return {holes:[relRect($('powerwrap'),6)],pts:[{x,y:y0},{x,y:y0+s.pw/PMAX*r.h*.85}],where:'right'};
}
function svgEl(tag,at){const e=document.createElementNS(SVGNS,tag);for(const k in at)e.setAttribute(k,at[k]);return e;}
function tutAt(pts,f){
  let tot=0;const seg=[];for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);seg.push(l);tot+=l;}
  let d=f*tot;for(let i=0;i<seg.length;i++){if(d<=seg[i]||i===seg.length-1){const k=seg[i]?Math.min(1,d/seg[i]):1;return {x:pts[i].x+(pts[i+1].x-pts[i].x)*k,y:pts[i].y+(pts[i+1].y-pts[i].y)*k};}d-=seg[i];}
  return pts[0];
}
function tutDraw(now){
  const sh=$('tutShade'),hand=$('tutHand'),bub=$('tutBubble'),st=tut&&tut.step;
  const show=!!(st&&TUT_TEXT[st]&&$('tutCard').hidden&&!G.over&&phase==='aim'&&$('menu').hidden);
  sh.toggleAttribute('hidden',!show);if(!show){hand.hidden=true;return;}   // SVG는 .hidden이 없어서 속성으로
  const g=tutGeom(st),key=st+JSON.stringify(g.holes.map(h=>h.d?[h.d.length,h.d.slice(0,24),h.d.slice(-12)]:h.r!=null?[h.cx|0,h.cy|0,h.r|0]:[h.x|0,h.y|0,h.w|0,h.h|0]));
  if(key!==tutGeoKey){
    tutGeoKey=key;const holes=$('tutHoles'),rings=$('tutRings');holes.textContent='';rings.textContent='';
    // 구멍(hole:0이면 빼요)과 금색 테두리(ring:0이면 빼요). 길(d)은 굵은 선으로 뚫어요
    g.holes.forEach(h=>{
      if(h.d){holes.appendChild(svgEl('path',{d:h.d,fill:'none',stroke:'#000','stroke-width':h.w,'stroke-linecap':'round','stroke-linejoin':'round'}));return;}
      const at=h.r!=null?['circle',{cx:h.cx,cy:h.cy,r:h.r}]:['rect',{x:h.x,y:h.y,width:h.w,height:h.h,rx:10}];
      if(h.hole!==0)holes.appendChild(svgEl(at[0],Object.assign({fill:'#000'},at[1])));
      if(h.ring!==0)rings.appendChild(svgEl(at[0],at[1]));
    });
  }
  // 손가락: 나타나서 → 누르고 → 길을 따라 끌고 → 떼고 → 사라져요 (만지는 동안·딱 붙은 뒤에는 숨겨요)
  const busy=tutPressT>tutRelT||now-tutRelT<800||tut.lock,arrow=$('tutArrow');
  const p0=g.pts[0],p1=g.pts[g.pts.length-1],far=Math.hypot(p1.x-p0.x,p1.y-p0.y)>14;
  arrow.style.display=busy||!far?'none':'';
  if(!busy&&far)arrow.setAttribute('d','M'+g.pts.map(p=>p.x.toFixed(1)+' '+p.y.toFixed(1)).join('L'));
  hand.hidden=busy;
  // 만지는 동안 말풍선은 숨겨요 (크게 뜬 칠 곳 공 등을 가리지 않게)
  bub.style.opacity=tutPressT>tutRelT?'0':'';
  if(!busy){
    const k=((now-tutCycle0)%2000)/2000,ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    const f=k<.24?0:k<.78?ease((k-.24)/.54):1,pt=far?tutAt(g.pts,f):p0;
    const op=k<.1?k/.1:k>.9?(1-k)/.1:1,press=k>.14&&k<.84;
    hand.style.opacity=op;hand.style.transform=`translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px) scale(${press?.88:1})`;
    hand.classList.toggle('down',press);
  }
  // 말풍선 자리
  const ah=app.clientHeight,aw=app.clientWidth,bh=bub.offsetHeight,dockTop=$('dock').offsetTop,cr=$('tutCaret');
  bub.style.left='16px';bub.style.right='16px';bub.style.top='';bub.style.bottom='';cr.className='';
  if(g.where==='right'){
    const h=g.holes[0];bub.style.right=(aw-h.x+12)+'px';bub.style.top=Math.max(12,Math.min(ah-bh-12,h.y+h.h/2-bh/2))+'px';
    cr.className='r';cr.style.top=Math.max(14,Math.min(bh-14,h.y+h.h/2-parseFloat(bub.style.top)))+'px';cr.style.left='';
  }else if(g.where==='dock'){
    bub.style.bottom=(ah-dockTop+16)+'px';
    const h=g.holes[0],hx=h.r!=null?h.cx:h.x+h.w/2;cr.className='d';cr.style.left=Math.max(18,Math.min(aw-50,hx-16))+'px';cr.style.top='';
  }else{
    // 당구대: 위쪽에 두고, 밝힌 곳과 겹치면 아래 조작 칸 바로 위로
    const hud=$('hud'),top=(!hud.hidden&&!app.classList.contains('tut'))?hud.offsetTop+hud.offsetHeight+8:14;
    const ys=g.pts.map(p=>p.y).concat([g.holes[0].cy]),y0=Math.min(...ys)-40,y1=Math.max(...ys)+40;
    if(y0<top+bh+6&&y1<dockTop-bh-22)bub.style.bottom=(ah-dockTop+16)+'px';else bub.style.top=top+'px';
  }
}
function openRules(g){
  document.querySelectorAll('#rules .rules-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.r===g));
  document.querySelectorAll('#rules .rules-body').forEach(b=>b.hidden=b.dataset.rb!==g);
  $('rules').hidden=false;
}
document.querySelectorAll('#rules .rules-tabs button').forEach(b=>b.onclick=()=>openRules(b.dataset.r));
$('menuRules').onclick=()=>openRules(G.game);
$('rulesClose').onclick=()=>{$('rules').hidden=true;};
// 설정: 효과음 켬·끔·음량(NcqSound), 진동 켬·끔(NcqDevice). 로비 설정 창과 게임 중 메뉴가 같은 값을 봐요
function syncOpts(){
  const S=window.NcqSound,D=window.NcqDevice,on=S?S.enabled('sfx'):true;
  document.querySelectorAll('.opt-sfx').forEach(i=>{i.checked=on;i.disabled=!S;});
  document.querySelectorAll('.opt-vol').forEach(i=>{i.value=Math.round((S?S.volume('sfx'):1)*100);i.disabled=!S||!on;});
  const canV=!!(D&&D.canVibrate());
  document.querySelectorAll('.vib-row').forEach(r=>r.hidden=!canV);
  document.querySelectorAll('.opt-vib').forEach(i=>i.checked=!!(D&&D.vibration()));
}
document.querySelectorAll('.opt-sfx').forEach(i=>i.onchange=()=>{if(window.NcqSound)NcqSound.enabled('sfx',i.checked);syncOpts();ensureAudio();uiTick();});
document.querySelectorAll('.opt-vol').forEach(i=>{i.oninput=()=>{if(window.NcqSound)NcqSound.volume('sfx',i.value/100);};i.onchange=()=>{ensureAudio();uiTick();};});
document.querySelectorAll('.opt-vib').forEach(i=>i.onchange=()=>{if(window.NcqDevice)NcqDevice.vibration(i.checked);syncOpts();vib('tap');});
$('goSettings').onclick=()=>{ensureAudio();syncOpts();$('settings').hidden=false;};
$('setClose').onclick=()=>{$('settings').hidden=true;};
$('setTut').onclick=()=>{$('settings').hidden=true;tutStart();};

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
pad.addEventListener('pointermove',e=>{if(!padDrag)return;const dx=e.clientX-padDrag.x,dy=e.clientY-padDrag.y,rad=(padZoom.clientWidth/2)||100;padDrag.x=e.clientX;padDrag.y=e.clientY;padDrag.m+=Math.abs(dx)+Math.abs(dy);if(tut&&tut.lock&&tut.step==='spin')return;let a=hit.a+dx/rad*SPIN_MAX,b=hit.b-dy/rad*SPIN_MAX;const l=Math.hypot(a,b);if(l>SPIN_MAX){a*=SPIN_MAX/l;b*=SPIN_MAX/l;}hit={a,b};
  if(tut&&tut.step==='spin'&&Math.hypot(a-tut.sol.a,b-tut.sol.b)<TUT_SNAP.spin*SPIN_MAX){hit={a:tut.sol.a,b:tut.sol.b};tutLockNow();}
  drawDot();});
const padEnd=()=>{if(!padDrag)return;padZoom.hidden=true;if(tut&&padDrag.m>=6)tutReady('spin');padDrag=null;};
pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);
$('spinRead').onclick=()=>{if(phase!=='aim'||!tutOK('spin'))return;hit={a:0,b:0};drawDot();};
pad.addEventListener('dblclick',()=>{if(phase!=='aim'||!tutOK('spin'))return;hit={a:0,b:0};drawDot();});
elevIn.addEventListener('input',()=>{
  if(tut&&!tutOK('elev')){elevIn.value=elev;return;}
  // 튜토리얼·힌트: 표시 가까이 오면 딱 붙고, 붙은 뒤에는 바를 더 끌어도 그대로예요
  if(tut&&tut.step==='elev'){if(tut.lock){elevIn.value=Math.round(elev);return;}if(Math.abs(+elevIn.value-tut.sol.elev)<=TUT_SNAP.elev){elev=tut.sol.elev;elevIn.value=Math.round(elev);elevVal.textContent=Math.round(elev)+'°';tutLockNow();return;}}
  let v=+elevIn.value;const c=LB[G.cueI];
  if(c&&v<elev){const rf=cueFloor(c,true,false),bf=cueFloor(c,false,true),lim=Math.min(elev,Math.min(75,Math.max(rf,bf)));if(v<lim){v=lim;elevIn.value=v;cueBlocked(rf>=bf?'rail':'ball');}}
  elev=v;elevVal.textContent=elev+'°';
});
let tutElev0=5;
elevIn.addEventListener('change',()=>tutReady('elev'));
// 휴대폰에서는 바를 놓아도 change가 안 올 때가 있어서(딱 붙일 때 값을 코드로 바꾸면) 손을 떼는 순간에도 확인해요
['pointerup','touchend','pointercancel'].forEach(t=>window.addEventListener(t,()=>{if(tut&&tut.step==='elev')setTimeout(()=>tut&&tut.step==='elev'&&tutReady('elev'),0);},true));
const pw=$('power');let pDrag=null;
pw.addEventListener('pointerdown',e=>{ensureAudio();if(phase!=='aim'||!tutOK('power'))return;pDrag={y:e.clientY};pw.setPointerCapture(e.pointerId);});
pw.addEventListener('pointermove',e=>{if(!pDrag)return;power=clamp((e.clientY-pDrag.y)/(pw.clientHeight*.85),0,1);
  if(tut&&tut.step==='power'){const t=tut.sol.pw/PMAX;if(tut.lock)power=t;else if(Math.abs(power-t)<TUT_SNAP.power){power=t;tutLockNow();}}
  updateUI();});
function release(){
  if(!pDrag)return;pDrag=null;
  if(power<.02){power=0;updateUI();return;}
  if(G.mode==='practice'){history.push({pos:LB.map(b=>({p:b.p.clone(),q:b.mesh.quaternion.clone(),off:b.off,pot:b.pot})),aimPhi});if(history.length>20)history.shift();}
  if(tut&&!tutPower())return;
  // 큐가 다른 공에 닿는지는 치는 순간의 조준·큐 각도로 다시 봐요 (튜토리얼·힌트가 방금 정답으로 맞춘 값까지)
  const cb=LB[G.cueI],rf=cueFloor(cb,true,false);if(elev<rf){elev=Math.min(rf,75);syncSpinUI();}
  const foul=elev<cueFloor(cb,false,true);setCueRisk(foul);
  pendingShot=buildShot(aimPhi,hit.a,hit.b,elev,power*PMAX,shotOpts());pendingShot.cueFoul=foul;
  if(!foul&&G.stage&&guideMatch(G.stage,{phi:aimPhi,a:hit.a,b:hit.b,elev,pw:power*PMAX}))pendingShot.guide=G.stage;
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
  $('menuQuit').textContent=T(G.mode==='online'?'forfeit':'quit');$('menuQuit').classList.remove('arm');
  $('menu').hidden=false;
};
$('menuClose').onclick=()=>{$('menu').hidden=true;};
$('menu').addEventListener('pointerdown',e=>{if(e.target===$('menu'))$('menu').hidden=true;});
$('menuQuit').onclick=()=>{
  const b=$('menuQuit');
  // 튜토리얼·힌트 중에 나가면 그 안내를 끝내요 (남아 있으면 다음 판의 조작이 막혀요)
  if(tut){if(tut.hint)hintEnd();else tutQuit();}
  if(G.mode==='online'&&!G.over){
    if(!b.classList.contains('arm')){b.classList.add('arm');b.textContent=T('forfeit_confirm');return;}
    $('menu').hidden=true;netForfeit();finishGame(1-G.myIdx,T('forfeited'));return;
  }
  if(G.mode==='stage'){const g=G.game;$('menu').hidden=true;G.mode='attract';toLobby();openStages(g);return;}
  $('menu').hidden=true;G.over=true;toLobby();
};
$('optGuide').onchange=e=>set.guide=e.target.value;

// 로비 동선: 왼쪽에서 종목(3구·4구·포켓볼)을 고르고(마지막으로 고른 종목은 저장해 기억) 오른쪽 Stage·Single·Online을 눌러요
const nav={mode:'single',game:'4b',step:null};
function showStep(id,title,sub){
  $('sheet').hidden=false;$('sheet').classList.remove('out');$('sheet').classList.toggle('full',id==='stepStages');$('lobby').classList.add('sheeted');['stepMode','stepStages'].forEach(s=>$(s).hidden=s!==id);nav.step=id;
  const h=$('sheetTitle');h.textContent=title;if(sub){const s=document.createElement('span');s.textContent=sub;h.appendChild(s);}
}
// 시트는 아래에서 올라오고(CSS), 닫을 때는 아래로 내려가며 사라져요
function closeSheet(){const sh=$('sheet');nav.step=null;if(sh.hidden)return;sh.classList.add('out');$('lobby').classList.remove('sheeted');setTimeout(()=>{sh.classList.remove('out');if(nav.step)return;sh.hidden=true;sh.classList.remove('full');},230);}
const starsOf=g=>STAGES[g].reduce((n,s)=>n+(save.stars[g+'-'+s.idx]||0),0);
// 고른 종목의 별·전적을 오른쪽 버튼에 보여 줘요
function lobbySubs(){
  const g=nav.game,got=starsOf(g),all=STAGES[g].length*3,r=save.rec[g]||{w:0,l:0};
  $('stageSub').textContent=got?T('stage_sub',{got,all}):T('stage_sub0');
  $('onlineSub').textContent=r.w+r.l?T('online_sub',{w:r.w,l:r.l}):T('online_sub0');
}
// 고른 종목 카드의 오른쪽에서 Stage·Single·Online 왼쪽으로 네온 선을 이어요 (어느 종목의 버튼인지 보이게)
function lobbyWire(anim){
  if(!anim&&lobbyWire.t)return; // 그리는 연출 중이면 연출이 끝날 때 다시 그려요
  const box=document.querySelector('.lpick'),svg=$('lpWire');if(!box||!svg)return;
  const card=document.querySelector('.gbtn[aria-checked=true]'),slabs=[...box.querySelectorAll('.slab')].filter(b=>!b.hidden);
  const gG=$('lpGlowG'),gC=$('lpCore'),gF=$('lpFlow'),gD=$('lpDots');[gG,gC,gF,gD].forEach(e=>e.textContent='');
  const o=box.getBoundingClientRect();if(!card||!o.width)return;
  const c=card.getBoundingClientRect(),x0=c.right-o.left,y0=c.top+c.height/2-o.top;
  const s0=slabs.length?slabs[0].getBoundingClientRect():null;if(!s0)return;
  const x1=s0.left-o.left,bx=(x0+x1)/2,r=6,NS='http://www.w3.org/2000/svg';
  const mk=(g,tag,at)=>{const e=document.createElementNS(NS,tag);for(const k in at)e.setAttribute(k,at[k]);g.appendChild(e);return e;};
  slabs.forEach(b=>{
    const q=b.getBoundingClientRect(),y=q.top+q.height/2-o.top,dy=y-y0,k=Math.min(r,Math.abs(dy)/2),sg=Math.sign(dy);
    const d=Math.abs(dy)<1?`M${x0} ${y0}H${x1}`:`M${x0} ${y0}H${bx-k}Q${bx} ${y0} ${bx} ${y0+sg*k}V${y-sg*k}Q${bx} ${y} ${bx+k} ${y}H${x1}`;
    [gG,gC,gF].forEach(g=>{const p=mk(g,'path',{d});if(anim&&g!==gF){const L=p.getTotalLength();p.style.setProperty('--len',L);p.style.strokeDasharray=L;}});
  });
  svg.classList.remove('draw');box.classList.remove('zap');
  if(anim){void svg.getBoundingClientRect();svg.classList.add('draw');box.classList.add('zap');clearTimeout(lobbyWire.t);lobbyWire.t=setTimeout(()=>{lobbyWire.t=0;svg.classList.remove('draw');box.classList.remove('zap');lobbyWire(false);},800);}
}
// 크기가 바뀌면 다시 그려요 (그리는 연출 중에는 연출이 끝난 뒤에 다시 그려요: 부제 글자가 바뀌어 크기가 달라져도 연출이 끊기지 않게)
if(window.ResizeObserver)new ResizeObserver(()=>lobbyWire(false)).observe(document.querySelector('.lpick'));
function pickGame(g,quiet){
  if(!GAME_INFO[g])g='4b';const was=nav.game;nav.game=g;
  document.querySelectorAll('[data-pick]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.pick===g)));
  if(save.lg!==g){save.lg=g;if(!quiet)persist();}
  lobbySubs();
  if(G.mode==='attract'&&attr.game!==g)attract(g);
  // 뒤 당구대를 바꾸느라 첫 그림이 늦을 수 있어서, 화면이 한 번 그려진 뒤에 선 그리는 연출을 시작해요
  if(quiet)lobbyWire(false);else{lobbyWire(false);requestAnimationFrame(()=>requestAnimationFrame(()=>lobbyWire(true)));}
}
document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{ensureAudio();pickGame(b.dataset.pick);});
document.querySelectorAll('[data-help]').forEach(b=>b.onclick=e=>{e.stopPropagation();openRules(b.dataset.help);});
function openModes(){nav.mode='single';$('aiRule').textContent=GAME_INFO[nav.game].rule;showStep('stepMode',GAME_INFO[nav.game].name,'Single');}
const LOCK_MINI='<svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true"><path d="M3.2 6.2V4.4a2.8 2.8 0 0 1 5.6 0v1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="1.2" y="6" width="9.6" height="7.4" rx="1.6" fill="currentColor"/></svg>';

// ---------- 스테이지 맵: 노드가 길처럼 이어져요 (1번이 아래). 드래그해서 끝까지 볼 수 있고, 다음에 할 판이 골라져 있어
// 아래 '시작하기'만 누르면 돼요. 다른 열린 판을 누르면 고르고(한 번 더 누르면 시작), 잠긴 판은 까닭을 알려 줘요
const MAP={g:null,sel:0,warnT:0,SP:86,PAD:64};
function mapPick(){
  const g=MAP.g,L=STAGES[g];let n=stageNext(g);
  if(n<0)n=L.findIndex((s,i)=>stStars(g,i)<3);
  return n<0?L.length-1:n;
}
function mapLayout(){
  const g=MAP.g,L=STAGES[g],box=$('stageMap'),inner=$('mapInner'),W=box.clientWidth||320,H=MAP.PAD*2+(L.length-1)*MAP.SP,A=Math.min(W*.27,110);
  inner.style.height=H+'px';
  const pts=L.map((s,i)=>({x:W/2+A*Math.sin(i*.82),y:H-MAP.PAD-i*MAP.SP}));
  // 지나온 길은 금색, 아직 못 간 길은 점선
  const reach=L.reduce((m,s,i)=>stageOpen(g,i)?i:m,0),curve=a=>{let d=`M${a[0].x.toFixed(1)} ${a[0].y.toFixed(1)}`;for(let i=1;i<a.length;i++){const p0=a[i-2]||a[i-1],p1=a[i-1],p2=a[i],p3=a[i+1]||p2;d+=`C${(p1.x+(p2.x-p0.x)/6).toFixed(1)} ${(p1.y+(p2.y-p0.y)/6).toFixed(1)} ${(p2.x-(p3.x-p1.x)/6).toFixed(1)} ${(p2.y-(p3.y-p1.y)/6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;}return d;};
  const svg=$('mapPath');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.innerHTML=`<path class="todo" d="${curve(pts.slice(reach))}"/>`+(reach>0?`<path class="done" d="${curve(pts.slice(0,reach+1))}"/>`:'');
  inner.querySelectorAll('.mnode').forEach((b,i)=>{b.style.left=pts[i].x+'px';b.style.top=pts[i].y+'px';});
  MAP.pts=pts;
}
function mapScrollTo(i,smooth){const box=$('stageMap'),p=MAP.pts&&MAP.pts[i];if(!p)return;const top=Math.max(0,p.y-box.clientHeight*.55);if(smooth&&box.scrollTo)box.scrollTo({top,behavior:'smooth'});else box.scrollTop=top;}
function mapSelect(i){
  const g=MAP.g,s=STAGES[g][i],got=stStars(g,i);MAP.sel=i;
  $('mapInner').querySelectorAll('.mnode').forEach((b,j)=>{b.classList.toggle('sel',j===i);b.setAttribute('aria-pressed',String(j===i));});
  $('miNo').textContent=T('stage_tag',{game:GAME_INFO[g].name,n:i+1});
  const st=$('miStars');st.hidden=!got;if(got)renderStars(st,got);
  $('miName').textContent=s.name;$('miDesc').textContent=s.desc;
  clearTimeout(MAP.warnT);$('miWarn').hidden=true;$('mapStart').disabled=false;
}
function mapLocked(i,b){
  b.classList.remove('nudge');void b.offsetWidth;b.classList.add('nudge');
  const w=$('miWarn'),g=MAP.g;w.innerHTML=LOCK_MINI+'<span></span>';
  w.lastChild.textContent=stageOpen(g,i-1)?T('st_lock_one',{i,n:UNLOCK_STARS}):T('st_lock_seq',{n:UNLOCK_STARS});
  w.hidden=false;clearTimeout(MAP.warnT);MAP.warnT=setTimeout(()=>{w.hidden=true;},2400);
}
let mapMoved=false;
function openStages(g){
  if(g!==nav.game)pickGame(g);
  nav.mode='stage';MAP.g=g;const info=GAME_INFO[g],inner=$('mapInner'),next=stageNext(g);
  inner.querySelectorAll('.mnode,.mpin').forEach(e=>e.remove());
  STAGES[g].forEach((s,i)=>{
    const got=stStars(g,i),open=stageOpen(g,i),b=document.createElement('button');
    b.className='mnode'+(!open?' lock':got?' done':'')+(i===next?' next':'');
    b.setAttribute('aria-label',open?T('st_go',{n:i+1,name:s.name}):T('st_locked',{n:i+1}));
    const no=document.createElement('b');no.textContent=i+1;b.appendChild(no);
    if(!open){const l=document.createElement('span');l.className='lk2';l.innerHTML=LOCK_MINI;b.appendChild(l);}
    else if(got){const st=document.createElement('span');st.className='stars';renderStars(st,got);b.appendChild(st);}
    if(i===next){const pin=document.createElement('span');pin.className='mpin';pin.setAttribute('aria-hidden','true');b.appendChild(pin);}
    b.onclick=()=>{if(mapMoved)return;if(!stageOpen(g,i)){mapLocked(i,b);return;}if(MAP.sel===i){startStage(s);return;}mapSelect(i);};
    inner.appendChild(b);
  });
  showStep('stepStages',info.name,T('stages_sub',{got:starsOf(g),all:STAGES[g].length*3}));
  mapLayout();const sel=mapPick();mapSelect(sel);mapScrollTo(sel);
  if(G.mode==='attract'&&attr.game!==g)attract(g);
}
$('mapStart').onclick=()=>{const g=MAP.g,s=STAGES[g]&&STAGES[g][MAP.sel];if(s&&stageOpen(g,MAP.sel))startStage(s);};
// 마우스로도 끌어서 맵을 올리고 내려요 (손가락은 그냥 스크롤)
{const box=$('stageMap');let d=null;
 box.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;d={y:e.clientY,top:box.scrollTop,m:0};});
 window.addEventListener('pointermove',e=>{if(!d)return;const dy=e.clientY-d.y;d.m=Math.max(d.m,Math.abs(dy));if(d.m>4)box.scrollTop=d.top-dy;});
 window.addEventListener('pointerup',()=>{if(!d)return;mapMoved=d.m>6;d=null;setTimeout(()=>{mapMoved=false;},0);});
 window.addEventListener('resize',()=>{if(!$('stepStages').hidden&&MAP.g){mapLayout();mapScrollTo(MAP.sel);}});}
$('goStage').onclick=()=>{ensureAudio();openStages(nav.game);};
$('goSingle').onclick=()=>{ensureAudio();openModes();};
$('goOnline').onclick=()=>{ensureAudio();startMatching(nav.game);};
document.querySelectorAll('[data-lv]').forEach(b=>b.onclick=()=>startGame({mode:'ai',game:nav.game,lv:b.dataset.lv}));
$('openPractice').onclick=()=>startGame({mode:'practice',game:nav.game});
$('openLocal').onclick=()=>startGame({mode:'local',game:nav.game});
$('sheetBack').onclick=closeSheet;
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
  syncMeshes(fdt);updateCue(fdt);updateGuide();updateCamera(fdt,false,now);tutDraw(now);
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
// 언어를 바꾸면 지금 보이는 화면을 다시 그려요 (HTML에 바로 쓴 글자는 data-i18n으로 바뀌어요)
function relang(){
  refreshLobby();
  if(!$('sheet').hidden){if(nav.step==='stepStages')openStages(nav.game);else if(nav.step==='stepMode')openModes();}
  if(!$('hud').hidden){updateHUD();drawDot();$('menuQuit').textContent=T(G.mode==='online'?'forfeit':'quit');$('menuQuit').classList.remove('arm');}
  if(tut&&tut.step&&TUT_TEXT[tut.step])$('tutMsg').textContent=T(tutKey(tut.step));
  if(!$('tutCard').hidden&&tutCardKey)$('tutText').textContent=T(tutCardKey);
  if(!$('profile').hidden)openProfile();
  if(!$('achs').hidden)openAchs();
  if(!$('ranks').hidden&&rankTab)openRanks(rankTab);
}
function boot(){
  langInit(relang);
  const v=window.NCQ&&window.NCQ.NCQ_VERSION;$('appVer').textContent=v?'v'+v:'dev';
  const fb=window.NcqFeedback,btn=$('feedBtn');btn.hidden=!(fb&&fb.can());btn.parentElement.classList.toggle('one',btn.hidden);btn.onclick=()=>fb.open();syncOpts();
  // Online·랭킹은 회사 게임 서버에 로그인할 수 있는 출시 빌드에서만 (개발 중·미리보기에는 가짜 상대를 두지 않아요)
  if(!onlineOn()){$('goOnline').hidden=true;$('rankOpen').hidden=true;$('goSingle').setAttribute('data-ncq-main','Single');}
  loadSave();nav.game=GAME_INFO[save.lg]?save.lg:'4b';refreshLobby();netRefresh();attract(nav.game);relayout();updateCamera(0,true,performance.now());drawDot();
  if((save.tut|0)<2)tutStart();
  requestAnimationFrame(loop);
}
// 공용 언어 모듈(ncq/lang.js)은 모듈 스크립트라 이 스크립트 다음에 들어와요. 들어온 뒤(DOMContentLoaded)에 첫 화면을 그려요
if(window.NcqLang||document.readyState!=='loading')boot();else document.addEventListener('DOMContentLoaded',boot,{once:true});
/*__TEST_HOOK__*/
})();
