// Native dialog navigation stays unchanged. Only confirmed open-attribute changes
// use the official NcqSound wood preset; dedicated animations have their own cues.
export const WOOD_POPUP_IDS=Object.freeze(['options','player-profile','records-dialog','watch-dialog',
  'rankings-dialog','missions','shop','coin-reward-dialog','shop-purchase-complete','coin-shortage',
  'share','record-share-dialog','record-visibility-dialog','leave-dialog','tournament-catch-up',
  'ai-rank-picker','ai-undo-dialog','together-confirm','together-result']);

export function installPopupAudio({root=globalThis.document,sound=globalThis.NcqSound,
  Observer=globalThis.MutationObserver,blocked=()=>false}={}) {
  let quietDepth=0;
  const targets=WOOD_POPUP_IDS.map(id=>root.getElementById(id));
  if(targets.some(target=>!target))throw new Error('A configured wood popup is missing.');
  const emit=records=>{
    for(const record of records){
      if(quietDepth||root.hidden||blocked())continue;
      sound?.popup(record.oldValue===null?'open':'close','wood');
    }
  };
  const observer=new Observer(emit);
  for(const target of targets)observer.observe(target,{attributes:true,attributeFilter:['open'],attributeOldValue:true});
  return {
    quiet(action){
      if(!quietDepth)emit(observer.takeRecords());
      quietDepth++;
      try{return action();}finally{emit(observer.takeRecords());quietDepth--;}
    },
    dispose(){observer.disconnect();},
  };
}
