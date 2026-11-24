import { restoreGame } from './game.mjs';

export const newerRoom = (next, previous) => !previous || next.code !== previous.code || next.round > previous.round || next.round === previous.round && next.version > previous.version;
export const pieceForSeat = (id, you) => you === 2 ? (id + 4) % 8 : id;
const playerForSeat = (player, you) => you === 2 ? 1-player : player;
export function orientMatch(match, you) {
  const game=structuredClone(match);
  if (you !== 2) return game;
  game.active=1-game.active;
  if (game.winner !== null) game.winner=1-game.winner;
  game.teams?.reverse();
  game.pieces=game.pieces.map(piece=>({...piece,id:pieceForSeat(piece.id,you),player:1-piece.player})).sort((a,b)=>a.id-b.id);
  if (game.opening) { game.opening.rolls.reverse(); if(game.opening.winner !== null)game.opening.winner=1-game.opening.winner; }
  if (game.lastThrow) game.lastThrow.player=1-game.lastThrow.player;
  if (game.lastMove) game.lastMove={...game.lastMove,player:1-game.lastMove.player,ids:game.lastMove.ids.map(id=>pieceForSeat(id,you)),captured:game.lastMove.captured.map(id=>pieceForSeat(id,you))};
  return game;
}
export function projectRoom(room, seats=[]) {
  if (![1,2].includes(room?.you) || !Number.isSafeInteger(room.round) || !Number.isSafeInteger(room.version) || !['yut-online-v1','yut-online-v2'].includes(room.state?.rulesVersion)) throw new Error('unsupportedRoom');
  if(room.phase==='finished'&&![0,1,2].includes(room.winner))throw new Error('unsupportedRoom');
  const match=restoreGame(room.state.match);
  if (!match || match.pieces.length !== 8 || match.teams?.some(team=>team.size!==1)) throw new Error('unsupportedRoom');
  const game=orientMatch(match,room.you);
  const players=Array.isArray(seats)?seats:seats.seats??seats.players??[];
  const list=Array.isArray(players)?players:Object.values(players);
  game.onlinePlayers=[0,1].map(player=>{
    const seat=playerForSeat(player,room.you)+1;
    const source=list.find(value=>value.seat===seat || value.position===seat)??list[seat-1];
    return source?{nickname:typeof source.nickname==='string'?source.nickname.slice(0,40):null,avatar:source.avatar??source.photoUrl??null,bot:source.bot===true}:null;
  });
  if (room.phase==='finished') {
    game.winner=room.winner===0?0:playerForSeat(room.winner-1,room.you);
    game.onlineDraw=room.winner===0;game.opening=null;game.pending=[];game.throws=0;
  }
  let event=room.state.event?structuredClone(room.state.event):null;
  if(event){
    event.player=playerForSeat(event.seat-1,room.you);
    if(event.roll?.player!==undefined)event.roll.player=playerForSeat(event.roll.player,room.you);
    if(event.plan){event.plan.player=playerForSeat(event.plan.player,room.you);event.plan.pieceId=pieceForSeat(event.plan.pieceId,room.you);for(const field of ['stackIds','captured'])event.plan[field]=event.plan[field].map(id=>pieceForSeat(id,room.you));}
  }
  return {game,event};
}
