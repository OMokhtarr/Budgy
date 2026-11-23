import '@/test/setup-db';
import { describe, expect, it } from 'vitest';
import { balancesOf, budgetSpent, subcategoryBreakdown, totalsOf } from './hooks';
import type { Account, Category, Transaction } from '@/shared/models';

const GROCERIES = { id: 'groceries', name: 'Groceries', icon: 'cart' };
const AKL = { id: 'akl', name: 'Akl', icon: 'restaurant' };
const SNACKS = { id: 'snacks', name: 'Snacks', icon: 'cafe' };
const FOOD: Category = { id: 'food', name: 'Food', kind: 'both', icon: 'restaurant', color: '#f00', order: 0, subcategories: [AKL, GROCERIES, SNACKS] };

const tx = (amount: number, subcategoryId?: string, type: 'expense' | 'income' = 'expense', currency = 'EGP'): Transaction => ({
  type, amount, currency, accountId: 'cash', categoryId: 'food', subcategoryId, date: '2026-11-01T10:00:00.000Z', createdAt: 'x',
});
/** Main currency EGP, today's saved rate 1 USD = 50 EGP. */
const CONV = { base: 'EGP', toBase: (n: number, cur: string) => (cur === 'USD' ? n * 50 : n) };
const breakdown = (txs: Transaction[], flow: 'expense' | 'income' = 'expense', category = FOOD) =>
  subcategoryBreakdown(category, flow, totalsOf(txs, CONV));
const values = (b: ReturnType<typeof breakdown>) => b.subs.map(({ sub, value }) => [sub.name, value]);

describe('totalsOf with account tiles', () => {
  const TILES = { tileIds: new Set(['debt']), everydayIds: new Set(['cash', 'bank']), shownIds: new Set(['cash', 'bank', 'debt']) };
  const move = (amount: number, accountId: string, toAccountId: string, fields: Partial<Transaction> = {}): Transaction => ({
    type: 'transfer', amount, currency: 'EGP', accountId, toAccountId, date: 'x', createdAt: 'x', ...fields,
  });
  const totals = (txs: Transaction[]) => totalsOf(txs, CONV, TILES);

  it('adds money sent to a tile to the expenses', () => {
    const t = totals([tx(50), move(1000, 'cash', 'debt')]);
    expect(t.expense).toBe(1050);
    expect(t.byTile.get('debt')).toEqual({ value: 1000, amounts: { EGP: 1000 } });
  });

  it('subtracts repayments from the tile and the expenses', () => {
    const t = totals([tx(50), move(1000, 'cash', 'debt'), move(400, 'debt', 'cash')]);
    expect(t.expense).toBe(650);
    expect(t.byTile.get('debt')).toEqual({ value: 600, amounts: { EGP: 600 } });
  });

  it('goes negative when more came back than was sent in the period', () => {
    const t = totals([move(400, 'debt', 'cash')]);
    expect(t.expense).toBe(-400);
    expect(t.byTile.get('debt')?.value).toBe(-400);
  });

  it('keeps the currencies of a tile apart', () => {
    const t = totals([move(5000, 'cash', 'debt', { toAmount: 100, toCurrency: 'USD' }), move(30, 'cash', 'debt')]);
    expect(t.byTile.get('debt')).toEqual({ value: 5030, amounts: { USD: 100, EGP: 30 } });
  });

  it("doesn't count a tile's own expense twice", () => {
    const t = totals([{ ...tx(70), accountId: 'debt' }]);
    expect(t.expense).toBe(70);
    expect(t.byTile.size).toBe(0);
  });

  it('shows money moved between everyday accounts on their tiles without counting it as spending', () => {
    const t = totals([tx(50), move(1000, 'cash', 'bank'), move(300, 'bank', 'cash')]);
    expect(t.expense).toBe(50);
    expect(t.byTile.get('bank')).toEqual({ value: 700, amounts: { EGP: 700 } });
    expect(t.byTile.get('cash')).toEqual({ value: -700, amounts: { EGP: -700 } });
  });

  it('counts money sent to a debt once while showing it left the everyday account', () => {
    const t = totals([move(1000, 'cash', 'debt')]);
    expect(t.expense).toBe(1000);
    expect(t.byTile.get('debt')?.value).toBe(1000);
    expect(t.byTile.get('cash')?.value).toBe(-1000);
  });

  it('leaves transfers out without tiles', () => {
    expect(totalsOf([move(1000, 'cash', 'debt')], CONV).expense).toBe(0);
  });
});

