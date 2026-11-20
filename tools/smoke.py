"""Смоук-тест: поднимает статический сервер, создаёт демо-дни, снимает скриншоты.
Запуск: python3 tools/smoke.py  (нужен playwright + chrome)"""
import asyncio, http.server, threading, functools, os, sys, json
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()

async def main():
    serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        page = await b.new_page(viewport={'width': 1360, 'height': 1000})
        errs = []
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8765/index.html#home')
        await page.wait_for_selector('#consent-box')
        await page.screenshot(path=f'{OUT}/consent.png')
        await page.click('.modal-actions .btn.primary')
        await page.wait_for_timeout(300)
        await page.check('#consent-box')
        await page.click('.modal-actions .btn.primary')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/home_empty.png', full_page=True)
        await page.click('#btn-demo')
        await page.wait_for_function("document.querySelectorAll('.card').length >= 3", timeout=240000)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/home.png', full_page=True)
        await page.goto('http://127.0.0.1:8765/index.html#archive')
        await page.wait_for_selector('.card')
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/archive.png', full_page=True)
        await page.click('#a-view [data-v=cal]')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/calendar.png', full_page=True)
        await page.click('#a-view [data-v=grid]')
        ids = await page.eval_on_selector_all('.card', 'els => els.map(e => e.getAttribute("href"))')
        summary = []
        for k, href in enumerate(ids):
            await page.goto('http://127.0.0.1:8765/index.html' + href)
            await page.wait_for_selector('#d-canvas')
            await page.wait_for_timeout(2500)
            await page.click('[data-t=why]')
            await page.wait_for_timeout(300)
            await page.screenshot(path=f'{OUT}/day{k}.png', full_page=True)
            el = await page.query_selector('#d-canvas')
            await el.screenshot(path=f'{OUT}/card{k}_a.png')
            await page.wait_for_timeout(3000)
            await el.screenshot(path=f'{OUT}/card{k}_b.png')
            info = await page.evaluate("""async (h) => {
              const {getDay} = await import('./js/db.js');
              const d = await getDay(decodeURIComponent(h.slice(5)));
              return {title: d.title, style: d.params.style, film: d.params.film, mood: d.params.mood,
                      music: d.analysis.music, slide: d.params.slideSeconds};
            }""", href)
            summary.append(info)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        # ручной сценарий через мастер: своё фото + ссылка на песню
        await page.goto('http://127.0.0.1:8765/index.html#new')
        await page.wait_for_timeout(500)
        # начинаем с фото, а не с текста
        await page.click('[data-goto="2"]')
        await page.set_input_files('#f-photos', [f'{OUT}/card3_b.png'])
        await page.wait_for_timeout(800)
        assert await page.is_disabled('#wz-build'), 'build must be disabled without text/song'
        print('hint after photo:', await page.text_content('#wz-hint'))
        await page.screenshot(path=f'{OUT}/new2.png', full_page=True)
        await page.click('[data-goto="1"]')
        await page.fill('#f-text', 'Утро на крыше с друзьями, солнце, кофе и смех. Было тепло и легко!')
        await page.wait_for_timeout(400)
        print('auto title:', await page.input_value('#lv-title'))
        await page.fill('#lv-title', 'Крыша, кофе и мы')
        await page.screenshot(path=f'{OUT}/new1.png', full_page=True)
        await page.click('#wz-next')
        await page.wait_for_timeout(300)
        await page.click('#wz-next')
        await page.fill('#f-url', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
        await page.fill('#f-artist', 'Тестовый исполнитель')
        await page.select_option('#f-genre', 'pop')
        await page.screenshot(path=f'{OUT}/new3.png', full_page=True)
        assert not await page.is_disabled('#wz-build')
        await page.click('#wz-build')
        await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/building.png')
        await page.wait_for_url('**#day-**', timeout=60000)
        await page.wait_for_timeout(2000)
        t = await page.text_content('.day-title')
        print('manual day:', t, '| embed:', await page.get_attribute('.embed', 'src'))
        assert 'Крыша, кофе и мы' in t
        await page.click('#d-rename')
        await page.fill('#rn-in', 'Переименованный день')
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(500)
        assert 'Переименованный день' in await page.text_content('.day-title')
        await page.reload(); await page.wait_for_timeout(1500)
        assert 'Переименованный день' in await page.text_content('.day-title'), 'rename persisted'
        print('rename ok')
        # мобильная версия
        m = page
        await m.set_viewport_size({'width': 390, 'height': 844})
        await m.goto('http://127.0.0.1:8765/index.html#home')
        await m.wait_for_timeout(1500)
        await m.screenshot(path=f'{OUT}/m_home.png', full_page=True)
        await m.goto('http://127.0.0.1:8765/index.html' + ids[0])
        await m.wait_for_timeout(2500)
        await m.screenshot(path=f'{OUT}/m_day.png')
        await page.set_viewport_size({'width': 1360, 'height': 1000})
        # окно входа и настройки
        await page.goto('http://127.0.0.1:8765/index.html#settings')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/settings.png', full_page=True)
        await page.click('#btn-login')
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/login.png')
        print('\n'.join(errs) or 'no console errors')
        await b.close()

asyncio.run(main())
