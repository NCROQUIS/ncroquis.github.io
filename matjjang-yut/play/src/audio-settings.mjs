import {NcqLang} from './i18n.mjs';
export function mountAudioSettings({audio,onChange=()=>{}}){
  const sound=window.NcqSound;
  // Keep the old global mute choice when music is introduced for the first time.
  if(window.NcqSave.get('audioVersion')!==1){
    if(!sound.enabled('sfx'))sound.enabled('bgm',false);
    window.NcqSave.update(data=>{data.audioVersion=1;});
  }
  const fields=[['bgm','music-setting','music-volume'],['sfx','sound-setting','effects-volume']];
  function render(){
    for(const [channel,toggle,slider]of fields){
      const on=sound.enabled(channel),input=document.getElementById(slider);
      document.getElementById(toggle).checked=on;input.value=sound.volume(channel);input.disabled=!on;
      document.getElementById(slider+'-value').value=NcqLang.num(Math.round(sound.volume(channel)*100))+'%';
    }
  }
  for(const [channel,toggle,slider]of fields){
    document.getElementById(toggle).addEventListener('change',event=>{sound.enabled(channel,event.target.checked);render();onChange();});
    document.getElementById(slider).addEventListener('input',event=>{sound.volume(channel,Number(event.target.value));render();});
    if(channel==='sfx')document.getElementById(slider).addEventListener('change',()=>audio.play('wood',{volume:.25}));
  }
  for(const link of document.querySelectorAll('[data-audio-source]')){
    if(window.NCQ?.NCQ_PLATFORM==='toss')link.removeAttribute('href');
    else{link.href=link.dataset.audioSource;link.target='_blank';link.rel='noopener';}
  }
  sound.onChange(()=>{render();onChange();});NcqLang.onChange(render);render();
  return{render};
}
