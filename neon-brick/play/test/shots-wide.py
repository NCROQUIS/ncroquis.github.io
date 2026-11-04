import asyncio, os
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide"
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        await pg.click("#btnUnlockAll"); await pg.wait_for_timeout(200)
        await pg.evaluate("document.getElementById('grid4').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f"{OUT}/1-map.png")
        for i, n in enumerate([31, 34, 36]):
            await pg.evaluate(f"NBQ.startStage({n})"); await pg.wait_for_timeout(1800)
            await pg.screenshot(path=f"{OUT}/{i+2}-board-{n}.png")
        # trick shot moment: expert's best angle on W6 (13칸), capture mid-flight
        await pg.evaluate("NBQ.startStage(31)"); await pg.wait_for_timeout(1800)
        await pg.evaluate("NBQ.Core.startShot(NBQ.state, NBQ.Core.botAngle(NBQ.state))")
        await pg.wait_for_timeout(1300)
        await pg.screenshot(path=f"{OUT}/5-trick-31.png")
        print("errors:", errs)
        await b.close()
asyncio.run(main())
