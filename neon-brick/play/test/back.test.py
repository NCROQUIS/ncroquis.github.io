# Toss back button (window.ncqBack): an open dialog closes first, then each screen goes one step back the way its own
# ‹ button does (stage/result/shop/daily/dances/editor → map, map → title). Only the title returns false (the build asks to quit).
import asyncio
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(locale="ko-KR", viewport={"width": 390, "height": 844})
        await ctx.add_init_script("window.NCQ = { NCQ_PLATFORM: 'toss' };")
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        back = lambda: pg.evaluate("window.ncqBack()")
        scr = lambda: pg.evaluate("NBQ.screen")
        sheet_open = lambda: pg.evaluate("!document.getElementById('sheet').hidden")

        ok("title: not handled, so the build asks to quit", await back() is False and await scr() == "title")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300)
        ok("map → title", await back() is True and await scr() == "title")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300)

        await pg.evaluate("NBQ.startStage(2)"); await pg.wait_for_timeout(400)
        ok("stage → map", await back() is True and await scr() == "map")

        # a dialog in a stage closes first and the stage goes on
        await pg.evaluate("NBQ.startStage(3); NBQ.wallet = { ...NBQ.wallet, boosters: { ...NBQ.wallet.boosters, push: 0 } }; NBQ.useBooster('push'); 0")
        await pg.wait_for_timeout(300)
        ok("booster dialog is open", await sheet_open())
        ok("dialog closes first, the stage stays", await back() is True and not await sheet_open() and await scr() == "play")
        ok("nothing was bought by closing it", await pg.evaluate("NBQ.wallet.boosters.push") == 0)

        await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(1300)
        ok("clear result → map", await back() is True and await scr() == "map")

        # give-up dialog on the fail screen: back closes it without giving up
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1300)
        await pg.click("#btnGiveUp"); await pg.wait_for_timeout(300)
        ok("give-up dialog is open", await sheet_open())
        ok("back closes it, still on the fail screen with the continue offer", await back() is True and not await sheet_open() and await scr() == "result" and await pg.locator("#btnCoinCont, #btnTokenCont").count() == 1)
        ok("fail result → map", await back() is True and await scr() == "map")

        for name, js in [("shop", "NBQ.openShop()"), ("daily challenge", "NBQ.Daily.open()"), ("dance collection", "NBQ.Dz.open()"), ("level editor", "NBQ.Ed.open()")]:
            await pg.evaluate(js); await pg.wait_for_timeout(300)
            ok(f"{name} → map", await back() is True and await scr() == "map")

        # daily stage goes back to the challenge screen, like its ‹ button
        await pg.evaluate("NBQ.Daily.play(); 0"); await pg.wait_for_function("NBQ.state && NBQ.state.stage.daily && NBQ.screen === 'play'", timeout=20000)
        ok("daily stage → challenge screen", await back() is True and await scr() == "daily")

        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
