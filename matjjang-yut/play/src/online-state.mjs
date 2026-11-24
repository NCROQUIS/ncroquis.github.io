import {restoreGame} from './game.mjs';
import {onlineFormat} from '../server/online-formats.mjs';

export const newerRoom=(next,previous)=>!previous||next.code!==previous.code||next.round>previous.round||next.round===previous.round&&next.version>previous.version;
const formatOf=state=>onlineFormat(state?.rulesVersion==='yut-online-multi-v1'?state.mode:'duel');
const rotation=(you,state)=>{const format=formatOf(state),slot=format?.seats[you-1];if(!slot)throw Error('unsupportedRoom');return {format,team:slot.team};};
const rotated=(team,own,count)=>(team-own+count)%count;
export function pieceForSeat(id,you,state=null){
  const {format,team}=rotation(you,state);
  return rotated(Math.floor(id/4),team,format.sizes.length)*4+id%4;
}
export function serverPieceId(id,room){
  const {format,team}=rotation(room.you,room.state);
  return (Math.floor(id/4)+team)%format.sizes.length*4+id%4;
}
export function orientMatch(match,you,state=null){
  const game=structuredClone(match),{format,team}=rotation(you,state),count=format.sizes.length;
  if(team===0)return game;
  const player=n=>rotated(n,team,count),piece=id=>pieceForSeat(id,you,state);
  game.active=player(game.active);
  if(game.winner!==null)game.winner=player(game.winner);
  if(game.teams)game.teams=Array.from({length:count},(_,i)=>game.teams[(i+team)%count]);
  game.pieces=game.pieces.map(p=>({...p,id:piece(p.id),player:player(p.player)})).sort((a,b)=>a.id-b.id);
  if(game.opening){game.opening.rolls=Array.from({length:count},(_,i)=>game.opening.rolls[(i+team)%count]);if(game.opening.winner!==null)game.opening.winner=player(game.opening.winner);}
  if(game.lastThrow)game.lastThrow.player=player(game.lastThrow.player);
  if(game.lastMove)game.lastMove={...game.lastMove,player:player(game.lastMove.player),ids:game.lastMove.ids.map(piece),captured:game.lastMove.captured.map(piece)};
  return game;
}
export function projectRoom(room,seats=[]){
  const state=room?.state,format=formatOf(state),multi=state?.rulesVersion==='yut-online-multi-v1';
  if(!format||!Number.isSafeInteger(room?.you)||room.you<1||room.you>format.capacity
    ||!Number.isSafeInteger(room.round)||!Number.isSafeInteger(room.version)
    ||!['yut-online-v1','yut-online-v2','yut-online-multi-v1'].includes(state?.rulesVersion))throw Error('unsupportedRoom');
  if(room.phase==='finished'&&(!Number.isInteger(room.winner)||room.winner<0||room.winner>format.capacity)&&!(multi&&room.done))throw Error('unsupportedRoom');
  const match=restoreGame(state.match);
  if(!match||match.pieces.length!==format.sizes.length*4||match.teams?.some((team,i)=>team.size!==format.sizes[i]))throw Error('unsupportedRoom');
  if(multi&&(room.capacity!==format.capacity||!Array.isArray(state.seats)||state.seats.length!==format.capacity
    ||!state.seats.every((slot,i)=>slot.team===format.seats[i].team&&slot.member===format.seats[i].member)))throw Error('unsupportedRoom');
  const own=format.seats[room.you-1].team,player=n=>rotated(n,own,format.sizes.length),piece=id=>pieceForSeat(id,room.you,state);
  const game=orientMatch(match,room.you,state);
  const source=Array.isArray(seats)?seats:seats?.seats??seats?.players??[],list=Array.isArray(source)?source:Object.values(source);
  const profile=seat=>{
    const member=list.find(value=>value.seat===seat||value.position===seat)??list[seat-1];
    return member?{nickname:typeof member.nickname==='string'?member.nickname.slice(0,40):null,avatar:member.avatar??member.photoUrl??null,bot:member.bot===true}:null;
  };
  game.onlinePlayers=Array.from({length:format.sizes.length},(_,team)=>{
    const serverTeam=(team+own)%format.sizes.length;
    const members=format.seats.flatMap((slot,i)=>slot.team===serverTeam?[profile(i+1)]:[]);
    return multi?{members}:members[0];
  });
  if(room.phase==='finished'){
    game.onlineDraw=multi?room.results?.[room.you-1]==='draw':room.winner===0;
    game.winner=game.onlineDraw?0:multi?(match.winner===null?0:player(match.winner)):player(room.winner-1);
    game.opening=null;game.pending=[];game.throws=0;
  }
  let event=state.event?structuredClone(state.event):null;
  if(event){
    event.player=player(format.seats[event.seat-1].team);
    if(event.roll?.player!==undefined)event.roll.player=player(event.roll.player);
    if(event.plan){event.plan.player=player(event.plan.player);event.plan.pieceId=piece(event.plan.pieceId);for(const key of ['stackIds','captured'])event.plan[key]=event.plan[key].map(piece);}
  }
  return {game,event};
}
