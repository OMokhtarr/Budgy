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
const breakdown = (txs: Transaction[], flow: 'expense' | 'income' = 'expense', category = FOOD) =>
  subcategoryBreakdown(category, flow, totalsOf(txs, (n, cur) => (cur === 'USD' ? n * 50 : n)));
const values = (b: ReturnType<typeof breakdown>) => b.subs.map(({ sub, value }) => [sub.name, value]);

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
