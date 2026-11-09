# English build check: every screen in en-US shows no Korean, labels are translated, and the language switch works.
import asyncio, re
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"
SP = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide"
HANGUL = re.compile(r"[가-힣]+")
SCAN = """() => { const out = [];
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.hidden || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return false; } return true; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) if (/[\\uac00-\\ud7a3]/.test(n.nodeValue) && vis(n.parentElement)) out.push(n.nodeValue.trim());
  document.querySelectorAll('[aria-label],[placeholder],[title],[label]').forEach(el => { for (const a of ['aria-label','placeholder','title','label']) { const v = el.getAttribute(a); if (v && /[\\uac00-\\ud7a3]/.test(v)) out.push(a + '=' + v); } });
  return out; }"""

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="en-US")
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        ok("en-US phone starts in English", await pg.evaluate("$t.lang") == "en" and await pg.title() == "Neon Brick")
        seen = {}
        async def scan(name, shot=None):
            left = await pg.evaluate(SCAN); seen[name] = left
            ok(f"{name}: no Korean on screen {left[:4]}", not left)
            if shot: await pg.screenshot(path=f"{SP}/en-{shot}.png")
        await scan("title", "1-title")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300); await scan("map", "2-map")
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(900); await scan("stage play", "3-play")
        hud = await pg.inner_text("#hudTurns")
        ok(f"HUD turn line in English ({hud})", hud.startswith("Turn 0") and "★3 in" in hud)
        await pg.evaluate("NBQ.useBooster('hammer')"); await pg.wait_for_timeout(150)
        ok(f"booster toast in English ({await pg.inner_text('#toast')})", not HANGUL.search(await pg.inner_text("#toast")))
        await pg.evaluate("NBQ.useBooster('hammer')")
        await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, boosters: { ...NBQ.wallet.boosters, push: 0 } }; NBQ.useBooster('push'); 0"); await pg.wait_for_timeout(300)
        await scan("booster sold-out sheet", "4-sheet")
        await pg.evaluate("document.querySelector('#sheetBtns button').click()"); await pg.wait_for_timeout(200)
        await pg.evaluate("NBQ.setClearSong('synth'); NBQ.forceClear(3)"); await pg.wait_for_timeout(5200); await scan("3-star result", "5-clear")
        await pg.evaluate("NBQ.startStage(12)"); await pg.wait_for_timeout(500); await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(1200); await scan("2-star result")
        hint = await pg.inner_text("#rHint"); ok(f"result hint in English ({hint})", "turns to ★3" in hint)
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(500); await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(1200); await scan("fail result", "6-fail")
        await pg.evaluate("NBQ.startStage(31)"); await pg.wait_for_timeout(700)
        chap = await pg.inner_text("#hudChap"); ok(f"wide stage name translated ({chap})", chap == "Wide 9 cols · Gap Pocket")
        await pg.evaluate("NBQ.startStage(22)"); await pg.wait_for_timeout(500)
        ok(f"chapter name translated ({await pg.inner_text('#hudChap')})", await pg.inner_text("#hudChap") == "Laser Street")
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(300); await scan("shop", "7-shop")
        await pg.evaluate("NBQ.Dz.open()"); await pg.wait_for_timeout(300); await scan("dance collection", "8-dances")
        await pg.evaluate("NBQ.Daily.open()"); await pg.wait_for_timeout(300); await scan("daily challenge", "9-daily")
        await pg.evaluate("NBQ.Ed.open()"); await pg.wait_for_timeout(400); await scan("level editor", "10-editor")
        # editor warnings come from the game core in Korean and are translated on display
        w = await pg.evaluate("[$t.k('헛턴이 42%: 하나도 못 깨는 턴이 많아요. 체력 높은 벽을 줄이세요'), $t.k('마지막 벽돌 숨바꼭질: 남은 1~2개에 평균 2.5턴을 써요. 구석 벽돌 체력을 낮추세요'), $t.k('와이드 13칸 · 벽 타기')]")
        ok(f"core strings translated by pattern {w}", w == ["Dry turns 42%: too many turns break nothing. Cut back the high-HP walls",
           "Last-brick hide and seek: 2.5 turns on average for the final 1-2 bricks. Lower the HP of corner bricks", "Wide 13 cols · Wall Ride"])
        await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(200)
        await pg.evaluate("document.getElementById('btnReset').click()"); await pg.wait_for_timeout(300); await scan("reset sheet")
        await pg.evaluate("document.querySelector('#sheetBtns button').click()"); await pg.wait_for_timeout(200)
        await pg.evaluate("NBQ.Ads.tickMs = 100; NBQ.Ads.rewarded('continue'); 0"); await pg.wait_for_timeout(400); await scan("test ad overlay", "11-ad")
        await pg.wait_for_timeout(800); await pg.evaluate("document.getElementById('adClose').click()")
        # switch language from the settings button
        await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(200)
        ok(f"language button ({await pg.inner_text('#btnLang')})", await pg.inner_text("#btnLang") == "Language: English")
        await pg.click("#btnLang"); await pg.wait_for_load_state(); await pg.wait_for_timeout(600)
        ok("switch → Korean after reload, choice saved", await pg.evaluate("$t.lang") == "ko" and await pg.evaluate("localStorage.getItem('nbq-lang')") == "ko" and await pg.inner_text("#btnPlay") == "플레이")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200); await pg.click("#btnLang"); await pg.wait_for_load_state(); await pg.wait_for_timeout(600)
        ok("switch back → English", await pg.evaluate("$t.lang") == "en")
        ok("no JS errors (en)", not errs)
        if errs: print(errs[:3])
        # ko-KR phone stays Korean; ?lang=en forces English
        k = await b.new_context(locale="ko-KR"); kp = await k.new_page(); await kp.goto(URL); await kp.wait_for_timeout(400)
        ok("ko-KR phone starts in Korean", await kp.evaluate("$t.lang") == "ko" and await kp.title() == "네온 브릭")
        await kp.goto(URL + "?lang=en"); await kp.wait_for_timeout(400)
        ok("?lang=en forces English", await kp.evaluate("$t.lang") == "en")
        j = await b.new_context(locale="ja-JP"); jp = await j.new_page(); await jp.goto(URL); await jp.wait_for_timeout(400)
        ok("unsupported phone language (ja-JP) starts in English", await jp.evaluate("$t.lang") == "en")
        k2 = await b.new_context(locale="ja-JP"); await k2.add_init_script("Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ko-KR', 'en-US'] })")
        kp2 = await k2.new_page(); await kp2.goto(URL); await kp2.wait_for_timeout(400)
        ok("first supported language in the phone's order wins (ja, ko, en → ko)", await kp2.evaluate("$t.lang") == "ko")
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
