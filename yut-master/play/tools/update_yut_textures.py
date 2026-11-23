#!/usr/bin/env python3
"""assets/yut/*.png 를 assets/yut/textures.js 사본으로 다시 만들어요.
파일로 바로 연 화면(file://)은 브라우저가 PNG를 막아서 이 사본을 쓰기 때문에,
윷 그림(PNG)을 바꾼 뒤에는 이걸 한 번 실행해야 바로 보여요. (웹 공개·앱 빌드는 PNG를 바로 읽어요)
실행: python3 tools/update_yut_textures.py"""
import base64, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'assets', 'yut')
NAMES = ['back.png', 'belly.png', 'belly_backdo.png', 'end.png', 'select.png']
lines = ["/* 파일로 바로 연 화면(file://)에서도 윷 그림이 보이게, assets/yut/ 그림을 글자로 담아 둔 사본이에요.",
         "   웹 공개·앱 빌드에서는 assets/yut/*.png를 바로 읽고, 이 사본은 그걸 못 읽을 때만 써요.",
         "   assets/yut/ 그림을 바꾸면 tools/update_yut_textures.py 로 다시 만들어요. */",
         "window.YUT_TEXTURES = {"]
for n in NAMES:
    p = os.path.join(D, n)
    if not os.path.exists(p):
        continue
    b = base64.b64encode(open(p, 'rb').read()).decode()
    lines.append(f'  "{n}": "data:image/png;base64,{b}",')
lines.append("};")
open(os.path.join(D, 'textures.js'), 'w').write("\n".join(lines) + "\n")
print("✓ assets/yut/textures.js 를 새 그림으로 다시 만들었어요")
