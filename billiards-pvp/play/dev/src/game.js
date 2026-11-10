
// ---------- 기록 (이 브라우저에만 저장) ----------
const SAVE_KEY='billiards.v1';
let save={nick:'',stars:{},rec:{}};
function loadSave(){
  try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(s&&typeof s==='object')save=Object.assign(save,s);}catch(e){}
  if(!save.nick)save.nick='플레이어 '+Math.random().toString(16).slice(2,5).toUpperCase();
  if(!save.st2){const o=save.stars||{},n={};Object.keys(o).forEach(k=>{const m=/^4b-(\d+)$/.exec(k);if(!m){n[k]=o[k];return;}const i=+m[1];if(i!==4)n['4b-'+(i<4?i+3:i+2)]=o[k];});save.stars=n;save.st2=1;}
  if(!save.elo){Object.values(save.rec).forEach(r=>{r.rk=1000;});save.elo=1;}
  Object.keys(GAME_INFO).forEach(g=>{if(!save.rec[g])save.rec[g]={rk:GAME_INFO[g].rank.start,w:0,l:0};});
}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch(e){}}

// ---------- 게임 진행 ----------
function startGame(cfg){
  if(!cfg.tut&&typeof hintEnd==='function')hintEnd();
  const info=GAME_INFO[cfg.game];
  setSpec(info.kind);showTable(info.kind);aimPlane.constant=-R;
  G={mode:cfg.mode,game:cfg.game,info,cfg,players:[],turn:0,inning:1,target:info.target,cueI:0,over:false,bih:false,isBreak:cfg.game==='pool'&&cfg.mode!=='stage'&&cfg.mode!=='practice',tries:1,usedHint:false,stage:cfg.stage||null,net:cfg.net||null,myIdx:0,next:null,pauseT:0,clockEnd:0,remoteShot:false,lastTurn:-1};
  const me={name:'나',kind:'human',score:0,group:null};
  if(cfg.mode==='ai'){const lv=AI_LV[cfg.lv];G.players=[me,{name:'AI '+lv.name,kind:'ai',lv,score:0,group:null}];}
  else if(cfg.mode==='online'){
    const opp=cfg.net?{name:cfg.net.oppNick,kind:'remote',score:0,group:null}:{name:cfg.botName,kind:'ai',lv:AI_LV[cfg.botLv],score:0,group:null,bot:true};
    const first=cfg.net?cfg.net.amFirst:Math.random()<.5;
    G.players=first?[me,opp]:[opp,me];G.myIdx=first?0:1;
  }else if(cfg.mode==='local'){G.players=[{name:'플레이어 1',kind:'human',score:0,group:null},{name:'플레이어 2',kind:'human',score:0,group:null}];}
  else G.players=[me];
  useBalls(info.kind==='pool'?POOL_BALLS:cfg.game==='4b'?[CAROM.w,CAROM.y,CAROM.r,CAROM.r2]:[CAROM.w,CAROM.y,CAROM.r]);
  history=[];hit={a:0,b:0};elev=5;power=0;
  if(cfg.mode==='stage')layoutStage(cfg.stage);else layoutStart(cfg.net?mulberry(cfg.net.seed):null);
  G.lvKey=cfg.mode==='practice'?null:cfg.mode==='stage'?`${cfg.game}-stage-${cfg.stage.idx+1}`:`${cfg.game}-${cfg.mode}`;
  if(G.lvKey&&window.NcqMetrics)NcqMetrics.levelStart(G.lvKey);
  enterGameUI();
  if(G.net)netSetup(G.net);
  beginTurn();
}
function aimDefault(){
  const c=LB[G.cueI];if(!c)return;let cand;
  if(G.game==='pool')cand=(G.mode==='stage'||G.mode==='practice')?LB.filter(b=>b.num>0&&!b.off):legalTargets(G.turn);
  else if(G.game==='4b')cand=LB.filter(b=>b.i>=2&&!b.off);
  else if(G.mode==='stage')cand=LB.filter(b=>b!==c&&!b.off);
  else cand=[LB[2]];
  let t=cand[0],m=1e9;for(const b of cand){const d=b.p.distanceTo(c.p);if(d<m){m=d;t=b;}}
  if(t)aimPhi=Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x);
}
function beginTurn(){
  const solo=G.mode==='stage'||G.mode==='practice';
  G.cueI=(G.game==='pool'||solo)?0:G.turn;
  const p=G.players[G.turn];
  hit={a:0,b:0};power=0;pull=.08;elev=5;syncSpinUI();aimDefault();
  G.clockEnd=(G.mode==='online'||G.mode==='ai')?Date.now()+SHOT_MS:0;
  $('clockFill').style.transformOrigin=G.turn===G.myIdx?'left center':'right center';
  if(p.kind==='human')phase=G.bih?'place':'aim';
  else if(p.kind==='ai'){phase='ai-think';startAI();}
  else{phase='wait';G.net.turnAt=Date.now();}
  if(!solo&&G.lastTurn!==G.turn){G.lastTurn=G.turn;banner(G.mode==='local'?`${p.name} 차례${G.bih?' · 프리볼':''}`:G.turn===G.myIdx?(G.bih?'내 차례 · 프리볼':'내 차례'):'상대 차례');}
  updateHUD();updateUI();
  if(phase==='wait')netFlush();
}
function endShot(){
  LB.forEach(b=>{b.v.set(0,0,0);b.w.set(0,0,0);if(!b.off)b.p.y=R;});
  if(G.remoteShot){G.remoteShot=false;remoteShotDone();return;}
  if(G.mode==='practice'){respot();phase='aim';power=0;updateUI();return;}
  const r=judge(liveLog);
  if(G.mode==='stage'){concludeStage(r);return;}
  conclude(r);
}
function conclude(r){
  const me=G.turn,P=G.players;
  if(r.delta)P[me].score=Math.max(0,P[me].score+r.delta);
  if(G.game!=='pool'&&P[me].score>=G.target)r.over=me;
  respot();
  G.bih=!!r.bih;G.isBreak=false;
  if(r.over<0&&!r.keep){const nx=1-me;if(nx===0)G.inning++;G.turn=nx;}
  if(G.mode==='online'&&G.net)netSendEnd(r);
  showOutcome(r);
}
function showOutcome(r){
  if(r.toast){toast(r.toast,r.bad);if(!r.bad)sfx('score',1);}
  updateHUD();
  phase='pause';G.pauseT=r.over>=0?1.2:r.keep?.75:1.05;
  G.next=()=>{if(r.over>=0)finishGame(r.over,r.why||r.msg);else beginTurn();};
  updateUI();
}
// 시간 초과: 이름 옆에 깨진 시계가 붙고, 2번이면 바로 패배
function timeoutTurn(){
  G.clockEnd=0;const me=G.turn,p=G.players[me];p.to=(p.to|0)+1;updateHUD();
  if(p.to>=2){conclude({delta:0,keep:false,over:1-me,bad:true,toast:'시간 초과 패배',msg:'시간 초과 2회',why:'시간 초과 2회'});return;}
  conclude({delta:0,keep:false,bih:G.game==='pool',over:-1,bad:true,toast:'시간 초과',msg:'시간 초과 — 한 번 더 넘기면 패배'});
}
function finishGame(w,why,opts){
  if(G.over)return;G.over=true;phase='over';G.clockEnd=0;G.next=null;
  const me=G.myIdx,voided=w<0,win=w===me,info=G.info;
  if(G.lvKey&&window.NcqMetrics)NcqMetrics.levelEnd(G.lvKey,win,{score:G.players[me].score});
  let rk=null;
  if(G.mode==='online'&&!voided&&!(G.net&&G.net.friendly)){const st=info.rank,rec=save.rec[G.game],before=rec.rk,opR=clamp(+(G.net?G.net.oppRk:G.cfg.botRk)||before,0,5000),exp=1/(1+Math.pow(10,(opR-before)/400));let d=Math.round(32*((win?1:0)-exp));if(!d)d=win?1:-1;if(win)rec.w++;else rec.l++;rec.rk=Math.max(0,before+d);persist();rankPush();rk={label:st.label,before,after:rec.rk,w:rec.w,l:rec.l};}
  const P=G.players,tag=G.mode==='online'?`${info.name} · ${G.net&&G.net.friendly?'친선전':'Online'}`:G.mode==='local'?`${info.name} · 2인 대전`:`${info.name} · ${P[1].name}`;
  const score=(G.game!=='pool'&&!voided)?`${P[me].score} : ${P[1-me].score}`:null;
  showResult({ad:!voided,tag,main:voided?'무효':G.mode==='local'?`${P[w].name} 승리`:win?'승리':'패배',cls:voided?'':G.mode==='local'?'win sm':win?'win':'lose',why:why||'',score,rk,
    primary:G.net&&G.net.friendly?['방 메뉴로',()=>{toLobby();openRoom();}]:G.mode==='online'?['다시 매칭',()=>startMatching(G.game)]:['다시 하기',()=>startGame(G.cfg)]});
  sfx(win?'win':'lose',1);
  netClose();
}
let stageClears=0;
function startStage(s){startGame({mode:'stage',game:s.game,stage:s});}
function retryStage(){layoutStage(G.stage);G.tries++;power=0;phase='aim';$('powerMark').hidden=!G.usedHint;updateHUD();updateUI();}
function concludeStage(r){
  if(r.ok){
    const stars=G.tries===1?3:G.tries<=3?2:1,k=G.stage.game+'-'+G.stage.idx;
    if((save.stars[k]||0)<stars){save.stars[k]=stars;persist();}
    toast('CLEAR');sfx('score',1);phase='pause';G.pauseT=1;G.next=()=>stageClear(stars);
  }else{toast('실패',true);phase='pause';G.pauseT=1.1;G.next=tut?()=>{retryStage();tutGo(tut.steps[0]);}:retryStage;}
  updateUI();
}
function stageClear(stars){
  G.over=true;phase='over';stageClears++;
  if(G.lvKey&&window.NcqMetrics)NcqMetrics.levelEnd(G.lvKey,true,{score:stars});
  const s=G.stage,list=STAGES[s.game],next=list[s.idx+1];
  if(tut&&tut.hint){tutGo(null);tut=null;}
  if(tut){showResult({ad:false,tag:`${G.info.name} · 스테이지 ${s.idx+1} · ${s.name}`,main:'CLEAR',cls:'win',why:'',stars,primary:['다음',tutStageDone]});return;}
  showResult({ad:stageClears%AD.STAGE_EVERY===0,tag:`${G.info.name} · 스테이지 ${s.idx+1} · ${s.name}`,main:'CLEAR',cls:'win',why:'',stars,
    primary:next?['다음 스테이지',()=>startStage(next)]:['스테이지 목록',()=>{toLobby();openStages(s.game);}],
    second:['다시 하기',()=>startStage(s)]});
}

