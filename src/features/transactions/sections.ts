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
  /** In the main currency, from `valueOf`; null for "Not transfers", and for only transfers adding up to 0. */
  total: number | null;
}

/**
 * The list's sections by account (the account each row is on) or by the account each transfer went to, where
 * everything else goes in a last section with no account and no total. A section of only transfers adding up
 * to 0 has no total either. Largest total (either way) first; equal totals keep the order their accounts first
 * appear in.
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
    const rows = byKey.get(k);
    if (rows) rows.push(t);
    else byKey.set(k, [t]);
  }
  const sections = [...byKey].map(([accountId, rows]): AccountSection => {
    const total = rows.reduce((s, t) => s + valueOf(t), 0);
    // A bare 0 over transfers that moved nothing through a tile reads as "nothing happened", so it isn't shown.
    const shown = accountId != null && !(total === 0 && rows.every((t) => t.type === 'transfer'));
    return { accountId, rows: rows.sort((a, b) => b.date.localeCompare(a.date)), total: shown ? total : null };
  });
  // The rest goes last; Array.sort is stable, so equal totals keep their first-seen order.
  const rank = (s: AccountSection) => (s.accountId == null ? -1 : Math.abs(s.total ?? 0));
  return sections.sort((a, b) => rank(b) - rank(a));
}
