# Friend challenge: share a link with stage + turns, open it, beat it.
import asyncio
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"
async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await ctx.add_init_script("window.__shared = []; navigator.share = async d => { window.__shared.push(d); };")
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.evaluate("NBQ.startStage(5); NBQ.forceClear(2)"); await pg.wait_for_timeout(1300)
        ok("clear screen has a send-challenge button", await pg.locator("#btnSendChallenge").count() == 1)
        await pg.click("#btnSendChallenge"); await pg.wait_for_timeout(300)
        sh = await pg.evaluate("window.__shared[0]")
        turns = await pg.evaluate("NBQ.state.turn")
        ok(f"share carries only stage and turns ({sh and sh['url']})", sh and sh["url"] == f"https://ncroquis.github.io/neon-brick/play/?ch=5-{turns}" and f"{turns}턴" in sh["text"])
        # open the friend's link (locked stage 12, 7 turns)
        await pg.goto(URL + "?ch=12-7"); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300)
        ok("map shows the friend's challenge", await pg.is_visible("#btnChallenge") and "12" in await pg.inner_text("#chLine") and "7턴" in await pg.inner_text("#chLine"))
        await pg.screenshot(path="shots/ch-map.png")
        await pg.click("#btnChallenge"); await pg.wait_for_timeout(400)
        ok("challenge starts that stage", await pg.evaluate("NBQ.screen") == "play" and await pg.evaluate("NBQ.state.stage.n") == 12 and await pg.evaluate("NBQ.state.challenge.turns") == 7)
        c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.evaluate("const s=NBQ.state; s.bricks.clear(); s.turn=5; s.status='clear'; s.stars=NBQ.Core.starsFor(s); NBQ.openResult('clear')"); await pg.wait_for_timeout(1300)
        ok("win verdict shown", "이겼어요" in await pg.inner_text("#rHint"))
        await pg.screenshot(path="shots/ch-win.png")
        ok("locked stage played as practice saves nothing", await pg.evaluate("NBQ.wallet.coins") == c0 and not await pg.evaluate("(NBQ.progress.stars[12]||0)"))
        ok("beaten challenge is cleared from the address", "ch=" not in await pg.evaluate("location.search"))
        # toss build has no send button
        t = await ctx.new_page(); await t.add_init_script("window.NCQ = { NCQ_PLATFORM: 'toss' };"); await t.goto(URL); await t.wait_for_timeout(500)
        await t.evaluate("NBQ.startStage(5); NBQ.forceClear(2)"); await t.wait_for_timeout(1300)
        ok("toss build: no send-challenge button", await t.locator("#btnSendChallenge").count() == 0)
        # no share API → copy to clipboard
        c2 = await b.new_context(locale="ko-KR"); await c2.grant_permissions(["clipboard-read", "clipboard-write"])
        await c2.add_init_script("delete Navigator.prototype.share;")
        q = await c2.new_page(); await q.goto(URL); await q.wait_for_timeout(500)
        await q.evaluate("NBQ.startStage(5); NBQ.forceClear(2)"); await q.wait_for_timeout(1300); await q.click("#btnSendChallenge"); await q.wait_for_timeout(300)
        ok("without share it copies the link", "?ch=5-" in await q.evaluate("navigator.clipboard.readText()") and "복사" in await q.inner_text("#toast"))
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
