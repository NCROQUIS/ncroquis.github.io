import {NcqLang} from './i18n.mjs';
import {DEFAULT_BACKDROP,normalizeBackdrop,applyBackdrop} from './lobby-backdrop-model.mjs';
export function mountLobbyBackdrop(){
  const save=window.NcqSave,root=document.documentElement;
  // Apply the newly approved preset once; subsequent slider choices persist.
  if(save.get('lobbyBackdropPreset')!==2)save.update(data=>{data.lobbyBackdrop={...DEFAULT_BACKDROP};data.lobbyBackdropPreset=2;});
  const read=()=>normalizeBackdrop(save.get('lobbyBackdrop'));
  function render(){
    const value=read();applyBackdrop(root,value);
    for(const key of ['blur','white']){
      document.getElementById('lobby-'+key).value=value[key];
      document.getElementById('lobby-'+key+'-value').value=NcqLang.num(key==='white'?Math.round(value[key]*100):value[key])+(key==='white'?'%':'px');
    }
  }
  for(const key of ['blur','white'])document.getElementById('lobby-'+key).addEventListener('input',event=>{
    const value=normalizeBackdrop({...read(),[key]:Number(event.target.value)});save.update(data=>{data.lobbyBackdrop=value;});render();
  });
  document.getElementById('reset-lobby-backdrop').addEventListener('click',()=>{save.update(data=>{data.lobbyBackdrop={...DEFAULT_BACKDROP};});render();});
  save.onChange(render);NcqLang.onChange(render);render();
}
