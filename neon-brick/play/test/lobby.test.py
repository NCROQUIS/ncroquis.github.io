# Title-screen sound: lobby theme is scheduled at load, starts on the first touch, follows menus, yields to stage BGM.
import asyncio
from playwright.async_api import async_playwright
async def main():
    res = []
    def ok(n, c): res.append(c); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        # default autoplay policy (a real phone): audio is held until a gesture
        b = await p.chromium.launch(args=["--autoplay-policy=user-gesture-required"]); pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(700)
        st = await pg.evaluate("[NBQ.A.ctx && NBQ.A.ctx.state, NBQ.A.bgm && NBQ.A.bgm.tr.name]")
        ok(f"lobby theme queued on load (audio {st[0]}, track {st[1]})", st[1] == "Neon Lobby")
        ok("tap hint shown while audio is held", await pg.is_visible("#tapHint") if st[0] != "running" else True)
        await pg.screenshot(path="shots/50-title-tap.png")
        await pg.mouse.click(195, 700); await pg.wait_for_timeout(500)
        ok("first touch starts the sound", await pg.evaluate("NBQ.A.ctx.state")=="running")
        ok("tap hint hides after sound starts", not await pg.is_visible("#tapHint"))
        t0 = await pg.evaluate("NBQ.A.bgm.step"); await pg.wait_for_timeout(1500); t1 = await pg.evaluate("NBQ.A.bgm.step")
        ok(f"lobby theme is playing on the title ({t1 - t0} steps in 1.5s)", t1 - t0 >= 7)
        await pg.click("#btnPlay"); await pg.wait_for_timeout(300)
        ok("same lobby theme continues on the map", await pg.evaluate("NBQ.A.bgm.tr.name") == "Neon Lobby" and await pg.evaluate("NBQ.A.bgm.step") > t1)
        await pg.click(".grid button >> nth=0"); await pg.wait_for_timeout(500)
        ok("stage switches to a gameplay track", await pg.evaluate("NBQ.A.bgm.idx") in (0, 1, 2, 4))   # 4 = EDM "Neon Drop", also in the random pool
        await pg.click("#btnBack"); await pg.wait_for_timeout(400)
        ok("back to map returns to lobby theme", await pg.evaluate("NBQ.A.bgm.tr.name") == "Neon Lobby")
        await pg.click("#btnEditor"); await pg.wait_for_timeout(300)
        ok("editor keeps lobby theme", await pg.evaluate("NBQ.A.bgm.tr.name") == "Neon Lobby")
        await pg.evaluate("NBQ.openMap()"); await pg.click("#btnSound"); await pg.wait_for_timeout(200)
        ok("sound off mutes menus", await pg.evaluate("NBQ.A.master.gain.value") == 0)
        await pg.click("#btnSound"); await pg.wait_for_timeout(200)
        ok("sound on resumes lobby", await pg.evaluate("NBQ.A.master.gain.value") > 0 and await pg.evaluate("NBQ.A.bgm.tr.name") == "Neon Lobby")
        tracks = set()
        for _ in range(8):
            await pg.evaluate("NBQ.startStage(1)"); tracks.add(await pg.evaluate("NBQ.A.bgm.idx"))
        for _ in range(16):
            await pg.evaluate("NBQ.startStage(1)"); tracks.add(await pg.evaluate("NBQ.A.bgm.idx"))
        ok(f"random gameplay pool includes the EDM track and never the lobby (saw {sorted(tracks)})", 3 not in tracks and 4 in tracks)
        await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(200)
        await pg.click("#btnMusic"); await pg.wait_for_timeout(300)
        ok("music button picks Neon Drop (EDM) and previews it", "Neon Drop" in await pg.inner_text("#btnMusic") and await pg.evaluate("NBQ.A.bgm.tr.name") == "Neon Drop")
        await pg.screenshot(path="shots/90-music-picker.png")
        s0 = await pg.evaluate("NBQ.A.bgm.step"); await pg.wait_for_timeout(1500); s1 = await pg.evaluate("NBQ.A.bgm.step")
        ok(f"EDM sequencer runs at 128 bpm ({s1 - s0} sixteenths in 1.5s)", 10 <= s1 - s0 <= 15)
        fixed = set()
        for _ in range(5):
            await pg.evaluate("NBQ.startStage(2)"); fixed.add(await pg.evaluate("NBQ.A.bgm.tr.name"))
        ok("stages play only the picked track", fixed == {"Neon Drop"})
        await pg.reload(); await pg.wait_for_timeout(500)
        ok("music choice survives reload", "Neon Drop" in await pg.inner_text("#btnMusic"))
        await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(200)
        for _ in range(4): await pg.click("#btnMusic"); await pg.wait_for_timeout(80)
        ok("cycling returns to random", await pg.inner_text("#btnMusic") == "음악: 랜덤")
        ok("no JS errors", not errs)
        await b.close()
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
