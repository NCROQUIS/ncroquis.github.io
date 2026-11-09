
// ---------- 온라인: 같은 페이지를 연 사람끼리 presence로 매칭·중계 ----------
const NET_V=1,GONE_MS=10000,STALL_MS=SHOT_MS+25000;
let roomP=null;
function getRoom(){
  if(!roomP)roomP=(async()=>{try{if(!(window.claude&&window.claude.use))return null;return await window.claude.use('room');}catch(e){return null;}})();
  return roomP;
}
async function roomReady(){
  const room=await getRoom();if(!room)return null;
  try{
    const perms=await window.claude.use('permissions');
    if(perms){
      const st=await perms.state(),need=['room','db'].filter(n=>st[n]==='prompt');
      if(need.length){if(MT)$('mNote').textContent='연결 허용 창을 확인해 주세요.';Object.assign(st,await perms.request(need));}
      if(st.db==='granted')rankListen();
      if(st.room==='denied')return null;
    }
  }catch(e){}
  return room;
}
let MT=null;
const fmtClock=s=>'00:'+String(Math.min(99,s)).padStart(2,'0');
function startMatching(game){
  exitGameUI();
  const info=GAME_INFO[game],rec=save.rec[game];
  if(tableKind!==info.kind||G.mode!=='attract')attract(info.kind);
  $('lobby').hidden=true;$('sheet').hidden=true;$('result').hidden=true;$('matching').hidden=false;
  $('mTag').textContent=`${info.name} · Online`;$('mHead').textContent='상대를 찾고 있어요';$('mClock').textContent='00:00';$('mClock').hidden=false;
  $('mMyName').textContent=save.nick;$('mMySub').textContent=`${info.rank.label} ${rec.rk} · ${rec.w}승 ${rec.l}패`;
  $('mOpp').classList.add('wait');$('mOppName').textContent='대기 중';$('mOppSub').textContent='같은 종목을 고른 상대를 찾는 중';$('mOppBadge').hidden=true;
  $('mBot').hidden=true;$('mCancel').hidden=false;
  const MATCH_NOTE='상대를 찾고 있어요.';$('mNote').textContent=MATCH_NOTE;
  MT={game,t0:Date.now(),state:'search',room:null,unsub:null,want:null,skip:{},q:null,r:null,unsubR:null,ivR:null,noRoom:false};
  MT.iv=setInterval(matchTick,250);
  const mine=MT;
  MT.perm=true;
  roomReady().then(room=>{
    if(MT!==mine)return;
    MT.perm=false;MT.t0=Date.now();$('mNote').textContent=MATCH_NOTE;
    if(!room){MT.noRoom=true;return;}
    MT.room=room;
    MT.q={g:game,t:Date.now(),v:NET_V,nick:save.nick,rk:rec.rk};
    MT.unsub=room.onPeers(()=>matchTick(),()=>{if(MT===mine)MT.noRoom=true;});
    room.presence({q:MT.q}).catch(()=>{if(MT===mine)MT.noRoom=true;});
  });
}
function matchClear(){
  if(!MT)return;
  clearInterval(MT.iv);clearInterval(MT.ivR);
  if(MT.unsub)MT.unsub();if(MT.unsubR)MT.unsubR();
  if(MT.room)MT.room.presence({q:null}).catch(()=>{});
}
function validQ(q,game){return q&&typeof q==='object'&&q.g===game&&q.v===NET_V&&typeof q.t==='number';}
function matchTick(){
  if(!MT)return;
  const now=Date.now(),el=Math.floor((now-MT.t0)/1000);
  if(MT.state==='search'||MT.state==='join')$('mClock').textContent=fmtClock(el);
  if(MT.state!=='search'||MT.perm)return;
  if(!MT.botAfter)MT.botAfter=rnd(5000,12000);
  if(MT.noRoom){
    $('mNote').textContent='상대를 찾고 있어요.';
    if(now-MT.t0>MT.botAfter)matchBot();
    return;
  }
  if(MT.room){
    const peers=MT.room.peers(),me=peers.find(p=>p.sameTab);
    if(me){
      const count=peers.filter(p=>p.kind==='viewer').length;
      if(count>1)$('mOppSub').textContent=`지금 ${count}명 접속 중`;
      const q=peers.filter(p=>p.kind==='viewer'&&validQ(p.presence.q,MT.game)&&!(MT.skip[p.peer]>now)).sort((a,b)=>a.presence.q.t-b.presence.q.t||(a.peer<b.peer?-1:1));
      const idx=q.findIndex(p=>p.sameTab);
      let partner=null;if(idx>=0)partner=q[idx%2===0?idx+1:idx-1]||null;
      const want=partner?partner.peer:null;
      if(want!==MT.want){MT.want=want;MT.q=Object.assign({},MT.q,{want});MT.room.presence({q:MT.q}).catch(()=>{});}
      if(partner&&partner.presence.q.want===me.peer){matchJoin(me,partner);return;}
    }
  }
  if(now-MT.t0>MT.botAfter)matchBot();
}
async function matchJoin(me,partner){
  const mine=MT;MT.state='join';
  const [a,b]=[me.peer,partner.peer].sort(),name='m'+hash32(a+'|'+b).toString(36)+hash32(b+'|'+a+MT.game).toString(36);
  let r;
  try{r=await MT.room.join(name);}catch(e){if(MT===mine)matchRetry(partner.peer);return;}
  if(MT!==mine){r.leave().catch(()=>{});return;}
  MT.r=r;
  r.presence({hello:{nick:save.nick,rk:save.rec[MT.game].rk,v:NET_V}}).catch(()=>{});
  const deadline=Date.now()+7000;
  const check=()=>{
    if(MT!==mine||MT.state!=='join')return;
    const p=r.peers().find(x=>x.peer===partner.peer),h=p&&p.presence&&p.presence.hello;
    if(h&&h.v===NET_V){
      MT.state='found';clearInterval(MT.ivR);
      const seed=hash32(name+'seed'),amFirst=((hash32(name)&1)===0)===(a===me.peer);
      matchFound({room:r,oppPeer:partner.peer,seed,amFirst,oppNick:cleanText(h.nick,'상대')||'상대',oppRk:h.rk|0});
    }else if(Date.now()>deadline){r.leave().catch(()=>{});matchRetry(partner.peer);}
  };
  MT.unsubR=r.onPeers(check,()=>{});MT.ivR=setInterval(check,300);check();
}
function matchRetry(peer){if(!MT)return;clearInterval(MT.ivR);if(MT.unsubR)MT.unsubR();MT.unsubR=null;MT.r=null;MT.skip[peer]=Date.now()+15000;MT.state='search';MT.want=null;}
function cleanMsg(s,max=80){if(typeof s!=='string')return '';let o='';for(const ch of s){const c=ch.codePointAt(0);if(c<32||(c>=127&&c<160)||(c>=0x200b&&c<=0x200f)||(c>=0x2028&&c<=0x202e)||(c>=0x2060&&c<=0x206f))continue;o+=ch;}return o.slice(0,max);}
function cleanText(s,fb){return typeof s==='string'?cleanMsg(s,20):fb;}
function matchFound(net){
  const game=MT.game,info=GAME_INFO[game];
  $('mHead').textContent='매칭 완료';$('mClock').hidden=true;$('mOpp').classList.remove('wait');
  $('mOppName').textContent=net.oppNick;$('mOppSub').textContent=`${info.rank.label} ${net.oppRk}`;$('mOppBadge').textContent='LIVE';$('mOppBadge').className='badge';$('mOppBadge').hidden=false;
  $('mNote').textContent=net.amFirst?'내가 먼저 쳐요.':'상대가 먼저 쳐요.';$('mBot').hidden=true;$('mCancel').hidden=true;
  sfx('score',1);
  const mine=MT;matchClear();
  setTimeout(()=>{if(MT!==mine)return;MT=null;startGame({mode:'online',game,net});},1700);
}
function matchBot(){
  if(!MT||MT.state!=='search')return;
  const game=MT.game,info=GAME_INFO[game],rec=save.rec[game],mine=MT;
  MT.state='found';matchClear();
  const lv=rec.rk<950?'easy':rec.rk>1150?'hard':'mid',botName='플레이어 '+Math.random().toString(16).slice(2,5).toUpperCase();
  const oppRk=Math.max(0,rec.rk+Math.round(rnd(-120,120)));
  $('mHead').textContent='매칭 완료';$('mClock').hidden=true;$('mOpp').classList.remove('wait');
  $('mOppName').textContent=botName;$('mOppSub').textContent=`${info.rank.label} ${oppRk}`;$('mOppBadge').hidden=true;
  $('mNote').textContent='';$('mBot').hidden=true;$('mCancel').hidden=true;
  setTimeout(()=>{if(MT!==mine)return;MT=null;startGame({mode:'online',game,botName,botLv:lv,botRk:oppRk});},1300);
}
function matchCancel(){if(!MT)return;const r=MT.r;matchClear();MT=null;if(r)r.leave().catch(()=>{});$('matching').hidden=true;toLobby();}

