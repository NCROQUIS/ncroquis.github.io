// Bakes test/wide-*.json results into the WIDE table in index.html
const fs = require("fs"), path = require("path");
const dir = __dirname, file = path.join(dir, "..", "index.html");
const all = {};
for (const f of fs.readdirSync(dir).filter(f => /^wide-\d+\.json$/.test(f)))
  Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const keys = Object.keys(all).map(Number).sort((a, b) => a - b);
const body = keys.map(n => `${n}:{seed:${all[n].seed},f:${all[n].f},p:[${all[n].p}]}`).join(",");
let html = fs.readFileSync(file, "utf8");
const re = /const WIDE = \{[^;]*\};/;
if (!re.test(html)) throw new Error("WIDE table not found");
html = html.replace(re, `const WIDE = {${body}};`);
fs.writeFileSync(file, html);
console.log("baked", keys.join(","));
for (const n of keys) console.log(n, all[n].kind, "Q", all[n].Q, "R", all[n].R, "skill", all[n].skill, "clear", all[n].clearR);
