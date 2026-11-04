# Big Finish: 3-star clears pick the synth song or the recorded track at random; the dance follows the track's beat.
import asyncio
from playwright.async_api import async_playwright
from PIL import Image
URL = "file:///home/claude/neon-brick/index.html"
SP = "/tmp/claude-0/-home-claude/95b96453-b493-5e49-b879-e6e1fd21b952/scratchpad/wide"

async def main():
    res = []
    def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(locale="ko-KR", viewport={"width": 390, "height": 844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400)
        await pg.mouse.click(200, 500); await pg.click("#btnPlay"); await pg.wait_for_timeout(200)
        for _ in range(50):
            if await pg.evaluate("NBQ.A.trackReady()"): break
            await pg.wait_for_timeout(100)
        ok("track preloads (audio/big-finish.mp3)", await pg.evaluate("NBQ.A.trackReady()"))
        dur = await pg.evaluate("NBQ.A.track.duration")
        ok(f"track length {dur:.1f}s matches the 108-beat chart", abs(dur - 51.5) < 0.3 and await pg.evaluate("NBQ.BF_SEQ.length") == 108)

        # random pick: both songs show up, only for 3 stars
        picks = await pg.evaluate("(() => { NBQ.setClearSong(null); const c = { bigfinish: 0, synth: 0 }; for (let i = 0; i < 400; i++) c[NBQ.pickClearSong()]++; return c; })()")
        ok(f"random pick uses both songs about half each {picks}", 140 < picks["bigfinish"] < 260)

        # forced Big Finish clear
        await pg.evaluate("NBQ.setClearSong('bigfinish'); NBQ.startStage(4)"); await pg.wait_for_timeout(500)
        await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("({ song: NBQ.R.song && NBQ.R.song.title, playing: !NBQ.A.track.paused, t: NBQ.A.track.currentTime })")
        ok(f"3-star clear plays Big Finish {st}", st["song"] == "Big Finish" and st["playing"] and st["t"] > 0.5)
        sync = await pg.evaluate("""() => { const now = performance.now() / 1000, R = NBQ.R, b = (now - R.t0) / R.beat, tb = (NBQ.A.track.currentTime - 0.105) / (60 / 126); return [b, tb]; }""")
        ok(f"dance beat follows the track (dance {sync[0]:.2f} vs track {sync[1]:.2f})", abs(sync[0] - sync[1]) < 0.25)
        ok("new dance '빅 피니시' unlocked on first play", "bigfinish" in await pg.evaluate("NBQ.Dz.st.owned"))
        await pg.wait_for_timeout(3600)
        ok("buttons appear while the song keeps going", await pg.evaluate("rBtns.classList.contains('show')") and not await pg.evaluate("NBQ.A.track.paused"))

        # section screenshots by seeking the track
        shots = []
        for name, beat in [("intro", 2.4), ("groove", 20.4), ("break", 34.4), ("drop", 76.6), ("finish", 82.4), ("outro", 104.4)]:
            await pg.evaluate(f"NBQ.A.track.currentTime = 0.105 + {beat} * 60 / 126"); await pg.wait_for_timeout(260)
            f = f"{SP}/bf-{name}.png"; await pg.screenshot(path=f); shots.append(f)
            if name == "drop":
                ok("drop (beat 76): confetti burst and wink", await pg.evaluate("NBQ.R.dropped && NBQ.R.conf.length >= 90"))
        cur = await pg.evaluate("Math.round(((performance.now() / 1000 - NBQ.R.t0) / NBQ.R.beat))")
        ok(f"after seeking the dance is at beat ~104 ({cur})", 103 <= cur <= 106)

        # hidden app pauses the track, coming back resumes it
        await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
        ok("hidden → track paused", await pg.evaluate("NBQ.A.track.paused"))
        await pg.evaluate("NBQ.A.track.currentTime = 10; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300)
        ok("visible again → track resumes", not await pg.evaluate("NBQ.A.track.paused"))

        # leaving the result stops the track
        await pg.click("#rBtns button >> nth=0"); await pg.wait_for_timeout(300)
        ok("a result button stops the track", await pg.evaluate("NBQ.A.track.paused"))

        # skip tap stops it too and jumps to the end pose
        await pg.evaluate("NBQ.startStage(4)"); await pg.wait_for_timeout(400); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(1200)
        await pg.mouse.click(200, 300); await pg.wait_for_timeout(300)
        ok("skip tap stops the track and shows the buttons", await pg.evaluate("NBQ.A.track.paused && rBtns.classList.contains('show')"))

        # synth pick, 2-star clears, failed track → original song
        await pg.evaluate("NBQ.setClearSong('synth'); NBQ.startStage(4)"); await pg.wait_for_timeout(400); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(500)
        ok("synth pick plays the original 3-star song", await pg.evaluate("!NBQ.R.song && NBQ.A.track.paused && NBQ.R.beat > 0.4 && NBQ.R.beat < 0.5"))
        await pg.evaluate("NBQ.setClearSong('bigfinish'); NBQ.startStage(4)"); await pg.wait_for_timeout(400); await pg.evaluate("NBQ.forceClear(2)"); await pg.wait_for_timeout(500)
        ok("2-star clear never uses Big Finish", await pg.evaluate("!NBQ.R.song && NBQ.A.track.paused"))
        await pg.evaluate("NBQ.A.trackFailed = true; NBQ.startStage(4)"); await pg.wait_for_timeout(400); await pg.evaluate("NBQ.forceClear(3)"); await pg.wait_for_timeout(500)
        ok("track not available → original song instead", await pg.evaluate("!NBQ.R.song"))
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    ims = [Image.open(f).resize((390, 844)) for f in shots]
    sheet = Image.new("RGB", (390 * 6 + 50, 844), (8, 8, 16))
    for i, im in enumerate(ims): sheet.paste(im, (i * 400, 0))
    sheet.save(f"{SP}/bigfinish-sheet.png")
    print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
asyncio.run(main())
