# Stage metrics (NcqMetrics): stage-<shown number> / wide-<n> / daily start, and end once when the run is really over.
# A fail with continues left is not an end, continuing keeps the same run, giving up or running out of continues is a loss.
# Editor test plays and locked-stage challenge practice are not counted.
import asyncio
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"
SPY = "window.NcqMetrics = { log: [], levelStart(n) { this.log.push(['start', n]); }, levelEnd(n, won) { this.log.push(['end', n, won]); } };"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await ctx.add_init_script(SPY)
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        log = lambda: pg.evaluate("window.NcqMetrics.log.splice(0)")
        ok("nothing is sent on the title", await log() == [])

        await pg.evaluate("NBQ.startStage(3)"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"clear: start, then a won end ({l})", l == [["start", "stage-3"], ["end", "stage-3", True]])

        await pg.evaluate("NBQ.startStage(37)"); await pg.wait_for_timeout(200)
        await pg.evaluate("NBQ.startStage(31)"); await pg.wait_for_timeout(200)
        l = await log(); ok(f"names use the number on screen, leaving mid-stage sends no end ({l})", l == [["start", "stage-31"], ["start", "wide-1"]])

        # fail with continues left → not an end; continue (coins) → same run; clear → one won end
        await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, coins: 5000, contTokens: 0 }; NBQ.startStage(5)"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1300)
        l = await log(); ok(f"a fail with continues left is not the end ({l})", l == [["start", "stage-5"]])
        await pg.click("#btnCoinCont"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceClear(1)"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"the continued run ends once, as a clear ({l})", l == [["end", "stage-5", True]])

        # give up → a lost end, once (the give-up re-opens the fail screen)
        await pg.evaluate("NBQ.startStage(6)"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1300)
        await pg.click("#btnGiveUp"); await pg.wait_for_timeout(300)
        await pg.click("#sheetBtns button >> nth=0"); await pg.wait_for_timeout(500)
        l = await log(); ok(f"giving up ends it as a loss ({l})", l == [["start", "stage-6"], ["end", "stage-6", False]])
        await pg.click("#btnRetry"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"retry is a new run ({l})", l == [["start", "stage-6"]])

        # all continues used → the last fail is the end
        await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, coins: 5000, contTokens: 0 }; NBQ.startStage(7)"); await pg.wait_for_timeout(300)
        for _ in range(2):
            await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1300)
            await pg.click("#btnCoinCont"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1300)
        l = await log(); ok(f"out of continues: one lost end ({l})", l == [["start", "stage-7"], ["end", "stage-7", False]])

        # daily challenge
        await pg.evaluate("NBQ.Daily.play(); 0"); await pg.wait_for_function("NBQ.state && NBQ.state.stage.daily && NBQ.screen === 'play'", timeout=20000)
        await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"daily challenge counts as 'daily' ({l})", l == [["start", "daily"], ["end", "daily", True]])

        # editor test play
        await pg.evaluate("NBQ.Ed.open()"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.startStage(0, NBQ.Ed.toStage())"); await pg.wait_for_timeout(300)
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"editor test plays are not counted ({l})", l == [])

        # friend's challenge: locked stage = practice (not counted), stage 1 = a real run
        await pg.goto(URL + "?ch=12-7"); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300); await pg.click("#btnChallenge"); await pg.wait_for_timeout(400)
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(300)
        l = await log(); ok(f"locked-stage practice is not counted ({l})", await pg.evaluate("NBQ.state.challenge.practice") and l == [])
        await pg.goto(URL + "?ch=1-1"); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300); await pg.click("#btnChallenge"); await pg.wait_for_timeout(400)
        l = await log(); ok(f"an unlocked challenge stage is a normal run ({l})", l == [["start", "stage-1"]])

        # without the module (development page) nothing breaks
        c2 = await b.new_context(locale="ko-KR"); q = await c2.new_page(); e2 = []; q.on("pageerror", lambda e: e2.append(str(e)))
        await q.goto(URL); await q.wait_for_timeout(400)
        await q.evaluate("NBQ.startStage(2)"); await q.wait_for_timeout(200); await q.evaluate("NBQ.forceFail()"); await q.wait_for_timeout(400)
        ok("no NcqMetrics module: no errors", not e2)
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
