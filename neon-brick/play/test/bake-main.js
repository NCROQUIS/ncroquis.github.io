// Bakes test/main-*.json (from test/build-main.js) into TUNE (1-20), CH3 (21-30) and MAIN (37-106) in index.html.
// Re-tuned stages keep their layout: TUNE/CH3 only get a new hp factor f and new star pars p.
const fs = require("fs"), path = require("path");
const dir = __dirname, file = path.join(dir, "..", "index.html");
const all = {};
for (const f of fs.readdirSync(dir).filter(f => /^main-[a-z0-9]+\.json$/.test(f)))
  Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
let html = fs.readFileSync(file, "utf8");
const table = name => { const m = html.match(new RegExp(`const ${name} = (\\{[^;]*\\});`)); if (!m) throw new Error(name + " not found"); return Function(`return ${m[1]}`)(); };
const put = (name, obj) => {
  const body = Object.keys(obj).map(Number).sort((a, b) => a - b).map(n => `${n}:{${Object.entries(obj[n]).map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v}]` : v}`).join(",")}}`).join(",");
  html = html.replace(new RegExp(`const ${name} = \\{[^;]*\\};`), `const ${name} = {${body}};`);
};
const TUNE = table("TUNE"), CH3 = table("CH3"), MAIN = table("MAIN");
for (const [k, r] of Object.entries(all)) {
  const n = +k;
  if (n <= 20) TUNE[n] = { f: r.f, p: r.p };
  else if (n <= 30) CH3[n] = { seed: CH3[n].seed, f: r.f, p: r.p };
  else MAIN[n] = { seed: r.seed, f: r.f, p: r.p };
}
put("TUNE", TUNE); put("CH3", CH3); put("MAIN", MAIN);
fs.writeFileSync(file, html);
const keys = Object.keys(all).map(Number).sort((a, b) => a - b);
console.log("baked", keys.length, "stages");
for (const n of keys) { const r = all[n]; console.log(n, r.style || "", "tgt", r.tgt, "clear", r.clearR, "fun R", r.R, r.R >= 90 ? "" : "(<90)"); }
