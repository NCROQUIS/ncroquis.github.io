"""복원한 시트에서 스프라이트를 이름 붙여 잘라 내고 WebP로 저장"""
import sys, json, numpy as np
from PIL import Image
sys.path.insert(0, 'tools')
from art_stitch import split

def export(sheet_png, names, cols, out_dir, pad=6, max_side=None, merge=14, min_area=1500):
    rgba = np.asarray(Image.open(sheet_png).convert('RGBA'))
    lab, boxes = split(rgba, min_area=min_area, merge=merge)
    H, W = rgba.shape[:2]
    rows = (len(names) + cols - 1) // cols
    # 칸 중심에 가장 가까운 덩어리를 그 칸의 스프라이트로 본다
    res = {}
    for k, name in enumerate(names):
        if not name: continue
        cx, cy = (k % cols + 0.5) * W / cols, (k // cols + 0.5) * H / rows
        b = min(boxes, key=lambda b: ((b[0] + b[2]) / 2 - cx) ** 2 + ((b[1] + b[3]) / 2 - cy) ** 2)
        x0, y0, x1, y1, i = b
        x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
        crop = rgba[y0:y1, x0:x1].copy()
        keep = (lab[y0:y1, x0:x1] == i)                    # 옆 칸 조각이 섞이지 않게
        crop[..., 3] = np.where(keep, crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        if max_side and max(im.size) > max_side:
            s = max_side / max(im.size); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(f'{out_dir}/{name}.webp', quality=92, method=6)
        im.save(f'{out_dir}/{name}.png')
        res[name] = im.size
    return res

if __name__ == '__main__':
    cfg = json.loads(sys.argv[1])
    print(export(**cfg))
