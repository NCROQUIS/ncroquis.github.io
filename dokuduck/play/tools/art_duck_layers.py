"""기본·'여어' 2프레임 시트(좌: 기본, 우: 날개 든 것)를 게임용 조각으로 나눈다.

- 두 프레임을 같은 크기의 판에 같은 자리로 맞춘다 (겹치면 날개만 다르다).
- 날개 둘레가 아닌 곳은 기본 프레임 픽셀을 그대로 써서 바뀔 때 떨리지 않게 한다.
- 얼굴(눈·부리·볼터치)을 따로 떼어 낸다. 게임에서 눈 깜빡임·고개 도리도리를 몸은 가만히 둔 채 얼굴만 움직여 만든다.

쓰기: python3 tools/art_duck_layers.py <sheet.png> <out_dir> [높이=440]
"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, out_dir = sys.argv[1], sys.argv[2]
OUT_H = int(sys.argv[3]) if len(sys.argv) > 3 else 440
PAD = 8

sheet = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
H, W = sheet.shape[:2]
A, B = sheet[:, :W // 2], sheet[:, W // 2:]

def premul(x): return np.dstack([x[..., :3] * x[..., 3:] / 255, x[..., 3]])
def unpremul(x):
    a = np.maximum(x[..., 3:], 1e-3)
    return np.dstack([np.clip(x[..., :3] * 255 / a, 0, 255), x[..., 3]])

# 1) 날개 둘레 마스크: 두 프레임이 뚜렷이 다른 곳만
pa, pb = premul(A), premul(B)
diff = np.abs(pa - pb).max(axis=2) > 46
lab, n = ndi.label(diff, structure=np.ones((3, 3)))
if n:
    area = ndi.sum(diff, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(area) if s >= 80])
else:
    keep = diff
keep = ndi.binary_closing(ndi.binary_dilation(keep, iterations=9), iterations=6)
keep = ndi.binary_fill_holes(keep)
M = np.clip(ndi.gaussian_filter(keep.astype(np.float32), 1.6) * 1.15, 0, 1)[..., None]
B2 = np.where(M > .002, unpremul(pa * (1 - M) + pb * M), A)          # 날개 둘레 밖은 기본 프레임 픽셀 그대로
ys, xs = np.where(keep)
print('wing region x %d..%d y %d..%d  (%.1f%% of frame)' % (xs.min(), xs.max(), ys.min(), ys.max(), keep.mean() * 100))

# 2) 같은 크기 판: 기본 몸통을 가운데에 두고, 든 날개가 들어갈 만큼 양옆을 같게 넓힌다
def bbox(x):
    ys, xs = np.where(x[..., 3] > 24); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
ax0, ay0, ax1, ay1 = bbox(A); bx0, by0, bx1, by1 = bbox(B2)
cx = (ax0 + ax1) / 2
hw = max(cx - min(ax0, bx0), max(ax1, bx1) - cx)
x0, x1 = int(round(cx - hw)) - PAD, int(round(cx + hw)) + PAD
y0, y1 = min(ay0, by0) - PAD, max(ay1, by1) + PAD
def crop(x):
    out = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
    sx0, sx1, sy0, sy1 = max(0, x0), min(x.shape[1], x1), max(0, y0), min(x.shape[0], y1)
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = x[sy0:sy1, sx0:sx1]
    return out
A, B2, keep = crop(A), crop(B2), crop(np.dstack([keep] * 4).astype(np.float32))[..., 0] > .5
h, w = A.shape[:2]

# 3) 얼굴 조각 찾기: 흰 몸 안에 따로 떨어져 있는 색 덩어리 (윤곽선에 붙은 것은 몸)
rgb, al = A[..., :3], A[..., 3]
mn = rgb.min(axis=2)
solid = al > 200
ink = solid & (mn < 232)
lab, n = ndi.label(ink, structure=np.ones((3, 3)))
sizes = ndi.sum(ink, lab, range(1, n + 1))
body_id = int(np.argmax(sizes)) + 1
parts = {'eyes': [], 'beak': [], 'blush': []}
for i in range(1, n + 1):
    if i == body_id or sizes[i - 1] < 60: continue
    m = lab == i
    ys, xs = np.where(m)
    if ys.mean() > h * .52: continue                      # 아래쪽 덩어리(팔 선)는 몸에 둔다
    r, g, b = [rgb[..., k][m].mean() for k in range(3)]
    orange = ((rgb[..., 0] > 200) & (rgb[..., 2] < 120) & m).sum()
    kind = 'beak' if orange > 40 else 'blush' if (r > 200 and b > 120) else 'eyes'
    parts[kind].append((i, int(sizes[i - 1]), round(float(xs.mean())), round(float(ys.mean()))))
print({k: [(a, x, y) for _, a, x, y in v] for k, v in parts.items()})
assert len(parts['eyes']) == 2 and len(parts['beak']) == 1 and len(parts['blush']) == 2, '얼굴 조각 수가 예상과 달라요'

def layer(ids):
    m = np.isin(lab, ids)
    grow = ndi.binary_dilation(m, iterations=4) & solid
    core = np.percentile(mn[m], 60)
    a = np.clip((255 - mn) / max(1, 255 - core), 0, 1) * grow
    a = np.where(ndi.binary_erosion(m, iterations=2), 1, a)          # 안쪽은 꽉 채움
    col = np.clip((rgb - (1 - a[..., None]) * 255) / np.maximum(a[..., None], 1e-3), 0, 255)
    return np.dstack([col, a * 255]), grow

layers, erase = {}, np.zeros((h, w), bool)
for k, v in parts.items():
    layers[k], g = layer([p[0] for p in v]); erase |= g
assert not (erase & keep).any(), '얼굴과 날개 둘레가 겹쳐요'

white = np.median(rgb[solid & (mn >= 232) & (np.arange(h)[:, None] < h * .5)], axis=0)   # 머리의 흰색 그대로 메운다
def blank(x):
    out = x.copy(); out[..., :3] = np.where(erase[..., None], white, out[..., :3]); return out

outs = {'duck_idle': A, 'duck_yo': B2, 'duck_body': blank(A), 'duck_wave': blank(B2),
        'duck_eyes': layers['eyes'], 'duck_beak': layers['beak'], 'duck_blush': layers['blush']}
s = OUT_H / h
size = (round(w * s), OUT_H)
for name, x in outs.items():
    im = Image.fromarray(x.round().astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
    im.save('%s/%s.webp' % (out_dir, name), lossless=True, quality=100, method=6)   # 무손실: 두 프레임이 날개 밖에서 완전히 같아야 한다
eye_y = np.mean([p[3] for p in parts['eyes']]) / h * 100
print(json.dumps({'size': size, 'eye_y_pct': round(eye_y, 1), 'body_w_pct': round((ax1 - ax0) / w * 100, 1)}))
