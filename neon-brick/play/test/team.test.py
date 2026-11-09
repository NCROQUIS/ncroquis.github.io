# Team store + worker pool, with an in-memory stand-in for the claude.ai viewer's db/user capabilities.
import asyncio
from playwright.async_api import async_playwright
MOCK = r"""
(() => {
  const store = new Map(), subs = [];
  const snap = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path), metadata: { fromCache: false, hasPendingWrites: false } });
  const children = (col) => [...store.keys()].filter(k => k.startsWith(col + '/') && k.split('/').length === col.split('/').length + 1).sort();
  const qsnap = (col) => { const docs = children(col).map(snap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const notify = () => subs.forEach(s => s.cb(qsnap(s.col)));
  const doc = (path) => ({ id: path.split('/').pop(), path, get: async () => snap(path), set: async (d) => { window.__writes.push(path); store.set(path, JSON.parse(JSON.stringify(d))); notify(); }, update: async (d) => { store.set(path, { ...store.get(path), ...d }); notify(); }, delete: async () => { store.delete(path); notify(); }, onSnapshot: (cb) => { cb(snap(path)); return () => {}; }, collection: (c) => col(path + '/' + c) });
  const col = (path) => ({ path, doc: (id) => doc(path + '/' + (id || Math.random().toString(36).slice(2))), get: async () => qsnap(path), onSnapshot: (cb) => { subs.push({ col: path, cb }); setTimeout(() => cb(qsnap(path)), 0); return () => {}; }, where() { return this; }, orderBy() { return this; }, limit() { return this; } });
  const db = { doc, collection: col };
  const user = { id: async () => window.__uid, isOwner: () => true, canEdit: () => window.__canEdit, can: () => true, me: async () => ({ id: window.__uid }), profiles: async (ids) => Object.fromEntries(ids.map(i => [i, { name: ({u_tester:'권승현',u_other:'김두식',u_third:'이기획'})[i] || '' }])) };
  window.__writes = []; window.__store = store; window.__uid = 'u_tester'; window.__canEdit = true;
  window.claude = { use: async (n) => n === 'db' ? db : n === 'user' ? user : null };
})();
"""
async def main():
    res = []
    def ok(n, c): res.append(c); print(("PASS " if c else "FAIL ") + n)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(locale="ko-KR", viewport={"width":390,"height":844}, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK)
        await pg.goto("file:///home/claude/neon-brick/index.html"); await pg.wait_for_timeout(800)
        ok("team store connects", await pg.evaluate("!!NBQ.Team.db && NBQ.Team.uid==='u_tester'"))
        # telemetry: a cleared stage and a failed stage are recorded as per-player aggregates
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(200)
        await pg.evaluate("""()=>{const s=NBQ.state;while(s.status==='aim')NBQ.Core.runShot(s,NBQ.Core.botAngle(s));}"""); await pg.wait_for_timeout(1800)
        await pg.evaluate("NBQ.startStage(1)"); await pg.wait_for_timeout(200)
        await pg.evaluate("""()=>{const s=NBQ.state;for(const b of s.bricks.values())b.hp=9999;while(s.status==='aim')NBQ.Core.runShot(s,0.2);}"""); await pg.wait_for_timeout(1800)
        rec = await pg.evaluate("window.__store.get('plays/u_tester/stages/1')")
        ok(f"play aggregate written {rec and {k: rec[k] for k in ('attempts','clears','fails')}}", rec and rec["attempts"]==2 and rec["clears"]==1 and rec["fails"]==1 and len(rec["turns"])==1)
        await pg.evaluate("NBQ.Ads.tickMs=40"); await pg.click("#btnAdCont")
        await pg.wait_for_selector("#adClose:not([hidden])", timeout=5000); await pg.click("#adClose"); await pg.wait_for_timeout(300)
        await pg.evaluate("""()=>{const s=NBQ.state;for(const b of s.bricks.values())b.hp=1;while(s.status==='aim')NBQ.Core.runShot(s,1.2);}"""); await pg.wait_for_timeout(1800)
        rec = await pg.evaluate("window.__store.get('plays/u_tester/stages/1')")
        ok("continued run is not double counted", rec["attempts"]==2)
        # quitting mid-stage is recorded as a quit
        await pg.evaluate("NBQ.startStage(3)"); await pg.wait_for_timeout(200); await pg.evaluate("NBQ.Core.runShot(NBQ.state,1.2)"); await pg.wait_for_timeout(200)
        await pg.click("#btnBack"); await pg.wait_for_timeout(500)
        ok("quit is recorded", (await pg.evaluate("window.__store.get('plays/u_tester/stages/3')") or {}).get("quits")==1)
        # a second player's data, then the editor's calibration table aggregates both
        await pg.evaluate("window.__store.set('plays/u_other',{seen:1}); window.__store.set('plays/u_other/stages/1',{n:1,attempts:3,clears:1,fails:2,quits:0,turns:[7],stars:[0,1,0,0]})")
        await pg.click("#btnEditor"); await pg.wait_for_timeout(600)
        txt = await pg.inner_text("#edPlays")
        ok("editor play table aggregates players", "2" in txt and "40%" in txt)
        # team level sharing
        await pg.select_option("#edLoad", "g5"); await pg.fill("#edName", "팀 공유 레벨"); await pg.click("#edSave"); await pg.wait_for_timeout(300)
        ok("save shares level to team", await pg.evaluate("[...window.__store.keys()].some(k=>k.startsWith('levels/') && window.__store.get(k).name==='팀 공유 레벨')"))
        ok("team level appears in load list", "팀 공유 레벨 (내 것)" in await pg.inner_text("#edLoad"))
        await pg.evaluate("window.__store.set('levels/lvx',{name:'동료 레벨',author:'u_other',updatedAt:Date.now(),level:{v:1,name:'동료 레벨',balls:9,height:4,bottom:3,par3:3,par2:5,cells:[[0,0,'n',4],[3,6,'b',1]]}}); NBQ.Team.db.collection('levels').doc('lvy').set({name:'tick'})")
        await pg.wait_for_timeout(200)
        await pg.select_option("#edLoad", label="동료 레벨"); await pg.wait_for_timeout(200)
        ok("teammate's level loads into editor", await pg.evaluate("NBQ.Ed.L.name==='동료 레벨' && NBQ.Ed.L.cells.length===2"))
        await pg.locator("#edTeam").scroll_into_view_if_needed(); await pg.screenshot(path="shots/40-editor-team.png")
        await pg.locator("#edPlays").scroll_into_view_if_needed(); await pg.screenshot(path="shots/41-editor-playdata.png")
        # non-editors cannot read others' play data
        await pg.evaluate("NBQ.Team.canRead=false; NBQ.Ed.renderPlays()")
        ok("non-editors see a notice instead of play data", "편집자만" in await pg.inner_text("#edPlays"))
        # worker pool: bot check runs off the main thread and stays responsive
        await pg.select_option("#edLoad", "g8"); await pg.wait_for_timeout(200)
        await pg.evaluate("window.__ticks=0; window.__iv=setInterval(()=>window.__ticks++,50)")
        await pg.click("#edCheck"); await pg.wait_for_function("document.querySelector('#edReport .verdict')", timeout=180000)
        ms = await pg.evaluate("clearInterval(window.__iv); NBQ.Ed.lastMs"); ticks = await pg.evaluate("window.__ticks")
        workers = await pg.evaluate("NBQ.BotPool.workers ? NBQ.BotPool.workers.length : 0")
        ok(f"bot check ran in {workers} worker(s), {ms/1000:.1f}s", workers >= 1)
        ok(f"UI stayed responsive during check ({ticks} timer ticks of ~{ms//50} possible)", ticks >= (ms // 50) * 0.6)
        # same result as running on the main thread
        same = await pg.evaluate("""async()=>{const st=NBQ.Ed.toStage();const a=await NBQ.BotPool.run(st,[{kind:'novice',seed:1000}],()=>{});const b=NBQ.Core.playStage(st,'novice',1000);return JSON.stringify(a[0])===JSON.stringify(b)}""")
        ok("worker results match main-thread simulation", same)
        # ---- daily challenge ----
        await pg.evaluate("NBQ.openMap()"); await pg.wait_for_timeout(200)
        ok("map shows today's challenge banner", "오늘의 챌린지" in await pg.inner_text("#btnDaily"))
        await pg.click("#btnDaily"); await pg.wait_for_timeout(300)
        ok("daily screen opens", await pg.evaluate("NBQ.screen") == "daily")
        await pg.click("#dailyPlay"); await pg.wait_for_function("NBQ.screen==='play'", timeout=60000); await pg.wait_for_timeout(1200)
        ok("daily stage is today's board", await pg.evaluate("NBQ.state.stage.daily") == await pg.evaluate("new Date(Date.now()+9*3600e3).toISOString().slice(0,10)"))
        ok("boosters are hidden in daily", not await pg.is_visible("#tray"))
        await pg.screenshot(path="shots/70-daily-play.png")
        c0 = await pg.evaluate("NBQ.wallet.coins")
        await pg.evaluate("""()=>{const s=NBQ.state;while(s.status==='aim')NBQ.Core.runShot(s,NBQ.Core.botAngle(s));}"""); await pg.wait_for_timeout(2600)
        t1 = await pg.evaluate("NBQ.state.turn")
        ok(f"first daily clear records {t1} turns and pays 60 coins", await pg.evaluate("NBQ.wallet.coins") - c0 == 60 and await pg.evaluate("NBQ.Daily.mine().days[new Date(Date.now()+9*3600e3).toISOString().slice(0,10)].best") == t1)
        doc = await pg.evaluate("window.__store.get('daily/u_tester')")
        ok("best score shared to team store", doc and list(doc["days"].values())[0]["best"] == t1)
        ok("daily result offers no continue", await pg.locator("#rBtns button:has-text('이어하기')").count() == 0)
        await pg.mouse.click(195, 300); await pg.wait_for_timeout(300); await pg.screenshot(path="shots/71-daily-result.png")
        # a worse retry keeps the best and pays nothing more
        await pg.click("#rBtns button:has-text('다시 도전')"); await pg.wait_for_function("NBQ.screen==='play'", timeout=30000); await pg.wait_for_timeout(300)
        c1 = await pg.evaluate("NBQ.wallet.coins")
        await pg.evaluate("NBQ.state.turn=99; NBQ.state.bricks.clear(); NBQ.state.status='clear'; NBQ.state.stars=1; NBQ.openResult('clear')"); await pg.wait_for_timeout(300)
        kept = (await pg.evaluate("NBQ.Daily.mine().days[new Date(Date.now()+9*3600e3).toISOString().slice(0,10)]"))["best"]
        ok("worse retry keeps best score, no second reward", kept == t1 and await pg.evaluate("NBQ.wallet.coins") == c1)
        # teammates on the board
        d = await pg.evaluate("new Date(Date.now()+9*3600e3).toISOString().slice(0,10)")
        await pg.evaluate(f"window.__store.set('daily/u_other',{{days:{{'{d}':{{best:{t1-1},attempts:4,at:1}}}},streak:{{last:'{d}',n:3}}}}); window.__store.set('daily/u_third',{{days:{{'{d}':{{best:{t1+3},attempts:1,at:2}}}},streak:{{last:'{d}',n:1}}}}); NBQ.Team.db.collection('daily').doc('u_zz').set({{days:{{}}}})")
        await pg.wait_for_timeout(300); await pg.mouse.click(195, 300); await pg.wait_for_timeout(200)
        await pg.click("#rBtns button:has-text('순위 보기')"); await pg.wait_for_timeout(500)
        board = await pg.inner_text("#dailyBoard")
        ok(f"board ranks by fewest turns with names", board.index("김두식") < board.index("권승현") < board.index("이기획") and "나 · 권승현" in board)
        ok("my rank shows 2nd", await pg.inner_text("#dsRank") == "2위")
        await pg.screenshot(path="shots/72-daily-board.png", full_page=True)
        # streak: played yesterday → today counts 2 days and pays 70
        await pg.evaluate(f"(()=>{{const y=new Date(Date.parse('{d}T00:00:00Z')-864e5).toISOString().slice(0,10);localStorage.setItem('nbq-daily',JSON.stringify({{days:{{[y]:{{best:9,attempts:1,at:1}}}},streak:{{last:y,n:1}}}}))}})()")
        c2 = await pg.evaluate("NBQ.wallet.coins"); out = await pg.evaluate("NBQ.Daily.record('clear', 12)")
        ok(f"streak continues to day {out['streak']} and pays {out['coins']}", out["streak"] == 2 and out["coins"] == 70 and await pg.evaluate("NBQ.wallet.coins") - c2 == 70)
        ok("countdown to KST midnight shown", ":" in await pg.inner_text("#dailyReset"))
        ok("no JS errors", not errs)
        if errs: print(errs[:3])
        await b.close()
    print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed")
asyncio.run(main())