describe('totalsOf with a transaction\'s own exchange rate', () => {
  const rated = (type: 'expense' | 'income' = 'expense'): Transaction => ({ ...tx(10, 'akl', type, 'USD'), rate: 48, rateCurrency: 'EGP' });

  it('counts an expense at its own rate everywhere it is totalled', () => {
    const t = totalsOf([rated()], CONV);
    expect(t.expense).toBe(480);
    expect(t.byCategory.expense.get('food')).toBe(480);
    expect(t.bySubcategory.expense.get('akl')).toBe(480);
  });

  it('counts income at its own rate', () => {
    expect(totalsOf([rated('income')], CONV).income).toBe(480);
  });

  it('still lists the original amount per currency', () => {
    expect(totalsOf([rated()], CONV).byCategoryCur.expense.get('food')).toEqual({ USD: 10 });
  });

  it('counts a transaction without a rate at today\'s rate', () => {
    expect(totalsOf([tx(10, undefined, 'expense', 'USD')], CONV).expense).toBe(500);
  });
});

describe('subcategoryBreakdown', () => {
  it('lists used subcategories highest first, with the plain category money as the rest', () => {
    const b = breakdown([tx(700, 'akl'), tx(1000, 'groceries'), tx(400, 'groceries'), tx(300)]);
    expect(values(b)).toEqual([['Groceries', 1400], ['Akl', 700]]);
    expect(b.rest).toBe(300);
  });

  it('hides subcategories with nothing in them', () => {
    expect(values(breakdown([tx(10, 'akl')]))).toEqual([['Akl', 10]]);
  });

  it('adds nothing under a category when none of its subcategories were used', () => {
    expect(breakdown([tx(300)])).toEqual({ subs: [], rest: 0 });
  });

  it('keeps spending and income apart in a category that accepts both', () => {
    const txs = [tx(100, 'akl'), tx(40, 'akl', 'income')];
    expect(values(breakdown(txs, 'expense'))).toEqual([['Akl', 100]]);
    expect(values(breakdown(txs, 'income'))).toEqual([['Akl', 40]]);
  });

  it('counts other currencies at their main-currency value', () => {
    expect(values(breakdown([tx(2, 'akl', 'expense', 'USD')]))).toEqual([['Akl', 100]]);
  });

  it('counts a transaction whose subcategory no longer exists as the rest', () => {
    const b = breakdown([tx(100, 'akl'), tx(25, 'gone')]);
    expect(b.rest).toBe(25);
  });

  it('leaves no rest from rounding when every transaction has a subcategory', () => {
    expect(breakdown([tx(0.1, 'akl'), tx(0.2, 'akl'), tx(0.7, 'groceries')]).rest).toBe(0);
  });
});

describe('totalsOf with money back', () => {
  const back = (amount: number, over: Partial<Transaction> = {}): Transaction => ({ ...tx(amount, undefined, 'income'), moneyBack: true, ...over });

  it('takes money back off the spending in its category, not counting it as income', () => {
    const t = totalsOf([tx(600), back(400)], CONV);
    expect(t.expense).toBe(200);
    expect(t.income).toBe(0);
    expect(t.byCategory.expense.get('food')).toBe(200);
    expect(t.byCategory.income.has('food')).toBe(false);
    expect(t.byCategoryCur.expense.get('food')).toEqual({ EGP: 200 });
  });

  it('lets a period with only the money back go below zero', () => {
    const t = totalsOf([back(400)], CONV);
    expect(t.expense).toBe(-400);
    expect(t.byCategory.expense.get('food')).toBe(-400);
  });

  it('takes money back in another currency off at its own rate', () => {
    expect(totalsOf([tx(600), back(10, { currency: 'USD', rate: 48, rateCurrency: 'EGP' })], CONV).expense).toBe(120);
  });

  it('takes money back off its subcategory too', () => {
    expect(totalsOf([tx(600, 'akl'), back(100, { subcategoryId: 'akl' })], CONV).bySubcategory.expense.get('akl')).toBe(500);
  });
});

