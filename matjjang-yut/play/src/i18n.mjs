import { NcqLang } from '../ncq/lang.js';
import { TEXTS, LANGUAGES } from './texts.mjs';
import { THROW_TEXTS } from './throw-texts.mjs';
import { MOVE_TEXTS } from './move-texts.mjs';
import { QUIT_TEXTS } from './quit-texts.mjs';
for (const language of LANGUAGES) Object.assign(TEXTS[language], THROW_TEXTS[language], MOVE_TEXTS[language], QUIT_TEXTS[language]);
NcqLang.init({ id: 'matjjang-yut', texts: TEXTS });
export const t = (key, params) => NcqLang.t(key, params);
export { NcqLang, LANGUAGES };
