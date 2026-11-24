import { newerRoom } from './online-state.mjs';

const error = code => Object.assign(new Error(code),{code});
let authLoading;
export async function getOnlineAuth() {
  if (globalThis.NcqAuth) return globalThis.NcqAuth;
  // The public account API accepts published web origins, not a local dev server.
  if (/^https?:$/.test(location.protocol) && ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) throw error('onlineUnavailable');
  if (!authLoading) authLoading=(async()=>{
    const response=await fetch(new URL('../ncq/auth-config.json',import.meta.url));
    if(!response.ok)throw error('onlineUnavailable');
    const config=await response.json();
    if(config.enabled!==true||config.game!=='matjjang-yut'||config.environment!=='prod')throw error('onlineUnavailable');
    globalThis.NCQ={...globalThis.NCQ,NCQ_AUTH:config};
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL('../ncq/auth.js',import.meta.url).href;
      script.onload=resolve;script.onerror=()=>reject(error('onlineUnavailable'));document.head.append(script);
    });
    if(!globalThis.NcqAuth)throw error('onlineUnavailable');return globalThis.NcqAuth;
  })().catch(e=>{authLoading=null;throw e;});
  return authLoading;
}
export async function createOnlineBoard() {
  const auth=await getOnlineAuth(),identity=await auth.ready();
  const response=await fetch(new URL('../ncq/board-config.json',import.meta.url));
  if(!response.ok)throw error('onlineUnavailable');const config=await response.json();
  if(config.enabled===false||!config.apiUrl)throw error('onlineUnavailable');
  const {NcqBoard}=await import('../ncq/board.js');
  const getToken=options=>globalThis.NcqAuth.getToken({...options,expectedPlayer:identity.player});
  const primary=NcqBoard.create({apiUrl:config.apiUrl,profiles:auth,getToken});
  const economy=NcqBoard.create({apiUrl:config.apiUrl.replace(/\/$/,'')+'-economy',profiles:false,getToken});
  // Match/realtime stay on the shared Board. Wallet reads use our authenticated extension.
  const board={...primary,gameRequest:(path,...args)=>(path==='/wallet'?economy:primary).gameRequest(path,...args)};
  return {auth,player:identity.player,board};
}

export function createOnlineDuel({load=createOnlineBoard,onRoom=()=>{},onStatus=()=>{},onError=()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let client,loading,room=null,seats=[],connection=null,epoch=0,matching=false,writing=false,status='idle',ticket=null,unsubscribe;
  const emit=value=>{status=value;onStatus(value);};
  function accept(next,initial=false) {
    if(!next||!newerRoom(next,room))return;
    const previous=room;room=structuredClone(next);onRoom(room,{initial,previous,seats});
  }
  async function prepare(){
    if(client)return client;
    const loaded=await (loading??=load().finally(()=>{loading=null;}));if(client)return client;client=loaded;
    unsubscribe?.();unsubscribe=loaded.auth?.onChange?.(profile=>{
      if(profile.player!==loaded.player){epoch++;matching=false;connection?.close();connection=null;room=null;client=null;emit('identityChanged');onError(error('identity_changed'));}
    });
    return loaded;
  }
  async function start(){
    if(matching||room?.phase==='playing')return room;
    const generation=++epoch;matching=true;ticket=null;room=null;seats=[];connection?.close();connection=null;emit('matching');
    let service;
    try {
      service=await prepare();if(generation!==epoch)return null;
      // Profile mirroring preserves the common account nickname; it never invents an opponent.
      await service.board.profile();if(generation!==epoch)return null;
      const wallet=await service.board.gameRequest('/wallet',undefined,-1);
      if(generation!==epoch)return null;
      if(wallet.player!==service.player||!Number.isSafeInteger(wallet.coins)||wallet.coins<0)throw error('network');
      if(!wallet.canEnter&&!wallet.activeMatch)throw error('coinNotEnough');
      while(generation===epoch){
        const result=await service.board.match({queue:'duel',...(ticket?{ticket}:{})});
        if(generation!==epoch){if(result.ticket)await service.board.cancel(result.ticket).catch(onError);return null;}
        ticket=result.ticket??ticket;
        if(result.game){
          try{seats=await service.board.seats(result.game.code);}catch(e){onError(e);}
          if(generation!==epoch)return null;
          matching=false;ticket=null;
          accept(result.game,true);emit('connecting');
          connection=service.board.subscribeRoom(result.game.code,{initialState:result.game,
            onState:next=>{if(generation===epoch)accept(next);},
            onStatus:value=>{if(generation!==epoch)return;emit(value);
              if(value==='connected'&&service.board.gameRequest)void service.board.gameRequest(`/rooms/${result.game.code}/presence`,{}).catch(e=>{if(generation===epoch)onError(e);});},
            onError:e=>{if(generation===epoch)onError(e);}});
          return room;
        }
        await wait(1000);
      }
      return null;
    }catch(e){
      // A concurrent server debit can fail after the preflight; never replace it with a local balance.
      if(generation===epoch&&service&&e.code!=='coinNotEnough'){
        const funds=await service.board.gameRequest('/wallet',undefined,-1).catch(()=>null);
        if(funds?.player===service.player&&funds.coins<10&&!funds.activeMatch)e=error('coinNotEnough');
      }
      if(generation===epoch){matching=false;emit('error');onError(e);}throw e;
    }
  }
  async function cancel(){
    if(!matching)return;
    epoch++;matching=false;const pending=ticket;ticket=null;emit('idle');
    if(pending&&client)await client.board.cancel(pending);
  }
  async function send(action){
    if(!room||status!=='connected'||writing||room.phase!=='playing'||room.turn!==room.you)throw error('wrongTurn');
    const generation=epoch,current=room;writing=true;onStatus(status);connection.beginWrite();
    let next;
    try{next=await client.board.move(current.code,{version:current.version,round:current.round,action});if(generation===epoch){accept(next);connection?.endWrite(next);}return next;}
    catch(e){if(generation===epoch){onError(e);await connection?.sync().catch(()=>{});}throw e;}
    finally{if(generation===epoch){if(!next)connection?.endWrite();writing=false;onStatus(status);}}
  }
  async function leave(){
    if(!room){await cancel();return;}
    if(writing)throw error('busy');
    const generation=epoch,current=room;writing=true;onStatus(status);
    try{await client.board.leave(current.code);if(generation===epoch){epoch++;connection?.close();connection=null;room=null;writing=false;emit('idle');}}
    catch(e){if(generation===epoch){writing=false;onStatus(status);onError(e);}throw e;}
  }
  function close(){epoch++;matching=false;writing=false;room=null;connection?.close();connection=null;unsubscribe?.();unsubscribe=null;client=null;emit('idle');}
  return {start,cancel,send,leave,close,sync:()=>connection?.sync(),get room(){return room;},get matching(){return matching;},get writing(){return writing;},get status(){return status;},canAct:()=>!!room&&room.phase==='playing'&&room.turn===room.you&&status==='connected'&&!writing};
}
