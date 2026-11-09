# Screen guide: app version label (dev / build version) and main-button marks, checked with NcqSafe.checkAll()
# on the smallest Android phone, a notch iPhone and the Toss game frame (ncq/safe.js injected the way the release build checks).
# Desktop emulation like the other tests: index.html has no viewport tag of its own, so is_mobile would lay it out 980px wide.
import asyncio
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"
SAFE = "/home/claude/neon-brick/ncq/safe.js"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # version label: dev page shows "dev", a build shows its version
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844})
        await pg.goto(URL); await pg.wait_for_timeout(300)
        ok(f"dev page shows 'dev' ({await pg.inner_text('#appVer')})", await pg.inner_text("#appVer") == "dev")
        await pg.close()
        for name, w, h in [("android", 360, 640), ("iphone", 393, 852), ("toss", 393, 852)]:
            ctx = await b.new_context(locale="ko-KR", viewport={"width": w, "height": h}, has_touch=True, device_scale_factor=2)
            plat = "toss" if name == "toss" else "android" if name == "android" else "web"
            await ctx.add_init_script(f"window.NCQ = {{ NCQ_PLATFORM: '{plat}', NCQ_VERSION: '1.2.3' }};")
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(URL + "?release=1&ncq-safe=" + name); await pg.add_script_tag(path=SAFE); await pg.wait_for_timeout(500)
            async def check(screen, shot):
                r = await pg.evaluate("NcqSafe.checkAll()")
                nomain = await pg.locator("[data-ncq-no-main]:visible").count()
                ok(f"{name} {screen}: main buttons clear of covered edges (count {r['count']}, no-main {nomain}) {[] if r['ok'] else r['items']}", r["ok"] and (r["count"] or nomain))
                await pg.screenshot(path=f"shots/safe-{name}-{shot}.png")
            v = await pg.inner_text("#appVer"); box = await pg.locator("#appVer").bounding_box(); sat = await pg.evaluate("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ncq-safe-top')) || 0")
            ok(f"{name}: build version on the title ({v}, top {box['y']:.0f} below the covered top {sat:.0f})", v == "v1.2.3" and box["y"] >= sat and box["x"] + box["width"] <= w)
            ok(f"{name}: title marks the Play button", await pg.get_attribute("#btnPlay", "data-ncq-main") is not None)
            await check("title", "1-title")
            await pg.click("#btnPlay"); await pg.wait_for_timeout(300); await check("map", "2-map")
            await pg.evaluate("NBQ.startStage(2)"); await pg.wait_for_timeout(500); await check("stage", "3-stage")
            await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(1400); await check("clear result", "4-clear")
            await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, coins: 5000 }; NBQ.startStage(4)"); await pg.wait_for_timeout(400)
            await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1400); await check("fail result", "5-fail")
            await pg.evaluate("NBQ.Daily.open()"); await pg.wait_for_timeout(400); await check("daily", "6-daily")
            ok(f"{name}: no JS errors", not errs)
            await ctx.close()
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
