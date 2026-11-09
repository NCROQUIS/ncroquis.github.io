# 브라우저 테스트: 화면 흐름 + 콘솔 에러 0건 + 모바일 스크린샷 (python3 tests/e2e.py <출력폴더>)
import sys, os, threading, http.server, functools, json, datetime
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "shots"
os.makedirs(OUT, exist_ok=True)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=root))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://localhost:{srv.server_port}/index.html"

def kst(days_ago=0):
    d = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9) - datetime.timedelta(days=days_ago)
    return int(d.strftime("%Y%m%d"))
T, Y, Y2, Y3 = kst(0), kst(1), kst(2), kst(3)
def rec(on, pic="cat"): return {"seconds": 200, "mistakes": 0, "stars": 3, "rowMistakes": [0]*10, "rowHinted": [0]*10, "hints": 0, "pic": pic, "solvedOn": on}
DEVICES = {"iphone14_390x844": (390, 844), "galaxy_small_360x640": (360, 640)}
errors, results = [], []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    def ctx_for(w, h, scheme="light", data=None):
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="ko-KR", color_scheme=scheme)
        if data is not None:
            ctx.add_init_script(f"if(!sessionStorage.getItem('__p')){{localStorage.setItem('dailynemo.v1', {json.dumps(json.dumps(data))});sessionStorage.setItem('__p','1')}}")
        return ctx
    def open_page(ctx, dev, url=BASE, start=True):
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"{dev}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"{dev}: {e}"))
        page.goto(url); page.wait_for_timeout(350)
        if start and page.locator("#splash.active").count(): page.click("#btn-start"); page.wait_for_timeout(200)
        return page
    def tap(page, i):
        page.locator(f'.nc[data-i="{i}"]').dispatch_event("pointerdown"); page.locator("#nemo-board").dispatch_event("pointerup")
    def cls(page, i): return page.locator(f'.nc[data-i="{i}"]').get_attribute("class").split()
    def center(page, i):
        b = page.locator(f'.nc[data-i="{i}"]').bounding_box(); return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    def drag(page, a, b):
        x0, y0 = center(page, a); x1, y1 = center(page, b)
        page.mouse.move(x0, y0); page.mouse.down()
        for k in range(1, 9): page.mouse.move(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8 + (2 if k % 2 else -2))
        page.mouse.up(); page.wait_for_timeout(100)
    def solve_rest(page, sol):
        for i, v in enumerate(sol):
            if page.locator("#nemo-board.reveal").count(): break
            if v and "f" not in cls(page, i): tap(page, i)

    for dev, (w, h) in DEVICES.items():
        # 0. 시작 화면
        ctx = ctx_for(w, h); pg = open_page(ctx, dev, start=False); pg.wait_for_timeout(1300)
        pg.screenshot(path=f"{OUT}/{dev}_00_splash.png")
        check(f"{dev} 시작 화면: 픽셀 무늬·연습 안내", pg.locator("#splash-pixels i").count() == 25 and "연습" in pg.inner_text("#splash-today"))
        check(f"{dev} 시작 화면 뒤로가기 false", pg.evaluate("window.ncqBack()") is False)
        pg.click(".splash-title"); pg.wait_for_timeout(200)
        check(f"{dev} 아무 곳 탭 → 홈", pg.locator("#home.active").count() == 1)

        # A. 신규 유저: 홈 → 5x5 연습(단계 안내·쭉 긋기·무료 힌트) → 오늘의 그림
        pg.screenshot(path=f"{OUT}/{dev}_01_home_new.png")
        check(f"{dev} 신규: 연습 카드·오늘의 그림 잠김", pg.locator("#first-card:not(.hidden)").count() == 1 and pg.locator("#btn-daily").is_disabled())
        pg.click("#btn-first"); pg.wait_for_timeout(250)
        check(f"{dev} 연습: 5x5 판·안내 1단계·반짝이는 줄", pg.locator(".nc").count() == 25 and "쭉 그어" in pg.inner_text("#coach-text") and pg.locator(".nc.coach-line").count() == 5)
        check(f"{dev} 연습은 하는 방법 창 없이 바로", pg.locator("#dialog.hidden").count() == 1)
        pg.screenshot(path=f"{OUT}/{dev}_02_intro_coach.png")
        drag(pg, 5, 9)
        check(f"{dev} 쭉 그어서 5칸 칠하기 → 안내 2단계", all("f" in cls(pg, i) for i in range(5, 10)) and "아래 줄" in pg.inner_text("#coach-text"))
        drag(pg, 10, 14)
        check(f"{dev} 안내 3단계(혼자 풀기·무료 힌트)", "힌트" in pg.inner_text("#coach-text") and pg.inner_text("#nemo-hint-badge") == "무료")
        pg.click("#nemo-hint"); pg.wait_for_timeout(150)
        check(f"{dev} 연습 힌트는 무료(3개 그대로)", pg.locator("#nemo-hint-box:not(.hidden)").count() == 1 and pg.evaluate("JSON.parse(localStorage.getItem('dailynemo.v1')).hints") == 3)
        isol = pg.evaluate("import('./src/nonogram.js').then(m=>m.puzzleOf(m.INTRO_PIC).solution)")
        solve_rest(pg, isol); pg.wait_for_timeout(2300)
        check(f"{dev} 연습 완료 → 결과(공유 없음)", "연습 완료" in pg.inner_text("#nr-title") and pg.locator("#nr-share.hidden").count() == 1)
        pg.screenshot(path=f"{OUT}/{dev}_03_intro_done.png")
        pg.click("#nr-close"); pg.wait_for_timeout(300)
        check(f"{dev} 바로 오늘의 그림 + 하는 방법 창", "오늘의 그림" in pg.inner_text("#nemo-mode") and pg.locator(".rule-demo").count() == 1)
        pg.screenshot(path=f"{OUT}/{dev}_04_rules.png")
        pg.click("#dialog-actions .btn"); pg.wait_for_timeout(150)
        check(f"{dev} 10x10 판", pg.locator(".nc").count() == 100 and pg.locator(".rc").count() == 10)
        box = pg.locator("#nemo-board").bounding_box()
        check(f"{dev} 판이 화면 안에 ({int(box['width'])}x{int(box['height'])})", box["x"] >= 0 and box["x"] + box["width"] <= w + 1 and box["y"] + box["height"] <= h)
        sol = pg.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).solution)")
        good = next(i for i, v in enumerate(sol) if v); tap(pg, good)
        bad = next(i for i, v in enumerate(sol) if not v and any(sol[(i // 10) * 10 + c] for c in range(10)) and "x" not in cls(pg, i))
        tap(pg, bad)
        check(f"{dev} 틀리면 ✕로 고치고 실수 1", "err" in cls(pg, bad) and "실수 1" in pg.inner_text("#nemo-mistakes"))
        pg.click("#nemo-x")
        xs = next(i for i, v in enumerate(sol) if not v and "x" not in cls(pg, i)); tap(pg, xs)
        check(f"{dev} ✕ 표시", "x" in cls(pg, xs) and "err" not in cls(pg, xs))
        pg.click("#nemo-fill")
        pg.click("#nemo-hint"); pg.wait_for_timeout(150)
        check(f"{dev} 힌트 이유·3→2", "단서" in pg.inner_text("#nemo-hint-text") and pg.inner_text("#nemo-hint-badge") == "2")
        pg.screenshot(path=f"{OUT}/{dev}_05_hint.png")
        pg.click("#nemo-back"); pg.reload(); pg.wait_for_timeout(300); pg.click("#btn-start"); pg.wait_for_timeout(150)
        check(f"{dev} 연습 카드 사라짐·이어서 풀기", pg.locator("#first-card.hidden").count() == 1 and pg.inner_text("#btn-daily") == "이어서 풀기")
        pg.click("#btn-daily"); pg.wait_for_timeout(250)
        check(f"{dev} 새로고침 뒤 진행 유지", "f" in cls(pg, good) and "실수 1" in pg.inner_text("#nemo-mistakes") and pg.locator("#dialog.hidden").count() == 1)
        solve_rest(pg, sol); pg.wait_for_timeout(900)
        check(f"{dev} 그림 공개", "오늘의 그림은" in pg.inner_text("#nemo-reveal"))
        pg.screenshot(path=f"{OUT}/{dev}_06_reveal.png")
        pg.wait_for_timeout(1200)
        name = pg.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).pic.name)")
        prev = pg.inner_text("#nr-preview")
        check(f"{dev} 결과: 별 2개·공유 글(그림 비밀)", pg.locator("#nr-stars .off").count() == 1 and prev.startswith("데일리네모") and name not in prev and len(prev.split("\n")[2]) == 10)
        pg.screenshot(path=f"{OUT}/{dev}_07_result.png")
        pg.click("#nr-close"); pg.wait_for_timeout(250)
        check(f"{dev} 홈: 완료·연속 1·모은 그림 1", "결과 보기" in pg.inner_text("#btn-daily") and pg.inner_text("#streak-cur") == "1" and pg.inner_text("#daily-count") == "1")
        pg.screenshot(path=f"{OUT}/{dev}_08_home_done.png")
        pg.click("#btn-records"); pg.wait_for_timeout(200)
        check(f"{dev} 보관함: 모은 그림 1/16", pg.inner_text("#collect-count") == "1/16" and pg.locator(".col-item.got").count() == 1)
        pg.screenshot(path=f"{OUT}/{dev}_09_records.png")
        check(f"{dev} 보관함 뒤로가기 true", pg.evaluate("window.ncqBack()") is True and pg.locator("#home.active").count() == 1)
        # 초기화
        pg.click("#btn-settings"); pg.wait_for_timeout(150); pg.click("text=진행 초기화"); pg.click("#dialog-actions >> text=초기화"); pg.wait_for_timeout(200)
        check(f"{dev} 진행 초기화", pg.locator("#first-card:not(.hidden)").count() == 1 and pg.inner_text("#daily-count") == "0")
        ctx.close()

        # B. 어제를 놓침 → 광고 보고 어제 그림 → 연속 기록 지킴 / 친구 순위
        ctx = ctx_for(w, h, data={"daily": {str(Y2): rec(Y2), str(Y3): rec(Y3, "dog")}, "introDone": True, "rulesSeen": True, "settings": {"name": "승현"}})
        pg = open_page(ctx, dev, f"{BASE}?d={T}&vs=250&n=민지&cheat=1")
        check(f"{dev} 연속 위험 카드·친구 도전장", pg.locator("#risk-card:not(.hidden)").count() == 1 and "민지" in pg.inner_text("#vs-banner"))
        pg.screenshot(path=f"{OUT}/{dev}_10_risk_vs.png")
        pg.click("#btn-risk"); pg.wait_for_timeout(150)
        check(f"{dev} 지난 그림 광고 안내", "그림 열기" in pg.inner_text("#dialog-title"))
        pg.click("text=광고 보고 열기"); pg.wait_for_timeout(300)
        check(f"{dev} 어제 그림 화면", "오늘" not in pg.inner_text("#nemo-mode") and "그림" in pg.inner_text("#nemo-mode"))
        pg.click("#nemo-cheat"); pg.wait_for_timeout(2300); pg.click("#nr-close"); pg.wait_for_timeout(250)
        check(f"{dev} 연속 기록 지킴(3일)", pg.inner_text("#streak-cur") == "3" and pg.locator("#risk-card.hidden").count() == 1)
        pg.click("#btn-daily"); pg.wait_for_timeout(250)
        check(f"{dev} 친구 기록 줄", "민지" in pg.inner_text("#vs-line"))
        pg.click("#nemo-cheat"); pg.wait_for_timeout(2300)
        check(f"{dev} 결과에 친구 순위", "친구 2명 중" in pg.inner_text("#nr-rank"))
        pg.click("#nr-close"); pg.wait_for_timeout(200)
        check(f"{dev} 홈 친구 순위", pg.locator("#ranking-list li").count() == 2)
        ctx.close()

        # C. 어두운 화면
        ctx = ctx_for(w, h, "dark", {"introDone": True, "rulesSeen": True})
        pg = open_page(ctx, dev)
        pg.screenshot(path=f"{OUT}/{dev}_11_home_dark.png")
        pg.click("#btn-daily"); pg.wait_for_timeout(200)
        sol = pg.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).solution)")
        for i in [i for i, v in enumerate(sol) if v][:30]: tap(pg, i)
        pg.screenshot(path=f"{OUT}/{dev}_12_game_dark.png")
        check(f"{dev} 어두운 화면 배경", pg.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(244, 246, 241)")
        ctx.close()
    browser.close()

print("콘솔 에러:", len(errors)); [print("  ", e) for e in errors]
fails = [n for n, ok in results if not ok]
print(f"결과: {len(results)-len(fails)}/{len(results)} 통과")
sys.exit(1 if fails or errors else 0)
