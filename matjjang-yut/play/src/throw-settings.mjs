import { t, NcqLang } from './i18n.mjs';
import { THROW_LIMITS, normalizeThrowSettings, changeThrowSetting } from './throw-motion.mjs';

export function mountThrowSettings() {
  let settings = normalizeThrowSettings(window.NcqSave.get('throwSettings'));
  if (!window.NcqSave.get('throwSettings')) window.NcqSave.update(data => { data.throwSettings = settings; });
  const body = document.querySelector('#settings-dialog .dialog-body');
  const details = document.createElement('details'); details.className = 'throw-tuning'; details.id = 'throw-tuning';
  const summary = document.createElement('summary'); details.append(summary);
  const translated = [[summary, 'throwSettings']], fields = [];
  const groups = [
    ['throwGather', null, ['gather']], ['throwLanding', 'throwLandingNote', ['landingMin', 'landingMax']],
    ['throwHeight', 'throwHeightNote', ['heightMin', 'heightMax']],
    ['throwDistance', 'throwDistanceNote', ['distanceMin', 'distanceMax']],
    ['throwSpacing', 'throwSpacingNote', ['spacingMin', 'spacingMax']],
  ];
  for (const [title, note, keys] of groups) {
    const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
    const heading = document.createElement('span'); legend.append(heading); translated.push([heading, title]);
    if (note) { const small = document.createElement('small'); legend.append(small); translated.push([small, note]); }
    const row = document.createElement('div'); row.className = 'throw-setting-fields';
    for (const key of keys) {
      const field = document.createElement('div'); field.className = 'throw-setting';
      const label = document.createElement('label'), output = document.createElement('output'), input = document.createElement('input');
      input.id = 'throw-setting-' + key; input.type = 'range'; input.dataset.throwSetting = key;
      [input.min, input.max, input.step] = THROW_LIMITS[key].map(String);
      label.htmlFor = input.id; output.htmlFor = input.id;
      translated.push([label, key.endsWith('Min') ? 'throwMinimum' : key.endsWith('Max') ? 'throwMaximum' : 'throwTime']);
      input.addEventListener('input', () => { settings = changeThrowSetting(settings, key, Number(input.value)); refresh(); });
      input.addEventListener('change', () => { window.NcqSave.update(data => { data.throwSettings = { ...settings }; }); });
      fields.push({ key, input, output }); field.append(label, output, input); row.append(field);
    }
    fieldset.append(legend, row); details.append(fieldset);
  }
  function refresh() {
    for (const [element, key] of translated) element.textContent = t(key);
    for (const { key, input, output } of fields) {
      input.value = String(settings[key]);
      const text = t(key === 'gather' || key.startsWith('landing') ? 'throwSeconds' : 'throwPercent', { n: NcqLang.num(settings[key]) });
      output.textContent = text; input.setAttribute('aria-valuetext', text);
    }
  }
  body.querySelector('.language-row').after(details);
  NcqLang.onChange(refresh);
  window.NcqSave.onChange(() => { settings = normalizeThrowSettings(window.NcqSave.get('throwSettings')); refresh(); });
  refresh();
  return { get: () => ({ ...settings }) };
}
