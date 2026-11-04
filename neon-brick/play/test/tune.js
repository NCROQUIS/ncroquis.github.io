const Core=require('./core.js');
const out={};
for(let n=1;n<=20;n++){
  let f=1.0,res;
  for(let k=0;k<12;k++){ Core.TUNE[n]={f,p:null}; res=Core.botPlay(n,80); if(res.status==='clear')break; f=+(f*0.88).toFixed(3); }
  out[n]={f,turns:res.turns,status:res.status,balls:res.balls};
  console.log(n,JSON.stringify(out[n]));
}
fs=require('fs');fs.writeFileSync(__dirname+'/tune.json',JSON.stringify(out));
