import { describe, expect, it } from 'vitest';
import { accountSections, defaultAccountFor, splitMainAccounts } from './defaultAccount';
import type { Account } from '@/shared/models';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'cash', icon: 'cash', color: '#111', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...fields,
});
const OTHER = account('other');
const IN = account('in', { defaultFor: 'income' });
const OUT = account('out', { defaultFor: 'expense' });

describe('defaultAccountFor', () => {
  it.each<[string, Account[], 'expense' | 'income' | 'transfer', string | undefined, string | undefined]>([
    ['income goes to the income account, even after an expense', [OTHER, IN, OUT], 'income', 'out', 'in'],
    ['an expense goes to the expense account, even after income', [OTHER, IN, OUT], 'expense', 'in', 'out'],
    ['a transfer follows the last used account', [OTHER, IN, OUT], 'transfer', 'in', 'in'],
    ['with no default set, the last used account is picked', [OTHER, account('b')], 'expense', 'b', 'b'],
    ['a last used account that is gone falls back to the first', [OTHER, account('b')], 'income', 'gone', 'other'],
    ['with no last used account, the first is picked', [OTHER, account('b')], 'expense', undefined, 'other'],
    ['an expense skips the income account when no expense account is set', [IN, OTHER], 'expense', undefined, 'other'],
    ['an expense ignores a last used income account when no expense account is set', [IN, OTHER], 'expense', 'in', 'other'],
    ['income skips the expense account when no income account is set', [OUT, OTHER], 'income', 'out', 'other'],
    ['the income account still works for an expense if it is the only account', [IN], 'expense', undefined, 'in'],
    ['no accounts means nothing to pick', [], 'expense', 'gone', undefined],
  ])('%s', (_name, accounts, type, last, want) => {
    expect(defaultAccountFor(accounts, type, last)).toBe(want);
  });
});

describe('splitMainAccounts', () => {
  it('puts Cash In and Cash Out apart from the rest, keeping the order of each', () => {
    const cashIn = account('cashIn', { key: 'cashIn' });
    const cashOut = account('cashOut', { key: 'cashOut', name: 'Spending' });
    expect(splitMainAccounts([OTHER, cashOut, IN, cashIn])).toEqual([[cashOut, cashIn], [OTHER, IN]]);
  });
});

describe('accountSections', () => {
  it('puts the main accounts first, then one section per type in the usual type order', () => {
    const cashIn = account('cashIn', { key: 'cashIn' });
    const bank = account('bank', { type: 'bank' });
    const wallet = account('wallet', { type: 'wallet' });
    const card = account('card', { type: 'card' });
    const bank2 = account('bank2', { type: 'bank' });
    expect(accountSections([bank, wallet, cashIn, OTHER, card, bank2])).toEqual({
      main: [cashIn],
      byType: [['cash', [OTHER]], ['card', [card]], ['bank', [bank, bank2]], ['wallet', [wallet]]],
    });
  });

  it('has no sections for an empty list', () => {
    expect(accountSections([])).toEqual({ main: [], byType: [] });
  });
});
