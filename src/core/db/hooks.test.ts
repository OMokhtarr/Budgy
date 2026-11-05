import '@/test/setup-db';
import { describe, expect, it } from 'vitest';
import { subcategoryBreakdown, totalsOf } from './hooks';
import type { Category, Transaction } from '@/shared/models';

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
  const TILES = { tileIds: new Set(['debt']), shownIds: new Set(['cash', 'bank', 'debt']) };
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

  it("doesn't count money moved between everyday accounts", () => {
    const t = totals([tx(50), move(1000, 'cash', 'bank')]);
    expect(t.expense).toBe(50);
    expect(t.byTile.size).toBe(0);
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
