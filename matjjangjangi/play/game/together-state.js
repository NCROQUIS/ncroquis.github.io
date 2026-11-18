import {initial,apply} from './rules.js';

// A local round never calls the online wallet, matchmaking or record APIs.
export function createTogetherRound({choFormation,hanFormation}) {
  let state=initial({choFormation,hanFormation});
  const entries=[],undos={1:3,2:3};
  const lastOwn=side=>entries.findLastIndex(e=>e.side===side&&e.action.type!=='resign');
  return {
    rulesVersion:'together-v1',
    get state(){return state;},get actions(){return entries.map(e=>({...e.action,side:e.side}));},
    get moves(){return entries.filter(e=>e.action.type==='move').map(e=>e.action);},
    formations:[choFormation,hanFormation],
    remaining:side=>undos[side]??0,
    canUndo:side=>state.winner===null&&undos[side]>0&&lastOwn(side)>=0,
    preview:action=>apply(state,action),
    play(action){const next=apply(state,action);entries.push({side:state.turn,action:{...action},before:state});state=next;return state;},
    undo(side){if(state.winner!==null||!(undos[side]>0))return false;const at=lastOwn(side);if(at<0)return false;
      state=entries[at].before;entries.splice(at);undos[side]--;return true;},
  };
}
