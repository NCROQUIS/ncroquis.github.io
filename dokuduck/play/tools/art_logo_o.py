"""로고의 첫 번째 o(오리 얼굴 글자)만 노란 채색을 흰색으로 바꾼다. 외곽선·눈·부리는 그대로."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
rgb, a = im[..., :3].copy(), im[..., 3]
yel = (rgb[..., 0] > 200) & (rgb[..., 1] > 170) & (rgb[..., 2] < 150) & (a > 200)
lab, n = ndi.label(yel)
comps = [(ndi.center_of_mass(lab == i)[1], i, int((lab == i).sum())) for i in range(1, n + 1)]
comps = sorted(c for c in comps if c[2] > 3000)             # 글자 채색 덩어리만, 왼쪽부터
ci = comps[1][1]                                            # 두 번째 글자 = 첫 번째 o
mask = ndi.binary_fill_holes(lab == ci)                     # 눈·부리까지 포함
mask = ndi.binary_dilation(mask, iterations=4)              # 가장자리 섞인 픽셀 포함
Y = np.median(rgb[lab == ci], axis=0); K = np.array([58, 46, 42], np.float32)
org = mask & (rgb[..., 0] > 220) & (rgb[..., 1] > 110) & (rgb[..., 1] < 175) & (rgb[..., 2] < 110)
O = np.median(rgb[org], axis=0) if org.sum() > 50 else np.array([255, 152, 56], np.float32)
# 각 픽셀을 노랑·잉크·주황의 섞임으로 풀고, 노랑 자리에 흰색을 넣는다
B = np.stack([Y, K, O], axis=1)                              # 3x3
px = rgb[mask]
W = np.linalg.lstsq(np.vstack([B, np.ones((1, 3)) * 255]), np.vstack([px.T, np.ones((1, len(px))) * 255]), rcond=None)[0].T
W = np.clip(W, 0, None); W /= W.sum(axis=1, keepdims=True) + 1e-6
rgb[mask] = W @ np.stack([np.array([255, 255, 255], np.float32), K, O])
out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).round().astype(np.uint8), 'RGBA')
out = out.crop(out.getbbox()); s = 900 / out.width
out = out.resize((900, round(out.height * s)), Image.LANCZOS); out.save(dst, quality=92, method=6)
bg = Image.new('RGBA', out.size, (221, 241, 236, 255)); bg.alpha_composite(out); bg.convert('RGB').save('/tmp/dk/logo_preview.jpg', quality=90)
print('letters', len(comps), 'yellow', Y.round(), 'orange', O.round(), out.size)