// 인게임 중계
const enc=()=>{const a=[];LB.forEach(b=>{a.push(Math.round(b.p.x*1e5),Math.round(b.p.z*1e5));});return a;};
const potMask=()=>LB.reduce((m,b,i)=>m|(b.pot?1<<i:0),0);
function decode(b,p){LB.forEach((x,i)=>{x.p.set(b[2*i]/1e5,R,b[2*i+1]/1e5);const pot=!!(p>>i&1);x.pot=pot;x.off=pot;if(!pot||!x.sink)x.mesh.visible=!pot;if(!pot)x.sink=null;x.v.set(0,0,0);x.w.set(0,0,0);});}
const validBoard=(b,p)=>Array.isArray(b)&&b.length===2*LB.length&&b.every(n=>Number.isFinite(n)&&Math.abs(n)<400000)&&Number.isInteger(p)&&p>=0;
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&Math.abs(n)<2000);
function netSetup(n){
  Object.assign(n,{applied:0,lastG:null,goneAt:0,turnAt:Date.now(),queued:null,pendingE:null,lastAim:0,aimKey:'',downAt:0,closed:false,hbAt:Date.now(),hb:0,endWaitAt:0});
  n.unsub=n.room.onPeers(()=>netTick(),()=>netLost());
  n.iv=setInterval(netTick,400);
}
function netLost(){if(G.net&&!G.over)finishGame(-1,'연결이 끊겨서 이번 판은 무효예요');}
function netClose(){
  const n=G.net;if(!n||n.closed)return;n.closed=true;
  clearInterval(n.iv);if(n.unsub)n.unsub();
  setTimeout(()=>{n.room.leave().catch(()=>{});},900);
}
function netTick(){
  const n=G.net;if(!n||n.closed||G.over)return;
  const now=Date.now();
  if(!n.room.connected()){if(!n.downAt)n.downAt=now;else if(now-n.downAt>20000){netLost();return;}}else n.downAt=0;
  if(now-n.hbAt>3000){n.hbAt=now;n.hb=(n.hb+1)%1000;n.room.presence({hb:n.hb}).catch(()=>{});}
  const opp=n.room.peers().find(p=>p.peer===n.oppPeer);
  if(!opp){if(!n.goneAt){n.goneAt=now;banner('상대 연결 끊김 · 기다리는 중');}else if(now-n.goneAt>GONE_MS)finishGame(G.myIdx,'상대 연결이 끊겼어요');return;}
  n.goneAt=0;
  const pr=opp.presence||{};
  if(phase==='wait'&&Array.isArray(pr.a)&&pr.a.length>=5&&pr.a.every(Number.isFinite)){
    let to=pr.a[0];while(to-aimPhi>Math.PI)to-=TAU;while(to-aimPhi<-Math.PI)to+=TAU;
    n.aimTo=to;hit={a:clamp(pr.a[1],-1,1),b:clamp(pr.a[2],-1,1)};elev=clamp(pr.a[3],0,75);power=clamp(pr.a[4],0,1);
    if(pr.a.length>=7&&G.bih){const c=LB[0];c.p.x=clamp(pr.a[5],-LIM_X,LIM_X);c.p.z=clamp(pr.a[6],-LIM_Z,LIM_Z);}
    syncSpinUI();updateUI();
  }
  if(pr.g&&pr.g!==n.lastG){n.lastG=pr.g;netMsg(pr.g);}
  if(now-(opp.updatedAt||now)>30000||(phase==='wait'&&now-n.turnAt>STALL_MS)||(phase==='wait-end'&&now-n.endWaitAt>40000))finishGame(G.myIdx,'상대가 응답하지 않아요');
}
function netMsg(g){
  const n=G.net;if(!g||typeof g!=='object')return;
  if(g.k==='F'){finishGame(G.myIdx,'상대가 기권했어요');return;}
  if(!Number.isInteger(g.n)||g.n<=n.applied)return;
  if(g.k==='S'){
    if(!validBoard(g.b,g.p)||!finite3(g.v)||!finite3(g.w))return;
    if(phase!=='wait'){n.queued=g;return;}
    decode(g.b,g.p);n.applied=g.n;n.turnAt=Date.now();
    G.cueI=clamp(g.c|0,0,LB.length-1);G.remoteShot=true;G.clockEnd=0;n.aimTo=null;
    fireLive(G.cueI,{v:new V(g.v[0],g.v[1],g.v[2]),w:new V(g.w[0],g.w[1],g.w[2]),mis:!!g.m});
  }else if(g.k==='E'){
    if(!validBoard(g.b,g.p)||!Array.isArray(g.s)||g.s.length!==2)return;
    if(G.remoteShot){n.pendingE=g;return;}
    if(phase==='pause'){n.queued=g;return;}
    remoteEnd(g);
  }
}
function netFlush(){const n=G.net;if(n&&n.queued){const g=n.queued;n.queued=null;netMsg(g);}}
function remoteShotDone(){const n=G.net;if(n.pendingE){const e=n.pendingE;n.pendingE=null;remoteEnd(e);}else{phase='wait-end';n.endWaitAt=Date.now();updateUI();}}
function remoteEnd(g){
  const n=G.net;decode(g.b,g.p);n.applied=g.n;
  G.players.forEach((p,i)=>{p.score=clamp(g.s[i]|0,0,99);p.group=[null,'solid','stripe'][(g.gr&&g.gr[i])|0]||null;});
  G.turn=g.t?1:0;G.inning=clamp(g.i|0,1,999);G.bih=!!g.h;G.isBreak=!!g.br;
  showOutcome({msg:cleanMsg(g.m),toast:cleanMsg(g.tt).slice(0,12),bad:!!g.tb,over:g.o===0||g.o===1?g.o:-1,keep:!!g.kp,why:cleanMsg(g.m)});
}
function normalizeBoard(){decode(enc(),potMask());}
function netSendShot(s){
  const n=G.net;normalizeBoard();n.applied++;
  n.room.presence({g:{k:'S',n:n.applied,c:G.cueI,b:enc(),p:potMask(),v:[s.v.x,s.v.y,s.v.z],w:[s.w.x,s.w.y,s.w.z],m:s.mis?1:0},a:null}).catch(()=>{});
}
function netSendEnd(r){
  const n=G.net;normalizeBoard();n.applied++;
  n.room.presence({g:{k:'E',n:n.applied,b:enc(),p:potMask(),t:G.turn,s:G.players.map(p=>p.score),i:G.inning,gr:G.players.map(p=>p.group==='solid'?1:p.group==='stripe'?2:0),h:G.bih?1:0,o:r.over,m:cleanMsg(r.msg),tt:r.toast?String(r.toast):'',tb:r.bad?1:0,kp:r.keep?1:0,br:G.isBreak?1:0}}).catch(()=>{});
}
function netAimTick(){
  const n=G.net;if(!n||n.closed)return;
  if(phase==='wait'&&n.aimTo!=null)aimPhi+=(n.aimTo-aimPhi)*.25;
  if(phase!=='aim'&&phase!=='place')return;
  const now=performance.now();if(now-n.lastAim<125)return;
  const a=[+aimPhi.toFixed(4),+hit.a.toFixed(3),+hit.b.toFixed(3),elev,+power.toFixed(3)];
  if(phase==='place')a.push(+LB[0].p.x.toFixed(4),+LB[0].p.z.toFixed(4));
  const key=a.join();if(key===n.aimKey)return;
  n.aimKey=key;n.lastAim=now;n.room.presence({a}).catch(()=>{});
}
function netForfeit(){const n=G.net;if(n&&!n.closed)n.room.presence({g:{k:'F',n:n.applied+1}}).catch(()=>{});}

