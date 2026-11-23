import { describe, expect, it } from 'vitest';
import { hiddenUntilItsDay, isAfterToday } from './future';
import type { Transaction } from '@/shared/models';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const today = new Date(2026, 10, 23, 12);

describe('isAfterToday', () => {
  it('is false for any time today', () => {
    expect(isAfterToday(at(2026, 11, 23, 12), today)).toBe(false);
    expect(isAfterToday(at(2026, 11, 23, 23, 59), today)).toBe(false);
  });

  it('is true from the start of tomorrow on', () => {
    expect(isAfterToday(at(2026, 11, 24, 0), today)).toBe(true);
    expect(isAfterToday(at(2026, 12, 3), today)).toBe(true);
  });
});

describe('hiddenUntilItsDay', () => {
  const cards = new Set(['card']);
  const entry = (accountId: string, date: string, fields: Partial<Transaction> = {}): Transaction => ({
    type: 'expense', amount: 100, currency: 'EGP', accountId, date, createdAt: 'x', ...fields,
  });
  const hidden = (t: Transaction) => hiddenUntilItsDay(t, cards, today);

  it('hides card charges dated after today', () => {
    expect(hidden(entry('card', at(2027, 1, 21), { instalment: { planId: 'p', n: 3, of: 12 } }))).toBe(true);
    expect(hidden(entry('card', at(2026, 11, 24, 0)))).toBe(true);
    expect(hidden(entry('card', at(2026, 12, 1), { type: 'transfer', toAccountId: 'bank' }))).toBe(true);
  });

  it('keeps card entries dated today, and future entries on other accounts', () => {
    expect(hidden(entry('card', at(2026, 11, 23, 23, 59)))).toBe(false);
    expect(hidden(entry('bank', at(2026, 12, 1)))).toBe(false);
    expect(hidden(entry('bank', at(2026, 12, 1), { type: 'transfer', toAccountId: 'card' }))).toBe(false);
  });
});

describe('hiddenUntilItsDay for money reaching the card', () => {
  const cards = new Set(['card']);
  const base = { amount: 100, currency: 'EGP', accountId: 'card', date: at(2027, 3, 1), createdAt: 'x' };

  it('keeps a future refund or an exchange inside the card in sight', () => {
    expect(hiddenUntilItsDay({ ...base, type: 'income' }, cards, today)).toBe(false);
    expect(hiddenUntilItsDay({ ...base, type: 'transfer', toAccountId: 'card', toCurrency: 'USD', toAmount: 2 }, cards, today)).toBe(false);
  });
});
