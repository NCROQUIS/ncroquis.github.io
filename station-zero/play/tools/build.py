"""Build the playable pages from src/ (no bundler needed).
   index.html      ← src/v3 (roguelike defense, main line)
   v2/index.html   ← src/v2 (idle defense, kept for comparison)
   v2/art.html     ← src/v2/sian.src.html (art direction page)
   Test wrappers (preview*.html with a mobile viewport) go to build/ for the automated tests."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
rd = lambda p: (ROOT / p).read_text(encoding="utf-8")
HEAD = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
        '<script src="ncq-flags.js" onerror="void 0"></script></head><body>')
def page(src, **parts):
    s = rd(src)
    for k, v in parts.items(): s = s.replace(f"/*{k}*/", v)
    return s
import json
def en_table():  # src/v3/lang/en.txt: "Korean ||| English" per line, # comments
    t = {}
    for line in rd("src/v3/lang/en.txt").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "|||" not in line: continue
        k, v = line.split("|||", 1); k, v = k.strip(), v.strip()
        if k: t[k] = v if not line.split("|||", 1)[1].startswith(" ,") else v
    return t
I18N = rd("src/v3/i18n.js").replace("/*EN_TABLE*/{}", json.dumps(en_table(), ensure_ascii=False))
v3 = page("src/v3/index.src.html", I18N=I18N, ENGINE=rd("src/v3/engine.js"), RUN=rd("src/v3/run.js"), ART=rd("src/v3/art.js"))
v2 = page("src/v2/index.src.html", ENGINE=rd("src/v2/engine.js"), ART=rd("src/v2/art.js"))
art = page("src/v2/sian.src.html", ENGINE=rd("src/v2/engine.js"), ART=rd("src/v2/art.js"))
(ROOT / "v2").mkdir(exist_ok=True); (ROOT / "build").mkdir(exist_ok=True)
HEAD3 = HEAD.replace(":root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}", "").replace("<head>", '<head><script src="ncq/safe.js"></script>', 1)  # NcqSafe first in <head> (company guide)  # v3 keeps its UI inside the safe area itself (.app, --st/--sb)
(ROOT / "index.html").write_text(HEAD3 + v3 + "</body></html>", encoding="utf-8")
(ROOT / "v2" / "index.html").write_text(HEAD3.replace('src="ncq-flags.js"', 'src="../ncq-flags.js"').replace('src="ncq/safe.js"', 'src="../ncq/safe.js"') + v2 + "</body></html>", encoding="utf-8")  # v2 also keeps its UI inside the safe area itself
(ROOT / "v2" / "art.html").write_text(HEAD.replace('<script src="ncq-flags.js" onerror="void 0"></script>', '') + art + "</body></html>", encoding="utf-8")
for name, body in [("preview.html", v3), ("preview_v2.html", v2), ("sian_preview.html", art)]:
    (ROOT / "build" / name).write_text((HEAD if body is art else HEAD3).replace('<script src="ncq-flags.js" onerror="void 0"></script>', '').replace('src="ncq/safe.js"', 'src="../ncq/safe.js"') + body + "</body></html>", encoding="utf-8")
import shutil  # previews in build/ need the same relative asset paths as the real page
if (ROOT / "assets").exists(): shutil.copytree(ROOT / "assets", ROOT / "build" / "assets", dirs_exist_ok=True)
if (ROOT / "ops.json").exists(): shutil.copy(ROOT / "ops.json", ROOT / "build" / "ops.json")  # live-ops data (events, attendance)
print("built index.html, v2/index.html, v2/art.html")
