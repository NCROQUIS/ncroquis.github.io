# Builds store / Toss console images from the real game (release mode: no test buttons) and the key-art page.
# python3 test/store-images.py  → release/googleplay/images/, release/toss/images/
import asyncio, pathlib
from playwright.async_api import async_playwright
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
GP, TS = ROOT / "release/googleplay/images", ROOT / "release/toss/images"
GAME = (ROOT / "index.html").as_uri() + "?release=1"
ART = (ROOT / "test/store-art.html").as_uri()

def flat(path):  # stores reject transparency
    im = Image.open(path).convert("RGB"); im.save(path, optimize=True)

async def art(b, kind, w, h, out):
    pg = await b.new_page(locale="ko-KR", viewport={"width": w, "height": h})
    await pg.goto(f"{ART}?kind={kind}&w={w}&h={h}"); await pg.wait_for_function("document.title === 'done'")
    await pg.locator("canvas").screenshot(path=str(out)); await pg.close(); flat(out)

async def scenes(b, vw, vh, dpr, prefix, outdir, size=None):
    pg = await b.new_page(locale="ko-KR", viewport={"width": vw, "height": vh}, device_scale_factor=dpr)
    await pg.goto(GAME); await pg.wait_for_timeout(600); await pg.evaluate("document.fonts.ready")
    await pg.evaluate("""() => { const p = NBQ.progress; for (let n = 1; n <= 14; n++) p.stars[n] = n % 4 === 0 ? 2 : 3; p.stars[31] = 3; }""")
    shots = []
    async def snap(name):
        f = outdir / f"{prefix}{name}.png"; await pg.screenshot(path=str(f))
        if size: Image.open(f).resize(size, Image.LANCZOS).save(f)
        flat(f); shots.append(f.name)
    # 1. aiming on a 13-column wide board, aim line visible
    await pg.evaluate("NBQ.startStage(36)"); await pg.wait_for_timeout(1600)
    await pg.mouse.move(vw / 2, vh * .72); await pg.mouse.down(); await pg.mouse.move(vw * .28, vh * .42, steps=8); await pg.wait_for_timeout(250)
    await snap("1-aim")
    await pg.mouse.up(); await pg.wait_for_timeout(900)
    # 2. big chain on stage 2 (many balls in flight)
    await pg.evaluate("NBQ.startStage(2)"); await pg.wait_for_timeout(1400)
    await pg.evaluate("NBQ.Core.startShot(NBQ.state, NBQ.Core.botAngle(NBQ.state))"); await pg.wait_for_timeout(1500)
    await snap("2-combo")
    # 3. three-star clear with the dancers
    await pg.evaluate("NBQ.startStage(9)"); await pg.wait_for_timeout(600); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(5200)
    await snap("3-clear")
    # 4. stage map
    await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(500)
    await snap("4-map")
    await pg.close(); return shots

async def main():
    GP.mkdir(parents=True, exist_ok=True); TS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--allow-file-access-from-files"])
        await art(b, "icon", 512, 512, GP / "icon.png")
        await art(b, "feature", 1024, 500, GP / "feature.png")
        await art(b, "icon", 600, 600, TS / "logo.png")
        await art(b, "feature", 1932, 828, TS / "thumbnail.png")
        a = await scenes(b, 360, 640, 3, "screen-", GP)                      # 1080x1920 (9:16)
        t = await scenes(b, 390, 643, 2, "screen-", TS, size=(636, 1048))    # Toss portrait 636x1048
        await b.close()
    for d in (GP, TS):
        for f in sorted(d.glob("*.png")): print(d.name, f.name, Image.open(f).size, Image.open(f).mode)
asyncio.run(main())
