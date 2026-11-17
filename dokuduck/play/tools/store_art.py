"""구글플레이 아이콘(512x512)과 그래픽 이미지(1024x500)를 게임 그림으로 만들어요.
사용: python3 tools/store_art.py <출력 폴더>
글자는 넣지 않아요 (로고 그림만) — 그래서 언어마다 따로 만들 필요가 없어요."""
import sys, os, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'img')
out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)

POND, PAPER, INK, DUCK = '#DDF1EC', '#FFFBF0', '#3A2E2A', '#FFD84D'
REG = ['#F5A8C4', '#CDE36A', '#8FA3EE', '#8ECDF0', '#FFB27A', '#B9A6F0', '#7ED6C4']


def art(name):
    return Image.open(os.path.join(IMG, name + '.webp')).convert('RGBA')


def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def shadowed(base, im, xy, off=10):
    """그림 밑에 진갈색 그림자를 살짝 깔아요 (손그림 카드 느낌)."""
    a = im.split()[3].point(lambda v: 60 if v > 30 else 0)
    sh = Image.new('RGBA', im.size, INK); sh.putalpha(a)
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(4)), (xy[0], xy[1] + off))
    base.alpha_composite(im, xy)


def tiles(d, x0, y0, cell, cols, rows, seed, gap=6, alpha=255):
    rnd = random.Random(seed)
    for r in range(rows):
        for c in range(cols):
            col = REG[rnd.randrange(len(REG))]
            x, y = x0 + c * cell, y0 + r * cell
            d.rounded_rectangle([x + gap / 2, y + gap / 2, x + cell - gap / 2, y + cell - gap / 2], radius=cell * .22, fill=col)


# ---- 아이콘 512x512: 노란 바탕 + 2×2 색 칸 + 가운데 오리 (구글이 모서리를 둥글게 잘라요)
S = 512
icon = Image.new('RGBA', (S, S), DUCK)
d = ImageDraw.Draw(icon)
pad, cell = 56, 200
d.rounded_rectangle([pad - 10, pad - 10, S - pad + 10, S - pad + 10], radius=70, fill=PAPER, outline=INK, width=12)
for i, col in enumerate(['#F5A8C4', '#CDE36A', '#8FA3EE', '#8ECDF0']):
    x, y = pad + (i % 2) * cell, pad + (i // 2) * cell
    d.rounded_rectangle([x + 8, y + 8, x + cell - 8, y + cell - 8], radius=40, fill=col)
duck = fit(art('duck_hello'), 330)
shadowed(icon, duck, ((S - duck.width) // 2 + 6, (S - duck.height) // 2 + 4), off=8)
icon.convert('RGB').save(os.path.join(out, 'icon.png'))

# ---- 그래픽 1024x500: 연못색 바탕, 왼쪽 로고, 오른쪽 오리와 색 칸
W, H = 1024, 500
fg = Image.new('RGBA', (W, H), POND)
d = ImageDraw.Draw(fg)
tiles(d, 600, 40, 70, 6, 6, 7, gap=8)                                          # 오른쪽 판 느낌
veil = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(veil).rectangle([0, 0, W, H], fill=(221, 241, 236, 90))
fg.alpha_composite(veil)
d = ImageDraw.Draw(fg)
d.rounded_rectangle([585, 25, 1035, 475], radius=40, outline=INK, width=10)
logo = fit(art('logo'), 150)
logo = logo.resize((min(logo.width, 520), round(logo.height * min(logo.width, 520) / logo.width)), Image.LANCZOS)
shadowed(fg, logo, (52, (H - logo.height) // 2 - 30), off=8)
duck = fit(art('duck_joy'), 330)
shadowed(fg, duck, (700, 120), off=10)
mini = fit(art('duck_idle'), 120)
fg.alpha_composite(mini, (120, 330)); fg.alpha_composite(fit(art('duck_yo'), 120), (300, 330))
fg.convert('RGB').save(os.path.join(out, 'feature.png'))
print('ok', os.listdir(out))
