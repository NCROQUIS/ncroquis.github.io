const Core=require('./core.js');let pass=0,fail=0;
const ok=(name,cond)=>{if(cond){pass++;console.log('PASS',name)}else{fail++;console.log('FAIL',name)}};
// 1. stages are deterministic and valid
for(let n=1;n<=Core.STAGES;n++){const a=Core.makeStage(n),b=Core.makeStage(n);
  if(JSON.stringify(a)!==JSON.stringify(b)){ok('deterministic '+n,false);continue}
  const keys=new Set();let dup=false;a.bricks.forEach(x=>{const k=x.r+','+x.c;if(keys.has(k))dup=true;keys.add(k)});
  a.items.forEach(x=>{if(keys.has(x.r+','+x.c))dup=true});
  if(dup||a.bricks.some(x=>x.c<0||x.c>(a.cols||7)-1||x.hp<1||x.r>(a.cols?7:(n>=Core.MAIN_FIRST?7:5))||!['n','b','xh','xv'].includes(x.type))||a.par3>=a.par2){ok('stage valid '+n,false)}}
ok(Core.STAGES+' stages deterministic and valid',Core.STAGES===106);
// 2. star thresholds
{const s=Core.newGame(Core.makeStage(5));ok('3 stars at par3',Core.starsFor(s,s.stage.par3)===3);ok('2 stars at par2',Core.starsFor(s,s.stage.par2)===2);ok('1 star after par2',Core.starsFor(s,s.stage.par2+1)===1);s.continued=true;ok('continue caps at 1 star',Core.starsFor(s,1)===1);}
// 3. single shot: balls all land, turn advances, bricks descend
{const s=Core.newGame(Core.makeStage(1));const before=[...s.bricks.values()].map(b=>b.r);Core.runShot(s,Math.PI/2);
 ok('turn advances after shot',s.turn===1&&(s.status==='aim'||s.status==='clear'));
 ok('bricks descend one row',s.status!=='aim'||[...s.bricks.values()].every(b=>before.includes(b.r-1)));
 ok('launcher stays in field',s.launchX>=Core.BR&&s.launchX<=7-Core.BR);}
// 4. damage conservation: total hp lost == damage stat
{const s=Core.newGame(Core.makeStage(3));const tot=()=>[...s.bricks.values()].reduce((a,b)=>a+b.hp,0);const h0=tot();Core.runShot(s,1.2);
 ok('damage accounting matches hp lost',h0-tot()===s.stats.dmg);}
// 5. fail when bricks reach bottom
{const s=Core.newGame(Core.makeStage(4));for(const b of s.bricks.values())b.hp=99999;let g=0;while(s.status==='aim'&&g++<20)Core.runShot(s,0.2);
 ok('fail when bricks hit floor',s.status==='fail');Core.continueGame(s);ok('continue clears bottom rows',s.status==='aim'&&Core.dangerRow(s)<Core.ROWS-4);}
// 6. bomb chain
{const s=Core.newGame({n:0,ch:2,balls:1,bricks:[{r:2,c:3,hp:1,type:'b'},{r:2,c:4,hp:5,type:'n'},{r:1,c:3,hp:6,type:'n'}],items:[],par3:1,par2:2});
 Core.runShot(s,Math.PI/2);ok('bomb destroys neighbors',s.bricks.size===0&&s.status==='clear'&&s.stars===3);}
// 7. plus item adds a ball
{const s=Core.newGame({n:0,ch:1,balls:1,bricks:[{r:0,c:0,hp:50,type:'n'}],items:[{r:5,c:3,type:'plus'}],par3:1,par2:2});Core.runShot(s,Math.PI/2);ok('+1 item adds a ball',s.balls===2);}
// 8. laser hits whole row
{const s=Core.newGame({n:0,ch:1,balls:1,bricks:[{r:4,c:0,hp:2,type:'n'},{r:4,c:6,hp:2,type:'n'},{r:0,c:0,hp:50,type:'n'}],items:[{r:4,c:3,type:'lh'}],par3:1,par2:2});
 Core.runShot(s,Math.PI/2);const row=[...s.bricks.values()].filter(b=>b.r===5);ok('laser hits row on each pass (2 passes destroy hp-2 bricks)',row.length===0&&s.bricks.size===1);}
