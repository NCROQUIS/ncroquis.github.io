# Daily challenge outside the claude.ai team page (Toss, Google Play, web share): no login, so the rank stat, the ranking
# and the login hint stay hidden, the rule talks about your own best and the result button says "기록 보기".
# On the team page (Team.db) the ranking view is unchanged.
import asyncio, re
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await ctx.add_init_script("window.NCQ = { NCQ_PLATFORM: 'toss' };")
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        ok("no team store outside claude.ai", await pg.evaluate("!NBQ.Team.db"))
        await pg.evaluate("NBQ.Daily.open()"); await pg.wait_for_timeout(400)
        text = await pg.inner_text("#daily")
        ok("no login hint or ranking on screen", "로그인" not in text and not await pg.is_visible("#dailyBoard") and not await pg.is_visible("#dailyBoardLabel"))
        ok("no rank stat, best and streak share the row", not await pg.is_visible("#dsRankBox") and await pg.is_visible("#dsBest") and await pg.is_visible("#dsStreak"))
        w = await pg.evaluate("[...document.querySelectorAll('.dstats .dstat')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().width))")
        ok(f"two stat boxes fill the row ({w})", len(w) == 2 and abs(w[0] - w[1]) <= 1 and w[0] > 140)
        rule = await pg.inner_text("#dailyRule")
        ok(f"rule talks about your own best ({rule[:24]}…)", rule.startswith("모두가 같은 판") and "1등" not in rule and "팀" not in rule)
        await pg.screenshot(path="shots/daily-solo.png")
        # result screen of a daily run
        await pg.evaluate("NBQ.Daily.play(); 0"); await pg.wait_for_function("NBQ.state && NBQ.state.stage.daily && NBQ.screen === 'play'", timeout=20000)
        await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(1300)
        main_btn = await pg.inner_text("#rBtns .rrow.main button")
        ok(f"daily result main button is '기록 보기' ({main_btn})", main_btn.strip() == "기록 보기")
        await pg.click("#rBtns .rrow.main button"); await pg.wait_for_timeout(300)
        ok("it opens the challenge screen with today's best", await pg.evaluate("NBQ.screen") == "daily" and await pg.inner_text("#dsBest") != "–")

        # English
        en = await b.new_page(locale="en-US", viewport={"width": 390, "height": 844})
        await en.goto(URL + "?lang=en"); await en.wait_for_timeout(400)
        await en.evaluate("NBQ.Daily.open()"); await en.wait_for_timeout(300)
        r = await en.inner_text("#dailyRule")
        ok(f"english rule ({r[:30]}…)", r.startswith("Everyone plays the same board") and not re.search("[가-힣]", r))

        # team page: ranking view as before
        await pg.evaluate("NBQ.Team.db = {}; NBQ.Daily.open()"); await pg.wait_for_timeout(300)
        ok("team page: rank stat and ranking shown", await pg.is_visible("#dsRankBox") and await pg.is_visible("#dailyBoard") and await pg.is_visible("#dailyBoardLabel"))
        ok("team page: team rule", (await pg.inner_text("#dailyRule")).startswith("팀 모두가"))
        await pg.evaluate("NBQ.Team.db = null")
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
