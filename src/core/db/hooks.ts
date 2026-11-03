import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import { alive, db } from './db';
import { openingOf, roundTo } from '@/core/utils/currency';
import type { Account, Amounts, Category, DateRange, Flow, Transaction } from '@/shared/models';

export function useAccounts(includeArchived = false): Account[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.accounts.orderBy('order').filter(alive).toArray();
    return includeArchived ? all : all.filter((a) => !a.archived);
  }, [includeArchived]);
}

/** Whether a category accepts expenses or income ("both" categories accept either). */
export function categoryFits(c: Category, flow: Flow): boolean {
  return c.kind === flow || c.kind === 'both';
}

/** Categories usable for `flow` (including "both" ones), or all categories when no flow is given. */
export function useCategories(flow?: Flow, includeArchived = false): Category[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.categories.orderBy('order').filter(alive).toArray();
    return all.filter((c) => (!flow || categoryFits(c, flow)) && (includeArchived || !c.archived));
  }, [flow, includeArchived]);
}

export function useTransactionsInRange(range: DateRange): Transaction[] | undefined {
  const s = range.start.toISOString();
  const e = range.end.toISOString();
  return useLiveQuery(
    async () => {
      const rows = await db.transactions.where('date').between(s, e, true, false).filter(alive).toArray();
      // newest first; ties broken by creation time
      return rows.sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
    },
    [s, e],
  );
}

/**
 * Current balance of every account, per currency
 * (opening balances + all movements, regardless of the selected period).
 */
export function useBalances(): Map<string, Amounts> | undefined {
  return useLiveQuery(async () => {
    const [accounts, txs] = await Promise.all([db.accounts.filter(alive).toArray(), db.transactions.filter(alive).toArray()]);
    const map = new Map<string, Amounts>();
    accounts.forEach((a) => map.set(a.id!, openingOf(a)));
    const add = (id: string | undefined, cur: string, v: number) => {
      const m = id == null ? undefined : map.get(id);
      if (!m) return;
      m[cur] = roundTo((m[cur] ?? 0) + v, cur);
    };
    for (const t of txs) {
      if (t.type === 'expense') add(t.accountId, t.currency, -t.amount);
      else if (t.type === 'income') add(t.accountId, t.currency, t.amount);
      else {
        add(t.accountId, t.currency, -t.amount);
        add(t.toAccountId, t.toCurrency ?? t.currency, t.toAmount ?? t.amount);
      }
    }
    return map;
  });
}

/**
 * Currencies that hold an opening balance or appear in any transaction. Totals need an exchange
 * rate for each of these; without one their amounts are left out.
 */
export function useCurrenciesInUse(): string[] | undefined {
  return useLiveQuery(async () => {
    const [accounts, txs] = await Promise.all([db.accounts.filter(alive).toArray(), db.transactions.filter(alive).toArray()]);
    const used = new Set<string>();
    for (const a of accounts) for (const [c, n] of Object.entries(openingOf(a))) if (n) used.add(c);
    for (const t of txs) {
      used.add(t.currency);
      if (t.toCurrency) used.add(t.toCurrency);
    }
    return [...used];
  });
}

/** Display-name helpers that translate the built-in accounts/categories. */
export function useNames() {
  const { t } = useTranslation();
  const accountName = useCallback(
    (a?: Account) => (!a ? t('common.deleted') : a.name || t(`accountType.${a.type}`)),
    [t],
  );
  const categoryName = useCallback(
    (c?: Category) => (!c ? t('common.uncategorized') : c.name || (c.key ? t(`cat.${c.key}`) : '')),
    [t],
  );
  return { accountName, categoryName };
}

export function useLookups() {
  const accounts = useAccounts(true);
  const categories = useCategories(undefined, true);
  return useMemo(() => ({
    accounts: new Map((accounts ?? []).map((a) => [a.id!, a])),
    categories: new Map((categories ?? []).map((c) => [c.id!, c])),
    ready: !!accounts && !!categories,
  }), [accounts, categories]);
}

export interface PeriodTotals {
  expense: number;
  income: number;
  /** Per-category totals, kept apart so a "both" category's spending and income don't mix. */
  byCategory: Record<Flow, Map<string, number>>;
  /** Per-category totals in their original currencies, e.g. { EGP: 120, USD: 10 }. */
  byCategoryCur: Record<Flow, Map<string, Amounts>>;
}

/** Income/expense totals in the main currency; `toBase` converts each transaction's amount. */
export function totalsOf(txs: Transaction[] | undefined, toBase: (n: number, cur: string) => number): PeriodTotals {
  const byCategory: Record<Flow, Map<string, number>> = { expense: new Map(), income: new Map() };
  const byCategoryCur: Record<Flow, Map<string, Amounts>> = { expense: new Map(), income: new Map() };
  let expense = 0;
  let income = 0;
  for (const t of txs ?? []) {
    if (t.type === 'transfer') continue;
    const v = toBase(t.amount, t.currency);
    if (t.type === 'expense') expense += v;
    else income += v;
    if (t.categoryId == null) continue;
    const m = byCategory[t.type];
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + v);
    const raw = byCategoryCur[t.type].get(t.categoryId) ?? {};
    raw[t.currency] = roundTo((raw[t.currency] ?? 0) + t.amount, t.currency);
    byCategoryCur[t.type].set(t.categoryId, raw);
  }
  return { expense, income, byCategory, byCategoryCur };
}
