import {createOnlineBoard} from './online-duel.mjs';

export const DAILY_MISSIONS=Object.freeze([{key:'login',reward:10},{key:'throw',reward:5},{key:'finish',reward:5}]);
export const missionDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export function validMissions(value,player){
  if(value?.player!==player||value.policy!=='daily-missions-v2-local'||!/^\d{4}-\d{2}-\d{2}$/.test(value.day)
    ||!Number.isFinite(value.serverNow)||value.serverNow<0||value.serverNow>8640000000000000||!Number.isFinite(value.resetAt)||value.resetAt<=value.serverNow||value.resetAt-value.serverNow>86400000
    ||missionDay(value.serverNow)!==value.day||value.total!==20||!Array.isArray(value.items)||value.items.length!==3)return false;
  let earned=0,claimed=0;
  for(const [index,definition]of DAILY_MISSIONS.entries()){
    const item=value.items[index];
    if(item?.key!==definition.key||item.reward!==definition.reward||typeof item.claimed!=='boolean')return false;
    if(item.claimed){
      if(item.receipt!==`mission:daily-missions-v1:${value.day}:${item.key}`||!Number.isFinite(Date.parse(item.claimedAt)))return false;
      earned+=item.reward;claimed++;
    }else if(item.receipt!==null||item.claimedAt!==null)return false;
  }
  return value.earned===earned&&value.claimed===claimed;
}

