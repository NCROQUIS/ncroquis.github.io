import { NcqLang } from '../ncq/lang.js';
import { TEXTS, LANGUAGES } from './texts.mjs';
NcqLang.init({ id: 'matjjang-yut', texts: TEXTS });
export const t = (key, params) => NcqLang.t(key, params);
export { NcqLang, LANGUAGES };
