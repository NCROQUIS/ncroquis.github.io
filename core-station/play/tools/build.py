"""Build: index.html (the game, repo root) <- src/index.src.html + engine.js + art.js (no bundler).
   build/preview.html and build/sian_preview.html (art direction page) are test wrappers for the automated tests (not committed)."""
import json, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
rd = lambda p: (ROOT / p).read_text(encoding="utf-8")
HEAD = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
        '<script src="ncq-flags.js" onerror="void 0"></script></head><body>')
HEAD_SAFE = HEAD.replace("<head>", '<head><script src="ncq/safe.js"></script>', 1)  # NcqSafe first in <head> (company guide); the game keeps its UI inside the safe area itself (.app, --st/--sb)
def page(src, **parts):
    s = rd(src)
    for k, v in parts.items(): s = s.replace(f"/*{k}*/", v)
    return s
def en_table():  # src/lang/en.txt: "Korean ||| English" per line, # comments
    t = {}
    for line in rd("src/lang/en.txt").splitlines():
        if "|||" in line and not line.lstrip().startswith("#"):
            k, v = line.split("|||", 1); t[k.strip()] = v.strip()
    return t
I18N = "<script>" + rd("src/i18n.js").replace("/*EN_TABLE*/{}", json.dumps(en_table(), ensure_ascii=False)) + "</script>"
parts = dict(ENGINE=rd("src/engine.js"), ART=rd("src/art.js"))
game, art = I18N + page("src/index.src.html", **parts), page("src/sian.src.html", **parts)
(ROOT / "index.html").write_text(HEAD_SAFE + game + "</body></html>", encoding="utf-8")
(ROOT / "build").mkdir(exist_ok=True)
no_flags = lambda h: h.replace('<script src="ncq-flags.js" onerror="void 0"></script>', '').replace('src="ncq/safe.js"', 'src="../ncq/safe.js"')
(ROOT / "build" / "preview.html").write_text(no_flags(HEAD_SAFE) + game + "</body></html>", encoding="utf-8")
(ROOT / "build" / "sian_preview.html").write_text(no_flags(HEAD) + art + "</body></html>", encoding="utf-8")
shutil.copytree(ROOT / "assets", ROOT / "build" / "assets", dirs_exist_ok=True)  # previews need assets/ beside them, like the real page
print("built index.html")
