const format=(key,sizes)=>Object.freeze({key,sizes:Object.freeze(sizes),capacity:sizes.reduce((a,b)=>a+b,0),
  seats:Object.freeze(Array.from({length:Math.max(...sizes)},(_,member)=>sizes.flatMap((size,team)=>member<size?[Object.freeze({team,member})]:[])).flat())});
export const ONLINE_FORMATS=Object.freeze({duel:format('duel',[1,1]),teams:format('teams',[2,2]),three:format('three',[1,1,1])});
export const onlineFormat=key=>Object.hasOwn(ONLINE_FORMATS,key)?ONLINE_FORMATS[key]:null;
export function currentSeat(match,seats){
  const member=match.teams?.[match.active]?.member??0;
  return seats.findIndex(slot=>slot.team===match.active&&slot.member===member)+1;
}
