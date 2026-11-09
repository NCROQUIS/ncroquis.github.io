window.__t={cueFloor,cueClear,get elev(){return elev},set elev(v){elev=v},get risk(){return cueRisk},setPhi(v){aimPhi=v},get G(){return G},get phase(){return phase},get LB(){return LB},get aim(){return aimPhi},set aim(v){aimPhi=v},get power(){return power},set power(v){power=v},get free(){return free},STAGES,AI_LV,GAME_INFO,runSim,buildShot,checkGoal,startGame,startStage,judge,poolCore,finishGame,camFit:()=>fit,
 setHit:(a,b)=>{hit={a,b};},setElev:e=>{elev=e;},
 shoot:(p)=>{aimPhi=p.phi;hit={a:p.a||0,b:p.b||0};elev=p.elev==null?5:p.elev;power=p.pw;pendingShot=buildShot(p.phi,hit.a,hit.b,elev,p.pw,shotOpts());phase='strike';strikeT=0;updateUI();},
 goalCheck:(st,p,dt)=>{const s=buildShot(p.phi,p.a,p.b,p.elev,p.pw,{squirt:true,miscue:true,tremor:false});const r=runSim(0,s.v,s.w,dt||DT,12);return checkGoal(st.goal,r.log,r.balls.map((b,i)=>Object.assign({name:LB[i].name},b)));},
 DT,R:()=>R,HL:()=>HL,HW:()=>HW,clamp,net:()=>G.net,MT:()=>MT,save:()=>save,
 stageCheckAll:()=>{const out=[];for(const g of Object.keys(STAGES))for(const st of STAGES[g]){startGame({mode:'stage',game:g,stage:st});out.push([g,st.idx,st.sol?__t.goalCheck(st,st.sol,DT).ok:null]);}return out;},
 aiTest:(game,lvKey,trials)=>{
   startGame({mode:'ai',game,lv:lvKey});const lv=AI_LV[lvKey];phase='over';G.turn=1;G.cueI=game==='pool'?0:1;G.isBreak=false;
   let ok=0,time=0,maxT=0,planOk=0;
   for(let k=0;k<trials;k++){
     if(game==='pool'){LB.forEach((b,i)=>{b.off=b.pot=i>10&&i!==15?true:false;b.v.set(0,0,0);b.w.set(0,0,0);let t=0;do{b.p.set(rnd(-HL+.1,HL-.1),R,rnd(-HW+.1,HW-.1));t++;}while(t<50&&LB.some((o,j)=>j<i&&!o.off&&o.p.distanceTo(b.p)<3*R));});G.players[1].group='solid';}
     else LB.forEach((b,i)=>{let t=0;do{b.p.set(rnd(-HL+.12,HL-.12),R,rnd(-HW+.12,HW-.12));t++;}while(t<50&&LB.some((o,j)=>j<i&&o.p.distanceTo(b.p)<.14));});
     const t0=performance.now();ai.stop=false;ai.t0=t0;const gen=game==='pool'?aiPool(lv,1):aiCarom(lv);let r;do{r=gen.next();}while(!r.done);const dt=performance.now()-t0;time+=dt;maxT=Math.max(maxT,dt);
     const rate=p=>game==='pool'?aiRatePool(p,1,DT).ok:aiRateCarom(p,G.cueI,game==='4b',1-G.cueI,DT).ok;
     if(rate(r.value))planOk++;if(rate(perturb(r.value,lv)))ok++;
   }
   return {game,lvKey,trials,planPct:Math.round(planOk/trials*100),scorePct:Math.round(ok/trials*100),avgMs:Math.round(time/trials),maxMs:Math.round(maxT)};
 },
 ai,set
};
