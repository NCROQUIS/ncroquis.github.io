// lists Korean UI texts (tools/i18n/ko.json, from extract.py) that have no line in src/lang/en.txt
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../..');
const ko = JSON.parse(fs.readFileSync(path.join(R, 'tools/i18n/ko.json'), 'utf8'));
const have = new Set(fs.readFileSync(path.join(R, 'src/lang/en.txt'), 'utf8').split('\n').filter(l => l.includes('|||') && !l.trim().startsWith('#')).map(l => l.split('|||')[0].trim()));
const miss = Object.keys(ko).filter(k => !have.has(k));
for (const k of miss) console.log(ko[k] + '\t' + k);
console.log(`${Object.keys(ko).length - miss.length}/${Object.keys(ko).length} translated, ${miss.length} missing`);
