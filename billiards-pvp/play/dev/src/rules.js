
// ---------- 종목 ----------
const GAME_INFO={
  '4b':{name:'4구',target:15,kind:'carom',rank:{label:'Rating',start:1000},rule:'빨간 공 둘을 맞히면 +1, 상대 공이나 공타는 −1. 15점 선취.'},
  '3c':{name:'3구',target:10,kind:'carom',rank:{label:'Rating',start:1000},rule:'쿠션 3번 이상 치고 나머지 두 공 맞히기. 10점 선취.'},
  pool:{name:'포켓볼',target:0,kind:'pool',rank:{label:'Rating',start:1000},rule:'내 그룹 7개를 넣고 8번 공으로 마무리.'}
};
const SHOT_MS=30000;

// ---------- 스테이지 (1큐) ----------
// 좌표는 [x, z]: x는 화면 위쪽, z는 화면 오른쪽. 흰 공(또는 수구)을 친다.
const STAGES={
  '4b':/*STAGES_4B*/[],
  '3c':/*STAGES_3C*/[],
  pool:/*STAGES_POOL*/[]
};
const SOL=/*SOL*/{}/*END_SOL*/;
Object.keys(STAGES).forEach(g=>STAGES[g].forEach((s,i)=>{s.game=g;s.idx=i;s.sol=SOL[g+'-'+i]||s.sol||null;}));

function checkGoal(goal,log,balls){
  if(log.cueFoul) return {ok:false,msg:'큐가 다른 공에 닿았어요'};
  const nm=i=>balls[i].name||'';
  switch(goal.t){
    case '3c':{
      const min=goal.min||3;
      if(log.hits.length<2) return {ok:false,msg:log.hits.length?`공 하나만 맞음 · 쿠션 ${log.cush}`:`아무 공도 못 맞힘 · 쿠션 ${log.cush}`};
      if(goal.bank&&log.cushAt[0]<1) return {ok:false,msg:'쿠션을 먼저 쳐야 해요'};
      if(log.cushAt[1]<min) return {ok:false,msg:`쿠션 ${log.cushAt[1]}개 — ${min}개 필요`};
      return {ok:true,msg:`쿠션 ${log.cushAt[1]}개 후 두 공 모두 맞힘`};
    }
    case '4b':{
      const f=foul4(log,1);
      if(log.hits.length===0) return {ok:false,msg:'아무 공도 못 맞힘'};
      if(f.foul) return {ok:false,msg:'노란 공을 먼저 맞혔어요'};
      if(f.reds<2) return {ok:false,msg:'빨간 공을 하나만 맞혔어요'};
      if(goal.cush&&log.cushAt[1]<goal.cush) return {ok:false,msg:`두 번째 빨간 공 전에 쿠션 ${goal.cush}개 필요`};
      if(goal.bank&&log.cushAt[0]<1) return {ok:false,msg:'쿠션을 먼저 쳐야 해요'};
      return {ok:true,msg:'빨간 공 둘 다 맞힘'};
    }
    case 'first':{
      if(goal.avoid&&goal.avoid.some(i=>log.hits.includes(i))) return {ok:false,msg:'건드리면 안 되는 공을 맞혔어요'};
      if(log.hits[0]!==goal.ball) return {ok:false,msg:log.hits.length?'다른 공을 먼저 맞혔어요':'아무 공도 못 맞힘'};
      return {ok:true,msg:`${nm(goal.ball)}을 맞혔어요`};
    }
    case 'pot':{
      const idx=n=>balls.findIndex(b=>b.num===n);
      const potted=log.potted;
      if(potted.includes(0)||log.offCue) return {ok:false,msg:'수구가 들어갔어요 (스크래치)'};
      if(goal.first!=null&&log.hits[0]!==idx(goal.first)) return {ok:false,msg:log.hits.length?`${goal.first}번 공을 먼저 맞혀야 해요`:'아무 공도 못 맞힘'};
      if(goal.kick&&!(log.cushAt[0]>=1)) return {ok:false,msg:'수구가 쿠션을 먼저 쳐야 해요'};
      const miss=goal.balls.filter(n=>!potted.includes(idx(n)));
      if(miss.length) return {ok:false,msg:`${miss.join('·')}번 공이 안 들어갔어요`};
      if(goal.bank&&!goal.balls.every(n=>log.objC[idx(n)]>=1)) return {ok:false,msg:'공이 쿠션을 먼저 맞고 들어가야 해요'};
      if(goal.only&&potted.some(i=>!goal.balls.includes(balls[i].num))) return {ok:false,msg:'다른 공까지 들어갔어요'};
      return {ok:true,msg:`${goal.balls.join('·')}번 공 넣기 성공`};
    }
  }
  return {ok:false,msg:''};
}

