import { describe, expect, it } from 'vitest';
import { forgetAccount, resolveFilter } from './accountFilter';
import type { Account } from '@/shared/models';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'bank', icon: 'card', color: '#111', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...fields,
});
const NO_CHANGES = { add: [], remove: [] };

/** Where one account ends up: [shown in the filter, counted in the balance, counted in expenses]. */
const placement = (a: Account, overrides: { add: string[]; remove: string[] } = NO_CHANGES) => {
  const r = resolveFilter([a], overrides);
  return [r.selected.has(a.id!), r.inTotal.has(a.id!), r.inExpenses.has(a.id!)];
};

describe('resolveFilter', () => {
  it.each<[string, Partial<Account>, boolean[]]>([
    ['an everyday account counts everywhere', {}, [true, true, true]],
    ['a debt counts nowhere', { group: 'debt' }, [false, false, false]],
    ['a savings account counts nowhere', { group: 'savings' }, [false, false, false]],
    ['a debt shown in expenses stays out of the balance', { group: 'debt', showInExpenses: true }, [true, false, true]],
    ['a debt in the total stays out of expenses', { group: 'debt', includeInTotal: true }, [true, true, false]],
    ['an everyday account can leave the balance only', { includeInTotal: false }, [true, false, true]],
    ['an everyday account can leave expenses only', { showInExpenses: false }, [true, true, false]],
    ['an everyday account with both off counts nowhere', { includeInTotal: false, showInExpenses: false }, [false, false, false]],
  ])('%s', (_name, fields, want) => {
    expect(placement(account('a', fields))).toEqual(want);
  });

  it('counts a debt everywhere when it is picked in the filter with both switches off', () => {
    expect(placement(account('a', { group: 'debt' }), { add: ['a'], remove: [] })).toEqual([true, true, true]);
  });

  it('keeps the balance out when a debt picked earlier now has only expenses switched on', () => {
    expect(placement(account('a', { group: 'debt', showInExpenses: true }), { add: ['a'], remove: [] })).toEqual([true, false, true]);
  });

  it('leaves out an account removed in the filter, whatever its switches say', () => {
    expect(placement(account('a'), { add: [], remove: ['a'] })).toEqual([false, false, false]);
    expect(placement(account('b', { group: 'debt', showInExpenses: true }), { add: [], remove: ['b'] })).toEqual([false, false, false]);
  });
});

describe('forgetAccount', () => {
  it('drops only that account from the filter changes', () => {
    expect(forgetAccount({ add: ['a', 'b'], remove: ['a', 'c'] }, 'a')).toEqual({ add: ['b'], remove: ['c'] });
  });
});