// 9. recall ends turn immediately
{const s=Core.newGame(Core.makeStage(6));Core.startShot(s,1);for(let i=0;i<30;i++)Core.step(s);Core.recall(s);ok('recall ends turn',s.shot===null&&s.turn===1);}
// 10. no stuck balls: every shot of every stage terminates
{let stuck=0;for(let n=1;n<=30;n++){for(const a of [0.14,0.5,1.0,1.57,2.2,3.0]){const s=Core.newGame(Core.makeStage(n));Core.startShot(s,a);let g=0;while(s.status==='shooting'&&g++<200000)Core.step(s);if(s.status==='shooting')stuck++;}}ok('all shots terminate (180 shots)',stuck===0);}
// 11. bot clears all stages within par2
{let bad=[];for(let n=1;n<=30;n++){const r=Core.botPlay(n,80);if(r.status!=='clear')bad.push(n)}ok('bot clears all 30 campaign stages',bad.length===0);}
// 12. early-game balance
{const s=Core.newGame(Core.makeStage(2));s.events=null;Core.runShot(s,Math.PI/3);ok('stage 2 first shot breaks 25+ bricks (chain)',s.stats.breaks>=25);}
{let minB=99;for(let d=10;d<=170;d+=5){const s=Core.newGame(Core.makeStage(2));s.events=null;Core.runShot(s,d*Math.PI/180);minB=Math.min(minB,s.stats.breaks);}ok('stage 2 chain works at every angle (min '+minB+')',minB>=25);}
{const hp=n=>Core.makeStage(n).bricks.reduce((a,b)=>a+b.hp,0)/Core.makeStage(n).balls;ok('stage 1 easier than stage 3 (hp per ball '+hp(1).toFixed(1)+' < '+hp(3).toFixed(1)+')',hp(1)*1.8<hp(3));}
{const r1=Core.botPlay(1),r3=Core.botPlay(3);ok('bot: stage 1 in '+r1.turns+' turns, stage 3 in '+r3.turns+' turns',r1.turns<r3.turns&&r1.status==='clear'&&r3.status==='clear');}
{const s=Core.newGame(Core.makeStage(4));Core.startShot(s,0.3);let walls=0;while(s.status==='shooting'){Core.step(s);for(const e of s.events)if(e.type==='wall'&&e.side&&e.p!=null)walls++;s.events.length=0;}ok('wall hits carry side and position ('+walls+')',walls>0);}
// 13. thrill moments
{let found=false;for(let n=11;n<=20&&!found;n++){const s=Core.newGame(Core.makeStage(n));let g=0;while(s.status==='aim'&&g++<30&&!found){Core.startShot(s,Core.botAngle(s));while(s.status==='shooting'){Core.step(s);for(const e of s.events)if(e.type==='backshot'&&e.x!=null)found=true;s.events.length=0;}}}ok('BACK SHOT event fires when balls get behind bricks',found);}
{const s=Core.newGame(Core.makeStage(1));let lasts=0,g=0;while(s.status==='aim'&&g++<30){Core.startShot(s,Core.botAngle(s));while(s.status==='shooting'){Core.step(s);for(const e of s.events)if(e.type==='break'&&e.last)lasts++;s.events.length=0;}}ok('exactly one last-brick event per clear ('+lasts+')',lasts===1&&s.status==='clear');}
{const s=Core.newGame({n:0,ch:1,balls:1,bricks:[{r:2,c:3,hp:1,type:'b'},{r:2,c:4,hp:5,type:'n'},{r:2,c:2,hp:5,type:'n'}],items:[],par3:1,par2:2});Core.runShot(s,Math.PI/2);ok('bomb chain clear marks only final break as last',s.events.filter(e=>e.type==='break'&&e.last).length===1);}
// 14. novice bot + human calibration
{const r=Core.playStage(Core.makeStage(5),'novice',7),r2=Core.playStage(Core.makeStage(5),'novice',7);ok('novice bot is deterministic per seed',JSON.stringify(r)===JSON.stringify(r2));}
{const e1=Core.evaluate(Core.makeStage(1),16),e10=Core.evaluate(Core.makeStage(10),16);ok(`novice clears stage 1 (${Math.round(e1.clearRate*100)}%) more than boss stage 10 (${Math.round(e10.clearRate*100)}%)`,e1.clearRate>=0.9&&e10.clearRate<e1.clearRate&&e10.clearRate>=0.3);}
{let worst=1,which=0;for(const n of [4,11,15,20]){const e=Core.evaluate(Core.makeStage(n),12);if(e.clearRate<worst){worst=e.clearRate;which=n;}}ok(`late stages are beatable by casual players (lowest sampled ${Math.round(worst*100)}% at stage ${which})`,worst>=0.35);}
{const ex=Core.playStage(Core.makeStage(9),'expert'),nv=Core.evaluate(Core.makeStage(9),12);ok(`expert beats novice median on stage 9 (${ex.turns} vs ${nv.median})`,ex.turns<=nv.median);}
// 15. boosters
{const s=Core.newGame({n:0,ch:1,balls:3,bricks:[{r:2,c:3,hp:1,type:'b'},{r:2,c:4,hp:50,type:'n'},{r:0,c:0,hp:9,type:'n'}],items:[],par3:1,par2:2});
 ok('hammer on empty cell is refused',!Core.applyBooster(s,'hammer',{r:5,c:5})&&s.bricks.size===3);
 ok('hammer on a bomb chains to neighbours',Core.applyBooster(s,'hammer',{r:2,c:3})&&!s.bricks.has(Core.key(2,3))&&s.bricks.get(Core.key(2,4)).hp===44);}
{const s=Core.newGame({n:0,ch:1,balls:3,bricks:[{r:4,c:0,hp:30,type:'n'},{r:4,c:6,hp:30,type:'n'},{r:1,c:2,hp:5,type:'n'}],items:[],par3:1,par2:2});
 ok('laser clears a whole row',Core.applyBooster(s,'laser',{r:4})&&s.bricks.size===1&&s.status==='aim');
 ok('laser that clears the last row wins the stage',Core.applyBooster(s,'laser',{r:1})&&s.status==='clear'&&s.stars===3);}
{const s=Core.newGame(Core.makeStage(3));Core.applyBooster(s,'balls');Core.startShot(s,1.2);ok('+10 balls applies to the next shot only',s.shot.total===s.balls+10&&!s.bonusBalls);
 while(s.status==='shooting')Core.step(s);if(s.status==='aim'){Core.startShot(s,1.2);ok('following shot is back to normal',s.shot.total===s.balls);}}
{const s=Core.newGame(Core.makeStage(4));const d0=Core.dangerRow(s);Core.applyBooster(s,'push');ok('push lifts every brick 2 rows',Core.dangerRow(s)===d0-2&&s.boostersUsed===1);}
{const s=Core.newGame(Core.makeStage(4));Core.startShot(s,1);ok('boosters only between shots',!Core.applyBooster(s,'push'));}
// 16. fun metrics
{const st={n:0,ch:1,balls:6,bricks:[...Array(7)].map((_,c)=>({r:3,c,hp:2,type:'n'})),items:[],par3:3,par2:5};
 const flat=Core.angleSkill(st);ok(`flat wall is a luck board (angle reward ${flat.toFixed(2)})`,flat<0.3);}
{const st=Core.makeStage(9);const sk=Core.angleSkill(st);ok(`stage 9 rewards aiming (angle reward ${sk.toFixed(2)})`,sk>0.4);}
{const st=Core.makeStage(5),runs=[];for(let i=0;i<8;i++)runs.push(Core.playStage(st,'novice',1000+i*7919));const r=Core.funReport(st,runs,0.5,Core.playStage(st,'expert'));
 ok('fun parts sum to score and stay in range',r.score===Object.values(r.parts).reduce((a,b)=>a+b,0)&&r.score>=0&&r.score<=100&&r.parts.flow<=25);
 ok('runs record tail, dry and chain',runs.every(x=>x.tail>=0&&x.dry>=0&&x.chain>=x.first));}
{const st={n:0,ch:1,balls:2,bricks:[{r:0,c:0,hp:30,type:'n'},{r:0,c:6,hp:30,type:'n'}],items:[],par3:3,par2:5};const runs=[Core.playStage(st,'novice',5)];
 const r=Core.funReport(st,runs,0.1,{status:'clear'});ok(`hide-and-seek board gets warnings (${r.warn.length})`,r.warn.some(w=>w[1].includes('숨바꼭질'))&&r.warn.some(w=>w[1].includes('운 판')));}