// ---------- 판정 ----------
function foul4(log,oppI){let reds=0,foul=false;for(const i of log.hits){if(i===oppI){if(reds<2)foul=true;break;}reds++;}return {reds,foul:foul||log.hits.length===0};}
function judgeCarom(log){
  if(log.cueFoul) return {delta:G.game==='4b'?-1:0,keep:false,over:-1,bad:true,toast:'파울',msg:'큐가 다른 공에 닿았어요'};
  const names=log.hits.map(i=>LB[i].name);
  if(G.game==='3c'){
    if(log.hits.length>=2&&log.cushAt[1]>=3) return {delta:1,keep:true,over:-1,msg:`쿠션 ${log.cushAt[1]}개 후 ${names[1]}까지 맞힘`,toast:'득점!'};
    const msg=log.hits.length>=2?`쿠션 ${log.cushAt[1]}개 — 두 번째 공 전에 3개 필요`:log.hits.length?`${names[0]}만 맞음 · 쿠션 ${log.cush}`:`아무 공도 못 맞힘 · 쿠션 ${log.cush}`;
    return {delta:0,keep:false,over:-1,msg};
  }
  const f=foul4(log,1-G.cueI);
  if(f.foul) return {delta:-1,keep:false,over:-1,bad:true,toast:'파울',msg:log.hits.length?'상대 공을 먼저 맞혔어요 · −1':'아무 공도 못 맞힘 (공타) · −1'};
  if(f.reds>=2) return {delta:1,keep:true,over:-1,toast:'득점!',msg:'빨간 공 둘 다 맞힘'};
  return {delta:0,keep:false,over:-1,msg:'빨간 공을 하나만 맞혔어요'};
}
function poolCore(log,bs,group,isBreak){
  const potted=log.potted.map(i=>bs[i]);
  const scratch=potted.some(b=>b.num===0)||log.offCue;
  const firstB=log.hits.length?bs[log.hits[0]]:null;
  const eightIn=potted.some(b=>b.num===8);
  const objPot=potted.filter(b=>b.num>0&&b.num!==8);
  let cleared=false;
  if(group) cleared=!bs.some(b=>b.num>0&&b.num!==8&&grp(b.num)===group&&(!b.pot||potted.includes(b)));
  let foul=scratch||!firstB||!!log.cueFoul;
  if(firstB&&!isBreak){
    if(group){if(cleared){if(firstB.num!==8)foul=true;}else if(firstB.num===8||grp(firstB.num)!==group)foul=true;}
    else if(firstB.num===8)foul=true;
  }
  let win=false,lose=false;
  if(eightIn&&!isBreak){if(cleared&&!foul)win=true;else lose=true;}
  const assign=(!group&&!isBreak&&!foul&&objPot.length)?grp(objPot[0].num):null;
  const g=group||assign;
  const own=objPot.filter(b=>g?grp(b.num)===g:true).length;
  return {scratch,foul,eightIn,win,lose,assign,own,objPot,firstB,cleared};
}
const GROUP_NAME={solid:'단색',stripe:'줄무늬'};
function judgePool(log){
  const me=G.turn,opp=1-me,P=G.players,c=poolCore(log,LB,P[me].group,G.isBreak);
  if(c.win) return {delta:0,keep:false,over:me,toast:'8볼 성공',msg:'8번 공까지 깔끔하게 마무리',why:'8번 공 마무리'};
  if(c.lose) return {delta:0,keep:false,over:opp,bad:true,toast:'8볼 실패',msg:c.foul?'8번 공을 넣으면서 파울':'내 공이 남았는데 8번 공이 들어갔어요',why:'8번 공 실수'};
  if(c.eightIn){const b=LB.find(x=>x.num===8);b.pot=false;b.off=false;b.sink=null;setFree(b,HL/2,0);}
  let msg=c.objPot.length?`${c.objPot.map(b=>b.num).join('·')}번 공 넣음`:'넣은 공 없음';
  if(c.assign){P[me].group=c.assign;P[opp].group=c.assign==='solid'?'stripe':'solid';msg+=` · ${GROUP_NAME[c.assign]} 배정`;}
  if(c.foul){
    const why=log.cueFoul?'큐가 다른 공에 닿았어요':c.scratch?'수구가 들어갔어요':!c.firstB?'아무 공도 못 맞혔어요':'내 공을 먼저 맞혀야 해요';
    return {delta:0,keep:false,bih:true,over:-1,bad:true,toast:'파울',msg:`${why} · 상대 프리볼`};
  }
  if(G.isBreak) return {delta:0,keep:c.objPot.length>0,over:-1,msg:c.objPot.length?msg:'브레이크 — 넣은 공 없음',toast:c.objPot.length?'나이스 브레이크':null};
  return {delta:0,keep:c.own>0,over:-1,msg,toast:c.own>0?'넣었다!':null};
}
function judge(log){
  if(G.mode==='stage') return checkGoal(G.stage.goal,log,LB);
  return G.game==='pool'?judgePool(log):judgeCarom(log);
}

