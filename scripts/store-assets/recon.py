"""Shared helpers: loads the demo data into the dev server (npx vite --port 5175 --host 127.0.0.1).

Run capture.py for the real screenshots; running this file directly takes quick look-around shots."""
import json
import sys
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from demo_data import build  # noqa: E402

OUT = Path(__file__).parent / 'recon'
OUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:5175'
TODAY = datetime(2026, 11, 26, 18, 30)


def load(page, lang, theme='light'):
    data = build(lang, TODAY)
    page.goto(URL + '/categories')
    page.wait_for_load_state('networkidle')
    page.evaluate("""async ([data, lang, theme]) => {
        const m = await import('/src/core/db/db.ts');
        const settings = await m.importBackup(data);
        const cur = JSON.parse(localStorage.getItem('budgy-settings') || '{}');
        localStorage.setItem('budgy-settings', JSON.stringify({ ...cur, ...settings, theme }));
        localStorage.setItem('budgy-lang', lang);
        localStorage.removeItem('budgy-pick-currency');
        localStorage.setItem('budgy-backup-nudged-at', String(Date.now()));
    }""", [data, lang, theme])
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)


def shoot(page, name):
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / f'{name}.png'))


def new_page(p, lang='en', scheme='light'):
    browser = p.chromium.launch(headless=True, channel='msedge')
    ctx = browser.new_context(viewport={'width': 360, 'height': 720}, device_scale_factor=3, is_mobile=True,
                              has_touch=True, locale='en-US', color_scheme=scheme)
    ctx.clock.set_fixed_time(TODAY)
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    load(page, lang, scheme)
    return browser, page


if __name__ == '__main__':
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='msedge')
    ctx = browser.new_context(viewport={'width': 360, 'height': 720}, device_scale_factor=3, is_mobile=True,
                              has_touch=True, locale='en-US', color_scheme='light')
    ctx.clock.set_fixed_time(TODAY)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    load(page, 'en')
    for route in ['categories', 'transactions', 'overview', 'accounts']:
        page.goto(f'{URL}/{route}')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / f'{route}.png'))
    print('errors:', errors)
    browser.close()
