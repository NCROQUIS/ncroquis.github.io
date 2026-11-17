"""시트를 칸(행×열)으로 나눠 그림마다 여백을 잘라 내고 줄여서 저장한다.

쓰기: python3 tools/art_cells.py <sheet.png> <out_dir> <cols> <rows> <이름:최대변,...>
예:   python3 tools/art_cells.py tier.png assets/img 2 2 duck_hard:440,duck_super:440,head_hard:200,head_super:200
(이름은 왼쪽 위부터 오른쪽으로, 줄 순서대로. 투명한 곳의 색이 가장자리로 번지지 않게 색에 투명도를 곱한 채로 줄인다.)
"""
import sys
import numpy as np
from PIL import Image

src, out_dir, cols, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
names = [x.split(':') for x in sys.argv[5].split(',')]
sheet = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
H, W = sheet.shape[:2]
ch, cw = H // rows, W // cols
PAD = 6


def shrink(x, size):
    a = x[..., 3:] / 255
    planes = np.dsplit(np.dstack([x[..., :3] * a, x[..., 3:]]), 4)
    ch_ = [np.asarray(Image.fromarray(np.ascontiguousarray(c[..., 0]).astype(np.float32), 'F').resize(size, Image.LANCZOS)) for c in planes]
    al = np.clip(ch_[3], 0, 255)
    rgb = [np.clip(c / np.maximum(al / 255, 1e-3), 0, 255) for c in ch_[:3]]
    return Image.fromarray(np.dstack(rgb + [al]).round().astype(np.uint8), 'RGBA')


for k, (name, side) in enumerate(names):
    r, c = divmod(k, cols)
    cell = sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
    ys, xs = np.where(cell[..., 3] > 24)
    y0, y1, x0, x1 = max(0, ys.min() - PAD), min(ch, ys.max() + 1 + PAD), max(0, xs.min() - PAD), min(cw, xs.max() + 1 + PAD)
    cut = cell[y0:y1, x0:x1]
    h, w = cut.shape[:2]
    s = int(side) / max(h, w)
    size = (max(1, round(w * s)), max(1, round(h * s)))
    shrink(cut, size).save('%s/%s.webp' % (out_dir, name), quality=92, method=6)
    print(name, (w, h), '->', size)