// ---------- 배치 ----------
function placeCarom(list){LB.forEach((b,i)=>{const [x,z]=list[i];b.p.set(x,R,z);b.v.set(0,0,0);b.w.set(0,0,0);b.off=false;b.pot=false;b.sink=null;b.mesh.visible=true;b.spot=b.p.clone();});}
function rack(rng){
  const nums=[1,2,3,4,5,6,7,9,10,11,12,13,14,15];
  for(let i=nums.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[nums[i],nums[j]]=[nums[j],nums[i]];}
  const cS=nums.splice(nums.findIndex(n=>n<8),1)[0],cT=nums.splice(nums.findIndex(n=>n>8),1)[0];
  const d=2*R+0.0005,dx=d*Math.sqrt(3)/2,ax=HL/2;
  LB.forEach(b=>{b.off=false;b.pot=false;b.sink=null;b.mesh.visible=true;b.v.set(0,0,0);b.w.set(0,0,0);faceUp(b);});
  LB[0].p.set(-HL/2,R,0);
  for(let r=0;r<5;r++)for(let j=0;j<=r;j++){
    let n;if(r===2&&j===1)n=8;else if(r===4&&j===0)n=cS;else if(r===4&&j===4)n=cT;else n=nums.shift();
    LB[n].p.set(ax+r*dx,R,(j-r/2)*d);
  }
}
function setFree(b,x,z){let k=0;b.p.set(x,R,z);while(LB.some(o=>o!==b&&!o.off&&o.p.distanceTo(b.p)<2.2*R)&&k<40){k++;b.p.x=x+((k%2)?1:-1)*Math.ceil(k/2)*0.07;}b.v.set(0,0,0);b.w.set(0,0,0);b.mesh.visible=true;}
function respot(){
  LB.forEach(b=>{
    if(G.game==='pool'){
      if(b.num===0&&b.off){b.off=false;b.pot=false;b.sink=null;setFree(b,-HL/2,0);}
      else if(b.off&&!b.pot){b.off=false;setFree(b,HL/2,0);}
    }else if(b.off){b.off=false;setFree(b,b.spot.x,b.spot.z);}
  });
}
function layoutStart(rng){
  if(G.game==='3c') placeCarom([[-0.71,0.1825],[-0.71,0],[0.71,0]]);
  else if(G.game==='4b') placeCarom([[-1.0,0.12],[1.0,-0.12],[-0.71,0],[0.71,0]]);
  else rack(rng||Math.random);
}
function layoutStage(s){
  if(s.game==='pool'){
    LB.forEach(b=>{b.off=true;b.pot=true;b.sink=null;b.mesh.visible=false;b.v.set(0,0,0);b.w.set(0,0,0);});
    const q=LB[0];q.off=false;q.pot=false;q.p.set(s.cue[0],R,s.cue[1]);q.mesh.visible=true;
    Object.keys(s.balls).forEach(n=>{const b=LB[+n],[x,z]=s.balls[n];b.off=false;b.pot=false;b.p.set(x,R,z);b.mesh.visible=true;faceUp(b);});
  }else placeCarom(s.pos);
}
