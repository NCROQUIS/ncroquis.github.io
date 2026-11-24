import {normalizeAppearance,sameAppearance,appearanceRecord,isCharacterSkin,SKIN_LOOKS} from './skin-model.mjs';
const root=new URL('../assets/skins/',import.meta.url);
export function createSkinService(storage=window.NcqSave){
  let applied=normalizeAppearance(storage.get('appearance')),catalog=null,catalogRequest=null;
  const images=new Map(),inflight=new Map(),listeners=new Set();
  const emit=()=>{for(const listener of listeners)listener();};
  function loadCatalog(){
    if(catalog)return Promise.resolve(catalog);
    if(!catalogRequest)catalogRequest=fetch(new URL('catalog.json',root)).then(r=>{if(!r.ok)throw Error('skin-catalog');return r.json();}).then(data=>{
      if(data.schemaVersion!==1||!Array.isArray(data.themes))throw Error('skin-catalog');
      catalog=new Map(data.themes.map(theme=>[theme.id,theme]));return catalog;
    }).catch(error=>{catalogRequest=null;throw error;});
    return catalogRequest;
  }
  function load(id,name){
    if(id==='default')return Promise.resolve(null);
    const key=id+':'+name;
    if(images.has(key))return Promise.resolve(images.get(key));
    if(!inflight.has(key))inflight.set(key,loadCatalog().then(async()=>{
      const record=catalog.get(id)?.assets[name];
      if(!record||typeof record.file!=='string'||!record.file.startsWith(id+'/')||record.file.includes('..'))throw Error('skin-asset');
      const image=new Image();image.src=new URL(record.file,root).href;await image.decode();images.set(key,image);return image;
    }).finally(()=>inflight.delete(key)));
    return inflight.get(key);
  }
  async function ensure(selection){
    const next=normalizeAppearance(selection);
    await Promise.all([load(next.board,'board'),load(next.sticks,'stick-flat'),load(next.sticks,'stick-round'),
      ...['blue','red','green','purple'].map(color=>load(next.pieces,'piece-'+color))]);
    return next;
  }
  function sprite(player,id=applied.pieces){
    if(id==='default')return null;
    const name='piece-'+['blue','red','green','purple'][player],image=images.get(id+':'+name),info=catalog?.get(id)?.assets[name];
    return image&&info?{image,info,id,character:isCharacterSkin(id)}:null;
  }
  storage.onChange(()=>{
    const next=normalizeAppearance(storage.get('appearance'));
    if(!sameAppearance(next,applied)){applied=next;ensure(next).then(emit).catch(()=>emit());emit();}
  });
  const service={
    get:()=>({...applied}),look:id=>SKIN_LOOKS[id]||SKIN_LOOKS.default,record:id=>catalog?.get(id)||null,
    image:(id,name)=>images.get(id+':'+name)||null,sprite,ensure,load,
    catalog:()=>loadCatalog(),
    url:(id,name)=>{const file=catalog?.get(id)?.assets[name]?.file;return file?new URL(file,root).href:'';},
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async apply(selection,isCurrent=()=>true){
      const next=await ensure(selection);if(!isCurrent())return false;
      const previous={...applied};
      const result=storage.update(data=>{data.appearance=appearanceRecord(next);});
      if(result===false||!sameAppearance(normalizeAppearance(storage.get('appearance')),next)){
        storage.update(data=>{data.appearance=appearanceRecord(previous);});
        applied=previous;emit();throw Error('skin-save');
      }
      applied=next;emit();return true;
    }
  };
  service.ready=ensure(applied).then(()=>{emit();return true;}).catch(()=>false);
  return service;
}
