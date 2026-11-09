# 오늘의 네모로직 브라우저 테스트: 화면 흐름 + 콘솔 에러 0건 + 모바일 스크린샷 (python3 tests/e2e_nemo.py <출력폴더>)
import sys, os, threading, http.server, functools, json, datetime
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "shots"
os.makedirs(OUT, exist_ok=True)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=root))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://localhost:{srv.server_port}/index.html"

d = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)
T = int(d.strftime("%Y%m%d"))
DEVICES = {"iphone14_390x844": (390, 844), "galaxy_small_360x640": (360, 640)}
errors, results = [], []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for dev, (w, h) in DEVICES.items():
        for scheme in ["light", "dark"]:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="ko-KR", color_scheme=scheme)
            page = ctx.new_page()
            page.on("console", lambda m: errors.append(f"{dev}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"{dev}: {e}"))
            page.goto(BASE); page.wait_for_timeout(300)
            page.click("#btn-start"); page.wait_for_timeout(200)
            tag = f"{dev}{'_dark' if scheme == 'dark' else ''}"
            if scheme == "dark":
                page.click("#btn-nemo"); page.wait_for_timeout(200); page.click("#dialog-actions .btn"); page.wait_for_timeout(100)
                sol = page.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).solution)")
                for i in [i for i, v in enumerate(sol) if v][:25]:
                    page.locator(f'.nc[data-i="{i}"]').dispatch_event("pointerdown"); page.locator("#nemo-board").dispatch_event("pointerup")
                page.screenshot(path=f"{OUT}/{tag}_nemo_board.png")
                check(f"{tag} 어두운 화면에서도 칠한 칸 표시", page.locator(".nc.f").count() >= 25)
                ctx.close(); continue

            # 1. 홈 카드
            check(f"{tag} 홈에 오늘의 네모로직 카드", "오늘의 네모로직" in page.inner_text("#nemo-card") and page.inner_text("#btn-nemo") == "시작하기")
            page.locator("#nemo-card").scroll_into_view_if_needed()
            page.screenshot(path=f"{OUT}/{tag}_n1_home_card.png")

            # 2. 처음: 하는 방법 안내
            page.click("#btn-nemo"); page.wait_for_timeout(250)
            check(f"{tag} 처음 열면 하는 방법 안내", "네모로직" in page.inner_text("#dialog-title") and page.locator(".rule-demo").count() == 1)
            page.screenshot(path=f"{OUT}/{tag}_n2_rules.png")
            page.click("#dialog-actions .btn"); page.wait_for_timeout(150)
            check(f"{tag} 10x10 판·단서 20줄", page.locator(".nc").count() == 100 and page.locator(".rc").count() == 10 and page.locator(".cc").count() == 10)
            box = page.locator("#nemo-board").bounding_box()
            check(f"{tag} 판이 화면 안에 다 들어와요 ({int(box['width'])}x{int(box['height'])})", box["x"] >= 0 and box["x"] + box["width"] <= w + 1 and box["y"] + box["height"] <= h)
            cs = page.evaluate("parseFloat(getComputedStyle(document.getElementById('nemo-board')).getPropertyValue('--cs'))")
            check(f"{tag} 칸 크기 손가락 기준 이상 ({cs}px)", cs >= 24)

            sol = page.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).solution)")
            def tap(i):
                page.locator(f'.nc[data-i="{i}"]').dispatch_event("pointerdown"); page.locator("#nemo-board").dispatch_event("pointerup")
            def cls(i): return page.locator(f'.nc[data-i="{i}"]').get_attribute("class")

            # 3. 맞게 칠하기 / 틀리게 칠하기
            good = next(i for i, v in enumerate(sol) if v)
            tap(good)
            check(f"{tag} 정답 칸 칠하기", " f" in f" {cls(good)}" and "실수 0" in page.inner_text("#nemo-mistakes"))
            bad = next(i for i, v in enumerate(sol) if not v and all(sol[(i // 10) * 10 + c] == 0 for c in range(10)) is False)
            tap(bad)
            check(f"{tag} 틀리면 ✕로 고치고 실수 1", "x" in cls(bad).split() and "err" in cls(bad).split() and "실수 1" in page.inner_text("#nemo-mistakes"))

            # 4. 쭉 긋기: 가장 긴 연속 칸을 손가락(마우스)으로 한 번에
            best = (0, 0, 0)
            for r in range(10):
                c = 0
                while c < 10:
                    if sol[r * 10 + c]:
                        s = c
                        while c < 10 and sol[r * 10 + c]: c += 1
                        if c - s > best[2] - best[1]: best = (r, s, c)
                    else: c += 1
            r, s, e = best
            def center(i):
                b = page.locator(f'.nc[data-i="{i}"]').bounding_box(); return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            x0, y0 = center(r * 10 + s); x1, y1 = center(r * 10 + e - 1)
            page.mouse.move(x0, y0); page.mouse.down()
            for k in range(1, 9): page.mouse.move(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8 + (2 if k % 2 else -2))
            page.mouse.up(); page.wait_for_timeout(100)
            filled = all(" f" in f" {cls(r * 10 + c)}" for c in range(s, e))
            check(f"{tag} 쭉 그어서 {e - s}칸 한 번에 칠하기", filled and "실수 1" in page.inner_text("#nemo-mistakes"))

            # 5. ✕ 모드
            page.click("#nemo-x")
            xs = next(i for i, v in enumerate(sol) if not v and "x" not in cls(i).split())
            tap(xs)
            check(f"{tag} ✕ 표시", "x" in cls(xs).split() and "err" not in cls(xs).split())
            page.click("#nemo-fill")

            # 6. 힌트
            page.click("#nemo-hint"); page.wait_for_timeout(150)
            check(f"{tag} 힌트: 이유 설명·줄 강조·3→2", "단서" in page.inner_text("#nemo-hint-text") and page.locator(".nc.hint-cell").count() == 1 and page.inner_text("#nemo-hint-badge") == "2")
            page.screenshot(path=f"{OUT}/{tag}_n3_hint.png")

            # 7. 나가기 → 새로고침 → 이어서 풀기
            page.wait_for_timeout(1100)
            page.click("#nemo-back"); page.wait_for_timeout(150)
            check(f"{tag} 홈 카드: 이어서 풀기", page.inner_text("#btn-nemo") == "이어서 풀기")
            page.reload(); page.wait_for_timeout(300); page.click("#btn-start"); page.wait_for_timeout(150)
            page.click("#btn-nemo"); page.wait_for_timeout(200)
            check(f"{tag} 새로고침 뒤 진행 유지(안내는 다시 안 나옴)", " f" in f" {cls(good)}" and "실수 1" in page.inner_text("#nemo-mistakes") and page.locator("#dialog.hidden").count() == 1)
            check(f"{tag} 토스 뒤로가기(게임 화면) true", page.evaluate("window.ncqBack()") is True and page.locator("#home.active").count() == 1)
            page.click("#btn-nemo"); page.wait_for_timeout(200)
            page.screenshot(path=f"{OUT}/{tag}_n4_board.png")

            # 8. 끝까지 풀기 → 그림 공개 → 결과
            for i, v in enumerate(sol):
                if v and " f" not in f" {cls(i)}":
                    tap(i)
                    if page.locator("#nemo-board.reveal").count(): break
            page.wait_for_timeout(900)
            check(f"{tag} 다 풀면 그림 공개", page.locator("#nemo-board.reveal").count() == 1 and "오늘의 그림은" in page.inner_text("#nemo-reveal"))
            page.screenshot(path=f"{OUT}/{tag}_n5_reveal.png")
            page.wait_for_timeout(1200)
            check(f"{tag} 결과 화면", page.locator("#nemo-result:not(.hidden)").count() == 1 and "완성" in page.inner_text("#nr-title") and page.inner_text("#nr-mistakes") == "1")
            pic_name = page.evaluate(f"import('./src/nonogram.js').then(m=>m.dailyNemo({T}).pic.name)")
            prev = page.inner_text("#nr-preview")
            rows_line = prev.split("\n")[2]
            check(f"{tag} 공유 글: 줄 10칸 상태·실수 줄 🟨·그림 비밀", len(rows_line) == 10 and "🟨" in rows_line and ("🟦" in rows_line or "🟩" in rows_line) and "네모로직" in prev and pic_name not in prev)
            page.screenshot(path=f"{OUT}/{tag}_n6_result.png")
            page.click("#nr-share"); page.wait_for_timeout(200)
            page.click("#nr-close"); page.wait_for_timeout(250)
            check(f"{tag} 홈 카드: 완료·결과 보기", page.inner_text("#btn-nemo") == "결과 보기" and "완성" in page.inner_text("#nemo-card-sub") and page.locator("#nemo-thumb.solved").count() == 1)
            page.locator("#nemo-card").scroll_into_view_if_needed()
            page.screenshot(path=f"{OUT}/{tag}_n7_home_done.png")
            page.click("#btn-nemo"); page.wait_for_timeout(200)
            check(f"{tag} 결과 다시 보기", page.locator("#nemo-result:not(.hidden)").count() == 1)
            check(f"{tag} 토스 뒤로가기(결과) true", page.evaluate("window.ncqBack()") is True and page.locator("#nemo-result.hidden").count() == 1)
            saved = page.evaluate("JSON.parse(localStorage.getItem('dailydoku.v1')).nemo")
            check(f"{tag} 기록 저장", str(T) in saved["daily"] and saved["daily"][str(T)]["mistakes"] == 1 and str(T) not in saved["progress"])

            # 9. 진행 초기화
            page.click("#btn-settings"); page.click("text=진행 초기화"); page.click("#dialog-actions >> text=초기화"); page.wait_for_timeout(200)
            check(f"{tag} 초기화하면 네모로직 기록도 지워져요", page.inner_text("#btn-nemo") == "시작하기" and not page.evaluate("JSON.parse(localStorage.getItem('dailydoku.v1') || '{\"nemo\":{\"daily\":{}}}').nemo.daily[" + str(T) + "]"))
            ctx.close()

    # 치트(테스트 기능)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="ko-KR")
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"cheat: {e}"))
    page.goto(BASE + "?cheat=1"); page.wait_for_timeout(300); page.click("#btn-start")
    page.click("#btn-nemo"); page.wait_for_timeout(200); page.click("#dialog-actions .btn")
    check("치트: 개발 중에만 정답 채우기 버튼", page.locator("#nemo-cheat:not(.hidden)").count() == 1)
    page.click("#nemo-cheat"); page.wait_for_timeout(2200)
    check("치트: 정답 채우기 → 결과·별 3개", page.locator("#nemo-result:not(.hidden)").count() == 1 and page.locator("#nr-stars .off").count() == 0)
    ctx.close()
    browser.close()

print("콘솔 에러:", len(errors)); [print("  ", e) for e in errors]
fails = [n for n, ok in results if not ok]
print(f"결과: {len(results)-len(fails)}/{len(results)} 통과")
sys.exit(1 if fails or errors else 0)