// 랭킹: 이 페이지에서 온라인을 한 사람들끼리 점수로 순위를 매긴다
const Rank={db:null,uid:null,docs:[],map:{},unsub:null};
async function rankInit(){
  try{
    if(!(window.claude&&window.claude.use))return;
    const [db,user,perms]=await Promise.all(['db','user','permissions'].map(n=>window.claude.use(n)));
    if(!db||!user)return;
    const uid=await user.id();if(!uid)return;
    Rank.db=db;Rank.uid=uid;
    if(!perms||await perms.state('db')==='granted')rankListen();
  }catch(e){}
}
function rankListen(){
  if(Rank.unsub||!Rank.db)return;
  try{Rank.unsub=Rank.db.collection('rank').limit(1000).onSnapshot(s=>{
    Rank.docs=s.docs.map(d=>({id:d.id,v:d.data()||{}}));rankMerge();rankCompute();refreshLobby();
  },()=>{Rank.unsub=null;});}catch(e){}
}
const validRec=r=>r&&typeof r==='object'&&Number.isFinite(r.r)&&Number.isFinite(r.w)&&Number.isFinite(r.l);
function rankMerge(){
  const mine=Rank.docs.find(d=>d.id===Rank.uid);if(!mine)return;let ch=false;
  Object.keys(GAME_INFO).forEach(g=>{const r=mine.v[g],l=save.rec[g];if(validRec(r)&&r.w+r.l>l.w+l.l){save.rec[g]={rk:r.r,w:r.w,l:r.l};ch=true;}});
  if(ch)persist();
}
function rankCompute(){
  Rank.map={};
  Object.keys(GAME_INFO).forEach(g=>{const me=save.rec[g];if(!(me.w+me.l))return;Rank.map[g]=1+Rank.docs.filter(d=>d.id!==Rank.uid&&validRec(d.v[g])&&d.v[g].w+d.v[g].l>0&&d.v[g].r>me.rk).length;});
}
function rankPush(){
  if(!Rank.db||!Rank.uid)return;
  const body={};Object.keys(GAME_INFO).forEach(g=>{const r=save.rec[g];body[g]={r:r.rk,w:r.w,l:r.l};});
  Rank.db.doc('rank/'+Rank.uid).set(body).then(()=>rankListen()).catch(()=>{});
}

