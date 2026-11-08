"""Builds a Budgy backup (version 5) full of believable demo data for store screenshots."""
import random
from datetime import datetime, timedelta

EXPENSE_KEYS = ['groceries', 'restaurant', 'transport', 'car', 'home', 'bills', 'health', 'shopping',
                'entertainment', 'education', 'gifts', 'other']
INCOME_KEYS = ['salary', 'freelance', 'investments', 'giftsIn']
COLORS = {
    'groceries': ('cart', '#22c55e'), 'restaurant': ('restaurant', '#f97316'), 'transport': ('bus', '#3b82f6'),
    'car': ('car', '#0ea5e9'), 'home': ('home', '#8b5cf6'), 'bills': ('flash', '#eab308'),
    'health': ('medkit', '#ef4444'), 'shopping': ('shirt', '#ec4899'), 'entertainment': ('film', '#a855f7'),
    'education': ('school', '#6366f1'), 'gifts': ('gift', '#f43f5e'), 'other': ('other', '#64748b'),
    'salary': ('briefcase', '#10b981'), 'freelance': ('laptop', '#14b8a6'), 'investments': ('trending', '#0f766e'),
    'giftsIn': ('gift', '#84cc16'),
}
BUDGETS = {'groceries': 850, 'restaurant': 300, 'transport': 150, 'home': 1400, 'bills': 220,
           'shopping': 300, 'entertainment': 120}

NAMES = {
    'en': {'bank': 'Bank account', 'card': 'Credit card', 'cash': 'Cash', 'savings': 'Emergency fund',
           'travel': 'Travel (EUR)', 'debt': 'Sam', 'loan': 'Car loan', 'profile': 'Alex',
           'notes': {'groceries': ['Supermarket', 'Farmers market', 'Bakery'], 'restaurant': ['Lunch', 'Pizza night', 'Coffee'],
                     'transport': ['Metro card', 'Taxi'], 'car': ['Fuel'], 'home': ['Rent'], 'bills': ['Electricity', 'Internet', 'Phone'],
                     'health': ['Pharmacy'], 'gifts': ['Birthday gift'], 'education': ['Online course'], 'shopping': ['Shoes', 'Jacket'], 'entertainment': ['Cinema', 'Concert'],
                     'salary': ['Salary'], 'freelance': ['Logo project']}},
    'ar': {'bank': 'الحساب البنكي', 'card': 'بطاقة الائتمان', 'cash': 'نقدًا', 'savings': 'صندوق الطوارئ',
           'travel': 'السفر (يورو)', 'debt': 'سامي', 'loan': 'قرض السيارة', 'profile': 'أحمد',
           'notes': {'groceries': ['السوبر ماركت', 'سوق الخضار', 'المخبز'], 'restaurant': ['غداء', 'بيتزا', 'قهوة'],
                     'transport': ['بطاقة المترو', 'تاكسي'], 'car': ['بنزين'], 'home': ['الإيجار'], 'bills': ['الكهرباء', 'الإنترنت', 'الهاتف'],
                     'health': ['الصيدلية'], 'gifts': ['هدية عيد ميلاد'], 'education': ['دورة أونلاين'], 'shopping': ['حذاء', 'جاكيت'], 'entertainment': ['السينما', 'حفلة'],
                     'salary': ['الراتب'], 'freelance': ['تصميم شعار']}},
}


def uid(n: int) -> str:
    return f'00000000-0000-4000-9000-{n:012x}'


def seed_category_id(key: str) -> str:
    # Same fixed ids the app gives its starting categories (seedId(0x100 + i) in src/core/db/db.ts).
    i = (EXPENSE_KEYS + INCOME_KEYS).index(key)
    return f'00000000-0000-4000-8000-{0x100 + i:012x}'


