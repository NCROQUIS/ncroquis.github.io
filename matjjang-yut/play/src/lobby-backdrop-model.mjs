export const DEFAULT_BACKDROP=Object.freeze({blur:1,white:.64});
export function normalizeBackdrop(value){
  const number=(key,min,max)=>typeof value?.[key]==='number'&&Number.isFinite(value[key])?Math.min(max,Math.max(min,value[key])):DEFAULT_BACKDROP[key];
  return{blur:Math.round(number('blur',0,12)*4)/4,white:Math.round(number('white',0,1)*100)/100};
}
export function applyBackdrop(root,value){
  const state=normalizeBackdrop(value);root.style.setProperty('--lobby-blur',state.blur+'px');root.style.setProperty('--lobby-white',state.white);
}