describe('budgetSpent', () => {
  it('counts a category that is below zero (more came back than was spent) as nothing spent', () => {
    const t = totalsOf([
      { ...tx(300), categoryId: 'food' },
      { ...tx(500, undefined, 'income'), categoryId: 'fun', moneyBack: true },
    ], CONV);
    expect(budgetSpent(t, ['food', 'fun'])).toBe(300);
  });
});

describe('balancesOf with future entries', () => {
  const account = (id: string, type: Account['type'], initialBalance = 0, over: Partial<Account> = {}): Account => ({
    id, name: id, type, icon: 'x', color: '#000', currency: 'EGP', initialBalance, order: 0, createdAt: 'x', ...over,
  });
  const ACCOUNTS = [
    account('bank', 'bank', 10000),
    account('cash', 'cash'),
    account('card', 'card', 0, { currency2: 'USD', credit: { statementDay: 25, dueDay: 20 } }),
  ];
  const on = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
  const TODAY = new Date(2026, 10, 23, 12);
  const entry = (fields: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId' | 'date'>): Transaction => ({
    currency: 'EGP', createdAt: 'x', ...fields,
  });
  const balances = (txs: Transaction[], today = TODAY) => balancesOf(ACCOUNTS, txs, today);

  it('leaves a future bank expense out until its day', () => {
    const sub = entry({ type: 'expense', amount: 250, accountId: 'bank', date: on(2026, 12, 1) });
    expect(balances([sub]).get('bank')).toEqual({ EGP: 10000 });
    expect(balances([sub], new Date(2026, 11, 1, 12)).get('bank')).toEqual({ EGP: 9750 });
  });

  it('leaves future income and both sides of a future transfer between own accounts out', () => {
    const pay = entry({ type: 'income', amount: 500, accountId: 'bank', date: on(2026, 12, 1) });
    const move = entry({ type: 'transfer', amount: 1000, accountId: 'bank', toAccountId: 'cash', date: on(2026, 12, 1) });
    const b = balances([pay, move]);
    expect(b.get('bank')).toEqual({ EGP: 10000 });
    expect(b.get('cash')).toEqual({ EGP: 0 });
  });

  it('counts a future card charge at once', () => {
    const inst = entry({ type: 'expense', amount: 1000, accountId: 'card', date: on(2027, 1, 21), instalment: { planId: 'p', n: 3, of: 12 } });
    expect(balances([inst]).get('card')?.EGP).toBe(-1000);
  });

  it('waits on both sides for a future payment to the card', () => {
    const pay = entry({ type: 'transfer', amount: 500, accountId: 'bank', toAccountId: 'card', date: on(2026, 12, 1) });
    const b = balances([pay]);
    expect(b.get('bank')).toEqual({ EGP: 10000 });
    expect(b.get('card')?.EGP).toBe(0);
  });

  it('takes cash out on the card at once and adds it to the bank on its day', () => {
    const cashOut = entry({ type: 'transfer', amount: 300, accountId: 'card', toAccountId: 'bank', date: on(2026, 12, 1) });
    const b = balances([cashOut]);
    expect(b.get('card')?.EGP).toBe(-300);
    expect(b.get('bank')).toEqual({ EGP: 10000 });
  });

  it('counts a future exchange inside the card whole', () => {
    const swap = entry({ type: 'transfer', amount: 100, accountId: 'card', toAccountId: 'card', toCurrency: 'USD', toAmount: 2, date: on(2026, 12, 1) });
    expect(balances([swap]).get('card')).toEqual({ EGP: -100, USD: 2 });
  });

  it('counts an entry dated late today', () => {
    const late = entry({ type: 'expense', amount: 40, accountId: 'bank', date: on(2026, 11, 23, 23, 59) });
    expect(balances([late]).get('bank')).toEqual({ EGP: 9960 });
  });
});
