# Dance collection: unlock rules, equip, colors, coin purchase, 3-star stage and title use the equipped dance.
import asyncio
from playwright.async_api import async_playwright
async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(800)
        await pg.screenshot(path="shots/80-title-dancer.png")
        px = await pg.evaluate("(()=>{const c=document.getElementById('titleMan');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>40)n++;return n})()")
        ok(f"title screen shows the dancing Neon Man ({px} lit pixels)", px > 2000)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("map shows collection 3 / 11", "3 / 11" in await pg.inner_text("#danceLine"))
        await pg.click("#btnDances"); await pg.wait_for_timeout(500)
        ok("collection screen lists 11 dances", await pg.locator("#dGrid .dcard").count() == 11)
        ok("8 are locked at start (incl. 빅 피니시)", await pg.locator("#dGrid .dcard.lock").count() == 8)
        await pg.screenshot(path="shots/81-collection-start.png", full_page=True)
        # star-based unlocks: clear stages with 3 stars until 15 stars
        await pg.evaluate("NBQ.openMap()")
        for n in range(1, 6):
            await pg.evaluate(f"NBQ.startStage({n})"); await pg.wait_for_timeout(80); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(150)
        ok("15 stars unlocks 네온 웨이브 and 5 straight 3-stars unlock 피버 댄스", await pg.evaluate("NBQ.Dz.st.owned.includes('wave') && NBQ.Dz.st.owned.includes('fever')"))
        await pg.wait_for_timeout(2700)
        ok("unlock is announced on the result screen", "해금" in await pg.inner_text("#toast") and await pg.locator("#rBtns button:has-text('댄스 도감')").count() == 1)
        await pg.screenshot(path="shots/82-unlock-toast.png")
        # a 2-star clear breaks the 3-star chain counter
        await pg.evaluate("NBQ.startStage(6)"); await pg.wait_for_timeout(80); await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(150)
        ok("non-3-star clear resets the streak counter", await pg.evaluate("NBQ.Dz.st.chain3") == 0 and await pg.evaluate("NBQ.Dz.st.best3") == 5)
        # BACK SHOT count unlock
        await pg.evaluate("NBQ.startStage(7)"); await pg.wait_for_timeout(80); await pg.evaluate("NBQ.state.backs=10; NBQ.forceClear(1)"); await pg.wait_for_timeout(150)
        ok("10 BACK SHOTs unlock 네온 팝핀", await pg.evaluate("NBQ.Dz.st.owned.includes('pop')"))
        # boss unlock
        await pg.evaluate("NBQ.startStage(10)"); await pg.wait_for_timeout(80); await pg.evaluate("NBQ.forceClear(1)"); await pg.wait_for_timeout(150)
        ok("clearing stage 10 unlocks 문 슬라이드", await pg.evaluate("NBQ.Dz.st.owned.includes('moon')"))
        # equip + color
        await pg.evaluate("NBQ.Dz.open()"); await pg.wait_for_timeout(300)
        ok("new unlocks show a badge until viewed", not await pg.is_visible("#danceDot"))
        await pg.click("#dGrid [data-d=wave]"); await pg.wait_for_timeout(200); await pg.click("#dsAction"); await pg.wait_for_timeout(150)
        ok("equipping sets the 3-star dance", await pg.evaluate("NBQ.Dz.st.equipped") == "wave" and "장착 중" in await pg.inner_text("#dGrid [data-d=wave]"))
        await pg.click("#dColors [data-c=magenta]"); await pg.wait_for_timeout(150)
        ok("magenta neon unlocked by 10 stars and selected", await pg.evaluate("NBQ.Dz.st.color") == "magenta")
        await pg.click("#dColors [data-c=gold]"); await pg.wait_for_timeout(150)
        ok("locked gold color refuses with its condition", await pg.evaluate("NBQ.Dz.st.color") == "magenta" and "별 45개" in await pg.inner_text("#toast"))
        await pg.wait_for_timeout(600); await pg.screenshot(path="shots/83-collection-equipped.png", full_page=True)
        # coin purchase
        await pg.click("#dGrid [data-d=spin]"); await pg.wait_for_timeout(150)
        await pg.evaluate("NBQ.wallet.coins = 1000"); await pg.click("#dsAction"); await pg.wait_for_timeout(200)
        ok("네온 스핀 bought for 800 coins", await pg.evaluate("NBQ.Dz.st.owned.includes('spin')") and await pg.evaluate("NBQ.wallet.coins") == 200)
        # 3-star stage now dances the equipped dance in the chosen color
        await pg.evaluate("NBQ.startStage(8)"); await pg.wait_for_timeout(80); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(1700)
        await pg.screenshot(path="shots/84-3star-equipped.png")
        pix = await pg.evaluate("(()=>{const c=document.getElementById('dance');const x=c.getContext('2d');const w=c.width,h=c.height;const d=x.getImageData(w*0.35,h*0.3,w*0.3,h*0.4).data;let m=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<120&&d[i+2]>150)m++;return m})()")
        ok(f"3-star lead dancer glows in the equipped magenta ({pix} px)", pix > 200)
        # rainbow requires all 11
        await pg.evaluate("NBQ.Dz.st.owned = NBQ.DANCE_LIB.map(d=>d.id); NBQ.Dz.save(); NBQ.Dz.open()"); await pg.wait_for_timeout(200)
        await pg.click("#dColors [data-c=rainbow]"); await pg.wait_for_timeout(150)
        ok("rainbow unlocks after collecting every dance", await pg.evaluate("NBQ.Dz.st.color") == "rainbow")
        await pg.reload(); await pg.wait_for_timeout(500)
        ok("collection survives reload", await pg.evaluate("NBQ.Dz.st.equipped") == "wave" and await pg.evaluate("NBQ.Dz.st.owned.length") == 11)
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
