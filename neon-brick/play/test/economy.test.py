# Boosters, coins, shop and the ad layer, played through the real page.
import asyncio
from playwright.async_api import async_playwright
async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(600)
        await pg.evaluate("NBQ.Ads.tickMs = 200")  # 5-second test ads play fast in tests
        w = await pg.evaluate("NBQ.wallet")
        ok(f"new player starts with {w['coins']} coins and boosters {w['boosters']}", w["coins"] == 300 and sum(w["boosters"].values()) == 7)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("map shows coin balance", (await pg.inner_text("#mapCoins")) == "300")
        await pg.click(".grid button >> nth=0"); await pg.wait_for_timeout(1300)
        ok("booster tray shows while aiming", await pg.is_visible("#tray") and not await pg.is_visible("#btnSpeed"))
        await pg.screenshot(path="shots/60-tray.png")
        # hammer: arm, tap a brick, it disappears
        await pg.click("#tray [data-b=hammer]"); await pg.wait_for_timeout(250)
        await pg.screenshot(path="shots/61-hammer-armed.png")
        target = await pg.evaluate("""()=>{const s=NBQ.state;const b=[...s.bricks.values()].filter(b=>b.r>=0&&b.type==='n')[0];return {r:b.r,c:b.c,n:s.bricks.size}}""")
        box = await pg.locator("#game").bounding_box()
        pos = await pg.evaluate(f"(()=>{{const c=document.getElementById('game');return null}})()")
        # convert field cell to screen point using the page's own layout
        pt = await pg.evaluate(f"""(()=>{{const r=document.getElementById('game').getBoundingClientRect();const S=(window.__S=getComputedStyle?0:0);return null}})()""")
        xy = await pg.evaluate(f"""(()=>{{ const c=document.getElementById('game'); const ev={{clientX:0,clientY:0}};
            // search the screen for the cell centre by probing toField
            return null }})()""")
        # simpler: dispatch through the page's helper
        hit = await pg.evaluate(f"""(()=>{{ const s=NBQ.state, before=s.bricks.size; const k=NBQ.BOOSTERS; return before }})()""")
        await pg.evaluate("window.__cellPoint=(r,c)=>{const cv=document.getElementById('game');const R=cv.getBoundingClientRect();const g=window.__layout();return [R.left+g.ox+(c+0.5)*g.S, R.top+g.oy+(r+0.5)*g.S]}")
        p0 = await pg.evaluate(f"window.__cellPoint({target['r']},{target['c']})")
        await pg.mouse.click(p0[0], p0[1]); await pg.wait_for_timeout(300)
        after = await pg.evaluate("NBQ.state.bricks.size")
        ok(f"hammer removes the tapped brick ({target['n']} → {after})", after == target["n"] - 1 and await pg.evaluate("NBQ.wallet.boosters.hammer") == 1)
        await pg.screenshot(path="shots/62-hammer-hit.png")
        # +10 balls queues for the next shot
        balls = await pg.evaluate("NBQ.state.balls")
        await pg.click("#tray [data-b=balls]"); await pg.wait_for_timeout(150)
        await pg.evaluate("NBQ.Core.startShot(NBQ.state,1.3)")
        ok("+10 balls fires 10 extra balls", await pg.evaluate("NBQ.state.shot.total") == balls + 10)
        await pg.wait_for_timeout(120)
        ok("tray swaps to speed/recall while shooting", await pg.is_visible("#btnSpeed") and not await pg.is_visible("#tray"))
        await pg.wait_for_function("NBQ.state.status!=='shooting'", timeout=30000)
        # out of stock → sheet offers ad or coins; ad path
        await pg.evaluate("NBQ.wallet.boosters.push=0; NBQ.startStage(4)"); await pg.wait_for_timeout(1300)
        d0 = await pg.evaluate("NBQ.Core.dangerRow(NBQ.state)")
        await pg.click("#tray [data-b=push]"); await pg.wait_for_timeout(200)
        ok("empty booster opens offer sheet", await pg.is_visible("#sheet"))
        await pg.screenshot(path="shots/63-offer-sheet.png")
        await pg.click("#sheetBtns button:has-text('광고 보고')"); await pg.wait_for_timeout(150)
        ok("test rewarded ad plays", await pg.is_visible("#adOverlay"))
        await pg.screenshot(path="shots/64-test-ad.png")
        await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(200)
        ok("watched ad grants the booster and uses it at once (push lifts bricks 2 rows)", await pg.evaluate("NBQ.Core.dangerRow(NBQ.state)") == d0 - 2 and await pg.evaluate("NBQ.wallet.boosters.push") == 0)
        # skipping a rewarded ad gives nothing
        await pg.evaluate("NBQ.wallet.boosters.laser=0"); await pg.click("#tray [data-b=laser]"); await pg.wait_for_timeout(150)
        await pg.click("#sheetBtns button:has-text('광고 보고')"); await pg.wait_for_function("!document.getElementById('adSkip').hidden && !document.getElementById('adOverlay').hidden", timeout=8000); await pg.evaluate("document.getElementById('adSkip').click()"); await pg.wait_for_timeout(200)
        ok("skipped ad grants nothing", await pg.evaluate("NBQ.wallet.boosters.laser") == 0)
        # coin purchase path
        await pg.click("#tray [data-b=laser]"); await pg.wait_for_timeout(150); c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.click("#sheetBtns button:has-text('코인')"); await pg.wait_for_timeout(200)
        ok("buying with coins deducts 160 and arms the laser", await pg.evaluate("NBQ.wallet.coins") == c0 - 160 and await pg.evaluate("NBQ.wallet.boosters.laser") == 1 and await pg.locator("#tray [data-b=laser].armed").count() == 1)
        row = await pg.evaluate("Math.max(...[...NBQ.state.bricks.values()].filter(b=>b.r>=0).map(b=>b.r))"); n0 = await pg.evaluate("NBQ.state.bricks.size")
        rn = await pg.evaluate(f"[...NBQ.state.bricks.values()].filter(b=>b.r==={row}).length")
        pt = await pg.evaluate(f"window.__cellPoint({row},3)"); await pg.mouse.click(pt[0], pt[1]); await pg.wait_for_timeout(300)
        ok(f"laser wipes the tapped row ({rn} bricks)", await pg.evaluate("NBQ.state.bricks.size") <= n0 - rn and await pg.evaluate("NBQ.wallet.boosters.laser") == 0)
        await pg.screenshot(path="shots/67-laser.png")
        # clear rewards + double
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(200); c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(600)
        gained = await pg.evaluate("NBQ.wallet.coins") - c0
        ok(f"first 3-star clear pays base 40 + first 30 + 3-star 40 = {gained}", gained == 110 and "+110" in await pg.inner_text("#rCoins"))
        await pg.mouse.click(195, 300); await pg.wait_for_timeout(300)
        await pg.screenshot(path="shots/65-result-coins.png")
        await pg.click("#btnDouble"); await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(200)
        ok("double reward adds the base again", await pg.evaluate("NBQ.wallet.coins") - c0 == 150 and await pg.locator("#btnDouble").count() == 0)
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(200); c1 = await pg.evaluate("NBQ.wallet.coins")
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(400)
        ok("replaying a cleared stage pays base only (40)", await pg.evaluate("NBQ.wallet.coins") - c1 == 40)
        # continue requires a watched ad
        await pg.evaluate("NBQ.startStage(6)"); await pg.wait_for_timeout(200); await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1200)
        await pg.click("#rBtns button:has-text('이어하기 (광고)')"); await pg.wait_for_function("!document.getElementById('adSkip').hidden && !document.getElementById('adOverlay').hidden", timeout=8000); await pg.evaluate("document.getElementById('adSkip').click()"); await pg.wait_for_timeout(300)
        ok("skipping the continue ad keeps the fail screen", await pg.evaluate("NBQ.screen") == "result")
        await pg.click("#rBtns button:has-text('이어하기 (광고)')"); await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(300)
        ok("watching the continue ad resumes play", await pg.evaluate("NBQ.screen") == "play")
        # interstitial cadence: from stage 11, every 3rd clear, never with noAds
        shown = []
        for i in range(6):
            await pg.evaluate("NBQ.startStage(12)"); await pg.wait_for_timeout(100); await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(200)
            await pg.mouse.click(195, 300); await pg.wait_for_timeout(150)
            await pg.click("#rBtns button:has-text('다음 스테이지')"); await pg.wait_for_timeout(250)
            if await pg.is_visible("#adOverlay"):
                shown.append(i); await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(200)
        ok(f"interstitial every 3rd clear from stage 11 (shown after clears {shown})", shown == [2, 5])
        await pg.evaluate("NBQ.startStage(3)"); await pg.wait_for_timeout(100); await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(200); await pg.mouse.click(195, 300); await pg.wait_for_timeout(150)
        for _ in range(3): await pg.evaluate("NBQ.Ads.interstitialAfterClear(3)")
        ok("no interstitials before stage 11", not await pg.is_visible("#adOverlay"))
        # shop
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        await pg.screenshot(path="shots/66-shop.png", full_page=True)
        c2 = await pg.evaluate("NBQ.wallet.coins"); await pg.click("[data-buy=hammer]"); await pg.wait_for_timeout(150)
        ok("shop sells boosters for coins", await pg.evaluate("NBQ.wallet.coins") == c2 - 120)
        await pg.evaluate("NBQ.wallet.coins=50"); await pg.click("[data-buy=push]"); await pg.wait_for_timeout(150)
        ok("not enough coins is refused", await pg.evaluate("NBQ.wallet.coins") == 50)
        for i in range(4):
            await pg.click("#shopFree"); await pg.wait_for_timeout(150)
            if await pg.is_visible("#adOverlay"): await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(200)
        ok("free booster ads capped at 3 per day", await pg.evaluate("NBQ.wallet.freeAds.n") == 3 and "모두" in await pg.inner_text("#shopFree"))
        await pg.click("[data-iap=coins_m]"); await pg.wait_for_timeout(150)
        ok("test purchase asks for confirmation", "테스트 결제" in await pg.inner_text("#sheet"))
        await pg.click("#sheetBtns button:has-text('구매')"); await pg.wait_for_timeout(150)
        ok("test purchase grants 2,000 coins", await pg.evaluate("NBQ.wallet.coins") == 2050)
        await pg.click("[data-iap=noads]"); await pg.wait_for_timeout(100); await pg.click("#sheetBtns button:has-text('구매')"); await pg.wait_for_timeout(150)
        ok("ad removal blocks interstitials", await pg.evaluate("NBQ.wallet.noAds") and not await pg.evaluate("NBQ.wallet.clearsSinceAd=2, NBQ.Ads.interstitialAfterClear(15)"))
        await pg.reload(); await pg.wait_for_timeout(500)
        ok("wallet survives reload", await pg.evaluate("NBQ.wallet.coins") == 2050 and await pg.evaluate("NBQ.wallet.noAds"))
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