// ---------- 대기 화면 ----------
const attr={t:1,busy:false,kind:'carom',shots:0};
function attract(kind){
  setSpec(kind);showTable(kind);aimPlane.constant=-R;
  G={mode:'attract',game:kind==='pool'?'pool':'3c',players:[],turn:0,cueI:0,over:false};
  useBalls(kind==='pool'?POOL_BALLS:[CAROM.w,CAROM.y,CAROM.r]);
  if(kind==='pool')rack(Math.random);else placeCarom([[-0.71,0.1825],[-0.71,0],[0.71,0]]);
  liveLog=newLog(0,LB.length);phase='attract';attr.t=1.1;attr.busy=false;attr.kind=kind;attr.shots=0;cue.visible=false;
}
function attractTick(dt){
  if(attr.busy){
    stepLive(dt);shotT+=dt;stillT=anyMoving(LB)?0:stillT+dt;
    if(stillT>.4||shotT>14){
      LB.forEach(b=>{b.v.set(0,0,0);b.w.set(0,0,0);if(!b.off)b.p.y=R;
        if(attr.kind==='carom'&&b.off){b.off=false;setFree(b,b.spot.x,b.spot.z);}
        if(attr.kind==='pool'&&b.num===0&&b.off){b.off=false;b.pot=false;b.sink=null;setFree(b,-HL/2,0);}
        if(attr.kind==='pool'&&b.off&&!b.pot){b.off=true;b.pot=true;}});
      attr.busy=false;attr.t=rnd(1.3,3);
    }
    return;
  }
  attr.t-=dt;if(attr.t>0)return;
  const c=LB[0],others=LB.filter(b=>b!==c&&!b.off);
  if(attr.kind==='pool'&&(others.length<6||!others.some(b=>b.num===8))){rack(Math.random);attr.t=1.2;attr.shots=0;return;}
  let phi,pw;
  if(attr.kind==='pool'&&attr.shots===0){phi=Math.atan2(rnd(-.006,.006),1);pw=.95;}
  else{const t=others[Math.random()*others.length|0];phi=Math.atan2(t.p.z-c.p.z,t.p.x-c.p.x)+rnd(-.06,.06);pw=rnd(.25,.62);}
  const s=buildShot(phi,rnd(-.3,.3),rnd(-.3,.3),5,pw,{squirt:true});
  liveLog=newLog(0,LB.length);c.v.copy(s.v);c.w.copy(s.w);attr.busy=true;attr.shots++;shotT=0;stillT=0;
}