// Progress stays on this device. Only an explicit claim sends a mission request.
export function createDailyMissions({load=createOnlineBoard,onChange=()=>{},onAward=()=>{},onWallet=()=>{},
  save={read:()=>window.NcqSave.get('dailyMissionProgress'),write:value=>window.NcqSave.update(data=>{data.dailyMissionProgress=value;})},
  now=()=>performance.now()}={}){
  let owner=null,snapshot=null,receivedAt=0,value=null,status='loading',version=0,pending=null,claimingKey=null,error=null,lastWallet=null;
  const publish=()=>onChange({value,status,claiming:!!pending,error});
  const serverTime=()=>snapshot?snapshot.serverNow+Math.max(0,now()-receivedAt):null;
  function progress(day){
    const stored=save.read(),all=stored?.version===2&&stored.players&&typeof stored.players==='object'?stored.players:{};
    const old=all[owner],record={day,done:old?.day===day&&Array.isArray(old.done)?old.done.filter(key=>DAILY_MISSIONS.some(m=>m.key===key)):[],
      rounds:Array.isArray(old?.rounds)?old.rounds.filter(r=>typeof r.id==='string'&&Number.isSafeInteger(r.seq)).slice(-8):[]};
    if(!record.done.includes('login'))record.done.push('login');
    return {all,record};
  }
  function persist(all,record){
    const players=Object.fromEntries(Object.entries(all).filter(([key])=>key!==owner).slice(-7));players[owner]=record;
    const next={version:2,players};if(JSON.stringify(save.read())!==JSON.stringify(next))save.write(next);
  }
  function rebuild(){
    if(!snapshot){value=null;return;}
    const at=serverTime(),day=missionDay(at),{all,record}=progress(day);persist(all,record);
    const current=day===snapshot.day;
    const items=DAILY_MISSIONS.map((m,index)=>{
      const receipt=current?snapshot.items[index]:{claimed:false,receipt:null,claimedAt:null};
      return {...m,...receipt,complete:receipt.claimed||record.done.includes(m.key)};
    });
    value={player:owner,day,total:20,items,completed:items.filter(m=>m.complete).length,
      earned:items.reduce((sum,m)=>sum+(m.claimed?m.reward:0),0),
      available:items.reduce((sum,m)=>sum+(m.complete&&!m.claimed?m.reward:0),0)};
  }
  function observeWallet(wallet,walletStatus='ready'){
    if(!wallet){
      if(owner){version++;pending=null;claimingKey=null;owner=null;snapshot=null;value=null;lastWallet=null;}
      status=walletStatus==='error'?'error':'loading';error=null;publish();return;
    }
    if(wallet===lastWallet)return;
    if(!validMissions(wallet.missions,wallet.player)){status='error';publish();return;}
    const next=wallet.missions;
    if(owner===wallet.player&&snapshot&&next.serverNow<snapshot.serverNow)return;
    if(owner!==wallet.player){version++;pending=null;claimingKey=null;owner=wallet.player;error=null;}
    lastWallet=wallet;snapshot=structuredClone(next);receivedAt=now();status='ready';rebuild();publish();
  }
  function tick(){if(snapshot){rebuild();publish();}}
  function observeRoom(room,{initial=false}={}){
    if(!snapshot||![1,2].includes(room?.you)||!Number.isSafeInteger(room.round)||!room.code
      ||room.capacity!=null&&room.capacity!==2||room.state?.match?.pieces&&room.state.match.pieces.length!==8)return;
    const day=missionDay(serverTime()),{all,record}=progress(day),id=room.code+':'+room.round;
    let round=record.rounds.find(r=>r.id===id);
    if(!round&&room.phase==='playing'){round={id,seq:-1,manual:false,quit:false,finished:false};record.rounds.push(round);}
    if(!round||round.finished)return;
    const seq=room.state?.seq??room.version,event=room.state?.event;
    if(seq>round.seq){
      if(!initial&&event?.seat===room.you&&!event.automatic&&['opening','throw','start','move'].includes(event.type)){
        round.manual=true;
        if(['opening','throw'].includes(event.type)&&!record.done.includes('throw'))record.done.push('throw');
      }
      round.seq=seq;
    }
    if(room.phase==='finished'){
      const natural=Number.isInteger(room.state?.match?.winner);
      if(round.manual&&!round.quit&&(natural||room.winner===0||room.winner===room.you)&&!record.done.includes('finish'))record.done.push('finish');
      round.finished=true;
    }else if(room.phase==='closed')round.finished=true;
    record.rounds=record.rounds.slice(-8);persist(all,record);rebuild();publish();
  }
  function markQuit(room){
    if(!snapshot||room?.phase!=='playing')return;
    const {all,record}=progress(missionDay(serverTime())),round=record.rounds.find(r=>r.id===room.code+':'+room.round);
    if(round){round.quit=true;persist(all,record);}
  }
  function claim(key){
    if(pending)return key===claimingKey?pending:Promise.resolve(null);
    rebuild();const keys=value?.items.filter(m=>m.key===key&&m.complete&&!m.claimed).map(m=>m.key);
    if(status!=='ready'||!keys?.length)return Promise.resolve(null);
    const revision=version,player=owner,day=value.day;error=null;
    const task=(async()=>{
      try{
        const client=await load();if(revision!==version||client.player!==player)return null;
        const result=await client.board.gameRequest('/missions/claim',{day,missions:keys});
        if(revision!==version)return null;
        if(!['ok','dayChanged'].includes(result?.code)||!validMissions(result.wallet?.missions,player)||!Array.isArray(result.newAwards)
          ||result.newAwards.some(id=>!result.wallet.missions.items.some(m=>m.claimed&&m.receipt===id&&keys.includes(m.key))))throw new Error('Invalid claim');
        onWallet(result.wallet);observeWallet(result.wallet);
        if(result.code==='dayChanged'){error='dayChanged';return result;}
        if(result.wallet.missions.day!==day)throw new Error('Invalid claim day');
        const awards=result.wallet.missions.items.filter(m=>result.newAwards.includes(m.receipt));
        if(awards.length){try{Promise.resolve(onAward(awards,player)).catch(()=>{});}catch{}}
        return result;
      }catch{if(revision===version)error='claim';return null;}
    })();
    pending=task;claimingKey=key;publish();
    return task.finally(()=>{if(pending===task){pending=null;claimingKey=null;publish();}});
  }
  return {observeWallet,observeRoom,markQuit,claim,tick,get value(){return value;},get status(){return status;},
    get claiming(){return !!pending;},get claimingKey(){return claimingKey;},get error(){return error;},
    remaining:()=>snapshot?Math.max(0,Date.parse(missionDay(serverTime())+'T15:00:00Z')-serverTime()):null,
    close(){version++;owner=null;snapshot=null;value=null;pending=null;claimingKey=null;}};
}