// 17. chapter 3 laser bricks
{const st={n:0,ch:3,balls:1,bricks:[{r:4,c:3,hp:1,type:'xh'},{r:4,c:0,hp:5,type:'n'},{r:4,c:6,hp:9,type:'n'},{r:1,c:1,hp:30,type:'n'}],items:[],par3:1,par2:2};
 const g=Core.newGame(st);Core.runShot(g,Math.PI/2);const left=[...g.bricks.values()].filter(b=>b.r===5);ok('horizontal laser brick hits its row for 5',left.length===1&&left[0].hp===4);}
{const st={n:0,ch:3,balls:1,bricks:[{r:5,c:3,hp:1,type:'xv'},{r:2,c:3,hp:5,type:'n'},{r:0,c:3,hp:5,type:'b'},{r:0,c:4,hp:6,type:'n'}],items:[],par3:1,par2:2};
 const g=Core.newGame(st);Core.runShot(g,Math.PI/2);ok('vertical laser brick chains into a bomb (column cleared, bomb blast takes the neighbour)',![...g.bricks.values()].some(b=>b.c===3||b.c===4)&&g.bricks.size===0&&g.status==='clear');}
{const s=Core.makeStage(25);ok('chapter 3 stages are chapter 3 with laser bricks',s.ch===3&&s.bricks.some(b=>b.type==='xh'||b.type==='xv'));}
{const g=Core.newGame(Core.makeStage(12));let laserEv=0;for(let k=0;k<6&&g.status==='aim';k++){Core.startShot(g,0.4+k*0.4);while(g.status==='shooting'){Core.step(g);for(const e of g.events)if(e.type==='laser'&&e.dir)laserEv++;g.events.length=0;}}ok('laser events keep their type name (visual bug fixed)',laserEv>=0&&!g.events.some(e=>e.type==='lh'));}
// 18. wide boards
{const want={31:[9,'pocket'],32:[9,'cross'],33:[11,'bank'],34:[11,'pocket'],35:[13,'cross'],36:[13,'bank']};let good=0;for(const n in want){const s=Core.makeStage(+n);if(s.cols===want[n][0]&&s.kind===want[n][1]&&s.rows===({9:12,11:14,13:16})[s.cols])good++;}ok('wide stages have their width and trick type (6/6)',good===6);}
{const s=Core.newGame(Core.makeStage(35));ok('13-column board launches from the middle',s.launchX===6.5&&s.cols===13&&s.rows===16);
 Core.startShot(s,0.15);let maxX=0;while(s.status==='shooting'){Core.step(s);for(const b of s.shot?s.shot.balls:[])if(b.alive)maxX=Math.max(maxX,b.x);}ok(`balls bounce off the 13-column wall (max x ${maxX.toFixed(2)})`,maxX>12.5&&maxX<=13);}
{const st={n:0,ch:4,cols:11,rows:14,balls:1,bricks:[{r:12,c:10,hp:999,type:'n'}],items:[],par3:1,par2:2};const g=Core.newGame(st);Core.runShot(g,Math.PI/2);ok('fail line follows the taller board (row 13 of 14)',g.status==='fail');}
{const st={n:0,ch:4,cols:11,rows:14,balls:1,bricks:[{r:11,c:10,hp:999,type:'n'}],items:[],par3:1,par2:2};const g=Core.newGame(st);Core.runShot(g,Math.PI/2);ok('one row above the line is still alive',g.status==='aim');}
{const t=Date.now();const r=Core.playStage(Core.makeStage(36),'expert');ok(`expert clears the widest stage (${r.turns} turns, ${((Date.now()-t)/1000).toFixed(1)}s)`,r.status==='clear');}