// 방 만들기 / 입장하기: 코드로 같은 방에 모이는 친선전 (Rating 미반영)
function roomScreen(game,head,note){
  exitGameUI();const info=game&&GAME_INFO[game];
  if(info&&(tableKind!==info.kind||G.mode!=='attract'))attract(info.kind);
  $('lobby').hidden=true;$('sheet').hidden=true;$('result').hidden=true;$('matching').hidden=false;
  $('mTag').textContent=info?`${info.name} · 친선전`:'친선전';$('mHead').textContent=head;$('mClock').hidden=true;
  $('mMyName').textContent=save.nick;$('mMySub').textContent='Rating 변동 없음';
  $('mOpp').classList.add('wait');$('mOppName').textContent='대기 중';$('mOppSub').textContent='';$('mOppBadge').hidden=true;
  $('mBot').hidden=true;$('mCancel').hidden=false;$('mNote').textContent=note;
}
function roomStart(r,name,me,oppPeer,h,game,isHost){
  MT.state='found';clearInterval(MT.ivR);
  const [a,b]=[me,oppPeer].sort(),amFirst=((hash32(name+a+b)&1)===0)===isHost;
  MT.game=game;$('mTag').textContent=`${GAME_INFO[game].name} · 친선전`;
  matchFound({room:r,oppPeer,seed:hash32(name+a+b+'seed'),amFirst,oppNick:cleanText(h.nick,'상대')||'상대',oppRk:clamp(h.rk|0,0,5000),friendly:true});
}
function roomLink(mine,r,fn){MT.r=r;MT.unsubR=r.onPeers(fn,()=>{});MT.ivR=setInterval(fn,300);fn();}
async function roomCreate(game){
  const code=String(1000+Math.floor(Math.random()*9000)),name='r'+code;
  MT={game,t0:Date.now(),state:'room',room:null,r:null,perm:true};const mine=MT;
  roomScreen(game,'방 코드 '+code,'상대에게 이 코드를 알려 주세요. 입장하면 바로 시작해요.');
  const room=await roomReady();if(MT!==mine)return;
  if(!room){$('mNote').textContent='지금 이 화면은 실시간 연결을 쓸 수 없어요.';return;}
  let r;try{r=await room.join(name);}catch(e){if(MT===mine)$('mNote').textContent='방을 만들지 못했어요. 다시 시도해 주세요.';return;}
  if(MT!==mine){r.leave().catch(()=>{});return;}
  const hello={nick:save.nick,rk:save.rec[game].rk,v:NET_V,host:1,gm:game};r.presence({hello}).catch(()=>{});
  let picked=null;
  roomLink(mine,r,()=>{
    if(MT!==mine||MT.state!=='room')return;
    const ps=r.peers(),me=ps.find(p=>p.sameTab);if(!me)return;
    const gs=ps.filter(p=>!p.sameTab&&p.kind==='viewer'&&p.presence.hello&&p.presence.hello.v===NET_V&&!p.presence.hello.host);
    if(picked&&!gs.some(p=>p.peer===picked)){picked=null;r.presence({hello}).catch(()=>{});}
    if(!picked&&gs.length){picked=gs[0].peer;r.presence({hello:Object.assign({},hello,{with:picked})}).catch(()=>{});}
    const g=gs.find(p=>p.peer===picked);
    if(g&&g.presence.hello.with===me.peer)roomStart(r,name,me.peer,g.peer,g.presence.hello,game,true);
  });
}
function joinFail(msg){const r=MT&&MT.r;matchClear();MT=null;if(r)r.leave().catch(()=>{});$('matching').hidden=true;toLobby();openJoin();$('joinErr').textContent=msg;}
async function roomJoin(code){
  const name='r'+code;MT={game:null,t0:Date.now(),state:'room',room:null,r:null,perm:true};const mine=MT;
  roomScreen(null,'방 '+code+' 입장 중','방을 찾고 있어요.');
  const room=await roomReady();if(MT!==mine)return;
  if(!room){joinFail('지금 이 화면은 실시간 연결을 쓸 수 없어요.');return;}
  let r;try{r=await room.join(name);}catch(e){if(MT===mine)joinFail('입장하지 못했어요. 다시 시도해 주세요.');return;}
  if(MT!==mine){r.leave().catch(()=>{});return;}
  const hello={nick:save.nick,v:NET_V};r.presence({hello}).catch(()=>{});
  const t0=Date.now();let sent=null;
  roomLink(mine,r,()=>{
    if(MT!==mine||MT.state!=='room')return;
    const ps=r.peers(),me=ps.find(p=>p.sameTab),h=ps.find(p=>!p.sameTab&&p.presence.hello&&p.presence.hello.host&&p.presence.hello.v===NET_V);
    if(!h){if(Date.now()-t0>7000)joinFail('그 코드의 방을 찾지 못했어요.');return;}
    const hh=h.presence.hello,game=GAME_INFO[hh.gm]?hh.gm:null;if(!game||!me)return;
    if(hh.with&&hh.with!==me.peer){joinFail('이미 게임이 시작된 방이에요.');return;}
    if(sent!==h.peer){sent=h.peer;r.presence({hello:{nick:save.nick,rk:save.rec[game].rk,v:NET_V,with:h.peer}}).catch(()=>{});}
    if(hh.with===me.peer)roomStart(r,name,me.peer,h.peer,hh,game,false);
  });
}
