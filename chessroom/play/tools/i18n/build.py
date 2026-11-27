"""화면 글자 표 만들기: tools/i18n/<언어>.json(키 = 한국어 원문 → 번역)을 모아 texts.js를 써요.
키 목록은 keys.json (index.html의 $t('…')·$tt`…`, HTML의 한국어, lessons.js·puzzles.js의 글자). ko는 키 그대로.
쓰는 법: python3 tools/i18n/build.py  (빠진 번역은 목록으로 알려 줘요, 화면에는 영어로 나와요)"""
import json,os,re
D=os.path.dirname(os.path.abspath(__file__))
LANGS=['en','ko','id','pt-BR','es-MX','th','vi','pl','tr','ms','fr','de','es','it','ja','zh-Hans','zh-Hant']
keys=json.load(open(os.path.join(D,'keys.json')))
out={}
for L in LANGS:
    if L=='ko':out[L]={k:re.sub(r'\[[^\]]*\]$','',k) for k in keys};continue   # 키 끝의 [짧게] 같은 표시는 한국어 화면에서 빼요
    f=os.path.join(D,L+'.json')
    tab=json.load(open(f)) if os.path.exists(f) else {}
    miss=[k for k in keys if k not in tab]
    bad=[k for k in keys if k in tab and sorted(re.findall(r'\{\w+\}',k))!=sorted(re.findall(r'\{\w+\}',tab[k]))]
    if miss or bad:print(L,'빠짐',len(miss),'자리 글자 다름',len(bad),bad[:3])
    out[L]={k:tab[k] for k in keys if k in tab}
# 언어마다 파일 하나: texts/<언어>.js (index.html이 영어와 지금 언어만 불러요. 한국어는 키가 곧 글자라 파일 없음)
od=os.path.join(D,'..','..','texts');os.makedirs(od,exist_ok=True)
for f in os.listdir(od):
    if f.endswith('.js'):os.remove(os.path.join(od,f))
tot=0
for L,tab in out.items():
    if L=='ko':continue
    js='/* 화면 글자 표 ('+L+'). tools/i18n/build.py가 만들어요 — 직접 고치지 말고 tools/i18n/'+L+'.json을 고쳐요 */\n(window.TEXTS=window.TEXTS||{})['+json.dumps(L)+']='+json.dumps(tab,ensure_ascii=False,separators=(',',':'))+';\n'
    open(os.path.join(od,L+'.js'),'w').write(js);tot+=len(js.encode())
old=os.path.join(D,'..','..','texts.js')
if os.path.exists(old):os.remove(old)
print('texts/',len(out)-1,'개 파일',tot//1024,'KB (한 번에 불러오는 건 영어+한 언어)')