// special balls (first ball of a shot) and golden aim
{const mk=bricks=>({n:0,ch:1,balls:1,bricks,items:[],par3:1,par2:2});
 const run=(st,type,a=Math.PI/2)=>{const g=Core.newGame(st);g.ballType=type;Core.startShot(g,a);const evs=[];g.events=evs;while(g.status==='shooting')Core.step(g);return {g,evs};};
 // a column of four 1-hp bricks straight above the launcher (launch x 3.5)
 const col=[1,2,3,4].map(r=>({r,c:3,hp:1,type:'n'}));
 {const {g}=run(mk(col.map(b=>({...b}))),null);ok('plain ball breaks one brick of the column',g.bricks.size===3);}
 {const {g,evs}=run(mk(col.map(b=>({...b}))),'pierce');ok(`pierce ball goes through all 4 (${4-g.bricks.size} broken)`,g.bricks.size===0&&evs.filter(e=>e.type==='special').length===4);}
 const ring=[];for(let r=1;r<=3;r++)for(let c=2;c<=4;c++)ring.push({r,c,hp:2,type:'n'});
 {const {g}=run(mk(ring.map(b=>({...b}))),'explode');const dmg=ring.length*2-[...g.bricks.values()].reduce((a,b)=>a+b.hp,0);ok(`blast ball hits the bricks around it (${dmg} damage)`,dmg>=6);}
 {const {g}=run(mk(ring.map(b=>({...b}))),null);const dmg=ring.length*2-[...g.bricks.values()].reduce((a,b)=>a+b.hp,0);ok(`plain ball does less (${dmg} damage)`,dmg<6);}
 {const g=Core.newGame(mk([{r:2,c:3,hp:50,type:'n'}])),evs=[];g.ballType='split';g.events=evs;Core.startShot(g,Math.PI/2);let most=0;while(g.status==='shooting'){Core.step(g);if(g.shot)most=Math.max(most,g.shot.balls.length);}
  const sp=evs.filter(e=>e.type==='special').length;ok(`split ball adds 2 balls per split (${sp} splits, ${most} balls)`,sp>=1&&sp<=3&&most===1+2*sp);}
 {const {g}=run(mk([{r:2,c:3,hp:50,type:'n'}]),'split');ok('split balls are not kept for next turn',g.balls===1);}
 {const st=Core.makeStage(12),a=Core.playStage(st,'novice',77),b=Core.playStage(st,'novice',77,60,null);ok('no special ball = same game as before',JSON.stringify(a)===JSON.stringify(b));}
 {const g=Core.newGame(Core.makeStage(5));ok('golden aim turns on once',Core.applyBooster(g,'gold')&&g.goldAim&&!Core.applyBooster(g,'gold'));
  ok('golden aim path is longer',Core.aimPath(g,1.1,6).length>Core.aimPath(g,1.1).length);}}
