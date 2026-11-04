import asyncio
from playwright.async_api import async_playwright
SP = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide"
URL = "file:///home/claude/neon-brick/index.html"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        await pg.click("#btnUnlockAll"); await pg.wait_for_timeout(200)
        f = await pg.evaluate("NBQ.ff()")
        ok("default timings are 4s then 8s with no history", f["times"] == [4, 8] and f["on"])

        async def shot(stage, t1, t2, waits):
            await pg.evaluate(f"NBQ.setFF([{t1}, {t2}])")
            await pg.evaluate(f"NBQ.startStage({stage})"); await pg.wait_for_timeout(1500)
            await pg.evaluate("NBQ.Core.startShot(NBQ.state, Math.PI*0.42)")
            out = []
            for w in waits:
                await pg.wait_for_timeout(w); out.append(await pg.evaluate("NBQ.ff()"))
            return out

        # 7-column board: x2 then x3
        a, b2, c = await shot(5, 0.3, 0.7, [120, 300, 350])
        ok("7칸: starts at normal speed", a["autoX"] == 1)
        ok("7칸: x2 after first step", b2["autoX"] == 2)
        ok("7칸: x3 after second step", c["autoX"] == 3 and "×3 자동" in await pg.inner_text("#btnSpeed"))
        ok("button glows magenta (auto class)", await pg.evaluate("document.getElementById('btnSpeed').classList.contains('auto')"))

        # 13-column board: top speed capped at x2.5
        a, b2, c = await shot(36, 0.3, 0.7, [120, 300, 350])
        ok("13칸: x2 after first step", b2["autoX"] == 2)
        ok("13칸: top speed capped at x2.5", c["autoX"] == 2.5 and c["max"] == 2.5 and "×2.5 자동" in await pg.inner_text("#btnSpeed"))
        await pg.screenshot(path=f"{SP}/7-auto-x25-13.png")

        # end of shot resets
        await pg.evaluate("NBQ.Core.recall(NBQ.state)")
        for _ in range(60):
            if await pg.evaluate("NBQ.state.status") != "shooting": break
            await pg.wait_for_timeout(100)
        await pg.wait_for_timeout(200)
        f = await pg.evaluate("NBQ.ff()")
        ok("resets to normal after the shot", f["autoX"] == 1 and f["shotT"] == 0)

        # settings toggle turns it off
        await pg.evaluate("NBQ.show('title')"); await pg.wait_for_timeout(200)
        await pg.evaluate("document.getElementById('btnAutoFF').click()"); await pg.wait_for_timeout(100)
        ok("setting button says 자동 배속 끔", "끔" in await pg.inner_text("#btnAutoFF"))
        a, b2 = await shot(5, 0.2, 0.4, [300, 300])
        ok("with the setting off it never speeds up", a["autoX"] == 1 and b2["autoX"] == 1)
        ok("setting is saved", await pg.evaluate("JSON.parse(localStorage.getItem('nbq-settings')).autoFF === false"))
        await pg.evaluate("document.getElementById('btnAutoFF').click()")

        # personal timing: learned average moves the first step to 1.5x average, clamped 3..6s
        await pg.evaluate("NBQ.setFF(null)")
        await pg.evaluate("NBQ.setFFHist({ n: 5, avg: 2.4 })")
        f = await pg.evaluate("NBQ.ff()")
        ok("short shots → steps at 3.6s / 7.2s", abs(f["times"][0] - 3.6) < 1e-6 and abs(f["times"][1] - 7.2) < 1e-6)
        await pg.evaluate("NBQ.setFFHist({ n: 5, avg: 9 })")
        f = await pg.evaluate("NBQ.ff()")
        ok("long average is clamped to 6s / 12s", f["times"] == [6, 12])
        await pg.evaluate("NBQ.setFFHist({ n: 2, avg: 9 })")
        ok("fewer than 3 shots keeps the default", (await pg.evaluate("NBQ.ff()"))["times"] == [4, 8])
        # a real shot is recorded
        await pg.evaluate("NBQ.setFFHist({ n: 0, avg: 0 })")
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(1200)
        await pg.evaluate("NBQ.Core.startShot(NBQ.state, Math.PI*0.42)")
        for _ in range(80):
            if await pg.evaluate("NBQ.state.status") != "shooting": break
            await pg.wait_for_timeout(100)
        await pg.wait_for_timeout(200)
        h = (await pg.evaluate("NBQ.ff()"))["hist"]
        ok("a finished shot is recorded", h["n"] == 1 and h["avg"] > 0.3)

        # manual x2 still works
        await pg.evaluate("NBQ.Core.startShot(NBQ.state, Math.PI*0.42)"); await pg.wait_for_timeout(150)
        await pg.click("#btnSpeed"); await pg.wait_for_timeout(100)
        f = await pg.evaluate("NBQ.ff()")
        ok("manual x2 toggle still works", f["speed"] == 2 and "×2 배속" in await pg.inner_text("#btnSpeed"))
        ok("no JS errors", not errs)

        # release build: unlock button hidden, reset button kept
        pg2 = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844})
        await pg2.goto(URL + "?release=1"); await pg2.wait_for_timeout(400)
        await pg2.click("#btnPlay"); await pg2.wait_for_timeout(200); await pg2.evaluate("NBQ.show('title')"); await pg2.wait_for_timeout(200)
        ok("release: unlock-all button hidden", await pg2.evaluate("document.getElementById('btnUnlockAll').hidden"))
        ok("release: reset button still there", await pg2.evaluate("!document.getElementById('btnReset').hidden") and (await pg2.inner_text("#btnReset")).strip() == "진행 초기화")
        ok("release: unlock flag in save is ignored", await pg2.evaluate("NBQ.progress.unlockAll = true, NBQ.openMap(), document.querySelectorAll('.grid button:not([disabled])').length") <= 2)
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
