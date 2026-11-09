# Company guideline checks (offline assets, NcqAds slots, NCQ_TEST flags, local play data) + the visible cancel zone.
import asyncio, re, pathlib
from playwright.async_api import async_playwright
URL = "file:///home/claude/neon-brick/index.html"
SP = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    html = pathlib.Path("/home/claude/neon-brick/index.html").read_text(encoding="utf-8")
    ok("no external http(s) asset links in index.html", not re.search(r'(href|src)=["\']https?://', html) and "fonts.googleapis" not in html)
    for slot, fn in [("REVIVE", "rewarded"), ("DOUBLE_COINS", "rewarded"), ("FREE_BOOSTER", "rewarded"), ("BOOSTER_REFILL", "rewarded"), ("STAGE_CLEAR", "interstitial")]:
        ok(f"slot {slot}: labelled and called as NcqAds.{fn}", f"// NCQ_ADS_{slot}:" in html and f'NcqAds.{fn}("{slot}")' in html)
    ok("test flag labelled (NCQ_TEST_UNLOCK)", "// NCQ_TEST_UNLOCK:" in html)
    names = ["COINS_S", "COINS_M", "COINS_L", "NOADS", "CONTPACK"]
    ok("IAP products labelled and bought by literal name", all(f"// NCQ_IAP_{n}:" in html for n in names) and all(f'NcqIap.buy("{n}")' in html or f'NcqIap.buyOnce("{n}")' in html for n in names))
    ok("no-ads is one-time (buyOnce), the rest consumable (buy), never both", 'NcqIap.buyOnce("NOADS")' in html and 'NcqIap.buy("NOADS")' not in html and all('NcqIap.buyOnce("%s")' % n not in html for n in names if n != "NOADS"))
    ok("no prices or store plugins in the code", "₩" not in html.split("<script>",2)[-1] and "CdvPurchase" not in html and "cordova-plugin-purchase" not in html)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def page(init=None):
            ctx = await b.new_context(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
            pg = await ctx.new_page(); pg.errs = []; pg.ext = []
            pg.on("pageerror", lambda e: pg.errs.append(str(e)))
            pg.on("request", lambda r: pg.ext.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
            if init: await pg.add_init_script(init)
            await pg.goto(URL); await pg.wait_for_timeout(700)
            return pg

        # 1) development page: offline fonts + dev tools + test ads
        pg = await page()
        await pg.evaluate("document.fonts.ready")
        fonts = await pg.evaluate("""() => ['16px "IBM Plex Sans KR"', '16px "Chakra Petch"', '16px "Monoton"'].map(f => document.fonts.check(f, '네온 Brick 7'))""")
        ok(f"self-hosted fonts load {fonts}", all(fonts))
        loaded = await pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)")
        ok("Korean font face actually loaded from ./fonts", any("IBM Plex Sans KR" in f for f in loaded))
        ok("no network requests outside the page files", not pg.ext)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("dev: unlock + reset buttons visible", await pg.evaluate("!btnUnlockAll.hidden && !btnReset.hidden"))
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("dev: free-booster ad and test store visible", await pg.evaluate("!shopFree.hidden && !shopIap.hidden"))

        # local play data: a clear is stored on the device and shown in the editor table
        await pg.evaluate("localStorage.removeItem('nbq-plays-local'); NBQ.startStage(3)"); await pg.wait_for_timeout(500)
        await pg.evaluate("NBQ.state.turn = 2; NBQ.forceClear(3)"); await pg.wait_for_timeout(300)
        lp = await pg.evaluate("JSON.parse(localStorage.getItem('nbq-plays-local') || '{}')")
        ok(f"clear stored on device ({lp.get('3', {}).get('clears')} clear)", lp.get("3", {}).get("clears") == 1)
        await pg.evaluate("NBQ.Ed.open()"); await pg.wait_for_timeout(300)
        t = await pg.inner_text("#edPlays")
        ok("editor shows this device's play table outside claude.ai", "이 기기 기록" in t and "3" in t)

        # 2) cancel zone
        await pg.evaluate("NBQ.startStage(5)"); await pg.wait_for_timeout(900)
        cy = await pg.evaluate("""() => { const c = document.querySelector('#game canvas, canvas'); return null; }""")
        geo = await pg.evaluate("""() => { const cv = document.getElementById('cv') || document.querySelector('canvas'); const r = cv.getBoundingClientRect(); return { top: r.top, left: r.left }; }""")
        zone = await pg.evaluate("NBQ.cancelY()")
        # field->screen mapping via the board helpers exposed on NBQ.R if present; fall back to drag geometry
        sx = await pg.evaluate("(() => { const s = NBQ.state; return s.launchX; })()")
        await pg.mouse.move(195, 640); await pg.mouse.down(); await pg.mouse.move(150, 400, steps=6); await pg.wait_for_timeout(150)
        a1 = await pg.evaluate("NBQ.aimState()")
        await pg.mouse.move(195, 820, steps=6); await pg.wait_for_timeout(250)
        a2 = await pg.evaluate("NBQ.aimState()")
        await pg.screenshot(path=f"{SP}/13-cancel-zone-hot.png")
        await pg.mouse.up(); await pg.wait_for_timeout(250)
        ok(f"aiming above the line is valid {a1}", a1["aiming"] and a1["aimValid"])
        ok(f"finger in the zone marks cancel {a2}", a2["aiming"] and not a2["aimValid"])
        ok("release in the zone does not shoot", await pg.evaluate("NBQ.state.status") == "aim" and await pg.evaluate("NBQ.state.turn") == 0)
        ok("toast says 발사 취소", "발사 취소" in await pg.inner_text("#toast"))
        await pg.wait_for_timeout(1200); await pg.screenshot(path=f"{SP}/14-cancel-zone-idle.png")
        await pg.mouse.move(195, 640); await pg.mouse.down(); await pg.mouse.move(150, 400, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300)
        ok("normal release still shoots", await pg.evaluate("NBQ.state.status") == "shooting" or await pg.evaluate("NBQ.state.turn") == 1)
        ok("dev page: no JS errors", not pg.errs)

        # 3) company build without NcqAds and without test flags: ads/rewards/test tools off, game still completes
        pg = await page("window.NCQ = { NCQ_PLATFORM: 'android', NCQ_VERSION: '0.1.0' };")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("build: unlock hidden, reset kept", await pg.evaluate("btnUnlockAll.hidden && !btnReset.hidden"))
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("build: free-booster ad and test store hidden", await pg.evaluate("shopFree.hidden && shopIap.hidden && shopIapLabel.hidden"))
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(500); await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(600)
        labels = await pg.evaluate("[...document.querySelectorAll('#result button')].map(b => b.textContent)")
        ok(f"build: no 이어하기 without ads, retry available {labels}", not any("광고" in l for l in labels) and any("포기" in l for l in labels) and any("코인" in l for l in labels))
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(500); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(600)
        labels = await pg.evaluate("[...document.querySelectorAll('#result button')].map(b => b.textContent)")
        ok(f"build: no 광고 보고 코인 button, next stage available {labels}", not any("광고" in l for l in labels) and any("다음" in l for l in labels))
        ok("build: no JS errors", not pg.errs)

        # 4) company build with test flags on
        pg = await page("window.NCQ = { NCQ_PLATFORM: 'android' }; window.NCQ_TEST_UNLOCK = true;")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("test build: unlock button shown by NCQ_TEST_UNLOCK", await pg.evaluate("!btnUnlockAll.hidden"))
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("test build without NcqIap: coin products hidden", await pg.evaluate("shopIap.hidden"))

        # 5) company build with NcqAds: slots are called by name, rewards only when watched
        pg = await page("""window.NCQ = { NCQ_PLATFORM: 'android' }; window.__ads = [];
          window.NcqAds = { can: s => s !== 'FREE_BOOSTER', rewarded: async s => (window.__ads.push('r:' + s), s !== 'DOUBLE_COINS'),
            interstitial: async s => (window.__ads.push('i:' + s), true), banner: async () => false, hideBanner: async () => {},
            ready: async () => true, privacyRequired: () => false, showPrivacyOptions: async () => false, bannerSpace: () => ({ top: 0, bottom: 0 }) };""")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("NcqAds.can('FREE_BOOSTER') false hides that button only", await pg.evaluate("shopFree.hidden"))
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(500); await pg.evaluate("NBQ.forceFail()"); await pg.wait_for_timeout(600)
        await pg.click("#result button:has-text('무료로 이어하기')"); await pg.wait_for_timeout(400)
        ok("이어하기 calls REVIVE and continues", "r:REVIVE" in await pg.evaluate("__ads") and await pg.evaluate("NBQ.state.continued"))
        await pg.evaluate("NBQ.forceClear(1)"); await pg.wait_for_timeout(700)
        c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.click("#btnDouble"); await pg.wait_for_timeout(300)
        ok("DOUBLE_COINS not watched to the end → no coins", "r:DOUBLE_COINS" in await pg.evaluate("__ads") and await pg.evaluate("NBQ.wallet.coins") == c0)
        await pg.evaluate("NBQ.Core && 0")
        r = await pg.evaluate("(async () => { const w = NBQ.wallet; w.clearsSinceAd = 5; NBQ.wallet = w; return await NBQ.Ads.interstitialAfterClear(20); })()")
        ok("stage-break interstitial calls STAGE_CLEAR", r and "i:STAGE_CLEAR" in await pg.evaluate("__ads"))
        ok("ads build: no JS errors", not pg.errs)

        # 6) Google Play build with NcqIap: two products sold, rewards only through onGrant
        pg = await page("""window.NCQ = { NCQ_PLATFORM: 'android' }; window.__iap = [];
          (() => { let g = null; const on = { COINS_S: '₩1,500', NOADS: '₩6,000' };
            window.NcqIap = { onGrant: f => { g = f; window.__grant = f; }, can: id => !!on[id], ready: async () => true, price: id => on[id] || '',
              owned: async () => false, restore: async () => { const ok = g('NOADS', { restored: true }); return { ok: true, restored: ok ? ['NOADS'] : [] }; },
              buy: async id => { window.__iap.push('buy:' + id); return { ok: g(id, {}) !== false, id }; },
              buyOnce: async id => { window.__iap.push('once:' + id); return { ok: g(id, {}) !== false, id }; } }; })();""")
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        ok("restore purchases button shown when products are on", await pg.evaluate("!btnRestore.hidden"))
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(300)
        ids = await pg.evaluate("[...document.querySelectorAll('#shopIap [data-iap]')].map(b => b.dataset.iap + ' ' + b.textContent)")
        ok(f"only products NcqIap can sell are shown, with store prices {ids}", ids == ["COINS_S ₩1,500", "NOADS ₩6,000"])
        ok("store label is plain '코인' (not test payment)", (await pg.inner_text("#shopIapLabel")).strip() == "코인")
        c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.click("#shopIap [data-iap=COINS_S]"); await pg.wait_for_timeout(300)
        ok("coins bought with buy() and granted 600 in onGrant", await pg.evaluate("NBQ.wallet.coins") == c0 + 600 and "buy:COINS_S" in await pg.evaluate("__iap"))
        await pg.click("#shopIap [data-iap=NOADS]"); await pg.wait_for_timeout(300)
        ok("no-ads bought with buyOnce() sets noAds and disables the button", "once:NOADS" in await pg.evaluate("__iap") and await pg.evaluate("NBQ.wallet.noAds") and await pg.evaluate("document.querySelector('#shopIap [data-iap=NOADS]').disabled"))
        ok("unknown product is refused by onGrant", await pg.evaluate("__grant('NOPE', {})") is False)
        await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, noAds: false }; NBQ.openMap()"); await pg.wait_for_timeout(100)
        await pg.click("#btnRestore"); await pg.wait_for_timeout(300)
        ok("restore brings back no-ads", await pg.evaluate("NBQ.wallet.noAds"))
        ok("play store build: no JS errors", not pg.errs)

        # 7) release build without NcqIap → nothing sold
        pg = await page("window.NCQ = { NCQ_PLATFORM: 'android' }; window.NCQ_IAP_COINS_S = true;")
        await pg.click("#btnPlay"); await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("no NcqIap → coin section and restore button hidden", await pg.evaluate("shopIap.hidden && shopIapLabel.hidden && btnRestore.hidden"))

        # 8) Toss build: top-right kept clear, no products, mute when hidden
        pg = await page("window.NCQ = { NCQ_PLATFORM: 'toss' };")
        ok("toss: html gets the toss class", await pg.evaluate("document.documentElement.classList.contains('toss')"))
        await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        top = await pg.evaluate("Math.min(...[...document.querySelectorAll('#map button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect().top))")
        ok(f"toss: map buttons start below the host's buttons (top {top:.0f}px >= 52)", top >= 52)
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(500)
        hud = await pg.evaluate("document.querySelector('#hud').getBoundingClientRect().top + parseFloat(getComputedStyle(document.querySelector('#hud')).paddingTop)")
        ok(f"toss: HUD content starts below 52px ({hud:.0f})", hud >= 52)
        await pg.screenshot(path=f"{SP}/15-toss-hud.png")
        await pg.evaluate("NBQ.openShop()"); await pg.wait_for_timeout(200)
        ok("toss: coin products hidden", await pg.evaluate("shopIap.hidden"))
        await pg.mouse.click(200, 400)
        await pg.evaluate("NBQ.A.init(); NBQ.A.setMuted(false)")
        await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
        g1 = await pg.evaluate("NBQ.A.master ? NBQ.A.master.gain.value : -1")
        await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
        g2 = await pg.evaluate("NBQ.A.master ? NBQ.A.master.gain.value : -1")
        ok(f"hidden → sound off ({g1}), back → sound on ({g2})", g1 == 0 and g2 > 0)
        ok("toss: no JS errors", not pg.errs)
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
