"""채팅 안에서 바로 해 볼 수 있는 한 파일짜리 페이지 만들기 (src/*.js 모듈을 하나로 묶어요).
실행: python3 tools/bundle-page.py <출력 파일.html>
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
IMP_NAMED = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'\./([\w-]+)\.js';")
IMP_STAR = re.compile(r"import\s*\*\s*as\s*(\w+)\s*from\s*'\./([\w-]+)\.js';")
EXP = re.compile(r"^export (async function|function|const|let) (\w+)", re.M)

def load(name, seen, order):
    if name in seen:
        return
    seen.add(name)
    src = open(os.path.join(SRC, name + '.js'), encoding='utf-8').read()
    for m in IMP_NAMED.finditer(src):
        load(m.group(2), seen, order)
    for m in IMP_STAR.finditer(src):
        load(m.group(2), seen, order)
    order.append((name, src))

def ns(name):
    return 'M_' + name.replace('-', '_')

def transform(name, src):
    def named(m):
        parts = []
        for p in m.group(1).split(','):
            p = p.strip()
            if not p:
                continue
            a, _, b = p.partition(' as ')
            parts.append(f"{a.strip()}: {b.strip()}" if b else a.strip())
        return f"const {{ {', '.join(parts)} }} = {ns(m.group(2))};"
    src = IMP_NAMED.sub(named, src)
    src = IMP_STAR.sub(lambda m: f"const {m.group(1)} = {ns(m.group(2))};", src)
    exports = [m.group(2) for m in EXP.finditer(src)]
    src = EXP.sub(lambda m: f"{m.group(1)} {m.group(2)}", src)
    return f"const {ns(name)} = (() => {{\n{src}\nreturn {{ {', '.join(exports)} }};\n}})();\n"

def main(out):
    order = []
    load('main', set(), order)
    js = '\n'.join(transform(n, s) for n, s in order)
    css = open(os.path.join(ROOT, 'styles.css'), encoding='utf-8').read()
    # 채팅 미리보기는 테마를 data-theme로도 바꿀 수 있어서 다크 모드 블록을 두 번 써요
    for sel in [r':root', r'\.sheet']:
        m = re.search(r'@media \(prefers-color-scheme: dark\) \{\s*' + sel + r' \{([\s\S]*?)\}\s*\}', css)
        if m:
            plain = sel.replace('\\', '')
            css = css.replace(m.group(0), '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])' + ('' if plain == ':root' else ' ' + plain) + ' {' + m.group(1) + '} }\n:root[data-theme="dark"]' + ('' if plain == ':root' else ' ' + plain) + ' {' + m.group(1) + '}')
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    body = html.split('<body>')[1].split('<script')[0]
    extra = '#app{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}'
    page = (f'<title>포켓 솔리테어</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="theme-color" content="#2f8a5b">\n'
            f'<style>{css}\n{extra}</style>\n{body}\n<script type="module">{js}</script>\n')
    open(out, 'w', encoding='utf-8').write(page)
    print('ok', len(page))

if __name__ == '__main__':
    main(sys.argv[1])
