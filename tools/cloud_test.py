"""E2E-тест облачной части с подменой ответов Supabase (сеть к Supabase из CI недоступна).
Проверяет: регистрацию, отправку дня и фото в облако, загрузку на «новом устройстве», выход, удаление аккаунта.
Запуск: python3 tools/cloud_test.py"""
import asyncio, http.server, threading, functools, os, json, time, re, sys
from urllib.parse import urlparse, parse_qs, unquote
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cloud'
os.makedirs(OUT, exist_ok=True)
SB = 'https://jnpbvtrhodsypuwlftga.supabase.co'
UID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

rows, files, calls = {}, {}, []
user = {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'judge@example.com',
        'user_metadata': {'name': 'Жюри Тестовое'}, 'app_metadata': {'provider': 'email'}, 'created_at': '2026-11-20T00:00:00Z'}

def session():
    return {'access_token': 'header.' + 'eyJzdWIiOiJhYWFhYWFhYS1iYmJiLWNjY2MtZGRkZC1lZWVlZWVlZWVlZWUiLCJleHAiOjk5OTk5OTk5OTl9' + '.sig',
            'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'refresh_token': 'r1', 'user': user}

async def handle(route):
    req = route.request
    u = urlparse(req.url)
    path, m = u.path, req.method
    calls.append(f'{m} {path}')
    hdr = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json'}
    if m == 'OPTIONS':
        return await route.fulfill(status=200, headers=hdr, body='')
    js = lambda obj, st=200: route.fulfill(status=st, headers=hdr, body=json.dumps(obj))
    if path == '/auth/v1/signup':
        body = json.loads(req.post_data or '{}')
        user['email'] = body.get('email'); user['user_metadata'] = body.get('data', {})
        return await js(session())
    if path == '/auth/v1/token':
        return await js(session())
    if path == '/auth/v1/user':
        return await js(user)
    if path == '/auth/v1/logout':
        return await route.fulfill(status=204, headers=hdr, body='')
    if path == '/rest/v1/days':
        if m == 'GET':
            data = sorted(rows.values(), key=lambda r: r['date'], reverse=True)
            return await js(data)
        if m == 'POST':
            row = json.loads(req.post_data)
            row = row[0] if isinstance(row, list) else row
            row['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
            rows[row['id']] = row
            single = 'vnd.pgrst.object' in (req.headers.get('accept') or '')
            return await js(row if single else [row], 201)
        if m == 'DELETE':
            q = parse_qs(u.query)
            if 'id' in q and q['id'][0].startswith('eq.'):
                rows.pop(q['id'][0][3:], None)
            else:
                rows.clear()
            return await route.fulfill(status=204, headers=hdr, body='')
    mo = re.match(r'/storage/v1/object/(?:authenticated/)?diary/(.+)', path)
    if mo and m in ('POST', 'PUT'):
        body = req.post_data_buffer
        ct = req.headers.get('content-type', '')
        if 'multipart/form-data' in ct:  # storage-js шлёт Blob как multipart, как настоящий Supabase
            boundary = ct.split('boundary=')[1].encode()
            for part in body.split(b'--' + boundary):
                head, _, data = part.partition(b'\r\n\r\n')
                if b'filename' in head or b'image/' in head:
                    body = data.rsplit(b'\r\n', 1)[0]
                    break
        files[unquote(mo.group(1))] = body
        return await js({'Key': 'diary/' + mo.group(1)})
    if mo and m == 'GET':
        data = files.get(unquote(mo.group(1)))
        if data is None:
            return await js({'error': 'not found'}, 404)
        return await route.fulfill(status=200, headers={**hdr, 'Content-Type': 'image/jpeg'}, body=data)
    if path == '/storage/v1/object/diary' and m == 'DELETE':
        for pth in json.loads(req.post_data or '{}').get('prefixes', []):
            files.pop(pth, None)
        return await js([])
    if path == '/functions/v1/delete-account':
        rows.clear(); files.clear()
        return await js({'ok': True})
    return await js({'error': 'unmocked ' + path}, 500)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8781), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()

async def main():
    serve()
    base = 'http://127.0.0.1:8781/index.html'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1300, 'height': 950})
        await ctx.route(SB + '/**', handle)
        await ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m_: errs.append(m_.text) if m_.type == 'error' else None)
        await page.goto(base + '#home')
        await page.check('#consent-box'); await page.click('.modal-actions .btn.primary')
        await page.wait_for_timeout(400)
        # регистрация
        await page.click('#btn-login'); await page.wait_for_timeout(300)
        await page.click('.auth-tabs [data-tab=up]')
        await page.fill('#au-name', 'Абиль'); await page.fill('#au-email', 'abil@example.com'); await page.fill('#au-pass', 'secret123')
        print('tabs:', await page.eval_on_selector_all('.auth-tabs button', 'els=>els.map(e=>e.dataset.tab+":"+e.className)'))
        await page.screenshot(path=f'{OUT}/signup.png')
        await page.click('#au-submit')  # без согласия — должна быть ошибка
        e1 = await page.text_content('#au-err')
        await page.check('#au-consent'); await page.click('#au-submit')
        await page.wait_for_selector('#btn-user', timeout=10000)
        await page.wait_for_timeout(800)
        print('1. регистрация: ошибка без согласия =', repr(e1), '| вошёл:', await page.get_attribute('#btn-user', 'title'))
        # создать день и отправить в облако
        await page.evaluate("""async()=>{const d=await import('./js/demo.js');const pl=await import('./js/pipeline.js');const c=await import('./js/cloud.js');
            const day=await pl.createDay(await d.buildDemoInput(d.DEMO_DAYS[0],0)); await c.pushDay(day);}""")
        print('2. в облаке строк:', len(rows), '| файлов:', len(files), sorted(files)[:3])
        r = next(iter(rows.values()))
        print('   у строки нет blob песни:', 'blob' not in r['song'], '| user_id верный:', r['user_id'] == UID)
        await page.goto(base + '#settings'); await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/settings_cloud.png', full_page=True)
        # «новое устройство»: стираем локальную базу аккаунта и синхронизируем
        await page.evaluate("""async()=>{const db=await import('./js/db.js'); await db.deleteAllDays();}""")
        n0 = await page.evaluate("""async()=>{const db=await import('./js/db.js'); return (await db.listDays()).length}""")
        res = await page.evaluate("""async()=>{const c=await import('./js/cloud.js'); return await c.syncAll()}""")
        n1 = await page.evaluate("""async()=>{const db=await import('./js/db.js'); const d=(await db.listDays())[0]; return [ (await db.listDays()).length, d.photos.length, d.photos[0].size>1000, d.title, d.thumb && d.thumb.size, new Uint8Array(await d.thumb.slice(0,3).arrayBuffer()).join(',')]}""")
        print('3. новое устройство: было', n0, '→ синхронизация', res, '→ стало', n1)
        await page.goto(base + '#archive'); await page.wait_for_selector('.card'); await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/archive_cloud.png')
        # меню пользователя
        await page.click('#btn-user'); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/menu.png')
        # выход: гостевой дневник пуст
        await page.click('#btn-logout'); await page.wait_for_timeout(800)
        g = await page.evaluate("""async()=>{const db=await import('./js/db.js'); return [db.currentDatabase(), (await db.listDays()).length]}""")
        print('4. после выхода база:', g)
        # вход обратно и удаление аккаунта
        await page.click('#btn-login'); await page.fill('#au-email', 'abil@example.com'); await page.fill('#au-pass', 'secret123'); await page.click('#au-submit')
        await page.wait_for_selector('#btn-user', timeout=10000)
        await page.goto(base + '#settings'); await page.wait_for_timeout(500)
        await page.click('#s-delacc'); await page.wait_for_timeout(300)
        await page.click('.modal-actions .btn.danger'); await page.wait_for_timeout(1200)
        print('5. удаление аккаунта: строк', len(rows), 'файлов', len(files), '| вошёл?', await page.query_selector('#btn-user') is not None)
        await page.goto(base + '#home'); await page.wait_for_timeout(500)
        await page.click('#btn-login'); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/login.png')
        print('ошибки:', [e for e in errs if 'fonts' not in e and 'ERR_FAILED' not in e] or 'нет')
        await b.close()

asyncio.run(main())
