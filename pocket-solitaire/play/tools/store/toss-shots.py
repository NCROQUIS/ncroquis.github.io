# 토스(앱인토스) 콘솔 등록 이미지 만들기 — 게임을 토스 화면으로 돌려 실제 화면을 찍어요.
# 실행: 레포 맨 위에서 python3 -m http.server 8765 를 켜 둔 뒤 python3 tools/store/toss-shots.py
# 결과: release/toss/images/
#   logo.png 600x600 (앱 아이콘을 줄여서, 배경 꽉 참·모서리 둥글리지 않음)
#   thumbnail.png 1932x828 (실제 게임 화면 3장 + 이름, 작은 그림을 늘리지 않아요)
#   screen-1~4.png 636x1048 (세로 스크린샷)
import base64
import os
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
URL = os.environ.get('PS_URL', 'http://localhost:8765/index.html')
OUT = os.path.join(ROOT, 'release', 'toss', 'images')
os.makedirs(OUT, exist_ok=True)

# 토스 빌드처럼: 플랫폼 toss (광고 자리·인앱 상품·외부 링크가 빠져요), 찍는 데 쓰는 테스트 훅만 켜요
TOSS = "window.NCQ = { NCQ_PLATFORM: 'toss' }; window.NCQ_TEST_DEBUG = true;"
PLAYER = ("if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('pocket-solitaire:v1', JSON.stringify("
          "{ stats: { played: 24, won: 15, bestTime: 212, bestMoves: 110, streak: 3, bestStreak: 6, best: {} }, progress: { xp: 420, day: '', counters: {}, done: [] } })); }")
HIDE = ".toast { display: none !important; }"


def page_at(browser, w, h, dpr):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=True, has_touch=True, locale='ko-KR')
    ctx.add_init_script(TOSS)
    ctx.add_init_script(PLAYER)
    pg = ctx.new_page()
    pg.goto(URL)
    pg.add_style_tag(content=HIDE)
    pg.wait_for_timeout(1800)
    return ctx, pg


def scenes(pg, shot):
    """시작 화면 → 클래식 → 스파이더 → 클리어 순서로 찍어요"""
    pg.wait_for_timeout(800)
    shot('home')
    pg.evaluate("() => window.__ps.startGame({ variant: 'klondike', drawCount: 1 })")
    pg.wait_for_timeout(1600)
    for _ in range(3):
        pg.locator('#stock-slot').tap(force=True)
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(400)
    shot('classic')
    pg.evaluate("() => window.__ps.startGame({ variant: 'spider', suits: 2 })")
    pg.wait_for_timeout(1800)
    shot('spider')
    pg.evaluate("() => window.__ps.startGame({ variant: 'freecell' })")
    pg.wait_for_timeout(1800)
    shot('freecell')
    pg.evaluate("() => window.__ps.startGame({ variant: 'klondike', drawCount: 1 })")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__ps.cheatWin()")
    pg.wait_for_selector('.win-badge', timeout=20000)
    pg.wait_for_timeout(1400)
    shot('clear')


with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1) 로고: 앱 아이콘(1024)을 600으로
    Image.open(os.path.join(ROOT, 'assets', 'icon.png')).convert('RGB').resize((600, 600), Image.LANCZOS).save(os.path.join(OUT, 'logo.png'))
    print('saved logo.png')

    # 2) 세로 스크린샷 636x1048 (318x524 화면을 2배로)
    ctx, pg = page_at(browser, 318, 524, 2)
    names = {'home': 'screen-1-home.png', 'classic': 'screen-2-classic.png', 'spider': 'screen-3-spider.png', 'clear': 'screen-4-clear.png'}
    scenes(pg, lambda k: names.get(k) and (pg.screenshot(path=os.path.join(OUT, names[k])), print('saved', names[k])))
    ctx.close()

    # 3) 썸네일 재료: 360x760 화면을 1배로 (늘리지 않고 그대로 붙여요)
    raw = {}
    ctx, pg = page_at(browser, 360, 760, 1)
    scenes(pg, lambda k: raw.__setitem__(k, pg.screenshot()))
    ctx.close()

    b64 = lambda b: 'data:image/png;base64,' + base64.b64encode(b).decode()
    logo = b64(open(os.path.join(OUT, 'logo.png'), 'rb').read())
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      html, body {{ margin: 0; width: 1932px; height: 828px; overflow: hidden; }}
      body {{ font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; color: #fff;
        background: radial-gradient(ellipse 110% 100% at 50% 40%, transparent 55%, rgba(0,0,0,.3) 100%), radial-gradient(ellipse 130% 85% at 40% 20%, #2f8a5b, #14543a); }}
      .title {{ position: absolute; left: 110px; top: 50%; transform: translateY(-50%); }}
      .title img {{ width: 200px; height: 200px; border-radius: 44px; box-shadow: 0 14px 40px rgba(0,0,0,.35); }}
      .title h1 {{ margin: 30px 0 0; font-size: 90px; font-weight: 800; letter-spacing: -3px; text-shadow: 0 3px 0 rgba(0,0,0,.15), 0 10px 30px rgba(0,0,0,.25); }}
      .title p {{ margin: 14px 0 0; font-size: 44px; font-weight: 700; opacity: .92; }}
      .phones {{ position: absolute; right: 70px; top: 34px; display: flex; gap: 34px; }}
      .phones img {{ width: 360px; height: 760px; border-radius: 34px; box-shadow: 0 0 0 8px #0d1f17, 0 20px 50px rgba(0,0,0,.45); }}
      .phones img:nth-child(2) {{ transform: translateY(0); }}
    </style></head><body>
      <div class="title"><img src="{logo}"><h1>포켓 솔리테어</h1><p>클래식 · 스파이더 · 프리셀</p></div>
      <div class="phones"><img src="{b64(raw['classic'])}"><img src="{b64(raw['spider'])}"><img src="{b64(raw['clear'])}"></div>
    </body></html>"""
    ctx = browser.new_context(viewport={'width': 1932, 'height': 828}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.set_content(html)
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, 'thumbnail.png'))
    print('saved thumbnail.png')
    ctx.close()
    browser.close()
