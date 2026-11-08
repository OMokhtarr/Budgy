import { openingOf, roundTo } from './currency';
import type { Account, Amounts, Transaction } from '@/shared/models';

/** For each debt account: how much of each transfer to or from it (0 to 1) was lending, by transaction id. */
export type LendingShares = Map<string, Map<string, number>>;

/** What a transaction moves on one account: [amount, currency], positive when money arrives. */
export function changeOn(t: Transaction, id: string): [number, string][] {
  const changes: [number, string][] = [];
  if (t.accountId === id) changes.push([t.type === 'income' ? t.amount : -t.amount, t.currency]);
  if (t.type === 'transfer' && t.toAccountId === id) changes.push([t.toAmount ?? t.amount, t.toCurrency ?? t.currency]);
  return changes;
}

/**
 * Only lending counts as spending. A debt's balance above zero is money they owe you: a transfer that
 * raises or lowers that part is lending or getting it back. Below zero is a loan you took, which never
 * counts: what you buy with it is already an expense. A transfer that crosses zero counts in part.
 * Each debt's history is replayed in date order from its opening balance, one currency at a time.
 */
export function lendingShares(debts: Account[], txs: Transaction[]): LendingShares {
  const ordered = [...txs].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  const result: LendingShares = new Map();
  for (const debt of debts) {
    const id = debt.id!;
    const balance: Amounts = openingOf(debt);
    const shares = new Map<string, number>();
    for (const t of ordered) {
      const changes = changeOn(t, id);
      for (const [delta, cur] of changes) {
        const before = balance[cur] ?? 0;
        const after = roundTo(before + delta, cur);
        balance[cur] = after;
        // An exchange inside the debt moves two currencies; it isn't lending either way.
        if (t.type === 'transfer' && changes.length === 1 && t.id != null) {
          shares.set(t.id, delta ? Math.abs(Math.max(0, after) - Math.max(0, before)) / Math.abs(delta) : 0);
        }
      }
    }
    result.set(id, shares);
  }
  return result;
}