def build(lang: str, today: datetime) -> dict:
    rnd = random.Random(7)
    n = NAMES[lang]
    created = (today - timedelta(days=90)).isoformat() + 'Z'
    A = {k: uid(i + 1) for i, k in enumerate(['bank', 'card', 'cash', 'savings', 'travel', 'debt', 'loan'])}
    accounts = [
        dict(id=A['bank'], name=n['bank'], type='bank', icon='business', color='#0ea5e9', currency='USD',
             initialBalance=2450, defaultFor='income', order=0, createdAt=created),
        dict(id=A['card'], name=n['card'], type='card', icon='card', color='#6366f1', currency='USD',
             initialBalance=0, defaultFor='expense', order=1, createdAt=created),
        dict(id=A['cash'], name=n['cash'], type='cash', icon='cash', color='#10b981', currency='USD',
             initialBalance=180, order=2, createdAt=created),
        dict(id=A['travel'], name=n['travel'], type='wallet', icon='wallet', color='#f59e0b', currency='EUR',
             initialBalance=320, order=3, createdAt=created),
        dict(id=A['savings'], name=n['savings'], type='savings', icon='trending', color='#14b8a6', currency='USD',
             initialBalance=3000, group='savings', order=4, createdAt=created),
        dict(id=A['debt'], name=n['debt'], type='cash', icon='user', color='#f43f5e', currency='USD',
             initialBalance=150, group='debt', order=5, createdAt=created),
        dict(id=A['loan'], name=n['loan'], type='bank', icon='car', color='#64748b', currency='USD',
             initialBalance=-6200, group='debt', order=6, createdAt=created),
    ]
    categories = []
    for i, k in enumerate(EXPENSE_KEYS):
        icon, color = COLORS[k]
        c = dict(id=seed_category_id(k), key=k, name='', kind='expense', icon=icon, color=color, order=i)
        if k in BUDGETS:
            c['budget'] = BUDGETS[k]
        categories.append(c)
    for i, k in enumerate(INCOME_KEYS):
        icon, color = COLORS[k]
        categories.append(dict(id=seed_category_id(k), key=k, name='', kind='income', icon=icon, color=color, order=i))

    tx = []

    def add(kind, key, amount, day, account, hour=None):
        when = day.replace(hour=hour if hour is not None else rnd.randint(8, 21), minute=rnd.randint(0, 59))
        notes = n['notes'].get(key)
        t = dict(id=uid(1000 + len(tx)), type=kind, amount=round(amount, 2), currency='USD', accountId=account,
                 categoryId=seed_category_id(key), date=when.isoformat() + 'Z', createdAt=when.isoformat() + 'Z')
        if notes:
            t['note'] = rnd.choice(notes)
        tx.append(t)

    start = today.replace(day=1)
    for _ in range(5):  # six months, so the trend chart is full
        start = (start - timedelta(days=1)).replace(day=1)
    day = start

    def balance(acc):
        b = next(a['initialBalance'] for a in accounts if a['id'] == acc)
        for t in tx:
            if t['accountId'] == acc:
                b += t['amount'] if t['type'] == 'income' else -t['amount']
            if t.get('toAccountId') == acc:
                b += t['amount']
        return b

    def transfer(src, dst, amount, day, hour):
        when = day.replace(hour=hour).isoformat() + 'Z'
        tx.append(dict(id=uid(1000 + len(tx)), type='transfer', amount=round(amount, 2), currency='USD',
                       accountId=src, toAccountId=dst, date=when, createdAt=when))

    while day <= today:
        if day.day == 1 and day != start:
            transfer(A['bank'], A['card'], -balance(A['card']), day, 12)  # pay off last month's card
            transfer(A['bank'], A['cash'], max(0, 250 - balance(A['cash'])), day, 13)  # top cash up to 250
        if day.day == 20 and rnd.random() < 0.5:
            add('expense', 'gifts', rnd.uniform(25, 70), day, A['card'])
        if day.day == 12 and rnd.random() < 0.5:
            add('expense', 'education', rnd.uniform(20, 60), day, A['card'])
        if day.day == 1:
            add('income', 'salary', 4200, day, A['bank'], 9)
            add('expense', 'home', 1400, day, A['bank'], 10)
            transfer(A['bank'], A['savings'], 400, day, 11)
            transfer(A['bank'], A['loan'], 300, day, 14)
        if day.day == 15:
            add('income', 'freelance', rnd.choice([450, 650, 800]), day, A['bank'])
        if day.day in (5, 6):
            add('expense', 'bills', rnd.uniform(45, 95), day, A['card'])
        if day.weekday() in (1, 4, 6):
            add('expense', 'groceries', rnd.uniform(35, 95), day, A['card'])
        if rnd.random() < 0.45:
            add('expense', 'restaurant', rnd.uniform(8, 38), day, rnd.choice([A['card'], A['cash']]))
        if rnd.random() < 0.35:
            add('expense', 'transport', rnd.uniform(3, 18), day, A['cash'])
        if day.day in (3, 18):
            add('expense', 'car', rnd.uniform(40, 60), day, A['card'])
        if rnd.random() < 0.08:
            add('expense', 'shopping', rnd.uniform(30, 120), day, A['card'])
        if rnd.random() < 0.07:
            add('expense', 'entertainment', rnd.uniform(12, 45), day, A['card'])
        if rnd.random() < 0.04:
            add('expense', 'health', rnd.uniform(10, 40), day, A['cash'])
        day += timedelta(days=1)

    return {
        'app': 'budgy', 'version': 5, 'exportedAt': today.isoformat() + 'Z',
        'accounts': accounts, 'categories': categories, 'transactions': tx,
        'settings': {'currency': 'USD', 'rates': {'EUR': 1.08}, 'balanceView': 'sum', 'weekStart': 1,
                     'profileName': n['profile'], 'profileColor': '#10b981'},
    }
