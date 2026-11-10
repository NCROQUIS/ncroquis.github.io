
// ---------- AI: 실제 물리로 후보 샷을 돌려 보고 고른다 ----------
const AI_LV={
  easy:{name:'초급',n:110,keep:3,noise:.013,pwN:.07,spin:.22,poolN:6,tries:2},
  mid:{name:'중급',n:240,keep:5,noise:.005,pwN:.035,spin:.4,poolN:12,tries:3},
  hard:{name:'고급',n:480,keep:8,noise:.0015,pwN:.012,spin:.52,poolN:22,tries:6}
};
const AI_OPTS={squirt:true,miscue:true,tremor:false};
const AI_DT=1/500,AI_BUDGET=9,AI_MIN_MS=700,AI_MAX_MS=3200;
const ai={gen:null,stop:false,t0:0,plan:null,anim:null};
const perturb=(p,lv)=>Object.assign({},p,{phi:p.phi+gauss()*lv.noise,pw:clamp(p.pw*(1+gauss()*lv.pwN),.05,PMAX)});

function aiRateCarom(p,cI,is4,oppI,dt){
  const s=buildShot(p.phi,p.a,p.b,p.elev,p.pw,AI_OPTS),log=runSim(cI,s.v,s.w,dt,9).log;
  if(is4){const f=foul4(log,oppI);return {ok:!f.foul&&f.reds>=2,s:f.foul?-5:f.reds};}
  return {ok:log.hits.length>=2&&log.cushAt[1]>=3,s:log.hits.length*2+(log.hits.length>=2?log.cushAt[1]:0)};
}
function* aiCarom(lv){
  const cI=G.cueI,c=LB[cI],is4=G.game==='4b',oppI=1-cI,others=LB.filter(b=>b!==c&&!b.off);
  const targets=is4?others.filter(b=>b.i>=2):others,good=[];let fb=null,fbS=-1e9;
  for(let k=0;k<lv.n&&!ai.stop;k++){
    const t=targets[Math.random()*targets.length|0],dx=t.p.x-c.p.x,dz=t.p.z-c.p.z,d=Math.hypot(dx,dz),mx=Math.asin(Math.min(1,D2/d))*.94;
    let phi=Math.atan2(dz,dx)+rnd(-mx,mx);if(!is4&&Math.random()<.08)phi=rnd(0,TAU);
    const p={phi,a:rnd(-lv.spin,lv.spin),b:rnd(-lv.spin*.7,lv.spin*.7),elev:5,pw:is4?rnd(.12,.5):rnd(.3,PMAX)};
    const hl=Math.hypot(p.a,p.b);if(hl>.52){p.a*=.52/hl;p.b*=.52/hl;}
    const q=aiRateCarom(p,cI,is4,oppI,AI_DT);
    if(q.ok){good.push(p);if(good.length>=lv.keep)break;}else if(q.s>fbS){fbS=q.s;fb=p;}
    if(k%3===2)yield;
  }
  let best=null,bestS=-1;
  for(const p of good){
    if(ai.stop&&best)break;
    if(!aiRateCarom(p,cI,is4,oppI,DT).ok)continue;
    let s=0;for(let t=0;t<lv.tries;t++)if(aiRateCarom(perturb(p,lv),cI,is4,oppI,AI_DT).ok)s++;
    if(s>bestS){bestS=s;best=p;}
    yield;
  }
  if(best)return best;
  if(fb)return fb;
  const t=targets[0]||others[0];return {phi:Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x),a:0,b:0,elev:5,pw:.35};
}

