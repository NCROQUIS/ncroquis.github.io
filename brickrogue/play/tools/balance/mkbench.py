# 카드 벤치마크용 빌드: 시험 봇 빌드(bot2.html)에 대미지 계측과 __bench를 더해요
import sys
src=sys.argv[1]; dst=sys.argv[2]
s=open(src,encoding='utf8').read()
a="b.hp-=d;b.flash=1;b.hitK=1;"; assert a in s
s=s.replace(a,"if(window.__benchOn)window.__dmgTot+=Math.min(d,Math.max(0,b.hp));"+a)
i=s.rindex('})();')
s=s[:i]+r"""
// 카드 벤치마크: 정해 둔 빌드로 T웨이브를 돌려 '실제로 깎은 체력'을 재요 (방어선 무한, 카드 선택 없음)
window.__bench=function(stage,base,test,T,hx){
  window.__hx=hx;save.energy=99;newRun(stage);const me=st;
  st.startPick=false;st.pending=0;st.phase='aim';ovCards.classList.remove('show');
  st.shields=99;st.shieldBase=1e13;st.shieldMax=1e13;st.shieldHp=1e13;
  const add=(name,lv)=>{const c=BCARDS.find(q=>q.name===name);if(!c)throw new Error('no card '+name);for(let k=0;k<lv;k++){c.apply(st,c.val(1));if(c.name==='창세')genesisDo();st.picks.push({name:c.name,r:c.r,lv:1,cat:c.cat,slot:c.slot,icon:c.icon});}};
  for(const [n,l] of base)add(n,l);if(test)add(test[0],test[1]);
  window.__dmgTot=0;window.__benchOn=true;let guard=0;
  while(guard++<400000){
    if(!st||st!==me||st.phase==='over'||st.turn>T)break;
    if(ovCards.classList.contains('show')){ovCards.classList.remove('show');}
    if(st.phase==='aim'){st.shields=99;st.shieldHp=1e13;startFire(window.__aim());continue;}
    if(st.phase==='between'){st.pending=0;nextWave();continue;}
    update();
  }
  window.__benchOn=false;const r={dmg:window.__dmgTot,turn:me.turn,left:me.bricks.filter(b=>!b.dead).length,g:guard};
  if(st===me){st.phase='over';}
  return r;
};
"""+s[i:]
open(dst,'w',encoding='utf8').write(s)
