import { flowOfTx } from '@/core/utils/flow';
import { roundTo } from '@/core/utils/currency';
import { txInBase, type BaseConverter } from '@/core/utils/txRate';
import type { Flow, Transaction } from '@/shared/models';

/** A row of the transactions list: a transaction, or the transactions of a group shown as one. */
export type ListEntry =
  | { kind: 'tx'; tx: Transaction }
  | {
      kind: 'group';
      groupId: string;
      /** Its rows in view, oldest first. */
      rows: Transaction[];
      /** When its first row in view happened: the entry shows on that day. */
      date: string;
      /** Spending (less money back), or money received when no row is spending. */
      flow: Flow;
      categoryId?: string;
      /** In the main currency: what was spent less what came back (below zero when more came back), or what was received. */
      net: number;
      /** Set when every row is in this one currency, with the net in it. */
      currency?: string;
      netInCurrency?: number;
    };

function groupEntry(groupId: string, rows: Transaction[], conv: BaseConverter): ListEntry {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  // Money back is spending that came back, so a group with any of it (or any purchase) is spending.
  const spending = sorted.some((t) => flowOfTx(t) === 'expense');
  // In a spending group, everything that isn't a purchase came back.
  const sign = (t: Transaction) => (!spending || t.type === 'expense' ? 1 : -1);
  const currencies = new Set(sorted.map((t) => t.currency));
  const currency = currencies.size === 1 ? sorted[0].currency : undefined;
  const purchases = sorted.filter((t) => t.type === 'expense');
  const largest = [...(spending && purchases.length ? purchases : sorted)]
    .sort((a, b) => txInBase(b, conv) - txInBase(a, conv))[0];
  return {
    kind: 'group',
    groupId,
    rows: sorted,
    date: sorted[0].date,
    flow: spending ? 'expense' : 'income',
    categoryId: largest?.categoryId,
    net: sorted.reduce((s, t) => s + sign(t) * txInBase(t, conv), 0),
    currency,
    netInCurrency: currency ? roundTo(sorted.reduce((s, t) => s + sign(t) * t.amount, 0), currency) : undefined,
  };
}

/** The flows a group's category has to take: spending when any row is spending or money back, else income. */
export function groupFlows(rows: Transaction[]): Flow[] {
  return [...new Set(rows.map(flowOfTx).filter((f) => f != null))];
}

/**
 * The list's entries: transactions in the order given, with the rows of each group in view folded into one entry
 * where its earliest row was. A group with a single row in view is just that transaction.
 */
export function foldGroups(txs: Transaction[], conv: BaseConverter): ListEntry[] {
  const byGroup = new Map<string, Transaction[]>();
  for (const t of txs) if (t.groupId) byGroup.set(t.groupId, [...(byGroup.get(t.groupId) ?? []), t]);

  // Where each folded group goes: the place of its earliest row.
  const anchor = new Map<string, Transaction>();
  for (const [id, rows] of byGroup) {
    if (rows.length > 1) anchor.set(id, rows.reduce((a, b) => (b.date < a.date ? b : a)));
  }

  const entries: ListEntry[] = [];
  for (const t of txs) {
    if (!t.groupId || !anchor.has(t.groupId)) entries.push({ kind: 'tx', tx: t });
    else if (anchor.get(t.groupId) === t) entries.push(groupEntry(t.groupId, byGroup.get(t.groupId)!, conv));
  }
  return entries;
}
