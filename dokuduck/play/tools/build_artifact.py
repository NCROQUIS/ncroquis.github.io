"""레포의 게임을 파일 하나(HTML)로 묶는다 — claude.ai 아티팩트 미리보기용.
사용: python3 tools/build_artifact.py [출력 경로]   (기본: dist/artifact.html, dist/는 커밋하지 않아요)"""
import base64, json, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
html = rd('index.html')
html = html.replace('<script src="ncq/safe.js"></script>\n', '')
html = html.replace('<link rel="stylesheet" href="css/fonts.css">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Jua&family=Gaegu:wght@700&display=swap" rel="stylesheet">')
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + rd('css/style.css') + '\n</style>')
art = {}
for m in re.finditer(r"(\w+): 'assets/img/([^']+)'", rd('js/art.js')):
    art[m.group(1)] = 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(root, 'assets/img', m.group(2)), 'rb').read()).decode()
html = html.replace('<script src="js/art.js"></script>', '<script>window.DOKU_ART=' + json.dumps(art, separators=(',', ':')) + ';window.NCQ_TEST_CHEAT=true;</script>')
for f in ('js/bank.js', 'js/engine.js', 'js/game.js'):
    tag = '<script src="%s"></script>' % f
    assert tag in html, f
    html = html.replace(tag, '<script>' + rd(f) + '</script>')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'artifact.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print(out, len(html.encode()), 'bytes')
