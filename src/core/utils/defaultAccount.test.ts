import { describe, expect, it } from 'vitest';
import { defaultAccountFor } from './defaultAccount';
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
