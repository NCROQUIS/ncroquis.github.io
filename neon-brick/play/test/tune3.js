const Core=require('./core.js');
function play(n){const s=Core.newGame(Core.makeStage(n));s.events=null;let first=null,peak=0;
  while(s.status==='aim'&&s.turn<60){const b=s.stats.breaks;Core.runShot(s,Core.botAngle(s));if(first===null)first=s.stats.breaks-b;peak=Math.max(peak,Core.dangerRow(s));}
  return {status:s.status,turns:s.turn,first,peak};}
Core.TUNE[1]={f:0.6};Core.TUNE[3]={f:1.4};
for(const n of [1,2,3]) console.log(n,JSON.stringify(play(n)));
