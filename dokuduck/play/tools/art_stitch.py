"""브라우저에서 타일로 캡처한 RGB(외곽선색 배경)·알파(흑백) 조각을 이어 붙여 투명 PNG로 복원하고,
알파 연결 요소로 스프라이트를 잘라 낸다."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi

def stitch(tiles, W, H, tile=None):
    out = Image.new('RGB', (W, H))
    for path, x, y in tiles:
        im = Image.open(path).convert('RGB')
        if tile and im.size != tuple(tile): im = im.resize(tuple(tile), Image.BICUBIC)   # 축소 캡처한 조각은 원래 크기로
        out.paste(im, (x, y))
    return out

def build(manifest, out_png):
    W, H = manifest['size']
    rgb = np.asarray(stitch(manifest['rgb'], W, H)).astype(np.float32)
    a = np.asarray(stitch(manifest['alpha'], W, H, manifest.get('tile')).convert('L')).astype(np.float32)
    lo, hi = manifest.get('levels', [18, 236])
    a = np.clip((a - lo) / (hi - lo), 0, 1)              # 캡처 잡음 제거·가장자리 선명화용 레벨 보정
    rgba = np.dstack([rgb, a * 255]).round().astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(out_png)
    return rgba

def split(rgba, min_area=1500, merge=14):
    a = rgba[..., 3] > 40
    grown = ndi.binary_dilation(a, iterations=merge)       # 떨어진 조각(눈물, 깃털)을 한 덩어리로
    lab, n = ndi.label(grown)
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = (lab[sl] == i) & a[sl]
        if m.sum() < min_area: continue
        ys, xs = np.where(m)
        y0, x0 = sl[0].start + ys.min(), sl[1].start + xs.min()
        y1, x1 = sl[0].start + ys.max() + 1, sl[1].start + xs.max() + 1
        boxes.append((x0, y0, x1, y1, i))
    return lab, boxes

if __name__ == '__main__':
    man = json.load(open(sys.argv[1])); out = sys.argv[2]
    rgba = build(man, out)
    lab, boxes = split(rgba)
    print(rgba.shape, 'sprites:', [(b[0], b[1], b[2]-b[0], b[3]-b[1]) for b in boxes])
