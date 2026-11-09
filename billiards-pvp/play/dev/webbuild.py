# dev/의 아티팩트 빌드(billiards.html)를 레포 루트 index.html로 바꿔요. 라이브러리·글꼴은 vendor/에서 불러요.
import re,sys,shutil,os
src,np,root=sys.argv[1:4]
s=open(src,encoding='utf8').read()
s=re.sub(r'<link rel="preconnect"[^>]*>\n?','',s)
s=re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>\n?','',s)
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','vendor/three.min.js')
s=s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
s=re.sub(r'<title>.*?</title>\n?','',s,1)
assert 'cdnjs' not in s and 'fonts.g' not in s
used=set(ord(c) for c in s if ord(c)>32)
def inter(r):
    for p in r.split(','):
        p=p.strip().replace('U+','')
        a,_,b=p.partition('-');a=int(a,16);b=int(b,16) if b else a
        if any(a<=c<=b for c in used) : return True
    return False
faces=[];os.makedirs(root+'/vendor/fonts',exist_ok=True)
for pkg,ws in (('noto-sans-kr',(400,500,700)),('black-han-sans',(400,)),('barlow-condensed',(500,600,700))):
    for w in ws:
        css=open(f'{np}/@fontsource/{pkg}/{w}.css',encoding='utf8').read()
        for m in re.finditer(r'@font-face\s*\{(.*?)\}',css,re.S):
            f=m.group(1);ur=re.search(r'unicode-range:\s*([^;]+);',f)
            if not inter(ur.group(1)):continue
            u=re.search(r'url\(\.?/?files/([^)]+\.woff2)\)',f).group(1)
            shutil.copy(f'{np}/@fontsource/{pkg}/files/{u}',f'{root}/vendor/fonts/{u}')
            fam=re.search(r"font-family:\s*'([^']+)'",f).group(1)
            faces.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-display:swap;font-weight:{w};src:url(vendor/fonts/{u}) format('woff2');unicode-range:{ur.group(1)}}}")
shutil.copy(f'{np}/three/build/three.min.js',root+'/vendor/three.min.js')
head='''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>당구 : PVP 3구 4구 포켓볼</title>
<script src="ncq/safe.js"></script>
<style>
'''+'\n'.join(faces)+'''
html,body{margin:0;height:100dvh}
html,body{padding:0}
body{box-sizing:border-box;padding:var(--ncq-top) var(--ncq-right) var(--ncq-bottom) var(--ncq-left)}
</style>
</head>
<body>
'''
open(root+'/index.html','w',encoding='utf8').write(head+s+'\n</body>\n</html>\n')
print('faces',len(faces))
