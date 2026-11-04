// Early-game tuning: stage 1 easy, stage 2 chain showcase, stage 3 slightly hard.
const Core=require('./core.js');
function play(n,f){Core.TUNE[n]={...(Core.TUNE[n]||{}),f};const s=Core.newGame(Core.makeStage(n));s.events=null;let first=null,peak=0;
  while(s.status==='aim'&&s.turn<60){const before=s.stats.breaks;Core.runShot(s,Core.botAngle(s));const d=s.stats.breaks-before;if(first===null)first=d;peak=Math.max(peak,Core.dangerRow(s));}
  return {status:s.status,turns:s.turn,first,peak,bricks:Core.makeStage(n).bricks.length};}
for(const f of [0.4,0.5,0.6,0.8,1]) console.log('S1 f',f,JSON.stringify(play(1,f)));
console.log('S2',JSON.stringify(play(2,1)));
for(const f of [1,1.2,1.4,1.6,1.8,2.0,2.2]) console.log('S3 f',f,JSON.stringify(play(3,f)));
