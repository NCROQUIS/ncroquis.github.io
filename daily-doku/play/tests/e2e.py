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
REC = {"seconds": 300, "mistakes": 0, "stars": 3, "boxMistakes": [0]*9, "hinted": [0]*9, "difficulty": "easy"}

DEVICES = {"iphone14_390x844": (390, 844), "galaxy_small_360x640": (360, 640)}
errors, results = [], []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

def empties(page):
    return page.evaluate("[...document.querySelectorAll('.cell')].map((x,i)=>x.textContent?-1:i).filter(i=>i>=0)")
def solution(page, key):
    return page.evaluate(f"import('./src/sudoku.js').then(m=>m.daily({key}).solution)")
def start(page):
    # 시작 화면 → 홈
    if page.locator("#splash.active").count():
        page.click("#btn-start"); page.wait_for_timeout(150)
def preset(ctx, data):
    ctx.add_init_script(f"if(!sessionStorage.getItem('__p')){{localStorage.setItem('dailydoku.v1', {json.dumps(json.dumps(data))});sessionStorage.setItem('__p','1')}}")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    def new_ctx(dev, w, h, scheme="light"):
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="ko-KR", color_scheme=scheme)
        return ctx
    def new_page(ctx, dev, url=BASE):
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"{dev}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"{dev}: {e}"))
        page.goto(url); page.wait_for_timeout(300)
        start(page)
        return page

    for dev, (w, h) in DEVICES.items():
        # 0. 시작 화면: 처음 / 연속 기록 중 / 친구 도전장
        ctx = new_ctx(dev, w, h)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{dev}: {e}"))
        pg.goto(BASE); pg.wait_for_timeout(1600)
        pg.screenshot(path=f"{OUT}/{dev}_00_splash.png")
        check(f"{dev} 시작 화면: 3x3 숫자·신규 안내", pg.locator("#splash-grid span").count() == 9 and "첫 판" in pg.inner_text("#splash-today"))
        check(f"{dev} 시작 화면에서 뒤로가기 false", pg.evaluate("window.ncqBack()") is False)
        pg.click(".splash-title"); pg.wait_for_timeout(200)
        check(f"{dev} 아무 곳 탭 → 홈", pg.locator("#home.active").count() == 1)
        ctx.close()
        ctx = new_ctx(dev, w, h, "dark")
        preset(ctx, {"daily": {str(Y): REC, str(Y2): REC}, "classicUnlocked": True})
        pg = ctx.new_page(); pg.goto(f"{BASE}?d={T}&vs=245&n=민지"); pg.wait_for_timeout(1600)
        check(f"{dev} 시작 화면: 연속 기록·도전장", "2일 연속" in pg.inner_text("#splash-today") and "도전장" in pg.inner_text("#splash-vs"))
        pg.screenshot(path=f"{OUT}/{dev}_00_splash_dark_vs.png")
        ctx.close()

        # A. 신규 유저: 쉬운 첫 판(단계별 안내) → 오늘의 한 판 (입력·메모·자동 메모·힌트 설명·이어하기·결과 이미지)
        ctx = new_ctx(dev, w, h); page = new_page(ctx, dev, BASE + "?cheat=1")
        page.screenshot(path=f"{OUT}/{dev}_01_home_new.png")
        check(f"{dev} 신규: 첫 판 카드·오늘의 한 판 잠김·클래식 잠김",
              page.locator("#first-card:not(.hidden)").count() == 1 and page.locator("#btn-daily").is_disabled() and page.locator(".diff-btn").first.is_disabled())
        page.click("#btn-first"); page.wait_for_timeout(200)
        check(f"{dev} 1단계: 4×4 판·빈칸 6", "연습 1/2" in page.inner_text("#game-mode") and page.locator(".cell").count() == 16 and len(empties(page)) == 6 and page.locator(".num").count() == 4)
        check(f"{dev} 안내 1: 칸 고르기 + 반짝이는 칸", "빈칸을 하나" in page.inner_text("#coach-text") and page.locator(".cell.coach-cell").count() == 1)
        page.screenshot(path=f"{OUT}/{dev}_02_stage1_coach.png")
        cc = page.evaluate("[...document.querySelectorAll('.cell')].findIndex(x=>x.classList.contains('coach-cell'))")
        page.locator(".cell").nth(cc).dispatch_event("pointerdown"); page.wait_for_timeout(100)
        check(f"{dev} 안내 2: 숫자 넣기 + 답 표시", "숫자를 눌러" in page.inner_text("#coach-text") and page.locator(".num.suggest").count() == 1)
        page.click(".num.suggest"); page.wait_for_timeout(100)
        check(f"{dev} 안내 3: 힌트 눌러 보기", "힌트" in page.inner_text("#coach-text") and page.locator("#t-hint.coach-tool").count() == 1 and page.inner_text("#hint-badge") == "무료")
        page.click("#t-hint"); page.wait_for_timeout(100)
        check(f"{dev} 첫 판 힌트: 무료·하나만 남은 칸 설명", page.locator("#hint-box:not(.hidden)").count() == 1 and page.evaluate("JSON.parse(localStorage.getItem('dailydoku.v1')).hints") == 3)
        page.screenshot(path=f"{OUT}/{dev}_03_stage1_hint.png")
        page.click("#hint-fill"); page.wait_for_timeout(100)
        check(f"{dev} 안내 5: 혼자 풀기", "혼자 끝까지" in page.inner_text("#coach-text"))
        page.click("#coach-ok")
        page.click("#t-cheat"); page.wait_for_timeout(1300)
        check(f"{dev} 1단계 완료·건너뛰기 버튼", "1단계 완료" in page.inner_text("#result-title") and "바로 오늘의 한 판" in page.inner_text("#btn-share") and "9×9" in page.inner_text("#result-rank"))
        page.screenshot(path=f"{OUT}/{dev}_04_stage1_done.png")
        page.click("#btn-result-next"); page.wait_for_timeout(300)
        check(f"{dev} 2단계: 바로 9×9·빈칸 약 20·안내", "연습 2/2" in page.inner_text("#game-mode") and page.locator(".cell").count() == 81 and 19 <= len(empties(page)) <= 21 and "9×9" in page.inner_text("#coach-text"))
        page.screenshot(path=f"{OUT}/{dev}_05_stage2_9x9.png")
        page.click("#btn-back"); page.wait_for_timeout(150)
        check(f"{dev} 홈: 이어서 하기 2/2단계", "2/2단계" in page.inner_text("#btn-first"))
        page.click("#btn-first"); page.wait_for_timeout(200)
        page.click("#coach-ok"); page.click("#t-cheat"); page.wait_for_timeout(1300)
        check(f"{dev} 첫 판 완료 화면", "첫 판 완료" in page.inner_text("#result-title") and page.locator("#btn-share.hidden").count() == 1)
        page.click("#btn-result-next"); page.wait_for_timeout(300)
        check(f"{dev} 바로 오늘의 한 판으로", "오늘의 한 판" in page.inner_text("#game-mode"))
        sol = solution(page, T); em = empties(page)
        a, b, c = em[0], em[1], em[2]
        page.locator(".cell").nth(a).dispatch_event("pointerdown"); page.click(f'.num[data-n="{sol[a]}"]')
        check(f"{dev} 정답 입력", page.locator(".cell").nth(a).text_content() == str(sol[a]))
        page.locator(".cell").nth(b).dispatch_event("pointerdown"); page.click(f'.num[data-n="{sol[b] % 9 + 1}"]')
        check(f"{dev} 오답·실수 1", "wrong" in page.locator(".cell").nth(b).get_attribute("class") and "실수 1" in page.inner_text("#game-mistakes"))
        page.click("#t-undo")
        check(f"{dev} 되돌리기(맞힌 칸은 유지)", page.locator(".cell").nth(b).text_content() == "" and page.locator(".cell").nth(a).text_content() == str(sol[a]))
        page.click("#t-auto"); page.wait_for_timeout(100)
        check(f"{dev} 자동 메모", page.locator(".cell .notes").count() == len(em) - 1)
        page.click("#t-hint"); page.wait_for_timeout(150)
        hint_text = page.inner_text("#hint-text")
        check(f"{dev} 힌트 설명·강조", len(hint_text) > 15 and page.locator(".cell.hint-cell").count() == 1 and page.locator(".cell.hint-unit").count() >= 8)
        page.screenshot(path=f"{OUT}/{dev}_02_hint.png")
        hc = page.evaluate("[...document.querySelectorAll('.cell')].findIndex(x=>x.classList.contains('hint-cell'))")
        page.click("#hint-fill")
        check(f"{dev} 힌트 채우기·힌트 3→2", page.locator(".cell").nth(hc).text_content() == str(sol[hc]) and page.inner_text("#hint-badge") == "2")
        page.click("#btn-back"); page.reload(); page.wait_for_timeout(300); start(page)
        check(f"{dev} 첫 판 뒤에는 첫 판 카드 없음", page.locator("#first-card.hidden").count() == 1)
        check(f"{dev} 이어서 풀기", "이어서" in page.inner_text("#btn-daily"))
        page.click("#btn-daily"); page.wait_for_timeout(200)
        check(f"{dev} 새로고침 뒤 진행 유지", page.locator(".cell").nth(hc).text_content() == str(sol[hc]))
        page.click("#t-cheat"); page.wait_for_timeout(1300)
        check(f"{dev} 결과 이미지 카드", page.locator("#share-img:not(.hidden)").count() == 1 and page.evaluate("document.getElementById('share-img').naturalWidth") == 900)
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/{dev}_03_result.png")
        check(f"{dev} 새 배지 알림", "새 배지" in page.inner_text("#toast"))
        page.click("#btn-result-next"); page.wait_for_timeout(300)
        check(f"{dev} 연속 1일·클래식 해금", page.inner_text("#streak-cur") == "1" and not page.locator(".diff-btn").first.is_disabled())
        ctx.close()

        # A2. 1단계 뒤 '바로 오늘의 한 판'으로 건너뛰기
        ctx = new_ctx(dev, w, h); page = new_page(ctx, dev, BASE + "?cheat=1")
        page.click("#btn-first"); page.wait_for_timeout(200); page.click("#t-cheat"); page.wait_for_timeout(1300)
        page.click("#btn-share"); page.wait_for_timeout(300)
        check(f"{dev} 건너뛰기 → 오늘의 한 판", "오늘의 한 판" in page.inner_text("#game-mode") and page.evaluate("JSON.parse(localStorage.getItem('dailydoku.v1')).tutorialDone"))
        ctx.close()

        # B. 친구 기록 링크 2개 → 오늘의 친구 순위
        ctx = new_ctx(dev, w, h)
        preset(ctx, {"daily": {str(T): REC}, "classicUnlocked": True, "settings": {"name": "승현"}})
        page = new_page(ctx, dev, f"{BASE}?d={T}&vs=250&n=민지")
        page.goto(f"{BASE}?d={T}&vs=420&n=두식"); page.wait_for_timeout(300); start(page)
        rows = page.locator("#ranking-list li")
        check(f"{dev} 친구 순위 3명·나 2위", rows.count() == 3 and "승현" in rows.nth(1).inner_text() and "민지" in rows.nth(0).inner_text())
        page.screenshot(path=f"{OUT}/{dev}_04_friends.png")
        page.click("#btn-daily"); page.wait_for_timeout(300)
        check(f"{dev} 결과에 친구 순위", "3명 중 2위" in page.inner_text("#result-rank"))
        ctx.close()

        # C. 어제를 놓침 → 광고 보고 어제 문제 풀기 → 연속 기록 지킴, 보관함
        ctx = new_ctx(dev, w, h)
        preset(ctx, {"daily": {str(Y2): REC, str(Y3): REC}, "classicUnlocked": True})
        page = new_page(ctx, dev, BASE + "?cheat=1")
        check(f"{dev} 연속 기록 위험 카드", page.locator("#risk-card:not(.hidden)").count() == 1 and "2일 연속" in page.inner_text("#risk-title"))
        page.screenshot(path=f"{OUT}/{dev}_05_risk.png")
        page.click("#btn-risk"); page.wait_for_timeout(150)
        check(f"{dev} 지난 문제 광고 안내", "문제 열기" in page.inner_text("#dialog-title"))
        page.click("text=광고 보고 열기"); page.wait_for_timeout(300)
        check(f"{dev} 어제 문제 화면", "문제" in page.inner_text("#game-mode") and "오늘" not in page.inner_text("#game-mode"))
        page.click("#t-cheat"); page.wait_for_timeout(1300)
        page.click("#btn-result-next"); page.wait_for_timeout(300)
        check(f"{dev} 연속 기록 지킴(3일)", page.inner_text("#streak-cur") == "3" and page.locator("#risk-card.hidden").count() == 1)
        page.click("#btn-records"); page.wait_for_timeout(200)
        check(f"{dev} 보관함 달력: 메운 날·잠긴 날", page.locator(f'.cal button.late[data-k="{Y}"]').count() == 1 and page.locator(".cal button.done").count() >= (2 if Y3 // 100 == T // 100 else 0))
        page.screenshot(path=f"{OUT}/{dev}_06_records.png")
        page.click("#btn-records-back")
        ctx.close()

        # D. 클래식 어려움: 힌트(고급 단계 안내)·실수 3번·설정(큰 글씨·어둡게·실수 제한 끄기)
        ctx = new_ctx(dev, w, h)
        preset(ctx, {"daily": {str(T): REC}, "classicUnlocked": True})
        page = new_page(ctx, dev)
        page.click('.diff-btn[data-diff="hard"]'); page.wait_for_timeout(300)
        em = empties(page)
        check(f"{dev} 클래식 어려움 단서 수", 81 - len(em) <= 33)
        for e0 in em[:6]:
            if page.locator("#dialog:not(.hidden)").count(): break
            page.locator(".cell").nth(e0).dispatch_event("pointerdown")
            for n in range(1, 10):
                if page.locator("#dialog:not(.hidden)").count(): break
                if page.locator(f'.num[data-n="{n}"].used').count(): continue
                page.click(f'.num[data-n="{n}"]')
                cl = page.locator(".cell").nth(e0)
                if "wrong" not in cl.get_attribute("class") and cl.text_content(): break
        page.wait_for_timeout(200)
        check(f"{dev} 실수 3번 안내", "실수 3번" in page.inner_text("#dialog-title"))
        page.click("#dialog-actions .btn >> nth=-1"); page.wait_for_timeout(200)
        page.click("#btn-settings"); page.wait_for_timeout(150)
        page.click("#sw-big"); page.click('#seg-theme button[data-v="dark"]'); page.click("#sw-limit")
        page.fill("#set-name", "승현")
        page.screenshot(path=f"{OUT}/{dev}_07_settings_dark_big.png")
        page.click("#dialog-actions >> text=닫기"); page.wait_for_timeout(150)
        st = page.evaluate("JSON.parse(localStorage.getItem('dailydoku.v1')).settings")
        check(f"{dev} 설정 저장", st["big"] and st["theme"] == "dark" and not st["mistakeLimit"] and st["name"] == "승현")
        check(f"{dev} 어둡게 적용", page.evaluate("document.documentElement.dataset.theme") == "dark" and page.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(246, 243, 236)")
        page.click('.diff-btn[data-diff="expert"]'); page.wait_for_timeout(300)
        page.click("#t-hint"); page.wait_for_timeout(150)
        check(f"{dev} 실수 제한 끔", "/" not in page.inner_text("#game-mistakes"))
        page.screenshot(path=f"{OUT}/{dev}_08_game_dark_big.png")
        page.click("#hint-close"); page.click("#btn-back")
        page.click("#btn-settings"); page.click("text=진행 초기화"); page.click("#dialog-actions >> text=초기화"); page.wait_for_timeout(200)
        check(f"{dev} 초기화", page.inner_text("#streak-cur") == "0" and page.locator(".diff-btn").first.is_disabled())
        check(f"{dev} 뒤로가기 첫 화면 false", page.evaluate("window.ncqBack()") is False)
        ctx.close()

    # 햅틱: 안드로이드(navigator.vibrate)와 토스(window.ncqHaptic) 경로
    for label, init in [("vibrate", "window.__h=[];navigator.vibrate=(p)=>{window.__h.push(JSON.stringify(p));return true};"),
                        ("toss", "window.__h=[];window.ncqHaptic=(t)=>window.__h.push(t);")]:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script(init)
        preset(ctx, {"tutorialDone": True})
        page = new_page(ctx, "haptic")
        page.click("#btn-daily"); page.wait_for_timeout(200)
        sol = solution(page, T); em = empties(page)
        page.locator(".cell").nth(em[0]).dispatch_event("pointerdown"); page.click(f'.num[data-n="{sol[em[0]]}"]')
        page.locator(".cell").nth(em[1]).dispatch_event("pointerdown"); page.click(f'.num[data-n="{sol[em[1]] % 9 + 1}"]')
        page.click("#t-note"); page.click("#t-hint")
        hh = page.evaluate("window.__h")[1:]  # 맨 앞은 시작 화면 탭
        exp = ["6", "12", "6", "[40,40,40]", "6", "20"] if label == "vibrate" else ["tickWeak", "tap", "tickWeak", "error", "tickWeak", "basicMedium"]
        check(f"햅틱 {label}: 시작·고르기·정답·오답·메모·힌트 {hh[:6]}", hh[:6] == exp)
        page.click("#hint-close"); page.click("#btn-back"); page.click("#btn-settings"); page.click("#sw-haptic"); page.click("#dialog-actions >> text=닫기")
        n = len(page.evaluate("window.__h"))
        page.click("#btn-daily"); page.wait_for_timeout(200)
        page.locator(".cell").nth(em[2]).dispatch_event("pointerdown"); page.click(f'.num[data-n="{sol[em[2]]}"]')
        check(f"햅틱 {label}: 끄면 멈춤", len(page.evaluate("window.__h")) == n)
        ctx.close()

    # 메모 숫자 자리 고정: 다른 숫자를 메모해도 각 숫자의 위치가 그대로여야 해요 (9×9와 4×4)
    for label, data_, open_btn, combos in [
        ("9×9", {"tutorialDone": True}, "#btn-daily", [[5], [1, 5], [5, 9], [1, 5, 9], [9], [3, 9], [7]]),
        ("4×4", {}, "#btn-first", None),
    ]:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        preset(ctx, data_)
        page = new_page(ctx, "notes")
        page.click(open_btn); page.wait_for_timeout(200)
        if page.locator("#coach:not(.hidden)").count() and page.locator("#coach-ok:not(.hidden)").count(): page.click("#coach-ok")
        e = page.evaluate("[...document.querySelectorAll('.cell')].findIndex(x=>!x.textContent)")
        page.locator(".cell").nth(e).dispatch_event("pointerdown"); page.click("#t-note")
        if combos is None:  # 4×4: 다 쓴 숫자는 숫자판에서 사라져서 남은 숫자로 조합해요
            av = page.evaluate("[...document.querySelectorAll('.num:not(.used)')].map(b=>+b.dataset.n)")
            combos = [[av[-1]], av[:], [av[0], av[-1]], [av[-1]]]
        seen = {}
        for combo in combos:
            cur = set(page.evaluate(f"[...document.querySelectorAll('.cell')[{e}].querySelectorAll('.notes span')].filter(s=>s.textContent).map(s=>+s.textContent)"))
            for n in sorted(set(combo) ^ cur): page.click(f'.num[data-n="{n}"]')
            for n in combo:
                r = page.evaluate(f"(()=>{{const s=document.querySelectorAll('.cell')[{e}].querySelectorAll('.notes span')[{n - 1}].getBoundingClientRect();return [Math.round(s.x),Math.round(s.y)]}})()")
                seen.setdefault(n, set()).add(tuple(r))
        check(f"메모 숫자 자리 고정 {label}", all(len(v) == 1 for v in seen.values()))
        ctx.close()
    browser.close()

print("콘솔 에러:", len(errors)); [print("  ", e) for e in errors]
fails = [n for n, ok in results if not ok]
print(f"결과: {len(results)-len(fails)}/{len(results)} 통과")
sys.exit(1 if fails or errors else 0)
