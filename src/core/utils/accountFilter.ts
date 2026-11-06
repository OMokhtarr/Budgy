import { groupOf } from './currency';
import type { Account, AccountGroup } from '@/shared/models';

/** What the user changed in the accounts filter, on top of each account's own switches. */
export interface FilterOverrides {
  add: string[];
  remove: string[];
}

/** What an account's two switches say when they were never touched: on for everyday money only. */
export const switchesOnByDefault = (group: AccountGroup) => group === 'regular';

export const countsInTotal = (a: Account) => a.includeInTotal ?? switchesOnByDefault(groupOf(a));
export const countsInExpenses = (a: Account) => a.showInExpenses ?? switchesOnByDefault(groupOf(a));

/** Whether money sent to the account's tile among the categories counts as spending: savings, and for debts only lending. */
export const tileIsSpending = (a: Account) => groupOf(a) !== 'regular';

export const selectedByDefault = (a: Account) => countsInTotal(a) || countsInExpenses(a);

/**
 * Applies the switches and the filter. An account with a switch on follows its switches; one with both
 * off can still be picked in the filter, which then counts it everywhere. Removing it in the filter
 * always leaves it out.
 */
export function resolveFilter(accounts: Account[], overrides: FilterOverrides) {
  const selected = new Set<string>();
  const inTotal = new Set<string>();
  const inExpenses = new Set<string>();
  for (const a of accounts) {
    const id = a.id!;
    const byDefault = selectedByDefault(a);
    if (byDefault ? overrides.remove.includes(id) : !overrides.add.includes(id)) continue;
    selected.add(id);
    if (!byDefault || countsInTotal(a)) inTotal.add(id);
    if (!byDefault || countsInExpenses(a)) inExpenses.add(id);
  }
  return { selected, inTotal, inExpenses };
}

/** Clears what the filter says about one account, so its switches decide again. */
export function forgetAccount(overrides: FilterOverrides, id: string): FilterOverrides {
  return { add: overrides.add.filter((x) => x !== id), remove: overrides.remove.filter((x) => x !== id) };
}