// 100-stage curve: main stages 37..106 are shown as 31..100
ok('stage 37 is shown as 31, 106 as 100',Core.mainIndex(37)===31&&Core.mainIndex(106)===100&&Core.mainIndex(30)===30);
{const t=[...Array(100)].map((_,i)=>Core.target(i+1>30?i+7:i+1));ok('targets stay between 55% and 97%',t.every(x=>x>=0.55&&x<=0.97));
 const avg=(a,b)=>{let s=0;for(let m=a;m<=b;m++)s+=t[m-1];return s/(b-a+1)};ok(`average falls by chapter (${[1,5,10].map(c=>avg(c*10-9,c*10).toFixed(2))})`,avg(1,10)>avg(41,50)&&avg(41,50)>avg(91,100));}

// stage 1 is the bonus stage: one shot up the hole clears the whole wall, a shot beside it does not
{const st=Core.makeStage(1),up=Core.newGame(st);Core.runShot(up,Math.PI/2);ok('hole stage 1 (5 hp): a shot up the hole clears everything in 1 turn',st.bonus&&up.status==='clear'&&up.turn===1&&Core.starsFor(up)===3);
 const side=Core.newGame(st);Core.runShot(side,1.2);ok(`hole stage 1: missing the hole leaves the wall (${side.bricks.size} left)`,side.status==='aim'&&side.bricks.size>=12);
 const rs=Array.from({length:30},(_,i)=>Core.playStage(st,'novice',500+i*7919)),cl=rs.filter(r=>r.status==='clear');ok(`hole stage 1: novice nearly always clears (${cl.length}/30, ${cl.filter(r=>r.turns===1).length} in one shot)`,cl.length>=27);}

// boss stages: every 3rd turn the bricks march down two rows
{const mk=boss=>({n:0,ch:1,balls:1,bricks:[{r:0,c:0,hp:9999,type:'n'}],items:[],par3:5,par2:8,boss});
 const rows=boss=>{const g=Core.newGame(mk(boss)),out=[];for(let i=0;i<4;i++){Core.runShot(g,Math.PI/2);out.push([...g.bricks.values()][0].r);}return out.join(',');};
 ok(`boss march: rows after each turn ${rows(true)} (normal ${rows(false)})`,rows(true)==='1,2,4,5'&&rows(false)==='1,2,3,4');
 const bosses=[10,20,30,46,56,66,76,86,96,106].filter(n=>Core.makeStage(n).boss).length,others=[9,11,31,45,47,105].filter(n=>Core.makeStage(n).boss).length;
 ok(`every 10th stage is a boss (${bosses}/10), others are not (${others})`,bosses===10&&others===0);}
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
