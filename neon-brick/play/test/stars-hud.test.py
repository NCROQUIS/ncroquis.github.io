# Regression: HUD star count right before the result screen must equal the result's stars.
import asyncio
from playwright.async_api import async_playwright
SHOT = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide/9-hud-stars.png"
async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(500)
        await pg.click("#btnPlay"); await pg.click("#btnUnlockAll"); await pg.wait_for_timeout(200)
        lit = "document.querySelectorAll('#hudStars span.on').length"
        # clear exactly on the last shot of each star band, plus boosters and continue
        for stage in [1, 12, 25, 34]:
            for band in [3, 2, 1]:
                await pg.evaluate(f"NBQ.startStage({stage})"); await pg.wait_for_timeout(700)
                par = await pg.evaluate("[NBQ.state.stage.par3, NBQ.state.stage.par2]")
                last = {3: par[0], 2: par[1], 1: par[1] + 2}[band]
                # leave one brick on the top row, play out turns up to the final shot
                await pg.evaluate(f"""() => {{ const s = NBQ.state; s.turn = {last} - 1;
                    const keep = [...s.bricks.values()].sort((a, b) => a.r - b.r)[0]; s.bricks.clear(); keep.hp = 1; keep.r = 0;
                    s.bricks.set((0 + 64) * 16 + keep.c, keep); s.items.clear(); }}""")
                # aim straight at the last brick and fire
                await pg.evaluate("""() => { const s = NBQ.state, br = [...s.bricks.values()][0];
                    const dx = br.c + 0.5 - s.launchX, dy = (s.rows - 0.3) - 0.5; NBQ.Core.startShot(s, Math.atan2(dy, dx)); }""")
                seen = set()
                for _ in range(80):
                    st = await pg.evaluate("NBQ.state.status")
                    if st != "aim": seen.add((st, await pg.evaluate(lit)))
                    if st == "clear": break
                    await pg.wait_for_timeout(50)
                hud_clear = [n for (s, n) in seen if s == "clear"]
                before = min([n for (s, n) in seen if s == "shooting"] or [-1])
                await pg.wait_for_timeout(1700)
                result = await pg.evaluate("NBQ.state.stars")
                if stage == 34 and band == 3: await pg.screenshot(path=SHOT)
                ok(f"stage {stage} clear on turn {last}: HUD during last shot {before} = HUD at clear {hud_clear} = result {result} (expect {band})",
                   result == band and before == band and hud_clear and all(n == band for n in hud_clear))

        # booster finish preview: last brick + hammer armed at turn == par3 shows 3 stars blinking (next shot would be 2)
        SP2 = SHOT.replace("9-hud-stars.png", "12-booster-preview.png")
        for k, setup in [("hammer", "one"), ("laser", "row")]:
            await pg.evaluate("NBQ.startStage(12)"); await pg.wait_for_timeout(700)
            await pg.evaluate(f"""() => {{ const s = NBQ.state; s.turn = s.stage.par3;
                const live = [...s.bricks.values()].sort((a, b) => b.r - a.r); const r0 = live[0].r; s.bricks.clear(); s.items.clear();
                const keep = "{setup}" === "one" ? live.slice(0, 1) : live.filter(b => b.r === r0);
                for (const b of keep) s.bricks.set((b.r + 64) * 16 + b.c, b); }}""")
            await pg.evaluate("NBQ.wallet = { ...NBQ.wallet, boosters: { ...NBQ.wallet.boosters, hammer: 3, laser: 3 } }")
            await pg.evaluate(f"NBQ.useBooster('{k}')"); await pg.wait_for_timeout(200)
            h = await pg.evaluate("[document.querySelectorAll('#hudStars span.on').length, document.querySelectorAll('#hudStars span.preview').length]")
            t = await pg.inner_text("#toast")
            if k == "hammer": await pg.screenshot(path=SP2)
            ok(f"{k} armed on the last {'brick' if setup == 'one' else 'row'}: HUD previews 3 stars with 1 blinking ({h}), toast '{t}'", h == [3, 1] and "★★★" in t)
            await pg.evaluate(f"NBQ.useBooster('{k}')"); await pg.wait_for_timeout(100)
            h = await pg.evaluate("[document.querySelectorAll('#hudStars span.on').length, document.querySelectorAll('#hudStars span.preview').length]")
            ok(f"{k} cancelled: back to next-shot stars {h}", h == [2, 0])
            # use it for real: result must match the preview
            await pg.evaluate(f"NBQ.useBooster('{k}')")
            await pg.evaluate(f"""() => {{ const br = [...NBQ.state.bricks.values()][0]; const cv = document.querySelector('canvas');
                return NBQ.Core.applyBooster(NBQ.state, '{k}', {{ r: br.r, c: br.c }}); }}""")
            await pg.wait_for_timeout(300)
            ok(f"{k} finish really gives 3 stars", await pg.evaluate("NBQ.state.status") == "clear" and await pg.evaluate("NBQ.state.stars") == 3)
            await pg.wait_for_timeout(1800)
        # not a finisher: two bricks + hammer → no preview
        await pg.evaluate("NBQ.startStage(12)"); await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const s = NBQ.state; s.turn = s.stage.par3; }")
        await pg.evaluate("NBQ.useBooster('hammer')"); await pg.wait_for_timeout(150)
        ok("hammer with many bricks left: no preview", await pg.evaluate("document.querySelectorAll('#hudStars span.preview').length") == 0)
        ok("no JS errors", not errs)
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
