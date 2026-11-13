"""외곽선을 굵게: 어두운 선 픽셀을 부드럽게 넓혀 아이콘·로고와 선 굵기를 맞춘다"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
src, dst, sigma = sys.argv[1], sys.argv[2], float(sys.argv[3])
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
rgb, a = im[..., :3], im[..., 3] / 255
lum = rgb @ np.array([.299, .587, .114])
line = ((lum < 105) & (a > .5)).astype(np.float32)
g = ndi.gaussian_filter(line, sigma)
soft = np.clip((g - .2) / (.34 - .2), 0, 1)[..., None]
ink = np.array([58, 46, 42], np.float32)
out_rgb = rgb * (1 - soft) + ink * soft
out_a = np.maximum(a, soft[..., 0])
Image.fromarray(np.dstack([out_rgb, out_a * 255]).round().astype(np.uint8), 'RGBA').save(dst)
