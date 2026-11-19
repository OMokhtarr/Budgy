import type { Transaction } from '@/shared/models';

/** How the filtered transactions list is split up: by day, by account, or by the account transfers went to. */
export type Arrangement = 'day' | 'account' | 'toAccount';

/**
 * The arrangement on screen: the chosen one while a filter is on, except To account while no transfers are
 * listed. The choice itself is kept, so it comes back once transfers do (after a search or a month change).
 */
export function shownArrangement(chosen: Arrangement, filtered: boolean, hasTransfers: boolean): Arrangement {
  if (!filtered || (chosen === 'toAccount' && !hasTransfers)) return 'day';
  return chosen;
}

/** The transactions of one account in the list arranged by account. */
export interface AccountSection {
  /** null: the "Not transfers" section of the To account view. */
  accountId: string | null;
  /** Newest first. */
  rows: Transaction[];
  /** In the main currency, from `valueOf`; null for "Not transfers". */
  total: number | null;
}

/**
 * The list's sections by account (the account each row is on) or by the account each transfer went to, where
 * everything else goes in a last section with no account and no total. Largest total (either way) first; equal
 * totals keep the order their accounts first appear in.
 */
export function accountSections(
  txs: Transaction[],
  by: 'account' | 'toAccount',
  valueOf: (t: Transaction) => number,
): AccountSection[] {
  const keyOf = (t: Transaction) =>
    by === 'account' ? t.accountId : t.type === 'transfer' && t.toAccountId != null ? t.toAccountId : null;
  const byKey = new Map<string | null, Transaction[]>();
  for (const t of txs) {
    const k = keyOf(t);
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const sections = [...byKey].map(([accountId, rows]): AccountSection => ({
    accountId,
    rows: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    total: accountId == null ? null : rows.reduce((s, t) => s + valueOf(t), 0),
  }));
  // The rest goes last; Array.sort is stable, so equal totals keep their first-seen order.
  return sections.sort((a, b) => {
    if (a.total == null || b.total == null) return (a.total == null ? 1 : 0) - (b.total == null ? 1 : 0);
    return Math.abs(b.total) - Math.abs(a.total);
  });
}
