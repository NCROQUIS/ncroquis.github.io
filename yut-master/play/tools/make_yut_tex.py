#!/usr/bin/env python3
"""윷 꾸미기 그림을 파일로 바로 연 화면(file://)에서도 보이게 만드는 도구.
assets/skins/yut/<id>/ 의 back·belly·backdo·end.png 를 글자(data URI)로 담아 같은 폴더에 tex.js 로 저장해요.
윷 그림을 고치거나 새 윷 폴더를 넣은 뒤 한 번 실행하세요:  python3 tools/make_yut_tex.py
(서버로 연 화면·출시 빌드는 png를 그대로 써서 이 파일이 없어도 돼요)"""
import base64, json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
base = os.path.join(root, 'assets', 'skins', 'yut')
n = 0
for d in sorted(os.listdir(base)):
    p = os.path.join(base, d)
    if not os.path.isdir(p): continue
    m = {}
    for f in ('back.png', 'belly.png', 'backdo.png', 'end.png'):
        fp = os.path.join(p, f)
        if os.path.exists(fp):
            m[f] = 'data:image/png;base64,' + base64.b64encode(open(fp, 'rb').read()).decode()
    if not m: continue
    key = 'assets/skins/yut/%s/' % d
    js = '/* 자동 생성: tools/make_yut_tex.py — 직접 고치지 마세요 */\n(window.YUT_SKIN_TEX=window.YUT_SKIN_TEX||{})[%s]=%s;\n' % (json.dumps(key), json.dumps(m))
    open(os.path.join(p, 'tex.js'), 'w', encoding='utf-8').write(js)
    print('만들었어요:', key + 'tex.js', '(%d장)' % len(m)); n += 1
print('완료: 윷 %d종' % n)
