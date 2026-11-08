"""Raw screenshots (1080x2160) per language into ./raw, for frame.mjs.

Needs the dev server running: npx vite --port 5175 --host 127.0.0.1. Uses the installed Edge browser."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright
from recon import new_page, URL

RAW = Path(__file__).parent / 'raw'
L = {
    'en': dict(groceries='Groceries', debts='Debts', budgets='Monthly budgets', note='Supermarket'),
    'ar': dict(groceries='بقالة', debts='الديون', budgets=None, note='السوبر ماركت'),
}


def go(page, route):
    page.goto(f'{URL}/{route}')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)


def shot(page, lang, name):
    (RAW / lang).mkdir(parents=True, exist_ok=True)
    page.wait_for_timeout(900)
    page.screenshot(path=str(RAW / lang / f'{name}.png'))


with sync_playwright() as p:
    for lang in ['en', 'ar']:
        t = L[lang]
        browser, page = new_page(p, lang)
        go(page, 'categories'); shot(page, lang, '01-categories')
        page.get_by_text(t['groceries'], exact=True).first.click()
        page.wait_for_timeout(700)
        for k in ['4', '5', '.', '8']:
            page.locator('ion-modal button', has_text=k).filter(has_not_text='USD').first.click()
        page.locator('ion-modal input, ion-modal textarea').first.fill(t['note'])
        page.locator('ion-modal input, ion-modal textarea').first.blur()
        shot(page, lang, '02-add')
        go(page, 'overview'); shot(page, lang, '03-overview')
        page.evaluate("[...document.querySelectorAll('ion-content')].filter(c => c.offsetParent !== null).forEach(c => c.scrollToPoint(0, 560, 0))")
        shot(page, lang, '04-budgets')
        go(page, 'accounts'); shot(page, lang, '05-accounts')
        page.get_by_text(t['debts'], exact=True).first.click(); shot(page, lang, '06-debts')
        go(page, 'transactions'); shot(page, lang, '07-transactions')
        browser.close()
        browser, page = new_page(p, lang, 'dark')
        go(page, 'categories'); shot(page, lang, '08-dark')
        browser.close()
print('done')
