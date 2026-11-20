// The shared SDK owns on/off and volume. Retain the old preference as a backup.
export function migrateEffectsSettings({sound=globalThis.NcqSound,storage=globalThis.localStorage}={}) {
  if(!sound)return;
  try {
    const key='matjjangomok.audio.v1';
    if(storage.getItem(key))return;
    if(storage.getItem('matjjangomok.stoneSound')==='off')sound.enabled('sfx',false);
    storage.setItem(key,'migrated');
  } catch { /* Storage-disabled sessions can still change their current settings. */ }
}
