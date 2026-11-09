"""Collect every Korean UI text in src/v3 (JS string/template literals + HTML text/attributes) into tools/i18n/ko.json.
Templates become keys with {0}, {1}… in place of ${…}. Comments are skipped. Used to keep src/v3/i18n.js complete:
  python3 tools/i18n/extract.py && node tools/i18n/check.js"""
import json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[2]
HAN = re.compile(r'[가-힣]')
out = {}
def add(s, where):
    s = s.strip()
    if s and HAN.search(s): out.setdefault(s, where)

def scan_js(src, where):
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i): i = src.find('\n', i); i = n if i < 0 else i; continue
        if src.startswith('/*', i): j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"':
            j = i + 1; buf = []
            while j < n and src[j] != c:
                if src[j] == '\\': buf.append(src[j:j + 2]); j += 2; continue
                if src[j] == '\n': break
                buf.append(src[j]); j += 1
            lit = ''.join(buf)
            if '<' in lit and '>' in lit: scan_html_fragment(lit, where)
            else: add(lit.replace("\\'", "'").replace('\\"', '"'), where)
            i = j + 1; continue
        if c == '`':
            i = scan_tpl(src, i + 1, where); continue
        i += 1

def scan_tpl(src, i, where):
    """i is just after the opening backtick; returns index after the closing one."""
    parts, cur, exprs, n = [], [], [], len(src)
    while i < n:
        c = src[i]
        if c == '\\': cur.append(src[i:i + 2]); i += 2; continue
        if c == '`': break
        if src.startswith('${', i):
            depth, j = 1, i + 2
            while j < n and depth:
                if src[j] == '`': j = scan_tpl(src, j + 1, where); continue
                if src[j] in '\'"':
                    q = src[j]; j += 1
                    while j < n and src[j] != q: j += 2 if src[j] == '\\' else 1
                    j += 1; continue
                if src[j] == '{': depth += 1
                elif src[j] == '}': depth -= 1
                j += 1
            expr = src[i + 2:j - 1]; scan_js(expr, where)
            cur.append('{%d}' % len(exprs)); exprs.append(expr); i = j; continue
        cur.append(c); i += 1
    t = ''.join(cur)
    if '<' in t and '>' in t: scan_html_fragment(t, where)
    else: add(t, where)
    return i + 1

def scan_html_fragment(h, where):
    # text between tags, and attribute values (aria-label, title, placeholder, data-sub)
    for m in re.finditer(r'>([^<>]+)<', '>' + h + '<'): 
        txt = m.group(1)
        if HAN.search(txt): add(re.sub(r'\{\d+\}', lambda x: x.group(0), txt), where)
    for m in re.finditer(r'(?:aria-label|title|placeholder|data-sub)="([^"]*)"', h): add(m.group(1), where)

def scan_html(src, where):
    # split out <script> and <style>
    pos = 0
    for m in re.finditer(r'<script[^>]*>(.*?)</script>|<style[^>]*>.*?</style>', src, re.S):
        scan_html_fragment(src[pos:m.start()], where)
        if m.group(1): scan_js(m.group(1), where)
        pos = m.end()
    scan_html_fragment(src[pos:], where)

for f in ['src/v3/engine.js', 'src/v3/run.js', 'src/v3/art.js']: scan_js((ROOT / f).read_text(encoding='utf-8'), f)
scan_html((ROOT / 'src/v3/index.src.html').read_text(encoding='utf-8'), 'index.src.html')
keys = sorted(out, key=lambda k: (out[k], k))
(ROOT / 'tools/i18n/ko.json').write_text(json.dumps({k: out[k] for k in keys}, ensure_ascii=False, indent=0), encoding='utf-8')
print(len(keys), 'strings')
