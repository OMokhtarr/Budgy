import { addAmounts, linesOf, roundTo } from './currency';
import type { Account, Amounts } from '@/shared/models';

/**
 * The two sides of My finances: every positive balance is an asset and every negative one a debt.
 * The default income and expense accounts count as one balance per currency, because a negative
 * balance from spending isn't money owed; only what's left after combining them is.
 */
export function assetsAndDebts(accounts: Account[], balances: Map<string, Amounts> | undefined): { assets: Amounts; debts: Amounts } {
  const assets: Amounts = {};
  const debts: Amounts = {};
  const count = (cur: string, n: number) => {
    if (n > 0) assets[cur] = roundTo((assets[cur] ?? 0) + n, cur);
    else if (n < 0) debts[cur] = roundTo((debts[cur] ?? 0) - n, cur);
  };
  const lines = (a: Account) => linesOf(a, balances?.get(a.id!));
  const combined = addAmounts(accounts.filter((a) => a.defaultFor).map((a) => Object.fromEntries(lines(a))));
  for (const [cur, n] of Object.entries(combined)) count(cur, n);
  for (const a of accounts) if (!a.defaultFor) for (const [cur, n] of lines(a)) count(cur, n);
  return { assets, debts };
}
