import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/models';
import { accountSections, type AccountSection } from './sections';

let n = 0;
const tx = (amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, type: 'expense', amount, currency: 'EGP', accountId: 'card', categoryId: 'food', date: '2026-11-06T20:00:00.000Z', createdAt: 'x', ...over,
});
const transfer = (amount: number, to: string | undefined, over: Partial<Transaction> = {}) =>
  tx(amount, { type: 'transfer', categoryId: undefined, toAccountId: to, ...over });

const signed = (t: Transaction) => (t.type === 'income' ? t.amount : -t.amount);
const heads = (sections: AccountSection[]) => sections.map((s) => [s.accountId, s.total]);

describe('accountSections', () => {
  it('groups by account with totals, largest absolute total first', () => {
    const list = [tx(100), tx(300, { accountId: 'bank' }), tx(50)];
    expect(heads(accountSections(list, 'account', signed))).toEqual([['bank', -300], ['card', -150]]);
  });

  it('lists rows newest first', () => {
    const a = tx(1, { date: '2026-11-05T10:00:00.000Z' });
    const b = tx(2, { date: '2026-11-07T10:00:00.000Z' });
    const c = tx(3, { date: '2026-11-06T10:00:00.000Z' });
    const [only] = accountSections([a, b, c], 'account', signed);
    expect(only.rows.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
  });

  it('keeps first-seen order for equal totals', () => {
    const list = [transfer(10, 'x', { accountId: 'a' }), transfer(20, 'y', { accountId: 'b' })];
    expect(accountSections(list, 'account', () => 0).map((s) => s.accountId)).toEqual(['a', 'b']);
  });

  it('groups transfers by destination and puts the rest last', () => {
    const list = [tx(40), transfer(200, 'savings'), transfer(500, 'wallet')];
    expect(heads(accountSections(list, 'toAccount', (t) => t.amount))).toEqual([['wallet', 500], ['savings', 200], [null, null]]);
  });

  it('puts a transfer without a destination with the non-transfers', () => {
    const sections = accountSections([transfer(70, undefined)], 'toAccount', (t) => t.amount);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ accountId: null, total: null });
  });

  it('has no "Not transfers" section when every row is a transfer', () => {
    const sections = accountSections([transfer(10, 'savings'), transfer(20, 'wallet')], 'toAccount', (t) => t.amount);
    expect(sections.some((s) => s.accountId === null)).toBe(false);
  });
});