function legalTargets(me){
  const g=G.players[me].group,balls=LB.filter(b=>b.num>0&&!b.pot);
  if(!g)return balls.filter(b=>b.num!==8);
  const mine=balls.filter(b=>b.num!==8&&grp(b.num)===g);
  return mine.length?mine:balls.filter(b=>b.num===8);
}
function pocketAims(){const c=.03;return [[HL-c,HW-c],[-HL+c,HW-c],[HL-c,-HW+c],[-HL+c,-HW+c],[0,HW-.005],[0,-HW+.005]];}
function potLines(me){
  const c=LB[0],out=[];
  for(const t of legalTargets(me))for(const [px,pz] of pocketAims()){
    const dx=px-t.p.x,dz=pz-t.p.z,d=Math.hypot(dx,dz),ux=dx/d,uz=dz/d,gx=t.p.x-ux*D2,gz=t.p.z-uz*D2,ax=gx-c.p.x,az=gz-c.p.z,dc=Math.hypot(ax,az);
    if(dc<.001)continue;
    const cos=(ax*ux+az*uz)/dc;if(cos<.3)continue;
    out.push({phi:Math.atan2(az,ax),t,cos,d,dc,cost:(1-cos)*2.2+d*.45+dc*.3});
  }
  return out.sort((a,b)=>a.cost-b.cost);
}
function aiRatePool(p,me,dt){
  const s=buildShot(p.phi,p.a,p.b,p.elev,p.pw,AI_OPTS),r=runSim(0,s.v,s.w,dt,9),c=poolCore(r.log,r.balls,G.players[me].group,G.isBreak);
  if(c.lose||(c.eightIn&&!c.win))return {ok:false,s:-100};
  if(c.foul)return {ok:false,s:-20};
  if(c.win)return {ok:true,s:1000};
  let v=c.own*60;
  const g=G.players[me].group||c.assign,cue=r.balls[0];let near=9;
  for(const b of r.balls)if(b.num>0&&b.num!==8&&!b.pot&&(!g||grp(b.num)===g))near=Math.min(near,Math.hypot(b.p.x-cue.p.x,b.p.z-cue.p.z));
  v+=10/(.4+near);
  return {ok:c.own>0,s:v};
}
function* aiPool(lv,me){
  const c=LB[0];
  if(G.isBreak){const apex=LB.reduce((a,b)=>b.num>0&&b.p.x<a.p.x?b:a,LB[1]);return {phi:Math.atan2(apex.p.z-c.p.z+rnd(-.006,.006),apex.p.x-c.p.x),a:0,b:.08,elev:3,pw:PMAX};}
  const lines=potLines(me).slice(0,lv.poolN);let best=null,bestS=-1e9,fb=null,fbS=-1e9,n=0;
  for(const l of lines){
    const base=clamp(.14+(l.d/(Math.max(.25,l.cos))+l.dc)*.17,.12,.8);
    for(const [a,b,k] of [[0,0,1],[0,-.25,1],[0,.25,1],[0,0,1.25],[lv.spin*.5,0,1]]){
      if(ai.stop&&best)break;
      const p={phi:l.phi,a,b,elev:4,pw:clamp(base*k,.08,PMAX)},q=aiRatePool(p,me,AI_DT);
      if(q.ok&&q.s>bestS){bestS=q.s;best=p;}else if(!q.ok&&q.s>fbS){fbS=q.s;fb=p;}
      if(++n%2===0)yield;
    }
  }
  if(best&&aiRatePool(best,me,DT).ok)return best;
  const targets=legalTargets(me);
  for(let k=0;k<30&&!ai.stop;k++){
    const t=targets[Math.random()*targets.length|0],p={phi:Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x)+rnd(-.05,.05),a:0,b:0,elev:4,pw:rnd(.15,.5)},q=aiRatePool(p,me,AI_DT);
    if(q.s>fbS){fbS=q.s;fb=p;}
    if(k%2===1)yield;
  }
  if(fb)return fb;
  const t=targets[0]||LB[1];return {phi:Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x),a:0,b:0,elev:4,pw:.3};
}
function aiPlaceCue(me){
  const c=LB[0];let best=null,bs=1e9;
  for(const t of legalTargets(me))for(const [px,pz] of pocketAims()){
    const dx=px-t.p.x,dz=pz-t.p.z,d=Math.hypot(dx,dz),ux=dx/d,uz=dz/d;
    for(const back of [.28,.42,.6]){
      const x=clamp(t.p.x-ux*(D2+back),-LIM_X+.02,LIM_X-.02),z=clamp(t.p.z-uz*(D2+back),-LIM_Z+.02,LIM_Z-.02);
      if(LB.some(o=>o!==c&&!o.off&&Math.hypot(o.p.x-x,o.p.z-z)<2.6*R))continue;
      const cost=d+back*.3;if(cost<bs){bs=cost;best=[x,z];}
    }
  }
  if(best){c.p.set(best[0],R,best[1]);}
}
function startAI(){
  const pl=G.players[G.turn],lv=pl.lv;
  ai.stop=false;ai.t0=performance.now();ai.plan=null;
  // 매칭 상대(봇)는 사람처럼 5~15초 동안 조준을 이리저리 만지다가 쳐요
  ai.dur=pl.bot?rnd(5000,15000):0;ai.fid=null;ai.last=ai.t0;
  if(G.game==='pool'){if(G.bih)aiPlaceCue(G.turn);ai.gen=aiPool(lv,G.turn);}else ai.gen=aiCarom(lv);
}
function aiTick(){
  const now=performance.now();
  if(ai.gen){
    if(now-ai.t0>AI_MAX_MS)ai.stop=true;
    while(performance.now()-now<AI_BUDGET){const r=ai.gen.next();if(r.done){ai.plan=r.value;ai.gen=null;break;}}
  }
  if(ai.dur){aiFidget(now);if(now-ai.t0<ai.dur-900)return;}
  if(!ai.gen&&ai.plan&&now-ai.t0>AI_MIN_MS){
    const lv=G.players[G.turn].lv,p=G.isBreak?ai.plan:perturb(ai.plan,lv);
    ai.plan=p;hit={a:p.a,b:p.b};elev=p.elev;syncSpinUI();
    let to=p.phi;while(to-aimPhi>Math.PI)to-=TAU;while(to-aimPhi<-Math.PI)to+=TAU;
    ai.anim={from:aimPhi,to,t:0};phase='ai-aim';updateUI();
  }
}
function aiFidget(now){
  const dt=Math.min(.05,(now-ai.last)/1000);ai.last=now;let f=ai.fid;
  if(!f||now>f.until){
    const c=LB[G.cueI],os=LB.filter(b=>b!==c&&!b.off),t=os[Math.random()*os.length|0];
    f=ai.fid={until:now+rnd(900,2600),phi:t?Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x)+rnd(-.18,.18):aimPhi,
      a:Math.random()<.4?rnd(-.3,.3):hit.a,b:Math.random()<.4?rnd(-.3,.3):hit.b,e:Math.random()<.2?Math.round(rnd(5,22)):elev,rest:Math.random()<.35};
  }
  if(f.rest)return;
  let to=f.phi;while(to-aimPhi>Math.PI)to-=TAU;while(to-aimPhi<-Math.PI)to+=TAU;
  const k=1-Math.exp(-dt*3.2);aimPhi+=(to-aimPhi)*k;hit={a:hit.a+(f.a-hit.a)*k,b:hit.b+(f.b-hit.b)*k};elev=Math.round(elev+(f.e-elev)*k);syncSpinUI();
}
function aiAimTick(dt){
  const a=ai.anim;a.t+=dt/.75;const k=Math.min(1,a.t),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  aimPhi=a.from+(a.to-a.from)*Math.min(1,e*1.35);power=ai.plan.pw*Math.max(0,(k-.55)/.45);updateUI();
  if(k>=1){const p=ai.plan;aimPhi=p.phi;p.elev=Math.min(75,Math.max(p.elev,cueFloor(LB[G.cueI],true,true)));elev=p.elev;pendingShot=buildShot(p.phi,p.a,p.b,p.elev,p.pw,AI_OPTS);phase='strike';strikeT=0;updateUI();}
}
