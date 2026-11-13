"""기본·'여어' 2프레임 시트(좌: 기본, 우: 날개 든 것)를 게임용 조각으로 나눈다.

- 두 프레임을 같은 크기의 판에 같은 자리로 맞춘다 (겹치면 날개만 다르다).
- 날개 둘레가 아닌 곳은 기본 프레임 픽셀을 그대로 써서 바뀔 때 떨리지 않게 한다.
- 머리와 몸을 목에서 나누고, 얼굴(눈·부리·볼터치)과 머리 깃털도 따로 떼어 낸다. 게임에서 눈 깜빡임·고개 도리도리·갸우뚱·깃털 흔들림을 이 조각만 움직여 만든다 (몸은 가만히).

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
A, B2, keep, Mc = crop(A), crop(B2), crop(np.dstack([keep] * 4).astype(np.float32))[..., 0] > .5, crop(np.dstack([M[..., 0]] * 4))[..., 0]
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

# 4) 머리 깃털(꼬불 한 가닥)도 따로 뗀다: 흰 몸에서 윤곽선 두께보다 멀리 솟은 부분이 깃털
yy, xx = np.mgrid[0:h, 0:w]
cxh, eye_px = w / 2, np.mean([p[3] for p in parts['eyes']])
inner = ndi.binary_closing(ndi.binary_fill_holes(solid & (mn >= 232)), iterations=14)      # 깃털 뿌리가 파고든 자리는 메운다
dist = ndi.distance_transform_edt(~inner)
side = (al > 128) & ~inner & (yy < eye_px - 40) & (np.abs(xx - cxh) > 95) & (np.abs(xx - cxh) < 210)
thick = float(np.percentile(dist[side], 99)) + .5                                             # 윤곽선 두께
headbox = (yy < eye_px) & (np.abs(xx - cxh) < 150)
core = headbox & (al > 128) & (dist > thick + 4)
lab_h, nh = ndi.label(core)
core = lab_h == (1 + int(np.argmax(ndi.sum(core, lab_h, range(1, nh + 1)))))                 # 가장 큰 덩어리만
near = ndi.binary_dilation(core, iterations=7)
above = np.clip(dist - thick, 0, 1) * near                                                    # 1이면 깃털, 0이면 몸
hair_a = al * above
# 뿌리: 깃털이 닿은 자리의 윤곽선도 조금 같이 가져가서, 흔들려도 틈이 보이지 않게 한다
root = ndi.binary_dilation(core, iterations=15) & solid & (mn < 110) & (dist > thick - 17) & (dist <= thick + 1) & headbox
root_a = np.minimum(ndi.gaussian_filter(root.astype(np.float32), 1.0) * 255, al)
hair = np.dstack([rgb, np.maximum(hair_a, root_a)])
jy, jx = np.where(core & (dist < thick + 9))
pivot = (float(jx.mean()), float(jy.mean()) + thick * .55)
hx0, hx1 = int(np.where(core.any(0))[0].min()), int(np.where(core.any(0))[0].max())
def nohair(x):
    out = x.copy(); out[..., 3] = out[..., 3] * (1 - above); return out

# 5) 머리와 몸을 목에서 나눈다 (게임에서 갸우뚱할 때 머리만 기울이려고)
#    머리는 달걀 모양을 끝까지 이어 그려 몸 '뒤'에 두고, 몸은 목 아래 원래 그림 그대로 그 위에 얹는다.
#    평소에는 이어 그린 부분이 몸에 가려 원래 그림과 똑같고, 머리가 기울어도 목에서 선이 끊기지 않는다.
sil = al > 128
roww = sil.sum(1)
r0, r1 = int(eye_px + 30), int(h * .62)
yc = r0 + int(np.argmin(roww[r0:r1]))                        # 실루엣이 가장 잘록한 줄 = 목
cols = np.where(sil[yc])[0]; xL, xR = int(cols.min()), int(cols.max()) + 1
x0 = (xL + xR) / 2
INK = np.array([58, 46, 42], np.float32)
head_src = nohair(blank(A))
pts = []
for y in range(int(eye_px - 30), yc - 8):                    # 뺨~목 위 윤곽으로 타원을 맞춘다
    c_ = np.where(head_src[y, :, 3] > 128)[0]
    pts += [(c_.min(), y), (c_.max() + 1, y)]
P = np.array(pts, np.float64)
kA, kB, kC, kD = np.linalg.lstsq(np.c_[P[:, 0] ** 2, P[:, 1] ** 2, P[:, 0], P[:, 1]], np.ones(len(P)), rcond=None)[0]
ex, ey = -kC / (2 * kA), -kD / (2 * kB)
rhs = 1 + kA * ex ** 2 + kB * ey ** 2
ea, eb = float(np.sqrt(rhs / kA)), float(np.sqrt(rhs / kB))
edist = (1 - np.sqrt(((xx - ex) / ea) ** 2 + ((yy - ey) / eb) ** 2)) * min(ea, eb)
low = (yy >= yc - 3)
o_a, i_a = np.clip(edist + .5, 0, 1) * low, np.clip(edist - thick + .5, 0, 1) * low
lower = np.dstack([INK[None, None, :] * (1 - i_a[..., None]) + white[None, None, :] * i_a[..., None], o_a * 255])
def over(top, bottom):
    ta, ba = top[..., 3:] / 255, bottom[..., 3:] / 255
    oa = ta + ba * (1 - ta)
    return np.dstack([(top[..., :3] * ta + bottom[..., :3] * ba * (1 - ta)) / np.maximum(oa, 1e-3), oa * 255])
upper = (yy < yc)[..., None]
head = over(np.where(upper, head_src, 0), lower)
def body_of(x): return np.where(upper, 0, x)
body, body_wave = body_of(blank(A)), body_of(blank(B2))
# 든 날개는 목 위(뺨 옆)까지 올라온다. 그 윗부분은 몸 조각에 함께 넣어 머리 위에 그려지게 한다.
body_wave[..., 3] = np.where(upper[..., 0], B2[..., 3] * (Mc > .002), body_wave[..., 3])
body_wave[..., :3] = np.where(upper, B2[..., :3], body_wave[..., :3])
leak = int(((lower[..., 3] > 128) & (body[..., 3] < 128) & (yy >= yc)).sum())   # 평소에 이어 그린 머리가 몸 밖으로 비치는 픽셀
pivot_head = (x0, float(yc))

outs = {'duck_idle': A, 'duck_yo': B2, 'duck_body': body, 'duck_wave': body_wave, 'duck_head': head, 'duck_hair': hair,
        'duck_eyes': layers['eyes'], 'duck_beak': layers['beak'], 'duck_blush': layers['blush']}
s = OUT_H / h
size = (round(w * s), OUT_H)
def shrink(x):
    """투명한 곳의 색이 가장자리로 번지지 않게, 색에 투명도를 곱한 채로 줄인 뒤 되돌린다"""
    a = x[..., 3:] / 255
    ch = [np.asarray(Image.fromarray(np.ascontiguousarray(c[..., 0]).astype(np.float32), 'F').resize(size, Image.LANCZOS)) for c in np.dsplit(np.dstack([x[..., :3] * a, x[..., 3:]]), 4)]
    al_ = np.clip(ch[3], 0, 255)
    rgb_ = [np.clip(c / np.maximum(al_ / 255, 1e-3), 0, 255) for c in ch[:3]]
    return Image.fromarray(np.dstack(rgb_ + [al_]).round().astype(np.uint8), 'RGBA')
for name, x in outs.items():
    im = shrink(x)
    im.save('%s/%s.webp' % (out_dir, name), lossless=True, quality=100, method=6)   # 무손실: 두 프레임이 날개 밖에서 완전히 같아야 한다
eye_y = np.mean([p[3] for p in parts['eyes']]) / h * 100
# 게임에서는 정사각형 칸 가운데에 높이를 맞춰 그리므로, 가로 위치는 칸 기준 %로 바꿔 알려 준다
hair_x = 50 + (pivot[0] / w - .5) * (w / h) * 100
print(json.dumps({'size': size, 'eye_y_pct': round(eye_y, 1), 'body_w_pct': round((ax1 - ax0) / w * 100, 1),
                  'hair_cols': [int(hx0), int(hx1)], 'hair_pivot_pct': [round(hair_x, 1), round(pivot[1] / h * 100, 1)],
                  'neck_row': yc, 'neck_x': [xL, xR], 'head_ellipse': [round(ex), round(ey), round(ea), round(eb)], 'leak_px': leak,
                  'head_pivot_pct': [round(50 + (pivot_head[0] / w - .5) * (w / h) * 100, 1), round(pivot_head[1] / h * 100, 1)]}))
