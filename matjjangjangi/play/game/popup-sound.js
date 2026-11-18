// Apply the shared wood preset only to the game-owned UI surfaces approved by
// the user. Shared feedback/share overlays keep the SDK's default policy.
export const WOOD_POPUP_IDS = Object.freeze([
  'options','player-profile','records-dialog','watch-dialog','rankings-dialog',
  'daily-puzzle','missions','shop','coin-reward-dialog','shop-purchase-complete','coin-shortage',
  'share','record-share-dialog','record-visibility-dialog','leave-dialog','tournament-catch-up',
  'bikjang-confirm','jangi-formation','together-formation','together-confirm','together-result',
  'tg-actions-1','tg-actions-2',
]);
export const QUIET_POPUP_IDS = Object.freeze(['matchmaking','match-intro','result','rank-celebration','rule-dialog']);
let policy=null, quietDepth=0;

export function installPopupSoundPolicy({popup=globalThis.NcqPopup, root=globalThis.document}={}) {
  popup.sound(false);
  const targets=WOOD_POPUP_IDS.map(id=>root.getElementById(id));
  if(targets.some(node=>!node))throw new Error('A configured wood popup is missing.');
  for(const node of targets)popup.register(node,{sound:'wood'});
  for(const id of QUIET_POPUP_IDS){const node=root.getElementById(id);if(node)popup.register(node,{sound:false});}
  policy={popup,targets};
}

// Only synchronous UI transitions belong in this scope: the shared SDK emits
// its sound at the actual show/close call. Async responses retain their leases.
export function quietPopupSounds(action) {
  if(!policy)return action();
  const {popup,targets}=policy;
  if(quietDepth++===0)for(const node of targets)popup.register(node,{sound:false});
  try {return action();}
  finally {if(--quietDepth===0)for(const node of targets)popup.register(node,{sound:'wood'});}
}

export function closePopupQuietly(element,value) {
  if(element?.open)return quietPopupSounds(()=>element.close(value));
}
