# 구글플레이 스토어 이미지 다시 만들기 — 게임을 휴대폰 화면(360x640, 3배 = 1080x1920)으로 돌려 실제 화면을 찍어요.
# 실행: 레포 맨 위에서 python3 -m http.server 8765 를 켜 둔 뒤 python3 tools/store/shots.py [en|ko] (비우면 둘 다)
# 결과 (언어마다 그 언어 화면으로, 스크린샷은 이름순으로 스토어에 보여요):
#   영어(기본 언어)  release/googleplay/images/01~06-*.png, feature-1024x500.png
#   한국어          release/googleplay/images/ko-KR/01~06-*.png, feature-1024x500.png
#   아이콘(icon-512.png)은 글자가 없어서 images/에 하나만 두고 두 언어가 같이 써요.
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
URL = os.environ.get('PS_URL', 'http://localhost:8765/index.html')
ART = URL.rsplit('/', 1)[0] + '/tools/store/art.html'
IMAGES = os.path.join(ROOT, 'release', 'googleplay', 'images')
LANGS = {  # 게임 언어 → (결과 폴더, 기기 언어)
    'en': (IMAGES, 'en-US'),
    'ko': (os.path.join(IMAGES, 'ko-KR'), 'ko-KR'),
}
HIDE_DEV = "#ad-banner { display: none !important; } .toast { display: none !important; }"  # 개발용 '광고' 자리·안내 문구는 빼요
# 꾸준히 하던 사람의 기록: 지난달은 매일 깨서 트로피 1개, 이번 달은 어제까지 4일 연속 (찍는 날짜에 맞춰 만들어요)
PLAYER = """(() => {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const daily = {};
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  for (let day = 1; day <= last.getDate(); day++) daily[ymd(new Date(last.getFullYear(), last.getMonth(), day))] = { time: 180 + day * 7, moves: 100 + day, undos: day % 3 };
  for (let i = 1; i <= 4; i++) daily[ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))] = { time: 200 + i * 17, moves: 110 + i * 3, undos: i % 2 };
  return { stats: { played: 24, won: 15, bestTime: 212, bestMoves: 110, streak: 3, bestStreak: 6, best: {} },
           progress: { xp: 420, day: '', counters: {}, done: [] }, daily };
})()"""


def save_rgb(path):
    """스토어는 투명 영역(알파)이 있는 그림을 받지 않아요: RGB로 다시 저장"""
    Image.open(path).convert('RGB').save(path, optimize=True)


def fresh(browser, lang, locale, store=None):
    ctx = browser.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, is_mobile=True, has_touch=True, locale=locale)
    if store:
        ctx.add_init_script(f"if (!sessionStorage.getItem('s')) {{ sessionStorage.setItem('s', '1'); localStorage.setItem('pocket-solitaire:v1', JSON.stringify({store})); }}")  # noqa: E501
    page = ctx.new_page()
    page.goto(f"{URL}{'&' if '?' in URL else '?'}lang={lang}")  # 주소의 ?lang=은 저장하지 않고 그 언어로 열어요
    page.add_style_tag(content=HIDE_DEV)
    page.wait_for_timeout(1600)
    return ctx, page


def shots(browser, lang):
    out, locale = LANGS[lang]
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f[:2].isdigit() and f.endswith('.png'):
            os.remove(os.path.join(out, f))

    def shot(page, name):
        path = os.path.join(out, name)
        page.screenshot(path=path)
        save_rgb(path)
        print('saved', os.path.relpath(path, ROOT))

    # 1. 시작 화면
    ctx, page = fresh(browser, lang, locale, PLAYER)
    page.wait_for_timeout(1200)
    shot(page, '01-home.png')

    # 2. 클래식 플레이 + 힌트
    page.evaluate("() => window.__ps.startGame({ variant: 'klondike', drawCount: 1 })")
    page.wait_for_timeout(1600)
    for _ in range(3):
        page.locator('#stock-slot').tap(force=True)
        page.wait_for_timeout(250)
    page.locator('[data-act="hint"]').tap()
    page.wait_for_timeout(350)
    shot(page, '02-classic.png')

    # 3. 스파이더 (큰 카드)
    page.wait_for_timeout(1800)
    page.evaluate("() => window.__ps.startGame({ variant: 'spider', suits: 2 })")
    page.wait_for_timeout(1800)
    shot(page, '03-spider.png')

    # 4. 프리셀
    page.evaluate("() => window.__ps.startGame({ variant: 'freecell' })")
    page.wait_for_timeout(1800)
    shot(page, '04-freecell.png')

    # 5. 오늘의 할 일·오늘의 도전
    page.locator('[data-act="daily"]').tap()
    page.wait_for_timeout(700)
    shot(page, '05-daily.png')
    page.locator('[data-m="close"]').tap()
    page.wait_for_timeout(300)

    # 6. 클리어
    page.evaluate("() => window.__ps.startGame({ variant: 'klondike', drawCount: 1 })")
    page.wait_for_timeout(1500)
    page.evaluate("() => window.__ps.cheatWin()")
    page.wait_for_selector('.win-badge', timeout=20000)
    page.wait_for_timeout(1200)
    shot(page, '06-clear.png')
    ctx.close()

    # 7. 그래픽 이미지 1024x500 (글자가 그 언어로)
    ctx = browser.new_context(viewport={'width': 1024, 'height': 500}, device_scale_factor=1)
    page = ctx.new_page()
    page.goto(f"{ART}?lang={lang}#feature")
    page.wait_for_function("() => document.body.dataset.ready === '1'")
    page.wait_for_timeout(400)
    path = os.path.join(out, 'feature-1024x500.png')
    page.locator('#feature').screenshot(path=path)
    save_rgb(path)
    print('saved', os.path.relpath(path, ROOT))
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch()
    for lang in (sys.argv[1:] or list(LANGS)):
        shots(browser, lang)
    browser.close()
