import fs from 'fs';import path from 'path';import {pathToFileURL} from 'url';
const dir=path.dirname(new URL(import.meta.url).pathname),rd=f=>fs.readFileSync(path.join(dir,f),'utf8');
const m=await import(pathToFileURL(path.join(dir,'stages.js')).href+'?t='+Date.now());
const js=o=>JSON.stringify(o).replace(/"(\w+)":/g,'$1:');
const merge=(hand,g)=>{let gen=[];try{gen=JSON.parse(rd(`gen_${g}.json`));}catch(e){}
  const c={};hand.forEach(x=>{c[x.name]=1;});
  return hand.concat(gen.sort((a,b)=>b.rate-a.rate).map(x=>{const {rate,robust,...y}=x;c[y.name]=(c[y.name]||0)+1;return Object.assign(y,{name:`${y.name} ${c[y.name]}`});}));};
const ALL={'4b':merge(m.STAGES_4B,'4b'),'3c':merge(m.STAGES_3C,'3c'),pool:merge(m.STAGES_POOL,'pool')};
let rules=rd('src/rules.js').replace('/*STAGES_4B*/[]',()=>js(ALL['4b'])).replace('/*STAGES_3C*/[]',()=>js(ALL['3c'])).replace('/*STAGES_POOL*/[]',()=>js(ALL.pool));
let sol={};try{sol=JSON.parse(rd('solutions.json'));}catch(e){}
rules=rules.replace('/*SOL*/{}/*END_SOL*/',js(sol));
const hitB64=fs.readFileSync(path.join(dir,'audio/hit.wav')).toString('base64');
const main=['src/core.js'].map(rd).join('')+rules+['src/ai.js','src/game.js','src/net.js','src/ui.js'].map(rd).join('');
const out0=rd('src/head.html')+'\n'+rd('src/body.html')+'<script>\n'+main+'</script>\n';
const out=out0.replace('/*HIT_WAV*/',hitB64);
fs.mkdirSync(path.join(dir,'dist'),{recursive:true});fs.writeFileSync(path.join(dir,'dist/index.html'),out);
fs.writeFileSync(path.join(dir,'dist/billiards.html'),out.replace('/*__TEST_HOOK__*/\n',''));
console.log('built',out.length);
